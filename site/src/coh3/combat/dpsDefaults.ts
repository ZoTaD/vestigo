import type { CohGame } from "../games";

/** Las dos unidades con que arranca el comparador DPS de cada juego: la infantería de línea de cada bando. */
export const DPS_DEFAULTS: Record<CohGame, { a: string; b: string }> = {
  coh3: { a: "riflemen_us", b: "grenadier_ger" },
  coh2: { a: "riflemen_squad_mp", b: "grenadier_squad_mp" },
  coh1: { a: "rifleman_squad", b: "volksgrenadier_squad" },
};
