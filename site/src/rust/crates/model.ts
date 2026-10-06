/**
 * La pestaña Cajas de Rust (2026-10-06), sin React ni `import()`: de `loot.json` (`games/rust/tools/world.py`) y de la
 * lista de Objetos sale el índice de las 82 fuentes de botín (cajas, NPC, recolectables y objetos que se abren), con su
 * slug en cada idioma y cuántos objetos dan, y la tabla de una. Lo usan la pestaña (`data.ts`) y el build
 * (`vite.config.ts`, para el sitemap y los slugs en español), así las dos cuentas no pueden separarse.
 */
import { slugify } from "../../route";
import type { ListRow, LootEvent, LootKind } from "../items/data";

export interface LootContainer {
  en: string;
  es: string;
  kind: LootKind;
  event: LootEvent | null;
  /** Si los objetos con condición salen gastados: nunca, a veces (de gastado a entero) o siempre. */
  worn: "none" | "some" | "all";
  /** El objeto que se abre, si la fuente es uno (un regalo, una bolsa de Halloween). */
  item?: string;
}
export interface LootRow {
  c: string;
  chance: number;
  min: number;
  max: number;
  bp: boolean;
}
export interface LootFile {
  containers: Record<string, LootContainer>;
  items: Record<string, LootRow[]>;
}

export interface CrateEntry extends LootContainer {
  key: string;
  slug: string;
  slugEs: string;
  /**
   * Comparte el nombre con otra fuente (la mena de metal de Halloween y la de siempre): el slug lleva la clave y el
   * nombre que se muestra, el evento entre paréntesis.
   */
  dup: boolean;
  /** Cuántos objetos distintos puede dar. */
  n: number;
  /** Si alguno puede salir como plano. */
  bp: boolean;
}
export interface CrateRow {
  id: string;
  slug: string;
  name: { en: string; es: string | null };
  chance: number;
  min: number;
  max: number;
  bp: boolean;
}

/** El orden de los grupos de la lista: cajas, NPC, recolectables y objetos que se abren. */
export const KIND_ORDER: LootKind[] = ["box", "npc", "collect", "item"];

/**
 * Las filas de cada fuente, sólo con los objetos que tienen ficha (`known`): el botín nombra alguno que el juego ya no
 * tiene, como el trineo navideño del regalo mediano, y sin ficha ni ícono saldría con el id crudo de nombre (lo mismo
 * descarta `contents_of` de site_data.py). De la más probable a la menos, y a igual probabilidad por nombre.
 */
export function crateRows(loot: LootFile, known: ReadonlyMap<string, ListRow>): Map<string, CrateRow[]> {
  const out = new Map<string, CrateRow[]>();
  for (const [id, rows] of Object.entries(loot.items)) {
    const it = known.get(id);
    if (!it) continue;
    for (const r of rows) {
      if (!out.has(r.c)) out.set(r.c, []);
      out.get(r.c)!.push({ id, slug: it.slug, name: { en: it.en, es: it.es }, chance: r.chance, min: r.min, max: r.max, bp: r.bp });
    }
  }
  for (const rows of out.values()) rows.sort((a, b) => b.chance - a.chance || a.name.en.localeCompare(b.name.en, "en") || a.id.localeCompare(b.id));
  return out;
}

/**
 * El índice, en el orden de la lista (por grupo y, adentro, por nombre en inglés). El slug sale del nombre en cada
 * idioma; si dos fuentes dan el mismo, la de un evento suma su clave (`metal-ore-collect-halloween-metalore`) y la de
 * siempre se queda con el corto.
 */
export function crateIndex(loot: LootFile, rows: ReadonlyMap<string, CrateRow[]>): CrateEntry[] {
  const keys = Object.keys(loot.containers);
  const taken = new Map<string, number>();
  for (const k of keys) {
    const s = slugify(loot.containers[k].en);
    taken.set(s, (taken.get(s) ?? 0) + 1);
  }
  const entries = keys.map((key): CrateEntry => {
    const c = loot.containers[key];
    const dup = (taken.get(slugify(c.en)) ?? 0) > 1 && c.event !== null;
    const tail = dup ? `-${slugify(key)}` : "";
    const own = rows.get(key) ?? [];
    return {
      ...c,
      key,
      slug: slugify(c.en) + tail,
      slugEs: slugify(c.es || c.en) + tail,
      dup,
      n: new Set(own.map((r) => r.id)).size,
      bp: own.some((r) => r.bp),
    };
  });
  return entries.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.en.localeCompare(b.en, "en") || a.key.localeCompare(b.key));
}

/** Los slugs en español que cambian, para `registerRustSlugs({ crates })`. */
export const crateSlugsEs = (index: readonly CrateEntry[]): Record<string, string> =>
  Object.fromEntries(index.filter((e) => e.slugEs !== e.slug).map((e) => [e.slug, e.slugEs]));

/** El nombre de una fuente en el idioma de la página, con el evento entre paréntesis si comparte nombre con otra. */
export function crateName(e: Pick<CrateEntry, "en" | "es" | "dup" | "event">, lang: "en" | "es", events: Record<LootEvent, string>): string {
  const name = (lang === "es" && e.es) || e.en;
  return e.dup && e.event ? `${name} (${events[e.event]})` : name;
}
