# La escalera y la maestría — plan de implementación

> **Para quien lo ejecute:** los pasos van con checkbox (`- [ ]`). El diseño y el
> porqué de cada número están en
> `docs/design/2026-08-01-escalera-lados-maestria-y-parche-design.md`. **Leerlo
> primero**; acá va el cómo, no el por qué.

**Objetivo:** una pestaña nueva `/deadlock/ranks` con la distribución de rangos
(por partidas y por jugadores, con serie diaria y cartel de calibración) y el
winrate por lado del mapa; más un panel de maestría dentro de la fila desplegable
de cada héroe.

**Arquitectura:** dos scripts nuevos de pipeline que consultan el snapshot con
DuckDB y escriben JSON (`ranks.ts` → `ranks.json`; `mastery.ts` →
`mastery.<banda>.json`), y dos componentes nuevos de UI que los leen con
`import()` dinámico. Winners & Losers **ya existe** y no entra en este plan.

**Stack:** TypeScript, DuckDB (`@duckdb/node-api`) sobre Parquet en S3, React +
Vite, vitest.

## Restricciones globales

- **`floor(badge / 10.0)::INT`, nunca `(badge/10)::INT`.** DuckDB hace división
  real y el cast redondea: 86 (Oráculo 6) se convertiría en 9 (Fantasma).
- **El corpus es ranked**: `match_mode = 'Ranked'` y `game_mode = 'Normal'`.
  `Unranked` incluye Street Brawl, que es otro juego.
- **Sólo las particiones con `average_badge`** (`bandablePartitions`). Pedirle esa
  columna a una vieja no da nulos: **falla la consulta entera**.
- **Toda la prosa va en `games/tft/ui/src/i18n.ts`, en los dos idiomas.** Español
  **neutro latinoamericano, sin voseo** ("Abre", no "Abrí").
- **Los nombres de rango no se escriben**: salen de `catalog.ranks`, que ya viene
  traducido de la API de assets.
- **Los slugs van en inglés** (`ranks`).
- **Adentro de un SVG no va ni una palabra**; los rótulos van debajo como texto
  real. Nada de scroll propio en un panel. Las marcas usan la imagen del juego
  cuando existe.
- **La raíz del tema son 19px**, así que `3.4rem` son 65px. Verificar en 375px.
- **Los JSON nuevos se cargan con `import()`**, nunca con import estático: el
  bundle lo paga todo el que entra al sitio.
- Correr los tests desde `games/deadlock/pipeline` y `games/tft/ui` con
  `npm test`; el build de la UI con `npm run build` (vitest transpila sin chequear
  tipos, así que un error de tipos sólo lo agarra `tsc -b`).

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `games/deadlock/pipeline/src/ranks.ts` | Mide la escalera y el lado del mapa; escribe `ranks.json` |
| `games/deadlock/pipeline/src/mastery.ts` | Mide la curva de experiencia por héroe; escribe `mastery.<banda>.json` |
| `games/deadlock/pipeline/test/ranks.test.ts` | Tests de las funciones puras de `ranks.ts` |
| `games/deadlock/pipeline/test/mastery.test.ts` | Tests de las funciones puras de `mastery.ts` |
| `games/tft/ui/src/deadlockRanks.ts` | Capa de datos de la escalera (carga y tipos) |
| `games/tft/ui/src/DeadlockRanks.tsx` | La pestaña |
| `games/tft/ui/src/DeadlockMastery.tsx` | El panel dentro de la fila del héroe |
| `games/tft/ui/test/deadlockRanks.test.ts` | Tests de la capa de datos y del cartel |

**Modificar:**

| Archivo | Qué |
|---|---|
| `games/tft/ui/src/route.ts:33` | Agregar `"ranks"` a `DEADLOCK_SECTIONS` |
| `games/tft/ui/src/App.tsx:160` | Rutear `dlSection === "ranks"` a `<DeadlockRanks>` |
| `games/tft/ui/src/Deadlock.tsx` | Montar `<DeadlockMastery>` en la fila desplegable |
| `games/tft/ui/src/i18n.ts` | Copia nueva en `deadlock.tabs`, `deadlock.ranks`, `deadlock.mastery` y `seo.deadlock.ranks`, en EN y ES |
| `games/tft/ui/src/codex.css` | Clases `dl-ladder-*`, `dl-sides-*`, `dl-mastery-*` |
| `games/deadlock/pipeline/package.json` | Scripts `build:ranks` y `build:mastery` |
| `.github/workflows/*deadlock*` | Correr `build:ranks` con la corrida horaria y `build:mastery` una vez por día |

---

## Parte A — La escalera

### Tarea A1: las funciones puras de `ranks.ts`

**Archivos:**
- Crear: `games/deadlock/pipeline/src/ranks.ts`
- Test: `games/deadlock/pipeline/test/ranks.test.ts`

**Interfaces que produce** (las consume la UI en la Parte C):

```ts
/** Una fila por día y por rango. `players` es null cuando ese día no hubo dato. */
export interface RankDay {
  day: string;              // "2026-07-30"
  matches: number[];        // indexado por tier 0..11
  players: number[];        // idem
}

export interface SideRow {
  tier: number;
  matches: number;
  /** Winrate del lado 0, en 0..1. */
  team0: number;
  /** Error estándar en puntos de winrate (0..1). */
  se: number;
}

export interface RanksFile {
  generatedAt: string;
  from: string;
  to: string;
  /** Fracción de filas de jugador con rango conocido, del último día medido. */
  coverage: number;
  /** Cuentas vistas y cuentas con rango, en todo el período. */
  accounts: { seen: number; ranked: number };
  days: RankDay[];
  totals: { matches: number[]; players: number[] };
  sides: SideRow[];
  sidesOverall: SideRow;
}
```

- [ ] **Paso 1: escribir los tests que fallan**

```ts
// games/deadlock/pipeline/test/ranks.test.ts
import { describe, expect, it } from "vitest";
import { tierOfBadgeSql, seOf, sidesFrom, coverageOf, daysFrom } from "../src/ranks";

describe("el rango sale con floor y no con redondeo", () => {
  it("manda 86 a Oráculo (8) y no a Fantasma (9)", () => {
    // Es el bug que ya se cometió una vez: `(86/10)::INT` da 9 en DuckDB.
    expect(tierOfBadgeSql()).toContain("floor(");
    expect(tierOfBadgeSql()).not.toMatch(/\(\s*\w+\s*\/\s*10\s*\)::INT/);
  });
});

describe("seOf", () => {
  it("es 0,5/raíz(n) en puntos de winrate", () => {
    expect(seOf(10_000)).toBeCloseTo(0.005, 6);
    expect(seOf(2_500)).toBeCloseTo(0.01, 6);
  });
  it("devuelve Infinity con cero partidas en vez de dividir por cero", () => {
    expect(seOf(0)).toBe(Infinity);
  });
});

describe("sidesFrom", () => {
  const filas = [
    { tier: 8, matches: 30_000, team0Wins: 15_300 },
    { tier: 1, matches: 500, team0Wins: 260 },
  ];

  it("deja afuera el rango que no llega al mínimo", () => {
    const out = sidesFrom(filas, 20_000);
    expect(out.map((s) => s.tier)).toEqual([8]);
  });

  it("calcula el winrate del lado 0 y su error", () => {
    const [row] = sidesFrom(filas, 20_000);
    expect(row.team0).toBeCloseTo(0.51, 6);
    expect(row.se).toBeCloseTo(0.5 / Math.sqrt(30_000), 6);
  });
});

describe("coverageOf", () => {
  it("es la fracción del último día, no la del período", () => {
    // El período entero arrastra los días de 2%, que ya no describen a nadie.
    const dias = [
      { day: "2026-07-30", rows: 140_400, ranked: 3_229 },
      { day: "2026-08-01", rows: 111_144, ranked: 52_904 },
    ];
    expect(coverageOf(dias)).toBeCloseTo(52_904 / 111_144, 6);
  });
  it("es 0 si no hay ni un día", () => {
    expect(coverageOf([])).toBe(0);
  });
});

describe("daysFrom", () => {
  it("rellena con ceros los rangos sin partidas, para que la serie no tenga huecos", () => {
    const [dia] = daysFrom([{ day: "2026-08-01", tier: 8, matches: 10, players: 4 }]);
    expect(dia.matches).toHaveLength(12);
    expect(dia.matches[8]).toBe(10);
    expect(dia.matches[0]).toBe(0);
    expect(dia.players[8]).toBe(4);
  });

  it("ordena los días de más viejo a más nuevo", () => {
    const out = daysFrom([
      { day: "2026-08-01", tier: 1, matches: 1, players: 1 },
      { day: "2026-07-30", tier: 1, matches: 1, players: 1 },
    ]);
    expect(out.map((d) => d.day)).toEqual(["2026-07-30", "2026-08-01"]);
  });
});
```

- [ ] **Paso 2: correr y verificar que falla**

```bash
cd games/deadlock/pipeline && npm test -- ranks
```

Esperado: FAIL — `Failed to resolve import "../src/ranks"`.

- [ ] **Paso 3: escribir las funciones puras**

```ts
// games/deadlock/pipeline/src/ranks.ts (primera mitad: lo puro y testeable)
import { RANKS } from "./bands";

/**
 * El rango de un badge, en SQL.
 *
 * **`floor` y no cast a secas.** DuckDB divide de verdad: `86 / 10` es `8.6` y
 * `(8.6)::INT` **redondea a 9**, así que un Oráculo 6 aparecería como Fantasma.
 * La primera medición de este pipeline salió mal exactamente por esto.
 */
export const tierOfBadgeSql = (col = "badge"): string => `floor(${col} / 10.0)::INT`;

/**
 * El error estándar de un winrate, en puntos (0..1).
 *
 * Se usa `0,5/√n` y no `√(p(1−p)/n)` porque cerca del 50% son el mismo número y
 * el primero no depende de la estimación: sirve para decidir si vale la pena
 * mirarla antes de mirarla.
 */
export const seOf = (matches: number): number => (matches > 0 ? 0.5 / Math.sqrt(matches) : Infinity);

export interface SideRaw {
  tier: number;
  matches: number;
  team0Wins: number;
}

export interface SideRow {
  tier: number;
  matches: number;
  team0: number;
  se: number;
}

/**
 * El lado del mapa por rango, dejando afuera lo que no se puede leer.
 *
 * **Un rango con poca muestra no se dibuja.** Es el mismo criterio que
 * `MIN_FOR_DELTA` en `build.ts`: la ausencia dice "no sé", y un punto dibujado
 * diría "acá no pasa nada", que es una afirmación distinta y probablemente falsa.
 */
export function sidesFrom(raw: SideRaw[], min: number): SideRow[] {
  return raw
    .filter((r) => r.matches >= min)
    .map((r) => ({ tier: r.tier, matches: r.matches, team0: r.team0Wins / r.matches, se: seOf(r.matches) }))
    .sort((a, b) => a.tier - b.tier);
}

/**
 * Cuánta gente tiene rango conocido: **la del último día, no la del período**.
 *
 * El período arrastra los días de calibración temprana (2,3% el 30/7) que ya no
 * describen a nadie. El cartel tiene que decir cómo está hoy.
 */
export function coverageOf(dias: { day: string; rows: number; ranked: number }[]): number {
  if (dias.length === 0) return 0;
  const ultimo = [...dias].sort((a, b) => a.day.localeCompare(b.day))[dias.length - 1];
  return ultimo.rows > 0 ? ultimo.ranked / ultimo.rows : 0;
}

export interface DayRaw {
  day: string;
  tier: number;
  matches: number;
  players: number;
}

export interface RankDay {
  day: string;
  matches: number[];
  players: number[];
}

/**
 * De filas sueltas a una serie sin huecos.
 *
 * Cada día trae los doce rangos aunque estén en cero: un gráfico que recibe
 * arrays de distinto largo según el día es un gráfico que se dibuja torcido, y el
 * cero acá es información real ("ese día nadie jugó en Fantasma").
 */
export function daysFrom(raw: DayRaw[]): RankDay[] {
  const porDia = new Map<string, RankDay>();
  for (const r of raw) {
    let dia = porDia.get(r.day);
    if (!dia) {
      dia = { day: r.day, matches: Array(RANKS.length).fill(0), players: Array(RANKS.length).fill(0) };
      porDia.set(r.day, dia);
    }
    if (r.tier >= 0 && r.tier < RANKS.length) {
      dia.matches[r.tier] = r.matches;
      dia.players[r.tier] = r.players;
    }
  }
  return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
}
```

- [ ] **Paso 4: correr y verificar que pasa**

```bash
cd games/deadlock/pipeline && npm test -- ranks
```

Esperado: PASS, 8 tests.

- [ ] **Paso 5: commit**

```bash
git add games/deadlock/pipeline/src/ranks.ts games/deadlock/pipeline/test/ranks.test.ts
git commit -m "feat: las cuentas de la escalera de rangos, con sus tests"
```

### Tarea A2: la consulta y el archivo

**Archivos:**
- Modificar: `games/deadlock/pipeline/src/ranks.ts` (agregar `main`)
- Modificar: `games/deadlock/pipeline/package.json`

**Consume:** `listPartitions`, `partitionRanges`, `partitionsCovering`,
`bandablePartitions`, `windowEnd`, `connect`, `retryingOnRewrite`, `BADGE`,
`PLAYED_MODE`, `PLAYED_GAME_MODE` de `./snapshot`.

- [ ] **Paso 1: elegir la ventana**

La escalera **no usa la ventana de 15 días**: usa **todo el corpus ranked**, desde
la primera partida rankeada. La pregunta "¿cómo se reconstruye la escalera?" es
acumulativa por definición y cortarla a 15 días borraría la historia justo cuando
empiece a ser interesante. Sigue siendo ranked-only, que es lo que se decidió.

```ts
/** La cola rankeada abrió el 2026-07-30 16:19 UTC. Antes de eso no hay escalera. */
const RANKED_FROM = "2026-07-30";
```

- [ ] **Paso 2: escribir `main`**

```ts
// games/deadlock/pipeline/src/ranks.ts (segunda mitad)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BADGE, PLAYED_GAME_MODE, PLAYED_MODE, bandablePartitions, connect,
  listPartitions, partitionRanges, partitionsCovering, retryingOnRewrite, windowEnd, partitionUrl,
} from "./snapshot";

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/ranks.json`;

/**
 * Cuántas partidas necesita un rango para que su lado del mapa se dibuje.
 *
 * A 20.000 partidas el error estándar es 0,35 pp, que alcanza para separar del
 * 50% al efecto que medimos en los extremos (±1,5 a ±2,5 pp). Con la muestra de
 * hoy no lo alcanza ningún rango, y eso es correcto: la tabla se completa sola a
 * medida que el corpus ranked crece (~15.000 partidas por día).
 */
const SIDE_MIN_MATCHES = 20_000;

const base = (parts: number[], from: string, to: string): string =>
  parts
    .map(
      (n) => `
    select strftime(start_time, '%Y-%m-%d') as day, match_id, account_id, won, team,
           ${BADGE} as badge, player_rank_initial_display_rank as rango
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'`
    )
    .join(" union all ");

async function main() {
  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const partitions = await listPartitions();
  const ranges = await partitionRanges(con, partitions);
  const hasta = (await windowEnd(con, ranges)).toISOString();
  const parts = await bandablePartitions(con, partitionsCovering(ranges, RANKED_FROM, hasta));
  if (parts.length === 0) throw new Error("no hay ni una partición con rangos desde que abrió ranked");

  await con.run(`create or replace table w as ${base(parts, RANKED_FROM, hasta)}`);

  const T = tierOfBadgeSql();
  const porDia = (await rows(`
    with m as (select day, ${T} as tier, count(distinct match_id)::BIGINT as matches
               from w where badge > 0 group by 1, 2),
         p as (select day, ${tierOfBadgeSql("rango")} as tier, count(distinct account_id)::BIGINT as players
               from w where rango > 0 group by 1, 2)
    select coalesce(m.day, p.day) as day, coalesce(m.tier, p.tier) as tier,
           coalesce(m.matches, 0)::BIGINT as matches, coalesce(p.players, 0)::BIGINT as players
    from m full outer join p on m.day = p.day and m.tier = p.tier
    order by 1, 2`)) as unknown as { day: string; tier: number; matches: bigint; players: bigint }[];

  const cobertura = (await rows(`
    select day, count(*)::BIGINT as rows, count(case when rango > 0 then 1 end)::BIGINT as ranked
    from w group by 1 order by 1`)) as unknown as { day: string; rows: bigint; ranked: bigint }[];

  const [cuentas] = (await rows(`
    select count(distinct account_id)::BIGINT as seen,
           count(distinct case when rango > 0 then account_id end)::BIGINT as ranked
    from w`)) as unknown as { seen: bigint; ranked: bigint }[];

  const lados = (await rows(`
    select ${T} as tier, count(distinct match_id)::BIGINT as matches,
           count(case when team::VARCHAR = 'Team0' and won then 1 end)::BIGINT as team0Wins
    from w where badge > 0 group by 1 order by 1`)) as unknown as
    { tier: number; matches: bigint; team0Wins: bigint }[];

  const [global] = (await rows(`
    select count(distinct match_id)::BIGINT as matches,
           count(case when team::VARCHAR = 'Team0' and won then 1 end)::BIGINT as team0Wins
    from w where badge > 0`)) as unknown as { matches: bigint; team0Wins: bigint }[];

  const days = daysFrom(
    porDia.map((r) => ({ day: r.day, tier: r.tier, matches: Number(r.matches), players: Number(r.players) }))
  );
  const totals = {
    matches: days.reduce((a, d) => a.map((v, i) => v + d.matches[i]), Array(RANKS.length).fill(0) as number[]),
    players: days.reduce((a, d) => a.map((v, i) => Math.max(v, d.players[i])), Array(RANKS.length).fill(0) as number[]),
  };

  const file: RanksFile = {
    generatedAt: new Date().toISOString(),
    from: days[0]?.day ?? RANKED_FROM,
    to: days[days.length - 1]?.day ?? RANKED_FROM,
    coverage: coverageOf(cobertura.map((c) => ({ day: c.day, rows: Number(c.rows), ranked: Number(c.ranked) }))),
    accounts: { seen: Number(cuentas.seen), ranked: Number(cuentas.ranked) },
    days,
    totals,
    sides: sidesFrom(
      lados.map((l) => ({ tier: l.tier, matches: Number(l.matches), team0Wins: Number(l.team0Wins) })),
      SIDE_MIN_MATCHES
    ),
    sidesOverall: sidesFrom(
      [{ tier: -1, matches: Number(global.matches), team0Wins: Number(global.team0Wins) }],
      0
    )[0],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  console.log(
    `  ${days.length} días, ${file.accounts.ranked.toLocaleString("es")} de ` +
      `${file.accounts.seen.toLocaleString("es")} cuentas con rango, cobertura ${(file.coverage * 100).toFixed(1)}%`
  );
  console.log(`  lado del mapa: global ${(file.sidesOverall.team0 * 100).toFixed(2)}%, ${file.sides.length} rangos con muestra`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
```

**Ojo con `totals.players`:** se toma el **máximo** por día y no la suma, porque
un jugador que jugó tres días se contaría tres veces. Es una aproximación
declarada; el conteo exacto del período sale de `accounts`.

- [ ] **Paso 3: agregar el script**

```json
"build:ranks": "node node_modules/tsx/dist/cli.mjs src/ranks.ts",
```

- [ ] **Paso 4: correrlo de verdad contra el snapshot**

```bash
cd games/deadlock/pipeline && npm run build:ranks
```

Esperado: imprime los días, la cobertura (~48% o más) y el global del lado del
mapa (~50,5%), y escribe `games/deadlock/data/ranks.json`. **Verificar a ojo que
el rango tope de la serie sea Oráculo y no Fantasma** — si aparece Fantasma con
muestra, el `floor` se perdió en el camino.

- [ ] **Paso 5: commit**

```bash
git add games/deadlock/pipeline/src/ranks.ts games/deadlock/pipeline/package.json games/deadlock/data/ranks.json
git commit -m "feat: medir la escalera de rangos y el lado del mapa"
```

---

## Parte B — La maestría

### Tarea B1: las funciones puras de `mastery.ts`

**Archivos:**
- Crear: `games/deadlock/pipeline/src/mastery.ts`
- Test: `games/deadlock/pipeline/test/mastery.test.ts`

**Interfaces que produce:**

```ts
/** Los tramos de experiencia, en partidas previas con ESE héroe. */
export const BUCKETS = [0, 10, 50, 100, 250] as const;

export interface MasteryBucket {
  /** Piso del tramo: 0, 10, 50, 100 o 250. */
  from: number;
  matches: number;
  winRate: number;
}

export interface MasteryHero {
  heroId: number;
  buckets: MasteryBucket[];
  /** Puntos de winrate entre el tramo más alto con muestra y el más bajo. */
  boost?: number;
}

export interface MasteryFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  matches: number;
  heroes: MasteryHero[];
}
```

- [ ] **Paso 1: escribir los tests que fallan**

```ts
// games/deadlock/pipeline/test/mastery.test.ts
import { describe, expect, it } from "vitest";
import { BUCKETS, bucketOf, masteryFrom, MIN_PER_BUCKET } from "../src/mastery";

describe("bucketOf", () => {
  it("mete cada cantidad de partidas previas en su tramo", () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(9)).toBe(0);
    expect(bucketOf(10)).toBe(10);
    expect(bucketOf(49)).toBe(10);
    expect(bucketOf(250)).toBe(250);
    expect(bucketOf(5_000)).toBe(250);
  });
});

describe("masteryFrom", () => {
  const lleno = (from: number, matches: number, wins: number) => ({ heroId: 1, from, matches, wins });

  it("descarta el tramo sin muestra suficiente en vez de publicarlo con ruido", () => {
    const [hero] = masteryFrom([
      lleno(0, MIN_PER_BUCKET, MIN_PER_BUCKET / 2),
      lleno(250, 5, 5),
    ]);
    expect(hero.buckets.map((b) => b.from)).toEqual([0]);
  });

  it("calcula el boost entre el tramo más alto y el más bajo con muestra", () => {
    const [hero] = masteryFrom([
      lleno(0, 1_000, 480),
      lleno(250, 1_000, 530),
    ]);
    expect(hero.boost).toBeCloseTo(5, 6); // 53,0% − 48,0% = 5 puntos
  });

  it("omite el boost si queda un solo tramo, en vez de decir cero", () => {
    // Cero significaría "la experiencia no ayuda". La ausencia dice "no sé".
    const [hero] = masteryFrom([lleno(0, 1_000, 500)]);
    expect(hero.boost).toBeUndefined();
  });
});
```

- [ ] **Paso 2: correr y verificar que falla**

```bash
cd games/deadlock/pipeline && npm test -- mastery
```

Esperado: FAIL — no resuelve `../src/mastery`.

- [ ] **Paso 3: escribir las funciones puras**

```ts
// games/deadlock/pipeline/src/mastery.ts (lo puro)

/** Los pisos de cada tramo de experiencia, en partidas previas con ese héroe. */
export const BUCKETS = [0, 10, 50, 100, 250] as const;

/**
 * Cuánta muestra necesita un tramo para dibujarse.
 *
 * Con 500 partidas el error estándar de un winrate es 2,2 pp, y las diferencias
 * que buscamos son de 1 a 7 pp. Por debajo de eso el tramo diría cualquier cosa.
 */
export const MIN_PER_BUCKET = 500;

export const bucketOf = (previas: number): number => {
  let out = BUCKETS[0];
  for (const b of BUCKETS) if (previas >= b) out = b;
  return out;
};

export interface MasteryRaw {
  heroId: number;
  from: number;
  matches: number;
  wins: number;
}

export interface MasteryBucket {
  from: number;
  matches: number;
  winRate: number;
}

export interface MasteryHero {
  heroId: number;
  buckets: MasteryBucket[];
  boost?: number;
}

/**
 * De filas por (héroe, tramo) a la curva de cada héroe.
 *
 * **El boost se omite cuando hay un solo tramo.** Un cero diría "la experiencia
 * no cambia nada", que es una afirmación; la ausencia dice "no sé", que es la
 * verdad. Es la misma regla que `skillGap` y `trend`.
 */
export function masteryFrom(raw: MasteryRaw[]): MasteryHero[] {
  const porHeroe = new Map<number, MasteryBucket[]>();
  for (const r of raw) {
    if (r.matches < MIN_PER_BUCKET) continue;
    const lista = porHeroe.get(r.heroId) ?? [];
    lista.push({ from: r.from, matches: r.matches, winRate: r.wins / r.matches });
    porHeroe.set(r.heroId, lista);
  }

  return [...porHeroe.entries()]
    .map(([heroId, buckets]) => {
      const ordenados = [...buckets].sort((a, b) => a.from - b.from);
      const boost =
        ordenados.length >= 2
          ? (ordenados[ordenados.length - 1].winRate - ordenados[0].winRate) * 100
          : undefined;
      return { heroId, buckets: ordenados, ...(boost !== undefined ? { boost } : {}) };
    })
    .sort((a, b) => (b.boost ?? -Infinity) - (a.boost ?? -Infinity));
}
```

- [ ] **Paso 4: correr y verificar que pasa**

```bash
cd games/deadlock/pipeline && npm test -- mastery
```

Esperado: PASS, 5 tests.

- [ ] **Paso 5: commit**

```bash
git add games/deadlock/pipeline/src/mastery.ts games/deadlock/pipeline/test/mastery.test.ts
git commit -m "feat: las cuentas de la curva de maestría, con sus tests"
```

### Tarea B2: la consulta sobre la historia

**Archivos:** modificar `games/deadlock/pipeline/src/mastery.ts` y
`games/deadlock/pipeline/package.json`.

- [ ] **Paso 1: escribir `main`**

Tres pasos, en este orden, y el orden importa por memoria:

1. Cargar la **ventana** (ranked, banda publicada) en una tabla: es chica.
2. Sacar de ahí los pares `(account_id, hero_id)` distintos.
3. Escanear la **historia** (las 97 particiones) contando partidas previas **sólo
   de esos pares**. Sin el semi-join el agregado son decenas de millones de filas.

```ts
const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/mastery.json`;

async function main() {
  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const banda = publishedDefaultBand();
  const tiers = BANDS.find((b) => b.id === banda)!.tiers.join(", ");
  console.log(`maestría sobre la banda publicada: ${banda}`);

  const partitions = await listPartitions();
  const ranges = await partitionRanges(con, partitions);
  const hasta = await windowEnd(con, ranges);
  const desde = new Date(hasta.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const parts = await bandablePartitions(con, partitionsCovering(ranges, desde, hasta.toISOString()));

  // 1. La ventana, ya filtrada por banda.
  await con.run(`create or replace table v as
    select * from (${windowSql(parts, desde, hasta.toISOString())}) where tier in (${tiers})`);

  // 2. Los pares que hay que puntuar.
  await con.run("create or replace table pares as select distinct account_id, hero_id from v");
  const [{ n }] = (await rows("select count(*)::BIGINT as n from pares")) as unknown as { n: bigint }[];
  console.log(`  ${Number(n).toLocaleString("es")} pares (jugador, héroe) a puntuar`);

  // 3. La historia ANTES de la ventana, sólo de esos pares. Son ~97 particiones
  //    y unos 12 minutos: por eso este script corre una vez por día y no cada hora.
  const historia = partitions
    .map(
      (p) => `
      select account_id, hero_id from read_parquet('${partitionUrl(p)}')
      where game_mode = '${PLAYED_GAME_MODE}' and start_time < TIMESTAMP '${desde}'`
    )
    .join(" union all ");
  const t0 = Date.now();
  await con.run(`create or replace table previas as
    select h.account_id, h.hero_id, count(*)::BIGINT as previas
    from (${historia}) h
    semi join pares p on p.account_id = h.account_id and p.hero_id = h.hero_id
    group by 1, 2`);
  console.log(`  historia escaneada en ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);

  const caseTramo = `case ${[...BUCKETS]
    .reverse()
    .map((b) => `when coalesce(pr.previas, 0) >= ${b} then ${b}`)
    .join(" ")} end`;

  const crudas = (await rows(`
    select hero_id as heroId, bucket as "from",
           count(*)::BIGINT as matches, sum(case when won then 1 else 0 end)::BIGINT as wins
    from (
      select v.hero_id, v.won, ${caseTramo} as bucket
      from v left join previas pr on pr.account_id = v.account_id and pr.hero_id = v.hero_id
    ) t
    group by 1, 2`)) as unknown as
    { heroId: number; from: number; matches: bigint; wins: bigint }[];

  const heroes = masteryFrom(
    crudas.map((c) => ({ heroId: c.heroId, from: Number(c.from), matches: Number(c.matches), wins: Number(c.wins) }))
  );

  const file: MasteryFile = {
    generatedAt: new Date().toISOString(),
    band: banda,
    from: desde.slice(0, 10),
    to: hasta.toISOString().slice(0, 10),
    matches: Number(n),
    heroes,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(bandPath(OUT, banda), JSON.stringify(file));
  writeFileSync(OUT, JSON.stringify(file));
  const conBoost = heroes.filter((h) => h.boost !== undefined).length;
  console.log(`  ${heroes.length} héroes, ${conBoost} con curva completa`);
}
```

**Nota sobre el SQL del `case`:** se recorre `BUCKETS` al revés para que el primer
`when` que da verdadero sea el tramo más alto. Escrito al derecho, todo caería en
el tramo 0.

- [ ] **Paso 2: agregar el script**

```json
"build:mastery": "node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs src/mastery.ts",
```

`--max-old-space-size` va por la misma razón que en `build:builds`: el agregado de
la historia es grande.

- [ ] **Paso 3: correrlo de verdad**

```bash
cd games/deadlock/pipeline && npm run build:mastery
```

Esperado: ~12-15 minutos, e imprime cuántos héroes quedaron con curva completa.

- [ ] **Paso 4: mirar el resultado antes de creerle**

Abrir `games/deadlock/data/mastery.json` y contestar: **¿la curva sube?** Si los
tramos altos no le sacan nada a los bajos **dentro de la banda**, el panel no se
publica — está en el diseño y es un resultado válido. Anotar el número medido en
el documento de diseño en cualquiera de los dos casos.

- [ ] **Paso 5: commit**

```bash
git add games/deadlock/pipeline/src/mastery.ts games/deadlock/pipeline/package.json games/deadlock/data/mastery*.json
git commit -m "feat: medir cuánto rinde la experiencia con cada héroe"
```

---

## Parte C — La pestaña

### Tarea C1: la ruta y la capa de datos

**Archivos:**
- Modificar: `games/tft/ui/src/route.ts:33`
- Crear: `games/tft/ui/src/deadlockRanks.ts`
- Test: `games/tft/ui/test/deadlockRanks.test.ts`

- [ ] **Paso 1: el test que falla**

```ts
// games/tft/ui/test/deadlockRanks.test.ts
import { describe, expect, it } from "vitest";
import { DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";
import { showsCalibrationNotice } from "../src/deadlockRanks";

describe("la pestaña nueva", () => {
  it("está en la lista de secciones", () => {
    expect(DEADLOCK_SECTIONS).toContain("ranks");
  });
  it("va y vuelve de la URL", () => {
    const r = parseRoute("/en/deadlock/ranks");
    expect(r.dlSection).toBe("ranks");
    expect(routePath(r)).toBe("/en/deadlock/ranks");
  });
});

describe("el cartel de calibración", () => {
  it("se enciende mientras falte gente por calibrar", () => {
    expect(showsCalibrationNotice(0.476)).toBe(true);
  });
  it("se apaga solo cuando la cobertura llega, sin deploy de por medio", () => {
    expect(showsCalibrationNotice(0.98)).toBe(false);
  });
});
```

- [ ] **Paso 2: correr y verificar que falla**

```bash
cd games/tft/ui && npm test -- deadlockRanks
```

Esperado: FAIL en las cuatro.

- [ ] **Paso 3: implementar**

En `route.ts:33`:

```ts
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "items", "ranks", "patches"];
```

Y el tipo `DeadlockSection` suma `"ranks"`.

```ts
// games/tft/ui/src/deadlockRanks.ts
import { useEffect, useState } from "react";

export interface SideRow { tier: number; matches: number; team0: number; se: number }
export interface RankDay { day: string; matches: number[]; players: number[] }
export interface RanksFile {
  generatedAt: string; from: string; to: string; coverage: number;
  accounts: { seen: number; ranked: number };
  days: RankDay[];
  totals: { matches: number[]; players: number[] };
  sides: SideRow[];
  sidesOverall: SideRow;
}

/**
 * Cuánta cobertura hace falta para que el cartel se apague.
 *
 * No es 100%: siempre va a haber cuentas nuevas sin calibrar. A partir del 90% el
 * sesgo de "los que calibraron primero son los que más juegan" ya no mueve la
 * forma de la escalera lo suficiente como para tener que avisarlo.
 */
const COVERAGE_ENOUGH = 0.9;

export const showsCalibrationNotice = (coverage: number): boolean => coverage < COVERAGE_ENOUGH;

/** Se baja aparte: nadie aterriza en la escalera sin hacer clic. */
export function useRanks(): RanksFile | null {
  const [file, setFile] = useState<RanksFile | null>(null);
  useEffect(() => {
    let alive = true;
    import("@deadlock/ranks.json")
      .then((m) => alive && setFile(m.default as unknown as RanksFile))
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return file;
}
```

- [ ] **Paso 4: correr y verificar que pasa**

```bash
cd games/tft/ui && npm test -- deadlockRanks
```

Esperado: PASS, 4 tests.

- [ ] **Paso 5: commit**

```bash
git add games/tft/ui/src/route.ts games/tft/ui/src/deadlockRanks.ts games/tft/ui/test/deadlockRanks.test.ts
git commit -m "feat: la ruta y la capa de datos de la escalera"
```

### Tarea C2: la pantalla

**Archivos:**
- Crear: `games/tft/ui/src/DeadlockRanks.tsx`
- Modificar: `games/tft/ui/src/App.tsx`, `games/tft/ui/src/i18n.ts`,
  `games/tft/ui/src/codex.css`

- [ ] **Paso 1: la copia, en los dos idiomas**

En `i18n.ts`, dentro de `deadlock.tabs` sumar `ranks`, y un bloque
`deadlock.ranks` con: título, bajada, los rótulos del toggle
(partidas/jugadores), el cartel de calibración (con `{pct}` y `{ranked}` /
`{seen}` interpolados), el encabezado del lado del mapa y la frase de "todavía no
hay muestra por rango". **Y `seo.deadlock.ranks` en los dos idiomas, o el
prerender rompe** (`prerender.ts:100`).

Español neutro: "Abre", "Elige", nunca "Abrí" ni "Elegí".

- [ ] **Paso 2: el componente**

Estructura: `tool-head` con título y controles (el toggle partidas/jugadores),
después el cartel si corresponde, después la escalera (una barra por rango con su
insignia, de `catalog.ranks`), después la serie diaria, después el lado del mapa.

Reglas que ya costaron caro y valen acá:
- Buscar cualquier clase `dl-*` en `codex.css` **antes** de nombrarla: `.dl-split`
  ya existe y su grilla de dos columnas se hereda sin querer.
- Los íconos van con **tamaño fijo**, no `width: 100%` dentro de una grilla `1fr`.
- Ni una palabra adentro del SVG.

- [ ] **Paso 3: rutear en `App.tsx`**

```tsx
{route.dlSection === "items" ? (
  <DeadlockItems band={dlBand} picker={dlPicker} />
) : route.dlSection === "ranks" ? (
  <DeadlockRanks />
) : (
  <Deadlock section={route.dlSection} band={dlBand} picker={dlPicker} />
)}
```

`DeadlockRanks` **no recibe `picker`**: la escalera no es por banda.

- [ ] **Paso 4: verificar mirando la pantalla**

```bash
cd games/tft/ui && npm run dev
```

Abrir `/en/deadlock/ranks` y `/es/deadlock/ranks`. **Sacar una captura y mirarla**
— verificar el DOM no alcanza, ya pasó que el DOM daba bien con la página rota.
Comprobar además en **375px** de ancho que la barra de pestañas no desborde ahora
que son cuatro.

- [ ] **Paso 5: build y tests**

```bash
cd games/tft/ui && npm test && npm run build
```

- [ ] **Paso 6: commit**

```bash
git add games/tft/ui/src games/tft/ui/test
git commit -m "feat: la pestaña de la escalera de rangos"
```

### Tarea C3: el panel de maestría

**Archivos:** crear `games/tft/ui/src/DeadlockMastery.tsx`; modificar
`Deadlock.tsx`, `i18n.ts`, `codex.css`.

- [ ] **Paso 1: montar el panel donde ya se despliega la build**

Va **dentro de la fila desplegable del héroe**, al lado de `DeadlockBuildCard`.
No es una pestaña: ese error ya se cometió con `/deadlock/builds` el 30/7 y se
revirtió el mismo día.

- [ ] **Paso 2: el JSON con `import()`**, igual que la escalera y que las builds.

- [ ] **Paso 3: no dibujar lo que no se sabe**

Si el héroe no tiene `boost`, el panel no aparece. Si tiene un solo tramo, tampoco.

- [ ] **Paso 4: verificar mirando la pantalla y commitear**

```bash
cd games/tft/ui && npm test && npm run build
git add games/tft/ui/src games/tft/ui/test
git commit -m "feat: la curva de maestría en la fila del héroe"
```

---

## Parte D — Que corra solo

### Tarea D1: los workflows y el presupuesto

- [ ] **Paso 1: mirar cuánto queda del mes**

```bash
gh api /repos/ZoTaD/BlonixStats/actions/workflows --jq '.workflows[] | "\(.name) \(.path)"'
```

- [ ] **Paso 2: agregar `build:ranks` a la corrida horaria de Deadlock**, después
de `build:heroes` (necesita que el horizonte ya esté calculado). Son segundos.

- [ ] **Paso 3: `build:mastery` va en un workflow propio, una vez por día.** Son
~15 min por corrida, o sea ~450 min/mes sobre un presupuesto de 2.000 que ya está
ajustado.

- [ ] **Paso 4: bajar el cron horario de Deadlock a `0 */3 * * *` si el
presupuesto no cierra.** La partición viva se reescribe cada ~70 minutos, así que
cada tres horas no pierde casi nada.

- [ ] **Paso 5: verificar que el deploy salga**

`games/deadlock/data` ya está en el `ignore` de `netlify.toml` (verificado el
2026-08-01), así que los JSON nuevos disparan build. **Confirmar en el primer
deploy real que el sitio sirva la escalera** y no quede en verde sirviendo lo
viejo: es el fallo que ya costó descubrir dos veces y ningún test lo agarra.

- [ ] **Paso 6: commit**

```bash
git add .github/workflows
git commit -m "chore: correr la escalera cada hora y la maestría una vez por día"
```
