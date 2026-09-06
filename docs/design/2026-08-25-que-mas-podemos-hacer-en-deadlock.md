# Qué más podemos hacer en Deadlock, y qué no

**Fecha:** 2026-08-25
**Estado:** investigación, sin implementar. Pedido de ZoTaD: qué meter en el sitio
—sobre todo en los perfiles— mirando a la competencia.

Investigado con búsquedas web sobre los seis competidores activos y **verificado
contra la API real**: se bajó el OpenAPI completo de deadlock-api (368 KB, 118
rutas) y se midieron en vivo los endpoints candidatos contra la cuenta de prueba
`107253473` el 2026-08-25. Statlocker **no se puede scrapear**: bloquea agentes
con un rate limit explícito (quedó la prueba en `pp_statlocker.json`, borrable).

## La competencia, hoy

| Sitio | Lo que su perfil tiene y el nuestro no |
|---|---|
| **Statlocker** | "Performance rank" estimado sobre tus últimas 100 partidas, winrate por héroe, **winrate con tus amigos**, tendencias en el tiempo, sistema de premios/logros con cuenta |
| **Tracklock** | "NekoScore" (MMR estimado propio), comparación contra benchmarks de tu rango, overlay in-game (timers, medidor de daño) |
| **Deadlock Labs** | Desglose de fase de líneas, "role grade", **percentil global en cada métrica**, refresco cada 5 min, app móvil |
| **DeadlockTracker** | Curva de ELO en el tiempo |
| **deadlockstats.gg** | Nada distintivo en perfil; es el meta de FACEIT |
| **LockBlaze** | Cobertura de esports: torneos, brackets, equipos |

El patrón: en héroes/ítems todos publican lo mismo (winrate y pickrate — ya lo
sabíamos), pero **en perfiles la diferenciación real son cuatro cosas**: un número
de skill inventado (grade/NekoScore), percentiles, tus amigos, y tu progresión en
el tiempo. Las dos primeras van contra nuestra línea (números opacos sin
explicación — el informe de partida existe justamente para no ser eso). Las otras
dos las podemos hacer **mejor y sin backend**, porque la API las regala.

## Medido contra la API real (2026-08-25)

Cuatro endpoints de jugador que **no usamos y funcionan gratis**, más dos que no:

- **`/v1/players/{id}/mmr-history`** — score, rango y división **por partida**.
  Medido: la cuenta de prueba trae 6 puntos desde el reset (Arconte 1 → 2).
  Es "LP en el tiempo" de Deadlock, la feature que TFT ya tiene. ⚠️ Figura
  "Deprecated" en el OpenAPI (sus reemplazos `/v1/players/mmr*` también);
  funciona hoy, pero hay que asumir que puede apagarse.
- **`/v1/players/hero-stats?account_ids={id}`** — agregados por héroe del
  jugador: winrate, KDA/min, almas/min, golpes/min, daño a objetivos… y
  **precisión y tasa de críticos** (`accuracy`, `crit_shot_rate`). Medido: 35
  héroes, ~36 KB; el Infernus de la cuenta da 24 partidas, 10 victorias,
  precisión 63,5%. Nadie más publica precisión por héroe en el perfil.
- **`/v1/players/{id}/mate-stats`** — con quién jugaste y cómo les fue:
  `matches_played`, `wins` por compañero, con `min_matches_played` y
  `same_party` como filtros. Medido: el dúo principal de la cuenta tiene
  **120 partidas juntas, 60-60**. Los nombres salen del batch
  `/v1/players/steam?account_ids=…` que ya usamos.
- **`/v1/players/{id}/enemy-stats`** — tus rivales recurrentes y el head-to-head
  contra cada uno. Misma forma que mate-stats. Medido: funciona; en la cuenta de
  prueba los que más se repiten dan 3-4 cruces.
- **`/v1/players/{id}/card` y `/account-stats`** — **HTTP 403, solo Patreon.**
  Callejón sin salida, que nadie lo vuelva a intentar.

Y el hallazgo grande del OpenAPI: **casi toda la familia `/v1/analytics/` acepta
`account_id` como filtro**. `hero-counter-stats`, `hero-synergy-stats`,
`ability-order-stats` y `player-performance-curve` pueden responder sobre *tus*
partidas — o sobre todas, que es lo que necesita la página por héroe.

## Lo que SÍ se puede, ordenado por lo que rinde dividido lo que cuesta

Para el perfil (lo pedido):

1. **Rango en el tiempo.** Un gráfico con `mmr-history`, un pedido, cliente puro.
   Precedente directo: LP en el tiempo de TFT. Único riesgo: la deprecación.
2. **Tus héroes.** Tabla por héroe con `hero-stats`: winrate, KDA, almas/min y
   precisión, ordenable como la pestaña Héroes. Es el "playstyle" de Statlocker
   pero con números que ellos no muestran. Un pedido de ~36 KB.
3. **Con quién jugás.** `mate-stats` con piso de partidas (el patrón del piso ya
   está resuelto en la ladder): compañero, partidas juntas, winrate del dúo.
   La feature estrella del perfil de Statlocker, a un pedido de distancia.
4. **Tus némesis.** `enemy-stats`: contra quién te cruzás más y cómo va el
   head-to-head. **Nadie de la lista lo publica así.** Mismo costo que la 3.
5. **Tus counters personales.** `hero-counter-stats?account_id=…`: qué héroes te
   ganan *a vos* — la feature 3 del roadmap original del 2026-08-02, que seguía
   sin camino de datos. Ahora lo tiene. Necesita piso de muestra para no decir
   ruido (20 partidas contra un héroe es poco; medirlo antes de prometer).
6. **El perfil agregado con consejos** ("qué te está costando en tus últimas
   20") — ya diseñado como continuación del informe; sigue siendo el diferencial
   editorial contra el *grade* de todos los demás. No necesita datos nuevos.

Para el resto del sitio:

7. **La página por héroe, pasos 2 y 3** (del diseño del 2026-08-13): counters y
   sinergias del héroe ya **no necesitan medición propia en el pipeline** —
   `hero-counter-stats`, `hero-synergy-stats` y `lane-matchup-stats` existen con
   filtros de banda (`min/max_average_badge`), que es nuestra unidad. Habría que
   validar su metodología contra la nuestra antes de publicarlos como propios.
8. **Orden de habilidades por héroe.** `ability-order-stats`: qué se sube primero
   y con qué winrate. Complemento natural de la build de ítems que ya publicamos;
   ningún competidor chico lo tiene bien.
9. **Baneos.** `hero-ban-stats`: tasa de baneo por héroe. Columna nueva para la
   pestaña Héroes o señal editorial para la tier list ("el más baneado no es el
   que más gana"). Barato: es un agregado global más del pipeline.
10. **Percentiles.** `player-performance-curve` da la curva de la población por
    métrica: permite "tu daño/min con Seven está en el top 18% de tu banda", que
    es lo de Deadlock Labs pero **dicho contra tu banda y explicado**. Más caro:
    hay que decidir qué métricas y validar la curva primero.

## Lo que NO, con el porqué

- **Un número de skill propio** (grade, NekoScore, performance rank). Es la
  antítesis de la línea del sitio; nuestra respuesta ya existe y es la nota
  explicada del informe.
- **Overlay / app de escritorio / app móvil.** Otra liga de producto e infra;
  el sitio es estático a propósito.
- **Premios, logros, cuentas.** Todo el sistema de awards de Statlocker requiere
  login y persistencia server-side. El login de Steam sigue fuera del roadmap.
- **Feed de partidas en vivo / espectador.** `matches/active` existe, pero es
  infra de polling continuo para una feature de curiosidad.
- **Esports a lo LockBlaze.** Cobertura manual, editorial ajeno a "mediciones
  propias".
- **Scrapear Statlocker para compararse.** Bloqueado y avisado por ellos.

## Implementado el 2026-08-25 (sólo en local, sin publicar)

Se hicieron las tres de perfil que comparten camino de datos: **2 (tus héroes)**,
**3 (con quién jugás)** y **4 (tus némesis)**. Tres pedidos nuevos por perfil, y
**cero al cambiar de pestaña de modo** (verificado en vivo instrumentando
`fetch`).

### El hallazgo que definió el diseño de compañeros y rivales

**El 100% de los `match_id` que devuelven `mate-stats` y `enemy-stats` está
dentro del historial que la página ya baja** (medido: 383/383 y 404/404 sobre la
cuenta `107253473`, de 488 partidas). Y recalcular las victorias desde nuestro
propio historial **da exactamente los mismos números que la API**: 60 de 120 con
el dúo principal, 2 de 4 con el rival más repetido.

Eso permite algo que parecía imposible sin pedidos extra: **las dos tarjetas
siguen al selector de modo**, cruzando en memoria contra las filas ya filtradas.
Las victorias se **recalculan y no se copian** del crudo — copiarlas haría que un
dúo de 60-60 de siempre dijera "60-60" también dentro de la pestaña de
clasificatorias, donde jugaron tres partidas.

**Se pide con piso y no entero**, y la diferencia son dos órdenes de magnitud:

| | sin piso | `min_matches_played=2` |
|---|---|---|
| Compañeros | 128 KB · 1.774 | **11 KB · 125** |
| Rivales | 160 KB · 2.204 | **16 KB · 191** |

Casi todo lo que saca el piso es matchmaking: gente cruzada una sola vez.

`same_party=true` se probó y **se descartó**: devuelve **una sola fila** en la
cuenta medida (el dúo de 120). Detecta premades de verdad, pero es demasiado
escaso para sostener una tarjeta.

### Tus héroes

Sale de `players/hero-stats` (un pedido, ~36 KB, 35 héroes). Cobertura medida:
**precisión 35/35, críticos 34/35**, el resto completo.

**No sigue al selector de modo, y la tarjeta lo dice en su bajada** — es la
carrera entera y viene de otra fuente. Es la misma solución que la columna de
maestría de la pestaña de héroes: cuando una cifra mide otra ventana que las de
al lado, se dice ahí y no en una nota al pie. Sin esa frase, un winrate de
carrera debajo de un perfil filtrado a clasificatorias se lee como el de esa
pestaña, que es la clase de contradicción que ya apareció dos veces en el
proyecto.

La columna de **precisión** es la que justifica la tarjeta: winrate por héroe lo
publican los ocho sitios del género; precisión por héroe en el perfil, ninguno.

### Archivos

`deadlockPeers.ts` + `DeadlockPeerCard.tsx` + `test/deadlockPeers.test.ts` (6
pruebas) · `deadlockHeroStats.ts` + `DeadlockCareerHeroes.tsx` +
`test/deadlockHeroStats.test.ts` (7 pruebas) · copia en los dos idiomas y estilos
al pie de `codex.css`.

**Ojo con el nombre de los archivos**: en Windows `DeadlockPeers.tsx` y
`deadlockPeers.ts` son el mismo archivo para TypeScript (difieren sólo en
mayúsculas) y el build no compila. Por eso el componente se llama
`DeadlockPeerCard`, no `DeadlockPeers`.

### Falla preexistente, ajena a esto

`test/deadlock.test.ts:146` falla desde antes: el héroe 20 trae `skillGap === 0`
en el snapshot del 2026-08-23, y el test prohíbe el cero exacto (un cero diría
"no se movió"; la ausencia dice "no sé"). Es del pipeline, no de la UI.

## Lo que hay que aceptar

Statlocker y Tracklock tienen apps y años de cabeza en features de cuenta; no se
les gana en gamificación ni en overlay. Se les gana donde ya veníamos ganando:
leyendo mejor los datos que todos tienen gratis. Las cuatro primeras del ranking
de arriba son **cuatro pedidos GET sin backend, sin pipeline y sin login**, sobre
una página que ya existe — el mismo patrón "el dato estaba y nadie lo leía" que
ya pagó dos veces en TFT y una en el historial del perfil.
