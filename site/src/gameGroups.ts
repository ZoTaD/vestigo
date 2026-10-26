import type { Game } from "./Nav";

/** Las categorías en las que se reparten los juegos, en el menú de la barra y en la portada. */
export type GameGroup = "survival" | "arpg" | "shooters";

/**
 * Qué juego va en qué categoría y en qué orden (2026-10-12). Un juego nuevo se suma acá y a `GAME_LOGOS`, y aparece
 * solo en el menú "Games" de la barra; en la portada además hay que escribirle el panel.
 */
export const GAME_GROUPS: { id: GameGroup; games: Game[] }[] = [
  { id: "survival", games: ["valheim", "zomboid", "rust", "terraria", "stardew"] },
  { id: "arpg", games: ["poe2", "d2r"] },
  { id: "shooters", games: ["deadlock"] },
];

/**
 * El logo de cada juego en el menú (2026-10-26): `public/logos/<juego>.png`, sólo la forma (un canal alfa) para que
 * el CSS lo pinte del color del texto, como hace Mobalytics. Ancho y alto a 1x (el PNG está a 2x): todos ocupan la
 * misma superficie, así un logo ancho como el de Deadlock no se come a uno alto como el de Zomboid. Los arma
 * `scripts/game_logos.py`, que imprime estos números.
 */
export const GAME_LOGOS: Record<Game, [w: number, h: number]> = {
  deadlock: [123, 28],
  valheim: [95, 36],
  zomboid: [61, 40],
  stardew: [86, 39],
  rust: [119, 29],
  terraria: [121, 28],
  d2r: [106, 32],
  poe2: [78, 40],
};
