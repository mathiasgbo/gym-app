import { DEFAULT_ROUTINE, ex, slug } from './routine.js';
import {
  state, save, replaceState, ui, DOW,
  esc, num, parseNum, roundTo, pad, todayStr, toDate, addDays, fmtDate, isUrl,
  activeDate, setActiveDate, dayLog, ensureLog, dateBanner,
  doneSets, unitLabel, fmtSet, exerciseNames, topbar, gear, chart,
} from './store.js';
import { viewFood, foodSummaryLine, mealPrepBanner, plan, validPlan } from './food.js';
import { viewCalendar, viewDate, weekStats } from './calendar.js';

const SECTIONS = [['main', 'Principal'], ['core', 'Core'], ['extra', 'Extra']];
const TYPES = [['weight', 'Peso × reps'], ['reps', 'Solo reps (peso corporal)'], ['time', 'Tiempo (segundos)']];
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
    .map(d => ({ date: d, ...state.logs[d].ex?.[key] }))
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
    const step = e.type === 'time' ? 5 : 1;
    if (allTop) Object.assign(res, { level: 'up', r: e.repMax, text: e.type === 'time'
      ? `Llegaste a ${e.repMax} s en todas: sumá 5-10 s o probá una variante más difícil.`
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
  if (w < 5) return '';
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
  const today = R.days.find(d => d.dow === dow);
  const log = dayLog();
  const rows = [...R.days].sort((a, b) => a.dow - b.dow).map(d => {
    const n = d.exercises.filter(e => doneSets(log?.ex?.[e.key]).length).length;
    return `<a class="row ${d === today ? 'today' : ''}" href="#/day/${d.id}">
      <span class="dow">${DOW[d.dow].slice(0, 3)}</span>
      <span class="grow"><b>${esc(d.title)}</b><small>${d.exercises.length} ejercicios</small></span>
      ${n ? `<span class="pill">${n}/${d.exercises.length}</span>` : ''}
      <span class="chev">›</span></a>`;
  }).join('');
  const food = foodSummaryLine(date);

  return `
    ${topbar('Gym', null, gear)}
    ${dateBanner()}
    ${deloadBanner()}
    ${date === todayStr() ? mealPrepBanner() : ''}
    <section class="hero">
      <div class="muted">${DOW[dow]} · ${fmtDate(date)}</div>
      ${today
        ? `<h2>${esc(today.title)}</h2><a class="btn primary big" href="#/day/${today.id}">Empezar entrenamiento</a>`
        : `<h2>Día de descanso</h2><p class="muted">Podés hacer igual el cardio, o entrenar algún día de la lista.</p>`}
      <label class="check-row"><input type="checkbox" data-action="cardio" ${log?.cardio ? 'checked' : ''}> Cardio hecho</label>
      ${food ? `<a class="food-line" href="#/food">${food} <span class="chev">›</span></a>` : ''}
    </section>
    <h3 class="section">Semana</h3>
    <div class="list">${rows}</div>
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
      const n = doneSets(log?.ex?.[e.key]).length;
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
    ${topbar(`${DOW[d.dow]} — ${d.title}`, '#/', `<a class="icon" href="#/edit/${d.id}/new" aria-label="Agregar ejercicio">＋</a>`)}
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

  const cur = dayLog()?.ex?.[e.key];
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
    ${topbar(e.name, `#/day/${d.id}`, `<a class="icon" href="#/edit/${d.id}/${i}" aria-label="Editar ejercicio">✎</a>`)}
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

function viewEdit(dayId, idx) {
  const d = day(dayId);
  if (!d) return notFound();
  const isNew = idx === 'new';
  const e = isNew ? ex('', 3, '10-12') : d.exercises[Number(idx)];
  if (!e) return notFound();
  const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  return `
    ${topbar(isNew ? 'Nuevo ejercicio' : 'Editar ejercicio', isNew ? `#/day/${d.id}` : `#/ex/${d.id}/${idx}`)}
    <form class="card form" data-form="edit" data-day="${d.id}" data-idx="${idx}">
      <label>Nombre<input name="name" required value="${esc(e.name)}"></label>
      <div class="grid2">
        <label>Series mín.<input name="setsMin" type="number" min="1" value="${e.setsMin}"></label>
        <label>Series máx.<input name="setsMax" type="number" min="1" value="${e.setsMax}"></label>
        <label>Reps/seg mín.<input name="repMin" type="number" min="1" value="${e.repMin}"></label>
        <label>Reps/seg máx.<input name="repMax" type="number" min="1" value="${e.repMax}"></label>
      </div>
      <label>Tipo<select name="type">${opt(TYPES, e.type)}</select></label>
      <label>Sección<select name="section">${opt(SECTIONS, e.section)}</select></label>
      <label>Salto de peso al progresar (kg)<input name="inc" type="text" inputmode="decimal" value="${num(e.inc)}"></label>
      <label class="check-row"><input type="checkbox" name="heavy" ${e.heavy ? 'checked' : ''}> Pesado (descanso largo)</label>
      <label class="check-row"><input type="checkbox" name="perSide" ${e.perSide ? 'checked' : ''}> Por lado</label>
      <label>Nota / advertencia<input name="note" value="${esc(e.note)}"></label>
      <button class="btn primary block" type="submit">Guardar</button>
      ${isNew ? '' : `
        <div class="btns">
          <button class="btn small" type="button" data-action="move" data-dir="-1">↑ Subir</button>
          <button class="btn small" type="button" data-action="move" data-dir="1">↓ Bajar</button>
          <button class="btn small danger" type="button" data-action="delete-ex">Eliminar</button>
        </div>
        <p class="muted small">El historial se mantiene aunque cambies el nombre.</p>`}
    </form>`;
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

  const keys = [...new Set([...Object.keys(names), ...Object.values(state.logs).flatMap(l => Object.keys(l.ex || {}))])];
  const rows = keys.map(k => {
    const e = names[k] || { name: k, type: 'weight' };
    const s = sessionsFor(k);
    return `<a class="row" href="#/hist/${encodeURIComponent(k)}"><span class="grow"><b>${esc(e.name)}</b>
      <small>${s.length ? `${s.length} ${s.length === 1 ? "sesión" : "sesiones"} · últ: ${e.type === 'weight' ? num(topWeight(s[0])) + ' kg' : bestReps(s[0]) + ' ' + unitLabel(e)}` : 'sin registros'}</small></span>
      <span class="chev">›</span></a>`;
  }).join('');

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
      </div>
    </section>
    <section class="card">
      <h3>⚖️ Peso corporal</h3>
      <div class="link-row">
        <input type="text" inputmode="decimal" data-field="body" placeholder="kg" value="${state.body[todayStr()] != null ? num(state.body[todayStr()]) : ''}" aria-label="Peso corporal de hoy">
        <span class="muted nowrap">kg hoy</span>
      </div>
      ${chart(bodyPts)}
      <small>${lastBody ? `Último: ${num(state.body[lastBody])} kg (${fmtDate(lastBody)})` : 'Pesate 1 vez por semana, en ayunas, siempre el mismo día.'}
        ${delta != null ? ` · ${delta >= 0 ? '+' : ''}${num(Math.round(delta * 10) / 10)} kg en 4 semanas` : ''}</small>
    </section>
    <h3 class="section">Ejercicios</h3>
    <div class="list">${rows}</div>`;
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

function viewSettings() {
  const p = plan();
  const prep = state.settings.mealPrepDow;
  const dowOpts = ['<option value="">No recordar</option>', ...DOW.map((d, k) => `<option value="${k}" ${prep != null && prep !== '' && Number(prep) === k ? 'selected' : ''}>${d}</option>`)].join('');
  return `
    ${topbar('Ajustes', '#/')}
    <section class="card">
      <h3>Plan de alimentación</h3>
      ${p ? `<p class="muted small">${esc(p.title || 'Plan cargado')}${p.goal ? ` · ${esc(p.goal)}` : ''}</p>` : '<p class="muted small">No hay plan cargado.</p>'}
      <div class="btns">
        <label class="btn small">📄 ${p ? 'Reemplazar' : 'Cargar'} plan<input type="file" accept="application/json,.json" data-action="plan-file" hidden></label>
        ${p ? '<button class="btn small danger" data-action="plan-remove">Quitar plan</button>' : ''}
      </div>
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
      <h3>Rutina</h3>
      <p class="muted small">Volver a la rutina original (Mes 2). Tu historial de pesos se mantiene.</p>
      <button class="btn small danger" data-action="reset-routine">Restaurar rutina original</button>
    </section>`;
}

const notFound = () => `${topbar('No encontrado', '#/')}<p class="muted">Esa pantalla no existe.</p>`;

// ---------- Router ----------

const TABS = [['', '🏋️', 'Entreno'], ['food', '🍽️', 'Comida'], ['cal', '📅', 'Calendario'], ['hist', '📈', 'Progreso']];
const TAB_OF = { '': '', day: '', ex: '', edit: '', food: 'food', cal: 'cal', date: 'cal', hist: 'hist', settings: '' };

function render({ keep = false } = {}) {
  const [, view = '', a, b] = (location.hash || '#/').split('/');
  const open = keep ? [...$app.querySelectorAll('details[data-keep]')].map(d => [d.dataset.keep, d.open]) : [];
  const y = window.scrollY;
  ctx = null;
  const html = {
    '': viewHome, day: () => viewDay(a), ex: () => viewEx(a, b), edit: () => viewEdit(a, b),
    food: viewFood, cal: () => viewCalendar(a), date: () => viewDate(a) || notFound(),
    hist: () => viewProgress(a), settings: viewSettings,
  }[view];
  $app.innerHTML = html ? html() : notFound();
  $tabs.innerHTML = TABS.map(([v, icon, label]) =>
    `<a href="#/${v}" class="${TAB_OF[view] === v ? 'on' : ''}"><span>${icon}</span>${label}</a>`).join('');
  if (keep) {
    for (const [k, isOpen] of open) {
      const d = $app.querySelector(`details[data-keep="${CSS.escape(k)}"]`);
      if (d) d.open = isOpen;
    }
    window.scrollTo(0, y);
  } else requestAnimationFrame(() => window.scrollTo(0, 0));
  if (ctx) showVideo(ctx.e.key);
  if (view === 'settings') showStorage();
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
  const L = ensureLog();
  L.ex ??= {};
  const x = L.ex[e.key] ??= { sets: [] };
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
      if (!data.routine?.days) throw new Error('El archivo no parece un backup de esta app.');
      if (!confirm('Esto reemplaza todos tus datos actuales por los del backup. ¿Seguir?')) return;
      replaceState(data);
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
      t.closest('.set').classList.toggle('done', dayLog().ex[e.key].sets[k].r > 0);
    } else if (f === 'note') {
      const L = ensureLog();
      ((L.ex ??= {})[e.key] ??= { sets: [] }).note = t.value.trim();
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
  else if (action === 'deload-on') { deloadOn(); render(); }
  else if (action === 'deload-off') { deloadOff(); render(); }
  else if (action === 'plan-remove') {
    if (confirm('¿Quitar el plan de alimentación? Tus registros de comidas se mantienen.')) { state.food.plan = null; save(); render(); }
  } else if (action === 'check' && ctx) {
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
    startRest(e.heavy ? 150 : e.section === 'core' ? 60 : 90);
  } else if (action === 'add-set' && ctx) {
    const cur = dayLog()?.ex?.[ctx.e.key];
    setSet(ctx.e, Math.max(ctx.e.setsMax, cur?.sets?.length || 0), {});
    render({ keep: true });
  } else if (action === 'video-del' && ctx) {
    if (confirm('¿Quitar el video guardado de este ejercicio?')) { await vdel(ctx.e.key); showVideo(ctx.e.key); }
  } else if (action === 'export') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `gym-backup-${todayStr()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if (action === 'reset-routine') {
    if (confirm('¿Restaurar la rutina original? Se pierden los cambios que hiciste a la rutina (no el historial).')) {
      state.routine = structuredClone(DEFAULT_ROUTINE);
      save();
      location.hash = '#/';
    }
  } else if (action === 'move' || action === 'delete-ex') {
    const form = btn.closest('form');
    const d = day(form.dataset.day);
    const i = Number(form.dataset.idx);
    if (action === 'delete-ex') {
      if (!confirm(`¿Eliminar "${d.exercises[i].name}" de este día? El historial se mantiene.`)) return;
      d.exercises.splice(i, 1);
      save();
      location.hash = `#/day/${d.id}`;
    } else {
      const j = i + Number(btn.dataset.dir);
      if (j < 0 || j >= d.exercises.length) return;
      [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]];
      save();
      location.hash = `#/edit/${d.id}/${j}`;
    }
  }
});

document.addEventListener('submit', ev => {
  const form = ev.target;
  if (form.dataset.form !== 'edit') return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const d = day(form.dataset.day);
  const isNew = form.dataset.idx === 'new';
  const int = (v, def) => Math.max(1, parseInt(v, 10) || def);
  const fields = {
    name: f.name.trim(),
    setsMin: int(f.setsMin, 3), setsMax: Math.max(int(f.setsMin, 3), int(f.setsMax, 3)),
    repMin: int(f.repMin, 10), repMax: Math.max(int(f.repMin, 10), int(f.repMax, 12)),
    type: f.type, section: f.section, inc: parseNum(f.inc) || 2.5,
    heavy: !!f.heavy, perSide: !!f.perSide, note: f.note.trim(),
  };
  if (isNew) {
    d.exercises.push({ ...fields, key: slug(fields.name) || `ej-${Date.now()}` });
    save();
    location.hash = `#/ex/${d.id}/${d.exercises.length - 1}`;
  } else {
    const i = Number(form.dataset.idx);
    Object.assign(d.exercises[i], fields);
    save();
    location.hash = `#/ex/${d.id}/${i}`;
  }
});

function deloadOn() { state.settings.deload = true; save(); }
function deloadOff() { state.settings.deload = false; state.settings.lastDeload = todayStr(); save(); }

// ---------- Arranque ----------

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
