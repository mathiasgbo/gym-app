// Agregar alimentos a una comida: búsqueda en la base, porción y cantidad, y alimentos propios.
//   #/add/<comida>                     → buscar
//   #/add/<comida>/<alimento>[/<i>]    → elegir porción y cantidad (con <i>: editar el registro i)
//   #/newfood/<comida>                 → crear un alimento propio
// También: escanear o ingresar el código de barras de un producto envasado (Open Food Facts).
import { state, save, ui, esc, num, parseNum, activeDate, topbar, dateBanner, env } from './store.js';
import { lookupBarcode, localByCode, saveProduct } from './off.js';
import * as native from './native.js';
import { FOOD_CATS, norm, allFoods, findFood, nutrients, searchFoods } from './foods.js';
import { plan, mealEntry } from './food.js';

const CAT_LABEL = Object.fromEntries(FOOD_CATS);
const mealName = id => plan()?.meals.find(m => m.id === id)?.name || 'la comida';
const kcal = n => Math.round(n.kcal);
const grams = g => `${num(Math.round(g))} g`;

let query = '';
let tab = null;            // recientes | favoritos | todos | categoría
let sel = null;            // { key, pi, q } porción elegida en la pantalla de cantidad
let prefill = null;        // datos para "Nuevo alimento" cuando un código no se encontró

// Aviso flotante breve ("Buscando el producto…").
function toast(text) {
  let el = document.getElementById('toast');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'toast' }); document.body.append(el); }
  el.textContent = text || '';
  el.hidden = !text;
}

// Código leído o tipeado → producto. Primero busca en lo guardado, después en Open Food Facts.
async function openBarcode(meal, raw) {
  const code = String(raw || '').replace(/\D/g, '');
  if (code.length < 8) { alert('Ese código no parece válido (tiene que tener 8 a 13 números).'); return; }
  const local = localByCode(code);
  if (local) { location.hash = `#/add/${meal}/${local.id}`; return; }
  toast('Buscando el producto…');
  try {
    const r = await lookupBarcode(code);
    if (r.food) {
      saveProduct(r.food);
      location.hash = `#/add/${meal}/${r.food.id}`;
    } else {
      prefill = {
        code,
        name: r.found ? [r.name, r.brand].filter(Boolean).join(' · ') : '',
        msg: r.found
          ? 'Ese producto está en Open Food Facts pero sin tabla nutricional. Completá los valores de la etiqueta.'
          : 'No encontré ese código en Open Food Facts. Cargalo con los valores de la etiqueta y la próxima vez lo reconoce.',
      };
      location.hash = `#/newfood/${meal}`;
    }
  } catch (err) {
    alert(err.message);
  } finally {
    toast(null);
  }
}

// ---------- Búsqueda ----------

function resultRows(meal) {
  const { recent, fav } = state.foods;
  let list;
  if (query.trim()) list = searchFoods(query);
  else if (tab === 'recent') list = recent.map(findFood).filter(Boolean);
  else if (tab === 'fav') list = fav.map(findFood).filter(Boolean);
  else if (tab === 'all') list = [...allFoods()].sort((a, b) => a.name.localeCompare(b.name));
  else list = allFoods().filter(f => f.cat === tab).sort((a, b) => a.name.localeCompare(b.name));

  if (!list.length) {
    const msg = query.trim() ? `No encontré "${esc(query)}".`
      : tab === 'recent' ? 'Todavía no agregaste alimentos.' : tab === 'fav' ? 'Marcá alimentos con ☆ para tenerlos acá.' : 'Sin alimentos.';
    return `<p class="muted empty-results">${msg}</p>`;
  }
  return list.slice(0, 80).map(f => {
    const [pl, g] = f.portions[0];
    const isFav = fav.includes(f.id);
    return `<div class="row food-row">
      <a class="grow" href="#/add/${esc(meal)}/${esc(f.id)}"><b>${esc(f.name)}${f.custom ? ' <span class="tag">propio</span>' : ''}</b>
        <small>${esc(pl)}${f.noGrams ? "" : ` (${grams(g)})`} · ${kcal(nutrients(f, g))} kcal</small></a>
      <button class="star ${isFav ? 'on' : ''}" data-action="food-fav" data-id="${esc(f.id)}" aria-label="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${isFav ? '★' : '☆'}</button>
    </div>`;
  }).join('');
}

function viewSearch(meal) {
  tab ??= state.foods.recent.length ? 'recent' : 'all';
  const tabs = [['recent', 'Recientes'], ['fav', 'Favoritos'], ['all', 'Todos'], ...FOOD_CATS]
    .map(([id, label]) => `<button class="chip ${!query.trim() && tab === id ? 'on' : ''}" data-action="food-tab" data-tab="${id}">${label}</button>`).join('');
  return `
    ${topbar(`Agregar a ${mealName(meal)}`, '#/food')}
    ${dateBanner()}
    <div class="search-box">
      <input type="search" data-field="food-q" value="${esc(query)}" placeholder="Buscar: milanesa, banana, arroz…" autocomplete="off" enterkeyhint="search">
    </div>
    <div class="scan-row">
      ${env.native ? `<button class="btn primary" data-action="barcode-scan" data-meal="${esc(meal)}">📷 Escanear código</button>` : ''}
      <button class="btn ${env.native ? 'ghost' : ''}" data-action="barcode-type" data-meal="${esc(meal)}">Ingresar código de barras</button>
    </div>
    <div class="chips scroll-x food-tabs">${tabs}</div>
    <div class="list" id="food-results">${resultRows(meal)}</div>
    <a class="btn block" href="#/newfood/${esc(meal)}">+ Crear un alimento</a>
    <p class="muted small">Valores aproximados, de tablas públicas de composición de alimentos.</p>`;
}

// ---------- Porción y cantidad ----------

function viewPortion(meal, id, idx) {
  const food = findFood(id);
  if (!food) return `${topbar('Alimento', `#/add/${meal}`)}<p class="muted">Ese alimento ya no existe.</p>`;
  const editing = idx != null && idx !== '';
  const key = `${meal}/${id}/${idx ?? ''}`;
  if (sel?.key !== key) {
    const prev = editing ? mealEntry(meal).foods?.[Number(idx)] : null;
    sel = { key, pi: prev?.pi ?? 0, q: prev?.q ?? 1 };
  }
  const [, g] = food.portions[sel.pi] || food.portions[0];
  const n = nutrients(food, g * sel.q);
  const chips = food.portions.map(([pl, pg], i) =>
    `<button class="chip ${i === sel.pi ? 'on' : ''}" data-action="food-portion" data-pi="${i}">${esc(pl)}${food.noGrams || /^\d+ g$/.test(pl) ? "" : ` <small class="inline">${grams(pg)}</small>`}</button>`).join('');

  return `
    ${topbar(food.name, `#/add/${esc(meal)}`)}
    ${dateBanner()}
    <section class="card">
      <small>${CAT_LABEL[food.cat] || ''}${food.source === 'off' ? ' · producto escaneado' : food.custom ? ' · alimento propio' : ''}</small>
      <h3 class="label">Porción</h3>
      <div class="chips">${chips}</div>
      <h3 class="label">Cantidad</h3>
      <div class="stepper qty">
        <button class="btn" data-action="food-qty" data-d="-0.5" aria-label="Menos">−</button>
        <b>${num(sel.q)}</b>
        <button class="btn" data-action="food-qty" data-d="0.5" aria-label="Más">+</button>
      </div>
      <div class="macro-preview">
        <div><b>${kcal(n)}</b><small>kcal</small></div>
        <div><b>${num(Math.round(n.p))}</b><small>proteína (g)</small></div>
        <div><b>${num(Math.round(n.c))}</b><small>hidratos (g)</small></div>
        <div><b>${num(Math.round(n.f))}</b><small>grasa (g)</small></div>
      </div>
      ${food.noGrams ? "" : `<p class="muted small center">${grams(g * sel.q)} en total</p>`}
      <button class="btn primary block" data-action="food-add" data-meal="${esc(meal)}" data-id="${esc(id)}" data-idx="${editing ? idx : ''}">${editing ? 'Guardar' : `Agregar a ${esc(mealName(meal))}`}</button>
      ${editing ? `<button class="btn block danger" data-action="food-remove" data-meal="${esc(meal)}" data-idx="${idx}">Quitar de la comida</button>` : ''}
      ${food.source === 'off' ? `<p class="muted small center">Datos de <a href="https://world.openfoodfacts.org/product/${esc(food.code)}" target="_blank" rel="noopener">Open Food Facts</a> (ODbL) · código ${esc(food.code)}</p>` : ''}
      ${food.custom ? `<button class="btn small ghost danger" data-action="custom-del" data-id="${esc(id)}" data-meal="${esc(meal)}">Eliminar este alimento propio</button>` : ''}
    </section>`;
}

export function viewAddFood(meal, id, idx) {
  if (!plan()?.meals.some(m => m.id === meal)) return `${topbar('Agregar', '#/food')}<p class="muted">Esa comida no existe en tu plan.</p>`;
  return id ? viewPortion(meal, decodeURIComponent(id), idx) : viewSearch(meal);
}

// ---------- Alimento propio ----------

export function viewNewFood(meal) {
  const cats = FOOD_CATS.map(([id, l]) => `<option value="${id}" ${id === 'otro' && prefill ? 'selected' : ''}>${l}</option>`).join('');
  return `
    ${topbar('Nuevo alimento', `#/add/${esc(meal)}`)}
    ${prefill?.msg ? `<p class="note">${esc(prefill.msg)}</p>` : ''}
    <form class="card form" data-form="newfood" data-meal="${esc(meal)}">
      <label>Nombre<input name="name" required maxlength="60" placeholder="Ej: Yogur Ser con cereales" value="${esc(prefill?.name || '')}"></label>
      ${prefill?.code ? `<p class="muted small">Código de barras: ${esc(prefill.code)}</p>` : ''}
      <label>Categoría<select name="cat">${cats}</select></label>
      <div class="grid2">
        <label>Porción<input name="portion" value="1 porción" maxlength="30"></label>
        <label>Gramos de la porción<input name="g" inputmode="decimal" placeholder="opcional"></label>
      </div>
      <p class="muted small">Valores de <b>una porción</b> (los encontrás en la etiqueta del envase):</p>
      <div class="grid2">
        <label>Calorías (kcal)<input name="kcal" inputmode="decimal" required placeholder="150"></label>
        <label>Proteína (g)<input name="p" inputmode="decimal" placeholder="0"></label>
        <label>Hidratos (g)<input name="c" inputmode="decimal" placeholder="0"></label>
        <label>Grasa (g)<input name="f" inputmode="decimal" placeholder="0"></label>
      </div>
      <button class="btn primary block" type="submit">Guardar y elegir cantidad</button>
    </form>`;
}

// ---------- Eventos ----------

function rememberRecent(id) {
  const r = state.foods.recent.filter(x => x !== id);
  r.unshift(id);
  state.foods.recent = r.slice(0, 25);
}

document.addEventListener('input', ev => {
  if (ev.target.dataset?.field !== 'food-q') return;
  query = ev.target.value;
  const meal = location.hash.split('/')[2];
  const box = document.getElementById('food-results');
  if (box) box.innerHTML = resultRows(meal);
  document.querySelectorAll('.food-tabs .chip').forEach(c => c.classList.toggle('on', !query.trim() && c.dataset.tab === tab));
});

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT') return;
  const a = btn.dataset.action;
  if (a === 'barcode-scan') {
    native.scanBarcode().then(code => code && openBarcode(btn.dataset.meal, code)).catch(err => alert(err.message));
    return;
  } else if (a === 'barcode-type') {
    const code = prompt('Código de barras (los números debajo de las barras):');
    if (code) openBarcode(btn.dataset.meal, code);
    return;
  } else if (a === 'food-tab') {
    tab = btn.dataset.tab;
    query = '';
    ui.render({ keep: true });
  } else if (a === 'food-fav') {
    const id = btn.dataset.id;
    const f = state.foods.fav;
    state.foods.fav = f.includes(id) ? f.filter(x => x !== id) : [id, ...f];
    save();
    const box = document.getElementById('food-results');
    if (box) box.innerHTML = resultRows(location.hash.split('/')[2]);
  } else if (a === 'food-portion') {
    sel.pi = Number(btn.dataset.pi);
    ui.render({ keep: true });
  } else if (a === 'food-qty') {
    sel.q = Math.max(0.5, Math.min(20, sel.q + Number(btn.dataset.d)));
    ui.render({ keep: true });
  } else if (a === 'food-add') {
    const { meal, id, idx } = btn.dataset;
    const m = mealEntry(meal);
    m.foods ??= [];
    const entry = { id, q: sel.q, pi: sel.pi, name: findFood(id)?.name };
    if (idx !== '') m.foods[Number(idx)] = entry; else m.foods.push(entry);
    m.status = 'ate';
    rememberRecent(id);
    save();
    sel = null;
    query = '';
    tab = null; // la próxima vez arranca en Recientes
    location.hash = '#/food';
  } else if (a === 'food-remove') {
    const m = mealEntry(btn.dataset.meal);
    m.foods.splice(Number(btn.dataset.idx), 1);
    if (!m.foods.length && !m.items.length && !m.note) delete m.status;
    save();
    sel = null;
    location.hash = '#/food';
  } else if (a === 'custom-del') {
    const id = btn.dataset.id;
    if (!confirm('¿Eliminar este alimento propio? Lo que ya registraste se mantiene.')) return;
    state.foods.custom = state.foods.custom.filter(f => f.id !== id);
    state.foods.fav = state.foods.fav.filter(x => x !== id);
    state.foods.recent = state.foods.recent.filter(x => x !== id);
    save();
    location.hash = `#/add/${btn.dataset.meal}`;
  }
});

document.addEventListener('submit', ev => {
  const form = ev.target;
  if (form.dataset.form !== 'newfood') return;
  ev.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  const name = v.name.trim();
  const kcalP = parseNum(v.kcal);
  if (!name || kcalP == null || kcalP < 0) { alert('Completá el nombre y las calorías de la porción.'); return; }
  const g = parseNum(v.g);
  const per = [kcalP, parseNum(v.p) || 0, parseNum(v.c) || 0, parseNum(v.f) || 0];
  // Si no se indican gramos, la porción vale "100" internamente y los valores son por porción.
  const base = g > 0 ? g : 100;
  const food = {
    id: `c-${Date.now().toString(36)}`, name, cat: v.cat, custom: true,
    k: per.map(x => Math.round(x * 100 / base * 10) / 10),
    portions: [[v.portion.trim() || '1 porción', base]],
    terms: norm(`${name} ${prefill?.code || ''}`),
    noGrams: !(g > 0),
    ...(prefill?.code ? { code: prefill.code } : {}),
  };
  prefill = null;
  state.foods.custom.push(food);
  save();
  location.hash = `#/add/${form.dataset.meal}/${food.id}`;
});

