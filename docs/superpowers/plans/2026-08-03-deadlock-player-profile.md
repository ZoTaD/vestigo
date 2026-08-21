# Deadlock Player Profile (search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Player" tab to Deadlock (`/deadlock/player`) where a visitor searches a Steam name and sees that account's recent Deadlock match history, with a shareable per-profile URL.

**Architecture:** A new React page (`DeadlockPlayer.tsx`) talks directly from the browser to the public `api.deadlock-api.com` (CORS confirmed open, no key required) — no new backend, no Worker, no pipeline. Hero/rank names and images come from the `catalog.json` already bundled for the rest of Deadlock. The URL router (`route.ts`) is extended so a Deadlock "player" tab can carry an `account_id` as a path segment, the way TFT's meta/units/items already carry a detail slug.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `docs/design/2026-08-03-perfil-de-jugador-deadlock-design.md` — read it before starting; this plan implements it exactly, with the routing detail (path segment, not a query string) corrected to match the codebase's existing conventions (see Task 1).

## Global Constraints

- All new user-facing prose goes in `games/tft/ui/src/i18n.ts`, in both `EN` and `ES` — nowhere else. `ES` is typed as `typeof EN`, so a missing key is a compile error, not a runtime gap.
- Spanish is neutral Latin American, no voseo ("Busca", not "Buscá"; "Intenta", not "Intentá").
- Game vocabulary (hero names, rank names) is never hand-translated — it comes from `catalog.json`, resolved at render time via `text()` from `./catalog`, never at import time.
- Follow the existing test convention exactly: pure data-layer logic (route parsing, API response parsing, formatting helpers) gets Vitest unit tests. React components and anything touching `localStorage`/`fetch` end-to-end do **not** get component tests in this codebase (`PlayerView.tsx`, `Deadlock.tsx`, `DeadlockRanks.tsx`, `lastSearch.ts` have none either) — those are verified manually in the browser, which is Task 9.
- Commit after every task with a message in the project's existing style (`feat(deadlock): ...`).
- Do **not** push to `main` or trigger a Netlify deploy as part of this plan. The user asked to verify on localhost first — pushing to production is a separate, explicit decision after that.

---

### Task 1: Route support for the Deadlock player tab and its deep link

**Files:**
- Modify: `games/tft/ui/src/route.ts`
- Test: `games/tft/ui/test/route.test.ts`

**Interfaces:**
- Produces: `DeadlockSection` now includes `"player"`; `DEADLOCK_SECTIONS` includes `"player"`; `Route.detail` is now also populated (and round-tripped by `routePath`) when `view === "deadlock" && dlSection === "player"`.

- [ ] **Step 1: Write the failing tests**

Add `DEADLOCK_SECTIONS` to the existing import at the top of `games/tft/ui/test/route.test.ts`:

```ts
import { DEADLOCK_SECTIONS, parseRoute, routePath, routeUrl, slugify, type Route } from "../src/route";
```

Append this new `describe` block at the end of the file:

```ts
describe("la pestaña de jugador de Deadlock", () => {
  it("está en la lista de secciones", () => {
    expect(DEADLOCK_SECTIONS).toContain("player");
  });

  it("sin cuenta, la URL es la pestaña sola", () => {
    const r = parseRoute("/en/deadlock/player");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "player" });
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/en/deadlock/player");
  });

  it("con una cuenta, la URL la lleva de vuelta", () => {
    const r = parseRoute("/en/deadlock/player/107253473");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "player", detail: "107253473" });
    expect(routePath(r)).toBe("/en/deadlock/player/107253473");
  });

  it("existe también en español", () => {
    expect(routePath(parseRoute("/es/deadlock/player/107253473"))).toBe(
      "/es/deadlock/player/107253473"
    );
  });

  it("otras pestañas de Deadlock no arrastran un detail que no usan", () => {
    const r = parseRoute("/en/deadlock/items");
    expect(routePath(r)).toBe("/en/deadlock/items");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/route.test.ts`
Expected: FAIL — `DEADLOCK_SECTIONS` does not contain `"player"`, and `parseRoute("/en/deadlock/player/107253473")` does not produce a `detail`.

- [ ] **Step 3: Implement the route changes**

In `games/tft/ui/src/route.ts`, change the `DeadlockSection` type and `DEADLOCK_SECTIONS` array:

```ts
export type DeadlockSection = "meta" | "items" | "ranks" | "patches" | "player";
```

```ts
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "items", "ranks", "patches", "player"];
```

In `parseRoute`, replace:

```ts
  if (head === "deadlock") {
    const dlSection = rest[1] && isDlSection(rest[1]) ? rest[1] : DEFAULT_DL_SECTION;
    return { ...base, view: "deadlock", dlSection };
  }
```

with:

```ts
  if (head === "deadlock") {
    const dlSection = rest[1] && isDlSection(rest[1]) ? rest[1] : DEFAULT_DL_SECTION;
    // Sólo la pestaña de jugador tiene algo que poner en un tercer segmento: un
    // account_id de Steam. Las demás no tienen detail, así que un tercer
    // segmento ahí simplemente se ignora.
    const detail = dlSection === "player" && rest[2] ? rest[2] : undefined;
    return { ...base, view: "deadlock", dlSection, detail };
  }
```

In `routePath`, replace:

```ts
  if (view === "deadlock") {
    return dlSection === DEFAULT_DL_SECTION ? `/${lang}/deadlock` : `/${lang}/deadlock/${dlSection}`;
  }
```

with:

```ts
  if (view === "deadlock") {
    const dlPath =
      dlSection === DEFAULT_DL_SECTION ? `/${lang}/deadlock` : `/${lang}/deadlock/${dlSection}`;
    return dlSection === "player" && detail ? `${dlPath}/${detail}` : dlPath;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/route.test.ts`
Expected: PASS, all tests including the new `describe` block.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd games/tft/ui && npx vitest run`
Expected: PASS. (`sitemap.test.ts` only asserts thresholds like `toBeGreaterThan(200)`, not exact counts, so the one new sitemap entry does not break it.)

- [ ] **Step 6: Commit**

```bash
git add games/tft/ui/src/route.ts games/tft/ui/test/route.test.ts
git commit -m "feat(deadlock): route support for the player tab and its account_id deep link"
```

---

### Task 2: i18n copy for the player tab (EN + ES)

**Files:**
- Modify: `games/tft/ui/src/i18n.ts`

**Interfaces:**
- Produces: `copy.deadlock.tabs.player`, `copy.deadlock.player.*` (all copy the component in Task 6 reads), `copy.seo.deadlock.player`.

No test file — this file is compile-checked (`ES` is typed as `typeof EN`), which is the project's existing safety net for i18n.

- [ ] **Step 1: Add the tab label**

In the `EN` object, find (around line 598):

```ts
    tabs: { meta: "Meta", items: "Items", ranks: "Ranks", patches: "Patches" },
```

Replace with:

```ts
    tabs: { meta: "Meta", items: "Items", ranks: "Ranks", patches: "Patches", player: "Player" },
```

In the `ES` object, find the mirrored line (around line 1673):

```ts
    tabs: { meta: "Meta", items: "Objetos", ranks: "Rangos", patches: "Parches" },
```

Replace with:

```ts
    tabs: { meta: "Meta", items: "Objetos", ranks: "Rangos", patches: "Parches", player: "Jugador" },
```

- [ ] **Step 2: Add the `EN.deadlock.player` block**

Immediately after the `tabs: {...}` line you just edited in `EN` (still inside the `deadlock: {` object), insert:

```ts
    player: {
      title: "Player",
      titleBreak: " profile",
      lead:
        "Search a Steam profile to see their recent Deadlock match history — hero, result, " +
        "K/D/A and rank, pulled live from deadlock-api.com.",
      searchLabel: "Steam name",
      searchPlaceholder: "Search a Steam profile…",
      search: "Search",
      searching: "Searching…",
      resume: "Back to your last profile",
      candidatesTitle: "Pick a profile",
      matchesLast30d: (n: number) => `${n} ${n === 1 ? "match" : "matches"} in the last 30 days`,
      noCandidates: "We couldn't find anyone with that name.",
      noMatches: "This account has no matches on record yet.",
      playerNotFound: "We couldn't find that Steam profile.",
      recentMatches: (n: number) => `Last ${n} matches`,
      columns: {
        hero: "Hero",
        result: "Result",
        kda: "K / D / A",
        deniesLastHits: "Denies / Last hits",
        netWorth: "Net worth",
        duration: "Duration",
        mode: "Mode",
        rank: "Rank",
        date: "Date",
      },
      outcome: { win: "Win", loss: "Loss", unscored: "Not scored" },
      mode: { normal: "Normal", streetBrawl: "Street Brawl" },
      errors: {
        NETWORK: {
          title: "Can't reach deadlock-api.com",
          hint: "Check your connection and try again.",
        },
        RATE_LIMITED: {
          title: "Too many searches right now",
          hint: "deadlock-api.com is rate-limiting requests — wait a moment and try again.",
        },
        UPSTREAM_ERROR: {
          title: "deadlock-api.com isn't responding",
          hint: "This isn't something on our side. Try again in a moment.",
        },
      },
    },
```

- [ ] **Step 3: Add the mirrored `ES.deadlock.player` block**

Immediately after the `tabs: {...}` line you edited in `ES`, insert:

```ts
    player: {
      title: "Perfil",
      titleBreak: " de jugador",
      lead:
        "Busca un perfil de Steam para ver su historial reciente de partidas de Deadlock: " +
        "héroe, resultado, K/D/A y rango, en vivo desde deadlock-api.com.",
      searchLabel: "Nombre de Steam",
      searchPlaceholder: "Busca un perfil de Steam…",
      search: "Buscar",
      searching: "Buscando…",
      resume: "Volver a tu último perfil",
      candidatesTitle: "Elige un perfil",
      matchesLast30d: (n: number) => `${n} ${n === 1 ? "partida" : "partidas"} en los últimos 30 días`,
      noCandidates: "No encontramos a nadie con ese nombre.",
      noMatches: "Esta cuenta todavía no tiene partidas registradas.",
      playerNotFound: "No encontramos ese perfil de Steam.",
      recentMatches: (n: number) => `Últimas ${n} partidas`,
      columns: {
        hero: "Héroe",
        result: "Resultado",
        kda: "K / D / A",
        deniesLastHits: "Denies / Last hits",
        netWorth: "Patrimonio",
        duration: "Duración",
        mode: "Modo",
        rank: "Rango",
        date: "Fecha",
      },
      outcome: { win: "Victoria", loss: "Derrota", unscored: "No puntuada" },
      mode: { normal: "Normal", streetBrawl: "Street Brawl" },
      errors: {
        NETWORK: {
          title: "No se pudo alcanzar deadlock-api.com",
          hint: "Revisa tu conexión e intenta de nuevo.",
        },
        RATE_LIMITED: {
          title: "Demasiadas búsquedas por ahora",
          hint: "deadlock-api.com está limitando los pedidos — espera un momento e intenta de nuevo.",
        },
        UPSTREAM_ERROR: {
          title: "deadlock-api.com no responde",
          hint: "No es algo de nuestro lado. Intenta de nuevo en un momento.",
        },
      },
    },
```

- [ ] **Step 4: Add SEO copy for the page**

In `EN`, find the `seo.deadlock` object's `patches` entry (around line 1116-1121):

```ts
      patches: {
        title: () => "Deadlock Patch Winners and Losers | Vestigo",
        description: () =>
          "Every Deadlock hero the latest patch moved, measured against the same stretch of " +
          "the game right before it landed.",
      },
    },
```

Replace with (adding `player` as a new sibling before the closing `},`):

```ts
      patches: {
        title: () => "Deadlock Patch Winners and Losers | Vestigo",
        description: () =>
          "Every Deadlock hero the latest patch moved, measured against the same stretch of " +
          "the game right before it landed.",
      },
      player: {
        title: () => "Deadlock Player Profile and Match History | Vestigo",
        description: () =>
          "Search any Deadlock Steam profile to see their match history — hero, result, " +
          "K/D/A, net worth and rank, pulled live from deadlock-api.com.",
      },
    },
```

In `ES`, find the mirrored `patches` entry (around line 2005-2010) and add the `player` sibling the same way:

```ts
      patches: {
        title: () => "Ganadores y perdedores del parche de Deadlock | Vestigo",
        description: () =>
          "Todos los héroes de Deadlock que movió el último parche, medidos contra el mismo " +
          "tramo de juego justo anterior.",
      },
      player: {
        title: () => "Perfil de jugador e historial de partidas de Deadlock | Vestigo",
        description: () =>
          "Busca cualquier perfil de Steam de Deadlock para ver su historial: héroe, " +
          "resultado, K/D/A, patrimonio y rango, en vivo desde deadlock-api.com.",
      },
    },
```

- [ ] **Step 5: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors. If `ES` is missing a key or a function signature differs from `EN`, this fails with a precise line — fix until clean.

- [ ] **Step 6: Commit**

```bash
git add games/tft/ui/src/i18n.ts
git commit -m "feat(deadlock): add EN/ES copy for the player profile tab"
```

---

### Task 3: `deadlockApi.ts` — the client for `api.deadlock-api.com`

**Files:**
- Create: `games/tft/ui/src/deadlockApi.ts`
- Test: `games/tft/ui/test/deadlockApi.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SteamCandidate`, `MatchEntry`, `MatchOutcome`, `MatchMode`, `DeadlockApiError`, `DeadlockApiErrorCode`, `RECENT_MATCHES`, and the functions `steamSearch(query): Promise<SteamCandidate[]>`, `steamInfo(accountId): Promise<SteamCandidate | null>`, `matchHistory(accountId): Promise<MatchEntry[]>` — all consumed by Task 4's tests indirectly and by `DeadlockPlayer.tsx` in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `games/tft/ui/test/deadlockApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeadlockApiError,
  RECENT_MATCHES,
  matchHistory,
  toCandidate,
  toMatch,
  type RawMatchEntry,
  type RawSteamProfile,
} from "../src/deadlockApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toCandidate", () => {
  it("pasa el perfil crudo de steam-search a la forma de la UI", () => {
    const raw: RawSteamProfile = {
      account_id: 107253473,
      personaname: "ZoTaD",
      avatar: "https://avatars.steamstatic.com/x.jpg",
      countrycode: "AR",
      matches_played_last_30d: 9,
      last_team_avg_badge: null,
    };
    expect(toCandidate(raw)).toEqual({
      accountId: 107253473,
      personaName: "ZoTaD",
      avatar: "https://avatars.steamstatic.com/x.jpg",
      countryCode: "AR",
      matchesLast30d: 9,
      lastTeamAvgBadge: null,
    });
  });
});

const rawMatch = (overrides: Partial<RawMatchEntry> = {}): RawMatchEntry => ({
  match_id: 1,
  hero_id: 14,
  start_time: 1785724909,
  player_match_outcome: 1,
  player_kills: 15,
  player_deaths: 4,
  player_assists: 21,
  denies: 3,
  net_worth: 47838,
  last_hits: 217,
  match_duration_s: 2254,
  game_mode: 1,
  ranked_display_badge: null,
  ...overrides,
});

describe("toMatch", () => {
  it("lee el resultado de player_match_outcome (1=victoria, 2=derrota)", () => {
    expect(toMatch(rawMatch({ player_match_outcome: 1 })).outcome).toBe("win");
    expect(toMatch(rawMatch({ player_match_outcome: 2 })).outcome).toBe("loss");
  });

  it("no fuerza a victoria/derrota los otros códigos documentados por la API", () => {
    // 0 = invalid, 3 = penalized, 4 = penalized party, 5 = not scored.
    for (const code of [0, 3, 4, 5]) {
      expect(toMatch(rawMatch({ player_match_outcome: code })).outcome).toBe("unscored");
    }
  });

  it("distingue Street Brawl de Normal por game_mode", () => {
    // Medido el 2026-08-03 sobre 449 partidas reales: game_mode=1 promedia
    // 33,6 min, game_mode=4 promedia 13,9 min — coincide con Street Brawl.
    expect(toMatch(rawMatch({ game_mode: 1 })).mode).toBe("normal");
    expect(toMatch(rawMatch({ game_mode: 4 })).mode).toBe("streetBrawl");
  });

  it("conserva el badge de ranked tal cual, incluido null", () => {
    expect(toMatch(rawMatch({ ranked_display_badge: 63 })).rankedBadge).toBe(63);
    expect(toMatch(rawMatch({ ranked_display_badge: null })).rankedBadge).toBeNull();
  });
});

describe("matchHistory", () => {
  it("corta a las RECENT_MATCHES más recientes, sin asumir el orden de la API", () => {
    const raw = Array.from({ length: RECENT_MATCHES + 10 }, (_, i) =>
      rawMatch({ match_id: i, start_time: i })
    );
    // Desordenado a propósito: el orden lo tiene que poner el cliente.
    const shuffled = [...raw].reverse();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => shuffled })
    );

    return matchHistory(1).then((matches) => {
      expect(matches).toHaveLength(RECENT_MATCHES);
      expect(matches[0].startTime).toBe(raw[raw.length - 1].start_time);
      expect(matches[matches.length - 1].startTime).toBe(
        raw[raw.length - RECENT_MATCHES].start_time
      );
    });
  });

  it("tira DeadlockApiError con NETWORK si fetch falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(matchHistory(1)).rejects.toBeInstanceOf(DeadlockApiError);
  });

  it("tira DeadlockApiError con RATE_LIMITED en un 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => [] }));
    await expect(matchHistory(1)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/deadlockApi.test.ts`
Expected: FAIL with "Cannot find module '../src/deadlockApi'".

- [ ] **Step 3: Implement `deadlockApi.ts`**

Create `games/tft/ui/src/deadlockApi.ts`:

```ts
/**
 * El único lugar donde la página de perfil de Deadlock habla con el mundo.
 *
 * A diferencia de `api.ts` (TFT), acá no hay Worker propio: `api.deadlock-api.com`
 * no exige key y su CORS está abierto (`access-control-allow-origin: *`,
 * verificado en vivo el 2026-08-03), así que el navegador le pega directo. Ver
 * `docs/design/2026-08-03-perfil-de-jugador-deadlock-design.md`.
 */

const BASE = "https://api.deadlock-api.com/v1";

export type DeadlockApiErrorCode = "RATE_LIMITED" | "UPSTREAM_ERROR" | "NETWORK";

export class DeadlockApiError extends Error {
  constructor(readonly code: DeadlockApiErrorCode, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch {
    throw new DeadlockApiError("NETWORK", "No se pudo alcanzar deadlock-api.com.");
  }
  if (res.status === 429) {
    throw new DeadlockApiError("RATE_LIMITED", "deadlock-api.com está limitando pedidos ahora mismo.");
  }
  if (!res.ok) {
    throw new DeadlockApiError("UPSTREAM_ERROR", `deadlock-api.com respondió ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** La forma cruda de un perfil, tal como la devuelven `steam-search` y `steam`. */
export interface RawSteamProfile {
  account_id: number;
  personaname: string;
  avatar: string;
  countrycode: string | null;
  matches_played_last_30d: number;
  last_team_avg_badge: number | null;
}

export interface SteamCandidate {
  accountId: number;
  personaName: string;
  avatar: string;
  countryCode: string | null;
  matchesLast30d: number;
  lastTeamAvgBadge: number | null;
}

/** Puro, sin red: separado para poder probarlo con datos fijos. */
export function toCandidate(raw: RawSteamProfile): SteamCandidate {
  return {
    accountId: raw.account_id,
    personaName: raw.personaname,
    avatar: raw.avatar,
    countryCode: raw.countrycode,
    matchesLast30d: raw.matches_played_last_30d,
    lastTeamAvgBadge: raw.last_team_avg_badge,
  };
}

/** Puede devolver varios jugadores con el mismo nombre; el que llama desambigua. */
export async function steamSearch(query: string): Promise<SteamCandidate[]> {
  const raw = await get<RawSteamProfile[]>(
    `/players/steam-search?search_query=${encodeURIComponent(query)}`
  );
  return raw.map(toCandidate);
}

/** null cuando la cuenta no existe — pasa con un deep link viejo o mal tipeado. */
export async function steamInfo(accountId: number): Promise<SteamCandidate | null> {
  const raw = await get<RawSteamProfile[]>(`/players/steam?account_ids=${accountId}`);
  return raw[0] ? toCandidate(raw[0]) : null;
}

export type MatchOutcome = "win" | "loss" | "unscored";
export type MatchMode = "normal" | "streetBrawl";

export interface RawMatchEntry {
  match_id: number;
  hero_id: number;
  start_time: number;
  player_match_outcome: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  denies: number;
  net_worth: number;
  last_hits: number;
  match_duration_s: number;
  game_mode: number;
  ranked_display_badge: number | null;
}

export interface MatchEntry {
  matchId: number;
  heroId: number;
  /** Unix seconds, como lo manda la API. */
  startTime: number;
  outcome: MatchOutcome;
  kills: number;
  deaths: number;
  assists: number;
  denies: number;
  netWorth: number;
  lastHits: number;
  durationS: number;
  mode: MatchMode;
  /** null si la partida no fue ranked. */
  rankedBadge: number | null;
}

/**
 * `player_match_outcome`: documentado por la propia API como 0=invalid,
 * 1=win, 2=loss, 3=penalized, 4=penalized party, 5=not scored. Los que no son
 * 1 ni 2 se muestran como "no puntuada" en vez de forzarlos a victoria/derrota.
 */
function toOutcome(code: number): MatchOutcome {
  if (code === 1) return "win";
  if (code === 2) return "loss";
  return "unscored";
}

/**
 * `game_mode`: decodificado empíricamente el 2026-08-03 cruzando duración
 * contra 449 partidas reales — 1 promedia 33,6 min (Normal), 4 promedia 13,9
 * min (Street Brawl), igual que ya medía la memoria de datos de Deadlock para
 * la tier list de héroes.
 */
function toMode(gameMode: number): MatchMode {
  return gameMode === 4 ? "streetBrawl" : "normal";
}

/** Puro, sin red: separado para poder probarlo con datos fijos. */
export function toMatch(raw: RawMatchEntry): MatchEntry {
  return {
    matchId: raw.match_id,
    heroId: raw.hero_id,
    startTime: raw.start_time,
    outcome: toOutcome(raw.player_match_outcome),
    kills: raw.player_kills,
    deaths: raw.player_deaths,
    assists: raw.player_assists,
    denies: raw.denies,
    netWorth: raw.net_worth,
    lastHits: raw.last_hits,
    durationS: raw.match_duration_s,
    mode: toMode(raw.game_mode),
    rankedBadge: raw.ranked_display_badge,
  };
}

/**
 * Cuántas partidas se muestran. `match-history` no pagina —verificado el
 * 2026-08-03 pidiendo `?limit=5` contra una cuenta con 449 partidas y
 * recibiéndolas todas igual— así que el corte lo hace el cliente, no la API.
 */
export const RECENT_MATCHES = 50;

export async function matchHistory(accountId: number): Promise<MatchEntry[]> {
  const raw = await get<RawMatchEntry[]>(`/players/${accountId}/match-history`);
  return raw
    .slice()
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, RECENT_MATCHES)
    .map(toMatch);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/deadlockApi.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/deadlockApi.ts games/tft/ui/test/deadlockApi.test.ts
git commit -m "feat(deadlock): add the deadlock-api.com client for the player profile"
```

---

### Task 4: `deadlockPlayerData.ts` — hero/rank lookups and formatting

**Files:**
- Create: `games/tft/ui/src/deadlockPlayerData.ts`
- Test: `games/tft/ui/test/deadlockPlayerData.test.ts`

**Interfaces:**
- Consumes: `catalog` from `./deadlockData` (existing), `text` from `./catalog` (existing), `Lang` from `./i18n` (existing).
- Produces: `heroName(heroId, lang)`, `heroImage(heroId)`, `decodeBadge(badge, lang)`, `RankBadge`, `formatDuration(seconds)`, `relativeDate(startTimeS, locale, now)` — all consumed by `DeadlockPlayer.tsx` in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `games/tft/ui/test/deadlockPlayerData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeBadge, formatDuration, heroImage, heroName, relativeDate } from "../src/deadlockPlayerData";

describe("heroName / heroImage", () => {
  it("resuelve un héroe conocido del catálogo", () => {
    // heroId 1 es Infernus en games/deadlock/data/catalog.json.
    expect(heroName(1, "en")).not.toMatch(/^#/);
    expect(heroImage(1)).toMatch(/^https:\/\//);
  });

  it("cae a #id cuando el héroe no está en el catálogo", () => {
    expect(heroName(999999, "en")).toBe("#999999");
    expect(heroImage(999999)).toBeNull();
  });
});

describe("decodeBadge", () => {
  it("separa tier y subrango, con el subrango arrancando en 1", () => {
    // 63 = tier 6, subrango 3 (mismo esquema que la escalera de rangos).
    const badge = decodeBadge(63, "en");
    expect(badge?.tier).toBe(6);
    expect(badge?.sub).toBe(3);
  });

  it("null en vez de romper cuando el tier no está en el catálogo", () => {
    expect(decodeBadge(9999, "en")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("da mm:ss debajo de la hora", () => {
    expect(formatDuration(2254)).toBe("37:34");
  });

  it("agrega la hora cuando la partida la pasa", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("relativeDate", () => {
  const now = new Date("2026-08-03T12:00:00Z").getTime();

  it("cuenta en días cuando pasó más de una hora", () => {
    const twoDaysAgo = now / 1000 - 2 * 86400;
    expect(relativeDate(twoDaysAgo, "en-US", now)).toBe("2 days ago");
  });

  it("cuenta en minutos cuando pasó menos de una hora", () => {
    const fiveMinAgo = now / 1000 - 5 * 60;
    expect(relativeDate(fiveMinAgo, "en-US", now)).toBe("5 minutes ago");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/deadlockPlayerData.test.ts`
Expected: FAIL with "Cannot find module '../src/deadlockPlayerData'".

- [ ] **Step 3: Implement `deadlockPlayerData.ts`**

Create `games/tft/ui/src/deadlockPlayerData.ts`:

```ts
import { catalog } from "./deadlockData";
import { text } from "./catalog";
import type { Lang } from "./i18n";

/**
 * Helpers puros para pintar una partida del perfil: nombre/imagen de héroe, el
 * badge de rango decodificado, y formato de duración/fecha. Separado del
 * componente para poder probarlo sin React.
 */

export function heroName(heroId: number, lang: Lang): string {
  const hero = catalog.heroes[String(heroId)];
  return hero ? text(hero.name, lang, `#${heroId}`) : `#${heroId}`;
}

export function heroImage(heroId: number): string | null {
  return catalog.heroes[String(heroId)]?.img ?? null;
}

export interface RankBadge {
  tier: number;
  sub: number;
  name: string;
  img: string;
  /** El ícono del subrango tal como lo dibuja el juego. */
  mark: string;
  color: string;
}

/**
 * `ranked_display_badge` = tier*10 + subtier, con el subtier arrancando en 1
 * (mismo esquema que la escalera de rangos). Devuelve null cuando el tier no
 * está en el catálogo — un catálogo desactualizado no tiene por qué romper
 * la fila de la tabla.
 */
export function decodeBadge(badge: number, lang: Lang): RankBadge | null {
  const tier = Math.floor(badge / 10);
  const sub = badge % 10;
  const rank = catalog.ranks.find((r) => r.tier === tier);
  if (!rank) return null;
  return {
    tier,
    sub,
    name: text(rank.name, lang, String(tier)),
    img: rank.img,
    mark: rank.subranks?.[sub - 1] ?? "",
    color: rank.color,
  };
}

/** "37:34", o "1:02:05" si la partida pasa la hora. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * "2 days ago" / "hace 2 días". `now` se recibe en vez de leerse adentro para
 * que la función sea pura y se pueda probar con una fecha fija.
 */
export function relativeDate(startTimeS: number, locale: string, now: number): string {
  const diffS = now / 1000 - startTimeS;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86400;
  if (diffS < HOUR) return rtf.format(-Math.round(diffS / MIN), "minute");
  if (diffS < DAY) return rtf.format(-Math.round(diffS / HOUR), "hour");
  return rtf.format(-Math.round(diffS / DAY), "day");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/deadlockPlayerData.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/deadlockPlayerData.ts games/tft/ui/test/deadlockPlayerData.test.ts
git commit -m "feat(deadlock): add hero/rank lookups and formatting for the player profile"
```

---

### Task 5: `deadlockLastSearch.ts` — remember the last profile viewed

**Files:**
- Create: `games/tft/ui/src/deadlockLastSearch.ts`

**Interfaces:**
- Consumes: `SteamCandidate`, `MatchEntry` from `./deadlockApi` (Task 3).
- Produces: `rememberSession`, `lastSession`, `forgetSession`, `storedAccountId`, `rememberAccountId`, `forgetSearch` — consumed by `DeadlockPlayer.tsx` in Task 6.

No test file — mirrors `lastSearch.ts`, which is untested in this codebase for the same reason (it only guards `localStorage`, which is exercised manually in the browser).

- [ ] **Step 1: Implement `deadlockLastSearch.ts`**

Create `games/tft/ui/src/deadlockLastSearch.ts`:

```ts
import type { MatchEntry, SteamCandidate } from "./deadlockApi";

/**
 * El perfil visto la última vez, con el mismo reparto en dos capas que
 * `lastSearch.ts` (TFT) y por el mismo motivo:
 *
 *   session   El resultado entero, en memoria. Cambiar de pestaña desmonta la
 *             vista; volver la redibuja sin pedirle nada de nuevo a
 *             deadlock-api.com.
 *
 *   stored    Sólo el account_id, en localStorage, para que una carga nueva
 *             de la página pueda ofrecer "volver a tu último perfil". Es la
 *             única parte que sobrevive a cerrar el navegador.
 */
export interface PlayerSession {
  player: SteamCandidate;
  matches: MatchEntry[];
}

/** Module-level a propósito: no es estado de React, se lee una sola vez al montar. */
let session: PlayerSession | null = null;

export const rememberSession = (s: PlayerSession): void => {
  session = s;
};
export const lastSession = (): PlayerSession | null => session;
export const forgetSession = (): void => {
  session = null;
};

const STORAGE_KEY = "vestigo.deadlock.lastPlayer";

/** El account_id visto la última vez, o null. Nunca tira con un valor hostil. */
export function storedAccountId(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    // Un account_id de Steam es un entero positivo; cualquier otra cosa es un
    // valor que no pudimos haber escrito nosotros.
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function rememberAccountId(accountId: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(accountId));
  } catch {
    // Navegación privada o cuota llena: perder el último perfil no amerita
    // romper la búsqueda.
  }
}

/** Usado por el control de "olvidarme" del footer, igual que en TFT. */
export function forgetSearch(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada que hacer */
  }
  forgetSession();
}
```

- [ ] **Step 2: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add games/tft/ui/src/deadlockLastSearch.ts
git commit -m "feat(deadlock): remember the last player profile viewed"
```

---

### Task 6: `DeadlockPlayer.tsx` — the page component

**Files:**
- Create: `games/tft/ui/src/DeadlockPlayer.tsx`

**Interfaces:**
- Consumes: `steamSearch`, `steamInfo`, `matchHistory`, `DeadlockApiError`, `SteamCandidate`, `MatchEntry` (Task 3); `decodeBadge`, `formatDuration`, `heroImage`, `heroName` (Task 4); `rememberSession`, `lastSession`, `forgetSession`, `storedAccountId`, `rememberAccountId` (Task 5); `useCopy`, `useLang`, `useLocale` (existing `i18n.ts`).
- Produces: default export `DeadlockPlayer({ accountId, onOpen })`, consumed by `App.tsx` in Task 7.

No test file — component-level behaviour is verified manually in Task 9, matching every other Deadlock page in this codebase.

- [ ] **Step 1: Implement `DeadlockPlayer.tsx`**

Create `games/tft/ui/src/DeadlockPlayer.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useCopy, useLang, useLocale } from "./i18n";
import {
  DeadlockApiError,
  matchHistory,
  steamInfo,
  steamSearch,
  type MatchEntry,
  type SteamCandidate,
} from "./deadlockApi";
import { decodeBadge, formatDuration, heroImage, heroName, relativeDate } from "./deadlockPlayerData";
import {
  forgetSession,
  lastSession,
  rememberAccountId,
  rememberSession,
  storedAccountId,
} from "./deadlockLastSearch";

/**
 * El perfil de jugador de Deadlock: busca un nombre de Steam y muestra el
 * historial reciente. Primera pestaña de Deadlock con datos en vivo — habla
 * directo con `api.deadlock-api.com` desde el navegador, sin backend propio.
 * Ver `docs/design/2026-08-03-perfil-de-jugador-deadlock-design.md`.
 */

type Status = "idle" | "searching" | "candidates" | "loading" | "ready" | "error";

function CandidateRow({ candidate, onPick }: { candidate: SteamCandidate; onPick: () => void }) {
  const copy = useCopy();
  const { lang } = useLang();
  const badge = candidate.lastTeamAvgBadge != null ? decodeBadge(candidate.lastTeamAvgBadge, lang) : null;

  return (
    <li className="dl-player-candidate">
      <button className="dl-player-candidate-btn" onClick={onPick} type="button">
        <img
          className="dl-player-avatar"
          src={candidate.avatar}
          alt=""
          width={48}
          height={48}
          loading="lazy"
        />
        <span className="dl-player-candidate-id">
          <span className="dl-name">{candidate.personaName}</span>
          <span className="detail-note">
            {candidate.countryCode ? `${candidate.countryCode} · ` : ""}
            {copy.deadlock.player.matchesLast30d(candidate.matchesLast30d)}
          </span>
        </span>
        {badge?.img && (
          <img
            className="dl-player-candidate-badge"
            src={badge.img}
            alt={badge.name}
            width={28}
            height={28}
          />
        )}
      </button>
    </li>
  );
}

function MatchRow({ match }: { match: MatchEntry }) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const badge = match.rankedBadge != null ? decodeBadge(match.rankedBadge, lang) : null;
  const modeLabel =
    match.mode === "streetBrawl" ? copy.deadlock.player.mode.streetBrawl : copy.deadlock.player.mode.normal;
  const img = heroImage(match.heroId);

  return (
    <tr className="dl-player-row" data-outcome={match.outcome}>
      <td className="dl-player-hero">
        {img && <img src={img} alt="" width={36} height={36} loading="lazy" />}
        <span>{heroName(match.heroId, lang)}</span>
      </td>
      <td className="dl-player-outcome">{copy.deadlock.player.outcome[match.outcome]}</td>
      <td>{`${match.kills} / ${match.deaths} / ${match.assists}`}</td>
      <td>{`${match.denies} / ${match.lastHits}`}</td>
      <td>{match.netWorth.toLocaleString(locale)}</td>
      <td>{formatDuration(match.durationS)}</td>
      <td>{modeLabel}</td>
      <td className="dl-player-rank">
        {badge ? (
          <>
            {badge.img && <img src={badge.img} alt="" width={20} height={20} />}
            {badge.name} {badge.mark}
          </>
        ) : (
          "—"
        )}
      </td>
      <td>{relativeDate(match.startTime, locale, Date.now())}</td>
    </tr>
  );
}

export default function DeadlockPlayer({
  accountId,
  onOpen,
}: {
  /** El account_id de la URL (`/deadlock/player/<id>`), si la trae. */
  accountId?: string;
  /** Navega a la URL de un perfil, para que quede compartible. */
  onOpen: (accountId: string) => void;
}) {
  const copy = useCopy();
  const { lang } = useLang();
  const locale = useLocale();

  // Sólo se restaura de memoria cuando la URL no trae una cuenta propia: un
  // deep link siempre pide la suya, la sesión en memoria es para volver de
  // otra pestaña sin gastar una llamada de nuevo.
  const restored = !accountId ? lastSession() : null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>(restored ? "ready" : "idle");
  const [error, setError] = useState<DeadlockApiError | null>(null);
  const [candidates, setCandidates] = useState<SteamCandidate[]>([]);
  const [player, setPlayer] = useState<SteamCandidate | null>(restored?.player ?? null);
  const [matches, setMatches] = useState<MatchEntry[]>(restored?.matches ?? []);
  const runId = useRef(0);

  useEffect(() => {
    if (player) rememberSession({ player, matches });
  }, [player, matches]);

  // Un account_id en la URL manda: si es distinto del que ya está en
  // pantalla, se carga. Cubre tanto llegar por un link compartido como
  // recargar la página en el perfil que ya se estaba mirando.
  useEffect(() => {
    if (!accountId) return;
    const id = Number(accountId);
    if (!Number.isInteger(id) || id <= 0) {
      setStatus("error");
      setError(new DeadlockApiError("UPSTREAM_ERROR", `"${accountId}" no es un account_id válido.`));
      return;
    }
    if (player?.accountId === id) return;

    const thisRun = ++runId.current;
    setStatus("loading");
    setError(null);
    setCandidates([]);

    Promise.all([steamInfo(id), matchHistory(id)])
      .then(([info, hist]) => {
        if (thisRun !== runId.current) return;
        if (!info) {
          setStatus("error");
          setError(new DeadlockApiError("UPSTREAM_ERROR", copy.deadlock.player.playerNotFound));
          return;
        }
        setPlayer(info);
        setMatches(hist);
        rememberAccountId(info.accountId);
        setStatus("ready");
      })
      .catch((e) => {
        if (thisRun !== runId.current) return;
        setError(e instanceof DeadlockApiError ? e : new DeadlockApiError("UPSTREAM_ERROR", String(e)));
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    const thisRun = ++runId.current;
    setStatus("searching");
    setError(null);
    setCandidates([]);
    forgetSession();
    setPlayer(null);
    setMatches([]);

    try {
      const found = await steamSearch(q);
      if (thisRun !== runId.current) return;
      setCandidates(found);
      setStatus("candidates");
    } catch (e) {
      if (thisRun !== runId.current) return;
      setError(e instanceof DeadlockApiError ? e : new DeadlockApiError("UPSTREAM_ERROR", String(e)));
      setStatus("error");
    }
  };

  const remembered = !accountId && status === "idle" ? storedAccountId() : null;
  const errorCopy = error ? copy.deadlock.player.errors[error.code] : null;

  return (
    <main className="deadlock">
      <div className="tool-head">
        <header className="masthead">
          <p className="eyebrow">{copy.deadlock.eyebrow}</p>
          <h1 className="title">
            {copy.deadlock.player.title}
            <span className="title-break">{copy.deadlock.player.titleBreak}</span>
          </h1>
          <p className="standfirst">{copy.deadlock.player.lead}</p>
        </header>
      </div>

      <form
        className="seeker"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="seeker-field">
          <span className="seeker-label">{copy.deadlock.player.searchLabel}</span>
          <input
            className="seeker-input"
            placeholder={copy.deadlock.player.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button className="seeker-go" type="submit" disabled={status === "searching"}>
          {status === "searching" ? copy.deadlock.player.searching : copy.deadlock.player.search}
        </button>
      </form>

      {remembered !== null && (
        <p className="detail-note">
          <button
            className="dl-player-resume"
            type="button"
            onClick={() => onOpen(String(remembered))}
          >
            {copy.deadlock.player.resume}
          </button>
        </p>
      )}

      {errorCopy && (
        <div className="notice" role="alert">
          <h3>{errorCopy.title}</h3>
          <p>{errorCopy.hint}</p>
          {error && <p className="notice-raw">{error.message}</p>}
        </div>
      )}

      {status === "candidates" && candidates.length === 0 && (
        <p className="detail-note">{copy.deadlock.player.noCandidates}</p>
      )}

      {status === "candidates" && candidates.length > 0 && (
        <section>
          <h2 className="dl-patch-side">{copy.deadlock.player.candidatesTitle}</h2>
          <ul className="dl-player-candidates">
            {candidates.map((c) => (
              <CandidateRow key={c.accountId} candidate={c} onPick={() => onOpen(String(c.accountId))} />
            ))}
          </ul>
        </section>
      )}

      {status === "loading" && <p className="detail-note dl-loading">{copy.deadlock.loading}</p>}

      {player && status === "ready" && (
        <section className="dl-player-profile">
          <header className="dl-player-header">
            <img className="dl-player-avatar" src={player.avatar} alt="" width={64} height={64} />
            <h2 className="dl-name">{player.personaName}</h2>
          </header>

          {matches.length === 0 ? (
            <p className="detail-note">{copy.deadlock.player.noMatches}</p>
          ) : (
            <>
              <p className="detail-note">{copy.deadlock.player.recentMatches(matches.length)}</p>
              <div className="dl-player-table-wrap">
                <table className="dl-player-table">
                  <thead>
                    <tr>
                      <th>{copy.deadlock.player.columns.hero}</th>
                      <th>{copy.deadlock.player.columns.result}</th>
                      <th>{copy.deadlock.player.columns.kda}</th>
                      <th>{copy.deadlock.player.columns.deniesLastHits}</th>
                      <th>{copy.deadlock.player.columns.netWorth}</th>
                      <th>{copy.deadlock.player.columns.duration}</th>
                      <th>{copy.deadlock.player.columns.mode}</th>
                      <th>{copy.deadlock.player.columns.rank}</th>
                      <th>{copy.deadlock.player.columns.date}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => (
                      <MatchRow key={m.matchId} match={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
```

Note: `locale` is imported and used inside `MatchRow`/the header via `useLocale()` called in each component that needs it (React hooks — cannot be passed as a plain variable across component boundaries), which is already how the code above is written. The outer `DeadlockPlayer` calls `useLocale()` too but does not currently use the result directly — that is fine and matches the pattern in `DeadlockRanks.tsx`, which also destructures `locale` for use only in nested closures.

- [ ] **Step 2: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors. Fix any mismatched copy keys against Task 2's i18n additions.

- [ ] **Step 3: Commit**

```bash
git add games/tft/ui/src/DeadlockPlayer.tsx
git commit -m "feat(deadlock): add the player profile page component"
```

---

### Task 7: Wire the page into `App.tsx`

**Files:**
- Modify: `games/tft/ui/src/App.tsx`

**Interfaces:**
- Consumes: default export `DeadlockPlayer` (Task 6).

- [ ] **Step 1: Import the component**

In `games/tft/ui/src/App.tsx`, find:

```ts
import Deadlock from "./Deadlock";
import DeadlockItems from "./DeadlockItems";
import DeadlockRanks from "./DeadlockRanks";
```

Replace with:

```ts
import Deadlock from "./Deadlock";
import DeadlockItems from "./DeadlockItems";
import DeadlockRanks from "./DeadlockRanks";
import DeadlockPlayer from "./DeadlockPlayer";
```

- [ ] **Step 2: Render it for the "player" tab**

Find:

```tsx
          {route.dlSection === "items" ? (
            <DeadlockItems band={dlBand} picker={dlPicker} />
          ) : route.dlSection === "ranks" ? (
            /* Sin `picker`: la escalera es el eje sobre el que se definen las
               bandas, así que filtrarla por una no significaría nada. */
            <DeadlockRanks />
          ) : (
            <Deadlock section={route.dlSection} band={dlBand} picker={dlPicker} />
          )}
```

Replace with:

```tsx
          {route.dlSection === "items" ? (
            <DeadlockItems band={dlBand} picker={dlPicker} />
          ) : route.dlSection === "ranks" ? (
            /* Sin `picker`: la escalera es el eje sobre el que se definen las
               bandas, así que filtrarla por una no significaría nada. */
            <DeadlockRanks />
          ) : route.dlSection === "player" ? (
            /* Sin `picker` tampoco: esta pestaña no mira una banda, mira un
               jugador puntual. */
            <DeadlockPlayer
              accountId={route.detail}
              onOpen={(id) =>
                navigate({ ...route, view: "deadlock", dlSection: "player", detail: id })
              }
            />
          ) : (
            <Deadlock section={route.dlSection} band={dlBand} picker={dlPicker} />
          )}
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `cd games/tft/ui && npx tsc -b --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add games/tft/ui/src/App.tsx
git commit -m "feat(deadlock): wire the player profile page into the app shell"
```

---

### Task 8: CSS for the profile page

**Files:**
- Modify: `games/tft/ui/src/styles/codex.css`

- [ ] **Step 1: Append the new rules**

At the end of `games/tft/ui/src/styles/codex.css`, append:

```css
/* --- Deadlock player profile --- */

[data-theme="codex"] .dl-player-candidates {
  list-style: none;
  margin: 1rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

[data-theme="codex"] .dl-player-candidate-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(201, 162, 74, 0.18);
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

[data-theme="codex"] .dl-player-candidate-btn:hover,
[data-theme="codex"] .dl-player-candidate-btn:focus-visible {
  border-color: rgba(201, 162, 74, 0.45);
}

[data-theme="codex"] .dl-player-avatar {
  border-radius: 0.35rem;
  flex-shrink: 0;
}

[data-theme="codex"] .dl-player-candidate-id {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

[data-theme="codex"] .dl-player-candidate-badge {
  margin-left: auto;
}

[data-theme="codex"] .dl-player-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0;
}

[data-theme="codex"] .dl-player-table-wrap {
  overflow-x: auto;
}

[data-theme="codex"] .dl-player-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

[data-theme="codex"] .dl-player-table th,
[data-theme="codex"] .dl-player-table td {
  padding: 0.5rem 0.7rem;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid rgba(201, 162, 74, 0.18);
}

[data-theme="codex"] .dl-player-hero {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

[data-theme="codex"] .dl-player-row[data-outcome="win"] .dl-player-outcome {
  color: var(--chart-good);
}

[data-theme="codex"] .dl-player-row[data-outcome="loss"] .dl-player-outcome {
  color: var(--chart-bad);
}

[data-theme="codex"] .dl-player-rank {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

[data-theme="codex"] .dl-player-resume {
  background: none;
  border: none;
  color: var(--gold);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  padding: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add games/tft/ui/src/styles/codex.css
git commit -m "feat(deadlock): style the player profile page"
```

---

### Task 9: Manual verification on localhost

This is the "test on localhost" step the user asked for before anything goes to production. No code changes — just running the dev server and checking the feature works end to end, including the cases automated tests cannot cover (real network calls, real rendering, real browser behavior).

- [ ] **Step 1: Start the dev server**

Run: `cd games/tft/ui && npm run dev` (or use the project's `preview_start` tool with the existing `.claude/launch.json` entry if one is configured for this app).

- [ ] **Step 2: Open the Player tab**

Navigate to `http://localhost:5173/en/deadlock/player` (adjust the port to whatever Vite prints). Confirm:
- The "Player" tab appears in the Deadlock sub-nav, alongside Meta/Items/Ranks/Patches.
- The masthead renders the English copy from Task 2.

- [ ] **Step 3: Search flow with disambiguation**

Type `Zota` (a name known to return multiple real candidates, per the design doc's research) and submit. Confirm:
- A list of candidates renders with avatar, name, country, and "N matches in the last 30 days".
- Clicking a candidate navigates the URL to `/en/deadlock/player/<account_id>` and loads that profile's match table.

- [ ] **Step 4: Match table content**

For the loaded profile, confirm the table shows, per row: hero name + image, Win/Loss (or "Not scored" if applicable), K/D/A, Denies/Last hits, net worth, duration as `mm:ss`, mode (Normal/Street Brawl), rank (icon + name, or "—" for non-ranked matches), and a relative date. Confirm at most 50 rows.

- [ ] **Step 5: Deep link round-trip**

Copy the URL from Step 3, open it in a fresh tab (or hard-reload). Confirm the same profile loads directly, without going through search first.

- [ ] **Step 6: Error states**

- Search a nonsense string (e.g. `zzzzxqxq123`) and confirm the "no candidates" message appears, not a raw error.
- With devtools' network tab, throttle to offline and search again; confirm the NETWORK error notice appears with its title/hint from Task 2.
- Manually visit `/en/deadlock/player/999999999999` (an account id that almost certainly does not exist) and confirm the "player not found" message appears instead of a blank page or crash.

- [ ] **Step 7: Language toggle**

Switch the site language to Spanish and repeat Steps 2-4 briefly, confirming all copy (including error messages and table headers) is the Spanish text from Task 2, with no leftover English strings.

- [ ] **Step 8: "Resume" affordance and tab-switch memory**

After viewing a profile, switch to the Items tab and back to Player. Confirm the profile you were viewing is still shown (from the in-memory session), with no new network request (check the network tab). Then hard-reload the bare `/en/deadlock/player` (no account in the URL) and confirm the "Back to your last profile" link appears and works.

- [ ] **Step 9: Report back**

Once every check above passes, report to the user that the feature works on localhost and ask whether to push the commits to `main` (which triggers the Netlify deploy) — do not push automatically.

---

## Self-Review Notes

- **Spec coverage:** search with disambiguation (Task 6), full-but-cut-to-50 history (Task 3 + design decision), always-fetch-steam-info-by-id for both entry points (Task 6's effect), error handling for no-candidates/no-matches/network/rate-limit/upstream (Tasks 2 + 6), i18n (Task 2), routing/deep link (Task 1) — all covered.
- **Deviation from the committed spec, called out explicitly:** the spec's prose said a `?id=` query string; this plan uses a path segment (`/deadlock/player/<id>`) instead, because that is what the codebase's existing router (`route.ts`) already does for every other deep-linkable page (TFT's meta/units/items). Functionally equivalent, more consistent, and it is what Task 1 tests actually check.
- **Type consistency checked:** `SteamCandidate`, `MatchEntry`, `DeadlockApiError` are defined once in Task 3 and imported with the same names/shapes in Tasks 4, 5 and 6. `copy.deadlock.player.*` keys used in Task 6 all exist in Task 2's i18n additions (cross-checked key by key: title, titleBreak, lead, searchLabel, searchPlaceholder, search, searching, resume, candidatesTitle, matchesLast30d, noCandidates, noMatches, playerNotFound, recentMatches, columns.*, outcome.*, mode.*, errors.*).
