# Stardew Valley, etapa 4: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development (un subagente implementa cada tarea, otro la revisa, como mucho dos a la vez; el coordinador mira cada pantalla). Los pasos usan casillas (`- [ ]`).

**Objetivo:** las pestañas básicas que faltan para que la sección diga "está todo": **Granja** (animales, edificios y la casa), **Museo** (la colección, sus premios y los libros), **Isla Jengibre** (las 130 nueces, las mejoras del loro, el Walnut Room y los pedidos de Qi) y **Misiones** (las misiones de la historia y el tablero de pedidos especiales), cruzadas con las fichas de Objetos.

**Arquitectura:** la de las etapas 1 a 3. Un script de Python por pestaña lee `games/stardew/raw/` y escribe un JSON en `games/stardew/data/`; `site_data.py` suma los cruces a las fichas de Objetos; cada pestaña es un componente en `site/src/stardew/<pestaña>/` con su `state.ts` puro y probado, su CSS y su `import()` propio. Los checklists del Museo y de las nueces se guardan en el navegador y se pueden llenar desde el Lector de partida.

**Stack:** Python 3 (unittest), Vite + React + TypeScript, vitest.

**Diseño:** `docs/superpowers/specs/2026-10-22-stardew-design.md`. Estética A "Menú del juego" (`Box`, `Slot`, `Sprite`, `Gold` en `site/src/stardew/ui.tsx`). Antes de cada tarea de pantalla, leer el plan de la etapa 3 (`2026-10-23-stardew-etapa-3.md`) y una pestaña hecha (`mines/StardewMines.tsx`) para copiar la forma.

## Qué va como pestaña y qué como sección (decidido mirando `Data/`)

| Candidata | Qué hay | Va como |
|---|---|---|
| Animales de granja | `FarmAnimals` (14), texturas en `Animals/` | Pestaña **Granja**, vista Animales |
| Edificios | `Buildings` (25: Robin y Mago, costo, materiales, días, mejora de), texturas en `Buildings/`, `HomeRenovations` (18, con precio) | Pestaña **Granja**, vistas Edificios y Casa: animales y edificios se piden juntos (cada animal vive en uno) |
| Museo y artefactos | `MuseumRewards` (31), 42 `Arch` + 53 `Minerals` en `Objects`, `ArtifactSpotChances` por lugar, geodas | Pestaña **Museo**, vistas Colección y Premios |
| Libros | 20 libros de poder de la 1.6 (`Book_*`, `PurpleBook`) con su efecto en `Data/Powers`, más los de habilidad (`SkillBook_*`); se venden en `Shops/Bookseller` | Vista **Libros** del Museo: los Libros perdidos ya son de la biblioteca del museo, y los de la 1.6 son pocos para una pestaña |
| Isla Jengibre | Nada en `Data/` para las nueces: están en el código (`IslandHut.ShowNutHint` las lista todas por zona). `Shops/QiGemShop`, `SpecialOrders` `QiChallenge1-12` | Pestaña **Isla Jengibre** (Walnut Room y pedidos de Qi adentro) |
| Pedidos especiales y misiones | `Quests` (66, en y es-ES), `SpecialOrders` del pueblo (18) y del Festival del desierto (3), textos en `Strings/SpecialOrderStrings` | Pestaña **Misiones** |

Barra (`STARDEW_TABS`), 14 pestañas: `home, items, crops, farm, fishing, mines, museum, recipes, villagers, quests, calendar, bundles, island, save`. Hoy son 10 y la barra se parte en renglones con `text-wrap: balance`; la tarea 6 mira cómo queda con 14.

## Restricciones globales

- Todo en español (código, comentarios, commits). Nombres y textos del juego desde `Strings/*` y los `Data/*.es-ES` (en y es-ES), nunca de la wiki (CC BY-NC-SA); los números sí se cotejan contra ella. Nada de "sacado de los archivos del juego" en la interfaz.
- Reglas de `CLAUDE.md`: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos por página en frío; `LazyRows` en listas de más de ~150 filas; imágenes `loading="lazy"`, `decoding="async"` y tamaño fijo; datos fuera del chunk de entrada, cada pestaña con su `import()`; JSON importados enteros; pestaña nueva en `areaFiles.ts`.
- Direcciones nuevas, todas sin fichas: `farm` → `granja`, `museum` → `museo`, `island` → `isla-jengibre`, `quests` → `misiones`. Cada una va a `STARDEW_SECTIONS`, `STARDEW_PUBLISHED`, `STARDEW_SECTION_ES` (`route.ts`), `TABS` y `TAB_DATA` (`Stardew.tsx`), `STARDEW_TABS` y los textos (`stardewCopy.ts`) y `STARDEW_TAB_FILES` (`areaFiles.ts`). Las vistas internas van en `?v=` como en Minas; cada fila de animal, edificio, premio, nuez y misión lleva un `id` para enlazarla con `#`.
- Otras sesiones (planificador de granja, predictor) tocan los mismos archivos: sumar **sólo** nuestras líneas, sin reordenar lo de otros. Antes de `npm run build` o `npm run perf`, anotar "BUILD EN CURSO etapa-4 <hora>" en `side-session-notes/local_abeeaccc-…/builds.md` y borrarlo al terminar; si hay otra línea, esperar. Nunca dos a la vez.
- Las reglas que no están en `Data/*` (las nueces por lugar, el precio de las mejoras del loro y de la casa, lo que sale de cada geoda, los cuidados de los animales) se leen del código descompilado **sólo como referencia**, desde la salida que ya armó la etapa 3 (`…stardew-etapa-3-803b08/…/scratchpad/ilspy/all/sdv.cs`; si no está, rearmarla como dice `etapa-3.md`). El código no entra al repo: los valores van a tablas de Python con un comentario que nombra el método (`IslandHut.ShowNutHint`, `ParrotUpgradePerch`, `Utility.getTreasureFromGeode`, `FarmAnimal.dayUpdate`, `GameLocation.houseUpgradeAccept`…).
- Diseño (memoria de ZoTaD): la letra del juego (`--sd-pixel`) sólo en títulos de 32 px o más, Nunito en el resto; sin `text-shadow` en letra chica; sin bordes ni barras de color en filas o tarjetas (tinte, texto o cifra); cifras legibles; nada cortado ni palabras partidas. Sprites con `image-rendering: pixelated` a múltiplos enteros.
- Tests de Python: `python -m unittest discover -s games/stardew/tools/tests`. Tests del sitio: `npm test` en `site/`. `npx tsc -b` limpio en cada tarea de TypeScript.

## Foco de revisión

1. **Textos con huecos.** Los pedidos especiales tienen `RandomizedElements` (`{Name}`, `[Item]`) y los objetivos usan `{0}`: ningún texto en pantalla puede mostrar llaves, corchetes ni `{0}`. Test en las tareas 4 y 9.
2. **Objetos que no tienen ficha.** Premios del museo o del Walnut Room que son muebles (`(F)`), sombreros (`(H)`) o `(BC)` sin ficha: se muestran con su sprite y nombre, sin enlace roto. `check:links` en 0 lo confirma; test en la tarea 5.
3. **Checklist con datos viejos o rotos.** `localStorage` con claves que ya no existen, JSON roto o acceso bloqueado: la lista anda igual y no cuenta claves de más. Test en la tarea 7.
4. **Nueces que se cuentan de a varias.** Las de "caída limitada" (dardos 3, barriles del volcán 5, …) son una fila con `n > 1`: el total suma 130 y el checklist cuenta `n`, no 1. Test en las tareas 3 y 8.
5. **Animales que no se compran.** Gallina del vacío, dorada, dinosaurio, avestruz y pato/conejo con requisito: el precio de Marnie no aparece como 0 ni vacío; dice de dónde salen. Test en las tareas 1 y 6.

---

### Tarea 1: Datos de la granja (`farm_data.py`)

**Archivos:** crear `games/stardew/tools/farm_data.py` y `games/stardew/tools/tests/test_farm_data.py`; sumar a `sprites.py` el primer cuadro de cada animal adulto y bebé (`Animals/<nombre>.png`, cuadro de `SpriteWidth`×`SpriteHeight`) y cada edificio (`Buildings/<nombre>.png` recortado a `SourceRect`). Salen `games/stardew/data/farm.json` y los PNG en `site/public/stardew/animals/` y `site/public/stardew/buildings/`.

**Interfaces:**
- Consume `sdv` (`raw`, `text`) y `relations` (`objects`, `machines_by_input`).
- Produce `farm.json`:
  - `animals: [{key, name:[en,es], house, price|null, from:[en,es]|null, mature, every, tool:"pail"|"shears"|"dig"|null, produce:[{id, deluxe:bool, minFriendship}], sell, sprite:[w,h]}]`. `price` = `PurchasePrice` si Marnie lo vende (`AnimalShop`/`PurchaseAnimalsMenu`), si no `null` y `from` dice de dónde sale (huevo del vacío de Krobus, huevo de oro del Walnut Room, huevo de dinosaurio, huevo de avestruz) con textos del juego. `every` = `DaysToProduce`; `tool` sale de `HarvestType`/`HarvestTool`.
  - `buildings: [{key, name:[en,es], desc:[en,es], builder:"Robin"|"Wizard", cost, materials:[[id, n]], days, upgradeOf:key|null, size:[w,h], animals:[key], sprite:[w,h]}]`. Sin `Farmhouse` ni `Greenhouse` (no se construyen).
  - `house: {upgrades:[{level, cost, materials:[[id,n]], adds:[en,es]}], renovations:[{key, name:[en,es], price}]}`. Mejoras de la casa del código (método nombrado); de `HomeRenovations` sólo las `add_*`/`open_*`/`build_*` (las `remove_*` y `close_*` son su revés).
  - `care: [{key, value, text:[en,es]}]`: lo que suma y resta amistad y ánimo (acariciar, alimentar, dejar afuera de noche, calefactor en invierno), de `FarmAnimal.dayUpdate` y `FarmAnimal.pet`, con textos propios cortos en los dos idiomas.
  - `refs`: objetos nombrados, con la forma de `Ref` de `data.ts`.

- [ ] **Test que falla:** la Gallina blanca vive en `Coop`, cuesta 400, da `176` y deluxe `174`; la Vaca da `184` con `tool "pail"`; la Oveja tiene `tool "shears"`; el Cerdo `tool "dig"` y da `430`; la Gallina del vacío y el Dinosaurio tienen `price null` y `from` no vacío en los dos idiomas; el Gallinero grande tiene `upgradeOf "Coop"`, cuesta 10000 con 400 de `388` y 150 de `390`; el Obelisco de la isla es del Mago; no están `Farmhouse` ni `Greenhouse`; hay 3 mejoras de la casa; los `animals` de cada edificio existen.
- [ ] **Correr y ver que falla.**
- [ ] **Implementar, regenerar datos y sprites, correr toda la suite.**
- [ ] **Commit:** `feat(stardew): datos de animales, edificios y la casa`.

### Tarea 2: Datos del museo y los libros (`museum_data.py`)

**Archivos:** crear `games/stardew/tools/museum_data.py` y su test. Sale `games/stardew/data/museum.json`.

**Interfaces:**
- Produce `museum.json`:
  - `pieces: [{id, kind:"arch"|"mineral", where:[{k:"dig", places:[[en,es]]} | {k:"geode", geodes:[id]} | {k:"monster", who:[en,es], slug?} | {k:"fish"} | {k:"other", text:[en,es]}]}]`: los 95 donables (`Type` `Arch` o `Minerals`, como `LibraryMuseum.isItemSuitableForDonation`). Excavación de `ArtifactSpotChances`; geodas de `GeodeDrops` y, con `GeodeDropsDefaultItems`, de la tabla de `Utility.getTreasureFromGeode`; monstruos cruzando con `mines.json`; cofres de pesca de la tabla de `FishingRod.openTreasureMenuEndFunction`.
  - `rewards: [{key, need:{ids:[id], tags:[[tag, n]]}, text:[en,es], reward:{id, n, recipe:bool, name:[en,es], sprite?}}]` de `MuseumRewards`. `text` dice qué pide armado con textos del juego (por ejemplo "4 objetos: …" o "15 artefactos").
  - `books: [{id, slug|null, name:[en,es], effect:[en,es], price|null, where:[en,es]}]`: los libros de poder (`Data/Powers`, con su descripción) y los de habilidad, con el precio del Librero y la condición si la hay (año 3, 100 nueces, …).
  - `lostBooks: 21` y el objeto `102`.
  - `refs`.

- [ ] **Test que falla:** hay 95 `pieces` (42 arch, 53 mineral); el Pergamino enano I (`96`) sale excavando en algún lugar; la Esmeralda (`60`) sale de alguna geoda o mina; `rewards` tiene 31 y `dwarf` pide `96,97,98,99` y da `326`; `Book_Trash` tiene efecto en los dos idiomas y precio; `Book_QueenOfSauce` dice que pide 100 nueces; ningún `text` contiene `[` ni `{`.
- [ ] **Correr y ver que falla.**
- [ ] **Implementar, regenerar, correr la suite.**
- [ ] **Commit:** `feat(stardew): datos del museo, sus premios y los libros`.

### Tarea 3: Datos de la Isla Jengibre (`island_data.py`)

**Archivos:** crear `games/stardew/tools/island_data.py` y su test. Sale `games/stardew/data/island.json`.

**Interfaces:**
- Produce `island.json`:
  - `areas: [{key, name:[en,es]}]` en el orden de `IslandHut.ShowNutHint` (norte, oeste, sur, este, volcán, …).
  - `nuts: [{key, area, n, kind:"bush"|"buried"|"limited"|"event"|"puzzle", text:[en,es]}]`: una fila por nuez o grupo, con `key` igual a la clave del juego (`Bush_IslandNorth_13_33`, `Buried_IslandWest_21_81`, `Darts`, `VolcanoBarrel`, `Mermaid`, …) para cruzar con la partida (`collectedNutTracker` y `limitedNutDrops`). `n` > 1 en las de caída limitada. `text` es nuestro, corto ("Arbusto al norte del puente", "Ganale 3 veces a los dardos"), en los dos idiomas.
  - `upgrades: [{key, name:[en,es], cost, area}]`: las mejoras del loro (`ParrotUpgradePerch` en cada `Island*`), con su precio en nueces.
  - `walnutRoom: [{id, gems, name:[en,es], sprite?}]` de `Shops/QiGemShop` (precio = `TradeItemAmount` de `(O)858`).
  - `qiOrders: [{key, name:[en,es], text:[en,es], goal:[en,es], gems, days}]` de `SpecialOrders` con `OrderType "Qi"`, textos de `Strings/SpecialOrderStrings`.
  - `refs`.

- [ ] **Test que falla:** la suma de `n` es 130; todas las `key` son distintas; `Darts` tiene `n 3` y `VolcanoBarrel` `n 5`; toda nuez tiene un `area` de `areas`; hay al menos 10 `upgrades` y el puente del volcán está; el Walnut Room vende `(BC)256` por 15 o 30 gemas; `qiOrders` tiene 12; ningún texto contiene `[`, `{` ni `]`.
- [ ] **Correr y ver que falla.**
- [ ] **Implementar, regenerar, correr la suite.**
- [ ] **Commit:** `feat(stardew): datos de la Isla Jengibre: nueces, mejoras y Qi`.

### Tarea 4: Datos de misiones (`quests_data.py`)

**Archivos:** crear `games/stardew/tools/quests_data.py` y su test. Sale `games/stardew/data/quests.json`.

**Interfaces:**
- Produce `quests.json`:
  - `story: [{key, type, title:[en,es], desc:[en,es], goal:[en,es], money, reward:id|null, next:key|null, from:villagerKey|null}]` de `Quests` (campos separados por `/`) y `Quests.es-ES`.
  - `orders: [{key, who:villagerKey, name:[en,es], text:[en,es], goals:[[en,es]], days, repeat:bool, rewards:[{k:"money", n} | {k:"item", id, n} | {k:"mail", text:[en,es]} | {k:"friendship", n}], board:"town"|"desert"}]` de `SpecialOrders` sin los de Qi (van a la isla). Los `RandomizedElements` se resuelven a una lista de opciones ("Cobre, hierro u oro") en vez del hueco. Lo que se desbloquea con cada pedido (la receta, el arreglo de Robin, …) en `mail` con un texto propio.
  - `refs`.

- [ ] **Test que falla:** hay 66 `story`; la misión `1` ("Meet The Wizard") tiene título en los dos idiomas; `orders` tiene 21 (18 del pueblo, 3 del desierto) y ninguno de Qi; el de Willy pide 100 de carne de insecto y da 3000; ningún texto contiene `{`, `[` ni `]`.
- [ ] **Correr y ver que falla.**
- [ ] **Implementar, regenerar, correr la suite.**
- [ ] **Commit:** `feat(stardew): datos de misiones y pedidos especiales`.

### Tarea 5: Cruces en las fichas de Objetos

**Archivos:** `games/stardew/tools/site_data.py` y `test_site_data.py`; tipos en `site/src/stardew/data.ts`; `site/src/stardew/items/ItemPage.tsx` y sus textos en `stardewCopy.ts`; `site/test/` (el test de la ficha).

**Interfaces:**
- Consume los JSON de las tareas 1 a 4.
- `Source` suma: `{k:"animal"; who: Pair; key: string; deluxe?: true}` (lo produce un animal: enlaza a `farm#<key>`), `{k:"museum"; reward: string; text: Pair}` (premio del museo: enlaza a `museum?v=rewards#<reward>`), `{k:"order"; key: string; name: Pair; tab: "quests" | "island"}` (premio de un pedido o misión) y la fuente `shop` suma `cur?: string` (el id de la moneda cuando no es oro: gemas de Qi `858`, nueces `73`).
- `Ficha` suma `uses: { donate: boolean; builds: [key: string, name: Pair, n: number][]; orders: [key: string, name: Pair, tab: "quests" | "island"][] }`: se dona al museo, qué edificios lo piden como material, qué pedidos lo piden.
- La ficha muestra "Lo produce" (animal), "Museo" (se dona / premio), "Para construir" y "Lo piden" en cajas como las que ya tiene, sólo si hay algo.

- [ ] **Test que falla (Python):** la ficha del Huevo (`176`) tiene una fuente `animal` de la Gallina blanca; la Madera (`388`) tiene `builds` con el Gallinero y 300; el Pergamino enano I tiene `donate true`; el premio `dwarf` aparece como fuente `museum` en la ficha de `326`; la Carne de insecto tiene `orders` con el pedido de Willy.
- [ ] **Test que falla (sitio):** la ficha del Huevo enlaza a `/en/stardew-valley/farm#white-chicken` (o la clave que use la tarea 6) y la de la Madera nombra al Gallinero; un premio sin ficha (`(F)1305`) se muestra sin enlace.
- [ ] **Implementar, regenerar, correr las dos suites y `npx tsc -b`.**
- [ ] **Commit:** `feat(stardew): las fichas de objetos dicen qué animal, edificio, premio y pedido los usan`.

### Tarea 6: Pestaña Granja

**Archivos:** `site/src/stardew/farm/StardewFarm.tsx`, `site/src/stardew/farm/state.ts`, `site/src/styles/stardew-farm.css`, `loadFarm()`/`peekFarm()` en `data.ts`, la ruta `farm`/`granja` en los archivos de las Restricciones globales, textos en `stardewCopy.ts`, `site/test/stardewFarm.test.ts`.

- Vistas por botones (`?v=`): **Animales** (por edificio: sprite adulto y bebé, precio o de dónde sale, días para crecer, cada cuántos días produce, con qué se cosecha, lo que da y lo deluxe en casilleros enlazados, y en qué máquina se procesa cada producto), **Edificios** (de Robin y del Mago por separado: sprite, costo con `Gold`, materiales en casilleros con cantidad, días, de cuál es mejora y qué animales entran) y **Casa** (las tres mejoras y las renovaciones con su precio). Una caja chica de **Cuidados** con `care`.
- `state.ts`: `animalsByHouse(data): [house: string, animals: Animal[]][]` en el orden Gallinero, Establo, otros; `buildingChain(data, key): Building[]` (la cadena Gallinero → grande → de lujo) con el costo acumulado.
- [ ] **Test:** `animalsByHouse` pone a la Gallina blanca en `Coop` y al Avestruz donde diga el dato; `buildingChain("Deluxe Coop")` da tres edificios y el costo acumulado 34000; la página dibuja las tres vistas en los dos idiomas; un animal con `price null` muestra su `from`.
- [ ] **Mirar la barra con 14 pestañas** a 1400 y 375 px: si en escritorio pasa de dos renglones o a 375 px empuja el contenido más de un tercio de pantalla, parar y mostrarle a ZoTaD dos opciones (agrupar en un menú "Más" o una fila desplazable).
- [ ] **Revisar de cerca con `shots.mjs`** (escritorio y 375 px): sprites enteros y sin borrosidad, cifras de costo legibles, nada cortado.
- [ ] **Commit:** `feat(stardew): pestaña Granja: animales, edificios y la casa`.

### Tarea 7: Pestaña Museo (con los libros)

**Archivos:** `site/src/stardew/museum/StardewMuseum.tsx`, `site/src/stardew/museum/state.ts`, `site/src/stardew/checklist.ts` (nuevo), `site/src/stardew/bundles/progress.ts` (pasa a usar `checklist.ts`, misma clave `sdv-cc-v1`, sin cambiar lo que hace), `site/src/styles/stardew-museum.css`, `loadMuseum()` en `data.ts`, la ruta `museum`/`museo`, textos, `site/test/stardewMuseum.test.ts`; `site/src/stardew/save/parse.ts` suma `museum: string[]` (ids de `museumPieces` de `LibraryMuseum`) y su test.

**Interfaces:**
- `checklist.ts`: `readDone(key: string): Done`, `writeDone(key: string, d: Done): void`, `toggle(d: Done, k: string): Done`, con `type Done = Record<string, true>`. Lo usan Centro Comunitario (`sdv-cc-v1`), Museo (`sdv-museum-v1`) e Isla (`sdv-nuts-v1`).
- `state.ts`: `progress(data, done): {pieces: number; total: 95; rewards: {key: string; ok: boolean; missing: number}[]}`: cuántas donó y qué premios ya ganó con lo tildado (el premio pide ids y cantidades por etiqueta: `item_type_arch`, `item_type_minerals`, etc.).
- Vistas: **Colección** (grilla de 95 casilleros tildables, filtro artefactos/minerales/faltan, cada uno con dónde sale al tocarlo), **Premios** (cada premio con lo que pide, lo que falta según lo tildado y el premio en casillero) y **Libros** (libros de poder con efecto, precio y condición; aparte, los 21 libros perdidos como dato del museo). Botón "Traer de mi partida" si el Lector tiene una guardada (`save/store.ts`), como el del Centro Comunitario.

- [ ] **Test:** `readDone` con JSON roto, con acceso que tira y con claves que no existen en `museum.json` da un avance que no las cuenta; tildar los cuatro pergaminos marca `dwarf` como ganado; `progress` con nada tildado da 0/95; el test del Centro Comunitario sigue pasando sin cambios; `parseSave` de la partida mínima lee `museum` (sumar dos piezas a `stardew-save-mini.xml`).
- [ ] **Revisar de cerca con `shots.mjs`** (escritorio y 375 px).
- [ ] **Commit:** `feat(stardew): pestaña Museo con la colección, los premios y los libros`.

### Tarea 8: Pestaña Isla Jengibre

**Archivos:** `site/src/stardew/island/StardewIsland.tsx`, `site/src/stardew/island/state.ts`, `site/src/styles/stardew-island.css`, `loadIsland()` en `data.ts`, la ruta `island`/`isla-jengibre`, textos, `site/test/stardewIsland.test.ts`; `parse.ts` suma `nuts: Record<string, number>` (`collectedNutTracker` vale 1 por clave; `limitedNutDrops`, la cantidad) y su test.

- Vistas: **Nueces** (por zona, cada fila con su texto, cuántas da y su casillero; arriba la cifra "N de 130"), **Mejoras** (las del loro con su precio, en orden de zona), **Walnut Room** (lo que vende con su precio en gemas) y **Pedidos de Qi** (objetivo, días y gemas).
- `state.ts`: `nutCount(data, done): {found: number; total: 130; byArea: Record<string, [found: number, total: number]>}`, donde una fila tildada suma su `n`; del Lector, una clave de caída limitada cuenta lo que diga la partida (hasta `n`).
- [ ] **Test:** tildar `Darts` suma 3; con la partida mínima (sumarle dos `collectedNutTracker` y un `limitedNutDrops` de `VolcanoBarrel` con 2) da 3 y la fila del barril queda a medias; `byArea` suma 130 en total; la página dibuja las cuatro vistas.
- [ ] **Revisar de cerca con `shots.mjs`** (escritorio y 375 px).
- [ ] **Commit:** `feat(stardew): pestaña Isla Jengibre con las 130 nueces y Qi`.

### Tarea 9: Pestaña Misiones

**Archivos:** `site/src/stardew/quests/StardewQuests.tsx`, `site/src/stardew/quests/state.ts`, `site/src/styles/stardew-quests.css`, `loadQuests()` en `data.ts`, la ruta `quests`/`misiones`, textos, `site/test/stardewQuests.test.ts`.

- Vistas: **Pedidos especiales** (tablero del pueblo y del desierto: retrato de quien lo pide, objetivos, días, si se repite, premios en casilleros enlazados) y **Misiones** (las de la historia, en cadena: una lleva a la siguiente; quién la da, objetivo y premio). Filtro por aldeano.
- `state.ts`: `questChains(data): Quest[][]` (sigue `next`; las sueltas son cadenas de uno).
- [ ] **Test:** `questChains` no repite misiones y cubre las 66; la vista de pedidos muestra el de Willy con 3000 y su retrato; ningún texto dibujado contiene `{`, `[` ni `]` (recorrer el HTML del prerender de las dos vistas en los dos idiomas).
- [ ] **Revisar de cerca con `shots.mjs`** (escritorio y 375 px).
- [ ] **Commit:** `feat(stardew): pestaña Misiones con los pedidos especiales`.

### Tarea 10: Portada, SEO, medición y PR

Como la tarea 7 de la etapa 3:
- La Portada suma las cuatro pestañas a su entrada; el buscador de la barra (`navSearch.ts`) suma animales y edificios si los otros juegos buscan más que fichas.
- Las cuatro pestañas en el sitemap de Stardew (los dos idiomas, lastmod real), títulos y descripciones con lo que se busca ("Stardew Valley animals and buildings cost", "Stardew Valley museum rewards", "Golden Walnut locations", "Stardew Valley special orders", "Stardew Valley books 1.6"), JSON-LD.
- `perf.mjs` con las 8 páginas nuevas y las vistas más pesadas (`museum?v=collection`, `island`), dentro del presupuesto.
- `npm run build` antes (la base de la rama) y después, RAM y tiempo, anotados en el diseño como en la etapa 3. Si el tiempo vuelve a subir más que lo que pesan 8 páginas, buscar la causa antes del PR.
- `check:links` en 0; `npm test` y la suite de Python completos; capturas revisadas de cerca.
- Anotar las pestañas en `stardew-coordinacion.md`. Push de la rama y PR contra `main`, **sin fusionar** hasta que ZoTaD lo diga.

## Lo que decide ZoTaD

1. **Cuatro pestañas** (Granja, Museo con Libros, Isla Jengibre, Misiones) en vez de seis, y la barra con 14. Si preferís Libros como pestaña propia, es una ruta más y la vista se mueve.
2. **Sin fichas propias** para animales, edificios, nueces ni misiones: cada fila tiene su ancla (`#`) y las fichas de Objetos enlazan ahí. Fichas de animal serían 14 × 2 páginas más por SEO ("stardew valley cow"); mi recomendación es no hacerlas ahora y ver en Search Console qué se busca.
3. **Textos de las nueces:** el juego no describe cada nuez (las pistas del loro son por zona), así que la frase de cada fila es nuestra, corta. Los nombres de lugares sí salen del juego.
