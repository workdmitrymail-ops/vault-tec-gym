// VAULT-TEC GYM · общие блоки экранов с итогами
// Экран завершения (артборд 03), подробности тренировки (15), статистика (04, 13), карточка упражнения (21).
// Заголовок блока оформлен подписью раздела, как на макетах. Строки с числами моноширинные целиком.

import * as L from '../logic.js';
import * as S from '../stats.js';
import { h, plural } from './dom.js';
import { icon } from './icons.js';
import { bodyMaps } from './map.js';

export const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function section(title, ...children) {
  const id = `sec-${Math.random().toString(36).slice(2, 8)}`;
  return h('section', { class: 'card block', 'aria-labelledby': id },
    h('h2', { class: 'label block__title', id, text: title }),
    children);
}

// Пары "подпись и значение": подпись раздела слева, значение моноширинным справа
export function pairs(rows) {
  return h('dl', { class: 'pairs' }, rows.filter(Boolean).map(([k, v]) =>
    h('div', { class: 'pairs__row' },
      h('dt', { class: 'label', text: k }),
      h('dd', { class: 'data-line', text: v }))));
}

// Плитки с крупным числом и подписью под ним: 72 минут, 23 рабочих подходов
export function tiles(items) {
  return h('dl', { class: 'tiles-stat' }, items.map(([value, caption]) =>
    // В разметке подпись первой, как положено в списке определений; число выше подписи ставит стиль
    h('div', { class: 'tile-stat card' },
      h('dt', { class: 'label tile-stat__caption', text: caption }),
      h('dd', { class: 'tile-stat__value', text: value }))));
}

function weightText(w, ex) {
  if (ex?.bodyweight) return w ? `+${S.fmt(w)} кг` : 'свой вес';
  return `${S.fmt(w)} кг`;
}

// Подходы коротко: 4 × 8 · 18 кг, 4 × 18 кг · 8 8 7 7, 3 подхода · 40…45 кг
// short: для плашки, разные повторы диапазоном, чтобы строка не выдавливала название
export function compactSets(sets, ex, short = false) {
  if (!sets.length) return '';
  const n = sets.length;
  const ws = [...new Set(sets.map((s) => s.w))];
  const rs = [...new Set(sets.map((s) => s.r))];
  if (ws.length === 1 && rs.length === 1) return `${n} × ${rs[0]} · ${weightText(ws[0], ex)}`;
  if (ws.length === 1 && short) return `${n} × ${Math.min(...rs)}…${Math.max(...rs)} · ${weightText(ws[0], ex)}`;
  if (ws.length === 1) return `${n} × ${weightText(ws[0], ex)} · ${sets.map((s) => s.r).join(' ')}`;
  const lo = Math.min(...ws);
  const hi = Math.max(...ws);
  return `${n} ${plural(n, 'подход', 'подхода', 'подходов')} · ${S.fmt(lo)}…${S.fmt(hi)} кг`;
}

// Старый длинный формат для истории подходов: 18 кг × 8, 8, 8
export function setsText(sets, ex) {
  const ws = [...new Set(sets.map((s) => s.w))];
  if (ws.length === 1) return `${weightText(ws[0], ex)} × ${sets.map((s) => s.r).join(', ')}`;
  return sets.map((s) => `${weightText(s.w, ex)} × ${s.r}`).join(', ');
}

export function summaryTiles(sum, wide = true) {
  const minutes = Math.round(sum.duration / 60000);
  return tiles([
    [String(minutes), wide ? plural(minutes, 'минута', 'минуты', 'минут') : 'мин'],
    [String(sum.sets), wide ? `${plural(sum.sets, 'рабочий подход', 'рабочих подхода', 'рабочих подходов')}` : plural(sum.sets, 'подход', 'подхода', 'подходов')],
    [S.fmt(sum.tonnage, 0), wide ? 'кг поднято' : 'кг']
  ]);
}

// Группы мышц: карта двух видов по SPEC, раздел 9, и строки "группа, подходы, полоса"
export function musclesBlock(record, custom) {
  const { primary, secondary } = S.workedGroups(record, custom);
  const vol = Object.entries(S.groupVolume([record], custom)).sort((a, b) => b[1] - a[1]);
  const top = vol[0]?.[1] ?? 1;
  return section('Группы мышц',
    bodyMaps(primary, secondary),
    h('ul', { class: 'meter-list' }, vol.map(([m, v]) =>
      h('li', { class: 'meter-row' },
        h('span', { class: 'meter-row__name', text: capitalize(S.muscleName(m)) }),
        h('span', { class: 'data-line meter-row__value', text: S.fmt(v, 1) }),
        h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter__fill', style: { '--v': String(v / top) } }))))),
    h('p', { class: 'block__note', text: 'Рабочие подходы: для основной группы подход считается целым, для вспомогательной половиной.' }));
}

// Изменения относительно прошлого выполнения: вес или, при том же весе, повторы
export function changesBlock(record, previous, custom) {
  const list = S.changes(record, previous);
  if (!list.length) return null;
  const text = (c) => {
    if (c.dir === 'first') return 'первый раз';
    if (c.dir === 'same') return 'без изменений';
    const sign = c.delta > 0 ? '+' : '−';
    if (c.kind === 'weight') return `${sign}${S.fmt(Math.abs(c.delta))} кг`;
    const n = Math.abs(c.delta);
    return `${sign}${n} ${plural(n, 'повтор', 'повтора', 'повторов')}`;
  };
  return section('Изменения',
    h('ul', { class: 'line-list' }, list.map((c) =>
      h('li', { class: 'line-row' },
        h('span', { class: 'line-row__name', text: L.exerciseById(c.exId, custom).name }),
        h('span', { class: `line-row__meta change change--${c.dir}` },
          c.dir === 'up' ? icon('up') : c.dir === 'down' ? icon('down') : null,
          h('span', { class: 'data-line', text: text(c) }))))));
}

export function recordsBlock(record, previous, custom, bw) {
  const list = S.newRecords(record, previous, custom, bw);
  if (!list.length) return null;
  return section('Рекорды',
    // Название и отметка в одной строке, значение отдельной моноширинной строкой: один шрифт на строку
    h('ul', { class: 'line-list' }, list.map((r) =>
      h('li', { class: 'record-row' },
        h('div', { class: 'line-row line-row--wrap' },
          h('span', { class: 'line-row__name', text: r.ex.name }),
          h('span', { class: 'mark', text: 'Новый рекорд' })),
        h('p', { class: 'data-line', text: r.text })))));
}

export function replacementsBlock(record, custom) {
  if (!record.replacements?.length) return null;
  return section('Замены', h('ul', { class: 'line-list' }, record.replacements.map((r) =>
    h('li', { class: 'line-row' },
      h('span', { class: 'line-row__name', text: `${L.exerciseById(r.to, custom).name} вместо: ${L.exerciseById(r.from, custom).name}` })))));
}

// Упражнения тренировки строками-капсулами: 01 Жим гантелей … 4 × 8 · 18 кг
// Короткий формат, как на макете 15: разные повторы диапазоном, чтобы название не сжималось в столбик
export function exerciseRows(record, custom) {
  const items = [...S.workByExercise(record)];
  if (!items.length) return h('p', { class: 'block__note', text: 'Рабочих подходов не отмечено.' });
  return h('ol', { class: 'pill-list' }, items.map(([exId, work], i) => {
    const ex = L.exerciseById(exId, custom);
    return h('li', { class: 'pill-row' },
      h('span', { class: 'data-line pill-row__num', text: String(i + 1).padStart(2, '0') }),
      h('span', { class: 'pill-row__name', text: ex?.name ?? 'Упражнение' }),
      h('span', { class: 'data-line pill-row__meta', text: compactSets(work, ex, true) }));
  }));
}
