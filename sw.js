// VAULT-TEC GYM · service worker: работа без сети
//
// Версия записана здесь же и равна APP_VERSION в src/store.js, равенство сверяет tools/logic_test.html.
// Почему не одна константа на два файла: все файлы страницы, включая store.js, приходят из кэша,
// и о новой версии браузер узнаёт только одним способом, сравнивая байты sw.js с сервером при запуске.
// Если версия меняется только в store.js, sw.js остаётся прежним и обновление до телефона не доходит.
// Подключать версию через importScripts ненадёжно: Safari может не проверять подключённые скрипты.
// Новая версия здесь меняет байты sw.js, браузер ставит новый воркер с новым кэшем vtg-shell-<версия>.
//
// Схема обновления:
// 1. install. Новый воркер скачивает все файлы оболочки в свой кэш, мимо HTTP кэша браузера,
//    чтобы не положить в новую версию старый файл. Если хоть один файл не скачался, установка
//    отменяется целиком и приложение остаётся на прежней версии.
// 2. Ожидание. Пока открыто хоть одно окно приложения, им управляет прежний воркер со своим кэшем.
//    skipWaiting не вызывается намеренно: открытая страница прежней версии иначе начала бы получать
//    файлы новой, например картинки и модули, которые подгружаются позже, и код разошёлся бы со схемой данных.
// 3. activate. При следующем запуске, когда окон прежней версии нет, новый воркер берёт управление
//    и удаляет кэши прошлых версий. На телефоне это значит: закрыть приложение полностью и открыть снова.
//
// Стратегия: свои файлы сначала из кэша, сеть запасной вариант. Запросы к другим адресам
// (шрифты Google) не перехватываются. Страницы из tools/ и всё, что они запрашивают, идут в сеть мимо кэша:
// проверки должны видеть текущие файлы, а не закэшированную версию.

const VERSION = '2.0.0';   // равна APP_VERSION в src/store.js
const PREFIX = 'vtg-shell-';
const CACHE = PREFIX + VERSION;
const SCOPE = self.registration.scope;
const TOOLS = new URL('tools/', SCOPE).href;
const SHELL_PAGE = new URL('index.html', SCOPE).href;

// Оболочка и все ассеты. Полноту списка сверяет tools/logic_test.html: граф модулей от src/app.js,
// ссылки из index.html и манифеста, зоны карты из data.js, картинки маскота.
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'src/tokens.css',
  'src/app.css',
  'src/app.js',
  'src/router.js',
  'src/store.js',
  'src/data.js',
  'src/logic.js',
  'src/stats.js',
  'src/session.js',
  'src/sync.js',
  'src/pwa.js',
  'src/ui/stub.js',
  'src/ui/home.js',
  'src/ui/start.js',
  'src/ui/workout.js',
  'src/ui/finish.js',
  'src/ui/statistics.js',
  'src/ui/history.js',
  'src/ui/program.js',
  'src/ui/exercises.js',
  'src/ui/settings.js',
  'src/ui/summary.js',
  'src/ui/chart.js',
  'src/ui/map.js',
  'src/ui/sheet.js',
  'src/ui/empty.js',
  'src/ui/dom.js',
  'src/ui/icons.js',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-192-maskable.png',
  'assets/icons/icon-512-maskable.png',
  'assets/mascot/avatar.png',
  'assets/mascot/card_main.png',
  'assets/mascot/empty.png',
  'assets/mascot/finish.png',
  'assets/mascot/tile_exercises.png',
  'assets/mascot/tile_program.png',
  'assets/mascot/tile_stats.png',
  'assets/map/base_front.png',
  'assets/map/base_back.png',
  'assets/map/zones/front_chest.png',
  'assets/map/zones/front_delts.png',
  'assets/map/zones/front_biceps.png',
  'assets/map/zones/front_forearms.png',
  'assets/map/zones/front_abs.png',
  'assets/map/zones/front_quads.png',
  'assets/map/zones/back_delts.png',
  'assets/map/zones/back_traps.png',
  'assets/map/zones/back_lats.png',
  'assets/map/zones/back_triceps.png',
  'assets/map/zones/back_lower_back.png',
  'assets/map/zones/back_glutes.png',
  'assets/map/zones/back_hamstrings.png',
  'assets/map/zones/back_calves.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(SHELL.map((path) => new Request(new URL(path, SCOPE), { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    // Первая установка: страница, которая её запустила, сразу получает работу без сети.
    // При обновлении окон прежней версии к этому моменту уже нет, так что захватывать некого
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(SCOPE)) return;   // чужие адреса не трогаем
  if (request.url.startsWith(TOOLS)) return;    // страницы проверок из сети
  event.respondWith(respond(event));
});

async function respond(event) {
  const { request } = event;
  if (event.clientId) {
    const client = await self.clients.get(event.clientId);
    if (client && client.url.startsWith(TOOLS)) return fetch(request);
  }
  const cache = await caches.open(CACHE);
  if (request.mode === 'navigate' && isShellPage(request.url)) {
    return (await cache.match(SHELL_PAGE)) ?? fetch(request);
  }
  const hit = await cache.match(request);
  if (hit) return hit;
  // Файла нет в кэше: берём из сети и запоминаем, чтобы в следующий раз он был и без сети
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

// Корень приложения и index.html с любыми параметрами: запуск с домашнего экрана, обновление страницы
function isShellPage(url) {
  const path = new URL(url).pathname;
  const root = new URL(SCOPE).pathname;
  return path === root || path === `${root}index.html`;
}
