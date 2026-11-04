/**
 * Dónde quedaste hoy, en vez de la lista de nombres mientras el ranking está en
 * construcción (ZoTaD, 4/11): con muchos jugadores, un porcentaje ("Top 0.5%");
 * con pocos, el puesto ("#2 of 8"), porque "Top 25%" con 8 personas no dice nada.
 */
export const STANDING_MIN_PLAYERS = 20;

export type Standing = { kind: "top"; value: string } | { kind: "place"; value: string; of: string };

export function standingText({ pos, players }: { pos: number; players: number }): Standing {
  if (players < STANDING_MIN_PLAYERS) return { kind: "place", value: String(pos), of: String(players) };
  const pct = Math.max(0.1, (pos / players) * 100);
  return { kind: "top", value: pct < 1 ? pct.toFixed(1) : String(Math.round(pct)) };
}
