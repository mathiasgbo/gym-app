// Sector de alimentación. El plan se importa desde un archivo en el teléfono
// (no está en el código porque el repositorio es público).
//
// Cada comida tiene tres estados: sin registrar · comí · no comí. Las categorías del plan son una
// guía (no hay que completarlas todas) y el cumplimiento del día se mide por porciones.
import {
  state, save, ui, esc, num, activeDate, dayLog, ensureLog, dateBanner,
  isTrainingDay, topbar, gear, todayStr, toDate, addDays, DOW, env,
} from './store.js';

const SEP = '|';
const optLabel = o => typeof o === 'string' ? o : o.t;
const optWeight = o => typeof o === 'string' ? 1 : (o.n ?? 1);

export const plan = () => state.food.plan;

export function validPlan(p) {
  return p && p.type === 'gymapp-food-plan' && Array.isArray(p.meals) && p.groups && typeof p.groups === 'object';
}

export function mealsFor(date) {
  const p = plan();
  if (!p) return [];
  const training = isTrainingDay(date);
  return p.meals.filter(m => !m.trainingOnly || training);
}

// ---------- Categorías de porciones ----------

const CATS = [['prot', 'Proteína'], ['hc', 'Hidratos'], ['grasa', 'Grasa'], ['veg', 'Vegetales'], ['fruta', 'Fruta']];

// Categoría de un grupo del plan: la del campo "cat" si existe, o deducida del id/nombre.
function groupCat(id) {
  const g = plan()?.groups[id];
  if (g?.cat) return g.cat;
  const s = `${id} ${g?.label || ''}`.toLowerCase();
  if (/prot/.test(s)) return 'prot';
  if (/grasa/.test(s)) return 'grasa';
  if (/veg/.test(s)) return 'veg';
  if (/fruta|postre/.test(s)) return 'fruta';
  if (/hc|hidrat/.test(s)) return 'hc';
  return null;
}

// ---------- Estado de cada comida ----------

const mealLog = (date, id) => dayLog(date)?.food?.meals?.[id];

// status: 'none' | 'ate' | 'skipped'. "generic" = marcó "Comí" sin detallar (se asume según el plan).
export function mealStatus(m, date) {
  const L = mealLog(date, m.id);
  const items = L?.items || [];
  const note = L?.note || '';
  const slots = (m.slots || []).map(s => {
    const opts = plan().groups[s.group]?.options || [];
    const n = items.filter(it => it.startsWith(s.group + SEP))
      .reduce((a, it) => a + optWeight(opts.find(o => optLabel(o) === it.slice(s.group.length + 1)) ?? 1), 0);
    return { ...s, n, ok: n >= (s.count || 1) };
  });
  const status = L?.status === 'skipped' ? 'skipped'
    : (L?.status === 'ate' || L?.done || items.length || note) ? 'ate' : 'none';
  return { slots, status, done: status === 'ate', items, note, generic: status === 'ate' && !items.length };
}

// Porciones del día por categoría: objetivo (comidas obligatorias del plan) vs. lo registrado.
export function dayPortions(date) {
  const target = {}, done = {};
  for (const m of mealsFor(date)) {
    const st = mealStatus(m, date);
    for (const s of st.slots) {
      const c = groupCat(s.group);
      if (!c) continue;
      const count = s.count || 1;
      if (!m.optional && !s.optional) target[c] = (target[c] || 0) + count;
      if (st.status !== 'ate') continue;
      done[c] = (done[c] || 0) + (st.generic ? (s.optional ? 0 : count) : s.n);
    }
  }
  return CATS.filter(([c]) => target[c]).map(([c, label]) => ({ c, label, target: target[c], done: done[c] || 0 }));
}

// Cumplimiento del plan por porciones (0..1), o null si ese día no se registró ninguna comida.
export function foodScore(date) {
  if (!plan()) return null;
  if (!mealsFor(date).some(m => mealStatus(m, date).status !== 'none')) return null;
  const ps = dayPortions(date);
  const total = ps.reduce((a, p) => a + p.target, 0);
  return total ? ps.reduce((a, p) => a + Math.min(p.done, p.target), 0) / total : null;
}

function mealCounts(date) {
  const req = mealsFor(date).filter(m => !m.optional).map(m => mealStatus(m, date).status);
  return { total: req.length, logged: req.filter(s => s !== 'none').length, skipped: req.filter(s => s === 'skipped').length };
}

export const glassMl = () => plan()?.water?.glassMl || 250;
export const waterTarget = () => plan()?.water?.targetMl || 3000;
export const waterMl = date => (dayLog(date)?.food?.water || 0) * glassMl();

export function foodSummaryLine(date) {
  if (!plan()) return '';
  const s = foodScore(date);
  const c = mealCounts(date);
  return `🍽️ ${s != null ? `${Math.round(s * 100)}% del plan` : `${c.logged}/${c.total} comidas`} · 💧 ${num(waterMl(date) / 1000)}/${num(waterTarget() / 1000)} L`;
}

export function mealPrepBanner() {
  const p = plan();
  const dow = state.settings.mealPrepDow;
  if (!p || dow == null || dow === '' || Number(dow) !== new Date().getDay()) return '';
  return `<details class="banner prep" data-keep="prep"><summary>🥡 Hoy es día de <b>meal prep</b></summary>
    <ul>${(p.mealPrep || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
}

// ---------- Vista ----------

const STATUS_PILL = {
  ate: '<span class="pill ok">✓ Comí</span>',
  skipped: '<span class="pill skip">No comí</span>',
  none: '<span class="pill muted-pill">Sin registrar</span>',
};

export function viewFood() {
  const p = plan();
  const date = activeDate();
  if (!p) return `
    ${topbar('Alimentación', null, gear)}
    <section class="card empty">
      <h3>Cargá tu plan de alimentación</h3>
      <p class="muted">El plan se guarda solo en este teléfono. Elegí el archivo <b>plan-alimentacion.json</b> desde donde lo guardaste (Drive, WhatsApp, descargas…).</p>
      <label class="btn primary block">📄 Elegir archivo<input type="file" accept="application/json,.json" data-action="plan-file" hidden></label>
    </section>`;

  const f = dayLog(date)?.food || {};
  const meals = mealsFor(date);
  const statuses = meals.map(m => mealStatus(m, date));
  const yesterday = addDays(date, -1);
  const score = foodScore(date);
  const counts = mealCounts(date);
  const portions = dayPortions(date);
  const glasses = f.water || 0;
  const target = waterTarget();
  const waterPct = Math.min(100, Math.round(glasses * glassMl() / target * 100));
  const firstOpen = statuses.findIndex((s, k) => s.status === 'none' && !meals[k].optional);

  const mealCards = meals.map((m, k) => {
    const st = statuses[k];
    const slots = st.slots.map(s => {
      const g = p.groups[s.group];
      if (!g) return '';
      const chips = g.options.map(o => {
        const key = s.group + SEP + optLabel(o);
        return `<button class="chip ${st.items.includes(key) ? 'on' : ''}" data-action="food-item" data-meal="${esc(m.id)}" data-item="${esc(key)}">${esc(optLabel(o))}</button>`;
      }).join('');
      return `<div class="slot">
        <div class="slot-h"><span>${esc(g.label)}${s.optional ? ' <small class="inline">(opcional)</small>' : ''}</span>
          ${s.optional ? '' : `<span class="pill ${s.ok ? 'ok' : ''}">${Math.min(s.n, s.count || 1)}/${s.count || 1}</span>`}</div>
        ${g.hint ? `<small>${esc(g.hint)}</small>` : ''}
        <div class="chips">${chips}</div></div>`;
    }).join('');

    // Resumen bajo el nombre: qué categorías tiene (guía, no obligación)
    const guide = st.status === 'ate' && !st.generic
      ? st.slots.filter(s => !s.optional).map(s => `${esc(p.groups[s.group]?.label.split(' (')[0] || '')} ${s.n ? '✓' : '—'}`).join(' · ')
      : st.status === 'ate' ? 'Según el plan' : m.when || '';
    const prev = mealStatus(m, yesterday);
    const canRepeat = prev.status === 'ate' && (prev.items.length || prev.note || prev.generic);

    return `<details class="card meal ${st.status}" data-keep="meal-${esc(m.id)}" ${k === firstOpen ? 'open' : ''}>
      <summary><span class="grow"><b>${esc(m.name)}</b>${guide ? `<small>${guide}</small>` : ''}</span>
        ${m.optional && st.status === 'none' ? '<span class="pill muted-pill">opcional</span>' : STATUS_PILL[st.status]}</summary>
      <div class="meal-actions">
        ${st.items.length ? '' : `<button class="btn small ${st.status === 'ate' ? 'primary' : ''}" data-action="food-ate" data-meal="${esc(m.id)}">${st.status === 'ate' ? '✓ Comí' : 'Comí'}</button>`}
        <button class="btn small ${st.status === 'skipped' ? 'on-skip' : ''}" data-action="food-skip" data-meal="${esc(m.id)}">No comí</button>
        ${canRepeat ? `<button class="btn small ghost" data-action="food-repeat" data-meal="${esc(m.id)}">↺ Repetir de ayer</button>` : ''}
        ${st.items.length || st.status !== 'none' ? `<button class="btn small ghost" data-action="food-clear" data-meal="${esc(m.id)}">Limpiar</button>` : ''}
      </div>
      ${st.status === 'skipped' ? '<p class="note">Marcada como salteada. Tocá "No comí" de nuevo para deshacer.</p>' : `
        ${m.hint ? `<p class="note">${esc(m.hint)}</p>` : ''}
        <p class="muted small guide-tip">Tocá lo que comiste. No hace falta completar todas las categorías.</p>
        ${slots}
        <input type="text" data-field="meal-note" data-meal="${esc(m.id)}" placeholder="¿Comiste otra cosa? Anotala acá" value="${esc(st.note)}">
        ${m.examples?.length ? `<details class="ideas"><summary>💡 Ideas</summary><ul>${m.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`}
    </details>`;
  }).join('');

  const portionRows = portions.map(x => {
    const pct = Math.min(100, Math.round(x.done / x.target * 100));
    return `<div class="portion ${x.done >= x.target ? 'full' : ''}">
      <span>${x.label}</span><div class="bar"><span style="width:${pct}%"></span></div><b>${num(Math.min(x.done, 99))}/${x.target}</b></div>`;
  }).join('');

  return `
    ${topbar('Alimentación', null, gear)}
    ${dateBanner()}
    ${date === todayStr() ? mealPrepBanner() : ''}
    <section class="hero compact">
      <div class="muted">${DOW[toDate(date).getDay()]} · ${isTrainingDay(date) ? 'día de entreno' : 'día de descanso'}</div>
      <h2>${score != null ? `${Math.round(score * 100)}% del plan` : 'Sin registrar'}</h2>
      <p class="muted small day-meals">${counts.logged}/${counts.total} comidas registradas${counts.skipped ? ` · ${counts.skipped} salteada${counts.skipped > 1 ? 's' : ''}` : ''}</p>
      <div class="portions">${portionRows}</div>
      <div class="stats">
        <div class="stat">
          <div class="stat-h">💧 Agua <b>${num(glasses * glassMl() / 1000)} / ${num(target / 1000)} L</b></div>
          <div class="bar water"><span style="width:${waterPct}%"></span></div>
          <div class="stepper">
            <button class="btn small" data-action="water" data-d="-1" aria-label="Sacar un vaso">−</button>
            <span>${glasses} vasos de ${glassMl()} ml</span>
            <button class="btn small primary" data-action="water" data-d="1" aria-label="Sumar un vaso">+ vaso</button>
          </div>
        </div>
        <div class="stat">
          <div class="stat-h">😴 Sueño <b>${f.sleep != null ? num(f.sleep) + ' h' : '—'}</b> <small class="inline">objetivo ${p.sleep?.min ?? 7}-${p.sleep?.max ?? 8} h</small></div>
          ${env.health ? `<div class="sleep-src"><small class="inline">${f.sleepSource && !f.sleepManual ? `⌚ de ${esc(f.sleepSource)}` : f.sleepManual ? '✎ cargado a mano' : '⌚ sin datos del reloj'}</small>
            <button class="btn small ghost" data-action="sleep-sync">↻ Traer del reloj</button></div>` : ''}
          <div class="stepper">
            <button class="btn small" data-action="sleep" data-d="-0.5" aria-label="Menos sueño">−</button>
            <span>horas dormidas</span>
            <button class="btn small" data-action="sleep" data-d="0.5" aria-label="Más sueño">+</button>
          </div>
        </div>
      </div>
    </section>
    ${mealCards}
    <details class="card info" data-keep="recs">
      <summary>📋 Recomendaciones del plan</summary>
      <ul>${(p.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </details>`;
}

// ---------- Eventos ----------

function mealEntry(id, date = activeDate()) {
  const L = ensureLog(date);
  L.food ??= {};
  L.food.meals ??= {};
  const m = L.food.meals[id] ??= { items: [] };
  m.items ??= [];
  if (m.done) { m.status = 'ate'; delete m.done; } // formato viejo: "marcada como hecha"
  return m;
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT') return;
  const a = btn.dataset.action;
  const id = btn.dataset.meal;
  if (a === 'food-item') {
    const m = mealEntry(id);
    const it = btn.dataset.item;
    m.items = m.items.includes(it) ? m.items.filter(x => x !== it) : [...m.items, it];
    if (m.items.length) m.status = 'ate';
    else if (!m.note) delete m.status;
  } else if (a === 'food-ate') {
    const m = mealEntry(id);
    if (m.status === 'ate' && !m.items.length) delete m.status; else m.status = 'ate';
  } else if (a === 'food-skip') {
    const m = mealEntry(id);
    if (m.status === 'skipped') delete m.status;
    else Object.assign(m, { status: 'skipped', items: [], note: '' });
  } else if (a === 'food-repeat') {
    const prev = mealEntry(id, addDays(activeDate(), -1));
    const m = mealEntry(id);
    Object.assign(m, { status: 'ate', items: [...prev.items], note: prev.note || '' });
  } else if (a === 'food-clear') {
    const m = mealEntry(id);
    Object.assign(m, { items: [], note: '' });
    delete m.status;
  } else if (a === 'water') {
    const F = ensureLog().food ??= {};
    F.water = Math.max(0, (F.water || 0) + Number(btn.dataset.d));
  } else if (a === 'sleep') {
    const F = ensureLog().food ??= {};
    F.sleep = Math.min(14, Math.max(0, (F.sleep ?? (plan()?.sleep?.min || 7)) + Number(btn.dataset.d)));
    F.sleepManual = true; // no pisar con lo que venga del reloj
  } else return;
  save();
  ui.render({ keep: true });
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.field === 'meal-note') {
    const m = mealEntry(t.dataset.meal);
    m.note = t.value.trim();
    if (m.note) m.status = 'ate';
    else if (!m.items.length && m.status === 'ate') delete m.status;
    save();
    ui.render({ keep: true });
  } else if (t.dataset.action === 'plan-file' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (!validPlan(data)) throw new Error('El archivo no parece un plan de alimentación de esta app.');
      if (plan() && !confirm('Ya tenés un plan cargado. ¿Reemplazarlo? Tus registros de comidas se mantienen.')) return;
      state.food.plan = data;
      save();
      ui.render();
    } catch (err) { alert('No se pudo cargar el plan: ' + err.message); }
  }
});
