// Kleine SVG-Diagramme ohne Bibliothek: Linie, Balken, Radar.
const n = (v) => (Math.round(v * 10) / 10).toLocaleString('de-DE');

export function lineChart(points, { unit = '', h = 170 } = {}) {
  if (!points.length) return '<p class="empty">Noch keine Daten.</p>';
  const W = 340, H = h, L = 36, B = 22, T = 10, Rr = 10;
  const xs = points.map((p) => +new Date(p.x)), ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.1); y0 -= pad; y1 += pad; y0 = Math.max(0, y0);
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - Rr), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0, (y0 + y1) / 2, y1];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(+new Date(p.x)).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const d = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${L - 4}" y="${Y(t) + 3}" text-anchor="end">${n(t)}</text>`).join('')}
    <path d="${path}" class="ln"/>
    ${points.map((p) => `<circle cx="${X(+new Date(p.x))}" cy="${Y(p.y)}" r="3" class="dot"><title>${d(p.x)}: ${n(p.y)} ${unit}</title></circle>`).join('')}
    <text x="${L}" y="${H - 5}">${d(x0)}</text><text x="${W - Rr}" y="${H - 5}" text-anchor="end">${d(x1)}</text>
  </svg>`;
}

export function barChart(labels, values, { h = 150 } = {}) {
  const W = 340, H = h, B = 22, T = 14, L = 6;
  const max = Math.max(1, ...values), bw = (W - L * 2) / values.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    ${values.map((v, i) => {
      const bh = (v / max) * (H - T - B), x = L + i * bw + bw * 0.18;
      return `<rect x="${x}" y="${H - B - bh}" width="${bw * 0.64}" height="${Math.max(bh, v ? 2 : 0)}" rx="3" class="bar ${i === values.length - 1 ? 'cur' : ''}"/>
        ${v ? `<text x="${x + bw * 0.32}" y="${H - B - bh - 3}" text-anchor="middle">${v}</text>` : ''}
        ${i % 2 === values.length % 2 ? '' : `<text x="${x + bw * 0.32}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`}`;
    }).join('')}
    <line x1="${L}" x2="${W - L}" y1="${H - B}" y2="${H - B}" class="grid"/>
  </svg>`;
}

export function radarChart(labels, values) {
  const W = 340, H = 300, cx = W / 2, cy = 150, R = 105, N = labels.length;
  const max = Math.max(1, ...values);
  const pt = (i, r) => [cx + r * Math.sin((2 * Math.PI * i) / N), cy - r * Math.cos((2 * Math.PI * i) / N)];
  const ring = (f) => labels.map((_, i) => pt(i, R * f).join(',')).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart radar">
    ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" class="grid"/>`).join('')}
    ${labels.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" class="grid"/>`).join('')}
    <polygon points="${values.map((v, i) => pt(i, (R * v) / max).join(',')).join(' ')}" class="area"/>
    ${labels.map((l, i) => { const [x, y] = pt(i, R + 22); return `<text x="${x}" y="${y + 3}" text-anchor="middle">${l}</text>`; }).join('')}
  </svg>`;
}
