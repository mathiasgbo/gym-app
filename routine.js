// Rutina inicial: vacía. Cada persona arma la suya desde una plantilla, desde cero o importando
// un archivo (ver templates.js y routines.js). Las rutinas personales no van en el código.

export const DEFAULT_ROUTINE = {
  id: 'r-main',
  name: 'Mi rutina',
  mode: 'week',
  goal: '',
  warmup: '5-10 min de movilidad y 1-2 series livianas (50-60%) del primer ejercicio pesado.',
  cardio: '',
  progression: 'Doble progresión: subís reps dentro del rango; cuando tocás el techo en todas las series, subís peso.',
  deload: 'Cada 6-8 semanas, una semana suave: mismas series, 60-70% del peso.',
  safety: '',
  deloadWeeks: 6,
  days: [],
};
