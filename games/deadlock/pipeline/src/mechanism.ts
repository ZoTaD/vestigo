import type { MatchedCell } from "./matching";

/**
 * El mecanismo: qué cambia un ítem, y cuánto vale eso en victorias.
 *
 * **Esto no va a pantalla. Es insumo del cálculo.**
 *
 * La razón es estadística. El resultado de una partida es **un bit**, así que el
 * efecto pareado de una celda trae 1,4-2 puntos de ruido. Daño, muertes y
 * economía son medidas continuas sobre miles de compras y son mucho más
 * precisas. Si predicen la victoria, sirven para estimar mejor con la misma
 * muestra — y predicen: medido fuera de muestra (estimar sobre 7 días, predecir
 * los 8 siguientes), **el mecanismo solo da 0,506 de correlación sin mirar quién
 * ganó**, contra 0,683 de la medición directa, y mezclarlos da 0,703.
 *
 * El reparto adentro del mecanismo contradice la intuición y por eso hay tres
 * variables y no cinco: **muertes evitadas 0,442**, economía 0,231, daño 0,133 y
 * daño mitigado **0,006**. El mitigado no aporta nada y no entra. El daño
 * recibido tampoco: medido, mide exposición y no protección — los ítems de
 * vitalidad muestran *más* daño recibido, porque sobrevivir es absorber golpes en
 * vez de morir.
 */
export interface Mechanism {
  intercept: number;
  /** Por punto de daño relativo (1,0 = el doble que un control). */
  damage: number;
  /** Por muerte extra en los seis minutos siguientes. */
  deaths: number;
  /** Por alma extra de patrimonio. */
  economy: number;
}

const FLAT: Mechanism = { intercept: 0, damage: 0, deaths: 0, economy: 0 };

/**
 * El ajuste que midió una corrida real, para quien lo necesite sin poder
 * repetirla.
 *
 * Son los números del comentario de arriba, y existen como constante porque **la
 * nota del informe de partida usa este mismo reparto** y no puede pagar el pareo
 * entero para volver a estimarlo. `build:builds` publica su propio ajuste en
 * `builds.json`, así que esto es sólo el respaldo de cuando ese archivo no lo
 * traiga —la primera corrida después de agregarlo, por ejemplo—.
 *
 * El signo de `deaths` es negativo: morir resta. El 0,442 del comentario es su
 * magnitud, o sea lo que vale una muerte **evitada**.
 */
export const MEASURED: Mechanism = { intercept: 0, damage: 0.133, deaths: -0.442, economy: 0.231 };

/**
 * Las variables del mecanismo, con el daño en relativo.
 *
 * Relativo y no absoluto porque mil de daño es mucho para un soporte y poco para
 * un carry: en crudo, el coeficiente tendría que valer cosas distintas por héroe.
 */
function features(cell: MatchedCell): [number, number, number, number] {
  const rel = cell.damageControl > 0 ? cell.damage / cell.damageControl : 0;
  return [1, rel, cell.deaths, cell.economy];
}

/**
 * Mínimos cuadrados sobre las celdas de la banda.
 *
 * **Pooled y no una regresión por héroe**: con una por héroe cada una tendría
 * ~110 celdas para cuatro parámetros, que es volver a tener el problema de
 * muestra que esta capa existe para resolver. Lo que se estima acá es cuánto vale
 * una muerte evitada, y eso es del juego, no del personaje.
 */
export function fitMechanism(cells: MatchedCell[]): Mechanism {
  const K = 4;
  if (cells.length < K * 5) return { ...FLAT };

  const X = cells.map(features);
  const y = cells.map((c) => c.win);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  // Ecuaciones normales, resueltas por Gauss-Jordan. Son 4×4: no hace falta
  // traer una librería de álgebra para esto.
  const M: number[][] = [];
  for (let i = 0; i < K; i++) {
    const fila: number[] = [];
    for (let j = 0; j < K; j++) fila.push(mean(X.map((r) => r[i] * r[j])));
    fila.push(mean(X.map((r, n) => r[i] * y[n])));
    M.push(fila);
  }
  for (let i = 0; i < K; i++) {
    let piv = i;
    for (let r = i + 1; r < K; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    // Columna degenerada: no hay nada que estimar, y devolver un ajuste plano
    // deja el encogimiento apuntando al cero, que es la respuesta honesta.
    if (Math.abs(M[piv][i]) < 1e-18) return { ...FLAT };
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i];
    for (let j = i; j <= K; j++) M[i][j] /= d;
    for (let r = 0; r < K; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i; j <= K; j++) M[r][j] -= f * M[i][j];
    }
  }

  return { intercept: M[0][K], damage: M[1][K], deaths: M[2][K], economy: M[3][K] };
}

/** Lo que el mecanismo predice para una celda, en fracción de victoria. */
export function predictWin(fit: Mechanism, cell: MatchedCell): number {
  const [, rel, deaths, economy] = features(cell);
  return fit.intercept + fit.damage * rel + fit.deaths * deaths + fit.economy * economy;
}

/**
 * Cuánto encoger hacia el mecanismo, estimado de los propios datos.
 *
 * Mismo método de los momentos que `shrinkageFrom` en `build.ts` y
 * `shrinkageToward` en `items.ts`, con el blanco corrido una vez más: se compara
 * cuánto se apartan las celdas de lo que el mecanismo predice contra cuánto se
 * apartaría una medición por puro azar. Lo que sobra es señal propia del par
 * héroe-ítem, y es lo que el encogimiento tiene que preservar.
 *
 * **Que éste sea el blanco correcto está medido**: el peso óptimo del mecanismo
 * baja monótonamente al crecer la muestra (0,5 con 300-600 compras, 0,2 con más
 * de 3.000), que es exactamente la firma de un blanco de encogimiento. El `k`
 * implícito en esos pesos (~600-700) coincide con el que da este cálculo (648).
 */
export function shrinkageToMechanism(cells: MatchedCell[], fit: Mechanism): number {
  const usables = cells.filter((c) => c.n > 0);
  if (usables.length < 2) return Number.POSITIVE_INFINITY;

  const observada =
    usables.reduce((a, c) => a + (c.win - predictWin(fit, c)) ** 2, 0) / usables.length;
  // La varianza de una diferencia de tasas, acotada por arriba: p(1−p) ≤ 0,25 y
  // los controles son muchos más que los tratados, así que manda el lado chico.
  const porAzar = usables.reduce((a, c) => a + 0.25 / c.n, 0) / usables.length;

  const real = observada - porAzar;
  if (real <= 0) return Number.POSITIVE_INFINITY;
  return 0.25 / real;
}

/** Mezcla el valor medido con su blanco, en proporción a la muestra. */
export function shrinkToward(value: number, target: number, n: number, k: number): number {
  if (!Number.isFinite(k)) return target;
  if (k <= 0 || n <= 0) return value;
  return (n * value + k * target) / (n + k);
}
