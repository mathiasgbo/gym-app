// Varias rutinas: una activa (state.routine) y las demás archivadas (state.routineArchive).
// El historial y la progresión van por ejercicio (no por rutina), así que cambiar de rutina no pierde nada.
//   #/routines → lista, nueva (en blanco / duplicar / importar), activar, exportar, eliminar
import { state, save, ui, esc, topbar, todayStr, fmtDate, rememberExercise, normalizeRoutine, env } from './store.js';
import { findExercise, EXERCISES } from './exercises.js';
import { TEMPLATES, findTemplate, templateExercises, routineFromTemplate } from './templates.js';
import { prescription } from './routine-editor.js';
import * as native from './native.js';

const ROUTINE_FILE = 'temple-routine';
const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const archive = () => (state.routineArchive ??= []);
const byId = id => id === 'active' ? state.routine : archive().find(r => r.id === id);
const modeLabel = r => r.mode === 'rotation' ? 'rotación' : 'semana fija';
const daysLabel = r => `${r.days.length} día${r.days.length === 1 ? '' : 's'}`;

// Copia con ids de días nuevos (para que los registros de cada día no se mezclen entre rutinas).
function cloneRoutine(r, name) {
  const c = structuredClone(r);
  Object.assign(c, { id: uid('r'), name: name ?? c.name, createdAt: todayStr() });
  delete c.archivedAt;
  delete c.activeSince;
  for (const d of c.days) d.id = uid('d');
  return normalizeRoutine(c);
}

export function activate(r) {
  const cur = state.routine;
  cur.days.forEach(d => d.exercises.forEach(rememberExercise)); // sus nombres siguen visibles en Progreso
  cur.archivedAt = todayStr();
  // Una rutina vacía (por ejemplo, la inicial) no se guarda en Archivadas
  state.routineArchive = [...(cur.days.length && cur !== r ? [cur] : []), ...archive().filter(x => x !== r)];
  delete r.archivedAt;
  r.activeSince = todayStr();
  state.routine = r;
  save();
}

const blankRoutine = () => normalizeRoutine({
  id: uid('r'), name: 'Nueva rutina', mode: 'week', createdAt: todayStr(),
  goal: '', warmup: '', cardio: '', safety: '', deload: '',
  progression: 'Doble progresión: subís reps dentro del rango; cuando tocás el techo en todas las series, subís peso.',
  days: [],
});

// ---------- Exportar / importar ----------

export function routineFile(r) {
  const custom = new Map();
  for (const d of r.days) for (const e of d.exercises) {
    const x = findExercise(e.lib || e.key);
    if (x?.custom) custom.set(x.id, x);
  }
  const { archivedAt, activeSince, ...clean } = r;
  return { type: ROUTINE_FILE, version: 1, exportedAt: todayStr(), routine: clean, customExercises: [...custom.values()] };
}

async function exportRoutine(r) {
  const name = `rutina-${r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'temple'}.json`;
  const text = JSON.stringify(routineFile(r), null, 2);
  if (env.native) {
    try { await native.shareFile(name, text); } catch (err) { if (!/cancel/i.test(err.message)) alert('No se pudo exportar: ' + err.message); }
    return;
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const isRoutineFile = data => data?.type === ROUTINE_FILE && Array.isArray(data.routine?.days);

function importRoutine(data) {
  if (!isRoutineFile(data)) throw new Error('El archivo no es una rutina de Temple.');
  // Ejercicios propios que trae la rutina (si ya los tenés, se mantienen los tuyos)
  const mine = new Set((state.exLib || []).map(x => x.id));
  state.exLib = [...(state.exLib || []), ...(data.customExercises || []).filter(x => x?.id && !mine.has(x.id))];
  const r = cloneRoutine(data.routine);
  const use = confirm(`Importé "${r.name}" (${daysLabel(r)}). ¿Usarla ahora como tu rutina activa?\n\nSi elegís Cancelar, queda guardada en Archivadas.`);
  if (use) activate(r);
  else { r.archivedAt = todayStr(); state.routineArchive = [r, ...archive()]; save(); }
  return use;
}

// ---------- Vista ----------

export function viewRoutines() {
  const R = state.routine;
  const rows = archive().map(r => `
    <section class="card routine-card">
      <b>${esc(r.name)}</b>
      <small>${daysLabel(r)} · ${modeLabel(r)}${r.archivedAt ? ` · archivada el ${fmtDate(r.archivedAt)}` : ''}</small>
      <div class="btns">
        <button class="btn small primary" data-action="routine-use" data-id="${r.id}">Usar esta</button>
        <button class="btn small" data-action="routine-dup" data-id="${r.id}">Duplicar</button>
        <button class="btn small" data-action="routine-export" data-id="${r.id}">Exportar</button>
        <button class="btn small ghost danger" data-action="routine-del" data-id="${r.id}">Eliminar</button>
      </div>
    </section>`).join('');

  return `
    ${topbar('Rutinas', '#/routine')}
    <section class="card routine-card active">
      <small class="label-active">Activa</small>
      <b>${esc(R.name)}</b>
      <small>${daysLabel(R)} · ${modeLabel(R)}${R.activeSince ? ` · desde el ${fmtDate(R.activeSince)}` : ''}</small>
      <div class="btns">
        <a class="btn small" href="#/routine">✎ Editar</a>
        <button class="btn small" data-action="routine-dup" data-id="active">Duplicar</button>
        <button class="btn small" data-action="routine-export" data-id="active">Exportar</button>
      </div>
    </section>
    <h3 class="section">Nueva rutina</h3>
    <div class="new-routine">
      <a class="ob-card pick" href="#/tpls">
        <span><b>Desde una plantilla</b><small>Full Body, Torso/Pierna, Empuje/Tirón/Piernas o En casa. Después la ajustás.</small></span></a>
      <button class="ob-card pick" data-action="routine-dup" data-id="active" data-use="1">
        <span><b>Duplicar la actual</b><small>Ideal para pasar al mes siguiente: copiás "${esc(R.name)}" y la ajustás.</small></span></button>
      <button class="ob-card pick" data-action="routine-blank">
        <span><b>En blanco</b><small>Armá los días y los ejercicios desde cero.</small></span></button>
      <label class="ob-card pick">
        <span><b>Importar un archivo</b><small>Una rutina que te pasó tu entrenador o un amigo (archivo .json de Temple).</small></span>
        <input type="file" accept="application/json,.json" data-action="routine-import" hidden></label>
    </div>
    <h3 class="section">Archivadas</h3>
    ${rows || '<p class="muted small">Cuando cambies de rutina, la anterior queda guardada acá.</p>'}
    <p class="muted small">Cambiar de rutina no borra nada: los pesos, el historial y las sugerencias de cada ejercicio se mantienen.</p>`;
}

// ---------- Plantillas ----------

// Opciones para arrancar (inicio sin rutina y "Desde una plantilla").
export function templateCards() {
  return TEMPLATES.map(t => `
    <a class="ob-card pick tpl-card" href="#/tpl/${t.id}">
      <span><b>${esc(t.name)}</b><small>${esc(t.level)} · ${t.days.length} días</small><small>${esc(t.desc)}</small></span></a>`).join('');
}

export function viewTemplates() {
  return `
    ${topbar('Plantillas', state.routine.days.length ? '#/routines' : '#/')}
    <p class="muted small">Elegí una para ver sus días y ejercicios. Después podés cambiar todo.</p>
    ${templateCards()}`;
}

export function viewTemplate(id) {
  const t = findTemplate(id);
  if (!t) return `${topbar('Plantilla', '#/tpls')}<p class="muted">No existe.</p>`;
  const DOWS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const days = t.days.map(d => `
    <section class="card">
      <h3><span class="dow">${DOWS[d.dow]}</span> ${esc(d.title)}</h3>
      <ul class="tpl-list">${templateExercises(d).map(e => `<li>${esc(e.name)} <small class="inline">${prescription(e)}</small></li>`).join('')}</ul>
    </section>`).join('');
  return `
    ${topbar(t.name, '#/tpls')}
    <p class="muted">${esc(t.desc)} <b>${esc(t.level)}</b>.</p>
    ${days}
    <button class="btn primary block big" data-action="tpl-use" data-id="${t.id}">Usar esta plantilla</button>
    <p class="muted small">Se crea como tu rutina activa${state.routine.days.length ? ` y "${esc(state.routine.name)}" queda archivada` : ''}. Los días de la semana, ejercicios, series y descansos se pueden cambiar en Mi rutina.</p>`;
}

// ---------- Eventos ----------

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT') return;
  const a = btn.dataset.action;
  if (a !== 'tpl-use' && (!a?.startsWith('routine-') || a === 'routine-mode' || a === 'routine-import')) return;
  const r = byId(btn.dataset.id);

  if (a === 'tpl-use') {
    const t = findTemplate(btn.dataset.id);
    if (!t) return;
    activate(routineFromTemplate(t));
    location.hash = '#/';
    return;
  }
  if (a === 'routine-use') {
    if (!r || !confirm(`¿Pasar a "${r.name}"? "${state.routine.name}" queda archivada. Tus pesos e historial se mantienen.`)) return;
    activate(r);
    location.hash = '#/';
  } else if (a === 'routine-dup') {
    if (!r) return;
    const name = prompt('Nombre de la nueva rutina:', `${r.name} (copia)`);
    if (name == null) return;
    const c = cloneRoutine(r, name.trim() || `${r.name} (copia)`);
    if (btn.dataset.use || confirm(`¿Usar "${c.name}" como tu rutina activa ahora?`)) {
      activate(c);
      location.hash = '#/routine';
    } else {
      c.archivedAt = todayStr();
      state.routineArchive = [c, ...archive()];
      save();
      ui.render({ keep: true });
    }
  } else if (a === 'routine-blank') {
    if (state.routine.days.length && !confirm(`Se crea una rutina en blanco y "${state.routine.name}" queda archivada. ¿Seguir?`)) return;
    activate(blankRoutine());
    location.hash = '#/routine';
  } else if (a === 'routine-export') {
    if (r) exportRoutine(r);
  } else if (a === 'routine-del') {
    if (!r || !confirm(`¿Eliminar la rutina "${r.name}"? El historial de tus ejercicios se mantiene.`)) return;
    r.days.forEach(d => d.exercises.forEach(rememberExercise));
    state.routineArchive = archive().filter(x => x !== r);
    save();
    ui.render({ keep: true });
  }
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.action !== 'routine-import' || !t.files?.[0]) return;
  try {
    const used = importRoutine(JSON.parse(await t.files[0].text()));
    location.hash = used ? '#/routine' : '#/routines';
    ui.render();
  } catch (err) {
    alert('No se pudo importar: ' + err.message);
  }
});
