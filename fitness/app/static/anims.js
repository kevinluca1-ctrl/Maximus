// Animationsdefinitionen je Übung.
// Koordinaten in Metern, y = oben, Figur schaut nach +z, +x = linke Körperseite.
// keys: Posen bei t (0 = Start, 1 = Endposition). Rechte Seite wird gespiegelt, wenn nicht angegeben.
// hL/hR = Handziel, eL/eR = Ellbogen-Richtung, fL/fR = Fußziel, kL/kR = Knie-Richtung.
// view = Blickrichtung der Startkamera.

// ---------- Bausteine für Geräte ----------
// Steckgewicht-Turm: Rahmen, Führungsstangen, Gewichtsplatten, beweglicher Block
export function stackTower(x, z, H = 2.1, travel = 0.3) {
  return [
    { type: 'box', pos: [x, 0.025, z], size: [0.56, 0.05, 0.4] },
    { type: 'box', pos: [x + 0.22, H / 2, z], size: [0.06, H, 0.06] },
    { type: 'box', pos: [x - 0.22, H / 2, z], size: [0.06, H, 0.06] },
    { type: 'box', pos: [x, H, z], size: [0.5, 0.07, 0.12] },
    { type: 'cyl', from: [x + 0.09, 0.05, z], to: [x + 0.09, H - 0.04, z], r: 0.011, mat: 'metal' },
    { type: 'cyl', from: [x - 0.09, 0.05, z], to: [x - 0.09, H - 0.04, z], r: 0.011, mat: 'metal' },
    { type: 'box', pos: [x, 0.3, z], size: [0.3, 0.46, 0.13], mat: 'metal' },
    { type: 'box', pos: [x, 0.6, z], size: [0.3, 0.14, 0.13], mat: 'metal', travel, top: true },
    { type: 'pulley', pos: [x, H - 0.1, z], r: 0.05, rot: [0, 0, 90] },
  ];
}
// Sitz mit Pfosten und Bodenrahmen Richtung Turm
function seat(towerZ, h = 0.46) {
  return [
    { type: 'box', pos: [0, h, 0.02], size: [0.4, 0.09, 0.4], mat: 'pad', round: 0.03 },
    { type: 'box', pos: [0, (h - 0.04) / 2, 0], size: [0.07, h - 0.04, 0.07] },
    { type: 'box', pos: [0, 0.025, towerZ / 2], size: [0.08, 0.05, Math.abs(towerZ) + 0.3] },
    { type: 'box', pos: [0, 0.025, 0], size: [0.5, 0.05, 0.08] },
  ];
}
const SEATED_LEGS = { root: [0, 0.7, 0], fL: [0.15, 0.06, 0.52], kL: [0.1, 1, 1] };

export const ANIMS = {
  // Brustpresse (Steckgewicht, Hebelarme mit hohem Drehpunkt vor dem Körper)
  chest_press: {
    view: [1, 0.3, 1.1],
    grip: { axis: [0, 1, 0], palm: [-1, 0, 0] }, // Neutralgriff, Handflächen zueinander
    props: [
      ...seat(-0.62),
      ...stackTower(0, -0.62, 2.1),
      { type: 'box', pos: [0, 0.95, -0.17], size: [0.4, 0.72, 0.09], rot: [-8, 0, 0], mat: 'pad', round: 0.04 },
      { type: 'box', pos: [0, 0.9, -0.24], size: [0.08, 0.8, 0.05], rot: [-8, 0, 0] },
      { type: 'box', pos: [0, 2.08, -0.2], size: [0.08, 0.08, 0.9] },
      { type: 'box', pos: [0, 2.0, 0.2], size: [0.08, 0.14, 0.08] },
      { type: 'cyl', from: [-0.42, 1.95, 0.2], to: [0.42, 1.95, 0.2], r: 0.03, mat: 'metal' },
      { type: 'lever', from: [0.38, 1.95, 0.2], to: { at: 'hL', off: [0.1, 0.09, 0] }, r: 0.026 },
      { type: 'lever', from: [-0.38, 1.95, 0.2], to: { at: 'hR', off: [-0.1, 0.09, 0] }, r: 0.026 },
      // C-förmiger Griffbügel: oben und unten am Griff befestigt, Hand bleibt frei
      ...[1, -1].flatMap((s) => {
        const h = s > 0 ? 'hL' : 'hR';
        return [
          { type: 'link', a: { at: h, off: [0.1 * s, 0.09, 0] }, b: { at: h, off: [0.1 * s, -0.09, 0] }, r: 0.016 },
          { type: 'link', a: { at: h, off: [0.1 * s, 0.09, 0] }, b: { at: h, off: [0, 0.09, 0] }, r: 0.016 },
          { type: 'link', a: { at: h, off: [0.1 * s, -0.09, 0] }, b: { at: h, off: [0, -0.09, 0] }, r: 0.016 },
          { type: 'link', a: { at: h, off: [0, 0.095, 0] }, b: { at: h, off: [0, -0.095, 0] }, r: 0.013, mat: 'metal' },
        ];
      }),
      { type: 'handle', at: 'hL', axis: [0, 1, 0] },
      { type: 'handle', at: 'hR', axis: [0, 1, 0] },
      { type: 'cable', from: [0, 1.95, 0.2], via: [[0, 2.0, -0.62]], to: 'stack' },
    ],
    keys: [
      { t: 0, ...SEATED_LEGS, chestPitch: -8, hL: [0.25, 1.14, 0.04], eL: [1, -0.25, -1] },
      { t: 1, ...SEATED_LEGS, chestPitch: -8, hL: [0.14, 1.16, 0.56], eL: [1, -0.6, -0.4] },
    ],
  },

  // Latzug (Turm vor dem Körper, Kabel über Umlenkrollen zum Gewichtsblock)
  lat_pulldown_wide: {
    view: [-0.8, 0.3, -1],
    grip: { axis: 'bar', palm: [0, 0, 1] }, // Obergriff, Handflächen nach vorne
    props: [
      ...seat(0.78),
      ...stackTower(0, 0.78, 2.4),
      { type: 'box', pos: [0, 2.38, 0.44], size: [0.08, 0.08, 0.72] },
      { type: 'pulley', pos: [0, 2.3, 0.12], r: 0.05, rot: [0, 0, 90] },
      { type: 'cyl', from: [-0.22, 0.81, 0.36], to: [0.22, 0.81, 0.36], r: 0.055, mat: 'pad' },
      { type: 'box', pos: [0, 0.42, 0.43], size: [0.05, 0.76, 0.05] },
      { type: 'box', pos: [0, 0.81, 0.43], size: [0.05, 0.05, 0.14] },
      { type: 'cable', from: 'hM', via: [[0, 2.26, 0.12], [0, 2.26, 0.78]], to: 'stack' },
      { type: 'bar', a: 'hL', b: 'hR', extend: 0.2 },
    ],
    keys: [
      { t: 0, ...SEATED_LEGS, chestPitch: -6, hL: [0.4, 1.78, 0.12], eL: [1, 0.1, 0] },
      { t: 1, ...SEATED_LEGS, chestPitch: -16, hL: [0.3, 1.25, 0.16], eL: [1, -1, -0.7] },
    ],
  },
};
