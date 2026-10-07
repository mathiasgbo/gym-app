// "Enviar a mi IA": manda un pedido de texto a la IA que elija el usuario y, al volver, toma la respuesta
// del portapapeles. Temple no se conecta con ninguna IA: el usuario elige con cuál compartir.
//   Android: menú de compartir (ChatGPT, Gemini, Claude… reciben el texto ya pegado).
//   Web: botones que copian el pedido y abren la IA elegida.
import { env, esc } from './store.js';
import * as native from './native.js';

export const AI_SITES = [
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['Claude', 'https://claude.ai/new'],
  ['Copilot', 'https://copilot.microsoft.com/'],
];

// Envía el pedido. Devuelve 'shared' (se abrió el menú de compartir), 'cancel' o 'choose' (mostrar los botones).
export async function sendToAi(prompt) {
  if (env.native) {
    try { await native.shareText(prompt); return 'shared'; } catch (err) { return /cancel/i.test(err.message) ? 'cancel' : 'choose'; }
  }
  if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ text: prompt }); return 'shared'; } catch (err) { return err.name === 'AbortError' ? 'cancel' : 'choose'; }
  }
  return 'choose';
}

export async function copyText(text) {
  if (env.native) { await native.copyText(text); return; }
  await navigator.clipboard.writeText(text);
}

export async function readClipboard() {
  try { return env.native ? await native.readClipboard() : await navigator.clipboard.readText(); } catch { return ''; }
}

// Botones para la web: copian el pedido y abren la IA.
export const aiButtons = action => AI_SITES.map(([name, url]) =>
  `<button class="btn small" data-action="${action}" data-url="${esc(url)}">${esc(name)}</button>`).join('');

export async function openAiSite(url, prompt) {
  try { await copyText(prompt); } catch {}
  window.open(url, '_blank', 'noopener');
}

// Al volver a la app (o a la pestaña), mira si en el portapapeles hay una respuesta que sirva.
// accept(text) decide si el texto es lo que se espera; onText(text) lo procesa. Se usa una vez por pedido.
let watcher = null;
export function watchClipboard(accept, onText) {
  watcher = { accept, onText, last: '' };
}
export function stopWatching() { watcher = null; }

async function check() {
  if (!watcher) return;
  const text = await readClipboard();
  if (!text || text === watcher.last || !watcher.accept(text)) return;
  watcher.last = text;
  const w = watcher;
  watcher = null;
  w.onText(text);
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => setTimeout(check, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 300); });
}
export const checkClipboardNow = check;
