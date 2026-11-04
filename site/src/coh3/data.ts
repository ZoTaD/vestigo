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
import type { Coh3Section, Route } from "../route";
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

export type DataTab = "units" | "weapons" | "battlegroups";
export const isDataTab = (t: string | undefined): t is DataTab => t === "units" || t === "weapons" || t === "battlegroups";

type ListOf = { units: UnitRow[]; weapons: WeaponRow[]; battlegroups: BattlegroupRow[] };

const meta = once<Meta>(() => import("@coh3/meta.json") as Promise<Mod<unknown>>);
const lists = {
  units: once<UnitRow[]>(() => import("@coh3/units/list.json") as Promise<Mod<unknown>>),
  weapons: once<WeaponRow[]>(() => import("@coh3/weapons/list.json") as Promise<Mod<unknown>>),
  battlegroups: once<BattlegroupRow[]>(() => import("@coh3/battlegroups/list.json") as Promise<Mod<unknown>>),
};
// Las fichas son `unknown` acá: cada pestaña declara su forma (`units/types.ts`…) y la castea.
const fichas = {
  units: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/units/f/*.json"), shard),
  weapons: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/weapons/f/*.json"), shard),
  battlegroups: shardedFichas<unknown>(import.meta.glob<{ default: Record<string, unknown> }>("@coh3/battlegroups/f/*.json"), shard),
};

export const loadMeta = () => meta.load();
export const peekMeta = () => meta.peek();
export const loadList = <T extends DataTab>(tab: T): Promise<ListOf[T]> => (lists[tab] as ReturnType<typeof once<ListOf[T]>>).load();
export const peekList = <T extends DataTab>(tab: T): ListOf[T] | null => (lists[tab] as ReturnType<typeof once<ListOf[T]>>).peek();
export const loadFicha = <F>(tab: DataTab, slug: string): Promise<F | null> => fichas[tab].load(slug) as Promise<F | null>;
export const peekFicha = <F>(tab: DataTab, slug: string): F | null | undefined => fichas[tab].peek(slug) as F | null | undefined;

/** El texto en el idioma pedido, o el inglés si falta. */
export const tr = (l: L10n | string | null | undefined, lang: "en" | "es"): string => (!l ? "" : typeof l === "string" ? l : (lang === "es" && l.es) || l.en);

/**
 * Lo que cada pestaña necesita antes de dibujarse, más allá de la lista y la ficha del explorador. Cada pestaña nueva
 * con datos propios suma acá su línea (un `import()` de su módulo de datos), así el prerender sale con datos.
 */
const EXTRA: Partial<Record<Coh3Section, (route: Route) => Promise<unknown>>> = {
};

/** Lo que una dirección necesita antes de dibujarse (el prerender lo espera, así el HTML sale con datos). */
export async function preloadRoute(route: Route): Promise<void> {
  const tab = route.c3Section ?? "home";
  const jobs: Promise<unknown>[] = [loadMeta()];
  if (isDataTab(tab)) {
    jobs.push(loadList(tab));
    if (route.detail) jobs.push(loadFicha(tab, route.detail));
  }
  const extra = EXTRA[tab];
  if (extra) jobs.push(extra(route));
  await Promise.all(jobs);
}
