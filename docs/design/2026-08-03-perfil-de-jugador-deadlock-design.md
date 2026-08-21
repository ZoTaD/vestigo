# Perfil de jugador de Deadlock — feature 1 (buscador sin login)

- **Fecha:** 2026-08-03
- **Objetivo:** buscar un jugador de Deadlock por nombre de Steam y ver su
  historial de partidas. Es la primera de las cinco features acordadas el
  2026-08-02 para competir de frente con Statlocker (ver memoria
  `vestigo-perfil-de-jugador`) — el resto (qué te costó la partida, counters
  personales, mapa de calor, rankings) se construye encima de esta base en
  entregas futuras.

---

## 1. Decisiones

| Decisión | Elegido | Por qué |
|---|---|---|
| Cómo llega el navegador a los datos | **Directo desde el navegador a `api.deadlock-api.com`**, sin backend propio | Verificado en vivo: `access-control-allow-origin: *` en `steam-search` y `match-history`, y **0 de 108 endpoints exigen key** (ver memoria `deadlock-data-sources`). El Worker de TFT existe *solo* porque la key de Riot no puede viajar al cliente; acá no hay ese problema. Además cada visitante pega con su propia IP, así que no concentramos el rate limit compartido bajo una sola IP nuestra. |
| Desambiguar nombre de Steam | **Lista de candidatos para elegir** | `steam-search` rankea por similitud de string + actividad y puede devolver varios jugadores distintos con el mismo nombre; tomar el primero a ciegas puede llevar al jugador equivocado. |
| Cuánto historial se muestra | **Últimas 50 partidas** | `match-history` no pagina (verificado: `limit` no es un parámetro válido del endpoint, y probar `?limit=5` igual devolvió las 449 partidas completas de la cuenta de prueba) — siempre trae **todo** el historial de la cuenta, que puede ser de 20 a miles de partidas. Se trae completo en una sola llamada pero se muestran solo las 50 más recientes; no hay scroll infinito en esta versión. |
| Login de Steam | **Fuera de alcance** | Acordado en la memoria del roadmap: el login solo agrega "guardar tu cuenta", no es camino crítico para que la búsqueda funcione. |
| Persistencia server-side | **Ninguna** | La API sirve el historial a pedido; no hace falta guardar ni cachear una sola partida para esta feature. |

---

## 2. Arquitectura

```
games/tft/ui/src/
├─ deadlockApi.ts       ★ NUEVO — steamSearch(query), steamInfo(accountId), matchHistory(accountId)
├─ DeadlockPlayer.tsx   ★ NUEVO — búsqueda, lista de candidatos, tabla de partidas
├─ deadlockLastSearch.ts ★ NUEVO — recordar la última cuenta vista (localStorage)
├─ deadlockData.ts      (existente) — catalog.json ya se carga acá, se reusa
└─ deadlockRanksData.ts (existente) — el decodificador de badge se reusa tal cual
```

No hay pipeline nuevo, no hay tabla nueva, no hay Worker nuevo. Es la primera
página de Deadlock con datos en vivo — el resto del juego (tier list, ítems,
escalera, maestría, parches) sigue siendo 100% estático, publicado por el
pipeline batch.

**Flujo:** usuario escribe un nombre → `deadlockApi.ts` llama a
`GET /v1/players/steam-search?search_query=...` → se muestra la lista de
candidatos → click navega a `/deadlock/player/<account_id>` (segmento de
path, no query string — es la misma convención que ya usa `route.ts` para
las demás páginas con deep link, como `/tft/meta/<comp>`).

**La página de perfil siempre hace las mismas dos llamadas, sin importar si
se llegó por click o por URL directa** (deep link compartido): `GET
/v1/players/steam?account_ids={id}` (nombre, avatar, país — verificado que
funciona por `account_id` solo, sin pasar por la búsqueda) y `GET
/v1/players/{account_id}/match-history`. Cada partida se cruza con
`catalog.json` (nombre/imagen de héroe, nombre/imagen de rango) para pintar
la tabla. Un solo camino de datos para los dos puntos de entrada, en vez de
que el deep link dependa de datos que solo trae la búsqueda.

---

## 3. Hallazgos verificados contra la API real (2026-08-03)

Todo lo de esta sección se midió pegándole en vivo a `api.deadlock-api.com`,
no se asumió de la documentación.

### 3.1 CORS está abierto de verdad

`curl` con `Origin: https://vestigo.gg` contra `steam-search` y
`match-history` devuelve `access-control-allow-origin: *` en los dos. El
navegador puede llamar directo sin preflight problemático (son GET simples,
sin headers custom ni credenciales).

### 3.2 `steam-search` — forma de la respuesta

Devuelve un array de hasta 100 candidatos (parámetro `limit`, tope 1000),
rankeados por `jaro_winkler(nombre, query) + peso * log1p(partidas_30d)`. Cada
uno trae `account_id`, `personaname`, `avatar`/`avatarmedium`/`avatarfull`,
`profileurl`, `countrycode`, `last_updated` y una lista de `friends` (no se
usa; es de Steam y viene igual). Por defecto filtra cuentas con menos de 5
partidas en 30 días — bien para esta feature, evita mostrar perfiles muertos.

### 3.3 `match-history` — forma de la respuesta y el enum de resultado

**No pagina.** El parámetro documentado es solo `force_refetch` (booleano,
fuerza traer de Steam en vez de la caché — con rate limit estricto, no se usa
acá). Probado con `?limit=5`: devolvió las 449 partidas completas igual, así
que el campo se ignora del lado del servidor.

Cada partida trae `hero_id`, `hero_level`, `start_time`, `game_mode`,
`match_mode`, `player_team`, K/D/A, `denies`, `net_worth`, `last_hits`,
`match_duration_s`, y del lado ranked: `ranked_delta`, `ranked_display_badge`,
`ranked_calibration_match`, `ranked_used_demotion_protection` (los cuatro
`null` si la partida no fue ranked).

**El resultado sale directo y documentado**: `player_match_outcome` — *"0 =
invalid, 1 = win, 2 = loss, 3 = penalized, 4 = penalized party, 5 = not
scored"*. Se usa este campo tal cual, no hace falta derivarlo de
`player_team` + `match_result`.

**`game_mode` se decodificó cruzando duración contra la cuenta de prueba**
(449 partidas): `game_mode=1` promedia 33,6 min (Normal), `game_mode=4`
promedia 13,9 min (Street Brawl) — coincide exactamente con lo ya medido en
`deadlock-data-sources` (Street Brawl ronda los 14 min). Los otros dos valores
que aparecieron (`game_mode`/`match_mode` combinaciones minoritarias, todas de
partidas de prueba de 2024, antes de que Deadlock tuviera su forma actual) no
importan para el producto de hoy.

**`match_mode` NO se terminó de decodificar** — ver sección 6.

### 3.4 El badge de rango reusa el decodificador que ya existe

`ranked_display_badge` sigue el mismo esquema que `deadlockRanksData.ts` ya
sabe leer: `tier = floor(badge / 10)`, `subtier = badge % 10` (arranca en 1).
`catalog.json.ranks[tier]` da nombre bilingüe, imagen grande y el array de
íconos por subtier. No hay nada nuevo que escribir acá, solo reusar.

---

## 4. Contenido de la página

**Buscador** (arriba): input de texto + botón, igual look que el buscador de
TFT. Al enviar, lista de candidatos: avatar, nombre, país, partidas último
mes. Click navega al perfil.

**Perfil** (`/deadlock/player/<account_id>`): cabecera con avatar/nombre
del jugador (de `GET /v1/players/steam?account_ids={id}`, llamada siempre,
sin importar el punto de entrada — ver §2) y tabla de las **50 partidas más
recientes**, una fila por partida:

| Columna | Fuente |
|---|---|
| Héroe (imagen + nombre) | `hero_id` → `catalog.json.heroes` |
| Resultado | `player_match_outcome` (1/2 → victoria/derrota; 3-5 se muestran como "no puntuada", nunca forzadas a W/L) |
| K/D/A | `player_kills`/`player_deaths`/`player_assists` |
| Denies / Last hits | directo |
| Patrimonio (net worth) | `net_worth` |
| Duración | `match_duration_s` formateado `mm:ss` |
| Modo | Normal / Street Brawl por `game_mode`; se muestra "Ranked" cuando `ranked_display_badge` no es null, independientemente de `match_mode` (ver §6) |
| Rango | solo si `ranked_display_badge` no es null; ícono + nombre vía el decodificador existente |
| Fecha | `start_time`, formato relativo ("hace 2 días") |

Deep link compartible por `account_id` en la URL. Última cuenta vista se
guarda en `localStorage` (`vestigo.deadlock.lastPlayer`), mismo patrón que
`lastSearch.ts` de TFT.

---

## 5. Manejo de errores

Tres fallos con mensaje propio, ninguno genérico (mismo criterio que la Fase
3 de TFT):

- **Sin candidatos** (`steam-search` devuelve `[]`) — "no encontramos a nadie
  con ese nombre", no un error.
- **Cuenta sin partidas** (`match-history` devuelve `[]`) — "esta cuenta no
  tiene partidas registradas todavía", distinto del caso anterior.
- **`deadlock-api.com` no responde o devuelve 429/5xx** — mensaje tipado
  ("el servicio de datos de Deadlock no responde ahora mismo"), con la
  cabecera `ratelimit-*` leída si viene, en vez de un genérico "algo salió
  mal".

---

## 6. Verificación pendiente para la implementación

**El valor numérico de `match_mode` que corresponde a "Ranked" no se pudo
confirmar empíricamente todavía.** La cuenta usada para probar (449 partidas)
no jugó ni una sola partida ranked desde que la cola abrió el 30/7 hasta
hoy — los únicos dos valores de `match_mode` distintos de 1 que aparecen son
de partidas de prueba de noviembre y septiembre de 2024, de mucho antes de
que existiera la cola rankeada.

**No bloquea el diseño** porque la señal de "esta partida fue ranked" que se
usa en la tabla es `ranked_display_badge != null`, que está documentada y no
depende de adivinar el enum. Antes de implementar el filtro por modo (si se
agrega un toggle "solo ranked" más adelante) hay que confirmar el número
contra una cuenta que sí tenga partidas ranked recientes — por ejemplo,
alguien del leaderboard actual.

---

## 7. Fuera de alcance

- Login de Steam / guardar cuenta favorita.
- "¿Qué te costó esta partida?" (feature 2 del roadmap — reusa `matching.ts`
  y `mechanism.ts`, que corren sobre SQL/DuckDB, no en el navegador; queda
  para su propio diseño).
- Counters personales, mapa de calor, rankings y one-tricks (features 3-5).
- Caché o persistencia server-side de partidas ajenas.
- Scroll infinito o paginado más allá de las 50 partidas recientes.
