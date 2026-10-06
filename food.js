// Sector de alimentación. El plan se importa desde un archivo en el teléfono
// (no está en el código porque el repositorio es público).
import {
  state, save, ui, esc, num, activeDate, dayLog, ensureLog, dateBanner,
  isTrainingDay, topbar, gear, todayStr, toDate, DOW,
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

function mealLog(date, id) { return dayLog(date)?.food?.meals?.[id]; }

export function mealStatus(m, date) {
  const L = mealLog(date, m.id);
  const items = L?.items || [];
  const slots = (m.slots || []).map(s => {
    const opts = plan().groups[s.group]?.options || [];
    const n = items.filter(it => it.startsWith(s.group + SEP))
      .reduce((a, it) => a + optWeight(opts.find(o => optLabel(o) === it.slice(s.group.length + 1)) ?? 1), 0);
    return { ...s, n, ok: s.optional || n >= (s.count || 1) };
  });
  const required = slots.filter(s => !s.optional);
  const done = !!L?.done || (required.length > 0 && required.every(s => s.ok));
  return { slots, done, items, okCount: required.filter(s => s.ok).length, total: required.length, note: L?.note || '', manual: !!L?.done };
}

// Proporción de comidas obligatorias cumplidas (null si no hay plan o no se registró nada ese día).
export function foodScore(date) {
  const meals = mealsFor(date).filter(m => !m.optional);
  if (!meals.length) return null;
  const f = dayLog(date)?.food;
  if (!f || (!Object.keys(f.meals || {}).length && !f.water && !f.sleep)) return null;
  return meals.filter(m => mealStatus(m, date).done).length / meals.length;
}

export const glassMl = () => plan()?.water?.glassMl || 250;
export const waterTarget = () => plan()?.water?.targetMl || 3000;
export const waterMl = date => (dayLog(date)?.food?.water || 0) * glassMl();

export function foodSummaryLine(date) {
  if (!plan()) return '';
  const meals = mealsFor(date).filter(m => !m.optional);
  const done = meals.filter(m => mealStatus(m, date).done).length;
  return `🍽️ ${done}/${meals.length} comidas · 💧 ${num(waterMl(date) / 1000)}/${num(waterTarget() / 1000)} L`;
}

export function mealPrepBanner() {
  const p = plan();
  const dow = state.settings.mealPrepDow;
  if (!p || dow == null || dow === '' || Number(dow) !== new Date().getDay()) return '';
  return `<details class="banner prep" data-keep="prep"><summary>🥡 Hoy es día de <b>meal prep</b></summary>
    <ul>${(p.mealPrep || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
}

// ---------- Vista ----------

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
  const req = meals.filter(m => !m.optional);
  const doneReq = meals.filter((m, k) => !m.optional && statuses[k].done).length;
  const glasses = f.water || 0;
  const target = waterTarget();
  const waterPct = Math.min(100, Math.round(glasses * glassMl() / target * 100));
  const firstOpen = statuses.findIndex((s, k) => !s.done && !meals[k].optional);

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
    const badge = st.done ? '<span class="pill ok">✓</span>' : m.optional ? '<span class="pill">opcional</span>' : `<span class="pill">${st.okCount}/${st.total}</span>`;
    return `<details class="card meal ${st.done ? 'done' : ''}" data-keep="meal-${esc(m.id)}" ${k === firstOpen ? 'open' : ''}>
      <summary><span class="grow"><b>${esc(m.name)}</b>${m.when ? `<small>${esc(m.when)}</small>` : ''}</span>${badge}</summary>
      ${m.hint ? `<p class="note">${esc(m.hint)}</p>` : ''}
      ${slots}
      <input type="text" data-field="meal-note" data-meal="${esc(m.id)}" placeholder="¿Comiste otra cosa? Anotala acá" value="${esc(st.note)}">
      <div class="btns">
        <button class="btn small ${st.manual ? '' : 'ghost'}" data-action="food-done" data-meal="${esc(m.id)}">${st.manual ? '✓ Marcada como hecha' : 'Marcar como hecha'}</button>
        ${st.items.length ? `<button class="btn small ghost" data-action="food-clear" data-meal="${esc(m.id)}">Limpiar</button>` : ''}
      </div>
      ${m.examples?.length ? `<details class="ideas"><summary>💡 Ideas</summary><ul>${m.examples.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    </details>`;
  }).join('');

  return `
    ${topbar('Alimentación', null, gear)}
    ${dateBanner()}
    ${date === todayStr() ? mealPrepBanner() : ''}
    <section class="hero compact">
      <div class="muted">${DOW[toDate(date).getDay()]} · ${isTrainingDay(date) ? 'día de entreno' : 'día de descanso'}</div>
      <h2>${doneReq}/${req.length} comidas</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-h">💧 Agua <b>${num(glasses * glassMl() / 1000)} / ${num(target / 1000)} L</b></div>
          <div class="bar"><span style="width:${waterPct}%"></span></div>
          <div class="stepper">
            <button class="btn small" data-action="water" data-d="-1" aria-label="Sacar un vaso">−</button>
            <span>${glasses} vasos de ${glassMl()} ml</span>
            <button class="btn small primary" data-action="water" data-d="1" aria-label="Sumar un vaso">+ vaso</button>
          </div>
        </div>
        <div class="stat">
          <div class="stat-h">😴 Sueño <b>${f.sleep != null ? num(f.sleep) + ' h' : '—'}</b> <small class="inline">objetivo ${p.sleep?.min ?? 7}-${p.sleep?.max ?? 8} h</small></div>
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

function mealEntry(id) {
  const L = ensureLog();
  L.food ??= {};
  L.food.meals ??= {};
  return L.food.meals[id] ??= { items: [] };
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT') return;
  const a = btn.dataset.action;
  if (a === 'food-item') {
    const m = mealEntry(btn.dataset.meal);
    const it = btn.dataset.item;
    m.items = m.items.includes(it) ? m.items.filter(x => x !== it) : [...m.items, it];
  } else if (a === 'food-done') {
    const m = mealEntry(btn.dataset.meal);
    m.done = !m.done;
  } else if (a === 'food-clear') {
    const m = mealEntry(btn.dataset.meal);
    m.items = [];
    m.done = false;
  } else if (a === 'water') {
    const F = ensureLog().food ??= {};
    F.water = Math.max(0, (F.water || 0) + Number(btn.dataset.d));
  } else if (a === 'sleep') {
    const F = ensureLog().food ??= {};
    F.sleep = Math.min(14, Math.max(0, (F.sleep ?? (plan()?.sleep?.min || 7)) + Number(btn.dataset.d)));
  } else return;
  save();
  ui.render({ keep: true });
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.field === 'meal-note') {
    mealEntry(t.dataset.meal).note = t.value.trim();
    save();
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

