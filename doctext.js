// Texto de un archivo: PDF (con texto), Word (.docx), texto plano (.txt, .md, .csv) o JSON.
// Todo se lee en el teléfono; nada se sube a ningún lado.
import { pdfPages } from './anthro-parse.js';

export const DOC_ACCEPT = '.pdf,.docx,.txt,.md,.csv,.json,.rtf,application/pdf,text/plain,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ext = name => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

// Devuelve { kind, text, pages? }. Lanza un error con un mensaje claro si no se puede leer.
export async function fileToText(file) {
  const e = ext(file.name);
  const type = file.type || '';
  if (e === 'pdf' || type === 'application/pdf') return readPdf(file);
  if (e === 'docx' || type.includes('wordprocessingml')) return { kind: 'docx', text: await readDocx(file) };
  if (e === 'doc') throw new Error('Los archivos .doc (Word viejo) no se pueden leer. Guardalo como .docx o PDF, o copiá y pegá el texto.');
  if (e === 'rtf') return { kind: 'rtf', text: rtfToText(await file.text()) };
  if (e === 'json' || type.includes('json')) return { kind: 'json', text: await file.text() };
  if (/^image\//.test(type) || ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(e)) {
    throw new Error('Es una imagen: Temple no puede leer el texto de fotos. Pasásela a tu IA (botón "Enviar a mi IA") o copiá el texto.');
  }
  return { kind: 'text', text: await file.text() };
}

async function readPdf(file) {
  const pdfjs = await import('./lib/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = await pdfPages(doc);
  return { kind: 'pdf', pages: pages.length, text: pages.join('\n\n').replace(/[ \t]+/g, ' ').trim() };
}

// ---------- Word (.docx): es un ZIP; el texto está en word/document.xml ----------

async function readDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('No encontré el texto dentro del archivo de Word.');
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Lee un archivo de un ZIP usando el directorio central (sin librerías: descomprime con DecompressionStream).
async function unzipEntry(buf, wanted) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo de Word está dañado o no es un .docx.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + csize);
      if (method === 0) return dec.decode(data);
      if (method !== 8) throw new Error('El archivo de Word usa una compresión que no se puede leer.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// RTF muy básico: saca los comandos y deja el texto.
function rtfToText(rtf) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .trim();
}
