// VAULT-TEC GYM · главный экран, артборды 01, 11, 23, 24
// Шапка, напоминание о копии, чипы недели и даты, карточка тренировки, три плитки, строка копии.
// SPEC, разделы 3 и 4.

import * as store from '../store.js';
import * as L from '../logic.js';
import { CYCLE } from '../data.js';
import { loadPlans, completeWorkout } from '../session.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { startDay } from './start.js';
import { capitalize } from './summary.js';

const STALE_MS = 12 * 60 * 60 * 1000;   // незавершённая тренировка старше 12 часов
const BACKUP_MS = 7 * 24 * 60 * 60 * 1000;
const MISSED_KEY = 'vtg:missed-seen';

const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* без памяти */ } }
};

// Шапка по решению владельца: зелёная плашка, название белым, аватар и настройки в кругах на белой подложке
function renderHeader(header) {
  header.className = 'app-header header-bar home-head';
  header.replaceChildren(
    h('h1', { class: 'app-header__brand', tabindex: '-1', text: 'VAULT-TEC GYM' }),
    h('div', { class: 'head-pill' },
      h('span', { class: 'head-circle' }, h('img', { class: 'head-circle__img', src: 'assets/mascot/avatar.png', alt: '' })),
      h('a', { class: 'head-circle head-circle--link', href: '#/settings', 'aria-label': 'Настройки' }, icon('settings'))));
}

export async function renderHome({ header, main }) {
  renderHeader(header);

  const [history, cycle, active, lastBackup, plans, custom, rest] = await Promise.all([
    store.getAll('workouts'), store.get('cycle'), store.get('activeWorkout'),
    store.get('lastBackup'), loadPlans(), store.getAll('exercises'), store.get('rest')
  ]);
  const now = new Date();
  const next = L.nextWorkout(now, history, cycle);
  const { week, deload } = L.cycleWeek(cycle, now);
  let useMissed = false;
  let backup = null;
  let backupDate = lastBackup;
  const backupAge = () => (backupDate ? now - new Date(backupDate) : Infinity);
  const remind = () => backupAge() > BACKUP_MS && (history.length > 0 || !!backupDate);
  if (remind()) store.prepareBackup().then((b) => { backup = b; syncSave(); }).catch(() => {});

  const lastWorkout = [...history].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt))[0];

  // ---- Напоминание о копии, артборд 23 ----

  function syncSave() {
    const btn = main.querySelector('[data-key="backup-save"]');
    if (btn) btn.disabled = !backup;
  }

  function reminderCard() {
    if (!remind()) return null;
    return h('section', { class: 'card reminder', 'aria-labelledby': 'reminder-title' },
      h('div', { class: 'reminder__text' },
        h('h2', { class: 'label', id: 'reminder-title', text: 'Резервная копия' }),
        h('p', { class: 'data-line block__note', text: backupDate ? L.daysAgo(new Date(backupDate), now) : 'ещё не сохранялась' })),
      h('button', {
        class: 'btn btn-second', type: 'button', 'data-key': 'backup-save', text: 'Сохранить', disabled: !backup,
        // Файл собран заранее: Safari откроет меню «Поделиться» только без ожидания после нажатия
        onclick: () => {
          if (!backup) return;
          store.saveBackup(backup).then((ok) => {
            if (!ok) return;
            backupDate = new Date().toISOString();
            draw('backup-row');
          }).catch((err) => openSheet({ title: 'Копия не сохранена', content: [h('p', { text: err.message })], actions: [{ label: 'Понятно' }] }));
        }
      }));
  }

  // ---- Чипы ----

  function chips() {
    return h('div', { class: 'chips' },
      h('span', { class: 'chip chip-on chip-data', text: deload ? `Неделя ${week} из ${CYCLE.weeks} · разгрузка` : `Неделя ${week} из ${CYCLE.weeks}` }),
      h('span', { class: 'chip chip-data', text: `${L.WEEKDAY[now.getDay()]} · ${L.formatDate(now)}` }));
  }

  // ---- Карточка тренировки ----

  // День недели программы, а не дата старта: тренировка пятницы, начатая в четверг, остаётся пятничной
  function subtitle(day) {
    const weekday = L.WEEKDAY[day.weekday].toLowerCase();
    return capitalize(day.kind ? `${day.kind.toLowerCase()} · ${weekday}` : weekday);
  }

  function cardShell(label, day, date, ...rest) {
    return h('section', { class: 'card home-card active-card', 'aria-labelledby': 'home-card-title' },
      h('span', { class: 'brackets', 'aria-hidden': 'true' }),
      h('div', { class: 'home-card__top' },
        h('div', { class: 'home-card__text' },
          h('p', { class: 'label', text: label }),
          h('h2', { class: 'home-card__day', id: 'home-card-title', text: day.name }),
          h('p', { class: 'home-card__sub', text: subtitle(day) })),
        h('div', { class: 'slot slot--card' }, h('img', { class: 'slot__img', src: 'assets/mascot/card_main.png', alt: '' }))),
      rest);
  }

  function liveText() {
    const { done, total } = L.progress(active);
    return `${done} из ${total} · ${L.formatClock(Date.now() - new Date(active.startedAt), true)}`;
  }

  function activeCard() {
    const day = L.dayById(active.dayId);
    const stale = now - new Date(active.startedAt) > STALE_MS;
    return cardShell('Тренировка идёт', day, new Date(active.startedAt),
      h('hr', { class: 'divider-line' }),
      h('p', { class: 'home-card__live', 'data-live': '', text: liveText() }),
      stale ? h('p', { class: 'block__note', text: 'Тренировка начата больше 12 часов назад. Можно завершить её с тем, что отмечено.' }) : null,
      h('div', { class: 'home-card__actions' },
        stale ? h('button', { class: 'btn btn-second', type: 'button', text: 'Завершить с тем, что отмечено', onclick: finishStale }) : null,
        h('a', { class: 'btn btn-primary btn-link', href: '#/workout', 'data-key': 'home-start', text: 'Продолжить' })));
  }

  function plannedCard() {
    const target = useMissed ? { ...next.missed, isToday: false } : next;
    const day = target.day;
    // Пункты дня вместе с разминкой, как на макете и в прогрессе «3 из 8» на экране тренировки
    const count = day.items.length;
    const lastDate = lastWorkout ? L.fromDayKey(lastWorkout.date) : null;
    return cardShell(useMissed ? 'Пропущенная тренировка' : 'Тренировка', day, target.date,
      // Группы мышц на карточке по требованию шага 2, на макете их нет
      h('p', { class: 'block__note', text: capitalize(L.dayMuscles(day, custom).join(', ')) }),
      h('hr', { class: 'divider-line' }),
      h('dl', { class: 'pairs' },
        h('div', { class: 'pairs__row' },
          h('dt', { class: 'label', text: 'Прошлая тренировка' }),
          h('dd', { class: 'data-line', text: lastDate ? `${L.WEEKDAY[lastDate.getDay()].toLowerCase()}, ${L.daysAgo(lastDate, now)}` : 'ещё не было' })),
        h('div', { class: 'pairs__row' },
          h('dt', { class: 'label', text: 'Упражнений' }),
          h('dd', { class: 'data-line', text: String(count) }))),
      h('div', { class: 'home-card__actions' },
        h('button', { class: 'btn btn-primary', type: 'button', 'data-key': 'home-start', text: 'Начать', onclick: () => startDay({ day, plans, custom, rest: rest ?? {}, cycle }) })));
  }

  // ---- Пропущенная тренировка, артборд 11: лист один раз на каждую пропущенную дату ----

  function offerMissed() {
    if (active || !next.missed) return;
    const key = L.dayKey(next.missed.date);
    if (session.get(MISSED_KEY) === key) return;
    const m = next.missed;
    const seen = () => session.set(MISSED_KEY, key);
    openSheet({
      title: 'Пропущена тренировка',
      content: [h('p', { class: 'sheet__big', text: `${L.WEEKDAY[m.date.getDay()]} · ${L.dayTitle(m.day).toLowerCase()}` })],
      onDismiss: seen,
      actions: [
        { label: 'Сделать пропущенную', primary: true, onClick: () => { seen(); useMissed = true; draw('home-start'); } },
        { label: `По расписанию: ${L.dayTitle(next.day).toLowerCase()}`, onClick: () => { seen(); } }
      ]
    });
  }

  // ---- Плитки и строка копии ----

  function tiles() {
    const tile = (href, title, img, wide) =>
      h('a', { class: `tile card${wide ? ' tile--wide' : ''}`, href },
        h('span', { class: 'tile__title', text: title }),
        h('span', { class: 'slot slot--tile' }, h('img', { class: 'slot__img', src: `assets/mascot/${img}.png`, alt: '' })));
    return h('nav', { class: 'tiles', 'aria-label': 'Разделы' },
      tile('#/program', 'Программа', 'tile_program'),
      tile('#/exercises', 'Упражнения', 'tile_exercises'),
      tile('#/stats', 'Статистика', 'tile_stats', true));
  }

  function backupRow() {
    const when = backupDate ? L.daysAgo(new Date(backupDate), now) : 'не сохранялась';
    return h('a', { class: 'backup-row', href: '#/settings', 'data-key': 'backup-row', 'aria-label': `Резервная копия: ${when}. Открыть настройки` },
      h('span', { class: 'label', text: 'Резервная копия' }),
      h('span', { class: 'data-line block__note', text: when }));
  }

  async function finishStale() {
    openSheet({
      title: 'Завершить тренировку?',
      content: [h('p', { text: 'В историю попадут только отмеченные подходы.' })],
      actions: [
        { label: 'Завершить', primary: true, onClick: async () => { await completeWorkout(active); location.hash = '#/finish'; } },
        { label: 'Отмена' }
      ]
    });
  }

  function draw(focusKey) {
    main.replaceChildren(reminderCard() ?? '', chips(), active ? activeCard() : plannedCard(), tiles(), backupRow());
    if (focusKey) main.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }

  draw();
  offerMissed();

  // Счётчик идущей тренировки обновляется раз в секунду
  const tick = active ? setInterval(() => {
    const node = main.querySelector('[data-live]');
    if (node) node.textContent = liveText();
  }, 1000) : null;
  return () => clearInterval(tick);
}
