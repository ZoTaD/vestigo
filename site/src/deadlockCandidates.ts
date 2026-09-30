/**
 * Los seis héroes en votación de City Never Sleeps (2026-09-29).
 *
 * Todavía no se juegan: la API los trae sin kit ni retrato. Salen de a dos por
 * semana desde el 2 de octubre, en el orden que vote la gente, así que acá sólo
 * van su cara (el sticker de la votación del juego) y su nombre oficial. La
 * caja deja de mostrarse cuando pasó la última salida del calendario.
 */
export interface Candidate {
  code: string;
  name: { en: string; es: string };
}

export const CANDIDATES: readonly Candidate[] = [
  { code: "deadpack", name: { en: "Deadman Danny", es: "Danny Difunto" } },
  { code: "nurse", name: { en: "Nurse Harrow", es: "Enfermera Harrow" } },
  { code: "chessmaster", name: { en: "Solomon", es: "Salomón" } },
  { code: "baba", name: { en: "Baba", es: "Yagá" } },
  { code: "artist", name: { en: "Violet", es: "Violeta" } },
  { code: "ratking", name: { en: "Rat King", es: "Rey Rata" } },
];

/** La edición especial de Vestigo News que los presenta. */
export const CANDIDATES_EDITION = "2026-09-29";
/** La última salida del calendario (2 por semana desde el 2/10): después, la caja se va. */
const HASTA = Date.parse("2026-10-21T00:00:00Z");

export const candidatesVisible = (now: number = Date.now()): boolean => now < HASTA;

export const stickerOf = (code: string): string => `/deadlock/game/news/2026-09-29/sticker-${code}.webp`;
