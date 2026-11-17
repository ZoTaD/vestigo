import { useEffect, useState } from "react";
import type { Region } from "./deadlockRegions";

/**
 * El leaderboard de cada héroe (2026-11-17), de
 * `games/deadlock/pipeline/src/heroBoards.ts`: un archivo por héroe con el top
 * 100 por rango unido al top 100 por puntaje. La página de un héroe baja sólo el
 * suyo (~25 KB).
 */

export interface BoardRow {
  id: number;
  name?: string;
  cc?: string;
  reg?: Region;
  badge?: number;
  m: number;
  w: number;
  kpm: number;
  dpm: number;
  apm: number;
  nw: number;
  dmg: number;
  /** 0–100: la parte de los que juegan al héroe que queda por debajo. */
  score: number;
  /** Puesto por rango y por puntaje entre todos los medidos. */
  rp: number;
  sp: number;
  top: number[];
}

export interface HeroBoardFile {
  generatedAt: string;
  heroId: number;
  season: number;
  seasonFinal: boolean;
  minMatches: number;
  pool: number;
  rows: BoardRow[];
}

/** Así viene en el archivo: cada fila es una lista en el orden de `cols` (ver `COLS` en `heroBoards.ts`). */
interface PackedFile extends Omit<HeroBoardFile, "rows"> {
  cols: string[];
  rows: unknown[][];
}

export function unpackBoard(f: PackedFile): HeroBoardFile {
  const { cols, rows, ...rest } = f;
  return {
    ...rest,
    rows: rows.map((r) => {
      const o: Record<string, unknown> = {};
      cols.forEach((k, i) => {
        if (r[i] !== null && r[i] !== undefined) o[k] = r[i];
      });
      return o as unknown as BoardRow;
    }),
  };
}

/** Con la ruta relativa: `import.meta.glob` no entiende alias. */
const FILES = import.meta.glob<{ default: PackedFile }>("../../games/deadlock/data/hero-boards/*.json");

const cargados = new Map<number, HeroBoardFile | null>();
const pidiendo = new Map<number, Promise<HeroBoardFile | null>>();

export function hasHeroBoard(heroId: number): boolean {
  return Object.keys(FILES).some((k) => k.endsWith(`/hero-boards/${heroId}.json`));
}

export function loadHeroBoard(heroId: number): Promise<HeroBoardFile | null> {
  const hit = pidiendo.get(heroId);
  if (hit) return hit;
  const key = Object.keys(FILES).find((k) => k.endsWith(`/hero-boards/${heroId}.json`));
  const p = (key ? FILES[key]().then((m) => unpackBoard(m.default)) : Promise.resolve(null))
    .catch(() => null)
    .then((f) => {
      cargados.set(heroId, f);
      return f;
    });
  pidiendo.set(heroId, p);
  return p;
}

/**
 * El tablero del héroe: `undefined` mientras carga, `null` si no hay.
 * Si el prerender ya lo cargó, sale en el primer dibujo.
 */
export function useHeroBoard(heroId: number | null): HeroBoardFile | null | undefined {
  const [, set] = useState(0);
  useEffect(() => {
    if (heroId === null || cargados.has(heroId)) return;
    let vivo = true;
    loadHeroBoard(heroId).then(() => vivo && set((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, [heroId]);
  if (heroId === null) return null;
  return cargados.has(heroId) ? cargados.get(heroId)! : undefined;
}

export type BoardOrder = "rank" | "score";

/** Las filas en el orden pedido y de la región pedida, con su puesto ya recalculado. */
export function orderRows(rows: BoardRow[], order: BoardOrder, region: Region | null, limit = 100): (BoardRow & { place: number })[] {
  return rows
    .filter((r) => !region || r.reg === region)
    .sort((a, b) => (order === "rank" ? a.rp - b.rp : a.sp - b.sp))
    .slice(0, limit)
    .map((r, i) => ({ ...r, place: i + 1 }));
}
