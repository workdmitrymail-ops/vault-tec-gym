// VAULT-TEC GYM · статистика, артборды 04, 12, 13, 16
// SPEC, разделы 11 и 12. Вкладка хранится в адресе (#/stats/body) и в sessionStorage:
// переключение меняет адрес без перерисовки экрана, перезагрузка возвращает ту же вкладку,
// а вход с главного экрана открывает последнюю вкладку сессии.

import * as store from '../store.js';
import * as L from '../logic.js';
import * as S from '../stats.js';
import { MUSCLES, CYCLE } from '../data.js';
import { loadPlans } from '../session.js';
import { h, plural } from './dom.js';
import { icon } from './icons.js';
import { chart } from './chart.js';
import { openSheet } from './sheet.js';
import { pairs, section, tiles, capitalize } from './summary.js';
import { emptyState } from './empty.js';

const TABS = [
  { id: 'exercise', title: 'Упражнение' },
  { id: 'muscles', title: 'Группы мышц' },
  { id: 'overall', title: 'Общая' },
  { id: 'body', title: 'Вес тела' }
];
// Три месяца словами: цифра в подписи гротеском нарушила бы правило про цифры
const PERIODS = [
  { id: 'month', title: 'Месяц', days: 30 },
  { id: 'quarter', title: 'Три месяца', days: 91 },
  { id: 'all', title: 'Всё время', days: null }
];
const BW_DAYS = 91;
const BW_MIN = 20;
const BW_MAX = 400;
const TABLE_ROWS = 6;

const session = {
  get(key) { try { return sessionStorage.getItem(`vtg:${key}`); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(`vtg:${key}`, value); } catch { /* без памяти */ } }
};

const kg = (v, d = 1) => `${S.fmt(v, d)} кг`;
const shortKey = (key) => L.formatShort(L.fromDayKey(key));

export async function renderStats({ header, main, params }) {
  const valid = (id) => TABS.some((t) => t.id === id);
  let tab = valid(params.tab) ? params.tab : (valid(session.get('stats-tab')) ? session.get('stats-tab') : 'exercise');
  session.set('stats-tab', tab);
  if (params.tab !== tab) history.replaceState(null, '', `#/stats/${tab}`);

  const title = h('h1', { class: 'app-header__title', tabindex: '-1' });
  header.className = 'app-header';
  header.replaceChildren(h('a', { class: 'icon-btn circle-btn', href: '#/', 'aria-label': 'Назад' }, icon('back')), title);

  const data = await loadData();
  let disposers = [];
  const dispose = () => { disposers.forEach((d) => d()); disposers = []; };
  const addChart = (opts) => { const c = chart(opts); disposers.push(c.dispose); return c.el; };

  async function loadData() {
    const [records, custom, bw, plans, cycle] = await Promise.all([
      store.getAll('workouts'), store.getAll('exercises'), store.getAll('bodyweight'), loadPlans(), store.get('cycle')
    ]);
    return { records, custom, bw, plans, cycle };
  }

  // Заголовок экрана называет вкладку, на вкладке упражнения это само упражнение
  function syncTitle(exName) {
    const t = TABS.find((x) => x.id === tab);
    title.textContent = tab === 'exercise' ? (exName ?? 'Статистика') : tab === 'overall' ? 'Статистика' : t.title;
  }

  // ---- Вкладки ----

  const tabButtons = TABS.map((t) => h('button', {
    class: 'seg__btn', type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'stats-panel',
    onclick: () => select(t.id, false),
    onkeydown: (e) => {
      const i = TABS.findIndex((x) => x.id === t.id);
      const move = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: TABS.length - 1 - i }[e.key];
      if (move === undefined) return;
      e.preventDefault();
      select(TABS[(i + move + TABS.length) % TABS.length].id, true);
    }
  }, t.title));
  const panel = h('div', { class: 'stats-panel', id: 'stats-panel', role: 'tabpanel', tabindex: '0' });

  function syncTabs() {
    tabButtons.forEach((b, i) => {
      const on = TABS[i].id === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
  }

  function select(id, focus) {
    tab = id;
    session.set('stats-tab', id);
    history.replaceState(null, '', `#/stats/${id}`);
    syncTabs();
    drawPanel();
    if (focus) tabButtons[TABS.findIndex((t) => t.id === id)].focus();
  }

  function drawPanel() {
    dispose();
    syncTitle();
    const build = { exercise: exercisePanel, muscles: musclesPanel, overall: overallPanel, body: bodyPanel }[tab];
    panel.replaceChildren(...[build()].flat());
  }

  // Переключатель периода в белой капсуле: кнопки с aria-pressed
  function segmented(label, options, current, onPick) {
    return h('div', { class: 'seg seg--caps', role: 'group', 'aria-label': label }, options.map((o) =>
      h('button', { class: 'seg__btn', type: 'button', 'aria-pressed': String(o.id === current), onclick: () => onPick(o.id) }, o.title)));
  }

  function periodOf(key) {
    const id = PERIODS.some((p) => p.id === session.get(key)) ? session.get(key) : 'month';
    return PERIODS.find((p) => p.id === id);
  }

  const noData = (text) => emptyState(text, { href: '#/', label: 'Начать тренировку' });

  // ---- Упражнение, артборд 04 ----

  function exercisePanel() {
    const { records, custom, bw } = data;
    const performed = S.performedExercises(records, custom);
    if (!performed.length) return noData('Графики по упражнениям появятся после первой тренировки.');
    let exId = session.get('stats-ex');
    if (!performed.some((e) => e.id === exId)) exId = performed[0].id;
    const period = periodOf('stats-period');
    const sinceKey = period.days ? L.dayKey(L.addDays(new Date(), -period.days)) : null;
    const series = S.exerciseSeries(records, exId, custom, bw, sinceKey);
    const pr = S.personalRecords(records, exId, custom, bw);
    const ex = series.ex;
    syncTitle(ex.name);

    const selectEl = h('select', {
      class: 'field__input', id: 'stats-ex',
      onchange: (e) => { session.set('stats-ex', e.target.value); drawPanel(); panel.querySelector('#stats-ex')?.focus(); }
    }, performed.map((e) => h('option', { value: e.id, selected: e.id === exId }, e.name)));

    const out = [
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'stats-ex', text: 'Упражнение' }), selectEl),
      segmented('Период', PERIODS, period.id, (id) => { session.set('stats-period', id); drawPanel(); panel.querySelector('[aria-pressed="true"]')?.focus(); })
    ];
    if (!series.rows.length) {
      out.push(h('p', { class: 'block__note', text: 'За выбранный период это упражнение не выполнялось. Выберите период длиннее.' }));
      return out;
    }

    const x = (p) => ({ x: L.formatShort(p.x), y: p.y });
    const listText = (pts, f) => pts.map((p) => `${L.formatShort(p.x)}: ${f(p.y)}`).join(', ');
    if (series.mode === 'reps') {
      out.push(addChart({ title: 'Повторы в лучшем подходе', points: series.weight.map(x), yFormat: (v) => S.fmt(v, 0), summary: listText(series.weight, String) }));
      out.push(h('p', { class: 'block__note', text: 'Вес тела не записан, поэтому график строится по повторам. Запишите вес на вкладке «Вес тела», и появятся графики нагрузки.' }));
    } else {
      out.push(addChart({ title: ex.bodyweight ? 'Нагрузка' : 'Рабочий вес', unit: 'кг', points: series.weight.map(x), yFormat: (v) => S.fmt(v, 1), summary: listText(series.weight, (v) => kg(v)) }));
    }

    const bestTon = Math.max(...series.tonnage.map((p) => p.y));
    // Единицы в подписи: на ширине 320 число с единицей в плитку не помещается
    out.push(tiles([
      [pr.maxWeight ? S.fmt(pr.maxWeight.w) : '—', 'Максимум, кг'],
      [pr.bestE1rm ? S.fmt(pr.bestE1rm.value, 0) : '—', 'Расчётный, кг'],
      [S.fmt(bestTon, 0), 'Объём, кг']
    ]));

    if (series.best.length) {
      out.push(addChart({ title: 'Расчётный максимум', unit: 'кг', points: series.best.map(x), yFormat: (v) => S.fmt(v, 0), summary: listText(series.best, (v) => kg(v)) }));
    }
    out.push(addChart({ type: 'bar', title: 'Тоннаж за тренировку', unit: 'кг', points: series.tonnage.map(x), yFormat: (v) => S.fmt(v, 0), summary: listText(series.tonnage, (v) => kg(v, 0)) }));

    // Таблица последних тренировок: дата, подходы, вес, повторы
    out.push(section('Последние тренировки',
      h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'label', scope: 'col', text: 'Дата' }),
          h('th', { class: 'label data-table__num', scope: 'col', text: 'Подходы' }),
          h('th', { class: 'label data-table__num', scope: 'col', text: 'Вес' }),
          h('th', { class: 'label data-table__num', scope: 'col', text: 'Повторы' }))),
        h('tbody', {}, series.rows.slice(0, TABLE_ROWS).map((r) => h('tr', {},
          h('td', { class: 'data-line', text: shortKey(r.date) }),
          h('td', { class: 'data-line data-table__num', text: String(r.work.length) }),
          h('td', { class: 'data-line data-table__num', text: S.fmt(Math.max(...r.work.map((s) => s.w))) }),
          h('td', { class: 'data-line data-table__num', text: r.work.map((s) => s.r).join(' ') })))))));

    const topReps = pr.maxReps;
    out.push(section('Рекорды', pairs([
      pr.maxWeight ? ['Рабочий вес', `${kg(pr.maxWeight.w, 2)} × ${pr.maxWeight.r}`] : null,
      ['Объём за тренировку', kg(bestTon, 0)],
      topReps ? ['Повторы за подход', `${topReps.r} × ${kg(topReps.w, 2)}`] : null,
      pr.bestE1rm ? ['Расчётный максимум', kg(pr.bestE1rm.value)] : null
    ])));
    return out;
  }

  // ---- Группы мышц, артборд 12: среднее за неделю по выбранному периоду ----

  function musclesPanel() {
    const { records, custom } = data;
    if (!records.length) return noData('Недельный объём по группам мышц появится после первой тренировки.');
    const period = periodOf('stats-volume');
    const today = new Date();
    const fromKey = period.days ? L.dayKey(L.addDays(today, -period.days)) : S.sortRecords(records)[0].date;
    const inPeriod = records.filter((r) => r.date >= fromKey);
    const days = Math.max(7, Math.round((today - L.fromDayKey(fromKey)) / 86400000));
    const weeks = days / 7;
    const vol = S.groupVolume(inPeriod, custom);
    const rows = Object.keys(MUSCLES).map((m) => ({ m, v: (vol[m] ?? 0) / weeks })).sort((a, b) => b.v - a.v);
    const scale = Math.max(20, ...rows.map((r) => r.v));
    const zoneClass = (v) => (v > 20 ? 'high' : v >= 10 ? 'grow' : v >= 6 ? 'keep' : 'low');

    return [
      segmented('Период', PERIODS, period.id, (id) => { session.set('stats-volume', id); drawPanel(); panel.querySelector('[aria-pressed="true"]')?.focus(); }),
      h('section', { class: 'card block', 'aria-label': 'Рабочих подходов в неделю' },
        h('ul', { class: 'volume' }, rows.map(({ m, v }) => {
          // Подпись и цвет зоны от одного и того же округлённого значения
          const value = Math.round(v * 2) / 2;
          return h('li', { class: 'volume__row' },
            h('span', { class: 'volume__name', text: capitalize(MUSCLES[m]) }),
            h('span', { class: 'data-line volume__value', text: S.fmt(value, 1) }),
            h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: `meter__fill meter__fill--${zoneClass(value)}`, style: { '--v': String(value / scale) } })),
            h('span', { class: `zone zone--${zoneClass(value)}`, text: S.volumeZone(value) }));
        }))),
      h('p', { class: 'block__note', text: 'Рабочих подходов в неделю: основная группа упражнения считается целым подходом, вспомогательная половиной. Зоны: меньше шести мало, до девяти поддержание, до двадцати рост, больше высокий объём.' })
    ];
  }

  // ---- Общая, артборд 13 ----

  function overallPanel() {
    const { records, cycle } = data;
    if (!records.length) return noData('Сводка по неделям, пропускам и длительности появится после первой тренировки.');
    const today = new Date();
    const weeks = S.weeklyCounts(records, cycle, today);
    const cycleStart = Math.floor((weeks.length - 1) / CYCLE.weeks) * CYCLE.weeks;
    const shown = weeks.slice(cycleStart);
    // Ось на все недели цикла, как на макете 13: будущие недели подписаны, но без столбца
    const axis = Array.from({ length: CYCLE.weeks }, (_, i) => ({ x: String(i + 1), y: shown[i]?.done ?? null }));
    const missed = weeks.reduce((n, w) => n + w.missed, 0);
    const { week, deload } = L.cycleWeek(cycle, today);
    const avg = Math.round((S.averageDuration(records) ?? 0) / 60000);

    const dots = Array.from({ length: CYCLE.weeks }, (_, i) => {
      const n = i + 1;
      const cls = n === week ? ' cycle__dot--now' : n === CYCLE.deloadWeek ? ' cycle__dot--deload' : '';
      return h('li', { class: `cycle__dot${cls}`, 'aria-current': n === week ? 'step' : null, text: String(n) });
    });

    return [
      addChart({
        type: 'bar', title: 'Тренировки по неделям',
        points: axis,
        yFormat: (v) => S.fmt(v, 0),
        summary: shown.map((w, i) => `неделя ${i + 1}: ${w.done}`).join(', ')
      }),
      tiles([
        [String(records.length), plural(records.length, 'тренировка', 'тренировки', 'тренировок')],
        [String(missed), plural(missed, 'пропуск', 'пропуска', 'пропусков')],
        [String(avg), 'мин в среднем']
      ]),
      section('Цикл',
        h('ol', { class: 'cycle', 'aria-label': `Неделя ${week} из ${CYCLE.weeks}` }, dots),
        h('p', { class: 'data-line block__note cycle__caption', text: deload ? `Неделя ${week} · разгрузка` : `Неделя ${CYCLE.deloadWeek} · разгрузка` }))
    ];
  }

  // ---- Вес тела, артборд 16 ----

  function openWeightSheet() {
    const todayKey = L.dayKey(new Date());
    const todayEntry = data.bw.find((e) => e.date === todayKey);
    const status = h('p', { class: 'block__note', role: 'status' });
    const input = h('input', {
      class: 'field__input', id: 'bw-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      value: todayEntry ? S.fmt(todayEntry.value, 1) : '', 'aria-describedby': 'bw-hint'
    });
    openSheet({
      title: 'Записать вес',
      content: [
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'bw-input', text: 'Вес сегодня, кг' }), input),
        h('p', { class: 'block__note', id: 'bw-hint', text: todayEntry ? 'Запись за сегодня уже есть, новое значение её заменит.' : 'Дата поставится сама.' }),
        status
      ],
      actions: [
        { label: 'Записать', primary: true, onClick: async () => {
          const v = L.parseNumber(input.value);
          if (v === null || v < BW_MIN || v > BW_MAX) {
            status.textContent = `Введите вес числом от ${BW_MIN} до ${BW_MAX} кг.`;
            input.focus();
            return false;
          }
          await store.putRecord('bodyweight', { date: todayKey, value: Math.round(v * 10) / 10 });
          data.bw = await store.getAll('bodyweight');
          drawPanel();
          panel.querySelector('[data-key="bw-add"]')?.focus();
          return true;
        } },
        { label: 'Отмена' }
      ]
    });
    input.focus();
  }

  function bodyPanel() {
    const { bw, plans, custom } = data;
    const add = h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-key': 'bw-add', text: 'Записать вес', onclick: openWeightSheet });
    const st = S.bwStats(bw, new Date());
    if (!st) return [emptyState('Введите вес, и здесь появятся график, среднее за неделю и изменения.'), add];

    const change = (v) => (v === null ? h('dd', { class: 'data-line', text: 'нет данных' })
      : h('dd', { class: `data-line change change--${v > 0 ? 'up' : v < 0 ? 'down' : 'same'}` }, v > 0 ? icon('up') : v < 0 ? icon('down') : null, h('span', { text: S.signed(v) })));
    const summary = h('section', { class: 'card block', 'aria-label': 'Вес тела' },
      h('p', { class: 'big-value' }, h('span', { class: 'big-value__num', text: S.fmt(st.latest.value, 1) }), h('span', { class: 'label', text: 'кг' })),
      h('dl', { class: 'pairs' },
        h('div', { class: 'pairs__row' }, h('dt', { class: 'label', text: 'За неделю' }), change(st.week)),
        h('div', { class: 'pairs__row' }, h('dt', { class: 'label', text: 'За месяц' }), change(st.month)),
        st.avg7 !== null ? h('div', { class: 'pairs__row' }, h('dt', { class: 'label', text: 'Среднее за неделю' }), h('dd', { class: 'data-line', text: kg(st.avg7) })) : null,
        h('div', { class: 'pairs__row' }, h('dt', { class: 'label', text: 'С начала записей' }), change(st.all))));

    // График за три месяца, подписи оси только у первых записей месяца
    const fromKey = L.dayKey(L.addDays(new Date(), -BW_DAYS));
    const recent = S.sortBw(bw).filter((e) => e.date >= fromKey);
    let lastMonth = -1;
    const points = recent.map((e) => {
      const d = L.fromDayKey(e.date);
      const label = d.getMonth() !== lastMonth ? L.monthName(d) : '';
      lastMonth = d.getMonth();
      return { x: label, y: e.value };
    });

    const rel = S.relativeStrength(plans, st.latest.value, custom);
    return [
      summary,
      points.length ? addChart({
        title: 'Вес за три месяца', unit: 'кг', points, yFormat: (v) => S.fmt(v, 1), lastLabel: (v) => S.fmt(v, 1),
        summary: recent.map((e) => `${shortKey(e.date)}: ${kg(e.value)}`).join(', ')
      }) : '',
      rel.length ? section('Относительная сила',
        h('ul', { class: 'line-list' }, rel.map((r) => h('li', { class: 'line-row' },
          h('span', { class: 'line-row__name', text: r.ex.name }),
          h('span', { class: 'data-line', text: S.fmt(r.ratio, 2) })))),
        h('p', { class: 'block__note', text: 'Рабочий вес, делённый на вес тела.' })) : '',
      add
    ];
  }

  syncTabs();
  syncTitle();
  main.replaceChildren(
    h('div', { class: 'seg seg--tabs', role: 'tablist', 'aria-label': 'Разделы статистики' }, tabButtons),
    panel,
    h('a', { class: 'nav-row', href: '#/history' }, h('span', { text: 'История тренировок' }), icon('chevron')));
  drawPanel();

  return dispose;
}
