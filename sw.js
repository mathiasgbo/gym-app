// Guarda la app en el teléfono para que funcione sin señal.
// Sirve desde caché y actualiza en segundo plano (los cambios se ven al reabrir).
const CACHE = 'temple-v8';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'routine.js', 'store.js', 'food.js', 'calendar.js', 'anthro.js', 'anthro-parse.js', 'native.js', 'profile.js',
  'fonts/barlow-condensed-500.woff2', 'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2', 'icons/logo.svg',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
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
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => cached);
    return cached || network;
  }));
});
