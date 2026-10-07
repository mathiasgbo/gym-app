import {
  state, save, replaceState, ui, env, DOW,
  esc, num, parseNum, roundTo, pad, todayStr, toDate, addDays, fmtDate, isUrl,
  activeDate, setActiveDate, dayLog, ensureLog, dateBanner,
  doneSets, unitLabel, fmtSet, exerciseNames, topbar, gear, chart,
  baseKey, exEntry, ensureExEntry, exEntriesOn,
  ICONS, brandbar, greeting, profileAge, dayFor, dayTag,
} from './store.js';
import { needsProfile, viewOnboarding, editProfile, setNotice } from './profile.js';
import { viewRoutine, viewRoutineDay, viewEditExercise, viewLibrary, viewReplace, viewNewExercise } from './routine-editor.js';
import { viewRoutines, isRoutineFile, viewTemplates, viewTemplate, templateCards } from './routines.js';
import { viewRoutineImport, viewRoutineReview, viewRoutinePick } from './routine-import.js';
import { viewPlanHub, viewPlanAi, viewPlanReview, viewPlanEdit, viewPlanMeal, viewPlanGroup, viewPlanLink } from './plan-tools.js';
import { viewFood, foodSummaryLine, mealPrepBanner, plan, validPlan, glassMl } from './food.js';
import { energy, avgKcal, ACTIVITY, GOALS } from './nutrition.js';
import { viewCalendar, viewDate, weekStats } from './calendar.js';
import { anthroCard, viewBody } from './anthro.js';
import { viewAddFood, viewNewFood } from './foodlog.js';
import * as native from './native.js';

const SECTIONS = [['main', 'Principal'], ['core', 'Core'], ['extra', 'Extra']];
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $rest = document.getElementById('rest');

const day = id => state.routine.days.find(d => d.id === id);

function target(e) {
  const sets = e.setsMin === e.setsMax ? e.setsMin : `${e.setsMin}-${e.setsMax}`;
  const reps = e.repMin === e.repMax ? e.repMin : `${e.repMin}-${e.repMax}`;
  return `${sets} × ${reps}${e.type === 'time' ? ' s' : ''}${e.perSide ? ' /lado' : ''}`;
}

const topWeight = s => Math.max(0, ...doneSets(s).map(x => x.w || 0));
const bestReps = s => Math.max(0, ...doneSets(s).map(x => x.r));
const totalReps = s => doneSets(s).reduce((a, x) => a + x.r, 0);

// Sesiones de un ejercicio, de la más nueva a la más vieja. Con `before`, solo las anteriores a esa fecha.
function sessionsFor(key, before) {
  return Object.keys(state.logs).sort().reverse()
    .filter(d => !before || d < before)
    .flatMap(d => exEntriesOn(d, key).map(e => ({ date: d, ...e })))
    .filter(s => doneSets(s).length);
}

// ---------- Sugerencias (doble progresión) ----------

function suggest(e, isFirstHeavy) {
  const prev = sessionsFor(e.key, activeDate());
  const last = prev[0];
  const warm = w => isFirstHeavy && w ? ` Calentá antes con 1 serie a ~${num(roundTo(w * 0.55, e.inc))} kg.` : '';

  if (!last) {
    const text = e.type === 'weight'
      ? `Primera vez: elegí un peso con el que llegues a ${e.repMin}-${e.repMax} reps dejando 1-2 en reserva.${isFirstHeavy ? ' Hacé antes 1 serie de calentamiento liviana.' : ''}`
      : `Primera vez: apuntá a ${e.repMin} ${unitLabel(e)} por serie.`;
    return { w: null, r: e.repMin, level: 'new', text };
  }

  const done = doneSets(last);
  const top = topWeight(last);
  const minR = Math.min(...done.map(x => x.r));
  const allTop = done.length >= e.setsMin && done.every(x => x.r >= e.repMax && (e.type !== 'weight' || (x.w || 0) >= top));
  const anyLow = done.some(x => x.r < e.repMin);
  const res = { w: top || null, r: Math.min(e.repMax, Math.max(e.repMin, minR + 1)), level: 'hold', last };

  if (e.type !== 'weight') {
    const step = e.type === 'time' ? 5 : e.type === 'min' ? 2 : 1;
    if (allTop) Object.assign(res, { level: 'up', r: e.repMax, text: e.type === 'time'
      ? `Llegaste a ${e.repMax} s en todas: sumá 5-10 s o probá una variante más difícil.`
      : e.type === 'min' ? `Llegaste a ${e.repMax} min: sumá algunos minutos o subí la intensidad.`
      : `Llegaste a ${e.repMax} reps en todas: probá agregar peso o una variante más difícil.` });
    else res.text = `Buscá +${step} ${unitLabel(e)} por serie (objetivo: ${e.repMax} ${unitLabel(e)} en todas).`;
    return res;
  }

  if (state.settings.deload) {
    const w = roundTo(top * 0.65, e.inc);
    return { ...res, w, r: e.repMin, level: 'deload', text: `Semana de deload: usá ~${num(w)} kg (60-70%), mismas series y reps. Sin llegar al fallo.` };
  }

  if (allTop) {
    const w = top + e.inc;
    Object.assign(res, { w, r: e.repMin, level: 'up', text: `Tocaste ${e.repMax} reps en todas las series. Subí a ${num(w)} kg y volvé a ${e.repMin} reps.${warm(w)}` });
  } else if (anyLow) {
    const prevLow = prev[1] && topWeight(prev[1]) === top && doneSets(prev[1]).some(x => x.r < e.repMin);
    if (prevLow) {
      const w = Math.min(top - e.inc, roundTo(top * 0.9, e.inc));
      Object.assign(res, { w, r: e.repMin, level: 'down', text: `Dos sesiones seguidas por debajo de ${e.repMin} reps con ${num(top)} kg. Bajá a ${num(w)} kg y reconstruí.${warm(w)}` });
    } else {
      res.text = `Mantené ${num(top)} kg y buscá llegar a ${e.repMin} reps en todas las series.${warm(top)}`;
    }
  } else {
    res.text = `Mantené ${num(top)} kg y sumá 1 rep donde puedas (objetivo: ${e.repMax} en todas).${warm(top)}`;
  }

  const stuck = res.level === 'hold' && prev.length >= 3
    && prev.slice(0, 3).every(s => topWeight(s) === top)
    && totalReps(prev[0]) <= totalReps(prev[2]);
  if (stuck) res.text += ' Llevás 3 sesiones sin progresar: revisá descanso, sueño y comida, o cambiá de variante.';
  return res;
}

// ---------- Deload ----------

function weeksSinceDeload() {
  const first = Object.keys(state.logs).sort()[0];
  const from = state.settings.lastDeload || first;
  if (!from) return 0;
  return Math.floor((toDate(todayStr()) - toDate(from)) / (7 * 864e5));
}

function deloadBanner() {
  if (state.settings.deload) return `
    <div class="banner deload"><div><b>Semana de deload activa.</b> Mismo volumen, 60-70% del peso.</div>
    <button class="btn small" data-action="deload-off">Terminar deload</button></div>`;
  const w = weeksSinceDeload();
  if (w < (state.routine.deloadWeeks || 5)) return '';
  return `
    <div class="banner"><div>Llevás <b>${w} semanas</b> desde el último deload. Toca una semana suave.</div>
    <button class="btn small" data-action="deload-on">Empezar deload</button></div>`;
}

// ---------- Videos (IndexedDB, quedan en el teléfono) ----------

let dbP;
const idb = () => dbP ??= new Promise((res, rej) => {
  const r = indexedDB.open('gymapp', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('videos');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function vstore(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('videos', mode);
    const req = fn(tx.objectStore('videos'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
const vget = k => vstore('readonly', s => s.get(k));
const vput = (k, v) => vstore('readwrite', s => s.put(v, k));
const vdel = k => vstore('readwrite', s => s.delete(k));

let videoUrl;
async function showVideo(key) {
  const slot = document.getElementById('video-slot');
  if (!slot) return;
  if (videoUrl) URL.revokeObjectURL(videoUrl), videoUrl = null;
  const blob = await vget(key).catch(() => null);
  if (!blob) { slot.innerHTML = '<p class="muted small">Sin video guardado.</p>'; return; }
  videoUrl = URL.createObjectURL(blob);
  slot.innerHTML = `<video controls playsinline preload="metadata" src="${videoUrl}"></video>
    <button class="btn small ghost" data-action="video-del">Quitar video</button>`;
  slot.closest('details').open = true;
}

// ---------- Vistas: entreno ----------

function viewHome() {
  const R = state.routine;
  const date = activeDate();
  const dow = toDate(date).getDay();
  const today = dayFor(date);
  const log = dayLog();
  const ordered = R.mode === 'rotation' ? R.days : [...R.days].sort((a, b) => ((a.dow ?? 9) || 7) - ((b.dow ?? 9) || 7));
  const rows = ordered.map(d => {
    const n = d.exercises.filter(e => doneSets(exEntry(date, e.key, d.id)).length).length;
    return `<a class="row ${d === today ? 'today' : ''}" href="#/day/${d.id}">
      <span class="dow">${dayTag(d)}</span>
      <span class="grow"><b>${esc(d.title)}</b><small>${d.exercises.length} ejercicios</small></span>
      ${n ? `<span class="pill">${n}/${d.exercises.length}</span>` : ''}
      <span class="chev">›</span></a>`;
  }).join('');
  const food = foodSummaryLine(date);

  return `
    ${brandbar()}
    ${dateBanner()}
    ${deloadBanner()}
    ${date === todayStr() ? mealPrepBanner() : ''}
    <section class="hero">
      ${date === todayStr() ? `<div class="greet">${greeting()}</div>` : ''}
      <div class="muted">${DOW[dow]} · ${fmtDate(date)}</div>
      ${!R.days.length
        ? `<h2>Armá tu rutina</h2><p class="muted">Elegí una plantilla, empezá de cero o importá la que te pasaron.</p>`
        : today
          ? `${R.mode === 'rotation' ? `<div class="muted small">Toca el día ${dayTag(today)}</div>` : ''}<h2>${esc(today.title)}</h2><a class="btn primary big" href="#/day/${today.id}">Empezar entrenamiento</a>`
          : `<h2>Día de descanso</h2><p class="muted">Podés hacer igual el cardio, o entrenar algún día de la lista.</p>`}
      ${R.days.length ? `<label class="check-row"><input type="checkbox" data-action="cardio" ${log?.cardio ? 'checked' : ''}> Cardio hecho</label>` : ''}
      ${food ? `<a class="food-line" href="#/food">${food} <span class="chev">›</span></a>` : ''}
    </section>
    ${R.days.length ? `<div class="section-head"><h3 class="section">${R.mode === 'rotation' ? 'Rotación' : 'Semana'}</h3><a class="small-link" href="#/routine">✎ Editar rutina</a></div>
    <div class="list">${rows}</div>` : `
    <h3 class="section">Plantillas</h3>
    ${templateCards()}
    <h3 class="section">Otras opciones</h3>
    <a class="ob-card pick" href="#/routine"><span><b>Desde cero</b><small>Armá tus días y elegí los ejercicios de la biblioteca.</small></span></a>
    <a class="ob-card pick" href="#/rimport"><span><b>Importar o pegar</b><small>La rutina de tu entrenador: PDF, Word o el texto de WhatsApp.</small></span></a>`}
    <details class="card info">
      <summary>${esc(R.name)} — reglas</summary>
      <dl>
        <dt>Objetivo</dt><dd>${esc(R.goal)}</dd>
        <dt>Calentamiento</dt><dd>${esc(R.warmup)}</dd>
        <dt>Cardio (todos los días)</dt><dd>${esc(R.cardio)}</dd>
        <dt>Progresión</dt><dd>${esc(R.progression)}</dd>
        <dt>Deload</dt><dd>${esc(R.deload)}</dd>
        <dt>Seguridad</dt><dd>${esc(R.safety)}</dd>
      </dl>
    </details>`;
}

function viewDay(id) {
  const d = day(id);
  if (!d) return notFound();
  const log = dayLog();
  const groups = SECTIONS.map(([sec, label]) => {
    const items = d.exercises.map((e, i) => [e, i]).filter(([e]) => e.section === sec);
    if (!items.length) return '';
    return `<h3 class="section">${label}</h3><div class="list">${items.map(([e, i]) => {
      const n = doneSets(exEntry(activeDate(), e.key, d.id)).length;
      const last = sessionsFor(e.key, activeDate())[0];
      const lastTxt = last ? (e.type === 'weight' ? `últ: ${num(topWeight(last))} kg` : `últ: ${bestReps(last)} ${unitLabel(e)}`) : 'nuevo';
      return `<a class="row ${n >= e.setsMin ? 'complete' : ''}" href="#/ex/${d.id}/${i}">
        <span class="grow"><b>${esc(e.name)}</b>
          <small>${target(e)}${e.heavy ? ' · <span class="tag">pesado</span>' : ''}${e.note ? ' · ⚠️' : ''} · ${lastTxt}</small></span>
        <span class="pill ${n >= e.setsMin ? 'ok' : ''}">${n}/${e.setsMin}</span>
      </a>`;
    }).join('')}</div>`;
  }).join('');

  return `
    ${topbar(`${state.routine.mode === 'week' && d.dow != null ? `${DOW[d.dow]} — ` : ''}${d.title}`, '#/', `<a class="icon" href="#/rday/${d.id}" aria-label="Editar día">✎</a>`)}
    ${dateBanner()}
    ${deloadBanner()}
    <p class="note">🔥 ${esc(state.routine.warmup)}</p>
    ${groups}
    <section class="card">
      <label class="check-row"><input type="checkbox" data-action="cardio" ${log?.cardio ? 'checked' : ''}>
        <span><b>Cardio</b><small>${esc(state.routine.cardio)}</small></span></label>
    </section>`;
}

let ctx = null; // ejercicio abierto: { d, i, e, sug }

function viewEx(dayId, idx) {
  const d = day(dayId);
  const i = Number(idx);
  const e = d?.exercises[i];
  if (!e) return notFound();
  const firstHeavy = d.exercises.findIndex(x => x.heavy) === i;
  const sug = suggest(e, firstHeavy);
  ctx = { d, i, e, sug };

  const cur = exEntry(activeDate(), e.key, d.id);
  const lastSets = sug.last?.sets?.filter(x => x.r > 0) || [];
  const rows = Math.max(e.setsMax, cur?.sets?.length || 0);
  const link = state.links[e.key] || '';
  const setRows = Array.from({ length: rows }, (_, k) => {
    const s = cur?.sets?.[k] || {};
    const prev = lastSets[k];
    const rTarget = sug.level === 'hold' && prev ? Math.min(e.repMax, Math.max(e.repMin, prev.r + 1)) : sug.r;
    return `<div class="set ${s.r > 0 ? 'done' : ''}" data-i="${k}">
      <span class="n">${k + 1}${k >= e.setsMin ? '<small>opc.</small>' : ''}</span>
      ${e.type === 'weight' ? `<input type="text" inputmode="decimal" data-field="w" data-i="${k}" value="${s.w ?? ''}" placeholder="${sug.w != null ? num(sug.w) : 'kg'}" aria-label="Peso serie ${k + 1}">` : ''}
      <input type="text" inputmode="numeric" data-field="r" data-i="${k}" value="${s.r ?? ''}" placeholder="${rTarget}" aria-label="${unitLabel(e)} serie ${k + 1}">
      <span class="prev">${prev ? fmtSet(e, prev) : '—'}</span>
      <button class="check" data-action="check" data-i="${k}" aria-label="Marcar serie ${k + 1}">✓</button>
    </div>`;
  }).join('');

  const prevBtn = i > 0 ? `<a class="btn" href="#/ex/${d.id}/${i - 1}">‹ Anterior</a>` : `<a class="btn" href="#/day/${d.id}">‹ Día</a>`;
  const nextBtn = i < d.exercises.length - 1 ? `<a class="btn primary" href="#/ex/${d.id}/${i + 1}">Siguiente ›</a>` : `<a class="btn primary" href="#/day/${d.id}">Terminar ✓</a>`;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(e.name + ' técnica')}`;

  return `
    ${topbar(e.name, `#/day/${d.id}`, `<a class="icon" href="#/edit/${d.id}/${i}/ex" aria-label="Editar ejercicio">✎</a>`)}
    ${dateBanner()}
    <div class="meta">${target(e)}${e.heavy ? ' · <span class="tag">pesado</span>' : ''}</div>
    ${e.note ? `<p class="note warn">${esc(e.note)}</p>` : ''}
    <section class="sug ${sug.level}">
      <div class="sug-title">${{ new: '💡 Arranque', up: '⬆️ Subí', hold: '➡️ Mantené', down: '⬇️ Bajá', deload: '🧘 Deload' }[sug.level]}</div>
      <p>${esc(sug.text)}</p>
      ${sug.last ? `<small class="muted">Última vez (${fmtDate(sug.last.date)}): ${doneSets(sug.last).map(x => fmtSet(e, x)).join(' · ')}</small>` : ''}
    </section>
    <div class="sets">
      <div class="set head"><span class="n">#</span>${e.type === 'weight' ? '<span>kg</span>' : ''}<span>${unitLabel(e)}</span><span class="prev">anterior</span><span></span></div>
      ${setRows}
      <button class="btn small ghost" data-action="add-set">+ Agregar serie</button>
    </div>
    <textarea data-field="note" rows="2" placeholder="Notas de hoy (molestias, sensaciones…)">${esc(cur?.note || '')}</textarea>
    <details class="card">
      <summary>🎬 Video de técnica</summary>
      <div id="video-slot"></div>
      <div class="btns">
        <label class="btn small">📁 Subir video<input type="file" accept="video/*" data-action="video-file" hidden></label>
        <a class="btn small" href="${yt}" target="_blank" rel="noopener">🔎 Buscar en YouTube</a>
      </div>
      <div class="link-row">
        <input type="url" data-field="link" placeholder="Pegar link (YouTube, Instagram…)" value="${esc(link)}">
        ${isUrl(link) ? `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>` : ''}
      </div>
      <p class="muted small">El video subido queda guardado en el teléfono y se ve sin señal. Los links necesitan internet.</p>
    </details>
    <nav class="pager">${prevBtn}${nextBtn}</nav>`;
}

// ---------- Vistas: progreso ----------

function viewProgress(key) {
  const names = exerciseNames();
  if (key) return viewExerciseHistory(decodeURIComponent(key), names);

  const bodyDates = Object.keys(state.body).sort();
  const bodyPts = bodyDates.map(d => ({ y: state.body[d] }));
  const lastBody = bodyDates.at(-1);
  const ref = bodyDates.filter(d => d <= addDays(todayStr(), -28)).at(-1);
  const delta = lastBody && ref ? state.body[lastBody] - state.body[ref] : null;
  const w = weekStats();

  return `
    ${topbar('Progreso', null, gear)}
    <section class="card">
      <h3>Últimos 7 días</h3>
      <div class="kpis">
        <div><b>${w.trained}/${w.planned}</b><small>entrenos</small></div>
        <div><b>${w.cardio}</b><small>cardio</small></div>
        <div><b>${w.food != null ? w.food + '%' : '—'}</b><small>comidas</small></div>
        <div><b>${w.water != null ? num(Math.round(w.water / 100) / 10) + ' L' : '—'}</b><small>agua/día</small></div>
        <div><b>${w.sleep != null ? num(Math.round(w.sleep * 10) / 10) + ' h' : '—'}</b><small>sueño</small></div>
        <div><b>${avgKcal() ? Math.round(avgKcal()).toLocaleString('es-AR') : '—'}</b><small>kcal/día${energy().target ? ` (obj. ${energy().target.toLocaleString('es-AR')})` : ''}</small></div>
      </div>
    </section>
    ${anthroCard()}
    <section class="card">
      <h3>⚖️ Peso corporal</h3>
      <div class="link-row">
        <input type="text" inputmode="decimal" data-field="body" placeholder="kg" value="${state.body[todayStr()] != null ? num(state.body[todayStr()]) : ''}" aria-label="Peso corporal de hoy">
        <span class="muted nowrap">kg hoy</span>
      </div>
      ${chart(bodyPts)}
      <small>${lastBody ? `Último: ${num(state.body[lastBody])} kg (${fmtDate(lastBody)})` : 'Pesate 1 vez por semana, en ayunas, siempre el mismo día.'}
        ${delta != null ? ` · ${delta >= 0 ? '+' : ''}${num(Math.round(delta * 10) / 10)} kg en 4 semanas` : ''}
        ${lastBody && state.profile?.height ? ` · IMC ${num(Math.round(state.body[lastBody] / (state.profile.height / 100) ** 2 * 10) / 10)}` : ''}</small>
    </section>
    ${exercisesSection(names)}`;
}

function kcalCard() {
  if (!state.profile) return '';
  const e = energy();
  const cfg = state.settings.kcal || {};
  const fmt = n => Math.round(n).toLocaleString('es-AR');
  const goals = Object.entries(GOALS).map(([k, g]) =>
    `<option value="${k}" ${e.goal === k ? 'selected' : ''}>${g.label}${g.kcal ? ` (${g.kcal > 0 ? '+' : ''}${g.kcal} kcal)` : ''}</option>`).join('');
  return `
    <section class="card">
      <h3>Objetivo de calorías</h3>
      ${e.auto ? `<p class="muted small">Basal ${fmt(e.bmr)} kcal (${esc(e.bmrSource)}) × actividad ${num(Math.round(e.factor * 100) / 100)}
        (${ACTIVITY[state.profile.activity].label.toLowerCase()} + ${e.trainDays} entrenos por semana) ${GOALS[e.goal].kcal >= 0 ? '+' : '−'} ${Math.abs(GOALS[e.goal].kcal)}
        = <b>${fmt(e.auto)} kcal</b>.</p>`
        : `<p class="muted small">Completá tu perfil (${e.missing.join(' y ')}) para estimarlo.</p>`}
      <label class="stack">Objetivo<select data-action="kcal-goal">${goals}</select></label>
      <label class="check-row"><input type="checkbox" data-action="kcal-manual" ${e.manual ? 'checked' : ''}> Usar un número propio (por ejemplo, el de tu nutricionista)</label>
      ${cfg.mode === 'manual' ? `<div class="link-row" style="margin-top:10px"><input type="text" inputmode="numeric" data-field="kcal-value" value="${cfg.manual || ''}" placeholder="${e.auto || 2500}"><span class="muted nowrap">kcal/día</span></div>` : ''}
      <p class="muted small">Es una estimación de apoyo: tu plan sigue siendo por porciones. Validala con tu nutricionista.</p>
    </section>`;
}

function profileCard() {
  const p = state.profile;
  if (!p) return '';
  const lastBody = Object.keys(state.body).sort().at(-1);
  return `
    <section class="card">
      <h3>Perfil</h3>
      <p class="muted small">${esc(p.name)} · ${profileAge()} años · ${num(p.height)} cm${lastBody ? ` · ${num(state.body[lastBody])} kg` : ''}
        ${p.sex ? ` · ${p.sex === 'f' ? 'femenino' : 'masculino'}` : ''}${ACTIVITY[p.activity] ? ` · ${ACTIVITY[p.activity].label.toLowerCase()}` : ''}</p>
      <button class="btn small" data-action="profile-edit">Editar perfil</button>
    </section>`;
}

let histFilter = 'all'; // día de la rutina elegido en el filtro de ejercicios

function sparkline(vals) {
  if (vals.length < 2) return '<span class="spark"></span>';
  const W = 64, H = 24, P = 3;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, k) => `${P + k * (W - 2 * P) / (vals.length - 1)},${H - P - (v - min) / span * (H - 2 * P)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" /></svg>`;
}

function exercisesSection(names) {
  const days = [...state.routine.days].sort((a, b) => a.dow - b.dow);
  const pool = histFilter === 'all' ? days : days.filter(d => d.id === histFilter);
  const keys = [...new Set(pool.flatMap(d => d.exercises.map(e => e.key)))];
  if (histFilter === 'all') { // ejercicios que ya no están en la rutina pero tienen historial
    for (const l of Object.values(state.logs)) for (const k of Object.keys(l.ex || {}).map(baseKey)) if (!keys.includes(k)) keys.push(k);
  }

  const withData = [], empty = [];
  for (const k of keys) {
    const e = names[k] || { name: k, type: 'weight' };
    const s = sessionsFor(k);
    if (!s.length) { empty.push(e); continue; }
    const val = x => e.type === 'weight' ? topWeight(x) : bestReps(x);
    const unit = e.type === 'weight' ? 'kg' : unitLabel(e);
    const chrono = [...s].reverse();
    const delta = val(s[0]) - val(chrono[0]);
    withData.push(`<a class="row ex-row" href="#/hist/${encodeURIComponent(k)}">
      <span class="grow"><b>${esc(e.name)}</b>
        <small>${num(val(s[0]))} ${unit} · ${fmtDate(s[0].date)} · ${s.length} ${s.length === 1 ? 'sesión' : 'sesiones'}</small></span>
      ${sparkline(chrono.slice(-8).map(val))}
      <span class="trend ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}" title="Desde la primera sesión">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}${delta ? num(delta) : '='}</span>
    </a>`);
  }

  const chips = [['all', 'Todos'], ...days.map(d => [d.id, `${DOW[d.dow].slice(0, 3)} · ${d.title}`])]
    .map(([id, label]) => `<button class="chip ${histFilter === id ? 'on' : ''}" data-action="hist-filter" data-day="${id}">${esc(label)}</button>`).join('');

  return `
    <h3 class="section">Ejercicios</h3>
    <div class="chips scroll-x">${chips}</div>
    <div class="list">${withData.join('') || '<p class="muted">Todavía no registraste ejercicios de este día.</p>'}</div>
    ${empty.length ? `<details class="card empty-list" data-keep="hist-empty"><summary>Sin registros todavía (${empty.length})</summary>
      <p class="muted small">${empty.map(e => esc(e.name)).join(' · ')}</p></details>` : ''}`;
}

function viewExerciseHistory(k, names) {
  const e = names[k] || { name: k, type: 'weight' };
  const s = sessionsFor(k);
  const pts = [...s].reverse().map(x => ({ y: e.type === 'weight' ? topWeight(x) : bestReps(x) }));
  return `
    ${topbar(e.name, '#/hist')}
    ${pts.length > 1 ? `<section class="card"><small class="muted">${e.type === 'weight' ? 'Peso máximo por sesión (kg)' : `Mejor serie (${unitLabel(e)})`}</small>${chart(pts)}</section>` : ''}
    <div class="list">${s.map(x => `<div class="row"><span class="grow"><b>${fmtDate(x.date)}</b>
      <small>${doneSets(x).map(y => fmtSet(e, y)).join(' · ')}${x.note ? ` — ${esc(x.note)}` : ''}</small></span></div>`).join('') || '<p class="muted">Todavía no hay registros.</p>'}</div>`;
}

// ---------- Vistas: ajustes ----------

function nativeSettings() {
  const w = state.settings.water;
  const hours = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k)
    .map(h => `<option value="${h}" ${h === sel ? 'selected' : ''}>${h}:00</option>`).join('');
  const every = [[1, 'cada 1 h'], [1.5, 'cada 1 h 30'], [2, 'cada 2 h'], [3, 'cada 3 h']]
    .map(([v, l]) => `<option value="${v}" ${v === w.every ? 'selected' : ''}>${l}</option>`).join('');
  return `
    <section class="card">
      <h3>⌚ Sueño desde el reloj</h3>
      <p class="muted small">Lee las horas de sueño que Samsung Health, Zepp u otras apps guardan en <b>Health Connect</b>. Solo lectura, y solo el sueño.</p>
      ${env.health
        ? '<p class="small">✅ Conectado. El sueño se carga solo al abrir la app.</p>'
        : '<p class="small">Primero activá en Samsung Health o Zepp la opción de compartir datos con Health Connect.</p>'}
      <div class="btns">
        ${env.health ? '' : '<button class="btn small primary" data-action="health-connect">Conectar Health Connect</button>'}
        <button class="btn small" data-action="health-open">Abrir Health Connect</button>
      </div>
    </section>
    <section class="card">
      <h3>💧 Recordatorios de agua</h3>
      <label class="check-row"><input type="checkbox" data-action="water-enabled" ${w.enabled ? 'checked' : ''}> Avisarme para tomar agua</label>
      <div class="grid3">
        <label class="stack">Desde<select data-action="water-cfg" data-k="from">${hours(w.from, 5, 14)}</select></label>
        <label class="stack">Hasta<select data-action="water-cfg" data-k="to">${hours(w.to, 15, 23)}</select></label>
        <label class="stack">Frecuencia<select data-action="water-cfg" data-k="every">${every}</select></label>
      </div>
      <p class="muted small">La notificación trae un botón <b>Tomé un vaso</b> que lo suma sin abrir la app.</p>
    </section>`;
}

function viewSettings() {
  const p = plan();
  const prep = state.settings.mealPrepDow;
  const dowOpts = ['<option value="">No recordar</option>', ...DOW.map((d, k) => `<option value="${k}" ${prep != null && prep !== '' && Number(prep) === k ? 'selected' : ''}>${d}</option>`)].join('');
  return `
    ${topbar('Ajustes', '#/')}
    ${profileCard()}
    ${kcalCard()}
    ${env.native ? nativeSettings() : ''}
    <section class="card">
      <h3>Plan de alimentación</h3>
      ${p ? `<p class="muted small">${esc(p.title || 'Plan cargado')}${p.goal ? ` · ${esc(p.goal)}` : ''}</p>` : '<p class="muted small">No hay plan cargado.</p>'}
      <a class="btn small" href="#/plan">${p ? 'Ver, editar o reemplazar' : 'Cargar o armar un plan'}</a>
      <label class="stack">Recordatorio de meal prep<select data-action="meal-prep">${dowOpts}</select></label>
    </section>
    <section class="card">
      <h3>Deload</h3>
      <p class="muted small">${esc(state.routine.deload)} Semanas desde el último: <b>${weeksSinceDeload()}</b>.</p>
      <label class="check-row"><input type="checkbox" data-action="deload-toggle" ${state.settings.deload ? 'checked' : ''}> Estoy en semana de deload</label>
    </section>
    <section class="card">
      <h3>Backup</h3>
      <p class="muted small">Exportá tus datos cada tanto: rutina, pesos, comidas, plan y links. Los videos no se incluyen.</p>
      <div class="btns">
        <button class="btn small" data-action="export">⬇ Exportar</button>
        <label class="btn small">⬆ Importar<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </section>
    <section class="card">
      <h3>Almacenamiento</h3>
      <p class="muted small" id="storage">Calculando…</p>
    </section>
    <section class="card">
      <h3>Rutinas</h3>
      <p class="muted small">Activa: ${esc(state.routine.name)}. Cambiá de rutina, creá una nueva o importá una.</p>
      <a class="btn small" href="#/routines">Ver rutinas</a>
    </section>`;
}

const notFound = () => `${topbar('No encontrado', '#/')}<p class="muted">Esa pantalla no existe.</p>`;

// ---------- Router ----------

const TABS = [['', ICONS.train, 'Entreno'], ['food', ICONS.food, 'Comida'], ['cal', ICONS.cal, 'Calendario'], ['hist', ICONS.progress, 'Progreso']];
const TAB_OF = { '': '', day: '', ex: '', edit: '', food: 'food', cal: 'cal', date: 'cal', hist: 'hist', body: 'hist', settings: '', add: 'food', newfood: 'food', plan: 'food', rimport: '', routine: '', routines: '', tpls: '', tpl: '', rday: '', lib: '', replace: '', newex: '' };

function render({ keep = false } = {}) {
  const [, view = '', a, b, c, x] = (location.hash || '#/').split('/');
  const open = keep ? [...$app.querySelectorAll('details[data-keep]')].map(d => [d.dataset.keep, d.open]) : [];
  const y = window.scrollY;
  ctx = null;
  // Sin perfil (primera vez) o editándolo: pantalla de bienvenida, sin pestañas.
  const onboarding = needsProfile();
  document.body.classList.toggle('onboarding', onboarding);
  if (onboarding) {
    $app.innerHTML = viewOnboarding();
    if (keep) window.scrollTo(0, y); else window.scrollTo(0, 0);
    return;
  }
  const html = {
    '': viewHome, day: () => viewDay(a), ex: () => viewEx(a, b), edit: () => viewEditExercise(a, b, c),
    plan: () => ({ '': viewPlanHub, ai: viewPlanAi, review: viewPlanReview, edit: viewPlanEdit,
      meal: () => viewPlanMeal(b), group: () => viewPlanGroup(b), link: () => viewPlanLink(b, c, x) }[a || '']?.() ?? notFound()),
    rimport: () => a === 'review' ? viewRoutineReview() : a === 'pick' ? viewRoutinePick(+b, +c) : viewRoutineImport(),
    routine: viewRoutine, routines: viewRoutines, tpls: viewTemplates, tpl: () => viewTemplate(a), rday: () => viewRoutineDay(a), lib: () => viewLibrary(a, b),
    replace: () => viewReplace(a, b, c), newex: () => viewNewExercise(a, b),
    food: viewFood, cal: () => viewCalendar(a), date: () => viewDate(a) || notFound(),
    hist: () => viewProgress(a), body: viewBody, settings: viewSettings,
    add: () => viewAddFood(a, b, c), newfood: () => viewNewFood(a),
  }[view];
  $app.innerHTML = html ? html() : notFound();
  $tabs.innerHTML = TABS.map(([v, icon, label]) =>
    `<a href="#/${v}" class="${TAB_OF[view] === v ? 'on' : ''}">${icon}${label}</a>`).join('');
  if (keep) {
    for (const [k, isOpen] of open) {
      const d = $app.querySelector(`details[data-keep="${CSS.escape(k)}"]`);
      if (d) d.open = isOpen;
    }
    window.scrollTo(0, y);
  } else requestAnimationFrame(() => window.scrollTo(0, 0));
  if (ctx) showVideo(ctx.e.key);
  if (view === 'settings') showStorage();
  if (view === 'food') syncSleep(activeDate());
}
ui.render = render;
history.scrollRestoration = 'manual';
window.addEventListener('hashchange', () => render());

async function showStorage() {
  const el = document.getElementById('storage');
  if (!el || !navigator.storage?.estimate) return;
  const { usage = 0 } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.();
  el.innerHTML = `Usando ${(usage / 1048576).toFixed(1)} MB. ${persisted ? '✅ Protegido: el sistema no borra los datos.' : '⚠️ Sin protección permanente todavía (se activa al instalar la app).'}`;
}

// ---------- Registro de series ----------

function setSet(e, k, patch) {
  const x = ensureExEntry(activeDate(), e.key, ctx.d.id);
  while (x.sets.length <= k) x.sets.push({});
  Object.assign(x.sets[k], patch);
  save();
}

let restTimer;
function startRest(secs) {
  clearInterval(restTimer);
  const start = Date.now();
  let buzzed = false;
  const fmt = t => `${Math.floor(t / 60)}:${pad(t % 60)}`;
  const tick = () => {
    const t = Math.floor((Date.now() - start) / 1000);
    $rest.innerHTML = `<span>Descanso <b>${fmt(t)}</b> / ${fmt(secs)}</span><button data-action="rest-stop" aria-label="Cerrar">✕</button>`;
    $rest.classList.toggle('ready', t >= secs);
    if (t >= secs && !buzzed) { buzzed = true; navigator.vibrate?.([200, 100, 200]); }
  };
  $rest.hidden = false;
  tick();
  restTimer = setInterval(tick, 1000);
}
function stopRest() { clearInterval(restTimer); $rest.hidden = true; }

// ---------- Eventos ----------

document.addEventListener('change', async ev => {
  const t = ev.target;
  const action = t.dataset.action;
  if (action === 'cardio') {
    ensureLog().cardio = t.checked;
    save();
  } else if (action === 'deload-toggle') {
    t.checked ? deloadOn() : deloadOff();
  } else if (action === 'water-enabled' || action === 'water-cfg') {
    const w = state.settings.water;
    if (action === 'water-enabled') w.enabled = t.checked; else w[t.dataset.k] = Number(t.value);
    save();
    try {
      const n = await native.scheduleWater(w, glassMl());
      if (action === 'water-enabled' && w.enabled) alert(`Listo: ${n} recordatorios por día, de ${w.from}:00 a ${w.to}:00.`);
    } catch (err) {
      w.enabled = false;
      save();
      render({ keep: true });
      alert('No se pudieron programar los recordatorios: ' + err.message);
    }
  } else if (action === 'kcal-goal' || action === 'kcal-manual') {
    const cfg = state.settings.kcal ??= {};
    if (action === 'kcal-goal') cfg.goal = t.value; else cfg.mode = t.checked ? 'manual' : 'auto';
    save();
    render({ keep: true });
  } else if (t.dataset.field === 'kcal-value') {
    const v = parseNum(t.value);
    (state.settings.kcal ??= {}).manual = v > 0 ? Math.round(v) : null;
    save();
    render({ keep: true });
  } else if (action === 'meal-prep') {
    state.settings.mealPrepDow = t.value === '' ? null : Number(t.value);
    save();
  } else if (action === 'video-file' && ctx && t.files[0]) {
    const key = ctx.e.key;
    try {
      await navigator.storage?.persist?.();
      await vput(key, t.files[0]);
      showVideo(key);
    } catch (err) {
      alert('No se pudo guardar el video (¿poco espacio?). ' + err.message);
    }
  } else if (action === 'import' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (validPlan(data)) throw new Error('Ese archivo es un plan de alimentación: cargalo desde "Plan de alimentación".');
      if (isRoutineFile(data)) throw new Error('Ese archivo es una rutina: importala desde Entreno → Editar rutina → Rutinas.');
      if (!data.routine?.days) throw new Error('El archivo no parece un backup de esta app.');
      const hasData = Object.keys(state.logs).length || state.anthro?.length;
      if (hasData && !confirm('Esto reemplaza todos tus datos actuales por los del backup. ¿Seguir?')) return;
      replaceState(data);
      const days = Object.keys(state.logs).length, meds = state.anthro?.length || 0;
      const summary = `${days} ${days === 1 ? 'día' : 'días'} de registros${meds ? `, ${meds} ${meds === 1 ? 'medición' : 'mediciones'}` : ''}${state.food.plan ? ' y tu plan de alimentación' : ''}`;
      if (needsProfile()) setNotice(`✓ Backup restaurado: ${summary}. Completá tu perfil para entrar.`);
      else alert(`Backup restaurado: ${summary}.`);
      location.hash = '#/';
      render();
    } catch (err) { alert('No se pudo importar: ' + err.message); }
  } else if (t.dataset.field === 'body') {
    const v = parseNum(t.value);
    if (v != null && (v < 30 || v > 250)) { alert('Revisá el peso: tiene que estar en kg.'); return; }
    if (v == null) delete state.body[todayStr()]; else state.body[todayStr()] = v;
    save();
    render({ keep: true });
  } else if (ctx && t.dataset.field) {
    const { e } = ctx;
    const f = t.dataset.field;
    if (f === 'w' || f === 'r') {
      const k = Number(t.dataset.i);
      const v = parseNum(t.value);
      setSet(e, k, { [f]: f === 'r' && v != null ? Math.round(v) : v });
      t.closest('.set').classList.toggle('done', exEntry(activeDate(), e.key, ctx.d.id).sets[k].r > 0);
    } else if (f === 'note') {
      ensureExEntry(activeDate(), e.key, ctx.d.id).note = t.value.trim();
      save();
    } else if (f === 'link') {
      const v = t.value.trim();
      if (v && !isUrl(v)) { alert('El link tiene que empezar con http:// o https://'); return; }
      if (v) state.links[e.key] = v; else delete state.links[e.key];
      save();
      render({ keep: true });
    }
  }
});

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
  const action = btn.dataset.action;

  if (action === 'rest-stop') stopRest();
  else if (action === 'date-today') { setActiveDate(null); render(); }
  else if (action === 'profile-edit') { editProfile(Number(btn.dataset.step) || 0); render(); }
  else if (action === 'hist-filter') { histFilter = btn.dataset.day; render({ keep: true }); }
  else if (action === 'deload-on') { deloadOn(); render(); }
  else if (action === 'deload-off') { deloadOff(); render(); }
  else if (action === 'check' && ctx) {
    const { e, sug } = ctx;
    const k = Number(btn.dataset.i);
    const row = btn.closest('.set');
    const wIn = row.querySelector('[data-field="w"]');
    const rIn = row.querySelector('[data-field="r"]');
    if (row.classList.contains('done')) { // desmarcar
      rIn.value = '';
      setSet(e, k, { r: null });
      row.classList.remove('done');
      return;
    }
    if (wIn && !wIn.value) {
      if (sug.w == null) { wIn.focus(); return; }
      wIn.value = num(sug.w);
    }
    if (!rIn.value) rIn.value = rIn.placeholder;
    setSet(e, k, { ...(wIn && { w: parseNum(wIn.value) }), r: Math.round(parseNum(rIn.value) || 0) || null });
    row.classList.add('done');
    startRest(e.rest ?? (e.heavy ? 150 : e.section === 'core' ? 60 : 90));
  } else if (action === 'add-set' && ctx) {
    const cur = exEntry(activeDate(), ctx.e.key, ctx.d.id);
    setSet(ctx.e, Math.max(ctx.e.setsMax, cur?.sets?.length || 0), {});
    render({ keep: true });
  } else if (action === 'video-del' && ctx) {
    if (confirm('¿Quitar el video guardado de este ejercicio?')) { await vdel(ctx.e.key); showVideo(ctx.e.key); }
  } else if (action === 'export' && env.native) {
    try { await native.shareFile(`temple-backup-${todayStr()}.json`, JSON.stringify(state, null, 2)); }
    catch (err) { if (!/cancel/i.test(err.message)) alert('No se pudo exportar: ' + err.message); }
  } else if (action === 'health-connect') {
    try {
      env.health = await native.connectHealth();
      state.settings.healthSleep = env.health;
      save();
      if (!env.health) alert('No se dio permiso para leer el sueño. Podés activarlo desde Health Connect.');
      else syncSleep(todayStr(), true);
      render({ keep: true });
    } catch (err) { alert(err.message); }
  } else if (action === 'health-open') {
    native.openHealthSettings().catch(err => alert(err.message));
  } else if (action === 'sleep-sync') {
    syncSleep(activeDate(), true);
  } else if (action === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `temple-backup-${todayStr()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});

function deloadOn() { state.settings.deload = true; save(); }
function deloadOff() { state.settings.deload = false; state.settings.lastDeload = todayStr(); save(); }

// ---------- Arranque ----------

// Sueño desde Health Connect: se trae una vez por fecha y sesión, salvo que se haya cargado a mano.
const sleepSynced = new Set();
async function syncSleep(date, force = false) {
  if (!env.health) return;
  const F = state.logs[date]?.food;
  if (!force && (F?.sleepManual || sleepSynced.has(date))) return;
  sleepSynced.add(date);
  try {
    const r = await native.readSleep(date);
    if (!r) { if (force) alert('No encontré sueño registrado para esa noche en Health Connect.'); return; }
    const food = ensureLog(date).food ??= {};
    Object.assign(food, { sleep: r.hours, sleepSource: r.source });
    delete food.sleepManual;
    save();
    render({ keep: true });
  } catch (err) {
    if (force) alert('No se pudo leer el sueño: ' + err.message);
  }
}

env.native = await native.initNative().catch(() => false);
render();
if (env.native) {
  native.useNativeFilePicker();
  if (state.settings.healthSleep) env.health = await native.healthAuthorized();
  native.onWaterNotification(kind => {
    if (kind === 'glass') {
      const food = ensureLog(todayStr()).food ??= {};
      food.water = (food.water || 0) + 1;
      save();
    }
    location.hash = '#/food';
    render({ keep: true });
  });
  // Al volver a la app: traer el sueño y redibujar solo si cambió el día. Redibujar siempre rompía
  // la carga de archivos (el selector "vuelve" a la app y el input elegido desaparecía).
  let shownDay = todayStr();
  native.onResume(() => {
    sleepSynced.delete(todayStr());
    syncSleep(todayStr());
    if (todayStr() !== shownDay) { shownDay = todayStr(); render({ keep: true }); }
  });
  syncSleep(todayStr());
  render();
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
navigator.storage?.persist?.();
