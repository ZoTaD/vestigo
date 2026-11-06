/**
 * Los datos de Company of Heroes 3 que bajan las pestañas (2026-11-04): lo que escribe `games/coh3/tools/site_data.py`
 * en `@coh3`, y las estadísticas de `stats.py` en `@coh3stats`.
 *
 * - La lista liviana de cada pestaña del explorador (`<tab>/list.json`), pedida una vez.
 * - Las fichas, repartidas en `COH3_SHARDS` archivos por el hash del slug (`<tab>/f/NN.json`). El slug es el id del
 *   juego, igual en los dos idiomas.
 *
 * Nunca en el chunk del área (regla 4 de CLAUDE.md). `load*` pide; `peek*` devuelve lo que ya llegó, para el primer
 * render y el prerender (que espera a `preloadRoute`).
 */
import type { CohGame, Coh3Section, Route } from "../route";
import { pzShardOf } from "../zomboid/shard";
import { once, shardedFichas } from "../zomboid/store";
import type { Faction } from "../coh3Copy";

/** `CHUNKS` de coh3.py: si se cambia uno se cambia el otro. */
export const COH3_SHARDS = 32;
const shard = (slug: string) => pzShardOf(slug, COH3_SHARDS);

type Mod<T> = { default: T };
/** Un texto visible en los dos idiomas (el español puede faltar: se usa el inglés). */
export type L10n = { en: string; es?: string | null };

export interface Meta {
  generatedAt: string;
  tag: string;
  patch: string;
}

/** Una fila de `units/list.json`. */
export interface UnitRow {
  slug: string;
  name: L10n;
  faction: Faction;
  kind: string;
  icon: string | null;
  cost: { mp?: number; mu?: number; fu?: number; pop?: number } | null;
  hp: number | null;
  armor: [number, number, number] | null;
  models?: number | null;
  [k: string]: unknown;
}
/** Una fila de `weapons/list.json`. */
export interface WeaponRow {
  slug: string;
  name: L10n;
  faction: Faction | null;
  kind: string;
  pen: [number, number, number] | null;
  dist: [number, number, number] | null;
  acc: [number, number, number] | null;
  dmg: [number, number] | null;
  [k: string]: unknown;
}
/** Una fila de `battlegroups/list.json`. */
export interface BattlegroupRow {
  slug: string;
  name: L10n;
  faction: Faction;
  icon: string | null;
  [k: string]: unknown;
}

export type DataTab = "units" | "weapons" | "battlegroups" | "commanders";
export const isDataTab = (t: string | undefined): t is DataTab => t === "units" || t === "weapons" || t === "battlegroups" || t === "commanders";

/** Los comandantes de CoH2 tienen la forma de los battlegroups de CoH3 (lista liviana + fichas). */
type ListOf = { units: UnitRow[]; weapons: WeaponRow[]; battlegroups: BattlegroupRow[]; commanders: BattlegroupRow[] };
type Glob = Record<string, () => Promise<{ default: Record<string, unknown> }>>;

/**
 * Los datos del explorador por juego (2026-11-06): CoH3 de `@coh3` (coh3-data) y CoH2 de `@coh2` (los archivos del
 * juego, `games/coh2/tools/site_data.py`), con los mismos formatos. CoH1 llega en la etapa 3. Cada juego tiene sus
 * cachés: cambiar de juego nunca mezcla listas.
 */
const JUEGOS = {
  coh3: {
    meta: once<Meta>(() => import("@coh3/meta.json") as Promise<Mod<unknown>>),
    lists: {
      units: once<UnitRow[]>(() => import("@coh3/units/list.json") as Promise<Mod<unknown>>),
      weapons: once<WeaponRow[]>(() => import("@coh3/weapons/list.json") as Promise<Mod<unknown>>),
      battlegroups: once<BattlegroupRow[]>(() => import("@coh3/battlegroups/list.json") as Promise<Mod<unknown>>),
    } as Partial<Record<DataTab, ReturnType<typeof once<unknown>>>>,
    // Las fichas son `unknown` acá: cada pestaña declara su forma (`units/types.ts`…) y la castea.
    fichas: {
      units: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/units/f/*.json") as Glob, shard),
      weapons: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/weapons/f/*.json") as Glob, shard),
      battlegroups: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/battlegroups/f/*.json") as Glob, shard),
    } as Partial<Record<DataTab, ReturnType<typeof shardedFichas<unknown>>>>,
  },
  coh2: {
    meta: once<Meta>(() => import("@coh2/meta.json") as Promise<Mod<unknown>>),
    lists: {
      units: once<UnitRow[]>(() => import("@coh2/units/list.json") as Promise<Mod<unknown>>),
      weapons: once<WeaponRow[]>(() => import("@coh2/weapons/list.json") as Promise<Mod<unknown>>),
      commanders: once<BattlegroupRow[]>(() => import("@coh2/commanders/list.json") as Promise<Mod<unknown>>),
    } as Partial<Record<DataTab, ReturnType<typeof once<unknown>>>>,
    fichas: {
      units: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh2/units/f/*.json") as Glob, shard),
      weapons: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh2/weapons/f/*.json") as Glob, shard),
      commanders: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh2/commanders/f/*.json") as Glob, shard),
    } as Partial<Record<DataTab, ReturnType<typeof shardedFichas<unknown>>>>,
  },
};
type ConDatos = keyof typeof JUEGOS;
/** CoH1 todavía no tiene enciclopedia: cae en CoH3 sólo para no romper; sus pestañas no la piden. */
const juego = (g: CohGame | undefined) => JUEGOS[(g && g in JUEGOS ? g : "coh3") as ConDatos];
const vacio = once<unknown>(() => Promise.resolve({ default: [] }));
const listaDe = (tab: DataTab, g?: CohGame) => juego(g).lists[tab] ?? vacio;

export const loadMeta = (g?: CohGame) => juego(g).meta.load();
export const peekMeta = (g?: CohGame) => juego(g).meta.peek();
export const loadList = <T extends DataTab>(tab: T, g?: CohGame): Promise<ListOf[T]> => listaDe(tab, g).load() as Promise<ListOf[T]>;
export const peekList = <T extends DataTab>(tab: T, g?: CohGame): ListOf[T] | null => listaDe(tab, g).peek() as ListOf[T] | null;
export const loadFicha = <F>(tab: DataTab, slug: string, g?: CohGame): Promise<F | null> =>
  (juego(g).fichas[tab]?.load(slug) ?? Promise.resolve(null)) as Promise<F | null>;
export const peekFicha = <F>(tab: DataTab, slug: string, g?: CohGame): F | null | undefined =>
  (juego(g).fichas[tab] ? juego(g).fichas[tab]!.peek(slug) : null) as F | null | undefined;

/** El texto en el idioma pedido, o el inglés si falta. */
export const tr = (l: L10n | string | null | undefined, lang: "en" | "es"): string => (!l ? "" : typeof l === "string" ? l : (lang === "es" && l.es) || l.en);

/**
 * Lo que cada pestaña necesita antes de dibujarse, más allá de la lista y la ficha del explorador. Cada pestaña nueva
 * con datos propios suma acá su línea (un `import()` de su módulo de datos), así el prerender sale con datos.
 */
const EXTRA: Partial<Record<Coh3Section, (route: Route) => Promise<unknown>>> = {
  // Las fichas de unidades nombran armas (y sus counters las recorren todas); las de armas, a sus unidades.
  // La ficha de unidad nombra además a su battlegroup o comandante. Todo con el juego de la dirección.
  units: (r) => Promise.all([loadList("weapons", r.cohGame), loadList(r.cohGame === "coh2" ? "commanders" : "battlegroups", r.cohGame)]),
  weapons: (r) => loadList("units", r.cohGame),
  battlegroups: (r) => loadList("units", r.cohGame),
  commanders: (r) => loadList("units", r.cohGame),
  penetration: (r) => Promise.all([loadList("units", r.cohGame), loadList("weapons", r.cohGame)]),
  dps: (r) => Promise.all([loadList("units", r.cohGame), loadList("weapons", r.cohGame)]),
  stats: (route) => Promise.all([import("./stats/data").then((m) => m.loadSummary(route.cohGame)), import("./stats/parts").then((m) => m.loadMapNames(route.cohGame))]),
  "tier-list": () => Promise.all([import("./stats/data").then((m) => m.loadSummary()), import("./stats/parts").then((m) => m.loadMapNames())]),
  maps: (route) => Promise.all([import("./more/Coh3Maps").then((m) => m.loadMaps(route.cohGame)), import("./stats/data").then((m) => m.loadSummary(route.cohGame))]),
  challenges: () => import("./more/Coh3Challenges").then((m) => m.loadChallenges()),
  "final-stand": () => import("./more/Coh3FinalStand").then((m) => m.loadFinalStand()),
  ranks: (route) => import("./stats/Coh3Ranks").then((m) => m.loadLadder(route.cohGame)),
  achievements: (route) => import("./more/Coh3Achievements").then((m) => m.loadAchievements(route.cohGame)),
  bulletins: () => import("./explorer/CohBulletins").then((m) => m.loadBulletins()),
  patches: (route) => import("./more/Coh3Patches").then((m) => m.preloadPatches(route)),
};

/** Lo que una dirección necesita antes de dibujarse (el prerender lo espera, así el HTML sale con datos). */
export async function preloadRoute(route: Route): Promise<void> {
  const tab = route.c3Section ?? "home";
  const g = route.cohGame;
  const jobs: Promise<unknown>[] = [loadMeta(g === "coh1" ? "coh3" : g)];
  if (isDataTab(tab)) {
    jobs.push(loadList(tab, g));
    if (route.detail) jobs.push(loadFicha(tab, route.detail, g));
  }
  const extra = EXTRA[tab];
  if (extra) jobs.push(extra(route));
  await Promise.all(jobs);
}
