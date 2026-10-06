// Copia los archivos de la web app a www/, que es lo que Capacitor mete en la APK.
// (La web app sigue publicándose desde la raíz del repo en GitHub Pages.)
import { cp, mkdir, rm } from 'node:fs/promises';

const FILES = [
  'index.html', 'styles.css', 'manifest.webmanifest', 'privacypolicy.html',
  'app.js', 'store.js', 'routine.js', 'food.js', 'calendar.js', 'anthro.js', 'anthro-parse.js', 'native.js', 'profile.js', 'foods.js', 'foodlog.js', 'nutrition.js', 'off.js', 'exercises.js', 'routine-editor.js', 'routines.js', 'templates.js',
  'icons', 'lib', 'fonts',
];

await rm('www', { recursive: true, force: true });
await mkdir('www');
for (const f of FILES) await cp(f, `www/${f}`, { recursive: true });
// Puente JS de Capacitor (solo se usa dentro de la app de Android).
await cp('node_modules/@capacitor/core/dist/index.js', 'www/lib/capacitor-core.js');
console.log(`www/ listo (${FILES.length} entradas)`);
