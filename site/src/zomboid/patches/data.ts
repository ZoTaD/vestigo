/**
 * Los datos de la pestaña Parches de Project Zomboid (2026-10-02), tal como los escribe `games/zomboid/tools/site.py`
 * en `site/patches/`:
 *
 * - `index.json`: una entrada por versión, de la más nueva a la más vieja (la Crónica, si está, y qué tenemos de esa
 *   versión). Chico (~1 KB con gzip): viaja en el chunk de la pestaña, como el índice de PoE2 (`poe2PatchesData.ts`).
 * - `<slug>.json`: la página de cada versión, con sus highlights, sus fuentes, sus hotfixes y, si la comparamos con la
 *   anterior, el diff campo por campo. Cada una en su chunk, pedida al abrirla (`import.meta.glob` perezoso).
 *
 * Qué dice cada página sobre la comparación (el contrato de site.py, ver `games/zomboid/README.md`):
 * - `recorded` con `diff`: lo que cambió desde `diff.from`;
 * - `recorded` con `first`: la primera versión que guardamos (cuántos hay de cada tipo);
 * - `recorded` sin `diff` ni `first`: la comparamos y no cambió ningún dato;
 * - `!recorded`: es anterior a la primera que guardamos.
 */
import indexJson from "@zomboid/site/patches/index.json";
import { PZ_PUBLISHED, type PzTab, type Route } from "../../route";
import type { Loc } from "../items/data";

import type { Kind } from "./kinds";

export { KINDS, type Kind } from "./kinds";
export type Raw = number | string | boolean | null;

/** Cuántos nuevos, quitados y cambiados hubo de un tipo. */
export interface KindCounts {
  added: number;
  removed: number;
  changed: number;
}

export interface PatchMeta {
  slug: string;
  version: string;
  date: string;
  updated?: string;
  branch?: "stable" | "unstable";
  unstableDate?: string;
  /** De la Crónica; sin Crónica, no están. */
  title?: Loc;
  summary?: Loc;
  /** Slug del padre, si la página es de un hotfix (42.21.1). */
  hotfixOf?: string;
  hotfixes: number;
  /** La comparamos (tiene foto propia, o figura en la de otra versión como vista sin cambios). */
  recorded: boolean;
  counts?: Partial<Record<Kind, KindCounts>>;
  /** La primera versión guardada: cuántos hay de cada tipo (ids del juego, no fichas). */
  first?: Partial<Record<Kind, number>>;
}

export interface PatchIndex {
  current: string;
  patches: PatchMeta[];
}

/** Una cosa del juego en un diff. `slug`: su ficha de hoy, si existe. */
export interface Ent {
  id: string;
  n: Loc;
  slug?: string;
}

export interface FieldChange {
  f: string;
  b?: Raw;
  a?: Raw;
  add?: string[];
  rem?: string[];
}

export interface PatchSource {
  kind: string;
  url: string;
}

export interface PatchHotfix {
  version: string;
  date: string;
  summary: Loc;
  sources: PatchSource[];
  /** Si el hotfix tiene página propia. */
  slug?: string;
}

export interface KindDiff {
  added: Ent[];
  removed: Ent[];
  changed: (Ent & { fields: FieldChange[] })[];
}

export interface PatchPage extends PatchMeta {
  highlights: Loc[];
  sources: PatchSource[];
  hotfixList: PatchHotfix[];
  diff?: { from: string; fromSlug: string; kinds: Partial<Record<Kind, KindDiff>> };
  /** Los tokens de los valores (Base.Plank, MakeShiv, weak) → su nombre. */
  names: Record<string, Loc>;
}

/** Lo que va en "Qué cambió" de cada ficha (la Task 5 lo dibuja con `FieldRows`). */
export interface FichaChange {
  patch: string;
  version: string;
  date: string;
  kind: "added" | "changed";
  /** Sólo en objetos con más de una variante. */
  gameId?: string;
  fields?: FieldChange[];
  names?: Record<string, Loc>;
}

/**
 * La pestaña donde vive la ficha de cada tipo. Las opciones de sandbox van al Servidor, que no tiene una ficha por
 * opción: sólo enlazan si la entidad trae `slug` y el Servidor está publicado.
 */
export const KIND_SEC: Record<Kind, PzTab | null> = {
  items: "items",
  recipes: "recipes",
  traits: "traits",
  professions: "professions",
  skills: "skills",
  moodles: "moodles",
  sandbox: "server",
};

/** La pestaña a la que enlaza una entidad de un tipo, o `null` si no enlaza. */
export const kindTab = (kind: Kind): PzTab | null => {
  const sec = KIND_SEC[kind];
  return sec && PZ_PUBLISHED.includes(sec) ? sec : null;
};

export const PATCH_INDEX = indexJson as PatchIndex;

/** La primera versión que guardamos completa (desde ahí comparamos una contra otra), o `null` si no hay ninguna. */
export const FIRST_RECORDED: PatchMeta | null = PATCH_INDEX.patches.find((p) => p.first) ?? null;

const files = import.meta.glob<{ default: PatchPage }>(["@zomboid/site/patches/*.json", "!@zomboid/site/patches/index.json"]);
// Por slug y no por la ruta que usa de clave, que depende de cómo resuelva el alias.
const loaders = new Map(
  Object.entries(files).flatMap(([path, load]) => {
    const slug = path.match(/([^/]+)\.json$/)?.[1];
    return slug ? [[slug, load] as const] : [];
  }),
);
const pages = new Map<string, PatchPage>();
const pending = new Map<string, Promise<PatchPage | null>>();

/**
 * La página si ya llegó: `undefined` si todavía no, `null` si no existe. Un slug sin archivo se sabe sin pedir nada,
 * así una versión que no existe muestra la lista en el primer render.
 */
export function peekPatch(slug: string): PatchPage | null | undefined {
  const page = pages.get(slug);
  if (page) return page;
  return loaders.has(slug) ? undefined : null;
}

/** Pide la página de una versión; `null` si no existe. Si falla, la próxima llamada la vuelve a pedir. */
export function loadPatch(slug: string): Promise<PatchPage | null> {
  const page = pages.get(slug);
  if (page) return Promise.resolve(page);
  const load = loaders.get(slug);
  if (!load) return Promise.resolve(null);
  let p = pending.get(slug);
  if (!p) {
    p = load().then(
      (m) => {
        pages.set(slug, m.default);
        return m.default;
      },
      (err) => {
        pending.delete(slug);
        throw err;
      },
    );
    pending.set(slug, p);
  }
  return p;
}

/** Lo que necesita el primer render de una ruta de la pestaña: la página de la versión, si la ruta lleva una. */
export async function preloadPatchesRoute(route: Route): Promise<void> {
  if (route.detail) await loadPatch(route.detail);
}

/**
 * Pone una página en la caché como si hubiera llegado. SÓLO PARA LOS TESTS: hasta la 42.22 no hay ningún diff de
 * verdad, y la página con cambios se prueba con una inventada.
 */
export function primePatch(slug: string, page: PatchPage): void {
  pages.set(slug, page);
}
