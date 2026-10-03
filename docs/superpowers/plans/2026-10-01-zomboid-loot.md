# Project Zomboid — Botín: dónde aparece cada cosa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada ficha de Objetos diga **dónde aparece** (habitaciones y muebles, escondites, zombis, vehículos y adentro de qué bolsos, con su chance) y que la hoja de un edificio del Mapa diga, por habitación, **qué puede aparecer** ahí; todo calculado con las reglas del juego (42.21) por un extractor nuevo, `loot.py`.

**Architecture:**
- **`loot.py`** (segunda etapa de datos, como dice el diseño): lee `Distributions.lua`, `ProceduralDistributions.lua`, `SuburbsDistributions.lua`, los `Distribution_*Junk.lua`, `Distribution_BagsAndContainers.lua` y los de vehículos con un **lector chico de tablas Lua** propio (`luatable.py`, sin dependencias), aplica las reglas de `ItemPickerJava` (leídas del bytecode, ver "La cuenta") y escribe `games/zomboid/data/loot/**`:
  - por objeto, repartido en los mismos 100 archivos que las fichas (`loot/items/<NN>.json`, mismo `pzShard`);
  - por habitación del mapa, en 32 archivos (`loot/rooms/<NN>.json`);
  - lo común (nombres de muebles, atuendos, vehículos, zonas, escondites, alias y un edificio de ejemplo por habitación) en `loot/common.json`.
- **Objetos:** la ficha suma la hoja **"Dónde aparece"**. Baja su archivo de botín y `common.json` además del de la ficha; el prerender los espera, así que el HTML trae la hoja entera.
- **Mapa:** la hoja del edificio (que ya es un chunk aparte, pedido al montarse el visor) suma por habitación un desplegable **"Qué hay"**, con los archivos de habitaciones pedidos recién al abrir la hoja. El chunk de la pestaña no crece.

**Tech Stack:** Python 3.14 (sólo biblioteca estándar; `unittest`), React 18 + Vite + TS, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md` (Datos: `loot.py`; Pestañas: Mapa "al tocar un edificio… qué puede aparecer en cada una", Objetos "dónde aparece con 'ver en el mapa'"; Orden de construcción, paso 4). Andamio: `docs/superpowers/plans/2026-09-30-zomboid-andamio.md`. Objetos: `docs/superpowers/plans/2026-09-30-zomboid-objetos-recetas.md`. Mapa: `docs/superpowers/plans/2026-09-30-zomboid-mapa.md` (contrato de `bld/<región>.json` en `write_web` de `map.py`).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. npm/vitest desde `site/`; los extractores y los tests de Python desde la raíz del worktree. `test/deadlock.test.ts` falla por una dependencia ajena: ignorarlo.
- **Nunca `git add -A`**: agregar sólo los archivos de cada tarea (hay otro agente escribiendo en paralelo).
- **Instalación del juego:** `C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid`, overridable con `PZ_DIR` (igual que `map.py`). Sólo se lee.
- **Orden de los extractores:** `extract.py` → `map.py` → `loot.py`. `loot.py` necesita `data/items.json`, `data/index.json`, `data/meta.json` y `data/map/buildings.json`; si falta alguno corta con un mensaje que dice qué correr.
- **Determinismo:** mismo orden siempre; un archivo se reescribe sólo si cambió; los que ya no salen se borran (como `site.py` y `map.py`). `data/loot/meta.json` guarda `extractedAt`, que sólo se mueve si cambia el hash de los datos (como `data/map/meta.json`).
- **Estética "Libreta de supervivencia"** (maqueta C, clases `.pz-*` en `site/src/styles/zomboid.css`): hojas con renglones, títulos en Old Standard TT, notas a mano en Caveat (lápiz rojo), texto en Noto Sans; los sellos del juego (`/zomboid/map/stamps/map_<n>.png`, `Stamp`) como viñetas; íconos del juego con `image-rendering: pixelated` (`ItemIcon`).
- **Reglas de la casa:**
  - sin bordes ni barras de color en tarjetas o filas: la rareza va por texto (y, si hace falta, un tinte de fondo suave), nunca por un filo;
  - las palabras no se cortan (nunca `overflow-wrap: anywhere`; títulos con container queries);
  - sin scroll horizontal de la página en el celular: las filas de "Dónde aparece" y "Qué hay" son listas que bajan de renglón, no tablas anchas;
  - todo texto en/es, con voseo rioplatense;
  - **nada de "sacado de los archivos del juego"** ni de cómo se calcula por dentro: la nota dice qué significa el número ("chance de que un mueble traiga al menos uno, con el botín en Normal"), no de dónde sale;
  - el prerender nunca muestra "cargando…": lo que va en el HTML se espera en `preloadItemsRoute`.
- **Nombres del juego:** de los datos, sin inventar nombres oficiales. Los de habitaciones salen de `site/src/zomboid/map/rooms.ts` (ya escritos a mano). Los de muebles, atuendos de zombi, vehículos y escondites el juego no los tiene, o los tiene ambiguos (ver Task 2), y van escritos a mano en `loot_names.py`, con test de cobertura.
- **Rendimiento:**
  - la cáscara no crece; el chunk de la pestaña Mapa (`ZomboidMap`, 11,7 KB gz) no crece; el de la hoja del edificio (`BuildingSheet`, 6,6 KB gz) crece a lo sumo 3 KB gz;
  - el chunk de Objetos (`ZomboidItems`, 69 KB gz) crece a lo sumo 8 KB gz, contando el chunk compartido con `rooms.ts` si Vite lo separa;
  - los JSON de botín nunca van en un chunk: sólo por `import()` dinámico (`import.meta.glob` sin `eager`).
- Comentarios y commits en español rioplatense, explicando el porqué.

---

## Lo que hay en el juego (42.21, medido el 1/10 con un prototipo del lector)

| Qué | Cuánto |
|---|---|
| `Distributions.lua`, claves de primer nivel de `distributionTable` | 650 |
| — tablas de habitación (`kitchen`, `bathroom`…) | 365 |
| — escondites y refugios de sobreviviente (`GunCache1`, `SafehouseLoot_Mid`…: empiezan con mayúscula) | 15 |
| — `all` (muebles fuera de un cuarto o en cuartos sin tabla, más los zombis) | 1 |
| — tablas de "historia" con `roomTypes` (`BandPractice`, `Carpenter`, `Chef`, `Farmer`, `Nurse`): **afuera** de este plan | 5 |
| — tablas de contenedores-objeto (`Bag_*`, `AmmoStrap_*`, cajas de munición…: lo que trae un bolso al encontrarlo) | 263 |
| Pares habitación × mueble | 1.715 (1.327 procedurales, 388 comunes) |
| Tipos de mueble distintos en las habitaciones (sin los 125 `Outfit_*` ni `inventorymale/female`) | 72 |
| Listas de `ProceduralDistributions.list` | 1.424 (4 quedan `nil` en Lua: `Bakery`, `WardrobeManClassy`, `WardrobeWoman`, `WardrobeWomanClassy`, porque nombran otra lista como si fuera una variable) |
| Alias de `SuburbsDistributions.lua` (`mergeDistributions`: `garage` = `mechanic`, `diningroom` = `dining`…) | 41 |
| `NoContainerFillRooms` | 16 cuartos |
| Zombis | `all.inventorymale` y `all.inventoryfemale` (1 tirada, 50 objetos) y 125 atuendos `all.Outfit_<atuendo>` |
| `VehicleDistributions` | 324 claves: 82 grupos de vehículo (`Police`, `Ambulance`, `NormalStandard`…) con sus partes (`GloveBox`, `TruckBed`, `TruckBedOpen`, `TrailerTrunk`, `SeatFrontLeft/Right`, `SeatRearLeft/Right`) y 242 tablas |
| Listas forzadas en `procList` | `forceForTiles` 252, `forceForRooms` 35, `forceForZones` 35 (`Rich` 16, `TrailerPark` 12, `University` 5, `Poor` 1, `Cultists` 1), `forceForItems` 4 |
| Nombres de objeto distintos en todas las tablas | 3.427 |
| — en habitaciones | 3.145; existen en la 42.21 3.130 (15 no: `Antlers`, `BookKnapping1`…`5`, `Bullets308Box`, `CDPlayer`, `FishingTackle`, `FishingTackle2`, `FleshingTool`, `KnifeSmall`, `Magazine_Cars_New`, `Trousers_Suit_TEXTURE`, `WoodenCrucibleMold`), que caen en **2.555 de las 3.826 fichas** |
| Combinaciones (objeto, habitación, mueble) con chance > 0, sin listas forzadas | 99.354 |
| Habitaciones del mapa (`common.rooms`) | 586 nombres: 351 con tabla propia exacta, 27 por alias (378), 208 caen a `all` |
| `ContainerType` (jar) | 89 tipos; 41 en `NO_GENERIC_LOOT_CONTAINERS` (`barbecue`, `barbecuepropane`, `bin`, `brazier`, `campfire`, `cashregister`, `clothingdryer`, `clothingdryerbasic`, `clothingrack`, `clothingwasher`, `coffeemaker`, `coffin`, `composter`, `dishwasher`, `doghouse`, `dumpster`, `fireplace`, `freezer`, `fridge`, `icecream`, `logs`, `Mannequin`, `medicine`, `microwave`, `newspaper_dispatch`, `newspaper_herald`, `newspaper_knews`, `newspaper_times`, `plankstash`, `postbox`, `shelter`, `stonefurnace`, `stove`, `SurvivorCrate`, `tent`, `toaster`, `trough`, `vendingGt`, `vendingpop`, `vendingsnack`, `woodstove`) |
| Peso estimado | top 12 por objeto: 1.063 KB crudos / 108 KB gzip en total (~11 KB crudos por archivo de 100); top 40 por habitación, sólo ids: 369 KB / 68 KB |

Las cifras de arriba son del prototipo; `loot.py --check` las imprime y la Task 1 las fija en tests (con margen donde un parche las puede mover).

## La cuenta (cómo tira el botín el juego)

Leído del bytecode de `zombie/inventory/ItemPickerJava.class` (42.21) con el lector de `.class` de `extract.py` (`_jar_class`, `_instructions`). Los `pc` son de esa versión.

1. **Qué tabla tira un mueble** (`fillContainerInternal` pc 446–718, `fillContainerTypeInternal` pc 0–193):
   - El cuarto se busca por su nombre **exacto** (mayúsculas incluidas: `Bathroom` no es `bathroom`) en `distributionTable`, con los alias ya aplicados (`dist[X] = dist[Y]`, en el orden de `mergeDistributions`).
   - Si el cuarto tiene tabla y define ese mueble, usa esa. Si no la define y el mueble **no** está en `NO_GENERIC_LOOT_CONTAINERS`, usa `other` del cuarto. Si no hay ninguna de las dos, o el cuarto no tiene tabla, o el mueble está afuera de un cuarto, usa `all.<mueble>`.
   - Si el cuarto trae una clave `all` (3 lo hacen: `empty`, `pawnshopcooking`, `sodatruck`), esa tabla se tira en cualquier mueble del cuarto (los 3 no traen otra cosa; si un cuarto trajera `all` y otros muebles, el juego tiraría las dos y `loot.py` corta). `NoContainerFillRooms` no cambia la tabla: decide si un bolso que sale de un mueble **común** viene lleno (en esas tiendas, vacío); los de un mueble procedural se llenan igual (`Loot.fills_bags`).
   - **Zombis** (pc 44–442): se tira `all.Outfit_<atuendo>` si existe; después, `all.inventorymale` o `all.inventoryfemale` si no hay tabla de atuendo o si la del atuendo tiene `defaultInventoryLoot` (por defecto `true`, `ItemPickerContainer.<init>`).
   - **Vehículos:** cada parte (`GloveBox`, `TruckBed`…) tira la tabla de su grupo (`VehicleDistributions.<grupo>.<parte>`) con el mismo `doRollItem`.
   - **Bolsos y cajas:** al aparecer, un objeto-contenedor tira `distributionTable.<su tipo>` (`rollContainerItem`).
2. **Muebles procedurales** (`rollProceduralItemInternal` pc 69–953): el mueble elige **una** lista de `procList` y después la tira como una tabla común.
   - Una lista con `forceForTiles`, `forceForItems`, `forceForZones` o `forceForRooms` que se cumple gana sola. Si no se cumple, no participa.
   - Las demás compiten por peso: `weightChance` (si es ≤ 0 o falta, vale 1), sólo las que todavía no salieron `max` veces en el cuarto (`getProceduralSpawnedContainer`).
   - Adentro de un cuarto, las listas con `min == 1` (exactamente 1) que todavía no salieron **en el cuarto** van primero (pc 772–812): si hay alguna, se elige sólo entre ellas. La cuenta es por cuarto y por nombre de lista, no por tipo de mueble; afuera de un cuarto no hay ni prioridad ni tope.
   - Elegir es `getDistribInHashMap` (pc 115–180), que **no** es proporcional al peso: arma un `java.util.HashMap` nuevo con las listas en el orden del `procList`, saca `r = Rand.Next(total)` ∈ [0, total − 1] y devuelve la primera lista, en el orden de recorrido del `HashMap`, con acumulado ≥ r. La primera gana 1 de peso y la última pierde 1; con dos listas de peso 1, la segunda no sale nunca (13 listas en cuartos, p. ej. `restaurantdining.fridge` → `FridgeSnacks`). `loot.py` emula el orden del `HashMap` (`java_hashmap_order`).
3. **Tirar una tabla** (`rollItemInternal` y `doRollItemInternal` pc 256–1832):
   - Primero la `junk` de la tabla (con `isJunk = true`), después sus `items`.
   - Tiradas: `max(1, (int)(rolls × RollsMultiplier))`.
   - En cada tirada, **cada entrada** de la lista (`"Nombre", peso`) sale si `Rand.Next(10000) < getActualSpawnChance(...)`; las entradas son independientes (un nombre repetido son dos chances). `onlyOne` (1 tabla) corta en el primero que sale.
   - Un nombre que no existe y termina en `Empty` se busca sin el `Empty` (pc 333–397: sale el recipiente vacío).
4. **La chance de una entrada** (`getActualSpawnChance` pc 0–96, `getBaseChance`, `getBaseChanceMultiplier`, `getLootModifier(String, boolean)`, `getAdjustedZombieDensity`, `SandboxOptions.getCurrentLootMultiplier`):

   ```
   chance = (peso × J × 100 × M + D) × L                    sale si Rand.Next(10000) < chance
   J = 1,4 en la junk (getBaseChanceMultiplier pc 3-11), 1 en el resto
       (× 2 si el objeto tiene la etiqueta MORE_WHEN_NO_ZOMBIES y la partida no tiene zombis)
   M = getLootModifier: el multiplicador de la categoría del objeto en la configuración de la partida
       (FoodLootNew, WeaponLootNew… según getLootType), 0 si está en la lista de objetos quitados;
       en la junk, 1 si ese multiplicador es > 0
   D = 0 en la junk o si el objeto ignora la densidad de zombis;
       si no, min(intensidad de zombis del chunk, 8) × ZombiePopLootEffect
   L = 1 − DiminishedLootPercentage / 100 (1 al empezar la partida)

   p(entrada, tirada) = min(1, ⌈chance⌉ / 10000)             (Rand.Next(10000) es un entero; chance es float de 32 bits)
   P(≥ 1 en el mueble) = 1 − Π_entradas (1 − p)^tiradas      (junk e items juntos)
   P(≥ 1 en un mueble procedural) = Σ_listas libres (casos de r que la eligen / Σ pesos) × P(≥ 1 | esa lista)
                                    (la primera del HashMap tiene w + 1 casos, la última w − 1, las demás w)
   ```

### Decisión: qué número muestra el sitio

**El sitio muestra la chance de que un mueble traiga al menos uno, calculada con el botín en "Normal"** (M = 1 en todas las categorías, `RollsMultiplier` = 1, `ZombiePopLootEffect` = 0, día 1), como porcentaje y como palabra (muy común / común / poco común / raro / muy raro). Así, con peso `w` y fuera de la junk, `p = ⌈w × 100⌉ / 10.000` por tirada (el sorteo es un entero de 0 a 9.999 comparado con una chance en float: 0,3 → 0,31 %, 0,001 → 0,01 %; ver `entry_chance`).

Por qué, con lo medido:

- **El número absoluto depende de la partida.** Los presets traen la mayoría de las categorías en 0,6 (Apocalypse: comida 0,8, armas de fuego 1,2, llaves 0,4; Extinction, 0,4; Rising, 1,0 en "otros"). Extinction suma `ZombiePopLootEffect = 10`, y el botín baja con los días (`DaysUntilMaximumDiminishedLoot = 3650`). No hay un número "del juego": hay uno por partida.
- **El orden entre lugares sí es el del juego.** Para un mismo objeto, M es el mismo en todos los muebles (depende de su categoría, no del lugar), así que "dónde conviene buscar" no cambia con la configuración. La excepción es la junk, que ignora M: queda dicho en la nota de la Task 3.
- **Mostrar el número de Apocalypse** pediría replicar `getLootType` (20 categorías armadas con `displayCategory`, etiquetas y banderas del script, como `isMedicalLoot` o `cannedFood`), que es otra cadena de bytecode para mantener en cada parche. Queda como decisión abierta (ver "Fuera de este plan").
- Las bandas: `p ≥ 0,25` muy común; `≥ 0,10` común; `≥ 0,03` poco común; `≥ 0,005` raro; menos, muy raro.
- El porcentaje se escribe con 1 decimal debajo del 10 % y sin decimales arriba. Debajo de 0,1 % va "< 0,1 %".

Casos a mano (los fijan los tests):

| Caso | Cuenta | Resultado |
|---|---|---|
| `TinnedBeans` en `kitchen.counter` | 8 listas libres que suman 540 de peso; `KitchenCannedFood` pesa 100 y queda última en el `HashMap` → 99/540. La lista tira 2 veces con peso 4 → 1 − 0,96² = 0,0784 | **0,0143733** (1,4 %) |
| `TinnedBeans` en `kitchen.metal_shelves` | 2 listas de 100; `KitchenCannedFood` va última → 99/200 × 0,0784 | **0,038808** |
| `Bowl` en `kitchen.overhead` | `KitchenDishes` tiene `min = 1`: el primer mueble alto la elige siempre; 4 tiradas con peso 10 → 1 − 0,9⁴ | **0,3439** |
| `Bag_TrashBag` en `all.bin` | 4 tiradas con peso 20 → 1 − 0,8⁴ (no está en la junk) | **0,5904** |
| `BaseballBat_Broken` en `all.bin` | sólo en la junk (`ClutterTables.BinJunk`, 1 tirada): 0,05 × 1,4 / 100 | **0,0007** |
| `Money` en `all.cashregister` | una entrada con peso 100 → p = 1 | **1** |
| `Pen` en un zombi | `inventorymale` e `inventoryfemale`, 1 tirada, peso 1 | **0,01** (los dos) |
| `Badge` en un zombi policía | `Outfit_Police`, 1 tirada, peso 50 (y nada en `inventorymale`) | **0,5** |
| `Bullhorn` en el baúl de un patrullero | `VehicleDistributions.Police.TruckBed`, 4 tiradas, peso 10 | **0,3439** |
| `Bullhorn` en la guantera de un patrullero | `Police.GloveBox`, 1 tirada, peso 10 | **0,1** |

## Archivos

| Archivo | Qué hace |
|---|---|
| `games/zomboid/tools/luatable.py` (nuevo) | Lector del subconjunto de Lua que usan las tablas de botín (constructores de tablas, literales, nombres con punto, `local`, `x or y`), sin dependencias. |
| `games/zomboid/tools/loot.py` (nuevo) | Lee los `.lua`, aplica las reglas de "La cuenta" y escribe `data/loot/**`. `--check` imprime el inventario sin escribir. |
| `games/zomboid/tools/loot_names.py` (nuevo) | Nombres en/es escritos a mano: muebles, partes de vehículo, grupos de vehículo, atuendos de zombi, escondites y zonas. |
| `games/zomboid/tools/tests/test_loot.py` (nuevo) | Tests de Python (`unittest`): el lector, las reglas, los casos a mano y los archivos. |
| `games/zomboid/tools/site.py` | Expone `fnv1a32(s)` y `shard(slug, n=SHARDS)`, para que `loot.py` reparta igual. |
| `games/zomboid/data/loot/**` (generado) | `items/<NN>.json` (100), `rooms/<NN>.json` (32), `common.json`, `meta.json`. |
| `site/src/zomboid/shard.ts`, `site/src/zomboid/store.ts` | `pzShardOf(key, n)`; `shardedFichas` acepta la función de reparto. |
| `site/src/zomboid/loot/data.ts`, `site/src/zomboid/loot/chance.ts` (nuevos) | Tipos y carga del botín por objeto y de `common.json`; porcentaje y banda. |
| `site/src/zomboid/items/WhereFound.tsx` (nuevo) | La hoja "Dónde aparece" de la ficha. |
| `site/src/zomboid/loot/roomLoot.ts`, `site/src/zomboid/map/RoomLoot.tsx` (nuevos) | Carga de los archivos de habitaciones y el desplegable "Qué hay" de la hoja del edificio. |

---

### Task 1: `luatable.py` y el núcleo de `loot.py` — leer las tablas y calcular la chance

**Files:**
- Create: `games/zomboid/tools/luatable.py`, `games/zomboid/tools/loot.py`, `games/zomboid/tools/tests/test_loot.py`

**Interfaces:**
- Consumes: el juego instalado (`PZ_DIR`); `data/items.json` para saber qué ids existen (con `known=None`, todo id existe: los tests unitarios no lo necesitan).
- Produces:
  - `luatable.run_lua(src: str, env: dict, file: str = "?") -> dict`: ejecuta el archivo; los globales quedan en `env` (con nombres con punto: `ClutterTables.BinJunk` → `env["ClutterTables"]["BinJunk"]`) y devuelve los `local` del archivo.
    - Una tabla con sólo elementos sin clave es `list`; con claves, `dict` (si mezcla, los sin clave van en `"__arr"`). `{}` es `{}`.
    - Un campo cuyo valor es `nil` (o un nombre que no existe todavía, como `Bakery = BakeryMisc`) **no se guarda**, como en Lua.
    - Se saltean: `function … end` (también `local function`), las llamadas sueltas (`table.insert(…)`, `Events.X.Add(…)`) y los comentarios `--` y `--[[ … ]]`.
    - Cualquier otra cosa en una expresión (`..`, aritmética, llamadas dentro de una tabla) levanta `luatable.LuaError(f"{file}:{línea}: …")`: se prefiere cortar a leer mal.
  - En `loot.py`:
    - `REF = {"lootModifier": 1.0, "rollsMultiplier": 1.0, "zombiePopLootEffect": 0, "day": 1}` y `JUNK_MULT = 1.4`;
    - `game_id(name: str) -> str`: `"Base.X"` si no trae módulo;
    - `resolve_item(name: str, known: set[str] | None) -> str | None`: el id, o el del nombre sin `Empty` si sólo ése existe; `None` si ninguno existe;
    - `entry_chance(weight: float, junk: bool) -> float`;
    - `table_chances(t: dict, junk: bool = False, known=None) -> dict[str, float]`: id → P(≥ 1) en un mueble que tira `t` (más su `junk`);
    - `container_chances(c: dict, procedural: dict, known=None) -> list[tuple[str, float, str | None]]`: (id, P, fuerza), con fuerza `None` para lo que compite por peso y `"z:<zona>"`, `"t"`, `"r"` o `"i"` para lo de una lista forzada (P dada esa lista);
    - `class Loot` (con `Loot(game_dir=PZ_DIR, known=None)`), que tiene:
      - `rooms: dict[str, dict]`, tabla de cuarto por clave, con alias aplicados, sin `all`, sin escondites y sin las 5 de historia;
      - `stashes: dict[str, dict]`, los 15 que empiezan con mayúscula;
      - `general: dict[str, dict]`, `all` sin `Outfit_*` ni `inventory*`;
      - `zombie: {"m": dict, "f": dict}`, `outfits: dict[str, dict]` (sin el prefijo `Outfit_`), `bags: dict[str, dict]`, `vehicles: dict[str, dict[str, dict]]` (grupo → parte → tabla), `procedural: dict[str, dict]`;
      - `aliases: dict[str, str]` y `missing_lists: list[str]` (las listas nombradas que no existen);
      - `table_for(room: str | None, container: str) -> dict | None`, la regla 1 de "La cuenta".
  - `python games/zomboid/tools/loot.py --check` imprime el inventario de la tabla de arriba y no escribe nada.

- [ ] **Step 1: Tests que fallan** (`games/zomboid/tools/tests/test_loot.py`). Los de `luatable` y la cuenta no necesitan el juego; los de "en el juego" se saltean si no está (`@unittest.skipUnless(os.path.isdir(loot.PZ_DIR), "sin el juego")`).

```python
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import luatable, loot  # noqa: E402


class LuaTest(unittest.TestCase):
    def test_tablas_locales_y_globales(self):
        env = {}
        loc = luatable.run_lua('''
            ClutterTables = ClutterTables or {}
            ClutterTables.Junk = { rolls = 1, items = { "Pen", 8, "Base.Pencil", 0.5 } }
            local t = { kitchen = { counter = { rolls = 2, items = {}, junk = ClutterTables.Junk } },
                        Bakery = BakeryMisc, n = -3 }
            function ignorada() if x then return 1 end end
            table.insert(Distributions, 1, t)
        ''', env, "prueba.lua")
        self.assertEqual(env["ClutterTables"]["Junk"]["items"], ["Pen", 8.0, "Base.Pencil", 0.5])
        self.assertIs(loc["t"]["kitchen"]["counter"]["junk"], env["ClutterTables"]["Junk"])
        self.assertNotIn("Bakery", loc["t"])  # un nombre que no existe es nil: el campo no se guarda
        self.assertEqual(loc["t"]["n"], -3.0)

    def test_corta_ante_lo_que_no_entiende(self):
        with self.assertRaises(luatable.LuaError) as e:
            luatable.run_lua('x = { a = "b" .. "c" }', {}, "raro.lua")
        self.assertIn("raro.lua:1", str(e.exception))


class CuentaTest(unittest.TestCase):
    def test_entrada_y_junk(self):
        self.assertAlmostEqual(loot.entry_chance(4, False), 0.04)
        self.assertAlmostEqual(loot.entry_chance(0.05, True), 0.0007)
        self.assertEqual(loot.entry_chance(100, False), 1.0)

    def test_tabla_con_tiradas_y_repetidos(self):
        t = {"rolls": 4, "items": ["Money", 100, "Bowl", 10, "Bowl", 10], "junk": {"rolls": 1, "items": ["Pen", 1]}}
        p = loot.table_chances(t)
        self.assertEqual(p["Base.Money"], 1.0)
        self.assertAlmostEqual(p["Base.Bowl"], 1 - 0.9 ** 8)       # dos entradas, cuatro tiradas
        self.assertAlmostEqual(p["Base.Pen"], 0.014)               # junk: × 1,4

    def test_procedural_reparte_por_peso_y_respeta_min_1(self):
        proc = {"A": {"rolls": 2, "items": ["TinnedBeans", 4]}, "B": {"rolls": 1, "items": ["Bowl", 10]}}
        c = {"procedural": True, "procList": [{"name": "A", "min": 0, "max": 1, "weightChance": 100},
                                               {"name": "B", "min": 0, "max": 1, "weightChance": 440}]}
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertAlmostEqual(got["Base.TinnedBeans"], 101 / 540 * (1 - 0.96 ** 2))  # "A" va primera en el HashMap: +1
        c["procList"][1]["min"] = 1   # el primer mueble del cuarto elige B sí o sí
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertNotIn("Base.TinnedBeans", got)
        self.assertAlmostEqual(got["Base.Bowl"], 0.1)

    def test_listas_forzadas_van_aparte(self):
        proc = {"Rica": {"rolls": 1, "items": ["Caviar", 10]}, "Comun": {"rolls": 1, "items": ["Bowl", 10]}}
        c = {"procedural": True, "procList": [{"name": "Rica", "min": 0, "max": 99, "forceForZones": "Rich"},
                                               {"name": "Comun", "min": 0, "max": 99, "weightChance": 100}]}
        got = {g: (p, f) for g, p, f in loot.container_chances(c, proc)}
        self.assertAlmostEqual(got["Base.Caviar"][0], 0.1)
        self.assertEqual(got["Base.Caviar"][1], "z:Rich")
        self.assertAlmostEqual(got["Base.Bowl"][0], 0.1)
        self.assertIsNone(got["Base.Bowl"][1])

    def test_nombres_con_empty(self):
        self.assertEqual(loot.resolve_item("PopEmpty", {"Base.Pop"}), "Base.Pop")
        self.assertEqual(loot.resolve_item("Base.Pen", {"Base.Pen"}), "Base.Pen")
        self.assertIsNone(loot.resolve_item("BookKnapping1", {"Base.Pen"}))


@unittest.skipUnless(os.path.isdir(loot.PZ_DIR), "sin el juego")
class JuegoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.L = loot.Loot()

    def p(self, room, cont, gid):
        return {g: p for g, p, f in loot.container_chances(self.L.table_for(room, cont), self.L.procedural) if f is None}.get(gid)

    def test_casos_a_mano(self):
        self.assertAlmostEqual(self.p("kitchen", "counter", "Base.TinnedBeans"), 99 / 540 * (1 - 0.96 ** 2), places=6)
        self.assertAlmostEqual(self.p("kitchen", "metal_shelves", "Base.TinnedBeans"), 0.038808, places=6)
        self.assertAlmostEqual(self.p("kitchen", "overhead", "Base.Bowl"), 0.3439, places=6)
        self.assertAlmostEqual(self.p(None, "bin", "Base.Bag_TrashBag"), 0.5904, places=6)
        self.assertAlmostEqual(self.p(None, "bin", "Base.BaseballBat_Broken"), 0.0007, places=6)
        self.assertEqual(self.p(None, "cashregister", "Base.Money"), 1.0)
        self.assertAlmostEqual(loot.table_chances(self.L.zombie["m"])["Base.Pen"], 0.01, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.zombie["f"])["Base.Pen"], 0.01, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.outfits["Police"])["Base.Badge"], 0.5, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.vehicles["Police"]["TruckBed"])["Base.Bullhorn"], 0.3439, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.vehicles["Police"]["GloveBox"])["Base.Bullhorn"], 0.1, places=6)

    def test_reglas_de_la_tabla(self):
        L = self.L
        self.assertIs(L.table_for("garage", "counter"), L.rooms["mechanic"]["counter"])   # alias
        self.assertIs(L.table_for("kitchen", "crate"), L.rooms["kitchen"]["other"])       # sin crate: other
        self.assertIs(L.table_for("kitchen", "bin"), L.general["bin"])                    # bin no es genérico
        self.assertIs(L.table_for("bedroom4", "counter"), L.general["counter"])           # cuarto sin tabla
        self.assertIs(L.table_for("Bathroom", "counter"), L.general["counter"])           # mayúsculas: otro cuarto

    def test_inventario(self):
        L = self.L
        self.assertGreaterEqual(len(L.rooms), 360)
        self.assertEqual(len(L.stashes), 15)
        self.assertGreaterEqual(len(L.procedural), 1400)
        self.assertEqual(sorted(L.missing_lists), ["Bakery", "WardrobeManClassy", "WardrobeWoman", "WardrobeWomanClassy"])
        self.assertEqual(len(L.vehicles), 82)
        self.assertEqual(len(L.outfits), 125)
        self.assertGreaterEqual(len(L.bags), 250)
        self.assertEqual(L.aliases["garage"], "mechanic")
```

- [ ] **Step 2: Correrlos y verlos fallar.**
  Run: `python -m unittest discover -s games/zomboid/tools/tests -v`
  Expected: FAIL con `ModuleNotFoundError: No module named 'luatable'`.
- [ ] **Step 3: Escribir `luatable.py`.**
  - Tokenizador con una regex que reconoce comentarios, strings con escapes, números, nombres con punto y operadores. Anotar la línea de cada token, para los errores.
  - Las sentencias que se entienden: `local nombre = expr`, `nombre.con.puntos = expr` (local si la raíz es local, global si no), `function … end` (se cuentan `function`/`if`/`for`/`while` contra `end` para saltearlas) y llamadas sueltas (`nombre(…)`, que se saltean balanceando paréntesis).
  - En expresiones: `{…}`, string, número, `-número`, `true`/`false`/`nil`, nombre (busca primero en los locales y después en `env`) y `a or b`.
- [ ] **Step 4: Escribir el núcleo de `loot.py`.**
  - Docstring al estilo de `site.py` y `map.py`: qué lee, qué escribe, por qué así, y la sección "La cuenta" de este plan resumida, con los `pc` del bytecode.
  - **Orden de lectura** (el del juego, alfabético dentro de cada carpeta):
    1. `media/lua/server/Items/Distribution_*.lua` ordenados (definen `ClutterTables` y `BagsAndContainers`, que usa `Distributions.lua`);
    2. `Distributions.lua`: la tabla es el local `distributionTable`;
    3. `ProceduralDistributions.lua`: `env["ProceduralDistributions"]["list"]`;
    4. `media/lua/server/Vehicles/VehicleDistribution_*.lua` y después `VehicleDistributions.lua`: `env["VehicleDistributions"]`;
    5. de `SuburbsDistributions.lua`, `NoContainerFillRooms` con `run_lua` y los alias con la regex `^\s*SuburbsDistributions\.(\w+)\s*=\s*SuburbsDistributions\.(\w+)` sobre el cuerpo de `mergeDistributions` (las líneas están adentro de una `function`, que `run_lua` saltea a propósito).
  - **Alias:** se aplican en el orden del archivo: `dist[X] = dist[Y]`, y si `Y` no existe, `X` queda sin tabla.
  - **Clasificación de las claves de primer nivel:**
    - con `rolls` o `items` → `bags`;
    - con `roomTypes` → afuera (las 5 de historia);
    - `all` → `general`, `zombie` y `outfits`;
    - si no, con mayúscula inicial → `stashes`; y el resto → `rooms`.
  - **`NO_GENERIC`:** la lista de 41 de la tabla de arriba, como `frozenset` en el código, con el comentario de dónde sale (`ItemPickerJava.initNoGenericLootContainers`, constantes de `ContainerType`). Un test compara la lista con el bytecode leyendo los `getstatic ContainerType.X` de ese método con `extract._jar_class` y `extract._instructions`, y pasando cada `X` por la tabla de `ldc` de `ContainerType.<clinit>`. Si un parche agrega uno, falla.
  - `table_for` implementa la regla 1. Si al leer el bytecode a mano (`fillContainerInternal` pc 446–718) la caída final no es `all.<mueble>`, manda el bytecode: se corrige la regla y el test `test_reglas_de_la_tabla`, y se anota en el informe.
  - **Corta antes de escribir** (`SystemExit` con mensaje y código ≠ 0) si:
    - falta un archivo;
    - `run_lua` levanta `LuaError`;
    - hay menos de 300 cuartos, 1.000 listas procedurales, 50 grupos de vehículo o 100 atuendos;
    - una lista nombrada falta y no es una de las 4 conocidas (las 4 van a `missing_lists` y se avisan por stderr sin cortar).
  - `--check`: imprime las cifras de "Lo que hay en el juego".
- [ ] **Step 5: Correr los tests y verlos en verde.** `python -m unittest discover -s games/zomboid/tools/tests -v` → todos OK. `python games/zomboid/tools/loot.py --check` imprime el inventario; anotar las cifras en el informe.
- [ ] **Step 6: Commit.**
  ```bash
  git add games/zomboid/tools/luatable.py games/zomboid/tools/loot.py games/zomboid/tools/tests/test_loot.py
  git commit -m "feat(zomboid): loot.py lee las tablas de botín del juego y calcula la chance de cada objeto como ItemPickerJava"
  ```

---

### Task 2: Los archivos de botín para el sitio, con sus nombres

**Files:**
- Create: `games/zomboid/tools/loot_names.py`, `games/zomboid/data/loot/**` (generado), `site/test/zomboidLootData.test.ts`
- Modify: `games/zomboid/tools/loot.py` (`build()`, `write()`, `main()`), `games/zomboid/tools/site.py` (`fnv1a32`, `shard(slug, n=SHARDS)`), `games/zomboid/tools/tests/test_loot.py`, `site/src/zomboid/shard.ts`, `site/src/zomboid/store.ts`, `games/zomboid/README.md`

**Interfaces:**
- Consumes: `loot.Loot`, `container_chances`, `table_chances`, `resolve_item` (Task 1); `data/items.json`, `data/index.json`, `data/meta.json`, `data/map/buildings.json` y `data/map/web/common.json` (`places`).
- Produces:
  - **`site.py`:** `fnv1a32(s: str) -> int` y `shard(slug: str, n: int = SHARDS) -> str` (dos dígitos). `loot.py` lo carga por ruta (`importlib.util.spec_from_file_location("zomboid_site", …)`, como `extract.py`: `import site` daría el de la biblioteca estándar).
  - **`shard.ts`:** `export function pzHash(s: string): number`, `export function pzShardOf(key: string, n: number): string` y `pzShard(slug) = pzShardOf(slug, PZ_SHARDS)`. Además, `export const PZ_LOOT_ROOM_SHARDS = 32`.
  - **`store.ts`:** `shardedFichas<T>(files, shardOf: (key: string) => string = pzShard)`.
  - **`games/zomboid/data/loot/items/<NN>.json`** (`NN = shard(slug)`, los 100 siempre, aunque alguno quede vacío): `{ "<slug>": ItemLoot }`, sólo para las fichas que aparecen en algún lado.
    ```ts
    type Force = string;                 // "z:Rich" | "t" | "r" | "i"
    type LootRow = [key: string, cont: string, p: number, force?: Force];
    interface ItemLoot {
      rooms: LootRow[];      // hasta 10, por habitación su mejor mueble; "_all" = en cualquier lugar sin tabla propia
      nRooms: number;        // en cuántas habitaciones aparece en total (con "_all")
      stash?: LootRow[];     // escondites y refugios (clave de `stashes`), hasta 5
      zombie?: { m: number; f: number; outfits: [outfit: string, p: number][]; nOutfits: number };  // outfits: hasta 8
      vehicles?: [group: string, part: string, p: number][];  // hasta 5, uno por grupo (su mejor parte)
      nVehicles?: number;
      bags?: [bag: { id: string; en: string; es: string; icon: string | null }, p: number][];  // hasta 5
    }
    ```
    - **Variantes:** una ficha junta varios ids del juego (`bowl` son 2): por lugar se toma la mayor chance entre sus ids.
    - **Habitaciones:** se toman las de `Loot.rooms`. En cada una, por mueble definido en su tabla (`other` incluido), se calcula `container_chances` sumando la tabla `all` del cuarto si la tiene. Las filas sin fuerza le ganan a las forzadas. Por habitación queda el mueble con la mayor chance, y se ordena por `p` (de mayor a menor) y después por clave.
    - **`_all`:** los muebles de `Loot.general`, como una habitación más.
    - **`zombie`:**
      - `m` y `f` son las chances de `inventorymale` e `inventoryfemale` (0 si no está);
      - cada atuendo con chance propia > 0 va con `1 − (1 − P_atuendo) × (1 − max(m, f))` si su tabla tiene `defaultInventoryLoot` (o no lo trae), y con `P_atuendo` si lo trae en `false`;
      - `max` porque la ficha no sabe si el zombi es hombre o mujer.
    - **`vehicles`:** por grupo, la parte con la mayor chance.
    - **`bags`:** por tabla de `Loot.bags`, el objeto-contenedor como `Ref` (sin ficha, no va).
    - `p` se redondea a 5 decimales, y lo que redondea a 0 no va.
  - **`games/zomboid/data/loot/rooms/<NN>.json`** (`NN = shard(clave, 32)`; los 32 siempre):
    ```ts
    interface RoomLootShard {
      items: Record<string, [en: string, es: string, icon: string | null]>;   // las fichas que nombra este archivo
      conts: Record<string, [en: string, es: string]>;                        // los muebles que nombra este archivo
      rooms: Record<string, { t: string; n: number; top: [slug: string, cont: string, p: number, force?: string][] }>;
    }
    ```
    - La clave de `rooms` es el **nombre de habitación del mapa tal cual** (`common.rooms` de `map.py`: `garage`, `bedroom4`, `Bathroom`).
    - Sólo van las que tienen tabla propia (exacta o por alias: 378 en la 42.21), y además la clave `"_all"` con lo de `Loot.general`.
    - `t` es la clave de la tabla (`mechanic` para `garage`) y `n`, cuántas fichas distintas pueden salir.
    - `top` trae hasta 30, por ficha su mejor mueble, ordenadas por `p` y después por slug.
  - **`games/zomboid/data/loot/common.json`:**
    ```ts
    interface LootCommon {
      containers: Record<string, Loc>; parts: Record<string, Loc>; vehicles: Record<string, Loc>;
      outfits: Record<string, Loc>; stashes: Record<string, Loc>; zones: Record<string, Loc>;
      aliases: Record<string, string[]>;      // clave de tabla → otros nombres de habitación que la usan ("mechanic": ["garage"])
      spots: Record<string, { n: number; at?: [building: string, x: number, y: number] }>;
    }
    ```
    - `spots` tiene una entrada por cada tabla de `Loot.rooms` (con `n = 0` y sin `at` si no hay ninguna en el mapa). `spots[clave]`:
      - `n` es cuántas habitaciones del mapa usan esa tabla (de `data/map/buildings.json`, contando cada habitación de cada piso);
      - `at` es el edificio de ejemplo: el que tiene una de esas habitaciones con el centro de su caja más cerca de Muldraugh (el `places` de `common.json` con `name == "Muldraugh"`: 10669, 9735); ante un empate, el id menor;
      - `x` e `y` son el centro de la caja del edificio, redondeados.
  - **`games/zomboid/data/loot/meta.json`:** `{ version, extractedAt, dataHash, ref: REF, counts: {…las de --check}, unknown: [nombres que no existen] }`. `extractedAt` se mueve sólo si cambia `dataHash`.
  - **`loot_names.py`** exporta `CONTAINERS`, `PARTS`, `VEHICLES`, `OUTFITS`, `STASHES` y `ZONES` (`dict[str, tuple[str, str]]`, en/es) y `name(table, key, fallback_en) -> tuple[str, str]`.
    - Lo que falta en la tabla va con el nombre del juego separado en palabras, igual en los dos idiomas, y con un aviso por stderr.
    - Un mueble que es un objeto (`Bag_DuffelBagTINT` puesto como mueble en 4 cuartos) toma el nombre de su ficha.

**Nombres de muebles.** Los del juego (`IGUI_ContainerTitle_*` en `Translate/EN`, `ES_MX` y `ES`, archivo `IG_UI.json`) no sirven tal cual. Son ambiguos: `counter`, `overhead` y `cupboard` son "Armario"; `sidetable`, `dresser` y `officedrawers`, "Cajón"; `wardrobe` y `dishescabinet`, "Armario". Y son mexicanos o de España: "Elote", "Refrigerador", "Nevera". Por eso van a mano, en rioplatense, como los cuartos de `rooms.ts`. La tabla completa para `CONTAINERS` (cubre los 72 de los cuartos y los de `all`):

| clave | en | es |
|---|---|---|
| `other` | Other furniture | Otros muebles |
| `counter` | Counter | Mesada |
| `overhead` | Overhead cupboard | Alacena |
| `cupboard` | Cupboard | Aparador |
| `shelves` | Shelves | Estante |
| `metal_shelves` | Metal shelves | Estantería de metal |
| `fridge` | Fridge | Heladera |
| `freezer` | Freezer | Freezer |
| `locker` | Locker | Casillero |
| `militarylocker` | Military locker | Casillero militar |
| `desk` | Desk | Escritorio |
| `schooldesk` | School desk | Pupitre |
| `clothingrack` | Clothing rack | Perchero |
| `restaurantdisplay` | Restaurant display | Exhibidor del restaurante |
| `sidetable` | Side table | Mesa de luz |
| `stove` | Oven | Horno |
| `woodstove` | Wood stove | Salamandra |
| `displaycase` | Display case | Vitrina |
| `displaycasebakery` | Bakery display case | Vitrina de panadería |
| `displaycasebutcher` | Butcher display case | Vitrina de carnicería |
| `dresser` | Dresser | Cómoda |
| `wardrobe` | Wardrobe | Ropero |
| `filingcabinet` | Filing cabinet | Archivero |
| `officedrawers` | Office drawers | Cajonera de oficina |
| `toolcabinet` | Tool cabinet | Armario de herramientas |
| `shelvesmag` | Magazine stand | Revistero |
| `bin` | Trash can | Tacho de basura |
| `dumpster` | Dumpster | Contenedor de basura |
| `crate` | Crate | Cajón |
| `militarycrate` | Military crate | Cajón militar |
| `smallbox` | Small box | Caja chica |
| `cardboardbox` | Cardboard box | Caja de cartón |
| `clothingdryerbasic` | Laundry cart | Carrito de lavandería |
| `clothingdryer` | Clothes dryer | Secarropas |
| `clothingwasher` | Washing machine | Lavarropas |
| `grocerstand` | Produce stand | Exhibidor de verdulería |
| `medicine` | Medicine cabinet | Botiquín |
| `microwave` | Microwave | Microondas |
| `fireplace` | Fireplace | Chimenea |
| `dishescabinet` | China cabinet | Mueble de vajilla |
| `dishwasher` | Dishwasher | Lavavajillas |
| `plankstash` | Floorboard stash | Escondite bajo el piso |
| `barbecue` | Barbecue | Parrilla |
| `barbecuepropane` | Gas barbecue | Parrilla a gas |
| `doghouse` | Doghouse | Cucha |
| `tent` | Tent | Carpa |
| `shelter` | Shelter | Refugio |
| `SurvivorCrate` | Survivor crate | Cajón de sobreviviente |
| `GunBox` | Ammo crate | Cajón de munición |
| `ShotgunBox` | Floorboard stash | Escondite bajo el piso |
| `MedicalBox` | Floorboard stash | Escondite bajo el piso |
| `BombBox` | Explosives box | Caja de explosivos |
| `BoozeBox` | Booze box | Caja de bebidas |
| `FoodBox` | Food box | Caja de comida |
| `ToolsBox` | Tool box | Caja de herramientas |
| `safe` | Safe | Caja fuerte |
| `campfire` | Campfire | Fogata |
| `brazier` | Brazier | Brasero |
| `cashregister` | Cash register | Caja registradora |
| `coffin` | Coffin | Ataúd |
| `composter` | Composter | Compostera |
| `logs` | Log pile | Pila de troncos |
| `newspaper_dispatch`, `newspaper_herald`, `newspaper_knews`, `newspaper_times` | Newspaper box | Expendedor de diarios |
| `postbox` | Mailbox | Buzón |
| `trough` | Trough | Bebedero |
| `vendingpop` | Soda machine | Máquina de gaseosas |
| `vendingsnack` | Snack machine | Máquina de golosinas |

`PARTS`:

| clave | en | es |
|---|---|---|
| `GloveBox` | Glove box | Guantera |
| `TruckBed` | Trunk | Baúl |
| `TruckBedOpen` | Truck bed | Caja de carga |
| `TrailerTrunk` | Trailer | Acoplado |
| `SeatFrontLeft` | Driver's seat | Asiento del conductor |
| `SeatFrontRight` | Front passenger seat | Asiento del acompañante |
| `SeatRearLeft` | Rear left seat | Asiento trasero izquierdo |
| `SeatRearRight` | Rear right seat | Asiento trasero derecho |
| `SeatMiddleLeft` | Middle left seat | Asiento del medio izquierdo |
| `SeatMiddleRight` | Middle right seat | Asiento del medio derecho |

`STASHES` (los 15):

| clave | en | es |
|---|---|---|
| `BombCache1` | Explosives stash | Escondite de explosivos |
| `BoozeCache1` | Booze stash | Escondite de bebidas |
| `FoodCache1` | Food stash | Escondite de comida |
| `GunCache1`, `GunCache2` | Gun stash | Escondite de armas |
| `MedicalCache1` | Medical stash | Escondite médico |
| `ShotgunCache1`, `ShotgunCache2` | Shotgun stash | Escondite de escopetas |
| `SurvivorCache1`, `SurvivorCache2` | Survivor stash | Escondite de sobreviviente |
| `SurvivorCacheBigBuilding` | Survivor stash (large building) | Escondite de sobreviviente (edificio grande) |
| `ToolsCache1` | Tool stash | Escondite de herramientas |
| `SafehouseLoot` | Survivor safehouse | Refugio de sobreviviente |
| `SafehouseLoot_Mid` | Survivor safehouse (mid-game) | Refugio de sobreviviente (a mitad de partida) |
| `SafehouseLoot_Late` | Survivor safehouse (late game) | Refugio de sobreviviente (avanzada la partida) |

`ZONES` (la frase entera, porque va sola en la fila):

| clave | en | es |
|---|---|---|
| `Rich` | only in rich neighborhoods | sólo en barrios ricos |
| `Poor` | only in poor neighborhoods | sólo en barrios pobres |
| `TrailerPark` | only in trailer parks | sólo en parques de casas rodantes |
| `University` | only at the university | sólo en la universidad |
| `Cultists` | only at the cult's compound | sólo en el complejo de la secta |

`VEHICLES` (82) y `OUTFITS` (125) los escribe quien implementa, con estas reglas y estos fijos:

- **Vehículos:**
  - `NormalStandard` Regular car / Auto común;
  - `NormalHeavy` Truck or van / Camioneta o furgón;
  - `NormalLuxury` Luxury car / Auto de lujo;
  - `NormalSports` Sports car / Auto deportivo;
  - `Police` Police car / Patrullero;
  - `PoliceSheriff` Sheriff's car / Patrullero del sheriff;
  - `PoliceState` State police car / Patrullero de la policía estatal;
  - `PoliceDetective` Unmarked police car / Auto de detective;
  - `PoliceSWAT` SWAT truck / Camión de los SWAT;
  - `Ambulance` Ambulance / Ambulancia;
  - `Fire` Fire truck / Autobomba;
  - `Taxi` Taxi / Taxi;
  - `Postal` Mail truck / Camioneta del correo;
  - `ArmyLight` / `ArmyHeavy` Army vehicle (light/heavy) / Vehículo del ejército (liviano/pesado);
  - `StepVan_<Marca>` → "Step van (<Marca>)" / "Furgón (<Marca>)", con la marca separada en palabras e igual en los dos idiomas;
  - `Van_<X>` → "Van (<X>)" / "Camioneta (<X>)";
  - un oficio (`Carpenter`, `Electrician`, `Plumber`…) → "<Oficio>'s vehicle" / "Vehículo de <oficio>", con el oficio en minúscula y el nombre de la profesión del juego cuando existe en `data/site/professions.json`.
- **Atuendos:**
  - `Police` Police officer / Policía;
  - `PoliceState` State trooper / Policía estatal;
  - `FiremanFullSuit` Firefighter / Bombero;
  - `Doctor` Doctor / Médico;
  - `Nurse` Nurse / Enfermero;
  - `Inmate` Inmate / Preso;
  - `PrisonGuard` Prison guard / Guardiacárcel;
  - `ArmyCamoGreen` Soldier (green camo) / Soldado (camuflaje verde);
  - `Bandit` Bandit / Bandido;
  - los sufijos `_Early`, `_Mid` y `_Late` agregan " (early)" / " (al principio)", " (mid-game)" / " (a mitad de partida)" y " (late game)" / " (avanzada la partida)";
  - el número del final no se nombra (`Survivalist02` y `Survivalist` se llaman igual: "Survivalist" / "Supervivencialista");
  - los nombres propios van iguales en los dos idiomas: `Bob`, `Kate`, `Joan`, `John`, `Duke`, `Dean`, `Nolan`, `Groucho`, `Jackie_Jaye` → "Jackie Jaye", `Rev_Peter_Watts` → "Rev. Peter Watts", `Kirsty_Kormick` → "Kirsty Kormick", `Frank_Hemingway` → "Frank Hemingway", `Sir_Twiggy` → "Sir Twiggy";
  - `Judge_Matt_Hass` Judge Matt Hass / Juez Matt Hass;
  - `Mayor_West_point` Mayor of West Point / Intendente de West Point.

- [ ] **Step 1: Tests que fallan.**
  - **Python** (`test_loot.py`, clase `SitioTest`, con el juego):
    - `build()` devuelve las 100 claves `items/NN.json` y las 32 `rooms/NN.json`, más `common.json` y `meta.json`;
    - `items/<shard("canned-beans")>.json["canned-beans"]["rooms"]` tiene `["kitchen", "metal_shelves", 0.038808]`;
    - `badge` trae `zombie.outfits` con `["Police", 0.5]`;
    - `megaphone` (el `Bullhorn`) trae primero `["PoliceSWAT", "TruckBed", 0.5904]` en `vehicles` (4 tiradas con peso 20: 1 − 0,8⁴), y el `["Police", 0.5]` de `badge` va sexto en `zombie.outfits`, detrás de cinco atuendos con 1 (`AirportSecurityTarmac`, `Agent`, `BountyHunter`, `Detective`, `Ranger`): por eso el tope es 8;
    - `pen-black` trae `zombie.m == zombie.f == 0.01`;
    - `rooms/<shard("garage", 32)>.json["rooms"]["garage"]["t"] == "mechanic"`;
    - `"bedroom4"` no está en ningún archivo de habitaciones;
    - `"_all"` sí;
    - `common.json` tiene nombre en/es no vacío para cada mueble, parte, grupo, atuendo, escondite y zona que nombran los archivos (y el test lista los que faltan);
    - `spots["kitchen"]["n"] > 1000` y su `at` es un edificio de `buildings.json`.
  - **Vitest** (`site/test/zomboidLootData.test.ts`, con `import.meta.glob("../../games/zomboid/data/loot/**/*.json", { eager: true })`):
    - cada clave de `loot/items/NN.json` está en el archivo que dice `pzShard` y existe en `items-list.json`;
    - cada clave de `loot/rooms/NN.json` está en el que dice `pzShardOf(clave, 32)`;
    - todo slug de `top` y todo `bags[i][0].id` está en `items-list.json`, y todo slug de `top` está en el `items` de su archivo;
    - toda clave `t`, `rooms[i][0]` y `stash[i][0]` existe en `common.spots` o en `common.stashes` (salvo `_all`);
    - **pesos:** cada `loot/items/NN.json` pesa ≤ 40 KB crudos; cada `loot/rooms/NN.json`, ≤ 60 KB; `common.json`, ≤ 60 KB; y el total de `loot/` comprimido, ≤ 400 KB (anotar las cifras reales en el informe y bajar los topes si sobra mucho);
    - `pzShardOf("crowbar", 100) === pzShard("crowbar")`, y `pzShardOf` da lo mismo que `site.shard` para 5 claves fijas (`kitchen`, `garage`, `_all`, `Bathroom`, `bedroom4`), con los valores escritos en el test a partir de `python -c "…shard(k, 32)…"`.
- [ ] **Step 2:** Verlos fallar (`python -m unittest discover -s games/zomboid/tools/tests -v`; `npx vitest run test/zomboidLootData.test.ts` desde `site/`).
- [ ] **Step 3: Implementar.**
  - `site.py`: `fnv1a32` y `shard(slug, n)`. El test de `zomboidSiteData.test.ts` tiene que seguir en verde.
  - `loot.py`: `build()`, `write()` (el de `site.py`: escribe sólo lo que cambió, borra lo que sobra en `data/loot/` y devuelve los tamaños) y `main()`, que imprime los tamaños como `site.py` y los avisos (los nombres sin traducir, los objetos que no existen, las listas que faltan).
  - `loot_names.py`, `shard.ts` y `store.ts`.
  - README: una sección "Botín (`loot.py`)" en "Qué escribe", la línea en "En cada parche" (después de `map.py`), "Cuándo corta" y la decisión de "Normal", con el resumen de "La cuenta". Se borra la línea "El botín (Distributions) todavía no se extrae."
  - Correr `python games/zomboid/tools/loot.py`.
- [ ] **Step 4:** Tests en verde (Python y `npx vitest run test/zomboidLootData.test.ts test/zomboidSiteData.test.ts`). Correr `python games/zomboid/tools/loot.py` otra vez: `git status --short games/zomboid/data/loot` no muestra cambios (determinismo).
- [ ] **Step 5: Commit.**
  ```bash
  git add games/zomboid/tools/loot.py games/zomboid/tools/loot_names.py games/zomboid/tools/site.py games/zomboid/tools/tests/test_loot.py games/zomboid/data/loot site/src/zomboid/shard.ts site/src/zomboid/store.ts site/test/zomboidLootData.test.ts games/zomboid/README.md
  git commit -m "feat(zomboid): los datos de botín para el sitio, por objeto y por habitación del mapa, con sus nombres en/es"
  ```

---

### Task 3: "Dónde aparece" en la ficha de Objetos

Objetos ya está publicada: esto se ve en `http://localhost:5178/es/project-zomboid/objetos/<ficha>` apenas anda.

**Files:**
- Create: `site/src/zomboid/loot/data.ts`, `site/src/zomboid/loot/chance.ts`, `site/src/zomboid/items/WhereFound.tsx`, `site/test/zomboidWhereFound.test.ts`
- Modify: `site/src/zomboid/items/ItemFicha.tsx`, `site/src/zomboid/items/data.ts` (`preloadItemsRoute`), `site/src/zomboidCopy.ts` (`PzItemsCopy.where`), `site/src/styles/zomboid-items.css`

**Interfaces:**
- Consumes: `data/loot/items/NN.json` y `common.json` (Task 2); `shardedFichas(files, shardOf)` y `once` (`store.ts`); `roomName(raw, lang)` de `site/src/zomboid/map/rooms.ts`; `Collapse`, `Stamp` e `ItemIcon` de `../ui`; `routePath` de `../../route`.
- Produces:
  - **`loot/data.ts`:**
    - los tipos `LootRow`, `ItemLoot` y `LootCommon` de la Task 2, más `type Loc`;
    - `loadItemLoot(slug): Promise<ItemLoot | null>` y `peekItemLoot(slug): ItemLoot | null | undefined`, con `shardedFichas(import.meta.glob("@zomboid/loot/items/*.json"))`;
    - `loadLootCommon(): Promise<LootCommon>` y `peekLootCommon(): LootCommon | null`, con `once(() => import("@zomboid/loot/common.json"))`;
    - `mapLink(route: Route, at: [string, number, number]): string`, que devuelve `routePath({ ...route, view: "zomboid", pzSection: "map", detail: undefined }) + "?x=" + x + "&y=" + y + "&z=5&edificio=" + id` (como arma sus rutas el resto de la sección: la ruta de la página con otra pestaña);
    - `stashesLink(route: Route): string`, el mismo camino con `"?capas=escondites"`.
  - **`loot/chance.ts`:**
    ```ts
    export type Band = "veryCommon" | "common" | "uncommon" | "rare" | "veryRare";
    export function band(p: number): Band {
      return p >= 0.25 ? "veryCommon" : p >= 0.1 ? "common" : p >= 0.03 ? "uncommon" : p >= 0.005 ? "rare" : "veryRare";
    }
    /** "3,9 %", "34 %", "< 0,1 %": un decimal debajo del 10 %, ninguno arriba. */
    export function pct(p: number, locale: string): string {
      if (p > 0 && p < 0.001) return `< ${new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(0.001)}`;
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: p < 0.1 ? 1 : 0 }).format(p);
    }
    ```
  - **`items/data.ts`:** `preloadItemsRoute(route)` espera, si la ficha existe, también `loadItemLoot(route.detail)` y `loadLootCommon()`, con `Promise.all`. Así el prerender y `TAB_DATA.items` (la precarga al pasar el mouse) traen la hoja entera.
  - **`WhereFound.tsx`:** `export default function WhereFound({ slug, route, navigate }: { slug: string; route: Route; navigate: (r: Route) => void })`.
    - Lee `peekItemLoot(slug)` y `peekLootCommon()`. Si alguno falta (una navegación que no pasó por la precarga), los pide en un `useEffect` y se vuelve a dibujar; mientras tanto no dibuja nada (ni "cargando").
    - Con `null` (no aparece en ningún lado), no dibuja nada.
- **Copia** (`PzItemsCopy.where`, en/es):

  | clave | en | es |
  |---|---|---|
  | `title` | Where to find it | Dónde aparece |
  | `note` | Chance that one piece of furniture has at least one, with loot set to Normal. Your game's loot settings raise or lower it, but the best places stay the same. | Chance de que un mueble traiga al menos uno, con el botín en Normal. La configuración de botín de tu partida la sube o la baja, pero los mejores lugares siguen siendo los mismos. |
  | `rooms` | In rooms | En habitaciones |
  | `anywhere` | Anywhere without its own loot | En cualquier lugar sin botín propio |
  | `alsoAs` (nombres) | `also: ${n}` | `también: ${n}` |
  | `onMap` (n) | `${n} on the map` | `${n} en el mapa` |
  | `seeOne` | see one on the map | ver una en el mapa |
  | `stashes` | In stashes | En escondites |
  | `seeStashes` | see the stashes on the map | ver los escondites en el mapa |
  | `zombies` | On zombies | En zombis |
  | `anyZombie` | Any zombie | Cualquier zombi |
  | `maleZombie` | Male zombie | Zombi hombre |
  | `femaleZombie` | Female zombie | Zombi mujer |
  | `outfit` (nombre) | `Zombie: ${name}` | `Zombi: ${name}` |
  | `moreOutfits` (n) | `and ${n} more outfits` | `y ${n} atuendos más` |
  | `vehicles` | In vehicles | En vehículos |
  | `moreVehicles` (n) | `and ${n} more vehicles` | `y ${n} vehículos más` |
  | `bags` | Inside bags and boxes | Dentro de bolsos y cajas |
  | `moreRooms` (n) | `and ${n} more places` | `y ${n} lugares más` |
  | `bands` | very common / common / uncommon / rare / very rare | muy común / común / poco común / raro / muy raro |
  | `force.t` | only in some furniture | sólo en algunos muebles |
  | `force.r` | only if the building has a certain room | sólo si el edificio tiene cierto cuarto |
  | `force.i` | only next to certain objects | sólo junto a ciertos objetos |

  La fuerza `z:<zona>` usa `common.zones[zona]`.
- **La hoja** (en `ItemFicha.tsx` va primera en `.pzi-relcol`, antes de "Se fabrica con": se lee qué es, de dónde sale y para qué sirve):
  - una `section.pz-page.pzi-rel.pzi-where` con `Stamp name="house"`, el título y `<small>` con `nRooms`;
  - la nota en `.pzi-hand`;
  - **Habitaciones:** una `<ul>` (con `Collapse`, `shown={5}`), una fila por `rooms[i]`:
    - el nombre: `roomName(key, lang)`, o `where.anywhere` para `_all`;
    - si `common.aliases[key]` existe, `where.alsoAs(los nombres de esas habitaciones con roomName, unidos con ", ")`;
    - en `.pzi-meta`: el mueble (`common.containers[cont][lang]`), `pct(p)`, la banda, la fuerza si hay, y `where.onMap(n)` si `spots[key].n > 0`;
    - el enlace `where.seeOne` a `mapLink(route, spots[key].at)` si hay `at`. Es un `<a href>` común, no `RouteLink`: el Mapa lee la query al cargar.
    - Si `nRooms > rooms.length`, al final va `where.moreRooms(nRooms - rooms.length)` como texto.
  - **Escondites:** las filas de `stash` con `common.stashes[key]`, y un enlace `where.seeStashes` a `stashesLink(route)`.
  - **Zombis:**
    - si `m === f`, una fila `anyZombie` con `pct(m)`; si no, dos (`maleZombie` y `femaleZombie`), sin las que son 0;
    - después, una fila por atuendo (`where.outfit(common.outfits[o][lang])`); dos atuendos con el mismo nombre en el idioma de la página se muestran una vez, con la mayor chance;
    - `moreOutfits` si `nOutfits > outfits.length`.
  - **Vehículos:** "Patrullero · Baúl" con `pct` y banda, y `moreVehicles`.
  - **Bolsos:** `RouteLink` a la ficha del bolso, con `ItemIcon`, y `pct`.
  - **Orden de las subsecciones:** habitaciones, escondites, zombis, vehículos, bolsos. Cada una con un `h3.pzi-h3` y sólo si tiene filas.
  - **Estilo:** las filas son `li` con el nombre arriba y `.pzi-meta` abajo, que bajan de renglón en el celular. La banda va como texto (`.pzi-band`, con un tinte de fondo suave por banda, sin borde). Nada de tablas.

- [ ] **Step 1: Tests que fallan** (`site/test/zomboidWhereFound.test.ts`). Se renderiza `ZomboidItems` con `LangContext`, con `items` y `recipes` dados por publicados como en `zomboidItems.test.ts`, después de `await preloadItemsRoute(parseRoute(…))`.
  - `/es/project-zomboid/objetos/frijoles-enlatados` (`canned-beans`; el slug en español lo da `virtual:pz-slugs-es/items`, y si no es ése, se usa el real) tiene:
    - "Dónde aparece", "Cocina" y "Estantería de metal";
    - `/3,9\s*%/` y "poco común";
    - un `<a href="/es/project-zomboid/mapa?x=…&y=…&z=5&edificio=…">` con "ver una en el mapa";
    - "En escondites" (aparece en `FoodCache1`) con el enlace `?capas=escondites`.
  - `/en/project-zomboid/items/canned-beans` tiene "Where to find it", "Kitchen" y "Metal shelves".
  - `/es/project-zomboid/objetos/insignia` (`badge`) tiene "Zombi: Policía" y `/50\s*%/`.
  - `/es/project-zomboid/objetos/megafono` (`megaphone`) tiene "Camión de los SWAT · Baúl" y `/59\s*%/`.
  - `/es/project-zomboid/objetos/pluma-negra` (`pen-black`) tiene "Cualquier zombi" y no tiene "Zombi hombre".
  - Una ficha que no aparece en ningún lado (la primera fila de `items-list.json` sin clave en `loot/items`, buscada en el test) no tiene "Dónde aparece".
  - Ningún HTML de los de arriba dice "cargando".
  - `chance.ts`: `band(0.0392) === "uncommon"`, `band(0.3439) === "veryCommon"`, `band(0.0007) === "veryRare"`; `pct(0.0392, "es-AR")` cumple `/^3,9\s%$/`; `pct(0.3439, "en-US") === "34%"`; `pct(0.0004, "es-AR")` empieza con "< 0,1".
- [ ] **Step 2:** Verlos fallar (`npx vitest run test/zomboidWhereFound.test.ts`).
- [ ] **Step 3:** Implementar. `npx tsc -b`, `npx vitest run test/zomboidWhereFound.test.ts test/zomboidItems.test.ts test/zomboidColdLoadItems.test.ts test/zomboidPublish.test.ts`.
- [ ] **Step 4: Revisión en el navegador** (`http://localhost:5178`, panel Browser; no redimensionar el Chrome de ZoTaD):
  - `/es/project-zomboid/objetos/palanca`, `frijoles-enlatados` e `insignia`;
  - el enlace "ver una en el mapa" abre el Mapa con la hoja del edificio de ejemplo;
  - en celular (`resize_window` mobile del panel), sin scroll horizontal y sin palabras cortadas;
  - la consola sin errores.
- [ ] **Step 5: Commit.**
  ```bash
  git add site/src/zomboid/loot/data.ts site/src/zomboid/loot/chance.ts site/src/zomboid/items/WhereFound.tsx site/src/zomboid/items/ItemFicha.tsx site/src/zomboid/items/data.ts site/src/zomboidCopy.ts site/src/styles/zomboid-items.css site/test/zomboidWhereFound.test.ts
  git commit -m "feat(zomboid): la ficha de cada objeto dice dónde aparece, con la chance por mueble y el link al mapa"
  ```

---

### Task 4: "Qué hay" por habitación en la hoja del edificio del Mapa

El Mapa ya está publicado: se ve en `http://localhost:5178/es/project-zomboid/mapa` apenas anda.

**Files:**
- Create: `site/src/zomboid/loot/roomLoot.ts`, `site/src/zomboid/map/RoomLoot.tsx`, `site/src/zomboid/map/itemSlugs.ts`, `site/test/zomboidRoomLoot.test.ts`
- Modify: `site/src/zomboid/map/BuildingSheet.tsx` (props `route` y `navigate`), `site/src/zomboid/map/ZomboidMap.tsx` (se los pasa, como a `StashCard`), `site/src/zomboid/map/StashCard.tsx` (usa `itemSlugs.ts`), `site/src/zomboid/map/rooms.ts` (`RoomGroup.raws`), `site/src/zomboid/map/copy.ts` (`building.loot`), `site/src/styles/zomboid-map.css`, `site/test/zomboidRooms.test.ts`

**Interfaces:**
- Consumes: `data/loot/rooms/NN.json` (Task 2); `pzShardOf` y `PZ_LOOT_ROOM_SHARDS` (`shard.ts`); `shardedFichas(files, shardOf)`; `pct` y `band` (`loot/chance.ts`, Task 3); `ItemIcon` y `Collapse` (`../ui`); `RouteLink`.
- Produces:
  - **`rooms.ts`:** `RoomGroup` suma `raws: string[]`, los nombres del juego distintos de las habitaciones del grupo, en el orden en que aparecen (`floorRooms` los junta; "Dormitorio ×3" puede ser `["bedroom", "bedroom4"]`).
  - **`loot/roomLoot.ts`:** sólo lo importa la hoja del edificio, así sus 32 cargadores viajan en ese chunk.
    - `loadRoomLoot(raws: string[]): Promise<void>`: pide los archivos de esos nombres más el de `"_all"`, una vez cada uno, y con un fallo vuelve a pedir en la próxima llamada.
    - `roomLootFor(raws: string[]): RoomLootView | null | undefined`: `undefined` si falta algún archivo.
      ```ts
      interface RoomLootView {
        own: boolean;   // false: ningún nombre tiene tabla y se muestra lo de "_all"
        n: number;      // la mayor `n` entre los nombres con tabla, o la de "_all"
        top: { id: string; en: string; es: string; icon: string | null; cont: [string, string]; p: number; force?: string }[];
      }
      ```
      - `top` junta las de los `raws` con tabla (por ficha, la mayor `p`), ordenadas por `p` y después por slug, hasta 30.
  - **`map/itemSlugs.ts`:** `export const loadItemSlugsEs: () => Promise<void>`, el `loadSlugsEs` que hoy vive adentro de `StashCard.tsx` (pide `virtual:pz-slugs-es/items` una vez y lo registra con `registerPzSlugs`; con un fallo, vuelve a pedir), movido para que lo usen `StashCard` y `RoomLoot` sin repetirlo. Sigue siendo un `import()` aparte: los slugs no entran al chunk de la hoja.
  - **`RoomLoot.tsx`:** `export default function RoomLoot({ raws, route, navigate }: { raws: string[]; route: Route; navigate: (r: Route) => void })`.
    - Llama a `roomLootFor(raws)`; con `undefined` muestra `t.building.loot.loading`; si no, la lista. En español, como `StashCard`, espera `loadItemSlugsEs()` y se vuelve a dibujar.
    - **Fila:** `RouteLink` a `{ ...route, view: "zomboid", pzSection: "items", detail: slug }` con `ItemIcon size={24}` y el nombre; en `.pzm-loot-meta`, el mueble y `pct`, y la fuerza (`force.t` / `force.r` / `force.i` del mapa; la de zona, como "sólo en ciertas zonas" / "only in certain areas", porque `common.json` no viaja con el mapa).
    - Con `Collapse shown={8}` y `more` de la copia del mapa.
    - Con `own: false`, arriba va la nota `t.building.loot.generic`.
  - **`BuildingSheet.tsx`:**
    - al montarse y al cambiar de edificio o de piso, `loadRoomLoot` de los `raws` del piso que se ve;
    - cada fila de habitación suma, al final de la primera celda, un `button.pzm-loot-toggle` con `t.building.loot.show` / `hide` y `aria-expanded` / `aria-controls`;
    - abierto, sigue una fila `tr.pzm-loot-row` con una `td colSpan={2}` que tiene `<RoomLoot>`. Se abre una por vez: abrir otra cierra la anterior. Cambiar de piso o de edificio cierra todo;
    - pasar el mouse por la fila del botín sigue marcando la habitación (`onRoom`).
  - **Copia del mapa** (`building.loot`, en/es):

    | clave | en | es |
    |---|---|---|
    | `show` | What's here | Qué hay |
    | `hide` | Hide | Ocultar |
    | `loading` | Checking the furniture… | Revisando los muebles… |
    | `generic` | No loot of its own: its furniture has what any place has. | No tiene botín propio: sus muebles traen lo de cualquier lugar. |
    | `chance` | Chance that one piece of furniture has it, with loot set to Normal. | Chance de que un mueble lo traiga, con el botín en Normal. |
    | `more` (n) | `and ${n} more` | `y ${n} más` |
    | `force.z` | only in certain areas | sólo en ciertas zonas |
    | `force.t` / `force.r` / `force.i` | como en Objetos | como en Objetos |

    `chance` va una sola vez, en `.pzm-stash-at`, arriba de la tabla de habitaciones.
  - **Estilo:**
    - la lista va dentro de la hoja, con renglones de libreta, sin bordes de color;
    - los nombres de objeto bajan de renglón (nunca `overflow-wrap: anywhere`);
    - en el celular la hoja de abajo crece con el contenido y scrollea adentro, como ya hace;
    - después de abrir o cerrar se llama a `onShown()`, para que el mapa se corra si la hoja tapa el edificio.

- [ ] **Step 1: Tests que fallan.**
  - `zomboidRooms.test.ts`: en el Knox Bank (el caso que ya existe), cada grupo de `floorRooms` trae `raws` no vacío, y cada `raw` normalizado con `roomKey` da la clave del grupo.
  - `zomboidRoomLoot.test.ts`:
    - `await loadRoomLoot(["kitchen"])`: `roomLootFor(["kitchen"])` tiene `own: true` y una fila `bowl` con `p === 0.3439` y mueble `overhead`, con su nombre "Alacena" en `cont[1]`;
    - `await loadRoomLoot(["bedroom4"])`: `roomLootFor(["bedroom4"])` tiene `own: false` y la `n` de `"_all"`;
    - `roomLootFor(["garage"])` (después de cargarlo) trae filas de la tabla `mechanic`;
    - después de `await loadItemSlugsEs()`, `renderToStaticMarkup(<RoomLoot raws={["kitchen"]} route={parseRoute("/es/project-zomboid/mapa")} navigate={() => {}} />)` dentro de `LangContext` en español tiene un `<a href="/es/project-zomboid/objetos/tazon">` (el slug en español de `bowl`) con "Tazón" y `/34\s*%/`;
    - con `["bedroom4"]` tiene "No tiene botín propio".
- [ ] **Step 2:** Verlos fallar.
- [ ] **Step 3:** Implementar. `npx tsc -b`, `npx vitest run test/zomboidRoomLoot.test.ts test/zomboidRooms.test.ts test/zomboidMap.test.ts`.
- [ ] **Step 4: Revisión en el navegador** (panel Browser, `http://localhost:5178/es/project-zomboid/mapa`):
  - tocar una casa de Muldraugh → "Qué hay" en la cocina → seguir un objeto a su ficha → volver;
  - tocar el Knox Bank de Muldraugh (10623, 9685) y abrir la bóveda;
  - en celular, la hoja de abajo no tapa el edificio y no hay scroll horizontal;
  - en la pestaña Red, al abrir el Mapa no se pide ningún `rooms/NN`; se piden recién al tocar un edificio, y sólo los de sus habitaciones;
  - la consola sin errores.
- [ ] **Step 5: Commit.**
  ```bash
  git add site/src/zomboid/loot/roomLoot.ts site/src/zomboid/map/RoomLoot.tsx site/src/zomboid/map/itemSlugs.ts site/src/zomboid/map/BuildingSheet.tsx site/src/zomboid/map/ZomboidMap.tsx site/src/zomboid/map/StashCard.tsx site/src/zomboid/map/rooms.ts site/src/zomboid/map/copy.ts site/src/styles/zomboid-map.css site/test/zomboidRoomLoot.test.ts site/test/zomboidRooms.test.ts
  git commit -m "feat(zomboid): la hoja de cada edificio del mapa dice qué puede aparecer en cada habitación"
  ```

---

### Task 5: Cierre — `lastmod`, peso de los chunks y revisión completa

**Files:**
- Modify: `site/vite.config.ts` (lee `data/loot/meta.json`), `site/src/sitemap.ts` (`ZomboidSitemapData.lootExtractedAt`), `site/test/zomboidPublish.test.ts` (o el test del sitemap de Zomboid donde viva el `lastmod` del mapa: `zomboidMapPublish.test.ts`)

**Interfaces:**
- Consumes: `data/loot/meta.json` (Task 2).
- Produces:
  - `ZomboidSitemapData.lootExtractedAt?: string`.
  - El `lastmod` de la lista y de las fichas de Objetos es el mayor entre `dates.zomboid` y `lootExtractedAt`.
  - El del Mapa es el mayor entre `mapExtractedAt` y `lootExtractedAt`.
  - Sin `data/loot/meta.json`, todo queda como hoy.

- [ ] **Step 1: Tests que fallan:**
  - con `lootExtractedAt` posterior, `/es/project-zomboid/objetos/palanca` y `/es/project-zomboid/mapa` llevan esa fecha;
  - con una anterior, llevan la suya;
  - sin ella, como hoy.
- [ ] **Step 2:** Implementar, más `npx tsc -b`, `npx vitest run` (todo salvo `test/deadlock.test.ts`) y `npm run build`. Anotar en el informe, en gzip, contra los topes de "Global Constraints":
  - `ZomboidItems` y el chunk compartido con `rooms.ts` si aparece;
  - `ZomboidMap`;
  - `BuildingSheet`;
  - el `roomLoot` si queda separado;
  - las rutas prerenderizadas (tienen que ser las mismas que antes: el botín no agrega páginas).
  - Confirmar que `es/project-zomboid/objetos/palanca.html` trae "Dónde aparece" con sus filas, y no "cargando".
- [ ] **Step 3: Revisión completa en el navegador**, escritorio y celular:
  - una ficha con todo (habitaciones, escondites, zombis, vehículos, bolsos: buscar una con `python -c` sobre `data/loot/items`);
  - una ficha sin botín;
  - el Mapa → edificio → "Qué hay" → ficha → "ver una en el mapa" → el mismo tipo de habitación.
- [ ] **Step 4: Commit.**
  ```bash
  git add site/vite.config.ts site/src/sitemap.ts site/test/zomboidPublish.test.ts
  git commit -m "feat(zomboid): el sitemap mueve la fecha de Objetos y del Mapa cuando cambia el botín"
  ```

---

## Fuera de este plan (decidido)

- **Página o filtro "qué sale en una cocina":** no va. La hoja del edificio ya lo dice por habitación, y una página por tipo de habitación pediría prerenderizar unas 380 páginas nuevas, con su texto propio para no ser contenido fino. Si ZoTaD la quiere, es barata de datos (los `rooms/NN.json` ya la tienen) y cara de SEO: plan aparte.
- **El número de Apocalypse (u otro preset):** no va por ahora (ver "Decisión"). Pide replicar `getLootType` del jar (20 categorías) y elegir un preset. Si se hace, la chance de cada fila se multiplica por el `*LootNew` de la categoría del objeto (fuera de la junk), y el sitio podría ofrecer un selector de preset.
- **Las 5 tablas de historia** (`BandPractice`, `Carpenter`, `Chef`, `Farmer`, `Nurse`, con `roomTypes`): son casas armadas al azar ("la de un carpintero"). Quedan para cuando el Mapa tenga historias de edificios.
- **Recolección, pesca, caza y autos abandonados en la ruta:** no son `ItemPicker`. Cuando exista su extractor, van a la misma hoja como otras subsecciones.
