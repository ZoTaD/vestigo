/**
 * Los breakpoints de Diablo II (2026-09-29): cuántos cuadros tarda lanzar,
 * recuperarse de un golpe y bloquear, según la clase y el tipo de arma, para
 * cada porcentaje de FCR, FHR y FBR. Las tablas las calcula `wiki.py` con la
 * fórmula del juego sobre `animdata.d2` (y dan las clásicas de siempre).
 * Lo usan la pestaña Breakpoints y el planificador.
 */
import breakpointsJson from "@d2r/wiki/breakpoints.json";

export type BpKind = "fcr" | "fhr" | "fbr";
/** [porcentaje desde el que se llega, cuadros] */
export type BpRow = [number, number];
export interface BpGroup {
  w: string[];
  table: BpRow[];
}

export const BREAKPOINTS = breakpointsJson as unknown as Record<string, Record<BpKind, BpGroup[]>>;

/** La tabla de una clase para un tipo de arma (o la primera, que suele ser "sin arma"). */
export function bpTable(cls: string, kind: BpKind, wclass = "HTH"): BpRow[] | null {
  const groups = BREAKPOINTS[cls]?.[kind];
  if (!groups?.length) return null;
  return (groups.find((g) => g.w.includes(wclass)) ?? groups[0]).table;
}

/** En qué escalón está un porcentaje y cuál es el siguiente. */
export function bpState(table: BpRow[], pct: number): { frames: number; next: BpRow | null; index: number } {
  let index = 0;
  for (let i = 0; i < table.length; i++) if (table[i][0] <= pct) index = i;
  return { frames: table[index][1], next: table[index + 1] ?? null, index };
}
