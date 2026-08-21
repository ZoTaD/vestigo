# Plan de implementación — El resumen incremental

> Diseño: `docs/design/2026-07-26-tier-list-incremental-design.md` (corregido el
> 2026-07-26 con los números medidos y las tres decisiones nuevas).

**Objetivo:** que la tier list se arme desde un resumen de contadores en vez de leer
las partidas crudas, para que pueda escalar a millones de partidas — y para que
"esta comp subió o bajó" y "apareció una comp nueva" salgan de comparar días.

**Arquitectura:** un tipo `SignatureSummary` con todos los contadores que
`aggregateComps` necesita; `summarize()` convierte tableros en resúmenes y
`mergeSummaries()` los suma. El camino viejo pasa por el nuevo
(`aggregateComps(boards)` = `aggregateComps(summarize(boards))`), así los tests
actuales prueban que resumir no pierde nada. Después el resumen vive en Postgres, lo
alimenta la Action diaria, y el build lee de ahí.

**Stack:** TypeScript, Node 22, vitest, Supabase (PostgREST), GitHub Actions.

## Restricciones globales

- **El camino de disco tiene que seguir dando el MISMO `comps.json`.** Es la única
  prueba de que el resumen no pierde nada. Si difiere en un solo número, el resumen
  está mal, no el build.
- **Nada hardcodea un número de set ni un parche.**
- **El borrado de partidas crudas nace APAGADO**, detrás de una constante de
  retención. La restricción de espacio es temporal (hasta el plan Pro de Supabase) y
  un resumen no se puede des-resumir.
- Toda la prosa de la UI vive en `games/tft/ui/src/i18n.ts`, EN y ES, español neutro
  latinoamericano sin voseo.
- La `SUPABASE_SERVICE_ROLE_KEY` nunca entra a git.
- Cada tarea termina con `npm test --prefix games/tft/pipeline` en verde y un commit.
- Mensajes de commit en inglés, prefijo en minúscula, dicen el *por qué*.
- **Ninguna tarea commitea archivos de `games/tft/data/`.**

## Los números que ordenan el esquema

Medidos sobre el parche vigente (7.253 partidas, 112.520 tableros, las cinco bandas):

| tabla | filas por parche |
|---|---|
| comp | 4.175 (× días del parche si la clave lleva el día) |
| unidad | 72.167 |
| **unidad-ítem** | **349.293** |
| trait | 34.947 |

De ahí sale la regla de granularidad: **el día va solo en la clave de comp**, que es
lo que hace falta para la tendencia. El detalle va por parche. Con el día en el
detalle, el resumen sería catorce veces más grande sin responder ninguna pregunta que
alguien haga.

---

### Tarea 1 — El resumen: el tipo, `summarize` y `mergeSummaries`

**Archivos:**
- Crear: `games/tft/pipeline/src/aggregate/summary.ts`
- Crear: `games/tft/pipeline/test/summary.test.ts`

**Produce:** `SignatureSummary`, `UnitSummary`, `TraitSummary`, `OutcomeCounts`,
`summarize(participants, keepItem)`, `mergeSummaries(list)`.

**Consume:** `Participant`, `Unit` y `compSignature` de `./signature`.

Lo que el tipo tiene que cargar sale de leer `statsFor` en `aggregate/group.ts` línea
por línea y anotar de qué contador sale cada campo publicado. Los tres que no son
obvios:

- **`placementVar`** es varianza muestral (denominador `n-1`), así que hacen falta
  `sumPlacement` y `sumPlacementSq`.
- **`traits[].units`** es la **moda** de `numUnits`, no el promedio: hace falta un
  histograma `Record<numUnits, boards>`, no una suma.
- **`itemPriority`** cuenta **instancias** de ítem sobre todas las unidades (una
  unidad con el mismo ítem dos veces suma dos), mientras que `units[].items` cuenta
  **tableros** que lo llevaban (con `new Set` por unidad). Son dos contadores
  distintos y hay que guardar los dos.

Y una que se paga si se olvida: **un tablero puede tener el mismo campeón dos veces**
(6,5% de los tableros reales). `statsFor` los colapsa a la copia más invertida con
`bestCopy` antes de contar. Eso se hace al resumir, o todas las tasas por unidad se
pasan de 1.

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/summary.test.ts
import { describe, it, expect } from "vitest";
import { summarize, mergeSummaries } from "../src/aggregate/summary";
import type { Participant } from "../src/aggregate/signature";

function board(
  placement: number,
  units: { id: string; tier?: number; items?: string[] }[],
  trait = { name: "TFT17_Sorcerer", numUnits: 6 }
): Participant {
  return {
    puuid: "p" + placement,
    placement,
    level: 8,
    goldLeft: 3,
    units: units.map((u) => ({
      character_id: u.id,
      tier: u.tier ?? 1,
      rarity: 2,
      items: u.items ?? [],
    })),
    traits: [{ name: trait.name, numUnits: trait.numUnits, tierCurrent: 3, tierTotal: 4 }],
  };
}

const carry = { id: "TFT17_Zoe", tier: 2, items: ["Deathblade", "Deathblade"] };

describe("summarize", () => {
  it("agrupa por firma y cuenta los tableros", () => {
    const s = summarize([board(1, [carry]), board(5, [carry])]);
    expect([...s.keys()]).toEqual(["TFT17_Sorcerer|TFT17_Zoe"]);
    expect([...s.values()][0].boards).toBe(2);
  });

  it("guarda suma y suma de cuadrados de la posición, que es lo que pide la varianza", () => {
    const [only] = [...summarize([board(1, [carry]), board(5, [carry])]).values()];
    expect(only.sumPlacement).toBe(6);
    expect(only.sumPlacementSq).toBe(1 + 25);
  });

  it("parte los contadores por cómo terminó la partida", () => {
    const [only] = [...summarize([board(1, [carry]), board(5, [carry])]).values()];
    expect(only.top4).toBe(1);
    expect(only.winner.boards).toBe(1);
    expect(only.loser.boards).toBe(1);
    expect(only.loser.sumPlacement).toBe(5);
  });

  // 6,5% de los tableros reales llevan el mismo campeón dos veces. Sin colapsarlos,
  // toda tasa por unidad se pasa de 1.
  it("colapsa las copias del mismo campeón a la más invertida", () => {
    const dosCopias = board(1, [
      { id: "TFT17_Zoe", tier: 1, items: [] },
      { id: "TFT17_Zoe", tier: 2, items: ["Deathblade"] },
    ]);
    const [only] = [...summarize([dosCopias]).values()];
    expect(only.units["TFT17_Zoe"].boards).toBe(1);
    expect(only.units["TFT17_Zoe"].sumStars).toBe(2);
    expect(only.units["TFT17_Zoe"].sumItems).toBe(1);
  });

  // itemPriority cuenta instancias; units[].items cuenta tableros. Dos contadores.
  it("cuenta instancias de ítem aparte de tableros con ítem", () => {
    const [only] = [...summarize([board(1, [carry])]).values()];
    expect(only.itemInstances["Deathblade"]).toBe(2);
    expect(only.units["TFT17_Zoe"].items["Deathblade"].boards).toBe(1);
  });

  // traits[].units es la MODA de numUnits, así que el resumen necesita el histograma.
  it("guarda el histograma de unidades por trait, no su promedio", () => {
    const s = summarize([
      board(1, [carry], { name: "TFT17_Sorcerer", numUnits: 6 }),
      board(2, [carry], { name: "TFT17_Sorcerer", numUnits: 4 }),
      board(3, [carry], { name: "TFT17_Sorcerer", numUnits: 4 }),
    ]);
    const [only] = [...s.values()];
    expect(only.traits["TFT17_Sorcerer"].units).toEqual({ 4: 2, 6: 1 });
  });

  it("respeta el filtro de ítems", () => {
    const [only] = [...summarize([board(1, [carry])], (id) => id !== "Deathblade").values()];
    expect(only.itemInstances).toEqual({});
    expect(only.units["TFT17_Zoe"].sumItems).toBe(0);
    expect(only.units["TFT17_Zoe"].itemized).toBe(0);
  });

  it("descarta el tablero sin firma", () => {
    expect(summarize([board(1, [])]).size).toBe(0);
  });
});

describe("mergeSummaries", () => {
  it("sumar dos resúmenes da lo mismo que resumir todo junto", () => {
    const a = [board(1, [carry]), board(3, [carry])];
    const b = [board(5, [carry]), board(8, [carry])];
    const juntos = [...summarize([...a, ...b]).values()][0];
    const sumados = mergeSummaries([
      [...summarize(a).values()][0],
      [...summarize(b).values()][0],
    ]);
    expect(sumados).toEqual(juntos);
  });

  it("no muta sus entradas", () => {
    const a = [...summarize([board(1, [carry])]).values()][0];
    const antes = JSON.parse(JSON.stringify(a));
    mergeSummaries([a, [...summarize([board(2, [carry])]).values()][0]]);
    expect(a).toEqual(antes);
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- summary
```

Esperado: FAIL, `Cannot find module '../src/aggregate/summary'`.

- [ ] **Paso 3: implementar `summary.ts`**

Leer `games/tft/pipeline/src/aggregate/group.ts` completo antes de escribir nada: cada
contador del resumen tiene que corresponder a algo que `statsFor` calcula hoy. La
estructura:

```ts
import { compSignature, type Participant, type Unit } from "./signature";

/** Un ítem, contado de las dos maneras que el agregador necesita. */
export interface ItemCounts {
  /** Tableros que lo llevaban en esta unidad. Nunca más de uno por tablero. */
  boards: number;
  winnerBoards: number;
  /** Copias del ítem. Una unidad puede llevar el mismo ítem dos veces. */
  instances: number;
}

export interface UnitSummary {
  boards: number;
  sumStars: number;
  threeStar: number;
  sumItems: number;
  itemized: number;
  winnerBoards: number;
  loserBoards: number;
  /** Para avgPlacementWith, y por diferencia para avgPlacementWithout. */
  sumPlacement: number;
  items: Record<string, ItemCounts>;
}

export interface TraitSummary {
  boards: number;
  /** Histograma de numUnits → tableros. La moda no sale de una suma. */
  units: Record<number, number>;
}

export interface OutcomeCounts {
  boards: number;
  sumPlacement: number;
  sumLevel: number;
  sumGoldLeft: number;
}

export interface SignatureSummary {
  signature: string;
  boards: number;
  sumPlacement: number;
  /** Suma de cuadrados, para la varianza muestral que pide el encogimiento. */
  sumPlacementSq: number;
  top4: number;
  wins: number;
  sumLevel: number;
  winner: OutcomeCounts;
  loser: OutcomeCounts;
  units: Record<string, UnitSummary>;
  traits: Record<string, TraitSummary>;
  /** Instancias por ítem sobre todas las unidades, para itemPriority. */
  itemInstances: Record<string, number>;
}

export type ItemFilter = (itemId: string) => boolean;

export function summarize(
  participants: Participant[],
  keepItem: ItemFilter = () => true
): Map<string, SignatureSummary>;

export function mergeSummaries(list: SignatureSummary[]): SignatureSummary;
```

`summarize` colapsa las copias del mismo campeón con la misma regla que `statsFor`
(más ítems gana; a igualdad de ítems, más estrellas) antes de contar nada.

`mergeSummaries` suma campo por campo y devuelve un objeto nuevo, sin tocar las
entradas: los resúmenes que vienen de la base se reusan entre bandas.

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS, los 173 de antes más los nuevos.

- [ ] **Paso 5: commit**

```bash
git add games/tft/pipeline/src/aggregate/summary.ts games/tft/pipeline/test/summary.test.ts
git commit -m "feat: count what a comp is, so boards stop being the only way to know it"
```

---

### Tarea 2 — `aggregateComps` sobre resúmenes, con el camino viejo pasando por el nuevo

**Archivos:**
- Modificar: `games/tft/pipeline/src/aggregate/group.ts`
- Modificar: `games/tft/pipeline/test/group.test.ts` (solo agregar, no tocar lo existente)

**Consume:** `SignatureSummary`, `summarize`, `mergeSummaries` de `./summary`.

**Produce:** `aggregateFromSummaries(summaries, totalBoards, minCount, costOf, maxComps, keepItem)`.
`aggregateComps` mantiene su firma actual y pasa a ser un envoltorio.

**Esto es lo único de todo el plan que puede romper lo publicado.** La red es que
`test/group.test.ts` tiene 18 tests que hoy pasan y tienen que seguir pasando **sin
tocarlos**.

- [ ] **Paso 1: el test nuevo, antes de tocar `group.ts`**

```ts
// agregar al final de games/tft/pipeline/test/group.test.ts
import { aggregateComps, aggregateFromSummaries } from "../src/aggregate/group";
import { summarize } from "../src/aggregate/summary";

describe("aggregateFromSummaries", () => {
  // La prueba de que resumir no pierde nada de lo que se publica.
  it("da exactamente lo mismo que agregar desde los tableros", () => {
    const boards = manyBoards(); // el helper que ya usa este archivo
    const desdeTableros = aggregateComps(boards, 2);
    const resumenes = [...summarize(boards).values()];
    const desdeResumen = aggregateFromSummaries(resumenes, boards.length, 2);
    expect(desdeResumen).toEqual(desdeTableros);
  });
});
```

Si el archivo no tiene un helper que arme un lote de tableros variados, escribir uno
con al menos: dos comps que se fusionen por roster, una unidad con dos copias en un
tablero, ítems repetidos, y traits con distinto `numUnits`.

- [ ] **Paso 2: correr y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- group
```

Esperado: FAIL, `aggregateFromSummaries is not a function`.

- [ ] **Paso 3: el refactor**

Tres cambios, en este orden:

1. `coreOf(members: Participant[])` pasa a `coreOf(s: SignatureSummary)`: las unidades
   con `units[id].boards / s.boards >= CORE_THRESHOLD`. Es el mismo cálculo.
2. `statsFor(members, total, …)` pasa a tomar un `SignatureSummary` ya fusionado.
   Cada campo sale de una división en vez de un recorrido. Los cuidados —los cuatro
   primeros salieron de una revisión que reconstruyó `aggregateComps` entero desde los
   contadores y comparó contra la salida real, así que no son hipotéticos:
   - **`winnerItems` tiene que filtrar `winnerBoards > 0`.** Hoy `winnerItemsBy` se
     construye solo desde tableros ganadores, así que un ítem que nunca apareció en un
     top 4 **no está en el Map**. En el resumen sí está, con `winnerBoards: 0`. Sin el
     filtro, 14 unidades de un solo dataset emiten `{id, count: 0}` que hoy no existen.
   - **`playRate` se divide por los tableros de la BANDA, no por la suma de los
     resúmenes.** El ~10% de los tableros no tiene firma y `summarize` los descarta,
     pero cuentan en el denominador. `summarize` ahora informa cuántos vio en total:
     usar eso.
   - **Agregar un desempate total a los tres ordenamientos por tamaño** de
     `aggregateComps` (los seeds, `measured` y el `sort` final), por ejemplo
     `|| a.signature.localeCompare(b.signature)`. Hoy los empates los resuelve el orden
     de inserción del Map; cuando los resúmenes vengan de la base, ese orden es el que
     devuelva la consulta, y sin desempate una comp cambia de nombre según cómo venga
     ordenada la query. Demostrado en la revisión.
   - `placementVar` con `n > 1`: usar la forma estable
     `(sumSq - n·media²) / (n-1)` con `media = sum/n`, **no** `(sumSq - sum²/n)`, que
     sale del rango entero exacto a los ~2,1e7 tableros. Y `0` con un solo tablero.
   - `traits[].units` es `modal` sobre el histograma, con el mismo desempate (gana el
     valor más grande).
   - `topItems` ordena por cantidad y desempata con `localeCompare`, igual que hoy.
   - `avgPlacementWithout` = `(sumPlacement - unit.sumPlacement) / (boards - unit.boards)`.
3. Los dos pases de fusión (por roster y por identidad) pasan a fusionar resúmenes con
   `mergeSummaries` en vez de concatenar arrays.

`aggregateComps` queda como:

```ts
export function aggregateComps(
  participants: Participant[],
  minCount = 20,
  costOf: CostLookup = () => 0,
  maxComps = Number.POSITIVE_INFINITY,
  keepItem: ItemFilter = () => true
): CompStats[] {
  const summaries = [...summarize(participants, keepItem).values()];
  return aggregateFromSummaries(summaries, participants.length, minCount, costOf, maxComps, keepItem);
}
```

**`total` es la cantidad de tableros de la banda, no la suma de los resúmenes**: es lo
que divide `playRate`, y los tableros sin firma cuentan en el denominador.

- [ ] **Paso 4: los tests, incluidos los 18 que ya existían**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS todo. **Si alguno de los 18 de `group.test.ts` falla, el resumen está
perdiendo algo: arreglar el resumen, nunca el test.**

- [ ] **Paso 5: la verificación que decide si esto sigue**

**No comparar contra los archivos commiteados.** El store en disco crece entre
commits, así que una diferencia ahí puede ser datos nuevos y no el refactor — un
intento anterior perdió tiempo justo con eso. La comparación tiene que aislar la
única variable que importa: **los mismos tableros, por los dos caminos, con el mismo
código**.

Escribir un script descartable (fuera del repo, o borrado antes de commitear) que:

1. Cargue los tableros del parche vigente una sola vez, con `loadLobbies` +
   `isComparable` + el filtro de parche, igual que `build.ts`.
2. Llame a `aggregateComps(boards, …)` — el camino de tableros.
3. Llame a `aggregateFromSummaries([...summarize(boards).values()], totalDeLaBanda, …)`
   con los mismos argumentos.
4. Compare los dos arrays completos con igualdad profunda, y si difieren, imprima
   **la primera comp y el primer campo** que no coinciden. Un "difieren" sin decir en
   qué no sirve para arreglar nada.

Correrlo sobre las cinco bandas. Esperado: **iguales en las cinco**. Cualquier
diferencia significa que resumir perdió algo: encontrar el campo y arreglar el
resumen, nunca el test ni la comparación.

- [ ] **Paso 6: commit**

```bash
git add games/tft/pipeline/src/aggregate/group.ts games/tft/pipeline/test/group.test.ts
git commit -m "refactor: measure comps from counters, so the boards stop being needed"
```

---

### Tarea 3 — Las tablas del resumen

**Archivos:**
- Crear: `games/tft/supabase/migrations/0006_comp_summary.sql`

Cuatro tablas, RLS activo y cero políticas como todas las demás, y **el día solo en la
clave de comp** (ver los números arriba: con el día en el detalle el resumen es
catorce veces más grande sin contestar nada nuevo).

```sql
-- El resumen que reemplaza a leer las partidas.
--
-- Medido sobre el parche vigente: 4.175 firmas, 72.167 filas de unidad, 349.293 de
-- unidad-item y 34.947 de trait. Esas filas son combinatoria, no volumen: con diez
-- veces mas partidas siguen siendo las mismas. Por eso el dia va solo en comp_stats,
-- que es donde hace falta para responder "esta comp subio o bajo"; el detalle va por
-- parche, porque multiplicarlo por catorce dias no contesta ninguna pregunta.

create table if not exists public.comp_stats (
  band              text    not null,
  patch             text    not null,
  day               date    not null,
  signature         text    not null,
  boards            integer not null default 0,
  sum_placement     bigint  not null default 0,
  sum_placement_sq  bigint  not null default 0,
  top4              integer not null default 0,
  wins              integer not null default 0,
  sum_level         bigint  not null default 0,
  winner_boards     integer not null default 0,
  winner_sum_placement bigint not null default 0,
  winner_sum_level  bigint  not null default 0,
  winner_sum_gold   bigint  not null default 0,
  loser_boards      integer not null default 0,
  loser_sum_placement bigint not null default 0,
  loser_sum_level   bigint  not null default 0,
  loser_sum_gold    bigint  not null default 0,
  primary key (band, patch, day, signature)
);

create table if not exists public.comp_unit_stats (
  band          text    not null,
  patch         text    not null,
  signature     text    not null,
  unit_id       text    not null,
  boards        integer not null default 0,
  sum_stars     bigint  not null default 0,
  three_star    integer not null default 0,
  sum_items     bigint  not null default 0,
  itemized      integer not null default 0,
  winner_boards integer not null default 0,
  loser_boards  integer not null default 0,
  sum_placement bigint  not null default 0,
  primary key (band, patch, signature, unit_id)
);

create table if not exists public.comp_unit_item_stats (
  band          text    not null,
  patch         text    not null,
  signature     text    not null,
  unit_id       text    not null,
  item_id       text    not null,
  boards        integer not null default 0,
  winner_boards integer not null default 0,
  instances     integer not null default 0,
  primary key (band, patch, signature, unit_id, item_id)
);

-- num_units entra en la clave a proposito: traits[].units es la MODA, y una moda no
-- sale de una suma. Cada fila es un balde del histograma.
create table if not exists public.comp_trait_stats (
  band       text    not null,
  patch      text    not null,
  signature  text    not null,
  trait_id   text    not null,
  num_units  integer not null,
  boards     integer not null default 0,
  primary key (band, patch, signature, trait_id, num_units)
);

-- Instancias de item por comp, para itemPriority: cuenta copias, no tableros.
create table if not exists public.comp_item_stats (
  band      text    not null,
  patch     text    not null,
  signature text    not null,
  item_id   text    not null,
  instances integer not null default 0,
  primary key (band, patch, signature, item_id)
);

-- Cuantos tableros tuvo la banda en total, con firma o sin ella: es el denominador
-- de playRate, y los tableros sin firma cuentan en el.
create table if not exists public.band_stats (
  band   text    not null,
  patch  text    not null,
  day    date    not null,
  boards integer not null default 0,
  matches integer not null default 0,
  primary key (band, patch, day)
);

alter table public.comp_stats            enable row level security;
alter table public.comp_unit_stats       enable row level security;
alter table public.comp_unit_item_stats  enable row level security;
alter table public.comp_trait_stats      enable row level security;
alter table public.comp_item_stats       enable row level security;
alter table public.band_stats            enable row level security;

-- Que partidas ya se contabilizaron. Sin esto, una corrida repetida cuenta dos veces
-- y no hay forma de notarlo mirando los contadores.
alter table public.matches
  add column if not exists summarized_at timestamptz;

create index if not exists matches_pending_summary
  on public.matches (summarized_at) where summarized_at is null;
```

- [ ] **Paso 1: aplicar la migración** con `apply_migration` del MCP de Supabase.
- [ ] **Paso 2: verificar** que las seis tablas existen, que tienen RLS activo y cero
  políticas, y que `matches.summarized_at` existe y está en null para todas.
- [ ] **Paso 3: commit** del archivo de migración.

---

### Tarea 4 — Resumir en la Action

**Archivos:**
- Crear: `games/tft/pipeline/src/summarize-run.ts`
- Crear: `games/tft/pipeline/test/summarizeRun.test.ts`
- Modificar: `games/tft/pipeline/package.json` (script `summarize`)
- Modificar: `.github/workflows/publish.yml` (un paso antes del build)

**Consume:** `pgFetcher`, `PgRow`, `lobbiesFromRows` de `./pgStore`; `summarize` y
`mergeSummaries` de `./aggregate/summary`; `BANDS`/`bandCovers` de `./bands`;
`patchOf` de `./patch`; `isComparable` de `./store`.

Lo que hace, por lote de partidas sin `summarized_at`:

1. Convierte a `LobbyRecord` y descarta lo que no es ranked del set (`isComparable`).
2. Por cada banda que la cubre, resume sus tableros y acumula.
3. Hace upsert sumando contra las tablas, por lotes.
4. Marca las partidas con `summarized_at`.
5. **Si `RAW_RETENTION_DAYS > 0`**, borra las crudas más viejas que eso ya
   contabilizadas. **Nace en 0 = no borrar nada**, y el comentario dice por qué.

La parte pura y testeable —convertir lobbies en filas listas para upsert— va en una
función exportada `rowsFor(lobbies, set)`. El test cubre: que una partida de otra cola
no genere filas; que una partida cuente en todas las bandas que la cubren (`global` se
solapa con `apex` a propósito); que el día salga de `game_datetime` y no de la fecha
de hoy; y que `band_stats` cuente los tableros sin firma en el denominador.

**Sumar en el upsert, no pisar.** PostgREST con `resolution=merge-duplicates` pisa la
fila. Para acumular hay que hacerlo con una función SQL (`insert … on conflict do
update set boards = comp_stats.boards + excluded.boards, …`) expuesta como RPC, o leer
la fila, sumar en memoria y escribir. **Decidir al implementar y dejar escrito por qué**;
la primera opción es una ida y vuelta por lote en vez de dos.

- [ ] Test primero, implementación, tests en verde, commit.
- [ ] Corrida real contra la base con un lote chico (`LIMIT` por variable de entorno),
  verificando con SQL que los contadores de una firma conocida coinciden con lo que da
  el build de disco para esa misma firma.

---

### Tarea 5 — El build lee del resumen

**Archivos:**
- Modificar: `games/tft/pipeline/src/build.ts` (fuente `--from=summary`)
- Crear: `games/tft/pipeline/src/summaryStore.ts` + su test

Lee las filas del resumen para el parche pedido, arma los `SignatureSummary` por banda
y llama a `aggregateFromSummaries`. `--from=pg` y el camino de disco siguen existiendo:
son con lo que se compara.

**La verificación que cierra el plan:** construir el mismo parche desde el resumen y
desde las crudas tiene que dar el mismo `comps.json` salvo `generatedAt`. Si difiere,
el resumen o el backfill están mal.

---

### Tarea 6 — Backfill

Contabilizar de una vez todo lo que ya está en Postgres (13.429 partidas al
2026-07-26), en lotes, con el mismo código de la Tarea 4. Verificar contra la tabla de
la Tarea 5.

`habits.json` y la calibración **siguen saliendo de las partidas crudas**: miden cosas
de la mesa entera y no se reconstruyen desde contadores por firma. Mientras el borrado
esté apagado eso no molesta a nadie; el día que se prenda, hay que resumirlos también,
y es trabajo aparte.

---

## Qué queda explícitamente afuera

- **Borrar partidas crudas.** La constante existe y está en cero.
- **Resumir calibración y hábitos.** Necesitan la mesa entera; es otro trabajo.
- **La tendencia en pantalla** ("subió 3 puestos"). Esta plan deja los datos por día
  para que se pueda calcular; mostrarla es una feature de UI aparte.
