import type { Lang } from "./i18n";

/**
 * Los nombres de las bandas de rango de Deadlock (2026-09-25).
 *
 * Viven aparte de `deadlockCopy.ts` porque la portada los necesita ("en
 * Fantasma+") y no el resto de la copia de Deadlock: importarla por esto eran
 * 94 KB de más en la página de llegada del sitio. `deadlockCopy.ts` los toma de
 * acá, así que se escriben una sola vez.
 */
const EN = {
  "phantom-above": "Phantom+",
  "archon-oracle": "Emissary / Oracle",
  "ritualist-emissary": "Mystic / Ritualist",
  "arcanist-below": "Sentinel and below",
};

const ES: typeof EN = {
  "phantom-above": "Fantasma+",
  "archon-oracle": "Emisario/a / Oráculo",
  "ritualist-emissary": "Místico/a / Ritualista",
  "arcanist-below": "Centinela y abajo",
};

export const DL_BAND_NAMES: Record<Lang, typeof EN> = { en: EN, es: ES };
