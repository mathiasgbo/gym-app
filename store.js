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
  foods: { custom: [], recent: [], fav: [] }, // alimentos propios, recientes y favoritos
  anthro: [], // mediciones importadas de los informes PDF
  profile: null, // { name, age, ageDate, height, createdAt } — se completa en la pantalla de bienvenida
  settings: {
    deload: false, lastDeload: null, mealPrepDow: null,
    water: { enabled: false, from: 9, to: 21, every: 2 }, // recordatorios (solo app Android)
    healthSleep: false,                                    // leer sueño de Health Connect (solo app Android)
  },
});

function normalize(s) {
  const base = fresh();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base, ...s,
    routine: s.routine || base.routine,
    food: { ...base.food, ...s.food },
    foods: { ...base.foods, ...s.foods },
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

// Entorno: native = app de Android (Capacitor); health = permiso de sueño de Health Connect concedido.
export const env = { native: false, health: false };

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

// Registro de ejercicios por día de rutina.
// logs[fecha].ex[slot] = { sets, note, day }. El slot es la key del ejercicio; si ese mismo ejercicio
// se hace en otro día de rutina en la misma fecha, va en "key#díaId". Así martes y sábado no se
// mezclan aunque compartan ejercicios, y la progresión (que usa la key base) sigue siendo común.
export const baseKey = slot => slot.split('#')[0];
// Registros viejos no guardaban el día: se asumen del día planificado para esa fecha.
const entryDay = (entry, date) => entry.day ?? plannedDay(date)?.id ?? null;

export function exEntry(date, key, dayId) {
  const ex = state.logs[date]?.ex;
  if (!ex) return null;
  for (const [slot, entry] of Object.entries(ex)) {
    if (baseKey(slot) === key && entryDay(entry, date) === dayId) return entry;
  }
  return null;
}

export function ensureExEntry(date, key, dayId) {
  const found = exEntry(date, key, dayId);
  if (found) return found;
  const L = state.logs[date] ??= {};
  L.ex ??= {};
  const slot = L.ex[key] ? `${key}#${dayId}` : key;
  return L.ex[slot] = { sets: [], day: dayId };
}

// Todos los registros de un ejercicio en una fecha (de cualquier día de rutina).
export const exEntriesOn = (date, key) =>
  Object.entries(state.logs[date]?.ex || {}).filter(([slot]) => baseKey(slot) === key).map(([, e]) => e);

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

// Íconos de línea (24×24, trazo con currentColor).
export const ICONS = {
  train: '<svg viewBox="0 0 24 24"><path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z"/><path d="M8.5 8.5c0-1.2 1.2-1.6 1.2-2.8M12 8.5c0-1.2 1.2-1.6 1.2-2.8M15.5 8.5c0-1.2 1.2-1.6 1.2-2.8"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  progress: '<svg viewBox="0 0 24 24"><path d="M3.5 19.5h17M5.5 15.5l4.5-4.5 3.5 3.5 6-6.5"/><path d="M15.5 8h4v4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10Z"/><path d="M14 3.5v5h5M9 13.5h6M9 17h4"/></svg>',
  backup: '<svg viewBox="0 0 24 24"><path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 14v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"/></svg>',
};

// Logo: templo cuyo arquitrabe es una barra con discos, con el degradé de revenido.
export const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#f3cf6b"/><stop offset=".4" stop-color="#e0904f"/><stop offset=".75" stop-color="#a866d6"/><stop offset="1" stop-color="#5b8def"/></linearGradient></defs>
  <g fill="url(#tg)"><path d="M32 7 57 21H7Z"/><rect x="9" y="24.5" width="46" height="3.5" rx="1"/><rect x="5" y="20.5" width="4.5" height="11.5" rx="1"/>
  <rect x="54.5" y="20.5" width="4.5" height="11.5" rx="1"/><rect x="10.5" y="22.5" width="2.5" height="7.5" rx=".8"/><rect x="51" y="22.5" width="2.5" height="7.5" rx=".8"/>
  <rect x="16" y="32" width="6" height="19" rx="1"/><rect x="29" y="32" width="6" height="19" rx="1"/><rect x="42" y="32" width="6" height="19" rx="1"/>
  <rect x="10" y="53" width="44" height="4.5" rx="1"/></g></svg>`;

export const gear = `<a class="icon" href="#/settings" aria-label="Ajustes">${ICONS.gear}</a>`;

// Barra superior de la pantalla principal: logo + TEMPLE.
export const brandbar = () => `
  <header class="topbar brand">
    <span class="brand-mark">${LOGO}<h1>Temple</h1></span>
    ${gear}
  </header>`;

// ---------- Perfil ----------

// Edad actual a partir de la edad cargada y la fecha en que se cargó.
export function profileAge() {
  const p = state.profile;
  if (!p?.age) return null;
  const years = Math.floor((toDate(todayStr()) - toDate(p.ageDate || todayStr())) / (365.25 * 864e5));
  return p.age + Math.max(0, years);
}

export function greeting() {
  const h = new Date().getHours();
  const hi = h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const name = state.profile?.name?.split(' ')[0];
  return name ? `${hi}, ${esc(name)}` : hi;
}

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
