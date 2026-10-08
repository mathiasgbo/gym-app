// Plan de alimentación: importar desde el PDF de la nutricionista con la IA que elija el usuario,
// revisar, vincular opciones con la base de alimentos, y editar el plan a mano.
//   #/plan                        → resumen e importar / crear
//   #/plan/ai                     → asistente: PDF → pedido para la IA → pegar respuesta
//   #/plan/review                 → vista previa del plan importado antes de guardarlo
//   #/plan/edit                   → editor (comidas, grupos de opciones, agua, sueño, recomendaciones)
//   #/plan/meal/<id>              → editar una comida
//   #/plan/group/<id>             → editar un grupo de opciones
//   #/plan/link/<draft|plan>/<grupo>/<i> → vincular una opción con alimentos de la base
// Temple no envía el plan a ningún lado: el usuario lo comparte con su IA si quiere.
import { state, save, ui, esc, num, parseNum, topbar, env } from './store.js';
import { FOODS, findFood, nutrients, searchFoods, norm } from './foods.js';
import * as native from './native.js';
import { fileToText, DOC_ACCEPT } from './doctext.js';
import { sendToAi, aiButtons, openAiSite, watchClipboard, readClipboard } from './ai-share.js';

const CATS = [['prot', 'Proteína'], ['hc', 'Hidratos'], ['grasa', 'Grasa'], ['veg', 'Vegetales'], ['fruta', 'Fruta'], ['otro', 'Otro']];
const CAT = Object.fromEntries(CATS);
const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const optObj = o => typeof o === 'string' ? { t: o } : o;
const plan = () => state.food.plan;

let draft = null;          // plan importado, todavía sin guardar
let aiText = '';           // texto extraído del PDF (o pegado)
let aiInfo = '';           // aviso sobre la lectura del PDF
let aiResult = '';         // respuesta pegada de la IA
let linkQ = '';            // búsqueda en la pantalla de vincular
let aiSites = false;       // web: mostrar los botones de cada IA

const looksLikePlan = t => /gymapp-food-plan/.test(t) || (/"groups"/.test(t) && /"meals"/.test(t));

// ---------- Utilidades ----------

const linkKcal = f => (f || []).reduce((a, [id, g]) => { const x = findFood(id); return a + (x ? nutrients(x, g).kcal : 0); }, 0);
const linkText = f => f?.length
  ? f.map(([id, g]) => `${findFood(id)?.name || id} ${num(Math.round(g))} g`).join(' + ') + ` · ${Math.round(linkKcal(f))} kcal`
  : '';

function planStats(p) {
  const opts = Object.values(p.groups || {}).flatMap(g => g.options.map(optObj));
  return { meals: p.meals.length, groups: Object.keys(p.groups).length, options: opts.length, linked: opts.filter(o => o.f?.length).length, approx: opts.filter(o => o.f?.length && o.approx).length };
}

// Busca el alimento de la base que mejor coincide con un nombre ("pechuga de pollo" → pechuga).
// sure = coincidieron todas las palabras; si no, es una aproximación que conviene revisar.
export function matchFood(name) {
  const words = norm(name || '').replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  for (let n = words.length; n > 0; n--) {
    const hit = searchFoods(words.slice(0, n).join(' '))[0];
    if (hit) return { id: hit.id, sure: n === words.length };
  }
  for (const w of words.filter(w => w.length > 3)) {
    const hit = searchFoods(w)[0];
    if (hit) return { id: hit.id, sure: false };
  }
  return null;
}

// Vincula las opciones sueltas buscando su nombre en la base, con la porción estándar del alimento.
// Quedan marcadas como aproximadas (≈) para que el usuario revise los gramos. Devuelve cuántas vinculó.
function autoLink(p) {
  let n = 0;
  for (const g of Object.values(p?.groups || {})) {
    g.options = g.options.map(o => {
      const opt = optObj(o);
      if (opt.f?.length) return o;
      const m = matchFood(opt.t);
      const food = m && findFood(m.id);
      if (!food) return o;
      n++;
      return { ...opt, f: [[food.id, food.portions[0]?.[1] || 100]], approx: true };
    });
  }
  return n;
}

// ---------- Pedido para la IA ----------

function buildPrompt(text) {
  return `Necesito que conviertas mi plan de alimentación en un JSON para la app Temple.
Respondé SOLO con el JSON (sin explicaciones), con este formato:

{
  "type": "gymapp-food-plan",
  "version": 2,
  "title": "Plan de alimentación",
  "goal": "objetivo del plan (por ejemplo: aumento de masa muscular)",
  "water": { "targetMl": 3000, "glassMl": 250 },
  "sleep": { "min": 7, "max": 8 },
  "groups": {
    "prot_almuerzo": {
      "label": "Proteína",
      "cat": "prot",
      "hint": "aclaración opcional",
      "options": [
        { "t": "Pollo: 1 pechuga grande", "items": [{ "food": "pechuga de pollo", "g": 200 }] }
      ]
    }
  },
  "meals": [
    {
      "id": "almuerzo", "name": "Almuerzo", "when": "",
      "hint": "regla general de la comida",
      "trainingOnly": false, "optional": false,
      "slots": [{ "group": "prot_almuerzo", "count": 1 }],
      "examples": ["ejemplo de comida completa"]
    }
  ],
  "notes": ["recomendaciones generales del plan"],
  "mealPrep": ["consejos de preparación, si los hay"]
}

Reglas:
- Un "group" es una lista de opciones intercambiables (por ejemplo, las proteínas del almuerzo). "cat" es una de: prot, hc, grasa, veg, fruta, otro.
- Cada comida ("meals") dice cuántas opciones de cada grupo lleva ("count"). Si una comida usa las mismas opciones que otra (almuerzo y cena), pueden compartir grupos.
- "trainingOnly": true para pre/post entreno que solo van los días de entrenamiento. "optional": true para colaciones opcionales.
- En "items" poné el alimento con un nombre común (sin marca si no hace falta) y su peso en gramos tal como se come (cocido si es cocido). Si una opción tiene varios alimentos, poné varios items. Si no sabés los gramos, estimalos razonablemente.
- Respetá las cantidades y porciones del plan. No inventes comidas ni alimentos que no estén.
- Si el plan indica agua o sueño, usá esos valores.

Este es mi plan:
"""
${text || '(Lo adjunto como archivo PDF)'}
"""`;
}


// ---------- Interpretar la respuesta de la IA ----------

function parseAiPlan(raw) {
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No encontré un JSON en la respuesta. Copiá la respuesta completa de tu IA.');
  let body = s.slice(a, b + 1);
  let data;
  try { data = JSON.parse(body); } catch {
    try { data = JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); } catch {
      throw new Error('La respuesta tiene un error de formato. Pedile a tu IA: "revisá que el JSON sea válido y respondé solo con el JSON".');
    }
  }
  if (!data.groups || typeof data.groups !== 'object' || !Object.keys(data.groups).length) throw new Error('Al plan le faltan los grupos de opciones ("groups").');
  if (!Array.isArray(data.meals) || !data.meals.length) throw new Error('Al plan le faltan las comidas ("meals").');

  const groups = {};
  for (const [gid, g] of Object.entries(data.groups)) {
    groups[gid] = {
      label: String(g.label || gid), cat: CAT[g.cat] ? g.cat : undefined, hint: g.hint || undefined,
      options: (g.options || []).map(o => {
        const opt = typeof o === 'string' ? { t: o } : { t: String(o.t || o.text || o.name || '') };
        const items = Array.isArray(o.items) ? o.items : [];
        const hits = items.map(it => [matchFood(it.food || it.name), Number(it.g || it.grams) || 0]).filter(([m, g]) => m && g > 0);
        if (hits.length) opt.f = hits.map(([m, g]) => [m.id, g]);
        if (hits.length < items.length || hits.some(([m]) => !m.sure)) opt.approx = true;
        if (items.length) opt.src = items.map(it => `${it.food || it.name} ${it.g || it.grams || '?'} g`).join(' + ');
        if (typeof o === 'object' && o.n > 0) opt.n = Number(o.n);
        return opt;
      }).filter(o => o.t),
    };
  }
  const meals = data.meals.map((m, i) => ({
    id: String(m.id || `comida-${i + 1}`), name: String(m.name || `Comida ${i + 1}`),
    when: m.when || undefined, hint: m.hint || undefined,
    trainingOnly: !!m.trainingOnly, optional: !!m.optional,
    slots: (m.slots || []).filter(s => groups[s.group]).map(s => ({ group: s.group, count: Math.max(1, Number(s.count) || 1), ...(s.optional ? { optional: true } : {}) })),
    examples: Array.isArray(m.examples) ? m.examples.map(String) : [],
  }));
  return {
    type: 'gymapp-food-plan', version: 2,
    title: data.title || 'Plan de alimentación', goal: data.goal || '',
    water: { targetMl: Number(data.water?.targetMl) || 3000, glassMl: Number(data.water?.glassMl) || 250 },
    sleep: { min: Number(data.sleep?.min) || 7, max: Number(data.sleep?.max) || 8 },
    groups, meals,
    notes: Array.isArray(data.notes) ? data.notes.map(String) : [],
    mealPrep: Array.isArray(data.mealPrep) ? data.mealPrep.map(String) : [],
  };
}

// ---------- Plan base (para armarlo a mano) ----------

function basePlan() {
  const o = (t, id, g) => ({ t, f: [[id, g]] });
  return {
    type: 'gymapp-food-plan', version: 2, title: 'Mi plan', goal: '',
    water: { targetMl: 2500, glassMl: 250 }, sleep: { min: 7, max: 9 },
    groups: {
      des_hc: { label: 'Hidratos', cat: 'hc', options: [o('2 tostadas integrales', 'pan-lactal-integral', 50), o('4 cdas de avena', 'avena', 40), o('2 rapiditas', 'rapidita', 80)] },
      des_prot: { label: 'Proteína', cat: 'prot', options: [o('2 huevos', 'huevo', 100), o('1 yogur', 'yogur-desc', 190), o('2 cdas de queso untable light', 'queso-untable-light', 30)] },
      fruta: { label: 'Fruta', cat: 'fruta', options: [o('1 fruta', 'manzana', 150), o('1 banana', 'banana', 120)] },
      prot: { label: 'Proteína', cat: 'prot', options: [o('Pollo: 1 pechuga', 'pechuga', 200), o('Carne magra: 1 bife', 'nalga', 180), o('Pescado: 1 filet', 'merluza', 150), o('3 huevos', 'huevo', 150), o('Legumbres (7 cdas cocidas)', 'lentejas', 200)] },
      hc: { label: 'Hidratos', cat: 'hc', options: [o('Arroz (1 taza cocido)', 'arroz', 160), o('Fideos (1 plato)', 'fideos', 180), o('Papa o batata (1 grande)', 'papa', 200)] },
      veg: { label: 'Vegetales', cat: 'veg', options: [o('Ensalada', 'ensalada-mixta', 200), o('Verduras cocidas', 'verduras-cocidas', 200)] },
      grasa: { label: 'Grasa', cat: 'grasa', options: [o('1 cda de aceite de oliva', 'aceite-oliva', 13), o('½ palta', 'palta', 75), o('1 puñado de frutos secos', 'almendras', 30)] },
    },
    meals: [
      { id: 'desayuno', name: 'Desayuno', slots: [{ group: 'des_hc', count: 1 }, { group: 'des_prot', count: 1 }, { group: 'fruta', count: 1 }] },
      { id: 'almuerzo', name: 'Almuerzo', slots: [{ group: 'prot', count: 1 }, { group: 'hc', count: 1 }, { group: 'veg', count: 1 }, { group: 'grasa', count: 1 }] },
      { id: 'merienda', name: 'Merienda', slots: [{ group: 'des_hc', count: 1 }, { group: 'des_prot', count: 1 }, { group: 'fruta', count: 1 }] },
      { id: 'cena', name: 'Cena', slots: [{ group: 'prot', count: 1 }, { group: 'hc', count: 1 }, { group: 'veg', count: 1 }, { group: 'grasa', count: 1 }] },
      { id: 'colacion', name: 'Colación', optional: true, slots: [{ group: 'fruta', count: 1 }] },
    ],
    notes: [], mealPrep: [],
  };
}

// ---------- Vistas ----------

export function viewPlanHub() {
  const p = plan();
  const st = p && planStats(p);
  return `
    ${topbar('Plan de alimentación', '#/food')}
    ${p ? `<section class="card">
      <b class="plan-title">${esc(p.title || 'Plan de alimentación')}</b>
      <small>${p.goal ? `${esc(p.goal)} · ` : ''}${st.meals} comidas · ${st.options} opciones · ${st.linked} con calorías</small>
      <div class="btns">
        <a class="btn small primary" href="#/plan/edit">✎ Editar</a>
        <button class="btn small" data-action="plan-export">Exportar</button>
        <button class="btn small ghost danger" data-action="plan-del">Quitar</button>
      </div>
    </section>` : '<p class="muted">Cargá el plan de tu nutricionista para registrar tus comidas por porciones y ver las calorías.</p>'}
    <h3 class="section">${p ? 'Reemplazar el plan' : 'Cargar un plan'}</h3>
    <a class="ob-card pick" href="#/plan/ai">
      <span class="ob-ic">${'📄'}</span>
      <span><b>Desde el PDF de tu nutricionista</b><small>Temple lee el PDF y te arma un pedido para que tu IA de confianza (ChatGPT, Gemini, Claude…) lo convierta. Después pegás la respuesta.</small></span></a>
    <label class="ob-card pick">
      <span class="ob-ic">{ }</span>
      <span><b>Archivo de Temple (.json)</b><small>Un plan exportado desde Temple o que ya tenés en este formato.</small></span>
      <input type="file" accept="application/json,.json" data-action="plan-file" hidden></label>
    <button class="ob-card pick" data-action="plan-manual">
      <span class="ob-ic">✎</span>
      <span><b>Armarlo a mano</b><small>${p ? 'Editá el plan actual.' : 'Arrancás con una base (desayuno, almuerzo, merienda, cena) y la ajustás.'}</small></span></button>`;
}

export function viewPlanAi() {
  const ready = !!aiText;
  return `
    ${topbar('Plan con tu IA', '#/plan')}
    <section class="card step">
      <h3><span class="step-n">1</span> Elegí tu plan</h3>
      <label class="btn block">📄 PDF, Word o texto<input type="file" accept="${DOC_ACCEPT}" data-action="plan-pdf" hidden></label>
      ${aiInfo ? `<p class="small ${ready ? 'ok-text' : 'warn-text'}">${esc(aiInfo)}</p>` : ''}
      <details><summary class="muted small">o pegá el texto del plan</summary>
        <textarea data-field="plan-text" rows="5" placeholder="Pegá acá el texto de tu plan">${esc(aiText)}</textarea></details>
    </section>
    <section class="card step">
      <h3><span class="step-n">2</span> Enviáselo a tu IA</h3>
      <button class="btn primary block big" data-action="plan-send">✨ Enviar a mi IA</button>
      <p class="muted small">${env.native
        ? 'Se abre el menú para elegir tu IA (ChatGPT, Gemini, Claude…) con el pedido completo ya escrito.'
        : 'Elegí tu IA: el pedido completo queda copiado para pegarlo.'}${ready ? '' : ' Si tu plan es una foto o un PDF escaneado, adjuntalo en la conversación con tu IA.'}</p>
      ${aiSites ? `<div class="btns">${aiButtons('plan-site')}</div>` : ''}
    </section>
    <section class="card step">
      <h3><span class="step-n">3</span> Volvé con la respuesta</h3>
      <p class="muted small">Cuando tu IA responda, <b>copiá su respuesta y volvé a Temple</b>: la toma sola y te muestra el plan para revisar.</p>
      <details ${aiResult ? 'open' : ''}><summary class="muted small">¿No la tomó? Pegala acá</summary>
        <textarea data-field="plan-result" rows="5" placeholder="Pegá acá lo que te respondió tu IA">${esc(aiResult)}</textarea>
        <div class="btns">
          <button class="btn small" data-action="plan-paste">Pegar</button>
          <button class="btn primary" data-action="plan-parse">Revisar el plan ›</button>
        </div></details>
    </section>
    <p class="muted small">Temple no envía tu plan a ningún lado: vos elegís con qué IA compartirlo.</p>`;
}

function groupsHtml(p, target) {
  return Object.entries(p.groups).map(([gid, g]) => `
    <div class="plan-group">
      <div class="slot-h"><span>${esc(g.label)} <small class="inline">${CAT[g.cat] || ''}</small></span></div>
      ${g.options.map(optObj).map((o, i) => `
        <a class="plan-opt ${!o.f?.length ? 'unlinked' : o.approx ? 'approx' : ''}" href="#/plan/link/${target}/${encodeURIComponent(gid)}/${i}">
          <span class="grow"><b>${esc(o.t)}</b><small>${!o.f?.length ? '⚠ sin vincular a la base: tocá para elegir el alimento' : `${o.approx ? '≈ verificá: ' : ''}${esc(linkText(o.f))}`}</small></span>
          <span class="chev">›</span></a>`).join('')}
    </div>`).join('');
}

export function viewPlanReview() {
  if (!draft) return `${topbar('Revisar plan', '#/plan/ai')}<p class="muted">No hay un plan para revisar.</p>`;
  const st = planStats(draft);
  return `
    ${topbar('Revisar plan', '#/plan/ai')}
    <section class="card">
      <b class="plan-title">${esc(draft.title)}</b>
      <small>${draft.goal ? `${esc(draft.goal)} · ` : ''}💧 ${num(draft.water.targetMl / 1000)} L · 😴 ${draft.sleep.min}-${draft.sleep.max} h</small>
      <p class="small">${st.meals} comida${st.meals === 1 ? "" : "s"} · ${st.groups} grupo${st.groups === 1 ? "" : "s"} · ${st.options} opci${st.options === 1 ? "ón" : "ones"} · <b>${st.linked} vinculadas</b> a la base${st.linked < st.options || st.approx ? ` · revisá ${st.options - st.linked + st.approx} marcada${st.options - st.linked + st.approx === 1 ? '' : 's'} con ⚠ o ≈` : ' ✓'}</p>
    </section>
    <h3 class="section">Comidas</h3>
    <div class="list">${draft.meals.map(m => `<div class="row"><span class="grow"><b>${esc(m.name)}</b>
      <small>${m.slots.map(s => `${s.count > 1 ? `${s.count}× ` : ''}${esc(draft.groups[s.group]?.label || s.group)}`).join(' + ')}${m.trainingOnly ? ' · solo días de entreno' : ''}${m.optional ? ' · opcional' : ''}</small></span></div>`).join('')}</div>
    <h3 class="section">Opciones</h3>
    ${groupsHtml(draft, 'draft')}
    <button class="btn primary block big" data-action="plan-save-draft">Guardar plan</button>
    <p class="muted small">Después podés editar cualquier cosa desde Comida → Plan → Editar.</p>`;
}

export function viewPlanEdit() {
  const p = plan();
  if (!p) return viewPlanHub();
  const lines = a => esc((a || []).join('\n'));
  return `
    ${topbar('Editar plan', '#/plan')}
    <section class="card form">
      <label>Nombre<input data-field="pe-plan" data-k="title" value="${esc(p.title || '')}"></label>
      <label>Objetivo<input data-field="pe-plan" data-k="goal" value="${esc(p.goal || '')}"></label>
      <div class="grid2">
        <label>Agua por día (ml)<input data-field="pe-plan" data-k="water.targetMl" inputmode="numeric" value="${p.water?.targetMl || 3000}"></label>
        <label>Vaso (ml)<input data-field="pe-plan" data-k="water.glassMl" inputmode="numeric" value="${p.water?.glassMl || 250}"></label>
        <label>Sueño mín. (h)<input data-field="pe-plan" data-k="sleep.min" inputmode="decimal" value="${p.sleep?.min ?? 7}"></label>
        <label>Sueño máx. (h)<input data-field="pe-plan" data-k="sleep.max" inputmode="decimal" value="${p.sleep?.max ?? 8}"></label>
      </div>
    </section>
    <h3 class="section">Comidas</h3>
    <div class="list">${p.meals.map((m, i) => `
      <div class="row rex-row">
        <a class="grow" href="#/plan/meal/${encodeURIComponent(m.id)}"><b>${esc(m.name)}</b>
          <small>${m.slots.map(s => `${s.count > 1 ? `${s.count}× ` : ''}${esc(p.groups[s.group]?.label || s.group)}`).join(' + ') || 'sin categorías'}${m.trainingOnly ? ' · días de entreno' : ''}${m.optional ? ' · opcional' : ''}</small></a>
        <button class="icon-btn" data-action="pe-meal-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-action="pe-meal-move" data-i="${i}" data-dir="1" ${i === p.meals.length - 1 ? 'disabled' : ''}>↓</button>
      </div>`).join('')}</div>
    <button class="btn block" data-action="pe-meal-add">+ Agregar comida</button>
    <h3 class="section">Grupos de opciones</h3>
    <p class="muted small">Cada grupo es una lista de opciones intercambiables (por ejemplo, las proteínas del almuerzo). Las comidas usan grupos.</p>
    <div class="list">${Object.entries(p.groups).map(([gid, g]) => {
      const opts = g.options.map(optObj);
      return `<a class="row" href="#/plan/group/${encodeURIComponent(gid)}"><span class="grow"><b>${esc(g.label)}</b>
        <small>${CAT[g.cat] || 'sin categoría'} · ${opts.length} opciones · ${opts.filter(o => o.f?.length).length} con calorías</small></span><span class="chev">›</span></a>`;
    }).join('')}</div>
    <button class="btn block" data-action="pe-group-add">+ Agregar grupo</button>
    <section class="card form">
      <label>Recomendaciones (una por línea)<textarea data-field="pe-lines" data-k="notes" rows="4">${lines(p.notes)}</textarea></label>
      <label>Consejos de meal prep (uno por línea)<textarea data-field="pe-lines" data-k="mealPrep" rows="3">${lines(p.mealPrep)}</textarea></label>
    </section>`;
}

export function viewPlanMeal(id) {
  const p = plan();
  const m = p?.meals.find(x => x.id === decodeURIComponent(id || ''));
  if (!m) return `${topbar('Comida', '#/plan/edit')}<p class="muted">Esa comida no existe.</p>`;
  const groupOpts = sel => Object.entries(p.groups).map(([gid, g]) => `<option value="${esc(gid)}" ${gid === sel ? 'selected' : ''}>${esc(g.label)} (${CAT[g.cat] || '—'})</option>`).join('');
  return `
    ${topbar(m.name, '#/plan/edit')}
    <section class="card form">
      <label>Nombre<input data-field="pe-meal" data-k="name" value="${esc(m.name)}"></label>
      <label>Cuándo (opcional)<input data-field="pe-meal" data-k="when" value="${esc(m.when || '')}" placeholder="Ej: Antes de entrenar"></label>
      <label>Indicación (opcional)<input data-field="pe-meal" data-k="hint" value="${esc(m.hint || '')}" placeholder="Ej: ¼ plato proteína, ½ hidratos, ¼ vegetales"></label>
      <label class="check-row"><input type="checkbox" data-action="pe-meal-flag" data-k="trainingOnly" ${m.trainingOnly ? 'checked' : ''}> Solo los días de entrenamiento</label>
      <label class="check-row"><input type="checkbox" data-action="pe-meal-flag" data-k="optional" ${m.optional ? 'checked' : ''}> Opcional (no cuenta para el cumplimiento)</label>
    </section>
    <h3 class="section">Qué lleva</h3>
    <div class="list">${m.slots.map((s, i) => `
      <div class="row slot-row">
        <select data-action="pe-slot" data-i="${i}" data-k="group">${groupOpts(s.group)}</select>
        <input class="count" data-action="pe-slot" data-i="${i}" data-k="count" type="number" min="1" value="${s.count || 1}" aria-label="Cantidad">
        <button class="icon-btn" data-action="pe-slot-del" data-i="${i}" aria-label="Quitar">✕</button>
      </div>`).join('') || '<p class="muted small">Todavía no tiene categorías.</p>'}</div>
    <button class="btn block" data-action="pe-slot-add">+ Agregar categoría</button>
    <section class="card form">
      <label>Ideas de comidas (una por línea)<textarea data-field="pe-meal-lines" data-k="examples" rows="4">${esc((m.examples || []).join('\n'))}</textarea></label>
    </section>
    <button class="btn block ghost danger" data-action="pe-meal-del">Eliminar esta comida</button>`;
}

export function viewPlanGroup(id) {
  const p = plan();
  const gid = decodeURIComponent(id || '');
  const g = p?.groups[gid];
  if (!g) return `${topbar('Grupo', '#/plan/edit')}<p class="muted">Ese grupo no existe.</p>`;
  const usedIn = p.meals.filter(m => m.slots.some(s => s.group === gid)).map(m => m.name);
  return `
    ${topbar(g.label, '#/plan/edit')}
    <section class="card form">
      <label>Nombre<input data-field="pe-group" data-k="label" value="${esc(g.label)}"></label>
      <label>Categoría (para el cumplimiento por porciones)<select data-action="pe-group-cat">${CATS.map(([k, l]) => `<option value="${k}" ${g.cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Aclaración (opcional)<input data-field="pe-group" data-k="hint" value="${esc(g.hint || '')}"></label>
      <small>${usedIn.length ? `Se usa en: ${esc(usedIn.join(', '))}` : 'Ninguna comida usa este grupo todavía.'}</small>
    </section>
    <h3 class="section">Opciones</h3>
    ${g.options.map(optObj).map((o, i) => `
      <div class="row plan-opt-edit">
        <span class="grow">
          <input data-field="pe-opt" data-i="${i}" value="${esc(o.t)}" aria-label="Opción ${i + 1}">
          <a class="small-link" href="#/plan/link/plan/${encodeURIComponent(gid)}/${i}">${o.f?.length ? `🔗 ${esc(linkText(o.f))}` : '⚠ Vincular a la base para sumar calorías'}</a>
        </span>
        <button class="icon-btn" data-action="pe-opt-del" data-i="${i}" aria-label="Quitar">✕</button>
      </div>`).join('')}
    <button class="btn block" data-action="pe-opt-add">+ Agregar opción</button>
    <button class="btn block ghost danger" data-action="pe-group-del">Eliminar este grupo</button>`;
}

function linkTarget(target) { return target === 'draft' ? draft : plan(); }

export function viewPlanLink(target, gidEnc, idx) {
  const p = linkTarget(target);
  const gid = decodeURIComponent(gidEnc || '');
  const g = p?.groups[gid];
  const i = Number(idx);
  if (!g || !g.options[i]) return `${topbar('Vincular', '#/plan')}<p class="muted">Esa opción no existe.</p>`;
  const o = optObj(g.options[i]);
  const back = target === 'draft' ? '#/plan/review' : `#/plan/group/${encodeURIComponent(gid)}`;
  return `
    ${topbar('Vincular opción', back)}
    <section class="card">
      <small>${esc(g.label)}</small>
      <b class="plan-title">${esc(o.t)}</b>
      ${o.src ? `<small>Según tu IA: ${esc(o.src)}</small>` : ''}
      <div class="link-list">${(o.f || []).map(([id, gr], k) => `
        <div class="row link-row"><span class="grow"><b>${esc(findFood(id)?.name || id)}</b>
          <small>${Math.round(nutrients(findFood(id) || FOODS[0], gr).kcal)} kcal</small></span>
          <input class="grams" data-field="pl-g" data-k="${k}" inputmode="decimal" value="${num(gr)}" aria-label="Gramos"><span class="muted small">g</span>
          <button class="icon-btn" data-action="pl-del" data-k="${k}" aria-label="Quitar">✕</button></div>`).join('') || '<p class="muted small">Todavía no tiene alimentos: buscalos abajo.</p>'}</div>
      ${o.f?.length ? `<p class="small">Total: <b>${Math.round(linkKcal(o.f))} kcal</b></p>` : ''}
    </section>
    <div class="search-box"><input type="search" data-field="pl-q" value="${esc(linkQ)}" placeholder="Buscar alimento para agregar…" autocomplete="off"></div>
    <div class="list" id="pl-results">${linkResults()}</div>
    <button class="btn primary block" data-action="pl-done" data-back="${back}">Listo</button>`;
}

function linkResults() {
  if (!linkQ.trim()) return '<p class="muted small">Escribí para buscar en la base de alimentos.</p>';
  const list = searchFoods(linkQ).slice(0, 30);
  if (!list.length) return '<p class="muted small">No hay resultados.</p>';
  return list.map(f => `<button class="row lib-row" data-action="pl-add" data-id="${esc(f.id)}"><span class="grow"><b>${esc(f.name)}</b>
    <small>${esc(f.portions[0][0])} (${num(f.portions[0][1])} g)</small></span><span class="chev">＋</span></button>`).join('');
}

// ---------- Acciones ----------

function currentLink() {
  const [, , , target, gidEnc, idx] = location.hash.split('/');
  const p = linkTarget(target);
  const g = p?.groups[decodeURIComponent(gidEnc || '')];
  if (!g) return null;
  const i = Number(idx);
  g.options[i] = optObj(g.options[i]);
  return { p, o: g.options[i], target };
}
const persist = target => { if (target !== 'draft') save(); };

function exportPlan() {
  const text = JSON.stringify(plan(), null, 2);
  if (env.native) return native.shareFile('plan-alimentacion.json', text).catch(err => { if (!/cancel/i.test(err.message)) alert(err.message); });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'plan-alimentacion.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


document.addEventListener('input', ev => {
  const t = ev.target;
  const f = t.dataset?.field;
  if (f === 'plan-text') aiText = t.value;
  else if (f === 'plan-result') aiResult = t.value;
  else if (f === 'pl-q') {
    linkQ = t.value;
    const box = document.getElementById('pl-results');
    if (box) box.innerHTML = linkResults();
  }
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  const f = t.dataset?.field, a = t.dataset?.action;
  const p = plan();
  const hashId = decodeURIComponent(location.hash.split('/')[3] || '');

  if (a === 'plan-pdf' && t.files?.[0]) {
    aiInfo = 'Leyendo el archivo…';
    ui.render({ keep: true });
    try {
      const r = await fileToText(t.files[0]);
      // Si ya es un plan de Temple (.json), se carga directo
      if (r.kind === 'json') {
        try { draft = parseAiPlan(r.text); aiInfo = ''; location.hash = '#/plan/review'; return; } catch {}
      }
      aiText = r.text.length > 80 ? r.text : '';
      aiInfo = aiText
        ? `✓ Leí tu plan${r.pages ? ` (${r.pages} página${r.pages === 1 ? '' : 's'})` : ''}. Ahora tocá "Enviar a mi IA".`
        : 'Este archivo no tiene texto para leer (¿foto o PDF escaneado?). Tocá "Enviar a mi IA" y adjuntalo en la conversación.';
    } catch (err) {
      aiInfo = `${err.message}`;
    }
    ui.render({ keep: true });
    return;
  }
  if (!p) return;
  if (f === 'pe-plan') {
    const [k1, k2] = t.dataset.k.split('.');
    const v = k2 ? parseNum(t.value) : t.value.trim();
    if (k2) { p[k1] ??= {}; if (v > 0) p[k1][k2] = v; } else p[k1] = v;
  } else if (f === 'pe-lines') {
    p[t.dataset.k] = t.value.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (f === 'pe-meal' || f === 'pe-meal-lines' || a === 'pe-meal-flag' || a === 'pe-slot') {
    const m = p.meals.find(x => x.id === hashId);
    if (!m) return;
    if (f === 'pe-meal') { const v = t.value.trim(); if (v || t.dataset.k !== 'name') m[t.dataset.k] = v || undefined; }
    else if (f === 'pe-meal-lines') m.examples = t.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (a === 'pe-meal-flag') m[t.dataset.k] = t.checked;
    else { const s = m.slots[Number(t.dataset.i)]; if (t.dataset.k === 'count') s.count = Math.max(1, parseInt(t.value, 10) || 1); else s.group = t.value; }
  } else if (f === 'pe-group' || a === 'pe-group-cat' || f === 'pe-opt') {
    const g = p.groups[hashId];
    if (!g) return;
    if (f === 'pe-group') { const v = t.value.trim(); if (v || t.dataset.k !== 'label') g[t.dataset.k] = v || undefined; }
    else if (a === 'pe-group-cat') g.cat = t.value;
    else { const i = Number(t.dataset.i); g.options[i] = { ...optObj(g.options[i]), t: t.value.trim() || optObj(g.options[i]).t }; }
  } else if (f === 'pl-g') {
    const cur = currentLink();
    const v = parseNum(t.value);
    if (cur && v > 0) { cur.o.f[Number(t.dataset.k)][1] = v; persist(cur.target); ui.render({ keep: true }); }
    return;
  } else return;
  save();
  ui.render({ keep: true });
});

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
  const a = btn.dataset.action;
  if (!a || !(a.startsWith('plan-') || a.startsWith('pe-') || a.startsWith('pl-'))) return;
  if (a === 'plan-file' || a === 'plan-pdf') return; // los maneja el evento change
  const p = plan();
  const hashId = decodeURIComponent(location.hash.split('/')[3] || '');

  if (a === 'plan-send') {
    // Al volver de la IA, si en el portapapeles hay un plan, se abre la revisión sola
    watchClipboard(looksLikePlan, t => {
      aiResult = t;
      try { draft = parseAiPlan(t); location.hash = '#/plan/review'; } catch (err) { ui.render({ keep: true }); alert(err.message); }
    });
    const r = await sendToAi(buildPrompt(aiText));
    aiSites = r === 'choose';
    ui.render({ keep: true });
  } else if (a === 'plan-site') {
    openAiSite(btn.dataset.url, buildPrompt(aiText));
  } else if (a === 'plan-paste') {
    aiResult = await readClipboard();
    if (!aiResult) alert('No pude leer el portapapeles. Mantené apretado el cuadro de texto y elegí "Pegar".');
    ui.render({ keep: true });
  } else if (a === 'plan-parse') {
    try { draft = parseAiPlan(aiResult); location.hash = '#/plan/review'; }
    catch (err) { alert(err.message); }
  } else if (a === 'plan-save-draft') {
    if (!draft) return;
    if (p && !confirm('Esto reemplaza tu plan actual. Tus registros de comidas se mantienen. ¿Seguir?')) return;
    state.food.plan = draft;
    draft = null; aiResult = ''; aiText = ''; aiInfo = '';
    save();
    location.hash = '#/food';
  } else if (a === 'plan-autolink') {
    const n = autoLink(p);
    if (!n) { alert('No encontré alimentos parecidos en la base. Podés vincularlas a mano desde "Ver o editar mi plan".'); return; }
    alert(`Vinculé ${n} opci${n === 1 ? 'ón' : 'ones'} con alimentos de la base, con una porción estándar. Quedan marcadas con ≈ para que revises los gramos en "Ver o editar mi plan".`);
    save();
    ui.render({ keep: true });
  } else if (a === 'plan-export') {
    exportPlan();
  } else if (a === 'plan-del') {
    if (!confirm('¿Quitar el plan de alimentación? Tus registros de comidas se mantienen.')) return;
    state.food.plan = null;
    save();
    location.hash = '#/plan';
  } else if (a === 'plan-manual') {
    if (!p) { state.food.plan = basePlan(); save(); }
    location.hash = '#/plan/edit';
  } else if (a === 'pl-done') {
    // Revisada: deja de estar marcada como aproximada
    const cur = currentLink();
    if (cur) { delete cur.o.approx; persist(cur.target); }
    location.hash = btn.dataset.back;
  } else if (a === 'pl-add' || a === 'pl-del') {
    const cur = currentLink();
    if (!cur) return;
    delete cur.o.approx;
    if (a === 'pl-add') {
      const food = findFood(btn.dataset.id);
      cur.o.f = [...(cur.o.f || []), [food.id, food.portions[0][1]]];
      linkQ = '';
    } else {
      cur.o.f.splice(Number(btn.dataset.k), 1);
      if (!cur.o.f.length) delete cur.o.f;
    }
    persist(cur.target);
    ui.render({ keep: true });
  } else if (p) {
    if (a === 'pe-meal-add') {
      const id = uid('comida-');
      p.meals.push({ id, name: 'Nueva comida', slots: [] });
      save();
      location.hash = `#/plan/meal/${id}`;
      return;
    } else if (a === 'pe-meal-move') {
      const i = Number(btn.dataset.i), j = i + Number(btn.dataset.dir);
      if (j < 0 || j >= p.meals.length) return;
      [p.meals[i], p.meals[j]] = [p.meals[j], p.meals[i]];
    } else if (a === 'pe-meal-del') {
      const m = p.meals.find(x => x.id === hashId);
      if (!m || !confirm(`¿Eliminar "${m.name}" del plan? Lo que ya registraste se mantiene.`)) return;
      p.meals = p.meals.filter(x => x !== m);
      save();
      location.hash = '#/plan/edit';
      return;
    } else if (a === 'pe-slot-add') {
      const m = p.meals.find(x => x.id === hashId);
      const first = Object.keys(p.groups)[0];
      if (!m) return;
      if (!first) { alert('Primero creá un grupo de opciones.'); return; }
      m.slots.push({ group: first, count: 1 });
    } else if (a === 'pe-slot-del') {
      const m = p.meals.find(x => x.id === hashId);
      m?.slots.splice(Number(btn.dataset.i), 1);
    } else if (a === 'pe-group-add') {
      const id = uid('grupo-');
      p.groups[id] = { label: 'Nuevo grupo', cat: 'prot', options: [] };
      save();
      location.hash = `#/plan/group/${id}`;
      return;
    } else if (a === 'pe-group-del') {
      const used = p.meals.filter(m => m.slots.some(s => s.group === hashId));
      if (used.length) { alert(`No se puede eliminar: lo usan ${used.map(m => m.name).join(', ')}. Quitalo primero de esas comidas.`); return; }
      if (!confirm('¿Eliminar este grupo y sus opciones?')) return;
      delete p.groups[hashId];
      save();
      location.hash = '#/plan/edit';
      return;
    } else if (a === 'pe-opt-add') {
      p.groups[hashId]?.options.push({ t: 'Nueva opción' });
    } else if (a === 'pe-opt-del') {
      const g = p.groups[hashId];
      if (!g || !confirm(`¿Quitar "${optObj(g.options[Number(btn.dataset.i)]).t}"?`)) return;
      g.options.splice(Number(btn.dataset.i), 1);
    } else return;
    save();
    ui.render({ keep: true });
  }
});

