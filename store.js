// Estado compartido, utilidades y helpers usados por todas las pantallas.
import { DEFAULT_ROUTINE } from './routine.js';

const LS_KEY = 'gymapp.v1';
export const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ---------- Estado ----------

export const fresh = () => ({
  routine: structuredClone(DEFAULT_ROUTINE),
  // { 'YYYY-MM-DD': { cardio, ex: { [key]: { sets: [{ w, r }], note } },
  //                   food: { meals: { [id]: { items: ['grupo|opción'], done, note } }, water, sleep } } }
  logs: {},
  links: {},  // { [key]: url }
  body: {},   // { 'YYYY-MM-DD': kg }
  food: { plan: null },
  settings: { deload: false, lastDeload: null, mealPrepDow: null },
});

function normalize(s) {
  const base = fresh();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base, ...s,
    routine: s.routine || base.routine,
    food: { ...base.food, ...s.food },
    settings: { ...base.settings, ...s.settings },
  };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(LS_KEY))); } catch { return fresh(); }
}

export let state = load();
export const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
export function replaceState(s) { state = normalize(s); save(); }

// app.js asigna ui.render para que los módulos puedan volver a dibujar.
export const ui = { render: () => {} };

// ---------- Utilidades ----------

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = n => Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '';
export const parseNum = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const roundTo = (x, step) => Math.round(x / step) * step;
export const pad = n => String(n).padStart(2, '0');
export const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
export const fmtDate = s => toDate(s).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDateLong = s => toDate(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
export const isUrl = v => /^https?:\/\//i.test(v);

// ---------- Fecha activa (para cargar días pasados desde el calendario) ----------

let active = null;
export const activeDate = () => active || todayStr();
export const setActiveDate = d => { active = d && d < todayStr() ? d : null; };
export const dayLog = (d = activeDate()) => state.logs[d];
export const ensureLog = (d = activeDate()) => state.logs[d] ??= {};

export const dateBanner = () => active ? `
  <div class="banner past"><div>Estás cargando <b>${fmtDateLong(active)}</b></div>
  <button class="btn small" data-action="date-today">Volver a hoy</button></div>` : '';

// ---------- Entreno ----------

export const doneSets = s => (s?.sets || []).filter(x => x.r > 0);
export const unitLabel = e => e.type === 'time' ? 's' : 'reps';
export const fmtSet = (e, x) => e.type === 'weight' ? `${num(x.w ?? 0)}×${x.r}` : `${x.r}${e.type === 'time' ? 's' : ''}`;
export const trainedOn = d => Object.values(state.logs[d]?.ex || {}).some(x => doneSets(x).length);
export const plannedDay = d => state.routine.days.find(x => x.dow === toDate(d).getDay());
export const isTrainingDay = d => trainedOn(d) || !!plannedDay(d);

export function exerciseNames() {
  const names = {};
  for (const d of state.routine.days) for (const e of d.exercises) names[e.key] ??= e;
  return names;
}

// ---------- Componentes ----------

export const topbar = (title, back, right = '') => `
  <header class="topbar">
    ${back ? `<a class="icon" href="${back}" aria-label="Volver">‹</a>` : '<span class="icon"></span>'}
    <h1>${esc(title)}</h1>
    ${right || '<span class="icon"></span>'}
  </header>`;

export const gear = '<a class="icon" href="#/settings" aria-label="Ajustes">⚙</a>';

export function chart(points, fmt = num) {
  if (points.length < 2) return '';
  const W = 320, H = 110, P = 14;
  const ys = points.map(p => p.y);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const xy = points.map((p, k) => [P + k * (W - 2 * P) / (points.length - 1), H - P - (p.y - min) / span * (H - 2 * P)]);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progreso">
    <polyline points="${xy.map(p => p.join(',')).join(' ')}" />
    ${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" />`).join('')}
    <text x="${P}" y="12">${fmt(max)}</text><text x="${P}" y="${H - 2}">${fmt(min)}</text>
  </svg>`;
}
