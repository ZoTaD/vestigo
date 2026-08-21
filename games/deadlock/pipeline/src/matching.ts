/**
 * El estimador pareado: qué le aporta un ítem a un héroe, comparándolo contra
 * quien llegó al mismo punto de la partida y gastó lo mismo en otra cosa.
 *
 * **Por qué no alcanza el winrate.** El winrate de una compra es en buena medida
 * un termómetro de la partida en la que se compró: comprar un ítem de 6400
 * significa que la partida llegó al minuto 32 con almas de sobra. Filtrar por
 * héroe no lo arregla — cada héroe tiene su propia curva y su propio momento de
 * compra. Medido sobre la banda por defecto, parear cambia **137 de 380 puestos
 * del top 10 por héroe**, y lo que más mueve son los ítems de robo de vida, que
 * pierden la mitad de su ventaja aparente: se compran cuando la partida ya venía
 * bien.
 *
 * El método es *coarsened exact matching*: se agrupa por covariables engrosadas
 * —héroe, bloque de cinco minutos, quintil de patrimonio, precio— y se compara
 * adentro del grupo. Sin modelo y sin ML; lo caro lo hace SQL y acá vive el
 * criterio, que es lo único que tiene sentido probar sin red.
 *
 * Ver `docs/design/2026-07-30-builds-por-heroe-deadlock-design.md`.
 */

/**
 * Cuántas compras del ítem hacen falta en un estrato para que ese estrato cuente.
 *
 * Sin este piso, un estrato con una sola compra produce un efecto de ±100 puntos
 * —ganó o no ganó— y domina el promedio pesado. La primera medición de esto dio
 * deltas de −80 puntos por exactamente eso.
 */
export const MIN_TREATED = 5;

/** Cuántos controles hacen falta para que la comparación signifique algo. */
export const MIN_CONTROL = 20;

/**
 * Un estrato tal como lo devuelve SQL: las compras de UN ítem adentro de él, más
 * los totales del estrato entero al mismo precio (que incluyen a las tratadas).
 *
 * Los controles se calculan restando y no con una segunda consulta: "los que
 * gastaron lo mismo en otra cosa" es exactamente el total menos éstas.
 */
export interface StratumRow {
  heroId: number;
  itemId: number;
  cost: number;
  /** Tratados: compras de este ítem en este estrato. */
  n: number;
  wins: number;
  /** Sumas de lo que pasó en los seis minutos siguientes a cada compra. */
  damage: number;
  deaths: number;
  economy: number;
  /** El estrato entero al mismo precio, con los tratados adentro. */
  totalN: number;
  totalWins: number;
  totalDamage: number;
  totalDeaths: number;
  totalEconomy: number;
}

/** El efecto de un ítem en un héroe, ya combinado sobre todos sus estratos. */
export interface MatchedCell {
  heroId: number;
  itemId: number;
  cost: number;
  /** Compras que entraron en algún estrato válido. Es el peso de la estimación. */
  n: number;
  /** Puntos de victoria en fracción (0,05 = cinco puntos), contra los controles. */
  win: number;
  /** Diferencias contra los controles en los seis minutos siguientes. */
  damage: number;
  deaths: number;
  economy: number;
  /**
   * Lo que hace un control típico en esos seis minutos.
   *
   * Se lleva junto al efecto porque `damage` en crudo no es comparable entre
   * héroes: mil de daño es mucho para un soporte y poco para un carry. La
   * regresión de mecanismo usa el cociente.
   */
  damageControl: number;
}

/**
 * Combina los estratos de cada (héroe, ítem) en un solo efecto.
 *
 * **El peso es la cantidad de tratados**, así que lo que se estima es el efecto
 * sobre quien efectivamente compra el ítem, no sobre un jugador promedio que tal
 * vez nunca lo compraría.
 */
export function matchedCells(rows: StratumRow[]): MatchedCell[] {
  const acc = new Map<string, MatchedCell>();

  for (const s of rows) {
    const controlN = s.totalN - s.n;
    if (s.n < MIN_TREATED || controlN < MIN_CONTROL) continue;

    const key = `${s.heroId}|${s.itemId}`;
    const cur: MatchedCell = acc.get(key) ?? {
      heroId: s.heroId,
      itemId: s.itemId,
      cost: s.cost,
      n: 0,
      win: 0,
      damage: 0,
      deaths: 0,
      economy: 0,
      damageControl: 0,
    };

    const tratado = (v: number) => v / s.n;
    const control = (v: number, total: number) => (total - v) / controlN;
    const efecto = (v: number, total: number) => tratado(v) - control(v, total);

    cur.n += s.n;
    cur.win += s.n * efecto(s.wins, s.totalWins);
    cur.damage += s.n * efecto(s.damage, s.totalDamage);
    cur.deaths += s.n * efecto(s.deaths, s.totalDeaths);
    cur.economy += s.n * efecto(s.economy, s.totalEconomy);
    cur.damageControl += s.n * control(s.damage, s.totalDamage);
    acc.set(key, cur);
  }

  return [...acc.values()].map((c) => ({
    ...c,
    win: c.win / c.n,
    damage: c.damage / c.n,
    deaths: c.deaths / c.n,
    economy: c.economy / c.n,
    damageControl: c.damageControl / c.n,
  }));
}
