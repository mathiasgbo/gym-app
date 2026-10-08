// Guarda la app en el teléfono para que funcione sin señal.
// Cada versión se descarga COMPLETA en un caché nuevo antes de activarse, y la app se recarga una vez
// cuando la nueva versión toma el control. Así nunca se mezclan archivos viejos con nuevos.
// Al cambiar cualquier archivo, subir CACHE (temple-vN → temple-vN+1).
const CACHE = 'temple-v21';
const ASSETS = [
  './', 'index.html', 'styles.css', 'privacypolicy.html', 'manifest.webmanifest',
  'app.js', 'routine.js', 'store.js', 'food.js', 'calendar.js', 'anthro.js', 'anthro-parse.js', 'native.js', 'profile.js',
  'foods.js', 'foodlog.js', 'nutrition.js', 'off.js', 'exercises.js', 'routine-editor.js', 'routines.js', 'templates.js',
  'plan-tools.js', 'doctext.js', 'ai-share.js', 'routine-import.js',
  'lib/pdf.min.mjs', 'lib/pdf.worker.min.mjs',
  'fonts/barlow-condensed-500.woff2', 'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2',
  'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' evita que el navegador use copias viejas de su propio caché HTTP
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Siempre la copia de ESTA versión; lo que no está guardado, de internet.
  e.respondWith(caches.open(CACHE).then(async cache => (await cache.match(req, { ignoreSearch: true })) || fetch(req)));
});
