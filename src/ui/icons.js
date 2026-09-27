// VAULT-TEC GYM · иконки, нарисованы вручную, сетка 24 на 24, обводка цветом текста

// Шестерёнка: восемь трапециевидных зубцов вокруг центра и круглое отверстие
function gear() {
  const teeth = 8;
  const steps = teeth * 4;
  const points = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 < 2 ? 10 : 7.5;
    points.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${points.join('L')}Z"/><circle cx="12" cy="12" r="3.2"/>`;
}

const PATHS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  settings: gear(),
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>'
};

export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon icon--${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
  return t.content.firstChild;
}
