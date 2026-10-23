/**
 * Minas y combate de Stardew Valley (etapa 3, tarea 6): la forma de `mines.json` (`games/stardew/tools/mines_data.py`),
 * la vista y el orden que se eligen en la pestaña, cómo viajan en la dirección (`?v=weapons&sort=crit&type=dagger`) y
 * las listas ya ordenadas.
 *
 * Los ids de lo que no es un objeto común llevan su tipo adelante, como en el juego: `(W)` armas, `(B)` botas, `(TR)`
 * baratijas, `(H)` sombreros y `(O)` objetos (los premios de los cofres). Los objetos de las listas de botín, minerales y
 * anillos van sin prefijo y con su nombre en `refs`.
 */

type Lang = "en" | "es";
type Pair = [en: string, es: string];
/** Un objeto nombrado, igual que `Ref` de data.ts: slug, slug en español, nombres y tamaño del sprite. */
type Ref = [slug: string, slugEs: string, en: string, es: string, w: number, h: number];

/** Dónde se compra: la tienda (el Gremio de Aventureros), el precio y el piso que hay que haber alcanzado. */
export interface GearShop {
  shop: Pair;
  price: number;
  floor: number | null;
  /** "galaxySword": sólo después de conseguir la Espada galáctica. */
  needs?: string;
}

export interface Weapon {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  /** 0 espada de estocada, 1 daga, 2 maza, 3 espada, 4 tirachinas (`Data/Weapons`). */
  type: number;
  typeName: Pair;
  dmg: [min: number, max: number];
  speed: number;
  crit: [chance: number, mult: number];
  knockback: number;
  precision: number;
  defense: number;
  aoe: number;
  /** En qué pisos sale en los cofres y barriles de las Minas: el piso de referencia y el mínimo (-1 sin mínimo). */
  floors: [base: number, min: number] | null;
  shop: GearShop | null;
  sprite: number;
}

export interface Boots {
  id: string;
  name: Pair;
  desc: Pair;
  price: number;
  defense: number;
  immunity: number;
  shop: GearShop | null;
}

export interface Ring {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  price: number;
}

export interface Trinket {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  /** Si la sueltan los monstruos (con la maestría de Combate). */
  drops: boolean;
  sprite: number;
}

/** Un lugar donde sale un monstruo: la zona y sus pisos (hasta null es sin fondo; null entero, un lugar sin pisos). */
export interface MonsterPlace {
  zone: string;
  floors: [from: number, to: number | null] | null;
}

export interface Monster {
  key: string;
  slug: string;
  slugEs: string;
  name: Pair;
  hp: number;
  dmg: number;
  def: number;
  speed: number;
  xp: number;
  coins: [number, number];
  /** Id del objeto y probabilidad (0 a 1); el mismo objeto puede venir dos veces (dos tiradas). */
  loot: [id: string, chance: number][];
  where: MonsterPlace[];
  /** Si tiene versión peligrosa (después del desafío del Sr. Qi). */
  dangerous: boolean;
  /** La clave de su meta del Gremio de Aventureros (`slayer`), si tiene. */
  slayer: string | null;
  /** Ancho y alto del sprite, en px del juego. */
  sprite: [w: number, h: number];
}

export interface Zone {
  key: string;
  name: Pair;
  floors: [from: number, to: number | null] | null;
  monsters: string[];
  ores: string[];
  note?: Pair;
}

export interface Chest {
  floor: number;
  item: string;
  name: Pair;
  /** Con los cofres remezclados, el premio sale al azar de estos. */
  remixed?: string[];
}

/** Una meta del Gremio de Aventureros: cuántos hay que matar entre todos los de `targets`, y el premio. */
export interface SlayerGoal {
  name: Pair;
  count: number;
  targets: string[];
  reward: string | null;
  rewardName: Pair | null;
  /** La de los duendes de magma: Gil da el teléfono de Marlon, no un objeto. */
  phone?: boolean;
}

export interface MinesData {
  weapons: Weapon[];
  boots: Boots[];
  rings: Ring[];
  trinkets: Trinket[];
  monsters: Monster[];
  zones: Zone[];
  chests: Chest[];
  slayer: Record<string, SlayerGoal>;
  elevator: { every: number; last: number };
  refs: Record<string, Ref>;
}

// --- Lo que se elige y la dirección ---------------------------------------------------------------------------------

/** Las cinco vistas: Pisos (se abre en esta), Monstruos, Armas, Anillos y baratijas, Botas. */
export const VIEWS = ["floors", "monsters", "weapons", "gear", "boots"] as const;
export type MinesView = (typeof VIEWS)[number];
/** Cómo se ordenan las armas: daño medio, velocidad o crítico (probabilidad por multiplicador). */
export const SORTS = ["dmg", "speed", "crit"] as const;
export type WeaponSort = (typeof SORTS)[number];
/** Los tipos del filtro: las dos clases de espada van juntas, como las nombra el juego. */
export const WEAPON_TYPES = { all: [], sword: [0, 3], dagger: [1], club: [2], slingshot: [4] } as const satisfies Record<string, readonly number[]>;
export type WeaponType = keyof typeof WEAPON_TYPES;

export interface MinesState {
  view: MinesView;
  sort: WeaponSort;
  type: WeaponType;
}

export const DEFAULT_MINES_STATE: MinesState = { view: "floors", sort: "dmg", type: "all" };

const pick = <T extends string>(v: string | null, ok: readonly T[], fallback: T): T => (v && (ok as readonly string[]).includes(v) ? (v as T) : fallback);

/** El estado escrito en la dirección; lo que no se conoce queda en su valor por defecto. */
export function readMinesState(search: string): MinesState {
  const p = new URLSearchParams(search);
  return {
    view: pick(p.get("v"), VIEWS, DEFAULT_MINES_STATE.view),
    sort: pick(p.get("sort"), SORTS, DEFAULT_MINES_STATE.sort),
    type: pick(p.get("type"), Object.keys(WEAPON_TYPES) as WeaponType[], DEFAULT_MINES_STATE.type),
  };
}

/** Lo contrario: el `?…` del estado, sólo con lo que no es el valor por defecto. El orden y el tipo sólo en Armas. */
export function writeMinesState(s: MinesState): string {
  const p = new URLSearchParams();
  if (s.view !== DEFAULT_MINES_STATE.view) p.set("v", s.view);
  if (s.view === "weapons") {
    if (s.sort !== DEFAULT_MINES_STATE.sort) p.set("sort", s.sort);
    if (s.type !== DEFAULT_MINES_STATE.type) p.set("type", s.type);
  }
  const out = p.toString();
  return out ? `?${out}` : "";
}

// --- Las listas -----------------------------------------------------------------------------------------------------

const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];

export const isSlingshot = (w: Weapon): boolean => w.type === 4;
/** El daño medio de un golpe. Las tirachinas no tienen daño propio (lo pone la munición): van al final. */
export const avgDamage = (w: Weapon): number => (isSlingshot(w) ? -1 : (w.dmg[0] + w.dmg[1]) / 2);
/** Lo que suma el crítico: probabilidad por multiplicador. */
export const critValue = (w: Weapon): number => w.crit[0] * w.crit[1];

const SORT_VALUE: Record<WeaponSort, (w: Weapon) => number> = {
  dmg: avgDamage,
  // La velocidad de las tirachinas es otra cosa en los datos (308): al final, igual que su daño.
  speed: (w) => (isSlingshot(w) ? -Infinity : w.speed),
  crit: critValue,
};

/** Las armas del tipo elegido, de la mejor a la peor según el orden; empatadas, por daño medio y después por nombre. */
export function weaponList(data: MinesData, sort: WeaponSort, type: WeaponType, lang: Lang): Weapon[] {
  const types: readonly number[] = WEAPON_TYPES[type];
  const value = SORT_VALUE[sort];
  return data.weapons
    .filter((w) => !types.length || types.includes(w.type))
    .sort((a, b) => value(b) - value(a) || avgDamage(b) - avgDamage(a) || say(a.name, lang).localeCompare(say(b.name, lang), lang));
}

/**
 * El botín sin repetir. Cada par id/probabilidad es una tirada aparte (`Monster.parseMonsterInfo`): por objeto, la
 * probabilidad de que caiga al menos uno, 1 − ∏(1 − p), y cuántas tiradas hay (hasta cuántos caen). Igual que la fuente
 * `{k:"monster"}` de la ficha del objeto (`relations.py`). De la más probable a la menos.
 */
export function lootRows(m: Monster): [id: string, chance: number, rolls: number][] {
  const none = new Map<string, number>();
  const rolls = new Map<string, number>();
  for (const [id, p] of m.loot) {
    none.set(id, (none.get(id) ?? 1) * (1 - Math.min(1, p)));
    rolls.set(id, (rolls.get(id) ?? 0) + 1);
  }
  return [...none.entries()].map(([id, q]): [string, number, number] => [id, 1 - q, rolls.get(id)!]).sort((a, b) => b[1] - a[1]);
}

/** El piso de las Minas donde un cofre da esta arma o estas botas, o null. */
export const chestFloorOf = (data: MinesData, id: string): number | null => data.chests.find((c) => c.item === id)?.floor ?? null;

/** Los cofres que caen en los pisos de una zona (sólo las tres de las Minas tienen). */
export function zoneChests(data: MinesData, z: Zone): Chest[] {
  if (!z.floors || !["mines1", "mines2", "mines3"].includes(z.key)) return [];
  const [from, to] = z.floors;
  return data.chests.filter((c) => c.floor >= from && (to == null || c.floor <= to));
}

/** El nombre de lo que da un cofre (o una meta del Gremio): arma, botas u objeto. */
export function gearName(data: MinesData, id: string, lang: Lang): string {
  const w = data.weapons.find((x) => x.id === id) ?? data.boots.find((x) => x.id === id);
  if (w) return say(w.name, lang);
  const r = data.refs[id.startsWith("(O)") ? id.slice(3) : id];
  if (r) return (lang === "es" && r[3]) || r[2];
  return data.chests.find((c) => c.item === id)?.name[lang === "es" ? 1 : 0] ?? id;
}

/** El slug de la ficha de Objetos de un id (los premios `(O)` y los objetos de las listas), o null si no tiene. */
export const itemSlug = (data: MinesData, id: string): string | null => data.refs[id.startsWith("(O)") ? id.slice(3) : id]?.[0] ?? null;

/**
 * La imagen de algo del combate: armas, botas, baratijas y sombreros en `/stardew/combat/` (`sprites_combate` de
 * sprites.py) y los objetos en `/stardew/items/`. La Llave de la Calavera no es un objeto con sprite: null.
 */
export function gearSprite(id: string): string | null {
  const m = /^\((W|B|TR|H|O)\)(.+)$/.exec(id);
  if (!m) return /^\d+$/.test(id) ? `/stardew/items/${id}.png` : null;
  const [, kind, n] = m;
  if (kind === "O") return `/stardew/items/${n}.png`;
  return `/stardew/combat/${{ W: "w", B: "b", TR: "tr", H: "h" }[kind]}-${n}.png`;
}

/** El sprite de un monstruo (`m-<slug>.png`). */
export const monsterSprite = (m: Monster): string => `/stardew/combat/m-${m.slug}.png`;

/** Cuánto se agranda un sprite para que entre en una caja de `w`×`h` px: siempre un múltiplo entero, al menos 1. */
export const pixelScale = (sw: number, sh: number, w: number, h: number): number => Math.max(1, Math.min(Math.floor(w / sw), Math.floor(h / sh)));

/**
 * Los monstruos en el orden en que se los encuentra: por la primera zona donde salen (en el orden de `zones`: las Minas
 * de arriba abajo, la Calavera, los pisos especiales y los lugares sin pisos) y, dentro de ella, por el primer piso.
 */
export function monsterOrder(data: MinesData): Monster[] {
  const rank = new Map(data.zones.map((z, i) => [z.key, i]));
  const first = (m: Monster): [number, number] => {
    let best: [number, number] = [Infinity, Infinity];
    for (const w of m.where) {
      const r: [number, number] = [rank.get(w.zone) ?? Infinity, w.floors?.[0] ?? 0];
      if (r[0] < best[0] || (r[0] === best[0] && r[1] < best[1])) best = r;
    }
    return best;
  };
  const keys = new Map(data.monsters.map((m) => [m, first(m)]));
  return [...data.monsters].sort((a, b) => {
    const [za, fa] = keys.get(a)!;
    const [zb, fb] = keys.get(b)!;
    return za - zb || fa - fb;
  });
}
