// Plantillas de rutina armadas con ejercicios de la biblioteca.
// Cada ejercicio: 'id' o ['id', series, 'reps'] para cambiar los valores sugeridos.
import { findExercise, fromLibrary } from './exercises.js';
import { normalizeRoutine, todayStr } from './store.js';

const RULES = {
  warmup: '5-10 min de movilidad y 1-2 series livianas (50-60%) del primer ejercicio pesado.',
  cardio: '10-20 min de cardio suave después de entrenar (opcional, según tu objetivo).',
  progression: 'Doble progresión: subís reps dentro del rango; cuando tocás el techo en todas las series, subís peso.',
  deload: 'Cada 6-8 semanas, una semana suave: mismas series, 60-70% del peso.',
  safety: 'Técnica antes que peso. Si algo duele (no es lo mismo que cansancio), pará y consultá.',
  deloadWeeks: 6,
};

export const TEMPLATES = [
  {
    id: 'full-body-3', name: 'Full Body 3 días', level: 'Principiante · intermedio',
    desc: 'Todo el cuerpo tres veces por semana. Ideal para empezar o con poco tiempo.',
    days: [
      { title: 'Full body A', dow: 1, ex: [['sentadilla', 3], ['press-banca-plano', 3], ['remo-barra', 3], ['press-hombros-mancuernas', 3], ['curl-mancuernas', 2], 'plancha'] },
      { title: 'Full body B', dow: 3, ex: [['peso-muerto-rumano', 3], ['press-mancuernas-inclinado', 3], ['jalon-ancho', 3], ['elevaciones-laterales', 3], ['extension-triceps-polea-alta', 2], 'crunch'] },
      { title: 'Full body C', dow: 5, ex: [['prensa-45', 3], ['press-pecho-maquina', 3], ['remo-gironda', 3], 'face-pulls', ['curl-martillo', 2], 'plancha-lateral'] },
    ],
  },
  {
    id: 'torso-pierna-4', name: 'Torso / Pierna 4 días', level: 'Intermedio',
    desc: 'Dos días de torso y dos de pierna. Buen equilibrio entre volumen y descanso.',
    days: [
      { title: 'Torso A', dow: 1, ex: ['press-banca-plano', 'remo-barra', ['press-militar', 3], ['jalon-neutro', 3, '10-12'], 'elevaciones-laterales', 'curl-barra', 'extension-triceps-polea-alta'] },
      { title: 'Pierna A', dow: 2, ex: ['sentadilla', ['peso-muerto-rumano', 3], ['prensa-45', 3], 'leg-curl', 'elevacion-de-talones', 'plancha'] },
      { title: 'Torso B', dow: 4, ex: ['press-mancuernas-inclinado', ['jalon-supino', 4], 'remo-mancuerna', ['press-hombros-mancuernas', 3], 'face-pulls', 'curl-martillo', 'press-frances'] },
      { title: 'Pierna B', dow: 5, ex: ['hip-thrust', 'bulgaras', 'extensor-de-cuadriceps', 'leg-curl-sentado', 'elevacion-talones-sentado', 'elevacion-de-piernas-colgado'] },
    ],
  },
  {
    id: 'ppl-3', name: 'Empuje / Tirón / Piernas · 3 días', level: 'Intermedio',
    desc: 'Cada grupo una vez por semana con buen volumen. Lunes, miércoles y viernes.',
    days: [
      { title: 'Empuje', dow: 1, ex: ['press-banca-plano', 'press-mancuernas-inclinado', ['press-militar', 3], 'elevaciones-laterales', 'cruce-de-poleas-aperturas', 'extension-triceps-polea-alta', 'press-frances'] },
      { title: 'Tirón', dow: 3, ex: ['jalon-ancho', 'remo-barra', ['remo-gironda', 3], 'face-pulls', 'curl-barra', 'curl-martillo'] },
      { title: 'Piernas', dow: 5, ex: ['sentadilla', ['peso-muerto-rumano', 3], ['prensa-45', 3], 'leg-curl', 'extensor-de-cuadriceps', 'elevacion-de-talones'] },
    ],
  },
  {
    id: 'ppl-6', name: 'Empuje / Tirón / Piernas · 6 días', level: 'Avanzado',
    desc: 'Cada grupo dos veces por semana, con variantes A y B. De lunes a sábado.',
    days: [
      { title: 'Empuje A', dow: 1, ex: ['press-banca-plano', 'press-mancuernas-inclinado', ['press-militar', 3], 'elevaciones-laterales', 'cruce-de-poleas-aperturas', 'extension-triceps-polea-alta'] },
      { title: 'Tirón A', dow: 2, ex: ['jalon-ancho', 'remo-barra', ['remo-gironda', 3], 'face-pulls', 'curl-barra', 'curl-martillo'] },
      { title: 'Piernas A', dow: 3, ex: ['sentadilla', ['peso-muerto-rumano', 3], ['prensa-45', 3], 'leg-curl', 'elevacion-de-talones', 'plancha'] },
      { title: 'Empuje B', dow: 4, ex: ['press-mancuernas-plano', 'press-banca-inclinado', ['press-hombros-mancuernas', 3], 'elevaciones-laterales-unilateral', 'peck-deck-aperturas', 'extension-triceps-mancuerna'] },
      { title: 'Tirón B', dow: 5, ex: ['dominadas-asistidas', 'remo-mancuerna', 'remo-maquina', 'pajaros', 'curl-inclinado', 'curl-biceps-polea-baja'] },
      { title: 'Piernas B', dow: 6, ex: ['hip-thrust', 'sentadilla-hack', 'bulgaras', 'leg-curl-sentado', 'aductores', 'elevacion-talones-sentado'] },
    ],
  },
  {
    id: 'casa-3', name: 'En casa / sin equipo', level: 'Todos los niveles',
    desc: 'Peso corporal, un par de mancuernas y una banda elástica. Para casa o viajes.',
    days: [
      { title: 'Casa A', dow: 1, ex: ['sentadilla-goblet', 'flexiones', 'remo-mancuerna', ['press-hombros-mancuernas', 3, '10-15'], 'puente-gluteo', 'plancha'] },
      { title: 'Casa B', dow: 3, ex: ['estocadas', 'flexiones-diamante', 'remo-invertido', 'elevaciones-laterales', 'curl-mancuernas', 'dead-bug'] },
      { title: 'Casa C', dow: 5, ex: ['bulgaras', 'flexiones-inclinadas', 'remo-banda', 'pajaros', 'fondos-banco', 'escaladores'] },
    ],
  },
];

export const findTemplate = id => TEMPLATES.find(t => t.id === id);

// Ejercicios de una plantilla (con los valores ya ajustados), para mostrar o para crear la rutina.
export function templateExercises(day) {
  return day.ex.map(spec => {
    const [id, sets, reps] = Array.isArray(spec) ? spec : [spec];
    const x = findExercise(id);
    if (!x) return null;
    const e = fromLibrary(x);
    if (sets) { e.setsMin = sets; e.setsMax = sets; }
    if (reps) { const [a, b = a] = reps.split('-').map(Number); e.repMin = a; e.repMax = b; }
    return e;
  }).filter(Boolean);
}

export function routineFromTemplate(t) {
  const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return normalizeRoutine({
    id: uid('r'), name: t.name, mode: 'week', goal: '', createdAt: todayStr(), ...RULES,
    days: t.days.map(d => ({ id: uid('d'), title: d.title, dow: d.dow, exercises: templateExercises(d) })),
  });
}
