// Calendario mensual, resumen de un día y estadísticas semanales.
import {
  state, ui, esc, num, pad, todayStr, toDate, addDays, fmtDateLong, dayLog, setActiveDate,
  trainedOn, plannedDay, doneSets, fmtSet, exerciseNames, topbar, gear, DOW, baseKey,
} from './store.js';
import { plan, mealsFor, mealStatus, foodScore, dayPortions, waterMl, waterTarget } from './food.js';
import { entryInfo } from './foods.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const scoreClass = s => s == null ? '' : s >= 0.8 ? 'good' : s >= 0.5 ? 'mid' : 'low';

export function viewCalendar(ym) {
  const today = todayStr();
  const [y, m] = (ym && /^\d{4}-\d{2}$/.test(ym) ? ym : today.slice(0, 7)).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // semana arranca el lunes
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;

  let trained = 0, cardio = 0;
  const scores = [];
  const cells = Array.from({ length: offset }, () => '<span class="cal-day blank"></span>');
  for (let n = 1; n <= daysIn; n++) {
    const d = `${y}-${pad(m)}-${pad(n)}`;
    const L = state.logs[d];
    const t = trainedOn(d);
    const s = foodScore(d);
    if (t) trained++;
    if (L?.cardio) cardio++;
    if (s != null) scores.push(s);
    const planned = !t && d >= today && plannedDay(d);
    cells.push(`<a class="cal-day ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}" href="#/date/${d}">
      <span class="dnum">${n}</span>
      <span class="dots">
        ${t ? '<i class="dot train"></i>' : planned ? '<i class="dot plan"></i>' : ''}
        ${L?.cardio ? '<i class="dot cardio"></i>' : ''}
        ${s != null ? `<i class="dot food ${scoreClass(s)}"></i>` : ''}
      </span></a>`);
  }
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) : null;

  return `
    ${topbar('Calendario', null, gear)}
    <div class="cal-nav">
      <a class="btn small" href="#/cal/${prev}" aria-label="Mes anterior">‹</a>
      <h2>${MONTHS[m - 1]} ${y}</h2>
      <a class="btn small" href="#/cal/${next}" aria-label="Mes siguiente">›</a>
    </div>
    <div class="cal">
      ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="cal-h">${x}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="legend">
      <span><i class="dot train"></i>Entreno</span><span><i class="dot plan"></i>Planificado</span>
      <span><i class="dot cardio"></i>Cardio</span><span><i class="dot food good"></i><i class="dot food mid"></i><i class="dot food low"></i>Comidas</span>
    </div>
    <section class="card">
      <h3>Resumen del mes</h3>
      <div class="kpis">
        <div><b>${trained}</b><small>entrenos</small></div>
        <div><b>${cardio}</b><small>días de cardio</small></div>
        <div><b>${avg != null ? avg + '%' : '—'}</b><small>comidas cumplidas</small></div>
      </div>
    </section>`;
}

export function viewDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
  const today = todayStr();
  const L = dayLog(d) || {};
  const names = exerciseNames();
  const exs = Object.entries(L.ex || {}).filter(([, x]) => doneSets(x).length);
  const p = plannedDay(d);

  const train = exs.length
    ? `<div class="list">${exs.map(([k, x]) => {
        const e = names[baseKey(k)] || { name: baseKey(k), type: 'weight' };
        const day = x.day && state.routine.days.find(r => r.id === x.day);
        return `<div class="row"><span class="grow"><b>${esc(e.name)}</b>${day && day !== p ? ` <span class="tag">${esc(day.title)}</span>` : ''}
          <small>${doneSets(x).map(s => fmtSet(e, s)).join(' · ')}${x.note ? ` — ${esc(x.note)}` : ''}</small></span></div>`;
      }).join('')}</div>`
    : `<p class="muted">${d > today ? (p ? `Planificado: ${esc(p.title)}` : 'Día de descanso.') : 'Sin entreno registrado.'}</p>`;

  const meals = mealsFor(d);
  const food = !plan() ? '<p class="muted">Sin plan de alimentación cargado.</p>' : `
    <div class="list">${meals.map(m => {
      const st = mealStatus(m, d);
      const items = st.items.map(it => it.split('|').slice(1).join('|'));
      const icon = { ate: '✓', skipped: '✗', none: '○' }[st.status];
      const foods = st.foods.map(e => { const i = entryInfo(e); return i.label ? `${i.name} (${i.label})` : i.name; });
      const detail = st.status === 'skipped' ? 'No comí' : st.generic ? 'Según el plan' : [...items, ...foods, st.note].filter(Boolean).join(' · ');
      return `<div class="row ${st.status === 'ate' ? '' : 'faded'}"><span class="grow"><b>${icon} ${esc(m.name)}</b>
        ${detail ? `<small>${esc(detail)}</small>` : ''}</span></div>`;
    }).join('')}</div>
    ${foodScore(d) != null ? `<p class="small">Cumplimiento del plan: <b>${Math.round(foodScore(d) * 100)}%</b> · ${dayPortions(d).map(x => `${x.label} ${num(Math.min(x.done, 99))}/${x.target}`).join(' · ')}</p>` : ''}
    <p class="muted small">💧 ${num(waterMl(d) / 1000)} / ${num(waterTarget() / 1000)} L · 😴 ${L.food?.sleep != null ? num(L.food.sleep) + ' h' : '—'}</p>`;

  const editable = d <= today;
  const dayLinks = state.routine.days.map(x =>
    `<button class="btn small ${p === x ? 'primary' : ''}" data-action="edit-date" data-date="${d}" data-go="#/day/${x.id}">${DOW[x.dow].slice(0, 3)} · ${esc(x.title)}</button>`).join('');

  return `
    ${topbar(fmtDateLong(d), `#/cal/${d.slice(0, 7)}`)}
    <section class="card">
      <h3>🏋️ Entreno ${L.cardio ? '<span class="pill ok">cardio ✓</span>' : ''}</h3>
      ${train}
      ${editable ? `<details class="edit-day"><summary>✎ Cargar o editar entreno de este día</summary><div class="btns">${dayLinks}</div></details>` : ''}
    </section>
    <section class="card">
      <h3>🍽️ Alimentación</h3>
      ${food}
      ${editable && plan() ? `<button class="btn small" data-action="edit-date" data-date="${d}" data-go="#/food">✎ Cargar o editar comidas</button>` : ''}
    </section>
    ${state.body[d] ? `<section class="card"><h3>⚖️ Peso corporal</h3><p>${num(state.body[d])} kg</p></section>` : ''}`;
}

// Estadísticas de los últimos 7 días (incluye hoy).
export function weekStats() {
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, k) => addDays(today, -k));
  const logged = days.map(d => state.logs[d]).filter(Boolean);
  const scores = days.map(foodScore).filter(s => s != null);
  const water = days.map(d => waterMl(d)).filter(w => w > 0);
  const sleep = logged.map(L => L.food?.sleep).filter(s => s != null);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    trained: days.filter(trainedOn).length,
    planned: days.filter(d => plannedDay(d)).length,
    cardio: logged.filter(L => L.cardio).length,
    food: scores.length ? Math.round(avg(scores) * 100) : null,
    water: avg(water),
    sleep: avg(sleep),
  };
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action="edit-date"]');
  if (!btn) return;
  setActiveDate(btn.dataset.date);
  if (location.hash === btn.dataset.go) ui.render();
  else location.hash = btn.dataset.go;
});
