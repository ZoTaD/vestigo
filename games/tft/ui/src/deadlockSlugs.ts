import { buildHeroes, PUBLISHED_BAND } from "./deadlockData";
import { buildItems } from "./deadlockItemsData";
import { slugify } from "./route";

/**
 * Los nombres en la URL de héroes e ítems de Deadlock, y cómo volver de ahí.
 *
 * Calco exacto de `slugs.ts` (TFT): un slug siempre sale del nombre en
 * inglés, aunque la página esté en español — mismo motivo de siempre, un
 * héroe no puede tener dos direcciones según el idioma.
 *
 * Sólo cubre la banda publicada por defecto (`PUBLISHED_BAND`): es la única
 * con datos disponibles de forma síncrona, que es lo que hace falta para
 * que el prerender le dé contenido real a la página (ver la Decisión y el
 * §3 del spec).
 */

interface SlugMap {
  /** slug → id, para leer una URL. */
  toId: Map<string, string>;
  /** id → slug, para escribir una. */
  toSlug: Map<string, string>;
}

/** Colisión de nombre → sufijo numerado, igual que en slugs.ts. */
function buildMap(entries: { id: string; name: string }[]): SlugMap {
  const toId = new Map<string, string>();
  const toSlug = new Map<string, string>();
  for (const { id, name } of entries) {
    const base = slugify(name) || slugify(id);
    let slug = base;
    for (let n = 2; toId.has(slug) && toId.get(slug) !== id; n++) slug = `${base}-${n}`;
    if (toSlug.has(id)) continue;
    toId.set(slug, id);
    toSlug.set(id, slug);
  }
  return { toId, toSlug };
}

const en = "en" as const;

export const heroes: SlugMap = buildMap(
  buildHeroes(PUBLISHED_BAND, en).map((h) => ({ id: String(h.heroId), name: h.name }))
);

export const items: SlugMap = buildMap(
  buildItems(PUBLISHED_BAND, en).map((i) => ({ id: String(i.itemId), name: i.name }))
);
