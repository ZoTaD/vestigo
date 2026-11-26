import type { Game } from "./Nav";

/** Las categorías en las que se reparten los juegos, en el menú de la barra y en la portada. */
export type GameGroup = "survival" | "arpg" | "shooters" | "rts";

/**
 * Qué juego va en qué categoría y en qué orden (2026-10-12). Un juego nuevo se suma acá y a `GAME_LOGOS`, y aparece
 * solo en el menú "Games" de la barra; en la portada además hay que escribirle el panel.
 *
 * Rust y Terraria no están desde el 2026-11-02: quedaron congelados (sin actualizar), para dejar tres survival. Sus páginas siguen publicadas y en el sitemap,
 * así lo que Google ya conoce no da 404, pero no se ofrece en el menú ni en la portada. Para volver a mostrarlo, va
 * de nuevo acá y en `Home.tsx` (ver el historial de git).
 *
 * PoE2, Diablo II y Warframe (la categoría ARPG entera) tampoco desde el 2026-11-05: además salen del sitemap
 * (`SITEMAP_HIDDEN` en `sitemap.ts`) y se borran el 2026-12-05 con 301 al Home.
 */
/**
 * Age of Empires II sale oculto (2026-11-26): publicado para que el colector diario junte partidas antes de anunciarlo,
 * pero fuera del menú, de la portada, del menú de la cuenta y del sitemap. Para mostrarlo, esto va en `false`.
 */
export const AOE2_OCULTO = true;

export const GAME_GROUPS: { id: GameGroup; games: Game[] }[] = [
  { id: "survival", games: ["valheim", "zomboid", "stardew"] },
  { id: "shooters", games: ["deadlock", "cs2"] },
  // RTS (2026-11-04): el género nuevo arranca con Company of Heroes 3.
  { id: "rts", games: AOE2_OCULTO ? ["coh3"] : ["coh3", "aoe2"] },
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
  warframe: [116, 30],
  cs2: [88, 34],
  coh3: [66, 40],
  aoe2: [58, 40],
};

/** El archivo del logo de un juego en `public/logos/`: casi todos son PNG sacados de la caché de Steam; el de Warframe es un SVG propio. */
export const logoFile = (game: Game): string => (game === "warframe" ? "warframe.svg" : `${game}.png`);
