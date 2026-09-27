// VAULT-TEC GYM · графики на встроенном SVG, без библиотек
// График рисуется по фактической ширине контейнера, а не масштабируется: так подписи остаются
// в кегле токена --t-small на любой ширине. Подписи оси X прореживаются по их измеренной длине,
// чтобы не наезжать друг на друга. При смене ширины график перерисовывается.
// Цвета и толщины в стилях по токенам, высота, радиус точки берутся из токенов.

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

function token(name) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

// Круглые шаги шкалы: 1, 2, 2.5, 5 на порядок
function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// Данные без отрицательных значений (вес, максимум, тоннаж, число тренировок) не опускают ось ниже нуля:
// ни при единственной точке, где шкала раздвигается вокруг значения, ни при округлении шага.
// Единственное значение получает шкалу шириной 2: шаг выходит целым, и подписи, округлённые
// до целых, не повторяются (при нуле 0, 1, 2, а не 0, 0,5, 1)
export function scaleY(values, zeroBased) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  const floor = min >= 0 ? 0 : -Infinity;
  if (zeroBased) min = 0;
  if (min === max) { min = zeroBased ? 0 : Math.max(floor, min - 1); max = min + 2; }
  const step = niceStep(max - min, 3);
  const lo = Math.max(floor, Math.floor(min / step) * step);
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

// Подписи X по порядку, пропуская те, что не помещаются. Последняя подпись важнее предпоследних.
// Прореживание с конца: последняя подпись остаётся всегда, при наложении уступает более ранняя.
// Так неполный первый месяц не вытесняет следующий, как на макете 16
function pickLabels(items, gap) {
  const kept = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const next = kept.at(-1);
    if (next && it.right + gap > next.left) continue;
    kept.push(it);
  }
  return kept.reverse();
}

/**
 * Рисует график в контейнер plot.
 * type: 'line' или 'bar'
 * points: [{ x: подпись оси X, y: число }], по порядку
 * yFormat: форматирование подписей оси Y
 * extra: для 'bar' необязательный потолок ряда [{ y }] той же длины, рисуется контуром
 */
function draw(plot, { type, points, yFormat, extra, lastLabel }) {
  const width = Math.floor(plot.clientWidth);
  if (!width) return;
  const height = token('--chart-h');
  const dot = token('--chart-dot');
  const gap = token('--gap-sm');
  plot.replaceChildren();

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'chart__svg', 'aria-hidden': 'true', focusable: 'false' });
  plot.append(root);

  // Точка без значения (y: null) держит место на оси, но столбец не рисуется: будущие недели цикла
  const values = points.map((p) => p.y).concat((extra ?? []).map((p) => p.y)).filter((v) => v != null);
  const { lo, hi, ticks } = scaleY(values, type === 'bar');

  // Ширина подписей Y по факту
  const yLabels = ticks.map((t) => {
    const el = svg('text', { class: 'chart__text', x: 0, y: 0, 'text-anchor': 'end' }, yFormat(t));
    root.append(el);
    return el;
  });
  const yLabelW = Math.max(...yLabels.map((el) => el.getComputedTextLength()));
  const probe = svg('text', { class: 'chart__text', x: 0, y: 0 }, '0');
  root.append(probe);
  const textH = probe.getBBox().height;
  probe.remove();

  const left = Math.ceil(yLabelW) + gap;
  const right = dot + 1;
  const top = Math.ceil(textH / 2) + dot;
  const bottom = Math.ceil(textH) + gap;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const yPos = (v) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  ticks.forEach((t, i) => {
    const y = yPos(t);
    root.insertBefore(svg('line', { class: 'chart__grid', x1: left, x2: width - right, y1: y, y2: y }), root.firstChild);
    yLabels[i].setAttribute('x', left - gap);
    yLabels[i].setAttribute('y', y);
    yLabels[i].setAttribute('dominant-baseline', 'middle');
  });

  const n = points.length;
  let xPos;
  let barW = 0;
  if (type === 'bar') {
    const slot = plotW / n;
    barW = Math.max(dot * 2, Math.min(slot * 0.6, slot - 2));
    xPos = (i) => left + slot * i + slot / 2;
  } else {
    xPos = (i) => (n === 1 ? left + plotW / 2 : left + (plotW * i) / (n - 1));
  }

  if (type === 'bar') {
    points.forEach((p, i) => {
      if (p.y == null) return;
      const x = xPos(i) - barW / 2;
      if (extra?.[i]) {
        const yc = yPos(extra[i].y);
        root.append(svg('rect', { class: 'chart__cap', x, y: yc, width: barW, height: Math.max(0, yPos(lo) - yc) }));
      }
      const y = yPos(p.y);
      root.append(svg('rect', { class: 'chart__bar', x, y, width: barW, height: Math.max(0, yPos(lo) - y), rx: Math.min(dot, barW / 2) }));
    });
  } else {
    if (n > 1) {
      root.append(svg('polyline', { class: 'chart__line', points: points.map((p, i) => `${xPos(i)},${yPos(p.y)}`).join(' ') }));
    }
    points.forEach((p, i) => root.append(svg('circle', { class: 'chart__dot', cx: xPos(i), cy: yPos(p.y), r: dot })));
    // Подпись последнего значения над последней точкой
    if (lastLabel && n) {
      const last = points[n - 1];
      const t = svg('text', { class: 'chart__text chart__text--value', x: xPos(n - 1), y: yPos(last.y) - dot * 2, 'text-anchor': 'end' }, lastLabel(last.y));
      root.append(t);
    }
  }

  // Подписи X: измерить, проредить, поставить
  const baseY = height - gap / 2;
  // Пустая подпись означает, что у точки подписи нет: так подписываются только начала месяцев
  const measured = points.map((p, i) => ({ p, i })).filter(({ p }) => p.x !== '').map(({ p, i }) => {
    const el = svg('text', { class: 'chart__text', x: 0, y: baseY }, p.x);
    root.append(el);
    const w = el.getComputedTextLength();
    let cx = xPos(i);
    const minX = left - Math.min(gap, left);
    cx = Math.min(Math.max(cx, minX + w / 2), width - w / 2);
    return { el, left: cx - w / 2, right: cx + w / 2, cx };
  });
  const kept = new Set(pickLabels(measured, gap));
  for (const m of measured) {
    if (!kept.has(m)) { m.el.remove(); continue; }
    m.el.setAttribute('x', m.cx);
    m.el.setAttribute('text-anchor', 'middle');
  }
}

/**
 * Карточка графика: подпись, последнее значение, сам график.
 * Возвращает { el, dispose }. Данные дублируются таблицей или списком рядом, график для экранного диктора скрыт.
 */
export function chart({ title, unit, valueText, type = 'line', points, yFormat = String, extra, lastLabel, summary }) {
  const plot = document.createElement('div');
  plot.className = 'chart__plot';
  const fig = document.createElement('figure');
  fig.className = 'chart';
  const cap = document.createElement('figcaption');
  cap.className = 'chart__caption';
  const t = document.createElement('span');
  t.className = 'label chart__title';
  t.textContent = title;
  cap.append(t);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'label chart__unit';
    u.textContent = unit;
    cap.append(u);
  }
  if (valueText) {
    const v = document.createElement('span');
    v.className = 'data-line chart__value';
    v.textContent = valueText;
    cap.append(v);
  }
  fig.append(cap, plot);
  // Данные графика словами для экранного диктора: сам рисунок скрыт
  if (summary) {
    const sr = document.createElement('p');
    sr.className = 'visually-hidden';
    sr.textContent = summary;
    fig.append(sr);
  }

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.floor(plot.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    draw(plot, { type, points, yFormat, extra, lastLabel });
  });
  ro.observe(plot);
  return { el: fig, dispose: () => ro.disconnect() };
}
