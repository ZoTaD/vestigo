/**
 * El LP de una cuenta a lo largo del tiempo.
 *
 * Riot no reporta cuánto LP dio una partida: el MatchDto no lo trae y
 * `by-puuid` contesta el rango de ahora, no una serie. La historia vieja no se
 * puede reconstruir, así que se graba de acá en adelante y se calcula sobre lo
 * grabado. Todo lo que hay en este archivo es aritmética pura, sin prosa: la
 * copia vive en i18n.ts, como toda la del producto.
 */

/** Los tiers con divisiones, del piso hacia arriba. */
export const TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
] as const;

/**
 * Los tres tiers de arriba, que NO tienen divisiones y comparten un mismo pool
 * de LP. Grandmaster y Challenger son cortes sobre la recta de Master, no
 * escalones con LP propio, así que los tres arrancan en el mismo lugar.
 */
export const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

const DIVISIONS = ["IV", "III", "II", "I"];
const PER_DIVISION = 100;
const PER_TIER = DIVISIONS.length * PER_DIVISION;
/** Donde termina Diamante I: siete tiers de cuatrocientos. */
const APEX_BASE = TIERS.length * PER_TIER;

/**
 * La cola rankeada estándar, la única que mueve LP.
 *
 * `tft_game_type: "standard"` no alcanza para decidirlo: medido sobre el store,
 * ese campo también cubre las normales (1090), Choncc's Treasure (1210) y los
 * modos de evento. Por eso la cola se compara por número.
 */
export const RANKED_QUEUE = 1100;

/**
 * El rango como un solo número comparable.
 *
 * Restar LP crudo entre dos momentos miente apenas alguien cambia de división:
 * subir de Oro I con 100 LP a Platino IV con 12 es +12, y la resta a secas da
 * −88. Esta escala existe para que la resta sea la verdad.
 *
 * Devuelve null cuando el rango no se puede ubicar —sin clasificar, o un tier
 * que no conocemos— porque un cero ahí se confundiría con Hierro IV.
 */
export function absoluteLp(tier: string, division: string, lp: number): number | null {
  const name = tier.trim().toUpperCase();
  if (APEX_TIERS.has(name)) return APEX_BASE + lp;
  const t = TIERS.indexOf(name as (typeof TIERS)[number]);
  if (t < 0) return null;
  const d = DIVISIONS.indexOf(division.trim().toUpperCase());
  if (d < 0) return null;
  return t * PER_TIER + d * PER_DIVISION + lp;
}

/** Un rango leído en un momento dado. */
export interface LpSnapshot {
  tier: string;
  division: string;
  leaguePoints: number;
  /**
   * wins + losses de la cola rankeada: cuántas partidas lleva jugadas.
   *
   * Verificado contra la API en vivo el 2026-07-25 sobre seis cuentas separadas
   * por dos días —incluida una que no jugó nada— y sobre las cuarenta partidas
   * de esas ventanas: avanza exactamente uno por ranked. Es lo que permite
   * afirmar el LP de una partida en vez de estimarlo.
   */
  games: number;
  setNumber: number | null;
  /** Epoch en milisegundos. */
  takenAt: number;
}

export interface LpPoint {
  takenAt: number;
  absolute: number;
  tier: string;
  division: string;
  leaguePoints: number;
}

/**
 * Los puntos de un set, ordenados del más viejo al más nuevo.
 *
 * Se filtra por set porque el rango se resetea entre uno y otro: una línea que
 * cruce ese corte dibujaría un derrumbe que nunca pasó. Con `set` en null no
 * filtra, que es lo que hace falta cuando todavía no sabemos de qué set es la
 * cuenta.
 */
export function series(snapshots: LpSnapshot[], set: number | null): LpPoint[] {
  return snapshots
    .filter((s) => set === null || s.setNumber === set)
    .map((s) => {
      const absolute = absoluteLp(s.tier, s.division, s.leaguePoints);
      return absolute === null
        ? null
        : {
            takenAt: s.takenAt,
            absolute,
            tier: s.tier,
            division: s.division,
            leaguePoints: s.leaguePoints,
          };
    })
    .filter((p): p is LpPoint => p !== null)
    .sort((a, b) => a.takenAt - b.takenAt);
}

/**
 * Cuánto LP dio cada partida, solo donde eso se puede afirmar.
 *
 * Entre dos snapshots consecutivos, el contador de Riot dice cuántas rankeds
 * pasaron —incluidas las que no tenemos— y nuestras partidas dicen cuáles
 * conocemos. Cuando las dos cuentas valen uno, la resta de LP ES el LP de esa
 * partida: un hecho, no un modelo.
 *
 * Cuando no coinciden falta información, y la respuesta correcta es no decir
 * nada. Repartir el total de una ventana entre sus partidas sería inventar un
 * número con cara de dato, que es justo lo que este producto no hace.
 */
export function attribute(
  snapshots: LpSnapshot[],
  matches: { matchId: string; playedAt: number; queueId: number }[]
): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = [...snapshots].sort((a, b) => a.takenAt - b.takenAt);

  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1];
    const b = ordered[i];
    // Cruzar un reset de rango no significaría nada.
    if (a.setNumber !== b.setNumber) continue;
    if (b.games - a.games !== 1) continue;

    const before = absoluteLp(a.tier, a.division, a.leaguePoints);
    const after = absoluteLp(b.tier, b.division, b.leaguePoints);
    if (before === null || after === null) continue;

    const candidates = matches.filter(
      (m) => m.queueId === RANKED_QUEUE && m.playedAt > a.takenAt && m.playedAt <= b.takenAt
    );
    if (candidates.length !== 1) continue;

    out.set(candidates[0].matchId, after - before);
  }
  return out;
}
