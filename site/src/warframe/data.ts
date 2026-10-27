/**
 * Los datos de Warframe que bajan las pestañas con fichas (2026-10-27): lo que escribe `games/warframe/tools/site_data.py`.
 *
 * - La lista liviana de cada pestaña (`list.json`), pedida una vez.
 * - Las fichas, repartidas en `WF_SHARDS` archivos por el hash del slug inglés (`f/NN.json`).
 * - Un mapa español → inglés repartido igual por el slug español (`es/NN.json`), para abrir en frío una ficha en español
 *   sin bajar la lista entera.
 *
 * Cada vez que llega algo que nombra objetos se anotan sus slugs en español en `route.ts`, que es lo que escribe los
 * enlaces. Nunca en el chunk del área: cada JSON es un `import()` aparte (regla 4 de CLAUDE.md). Dónde farmear y Mods
 * suman acá su lista y sus fichas.
 */
import { registerWfSlugs, type Route, type WfTab } from "../route";
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
  | { k: "mission"; where: string; rot: string | null; chance: number }
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

/** Lo que trae cada pestaña con fichas. Dónde farmear y Mods suman las suyas acá. */
export interface ListOf {
  arsenal: ArsenalRow[];
  relics: RelicRow[];
}
export interface FichaOf {
  arsenal: ArsenalFicha;
  relics: RelicFicha;
}
export type DataTab = keyof ListOf;
export const DATA_TABS: DataTab[] = ["arsenal", "relics"];
export const isDataTab = (t: string | undefined): t is DataTab => !!t && (DATA_TABS as string[]).includes(t);

const lists = {
  arsenal: once<ArsenalRow[]>(() => import("@warframe/arsenal/list.json")),
  relics: once<RelicRow[]>(() => import("@warframe/relics/list.json")),
};
const fichas = {
  arsenal: shardedFichas<ArsenalFicha>(import.meta.glob<{ default: Record<string, ArsenalFicha> }>("@warframe/arsenal/f/*.json"), shard),
  relics: shardedFichas<RelicFicha>(import.meta.glob<{ default: Record<string, RelicFicha> }>("@warframe/relics/f/*.json"), shard),
};
const esToEn = {
  arsenal: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/arsenal/es/*.json"), shard),
  relics: shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@warframe/relics/es/*.json"), shard),
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
export function sortSources<T extends Source>(list: readonly T[]): T[] {
  const score = (s: Source): number => ("chance" in s && s.chance !== undefined ? s.chance : "eff" in s ? s.eff : 0);
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
export function sortArsenal(rows: readonly ArsenalRow[], lang: Lang): ArsenalRow[] {
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
