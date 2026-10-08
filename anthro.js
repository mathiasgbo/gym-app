// Antropometría: importar informes PDF y comparar mediciones.
// El PDF se lee en el teléfono (pdf.js en /lib); solo se guardan los números.
import { state, save, ui, esc, num, fmtDate, topbar, chart } from './store.js';
import { FIELDS, MASSES, DERIVED, parseReport, derived, pdfPages } from './anthro-parse.js';

export const measures = () => [...(state.anthro || [])].sort((a, b) => a.date.localeCompare(b.date));

// ---------- Métricas comparables ----------

const fromField = f => ({ id: f.key, name: f.name, unit: f.unit, better: f.better, get: r => r.values[f.key] });
const fromMass = m => ({ id: m.key, name: m.name, unit: 'kg', better: m.better, digits: 2, get: r => r.masses[m.key]?.kg, sub: r => r.masses[m.key]?.pct });
const fromDerived = d => ({ id: d.key, name: d.name, unit: d.unit, better: d.better, digits: d.digits, get: r => derived(r)[d.key] });
const somato = (k, name, better) => ({ id: k, name, unit: '', better, digits: 1, get: r => r.somato?.[k] });

const M = Object.fromEntries([
  ...FIELDS.map(fromField), ...MASSES.map(fromMass), ...DERIVED.map(fromDerived),
].map(m => [m.id, m]));

const SUMMARY = ['peso', 'muscular', 'adiposa', 'sum6', 'cintura', 'brazo_flex', 'muslo_sup'];
const SECTIONS = [
  ['Masas corporales (kg · %)', MASSES.map(fromMass)],
  ['Perímetros (cm)', FIELDS.filter(f => f.section === 'perimetros').map(fromField)],
  ['Pliegues (mm)', [...FIELDS.filter(f => f.section === 'pliegues').map(fromField), M.sum6]],
  ['Índices', DERIVED.map(fromDerived)],
  ['Somatotipo', [somato('endo', 'Endomorfia (adiposidad)', 'down'), somato('meso', 'Mesomorfia (músculo-esqueleto)', 'up'), somato('ecto', 'Ectomorfia (linealidad)')]],
  ['Básicos y diámetros (cm)', FIELDS.filter(f => f.section === 'basicos' || f.section === 'diametros').map(fromField)],
];

const fmt = (m, v) => v == null ? '—' : num(Math.round(v * 10 ** (m.digits ?? 1)) / 10 ** (m.digits ?? 1));

function diffCell(m, a, b) {
  const va = m.get(a), vb = m.get(b);
  if (va == null || vb == null) return '<td class="dif">—</td>';
  const d = vb - va;
  const eps = 0.5 * 10 ** -(m.digits ?? 1);
  if (Math.abs(d) < eps) return '<td class="dif same">=</td>';
  const cls = !m.better ? '' : (d > 0) === (m.better === 'up') ? 'good' : 'bad';
  return `<td class="dif ${cls}">${d > 0 ? '+' : '−'}${fmt(m, Math.abs(d))}</td>`;
}

function row(m, a, b) {
  const cell = r => `<td>${fmt(m, m.get(r))}${m.sub && m.sub(r) != null ? `<small>${num(m.sub(r))}%</small>` : ''}</td>`;
  return `<tr><th>${esc(m.name)}${m.unit && !['kg', 'cm', 'mm'].includes(m.unit) ? ` <small class="inline">${esc(m.unit)}</small>` : ''}</th>
    ${a ? cell(a) : ''}${cell(b)}${a ? diffCell(m, a, b) : ''}</tr>`;
}

function table(metrics, a, b) {
  return `<table class="cmp">
    <thead><tr><th></th>${a ? `<th>${fmtDate(a.date)}</th>` : ''}<th>${fmtDate(b.date)}</th>${a ? '<th>Dif.</th>' : ''}</tr></thead>
    <tbody>${metrics.map(m => row(m, a, b)).join('')}</tbody></table>`;
}

function insight(a, b) {
  const sign = (v, unit) => `${v >= 0 ? '+' : '−'}${num(Math.round(Math.abs(v) * 10) / 10)} ${unit}`;
  const dm = b.masses.muscular.kg - a.masses.muscular.kg;
  const da = b.masses.adiposa.kg - a.masses.adiposa.kg;
  const dp = b.values.peso - a.values.peso;
  const good = dm > 0 && da <= 0;
  return `<p class="insight ${good ? 'good' : ''}">Entre el ${fmtDate(a.date)} y el ${fmtDate(b.date)}: peso <b>${sign(dp, 'kg')}</b>,
    músculo <b>${sign(dm, 'kg')}</b> y grasa <b>${sign(da, 'kg')}</b>.${good ? ' 💪 Ganaste músculo sin sumar grasa.' : ''}</p>`;
}

const importBtn = (label = '📄 Importar informe PDF') =>
  `<label class="btn small">${label}<input type="file" accept="application/pdf,.pdf" multiple data-action="anthro-file" hidden></label>`;

// ---------- Vistas ----------

// Tarjeta para la pantalla de Progreso.
export function anthroCard() {
  const ms = measures();
  if (!ms.length) return `
    <section class="card">
      <h3>📏 Antropometría</h3>
      <p class="muted small">Importá los informes de composición corporal (PDF) para ver tu evolución de músculo, grasa y medidas.
        El PDF se lee en el teléfono y no se sube a ningún lado.</p>
      <div class="btns">${importBtn()}</div>
    </section>`;
  const b = ms.at(-1), a = ms.at(-2);
  return `
    <section class="card">
      <h3>📏 Antropometría <small class="inline">${ms.length} ${ms.length === 1 ? 'medición' : 'mediciones'}</small></h3>
      ${a ? insight(a, b) : ''}
      ${table(SUMMARY.map(k => M[k]), a, b)}
      <div class="btns"><a class="btn small" href="#/body">Ver todo y comparar ›</a>${importBtn('📄 Importar')}</div>
    </section>`;
}

let pick = { a: null, b: null }; // fechas elegidas para comparar

export function viewBody() {
  const ms = measures();
  if (!ms.length) return `${topbar('Antropometría', '#/hist')}${anthroCard()}`;
  const byDate = d => ms.find(m => m.date === d);
  const b = byDate(pick.b) || ms.at(-1);
  const a = ms.length > 1 ? (byDate(pick.a) && pick.a !== b.date ? byDate(pick.a) : ms.filter(m => m.date !== b.date).at(-1)) : null;
  const opts = sel => ms.map(m => `<option value="${m.date}" ${m.date === sel?.date ? 'selected' : ''}>${fmtDate(m.date)}</option>`).join('');
  const series = (get, title) => {
    const pts = ms.map(m => ({ y: get(m) })).filter(p => p.y != null);
    return pts.length > 1 ? `<div class="mini"><small class="muted">${title}</small>${chart(pts)}</div>` : '';
  };

  return `
    ${topbar('Antropometría', '#/hist')}
    ${a ? `<section class="card">
      <div class="grid2">
        <label class="stack">Desde<select data-action="anthro-pick" data-which="a">${opts(a)}</select></label>
        <label class="stack">Hasta<select data-action="anthro-pick" data-which="b">${opts(b)}</select></label>
      </div>
      ${insight(a, b)}
    </section>` : ''}
    ${ms.length > 1 ? `<section class="card charts">
      ${series(m => m.masses.muscular?.kg, 'Masa muscular (kg)')}
      ${series(m => m.masses.adiposa?.kg, 'Masa adiposa (kg)')}
      ${series(m => derived(m).sum6, 'Suma de 6 pliegues (mm)')}
    </section>` : ''}
    ${SECTIONS.map(([title, metrics]) => `
      <details class="card" data-keep="anthro-${esc(title)}" ${title.startsWith('Masas') || title.startsWith('Perím') ? 'open' : ''}>
        <summary>${esc(title)}</summary>${table(metrics, a, b)}
      </details>`).join('')}
    <section class="card">
      <h3>Mediciones</h3>
      <div class="list">${[...ms].reverse().map(m => `<div class="row"><span class="grow"><b>${fmtDate(m.date)}</b>
        <small>${m.number ? `Medición n.º ${m.number} · ` : ''}${num(m.values.peso)} kg · músculo ${num(m.masses.muscular.pct)}% · grasa ${num(m.masses.adiposa.pct)}%</small></span>
        <button class="btn small ghost danger" data-action="anthro-del" data-date="${m.date}" aria-label="Borrar medición">✕</button></div>`).join('')}</div>
      <div class="btns">${importBtn()}</div>
      <p class="muted small">Los colores indican si el cambio va a favor (verde) o en contra (rojo) de ganar músculo y bajar grasa. La interpretación fina la hace tu nutricionista.</p>
    </section>`;
}

// ---------- Importación ----------

async function readPdf(file) {
  const pdfjs = await import('./lib/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return parseReport(await pdfPages(doc));
}

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.action === 'anthro-pick') {
    pick[t.dataset.which] = t.value;
    ui.render({ keep: true });
    return;
  }
  if (t.dataset.action !== 'anthro-file' || !t.files.length) return;
  const files = [...t.files];
  const found = [], errors = [];
  for (const f of files) {
    try { found.push(await readPdf(f)); } catch (err) {
      errors.push(`${f.name}: ${/fetch|import|module/i.test(err.message) ? `no se pudo cargar el lector de PDF (${err.message})` : err.message}`);
    }
  }
  if (errors.length) alert('Algunos archivos no se pudieron leer:\n' + errors.join('\n'));
  if (!found.length) return;
  const list = found.map(r => `• ${fmtDate(r.date)}: ${num(r.values.peso)} kg, músculo ${num(r.masses.muscular.kg)} kg, grasa ${num(r.masses.adiposa.kg)} kg`).join('\n');
  if (!confirm(`Encontré ${found.length === 1 ? 'esta medición' : 'estas mediciones'}:\n${list}\n\n¿Guardar?`)) return;
  state.anthro ??= [];
  for (const r of found) {
    state.anthro = state.anthro.filter(m => m.date !== r.date);
    state.anthro.push(r);
    state.body[r.date] ??= r.values.peso; // suma el peso al gráfico de peso corporal
  }
  pick = { a: null, b: null };
  save();
  ui.render();
});

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action="anthro-del"]');
  if (!btn) return;
  if (!confirm(`¿Borrar la medición del ${fmtDate(btn.dataset.date)}?`)) return;
  state.anthro = state.anthro.filter(m => m.date !== btn.dataset.date);
  save();
  ui.render({ keep: true });
});
