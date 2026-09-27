// VAULT-TEC GYM · программа и справочник упражнений
// Источник: docs/SPEC.md, разделы 13 и 15. Менять только здесь.

export const MUSCLES = {
  chest: 'грудь', front_delt: 'передняя дельта', side_delt: 'средняя дельта',
  rear_delt: 'задняя дельта', biceps: 'бицепс', triceps: 'трицепс',
  forearms: 'предплечья', abs: 'пресс', lats: 'широчайшие', traps: 'трапеция',
  lower_back: 'поясница', glutes: 'ягодичные', quads: 'квадрицепс',
  hamstrings: 'бицепс бедра', calves: 'икры'
};

// Зона мышечной карты для группы мышц: дельты объединены, спереди нет трапеции и икр
export const MAP_ZONE = {
  chest: 'front_chest', front_delt: 'front_delts', side_delt: 'front_delts',
  rear_delt: 'back_delts', biceps: 'front_biceps', triceps: 'back_triceps',
  forearms: 'front_forearms', abs: 'front_abs', lats: 'back_lats',
  traps: 'back_traps', lower_back: 'back_lower_back', glutes: 'back_glutes',
  quads: 'front_quads', hamstrings: 'back_hamstrings', calves: 'back_calves'
};

// bodyweight: вес тела плюс поле дополнительного веса
// unilateral: значения вводятся одним числом, подпись "на каждую руку"
export const EXERCISES = [
  { id: 'warmup_15',      name: 'Разминка',                               type: 'warmup', minutes: 15 },
  { id: 'warmup_30',      name: 'Разминка',                               type: 'warmup', minutes: 30 },

  { id: 'db_incline',     name: 'Жим гантелей на наклонной скамье',       primary: ['chest'],               secondary: ['front_delt','triceps'], rest: 150 },
  { id: 'pullups',        name: 'Подтягивания',                           primary: ['lats'],                secondary: ['biceps','rear_delt'],   rest: 150, bodyweight: true },
  { id: 'cable_row',      name: 'Тяга горизонтального блока',             primary: ['lats'],                secondary: ['traps','rear_delt','biceps'], rest: 120 },
  { id: 'dips_triceps',   name: 'Вертикальные отжимания на брусьях',      primary: ['triceps'],             secondary: ['chest','front_delt'],   rest: 120, bodyweight: true },
  { id: 'bb_curl',        name: 'Подъём штанги на бицепс',                primary: ['biceps'],              secondary: ['forearms'],             rest: 90 },
  { id: 'cable_lateral',  name: 'Боковые подъёмы в блоке',                primary: ['side_delt'],           secondary: ['traps'],                rest: 60 },
  { id: 'front_raise',    name: 'Передний подъём гантелей',               primary: ['front_delt'],          secondary: [],                       rest: 60 },

  { id: 'deadlift',       name: 'Становая тяга',                          primary: ['glutes','hamstrings'], secondary: ['lower_back','traps','forearms'], rest: 180 },
  { id: 'hack_squat',     name: 'Гак присед',                             primary: ['quads'],               secondary: ['glutes'],               rest: 150 },
  { id: 'leg_curl',       name: 'Сгибание ног',                           primary: ['hamstrings'],          secondary: [],                       rest: 90 },
  { id: 'leg_ext',        name: 'Разгибание ног',                         primary: ['quads'],               secondary: [],                       rest: 90 },
  { id: 'hip_thrust',     name: 'Ягодичный мостик в тренажёре',           primary: ['glutes'],              secondary: ['hamstrings'],           rest: 120 },
  { id: 'calf_raise',     name: 'Подъёмы на носки',                       primary: ['calves'],              secondary: [],                       rest: 60 },
  { id: 'crunch',         name: 'Скручивания в тренажёре',                primary: ['abs'],                 secondary: [],                       rest: 60 },

  { id: 'dips_chest',     name: 'Отжимания на брусьях с наклоном вперёд', primary: ['chest'],               secondary: ['triceps','front_delt'], rest: 120, bodyweight: true },
  { id: 'pulldown_one',   name: 'Тяга верхнего блока одной рукой',        primary: ['lats'],                secondary: ['biceps','rear_delt'],   rest: 90, unilateral: true },
  { id: 'crossover_fly',  name: 'Сведение в кроссовере',                  primary: ['chest'],               secondary: ['front_delt'],           rest: 60 },
  { id: 'chinups',        name: 'Обратные подтягивания',                  primary: ['biceps'],              secondary: ['lats'],                 rest: 120, bodyweight: true },
  { id: 'rope_overhead',  name: 'Разгибание рук с канатом над головой',   primary: ['triceps'],             secondary: [],                       rest: 60 },
  { id: 'face_pull',      name: 'Тяга каната к лицу',                     primary: ['rear_delt'],           secondary: ['traps'],                rest: 60 }
];

// warm: разминочные подходы, work: рабочие, reps: [от, до]
export const PROGRAM = [
  {
    id: 'mon', weekday: 1, name: 'Верх тела', kind: 'Жимовой день', heavy: true,
    items: [
      { ex: 'warmup_15' },
      { ex: 'db_incline',    warm: 1, work: 4, reps: [6, 8] },
      { ex: 'pullups',       warm: 1, work: 4, reps: [6, 8] },
      { ex: 'cable_row',     warm: 0, work: 3, reps: [8, 10] },
      { ex: 'dips_triceps',  warm: 1, work: 3, reps: [6, 10] },
      { ex: 'bb_curl',       warm: 0, work: 3, reps: [8, 10] },
      { ex: 'cable_lateral', warm: 0, work: 4, reps: [12, 15] },
      { ex: 'front_raise',   warm: 0, work: 2, reps: [10, 12] }
    ]
  },
  {
    id: 'wed', weekday: 3, name: 'Ноги', heavy: false,
    items: [
      { ex: 'warmup_30' },
      { ex: 'deadlift',   warm: 2, work: 3, reps: [5, 8] },
      { ex: 'hack_squat', warm: 2, work: 3, reps: [10, 12] },
      { ex: 'leg_curl',   warm: 1, work: 3, reps: [10, 12] },
      { ex: 'leg_ext',    warm: 1, work: 3, reps: [12, 15] },
      { ex: 'hip_thrust', warm: 1, work: 3, reps: [10, 12] },
      { ex: 'calf_raise', warm: 0, work: 4, reps: [10, 15] },
      { ex: 'crunch',     warm: 0, work: 3, reps: [12, 15] }
    ]
  },
  {
    id: 'fri', weekday: 5, name: 'Верх тела', kind: 'Тяговый день', heavy: false,
    items: [
      { ex: 'warmup_15' },
      { ex: 'dips_chest',    warm: 1, work: 4, reps: [8, 12] },
      { ex: 'pulldown_one',  warm: 0, work: 3, reps: [10, 12] },
      { ex: 'crossover_fly', warm: 0, work: 3, reps: [12, 15] },
      { ex: 'chinups',       warm: 0, work: 3, reps: [8, 12] },
      { ex: 'rope_overhead', warm: 0, work: 3, reps: [10, 12] },
      { ex: 'cable_lateral', warm: 0, work: 4, reps: [12, 15] },
      { ex: 'face_pull',     warm: 0, work: 3, reps: [15, 20] }
    ]
  }
];

// Цикл: 8 недель, недели 1 и 2 входные, 3...7 нарастание, 8 разгрузочная
export const CYCLE = { weeks: 8, deloadWeek: 8, deloadFactor: 2 / 3 };

// Зоны объёма для статистики по группам мышц
export const VOLUME_ZONES = [
  { max: 5.9,  label: 'мало' },
  { max: 9.9,  label: 'поддержание' },
  { max: 20,   label: 'рост' },
  { max: 1e9,  label: 'высокий объём' }
];
