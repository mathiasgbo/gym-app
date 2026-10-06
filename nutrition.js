// Calorías y macros: totales por comida y por día, y objetivo diario estimado.
// Todo es aproximado y de apoyo: el plan de la nutricionista sigue siendo por porciones.
import { state, todayStr, addDays, fmtDate, profileAge } from './store.js';
import { findFood, nutrients, entryInfo } from './foods.js';
import { plan, mealsFor, mealStatus } from './food.js';
import { measures } from './anthro.js';

const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0 });
const add = (a, b, k = 1) => { a.kcal += b.kcal * k; a.p += b.p * k; a.c += b.c * k; a.f += b.f * k; return a; };

// ---------- Opciones del plan ----------

const optLabel = o => typeof o === 'string' ? o : o.t;

// Nutrientes de una opción del plan (si está vinculada a alimentos de la base), o null.
function optionNutrients(groupId, label) {
  const o = plan()?.groups[groupId]?.options.find(x => optLabel(x) === label);
  if (!o?.f) return null;
  const n = ZERO();
  for (const [id, g] of o.f) { const food = findFood(id); if (food) add(n, nutrients(food, g)); }
  return n;
}

// Promedio de las opciones de un grupo: se usa cuando la comida se marcó "Comí" sin detalle.
function groupAverage(groupId) {
  const opts = (plan()?.groups[groupId]?.options || []).map(o => optionNutrients(groupId, optLabel(o))).filter(Boolean);
  if (!opts.length) return null;
  return opts.reduce((a, n) => add(a, n, 1 / opts.length), ZERO());
}

// ---------- Totales ----------

// { kcal, p, c, f, estimated } de una comida registrada como "comí" (null si no).
export function mealNutrition(m, date) {
  const st = mealStatus(m, date);
  if (st.status !== 'ate') return null;
  const n = ZERO();
  let estimated = st.generic;
  for (const it of st.items) {
    const [g, ...rest] = it.split('|');
    const on = optionNutrients(g, rest.join('|'));
    if (on) add(n, on); else estimated = true;
  }
  for (const e of st.foods) { const i = entryInfo(e); if (i.n) add(n, i.n); }
  if (st.generic) {
    for (const s of st.slots) {
      if (s.optional) continue;
      const avg = groupAverage(s.group);
      if (avg) add(n, avg, s.count || 1);
    }
  }
  return { ...n, estimated };
}

export function dayNutrition(date) {
  const n = ZERO();
  let any = false, estimated = false;
  for (const m of mealsFor(date)) {
    const mn = mealNutrition(m, date);
    if (!mn) continue;
    any = true;
    estimated ||= mn.estimated;
    add(n, mn);
  }
  return any ? { ...n, estimated } : null;
}

// Promedio de kcal de los últimos `days` días con comidas registradas.
export function avgKcal(days = 7, from = todayStr()) {
  const vals = Array.from({ length: days }, (_, k) => dayNutrition(addDays(from, -k))?.kcal).filter(v => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ---------- Objetivo diario ----------

export const ACTIVITY = {
  sit: { label: 'Mayormente sentado', hint: 'Oficina, estudio, manejar', f: 1.3 },
  stand: { label: 'De pie o caminando', hint: 'Comercio, docencia, atención al público', f: 1.45 },
  active: { label: 'Trabajo físico', hint: 'Construcción, depósito, reparto a pie', f: 1.65 },
};

export const GOALS = {
  gain: { label: 'Ganar músculo', kcal: 250 },
  keep: { label: 'Mantener', kcal: 0 },
  lose: { label: 'Bajar grasa', kcal: -400 },
};

// Objetivo por defecto según el plan cargado ("aumento de masa muscular" → ganar músculo).
function defaultGoal() {
  const g = (plan()?.goal || '').toLowerCase();
  if (/masa|volumen|hipertrof|aumento/.test(g)) return 'gain';
  if (/baj|defin|descen|grasa/.test(g)) return 'lose';
  return 'keep';
}

function lastWeight() {
  const d = Object.keys(state.body).sort().at(-1);
  return d ? state.body[d] : null;
}

// Estimación: metabolismo basal × actividad (+ entrenamientos de la rutina) ± objetivo.
// El basal sale del último informe de antropometría si lo trae; si no, Mifflin-St Jeor.
export function energy() {
  const p = state.profile || {};
  const cfg = state.settings.kcal || {};
  const goal = GOALS[cfg.goal] ? cfg.goal : defaultGoal();
  const weight = lastWeight();
  const age = profileAge();
  const m = [...measures()].reverse().find(x => x.bmr);

  let bmr = null, bmrSource = '';
  if (m) { bmr = m.bmr; bmrSource = `informe del ${fmtDate(m.date)}`; }
  else if (p.sex && weight && p.height && age) {
    bmr = 10 * weight + 6.25 * p.height - 5 * age + (p.sex === 'f' ? -161 : 5);
    bmrSource = 'calculado con tu peso, altura y edad';
  }

  const trainDays = state.routine.days.length;
  const factor = ACTIVITY[p.activity] ? ACTIVITY[p.activity].f + 0.04 * trainDays : null;
  const auto = bmr && factor ? Math.round((bmr * factor + GOALS[goal].kcal) / 10) * 10 : null;
  const manual = cfg.mode === 'manual' && cfg.manual > 0;
  const target = manual ? cfg.manual : auto;

  // Macros de referencia: proteína 1,8 g/kg, grasa 27 % de las kcal, el resto hidratos.
  const macros = target && weight ? (() => {
    const pr = 1.8 * weight, fat = target * 0.27 / 9;
    return { p: pr, f: fat, c: Math.max(0, (target - pr * 4 - fat * 9) / 4) };
  })() : null;

  const missing = [];
  if (!p.activity) missing.push('actividad');
  if (!m && !p.sex) missing.push('sexo');
  return { bmr, bmrSource, factor, trainDays, goal, auto, target, manual, macros, missing };
}
