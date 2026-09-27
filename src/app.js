// VAULT-TEC GYM · точка входа: хранилище, оболочка, роутер

import * as store from './store.js';
import { route, otherwise, start } from './router.js';
import { onDataReplaced } from './sync.js';
import { registerServiceWorker } from './pwa.js';
import { SCREENS, renderStub } from './ui/stub.js';
import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';

const header = document.getElementById('app-header');
const main = document.getElementById('app-main');

function renderStubHeader(screen) {
  header.className = 'app-header';
  header.replaceChildren(
    h('a', { class: 'icon-btn circle-btn', href: `#/${screen.back}`, 'aria-label': 'Назад' }, icon('back')),
    h('h1', { class: 'app-header__title', tabindex: '-1', text: screen.title }));
}

let firstRender = true;
let storageError = false;
let cleanup = null;
let renderId = 0;

async function render(screen, params) {
  const id = ++renderId;
  cleanup?.();
  cleanup = null;
  // Листы прошлого экрана закрываются при переходе
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  main.replaceChildren();

  if (storageError) {
    main.append(h('p', { text: 'Хранилище недоступно, данные не сохранятся. Проверьте, что сайт не открыт в приватном режиме.' }));
  }

  if (screen.view) {
    const result = await screen.view({ header, main, params });
    if (id !== renderId) { result?.(); return; }
    cleanup = result ?? null;
  } else {
    renderStubHeader(screen);
    renderStub(main, screen, params);
  }

  document.title = screen.home ? 'VAULT-TEC GYM' : `${screen.title} · VAULT-TEC GYM`;
  window.scrollTo(0, 0);
  // При переходе фокус на заголовок, чтобы экранный диктор объявил новый экран.
  // Заголовок обычно в шапке, на экране завершения под иллюстрацией
  if (!firstRender) (header.querySelector('h1') ?? main.querySelector('h1'))?.focus({ preventScroll: true });
  firstRender = false;
}

async function boot() {
  try {
    await store.open();
  } catch (err) {
    storageError = true;
    console.warn('IndexedDB:', err);
  }

  for (const screen of SCREENS) route(screen.path, screen);
  otherwise(SCREENS[0]);
  start(render);
}

// Другая вкладка удалила данные, загрузила копию или начала новый цикл (src/sync.js).
// Состояние этой вкладки устарело: запись замораживается, чтобы ни таймер отдыха, ни отложенный ввод,
// ни черновик при уходе со страницы не вернули старое, и вкладка перезагружается на главный экран.
// Перезагрузка сбрасывает всё, что было в памяти, а заморозка действует до неё.
onDataReplaced(() => {
  store.freeze();
  history.replaceState(null, '', '#/');
  location.reload();
});

boot();
registerServiceWorker();
