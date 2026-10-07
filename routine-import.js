// Importar una rutina desde un archivo (PDF, Word, texto, JSON) o texto pegado (por ejemplo, de WhatsApp).
// Un lector propio entiende el formato habitual de los entrenadores; si no alcanza, la IA del usuario
// la reescribe en un formato simple que el lector sí entiende.
//   #/rimport                 → elegir archivo / pegar texto / enviar a mi IA
//   #/rimport/review          → revisar días y ejercicios antes de guardar
//   #/rimport/pick/<d>/<i>    → elegir de la biblioteca el ejercicio correcto
import { state, save, ui, esc, topbar, DOW, todayStr, normalizeRoutine } from './store.js';
import { EXERCISES, allExercises, findExercise, fromLibrary, normExercise, searchExercises } from './exercises.js';
import { fileToText, DOC_ACCEPT } from './doctext.js';
import { sendToAi, aiButtons, openAiSite, watchClipboard, readClipboard } from './ai-share.js';
import { isRoutineFile, activate } from './routines.js';
import { prescription } from './routine-editor.js';

let text = '';        // texto de la rutina (leído o pegado)
let info = '';        // aviso sobre la lectura
let draft = null;     // { name, mode, rules…, days: [{ title, dow, items: [{ raw, ex, match: 'sure'|'approx'|'new', libId }] }] }
let showSites = false;
let pickQ = '';

// ---------- Lector de texto ----------

const DOWS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
const RANGE = '(\\d+)(?:\\s*(?:-|–|a)\\s*(\\d+))?';
const SETS_RE = new RegExp(`${RANGE}\\s*[x×]\\s*${RANGE}\\s*(s\\b|seg\\w*|''|"|min\\w*|reps?\\b)?(\\s*(?:\\/|por)\\s*lado)?`, 'i');
const SERIES_RE = new RegExp(`${RANGE}\\s*series?\\s*(?:de|x)\\s*${RANGE}\\s*(s\\b|seg\\w*|min\\w*|reps?|repeticiones)?(\\s*(?:\\/|por)\\s*lado)?`, 'i');
const MIN_RE = new RegExp(`${RANGE}\\s*min(?:utos)?\\b`, 'i');
const RULES = [
  [/^(calentamiento|entrada en calor)/i, 'warmup'], [/^cardio/i, 'cardio'], [/^(doble progresi|progresi)/i, 'progression'],
  [/^(deload|descarga)/i, 'deload'], [/^(seguridad|cuidados?|lesi|precauci|importante)/i, 'safety'], [/^objetivo/i, 'goal'],
];

const strip = s => s.replace(/[*_`~#>|]/g, '').replace(/\s+/g, ' ').trim();
const plain = s => normExercise(s).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

function setsOf(line) {
  const m = line.match(SETS_RE) || line.match(SERIES_RE);
  if (!m) return null;
  const unit = (m[5] || '').toLowerCase();
  return {
    index: m.index, length: m[0].length,
    setsMin: +m[1], setsMax: +(m[2] || m[1]), repMin: +m[3], repMax: +(m[4] || m[3]),
    type: /^min/.test(unit) ? 'min' : /^(s|seg|''|")/.test(unit) ? 'time' : null,
    perSide: !!m[6],
  };
}

function dayHeader(line) {
  if (setsOf(line)) return null;
  const p = plain(line);
  const first = p.split(' ')[0];
  if (first in DOWS) {
    const title = strip(line).replace(/^[^\s—–:-]+\s*[—–:-]?\s*/, '').trim();
    return { dow: DOWS[first], title: title || DOW[DOWS[first]] };
  }
  if (/^(dia|day|sesion|entreno|entrenamiento|workout|rutina [a-z])\s*\w/.test(p) && p.length < 50) {
    const parts = strip(line).split(/\s*[—–:]\s*|\s+-\s+/).filter(Boolean);
    const title = (parts.length > 1 ? parts.slice(1).join(' — ') : parts[0]).trim();
    // "DÍA: Lunes — Empuje" → lunes
    const d = plain(title).split(' ')[0];
    if (d in DOWS) {
      const rest = title.replace(/^[^\s—–:-]+\s*[—–:-]?\s*/, '').trim();
      return { dow: DOWS[d], title: rest || DOW[DOWS[d]] };
    }
    return { dow: null, title };
  }
  if (/^(push|pull|legs|empuje|tiron|piernas?|torso|full ?body|upper|lower|tren (superior|inferior))\b/.test(p) && p.length < 40) {
    return { dow: null, title: strip(line).replace(/:$/, '') };
  }
  const s = strip(line);
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  if (letters.length >= 3 && s.length <= 40 && letters === letters.toUpperCase() && !/rutina|plan|programa/i.test(s)) {
    return { dow: null, title: s.replace(/:$/, '') };
  }
  return null;
}

function parseExercise(raw, section) {
  const s = setsOf(raw);
  let name, after = '', rx;
  if (s) {
    name = raw.slice(0, s.index);
    after = raw.slice(s.index + s.length);
    rx = s;
  } else {
    const m = raw.match(MIN_RE);
    if (!m) return null;
    name = raw.replace(m[0], ' ');
    rx = { setsMin: 1, setsMax: 1, repMin: +m[1], repMax: +(m[2] || m[1]), type: 'min', perSide: false };
  }
  name = name.replace(/^\s*(\d+\s*[.)-]|[-•·*●▪◦]|[a-z]\s*[.)])\s*/i, '').replace(/[\s—–:,-]+$/, '').trim();
  if (!name || name.length < 2) return null;
  const heavy = /pesad|heavy/i.test(after);
  const note = after.replace(/\bpesad[oa]s?\b|\bheavy\b/gi, '').replace(/^[\s,.;—–-]+|[\s,.;—–-]+$/g, '').trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), section, ...rx, heavy, note: note.length > 1 ? note : '' };
}

export function parseRoutineText(input) {
  const lines = String(input || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = { name: '', goal: '', warmup: '', cardio: '', progression: '', deload: '', safety: '', deloadWeeks: null, days: [] };
  let day = null;
  let usesHeavy = false;
  for (const line of lines) {
    const s = strip(line);
    const p = plain(s);
    // Reglas: "Calentamiento: …", "Cardio (todos los días): …"
    const rule = RULES.find(([re]) => re.test(p));
    if (rule && !setsOf(s.split(':')[0] || '')) {
      const value = s.includes(':') ? s.slice(s.indexOf(':') + 1).trim() : s;
      out[rule[1]] = out[rule[1]] ? `${out[rule[1]]} ${value}` : value;
      if (rule[1] === 'deload') { const w = value.match(/cada\s*(\d+)/i); if (w) out.deloadWeeks = +w[1]; }
      continue;
    }
    // Nombre de la rutina
    if (!out.name && !out.days.length && /rutina|plan|programa|mes \d|mesociclo/i.test(s) && !setsOf(s)) {
      out.name = s.replace(/^rutina\s*[:—–-]?\s*/i, s.match(/^rutina\s*[:—–-]\s*/i) ? '' : 'Rutina ').replace(/\s+/g, ' ').trim();
      continue;
    }
    const h = dayHeader(s);
    if (h) {
      day = { title: h.title, dow: h.dow, items: [] };
      out.days.push(day);
      continue;
    }
    // Ejercicios (una línea puede traer varios: "Core: plancha 3x30-45s + elevación de piernas 3x10-15")
    let section = 'main';
    let body = s;
    const pre = body.match(/^(core|abdominales?|abs|extra|accesorios?|finisher|cardio)\s*:\s*/i);
    if (pre) { section = /extra|acces|finisher|cardio/i.test(pre[1]) ? 'extra' : 'core'; body = body.slice(pre[0].length); }
    const parts = body.split(/\s+\+\s+/);
    const items = (parts.length > 1 && parts.every(x => setsOf(x) || MIN_RE.test(x)) ? parts : [body]).map(x => parseExercise(x, section)).filter(Boolean);
    if (!items.length) continue;
    if (items.some(i => i.heavy)) usesHeavy = true;
    if (!day) { day = { title: 'Día A', dow: null, items: [] }; out.days.push(day); }
    day.items.push(...items);
  }
  out.days = out.days.filter(d => d.items.length);
  out.usesHeavy = usesHeavy;
  // "RUTINA MATHIAS — MES 2" → "Rutina Mathias — Mes 2"
  if (/[A-ZÁÉÍÓÚÑ]{4,}/.test(out.name)) out.name = out.name.toLowerCase().replace(/(^|[\s—–(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return out;
}

// ---------- Ejercicio de la biblioteca que corresponde a un nombre ----------

const STOP = new Set(['de', 'del', 'al', 'con', 'en', 'la', 'el', 'los', 'las', 'y', 'o', 'a', 'para', 'por', 'sin', 'un', 'una']);
const ABBR = { elev: 'elevacion', elevac: 'elevacion', ext: 'extension', ab: 'abdominales', abd: 'abdominales', maq: 'maquina', mancu: 'mancuernas', polea: 'polea', isquio: 'isquios', cuad: 'cuadriceps' };
const words = s => plain(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(w => ABBR[w] || w.replace(/es$|s$/, m => m === 'es' && w.length > 5 ? '' : m === 's' && w.length > 4 ? '' : m));
const has = (terms, w) => terms.includes(w);

// { id, sure } o null. "sure" cuando coinciden todas las palabras principales (sin lo que está entre paréntesis)
// y no hay empate con otro ejercicio.
export function matchExercise(name) {
  const core = words(name.replace(/\(.*?\)/g, ' '));
  const extra = words((name.match(/\((.*?)\)/g) || []).join(' '));
  if (!core.length) return null;
  let best = [], bestScore = 0;
  for (const x of allExercises()) {
    const hit = core.filter(w => has(x.terms, w)).length;
    if (!hit) continue;
    const bonus = extra.filter(w => has(x.terms, w)).length * 0.1;
    const leftover = words(x.name).filter(w => !core.includes(w) && !extra.includes(w)).length * 0.01;
    const score = hit / core.length + bonus - leftover;
    if (score > bestScore + 1e-9) { best = [x]; bestScore = score; }
    else if (Math.abs(score - bestScore) < 1e-9) best.push(x);
  }
  if (!best.length || bestScore < 0.5) return null;
  const x = best[0];
  const full = core.every(w => has(x.terms, w));
  // Seguro si: el nombre coincide exacto (sin palabras de más), o es el único que coincide entero
  // (contando lo que está entre paréntesis para desempatar).
  // Nombre exacto: todas sus palabras (incluso las de una letra, como la "T" de "Remo en T") están en el texto
  const exactOf = y => plain(y.name.replace(/\(.*?\)/g, ' ')).split(' ').filter(w => w && !STOP.has(w)).map(w => ABBR[w] || w)
    .every(w => core.includes(w) || core.some(c => c.startsWith(w) || w.startsWith(c)));
  const bonusOf = y => extra.filter(w => has(y.terms, w)).length;
  const rivals = allExercises().filter(y => y !== x && core.every(w => has(y.terms, w)) && bonusOf(y) >= bonusOf(x));
  return { id: x.id, sure: full && (!rivals.length || (exactOf(x) && !rivals.some(exactOf))) };
}

// ---------- Armar el borrador ----------

function buildDraft(parsed) {
  return {
    name: parsed.name || 'Rutina importada', goal: parsed.goal, warmup: parsed.warmup, cardio: parsed.cardio,
    progression: parsed.progression, deload: parsed.deload, safety: parsed.safety, deloadWeeks: parsed.deloadWeeks || 6,
    mode: parsed.days.length && parsed.days.every(d => d.dow != null) ? 'week' : 'rotation',
    usesHeavy: parsed.usesHeavy,
    days: parsed.days.map(d => ({
      title: d.title, dow: d.dow,
      items: d.items.map(raw => {
        const m = matchExercise(raw.name);
        return { raw, libId: m?.id || null, match: m ? (m.sure ? 'sure' : 'approx') : 'new' };
      }),
    })),
  };
}

// Lee JSON en varias formas: archivo de rutina de Temple, una rutina suelta, un backup, o el formato de la IA.
function draftFromJson(data) {
  if (isRoutineFile(data)) return { routine: data.routine, customExercises: data.customExercises || [] };
  const r = data?.routine?.days ? data.routine : Array.isArray(data?.days) ? data : null;
  if (!r) return null;
  // ¿Tiene ya el formato de Temple (ejercicios con setsMin, etc.)?
  if (r.days.every(d => Array.isArray(d.exercises) && d.exercises.every(e => e.setsMin))) {
    return { routine: r, customExercises: data.customExercises || state.exLib?.filter(x => r.days.some(d => d.exercises.some(e => e.key === x.id))) || [] };
  }
  // Formato libre: lo paso a texto para el lector
  const lines = [r.name || r.title || data.name || ''];
  for (const d of r.days) {
    lines.push(`DÍA: ${d.title || d.name || d.day || 'Día'}`);
    for (const e of d.exercises || d.ejercicios || []) {
      if (typeof e === 'string') { lines.push(e); continue; }
      const sets = e.sets || e.series || 3, reps = e.reps || e.repeticiones || '10';
      lines.push(`${e.name || e.nombre || e.exercise} — ${sets}x${reps}${e.note || e.notes ? ` ${e.note || e.notes}` : ''}`);
    }
  }
  return { text: lines.join('\n') };
}

function loadText(t) {
  const trimmed = t.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    try {
      const j = JSON.parse(trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1));
      const r = draftFromJson(j);
      if (r?.routine) { saveRoutine(normalizeRoutine(structuredClone(r.routine)), r.customExercises); return 'saved'; }
      if (r?.text) t = r.text;
    } catch {}
  }
  const parsed = parseRoutineText(t);
  if (!parsed.days.length) throw new Error('No encontré ejercicios con series y repeticiones (por ejemplo "Press banca — 4x8-10"). Probá con "Enviar a mi IA".');
  draft = buildDraft(parsed);
  return 'review';
}

// ---------- Guardar ----------

function saveRoutine(r, customExercises = [], { use } = {}) {
  const mine = new Set((state.exLib || []).map(x => x.id));
  state.exLib = [...(state.exLib || []), ...customExercises.filter(x => x?.id && !mine.has(x.id))];
  const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  r.id = uid('r');
  r.createdAt = todayStr();
  for (const d of r.days) d.id = uid('d');
  const useNow = use ?? confirm(`Importé "${r.name}" (${r.days.length} días). ¿Usarla ahora como tu rutina activa?\n\nSi elegís Cancelar, queda guardada en Archivadas.`);
  if (useNow) activate(r);
  else { r.archivedAt = todayStr(); state.routineArchive = [r, ...(state.routineArchive || [])]; save(); }
  location.hash = useNow ? '#/routine' : '#/routines';
}

function draftToRoutine(use) {
  const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const custom = [];
  const days = draft.days.map(d => ({
    title: d.title, dow: draft.mode === 'week' ? d.dow : null,
    exercises: d.items.map(({ raw, libId, match }) => {
      let x = libId && match !== 'new' ? findExercise(libId) : null;
      if (!x) {
        // Ejercicio nuevo: queda en la biblioteca del usuario
        x = custom.find(c => c.name === raw.name) || {
          id: uid('cx-'), name: raw.name, muscle: raw.section === 'core' ? 'core' : '', equip: 'otro', type: raw.type || 'weight', heavy: false, custom: true,
          setsMin: raw.setsMin, setsMax: raw.setsMax, repMin: raw.repMin, repMax: raw.repMax, rest: 90, terms: normExercise(raw.name),
        };
        if (!custom.includes(x)) custom.push(x);
      }
      const e = fromLibrary(x);
      return {
        ...e, name: raw.name, section: raw.section !== 'main' ? raw.section : e.section,
        setsMin: raw.setsMin, setsMax: raw.setsMax, repMin: raw.repMin, repMax: raw.repMax,
        type: raw.type || (x.type === 'min' || x.type === 'time' ? 'weight' : x.type), perSide: raw.perSide,
        heavy: draft.usesHeavy ? raw.heavy : e.heavy, note: raw.note,
      };
    }),
  }));
  for (const d of days) for (const e of d.exercises) if (e.type === 'weight' && findExercise(e.key)?.type === 'reps') e.type = 'reps';
  const r = normalizeRoutine({
    name: draft.name, mode: draft.mode, goal: draft.goal, warmup: draft.warmup, cardio: draft.cardio,
    progression: draft.progression || 'Doble progresión: subís reps dentro del rango; cuando tocás el techo en todas las series, subís peso.',
    deload: draft.deload, safety: draft.safety, deloadWeeks: draft.deloadWeeks, days,
  });
  saveRoutine(r, custom, { use });
  draft = null; text = ''; info = '';
}

// ---------- Pedido para la IA (devuelve texto en el formato que entiende el lector) ----------

function aiPrompt() {
  return `Reescribí esta rutina de gimnasio en este formato de texto exacto, sin explicaciones:

RUTINA: nombre de la rutina
DÍA: Lunes — Empuje
1. Press banca plano — 4x8-10 pesado
2. Elevaciones laterales — 3x12-15
Core: Plancha — 3x30-45s
DÍA: Martes — Tirón
1. Jalón al pecho — 4x8-10
Calentamiento: …
Cardio: …
Progresión: …

Reglas:
- Una línea "DÍA:" por día. Si la rutina dice el día de la semana, ponelo (Lunes, Martes…); si no, usá "Día A", "Día B"…
- Cada ejercicio en una línea con "series x repeticiones" (por ejemplo 4x8-10). Si es por tiempo: 3x30-45s. Cardio: 20 min.
- Agregá "pesado" si la rutina lo marca, "/lado" si es por lado, y las notas al final de la línea.
- No inventes ejercicios ni cambies las series o repeticiones.

Esta es la rutina:
"""
${text || '(Te la adjunto como archivo)'}
"""`;
}

const looksLikeRoutine = t => /\d\s*[x×]\s*\d/.test(t) && /(d[ií]a|lunes|martes|rutina|push|pull)/i.test(t);

// ---------- Vistas ----------

export function viewRoutineImport() {
  return `
    ${topbar('Importar rutina', state.routine.days.length ? '#/routines' : '#/')}
    <section class="card step">
      <h3><span class="step-n">1</span> Tu rutina</h3>
      <label class="btn block">📄 Elegir archivo (PDF, Word, texto)<input type="file" accept="${DOC_ACCEPT}" data-action="rimport-file" hidden></label>
      ${info ? `<p class="small ${/✓/.test(info) ? 'ok-text' : 'warn-text'}">${esc(info)}</p>` : ''}
      <p class="muted small">o pegá el texto (por ejemplo, el mensaje de WhatsApp de tu entrenador):</p>
      <textarea data-field="rimport-text" rows="8" placeholder="LUNES — Empuje&#10;1. Press banca — 4x8-10&#10;2. Elevaciones laterales — 3x12-15">${esc(text)}</textarea>
      <button class="btn primary block" data-action="rimport-read">Leer la rutina ›</button>
    </section>
    <section class="card step">
      <h3><span class="step-n">2</span> ¿No la leyó bien?</h3>
      <p class="muted small">Si es un PDF escaneado, una foto o un formato raro, pedile a tu IA que la ordene. Al volver, Temple toma la respuesta sola.</p>
      <button class="btn block" data-action="rimport-ai">✨ Enviar a mi IA</button>
      ${showSites ? `<p class="muted small">El pedido quedó copiado. Elegí tu IA y pegalo:</p><div class="btns">${aiButtons('rimport-site')}</div>` : ''}
    </section>
    <p class="muted small">También sirve un archivo .json exportado desde Temple. Todo se lee en tu teléfono.</p>`;
}

export function viewRoutineReview() {
  if (!draft) return viewRoutineImport();
  const n = draft.days.reduce((a, d) => a + d.items.length, 0);
  const count = k => draft.days.reduce((a, d) => a + d.items.filter(i => i.match === k).length, 0);
  const icon = { sure: '✓', approx: '≈', new: '＋' };
  const dowOpts = sel => [`<option value="">Sin día fijo</option>`, ...[1, 2, 3, 4, 5, 6, 0].map(k => `<option value="${k}" ${sel === k ? 'selected' : ''}>${DOW[k]}</option>`)].join('');
  return `
    ${topbar('Revisar rutina', '#/rimport')}
    <section class="card form">
      <label>Nombre<input data-field="rr-name" value="${esc(draft.name)}"></label>
      <div class="seg">
        <button type="button" class="seg-btn ${draft.mode === 'week' ? 'on' : ''}" data-action="rr-mode" data-v="week">Semana fija</button>
        <button type="button" class="seg-btn ${draft.mode === 'rotation' ? 'on' : ''}" data-action="rr-mode" data-v="rotation">Rotación</button>
      </div>
      <small>${draft.days.length} días · ${n} ejercicios · ${count('sure')} reconocidos ✓${count('approx') ? ` · ${count('approx')} para verificar ≈` : ''}${count('new') ? ` · ${count('new')} nuevos ＋` : ''}</small>
    </section>
    ${draft.days.map((d, di) => `
      <section class="card">
        <div class="rr-day">
          <input data-field="rr-title" data-d="${di}" value="${esc(d.title)}" aria-label="Nombre del día">
          ${draft.mode === 'week' ? `<select data-action="rr-dow" data-d="${di}">${dowOpts(d.dow)}</select>` : ''}
        </div>
        ${d.items.map((it, ii) => `
          <a class="rr-ex ${it.match}" href="#/rimport/pick/${di}/${ii}">
            <span class="rr-icon">${icon[it.match]}</span>
            <span class="grow"><b>${esc(it.raw.name)}</b>
              <small>${prescription(it.raw)}${it.raw.heavy ? ' · pesado' : ''}${it.raw.section !== 'main' ? ` · ${it.raw.section === 'core' ? 'core' : 'extra'}` : ''}
              · ${it.match === 'new' ? 'ejercicio nuevo (propio)' : `${it.match === 'approx' ? 'verificá: ' : '= '}${esc(findExercise(it.libId)?.name || '')}`}</small></span>
            <span class="chev">›</span></a>`).join('')}
      </section>`).join('')}
    ${['warmup', 'cardio', 'progression', 'deload', 'safety'].some(k => draft[k]) ? `<details class="card"><summary>Reglas detectadas</summary><dl class="small">
      ${[['warmup', 'Calentamiento'], ['cardio', 'Cardio'], ['progression', 'Progresión'], ['deload', 'Deload'], ['safety', 'Cuidados']].filter(([k]) => draft[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(draft[k])}</dd>`).join('')}
    </dl></details>` : ''}
    <button class="btn primary block big" data-action="rr-save" data-use="1">Usar esta rutina</button>
    <button class="btn block" data-action="rr-save" data-use="0">Guardar en archivadas</button>
    <p class="muted small">✓ = reconocido en la biblioteca (comparte historial) · ≈ = verificá que sea ese · ＋ = se crea como ejercicio propio. Tocá cualquiera para cambiarlo.</p>`;
}

export function viewRoutinePick(di, ii) {
  const it = draft?.days[di]?.items[ii];
  if (!it) return viewRoutineReview();
  const q = pickQ || it.raw.name.replace(/\(.*?\)/g, '');
  const list = searchExercises('').filter(x => words(q).some(w => x.terms.includes(w)))
    .sort((a, b) => words(q).filter(w => b.terms.includes(w)).length - words(q).filter(w => a.terms.includes(w)).length).slice(0, 25);
  return `
    ${topbar('¿Qué ejercicio es?', '#/rimport/review')}
    <p class="note">En la rutina dice: <b>${esc(it.raw.name)}</b> · ${prescription(it.raw)}</p>
    <div class="search-box"><input type="search" data-field="rr-q" value="${esc(q)}" placeholder="Buscar en la biblioteca…" autocomplete="off"></div>
    <div class="list">
      <button class="row lib-row ${it.match === 'new' ? 'picked' : ''}" data-action="rr-pick" data-d="${di}" data-i="${ii}" data-id="">
        <span class="grow"><b>＋ Ejercicio nuevo (propio)</b><small>Se crea "${esc(it.raw.name)}" en tu biblioteca</small></span></button>
      ${list.map(x => `<button class="row lib-row ${x.id === it.libId && it.match !== 'new' ? 'picked' : ''}" data-action="rr-pick" data-d="${di}" data-i="${ii}" data-id="${esc(x.id)}">
        <span class="grow"><b>${esc(x.name)}</b><small>${prescription(x)}</small></span>${x.id === it.libId && it.match !== 'new' ? '<span class="tag">elegido</span>' : ''}</button>`).join('')}
    </div>`;
}

// ---------- Eventos ----------

async function readFile(file) {
  info = 'Leyendo…';
  ui.render({ keep: true });
  try {
    const r = await fileToText(file);
    if (r.kind === 'json') {
      text = r.text;
      info = '✓ Archivo .json leído.';
    } else if (r.text.trim().length < 20) {
      text = '';
      info = 'Este archivo no tiene texto para leer (¿PDF escaneado o foto?). Usá "Enviar a mi IA" y adjuntá el archivo en tu IA.';
    } else {
      text = r.text;
      info = `✓ Leí el archivo${r.pages ? ` (${r.pages} página${r.pages === 1 ? '' : 's'})` : ''}. Revisá el texto y tocá "Leer la rutina".`;
    }
  } catch (err) {
    info = err.message;
  }
  ui.render({ keep: true });
}

function read() {
  try {
    const res = loadText(text);
    if (res === 'review') { pickQ = ''; location.hash = '#/rimport/review'; }
  } catch (err) { alert(err.message); }
}

document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset?.field === 'rimport-text') text = t.value;
  else if (t.dataset?.field === 'rr-q') {
    pickQ = t.value;
    const [, , , di, ii] = location.hash.split('/');
    const pos = t.selectionStart;
    ui.render({ keep: true });
    const inp = document.querySelector('[data-field="rr-q"]');
    if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
  }
});

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset?.action === 'rimport-file' && t.files?.[0]) { readFile(t.files[0]); return; }
  if (!draft) return;
  if (t.dataset?.field === 'rr-name') draft.name = t.value.trim() || draft.name;
  else if (t.dataset?.field === 'rr-title') draft.days[+t.dataset.d].title = t.value.trim() || draft.days[+t.dataset.d].title;
  else if (t.dataset?.action === 'rr-dow') draft.days[+t.dataset.d].dow = t.value === '' ? null : +t.value;
});

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
  const a = btn.dataset.action;
  if (a === 'rimport-read') read();
  else if (a === 'rimport-ai') {
    watchClipboard(looksLikeRoutine, t => { text = t; info = '✓ Tomé la respuesta de tu IA del portapapeles.'; read(); });
    const r = await sendToAi(aiPrompt());
    showSites = r === 'choose';
    if (showSites) { try { await navigator.clipboard.writeText(aiPrompt()); } catch {} }
    ui.render({ keep: true });
  } else if (a === 'rimport-site') {
    openAiSite(btn.dataset.url, aiPrompt());
  } else if (a === 'rr-mode' && draft) {
    draft.mode = btn.dataset.v;
    ui.render({ keep: true });
  } else if (a === 'rr-pick' && draft) {
    const it = draft.days[+btn.dataset.d].items[+btn.dataset.i];
    if (btn.dataset.id) Object.assign(it, { libId: btn.dataset.id, match: 'sure' });
    else Object.assign(it, { match: 'new' });
    pickQ = '';
    location.hash = '#/rimport/review';
  } else if (a === 'rr-save' && draft) {
    draftToRoutine(btn.dataset.use === '1');
  }
});

export { readClipboard };
