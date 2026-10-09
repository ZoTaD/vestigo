# Caché cruda de Rust (no se publica)

Lo que hace falta para las pestañas que faltan (Monumentos, Electricidad, Granjas) sacado del cliente instalado, para
poder armarlas sin el juego (53 GB). Sacada el **2026-10-08** del build de Steam instalado ese día (bundles del 8/10,
después de Power Trip y Common Ground). Sólo se versiona este README (`.gitignore`); los scripts que la arman están en
`games/rust/tools/` y se corren desde la raíz del repo, **uno por vez** (cada uno abre varios GB de bundles; ver la
regla de memoria en `games/rust/README.md`).

Pesa ~160 MB (items 60, sprites 28, video_frames 25, world 19, io 14, localization 12, farming 2).

| Carpeta | Script | De dónde sale |
| --- | --- | --- |
| `classes.json` | (exploración, ver abajo) | todas las clases de MonoBehaviour de assetscenes + content + items.preload: cantidad, archivos y campos |
| `io/` | `extract_io.py` | `assetscenes.bundle` (prefabs y escenas) + `content.bundle` + `items.preload.bundle` |
| `world/` | `extract_world.py` | ídem, escenas `AssetScene-monument.N` y `AssetScene-props.other`; `Bundles/AssetSceneManifest.json` |
| `farming/` | `extract_farming.py` | ídem |
| `sprites/` | `extract_sprites.py` (después de los tres de arriba) | `Bundles/shared/textures.*.bundle`, `Bundles/textures/*.bundle`, `maps.bundle`, `monuments.bundle` |
| `localization/`, `items/`, `video_frames/`, `streaming/` | `extract_media.py` | `content.bundle`, `Bundles/items/`, `RustClient_Data/StreamingAssets/` |

`classes.json` salió de un script de exploración (un `World()` que cuenta cada clase con la lectura cruda de
`m_Script` y lee el typetree de una instancia por clase); `extract_io.py` y `extract_world.py` hacen lo mismo para
elegir sus clases, así que no hace falta para rehacer la caché.

## Formato común

Cada instancia es `{"ctx": {...}, "data": {...}}` (o con `class` al lado):

- `ctx`: `file` (archivo dentro del bundle; `BuildPlayer-AssetScene-monument.N` es una escena de monumento,
  `BuildPlayer-AssetScene-prefabs`/`props.*` las de prefabs), `go` (GameObject), `root` (el GameObject raíz: el prefab
  del monumento o el prefab mismo, `assets/...prefab`), `pos` (posición en la escena) y `local` (posición relativa a la
  raíz, en el sistema de la raíz: sirve para ubicar algo dentro de un monumento).
- `data`: el typetree entero. Cada referencia a otro objeto es `{"type", "class", "name"/"go", "asset", "ref"}`; las que
  apuntan a un bundle que no estaba abierto quedan `{"unresolved": "CAB-…#id"}` (casi todas son sprites, y
  `sprites/refs.json` dice qué PNG es cada una). Un `GameObjectRef` es `{"guid", "prefab"}` con la ruta del prefab
  sacada del `GameManifest`. Se sacaron las referencias a sonidos, efectos, materiales, mallas y luces.
- Los textos del juego van como `{"token", "english"}` (o `legacyEnglish`): el texto en/es está en
  `localization/{en,es-es}/engine.json` por token (sin distinguir mayúsculas; ver `text_of` en `extract.py`).

## Electricidad (`io/`)

- `classes.json`: 110 clases IO (las que tienen `inputs` y `outputs`) con sus campos propios.
- `prefabs.json`: 263 prefabs IO (131 de un objeto que se coloca), con el componente IO completo: `inputs`/`outputs`
  (`niceName` = nombre del conector, `type` = `IOType`: 0 eléctrico, 1 fluido, 2 cinético, 3 genérico, 4 industrial),
  `siblings` (los demás componentes del GameObject) e `items` (shortname, nombre y descripción en/es).
  Generación y capacidad: panel solar `maximalPowerOutput` 20, molino `maxPowerGeneration` 150, rueda de agua 30,
  generador a combustible `outputEnergy` 40 con `fuelPerSec`; baterías `maxOutput` 15/50/100 y `maxCapactiySeconds`
  24.000/540.000/1.440.000 (= 400/9.000/24.000 rWm), `chargeRatio` 0,8. Consumo cuando es un campo
  (`powerConsumption`, `PowerConsumption`, `consumptionAmount`, `PowerUsageWhilePlaying`, `PowerCost`): luces 1-2,
  carteles de neón 2-7, heladera 5, bomba de agua 5, máquina expendedora 5, rocola 10, etc.
- `monument_instances.json`: los 1.918 componentes IO colocados en escenas (lectores de tarjeta con `accessLevel`,
  generadores de la red con `requiredPowergridStage`, botones, puertas, cajas de fusibles, terminales del aeródromo).
- `configs.json`: `PowergridStageConfig` (la red eléctrica de la isla de Power Trip: etapas con 1, 4, 10 y 18
  fusibles), `PowergridFuseBox` (la caja de la central: 15 ranuras, acepta `fuse.heavy`), `PowergridManager`,
  `PowerlineNode`, `WireColorSettings`, `TimerConfig`/`SeismicSensorConfig` (mínimos y máximos configurables),
  `ItemModChildIO`, `ItemModConveyorOptions`, `WaterCatcherCollectRate`, etc.
- `items.json`: 141 objetos de Electricidad (o que colocan un prefab IO) con el `ItemDefinition` entero.

**No está en los datos del cliente:** el consumo de los componentes cuyo consumo es código (`ConsumptionAmount()`
sobrescrito en C#, compilado a IL2CPP): torreta (10), SAM (25), calefactor, puerta automática, sensores, compuertas
lógicas (las lógicas consumen 1 por defecto), etc. Esos números están en el código decompilado público
(github.com/MillionthOdin16/RustChangelog, el mismo que ya usa `world.py`) y en la wiki; no hace falta el juego.

## Monumentos (`world/`)

- `monuments.json`: los 145 `MonumentInfo` con nombre oficial en/es (`displayPhrase` → engine.json), `type`
  (`MonumentType`), `tier` (`MonumentTier`, flags: 1 = Tier0/costa, 2 = Tier1, 4 = Tier2), `minWorldSize`, `safeZone`,
  `bounds`, su `Monument` (tamaño, radio) y el censo de entidades adentro (recicladoras, puertas, NPC, tiendas...).
- `census_by_root.json`: el mismo censo por raíz, incluidas las piezas que se suman a un monumento desde la escena de
  props (`assets/scenes/prefabs/...`: red eléctrica de la central, `airfield maintainables`, `gasstationmaintainables`,
  `wtp_maintainables`, tiendas alquilables, el mercado de Common Ground).
- `entities.json`: 7.013 entidades dentro de monumentos con clase, GameObject, raíz y posición local.
- `classes/<Clase>.json`: 115 clases volcadas enteras: `CardReader` (82, con `accessLevel` 1 verde, 2 azul, 3 rojo),
  `ItemBasedFlowRestrictor` (las ranuras de fusible), `PuzzleReset` (reinicio cada 1.800 s), `TriggerRadiation` (177,
  con `radiationTier`), `Recycler` (37), `ElectricGenerator` (143; `requiredPowergridStage` dice qué etapa de la red de
  la isla prende cada monumento), `NPCVendingMachine`, `RentableShop` (48), `Apartment*` y `ItemModApartmentTax`
  (impuesto del departamento en chatarra por pila de cada recurso), `ClanTable`, `PlaceMonuments*` (reglas de la
  generación del mapa), `AirfieldAirdropTerminal`/`AirfieldCallChinookTerminal` (en `io/`), etc.
- `AssetSceneManifest.json`: qué monumento va en cada escena.
- No hay íconos de mapa por monumento: `MonumentInfo.mapIcon` está vacío salvo en los túneles (`map-tunnel.png`). El
  mapa del juego escribe el nombre; los marcadores genéricos (`icon-map_*.png`) están en `sprites/png/`.

**No está en el cliente:** qué cajas y cuántas aparecen en cada monumento, y qué NPC (los `SpawnGroup` y puntos de
aparición de monumentos los arma el servidor; en el cliente hay sólo 2 `SpawnGroup` y 28 `NPCSpawner`, del carguero).
Tampoco los costos de mantenimiento de los monumentos mantenidos por jugadores ni el alquiler de las tiendas (convars y
código del servidor). Para eso: servidor dedicado (SteamCMD app 258550) o el código decompilado.

## Granjas (`farming/`)

- `PlantProperties.json`: las 14 plantas (bayas de 6 colores, rosa, orquídea, girasol, maíz, cáñamo, papa, trigo,
  zapallo) con `stages` (8 etapas: `lifeLength` en minutos de juego, `resources`, `yield`, `health`), curvas de
  felicidad por hora del día y temperatura, `WaterIntake`, calidad óptima de luz/agua/suelo/temperatura, cosecha
  (`pickupItem` × `pickupMultiplier`, `maxHarvests`), `SeedItem`, `CloneItem`, `BaseCloneCount`.
- `GrowableGeneProperties.json`: los pesos de la genética (`generic.genes`), en el orden del enum
  `GrowableGenetics.GeneType` (vacío/X, W, G, Y, H): `BaseWeight` 0,05/0,05/0,2/0,2/0,2 y `CrossBreedingWeight`
  1/1/0,6/0,6/0,6 (los rojos pesan 1 y los verdes 0,6, como dice la comunidad). El orden del enum no está en los
  datos (es código): sale del decompilado y cierra con los pesos conocidos, pero conviene confirmarlo ahí.
- `GrowableEntity`, `PlanterBox(Static)`, `Composter`, `ItemModCompostable` (cuánto abono da cada objeto), `Sprinkler`,
  `ElectricalHeater`, `CeilingLight` (`shouldAffectGrowables`).
- Animales: `ChickenCoop`, `Chicken`, `FarmableAnimal`, `Beehive`, `NaturalBeehive`, `Cow`, `Sheep`, `Livestock*`
  (especies, tabla de venta, lana, patrones), `HorseBreed` (10 razas con vida, velocidad y estamina), `RidableHorse`,
  `HitchTrough`, `BiofuelGenerator`.
- `items.json`: 127 objetos de granja (semillas, clones, abono, huevos, miel, lana, comederos...) con nombre en/es.

## Imágenes y textos

- `sprites/png/`: 474 sprites de UI (íconos de componentes IO, de genes, avatares de animales y razas, marcadores del
  mapa, íconos de tarjetas y fusibles...). `sprites/index.json` lista los ~10.100 sprites de los bundles de texturas por
  nombre (para saber qué más hay); `refs.json` enlaza `CAB-…#id` con el PNG.
- `items/`: los 1.784 íconos de objetos a 512 px (webp) y la ficha JSON que el juego deja al lado.
- `localization/{en,es-es}/engine.json` y `engine-generated.json`: todos los textos del juego (7.735 tokens en
  inglés; los de apartamentos, clanes y tiendas alquilables incluidos; los precios vienen como `{large_cost}`, los
  pone el servidor).
- `video_frames/<video>/`: un cuadro cada 4 s (104 en total) de los 31 videos del menú (outpost, oilrig, lighthouse, harbor,
  banditcamp, desertbase, nukesilo, ferryterminal, stables, arcticlabs...), a 1080p/1440p.
- `streaming/`: nombres de animales de corral por idioma (`LivestockNames.*.json`) y licencias de terceros.

## Industrial (`industrial/`, 2026-10-09)

`extract_industrial.py` (~1,5 min, ~7,5 GB de RAM; uno por vez): `BaseOven`/`ElectricOven` (temperatura, `smeltSpeed`,
ranuras de combustible/entrada/salida, `IndustrialMode`, `fuelType`), `BoxStorage` y `StorageContainer` (ranuras),
`IndustrialConveyor` (`MaxStackSizePerMove` 60), `IndustrialCrafter`, `IndustrialStorageAdaptor`, `ItemModCookable`
(tiempo, temperaturas y en qué se convierte cada objeto) e `ItemModBurnable` (combustible y subproducto); además
`items.json` (shortname, `GameObject`, categoría y pila de cada objeto) y `deploys.json` (qué prefab coloca cada objeto).
