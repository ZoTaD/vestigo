# Stardew Valley, etapa 2 — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development. Los pasos usan casillas (`- [ ]`).

**Objetivo:** sumar a la sección Stardew las pestañas **Cultivos** (con calculadora de ganancias), **Pesca** ("qué puedo pescar ahora"), **Recetas y máquinas** y **Calendario**, más los festivales de la 1.6 en la portada.

**Arquitectura:** la misma de la etapa 1 (`docs/superpowers/plans/2026-10-22-stardew-etapa-1.md`). Python lee `games/stardew/raw/` y escribe `games/stardew/data/`. Las cuentas de la calculadora se hacen en el navegador, en TypeScript puro y probado. Cada pestaña viaja en su propio chunk, como Objetos, Aldeanos y Centro Comunitario.

**Diseño:** `docs/superpowers/specs/2026-10-22-stardew-design.md` (etapa 2). La estética A ya está armada: `Box` (marco de menú con `fill`), `Slot`, `Sprite`, `Gold`. La letra del juego (`--sd-pixel`) va sólo en títulos de 32 px o más; pestañas, botones, números y rótulos van en Nunito (`--sd-text`). Leé la memoria del proyecto sobre pulir el diseño: sin `text-shadow`, cifras legibles y sin huecos.

## Restricciones globales

- Las mismas de la etapa 1: todo en español; nombres y textos del juego desde `Strings/*` (en/es); nada copiado de la wiki (los números sí se pueden cotejar); sin "sacado de los archivos del juego"; reglas de `CLAUDE.md` (presupuesto por página, `LazyRows`, imágenes lazy de tamaño fijo, datos fuera del chunk de entrada, JSON enteros).
- Direcciones nuevas: `crops` → `cultivos`, `fishing` → `pesca`, `recipes` → `recetas`, `calendar` → `calendario`. Son pestañas sin fichas propias: cada cultivo, pez o receta enlaza a su ficha de Objetos.
- Los estados de la calculadora y de los filtros viajan en la dirección (`?`), así se pueden compartir. El prerender sale con los valores por defecto.
- Una sola pantalla por pestaña. Las tablas largas van con `LazyRows`.

## Foco de revisión

- La calculadora con un cultivo que rebrota (Arándano, Fruta antigua) y uno que crece en dos estaciones (Maíz, Café). Tiene que contar bien las cosechas hasta el fin de la estación, o de las dos.
- Un cultivo que no llega a dar cosecha si se planta tarde: aparece con 0 cosechas y ganancia negativa, no desaparece ni da NaN.
- Pesca a una hora que cruza la medianoche (las 2 de la mañana son `2600` en el juego).
- Un pez con lugar sólo en la isla, o sólo en trampa para cangrejos: los filtros no lo pierden.
- Un festival de varios días (Mercado Nocturno 15–17 de invierno) en el calendario y en la portada.

---

### Tarea 1: Datos de cultivos y calendario (`crops_data.py`)

**Archivos:** crear `games/stardew/tools/crops_data.py` y su test `games/stardew/tools/tests/test_crops_data.py`. Sale `games/stardew/data/crops.json` y `games/stardew/data/calendar.json`. Se modifica `site_data.py` para que `home.json` sume los festivales pasivos.

**Interfaces:**
- Consume: `sdv` (`raw`, `text`, `sell_prices`), `relations` (`machines_by_input`, `sources_by_item`), las formas de `site_data.py`.
- Produce `crops.json`: `{crops: [{seed, harvest, slug, slugEs, name:[en,es], seasons:[0-3], phases:[días], regrow:int (-1 = no), stack:[min,max], extraChance:float, perLevel:float, raised:bool, paddy:bool, price:int (venta del cosechado), cat:int, seedPrice:int|null (el precio de compra más barato entre las tiendas de semillas que la venden siempre: Pierre, Joja, Oasis, el carro; null si no se vende), seedShop:[en,es]|null, products:[{machine:"(BC)n", name:[en,es], price:int, days:float}]}], fruitTrees: [... misma idea: sapling, harvest, seasons, saplingPrice, price, products ...]}`. `products` es lo que ya calcula `relations.machines_by_input` para el cosechado: Barril, Envasadora y Deshidratador (este último es por 5 frutos; dejalo dicho en un campo `per:5`).
- Produce `calendar.json`: `{seasons: [{days: {"<día>": {birthdays:[clave aldeano], festivals:[{id, name:[en,es], from:día, to:día, passive:bool}]}}}×4]}`, con los festivales de `Data/Festivals/FestivalDates` y los pasivos de `Data/PassiveFestivals` (`Season`, `StartDay`, `EndDay`, `DisplayName`). Los cumpleaños, de `relations.villagers()`.
- `home.json` (portada): `seasons[n].festivals` suma los pasivos con su rango (`[día desde, día hasta, [en, es]]`; los de un día tienen desde = hasta).

- [ ] Test que falla: el Melón (`seed 479`) tiene `phases [1,2,3,3,3]`, `regrow -1`, temporada verano, `seedPrice 80` en Pierre, y productos con 750 (Barril) y 550 (Envasadora). El Arándano (`481`) rebrota (`regrow 4`). El Maíz (`487`) tiene dos estaciones (verano y otoño). El calendario de invierno trae el Mercado Nocturno del 15 al 17 (`passive: true`). La portada de primavera trae el Festival del Desierto (15–17).
- [ ] Implementar, regenerar los datos y correr toda la suite de Python.
- [ ] Commit: `feat(stardew): datos de cultivos, frutales y calendario con los festivales de la 1.6`.

### Tarea 2: Datos de pesca, recetas y máquinas (`more_data.py`)

**Archivos:** crear `games/stardew/tools/more_data.py` y `games/stardew/tools/tests/test_more_data.py`. Salen `games/stardew/data/fish.json` y `games/stardew/data/recipes.json`.

**Interfaces:**
- `fish.json`: `{fish: [{id, slug, slugEs, name, difficulty:int, behavior, times:[[desde,hasta]…] (formato del juego, 600 a 2600), seasons:[0-3], weather:"sunny"|"rainy"|"both", minLevel:int, legendary:bool, crabPot:bool, places:[{key, name:[en,es], seasons:[…]|null}] }], places: [{key, name:[en,es]}]}`. Las horas y el clima salen de `Data/Fish` (campos separados por `/`: nombre, dificultad, comportamiento, tamaño mín y máx, horas en pares, estaciones, clima, …, nivel mínimo). Los lugares salen de `Data/Locations[*].Fish`, con la estación de cada entrada si la tiene. Los peces de trampa (`Data/Fish` con `trap`) llevan `crabPot: true` y su agua (dulce o salada) como lugar. Los legendarios: Crimsonfish, Angler, Legend, Glacierfish, Mutant Carp y sus versiones de la 1.6 ("Son of…", "Ms. Angler", etc.); marcalos por la lista de `IsBossFish` de `Locations` cuando exista.
- `recipes.json`: `{recipes: [{kind:"craft"|"cook", out:id, qty, name:[en,es], ings:[[id_o_categoría, n]], unlock:{type:"default"|"skill"|"friend"|"tv"|"other", skill?:"Farming"|…, level?:int, npc?:clave, hearts?:int}}], machines: [{id:"(BC)n", slug, name:[en,es], recipe?:índice en recipes, rules:[{in: id|tag, inName:[en,es], out: id, outName:[en,es], minutes:int, price:int}]}], refs: {…}}`. El desbloqueo sale del campo correspondiente de `CraftingRecipes`/`CookingRecipes` (`default`, `l 4`, `s Farming 3`, `f Gus 5`, y la TV o el resto quedan `other` si no hay forma clara). Los nombres de habilidad y de aldeano, de los textos del juego.

- [ ] Test que falla: el Pez globo (`128`) va de `[[1200,1600]]`, verano, soleado, en la Playa. La Perca (`136`) tiene las cuatro estaciones en la Montaña. El Rey Rata no es pez: no está. La Mayonesa no es receta, pero la Mayonesera (`(BC)24`) es máquina con el Huevo (`176`) entrando. El Pastel rosa (`221`) es de cocina y lleva el Melón (`254`). Hay al menos 5 legendarios.
- [ ] Implementar, regenerar y correr la suite.
- [ ] Commit: `feat(stardew): datos de pesca, recetas y máquinas`.

### Tarea 3: El motor de la calculadora (`crops/calc.ts`)

**Archivos:** crear `site/src/stardew/crops/calc.ts` y `site/test/stardewCalc.test.ts`. Es TypeScript puro, sin React.

**Interfaces:**
- `type Fert = "none" | "basic" | "quality" | "deluxe" | "speed" | "deluxeSpeed" | "hyper"`.
- `interface Opts { season: 0|1|2|3; day: number /* 1-28 */; level: number /* 0-10 */; fert: Fert; tiller: boolean; agriculturist: boolean; artisan: boolean; sell: "raw" | "best" /* mejor entre crudo y productos */; seeds: "buy" | "own"; greenhouse: boolean }`.
- `growDays(phases: number[], speed: number): number`: los días de crecimiento con la reducción del juego. Se quitan `ceil(total × speed)` días, de a uno por fase, recorriendo las fases desde la segunda hasta la última y volviendo a empezar (hasta 3 vueltas), sin bajar ninguna fase de 1. `speed` = 0,10 (Speed-Gro), 0,25 (Deluxe), 0,33 (Hyper), más 0,10 si es Agricultor (se suman).
- `qualityOdds(level: number, fert: Fert): [normal, plata, oro, iridio]`: nivel de fertilizante q = 0, 1, 2 o 3 (none/speed = 0; basic 1, quality 2, deluxe 3). Oro = 0,2·(nivel/10) + 0,2·q·((nivel+2)/12) + 0,01. Plata = min(0,75, oro·2). Iridio sólo con q = 3: oro/2. Con q = 3 nunca sale normal (mínimo plata). Se aplican en orden: iridio, oro, plata, normal. Devuelve las probabilidades finales, que suman 1.
- `harvests(crop, opts): number[]`: los días en que se cosecha. Planta el día `day` y cuenta hasta el día 28 de la última estación seguida en `crop.seasons` (en el invernadero: 28 días desde la siembra, sin estaciones). Los que rebrotan se replantan una vez; los que no, se replantan al cosechar si hay tiempo.
- `profit(crop, opts): { harvests: number; yield: number /* unidades */; gross: number; seedCost: number; net: number; perDay: number; best: "raw" | "(BC)n" }`. El precio crudo esperado se arma con `qualityOdds` y los multiplicadores de calidad (×1; ×1,25; ×1,5; ×2), con Labrador (+10 %) en verdura, fruta y flor. Con `sell: "best"` compara crudo contra cada producto (los productos no tienen calidad; Artesano +40 %; el deshidratador cuenta por 5). Las unidades extra: `stack` y `perLevel` (`min(max, min + floor(nivel·perLevel))`) más `extraChance` como geométrica (`p/(1-p)`). `perDay` = neto ÷ días desde la siembra hasta la última cosecha (o hasta fin de estación si no hay cosecha).

- [ ] Tests que fallan, con números calculados a mano con estas reglas y cotejados contra la wiki (sin copiar texto):
  - `qualityOdds(0, "none")` ≈ `[0.97, 0.02, 0.01, 0]`; `qualityOdds(10, "deluxe")` no tiene normal y suma 1.
  - `growDays([1,2,2,2], 0.1)` (Chirivía con Speed-Gro) = 6… calculalo con la regla y escribí el valor; `growDays` de la Fresa con Hyper.
  - Chirivía, primavera día 1, nivel 0, sin fertilizante, comprando semillas: 6 cosechas.
  - Arándano, verano día 1: 4 cosechas con 13 días de crecimiento y rebrote cada 4 (días 14, 18, 22, 26).
  - Maíz plantado el día 1 de verano cosecha también en otoño.
  - Melón plantado el 20 de verano: 0 cosechas, `net` negativo y `perDay` finito.
  - Con `sell: "best"` y Artesano, el Melón elige el Barril.
- [ ] Implementar y pasar. `npx tsc -b` limpio.
- [ ] Commit: `feat(stardew): motor de la calculadora de cultivos`.

### Tarea 4: Pestaña Cultivos con la calculadora

**Archivos:** `site/src/stardew/crops/StardewCrops.tsx` (y lo que haga falta en esa carpeta), `site/src/styles/stardew-crops.css`, más su línea en `route.ts` (`crops`/`cultivos`), `STARDEW_PUBLISHED`, `TABS`, `TAB_DATA`, `STARDEW_TAB_FILES`, `stardewCopy.ts`, `site/test/stardewCrops.test.ts`.

- Arriba, en una caja de menú: estación (cuatro botones), día de siembra (1 a 28), nivel de agricultura (0 a 10), fertilizante (con su sprite), profesiones (Labrador, Agricultor, Artesano), "vender crudo o lo mejor", "semillas compradas o propias" e invernadero. Todo queda en la dirección.
- Abajo, una tabla ordenada por oro por día: sprite y nombre (enlace a la ficha), cosechas, días de crecimiento, bruto, semillas, neto, **oro por día** destacado como cifra (no con color de borde), y cómo conviene venderlo (crudo o el producto, con el sprite de la máquina). Se puede ordenar por cualquier columna. Los que no llegan a cosecharse van al final, apagados, con "no llega".
- Debajo, los frutales, con su propia tabla corta (días hasta que dan fruto, precio del retoño, ganancia por estación).
- Prueba en pantalla: con los valores por defecto (primavera día 1, nivel 0, sin fertilizante), la primera fila no es un cultivo de otra estación, y cambiar a verano cambia el orden.
- [ ] Commit: `feat(stardew): pestaña Cultivos con calculadora de ganancias`.

### Tarea 5: Pestaña Pesca

**Archivos:** `site/src/stardew/fishing/StardewFishing.tsx`, `site/src/styles/stardew-fishing.css`, ruta `fishing`/`pesca` y lo mismo que la tarea 4 para sumar la pestaña, `site/test/stardewFishing.test.ts`.

- "¿Qué puedo pescar ahora?": lugar (lista de `places`), estación, clima (sol/lluvia) y hora (6:00 a 2:00, con un deslizador o botones por franja). La grilla de casilleros muestra los peces que se pueden pescar con eso. Cada uno trae su dificultad y sus horas, y enlaza a su ficha.
- "Todos los peces": la tabla completa (74), filtrable, con las columnas lugar, estaciones, clima, horas, dificultad y precio. Los legendarios y los de trampa se ven a simple vista con una etiqueta de texto, no con un color de borde.
- Una función pura `canCatch(fish, {place, season, weather, time}): boolean`, probada con el pez de horario que cruza la medianoche y con uno de trampa.
- [ ] Commit: `feat(stardew): pestaña Pesca con qué se puede pescar ahora`.

### Tarea 6: Pestaña Recetas y máquinas

**Archivos:** `site/src/stardew/recipes/StardewRecipes.tsx`, `site/src/styles/stardew-recipes.css`, ruta `recipes`/`recetas`, `site/test/stardewRecipes.test.ts`.

- Tres vistas en la misma página, elegidas con botones (y en la dirección): **Cocina**, **Fabricación** y **Máquinas**.
- Recetas: grilla de tarjetas con el plato o el objeto, sus ingredientes como casilleros chicos con cantidad, y cómo se aprende (habilidad y nivel, aldeano y corazones, o TV), escrito con el texto de interfaz de `stardewCopy.ts` y los nombres del juego. Buscador por nombre o por ingrediente.
- Máquinas: una caja por máquina con lo que entra, lo que sale, el tiempo y el precio. El sprite de la máquina enlaza a su ficha de Objetos.
- [ ] Commit: `feat(stardew): pestaña Recetas y máquinas`.

### Tarea 7: Pestaña Calendario y festivales en la portada

**Archivos:** `site/src/stardew/calendar/StardewCalendar.tsx`, `site/src/styles/stardew-calendar.css`, ruta `calendar`/`calendario`, ajuste de `StardewHome.tsx` (festivales con rango; clave `${desde}-${nombre}`), `site/test/stardewCalendar.test.ts`.

- El calendario como el tablón del juego: una grilla de 4×7 días por estación, con la estación elegida arriba. Cada día muestra el retrato del cumpleañero y el festival, con un rango visible para los de varios días. Al tocar un día se ve el detalle: los regalos que le encantan a ese aldeano (casilleros enlazados) y el festival.
- La portada muestra los festivales pasivos con su rango ("15–17").
- [ ] Commit: `feat(stardew): calendario y festivales de la 1.6`.

### Tarea 8: SEO, medición y PR

Como la tarea 8 de la etapa 1: las cuatro pestañas en el sitemap (en los dos idiomas), títulos y descripciones con lo que se busca ("Stardew Valley crop profit calculator", "what fish can I catch", "cooking recipes", "calendar birthdays festivals"), JSON-LD, `perf.mjs` con las 8 páginas nuevas (las 4 pestañas en `/en` y en `/es`) dentro del presupuesto, build antes y después (RAM y tiempo), `check:links` en 0, `npm test` completo, capturas, push de `feat/stardew-etapa-2` y PR contra `main` sin fusionar.
