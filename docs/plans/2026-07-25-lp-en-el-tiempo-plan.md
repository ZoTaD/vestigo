# Plan de implementación — LP en el tiempo

> Diseño: `docs/design/2026-07-24-lp-en-el-tiempo-design.md` (aprobado y con el
> validador ya verificado contra la API en vivo el 2026-07-25).

**Objetivo:** que el perfil diga en qué rango está el jugador, dibuje su LP a lo
largo del set y marque el LP que dio una partida cuando eso se puede afirmar.

**Arquitectura:** Postgres guarda snapshots del rango (uno por búsqueda, sin
llamadas extra a Riot); la Edge Function los escribe y los devuelve con la
búsqueda; toda la aritmética vive en un módulo puro de la UI con tests.

**Stack:** TypeScript, React, vitest, Supabase (PostgREST + Edge Functions Deno).

## Restricciones globales

- **Toda la prosa va en `games/tft/ui/src/i18n.ts`**, EN y ES. Nada de texto
  suelto en componentes. El español es **neutro latinoamericano, sin voseo**.
- Los slugs y claves nuevas van **en inglés**.
- Nada **hardcodea un número de set**.
- Lo que puede fallar, falla solo: perder el rango degrada el reporte, nunca
  rompe la búsqueda.
- `dev-api.ts` y la Edge Function tienen que hacer **lo mismo**. Una diferencia
  entre las dos es una feature que anda en dev y no en producción.
- Cada tarea termina con los tests de su paquete en verde y un commit.

---

### Tarea 1 — La escala de LP, pura y con tests

**Archivos:**
- Crear: `games/tft/ui/src/lp.ts`
- Crear: `games/tft/ui/test/lp.test.ts`

**Produce:** `absoluteLp`, `TIERS`, `APEX_TIERS`, `LpSnapshot`, `LpPoint`,
`series`, `attribute`, `RANKED_QUEUE`.

- [ ] **Paso 1: el test de la escala, antes que nada**

```ts
import { describe, it, expect } from "vitest";
import { absoluteLp } from "../src/lp";

describe("absoluteLp", () => {
  it("empieza en cero en el piso de la escala", () => {
    expect(absoluteLp("IRON", "IV", 0)).toBe(0);
  });

  it("cuenta cien por división y cuatrocientos por tier", () => {
    expect(absoluteLp("IRON", "I", 0)).toBe(300);
    expect(absoluteLp("BRONZE", "IV", 0)).toBe(400);
    expect(absoluteLp("GOLD", "I", 42)).toBe(3 * 400 + 300 + 42);
  });

  // El punto entero de la escala: sin ella este ascenso se lee como −88.
  it("hace que un ascenso sume", () => {
    const antes = absoluteLp("GOLD", "I", 100)!;
    const despues = absoluteLp("PLATINUM", "IV", 12)!;
    expect(despues - antes).toBe(12);
  });

  it("pega Master justo arriba de Diamante I", () => {
    expect(absoluteLp("DIAMOND", "I", 100)).toBe(absoluteLp("MASTER", "", 0));
  });

  it("trata Master, GM y Challenger como un solo pool", () => {
    expect(absoluteLp("CHALLENGER", "", 900)).toBe(absoluteLp("MASTER", "", 900));
    expect(absoluteLp("GRANDMASTER", "I", 300)).toBe(absoluteLp("MASTER", "", 300));
  });

  it("devuelve null cuando no sabe", () => {
    expect(absoluteLp("", "", 0)).toBeNull();
    expect(absoluteLp("GOLD", "", 0)).toBeNull();
    expect(absoluteLp("UNRANKED", "I", 0)).toBeNull();
  });
});
```

- [ ] **Paso 2: correrlo y verlo fallar**

`npm test --prefix games/tft/ui -- lp`
Esperado: FAIL, `Failed to resolve import "../src/lp"`.

- [ ] **Paso 3: escribir la escala**

```ts
/**
 * El LP de un jugador como un solo número comparable.
 *
 * Comparar LP crudo entre dos momentos miente en cuanto alguien cambia de
 * división: subir de Oro I con 100 LP a Platino IV con 12 es +12, y restar los
 * LP a secas da −88. La escala absoluta existe para que la resta sea la verdad.
 *
 * Master, Grandmaster y Challenger comparten un mismo pool de LP: son cortes
 * sobre la misma recta, no escalones con LP propio. Por eso los tres arrancan
 * en el mismo lugar, justo donde termina Diamante I.
 */
export const TIERS = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND",
] as const;

export const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

const DIVISIONS = ["IV", "III", "II", "I"];
const PER_DIVISION = 100;
const PER_TIER = DIVISIONS.length * PER_DIVISION;
/** Donde termina Diamante I: 7 tiers de 400. */
const APEX_BASE = TIERS.length * PER_TIER;

/** La cola rankeada estándar. Verificado sobre el store: es la única que mueve LP. */
export const RANKED_QUEUE = 1100;

/** Null cuando no se puede ubicar: sin rango, o un tier que no conocemos. */
export function absoluteLp(tier: string, division: string, lp: number): number | null {
  const name = tier.trim().toUpperCase();
  if (APEX_TIERS.has(name)) return APEX_BASE + lp;
  const t = TIERS.indexOf(name as (typeof TIERS)[number]);
  if (t < 0) return null;
  const d = DIVISIONS.indexOf(division.trim().toUpperCase());
  if (d < 0) return null;
  return t * PER_TIER + d * PER_DIVISION + lp;
}
```

- [ ] **Paso 4: correr los tests y verlos pasar**

`npm test --prefix games/tft/ui -- lp` → PASS (6 tests).

- [ ] **Paso 5: el test de la serie y de la atribución**

```ts
import { attribute, series, type LpSnapshot } from "../src/lp";

const snap = (o: Partial<LpSnapshot> = {}): LpSnapshot => ({
  tier: "GOLD", division: "I", leaguePoints: 0, games: 100,
  setNumber: 17, takenAt: 1_000, ...o,
});
const game = (matchId: string, playedAt: number, queueId = 1100) => ({ matchId, playedAt, queueId });

describe("series", () => {
  it("deja solo el set pedido y ordena por fecha", () => {
    const pts = series(
      [snap({ takenAt: 3_000, leaguePoints: 30 }),
       snap({ takenAt: 1_000, leaguePoints: 10 }),
       snap({ takenAt: 2_000, setNumber: 16 })],
      17
    );
    expect(pts.map((p) => p.takenAt)).toEqual([1_000, 3_000]);
  });

  it("descarta los que no se pueden ubicar en la escala", () => {
    expect(series([snap({ tier: "" })], 17)).toEqual([]);
  });
});

describe("attribute", () => {
  it("marca la partida cuando el contador dice que fue una sola", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100, leaguePoints: 10 }),
       snap({ takenAt: 3_000, games: 101, leaguePoints: 44 })],
      [game("M1", 2_000)]
    );
    expect(got.get("M1")).toBe(34);
  });

  it("no dice nada si el contador vio más partidas de las que tenemos", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100 }), snap({ takenAt: 3_000, games: 103 })],
      [game("M1", 2_000)]
    );
    expect(got.size).toBe(0);
  });

  it("no dice nada si hay dos candidatas para un solo movimiento", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100 }), snap({ takenAt: 5_000, games: 101 })],
      [game("M1", 2_000), game("M2", 3_000)]
    );
    expect(got.size).toBe(0);
  });

  it("ignora las partidas que no son ranked al elegir la candidata", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100, leaguePoints: 10 }),
       snap({ takenAt: 5_000, games: 101, leaguePoints: 30 })],
      [game("M1", 2_000, 1090), game("M2", 3_000, 1100)]
    );
    expect(got.get("M2")).toBe(20);
    expect(got.has("M1")).toBe(false);
  });

  it("no atribuye a través de un cambio de set", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100, setNumber: 16 }),
       snap({ takenAt: 3_000, games: 101, setNumber: 17 })],
      [game("M1", 2_000)]
    );
    expect(got.size).toBe(0);
  });

  it("con un solo snapshot no hay ventana", () => {
    expect(attribute([snap()], [game("M1", 2_000)]).size).toBe(0);
  });
});
```

- [ ] **Paso 6: correrlo y verlo fallar**

`npm test --prefix games/tft/ui -- lp` → FAIL, `attribute is not a function`.

- [ ] **Paso 7: escribir serie y atribución**

```ts
/** Un rango leído en un momento. `games` es wins+losses: el contador de Riot. */
export interface LpSnapshot {
  tier: string;
  division: string;
  leaguePoints: number;
  /** wins + losses de la cola rankeada. Verificado exacto contra la API. */
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

/** Los puntos de un set, ordenados. Un rango que no se puede ubicar no es un punto. */
export function series(snapshots: LpSnapshot[], set: number | null): LpPoint[] {
  return snapshots
    .filter((s) => set === null || s.setNumber === set)
    .map((s) => {
      const absolute = absoluteLp(s.tier, s.division, s.leaguePoints);
      return absolute === null
        ? null
        : { takenAt: s.takenAt, absolute, tier: s.tier, division: s.division, leaguePoints: s.leaguePoints };
    })
    .filter((p): p is LpPoint => p !== null)
    .sort((a, b) => a.takenAt - b.takenAt);
}

/**
 * Cuánto LP dio cada partida, solo donde eso se puede afirmar.
 *
 * Entre dos snapshots consecutivos, el contador de Riot dice cuántas rankeds
 * pasaron —incluidas las que no tenemos— y nuestras partidas dicen cuáles
 * conocemos. Cuando ambas cuentas valen uno, la resta de LP ES el LP de esa
 * partida. Cuando no coinciden, falta información y la respuesta correcta es
 * no decir nada: repartir un total entre varias partidas sería inventar.
 *
 * No se cruza un cambio de set: el rango se resetea y la resta no significaría
 * nada.
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
```

- [ ] **Paso 8: correr y ver pasar**

`npm test --prefix games/tft/ui -- lp` → PASS (13 tests).

- [ ] **Paso 9: commit**

```bash
git add games/tft/ui/src/lp.ts games/tft/ui/test/lp.test.ts
git commit -m "feat: put LP on one scale so a promotion reads as a gain"
```

---

### Tarea 2 — Que "standard" deje de significar "ranked" en el perfil

**Archivos:**
- Modificar: `games/tft/ui/src/analyzer.ts` (interfaz `MatchView`, su
  construcción, y el filtro de `buildProfile`)
- Modificar: `games/tft/ui/test/profile.test.ts`

**Consume:** `RANKED_QUEUE` de la Tarea 1.
**Produce:** `MatchView.queueId: number`.

- [ ] **Paso 1: el test que falla hoy**

Agregar a `test/profile.test.ts`:

```ts
it("no cuenta las normales en las estadísticas del perfil", () => {
  // Mismo jugador, dos partidas: una ranked de 1.º y una normal de 8.º.
  // El promedio del perfil tiene que ser 1, no 4,5.
  const views = [
    view({ matchId: "R", placement: 1, queueId: 1100 }),
    view({ matchId: "N", placement: 8, queueId: 1090 }),
  ];
  const p = buildProfile(views, "en", "global", null);
  expect(p.matches).toBe(1);
  expect(p.avgPlacement).toBe(1);
});
```

(El helper `view()` del archivo tiene que aceptar `queueId`, con 1100 por
defecto para no reescribir los tests que ya están.)

- [ ] **Paso 2: correrlo y verlo fallar**

`npm test --prefix games/tft/ui -- profile`
Esperado: FAIL, `expected 4.5 to be 1`.

- [ ] **Paso 3: exponer la cola y filtrar por ella**

En `MatchView`, debajo de `standard`:

```ts
  /**
   * La cola de Riot. `standard` NO alcanza para decir "ranked": medido sobre el
   * store, tft_game_type "standard" también cubre las normales (1090), Choncc's
   * Treasure (1210) y los modos de evento — 8,5% de las partidas usables.
   */
  queueId: number;
```

En la construcción del `MatchView`, junto a `standard`:

```ts
    queueId: lobby.queueId,
```

En `buildProfile`, cambiar el filtro:

```ts
  const standard = views.filter(
    (v) => v.standard && v.queueId === RANKED_QUEUE && v.placement >= 1 && v.placement <= 8
  );
```

con `import { RANKED_QUEUE } from "./lp";` arriba.

- [ ] **Paso 4: correr toda la suite de la UI**

`npm test --prefix games/tft/ui` → PASS. Si algún test viejo se cae, es porque
su fixture no declara cola: darle 1100 en el helper, no aflojar el filtro.

- [ ] **Paso 5: commit**

```bash
git add games/tft/ui/src/analyzer.ts games/tft/ui/test/profile.test.ts
git commit -m "fix: measure the profile on ranked games, not on standard ones"
```

---

### Tarea 3 — El mismo arreglo en el pipeline, y reconstruir las cuatro bandas

**Archivos:**
- Modificar: `games/tft/pipeline/src/store.ts` (`LobbyRecord`, `loadLobbies`,
  `isComparable`)
- Modificar: `games/tft/pipeline/test/store.test.ts`
- Regenerar: `games/tft/data/comps*.json`, `units*.json`, `items*.json`

- [ ] **Paso 1: los tests**

En `test/store.test.ts`, dentro del `describe("isComparable")`, y agregando
`queueId: 1100` al helper `lobby()`:

```ts
it("rechaza las normales", () => {
  expect(isComparable(lobby({ queueId: 1090 }), 17)).toBe(false);
});

it("rechaza los modos de evento que se declaran standard", () => {
  // 1210 es Choncc's Treasure, con tft_game_type "standard" y ocho tableros.
  expect(isComparable(lobby({ queueId: 1210 }), 17)).toBe(false);
  expect(isComparable(lobby({ queueId: 6120 }), 17)).toBe(false);
});
```

- [ ] **Paso 2: correrlos y verlos fallar**

`npm test --prefix games/tft/pipeline -- store` → FAIL (`true` en los tres).

- [ ] **Paso 3: llevar la cola hasta el filtro**

En `LobbyRecord`:

```ts
  /** La cola de Riot. 1100 es la rankeada estándar; ver isComparable. */
  queueId: number;
```

En `loadLobbies`, ampliar el tipo del `info` con `queue_id?: number` y agregar:

```ts
      queueId: info?.queue_id ?? 0,
```

Y `isComparable` pasa a ser:

```ts
/** La cola rankeada estándar, la única cuyo meta publicamos. */
export const RANKED_QUEUE = 1100;

/**
 * Solo las rankeds estándar del set vigente alimentan el meta.
 *
 * El criterio era `gameType === "standard"`, y ese campo no quiere decir
 * "ranked": medido sobre 21.751 partidas del store, "standard" también cubre
 * las normales (1090), Choncc's Treasure (1210, así lo nombra el queues.json de
 * Riot) y los modos de evento como 6120. En el parche publicado eso era el 2,6%
 * de los tableros, y en el anterior el 12,4%.
 */
export function isComparable(lobby: LobbyRecord, set: number): boolean {
  return lobby.queueId === RANKED_QUEUE && lobby.set === set && lobby.boards.length >= 2;
}
```

- [ ] **Paso 4: correr y ver pasar**

`npm test --prefix games/tft/pipeline` → PASS.

- [ ] **Paso 5: commit del código, antes de los datos**

```bash
git add games/tft/pipeline/src/store.ts games/tft/pipeline/test/store.test.ts
git commit -m "fix: feed the meta on ranked queues, not on everything called standard"
```

- [ ] **Paso 6: reconstruir las cuatro bandas**

```bash
npm --prefix games/tft/pipeline run build:comps
npm --prefix games/tft/pipeline run build:comps -- apex
npm --prefix games/tft/pipeline run build:comps -- diamond-emerald
npm --prefix games/tft/pipeline run build:comps -- platinum-gold
npm --prefix games/tft/pipeline run build:comps -- silver-below
```

Anotar el `sampleSize` de cada banda antes y después. Bajar es lo esperado; que
suba sería un error.

- [ ] **Paso 7: correr los tests de la UI, que comparan contra estos archivos**

`npm test --prefix games/tft/ui -- bands` → PASS.

- [ ] **Paso 8: commit de los datos, con los números en el mensaje**

```bash
git add games/tft/data
git commit -m "chore: rebuild the four bands without the non-ranked queues"
```

---

### Tarea 4 — La tabla de snapshots

**Archivos:**
- Crear: `games/tft/supabase/migrations/0003_rank_snapshots.sql`

- [ ] **Paso 1: escribir la migración**

```sql
-- Snapshots del rango, para poder dibujar el LP en el tiempo.
--
-- Riot no reporta el LP de una partida ni el delta: el MatchDto no lo trae y
-- by-puuid contesta el rango de ahora. La historia no se puede reconstruir
-- hacia atrás, así que se empieza a grabar. Cada búsqueda ya pide el rango,
-- de modo que esto no cuesta ni una llamada más a Riot.
--
-- `games` es wins+losses de la cola rankeada. Verificado contra la API el
-- 2026-07-25 sobre 6 cuentas y 40 partidas: avanza exactamente uno por ranked.
-- Es lo que permite afirmar el LP de UNA partida en vez de estimarlo.

create table if not exists public.rank_snapshots (
  puuid         text        not null,
  region        text        not null,
  set_number    integer,
  tier          text        not null,
  division      text        not null default '',
  league_points integer     not null,
  games         integer     not null,
  taken_at      timestamptz not null default now(),
  primary key (puuid, taken_at)
);

create index if not exists rank_snapshots_puuid_idx
  on public.rank_snapshots (puuid, taken_at desc);

-- Misma postura que las otras cuatro tablas: RLS activo y CERO políticas. Con
-- la clave publicable no devuelve ni una fila; solo el service role, que vive
-- únicamente dentro de la Edge Function, la toca.
alter table public.rank_snapshots enable row level security;
```

- [ ] **Paso 2: aplicarla**

Con el MCP de Supabase (`apply_migration`) o `npx supabase db push`.

- [ ] **Paso 3: verificar que la clave publicable no lee nada**

Consultar la tabla con la clave anon y confirmar que devuelve cero filas, igual
que se auditó para las otras tablas.

- [ ] **Paso 4: commit**

```bash
git add games/tft/supabase/migrations/0003_rank_snapshots.sql
git commit -m "feat: add the table that remembers where a player stood"
```

---

### Tarea 5 — La Edge Function guarda y devuelve la serie

**Archivos:**
- Modificar: `games/tft/supabase/functions/tft-api/index.ts`
- Modificar: `games/tft/ui/dev-api.ts` (el mismo comportamiento)
- Modificar: `games/tft/ui/src/api.ts` (tipos)

**Consume:** la tabla de la Tarea 4.
**Produce:** `SearchResult.lpHistory?: LpSnapshot[]`, y `PlayerRank` con `games`.

- [ ] **Paso 1: dejar de tirar wins y losses**

`playerRank` ya recibe `wins` y `losses` en `RiotLeagueEntry`. Devolverlos:

```ts
export interface PlayerRank {
  tier: string;
  division: string;
  leaguePoints: number;
  /** wins + losses: cuántas rankeds lleva jugadas. El validador de la atribución. */
  games: number;
}
```

y en el `return` de `playerRank`:

```ts
    return {
      tier: ranked.tier,
      division: ranked.rank ?? "",
      leaguePoints: ranked.leaguePoints ?? 0,
      games: (ranked.wins ?? 0) + (ranked.losses ?? 0),
    };
```

- [ ] **Paso 2: el set, de la consulta que ya corre**

En `handleSearch`, donde se calcula `cached`, pedir también el set y quedarse
con el más alto:

```ts
  let cached: string[] = [];
  let setNumber: number | null = null;
  const safeIds = matchIds.filter((id) => /^[A-Za-z0-9_]+$/.test(id));
  if (safeIds.length > 0) {
    const res = await db(`matches?select=match_id,set_number&match_id=in.(${safeIds.join(",")})`);
    if (res.ok) {
      const rows = (await res.json()) as { match_id: string; set_number: number | null }[];
      cached = rows.map((r) => r.match_id);
      for (const r of rows) if (r.set_number !== null) setNumber = Math.max(setNumber ?? 0, r.set_number);
    }
  }
```

- [ ] **Paso 3: escribir el snapshot, sin duplicar y sin poder romper nada**

```ts
/**
 * Deja anotado dónde estaba el jugador, si cambió algo desde la última vez.
 *
 * Se traga cualquier error a propósito: es un dato accesorio y una búsqueda no
 * se pierde por él, exactamente como playerRank y playerAccount.
 *
 * El dedup mira LP y partidas jugadas, no el reloj: buscarse cinco veces en un
 * minuto no tiene que dejar cinco puntos idénticos en el gráfico.
 */
async function saveSnapshot(
  puuid: string, region: string, rank: PlayerRank, setNumber: number | null
): Promise<void> {
  try {
    const last = await db(
      `rank_snapshots?select=tier,division,league_points,games` +
        `&puuid=eq.${encodeURIComponent(puuid)}&order=taken_at.desc&limit=1`
    );
    if (last.ok) {
      const rows = (await last.json()) as
        { tier: string; division: string; league_points: number; games: number }[];
      const prev = rows[0];
      if (prev && prev.tier === rank.tier && prev.division === rank.division &&
          prev.league_points === rank.leaguePoints && prev.games === rank.games) return;
    }
    await db("rank_snapshots", {
      method: "POST",
      body: JSON.stringify({
        puuid, region, set_number: setNumber,
        tier: rank.tier, division: rank.division,
        league_points: rank.leaguePoints, games: rank.games,
      }),
    });
  } catch (_) {
    // Un snapshot perdido es un punto menos en un gráfico, no una búsqueda rota.
  }
}

/** La serie del jugador, más nueva primero en la base y ordenada en la UI. */
async function lpHistory(puuid: string): Promise<unknown[]> {
  try {
    const res = await db(
      `rank_snapshots?select=tier,division,league_points,games,set_number,taken_at` +
        `&puuid=eq.${encodeURIComponent(puuid)}&order=taken_at.desc&limit=120`
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => ({
      tier: r.tier, division: r.division, leaguePoints: r.league_points,
      games: r.games, setNumber: r.set_number,
      takenAt: Date.parse(String(r.taken_at)),
    }));
  } catch (_) {
    return [];
  }
}
```

Y en `handleSearch`, después de resolver `rank`: si hay rango,
`await saveSnapshot(...)`; después `const lpHistory = await lpHistory(puuid)` y
sumarlo al `json({...})`.

- [ ] **Paso 4: el mismo comportamiento en `dev-api.ts`**

`playerRank` local devuelve también `games`; el handler escribe y lee la misma
tabla con las credenciales que ya usa la ruta del ladder.

- [ ] **Paso 5: los tipos en `api.ts`**

`PlayerRank` gana `games: number`; `SearchResult` gana
`lpHistory?: LpSnapshot[]` importado de `./lp`.

- [ ] **Paso 6: probarlo de verdad**

Levantar el dev server, buscar una cuenta y verificar en Postgres que quedó una
fila; buscarla de nuevo sin jugar y verificar que **no** quedó una segunda.

- [ ] **Paso 7: commit**

```bash
git add games/tft/supabase/functions/tft-api/index.ts games/tft/ui/dev-api.ts games/tft/ui/src/api.ts
git commit -m "feat: remember where a player stood on every search"
```

---

### Tarea 6 — El rango en la cabecera

**Archivos:**
- Modificar: `games/tft/ui/src/i18n.ts`, `games/tft/ui/src/PlayerView.tsx`,
  `games/tft/ui/src/styles/base.css`

- [ ] **Paso 1: la copia, en los dos idiomas**

Dentro de `player`, un mapa de tiers y el formato. En inglés los nombres van
como los escribe el juego; en español, los nombres del cliente en español
(Hierro, Bronce, Plata, Oro, Platino, Esmeralda, Diamante, Maestro,
Gran Maestro, Aspirante), **sin voseo** en el resto de la copia.

```ts
    tiers: {
      IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold",
      PLATINUM: "Platinum", EMERALD: "Emerald", DIAMOND: "Diamond",
      MASTER: "Master", GRANDMASTER: "Grandmaster", CHALLENGER: "Challenger",
    } as Record<string, string>,
    /** "Gold I · 42 LP". Apex no tiene división y no se le inventa una. */
    standing: (tier: string, division: string, lp: number) =>
      `${tier}${division ? ` ${division}` : ""} · ${lp} LP`,
    unranked: "Unranked",
```

- [ ] **Paso 2: dibujarlo**

En `PlayerView.tsx`, junto al `player-level`:

```tsx
          {player.rank && (
            <p className="player-rank">
              {copy.player.standing(
                copy.player.tiers[player.rank.tier.toUpperCase()] ?? player.rank.tier,
                player.rank.division,
                player.rank.leaguePoints
              )}
            </p>
          )}
```

- [ ] **Paso 3: el estilo**, en la misma línea que `player-level`.

- [ ] **Paso 4: verificar en el navegador**, incluido 375 px de ancho.

- [ ] **Paso 5: commit**

```bash
git commit -am "feat: say what rank the player is, which the page never did"
```

---

### Tarea 7 — El bloque "LP en el tiempo"

**Archivos:**
- Modificar: `games/tft/ui/src/ProfilePanel.tsx`, `analyzer.ts` (el perfil
  transporta los puntos), `i18n.ts`, `styles/base.css`

- [ ] **Paso 1:** `PlayerProfile` gana `lp: LpPoint[]`, que `buildProfile`
  calcula con `series(...)` sobre el set de la partida más nueva del historial.

- [ ] **Paso 2:** un componente `LpTimeline` al lado de `PlacementTimeline`,
  con la misma forma que ya usa el archivo (SVG simple, sin librerías).

- [ ] **Paso 3: el estado corto es parte del diseño.** Con menos de dos puntos
  no dibuja: dice que recién se empezó a seguir y que vuelva después de su
  próxima partida. Un gráfico de un punto es una mentira con forma de línea.

- [ ] **Paso 4:** test en `test/profile.test.ts` de que con un solo snapshot
  `lp.length < 2` y el bloque no se dibuja.

- [ ] **Paso 5: commit**

```bash
git commit -am "feat: draw the LP the account has gained this set"
```

---

### Tarea 8 — El chip de LP en la fila de la partida

**Archivos:**
- Modificar: `games/tft/ui/src/PlayerView.tsx` (`MatchRow`), `i18n.ts`,
  `styles/base.css`

- [ ] **Paso 1:** `PlayerView` calcula `attribute(lpHistory, views)` una vez y
  le pasa a cada `MatchRow` su delta o `undefined`.

- [ ] **Paso 2:** el chip solo se dibuja si hay delta. El signo se muestra
  siempre (`+34`, `−18`), con la pareja de colores ya validada del perfil.

- [ ] **Paso 3:** verificar en el navegador con una cuenta que tenga dos
  snapshots separados por una partida.

- [ ] **Paso 4: commit**

```bash
git commit -am "feat: show what a match cost or paid, where that is a fact"
```

---

### Tarea 9 — La política de privacidad, en el mismo trabajo

**Archivos:**
- Modificar: `games/tft/ui/src/Privacy.tsx`

- [ ] **Paso 1:** agregar a la sección de servidor que el sitio guarda rango,
  LP y partidas jugadas de las cuentas buscadas, con fecha, sin límite de
  tiempo.

- [ ] **Paso 2:** correr `npm test --prefix games/tft/ui -- privacyStorage`
  (cubre las claves de localStorage, que no cambian acá, pero tiene que seguir
  en verde).

- [ ] **Paso 3: commit**

```bash
git commit -am "docs: disclose the rank history the server now keeps"
```

---

## Verificación final

- [ ] Las tres suites en verde y el build de la UI también.
- [ ] Buscar una cuenta real y confirmar: rango en la cabecera, fila en
  `rank_snapshots`, y que una segunda búsqueda sin jugar no duplique.
- [ ] Confirmar que el `sampleSize` de las cuatro bandas bajó, nunca subió.
- [ ] 375 px de ancho, que es donde aparecieron los dos últimos bugs de layout.
