// Compila la app de Android con el Java y el SDK que instaló Android Studio.
//   node scripts/build-android.mjs apk  → release/Temple.apk  (debug, para probar)
//   node scripts/build-android.mjs aab  → release/Temple.aab  (firmado, para subir a Google Play)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2] === 'aab' ? 'aab' : 'apk';

const env = { ...process.env };
const studio = 'C:/Program Files/Android/Android Studio/jbr';
env.JAVA_HOME ||= existsSync(studio) ? studio : undefined;
env.ANDROID_HOME ||= join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (!env.JAVA_HOME) throw new Error('No encontré Java (JAVA_HOME). ¿Está instalado Android Studio?');

if (mode === 'aab' && !existsSync('privado/keystore.properties')) {
  console.error('Falta privado/keystore.properties con la clave de subida a Google Play (ver README).');
  process.exit(1);
}

// versionCode: minutos desde 2026, así cada build sube solo y Play nunca lo rechaza por repetido.
const versionCode = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000);
const versionName = JSON.parse(readFileSync('package.json', 'utf8')).version;

const win = process.platform === 'win32';
const task = mode === 'aab' ? 'bundleRelease' : 'assembleDebug';
execFileSync(win ? join(process.cwd(), 'android', 'gradlew.bat') : './gradlew',
  [task, `-PversionCode=${versionCode}`, `-PversionName=${versionName}`, '--console=plain'],
  { cwd: 'android', env, stdio: 'inherit', shell: win });

mkdirSync('release', { recursive: true });
const [from, to] = mode === 'aab'
  ? ['android/app/build/outputs/bundle/release/app-release.aab', 'release/Temple.aab']
  : ['android/app/build/outputs/apk/debug/app-debug.apk', 'release/Temple.apk'];
copyFileSync(from, to);
console.log(`\nListo: ${to} (versión ${versionName}, código ${versionCode})`);
