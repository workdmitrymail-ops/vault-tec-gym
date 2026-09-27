// VAULT-TEC GYM · настройки, артборд 22
// SPEC, раздел 10: звук, вибрация, экран не гаснет, шаг веса, резервная копия, цикл,
// записи веса тела, сброс данных, версия.
//
// Сохранение копии в два шага: файл собирается заранее через prepareBackup() при открытии экрана
// и после каждого изменения данных, а saveBackup(prepared) вызывается прямо в обработчике нажатия.
// Иначе Safari на iPhone не откроет меню «Поделиться»: между нажатием и вызовом не должно быть ожидания базы.

import * as store from '../store.js';
import * as L from '../logic.js';
import * as S from '../stats.js';
import { CYCLE } from '../data.js';
import { announce, REASON } from '../sync.js';
import { pwaStatus } from '../pwa.js';
import { h, plural } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { pairs, section } from './summary.js';

const DEFAULT_WEIGHT_STEP = 2.5;
const WEIGHT_STEP_MIN = 0.25;
const WEIGHT_STEP_MAX = 20;

export async function renderSettings({ header, main }) {
  header.className = 'app-header';
  header.replaceChildren(
    h('a', { class: 'icon-btn circle-btn', href: '#/', 'aria-label': 'Назад' }, icon('back')),
    h('h1', { class: 'app-header__title', tabindex: '-1', text: 'Настройки' }));

  let data = await load();
  let prepared = null;
  let preparing = null;
  const status = h('p', { class: 'block__note settings__status', role: 'status' });

  async function load() {
    const [settings, lastBackup, cycle, bw, records, storage, pwa] = await Promise.all([
      store.get('settings'), store.get('lastBackup'), store.get('cycle'), store.getAll('bodyweight'), store.getAll('workouts'),
      store.get('storage'), pwaStatus()
    ]);
    return { settings: settings ?? {}, lastBackup, cycle, bw, records, storage, pwa };
  }

  // Файл копии держится готовым заранее
  function prepare() {
    prepared = null;
    const run = store.prepareBackup().then((b) => { if (preparing === run) { prepared = b; syncSaveButton(); } return b; });
    preparing = run;
    run.catch(() => {});
    syncSaveButton();
  }

  function syncSaveButton() {
    const btn = main.querySelector('[data-key="save-backup"]');
    if (btn) btn.disabled = !prepared;
  }

  async function refresh(focusKey, message) {
    data = await load();
    draw(focusKey);
    if (message) status.textContent = message;
    prepare();
  }

  const save = async (patch, focusKey) => {
    await store.set('settings', { ...data.settings, ...patch });
    await refresh(focusKey);
  };

  // ---- Переключатели и шаг веса ----

  function switches() {
    const s = data.settings;
    const row = (key, label) => h('label', { class: 'switch-row card' },
      h('span', { text: label }),
      h('input', { class: 'switch', type: 'checkbox', role: 'switch', 'data-key': key, checked: s[key] ?? true,
        onchange: (e) => save({ [key]: e.target.checked }, key) }));
    const step = h('input', {
      class: 'field__input', id: 'weight-step', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      value: L.formatWeight(s.weightStep ?? DEFAULT_WEIGHT_STEP), 'aria-describedby': 'weight-step-hint',
      onchange: (e) => {
        const v = L.parseNumber(e.target.value);
        if (v === null || v < WEIGHT_STEP_MIN || v > WEIGHT_STEP_MAX) {
          main.querySelector('#weight-step-hint').textContent = `Шаг числом от ${L.formatWeight(WEIGHT_STEP_MIN)} до ${WEIGHT_STEP_MAX} кг.`;
          return;
        }
        save({ weightStep: v }, null).then(() => main.querySelector('#weight-step')?.focus());
      }
    });
    return [
      row('sound', 'Звук сигнала'),
      row('vibration', 'Вибрация'),
      row('keepAwake', 'Экран не гаснет'),
      h('div', { class: 'field' },
        h('label', { class: 'label', for: 'weight-step', text: 'Шаг веса, кг' }),
        step,
        h('p', { class: 'data-line block__note', id: 'weight-step-hint', text: `Кнопки плюс и минус меняют вес на ${L.formatWeight(s.weightStep ?? DEFAULT_WEIGHT_STEP)} кг` }))
    ];
  }

  // ---- Копия и цикл: строки-переходы ----

  function navRows() {
    const input = h('input', {
      class: 'visually-hidden', type: 'file', id: 'restore-file', accept: 'application/json,.json',
      onchange: (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) confirmRestore(file); }
    });
    const { week, deload } = L.cycleWeek(data.cycle, new Date());
    return [
      h('button', {
        class: 'nav-row', type: 'button', 'data-key': 'save-backup', disabled: !prepared,
        // Ни одного ожидания до вызова: prepared собран заранее
        onclick: () => {
          if (!prepared) return;
          store.saveBackup(prepared).then((ok) => {
            if (ok) refresh('save-backup', 'Копия сохранена.');
          }).catch((err) => { status.textContent = `Копия не сохранена: ${err.message}`; });
        }
      }, h('span', { text: 'Сохранить копию' }), icon('chevron')),
      h('p', { class: 'data-line block__note', text: data.lastBackup ? `Последняя копия: ${L.formatDayDate(new Date(data.lastBackup)).toLowerCase()}` : 'Резервной копии ещё нет. Данные хранятся только на этом телефоне.' }),
      h('label', { class: 'nav-row', for: 'restore-file' }, h('span', { text: 'Восстановить из копии' }), icon('chevron')),
      input,
      data.cycle?.startedAt
        ? h('button', {
          class: 'nav-row', type: 'button', 'data-key': 'new-cycle',
          onclick: () => openSheet({
            title: 'Начать цикл заново?',
            content: [h('p', { text: 'С сегодняшнего дня начнётся первая неделя. История тренировок и веса не меняются.' })],
            actions: [
              { label: 'Начать заново', primary: true, onClick: async () => {
                await store.set('cycle', { startedAt: L.dayKey(new Date()) });
                announce(REASON.cycle);
                await refresh('new-cycle', 'Новый цикл начат, сейчас неделя 1.');
              } },
              { label: 'Отмена' }
            ]
          })
        }, h('span', { text: 'Начать цикл заново' }), icon('chevron'))
        : null,
      h('p', { class: 'data-line block__note', text: data.cycle?.startedAt
        ? `Неделя ${week} из ${CYCLE.weeks}${deload ? ', разгрузка' : ''}, цикл начат ${L.formatDate(L.fromDayKey(data.cycle.startedAt))}`
        : 'Цикл начнётся с первой тренировки' })
    ];
  }

  async function confirmRestore(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showError('Файл не читается как резервная копия. Данные не изменены.');
      return;
    }
    const workouts = Array.isArray(parsed?.stores?.workouts) ? parsed.stores.workouts.length : 0;
    const when = parsed?.exportedAt ? L.formatDayDate(new Date(parsed.exportedAt)).toLowerCase() : 'дата неизвестна';
    openSheet({
      title: 'Восстановить из копии?',
      content: [
        h('p', { class: 'data-line', text: `Копия: ${when}, тренировок ${workouts}` }),
        h('p', { class: 'block__note', text: 'Все текущие данные будут заменены данными из копии. Если копия повреждена, ничего не изменится.' })
      ],
      actions: [
        { label: 'Восстановить', primary: true, onClick: async () => {
          try {
            await store.importData(parsed);
            try { localStorage.removeItem('vtg:active-draft'); } catch { /* нет черновика */ }
            announce(REASON.import);
            await refresh(null, `Копия восстановлена: ${workouts} ${plural(workouts, 'тренировка', 'тренировки', 'тренировок')}.`);
          } catch (err) {
            showError(`Копия не загружена: ${err.message}. Данные не изменены.`);
          }
        } },
        { label: 'Отмена' }
      ]
    });
  }

  function showError(text) {
    status.textContent = text;
    openSheet({ title: 'Не получилось', content: [h('p', { text })], actions: [{ label: 'Понятно' }] });
  }

  // ---- Вес тела ----

  function bodyweightBlock() {
    const list = S.sortBw(data.bw).reverse();
    if (!list.length) return section('Записи веса тела', h('p', { class: 'block__note', text: 'Записей веса нет. Вес записывается на вкладке «Вес тела» в статистике.' }));
    return section('Записи веса тела',
      h('ul', { class: 'line-list' }, list.map((e) => {
        const text = `${L.formatDate(L.fromDayKey(e.date))}: ${S.fmt(e.value, 1)} кг`;
        return h('li', { class: 'line-row' },
          h('span', { class: 'data-line', text }),
          h('button', {
            class: 'btn btn-second', type: 'button', 'data-key': `bw-${e.date}`, 'aria-label': `Удалить запись ${text}`, text: 'Удалить',
            onclick: () => openSheet({
              title: 'Удалить запись?',
              content: [h('p', { class: 'data-line', text })],
              actions: [
                { label: 'Удалить', danger: true, onClick: async () => {
                  await store.deleteRecord('bodyweight', e.date);
                  await refresh(null, `Запись удалена: ${text}.`);
                } },
                { label: 'Отмена' }
              ]
            })
          }));
      })));
  }

  // ---- Сброс и версия ----

  function resetButton() {
    const n = data.records.length;
    return h('button', {
      class: 'btn btn-danger-soft btn-block', type: 'button', text: 'Сбросить данные',
      onclick: () => openSheet({
        title: 'Сбросить все данные?',
        content: [
          h('p', { class: 'data-line', text: `Тренировок в истории: ${n}` }),
          h('p', { class: 'block__note', text: 'Удаляются история, веса, свои упражнения, настройки и идущая тренировка. Перед сбросом стоит сохранить копию.' })
        ],
        actions: [
          { label: 'Продолжить', danger: true, onClick: () => { setTimeout(confirmWipe); } },
          { label: 'Отмена' }
        ]
      })
    });
  }

  function confirmWipe() {
    openSheet({
      title: 'Точно удалить всё?',
      content: [h('p', { text: 'Это второе подтверждение. После сброса приложение начнётся с чистого листа, отменить нельзя.' })],
      actions: [
        { label: 'Удалить всё без возврата', danger: true, onClick: async () => {
          await store.clearAll();
          try {
            localStorage.removeItem('vtg:active-draft');
            Object.keys(sessionStorage).filter((k) => k.startsWith('vtg:')).forEach((k) => sessionStorage.removeItem(k));
          } catch { /* нечего чистить */ }
          // Другие вкладки узнают о сбросе только после того, как он полностью записан
          announce(REASON.wipe);
          location.hash = '#/';
        } },
        { label: 'Отмена' }
      ]
    });
  }

  // Состояние хранилища: итог однократного запроса после первой тренировки (store.requestPersistenceOnce)
  function storageState() {
    const s = data.storage;
    if (!s) return ['после первой тренировки', 'Запрос на постоянное хранение отправится после первой сохранённой тренировки.'];
    if (!s.supported) return ['не поддерживается', 'Браузер не умеет хранить данные постоянно. Держите свежую резервную копию.'];
    if (s.persisted) return ['постоянное', 'Браузер не удалит данные при нехватке места.'];
    return ['обычное', 'При нехватке места браузер может удалить данные. Держите свежую резервную копию.'];
  }

  function aboutBlock() {
    const [storageValue, storageNote] = storageState();
    const offline = { ready: 'готово', pending: 'загружается', unsupported: 'не поддерживается' }[data.pwa.offline];
    return section('О приложении',
      pairs([
        ['Версия', store.APP_VERSION],
        ['Схема данных', String(store.SCHEMA_VERSION)],
        ['Последняя копия', data.lastBackup ? L.formatDate(new Date(data.lastBackup)) : 'не было'],
        ['Хранилище', storageValue],
        ['Без сети', offline],
        data.pwa.updateReady ? ['Обновление', 'загружено'] : null
      ]),
      h('p', { class: 'block__note', 'data-key': 'storage-note', text: storageNote }),
      data.pwa.updateReady ? h('p', { class: 'block__note', text: 'Новая версия применится, когда приложение будет полностью закрыто и открыто снова.' }) : null);
  }

  function draw(focusKey) {
    // replaceChildren печатает null как текст: строки, которых нет в этом состоянии, отбрасываются
    main.replaceChildren(status, ...[...switches(), ...navRows(), resetButton(), bodyweightBlock(), aboutBlock()].filter(Boolean));
    if (focusKey) main.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }

  draw();
  prepare();
}
