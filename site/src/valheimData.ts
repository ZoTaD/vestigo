/**
 * Datos de la sección Valheim (2026-09-24).
 *
 * `games/valheim/data/site/*.json` lo escribe `games/valheim/pipeline/site.py`
 * desde los archivos del juego instalado (ver
 * docs/design/2026-09-24-valheim-enciclopedia.md). Cada pestaña es un archivo
 * con todo resuelto —ingredientes, fuentes y usos ya traen nombre, ícono y
 * enlace—, así que acá no se cruza nada.
 *
 * Nada entra al bundle principal: cada archivo se pide al abrir su pestaña y
 * queda en memoria. El prerender precarga lo que usa cada página (`listos`),
 * igual que la Enciclopedia de PoE2.
 */
import type { Lang } from "./i18n";
import type { ValheimTab } from "./route";
import type { PlannerData } from "./valheimPlanner";

export interface Txt { en: string; es: string }

/** Un enlace a otra ficha, con lo necesario para dibujarlo. */
export interface Ref {
  slug: string | null;
  tab: ValheimTab | null;
  name: Txt;
  icon: string | null;
}
export interface Req extends Ref { amount: number; perLevel: number }

export type BiomeId = "meadows" | "blackforest" | "swamp" | "mountain" | "plains" | "ocean" | "mistlands" | "ashlands" | "deepnorth";
export const BIOME_IDS: BiomeId[] = ["meadows", "blackforest", "swamp", "mountain", "plains", "ocean", "mistlands", "ashlands", "deepnorth"];

export interface Source {
  kind: "craft" | "convert" | "drop" | "gather" | "farm" | "trader";
  station?: Ref | null;
  ref?: Ref | null;
  via?: Ref | null;
  name?: Txt | null;
  from?: string;
  how?: string;
  biomes?: BiomeId[];
  level?: number;
  amount?: number;
  min?: number;
  max?: number;
  chance?: number;
  price?: number;
  stack?: number;
  requiredKey?: string | null;
  time?: number | null;
  yield?: number | null;
}
export interface Use extends Ref { kind: "recipe" | "piece" | "convert"; amount?: number }
export interface Recipe { station: Ref | null; level: number; amount: number; req: Req[]; anyOne?: boolean }

export interface ItemRow {
  id: string;
  slug: string;
  tab: ValheimTab;
  name: Txt;
  icon: string | null;
  desc: Txt | null;
  tier: BiomeId | null;
  weight: number;
  stack: number;
  value: number | null;
  recipe: Recipe | null;
  sources: Source[];
  usedIn: Use[];
  /** Bono de set, efecto al equipar o al tomar, resistencias y cuánto frena (del juego). */
  effects?: ItemEffects;
  /** Las otras piezas del mismo set. */
  setPieces?: Ref[];
  /** Los jefes que se invocan con esto (la Campana → Fader), cuántos y dónde. */
  summons?: (Ref & { amount: number; altar: Txt | null })[];
  // Comidas
  food?: { hp: number; st: number; eitr: number; min: number; regen: number };
  focus?: "health" | "stamina" | "eitr" | "balanced";
  // Hidromieles
  effect?: "health" | "stamina" | "eitr" | "resist" | "other";
  chain?: { base: Ref; ferment: Ref | null; time: number | null; yield: number | null; station: Ref | null; req: Req[] };
  // Armas, herramientas, armaduras
  damage?: Record<string, number> | null;
  damagePerLevel?: Record<string, number> | null;
  cls?: string;
  maxQuality?: number;
  blockPower?: number | null;
  slot?: string;
  armor?: number | null;
  armorPerLevel?: number | null;
  setName?: string | null;
  toolKind?: string;
  // Materiales
  matKind?: "material" | "trophy";
  hows?: string[];
  usedFor?: ValheimTab[];
  biomes?: BiomeId[];
}

export interface PieceRow {
  id: string;
  slug: string;
  tab: "building";
  name: Txt;
  icon: string | null;
  desc: Txt | null;
  tool: string | null;
  category: number;
  categoryName: Txt | null;
  comfort: number | null;
  station: Ref | null;
  req: Req[];
  tier: BiomeId | null;
  /** Lo que procesa esta estación (el molino: cebada → harina de cebada). */
  processes?: { from: Ref; to: Ref; time: number | null; yield: number | null }[] | null;
  /** Lo que se fabrica o se construye con esta estación, por nivel. */
  crafts?: (Ref & { level: number })[] | null;
  /** Las piezas que la suben de nivel puestas cerca, en orden: la i-ésima deja la estación en `level`. */
  upgrades?: (Ref & { level: number; req: Req[]; station: Ref | null; tier: BiomeId | null })[] | null;
  /** Si es una mejora: la estación que sube de nivel. */
  extends?: Ref | null;
}

export interface Drop extends Ref { min: number; max: number; chance: number }

/**
 * Una foto de la wiki de Fandom (2026-09-24): el juego no trae fotos de
 * criaturas ni de lugares. CC BY-SA 3.0, con su autor y la página del archivo.
 */
export interface WikiPhoto { src: string; author: string | null; w: number; h: number }

/** Un lugar en la lista de su bioma: la tarjeta que lleva a su ficha. */
export interface Place extends Ref {
  type: Txt;
  photo: WikiPhoto | null;
  inhabitants: Ref[];
}

/**
 * La ficha de un lugar (mazmorra, estructura, veta). Qué lugares hay y quién
 * vive ahí sale de la wiki; el botín de sus cofres, del juego.
 */
export interface PlaceRow extends Place {
  slug: string;
  tab: "places";
  kind: string;
  biomes: BiomeId[];
  resources: Ref[];
  loot: Ref[];
  order: number;
}

/** Un efecto de estado del juego: bono de set, efecto al equipar o al tomar. */
export interface StatusEffect {
  name: Txt | null;
  tooltip: Txt | null;
  stats: Record<string, unknown> & { skills?: { skill: number; value: number }[]; resist?: Resist[]; damagePct?: Record<string, number> };
}
export interface Resist { type: string; mod: string }
export interface ItemEffects { set?: StatusEffect; setSize?: number | null; equip?: StatusEffect; consume?: StatusEffect; resist?: Resist[]; move?: number }

/** Una regla de aparición del mundo abierto (del juego). */
export interface SpawnRule {
  biomes: BiomeId[];
  day: boolean;
  night: boolean;
  group: [number, number];
  max: number | null;
  after?: Ref;
  envs?: string[];
  forest?: "in" | "out";
  ocean?: boolean;
  minAltitude?: number;
}
export interface CreatureEvent { name: Txt; biomes: BiomeId[]; after: Ref[]; until: Ref[] }
export interface Attack { name: Txt; damage: Record<string, number>; group?: Txt; cooldown?: number }
export interface Advice { en: string[]; es: string[] }

export interface CreatureRow {
  id: string;
  slug: string;
  tab: "creatures";
  name: Txt;
  icon: string | null;
  health: number | null;
  biomes: BiomeId[];
  boss: boolean;
  weak: string[];
  resist: string[];
  immune: string[];
  drops: Drop[];
  bossRef: Ref | null;
  photo?: WikiPhoto | null;
  places?: Ref[];
  /** La misma criatura con otra vida u otro botín (el enanogrís del Norte profundo). */
  variants?: { biomes: BiomeId[]; health: number | null; drops: Drop[] }[];
  tame?: { time: number | null; fed: number | null; startsTamed: boolean; commandable: boolean; saddle: Ref | null; eats: Ref[] };
  breed?: { max: number | null; love: number | null; pregnancy: number | null; offspring: Ref | null };
  spawns?: SpawnRule[];
  events?: CreatureEvent[];
  attacks?: Attack[];
  tips?: Advice | null;
}

export interface Tip { topic: Txt; label: Txt | null; text: Txt }

export interface BossRow {
  id: string;
  slug: string;
  tab: "bosses";
  name: Txt;
  icon: string | null;
  health: number | null;
  biome: BiomeId | null;
  order: number;
  art: string | null;
  photo?: WikiPhoto | null;
  places?: Ref[];
  attacks?: Attack[];
  advice?: Advice | null;
  power: { name: Txt | null; tooltip: Txt | null; cooldown: number | null } | null;
  weak: string[];
  resist: string[];
  immune: string[];
  summon: { item: Ref | null; amount: number; altar: Txt | null; sources: Source[] };
  drops: Drop[];
  creature: Ref | null;
  tips: Tip[];
}

export interface BiomeRow {
  id: BiomeId;
  slug: BiomeId;
  tab: "biomes";
  name: Txt;
  art: string;
  env: { cold?: boolean; freezing?: boolean; wet?: boolean; coldAtNight?: boolean; freezingAtNight?: boolean };
  /** `passive`: no ataca (el recuadro "passive" del bioma en la wiki). */
  creatures: (Ref & { health: number | null; weak: string[]; resist: string[]; immune: string[]; passive?: boolean })[];
  resources: (Ref & { how: string[] })[];
  /** Lo que sueltan las criaturas del bioma, con quién lo suelta. */
  creatureDrops?: (Ref & { from: Ref[] })[];
  /** Botín al azar de cofres y vasijas de la zona (no es un recurso del bioma). */
  loot?: Ref[];
  /** Lo que se puede plantar acá. */
  plant?: Ref[];
  /** Mazmorras y lugares, de la wiki. */
  places?: Place[];
  /** Los ataques a la base que pueden pasar en el bioma (del juego). */
  events?: { name: Txt; after: Ref[]; until: Ref[]; creatures: Ref[] }[];
  foods: (Ref & { food: { hp: number; st: number; eitr: number; min: number; regen: number } })[];
  gear: Record<"weapons" | "armor" | "foods" | "meads", number>;
  boss: (Ref & { art: string | null }) | null;
  tips: Tip[];
}

/** `art`: biomas y jefes, que no tienen ícono de inventario, llevan su ilustración. */
export interface IndexEntry { slug: string; tab: ValheimTab; en: string; es: string; icon: string | null; art?: string; photo?: string }

export interface TabRows {
  foods: ItemRow[];
  meads: ItemRow[];
  weapons: ItemRow[];
  armor: ItemRow[];
  tools: ItemRow[];
  materials: ItemRow[];
  building: PieceRow[];
  creatures: CreatureRow[];
  biomes: BiomeRow[];
  places: PlaceRow[];
  bosses: BossRow[];
}
export type AnyRow = TabRows[ValheimTab][number];

const archivos = import.meta.glob<{ default: unknown }>("@valheim/*.json");
const pedidos = new Map<string, Promise<unknown>>();
const listos = new Map<string, unknown>();

function load<T>(name: string): Promise<T> {
  let p = pedidos.get(name);
  if (!p) {
    const key = Object.keys(archivos).find((k) => k.endsWith(`/${name}.json`));
    if (!key) return Promise.reject(new Error(`sin datos: ${name}`));
    p = archivos[key]().then((m) => {
      listos.set(name, m.default);
      return m.default;
    });
    pedidos.set(name, p);
  }
  return p as Promise<T>;
}

export const loadTab = <T extends ValheimTab>(tab: T): Promise<TabRows[T]> => load<TabRows[T]>(tab);
export const peekTab = <T extends ValheimTab>(tab: T): TabRows[T] | null => (listos.get(tab) as TabRows[T] | undefined) ?? null;
export const loadIndex = () => load<IndexEntry[]>("index");
export const peekIndex = (): IndexEntry[] | null => (listos.get("index") as IndexEntry[] | undefined) ?? null;
/** El grafo del Planificador (`pipeline/planner.py`): sólo lo pide esa pestaña. */
export const loadPlanner = () => load<PlannerData>("planner");
export const peekPlanner = (): PlannerData | null => (listos.get("planner") as PlannerData | undefined) ?? null;

/**
 * Dónde se hace algo: la estación de su receta, la de su malta (hidromieles), la
 * de su conversión (horno, estación de cocina, fundición) o la de la pieza.
 * Muchas comidas no tienen receta: se cocinan convirtiendo en el horno.
 */
export function stationOf(r: AnyRow): Ref | null {
  const it = r as ItemRow;
  const pc = r as PieceRow;
  return it.recipe?.station ?? it.chain?.station ?? it.sources?.find((s) => s.kind === "convert")?.station ?? pc.station ?? null;
}

export const tx = (t: Txt | null | undefined, lang: Lang): string => (t ? (lang === "es" ? t.es || t.en : t.en) : "");
/** Para buscar sin tildes ni mayúsculas: "Tuetano" encuentra "Tuétano". */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/**
 * Buscar en el índice por nombre en los dos idiomas, sin tildes: primero lo que
 * empieza con el texto, después lo que lo contiene. Lo comparten el buscador de
 * la portada de Valheim y el de la barra de arriba.
 */
export function searchIndex(index: IndexEntry[], q: string, lang: Lang, max = 14): IndexEntry[] {
  const f = fold(q.trim());
  if (f.length < 2) return [];
  const starts: IndexEntry[] = [], has: IndexEntry[] = [];
  for (const e of index) {
    const n = fold(lang === "es" ? e.es : e.en), o = fold(lang === "es" ? e.en : e.es);
    if (n.startsWith(f)) starts.push(e);
    else if (n.includes(f) || o.includes(f)) has.push(e);
  }
  return [...starts, ...has].slice(0, max);
}
export const iconUrl = (icon: string | null | undefined) => (icon ? `/valheim/icons/${icon}.webp` : "");
export const artUrl = (art: string | null | undefined) => (art ? `/valheim/art/${art}.webp` : "");
/** Los textos del juego traen marcas de color de Unity (`<color=yellow>`): afuera. */
export const clean = (s: string): string => s.replace(/<\/?color[^>]*>/gi, "").replace(/<\/?b>/gi, "");
