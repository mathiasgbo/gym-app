// Funciones que solo existen en la app de Android (Capacitor).
// En la web (PWA) nada de esto se carga: initNative() devuelve false.

let core = null;
const plugins = {};
const plugin = name => plugins[name] ??= core.registerPlugin(name);

export async function initNative() {
  if (!window.Capacitor) return false; // lo inyecta la app de Android antes de cargar la página
  core = await import('./lib/capacitor-core.js');
  return core.Capacitor.isNativePlatform();
}

// ---------- Sueño (Health Connect: Samsung Health, Zepp, etc.) ----------

const SOURCES = [[/shealth|samsung/i, 'Samsung Health'], [/zepp|huami|amazfit/i, 'Zepp'], [/fitbit/i, 'Fitbit'], [/google/i, 'Google']];
const sourceName = s => SOURCES.find(([re]) => re.test(s))?.[1] || s || 'Health Connect';

export async function healthAvailable() {
  try { return (await plugin('Health').isAvailable()).available; } catch { return false; }
}

export async function healthAuthorized() {
  try { return (await plugin('Health').checkAuthorization({ read: ['sleep'] })).readAuthorized.includes('sleep'); } catch { return false; }
}

export async function connectHealth() {
  const H = plugin('Health');
  const { available, reason } = await H.isAvailable();
  if (!available) throw new Error(reason || 'Health Connect no está disponible en este teléfono.');
  const r = await H.requestAuthorization({ read: ['sleep'] });
  return r.readAuthorized.includes('sleep');
}

export const openHealthSettings = () => plugin('Health').openHealthConnectSettings();

// Horas dormidas en la noche que termina el día `date` (YYYY-MM-DD): de las 18 h del día anterior a las 16 h.
// Si hay varias fuentes (por ejemplo reloj y celular), usa la que registró más sueño.
export async function readSleep(date) {
  const [y, m, d] = date.split('-').map(Number);
  const { samples } = await plugin('Health').readSamples({
    dataType: 'sleep',
    startDate: new Date(y, m - 1, d - 1, 18).toISOString(),
    endDate: new Date(y, m - 1, d, 16).toISOString(),
    limit: 500, ascending: true,
  });
  const awake = s => s === 'awake' || s === 'inBed';
  const bySource = {};
  for (const s of samples) {
    const min = s.stages?.length
      ? s.stages.filter(x => !awake(x.stage)).reduce((a, x) => a + x.durationMinutes, 0)
      : awake(s.sleepState) ? 0 : (new Date(s.endDate) - new Date(s.startDate)) / 60000;
    const src = sourceName(s.sourceName || s.sourceId);
    bySource[src] = (bySource[src] || 0) + min;
  }
  const best = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 30) return null;
  return { hours: Math.round(best[1] / 6) / 10, source: best[0] };
}

// ---------- Recordatorios de agua (notificaciones locales) ----------

const WATER_IDS = Array.from({ length: 48 }, (_, k) => 1000 + k);

export async function scheduleWater({ enabled, from, to, every }, glassMl) {
  const LN = plugin('LocalNotifications');
  await LN.cancel({ notifications: WATER_IDS.map(id => ({ id })) });
  if (!enabled) return 0;
  if ((await LN.requestPermissions()).display !== 'granted') throw new Error('Sin permiso para mostrar notificaciones.');
  await LN.createChannel({ id: 'water', name: 'Recordatorios de agua', importance: 4, vibration: true });
  await LN.registerActionTypes({ types: [{ id: 'water', actions: [{ id: 'glass', title: `💧 Tomé un vaso (${glassMl} ml)` }] }] });
  const slots = [];
  for (let t = from * 60; t <= to * 60 && slots.length < WATER_IDS.length; t += every * 60) slots.push(t);
  await LN.schedule({
    notifications: slots.map((t, k) => ({
      id: WATER_IDS[k],
      title: '💧 Hora de tomar agua',
      body: 'Tocá "Tomé un vaso" para sumarlo sin abrir la app.',
      channelId: 'water',
      actionTypeId: 'water',
      smallIcon: 'ic_stat_water',
      schedule: { on: { hour: Math.floor(t / 60), minute: t % 60 }, allowWhileIdle: true },
      isExactNotification: false, // unos minutos de diferencia no importan; así no pide el permiso de alarmas exactas
    })),
  });
  return slots.length;
}

// cb('glass') al tocar "Tomé un vaso", cb('tap') al tocar la notificación.
export function onWaterNotification(cb) {
  plugin('LocalNotifications').addListener('localNotificationActionPerformed', a => {
    if (WATER_IDS.includes(a.notification?.id)) cb(a.actionId === 'glass' ? 'glass' : 'tap');
  });
}

// ---------- Código de barras ----------

// Escáner de Google (Play Services): abre su propia cámara, así que la app no necesita permiso de cámara.
// Devuelve el código leído, o null si se canceló.
export async function scanBarcode() {
  const B = plugin('BarcodeScanner');
  const { available } = await B.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await B.installGoogleBarcodeScannerModule();
    throw new Error('Se está descargando el lector de códigos de Google. Probá de nuevo en unos segundos.');
  }
  try {
    const { barcodes } = await B.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
    return barcodes[0]?.rawValue || null;
  } catch (err) {
    if (/cancel/i.test(err.message)) return null;
    throw err;
  }
}

// ---------- Selector de archivos ----------

// En la app de Android, los <input type="file"> de la WebView abren el selector pero el archivo
// elegido nunca llega a la página. Este puente usa el selector nativo y le entrega los archivos
// al mismo input (con su evento "change"), así el resto del código no cambia.
const EXT_TYPES = { '.pdf': ['application/pdf'], '.json': ['application/json', 'application/octet-stream'] };

function acceptToTypes(accept) {
  const types = new Set();
  for (const a of (accept || '').split(',').map(s => s.trim()).filter(Boolean)) {
    for (const t of EXT_TYPES[a] || (a.startsWith('.') ? [] : [a])) types.add(t);
  }
  if (types.has('application/json')) types.add('application/octet-stream'); // algunos proveedores no reconocen .json
  return types.size ? [...types] : undefined;
}

export function useNativeFilePicker() {
  document.addEventListener('click', async ev => {
    const input = ev.target.matches?.('input[type=file]') ? ev.target : ev.target.closest('label')?.querySelector('input[type=file]');
    if (!input) return;
    ev.preventDefault();
    ev.stopPropagation();
    let picked;
    try {
      picked = await plugin('FilePicker').pickFiles({ types: acceptToTypes(input.accept), limit: input.multiple ? 0 : 1 });
    } catch (err) {
      if (!/cancel/i.test(err.message)) alert('No se pudo abrir el archivo: ' + err.message);
      return;
    }
    if (!picked.files.length) return;
    const dt = new DataTransfer();
    for (const f of picked.files) {
      const blob = await (await fetch(f.webPath)).blob();
      dt.items.add(new File([blob], f.name, { type: f.mimeType || blob.type }));
    }
    // Mientras el selector estaba abierto la pantalla pudo redibujarse: si el input ya no está
    // en la página, se usa el equivalente actual (mismo data-action).
    const target = input.isConnected ? input
      : document.querySelector(`input[type=file][data-action="${CSS.escape(input.dataset.action || '')}"]`);
    if (!target) return;
    target.files = dt.files;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);
}

// ---------- Ciclo de vida y archivos ----------

export function onResume(cb) {
  plugin('App').addListener('resume', cb);
}

// Portapapeles nativo (más confiable que el de la WebView).
export const copyText = text => plugin('Clipboard').write({ string: text });
export const readClipboard = async () => (await plugin('Clipboard').read()).value || '';

// Compartir texto con otra app (por ejemplo, con la IA que use el usuario).
export const shareText = text => plugin('Share').share({ text, dialogTitle: 'Compartir con tu IA' });

// En la app no se pueden "descargar" archivos: se guardan y se abre el menú de compartir.
export async function shareFile(name, text) {
  const { uri } = await plugin('Filesystem').writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  await plugin('Share').share({ title: name, files: [uri] });
}
