// VAULT-TEC GYM · список экранов и заглушки для ещё не сделанных
// Список по docs/SPEC.md, раздел 17. Артборды, которые являются состояниями
// или шторками другого экрана, отнесены к этому экрану, отдельного маршрута у них нет.
// view: готовый экран; без view показывается заглушка.

import { renderHome } from './home.js';
import { renderWorkout } from './workout.js';
import { renderFinish } from './finish.js';
import { renderStats } from './statistics.js';
import { renderHistory, renderHistoryDetail } from './history.js';
import { renderProgram } from './program.js';
import { renderExercises, renderExerciseCard, renderExerciseForm } from './exercises.js';
import { renderSettings } from './settings.js';

export const SCREENS = [
  { path: '',                 title: 'VAULT-TEC GYM',          home: true, view: renderHome, step: 2, boards: '01 главный, 11 пропущенная тренировка, 17 пустое состояние, 23 главный тренировка идёт, 24 разгрузочная неделя' },
  { path: 'workout',          title: 'Тренировка',             back: '', view: renderWorkout, step: 2, boards: '02 тренировка, 02A список, 05 разминка, 06 отдых развёрнутый, 07 перенос веса, 08 замена упражнения, 09 область замены' },
  { path: 'finish',           title: 'Тренировка завершена',   back: '', view: renderFinish, step: 3, boards: '03 завершение' },
  { path: 'stats',            title: 'Статистика',             back: '', view: renderStats, step: 3, boards: '04, 12, 13, 16 вкладки статистики' },
  { path: 'stats/:tab',       title: 'Статистика',             back: '', view: renderStats, step: 3, boards: '04 упражнение, 12 группы мышц, 13 общая, 16 вес тела' },
  { path: 'history',          title: 'История',                back: 'stats', view: renderHistory, step: 3, boards: '14 история' },
  { path: 'history/:id',      title: 'Тренировка',             back: 'history', view: renderHistoryDetail, step: 3, boards: '15 подробности тренировки' },
  { path: 'program',          title: 'Программа',              back: '', view: renderProgram, step: 4, boards: '18 программа' },
  { path: 'program/:day',     title: 'Редактор дня',           back: 'program', later: true, boards: '19 редактор дня' },
  { path: 'exercises',        title: 'Упражнения',             back: '', view: renderExercises, step: 4, boards: '20 упражнения' },
  { path: 'exercises/new',    title: 'Создать упражнение',     back: 'exercises', view: renderExerciseForm, step: 4, boards: '10 создание упражнения' },
  { path: 'exercises/:id/edit', title: 'Изменить упражнение',  back: 'exercises', view: renderExerciseForm, step: 4, boards: '10 создание упражнения' },
  { path: 'exercises/:id',    title: 'Упражнение',             back: 'exercises', view: renderExerciseCard, step: 4, boards: '21 карточка упражнения' },
  { path: 'settings',         title: 'Настройки',              back: '', view: renderSettings, step: 4, boards: '22 настройки' }
];

export function renderStub(main, screen, params) {
  const section = document.createElement('section');
  section.className = 'stub';

  const text = document.createElement('p');
  text.className = 'stub__text';
  text.textContent = screen.later
    ? 'Редактирование программы в текущий план сборки не входит. Программу можно посмотреть и запустить на экране «Программа».'
    : `Экран появится на шаге ${screen.step} плана сборки.`;

  const boards = document.createElement('p');
  boards.className = 'stub__data';
  boards.textContent = `Артборды: ${screen.boards}`;

  section.append(text, boards);

  const values = Object.entries(params);
  if (values.length) {
    const data = document.createElement('p');
    data.className = 'stub__data';
    data.textContent = values.map(([k, v]) => `${k}: ${v}`).join(', ');
    section.append(data);
  }

  main.append(section);
}
