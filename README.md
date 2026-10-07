# Temple

App web instalable (PWA) para Android: rutina, registro de pesos, videos offline y sugerencias de progresión.

- `routine.js`: rutina inicial vacía (cada persona arma la suya; las rutinas personales van en `privado/`).
- `templates.js`: plantillas (Full Body 3 días, Torso/Pierna 4, Empuje/Tirón/Piernas 3 y 6, En casa).
- `exercises.js`: biblioteca de ~105 ejercicios (músculo, equipamiento, tipo y valores sugeridos).
- `routines.js`: varias rutinas (activa + archivadas), duplicar, en blanco, exportar/importar como archivo.
- `routine-editor.js`: editor de rutina (días, modo semana fija / rotación, ejercicios, reemplazos, ejercicios propios, reglas).
- `store.js`: estado, utilidades y fecha activa (para cargar días pasados).
- `app.js`: router, entreno (series, sugerencias de doble progresión, videos), progreso y ajustes.
- `food.js`: alimentación (estados por comida, cumplimiento por porciones, agua, sueño, meal prep).
- `foods.js`: base de ~220 alimentos de Argentina y Uruguay (kcal y macros cada 100 g, porciones caseras) y búsqueda.
- `nutrition.js`: calorías y macros por comida y por día, y objetivo diario (basal del informe o Mifflin-St Jeor × actividad ± objetivo).
- `routine-import.js`: importar rutinas desde PDF, Word, texto pegado (WhatsApp) o JSON; lector propio + IA del usuario como respaldo.
- `doctext.js`: texto de archivos (PDF, .docx, .txt, .rtf, .json). `ai-share.js`: "Enviar a mi IA" y lectura del portapapeles al volver.
- `plan-tools.js`: plan de alimentación: importar desde el PDF con la IA del usuario (pedido listo + pegar respuesta, revisión y vinculación con la base) y editor manual.
- `off.js`: productos envasados por código de barras (Open Food Facts); se guardan como alimentos propios.
- `foodlog.js`: agregar alimentos a una comida (búsqueda, porción, cantidad, favoritos, recientes, alimentos propios).
- `profile.js`: perfil y pantalla de bienvenida (nombre, edad, peso/altura o antropometría).
- `fonts/`: Barlow Condensed (OFL) para títulos y números; `icons/logo.svg`: logo de Temple.
- `calendar.js`: calendario mensual, detalle de un día y resumen semanal.
- `anthro.js` / `anthro-parse.js`: importa los informes de antropometría (PDF) y compara mediciones. `anthro-parse.js` se puede probar con node.
- `lib/`: pdf.js (Mozilla, Apache-2.0) para leer los PDF en el teléfono.
- `privado/`: plan de alimentación personal. **No se sube a GitHub** (está en .gitignore); se carga en el teléfono desde Ajustes.
- `sw.js`: hace que funcione sin señal. **Si cambiás archivos, subí la versión de `CACHE`** (`temple-vN` → `temple-vN+1`): cada versión se descarga completa y la app se recarga una vez.

Probar en la PC:

```bash
node .claude/serve.mjs
```

y abrir http://localhost:5173.

Los datos viven en el navegador del teléfono. Exportá un backup desde Ajustes cada tanto.

## App de Android (APK)

La misma app empaquetada con Capacitor, con extras nativos (`native.js`):
sueño desde Health Connect (Samsung Health, Zepp…), recordatorios de agua con botón
"Tomé un vaso" y exportar backups con el menú de compartir.

Requisitos: Android Studio instalado (trae Java y el SDK).

```bash
npm install
```

```bash
npm run apk
```

La APK queda en `release/Temple.apk`. `npm run apk` (APK de prueba, debug) copia la web a `www/`, sincroniza el proyecto
`android/` y compila. Gradle descarga solo el Java 21 que piden los plugins.

## Google Play (prueba interna)

```bash
npm run aab
```

Genera `release/Temple.aab` firmado con la clave de subida (`privado/temple-upload.jks` +
`privado/keystore.properties`, ambos fuera de Git). El `versionCode` sube solo en cada build.
Material de la ficha y respuestas de los formularios: [play/ficha.md](play/ficha.md).
