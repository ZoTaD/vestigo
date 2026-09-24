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
export interface Recipe { station: Ref | null; level: number; amount: number; req: Req[] }

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
}

export interface Drop extends Ref { min: number; max: number; chance: number }

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
  creatures: (Ref & { health: number | null; weak: string[]; resist: string[]; immune: string[] })[];
  resources: (Ref & { how: string[] })[];
  foods: (Ref & { food: { hp: number; st: number; eitr: number; min: number; regen: number } })[];
  gear: Record<"weapons" | "armor" | "foods" | "meads", number>;
  boss: (Ref & { art: string | null }) | null;
  tips: Tip[];
}

/** `art`: biomas y jefes, que no tienen ícono de inventario, llevan su ilustración. */
export interface IndexEntry { slug: string; tab: ValheimTab; en: string; es: string; icon: string | null; art?: string }

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
export const iconUrl = (icon: string | null | undefined) => (icon ? `/valheim/icons/${icon}.webp` : "");
export const artUrl = (art: string | null | undefined) => (art ? `/valheim/art/${art}.webp` : "");
/** Los textos del juego traen marcas de color de Unity (`<color=yellow>`): afuera. */
export const clean = (s: string): string => s.replace(/<\/?color[^>]*>/gi, "").replace(/<\/?b>/gi, "");
