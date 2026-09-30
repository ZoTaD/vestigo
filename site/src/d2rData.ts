/**
 * Los datos de Diablo II: Resurrected (2026-09-29), tal como los escribe
 * `games/d2r/tools/extract.py` desde la instalación del juego. Viajan dentro
 * del chunk de la sección: son unos pocos KB y así la portada sale entera en el
 * HTML prerenderizado.
 */
import home from "@d2r/home.json";
import meta from "@d2r/meta.json";

/** Un nombre del juego en los dos idiomas del sitio (el español es `esMX`). */
export type Loc = { en: string; es: string };

export interface Rune {
  /** "el", "ber"… Es el nombre del archivo de su ícono. */
  id: string;
  /** "r01"…"r33", el orden del juego. */
  code: string;
  name: Loc;
  lvl: number;
  /** Las palabras rúnicas completas del juego que la usan. */
  runewords: Loc[];
}

export interface D2rHome {
  counts: { runes: number; runewords: number; uniques: number; sets: number; setItems: number; cubeRecipes: number; gems: number; bases: number };
  runes: Rune[];
  classes: { id: string; name: Loc }[];
  events: { id: string; name: Loc }[];
}

export const HOME = home as D2rHome;
export const META = meta as { build: string; patch: string; counts: D2rHome["counts"]; extractedAt: string };

/** Una imagen del juego, servida desde el sitio (`public/d2r/game`). */
export const gameImg = (path: string, ext = "webp") => `/d2r/game/${path}.${ext}`;
