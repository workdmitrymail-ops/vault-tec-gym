// VAULT-TEC GYM · расчёты статистики
// Источник правил: docs/SPEC.md, разделы 9, 11 и 12. Функции чистые, без обращения к хранилищу.
// records: завершённые тренировки из хранилища workouts, в каждой только выполненные подходы.
// bw: записи веса тела [{ date, value }].

import { MUSCLES, VOLUME_ZONES, PROGRAM } from './data.js';
import { exerciseById, dayKey, fromDayKey, addDays } from './logic.js';

// Расчётный максимум по формуле Эпли
export const e1rm = (w, r) => w * (1 + r / 30);

const byDate = (a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? '');

export function sortRecords(records) {
  return [...records].sort(byDate);
}

// ---- Вес тела ----

export function sortBw(bw) {
  return [...bw].sort((a, b) => a.date.localeCompare(b.date));
}

// Последняя запись веса на дату или раньше
export function bwOn(bw, key) {
  let found = null;
  for (const e of sortBw(bw)) {
    if (e.date <= key) found = e.value;
    else break;
  }
  return found;
}

// Нагрузка подхода: для упражнений с собственным весом вес тела плюс дополнительный,
// null если вес тела не записан
export function setLoad(ex, set, bodyweight) {
  if (!ex?.bodyweight) return set.w;
  return bodyweight === null ? null : bodyweight + set.w;
}

// Повторы в упражнениях одной рукой вводятся на каждую руку, поэтому в тоннаже подход считается дважды
export function sideFactor(ex) {
  return ex?.unilateral ? 2 : 1;
}

// ---- Итог тренировки ----

export function workSetsOf(item) {
  return (item.sets ?? []).filter((s) => s.type === 'work');
}

// Рабочие подходы тренировки по упражнениям. Одно упражнение может встретиться дважды,
// например после замены на то, что уже есть в дне: подходы объединяются.
export function workByExercise(record) {
  const map = new Map();
  for (const item of record.items) {
    if (item.kind !== 'exercise') continue;
    const work = workSetsOf(item);
    if (!work.length) continue;
    map.set(item.exId, [...(map.get(item.exId) ?? []), ...work]);
  }
  return map;
}

export function durationMs(record) {
  return new Date(record.finishedAt) - new Date(record.startedAt);
}

export function summary(record, custom = [], bw = []) {
  const bodyweight = bwOn(bw, record.date);
  let sets = 0;
  let tonnage = 0;
  const exercises = [];
  for (const item of record.items) {
    if (item.kind !== 'exercise') continue;
    const ex = exerciseById(item.exId, custom);
    const work = workSetsOf(item);
    sets += work.length;
    for (const s of work) {
      const load = setLoad(ex, s, bodyweight) ?? s.w;
      tonnage += load * s.r * sideFactor(ex);
    }
    exercises.push({ exId: item.exId, origExId: item.origExId, ex, work, warm: item.sets.filter((s) => s.type === 'warm') });
  }
  return { duration: durationMs(record), sets, tonnage: Math.round(tonnage), exercises };
}

// Объём по группам: основная группа 1 подход, вспомогательная 0.5
export function groupVolume(records, custom = []) {
  const vol = {};
  for (const record of records) {
    for (const item of record.items) {
      if (item.kind !== 'exercise') continue;
      const ex = exerciseById(item.exId, custom);
      const n = workSetsOf(item).length;
      if (!ex || !n) continue;
      for (const m of ex.primary) vol[m] = (vol[m] ?? 0) + n;
      for (const m of ex.secondary ?? []) vol[m] = (vol[m] ?? 0) + n * 0.5;
    }
  }
  return vol;
}

// Группы, проработанные напрямую, и только вспомогательно: для подсветки карты
export function workedGroups(record, custom = []) {
  const primary = new Set();
  const secondary = new Set();
  for (const item of record.items) {
    if (item.kind !== 'exercise' || !workSetsOf(item).length) continue;
    const ex = exerciseById(item.exId, custom);
    ex.primary.forEach((m) => primary.add(m));
    (ex.secondary ?? []).forEach((m) => secondary.add(m));
  }
  return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
}

export function volumeZone(sets) {
  return VOLUME_ZONES.find((z) => sets <= z.max)?.label ?? '';
}

// ---- История упражнения ----

// Тренировки, где упражнение делалось, по возрастанию даты: { date, recordId, work }
export function exerciseHistory(records, exId) {
  const out = [];
  for (const record of sortRecords(records)) {
    const work = workByExercise(record).get(exId);
    if (work) out.push({ date: record.date, recordId: record.id, work });
  }
  return out;
}

export function performedExercises(records, custom = []) {
  const last = new Map();
  for (const record of sortRecords(records)) {
    for (const item of record.items) {
      if (item.kind === 'exercise' && workSetsOf(item).length) last.set(item.exId, record.date);
    }
  }
  return [...last.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => exerciseById(id, custom))
    .filter(Boolean);
}

// Ряды для графиков упражнения. mode: weight, либо reps для упражнений с собственным весом без записи веса тела.
export function exerciseSeries(records, exId, custom = [], bw = [], sinceKey = null) {
  const ex = exerciseById(exId, custom);
  const hist = exerciseHistory(records, exId).filter((h) => !sinceKey || h.date >= sinceKey);
  const bwKnown = hist.some((h) => bwOn(bw, h.date) !== null);
  const mode = ex.bodyweight && !bwKnown ? 'reps' : 'weight';
  const weight = [];
  const best = [];
  const tonnage = [];
  const rows = [];
  for (const h of hist) {
    const bodyweight = bwOn(bw, h.date);
    const loads = h.work.map((s) => setLoad(ex, s, bodyweight));
    const known = loads.every((l) => l !== null);
    const x = fromDayKey(h.date);
    if (mode === 'reps') {
      weight.push({ x, y: Math.max(...h.work.map((s) => s.r)) });
    } else if (known) {
      weight.push({ x, y: Math.max(...loads) });
      best.push({ x, y: Math.max(...h.work.map((s, i) => e1rm(loads[i], s.r))) });
    }
    tonnage.push({ x, y: Math.round(h.work.reduce((sum, s, i) => sum + (loads[i] ?? s.w) * s.r, 0) * sideFactor(ex)) });
    rows.push({ date: h.date, work: h.work, best: known && mode === 'weight' ? Math.max(...h.work.map((s, i) => e1rm(loads[i], s.r))) : null });
  }
  return { ex, mode, weight, best, tonnage, rows: rows.reverse() };
}

// Рекорды упражнения по всей истории. Для упражнений с собственным весом вес это дополнительный вес.
// Максимальный вес: самый тяжёлый рабочий подход, при равном весе тот, где больше повторов.
export function personalRecords(records, exId, custom = [], bw = []) {
  const ex = exerciseById(exId, custom);
  let maxWeight = null;
  let maxReps = null;
  let bestE1rm = null;
  for (const h of exerciseHistory(records, exId)) {
    const bodyweight = bwOn(bw, h.date);
    for (const s of h.work) {
      if (!maxWeight || s.w > maxWeight.w || (s.w === maxWeight.w && s.r > maxWeight.r)) maxWeight = { w: s.w, r: s.r, date: h.date };
      if (!maxReps || s.r > maxReps.r || (s.r === maxReps.r && s.w > maxReps.w)) maxReps = { w: s.w, r: s.r, date: h.date };
      const load = setLoad(ex, s, bodyweight);
      if (load !== null) {
        const v = e1rm(load, s.r);
        if (!bestE1rm || v > bestE1rm.value) bestE1rm = { value: v, w: s.w, r: s.r, date: h.date };
      }
    }
  }
  return { maxWeight, maxReps, bestE1rm };
}

// Рекорды, поставленные в этой тренировке, относительно всех прошлых.
// Первое выполнение упражнения рекордом не считается: сравнивать не с чем.
export function newRecords(record, previous, custom = [], bw = []) {
  const out = [];
  const bodyweight = bwOn(bw, record.date);
  for (const [exId, work] of workByExercise(record)) {
    const item = { exId };
    const past = exerciseHistory(previous, exId);
    if (!past.length) continue;
    const ex = exerciseById(exId, custom);
    const pastSets = past.flatMap((h) => h.work.map((s) => ({ ...s, date: h.date })));

    const topW = Math.max(...work.map((s) => s.w));
    const pastTopW = Math.max(...pastSets.map((s) => s.w));
    if (topW > pastTopW) {
      out.push({ exId: item.exId, ex, kind: 'weight', text: `Максимальный вес: ${fmt(topW)} кг`, before: `было ${fmt(pastTopW)} кг` });
    }

    for (const w of [...new Set(work.map((s) => s.w))]) {
      const reps = Math.max(...work.filter((s) => s.w === w).map((s) => s.r));
      const pastAtW = pastSets.filter((s) => s.w === w);
      if (!pastAtW.length) continue;
      const pastReps = Math.max(...pastAtW.map((s) => s.r));
      if (reps > pastReps) {
        out.push({ exId: item.exId, ex, kind: 'reps', text: `Повторов на ${fmt(w)} кг: ${reps}`, before: `было ${pastReps}` });
      }
    }

    const loads = work.map((s) => setLoad(ex, s, bodyweight));
    if (loads.every((l) => l !== null)) {
      const best = Math.max(...work.map((s, i) => e1rm(loads[i], s.r)));
      const pastBest = Math.max(...past.flatMap((h) => {
        const b = bwOn(bw, h.date);
        return h.work.map((s) => setLoad(ex, s, b)).map((l, i) => (l === null ? 0 : e1rm(l, h.work[i].r)));
      }));
      if (pastBest > 0 && best > pastBest + 0.05) {
        out.push({ exId: item.exId, ex, kind: 'e1rm', text: `Расчётный максимум: ${fmt(best, 1)} кг`, before: `было ${fmt(pastBest, 1)} кг` });
      }
    }
  }
  return out;
}

// Изменения по упражнениям относительно прошлого выполнения: рабочий вес вырос, остался, снизился
export function changes(record, previous) {
  const out = [];
  for (const [exId, work] of workByExercise(record)) {
    const past = exerciseHistory(previous, exId).at(-1);
    const now = Math.max(...work.map((s) => s.w));
    if (!past) { out.push({ exId, dir: 'first', now }); continue; }
    const before = Math.max(...past.work.map((s) => s.w));
    if (now !== before) {
      out.push({ exId, kind: 'weight', dir: now > before ? 'up' : 'down', before, now, delta: now - before });
      continue;
    }
    // Вес тот же: сравниваются лучшие повторы на этом весе
    const repsNow = Math.max(...work.filter((s) => s.w === now).map((s) => s.r));
    const repsBefore = Math.max(...past.work.filter((s) => s.w === before).map((s) => s.r));
    const delta = repsNow - repsBefore;
    out.push({ exId, kind: 'reps', dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', before, now, delta });
  }
  return out;
}

// Изменение рабочего веса за месяц: последний рабочий вес против веса месяц назад
// (последнее выполнение на дату месяц назад или раньше, а если такого нет, первое за месяц).
export function monthChange(records, exId, today) {
  const hist = exerciseHistory(records, exId);
  if (hist.length < 2) return null;
  const top = (h) => Math.max(...h.work.map((s) => s.w));
  const monthAgo = dayKey(addDays(today, -30));
  const older = hist.filter((h) => h.date <= monthAgo).at(-1);
  const base = older ?? hist.find((h) => h.date > monthAgo);
  const last = hist.at(-1);
  if (!base || base === last) return null;
  return top(last) - top(base);
}

// ---- Общая статистика ----

function mondayKey(date) {
  return dayKey(addDays(date, -((date.getDay() + 6) % 7)));
}

// Тренировки по неделям с начала цикла или с первой тренировки: сделано и по расписанию.
// По расписанию считаются только прошедшие дни, сегодняшний не считается пропуском.
export function weeklyCounts(records, cycle, today) {
  const sorted = sortRecords(records);
  const startKey = cycle?.startedAt ?? sorted[0]?.date;
  if (!startKey) return [];
  const start = fromDayKey(startKey);
  const todayKey = dayKey(today);
  const weeks = [];
  for (let monday = fromDayKey(mondayKey(start)); dayKey(monday) <= todayKey; monday = addDays(monday, 7)) {
    const mKey = dayKey(monday);
    const sunKey = dayKey(addDays(monday, 6));
    let due = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const k = dayKey(d);
      if (k >= startKey && k < todayKey && PROGRAM.some((p) => p.weekday === d.getDay())) due++;
    }
    const done = sorted.filter((r) => r.date >= mKey && r.date <= sunKey).length;
    weeks.push({ week: mKey, done, due, missed: Math.max(0, due - done) });
  }
  return weeks;
}

export function averageDuration(records) {
  if (!records.length) return null;
  return records.reduce((sum, r) => sum + durationMs(r), 0) / records.length;
}

// ---- Вес тела ----

export function bwStats(bw, today) {
  const list = sortBw(bw);
  if (!list.length) return null;
  const latest = list.at(-1);
  const todayKey = dayKey(today);
  const weekAgo = dayKey(addDays(today, -6));
  const lastWeek = list.filter((e) => e.date >= weekAgo && e.date <= todayKey);
  const avg7 = lastWeek.length ? lastWeek.reduce((s, e) => s + e.value, 0) / lastWeek.length : null;
  const changeSince = (days) => {
    const key = dayKey(addDays(fromDayKey(latest.date), -days));
    const base = list.filter((e) => e.date <= key).at(-1);
    return base ? latest.value - base.value : null;
  };
  return {
    latest,
    avg7,
    avg7Count: lastWeek.length,
    week: changeSince(7),
    month: changeSince(30),
    all: list.length > 1 ? latest.value - list[0].value : null
  };
}

// Относительная сила: рабочий вес в ключевых упражнениях, делённый на вес тела
export const KEY_EXERCISES = ['deadlift', 'hack_squat', 'db_incline', 'cable_row'];

export function relativeStrength(plans, bodyweight, custom = []) {
  if (!bodyweight) return [];
  return KEY_EXERCISES
    .filter((id) => plans[id]?.work > 0)
    .map((id) => ({ ex: exerciseById(id, custom), work: plans[id].work, ratio: plans[id].work / bodyweight }));
}

// ---- Форматирование ----

export function fmt(n, digits = 2) {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', ',');
}

export function signed(n, unit = 'кг') {
  if (n === null || n === undefined) return null;
  if (Math.abs(n) < 0.005) return `0 ${unit}`;
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n), 1)} ${unit}`;
}

export function muscleName(m) {
  return MUSCLES[m];
}
