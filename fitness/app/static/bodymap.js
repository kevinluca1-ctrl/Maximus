// Körperkarte (SVG, Vorder- und Rückansicht) als Platzhalter für Übungsbilder,
// Muskelerholung und Wochenübersicht. Werte 0..1 je Muskel färben von grau nach rot.

const E = (m, cx, cy, rx, ry, rot = 0) => ({ m, t: 'e', cx, cy, rx, ry, rot });
const R = (m, x, y, w, h, r = 3) => ({ m, t: 'r', x, y, w, h, r });
const P = (m, d) => ({ m, t: 'p', d });
const sym = (f) => [f(1), f(-1)];
const X = (s, dx) => 60 + s * dx;

// Grundsilhouette (beide Ansichten)
const BASE = `
  <ellipse cx="60" cy="17" rx="10.5" ry="12.5"/>
  <rect x="54" y="27" width="12" height="10" rx="3"/>
  <path d="M37,40 Q60,33 83,40 L87,60 Q85,94 80,110 L40,110 Q35,94 33,60 Z"/>
  <path d="M40,106 L80,106 Q86,124 79,136 L41,136 Q34,124 40,106 Z"/>
  ${[1, -1].map((s) => `
    <path d="M${X(s, 26)},44 L${X(s, 35)},93" stroke-width="13" class="limb"/>
    <path d="M${X(s, 35)},93 L${X(s, 41)},128" stroke-width="10.5" class="limb"/>
    <ellipse cx="${X(s, 42)}" cy="136" rx="5" ry="7"/>
    <path d="M${X(s, 12)},128 L${X(s, 15)},182" stroke-width="22" class="limb"/>
    <path d="M${X(s, 15)},184 L${X(s, 16)},232" stroke-width="14" class="limb"/>
    <ellipse cx="${X(s, 17)}" cy="241" rx="6.5" ry="4.5"/>`).join('')}`;

const FRONT = [
  ...sym((s) => E('traps', X(s, 12), 38, 8, 3.5, -s * 25)),
  ...sym((s) => E('front_delt', X(s, 25), 50, 7, 10, s * 10)),
  ...sym((s) => E('side_delt', X(s, 32), 49, 4.5, 9, s * 12)),
  ...sym((s) => E('chest_upper', X(s, 12), 48, 11.5, 4.5, s * 4)),
  ...sym((s) => E('chest', X(s, 12), 59, 12.5, 8.5, s * 4)),
  ...sym((s) => E('biceps', X(s, 32), 76, 5.5, 13, s * 10)),
  ...sym((s) => E('forearms', X(s, 38), 108, 5, 15, s * 9)),
  ...[70, 80.5, 91, 101.5].flatMap((y, i) => sym((s) => R('abs', s > 0 ? 61 : 50, y, 9, i === 3 ? 12 : 9.5))),
  ...sym((s) => E('obliques', X(s, 20), 92, 5.5, 14, -s * 8)),
  ...sym((s) => E('quads', X(s, 15), 152, 9.5, 26, -s * 4)),
  ...sym((s) => E('quads', X(s, 8.5), 172, 4.5, 8, 0)),
  ...sym((s) => E('adductors', X(s, 5.5), 140, 3.5, 14, 0)),
  ...sym((s) => E('calves', X(s, 18.5), 204, 4.5, 15, -s * 3)),
];
const BACK = [
  P('traps', 'M60,30 L79,43 L66,62 L60,90 L54,62 L41,43 Z'),
  ...sym((s) => E('rear_delt', X(s, 27), 50, 7.5, 9, s * 10)),
  ...sym((s) => E('side_delt', X(s, 33), 49, 4.5, 9, s * 12)),
  ...sym((s) => E('rhomboids', X(s, 9), 60, 5, 9, -s * 10)),
  ...sym((s) => E('lats', X(s, 19), 79, 9.5, 20, s * 14)),
  ...sym((s) => E('triceps', X(s, 33), 76, 6, 14, s * 10)),
  ...sym((s) => E('forearms', X(s, 38), 108, 5, 15, s * 9)),
  ...sym((s) => R('lower_back', s > 0 ? 61 : 52, 89, 7, 21, 3.5)),
  ...sym((s) => E('glute_med', X(s, 20), 115, 7, 7.5, s * 15)),
  ...sym((s) => E('glutes', X(s, 11), 127, 11, 11.5, 0)),
  ...sym((s) => E('hamstrings', X(s, 14), 162, 9, 23, -s * 3)),
  ...sym((s) => E('adductors', X(s, 5), 150, 3, 11, 0)),
  ...sym((s) => E('calves', X(s, 12.5), 200, 5.5, 16, 0)),
  ...sym((s) => E('calves', X(s, 19), 201, 5, 15, 0)),
];

const BACK_MUSCLES = new Set(['rear_delt', 'rhomboids', 'lats', 'triceps', 'lower_back', 'glute_med', 'glutes', 'hamstrings', 'calves']);

function shape(sh, fill) {
  const a = `fill="${fill}" class="mus"`;
  if (sh.t === 'e') return `<ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" transform="rotate(${sh.rot} ${sh.cx} ${sh.cy})" ${a}/>`;
  if (sh.t === 'r') return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" rx="${sh.r}" ${a}/>`;
  return `<path d="${sh.d}" ${a}/>`;
}
// Wert 0..1 -> Farbe
function color(v) {
  if (!v) return 'var(--bm-idle)';
  const t = Math.min(1, v);
  return `color-mix(in srgb, #e0242b ${Math.round(35 + 65 * t)}%, var(--bm-idle))`;
}
function figure(shapes, values) {
  return `<svg viewBox="0 0 120 252" class="bm"><g class="bm-base">${BASE}</g>${shapes.map((sh) => shape(sh, color(values[sh.m]))).join('')}</svg>`;
}
// values: {muskel: 0..1}; view: 'both' | 'front' | 'back' | 'auto'
export function bodyMap(values = {}, view = 'both') {
  if (view === 'auto') {
    const keys = Object.keys(values).filter((k) => values[k] >= 1);
    const back = keys.filter((k) => BACK_MUSCLES.has(k)).length;
    view = back > keys.length - back ? 'back' : 'front';
  }
  const parts = [];
  if (view !== 'back') parts.push(figure(FRONT, values));
  if (view !== 'front') parts.push(figure(BACK, values));
  return `<div class="bodymap ${view}">${parts.join('')}</div>`;
}
export const exerciseValues = (ex) => Object.fromEntries([...(ex?.muscles?.secondary || []).map((m) => [m, 0.45]), ...(ex?.muscles?.primary || []).map((m) => [m, 1])]);
