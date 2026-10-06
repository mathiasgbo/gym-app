// Editor de rutina: días, ejercicios, biblioteca, reemplazos y ejercicios propios.
//   #/routine                    → Mi rutina (nombre, modo, días, reglas)
//   #/rday/<día>                 → editar un día
//   #/edit/<día>/<i>[/ex]        → editar un ejercicio (con "ex" vuelve a la pantalla de entrenamiento)
//   #/lib/<día>[/<i>]            → biblioteca: agregar (o reemplazar el ejercicio i)
//   #/replace/<día>/<i>/<id>     → reemplazo: ¿variante o ejercicio nuevo?
//   #/newex/<día>[/<i>]          → crear un ejercicio propio
import { state, save, ui, esc, num, parseNum, topbar, DOW, dayTag, rememberExercise } from './store.js';
import { MUSCLES, EQUIPMENT, searchExercises, findExercise, fromLibrary, normExercise } from './exercises.js';

const SECTIONS = [['main', 'Principal'], ['core', 'Core'], ['extra', 'Extra']];
const TYPES = [['weight', 'Peso × reps'], ['reps', 'Solo reps (peso corporal)'], ['time', 'Tiempo (segundos)'], ['min', 'Tiempo (minutos)']];
const MUSCLE = Object.fromEntries(MUSCLES);
const EQUIP = Object.fromEntries(EQUIPMENT);

const day = id => state.routine.days.find(d => d.id === id);
const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
const notFound = back => `${topbar('No encontrado', back)}<p class="muted">Eso ya no existe en tu rutina.</p>`;
const unit = t => t === 'time' ? ' s' : t === 'min' ? ' min' : '';
const range = (a, b) => a === b ? `${a}` : `${a}-${b}`;
export const prescription = e => `${range(e.setsMin, e.setsMax)} × ${range(e.repMin, e.repMax)}${unit(e.type)}${e.perSide ? ' /lado' : ''}`;

// ---------- Mi rutina ----------

export function viewRoutine() {
  const R = state.routine;
  const rows = R.days.map((d, i) => `
    <div class="row rday-row">
      <span class="dow">${dayTag(d)}</span>
      <a class="grow" href="#/rday/${d.id}"><b>${esc(d.title)}</b>
        <small>${d.exercises.length} ejercicio${d.exercises.length === 1 ? '' : 's'}${R.mode === 'week' && d.dow == null ? ' · sin día asignado' : ''}</small></a>
      <button class="icon-btn" data-action="rday-move" data-id="${d.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
      <button class="icon-btn" data-action="rday-move" data-id="${d.id}" data-dir="1" ${i === R.days.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
    </div>`).join('');
  const rule = (k, label, rows = 2) => `<label>${label}<textarea data-field="rule" data-k="${k}" rows="${rows}">${esc(R[k] || '')}</textarea></label>`;

  return `
    ${topbar('Mi rutina', '#/')}
    <section class="card form">
      <label>Nombre de la rutina<input data-field="routine-name" value="${esc(R.name)}" maxlength="40" placeholder="Ej: Mes 3, Volumen, En casa"></label>
      <div class="field-label">Cómo organizás los días</div>
      <div class="seg">
        <button type="button" class="seg-btn ${R.mode === 'week' ? 'on' : ''}" data-action="routine-mode" data-v="week">Semana fija</button>
        <button type="button" class="seg-btn ${R.mode === 'rotation' ? 'on' : ''}" data-action="routine-mode" data-v="rotation">Rotación</button>
      </div>
      <p class="muted small">${R.mode === 'week'
        ? 'Cada día de la rutina tiene su día de la semana (Lun, Mar…).'
        : 'Hacés los días en orden (A → B → C…), sin importar el día de la semana. La app te dice cuál toca.'}</p>
    </section>
    <h3 class="section">Días</h3>
    <div class="list">${rows || '<p class="muted">Todavía no hay días. Agregá el primero.</p>'}</div>
    <button class="btn block" data-action="rday-add">+ Agregar día</button>
    <details class="card" data-keep="rules">
      <summary>Reglas de la rutina</summary>
      <div class="form">
        <label>Objetivo<input data-field="rule" data-k="goal" value="${esc(R.goal || '')}" placeholder="Ej: Ganar músculo"></label>
        ${rule('warmup', 'Calentamiento')}
        ${rule('cardio', 'Cardio')}
        ${rule('progression', 'Progresión', 3)}
        ${rule('safety', 'Indicaciones / cuidados', 3)}
        <label>Deload cada (semanas)<input data-field="deload-weeks" inputmode="numeric" value="${R.deloadWeeks}"></label>
      </div>
    </details>`;
}

// ---------- Un día ----------

export function viewRoutineDay(id) {
  const d = day(id);
  if (!d) return notFound('#/routine');
  const R = state.routine;
  const usedBy = k => R.days.find(x => x !== d && x.dow === k);
  const dowOpts = [`<option value="">Sin día fijo</option>`, ...[1, 2, 3, 4, 5, 6, 0].map(k =>
    `<option value="${k}" ${d.dow === k ? 'selected' : ''}>${DOW[k]}${usedBy(k) ? ` (ya lo usa ${esc(usedBy(k).title)})` : ''}</option>`)].join('');
  const groups = SECTIONS.map(([sec, label]) => {
    const items = d.exercises.map((e, i) => [e, i]).filter(([e]) => (e.section || 'main') === sec);
    if (!items.length) return '';
    return `<h3 class="section">${label}</h3><div class="list">${items.map(([e, i]) => `
      <div class="row rex-row">
        <a class="grow" href="#/edit/${d.id}/${i}"><b>${esc(e.name)}</b>
          <small>${prescription(e)}${e.heavy ? ' · pesado' : ''} · descanso ${num(e.rest)} s</small></a>
        <button class="icon-btn" data-action="exm-move" data-day="${d.id}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button class="icon-btn" data-action="exm-move" data-day="${d.id}" data-i="${i}" data-dir="1" ${i === d.exercises.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
      </div>`).join('')}</div>`;
  }).join('');

  return `
    ${topbar(d.title || 'Día', '#/routine')}
    <section class="card form">
      <label>Nombre del día<input data-field="rday-title" data-id="${d.id}" value="${esc(d.title)}" maxlength="40" placeholder="Ej: Empuje, Piernas, Full body A"></label>
      ${R.mode === 'week' ? `<label>Día de la semana<select data-action="rday-dow" data-id="${d.id}">${dowOpts}</select></label>` : ''}
    </section>
    ${groups || '<p class="muted center">Este día todavía no tiene ejercicios.</p>'}
    <a class="btn primary block" href="#/lib/${d.id}">+ Agregar ejercicio</a>
    <button class="btn block ghost danger" data-action="rday-del" data-id="${d.id}">Eliminar este día</button>`;
}

// ---------- Un ejercicio ----------

export function viewEditExercise(dayId, idx, from) {
  const d = day(dayId);
  const i = Number(idx);
  const e = d?.exercises[i];
  if (!e) return notFound('#/routine');
  const back = from === 'ex' ? `#/ex/${d.id}/${i}` : `#/rday/${d.id}`;
  return `
    ${topbar('Editar ejercicio', back)}
    <form class="card form" data-form="exercise" data-day="${d.id}" data-idx="${i}" data-back="${back}">
      <label>Nombre<input name="name" required maxlength="60" value="${esc(e.name)}"></label>
      <label>Tipo<select name="type">${opt(TYPES, e.type)}</select></label>
      <div class="grid2">
        <label>Series mín.<input name="setsMin" type="number" min="1" value="${e.setsMin}"></label>
        <label>Series máx.<input name="setsMax" type="number" min="1" value="${e.setsMax}"></label>
        <label>Reps / tiempo mín.<input name="repMin" type="number" min="1" value="${e.repMin}"></label>
        <label>Reps / tiempo máx.<input name="repMax" type="number" min="1" value="${e.repMax}"></label>
        <label>Descanso (segundos)<input name="rest" type="number" min="0" step="15" value="${e.rest}"></label>
        <label>Salto de peso (kg)<input name="inc" type="text" inputmode="decimal" value="${num(e.inc)}"></label>
      </div>
      <label>Bloque<select name="section">${opt(SECTIONS, e.section)}</select></label>
      <label class="check-row"><input type="checkbox" name="heavy" ${e.heavy ? 'checked' : ''}> Pesado (sugiere serie de calentamiento)</label>
      <label class="check-row"><input type="checkbox" name="perSide" ${e.perSide ? 'checked' : ''}> Por lado (unilateral)</label>
      <label>Nota / advertencia<input name="note" maxlength="120" value="${esc(e.note)}" placeholder="Ej: ⚠️ cuidar el hombro"></label>
      <button class="btn primary block" type="submit">Guardar</button>
      <a class="btn block" href="#/lib/${d.id}/${i}">⇄ Reemplazar por otro ejercicio</a>
      <div class="btns">
        <button class="btn small" type="button" data-action="exm-move" data-day="${d.id}" data-i="${i}" data-dir="-1" data-stay="${from || ''}">↑ Subir</button>
        <button class="btn small" type="button" data-action="exm-move" data-day="${d.id}" data-i="${i}" data-dir="1" data-stay="${from || ''}">↓ Bajar</button>
        <button class="btn small danger" type="button" data-action="exm-del" data-day="${d.id}" data-i="${i}">Quitar del día</button>
      </div>
      <p class="muted small">El historial se mantiene aunque cambies el nombre o lo quites.</p>
    </form>`;
}

// ---------- Biblioteca ----------

let libQ = '', libMuscle = '', libEquip = '';

function libRows(dayId, replaceIdx) {
  const inRoutine = new Set(state.routine.days.flatMap(d => d.exercises.map(e => e.key)));
  const list = searchExercises(libQ, { muscle: libMuscle, equip: libEquip });
  if (!list.length) return `<p class="muted empty-results">No encontré ejercicios con esa búsqueda.</p>`;
  return list.slice(0, 120).map(x => `
    <button class="row lib-row" data-action="lib-pick" data-day="${dayId}" data-i="${replaceIdx ?? ''}" data-id="${esc(x.id)}">
      <span class="grow"><b>${esc(x.name)}</b>
        <small>${MUSCLE[x.muscle] || ''} · ${EQUIP[x.equip] || ''} · ${prescription(x)}</small></span>
      ${inRoutine.has(x.id) ? '<span class="tag">en tu rutina</span>' : x.custom ? '<span class="tag">propio</span>' : ''}
    </button>`).join('');
}

export function viewLibrary(dayId, replaceIdx) {
  const d = day(dayId);
  if (!d) return notFound('#/routine');
  const replacing = replaceIdx != null && replaceIdx !== '' ? d.exercises[Number(replaceIdx)] : null;
  const chip = (action, value, label, current) => `<button class="chip ${current === value ? 'on' : ''}" data-action="${action}" data-v="${value}">${label}</button>`;
  return `
    ${topbar(replacing ? 'Reemplazar ejercicio' : `Agregar a ${d.title}`, replacing ? `#/edit/${d.id}/${replaceIdx}` : `#/rday/${d.id}`)}
    ${replacing ? `<p class="note">Reemplazando <b>${esc(replacing.name)}</b>. Elegí el nuevo ejercicio.</p>` : ''}
    <div class="search-box">
      <input type="search" data-field="lib-q" value="${esc(libQ)}" placeholder="Buscar: sentadilla, remo, polea…" autocomplete="off" enterkeyhint="search">
    </div>
    <div class="chips scroll-x">${chip('lib-muscle', '', 'Todos', libMuscle)}${MUSCLES.map(([k, l]) => chip('lib-muscle', k, l, libMuscle)).join('')}</div>
    <div class="chips scroll-x lib-equip">${chip('lib-equip', '', 'Todo equipo', libEquip)}${EQUIPMENT.map(([k, l]) => chip('lib-equip', k, l, libEquip)).join('')}</div>
    <div class="list" id="lib-results" data-day="${d.id}" data-i="${replaceIdx ?? ''}">${libRows(d.id, replaceIdx)}</div>
    <a class="btn block" href="#/newex/${d.id}${replacing ? `/${replaceIdx}` : ''}">+ Crear ejercicio propio</a>`;
}

// ---------- Reemplazo ----------

export function viewReplace(dayId, idx, libId) {
  const d = day(dayId);
  const old = d?.exercises[Number(idx)];
  const x = findExercise(decodeURIComponent(libId || ''));
  if (!old || !x) return notFound('#/routine');
  return `
    ${topbar('Reemplazar', `#/lib/${d.id}/${idx}`)}
    <section class="card">
      <p>Cambiar <b>${esc(old.name)}</b> por <b>${esc(x.name)}</b>.</p>
      <p class="muted small">¿Qué pasa con el historial y las sugerencias de peso?</p>
      <button class="ob-card pick" data-action="replace-do" data-mode="variant" data-day="${d.id}" data-i="${idx}" data-id="${esc(x.id)}">
        <span><b>Es una variante</b><small>Comparte el historial de "${esc(old.name)}" y sigue sugiriendo desde tus pesos (por ejemplo, la misma máquina de otra marca o con otro agarre).</small></span>
      </button>
      <button class="ob-card pick" data-action="replace-do" data-mode="new" data-day="${d.id}" data-i="${idx}" data-id="${esc(x.id)}">
        <span><b>Es un ejercicio nuevo</b><small>Arranca de cero. El historial de "${esc(old.name)}" queda guardado en Progreso.</small></span>
      </button>
    </section>`;
}

// ---------- Ejercicio propio ----------

export function viewNewExercise(dayId, replaceIdx) {
  const d = day(dayId);
  if (!d) return notFound('#/routine');
  return `
    ${topbar('Ejercicio propio', `#/lib/${d.id}${replaceIdx != null ? `/${replaceIdx}` : ''}`)}
    <form class="card form" data-form="newex" data-day="${d.id}" data-i="${replaceIdx ?? ''}">
      <label>Nombre<input name="name" required maxlength="60" placeholder="Ej: Remo en máquina Hammer"></label>
      <div class="grid2">
        <label>Músculo<select name="muscle">${opt(MUSCLES, 'pecho')}</select></label>
        <label>Equipamiento<select name="equip">${opt(EQUIPMENT, 'maquina')}</select></label>
      </div>
      <label>Tipo<select name="type">${opt(TYPES, 'weight')}</select></label>
      <div class="grid2">
        <label>Series<input name="sets" type="number" min="1" value="3"></label>
        <label>Descanso (s)<input name="rest" type="number" min="0" step="15" value="90"></label>
        <label>Reps / tiempo mín.<input name="repMin" type="number" min="1" value="10"></label>
        <label>Reps / tiempo máx.<input name="repMax" type="number" min="1" value="12"></label>
      </div>
      <button class="btn primary block" type="submit">Guardar</button>
      <p class="muted small">Queda en tu biblioteca para usarlo en cualquier día.</p>
    </form>`;
}

// ---------- Acciones ----------

function addToDay(d, x) {
  const e = fromLibrary(x);
  d.exercises.push(e);
  // Mantener el orden de bloques: principal → core → extra
  const order = { main: 0, core: 1, extra: 2 };
  d.exercises.sort((a, b) => (order[a.section] ?? 0) - (order[b.section] ?? 0));
  rememberExercise(e);
}

function pick(d, idx, id) {
  const x = findExercise(id);
  if (!x) return;
  libQ = ''; libMuscle = ''; libEquip = ''; // la próxima búsqueda arranca limpia
  if (idx !== '' && idx != null) { location.hash = `#/replace/${d.id}/${idx}/${encodeURIComponent(id)}`; return; }
  addToDay(d, x);
  save();
  location.hash = `#/rday/${d.id}`;
}

document.addEventListener('input', ev => {
  if (ev.target.dataset?.field !== 'lib-q') return;
  libQ = ev.target.value;
  const box = document.getElementById('lib-results');
  if (box) box.innerHTML = libRows(box.dataset.day, box.dataset.i);
});

document.addEventListener('change', ev => {
  const t = ev.target;
  const R = state.routine;
  const f = t.dataset.field;
  if (f === 'routine-name') R.name = t.value.trim() || 'Mi rutina';
  else if (f === 'rule') R[t.dataset.k] = t.value.trim();
  else if (f === 'deload-weeks') R.deloadWeeks = Math.max(2, Math.min(16, parseInt(t.value, 10) || 5));
  else if (f === 'rday-title') { const d = day(t.dataset.id); if (d) d.title = t.value.trim() || d.title; }
  else if (t.dataset.action === 'rday-dow') { const d = day(t.dataset.id); if (d) d.dow = t.value === '' ? null : Number(t.value); }
  else return;
  save();
  ui.render({ keep: true });
});

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
  const a = btn.dataset.action;
  const R = state.routine;

  if (a === 'routine-mode') {
    R.mode = btn.dataset.v;
  } else if (a === 'rday-add') {
    const id = `d${Date.now().toString(36)}`;
    R.days.push({ id, title: `Día ${String.fromCharCode(65 + R.days.length)}`, dow: null, exercises: [] });
    save();
    location.hash = `#/rday/${id}`;
    return;
  } else if (a === 'rday-move') {
    const i = R.days.findIndex(d => d.id === btn.dataset.id);
    const j = i + Number(btn.dataset.dir);
    if (i < 0 || j < 0 || j >= R.days.length) return;
    [R.days[i], R.days[j]] = [R.days[j], R.days[i]];
  } else if (a === 'rday-del') {
    const d = day(btn.dataset.id);
    if (!d || !confirm(`¿Eliminar el día "${d.title}"? Lo que ya registraste se mantiene en el historial.`)) return;
    d.exercises.forEach(rememberExercise);
    R.days = R.days.filter(x => x !== d);
    save();
    location.hash = '#/routine';
    return;
  } else if (a === 'exm-move') {
    const d = day(btn.dataset.day);
    const i = Number(btn.dataset.i), j = i + Number(btn.dataset.dir);
    if (!d || j < 0 || j >= d.exercises.length) return;
    [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]];
    save();
    if (location.hash.startsWith('#/edit/')) { location.hash = `#/edit/${d.id}/${j}${btn.dataset.stay ? `/${btn.dataset.stay}` : ''}`; return; }
  } else if (a === 'exm-del') {
    const d = day(btn.dataset.day);
    const e = d?.exercises[Number(btn.dataset.i)];
    if (!e || !confirm(`¿Quitar "${e.name}" de ${d.title}? El historial se mantiene.`)) return;
    rememberExercise(e);
    d.exercises.splice(Number(btn.dataset.i), 1);
    save();
    location.hash = `#/rday/${d.id}`;
    return;
  } else if (a === 'lib-muscle') {
    libMuscle = btn.dataset.v;
  } else if (a === 'lib-equip') {
    libEquip = btn.dataset.v;
  } else if (a === 'lib-pick') {
    pick(day(btn.dataset.day), btn.dataset.i, btn.dataset.id);
    return;
  } else if (a === 'replace-do') {
    const d = day(btn.dataset.day);
    const i = Number(btn.dataset.i);
    const old = d.exercises[i];
    const x = findExercise(btn.dataset.id);
    rememberExercise(old);
    const nx = fromLibrary(x);
    // Variante: misma clave de historial y misma prescripción. Nuevo: valores sugeridos del ejercicio.
    d.exercises[i] = btn.dataset.mode === 'variant'
      ? { ...old, name: x.name, lib: x.id, type: x.type === old.type ? old.type : x.type }
      : { ...nx, section: old.section };
    rememberExercise(d.exercises[i]);
    save();
    location.hash = `#/edit/${d.id}/${i}`;
    return;
  } else return;
  save();
  ui.render({ keep: true });
});

document.addEventListener('submit', ev => {
  const form = ev.target;
  const kind = form.dataset.form;
  if (kind !== 'exercise' && kind !== 'newex') return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const int = (v, def, min = 1) => Math.max(min, parseInt(v, 10) || def);
  const d = day(form.dataset.day);
  if (!d) return;

  if (kind === 'exercise') {
    const i = Number(form.dataset.idx);
    const e = d.exercises[i];
    Object.assign(e, {
      name: f.name.trim() || e.name, type: f.type, section: f.section,
      setsMin: int(f.setsMin, 3), setsMax: Math.max(int(f.setsMin, 3), int(f.setsMax, 3)),
      repMin: int(f.repMin, 10), repMax: Math.max(int(f.repMin, 10), int(f.repMax, 12)),
      rest: int(f.rest, 90, 0), inc: parseNum(f.inc) || 2.5,
      heavy: !!f.heavy, perSide: !!f.perSide, note: f.note.trim(),
    });
    rememberExercise(e);
    save();
    location.hash = form.dataset.back;
    return;
  }

  // Ejercicio propio → queda en la biblioteca del usuario
  const name = f.name.trim();
  if (!name) return;
  const sets = int(f.sets, 3);
  const x = {
    id: `cx-${Date.now().toString(36)}`, name, muscle: f.muscle, equip: f.equip, type: f.type, heavy: false, custom: true,
    setsMin: sets, setsMax: sets, repMin: int(f.repMin, 10), repMax: Math.max(int(f.repMin, 10), int(f.repMax, 12)),
    rest: int(f.rest, 90, 0), terms: normExercise(`${name} ${f.muscle} ${f.equip}`),
  };
  state.exLib = [...(state.exLib || []), x];
  pick(d, form.dataset.i, x.id);
  save();
});
