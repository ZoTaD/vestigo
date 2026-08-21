import { existsSync, readFileSync } from "node:fs";

/**
 * Dónde viven los sets congelados, y quién está congelado.
 *
 * Va aparte de `sets.ts` a propósito: `sets.ts` es una tabla pura que el Worker
 * de Cloudflare también lleva (ver `cloudflare/src/sets.ts`), y Workers no tiene
 * `node:fs`. Si el lector viviera ahí, la copia no compilaría.
 *
 * El índice es un archivo del repo y no una tabla de la base porque es
 * exactamente lo mismo que ya hace el resto de la publicación: lo que el sitio
 * muestra viaja en el commit. Un set se congela una vez cada tres o cuatro
 * meses; una base para eso sería un servicio más que puede estar caído justo
 * cuando hay que publicar.
 */

/** La raíz de los sets archivados, relativa al directorio del pipeline. */
export const SETS_DIR = "../data/sets";

/** El índice que la UI lee para saber qué sets ofrecer en el selector. */
export const SETS_INDEX = `${SETS_DIR}/index.json`;

/** El directorio de un set congelado. */
export const setDir = (set: number): string => `${SETS_DIR}/${set}`;

/** El manifiesto de un set congelado: lo que hace posible borrarlo con exactitud. */
export const manifestPath = (set: number): string => `${setDir(set)}/manifest.json`;

/**
 * Lo que queda anotado de un set el día que se congela.
 *
 * `patches` es la pieza que no se puede reconstruir después: R2 guarda tanto las
 * crudas archivadas como el resumen bajo `patch=<parche>/`, nunca bajo el número
 * de set. Sin esta lista, borrar el Set 17 de R2 sería adivinar qué parches
 * fueron suyos, y adivinar de menos deja basura mientras que adivinar de más
 * borra el set vigente.
 */
export interface SetManifest {
  set: number;
  /** Todos los parches (versión de cliente) que compusieron el set. */
  patches: string[];
  /** El primero y el último día con partidas, UTC. */
  from: string;
  to: string;
  /** Tableros, no partidas — la misma unidad que `sampleSize` en comps.json. */
  sampleSize: number;
  /** Cuándo se congeló, y con qué se generó. */
  frozenAt: string;
  /** Si ya se borraron las crudas y el resumen de este set. */
  purgedAt?: string;
}

/** Una entrada del índice: lo mínimo que la UI necesita para ofrecer el set. */
export interface ArchivedSet {
  number: number;
  /** Cómo lo llama un jugador: "17". Puede diferir del número interno algún día. */
  label: string;
  frozenAt: string;
  sampleSize: number;
}

export interface SetsIndex {
  sets: ArchivedSet[];
}

/**
 * El índice, o vacío si todavía no se congeló ningún set.
 *
 * Que falte el archivo NO es un error: hoy no hay ningún set archivado y el
 * build tiene que andar igual. Lo que sí tira es un archivo presente pero roto,
 * porque eso significaría publicar el set equivocado sin enterarse.
 */
export function readSetsIndex(path: string = SETS_INDEX): SetsIndex {
  if (!existsSync(path)) return { sets: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SetsIndex;
  if (!Array.isArray(parsed?.sets)) {
    throw new Error(`${path} no tiene un array \`sets\`: el índice de sets archivados está roto.`);
  }
  return parsed;
}

/** Los números de los sets ya congelados, que es lo que `publishedSet()` pide. */
export function archivedSetNumbers(path: string = SETS_INDEX): number[] {
  return readSetsIndex(path).sets.map((s) => s.number);
}
