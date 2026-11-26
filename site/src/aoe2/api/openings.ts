/**
 * Las aperturas de AoE2 (2026-11-20): las mismas reglas que `games/aoe2/tools/openings.py` (ver ahí qué significa cada
 * una). Tiempos en segundos de juego.
 */
import type { Accion } from "./replay";

export type Opening = "scouts" | "drush" | "drush_fc" | "archers" | "maa" | "fc" | "boom" | "tower" | "other";
export const OPENINGS: Opening[] = ["scouts", "archers", "maa", "drush", "drush_fc", "fc", "boom", "tower", "other"];

export const FEUDAL = 101;
export const CASTLE = 102;
export const MAA_UPGRADE = 222;
export const MILITIA = 74;
export const SCOUT = 448;
export const EAGLE = 751;
export const ARCHER = 4;
export const TOWER = 79;
export const TOWN_CENTER = 109;
const RESPUESTA = new Set([7, 93]);
const MILITARES = new Set([MILITIA, SCOUT, EAGLE, ARCHER, 5, 24, 39, 93, 7]);

export function classify(acciones: readonly Accion[], jugador: number): Opening {
  const mias = acciones.filter((a) => a.player === jugador).sort((a, b) => a.t - b.t);
  const feudal = mias.find((a) => a.kind === "research" && a.id === FEUDAL)?.t;
  if (feudal == null) return "other";
  const castillo = mias.find((a) => a.kind === "research" && a.id === CASTLE)?.t;
  const drush = mias.filter((a) => a.kind === "queue" && a.id === MILITIA && a.t < feudal).length >= 2;
  const finFeudal = castillo ?? feudal + 600;
  const ejercito = mias.filter((a) => a.kind === "queue" && MILITARES.has(a.id) && !RESPUESTA.has(a.id) && a.t >= feudal && a.t < finFeudal);
  if (drush) return castillo != null && !ejercito.length ? "drush_fc" : "drush";
  if (mias.filter((a) => a.kind === "build" && a.id === TOWER && a.t >= feudal && a.t < feudal + 300).length >= 2) return "tower";
  if (castillo != null && !ejercito.length) {
    const centros = mias.filter((a) => a.kind === "build" && a.id === TOWN_CENTER && a.t >= castillo && a.t < castillo + 400);
    return centros.length >= 2 ? "boom" : "fc";
  }
  if (!ejercito.length) return "other";
  const primero = ejercito[0].id;
  if (primero === SCOUT || primero === EAGLE) return "scouts";
  if (primero === ARCHER) return "archers";
  if (primero === MILITIA) return mias.some((a) => a.kind === "research" && a.id === MAA_UPGRADE && a.t < finFeudal) ? "maa" : "other";
  return "other";
}

export function openings(acciones: readonly Accion[]): Record<number, Opening> {
  const js = [...new Set(acciones.map((a) => a.player).filter((p) => p > 0))].sort((a, b) => a - b);
  return Object.fromEntries(js.map((j) => [j, classify(acciones, j)]));
}
