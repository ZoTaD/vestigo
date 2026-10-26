# Stardew Valley: planificador de granja (diseño)

2026-10-26. Pestaña nueva de la sección Stardew (`planner`, `/en/stardew-valley/planner`,
`/es/stardew-valley/planificador`). Estaba en el diseño de la sección como "después: planificador de granja en grilla
(aspersores, espantapájaros, compartible por URL)". ZoTaD eligió la maqueta **A "Barra del juego"** (maquetas del
24/10, `stardew-planificador-maquetas` en launch.json) y pidió seguir desde ahí sin más preguntas.

## Para qué

Armar la granja antes de jugarla: dónde van los cultivos, los aspersores, los espantapájaros y los edificios, ver qué
queda sin riego o sin protección, cuánto cuesta y cuánto rinde, y pasarle la granja a otro con un enlace. Rivales:
stardew.info (planner viejo, sin 1.6) y stardewplanner.com; ninguno cruza con fichas ni da la cuenta de la temporada.

## La maqueta A

- El mapa ocupa todo el ancho, dentro del marco del menú del juego (estética A de la sección).
- Abajo, botones de categoría (Cultivos, Riego, Espantapájaros, Edificios, Caminos, Árboles, Máquinas, Borrar) y la
  barra de inventario del juego con lo de esa categoría, en casilleros.
- "Lo colocado" flota en una esquina del mapa y se oculta: cada cosa con su dibujo, cantidad, enlace a su ficha y lo
  que cuesta (semillas en oro, materiales de fabricación, costo de obra); abajo, el total y la ganancia de la
  temporada de los cultivos.
- Debajo del mapa: tipo de granja · temporada · Compartir enlace · Deshacer.
- Teléfono: el mismo orden; "Lo colocado · N" es un botón que abre el panel. Un dedo coloca; dos dedos mueven y
  hacen zoom.

## Reglas del juego (leídas del código 1.6.15)

- Cultivos y árboles frutales: sólo en casillas con `Diggable` en la capa Back.
- Objetos (aspersores, espantapájaros, máquinas, caminos, cercas): casilla con Back, sin `Water`, sin tile en la capa
  Buildings, sin otro objeto. Aspersores: además sin `NoSprinklers`.
- Edificios (`GameLocation.isBuildable`): cada casilla de la huella con `Buildable` T/True, o con `Diggable` y sin
  `Buildable` F; y libre.
- Riego (`Object.GetSprinklerTiles`): aspersor (O)599 las 4 vecinas; (O)621 radio 1 (3×3); (O)645 radio 2 (5×5); la
  boquilla de presión (O)915 suma 1 (el común pasa a 3×3).
- Espantapájaros (`GetRadiusForScarecrow`): protege si `Vector2.Distance < 9`; los "Deluxe" 17; la etiqueta
  `crow_scare_radius_N` manda si está.
- Cabaña junimo: cosecha en `tileX+1 ± 8`, `tileY+1 ± 8` (17×17).
- Colmena (BC 10): flor a distancia Manhattan ≤ 5 (`Utility.findCloseFlower(…, 5)`).
- Edificios fijos de cada granja (`Farm.AddDefaultBuildings`): casa (`FarmHouseEntry` − (5, 3), por defecto (64, 15)),
  invernadero (`GreenhouseLocation`, por defecto (25, 10); granja 5 (36, 29); 6 (14, 14)), caja de envíos
  (`ShippingBinLocation`, (71, 14)) y cuenco de la mascota (`PetBowlLocation`, (53, 7)). Se dibujan y bloquean; v1 no
  los mueve.

## Datos

- `games/stardew/tools/MapDump.cs` (compilado por `dump.sh`) vuelca de cada granja (los 8 tipos) las capas, las
  propiedades de cada tile y las del mapa a `games/stardew/raw/maps/` (ignorado).
- `planner_data.py` arma `games/stardew/data/planner.json`: por granja, ancho/alto, máscaras de casillas (arable,
  objeto, edificable, sin aspersor) como texto compacto, edificios fijos; y el catálogo de la barra: cultivos (de
  `crops.json`), aspersores, espantapájaros, máquinas, caminos, cercas, árboles frutales y edificios (de `farm.json`),
  con alcance, huella, costo y materiales.
- `sprites.py` suma `public/stardew/planner/`: el mapa de cada granja en primavera (Back + Buildings + Front, 16 px por
  casilla, WebP), el cultivo maduro de cada cultivo, el árbol frutal, los caminos y los edificios fijos.

## Comportamiento

- Pintar arrastrando (cultivos, caminos, cercas); los demás se colocan de a uno. Clic derecho o "Borrar" saca.
  Rueda = zoom; arrastre con el botón del medio o espacio = mover. Teclas 1-0 eligen casillero, como en el juego.
- Donde no se puede, el casillero bajo el cursor se ve en rojo y no coloca.
- Alcances: al elegir o pasar sobre un aspersor, espantapájaros, cabaña junimo o colmena se ve su área; un botón
  "Alcances" los muestra todos. Los cultivos sin riego llevan una gota tachada y los desprotegidos un cuervo; el
  panel cuenta cuántos.
- Ganancia: `profit()` de la calculadora de Cultivos con sus opciones por defecto y la temporada elegida; un cultivo
  fuera de temporada se ve apagado y no suma.
- Deshacer/rehacer (Ctrl+Z / Ctrl+Y) y "Empezar de cero".
- Se guarda solo en `localStorage` y el enlace lleva la granja en el hash (`#p=`, deflate + base64url, versión 1):
  abrir un enlace ajeno no pisa lo guardado hasta que se toca algo.

## Fuera de esta versión

Leer la granja de la partida (sigue después, reusa el Lector), mapas por temporada, granja de la isla, mover la casa
y el invernadero, abono por casilla, interiores.

## Reglas del sitio

`LazyRows` no hace falta (la barra no pasa de ~60 casilleros). Datos con `import()`; el mapa sólo baja al abrir la
pestaña y sólo el de la granja elegida. Sumar la página a `PAGES` de `perf.mjs`, al sitemap, a `areaFiles.ts`, a la
portada de Stardew y a `netlify.toml` (caché de `/stardew/planner/*`). Medir RAM y tiempo del build.
