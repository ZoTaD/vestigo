/**
 * El conversor de sensibilidad de la pestaña Miras (2026-11-04). Cada juego gira `yaw` grados por cuenta del mouse y por
 * punto de sensibilidad; dos sensibilidades dan la misma vuelta si `sens × yaw` es igual. Los valores de yaw son los
 * que usa la comunidad (cotejados en mouse-sensitivity.com y en las wikis de cada juego el 2026-11-04).
 */
export interface Game {
  id: string;
  name: string;
  yaw: number;
}

export const GAMES: Game[] = [
  { id: "cs2", name: "Counter-Strike 2", yaw: 0.022 },
  { id: "valorant", name: "Valorant", yaw: 0.07 },
  { id: "deadlock", name: "Deadlock", yaw: 0.044 },
  { id: "apex", name: "Apex Legends", yaw: 0.022 },
  { id: "ow2", name: "Overwatch 2", yaw: 0.0066 },
  { id: "tf2", name: "Team Fortress 2", yaw: 0.022 },
  { id: "csgo", name: "CS:GO / CS 1.6 / Source", yaw: 0.022 },
];

/** Centímetros de mouse para una vuelta entera. */
export const cm360 = (sens: number, dpi: number, yaw: number): number => (360 / (sens * dpi * yaw)) * 2.54;
/** La sensibilidad en otro juego que da la misma vuelta. */
export const convert = (sens: number, from: Game, to: Game): number => (sens * from.yaw) / to.yaw;
/** eDPI de CS2 (DPI × sensibilidad de CS2), el número con que se comparan los pros. */
export const edpiCs2 = (sens: number, dpi: number, from: Game): number => dpi * convert(sens, from, GAMES[0]);
