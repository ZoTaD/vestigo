# Project Zomboid — Servidor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña **Servidor** (`/en/project-zomboid/server`, `/es/project-zomboid/servidor`), con tres páginas:
- **el generador** (`/server`): las 269 opciones de sandbox y las 144 del `.ini`, agrupadas como en la pantalla del juego, arrancando de un preset, con "sólo lo que cambiaste", descarga y copia de `servertest_SandboxVars.lua` y `servertest.ini`, link para compartir (`?p=&s=`) y **"pegá tu archivo"**;
- **los presets comparados** (`/server/sandbox-presets` ↔ `/servidor/presets-de-sandbox`);
- **la calculadora de cortes de agua y luz** (`/server/water-and-power-shutoff` ↔ `/servidor/cortes-de-agua-y-luz`), que dice la fecha y la hora exactas del juego.

Cada página se conecta en la rama apenas funciona.

**Architecture:**
- **Datos:** un extractor nuevo, `games/zomboid/tools/server.py`, con el estilo de `extract.py` (lee el `.jar` con el lector de `.class` propio, corta con `SystemExit` si un parche cambia el formato, determinista). Lo llama `extract.py`, que escribe `games/zomboid/data/server.json` dentro de su hash (así un cambio mueve `extractedAt`). El sitio lo importa directo (`@zomboid/server.json`) y viaja en el chunk de la pestaña (~35 KB con gzip): sin línea en `TAB_DATA`, sin "cargando…".
- **Las dos subpáginas** son fichas de la sección `server` en `index.json` (dos entradas con nombre propio, escritas en `extract.py`): así salen solas al sitemap, al `<head>`, a los slugs en español (`virtual:pz-slugs-es/server`) y al prerender, con el mismo mecanismo que el resto.
- **Sitio:** todo lo que calcula es puro y testeable en `site/src/zomboid/server/`: el modelo de la configuración (`config.ts`), el escritor y el lector de Lua (`lua.ts`) y de `.ini` (`ini.ts`), el link (`link.ts`) y la cuenta de los cortes (`shutoff.ts`). Los componentes sólo dibujan.
- **Nada sale del navegador:** el archivo pegado se lee y se arma en la página; no hay `fetch` con su contenido. El lector nunca ejecuta Lua (ni `eval`, ni `Function`, ni un intérprete): es un tokenizador propio que acepta sólo tablas de valores.

**Tech Stack:** Python 3 (sin dependencias nuevas; `unittest`), React 18 + Vite + TS, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md` ("Pestañas" ítem 10, "Direcciones", "Datos", "Reglas de la casa"). Patrón a copiar: `site/src/zomboid/moodles/*` y `site/src/zomboid/skills/*` (datos en el chunk, copy propio, lista + ficha), `site/src/zomboid/planner/*` (estado en la dirección con `history.replaceState`, `CopyButton`), `site/src/zomboid/ui.tsx`, `site/src/Zomboid.tsx` (`TABS`), `site/src/areaFiles.ts` (`PZ_TAB_FILES`), `site/src/route.ts` (`PZ_PUBLISHED`, `PZ_DETAIL_SECTIONS`), `games/zomboid/tools/extract.py` (lector de `.class`, `Texts`, `site_index`, `main`).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. Nunca `git add -A`: cada commit nombra sus archivos. `test/deadlock.test.ts` falla por una dependencia ajena.
- **Cada página se conecta en la rama apenas funciona** (ZoTaD mira `http://localhost:5178`): `PZ_PUBLISHED`, `TABS`, `PZ_TAB_FILES`, la precarga del prerender y el link desde la portada de la libreta, **en un commit aparte al final de su tarea**.
- **Datos del juego:** tal cual, con el español de `ES_MX` (respaldo `ES`, como `Texts`). Lo que escribimos nosotros (las explicaciones de los cortes, los avisos del lector, el nombre de las subpáginas) va marcado en el código como texto propio, corto, en/es. Nunca se copia de PZwiki (CC BY-NC-SA) ni de otros generadores.
- **El extractor no depende de herramientas de afuera:** nada de `javap` ni del JDK (sirvieron para el relevamiento de este plan, no para correr). Todo sale del lector de `.class` de `extract.py`, ampliado donde haga falta.
- **Reglas de la casa:**
  - sin bordes de color en tarjetas ni filas: una opción cambiada se marca con tinte, texto o cifra;
  - las palabras no se cortan (`wordFit` en los títulos; nunca `overflow-wrap: anywhere`): los nombres de opción largos (`ZombieConfig.PopulationStartMultiplier`) se achican o bajan de renglón por sus puntos, no por la mitad de una palabra;
  - sin scroll horizontal de la página en el celular (la tabla de presets se vuelve tarjetas por opción);
  - en/es con voseo;
  - nada de "sacado de los archivos del juego" en la UI;
  - toda subpágina enlazada desde la pestaña y desde la portada;
  - el prerender nunca sale con "cargando…" (el build ya lo corta);
  - SEO: el título empieza por lo que se busca y mide ≤ 65 caracteres (lo prueba `site/test/zomboidSeo.test.ts`), descripción > 80.
- **Privacidad:** el link para compartir nunca lleva `Password`, `RCONPassword`, `DiscordToken` ni `WebhookAddress`.
- Comentarios y commits en español rioplatense, explicando el porqué (`feat(zomboid): …`).

## Lo que dice el juego (relevado el 2026-10-01 en la 42.21, build 25485521)

Valores verificados; los tests de abajo los usan. Si el extractor da otro número, se revisa antes de tocar el test.

**Opciones de sandbox** (`zombie.SandboxOptions`, constructor y las clases internas `ZombieLore`, `ZombieConfig`, `MultiplierConfig`, `Map` y `Basement`):
- **269 opciones:** 96 `double`, 87 enum (85 `newEnumOption(nombre, cantidad, default)` + 2 "fuertes" `newEnumOption(nombre, Clase, Enum.X)`: `InjurySeverity` = `InjurySeverity.NORMAL` → 2 de 3 y `DamageToPlayerFromHitByACar` = `DamageModifier.NONE` → 1 de 5), 45 `boolean`, 39 `int` y 2 `string` (`WorldItemRemovalList`, `LootItemRemovalList`).
- **Firmas:** `newBooleanOption(String, boolean)`, `newDoubleOption(String, min, max, default)` (doubles: `ldc2_w`, `dconst_0/1`), `newIntegerOption(String, min, max, default)`, `newEnumOption(String, n, default)`, `newStringOption(String, default, largoMax)`. Después puede venir `.setTranslation("X")` (la clave del nombre) o `.setValueTranslation("Y")` (la de las etiquetas).
- **Claves de traducción** (`Translate/<idioma>/Sandbox.json`, 1.085 claves en EN y en ES_MX, 1.102 en ES):
  - nombre: `Sandbox_<tr o nombre corto>` (nombre corto = lo que va después del punto: `ZombieLore.Speed` usa `setTranslation("ZSpeed")` → `Sandbox_ZSpeed` = "Speed" / "Velocidad");
  - ayuda: `Sandbox_<…>_tooltip` (257 de 269 la tienen), con `\n` escrito como `\\n`;
  - etiquetas de enum: `Sandbox_<valueTr o tr o nombre corto>_option<i>`, i de 1 a n (462 etiquetas, ninguna falta en ES_MX). `WaterShut` y `AlarmDecay` usan `Shutoff` ("Instant", "0 - 30 Days"…); `ElecShut` las suyas ("14 - 30 Days"…).
  - Excepciones: `StartYear` (100 valores: 1993 + i − 1; `getFirstYear()` devuelve 1993) y `StartDay` (31 valores: el número) no tienen etiquetas.
  - Con estas reglas, las 269 tienen nombre en EN y en ES_MX.
- **Las hojas del juego** salen de `SettingsTable` en `media/lua/client/OptionScreens/ServerSettingsScreen.lua` (la parte `name = "Sandbox"`; la primera hoja es la de presets y no tiene opciones). Nombre: `Sandbox_<hoja>`; subtítulos: `Sandbox_Title_<title>`.

  | Hoja | EN / ES_MX | Opciones | Subtítulos |
  |---|---|---|---|
  | `TimeOptions` | Time / Opciones de tiempo | 5 | |
  | `Zombie` | Zombie / Zombi | 47 | `ZombieLore` en `ZombieLore.Speed`, `AdvancedZombieSettings` en `ZombieConfig.PopulationMultiplier` |
  | `Loot` | Loot / Saqueo | 37 | `LootRarity` en `FoodLootNew` |
  | `WorldOptions` | World / Mundo | 24 | `Basements` en `Basement.SpawnFrequency` |
  | `NatureOptions` | Nature / Naturaleza | 22 | |
  | `Meta` | Meta / Meta | 24 | `InGameMap` en `Map.AllowWorldMap` |
  | `Character` | Character / Personaje | 68 | `XPMultipliers` en `MultiplierConfig.Global` |
  | `Vehicle` | Vehicles / Vehículo | 17 | |
  | `Animal` | Livestock / Ganado | 13 | |

  Son 257. Las 12 que el menú no muestra van a una hoja nuestra, "Hidden" ("No aparecen en el menú del juego" / "Not in the game's menu"): `StartYear`, `AlarmDecayModifier`, `InsaneLootFactor`, `ExtremeLootFactor`, `RareLootFactor`, `NormalLootFactor`, `CommonLootFactor`, `AbundantLootFactor`, `Farming`, `PlantAbundance`, `NightLength`, `AnimalMetaStatsModifier`.
- **Valores de ejemplo** (default de Java): `Zombies` enum 6, default 4 ("Normal"); `WaterShutModifier` y `ElecShutModifier` int −1..2147483647, default 14 (sus nombres usan `WaterShut`/`ElecShut`); `FoodLootNew` double 0..4, default 0.6; `ZombieConfig.PopulationMultiplier` default 0.65 (float de Java: se guarda con `_tidy_float`); `HoursForCorpseRemoval` −1..2147483647, default −1; `DayLength` enum 27, default 4; `StartTime` enum 9, default 2; `TimeSinceApo` enum 13, default 1; `StartDay` default 23 (los presets dicen 9).

**Presets** (`media/lua/shared/Sandbox/*.lua`; el orden y los nombres son los de `SandboxOptions.lua:loadPresets`, `UI_NewGame_<X>` y `UI_NewGame_<X>_desc` en `UI.json`):

| id del sitio | Archivo | EN / ES_MX | Difiere del default de Java en (preset efectivo: Apocalipsis ⊕ archivo) |
|---|---|---|---|
| `apocalypse` | `Apocalypse.lua` | Apocalypse / Apocalipsis | 45 |
| `outbreak` | `Outbreak.lua` | Outbreak / Brote inicial | 88 |
| `extinction` | `Extinction.lua` | Extinction / Extinción | 78 |
| `rising` | `Rising.lua` | Rising / En ascenso | 70 |
| `six-months-later` | `SixMonthsLater.lua` | Six Months Later / 6 meses después (`UI_NewGame_SixMonths`) | 61 (el archivo solo da 36; el 37 que decía este plan era contra Apocalipsis) |

- Apocalipsis es el que el juego trae elegido. `SandboxVars.lua` dice `SandboxVars = require "Sandbox/Apocalypse"`.
- Los cuatro primeros traen las 269 claves (más `Version = 6`). Hay 153 opciones en las que algún preset (efectivo) difiere de otro.
- `SixMonthsLater.lua` es del formato viejo:
  - `VERSION = 5`;
  - 119 claves, con `XpMultiplier` y `LootRespawn`, que ya no existen;
  - renglones comentados;
  - `tonumber(ZombiePopulationMultiplier.VeryHigh)` y otros dos, que son constantes de `media/lua/shared/defines.lua` (`"1.6"`, `"2.0"`, `"1.0"`).
- El juego carga un preset así: `SandboxOptions` nace con los defaults de Java, pero su constructor termina con `loadGameFile("Apocalypse")` + `setDefaultsToCurrentValues()`, así que **el "Default" del juego es Apocalipsis** (el de la pantalla de partida, el de la ayuda "Default: X", el de `resetToDefault()` y el de un servidor dedicado sin `SandboxVars.lua`). `loadGameFile` no resetea: cada opción lee su clave de la tabla (`fromTable`) y la que falta conserva el valor que había. La UI arma cada preset con `new()`/`resetToDefault()` (= Apocalipsis) y después `loadGameFile(preset)`. El preset completo es **(default de Java ⊕ Apocalypse.lua) ⊕ archivo del preset**, no "default de Java ⊕ archivo". `server.json` guarda `values` ya así (menos lo que coincide con Java) y `baseline: "apocalypse"`; `options[].default` sigue siendo el de Java y la página no lo muestra nunca como "Default".
- `IntegerConfigOption.setValue` ignora un valor fuera de rango (lo anota en el log y deja el que había). El lector del sitio avisa eso mismo.
- Valores clave por preset (Apocalipsis / Brote / Extinción / En ascenso / 6 meses):
  - `WaterShut` y `ElecShut`: 2 / 3 / 2 / 3 / 1;
  - `WaterShutModifier` y `ElecShutModifier`: 14 / 14 / 14 / 14 / −1;
  - `TimeSinceApo`: 1 / 1 / 1 / 1 / 7;
  - `StartMonth`: 7 / 7 / 7 / 7 / 12;
  - `StartDay`: 9 en todos;
  - `StartTime`: 2 (9 AM) en todos;
  - `DayLength`: 4 / 4 / 4 / 4 / 3;
  - `Zombies`: 4 / 4 / 3 / 5 / 1;
  - `ZombieConfig.PopulationMultiplier`: 0.65 / 0.65 / 1.2 / 0.15 / 1.6.

**Cortes de agua y luz** (lo que hace el juego, leído en el bytecode):
- **El día del corte es `WaterShutModifier` / `ElecShutModifier`, en días.**
  - Agua: `IsoObject.hasWater` no da agua de la red si `GameTime.getWorldAgeDaysSinceBegin() >= WaterShutModifier`.
  - Luz: `SandboxOptions.doesPowerGridExist()` da luz mientras `IsoWorld.getWorldAgeDays() <= ElecShutModifier`.
  - Las dos son la misma cuenta.
- `getWorldAgeDaysSinceBegin() = getWorldAgeHours() / 24 + (TimeSinceApo − 1) × 30`.
  - `getWorldAgeHours() = nightsSurvived × 24 + (hora ≥ 7 ? hora − 7 : hora + 17)`, y `nightsSurvived` sube al pasar las 7:00.
  - O sea: **la edad del mundo se cuenta desde las 7:00 del día de arranque** (o del anterior, si la partida arranca antes de las 7), y cada "mes desde el apocalipsis" suma 30 días.
- **Los rangos** ("0 - 30 Days", "14 Days - 2 Months"…) **sólo sortean el modificador al crear una partida de un jugador.**
  - `SandboxOptions.randomWaterShut(op)` / `randomElectricityShut(op)` se llaman desde el Lua del cliente:
    - `SandboxOptions.lua:setSandboxVars`, siempre;
    - `MainScreen.lua:setSandboxPreset`, sólo si el modificador sigue en su default, 14.
  - Ni el servidor dedicado ni la pantalla de servidor los llaman. `ServerSettingsScreen` muestra `WaterShutModifier` y `ElecShutModifier` como campos, y el panel de admin en partida los esconde.
  - **En un servidor, el rango no hace nada: manda el modificador** (14 por defecto).
- `Rand.Next(a, b)` es `a + nextInt(b − a)`: de a a b − 1. Los rangos reales, por opción 1..9:
  - **agua:** `[-1,-1]` (Instantáneo: el default del `tableswitch` devuelve −1), `[0,29]`, `[0,59]`, `[0,179]`, `[0,359]`, `[0,1799]`, `[60,179]`, `[180,359]` y nunca (`Integer.MAX_VALUE` = 2147483647, "Deshabilitado");
  - **luz:** `[-1,-1]`, `[14,29]`, `[14,59]`, `[14,179]`, `[14,359]`, `[14,1799]`, `[60,179]`, `[180,359]` y nunca.
- La hora de arranque (`StartTime`, de las etiquetas en inglés como en `game_start_minute`), opción 1..9: 7, 9, 12, 14, 17, 21, 0, 2 y 5.
- `DayLength` en minutos reales (de sus etiquetas), opción 1..27: 15, 30, 60, 90, 120, 180, 240, … , 1380 ("23 Hours") y 1440 ("Real-time").
- El calendario es el gregoriano (`GameTime.daysInMonth`, con `PZCalendar.isLeapYear`).

**El archivo `SandboxVars.lua` que escribe el servidor** (`SandboxOptions.writeLuaFile`; se arma con estas plantillas):
```
SandboxVars = {
    VERSION = 6,
    -- <ayuda, un renglón por cada \n>
    -- <i> = <etiqueta>            (sólo enum, uno por valor)
    Zombies = 4,
    …
    Basement = {
        -- <ayuda>
        SpawnFrequency = 4,
    },
    …
}
```
- Las opciones sin tabla van primero, en el orden del juego. Después, cada tabla (`Basement`, `Map`, `ZombieLore`, `ZombieConfig`, `MultiplierConfig`) en el orden en que aparece.
- Los valores se escriben así:
  - `double` con `String.valueOf`: `0.8`, `1.0`, `216.0`;
  - `boolean` como `true`/`false`;
  - enum e `int` como entero;
  - `string` entre comillas, con `\"`.
- Un archivo puede arrancar con `return {` en vez de `SandboxVars = {` (los presets), y un servidor con mods trae tablas de más (`MiMod = { … }`).

**Opciones del `.ini`** (`zombie.network.ServerOptions`, constructor: `new <Tipo>ServerOption(this, "Nombre", …)`):
- **144 opciones:** 73 `Boolean`, 29 `Integer` (min, max, default), 22 `String` (default, largo), 11 `Enum` (n, default), 7 `Double` y 2 `Text`.
  - Ejemplos: `PVP` true; `DefaultPort` 0..65535, 16261; `UDPPort` 16262; `MaxPlayers` 1..254, 32; `PublicName` "My PZ Server"; `Map` "Muldraugh, KY"; `SpeedLimit` 10..150, 70; `BadWordPolicy` enum 3, default 3; `AntiCheatNoClip` enum 4, default 4.
- El juego las muestra por su nombre crudo (`translatedName = setting.name`), con la ayuda de `UI_ServerOption_<Nombre>_tooltip` en `UI.json` (121 de 144, en EN y en ES_MX).
- **Las hojas** salen de la parte `name = "INI"` de `SettingsTable`, con su nombre en `UI_ServerSettingGroup_<hoja>`:
  - Details 7, Steam 3, Backups 4, Players 23, Admin 9, Fire 1, PVP 7, Loot 2, War 4, Faction 3, Safehouse 11, Chat 6, RCON 2, Discord 5, UPnP 1, Other 6, Vehicles 1 y Voice 4: 99 opciones;
  - SteamWorkshop, Mods, Map y SpawnRegions son paneles sin opciones;
  - las 45 restantes (`Mods`, `Map`, `WorkshopItems`, `AntiCheat*`, `Seed`…) van a "Hidden".
- **Formato** (`ConfigFile.write`): `# <ayuda>` y `Nombre=valor`. Los booleanos van `true`/`false` y el texto sin comillas.

---

### Task 1: Los datos del servidor (`server.py`) y las dos fichas en el índice

**Files:**
- Create: `games/zomboid/tools/server.py`, `games/zomboid/tools/test_server.py`
- Modify: `games/zomboid/tools/extract.py`:
  - `_parse_pool` guarda los `long` y `double` (hoy los saltea);
  - `_push_double` nuevo;
  - `_instructions` devuelve la tabla de `tableswitch`;
  - `main` llama a `server.build()` y escribe `server.json`;
  - `site_index` suma la sección `server`.
- Modify: `games/zomboid/README.md` (qué lee, qué escribe y cuándo corta `server.py`), `site/test/zomboidIndex.test.ts` (`SECS` suma `"server"`)
- Create (generado): `games/zomboid/data/server.json`; regenerados `games/zomboid/data/index.json` y `games/zomboid/data/meta.json`
- Create: `site/test/zomboidServerData.test.ts`

**Interfaces:**
- Consumes: de `extract.py`, `GAME_DIR`, `MEDIA`, `TRANSLATE`, `EN`, `ES`, `_jar_class`, `_instructions`, `_member`, `_ldc`, `_push_int`, `_push_float`, `_tidy_float` y `Texts.tidy`. `server.py` los importa con `from extract import …`: `extract.py` no hace nada al importarse.
- Produces: `server.build() -> dict`, la forma exacta de `server.json`:
  ```ts
  type Loc = { en: string; es: string };
  type Value = number | boolean | string;
  interface SandboxOption {
    key: string;                 // "Zombies", "ZombieLore.Speed": el nombre del juego, con su tabla
    type: "enum" | "int" | "double" | "bool" | "string";
    default: Value;              // el del constructor de Java
    min?: number; max?: number;  // int y double
    values?: Loc[];              // enum: etiqueta de 1..n (StartYear "1993".."2092", StartDay "1".."31")
    name: Loc;
    tip?: Loc;                   // la ayuda del juego, con "\n" de verdad; sin el "Min/Max/Default" (lo arma la página)
    page: string;                // "TimeOptions" … "Animal", o "Hidden"
    title?: Loc;                 // el subtítulo de la hoja que arranca en esta opción
  }
  interface IniOption {
    key: string; type: "bool" | "int" | "double" | "string" | "text" | "enum";
    default: Value; min?: number; max?: number; n?: number; tip?: Loc; page: string;
  }
  interface ServerData {
    version: number;             // 6 (el `Version` de Apocalypse.lua)
    pages: { id: string; name: Loc }[];      // las 9 del juego + "Hidden" (nombre nuestro), en orden
    options: SandboxOption[];                // 269, en el orden de las hojas (y dentro, el del menú)
    presets: { id: "apocalypse" | "outbreak" | "extinction" | "rising" | "six-months-later";
               file: string; name: Loc; desc: Loc;           // desc sin "<LINE>": se parte en renglones
               values: Record<string, Value> }[];             // el preset como lo carga el juego (Apocalipsis ⊕ archivo), SÓLO lo que difiere del default de Java
    iniPages: { id: string; name: Loc }[];   // las 18 con opciones + "Hidden"
    ini: IniOption[];                        // 144
    shutoff: { water: [number, number][]; elec: [number, number][]; never: 2147483647 };  // 9 pares, opción 1..9
    rules: { dayStartHour: 7; monthDays: 30; firstYear: 1993 };
    startHours: number[];        // 9: [7, 9, 12, 14, 17, 21, 0, 2, 5]
    dayLengthMinutes: number[];  // 27
  }
  ```
- **`index.json`:** dos fichas `{ sec: "server", id, en, es, ref: [] }`, escritas a mano en `extract.py` (`SERVER_PAGES`, marcadas como texto nuestro):
  - `sandbox-presets`: "Sandbox Presets" / "Presets de sandbox";
  - `water-and-power-shutoff`: "Water and Power Shutoff" / "Cortes de agua y luz".
  - `INDEX_SECS` suma `"server"` al final. Los slugs en español salen solos: `presets-de-sandbox`, `cortes-de-agua-y-luz`.
  - El sitemap no las toma hasta que `server` esté en `PZ_PUBLISHED` (Task 2).

**Qué hace `server.py`:**
- **`sandbox_options()`:**
  - recorre `<init>` de `zombie/SandboxOptions.class` y de las cinco clases internas, juntando las constantes empujadas hasta cada `invokevirtual new*Option` (como `perk_factory` con `AddPerk`), más el `setTranslation`/`setValueTranslation` que sigue;
  - los enum fuertes leen el orden del `enum` de su clase (`<clinit>` o `$VALUES`) para pasar `NORMAL` a 2;
  - corta si lee menos de 250 opciones, si una llamada no se entiende o si a una le falta el nombre en EN.
- **`sandbox_pages()`:** lee `SettingsTable` de `ServerSettingsScreen.lua`.
  - Busca el bloque `name = "Sandbox"`, las hojas (`name = "X"` a cuatro tabs) y cada `{ name = "…"` con su `title` opcional, salteando los `Sandbox_Insane`… de `advancedCombo`.
  - Corta si una opción del menú no existe en Java.
  - Lo que Java tiene y el menú no va a `Hidden`.
- **`lua_table(text, consts)`:** el lector seguro de Python para los presets.
  - Acepta `return {` y `X = {`, `clave = valor,` (número, `true`/`false`, `"texto"` con escapes), tablas anidadas de un nivel, comentarios `--` y `--[[ ]]`, comas finales, y `tonumber(A.B)` sólo si `A.B` está en `consts` (que salen de `defines.lua`, renglones `A.B = "x"`).
  - Cualquier otra cosa → `ValueError` con el renglón.
  - Devuelve `{ "Tabla.Clave" | "Clave": valor }`.
- **`presets()`:** los 5 archivos, en el orden del juego.
  - `values` = el preset **como lo carga el juego** (default de Java ⊕ Apocalypse.lua ⊕ archivo, con un valor fuera de rango ignorado) menos las claves que coinciden con el default de Java (con `_tidy_float`). Hecho en la Task 1 (fix): 45 / 88 / 78 / 70 / 61, y `baseline: "apocalypse"` en `server.json`.
  - `Version`/`VERSION` y las claves desconocidas no entran: se cuentan en el informe.
- **`shutoff_ranges()`:** `randomWaterShut(I)I` y `randomElectricityShut(I)I` de `SandboxOptions`.
  - Por cada caso del `tableswitch` (2..9): o dos enteros y `invokestatic zombie/core/random/Rand.Next(II)I`, que da `[a, b − 1]`; o `ldc 2147483647`, que da `[MAX, MAX]`.
  - El `default` (opción 1) devuelve −1 → `[-1, -1]`.
  - Corta si no son 9.
- **`world_age_guard()`:** corta si un parche cambia la cuenta de la edad del mundo.
  - `GameTime.getWorldAgeDaysSinceBegin` tiene que tener `ldc2_w 24.0`, `iconst_1` y `bipush 30`.
  - `GameTime.getWorldAgeHours` tiene que tener `ldc 7.0f` y `ldc 17.0f`.
  - `IsoObject` tiene que llamar a `getWorldAgeDaysSinceBegin` y a `getWaterShutModifier` en el mismo método.
  - `SandboxOptions.doesPowerGridExist(I)Z` tiene que llamar a `IsoWorld.getWorldAgeDays` y a `getElecShutModifier`.
- **`ini_options()`:** `<init>` de `zombie/network/ServerOptions.class`, cada `invokespecial zombie/network/ServerOptions$<Tipo>ServerOption.<init>`.
  - Las hojas salen de la parte `INI` de `SettingsTable`; la ayuda, de `UI_ServerOption_<Nombre>_tooltip`.
  - Corta con menos de 120 opciones.
- **Textos:** `Sandbox.json` y `UI.json` en EN y `ES_MX` → `ES`, con `Texts.tidy`. `\\n` pasa a `\n` y `<LINE>` a salto de renglón.
- **`startHours` y `dayLengthMinutes`:** de las etiquetas en inglés (`Sandbox_StartTime_option<i>`, `Sandbox_DayLength_option<i>`), con la misma regla que `game_start_minute`. Corta si una no se entiende.
- **Solo:** `python games/zomboid/tools/server.py` imprime el informe sin escribir (cantidades por tipo y por hoja, diferencias de cada preset, claves desconocidas de los presets y rangos de corte).

- [ ] **Step 1: Tests de Python que fallan** (`games/zomboid/tools/test_server.py`, `unittest`, con `unittest.main()` al pie). Los que leen el juego llevan `@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")`.
  - **`lua_table`, sin el juego:**
    - `'return {\n  A = 1,\n  B = -1, -- nota\n  C = 0.05,\n  D = true,\n  E = "x, \\"y\\"",\n  T = {\n    X = 2,\n  },\n}'` → `{"A": 1, "B": -1, "C": 0.05, "D": True, "E": 'x, "y"', "T.X": 2}`;
    - `tonumber(Z.High)` con `consts={"Z.High": "1.2"}` → 1.2;
    - `os.execute("x")` → `ValueError`.
  - **Opciones:**
    - `len(opts) == 269` y por tipo `{double: 96, enum: 87, bool: 45, int: 39, string: 2}`;
    - `Zombies` enum con 6 valores y default 4;
    - `WaterShutModifier` int −1..2147483647, default 14, con el nombre "Water Shutoff";
    - `FoodLootNew` 0..4, default 0.6;
    - `ZombieConfig.PopulationMultiplier` default 0.65;
    - `InjurySeverity` enum 3, default 2;
    - `DamageToPlayerFromHitByACar` enum 5, default 1;
    - `StartYear` con 100 valores, del "1993" al "2092";
    - `ZombieLore.Speed` con nombre `{en: "Speed", es: "Velocidad"}` y valor 1 `{en: "Sprinters", es: "Corredores"}`;
    - todas tienen `name.en` y `name.es`.
  - **Hojas:** las cantidades `[5, 47, 37, 24, 22, 24, 68, 17, 13]` en el orden de la tabla, `Hidden` con las 12 de la lista y el `title` `ZombieLore` en `ZombieLore.Speed`.
  - **Presets:**
    - los 5 ids en orden, con 45, 88, 78, 70 y 61 claves en `values`;
    - `six-months-later`: `ZombieConfig.PopulationMultiplier` 1.6, `TimeSinceApo` 7, `StartMonth` 12, `WaterShutModifier` −1;
    - `outbreak`: `WaterShut` 3.
  - **Cortes:**
    - `water[1] == [0, 29]`, `elec[1] == [14, 29]`, `water[6] == [60, 179]`;
    - `water[0] == [-1, -1]` y `water[8] == [2147483647, 2147483647]`;
    - `startHours == [7, 9, 12, 14, 17, 21, 0, 2, 5]`;
    - `dayLengthMinutes[3] == 90` y `dayLengthMinutes[26] == 1440`.
  - **`.ini`:**
    - 144 opciones;
    - `PVP` bool true;
    - `DefaultPort` 0..65535, 16261;
    - `MaxPlayers` 1..254, 32;
    - 121 con ayuda en inglés;
    - 18 hojas con opciones, más `Hidden`.
- [ ] **Step 2:** `python games/zomboid/tools/test_server.py -v` → FAIL (no existe `server`).
- [ ] **Step 3:** Implementar los cambios de `extract.py` y `server.py`.
  - En `extract.py`: el pool de constantes con `("double", x)` y `("long", x)` en los índices 5 y 6 (ocupan dos entradas); `_push_double` (`dconst_0/1` y `ldc2_w`); el `tableswitch` con `arg = (bajo, alto, pc_default, [pc destino…])`.
  - `main()` arma `server.build()` antes de escribir, lo suma a `files["server.json"]` (entra en el hash) e imprime su informe.
- [ ] **Step 4:** `python games/zomboid/tools/test_server.py -v` → PASS. `python games/zomboid/tools/extract.py`: escribe `server.json` y las 2 fichas nuevas de `index.json`, y `extractedAt` pasa a 2026-10-01.
- [ ] **Step 5: Test del sitio que falla y pasa** (`site/test/zomboidServerData.test.ts`), con el `server.json` real:
  - cada `default` y cada valor de preset cae en su rango y su tipo (los enum, entre 1 y `values.length`);
  - cada `page` existe en `pages`, y las hojas están en orden;
  - `presets[0].id === "apocalypse"`;
  - `gzip(server.json)` < 45 KB (`zlib.gzipSync`);
  - `index.json` tiene las dos fichas `server`.

  `cd site && npx vitest run test/zomboidServerData.test.ts test/zomboidIndex.test.ts` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add games/zomboid/tools/server.py games/zomboid/tools/test_server.py games/zomboid/tools/extract.py games/zomboid/README.md games/zomboid/data/server.json games/zomboid/data/index.json games/zomboid/data/meta.json site/test/zomboidServerData.test.ts site/test/zomboidIndex.test.ts
  git commit -m "feat(zomboid): el extractor saca las 269 opciones de sandbox, los presets, el .ini y cómo se cortan agua y luz"
  ```

---

### Task 2: El generador (`/servidor`), con el link para compartir

**Files:**
- Create: `site/src/zomboid/server/{data.ts, config.ts, lua.ts, ini.ts, link.ts, copy.ts, ZomboidServer.tsx, Generator.tsx, OptionRow.tsx}`, `site/src/styles/zomboid-server.css`
- Create: `site/test/zomboidServerConfig.test.ts`, `site/test/zomboidServer.test.ts`
- Modify (al conectar): `site/src/route.ts` (`PZ_PUBLISHED` y `PZ_DETAIL_SECTIONS` suman `"server"`), `site/src/Zomboid.tsx` (`TABS.server`, sin línea en `TAB_DATA`), `site/src/areaFiles.ts` (`PZ_TAB_FILES.server`), `site/src/zomboidCopy.ts` (`seo.server` en/es y `seo.detail.server`), `site/src/zomboid/ZomboidHome.tsx` (`TOOL_TAB`), `site/test/zomboidPublish.test.ts`, `site/test/zomboidSeo.test.ts` si cuenta pestañas

**Interfaces:**
- Consumes: `server.json` (Task 1) y `virtual:pz-slugs-es/server`.
- **`data.ts`:**
  - `SERVER: ServerData`;
  - `optionByKey(key): SandboxOption | undefined`, con un `Map` (una clave de la dirección no tropieza con el prototipo);
  - `iniByKey(key)`;
  - `presetById(id)`;
  - `fullPreset(id): Record<string, Value>`: los defaults de Java pisados por `values` (que ya es el preset efectivo, Apocalipsis ⊕ archivo), memorizado. El "Default" que se muestra en la página, el que usa "restablecer" y la base de un servidor nuevo son `fullPreset("apocalypse")`, **nunca** `options[].default` (StartDay: Java 23, juego 9).
- **`config.ts`** (puro):
  ```ts
  export type PresetId = ServerData["presets"][number]["id"];
  export interface Config {
    preset: PresetId;                       // la base contra la que se cuentan los cambios
    sandbox: Record<string, Value>;         // las 269, completas
    ini: Record<string, Value>;             // las 144, completas
    extraLua: string[];                     // tablas o claves que no son del juego (mods), tal cual: Task 3
    extraIni: string[];                     // renglones `Clave=valor` desconocidos, tal cual: Task 3
  }
  export const fromPreset: (id: PresetId) => Config;
  export const sandboxChanges: (c: Config) => string[];   // claves que difieren de fullPreset(c.preset)
  export const iniChanges: (c: Config) => string[];       // claves que difieren del default de Java
  export const coerce: (opt: SandboxOption | IniOption, raw: string | number | boolean) =>
    { ok: true; value: Value } | { ok: false; reason: "type" | "range" | "enum" };
  ```
- **`lua.ts`:** `writeSandboxLua(c: Config, lang: Lang): string`, con el formato del juego (ver arriba):
  - `SandboxVars = {`, `    VERSION = 6,`;
  - por opción, la ayuda en el idioma de la página como `    -- …`, más `-- Min: … Max: … Default: …` (int y double) o `-- i = etiqueta` (enum);
  - las tablas en el orden del juego;
  - `c.extraLua` al final, tal cual;
  - `}` y salto final.
  - Los double, con el `String.valueOf` de Java: `Number.isInteger(x) ? x.toFixed(1) : String(x)`.
  - Los textos, con `"` y `\` escapados.
- **`ini.ts`:** `writeIni(c, lang): string`: `# ayuda` (un renglón por `\n`) + `Clave=valor` + renglón en blanco, en el orden de `SERVER.ini`. Después, `c.extraIni`.
  - **No escribas `ResetID`, `ServerPlayerID` ni `Seed`** (`random: true` en `server.json`) si el usuario no los tocó: el servidor los sortea la primera vez. Pisar el `ResetID` de un servidor que ya existe obliga a los jugadores a crear un personaje nuevo. Si se tocaron, escribilos tal cual.
- **`link.ts`:**
  - `encodeConfig(c): string` → `p=<preset>&s=<clave>:<valor>;…&i=<clave>:<valor>;…`, sólo con los cambios, cada valor con `encodeURIComponent`, sin `INI_SECRET = ["Password", "RCONPassword", "DiscordToken", "WebhookAddress"]` y sin `extra*`;
  - `decodeConfig(q: URLSearchParams): Config`: un preset desconocido cae en `apocalypse`; una clave desconocida o un valor que `coerce` rechaza se descarta sin tirar el resto.
- **UI (`Generator.tsx`, `OptionRow.tsx`):**
  - **Cabecera:** texto propio con las cifras (de los datos, nunca escritas a mano): "las 269 opciones de sandbox y las 144 del servertest.ini de la Build 42.21". Sin "sacado de…".
  - **"Empezá de un preset":** las 5 tarjetas, con el nombre y la descripción del juego. Elegir una pide confirmación sólo si hay cambios.
  - **Hojas de libreta,** una por hoja del juego (`<details>` abiertas en el HTML del prerender, todas las filas en el HTML), con sus subtítulos. Después, "No aparecen en el menú del juego", y abajo una hoja grande "servertest.ini" con sus hojas.
  - **Cada fila:**
    - el nombre del juego y la clave (`ZombieLore.Speed`, en monoespaciada, se puede copiar);
    - el control: `<select>` con las etiquetas (enum), casilla (bool), `<input type=number>` con `min`, `max` y `step` (`any` para double), o texto;
    - la ayuda del juego;
    - "Default: X" del preset base.
    - Cambiada respecto de la base: **tinte de fondo y una cifra/texto "cambiada"** (nunca un borde de color) y un botón "volver al valor del preset".
  - **Arriba, una barra con:**
    - el buscador (en/es y por clave, con `fold`);
    - "Sólo lo que cambiaste (N)";
    - el nombre del servidor (default `servertest`), que arma los nombres de archivo `<nombre>_SandboxVars.lua` y `<nombre>.ini`;
    - "Descargar" (Blob + `<a download>`) y "Copiar" (`CopyButton`) para cada archivo;
    - "Copiar link" (`?p=&s=&i=` con `link.ts`).
  - **Notas propias** (texto nuestro, en `copy.ts`), junto a las opciones:
    - `WaterShut`/`ElecShut`: "En un servidor, este rango no se usa: el día lo pone WaterShutModifier."
    - `WaterShutModifier`/`ElecShutModifier`: el resultado de la calculadora en una línea ("el agua se corta el 23 de julio de 1993 a las 7:00"), con link a la subpágina (Task 5; antes, sin link).
    - `SpawnPoint`: "Elegí el punto en el Mapa", con link a la pestaña Mapa.
  - **La dirección** se actualiza con `history.replaceState` como el Planificador, y se lee al montarse (en el navegador). El prerender sale con Apocalipsis.
  - **Celular:** cada fila baja a una columna; la barra de herramientas pasa a dos renglones; nada pasa de 100 vw.
- **`copy.ts`:**
  - `usePzServerCopy()`, en/es con voseo;
  - el `<head>` va en `zomboidCopy.ts`:
    - EN `seo.server.title` = "Project Zomboid Server Settings & Sandbox Generator | Vestigo" (61);
    - ES = "Generador de servidor de Project Zomboid (sandbox) | Vestigo" (60), que reemplaza al actual;
    - `seo.detail.server(name)` → EN `Project Zomboid ${name} (Build 42) | Vestigo`, ES `${name} en Project Zomboid (Build 42) | Vestigo`, con una descripción propia para cada una de las dos fichas.

- [ ] **Step 1: Tests que fallan** (`zomboidServerConfig.test.ts`):
  - `sandboxChanges(fromPreset("outbreak"))` es `[]`;
  - `fullPreset("outbreak").WaterShut === 3`;
  - `fullPreset("apocalypse").StartDay === 9`, aunque Java dice 23;
  - `coerce(MaxPlayers, "300")` → `range`; `coerce(Zombies, 7)` → `enum`; `coerce(FoodLootNew, "0.8")` → 0.8;
  - **ida y vuelta del link:** Apocalipsis con `Zombies` 2, `ZombieLore.Speed` 1, `WorldItemRemovalList` "Base.Hat; x" y `Password` "secreto" → `encodeConfig` no contiene "secreto", y `decodeConfig` devuelve los tres cambios con `Password` en su default;
  - `decodeConfig(new URLSearchParams("p=nada&s=Zombies:9;NoExiste:1;Zombies2:x"))` → Apocalipsis sin cambios;
  - `writeSandboxLua(fromPreset("apocalypse"), "en")`:
    - arranca con `"SandboxVars = {\n    VERSION = 6,\n"`;
    - tiene `"    Zombies = 4,\n"`, `"    FoodLootNew = 0.8,\n"`, `"    HoursForCorpseRemoval = 216.0,\n"`;
    - tiene `"    ZombieLore = {\n"` y `"        Speed = 4,\n"`;
    - termina en `"}\n"`;
  - `writeIni` tiene `"DefaultPort=16261\n"` y `"PVP=true\n"`.
- [ ] **Step 2:** `cd site && npx vitest run test/zomboidServerConfig.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `data.ts`, `config.ts`, `lua.ts` (sólo el escritor), `ini.ts` (sólo el escritor) y `link.ts`. → PASS.
- [ ] **Step 4: Tests de la página que fallan** (`zomboidServer.test.ts`):
  - render SSR de `/es/project-zomboid/servidor` con:
    - el título;
    - el texto propio con "269" y "144";
    - las 9 hojas del juego por su nombre en español ("Opciones de tiempo"… "Ganado");
    - "Velocidad" y `ZombieLore.Speed`;
    - "Apocalipsis" elegido;
    - sin "cargando";
  - render de `/en/project-zomboid/server` en inglés;
  - el HTML no tiene `border-left` ni `border-color` en las reglas de fila de `zomboid-server.css` (leído como texto).
- [ ] **Step 5:** Implementar `ZomboidServer.tsx` (despacha: sin `detail` → generador; `detail` desconocido → generador con aviso "no encontramos esa página"), `Generator.tsx`, `OptionRow.tsx` y el CSS. → PASS. Mirarlo en `http://localhost:5178/es/project-zomboid/servidor` (escritorio y celular, en el panel Browser, sin redimensionar el Chrome de ZoTaD).
- [ ] **Step 6: Commit** de la pestaña: `git add` de los archivos de `site/src/zomboid/server/`, `site/src/styles/zomboid-server.css` y los dos tests. `feat(zomboid): el generador de servidor con las opciones de sandbox y del .ini, presets y link`.
- [ ] **Step 7: Conectar** (commit aparte):
  - `PZ_PUBLISHED` y `PZ_DETAIL_SECTIONS` suman `"server"`;
  - `TABS.server = PzServer` (`lazyWithPreload(() => import("./zomboid/server/ZomboidServer"))`), con un comentario de por qué no tiene `TAB_DATA`;
  - `PZ_TAB_FILES.server`;
  - `TOOL_TAB` pasa a `Partial<Record<string, { tab: PzTab; detail?: string }>>`: `satellite` → `{ tab: "server" }`; `lightning` → `{ tab: "server", detail: "water-and-power-shutoff" }`, que sólo enlaza cuando exista la Task 5 (antes queda en "Pronto");
  - `seo` en/es;
  - en `zomboidPublish.test.ts`, el bloque "server": está en `PZ_PUBLISHED`; el sitemap tiene `/es/project-zomboid/servidor`; el `<head>` lleva el título nuevo.

  `npx vitest run test/zomboid*.test.ts` → PASS.

  `feat(zomboid): conecta la pestaña Servidor`.

---

### Task 3: "Pegá tu archivo" — el lector seguro de `SandboxVars.lua` y del `.ini`

**Files:**
- Modify: `site/src/zomboid/server/lua.ts` (suma `parseSandboxLua`), `site/src/zomboid/server/ini.ts` (suma `parseIni`), `site/src/zomboid/server/config.ts` (suma `fromParsed`, `nearestPreset`), `site/src/zomboid/server/Generator.tsx`, `site/src/zomboid/server/copy.ts`, `site/src/styles/zomboid-server.css`
- Create: `site/src/zomboid/server/Paste.tsx`, `site/test/zomboidServerParse.test.ts`

**Interfaces:**
- **`parseSandboxLua(text: string): LuaParse`:**
  ```ts
  type Issue = { line: number; key?: string; kind: "syntax" | "unknown" | "type" | "range" | "enum" | "after"; got?: string; used?: Value };
  interface LuaParse {
    ok: boolean;                  // false sólo si no hay ninguna tabla que leer
    wrapper: "SandboxVars" | "return" | null;
    version: number | null;       // VERSION o Version
    values: Record<string, Value>;// sólo las claves del juego con valor válido
    extra: string[];              // tablas o claves desconocidas, con su texto original (mods), para devolverlas
    issues: Issue[];
  }
  ```
  - **Un tokenizador a mano:** identificadores, `=`, `{`, `}`, `,`, `;`, números (con signo, decimales y exponente), `"…"` y `'…'` con escapes, `true`/`false`, `nil`, comentarios `--` y `--[[ … ]]`.
  - Gramática aceptada: `[SandboxVars =|return] { campo* }`, donde `campo = Nombre = (valor | { campo* })`, con coma o punto y coma opcionales.
  - Cualquier llamada (`getSandboxOptions():…`, `require`, `tonumber`) o expresión es un `syntax` con su renglón.
  - Lo que sigue a la tabla cerrada (el `getSandboxOptions():initSandboxVars()` de los archivos del juego) es un `after`, que se ignora.
  - **Nunca** `eval`, `new Function`, `import()` dinámico ni un intérprete.
  - Tope de 512 KB: más grande → `ok: false`.
- **Validación:**
  - cada clave conocida pasa por `coerce`;
  - un valor fuera de rango queda afuera de `values` y lleva `used` = el default de la base (texto propio: "el juego lo ignora y usa X", que es lo que hace `setValue`);
  - una clave desconocida va a `extra` y a `issues` como `unknown` (puede ser de un mod o de una versión vieja, como `XpMultiplier`);
  - `VERSION` < 6 → aviso "archivo de una versión anterior: el juego lo actualiza al cargarlo".
- **`parseIni(text): IniParse`:**
  - `{ values, extra, issues }`, renglón por renglón: `#` y vacíos se saltean; `Clave=valor` con la primera `=`;
  - las claves se comparan como el juego (exactas);
  - las desconocidas van a `extra` tal cual.
- **Qué tipo de archivo es:** si el texto tiene `{` antes de cualquier `=` de nivel cero, o empieza (salteando comentarios) con `SandboxVars`/`return`, es Lua; si no, `.ini`. Se puede elegir a mano.
- **`fromParsed(lua?, ini?, base?): Config`:** la base es `nearestPreset(values)` (el preset con menos diferencias; si empatan, el primero del orden del juego), o la que se pase. Las claves que el archivo no trae quedan en **Apocalipsis** (`fullPreset("apocalypse")`), no en esa base: un servidor dedicado nace con `SandboxOptions` en Apocalipsis y `readLuaFile` no resetea. La base de `nearestPreset` sólo sirve de etiqueta ("se parece a …") y para contar cambios.
- **`nearestPreset(values): { id: PresetId; diff: number }`.**
- **UI (`Paste.tsx`):** una hoja "Pegá tu archivo" arriba del generador.
  - `<textarea>` y "Elegir archivo" (`<input type=file accept=".lua,.ini,.txt">`, leído con `FileReader`: nada se sube).
  - **El resultado:**
    - "Se parece a Brote inicial: N diferencias";
    - la lista de diferencias (nombre del juego, valor del archivo y valor del preset, con las etiquetas de los enum);
    - "Claves que no son del juego (se conservan)";
    - los avisos con su renglón.
  - **"Cargar en el generador"** pasa todo al estado (`extra*` incluidos: un servidor con mods no pierde lo suyo al descargar) y baja hasta el generador.
  - **Texto propio:** "Tu archivo no sale de tu navegador."

- [ ] **Step 1: Tests que fallan** (`zomboidServerParse.test.ts`). Los casos concretos:
  - **La salida del generador vuelve igual:** `parseSandboxLua(writeSandboxLua(fromPreset("extinction"), "es"))` → `values` igual a `fullPreset("extinction")`, sin `issues`; lo mismo con `parseIni(writeIni(…))`.
  - **El archivo del juego:** `parseSandboxLua('SandboxVars = require "Sandbox/Apocalypse"\n\ngetSandboxOptions():initSandboxVars()')` → `ok: false` con un `syntax` en el renglón 1, sin tirar excepción.
  - **El formato viejo:** el texto de `SixMonthsLater.lua` copiado en el test (con `tonumber(ZombiePopulationMultiplier.VeryHigh)`) → `syntax` en ese renglón, y el resto leído (`TimeSinceApo` 7, `VERSION` 5 → aviso de versión, `XpMultiplier` → `unknown`).
  - **Un servidor con mods:** `'SandboxVars = {\n VERSION = 6,\n Zombies = 2,\n MiMod = {\n  Cosa = true,\n },\n}'` → `values.Zombies === 2` y `extra` con el bloque `MiMod` entero; `writeSandboxLua(fromParsed(…))` lo trae al final.
  - **Fuera de rango:** `Zombies = 9` → `issues` `{ key: "Zombies", kind: "enum", used: 4 }`, y `values.Zombies` ausente; `FoodLootNew = "mucho"` → `type`.
  - **Comentarios:** `--[[ bloque ]]`, un `--` al final del renglón y comillas simples se leen bien.
  - **No ejecuta nada:** `'return { A = os.execute("rm -rf /") }'` → `syntax`; el test además espía `globalThis.eval` y `Function` y verifica que no se llamen.
  - **`.ini`:** `"# hola\nPVP=false\nMaxPlayers=300\nPublicName=Mi = server\nMods=a;b\nRaro=1\n"`:
    - `PVP` false;
    - `MaxPlayers` → `range` (usa 32);
    - `PublicName` "Mi = server";
    - `Mods` "a;b";
    - `Raro=1` en `extra`.
  - **`nearestPreset`:** de `fullPreset("rising")` con 3 cambios → `{ id: "rising", diff: 3 }`.
- [ ] **Step 2:** `npx vitest run test/zomboidServerParse.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `parseSandboxLua`, `parseIni`, `fromParsed` y `nearestPreset`. → PASS.
- [ ] **Step 4:** `Paste.tsx` y su lugar en el generador. Un test SSR verifica que la hoja "Pegá tu archivo" esté en el HTML de `/es/project-zomboid/servidor`, con el texto de privacidad. Probarlo a mano en localhost con un `servertest_SandboxVars.lua` armado por el propio generador, editado.
- [ ] **Step 5: Commit** (la página ya está conectada: entra sola). `feat(zomboid): pegá tu SandboxVars.lua o tu .ini y el generador lo lee, lo compara y lo carga`.

---

### Task 4: Presets comparados (`/servidor/presets-de-sandbox`)

**Files:**
- Create: `site/src/zomboid/server/Presets.tsx`, `site/test/zomboidServerPresets.test.ts`
- Modify: `site/src/zomboid/server/ZomboidServer.tsx` (el `detail` `sandbox-presets` abre esta página), `site/src/zomboid/server/copy.ts`, `site/src/styles/zomboid-server.css`
- Modify (al conectar): `site/src/zomboid/server/Generator.tsx` (link "Comparar los presets"), `site/src/zomboid/ZomboidHome.tsx` si la portada lista las páginas, `site/test/zomboidPublish.test.ts`

**Interfaces:**
- Consumes: `fullPreset`, `SERVER.options`, `SERVER.pages`, `encodeConfig` (Task 2).
- **`presetRows(): { key: string; values: Value[] }[]`** (puro, en `config.ts`): las 153 opciones donde algún preset (efectivo) difiere de otro, en el orden de las hojas, con los valores en el orden de los presets.
- **UI:**
  - **Texto propio:** qué es cada preset (la descripción del juego) y cuántas opciones cambian entre ellos ("153 de 269").
  - **Escritorio:** una tabla por hoja del juego (opción × 5 presets).
    - Las celdas muestran la etiqueta del enum ("Normal", "Sprinters"), "sí"/"no" o el número.
    - La celda que difiere de Apocalipsis va con tinte.
    - El filtro "Sólo las que cambian" viene prendido (las 269 con el filtro apagado).
  - **Celular:** cada opción es una tarjeta con sus 5 valores en renglones (sin tabla ancha ni scroll horizontal).
  - **Debajo de cada preset:** "Usarlo en el generador", que va a `/servidor?p=<id>`.
  - **Breadcrumb:** "Servidor › Presets de sandbox".
- **El `<head>`:** `seo.detail.server("Sandbox Presets")` → "Project Zomboid Sandbox Presets (Build 42) | Vestigo"; ES "Presets de sandbox en Project Zomboid (Build 42) | Vestigo".

- [ ] **Step 1: Tests que fallan:**
  - `presetRows().length === 153`;
  - la fila de `Zombies` es `[4, 4, 3, 5, 1]`, la de `WaterShutModifier` es `[14, 14, 14, 14, -1]`, y `StartDay` no está (vale 9 en todos);
  - **SSR de `/es/project-zomboid/servidor/presets-de-sandbox`:**
    - lo abre en frío, con los slugs en español anotados al cargarse el chunk, como `zomboidColdLoadMoodles.test.ts`;
    - trae los 5 nombres en español, "Número de zombies" con sus etiquetas ("Normal", "Alto", "Bajo", "Zombicidio") y el texto con "153";
    - el `<head>` es el de la ficha;
  - **SSR de `/en/project-zomboid/server/sandbox-presets`** en inglés;
  - **en el sitemap**, con el índice: `/es/project-zomboid/servidor/presets-de-sandbox`.
- [ ] **Step 2:** `npx vitest run test/zomboidServerPresets.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `presetRows`, `Presets.tsx` y el CSS. → PASS. Mirarlo en localhost, en escritorio y en celular.
- [ ] **Step 4: Commit** de la página. `feat(zomboid): los presets de sandbox comparados opción por opción`.
- [ ] **Step 5: Conectar** (commit aparte): el link desde el generador ("Comparar los presets") y desde cada tarjeta de preset; el test de publicación. `feat(zomboid): conecta los presets comparados`.

---

### Task 5: La calculadora de cortes de agua y luz (`/servidor/cortes-de-agua-y-luz`)

**Files:**
- Create: `site/src/zomboid/server/shutoff.ts`, `site/src/zomboid/server/Shutoff.tsx`, `site/test/zomboidServerShutoff.test.ts`
- Modify: `site/src/zomboid/server/ZomboidServer.tsx` (el `detail` `water-and-power-shutoff`), `site/src/zomboid/server/Generator.tsx` (la línea de resultado junto a los modificadores), `site/src/zomboid/server/copy.ts`, `site/src/styles/zomboid-server.css`
- Modify (al conectar): `site/src/zomboid/ZomboidHome.tsx` (`lightning` enlaza), `site/test/zomboidPublish.test.ts`, `site/test/zomboidHome.test.ts`

**Interfaces:**
- **`shutoff.ts`** (puro, con los números de `SERVER.rules`, `SERVER.startHours`, `SERVER.dayLengthMinutes` y `SERVER.shutoff`; nada escrito a mano):
  ```ts
  export type Cut =
    | { kind: "never" }
    | { kind: "start" }                                  // ya no hay al empezar
    | { kind: "at"; date: Date; afterStartHours: number };   // date en UTC: la hora del juego
  export interface World { year: number; month: number; day: number; startTime: number; timeSinceApo: number; dayLength: number }
  export const worldOf: (sandbox: Record<string, Value>) => World;   // de StartYear/Month/Day/Time, TimeSinceApo, DayLength
  /** La cuenta del juego: no hay agua cuando ageDays >= m; no hay luz cuando ageDays > m. ageDays = horas desde las 7:00 / 24 + (timeSinceApo − 1) × 30. */
  export function cutAt(w: World, m: number, what: "water" | "power"): Cut;
  /** El rango de una partida de un jugador: el modificador se sortea entre [a, b] según WaterShut / ElecShut. */
  export function cutRange(w: World, option: number, what: "water" | "power"): { from: Cut; to: Cut };
  export const realTime: (w: World, hours: number) => number;        // minutos reales: hours / 24 × dayLengthMinutes
  ```
  La cuenta, para que no haya dudas:
  ```ts
  const H = 3_600_000;
  export function cutAt(w: World, m: number, what: "water" | "power"): Cut {
    if (m >= SERVER.shutoff.never) return { kind: "never" };
    const hour = SERVER.startHours[w.startTime - 1];
    const start = Date.UTC(w.year, w.month - 1, w.day, hour);
    // La edad del mundo se cuenta desde las 7:00; si la partida arranca antes, desde las 7:00 del día anterior.
    const ref = Date.UTC(w.year, w.month - 1, w.day - (hour < SERVER.rules.dayStartHour ? 1 : 0), SERVER.rules.dayStartHour);
    const ageAtStart = (start - ref) / H;
    const cutAge = 24 * (m - (w.timeSinceApo - 1) * SERVER.rules.monthDays);   // en horas de edad del mundo
    // Agua: corta con edad >= m. Luz: con edad > m. Al empezar sólo importa si ya pasó (o si es justo ahí para el agua).
    if (what === "water" ? cutAge <= ageAtStart : cutAge < ageAtStart) return { kind: "start" };
    return { kind: "at", date: new Date(ref + cutAge * H), afterStartHours: cutAge - ageAtStart };
  }
  ```
- **UI (`Shutoff.tsx`):**
  - **Dos modos**, en solapas de libreta:
    - **"Servidor"** (el día exacto, con `WaterShutModifier` / `ElecShutModifier`);
    - **"Partida de un jugador"** (el rango que sortea el juego, con `WaterShut` / `ElecShut` y sus etiquetas del juego).
  - **Entradas:** fecha de inicio (mes, día y año, con las etiquetas del juego), hora de inicio, meses desde el apocalipsis, duración del día y los dos valores de corte. "Empezá de un preset" las llena.
  - **Lee la misma dirección que el generador** (`?p=&s=`), así el link "ver cuándo se corta" del generador abre con tus valores.
  - **Resultado,** en dos hojas (agua y luz):
    - la fecha y la hora del juego ("23 de julio de 1993, 7:00", con `Intl.DateTimeFormat(locale, { timeZone: "UTC" })`);
    - "N días y H horas después de empezar";
    - "≈ X h reales con días de 1 h 30 min";
    - "Ya no hay al empezar" o "Nunca".
  - **Texto propio, corto, en/es** (es lo que nadie explica):
    - en un servidor manda el modificador y el rango no se usa;
    - el día se cuenta desde las 7:00;
    - cada mes desde el apocalipsis resta 30 días;
    - el rango "0 a 30 días" es en realidad de 0 a 29.
  - **El `<head>`:** `seo.detail.server("Water and Power Shutoff")` → "Project Zomboid Water and Power Shutoff (Build 42) | Vestigo" (60); ES "Cortes de agua y luz en Project Zomboid (Build 42) | Vestigo" (59).
- **En el generador,** junto a `WaterShutModifier` y `ElecShutModifier`, la línea "se corta el …" con `cutAt` y el link a esta página con `?p=&s=`.

- [ ] **Step 1: Tests que fallan** (`zomboidServerShutoff.test.ts`), con los valores calculados a mano:
  - **Servidor con Apocalipsis** (14, `TimeSinceApo` 1, 9 de julio de 1993, 9 AM): agua y luz el `1993-07-23T07:00Z`, `afterStartHours` 334.
  - **6 meses después** (−1, `TimeSinceApo` 7): agua y luz `start`.
  - **Un mes desde el apocalipsis** (`TimeSinceApo` 2):
    - con 14 → `start`;
    - con 45 → `1993-07-24T07:00Z`, 358 h.
  - **Arranque a las 12 AM** (`StartTime` 7, 9 de julio) con 14: `1993-07-22T07:00Z`, 319 h.
  - **Nunca:** 2147483647 → `never`.
  - **Un jugador con Apocalipsis:**
    - agua (opción 2) desde `start` (m = 0) hasta `1993-08-07T07:00Z` (m = 29);
    - luz (opción 2) del `1993-07-23T07:00Z` al `1993-08-07T07:00Z`.
  - **Un jugador con Brote inicial:** agua (opción 3) hasta `1993-09-06T07:00Z` (m = 59).
  - **Borde de agua contra luz:** m = 0 con arranque a las 7 AM (edad 0) → agua `start`; luz `at` 1993-07-09T07:00Z con 0 h.
  - **`realTime`:** 334 h con `DayLength` 4 (90 min) → 1252,5 minutos.
  - **SSR:**
    - `/es/project-zomboid/servidor/cortes-de-agua-y-luz` con "23 de julio de 1993" y el texto propio;
    - `/en/project-zomboid/server/water-and-power-shutoff` con "July 23, 1993";
    - el `<head>` de la ficha;
    - sin "cargando".
- [ ] **Step 2:** `npx vitest run test/zomboidServerShutoff.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `shutoff.ts`, `Shutoff.tsx`, la línea del generador y el CSS. → PASS. Mirarlo en localhost (escritorio y celular): cambiar el preset, la hora de arranque y los meses, y ver que el resultado se mueve como dicen los tests.
- [ ] **Step 4: Commit** de la página. `feat(zomboid): la calculadora de cortes de agua y luz, con la cuenta del juego`.
- [ ] **Step 5: Conectar** (commit aparte):
  - en la portada, "Water and power" / "Agua y luz" (`lightning`) deja de estar en "Pronto" y va a esta ficha;
  - el generador enlaza desde los modificadores;
  - los tests de portada y de publicación;
  - `npx vitest run test/zomboid*.test.ts` y `python games/zomboid/tools/test_server.py` → PASS;
  - `cd site && npm run build` sin errores, y el prerender de las tres páginas sin "cargando".

  `feat(zomboid): conecta la calculadora de cortes desde la portada y el generador`.
