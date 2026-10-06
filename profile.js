// Perfil y pantalla de bienvenida (4 pasos: nombre → edad → sexo y actividad → peso/altura o antropometría).
// Se muestra la primera vez que se abre la app, y desde Ajustes para editar el perfil.
import { state, save, ui, esc, num, parseNum, todayStr, fmtDate, LOGO, ICONS } from './store.js';
import { measures } from './anthro.js';
import { ACTIVITY } from './nutrition.js';

let step = 0;
let editing = false;
let draft = null; // valores que se van cargando; se recalculan si cambia el estado (por ejemplo, al restaurar un backup)
let error = '';
let notice = '';
let returnTo = '#/'; // a dónde volver después de editar el perfil // aviso positivo (por ejemplo, "backup restaurado")

export const needsProfile = () => !state.profile || editing;
export const setNotice = text => { notice = text; };

export function editProfile(startStep = 0) {
  returnTo = location.hash || '#/';
  editing = true;
  step = startStep;
  draft = null;
  error = '';
}

function lastWeight() {
  const d = Object.keys(state.body).sort().at(-1);
  return d ? state.body[d] : null;
}

function ensureDraft() {
  if (draft && draft.of === state) return;
  const p = state.profile || {};
  const m = measures().at(-1);
  draft = {
    of: state,
    seen: measures().length,
    name: p.name || '',
    age: p.age ?? (m?.age ? Math.floor(m.age) : ''),
    height: p.height ?? m?.values.talla ?? '',
    weight: lastWeight() ?? m?.values.peso ?? '',
    sex: p.sex || '',
    activity: p.activity || '',
  };
}

// Si se importó un informe durante la bienvenida, completa peso, altura y edad con sus datos.
function takeAnthro() {
  const ms = measures();
  if (ms.length <= draft.seen) return;
  const m = ms.at(-1);
  draft.seen = ms.length;
  draft.weight = m.values.peso;
  if (m.values.talla) draft.height = m.values.talla;
  if (m.age && !draft.age) draft.age = Math.floor(m.age);
}

const field = (key, label, attrs, unit = '') => `
  <label class="ob-field">${label}
    <span class="unit"><input data-ob="${key}" value="${esc(typeof draft[key] === 'number' ? num(draft[key]) : draft[key])}" ${attrs}>${unit ? `<span>${unit}</span>` : ''}</span>
  </label>`;

const STEPS = [
  () => `
    ${editing ? '' : `<div class="ob-logo">${LOGO}</div>`}
    <h2>${editing ? 'Tu <em>perfil</em>' : 'Templá <em>tu cuerpo.</em>'}</h2>
    <p class="lead">${editing ? 'Actualizá tus datos cuando quieras.' : 'Entrenamiento, alimentación y descanso en un solo lugar. Empecemos por conocerte.'}</p>
    ${field('name', '¿Cómo te llamás?', 'type="text" autocomplete="given-name" maxlength="40" placeholder="Tu nombre" required')}`,
  () => `
    <h2>¿Cuántos <em>años</em> tenés?</h2>
    <p class="lead">La usamos para darle contexto a tus mediciones.</p>
    ${field('age', 'Edad', 'type="text" inputmode="numeric" maxlength="3" placeholder="30"', 'años')}`,
  () => `
    <h2>Sobre <em>vos</em></h2>
    <p class="lead">Con esto estimamos tu gasto de energía para el objetivo de calorías.</p>
    <div class="ob-field">Sexo
      <div class="seg">
        ${[['m', 'Masculino'], ['f', 'Femenino']].map(([v, l]) => `<button type="button" class="seg-btn ${draft.sex === v ? 'on' : ''}" data-action="ob-pick" data-k="sex" data-v="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="ob-field">Actividad fuera del gimnasio</div>
    ${Object.entries(ACTIVITY).map(([v, a]) => `
      <button type="button" class="ob-card pick ${draft.activity === v ? 'on' : ''}" data-action="ob-pick" data-k="activity" data-v="${v}">
        <span><b>${a.label}</b><small>${a.hint}</small></span>
      </button>`).join('')}`,
  () => {
    const m = measures().at(-1);
    return `
    <h2>Tu <em>punto de partida</em></h2>
    <p class="lead">Importá tu informe de antropometría y lo completamos por vos, o cargá peso y altura a mano.</p>
    <label class="ob-card">
      <span class="ob-ic">${ICONS.pdf}</span>
      <span><b>Importar antropometría (PDF)</b><small>Peso, altura, edad y composición corporal salen del informe.</small></span>
      <input type="file" accept="application/pdf,.pdf" multiple data-action="anthro-file" hidden>
    </label>
    ${m ? `<div class="ob-ok">✓ Informe del ${fmtDate(m.date)}: ${num(m.values.peso)} kg · ${num(m.values.talla)} cm · músculo ${num(m.masses.muscular.pct)}%</div>` : ''}
    <div class="ob-or">${m ? 'revisá los datos' : 'o a mano'}</div>
    <div class="grid2">
      ${field('weight', 'Peso', 'type="text" inputmode="decimal" placeholder="75"', 'kg')}
      ${field('height', 'Altura', 'type="text" inputmode="decimal" placeholder="175"', 'cm')}
    </div>`;
  },
];

export function viewOnboarding() {
  ensureDraft();
  takeAnthro();
  const last = step === STEPS.length - 1;
  return `
    <section class="ob">
      <div class="ob-top">
        <div class="ob-steps" aria-label="Paso ${step + 1} de ${STEPS.length}">${STEPS.map((_, k) => `<i class="${k <= step ? 'on' : ''}"></i>`).join('')}</div>
        ${editing ? '<button class="ob-link" type="button" data-action="ob-cancel">Cancelar</button>' : ''}
      </div>
      <form class="ob-step" data-form="ob" novalidate>
        ${notice ? `<div class="ob-ok">${esc(notice)}</div>` : ''}
        ${STEPS[step]()}
        <p class="ob-err" role="alert">${esc(error)}</p>
        <div class="ob-actions">
          <button class="btn primary big" type="submit">${last ? (editing ? 'Guardar' : 'Entrar a Temple') : 'Siguiente'}</button>
          ${step > 0 ? '<button class="ob-link" type="button" data-action="ob-back">Atrás</button>' : ''}
          ${step === 0 && !editing ? `<label class="ob-link">Ya tengo un backup: restaurarlo<input type="file" accept="application/json,.json" data-action="import" hidden></label>` : ''}
        </div>
      </form>
    </section>`;
}

// Valida el paso actual; devuelve el mensaje de error o '' si está bien.
function validate() {
  if (step === 0) return draft.name.trim() ? '' : 'Contanos tu nombre.';
  if (step === 2) {
    if (!draft.sex) return 'Elegí tu sexo.';
    return draft.activity ? '' : 'Elegí tu nivel de actividad.';
  }
  if (step === 1) {
    const a = parseNum(draft.age);
    return a != null && a >= 12 && a <= 100 ? '' : 'Ingresá una edad entre 12 y 100.';
  }
  const w = parseNum(draft.weight), h = parseNum(draft.height);
  if (w == null || w < 30 || w > 250) return 'Ingresá tu peso en kg (entre 30 y 250).';
  if (h == null || h < 120 || h > 230) return 'Ingresá tu altura en cm (entre 120 y 230).';
  return '';
}

function finish() {
  const weight = parseNum(draft.weight);
  state.profile = {
    name: draft.name.trim(),
    age: Math.round(parseNum(draft.age)),
    ageDate: todayStr(),
    height: parseNum(draft.height),
    sex: draft.sex,
    activity: draft.activity,
    createdAt: state.profile?.createdAt || todayStr(),
  };
  if (lastWeight() !== weight) state.body[todayStr()] = weight;
  save();
  editing = false;
  step = 0;
  draft = null;
  notice = '';
  const to = returnTo;
  returnTo = '#/';
  if ((location.hash || '#/') === to) ui.render(); else location.hash = to;
}

document.addEventListener('input', ev => {
  const k = ev.target.dataset?.ob;
  if (k && draft) draft[k] = ev.target.value;
});

document.addEventListener('submit', ev => {
  if (ev.target.dataset.form !== 'ob') return;
  ev.preventDefault();
  error = validate();
  if (error) { ui.render({ keep: true }); return; }
  if (step < STEPS.length - 1) { step++; ui.render(); } else finish();
});

document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-action]')?.dataset.action;
  if (a === 'ob-pick' && draft) {
    draft[ev.target.closest('[data-action]').dataset.k] = ev.target.closest('[data-action]').dataset.v;
    error = '';
    ui.render({ keep: true });
    return;
  }
  if (a === 'ob-back') { step = Math.max(0, step - 1); error = ''; ui.render(); }
  else if (a === 'ob-cancel') { editing = false; draft = null; error = ''; ui.render(); }
});
