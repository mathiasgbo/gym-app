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

// ---------- Ciclo de vida y archivos ----------

export function onResume(cb) {
  plugin('App').addListener('resume', cb);
}

// En la app no se pueden "descargar" archivos: se guardan y se abre el menú de compartir.
export async function shareFile(name, text) {
  const { uri } = await plugin('Filesystem').writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  await plugin('Share').share({ title: name, files: [uri] });
}
