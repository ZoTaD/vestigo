# Deadlockdle (2026-11-04)

## Para qué

Un juego diario sobre Deadlock para que la gente vuelva todos los días y
compita. Es la respuesta a Statlockle (statlocker.gg/statlockle), el juego
diario de Statlocker, que se comparte mucho en X. Sale en **beta**; los premios
para los primeros se piensan después.

Lo definió ZoTaD:

- **Clásico por pistas** (como Loldle): se escribe un nombre y cada columna dice
  si esa característica coincide con la respuesta. Se probó primero un Wordle de
  letras y se descartó: los nombres tienen largos muy distintos (de 3 a 21
  letras) y el largo delataba la respuesta.
- **Tres modos**: **Heroes**, **Items** y **Abilities**. Hubo un cuarto,
  **All**, que mezclaba los tres: se sacó porque con columnas distintas por tipo
  no tiene sentido (ZoTaD, 4/11).
- La respuesta de cada modo sale **al azar cada día**, con **probabilidades que
  suben y bajan**: lo que salió hace poco casi no puede volver a salir, y la
  chance crece con los días (ver "La respuesta del día").
- **Todo automático, día a día**: nadie publica nada a mano. Ni la respuesta
  del día, ni los datos del juego, ni el Worker.
- **Los nombres van siempre en inglés**, también en `/es`. La interfaz sí se
  traduce.
- Una pestaña **Ranking** al lado de Abilities: **un ranking por modo**, los
  tres por separado (juntarlos "sería un despelote"). Se reinician cada día.
- Para entrar al ranking hay que estar logueado con Steam (el login ya está
  publicado: PR 67, `docs/plans/2026-11-04-login-steam.md`).
- Estética **A "cartel"**, la de Deadlock en el sitio. Maquetas aprobadas en
  `docs/plans/2026-11-04-deadlockdle/` (`clasico-heroes.png`,
  `clasico-items.png`, `ranking.png`).

## Qué no es (por ahora)

- No hay premios ni títulos.
- **Las trampas se resuelven en otra etapa** (ZoTaD: "eso tenemos que ver como
  solucionarlo después"). Su ejemplo: alguien que acierta al primer intento en
  3 segundos tres o cuatro días seguidos ya sabe la respuesta. Esta etapa sólo
  guarda lo necesario para detectarlo (ver "Lo que queda listo para las
  trampas").
- No hay ranking histórico ni de temporada: sólo el del día. Rachas y
  porcentaje de victorias personales sí.

## Cómo se juega

- Cada modo tiene **una respuesta por día**, igual para todos. Cambia a las
  **00:00 UTC**; arriba hay una cuenta regresiva y el número del día (`#1`…).
- Se escribe en un buscador que **autocompleta** con el arte (carta del héroe,
  ícono del objeto o de la habilidad). Sólo se aceptan nombres del pozo del
  modo, y no se puede repetir un intento.
- Cada intento agrega una fila arriba de las anteriores: el arte con el nombre y
  una casilla por columna:
  - **verde**: igual;
  - **amarilla**: cerca (números a menos del 10 %, winrate a menos de 1 punto)
    o, en las listas, comparte una parte;
  - **roja**: no;
  - **▲ / ▼** en los números: la respuesta es mayor o menor.
- **Intentos sin límite.** Se termina al acertar.
- **Pistas** que se desbloquean con los intentos (4, 6 y 8), con arte del
  juego:
  - Heroes: la carta borrosa → el ícono de una habilidad → su rol en una línea
    (`text.en.role` del kit).
  - Items: el ícono borroso → la primera línea de su texto → de qué se arma.
  - Abilities: el ícono borroso → de qué héroe es → la primera línea de su
    texto.
- Al acertar: la respuesta con su arte, un enlace a su ficha en el sitio y un
  botón **Share** que copia el resultado en cuadraditos de colores, sin
  nombres: `Deadlockdle #12 · Heroes · 4 guesses` + una línea de colores por
  intento + `vestigo.gg/deadlock/dle`.

## Las columnas

Salen de los datos que el sitio ya tiene, así se actualizan con cada parche.

**Heroes** (44, de `catalog.json` + `hero-kit.json` + la tier list del día):

| Columna | Dato | Cerca |
|---|---|---|
| Complexity | `complexity` (1–3) | — |
| Health | `stats.health` | ±10 % |
| Move speed | `stats.moveSpeed` | ±10 % |
| Clip | `stats.weapon.clip` | ±10 % |
| Gun DPS | `stats.weapon.dps` | ±10 % |
| Win rate | `heroes.json` del día (Phantom+) | ±1 punto |

**Items** (156, de `catalog.json` + `items-detail.json`):

| Columna | Dato | Cerca |
|---|---|---|
| Category | `slot` (Weapon / Vitality / Spirit) | — |
| Tier | `tier` (1–4) | — |
| Cost | `cost` | ±10 % |
| Kind | Active si tiene sección `active`, si no Passive | — |
| Upgrade of | si tiene `upgradesFrom` | — |
| Gives | `types` (daño espiritual, curación…) | comparte alguno |

**Abilities** (176, de `hero-kit/*.json`, *mis columnas*: no estaban en la
maqueta):

| Columna | Dato | Cerca |
|---|---|---|
| Hero | de quién es | — |
| Slot | `slot` (1–4) | — |
| Ultimate | `ultimate` | — |
| Cooldown | `cooldown.value` | ±10 % |
| Effects | los `attr` del texto (Slow, Stun, SpiritDamage…) | comparte alguno |

**El pozo se arma solo.** El build del sitio genera
`/deadlock/dle-pool.json` (los tres pozos con sus columnas) desde
`games/deadlock/data`, igual que el resto de los datos. Como el sitio se
publica todos los días con la tier list, el pozo queda al día solo: héroes y
objetos nuevos, stats de un parche y el winrate del día. El Worker lo lee de
`https://vestigo.gg/deadlock/dle-pool.json` (con caché de una hora). Los datos
del pozo son públicos —son los del juego—; lo secreto es cuál es la respuesta.

## La respuesta del día

- La elige el **Worker**, nunca la página: si estuviera en el JS, cualquiera la
  vería con F12.
- **Sola, a las 00:00 UTC**: un Cron Trigger del Worker elige las tres
  respuestas del día y las guarda en D1, con todas sus columnas congeladas. Si
  el cron fallara, la primera visita del día la elige igual.
- **Al azar con memoria.** Cada candidato tiene un peso según los días desde
  la última vez que salió en ese modo:
  `peso = min(1, días / ventana)²`, con `ventana` = la mitad del pozo del modo
  (22 días en Heroes, 78 en Items, 88 en Abilities). Lo que nunca salió pesa 1.
  Algo que salió ayer pesa ~0,002 en Heroes (casi imposible), a la semana
  ~0,1 y a la ventana vuelve a pesar lo mismo que todos. Así nada sale dos o
  tres días seguidos, y todo termina saliendo.
- El azar sale de HMAC-SHA256(`DLE_SECRET`, `fecha|modo`): nadie puede
  calcular la respuesta de mañana.
- El número del día (`#1`, `#2`…) cuenta los días desde el lanzamiento.

## El ranking

- Un ranking **por modo y por día**. Orden: **menos intentos**; si empatan,
  **menos tiempo**; si empatan, quien terminó antes.
- Entran sólo los que **acertaron** y estaban **logueados al empezar**. Sin
  cuenta se juega igual; al final aparece "Sign in with Steam to enter the
  ranking". *Mi decisión*: una partida empezada sin cuenta no se suma después,
  porque su tiempo no lo midió el servidor.
- La pestaña **Ranking** muestra los tres modos lado a lado (en el teléfono,
  uno abajo del otro): top 10, cuántos jugaron hoy y tu fila ("not played" si
  no jugaste ese modo).
- Al lado del tablero de cada modo: top 7 de ese modo y tus números (puesto de
  hoy, racha, porcentaje de victorias).
- Nombre y foto salen de la tabla `users` del login.

## Cómo está hecho

- **Backend**: el Worker `vestigo-api` y la D1 del login. Endpoints nuevos:
  - `GET /api/dle/:mode/today` → número del día, intentos ya hechos con sus
    colores, pistas desbloqueadas y si terminó. Con sesión, el primer intento
    crea la partida y **ahí arranca el reloj**.
  - `POST /api/dle/:mode/guess` `{ name }` → la fila de colores. Controla que
    el nombre esté en el pozo y no esté repetido. Al acertar devuelve la
    respuesta y su arte.
  - `GET /api/dle/ranking` → los tres top 10 de hoy y, con sesión, tu fila
    en cada uno.
  - `GET /api/dle/me` → racha y porcentaje por modo.
- **Sin cuenta**: la partida vive en el navegador (`localStorage`) con las
  filas que devolvió el servidor; el servidor no la guarda, pero igual compara
  él, así la respuesta nunca está en la página.
- **Tablas nuevas** (D1):
  - `dle_days(date, mode, answer_id, answer_json)`.
  - `dle_plays(steam_id, date, mode, started_at, finished_at, guesses, solved)`;
    `started_at` es la hora del primer intento.
  - `dle_guesses(steam_id, date, mode, n, answer_id, at)`: cada intento con su
    hora.
- **Frontend**: una pestaña nueva de Deadlock, `dle`, en `/en/deadlock/dle`
  (`/dle` abre Heroes; `/dle/items`, `/dle/abilities`, `/dle/ranking`). Se suma a `route.ts` y a `areaFiles.ts`; nada en el chunk de
  entrada. El arte ya está en `public/deadlock/game`.
- **Rendimiento**: la página entra en `perf.mjs` (`PAGES`). Las filas son
  pocas; no hace falta `LazyRows`. Imágenes con tamaño fijo.
- **SEO**: título "Deadlockdle — Daily Deadlock Guessing Game", en el sitemap
  de Deadlock. El prerender dibuja el tablero vacío.
- **Límites**: el Worker frena a más de 30 intentos por minuto por cuenta o
  por IP (Workers Rate Limiting).

## Reglas finas (decididas por mí tras la revisión; ZoTaD las puede cambiar)

- **El reloj arranca con el primer intento**, no al abrir la página, y no se
  pausa. Así nadie pierde puestos por abrir la pestaña y volver más tarde, y
  el primer intento es a ciegas igual. La partida logueada se retoma en
  cualquier dispositivo (vive en D1).
- **Ids** `hero:<id>`, `item:<id>`, `ability:<id>`.
- **Listas** (Gives, Effects): verde si son iguales, amarilla si comparten al
  menos uno, roja si no comparten nada. **Valores que faltan** (10 habilidades
  sin cooldown, 28 objetos sin `types`, un héroe sin winrate) se muestran
  como "—" y cuentan como un valor más: "—" contra "—" es verde.
- **Winrate**: la respuesta del día queda congelada a las 00:00 UTC; los
  intentos usan el pozo publicado. Si el sitio se publica a mitad del día, el
  winrate de un intento puede diferir un poco del congelado: se acepta en la
  beta.
- **Loguearse a mitad de una partida sin cuenta**: la partida sigue en el
  navegador y no entra al ranking ese día; desde el día siguiente juega con la
  cuenta.
- **Fuerza bruta**: con intentos sin límite, probar todos los nombres hunde el
  puesto, así que no da ventaja. El límite de 30 por minuto sólo frena bots.
- **Publicar el Worker**: una Action (`deploy-api.yml`) lo publica sola
  cuando cambia `api/**` en `main`, con un token de Cloudflare guardado como
  secreto del repo. Los datos no necesitan publicar el Worker: van con el
  sitio.

## Lo que queda listo para las trampas

- El tiempo lo mide el servidor: desde el primer intento hasta el que acierta.
- Cada intento queda con su hora en `dle_guesses`.
- Con eso se puede, después, marcar o sacar del ranking a quien acierta al
  primer intento en pocos segundos varios días seguidos, sin cambiar tablas.

## Pasos

1. El pozo en el build del sitio, las tablas nuevas y la lógica pura
   (comparar columnas, elegir el día con pesos, ordenar el ranking) con tests.
2. Endpoints y cron en el Worker; la Action que lo publica. `DLE_SECRET` y el
   token de Cloudflare los carga ZoTaD.
3. La pestaña en el sitio: buscador, filas, pistas, final y Share.
4. La pestaña Ranking.
5. Probar en local con la cuenta de ZoTaD, `npm run perf`, PR.
