/**
 * Datos de la Crónica de Valheim (2026-09-24): las notas de parche oficiales.
 *
 * `games/valheim/data/site/patches/` lo escribe
 * `games/valheim/pipeline/patches.py` desde los anuncios de Steam. El índice y
 * cada edición se piden al abrir la pestaña, como el resto de la sección.
 */
export type Dir = "new" | "mid" | "fix";
/** `note`: un párrafo suelto dentro de una sección (no es una viñeta). */
export interface Line { text: string; dir?: Dir; refs?: string[]; note?: boolean }
export interface Section { title: string; major?: boolean; lines?: Line[] }
export interface Body { intro?: string[]; sections?: Section[] }
export interface Hotfix extends Body { title: string; date: string; url: string }
export interface EditionMeta {
  version: string;
  slug: string;
  date: string;
  kind: "content" | "patch";
  /** El nombre de la actualización ("Call To Arms"); los parches sueltos no tienen. */
  title: { en?: string; es?: string };
  cover?: string;
  counts: Record<Dir, number>;
}
export interface Edition extends Omit<EditionMeta, "counts">, Body {
  url: string;
  hotfixes?: Hotfix[];
  /** La edición en español; sin ella la web avisa y muestra el inglés. */
  es?: { title?: string; hotfixes?: Body[] } & Body;
}

const archivos = import.meta.glob<{ default: unknown }>("@valheim/patches/*.json");
const pedidos = new Map<string, Promise<unknown>>();
const listos = new Map<string, unknown>();

function load<T>(name: string): Promise<T> {
  let p = pedidos.get(name);
  if (!p) {
    const key = Object.keys(archivos).find((k) => k.endsWith(`/patches/${name}.json`));
    if (!key) return Promise.reject(new Error(`sin edición: ${name}`));
    p = archivos[key]().then((m) => {
      listos.set(name, m.default);
      return m.default;
    });
    pedidos.set(name, p);
  }
  return p as Promise<T>;
}

export const loadEditions = () => load<{ editions: EditionMeta[] }>("index").then((i) => i.editions);
export const peekEditions = (): EditionMeta[] | null => (listos.get("index") as { editions: EditionMeta[] } | undefined)?.editions ?? null;
export const loadEdition = (slug: string) => load<Edition>(slug);
export const peekEdition = (slug: string): Edition | null => (listos.get(slug) as Edition | undefined) ?? null;

/**
 * La portada de una edición: la imagen del anuncio si traía, si no la
 * ilustración del último bioma que había en el juego en esa versión.
 */
export function coverOf(e: EditionMeta): { src: string; logo: boolean } {
  if (e.cover) return { src: `/valheim/news/${e.cover}.webp`, logo: false };
  const v = e.version.split(".").map(Number);
  const at = (a: number, b: number, c = 0) => v[0] > a || (v[0] === a && (v[1] > b || (v[1] === b && (v[2] ?? 0) >= c)));
  const biome = at(1, 0) ? "deepnorth" : at(0, 218, 15) ? "ashlands" : at(0, 212, 7) ? "mistlands" : at(0, 207, 20) ? "mountain" : "meadows";
  return { src: `/valheim/art/biome_${biome}.webp`, logo: biome === "deepnorth" };
}
