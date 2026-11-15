// Fitness Coach: Oberfläche. Pfade relativ (Home-Assistant-Ingress).
import {
  api, S, MUSCLES, GROUPS, DAYS, loadAll, reloadWorkouts, esc, exName, fmtDate, fmtNum, fmtDur, fmtClock, isoDay,
  e1rm, workSets, volume, exerciseHistory, exerciseRecords, newRecords, previousSets, muscleLoad, groupLoad, setsSince,
  recovery, mondayOf, weekStreak, nextRoutine, progressionFrom, progressionHint, weeklyVolume, loadTemplates,
} from './core.js';
import { bodyMap, exerciseValues } from './bodymap.js';
import { lineChart, barChart, radarChart } from './charts.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = () => $('#main');
let viewer = null, tick = null;

// ---------- Design ----------
function applyTheme() {
  const t = S.settings.theme === 'auto' || !S.settings.theme
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.settings.theme;
  document.documentElement.dataset.theme = t;
  $('#theme').textContent = t === 'dark' ? '☀️' : '🌙';
  if (viewer) viewer.setTheme(t);
  return t;
}
async function saveSettings(patch) { S.settings = await api('settings', { method: 'PUT', body: { ...S.settings, ...patch } }); applyTheme(); }

// ---------- Dialoge ----------
function modal(html, { onOpen } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    document.body.append(bg);
    const close = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener('click', (e) => { if (e.target === bg) close(null); const b = e.target.closest('[data-res]'); if (b) close(b.dataset.res); });
    onOpen?.(bg, close);
  });
}
const confirmBox = (text, ok = 'OK', danger = false) => modal(`<p>${esc(text)}</p><div class="btns"><button data-res="">Abbrechen</button><button data-res="1" class="${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div>`).then(Boolean);
const sheet = (title, options) => modal(`<h3>${esc(title)}</h3>${options.map(([k, l, cls]) => `<button class="sheet-btn ${cls || ''}" data-res="${k}">${esc(l)}</button>`).join('')}<button class="sheet-btn" data-res="">Abbrechen</button>`);
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// Übungsauswahl (Mehrfachauswahl)
function pickExercises(title = 'Übungen hinzufügen', multi = true) {
  const chosen = new Set();
  return modal(`<h3>${esc(title)}</h3><input type="search" id="pq" placeholder="Suchen" autocomplete="off">
    <div class="chips scroll" id="pg"><button class="chip on" data-g="">Alle</button>${GROUPS.map((g) => `<button class="chip" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
    <div class="pick-list" id="pl"></div>
    <div class="btns"><button data-res="">Abbrechen</button>${multi ? '<button class="primary" id="padd">Hinzufügen</button>' : ''}</div>`, {
    onOpen(bg, close) {
      let grp = '';
      const draw = () => {
        const q = $('#pq', bg).value.trim().toLowerCase();
        const g = GROUPS.find((x) => x.id === grp);
        const list = S.exercises.filter((e) => (!q || (e.name_de + ' ' + e.name_en).toLowerCase().includes(q)) && (!g || e.muscles.primary.some((m) => g.muscles.includes(m))));
        $('#pl', bg).innerHTML = list.map((e) => `<button class="ex-row ${chosen.has(e.id) ? 'sel' : ''}" data-id="${e.id}">${bodyMap(exerciseValues(e), 'auto')}<span><b>${esc(e.name_de)}</b><small>${esc(e.equipment)}</small></span><i>${chosen.has(e.id) ? '✓' : ''}</i></button>`).join('') || '<p class="empty">Keine Treffer.</p>';
      };
      $('#pq', bg).oninput = draw;
      $('#pg', bg).onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; grp = b.dataset.g; $$('.chip', $('#pg', bg)).forEach((c) => c.classList.toggle('on', c === b)); draw(); };
      $('#pl', bg).onclick = (e) => {
        const b = e.target.closest('[data-id]'); if (!b) return;
        if (!multi) return close([b.dataset.id]);
        chosen.has(b.dataset.id) ? chosen.delete(b.dataset.id) : chosen.add(b.dataset.id); draw();
      };
      if (multi) $('#padd', bg).onclick = () => close([...chosen]);
      draw();
    },
  }).then((r) => (Array.isArray(r) ? r : []));
}

// ---------- Laufendes Training ----------
let saveTimer = null;
function persistActive() {
  try { localStorage.setItem('fc-active', JSON.stringify(S.active)); } catch (e) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api('active', { method: 'PUT', body: { active: S.active } }).catch(() => {}), 800);
}
function newExerciseBlock(exId, sets = 3, reps = '', rest = null) {
  return { exercise: exId, rest: rest ?? S.settings.rest_default, target: reps, sets: Array.from({ length: sets }, () => ({ kind: 'N', weight: '', reps: '', done: false })) };
}
async function startWorkout(routine) {
  if (S.active && !(await confirmBox('Es läuft bereits ein Training. Verwerfen und neu starten?', 'Neu starten', true))) return;
  S.active = {
    routine_id: routine?.id || null, name: routine?.name || 'Freies Training', started: new Date().toISOString(),
    exercises: (routine?.items || []).map((it) => newExerciseBlock(it.exercise, it.sets, it.reps, it.rest)),
  };
  persistActive(); location.hash = '#workout';
}
function prevFor(exId, idx) { const p = workSets(previousSets(exId)); return p[idx] || p[p.length - 1] || null; }

function viewWorkout() {
  const A = S.active;
  if (!A) { location.hash = '#training'; return; }
  setTitle(A.name);
  main().innerHTML = `<div class="wo-head card"><div><div class="sub">Dauer</div><b id="elapsed">0:00</b></div>
      <div><div class="sub">Volumen</div><b id="wvol">0 kg</b></div><div><div class="sub">Sätze</div><b id="wsets">0</b></div>
      <button class="primary" id="finish">Beenden</button></div>
    <div id="exs"></div>
    <button class="wide" id="addex">+ Übung hinzufügen</button>
    <button class="wide danger-text" id="discard">Training verwerfen</button>`;
  drawExercises();
  const upd = () => { const e = $('#elapsed'); if (e) e.textContent = fmtClock((Date.now() - new Date(A.started)) / 1000); };
  upd(); tick = setInterval(upd, 1000);
  $('#addex').onclick = async () => { const ids = await pickExercises(); ids.forEach((id) => A.exercises.push(newExerciseBlock(id))); persistActive(); drawExercises(); };
  $('#discard').onclick = async () => { if (await confirmBox('Training verwerfen? Alle Einträge gehen verloren.', 'Verwerfen', true)) { S.active = null; try { localStorage.removeItem('fc-active'); } catch (e) {} api('active', { method: 'DELETE' }); stopRest(); location.hash = '#training'; } };
  $('#finish').onclick = finishWorkout;
  const box = $('#exs');
  box.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-f]'); if (!inp) return;
    const { i, j, f } = inp.dataset; A.exercises[i].sets[j][f] = inp.value; persistActive(); updateTotals();
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.dataset.i, j = +b.dataset.j, blk = A.exercises[i];
    const act = b.dataset.act;
    if (act === 'kind') { const order = ['N', 'W', 'D']; blk.sets[j].kind = order[(order.indexOf(blk.sets[j].kind) + 1) % 3]; }
    else if (act === 'prev') { const p = prevFor(blk.exercise, j); if (p) Object.assign(blk.sets[j], { weight: String(p.weight), reps: String(p.reps) }); }
    else if (act === 'done') {
      const s = blk.sets[j];
      if (!s.done) {
        const p = prevFor(blk.exercise, j);
        if (s.weight === '' && p) s.weight = String(p.weight);
        if (s.reps === '') s.reps = p ? String(p.reps) : String(parseInt(blk.target) || '');
        if (!(+s.reps > 0)) { toast('Bitte Wiederholungen eintragen'); return; }
        s.done = true; if (s.kind !== 'W') startRest(blk.rest);
      } else s.done = false;
    } else if (act === 'prog') {
      const pg = progressionHint(blk.exercise, blk.target);
      if (pg) { blk.sets.forEach((x) => { if (!x.done && x.kind !== 'W') x.weight = String(pg.next); }); blk.prog = 'ok'; toast(`${fmtNum(pg.next)} kg eingetragen`); }
    } else if (act === 'progx') blk.prog = 'no';
    else if (act === 'addset') { const last = blk.sets[blk.sets.length - 1]; blk.sets.push({ kind: 'N', weight: last?.weight || '', reps: '', done: false }); }
    else if (act === 'menu') {
      const r = await sheet(exName(blk.exercise), [['replace', 'Übung ersetzen'], ['up', 'Nach oben'], ['down', 'Nach unten'], ['rest', `Pausenzeit ändern (${fmtClock(blk.rest)})`], ['dropset', 'Letzten Satz entfernen'], ['remove', 'Übung entfernen', 'danger-text']]);
      if (r === 'replace') { const [id] = await pickExercises('Übung ersetzen', false); if (id) blk.exercise = id; }
      else if (r === 'up' && i > 0) [A.exercises[i - 1], A.exercises[i]] = [A.exercises[i], A.exercises[i - 1]];
      else if (r === 'down' && i < A.exercises.length - 1) [A.exercises[i + 1], A.exercises[i]] = [A.exercises[i], A.exercises[i + 1]];
      else if (r === 'rest') { const v = await sheet('Pausenzeit', [30, 45, 60, 75, 90, 120, 150, 180, 240].map((s) => [String(s), fmtClock(s)])); if (v) blk.rest = +v; }
      else if (r === 'dropset') blk.sets.pop();
      else if (r === 'remove' && await confirmBox(`${exName(blk.exercise)} entfernen?`, 'Entfernen', true)) A.exercises.splice(i, 1);
    }
    persistActive(); drawExercises();
  });
}
function updateTotals() {
  const done = S.active.exercises.flatMap((b) => b.sets.filter((s) => s.done && s.kind !== 'W'));
  const v = done.reduce((a, s) => a + (+s.weight || 0) * (+s.reps || 0), 0);
  if ($('#wvol')) { $('#wvol').textContent = fmtNum(v, 0) + ' kg'; $('#wsets').textContent = done.length; }
}
function drawExercises() {
  const A = S.active;
  $('#exs').innerHTML = A.exercises.map((blk, i) => {
    const ex = S.byId[blk.exercise]; let n = 0;
    return `<div class="card ex-block">
      <div class="ex-head">${bodyMap(exerciseValues(ex), 'auto')}<a href="#ex/${blk.exercise}">${esc(exName(blk.exercise))}</a><button class="icon" data-act="menu" data-i="${i}">⋯</button></div>
      <div class="sub">Ziel ${esc(blk.target || '-')} Wdh. · Pause ${fmtClock(blk.rest)}</div>
      ${progBox(blk, i)}
      <div class="set-grid head"><span>Satz</span><span>Vorher</span><span>kg</span><span>Wdh.</span><span>✓</span></div>
      ${blk.sets.map((s, j) => {
        const p = prevFor(blk.exercise, j); const label = s.kind === 'W' ? 'A' : s.kind === 'D' ? 'D' : ++n;
        return `<div class="set-grid ${s.done ? 'done' : ''}">
          <button class="kind k${s.kind}" data-act="kind" data-i="${i}" data-j="${j}">${label}</button>
          <button class="prev" data-act="prev" data-i="${i}" data-j="${j}">${p ? `${fmtNum(p.weight)} × ${p.reps}` : '-'}</button>
          <input data-f="weight" data-i="${i}" data-j="${j}" inputmode="decimal" type="number" step="0.5" min="0" value="${esc(s.weight)}" placeholder="${p ? fmtNum(p.weight) : ''}">
          <input data-f="reps" data-i="${i}" data-j="${j}" inputmode="numeric" type="number" min="0" value="${esc(s.reps)}" placeholder="${p ? p.reps : esc(String(parseInt(blk.target) || ''))}">
          <button class="check" data-act="done" data-i="${i}" data-j="${j}">✓</button></div>`;
      }).join('')}
      <button class="wide small" data-act="addset" data-i="${i}">+ Satz</button></div>`;
  }).join('') || '<p class="empty">Noch keine Übungen. Füge eine Übung hinzu.</p>';
  updateTotals();
}
// Progressionshinweis: vor dem Training aus der letzten Einheit, danach live aus den heutigen Sätzen
function progBox(blk, i) {
  const ws = blk.sets.filter((s) => s.kind !== 'W');
  if (ws.length && ws.every((s) => s.done)) {
    const now = progressionFrom(blk.sets.filter((s) => s.done), blk.target, blk.exercise);
    return now ? `<div class="prog done"><span>🎯 Alle Sätze mit ${now.top}+ Wdh. geschafft. Nächstes Mal <b>${fmtNum(now.next)} kg</b>.</span></div>` : '';
  }
  if (blk.prog) return '';
  const pg = progressionHint(blk.exercise, blk.target);
  if (!pg) return '';
  return `<div class="prog"><span>📈 Letztes Mal alle Sätze mit ${pg.top}+ Wdh. bei ${fmtNum(pg.weight)} kg. Heute <b>${fmtNum(pg.next)} kg</b> versuchen?</span>
    <span class="prog-btns"><button class="small" data-act="progx" data-i="${i}">Nein</button><button class="small primary" data-act="prog" data-i="${i}">Übernehmen</button></span></div>`;
}
async function finishWorkout() {
  const A = S.active;
  const sets = [];
  A.exercises.forEach((b, i) => {
    let no = 0;
    b.sets.forEach((s) => { if (s.done && +s.reps > 0) sets.push({ exercise_id: b.exercise, ex_order: i, set_no: ++no, kind: s.kind, weight: +s.weight || 0, reps: +s.reps }); });
  });
  const open = A.exercises.reduce((a, b) => a + b.sets.filter((s) => !s.done).length, 0);
  if (!sets.length) { toast('Noch kein Satz abgehakt'); return; }
  if (open && !(await confirmBox(`${open} Sätze sind nicht abgehakt und werden nicht gespeichert. Training trotzdem beenden?`, 'Beenden'))) return;
  try {
    const w = await api('workouts', { method: 'POST', body: { routine_id: A.routine_id, name: A.name, started: A.started, ended: new Date().toISOString(), sets } });
    lastTargets = Object.fromEntries(A.exercises.filter((b) => b.target).map((b) => [b.exercise, b.target]));
    S.active = null; try { localStorage.removeItem('fc-active'); } catch (e) {}
    stopRest(); await reloadWorkouts(); location.hash = '#fertig/' + w.id;
  } catch (err) { toast('Speichern fehlgeschlagen: ' + err.message); }
}

// Pausentimer
let rest = null, lastTargets = {};
function startRest(sec) {
  stopRest();
  rest = { end: Date.now() + sec * 1000, total: sec };
  const bar = document.createElement('div'); bar.id = 'rest';
  bar.innerHTML = `<div class="rest-fill"></div><span>Pause</span><b id="rest-t"></b><button data-r="-15">−15</button><button data-r="15">+15</button><button data-r="skip">Weiter</button>`;
  document.body.append(bar);
  bar.onclick = (e) => { const r = e.target.dataset.r; if (!r) return; if (r === 'skip') return stopRest(); rest.end += +r * 1000; rest.total += +r; };
  rest.iv = setInterval(() => {
    const left = (rest.end - Date.now()) / 1000;
    $('#rest-t').textContent = fmtClock(left);
    $('.rest-fill', bar).style.width = Math.max(0, 100 * (1 - left / rest.total)) + '%';
    if (left <= 0) { if (S.settings.rest_vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]); stopRest(); toast('Pause vorbei'); }
  }, 250);
}
function stopRest() { if (rest) { clearInterval(rest.iv); rest = null; } $('#rest')?.remove(); }

// ---------- Ansichten ----------
function setTitle(t, back) {
  $('#title').textContent = t;
  $('#back').hidden = !back; $('#back').onclick = () => (typeof back === 'string' ? (location.hash = back) : history.back());
}
function activeBanner() {
  return S.active && location.hash !== '#workout' ? `<a class="banner" href="#workout">● Training läuft: ${esc(S.active.name)} · fortsetzen</a>` : '';
}

function viewTraining() {
  setTitle('Training');
  const nx = nextRoutine();
  main().innerHTML = `${activeBanner()}
    ${nx ? `<div class="card hero"><div class="sub">${nx.inDays === 0 ? 'Heute geplant' : nx.inDays === 1 ? 'Morgen geplant' : `In ${nx.inDays} Tagen`}</div>
      <h2>${esc(nx.routine.name)}</h2><div class="sub">${DAYS[nx.routine.weekday]}, ${nx.routine.start} bis ${nx.routine.end} · ${nx.routine.items.length} Übungen</div>
      <button class="primary wide" data-start="${nx.routine.id}">Training starten</button></div>` : ''}
    <button class="wide" data-start="">+ Freies Training starten</button>
    <h2 class="sec">Routinen <span class="links"><a href="#vorlagen" class="link">Modelle</a><a href="#routine/neu" class="link">+ Neue Routine</a></span></h2>
    ${S.routines.map((r) => `<div class="card routine">
      <div class="r-head"><div><h3>${esc(r.name)}</h3><div class="sub">${r.weekday ? DAYS[r.weekday] + ', ' + r.start + ' bis ' + r.end : 'Kein fester Tag'}</div></div><a class="icon" href="#routine/${r.id}">✎</a></div>
      <div class="sub list">${r.items.map((it) => esc(exName(it.exercise))).join(' · ')}</div>
      <button class="wide small" data-start="${r.id}">Starten</button></div>`).join('')}`;
  main().onclick = (e) => { const b = e.target.closest('[data-start]'); if (b) startWorkout(S.routines.find((r) => r.id === b.dataset.start)); };
}

function viewRoutine(id) {
  const isNew = id === 'neu';
  const orig = S.routines.find((r) => r.id === id);
  const R = isNew ? { id: 'r' + Date.now(), name: '', weekday: '', start: '18:15', end: '19:40', items: [] } : structuredClone(orig);
  if (!isNew && !orig) { location.hash = '#training'; return; }
  setTitle(isNew ? 'Neue Routine' : 'Routine bearbeiten', '#training');
  const draw = () => {
    main().innerHTML = `<div class="card form">
      <label>Name<input id="rn" value="${esc(R.name)}" placeholder="z. B. Gym A: Push"></label>
      <label>Tag<select id="rd"><option value="">Kein fester Tag</option>${Object.entries(DAYS).map(([k, v]) => `<option value="${k}" ${R.weekday === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="two"><label>Beginn<input id="rs" type="time" value="${R.start}"></label><label>Ende<input id="re" type="time" value="${R.end}"></label></div></div>
      ${R.items.map((it, i) => `<div class="card item"><div class="ex-head">${bodyMap(exerciseValues(S.byId[it.exercise]), 'auto')}<b>${esc(exName(it.exercise))}</b>
        <button class="icon" data-mv="-1" data-i="${i}">↑</button><button class="icon" data-mv="1" data-i="${i}">↓</button><button class="icon" data-rm="${i}">✕</button></div>
        <div class="three"><label>Sätze<input data-k="sets" data-i="${i}" type="number" min="1" value="${it.sets}"></label>
        <label>Wdh.<input data-k="reps" data-i="${i}" value="${esc(it.reps)}"></label>
        <label>Pause (s)<input data-k="rest" data-i="${i}" type="number" step="15" value="${it.rest}"></label></div></div>`).join('')}
      <div class="two"><button class="wide" id="radd">+ Übung hinzufügen</button><button class="wide" id="rtpl">Aus Vorlage füllen</button></div>
      <h2 class="sec">Wochenvolumen des Plans</h2><div class="card" id="rvol"></div>
      <button class="primary wide" id="rsave">Speichern</button>
      ${isNew ? '' : '<button class="wide danger-text" id="rdel">Routine löschen</button>'}
      <p class="sub center">Änderungen am Tag und an der Uhrzeit landen erst mit dem Kalender-Sync (Phase 6) im Google-Kalender.</p>`;
    drawVol();
  };
  // Volumen des ganzen Plans mit dieser Routine im aktuellen Bearbeitungsstand
  const drawVol = async () => {
    const T = await loadTemplates(); const box = $('#rvol'); if (!box) return;
    const plan = isNew ? [...S.routines, R] : S.routines.map((r) => (r.id === R.id ? R : r));
    box.innerHTML = volumeBars(weeklyVolume(plan), T.volume) + `<p class="sub">${esc(T.volume.note)} <a class="link" href="#vorlagen">Trainingsmodelle</a></p>`;
  };
  draw();
  main().oninput = (e) => {
    const t = e.target;
    if (t.dataset.k) { R.items[t.dataset.i][t.dataset.k] = t.dataset.k === 'reps' ? t.value : +t.value; if (t.dataset.k === 'sets') drawVol(); }
    if (t.id === 'rn') R.name = t.value; if (t.id === 'rd') R.weekday = t.value; if (t.id === 'rs') R.start = t.value; if (t.id === 're') R.end = t.value;
  };
  main().onclick = async (e) => {
    const t = e.target;
    if (t.dataset.mv) { const i = +t.dataset.i, j = i + +t.dataset.mv; if (j >= 0 && j < R.items.length) [R.items[i], R.items[j]] = [R.items[j], R.items[i]]; draw(); }
    else if (t.dataset.rm) { R.items.splice(+t.dataset.rm, 1); draw(); }
    else if (t.id === 'radd') { (await pickExercises()).forEach((x) => R.items.push({ exercise: x, sets: 3, reps: '8-12', rest: S.settings.rest_default })); draw(); }
    else if (t.id === 'rtpl') {
      const T = await loadTemplates();
      const opts = T.templates.flatMap((m) => m.routines.map((r) => [`${m.id}|${r.id}`, `${m.name}: ${r.name} (${r.items.length} Übungen)`]));
      const k = await sheet('Vorlage wählen', opts); if (!k) return;
      const [mid, rid] = k.split('|'); const src = T.templates.find((m) => m.id === mid).routines.find((r) => r.id === rid);
      if (R.items.length && !(await confirmBox('Die Übungen dieser Routine durch die Vorlage ersetzen?', 'Ersetzen'))) return;
      R.items = structuredClone(src.items); if (!R.name.trim()) R.name = src.name; draw();
    } else if (t.id === 'rsave') {
      if (!R.name.trim()) return toast('Bitte einen Namen eingeben');
      const list = isNew ? [...S.routines, R] : S.routines.map((r) => (r.id === R.id ? R : r));
      S.routines = (await api('routines', { method: 'PUT', body: { routines: list } })).routines;
      toast('Routine gespeichert'); location.hash = '#training';
    } else if (t.id === 'rdel' && await confirmBox(`Routine „${R.name}“ löschen?`, 'Löschen', true)) {
      S.routines = (await api('routines', { method: 'PUT', body: { routines: S.routines.filter((r) => r.id !== R.id) } })).routines;
      location.hash = '#training';
    }
  };
}

// Balken je Muskelgruppe: grüner Bereich = Richtwert, Strich = Plan
function volumeBars(vol, rec) {
  const max = Math.max(24, ...Object.values(vol)) * 1.05;
  const pct = (x) => (100 * x / max).toFixed(1) + '%';
  return `<div class="vol">${GROUPS.map((g) => {
    const v = vol[g.id], [lo, hi] = rec.ranges[g.id] || [0, 0];
    const st = v < lo ? 'low' : v > hi ? 'high' : 'ok';
    return `<div class="vrow ${st}"><span>${esc(g.short || g.name)}</span><div class="vbar"><i class="band" style="left:${pct(lo)};width:${pct(hi - lo)}"></i><i class="val" style="width:${pct(v)}"></i></div><b>${fmtNum(v)}</b></div>`;
  }).join('')}</div><div class="vlegend"><span><i class="band"></i>Richtwert</span><span class="low">unter Richtwert</span><span class="high">darüber</span></div>`;
}
async function viewTemplates() {
  setTitle('Trainingsmodelle', '#training');
  const T = await loadTemplates();
  const daysOf = (m) => m.routines.map((r) => r.weekday ? DAYS[r.weekday].slice(0, 2) : '-').join(', ');
  main().innerHTML = `<p class="sub">Vorlagen nur mit Kabel, Maschinen und Kurzhanteln. Die Balken zeigen die Arbeitssätze pro Woche je Muskelgruppe im Vergleich zum Richtwert.</p>
    <div class="card"><div class="r-head"><b>Dein aktueller Plan</b><span class="sub">${S.routines.length} Routinen</span></div>${volumeBars(weeklyVolume(S.routines), T.volume)}</div>
    ${T.templates.map((m) => `<div class="card tpl">
      <div class="r-head"><div><h3>${esc(m.name)}</h3><div class="sub">${m.days} Tage pro Woche (${daysOf(m)}) · ${esc(m.level)}</div></div></div>
      <p>${esc(m.about)}</p>
      <details><summary>Tage und Übungen</summary>${m.routines.map((r) => `<div class="tday"><b>${esc(r.name)}</b> <span class="sub">${r.items.reduce((a, it) => a + it.sets, 0)} Sätze</span><div class="sub list">${r.items.map((it) => `${it.sets} × ${esc(exName(it.exercise))}`).join(' · ')}</div></div>`).join('')}</details>
      <details><summary>Volumen je Muskelgruppe</summary>${volumeBars(weeklyVolume(m.routines), T.volume)}</details>
      <ul class="tips">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <button class="primary wide" data-apply="${m.id}">Als Plan übernehmen</button></div>`).join('')}
    <p class="sub">${esc(T.volume.note)}</p>`;
  main().onclick = async (e) => {
    const b = e.target.closest('[data-apply]'); if (!b) return;
    const m = T.templates.find((x) => x.id === b.dataset.apply);
    if (!(await confirmBox(`Deine Routinen durch „${m.name}“ ersetzen? Dein Trainingsverlauf bleibt erhalten.`, 'Übernehmen'))) return;
    S.routines = (await api('routines', { method: 'PUT', body: { routines: structuredClone(m.routines) } })).routines;
    toast(`${m.name} übernommen`); location.hash = '#training';
  };
}

let exFilter = { q: '', g: '', eq: '' };
function viewExercises() {
  setTitle('Übungen');
  const eqs = [...new Set(S.exercises.map((e) => e.equipment))].sort();
  main().innerHTML = `${activeBanner()}<input type="search" id="q" placeholder="Übung suchen (Deutsch oder Englisch)" value="${esc(exFilter.q)}" autocomplete="off">
    <div class="chips scroll" id="grp"><button class="chip ${!exFilter.g ? 'on' : ''}" data-g="">Alle</button>${GROUPS.map((g) => `<button class="chip ${exFilter.g === g.id ? 'on' : ''}" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>
    <div class="row-tools"><select id="eq"><option value="">Alle Geräte</option>${eqs.map((q) => `<option ${exFilter.eq === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select><button id="newex">+ Eigene Übung</button></div>
    <div id="list"></div>`;
  const draw = () => {
    const q = exFilter.q.trim().toLowerCase(), g = GROUPS.find((x) => x.id === exFilter.g);
    const hits = S.exercises.filter((e) => (!q || (e.name_de + ' ' + e.name_en).toLowerCase().includes(q))
      && (!g || e.muscles.primary.some((m) => g.muscles.includes(m))) && (!exFilter.eq || e.equipment === exFilter.eq));
    hits.sort((a, b) => (b.plan ? 1 : 0) - (a.plan ? 1 : 0) || a.name_de.localeCompare(b.name_de, 'de'));
    $('#list').innerHTML = hits.length ? `<div class="card flush">${hits.map((e) => `<a class="ex-row" href="#ex/${e.id}">${bodyMap(exerciseValues(e), 'auto')}<span><b>${esc(e.name_de)}</b><small>${esc(e.name_en)} · ${esc(e.equipment)}</small></span>${e.plan ? '<i class="tag">Plan</i>' : e.custom ? '<i class="tag">Eigene</i>' : ''}</a>`).join('')}</div>` : '<p class="empty">Keine Übung gefunden.</p>';
  };
  $('#q').oninput = (e) => { exFilter.q = e.target.value; draw(); };
  $('#eq').onchange = (e) => { exFilter.eq = e.target.value; draw(); };
  $('#grp').onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; exFilter.g = b.dataset.g; $$('.chip', $('#grp')).forEach((c) => c.classList.toggle('on', c === b)); draw(); };
  $('#newex').onclick = newExercise;
  draw();
}
async function newExercise() {
  const r = await modal(`<h3>Eigene Übung</h3><div class="form">
    <label>Name<input id="cn" placeholder="z. B. Brustpresse einarmig"></label>
    <label>Gerät<select id="ce">${['Kabelzug', 'Maschine', 'Kurzhanteln', 'Smith Machine', 'Körpergewicht', 'Eigene'].map((x) => `<option>${x}</option>`).join('')}</select></label>
    <label>Hauptmuskel<select id="cm">${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
    <div class="btns"><button data-res="">Abbrechen</button><button class="primary" id="csave">Anlegen</button></div>`, {
    onOpen(bg, close) { $('#csave', bg).onclick = () => close({ name_de: $('#cn', bg).value.trim(), equipment: $('#ce', bg).value, muscles: { primary: [$('#cm', bg).value], secondary: [] } }); },
  });
  if (!r || !r.name_de) return;
  const e = await api('exercises', { method: 'POST', body: r });
  S.exercises.push(e); S.byId[e.id] = e; location.hash = '#ex/' + e.id;
}

async function viewExercise(id, tab = 'info') {
  const e = S.byId[id]; if (!e) { location.hash = '#uebungen'; return; }
  setTitle(e.name_de, true);
  const tabs = [['info', 'Info'], ['verlauf', 'Verlauf'], ['fortschritt', 'Fortschritt']];
  main().innerHTML = `${activeBanner()}<div class="tabs">${tabs.map(([k, l]) => `<a href="#ex/${id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="tab"></div>`;
  const T = $('#tab');
  const hist = exerciseHistory(id);
  if (tab === 'info') {
    const chip = (k, c) => `<span class="${c}">${esc(MUSCLES[k] || k)}</span>`;
    T.innerHTML = `<div class="sub">${esc(e.name_en)} · ${esc(e.equipment)}</div>
      <div class="visual" id="vis">${e.anim ? '<div id="v"></div><div class="ctl"><button id="play">⏸</button><input id="t" type="range" min="0" max="1000"><button id="reset">⟲</button></div>' : `${bodyMap(exerciseValues(e), 'both')}<p class="sub center">Platzhalter: Die 3D-Animation für diese Übung folgt.</p>`}</div>
      <h2 class="sec">Zielmuskeln</h2><div class="chips">${e.muscles.primary.map((k) => chip(k, 'p')).join('')}${e.muscles.secondary.map((k) => chip(k, 's')).join('')}</div>
      ${e.grip ? `<h2 class="sec">Griff</h2><p>${esc(e.grip)}</p>` : ''}
      <h2 class="sec">Ausführung</h2>${e.steps.length ? `<ol>${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="sub">Keine Anleitung hinterlegt.</p>'}
      ${e.alternatives.length ? `<h2 class="sec">Alternativen</h2><div class="card flush">${e.alternatives.map((a) => S.byId[a]).filter(Boolean).map((a) => `<a class="ex-row" href="#ex/${a.id}">${bodyMap(exerciseValues(a), 'auto')}<span><b>${esc(a.name_de)}</b><small>${esc(a.equipment)}</small></span></a>`).join('')}</div>` : ''}
      ${e.custom ? '<button class="wide danger-text" id="delex">Eigene Übung löschen</button>' : ''}`;
    if (e.custom) $('#delex').onclick = async () => { if (await confirmBox('Übung löschen?', 'Löschen', true)) { await api('exercises/' + id, { method: 'DELETE' }); S.exercises = S.exercises.filter((x) => x.id !== id); delete S.byId[id]; location.hash = '#uebungen'; } };
    if (e.anim) {
      const [{ ExerciseViewer }, { ANIMS }] = await Promise.all([import('./viewer.js'), import('./anims.js')]);
      if (!location.hash.startsWith('#ex/' + id) || !$('#v')) return;
      viewer = new ExerciseViewer($('#v'), { theme: document.documentElement.dataset.theme });
      viewer.setExercise(ANIMS[e.anim], e.muscles); viewer.play(true);
      viewer.onTick = (t) => { $('#t').value = Math.round(t * 1000); };
      $('#t').oninput = () => { viewer.play(false); $('#play').textContent = '▶'; viewer.setT($('#t').value / 1000); };
      $('#play').onclick = () => { viewer.play(!viewer.playing); $('#play').textContent = viewer.playing ? '⏸' : '▶'; };
      $('#reset').onclick = () => viewer.resetView();
    }
  } else if (tab === 'verlauf') {
    T.innerHTML = hist.length ? hist.map((h) => `<a class="card hist" href="#w/${h.workout.id}"><div class="r-head"><b>${fmtDate(h.date)}</b><span class="sub">${esc(h.workout.name)}</span></div>
      ${h.sets.map((s, k) => `<div class="hset"><span class="kind k${s.kind}">${s.kind === 'W' ? 'A' : s.kind === 'D' ? 'D' : s.set_no}</span><span>${fmtNum(s.weight)} kg × ${s.reps}</span><span class="sub">1RM ${fmtNum(e1rm(s.weight, s.reps))}</span></div>`).join('')}</a>`).join('')
      : '<p class="empty">Diese Übung hast du noch nicht trainiert.</p>';
  } else {
    const rec = exerciseRecords(id);
    const metrics = { gewicht: ['Höchstes Gewicht', 'kg', (sets) => Math.max(...workSets(sets).map((s) => s.weight))],
      e1rm: ['Geschätztes 1RM', 'kg', (sets) => Math.max(...workSets(sets).map((s) => e1rm(s.weight, s.reps)))],
      volumen: ['Volumen', 'kg', (sets) => volume(sets)], wdh: ['Meiste Wdh.', '', (sets) => Math.max(...workSets(sets).map((s) => s.reps))] };
    let m = sessionStorage.getItem('fc-metric') || 'e1rm';
    const pts = () => hist.filter((h) => workSets(h.sets).length).map((h) => ({ x: h.date, y: metrics[m][2](h.sets) })).reverse();
    const draw = () => { $('#ch').innerHTML = lineChart(pts(), { unit: metrics[m][1] }); $$('.chip', $('#mt')).forEach((c) => c.classList.toggle('on', c.dataset.m === m)); };
    T.innerHTML = `<div class="chips" id="mt">${Object.entries(metrics).map(([k, v]) => `<button class="chip" data-m="${k}">${v[0]}</button>`).join('')}</div>
      <div class="card" id="ch"></div>
      <h2 class="sec">Persönliche Rekorde</h2>
      <div class="stats four">${[['Höchstes Gewicht', rec.weight, 'kg'], ['Bestes 1RM', rec.e1rm, 'kg'], ['Bestes Volumen', rec.volume, 'kg'], ['Meiste Wdh.', rec.reps, '']].map(([l, v, u]) => `<div class="stat"><small>${l}</small><b>${v ? fmtNum(v, u ? 1 : 0) + (u ? ' ' + u : '') : '-'}</b></div>`).join('')}</div>`;
    $('#mt').onclick = (ev) => { const b = ev.target.closest('[data-m]'); if (b) { m = b.dataset.m; sessionStorage.setItem('fc-metric', m); draw(); } };
    draw();
  }
}

let calMonth = null;
function viewHistory() {
  setTitle('Verlauf');
  const now = new Date(); calMonth ||= new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Set(S.workouts.map((w) => isoDay(w.started)));
  const first = new Date(calMonth), y = first.getFullYear(), mo = first.getMonth();
  const offset = (first.getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const cells = [...Array(offset).fill(''), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const monthCount = S.workouts.filter((w) => { const d = new Date(w.started); return d.getFullYear() === y && d.getMonth() === mo; }).length;
  const byMonth = {};
  for (const w of S.workouts) (byMonth[fmtDate(w.started, { month: 'long', year: 'numeric' })] ||= []).push(w);
  main().innerHTML = `${activeBanner()}<div class="stats"><div class="stat"><small>Wochen-Serie</small><b>🔥 ${weekStreak()}</b></div><div class="stat"><small>Trainings im Monat</small><b>${monthCount}</b></div><div class="stat"><small>Gesamt</small><b>${S.workouts.length}</b></div></div>
    <div class="card cal"><div class="r-head"><button class="icon" id="cp">‹</button><b>${first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</b><button class="icon" id="cn">›</button></div>
      <div class="cal-grid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<span class="dow">${d}</span>`).join('')}
      ${cells.map((d) => { if (!d) return '<span></span>'; const key = isoDay(new Date(y, mo, d)); return `<span class="${days.has(key) ? 'has' : ''} ${key === isoDay(now) ? 'today' : ''}">${d}</span>`; }).join('')}</div></div>
    ${Object.entries(byMonth).map(([m, ws]) => `<h2 class="sec">${m}</h2>${ws.map(workoutCard).join('')}`).join('') || '<p class="empty">Noch keine Trainings. Starte dein erstes Training im Reiter „Training“.</p>'}`;
  $('#cp').onclick = () => { calMonth = new Date(y, mo - 1, 1); viewHistory(); };
  $('#cn').onclick = () => { calMonth = new Date(y, mo + 1, 1); viewHistory(); };
}
function workoutCard(w) {
  const exs = [...new Set(w.sets.map((s) => s.exercise_id))];
  return `<a class="card wcard" href="#w/${w.id}"><div class="r-head"><b>${esc(w.name)}</b><span class="sub">${fmtDate(w.started)}</span></div>
    <div class="wmeta"><span>⏱ ${fmtDur(new Date(w.ended) - new Date(w.started))}</span><span>🏋 ${fmtNum(volume(w.sets), 0)} kg</span><span>${workSets(w.sets).length} Sätze</span></div>
    <div class="sub list">${exs.slice(0, 4).map((x) => `${w.sets.filter((s) => s.exercise_id === x).length} × ${esc(exName(x))}`).join('<br>')}${exs.length > 4 ? `<br>+ ${exs.length - 4} weitere` : ''}</div></a>`;
}
function viewWorkoutDetail(id, finished = false) {
  const w = S.workouts.find((x) => x.id === +id); if (!w) { location.hash = '#verlauf'; return; }
  setTitle(finished ? 'Training beendet' : w.name, finished ? '#training' : true);
  const recs = newRecords(w);
  const exs = [...new Set(w.sets.map((s) => s.exercise_id))];
  main().innerHTML = `${finished ? `<div class="card hero center"><div class="big">💪</div><h2>Stark, ${esc(w.name)} ist gespeichert.</h2></div>` : ''}
    <div class="stats"><div class="stat"><small>Dauer</small><b>${fmtDur(new Date(w.ended) - new Date(w.started))}</b></div><div class="stat"><small>Volumen</small><b>${fmtNum(volume(w.sets), 0)} kg</b></div><div class="stat"><small>Sätze</small><b>${workSets(w.sets).length}</b></div></div>
    ${finished ? readyBox(w, exs) : ''}
    ${recs.length ? `<h2 class="sec">Neue Rekorde 🏆</h2><div class="card flush">${recs.map((r) => `<div class="ex-row"><span><b>${esc(exName(r.exId))}</b><small>${r.kind}</small></span><i class="tag gold">${r.value}</i></div>`).join('')}</div>` : ''}
    <h2 class="sec">${fmtDate(w.started, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
    ${exs.map((x) => `<a class="card hist" href="#ex/${x}/verlauf"><b>${esc(exName(x))}</b>${w.sets.filter((s) => s.exercise_id === x).map((s) => `<div class="hset"><span class="kind k${s.kind}">${s.kind === 'W' ? 'A' : s.kind === 'D' ? 'D' : s.set_no}</span><span>${fmtNum(s.weight)} kg × ${s.reps}</span><span class="sub">1RM ${fmtNum(e1rm(s.weight, s.reps))}</span></div>`).join('')}</a>`).join('')}
    <h2 class="sec">Beanspruchte Muskeln</h2><div class="card">${bodyMap(normalize(muscleLoad(w.sets)), 'both')}</div>
    ${finished ? '<a class="primary wide btn" href="#training">Fertig</a>' : '<button class="wide danger-text" id="wdel">Training löschen</button>'}`;
  if (!finished) $('#wdel').onclick = async () => { if (await confirmBox('Training löschen?', 'Löschen', true)) { await api('workouts/' + w.id, { method: 'DELETE' }); await reloadWorkouts(); location.hash = '#verlauf'; } };
}
// Übungen, bei denen nächstes Mal mehr Gewicht dran ist
function readyBox(w, exs) {
  const items = S.routines.find((r) => r.id === w.routine_id)?.items || [];
  const list = exs.map((x) => {
    const target = lastTargets[x] || items.find((it) => it.exercise === x)?.reps;
    const pg = progressionFrom(w.sets.filter((s) => s.exercise_id === x), target, x);
    return pg && { x, pg };
  }).filter(Boolean);
  return list.length ? `<h2 class="sec">Bereit für mehr Gewicht 📈</h2><div class="card flush">${list.map(({ x, pg }) => `<div class="ex-row"><span><b>${esc(exName(x))}</b><small>Alle Sätze mit ${pg.top}+ Wdh. bei ${fmtNum(pg.weight)} kg</small></span><i class="tag green">${fmtNum(pg.next)} kg</i></div>`).join('')}</div>` : '';
}
const normalize = (load) => { const mx = Math.max(1, ...Object.values(load)); return Object.fromEntries(Object.entries(load).map(([k, v]) => [k, v / mx])); };
const groupValues = (g, v) => Object.fromEntries(g.muscles.map((m) => [m, v]));

function viewProfile() {
  setTitle('Profil');
  const wk = mondayOf(new Date());
  const weeks = Array.from({ length: 12 }, (_, i) => new Date(wk.getTime() - (11 - i) * 7 * 864e5));
  const perWeek = weeks.map((d) => S.workouts.filter((w) => mondayOf(w.started).getTime() === d.getTime()).length);
  const rec = recovery();
  const weekLoad = muscleLoad(S.workouts.filter((w) => new Date(w.started) >= wk).flatMap((w) => w.sets));
  const monthLoad = groupLoad(muscleLoad(setsSince(30)));
  const lastM = S.measurements[S.measurements.length - 1];
  const records = S.exercises.filter((e) => e.plan).map((e) => ({ e, r: exerciseRecords(e.id) })).filter((x) => x.r.e1rm).sort((a, b) => b.r.e1rm - a.r.e1rm).slice(0, 6);
  const overall = Math.round(Object.values(rec).reduce((a, b) => a + b, 0) / GROUPS.length);
  main().innerHTML = `${activeBanner()}
    <div class="card"><div class="r-head"><b>Trainings pro Woche</b><span class="sub">letzte 12 Wochen</span></div>${barChart(weeks.map((d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })), perWeek)}</div>
    <div class="stats"><div class="stat"><small>Wochen-Serie</small><b>🔥 ${weekStreak()}</b></div><div class="stat"><small>Trainings</small><b>${S.workouts.length}</b></div><div class="stat"><small>Gewicht</small><b>${lastM?.weight ? fmtNum(lastM.weight) + ' kg' : '-'}</b></div></div>
    <a class="card linkcard" href="#erholung"><div class="r-head"><div><b>Muskelerholung</b><div class="sub">Welche Muskeln bereit sind</div></div><span class="ring" style="--p:${overall}">${overall}%</span></div>
      <div class="rec-strip">${GROUPS.map((g) => `<div>${bodyMap(groupValues(g, 1), 'auto')}<small>${esc(g.short || g.name)}</small><span class="pill p${rec[g.id] >= 90 ? 3 : rec[g.id] >= 60 ? 2 : 1}">${rec[g.id]}%</span></div>`).join('')}</div><div class="link right">Alle anzeigen</div></a>
    <div class="card"><b>Diese Woche</b><div class="sub">Welche Muskeln du trainiert hast</div>${bodyMap(normalize(weekLoad), 'both')}</div>
    <div class="card"><b>Diesen Monat</b><div class="sub">Sätze je Muskelgruppe, letzte 30 Tage</div>${radarChart(GROUPS.map((g) => g.short || g.name), GROUPS.map((g) => monthLoad[g.id]))}</div>
    <h2 class="sec">Persönliche Rekorde</h2>
    ${records.length ? `<div class="card flush">${records.map(({ e, r }) => `<a class="ex-row" href="#ex/${e.id}/fortschritt">${bodyMap(exerciseValues(e), 'auto')}<span><b>${esc(e.name_de)}</b><small>Bestes Gewicht ${fmtNum(r.weight)} kg</small></span><i class="tag gold">1RM ${fmtNum(r.e1rm)}</i></a>`).join('')}</div>` : '<p class="empty">Rekorde erscheinen nach deinen ersten Trainings.</p>'}
    <h2 class="sec">Mehr</h2>
    <div class="card flush">
      <a class="ex-row" href="#messen"><span><b>Körpermaße</b><small>Gewicht, Bauchumfang, Körperfett</small></span><i>›</i></a>
      <a class="ex-row" href="#platten"><span><b>Plattenrechner</b><small>Scheiben pro Seite berechnen</small></span><i>›</i></a>
      <a class="ex-row" href="api/export.csv" download><span><b>Daten exportieren</b><small>Alle Sätze als CSV-Datei</small></span><i>↓</i></a>
      <a class="ex-row" href="#einstellungen"><span><b>Einstellungen</b><small>Pausentimer, Design, Kalender</small></span><i>›</i></a></div>`;
}
function viewRecovery() {
  setTitle('Muskelerholung', '#profil');
  const rec = recovery();
  const last = {};
  for (const w of S.workouts) for (const s of w.sets) { const m = S.byId[s.exercise_id]?.muscles; if (!m) continue; for (const g of GROUPS) if (!last[g.id] && m.primary.some((x) => g.muscles.includes(x))) last[g.id] = w.started; }
  const overall = Math.round(Object.values(rec).reduce((a, b) => a + b, 0) / GROUPS.length);
  main().innerHTML = `<div class="card r-head"><span class="ring big" style="--p:${overall}">${overall}%</span><div><b>Gesamterholung</b><div class="sub">Durchschnitt aller Muskelgruppen, berechnet aus den Trainings der letzten 7 Tage. Belastung klingt über ca. 72 Stunden ab.</div></div></div>
    ${['Push', 'Pull', 'Beine', 'Rumpf'].map((cat) => `<h2 class="sec">${cat}</h2><div class="card flush">${GROUPS.filter((g) => g.cat === cat).map((g) => `<div class="ex-row">${bodyMap(groupValues(g, 1), 'auto')}<span><b>${esc(g.name)}</b><small>${last[g.id] ? 'Zuletzt ' + fmtDate(last[g.id], { weekday: 'short', day: '2-digit', month: '2-digit' }) : rec[g.id] < 100 ? 'Als Hilfsmuskel beteiligt' : 'Kein Training in letzter Zeit'}</small></span><i class="pill p${rec[g.id] >= 90 ? 3 : rec[g.id] >= 60 ? 2 : 1}">${rec[g.id]}%</i></div>`).join('')}</div>`).join('')}`;
}
function viewMeasure() {
  setTitle('Körpermaße', '#profil');
  const M = S.measurements;
  const ser = (k) => M.filter((m) => m[k] != null).map((m) => ({ x: m.date, y: m[k] }));
  let metric = 'weight';
  const names = { weight: ['Gewicht', 'kg'], waist: ['Bauchumfang', 'cm'], bodyfat: ['Körperfett', '%'] };
  const draw = () => {
    main().innerHTML = `<div class="card form"><div class="three"><label>Gewicht (kg)<input id="mw" inputmode="decimal" type="number" step="0.1"></label><label>Bauch (cm)<input id="mb" inputmode="decimal" type="number" step="0.5"></label><label>Fett (%)<input id="mf" inputmode="decimal" type="number" step="0.1"></label></div>
      <label>Datum<input id="md" type="date" value="${isoDay(new Date())}"></label><button class="primary wide" id="madd">Eintragen</button></div>
      <div class="chips">${Object.entries(names).map(([k, [l]]) => `<button class="chip ${k === metric ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
      <div class="card">${lineChart(ser(metric), { unit: names[metric][1] })}</div>
      ${[...M].reverse().map((m) => `<div class="card r-head"><span><b>${fmtDate(m.date)}</b><br><span class="sub">${[m.weight && fmtNum(m.weight) + ' kg', m.waist && fmtNum(m.waist) + ' cm Bauch', m.bodyfat && fmtNum(m.bodyfat) + ' % Fett'].filter(Boolean).join(' · ')}</span></span><button class="icon" data-del="${m.id}">✕</button></div>`).join('')}`;
  };
  draw();
  main().onclick = async (e) => {
    const t = e.target;
    if (t.dataset.m) { metric = t.dataset.m; draw(); }
    else if (t.id === 'madd') {
      try { S.measurements = (await api('measurements', { method: 'POST', body: { date: $('#md').value, weight: $('#mw').value, waist: $('#mb').value, bodyfat: $('#mf').value } })).measurements; toast('Gespeichert'); draw(); }
      catch (err) { toast(err.message); }
    } else if (t.dataset.del && await confirmBox('Eintrag löschen?', 'Löschen', true)) { S.measurements = (await api('measurements/' + t.dataset.del, { method: 'DELETE' })).measurements; draw(); }
  };
}
function viewPlates() {
  setTitle('Plattenrechner', '#profil');
  const PL = [25, 20, 15, 10, 5, 2.5, 1.25];
  main().innerHTML = `<div class="card form"><div class="two"><label>Zielgewicht (kg)<input id="pt" type="number" inputmode="decimal" step="0.5" value="60"></label>
    <label>Stange (kg)<select id="pb"><option>20</option><option>15</option><option>10</option><option value="0">Keine (Maschine)</option></select></label></div></div><div class="card center" id="pr"></div>`;
  const calc = () => {
    const t = +$('#pt').value || 0, b = +$('#pb').value; let side = (t - b) / 2; const out = [];
    for (const p of PL) while (side >= p - 1e-9) { out.push(p); side -= p; }
    $('#pr').innerHTML = t < b ? '<p class="sub">Das Zielgewicht ist leichter als die Stange.</p>'
      : `<div class="plates">${out.map((p) => `<span class="plate" style="--h:${40 + p * 3}px">${fmtNum(p, 2)}</span>`).join('') || '<span class="sub">Nur die Stange</span>'}</div><p>Pro Seite: <b>${out.map((p) => fmtNum(p, 2)).join(' + ') || '0'}</b> kg</p>${side > 0.01 ? `<p class="sub">Rest ${fmtNum(side * 2, 2)} kg lässt sich mit diesen Scheiben nicht abbilden.</p>` : ''}`;
  };
  $('#pt').oninput = calc; $('#pb').onchange = calc; calc();
}
async function viewSettings() {
  setTitle('Einstellungen', '#profil');
  const st = S.settings;
  let g = { connected: false, note: '' };
  try { g = await api('google/status'); } catch (e) {}
  main().innerHTML = `<div class="card form">
    <label>Standard-Pausenzeit<select id="sr">${[45, 60, 75, 90, 120, 150, 180].map((s) => `<option value="${s}" ${st.rest_default === s ? 'selected' : ''}>${fmtClock(s)}</option>`).join('')}</select></label>
    <label class="check-row"><input type="checkbox" id="sv" ${st.rest_vibrate ? 'checked' : ''}> Vibration am Ende der Pause</label>
    <label>Design<select id="st">${[['auto', 'Wie das Gerät'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<option value="${k}" ${st.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <h2 class="sec">Google-Kalender</h2><div class="card"><b>${g.connected ? 'Verbunden' : 'Noch nicht verbunden'}</b><div class="sub">${esc(g.note || '')}</div></div>
    <h2 class="sec">Daten</h2><button class="wide danger-text" id="rr">Routinen auf den Ausgangsplan zurücksetzen</button>`;
  main().onchange = (e) => {
    if (e.target.id === 'sr') saveSettings({ rest_default: +e.target.value });
    if (e.target.id === 'sv') saveSettings({ rest_vibrate: e.target.checked });
    if (e.target.id === 'st') saveSettings({ theme: e.target.value });
  };
  $('#rr').onclick = async () => { if (await confirmBox('Alle Routinen auf Gym A, B und C zurücksetzen?', 'Zurücksetzen', true)) { S.routines = (await api('routines/reset', { method: 'POST' })).routines; toast('Zurückgesetzt'); } };
}

// ---------- Router ----------
function route() {
  if (viewer) { viewer.dispose(); viewer = null; }
  clearInterval(tick); main().onclick = null; main().oninput = null; main().onchange = null;
  const h = location.hash || '#training';
  const [p, a, b] = h.slice(1).split('/');
  const tab = { training: 'training', workout: 'training', routine: 'training', vorlagen: 'training', uebungen: 'uebungen', ex: 'uebungen', verlauf: 'verlauf', w: 'verlauf', fertig: 'training' }[p] || 'profil';
  $$('nav a').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  document.body.classList.toggle('in-workout', p === 'workout');
  window.scrollTo(0, 0);
  ({
    training: viewTraining, workout: viewWorkout, routine: () => viewRoutine(a), vorlagen: viewTemplates, uebungen: viewExercises,
    ex: () => viewExercise(a, b), verlauf: viewHistory, w: () => viewWorkoutDetail(a), fertig: () => viewWorkoutDetail(a, true),
    profil: viewProfile, erholung: viewRecovery, messen: viewMeasure, platten: viewPlates, einstellungen: viewSettings,
  }[p] || viewTraining)();
}

(async () => {
  $('#theme').onclick = () => saveSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
  try {
    await loadAll(); applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
    window.addEventListener('hashchange', route); route();
  } catch (err) { main().innerHTML = `<p class="empty">Daten konnten nicht geladen werden (${esc(err.message)}).</p>`; }
})();
