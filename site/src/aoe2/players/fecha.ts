/**
 * Fechas de AoE2 siempre con año (2026-11-26): un jugador que juega poco mezcla partidas de dos años y "27 jul" después
 * de "3 dic" confundía.
 */
export const fechaConAnio = (segundos: number, lang: string): string =>
  new Date(segundos * 1000).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
