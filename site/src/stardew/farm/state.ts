/**
 * La Granja de Stardew Valley (etapa 4, tarea 6): la forma de `farm.json` (`games/stardew/tools/farm_data.py`), la vista
 * que se elige en la pestaña y cómo viaja en la dirección (`?v=buildings`), y las listas ya armadas: los animales por
 * edificio y la cadena de mejoras de un edificio con lo que cuesta desde cero.
 *
 * El ancla de cada fila es el slug de la clave del juego (`White Chicken` → `white-chicken`): las fichas de Objetos
 * enlazan a `granja#white-chicken` (lo produce) y a `granja?v=buildings#coop` (es material).
 */

type Pair = [en: string, es: string];
/** Un objeto nombrado, igual que `Ref` de data.ts: slug, slug en español, nombres y tamaño del sprite. */
type Ref = [
  slug: string,
  slugEs: string,
  en: string,
  es: string,
  w: number,
  h: number,
];

/** Lo que da un animal: el id del objeto, si es el de lujo y la amistad (0 a 1000) que pide. */
export interface Produce {
  id: string;
  deluxe: boolean;
  minFriendship: number;
}

/** Con qué se cosecha: la cubeta, las tijeras, lo desentierra (el cerdo) o null, que lo deja en el piso. */
export type Tool = "pail" | "shears" | "dig" | null;

export interface Animal {
  key: string;
  slug: string;
  name: Pair;
  /** El edificio donde vive (`Coop`, `Barn`): la clave de un edificio de `buildings`. */
  house: string;
  /** Lo que cobra Marnie; null si no lo vende (y entonces `from` dice de dónde sale). */
  price: number | null;
  /** El edificio que Marnie pide para venderlo (la clave), o null. */
  needs: string | null;
  /** De dónde sale si Marnie no lo vende (o, la gallina azul, cuándo sale en su lugar). */
  from: Pair | null;
  /** El huevo que se incuba para tenerlo, o null. */
  egg: string | null;
  /** Días para crecer (0: nace adulto, el dinosaurio). */
  mature: number;
  /** Cada cuántos días produce. */
  every: number;
  tool: Tool;
  produce: Produce[];
  /** Precio base al venderlo: el juego lo multiplica por (amistad / 1000 + 0,3). */
  sell: number;
  /** Cuánto baja el ánimo cada 10 minutos afuera de noche, con lluvia o en invierno. */
  drain: number;
  /** Ancho y alto de un cuadro del sprite (16×16 las aves, 32×32 el resto). */
  sprite: [w: number, h: number];
  /** Si tiene sprite de bebé (`<slug>-baby.png`). */
  baby: boolean;
}

export interface Building {
  key: string;
  slug: string;
  name: Pair;
  desc: Pair;
  /** Quién lo construye: Robin en la carpintería o el Mago en su torre. */
  builder: "Robin" | "Wizard";
  cost: number;
  /** Materiales: id del objeto y cantidad. */
  materials: [id: string, n: number][];
  /** Días de obra (0: listo al día siguiente; los del Mago, en el acto). */
  days: number;
  /** El edificio que mejora (la clave), o null. */
  upgradeOf: string | null;
  size: [w: number, h: number];
  /** Las claves de los animales que pueden vivir en él. */
  animals: string[];
  /** Ancho y alto del dibujo (`/stardew/buildings/<slug>.png`). */
  sprite: [w: number, h: number];
}

export interface HouseUpgrade {
  level: number;
  cost: number;
  materials: [id: string, n: number][];
  days: number;
  adds: Pair;
}

export interface Renovation {
  key: string;
  slug: string;
  name: Pair;
  desc: Pair;
  /** 0 la cuna, que es gratis. */
  price: number;
}

/**
 * Lo que suma o resta amistad y ánimo. `value` es TEXTO, la cifra tal cual se muestra: "+15", "÷2", "−3…10" (con el
 * menos tipográfico y un rango, el ánimo que baja cada 10 minutos según el animal). `stat` dice qué toca.
 */
export interface Care {
  key: string;
  stat: "friendship" | "mood" | "both";
  value: string;
  text: Pair;
}

export interface FarmData {
  animals: Animal[];
  buildings: Building[];
  house: { upgrades: HouseUpgrade[]; renovations: Renovation[] };
  care: Care[];
  /** Producto → cada máquina que lo recibe: máquina (`(BC)24`), lo que sale, minutos y días. */
  process: Record<
    string,
    [machine: string, out: string, minutes: number, days: number][]
  >;
  /** El nombre de las herramientas de `tool`. */
  tools: Record<"pail" | "shears", Pair>;
  refs: Record<string, Ref>;
}

// --- La vista y la dirección ------------------------------------------------------------------------------------

export const FARM_VIEWS = ["animals", "buildings", "house"] as const;
export type FarmView = (typeof FARM_VIEWS)[number];
export const DEFAULT_FARM_VIEW: FarmView = "animals";

/** La vista escrita en la dirección (`?v=buildings`); lo que no se conoce, Animales. */
export function readFarmView(search: string): FarmView {
  const v = new URLSearchParams(search).get("v");
  return (FARM_VIEWS as readonly string[]).includes(v ?? "")
    ? (v as FarmView)
    : DEFAULT_FARM_VIEW;
}
/** Lo contrario: `?v=…`, vacío en la vista por defecto. */
export const writeFarmView = (v: FarmView): string =>
  v === DEFAULT_FARM_VIEW ? "" : `?v=${v}`;

/**
 * La vista donde está un ancla (`#coop` es un edificio, `#add-cubby` una reforma de la casa), para un enlace que llega
 * sin `?v=`; null si el ancla no es de ninguna fila.
 */
export function viewOfAnchor(data: FarmData, anchor: string): FarmView | null {
  if (!anchor) return null;
  if (data.animals.some((a) => a.slug === anchor)) return "animals";
  if (data.buildings.some((b) => b.slug === anchor)) return "buildings";
  if (
    anchor.startsWith("upgrade-") ||
    data.house.renovations.some((r) => r.slug === anchor)
  )
    return "house";
  return null;
}

// --- Las listas ------------------------------------------------------------------------------------------------

/** Los edificios de animales en el orden del menú: el gallinero, el establo y después los demás. */
const HOUSE_ORDER = ["Coop", "Barn"];

/** Los animales agrupados por el edificio donde viven: Gallinero, Establo y otros, cada grupo en el orden del juego. */
export function animalsByHouse(
  data: FarmData,
): [house: string, animals: Animal[]][] {
  const groups = new Map<string, Animal[]>();
  for (const a of data.animals)
    groups.set(a.house, [...(groups.get(a.house) ?? []), a]);
  const rank = (h: string) =>
    HOUSE_ORDER.includes(h) ? HOUSE_ORDER.indexOf(h) : HOUSE_ORDER.length;
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/**
 * La cadena de mejoras que termina en un edificio, del primero al pedido (`Deluxe Coop` → Gallinero, Gallinero grande,
 * Gallinero de lujo), cada uno con `total`: lo que cuesta en oro llegar hasta él desde cero. Vacía si no existe.
 */
export function buildingChain(
  data: FarmData,
  key: string,
): (Building & { total: number })[] {
  const byKey = new Map(data.buildings.map((b) => [b.key, b]));
  const chain: Building[] = [];
  for (
    let b = byKey.get(key);
    b && !chain.includes(b);
    b = b.upgradeOf ? byKey.get(b.upgradeOf) : undefined
  )
    chain.unshift(b);
  let total = 0;
  return chain.map((b) => ({ ...b, total: (total += b.cost) }));
}

/** La cabaña de los otros granjeros: sólo en partidas multijugador, y va aparte. */
export const MULTIPLAYER = "Cabin";

/**
 * Los edificios de un constructor en el orden en que se leen: cada uno seguido de sus mejoras (Gallinero, el grande,
 * el de lujo; Establo…), y la cabaña del multijugador afuera.
 */
export function buildingsOf(
  data: FarmData,
  builder: Building["builder"],
): Building[] {
  const mine = data.buildings.filter(
    (b) => b.builder === builder && b.key !== MULTIPLAYER,
  );
  const out: Building[] = [];
  const add = (b: Building) => {
    out.push(b);
    for (const up of mine) if (up.upgradeOf === b.key) add(up);
  };
  for (const b of mine)
    if (!b.upgradeOf || !mine.some((x) => x.key === b.upgradeOf)) add(b);
  return out;
}

/** Hasta cuánto se vende un animal: con la amistad al máximo (1000), el precio base × 1,3. */
export const maxSellPrice = (a: Animal): number => Math.round(a.sell * 1.3);
