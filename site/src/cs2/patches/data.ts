/**
 * Los datos de la pestaña Parches de CS2 (2026-11-03, etapa 5), que escribe `games/cs2/tools/patches.py` con los
 * anuncios de Steam: el índice (`patches/index.json`, una fila por edición, del más nuevo al más viejo) y cada edición en
 * su archivo (`patches/e/<slug>.json`), que se baja recién al abrirla.
 */
import { once } from "../../zomboid/store";

type Mod<T> = { default: T };
export type Dir = "new" | "mid" | "fix";
/** Lo que nombra una línea: una caja o colección del catálogo (con su ficha), un mapa o un arma. */
export interface Ref {
  kind: "case" | "coll" | "map" | "weapon";
  name: string;
  slug?: string;
  img?: string | null;
}
/** Una línea de las notas. `head`: el nombre de un mapa que encabeza los cambios que siguen (que llevan `map`). */
export interface Line {
  text: string;
  dir?: Dir;
  head?: boolean;
  sub?: boolean;
  map?: string;
  refs?: Ref[];
}
export interface Section {
  title: string;
  lines: Line[];
}
/** Un lanzamiento, en orden: imagen, título, párrafo o viñeta. */
export type Block = { img: string } | { h: string } | { p: string } | { li: string };
export interface PatchMeta {
  slug: string;
  date: string;
  kind: "patch" | "content";
  title: string;
  counts?: Record<Dir, number>;
  secs?: string[];
  cover?: string;
}
export interface Patch extends Omit<PatchMeta, "counts" | "secs" | "cover"> {
  url: string;
  sections?: Section[];
  body?: Block[];
  refs?: Ref[];
}

const index = once<PatchMeta[]>(() => import("@cs2/patches/index.json") as Promise<Mod<unknown>>);
export const loadPatchIndex = () => index.load();
export const peekPatchIndex = () => index.peek();

const files = import.meta.glob<Mod<Patch>>("@cs2/patches/e/*.json");
const pending = new Map<string, Promise<Patch | null>>();
const ready = new Map<string, Patch | null>();
const fileOf = (slug: string) => Object.keys(files).find((k) => k.endsWith(`/e/${slug}.json`));

/** Una edición por su slug; `null` si no existe. */
export function loadPatch(slug: string): Promise<Patch | null> {
  let p = pending.get(slug);
  if (!p) {
    const key = fileOf(slug);
    p = key
      ? files[key]().then(
          (m) => {
            ready.set(slug, m.default);
            return m.default;
          },
          (err) => {
            // Un corte de red no la deja perdida hasta recargar.
            pending.delete(slug);
            throw err;
          },
        )
      : Promise.resolve(null);
    if (!key) ready.set(slug, null);
    pending.set(slug, p);
  }
  return p;
}
/** `undefined`: todavía no se pidió; `null`: no existe. */
export const peekPatch = (slug: string): Patch | null | undefined => ready.get(slug);
