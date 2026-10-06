// Compila la APK de debug con el Java y el SDK que instaló Android Studio,
// y la deja en release/Gym.apk.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const env = { ...process.env };
const studio = 'C:/Program Files/Android/Android Studio/jbr';
env.JAVA_HOME ||= existsSync(studio) ? studio : undefined;
env.ANDROID_HOME ||= join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (!env.JAVA_HOME) throw new Error('No encontré Java (JAVA_HOME). ¿Está instalado Android Studio?');

const win = process.platform === 'win32';
execFileSync(win ? join(process.cwd(), 'android', 'gradlew.bat') : './gradlew', ['assembleDebug', '--console=plain'], {
  cwd: 'android', env, stdio: 'inherit', shell: win,
});
mkdirSync('release', { recursive: true });
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'release/Gym.apk');
console.log('\nAPK lista: release/Gym.apk');
