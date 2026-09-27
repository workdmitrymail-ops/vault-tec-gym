// VAULT-TEC GYM · экран завершения тренировки, артборд 03
// Иллюстрация, заголовок, три плитки итога, группы мышц, изменения, рекорды, перенос с отменой,
// затем замены и что дальше (SPEC, раздел 9, и решение владельца) и кнопка «Готово».

import * as store from '../store.js';
import * as L from '../logic.js';
import * as S from '../stats.js';
import { loadPlans, undoTransfer, canUndoTransfer } from '../session.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { section, summaryTiles, musclesBlock, changesBlock, recordsBlock, replacementsBlock } from './summary.js';
import { emptyState } from './empty.js';

export async function renderFinish({ header, main }) {
  // Шапки нет: заголовок стоит под иллюстрацией, как на макете
  header.className = 'app-header app-header--empty';
  header.replaceChildren();

  const [lastId, records, custom, bw, cycle, plans] = await Promise.all([
    store.get('lastFinished'), store.getAll('workouts'), store.getAll('exercises'),
    store.getAll('bodyweight'), store.get('cycle'), loadPlans()
  ]);
  const record = records.find((r) => r.id === lastId);

  if (!record) {
    main.replaceChildren(
      h('h1', { class: 'visually-hidden', tabindex: '-1', text: 'Тренировка завершена' }),
      emptyState('Итог появится здесь после первой завершённой тренировки.', { href: '#/', label: 'Начать тренировку' }));
    return;
  }

  const previous = records.filter((r) => r.id !== record.id && (r.date < record.date || (r.date === record.date && r.startedAt < record.startedAt)));
  const sum = S.summary(record, custom, bw);

  function transfersBlock() {
    if (!record.applied?.length) return null;
    return section('Перенесено на следующий раз',
      h('ul', { class: 'line-list' }, record.applied.map((t, i) => {
        const ex = L.exerciseById(t.exId, custom);
        const what = t.type === 'work' ? '' : `разминка ${t.warmIndex + 1} · `;
        const value = `${what}${S.fmt(t.to)} кг`;
        const text = `${ex.name}, ${value}`;
        const undoable = !t.undone && canUndoTransfer(plans, t);
        // Название и значение разными строками: строка с числами целиком моноширинная
        return h('li', { class: 'line-row' },
          h('span', { class: 'line-row__name' },
            ex.name,
            h('span', { class: 'data-line line-row__value', text: value }),
            t.undone ? h('span', { class: 'line-row__note line-row__note--data', text: `Отменено, в следующий раз ${S.fmt(t.from)} кг` }) : null,
            !t.undone && !undoable ? h('span', { class: 'line-row__note', text: 'Уже изменено позже, отменить нельзя' }) : null),
          undoable
            ? h('button', {
              class: 'circle-btn', type: 'button', 'data-key': `undo-${i}`, 'aria-label': `Отменить перенос: ${text}`,
              onclick: async () => {
                if (await undoTransfer(record, i)) {
                  plans[t.exId] = await store.getRecord('plans', t.exId);
                  draw();
                  main.querySelector('.finish__done')?.focus();
                }
              }
            }, icon('close'))
            : null);
      })));
  }

  function nextBlock() {
    const next = L.nextWorkout(new Date(), records, cycle);
    const when = next.isToday ? `Сегодня, ${L.formatDate(next.date)}` : L.formatDayDate(next.date);
    return section('Что дальше',
      h('p', { class: 'line-row__name', text: L.dayTitle(next.day) }),
      h('p', { class: 'data-line block__note', text: when }));
  }

  function draw() {
    main.replaceChildren(
      h('div', { class: 'headline' },
        h('div', { class: 'slot slot--hero' }, h('img', { class: 'slot__img', src: 'assets/mascot/finish.png', alt: '' })),
        h('h1', { class: 'screen-title', tabindex: '-1', text: 'Тренировка завершена' })),
      summaryTiles(sum),
      musclesBlock(record, custom),
      changesBlock(record, previous, custom) ?? '',
      recordsBlock(record, previous, custom, bw) ?? '',
      transfersBlock() ?? '',
      replacementsBlock(record, custom) ?? '',
      nextBlock(),
      h('a', { class: 'btn btn-primary btn-link btn-block finish__done', href: '#/', text: 'Готово' }));
  }

  draw();
}
