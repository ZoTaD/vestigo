# Ladder de jugadores de Deadlock, por héroe y por rango

**Fecha:** 2026-08-12
**Estado:** diseñado, sin implementar
**Pedido de ZoTaD**: una tabla de jugadores "por rango y por héroe, así pueden
ver si son el mejor Victor de América Latina".

Todo número con "medido" adelante sale de pegarle a la API en vivo el 2026-08-12.

## La decisión que los datos forzaron: hay región O hay rango, no las dos

deadlock-api tiene **dos** fuentes de ranking y ninguna hace las dos cosas:

| | `/v1/leaderboard/{region}` | `/v1/analytics/scoreboards/players` |
|---|---|---|
| Región | **sí**, 5 | **no** — con `region` devuelve HTTP 500 |
| Por héroe | sí (`/{region}/{hero_id}`) | sí (`hero_id`) |
| Por rango | **no**, no trae insignia | **sí** (`min/max_average_badge`) |
| Identidad | `possible_account_ids` (array difuso) | **`account_id` real** |
| Por qué está arriba | posición opaca de Valve | **~60 métricas**, incl. `winrate` |
| Muestra por fila | ninguna | **`matches`** |

**Medido, y es lo que mató a la regional:** Sudamérica tiene **134 entradas en
total**, y por héroe da entre **0 y 6** — Victor da **1** (THESUPERIORGOONER) y
McGinnis da **0**. La ladder regional que motivó el pedido es, en nuestra región,
una lista de un renglón. Además **un tercio de los nombres no resuelve a una sola
cuenta**: el que se llama "n" trae 178 candidatos.

**Se eligió el scoreboard** (decisión de ZoTaD, 2026-08-12). Es la única que
puede decir **por qué** alguien está arriba, que es la línea editorial del sitio
entero.

**Lo que se pierde, dicho:** no hay "el mejor Victor de Latinoamérica". Lo más
cerca que se llega es el **código de país** que devuelve `/v1/players/steam` por
jugador — sirve para mostrar una bandera al lado del nombre, **no para filtrar**,
porque el orden viene global y filtrar por país exigiría barrer toda la tabla.

## El ranking: winrate con piso de partidas, y por qué NO lleva encogimiento

**Ordenar por winrate crudo pone smurfs arriba.** Medido con `min_matches=30`, el
mejor Victor tenía **100% en 32 partidas**.

**Se intentó encogimiento bayesiano —lo que la tier list ya usa— y NO se puede
aplicar así.** El endpoint devuelve *la punta del orden*, no la población: pedir
los 400 mejores por winrate da un winrate medio de **96,2%**, y estimar `k` sobre
esa muestra seleccionada dio **36.583**, que aplasta a todos a 50,0%. Para
estimarlo bien haría falta la distribución entera, que son varias páginas de
1.000. **Queda anotado como el intento que falló, para que nadie lo repita.**

**Lo que sí funciona es un piso alto de partidas**, y la población lo aguanta:

| Umbral (Victor) | Jugadores |
|---|---|
| 10 · 30 · 50 · 100 | 1.000+ (tope del `limit`) |
| **200** | **701** |

El Victor más jugado tiene **946 partidas**. Con `min_matches=200` la cima pasa a
**72,5% en 240 partidas** — un jugador de élite real, no una cuenta nueva.

**El piso NO puede ser un número fijo**, y es el riesgo principal: 200 funciona
para Victor, que es popular. Para un héroe poco jugado dejaría la tabla vacía. El
piso se elige **por consulta**, bajando hasta que la tabla tenga al menos 20
filas, y **la página dice cuál usó**. Sin eso, una tabla vacía se leería como un
error del sitio.

**Cruzar rango corta fuerte, medido:** Victor + Oráculo+ (`min_average_badge=80`)
+ 100 partidas deja **6 jugadores**. Con banda elegida el piso arranca más abajo.

## La página

Pestaña nueva **`/deadlock/ladder`**, la sexta de Deadlock.

**Tres controles**, en la misma línea de metadatos que el resto de las pestañas:

- **Héroe** — los 38, más "todos". Sin héroe, la tabla es la general.
- **Rango** — las cuatro bandas que el sitio ya tiene
  (`phantom-above`, `archon-oracle`, `ritualist-emissary`, `arcanist-below`), que
  se traducen a `min/max_average_badge` con la tabla de `BANDS` que ya existe:
  la banda son tiers y el badge es `tier*10 + subnivel`, así que Fantasma+
  (tiers 9-11) es `min_average_badge=90`.
- **Métrica** — winrate por defecto. Se ofrecen además **partidas ganadas** y
  **almas por partida** (`avg_net_worth_per_match`), que contestan preguntas
  distintas: quién gana más seguido, quién juega más, quién farmea mejor.

**Cada fila**: puesto, bandera del país, nombre de Steam, el valor de la métrica,
y las partidas sobre las que se calculó. **Las partidas van SIEMPRE**, en todas
las métricas: es el número que separa a un jugador de una cuenta nueva.

**El nombre linkea a `/deadlock/player/<account_id>`**, el perfil que ya existe.
Eso es lo que convierte la ladder en puerta de entrada al producto de jugador en
vez de una tabla suelta.

## Datos

Dos pedidos por consulta, los dos desde el navegador (deadlock-api tiene CORS `*`,
igual que el informe de partida — el Worker no participa):

1. `GET /v1/analytics/scoreboards/players?sort_by=…&hero_id=…&min_matches=…&min_average_badge=…&limit=50`
   → `[{ rank, account_id, value, matches }]`
2. `GET /v1/players/steam?account_ids=…&account_ids=…` **en un solo pedido, con
   todos los ids de la tabla** → `personaname`, `avatar`, `countrycode`.

**El segundo puede fallar sin llevarse la página**: si no llega, la tabla se
dibuja con el `account_id` en lugar del nombre. Es el mismo criterio que ya usa
`DeadlockPlayer`, donde la ficha de Steam va aparte del historial.

`match_mode` se deja **sin fijar**. El resto del sitio mide sólo Ranked, pero
ranked abrió hace trece días: fijarlo dejaría la tabla casi vacía. Es la misma
razón por la que la racha del perfil mide todas las partidas por ahora.

## Arquitectura

- **`games/tft/ui/src/deadlockLadder.ts`** — la capa de datos: construye la
  consulta, pide las dos cosas, las une y devuelve filas listas. Funciones puras
  testeables: `bandToBadges(band)` y `pickFloor(rows)` (el piso adaptativo).
- **`games/tft/ui/src/DeadlockLadder.tsx`** — sólo dibuja y sostiene los tres
  controles.
- Rutas: `route.ts` suma `ladder` a las secciones de Deadlock; `sitemap.ts` y
  `PageMeta` la incluyen como las demás.

## Tests

- `bandToBadges` devuelve los rangos correctos para las cuatro bandas, y **la
  tabla de bandas no puede divergir de la del pipeline** — el mismo test de
  paridad que ya existe para Deadlock.
- `pickFloor` baja el piso hasta llegar a 20 filas y **se planta** cuando ya no
  puede bajar más, en vez de pedir con `min_matches=0`.
- La fila conserva `matches` en todas las métricas (regresión: es el dato que
  impide que una cuenta nueva se lea como el mejor del mundo).

## Lo que NO entra

- **Filtro por país o región.** No existe en el endpoint y barrer la tabla entera
  para armarlo sería inventar un producto que los datos no sostienen.
- **Encogimiento del winrate**, por lo medido más arriba.
- **La ladder regional de Valve** como segunda pestaña: dos modelos de identidad
  conviviendo, y uno de ellos no siempre linkea a un perfil.
- **Paginación.** La tabla muestra el top 50 y punto; quien quiera el puesto 900
  no está buscando una tier list.

## Riesgos

- **El piso adaptativo es la pieza que puede quedar mal.** Si un héroe raro
  cruzado con una banda alta no llega a 20 filas ni con el piso mínimo, la página
  tiene que decir "no hay muestra para esta combinación" y no dibujar una tabla
  de tres renglones como si fuera un ranking.
- **`min_average_badge` filtra por el badge promedio DE LA PARTIDA**, no por el
  rango del jugador. Es lo mismo que ya hace la tier list —la banda sale de la
  partida, no del jugador— así que es coherente con el resto del sitio, pero no
  es "jugadores de Oráculo": es "rendimiento en partidas de nivel Oráculo".
- **Los nombres de Steam son texto de terceros.** Van escapados como cualquier
  otro dato externo; nunca con `dangerouslySetInnerHTML`.
