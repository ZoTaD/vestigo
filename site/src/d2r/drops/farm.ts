/**
 * Lo que guarda `scripts/d2-drops.ts` para las fichas de la wiki (2026-09-29):
 * los mejores jefes y áreas de cada ítem, ya calculados, con claves de lugar
 * cortas ("s.mephisto.2", "a.12.2") y los nombres aparte.
 */
import type { Loc } from "../stats";
import type { Cat } from "./places";
import type { Diff, Target } from "./types";

/** El ítem en la dirección: "u.harlequin-crest", "s.tal-rashas-guardianship", "b.r30". Vive acá porque lo usan las fichas de la wiki sin cargar la calculadora. */
export const targetParam = (t: Target): string => (t.k === "b" ? `b.${t.code}` : `${t.k}.${t.id}`);

export type FarmBoss = [key: string, p: number];
/** La mejor área: el tipo de monstruo que explica su fila (`AreaRow.cat`, el primero que suelta el ítem) y su chance por monstruo. */
export type FarmArea = [key: string, cat: Cat, p: number];
export interface FarmEntry {
  b: FarmBoss[];
  a: FarmArea[];
  /** 1 si se calculó en Clasificación, porque esta temporada sólo cae ahí: la ficha lo avisa. */
  l?: 1;
}
export type FarmFile = Record<string, FarmEntry>;
export interface PlaceNames {
  s: Record<string, Loc>;
  a: Record<string, Loc>;
}

/** "s.mephisto.2.tz" → jefe mephisto en Infierno, aterrorizado. */
export function parsePlaceKey(key: string): { kind: "s" | "a"; id: string; diff: Diff; tz: boolean } {
  const [kind, id, diff, tz] = key.split(".");
  return { kind: kind === "a" ? "a" : "s", id, diff: Number(diff) as Diff, tz: tz === "tz" };
}
