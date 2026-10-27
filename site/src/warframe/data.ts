/**
 * Los datos de Warframe que bajan las pestañas con fichas (2026-10-27): lo que escribe `games/warframe/tools/site_data.py`.
 *
 * - La lista liviana de cada pestaña (`list.json`), pedida una vez.
 * - Las fichas, repartidas en `WF_SHARDS` archivos por el hash del slug inglés (`f/NN.json`).
 * - Un mapa español → inglés repartido igual por el slug español (`es/NN.json`), para abrir en frío una ficha en español
 *   sin bajar la lista entera.
 *
 * Cada vez que llega algo que nombra objetos se anotan sus slugs en español en `route.ts`, que es lo que escribe los
 * enlaces. Nunca en el chunk del área: cada JSON es un `import()` aparte (regla 4 de CLAUDE.md). Dónde farmear, Mods y
 * el Mapa estelar (etapa 2) suman acá su lista y sus fichas.
 */
import { registerWfSlugs, slugify, type Route, type WfTab } from "../route";
import { WF_KINDS, type WfKind } from "../warframeCopy";
import { pzShardOf } from "../zomboid/shard";
import { once, shardedFichas } from "../zomboid/store";

/** `CHUNKS` de site_data.py: si se cambia uno se cambia el otro (lo prueba warframeData.test.ts). */
export const WF_SHARDS = 32;
const shard = (slug: string) => pzShardOf(slug, WF_SHARDS);

export type Lang = "en" | "es";
export type Pair = [en: string, es: string];

/** Una fila de `arsenal/list.json`. */
export interface ArsenalRow {
  slug: string;
  slugEs: string;
  name: Pair;
  img: string;
  kind: WfKind;
  prime: boolean;
  /** Rango de maestría. */
  mr: number;
}
/** Una fila de `relics/list.json`: la era y si está en el Vault. */
export interface RelicRow {
  slug: string;
  slugEs: string;
  /** Sin la palabra "Relic"/"Reliquia". */
  name: Pair;
  img: string;
  era: string;
  vaulted: boolean;
}

/** De dónde cae algo: una misión, un botín de bounty, "otro" (un jefe, una tienda), un enemigo o una reliquia. */
export type Source =
  /** `node`: la clave en `refs` de su nodo del mapa estelar (`node:<slug>`), si se sabe cuál es. */
  | { k: "mission"; where: string; rot: string | null; chance: number; node?: string }
  | { k: "bounty"; where: string; tier: string; stage: string; rot: string | null; chance: number }
  | { k: "other"; where: string; chance: number }
  | { k: "enemy"; who: string; eff: number; drop?: number; chance?: number }
  /** `relic`: el nombre de la reliquia ("Axi N3"), la clave en `refs`. */
  | { k: "relic"; relic: string; rarity: string; vaulted: boolean };

/**
 * Otra cosa nombrada por una ficha. `tab`/`slug`/`slugEs`/`img` son null cuando no es una página del sitio (se muestra sin
 * enlace). `bp`: es el plano principal de su objeto; la interfaz arma "X Blueprint" / "Plano de X".
 */
export interface Ref {
  tab: WfTab | null;
  slug: string | null;
  slugEs: string | null;
  name: Pair;
  img: string | null;
  bp?: true;
}
export type Refs = Record<string, Ref>;

export interface Part {
  name: Pair;
  /** `blueprint` es el plano principal: su nombre es el del objeto. */
  kind: "blueprint" | "part";
  n: number;
  sources: Source[];
  img?: string;
}
export interface Ingredient {
  ref: string;
  n: number;
}
export interface Recipe {
  credits: number;
  seconds: number;
  ingredients: Ingredient[];
}
/** Estadísticas de un arma (`damage` por tipo, en minúscula) o de un Warframe y su compañía. */
export interface Stats {
  health?: number;
  shield?: number;
  armor?: number;
  energy?: number;
  sprint?: number;
  damage?: [type: string, n: number][];
  total?: number;
  /** En porcentaje: 12 es 12 %. */
  crit?: number;
  critMult?: number;
  status?: number;
  fireRate?: number;
  magazine?: number;
  reload?: number;
  multishot?: number;
  trigger?: string;
}
export interface Ability {
  name: Pair;
  desc: Pair;
}
export interface ArsenalFicha {
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  kind: WfKind;
  img: string;
  mr: number;
  stats: Stats;
  abilities?: Ability[];
  passive?: Pair;
  parts: Part[];
  recipe: Recipe | null;
  refs: Refs;
}
export interface RelicReward {
  ref: string;
  rarity: string;
  /** Intacta, excepcional, impecable y radiante. */
  chances: [number, number, number, number];
}
export interface RelicFicha {
  slug: string;
  slugEs: string;
  name: Pair;
  era: string;
  vaulted: boolean;
  img: string;
  rewards: RelicReward[];
  sources: Source[];
  refs: Refs;
}

/** Una fila de `farming/list.json`: un recurso y los planetas donde cae (puede no tener ninguno). */
export interface FarmingRow {
  slug: string;
  slugEs: string;
  name: Pair;
  img: string;
  planets: Pair[];
}
export interface FarmingFicha {
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  img: string;
  planets: Pair[];
  sources: Source[];
  /** Las claves en `refs` de lo que lo pide: las recetas del Arsenal. */
  usedIn: string[];
  refs: Refs;
}
/** Una fila de `mods/list.json`. `rarity`, `polarity` y `compat` son null en los arcanos (y la rareza en 21 viejos). */
export interface ModRow {
  slug: string;
  slugEs: string;
  name: Pair;
  img: string;
  kind: "mod" | "arcane";
  type: string;
  rarity: string | null;
  polarity: string | null;
  compat: Pair | null;
}
export interface ModFicha {
  slug: string;
  slugEs: string;
  name: Pair;
  kind: "mod" | "arcane";
  type: string;
  rarity: string | null;
  polarity: string | null;
  drain: number | null;
  maxRank: number;
  compat: Pair | null;
  /** El efecto de cada rango, del 0 al máximo. */
  ranks: Pair[];
  desc?: Pair;
  img: string;
  sources: Source[];
  refs: Refs;
}

/** Una fila de `star-chart/list.json`: un nodo del mapa estelar. `pi` es el índice del planeta en el export. */
export interface StarRow {
  slug: string;
  slugEs: string;
  name: Pair;
  planet: Pair;
  pi: number;
  /** El tipo de misión y la facción en inglés, como en los datos (`missionType`/`faction` de warframeCopy.ts los nombran). */
  type: string;
  faction: string;
  lv: [min: number, max: number];
  /** El rango de maestría que pide (0: ninguno). */
  mr: number;
  /** Es un sector oscuro. */
  dark: boolean;
  /** Lo de menor chance de su mejor tabla (la rotación C o la única): "lo que más da". */
  best: { name: Pair; chance: number } | null;
}
/** Una tabla de recompensas de un nodo: una rotación (A/B/C), un rótulo ("Caches") o los dos, o ninguno (una tabla sola). */
export interface StarRewards {
  label: string | null;
  rot: string | null;
  items: { ref: string; chance: number }[];
}
export interface StarFicha extends Omit<StarRow, "best"> {
  rewards: StarRewards[];
  /** Las claves en `refs` de los recursos del planeta (las fichas de Dónde farmear). */
  resources: string[];
  refs: Refs;
}

/** Los tipos de `mastery/list.json` (el Arsenal sin exaltadas, más los Necramechs). */
export type MasteryKind = "warframe" | "primary" | "secondary" | "melee" | "archwing" | "companion" | "necramech";
export const MASTERY_KINDS: MasteryKind[] = ["warframe", "primary", "secondary", "melee", "archwing", "companion", "necramech"];
/** Una fila de `mastery/list.json`: algo que da maestría. `slug`/`slugEs` son los de su ficha del Arsenal; `xp` lo que suma al llegar a `rank`. */
export interface MasteryRow {
  slug: string;
  slugEs: string;
  name: Pair;
  img: string | null;
  kind: MasteryKind;
  rank: 30 | 40;
  xp: number;
}
// Anota los slugs del Arsenal al cargar (como el Vault): en frío, los enlaces de la lista salen con el slug del idioma.
const mastery = once<MasteryRow[]>(() =>
  import("@warframe/mastery/list.json").then((m) => {
    const list = m.default as MasteryRow[];
    noteSlugs("arsenal", list);
    return { default: list };
  }),
);
/** La lista de Maestría, en su propio chunk (regla 4 de CLAUDE.md). */
export const loadMastery = (): Promise<MasteryRow[]> => mastery.load();
export const peekMastery = (): MasteryRow[] | null => mastery.peek();

/** El estado de un Prime en `prime-vault/list.json` (la regla de Vault de la etapa 1, objeto por objeto). */
export type VaultStatus = "available" | "vaulted" | "partial" | "norelics";
export const VAULT_STATUSES: VaultStatus[] = ["available", "vaulted", "partial", "norelics"];
/** Una fila de `prime-vault/list.json`: un Prime y su estado. `slug`/`slugEs` son los de su ficha del Arsenal. */
export interface VaultRow {
  slug: string;
  slugEs: string;
  name: Pair;
  img: string;
  kind: WfKind;
  status: VaultStatus;
}
/** Un cambio de `prime-vault/history.json` (el más nuevo primero): `from` es `null` si el Prime es nuevo. */
export interface VaultEvent {
  date: string;
  slug: string;
  from: VaultStatus | null;
  to: VaultStatus;
}
/** Lo que vendió Baro en una visita de `baro/history.json`. `unique` es el `uniqueName` de la API; `ref`, su ficha si tiene. */
export interface BaroItem {
  unique: string;
  name: Pair;
  ducats: number;
  credits: number;
  ref: { tab: WfTab; slug: string; slugEs: string; img: string | null } | null;
}
export interface BaroVisit {
  start: string;
  end: string;
  location: Pair;
  items: BaroItem[];
}
/** `baro/history.json`: las visitas anotadas, la más nueva primero. */
export interface BaroHistory {
  visits: BaroVisit[];
}
const vault = once<{ list: VaultRow[]; history: VaultEvent[] }>(() =>
  Promise.all([import("@warframe/prime-vault/list.json"), import("@warframe/prime-vault/history.json")]).then(([l, h]) => {
    const list = l.default as VaultRow[];
    noteSlugs("arsenal", list);
    return { default: { list, history: h.default as VaultEvent[] } };
  }),
);
/** El Prime Vault (la lista y sus cambios), en su propio chunk. */
export const loadVault = () => vault.load();
export const peekVault = () => vault.peek();
const baro = once<BaroHistory>(() =>
  import("@warframe/baro/history.json").then((m) => {
    const h = m.default as BaroHistory;
    noteRefs(Object.fromEntries(h.visits.flatMap((v) => v.items.flatMap((it) => (it.ref ? [[it.unique, { ...it.ref, name: it.name }]] : [])))));
    return { default: h };
  }),
);
/** El historial de Baro Ki'Teer, en su propio chunk. */
export const loadBaroHistory = (): Promise<BaroHistory> => baro.load();
export const peekBaroHistory = (): BaroHistory | null => baro.peek();

/** Lo que trae cada pestaña con fichas. */
export interface ListOf {
  arsenal: ArsenalRow[];
  relics: RelicRow[];
  farming: FarmingRow[];
  mods: ModRow[];
  "star-chart": StarRow[];
}
export interface FichaOf {
  arsenal: ArsenalFicha;
  relics: RelicFicha;
  farming: FarmingFicha;
  mods: ModFicha;
  "star-chart": StarFicha;
}
export type DataTab = keyof ListOf;
export const DATA_TABS: DataTab[] = ["arsenal", "relics", "farming", "mods", "star-chart"];
export const isDataTab = (t: string | undefined): t is DataTab => !!t && (DATA_TABS as string[]).includes(t);

const lists = {
  arsenal: once<ArsenalRow[]>(() => import("@warframe/arsenal/list.json")),
  relics: once<RelicRow[]>(() => import("@warframe/relics/list.json")),
  farming: once<FarmingRow[]>(() => import("@warframe/farming/list.json")),
  mods: once<ModRow[]>(() => import("@warframe/mods/list.json")),
  "star-chart": once<StarRow[]>(() => import("@warframe/star-chart/list.json")),
};
const fichas = {
  arsenal: shardedFichas<ArsenalFicha>(import.meta.glob<{ default: Record<string, ArsenalFicha> }>("@warframe/arsenal/f/*.json"), shard),
  relics: shardedFichas<RelicFicha>(import.meta.glob<{ default: Record<string, RelicFicha> }>("@warframe/relics/f/*.json"), shard),
  farming: shardedFichas<FarmingFicha>(import.meta.glob<{ default: Record<string, FarmingFicha> }>("@warframe/farming/f/*.json"), shard),
  mods: shardedFichas<ModFicha>(import.meta.glob<{ default: Record<string, ModFicha> }>("@warframe/mods/f/*.json"), shard),
  "star-chart": shardedFichas<StarFicha>(import.meta.glob<{ default: Record<string, StarFicha> }>("@warframe/star-chart/f/*.json"), shard),
};
const esToEn = {
  arsenal: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/arsenal/es/*.json"), shard),
  relics: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/relics/es/*.json"), shard),
  farming: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/farming/es/*.json"), shard),
  mods: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/mods/es/*.json"), shard),
  "star-chart": shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/star-chart/es/*.json"), shard),
};

/** Anota los slugs en español de lo que cambia: la dirección de una ficha en español y los enlaces que la nombran. */
function noteSlugs(tab: WfTab, items: Iterable<{ slug: string | null; slugEs: string | null }>): void {
  const map: Record<string, string> = {};
  for (const it of items) if (it.slug && it.slugEs && it.slug !== it.slugEs) map[it.slug] = it.slugEs;
  if (Object.keys(map).length) registerWfSlugs({ [tab]: map });
}
/** Anota los slugs de una lista y los de todo lo que nombra una ficha, tab por tab. */
function noteRefs(refs: Refs): void {
  const byTab = new Map<WfTab, Ref[]>();
  for (const r of Object.values(refs)) if (r.tab) (byTab.get(r.tab) ?? byTab.set(r.tab, []).get(r.tab)!).push(r);
  for (const [tab, list] of byTab) noteSlugs(tab, list);
}

const noted = new Set<DataTab>();
function noteList<T extends DataTab>(tab: T, list: ListOf[T]): ListOf[T] {
  if (!noted.has(tab)) {
    noted.add(tab);
    noteSlugs(tab, list);
  }
  return list;
}

export function peekList<T extends DataTab>(tab: T): ListOf[T] | null {
  const list = lists[tab].peek() as ListOf[T] | null;
  return list && noteList(tab, list);
}
export const loadList = <T extends DataTab>(tab: T): Promise<ListOf[T]> => (lists[tab].load() as Promise<ListOf[T]>).then((l) => noteList(tab, l));

function note<T extends DataTab>(tab: T, f: FichaOf[T] | null): FichaOf[T] | null {
  if (f) {
    noteSlugs(tab, [f]);
    noteRefs(f.refs);
  }
  return f;
}
export const peekFicha = <T extends DataTab>(tab: T, slug: string): FichaOf[T] | null | undefined => {
  const f = (fichas[tab] as ReturnType<typeof shardedFichas<FichaOf[T]>>).peek(slug);
  return f ? note(tab, f) : f;
};
export const loadFicha = <T extends DataTab>(tab: T, slug: string): Promise<FichaOf[T] | null> =>
  (fichas[tab] as ReturnType<typeof shardedFichas<FichaOf[T]>>).load(slug).then((f) => note(tab, f));

/**
 * Lo que una dirección con ficha necesita antes de dibujarse: la ficha, o la lista si no hay ficha (o no existe). En
 * español y en frío el slug todavía no se conoce: se busca en su pedacito del mapa y se anota, así la dirección leída de
 * nuevo ya es la ficha. Una pestaña sin lista propia (la portada) no baja nada.
 */
export async function preloadRoute(route: Route): Promise<void> {
  const tab = route.wfSection;
  if (!isDataTab(tab)) return;
  if (route.detail) {
    let slug = route.detail;
    if (route.lang === "es") {
      const en = await esToEn[tab].load(slug).catch(() => null);
      if (en) {
        registerWfSlugs({ [tab]: { [en]: slug } });
        slug = en;
      }
    }
    if (await loadFicha(tab, slug)) return;
  }
  await loadList(tab);
}

export const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];

/** El nombre de una referencia en el idioma pedido. */
export const refName = (r: Ref, lang: Lang): string => say(r.name, lang);

/** Un tiempo en segundos, en las dos unidades mayores que lo componen: "3 d", "1 d 12 h", "12 min". */
export function duration(seconds: number, u: { d: string; h: string; min: string; s: string }): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d} ${u.d}`);
  if (h) parts.push(`${h} ${u.h}`);
  if (m && !d) parts.push(`${m} ${u.min}`);
  if (!parts.length) parts.push(`${Math.round(seconds)} ${u.s}`);
  return parts.join(" ");
}

/** Mayor chance primero. Una fuente sin cifra (una reliquia) va después, por rareza y con las del Vault al final. */
const RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
/** El puntaje de una fuente: la probabilidad efectiva de un enemigo (la que muestra la tabla), la chance del resto; una reliquia, 0. */
export const scoreOf = (s: Source): number => (s.k === "enemy" ? s.eff : "chance" in s ? s.chance : 0);
export function sortSources<T extends Source>(list: readonly T[]): T[] {
  const score = scoreOf;
  return [...list].sort((a, b) => {
    if (a.k === "relic" && b.k === "relic") return +a.vaulted - +b.vaulted || (RARITY_RANK[a.rarity] ?? 9) - (RARITY_RANK[b.rarity] ?? 9) || a.relic.localeCompare(b.relic, "en", { numeric: true });
    return score(b) - score(a);
  });
}

// --- Filtros de la lista del Arsenal y de Reliquias -----------------------------------------------------------------

export interface ArsenalFilters {
  kind: WfKind | null;
  prime: boolean;
}
export const noArsenalFilters: ArsenalFilters = { kind: null, prime: false };

/** `?kind=melee&prime=1` → filtros. Lo que no se entiende se ignora. */
export function readArsenalFilters(search: string): ArsenalFilters {
  const q = new URLSearchParams(search);
  const kind = q.get("kind");
  return { kind: (WF_KINDS as string[]).includes(kind ?? "") ? (kind as WfKind) : null, prime: q.get("prime") === "1" };
}
export function writeArsenalFilters(f: ArsenalFilters): string {
  const q = new URLSearchParams();
  if (f.kind) q.set("kind", f.kind);
  if (f.prime) q.set("prime", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Texto sin mayúsculas ni acentos, para buscar. */
export const fold = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** El orden del Arsenal: por tipo (el de los chips) y, dentro, por nombre en el idioma. */
export function sortArsenal<T extends { kind: WfKind; name: Pair }>(rows: readonly T[], lang: Lang): T[] {
  const rank = (k: WfKind) => WF_KINDS.indexOf(k);
  return [...rows].sort((a, b) => rank(a.kind) - rank(b.kind) || say(a.name, lang).localeCompare(say(b.name, lang), lang));
}

export function filterArsenal(rows: readonly ArsenalRow[], f: ArsenalFilters, query: string, lang: Lang): ArsenalRow[] {
  const q = fold(query.trim());
  return rows.filter((r) => (!f.kind || r.kind === f.kind) && (!f.prime || r.prime) && (!q || fold(r.name[0]).includes(q) || fold(r.name[1]).includes(q)));
}

export const ERAS = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Vanguard"] as const;
export type Era = (typeof ERAS)[number];
export interface RelicFilters {
  era: Era | null;
  /** Sólo las que todavía caen en misiones. */
  open: boolean;
}
export const noRelicFilters: RelicFilters = { era: null, open: false };
export function readRelicFilters(search: string): RelicFilters {
  const q = new URLSearchParams(search);
  const era = q.get("era");
  return { era: (ERAS as readonly string[]).includes(era ?? "") ? (era as Era) : null, open: q.get("open") === "1" };
}
export function writeRelicFilters(f: RelicFilters): string {
  const q = new URLSearchParams();
  if (f.era) q.set("era", f.era);
  if (f.open) q.set("open", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}
export function filterRelics(rows: readonly RelicRow[], f: RelicFilters, query: string): RelicRow[] {
  const q = fold(query.trim());
  return rows.filter((r) => (!f.era || r.era === f.era) && (!f.open || !r.vaulted) && (!q || fold(r.name[0]).includes(q)));
}

// --- Filtros de Dónde farmear y de Mods ------------------------------------------------------------------------------

/** Los recursos que caen en un planeta (por su nombre en inglés) y el buscador. */
export function filterFarming(rows: readonly FarmingRow[], planet: string | null, query: string): FarmingRow[] {
  const q = fold(query.trim());
  return rows.filter((r) => (!planet || r.planets.some((p) => p[0] === planet)) && (!q || fold(r.name[0]).includes(q) || fold(r.name[1]).includes(q)));
}
/** Los planetas que aparecen en la lista, del que tiene más recursos al que tiene menos. */
export function farmingPlanets(rows: readonly FarmingRow[]): Pair[] {
  const seen = new Map<string, { pair: Pair; n: number }>();
  for (const r of rows) for (const p of r.planets) (seen.get(p[0]) ?? seen.set(p[0], { pair: p, n: 0 }).get(p[0])!).n++;
  return [...seen.values()].sort((a, b) => b.n - a.n || a.pair[0].localeCompare(b.pair[0])).map((v) => v.pair);
}
export function readPlanet(search: string): string | null {
  return new URLSearchParams(search).get("planet");
}
export function writePlanet(planet: string | null): string {
  return planet ? `?${new URLSearchParams({ planet })}` : "";
}

export interface ModFilters {
  kind: ModRow["kind"] | null;
  type: string | null;
  rarity: string | null;
  polarity: string | null;
}
export const noModFilters: ModFilters = { kind: null, type: null, rarity: null, polarity: null };
export const MOD_RARITIES = ["Common", "Uncommon", "Rare", "Legendary"] as const;
export function readModFilters(search: string): ModFilters {
  const q = new URLSearchParams(search);
  const kind = q.get("kind");
  // Los arcanos no tienen tipo ni polaridad (sus chips no se dibujan): un filtro así dejaría la lista vacía sin salida.
  const arcane = kind === "arcane";
  return { kind: kind === "mod" || arcane ? kind : null, type: arcane ? null : q.get("type"), rarity: q.get("rarity"), polarity: arcane ? null : q.get("polarity") };
}
export function writeModFilters(f: ModFilters): string {
  const q = new URLSearchParams();
  for (const k of ["kind", "type", "rarity", "polarity"] as const) if (f[k]) q.set(k, f[k]!);
  const s = q.toString();
  return s ? `?${s}` : "";
}
export function filterMods(rows: readonly ModRow[], f: ModFilters, query: string): ModRow[] {
  const q = fold(query.trim());
  return rows.filter(
    (r) =>
      (!f.kind || r.kind === f.kind) &&
      (!f.type || r.type === f.type) &&
      (!f.rarity || r.rarity === f.rarity) &&
      (!f.polarity || r.polarity === f.polarity) &&
      (!q || fold(r.name[0]).includes(q) || fold(r.name[1]).includes(q)),
  );
}
/** Los tipos que aparecen en la lista (el más numeroso primero), para los chips. */
export function modTypes(rows: readonly ModRow[], kind: ModRow["kind"] | null): string[] {
  const n = new Map<string, number>();
  for (const r of rows) if (!kind || r.kind === kind) n.set(r.type, (n.get(r.type) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
}

// --- Mapa estelar: el orden de los planetas y los filtros ------------------------------------------------------------

/** Las órbitas, en el orden del juego (del sol hacia afuera). */
export const STAR_ORBITS = ["Mercury", "Venus", "Earth", "Mars", "Ceres", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Eris", "Sedna"] as const;
/** Las lunas, dibujadas al lado de su planeta y listadas después de él. */
export const STAR_MOONS: Record<string, string> = { Lua: "Earth", Phobos: "Mars", Deimos: "Mars", Europa: "Jupiter" };

/** El slug de un planeta en la dirección (`?planet=kuva-fortress`): su nombre en inglés. */
export const planetSlug = (planet: Pair): string => slugify(planet[0]);

/** Un planeta (o luna, o lugar) con lo que resume la lista: cuántos nodos, el nivel y los tipos de misión que tiene. */
export interface StarPlanet {
  slug: string;
  name: Pair;
  pi: number;
  n: number;
  lo: number;
  hi: number;
  /** Los tipos de misión, el más numeroso primero. */
  types: string[];
}

/** El lugar de un planeta en la lista: cada órbita seguida de sus lunas, y después lo demás por su índice del export. */
function planetRank(name: string, pi: number): number {
  const host = STAR_MOONS[name] ?? name;
  const orbit = (STAR_ORBITS as readonly string[]).indexOf(host);
  if (orbit < 0) return 1000 + pi;
  return orbit * 10 + (host === name ? 0 : 1 + Object.keys(STAR_MOONS).indexOf(name));
}

/** Los planetas de la lista, en el orden del juego. */
export function starPlanets(rows: readonly StarRow[]): StarPlanet[] {
  const by = new Map<string, StarPlanet>();
  for (const r of rows) {
    const slug = planetSlug(r.planet);
    let p = by.get(slug);
    if (!p) by.set(slug, (p = { slug, name: r.planet, pi: r.pi, n: 0, lo: r.lv[0], hi: r.lv[1], types: [] }));
    p.n++;
    p.lo = Math.min(p.lo, r.lv[0]);
    p.hi = Math.max(p.hi, r.lv[1]);
  }
  return [...by.values()]
    .sort((a, b) => planetRank(a.name[0], a.pi) - planetRank(b.name[0], b.pi))
    .map((p) => ({ slug: p.slug, name: p.name, pi: p.pi, n: p.n, lo: p.lo, hi: p.hi, types: starTypes(rows.filter((r) => planetSlug(r.planet) === p.slug)) }));
}

/** Los tipos de misión de unos nodos, el más numeroso primero. */
export function starTypes(rows: readonly StarRow[]): string[] {
  const n = new Map<string, number>();
  for (const r of rows) n.set(r.type, (n.get(r.type) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
}

/** Los nodos en el orden de sus planetas (`starPlanets`); dentro de cada uno, el de la lista. */
export function sortStars(rows: readonly StarRow[]): StarRow[] {
  return [...rows].sort((a, b) => planetRank(a.planet[0], a.pi) - planetRank(b.planet[0], b.pi));
}

/** El nivel de un nodo: "30–40", o "85" si es uno solo. */
export const starLevel = (lv: readonly [number, number]): string => (lv[0] === lv[1] ? String(lv[0]) : `${lv[0]}–${lv[1]}`);

export interface StarFilters {
  /** El slug del planeta (`planetSlug`). */
  planet: string | null;
  /** El tipo de misión, en inglés como en los datos. */
  type: string | null;
}
export const noStarFilters: StarFilters = { planet: null, type: null };
/** `?planet=sedna&type=Defense` → filtros. */
export function readStarFilters(search: string): StarFilters {
  const q = new URLSearchParams(search);
  return { planet: q.get("planet") || null, type: q.get("type") || null };
}
export function writeStarFilters(f: StarFilters): string {
  const q = new URLSearchParams();
  if (f.planet) q.set("planet", f.planet);
  if (f.type) q.set("type", f.type);
  const s = q.toString();
  return s ? `?${s}` : "";
}
/** El tipo de misión que vale: sin planeta elegido no hay chips para soltarlo, así que se ignora; con planeta, sólo uno que tenga. */
export function effectiveStarType(planet: string | null, type: string | null, types: readonly string[]): string | null {
  return planet && type && types.includes(type) ? type : null;
}
export function filterStars(rows: readonly StarRow[], planet: string | null, type: string | null): StarRow[] {
  return rows.filter((r) => (!planet || planetSlug(r.planet) === planet) && (!type || r.type === type));
}

/* ---------- Armador (etapa 3): lo que escribe `games/warframe/tools/builder.py` en `data/builder/` ---------- */

/** Qué se arma: Warframes y armas primarias, secundarias y cuerpo a cuerpo. */
export type Kind = "warframe" | "primary" | "secondary" | "melee";
/** Polaridades del export: AP_ATTACK, AP_DEFENSE, AP_TACTIC, AP_POWER, AP_WARD, AP_PRECEPT, AP_UMBRA. */
export type Pol = "madurai" | "vazarin" | "naramon" | "zenurik" | "unairu" | "penjaga" | "umbra";
export const POLS: Pol[] = ["madurai", "vazarin", "naramon", "zenurik", "unairu", "penjaga", "umbra"];
/** Las stats que la tabla de patrones de `builder.py` reconoce en el texto de un mod. */
export type StatKey = "damage" | "impact" | "puncture" | "slash" | "heat" | "cold" | "electricity" | "toxin" | "blast"
  | "corrosive" | "gas" | "magnetic" | "radiation" | "viral" | "multishot" | "critChance" | "critDamage" | "statusChance"
  | "fireRate" | "magazine" | "reload" | "meleeDamage" | "attackSpeed" | "strength" | "duration" | "efficiency" | "range"
  | "health" | "shield" | "armor" | "energy";

/** Un objeto de `builder/items.json`. */
export interface BuildItem {
  /** El slug y el ícono del Arsenal (para enlazar a su ficha). */
  slug: string;
  name: Pair;
  kind: Kind;
  icon: string;
  /** Rango máximo = capacidad sin potenciador: 30, o `maxLevelCap`. */
  cap: number;
  /** Los `compatName` de los mods que le entran (clase, nombre propio, `WARFRAME`, `AURA`…). */
  compat: string[];
  /** Armas: `dmg` es `damagePerShot` (20 posiciones, por proyectil); `cc` y `sc` en fracción, `cd` multiplicador. */
  w?: { dmg: number[]; cc: number; cd: number; sc: number; rate: number; mag?: number; reload?: number; ms: number; bow: boolean; shotgun: boolean; riven?: string };
  /** Warframes, ya a rango 30 (regla del Update 34.0 + excepciones). */
  f?: { health: number; shield: number; armor: number; energy: number };
}

/** Un mod de `builder/mods-<kind>.json`. */
export interface BuildMod {
  /** El de la pestaña Mods (`/mods/<slug>`), único por `uniqueName`. */
  slug: string;
  name: Pair;
  pol: Pol | null;
  rarity: string;
  /** `baseDrain`: negativo en auras y posturas (suman capacidad). */
  drain: number;
  /** `fusionLimit`: el rango máximo. */
  max: number;
  slot: "normal" | "aura" | "stance";
  /** `isUtility`: entra en el casillero de exilio. */
  exilus: boolean;
  compat: string;
  icon?: string;
  /** Por stat, el valor en cada rango 0..max, en puntos (165 = +165 %); sólo lo reconocido e incondicional. */
  fx: [StatKey, number[]][];
  /** Las líneas del mod al rango máximo, para mostrar. */
  text: Pair[];
}

const builderItems = once<BuildItem[]>(() => import("@warframe/builder/items.json").then((m) => ({ default: m.default.items as BuildItem[] })));
/** Los ~690 objetos del armador, en su propio chunk. */
export const loadBuilderItems = (): Promise<BuildItem[]> => builderItems.load();
export const peekBuilderItems = (): BuildItem[] | null => builderItems.peek();

/** Un `import()` por archivo de mods: el de un arma no baja los de Warframe. */
const builderMods: Record<Kind, ReturnType<typeof once<BuildMod[]>>> = {
  warframe: once<BuildMod[]>(() => import("@warframe/builder/mods-warframe.json").then((m) => ({ default: m.default.mods as BuildMod[] }))),
  primary: once<BuildMod[]>(() => import("@warframe/builder/mods-primary.json").then((m) => ({ default: m.default.mods as BuildMod[] }))),
  secondary: once<BuildMod[]>(() => import("@warframe/builder/mods-secondary.json").then((m) => ({ default: m.default.mods as BuildMod[] }))),
  melee: once<BuildMod[]>(() => import("@warframe/builder/mods-melee.json").then((m) => ({ default: m.default.mods as BuildMod[] }))),
};
export const loadBuilderMods = (kind: Kind): Promise<BuildMod[]> => builderMods[kind].load();
export const peekBuilderMods = (kind: Kind): BuildMod[] | null => builderMods[kind].peek();

/**
 * Las fichas del Arsenal de esos cuatro tipos que no están en el armador (los Necramechs que el Arsenal cuenta como
 * Warframe y una pieza de Orion). Así la ficha sabe si ofrecer "Armar build" sin bajar `items.json`; lo cuida
 * `warframeBuilder.test.ts` contra los datos.
 */
export const NOT_IN_BUILDER: ReadonlySet<string> = new Set(["bonewidow", "orion-sirius", "voidrig"]);
export const inBuilder = (slug: string, kind: WfKind): boolean =>
  (kind === "warframe" || kind === "primary" || kind === "secondary" || kind === "melee") && !NOT_IN_BUILDER.has(slug);
