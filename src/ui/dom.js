// VAULT-TEC GYM · сборка элементов
// h('button', { class: 'btn', onclick: fn, text: 'Начать' }, ...дети)
// Атрибуты со значением null, undefined и false пропускаются, true ставит пустой атрибут.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}

// Склонение живёт в логике, здесь для удобства экранов
export { plural } from '../logic.js';
