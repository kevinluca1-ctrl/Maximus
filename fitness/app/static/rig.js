// Gemeinsame Rig-Mathematik für Viewer und Körper-Generator.
// Koordinaten in Metern, y = oben, Figur schaut nach +z, +x = linke Körperseite.
import * as THREE from './vendor/three.module.min.js';

export const D = THREE.MathUtils.degToRad;
export const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const UP = new THREE.Vector3(0, 1, 0);

// Körpermaße, ca. 1,87 m
export const L = {
  waist: 0.22, chest: 0.32, neck: 0.075, head: 0.125,
  shoulderX: 0.185, shoulderY: -0.035, hipX: 0.095, hipY: -0.06,
  upperArm: 0.31, foreArm: 0.32, wrist: 0.245, thigh: 0.46, shin: 0.46,
};

export const MUSCLE_KEYS = ['chest', 'chest_upper', 'front_delt', 'side_delt', 'rear_delt', 'triceps', 'biceps', 'forearms',
  'lats', 'traps', 'rhomboids', 'lower_back', 'abs', 'obliques', 'glutes', 'glute_med', 'quads', 'hamstrings', 'adductors', 'calves'];

export function perp(v, axis) {
  const p = v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1).sub(axis.clone().multiplyScalar(axis.z));
  return p.normalize();
}
function ik2(S, T, a, b, poleDir) {
  const d0 = T.clone().sub(S);
  let d = d0.length();
  const dir = d0.clone().normalize();
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const n = perp(poleDir.clone(), dir);
  return [S.clone().addScaledVector(dir, a * cosA).addScaledVector(n, a * sinA), S.clone().addScaledVector(dir, d)];
}
const ease = (t) => t * t * (3 - 2 * t);
const lerpVal = (a, b, t) => (Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * t) : a + (b - a) * t);
const mirror = (v) => (v ? [-v[0], v[1], v[2]] : v);

export const DEFAULT_POSE = {
  root: [0, 0.98, 0], yaw: 0, pelvisPitch: 0, chestPitch: 0, twist: 0, side: 0, headPitch: 0,
  hL: [0.22, 0.62, 0.02], eL: [0.3, 0, -1], fL: [0.11, 0.06, 0.05], kL: [0, 0, 1],
};
// Ruhepose für das Modell (leichte A-Haltung)
export const BIND_POSE = { root: [0, 0.98, 0], hL: [0.645, 1.1, 0.02], eL: [0.15, 0, -1], fL: [0.12, 0.06, 0.02], kL: [0, 0, 1] };

export function completePose(p) {
  const q = { ...DEFAULT_POSE, ...p };
  if (!p.hR) q.hR = mirror(q.hL);
  if (!p.eR) q.eR = mirror(q.eL);
  if (!p.fR) q.fR = mirror(q.fL);
  if (!p.kR) q.kR = mirror(q.kL);
  return q;
}
export function samplePose(keys, t) {
  const ks = keys.map((k) => ({ t: k.t, p: completePose(k) }));
  if (t <= ks[0].t) return ks[0].p;
  for (let i = 0; i < ks.length - 1; i++) {
    const A = ks[i], B = ks[i + 1];
    if (t <= B.t) {
      const u = ease((t - A.t) / (B.t - A.t));
      const out = {};
      for (const k of Object.keys(A.p)) out[k] = lerpVal(A.p[k], B.p[k], u);
      return out;
    }
  }
  return ks[ks.length - 1].p;
}

export function solve(p) {
  const qBody = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, D(p.yaw), 0));
  const qPelvis = qBody.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(D(p.pelvisPitch), 0, 0)));
  const qChest = qPelvis.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(D(p.chestPitch), D(p.twist), D(p.side), 'XYZ')));
  const qHead = qChest.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(D(p.headPitch), 0, 0)));
  const root = V(p.root);
  const at = (base, q, v) => base.clone().add(new THREE.Vector3(...v).applyQuaternion(q));
  const waist = at(root, qPelvis, [0, L.waist, 0]);
  const chestTop = at(waist, qChest, [0, L.chest, 0]);
  const neck = at(chestTop, qChest, [0, L.neck, 0]);
  const head = at(neck, qHead, [0, L.head * 0.75, 0.015]);
  const sL = at(chestTop, qChest, [L.shoulderX, L.shoulderY, -0.005]);
  const sR = at(chestTop, qChest, [-L.shoulderX, L.shoulderY, -0.005]);
  const hipL = at(root, qPelvis, [L.hipX, L.hipY, 0]);
  const hipR = at(root, qPelvis, [-L.hipX, L.hipY, 0]);
  const [eL, wL] = ik2(sL, V(p.hL), L.upperArm, L.foreArm, V(p.eL));
  const [eR, wR] = ik2(sR, V(p.hR), L.upperArm, L.foreArm, V(p.eR));
  const [kL, aL] = ik2(hipL, V(p.fL), L.thigh, L.shin, V(p.kL));
  const [kR, aR] = ik2(hipR, V(p.fR), L.thigh, L.shin, V(p.kR));
  const J = { qBody, qPelvis, qChest, qHead, root, waist, chestTop, neck, head, sL, sR, eL, eR, wL, wR, hipL, hipR, kL, kR, aL, aR,
    poleEL: V(p.eL), poleER: V(p.eR), poleKL: V(p.kL), poleKR: V(p.kR) };
  // Handgelenk (Griffpunkt w liegt in der Handmitte)
  J.xL = eL.clone().lerp(wL, L.wrist / L.foreArm); J.xR = eR.clone().lerp(wR, L.wrist / L.foreArm);
  return J;
}

// Lokales Achsensystem eines Gliedmaßensegments: sv (seitlich), u (entlang), f (vorne)
export function limbFrame(J, side, seg) {
  let A, B, pole, sign;
  if (seg === 'upperArm') { A = J['s' + side]; B = J['e' + side]; pole = J['poleE' + side]; sign = -1; }
  else if (seg === 'foreArm') { A = J['e' + side]; B = J['w' + side]; pole = J['poleE' + side]; sign = -1; }
  else if (seg === 'thigh') { A = J['hip' + side]; B = J['k' + side]; pole = J['poleK' + side]; sign = 1; }
  else { A = J['k' + side]; B = J['a' + side]; pole = J['poleK' + side]; sign = 1; }
  const d = B.clone().sub(A); const len = d.length(); const u = d.clone().normalize();
  const f = perp(pole.clone().multiplyScalar(sign), u);
  const sv = u.clone().cross(f).normalize();
  return { A, B, len, u, f, sv };
}
export function footFrame(J, side) {
  const a = J['a' + side], k = J['k' + side];
  const shin = a.clone().sub(k).normalize();
  const fwd = perp(J['poleK' + side].clone(), shin);
  const m = new THREE.Matrix4().makeBasis(fwd.clone().cross(shin).normalize(), shin.clone().negate(), fwd);
  return { pos: a, quat: new THREE.Quaternion().setFromRotationMatrix(m), fwd, shin };
}

// Knochen für das Skinning
export const BONES = ['pelvis', 'chest', 'head', 'upperArmL', 'foreArmL', 'upperArmR', 'foreArmR', 'thighL', 'shinL', 'thighR', 'shinR', 'footL', 'footR'];
export const BONE_PARENT = { chest: 'pelvis', head: 'chest', upperArmL: 'chest', upperArmR: 'chest', foreArmL: 'upperArmL', foreArmR: 'upperArmR',
  thighL: 'pelvis', thighR: 'pelvis', shinL: 'thighL', shinR: 'thighR', footL: 'shinL', footR: 'shinR' };

export function boneTransforms(J) {
  const out = {};
  out.pelvis = { pos: J.root.clone(), quat: J.qPelvis.clone() };
  out.chest = { pos: J.waist.clone(), quat: J.qChest.clone() };
  out.head = { pos: J.neck.clone(), quat: J.qHead.clone() };
  for (const side of ['L', 'R']) {
    for (const seg of ['upperArm', 'foreArm', 'thigh', 'shin']) {
      const fr = limbFrame(J, side, seg);
      const m = new THREE.Matrix4().makeBasis(fr.sv, fr.u, fr.f);
      out[seg + side] = { pos: fr.A.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
    }
    const ff = footFrame(J, side);
    out['foot' + side] = { pos: ff.pos.clone(), quat: ff.quat };
  }
  return out;
}

// ---------- Muskeln (Ellipsoide) ----------
// Rumpf: [muskel, frame, pos, radii, rotation(deg), symmetrisch]
export const TORSO_MUSCLES = [
  // Brust: Fächer aus drei Anteilen, um den Brustkorb gewölbt
  ['chest', 'chest', [0.07, -0.128, 0.083], [0.078, 0.05, 0.026], [0, 14, -8], true],
  ['chest', 'chest', [0.125, -0.105, 0.066], [0.055, 0.042, 0.028], [0, 32, -32], true],
  ['chest_upper', 'chest', [0.072, -0.068, 0.075], [0.078, 0.03, 0.024], [0, 14, -16], true],
  ['detail', 'chest', [0.095, -0.018, 0.058], [0.085, 0.011, 0.012], [0, 14, 8], true], // Schlüsselbein
  // Nacken und Rücken
  ['traps', 'chest', [0.078, 0.02, -0.035], [0.085, 0.028, 0.034], [0, 0, 24], true],
  ['traps', 'chest', [0.034, -0.075, -0.088], [0.042, 0.105, 0.02], [0, 0, 10], true],
  ['rhomboids', 'chest', [0.112, -0.105, -0.086], [0.05, 0.045, 0.022], [0, -22, -20], true],
  ['lats', 'chest', [0.138, -0.175, -0.05], [0.04, 0.085, 0.045], [0, -25, 14], true],
  ['lats', 'chest', [0.092, -0.265, -0.078], [0.06, 0.105, 0.024], [0, -14, 24], true],
  ['detail', 'chest', [0.152, -0.2, 0.04], [0.02, 0.022, 0.03], [0, 0, 20], true], // Sägemuskel
  ['detail', 'chest', [0.148, -0.245, 0.048], [0.02, 0.02, 0.028], [0, 0, 20], true],
  // Bauch
  ['abs', 'chest', [0.036, -0.215, 0.077], [0.034, 0.031, 0.016], [0, 0, 0], true],
  ['abs', 'chest', [0.036, -0.283, 0.074], [0.034, 0.032, 0.016], [0, 0, 0], true],
  ['abs', 'pelvis', [0.035, 0.15, 0.077], [0.033, 0.033, 0.016], [0, 0, 0], true],
  ['abs', 'pelvis', [0.032, 0.058, 0.078], [0.03, 0.055, 0.015], [0, 0, 0], true],
  ['obliques', 'pelvis', [0.106, 0.14, 0.036], [0.03, 0.09, 0.05], [0, 0, -10], true],
  ['lower_back', 'pelvis', [0.036, 0.14, -0.084], [0.027, 0.125, 0.022], [0, 0, 0], true],
  ['glutes', 'pelvis', [0.072, -0.062, -0.088], [0.076, 0.085, 0.058], [0, 0, 8], true],
  ['glute_med', 'pelvis', [0.132, 0.015, -0.03], [0.04, 0.055, 0.05], [0, 0, 10], true],
];
// Gliedmaßen: [muskel, segment, t, frontOffset, lateralOffset, radii(lat, länge-anteil, front)]
export const LIMB_MUSCLES = [
  ['front_delt', 'upperArm', 0.12, 0.03, 0.006, [0.034, 0.36, 0.03]],
  ['side_delt', 'upperArm', 0.12, 0.0, 0.034, [0.03, 0.4, 0.036]],
  ['rear_delt', 'upperArm', 0.12, -0.03, 0.006, [0.034, 0.34, 0.03]],
  ['biceps', 'upperArm', 0.55, 0.027, -0.002, [0.029, 0.52, 0.03]],
  ['triceps', 'upperArm', 0.42, -0.03, -0.01, [0.026, 0.6, 0.028]],
  ['triceps', 'upperArm', 0.4, -0.02, 0.024, [0.021, 0.5, 0.024]],
  ['forearms', 'foreArm', 0.2, 0.012, 0.018, [0.021, 0.5, 0.022]],
  ['forearms', 'foreArm', 0.24, -0.004, -0.017, [0.023, 0.5, 0.024]],
  ['forearms', 'foreArm', 0.25, -0.02, 0.008, [0.019, 0.45, 0.019]],
  ['quads', 'thigh', 0.45, 0.05, 0.0, [0.033, 0.74, 0.03]],
  ['quads', 'thigh', 0.5, 0.022, 0.047, [0.033, 0.72, 0.038]],
  ['quads', 'thigh', 0.78, 0.03, -0.037, [0.03, 0.3, 0.03]],
  ['detail', 'thigh', 1.0, 0.044, 0.0, [0.025, 0.11, 0.018]], // Kniescheibe
  ['hamstrings', 'thigh', 0.5, -0.046, 0.021, [0.03, 0.72, 0.032]],
  ['hamstrings', 'thigh', 0.48, -0.043, -0.023, [0.031, 0.72, 0.032]],
  ['adductors', 'thigh', 0.28, 0.0, -0.05, [0.032, 0.5, 0.042]],
  ['calves', 'shin', 0.24, -0.031, -0.016, [0.025, 0.36, 0.029]],
  ['calves', 'shin', 0.22, -0.031, 0.015, [0.023, 0.32, 0.026]],
  ['calves', 'shin', 0.47, -0.02, 0.0, [0.028, 0.34, 0.02]],
  ['detail', 'shin', 0.3, 0.024, 0.014, [0.015, 0.5, 0.015]], // vorderer Schienbeinmuskel
];

export function muscleEllipsoids(J) {
  const out = [];
  const D2 = (a) => D(a);
  for (const [mus, frame, pos, rad, rot, sym] of TORSO_MUSCLES) {
    for (const sign of sym ? [1, -1] : [1]) {
      const q = frame === 'chest' ? J.qChest : J.qPelvis;
      const base = frame === 'chest' ? J.chestTop : J.root;
      const qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(D2(rot[0]), D2(rot[1] * sign), D2(rot[2] * sign)));
      out.push({ muscle: mus, bone: frame, center: base.clone().add(new THREE.Vector3(pos[0] * sign, pos[1], pos[2]).applyQuaternion(q)),
        quat: q.clone().multiply(qr), radii: rad.slice() });
    }
  }
  for (const side of ['L', 'R']) {
    for (const [mus, seg, t, fo, lo, rad] of LIMB_MUSCLES) {
      const fr = limbFrame(J, side, seg);
      const lat = side === 'L' ? -1 : 1;
      const c = fr.A.clone().addScaledVector(fr.u, fr.len * t).addScaledVector(fr.f, fo).addScaledVector(fr.sv, lo * lat);
      const m = new THREE.Matrix4().makeBasis(fr.sv, fr.u, fr.f);
      out.push({ muscle: mus, bone: seg + side, center: c, quat: new THREE.Quaternion().setFromRotationMatrix(m),
        radii: [rad[0], (rad[1] * fr.len) / 2, rad[2]] });
    }
  }
  return out;
}
