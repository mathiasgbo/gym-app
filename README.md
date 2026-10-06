# Gym — Mi rutina

App web instalable (PWA) para Android: rutina, registro de pesos, videos offline y sugerencias de progresión.

- `routine.js`: rutina por defecto (Mes 2).
- `app.js`: pantallas, registro de series, sugerencias (doble progresión), videos (IndexedDB) y backup.
- `sw.js`: hace que funcione sin señal. **Si cambiás archivos, subí la versión de `CACHE`** (`gym-v1` → `gym-v2`).

Probar en la PC:

```bash
node .claude/serve.mjs
```

y abrir http://localhost:5173.

Los datos viven en el navegador del teléfono. Exportá un backup desde Ajustes cada tanto.
