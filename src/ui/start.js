// VAULT-TEC GYM · начало тренировки: общий путь для главного экрана и ручного запуска с экрана программы.
// Если есть значения прошлой сессии, сначала лист подтверждения весов. Правка в листе действует на сегодня,
// перенос на следующий раз решается плашкой после отметки подхода. Тренировка пишется на фактическую дату.

import * as L from '../logic.js';
import { beginWorkout } from '../session.js';
import { h } from './dom.js';
import { openSheet } from './sheet.js';

export async function startDay({ day, plans, custom = [], rest = {}, cycle }) {
  const now = new Date();
  const { week, deload } = L.cycleWeek(cycle, now);
  const workout = L.buildWorkout({ day, date: now, now, plans, custom, week, deload, rest });
  const proposals = workout.items.filter((i) => i.kind === 'exercise' && plans[i.exId]);
  if (!proposals.length) {
    await beginWorkout(workout);
    location.hash = '#/workout';
    return;
  }
  openStartSheet(workout, proposals, custom);
}

function openStartSheet(workout, proposals, custom) {
  const fields = [];

  function field(id, labelText, value, apply) {
    const input = h('input', { class: 'field__input', id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: L.formatWeight(value) });
    fields.push({ input, apply });
    // Подпись с номером моноширинная целиком, как любая строка с числами
    const labelClass = /\d/.test(labelText) ? 'field__label field__label--data' : 'field__label';
    return h('div', { class: 'field' }, h('label', { class: labelClass, for: id, text: labelText }), input);
  }

  const blocks = proposals.map((item, n) => {
    const ex = L.exerciseById(item.exId, custom);
    const workLabel = ex.bodyweight ? 'Рабочие, дополнительный вес, кг' : 'Рабочий вес, кг';
    const inputs = [];
    const warm = item.sets.filter((s) => s.type === 'warm');
    warm.forEach((s, i) => {
      // Номер нужен, только если разминочных подходов несколько
      inputs.push(field(`start-${n}-w${i}`, warm.length > 1 ? `Разминка ${i + 1}, кг` : 'Разминка, кг', s.w, (v) => {
        item.sets.filter((x) => x.type === 'warm')[i].w = v;
      }));
    });
    const work = item.sets.find((s) => s.type === 'work');
    if (work) {
      inputs.push(field(`start-${n}-work`, workLabel, work.w, (v) => {
        item.sets.filter((x) => x.type === 'work').forEach((x) => { x.w = v; });
      }));
    }
    return h('fieldset', { class: 'start-ex' },
      h('legend', { class: 'start-ex__name', text: ex.name }),
      h('div', { class: 'start-ex__fields' }, inputs));
  });

  openSheet({
    title: 'Веса на сегодня',
    content: [
      h('p', { class: 'sheet__lead', text: 'Значения из прошлой тренировки. Проверьте и поправьте, если нужно. Прибавку веса приложение само не делает.' }),
      blocks
    ],
    actions: [
      {
        label: 'Начать тренировку', primary: true,
        onClick: async () => {
          for (const f of fields) {
            const v = L.parseNumber(f.input.value);
            if (v !== null && v >= 0) f.apply(v);
          }
          await beginWorkout(workout);
          location.hash = '#/workout';
        }
      },
      { label: 'Отмена' }
    ]
  });
}
