# Builds por héroe en Deadlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `/deadlock/builds/<héroe>` — qué ítems rinden con cada héroe, medido contra quien llegó al mismo punto de la partida y gastó lo mismo en otra cosa.

**Architecture:** Un pipeline nuevo (`builds.ts`) lee el snapshot con DuckDB, alinea cada compra con el estado del jugador vía `ASOF JOIN`, agrupa en estratos (héroe × bloque de 5 min × quintil de patrimonio × precio) y deja que TypeScript aplique el criterio: efecto pareado, regresión de mecanismo y encogimiento. Escribe un JSON por banda que la UI consume con el mismo reparto que las otras dos pestañas de Deadlock (import estático de la banda por defecto, `import()` para las otras tres).

**Tech Stack:** TypeScript + `@duckdb/node-api` + tsx (pipeline), React + Vite + vitest (UI).

## Global Constraints

- **Spec:** `docs/design/2026-07-30-builds-por-heroe-deadlock-design.md`. Toda decisión de criterio ya está tomada ahí; este plan la implementa, no la rediscute.
- **Ventana:** 15 días hacia atrás desde hoy, **sin anclar al parche**. Usar `MAX_WINDOW_DAYS` de `snapshot.ts`.
- **Filtros de partida:** los que ya viven en `snapshot.ts` — `match_mode = 'Unranked'` y `game_mode = 'Normal'`. No duplicar los literales: importarlos.
- **Umbrales:** `MIN_PUBLISH = 50` (debajo, la fila no existe), `MIN_BUYS = 300` (debajo, `thinData`), `MIN_TREATED = 5` y `MIN_CONTROL = 20` por estrato.
- **Claves del JSON en inglés**, como `heroes.json` e `items.json`. El spec las escribió en español (`ventaja`, `propio`); en el código van `edge`, `edgeRaw`, `edgeMechanism`, `own`. Es la misma corrección que ya se hizo con los slugs en [[vestigo-seo]]: el doc de diseño no manda sobre la convención del repo.
- **División entera en DuckDB es `//`, no `/`.** `/` es división real. Este bug ya costó una medición entera.
- **Restas de columnas `UINTEGER` van casteadas a `BIGINT`** antes de restar, o revientan con "Overflow in subtraction of UINT32".
- **Prosa sólo en `i18n.ts`.** Ningún texto de UI en otro archivo. El vocabulario del juego (nombres de héroes e ítems) se baja traducido del catálogo, nunca se escribe.
- **Español neutro latinoamericano, sin voseo.** "Abre", no "Abrí".
- **Comentarios en el código: explicar el porqué, no el qué**, como el resto del repo.

---

### Task 1: El estimador pareado, puro y sin red

**Files:**
- Create: `games/deadlock/pipeline/src/matching.ts`
- Test: `games/deadlock/pipeline/test/matching.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `StratumRow`, `MatchedCell`, `matchedCells(rows: StratumRow[]): MatchedCell[]`, `MIN_TREATED = 5`, `MIN_CONTROL = 20`.

- [ ] **Step 1: Escribir el test que falla**

Crear `games/deadlock/pipeline/test/matching.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchedCells, MIN_TREATED, MIN_CONTROL, type StratumRow } from "../src/matching";

/** Un estrato con lo mínimo, para no repetir doce campos en cada caso. */
const stratum = (p: Partial<StratumRow>): StratumRow => ({
  heroId: 1, itemId: 10, cost: 3200,
  n: 50, wins: 25, damage: 0, deaths: 0, economy: 0,
  totalN: 100, totalWins: 50, totalDamage: 0, totalDeaths: 0, totalEconomy: 0,
  ...p,
});

describe("matchedCells", () => {
  it("desarma un confundido que el winrate crudo no ve", () => {
    // El ítem se compra sobre todo yendo ganando. Dentro de cada estrato NO
    // aporta nada: gana lo mismo que los controles. El crudo igual lo premia.
    const rows: StratumRow[] = [
      // Estrato "iba ganando": todos ganan el 80%.
      stratum({ n: 50, wins: 40, totalN: 100, totalWins: 80 }),
      // Estrato "iba perdiendo": todos ganan el 20%, y casi nadie lo compra.
      stratum({ n: 10, wins: 2, totalN: 100, totalWins: 20 }),
    ];

    // El crudo: 42 victorias en 60 compras (70%) contra una base de 50%.
    const crudo = (40 + 2) / (50 + 10) - (80 + 20) / (100 + 100);
    expect(crudo).toBeCloseTo(0.2, 10);

    // El pareado: cero, que es la verdad.
    const [cell] = matchedCells(rows);
    expect(cell.win).toBeCloseTo(0, 10);
    expect(cell.n).toBe(60);
  });

  it("pesa cada estrato por sus tratados, no por el estrato entero", () => {
    const rows: StratumRow[] = [
      // 90 compras con +10 puntos.
      stratum({ n: 90, wins: 54, totalN: 190, totalWins: 104 }),
      // 10 compras con −10 puntos.
      stratum({ n: 10, wins: 4, totalN: 110, totalWins: 54 }),
    ];
    const [cell] = matchedCells(rows);
    // (90·(+0,1) + 10·(−0,1)) / 100 = +0,08
    expect(cell.win).toBeCloseTo(0.08, 10);
  });

  it("descarta el estrato sin controles suficientes", () => {
    const rows: StratumRow[] = [
      stratum({ n: 50, wins: 50, totalN: 50 + MIN_CONTROL - 1, totalWins: 50 }),
    ];
    expect(matchedCells(rows)).toEqual([]);
  });

  it("descarta el estrato con un puñado de tratados", () => {
    // Sin este piso un estrato de una compra produce efectos de ±100 puntos y
    // domina el promedio. Ya pasó una vez.
    const rows: StratumRow[] = [
      stratum({ n: MIN_TREATED - 1, wins: 0, totalN: 500, totalWins: 400 }),
    ];
    expect(matchedCells(rows)).toEqual([]);
  });

  it("promedia el mecanismo con el mismo peso que la victoria", () => {
    const rows: StratumRow[] = [
      stratum({
        n: 10, wins: 5, damage: 10_000, deaths: 5, economy: 20_000,
        totalN: 110, totalWins: 55, totalDamage: 60_000, totalDeaths: 105, totalEconomy: 120_000,
      }),
    ];
    const [cell] = matchedCells(rows);
    // Tratados: 1.000 de daño por compra. Controles: 50.000/100 = 500.
    expect(cell.damage).toBeCloseTo(500, 6);
    expect(cell.damageControl).toBeCloseTo(500, 6);
    // Tratados: 0,5 muertes. Controles: 100/100 = 1.
    expect(cell.deaths).toBeCloseTo(-0.5, 6);
    // Tratados: 2.000. Controles: 100.000/100 = 1.000.
    expect(cell.economy).toBeCloseTo(1000, 6);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/deadlock/pipeline -- matching
```

Esperado: FAIL con "Failed to resolve import ../src/matching".

- [ ] **Step 3: Escribir la implementación**

Crear `games/deadlock/pipeline/src/matching.ts`:

```ts
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
   * Se publica junto al efecto porque `damage` en crudo no es comparable entre
   * héroes: mil de daño es mucho para un soporte y poco para un carry. La
   * regresión de mecanismo usa el cociente.
   */
  damageControl: number;
}

interface Acc extends MatchedCell {}

/**
 * Combina los estratos de cada (héroe, ítem) en un solo efecto.
 *
 * **El peso es la cantidad de tratados**, así que lo que se estima es el efecto
 * sobre quien efectivamente compra el ítem, no sobre un jugador promedio que tal
 * vez nunca lo compraría.
 */
export function matchedCells(rows: StratumRow[]): MatchedCell[] {
  const acc = new Map<string, Acc>();

  for (const s of rows) {
    const controlN = s.totalN - s.n;
    if (s.n < MIN_TREATED || controlN < MIN_CONTROL) continue;

    const key = `${s.heroId}|${s.itemId}`;
    const cur =
      acc.get(key) ??
      ({
        heroId: s.heroId, itemId: s.itemId, cost: s.cost,
        n: 0, win: 0, damage: 0, deaths: 0, economy: 0, damageControl: 0,
      } satisfies Acc);

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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npm test --prefix games/deadlock/pipeline -- matching
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add games/deadlock/pipeline/src/matching.ts games/deadlock/pipeline/test/matching.test.ts
git commit -m "feat: measure a Deadlock item against who reached the same point"
```

---

### Task 2: El mecanismo y el encogimiento

**Files:**
- Create: `games/deadlock/pipeline/src/mechanism.ts`
- Test: `games/deadlock/pipeline/test/mechanism.test.ts`

**Interfaces:**
- Consumes: `MatchedCell` de `./matching`.
- Produces: `Mechanism` (`{ intercept, damage, deaths, economy }`), `fitMechanism(cells): Mechanism`, `predictWin(fit, cell): number`, `shrinkageToMechanism(cells, fit): number`, `shrinkToward(value, target, n, k): number`.

- [ ] **Step 1: Escribir el test que falla**

Crear `games/deadlock/pipeline/test/mechanism.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  fitMechanism, predictWin, shrinkageToMechanism, shrinkToward,
} from "../src/mechanism";
import type { MatchedCell } from "../src/matching";

const cell = (p: Partial<MatchedCell>): MatchedCell => ({
  heroId: 1, itemId: 10, cost: 3200, n: 1000,
  win: 0, damage: 0, deaths: 0, economy: 0, damageControl: 1000,
  ...p,
});

describe("fitMechanism", () => {
  it("recupera los coeficientes de un mecanismo conocido", () => {
    // win = 0,01 + 0,1·(daño relativo) − 0,02·muertes + 0,000001·economía
    const cells = [];
    for (let i = 0; i < 60; i++) {
      const rel = (i % 5) / 10;            // 0 … 0,4
      const deaths = ((i % 3) - 1) / 2;    // −0,5 … 0,5
      const economy = (i % 4) * 1000;      // 0 … 3000
      cells.push(cell({
        damage: rel * 1000, deaths, economy,
        win: 0.01 + 0.1 * rel - 0.02 * deaths + 0.000001 * economy,
      }));
    }
    const fit = fitMechanism(cells);
    expect(fit.intercept).toBeCloseTo(0.01, 6);
    expect(fit.damage).toBeCloseTo(0.1, 6);
    expect(fit.deaths).toBeCloseTo(-0.02, 6);
    expect(fit.economy).toBeCloseTo(0.000001, 9);
  });

  it("devuelve un ajuste plano cuando no hay celdas suficientes", () => {
    const fit = fitMechanism([cell({ win: 0.05 })]);
    expect(fit).toEqual({ intercept: 0, damage: 0, deaths: 0, economy: 0 });
  });
});

describe("shrinkageToMechanism", () => {
  it("encoge todo lo posible cuando el residuo es puro ruido", () => {
    // Todas las celdas coinciden con lo que el mecanismo predice: no hay señal
    // propia que preservar, así que k es infinito.
    const fit = { intercept: 0, damage: 0, deaths: 0, economy: 0 };
    const cells = Array.from({ length: 50 }, () => cell({ win: 0, n: 100 }));
    expect(shrinkageToMechanism(cells, fit)).toBe(Number.POSITIVE_INFINITY);
  });

  it("da un k chico cuando los residuos son mucho más grandes que el ruido", () => {
    const fit = { intercept: 0, damage: 0, deaths: 0, economy: 0 };
    // Residuos de ±5 puntos con 100.000 compras cada una: casi todo es real.
    const cells = Array.from({ length: 50 }, (_, i) =>
      cell({ win: i % 2 === 0 ? 0.05 : -0.05, n: 100_000 })
    );
    const k = shrinkageToMechanism(cells, fit);
    // varianza real ≈ 0,0025 → k ≈ 0,25/0,0025 = 100
    expect(k).toBeGreaterThan(90);
    expect(k).toBeLessThan(110);
  });
});

describe("shrinkToward", () => {
  it("con k infinito devuelve el blanco", () => {
    expect(shrinkToward(0.2, 0.05, 1000, Number.POSITIVE_INFINITY)).toBe(0.05);
  });

  it("mezcla en proporción a la muestra", () => {
    // n = k → mitad y mitad.
    expect(shrinkToward(0.2, 0.0, 600, 600)).toBeCloseTo(0.1, 10);
  });

  it("con muestra enorme deja el valor casi intacto", () => {
    expect(shrinkToward(0.2, 0.0, 1_000_000, 600)).toBeCloseTo(0.2, 3);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/deadlock/pipeline -- mechanism
```

Esperado: FAIL con "Failed to resolve import ../src/mechanism".

- [ ] **Step 3: Escribir la implementación**

Crear `games/deadlock/pipeline/src/mechanism.ts`:

```ts
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
    const fila = [];
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npm test --prefix games/deadlock/pipeline -- mechanism
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add games/deadlock/pipeline/src/mechanism.ts games/deadlock/pipeline/test/mechanism.test.ts
git commit -m "feat: turn what an item changes into what it is worth"
```

---

### Task 3: El pipeline que escribe el archivo

**Files:**
- Create: `games/deadlock/pipeline/src/builds.ts`
- Test: `games/deadlock/pipeline/test/builds.test.ts`
- Modify: `games/deadlock/pipeline/package.json` (agregar script `build:builds`)

**Interfaces:**
- Consumes: `matchedCells`, `MatchedCell` de `./matching`; `fitMechanism`, `predictWin`, `shrinkageToMechanism`, `shrinkToward`, `Mechanism` de `./mechanism`; `BANDS`, `DEFAULT_BAND`, `bandPath`, `Band` de `./bands`; `connect`, `listPartitions`, `partitionRanges`, `partitionsCovering`, `partitionUrl`, `PLAYED_MODE`, `PLAYED_GAME_MODE`, `MAX_WINDOW_DAYS`, `PROVISIONAL_MATCHES` de `./snapshot`.
- Produces: `MIN_BUYS = 300`, `MIN_PUBLISH = 50`, `HeroItem`, `HeroBuild`, `BuildsFile`, `buildsFileFrom(cells, extras, band, totals, generatedAt): BuildsFile`, `ownThreshold(values): number`.

- [ ] **Step 1: Escribir el test que falla**

Crear `games/deadlock/pipeline/test/builds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildsFileFrom, ownThreshold, MIN_BUYS, MIN_PUBLISH } from "../src/builds";
import type { MatchedCell } from "../src/matching";
import { BANDS } from "../src/bands";

const band = BANDS[0];
const totals = { matches: 50_000, boards: 500_000, from: "2026-07-15", to: "2026-07-30" };

const cell = (p: Partial<MatchedCell>): MatchedCell => ({
  heroId: 1, itemId: 10, cost: 3200, n: 1000,
  win: 0, damage: 0, deaths: 0, economy: 0, damageControl: 1000,
  ...p,
});

const extras = {
  boardsByHero: new Map([[1, 10_000], [2, 10_000]]),
  buyMinute: new Map([["1|10", 21.5]]),
  globalEdge: new Map([[10, 0.01]]),
};

describe("buildsFileFrom", () => {
  it("no publica una celda por debajo del piso", () => {
    const file = buildsFileFrom([cell({ n: MIN_PUBLISH - 1 })], extras, band, totals, "t");
    expect(file.heroes).toEqual([]);
  });

  it("publica marcada la celda entre el piso y la muestra fina", () => {
    const file = buildsFileFrom([cell({ n: MIN_BUYS - 1, win: 0.05 })], extras, band, totals, "t");
    expect(file.heroes[0].items[0].thinData).toBe(true);
  });

  it("no marca la celda con muestra suficiente", () => {
    const file = buildsFileFrom([cell({ n: MIN_BUYS, win: 0.05 })], extras, band, totals, "t");
    expect(file.heroes[0].items[0].thinData).toBeUndefined();
  });

  it("ordena los ítems de cada héroe por ventaja", () => {
    const file = buildsFileFrom(
      [
        cell({ itemId: 10, win: 0.01, n: 100_000 }),
        cell({ itemId: 11, win: 0.06, n: 100_000 }),
        cell({ itemId: 12, win: 0.03, n: 100_000 }),
      ],
      { ...extras, buyMinute: new Map() },
      band, totals, "t"
    );
    expect(file.heroes[0].items.map((i) => i.itemId)).toEqual([11, 12, 10]);
  });

  it("publica las entradas del cálculo para poder auditarlo", () => {
    const file = buildsFileFrom([cell({ n: 100_000, win: 0.04 })], extras, band, totals, "t");
    const item = file.heroes[0].items[0];
    expect(item.edgeRaw).toBeCloseTo(4, 1);
    expect(typeof item.edgeMechanism).toBe("number");
    expect(typeof file.k).toBe("number");
    expect(file.mechanism).toHaveProperty("deaths");
  });

  it("calcula el uso contra las partidas de ese héroe, no las de la banda", () => {
    const file = buildsFileFrom([cell({ n: 2_000 })], extras, band, totals, "t");
    // 2.000 compras sobre las 10.000 partidas del héroe 1.
    expect(file.heroes[0].items[0].pickRate).toBeCloseTo(0.2, 4);
  });

  it("marca provisional cuando la ventana trae pocas partidas", () => {
    const file = buildsFileFrom([cell({})], extras, band, { ...totals, matches: 10 }, "t");
    expect(file.provisional).toBe(true);
  });
});

describe("ownThreshold", () => {
  it("elige el corte que etiqueta cerca de un quinto de las filas", () => {
    // 100 valores repartidos parejo entre −5 y +5.
    const valores = Array.from({ length: 100 }, (_, i) => (i - 50) / 10);
    const corte = ownThreshold(valores);
    const marcadas = valores.filter((v) => Math.abs(v) >= corte).length;
    expect(marcadas).toBeGreaterThanOrEqual(15);
    expect(marcadas).toBeLessThanOrEqual(25);
  });

  it("devuelve infinito sin datos, así no etiqueta nada", () => {
    expect(ownThreshold([])).toBe(Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/deadlock/pipeline -- builds
```

Esperado: FAIL con "Failed to resolve import ../src/builds".

- [ ] **Step 3: Escribir la implementación**

Crear `games/deadlock/pipeline/src/builds.ts`. La cabecera, los tipos y la parte pura:

```ts
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { BANDS, DEFAULT_BAND, bandPath, type Band } from "./bands";
import {
  connect, listPartitions, partitionRanges, partitionsCovering, partitionUrl,
  PLAYED_MODE, PLAYED_GAME_MODE, MAX_WINDOW_DAYS, PROVISIONAL_MATCHES,
} from "./snapshot";
import { matchedCells, type MatchedCell, type StratumRow } from "./matching";
import {
  fitMechanism, predictWin, shrinkageToMechanism, shrinkToward, type Mechanism,
} from "./mechanism";

/**
 * Qué ítems rinden con cada héroe.
 *
 *   npm run build:builds
 *
 * Los cuatro sitios de stats de Deadlock que existen publican, cuando filtran por
 * héroe, el winrate crudo del ítem con ese héroe. Acá se publica el efecto contra
 * **quien llegó al mismo punto de la partida y gastó lo mismo en otra cosa**, y
 * eso cambia 137 de los 380 puestos del top 10 por héroe.
 *
 * **La ventana son quince días y NO se ancla al parche**, al revés que
 * `build.ts` y `items.ts`. Medido: sobre la ventana del parche vigente (1,8 días)
 * la señal héroe×ítem cae a 0,49 puntos de sd y `k` se va a 10.300, porque los
 * únicos ítems que superan las 300 compras son los que compra todo el mundo. Es
 * el mismo argumento por el que la brecha por rango tiene ventana propia: el
 * winrate de un héroe se mueve con el parche, pero con qué ítems funciona un
 * héroe es de su diseño.
 *
 * Ver `docs/design/2026-07-30-builds-por-heroe-deadlock-design.md`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/builds.json`;
const CATALOG = `${OUT_DIR}/catalog.json`;

/** Debajo de esto la fila se publica marcada como muestra fina. */
export const MIN_BUYS = 300;

/**
 * Debajo de esto la fila no existe.
 *
 * Cincuenta compras no alcanzan ni para que el mecanismo diga algo: la fila
 * sería 100% blanco de encogimiento, o sea el mismo número para todos los héroes
 * que compran ese ítem. Eso no informa, decora.
 */
export const MIN_PUBLISH = 50;

/** Redondeo estable, para que dos corridas del mismo dato den el mismo archivo. */
const r = (n: number, d = 4): number => Number(n.toFixed(d));

export interface HeroItem {
  itemId: number;
  /** Compras del ítem con ese héroe. Es el denominador; no se muestra. */
  n: number;
  /** Puntos de victoria contra quien llegó al mismo punto y gastó lo mismo. */
  edge: number;
  /** Lo pareado sin encoger, para auditar el encogimiento. */
  edgeRaw: number;
  /** Lo que el mecanismo predice solo. Es el blanco del encogimiento. */
  edgeMechanism: number;
  /** Fracción de las partidas de ESE héroe que lo compran. */
  pickRate: number;
  /** Minuto mediano de compra con ese héroe. */
  buyMinute: number;
  /** Cuánto de la ventaja es propio del héroe y no del ítem en general. */
  own: number;
  thinData?: boolean;
}

export interface HeroBuild {
  heroId: number;
  /** Filas jugador de ese héroe en la ventana. El denominador del uso. */
  boards: number;
  items: HeroItem[];
}

export interface BuildsFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  matches: number;
  provisional?: boolean;
  /** El k de esta corrida. Sin él la ventaja no se puede verificar. */
  k: number;
  /** Los coeficientes del mecanismo, por la misma razón. */
  mechanism: Mechanism;
  /** El corte a partir del cual `own` merece una etiqueta. */
  ownThreshold: number;
  heroes: HeroBuild[];
}

export interface Extras {
  /** Filas jugador por héroe, para el uso. */
  boardsByHero: Map<number, number>;
  /** Minuto mediano de compra, por "heroId|itemId". */
  buyMinute: Map<string, number>;
  /** La ventaja del ítem en general, para separar lo propio del héroe. */
  globalEdge: Map<number, number>;
}

/**
 * A partir de qué valor `own` merece una etiqueta.
 *
 * Sale de la distribución real y no de un número elegido: se busca el corte que
 * marque **alrededor de un quinto de las filas**, que es el mismo criterio con el
 * que se fijaron los ±2 de Difícil y el ±1 de Subiendo. Que la mayoría NO tenga
 * etiqueta es lo que hace que la etiqueta se vea.
 */
export function ownThreshold(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  return abs[Math.floor(abs.length * 0.8)] ?? Number.POSITIVE_INFINITY;
}

/**
 * Arma el archivo de una banda.
 *
 * Separado de las consultas a propósito: acá vive todo el criterio y es lo único
 * que tiene sentido probar sin red. Mismo reparto que `heroesFileFrom` e
 * `itemsFileFrom`.
 */
export function buildsFileFrom(
  cells: MatchedCell[],
  extras: Extras,
  band: Band,
  totals: { matches: number; boards: number; from: string; to: string },
  generatedAt: string
): BuildsFile {
  const usables = cells.filter((c) => c.n >= MIN_PUBLISH);
  const fit = fitMechanism(usables);
  const k = shrinkageToMechanism(usables, fit);

  const filas = usables.map((c) => {
    const target = predictWin(fit, c);
    const edge = shrinkToward(c.win, target, c.n, k);
    const boards = extras.boardsByHero.get(c.heroId) ?? 0;
    return {
      heroId: c.heroId,
      item: {
        itemId: c.itemId,
        n: c.n,
        edge: r(edge * 100, 2),
        edgeRaw: r(c.win * 100, 2),
        edgeMechanism: r(target * 100, 2),
        pickRate: boards > 0 ? r(c.n / boards) : 0,
        buyMinute: extras.buyMinute.get(`${c.heroId}|${c.itemId}`) ?? 0,
        own: r((edge - (extras.globalEdge.get(c.itemId) ?? 0)) * 100, 2),
        ...(c.n < MIN_BUYS ? { thinData: true } : {}),
      } satisfies HeroItem,
    };
  });

  const porHeroe = new Map<number, HeroItem[]>();
  for (const f of filas) porHeroe.set(f.heroId, [...(porHeroe.get(f.heroId) ?? []), f.item]);

  const heroes: HeroBuild[] = [...porHeroe]
    .map(([heroId, items]) => ({
      heroId,
      boards: extras.boardsByHero.get(heroId) ?? 0,
      items: items.sort((a, b) => b.edge - a.edge || b.n - a.n),
    }))
    .sort((a, b) => a.heroId - b.heroId);

  return {
    generatedAt,
    band: band.id,
    from: totals.from,
    to: totals.to,
    matches: totals.matches,
    ...(totals.matches < PROVISIONAL_MATCHES ? { provisional: true } : {}),
    // Un k infinito no se puede escribir en JSON: se guarda como 0, que la UI
    // no usa para nada — el encogimiento ya está aplicado en `edge`.
    k: Number.isFinite(k) ? r(k, 0) : 0,
    mechanism: {
      intercept: r(fit.intercept, 6),
      damage: r(fit.damage, 6),
      deaths: r(fit.deaths, 6),
      economy: r(fit.economy, 9),
    },
    ownThreshold: r(ownThreshold(filas.map((f) => f.item.own)), 2),
    heroes,
  };
}
```

Y el `main()`, en el mismo archivo, debajo:

```ts
interface CatalogItem {
  cost: number;
}

/**
 * La ventana como SQL, con las columnas que hacen falta para parear.
 *
 * Vive acá y no en `snapshot.ts` porque **las columnas cuestan**: DuckDB pide por
 * HTTP sólo los pedazos del Parquet que la consulta toca, y sumarle nueve arrays
 * a la ventana de héroes la haría más lenta para nada.
 *
 * Los nombres van entre comillas dobles: en el Parquet la columna se llama
 * literalmente `items.item_id`, con el punto adentro del nombre.
 */
function windowSql(partitions: number[], from: string, to: string): string {
  const union = partitions.map((n) => `select * from read_parquet('${partitionUrl(n)}')`).join(" union all ");
  return `
    select match_id, account_id, hero_id, won,
           coalesce(average_badge_team0, average_badge_team1) // 10 as tier,
           "items.item_id" as item_ids, "items.game_time_s" as item_times,
           "stats.time_stamp_s" as ts, "stats.net_worth" as nw,
           "stats.player_damage" as dmg, "stats.deaths" as deaths
    from (${union})
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and coalesce(average_badge_team0, average_badge_team1) is not null
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'
      and len("stats.time_stamp_s") > 0`;
}

/** Cuánto después de comprar se mide qué cambió el ítem. */
const EFFECT_WINDOW_S = 360;

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { items: Record<string, CatalogItem> };
  const costOf = new Map(Object.entries(catalog.items).map(([id, i]) => [Number(id), i.cost]));
  if (costOf.size === 0) {
    throw new Error("el catálogo no tiene ítems. Corré `npm run catalog` antes que esto.");
  }

  const partitions = await listPartitions();
  const con = await connect();
  const run = (sql: string) => con.run(sql);
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  const ranges = await partitionRanges(con, partitions);
  const parts = partitionsCovering(ranges, desde.toISOString(), hasta.toISOString());
  if (parts.length === 0) {
    throw new Error(
      "el snapshot no tiene ni una partición en los últimos quince días. " +
        "O cambió la forma de las claves, o dejó de publicarse."
    );
  }
  console.log(`ventana ${desde.toISOString().slice(0, 10)} → ${hasta.toISOString().slice(0, 10)}`);
  console.log(`  particiones: ${parts.join(", ")} · ${costOf.size} ítems de tienda`);

  const base = windowSql(parts, desde.toISOString().slice(0, 19), hasta.toISOString().slice(0, 19));
  const t0 = Date.now();

  // Las tablas caras se construyen UNA vez para las cuatro bandas, con `tier`
  // como columna. Reconstruirlas por banda cuadruplicaría lo único que tarda:
  // medido, estas dos son ~20 s cada una y todo lo demás son segundos.
  await run(`create table costo(item_id UINTEGER, cost INTEGER)`);
  await run(
    `insert into costo values ${[...costOf].map(([id, c]) => `(${id}, ${c})`).join(", ")}`
  );
  await run(`create table player as select * from (${base})`);
  await run(`create table estado as
    select match_id, account_id, unnest(ts) as t, unnest(nw) as nw,
           unnest(dmg) as dmg, unnest(deaths) as deaths
    from player`);
  await run(`create table compra as
    select match_id, account_id, hero_id, won, tier,
           unnest(item_ids) as item_id, unnest(item_times) as buy_s
    from player`);
  await run(`delete from compra where buy_s <= 0 or item_id not in (select item_id from costo)`);
  console.log(`  tablas listas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // El estado al comprar y el de seis minutos después. Las series son
  // acumuladas, así que la resta es lo que pasó en esa ventana — y va casteada a
  // BIGINT porque son UINTEGER y una resta negativa revienta.
  const t1 = Date.now();
  await run(`create table pareo as
    select c.hero_id, c.won, c.tier, c.item_id, k.cost, c.buy_s,
           a.nw as wealth,
           d.dmg::BIGINT - a.dmg::BIGINT as d_damage,
           d.deaths::BIGINT - a.deaths::BIGINT as d_deaths,
           d.nw::BIGINT - a.nw::BIGINT as d_economy
    from compra c
    join costo k on k.item_id = c.item_id
    asof left join estado a
      on c.match_id = a.match_id and c.account_id = a.account_id and c.buy_s >= a.t
    asof left join estado d
      on c.match_id = d.match_id and c.account_id = d.account_id
         and c.buy_s + ${EFFECT_WINDOW_S} >= d.t
    where a.nw is not null and d.nw is not null`);
  console.log(`  pareo listo (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

  mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();

  for (const band of BANDS) {
    const tiers = band.tiers.join(", ");
    const t = Date.now();

    // El quintil se calcula DENTRO de la banda: mezclarlas compararía a un
    // Eternus con un Iniciado por tener el mismo patrimonio al minuto 20.
    await run(`create or replace table estrato as
      select *, buy_s // 300 as block,
             ntile(5) over (partition by hero_id, buy_s // 300 order by wealth) as q
      from pareo where tier in (${tiers})`);

    const crudas = (await rows(`
      with p as (
        select hero_id, item_id, cost, block, q, count(*) as n,
               sum(won::INT) as wins, sum(d_damage) as damage,
               sum(d_deaths) as deaths, sum(d_economy) as economy
        from estrato group by 1,2,3,4,5
      ),
      t as (
        select hero_id, cost, block, q, sum(n) as n, sum(wins) as wins,
               sum(damage) as damage, sum(deaths) as deaths, sum(economy) as economy
        from p group by 1,2,3,4
      )
      select p.hero_id::INTEGER as "heroId", p.item_id::INTEGER as "itemId",
             p.cost::INTEGER as cost,
             p.n::INTEGER as n, p.wins::INTEGER as wins,
             p.damage::DOUBLE as damage, p.deaths::DOUBLE as deaths,
             p.economy::DOUBLE as economy,
             t.n::INTEGER as "totalN", t.wins::INTEGER as "totalWins",
             t.damage::DOUBLE as "totalDamage", t.deaths::DOUBLE as "totalDeaths",
             t.economy::DOUBLE as "totalEconomy"
      from p join t
        on t.hero_id = p.hero_id and t.cost = p.cost and t.block = p.block and t.q = p.q`)) as unknown as StratumRow[];

    const cells = matchedCells(crudas);

    const [tot] = (await rows(`
      select count(distinct match_id)::BIGINT as matches, count(*)::BIGINT as boards,
             strftime(min(start_time), '%Y-%m-%d') as "from",
             strftime(max(start_time), '%Y-%m-%d') as "to"
      from (${base}) where tier in (${tiers})`)) as unknown as {
      matches: bigint; boards: bigint; from: string; to: string;
    }[];

    const boardsRows = (await rows(`
      select hero_id::INTEGER as h, count(*)::INTEGER as n
      from player where tier in (${tiers}) group by 1`)) as unknown as { h: number; n: number }[];
    const boardsByHero = new Map(boardsRows.map((x) => [x.h, x.n]));

    const minuteRows = (await rows(`
      select hero_id::INTEGER as h, item_id::INTEGER as i,
             (median(buy_s) / 60)::DOUBLE as m
      from estrato group by 1,2`)) as unknown as { h: number; i: number; m: number }[];
    const buyMinute = new Map(minuteRows.map((x) => [`${x.h}|${x.i}`, Number(x.m.toFixed(1))]));

    // La ventaja del ítem en general, con el mismo pareo pero sin separar por
    // héroe: es contra esto que se mide qué tiene de propio un héroe.
    const globalRows = matchedCells(crudas.map((s) => ({ ...s, heroId: 0 })));
    const globalEdge = new Map(globalRows.map((c) => [c.itemId, c.win]));

    const file = buildsFileFrom(
      cells,
      { boardsByHero, buyMinute, globalEdge },
      band,
      { matches: Number(tot.matches), boards: Number(tot.boards), from: tot.from, to: tot.to },
      generatedAt
    );
    writeFileSync(bandPath(OUT, band.id), JSON.stringify(file));

    const filas = file.heroes.reduce((a, h) => a + h.items.length, 0);
    console.log(
      `  ${band.id.padEnd(20)} ${file.heroes.length} héroes, ${filas} filas, ` +
        `k=${file.k}, ${file.matches.toLocaleString("es")} partidas` +
        `${file.provisional ? " [PROVISIONAL]" : ""} (${((Date.now() - t) / 1000).toFixed(1)}s)` +
        `${band.id === DEFAULT_BAND ? "  [por defecto]" : ""}`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Agregar el script de npm**

En `games/deadlock/pipeline/package.json`, agregar dentro de `"scripts"`, después de `"build:items"`:

```json
    "build:builds": "node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs src/builds.ts",
```

El `--max-old-space-size` está porque este build materializa tablas de millones de filas, al revés que `build:heroes` y `build:items`, que agregan del lado de DuckDB.

- [ ] **Step 5: Correr el test para verificar que pasa**

```bash
npm test --prefix games/deadlock/pipeline -- builds
```

Esperado: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add games/deadlock/pipeline/src/builds.ts games/deadlock/pipeline/test/builds.test.ts games/deadlock/pipeline/package.json
git commit -m "feat: build what each Deadlock hero should buy"
```

---

### Task 4: Correr el pipeline de verdad y verificar los números

Esta tarea no escribe código: comprueba que lo escrito reproduce lo que el spec midió. **Si los números no se parecen, el problema es el código, no el spec** — el spec se midió sobre el mismo snapshot.

**Files:**
- Modify: `games/deadlock/data/builds*.json` (los escribe el build)

- [ ] **Step 1: Correr el catálogo y el build**

```bash
npm run catalog --prefix games/deadlock/pipeline
```

```bash
npm run build:builds --prefix games/deadlock/pipeline
```

Esperado: cuatro líneas, una por banda, en unos 90 segundos en total. La de `phantom-above` tiene que decir **38 héroes** y un `k` de **entre 300 y 1.500** (lo medido fue 648; fuera de ese rango algo está mal).

- [ ] **Step 2: Verificar contra lo que midió el spec**

```bash
node -e "const f=require('./games/deadlock/data/builds.json'); const n=f.heroes.reduce((a,h)=>a+h.items.length,0); const meds=f.heroes.map(h=>h.items.length).sort((a,b)=>a-b); console.log('héroes',f.heroes.length,'| filas',n,'| mediana por héroe',meds[Math.floor(meds.length/2)],'| k',f.k,'| corte own',f.ownThreshold); console.log('mecanismo',JSON.stringify(f.mechanism)); const todos=f.heroes.flatMap(h=>h.items.map(i=>({h:h.heroId,...i}))).sort((a,b)=>b.edge-a.edge); console.log('top 5:',todos.slice(0,5).map(i=>i.itemId+' '+i.edge).join(' | ')); console.log('marcadas por own:',todos.filter(i=>Math.abs(i.own)>=f.ownThreshold).length,'de',n);"
```

Esperado, todo verificable contra el spec:
- **38 héroes**, mediana de **entre 60 y 100 ítems** por héroe.
- `mechanism.deaths` **negativo** (morir menos gana partidas) y de magnitud claramente mayor que `mechanism.damage`.
- Las filas marcadas por `own` cerca del **20%** del total.

- [ ] **Step 3: Verificar que el pareo desarmó el sesgo win-more**

El spec midió que los ítems de robo de vida pierden la mitad de su ventaja al parear. `edgeRaw` ya es pareado, así que lo que se comprueba acá es que ningún ítem quedó con una ventaja absurda:

```bash
node -e "const f=require('./games/deadlock/data/builds.json'); const t=f.heroes.flatMap(h=>h.items); const ext=t.filter(i=>Math.abs(i.edge)>15); console.log('filas con |ventaja| > 15 pts:',ext.length); console.log('rango de ventaja:',Math.min(...t.map(i=>i.edge)).toFixed(2),'a',Math.max(...t.map(i=>i.edge)).toFixed(2));"
```

Esperado: **cero filas** por encima de 15 puntos, y un rango aproximado de −10 a +10. Si aparecen valores de ±80, el bug es el de la división entera (`/` en vez de `//`) o un piso de estrato que no se está aplicando.

- [ ] **Step 4: Verificar que Street Brawl quedó afuera**

Los 17 ítems de coste 9999 se compran **únicamente** en Street Brawl, así que son el canario del filtro de modo: si aparecen, `game_mode = 'Normal'` no se está aplicando.

```bash
node -e "const c=require('./games/deadlock/data/catalog.json'); const caros=new Set(Object.entries(c.items).filter(([,i])=>i.cost>=9999).map(([id])=>Number(id))); const f=require('./games/deadlock/data/builds.json'); const hay=f.heroes.flatMap(h=>h.items).filter(i=>caros.has(i.itemId)); console.log('ítems de 9999 en el catálogo:',caros.size); console.log('filas publicadas con uno:',hay.length);"
```

Esperado: **0 filas publicadas**, sea cual sea el conteo del catálogo.

- [ ] **Step 5: Commit de los datos**

```bash
git add games/deadlock/data
git commit -m "chore: publish the first Deadlock hero builds"
```

---

### Task 5: Las rutas

**Files:**
- Modify: `games/tft/ui/src/route.ts`
- Test: `games/tft/ui/test/route.test.ts`

**Interfaces:**
- Produces: `DeadlockSection` incluye `"builds"`; `Route` gana `dlDetail?: string`; `routePath` construye `/…/deadlock/builds/<slug>`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `games/tft/ui/test/route.test.ts`:

```ts
describe("las builds de Deadlock", () => {
  it("parsea el índice", () => {
    const r = parseRoute("/es/deadlock/builds");
    expect(r.view).toBe("deadlock");
    expect(r.dlSection).toBe("builds");
    expect(r.dlDetail).toBeUndefined();
  });

  it("parsea la página de un héroe", () => {
    const r = parseRoute("/en/deadlock/builds/lady-geist");
    expect(r.dlSection).toBe("builds");
    expect(r.dlDetail).toBe("lady-geist");
  });

  it("no le pone detalle a las otras pestañas de Deadlock", () => {
    // /deadlock/items/lo-que-sea no es una página: los ítems no tienen ficha
    // propia, se abren dentro de la lista.
    expect(parseRoute("/en/deadlock/items/bebop").dlDetail).toBeUndefined();
  });

  it("no deja que un slug de Deadlock se cuele en TFT", () => {
    // Si `builds` entrara en el Section de TFT, esta URL contestaría 200 en una
    // página vacía. Es la misma razón por la que DeadlockSection es un tipo aparte.
    expect(parseRoute("/en/tft/builds").section).toBe("meta");
  });

  it("va y vuelve", () => {
    const r = parseRoute("/es/deadlock/builds/lady-geist");
    expect(routePath(r)).toBe("/es/deadlock/builds/lady-geist");
    expect(routePath({ ...r, dlDetail: undefined })).toBe("/es/deadlock/builds");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/tft/ui -- route
```

Esperado: FAIL — `dlSection` da `"meta"` en vez de `"builds"`.

- [ ] **Step 3: Modificar `route.ts`**

En `games/tft/ui/src/route.ts`:

1. Cambiar la línea 27 y la 33:

```ts
export type DeadlockSection = "meta" | "items" | "builds" | "patches";
```

```ts
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "items", "builds", "patches"];
```

2. Agregar a la interfaz `Route`, después de `dlSection`:

```ts
  /**
   * El héroe, cuando la URL apunta a su build.
   *
   * Campo propio y no el `detail` de TFT: mezclarlos haría que `/tft/builds`
   * parsee a una sección que no existe, que es la misma razón por la que
   * `DeadlockSection` es un tipo aparte.
   */
  dlDetail?: string;
```

3. Reemplazar el bloque de Deadlock en `parseRoute` (líneas 106-109):

```ts
  if (head === "deadlock") {
    const dlSection = rest[1] && isDlSection(rest[1]) ? rest[1] : DEFAULT_DL_SECTION;
    // Sólo las builds tienen página por héroe. Un slug detrás de otra pestaña se
    // ignora en vez de inventar una dirección que la app no sabe dibujar.
    const dlDetail = dlSection === "builds" ? rest[2] : undefined;
    return { ...base, view: "deadlock", dlSection, dlDetail };
  }
```

4. Reemplazar el bloque de Deadlock en `routePath` (líneas 132-134):

```ts
  if (view === "deadlock") {
    if (dlSection === DEFAULT_DL_SECTION) return `/${lang}/deadlock`;
    const base = `/${lang}/deadlock/${dlSection}`;
    return route.dlDetail ? `${base}/${route.dlDetail}` : base;
  }
```

(`routePath` desestructura `route`; agregar `dlDetail` a la desestructuración o usar `route.dlDetail` como arriba.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npm test --prefix games/tft/ui -- route
```

Esperado: PASS, incluyendo los tests que ya existían.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/route.ts games/tft/ui/test/route.test.ts
git commit -m "feat: give every Deadlock hero its own build address"
```

---

### Task 6: La capa de datos de la UI

**Files:**
- Create: `games/tft/ui/src/deadlockBuildsData.ts`
- Test: `games/tft/ui/test/deadlockBuilds.test.ts`

**Interfaces:**
- Consumes: `catalog`, `DEFAULT_BAND`, `BandId` de `./deadlockData`; `slugify` de `./route`; `useLang`, `Lang` de `./i18n`; `text` de `./catalog`.
- Produces: `BuildItem`, `HeroBuildView`, `useBuilds(band): BuildsMeta | null`, `heroSlug(heroId): string`, `heroBySlug(slug): number | null`, `ownKindOf(own, threshold): "own" | "generic" | null`.

- [ ] **Step 1: Escribir el test que falla**

Crear `games/tft/ui/test/deadlockBuilds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ownKindOf } from "../src/deadlockBuildsData";

describe("ownKindOf", () => {
  it("no etiqueta lo que está debajo del corte", () => {
    expect(ownKindOf(1.2, 3)).toBeNull();
    expect(ownKindOf(-1.2, 3)).toBeNull();
  });

  it("marca lo que es propio del héroe", () => {
    expect(ownKindOf(4.5, 3)).toBe("own");
  });

  it("marca lo que rinde menos acá que en general", () => {
    expect(ownKindOf(-4.5, 3)).toBe("generic");
  });

  it("no etiqueta nada cuando el corte es infinito", () => {
    expect(ownKindOf(99, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/tft/ui -- deadlockBuilds
```

Esperado: FAIL con "Failed to resolve import ../src/deadlockBuildsData".

- [ ] **Step 3: Escribir la implementación**

Crear `games/tft/ui/src/deadlockBuildsData.ts`:

```ts
import { useEffect, useReducer } from "react";
import buildsJson from "@deadlock/builds.json";
import { useLang, type Lang } from "./i18n";
import { text, type Localized } from "./catalog";
import { catalog, DEFAULT_BAND, type BandId } from "./deadlockData";
import { slugify } from "./route";

/**
 * La capa de datos de las builds por héroe.
 *
 * Mismo reparto que `deadlockData.ts` y `deadlockItemsData.ts`: la banda por
 * defecto viaja en el bundle con un import estático y las otras tres son
 * `import()`, y **los nombres se resuelven en tiempo de render**, no de import —
 * resolverlos al importar es el bug que dejó el catálogo de TFT en inglés.
 *
 * Lo que cambia es qué significa el número. `edge` son **puntos de victoria
 * contra quien llegó al mismo punto de la partida y gastó lo mismo en otra
 * cosa**, no un winrate. Ver `builds.ts` en el pipeline.
 */

interface RawItem {
  itemId: number;
  n: number;
  edge: number;
  edgeRaw: number;
  edgeMechanism: number;
  pickRate: number;
  buyMinute: number;
  own: number;
  thinData?: boolean;
}

interface RawHero {
  heroId: number;
  boards: number;
  items: RawItem[];
}

export interface BuildsFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  matches: number;
  provisional?: boolean;
  k: number;
  mechanism: { intercept: number; damage: number; deaths: number; economy: number };
  ownThreshold: number;
  heroes: RawHero[];
}

interface ItemCatalog {
  items: Record<string, { name: Localized; img: string; cost: number; slot: string }>;
  heroes: Record<string, { name: Localized; img: string; card: string }>;
}

const full = catalog as unknown as ItemCatalog;

/**
 * Qué dice la etiqueta de `own`, o null cuando no hay nada que decir.
 *
 * `own` es cuánto de la ventaja es propia del héroe y no del ítem en general.
 * Positivo grande = este ítem rinde acá más que en cualquier otro lado.
 * Negativo grande = es un buen ítem que en este héroe no luce.
 *
 * El corte lo calcula el pipeline sobre la distribución real, así que acá no hay
 * ningún número inventado: sólo la lectura.
 */
export type OwnKind = "own" | "generic" | null;

export function ownKindOf(own: number, threshold: number): OwnKind {
  if (!Number.isFinite(threshold)) return null;
  if (own >= threshold) return "own";
  if (own <= -threshold) return "generic";
  return null;
}

/** El slug con el que un héroe aparece en la URL. Siempre del nombre en inglés. */
export const heroSlug = (heroId: number): string =>
  slugify(full.heroes[String(heroId)]?.name.en ?? String(heroId));

export interface BuildItem extends RawItem {
  name: string;
  img: string;
  cost: number;
  ownKind: OwnKind;
}

export interface HeroBuildView {
  heroId: number;
  name: string;
  img: string;
  card: string;
  slug: string;
  boards: number;
  items: BuildItem[];
}

const files = new Map<BandId, BuildsFile>([[DEFAULT_BAND, buildsJson as unknown as BuildsFile]]);

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "archon-oracle": () => import("@deadlock/builds.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/builds.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/builds.arcanist-below.json"),
};

export async function loadBuildBand(band: BandId): Promise<void> {
  if (files.has(band)) return;
  const mod = await LOADERS[band]();
  files.set(band, mod.default as BuildsFile);
}

const cache = new Map<string, HeroBuildView[]>();

export function buildHeroBuilds(band: BandId, lang: Lang): HeroBuildView[] {
  const efectiva = files.has(band) ? band : DEFAULT_BAND;
  const key = `${efectiva}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const file = files.get(efectiva)!;
  const built = file.heroes.flatMap((h) => {
    const hero = full.heroes[String(h.heroId)];
    // Sin entrada en el catálogo no hay ni nombre ni slug, y sin slug no hay
    // página. Sólo puede pasar si el juego suma un héroe entre dos corridas.
    if (!hero) return [];
    return [{
      heroId: h.heroId,
      name: text(hero.name, lang, `#${h.heroId}`),
      img: hero.img,
      card: hero.card,
      slug: heroSlug(h.heroId),
      boards: h.boards,
      items: h.items.flatMap((i) => {
        const entry = full.items[String(i.itemId)];
        if (!entry) return [];
        return [{
          ...i,
          name: text(entry.name, lang, `#${i.itemId}`),
          img: entry.img,
          cost: entry.cost,
          ownKind: ownKindOf(i.own, file.ownThreshold),
        }];
      }),
    }];
  });
  cache.set(key, built);
  return built;
}

export interface BuildsMeta {
  band: BandId;
  heroes: HeroBuildView[];
  file: BuildsFile;
}

/** Las builds de una banda, o null mientras se están bajando. */
export function useBuilds(band: BandId): BuildsMeta | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (files.has(band)) return;
    let alive = true;
    loadBuildBand(band)
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [band]);

  if (!files.has(band)) return null;
  return { band, heroes: buildHeroBuilds(band, lang), file: files.get(band)! };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npm test --prefix games/tft/ui -- deadlockBuilds
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/deadlockBuildsData.ts games/tft/ui/test/deadlockBuilds.test.ts
git commit -m "feat: read the Deadlock hero builds in both languages"
```

---

### Task 7: La página, la copia y el cableado

**Files:**
- Create: `games/tft/ui/src/DeadlockBuilds.tsx`
- Modify: `games/tft/ui/src/i18n.ts` (bloque `deadlock` de `en` y de `es`)
- Modify: `games/tft/ui/src/App.tsx`

**Interfaces:**
- Consumes: `useBuilds`, `HeroBuildView`, `BuildItem` de `./deadlockBuildsData`; `COSTS`, `OPEN_COSTS` de `./deadlockItemsData`; `useCopy`, `useLocale` de `./i18n`.
- Produces: `default function DeadlockBuilds({ band, picker, slug, onHero })`.

- [ ] **Step 1: Agregar la copia**

En `games/tft/ui/src/i18n.ts`, dentro del bloque `deadlock` **de `en`** (el que arranca en la línea ~584), agregar en `tabs` la entrada `builds` y después el bloque nuevo:

```ts
      builds: "Builds",
```

```ts
    builds: {
      title: "What to buy",
      titleBreak: "on each hero",
      lead:
        "Every other site ranks a hero's items by win rate, which mostly ranks the game they were bought in. " +
        "These are measured against players who reached the same minute with the same souls and spent them on something else.",
      pick: "Pick a hero",
      empty: "Not enough games with this hero yet.",
      unknown: "We do not have a build for that hero.",
      stats: { edge: "Edge", usage: "Usage", minute: "Minute" },
      own: "Own to {hero}",
      generic: "Better elsewhere",
      ownWhy: "{points} points of the edge come from this hero, not from the item itself.",
      genericWhy: "This item is worth {points} points less here than it is in general.",
      group: (cost: string, n: number) => `${cost} souls · ${n} items`,
      sample: (matches: string, from: string, to: string) =>
        `${matches} matches · ${from} to ${to}`,
    },
```

En el bloque `deadlock` **de `es`** (línea ~1419), lo mismo:

```ts
      builds: "Builds",
```

```ts
    builds: {
      title: "Qué comprar",
      titleBreak: "en cada héroe",
      lead:
        "Los demás sitios ordenan los ítems de un héroe por winrate, y eso ordena sobre todo la partida en la que se compraron. " +
        "Acá se miden contra jugadores que llegaron al mismo minuto con las mismas almas y las gastaron en otra cosa.",
      pick: "Elige un héroe",
      empty: "Todavía no hay partidas suficientes con este héroe.",
      unknown: "No tenemos la build de ese héroe.",
      stats: { edge: "Ventaja", usage: "Uso", minute: "Minuto" },
      own: "Propio de {hero}",
      generic: "Rinde más en otros",
      ownWhy: "{points} puntos de la ventaja vienen de este héroe, no del ítem.",
      genericWhy: "Este ítem vale {points} puntos menos acá que en general.",
      group: (cost: string, n: number) => `${cost} almas · ${n} ítems`,
      sample: (matches: string, from: string, to: string) =>
        `${matches} partidas · ${from} a ${to}`,
    },
```

**Sin voseo**: "Elige", no "Elegí".

- [ ] **Step 2: Escribir la página**

Crear `games/tft/ui/src/DeadlockBuilds.tsx`:

```tsx
import { useState } from "react";
import { useCopy, useLocale } from "./i18n";
import { COSTS, OPEN_COSTS } from "./deadlockItemsData";
import { useBuilds, type BuildItem, type HeroBuildView } from "./deadlockBuildsData";
import type { BandId } from "./deadlockData";

/**
 * Qué ítems rinden con cada héroe.
 *
 * Dos pantallas en un componente: el índice de héroes y la build de uno. Son la
 * misma pestaña y comparten cabecera, selector de banda y datos — separarlas en
 * dos archivos duplicaría todo eso para ahorrar un `if`.
 *
 * **No hay gráficos, y es a propósito.** Los dos de la pestaña de ítems se
 * dibujaron después de verificar que decían algo; acá todavía no se verificó
 * nada equivalente, y dibujar por simetría es cómo se llega a un gráfico
 * decorativo.
 */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

function ItemRow({ item, hero }: { item: BuildItem; hero: string }) {
  const copy = useCopy();
  const why =
    item.ownKind === "own"
      ? copy.deadlock.builds.ownWhy.replace("{points}", signed(item.own))
      : copy.deadlock.builds.genericWhy.replace("{points}", Math.abs(item.own).toFixed(1));

  return (
    <li className="dl-build-item" data-thin={item.thinData === true}>
      <img className="dl-build-icon" src={item.img} alt="" width={44} height={44} loading="lazy" />
      <span className="dl-identity">
        <span className="dl-name">{item.name}</span>
        {/* La etiqueta sólo aparece cuando hay algo que decir: el corte lo fija
            el pipeline sobre la distribución real, y marca ~1 de cada 5 filas.
            Que la mayoría no la tenga es lo que hace que se vea. */}
        {item.ownKind && (
          <span className="dl-chips">
            <span className="dl-chip" data-kind={item.ownKind} title={why}>
              {item.ownKind === "own"
                ? copy.deadlock.builds.own.replace("{hero}", hero)
                : copy.deadlock.builds.generic}
            </span>
          </span>
        )}
      </span>
      <span className="stats dl-stats">
        <span className="stat stat-primary">
          <span className="stat-value">{signed(item.edge)}</span>
          <span className="stat-label">{copy.deadlock.builds.stats.edge}</span>
        </span>
        <span className="stat">
          <span className="stat-value">{pct(item.pickRate)}</span>
          <span className="stat-label">{copy.deadlock.builds.stats.usage}</span>
        </span>
        <span className="stat">
          <span className="stat-value">{item.buyMinute.toFixed(0)}</span>
          <span className="stat-label">{copy.deadlock.builds.stats.minute}</span>
        </span>
      </span>
    </li>
  );
}

/** Un grupo de precio, con la misma mecánica de plegado que las otras pestañas. */
function CostGroup({
  cost, items, hero, open, onToggle,
}: {
  cost: number; items: BuildItem[]; hero: string; open: boolean; onToggle: () => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  return (
    <section className="tier-group dl-tier" data-open={open}>
      <button className="tier-head dl-tier-head" onClick={onToggle} aria-expanded={open}>
        <span className="tier-mark">{cost.toLocaleString(locale)}</span>
        <span className="tier-count">{items.length}</span>
        <span className="dl-chevron" aria-hidden="true">▾</span>
      </button>
      {/* El contenido se monta aunque esté plegado, para que Ctrl+F y Google lo
          encuentren. Lo que cambia es si se ve. */}
      <div className="dl-fold">
        <div className="dl-fold-inner">
          <ol className="dl-build-list">
            {items.map((i) => (
              <ItemRow key={i.itemId} item={i} hero={hero} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default function DeadlockBuilds({
  band, picker, slug, onHero,
}: {
  band: BandId;
  picker: React.ReactNode;
  /** El héroe de la URL, o undefined en el índice. */
  slug?: string;
  onHero: (slug: string | undefined) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const meta = useBuilds(band);
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(OPEN_COSTS));

  const alternar = (cost: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(cost)) next.add(cost);
      return next;
    });

  const hero: HeroBuildView | undefined = slug
    ? meta?.heroes.find((h) => h.slug === slug)
    : undefined;

  return (
    <main className="deadlock">
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {hero ? hero.name : copy.deadlock.builds.title}
            <span className="title-break">
              {hero ? copy.deadlock.builds.title : copy.deadlock.builds.titleBreak}
            </span>
          </h1>
          <p className="standfirst">{copy.deadlock.builds.lead}</p>
        </header>
        <div className="tool-controls">
          {picker}
          {meta && (
            <p className="detail-note dl-sample">
              {copy.deadlock.builds.sample(
                meta.file.matches.toLocaleString(locale),
                meta.file.from,
                meta.file.to
              )}
            </p>
          )}
        </div>
      </div>

      {!meta ? (
        <p className="detail-note dl-loading">{copy.deadlock.loading}</p>
      ) : slug && !hero ? (
        <p className="detail-note">{copy.deadlock.builds.unknown}</p>
      ) : hero ? (
        <div className="tiers">
          <button className="dl-back" onClick={() => onHero(undefined)}>
            ← {copy.deadlock.builds.pick}
          </button>
          {COSTS.map((cost) => {
            const items = hero.items.filter((i) => i.cost === cost);
            if (items.length === 0) return null;
            return (
              <CostGroup
                key={cost}
                cost={cost}
                items={items}
                hero={hero.name}
                open={abiertos.has(cost)}
                onToggle={() => alternar(cost)}
              />
            );
          })}
        </div>
      ) : (
        <ul className="dl-hero-grid">
          {meta.heroes.map((h) => (
            <li key={h.heroId}>
              <button className="dl-hero-card" onClick={() => onHero(h.slug)}>
                {h.img && <img src={h.img} alt="" width={64} height={64} loading="lazy" />}
                <span className="dl-name">{h.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Cablear en App.tsx**

En `games/tft/ui/src/App.tsx`:

1. Agregar el import junto a los otros de Deadlock (línea ~11):

```tsx
import DeadlockBuilds from "./DeadlockBuilds";
```

2. En el bloque `place === "deadlock"`, donde hoy hay un `route.dlSection === "items" ? <DeadlockItems …/> : <Deadlock …/>`, agregar la rama de builds antes del `else` final:

```tsx
          {route.dlSection === "builds" ? (
            <DeadlockBuilds
              band={dlBand}
              picker={dlPicker}
              slug={route.dlDetail}
              onHero={(slug) =>
                navigate({ ...route, view: "deadlock", dlSection: "builds", dlDetail: slug })
              }
            />
          ) : route.dlSection === "items" ? (
            <DeadlockItems band={dlBand} picker={dlPicker} />
          ) : (
            <Deadlock section={route.dlSection} band={dlBand} picker={dlPicker} />
          )}
```

3. En el `nav.switcher` que dibuja las pestañas, el `onClick` tiene que **limpiar `dlDetail`** al cambiar de pestaña, o volver a Meta desde la build de un héroe dejaría el slug pegado:

```tsx
                onClick={() => navigate({ ...route, view: "deadlock", dlSection: id, dlDetail: undefined })}
```

- [ ] **Step 4: Verificar que compila y que los tests siguen pasando**

```bash
npm run build --prefix games/tft/ui
```

Esperado: build sin errores de TypeScript.

```bash
npm test --prefix games/tft/ui
```

Esperado: PASS en toda la suite.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/DeadlockBuilds.tsx games/tft/ui/src/i18n.ts games/tft/ui/src/App.tsx
git commit -m "feat: open the build of a single Deadlock hero"
```

---

### Task 8: Los estilos

**Files:**
- Modify: `games/tft/ui/src/styles/codex.css`

- [ ] **Step 1: Agregar las clases nuevas**

Al final de la sección de Deadlock en `games/tft/ui/src/styles/codex.css`, agregar. Las clases que ya existen (`dl-tier`, `dl-fold`, `dl-chip`, `stats`, `tool-head`) se reutilizan tal cual; acá sólo va lo que no existe:

```css
/* La grilla del índice de builds. `auto-fill` y no un número de columnas: son
   38 héroes hoy y el juego suma personajes, así que la grilla se acomoda sola. */
.dl-hero-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.6rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.dl-hero-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.7rem;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 2px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dl-hero-card:hover,
.dl-hero-card:focus-visible {
  border-color: var(--gold);
}

.dl-hero-card img {
  border-radius: 2px;
}

.dl-build-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.dl-build-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.7rem;
  padding: 0.45rem 0.7rem;
  border-bottom: 1px solid var(--rule);
}

/* La muestra fina se atenúa en vez de esconderse: la fila sigue estando y el
   lector ve que hay menos evidencia atrás. Mismo criterio que en héroes. */
.dl-build-item[data-thin="true"] {
  opacity: 0.55;
}

.dl-build-icon {
  border-radius: 2px;
}

.dl-back {
  display: inline-block;
  margin-bottom: 0.8rem;
  padding: 0.3rem 0.6rem;
  background: none;
  border: 1px solid var(--rule);
  border-radius: 2px;
  color: var(--vellum);
  font: inherit;
  cursor: pointer;
}

.dl-back:hover,
.dl-back:focus-visible {
  border-color: var(--gold);
}
```

- [ ] **Step 2: Verificar en 375px**

Levantar el preview y mirar la página de un héroe a 375 px de ancho. **La barra superior desbordando en móvil ya rompió la pestaña de Deadlock una vez**, así que este chequeo no es opcional.

- [ ] **Step 3: Commit**

```bash
git add games/tft/ui/src/styles/codex.css
git commit -m "style: lay out the Deadlock build list"
```

---

### Task 9: Sitemap y prerender

**Files:**
- Modify: `games/tft/ui/src/sitemap.ts`
- Modify: `games/tft/ui/vite.config.ts`
- Test: `games/tft/ui/test/sitemap.test.ts`

**Interfaces:**
- Produces: `SitemapData` gana `deadlockHeroes: Record<string, { name: { en: string } }>`.

- [ ] **Step 1: Escribir el test que falla**

En `games/tft/ui/test/sitemap.test.ts`, agregar `deadlockHeroes` al objeto `data` de arriba y este bloque:

```ts
describe("las builds de Deadlock", () => {
  it("lista una página por héroe en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/deadlock/builds");
    expect(paths).toContain("/es/deadlock/builds");
    expect(paths).toContain("/en/deadlock/builds/lady-geist");
    expect(paths).toContain("/es/deadlock/builds/lady-geist");
  });

  it("usa el nombre en inglés para el slug en los dos idiomas", () => {
    // Un héroe con nombre distinto en español tiene que compartir dirección:
    // dos slugs para la misma página parten el posicionamiento en dos.
    const paths = sitemapPaths(data).filter((p) => p.includes("/deadlock/builds/"));
    const en = paths.filter((p) => p.startsWith("/en")).map((p) => p.slice(3));
    const es = paths.filter((p) => p.startsWith("/es")).map((p) => p.slice(3));
    expect(en).toEqual(es);
  });
});
```

Y en el objeto `data`:

```ts
  deadlockHeroes: { "10": { name: { en: "Lady Geist" } }, "11": { name: { en: "Bebop" } } },
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npm test --prefix games/tft/ui -- sitemap
```

Esperado: FAIL — las rutas de builds no están.

- [ ] **Step 3: Modificar `sitemap.ts`**

1. Agregar a la interfaz `SitemapData`:

```ts
  /** De catalog.json de Deadlock: los héroes que tienen página de build. */
  deadlockHeroes: Record<string, { name: Localized }>;
```

2. En `sitemapPaths`, reemplazar el bucle de pestañas de Deadlock por:

```ts
    // Las pestañas de Deadlock. La de meta sale como /deadlock a secas, que es
    // la URL que ya estaba indexada.
    for (const dlSection of DEADLOCK_SECTIONS) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection }));
    }

    // Una página por héroe. **Acá sí se listan todos**, al revés que las comps
    // por banda: "bebop build" es una búsqueda propia con intención propia, y
    // cada héroe es una página distinta y no la misma repetida bajo otro filtro.
    for (const hero of Object.values(data.deadlockHeroes ?? {})) {
      const slug = slugify(hero.name.en);
      if (!slug) continue;
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "builds", dlDetail: slug }));
    }
```

- [ ] **Step 4: Modificar `vite.config.ts`**

En los **dos** plugins (`seoFiles` y `prerenderRoutes`), agregar la lectura del catálogo de Deadlock y el campo. En cada uno, junto al `read` que ya existe:

```ts
  const readDeadlock = (name: string) =>
    JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));
```

Y dentro del objeto `data`, después de `itemIds`:

```ts
        deadlockHeroes: readDeadlock("catalog.json").heroes,
```

- [ ] **Step 5: Darle título propio a cada página de héroe**

Sin esto, las 76 direcciones nuevas salen al sitemap con el mismo `<head>` — que es exactamente el problema que ya se corrigió con las bandas de TFT y con las pestañas de Deadlock, y anula el único motivo por el que son URLs separadas.

En `games/tft/ui/src/i18n.ts`, dentro del bloque `seo.deadlock` **de `en`**:

```ts
      builds: {
        title: () => "Deadlock item builds by hero",
        description: () =>
          "What to buy on each Deadlock hero, measured against players who reached the same point of the match and spent the same souls on something else.",
      },
      buildsHero: {
        title: (hero: string) => `${hero} build — best items in Deadlock`,
        description: (hero: string) =>
          `The items that actually win with ${hero}, measured against players who reached the same minute with the same souls and bought something else.`,
      },
```

Y **de `es`**:

```ts
      builds: {
        title: () => "Builds de ítems por héroe en Deadlock",
        description: () =>
          "Qué comprar en cada héroe de Deadlock, medido contra jugadores que llegaron al mismo punto de la partida y gastaron las mismas almas en otra cosa.",
      },
      buildsHero: {
        title: (hero: string) => `Build de ${hero} — mejores ítems en Deadlock`,
        description: (hero: string) =>
          `Los ítems que de verdad ganan con ${hero}, medidos contra jugadores que llegaron al mismo minuto con las mismas almas y compraron otra cosa.`,
      },
```

En `games/tft/ui/src/prerender.ts`, reemplazar el bloque de Deadlock de `metaFor` (líneas 99-102):

```ts
  if (route.view === "deadlock") {
    // La build de un héroe es su propia página. "bebop build" es una búsqueda
    // con intención propia, y 38 páginas compartiendo título competirían entre
    // sí — la misma corrección que las bandas de TFT y las pestañas de acá.
    if (route.dlSection === "builds" && detail) {
      return {
        title: seo.deadlock.buildsHero.title(detail),
        description: seo.deadlock.buildsHero.description(detail),
      };
    }
    const page = seo.deadlock[route.dlSection];
    return { title: page.title(), description: page.description() };
  }
```

Y en `prerenderPages`, construir los nombres de héroe por slug y usarlos:

```ts
  /** Slug de héroe → su nombre en cada idioma, para el título de su build. */
  const dlNames: Record<Lang, Record<string, string>> = { en: {}, es: {} };
  for (const hero of Object.values(data.deadlockHeroes ?? {})) {
    const slug = slugify(hero.name.en);
    if (!slug) continue;
    for (const l of LANGS) dlNames[l][slug] = say(hero.name as Localized, l, slug);
  }
```

y cambiar la línea que calcula `detail`:

```ts
    const detail = route.dlDetail
      ? (dlNames[lang][route.dlDetail] ?? null)
      : route.detail
        ? (names[lang][`${route.section}/${route.detail}`] ?? null)
        : null;
```

`slugify` ya se importa desde `./sitemap` vía `detailSlugs`; agregarlo al import de `./route` si hace falta.

**Nota sobre `deadlockHeroes`**: el catálogo trae `name` con `en` y `es`, pero `SitemapData` lo declara como `Localized` con sólo `en`. Ampliar la declaración a `{ en: string; es?: string }` para que `say` pueda usar el español; si falta, `say` cae al slug, que es peor que el nombre en inglés — así que el fallback en `dlNames` es `hero.name.en`, no el slug.

- [ ] **Step 6: Correr los tests y el build**

```bash
npm test --prefix games/tft/ui -- sitemap prerender
```

Esperado: PASS.

```bash
npm run build --prefix games/tft/ui
```

Esperado: build OK. Verificar que el sitemap generado tiene las páginas:

```bash
grep -c "deadlock/builds/" games/tft/ui/dist/sitemap.xml
```

Esperado: **76** (38 héroes × 2 idiomas). Y que cada una tenga su propio título:

```bash
node -e "const {readFileSync}=require('fs'); const h=readFileSync('games/tft/ui/dist/en/deadlock/builds/lady-geist.html','utf8'); console.log(h.match(/<title>[^<]*<\/title>/)[0]);"
```

Esperado: un título que **contenga "Lady Geist"**, no el genérico de la pestaña.

- [ ] **Step 7: Commit**

```bash
git add games/tft/ui/src/sitemap.ts games/tft/ui/src/prerender.ts games/tft/ui/src/i18n.ts games/tft/ui/vite.config.ts games/tft/ui/test/sitemap.test.ts
git commit -m "feat: put every Deadlock hero build in the sitemap"
```

---

### Task 10: La publicación automática

**Files:**
- Modify: `.github/workflows/publish-deadlock.yml`

- [ ] **Step 1: Agregar el paso**

En `.github/workflows/publish-deadlock.yml`, después del paso `build items` y antes de `guard`:

```yaml
      # Las builds por héroe. Va último de los tres porque es el más caro (~90 s
      # contra ~10 de ítems): materializa las compras y el estado de cada jugador
      # para poder parear, mientras los otros dos agregan del lado de DuckDB.
      #
      # Sin continue-on-error, como los otros dos que producen números: es la
      # fuente de la pestaña, y fallar en silencio dejaría 76 páginas congeladas
      # sin que nada lo dijera.
      - name: build builds
        run: npm run build:builds --prefix games/deadlock/pipeline
```

- [ ] **Step 2: Actualizar el comentario del timeout**

El encabezado del workflow dice que el trabajo real son ~2 minutos. Con este paso son ~4. Cambiar en el comentario de la línea ~22:

```
# Lo que cuesta: ~4 minutos por corrida, unos 240 minutos por mes de los 2.000
# gratis. La publicación de TFT ya come ~1.460 con el CI, así que sigue
```

Y el `timeout-minutes: 20` se deja: sigue siendo holgado y lo que evita es un pedido HTTP colgado, no un build lento.

- [ ] **Step 3: Verificar que el guardián ve los archivos nuevos**

`publish-guard.ts` compara el directorio entero, así que los `builds*.json` entran solos. Confirmarlo:

```bash
npm run publish:guard --prefix games/deadlock/pipeline -- ../data ../data
```

Esperado: código de salida 3 ("nada que publicar"), porque se compara el directorio consigo mismo.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish-deadlock.yml
git commit -m "chore: publish the Deadlock hero builds twice a day"
```

---

### Task 11: Verificación en el navegador y cierre

- [ ] **Step 1: Levantar el preview**

Usar `preview_start` con la configuración de `.claude/launch.json`. **No usar Bash para levantar servidores.**

- [ ] **Step 2: Recorrer las cuatro cosas que se pueden romper en silencio**

1. `/en/deadlock/builds` — la grilla dibuja los 38 héroes con su cara.
2. `/en/deadlock/builds/lady-geist` — la lista por precio, con las etiquetas de `own` en una minoría de las filas.
3. Cambiar de banda: la lista se recarga y **no** vuelve al índice.
4. Cambiar a español: los nombres de héroes e ítems cambian y **la URL no**.

Con `read_console_messages` verificar que no hay errores, y con `read_page` que el contenido está.

- [ ] **Step 3: Verificar a 375 px**

`resize_window` con preset `mobile`. La barra superior tiene cinco pestañas ahora: **verificar que no desborda**, que es exactamente lo que ya pasó una vez y ocultó la pestaña de Deadlock.

- [ ] **Step 4: Captura y cierre**

`computer` con `screenshot` de la página de un héroe, para dejar constancia de que funciona.

- [ ] **Step 5: Correr toda la suite una última vez**

```bash
npm test --prefix games/deadlock/pipeline && npm test --prefix games/tft/ui
```

Esperado: PASS en las dos.

- [ ] **Step 6: Commit final si quedó algo suelto**

```bash
git status --short
```

Esperado: limpio. Si no, revisar qué quedó sin commitear antes de dar por cerrada la tarea.

---

## Notas para quien ejecute

- **El spec manda sobre el criterio.** Si un número no cierra, leer
  `docs/design/2026-07-30-builds-por-heroe-deadlock-design.md` antes de tocar una
  fórmula: cada decisión ahí tiene su medición al lado.
- **La Task 4 es una compuerta, no un trámite.** Si el `k` sale fuera de 300-1.500
  o aparecen ventajas de ±80 puntos, hay un bug de implementación; seguir con la
  UI encima de eso es construir sobre datos falsos.
- **No agregar gráficos.** El spec los deja explícitamente afuera de esta versión.
- **Riesgo conocido:** el peso del mecanismo se validó con una correlación de 0,703
  contra 0,683 sin él. Es una mejora modesta. Si al correr el pipeline real el `k`
  sale infinito (o sea, el mecanismo explica todo y no queda señal propia), eso es
  una señal de que algo está mal en el pareo, no un resultado.
