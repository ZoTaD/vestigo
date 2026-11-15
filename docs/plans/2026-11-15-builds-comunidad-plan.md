# Builds de Deadlock: biblioteca, comunidad y editor nuevo (2026-11-15)

## Para qué

El Armador actual es la tienda del juego copiada: mide 5.400 px de alto, la
build queda en una cajita y no se ven builds de otros. Statlocker sacó
Buildlocker (biblioteca de builds con % de victoria). Pedido de ZoTaD: algo
igual o mejor, con builds recomendadas por Vestigo y que la gente logueada con
Steam suba las suyas. Maquetas: `docs/maquetas/2026-11-14-builds/`.

## De dónde salen los datos (todo de deadlock-api)

- `GET /v1/analytics/hero-build-stats?min_unix_timestamp=<hace 30 días>`:
  partidas, victorias y jugadores **por build del juego**, todos los héroes en
  un pedido (~2 s, ~10.000 builds con ≥100 partidas). `hero_build_id` es la
  build elegida al empezar la partida. Es lo que Buildlocker saca de su app de
  escritorio; acá viene de las partidas analizadas por deadlock-api.
- `GET /v1/builds?hero_id=&build_id=&only_latest=true`: nombre, autor,
  descripción, categorías, orden de habilidades, etiquetas.
- `GET /v1/players/steam?account_ids=…`: nombre y foto del autor (100 por pedido).
- `GET /v1/assets/build-tags?language=…`: las etiquetas del juego traducidas.
- `GET /v1/builds/by-author/{account_id}`: las builds de una cuenta, en vivo
  desde el Game Coordinator. Es lo que prueba la autoría al publicar.

## Qué ve la gente

- **`/deadlock/builds`**: portada. Elegís héroe; abajo, las builds más jugadas
  de todos los héroes.
- **`/deadlock/builds/<héroe>`**: la biblioteca del héroe. Pestañas:
  - *Recomendadas*: las que elige Vestigo (`vestigo-builds.json`, a mano) y,
    si no hay, las 3 con mejor victoria entre las muy jugadas, marcadas "elegida
    por datos" (no se disfraza de recomendación humana).
  - *Comunidad*: las builds del juego más jugadas, con % de victoria, partidas,
    jugadores, estilo, etiquetas, idioma. Orden: más jugadas / mejor victoria
    (límite inferior de Wilson, para que 12 partidas al 70% no ganen) / nuevas.
    Las subidas a Vestigo llevan el sello de autor verificado.
  - *De los mejores*: las que usan los 20 mejores de la escalera (ya existe).
  - *Mis builds*: con sesión, tus builds del juego y las que subiste.
- **`/deadlock/builds/<héroe>/<id>`**: la ficha. Qué comprar por categoría,
  orden de habilidades, % de victoria, partidas, almas, parecido con la build
  medida que más gana, botón "Copiar ID" (en el juego: tienda → builds →
  buscar por ID) y "Editar copia".
- **`/deadlock/builder`**: el editor nuevo. Etapas con nombre, buscador de
  objetos en lista (no la tienda gigante), orden de habilidades, stats e
  inversión. El link sigue guardando todo (`b`, `g`, `a`): los links viejos
  siguen andando.
- **Subir una build**: con Steam, elegís una de **tus** builds del juego, le
  sumás etiquetas y una línea, y queda publicada en Vestigo. Valve no deja
  publicar en el juego desde afuera: se arma allá o se copia desde el editor.

## Cómo está hecho

- **Pipeline** `src/communityBuilds.ts` (`npm run build:community-builds`),
  una vez por día en `publish-deadlock.yml`. Escribe
  `games/deadlock/data/community-builds/index.json` (lo justo para la
  portada) y `community-builds/<heroId>.json` (hasta 40 builds con detalle).
  Partido por héroe (regla 4 de `CLAUDE.md`): una ficha baja sólo su héroe.
  Incluye siempre las de `vestigo-builds.json` y las publicadas en Vestigo
  (`GET /api/builds/published`).
- **API** (`api/src/builds/`): `GET /api/builds/mine`, `POST /api/builds`,
  `DELETE /api/builds/:id`, `GET /api/builds?hero=` y
  `GET /api/builds/published`. Tabla `builds` en D1 (migración 0003). Al
  publicar se vuelve a pedir `by-author` con la cuenta de la sesión: no se
  confía en lo que manda la página.
- **Prerender**: portada, 38 héroes y las 10 primeras fichas de cada héroe,
  en los dos idiomas (~840 páginas). Las demás fichas se dibujan en el
  navegador.

## Qué no es (por ahora)

- Sin votos propios: se muestran los favoritos del juego.
- Sin filtro por rango: la estadística es de todos los rangos. Se puede sumar
  con `min_average_badge` si hace falta.
- Publicar en el juego desde Vestigo: Valve no lo permite.

## Filtros de contenido (porque se promociona)

- Nombres de builds y de autores con insultos, odio o sexo: se ocultan
  ("Build #id", "Jugador") y la descripción se saca (`isOffensive`, en/es/ru).
  ~21 de 1.887 builds y 14 autores el 2026-11-15.
- Propaganda en los nombres ("[61% WR] [tracklock.gg]", "twitch.tv/x",
  autores que se llaman "deadlocked.gg"): se saca (`cleanName`).
- La nota que se sube a Vestigo con insultos se rechaza (400 `note`).
- Lo comparten pipeline, API y sitio: `games/deadlock/pipeline/src/communityBuildsCore.ts`.

## Mediciones (2026-11-15, este contenedor, 4 núcleos)

`npm run build` completo, mismo equipo, con `vite` de desarrollo corriendo al
lado (~0,6 GB contados en el pico):

| | segundos | pico de RAM (node) | páginas |
| --- | --- | --- | --- |
| sin Builds (HEAD) | 184 | ~4,96 GB | 55.512 |
| con Builds | 214–232 | ~5,0–5,5 GB | 59.376 |

El pico varió entre corridas por lo que corría al lado (la API local en la
segunda). El sitio ya estaba en ~4,4 GB sin este cambio, lejos de los 2,3 GB de
referencia del 2026-10-06: conviene mirarlo aparte, el tope es 6 GB.

`npm run perf` (presupuesto: 250 pedidos, 200 imágenes, 3.000 nodos):

| página | pedidos | imágenes | nodos |
| --- | --- | --- | --- |
| /en/deadlock/builds | 104 | 77 | 643 |
| /en/deadlock/builds/abrams | 152 | 122 | 816 |
| /en/deadlock/builds/abrams/697756 | 104 | 72 | 762 |
| /en/deadlock/builder | 72 | 47 | 350 |
| /es/deadlock/builder con una build | 135 | 106 | 2.193 |

El Armador viejo medía 5.382 px de alto en escritorio; el nuevo, con una build
de 8 etapas, ~3.400 px y casi todo es contenido.

Pruebas: vitest del sitio (3.411), API (60) y pipeline (491); axe WCAG 2.1 AA
sin violaciones en las 6 páginas; subida de punta a punta con `wrangler dev` y
D1 local (listar, publicar, nota rechazada, editar, sacar, otro origen 403,
build ajena 403); teclado; móvil (iPhone 13) sin desborde; HTML prerenderizado
con título, h1 y canonical y sin errores de hidratación.

## Para publicar (no se hizo todavía)

1. Merge a `main`: `deploy-api.yml` aplica la migración D1 0003 y publica el
   Worker; `deploy.yml` publica el sitio.
2. Correr publish-deadlock a mano (`workflow_dispatch`) para que el pipeline
   tome el paso nuevo; después corre solo una vez por día.
3. Si se quieren builds "Elegidas por Vestigo": publicarlas en el juego y sumar
   `{ "hero": <id>, "id": <build> }` a `games/deadlock/data/vestigo-builds.json`.
