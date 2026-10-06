// Rutina por defecto. Se copia al estado la primera vez que se abre la app;
// después se edita desde la app (y se puede volver a esta con "Restaurar rutina").

export const slug = s => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ex('Nombre', '3-4', '10-12', { heavy, type, key, note, section, perSide, inc })
// type: 'weight' (kg × reps) | 'reps' (peso corporal) | 'time' (segundos)
// key: identifica el historial; ejercicios con la misma key comparten progreso entre días.
export const ex = (name, sets, reps, o = {}) => {
  const [setsMin, setsMax = setsMin] = String(sets).split('-').map(Number);
  const [repMin, repMax = repMin] = String(reps).split('-').map(Number);
  return {
    name, key: o.key || slug(name), setsMin, setsMax, repMin, repMax,
    type: o.type || 'weight', heavy: !!o.heavy, perSide: !!o.perSide,
    inc: o.inc ?? 2.5, note: o.note || '', section: o.section || 'main',
  };
};

const plancha = () => ex('Plancha', 3, '30-45', { type: 'time', section: 'core' });
const elevPiernas = () => ex('Elevación de piernas colgado', 3, '10-15', { type: 'reps', section: 'core' });
const legCurl = sets => ex('Leg curl (isquios)', sets, '10-12', { key: 'leg-curl' });

export const DEFAULT_ROUTINE = {
  name: 'Rutina — Mes 2',
  goal: 'Recomposición corporal',
  warmup: '1 serie al 50-60% antes del primer ejercicio pesado.',
  cardio: '15-20 min de caminata inclinada (4,8-5,2 km/h, inclinación 5-8%).',
  progression: 'Doble progresión: subís reps dentro del rango; cuando tocás el techo en todas las series, subís peso.',
  deload: '1 semana suave cada 5-6 semanas (mismo volumen, 60-70% del peso).',
  safety: 'Sin peso muerto, sin presión lumbar alta, sin impacto en mano/pie.',
  days: [
    {
      id: 'lun', dow: 1, title: 'Empuje A', exercises: [
        ex('Press banca inclinado (máquina/mancuernas)', 4, '8-10', { heavy: true }),
        ex('Peck deck / aperturas', 3, '10-12'),
        ex('Press militar', 3, '10-12', { heavy: true }),
        ex('Elevaciones laterales', 4, '12-15', { inc: 1 }),
        ex('Extensión tríceps polea alta (cuerda)', '3-4', '10-12'),
        plancha(),
        elevPiernas(),
      ],
    },
    {
      id: 'mar', dow: 2, title: 'Tirón B', exercises: [
        ex('Jalón al pecho (neutro/ancho)', 4, '8-10', { heavy: true, key: 'jalon-neutro' }),
        ex('Remo gironda (o T-bar)', 4, '10-12', { heavy: true }),
        ex('Face pulls', 3, 15),
        ex('Curl bíceps polea baja', 3, '10-12'),
        ex('Curl martillo', 3, 12, { inc: 1 }),
        legCurl(3),
      ],
    },
    {
      id: 'jue', dow: 4, title: 'Piernas', exercises: [
        ex('Prensa 45°', 4, '10-12', { heavy: true, inc: 5 }),
        ex('Extensor de cuádriceps', 3, '12-15'),
        legCurl(4),
        ex('Abductores', 3, '15-20'),
        ex('Aductores', 3, '15-20'),
        ex('Elevación de talones', 4, '15-20', { note: '⚠️ Ojo con el pie: si duele, pará y anotalo.' }),
        plancha(),
        ex('Leñador en polea', 3, 12, { section: 'core', perSide: true }),
      ],
    },
    {
      id: 'vie', dow: 5, title: 'Empuje A2', exercises: [
        ex('Press banca plano', 4, '8-10', { heavy: true }),
        ex('Cruce de poleas / aperturas', 3, '12-15'),
        ex('Press militar', 3, '10-12'),
        ex('Elevaciones laterales unilateral (polea)', 4, '12-15', { inc: 1, perSide: true }),
        ex('Press francés polea baja', '3-4', 12),
        ex('Pullover polea alta', 3, '12-15', { section: 'extra' }),
      ],
    },
    {
      id: 'sab', dow: 6, title: 'Tirón B2', exercises: [
        ex('Jalón al pecho (supino)', 4, '8-10', { heavy: true, key: 'jalon-supino' }),
        ex('Remo máquina (agarre distinto)', 4, '10-12', { heavy: true }),
        ex('Face pulls', 3, 15),
        ex('Curl Scott / predicador', 3, '10-12'),
        ex('Curl martillo', 3, 12, { inc: 1 }),
        legCurl(3),
        plancha(),
        elevPiernas(),
      ],
    },
  ],
};
