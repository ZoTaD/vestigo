/**
 * Los conjuntos de la wiki (2026-09-29), del de menor nivel al de mayor. Viven acá y no
 * en la ficha (`D2rSets.tsx`) porque también los usan el Grial y el planificador: importarlos
 * de la ficha les hacía bajar todo lo de la ficha (los datos de farmeo, el bloque y su hoja de
 * estilos) sin mostrar nada de eso.
 */
import setsJson from "@d2r/wiki/sets.json";
import type { GameSet } from "./wiki";

/** El nivel requerido de la pieza más alta del conjunto: por él se ordena la lista y es el "Nivel" de cada tarjeta. */
export function maxReq(s: GameSet): number {
  return Math.max(...s.items.map((i) => i.req));
}

export const SETS = (setsJson as unknown as GameSet[]).slice().sort((a, b) => maxReq(a) - maxReq(b));
