import { catalog } from "./catalog";
import setsIndex from "@data/sets/index.json";

/**
 * Which TFT set the tier list can be read for.
 *
 * The live set is taken from the catalog rather than written down, so it follows
 * whatever the pipeline last generated — the same reason nothing else in this
 * product hardcodes a set number.
 *
 * The next set is listed alongside it, unavailable. A stats site that says
 * nothing at all about the set everyone is about to play reads as abandoned in
 * the weeks before a launch, which is exactly when people are looking hardest.
 *
 * Deliberately WITHOUT a launch date. Riot has announced one for Set 18 — the
 * 26th of August — but the picker is not where a date belongs: the pipeline
 * carries it in `sets.ts` and the site's job is to show what it measured, not to
 * announce. Add a date here only if the page starts explaining the calendar.
 *
 * ---
 *
 * **Los sets archivados.** Cuando un set cierra, su tier list se congela en
 * `games/tft/data/sets/<n>/` y queda listada en el índice que se importa arriba.
 * Un set archivado es tan seleccionable como el vigente; lo que cambia es que sus
 * números no se mueven más, y eso hay que decirlo en pantalla (ver `archived` en
 * i18n.ts). Es contenido que ya se pagó de medir y que Google ya indexó: tirarlo
 * el día del cambio de set sería regalar meses de posicionamiento.
 */

export interface SetOption {
  /** The set number as the game names it. */
  number: number;
  /**
   * False while we hold no matches from it. The option is still rendered, so
   * the reader can see it is coming, but it cannot be selected.
   */
  available: boolean;
  /** True for a set whose list is frozen: measured, published, and done. */
  archived: boolean;
}

interface ArchivedSet {
  number: number;
  label: string;
  frozenAt: string;
  sampleSize: number;
}

/**
 * Los sets congelados, del más nuevo al más viejo.
 *
 * Sale de un archivo del repo y no de un pedido a la API: es la misma decisión
 * que el resto de la publicación —lo que el sitio muestra viaja en el commit— y
 * evita que la lista de sets dependa de un servicio que puede estar caído.
 */
export const archivedSets = (): ArchivedSet[] =>
  [...((setsIndex as { sets: ArchivedSet[] }).sets ?? [])].sort((a, b) => b.number - a.number);

/** The set the published files describe, or 0 when the catalog has not loaded. */
export const publishedSet = (): number => Number(catalog.set) || 0;

/** True when this set's numbers are frozen rather than live. */
export const isArchivedSet = (n: number): boolean =>
  archivedSets().some((s) => s.number === n);

/**
 * What the picker offers: every archived set, the live one, and the one after.
 *
 * El próximo se deriva sumando uno al vigente en vez de escribir "18", así esto
 * sigue funcionando en 18 → 19 sin que nadie se acuerde de volver acá.
 */
export function setOptions(): SetOption[] {
  const published = publishedSet();
  if (!published) return [];

  const archivados = archivedSets()
    .filter((s) => s.number !== published)
    .map((s) => ({ number: s.number, available: true, archived: true }));

  return [
    ...archivados,
    { number: published, available: true, archived: false },
    { number: published + 1, available: false, archived: false },
  ].sort((a, b) => a.number - b.number);
}
