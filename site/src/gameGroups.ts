import type { Game } from "./Nav";

/** Las categorías en las que se reparten los juegos, en el menú de la barra y en la portada. */
export type GameGroup = "survival" | "arpg" | "shooters";

/**
 * Qué juego va en qué categoría y en qué orden (2026-10-12). Un juego nuevo se suma acá y aparece solo en el
 * menú "Juegos" de la barra; en la portada además hay que escribirle el panel.
 */
export const GAME_GROUPS: { id: GameGroup; games: Game[] }[] = [
  { id: "survival", games: ["valheim", "zomboid", "rust"] },
  { id: "arpg", games: ["poe2", "d2r"] },
  { id: "shooters", games: ["deadlock"] },
];
