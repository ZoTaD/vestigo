# Deadlock: pestaña Mapa

Fecha: 2026-10-12. Rama `feat/deadlock-mapa`. Estado: diseño, sin programar.

## Para qué

Una página que contesta, sobre el mapa del juego, **qué hay en cada lugar, cuánto
aguanta, cuánto da y a qué minuto aparece**: campamentos de la jungla, cajas,
estatuas, vida flotante, jefe del medio, tirolesas y tiendas. Es lo que se busca
("deadlock map", "jungle camps", "spawn timers", "crate locations") y hoy
ninguna página de las que competimos lo junta en un solo lugar.

Público en inglés primero; el español es el agregado de siempre.

Queda afuera de esta etapa: **rutas de farmeo** (etapa 2, ver al final).

## De dónde salen los datos (comprobado el 2026-10-12)

Todo del juego instalado, con Source 2 Viewer CLI, igual que las imágenes:

| Qué | Archivo | Cómo se lee |
| --- | --- | --- |
| Posiciones | `maps/dl_midtown.vpk` → `maps/dl_midtown/entities/default_ents.vents_c` | 6.097 entidades con `classname`, `origin` y subclase |
| Tiempos de campamentos | `scripts/misc.vdata` → `neutral_camp_*` | `m_iInitialSpawnDelayInSeconds`, `m_iSpawnIntervalInSeconds` |
| Vida y almas de neutrales | `scripts/npc_units.vdata` → `neutral_*` | `m_nMaxHealth`, `m_flGoldReward`, `m_flGoldRewardBonusPercentPerMinute` |
| Cajas, estatuas, pickups | `scripts/misc.vdata` → `citadel_breakable_*`, `citadel_pickup_*` | `m_flInitialSpawnTime`, `m_flRespawnTime`, tablas de botín |
| Grupos de reaparición | `scripts/generic_data.vdata` → `m_BreakableSpawnTimeDesc` | cuatro grupos (`breakable_spawn_group` 0 a 3) |
| Minimapa e íconos | `pak01` → `panorama/images/minimap/` | 1024×1024, más capas de túneles |

Lo que se contó en el mapa de hoy:

- 52 campamentos (`info_neutral_trooper_camp`): 4 chicos, 25 medianos, 11
  grandes, 11 bóvedas y el jefe del medio. 222 puntos de aparición de
  neutrales, cada uno atado a su campamento por `campname`.
- 668 rompibles (`citadel_breakable_prop`): 425 cajas de madera, 74 cajas
  duras, 166 contenedores de objeto (las estatuas doradas) y 3 campanas.
- 36 vidas flotantes (`citadel_pickup_spawner`, cada 180 s), 6 puntos de caja
  de objeto, 2 de potenciadores.
- Tirolesas (`citadel_zipline_path_node`), tiendas (`trigger_item_shop`),
  guardianes, caminantes y bases.

Tiempos leídos (segundos, aparición inicial / reaparición): chico 120 / 85,
mediano 300 / 290, grande 480 / 335, bóveda 480 / 300, jefe del medio 0 / 420
bajando 60 por vez hasta 300.

**Coordenadas.** El mapa va de −10.752 a 10.752 en X e Y
(`citadel_minimap_boundary`); el minimapa cubre ese cuadrado, con Y invertida.
Dibujados así, los 52 campamentos caen dentro de los edificios y el jefe en el
centro: la proyección calza sin ajuste a mano.

## Piezas

1. **Extractor** — `games/deadlock/tools/map_data.py --vrf <Source2Viewer-CLI.exe>`.
   Lee los archivos de la tabla y escribe `games/deadlock/data/map.json`, y
   copia el minimapa y los íconos a `site/public/deadlock/game/minimap/`
   (WebP). Se corre a mano una vez por parche, como `game_assets.py`. No entra
   en el pipeline diario: el mapa cambia sólo con un parche.

2. **`map.json`** — una lista de puntos y una de tipos:
   - `points`: `{ id, kind, x, y, z, camp? }`, con `x`/`y` ya normalizadas de 0 a
     1 sobre el minimapa.
   - `kinds`: por tipo, nombre (EN/ES a mano, son ~15), ícono, aparición
     inicial, reaparición y, si es un neutral, vida y almas base con su
     crecimiento por minuto.
   - `camps`: por campamento, su tamaño y qué criaturas trae (para sumar vida y
     almas del campamento entero).
   - `ziplines`: polilíneas por carril.
   Las 425 cajas van como puntos sin ficha propia: comparten tipo.

3. **Página** — `site/src/DeadlockMap.tsx`, pestaña `map`, ruta `/deadlock/map`
   (`/es/deadlock/mapa`). Importa `map.json` con `import()`, nunca en el chunk
   de entrada; se suma a `areaFiles.ts` para que el prerender la precargue.
   - **El mapa**: el minimapa del juego como fondo y los puntos en un SVG
     encima. Zoom y arrastre propios (sin librería de mapas: es una sola
     imagen de 1024 px).
   - **Capas**: una casilla por tipo, con su cuenta. De entrada prendidas las
     de campamentos y objetivos; las cajas apagadas, porque 668 puntos tapan
     todo.
   - **Línea de tiempo**: un control de 0:00 a 40:00. Los puntos que todavía no
     aparecieron a ese minuto se ven apagados, y las cifras de vida y almas se
     calculan para ese minuto.
   - **Ficha del punto** al tocarlo: qué es, vida, almas, primer minuto,
     cada cuánto vuelve. En un campamento, la suma de sus criaturas.
   - **Tabla debajo del mapa**: los mismos tipos en texto (tamaño, cuántos hay,
     vida, almas, aparición, reaparición). Es lo que lee Google y lo que sirve
     en el teléfono si el mapa queda chico.

4. **Estilo**: Cartel, como todo Deadlock. El mapa va sobre papel oscuro (la
   excepción que ya usan la pizarra y la tienda), sin filos de color en las
   tarjetas.

## Reglas del sitio que aplican

- Rendimiento: sumar `/deadlock/map` a `PAGES` en `site/scripts/perf.mjs` y
  medir. Un SVG con 668 cajas más ~300 puntos pasa cómodo el tope de 3.000
  nodos sólo si las cajas apagadas no se montan: las capas apagadas no se
  dibujan.
- Imágenes: el minimapa es la imagen principal (sin `lazy`); los íconos son
  una docena y van con tamaño fijo.
- SEO: título con lo que se busca ("Deadlock Map — Jungle Camps, Crates and
  Spawn Timers"), entrada en el sitemap de Deadlock, y la tabla en texto en el
  prerender.
- Nada de "sacado de los archivos del juego" en la interfaz; sí el aviso de no
  afiliación de siempre.

## Pruebas

- Extractor: un test sobre un recorte del volcado de entidades (clasificación
  por subclase, normalización de coordenadas, campamento ↔ criaturas).
- Sitio: cuentas por capa contra `map.json`; qué está vivo a un minuto dado;
  vida y almas a un minuto dado; el h1 y la tabla presentes en el prerender.
- A ojo: campamentos dentro de sus edificios y simetría entre los dos lados.

## Lo que todavía no sé

- Qué significa cada `breakable_spawn_group` en la práctica (hay cuatro pares
  de tiempos y hay que confirmar cuál corresponde a cuál contra el juego).
- Si la vida de los neutrales crece por minuto: el campo existe para otras
  unidades (`m_iHealthGainPerMinute`) pero no lo vi en los neutrales. Si no
  crece, la ficha no muestra crecimiento de vida.
- Cuánta alma da una caja: sale de una tabla de probabilidades, así que se
  mostraría como rango o promedio, no como cifra fija.
- Los pisos: muchos puntos están bajo techo o en túneles. La primera versión
  los dibuja todos en un plano; las capas de túneles del minimapa quedan para
  después si hace falta.

## Etapa 2 (después): rutas

Con posiciones, almas y reaparición ya en `map.json`, calcular rutas de farmeo
(almas por minuto según distancia y reaparición, por lado y por tramo de la
partida) y contrastarlas con guías. No se copia una ruta de una guía como
"óptima".

## Etapa 2, hecha el mismo día: mapa propio y rutas

Pedido de ZoTaD al ver la etapa 1: el minimapa del juego se pixela al acercar y
con puntos no se entiende qué es cada cosa.

- **Mapa propio.** `map_data.py` calca el minimapa a vectores (`shape` en
  `map.json`: el suelo y la silueta) con `potracer`. La página lo dibuja como un
  plano sobre papel; ya no usa ninguna imagen.
- **Íconos.** Cada tipo tiene su forma (`GLYPH` en `DeadlockMap.tsx`); los
  campamentos usan el triángulo con barras del minimapa del juego.
- **Armador de rutas.** En modo "Armar una ruta", tocar una marca la suma como
  parada. La ruta se mide con un héroe y un minuto, y viaja en la dirección
  (`?r=c40.c10&m=10&h=6`) para compartirla.
- **Tiempos** (`deadlockRoutes.ts`): caminar es línea recta × 1,35 a la velocidad
  de carrera del héroe; limpiar es vida ÷ daño por segundo (el del arma base con
  recargas, o el que escriba el jugador) más 1,5 s por parada. Es una estimación
  y la página lo dice.
- **Rutas sugeridas.** Por lado y por mitad de la jungla: golosa desde cada
  campamento, se queda con la de más almas por minuto. Sólo campamentos que ya
  aparecieron; sin cajas.

Lo que no cuenta todavía: el camino real (malla de navegación), las tirolesas,
los objetos y habilidades del héroe, y que un campamento limpiado tarda en
volver (una ruta sugerida es una pasada, no un ciclo).
