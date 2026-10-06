# Gym — Mi rutina

App web instalable (PWA) para Android: rutina, registro de pesos, videos offline y sugerencias de progresión.

- `routine.js`: rutina por defecto (Mes 2).
- `store.js`: estado, utilidades y fecha activa (para cargar días pasados).
- `app.js`: router, entreno (series, sugerencias de doble progresión, videos), progreso y ajustes.
- `food.js`: alimentación (comidas por porciones, agua, sueño, meal prep).
- `calendar.js`: calendario mensual, detalle de un día y resumen semanal.
- `anthro.js` / `anthro-parse.js`: importa los informes de antropometría (PDF) y compara mediciones. `anthro-parse.js` se puede probar con node.
- `lib/`: pdf.js (Mozilla, Apache-2.0) para leer los PDF en el teléfono.
- `privado/`: plan de alimentación personal. **No se sube a GitHub** (está en .gitignore); se carga en el teléfono desde Ajustes.
- `sw.js`: hace que funcione sin señal. **Si cambiás archivos, subí la versión de `CACHE`** (`gym-v3` → `gym-v4`).

Probar en la PC:

```bash
node .claude/serve.mjs
```

y abrir http://localhost:5173.

Los datos viven en el navegador del teléfono. Exportá un backup desde Ajustes cada tanto.
