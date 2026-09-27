// VAULT-TEC GYM · установка и работа без сети
// Регистрирует sw.js по постоянному адресу. Версия кэша записана в самом sw.js и равна APP_VERSION
// из store.js: браузер при запуске сравнивает sw.js с сервером, новая версия ставит новый воркер
// и новый кэш, старый удаляется при следующем запуске. Схема обновления описана в начале sw.js.

import { APP_VERSION } from './store.js';

export const SW_URL = 'sw.js';
export const cacheName = (version = APP_VERSION) => `vtg-shell-${version}`;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register(SW_URL).catch((err) => {
    // Без сети браузер не может проверить обновление воркера, это не ошибка:
    // приложением продолжает управлять уже установленный воркер
    if (navigator.onLine) console.warn('Service worker не зарегистрирован:', err);
  });
  // После загрузки страницы: установка скачивает все файлы и не должна спорить с первой отрисовкой
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

// Состояние для экрана настроек
//   offline: 'ready' эта версия приложения работает без сети, 'pending' файлы ещё скачиваются,
//            'unsupported' браузер не умеет service worker
//   updateReady: новая версия скачана и применится после полного перезапуска приложения
export async function pwaStatus() {
  if (!('serviceWorker' in navigator) || !('caches' in self)) return { offline: 'unsupported', updateReady: false };
  const [reg, cached] = await Promise.all([navigator.serviceWorker.getRegistration(), caches.has(cacheName())]);
  const ready = !!navigator.serviceWorker.controller && cached;
  return { offline: ready ? 'ready' : 'pending', updateReady: !!reg?.waiting };
}
