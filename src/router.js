// VAULT-TEC GYM · роутер по хешу
// Адрес вида #/history/42. Шаблон маршрута: 'history/:id'.

const routes = [];
let fallback = null;

export function route(pattern, screen) {
  const keys = [];
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ regex: new RegExp(`^${source}$`), keys, screen });
}

export function otherwise(screen) {
  fallback = screen;
}

export function currentPath() {
  return location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
}

function match(path) {
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
      return { screen: r.screen, params };
    }
  }
  return fallback ? { screen: fallback, params: {} } : null;
}

export function go(path) {
  location.hash = `#/${path}`;
}

export function start(render) {
  const handle = () => {
    const found = match(currentPath());
    if (found) render(found.screen, found.params);
  };
  window.addEventListener('hashchange', handle);
  handle();
}
