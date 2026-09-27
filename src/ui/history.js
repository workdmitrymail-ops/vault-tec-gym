// VAULT-TEC GYM · история тренировок и подробности тренировки, артборды 14 и 15
// SPEC, раздел 11: история входит в раздел статистики отдельным списком.

import * as store from '../store.js';
import * as L from '../logic.js';
import * as S from '../stats.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { summaryTiles, exerciseRows, replacementsBlock } from './summary.js';
import { emptyState } from './empty.js';

function header(el, title, back) {
  el.className = 'app-header';
  el.replaceChildren(
    h('a', { class: 'icon-btn circle-btn', href: back, 'aria-label': 'Назад' }, icon('back')),
    h('h1', { class: 'app-header__title', tabindex: '-1', text: title }));
}

export async function renderHistory({ header: head, main }) {
  header(head, 'История', '#/stats');
  const [records, custom] = await Promise.all([store.getAll('workouts'), store.getAll('exercises')]);
  if (!records.length) {
    main.replaceChildren(emptyState('Каждая завершённая тренировка появится здесь с датой, длительностью и тоннажем.', { href: '#/', label: 'Начать тренировку' }));
    return;
  }
  // Группы по месяцам, новые сверху
  const groups = new Map();
  for (const r of S.sortRecords(records).reverse()) {
    const d = L.fromDayKey(r.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.has(key)) groups.set(key, { title: L.monthName(d), items: [] });
    groups.get(key).items.push(r);
  }
  main.replaceChildren(...[...groups.values()].map((g, gi) => h('section', { class: 'block', 'aria-labelledby': `month-${gi}` },
    h('h2', { class: 'label', id: `month-${gi}`, text: g.title }),
    h('ul', { class: 'pill-list' }, g.items.map((r) => {
      const day = L.dayById(r.dayId);
      const sum = S.summary(r, custom);
      return h('li', {},
        h('a', { class: 'pill-row pill-row--link history-row', href: `#/history/${encodeURIComponent(r.id)}` },
          h('span', { class: 'data-line history-row__date', text: L.formatDate(L.fromDayKey(r.date)) }),
          h('span', { class: 'history-row__day', text: day ? L.dayTitle(day) : 'Тренировка' }),
          h('span', { class: 'history-row__meta' },
            h('span', { class: 'data-line', text: `${Math.round(sum.duration / 60000)} мин` }),
            h('span', { class: 'data-line block__note', text: `${S.fmt(sum.tonnage, 0)} кг` }))));
    })))));
}

export async function renderHistoryDetail({ header: head, main, params }) {
  const [records, custom, bw] = await Promise.all([store.getAll('workouts'), store.getAll('exercises'), store.getAll('bodyweight')]);
  const record = records.find((r) => r.id === params.id);
  if (!record) {
    header(head, 'Тренировка', '#/history');
    main.replaceChildren(emptyState('Такой тренировки нет в истории. Возможно, данные были восстановлены из другой копии.', { href: '#/history', label: 'К списку тренировок' }, 'Тренировка не найдена'));
    return;
  }
  const day = L.dayById(record.dayId);
  // На макете дата стоит в заголовке; по правилу шрифтов строка с цифрами моноширинная целиком,
  // поэтому дата отдельной строкой под заголовком
  header(head, day ? L.dayTitle(day) : 'Тренировка', '#/history');
  main.replaceChildren(
    h('p', { class: 'data-line block__note', text: L.formatDayDate(L.fromDayKey(record.date)) }),
    summaryTiles(S.summary(record, custom, bw), false),
    exerciseRows(record, custom),
    replacementsBlock(record, custom) ?? '');
}
