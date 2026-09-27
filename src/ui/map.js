// VAULT-TEC GYM · мышечная карта
// База с прозрачным фоном, зона это белая фигура на прозрачном фоне: зона красится акцентом
// через mask-image по альфа каналу. Основные группы ярко, вспомогательные приглушены.

import { MAP_ZONE, MUSCLES } from '../data.js';
import { h } from './dom.js';

const zonesOf = (groups, view) =>
  [...new Set(groups.map((m) => MAP_ZONE[m]).filter((z) => z && z.startsWith(view)))];

// Полный адрес: url() в переменной считался бы от файла стилей, а не от страницы
const zoneUrl = (z) => `url("${new URL(`assets/map/zones/${z}.png`, document.baseURI).href}")`;

export function mapView(view, primaryGroups, secondaryGroups, label, fluid = false) {
  const primary = zonesOf(primaryGroups, view);
  const secondary = zonesOf(secondaryGroups, view).filter((z) => !primary.includes(z));
  const zone = (z, isSecondary) => h('span', {
    class: `map__zone${isSecondary ? ' map__zone--secondary' : ''}`,
    style: { '--zone': zoneUrl(z) }
  });
  return h('div', { class: `map${fluid ? ' map--fluid' : ''}`, role: 'img', 'aria-label': label },
    h('img', { class: 'map__base', src: `assets/map/base_${view}.png`, alt: '' }),
    secondary.map((z) => zone(z, true)),
    primary.map((z) => zone(z, false)));
}

// Карта упражнения: вид, на котором основная группа
export function muscleMap(ex) {
  const first = MAP_ZONE[ex.primary[0]];
  const view = first?.startsWith('back') ? 'back' : 'front';
  const label = [
    `Основная группа: ${ex.primary.map((m) => MUSCLES[m]).join(', ')}`,
    ex.secondary?.length ? `вспомогательные: ${ex.secondary.map((m) => MUSCLES[m]).join(', ')}` : null
  ].filter(Boolean).join('; ');
  return mapView(view, ex.primary, ex.secondary ?? [], label);
}

// Два вида рядом: проработанные группы тренировки
export function bodyMaps(primaryGroups, secondaryGroups) {
  const label = [
    `Проработаны напрямую: ${primaryGroups.map((m) => MUSCLES[m]).join(', ') || 'нет'}`,
    secondaryGroups.length ? `вспомогательно: ${secondaryGroups.map((m) => MUSCLES[m]).join(', ')}` : null
  ].filter(Boolean).join('; ');
  return h('div', { class: 'maps', role: 'img', 'aria-label': label },
    mapView('front', primaryGroups, secondaryGroups, 'Вид спереди', true),
    mapView('back', primaryGroups, secondaryGroups, 'Вид сзади', true));
}
