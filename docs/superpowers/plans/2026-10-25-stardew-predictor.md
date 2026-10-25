# Predictor de Stardew Valley 1.6: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: superpowers:subagent-driven-development (un subagente implementa cada
> tarea y otro la revisa, máximo 2 a la vez). Los pasos usan casillas (`- [ ]`).

**Objetivo:** una pestaña "Predictor" en la sección Stardew de vestigo.gg que, desde la semilla de la partida (a mano o
del Lector), predice exacto para la 1.6.15 qué sale de las geodas y cajas, el clima, los pisos infestados de las Minas,
lo que vende el carro ambulante, la suerte del día y los eventos de la noche.

**Arquitectura:** el generador del juego se reescribe en TypeScript puro en `site/src/stardew/predict/` (sin importar
nada del sitio): `System.Random` de .NET, el xxHash32 de `Game1.hash` y las semillas de `Utility`. Cada predicción es
una función pura `(entrada, datos) → resultado`. Un programa .NET local (`games/stardew/tools/oracle/`) carga la DLL
del juego, llama a su código real y escribe fixtures JSON; los tests de vitest comparan contra esos fixtures. El
oráculo nunca va al sitio y el código descompilado nunca va al repo: la lógica se reescribe nombrando el método de
origen.

**Tecnología:** TypeScript + React (Vite), vitest, `@xmldom/xmldom` en tests; C# compilado con el `csc` de Visual
Studio contra la DLL del juego (.NET 6); Python para los datos (`games/stardew/tools/`).

**Diseño:** `docs/superpowers/specs/2026-10-22-stardew-design.md` (apartado "Después": predictor).

## Restricciones globales

- Todo en español rioplatense: código, comentarios, commits. Nada de la wiki (CC BY-NC-SA).
- Exactitud primero: si algo no se puede replicar exacto, se deja afuera y se dice. Nunca se muestra una predicción que
  puede fallar sin decir de qué depende.
- El código descompilado (`<scratchpad>/ilspy/all/sdv.cs`) es sólo referencia; cada función TS nombra el método del
  juego que replica (p. ej. `// Utility.getTreasureFromGeode`).
- `CLAUDE.md`: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos al abrir en frío; datos por `import()`, nunca en el chunk
  de entrada; JSON importados enteros; imágenes de lista `loading="lazy"`, `decoding="async"` y tamaño fijo; pestaña
  nueva en `areaFiles.ts`; páginas nuevas en `PAGES` de `site/scripts/perf.mjs`.
- Estética A "Menú del juego" (`site/src/stardew/ui.tsx`: `Box`, `Sprite`, `Slot`, `Gold`, `Group`, `Pill`): sin
  `text-shadow` en letra chica, sin bordes ni barras de color, cifras legibles, nada cortado, fuente pixel que no
  confunda C/O ni 5/8.
- UI sin "sacado de los archivos del juego"; sí el aviso de no afiliación que ya tiene la sección.
- RAM: `npm run build` y `npm run perf` nunca a la vez entre sesiones (`builds.md` de la carpeta de notas compartida).
- Otras sesiones tocan `route.ts`, `Stardew.tsx`, `stardewCopy.ts`, `areaFiles.ts`, `perf.mjs` y el sitemap: sumar
  sólo nuestras líneas.
- No fusionar sin que ZoTaD lo diga.

## Lo que se predice y lo que no (decidido leyendo el código de la 1.6.15)

| Qué | Exacto con | De qué depende | Fuente en el juego |
|---|---|---|---|
| Geodas, geodas heladas, de magma, omni, cofre de artefactos, coco dorado, caja misteriosa y caja misteriosa dorada: las próximas 20 aperturas de cada una | Partida (hace falta `UniqueMultiplayerID` del granjero) | `GeodesCracked` / `MysteryBoxesOpened`, piso más hondo, correo, temporada, nivel de pesca, encargo de Qi activo | `Utility.getTreasureFromGeode`, `GeodeMenu.update` (suma 1 antes de tirar) |
| Clima de mañana | Partida | `weatherForTomorrow` + `Game1.getWeatherModificationsForDate` + boda | `Game1.UpdateWeatherForNewDay` |
| Lluvia/nieve del resto de la estación | Semilla y fecha | `SYNCED_RANDOM day location_weather` y `SYNCED_SUMMER_RAIN_RANDOM`: lluvia sí/no es exacto; tormenta vs. lluvia y viento vs. sol usan `RANDOM` (`Game1.random`, depende de los pasos) y se muestran como "lluvia (puede ser tormenta)" / "sol (puede haber viento)" | `LocationWeather.UpdateDailyWeather`, `Data/LocationContexts` |
| Suerte del día | Sólo hoy, de la partida (`dailyLuck`) | la de mañana sale de `Game1.random` sembrado con `stats.StepsTaken` y consumido por todo el día nuevo: imposible | `Game1._newDayAfterFade` |
| Pisos infestados, de babas, de cantera y de hongos de las Minas 1-119, próximos 7 días | Semilla y fecha (+ partida para cantera y hongos) | `CreateDaySaveRandom(level*100)`; el Aceite de ajo los apaga | `MineShaft.loadLevel` |
| Caverna Calavera | — | **Afuera**: el mapa sale de `mineRandom = new Random()` sin semilla; se dice en la pantalla | `MineShaft.loadLevel` |
| Carro ambulante (viernes, domingos, Mercado nocturno y Festival del desierto), próximas 4 visitas: objetos, precio y cantidad | Semilla y fecha (+ partida para retratos, catálogos y la col morada del año 1) | `CreateDaySaveRandom()` en `ShopBuilder.GetShopStock`; `RANDOM_ITEMS` | `ShopBuilder.GetShopStock`, `ItemQueryResolver`, `Data/Shops` "Traveler" |
| Eventos de la noche (hada, bruja, meteorito, estatua del búho, cápsula), próximas 14 noches | Semilla y fecha | el hada con rosa de hadas madura se muestra como condición ("si tenés una rosa de hadas madura") | `Utility.pickFarmEvent` |
| Tachos de basura, Krobus, tren, papel tapiz, Estrella invernal, Calico Jack | — | fuera de este PR; quedan anotados como siguientes | — |

Ventaja sobre el rival (Stardew Predictor de MouseyPounds, MIT, último cambio 1.6.4 del 20/4/2024): tiene abiertos
"Geode prediction off-by-one" (#37) y "Weather and geode/mystery box prediction not accurate" (#26). Acá cada
predicción tiene un test contra el código real del juego 1.6.15.

## Estructura de archivos

- `games/stardew/tools/oracle/Oracle.cs`, `oracle.sh` — el oráculo (nuestro código; llama a la DLL del juego).
- `site/test/fixtures/stardew-predict/*.json` — lo que escribe el oráculo (< 1 MB en total).
- `games/stardew/tools/predict_data.py` + test en `games/stardew/tools/tests/` — datos del predictor desde `raw/`.
- `games/stardew/data/predict.json` — los datos (se importa entero con `import()`).
- `site/src/stardew/predict/rng.ts` — `DotNetRandom`, `xxh32`, semillas.
- `site/src/stardew/predict/query.ts` — lo mínimo de `GameStateQuery` e `ItemQueryResolver` que usan geodas y carro.
- `site/src/stardew/predict/geodes.ts`, `cart.ts`, `weather.ts`, `mines.ts`, `night.ts` — una predicción por archivo.
- `site/src/stardew/predict/input.ts` — la entrada (`PredictInput`) desde la partida o desde la URL.
- `site/src/stardew/predict/StardewPredict.tsx` + `site/src/styles/stardew-predict.css` — la pestaña.
- `site/src/stardew/save/parse.ts` — suma `predict` a `Save`.
- Tests: `site/test/stardewPredictRng.test.ts`, `…Geodes`, `…Cart`, `…Weather`, `…Mines`, `…Night`, `…Input`,
  `…Ui`, y casos nuevos en `stardewSaveParse.test.ts`.

## Revisión: lo que ningún test de tarea cubre y más puede morder

1. Una partida con `UniqueMultiplayerID` negativo y mayor que 2^53 (la de ZoTaD: `-6368268736843601728`): `(int)` de
   un `long` son los 32 bits de abajo con signo, y `/ 2` trunca hacia cero. Test en la tarea 2 con ese valor exacto.
2. `useLegacyRandom` en true (speedrunners): `CreateRandomSeed` suma en vez de hashear. Fixture del oráculo con las dos
   ramas en la tarea 1 y un caso de geodas en legacy en la tarea 4.
3. Una partida guardada en el `localStorage` por la versión anterior del Lector (sin `predict`): la pestaña pide volver
   a abrir el archivo en vez de romperse. Test en la tarea 7.
4. El último día de la estación y el 28 de invierno del año: el día siguiente cambia de estación y de año (clima de
   mañana, carro del 1, minas). Casos del oráculo en el 28 de cada estación en la tarea 6.
5. Semilla escrita a mano con espacios, ceros adelante, vacía o de más de 10 dígitos: se limpia o se avisa, nunca
   `NaN` en pantalla. Test en la tarea 7.

---

### Tarea 1: oráculo .NET y núcleo aleatorio

**Archivos:**
- Crear: `games/stardew/tools/oracle/Oracle.cs`, `games/stardew/tools/oracle/oracle.sh`
- Crear: `site/src/stardew/predict/rng.ts`
- Crear: `site/test/fixtures/stardew-predict/rng.json`
- Test: `site/test/stardewPredictRng.test.ts`

**Interfaces:**
- Produce:
  - `class DotNetRandom { constructor(seed: number); next(): number; next(max: number): number; next(min: number, max: number): number; nextDouble(): number; nextBool(chance?: number): boolean }` — `System.Random(int)` de .NET 6 sembrado (el algoritmo de Knuth de `Net5CompatSeedImpl`, con `GetSampleForLargeRange` cuando `max - min > int.MaxValue`). `nextBool()` = `NextDouble() < 0.5`, `nextBool(p)` = `NextDouble() < p` (`RandomExtensions.NextBool`). Agregar `choose<T>(...xs: T[]): T` = `xs[next(xs.length)]` (`RandomExtensions.Choose`).
  - `xxh32(bytes: Uint8Array): number` (con signo, como `BitConverter.ToInt32`), `hashString(s: string): number` (UTF-8), `hashInts(...xs: number[]): number` (cada int en 4 bytes little-endian).
  - `createRandomSeed(legacy: boolean, a: number, b: number, c = 0, d = 0, e = 0): number` y `createRandom(legacy, a, b?, c?, d?, e?): DotNetRandom` — `Utility.CreateRandomSeed`: `(int)(x % 2147483647.0)` de cada uno y `hashInts`, o la suma `% 2147483647` en legacy.
  - `interface Seed { gameId: number; legacy: boolean }` y `daySaveRandom(seed: Seed, daysPlayed: number, a = 0, b = 0, c = 0): DotNetRandom` — `Utility.CreateDaySaveRandom` (`createRandom(legacy, daysPlayed, floor(gameId / 2), a, b, c)`).
  - `syncedRandom(seed: Seed, interval: "day" | "season" | "year", key: string, daysPlayed: number, season: string, year: number): DotNetRandom` — `Utility.TryCreateIntervalRandom`.
  - `daysPlayed(season: 0|1|2|3, day: number, year: number): number` = `(year-1)*112 + season*28 + day`.

- [ ] **Paso 1: armar el oráculo.** `Oracle.cs` sigue el arreglo ya probado (sonda en el scratchpad del coordinador):
  `AssemblyResolve` a la carpeta del juego; `Game1.hash = new HashUtility()`; un `LocalizedContentManager` propio que
  devuelve `RuntimeHelpers.GetUninitializedObject(typeof(Texture2D))` para toda textura; `Game1.game1` sin inicializar
  con `_locations` vacío; recorrer `GetLoadContentEnumerator` (por reflexión) hasta que tire (llega al paso 57 con
  `objectData` cargado); `new Farmer()` en `Game1._player`. Uso: `dotnet Oracle.dll <juego> <comando> <salida.json>`.
  `oracle.sh` compila como `dump.sh` (sumando `Stardew Valley.dll`, `StardewValley.GameData.dll`, `Netcode.dll`,
  `xTile.dll`) y corre todos los comandos. Cabecera: qué hace, que no va al sitio y que no copia código del juego.
- [ ] **Paso 2: comando `rng`.** Escribe en `rng.json`: `new Random(s)` para 12 semillas (0, 1, -1, 12345,
  `int.MaxValue`, `int.MinValue + 1`, …) con 20 `Next()`, 20 `NextDouble()` (como `"R"`), y `Next(a, b)` para
  `(-100, 101)`, `(1, 10)`, `(0, int.MaxValue)`, `(int.MinValue, int.MaxValue)`; `GetDeterministicHashCode` de 10
  textos (`""`, `"location_weather"`, `"summer_rain_chance"`, `"ñandú"`, …) y de 6 listas de enteros;
  `Utility.CreateRandomSeed` con `UseLegacyRandom` en false y en true para 20 quíntuplas (incluidas 452435081 / 2,
  valores negativos y > 2^31).
- [ ] **Paso 3: test que falla.** `stardewPredictRng.test.ts` lee `rng.json` y afirma igualdad exacta de cada valor
  (los `double` con `toBe` contra `Number("R")`). Correr `npx vitest run test/stardewPredictRng.test.ts`: FALLA (no hay
  `rng.ts`).
- [ ] **Paso 4: implementar `rng.ts`.** xxHash32 con semilla 0 en aritmética de 32 bits (`Math.imul`, `>>> 0`).
- [ ] **Paso 5: correr el test.** PASA.
- [ ] **Paso 6: commit** `feat(stardew): oráculo del juego y generador aleatorio de .NET para el predictor`.

### Tarea 2: el Lector lee lo que necesita el predictor

**Archivos:**
- Modificar: `site/src/stardew/save/parse.ts` (cabecera, `Save`, `parseSave`)
- Modificar: `site/src/stardew/save/store.ts` sólo si `looksLikeSave` debe aceptar `predict` ausente (debe)
- Test: `site/test/stardewSaveParse.test.ts`

**Interfaces:**
- Produce, en `Save`, el campo opcional `predict?: SavePredict` (opcional: lo guardado por la versión anterior sigue
  valiendo y la pestaña pide abrir el archivo de nuevo):
  ```ts
  interface SavePredict {
    gameId: number;            // uniqueIDForThisGame
    legacy: boolean;           // useLegacyRandom
    daysPlayed: number;        // stats daysPlayed del anfitrión (no de la fecha)
    dailyLuck: number;         // dailyLuck de la raíz
    weatherTomorrow: string;   // tal cual (antes de getWeatherModificationsForDate)
    lowestMineLevel: number;   // netWorldState lowestMineLevel (MineShaft.lowestLevelReached)
    multiplayer: boolean;      // hay farmhands con isCustomized
    visitsUntilY1Guarantee: number;
    farmers: {
      name: string; host: boolean;
      uid: string;             // UniqueMultiplayerID como texto (long)
      uidHalf: number;         // (int)uid / 2, ya calculado con BigInt
      geodesCracked: number; mysteryBoxesOpened: number;
      deepestMineLevel: number; fishingLevel: number;
      mastery0: number; bookMystery: number;   // stats "Mastery_0" y "Book_Mystery"
      mail: string[];          // el mismo correo que Player.mail
      spouse14: string[];      // aldeanos con 14 corazones o más (Friendship.Points >= 3500)
    }[];
    qiBeans: boolean;          // encargo de Qi con regla DROP_QI_BEANS activo
  }
  ```
- [ ] **Paso 1: tests que fallan.** Con una partida mínima escrita en el test (con la forma de Zotafarm_452435081 de
  la 1.6.15: `UniqueMultiplayerID` `-6368268736843601728`, `uniqueIDForThisGame` 452435081, `dailyLuck` -0.012,
  `daysPlayed` 2): `predict.farmers[0].uidHalf === ((-6368268736843601728n & 0xffffffffn) interpretado con signo) / 2`
  truncado, escrito como número literal en el test; `predict.gameId === 452435081`; `legacy === false`;
  `dailyLuck === -0.012`. Una partida sin `<stats>` de 1.6 (pre 1.6, `stats` en la raíz) da `geodesCracked` del
  `<geodesCracked>` viejo. Correr `npx vitest run test/stardewSaveParse.test.ts`: FALLA.
- [ ] **Paso 2: implementar.** Los nombres exactos de las etiquetas se leen en las dos partidas reales del scratchpad
  (`save16/`, `save-testsave/`; no se copian al repo) y en `SaveGame`/`Farmer`/`Stats`/`FarmerTeam` descompilados.
  Documentar cada campo en la cabecera de `parse.ts` como los demás.
- [ ] **Paso 3: correr los tests del Lector** (`stardewSaveParse`, `stardewSave`, `stardewSaveProgress`): PASAN.
- [ ] **Paso 4: commit** `feat(stardew): el Lector guarda la semilla y los contadores del predictor`.

### Tarea 3: datos del predictor

**Archivos:**
- Crear: `games/stardew/tools/predict_data.py`, `games/stardew/tools/tests/test_predict_data.py`
- Crear: `games/stardew/data/predict.json`
- Modificar: `site/src/stardew/data.ts` (cargador `loadPredict()` con `once(() => import(...))`, como los demás)

**Interfaces:**
- Produce `predict.json` con forma `PredictData` (tipo exportado desde `site/src/stardew/predict/query.ts`):
  - `objects`: los objetos de `Data/Objects` **en el orden de inserción** (el de `ItemRegistry` para `RANDOM_ITEMS`):
    `[id, category, type, price, flags]` con lo que piden `@requirePrice`, `@isRandomSale`,
    `ITEM_HAS_EXPLICIT_OBJECT_CATEGORY`, `ExcludeFromRandomSale` y `OffLimitsForRandomSale` (lo que mire el código).
  - `furniture`: los muebles de `Data/Furniture` en orden, con lo que pide `RANDOM_ITEMS (F) 0 1612 @requirePrice @isRandomSale`.
  - `geodes`: por geoda (`535`, `536`, `537`, `749`, `275`, `791`), `GeodeDropsDefaultItems` y sus `GeodeDrops`
    (Chance, Precedence, Condition, ItemId, RandomItemId, StackModifiers, SetFlagOnPickup).
  - `traveler`: las entradas de `Data/Shops` "Traveler" con los campos que usa `ShopBuilder.GetShopStock`.
  - `lowGradeCrops`: lo que necesita `Crop.getRandomLowGradeCropForThisSeason` por estación; `raccoonSeeds`: lo de
    `Utility.getRaccoonSeedForCurrentTimeOfYear`.
  - `festivals`: días de festival por estación (`Utility.isFestivalDay`) y festivales pasivos (`Data/PassiveFestivals`:
    días, estación, condición, si tiene `MapReplacements` en el valle).
  - `weather`: las `WeatherConditions` de `Default` de `Data/LocationContexts`.
  - `names`: nada; los nombres y las fichas salen de lo que ya tiene el sitio (`names-*.json`, `itemSlug`), y los
    objetos sin ficha (muebles, sombreros, camisas) llevan su nombre en `predict.json` en inglés y español
    (`Strings` del juego, no la wiki).
- [ ] **Paso 1: test que falla** (`python -m unittest discover -s games/stardew/tools/tests`): `objects` empieza por los
  mismos ids que `Data/Objects.json`, en orden; `geodes["749"]` tiene `PrismaticShard` con `Chance` 0.008; `traveler`
  tiene 27 entradas con `RandomObjects` primera; el tamaño del JSON < 150 kB.
- [ ] **Paso 2: implementar `predict_data.py`** (estilo de `mines_data.py`) y correrlo.
- [ ] **Paso 3: tests de Python y `npx vitest run test/stardewData.test.ts`:** PASAN.
- [ ] **Paso 4: commit** `feat(stardew): datos del predictor`.

### Tarea 4: geodas y cajas misteriosas

**Archivos:**
- Crear: `site/src/stardew/predict/query.ts`, `site/src/stardew/predict/geodes.ts`
- Crear: `site/test/fixtures/stardew-predict/geodes.json` (comando `geodes` del oráculo)
- Test: `site/test/stardewPredictGeodes.test.ts`

**Interfaces:**
- Consume: `rng.ts` (tarea 1), `PredictData` (tarea 3).
- Produce:
  - `type GeodeKind = "535" | "536" | "537" | "749" | "275" | "791" | "MysteryBox" | "GoldenMysteryBox"`
  - `interface GeodeState { seed: Seed; uidHalf: number; geodesCracked: number; mysteryBoxesOpened: number; deepestMineLevel: number; fishingLevel: number; season: 0|1|2|3; mail: string[]; mastery0: number; bookMystery: number; qiBeans: boolean }`
  - `interface Drop { id: string /* calificado, "(O)74" */; qty: number }`
  - `predictGeodes(kind: GeodeKind, st: GeodeState, data: PredictData, count: number): Drop[]` — el `i`-ésimo es la
    apertura `i+1` desde ahora en el yunque de Clint: `GeodesCracked` sube 1 (y `MysteryBoxesOpened` en las cajas)
    **antes** de tirar (`GeodeMenu.update`), y entre aperturas siguen subiendo; aplica el cambio por 5 piedras del
    yunque (objeto `Arch` sin el correo `artifactFound`, salvo el cofre de artefactos) y `SetFlagOnPickup` (el sombrero
    del coco dorado sale una vez: marca el correo para las siguientes).
- [ ] **Paso 1: comando `geodes` del oráculo.** Para 3 partidas (452435081 / uid de Zotafarm, 390176213 / uid de
  TestSave, una en legacy), cada `GeodeKind`, `GeodesCracked` en {0, 15, 16, 200} y `MysteryBoxesOpened` en {0, 10,
  11, 60}, con y sin `artifactFound`, `deepestMineLevel` 0 y 80, pesca 0 y 6, estación 0 y 3: setear el estado del
  `Farmer`, sumar 1 como el yunque y llamar a `Utility.getTreasureFromGeode(ItemRegistry.Create(kind))` 20 veces
  seguidas; escribir `QualifiedItemId` y `Stack`. Cada caso con su estado de entrada.
- [ ] **Paso 2: test que falla:** cada caso del fixture contra `predictGeodes`, id y cantidad exactos. FALLA.
- [ ] **Paso 3: implementar** `query.ts` (sólo las consultas que aparecen en geodas: `PLAYER_STAT Current`,
  `PLAYER_HAS_MAIL Current`, `RandomItemId`, `StackModifiers`; ver `ItemQueryResolver.TryResolveRandomItem` y
  `ApplyItemFields` por los `random` que consumen) y `geodes.ts`.
- [ ] **Paso 4: el test PASA.**
- [ ] **Paso 5: commit** `feat(stardew): predicción de geodas y cajas misteriosas, probada contra el juego`.

### Tarea 5: carro ambulante

**Archivos:**
- Crear: `site/src/stardew/predict/cart.ts`; modificar `query.ts` (`RANDOM_ITEMS` y lo que pidan las condiciones del carro)
- Crear: `site/test/fixtures/stardew-predict/cart.json`
- Test: `site/test/stardewPredictCart.test.ts`

**Interfaces:**
- Consume: `rng.ts`, `query.ts`, `PredictData`.
- Produce:
  - `interface CartState { seed: Seed; daysPlayed: number; season: 0|1|2|3; day: number; year: number; multiplayer: boolean; ccComplete: boolean; jojaComplete: boolean; hearts14: string[]; visitsUntilY1Guarantee: number }`
  - `interface CartItem { id: string; price: number; stock: number; recipe?: boolean }`
  - `cartDays(from: { season; day; year }, visits: number): { season; day; year; kind: "cart" | "nightMarket" | "desertFestival" }[]` (viernes y domingos; Mercado nocturno 15-17 de invierno; Festival del desierto 15-17 de primavera si está abierto; ver `Data/PassiveFestivals` y la condición del carro en `Forest`).
  - `predictCart(st: CartState, data: PredictData): CartItem[]` en el orden de la tienda.
- [ ] **Paso 1: comando `cart` del oráculo:** `ShopBuilder.GetShopStock("Traveler")` con el estado seteado (fecha,
  `DaysPlayed`, semilla, amistades, multijugador) para 3 semillas × 12 fechas de carro de los años 1 y 2, incluidos el
  15-17 de invierno y la primera visita del año 1. Si `GetShopStock` necesita un `GameLocation` que no se puede armar,
  pasarle `null` o el mínimo y decir en la cabecera qué se puso.
- [ ] **Paso 2: test que falla** (ids, precio y stock exactos, en orden). FALLA.
- [ ] **Paso 3: implementar** `RANDOM_ITEMS` (`ItemQueryResolver` + `@requirePrice`, `@isRandomSale`, el filtro
  `PerItemCondition`, `MaxItems`, `AvoidRepeat`), los modificadores de precio y stock (`Utility.ApplyQuantityModifiers`
  con `RANDOM 0.1` sobre el `random` de la tienda) y `cartDays`.
- [ ] **Paso 4: el test PASA.**
- [ ] **Paso 5: commit** `feat(stardew): predicción del carro ambulante, probada contra el juego`.

### Tarea 6: clima, Minas y eventos de la noche

**Archivos:**
- Crear: `site/src/stardew/predict/weather.ts`, `mines.ts`, `night.ts`
- Crear: `site/test/fixtures/stardew-predict/{weather,mines,night}.json`
- Test: `site/test/stardewPredictWeather.test.ts`, `…Mines.test.ts`, `…Night.test.ts`

**Interfaces:**
- Consume: `rng.ts`, `PredictData` (`festivals`, `weather`).
- Produce:
  - `type Wet = "rain" | "storm" | "snow" | "greenRain"` y `type DayWeather = { kind: "sun" | "rain" | "storm" | "snow" | "greenRain" | "festival" | "wind" | "wedding"; maybe?: "storm" | "wind" }` — `maybe` cuando depende de `RANDOM`.
  - `weatherTomorrow(saved: string, today: { season; day; year; daysPlayed }, data): DayWeather` — `getWeatherModificationsForDate` sobre lo guardado.
  - `seasonWeather(seed: Seed, today: {…}, data): DayWeather[]` — del día de mañana al 28.
  - `interface MineDay { daysPlayed: number; infested: number[]; slime: number[]; quarry: number[]; mushroom: number[] }` y `predictMines(seed: Seed, daysPlayed: number, days: number, opts: { lowestMineLevel: number; quarry: boolean }): MineDay[]` (pisos 1-119; `quarry` = correo `ccCraftsRoom` y `VisitedQuarryMine`).
  - `type NightEvent = "fairy" | "fairyIfRose" | "witch" | "meteorite" | "owl" | "capsule" | "earthquake"` y `predictNights(seed: Seed, fromDaysPlayed: number, nights: number, opts: { year; season; day; gotCapsule: boolean; ccPantry: boolean; raccoonTreeFallen: boolean }): (NightEvent | null)[]`.
- [ ] **Paso 1: comandos del oráculo.** `weather`: con la fecha y la semilla seteadas, crear un `LocationWeather`
  y llamar a `UpdateDailyWeather("Default", Game1.locationContextData["Default"], random)` con un `random` cualquiera,
  repitiendo con 20 semillas de `random` distintas: si el resultado cambia, ese día es "maybe" (y el fixture guarda el
  conjunto de resultados); más `getWeatherModificationsForDate`. 3 semillas × los 112 días del año 1 y 28 del año 2,
  con los 28 de cada estación. `mines`: replicar `MineShaft.loadLevel` llamándolo de verdad si el mapa carga con las
  texturas vacías; si no, armar en C# sólo la cuenta de `isMonsterArea`/`isSlimeArea`/cantera/hongo con
  `Utility.CreateDaySaveRandom` del juego y decirlo en la cabecera del oráculo y del test. 3 semillas × 30 días × pisos
  1-119, con `lowestLevelReached` 0 y 120 y cantera sí/no. `night`: `Utility.pickFarmEvent()` con la granja y el
  estado mínimo, 3 semillas × 200 noches, con `hasMatureFairyRoseTonight` en false y en true.
- [ ] **Paso 2: tests que fallan** contra los tres fixtures. FALLAN.
- [ ] **Paso 3: implementar** los tres archivos; `SYNCED_SUMMER_RAIN_RANDOM`, `IS_GREEN_RAIN_DAY`
  (`Utility.isGreenRainDay`) y el orden de las condiciones como en `GameStateQuery`.
- [ ] **Paso 4: los tests PASAN.**
- [ ] **Paso 5: commit** `feat(stardew): clima, Minas y noches del predictor, probados contra el juego`.

### Tarea 7: la pestaña Predictor

**Archivos:**
- Crear: `site/src/stardew/predict/input.ts`, `site/src/stardew/predict/StardewPredict.tsx`, `site/src/styles/stardew-predict.css`
- Modificar (sólo nuestras líneas): `site/src/route.ts` (`StardewTab` += `"predict"`, `STARDEW_SECTIONS`,
  `STARDEW_PUBLISHED`, `STARDEW_SECTION_ES.predict = "predictor"`), `site/src/Stardew.tsx`, `site/src/stardewCopy.ts`
  (`STARDEW_TABS`: `"predict"` justo después de `"save"`; copia EN/ES y SEO), `site/src/areaFiles.ts`,
  el sitemap de Stardew, `site/src/stardew/save/StardewSave.tsx` (enlace "Ver qué predice tu partida")
- Test: `site/test/stardewPredictInput.test.ts`, `site/test/stardewPredictUi.test.ts`, casos en `stardewRoute.test.ts`
  y `stardewSeo.test.ts`

**Interfaces:**
- Consume: todo lo anterior; `readStoredSave()` de `save/store.ts`; `itemSlug(data, id)` y `RouteLink` como en
  `mines/StardewMines.tsx`; `Box`, `Sprite`, `Slot`, `Gold`, `Group`, `Pill` de `ui.tsx`.
- Produce:
  - `type PredictInput = { from: "save"; save: SavePredict; farmer: number; season; day; year } | { from: "manual"; seed: Seed; season; day; year }`
  - `readManual(search: string): { seed: Seed; season; day; year } | { error: "empty" | "bad" } | null` y
    `writeManual(...)`: `?semilla=` / `?seed=` (según idioma, como las otras pestañas), `?dia=` / `?day=` (`p3-15-2` =
    verano 15, año 2), `?legacy=1`. La semilla se limpia de espacios y ceros adelante; sólo dígitos, 1-10 dígitos.
- Pantalla (de arriba abajo, cada parte una `Box`):
  1. **Tu partida:** si hay partida del Lector con `predict`, su granja, fecha y un selector de granjero; si la
     partida guardada no tiene `predict`, "Volvé a abrir tu partida en el Lector para ver las geodas" con enlace; si no
     hay, el formulario semilla + fecha (con dónde se ve la semilla: el nombre de la carpeta de la partida,
     `Granja_123456789`).
  2. **Hoy y mañana:** clima de mañana y suerte de hoy (sólo con partida; con la frase del pronóstico de la tele
     del juego, `TV.cs.13197`… de `Strings`), y el clima del resto de la estación (calendario de 7 columnas).
  3. **Geodas:** una `Pill` por tipo (con su sprite), lista de las próximas 20 (número de apertura, sprite, nombre
     con enlace a la ficha si la tiene, cantidad); sin partida, "Abrí tu partida" (hace falta el id del granjero).
  4. **Minas:** próximos 7 días; por día los pisos infestados, de babas, de cantera y de hongos; nota del Aceite de
     ajo y por qué la Caverna Calavera no se puede predecir.
  5. **Carro ambulante:** las próximas 4 visitas, cada una con su grilla (sprite, nombre con enlace, `Gold`, stock).
  6. **Noches:** las próximas 14 con evento, o "Ninguna noche con evento en las próximas dos semanas".
- [ ] **Paso 1: tests que fallan.** `readManual("?seed=%20000452435081&day=p0-2-1")` da `gameId` 452435081, primavera
  2, año 1; `"?seed=abc"` da `{ error: "bad" }`; `"?seed="` da `{ error: "empty" }`; 11 dígitos da `bad`.
  Con una partida guardada sin `predict`, la pantalla muestra el aviso de volver a abrir y ningún `NaN`
  (render con `react-dom/server`, como los otros tests de UI). Rutas `/en/stardew-valley/predictor` y
  `/es/stardew-valley/predictor`; título SEO EN "Stardew Valley Predictor (1.6): Geodes, Weather, Mines & Traveling Cart | Vestigo".
- [ ] **Paso 2: implementar** la pestaña; el cálculo corre en el navegador al cambiar la entrada (en el prerender, la
  pantalla vacía con el formulario). Cada objeto predicho enlaza a su ficha si `itemSlug` la encuentra.
- [ ] **Paso 3: `npx vitest run` entero y `npx tsc -b`:** PASAN.
- [ ] **Paso 4: el coordinador mira cada parte en el navegador** (servidor del worktree, con las dos partidas
  reales y con semilla a mano), de cerca, en escritorio y a 375 px; se corrige lo que no esté prolijo.
- [ ] **Paso 5: commit** `feat(stardew): pestaña Predictor`.

### Tarea 8: medir y publicar el PR

**Archivos:**
- Modificar: `site/scripts/perf.mjs` (`PAGES` += las dos rutas), `docs/superpowers/specs/2026-10-22-stardew-design.md`
  (apartado del predictor con las mediciones), nota en la carpeta compartida (`stardew-coordinacion.md`: pestaña
  `predict` después de `save`).
- [ ] **Paso 1:** anotar "BUILD EN CURSO" en `builds.md`; `npm run build` entero midiendo tiempo y pico de RAM como en
  la etapa 3, antes (main) y después; anotar en el diseño; borrar la línea.
- [ ] **Paso 2:** `npm run perf -- --only stardew --budget` contra `vite preview`: las dos páginas dentro del
  presupuesto; `npm run check:links`: 0 sin destino.
- [ ] **Paso 3:** capturas de cerca (escritorio y 375 px, EN y ES) revisadas; nada cortado ni con sombra.
- [ ] **Paso 4:** commit, push y PR contra `main` con: qué predice, qué no y por qué (suerte de mañana, Caverna
  Calavera, tormenta/viento), cómo se probó (oráculo), las mediciones y los siguientes (tachos, Krobus, tren, papel
  tapiz, Estrella invernal). Sin fusionar.
