// Erzeugt das Körpermodell (body.bin + body.json) als eine durchgehende, gehäutete Oberfläche.
// Ablauf: SDF aus glatt verschmolzenen Formen -> Surface Nets -> Projektion auf Oberfläche
// -> Skin-Gewichte je Knochen -> Muskelzuordnung je Vertex.
import fs from 'node:fs';
import * as THREE from '../fitness/app/static/vendor/three.module.min.js';
import { L, BIND_POSE, completePose, solve, limbFrame, footFrame, boneTransforms, muscleEllipsoids, BONES, BONE_PARENT, MUSCLE_KEYS } from '../fitness/app/static/rig.js';

const RES = +(process.argv[2] || 0.0085);
const OUT = new URL('../fitness/app/static/', import.meta.url);

const J = solve(completePose(BIND_POSE));
const at = (base, q, v) => base.clone().add(new THREE.Vector3(...v).applyQuaternion(q));

// ---------- SDF-Primitive ----------
const prims = []; // {f: (x,y,z)=>d, box: Box3, k}
function roundCone(a, b, r1, r2, k = 0.03, group = 'skin') {
  const A = a.clone(), B = b.clone();
  const ba = B.clone().sub(A); const l2 = ba.dot(ba); const rr = r1 - r2; const a2 = l2 - rr * rr; const il2 = 1 / l2;
  const f = (x, y, z) => {
    const pax = x - A.x, pay = y - A.y, paz = z - A.z;
    const yy = pax * ba.x + pay * ba.y + paz * ba.z; const zz = yy - l2;
    const qx = pax * l2 - ba.x * yy, qy = pay * l2 - ba.y * yy, qz = paz * l2 - ba.z * yy;
    const x2 = qx * qx + qy * qy + qz * qz; const y2 = yy * yy * l2; const z2 = zz * zz * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
  const box = new THREE.Box3().setFromPoints([A, B]).expandByScalar(Math.max(r1, r2));
  prims.push({ f, box, k, group });
}
function ellipsoid(c, q, r, k = 0.03, group = 'skin') {
  const qi = q.clone().invert(); const C = c.clone();
  const e = qi.toArray ? new THREE.Matrix4().makeRotationFromQuaternion(qi).elements : null;
  const f = (x, y, z) => {
    const px = x - C.x, py = y - C.y, pz = z - C.z;
    const lx = e[0] * px + e[4] * py + e[8] * pz, ly = e[1] * px + e[5] * py + e[9] * pz, lz = e[2] * px + e[6] * py + e[10] * pz;
    const k0 = Math.hypot(lx / r[0], ly / r[1], lz / r[2]);
    const k1 = Math.hypot(lx / (r[0] * r[0]), ly / (r[1] * r[1]), lz / (r[2] * r[2]));
    return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  };
  const m = Math.max(...r);
  prims.push({ f, box: new THREE.Box3(C.clone().subScalar(m), C.clone().addScalar(m)), k, group });
}

// Gliedmaßen als Folge von Rundkegeln entlang eines Profils
const PROFILES = {
  upperArm: [[0.056, 0], [0.058, 0.15], [0.05, 0.5], [0.043, 0.82], [0.04, 1]],
  foreArm: [[0.041, 0], [0.045, 0.2], [0.037, 0.55], [0.028, 0.92], [0.026, 1]],
  thigh: [[0.086, 0], [0.084, 0.15], [0.072, 0.55], [0.056, 0.9], [0.052, 1]],
  shin: [[0.047, 0], [0.05, 0.2], [0.043, 0.45], [0.031, 0.8], [0.028, 1]],
};
function limb(A, B, prof) {
  for (let i = 0; i < prof.length - 1; i++) {
    const a = A.clone().lerp(B, prof[i][1]), b = A.clone().lerp(B, prof[i + 1][1]);
    roundCone(a, b, prof[i][0], prof[i + 1][0], 0.025);
  }
}
for (const side of ['L', 'R']) {
  const lr = side === 'L' ? 1 : -1;
  limb(J['s' + side], J['e' + side], PROFILES.upperArm);
  limb(J['e' + side], J['x' + side], PROFILES.foreArm);
  limb(J['hip' + side], J['k' + side], PROFILES.thigh);
  limb(J['k' + side], J['a' + side], PROFILES.shin);
  // Schulterkappe
  ellipsoid(at(J['s' + side], J.qChest, [0.012 * lr, 0.0, 0]), J.qChest, [0.062, 0.055, 0.058], 0.03);
  // Fuß: Mittelfuß + Ferse + Zehen
  const ff = footFrame(J, side);
  ellipsoid(ff.pos.clone().addScaledVector(ff.fwd, 0.06).addScaledVector(ff.shin, 0.04), ff.quat, [0.043, 0.032, 0.09], 0.025);
  ellipsoid(ff.pos.clone().addScaledVector(ff.fwd, 0.15).addScaledVector(ff.shin, 0.055), ff.quat, [0.045, 0.02, 0.04], 0.02);
  ellipsoid(ff.pos.clone().addScaledVector(ff.fwd, -0.015).addScaledVector(ff.shin, 0.04), ff.quat, [0.03, 0.035, 0.035], 0.02);
  // Gesäß, Brust (Haut)
  ellipsoid(at(J.root, J.qPelvis, [0.068 * lr, -0.07, -0.065]), J.qPelvis, [0.08, 0.088, 0.072], 0.03);
  ellipsoid(at(J.chestTop, J.qChest, [0.075 * lr, -0.11, 0.06]), J.qChest, [0.085, 0.065, 0.05], 0.03);
  // Ohren
  ellipsoid(at(J.head, J.qHead, [0.08 * lr, -0.005, -0.005]), J.qHead, [0.012, 0.028, 0.02], 0.008);
}
// Rumpf: elliptische Scheiben entlang der Wirbelsäule
const TORSO = [[0.127, 0], [0.135, 0.2], [0.157, 0.5], [0.172, 0.75], [0.165, 0.88], [0.1, 1]];
for (const [r, y] of TORSO) ellipsoid(at(J.waist, J.qChest, [0, y * (L.chest + 0.04) - 0.02, -0.005]), J.qChest, [r, 0.06, r * 0.62], 0.05);
const PELV = [[0.148, 0.0], [0.16, 0.3], [0.146, 0.65], [0.13, 1]];
for (const [r, y] of PELV) ellipsoid(at(J.root, J.qPelvis, [0, y * (L.waist + 0.1) - 0.12, -0.005]), J.qPelvis, [r, 0.055, r * 0.68], 0.05);
ellipsoid(at(J.chestTop, J.qChest, [0, -0.02, -0.01]), J.qChest, [0.19, 0.042, 0.07], 0.04); // Schultergürtel
roundCone(at(J.chestTop, J.qChest, [0, -0.01, -0.012]), J.neck.clone().lerp(J.head, 0.4), 0.055, 0.045, 0.03);
ellipsoid(at(J.head, J.qHead, [0, 0.008, -0.004]), J.qHead, [0.077, 0.096, 0.096], 0.03);
ellipsoid(at(J.head, J.qHead, [0, -0.05, 0.03]), J.qHead, [0.058, 0.055, 0.062], 0.03);
ellipsoid(at(J.head, J.qHead, [0, -0.096, 0.056]), J.qHead, [0.03, 0.022, 0.026], 0.025); // Kinn
ellipsoid(at(J.head, J.qHead, [0, 0.022, 0.082]), J.qHead, [0.05, 0.012, 0.014], 0.02); // Brauen
for (const lr of [1, -1]) ellipsoid(at(J.chestTop, J.qChest, [0.03 * lr, 0.035, 0.02]), J.qChest.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0, -0.3 * lr))), [0.012, 0.06, 0.014], 0.012); // Kopfnicker
ellipsoid(at(J.head, J.qHead, [0, -0.022, 0.094]), J.qHead, [0.012, 0.022, 0.016], 0.01); // Nase

// Muskelbäuche als Wölbungen (kleiner Verschmelzungsradius = sichtbare Definition)
const MUSC = muscleEllipsoids(J);
for (const m of MUSC) ellipsoid(m.center, m.quat, m.radii, 0.012, 'muscle');

// ---------- SDF-Auswertung ----------
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
const tmpV = new THREE.Vector3();
function sdf(x, y, z) {
  let d = 1e3;
  for (const p of prims) {
    tmpV.set(x, y, z);
    const bd = p.box.distanceToPoint(tmpV);
    if (bd > 0.06) { continue; }
    d = smin(d, p.f(x, y, z), p.k);
  }
  return d;
}

// ---------- Gitter + Surface Nets ----------
const bb = new THREE.Box3();
for (const p of prims) bb.union(p.box);
bb.expandByScalar(0.02);
const nx = Math.ceil((bb.max.x - bb.min.x) / RES) + 1, ny = Math.ceil((bb.max.y - bb.min.y) / RES) + 1, nz = Math.ceil((bb.max.z - bb.min.z) / RES) + 1;
console.log('Gitter', nx, ny, nz, (nx * ny * nz / 1e6).toFixed(2), 'Mio Punkte');
const F = new Float32Array(nx * ny * nz);
const idx = (i, j, k) => i + nx * (j + ny * k);
console.time('sdf');
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
  F[idx(i, j, k)] = sdf(bb.min.x + i * RES, bb.min.y + j * RES, bb.min.z + k * RES);
console.timeEnd('sdf');

const vmap = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
const verts = [];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
  const v = CORN.map(([a, b, c]) => F[idx(i + a, j + b, k + c)]);
  let pos = 0, neg = 0; for (const x of v) (x < 0 ? neg++ : pos++);
  if (!pos || !neg) continue;
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const [a, b] of EDGES) {
    if ((v[a] < 0) === (v[b] < 0)) continue;
    const t = v[a] / (v[a] - v[b]);
    sx += CORN[a][0] + (CORN[b][0] - CORN[a][0]) * t; sy += CORN[a][1] + (CORN[b][1] - CORN[a][1]) * t; sz += CORN[a][2] + (CORN[b][2] - CORN[a][2]) * t; n++;
  }
  vmap[cidx(i, j, k)] = verts.length / 3;
  verts.push(bb.min.x + (i + sx / n) * RES, bb.min.y + (j + sy / n) * RES, bb.min.z + (k + sz / n) * RES);
}
const tris = [];
function quad(a, b, c, d, flip) { if (flip) tris.push(a, d, c, a, c, b); else tris.push(a, b, c, a, c, d); }
for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
  const f0 = F[idx(i, j, k)] < 0;
  if (i < nx - 1 && f0 !== (F[idx(i + 1, j, k)] < 0)) quad(vmap[cidx(i, j - 1, k - 1)], vmap[cidx(i, j, k - 1)], vmap[cidx(i, j, k)], vmap[cidx(i, j - 1, k)], !f0);
  if (j < ny - 1 && f0 !== (F[idx(i, j + 1, k)] < 0)) quad(vmap[cidx(i - 1, j, k - 1)], vmap[cidx(i - 1, j, k)], vmap[cidx(i, j, k)], vmap[cidx(i, j, k - 1)], !f0);
  if (k < nz - 1 && f0 !== (F[idx(i, j, k + 1)] < 0)) quad(vmap[cidx(i - 1, j - 1, k)], vmap[cidx(i, j - 1, k)], vmap[cidx(i, j, k)], vmap[cidx(i - 1, j, k)], !f0);
}
const nv = verts.length / 3;
console.log('Vertices', nv, 'Dreiecke', tris.length / 3);

// Auf Oberfläche projizieren + Normalen aus Gradient
const P = new Float32Array(verts), N = new Float32Array(nv * 3);
const h = 0.0015;
for (let v = 0; v < nv; v++) {
  let x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
  let gx = 0, gy = 0, gz = 1;
  for (let it = 0; it < 3; it++) {
    const d = sdf(x, y, z);
    gx = (sdf(x + h, y, z) - sdf(x - h, y, z)) / (2 * h); gy = (sdf(x, y + h, z) - sdf(x, y - h, z)) / (2 * h); gz = (sdf(x, y, z + h) - sdf(x, y, z - h)) / (2 * h);
    const g2 = gx * gx + gy * gy + gz * gz || 1;
    if (it < 2) { x -= d * gx / g2; y -= d * gy / g2; z -= d * gz / g2; }
  }
  const gl = Math.hypot(gx, gy, gz) || 1;
  P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z;
  N[3 * v] = gx / gl; N[3 * v + 1] = gy / gl; N[3 * v + 2] = gz / gl;
}

// ---------- Skin-Gewichte ----------
const BT = boneTransforms(J);
const segs = {
  pelvis: [at(J.root, J.qPelvis, [0, -0.13, 0]), J.waist, 0.15],
  chest: [J.waist, J.chestTop, 0.16],
  head: [at(J.chestTop, J.qChest, [0, 0.03, 0]), at(J.head, J.qHead, [0, 0.08, 0]), 0.07],
};
for (const side of ['L', 'R']) {
  segs['upperArm' + side] = [J['s' + side], J['e' + side], 0.05];
  segs['foreArm' + side] = [J['e' + side], J['x' + side], 0.036];
  segs['thigh' + side] = [J['hip' + side], J['k' + side], 0.075];
  segs['shin' + side] = [J['k' + side], J['a' + side], 0.045];
  const ff = footFrame(J, side);
  segs['foot' + side] = [ff.pos.clone().addScaledVector(ff.shin, 0.04), ff.pos.clone().addScaledVector(ff.fwd, 0.18).addScaledVector(ff.shin, 0.05), 0.035];
}
// Gewichte: nächster Knochen + schmale Übergänge an den Gelenken
const ss = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const PARENT_W = { chest: 0.08, head: 0.05, upperArmL: 0.1, upperArmR: 0.1, foreArmL: 0.055, foreArmR: 0.055, thighL: 0.08, thighR: 0.08, shinL: 0.06, shinR: 0.06, footL: 0.035, footR: 0.035 };
// Kinder: [kind, art ('axial' = Fortsetzung des Segments, 'joint' = Abzweig), Breite, Radius]
const KIDS = {
  pelvis: [['chest', 'axial', 0.08], ['thighL', 'joint', 0.08, 0.085], ['thighR', 'joint', 0.08, 0.085]],
  chest: [['head', 'joint', 0.05, 0.05], ['upperArmL', 'joint', 0.1, 0.055], ['upperArmR', 'joint', 0.1, 0.055]],
  upperArmL: [['foreArmL', 'axial', 0.055]], upperArmR: [['foreArmR', 'axial', 0.055]],
  thighL: [['shinL', 'axial', 0.06]], thighR: [['shinR', 'axial', 0.06]],
  shinL: [['footL', 'axial', 0.035]], shinR: [['footR', 'axial', 0.035]],
};
const segInfo = (p, [a, b, r]) => {
  const ab = b.clone().sub(a); const len = ab.length();
  const tt = p.clone().sub(a).dot(ab) / (len * len); const t = Math.min(1, Math.max(0, tt));
  return { d: p.distanceTo(a.clone().addScaledVector(ab, t)) - r, along: tt * len, len };
};
const NB = BONES.length; const WD = new Float32Array(nv * NB);
const p = new THREE.Vector3();
for (let v = 0; v < nv; v++) {
  p.set(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
  let best = null, bd = 1e9, binf = null;
  for (const b of BONES) { const r = segInfo(p, segs[b]); if (r.d < bd) { bd = r.d; best = b; binf = r; } }
  const w = { [best]: 1 };
  const par = BONE_PARENT[best];
  if (par) w[par] = (w[par] || 0) + 0.5 * (1 - ss(binf.along / PARENT_W[best]));
  for (const [c, kind, W, rad] of KIDS[best] || []) {
    let d;
    if (kind === 'axial') d = binf.len - binf.along;
    else d = p.distanceTo(segs[c][0]) - rad;
    const wc = 0.5 * (1 - ss(d / W));
    if (wc > 0) w[c] = (w[c] || 0) + wc;
  }
  let tot = 0; for (const x of Object.values(w)) tot += x;
  for (const [b, x] of Object.entries(w)) WD[v * NB + BONES.indexOf(b)] = x / tot;
}
// Nachbarschaft aus Dreiecken
const nbr = Array.from({ length: nv }, () => new Set());
for (let i = 0; i < tris.length; i += 3) { const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]]; nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b); }
const NBR = nbr.map((st) => Int32Array.from(st));
// Gewichte glätten: entfernt Treppenstufen an Übergängen
for (let it = 0; it < 6; it++) {
  const W2 = new Float32Array(WD.length);
  for (let v = 0; v < nv; v++) {
    const ns = NBR[v]; const k = ns.length;
    for (let b = 0; b < NB; b++) {
      let acc = 0; for (let j = 0; j < k; j++) acc += WD[ns[j] * NB + b];
      W2[v * NB + b] = 0.5 * WD[v * NB + b] + (k ? 0.5 * acc / k : 0.5 * WD[v * NB + b]);
    }
  }
  WD.set(W2);
}
const SI = new Uint8Array(nv * 4), SW = new Uint8Array(nv * 4);
for (let v = 0; v < nv; v++) {
  const ws = []; for (let b = 0; b < NB; b++) if (WD[v * NB + b] > 1e-3) ws.push([b, WD[v * NB + b]]);
  ws.sort((a, b) => b[1] - a[1]); ws.length = Math.min(ws.length, 4);
  const sum = ws.reduce((s2, x) => s2 + x[1], 0);
  const qs = ws.map(([, x]) => Math.floor((x / sum) * 255));
  qs[0] += 255 - qs.reduce((a, b) => a + b, 0);
  ws.forEach(([b], i) => { SI[4 * v + i] = b; SW[4 * v + i] = qs[i]; });
}


// ---------- Muskelzuordnung ----------
const MI = new Uint8Array(nv * 4); const MW = new Float32Array(nv);
const mq = MUSC.map((m) => ({ ...m, e: new THREE.Matrix4().makeRotationFromQuaternion(m.quat.clone().invert()).elements, id: MUSCLE_KEYS.indexOf(m.muscle) }));
for (let v = 0; v < nv; v++) {
  const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
  let bq = 1e9, bid = 255;
  for (const m of mq) {
    const px = x - m.center.x, py = y - m.center.y, pz = z - m.center.z, e = m.e;
    const lx = e[0] * px + e[4] * py + e[8] * pz, ly = e[1] * px + e[5] * py + e[9] * pz, lz = e[2] * px + e[6] * py + e[10] * pz;
    const q = Math.hypot(lx / m.radii[0], ly / m.radii[1], lz / m.radii[2]);
    if (q < bq) { bq = q; bid = m.id; }
  }
  const w = Math.min(1, Math.max(0, (1.5 - bq) / 0.4));
  MI[4 * v] = w > 0 ? bid : 255; MW[v] = w;
}
for (let it = 0; it < 3; it++) {
  const M2 = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const ns = NBR[v]; let acc = 0, n = 0;
    for (const j of ns) { acc += MI[4 * j] === MI[4 * v] ? MW[j] : 0; n++; }
    M2[v] = n ? 0.5 * MW[v] + 0.5 * acc / n : MW[v];
  }
  MW.set(M2);
}
for (let v = 0; v < nv; v++) MI[4 * v + 1] = Math.round(MW[v] * 255);
// Relief: Krümmung je Vertex (Furchen dunkler, Wölbungen heller)
let CV = new Float32Array(nv);
for (let v = 0; v < nv; v++) {
  const ns = NBR[v]; if (!ns.length) continue;
  let mx = 0, my = 0, mz = 0, el = 0;
  for (const j of ns) { const dx = P[3 * j] - P[3 * v], dy = P[3 * j + 1] - P[3 * v + 1], dz = P[3 * j + 2] - P[3 * v + 2]; mx += dx; my += dy; mz += dz; el += Math.hypot(dx, dy, dz); }
  const k = ns.length; el /= k;
  CV[v] = ((mx * N[3 * v] + my * N[3 * v + 1] + mz * N[3 * v + 2]) / k) / (el * el) * 0.01;
}
for (let it = 0; it < 4; it++) {
  const C2 = new Float32Array(nv);
  for (let v = 0; v < nv; v++) { const ns = NBR[v]; let a = 0; for (const j of ns) a += CV[j]; C2[v] = ns.length ? 0.4 * CV[v] + 0.6 * a / ns.length : CV[v]; }
  CV = C2;
}
for (let v = 0; v < nv; v++) MI[4 * v + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, CV[v] * 3.6)));

// ---------- Export ----------
const I = nv < 65535 ? new Uint16Array(tris) : new Uint32Array(tris);
const parts = [P, N, SI, SW, MI, I];
const pad = (n) => (n + 3) & ~3;
let off = 0; const meta = { nv, ni: tris.length, indexType: nv < 65535 ? 'u16' : 'u32', offsets: {} };
const names = ['position', 'normal', 'skinIndex', 'skinWeight', 'muscle', 'index'];
parts.forEach((a, i) => { meta.offsets[names[i]] = off; off = pad(off + a.byteLength); });
const buf = new Uint8Array(off);
parts.forEach((a, i) => buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), meta.offsets[names[i]]));
fs.writeFileSync(new URL('body.bin', OUT), buf);
fs.writeFileSync(new URL('body.json', OUT), JSON.stringify(meta));
console.log('body.bin', (off / 1024 / 1024).toFixed(2), 'MB');
