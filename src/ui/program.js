// VAULT-TEC GYM · экран программы: три дня цикла, неделя цикла, ручной запуск любого дня
// SPEC, разделы 4 и 13. Редактирования программы в этой версии нет, только просмотр и запуск.
// Запущенный вручную день пишется в историю на фактическую дату как обычная тренировка.

import * as store from '../store.js';
import * as L from '../logic.js';
import { PROGRAM, CYCLE } from '../data.js';
import { loadPlans } from '../session.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { startDay } from './start.js';

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export async function renderProgram({ header, main }) {
  header.className = 'app-header';
  header.replaceChildren(
    h('a', { class: 'icon-btn circle-btn', href: '#/', 'aria-label': 'Назад' }, icon('back')),
    h('h1', { class: 'app-header__title', tabindex: '-1', text: 'Программа' }));

  const [records, cycle, active, plans, custom, rest] = await Promise.all([
    store.getAll('workouts'), store.get('cycle'), store.get('activeWorkout'), loadPlans(),
    store.getAll('exercises'), store.get('rest')
  ]);
  const now = new Date();
  const { week, deload } = L.cycleWeek(cycle, now);
  const next = L.nextWorkout(now, records, cycle);

  const cycleBlock = h('section', { class: 'block', 'aria-label': 'Цикл' },
    h('div', { class: 'chips' },
      h('span', { class: `chip chip-data${deload ? ' chip-mark' : ''}`, text: deload ? `Неделя ${week} из ${CYCLE.weeks} · разгрузка` : `Неделя ${week} из ${CYCLE.weeks}` })),
    cycle?.startedAt
      ? h('p', { class: 'data-line block__note', text: `Цикл начат ${L.formatDate(L.fromDayKey(cycle.startedAt))}` })
      : h('p', { class: 'block__note', text: 'Цикл ещё не начат. Неделя считается от первой тренировки, и её можно начать с любого из трёх дней.' }),
    deload ? h('p', { class: 'block__note', text: 'Разгрузочная неделя: рабочих подходов в каждом упражнении на треть меньше, веса прежние.' }) : null);

  const activeBlock = active
    ? h('section', { class: 'card block', 'aria-labelledby': 'active-title' },
      h('h2', { class: 'label', id: 'active-title', text: 'Идёт тренировка' }),
      h('p', { text: `${L.dayTitle(L.dayById(active.dayId))}. Новую можно начать после завершения этой.` }),
      h('a', { class: 'btn btn-primary btn-link btn-block', href: '#/workout', text: 'Продолжить' }))
    : null;

  function dayCard(day) {
    const isNext = !active && next.day.id === day.id;
    const titleId = `day-${day.id}`;
    const rows = day.items.map((item) => {
      const ex = L.exerciseById(item.ex, custom);
      if (ex.type === 'warmup') {
        return h('li', { class: 'program__row' },
          h('span', { class: 'program__name', text: 'Разминка' }),
          h('span', { class: 'data-line program__meta', text: `${ex.minutes} мин` }));
      }
      const base = plans[ex.id]?.sets ?? item.work;
      const sets = deload ? Math.max(1, Math.round(base * CYCLE.deloadFactor)) : base;
      const meta = `${sets} × ${L.repsRange(item.reps)}`;
      return h('li', {},
        h('a', { class: 'program__row program__row--link', href: `#/exercises/${ex.id}` },
          h('span', { class: 'program__name', text: ex.name }),
          h('span', { class: 'data-line program__meta', text: meta })));
    });
    // У выделенного дня дата: день недели в заголовке отвечает «какой», дата отвечает «когда»
    const when = isNext
      ? `Ближайшая тренировка: ${next.isToday ? 'сегодня, ' : ''}${L.formatDate(next.date)}`
      : null;
    return h('section', { class: 'card block program__day', 'aria-labelledby': titleId },
      // Заголовок как на макете 18: день недели, название и тип дня
      h('h2', { class: 'program__title', id: titleId, text: `${L.WEEKDAY[day.weekday]} · ${L.dayTitle(day).toLowerCase()}` }),
      when ? h('p', { class: 'data-line block__note', text: when }) : null,
      h('p', { class: 'block__note', text: capitalize(L.dayMuscles(day, custom).join(', ')) }),
      h('ol', { class: 'program__list' }, rows),
      h('button', {
        class: `btn ${isNext ? 'btn-primary' : 'btn-second'} btn-block`, type: 'button',
        'aria-describedby': titleId, disabled: !!active,
        onclick: () => startDay({ day, plans, custom, rest: rest ?? {}, cycle })
      }, isNext ? 'Начать' : 'Начать вручную'));
  }

  const count = records.length;
  main.replaceChildren(
    cycleBlock,
    activeBlock ?? '',
    h('p', { class: 'block__note', text: 'Любой день можно начать вручную, не дожидаясь расписания. Тренировка запишется на сегодняшнюю дату.' }),
    ...PROGRAM.map(dayCard),
    count ? h('p', { class: 'data-line block__note', text: `Всего тренировок в истории: ${count}` }) : '');
}
