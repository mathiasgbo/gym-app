// Biblioteca de ejercicios.
// Formato: id · nombre · músculo · equipamiento · tipo · series · reps (o seg/min) · descanso (s) · sinónimos
//   tipo: w = peso × reps · wh = peso × reps, pesado (sugiere calentamiento) · r = solo reps · t = segundos · m = minutos
// El id es la clave del historial: ejercicios con el mismo id comparten progresión.
import { state } from './store.js';

const RAW = `
press-banca-plano|Press banca plano|pecho|barra|wh|4|6-10|150|bench press pecho plano
press-banca-inclinado|Press banca inclinado|pecho|barra|wh|4|8-10|150|inclinado
press-banca-declinado|Press banca declinado|pecho|barra|w|3|8-10|120|declinado
press-mancuernas-plano|Press plano con mancuernas|pecho|mancuernas|wh|4|8-10|120|
press-mancuernas-inclinado|Press inclinado con mancuernas|pecho|mancuernas|wh|4|8-10|120|
press-pecho-maquina|Press de pecho en máquina|pecho|maquina|w|3|10-12|90|chest press
peck-deck-aperturas|Peck deck / aperturas en máquina|pecho|maquina|w|3|10-12|90|contractor mariposa pec deck
aperturas-mancuernas|Aperturas con mancuernas|pecho|mancuernas|w|3|10-12|90|flyes
cruce-de-poleas-aperturas|Cruce de poleas|pecho|polea|w|3|12-15|90|crossover aperturas
fondos-paralelas|Fondos en paralelas|pecho|corporal|r|3|8-12|120|dips
flexiones|Flexiones de brazos|pecho|corporal|r|3|10-20|60|lagartijas push up
flexiones-inclinadas|Flexiones inclinadas (manos elevadas)|pecho|corporal|r|3|12-20|60|push up
pullover-mancuerna|Pullover con mancuerna|pecho|mancuernas|w|3|10-12|90|
dominadas|Dominadas|espalda|corporal|r|4|5-10|150|pull up barra fija
dominadas-asistidas|Dominadas asistidas (máquina)|espalda|maquina|w|3|8-12|120|
jalon-ancho|Jalón al pecho (agarre ancho)|espalda|polea|wh|4|8-10|120|lat pulldown dorsales
jalon-neutro|Jalón al pecho (agarre neutro)|espalda|polea|wh|4|8-10|120|lat pulldown dorsales
jalon-supino|Jalón al pecho (agarre supino)|espalda|polea|wh|4|8-10|120|lat pulldown dorsales
pullover-polea-alta|Pullover en polea alta|espalda|polea|w|3|12-15|90|dorsales
remo-gironda|Remo gironda (polea baja)|espalda|polea|wh|4|10-12|120|remo sentado
remo-barra|Remo con barra|espalda|barra|wh|4|8-10|150|
remo-t|Remo en T (T-bar)|espalda|barra|wh|4|8-10|120|t bar
remo-mancuerna|Remo con mancuerna (serrucho)|espalda|mancuernas|w|3|10-12|90|serrucho
remo-maquina|Remo en máquina|espalda|maquina|wh|4|10-12|120|
remo-invertido|Remo invertido (con peso corporal)|espalda|corporal|r|3|8-12|90|australiano mesa
remo-banda|Remo con banda elástica|espalda|banda|r|3|12-15|60|
peso-muerto|Peso muerto|espalda|barra|wh|4|5-8|180|deadlift
hiperextensiones|Hiperextensiones lumbares|espalda|maquina|r|3|12-15|60|banco romano lumbares
superman|Superman|espalda|corporal|r|3|12-15|45|lumbares
encogimientos|Encogimientos (trapecio)|espalda|mancuernas|w|3|12-15|60|shrugs trapecios
press-militar|Press militar|hombros|barra|wh|4|8-10|120|press de hombros
press-hombros-mancuernas|Press de hombros con mancuernas|hombros|mancuernas|wh|4|8-12|120|arnold
press-hombros-maquina|Press de hombros en máquina|hombros|maquina|w|3|10-12|90|
press-hombros-banda|Press de hombros con banda|hombros|banda|r|3|12-15|60|
elevaciones-laterales|Elevaciones laterales|hombros|mancuernas|w|4|12-15|60|vuelos laterales
elevaciones-laterales-unilateral|Elevaciones laterales unilateral (polea)|hombros|polea|w|3|12-15|60|vuelos laterales
elevaciones-frontales|Elevaciones frontales|hombros|mancuernas|w|3|12-15|60|vuelos frontales
pajaros|Pájaros / vuelos posteriores|hombros|mancuernas|w|3|12-15|60|deltoides posterior
peck-deck-inverso|Peck deck inverso|hombros|maquina|w|3|12-15|60|deltoides posterior
face-pulls|Face pulls|hombros|polea|w|3|15|60|deltoides posterior
remo-al-menton|Remo al mentón|hombros|barra|w|3|10-12|90|
curl-barra|Curl con barra|biceps|barra|w|3|8-12|90|
curl-mancuernas|Curl con mancuernas|biceps|mancuernas|w|3|10-12|60|
curl-martillo|Curl martillo|biceps|mancuernas|w|3|10-12|60|
curl-biceps-polea-baja|Curl de bíceps en polea baja|biceps|polea|w|3|10-12|60|
curl-scott-predicador|Curl Scott / predicador|biceps|maquina|w|3|10-12|60|banco scott
curl-concentrado|Curl concentrado|biceps|mancuernas|w|3|10-12|60|
curl-inclinado|Curl en banco inclinado|biceps|mancuernas|w|3|10-12|60|
curl-banda|Curl con banda elástica|biceps|banda|r|3|12-15|45|
extension-triceps-polea-alta|Extensión de tríceps en polea alta (cuerda)|triceps|polea|w|3|10-12|60|soga pushdown
extension-triceps-barra-polea|Extensión de tríceps en polea (barra)|triceps|polea|w|3|10-12|60|pushdown
press-frances|Press francés (barra Z)|triceps|barra|w|3|8-12|90|rompecraneos
press-frances-polea-baja|Press francés en polea baja|triceps|polea|w|3|12|60|
extension-triceps-mancuerna|Extensión de tríceps tras nuca|triceps|mancuernas|w|3|10-12|60|copa
patada-triceps|Patada de tríceps|triceps|mancuernas|w|3|12-15|60|kickback
fondos-banco|Fondos en banco (o silla)|triceps|corporal|r|3|10-15|60|
press-cerrado|Press de banca agarre cerrado|triceps|barra|wh|3|8-10|120|
flexiones-diamante|Flexiones diamante|triceps|corporal|r|3|8-15|60|
sentadilla|Sentadilla con barra|cuadriceps|barra|wh|4|6-10|180|squat
sentadilla-frontal|Sentadilla frontal|cuadriceps|barra|wh|4|6-8|180|
sentadilla-smith|Sentadilla en Smith|cuadriceps|maquina|wh|4|8-10|120|multipower
sentadilla-hack|Sentadilla hack|cuadriceps|maquina|wh|4|8-12|120|
sentadilla-goblet|Sentadilla goblet|cuadriceps|mancuernas|w|3|10-12|90|copa
sentadilla-corporal|Sentadilla sin peso|cuadriceps|corporal|r|3|15-20|60|
prensa-45|Prensa 45°|cuadriceps|maquina|wh|4|10-12|120|leg press
extensor-de-cuadriceps|Extensor de cuádriceps|cuadriceps|maquina|w|3|12-15|60|sillon cuadriceps
estocadas|Estocadas / zancadas|cuadriceps|mancuernas|w|3|10-12|90|lunges
estocadas-corporal|Estocadas sin peso|cuadriceps|corporal|r|3|12-15|60|zancadas lunges
bulgaras|Sentadilla búlgara|cuadriceps|mancuernas|w|3|8-12|90|split squat
step-up|Subida al cajón (step up)|cuadriceps|mancuernas|w|3|10-12|90|
aductores|Aductores (máquina)|cuadriceps|maquina|w|3|15-20|60|
leg-curl|Leg curl acostado (isquios)|isquios|maquina|w|3|10-12|90|camilla femorales
leg-curl-sentado|Leg curl sentado|isquios|maquina|w|3|10-12|90|femorales
peso-muerto-rumano|Peso muerto rumano|isquios|barra|wh|4|8-10|150|rdl
peso-muerto-piernas-rigidas|Peso muerto piernas rígidas (mancuernas)|isquios|mancuernas|w|3|10-12|90|
buenos-dias|Buenos días|isquios|barra|w|3|10-12|90|good morning
hip-thrust|Hip thrust|gluteos|barra|wh|4|8-12|120|empuje de cadera
puente-gluteo|Puente de glúteo|gluteos|corporal|r|3|12-20|60|glute bridge
patada-gluteo-polea|Patada de glúteo en polea|gluteos|polea|w|3|12-15|60|
abductores|Abductores (máquina)|gluteos|maquina|w|3|15-20|60|
kettlebell-swing|Swing con kettlebell|gluteos|kettlebell|w|3|15-20|60|pesa rusa
elevacion-de-talones|Elevación de talones de pie|pantorrillas|maquina|w|4|15-20|60|gemelos
elevacion-talones-sentado|Elevación de talones sentado|pantorrillas|maquina|w|3|15-20|60|soleo gemelos
gemelos-prensa|Gemelos en prensa|pantorrillas|maquina|w|3|15-20|60|pantorrillas
plancha|Plancha|core|corporal|t|3|30-45|60|abdominales
plancha-lateral|Plancha lateral|core|corporal|t|3|20-40|60|abdominales
elevacion-de-piernas-colgado|Elevación de piernas colgado|core|corporal|r|3|10-15|60|abdominales
elevacion-piernas-suelo|Elevación de piernas en el suelo|core|corporal|r|3|12-15|45|abdominales
crunch|Abdominales (crunch)|core|corporal|r|3|15-20|45|abdominales
crunch-polea|Crunch en polea alta|core|polea|w|3|12-15|60|abdominales
lenador-en-polea|Leñador en polea|core|polea|w|3|12|60|woodchopper oblicuos
rueda-abdominal|Rueda abdominal|core|otro|r|3|8-12|60|ab wheel
giros-rusos|Giros rusos|core|corporal|r|3|20|45|russian twist oblicuos
dead-bug|Dead bug|core|corporal|r|3|10-12|45|
bird-dog|Bird dog|core|corporal|r|3|10|45|
pallof|Press Pallof|core|polea|r|3|10-12|60|antirotacion
escaladores|Escaladores|core|corporal|t|3|30|45|mountain climbers
burpees|Burpees|cardio|corporal|r|3|10-15|60|
caminata-inclinada|Caminata inclinada en cinta|cardio|maquina|m|1|15-20|0|cinta
cinta|Correr en cinta|cardio|maquina|m|1|15-30|0|trotar
bicicleta|Bicicleta fija|cardio|maquina|m|1|15-30|0|spinning
eliptico|Elíptico|cardio|maquina|m|1|15-30|0|
remo-ergometro|Remo ergómetro|cardio|maquina|m|1|10-20|0|
escaladora|Escaladora|cardio|maquina|m|1|10-20|0|stairmaster escalera
soga|Saltar la soga|cardio|otro|m|1|5-10|0|cuerda
`;

export const MUSCLES = [
  ['pecho', 'Pecho'], ['espalda', 'Espalda'], ['hombros', 'Hombros'], ['biceps', 'Bíceps'], ['triceps', 'Tríceps'],
  ['cuadriceps', 'Cuádriceps'], ['isquios', 'Isquios'], ['gluteos', 'Glúteos'], ['pantorrillas', 'Pantorrillas'],
  ['core', 'Core'], ['cardio', 'Cardio'],
];
export const EQUIPMENT = [
  ['barra', 'Barra'], ['mancuernas', 'Mancuernas'], ['maquina', 'Máquina'], ['polea', 'Polea'],
  ['corporal', 'Peso corporal'], ['banda', 'Banda'], ['kettlebell', 'Kettlebell'], ['otro', 'Otro'],
];
const TYPES = { w: 'weight', wh: 'weight', r: 'reps', t: 'time', m: 'min' };

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const range = s => { const [a, b = a] = s.split('-').map(Number); return [a, b]; };

export const EXERCISES = RAW.trim().split('\n').map(line => {
  const [id, name, muscle, equip, t, sets, reps, rest, aliases = ''] = line.split('|');
  const [setsMin, setsMax] = range(sets);
  const [repMin, repMax] = range(reps);
  return {
    id, name, muscle, equip, type: TYPES[t], heavy: t === 'wh',
    setsMin, setsMax, repMin, repMax, rest: Number(rest),
    terms: norm(`${name} ${aliases} ${muscle} ${equip}`),
  };
});

// Biblioteca completa: la base + los ejercicios propios del usuario.
export const allExercises = () => [...(state.exLib || []), ...EXERCISES];
export const findExercise = id => (state.exLib || []).find(x => x.id === id) || EXERCISES.find(x => x.id === id);

export function searchExercises(q, { muscle, equip } = {}) {
  const words = norm(q || '').split(/\s+/).filter(Boolean);
  return allExercises()
    .filter(x => (!muscle || x.muscle === muscle) && (!equip || x.equip === equip))
    .filter(x => words.every(w => x.terms.includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Ejercicio de rutina a partir de uno de la biblioteca (con sus valores sugeridos).
export function fromLibrary(x) {
  return {
    name: x.name, key: x.id, lib: x.id,
    setsMin: x.setsMin, setsMax: x.setsMax, repMin: x.repMin, repMax: x.repMax,
    type: x.type, heavy: x.heavy, perSide: false, inc: x.equip === 'mancuernas' ? 1 : x.equip === 'maquina' && x.muscle === 'cuadriceps' ? 5 : 2.5,
    rest: x.rest, note: '',
    section: x.muscle === 'core' ? 'core' : x.muscle === 'cardio' ? 'extra' : 'main',
  };
}

export { norm as normExercise };
