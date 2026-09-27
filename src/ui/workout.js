// VAULT-TEC GYM · экран тренировки, артборды 02, 02A, 05, 06, 07, 08, 24
// Два состояния одного экрана: список плашек и развёрнутая карточка активного упражнения под своей плашкой.
// Каждое действие сохраняет тренировку в IndexedDB, поэтому перезагрузка возвращает то же состояние,
// включая введённые значения незавершённого подхода, идущий отдых и паузу разминки.
// SPEC, разделы 5, 6, 7 и 8.

import * as store from '../store.js';
import * as L from '../logic.js';
import { MUSCLES } from '../data.js';
import { loadPlans, loadActive, saveActive, saveActiveSoon, flushActive, completeWorkout } from '../session.js';
import * as S from '../stats.js';
import { h, plural } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { muscleMap } from './map.js';
import { compactSets } from './summary.js';

const DEFAULT_WEIGHT_STEP = 2.5;
const REST_STEP = 15;        // секунды, шаг времени отдыха по умолчанию в карточке
const REST_MIN = 15;
const REST_ADJUST = 30;      // секунды, правка идущего отдыха, как на макетах 02 и 06

export async function renderWorkout({ header, main }) {
  const w = await loadActive();
  if (!w) {
    location.replace('#/');
    return;
  }
  const [plans, custom, settingsRaw, restRaw, records, bw] = await Promise.all([
    loadPlans(), store.getAll('exercises'), store.get('settings'), store.get('rest'),
    store.getAll('workouts'), store.getAll('bodyweight')
  ]);
  const settings = settingsRaw ?? {};
  const restMap = restRaw ?? {};
  const weightStep = settings.weightStep ?? DEFAULT_WEIGHT_STEP;
  const ex = (id) => L.exerciseById(id, custom);
  let promptSheet = null;
  let alive = true;

  async function commit(mutate, focusKey) {
    mutate();
    await saveActive(w);
    draw(focusKey);
  }

  // ---- Шапка и прогресс ----

  function renderHeader() {
    const day = L.dayById(w.dayId);
    header.className = 'app-header wk-header';
    // При открытой карточке стрелка сворачивает её, в списке крестик уводит на главный экран
    const left = w.open >= 0
      ? h('button', { class: 'icon-btn circle-btn', type: 'button', 'data-key': 'collapse', 'aria-label': 'Свернуть карточку упражнения',
        onclick: () => commit(() => { w.open = -1; }, 'collapse') }, icon('back'))
      : h('a', { class: 'icon-btn circle-btn', href: '#/', 'aria-label': 'На главный экран, тренировка сохранится' }, icon('close'));
    header.replaceChildren(
      left,
      h('h1', { class: 'app-header__title', tabindex: '-1', text: L.dayTitle(day) }),
      h('p', { class: 'data-line wk-header__time', 'aria-label': 'Время тренировки' }, h('span', { class: 'wk-elapsed', text: elapsedText() })));
  }

  function elapsedText() {
    return L.formatClock(Date.now() - new Date(w.startedAt), true);
  }

  function progressBlock() {
    const { done, total } = L.progress(w);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h('div', { class: 'wk-progress' },
      w.deload ? h('div', { class: 'wk-deload' },
        h('span', { class: 'chip chip-on chip-data', text: `Неделя ${w.week} · разгрузка` }),
        h('p', { class: 'label', text: 'Подходы сокращены на треть' })) : null,
      h('div', { class: 'wk-progress__row' },
        h('span', { class: 'data-line', text: `${done} из ${total}` }),
        h('span', { class: 'data-line', text: `${pct}%` })),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Выполнено упражнений', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
        h('span', { class: 'progress__fill', style: { '--v': String(total ? done / total : 0) } })));
  }

  // ---- Плашки ----

  function itemName(item) {
    return item.kind === 'warmup' ? 'Разминка' : ex(item.exId).name;
  }

  function itemState(item) {
    if (L.itemDone(item)) return 'done';
    if (item.kind === 'warmup') return item.timerEndsAt || item.pausedLeft ? 'current' : 'pending';
    return item.sets.some((s) => s.state === 'done') ? 'current' : 'pending';
  }

  function plateMeta(item, state) {
    if (item.kind === 'warmup') return `${item.minutes} мин`;
    const exercise = ex(item.exId);
    const doneWork = item.sets.filter((s) => s.type === 'work' && s.state === 'done');
    if (state === 'done') return doneWork.length ? compactSets(doneWork, exercise, true) : 'пропущено';
    if (state === 'current') {
      const n = item.sets.filter((s) => s.state === 'done').length;
      return `${n} из ${item.sets.length} ${plural(item.sets.length, 'подхода', 'подходов', 'подходов')}`;
    }
    const work = item.sets.filter((s) => s.type === 'work').length;
    return `${work} × ${L.repsRange(item.reps)}`;
  }

  function renderItem(item, index) {
    const open = w.open === index;
    const state = itemState(item);
    const bodyId = `wk-body-${index}`;
    const plate = h('button', {
      class: `plate plate--${state}`, type: 'button', 'aria-expanded': String(open), 'aria-controls': open ? bodyId : null,
      'data-key': `head-${index}`,
      onclick: () => commit(() => { w.open = open ? -1 : index; }, open ? `head-${index}` : 'collapse')
    },
      h('span', { class: 'data-line plate__num', text: String(index + 1).padStart(2, '0') }),
      h('span', { class: 'plate__name', text: itemName(item) }),
      h('span', { class: 'plate__meta' },
        state === 'done' ? icon('check') : null,
        h('span', { class: 'data-line', text: plateMeta(item, state) })));

    // Кнопки упражнения стоят под карточкой во всю ширину, как на макете 02
    return h('li', { class: 'wk-item' },
      plate,
      open ? h('div', { class: 'wk-card active-card', id: bodyId },
        h('span', { class: 'brackets', 'aria-hidden': 'true' }),
        item.kind === 'warmup' ? warmupBody(item, index) : exerciseBody(item, index)) : null,
      open && item.kind === 'exercise' ? exerciseActions(item, index) : null);
  }

  // ---- Разминка, артборд 05 ----

  function warmupRemaining(item) {
    if (item.timerEndsAt) return Math.max(0, new Date(item.timerEndsAt) - Date.now());
    if (item.pausedLeft) return item.pausedLeft;
    return item.minutes * 60 * 1000;
  }

  function nextItemName(from) {
    const next = w.items.slice(from + 1).find((i) => !L.itemDone(i));
    return next ? itemName(next) : null;
  }

  function warmupBody(item, index) {
    const done = item.state === 'done';
    const running = !!item.timerEndsAt;
    const next = nextItemName(index);
    const toggle = () => commit(() => {
      if (running) {
        item.pausedLeft = warmupRemaining(item);
        item.timerEndsAt = null;
      } else {
        item.timerEndsAt = new Date(Date.now() + warmupRemaining(item)).toISOString();
        item.pausedLeft = null;
      }
    }, `warm-toggle-${index}`);
    return [
      h('div', { class: 'warmup' },
        h('p', { class: 'wk-timer', 'data-warmup': String(index), role: 'timer', 'aria-label': 'Осталось разминки', text: L.formatClock(warmupRemaining(item)) }),
        h('p', { class: 'block__note', text: `Разминка · ${item.minutes} мин` })),
      done
        ? h('div', { class: 'wk-actions' },
          h('p', { class: 'block__note', text: 'Разминка выполнена.' }),
          h('button', { class: 'btn btn-second', type: 'button', 'data-key': `warm-undo-${index}`, text: 'Вернуть в работу',
            onclick: () => commit(() => { item.state = 'pending'; }, `head-${index}`) }))
        : h('div', { class: 'wk-actions wk-actions--row' },
          h('button', { class: 'btn btn-second', type: 'button', 'data-key': `warm-toggle-${index}`,
            text: running ? 'Пауза' : item.pausedLeft ? 'Продолжить' : 'Старт', onclick: toggle }),
          h('button', { class: 'btn btn-primary', type: 'button', 'data-key': `warm-done-${index}`, text: 'Готово',
            onclick: () => commit(() => { item.state = 'done'; item.timerEndsAt = null; item.pausedLeft = null; openNext(index); }) })),
      next ? h('p', { class: 'next-row' }, h('span', { class: 'label', text: 'Дальше' }), h('span', { class: 'next-row__value', text: next })) : null
    ];
  }

  // ---- Упражнение, артборд 02 ----

  function infoRows(exercise, item) {
    const plan = plans[item.exId];
    const pr = S.personalRecords(records, item.exId, custom, bw).maxWeight;
    const month = S.monthChange(records, item.exId, new Date());
    const weight = (v) => (exercise.bodyweight ? (v ? `+${S.fmt(v)} кг` : 'свой вес') : `${S.fmt(v)} кг`);
    const rows = [
      plan?.last?.work?.length ? ['Прошлый раз', compactSets(plan.last.work, exercise, true)] : null,
      pr ? ['Рекорд', `${weight(pr.w)} × ${pr.r}`] : null,
      month !== null ? ['За месяц', month === 0 ? 'без изменений' : S.signed(month)] : null
    ].filter(Boolean);
    if (!rows.length) return h('p', { class: 'block__note', text: 'Первое выполнение: прошлых результатов ещё нет.' });
    return h('dl', { class: 'stack-pairs' }, rows.map(([k, v]) =>
      h('div', {}, h('dt', { class: 'label', text: k }), h('dd', { class: 'data-line', text: v }))));
  }

  function exerciseBody(item, index) {
    const exercise = ex(item.exId);
    const plan = plans[item.exId];
    const current = item.sets.findIndex((s) => s.state === 'pending');

    const group = (type, title) => {
      const sets = item.sets.map((s, si) => ({ s, si })).filter(({ s }) => s.type === type);
      if (!sets.length) return null;
      return h('section', { class: 'sets-group', 'aria-label': title },
        h('h3', { class: 'label', text: title }),
        h('ol', { class: 'sets' }, sets.map(({ s, si }, n) => setRow(item, index, s, si, n + 1, type === 'warm' ? 'Разминка' : 'Подход', exercise, si === current))));
    };

    return [
      h('div', { class: 'wk-info' },
        h('div', { class: 'slot slot--map' }, muscleMap(exercise)),
        h('div', { class: 'wk-info__text' }, infoRows(exercise, item))),
      plan?.rangeDone ? h('p', { class: 'mark', text: 'Диапазон выполнен' }) : null,
      exercise.unilateral ? h('p', { class: 'block__note', text: 'Вес и повторы на каждую руку' }) : null,
      item.exId !== item.origExId ? h('p', { class: 'block__note', text: `Замена на сегодня вместо: ${ex(item.origExId).name}` }) : null,
      group('warm', 'Разминка'),
      group('work', 'Рабочие'),
      restControl(item, index)
    ];
  }

  function exerciseActions(item, index) {
    const anyDone = item.sets.some((s) => s.state === 'done');
    const hasPending = item.sets.some((s) => s.state === 'pending');
    return h('div', { class: 'wk-actions wk-actions--grid' },
        h('button', { class: 'btn btn-second', type: 'button', 'data-key': `add-${index}`, text: 'Добавить подход',
          onclick: () => commit(() => addSet(item), `add-${index}`) }),
        h('button', { class: 'btn btn-second', type: 'button', 'data-key': `replace-${index}`, text: 'Заменить', disabled: anyDone,
          onclick: () => openReplace(item, index) }),
        h('button', { class: 'btn btn-second', type: 'button', 'data-key': `remove-${index}`, text: 'Удалить подход', disabled: !hasPending,
          onclick: () => commit(() => removeSet(item), `remove-${index}`) }),
        h('button', { class: 'btn btn-second', type: 'button', 'data-key': `finish-${index}`, text: 'Завершить упражнение',
          onclick: () => commit(() => finishExercise(item, index)) }));
  }

  function setRow(item, index, set, si, n, kind, exercise, isCurrent) {
    const key = `${index}-${si}`;
    const done = set.state === 'done';
    const label = `${kind} ${n}`;
    const weightLabel = exercise.bodyweight ? 'дополнительный вес, кг' : 'вес, кг';
    return h('li', { class: `set${isCurrent ? ' set--current' : ''}${done ? ' set--done' : ''}${set.state === 'skipped' ? ' set--skipped' : ''}` },
      h('div', { class: 'set__top' },
        h('span', { class: 'data-line set__num', text: String(n) }),
        set.state === 'skipped' ? h('span', { class: 'block__note', text: 'пропущен' }) : null,
        h('button', {
          class: `tick-btn${done ? ' tick-btn--on' : ''}`, type: 'button', 'aria-pressed': String(done),
          'data-key': `done-${key}`, 'aria-label': `${label}: выполнено`,
          onclick: () => toggleDone(item, index, set, si)
        }, done ? icon('check') : null)),
      h('div', { class: 'set__fields' },
        stepper(`w-${key}`, `${label}, ${weightLabel}`, L.formatWeight(set.w), 'decimal',
          (v) => { set.w = Math.max(0, v); },
          (dir) => { set.w = Math.max(0, Math.round((set.w + dir * weightStep) * 100) / 100); }),
        stepper(`r-${key}`, `${label}, повторы`, String(set.r), 'numeric',
          (v) => { set.r = Math.max(0, Math.round(v)); },
          (dir) => { set.r = Math.max(0, set.r + dir); })));
  }

  // Степпер: кнопки сохраняют сразу, ввод с клавиатуры через 400 мс, потеря фокуса сразу.
  // Подписи полей скрыты визуально, как на макете: колонка веса слева, повторов справа.
  function stepper(id, labelText, value, mode, apply, step) {
    const input = h('input', {
      class: 'stepper__input', id, type: 'text', inputmode: mode, autocomplete: 'off', value, 'data-key': id,
      oninput: (e) => {
        const v = L.parseNumber(e.target.value);
        if (v !== null) { apply(v); saveActiveSoon(w); }
      },
      onblur: () => { flushActive(); },
      onchange: () => { flushActive(); draw(id); }
    });
    return h('div', { class: 'field' },
      h('label', { class: 'visually-hidden', for: id, text: labelText }),
      h('div', { class: 'stepper' },
        h('button', { class: 'stepper__btn', type: 'button', 'aria-label': `${labelText}: меньше`, 'data-key': `${id}-minus`,
          onclick: () => commit(() => step(-1), `${id}-minus`) }, icon('minus')),
        input,
        h('button', { class: 'stepper__btn', type: 'button', 'aria-label': `${labelText}: больше`, 'data-key': `${id}-plus`,
          onclick: () => commit(() => step(1), `${id}-plus`) }, icon('plus'))));
  }

  // Время отдыха по умолчанию для упражнения, запоминается (SPEC, раздел 8)
  function restControl(item, index) {
    const id = `rest-${index}`;
    const change = (dir) => commit(() => {
      item.rest = Math.max(REST_MIN, item.rest + dir * REST_STEP);
      restMap[item.exId] = item.rest;
      store.set('rest', restMap);
    }, `${id}-${dir > 0 ? 'plus' : 'minus'}`);
    return h('div', { class: 'field wk-rest' },
      h('p', { class: 'label', id, text: 'Отдых после подхода' }),
      h('div', { class: 'stepper', role: 'group', 'aria-labelledby': id },
        h('button', { class: 'stepper__btn', type: 'button', 'aria-label': 'Отдых: меньше на 15 секунд', 'data-key': `${id}-minus`, onclick: () => change(-1) }, icon('minus')),
        h('output', { class: 'stepper__input', text: L.formatClock(item.rest * 1000) }),
        h('button', { class: 'stepper__btn', type: 'button', 'aria-label': 'Отдых: больше на 15 секунд', 'data-key': `${id}-plus`, onclick: () => change(1) }, icon('plus'))));
  }

  // ---- Действия ----

  function openNext(from) {
    const n = w.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (!L.itemDone(w.items[i])) { w.open = i; return; }
    }
    w.open = -1;
  }

  async function toggleDone(item, index, set, si) {
    ensureAudio();
    const key = `done-${index}-${si}`;
    if (set.state === 'done') {
      await commit(() => {
        set.state = 'pending';
        set.at = null;
        item.finished = false;
      }, key);
      return;
    }
    await commit(() => {
      set.state = 'done';
      set.at = new Date().toISOString();
      // Рабочий подход сделан с другим весом: следующие неотмеченные рабочие подходы
      // с подставленным весом получают тот же. Только на сегодня, задание решает плашка.
      if (set.type === 'work') {
        const prefilled = set.baseW ?? 0;
        if (set.w !== prefilled) {
          item.sets.slice(si + 1)
            .filter((s) => s.type === 'work' && s.state === 'pending' && s.w === prefilled)
            .forEach((s) => { s.w = set.w; });
        }
      }
      w.restEndsAt = new Date(Date.now() + item.rest * 1000).toISOString();
      w.restTotal = item.rest;
      w.prompt = L.transferPrompt(w, index, si);
      if (!item.sets.some((s) => s.state === 'pending')) {
        item.finished = true;
        openNext(index);
      }
    }, key);
    if (w.prompt) showPrompt();
  }

  function addSet(item) {
    const last = [...item.sets].reverse().find((s) => s.type === 'work') ?? item.sets.at(-1);
    item.sets.push({ type: 'work', w: last?.w ?? 0, r: last?.r ?? item.reps[0], baseW: last?.baseW ?? null, state: 'pending', at: null });
    item.finished = false;
  }

  function removeSet(item) {
    for (let i = item.sets.length - 1; i >= 0; i--) {
      if (item.sets[i].state === 'pending') { item.sets.splice(i, 1); break; }
    }
    if (!item.sets.some((s) => s.state === 'pending') && item.sets.length) item.finished = true;
  }

  function finishExercise(item, index) {
    for (const s of item.sets) if (s.state === 'pending') s.state = 'skipped';
    item.finished = true;
    openNext(index);
  }

  // ---- Плашка переноса, артборд 07 ----

  function showPrompt() {
    if (!w.prompt || promptSheet) return;
    const p = w.prompt;
    promptSheet = openSheet({
      title: p.type === 'warm' ? `Вес изменён · разминка ${p.warmIndex + 1}` : 'Вес изменён',
      dismissible: false,
      content: [
        h('p', { class: 'sheet__big data-line', text: `${L.formatWeight(p.from)} → ${L.formatWeight(p.to)} кг` }),
        h('p', { class: 'block__note data-line', text: `Поставить ${L.formatWeight(p.to)} кг на следующую тренировку?` })
      ],
      actions: [
        { label: 'Да', primary: true, onClick: () => answer(true) },
        { label: 'Нет, только сегодня', onClick: () => answer(false) }
      ]
    });
    promptSheet.el.addEventListener('close', () => { promptSheet = null; });
  }

  async function answer(yes) {
    L.answerTransfer(w, w.prompt, yes);
    await saveActive(w);
    draw();
  }

  // ---- Замена, артборд 08. Только на эту тренировку, решение владельца ----

  function lastDone(id) {
    const last = S.exerciseHistory(records, id).at(-1);
    return last ? L.formatShort(L.fromDayKey(last.date)) : 'Нет данных';
  }

  function openReplace(item, index) {
    const { same, other } = L.alternatives(item.exId, custom);
    const current = ex(item.exId);
    const option = (e) => h('li', { 'data-name': e.name.toLowerCase() },
      h('button', {
        class: 'option', type: 'button',
        onclick: async () => {
          sheet.close();
          await commit(() => replace(item, e), `head-${index}`);
        }
      },
        h('span', { class: 'option__name', text: e.name }),
        h('span', { class: 'data-line option__meta', text: lastDone(e.id) })));
    const lists = [];
    const list = (items) => { const ul = h('ul', { class: 'options' }, items.map(option)); lists.push(ul); return ul; };
    const search = h('input', {
      class: 'field__input', id: 'replace-search', type: 'search', autocomplete: 'off',
      oninput: (e) => {
        const q = e.target.value.trim().toLowerCase();
        for (const ul of lists) for (const li of ul.children) li.hidden = !!q && !li.dataset.name.includes(q);
      }
    });
    const sheet = openSheet({
      title: 'Заменить',
      content: [
        h('p', { class: 'block__note', text: 'Замена действует только на эту тренировку.' }),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'replace-search', text: 'Поиск' }), search),
        same.length ? [h('h3', { class: 'label', text: `На ту же группу: ${current.primary.map((m) => MUSCLES[m]).join(', ')}` }), list(same)] : null,
        h('h3', { class: 'label', text: 'Остальные' }),
        list(other),
        // Своё упражнение: после сохранения форма вернёт на тренировку, и оно появится в этом списке
        h('a', {
          class: 'btn btn-primary btn-link btn-block', href: '#/exercises/new', text: 'Создать упражнение',
          onclick: () => { try { sessionStorage.setItem('vtg:ex-return', '#/workout'); } catch { /* без возврата */ } }
        })
      ],
      actions: [{ label: 'Отмена' }]
    });
  }

  function replace(item, e) {
    const from = item.exId;
    item.exId = e.id;
    item.rest = restMap[e.id] ?? e.rest;
    item.sets = L.buildSets({ warm: item.warm, work: item.work, reps: item.reps }, plans[e.id], w.deload);
    item.finished = false;
    w.replacements = w.replacements.filter((r) => r.index !== w.items.indexOf(item));
    if (e.id !== item.origExId) w.replacements.push({ index: w.items.indexOf(item), from: item.origExId, to: e.id });
    if (w.transfers[from]) delete w.transfers[from];
  }

  // ---- Отдых: нижняя полоса и развёрнутый вид, артборды 02 и 06 ----

  let restSheet = null;
  let restRefs = null;

  function restRemaining() {
    return w.restEndsAt ? new Date(w.restEndsAt) - Date.now() : 0;
  }

  function restFraction() {
    const total = (w.restTotal ?? 0) * 1000;
    return total ? Math.max(0, Math.min(1, restRemaining() / total)) : 0;
  }

  function nextSetText() {
    const item = w.items[w.open];
    if (!item || item.kind !== 'exercise') return null;
    const si = item.sets.findIndex((s) => s.state === 'pending');
    if (si < 0) return null;
    const set = item.sets[si];
    const ofType = item.sets.filter((s) => s.type === set.type);
    const n = ofType.indexOf(set) + 1;
    const exercise = ex(item.exId);
    const weight = exercise.bodyweight ? (set.w ? `+${S.fmt(set.w)} кг` : 'свой вес') : `${S.fmt(set.w)} кг`;
    return `${set.type === 'warm' ? 'Разминка' : 'Подход'} ${n} из ${ofType.length} · ${weight} × ${set.r}`;
  }

  // Правка только этого отдыха, время по умолчанию для упражнения не меняется
  function adjustRest(dir) {
    const ends = new Date(w.restEndsAt).getTime() + dir * REST_ADJUST * 1000;
    if (ends <= Date.now()) {
      w.restEndsAt = null;
      restSheet?.close();
    } else {
      w.restEndsAt = new Date(ends).toISOString();
      w.restTotal = Math.max(REST_ADJUST, (w.restTotal ?? 0) + dir * REST_ADJUST);
    }
    saveActive(w);
    updateRest();
    if (!restSheet) draw('rest-plus');
  }

  function updateRest() {
    const node = main.querySelector('[data-rest]');
    if (node) node.textContent = L.formatClock(restRemaining());
    if (!restRefs) return;
    restRefs.time.textContent = L.formatClock(restRemaining());
    restRefs.fill.style.setProperty('--v', String(restFraction()));
  }

  function showRest() {
    if (restSheet || restRemaining() <= 0) return;
    const time = h('p', { class: 'rest-time', role: 'timer', 'aria-label': 'Осталось отдыха', text: L.formatClock(restRemaining()) });
    const fill = h('span', { class: 'progress__fill', style: { '--v': String(restFraction()) } });
    const next = nextSetText();
    restSheet = openSheet({
      title: 'Отдых',
      titleClass: 'label',
      content: [
        time,
        h('div', { class: 'progress', 'aria-hidden': 'true' }, fill),
        h('div', { class: 'rest-adjust', role: 'group', 'aria-label': 'Изменить этот отдых' },
          h('button', { class: 'btn btn-second', type: 'button', 'aria-label': 'Отдых: на 30 секунд меньше', onclick: () => adjustRest(-1) }, h('span', { class: 'data-line', text: '−30 с' })),
          h('button', { class: 'btn btn-second', type: 'button', 'aria-label': 'Отдых: на 30 секунд больше', onclick: () => adjustRest(1) }, h('span', { class: 'data-line', text: '+30 с' })),
          h('button', { class: 'btn btn-primary rest-adjust__skip', type: 'button', text: 'Пропустить', onclick: () => { w.restEndsAt = null; restSheet?.close(); } })),
        next ? h('p', { class: 'next-row' }, h('span', { class: 'label', text: 'Дальше' }), h('span', { class: 'data-line next-row__value', text: next })) : null
      ]
    });
    restRefs = { time, fill };
    restSheet.el.addEventListener('close', () => {
      restSheet = null;
      restRefs = null;
      w.restExpanded = false;
      if (alive) {
        saveActive(w);
        draw(w.restEndsAt ? 'rest-open' : 'finish');
      }
    });
  }

  function renderBar() {
    if (restRemaining() > 0) {
      return h('div', { class: 'wk-bar card', role: 'region', 'aria-label': 'Отдых' },
        h('button', {
          class: 'wk-bar__rest', type: 'button', 'data-key': 'rest-open', 'aria-haspopup': 'dialog', 'aria-label': 'Отдых, открыть крупно',
          onclick: () => commit(() => { w.restExpanded = true; }).then(showRest)
        },
          h('span', { class: 'wk-bar__label', text: 'Отдых' }),
          h('span', { class: 'wk-bar__time', 'data-rest': '', text: L.formatClock(restRemaining()) })),
        h('button', { class: 'btn btn-second', type: 'button', 'data-key': 'rest-plus', 'aria-label': 'Отдых: на 30 секунд больше',
          onclick: () => adjustRest(1) }, h('span', { class: 'data-line', text: '+30 с' })));
    }
    return h('div', { class: 'wk-bar card' },
      h('button', { class: 'btn btn-primary wk-bar__finish', type: 'button', 'data-key': 'finish', text: 'Завершить тренировку', onclick: confirmFinish }));
  }

  function confirmFinish() {
    const { done, total } = L.progress(w);
    const sets = w.items.reduce((n, i) => n + (i.sets?.filter((s) => s.state === 'done' && s.type === 'work').length ?? 0), 0);
    openSheet({
      title: 'Завершить тренировку?',
      content: [
        h('p', { class: 'data-line', text: `Упражнений ${done} из ${total}, рабочих подходов ${sets}` }),
        h('p', { class: 'block__note', text: 'Неотмеченные подходы не попадут в историю и статистику.' })
      ],
      actions: [
        { label: 'Завершить', primary: true, onClick: async () => {
          await completeWorkout(w);
          releaseWake();
          location.hash = '#/finish';
        } },
        { label: 'Вернуться к тренировке' }
      ]
    });
  }

  // ---- Отрисовка ----

  function draw(focusKey) {
    if (!alive) return;
    renderHeader();
    main.replaceChildren(
      progressBlock(),
      h('ol', { class: 'wk-list', 'aria-label': 'Упражнения тренировки' }, w.items.map(renderItem)),
      renderBar());
    if (focusKey) {
      const el = main.querySelector(`[data-key="${focusKey}"]`) ?? header.querySelector(`[data-key="${focusKey}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // ---- Сигнал, таймеры, экран не гаснет ----

  let audio = null;
  function ensureAudio() {
    if (audio || settings.sound === false) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audio = new Ctx();
  }

  function signal() {
    if (settings.vibration !== false) navigator.vibrate?.([200, 100, 200]);
    if (!audio || settings.sound === false) return;
    audio.resume?.();
    const t = audio.currentTime;
    for (const [start, freq] of [[0, 880], [0.25, 880], [0.5, 1320]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.2);
    }
  }

  const warmupSignalled = new Set();
  const tick = setInterval(async () => {
    const elapsed = header.querySelector('.wk-elapsed');
    if (elapsed) elapsed.textContent = elapsedText();

    if (w.restEndsAt) {
      if (restRemaining() <= 0) {
        w.restEndsAt = null;
        signal();
        restSheet?.close();
        await saveActive(w);
        const bar = main.querySelector('.wk-bar');
        if (bar) bar.replaceWith(renderBar());
      } else {
        updateRest();
      }
    }

    w.items.forEach((item, i) => {
      if (item.kind !== 'warmup' || !item.timerEndsAt || item.state === 'done') return;
      const left = warmupRemaining(item);
      const node = main.querySelector(`[data-warmup="${i}"]`);
      if (node) node.textContent = L.formatClock(left);
      if (left <= 0 && !warmupSignalled.has(i)) { warmupSignalled.add(i); signal(); }
    });
  }, 1000);

  let wake = null;
  async function acquireWake() {
    if (settings.keepAwake === false || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wake) return;
    try {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } catch {
      wake = null;   // отказ системы, например в режиме энергосбережения
    }
  }
  function releaseWake() {
    wake?.release().catch(() => {});
    wake = null;
  }
  const onVisible = () => { if (document.visibilityState === 'visible') acquireWake(); };
  document.addEventListener('visibilitychange', onVisible);
  const unlockAudio = () => ensureAudio();
  main.addEventListener('pointerdown', unlockAudio);

  draw();
  acquireWake();
  if (w.prompt) showPrompt();
  else if (w.restExpanded) showRest();

  return () => {
    alive = false;
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    main.removeEventListener('pointerdown', unlockAudio);
    releaseWake();
    flushActive();
    promptSheet?.close();
    restSheet?.close();
    audio?.close?.();
  };
}
