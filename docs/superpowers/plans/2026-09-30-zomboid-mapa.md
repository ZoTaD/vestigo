# Project Zomboid — el Mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña **Mapa** (`/en/project-zomboid/map`, `/es/project-zomboid/mapa`): Knox County entero, con dos bases (la vista satelital del juego y el mapa de papel dibujado con los colores del juego), calles, pueblos, capas del juego (vehículos, recolección, granjas, sótanos, zombis, historias, botín, escondites, puntos de aparición) y edificios que al tocarlos muestran sus habitaciones por piso. Con links que se comparten.

**Architecture:**
- **Visor:** Leaflet con CRS simple, sólo en el chunk del Mapa. La primera dependencia de runtime nueva desde React: se justifica porque arrastre, zoom, pellizco, teselas y capas con clic ya están resueltos y probados, y el mapa lo carga sólo quien entra al Mapa.
- **Base satelital:** las teselas del juego (`/zomboid/map/sat/{z}/{x}_{y}.webp`).
- **Base de papel:** un color de fondo, la mancha de bosque (`/zomboid/map/forest/...`) y los polígonos de `worldmap.xml` dibujados en canvas, nítidos a cualquier zoom.
- **Datos:** `map.py` los parte por región (una grilla de 1.500 casillas), así el visor pide sólo lo que se ve.
- **Estado en la dirección:** `?x=&y=&z=&capas=`, y acepta los formatos de la comunidad.

**Tech Stack:** Leaflet (BSD-2, `leaflet` + `@types/leaflet`), React 18, TS, Python (map.py), Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md` (sección Mapa).
- Andamio: `docs/superpowers/plans/2026-09-30-zomboid-andamio.md` (`TABS`, `PZ_TAB_FILES`, `PZ_PUBLISHED`, `preloadTab`, `virtual:pz-slugs-es/<sec>`).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. Nunca `git add -A`. `test/deadlock.test.ts` falla por una dependencia ajena.
- **Coordenadas:** en casillas del mundo, como las escribe `map.py` (ver `games/zomboid/data/map/tiles.json`).
  - Las teselas: z = 4 − nivel del juego; con CRS simple y `Transformation(1/16, 0, 1/16, 0)`, `latLng(y, x)` es la casilla (x, y), y el zoom 4 es 1 píxel por casilla.
  - Se deja acercar hasta zoom 6 (reescalado, `image-rendering: pixelated` en la base satelital).
- **Estética "Libreta":** el mapa ocupa una hoja grande con cinta; la leyenda y los controles van en hojas de libreta; los marcadores son los sellos del juego (`/zomboid/map/stamps/map_<n>.png` teñidos con `mask`); las notas de los escondites van con Caveat en el color que traen.
- **Reglas de la casa:** sin bordes de color en tarjetas; en/es con voseo; sin scroll horizontal en el celular (en el celular el mapa ocupa el ancho y las capas van en un panel que se abre); nada de "sacado de los archivos del juego".
- **Rendimiento:**
  - Leaflet y los datos del mapa sólo en el chunk del Mapa;
  - un pedido de datos por región visible;
  - nada del mapa en la cáscara ni en la portada.
- **Teselas en git:** `site/public/zomboid/map/sat` (29,6 MB) y `forest` (5,7 MB) se commitean en esta pestaña: Netlify construye desde git y no tiene el juego. La caché ya está en `netlify.toml` (`/zomboid/map/*`).

---

### Task 1: Los datos del mapa para la web, y las teselas

**Files:**
- Modify: `games/zomboid/tools/map.py` (escribe `games/zomboid/data/map/web/**`)
- Create: `games/zomboid/data/map/web/**`, `site/test/zomboidMapData.test.ts`
- Commit: `site/public/zomboid/map/sat/**`, `site/public/zomboid/map/forest/**`

**Interfaces:**
- **Región:** `region(x, y) = floor(x / 1500) + "_" + floor(y / 1500)`. Un objeto que cruza regiones va en cada región que toca.
- **`web/regions/<rx>_<ry>.json`:**
  ```json
  { "b": { "<tipo>": [[x1,y1,x2,y2,...]] },   // polígonos de edificios por tipo (como vector.json)
    "roads": {...}, "roadLines": {...}, "water": [...], "railway": [...], "driveways": [...],
    "zones": { "<tipo>": [[x,y,w,h,"<nombre>"?]] }, // las de zones.json que caen acá
    "bld": [ { "id": "...", "box": [x1,y1,x2,y2], "type": "...", "tone": "...", "floors": {...} } ] }
  ```
  Los edificios con habitaciones son los de `buildings.json`, con índices de habitación.

  > **Así quedó (Task 1 ejecutada, 2026-09-30).** Un archivo por región pasaba de 1 MB en Louisville, así que cada región se partió en hasta tres archivos. `common.regions[i] = { id, box, draw?: 1, zones?: 1, bld?: 1 }` dice cuáles existen, y el visor pide sólo esos:
  > - `web/regions/<id>.json`: el dibujo de papel (`b`, `roads`, `roadLines`, `water`, `railway`, `wood`, `driveways`). Se pide para cada región visible con la base de papel.
  > - `web/zones/<id>.json`: `{ zones, zonesP }`. Se pide para cada región visible con alguna capa prendida. Las capas con clic deduplican por `tipo|x,y,w,h|nombre|extras`, no sólo por posición.
  > - `web/bld/<id>.json`: los edificios con pisos y habitaciones. Se pide recién al tocar un edificio (Louisville pesa 229 KB comprimido).
  >
  > El `write_web` de `map.py` documenta la forma exacta de cada uno. Las Tasks 2 a 4 usan este contrato.
- **`web/common.json`:**
  - `style` (paleta de `vector.json`);
  - `rooms` (los 586 nombres);
  - `places`, `labels`, `streets` (con punto y ángulo de etiqueta);
  - `stashes` (con anotaciones);
  - `spawns`;
  - `regions` (la lista de regiones con su caja).
  - Tiene que pesar menos de 500 KB crudo; si no, `streets` y `stashes` van aparte.
- **`web/search.json`:** `[{ "k": "street"|"town"|"stash"|"building"|"story", "en": "...", "es": "...", "x", "y" }]`, para el buscador.
- Determinista y reescrito sólo si cambia, como el resto.

- [ ] **Step 1: Tests que fallan** (`zomboidMapData.test.ts`):
  - **Cobertura:** cada edificio de `buildings.json` está en al menos una región y su caja cae dentro de ella o la cruza.
  - **Tamaño:** ninguna región pasa 250 KB crudos; `common.json` pesa menos de 500 KB.
  - **Punto conocido:** el Knox Bank de Muldraugh (10623, 9685) cae en la región `7_6` y dentro de un edificio de esa región.
  - **Buscador:** `search.json` tiene "Muldraugh" (town) y una calle conocida de `streets.json`.
- [ ] **Step 2:** Implementar en `map.py`, más `python games/zomboid/tools/map.py --sin-teselas`, con los tests en verde.
- [ ] **Step 3: Commit.** Primero los datos y el código. Después, en un commit aparte, las teselas (`git add site/public/zomboid/map/sat site/public/zomboid/map/forest`), con un mensaje que diga su peso y por qué van en git.

---

### Task 2: El visor — bases, calles, pueblos y la dirección

**Files:**
- Create: `site/src/zomboid/map/ZomboidMap.tsx`, `site/src/zomboid/map/data.ts`, `site/src/zomboid/map/paper.ts` (dibujo de la base de papel), `site/src/zomboid/map/url.ts`, `site/src/styles/zomboid-map.css`
- Modify: `site/package.json` (`leaflet`, `@types/leaflet`), `site/src/zomboidCopy.ts`
- Create: `site/test/zomboidMapUrl.test.ts`, `site/test/zomboidMap.test.ts`

**Interfaces:**
- **`url.ts`:**
  - `readMapUrl(search: string, hash: string): { x: number; y: number; z: number; layers: string[]; base: "sat" | "paper" } | null`;
  - `writeMapUrl(state): string` (el `?…`).
  - Acepta `?x=&y=&z=` (los nuestros), `?x=&y=&zoom=`, y el hash `#XxYxZ`.
  - Por defecto, Muldraugh (10600, 9600) con zoom 2.
- **`ZomboidMap.tsx`:**
  - Leaflet con CRS simple. Base satelital (una `TileLayer` con `maxNativeZoom: 4`, `maxZoom: 6`) o de papel (una capa canvas propia en `paper.ts` que dibuja fondo, bosque (`TileLayer` de `forest`), agua, rutas, vías y edificios por tipo con la paleta, pidiendo a `data.ts` el archivo `regions/<id>` de cada región visible que tenga `draw`; ver el contrato en la Task 1).
  - Etiquetas de pueblos y de calles (las de calles desde zoom 3).
  - Coordenadas bajo el cursor en una nota a mano.
  - Botón "copiar link de este lugar".
  - La dirección se actualiza con `history.replaceState` al mover, sin recargar.
- **SSR:** Leaflet no corre en el servidor. El HTML prerenderizado del Mapa trae la hoja de introducción (qué muestra el mapa, cuántos edificios, calles y escondites) y una imagen estática del mapa entero (el nivel 0 de las teselas, `sat/0/…`, o una vista armada en el build) dentro de la hoja. Leaflet se monta en `useEffect`.

- [ ] **Step 1:** Tests de `url.ts` (idas y vueltas, formatos de la comunidad, valores fuera de rango que se recortan al mapa). Tests del render SSR del Mapa: trae la intro en/es y no intenta usar `window`.
- [ ] **Step 2:** Implementar. `npx tsc -b`, tests.
- [ ] **Step 3:** Revisión en el navegador (publicándolo localmente sin commitear):
  - arrastrar, zoom con rueda y en el celular;
  - pasar de base satelital a papel;
  - un link copiado abre en el mismo lugar;
  - la consola sin errores.
- [ ] **Step 4: Commit.**

---

### Task 3: Las capas del juego y la leyenda

**Files:**
- Create: `site/src/zomboid/map/layers.ts`, `site/src/zomboid/map/Legend.tsx`
- Modify: `ZomboidMap.tsx`, `zomboid-map.css`, `zomboidCopy.ts`
- Create: `site/test/zomboidMapLayers.test.ts`

**Interfaces:**
- **Capas** (cada una se prende y se apaga, y queda en `capas=` de la dirección):
  - **vehículos:** `ParkingStall`, con el tipo de vehículo en el tooltip y un sello de volante;
  - **recolección:** `Forest`, `DeepForest`, `Vegitation`, `FarmLand`, `Farm`, `TownZone`, `TrailerPark`, cada una con su tinte;
  - **granjas y animales:** `Ranch`, con la especie;
  - **sótanos posibles:** `Basement`, con la escalera. Hay que aclarar que son posibles y al azar por partida;
  - **zombis:** `ZombiesType`, por tipo;
  - **historias:** `ZoneStory`;
  - **botín rico:** `LootZone`;
  - **edificios con nombre:** `BuildingName`;
  - **puntos de aparición:** `spawns`, con filtro por profesión;
  - **escondites:** `stashes`. Se dibujan como en el juego: sus anotaciones (sellos y textos con su color, en el idioma de la página cuando hay `es`) sobre el mapa. Al tocarlos se ven el mapa que hay que encontrar (`item`, con link a su ficha de objeto si existe) y los detalles (zombis, barricadas).
- **Leyenda:** una hoja de libreta con cada capa, su sello o tinte, y la cantidad.

  > **Así quedó (Task 3 ejecutada, 2026-09-30).**
  > - Los ids de `capas=` van en español (`vehiculos`, `recoleccion`, `animales`, `sotanos`, `zombis`, `historias`, `botin`, `edificios`, `apariciones`, `escondites`), en ese orden, y se aceptan los nombres en inglés (`layers=stashes`). La profesión va en `profesion=<slug de la ficha>`, sólo con `apariciones`.
  > - La hoja "Capas" (`Legend.tsx`) es leyenda e interruptores a la vez. Sus cifras salen de `map/meta.json`: `map.py` suma `counts.zones` (zonas distintas por tipo) y `counts.spawns`, así la hoja entra al prerender.
  > - `map.py` suma a `common.json` los `items` (`{ "Base.RosewoodMap": { id, en, es } }`) que nombran los escondites, leídos de `data/index.json`: la hoja del escondite (`StashCard.tsx`) enlaza a la ficha sin bajar el índice.
  > - Lo que toca Leaflet está en `overlays.ts` (las zonas en canvas por tesela, los puntos, los escondites); `layers.ts` es la lógica pura. Los textos van en `map/copy.ts`, no en `zomboidCopy.ts`.

- [ ] **Step 1: Tests** (lógica pura de `layers.ts`):
  - de un `zones/<id>.json` de región a los rectángulos de cada capa, deduplicados por `tipo|x,y,w,h|nombre|extras`;
  - el filtro de spawns por profesión;
  - de una anotación de escondite a un marcador (sello y color, texto es/en).
- [ ] **Step 2:** Implementar, más la revisión en el navegador.
- [ ] **Step 3: Commit.**

---

### Task 4: Edificios y buscador

**Files:**
- Create: `site/src/zomboid/map/BuildingSheet.tsx`, `site/src/zomboid/map/search.ts`, `site/src/zomboid/map/rooms.ts` (nombres de habitaciones en/es)
- Modify: `ZomboidMap.tsx`, `zomboidCopy.ts`, CSS
- Create: `site/test/zomboidMapSearch.test.ts`, `site/test/zomboidRooms.test.ts`

**Interfaces:**
- **Clic en un edificio:** se pide `bld/<id>` de su región (si `common.regions` lo tiene); hoja con tipo, tono (`Farmhouse`…), pisos (sótano incluido) y, por piso, las habitaciones con su nombre y su tamaño. El edificio se resalta.
- **`rooms.ts`:** nombres en/es escritos a mano para las habitaciones más comunes (las que suman el 95 % de las habitaciones del mapa). Las demás se muestran con el nombre del juego separado en palabras cuando se puede. Un test fija que las más comunes tienen traducción.
- **Buscador** (con `search.json`): calles, pueblos, escondites, edificios con nombre e historias; en/es; al elegir, el mapa va al lugar. Ranking: exacto, después prefijo, después contiene.

- [ ] **Step 1:** Tests del buscador y de `rooms.ts`.
- [ ] **Step 2:** Implementar, más la revisión en el navegador (tocar el Knox Bank de Muldraugh y ver sus habitaciones).
- [ ] **Step 3: Commit.**

---

### Task 5: Publicar el Mapa

**Files:**
- Modify: `route.ts` (`PZ_PUBLISHED` suma `"map"`), `Zomboid.tsx` (`TABS`), `areaFiles.ts` (`PZ_TAB_FILES`), `ZomboidHome.tsx` (la herramienta "Mapa de Knox County" deja de estar en "Pronto" y enlaza), `entry-server.tsx` (si hace falta precargar), `sitemap.ts` (`lastmod` del Mapa desde `data/map/meta.json`)
- Create: `site/test/zomboidMapPublish.test.ts`

- [ ] **Step 1: Tests:**
  - el sitemap tiene `/en/project-zomboid/map` y `/es/project-zomboid/mapa`, con `lastmod` del mapa;
  - el prerender del Mapa trae su intro y su título ("Mapa de Project Zomboid…");
  - la portada enlaza al Mapa.
- [ ] **Step 2:** Implementar, más `npm run build` (anotar el peso del chunk del Mapa, con Leaflet, y confirmar que la portada no lo carga).
- [ ] **Step 3:** Revisión en el navegador, escritorio y celular.
- [ ] **Step 4: Commit.**
