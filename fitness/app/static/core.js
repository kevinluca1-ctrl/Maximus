// Kern: API, Zustand, Berechnungen (1RM, Rekorde, Erholung, Serien).
export const api = async (path, opts = {}) => {
  const r = await fetch('api/' + path, {
    ...opts,
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    let msg = r.status;
    try { msg = (await r.json()).detail || msg; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
};

export const MUSCLES = {
  chest: 'Brust', chest_upper: 'Obere Brust', front_delt: 'Vordere Schulter', side_delt: 'Seitliche Schulter',
  rear_delt: 'Hintere Schulter', triceps: 'Trizeps', biceps: 'Bizeps', forearms: 'Unterarme', lats: 'Latissimus',
  traps: 'Trapez', rhomboids: 'Mittlerer Rücken', lower_back: 'Unterer Rücken', abs: 'Gerader Bauch',
  obliques: 'Schräge Bauchmuskeln', glutes: 'Gesäß', glute_med: 'Abduktoren', quads: 'Oberschenkel vorne',
  hamstrings: 'Oberschenkel hinten', adductors: 'Adduktoren', calves: 'Waden',
};
// Gruppen wie in Lyfta (Erholung, Filter, Radar)
export const GROUPS = [
  { id: 'chest', name: 'Brust', cat: 'Push', muscles: ['chest', 'chest_upper'] },
  { id: 'shoulders', name: 'Schultern', cat: 'Push', muscles: ['front_delt', 'side_delt', 'rear_delt'] },
  { id: 'triceps', name: 'Trizeps', cat: 'Push', muscles: ['triceps'] },
  { id: 'back', name: 'Rücken', cat: 'Pull', muscles: ['lats', 'rhomboids', 'traps', 'lower_back'] },
  { id: 'biceps', name: 'Bizeps', cat: 'Pull', muscles: ['biceps'] },
  { id: 'forearms', name: 'Unterarme', cat: 'Pull', muscles: ['forearms'] },
  { id: 'quads', name: 'Oberschenkel vorne', short: 'Beine vorne', cat: 'Beine', muscles: ['quads'] },
  { id: 'hamstrings', name: 'Oberschenkel hinten', short: 'Beine hinten', cat: 'Beine', muscles: ['hamstrings'] },
  { id: 'hips', name: 'Gesäß und Hüfte', short: 'Gesäß', cat: 'Beine', muscles: ['glutes', 'glute_med', 'adductors'] },
  { id: 'calves', name: 'Waden', cat: 'Beine', muscles: ['calves'] },
  { id: 'core', name: 'Bauch', short: 'Bauch', cat: 'Rumpf', muscles: ['abs', 'obliques'] },
];
export const DAYS = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' };
export const DAY_KEYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const S = { exercises: [], byId: {}, routines: [], workouts: [], settings: {}, measurements: [], active: null };

export async function loadAll() {
  const [ex, ro, wo, se, me, ac] = await Promise.all([
    api('exercises'), api('routines'), api('workouts'), api('settings'), api('measurements'), api('active'),
  ]);
  S.exercises = ex.exercises; S.byId = Object.fromEntries(S.exercises.map((e) => [e.id, e]));
  S.routines = ro.routines; S.workouts = wo.workouts; S.settings = se; S.measurements = me.measurements;
  let local = null;
  try { local = JSON.parse(localStorage.getItem('fc-active') || 'null'); } catch (e) {}
  S.active = ac.active || local;
}
export async function reloadWorkouts() { S.workouts = (await api('workouts')).workouts; }

// ---------- Format ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const exName = (id) => S.byId[id]?.name_de || id;
export const fmtDate = (iso, opts = { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) => new Date(iso).toLocaleDateString('de-DE', opts);
export const fmtNum = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('de-DE');
export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
export const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// ---------- Berechnungen ----------
export const e1rm = (w, r) => (r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30));
export const workSets = (sets) => sets.filter((s) => s.kind !== 'W');
export const volume = (sets) => workSets(sets).reduce((a, s) => a + s.weight * s.reps, 0);

// Verlauf einer Übung: [{workout, date, sets}] neueste zuerst
export function exerciseHistory(exId, workouts = S.workouts) {
  const out = [];
  for (const w of workouts) {
    const sets = w.sets.filter((s) => s.exercise_id === exId);
    if (sets.length) out.push({ workout: w, date: w.started, sets });
  }
  return out;
}
export function exerciseRecords(exId, workouts = S.workouts) {
  const rec = { weight: 0, e1rm: 0, volume: 0, reps: 0 };
  for (const h of exerciseHistory(exId, workouts)) {
    const ws = workSets(h.sets);
    for (const s of ws) {
      rec.weight = Math.max(rec.weight, s.weight); rec.e1rm = Math.max(rec.e1rm, e1rm(s.weight, s.reps));
      rec.reps = Math.max(rec.reps, s.reps);
    }
    rec.volume = Math.max(rec.volume, volume(h.sets));
  }
  return rec;
}
// Neue Rekorde eines Trainings gegenüber allen früheren
export function newRecords(w) {
  const earlier = S.workouts.filter((x) => x.started < w.started);
  const out = [];
  for (const exId of [...new Set(w.sets.map((s) => s.exercise_id))]) {
    const before = exerciseRecords(exId, earlier);
    const now = exerciseRecords(exId, [w]);
    const hadHistory = exerciseHistory(exId, earlier).length > 0;
    if (!hadHistory) continue;
    if (now.weight > before.weight) out.push({ exId, kind: 'Höchstes Gewicht', value: fmtNum(now.weight) + ' kg' });
    else if (now.e1rm > before.e1rm + 0.05) out.push({ exId, kind: 'Geschätztes 1RM', value: fmtNum(now.e1rm) + ' kg' });
    if (now.volume > before.volume) out.push({ exId, kind: 'Volumen', value: fmtNum(now.volume, 0) + ' kg' });
  }
  return out;
}
// Letzte Werte einer Übung (für "Vorher")
export function previousSets(exId) {
  const h = exerciseHistory(exId)[0];
  return h ? h.sets : [];
}

// Muskelbelastung: Hauptmuskel 1, Hilfsmuskel 0,5 je Arbeitssatz
export function muscleLoad(sets) {
  const load = {};
  for (const s of workSets(sets)) {
    const m = S.byId[s.exercise_id]?.muscles; if (!m) continue;
    for (const k of m.primary) load[k] = (load[k] || 0) + 1;
    for (const k of m.secondary) load[k] = (load[k] || 0) + 0.5;
  }
  return load;
}
export function groupLoad(load) {
  return Object.fromEntries(GROUPS.map((g) => [g.id, g.muscles.reduce((a, m) => a + (load[m] || 0), 0)]));
}
export function setsSince(days) {
  const t = Date.now() - days * 864e5;
  return S.workouts.filter((w) => new Date(w.ended) >= t).flatMap((w) => w.sets.map((s) => ({ ...s, ended: w.ended })));
}
// Erholung je Gruppe in %: Belastung klingt über 72 h linear ab
export function recovery() {
  const now = Date.now(), fatigue = {};
  for (const s of setsSince(7)) {
    const m = S.byId[s.exercise_id]?.muscles; if (s.kind === 'W' || !m) continue;
    const decay = Math.max(0, 1 - (now - new Date(s.ended)) / (72 * 36e5));
    if (!decay) continue;
    for (const k of m.primary) fatigue[k] = (fatigue[k] || 0) + decay;
    for (const k of m.secondary) fatigue[k] = (fatigue[k] || 0) + 0.5 * decay;
  }
  const out = {};
  for (const g of GROUPS) {
    const f = Math.max(...g.muscles.map((m) => fatigue[m] || 0));
    out[g.id] = Math.round(Math.max(0, 100 - f * 9));
  }
  return out;
}
export const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export function weekStreak() {
  const weeks = new Set(S.workouts.map((w) => mondayOf(w.started).getTime()));
  let wk = mondayOf(new Date()); if (!weeks.has(wk.getTime())) wk = new Date(wk.getTime() - 7 * 864e5);
  let n = 0; while (weeks.has(wk.getTime())) { n++; wk = new Date(wk.getTime() - 7 * 864e5); }
  return n;
}
// Nächste geplante Routine ab heute
export function nextRoutine() {
  const today = new Date().getDay();
  for (let i = 0; i < 7; i++) {
    const key = DAY_KEYS[(today + i) % 7];
    const r = S.routines.find((x) => x.weekday === key);
    if (r) return { routine: r, inDays: i };
  }
  return null;
}

// ---------- Progression ----------
// Wiederholungsbereich aus dem Routinenziel lesen: "8-12" -> [8, 12], "10 pro Seite" -> [10, 10]
export function repRange(target) {
  const t = String(target ?? '');
  const m = t.match(/(\d+)\s*(?:-|bis|–)\s*(\d+)/);
  if (m) return [+m[1], +m[2]];
  const n = parseInt(t, 10);
  return n > 0 ? [n, n] : null;
}
// Kleinster sinnvoller Gewichtsschritt: Kurzhanteln 2 kg, leichte Kabelgewichte 1,25 kg, sonst 2,5 kg
export function weightStep(ex, weight) {
  if (ex?.equipment === 'Kurzhanteln') return 2;
  return weight < 20 ? 1.25 : 2.5;
}
// Vorschlag, wenn alle normalen Sätze das obere Wdh.-Ende erreicht haben. Aufwärm- und Dropsätze zählen nicht.
export function progressionFrom(sets, target, exId) {
  const range = repRange(target); if (!range) return null;
  const top = range[1];
  const norm = sets.filter((s) => (s.kind || 'N') === 'N' && +s.reps > 0);
  if (!norm.length) return null;
  const weight = Math.max(...norm.map((s) => +s.weight || 0));
  if (!(weight > 0) || norm.some((s) => +s.reps < top)) return null;
  const step = weightStep(S.byId[exId], weight);
  return { weight, next: Math.round((weight + step) * 100) / 100, step, top };
}
export const progressionHint = (exId, target) => progressionFrom(previousSets(exId), target, exId);

// ---------- Wochenvolumen ----------
// Arbeitssätze pro Woche je Gruppe. Je Übung zählt eine Gruppe ganz (Hauptmuskel) oder halb (Hilfsmuskel), nie doppelt.
export function weeklyVolume(routines) {
  const v = Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
  for (const r of routines) for (const it of r.items) {
    const m = S.byId[it.exercise]?.muscles; if (!m) continue;
    for (const g of GROUPS) {
      const f = m.primary.some((x) => g.muscles.includes(x)) ? 1 : m.secondary.some((x) => g.muscles.includes(x)) ? 0.5 : 0;
      v[g.id] += f * (+it.sets || 0);
    }
  }
  return v;
}
let tplCache = null;
export const loadTemplates = async () => (tplCache ||= await api('templates'));
