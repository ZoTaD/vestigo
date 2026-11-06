# Company of Heroes unificado, etapa 1: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la sección Company of Heroes tenga un selector CoH3 · CoH2 · CoH1. CoH2 y CoH1 con portada, Ranking (con ELO), Rangos, Estadísticas, Jugador, Partida y Logros, actualizados todos los días.

**Architecture:**
- Se agrega un nivel de "juego" a la sección que ya existe. La vista sigue siendo `coh3`, con un campo nuevo `cohGame` en `Route`.
- `site/src/coh3/games.ts` reúne lo que cambia por juego: título de la API, facciones, leaderboards, razas, tipos de partida e imágenes. Los componentes de la parte en vivo leen de ahí, en vez de usar constantes de CoH3.
- Del lado de datos:
  - un recolector en Python baja los rankings y los historiales de Relic una vez por día;
  - escribe los mismos formatos que ya leen Estadísticas y Rangos (`summary.json`, `ladder.json`), más archivos de ELO por leaderboard;
  - un extractor corre a mano en la PC y saca nombres y minimapas de los mapas de los archivos del juego.

**Tech Stack:** Vite + React + TypeScript (vitest), Python 3.13 (pytest, Pillow), GitHub Actions, función de Netlify.

**Spec:** `docs/superpowers/specs/2026-11-06-coh-unificado-design.md`

## Global Constraints

- Todo en español: código, comentarios, commits y docs. PR y commits escuetos: título + 2–4 viñetas, sin planes, IDs ni cifras de tráfico.
- `/en|es/coh3/...` no cambia ni una dirección. Se suman `/en|es/coh2/...` y `/en|es/coh1/...` con los mismos segmentos en español que CoH3 (`ranking`, `rangos`, `estadisticas`, `jugadores`, `partidas`, `logros`).
- Presupuesto por página al abrir, en frío: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos de DOM, sin errores de JS ni 4xx/5xx (`npm run perf`).
- Datos nunca en el chunk de entrada: cada pestaña los pide con `import()`. Los JSON se importan enteros.
- Listas de más de ~150 filas con `LazyRows`. Imágenes de lista con `loading="lazy"`, `decoding="async"` y tamaño fijo, o `SettledImg`.
- Toda tabla se ordena clickeando el encabezado. Ninguna tabla con scroll horizontal. Encabezados en palabras.
- La UI nunca dice de dónde salen los datos. Sí van créditos de licencia y aviso de no afiliación al pie, como en CoH3.
- Facciones:
  - CoH2: `wehrmacht`, `soviet`, `okw`, `usf`, `british`.
  - CoH1: `american`, `wehrmacht`, `british`, `panzer_elite`.
  - Eje: CoH2 `wehrmacht` y `okw`; CoH1 `wehrmacht` y `panzer_elite`.
- API de Relic:
  - `https://coh2-api.reliclink.com/community/leaderboard` con `title=coh2`;
  - `https://coh1-api.reliclink.com/community/leaderboard` con `title=coh1`;
  - User-Agent `vestigo-data`; como máximo 4 pedidos en paralelo.
- Ligas de CoH1 y CoH2: "Nivel N" / "Level N" (N = `ranklevel` 1–20). No inventar nombres.
- **No usar `Archive.exe` de los juegos** (se cuelga y abre ventanas de BugSplat). Los `.sga` se leen con `games/coh/tools/sga.py`.
- Máximo 2 subagentes a la vez. Nunca dos scripts pesados al mismo tiempo (RAM).

## Review Focus

1. **Jugador sin ELO conocido** (no jugó en la ventana recolectada): la fila del Ranking muestra "—" con `title` "Sin partidas recientes", nunca `NaN` ni `0`. Test en Task 5.
2. **Un mapa de la API que no está en `maps.json`** (mapas de la comunidad, nombres con espacios como `4p_Rails and Metal`): Estadísticas y Partida muestran el nombre embellecido con `prettyMap`, sin romper. Test en Task 6.
3. **Relic devuelve error o tarda en un historial** durante la recolección: el pedido se reintenta 2 veces y después se saltea. La corrida termina y escribe lo que juntó. Test en Task 3.
4. **Partida con un jugador de raza desconocida o en un modo que no es 1v1–4v4 por facción** (equipos armados, Assault, Panzerkrieg, personalizada, IA): no entra en las estadísticas. En Partida se muestra igual, con la facción como "—". Test en Task 3.
5. **Cambiar de juego desde una pestaña que el otro no tiene** (por ejemplo Unidades de CoH3 → CoH2 en la etapa 1): el selector lleva a la portada de ese juego, nunca a una página vacía. Test en Task 4.

---

### Task 1: Herramientas comunes de archivos del juego

**Files:**
- Create: `games/coh/tools/sga.py`, `games/coh/tools/ucs.py`, `games/coh/tools/tests/test_sga.py`, `games/coh/tools/tests/test_ucs.py`
- Source: copiar `sga.py` del scratchpad de la sesión (`C:\Users\Zotad\AppData\Local\Temp\claude\efc4d84bc1456fe9\c1ff7cb8-0e64-4f7b-82a9-ceeb22c3aa12\scratchpad\sga.py`): ya lee las versiones 4 y 7.

**Interfaces:**
- Produces:
  - `class Sga(path: str | Path)` con `.entries: dict[str, tuple[int,int,int,int]]` (ruta en minúsculas con `/`) y `.read(path: str) -> bytes`;
  - `load_ucs(path: Path) -> dict[int, str]`, que lee un `.ucs` (UTF-16 LE con BOM, líneas `id\ttexto`);
  - `loc(ref: str, ucs: dict[int,str]) -> str | None`, que resuelve `"$11106520"` a su texto, o `None`.

- [ ] **Step 1: Write the failing tests**
  - `test_sga_v4_y_v7`: construye en memoria un `.sga` mínimo de cada versión con un archivo `a/b.txt` comprimido con zlib (helper `_armar_sga(version, archivos)` en el test, con el layout de encabezado que documenta `sga.py`) y verifica `Sga(tmp).read("a/b.txt") == b"hola"`.
  - `test_sga_rechaza_otra_version`: versión 5 → `ValueError`.
  - `test_ucs`: archivo UTF-16 con `"11106520\tCrossroads\r\n12\tOtro"` → `load_ucs(...)[11106520] == "Crossroads"`; `loc("$12", d) == "Otro"`; `loc("$9", d) is None`; `loc("texto", d) is None`.
- [ ] **Step 2: Run** `python -m pytest games/coh/tools/tests -q`. Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar** `sga.py` (copia limpia, sin el modo CLI de extraer) y `ucs.py`.
- [ ] **Step 4: Run** `python -m pytest games/coh/tools/tests -q`. Expected: PASS.
- [ ] **Step 5: Probar contra los juegos reales**:
  ```
  python -c "from games.coh.tools.sga import Sga; print(len(Sga(r'C:/Program Files (x86)/Steam/steamapps/common/Company of Heroes 2/CoH2/Archives/AttribArchive.sga').entries))"
  ```
  Expected: `12940`. Para el de CoH1 (`Company of Heroes Relaunch/WW2/Archives/AttribArchive.sga`): `5269`.
- [ ] **Step 6: Commit** `git add games/coh/tools && git commit -m "coh: lector de archivos .sga y textos .ucs"`

### Task 2: Configuración por juego (TS) y API parametrizada

**Files:**
- Create: `site/src/coh3/games.ts`
- Modify:
  - `site/src/coh3/api/leaderboards.ts`: las tablas de CoH3 quedan, como `COH3_TABLE`;
  - `site/src/coh3/api/relic.ts`: `BASE` y `title` salen del juego;
  - `site/src/coh3/api/handler.ts`: lee `g`.
- Test: `site/test/cohGames.test.ts`, `site/test/coh3Api.test.ts` (que ya existe, sumar casos).

**Interfaces:**
- Produces (`games.ts`):
  ```ts
  export type CohGame = "coh3" | "coh2" | "coh1";
  export const COH_GAMES: CohGame[] = ["coh3", "coh2", "coh1"];
  export type GameLeaderboard = { id: number; mode: Mode; faction: string; ranked: boolean };
  export interface GameConf {
    game: CohGame; title: string; apiBase: string; name: string; short: string;
    factions: string[]; axis: string[];
    factionName: Record<Lang, Record<string, string>>;
    factionIcon: Record<string, string>;
    leaderboards: GameLeaderboard[];
    raceToFaction: Record<number, string>;
    /** `matchtype_id` → modo 1v1–4v4 con facción; el resto (equipos armados, Assault, IA, personalizada) → null. */
    modeOf: (matchType: number) => Mode | null;
    /** El leaderboard del ranking de un modo y una facción. */
    leaderboardOf: (mode: Mode, faction: string) => number;
    steamAppId: number; league: "coh3" | "level";
  }
  export const GAMES: Record<CohGame, GameConf>;
  export const gameOf = (g: CohGame | undefined): GameConf;
  ```
  La firma `Faction` de CoH3 en `coh3Copy.ts` no cambia: las pestañas de enciclopedia de CoH3 la siguen usando.
- Valores:
  - **CoH2**:
    - leaderboards por modo: 4–7 (1v1 `wehrmacht`, `soviet`, `okw`, `usf`), 8–11 (2v2), 12–15 (3v3), 16–19 (4v4), 51–54 (`british` 1v1–4v4);
    - razas 0 `wehrmacht`, 1 `soviet`, 2 `okw`, 3 `usf`, 4 `british`;
    - matchtype 1–4 → 1v1–4v4;
    - Steam 231430.
  - **CoH1**:
    - leaderboards 4–7 (1v1 `american`, `wehrmacht`, `british`, `panzer_elite`), 8–11, 12–15, 16–19;
    - razas 0 `american`, 1 `wehrmacht`, 2 `british`, 3 `panzer_elite`;
    - matchtype 1–4 → 1v1–4v4;
    - Steam 228200.
  - **CoH3**: lo de hoy.
    - `leaderboardOf` = `automatchId`;
    - `modeOf`: 20–23 → modo; 1–4 también (ranked);
    - `league: "coh3"`.
- Handler: `?g=coh2|coh1` (sin `g` = `coh3`; otro valor → 400 `bad("g")`). El leaderboard se valida contra `gameOf(g).leaderboards`.

- [ ] **Step 1: Write the failing tests**
  - `cohGames.test.ts`:
    - `GAMES.coh2.leaderboardOf("1v1","okw") === 6`;
    - `GAMES.coh2.leaderboardOf("3v3","british") === 53`;
    - `GAMES.coh1.leaderboardOf("4v4","panzer_elite") === 19`;
    - `GAMES.coh1.raceToFaction[3] === "panzer_elite"`;
    - `GAMES.coh2.modeOf(22) === null`;
    - `GAMES.coh3.leaderboardOf("1v1","american") === 2130255`;
    - cada `factions` tiene nombre en `en` y en `es`.
  - `coh3Api.test.ts`:
    - con un `fetch` falso que registra la URL, `leaderboard?g=coh2&id=6` pide a `coh2-api.reliclink.com` con `title=coh2`;
    - `g=coh4` → 400;
    - `g=coh2&id=2130255` → 400;
    - sin `g`, las URLs siguen yendo a `coh3-api` (los tests existentes pasan sin tocarlos).
- [ ] **Step 2: Run** `cd site && npx vitest run test/cohGames.test.ts test/coh3Api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** `games.ts`, y pasar `conf: GameConf` como primer argumento a `getLeaderboard`, `getPersonalStat`, `findByAlias`, `findBySteamId`, `getRecentMatches`, `normalizeLeaderboard`, `normalizePersonal`, `normalizeSearch`, `normalizeHistory` y `normalizeMatch`, en lugar de los imports fijos de `leaderboards.ts`.
  - La facción pasa a ser `string | null`.
  - Si el CoH1 no manda `counters`, `{}` → todos los contadores en `null`.
  - ELO: CoH1/CoH2 no traen `rating` en el leaderboard, así que `elo: null` en `LeaderboardRow`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS (todos, incluidos los de CoH3).
- [ ] **Step 5: Commit** `coh: configuración por juego y API de Relic para CoH1 y CoH2`

### Task 3: Recolector diario de CoH1 y CoH2 (Python)

**Files:**
- Create: `games/coh/tools/relic_daily.py`, `games/coh/tools/tests/test_relic_daily.py`, `games/coh/tools/tests/fixtures/` (un leaderboard y dos historiales recortados de verdad, bajados una vez)
- Modify: `games/coh3/tools/stats.py`: `summarize_day(matches, race=RACE, modes=MODES, axis=AXIS)` con los mapas de hoy como valores por defecto, y lo mismo para la suma de la ventana (`build_summary(days_dir, out, days, since)` o el nombre que tenga hoy la función; no cambia su salida para CoH3). También `games/coh3/tools/ladder.py`: se reutiliza `summarize(entries, now)`.
- Output por juego `G` (`coh2` | `coh1`):
  - `games/G/stats/days/<fecha>.json`;
  - `games/G/stats/summary.json`;
  - `games/G/stats/ladder.json`;
  - `games/G/stats/elo/<leaderboard>.json` = `{"<statgroup_id>": [rating, unix_ts]}`.

**Interfaces:**
- Consumes: `summarize_day`, la suma de la ventana de `stats.py` y `summarize` de `ladder.py`.
- Produces: `python games/coh/tools/relic_daily.py --game coh2|coh1 [--days 28] [--budget 1500] [--workers 4]`.
  - Lo que leen Task 5 y Task 6: los formatos de `summary.json` y `ladder.json` son **idénticos** a los de CoH3 (mismas claves), con las claves de facción del juego.
  - En `ladder.json`, `eloStart: 400` y `eloStep: 50`, igual que CoH3; el histograma sólo cuenta jugadores con ELO conocido.

**Algoritmo** (lo que la firma no decide):
1. Bajar todos los leaderboards del juego (`getLeaderBoard2`, de a 200, `sortBy=1`). Filas = `(lb, statgroup, profile_ids, rank, ranklevel, wins, losses, lastmatchdate, country)`.
2. Leer los `elo/*.json` existentes (la memoria de ELO).
3. Candidatos = perfiles con `lastmatchdate` en los últimos 7 días. Un perfil está **cubierto** si ya tiene, en la memoria o en una partida vista en esta corrida, un rating con `ts ≥ lastmatchdate` en todos sus leaderboards. Se ordenan por `lastmatchdate` descendente y se piden historiales (`getRecentMatchHistoryByProfileId`) de los no cubiertos, hasta `--budget` pedidos, con `--workers` hilos.
4. De cada partida vista:
   - `matchhistorymember` da `newrating` del `statgroup_id` (en partidas 1v1–4v4, el statgroup del jugador en ese leaderboard), que se guarda con `ts = completiontime`;
   - si `completiontime` cae en un día UTC ya completo y que todavía no tiene `days/<fecha>.json`, la partida va a ese día. Sin repetir por `id`.
5. Por cada día juntado:
   - se arman partidas con la forma que espera `summarize_day`: `matchtype_id`, `mapname`, `startgametime`, `completiontime`, jugadores con `race_id`, resultado y `oldrating`;
   - se escribe `days/<fecha>.json`;
   - se rehace `summary.json` con la ventana `--days`;
   - se escriben `elo/*.json` (sólo statgroups que están en el leaderboard actual) y `ladder.json` con `summarize` (rating = memoria de ELO, o null).
6. Un pedido que falla se reintenta 2 veces con 3 s de espera y después se saltea. Al final se imprime: pedidos, fallados, partidas por día y cobertura de ELO (% de filas con rating).

- [ ] **Step 1: Write the failing tests** (sin red: `fetch` inyectado que lee los fixtures)
  - `test_cubierto_no_se_pide`: un perfil con rating en memoria con `ts` mayor que su `lastmatchdate` → no se pide su historial.
  - `test_partida_suma_elo_de_todos`: un historial 2v2 da rating a los 4 statgroups.
  - `test_modo_raro_afuera`: una partida con `matchtype_id` 5 (CoH1 `TEAM_2v2`) o 0 no entra en el día; una con `race_id` 9 tampoco.
  - `test_falla_se_saltea`: un `fetch` que tira error siempre en un perfil → la corrida termina, el día se escribe y el contador de fallados es 1.
  - `test_formato_igual_a_coh3`: el `summary.json` generado tiene las claves `matches, modes, from, to, days, durStep, generatedAt`, y `ladder.json` las de CoH3.
  - `test_coh3_no_cambia`: `summarize_day` de `stats.py` con los parámetros por defecto da lo mismo que antes sobre el fixture de `test_stats.py`.
- [ ] **Step 2: Run** `python -m pytest games/coh/tools/tests games/coh3/tools/tests -q`. Expected: FAIL en los nuevos.
- [ ] **Step 3: Implementar** `relic_daily.py` y los parámetros de `stats.py`/`ladder.py`.
- [ ] **Step 4: Run** los mismos tests. Expected: PASS.
- [ ] **Step 5: Corrida real**, de a un juego (nunca los dos a la vez):
  ```
  python games/coh/tools/relic_daily.py --game coh1
  python games/coh/tools/relic_daily.py --game coh2
  ```
  Expected:
  - CoH1 en menos de 10 minutos y CoH2 en menos de 20;
  - cobertura de ELO de los activos de 7 días ≥ 70 % (si da menos, subir `--budget` y anotar la cifra en el plan);
  - `summary.json` con partidas de ayer.
- [ ] **Step 6: Commit** `coh: recolector diario de ranking y partidas de CoH1 y CoH2` (con los JSON generados).

### Task 4: Rutas, selector de juego y menú

**Files:**
- Modify:
  - `site/src/route.ts`: `cohGame?: CohGame` en `Route`; parse de `coh2`/`coh1`; `pathOf`;
  - `site/src/Coh3.tsx`: pestañas por juego y selector;
  - `site/src/coh3Copy.ts`: `COH_TABS: Record<CohGame, Coh3Section[]>`, textos y SEO por juego;
  - `site/src/i18n.ts`: `coh3: "Company of Heroes"`, `coh3Short: "CoH"`;
  - `site/src/Nav.tsx`;
  - `site/src/coh3/Coh3Home.tsx`: portada por juego;
  - `site/src/styles/coh3.css`;
  - `site/src/coh3/sitemapData.ts` y `vite.config.ts`: rutas prerenderizadas de CoH1/CoH2.
- Create:
  - `site/public/coh2/`: `bg.webp` (de `library_hero` de Steam 231430), `logo.webp` (de `logo.png` de Steam) y `f/<facción>.webp` (emblemas de los `.sga` o de Steam);
  - `site/public/coh1/`: lo mismo con Steam 228200;
  - `games/coh/tools/art.py`, que baja y convierte el arte.
- Test: `site/test/route.test.ts` (sumar casos), `site/test/areas.test.ts`.

**Interfaces:**
- Consumes: `CohGame`, `GAMES` (Task 2).
- Produces:
  - `Route.cohGame` (undefined = `coh3`);
  - `COH_TABS[g]` = las pestañas con página de cada juego:
    - CoH3 = las de hoy;
    - CoH2 y CoH1 = `home, leaderboards, ranks, stats, achievements, players, matches` (las dos últimas sin botón en la barra, como hoy);
  - `switchGame(route: Route, to: CohGame): Route`:
    - misma pestaña si `COH_TABS[to]` la tiene;
    - `battlegroups` ↔ `commanders` ↔ `doctrines` cuando existan (etapas 2–3);
    - si no, `home`;
    - siempre `detail: undefined`.

- [ ] **Step 1: Write the failing tests** (`route.test.ts`)
  - `parse("/es/coh2/ranking")` → `{view:"coh3", cohGame:"coh2", c3Section:"leaderboards"}`.
  - `pathOf` de eso en `en` → `/en/coh2/leaderboards`.
  - `parse("/en/coh1")` → portada de CoH1.
  - `parse("/es/coh3/unidades/riflemen_us")` sigue igual que hoy, y `pathOf` da la misma cadena.
  - `parse("/es/coh2/unidades")` (pestaña que CoH2 todavía no tiene) → portada de CoH2.
  - `switchGame({…coh3 units})` a `coh2` → `c3Section: "home"`.
  - `switchGame({…coh3 leaderboards, detail:"x"})` a `coh1` → `leaderboards`, sin `detail`.
- [ ] **Step 2: Run** `npx vitest run test/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** la ruta, `switchGame` (en `coh3Copy.ts` o `games.ts`) y la cáscara.
  - Selector: `<nav class="c3-games" aria-label="Company of Heroes">` con tres `RouteLink` (logo monocromo + "CoH3"/"CoH2"/"CoH1"), encima de `.c3-tabbar`. Activo en bronce `#d0a75a`, sin bordes de color.
  - Portada de CoH2/CoH1: el mismo `Hero` con el arte del juego, tarjetas de facción, y accesos a Ranking, Rangos, Estadísticas y Logros.
  - Barra: "Company of Heroes" / "CoH".
  - `<title>` y SEO por juego: "CoH2 Leaderboards: 1v1 to 4v4 by Faction" y equivalentes, con lo que se busca.
  - Prerender y sitemap: portada, `leaderboards`, `ranks`, `stats` y `achievements` de CoH2 y CoH1, en los dos idiomas.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. Se agrega en `areas.test.ts` lo que pida el chequeo de `COH3_TAB_FILES` (no hay archivos nuevos de pestaña: se reutilizan).
- [ ] **Step 5: Mirar en el navegador** (servidor `vestigo-coh3`, puerto 5271):
  - `/es/coh2` y `/en/coh1` muestran su arte y el selector;
  - ir a CoH2 desde Unidades de CoH3 cae en la portada de CoH2;
  - la barra dice "Company of Heroes".
  - Capturas a 1280 y a 375 de ancho, sin scroll horizontal.
- [ ] **Step 6: Commit** `coh: selector de juego y portadas de CoH2 y CoH1`

### Task 5: Ranking, Jugador y Partida para los tres juegos

**Files:**
- Modify:
  - `site/src/coh3/leaderboards/Coh3Leaderboards.tsx`, `copy.ts`;
  - `site/src/coh3/players/Coh3Players.tsx`;
  - `site/src/coh3/matches/Coh3Matches.tsx`;
  - `site/src/coh3/live/logic.ts`, `ui.tsx` (las llamadas a `/api/coh3/...` suman `&g=`);
  - `site/src/coh3/ui.tsx` (`LeagueTag` según `conf.league`);
  - `site/src/coh3/leagues.ts` (`levelName(n, lang)` → "Nivel N"/"Level N").
- Create: `site/src/coh3/stats/elo.ts`: `loadElo(game: CohGame, leaderboard: number): Promise<Record<string, [number, number]>>` con `import.meta.glob("../../../../games/{coh1,coh2}/stats/elo/*.json")` perezoso, o el alias equivalente (`@coh2stats`/`@coh1stats` en `vite.config.ts`).
- Test: `site/test/coh3Live.test.ts`, `site/test/coh3LiveRender.test.tsx` (sumar casos).

**Interfaces:**
- Consumes: `GAMES`/`gameOf` (Task 2), `Route.cohGame` (Task 4), `elo/<lb>.json` (Task 3).
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: Write the failing tests**
  - `coh3LiveRender`: el ranking de CoH2 con dos filas, una con ELO en `loadElo` y otra sin él, muestra `1.816` en la primera y `—` con `title="Sin partidas recientes"` en la segunda (en `es`).
  - La liga de una fila con `ranklevel` 17 se ve como "Nivel 17".
  - Una partida de CoH1 con `counters: "{}"` se dibuja sin la tabla de contadores y sin `NaN`.
  - Un jugador con `race_id` desconocido aparece con facción "—".
- [ ] **Step 2: Run** `npx vitest run test/coh3LiveRender.test.tsx test/coh3Live.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Los selectores de modo y facción salen de `conf.factions`, y los emblemas de `conf.factionIcon`.
  - La columna ELO de CoH1/CoH2 lleva la nota "ELO de la última partida" en el encabezado (`title`).
  - Jugador y Partida de CoH1/CoH2 no se prerenderizan, igual que en CoH3.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Mirar en el navegador**:
  - `/es/coh2/ranking`: 1v1 británicos, ordenar por ELO y por victorias;
  - abrir un jugador y una partida de CoH2;
  - lo mismo en CoH1 con Panzer Elite.
  - Capturas.
- [ ] **Step 6: Commit** `coh: ranking, jugador y partida de CoH1 y CoH2`

### Task 6: Mapas (extracción mínima), Estadísticas y Rangos

**Files:**
- Create:
  - `games/coh/tools/maps.py`, `games/coh/tools/tests/test_maps.py`;
  - `games/coh2/data/maps.json`, `games/coh1/data/maps.json`;
  - `site/public/coh2/m/<id>.webp`, `site/public/coh1/m/<id>.webp`.
- Modify:
  - `site/src/coh3/stats/data.ts`: `loadSummary(game)`; `Faction` → `string` en `BandStats.f`;
  - `site/src/coh3/stats/Coh3Stats.tsx`, `parts.tsx`;
  - `site/src/coh3/stats/Coh3Ranks.tsx`: `loadLadder(game)`;
  - `vite.config.ts`: alias `@coh2stats`, `@coh1stats`, `@coh2`, `@coh1`.

**Interfaces:**
- Consumes: `Sga`, `load_ucs`, `loc` (Task 1); `summary.json` y `ladder.json` (Task 3).
- Produces:
  - `python games/coh/tools/maps.py --game coh2|coh1`;
  - `maps.json` = `{generatedAt, list: [{id, name: {en, es}, players, size: [w, h], points: [{x, y, kind}], minimap: "m/<id>"}]}`.
  - `id` = el `mapname` tal como lo manda la API, en minúsculas: `crossroads`, `4p_rails and metal`.
- De dónde sale:
  - CoH2: `MPScenarios.sga` y `MPXP1Scenarios.sga`, `scenarios/mp/**/<x>.info`. Se parsea `scenarioname = "$N"`, `maxplayers`, `mapsize` y `point_positions` (con `ebp_name`). El minimapa es `<x>_mm.tga` → webp 512 px. Textos en `CoH2/Locale/{English,Spanish}/RelicCoH2.*.ucs`.
  - CoH1: `WW2Data.sga`, `scenarios/mp/**/<x>.info` y `<x>_mm.tga`. Textos en `CoH/Engine/Locale/<Idioma>/RelicCOH.<Idioma>.ucs`. Si falta el inglés, `name.en` = `prettyMap(id)` y se avisa en la salida.
  - Las rutas de instalación se pasan con `--root` (por defecto la carpeta de Steam de esta PC).
  - Corre a mano y nunca en Actions: los JSON y webp se commitean.

- [ ] **Step 1: Write the failing tests**
  - `test_maps.py::test_info`: un `.info` de texto (fixture recortado del de `crossroads`) → `players == 2`, `size == [320, 320]`, un `victory_point` en `points`.
  - `Coh3Stats`: una tarjeta de mapa con id `"4p_rails and metal"` que no está en `maps.json` muestra "Rails And Metal" (`prettyMap`, y hay que sumarle que saque el prefijo `\dp_`).
  - `Coh3Ranks`: con un `ladder.json` de CoH2 muestra "Nivel 20" en la tabla de ligas, y las 5 facciones de CoH2.
- [ ] **Step 2: Run** `python -m pytest games/coh/tools/tests -q` y `npx vitest run`. Expected: FAIL en los nuevos.
- [ ] **Step 3: Implementar** `maps.py`, los loaders por juego y el ajuste de `prettyMap`.
- [ ] **Step 4: Correr la extracción**:
  ```
  python games/coh/tools/maps.py --game coh2
  python games/coh/tools/maps.py --game coh1
  ```
  Expected: los mapas de multijugador de CoH2 (del orden de 100) y de CoH1 (del orden de 60), cada uno con su webp.
- [ ] **Step 5: Run** todos los tests. Expected: PASS.
- [ ] **Step 6: Mirar en el navegador**: `/es/coh2/estadisticas` y `/en/coh1/ranks`, con los nombres de mapas y sin scroll horizontal a 375. Capturas.
- [ ] **Step 7: Commit** `coh: mapas, estadísticas y rangos de CoH1 y CoH2`

### Task 7: Logros de CoH1 y CoH2

**Files:**
- Modify:
  - `games/coh3/tools/achievements.py`: `--game coh3|coh2|coh1`. Para CoH2/CoH1, el español sale de la página pública de Steam con `?l=spanish` (mismo JSON embebido `queryData`), sin locstrings. Escribe `games/<g>/data/achievements.json` e íconos en `site/public/<g>/a/`.
  - `site/src/coh3/more/Coh3Achievements.tsx`: `loadAchievements(game)` y la ruta de íconos `/<g>/a/`; el `lede` nombra al juego.
- Test: `games/coh3/tools/tests/test_achievements.py` (nuevo, con una página guardada recortada) y uno de render.

- [ ] **Step 1: Write the failing tests**
  - Dos páginas fixture (en y es) del mismo logro → `{name: {en, es}, desc: {en, es}}` combinados por `apiname`.
  - Un logro sin ícono (404) → `icon: None`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** `python games/coh3/tools/achievements.py --game coh2` y después `--game coh1`. Expected: decenas de logros, con porcentaje.
- [ ] **Step 5: Run** todos los tests. Expected: PASS. Mirar `/es/coh2/logros` en el navegador.
- [ ] **Step 6: Commit** `coh: logros de CoH1 y CoH2`

### Task 8: Publicación diaria, rendimiento y PR

**Files:**
- Rename: `.github/workflows/publish-coh3.yml` → `publish-coh.yml`. Pasos nuevos:
  - `python games/coh/tools/relic_daily.py --game coh1`, y después `--game coh2`, todos los días;
  - `achievements.py --game coh2/coh1` los lunes;
  - el guard y el `git add` suman `games/coh1 games/coh2 site/public/coh1 site/public/coh2`;
  - `timeout-minutes: 45`.
- Modify:
  - `.github/workflows/deploy.yml`: `paths` y `workflow_run` con el nombre nuevo;
  - `netlify.toml`: `ignore` con `games/coh1/data`, `games/coh1/stats`, `games/coh2/data`, `games/coh2/stats`; y la CSP si algún origen nuevo lo pide (no debería: todo pasa por `/api/coh3`);
  - `site/scripts/perf.mjs`: `PAGES` con `/es/coh2`, `/en/coh2/leaderboards`, `/es/coh2/estadisticas`, `/en/coh2/ranks`, `/es/coh2/logros` y lo mismo para CoH1;
  - memoria `coh3-rts-2026-11-04.md`.

- [ ] **Step 1: Build y links**: `cd site && npm run build` en segundo plano, midiendo tiempo y pico de RAM. Expected: termina, `check-links` 0 sin destino. Anotar tiempo y RAM al final de este plan, comparados con los 2 min 19 s del último build.
- [ ] **Step 2: Perf**: `vite preview` en el puerto 4173 y `npm run perf`. Expected: todas las páginas de CoH dentro del presupuesto.
- [ ] **Step 3: Recorrido como jugador**: cada pestaña de CoH2 y CoH1 en los dos idiomas, a 1280 y 375, con capturas en el Chrome de ZoTaD (sin redimensionarlo: el ancho de teléfono se emula en el panel Browser). Zoom de cerca a títulos, cifras y bordes.
- [ ] **Step 4: Commit y PR**:
  - título `coh: CoH2 y CoH1 en la sección Company of Heroes`;
  - 2–4 viñetas;
  - no se fusiona sin el OK de ZoTaD.

## Medidas (6/11/2026)

- `npm run build` (tsc + vite + check-links): 221 s, 53.780 páginas prerenderizadas, 0 enlaces rotos. Pico de RAM 4,3 GB
  sumando todos los procesos de Node de la PC (tope en Netlify: 6 GB). El último build de CoH3 solo tardó 185 s.
- `npm run perf --only coh`: las 30 páginas de CoH dentro del presupuesto; la más pesada, el ranking (≈59 pedidos,
  ≈1.100 nodos).
- Recolector (primera corrida, sin memoria): CoH1 988 pedidos en 461 s (cobertura de ELO 99,2 %); CoH2 1.500 pedidos
  (el tope) en 1.192 s (85,6 %). Las corridas siguientes piden menos: sólo a quienes jugaron desde la última.
- CoH1 no tiene logros en Steam: la pestaña Logros queda sólo para CoH3 y CoH2.
