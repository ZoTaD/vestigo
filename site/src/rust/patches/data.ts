/**
 * Los datos de la pestaña Parches de Rust (2026-10-09), tal como los escribe `games/rust/tools/patches.py`: el índice
 * (`patches/index.json`, chico) y una edición por archivo (`patches/<slug>.json`, ~18 KB). Cada uno baja con `import()`
 * en su chunk: una edición baja sólo su archivo.
 */
import type { Route } from "../../route";
import { once } from "../../zomboid/store";

export interface Ref {
  /** El nombre tal como aparece en el renglón. */
  n: string;
  /** El slug de la ficha de Objetos. */
  s: string;
}
export interface Block {
  t: "p" | "li" | "code";
  text: string;
  refs?: Ref[];
}
export interface Section {
  title: string;
  level: number;
  /** Falta en un título que sólo agrupa a los de abajo (el extractor no escribe listas vacías). */
  lines?: Block[];
}
export interface Edition {
  slug: string;
  title: string;
  name: string;
  date: string;
  steam: string;
  blog?: string;
  cover?: string;
  intro?: Block[];
  sections: Section[];
  es?: { intro?: Block[]; sections: Section[] };
}
export interface IndexRow {
  slug: string;
  name: string;
  date: string;
  cover?: string;
  heads: string[];
  headsEs?: string[];
  es?: boolean;
}

type Mod<T> = { default: T };
const index = once<{ editions: IndexRow[] }>(() => import("@rust/patches/index.json"));
const files = import.meta.glob<Mod<Edition>>(["@rust/patches/*.json", "!**/index.json"]);
const loaders = new Map(Object.entries(files).map(([path, load]) => [path.replace(/^.*\//, "").replace(/\.json$/, ""), load]));
const editions = new Map<string, Edition | null>();
const pending = new Map<string, Promise<Edition | null>>();

export const peekIndex = (): { editions: IndexRow[] } | null => index.peek();
export const loadIndex = () => index.load();

/** `undefined` si todavía no se pidió; `null` si no existe. */
export const peekEdition = (slug: string): Edition | null | undefined => editions.get(slug);
export function loadEdition(slug: string): Promise<Edition | null> {
  let p = pending.get(slug);
  if (!p) {
    const load = loaders.get(slug);
    p = load
      ? load().then(
          (m) => {
            editions.set(slug, m.default);
            return m.default;
          },
          (err) => {
            pending.delete(slug);
            throw err;
          },
        )
      : Promise.resolve(null).then((v) => (editions.set(slug, v), v));
    pending.set(slug, p);
  }
  return p;
}

/** Para el prerender y `preloadTab`: la edición, o el índice si es la lista o si la edición no existe. */
export async function preloadPatchesRoute(route: Route): Promise<void> {
  if (route.detail && (await loadEdition(route.detail))) return;
  await loadIndex();
}
