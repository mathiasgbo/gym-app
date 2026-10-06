// Productos envasados por código de barras con Open Food Facts (base abierta, licencia ODbL).
// Solo se envía el código del producto. Lo encontrado se guarda como alimento propio,
// así la próxima vez funciona sin conexión.
import { state, save } from './store.js';
import { norm } from './foods.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_es,brands,nutriments,serving_size,serving_quantity,product_quantity';

const round1 = x => Math.round(x * 10) / 10;

// Alimento ya guardado para ese código (de una búsqueda anterior o cargado a mano).
export const localByCode = code => state.foods.custom.find(f => f.code === code);

// Busca el código en Open Food Facts. Devuelve { found, food?, name?, brand? }.
// food es null si el producto existe pero no tiene la tabla nutricional cargada.
export async function lookupBarcode(code) {
  let res;
  try {
    res = await fetch(`${API}${encodeURIComponent(code)}?fields=${FIELDS}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('No hay conexión. Para buscar productos nuevos necesitás internet.');
  }
  if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts respondió con un error (${res.status}).`);
  const j = await res.json();
  if (j.status !== 1 || !j.product) return { found: false };

  const p = j.product;
  const n = p.nutriments || {};
  const name = (p.product_name_es || p.product_name || '').trim() || `Producto ${code}`;
  const brand = (p.brands || '').split(',')[0].trim();
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null) return { found: true, food: null, name, brand };

  const k = [kcal, n.proteins_100g || 0, n.carbohydrates_100g || 0, n.fat_100g || 0].map(Number).map(round1);
  const portions = [];
  const serving = Number(p.serving_quantity);
  if (serving > 0) portions.push(['1 porción', serving]);
  const pack = Number(p.product_quantity);
  if (pack > 0 && pack <= 1000 && pack !== serving) portions.push(['1 envase', pack]);
  portions.push(['100 g', 100]);

  const fullName = brand && !norm(name).includes(norm(brand)) ? `${name} · ${brand}` : name;
  return {
    found: true, name, brand,
    food: {
      id: `off-${code}`, code, source: 'off', custom: true,
      name: fullName,
      // Proteína ≥ 25 % de las kcal (lácteos, fiambres, carnes) → cuenta como porción de proteína; si no, "otros".
      cat: k[1] * 4 >= k[0] * 0.25 && k[0] > 0 ? 'prot' : 'otro',
      k, portions, terms: norm(`${fullName} ${code}`),
    },
  };
}

// Guarda (o actualiza) el producto como alimento propio.
export function saveProduct(food) {
  state.foods.custom = state.foods.custom.filter(f => f.id !== food.id);
  state.foods.custom.push(food);
  save();
  return food;
}
