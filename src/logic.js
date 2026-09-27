// VAULT-TEC GYM · логика: даты и расписание, цикл, сборка тренировки, перенос значений
// Источник правил: docs/SPEC.md, разделы 4, 5, 6 и 13. Функции чистые, без обращения к хранилищу.

import { EXERCISES, PROGRAM, CYCLE, MUSCLES } from './data.js';

// ---- Даты ----

export const WEEKDAY = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAY_MS = 24 * 60 * 60 * 1000;

// Ключ календарного дня по местному времени: 2026-09-23
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function mondayOf(date) {
  const shift = (date.getDay() + 6) % 7;
  return addDays(date, -shift);
}

// Разница в календарных днях, устойчивая к переходу на летнее время
function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function formatDate(date) {
  return `${date.getDate()} ${MONTH_GEN[date.getMonth()]}`;
}

export function formatDayDate(date) {
  return `${WEEKDAY[date.getDay()]}, ${formatDate(date)}`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// Название месяца для группировки: Сентябрь
export function monthName(date) {
  const m = MONTH_NOM[date.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// Табло таймера с ведущими нулями: 01:42, 00:42:15
export function formatClock(ms, withHours = false) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  const mm = pad(Math.floor((total % 3600) / 60));
  const ss = pad(total % 60);
  return withHours || h ? `${pad(h)}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Короткая дата для таблиц и осей: 18.09
export function formatShort(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

// Склонение: plural(5, 'упражнение', 'упражнения', 'упражнений')
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Сколько дней назад: сегодня, вчера, 3 дня назад
export function daysAgo(date, today) {
  const n = daysBetween(date, today);
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'вчера';
  return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
}

// Диапазон повторов через многоточие, как в SPEC: 6…8
export function repsRange(reps) {
  return `${reps[0]}…${reps[1]}`;
}

export function formatWeight(w) {
  return String(Math.round(w * 100) / 100).replace('.', ',');
}

export function parseNumber(text) {
  const n = Number(String(text).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

// ---- Справочник ----

export function exerciseById(id, custom = []) {
  return EXERCISES.find((e) => e.id === id) ?? custom.find((e) => e.id === id) ?? null;
}

export function dayById(id) {
  return PROGRAM.find((d) => d.id === id) ?? null;
}

// Подзаголовок дня выводится, только когда задан: у среды его нет
export function dayTitle(day) {
  return day.kind ? `${day.name} · ${day.kind.toLowerCase()}` : day.name;
}

// Основные группы дня по порядку упражнений, без повторов
export function dayMuscles(day, custom = []) {
  const seen = new Set();
  for (const item of day.items) {
    const ex = exerciseById(item.ex, custom);
    for (const m of ex?.primary ?? []) seen.add(m);
  }
  return [...seen].map((m) => MUSCLES[m]);
}

export function exerciseCount(day, custom = []) {
  return day.items.filter((item) => exerciseById(item.ex, custom)?.type !== 'warmup').length;
}

// ---- Цикл ----

// Неделя цикла от понедельника недели, в которую был старт. После восьмой начинается заново.
export function cycleWeek(cycle, today) {
  if (!cycle?.startedAt) return { week: 1, deload: false };
  const weeks = Math.floor(daysBetween(mondayOf(fromDayKey(cycle.startedAt)), mondayOf(today)) / 7);
  const week = (((weeks % CYCLE.weeks) + CYCLE.weeks) % CYCLE.weeks) + 1;
  return { week, deload: week === CYCLE.deloadWeek };
}

// ---- Выбор тренировки ----

// history: завершённые тренировки { dayId, date }.
// Возвращает ближайшую тренировку по расписанию и пропущенную, если прошлый день по расписанию
// не сделан. Дни не сдвигаются: пропущенная просто предлагается, расписание остаётся прежним.
//
// День по расписанию считается сделанным, если тренировка этого дня была с понедельника его недели
// по сегодня. Так ручной запуск раньше срока (среда во вторник) засчитывается за эту неделю,
// а запуск позже срока (среда в четверг) закрывает пропуск.
export function nextWorkout(today, history, cycle) {
  const todayKey = dayKey(today);
  const onWeekday = (date) => PROGRAM.find((d) => d.weekday === date.getDay());
  const doneFor = (dayId, date) => {
    const from = dayKey(mondayOf(date));
    return history.some((h) => h.dayId === dayId && h.date >= from && h.date <= todayKey);
  };

  let target = null;
  for (let i = 0; i <= 7 && !target; i++) {
    const date = addDays(today, i);
    const day = onWeekday(date);
    if (day && !doneFor(day.id, date)) target = { day, date, isToday: i === 0 };
  }
  // Всё на неделю вперёд сделано заранее: ближайший день по расписанию после сегодня
  if (!target) {
    for (let i = 1; i <= 7 && !target; i++) {
      const date = addDays(today, i);
      const day = onWeekday(date);
      if (day) target = { day, date, isToday: false };
    }
  }

  let missed = null;
  if (cycle?.startedAt) {
    for (let i = 1; i <= 7; i++) {
      const date = addDays(today, -i);
      const day = onWeekday(date);
      if (!day) continue;
      if (dayKey(date) >= cycle.startedAt && day.id !== target.day.id && !doneFor(day.id, date)) {
        missed = { day, date };
      }
      break;
    }
  }
  return { ...target, missed };
}

// Где используется упражнение: в истории, в программе, в идущей тренировке.
// Своё упражнение удаляется, только если нигде не используется.
export function exerciseUsage(exId, records, active) {
  return {
    inHistory: records.some((r) => r.items.some((i) => i.exId === exId || i.origExId === exId)),
    inProgram: PROGRAM.some((d) => d.items.some((i) => i.ex === exId)),
    inActive: !!active?.items.some((i) => i.exId === exId || i.origExId === exId)
  };
}

// ---- Сборка тренировки ----

function workSetCount(base, deload) {
  return deload ? Math.max(1, Math.round(base * CYCLE.deloadFactor)) : base;
}

// Подходы упражнения по заданию на следующий раз. plan может отсутствовать.
// baseW: вес, подтверждённый в прошлый раз, с ним сравнивается сделанный вес для плашки переноса.
export function buildSets(item, plan, deload) {
  const sets = [];
  const warmCount = plan?.warm?.length ?? item.warm ?? 0;
  for (let i = 0; i < warmCount; i++) {
    const p = plan?.warm?.[i];
    sets.push({ type: 'warm', w: p?.w ?? 0, r: p?.r ?? item.reps[1], baseW: p ? p.w : null, state: 'pending', at: null });
  }
  const workCount = workSetCount(plan?.sets ?? item.work, deload);
  for (let i = 0; i < workCount; i++) {
    const r = plan?.reps?.[i] ?? plan?.reps?.at(-1) ?? item.reps[0];
    sets.push({ type: 'work', w: plan?.work ?? 0, r, baseW: plan ? plan.work : null, state: 'pending', at: null });
  }
  return sets;
}

export function buildWorkout({ day, date, now, plans, custom = [], week, deload, rest = {} }) {
  const items = day.items.map((item) => {
    const ex = exerciseById(item.ex, custom);
    if (ex.type === 'warmup') {
      return { kind: 'warmup', exId: ex.id, minutes: ex.minutes, state: 'pending', timerEndsAt: null };
    }
    return {
      kind: 'exercise',
      exId: ex.id,
      origExId: ex.id,
      warm: item.warm ?? 0,
      work: item.work,
      reps: item.reps,
      rest: rest[ex.id] ?? ex.rest,
      sets: buildSets(item, plans[ex.id], deload),
      finished: false
    };
  });
  return {
    id: `w-${now.getTime()}`,
    dayId: day.id,
    date: dayKey(date),
    startedAt: now.toISOString(),
    week,
    deload,
    items,
    open: 0,
    restEndsAt: null,
    transfers: {},   // exId -> { work: ответ, warm: { индекс: ответ } }, ответ { to, yes }
    prompt: null,    // плашка переноса, ждущая ответа
    replacements: [] // { from, to }
  };
}

export function itemDone(item) {
  return item.kind === 'warmup' ? item.state === 'done' : item.finished;
}

export function progress(workout) {
  const done = workout.items.filter(itemDone).length;
  return { done, total: workout.items.length };
}

function warmIndexOf(item, setIndex) {
  return item.sets.slice(0, setIndex).filter((s) => s.type === 'warm').length;
}

// Ответ на плашку по подходу: { to: вес, о котором спрашивали, yes: перенести ли }
function answerFor(workout, exId, type, warmIndex) {
  const t = workout.transfers[exId];
  return type === 'work' ? t?.work : t?.warm?.[warmIndex];
}

// Нужна ли плашка переноса для только что отмеченного подхода. Плашку вызывает
// только отмеченный подход с весом, отличным от подтверждённого; на тот же вес второй раз не спрашивает.
export function transferPrompt(workout, index, setIndex) {
  const item = workout.items[index];
  const set = item.sets[setIndex];
  if (set.baseW === null || set.w === set.baseW) return null;
  const warmIndex = warmIndexOf(item, setIndex);
  if (answerFor(workout, item.exId, set.type, warmIndex)?.to === set.w) return null;
  return { index, exId: item.exId, type: set.type, warmIndex, from: set.baseW, to: set.w };
}

// Ответ на плашку: yes перенести новый вес, no только сегодня. Действует последний ответ.
export function answerTransfer(workout, prompt, yes) {
  const t = (workout.transfers[prompt.exId] ??= {});
  const answer = { to: prompt.to, yes };
  if (prompt.type === 'work') t.work = answer;
  else (t.warm ??= {})[prompt.warmIndex] = answer;
  workout.prompt = null;
}

// ---- Завершение ----

// Запись в историю и новые задания на следующий раз.
// Правила переноса (SPEC, раздел 6): вес рабочих подходов переносится только подтверждённый,
// повторы и число подходов переносятся без вопроса, невыполненные подходы в историю не идут.
// Первый раз, когда задания ещё нет, сделанные веса переносятся как есть: сравнивать не с чем.
export function finishWorkout(workout, plans, now) {
  const updated = {};
  const items = [];
  const applied = [];   // переносы весов, принятые ответом "Да": их можно отменить на экране завершения

  for (const item of workout.items) {
    if (item.kind === 'warmup') {
      items.push({ kind: 'warmup', exId: item.exId, done: item.state === 'done' });
      continue;
    }
    const doneSets = item.sets.filter((s) => s.state === 'done');
    items.push({
      kind: 'exercise',
      exId: item.exId,
      origExId: item.origExId,
      sets: doneSets.map(({ type, w, r, at }) => ({ type, w, r, at }))
    });
    if (!doneSets.length) continue;

    const prev = plans[item.exId];
    const t = workout.transfers[item.exId] ?? {};
    const warmSets = item.sets.filter((s) => s.type === 'warm');
    const workSets = item.sets.filter((s) => s.type === 'work');
    const lastDoneWork = workSets.filter((s) => s.state === 'done').at(-1);

    const warm = warmSets.map((s, i) => {
      if (s.baseW === null) return { w: s.w, r: s.r };
      const answer = t.warm?.[i];
      if (answer?.yes && answer.to !== s.baseW) {
        applied.push({ exId: item.exId, type: 'warm', warmIndex: i, from: s.baseW, to: answer.to });
      }
      return { w: answer?.yes ? answer.to : s.baseW, r: s.r };
    });

    let work = lastDoneWork?.w ?? workSets[0]?.w ?? 0;
    if (prev) {
      work = t.work?.yes ? t.work.to : prev.work;
      if (t.work?.yes && t.work.to !== prev.work) {
        applied.push({ exId: item.exId, type: 'work', warmIndex: null, from: prev.work, to: t.work.to });
      }
    }

    const doneWork = workSets.filter((s) => s.state === 'done');
    updated[item.exId] = {
      exId: item.exId,
      warm,
      work,
      reps: workSets.map((s) => s.r),
      // В разгрузочную неделю число подходов урезано временно, задание его не наследует
      sets: workout.deload ? (prev?.sets ?? item.work) : workSets.length,
      rangeDone: doneWork.length === workSets.length && workSets.length > 0 && doneWork.every((s) => s.r >= item.reps[1]),
      last: { date: workout.date, work: doneWork.map(({ w, r }) => ({ w, r })) }
    };
  }

  const record = {
    id: workout.id,
    dayId: workout.dayId,
    date: workout.date,
    startedAt: workout.startedAt,
    finishedAt: now.toISOString(),
    week: workout.week,
    deload: workout.deload,
    items,
    replacements: workout.replacements,
    transfers: workout.transfers,
    applied
  };
  return { record, plans: updated };
}

// ---- Замена ----

// Сначала упражнения на ту же основную группу, затем остальные. Разминка и текущее исключены.
export function alternatives(exId, custom = []) {
  const current = exerciseById(exId, custom);
  // Скрытые свои упражнения в список замены не попадают
  const pool = [...EXERCISES, ...custom].filter((e) => e.type !== 'warmup' && e.id !== exId && !e.hidden);
  const same = pool.filter((e) => e.primary.some((m) => current.primary.includes(m)));
  const other = pool.filter((e) => !same.includes(e));
  return { same, other };
}
