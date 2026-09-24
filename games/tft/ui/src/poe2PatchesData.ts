/**
 * Datos del Diario de parches de PoE2 (2026-09-23).
 *
 * `games/poe2/data/patches/` lo escribe `games/poe2/pipeline/patches.mjs` con
 * las notas oficiales del foro en inglés y en español. El índice es chico y va
 * en el bundle; cada edición se pide al abrirla.
 */
import index from "@poe2/patches/index.json";

export type Dir = "up" | "down" | "fix" | "new" | "mid";
export interface Line { text: string; dir?: Dir; refs?: string[]; kids?: Line[] }
export interface Section { title: string; lines: Line[] }
export interface Hotfix { title: string; date: string; url: string; lines: Line[]; es: Line[] | null }
export interface EditionMeta {
  version: string;
  slug: string;
  date: string;
  kind: "content" | "patch";
  title: { en: string; es: string | null };
  counts: { lines: number; up: number; down: number; fix: number; new: number };
}
export interface Edition extends Omit<EditionMeta, "counts"> {
  url: { en: string; es: string | null };
  banner: string | null;
  en: Section[];
  es: Section[] | null;
  hotfixes: Hotfix[];
}

export const EDITIONS: EditionMeta[] = (index as { editions: EditionMeta[] }).editions;

const archivos = import.meta.glob<{ default: unknown }>(["@poe2/patches/*.json", "!@poe2/patches/index.json"]);
const pedidos = new Map<string, Promise<Edition>>();
export function loadEdition(slug: string): Promise<Edition> {
  let p = pedidos.get(slug);
  if (!p) {
    const key = Object.keys(archivos).find((k) => k.endsWith(`/${slug}.json`));
    if (!key) return Promise.reject(new Error(`sin edición ${slug}`));
    p = archivos[key]().then((m) => m.default as Edition);
    pedidos.set(slug, p);
  }
  return p;
}
export const loadAllEditions = () => Promise.all(EDITIONS.map((e) => loadEdition(e.slug)));

/** Todas las líneas de una lista, con sus sublíneas, en orden. */
export function* walk(lines: Line[]): Generator<Line> {
  for (const l of lines) {
    yield l;
    if (l.kids) yield* walk(l.kids);
  }
}

/** Los ids de la enciclopedia nombrados en una edición, del más nombrado al menos. */
export function editionRefs(sections: Section[]): string[] {
  const n = new Map<string, number>();
  for (const s of sections) for (const l of walk(s.lines)) for (const r of l.refs ?? []) n.set(r, (n.get(r) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** La "serie" de una versión: 0.5.5c → 0.5. Agrupa la hemeroteca. */
export const seriesOf = (v: string): string => v.split(".").slice(0, 2).join(".");
