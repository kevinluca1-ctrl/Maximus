// Fitness Coach: Oberfläche (Plan, Übungssuche, Detail mit 3D-Viewer). Pfade relativ wegen HA-Ingress.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (p) => fetch('api/' + p).then((r) => { if (!r.ok) throw new Error(p + ': ' + r.status); return r.json(); });
const DAYS = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' };

let theme = 'light';
try { theme = localStorage.getItem('fc-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
let viewer = null, EX = [], BYID = {}, PLAN = null, MUSCLES = {};
function applyTheme() {
  document.documentElement.dataset.theme = theme; $('#theme').textContent = theme === 'dark' ? '☀️' : '🌙';
  if (viewer) viewer.setTheme(theme);
}
$('#theme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('fc-theme', theme); } catch (e) {} applyTheme(); };

function viewPlan() {
  $('#title').textContent = 'Trainingsplan';
  $('#main').innerHTML = PLAN.sessions.map((s) => `<div class="card"><h3>${esc(s.title)}</h3>
    <div class="sub">${DAYS[s.weekday]}, ${s.start} bis ${s.end}</div>
    ${s.items.map((it) => `<a class="row" href="#ex-${it.exercise}"><span>${esc(BYID[it.exercise]?.name_de || it.exercise)}</span><span>${it.sets} × ${esc(it.reps)}</span></a>`).join('')}</div>`).join('');
}
function viewList() {
  $('#title').textContent = 'Übungen';
  $('#main').innerHTML = '<input id="q" type="search" placeholder="Übung suchen (Deutsch oder Englisch)" autocomplete="off"><div id="list"></div>';
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const hits = EX.filter((e) => !q || (e.name_de + ' ' + e.name_en + ' ' + e.alternatives.join(' ')).toLowerCase().includes(q));
    $('#list').innerHTML = hits.length ? `<div class="card">${hits.map((e) => `<a class="row" href="#ex-${e.id}"><span>${esc(e.name_de)}<br><span class="sub">${esc(e.name_en)}</span></span><span>${esc(e.equipment)}</span></a>`).join('')}</div>` : '<p class="note">Keine Übung gefunden.</p>';
  };
  $('#q').oninput = draw; draw();
}
async function viewExercise(id) {
  const e = BYID[id]; if (!e) return viewList();
  $('#title').textContent = e.name_de;
  const chip = (k, c) => `<span class="${c}">${esc(MUSCLES[k] || k)}</span>`;
  $('#main').innerHTML = `<div class="sub">${esc(e.name_en)} · ${esc(e.equipment)} · ${e.sets} × ${esc(e.reps)}</div>
    <div id="v"></div><div class="ctl" id="ctl"></div>
    <h2>Muskeln</h2><div class="chips">${e.muscles.primary.map((k) => chip(k, 'p')).join('')}${e.muscles.secondary.map((k) => chip(k, 's')).join('')}</div>
    <h2>Ausführung</h2><div class="sub">Griff: ${esc(e.grip)}</div><ol>${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <h2>Alternativen</h2><div class="chips">${e.alternatives.map((a) => `<span>${esc(a)}</span>`).join('')}</div>`;
  const [{ ExerciseViewer }, { ANIMS }] = await Promise.all([import('./viewer.js'), import('./anims.js')]);
  if (location.hash !== '#ex-' + id) return;
  const anim = ANIMS[e.anim];
  if (!anim) { $('#v').innerHTML = '<p class="note">Die 3D-Animation für diese Übung folgt.</p>'; return; }
  viewer = new ExerciseViewer($('#v'), { theme });
  viewer.setExercise(anim, e.muscles); viewer.play(true);
  $('#ctl').innerHTML = '<button id="play">⏸</button><input id="t" type="range" min="0" max="1000" value="0"><button id="reset">⟲</button>';
  viewer.onTick = (t) => { $('#t').value = Math.round(t * 1000); };
  $('#t').oninput = () => { viewer.play(false); $('#play').textContent = '▶'; viewer.setT($('#t').value / 1000); };
  $('#play').onclick = () => { viewer.play(!viewer.playing); $('#play').textContent = viewer.playing ? '⏸' : '▶'; };
  $('#reset').onclick = () => viewer.resetView();
}
function route() {
  if (viewer) { viewer.dispose(); viewer = null; }
  const h = location.hash || '#plan';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', h.startsWith('#' + a.dataset.tab) || (a.dataset.tab === 'uebungen' && h.startsWith('#ex-'))));
  window.scrollTo(0, 0);
  if (h.startsWith('#ex-')) viewExercise(h.slice(4)); else if (h === '#uebungen') viewList(); else viewPlan();
}
(async () => {
  applyTheme();
  try {
    const [ex, plan, rigm] = await Promise.all([api('exercises'), api('plan'), import('./viewer.js')]);
    EX = ex.exercises; BYID = Object.fromEntries(EX.map((e) => [e.id, e])); PLAN = plan; MUSCLES = rigm.MUSCLES;
    window.addEventListener('hashchange', route); route();
  } catch (err) { $('#main').innerHTML = `<p class="note">Daten konnten nicht geladen werden (${esc(err.message)}).</p>`; }
})();
