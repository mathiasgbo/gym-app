// Lector del "Informe de Composición Corporal" (antropometría, 5 masas de Kerr).
// Recibe el texto de cada página (una línea por renglón del PDF) y devuelve una medición.
// Sin dependencias del navegador, así se puede probar con node.

// better: 'up' = mejor si sube, 'down' = mejor si baja, null = neutro.
export const FIELDS = [
  { key: 'peso', label: 'Peso (kg)', name: 'Peso', unit: 'kg', section: 'basicos' },
  { key: 'talla', label: 'Talla (cm)', name: 'Talla', unit: 'cm', section: 'basicos' },
  { key: 'talla_sentado', label: 'Talla sentado (cm)', name: 'Talla sentado', unit: 'cm', section: 'basicos' },
  { key: 'biacromial', label: 'Biacromial', name: 'Biacromial', unit: 'cm', section: 'diametros' },
  { key: 'torax_transverso', label: 'Tórax Transverso', name: 'Tórax transverso', unit: 'cm', section: 'diametros' },
  { key: 'torax_ap', label: 'Tórax Anteroposterior', name: 'Tórax anteroposterior', unit: 'cm', section: 'diametros' },
  { key: 'biiliocrestideo', label: 'Bi-iliocrestídeo', name: 'Bi-iliocrestídeo', unit: 'cm', section: 'diametros' },
  { key: 'humeral', label: 'Humeral (biepicondilar)', name: 'Humeral', unit: 'cm', section: 'diametros' },
  { key: 'femoral', label: 'Femoral (biepicondilar)', name: 'Femoral', unit: 'cm', section: 'diametros' },
  { key: 'cabeza', label: 'Cabeza', name: 'Cabeza', unit: 'cm', section: 'perimetros' },
  { key: 'brazo_relajado', label: 'Brazo Relajado', name: 'Brazo relajado', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'brazo_flex', label: 'Brazo Flexionado en Tensión', name: 'Brazo flexionado', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'antebrazo', label: 'Antebrazo', name: 'Antebrazo', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'torax', label: 'Tórax Mesoesternal', name: 'Tórax', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'cintura', label: 'Cintura (mínima)', name: 'Cintura', unit: 'cm', section: 'perimetros', better: 'down' },
  { key: 'caderas', label: 'Caderas (máxima)', name: 'Caderas', unit: 'cm', section: 'perimetros' },
  { key: 'muslo_sup', label: 'Muslo (superior)', name: 'Muslo superior', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'muslo_medial', label: 'Muslo (medial)', name: 'Muslo medial', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'pantorrilla', label: 'Pantorrilla (máxima)', name: 'Pantorrilla', unit: 'cm', section: 'perimetros', better: 'up' },
  { key: 'pl_triceps', label: 'Tríceps', name: 'Tríceps', unit: 'mm', section: 'pliegues', better: 'down' },
  { key: 'pl_subescapular', label: 'Subescapular', name: 'Subescapular', unit: 'mm', section: 'pliegues', better: 'down' },
  { key: 'pl_supraespinal', label: 'Supraespinal', name: 'Supraespinal', unit: 'mm', section: 'pliegues', better: 'down' },
  { key: 'pl_abdominal', label: 'Abdominal', name: 'Abdominal', unit: 'mm', section: 'pliegues', better: 'down' },
  { key: 'pl_muslo', label: 'Muslo (medial)', name: 'Muslo medial', unit: 'mm', section: 'pliegues', better: 'down' },
  { key: 'pl_pantorrilla', label: 'Pantorrilla', name: 'Pantorrilla', unit: 'mm', section: 'pliegues', better: 'down' },
];

export const MASSES = [
  { key: 'adiposa', label: 'Masa Adiposa', name: 'Masa adiposa (grasa)', better: 'down' },
  { key: 'muscular', label: 'Masa Muscular', name: 'Masa muscular', better: 'up' },
  { key: 'residual', label: 'Masa Residual', name: 'Masa residual' },
  { key: 'osea', label: 'Masa Ósea', name: 'Masa ósea' },
  { key: 'piel', label: 'Masa de la Piel', name: 'Masa de la piel' },
];

const NUM = '(-?\\d+(?:[.,]\\d+)?)';
const toNum = s => parseFloat(s.replace(',', '.'));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseReport(pages) {
  const lines = pages.join('\n').split('\n').map(l => l.trim()).filter(Boolean);
  const all = lines.join('\n');
  const out = { values: {}, masses: {} };

  // Fecha de medición (d/m/aaaa) y edad.
  const date = all.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (date) out.date = `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`;
  const age = all.match(/Edad:\s+(\d+(?:,\d+)?)/);
  if (age) out.age = toNum(age[1]);
  const n = all.match(/Edad:\s+\d+(?:,\d+)?\s*\n(\d+)\n/);
  if (n) out.number = Number(n[1]);

  // Tabla de la página 1: los campos aparecen siempre en el mismo orden,
  // así que se buscan en secuencia (hay dos "Muslo (medial)": perímetro y pliegue).
  let from = 0;
  for (const f of FIELDS) {
    const re = new RegExp('^' + reEsc(f.label) + '\\s+' + NUM);
    for (let i = from; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) { out.values[f.key] = toNum(m[1]); from = i + 1; break; }
    }
  }

  // Masas (página 2). Desde la 2.ª medición la línea trae antes el kg anterior:
  // "Masa Adiposa 21,245 26,79% 20,787" → nos quedamos con el % y el kg actuales.
  for (const m of MASSES) {
    const re = new RegExp(reEsc(m.label) + '\\s+(?:' + NUM + '\\s+)?' + NUM + '%\\s+' + NUM);
    const r = all.match(re);
    if (r) out.masses[m.key] = { pct: toNum(r[2]), kg: toNum(r[3]) };
  }

  // Somatotipo (página 4).
  const s = all.match(new RegExp(NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s+\\(Posicionamiento actual\\)'));
  if (s) out.somato = { endo: toNum(s[1]), meso: toNum(s[2]), ecto: toNum(s[3]) };

  const missing = [];
  if (!out.date) missing.push('fecha');
  if (out.values.peso == null) missing.push('peso');
  if (!out.masses.muscular || !out.masses.adiposa) missing.push('masas');
  if (missing.length) throw new Error(`No reconocí el informe (falta: ${missing.join(', ')}).`);
  return out;
}

// Índices que se calculan a partir de los datos (no dependen del layout del PDF).
export function derived(r) {
  const v = r.values, m = r.masses;
  const d = {};
  if (v.peso && v.talla) d.imc = v.peso / (v.talla / 100) ** 2;
  const pl = ['pl_triceps', 'pl_subescapular', 'pl_supraespinal', 'pl_abdominal', 'pl_muslo', 'pl_pantorrilla'];
  if (pl.every(k => v[k] != null)) d.sum6 = pl.reduce((a, k) => a + v[k], 0);
  if (v.cintura && v.caderas) d.icc = v.cintura / v.caderas;
  if (m.adiposa && m.muscular) d.adip_musc = m.adiposa.kg / m.muscular.kg;
  return d;
}

export const DERIVED = [
  { key: 'imc', name: 'IMC', unit: 'kg/m²', digits: 1 },
  { key: 'sum6', name: 'Suma de 6 pliegues', unit: 'mm', better: 'down', digits: 1 },
  { key: 'icc', name: 'Índice cintura/cadera', unit: '', better: 'down', digits: 3 },
  { key: 'adip_musc', name: 'Índice adiposo/muscular', unit: '', better: 'down', digits: 3 },
];

// Texto por página a partir de pdf.js (agrupa los fragmentos por renglón).
export async function pdfPages(doc) {
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let out = '', lastY;
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== undefined && Math.abs(y - lastY) > 3) out += '\n';
      out += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    pages.push(out.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n'));
  }
  return pages;
}
