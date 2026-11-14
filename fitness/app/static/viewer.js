// 3D-Übungsviewer: durchgehender, gehäuteter Körper mit ausmodellierten Muskeln.
// Muskeln werden je Vertex eingefärbt (Haupt = rot, Hilfs = hellrot), Hände greifen den Griff.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { D, V, UP, L, MUSCLE_KEYS, BIND_POSE, BONES, completePose, samplePose, solve, boneTransforms, perp } from './rig.js';

export const MUSCLES = {
  chest: 'Brust', chest_upper: 'Obere Brust', front_delt: 'Vordere Schulter', side_delt: 'Seitliche Schulter',
  rear_delt: 'Hintere Schulter', triceps: 'Trizeps', biceps: 'Bizeps', forearms: 'Unterarme', lats: 'Latissimus',
  traps: 'Trapez', rhomboids: 'Mittlerer Rücken', lower_back: 'Unterer Rücken', abs: 'Gerader Bauch',
  obliques: 'Schräge Bauchmuskeln', glutes: 'Gesäß', glute_med: 'Abduktoren', quads: 'Oberschenkel vorne',
  hamstrings: 'Oberschenkel hinten', adductors: 'Adduktoren', calves: 'Waden',
};

const THEMES = {
  light: { skin: 0xd3d8df, idle: 0x9aa3b0, rim: 0x5f84b0, rimK: 0.45, opacity: 0.92, prop: 0x9aa0a9, propLight: 0xc3c8d0, pad: 0x33373d, metal: 0x6d737c, cable: 0x2c3036, grid1: 0xb8bcc4, grid2: 0xdde0e5 },
  dark: { skin: 0x56606e, idle: 0x3f4752, rim: 0x8fb8ff, rimK: 0.75, opacity: 0.86, prop: 0x5a616b, propLight: 0x6a717c, pad: 0x2a2d33, metal: 0x8a919b, cable: 0xd0d4da, grid1: 0x3a3f47, grid2: 0x2a2e35 },
};
const RED = 0xe0242b, RED2 = 0xf08a72;

// ---------- Körpermodell laden ----------
let bodyDataPromise = null;
function loadBody() {
  if (!bodyDataPromise) {
    bodyDataPromise = (async () => {
      const meta = await fetch(new URL('./body.json', import.meta.url)).then((r) => r.json());
      try {
        const r = await fetch(new URL('./body.bin', import.meta.url));
        if (!r.ok) throw new Error('kein body.bin');
        return [meta, await r.arrayBuffer()];
      } catch (e) { // Ersatz: Base64-Modul (für Hosts ohne Binärdateien)
        const { BODY_B64 } = await import('./body-data.js');
        const bin = atob(BODY_B64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return [meta, u.buffer];
      }
    })();
  }
  return bodyDataPromise;
}

function bodyMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, transparent: true, opacity: 0.88, depthWrite: false });
  mat.userData.uniforms = {
    uState: { value: new Float32Array(20) },
    uSkin: { value: new THREE.Color() }, uIdle: { value: new THREE.Color() },
    uRed: { value: new THREE.Color(RED) }, uRed2: { value: new THREE.Color(RED2) },
    uRim: { value: new THREE.Color() }, uRimK: { value: 0.5 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 muscle; uniform float uState[20]; uniform vec3 uSkin, uIdle, uRed, uRed2; varying vec3 vMCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { int id = int(muscle.x + 0.5); float w = muscle.y / 255.0; vec3 c = uSkin;
          if (id < 20) { float s = uState[id];
            if (s > 0.5) { c = mix(uSkin, s > 1.5 ? uRed : uRed2, smoothstep(0.05, 0.55, w)); }
            else { c = mix(uSkin, uIdle, w * 0.75); } }
          float cav = (muscle.z - 128.0) / 127.0;
          c *= 1.0 - 0.55 * max(cav, 0.0) + 0.12 * max(-cav, 0.0);
          vMCol = c; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMCol; uniform vec3 uRim; uniform float uRimK;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vMCol, opacity );')
      .replace('#include <opaque_fragment>', `
        float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
        outgoingLight += uRim * fr * uRimK;
        #include <opaque_fragment>`);
  };
  return mat;
}

// ---------- Hand (starr, greift um einen Griff entlang der lokalen X-Achse) ----------
// Lokal: X = Griffachse, Y = Richtung Finger (vom Handgelenk weg), Z = Handflächen-Normale (zum Griff hin).
// Ursprung = Griffmitte. Daumen auf -X (linke Hand); rechte Hand wird gespiegelt.
function buildHandGeometry() {
  const parts = [];
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(p))), 10, r, 7, false);
  const R = 0.027;
  const arc = (x, a0, a1, n = 5) => {
    const pts = [[x, -0.012, -0.036]];
    for (let i = 0; i <= n; i++) { const a = D(a0 + ((a1 - a0) * i) / n); pts.push([x, R * Math.sin(a), -R * Math.cos(a)]); }
    return pts;
  };
  // Finger: Zeige, Mittel, Ring, Klein (Zeigefinger nahe Daumen = -X)
  parts.push(tube(arc(-0.027, 15, 205), 0.0098));
  parts.push(tube(arc(-0.009, 15, 222), 0.0103));
  parts.push(tube(arc(0.009, 15, 212), 0.0098));
  parts.push(tube(arc(0.026, 18, 185), 0.0088));
  // Daumen: vom Handballen um den Griff über die Finger
  parts.push(tube([[-0.035, -0.07, -0.035], [-0.05, -0.04, -0.02], [-0.046, -0.012, 0.012], [-0.03, -0.004, 0.032], [-0.014, -0.002, 0.036]], 0.0108));
  // Handfläche + Handballen
  const palm = new THREE.SphereGeometry(1, 16, 12); palm.scale(0.046, 0.05, 0.017); palm.translate(0, -0.05, -0.036);
  const ball = new THREE.SphereGeometry(1, 12, 10); ball.scale(0.022, 0.03, 0.016); ball.translate(-0.03, -0.065, -0.03);
  const wrist = new THREE.CylinderGeometry(0.026, 0.03, 0.04, 14); wrist.scale(1, 1, 0.7); wrist.translate(0, -0.095, -0.033);
  parts.push(palm, ball, wrist);
  return parts;
}

export class ExerciseViewer {
  constructor(el, { theme = 'light' } = {}) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const cv = this.renderer.domElement;
    cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
    el.style.overflow = 'hidden'; if (!el.style.position) el.style.position = 'relative';
    el.appendChild(cv);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 40);
    this.controls = new OrbitControls(this.camera, cv);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.rotateSpeed = 0.8;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.8); this.scene.add(this.hemi);
    const dl = new THREE.DirectionalLight(0xffffff, 1.7); dl.position.set(2, 4, 3); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.7); dl2.position.set(-2.5, 2, -3); this.scene.add(dl2);
    this.propGroup = new THREE.Group(); this.scene.add(this.propGroup);
    this.bodyMat = bodyMaterial();
    this.theme = theme;
    this.state = new Float32Array(20);
    this._buildHands();
    this.setTheme(theme);
    this.t = 0; this.playing = false; this.anim = null; this.onTick = null;
    this.cycle = [2.4, 0.5, 2.8, 0.5]; this.clock = 0;
    this.ready = loadBody().then(([meta, buf]) => this._buildBody(meta, buf));
    new ResizeObserver(() => this._resize()).observe(el);
    this._resize();
    this._last = performance.now();
    const loop = (now) => {
      const dts = Math.min(0.1, (now - this._last) / 1000); this._last = now;
      if (this.playing && this.anim) {
        this.clock += dts; this.t = this._cycleT(); this.update(); if (this.onTick) this.onTick(this.t);
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _buildBody(meta, buf) {
    const o = meta.offsets, nv = meta.nv;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, o.position, nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, o.normal, nv * 3), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf, o.skinIndex, nv * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf, o.skinWeight, nv * 4), 4, true));
    g.setAttribute('muscle', new THREE.BufferAttribute(new Uint8Array(buf, o.muscle, nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(meta.indexType === 'u16' ? new Uint16Array(buf, o.index, meta.ni) : new Uint32Array(buf, o.index, meta.ni), 1));
    g.computeBoundingSphere(); g.boundingSphere.radius = 3;
    const bind = boneTransforms(solve(completePose(BIND_POSE)));
    this.bones = BONES.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    const inverses = BONES.map((name) => new THREE.Matrix4().compose(bind[name].pos, bind[name].quat, new THREE.Vector3(1, 1, 1)).invert());
    this.skeleton = new THREE.Skeleton(this.bones, inverses);
    // Tiefen-Vorlauf: nur die vorderste Körperfläche wird halbtransparent gezeichnet
    this.depthMesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial({ colorWrite: false }));
    this.bodyMesh = new THREE.SkinnedMesh(g, this.bodyMat);
    for (const m of [this.depthMesh, this.bodyMesh]) { m.frustumCulled = false; }
    this.bodyMesh.add(...this.bones);
    this.bodyMesh.bind(this.skeleton, new THREE.Matrix4());
    this.depthMesh.bind(this.skeleton, new THREE.Matrix4());
    this.depthMesh.renderOrder = 1; this.bodyMesh.renderOrder = 2;
    this.scene.add(this.bodyMesh, this.depthMesh);
    if (this.anim) this.update();
  }

  _buildHands() {
    this.handMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    this.hands = {};
    const parts = buildHandGeometry();
    for (const side of ['L', 'R']) {
      const g = new THREE.Group();
      for (const geo of parts) { const m = new THREE.Mesh(geo, this.handMat); m.renderOrder = 2; g.add(m); }
      g.userData.inner = new THREE.Group(); g.userData.inner.add(...g.children.slice());
      g.add(g.userData.inner);
      if (side === 'R') g.userData.inner.scale.x = -1;
      this.scene.add(g); this.hands[side] = g;
    }
  }

  _cycleT() {
    const [a, b, c, d] = this.cycle; const x = this.clock % (a + b + c + d);
    if (x < a) return x / a; if (x < a + b) return 1; if (x < a + b + c) return 1 - (x - a - b) / c; return 0;
  }
  _clockFromT(t, rising = true) { const [a, b, c] = this.cycle; return rising ? t * a : a + b + (1 - t) * c; }

  _resize() {
    const w = this.el.clientWidth || 400, h = this.el.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this._fit) this._applyFit(false);
  }

  _std(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 }); }

  setTheme(name) {
    this.theme = name; const T = THEMES[name] || THEMES.light;
    const u = this.bodyMat.userData.uniforms;
    u.uSkin.value.setHex(T.skin); u.uIdle.value.setHex(T.idle); u.uRim.value.setHex(T.rim); u.uRimK.value = T.rimK;
    this.bodyMat.opacity = T.opacity;
    this.handMat.color.setHex(T.skin);
    this.hemi.intensity = name === 'dark' ? 1.3 : 1.8;
    if (this.grid) this.scene.remove(this.grid);
    this.grid = new THREE.GridHelper(4, 16, T.grid1, T.grid2); this.scene.add(this.grid);
    if (this._props) this._buildProps(this._props);
  }

  setMuscles(primary = [], secondary = []) {
    MUSCLE_KEYS.forEach((k, i) => { this.state[i] = primary.includes(k) ? 2 : secondary.includes(k) ? 1 : 0; });
    this.bodyMat.userData.uniforms.uState.value.set(this.state);
  }

  setExercise(anim, muscles) {
    this.anim = anim;
    this.setMuscles(muscles?.primary, muscles?.secondary);
    this._buildProps(anim.props || []);
    this._computeFit();
    this._applyFit(true);
    this.clock = 0; this.t = 0; this.update();
  }

  _computeFit() {
    const box = new THREE.Box3();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const J = solve(samplePose(this.anim.keys, t));
      for (const k of ['head', 'sL', 'sR', 'eL', 'eR', 'wL', 'wR', 'hipL', 'hipR', 'kL', 'kR', 'aL', 'aR', 'root', 'chestTop']) box.expandByPoint(J[k]);
    }
    box.expandByScalar(0.12);
    this._fit = { center: box.getCenter(new THREE.Vector3()), radius: box.getSize(new THREE.Vector3()).length() / 2 };
  }
  _applyFit(resetDir) {
    const { center, radius } = this._fit;
    const vfov = D(this.camera.fov) / 2, hfov = Math.atan(Math.tan(vfov) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov))) * 0.78;
    const off = this.camera.position.clone().sub(this.controls.target);
    const keep = off.length();
    const reset = resetDir || keep < 1e-3;
    const dir = reset ? V(this.anim?.view || [1, 0.3, 1]).normalize() : off.normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, reset ? dist : keep);
    this.controls.minDistance = dist * 0.35; this.controls.maxDistance = dist * 1.8;
    this.controls.update();
  }
  resetView() { if (this._fit) this._applyFit(true); }
  setT(t) { this.t = Math.min(1, Math.max(0, t)); this.clock = this._clockFromT(this.t); this.update(); }
  play(on = true) { this.playing = on; if (on) this.clock = this._clockFromT(this.t); }

  _place(mesh, A, B, r = 1) {
    const d = B.clone().sub(A); const len = d.length();
    mesh.position.copy(A).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
    mesh.scale.set(r, len, r);
  }

  _buildProps(props) {
    this._props = props;
    this.propGroup.clear();
    this.dynamic = [];
    const T = THEMES[this.theme];
    const mats = { frame: this._std(T.prop), light: this._std(T.propLight), pad: this._std(T.pad), metal: new THREE.MeshStandardMaterial({ color: T.metal, roughness: 0.5, metalness: 0.25 }) };
    const M = (p, def = 'frame') => mats[p.mat || (p.light ? 'light' : def)];
    const cm = new THREE.LineBasicMaterial({ color: T.cable });
    for (const p of props) {
      if (p.type === 'box') {
        const g = p.round ? new RoundedBoxGeometry(...p.size, 3, Math.min(p.round, Math.min(...p.size) / 2 - 0.001)) : new THREE.BoxGeometry(...p.size);
        const m = new THREE.Mesh(g, M(p));
        m.position.set(...p.pos); if (p.rot) m.rotation.set(...p.rot.map(D)); this.propGroup.add(m);
        if (p.travel) this.dynamic.push({ p, obj: m });
      } else if (p.type === 'cyl') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), M(p));
        this._place(m, V(p.from), V(p.to), p.r || 0.02); this.propGroup.add(m);
      } else if (p.type === 'pulley') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r || 0.05, p.r || 0.05, 0.035, 20), mats.metal);
        m.position.set(...p.pos); m.rotation.set(...(p.rot || [90, 0, 0]).map(D)); this.propGroup.add(m);
      } else if (p.type === 'cable') {
        const obj = new THREE.Line(new THREE.BufferGeometry(), cm);
        this.propGroup.add(obj); this.dynamic.push({ p, obj });
      } else if (p.type === 'lever' || p.type === 'link') {
        const obj = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), M(p, p.type === 'link' ? 'metal' : 'frame'));
        this.propGroup.add(obj); this.dynamic.push({ p, obj });
      } else if (['bar', 'handle', 'dumbbell', 'rope', 'pad'].includes(p.type)) {
        const obj = new THREE.Group();
        if (p.type === 'dumbbell') {
          obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), mats.metal));
          for (const y of [0.1, -0.1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.05, 18), mats.frame); w.position.y = y; obj.add(w); }
        } else if (p.type === 'pad') {
          obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, p.len || 0.35, 16), mats.pad));
        } else {
          const r = p.type === 'rope' ? 0.013 : p.type === 'handle' ? 0.017 : 0.014;
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), p.type === 'rope' ? this._std(0x3a3d44) : p.type === 'handle' ? mats.pad : mats.metal);
          if (p.type === 'handle') mesh.scale.y = 0.13;
          obj.add(mesh);
        }
        this.propGroup.add(obj); this.dynamic.push({ p, obj });
      }
    }
  }

  _anchor(J, ref) {
    if (Array.isArray(ref)) return V(ref);
    if (ref && typeof ref === 'object') return this._anchor(J, ref.at).clone().add(V(ref.off || [0, 0, 0]));
    const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
    switch (ref) {
      case 'hL': return J.wL; case 'hR': return J.wR; case 'hM': return mid(J.wL, J.wR);
      case 'fL': return J.aL; case 'fR': return J.aR; case 'fM': return mid(J.aL, J.aR);
      case 'kL': return J.kL; case 'kR': return J.kR; case 'kM': return mid(J.kL, J.kR);
      case 'stack': return V(this._stackTop || [0, 0, 0]);
      default: return new THREE.Vector3();
    }
  }

  _updateProps(J) {
    for (const { p, obj } of this.dynamic) {
      if (p.type === 'box' && p.travel) {
        obj.position.set(p.pos[0], p.pos[1] + p.travel * this.t, p.pos[2]);
        if (p.top) this._stackTop = [p.pos[0], p.pos[1] + p.travel * this.t + p.size[1] / 2, p.pos[2]];
      }
    }
    for (const { p, obj } of this.dynamic) {
      if (p.type === 'box') continue;
      if (p.type === 'cable') obj.geometry.setFromPoints([p.from, ...(p.via || []), p.to].map((r) => this._anchor(J, r)));
      else if (p.type === 'lever') this._place(obj, this._anchor(J, p.from), this._anchor(J, p.to), p.r || 0.022);
      else if (p.type === 'link') this._place(obj, this._anchor(J, p.a), this._anchor(J, p.b), p.r || 0.014);
      else if (p.type === 'bar' || p.type === 'rope') {
        const a = this._anchor(J, p.a || 'hL'), b = this._anchor(J, p.b || 'hR');
        const d = b.clone().sub(a).normalize(); const ext = p.extend ?? (p.type === 'bar' ? 0.12 : 0.02);
        this._place(obj, a.clone().addScaledVector(d, -ext), b.clone().addScaledVector(d, ext), 1);
      } else {
        obj.position.copy(this._anchor(J, p.at)).add(V(p.offset || [0, 0, 0]));
        const axis = p.axis ? V(p.axis).normalize() : V([1, 0, 0]);
        obj.quaternion.setFromUnitVectors(UP, axis);
      }
    }
  }

  // Griff: Achse und Handflächenrichtung je Hand (rechts gespiegelt)
  _grip(J, side) {
    const g = this.anim.grip || {};
    const mirror = (v) => [-v[0], v[1], v[2]];
    let axis = g.axis || [1, 0, 0];
    if (axis === 'bar') axis = J.wL.clone().sub(J.wR).toArray();
    else if (side === 'R') axis = mirror(axis);
    let palm = g.palm || [0, 0, 1];
    if (side === 'R') palm = mirror(palm);
    return { axis: V(axis).normalize(), palm: V(palm).normalize() };
  }

  _updateHands(J) {
    for (const side of ['L', 'R']) {
      const G = J['w' + side], X0 = J['x' + side];
      const Y = G.clone().sub(X0).normalize();
      const { axis, palm } = this._grip(J, side);
      let X = perp(axis, Y);
      let Z = X.clone().cross(Y);
      if (Z.dot(palm) < 0) { X.negate(); Z.negate(); }
      const h = this.hands[side];
      h.position.copy(G);
      h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    }
  }

  update() {
    if (!this.anim) return;
    const J = solve(samplePose(this.anim.keys, this.t));
    this.J = J;
    if (this.bones) {
      const bt = boneTransforms(J);
      BONES.forEach((name, i) => { this.bones[i].position.copy(bt[name].pos); this.bones[i].quaternion.copy(bt[name].quat); });
    }
    this._updateHands(J);
    this._updateProps(J);
  }

  dispose() { cancelAnimationFrame(this._raf); this.renderer.dispose(); this.el.innerHTML = ''; }
}
