# Stardew Valley, etapa 3: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development (un subagente implementa cada tarea, otro la revisa, como mucho dos a la vez; el coordinador mira cada pantalla). Los pasos usan casillas (`- [ ]`).

**Objetivo:** sumar a la sección Stardew el **Lector de partida** (la perfección, los paquetes, los regalos de la semana, los peces y recetas que faltan y "qué conviene hacer hoy", todo leído en el navegador) y la pestaña **Minas y combate** (armas, anillos, botas, monstruos con su botín y los pisos de las Minas y de la Caverna Calavera).

**Arquitectura:** la de las etapas 1 y 2 (`docs/superpowers/plans/2026-10-22-stardew-etapa-1.md`, `2026-10-23-stardew-etapa-2.md`). Python lee `games/stardew/raw/` y escribe `games/stardew/data/`. El lector es TypeScript puro y probado: `parse.ts` convierte el XML en un objeto chico (`Save`) y `progress.ts` lo cruza con nuestros datos. React sólo dibuja. El XML no sale del navegador: no hay `fetch` con su contenido ni se guarda entero.

**Diseño:** `docs/superpowers/specs/2026-10-22-stardew-design.md` (etapa 3). La estética A ya está armada (`Box`, `Slot`, `Sprite`, `Gold`). La letra del juego (`--sd-pixel`) va sólo en títulos de 32 px o más; el resto, Nunito (`--sd-text`). Seguí la memoria sobre pulir el diseño: sin `text-shadow` en letra chica, sin bordes ni barras de color en filas o tarjetas (tinte, texto o cifra), cifras legibles, nada cortado.

**Arranque:** el código empieza recién cuando la etapa 2 (`feat/stardew-etapa-2`) esté fusionada en `main`: las dos tocan `route.ts`, `Stardew.tsx`, `stardewCopy.ts`, `areaFiles.ts` y `perf.mjs`. Antes de la tarea 1, `git merge origin/main` en esta rama.

## Restricciones globales

- Todo en español (código, comentarios, commits). Nombres y textos del juego desde `Strings/*` (en y es-ES), nunca de la wiki (CC BY-NC-SA); los números sí se cotejan contra ella. Nada de "sacado de los archivos del juego" en la interfaz.
- Reglas de `CLAUDE.md`: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos por página en frío; `LazyRows` en listas de más de ~150 filas; imágenes `lazy` con tamaño fijo; datos fuera del chunk de entrada, cada pestaña con su `import()`; JSON importados enteros; pestaña nueva en `areaFiles.ts`.
- Direcciones nuevas: `save` → `partida` (sin fichas) y `mines` → `minas` (con fichas de monstruo: `/en/stardew-valley/mines/<slug>`, `/es/stardew-valley/minas/<slug-es>`). Las dos van a `STARDEW_SECTIONS`, `STARDEW_PUBLISHED`, `STARDEW_SECTION_ES`, `TABS`, `TAB_DATA` y `STARDEW_TAB_FILES`; `mines` también a `STARDEW_DETAIL_SECTIONS`. En `STARDEW_TABS` (barra): `mines` después de `fishing` y `save` al final.
- Las reglas del juego que no están en `Data/*` (cuánto vale cada parte de la perfección, qué monstruos salen en qué piso, los cofres de las minas) se leen del código del juego descompilado **sólo como referencia**: el código descompilado no entra al repo. Se copian los valores a una tabla en Python con un comentario que nombra el método de donde salen (por ejemplo `Utility.percentGameComplete`, `MineShaft.populateLevel`). Para descompilar: `dotnet tool install -g ilspycmd` y `ilspycmd -t <Tipo> "Stardew Valley.dll"` a la carpeta temporal.
- El archivo de partida real de ZoTaD no se sube al repo (tiene nombres y datos suyos). Los tests usan una partida mínima escrita a mano con la misma forma (`site/test/fixtures/stardew-save-mini.xml`) y, aparte, un test que sólo corre con `SDV_SAVE=<ruta>` contra una partida real.

## Foco de revisión

- **Paquetes remezclados.** Si la partida tiene los paquetes remezclados de la 1.5+, los paquetes salen de `<bundleData>` de la partida y no de `bundles.json`. El lector muestra los que tiene la partida, con sus objetos de verdad.
- **Ruta Joja.** Con `JojaMember` en el correo, el Centro Comunitario no se completa: el lector lo dice y no muestra paquetes "faltantes". Lo mismo con `ccIsComplete`: todo hecho.
- **Partida cooperativa.** Con granjeros en `<farmhands>`, se elige de quién se mira (el anfitrión por defecto); la perfección es de la granja, los regalos y las recetas son de cada uno.
- **El archivo equivocado o viejo.** `SaveGameInfo` (raíz `<Farmer>`), un archivo que no es XML o uno de la 1.5 (`<gameVersion>` menor a 1.6): un mensaje claro, sin pantalla rota. Uno de 1.5 se lee igual, avisando que la perfección de la 1.6 puede no coincidir.
- **Cambio de semana y de estación.** "Regalos de la semana" con la partida en el día 26 de una estación: los cumpleaños del 1 al 5 de la siguiente también aparecen, con su estación. El día 28 de invierno pasa a la primavera del año siguiente.

---

### Tarea 1: Datos del lector (`save_data.py`)

**Archivos:** crear `games/stardew/tools/save_data.py` y `games/stardew/tools/tests/test_save_data.py`. Sale `games/stardew/data/save.json`.

**Interfaces:**
- Consume `sdv` (`raw`, `text`) y `relations` (`villagers`, `recipes`).
- Produce `save.json`:
  - `perfection: [{key, weight, total}]`, en el orden de la pantalla del juego. Claves: `shipped`, `obelisks`, `clock`, `slayer`, `friends`, `level`, `stardrops`, `cooking`, `crafting`, `fish`, `walnuts`. Pesos y totales copiados de `Utility.percentGameComplete` y sus funciones (`getFarmerItemsShippedPercent`, `getCookedRecipesPercent`, etc.); los pesos suman 100. Los nombres de cada parte, de los textos del juego (`Strings/UI` "PerfectionTracker_*" o la clave que use el juego).
  - `shippable: string[]`: los ids que cuentan para "Productos y recolección enviados", con el mismo filtro que el juego (`Object.isPotentialBasicShipped` o el que use la 1.6.15).
  - `fish: string[]`: los peces que cuentan para "Peces pescados".
  - `cooking` y `crafting: [{key, out}]`: clave de la receta en la partida (`<cookingRecipes>`, `<craftingRecipes>`) y el id de lo que sale, para cruzar con `recipes.json`.
  - `stardrops: [{flag, name:[en,es]}]`: las siete estrellas y la marca de correo de cada una (`CF_Fair`, `CF_Fish`, `CF_Mines`, `CF_Sewer`, `CF_Spouse`, `CF_Statue`, `museumComplete`, según el código), con un nombre de dónde se consigue armado con textos del juego.
  - `obelisks: string[]` (los cuatro obeliscos, por tipo de edificio) y `clock: string` (el Reloj dorado).
  - `slayer: [{key, name:[en,es], targets:[monstruo], count}]` de `Data/MonsterSlayerQuests`.
  - `friends: [{key, max}]`: los aldeanos que cuentan para "Grandes amigos" y los corazones que pide cada uno (8 o 10, según el código).
  - `walnuts: 130` (o lo que diga el código).
  - `queenOfSauce: {"<semana>": key}`: la receta que da la Reina de la Salsa cada semana, de `Data/TV/CookingChannel`, para "qué conviene hacer hoy".

- [ ] Test que falla: los pesos suman 100; `shippable` incluye la Chirivía (`24`) y no el Pastel rosa (`221`); `fish` incluye el Pez globo (`128`) y no la Basura (`168`); `cooking` tiene una entrada con `out "221"`; hay 7 `stardrops`; `slayer` incluye `Slimes` con 1000 y sus 4 objetivos; `friends` incluye a Abigail y no al Enano si el código no lo cuenta.
- [ ] Implementar, regenerar y correr toda la suite de Python (`python -m unittest discover -s games/stardew/tools/tests`).
- [ ] Commit: `feat(stardew): datos de la perfección y de la partida para el lector`.

### Tarea 2: Datos de minas y combate (`mines_data.py`) y sus sprites

**Archivos:** crear `games/stardew/tools/mines_data.py` y `games/stardew/tools/tests/test_mines_data.py`; sumar a `sprites.py` las armas (`TileSheets/weapons`, 16 px), las botas (de su índice en `springobjects`), las baratijas (`TileSheets/Objects_2`) y el primer cuadro de cada monstruo (`Characters/Monsters/<nombre>.png`, 16×24 o 16×32 según el archivo; el ancho y alto van en el dato). Salen `games/stardew/data/mines.json` y los PNG en `site/public/stardew/`.

**Interfaces:**
- `mines.json`:
  - `weapons: [{id:"(W)n", slug, name:[en,es], desc:[en,es], type:0-4, dmg:[min,max], speed, crit:[chance, mult], knockback, precision, defense, aoe, floors:[base,min]|null (MineBaseLevel/MineMinLevel; null si es -1), shop:{shop:[en,es], price}|null}]`. Tipo: 0 espada de estocada, 1 daga, 2 maza, 3 espada, 4 tirachinas, con el nombre de `Strings/StringsFromCSFiles` que usa el juego en la descripción del arma. La tienda, de `Data/Shops` (`AdventureShop` y las demás que vendan `(W)`).
  - `boots: [{id:"(B)n", name, desc, price, defense, immunity, shop|null}]` de `Data/Boots` (campos separados por `/`).
  - `rings: [{id, slug, name, desc, price}]`: los objetos de tipo `Ring` (31), enlazados a su ficha de Objetos. `trinkets: [{id:"(TR)k", name, desc}]` de `Data/Trinkets` con `DropsNaturally` o los que se consiguen jugando.
  - `monsters: [{key, slug, slugEs, name:[en,es], hp, dmg, def, speed, xp, coins:[min,max], loot:[[id, chance]], where:[{zone, floors:[desde,hasta]}], dangerous:bool (tiene versión `_dangerous`), slayer:key|null, sprite:[w,h]}]`. Campos de `Data/Monsters` por posición (salud, daño, monedas mín y máx, …, botín en pares, …, experiencia, nombre). El nombre en español, del último campo de `Monsters.es-ES`.
  - `zones: [{key, name:[en,es], floors:[desde,hasta], monsters:[key], ores:[id], note?}]`: Minas 1–39, 40–79 (hielo), 80–120 (lava), la Caverna Calavera, más los pisos de baba y de infestación si el código los separa. Copiado de `MineShaft.populateLevel` y de lo que decide qué piedras salen.
  - `chests: [{floor, item, name}]`: los cofres de los pisos 10, 20, … 120 de las Minas (de `MineShaft` o `Data/Mines` si existe), y el ascensor cada 5 pisos como dato fijo de la pantalla.
  - `refs`: los objetos nombrados (botín, minerales, premios), con la forma de `Ref` de `data.ts`.

- [ ] Test que falla: la Espada oxidada (`(W)0`) tiene daño `[2,5]` y tipo 3; el Sable de plata (`(W)1`) aparece desde el piso 45; las Botas de goma (`(B)505`) dan defensa 0 e inmunidad 1; hay 31 anillos; la Baba verde suelta Baba (`766`) con 0,75; el Bruto de las sombras sale en los pisos 80–120 y en la Caverna Calavera; el cofre del piso 10 da algo y el del 120 da la Calavera (si es así en el código); todos los monstruos de `zones` existen en `monsters`.
- [ ] Implementar, regenerar los datos y los sprites, correr la suite.
- [ ] Commit: `feat(stardew): datos de armas, anillos, botas, monstruos y pisos`.

### Tarea 3: El lector del XML (`save/parse.ts`)

**Archivos:** crear `site/src/stardew/save/parse.ts`, `site/test/stardewSaveParse.test.ts`, `site/test/fixtures/stardew-save-mini.xml`. Suma `@xmldom/xmldom` a las `devDependencies` del sitio (los tests corren en Node, que no tiene `DOMParser`; en el navegador se usa el nativo).

**Interfaces:**
- `parseSave(xml: string, parser?: { parseFromString(s: string, type: string): Document }): Save | SaveError`. Sin `parser` usa `new DOMParser()`.
- `type SaveError = { error: "not-xml" | "save-info" | "not-save"; }`.
- `interface Save { version: string; farm: string; season: 0|1|2|3; day: number; year: number; weatherTomorrow: string; raining: boolean; players: Player[]; bundles: SaveBundles; walnuts: number; buildings: string[] /* tipos en la granja */; joja: boolean; ccComplete: boolean; items: Record<string, number> /* id → cantidad, sumando inventario de todos y todos los cofres de todos los lugares */ }`.
- `interface Player { name: string; host: boolean; skills: [farming, fishing, foraging, mining, combat, luck]; shipped: Record<string, number>; fish: Record<string, number>; cooking: string[] /* conocidas */; cooked: Record<string, number>; crafting: Record<string, number> /* veces fabricada; 0 = conocida sin hacer */; mail: string[]; friends: Record<string, { points: number; giftsWeek: number; giftToday: boolean; status: string }>; kills: Record<string, number>; inventory: Record<string, number> }`.
- `interface SaveBundles { defs: { room: string; index: number; name: string; items: [id: string, qty: number, quality: number][]; need: number }[] /* de <bundleData> */; done: Record<number, boolean[]> /* de CommunityCenter <bundles> */ }`.
- Los ids se normalizan como en nuestros datos: sin el prefijo `(O)` en objetos, con él en el resto (`(BC)`, `(W)`, …).

- [ ] La partida mínima a mano: un anfitrión y un granjero invitado, un cofre en la granja y otro en una casa, dos paquetes hechos y uno a medias, un aldeano con regalo esta semana, una receta conocida sin cocinar y otra cocinada, peces y envíos. Sacá la forma exacta (nombres de etiquetas, `xsi:type`, cómo se escriben los diccionarios `<item><key>…</key><value>…</value></item>`) de la partida real de ZoTaD, si dio permiso para leerla, y si no de una partida nueva creada en el juego.
- [ ] Tests que fallan: lee la estación, el día, el año y los dos granjeros; suma los objetos de los dos cofres y de los dos inventarios; `<Farmer>` como raíz da `{error: "save-info"}`; un texto cualquiera da `{error: "not-xml"}`; los paquetes salen de `<bundleData>` aunque difieran de `bundles.json`; `JojaMember` en el correo da `joja: true`.
- [ ] Test aparte, salteado sin `SDV_SAVE`: lee la partida real sin error y en menos de 2 s.
- [ ] Implementar y pasar. `npx tsc -b` limpio.
- [ ] Commit: `feat(stardew): lector del archivo de partida`.

### Tarea 4: El motor del lector (`save/progress.ts`)

**Archivos:** crear `site/src/stardew/save/progress.ts` y `site/test/stardewSaveProgress.test.ts`. TypeScript puro.

**Interfaces:**
- Consume `Save`/`Player` (tarea 3), `save.json` (tarea 1), y de la etapa 2 `fish.json`, `recipes.json`, `crops.json` (`harvests`/`profit` de `crops/calc.ts`) y `calendar.json`.
- `perfection(save: Save, data: SaveData): { total: number /* 0-100 */; parts: { key: string; weight: number; done: number; total: number; pct: number; missing: string[] /* ids o claves */ }[] }`. Mismas cuentas que `Utility.percentGameComplete` (la granja entera: lo mejor de cada granjero donde el juego hace eso).
- `bundleStatus(save: Save): { room: string; bundles: { index: number; name: string; done: boolean; missing: [id, qty, quality][]; have: Record<string, number> /* lo que ya tiene en cofres */ }[] }[] | "joja" | "complete"`.
- `weekGifts(save: Save, player: Player, villagers: Villager[]): { key: string; birthday: [season, day]; inDays: number; hearts: number; giftsWeek: number; loved: { id: string; have: number }[] }[]`: los aldeanos que cumplen en los próximos 7 días (cruzando estación y año), ordenados por cercanía, y para cada uno lo que le encanta con cuántos tiene la granja.
- `missingFish(player, fish)` y `missingRecipes(player, recipes)`: lo que falta, con cuáles se pueden conseguir **en la estación de la partida** primero.
- `today(save: Save, player: Player, data): Tip[]` con `type Tip = { kind: "birthday" | "festival" | "plant" | "fish" | "bundle" | "tv" | "cart"; ids: string[]; text?: string }`. Reglas, en este orden: cumpleaños hoy (con el regalo que le encanta y tiene); festival hoy o mañana; últimos días para plantar (cultivos de la estación que todavía llegan a cosecharse si se plantan hoy, y que dejan de llegar mañana); peces de la estación que le faltan y que se van al terminar la estación; objetos de paquetes de esta estación que le faltan y no tiene; la Reina de la Salsa (domingo, si la receta de esa semana no la conoce); el carro ambulante (viernes y domingo).

- [ ] Tests que fallan, sobre la partida mínima: la perfección da un total entre 0 y 100 y la parte de recetas cuenta la cocinada; un paquete hecho no aparece como faltante y uno a medias lista sólo lo que le falta; con la partida en el 26 de verano, `weekGifts` trae a un aldeano que cumple el 2 de otoño con `inDays 4`; el 28 de invierno pasa a la primavera; con `joja: true`, `bundleStatus` da `"joja"`; `today` el día de un cumpleaños lo pone primero.
- [ ] Implementar y pasar. `npx tsc -b` limpio.
- [ ] Commit: `feat(stardew): perfección, paquetes, regalos de la semana y qué hacer hoy`.

### Tarea 5: Pestaña Lector de partida

**Archivos:** `site/src/stardew/save/StardewSave.tsx` (y lo que haga falta en esa carpeta), `site/src/styles/stardew-save.css`, la ruta `save`/`partida` en los archivos de las Restricciones globales, textos en `stardewCopy.ts`, `site/test/stardewSave.test.ts`.

- Sin partida (y en el prerender): una caja de menú con el lugar para soltar el archivo o elegirlo (`<input type="file">`), dónde está en cada sistema (`%AppData%\StardewValley\Saves\<granja>\<granja>` en Windows, `~/.config/StardewValley/Saves` en Linux y Mac) y una línea que diga que el archivo se lee en el navegador y no se sube a ningún lado. Ese texto es lo que indexa Google.
- Con partida: arriba la granja, el día y el granjero (selector si hay invitados). Después, en cajas: **Hoy** (los `Tip`, cada uno con sus casilleros enlazados a sus fichas), **Perfección** (el total como cifra y una fila por parte con lo hecho sobre el total; al abrirla, lo que falta en casilleros), **Regalos de la semana** (retrato, en cuántos días, corazones, y lo que le encanta marcando lo que ya tiene), **Centro Comunitario** (lo que falta por sala; con un botón que pasa lo hecho al checklist de la pestaña Centro Comunitario, con `progress.ts` de bundles y su misma clave de `localStorage`), **Peces** y **Recetas** que faltan.
- Se guarda en `localStorage` sólo el `Save` ya leído (no el XML), con un botón "Olvidar esta partida"; al volver se muestra sin subirla de nuevo. Cada lectura y escritura con `try/catch`.
- Las listas largas (envíos que faltan pueden pasar de 150) con `LazyRows`. Los errores de la tarea 3 se muestran con un texto claro en la misma caja.
- [ ] Test de pantalla con la partida mínima: aparecen las cinco cajas; un archivo `SaveGameInfo` muestra el aviso y no rompe.
- [ ] Revisar de cerca con `shots.mjs` (escritorio y 375 px) con la partida real si ZoTaD la prestó.
- [ ] Commit: `feat(stardew): pestaña Lector de partida`.

### Tarea 6: Pestaña Minas y combate y las fichas de monstruo

**Archivos:** `site/src/stardew/mines/StardewMines.tsx`, `site/src/stardew/mines/MonsterPage.tsx`, `site/src/stardew/mines/state.ts`, `site/src/styles/stardew-mines.css`, la ruta `mines`/`minas` (con fichas), `loadMines()` en `data.ts`, textos en `stardewCopy.ts`, `site/test/stardewMines.test.ts`. En `site_data.py`, la fuente `{k:"monster"}` de las fichas de Objetos suma el slug del monstruo para enlazar a su ficha.

- Una pantalla con vistas elegidas por botones (y en la dirección, `?v=`): **Pisos** (por zona: los pisos, sus monstruos con sprite, sus minerales y los cofres con su premio), **Monstruos** (grilla con salud, daño, experiencia y su botín en casilleros), **Armas** (tabla ordenable por daño, velocidad o crítico, filtrable por tipo, con dónde se consigue: pisos o tienda y precio), **Anillos y baratijas** (casilleros con su efecto, enlazados a Objetos) y **Botas** (defensa, inmunidad, dónde).
- La ficha de un monstruo: sprite grande, estadísticas, botín con probabilidad (enlazado a Objetos), en qué pisos sale, si tiene versión peligrosa y la meta del Gremio de Aventureros con su premio.
- [ ] Test: `state.ts` ordena las armas por daño medio; la ficha de la Baba verde existe en los dos idiomas; un objeto que suelta un monstruo enlaza a su ficha.
- [ ] Revisar de cerca con `shots.mjs` (escritorio y 375 px).
- [ ] Commit: `feat(stardew): pestaña Minas y combate con fichas de monstruo`.

### Tarea 7: SEO, medición y PR

Como la tarea 8 de las etapas 1 y 2:
- Las dos pestañas y las fichas de monstruo en el sitemap de Stardew (los dos idiomas, lastmod real), títulos y descripciones con lo que se busca ("Stardew Valley save file reader perfection tracker", "Stardew Valley weapons stats", "Stardew Valley monster drops", "Skull Cavern floors"), JSON-LD.
- `perf.mjs` con `/en/stardew-valley/save`, `/es/stardew-valley/partida`, `/en/stardew-valley/mines`, `/es/stardew-valley/minas` y una ficha de monstruo por idioma, dentro del presupuesto. El lector también medido con la partida cargada (a mano: nodos y tiempo de lectura) y anotado acá.
- `npm run build` antes y después (RAM y tiempo) anotado en el diseño; `check:links` en 0; `npm test` y la suite de Python completos; capturas revisadas de cerca.
- Push de la rama y PR contra `main`, **sin fusionar** hasta que ZoTaD lo diga. Con su visto bueno: fusionar, confirmar el deploy de Actions y abrir las páginas en vestigo.gg.

## Lo que decide ZoTaD

1. **Leer tu partida** `%AppData%\StardewValley\Saves\Zoth_177904899` para sacar la forma del XML y probar el lector. Se copia a la carpeta temporal y no entra al repo.
2. **Instalar `ilspycmd`** (herramienta de .NET, de nuget.org) para leer las reglas del código del juego. Sin él, las tablas de perfección y pisos salen de cotejar la wiki con los datos, y son menos confiables.
3. **Fichas por monstruo** (51 × 2 idiomas = 102 páginas más; mi recomendación, por el SEO de "monster drops") o sólo la pestaña. Las armas quedan en la tabla, sin ficha.
