/**
 * La dirección del Mapa de Project Zomboid (2026-09-30): dónde mira el mapa, con qué zoom, qué capas y qué base, en
 * `?x=&y=&z=&capas=&base=` (y la profesión de los puntos de aparición en `profesion=`, si esa capa está prendida, y el
 * edificio con la hoja abierta en `edificio=`, Task 4). Es lo que viaja en un link copiado, así que se lee y se escribe
 * acá, sin Leaflet ni `window`, y se prueba en `test/zomboidMapUrl.test.ts`.
 *
 * Coordenadas en casillas del mundo (x al este, y al sur), como las escribe `map.py`. El zoom es el del visor: 4 es un
 * píxel por casilla, cada punto menos es la mitad y 6 es lo más cerca (ver `games/zomboid/data/map/tiles.json`).
 *
 * También entiende los links que ya circulan en la comunidad, para que un link pegado de otro visor abra en el mismo
 * lugar:
 * - `?x=&y=&z=&zoom=` (pzmap2dzi): ahí `z` es el piso (0 por defecto) y `zoom` los píxeles de pantalla por casilla (16
 *   por defecto). Con `zoom` presente, `z` no se mira: se traduce `zoom` a nuestra escala, que es 2^(z−4) píxeles por
 *   casilla, o sea `z = 4 + log2(zoom)` (recortado al visor: `zoom=1` es nuestro 4 y `zoom=16` pasa del máximo);
 * - el hash `#XxYxZ` (el nuestro nunca escribió un hash: el tercer número es de otro visor, con otra escala);
 * - `?x=&y=` sin `z` ni `zoom`, armado a mano o de otro lado.
 * Un link de otro visor cuyo zoom no se entiende abre a la escala de la calle (`NEAR`): el lugar es lo que importa. Son
 * los únicos formatos que hay con evidencia (no se inventan otros: si aparece uno, se suma con su link real en un test).
 */
import profNames from "virtual:pz-names/professions";

export type MapBase = "sat" | "paper";

/**
 * Las capas del juego (Task 3), en el orden de la leyenda. El id es el que va en `capas=`: en español como el nombre
 * del parámetro, y el mismo en las dos páginas (un link armado en inglés abre igual en español y al revés).
 * `densidad` (2026-10-01) es la densidad de zombis por chunk de 8×8 casillas: va pegada a `zombis` porque de eso habla.
 */
export const LAYERS = [
  "vehiculos",
  "recoleccion",
  "animales",
  "sotanos",
  "zombis",
  "densidad",
  "historias",
  "botin",
  "edificios",
  "apariciones",
  "escondites",
] as const;
export type LayerId = (typeof LAYERS)[number];

/** Los nombres en inglés (y alguno más que se escribe a mano) de cada capa: un link con `layers=stashes` también abre. */
const LAYER_ALIASES: Record<string, LayerId> = {
  vehicles: "vehiculos",
  cars: "vehiculos",
  autos: "vehiculos",
  forage: "recoleccion",
  foraging: "recoleccion",
  forrajeo: "recoleccion",
  animals: "animales",
  ranch: "animales",
  granjas: "animales",
  basements: "sotanos",
  zombies: "zombis",
  // Cómo le dice la comunidad a un mapa de densidad: "heatmap" en los foros y en los otros visores.
  density: "densidad",
  heatmap: "densidad",
  heat: "densidad",
  calor: "densidad",
  stories: "historias",
  loot: "botin",
  buildings: "edificios",
  named: "edificios",
  spawns: "apariciones",
  stashes: "escondites",
};

export interface MapState {
  x: number;
  y: number;
  z: number;
  layers: LayerId[];
  base: MapBase;
  /** La profesión de los puntos de aparición (el slug de su ficha, "mechanic"), o `null` para todas. */
  prof: string | null;
  /** El edificio con la hoja abierta (su id del juego, "41_37_45"), o `null`. */
  building: string | null;
}

/** El tamaño del mundo en casillas: lo que cubren las teselas. */
export const MAP_W = 19968;
export const MAP_H = 16128;
/** De lejos hasta ver Knox County entero en un celular; de cerca, cuatro píxeles por casilla. */
export const MIN_ZOOM = -2;
export const MAX_ZOOM = 6;
/**
 * Desde este zoom un toque en el mapa busca el edificio. Más lejos, una casa es un punto de dos píxeles: el toque es para
 * mover el mapa, y bajar el archivo de edificios de la región (hasta 229 KB) sería pedir algo que nadie quiso. Vive acá y
 * no en el visor para que la página sepa cuándo conviene bajar la hoja del edificio sin traer Leaflet.
 */
export const BUILDING_FROM = 3;
/** Un link de otro visor con un zoom que no se entiende: se abre a la escala de la calle (dos píxeles por casilla; a 4, un
 *  píxel, un edificio es apenas un punto). */
export const NEAR = 5;
/** Sin nada en la dirección: Muldraugh, el pueblo donde empieza casi todo el mundo, con el pueblo entero a la vista. */
export const DEFAULT_VIEW: MapState = { x: 10600, y: 9600, z: 2, layers: [], base: "sat", prof: null, building: null };

/**
 * Las profesiones con ficha (sus slugs, "fishing-guide"). `profesion=` sólo acepta una de estas: un slug inventado
 * filtraba los puntos de aparición a ninguno y quedaba escrito en el link.
 */
export const PROFESSIONS: ReadonlySet<string> = new Set(Object.keys(profNames));

/** Recorta al rango; un NaN (que `Math.min`/`Math.max` dejarían pasar) toma `fallback`. El infinito sí se recorta al borde. */
const clamp = (v: number, lo: number, hi: number, fallback = lo) => (Number.isNaN(v) ? fallback : Math.min(hi, Math.max(lo, v)));
/**
 * Un número de la dirección: `null` si no hay o no es un número decimal. `Number("")` es 0 (y 0 es una casilla válida) y
 * `Number("0x10")` es 16, así que no se le deja a `Number` decidir qué es un número: sólo `-12` o `12.5`, sin hex, sin
 * exponente, sin `Infinity`.
 */
const num = (v: string | null | undefined): number | null => {
  const s = v?.trim() ?? "";
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
};

/** La casilla de un estado, siempre entera y dentro del mundo: si trae un NaN, la de siempre (nunca se escribe "NaN"). */
const place = (x: number, y: number) => ({
  x: Math.round(clamp(x, 0, MAP_W, DEFAULT_VIEW.x)),
  y: Math.round(clamp(y, 0, MAP_H, DEFAULT_VIEW.y)),
});
const zoom = (z: number) => Math.round(clamp(z, MIN_ZOOM, MAX_ZOOM, DEFAULT_VIEW.z) * 100) / 100;

/** Nuestro zoom para `px` píxeles de pantalla por casilla (la escala de pzmap2dzi); `null` si no es un zoom posible. */
const fromPixels = (px: number | null): number | null => (px !== null && px > 0 ? clamp(4 + Math.log2(px), MIN_ZOOM, MAX_ZOOM) : null);

/** El id de una capa escrita en la dirección (en español o en inglés), o `null` si no es una capa. */
export function layerId(raw: string): LayerId | null {
  const id = raw.trim().toLowerCase();
  if ((LAYERS as readonly string[]).includes(id)) return id as LayerId;
  return Object.hasOwn(LAYER_ALIASES, id) ? LAYER_ALIASES[id] : null;
}

/**
 * Las capas de la dirección: sólo las que existen, sin repetidas y en el orden de la leyenda, así el link de un mismo
 * mapa es siempre el mismo, se hayan prendido en el orden que sea.
 */
function layersOf(raw: string | null | undefined): LayerId[] {
  if (!raw) return [];
  const on = new Set(raw.split(",").map(layerId));
  return LAYERS.filter((id) => on.has(id));
}

function profOf(raw: string | null, layers: readonly LayerId[]): string | null {
  const p = raw?.trim().toLowerCase() ?? "";
  return layers.includes("apariciones") && PROFESSIONS.has(p) ? p : null;
}

/**
 * El id de un edificio del juego: la celda de 256 casillas donde está y su número en ella ("41_37_45"). Otra cosa no
 * pasa: el id va a la dirección y de ahí a buscar el archivo de su región, y un texto cualquiera no tiene por qué llegar.
 */
const BUILDING_ID = /^\d{1,3}_\d{1,3}_\d{1,5}$/;
function buildingOf(raw: string | null | undefined): string | null {
  const b = raw?.trim() ?? "";
  return BUILDING_ID.test(b) ? b : null;
}

/** El lugar (y el zoom, si se entiende) del hash de la comunidad `#XxYxZ`. */
function fromHash(hash: string): { x: number; y: number; z: number } | null {
  const xyz = hash.replace(/^#/, "").match(/^(-?\d+(?:\.\d+)?)x(-?\d+(?:\.\d+)?)(?:x(-?\d+(?:\.\d+)?))?$/);
  if (!xyz) return null;
  // Nuestro visor nunca escribió un hash, así que el tercer número es siempre el zoom de otro visor, con una escala que
  // no conocemos: se abre a la escala de la calle, cualquiera sea.
  return { x: Number(xyz[1]), y: Number(xyz[2]), z: xyz[3] === undefined ? DEFAULT_VIEW.z : NEAR };
}

/**
 * Lo que dice la dirección del mapa, o `null` si no dice nada del mapa (el visor abre en `DEFAULT_VIEW`). Lo que falta
 * o no se entiende toma el valor de siempre; lo que se sale del mundo se recorta al borde.
 */
export function readMapUrl(search: string, hash: string): MapState | null {
  const q = new URLSearchParams(search);
  const layers = layersOf(q.get("capas") ?? q.get("layers"));
  const prof = profOf(q.get("profesion") ?? q.get("profession"), layers);
  const building = buildingOf(q.get("edificio") ?? q.get("building"));
  const baseRaw = q.get("base");
  const baseId = baseRaw?.trim().toLowerCase();
  const base: MapBase = baseId === "paper" || baseId === "papel" ? "paper" : "sat";

  let at: { x: number; y: number; z: number } | null = null;
  const x = num(q.get("x")), y = num(q.get("y"));
  if (x !== null || y !== null) {
    // Con `zoom=` el link es de otro visor (pzmap2dzi): `z` es el piso y no se mira; sin zoom que se entienda, la calle.
    // Con `z=` (y sin `zoom=`), es de los nuestros: si viene roto o vacío, el zoom de siempre. Sin ninguno de los dos,
    // nosotros no lo escribimos (siempre va `z`): es un link armado a mano o de otro lado, y se abre en la calle.
    // La `x` o la `y` que falta toma la de siempre.
    const z = q.get("zoom")?.trim() ? fromPixels(num(q.get("zoom"))) ?? NEAR : q.has("z") ? num(q.get("z")) ?? DEFAULT_VIEW.z : NEAR;
    at = { x: x ?? DEFAULT_VIEW.x, y: y ?? DEFAULT_VIEW.y, z };
  } else at = fromHash(hash);

  if (!at && !layers.length && baseRaw === null && !building) return null;
  const view = at ?? DEFAULT_VIEW;
  return { ...place(view.x, view.y), z: zoom(view.z), layers, base, prof, building };
}

/**
 * La query de un estado (`?x=…&y=…&z=…`), con las capas, la profesión y la base sólo si hay. Las comas quedan
 * legibles. La profesión va sólo con la capa de los puntos de aparición: sin ella no filtra nada.
 */
export function writeMapUrl(state: MapState): string {
  const { x, y } = place(state.x, state.y);
  let out = `?x=${x}&y=${y}&z=${zoom(state.z)}`;
  const layers = layersOf(state.layers.join(","));
  if (layers.length) out += `&capas=${layers.join(",")}`;
  const prof = profOf(state.prof, layers);
  if (prof) out += `&profesion=${prof}`;
  if (state.base === "paper") out += "&base=paper";
  const building = buildingOf(state.building);
  if (building) out += `&edificio=${building}`;
  return out;
}

/**
 * Los parámetros que son del mapa: los nuestros y los de otros visores que `readMapUrl` entiende. Al reescribir la
 * dirección se sacan todos (si quedara un `zoom=` o un `layers=` viejo, el próximo F5 lo leería otra vez encima).
 */
const MAP_KEYS = ["x", "y", "z", "zoom", "capas", "layers", "profesion", "profession", "base", "edificio", "building"];

/**
 * La query de la dirección con el estado del mapa, sin perder lo que no es del mapa (`?utm_source=`, `?ref=`, lo que
 * agregue otra parte del sitio): primero lo nuestro, como `writeMapUrl`, y después lo demás tal cual vino. Antes la
 * dirección se reescribía entera con `writeMapUrl` y todo lo otro se perdía en el primer movimiento.
 */
export function mergeMapQuery(search: string, state: MapState): string {
  const rest = new URLSearchParams(search);
  for (const k of MAP_KEYS) rest.delete(k);
  const tail = rest.toString();
  return writeMapUrl(state) + (tail ? `&${tail}` : "");
}
