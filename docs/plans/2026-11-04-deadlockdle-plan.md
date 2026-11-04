# Deadlockdle — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development
> (recomendado) o superpowers:executing-plans, tarea por tarea. Los pasos usan
> casillas (`- [ ]`).

**Objetivo:** el juego diario de Deadlock por pistas (Heroes, Items,
Abilities) con un ranking del día por modo, en `/en/deadlock/dle`, que funciona
solo todos los días.

**Arquitectura:** el build del sitio genera el pozo (`/deadlock/dle-pool.json`)
desde los datos de Deadlock, así se actualiza con cada publicación diaria. El
Worker `vestigo-api` (el del login) lee ese pozo, elige las respuestas a las
00:00 UTC con un cron, compara cada intento y guarda partidas y ranking en D1.
Una Action publica el Worker cuando cambia su código.

**Stack:** Cloudflare Workers (cron, D1, Rate Limiting), TypeScript, vitest;
React + Vite del sitio; GitHub Actions.

**Diseño:** `docs/plans/2026-11-04-deadlockdle.md` (leerlo antes de cada
tarea). Maquetas en `docs/plans/2026-11-04-deadlockdle/`.

## Reglas generales

- Todo en español (código, comentarios, commits); la UI en EN y ES, **los
  nombres del juego siempre en inglés**.
- Commits y PR escuetos: título + 2–4 viñetas, sin planes ni tráfico.
- Reglas del sitio (`CLAUDE.md`): nada de datos en el chunk de entrada
  (pestaña con `import()` y entrada en `areaFiles.ts`), imágenes con tamaño
  fijo y `loading="lazy"`, la página en `PAGES` de `site/scripts/perf.mjs`
  dentro del presupuesto.
- Estética "cartel" (`deadlock-cartel.css`): papel crema, sombra
  `7px 7px 0 rgba(0,0,0,.55)`, sin bordes de color en tarjetas. Casillas:
  verde `#3c8a3a`, amarillo `#b98f1f`, rojo `#9b3328`.
- Tres modos: `heroes`, `items`, `abilities`. **No hay modo "all".**
- Día = `YYYY-MM-DD` en UTC; cambia a las 00:00 UTC.
- Nada manual en el día a día. Secretos fuera del repo: `DLE_SECRET` (Worker)
  y `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (GitHub) los carga ZoTaD.

## Foco de revisión

1. **Que la respuesta no llegue a la página antes de acertar** (ni en
   `/today` ni en una pista): test en la Tarea 4.
2. **Cambio de día a mitad de partida** (empezó 23:59 UTC): el intento va
   contra el día de la partida empezada. Test en la Tarea 4.
3. **Nombres escritos distinto** ("  grey talon "): se aceptan. Test en la
   Tarea 2.
4. **Doble clic en "Guess"**: cuenta una sola vez (409 la segunda). Test en
   la Tarea 4.
5. **El pozo no se puede bajar** (vestigo.gg caído al pedirlo): el Worker usa
   la última copia buena; si nunca tuvo una, `today` devuelve 503 y la página
   muestra "Couldn't reach the game server, try again" sin perder filas.
   Tests en las Tareas 4 y 6.

---

### Tarea 1: el pozo en el build del sitio

**Archivos:**
- Crear: `site/scripts/dle-pool.mjs`, `api/src/dle/types.ts`
- Modificar: `site/package.json` (`predev` y `prebuild` corren
  `node scripts/dle-pool.mjs`), `.gitignore` de `site/`
  (`public/deadlock/dle-pool.json` es generado)
- Test: `site/scripts/dle-pool.test.mjs` (vitest, junto a los del sitio)

**Produce** (`api/src/dle/types.ts`; el sitio copia los tipos que use):

```ts
export type Mode = "heroes" | "items" | "abilities";
export type Value = number | string | string[] | null;
export interface Entry {
  id: string;            // "hero:3", "item:3190916303", "ability:491391007"
  name: string;          // en inglés
  img: string;           // "/deadlock/game/images/…"
  cols: Record<string, Value>;
  hints: [Hint, Hint];   // las dos de texto/arte propias; la borrosa la arma el Worker
  link: string;          // ruta sin idioma: "deadlock/heroes/vindicta"
}
export type Hint = { kind: "img"; src: string; blur: boolean } | { kind: "text"; text: string };
export interface Pool { builtAt: string; heroes: Entry[]; items: Entry[]; abilities: Entry[] }
export const COLUMNS: Record<Mode, { key: string; label: string; type: "exact" | "num" | "pct" | "list" }[]>;
```

`COLUMNS` = las tablas del diseño, mismas etiquetas. Claves: héroes
`complexity, health, moveSpeed, clip, gunDps, winRate`; objetos
`slot, tier, cost, kind, upgradeOf, gives`; habilidades
`hero, slot, ultimate, cooldown, effects`.

- [ ] **Paso 1: test que falla** — corre el script a una carpeta temporal y
  comprueba: 44 héroes, 156 objetos, 176 habilidades (conteos del 4/11: si
  cambian, se actualiza el número, no se borra el test); ids únicos; `img`
  empieza con `/deadlock/game/`; Vindicta (`hero:3`) =
  `{ complexity: 1, health: 755, moveSpeed: 7.9, clip: 19, gunDps: 53.4 }` +
  `winRate` numérico; Spirit Snatch (`item:3190916303`) = `slot: "Spirit"`,
  `tier: 3`, `cost: 3200`, `upgradeOf: "Yes"`; 10 habilidades con
  `cooldown: null`.
- [ ] **Paso 2:** `npx vitest run scripts/dle-pool.test.mjs` en `site/` → falla.
- [ ] **Paso 3: `dle-pool.mjs`** (exporta `buildPool(dataDir, manifestPath)` y,
  ejecutado, escribe `public/deadlock/dle-pool.json`). Lee
  `games/deadlock/data/catalog.json`, `hero-kit.json`, `hero-kit/*.json`,
  `items-detail.json`, `heroes.phantom-above.json` y
  `public/deadlock/game/manifest.json` (URL del bucket → ruta local).
  `kind` = "Active" si alguna sección de `items-detail` es `active`;
  `gives` = `types` en texto ("Spirit damage" para `tech_damage`, "Bullet
  damage", "Healing", "Health", "Melee damage"; el resto con mayúscula
  inicial); `effects` = los `attr` distintos de `sections[].text[]`, ordenados;
  `link` con el slug que usa `site/src/route.ts`; la habilidad enlaza a su
  héroe. Pistas: héroe = [ícono de su habilidad slot 1, `text.en.role`];
  objeto = [primer texto de su descripción, nombres de `upgradesFrom` o
  "Nothing"]; habilidad = [nombre del héroe, primer texto del `quip`].
- [ ] **Paso 4:** pasa; `npm run build --prefix site` deja
  `dist/deadlock/dle-pool.json`.
- [ ] **Paso 5:** commit `feat(dle): pozo de respuestas en el build del sitio`.

### Tarea 2: comparar, elegir con pesos, ordenar

**Archivos:**
- Crear: `api/src/dle/logic.ts`
- Test: `api/test/dle-logic.test.ts`

**Consume:** Tarea 1. **Produce:**

```ts
export type Mark = "ok" | "near" | "no";
export interface Cell { key: string; value: Value; mark: Mark; dir?: "up" | "down" }
export function findByName(entries: Entry[], name: string): Entry | null;
export function compare(guess: Entry, answer: Entry, mode: Mode): Cell[];
export function utcDate(now: number): string;               // "2026-11-05"
export function dayNumber(date: string): number;            // LAUNCH_DATE → 1
export function weightFor(daysSince: number | null, poolSize: number): number;
export async function pickAnswer(entries: Entry[], lastSeen: Map<string, string>, date: string, mode: Mode, secret: string): Promise<Entry>;
export function hintsUnlocked(answer: Entry, guesses: number): Hint[];
export interface PlayRow { steamId: string; guesses: number; ms: number; finishedAt: number }
export function rankPlays(rows: PlayRow[]): PlayRow[];
```

`LAUNCH_DATE` se fija el día que se publica (constante en `logic.ts`).

- [ ] **Paso 1: tests que fallan**, con estos casos:
  - `compare(Haze, Vindicta, "heroes")`: complexity `ok`; health 730 `near`
    `up`; moveSpeed 8.2 `near` `down`; clip 25 `no` `down`; gunDps 50.1
    `near` `up`. `compare(Grey Talon, Vindicta)`: complexity `no` `down`;
    clip 17 `no` `up` (el límite es `<= 10 %`).
  - winrate 51.2 vs 51.7 `near`; 45.7 vs 51.7 `no` `up`.
  - listas: iguales `ok`; `["Spirit damage","Healing"]` vs
    `["Spirit damage","Melee damage","Health"]` `near`; nada en común `no`;
    `null` vs `null` `ok`.
  - `findByName(e, "  grey talon ")` → Grey Talon; `"Grey Talo"` → `null`.
  - `weightFor(null, 44)` = 1; `weightFor(1, 44)` ≈ 0,00207 (ventana 22);
    `weightFor(22, 44)` = 1; `weightFor(40, 44)` = 1.
  - `pickAnswer`: mismo resultado para mismo secreto, fecha y modo; con un
    pozo de 44 y `lastSeen` = ayer para el candidato elegido sin historia,
    simular 1.000 fechas y que salga el de ayer menos de 10 veces; nunca
    elige uno de peso 0 si hay otro con peso > 0.
  - `hintsUnlocked(_, 3)` → `[]`; `4` → `[{ kind: "img", src: answer.img, blur: true }]`;
    `6` → 2; `8` → 3.
  - `rankPlays`: por `guesses`, después `ms`, después `finishedAt`.
- [ ] **Paso 2:** fallan. **Paso 3:** implementar. `weightFor` =
  `min(1, días / ventana)²`, `ventana = max(1, floor(poolSize / 2))`.
  `pickAnswer`: número en [0, 1) de los primeros 6 bytes de
  HMAC-SHA256(`secret`, `` `${date}|${mode}` ``) (`crypto.subtle`), y se
  recorre la suma acumulada de pesos en el orden del pozo.
- [ ] **Paso 4:** `npm test --prefix api` pasa.
- [ ] **Paso 5:** commit `feat(dle): comparar intentos y elegir el día con pesos`.

### Tarea 3: tablas y almacenamiento

**Archivos:**
- Crear: `api/migrations/0002_dle.sql`, `api/src/dle/store.ts`
- Test: `api/test/dle-store.test.ts` (contra `memStore`)

**Produce:**

```ts
export interface DayRow { date: string; mode: Mode; answer: Entry }
export interface Store {
  day(date: string, mode: Mode): Promise<DayRow | null>;
  saveDay(row: DayRow): Promise<DayRow>;                       // si ya existe, devuelve el guardado
  lastSeen(mode: Mode, before: string): Promise<Map<string, string>>; // id → última fecha
  play(steamId: string, mode: Mode, date: string): Promise<{ startedAt: number; finishedAt: number | null; guesses: string[] } | null>;
  openPlay(steamId: string, mode: Mode): Promise<string | null>; // fecha de una partida sin terminar
  addGuess(steamId: string, mode: Mode, date: string, entryId: string, at: number, solved: boolean): Promise<"ok" | "duplicate">;
  ranking(date: string, mode: Mode, limit: number): Promise<(PlayRow & { name: string; avatar: string })[]>;
  playerCount(date: string, mode: Mode): Promise<number>;
  myRank(steamId: string, date: string, mode: Mode): Promise<number | null>;
  myStats(steamId: string, mode: Mode, today: string): Promise<{ streak: number; played: number; won: number }>;
}
export function d1Store(db: D1Database): Store;
export function memStore(): Store;
```

Tablas: `dle_days (date, mode, answer_id, answer_json)` PK `(date, mode)`;
`dle_plays (steam_id, date, mode, started_at, finished_at, guesses, solved)`
PK `(steam_id, date, mode)`, `started_at` = hora del primer intento;
`dle_guesses (steam_id, date, mode, n, answer_id, at)` PK
`(steam_id, date, mode, n)` y `unique (steam_id, date, mode, answer_id)`.
Índice `dle_plays (date, mode, solved, guesses, finished_at)`.

- [ ] **Paso 1:** tests: `saveDay` dos veces devuelve el primero; `addGuess`
  repetido → `"duplicate"`; el primer `addGuess` fija `startedAt`; `ranking`
  sólo resueltas y en orden de `rankPlays`; `lastSeen` da la fecha más
  reciente por id; `myStats` cuenta la racha de días seguidos resueltos
  hasta `today`.
- [ ] **Paso 2:** fallan. **Paso 3:** `memStore` y `d1Store` (`insert … on
  conflict do nothing`). **Paso 4:** pasan;
  `npx wrangler d1 migrations apply vestigo-api --local` sin errores.
- [ ] **Paso 5:** commit `feat(dle): tablas de días, partidas e intentos`.

### Tarea 4: endpoints, cron y pozo remoto

**Archivos:**
- Crear: `api/src/dle/routes.ts`, `api/src/dle/pool.ts`
- Modificar: `api/src/index.ts` (sacar `sessionSteamId(req, env): Promise<string | null>`;
  enrutar `/api/dle/*`; exportar `scheduled`), `api/wrangler.toml`
  (`[triggers] crons = ["0 0 * * *"]`; binding `DLE_LIMIT` de Rate Limiting,
  30 por 60 s; var `POOL_URL = "https://vestigo.gg/deadlock/dle-pool.json"`)
- Test: `api/test/dle-routes.test.ts`

**Produce:**
- `loadPool(url: string, fetcher = fetch): Promise<Pool>` — guarda la última
  copia buena en memoria y en la Cache API una hora; si el pedido falla usa
  la última; si nunca hubo una, lanza `PoolUnavailable`.
- `ensureDay(store, pool, mode, date, secret): Promise<DayRow>` — si no hay
  día, `pickAnswer` con `lastSeen(mode, date)` y `saveDay`.
- `scheduled()` corre `ensureDay` para los tres modos con `utcDate(now)`.
- `handleDle(req, url, deps: { store; pool: () => Promise<Pool>; secret; now; steamId; limit? }): Promise<Response | null>`:
  - `GET /api/dle/:mode/today` →
    `{ number, date, mode, columns, rows: { guess: {id,name,img}, cells: Cell[] }[], hints, solved, answer? }`
    (`answer` = `{ id, name, img, link }` sólo si `solved`; sin sesión,
    `rows` vacío). Con sesión y una partida de ayer sin terminar, devuelve esa.
  - `POST /api/dle/:mode/guess` `{ name, date? }` → `{ row, hints, solved, answer? }`.
    Con sesión, el día es el de `openPlay` si existe, si no hoy; sin sesión,
    `date` del cuerpo si es hoy o ayer, si no hoy. 400 nombre fuera del pozo
    del modo, 409 repetido, 429 si `limit` niega, 503 si `PoolUnavailable`.
  - `GET /api/dle/ranking` →
    `{ date, modes: { heroes|items|abilities: { players, top: {pos,name,avatar,guesses,ms}[], me: {pos,guesses,ms} | null } } }`.
  - `GET /api/dle/me` → `{ heroes|items|abilities: { streak, played, won, today: "solved" | "playing" | "none" } }`.

- [ ] **Paso 1: tests que fallan** (`memStore`, un pozo de prueba, secreto
  fijo): `JSON.stringify` de `today` sin sesión no contiene el nombre de la
  respuesta; adivinar bien → `solved: true` y `answer.link`; mismo nombre dos
  veces → 409; un objeto en el modo `heroes` → 400; partida empezada a las
  23:59:30 UTC acepta el intento a las 00:00:30 contra el día anterior;
  `limit` niega → 429; `loadPool` con `fetcher` que falla devuelve la última
  copia, y sin copia previa `today` da 503; `scheduled` crea los tres días y
  correrlo dos veces no cambia nada.
- [ ] **Paso 2:** fallan. **Paso 3:** implementar. **Paso 4:**
  `npm test --prefix api` y `npx tsc -p api` pasan.
- [ ] **Paso 5:** `api/.dev.vars` con `DLE_SECRET=` y
  `POOL_URL=http://localhost:5173/deadlock/dle-pool.json`; con el sitio y la
  API en local, `curl localhost:8787/api/dle/heroes/today` → 200 sin el
  nombre de la respuesta; `curl "localhost:8787/__scheduled?cron=0+0+*+*+*"`
  (`wrangler dev --test-scheduled`) crea los días.
- [ ] **Paso 6:** commit `feat(dle): endpoints, cron diario y pozo del sitio`.

### Tarea 5: publicación automática del Worker

**Archivos:**
- Crear: `.github/workflows/deploy-api.yml`

En `push` a `main` con cambios en `api/**` (y `workflow_dispatch`):
`npm ci --prefix api`, `npm test --prefix api`,
`wrangler d1 migrations apply vestigo-api --remote`, `wrangler deploy`, con
`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` de los secretos del repo.
Acciones fijadas por SHA como en `deploy.yml`; `permissions: contents: read`.

- [ ] **Paso 1:** ZoTaD crea el token en Cloudflare (plantilla "Edit
  Cloudflare Workers" + permiso D1 Edit, sólo su cuenta) y lo carga en
  GitHub junto al account id; nadie lo pega en el chat.
- [ ] **Paso 2:** `gh workflow run deploy-api.yml` desde la rama → verde, y
  `curl https://vestigo-api.vestigo-gg.workers.dev/api/me` sigue en 401.
- [ ] **Paso 3:** commit `ci: publicar la API sola`.

### Tarea 6: la pestaña en el sitio

**Archivos:**
- Modificar: `site/src/route.ts` (sección `"dle"` en `DeadlockSection`,
  `DEADLOCK_SECTIONS` después de `"patches"` y `DL_WITH_DETAIL`; detalle =
  `items` | `abilities` | `ranking`, sin detalle = Heroes),
  `site/src/areaFiles.ts` (`dle: "src/DeadlockDle.tsx"`),
  `site/src/DeadlockArea.tsx` (rama `"dle"`), `site/src/deadlockCopy.ts`
  (pestaña "Deadlockdle" EN/ES y bloque `dle` con todos los textos),
  `site/src/seoCopy.ts` ("Deadlockdle — Daily Deadlock Guessing Game", EN y
  ES), `site/scripts/perf.mjs` (`/en/deadlock/dle`, `/en/deadlock/dle/ranking`)
- Crear: `site/src/DeadlockDle.tsx` (cabecera con número y cuenta regresiva,
  pestañas Heroes / Items / Abilities / Ranking), `site/src/dle/api.ts`
  (`getToday`, `postGuess`, `getRanking`, `getMe`; lanzan `DleOffline` ante red
  caída o 5xx), `site/src/dle/local.ts` (partida sin cuenta en
  `localStorage`, clave `vg_dle_<mode>_<date>`, con `try/catch`),
  `site/src/dle/DleBoard.tsx`, `site/src/dle/DleSearch.tsx` (autocompletar
  con nombres y arte de `/deadlock/dle-pool.json`, imágenes `w96`, flechas y
  Enter, sin repetidos), `site/src/dle/DleResult.tsx`, `site/src/dle/share.ts`,
  `site/src/styles/deadlock-dle.css`
- Test: `site/src/dle/local.test.ts`, `site/src/dle/share.test.ts`,
  `site/src/dle/DleBoard.test.tsx`, y en los tests de rutas:
  `/en/deadlock/dle/items` ↔ `{ dlSection: "dle", detail: "items" }`,
  `/es/deadlock/dle`.

Se ve como `clasico-heroes.png` / `clasico-items.png`: pistas arriba del
buscador, filas nuevas arriba, al costado el top 7 del modo y tus números. En
el teléfono el costado va abajo y las filas se desplazan de costado **dentro**
de su caja.

- [ ] **Paso 1: tests que fallan:** rutas; `local.ts` guarda y lee filas y
  sin `localStorage` no rompe; `shareText({ number: 12, mode: "heroes", rows })`
  = `"Deadlockdle #12 · Heroes · 4 guesses\n🟨🟩🟥🟥🟨🟨\n…\nvestigo.gg/deadlock/dle"`
  (una línea por intento, sin nombres); `DleBoard` con `getToday` que lanza
  `DleOffline` muestra "Couldn't reach the game server, try again" y conserva
  las filas; el prerender dibuja buscador y columnas vacías sin llamar a la
  API.
- [ ] **Paso 2:** fallan. **Paso 3:** implementar. Sin sesión, al terminar:
  "Sign in with Steam to enter the ranking" (`/api/auth/steam?return=…`).
- [ ] **Paso 4:** `npm test --prefix site`, `npx tsc -b`; capturas a 1280 y
  375 px sin scroll horizontal de página, zoom a títulos y cifras.
- [ ] **Paso 5:** commit `feat(dle): pestaña Deadlockdle con el tablero`.

### Tarea 7: Ranking y PR

**Archivos:**
- Crear: `site/src/dle/DleRanking.tsx`
- Modificar: `site/src/styles/deadlock-dle.css`; el sitemap de Deadlock si
  no toma solas las 4 direcciones de `/dle`

Como `ranking.png`, con **tres** columnas (Heroes, Items, Abilities; una
abajo de otra en el teléfono): top 10, jugadores de hoy y tu fila ("not
played" si no jugaste).

- [ ] **Paso 1:** test: con un `getRanking` de ejemplo dibuja 3 columnas en
  ese orden y "not played" donde `me` es `null`. **Paso 2:** falla.
  **Paso 3:** implementar. **Paso 4:** pasa.
- [ ] **Paso 5:** `npm run build --prefix site` (anotar pico de RAM y
  tiempo en el diseño), `npm run preview`, `npm run perf` → en presupuesto.
- [ ] **Paso 6:** ZoTaD carga `DLE_SECRET` (`wrangler secret put DLE_SECRET`
  en la terminal).
- [ ] **Paso 7:** prueba en local con la cuenta de ZoTaD (él toca "Sign In"
  en Steam): Heroes hasta acertar, su fila en Ranking, recargar y ver la
  partida terminada; Items sin cuenta en otra ventana.
- [ ] **Paso 8:** push y PR `Deadlockdle (beta)` con 2–4 viñetas. Al
  fusionar, `deploy-api.yml` publica el Worker y `deploy.yml` el sitio.
