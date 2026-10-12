/**
 * Los datos de la pestaña Parches de Terraria (2026-10-12), como los escribe `games/terraria/tools/extras_data.py`: el
 * índice (`patches/index.json`) y una versión por archivo (`patches/<slug>.json`). Cada uno baja con `import()` en su
 * chunk: una versión baja sólo su archivo.
 */
import type { Route } from "../../route";
import { once } from "../../zomboid/store";

export interface IndexRow {
  v: string;
  slug: string;
  /** Cuántos puntos tiene. */
  n: number;
  /** Los primeros títulos de sección, para la lista. */
  titles: string[];
}
export interface Patch {
  v: string;
  sections: { t: string; lines: [depth: number, text: string][] }[];
}

type Mod<T> = { default: T };
const index = once<IndexRow[]>(() => import("@terraria/patches/index.json"));
const files = import.meta.glob<Mod<Patch>>(["@terraria/patches/*.json", "!**/index.json"]);
const loaders = new Map(Object.entries(files).map(([path, load]) => [path.replace(/^.*\//, "").replace(/\.json$/, ""), load]));
const patches = new Map<string, Patch | null>();
const pending = new Map<string, Promise<Patch | null>>();

export const peekIndex = (): IndexRow[] | null => index.peek();
export const loadIndex = (): Promise<IndexRow[]> => index.load();

/** `undefined` si todavía no se pidió; `null` si no existe. */
export const peekPatch = (slug: string): Patch | null | undefined => patches.get(slug);
export function loadPatch(slug: string): Promise<Patch | null> {
  const known = patches.get(slug);
  if (known !== undefined) return Promise.resolve(known);
  let p = pending.get(slug);
  if (!p) {
    const load = loaders.get(slug);
    p = (load ? load().then((m) => m.default) : Promise.resolve(null)).then(
      (patch) => {
        patches.set(slug, patch);
        return patch;
      },
      (err) => {
        // Un corte de red no deja la versión perdida: el próximo pedido la vuelve a buscar.
        pending.delete(slug);
        throw err;
      },
    );
    pending.set(slug, p);
  }
  return p;
}

/** Lo que una dirección de Parches necesita antes de dibujarse: la versión, o el índice si no hay (o no existe). */
export async function preloadPatchesRoute(route: Route): Promise<void> {
  if (route.detail && (await loadPatch(route.detail))) return;
  await loadIndex();
}
