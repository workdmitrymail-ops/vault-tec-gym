// VAULT-TEC GYM · справочник, карточка упражнения, создание и правка своих, артборды 20, 21, 10
// SPEC, разделы 7 и 15. Упражнения из программы менять и удалять нельзя.
// Своё упражнение удаляется, только если его нет в истории, программе и идущей тренировке;
// иначе его можно скрыть из списка замены.
// Поиск, фильтр и черновик формы хранятся в sessionStorage: перезагрузка возвращает то же состояние.

import * as store from '../store.js';
import * as L from '../logic.js';
import * as S from '../stats.js';
import { EXERCISES, MUSCLES, PROGRAM } from '../data.js';
import { loadPlans } from '../session.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { muscleMap } from './map.js';
import { chart } from './chart.js';
import { section, compactSets, capitalize } from './summary.js';
import { emptyState } from './empty.js';

const REST_MIN = 15;
const REST_MAX = 600;
const REST_DEFAULT = 90;
const REPS_DEFAULT = [8, 12];
const REPS_MAX = 100;
const NAME_MAX = 60;
const RESULTS_SHOWN = 5;

// Крупные группы для фильтра справочника, как на макете 20. Пресс отдельной группой:
// в справочнике есть упражнение на пресс, и без неё его нельзя было бы отфильтровать.
const REGIONS = [
  { id: 'chest', title: 'Грудь', groups: ['chest'] },
  { id: 'back', title: 'Спина', groups: ['lats', 'traps', 'lower_back'] },
  { id: 'shoulders', title: 'Плечи', groups: ['front_delt', 'side_delt', 'rear_delt'] },
  { id: 'arms', title: 'Руки', groups: ['biceps', 'triceps', 'forearms'] },
  { id: 'legs', title: 'Ноги', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { id: 'abs', title: 'Пресс', groups: ['abs'] }
];

const session = {
  get(key) { try { return sessionStorage.getItem(`vtg:${key}`); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(`vtg:${key}`, value); } catch { /* без памяти */ } },
  remove(key) { try { sessionStorage.removeItem(`vtg:${key}`); } catch { /* нечего чистить */ } }
};

const groups = (list) => list.map((m) => MUSCLES[m]).join(', ');
const builtIn = () => EXERCISES.filter((e) => e.type !== 'warmup');

function header(el, title, back) {
  el.className = 'app-header';
  el.replaceChildren(
    h('a', { class: 'icon-btn circle-btn', href: back, 'aria-label': 'Назад' }, icon('back')),
    h('h1', { class: 'app-header__title', tabindex: '-1', text: title }));
}

// ---- Справочник, артборд 20 ----

export async function renderExercises({ header: head, main }) {
  header(head, 'Упражнения', '#/');
  const [custom, plans] = await Promise.all([store.getAll('exercises'), loadPlans()]);
  let region = REGIONS.some((r) => r.id === session.get('ex-region')) ? session.get('ex-region') : '';
  let query = session.get('ex-search') ?? '';

  const weightMeta = (e) => {
    const w = plans[e.id]?.work;
    if (e.bodyweight) return w ? `+${S.fmt(w)} кг` : 'собственный вес';
    return w ? `${S.fmt(w)} кг` : '';
  };

  const item = (e) => h('li', { 'data-name': e.name.toLowerCase() },
    h('a', { class: 'pill-row pill-row--link ex-row', href: `#/exercises/${e.id}` },
      h('span', { class: 'ex-row__text' },
        h('span', { class: 'ex-row__name', text: e.name }),
        h('span', { class: 'ex-row__groups', text: [groups(e.primary), custom.includes(e) ? 'своё' : null, e.hidden ? 'скрыто из замены' : null].filter(Boolean).join(' · ') })),
      weightMeta(e) ? h('span', { class: `ex-row__meta${e.bodyweight && !plans[e.id]?.work ? '' : ' data-line'}`, text: weightMeta(e) }) : null));

  function filtered() {
    const r = REGIONS.find((x) => x.id === region);
    const all = [...custom, ...builtIn()];
    if (!r) return all;
    const hits = all.filter((e) => [...e.primary, ...(e.secondary ?? [])].some((m) => r.groups.includes(m)));
    return [...hits.filter((e) => e.primary.some((m) => r.groups.includes(m))), ...hits.filter((e) => !e.primary.some((m) => r.groups.includes(m)))];
  }

  function applySearch() {
    const q = query.trim().toLowerCase();
    let shown = 0;
    for (const li of main.querySelectorAll('.pill-list > li')) {
      li.hidden = !!q && !li.dataset.name.includes(q);
      if (!li.hidden) shown++;
    }
    const note = main.querySelector('[data-key="no-results"]');
    if (note) note.hidden = shown > 0;
  }

  function draw(focusKey) {
    const list = filtered();
    main.replaceChildren(
      h('div', { class: 'field' },
        h('label', { class: 'label', for: 'ex-search', text: 'Поиск' }),
        h('input', { class: 'field__input', id: 'ex-search', type: 'search', autocomplete: 'off', value: query,
          oninput: (e) => { query = e.target.value; session.set('ex-search', query); applySearch(); } })),
      h('div', { class: 'choices', role: 'group', 'aria-label': 'Группа мышц' }, REGIONS.map((r) =>
        h('button', {
          class: 'choice-btn', type: 'button', 'aria-pressed': String(r.id === region), 'data-key': `region-${r.id}`,
          onclick: () => { region = region === r.id ? '' : r.id; session.set('ex-region', region); draw(`region-${r.id}`); }
        }, r.title))),
      h('ul', { class: 'pill-list' }, list.map(item)),
      h('p', { class: 'block__note', 'data-key': 'no-results', hidden: true, text: 'Ничего не найдено. Измените поиск или выберите другую группу.' }),
      custom.length ? '' : h('p', { class: 'block__note', text: 'Своих упражнений пока нет. Созданное упражнение появится в этом списке и в списке замены на тренировке.' }),
      h('a', { class: 'btn btn-primary btn-link btn-block', href: '#/exercises/new', text: 'Создать упражнение' }));
    applySearch();
    if (focusKey) main.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }
  draw();
}

// ---- Карточка, артборд 21 ----

export async function renderExerciseCard({ header: head, main, params }) {
  const [custom, records, active, restRaw, bw, plans] = await Promise.all([
    store.getAll('exercises'), store.getAll('workouts'), store.get('activeWorkout'), store.get('rest'), store.getAll('bodyweight'), loadPlans()
  ]);
  const ex = L.exerciseById(params.id, custom);
  if (!ex || ex.type === 'warmup') {
    header(head, 'Упражнение', '#/exercises');
    main.replaceChildren(emptyState('Такого упражнения нет. Возможно, оно удалено или данные восстановлены из другой копии.', { href: '#/exercises', label: 'К списку упражнений' }, 'Упражнение не найдено'));
    return;
  }
  header(head, ex.name, '#/exercises');
  const isCustom = custom.some((e) => e.id === ex.id);
  const inProgram = PROGRAM.flatMap((d) => d.items.filter((i) => i.ex === ex.id));
  const hist = S.exerciseHistory(records, ex.id);
  const pr = S.personalRecords(records, ex.id, custom, bw).maxWeight;
  const sets = plans[ex.id]?.sets ?? inProgram[0]?.work;
  const reps = inProgram[0]?.reps ?? ex.reps;
  const rest = restRaw?.[ex.id] ?? ex.rest;
  let disposeChart = null;

  const row = (k, v, mono = true) => h('div', { class: 'pairs__row' },
    h('dt', { class: 'label', text: k }), h('dd', { class: mono ? 'data-line' : '', text: v }));

  const info = h('section', { class: 'card block', 'aria-label': 'Описание' },
    h('div', { class: 'wk-info' },
      h('div', { class: 'slot slot--map' }, muscleMap(ex)),
      h('dl', { class: 'pairs wk-info__text' },
        row('Основная группа', capitalize(groups(ex.primary)), false),
        ex.secondary?.length ? row('Вспомогательные', groups(ex.secondary), false) : null,
        sets ? row('Подходы', String(sets)) : null,
        reps ? row('Повторы', L.repsRange(reps)) : null,
        row('Отдых', `${rest} с`),
        pr ? row('Рекорд', `${ex.bodyweight ? (pr.w ? `+${S.fmt(pr.w)}` : 'свой вес') : S.fmt(pr.w)}${ex.bodyweight && !pr.w ? '' : ' кг'} × ${pr.r}`) : null)),
    h('dl', { class: 'pairs' },
      row('Собственный вес', ex.bodyweight ? 'да' : 'нет', false),
      row('Одной рукой', ex.unilateral ? 'да, на каждую руку' : 'нет', false)));

  let weightChart = '';
  if (hist.length) {
    const series = S.exerciseSeries(records, ex.id, custom, bw);
    if (series.weight.length) {
      const c = chart({
        title: series.mode === 'reps' ? 'Повторы' : 'Рабочий вес', unit: series.mode === 'reps' ? '' : 'кг',
        points: series.weight.map((p) => ({ x: L.formatShort(p.x), y: p.y })), yFormat: (v) => S.fmt(v, 1),
        summary: series.weight.map((p) => `${L.formatShort(p.x)}: ${S.fmt(p.y, 1)}`).join(', ')
      });
      disposeChart = c.dispose;
      weightChart = c.el;
    }
  }

  const results = hist.length
    ? section('Последние результаты', h('ul', { class: 'line-list' }, [...hist].reverse().slice(0, RESULTS_SHOWN).map((x) =>
      h('li', { class: 'line-row' },
        h('span', { class: 'data-line', text: L.formatShort(L.fromDayKey(x.date)) }),
        h('span', { class: 'data-line block__note', text: compactSets(x.work, ex) })))))
    : section('Последние результаты', h('p', { class: 'block__note', text: 'Упражнение ещё не выполнялось. Результаты появятся после первой тренировки с ним.' }));

  const buttons = h('div', { class: 'wk-actions wk-actions--row' },
    isCustom ? h('a', { class: 'btn btn-primary btn-link', href: `#/exercises/${ex.id}/edit`, text: 'Изменить' }) : null,
    h('a', { class: 'btn btn-second', href: '#/stats/exercise', onclick: () => session.set('stats-ex', ex.id), text: 'История' }));

  let manage;
  if (!isCustom) {
    manage = h('p', { class: 'block__note', text: 'Упражнение из программы, изменить или удалить его нельзя.' });
  } else {
    const usage = L.exerciseUsage(ex.id, records, active);
    const locked = usage.inHistory || usage.inProgram || usage.inActive;
    const reason = usage.inActive ? 'оно есть в идущей тренировке'
      : usage.inHistory ? 'оно есть в истории тренировок' : 'оно есть в программе';
    manage = locked
      ? section('Своё упражнение',
        h('p', { class: 'block__note', text: `Удалить нельзя: ${reason}, записи потерялись бы. Можно скрыть его из списка замены, история останется.` }),
        h('button', {
          class: 'btn btn-second btn-block', type: 'button', 'data-key': 'hide',
          text: ex.hidden ? 'Вернуть в список замены' : 'Скрыть из списка замены',
          onclick: async () => {
            await store.putRecord('exercises', { ...ex, hidden: !ex.hidden });
            disposeChart?.();
            await renderExerciseCard({ header: head, main, params });
            main.querySelector('[data-key="hide"]')?.focus();
          }
        }))
      : h('button', {
        class: 'btn btn-danger btn-block', type: 'button', text: 'Удалить упражнение',
        onclick: () => openSheet({
          title: 'Удалить упражнение?',
          content: [h('p', { text: `«${ex.name}» будет удалено без возможности восстановления.` })],
          actions: [
            { label: 'Удалить', danger: true, onClick: async () => {
              const rests = { ...(restRaw ?? {}) };
              delete rests[ex.id];
              await store.batch([
                { store: 'exercises', delete: ex.id },
                { store: 'plans', delete: ex.id },
                { store: 'kv', key: 'rest', put: rests }
              ]);
              location.hash = '#/exercises';
            } },
            { label: 'Отмена' }
          ]
        })
      });
  }

  main.replaceChildren(info, weightChart, results, buttons, manage);
  return () => disposeChart?.();
}

// ---- Форма, артборд 10 ----

export async function renderExerciseForm({ header: head, main, params }) {
  const custom = await store.getAll('exercises');
  const editing = params.id ? custom.find((e) => e.id === params.id) : null;
  if (params.id && !editing) {
    header(head, 'Изменить упражнение', '#/exercises');
    main.replaceChildren(emptyState('Изменять можно только свои упражнения. Такого своего упражнения нет.', { href: '#/exercises', label: 'К списку упражнений' }, 'Нельзя изменить'));
    return;
  }
  const back = editing ? `#/exercises/${editing.id}` : (session.get('ex-return') ?? '#/exercises');
  header(head, editing ? 'Изменить упражнение' : 'Создать упражнение', back);

  const draftKey = `ex-form:${editing?.id ?? 'new'}`;
  const initial = editing
    ? { name: editing.name, primary: editing.primary[0], secondary: editing.secondary ?? [], rest: String(editing.rest), reps: (editing.reps ?? REPS_DEFAULT).map(String), bodyweight: !!editing.bodyweight, unilateral: !!editing.unilateral }
    : { name: '', primary: '', secondary: [], rest: String(REST_DEFAULT), reps: REPS_DEFAULT.map(String), bodyweight: false, unilateral: false };
  let state;
  try {
    const d = JSON.parse(session.get(draftKey) ?? '{}');
    state = { ...initial, ...d, rest: String(d.rest ?? initial.rest), reps: (d.reps ?? initial.reps).map(String) };
  } catch { state = { ...initial }; }
  const saveDraft = () => session.set(draftKey, JSON.stringify(state));

  const errors = h('div', { class: 'form-errors', role: 'alert' });

  function draw(focusId) {
    const text = (id, label, key, mode) => h('div', { class: 'field' },
      h('label', { class: 'label', for: id, text: label }),
      h('input', {
        class: 'field__input', id, type: 'text', inputmode: mode, autocomplete: 'off', maxlength: key === 'name' ? String(NAME_MAX) : null,
        value: key === 'rep0' ? state.reps[0] : key === 'rep1' ? state.reps[1] : state[key],
        oninput: (e) => {
          if (key === 'rep0' || key === 'rep1') { const r = [...state.reps]; r[key === 'rep0' ? 0 : 1] = e.target.value; state.reps = r; }
          else state[key] = e.target.value;
          saveDraft();
        }
      }));

    // Основная группа: одна, чипами-переключателями
    const primary = h('fieldset', { class: 'choices-set', id: 'f-primary' },
      h('legend', { class: 'label', text: 'Основная группа' }),
      h('div', { class: 'choices' }, Object.entries(MUSCLES).map(([id, n]) =>
        h('label', { class: 'choice' },
          h('input', { class: 'choice__input', type: 'radio', name: 'primary', value: id, checked: state.primary === id, id: `f-pri-${id}`,
            onchange: () => { state.primary = id; state.secondary = state.secondary.filter((m) => m !== id); saveDraft(); draw(`f-pri-${id}`); } }),
          h('span', { class: 'choice__box', text: capitalize(n) })))));

    // Вспомогательные: несколько, отмеченные с галочкой
    const secondary = h('fieldset', { class: 'choices-set' },
      h('legend', { class: 'label', text: 'Вспомогательные группы' }),
      h('div', { class: 'choices' }, Object.entries(MUSCLES).filter(([id]) => id !== state.primary).map(([id, n]) => {
        const on = state.secondary.includes(id);
        return h('label', { class: 'choice choice--multi' },
          h('input', { class: 'choice__input', type: 'checkbox', value: id, checked: on, id: `f-sec-${id}`,
            onchange: (e) => {
              state.secondary = e.target.checked ? [...state.secondary, id] : state.secondary.filter((m) => m !== id);
              saveDraft();
              draw(`f-sec-${id}`);
            } }),
          h('span', { class: 'choice__box' }, on ? icon('check') : null, h('span', { text: capitalize(n) })));
      })));

    const flag = (key, label) => h('label', { class: 'switch-row' },
      h('span', { text: label }),
      h('input', { class: 'switch', type: 'checkbox', role: 'switch', id: `f-${key}`, checked: state[key], onchange: (e) => { state[key] = e.target.checked; saveDraft(); } }));

    const form = h('form', { class: 'form', novalidate: true, onsubmit: submit },
      errors,
      text('f-name', 'Название', 'name', null),
      primary,
      secondary,
      h('div', { class: 'form__row' }, text('f-reps-from', 'Повторы от', 'rep0', 'numeric'), text('f-reps-to', 'Повторы до', 'rep1', 'numeric')),
      text('f-rest', 'Отдых, секунды', 'rest', 'numeric'),
      flag('bodyweight', 'С собственным весом'),
      flag('unilateral', 'Одной рукой, значения на каждую руку'),
      h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Сохранить' }));
    main.replaceChildren(form);
    if (focusId) main.querySelector(`#${focusId}`)?.focus();
  }

  function validate() {
    const problems = [];
    const name = state.name.trim();
    if (!name) problems.push(['f-name', 'Введите название.']);
    else if ([...builtIn(), ...custom].some((e) => e.id !== editing?.id && e.name.toLowerCase() === name.toLowerCase())) {
      problems.push(['f-name', 'Упражнение с таким названием уже есть.']);
    }
    if (!MUSCLES[state.primary]) problems.push([`f-pri-${Object.keys(MUSCLES)[0]}`, 'Выберите основную группу.']);
    const [from, to] = state.reps.map(Number);
    if (!Number.isInteger(from) || from < 1 || from > REPS_MAX) problems.push(['f-reps-from', `Повторы от: целое число от 1 до ${REPS_MAX}.`]);
    else if (!Number.isInteger(to) || to < from || to > REPS_MAX) problems.push(['f-reps-to', `Повторы до: целое число не меньше «от» и не больше ${REPS_MAX}.`]);
    const rest = Number(state.rest);
    if (!Number.isInteger(rest) || rest < REST_MIN || rest > REST_MAX) problems.push(['f-rest', `Отдых: целое число секунд от ${REST_MIN} до ${REST_MAX}.`]);
    return problems;
  }

  async function submit(e) {
    e.preventDefault();
    const problems = validate();
    if (problems.length) {
      errors.replaceChildren(h('ul', { class: 'form-errors__list' }, problems.map(([, t]) => h('li', { text: t }))));
      main.querySelector(`#${problems[0][0]}`)?.focus();
      return;
    }
    const record = {
      ...(editing ?? {}),
      id: editing?.id ?? `u-${Date.now().toString(36)}`,
      name: state.name.trim(),
      primary: [state.primary],
      secondary: state.secondary.filter((m) => m !== state.primary),
      rest: Number(state.rest),
      reps: state.reps.map(Number),
      bodyweight: state.bodyweight,
      unilateral: state.unilateral,
      custom: true,
      hidden: editing?.hidden ?? false,
      createdAt: editing?.createdAt ?? new Date().toISOString()
    };
    await store.putRecord('exercises', record);
    session.remove(draftKey);
    const ret = session.get('ex-return');
    session.remove('ex-return');
    location.hash = !editing && ret ? ret : `#/exercises/${record.id}`;
  }

  draw();
}
