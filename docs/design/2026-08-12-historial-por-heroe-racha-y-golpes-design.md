# Historial por héroe, racha y forma, y últimos golpes: las tres que no cuestan un pedido

**Fecha:** 2026-08-12
**Estado:** diseñado, sin implementar
**Pedido de ZoTaD**, en el orden que acordó el 2026-08-11 mirando a Statlocker y
Dotabuff. Las tres salen del historial que la página **ya baja**, así que no
suman ni una llamada a deadlock-api.

**Decidido sin consultar** (ZoTaD pidió expresamente seguir sin preguntas el
2026-08-12). Los supuestos que tomé solo están marcados **[asumido]** y son lo
primero a revisar si algo no cierra.

Todo número con "medido" adelante sale de pegarle a la API en vivo contra la
cuenta real `107253473` (ZoTaD, AR) el 2026-08-12, no de la documentación.

## Lo que el historial trae y hoy se tira

`players/{id}/match-history` devuelve **475 filas en un solo pedido**, y
`fetchHistory` las corta en 40 (`deadlockMatch.ts:203`). Las otras 435 se bajan y
se descartan. Además, `RawHistory` mapea 11 de los 28 campos que la respuesta
trae. Entre los que ignora están los tres que este trabajo necesita:

| Campo | Cobertura medida sobre 475 filas |
|---|---|
| `last_hits` | **99,8%** distinto de cero · mediana 174, p25 123, p75 216 |
| `denies` | **82,9%** distinto de cero · mediana 4, p25 2, p75 7 |
| `match_mode` | 1 → 428 · 4 → 46 · 3 → 1 |

También sin usar y sin necesidad todavía: `hero_level`, `team_abandoned`,
`abandoned_time_s`, `player_match_outcome`, `ranked_used_demotion_protection`.

**Dos campos están muertos y hay que dejar de mirarlos:** `ranked_delta` y
`ranked_display_badge` dan **0 en las 475 filas**. El rango sale de
`players/{id}/rank`, como ya dice la memoria; el `badge` de `HistoryRow` es un
respaldo que nunca se dispara.

## El hallazgo que decide el diseño: "sólo ranked" no se puede todavía

El resto del sitio mide **sólo Ranked** — la tier list, las builds y el informe
usan `PLAYED_MODE = 'Ranked'`. Lo natural sería que la racha también. Medido, hoy
no se puede:

| Desde la apertura de ranked (2026-07-30 16:19 UTC) | Partidas |
|---|---|
| Totales en el historial | **21** |
| De ésas, `match_mode = 4` | **6 — las seis de calibración** |
| `match_mode = 4` **anteriores** al reset | 40, la más nueva hace **632 días** |

**El modo 4 existía hace dos años, se dejó de usar y volvió hace trece días.** Por
eso "las últimas 20 ranked" abarcan **658 días** y mezclan dos épocas del juego:
un corte ingenuo por `match_mode` no da "reciente", da historia.

**[asumido] `match_mode = 4` es Ranked.** El pipeline compara contra la cadena
`'Ranked'` del snapshot y la API en vivo devuelve enteros; **ese mapeo no está
escrito en ningún lado del repo**. Lo deduje de que el 4 es el único modo donde
aparece `ranked_calibration_match`, y de que las 6 posteriores al reset lo traen
todas. Si algún día el corte se ve raro, mirar acá primero.

### La salida: el mismo mecanismo que ya usa la tier list

La tier list quiere Fantasma+, no hay muestra, así que publica Arconte/Oráculo
**diciéndolo** y se apaga sola cuando la muestra llega (`ON_FALLBACK_BAND`).
Se copia esa forma:

- Si hay **10 o más** partidas `match_mode = 4` posteriores al reset, la racha y
  la forma se miden sobre ésas.
- Si no, se miden **sobre todas** y la página lo dice en una línea.
- **No hay bandera que mantener**: el corte se recalcula en cada carga y se apaga
  solo el día que ranked junte partidas.

**[asumido] El umbral es 10.** No sale de una medición —no hay con qué medirlo
todavía— sino de que 10 es la mitad de la ventana de 20 y el mínimo con el que una
racha no es anécdota. Es un número a revisar cuando haya cuentas con ranked de
verdad.

**Las partidas de modo 4 anteriores al reset NO cuentan nunca**, ni en el camino
de respaldo: hay 632 días de hueco entre ellas y las de ahora.

## Feature 1 — Filtrar el historial por héroe

**Los héroes más jugados ya se calculan** (`summarize().heroes`) y ya se dibujan
en la ficha del perfil. Se vuelven botones: apretar uno filtra la lista, apretarlo
de nuevo la suelta.

**El filtro es del cliente y no pide nada.** Medido: la cuenta de prueba tiene
**35 héroes distintos** en 475 partidas.

**`fetchHistory` deja de cortar en 40.** Hoy baja 475 filas y tira 435, así que
filtrar por un héroe poco jugado devolvía dos partidas de las cuarenta visibles en
vez de las veinte que hay. Se conserva el tope de **40 filas dibujadas**, que
ahora es un tope de presentación y no de datos: el filtro elige sobre las 475 y se
muestran las 40 más recientes de lo elegido.

**El resumen de arriba sigue al filtro.** Con un héroe elegido, el winrate, el KDA
y las almas describen *ese* héroe, que es para lo que uno filtra. Sin filtro
describe las 40 más recientes, como hoy. La ficha dice siempre sobre cuántas
partidas está hablando, así que el número no cambia de significado en silencio.

## Feature 2 — Racha y forma reciente

Un bloque nuevo en la ficha del perfil, con tres cosas:

- **La racha actual**: cuántas victorias o derrotas seguidas, contando desde la
  más reciente. Se muestra sólo con **2 o más** — "1 victoria seguida" no es una
  racha, es la última partida.
- **La forma**: el resultado de las **últimas 20** del corpus, como "12-8", más
  una tira de 20 marcas de victoria/derrota, la más reciente a la izquierda.
- **La línea del corpus**: qué se está midiendo. Con ranked suficiente,
  "20 partidas clasificatorias"; si no, la frase del respaldo.

**La ventana es de 20 partidas, no de 30 días** (decisión de ZoTaD, 2026-08-12):
una muestra fija hace comparables a dos jugadores de ritmos distintos. Medido, en
la cuenta de prueba 20 partidas son ~2 semanas (14 en 7 días, 33 en 30).

**La racha se calcula sobre el corpus, no sobre lo filtrado por héroe.** Una racha
"de Lash" salteando las partidas del medio no es una racha; es una selección.

## Feature 3 — Últimos golpes y denies

Dos columnas nuevas en cada fila del historial y dos números en el resumen, como
promedio por partida.

**Se muestran juntos y en ese orden, "golpes / denies"**, que es el par que el
jugador de este género ya lee junto.

**Los denies se muestran igual aunque sean números chicos** (mediana 4). No es lo
mismo que las etiquetas que el proyecto rechaza por ilegibles: acá no se está
interpretando nada ni poniendo un rótulo, es el dato crudo que el juego también
muestra. Lo que **no** se hace es derivar de ahí un juicio ("farmeás poco") sin
haberlo medido contra una referencia, que es la regla de siempre.

## Qué NO entra

- **`players/{id}/hero-stats`**, que sería la pestaña de héroes. Cuesta un pedido
  y es la feature siguiente del orden acordado, no ésta.
- **Cualquier consejo derivado** de golpes o denies. No hay referencia medida
  contra la que compararlos todavía.
- **Precisión y críticos** (`shots_hit` / `shots_missed`), que vienen en la
  metadata de una partida y no en el historial: son de la pantalla del informe.
- **El rango por fila del historial.** `ranked_display_badge` da 0 en las 475
  filas; la columna que hoy lo dibuja **nunca se dibuja**. Se deja como está —
  sacarla es otro trabajo y no molesta.

## Arquitectura

Todo lo nuevo que calcula vive en **`deadlockMatch.ts`**, que ya es la capa de
datos del jugador y ya tiene `summarize` con la misma forma. Tres funciones puras
nuevas, testeables sin navegador:

- `rankedCorpus(rows)` → qué filas se miden y si se cayó al respaldo.
- `streakOf(rows)` → largo y signo de la racha.
- `formOf(rows, n)` → victorias/derrotas de las últimas `n` y la tira.

`DeadlockPlayer.tsx` sólo dibuja y sostiene el estado del filtro. **El archivo ya
tiene 312 líneas**; si al terminar pasa de ~450, el bloque de racha y forma sale a
su propio componente.

## Tests

`test/deadlockMatch.test.ts` (nuevo o el que exista) sobre las tres funciones
puras, con casos que fijan lo que costó descubrir:

- Una racha de 1 **no es racha** (devuelve 0 o no se dibuja).
- El corpus **excluye las de modo 4 anteriores al reset**, aunque sean modo 4.
- Con menos de 10 ranked, `rankedCorpus` devuelve **todas** y marca el respaldo.
- Con 10 o más, devuelve **sólo las ranked** y no marca nada.
- `formOf` sobre menos de `n` partidas usa las que hay y lo informa, sin rellenar.
- `summarize` sigue dando lo mismo que hoy sobre las mismas filas (regresión).

## Riesgos

- **El umbral de 10 y el mapeo `match_mode = 4` son los dos supuestos sin medir.**
  Los dos se verán mal recién cuando haya cuentas con ranked de verdad.
- **Subir el corte de `fetchHistory` de 40 a todo** hace que `summarize` pase de
  40 a 475 filas si no se acota. El resumen tiene que seguir describiendo una
  ventana reciente o el winrate del perfil pasa a ser el de dos años.
- **475 filas dibujadas serían una página enorme.** El tope de 40 visibles no es
  opcional.
- El historial trae partidas de hace **713 días**: cualquier cosa que diga
  "reciente" tiene que acotar explícitamente.
