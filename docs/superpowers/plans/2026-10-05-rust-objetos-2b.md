# Rust — plan 2b: lo que le falta a Objetos frente a rusthelp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ficha de cada objeto de Rust tenga todo lo que muestra rusthelp.com y algo más, con datos sacados del juego:
- el reciclaje bien contado en las cuatro recicladoras (hoy está mal) y "se obtiene reciclando";
- el botín de los NPC y de la entrega aérea de Papá Noel, la condición con la que aparece cada objeto y la cantidad total por caja;
- cuánto tarda en desaparecer del piso, el costo de reparación, los efectos al usarlo y el tiempo de fabricación en cada banco;
- "se obtiene de" (recolectar, abrir, cocinar o fundir, quemar, usar, mesa de mezcla) y "se convierte en";
- qué se le puede poner a una puerta, el mantenimiento, el desgaste y qué lo detecta;
- sus skins.

De paso corrige la chatarra para investigar, que el juego bajó y hoy mostramos mal.

**Architecture:**
- Son **dos planes en uno**, porque piden cosas distintas:
  - **2b-A (necesita el juego instalado):** las tareas `A1`–`A7` tocan sólo Python (`games/rust/tools/`), regeneran `games/rust/data/*.json` y los íconos, y **nunca corren `site_data.py`**. Así el sitio sigue andando con sus archivos viejos hasta que una tarea B los regenera.
  - **2b-B (no necesita el juego):** las tareas `B1`–`B9` tocan `site_data.py` y el sitio. Leen los JSON que dejaron las A y regeneran `games/rust/data/site/`.
- **Orden de ejecución.** Cada B usa lo que dejó la A anterior; el reciclaje va primero porque es un error que ya está en la rama:
  `B1 → A1 → B2 → B3 → A2 → B4 → A3 → A4 → A5 → B5 → B6 → A6 → B7 → A7 → B8 → B9`.
- **Datos nuevos:**
  - `items.json` (extract.py): las cuatro recicladoras, la chatarra para investigar corregida, `despawn`, `condition.found`, `repair`, `use` y `turns`;
  - `loot.json` (world.py): cada fuente con `kind` (caja, NPC, objeto que se abre, recolectable), `event` y `worn`, y el máximo contando todas las tiradas;
  - `mixing.json` (world.py): las recetas de la mesa de mezcla;
  - `deployables.json` (world.py): puertas, mantenimiento, desgaste y la vibración de los explosivos;
  - `skins.json` (skins.py, nuevo): las skins del juego con nombre oficial en/es e ícono.
- **Sitio:** la ficha (`ItemFicha.tsx`) suma secciones que viven en archivos aparte (`FichaRecycle.tsx`, `FichaLoot.tsx`, `FichaMore.tsx`), para que no crezca sin control. Las cuentas sin React van en `recycle.ts` y `format.ts`.

**Tech Stack:** Python 3.14 + UnityPy 1.25.4 + Pillow, React 18 + Vite + TypeScript, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-10-05-rust.md`. Estética A "Inventario":
  - paneles `rgba(30,30,28,.78)` sin bordes, casilleros `rgba(255,255,255,.07)`;
  - texto `#e2dbd3`, secundario `#a39d93` (`--rs-dim`), verde de acción con fondo `#55702a`;
  - Roboto Condensed en mayúsculas para títulos y etiquetas.
- Todo texto de la UI en inglés y en español rioplatense. Los nombres de objetos, cajas y NPC son los oficiales del juego (es-ES, `engine.json`); si el juego no tiene uno, uno natural y neutro escrito a mano.
- Nada de "sacado de los archivos del juego" en la UI. Ni "según los datos del juego", ni "extraído".
- Sin bordes ni barras de color en tarjetas o filas: el estado va por tinte, texto o cifra.
- Las palabras nunca se cortan (nada de `overflow-wrap: anywhere` ni `word-break`).
- Celular (375 px): sin scroll horizontal. Por eso las tablas anchas se dan vuelta: una fila por recicladora, no una columna.
- Comentarios y mensajes de commit en español rioplatense, explicando el porqué. Sin `Co-Authored-By`.
- Tests de Python: `python -m unittest discover -s games/rust/tools/tests -v` desde la raíz del worktree. Tests de TS: `npx vitest run <archivo>` desde `site/`. `test/deadlock.test.ts` y `test/deadlockBuilds.test.ts` pueden fallar por motivos ajenos.
- Worktree: `C:\Users\Zotad\Desktop\vestigo-rust`, rama `feat/rust`. Rutas relativas a esa carpeta. Servidor local `vestigo-rust` (puerto 5179).
- Instalación: `C:\Program Files (x86)\Steam\steamapps\common\Rust` (`RUST_DIR`), build de Steam 25681799, actualizado el 2026-10-05.
- **A `main` NO.** Se publica con Raideo (plan 3) cuando ZoTaD lo pida.
- Máximo 2 subagentes a la vez.
- **Cada tarea A deja verdes los tests de Python y no corre `site_data.py`. Cada tarea B corre `site_data.py` y deja verdes los tests de Python y los de `site/test/rust*.test.ts`.**

### Datos verificados al relevar (2026-10-05)

Medidos con sondas sobre la instalación y contrastados con rusthelp.com (datos del 1/10/2026) y con la wiki oficial de Facepunch (`wiki.facepunch.com/rust/item/<shortname>`). Las fórmulas siguen el código decompilado público de 2024 (`github.com/MillionthOdin16/RustChangelog`, rama `release`); como el juego cambió desde entonces, cada una se volvió a medir contra los dos sitios. **Si el código da otra cosa, pará y avisá antes de tocar un test.**

- **Reciclaje** (`Recycler.RecycleThink`):
  - por ingrediente sale `⌊cantidad × eficiencia⌋` seguro, y uno más con probabilidad igual a la parte decimal. `cantidad` es por unidad (`ingrediente ÷ amountToCreate`);
  - la chatarra fija (`scrapFromRecycle`) se multiplica por `eficiencia ÷ 0,5`; lo que no llega a una unidad se acumula entre tandas, así que en promedio da la cuenta exacta;
  - un objeto con condición rinde `eficiencia × clamp(condición × condición máxima, 0,1, 1)`: la ficha muestra el objeto entero;
  - **munición de escopeta de 40 mm** (pólvora 7,5 y fragmentos 2 por unidad): roja ×5 + 62 % y ×1 + 50 %; verde con electricidad ×4 + 50 % y ×1 + 20 %; verde ×3 + 75 % y ×1; amarilla ×3 y 80 %. Igual que rusthelp;
  - **engranajes** (fragmentos 25, chatarra fija 10): roja 18 + 75 % y 15; verde con electricidad 15 y 12; verde 12 + 50 % y 10; amarilla 10 y 8. Igual que rusthelp;
  - **AK** (metal de alta calidad 50, madera 200, cuerpo de fusil 1, resorte 4): verde 25, 100, 50 % y 2; amarilla 20, 80, 40 % y 1 + 60 %. Igual que rusthelp.
- **Recicladoras** (`RecyclerConfig`, content.bundle):
  - tipo 0: `efficiency` 0,5 y `powergridEfficiency` 0,6 (desde la etapa 2 de la red eléctrica del monumento);
  - tipo 1: 0,4 (zona segura: Outpost, Bandit Camp, ciudades flotantes);
  - tipo 2: 0,75 (la roja de la planta de energía, pide la etapa 4 de la red);
  - no hay un campo aparte para la chatarra: se escala como el resto.
- **Chatarra para investigar.** La tabla cambió y ya no depende de la receta: ahora es por `ItemDefinition.rarity` (0 → 120, 1 → 15, 2 → 30, 3 → 60, 4 → 120) y `scrapRequired` no cuenta.
  - La wiki oficial da, para la mesa de investigación: AK, C4, explosivos y lanzacohetes 120; Thompson, SKS, escopeta de dos caños (con `scrapRequired` 200) y resorte (con 50) 60; hacha, pico, granada de lata y puerta de garaje 30; temporizador, colmena y sacos de arena 15; horno, caja de madera y cerradura de código 120; puerta de chapa 60.
  - Rusthelp coincide en los que tiene, más cigüeñal de calidad media 15 y señales de ruta 30.
  - **La tabla de hoy (500/125/75/20) está mal** y la corrige A1.
  - Única excepción sin explicar: la wiki da 60 para el tocado de lobo (`hat.wolf`, rareza 0). Queda en 120.
- **Tiempo de fabricación por banco** (`ItemCrafter.GetScaledDuration`): con un nivel más que el que pide la receta, la mitad; con dos o más, un cuarto. La wiki coincide (hacha 30/15/7 s, cerradura de código 30/15/7/7 s, AK 45 s). Rusthelp da otros números (AK 35 s): se sigue al juego.
- **Despawn** (`Item.GetDespawnDuration`): con `quickDespawn`, 30 s; si no, `clamp((r − 1) × 4, 1, 100) × 300 s`, con `r = despawnRarity` o, si es 0, `rarity`.
  - Igual que rusthelp en AK 1 h, hacha 20 min, Thompson 40 min, cerradura de código 5 min, antorcha 30 s, fragmentos de metal 20 min, munición de 40 mm 5 min, chatarra 20 min, munición de 5,56 40 min, misil teledirigido 1 h, casco balístico 1 h, mochila grande 40 min y tocado de lobo 40 min.
  - Una mochila con cosas adentro dura la suma de lo de adentro; no se muestra.
- **Reparación en el banco** (`RepairBench.GetRepairCostList` y `RepairAnItem`):
  - los ingredientes de la receta, con cada componente (categoría 13 o `treatAsComponentForRepairs`) cambiado por el primer ingrediente de su receta × su cantidad (mínimo 1); todo × 0,2, redondeado para arriba (de roto a entero);
  - cada reparación saca `maxConditionLostOnRepair` = 0,2 de condición máxima (medido en `repairbench_static`). Pide el plano si la receta se investiga y no viene por defecto;
  - igual a la wiki en AK (13 de metal de alta calidad, 40 de madera), hacha (20 madera, 15 fragmentos), pico (20, 25), Thompson (3, 20), SKS (4, 40), escopeta de dos caños (35, 1), lanzacohetes (10), puerta de garaje (70), caja de madera (20), parrilla (8, 20), horno (40 piedra, 20 madera, 10 combustible) y lanza de piedra (1 lanza de madera, 4 piedras);
  - los cuatro objetos con `ItemModRepair.canUseRepairBench` (tanques de buceo, martillo neumático) se recargan en vez de repararse: no llevan bloque.
- **Condición al aparecer** (`LootContainer.PopulateLoot`):
  - sólo en cajas con `SpawnType` TOWN (2) o ROADSIDE (5) los objetos con condición salen entre `foundCondition.fractionMin` y `fractionMax`; en las demás, enteros;
  - AK 0,1–0,2 en la caja de élite (tipo 2) y 100 % en la bloqueada (tipo 0), igual que rusthelp; escopeta de corredera 0,01–0,03 en la de élite (rusthelp dice 1–2 %);
  - los barriles juntan prefabs de tipo 0 y de tipo 5: salen "a veces gastados".
- **Cantidad por caja contando todas las tiradas** (mínimo de una tirada; máximo sumando las tiradas que pueden traerlo, sin las de probabilidad 0):
  - AK 28,45 % ×1–2 en la bloqueada, 3,9 % ×1–3 en la de élite, 2,22 % ×1 en la del helicóptero, 0,87 % ×1 en la del Bradley;
  - C4 9,6 % ×1–2 en la bloqueada, 26,53 % ×1–2 en la entrega aérea, 36 % ×1–2 en la del Bradley, 14,29 % ×1 en la de Papá Noel;
  - engranajes 31,25 % ×5–10 en la bloqueada. Todo igual que rusthelp.
- **Entrega aérea de Papá Noel:** `assets/prefabs/misc/xmas/sleigh/presentdrop.prefab` (`SupplyDrop`, tipo 3). C4 14,29 % ×1 y engranajes 15,97 % ×5–10, igual que rusthelp.
- **NPC** (`HumanNPC.LootSpawnSlots`, en `BuildPlayer-AssetScene-prefabs`):
  - cada ranura se tira `numberToSpawn` veces con `probability`; las que tienen `onlyWithLoadoutNamed`, sólo si el NPC eligió ese equipo (`loadouts`, uno al azar, todos igual de probables);
  - al morir, el cadáver vacía todo menos la ropa. La ropa no se cuenta: rusthelp tampoco la lista y no está claro qué hace `StripWear`;
  - científico pesado (`scientistnpc_heavy`, plataforma petrolera) y el del Bradley (`scientistnpc_bradley_heavy`): AK 1,8 % ×1–2, C4 0,24 % ×1, munición de 40 mm 20,85 % ×4–21. Igual que rusthelp;
  - científicos de monumentos (`scientistnpc_roam`, `_patrol`, `_oilrig`, `_cargo`, `_excavator`, `_bradley`, `_arena`, `_ch47_gunner`, `_patrol_arctic`, `_cargo_turret_any`, `_cargo_turret_lr300`, `_roamtethered`, `_outbreak`, todos con la misma tabla): engranajes 4,73 % ×2, munición de 5,56 51,17 % ×12, traje hazmat 1,91 %. Igual que rusthelp;
  - científicos de lancha y de los túneles militares (`scientistnpc_rhib`, `_ptboat`, `_full_*`, misma tabla): chatarra 36,34 %. Rusthelp da 36,34 % de jeringa para "Military Tunnel", "PT Boat" y "RHIB Scientist";
  - moradores de túneles y del laboratorio submarino: engranajes 7,43 %; espantapájaros y hombre de jengibre: 8,75 %. Igual que rusthelp.
- **Objetos que se abren** (`ItemModUnwrap`, `ItemModOpenLootBag`, `ItemModCrackOpen` → `revealList`, una tirada): regalo pequeño fragmentos 12,99 % ×25–49; regalo grande escopeta de corredera 13,33 %; bolsa mediana de Halloween escopeta 8,82 %; bolsa chica fragmentos 11,11 %. Igual que rusthelp. Los huevos de Pascua y la bolsa grande dan más que en rusthelp, que parece no sumar las entradas repetidas de una tabla.
- **Recolectables** (`CollectibleEntity.itemList` e `itemName`): cáñamo 10 de tela y 1 semilla; piedra, metal y azufre sueltos 50; HQM suelto 5; madera suelta 50; los de Halloween 75 (huesos 30). Igual que rusthelp ("Metal (collectable) ×50", "Halloween Metal ×75").
- **Cocinar, fundir, quemar y usar** (items.preload):
  - `ItemModCookable`: mineral de metal → 1 fragmento, mineral de azufre → 1 azufre, HQM → 1 metal de alta calidad, petróleo crudo → 3 de combustible, lata de porotos vacía → 15 fragmentos;
  - `ItemModBurnable`: la madera al quemarse da 1 carbón con 25 %;
  - `ItemModSwap.becomeItem` (destripar pescado, romper cráneos): reloj anaranjado 18 de grasa, tiburón chico 20, salmón 16, bagre 18, perca 9, trucha chica 8, sardina 5, anchoa 1, arenque 1; cráneo 20 de huesos. La grasa coincide con rusthelp. Las `RandomOptions` de algunos peces no se muestran.
- **Mesa de mezcla** (`MixingTable.Recipes` → `RecipeList`, 39 recetas): munición de 5,56 = 5 de pólvora y 10 fragmentos → 3; pólvora = 20 de azufre y 20 de carbón → 10; tés de bayas; etc.
- **Efectos al usar:**
  - `ItemModConsumable.effects` con `MetabolismAttribute.Type`: 0 calorías, 1 hidratación, 3 veneno, 4 radiación, 5 sangrado, 6 vida, 7 vida con el tiempo;
  - `modifiers` (`Modifier.ModifierType`): 0 madera, 1 mineral, 2 resistencia a la radiación, 4 vida máxima, 5 chatarra; `value` × 100 = %, `duration` en segundos;
  - jeringa −5 veneno, −10 radiación, +15 vida, +20 con el tiempo; carne de oso cocida +100 calorías, +1 hidratación, +5 con el tiempo, se pudre en 24 h (`ItemModFoodSpoiling`); té de madera +30 hidratación y +50 % de madera por 30 min; té de chatarra puro +350 % por 1 h; botiquín grande −100 sangrado. Igual que rusthelp;
  - los modificadores del 6 en adelante (pasteles, galope de la jeringa) son tipos nuevos sin nombre verificado: no se muestran.
- **Puertas** (`Door` en el prefab del deployable): la de chapa tiene `canTakeLock`, `canTakeCloser` y `canTakeKnocker`; la blindada además `hasHatch`; la de garaje sólo cerradura. Rusthelp lista para la de chapa cerradura de código, candado, cierrapuertas y aldabas, más controlador y coronas, cuyo campo no se identificó.
- **Mantenimiento** (`Upkeep` en el prefab, 48 objetos, todos con `upkeepMultiplier` 1; `DecayEntity.CalculateUpkeepCostAmounts` y `decay.bracket_*`):
  - por día, los ingredientes de categoría Recursos × 0,1 (base chica) a × 0,333 (base grande), para abajo;
  - puerta de chapa 15–49 fragmentos, puerta de garaje 30–99 (los engranajes no cuentan), puerta blindada 2–6 de metal de alta calidad, muro alto de piedra 400–1.332. Igual que rusthelp;
  - la caja grande y el armario no pagan (rusthelp tampoco lo lista).
- **Desgaste** (sin mantenimiento en el armario):
  - `BuildingGradeDecay`: el grado da la duración (`decay.duration_*`: paja 1 h, madera 3, piedra 5, metal 8, blindado 12), sin demora;
  - `DeployableDecay`: `decayDelay` y `decayDuration` en horas;
  - adentro de una base dura × 10 (`upkeep_inside_decay_scale` 0,1);
  - se encuentran en el GameObject raíz que lleva el nombre corto del prefab (`door.hinged.metal`, `woodbox_deployed`);
  - puerta de chapa 8 h / 80 h, caja grande 8 h, horno 96 h, caja de madera 96 h, sacos de arena 15 min: igual que rusthelp;
  - **sólo 90 de los 532 deployables traen el dato en el cliente**. El banco 2, el armario y el muro alto de piedra, por ejemplo, no lo tienen.
- **Vibración** (`vibrationLevel` del prefab que explota): el C4 y la satchel se siguen por `ThrownWeapon`/`GrenadeWeapon.prefabToThrow`; los cohetes, por `ItemModProjectile.projectileObject`. C4 3, cohete 3, MLRS 3, satchel 2, granada de lata 1, cohete de alta velocidad 1, mina 1. Rusthelp: C4 y cohete, "Seismic Sensor, vibration level 3".
- **Skins** (`ItemDefinition.skins` → `ItemSkin` en content.bundle, por `id`):
  - 312 en objetos visibles (AK 12);
  - nombre por `displayName.token` en `engine.json` (`skin.ak47.digitalcamoak47` = "Digital Camo AK47" / "AK47 con camuflaje digital");
  - ícono: `ItemSkin.icon` es un `Sprite` de 256 px en `Bundles/shared/textures.N.bundle` (el del AK de la jungla, en `textures.1`); las que tienen `Redirect` usan el ícono del objeto al que redirigen;
  - las skins de workshop que no trae el juego (cientos, con precio de mercado de Steam) no están.
- **Prefabs por guid:** `GameManifest` (`manifest`, content.bundle) → `prefabProperties` (17.318 entradas `{name, guid}`). Los 532 `ItemModDeployable.entityPrefab` resuelven todos.
- **Un ciclo en el botín:** `Collection.Ballistic` se elige a sí misma en una de sus ramas. Hoy no la usa ninguna caja que se muestre, pero `World.spawn_tree` entraría en recursión infinita: A3 lo blinda.
- **Lo que el cliente no trae** (queda afuera, ver el final del plan):
  - el botín del Drybox de las lanchas (`ptboat_storage` y `rhib_storage_drybox` son `StorageContainer` sin tabla);
  - los `ResourceDispenser` de nodos, árboles y animales (sólo quedan los de algunos árboles de monumentos);
  - el desgaste del resto de los deployables;
  - el costo del árbol tecnológico.

---

## File Structure

**Python (`games/rust/tools/`):**
- `extract.py` (modificar): recicladoras, chatarra para investigar, despawn, condición al aparecer, reparación, efectos y transformaciones.
- `world.py` (modificar): botín con totales, `worn`, Papá Noel, NPC, recolectables, objetos que se abren, mesa de mezcla y deployables. Escribe `loot.json`, `shops.json`, `mixing.json` y `deployables.json`.
- `skins.py` (crear): skins con nombre e ícono. Escribe `games/rust/data/skins.json` y `site/public/rust/skins/<id>.webp`.
- `site_data.py` (modificar): todo lo nuevo de la ficha.
- `tests/test_extract.py`, `tests/test_world.py` y `tests/test_site_data.py` (modificar); `tests/test_skins.py` (crear).
- `games/rust/README.md` (modificar): el paso de `skins.py`.

**Sitio (`site/src/`):**
- `rust/items/recycle.ts` (modificar): la cuenta del reciclador.
- `rust/items/format.ts` (crear): duraciones, tiempos por banco, mantenimiento y condición.
- `rust/items/parts.tsx` (crear): `Icon` y `RefLink`, compartidos por las secciones.
- `rust/items/FichaRecycle.tsx` (crear): reciclaje y "se obtiene reciclando".
- `rust/items/FichaLoot.tsx` (crear): dónde aparece y qué trae lo que se abre.
- `rust/items/FichaMore.tsx` (crear): reparación, efectos, se obtiene de, se convierte en, construcción, detectado por y skins.
- **Se modifican:** `rust/items/ItemFicha.tsx`, `rust/items/data.ts`, `rustCopy.ts` y `styles/rust-items.css`.
- **Tests (`site/test/`):** `rustRecycle.test.ts` y `rustItems.test.ts` (modificar); `rustFormat.test.ts` (crear).

---

# Plan 2b-A — extracción (necesita el juego instalado)

Todas estas tareas leen la instalación de Rust. Ninguna corre `site_data.py` ni toca `site/`: eso lo hacen las tareas B.

### Task A1: Las cuatro recicladoras y la chatarra para investigar corregida (`extract.py`)

**Files:**
- Modify: `games/rust/tools/extract.py`
- Modify: `games/rust/tools/tests/test_extract.py`
- Modify: `games/rust/tools/tests/test_site_data.py` (sólo el número de investigación del test con datos reales)
- Regenerate: `games/rust/data/items.json`, `games/rust/data/meta.json`, `games/rust/data/home.json`

**Interfaces:**
- Produces, en `items.json`:
  - arriba: `"recyclers": [{"key": "red", "eff": 0.75}, {"key": "green_power", "eff": 0.6}, {"key": "green", "eff": 0.5}, {"key": "yellow", "eff": 0.4}]`, en ese orden (reemplaza a `{"monument": 0.5, "safezone": 0.4}`);
  - `craft.researchScrap` con la tabla nueva.
- Python:
  - `RECYCLERS: list[tuple[str, int, str]]` (clave, `recyclerType`, campo);
  - `recyclers_of(configs: dict[int, dict]) -> list[dict]`;
  - `research_scrap(rarity: int, sid: str | None = None) -> int` (cambia la firma: ya no recibe la receta);
  - `read_content() -> (texts, recyclers)` con `recyclers` en la forma nueva.
  - Se borran `RECYCLER_TYPES` y `RESEARCH_OVERRIDES`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `games/rust/tools/tests/test_extract.py`, reemplazar la clase `TestResearchScrap` entera por:

```python
class TestResearchScrap(unittest.TestCase):
    """Sin el juego: la tabla de la mesa de investigación, por la rareza del objeto (la de la receta ya no cuenta)."""

    def test_tabla_por_rareza(self):
        self.assertEqual([extract.research_scrap(r) for r in (0, 1, 2, 3, 4)], [120, 15, 30, 60, 120])

    def test_rareza_desconocida_corta(self):
        with self.assertRaises(SystemExit) as cm:
            extract.research_scrap(5, "objeto.nuevo")
        self.assertIn("objeto.nuevo", str(cm.exception))


class TestRecyclersOf(unittest.TestCase):
    """Sin el juego: las cuatro recicladoras salen de los tres tipos de `RecyclerConfig`."""

    CONFIGS = {
        0: {"recyclerType": 0, "efficiency": 0.5, "powergridEfficiency": 0.6000000238418579},
        1: {"recyclerType": 1, "efficiency": 0.4000000059604645, "powergridEfficiency": 0.0},
        2: {"recyclerType": 2, "efficiency": 0.75, "powergridEfficiency": 0.0},
    }

    def test_las_cuatro_en_orden(self):
        self.assertEqual(extract.recyclers_of(self.CONFIGS), [
            {"key": "red", "eff": 0.75}, {"key": "green_power", "eff": 0.6},
            {"key": "green", "eff": 0.5}, {"key": "yellow", "eff": 0.4},
        ])

    def test_un_tipo_que_falta_corta(self):
        with self.assertRaises(SystemExit):
            extract.recyclers_of({0: self.CONFIGS[0], 1: self.CONFIGS[1]})
        with self.assertRaises(SystemExit):
            extract.recyclers_of(None)
```

1b. En la clase `TestRecycleAndResearchInGame`, reemplazar `test_eficiencias_de_las_recicladoras` y `test_chatarra_para_investigar` por:

```python
    def test_eficiencias_de_las_recicladoras(self):
        self.assertEqual(data()["recyclers"], [
            {"key": "red", "eff": 0.75}, {"key": "green_power", "eff": 0.6},
            {"key": "green", "eff": 0.5}, {"key": "yellow", "eff": 0.4},
        ])

    def test_chatarra_para_investigar(self):
        # Los de la wiki oficial de Facepunch y rusthelp.com (2026-10-05). La escopeta de dos caños trae
        # `scrapRequired` 200 y el resorte 50: el juego ya no los usa.
        want = {
            "rifle.ak": 120, "explosive.timed": 120, "rocket.launcher": 120, "smg.thompson": 60, "rifle.semiauto": 60,
            "lock.code": 120, "wall.frame.garagedoor": 30, "hatchet": 30, "shotgun.double": 60, "metalspring": 60,
            "electric.timer": 15, "crankshaft2": 15,
        }
        for sid, scrap in want.items():
            self.assertEqual(item(sid)["craft"]["researchScrap"], scrap, sid)
```

`test_costos_de_rareza_5` (horno 120, horno eléctrico 30, escalera 60) queda como está: sigue valiendo con la regla nueva, y ahora sin overrides.

1c. En `games/rust/tools/tests/test_site_data.py`, en `TestBuildReal.test_cada_objeto_visible_tiene_ficha_y_cada_ficha_su_archivo`, cambiar `self.assertEqual(ak["craft"]["researchScrap"], 500)` por `self.assertEqual(ak["craft"]["researchScrap"], 120)`.

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: ERROR en `TestRecyclersOf` (`no attribute 'recyclers_of'`); FAIL en `TestResearchScrap` (75 ≠ 120…), `test_eficiencias_de_las_recicladoras`, `test_chatarra_para_investigar` y el de `TestBuildReal`. El resto pasa.

- [ ] **Step 3: Implementar en `extract.py`**

3a. Reemplazar desde el comentario `# La chatarra que pide la mesa de investigación, por rareza` hasta la línea `RECYCLER_TYPES = {0: "monument", 1: "safezone"}` inclusive (borra `RESEARCH_SCRAP`, `RESEARCH_OVERRIDES` y `RECYCLER_TYPES`) por:

```python
# La chatarra que pide la mesa de investigación, por la rareza del objeto (`ItemDefinition.rarity`). El juego la bajó:
# la tabla del código decompilado de 2024 (20/75/125/500, con la rareza de la receta y `scrapRequired`) ya no es la que
# cobra. Ésta se relevó el 2026-10-05 contra la wiki oficial de Facepunch (wiki.facepunch.com/rust/item/<shortname>,
# "Research Table") y rusthelp.com: AK, C4 y lanzacohetes 120; Thompson, SKS y escopeta de dos caños 60 (aunque su receta
# pida 200); hacha, pico y puerta de garaje 30; temporizador 15; horno, caja de madera y cerradura de código (rareza 0)
# 120. Lo cuida un test con doce objetos.
RESEARCH_SCRAP = {0: 120, 1: 15, 2: 30, 3: 60, 4: 120}
# Las cuatro recicladoras de la ficha, de la que más rinde a la que menos, y de dónde sale su eficiencia en
# `RecyclerConfig` (content.bundle): (clave, `recyclerType`, campo).
#   - red: la roja de la planta de energía (tipo 2), que sólo anda con la red eléctrica del monumento completa;
#   - green_power: la verde de los monumentos (tipo 0) con la red eléctrica prendida (`powergridEfficiency`);
#   - green: la misma sin electricidad;
#   - yellow: la amarilla de las zonas seguras (tipo 1: Outpost, Bandit Camp, ciudades flotantes).
RECYCLERS = [
    ("red", 2, "efficiency"),
    ("green_power", 0, "powergridEfficiency"),
    ("green", 0, "efficiency"),
    ("yellow", 1, "efficiency"),
]
```

3b. En `read_content()`, cambiar el final del docstring (`... y la eficiencia de cada recicladora ({"monument": 0.5, "safezone": 0.4}).`) por `... y las cuatro recicladoras con su eficiencia (`recyclers_of`).` y reemplazar todo lo que va desde `recyclers = None` hasta el `return` por:

```python
    configs = None
    for o in env.objects:
        # `peek_name` lee sólo el nombre: el typetree entero de miles de MonoBehaviour tardaba minutos.
        if o.type.name != "MonoBehaviour" or o.peek_name() != "RecyclerConfig":
            continue
        tt = o.read_typetree()
        if scripts.get(tt.get("m_Script", {}).get("m_PathID")) == "RecyclerConfig":
            configs = {c["recyclerType"]: c for c in tt["recyclerTypeConfigs"]}
            break
    return texts, recyclers_of(configs)


def recyclers_of(configs):
    """
    Las recicladoras de `RECYCLERS`, en ese orden, con su eficiencia: [{"key": "red", "eff": 0.75}, …]. Corta si falta un
    tipo o si una eficiencia no tiene sentido: un parche que cambie `RecyclerConfig` no puede pasar en silencio.
    """
    if not configs:
        raise SystemExit("No encontré RecyclerConfig en content.bundle")
    out = []
    for key, rtype, field in RECYCLERS:
        eff = (configs.get(rtype) or {}).get(field) or 0
        if not 0 < eff <= 1:
            raise SystemExit(f"RecyclerConfig: el tipo {rtype} no trae un {field} válido ({eff})")
        out.append({"key": key, "eff": round(eff, 3)})
    return out
```

3c. Reemplazar la función `research_scrap` entera por:

```python
def research_scrap(rarity, sid=None):
    """
    La chatarra para investigar: `RESEARCH_SCRAP` por la rareza del objeto. Una rareza que no está en la tabla corta: un
    parche con rarezas nuevas no puede pasar en silencio.
    """
    if rarity not in RESEARCH_SCRAP:
        raise SystemExit(f"{sid}: rareza {rarity} sin costo de investigación: agregarla a RESEARCH_SCRAP")
    return RESEARCH_SCRAP[rarity]
```

3d. En `build_items`, cambiar `"researchScrap": research_scrap(d["rarity"], bp, sid) if bp["isResearchable"] else None,` por:

```python
                "researchScrap": research_scrap(d["rarity"], sid) if bp["isResearchable"] else None,
```

3e. En el docstring de `recycle_of`, cambiar "La eficiencia y el redondeo los pone el sitio" por "La eficiencia, la parte decimal (chance de uno más) y la chatarra escalada los pone el sitio". El código no cambia.

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS.

- [ ] **Step 5: Regenerar los datos y mirar el diff**

Run: `python games/rust/tools/extract.py`
Expected: `[rust] build 25681799: 1032 objetos, 648 recetas` (o las cifras de hoy). En `git diff --stat games/rust/data`: cambian `items.json` (recicladoras y `researchScrap`) y `meta.json` (hash y `extractedAt`). **No correr `site_data.py`**: lo hace B2.

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/extract.py games/rust/tools/tests/test_extract.py games/rust/tools/tests/test_site_data.py games/rust/data/items.json games/rust/data/meta.json games/rust/data/home.json
git commit -m "fix(rust): las cuatro recicladoras y la chatarra para investigar que cobra el juego hoy" -m "El juego bajó la investigación (AK 120, no 500) y la cobra por la rareza del objeto, sin mirar la receta: lo confirman la wiki de Facepunch y rusthelp. Las recicladoras pasan a ser cuatro (roja, verde con electricidad, verde y amarilla), todas de RecyclerConfig."
```

---

### Task A2: Despawn, condición al aparecer, reparación, efectos y transformaciones (`extract.py`)

**Files:**
- Modify: `games/rust/tools/extract.py`
- Modify: `games/rust/tools/tests/test_extract.py`
- Regenerate: `games/rust/data/items.json`, `games/rust/data/meta.json`

**Interfaces:**
- Produces, en cada objeto de `items.json`:
  - `"despawn": int` (segundos);
  - `"condition": {"max", "repairable", "found": [min, max]} | null` (`found` en fracción, 3 decimales);
  - `"repair": {"cost": [{"id", "amount"}], "bp": bool, "loss": 0.2} | null`;
  - `"use": {"effects": [{"stat", "amount", "time"}], "mods": [{"stat", "value", "duration"}], "spoil": {"hours", "into"} | null} | null`;
  - `"turns": [{"how": "cook" | "burn" | "swap", "into": sid, "amount": n, "chance": p}]` (lista vacía si nada).
- Python: `despawn_seconds(d) -> int`, `repair_cost(bp, defs, blueprints) -> list`, `use_of(consumable, spoiling, by_pid) -> dict | None`, `turns_of(cook, burn, swap, by_pid) -> list`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `TestItems.test_el_ak`, cambiar `self.assertEqual(ak["condition"], {"max": 150, "repairable": True})` por:

```python
        self.assertEqual(ak["condition"], {"max": 150, "repairable": True, "found": [0.1, 0.2]})
```

1b. Agregar antes de `if __name__ == "__main__":`:

```python
class TestFichaSinJuego(unittest.TestCase):
    """Sin el juego: las cuentas de despawn, reparación, efectos y transformaciones con datos armados a mano."""

    def test_despawn_por_rareza(self):
        d = lambda r, dr=0, quick=0: {"rarity": r, "despawnRarity": dr, "quickDespawn": quick}  # noqa: E731
        self.assertEqual(extract.despawn_seconds(d(4)), 3600)
        self.assertEqual(extract.despawn_seconds(d(3)), 2400)
        self.assertEqual(extract.despawn_seconds(d(2)), 1200)
        self.assertEqual(extract.despawn_seconds(d(1)), 300)
        self.assertEqual(extract.despawn_seconds(d(0)), 300)
        self.assertEqual(extract.despawn_seconds(d(3, 4)), 3600)  # despawnRarity manda
        self.assertEqual(extract.despawn_seconds(d(4, 0, 1)), 30)  # quickDespawn

    def test_reparacion_con_componentes(self):
        ref = lambda p: {"m_FileID": 0, "m_PathID": p}  # noqa: E731
        defs = {
            1: {"shortname": "metal.refined", "category": 3, "treatAsComponentForRepairs": 0, "m_GameObject": ref(11)},
            2: {"shortname": "wood", "category": 3, "treatAsComponentForRepairs": 0, "m_GameObject": ref(12)},
            3: {"shortname": "riflebody", "category": 13, "treatAsComponentForRepairs": 0, "m_GameObject": ref(13)},
            4: {"shortname": "metalspring", "category": 13, "treatAsComponentForRepairs": 0, "m_GameObject": ref(14)},
        }
        blueprints = {
            13: {"ingredients": [{"itemDef": ref(1), "amount": 3.0}]},
            14: {"ingredients": [{"itemDef": ref(1), "amount": 2.0}, {"itemDef": ref(2), "amount": 50.0}]},
        }
        ak = {"ingredients": [{"itemDef": ref(1), "amount": 50.0}, {"itemDef": ref(2), "amount": 200.0},
                              {"itemDef": ref(3), "amount": 1.0}, {"itemDef": ref(4), "amount": 4.0}]}
        # 50 + 3 + 2 × 4 = 61 de metal de alta calidad × 0,2 = 12,2 → 13; 200 de madera → 40.
        self.assertEqual(extract.repair_cost(ak, defs, blueprints), [{"id": "metal.refined", "amount": 13}, {"id": "wood", "amount": 40}])

    def test_efectos_y_podrirse(self):
        consumable = {"effects": [{"type": 6, "amount": 15.0, "time": 0.0}, {"type": 2, "amount": 5.0, "time": 0.0},
                                  {"type": 7, "amount": 20.0, "time": 0.0}],
                      "modifiers": [{"type": 0, "value": 0.5, "duration": 1800.0}, {"type": 20, "value": 3.5, "duration": 4.0}]}
        spoiling = {"TotalSpoilTimeHours": 24.0, "SpoilItem": {"m_FileID": 0, "m_PathID": 9}}
        got = extract.use_of(consumable, spoiling, {9: "bearmeat.spoiled"})
        self.assertEqual(got["effects"], [{"stat": "health", "amount": 15, "time": 0}, {"stat": "healthOverTime", "amount": 20, "time": 0}])
        self.assertEqual(got["mods"], [{"stat": "woodYield", "value": 0.5, "duration": 1800}])
        self.assertEqual(got["spoil"], {"hours": 24, "into": "bearmeat.spoiled"})
        self.assertIsNone(extract.use_of(None, None, {}))

    def test_transformaciones(self):
        ref = lambda p: {"m_FileID": 0, "m_PathID": p}  # noqa: E731
        by_pid = {1: "metal.fragments", 2: "charcoal", 3: "fat.animal"}
        got = extract.turns_of(
            {"becomeOnCooked": ref(1), "amountOfBecome": 1.0},
            {"byproductItem": ref(2), "byproductAmount": 1, "byproductChance": 0.25},
            {"becomeItem": [{"itemDef": ref(3), "amount": 18.0}]},
            by_pid,
        )
        self.assertEqual(got, [
            {"how": "cook", "into": "metal.fragments", "amount": 1, "chance": 1},
            {"how": "burn", "into": "charcoal", "amount": 1, "chance": 0.25},
            {"how": "swap", "into": "fat.animal", "amount": 18, "chance": 1},
        ])
        self.assertEqual(extract.turns_of(None, {"byproductItem": ref(0), "byproductAmount": 1, "byproductChance": 0.0}, None, by_pid), [])


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestFichaInGame(unittest.TestCase):
    def test_despawn(self):
        want = {"rifle.ak": 3600, "hatchet": 1200, "smg.thompson": 2400, "lock.code": 300, "torch": 30,
                "ammo.rocket.seeker": 3600, "metal.fragments": 1200, "wood": 300, "ammo.grenadelauncher.buckshot": 300}
        for sid, s in want.items():
            self.assertEqual(item(sid)["despawn"], s, sid)

    def test_condicion_al_aparecer(self):
        self.assertEqual(item("hatchet")["condition"]["found"], [1, 1])
        self.assertEqual(item("shotgun.pump")["condition"]["found"], [0.01, 0.03])

    def test_reparacion(self):
        self.assertEqual(item("rifle.ak")["repair"], {"cost": [{"id": "metal.refined", "amount": 13}, {"id": "wood", "amount": 40}], "bp": True, "loss": 0.2})
        self.assertEqual(item("hatchet")["repair"]["cost"], [{"id": "wood", "amount": 20}, {"id": "metal.fragments", "amount": 15}])
        self.assertEqual(item("wall.frame.garagedoor")["repair"]["cost"], [{"id": "metal.fragments", "amount": 70}])
        self.assertEqual(item("spear.stone")["repair"]["cost"], [{"id": "spear.wooden", "amount": 1}, {"id": "stones", "amount": 4}])
        self.assertEqual(item("furnace")["repair"]["cost"], [{"id": "stones", "amount": 40}, {"id": "wood", "amount": 20}, {"id": "lowgradefuel", "amount": 10}])
        self.assertIsNone(item("door.hinged.metal")["repair"])  # se repara con el martillo, no en el banco
        self.assertIsNone(item("diving.tank")["repair"])  # se recarga

    def test_efectos(self):
        syringe = {e["stat"]: e["amount"] for e in item("syringe.medical")["use"]["effects"]}
        self.assertEqual(syringe, {"poison": -5, "radiation": -10, "health": 15, "healthOverTime": 20})
        bear = item("bearmeat.cooked")["use"]
        self.assertEqual({e["stat"]: e["amount"] for e in bear["effects"]}, {"calories": 100, "hydration": 1, "healthOverTime": 5})
        self.assertEqual(bear["spoil"]["hours"], 24)
        self.assertEqual(item("woodtea")["use"]["mods"], [{"stat": "woodYield", "value": 0.5, "duration": 1800}])
        self.assertEqual(item("scraptea.pure")["use"]["mods"], [{"stat": "scrapYield", "value": 3.5, "duration": 3600}])

    def test_transformaciones(self):
        self.assertIn({"how": "cook", "into": "metal.fragments", "amount": 1, "chance": 1}, item("metal.ore")["turns"])
        self.assertIn({"how": "cook", "into": "lowgradefuel", "amount": 3, "chance": 1}, item("crude.oil")["turns"])
        self.assertIn({"how": "burn", "into": "charcoal", "amount": 1, "chance": 0.25}, item("wood")["turns"])
        self.assertIn({"how": "swap", "into": "fat.animal", "amount": 18, "chance": 1}, item("fish.orangeroughy")["turns"])
        self.assertIn({"how": "swap", "into": "bone.fragments", "amount": 20, "chance": 1}, item("skull.wolf")["turns"])
        self.assertEqual(item("rifle.ak")["turns"], [])
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: ERROR en `TestFichaSinJuego` (`no attribute 'despawn_seconds'`…), ERROR/FAIL en `TestFichaInGame` y FAIL en `test_el_ak` (falta `found`). El resto pasa.

- [ ] **Step 3: Implementar en `extract.py`**

3a. Agregar `import math` entre `import json` y `import os`.

3b. Debajo de `RECYCLERS`, agregar:

```python
# El `ItemCategory` de los componentes (`CATEGORIES`): en la reparación, un componente se cobra con lo que lleva su receta.
COMPONENT = 13
# Cuánto tarda en desaparecer un objeto tirado (`Item.GetDespawnDuration`): `server.itemdespawn` (300 s) por un
# multiplicador de la rareza (`despawnRarity`, o la del objeto si es 0): clamp((rareza − 1) × 4, 1, 100). Los de
# `quickDespawn` (antorchas, mapa) se van a los `server.itemdespawn_quick` (30 s). Son los valores por defecto del
# servidor; verificados el 2026-10-05 contra rusthelp.com (AK 1 h, hacha 20 min, Thompson 40 min, antorcha 30 s).
ITEM_DESPAWN = 300
ITEM_DESPAWN_QUICK = 30
# El banco de reparación cobra esa fracción de la receta para llevar un objeto de roto a entero
# (`RepairBench.REPAIR_COST_FRACTION`) y le saca esa fracción de condición máxima en cada reparación
# (`maxConditionLostOnRepair` del prefab `repairbench_static`, medido el 2026-10-05).
REPAIR_COST_FRACTION = 0.2
REPAIR_LOSS = 0.2
# Lo que hace usar o comer un objeto (`ItemModConsumable.effects`, enum `MetabolismAttribute.Type`). El 2 (pulso) no lo
# usa ningún objeto.
EFFECTS = {0: "calories", 1: "hydration", 3: "poison", 4: "radiation", 5: "bleeding", 6: "health", 7: "healthOverTime"}
# Los modificadores de los tés (`ItemModConsumable.modifiers`, enum `Modifier.ModifierType`), con `value` en fracción.
# Del 6 en adelante son tipos nuevos (pasteles, la jeringa) cuyo nombre no está verificado: no se muestran.
MODIFIERS = {0: "woodYield", 1: "oreYield", 2: "radiationResistance", 3: "radiationExposureResistance", 4: "maxHealth", 5: "scrapYield"}
```

3c. Arriba de `build_items`, agregar:

```python
def despawn_seconds(d):
    """Los segundos que tarda en desaparecer tirado en el piso (`ITEM_DESPAWN`)."""
    if d["quickDespawn"]:
        return ITEM_DESPAWN_QUICK
    rarity = d["despawnRarity"] or d["rarity"]
    return min(max((rarity - 1) * 4, 1), 100) * ITEM_DESPAWN


def repair_cost(bp, defs, blueprints):
    """
    Lo que cuesta reparar en el banco de roto a entero (`RepairBench.GetRepairCostList` y `RepairAnItem`): los
    ingredientes de la receta, con cada componente (categoría Componentes, o `treatAsComponentForRepairs`) cambiado por el
    primer ingrediente de su propia receta × la cantidad (mínimo 1), y todo × `REPAIR_COST_FRACTION`, para arriba.
    `defs` son los `ItemDefinition` por path_id; `blueprints`, las recetas por el path_id de su GameObject. Verificado el
    2026-10-05 contra la wiki oficial: AK 13 de metal de alta calidad y 40 de madera, puerta de garaje 70 fragmentos.
    """
    total = []  # [path_id, cantidad], en el orden del juego

    def add(pid, amount):
        for row in total:
            if row[0] == pid:
                row[1] += amount
                return
        total.append([pid, amount])

    for ing in bp["ingredients"]:
        pid = ing["itemDef"]["m_PathID"]
        d = defs[pid]
        if d["category"] == COMPONENT or d["treatAsComponentForRepairs"]:
            sub = blueprints.get(d["m_GameObject"]["m_PathID"])
            if sub and sub["ingredients"]:
                first = sub["ingredients"][0]
                add(first["itemDef"]["m_PathID"], max(first["amount"] * ing["amount"], 1))
            continue
        add(pid, ing["amount"])
    # El `- 1e-9` es por la coma flotante: 200 × 0,2 no puede quedar en 41.
    return [{"id": defs[pid]["shortname"], "amount": math.ceil(a * REPAIR_COST_FRACTION - 1e-9)} for pid, a in total]


def use_of(consumable, spoiling, by_pid):
    """
    Lo que hace comer o usar el objeto (`ItemModConsumable`: efectos y modificadores) y en cuánto se echa a perder
    (`ItemModFoodSpoiling`). `None` si no tiene nada de eso.
    """
    effects, mods = [], []
    if consumable:
        for e in consumable["effects"]:
            stat = EFFECTS.get(e["type"])
            if stat and e["amount"]:
                effects.append({"stat": stat, "amount": number(e["amount"]), "time": number(e["time"])})
        for m in consumable.get("modifiers") or []:
            if m["type"] in MODIFIERS:
                mods.append({"stat": MODIFIERS[m["type"]], "value": round(m["value"], 3), "duration": number(m["duration"])})
    spoil = None
    if spoiling:
        spoil = {"hours": number(spoiling["TotalSpoilTimeHours"]), "into": by_pid.get(spoiling["SpoilItem"]["m_PathID"])}
    if not effects and not mods and not spoil:
        return None
    return {"effects": effects, "mods": mods, "spoil": spoil}


def turns_of(cook, burn, swap, by_pid):
    """
    En qué se convierte el objeto:
      - cocinado o fundido (`ItemModCookable`: cada unidad da `amountOfBecome` de `becomeOnCooked`);
      - quemado como combustible (`ItemModBurnable`: `byproductAmount` de `byproductItem` con `byproductChance` por unidad);
      - usado: destripar un pescado, romper un cráneo (`ItemModSwap.becomeItem`; las `RandomOptions` de algunos peces no
        entran).
    Todas las referencias viven en items.preload (`m_FileID` 0). Lista vacía si nada.
    """
    def sid_of(ref):
        return by_pid.get(ref["m_PathID"]) if ref and ref["m_FileID"] == 0 else None

    out = []
    if cook and sid_of(cook["becomeOnCooked"]):
        out.append({"how": "cook", "into": sid_of(cook["becomeOnCooked"]), "amount": number(cook["amountOfBecome"]), "chance": 1})
    if burn and burn["byproductChance"] > 0 and sid_of(burn["byproductItem"]):
        out.append({"how": "burn", "into": sid_of(burn["byproductItem"]), "amount": burn["byproductAmount"],
                    "chance": round(burn["byproductChance"], 3)})
    for b in (swap or {}).get("becomeItem") or []:
        if sid_of(b["itemDef"]):
            out.append({"how": "swap", "into": sid_of(b["itemDef"]), "amount": number(b["amount"]), "chance": 1})
    return out
```

3d. En `build_items`, después de `blueprints = {...}`, agregar:

```python
    defs_by_pid = {pid: tt for pid, tt in defs}

    def by_go(name):
        """Los `ItemMod*` de una clase, por el path_id de su GameObject (el mismo que el del `ItemDefinition`)."""
        return {tt["m_GameObject"]["m_PathID"]: tt for _, tt in classes.get(name, [])}

    repair_mods, consumables, spoilings = by_go("ItemModRepair"), by_go("ItemModConsumable"), by_go("ItemModFoodSpoiling")
    cookables, burnables, swaps = by_go("ItemModCookable"), by_go("ItemModBurnable"), by_go("ItemModSwap")
```

3e. En el `for _, d in defs:` de `build_items`, cambiar `bp = blueprints.get(d["m_GameObject"]["m_PathID"])` por:

```python
        go = d["m_GameObject"]["m_PathID"]
        bp = blueprints.get(go)
```

y, justo antes de `items.append({`, agregar:

```python
        repair = None
        rmod = repair_mods.get(go)
        # Los que tienen `ItemModRepair.canUseRepairBench` (tanques de buceo, martillo neumático) se recargan: el banco
        # no les cobra la receta.
        if cond["enabled"] and cond["repairable"] and bp and not (rmod and rmod["canUseRepairBench"]):
            repair = {"cost": repair_cost(bp, defs_by_pid, blueprints),
                      "bp": bool(bp["isResearchable"] and not bp["defaultBlueprint"]), "loss": REPAIR_LOSS}
        found = cond["foundCondition"]
```

3f. En el diccionario de `items.append({...})`:
- cambiar la línea de `"condition"` por:

```python
            # `number` deja 1.0 en 1, como el resto de los JSON del sitio.
            "condition": {"max": number(cond["max"]), "repairable": bool(cond["repairable"]),
                          "found": [number(round(found["fractionMin"], 3)), number(round(found["fractionMax"], 3))]}
                         if cond["enabled"] else None,
```

- y agregar, después de `"recycle": recycle_of(bp, by_pid),`:

```python
            "despawn": despawn_seconds(d),
            "repair": repair,
            "use": use_of(consumables.get(go), spoilings.get(go), by_pid),
            "turns": turns_of(cookables.get(go), burnables.get(go), swaps.get(go), by_pid),
```

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS.

- [ ] **Step 5: Regenerar los datos**

Run: `python games/rust/tools/extract.py`
Expected: las mismas cifras de objetos y recetas. `items.json` crece (~15 %). **No correr `site_data.py`.**

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/extract.py games/rust/tools/tests/test_extract.py games/rust/data/items.json games/rust/data/meta.json
git commit -m "feat(rust): despawn, condición al aparecer, reparación, efectos y transformaciones de cada objeto" -m "Todo sale de items.preload: la fórmula de despawn por rareza, la reparación del banco (componentes cambiados por lo que llevan, × 0,2 para arriba), los efectos al comer o usar, en cuánto se pudre y en qué se convierte al cocinarlo, quemarlo o usarlo. Verificado contra rusthelp y la wiki de Facepunch."
```

---

### Task A3: Botín con la cantidad total, la condición por caja, Papá Noel y el ciclo blindado (`world.py`)

**Files:**
- Modify: `games/rust/tools/world.py`
- Modify: `games/rust/tools/tests/test_world.py`
- Regenerate: `games/rust/data/loot.json`

**Interfaces:**
- Produces, en `loot.json`:
  - `containers[clave]`: `{"en", "es", "kind": "box", "event": "xmas" | null, "worn": "all" | "some" | "none"}`;
  - `items[sid][]`: `{"c", "chance", "min", "max", "bp"}` con `max` = la suma de las tiradas que pueden traerlo.
- Python:
  - `WORN_TYPES = {2, 5}`, `CONTAINER_EVENTS = {"santa": "xmas"}`;
  - `name_of(texts, n) -> {"en", "es"}`, `merge(found, key, got)`, `loot_doc(found, sources) -> dict`, `collect_boxes(w, texts, found, sources, tables) -> set`;
  - `collect(w: World | None = None)` (los tests le pasan un `World` compartido);
  - `World.spawn_tree` se salta una rama que se elige a sí misma y corta con un mensaje si hay un ciclo más largo.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `games/rust/tools/tests/test_world.py`, reemplazar `_DATA = None` y la función `data()` por:

```python
_DATA = None
_W = None


def W():
    """Un solo `World` para todos los tests (abrir los tres bundles tarda ~20 s)."""
    global _W
    if _W is None:
        _W = world.World()
    return _W


def data():
    global _DATA
    if _DATA is None:
        _DATA = world.collect(W())
    return _DATA
```

1b. En `TestContainerChances`, agregar:

```python
    def test_el_maximo_suma_las_tiradas(self):
        # Dos tiradas de 2–4: hasta 8 en la misma caja.
        tt = {"lootDefinition": leaf("a", amount=2, max_amount=5), "maxDefinitionsToSpawn": 2, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 8))

    def test_una_ranura_imposible_no_cuenta(self):
        tt = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
            {"definition": leaf("a"), "numberToSpawn": 1, "probability": 0.0},
            {"definition": leaf("a"), "numberToSpawn": 1, "probability": 0.5},
        ]}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (0.5, 1, 1))
```

1c. En `TestWorldInGame`, agregar:

```python
    def test_totales_contando_todas_las_tiradas(self):
        # Contra rusthelp.com (2026-10-05): AK ×1–2 en la bloqueada, ×1–3 en la de élite, ×1 en la del helicóptero.
        def rows(sid):
            return {r["c"]: r for r in data()["loot"]["items"][sid] if not r["bp"]}

        ak = rows("rifle.ak")
        self.assertAlmostEqual(ak["locked"]["chance"], 0.2845, places=3)
        self.assertEqual((ak["locked"]["min"], ak["locked"]["max"]), (1, 2))
        self.assertEqual((ak["elite"]["min"], ak["elite"]["max"]), (1, 3))
        self.assertEqual((ak["heli"]["min"], ak["heli"]["max"]), (1, 1))
        c4 = rows("explosive.timed")
        self.assertAlmostEqual(c4["supply"]["chance"], 0.2653, places=3)
        self.assertEqual(c4["supply"]["max"], 2)
        self.assertAlmostEqual(c4["bradley"]["chance"], 0.36, places=3)
        self.assertEqual((rows("gears")["locked"]["min"], rows("gears")["locked"]["max"]), (5, 10))

    def test_la_entrega_de_papa_noel(self):
        src = data()["loot"]["containers"]["santa"]
        self.assertEqual((src["es"], src["kind"], src["event"]), ("Entrega aérea de Papá Noel", "box", "xmas"))
        c4 = {r["c"]: r for r in data()["loot"]["items"]["explosive.timed"] if not r["bp"]}
        self.assertAlmostEqual(c4["santa"]["chance"], 0.1429, places=3)
        self.assertEqual((c4["santa"]["min"], c4["santa"]["max"]), (1, 1))

    def test_que_cajas_gastan_lo_que_sale(self):
        boxes = data()["loot"]["containers"]
        self.assertEqual(boxes["elite"]["worn"], "all")
        self.assertEqual(boxes["military"]["worn"], "all")
        self.assertEqual(boxes["locked"]["worn"], "none")
        self.assertEqual(boxes["heli"]["worn"], "none")
        self.assertEqual(boxes["barrel"]["worn"], "some")  # los del costado del camino sí, los de autospawn no

    def test_ningun_lootspawn_entra_en_ciclo(self):
        # `Collection.Ballistic` se elige a sí misma en una rama: antes era una recursión infinita.
        w = W()
        for o, tt, _ in w.behaviours({"LootSpawn"}):
            tree = w.spawn_tree(o, {"m_FileID": 0, "m_PathID": o.path_id})
            self.assertIsNotNone(tree, tt["m_Name"])
            for p in world.roll_chances(tree, lambda x: x).values():
                self.assertTrue(0 <= p <= 1 + 1e-9, tt["m_Name"])
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: FAIL en `test_el_maximo_suma_las_tiradas` (`(1.0, 2, 4)`) y `test_una_ranura_imposible_no_cuenta`; ERROR en los de `TestWorldInGame` nuevos (`KeyError: 'santa'`, `'worn'`) y `RecursionError` en `test_ningun_lootspawn_entra_en_ciclo`.

- [ ] **Step 3: Implementar en `world.py`**

3a. En el comentario de `CONTAINERS`, cambiar `` `satellite_crate_*`, `giftbox_loot`, `presentdrop` y `xmastunnellootbox` de eventos `` por `` `satellite_crate_*`, `giftbox_loot` y `xmastunnellootbox` son de eventos sin un nombre que la comunidad use `` y agregar al diccionario, después de `"supply_drop": "supply",`:

```python
    # La entrega aérea del trineo de Papá Noel (evento de Navidad): un `SupplyDrop` con su propia tabla.
    "presentdrop": "santa",
```

3b. En `CONTAINER_NAMES`, después de `"supply": "supplydrop",`, agregar:

```python
    "santa": ("Santa's Supply Drop", "Entrega aérea de Papá Noel"),
```

y debajo de `CONTAINER_NAMES`:

```python
# Las cajas que sólo existen en un evento. La ficha lo marca, para que nadie las busque en julio.
CONTAINER_EVENTS = {"santa": "xmas"}
# Los `LootContainer.spawnType` en los que el juego gasta lo que sale (`PopulateLoot`): TOWN (2) y ROADSIDE (5). Ahí un
# objeto con condición sale entre `foundCondition.fractionMin` y `fractionMax` de su máximo (la AK de la caja de élite,
# al 10–20 %); en las demás, entero.
WORN_TYPES = {2, 5}
```

3c. Reemplazar `World.spawn_tree` entero por:

```python
    def spawn_tree(self, owner, ref, _stack=()):
        """
        Un `LootSpawn` como árbol simple, con las referencias ya seguidas (cada una desde el archivo donde vive su
        dueño): `{"subSpawn": [{"weight", "category": árbol | None, "extraSpawns"}],
        "items": [{"sid", "amount", "isBP", "maxAmount"}]}`. `None` si `ref` no apunta a nada. Se arma una vez por
        `LootSpawn` (muchas cajas comparten subárboles).

        Una rama que se elige a sí misma (`Collection.Ballistic`) hace que el juego vuelva a tirar: es lo mismo que sacarla
        del sorteo, y así se trata. Un ciclo más largo corta con el nombre, en vez de una recursión infinita.
        """
        o = self.follow(owner, ref, "LootSpawn")
        if o is None:
            return None
        key = (o.assets_file.name, o.path_id)
        if key in _stack:
            raise SystemExit(f"LootSpawn en ciclo: {self.tree(o)['m_Name']}")
        if key not in self.spawns:
            t = self.tree(o)
            subs = []
            for s in t["subSpawn"]:
                child = self.obj(o, s["category"])
                if child is not None and (child.assets_file.name, child.path_id) == key:
                    continue
                subs.append({"weight": s["weight"], "category": self.spawn_tree(o, s["category"], _stack + (key,)),
                             "extraSpawns": s.get("extraSpawns", 0)})
            self.spawns[key] = {
                "subSpawn": subs,
                "items": [
                    {"sid": self.shortname(o, i["itemDef"], "objeto del botín"), "amount": i["amount"], "isBP": i["isBP"],
                     "maxAmount": i["maxAmount"]}
                    for i in t["items"]
                ],
            }
        return self.spawns[key]
```

3d. Reemplazar `container_chances` entera por:

```python
def container_chances(tt, resolve):
    """
    {(shortname, es_plano): (probabilidad de que la caja traiga al menos uno, mínimo, máximo)}. Cada tirada es
    independiente: P = 1 − Π (1 − p_tirada). El mínimo es lo menos que da una tirada que lo trae; el máximo, lo que darían
    juntas todas las tiradas que pueden traerlo (la caja bloqueada tira dos veces la tabla de la AK: hasta 2). Una ranura
    con probabilidad 0 no cuenta para nada.
    """
    rolls = []  # (spawn, probabilidad de que la tirada ocurra)
    slots = tt.get("LootSpawnSlots") or []
    if slots:
        for s in slots:
            rolls += [(resolve(s["definition"]), s["probability"])] * s["numberToSpawn"]
    elif tt.get("lootDefinition"):
        rolls += [(resolve(tt["lootDefinition"]), 1.0)] * tt["maxDefinitionsToSpawn"]
    miss, amt = {}, {}
    for spawn, p_roll in rolls:
        if p_roll <= 0:
            continue
        for key, p in roll_chances(spawn, resolve).items():
            miss[key] = miss.get(key, 1.0) * (1 - min(1.0, p_roll) * p)
        for key, (lo, hi) in amounts(spawn, resolve).items():
            old = amt.get(key)
            amt[key] = (lo, hi) if old is None else (min(lo, old[0]), old[1] + hi)
    out = {k: (1 - m, *amt[k]) for k, m in miss.items() if m < 1}
    fixed = tt.get("scrapAmount") or 0
    if fixed > 0:
        # `GenerateScrap` mete la chatarra fija además de la que haya dado el botín: si el árbol la da siempre, el
        # mínimo también la suma; si la da a veces, el mínimo es sólo la fija.
        key = ("scrap", False)
        if key in out:
            p, lo, hi = out[key]
            out[key] = (1.0, fixed + (lo if p >= 1 else 0), fixed + hi)
        else:
            out[key] = (1.0, fixed, fixed)
    return out
```

3e. Reemplazar `collect_loot` entera por estas cinco funciones:

```python
def name_of(texts, n):
    """Un nombre de `CONTAINER_NAMES` o `NPC_NAMES`: un token de engine.json o un par (inglés, español) escrito a mano."""
    if isinstance(n, tuple):
        return {"en": n[0], "es": n[1]}
    return {"en": text_of(texts, "en", n), "es": text_of(texts, "es", n)}


def merge(found, key, got):
    """
    Suma a `found[key]` lo de un prefab más. Los prefabs de una clave tienen la misma tabla (lo exige un test), así que dan
    lo mismo; igual, por las dudas, se queda la probabilidad más alta y el rango de cantidades de todos.
    """
    dst = found.setdefault(key, {})
    for item_key, (p, lo, hi) in got.items():
        prev = dst.get(item_key)
        dst[item_key] = (p, lo, hi) if prev is None else (max(p, prev[0]), min(lo, prev[1]), max(hi, prev[2]))


def loot_doc(found, sources):
    """`loot.json`: las fuentes con algo que mostrar y, por objeto, en cuáles aparece, de la más probable a la menos."""
    items = {}
    for key, got in found.items():
        for (sid, bp), (p, lo, hi) in got.items():
            if round(p, 4) <= 0:
                continue  # menos de 1 en 20.000: mostrarlo como 0 % confunde más de lo que informa
            items.setdefault(sid, []).append({"c": key, "chance": round(p, 4), "min": lo, "max": hi, "bp": bp})
    for rows in items.values():
        rows.sort(key=lambda r: (-r["chance"], r["c"], r["bp"]))
    return {"containers": {k: sources[k] for k in sorted(found)}, "items": dict(sorted(items.items()))}


def collect_boxes(w, texts, found, sources, tables):
    """Las cajas de `CONTAINERS`: su botín va a `found`, su nombre a `sources`, su firma a `tables`. Devuelve las que no se muestran."""
    ignored, worn = set(), {}
    for o, tt, _ in w.behaviours(LOOT_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue  # una instancia dentro de una escena: el prefab ya cuenta
        base = container_base(path)
        key = CONTAINERS.get(base)
        if key is None:
            ignored.add(base)
            continue
        tables.setdefault(key, {})[base] = (
            w.ref_key(o, tt.get("lootDefinition")), tt.get("maxDefinitionsToSpawn", 0), tt.get("scrapAmount", 0),
            tuple((w.ref_key(o, s["definition"]), s["numberToSpawn"], round(s["probability"], 6))
                  for s in tt.get("LootSpawnSlots") or []),
        )
        worn.setdefault(key, set()).add(tt.get("SpawnType") in WORN_TYPES)
        # La caja con sus árboles ya resueltos: `container_chances` y `roll_chances` reciben la identidad, igual que en
        # los tests.
        resolved = {
            "lootDefinition": w.spawn_tree(o, tt.get("lootDefinition")),
            "maxDefinitionsToSpawn": tt.get("maxDefinitionsToSpawn", 0),
            "LootSpawnSlots": [
                {"definition": w.spawn_tree(o, s["definition"]), "numberToSpawn": s["numberToSpawn"], "probability": s["probability"]}
                for s in tt.get("LootSpawnSlots") or []
            ],
            "scrapAmount": tt.get("scrapAmount", 0),
        }
        merge(found, key, container_chances(resolved, lambda x: x))
    for key, flags in worn.items():
        # Los barriles juntan prefabs de los dos tipos: "a veces" gastado.
        sources[key] = {**name_of(texts, CONTAINER_NAMES[key]), "kind": "box", "event": CONTAINER_EVENTS.get(key),
                        "worn": "all" if flags == {True} else "none" if flags == {False} else "some"}
    return ignored


def collect_loot(w, texts):
    """
    El botín de todas las fuentes y, aparte, `tables`: por clave, la firma de la tabla de cada prefab (para el test que
    las compara). `found` junta, por clave, {(sid, plano): (probabilidad, mínimo, máximo)}; `sources`, qué es cada clave.
    """
    found, sources, tables = {}, {}, {}
    ignored = collect_boxes(w, texts, found, sources, tables)
    if ignored:
        print(f"[rust] cajas que no se muestran: {', '.join(sorted(ignored))}", file=sys.stderr)
    return loot_doc(found, sources), tables
```

3f. Reemplazar `collect()` por:

```python
def collect(w=None):
    """
    Lee el juego y devuelve `{"loot": ..., "shops": ..., "tables": ...}` sin escribir nada (lo usan los tests, que le
    pasan un `World` ya abierto). `tables` no se escribe: es la firma de la tabla de cada prefab por clave, para
    comprobar que no se mezclan.
    """
    texts, _ = read_content()
    w = w or World()
    loot, tables = collect_loot(w, texts)
    shops = collect_shops(w, texts)
    w.report_unresolved()
    return {"loot": loot, "shops": shops, "tables": tables}
```

3g. En el docstring de arriba del módulo, cambiar "con la probabilidad de que una caja traiga al menos uno y la cantidad" por "con la probabilidad de que una caja traiga al menos uno, la cantidad contando todas sus tiradas y si sale gastado".

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS (los de `TestWorldInGame` tardan ~1 min: un solo `World`).

- [ ] **Step 5: Escribir los datos y revisarlos a ojo**

Run: `python games/rust/tools/world.py`
Expected: `[rust] botín: 36 cajas, … objetos; tiendas: … órdenes`. En `loot.json`: `"santa"` con `"event": "xmas"`, `rifle.ak` en `locked` con `"max": 2`. La lista de "cajas que no se muestran" ya no trae `presentdrop`. **No correr `site_data.py`.**

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/world.py games/rust/tools/tests/test_world.py games/rust/data/loot.json
git commit -m "feat(rust): botín con la cantidad de todas las tiradas, si sale gastado y la entrega de Papá Noel" -m "La AK de la caja bloqueada sale de a 1 por tirada pero hasta 2 por caja: ahora se cuenta como rusthelp. Cada caja dice si gasta lo que sale (spawnType TOWN o ROADSIDE), y spawn_tree ya no se cuelga con Collection.Ballistic, que se elige a sí misma."
```

---

### Task A4: El botín de los NPC (`world.py`)

**Files:**
- Modify: `games/rust/tools/world.py`
- Modify: `games/rust/tools/tests/test_world.py`
- Regenerate: `games/rust/data/loot.json`

**Interfaces:**
- Produces, en `loot.json`, fuentes con `"kind": "npc"` (claves de `NPCS`) y sus filas en `items`, con la misma forma que las cajas. `worn` es `"none"`: el cadáver no gasta nada.
- Python: `NPCS`, `NPC_NAMES`, `NPC_EVENTS`, `NPC_CLASSES`; `npc_chances(per_loadout: list[dict]) -> dict`; `collect_npcs(w, texts, found, sources, tables) -> set`.

- [ ] **Step 1: Escribir los tests que fallan**

En `games/rust/tools/tests/test_world.py`, agregar después de `TestContainerChances`:

```python
class TestNpcChances(unittest.TestCase):
    """Un NPC elige un equipo al azar (todos igual de probables): la chance es el promedio entre equipos."""

    def test_promedio_entre_equipos(self):
        a = {("x", False): (1.0, 1, 1)}
        b = {("x", False): (0.5, 1, 2), ("y", False): (0.2, 3, 3)}
        got = world.npc_chances([a, b])
        self.assertAlmostEqual(got[("x", False)][0], 0.75)
        self.assertEqual(got[("x", False)][1:], (1, 2))
        self.assertAlmostEqual(got[("y", False)][0], 0.1)
        self.assertEqual(got[("y", False)][1:], (3, 3))
```

y en `TestWorldInGame`:

```python
    def test_cientificos_pesados(self):
        # Contra rusthelp.com (2026-10-05): AK 1,8 % ×1–2 y munición de 40 mm 20,86 % ×4–21 en los de la plataforma y
        # del Bradley.
        ak = {r["c"]: r for r in data()["loot"]["items"]["rifle.ak"] if not r["bp"]}
        for key in ("heavy", "heavy_bradley"):
            self.assertAlmostEqual(ak[key]["chance"], 0.018, places=3)
            self.assertEqual((ak[key]["min"], ak[key]["max"]), (1, 2))
        mgl = {r["c"]: r for r in data()["loot"]["items"]["ammo.grenadelauncher.buckshot"]}
        self.assertAlmostEqual(mgl["heavy"]["chance"], 0.2085, places=3)
        self.assertEqual((mgl["heavy"]["min"], mgl["heavy"]["max"]), (4, 21))

    def test_cientificos_y_moradores(self):
        gears = {r["c"]: r for r in data()["loot"]["items"]["gears"] if not r["bp"]}
        self.assertAlmostEqual(gears["scientist"]["chance"], 0.0473, places=3)
        self.assertAlmostEqual(gears["tunnel_dweller"]["chance"], 0.0743, places=3)
        self.assertAlmostEqual(gears["scarecrow"]["chance"], 0.0875, places=3)
        srcs = data()["loot"]["containers"]
        self.assertEqual((srcs["heavy"]["kind"], srcs["heavy"]["worn"]), ("npc", "none"))
        self.assertEqual(srcs["tunnel_dweller"]["es"], "Morador subterráneo")
        self.assertEqual(srcs["scarecrow"]["event"], "halloween")
        self.assertEqual(srcs["gingerbread"]["event"], "xmas")
        for key in set(world.NPCS.values()):
            self.assertTrue(srcs[key]["en"] and srcs[key]["es"], key)

    def test_los_npc_de_una_clave_tienen_la_misma_tabla(self):
        for key in set(world.NPCS.values()):
            self.assertEqual(len(set(data()["tables"][key].values())), 1, key)
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: ERROR (`no attribute 'npc_chances'`, `KeyError: 'heavy'`).

- [ ] **Step 3: Implementar en `world.py`**

3a. Debajo de `WORN_TYPES`, agregar:

```python
# Los NPC con botín, por el prefab sin carpeta ni extensión, con la regla de `CONTAINERS`: comparten clave sólo los que
# tienen la misma tabla (lo exige un test). Los científicos se separan por dónde están, con los nombres que usa la
# comunidad (rusthelp.com, 2026-10-05): los de monumentos (y el carguero, la plataforma, el Bradley, el Chinook) tienen
# una tabla; los de los túneles militares y los de las lanchas, otra (rusthelp les da la misma jeringa, 36,34 %).
# Afuera, y se listan al correr: los guardias de Bandit Camp y los científicos de Outpost (zonas seguras), los
# `scientist2*` sin botín, `npcplayertest` y los vendedores.
NPCS = {
    "scientistnpc_roam": "scientist", "scientistnpc_patrol": "scientist", "scientistnpc_roamtethered": "scientist",
    "scientistnpc_excavator": "scientist", "scientistnpc_oilrig": "scientist", "scientistnpc_cargo": "scientist",
    "scientistnpc_cargo_turret_any": "scientist", "scientistnpc_cargo_turret_lr300": "scientist",
    "scientistnpc_arena": "scientist", "scientistnpc_bradley": "scientist", "scientistnpc_ch47_gunner": "scientist",
    "scientistnpc_patrol_arctic": "scientist", "scientistnpc_outbreak": "scientist",
    "scientistnpc_roam_nvg_variant": "scientist_nvg",
    "scientistnpc_full_any": "scientist_tunnel", "scientistnpc_full_lr300": "scientist_tunnel",
    "scientistnpc_full_mp5": "scientist_tunnel", "scientistnpc_full_pistol": "scientist_tunnel",
    "scientistnpc_full_shotgun": "scientist_tunnel",
    "scientistnpc_rhib": "scientist_boat", "scientistnpc_ptboat": "scientist_boat",
    "scientistnpc_junkpile_pistol": "scientist_junkpile",
    "scientistnpc_heavy": "heavy", "scientistnpc_bradley_heavy": "heavy_bradley",
    "npc_tunneldweller": "tunnel_dweller", "npc_tunneldwellerspawned": "tunnel_dweller",
    "npc_underwaterdweller": "underwater_dweller",
    "scarecrow": "scarecrow", "scarecrow_dungeon": "scarecrow", "scarecrow_dungeonnoroam": "scarecrow",
    "gingerbread_dungeon": "gingerbread", "gingerbread_meleedungeon": "gingerbread",
}
# Los nombres: el token del juego cuando lo hay, y si no a mano, con las palabras del juego.
NPC_NAMES = {
    "scientist": "scientist.name",
    "scientist_nvg": ("Night Vision Scientist", "Científico con visión nocturna"),
    "scientist_tunnel": ("Military Tunnel Scientist", "Científico de los túneles militares"),
    "scientist_boat": ("Boat Scientist", "Científico de lancha"),
    "scientist_junkpile": ("Junk Pile Scientist", "Científico de la pila de chatarra"),
    "heavy": ("Heavy Scientist (Oil Rig)", "Científico pesado (plataforma petrolera)"),
    "heavy_bradley": ("Heavy Scientist (Bradley)", "Científico pesado (Bradley)"),
    "tunnel_dweller": "tunneldweller.name",
    "underwater_dweller": "underwaterdweller.name",
    "scarecrow": "scarecrow.name",
    "gingerbread": "gingerbread_man",
}
NPC_EVENTS = {"scarecrow": "halloween", "gingerbread": "xmas"}
NPC_CLASSES = {"ScientistNPC", "ScientistNPC2", "TunnelDweller", "UnderwaterDweller", "ScarecrowNPC", "GingerbreadNPC",
               "BanditGuard", "NPCShopKeeper", "NPCPlayer"}
```

3b. Debajo de `container_chances`, agregar:

```python
def npc_chances(per_loadout):
    """
    El botín de un NPC que elige su equipo al azar entre `loadouts`, todos igual de probables (`EquipLoadout`):
    `per_loadout` trae el resultado de `container_chances` con cada equipo (las ranuras `onlyWithLoadoutNamed` cambian de
    uno a otro: la minigun del científico pesado). La probabilidad es el promedio; la cantidad, el rango de todos.
    """
    n = len(per_loadout)
    out = {}
    for got in per_loadout:
        for key, (p, lo, hi) in got.items():
            o = out.get(key)
            out[key] = (p / n, lo, hi) if o is None else (o[0] + p / n, min(lo, o[1]), max(hi, o[2]))
    return out
```

3c. Debajo de `collect_boxes`, agregar:

```python
def collect_npcs(w, texts, found, sources, tables):
    """
    El botín de los NPC de `NPCS` (`HumanNPC.LootSpawnSlots`, que el cadáver recibe al morir). Cada ranura se tira
    `numberToSpawn` veces con su probabilidad, y las que tienen `onlyWithLoadoutNamed`, sólo con ese equipo. La ropa que
    queda puesta en el cadáver no se cuenta. Devuelve los prefabs con botín que no se muestran.
    """
    ignored, seen = set(), set()
    for o, tt, _ in w.behaviours(NPC_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue
        base = path.rsplit("/", 1)[-1].removesuffix(".prefab")
        slots = tt.get("LootSpawnSlots") or []
        key = NPCS.get(base)
        if key is None:
            if slots:
                ignored.add(base)
            continue
        tables.setdefault(key, {})[base] = tuple(
            (w.ref_key(o, s["definition"]), s["numberToSpawn"], round(s["probability"], 6), s.get("onlyWithLoadoutNamed") or "")
            for s in slots
        )
        names = []
        for ref in tt.get("loadouts") or []:
            lo = w.follow(o, ref, "PlayerInventoryProperties")
            names.append(w.tree(lo).get("niceName", "") if lo else "")
        per = []
        for name in names or [""]:
            res = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
                {"definition": w.spawn_tree(o, s["definition"]), "numberToSpawn": s["numberToSpawn"], "probability": s["probability"]}
                for s in slots if not s.get("onlyWithLoadoutNamed") or s["onlyWithLoadoutNamed"] == name
            ]}
            per.append(container_chances(res, lambda x: x))
        merge(found, key, npc_chances(per))
        seen.add(key)
    for key in seen:
        sources[key] = {**name_of(texts, NPC_NAMES[key]), "kind": "npc", "event": NPC_EVENTS.get(key), "worn": "none"}
    return ignored
```

3d. En `collect_loot`, después de `ignored = collect_boxes(...)`, agregar:

```python
    npcs_out = collect_npcs(w, texts, found, sources, tables)
    if npcs_out:
        print(f"[rust] NPC con botín que no se muestran: {', '.join(sorted(npcs_out))}", file=sys.stderr)
```

3e. En el docstring del módulo, agregar a la descripción de `loot.json`: "y de los NPC (científicos, moradores, espantapájaros)".

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS.

- [ ] **Step 5: Escribir los datos**

Run: `python games/rust/tools/world.py`
Expected: la línea de NPC que no se muestran trae `npc_bandit_guard` y `scientistnpc_peacekeeper` y nada más. **No correr `site_data.py`.**

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/world.py games/rust/tools/tests/test_world.py games/rust/data/loot.json
git commit -m "feat(rust): el botín de los científicos, los moradores, el espantapájaros y el hombre de jengibre" -m "Sale de las LootSpawnSlots de cada NPC, con las ranuras que dependen del equipo promediadas (la minigun del científico pesado). Los guardias de las zonas seguras quedan afuera: no se los saquea."
```

---

### Task A5: Recolectables, objetos que se abren y la mesa de mezcla (`world.py`)

**Files:**
- Modify: `games/rust/tools/world.py`
- Modify: `games/rust/tools/tests/test_world.py`
- Regenerate: `games/rust/data/loot.json`; Create: `games/rust/data/mixing.json`

**Interfaces:**
- Produces:
  - en `loot.json`, fuentes `"kind": "collect"` (clave `collect_<token>` o `collect_halloween_<token>`) y `"kind": "item"` (clave `open_<shortname>`, con `"item": shortname`), con `event` (`"xmas"`, `"halloween"`, `"easter"` o `null`) y `"worn": "none"`;
  - `mixing.json`: `{"recipes": [{"name", "out": sid, "amount": n, "time": s, "bp": bool, "in": [{"id", "amount"}]}]}`, ordenadas por `out`.
- Python: `OPENABLE`, `collect_collectibles(w, texts, found, sources)`, `collect_openables(w, texts, found, sources)`, `collect_mixing(w) -> dict`. `collect()` devuelve además `"mixing"`.

- [ ] **Step 1: Escribir los tests que fallan**

En `TestWorldInGame` de `games/rust/tools/tests/test_world.py`, agregar:

```python
    def test_recolectables(self):
        # rusthelp.com (2026-10-05): "Metal (collectable) ×50", "Halloween Metal (collectable) ×75".
        def row(sid, key):
            return next(r for r in data()["loot"]["items"][sid] if r["c"] == key)

        self.assertEqual((row("metal.ore", "collect_metalore")["chance"], row("metal.ore", "collect_metalore")["min"]), (1, 50))
        self.assertEqual(row("metal.ore", "collect_halloween_metalore")["min"], 75)
        self.assertEqual(row("cloth", "collect_hemp")["min"], 10)
        srcs = data()["loot"]["containers"]
        self.assertEqual((srcs["collect_hemp"]["kind"], srcs["collect_hemp"]["event"]), ("collect", None))
        self.assertEqual(srcs["collect_halloween_metalore"]["event"], "halloween")

    def test_lo_que_se_abre(self):
        # rusthelp.com: regalo pequeño 12,99 % de fragmentos ×25–49; bolsa chica de Halloween 11,11 %; regalo grande
        # 13,33 % de escopeta de corredera.
        def row(sid, key):
            return next(r for r in data()["loot"]["items"][sid] if r["c"] == key)

        small = row("metal.fragments", "open_xmas.present.small")
        self.assertAlmostEqual(small["chance"], 0.1299, places=3)
        self.assertEqual((small["min"], small["max"]), (25, 49))
        self.assertAlmostEqual(row("metal.fragments", "open_halloween.lootbag.small")["chance"], 0.1111, places=3)
        self.assertAlmostEqual(row("shotgun.pump", "open_xmas.present.large")["chance"], 0.1333, places=3)
        src = data()["loot"]["containers"]["open_xmas.present.small"]
        self.assertEqual((src["kind"], src["item"], src["event"]), ("item", "xmas.present.small", "xmas"))
        self.assertEqual(data()["loot"]["containers"]["open_easter.goldegg"]["event"], "easter")

    def test_mesa_de_mezcla(self):
        recipes = {r["out"]: r for r in data()["mixing"]["recipes"]}
        self.assertEqual(len(data()["mixing"]["recipes"]), 39)
        ammo = recipes["ammo.rifle"]
        self.assertEqual((ammo["amount"], ammo["bp"]), (3, True))
        self.assertEqual(ammo["in"], [{"id": "gunpowder", "amount": 5}, {"id": "metal.fragments", "amount": 10}])
        self.assertEqual(recipes["gunpowder"]["in"], [{"id": "sulfur", "amount": 20}, {"id": "charcoal", "amount": 20}])
        self.assertEqual(recipes["healingtea"]["in"], [{"id": "red.berry", "amount": 4}])
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: `StopIteration`/`KeyError` en los tres tests nuevos.

- [ ] **Step 3: Implementar en `world.py`**

3a. Cambiar `from extract import BUNDLES, DATA, read_content, text_of` por `from extract import BUNDLES, DATA, read_content, slugify, text_of`.

3b. Debajo de `NPC_CLASSES`, agregar:

```python
# Los objetos que se abren y lo que tiran (`revealList`), con el evento en el que aparecen: los regalos de Navidad
# (`ItemModUnwrap`), las bolsas de caramelos de Halloween (`ItemModOpenLootBag`) y los huevos de Pascua
# (`ItemModCrackOpen`).
OPENABLE = {"ItemModUnwrap": "xmas", "ItemModOpenLootBag": "halloween", "ItemModCrackOpen": "easter"}
COLLECTABLES = "assets/bundled/prefabs/autospawn/collectable/"
```

3c. Debajo de `collect_npcs`, agregar:

```python
def collect_collectibles(w, texts, found, sources):
    """
    Lo que se junta del suelo (`CollectibleEntity`: cáñamo, hongos, bayas, piedras y metal sueltos): siempre lo mismo, con
    el nombre del juego (`itemName`). Los de Halloween dan más y van con su clave.
    """
    for o, tt, _ in w.behaviours({"CollectibleEntity"}):
        path = w.go_name(o, tt)
        if not path.startswith(COLLECTABLES):
            continue  # el diésel del excavador y las instancias en escenas
        token = tt["itemName"]["token"]
        halloween = "/halloween/" in path
        key = ("collect_halloween_" if halloween else "collect_") + slugify(token).replace("-", "")
        got = {}
        for i in tt.get("itemList") or []:
            sid = w.shortname(o, i["itemDef"], "objeto recolectable")
            if sid:
                n = max(1, int(i["amount"]))
                got[(sid, False)] = (1.0, n, n)
        merge(found, key, got)
        sources[key] = {
            "en": text_of(texts, "en", token) or tt["itemName"]["legacyEnglish"].strip(),
            "es": text_of(texts, "es", token),
            "kind": "collect", "event": "halloween" if halloween else None, "worn": "none",
        }


def collect_openables(w, texts, found, sources):
    """
    Lo que trae un objeto al abrirlo (`OPENABLE`): `revealList` tirada `maxTries` veces. Hoy todos tiran una vez; si un
    parche pone `minTries` ≠ `maxTries` corta, porque la cuenta de la probabilidad cambia.
    """
    defs = {}
    for o, tt, _ in w.behaviours({"ItemDefinition"}):
        defs[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])] = tt
    for o, tt, cls in w.behaviours(set(OPENABLE)):
        d = defs[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])]
        if d["hidden"]:
            continue
        sid = d["shortname"]
        if tt["minTries"] != tt["maxTries"]:
            raise SystemExit(f"{sid}: se abre entre {tt['minTries']} y {tt['maxTries']} veces; revisar la cuenta")
        res = {"lootDefinition": w.spawn_tree(o, tt["revealList"]), "maxDefinitionsToSpawn": tt["maxTries"],
               "LootSpawnSlots": [], "scrapAmount": 0}
        key = f"open_{sid}"
        merge(found, key, container_chances(res, lambda x: x))
        token = d["displayName"]["token"]
        sources[key] = {"en": text_of(texts, "en", token) or d["displayName"]["legacyEnglish"], "es": text_of(texts, "es", token),
                        "kind": "item", "item": sid, "event": OPENABLE[cls], "worn": "none"}


def collect_mixing(w):
    """
    Las recetas de la mesa de mezcla (`MixingTable.Recipes` → `RecipeList` → `Recipe`): cada ingrediente ocupa una
    ranura y puede repetirse, así que se suman por objeto. `RequiresBlueprint` dice si hace falta saber el plano del
    producto.
    """
    seen, out = set(), []
    for o, tt, _ in w.behaviours({"MixingTable"}):
        if not w.go_name(o, tt).startswith("assets/"):
            continue
        rl = w.follow(o, tt["Recipes"], "RecipeList de la mesa de mezcla")
        if rl is None:
            continue
        for ref in w.tree(rl)["Recipes"]:
            r = w.follow(rl, ref, "receta de la mesa de mezcla")
            if r is None:
                continue
            t = w.tree(r)
            if t["m_Name"] in seen:
                continue
            seen.add(t["m_Name"])
            product = w.shortname(r, t["ProducedItem"], "producto de la mesa de mezcla")
            if not product:
                continue
            ins = {}
            for i in t["Ingredients"]:
                sid = w.shortname(r, i["Ingredient"], "ingrediente de la mesa de mezcla")
                if sid:
                    ins[sid] = ins.get(sid, 0) + i["Count"]
            out.append({"name": t["m_Name"], "out": product, "amount": t["ProducedItemCount"],
                        "time": number(t["MixingDuration"]), "bp": bool(t["RequiresBlueprint"]),
                        "in": [{"id": k, "amount": v} for k, v in ins.items()]})
    out.sort(key=lambda r: (r["out"], r["name"]))
    return {"recipes": out}
```

3d. Cambiar el import a `from extract import BUNDLES, DATA, number, read_content, slugify, text_of`.

3e. En `collect_loot`, después del bloque de los NPC, agregar:

```python
    collect_collectibles(w, texts, found, sources)
    collect_openables(w, texts, found, sources)
```

3f. En `collect()`, agregar `mixing = collect_mixing(w)` antes de `w.report_unresolved()` y devolver `{"loot": loot, "shops": shops, "mixing": mixing, "tables": tables}`. En `main()`, cambiar `for name in ("loot", "shops"):` por `for name in ("loot", "shops", "mixing"):` y sumar al `print` final `; mesa de mezcla: {len(got['mixing']['recipes'])} recetas`.

3g. En el docstring del módulo, agregar `games/rust/data/mixing.json` (las recetas de la mesa de mezcla) a la lista de lo que escribe, y "recolectables y objetos que se abren (regalos, bolsas de Halloween, huevos)" a lo de `loot.json`.

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS. Si `collect_metalore` no existe, imprimir las claves `collect_*` de `data()["loot"]["containers"]`: el token puede venir con otra forma (`metalore`, `metal.ore`). Ajustar el test al token real, no la clave.

- [ ] **Step 5: Escribir los datos**

Run: `python games/rust/tools/world.py`
Expected: `mixing.json` con 39 recetas. En `loot.json`, `metal.fragments` con filas `open_xmas.present.small`, `open_easter.bronzeegg`… **No correr `site_data.py`.**

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/world.py games/rust/tools/tests/test_world.py games/rust/data/loot.json games/rust/data/mixing.json
git commit -m "feat(rust): lo que se junta del suelo, lo que traen los regalos y las bolsas, y la mesa de mezcla" -m "Los recolectables (CollectibleEntity) y los objetos que se abren (regalos, bolsas de Halloween, huevos de Pascua) son fuentes de botín como una caja; las 39 recetas de la mesa de mezcla van aparte, en mixing.json."
```

---

### Task A6: Puertas, mantenimiento, desgaste y vibración (`world.py`)

**Files:**
- Modify: `games/rust/tools/world.py`
- Modify: `games/rust/tools/tests/test_world.py`
- Create: `games/rust/data/deployables.json`

**Interfaces:**
- Produces `deployables.json`:
  - `"items": {sid: {"door": {"lock", "closer", "knocker", "hatch"} | null, "upkeep": bool, "decay": {"delay": h, "duration": h} | null}}`, sólo para objetos con algo;
  - `"vibration": {sid: nivel}`.
- Python: `DECAY_GRADE_HOURS`, `EXPLOSIVE_CLASSES`, `THROWER_CLASSES`; `prefab_paths(w) -> dict[guid, path]`; `item_prefabs(w, paths) -> dict`; `collect_deployables(w) -> dict`. `collect()` devuelve además `"deployables"`.

- [ ] **Step 1: Escribir los tests que fallan**

En `TestWorldInGame`, agregar:

```python
    def test_puertas(self):
        dep = data()["deployables"]["items"]
        self.assertEqual(dep["door.hinged.metal"]["door"], {"lock": True, "closer": True, "knocker": True, "hatch": False})
        self.assertTrue(dep["door.hinged.toptier"]["door"]["hatch"])
        self.assertEqual(dep["wall.frame.garagedoor"]["door"], {"lock": True, "closer": False, "knocker": False, "hatch": False})

    def test_mantenimiento(self):
        dep = data()["deployables"]["items"]
        for sid in ("door.hinged.metal", "wall.frame.garagedoor", "wall.external.high.stone", "door.hinged.toptier"):
            self.assertTrue(dep[sid]["upkeep"], sid)
        self.assertFalse(dep.get("box.wooden.large", {}).get("upkeep", False))

    def test_desgaste(self):
        # rusthelp.com (2026-10-05): puerta de chapa 8 h, caja grande 8 h, horno 96 h, caja de madera 96 h, sacos 15 min.
        dep = data()["deployables"]["items"]
        self.assertEqual(dep["door.hinged.metal"]["decay"], {"delay": 0, "duration": 8})
        self.assertEqual(dep["door.hinged.toptier"]["decay"], {"delay": 0, "duration": 12})
        self.assertEqual(dep["box.wooden.large"]["decay"], {"delay": 5, "duration": 8})
        self.assertEqual(dep["furnace"]["decay"], {"delay": 48, "duration": 96})  # sólo hay copias en los departamentos
        self.assertEqual(dep["box.wooden"]["decay"]["duration"], 96)
        self.assertEqual(dep["barricade.sandbags"]["decay"], {"delay": 0, "duration": 0.25})

    def test_vibracion(self):
        vib = data()["deployables"]["vibration"]
        self.assertEqual({k: vib[k] for k in ("explosive.timed", "ammo.rocket.basic", "explosive.satchel", "grenade.beancan", "ammo.rocket.hv")},
                         {"explosive.timed": 3, "ammo.rocket.basic": 3, "explosive.satchel": 2, "grenade.beancan": 1, "ammo.rocket.hv": 1})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: `KeyError: 'deployables'` en los cuatro.

- [ ] **Step 3: Implementar en `world.py`**

3a. Debajo de `COLLECTABLES`, agregar:

```python
# Cuánto tarda en romperse sin mantenimiento algo de un grado de construcción (`BuildingGradeDecay` → `decay.duration_*`,
# valores por defecto del servidor: paja, madera, piedra, metal, blindado), en horas y sin demora (`decay.delay_*` = 0).
# Adentro de una base dura 10 veces más (`decay.upkeep_inside_decay_scale` = 0,1): eso lo multiplica el sitio.
DECAY_GRADE_HOURS = {0: 1, 1: 3, 2: 5, 3: 8, 4: 12}
# Los prefabs que explotan, con su `vibrationLevel` (lo que detecta el sensor sísmico), y las armas que se tiran y dicen
# qué prefab tiran (`prefabToThrow`): el C4 en la mano es `explosive.timed.entity`, el que explota `.deployed`.
EXPLOSIVE_CLASSES = {"TimedExplosive", "DudTimedExplosive", "RFTimedExplosive", "SeasonalTimedExplosive", "MLRSRocket",
                     "BeeGrenade", "DeployableSiegeExplosive", "Landmine"}
THROWER_CLASSES = {"ThrownWeapon", "GrenadeWeapon"}
```

3b. Debajo de `collect_mixing`, agregar:

```python
def prefab_paths(w):
    """{guid: ruta del prefab}, del `GameManifest` de content.bundle (`prefabProperties`, ~17.300 entradas)."""
    for _, tt, _ in w.behaviours({"GameManifest"}):
        return {p["guid"]: p["name"] for p in tt["prefabProperties"]}
    raise SystemExit("No encontré el GameManifest en content.bundle")


def item_prefabs(w, paths):
    """
    Los prefabs de cada objeto, por shortname: `deploy` (lo que se coloca, `ItemModDeployable`), `entity` (lo que se
    tiene en la mano, `ItemModEntity`) y `projectile` (lo que dispara, `ItemModProjectile`). Todo vive en items.preload.
    """
    sid_of = {}
    for o, tt, _ in w.behaviours({"ItemDefinition"}):
        if not tt["hidden"]:
            sid_of[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])] = tt["shortname"]
    out = {}
    fields = {"ItemModDeployable": ("deploy", "entityPrefab"), "ItemModEntity": ("entity", "entityPrefab"),
              "ItemModProjectile": ("projectile", "projectileObject")}
    for o, tt, cls in w.behaviours(set(fields)):
        sid = sid_of.get((o.assets_file.name, tt["m_GameObject"]["m_PathID"]))
        what, field = fields[cls]
        path = paths.get(tt[field]["guid"])
        if sid and path:
            out.setdefault(sid, {})[what] = path
    return out


def collect_deployables(w):
    """
    Lo de construcción de cada objeto que se coloca:
      - `door`: qué se le puede poner (`Door.canTakeLock`, `canTakeCloser`, `canTakeKnocker`) y si tiene mirilla
        (`hasHatch`);
      - `upkeep`: si el armario le cobra mantenimiento (`Upkeep`; cuánto lo calcula el sitio con la receta);
      - `decay`: demora y duración del desgaste en horas (`BuildingGradeDecay` o `DeployableDecay`). Viven en el
        GameObject raíz con el nombre corto del prefab y sólo 90 de 532 objetos los traen en el cliente: el resto queda
        sin dato.
    Y `vibration`: el nivel con que el sensor sísmico detecta cada explosivo.
    """
    paths = prefab_paths(w)
    prefabs = item_prefabs(w, paths)
    by_path, decay_by_name, decay_own, vibration_by_path, thrown = {}, {}, {}, {}, {}
    for o, tt, cls in w.behaviours({"Door", "Upkeep", "DeployableDecay", "BuildingGradeDecay"} | EXPLOSIVE_CLASSES | THROWER_CLASSES):
        name = w.go_name(o, tt)
        if cls == "Door" and name.startswith("assets/"):
            by_path.setdefault(name, {})["door"] = {"lock": bool(tt["canTakeLock"]), "closer": bool(tt["canTakeCloser"]),
                                                    "knocker": bool(tt["canTakeKnocker"]), "hatch": bool(tt["hasHatch"])}
        elif cls == "Upkeep" and name.startswith("assets/"):
            by_path.setdefault(name, {})["upkeep"] = tt["upkeepMultiplier"] > 0
        elif cls in ("DeployableDecay", "BuildingGradeDecay") and not name.startswith("assets/"):
            # Manda el del prefab mismo (la raíz es el GameObject). Si sólo hay copias dentro de un monumento (el horno de
            # los departamentos), vale la copia: es el mismo prefab colocado.
            own = w.root_name(o, tt) == name
            if name in decay_by_name and (decay_own[name] or not own):
                continue
            if cls == "BuildingGradeDecay":
                decay_by_name[name] = {"delay": 0, "duration": DECAY_GRADE_HOURS[tt["decayGrade"]]}
            else:
                decay_by_name[name] = {"delay": number(tt["decayDelay"]), "duration": number(tt["decayDuration"])}
            decay_own[name] = own
        elif cls in EXPLOSIVE_CLASSES and name.startswith("assets/"):
            vibration_by_path[name] = tt.get("vibrationLevel", 0)
        elif cls in THROWER_CLASSES and name.startswith("assets/") and tt.get("prefabToThrow", {}).get("guid"):
            thrown[name] = paths.get(tt["prefabToThrow"]["guid"])
    items, vibration = {}, {}
    for sid, p in sorted(prefabs.items()):
        deploy = p.get("deploy")
        if deploy:
            short = deploy.rsplit("/", 1)[-1].removesuffix(".prefab")
            got = {"door": by_path.get(deploy, {}).get("door"), "upkeep": by_path.get(deploy, {}).get("upkeep", False),
                   "decay": decay_by_name.get(short)}
            if got["door"] or got["upkeep"] or got["decay"]:
                items[sid] = got
        for path in (p.get("projectile"), thrown.get(p.get("entity")), deploy):
            level = vibration_by_path.get(path)
            if level:
                vibration[sid] = level
                break
    return {"items": items, "vibration": vibration}
```

3c. En `collect()`, agregar `deployables = collect_deployables(w)` antes de `w.report_unresolved()` y sumarlo al diccionario que devuelve (`"deployables": deployables`). En `main()`, sumar `"deployables"` a la tupla de archivos que se escriben, y al `print` final `; construcción: {len(got['deployables']['items'])} objetos`.

3d. En el docstring del módulo, agregar `games/rust/data/deployables.json` (puertas, mantenimiento, desgaste y vibración).

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS. (Al relevar, este código dio exactamente los valores de los tests: puerta de chapa, blindada y de garaje, caja grande 5/8 h, horno y caja de madera 48/96 h, sacos 0/0,25 h, C4 3, satchel 2, granada 1.)

- [ ] **Step 5: Escribir los datos**

Run: `python games/rust/tools/world.py`
Expected: `construcción: 81 objetos` (medido al relevar: los que tienen puerta, mantenimiento o desgaste) y 16 explosivos con vibración. **No correr `site_data.py`.**

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/world.py games/rust/tools/tests/test_world.py games/rust/data/deployables.json
git commit -m "feat(rust): qué se le pone a cada puerta, quién paga mantenimiento, cuánto tarda en romperse y qué detecta el sensor sísmico" -m "Los prefabs se encuentran por el guid del GameManifest. El desgaste sólo está en el cliente para 90 objetos: el resto queda sin dato en vez de inventarlo."
```

---

### Task A7: Las skins con nombre e ícono (`skins.py`)

**Files:**
- Create: `games/rust/tools/skins.py`
- Create: `games/rust/tools/tests/test_skins.py`
- Modify: `games/rust/README.md`
- Create: `games/rust/data/skins.json`, `site/public/rust/skins/*.webp`

**Interfaces:**
- Produces `skins.json`: `{"items": {shortname: [{"id": int, "name": {"en", "es"}, "icon": "skins/<id>" | "items/<shortname>" | null, "workshop": bool}]}}`, cada lista ordenada por nombre inglés. `icon` es la ruta debajo de `/rust/` sin `.webp`.
- Python: `wanted(classes)`, `read_skins(want, by_pid)`, `write_sprites(needed) -> set`, `collect(write_icons=True) -> dict`, `main()`.

Medido al relevar con este mismo código: 308 skins en 92 objetos, 4 sin ícono, 219 íconos propios (1,1 MB a 96 px), 162 s.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `games/rust/tools/tests/test_skins.py`:

```python
"""
Tests de `skins.py` (2026-10-05): las skins del juego con nombre oficial e ícono.

`collect(write_icons=False)` lee items.preload y content.bundle (~1 min) pero no los bundles de texturas; los íconos se
prueban contra lo que ya escribió `skins.py`.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402
import skins  # noqa: E402

HAVE_GAME = (extract.BUNDLES / "shared" / "content.bundle").exists()
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        _DATA = skins.collect(write_icons=False)
    return _DATA


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestSkinsInGame(unittest.TestCase):
    def test_las_del_ak(self):
        ak = {s["id"]: s for s in data()["items"]["rifle.ak"]}
        self.assertEqual(len(ak), 12)
        self.assertEqual(ak[10135]["name"], {"en": "Digital Camo AK47", "es": "AK47 con camuflaje digital"})
        self.assertTrue(ak[10135]["workshop"])
        self.assertEqual(ak[10135]["icon"], "skins/10135")
        # La AK de hielo es un objeto propio (redirect): usa su ícono.
        self.assertEqual(ak[13070]["icon"], "items/rifle.ak.ice")
        self.assertFalse(ak[13070]["workshop"])

    def test_cantidad_y_forma(self):
        total = sum(len(v) for v in data()["items"].values())
        self.assertGreater(total, 300)
        for sid, rows in data()["items"].items():
            names = [r["name"]["en"].lower() for r in rows]
            self.assertEqual(names, sorted(names), sid)
            for r in rows:
                self.assertTrue(r["name"]["en"], (sid, r["id"]))


SKINS_JSON = extract.DATA / "skins.json"


@unittest.skipUnless(SKINS_JSON.exists(), "sin skins.json (correr skins.py)")
class TestSkinIcons(unittest.TestCase):
    def test_cada_icono_existe(self):
        doc = json.loads(SKINS_JSON.read_text(encoding="utf-8"))
        public = extract.ROOT / "site" / "public" / "rust"
        for sid, rows in doc["items"].items():
            for r in rows:
                if r["icon"]:
                    self.assertTrue((public / f"{r['icon']}.webp").exists(), (sid, r["icon"]))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: ERROR al importar (`No module named 'skins'`).

- [ ] **Step 3: Crear `games/rust/tools/skins.py`**

```python
"""
Las skins de cada objeto de Rust (2026-10-05): las que trae el juego, con su nombre oficial en/es y su ícono. Plan:
docs/superpowers/plans/2026-10-05-rust-objetos-2b.md (Task A7).

De dónde sale cada cosa:
  - qué skins tiene un objeto: `ItemDefinition.skins` (items.preload.bundle), con el `id` de Steam y la ruta del asset;
  - el resto, del `ItemSkin` de content.bundle con ese nombre: `displayName.token` da el nombre en engine.json,
    `workshopID` dice si vino del workshop, `Redirect` apunta al objeto que la representa (la AK de hielo es
    `rifle.ak.ice`) e `icon` es un `Sprite` de 256 px en alguno de los `Bundles/shared/textures.N.bundle`;
  - el ícono: el del objeto al que redirige, si ya existe (`site/public/rust/items/<shortname>.webp`, lo escribe
    extract.py); si no, el `Sprite` achicado a `SKIN_ICON_SIZE`.
Las skins de workshop que el juego no trae (las que se compran en el mercado de Steam) no están.

Escribe:
  - `games/rust/data/skins.json`: {"items": {shortname: [{"id", "name": {"en", "es"}, "icon", "workshop"}]}};
  - `site/public/rust/skins/<id>.webp`.

Uso, desde la raíz del repo y después de extract.py (~3 min: content.bundle y cinco bundles de texturas):
    python games/rust/tools/skins.py
"""
import json
import sys
from pathlib import Path

import UnityPy
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import BUNDLES, DATA, ROOT, load_classes, text_of  # noqa: E402

SKIN_ICONS = ROOT / "site" / "public" / "rust" / "skins"
ITEM_ICONS = ROOT / "site" / "public" / "rust" / "items"
# La ficha las muestra en casilleros de 64 px: 96 alcanza para pantallas de doble densidad sin pesar como las de 128.
SKIN_ICON_SIZE = 96


def wanted(classes):
    """
    {nombre del asset: (id de la skin, shortname del objeto)} de los objetos visibles, y {path_id: shortname} de todos los
    `ItemDefinition` (para seguir los `Redirect`). El nombre del asset es el final de la ruta sin `.asset`
    (`skin.ak47.digitalcamoak47.itemskin`), que es el `m_Name` del `ItemSkin`.
    """
    want, by_pid = {}, {}
    for pid, d in classes["ItemDefinition"]:
        by_pid[pid] = d["shortname"]
        if d["hidden"]:
            continue
        for s in d["skins"]:
            name = s["name"].rsplit("/", 1)[-1].removesuffix(".asset")
            want.setdefault(name, (s["id"], d["shortname"]))
    return want, by_pid


def read_skins(want, by_pid):
    """
    Los `ItemSkin` pedidos, leídos de content.bundle por nombre (`peek_name`, sin leer el typetree de los demás). Cada
    uno: {"id", "sid", "name", "workshop", "redirect", "icon": (archivo CAB, path_id) | None}.
    """
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    texts = {lang: json.loads(env.container[f"assets/localization/{folder}/engine.json"].read().m_Script)
             for lang, folder in (("en", "en"), ("es", "es-es"))}
    out = []
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        name = o.peek_name()
        if name not in want:
            continue
        tt = o.read_typetree()
        skin_id, sid = want[name]
        if tt.get("id") != skin_id:
            continue  # otro MonoBehaviour con el mismo nombre
        token = tt["displayName"]["token"]
        icon = None
        ref = tt["icon"]
        if ref["m_PathID"] and ref["m_FileID"] > 0:
            icon = (o.assets_file.externals[ref["m_FileID"] - 1].path.split("/")[-1], ref["m_PathID"])
        redirect = by_pid.get(tt["Redirect"]["m_PathID"]) if tt["Redirect"]["m_PathID"] else None
        out.append({
            "id": skin_id, "sid": sid,
            "name": {"en": text_of(texts, "en", token) or tt["displayName"]["legacyEnglish"].strip(),
                     "es": text_of(texts, "es", token) or None},
            "workshop": bool(tt["workshopID"]), "redirect": redirect, "icon": icon,
        })
    return out


def write_sprites(needed):
    """
    Guarda los íconos de `needed` ({(archivo CAB, path_id): id de la skin}) como webp. Recorre los bundles de texturas
    compartidos de a uno (cargarlos juntos no entra en memoria) y devuelve los ids que quedaron escritos. Uno que ya
    existe no se rehace.
    """
    SKIN_ICONS.mkdir(parents=True, exist_ok=True)
    done, by_cab = set(), {}
    for (cab, pid), skin_id in needed.items():
        by_cab.setdefault(cab, {})[pid] = skin_id
    for bundle in sorted((BUNDLES / "shared").glob("textures.*.bundle")):
        env = UnityPy.load(str(bundle))
        cabs = {name for f in env.files.values() for name in getattr(f, "files", {})} & set(by_cab)
        if not cabs:
            continue
        for o in env.objects:
            cab = o.assets_file.name
            if cab in cabs and o.path_id in by_cab[cab] and o.type.name == "Sprite":
                skin_id = by_cab[cab][o.path_id]
                dst = SKIN_ICONS / f"{skin_id}.webp"
                if not dst.exists():
                    im = o.read().image.convert("RGBA")
                    im.thumbnail((SKIN_ICON_SIZE, SKIN_ICON_SIZE), Image.LANCZOS)
                    im.save(dst, "WEBP", quality=82, method=6)
                done.add(skin_id)
    return done


def collect(write_icons=True):
    """Lee el juego y devuelve `{"items": {...}}`, la forma de `skins.json`. Con `write_icons` escribe también los íconos."""
    want, by_pid = wanted(load_classes(BUNDLES / "shared" / "items.preload.bundle"))
    skins = read_skins(want, by_pid)
    missing = len(want) - len(skins)
    if missing:
        print(f"[rust] {missing} skins sin ItemSkin en content.bundle: quedan afuera", file=sys.stderr)
    needed = {}
    for s in skins:
        if s["redirect"] and (ITEM_ICONS / f"{s['redirect']}.webp").exists():
            s["path"] = f"items/{s['redirect']}"
        elif s["icon"]:
            needed[s["icon"]] = s["id"]
            s["path"] = f"skins/{s['id']}"
        else:
            s["path"] = None
    done = write_sprites(needed) if write_icons else {s["id"] for s in skins}
    items = {}
    for s in skins:
        icon = s["path"] if s["path"] and (s["path"].startswith("items/") or s["id"] in done) else None
        items.setdefault(s["sid"], []).append({"id": s["id"], "name": s["name"], "icon": icon, "workshop": s["workshop"]})
    for rows in items.values():
        rows.sort(key=lambda r: (r["name"]["en"].lower(), r["id"]))
    return {"items": dict(sorted(items.items()))}


def main():
    got = collect()
    (DATA / "skins.json").write_text(json.dumps(got, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(v) for v in got["items"].values())
    without = sum(1 for v in got["items"].values() for s in v if not s["icon"])
    print(f"[rust] skins: {n} en {len(got['items'])} objetos; {without} sin ícono")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS (`TestSkinIcons` se saltea: todavía no hay `skins.json`).

- [ ] **Step 5: Escribir los datos y los íconos**

Run: `python games/rust/tools/skins.py`
Expected: `[rust] skins: 308 en 92 objetos; 4 sin ícono` (o cerca) y ~219 archivos en `site/public/rust/skins/` (~1,1 MB). Volver a correr los tests: `TestSkinIcons` pasa.

- [ ] **Step 6: README**

En `games/rust/README.md`, en "En cada actualización", agregar después del paso de `extract.py`:

```markdown
3. `python games/rust/tools/skins.py` (las skins del juego con su ícono; ~3 min, después de `extract.py` porque usa sus
   íconos para las skins que son un objeto propio).
```

y renumerar los pasos que siguen. En el paso de commitear, sumar `site/public/rust/skins`.

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/skins.py games/rust/tools/tests/test_skins.py games/rust/README.md games/rust/data/skins.json site/public/rust/skins
git commit -m "feat(rust): las skins que trae el juego, con su nombre oficial y su ícono" -m "Salen de ItemDefinition.skins y de cada ItemSkin de content.bundle; el ícono es el Sprite de los bundles de texturas, o el del objeto si la skin es un objeto propio (la AK de hielo). Las de workshop que se compran en Steam no están en el juego."
```

---

# Plan 2b-B — sitio (no necesita el juego)

Estas tareas sólo leen `games/rust/data/*.json`. Cada una corre `python games/rust/tools/site_data.py` y deja verdes los tests de Python y los de `site/test/rust*.test.ts`.

### Task B1: La cuenta del reciclador corregida (sin datos nuevos) — VA PRIMERO

**Files:**
- Modify: `site/src/rust/items/recycle.ts`
- Modify: `site/src/rust/items/ItemFicha.tsx`
- Modify: `site/src/rustCopy.ts`
- Modify: `site/test/rustRecycle.test.ts`, `site/test/rustItems.test.ts`

**Interfaces:**
- Produces:
  - `recycleYield(amount, eff): { n: number; pct: number }` (`n` seguros, `pct` % de chance de uno más, para abajo);
  - `recycleScrap(scrap, eff): number` (`scrap × eff ÷ 0,5`, sin redondear);
  - copia: `items.pct(p)` y `items.recycleNote`.
- Se borra el tipo `{ kind: "fixed" | "chance" }`.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `site/test/rustRecycle.test.ts` entero por:

```ts
import { describe, expect, it } from "vitest";
import { recycleScrap, recycleYield } from "../src/rust/items/recycle";

/**
 * La cuenta del reciclador (Recycler.RecycleThink): lo entero sale seguro y la parte decimal es la chance de uno más; la
 * chatarra fija se escala con la eficiencia. Los números son los de rusthelp.com (2026-10-05).
 */
describe("lo que da el reciclador", () => {
  it("la munición de escopeta de 40 mm (7,5 de pólvora y 2 fragmentos por unidad) en las cuatro recicladoras", () => {
    expect(recycleYield(7.5, 0.5)).toEqual({ n: 3, pct: 75 });
    expect(recycleYield(2, 0.5)).toEqual({ n: 1, pct: 0 });
    expect(recycleYield(7.5, 0.4)).toEqual({ n: 3, pct: 0 });
    expect(recycleYield(2, 0.4)).toEqual({ n: 0, pct: 80 });
    expect(recycleYield(7.5, 0.75)).toEqual({ n: 5, pct: 62 });
    expect(recycleYield(2, 0.75)).toEqual({ n: 1, pct: 50 });
    expect(recycleYield(7.5, 0.6)).toEqual({ n: 4, pct: 50 });
    expect(recycleYield(2, 0.6)).toEqual({ n: 1, pct: 20 });
  });

  it("los engranajes: 25 fragmentos", () => {
    expect(recycleYield(25, 0.75)).toEqual({ n: 18, pct: 75 });
    expect(recycleYield(25, 0.6)).toEqual({ n: 15, pct: 0 });
    expect(recycleYield(25, 0.5)).toEqual({ n: 12, pct: 50 });
    expect(recycleYield(25, 0.4)).toEqual({ n: 10, pct: 0 });
  });

  it("la chatarra fija se escala con la eficiencia", () => {
    expect([0.75, 0.6, 0.5, 0.4].map((e) => recycleScrap(10, e))).toEqual([15, 12, 10, 8]);
    expect(recycleScrap(7, 0.4)).toBe(5.6);
  });
});
```

En `site/test/rustItems.test.ts`, reemplazar el test `"los engranajes: lo que da el reciclador en cada recicladora"` por:

```ts
  it("los engranajes: lo seguro y la chance de uno más, y la chatarra escalada", () => {
    const html = render("en", "/en/rust/items/gears");
    expect(html).toContain("Recycling");
    // Recicladora de monumento (50 %): 12 fragmentos + 50 % y 10 de chatarra; zona segura (40 %): 10 y 8.
    expect(html).toContain("× 12 + 50%");
    expect(html).toContain("× 10");
    expect(html).toContain("× 8");
    expect(html).not.toContain(">13<");
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustRecycle.test.ts test/rustItems.test.ts`
Expected: FAIL (`recycleScrap` no existe; la ficha muestra 13).

- [ ] **Step 3: `recycle.ts`**

Reemplazar `site/src/rust/items/recycle.ts` entero por:

```ts
/**
 * Lo que da el reciclador de Rust por cada objeto (2026-10-05), como `Recycler.RecycleThink` del juego:
 * - cada ingrediente da `cantidad × eficiencia`: la parte entera sale segura y la parte decimal es la chance de que salga
 *   uno más (la munición de 40 mm trae 7,5 de pólvora: en la verde, al 50 %, da 3 seguros y 75 % de uno más);
 * - la chatarra fija de la receta (`scrapFromRecycle`) se escala con `eficiencia ÷ 0,5`, y lo que no llega a una unidad
 *   se acumula entre tandas: en promedio da exactamente la cuenta, y así se muestra.
 * `amount` es por objeto y al 100 % (lo escribe `extract.py`). Antes se redondeaba para arriba: daba 13 fragmentos por
 * engranaje donde el juego da 12 y una moneda al aire.
 */
export interface RecycleYield {
  /** Lo que sale seguro. */
  n: number;
  /** La probabilidad, en %, de que salga uno más (0 si no hay). */
  pct: number;
}

/** Sin el ruido de la coma flotante: 7,5 × 0,4 tiene que dar 3, no 2,9999. */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

export function recycleYield(amount: number, eff: number): RecycleYield {
  const x = clean(amount * eff);
  const n = Math.floor(x);
  // Para abajo, como las wikis: 0,625 es 62 %, no 63 %.
  return { n, pct: Math.floor(clean((x - n) * 100)) };
}

/** La chatarra fija que da reciclar un objeto, en promedio: `scrapFromRecycle × eficiencia ÷ 0,5`. */
export function recycleScrap(scrap: number, eff: number): number {
  return clean((scrap * eff) / 0.5);
}
```

- [ ] **Step 4: Los textos**

En `site/src/rustCopy.ts`:
- en la interfaz `items`, debajo de `chance: (pct: number) => string;`, agregar:

```ts
    /** Un porcentaje con el espacio del idioma ("50%" / "50 %"). */
    pct: (p: number) => string;
    recycleNote: string;
```

- en `EN.items`, debajo de `chance`:

```ts
    pct: (p) => `${p}%`,
    recycleNote: "“+ 50%” is the chance of getting one more. For an item at full condition: a worn one gives less.",
```

- en `ES.items`, debajo de `chance`:

```ts
    pct: (p) => `${p} %`,
    recycleNote: "“+ 50 %” es la chance de que salga uno más. Con el objeto entero: uno gastado da menos.",
```

- [ ] **Step 5: La ficha**

En `site/src/rust/items/ItemFicha.tsx`:
- cambiar `import { recycleYield } from "./recycle";` por `import { recycleScrap, recycleYield, type RecycleYield } from "./recycle";`;
- debajo de `const num = (n: number) => n.toLocaleString(locale);`, agregar:

```tsx
  // "× 3 + 75 %": lo seguro y la chance de uno más; "75 % de chance" si no hay nada seguro.
  const yieldText = (y: RecycleYield) =>
    y.n === 0 ? (y.pct ? t.chance(y.pct) : "—") : y.pct ? `× ${num(y.n)} + ${t.pct(y.pct)}` : `× ${num(y.n)}`;
```

- en la fila de la chatarra, cambiar `<td>{num(r.scrap)}</td>\n                  <td>{num(r.scrap)}</td>` por:

```tsx
                  {[r.eff.monument, r.eff.safezone].map((eff, i) => (
                    <td key={i}>{`× ${num(recycleScrap(r.scrap, eff))}`}</td>
                  ))}
```

- en las filas de cada ingrediente, cambiar `return <td key={i}>{y.kind === "fixed" ? num(y.n) : t.chance(y.pct)}</td>;` por `return <td key={i}>{yieldText(y)}</td>;`;
- después del `</table>` de la sección de reciclaje, agregar `<p className="rs-ficha-note">{t.recycleNote}</p>`.

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustRecycle.test.ts test/rustItems.test.ts test/rustItemsData.test.ts`
Expected: PASS. `npx tsc --noEmit -p .` sin errores nuevos.

- [ ] **Step 7: Ver en localhost**

Abrir `http://localhost:5179/es/rust/objetos/engranajes` y `/es/rust/objetos/municion-de-escopeta-de-40-mm` (o el slug que tenga: buscarlo en la lista). Engranajes: "× 12 + 50 %" y "× 10" en la de monumento, "× 10" y "× 8" en la de zona segura. A 375 px, la tabla entra sin scroll.

- [ ] **Step 8: Commit**

```bash
git add site/src/rust/items/recycle.ts site/src/rust/items/ItemFicha.tsx site/src/rustCopy.ts site/test/rustRecycle.test.ts site/test/rustItems.test.ts
git commit -m "fix(rust): el reciclador da lo entero seguro y la parte decimal como chance, no redondeado para arriba" -m "Un engranaje da 12 fragmentos y 50 % de uno más en la recicladora de monumento, no 13, y la chatarra fija se escala con la eficiencia (8 en la de zona segura, no 10). Es lo que hace Recycler.RecycleThink y lo que muestra rusthelp."
```

---

### Task B2: Las cuatro recicladoras en la ficha

Necesita A1 (`items.json` con `recyclers` en lista).

**Files:**
- Create: `site/src/rust/items/parts.tsx`
- Create: `site/src/rust/items/FichaRecycle.tsx`
- Modify: `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rustCopy.ts`, `site/src/styles/rust-items.css`
- Modify: `games/rust/tools/tests/test_site_data.py` (los datos sintéticos)
- Modify: `site/test/rustItems.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Consumes: `items.json` → `recyclers: [{key, eff}]` (A1). `site_data.py` ya la pasa tal cual a `ficha.recycle.eff`: no cambia su código.
- Produces:
  - `data.ts`: `type RecyclerKey = "red" | "green_power" | "green" | "yellow"`, `interface Recycler { key: RecyclerKey; eff: number }`, `Ficha.recycle.eff: Recycler[]`;
  - `parts.tsx`: `Icon({ id, size })`, `RefLink({ r, route, navigate, children })`, `type Nav`;
  - `FichaRecycle.tsx`: `default RecycleSection({ ficha, route, navigate })`;
  - copia: `items.recycler`, `items.recycleGives`, `items.recyclers: Record<RecyclerKey, string>`; se borran `recycleMonument` y `recycleSafe`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `games/rust/tools/tests/test_site_data.py`, en `DOC`, cambiar `"recyclers": {"monument": 0.5, "safezone": 0.4},` por:

```python
    "recyclers": [{"key": "red", "eff": 0.75}, {"key": "green_power", "eff": 0.6}, {"key": "green", "eff": 0.5}, {"key": "yellow", "eff": 0.4}],
```

y en `test_reciclaje_con_las_eficiencias`, cambiar la aserción por `self.assertEqual([e["key"] for e in rec["eff"]], ["red", "green_power", "green", "yellow"])`.

1b. En `site/test/rustItems.test.ts`:
- en el test del AK, cambiar `expect(html).toContain("Investigar: 500 de chatarra");` por `expect(html).toContain("Investigar: 120 de chatarra");`;
- reemplazar el test de los engranajes (el de B1) por:

```ts
  it("los engranajes en las cuatro recicladoras, una fila por recicladora", () => {
    const html = render("en", "/en/rust/items/gears");
    expect(html).toContain("Red (Power Plant)");
    expect(html).toContain("Green, powered");
    expect(html).toContain("Yellow (safe zone)");
    // Roja 18 + 75 % y 15 de chatarra; verde con electricidad 15 y 12; verde 12 + 50 % y 10; amarilla 10 y 8.
    for (const s of ["× 18 + 75%", "× 15", "× 12 + 50%", "× 12", "× 10", "× 8"]) expect(html).toContain(s);
    expect(render("es", "/es/rust/objetos/engranajes")).toContain("Verde con electricidad");
  });
```

y agregar `await preloadTab(parseRoute("/es/rust/objetos/engranajes"));` al `beforeAll`.

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → PASS (site_data no cambia; el test sólo cambia la forma de los datos sintéticos).
Run (desde `site/`): `npx vitest run test/rustItems.test.ts` → FAIL ("Investigar: 500" sigue en los archivos viejos y no hay "Red (Power Plant)").

- [ ] **Step 3: Regenerar los archivos del sitio**

Run: `python games/rust/tools/site_data.py`
Expected: `[rust] sitio: 1032 fichas en 32 archivos`. Desde acá, `ficha.recycle.eff` es la lista de cuatro: la ficha vieja deja de compilar hasta el Step 6.

- [ ] **Step 4: `data.ts` y `parts.tsx`**

4a. En `site/src/rust/items/data.ts`, debajo de `export interface ListRow {…}`, agregar:

```ts
/** Las cuatro recicladoras, de la que más rinde a la que menos (`RECYCLERS` de extract.py). */
export type RecyclerKey = "red" | "green_power" | "green" | "yellow";
export interface Recycler {
  key: RecyclerKey;
  eff: number;
}
```

y en `Ficha`, cambiar la línea de `recycle` por:

```ts
  recycle: { scrap: number; out: (Ref & { amount: number })[]; eff: Recycler[] } | null;
```

4b. Crear `site/src/rust/items/parts.tsx`:

```tsx
/**
 * Piezas chicas que comparten las secciones de la ficha de Rust (2026-10-05): el ícono de un objeto y el enlace a otra
 * ficha. Nacieron dentro de `ItemFicha.tsx` y salieron cuando la ficha se partió en secciones.
 */
import type { ReactNode } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import type { Ref } from "./data";

export type Nav = (r: Route) => void;

/** El ícono de un objeto. El texto alternativo va vacío: al lado siempre está el nombre. */
export function Icon({ id, size = 40 }: { id: string; size?: number }) {
  return <img src={`/rust/items/${id}.webp`} alt="" width={size} height={size} />;
}

/** Un enlace a la ficha de otro objeto, o el nombre suelto si no tiene ficha (una skin, un objeto oculto). */
export function RefLink({ r, route, navigate, children }: { r: Ref; route: Route; navigate: Nav; children: ReactNode }) {
  return r.slug ? (
    <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate}>
      {children}
    </RouteLink>
  ) : (
    <span className="rs-ref">{children}</span>
  );
}
```

- [ ] **Step 5: `FichaRecycle.tsx`**

Crear `site/src/rust/items/FichaRecycle.tsx`:

```tsx
/**
 * El reciclaje de un objeto de Rust en las cuatro recicladoras (2026-10-05). Una fila por recicladora y no una columna:
 * cuatro columnas de "× 12 + 50 %" no entran a 375 px sin scroll. En cada fila, lo que sale seguro y la chance de uno
 * más (`recycle.ts`), con la chatarra fija escalada.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha, type Ref } from "./data";
import { Icon, RefLink, type Nav } from "./parts";
import { recycleScrap, recycleYield, type RecycleYield } from "./recycle";

/** La chatarra no viene en `recycle.out` (se escala distinto): se nombra a mano, con su ficha. */
const SCRAP: Ref = { id: "scrap", slug: "scrap", name: { en: "Scrap", es: "Chatarra" } };

export default function RecycleSection({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const r = ficha.recycle;
  if (!r) return null;
  const yieldText = (y: RecycleYield) =>
    y.n === 0 ? t.chance(y.pct) : y.pct ? `× ${num(y.n)} + ${t.pct(y.pct)}` : `× ${num(y.n)}`;
  const chip = (ref: Ref, text: string) => (
    <RefLink r={ref} route={route} navigate={navigate}>
      <Icon id={ref.id} size={28} />
      <span>{say(ref.name, lang)}</span>
      <b>{text}</b>
    </RefLink>
  );
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.recycle}</h2>
      <table className="rs-table rs-recycle">
        <thead>
          <tr>
            <th scope="col">{t.recycler}</th>
            <th scope="col">{t.recycleGives}</th>
          </tr>
        </thead>
        <tbody>
          {r.eff.map(({ key, eff }) => (
            <tr key={key}>
              <th scope="row">
                {t.recyclers[key]} <span className="rs-dim">{t.pct(Math.round(eff * 100))}</span>
              </th>
              <td>
                <ul className="rs-yields">
                  {r.scrap > 0 && <li>{chip(SCRAP, `× ${num(recycleScrap(r.scrap, eff))}`)}</li>}
                  {r.out.map((o) => {
                    const y = recycleYield(o.amount, eff);
                    return y.n || y.pct ? <li key={o.id}>{chip(o, yieldText(y))}</li> : null;
                  })}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rs-ficha-note">{t.recycleNote}</p>
    </section>
  );
}
```

- [ ] **Step 6: La ficha y los textos**

6a. En `ItemFicha.tsx`:
- borrar la sección `{r && (<section className="rs-pnl">…{t.recycle}…</section>)}` entera y poner en su lugar `<RecycleSection ficha={ficha} route={route} navigate={navigate} />`;
- borrar `const r = ficha.recycle;`, `yieldText` y el import de `./recycle`;
- agregar `import RecycleSection from "./FichaRecycle";`.

6b. En `rustCopy.ts`:
- en la interfaz, borrar `recycleMonument: string;` y `recycleSafe: string;`, cambiar el import a `import type { RecyclerKey } from "./rust/items/data";` (aparte del de `./route`) y agregar debajo de `recycle: string;`:

```ts
    recycler: string;
    recycleGives: string;
    recyclers: Record<RecyclerKey, string>;
```

- en `EN.items`, reemplazar `recycleMonument` y `recycleSafe` por:

```ts
    recycler: "Recycler",
    recycleGives: "Gives",
    recyclers: { red: "Red (Power Plant)", green_power: "Green, powered", green: "Green", yellow: "Yellow (safe zone)" },
```

- en `ES.items`:

```ts
    recycler: "Recicladora",
    recycleGives: "Da",
    recyclers: { red: "Roja (planta de energía)", green_power: "Verde con electricidad", green: "Verde", yellow: "Amarilla (zona segura)" },
```

- cambiar `recycleNote` en los dos idiomas:
  - EN: `"“+ 50%” is the chance of getting one more. For an item at full condition: a worn one gives less. The green recycler gives more while the monument's power grid is on, and the red one only works with it."`
  - ES: `"“+ 50 %” es la chance de que salga uno más. Con el objeto entero: uno gastado da menos. La verde rinde más mientras el monumento tiene la red eléctrica prendida, y la roja sólo anda con ella."`

6c. En `site/src/styles/rust-items.css`, después de la regla `.rs-table td { white-space: nowrap; }`, agregar:

```css
/* El reciclaje va en filas por recicladora: lo que da se acomoda en renglones en vez de estirar la tabla. */
.rs-recycle td { white-space: normal; }
.rs-yields { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
.rs-yields .rs-ref { display: inline-flex; flex-wrap: wrap; gap: 2px 6px; align-items: center; }
.rs-yields b { font-weight: 700; white-space: nowrap; }
.rs-dim { color: var(--rs-dim); }
```

- [ ] **Step 7: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v` → PASS.
Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` sin errores nuevos.

- [ ] **Step 8: Ver en localhost**

`/es/rust/objetos/engranajes`, `/es/rust/objetos/fusil-de-asalto` y `/es/rust/objetos/carga-explosiva-con-temporizador` a 375 px y en escritorio: cuatro filas, sin scroll horizontal, nombres que no se cortan; "Investigar: 120 de chatarra" en el AK.

- [ ] **Step 9: Commit**

```bash
git add site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts games/rust/tools/tests/test_site_data.py games/rust/data/site
git commit -m "feat(rust): el reciclaje en las cuatro recicladoras, una fila por recicladora" -m "Roja, verde con electricidad, verde y amarilla, cada una con lo seguro y la chance de uno más. En filas porque cuatro columnas no entran a 375 px. De paso entra la investigación corregida de A1 (AK 120)."
```

---

### Task B3: "Se obtiene reciclando"

**Files:**
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/FichaRecycle.tsx`, `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rustCopy.ts`
- Modify: `site/test/rustItems.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Produces:
  - ficha: `"recycledFrom": {"eff": [{key, eff}], "rows": [{...Ref, "amount": n, "scrap": bool}]} | null`, filas de lo que más da a lo que menos (por unidad y al 100 %);
  - `site_data.recycled_from(items, ref) -> dict[sid, list]`;
  - `FichaRecycle.tsx`: `export function RecycledFrom({ ficha, route, navigate })`, que muestra las primeras `RECYCLED_FIRST` (20) y un botón para ver todas;
  - copia: `items.recycledFrom`, `items.recycledItem`, `items.showAll(n)`.
- Peso medido al relevar: con las referencias completas (slug y nombre en/es), el archivo más grande pasa de 14,5 a ~24 KB con gzip (el de los fragmentos de metal, 334 filas). Se acepta: B8 pone el tope.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, en `TestBuild`, agregar:

```python
    def test_se_obtiene_reciclando(self):
        wood = self.fichas["wood"]["recycledFrom"]
        self.assertEqual(wood["rows"], [{"id": "rifle.ak", "slug": "assault-rifle", "name": {"en": "Assault Rifle", "es": "Fusil de asalto"}, "amount": 200, "scrap": False}])
        self.assertEqual([e["key"] for e in wood["eff"]], ["red", "green_power", "green", "yellow"])
        self.assertIsNone(self.fichas["assault-rifle"]["recycledFrom"])
```

y en `TestBuildReal`, al final del test:

```python
        mf = out["fichas"]["metal-fragments"]["recycledFrom"]["rows"]
        self.assertGreater(len(mf), 300)
        self.assertEqual(mf[0]["id"], "workbench3")  # 1.000 fragmentos por unidad, el que más da
```

1b. En `site/test/rustItems.test.ts`, agregar `await preloadTab(parseRoute("/en/rust/items/metal-fragments"));` al `beforeAll` y el test:

```ts
  it("los fragmentos de metal: qué los da al reciclarlo, los primeros 20 y el botón para ver todos", () => {
    const html = render("en", "/en/rust/items/metal-fragments");
    expect(html).toContain("Recycled from");
    expect(html).toContain('href="/en/rust/items/garage-door"');
    expect(html).toContain("Show all");
    // La puerta de garaje da 300 por unidad: 150 en la verde, 120 en la amarilla.
    expect(html).toContain("× 150");
    expect(html).toContain("× 120");
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → ERROR (`KeyError: 'recycledFrom'`).

- [ ] **Step 3: `site_data.py`**

3a. Arriba de `build`, agregar:

```python
def recycled_from(items, ref):
    """
    La inversa del reciclaje: por cada objeto, qué otros lo dan al reciclarlos y cuánto por unidad al 100 % (la chatarra
    fija va con `scrap: True`, porque el sitio la escala distinto). De lo que más da a lo que menos.
    """
    out = {}
    for i in items:
        rec = i.get("recycle")
        if not i["slug"] or not rec:
            continue
        for o in rec["out"]:
            out.setdefault(o["id"], []).append({**ref(i["id"]), "amount": o["amount"], "scrap": False})
        if rec["scrap"]:
            out.setdefault("scrap", []).append({**ref(i["id"]), "amount": rec["scrap"], "scrap": True})
    for rows in out.values():
        rows.sort(key=lambda r: (-r["amount"], r["name"]["en"].lower(), r["id"]))
    return out
```

3b. En `build`, después de `used_in = {}` y su `for`, agregar `recycled = recycled_from(items, ref)`, y en el diccionario de cada ficha, después de `"recycle": recycle,`:

```python
            "recycledFrom": {"eff": items_doc["recyclers"], "rows": recycled[i["id"]]} if i["id"] in recycled else None,
```

- [ ] **Step 4: Regenerar y correr los tests de Python**

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS.

- [ ] **Step 5: El sitio**

5a. En `data.ts`, en `Ficha`, debajo de `recycle`:

```ts
  recycledFrom: { eff: Recycler[]; rows: (Ref & { amount: number; scrap: boolean })[] } | null;
```

5b. En `FichaRecycle.tsx`, agregar `import { useState } from "react";` arriba y, al final del archivo:

```tsx
/** Cuántas filas de "se obtiene reciclando" se ven de entrada: los fragmentos de metal tienen más de 300. */
export const RECYCLED_FIRST = 20;
/** Las dos recicladoras de esta tabla: las que más se usan (la de monumento y la de zona segura). */
const FROM_KEYS = ["green", "yellow"] as const;

/** Qué objetos dan éste al reciclarlos, con lo que da cada uno en la verde y en la amarilla. */
export function RecycledFrom({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const rf = ficha.recycledFrom;
  if (!rf) return null;
  const num = (n: number) => n.toLocaleString(locale);
  const cols = FROM_KEYS.map((k) => rf.eff.find((e) => e.key === k)).filter((e): e is NonNullable<typeof e> => !!e);
  const cell = (amount: number, scrap: boolean, eff: number) => {
    if (scrap) return `× ${num(recycleScrap(amount, eff))}`;
    const y = recycleYield(amount, eff);
    return y.n === 0 ? (y.pct ? t.chance(y.pct) : "—") : y.pct ? `× ${num(y.n)} + ${t.pct(y.pct)}` : `× ${num(y.n)}`;
  };
  const rows = all ? rf.rows : rf.rows.slice(0, RECYCLED_FIRST);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.recycledFrom}</h2>
      <table className="rs-table">
        <thead>
          <tr>
            <th scope="col">{t.recycledItem}</th>
            {cols.map((c) => (
              <th scope="col" key={c.key}>
                {t.recyclers[c.key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">
                <RefLink r={r} route={route} navigate={navigate}>
                  <Icon id={r.id} size={28} />
                  <span>{say(r.name, lang)}</span>
                </RefLink>
              </th>
              {cols.map((c) => (
                <td key={c.key}>{cell(r.amount, r.scrap, c.eff)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!all && rf.rows.length > RECYCLED_FIRST && (
        <button type="button" className="rs-btn" onClick={() => setAll(true)}>
          {t.showAll(num(rf.rows.length))}
        </button>
      )}
    </section>
  );
}
```

5c. En `ItemFicha.tsx`, importar `RecycledFrom` (`import RecycleSection, { RecycledFrom } from "./FichaRecycle";`) y poner `<RecycledFrom ficha={ficha} route={route} navigate={navigate} />` justo después de `<RecycleSection …/>`.

5d. En `rustCopy.ts`, interfaz:

```ts
    recycledFrom: string;
    recycledItem: string;
    showAll: (n: string) => string;
```

EN: `recycledFrom: "Recycled from", recycledItem: "Item", showAll: (n) => \`Show all ${n}\`,`
ES: `recycledFrom: "Se obtiene reciclando", recycledItem: "Objeto", showAll: (n) => \`Ver los ${n}\`,`

5e. CSS: en `rust-items.css`, agregar `.rs-pnl > .rs-btn { margin-top: 10px; }`. La primera columna puede bajar de renglón: `.rs-table th[scope="row"] .rs-ref` ya es `inline-flex`; agregarle `flex-wrap: wrap;` para que un nombre largo no estire la tabla a 375 px.

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 7: Ver en localhost**

`/es/rust/objetos/fragmentos-de-metal` a 375 px: 20 filas, "Ver los 334", y al tocarlo la lista entera; sin scroll horizontal. `/es/rust/objetos/chatarra`: las filas de chatarra fija (martillo neumático 30 → 30 y 24).

- [ ] **Step 8: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts
git commit -m "feat(rust): se obtiene reciclando, la inversa del reciclaje en cada ficha" -m "Por cada objeto, cuáles lo dan al reciclarlos y cuánto en la recicladora verde y en la amarilla. Los fragmentos de metal tienen 334: se ven 20 y un botón muestra el resto."
```

---

### Task B4: Despawn, tiempo por banco, reparación y efectos en la ficha

Necesita A2.

**Files:**
- Create: `site/src/rust/items/format.ts`, `site/src/rust/items/FichaMore.tsx`, `site/test/rustFormat.test.ts`
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rustCopy.ts`
- Modify: `site/test/rustItems.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Produces:
  - ficha: `"despawn": segundos`, `"repair": {"cost": [Ref + amount], "bp", "loss"} | null`, `"use": {"effects", "mods", "spoil": {"hours", "into": Ref | null} | null} | null`;
  - `site_data.repair_of(i, ref)`, `site_data.use_of(i, ref)`;
  - `format.ts`: `formatDuration(seconds) -> string`, `craftTimes(time, workbench) -> {bench, seconds}[]`;
  - `FichaMore.tsx`: `RepairSection`, `UseSection`;
  - `data.ts`: `EffectStat`, `ModStat` y los campos nuevos de `Ficha`;
  - copia: `items.despawn`, `repair`, `repairMax`, `repairLoss(pct)`, `repairBp`, `use`, `stats`, `mods`, `modRow(value, duration)`, `overTime(t)`, `spoil(t)`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, en `TestBuild`, agregar:

```python
    def test_despawn_reparacion_y_efectos(self):
        doc = json.loads(json.dumps(DOC))
        ak = doc["items"][0]
        ak.update({"despawn": 3600, "repair": {"cost": [{"id": "wood", "amount": 40}], "bp": True, "loss": 0.2},
                   "use": {"effects": [{"stat": "health", "amount": 15, "time": 0}], "mods": [], "spoil": {"hours": 24, "into": "wood"}}})
        f = rust_site.build(doc, LOOT, SHOPS)["fichas"]["assault-rifle"]
        self.assertEqual(f["despawn"], 3600)
        self.assertEqual(f["repair"]["cost"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 40}])
        self.assertEqual((f["repair"]["bp"], f["repair"]["loss"]), (True, 0.2))
        self.assertEqual(f["use"]["spoil"], {"hours": 24, "into": {"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}}})
        self.assertIsNone(self.fichas["wood"]["repair"])
```

1b. Crear `site/test/rustFormat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { craftTimes, formatDuration } from "../src/rust/items/format";

describe("las cuentas chicas de la ficha de Rust", () => {
  it("formatDuration", () => {
    expect(formatDuration(30)).toBe("30 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(9000)).toBe("2 h 30 min");
    expect(formatDuration(900)).toBe("15 min");
  });

  it("el tiempo en cada banco: la mitad con un nivel más, un cuarto con dos o más (ItemCrafter)", () => {
    expect(craftTimes(30, 1)).toEqual([{ bench: 1, seconds: 30 }, { bench: 2, seconds: 15 }, { bench: 3, seconds: 7.5 }]);
    expect(craftTimes(30, 0)).toEqual([
      { bench: 0, seconds: 30 }, { bench: 1, seconds: 15 }, { bench: 2, seconds: 7.5 }, { bench: 3, seconds: 7.5 },
    ]);
    expect(craftTimes(45, 3)).toEqual([{ bench: 3, seconds: 45 }]);
  });
});
```

1c. En `site/test/rustItems.test.ts`, agregar al `beforeAll` `await preloadTab(parseRoute("/en/rust/items/hatchet"));` y `await preloadTab(parseRoute("/en/rust/items/medical-syringe"));`, y los tests:

```ts
  it("el AK: cuánto tarda en desaparecer, el tiempo en su banco y la reparación", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain("Desaparece del piso en");
    expect(html).toContain("1 h");
    expect(html).toContain("Banco de nivel 3: 45 s");
    expect(html).toContain("Reparación");
    expect(html).toContain("Cada reparación le saca 20 % de condición máxima");
    expect(html).toContain("Pide el plano");
  });

  it("el hacha: el tiempo en cada banco", () => {
    const html = render("en", "/en/rust/items/hatchet");
    for (const s of ["Workbench level 1: 30 s", "Workbench level 2: 15 s", "Workbench level 3: 7.5 s"]) expect(html).toContain(s);
  });

  it("la jeringa: lo que hace al usarla", () => {
    const html = render("en", "/en/rust/items/medical-syringe");
    expect(html).toContain("When used");
    expect(html).toContain("Health over time");
    expect(html).toContain("+20");
    expect(html).toContain("−10");
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → ERROR (`KeyError: 'despawn'`).
Run (desde `site/`): `npx vitest run test/rustFormat.test.ts test/rustItems.test.ts` → FAIL (no existe `format.ts`; no está "Desaparece del piso").

- [ ] **Step 3: `site_data.py`**

Arriba de `build`, agregar:

```python
def repair_of(i, ref):
    """La reparación en el banco, con cada ingrediente como referencia (para el ícono y el enlace)."""
    r = i.get("repair")
    if not r:
        return None
    return {"cost": [{**ref(c["id"]), "amount": c["amount"]} for c in r["cost"]], "bp": r["bp"], "loss": r["loss"]}


def use_of(i, ref):
    """Los efectos de usarlo o comerlo, con el objeto en el que se pudre como referencia."""
    u = i.get("use")
    if not u:
        return None
    spoil = u.get("spoil")
    if spoil:
        spoil = {"hours": spoil["hours"], "into": ref(spoil["into"]) if spoil.get("into") else None}
    return {"effects": u["effects"], "mods": u["mods"], "spoil": spoil}
```

y en el diccionario de cada ficha, después de `"condition": i["condition"],`:

```python
            "despawn": i.get("despawn"),
            "repair": repair_of(i, ref),
            "use": use_of(i, ref),
```

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS.

- [ ] **Step 4: `format.ts`**

Crear `site/src/rust/items/format.ts`:

```ts
/**
 * Cuentas chicas de la ficha de Rust, sin React (2026-10-05): duraciones, el tiempo de fabricación en cada banco y, más
 * adelante, el estado al aparecer y el mantenimiento. Las cifras van sin separador de miles: son chicas.
 */

/** 30 → "30 s", 1200 → "20 min", 3600 → "1 h", 9000 → "2 h 30 min". Las unidades son las mismas en los dos idiomas. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * El tiempo de fabricación en cada banco, desde el que pide la receta hasta el 3 (`ItemCrafter.GetScaledDuration`): con
 * un nivel más, la mitad; con dos o más, un cuarto. El banco 0 es "sin banco".
 */
export function craftTimes(time: number, workbench: number): { bench: number; seconds: number }[] {
  const out: { bench: number; seconds: number }[] = [];
  for (let bench = workbench; bench <= 3; bench++) {
    const d = bench - workbench;
    out.push({ bench, seconds: d === 0 ? time : d === 1 ? time * 0.5 : time * 0.25 });
  }
  return out;
}
```

- [ ] **Step 5: Tipos, textos y secciones**

5a. En `data.ts`, debajo de `Recycler`:

```ts
/** Lo que mueve usar o comer un objeto (`MetabolismAttribute.Type` en extract.py). */
export type EffectStat = "calories" | "hydration" | "poison" | "radiation" | "bleeding" | "health" | "healthOverTime";
/** Los modificadores de los tés, con `value` en fracción (0,5 = +50 %). */
export type ModStat = "woodYield" | "oreYield" | "radiationResistance" | "radiationExposureResistance" | "maxHealth" | "scrapYield";
```

y en `Ficha`, debajo de `condition`:

```ts
  despawn: number;
  repair: { cost: (Ref & { amount: number })[]; bp: boolean; loss: number } | null;
  use: {
    effects: { stat: EffectStat; amount: number; time: number }[];
    mods: { stat: ModStat; value: number; duration: number }[];
    spoil: { hours: number; into: Ref | null } | null;
  } | null;
```

5b. En `rustCopy.ts`, importar también `EffectStat` y `ModStat` del mismo `import type` de `./rust/items/data`, y agregar a la interfaz `items`:

```ts
    despawn: string;
    repair: string;
    repairMax: string;
    repairLoss: (pct: string) => string;
    repairBp: string;
    use: string;
    stats: Record<EffectStat, string>;
    mods: Record<ModStat, string>;
    /** "+50 % durante 30 min". */
    modRow: (value: string, duration: string) => string;
    /** Un efecto que se reparte en el tiempo: "en 30 s". */
    overTime: (t: string) => string;
    /** "Se echa a perder en 24 h:" y después el objeto en que queda. */
    spoil: (t: string) => string;
```

EN:

```ts
    despawn: "Despawns after",
    repair: "Repair",
    repairMax: "At the repair bench, from broken to full.",
    repairLoss: (pct) => `Each repair takes ${pct}% off max condition`,
    repairBp: "Needs the blueprint",
    use: "When used",
    stats: {
      calories: "Calories", hydration: "Hydration", poison: "Poison", radiation: "Radiation", bleeding: "Bleeding",
      health: "Health", healthOverTime: "Health over time",
    },
    mods: {
      woodYield: "Wood yield", oreYield: "Ore yield", radiationResistance: "Radiation resistance",
      radiationExposureResistance: "Radiation exposure resistance", maxHealth: "Max health", scrapYield: "Scrap yield",
    },
    modRow: (value, duration) => `${value} for ${duration}`,
    overTime: (t) => `over ${t}`,
    spoil: (t) => `Spoils after ${t}:`,
```

ES:

```ts
    despawn: "Desaparece del piso en",
    repair: "Reparación",
    repairMax: "En el banco de reparación, de roto a entero.",
    repairLoss: (pct) => `Cada reparación le saca ${pct} % de condición máxima`,
    repairBp: "Pide el plano",
    use: "Al usarlo",
    stats: {
      calories: "Calorías", hydration: "Hidratación", poison: "Veneno", radiation: "Radiación", bleeding: "Sangrado",
      health: "Vida", healthOverTime: "Vida con el tiempo",
    },
    mods: {
      woodYield: "Rendimiento de madera", oreYield: "Rendimiento de mineral", radiationResistance: "Resistencia a la radiación",
      radiationExposureResistance: "Resistencia a la exposición a la radiación", maxHealth: "Vida máxima",
      scrapYield: "Rendimiento de chatarra",
    },
    modRow: (value, duration) => `${value} durante ${duration}`,
    overTime: (t) => `en ${t}`,
    spoil: (t) => `Se echa a perder en ${t}:`,
```

5c. Crear `site/src/rust/items/FichaMore.tsx`:

```tsx
/**
 * Las secciones de la ficha de Rust que no son crafteo, reciclaje ni botín (2026-10-05): lo que hace al usarlo y la
 * reparación. Más adelante: se obtiene de, se convierte en, construcción, qué lo detecta y skins. Cada una devuelve
 * `null` si no hay nada que mostrar.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha } from "./data";
import { formatDuration } from "./format";
import { Icon, RefLink, type Nav } from "./parts";

type Props = { ficha: Ficha; route: Route; navigate: Nav };

/** "+20" o "−10" (con el signo menos tipográfico). */
function signed(n: number, num: (n: number) => string): string {
  return `${n > 0 ? "+" : "−"}${num(Math.abs(n))}`;
}

export function UseSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const u = ficha.use;
  if (!u) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.use}</h2>
      {(u.effects.length > 0 || u.mods.length > 0) && (
        <dl className="rs-facts">
          {u.effects.map((e) => (
            <div key={e.stat}>
              <dt>{t.stats[e.stat]}</dt>
              <dd>
                {signed(e.amount, num)}
                {e.time > 0 && ` · ${t.overTime(formatDuration(e.time))}`}
              </dd>
            </div>
          ))}
          {u.mods.map((m) => (
            <div key={m.stat}>
              <dt>{t.mods[m.stat]}</dt>
              <dd>{t.modRow(`+${t.pct(Math.round(m.value * 100))}`, formatDuration(m.duration))}</dd>
            </div>
          ))}
        </dl>
      )}
      {u.spoil && (
        <p className="rs-meta">
          <span>{t.spoil(formatDuration(u.spoil.hours * 3600))}</span>
          {u.spoil.into && (
            <RefLink r={u.spoil.into} route={route} navigate={navigate}>
              {say(u.spoil.into.name, lang)}
            </RefLink>
          )}
        </p>
      )}
    </section>
  );
}

export function RepairSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const r = ficha.repair;
  if (!r) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.repair}</h2>
      <p className="rs-ficha-note">{t.repairMax}</p>
      <ul className="rs-ings">
        {r.cost.map((g) => (
          <li key={g.id}>
            <RefLink r={g} route={route} navigate={navigate}>
              <span className="rs-slot">
                <Icon id={g.id} />
                <b className="rs-qty">{num(g.amount)}</b>
              </span>
              <span>{say(g.name, lang)}</span>
            </RefLink>
          </li>
        ))}
      </ul>
      <p className="rs-meta">
        <span>{t.repairLoss(num(Math.round(r.loss * 100)))}</span>
        {r.bp && <span>{t.repairBp}</span>}
      </p>
    </section>
  );
}
```

5d. En `ItemFicha.tsx`:
- `import { craftTimes, formatDuration } from "./format";` y `import { RepairSection, UseSection } from "./FichaMore";`;
- en el `<dl className="rs-facts">`, después del `<div>` de la pila, agregar:

```tsx
          <div>
            <dt>{t.despawn}</dt>
            <dd>{formatDuration(ficha.despawn)}</dd>
          </div>
```

- en el `<p className="rs-meta">` del crafteo, reemplazar `<span>{t.seconds(num(c.time))}</span>` y `<span>{c.workbench ? t.workbench(c.workbench) : t.noWorkbench}</span>` por:

```tsx
            {craftTimes(c.time, c.workbench).map(({ bench, seconds }) => (
              <span key={bench}>
                {bench ? t.workbench(bench) : t.noWorkbench}: {t.seconds(num(seconds))}
              </span>
            ))}
```

- después de la sección de arriba (`rs-ficha-top`), poner `<UseSection ficha={ficha} route={route} navigate={navigate} />`; al final, antes de `</main>`, `<RepairSection ficha={ficha} route={route} navigate={navigate} />`.

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 7: Ver en localhost**

`/es/rust/objetos/fusil-de-asalto`, `/es/rust/objetos/hacha`, `/es/rust/objetos/jeringa-medica` y `/es/rust/objetos/carne-de-oso-cocinada` (o su slug) a 375 px: los tiempos por banco bajan de renglón sin cortar palabras; la reparación con íconos; "Se echa a perder en 24 h:" con el enlace.

- [ ] **Step 8: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/test/rustFormat.test.ts site/test/rustItems.test.ts
git commit -m "feat(rust): la ficha dice cuánto tarda en desaparecer, el tiempo en cada banco, la reparación y qué hace al usarlo" -m "Los datos son los de A2. El tiempo por banco sigue a ItemCrafter (la mitad con un nivel más, un cuarto con dos), que coincide con la wiki de Facepunch; rusthelp da otros números."
```

---

### Task B5: Dónde aparece: estado, cantidad total, NPC, eventos y qué trae lo que se abre

Necesita A3, A4 y A5.

**Files:**
- Create: `site/src/rust/items/FichaLoot.tsx`
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rust/items/format.ts`, `site/src/rustCopy.ts`
- Modify: `site/test/rustItems.test.ts`, `site/test/rustFormat.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Produces:
  - cada fila de `ficha.loot`: `{"c", "name", "kind": "box" | "npc" | "item" | "collect", "event", "item": Ref | null, "chance", "min", "max", "bp", "cond": [mín, máx] | null}`;
  - `ficha.contents`: lo que trae un objeto que se abre, `[{...Ref, "chance", "min", "max", "bp"}]`;
  - `site_data.loot_row(r, src, item, ref)`, `site_data.contents_of(loot, ref)`;
  - `format.ts`: `formatChance(p, locale)` (sale de `ItemFicha.tsx`) y `condText(cond, pct)`;
  - `FichaLoot.tsx`: `LootSection`, `ContentsSection`;
  - copia: `items.lootCond`, `items.kinds`, `items.events`, `items.contents`; cambian `lootBox` y `lootNote`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, cambiar la aserción del botín en `test_botin_y_tiendas_con_nombres` por:

```python
        self.assertEqual(self.fichas["assault-rifle"]["loot"], [{
            "c": "elite", "name": {"en": "Elite Crate", "es": "Caja de élite"}, "kind": "box", "event": None, "item": None,
            "chance": 0.1, "min": 1, "max": 1, "bp": False, "cond": None,
        }])
```

y agregar en `TestBuild`:

```python
    def test_condicion_por_fuente_y_lo_que_trae_un_objeto(self):
        doc = json.loads(json.dumps(DOC))
        doc["items"][0]["condition"] = {"max": 150, "repairable": True, "found": [0.1, 0.2]}
        box = lambda en, worn: {"en": en, "es": en, "kind": "box", "event": None, "worn": worn}  # noqa: E731
        loot = {
            "containers": {
                "elite": box("Elite Crate", "all"), "locked": box("Locked Crate", "none"), "barrel": box("Barrel", "some"),
                "open_wood": {"en": "Wood", "es": "Madera", "kind": "item", "item": "wood", "event": "xmas", "worn": "none"},
            },
            "items": {"rifle.ak": [{"c": c, "chance": 0.1, "min": 1, "max": 1, "bp": False} for c in ("elite", "locked", "barrel", "open_wood")]},
        }
        out = rust_site.build(doc, loot, SHOPS)
        rows = {r["c"]: r for r in out["fichas"]["assault-rifle"]["loot"]}
        self.assertEqual(rows["elite"]["cond"], [0.1, 0.2])
        self.assertEqual(rows["locked"]["cond"], [1, 1])
        self.assertEqual(rows["barrel"]["cond"], [0.1, 1])
        self.assertEqual((rows["open_wood"]["item"]["slug"], rows["open_wood"]["event"]), ("wood", "xmas"))
        # Lo que trae la "madera" que se abre: el AK.
        self.assertEqual([c["id"] for c in out["fichas"]["wood"]["contents"]], ["rifle.ak"])
        self.assertEqual(out["fichas"]["assault-rifle"]["contents"], [])
```

1b. En `site/test/rustFormat.test.ts`, agregar:

```ts
import { condText, formatChance } from "../src/rust/items/format";

describe("el estado al aparecer y la probabilidad", () => {
  const pct = (p: number) => `${p} %`;
  it("condText", () => {
    expect(condText([0.1, 0.2], pct)).toBe("10–20 %");
    expect(condText([1, 1], pct)).toBe("100 %");
    expect(condText([0.01, 0.03], pct)).toBe("1–3 %");
  });
  it("formatChance", () => {
    expect(formatChance(0.2845, "es-AR")).toBe("28 %");
    expect(formatChance(0.039, "es-AR")).toBe("3,9 %");
    expect(formatChance(0.0004, "es-AR")).toBe("< 0,1 %");
    expect(formatChance(1, "es-AR")).toBe("100 %");
  });
});
```

(El import de `condText`/`formatChance` se suma al de arriba del archivo.)

1c. En `site/test/rustItems.test.ts`:
- agregar al `beforeAll` `await preloadTab(parseRoute("/es/rust/objetos/fragmentos-de-metal"));` y `await preloadTab(parseRoute("/en/rust/items/small-present"));`;
- en el test del AK, cambiar la expresión regular del `<thead>` por:

```ts
    expect(html).toMatch(/<thead><tr><th scope="col">Dónde<\/th><th scope="col">Cantidad<\/th><th scope="col">Probabilidad<\/th><th scope="col">Estado<\/th><\/tr><\/thead>/);
```

- y agregar:

```ts
  it("el AK: los científicos pesados, el estado al aparecer y la cantidad de todas las tiradas", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain("Científico pesado (plataforma petrolera)");
    expect(html).toContain(">NPC<");
    expect(html).toContain("10–20 %"); // caja de élite
    expect(html).toContain("× 1–2"); // caja bloqueada
  });

  it("los fragmentos de metal: el regalo pequeño enlazado y marcado como de Navidad", () => {
    const html = render("es", "/es/rust/objetos/fragmentos-de-metal");
    expect(html).toContain('href="/es/rust/objetos/regalo-pequeno"');
    expect(html).toContain(">Navidad<");
  });

  it("el regalo pequeño: qué trae", () => {
    const html = render("en", "/en/rust/items/small-present");
    expect(html).toContain("What's inside");
    expect(html).toContain('href="/en/rust/items/metal-fragments"');
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → FAIL (faltan `kind`, `cond`, `contents`).

- [ ] **Step 3: `site_data.py`**

3a. Arriba de `build`, agregar:

```python
def loot_row(r, src, item, ref):
    """
    Una fila de "Dónde aparece": la fuente con su nombre, qué es (caja, NPC, objeto que se abre, recolectable), si es de
    un evento, y con qué condición sale el objeto (`cond`, [mín, máx] en fracción). `cond` va sólo si el objeto tiene
    condición y no es un plano: la caja que gasta todo (`worn: all`) usa `found`; la que a veces (`some`), de `found`
    mínimo a entero; la que nunca, entero.
    """
    cond = None
    found = (item.get("condition") or {}).get("found")
    if found and not r["bp"]:
        worn = src.get("worn", "none")
        cond = list(found) if worn == "all" else [found[0], 1] if worn == "some" else [1, 1]
    return {
        "c": r["c"], "name": {"en": src["en"], "es": src["es"]}, "kind": src.get("kind", "box"), "event": src.get("event"),
        "item": ref(src["item"]) if src.get("item") else None,
        "chance": r["chance"], "min": r["min"], "max": r["max"], "bp": r["bp"], "cond": cond,
    }


def contents_of(loot, ref):
    """Lo que trae cada objeto que se abre (fuentes con `kind: item`), de lo más probable a lo menos."""
    out = {}
    for sid, rows in loot["items"].items():
        for r in rows:
            src = loot["containers"][r["c"]]
            if src.get("kind") == "item":
                out.setdefault(src["item"], []).append(
                    {**ref(sid), "chance": r["chance"], "min": r["min"], "max": r["max"], "bp": r["bp"]})
    for rows in out.values():
        rows.sort(key=lambda r: (-r["chance"], r["name"]["en"].lower()))
    return out
```

3b. En `build`, después de `containers = loot["containers"]`, agregar `contents = contents_of(loot, ref)`; en el diccionario de cada ficha, reemplazar la línea de `"loot"` por:

```python
            "loot": [loot_row(r, containers[r["c"]], i, ref) for r in loot["items"].get(i["id"], [])],
            "contents": contents.get(i["id"], []),
```

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS.

- [ ] **Step 4: `format.ts`**

4a. Mover la función `formatChance` de `ItemFicha.tsx` a `format.ts`, con `export` y el mismo comentario.

4b. Agregar a `format.ts`:

```ts
/** El estado con que aparece un objeto: [0,1, 0,2] → "10–20 %"; [1, 1] → "100 %". `pct` pone el espacio del idioma. */
export function condText([lo, hi]: [number, number], pct: (p: number) => string): string {
  const a = Math.round(lo * 100);
  const b = Math.round(hi * 100);
  return a === b ? pct(a) : `${a}–${pct(b)}`;
}
```

- [ ] **Step 5: Tipos, textos y secciones**

5a. En `data.ts`:

```ts
export type LootKind = "box" | "npc" | "item" | "collect";
export type LootEvent = "xmas" | "halloween" | "easter";
```

y en `Ficha`, reemplazar `loot` por:

```ts
  loot: {
    c: string;
    name: Loc;
    kind: LootKind;
    event: LootEvent | null;
    /** El objeto que se abre, si la fuente es uno (un regalo, una bolsa de Halloween). */
    item: Ref | null;
    chance: number;
    min: number;
    max: number;
    bp: boolean;
    cond: [number, number] | null;
  }[];
  contents: (Ref & { chance: number; min: number; max: number; bp: boolean })[];
```

5b. En `rustCopy.ts` (importar `LootKind` y `LootEvent`), interfaz:

```ts
    lootCond: string;
    kinds: Record<Exclude<LootKind, "box">, string>;
    events: Record<LootEvent, string>;
    contents: string;
```

EN: `lootBox: "Source",` (reemplaza a "Container"), `lootNote: "Chance that a crate, NPC or item has at least one; the amount counts all its rolls. Condition: how worn it comes out.",` y

```ts
    lootCond: "Condition",
    kinds: { npc: "NPC", item: "Opened", collect: "Pick up" },
    events: { xmas: "Christmas", halloween: "Halloween", easter: "Easter" },
    contents: "What's inside",
```

ES: `lootBox: "Dónde",`, `lootNote: "Probabilidad de que una caja, un NPC o un objeto traiga al menos uno; la cantidad cuenta todas sus tiradas. Estado: qué tan gastado sale.",` y

```ts
    lootCond: "Estado",
    kinds: { npc: "NPC", item: "Se abre", collect: "Del suelo" },
    events: { xmas: "Navidad", halloween: "Halloween", easter: "Pascua" },
    contents: "Qué trae",
```

5c. Crear `site/src/rust/items/FichaLoot.tsx`:

```tsx
/**
 * Dónde aparece un objeto de Rust y qué trae uno que se abre (2026-10-05). Las fuentes son cajas, NPC, objetos que se
 * abren (regalos, bolsas, huevos) y cosas del suelo; cada fila dice cuál es con una etiqueta, y si es de un evento. La
 * cantidad cuenta todas las tiradas de la fuente, y el estado sólo se muestra si el objeto tiene condición.
 */
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha } from "./data";
import { condText, formatChance } from "./format";
import { Icon, RefLink, type Nav } from "./parts";

type Props = { ficha: Ficha; route: Route; navigate: Nav };

export function LootSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.loot.length) return null;
  const withCond = ficha.loot.some((l) => l.cond);
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.loot}</h2>
      <p className="rs-ficha-note">{t.lootNote}</p>
      <table className="rs-table rs-loot">
        <thead>
          <tr>
            <th scope="col">{t.lootBox}</th>
            <th scope="col">{t.lootAmount}</th>
            <th scope="col">{t.lootChance}</th>
            {withCond && <th scope="col">{t.lootCond}</th>}
          </tr>
        </thead>
        <tbody>
          {ficha.loot.map((l) => (
            <tr key={`${l.c}-${l.bp}`}>
              <th scope="row">
                {l.item ? (
                  <RefLink r={l.item} route={route} navigate={navigate}>
                    {say(l.name, lang)}
                  </RefLink>
                ) : (
                  say(l.name, lang)
                )}
                {l.kind !== "box" && <em className="rs-tag">{t.kinds[l.kind]}</em>}
                {l.event && <em className="rs-tag">{t.events[l.event]}</em>}
                {l.bp && <em className="rs-tag">{t.blueprint}</em>}
              </th>
              <td>{l.min === l.max ? `× ${num(l.min)}` : `× ${num(l.min)}–${num(l.max)}`}</td>
              <td>{formatChance(l.chance, locale)}</td>
              {withCond && <td>{l.cond ? condText(l.cond, t.pct) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ContentsSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.contents.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.contents}</h2>
      <table className="rs-table">
        <thead>
          <tr>
            <th scope="col">{t.recycledItem}</th>
            <th scope="col">{t.lootAmount}</th>
            <th scope="col">{t.lootChance}</th>
          </tr>
        </thead>
        <tbody>
          {ficha.contents.map((c) => (
            <tr key={`${c.id}-${c.bp}`}>
              <th scope="row">
                <RefLink r={c} route={route} navigate={navigate}>
                  <Icon id={c.id} size={28} />
                  <span>{say(c.name, lang)}</span>
                </RefLink>
                {c.bp && <em className="rs-tag">{t.blueprint}</em>}
              </th>
              <td>{c.min === c.max ? `× ${num(c.min)}` : `× ${num(c.min)}–${num(c.max)}`}</td>
              <td>{formatChance(c.chance, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

5d. En `ItemFicha.tsx`, borrar la sección `{ficha.loot.length > 0 && (…)}` entera y poner en su lugar:

```tsx
      <LootSection ficha={ficha} route={route} navigate={navigate} />
      <ContentsSection ficha={ficha} route={route} navigate={navigate} />
```

con `import { ContentsSection, LootSection } from "./FichaLoot";`. Borrar también `formatChance` del archivo (ya vive en `format.ts`).

5e. En `rust-items.css`, para que la tabla del botín entre a 375 px con cuatro columnas: `.rs-loot th[scope="row"] { min-width: 9em; }` y que las etiquetas bajen de renglón con el nombre (`.rs-tag` ya es `inline`; si en la revisión a 375 px una etiqueta empuja la tabla, agregar `.rs-loot .rs-tag { display: inline-block; margin: 2px 6px 0 0; }`).

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 7: Ver en localhost**

A 375 px y en escritorio: `/es/rust/objetos/fusil-de-asalto` (científicos pesados, "10–20 %" en la de élite, "100 %" en la bloqueada), `/es/rust/objetos/fragmentos-de-metal` (regalo, bolsa y huevo con su evento, piedras sueltas "Del suelo"), `/es/rust/objetos/regalo-pequeno` ("Qué trae"), `/es/rust/objetos/carga-explosiva-con-temporizador` (la entrega de Papá Noel con "Navidad"). Sin scroll horizontal.

- [ ] **Step 8: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts site/test/rustFormat.test.ts
git commit -m "feat(rust): dónde aparece con NPC, eventos, estado al aparecer y la cantidad de todas las tiradas" -m "La tabla del botín suma los científicos y moradores, los regalos y bolsas que se abren (enlazados a su ficha), lo que se junta del suelo y la entrega de Papá Noel. Cada objeto que se abre muestra qué trae."
```

---

### Task B6: Se obtiene de (cocinar, fundir, quemar, usar, mesa de mezcla) y se convierte en

Necesita A2 (`turns`) y A5 (`mixing.json`). Lo que se junta del suelo ya está en "Dónde aparece" (B5).

**Files:**
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/FichaMore.tsx`, `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rustCopy.ts`, `site/src/styles/rust-items.css`
- Modify: `site/test/rustItems.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Consumes: `items.json` → `turns` (A2); `mixing.json` (A5).
- Produces:
  - `build(items_doc, loot, shops, mixing=None)` (parámetro nuevo, opcional) y `main()` que lo lee si existe;
  - ficha: `"obtained": [{"how": "cook" | "burn" | "swap" | "mix", "from": [Ref + amount], "amount", "chance", "time"?, "bp"?}]` y `"turns": [{"how", "into": Ref, "amount", "chance"}]`;
  - `site_data.obtained_by(items, mixing, ref)`;
  - `FichaMore.tsx`: `ObtainSection`, `TurnsSection`;
  - copia: `items.obtained`, `items.turnsInto`, `items.how`, `items.perUnit(pct)`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, en `TestBuild`:

```python
    def test_se_obtiene_de_y_se_convierte_en(self):
        doc = json.loads(json.dumps(DOC))
        by_id = {i["id"]: i for i in doc["items"]}
        by_id["wood"]["turns"] = [{"how": "burn", "into": "scrap", "amount": 1, "chance": 0.25}]
        mixing = {"recipes": [{"name": "X", "out": "scrap", "amount": 3, "time": 1, "bp": True, "in": [{"id": "wood", "amount": 10}]}]}
        out = rust_site.build(doc, LOOT, SHOPS, mixing)
        got = out["fichas"]["scrap"]["obtained"]
        self.assertEqual([o["how"] for o in got], ["burn", "mix"])
        self.assertEqual(got[0]["from"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 1}])
        self.assertEqual((got[0]["amount"], got[0]["chance"]), (1, 0.25))
        self.assertEqual((got[1]["amount"], got[1]["time"], got[1]["bp"]), (3, 1, True))
        self.assertEqual(out["fichas"]["wood"]["turns"], [{"how": "burn", "into": {"id": "scrap", "slug": "scrap", "name": {"en": "Scrap", "es": "Chatarra"}}, "amount": 1, "chance": 0.25}])
        self.assertEqual(self.fichas["assault-rifle"]["obtained"], [])
```

1b. En `site/test/rustItems.test.ts`, agregar al `beforeAll` `await preloadTab(parseRoute("/en/rust/items/556-rifle-ammo"));` y `await preloadTab(parseRoute("/en/rust/items/metal-ore"));`, y:

```ts
  it("se obtiene de: fundiendo mineral y en la mesa de mezcla", () => {
    const mf = render("en", "/en/rust/items/metal-fragments");
    expect(mf).toContain("Obtained from");
    expect(mf).toContain("Cooking or smelting");
    expect(mf).toContain('href="/en/rust/items/metal-ore"');
    expect(render("en", "/en/rust/items/556-rifle-ammo")).toContain("Mixing table");
  });

  it("se convierte en: la madera da carbón al quemarse, con su chance", () => {
    const html = render("en", "/en/rust/items/wood");
    expect(html).toContain("Turns into");
    expect(html).toContain('href="/en/rust/items/charcoal"');
    expect(html).toContain("25% per unit");
    expect(render("en", "/en/rust/items/metal-ore")).toContain('href="/en/rust/items/metal-fragments"');
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → ERROR (`build()` no acepta `mixing`).

- [ ] **Step 3: `site_data.py`**

3a. Arriba de `build`, agregar:

```python
def obtained_by(items, mixing, ref):
    """
    Las otras formas de conseguir cada objeto: cocinando, fundiendo, quemando o usando otro (`turns` de items.json) y en
    la mesa de mezcla (`mixing.json`). `from` son los ingredientes (de a uno para las transformaciones); `amount`, lo que
    da; `chance`, la probabilidad por unidad (quemar madera da carbón el 25 % de las veces).
    """
    out = {}
    for i in items:
        if not i["slug"]:
            continue
        for t in i.get("turns") or []:
            out.setdefault(t["into"], []).append(
                {"how": t["how"], "from": [{**ref(i["id"]), "amount": 1}], "amount": t["amount"], "chance": t["chance"]})
    for r in (mixing or {}).get("recipes", []):
        out.setdefault(r["out"], []).append({
            "how": "mix", "from": [{**ref(x["id"]), "amount": x["amount"]} for x in r["in"]], "amount": r["amount"],
            "chance": 1, "time": r["time"], "bp": r["bp"],
        })
    return out
```

3b. Cambiar la firma a `def build(items_doc, loot, shops, mixing=None):`; después de `recycled = …`, agregar `obtained = obtained_by(items, mixing, ref)`; y en el diccionario de cada ficha, después de `"contents"`:

```python
            "obtained": obtained.get(i["id"], []),
            "turns": [{"how": t["how"], "into": ref(t["into"]), "amount": t["amount"], "chance": t["chance"]} for t in i.get("turns") or []],
```

3c. En `main()`, cambiar la llamada a:

```python
    optional = lambda n: load(n) if (DATA / n).exists() else None  # noqa: E731
    out = build(load("items.json"), load("loot.json"), load("shops.json"), optional("mixing.json"))
```

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS.

- [ ] **Step 4: El sitio**

4a. En `data.ts`:

```ts
export type HowKind = "cook" | "burn" | "swap" | "mix";
```

y en `Ficha`:

```ts
  obtained: { how: HowKind; from: (Ref & { amount: number })[]; amount: number; chance: number; time?: number; bp?: boolean }[];
  turns: { how: Exclude<HowKind, "mix">; into: Ref; amount: number; chance: number }[];
```

4b. En `rustCopy.ts` (importar `HowKind`), interfaz:

```ts
    obtained: string;
    turnsInto: string;
    how: Record<HowKind, string>;
    perUnit: (pct: string) => string;
```

EN:

```ts
    obtained: "Obtained from",
    turnsInto: "Turns into",
    how: { cook: "Cooking or smelting", burn: "Burning", swap: "Using it", mix: "Mixing table" },
    perUnit: (pct) => `${pct} per unit`,
```

ES:

```ts
    obtained: "Se obtiene de",
    turnsInto: "Se convierte en",
    how: { cook: "Cocinando o fundiendo", burn: "Quemándolo", swap: "Usándolo", mix: "Mesa de mezcla" },
    perUnit: (pct) => `${pct} por unidad`,
```

4c. En `FichaMore.tsx`, agregar:

```tsx
/** Cómo se consigue este objeto sin crafteo ni botín: cocinando, fundiendo, quemando o usando otro, o en la mesa de mezcla. */
export function ObtainSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.obtained.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.obtained}</h2>
      <ul className="rs-obtain">
        {ficha.obtained.map((o, i) => (
          <li key={i}>
            <b>{t.how[o.how]}</b>
            <span className="rs-yields">
              {o.from.map((f) => (
                <RefLink key={f.id} r={f} route={route} navigate={navigate}>
                  <Icon id={f.id} size={28} />
                  <span>{o.how === "mix" ? `${num(f.amount)} × ` : ""}{say(f.name, lang)}</span>
                </RefLink>
              ))}
            </span>
            <span>
              → × {num(o.amount)}
              {o.chance < 1 && ` (${t.perUnit(t.pct(Math.round(o.chance * 100)))})`}
              {o.time ? ` · ${t.seconds(num(o.time))}` : ""}
              {o.bp ? ` · ${t.repairBp}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** En qué se convierte este objeto: al cocinarlo o fundirlo, al quemarlo, al usarlo. */
export function TurnsSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  if (!ficha.turns.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.turnsInto}</h2>
      <ul className="rs-obtain">
        {ficha.turns.map((o, i) => (
          <li key={i}>
            <b>{t.how[o.how]}</b>
            <RefLink r={o.into} route={route} navigate={navigate}>
              <Icon id={o.into.id} size={28} />
              <span>× {num(o.amount)} {say(o.into.name, lang)}</span>
            </RefLink>
            {o.chance < 1 && <span>{t.perUnit(t.pct(Math.round(o.chance * 100)))}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

4d. En `ItemFicha.tsx`, importar `ObtainSection` y `TurnsSection` y ponerlos después de `<ContentsSection …/>` (primero `ObtainSection`, después `TurnsSection`).

4e. En `rust-items.css`:

```css
/* "Se obtiene de" y "se convierte en": una línea por forma, que baja de renglón entera en el celular. */
.rs-obtain { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rs-obtain li { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
.rs-obtain b { font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 14px; }
.rs-obtain .rs-ref { display: inline-flex; gap: 6px; align-items: center; }
```

- [ ] **Step 5: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 6: Ver en localhost**

`/es/rust/objetos/fragmentos-de-metal` (fundiendo mena de metal, lata de porotos vacía), `/es/rust/objetos/polvora` (mesa de mezcla: 20 de azufre y 20 de carbón → × 10 · pide el plano), `/es/rust/objetos/grasa-animal` (los pescados destripados), `/es/rust/objetos/madera` ("Se convierte en: Quemándolo × 1 carbón, 25 % por unidad"). A 375 px, sin scroll.

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts
git commit -m "feat(rust): se obtiene de y se convierte en: fundir, cocinar, quemar, usar y la mesa de mezcla" -m "La grasa animal sale de destripar cada pescado, los fragmentos de fundir mineral y la munición de la mesa de mezcla; y cada fuente dice en qué se convierte."
```

---

### Task B7: Construcción: qué se le pone, mantenimiento, desgaste y qué lo detecta

Necesita A6.

**Files:**
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/FichaMore.tsx`, `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rust/items/format.ts`, `site/src/rustCopy.ts`
- Modify: `site/test/rustItems.test.ts`, `site/test/rustFormat.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Consumes: `deployables.json` (A6).
- Produces:
  - `build(items_doc, loot, shops, mixing=None, deployables=None)`;
  - ficha: `"deploy": {"attach": [Ref], "upkeep": [Ref + amount], "decay": {"delay", "duration"} | null} | null`, `"vibration": n | null`, `"detectedBy": Ref | null`;
  - `site_data.ATTACH`, `site_data.deploy_of(i, dep, by_id, ref)`;
  - `format.ts`: `upkeepRange(amount) -> [mín, máx]`;
  - `FichaMore.tsx`: `BuildingSection`, `DetectedSection`;
  - copia: `items.building`, `attach`, `upkeep`, `upkeepNote`, `decay`, `decayOut(t)`, `decayIn(t)`, `decayDelay(t)`, `decayNote`, `detectedBy`, `vibration(n)`.

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, en `TestBuild`:

```python
    def test_construccion(self):
        doc = json.loads(json.dumps(DOC))
        doc["items"] += [
            it("door.hinged.metal", "Sheet Metal Door", "Puerta de chapa", cat="construction",
               craft={"ingredients": [{"id": "wood", "amount": 150}, {"id": "gears", "amount": 2}], "amount": 1, "time": 30,
                      "workbench": 0, "researchable": True, "researchScrap": 60, "default": False}),
            it("lock.code", "Code Lock", "Cerradura numérica", cat="construction"),
            it("electric.seismicsensor", "Seismic Sensor", "Sensor sísmico", cat="electrical"),
            it("gears", "Gears", "Engranajes", cat="component"),
        ]
        dep = {"items": {"door.hinged.metal": {"door": {"lock": True, "closer": False, "knocker": False, "hatch": False},
                                               "upkeep": True, "decay": {"delay": 0, "duration": 8}}},
               "vibration": {"rifle.ak": 3}}
        out = rust_site.build(doc, LOOT, SHOPS, None, dep)
        d = out["fichas"]["sheet-metal-door"]["deploy"]
        self.assertEqual([a["id"] for a in d["attach"]], ["lock.code"])  # lock.key no está en estos datos: no se nombra
        # Sólo los recursos pagan mantenimiento: los engranajes (componente) no.
        self.assertEqual(d["upkeep"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 150}])
        self.assertEqual(d["decay"], {"delay": 0, "duration": 8})
        ak = out["fichas"]["assault-rifle"]
        self.assertEqual((ak["vibration"], ak["detectedBy"]["id"]), (3, "electric.seismicsensor"))
        self.assertIsNone(ak["deploy"])
```

1b. En `site/test/rustFormat.test.ts`:

```ts
import { upkeepRange } from "../src/rust/items/format";

describe("el mantenimiento por día", () => {
  it("de la base más chica a la más grande (10 % a 33,3 %, para abajo)", () => {
    expect(upkeepRange(150)).toEqual([15, 49]);
    expect(upkeepRange(300)).toEqual([30, 99]);
    expect(upkeepRange(20)).toEqual([2, 6]);
    expect(upkeepRange(4000)).toEqual([400, 1332]);
  });
});
```

1c. En `site/test/rustItems.test.ts`, agregar al `beforeAll` `await preloadTab(parseRoute("/en/rust/items/sheet-metal-door"));` y `await preloadTab(parseRoute("/en/rust/items/timed-explosive-charge"));`, y:

```ts
  it("la puerta de chapa: qué se le pone, mantenimiento y desgaste", () => {
    const html = render("en", "/en/rust/items/sheet-metal-door");
    expect(html).toContain("Building");
    for (const s of ['href="/en/rust/items/code-lock"', 'href="/en/rust/items/door-closer"', 'href="/en/rust/items/dragon-door-knocker"']) expect(html).toContain(s);
    expect(html).toContain("15–49");
    expect(html).toContain("Outside: 8 h");
    expect(html).toContain("Inside: 80 h");
  });

  it("el C4 lo detecta el sensor sísmico, nivel 3", () => {
    const html = render("en", "/en/rust/items/timed-explosive-charge");
    expect(html).toContain('href="/en/rust/items/seismic-sensor"');
    expect(html).toContain("vibration level 3");
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → ERROR (`build()` no acepta `deployables`).

- [ ] **Step 3: `site_data.py`**

3a. Debajo de `CATEGORY_ORDER`, agregar:

```python
# Qué objetos son cada cosa que se le puede poner a una puerta (`Door.canTakeLock`, `canTakeCloser`, `canTakeKnocker`).
# El controlador de puertas y las coronas también se le ponen (rusthelp las lista), pero no se identificó el campo que lo
# permite: no se nombran.
ATTACH = {"lock": ["lock.code", "lock.key"], "closer": ["door.closer"], "knocker": ["dragondoorknocker", "skulldoorknocker"]}
SEISMIC_SENSOR = "electric.seismicsensor"
```

3b. Arriba de `build`:

```python
def deploy_of(i, dep, by_id, ref):
    """
    Lo de construcción de un objeto que se coloca: qué se le puede poner (si es una puerta), el mantenimiento por día al
    100 % (los ingredientes de categoría Recursos de su receta; el sitio saca el rango) y el desgaste. `None` si nada.
    """
    d = (dep or {}).get("items", {}).get(i["id"])
    if not d:
        return None
    attach = []
    for field, sids in ATTACH.items():
        if (d.get("door") or {}).get(field):
            attach += [ref(s) for s in sids if s in by_id]
    upkeep = []
    if d.get("upkeep") and i.get("craft"):
        upkeep = [{**ref(g["id"]), "amount": g["amount"]} for g in i["craft"]["ingredients"]
                  if by_id.get(g["id"], {}).get("category") == "resources"]
    if not (attach or upkeep or d.get("decay")):
        return None
    return {"attach": attach, "upkeep": upkeep, "decay": d.get("decay")}
```

3c. Cambiar la firma a `def build(items_doc, loot, shops, mixing=None, deployables=None):` y agregar en el diccionario de cada ficha:

```python
            "deploy": deploy_of(i, deployables, by_id, ref),
            "vibration": (deployables or {}).get("vibration", {}).get(i["id"]),
            "detectedBy": ref(SEISMIC_SENSOR) if (deployables or {}).get("vibration", {}).get(i["id"]) else None,
```

3d. En `main()`: `out = build(load("items.json"), load("loot.json"), load("shops.json"), optional("mixing.json"), optional("deployables.json"))`.

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS.

- [ ] **Step 4: El sitio**

4a. `format.ts`:

```ts
/**
 * El mantenimiento por día de un recurso, de la base más chica a la más grande (`decay.bracket_*`: el armario cobra el
 * 10 % del costo de cada pieza en una base chica y hasta el 33,3 % en una grande), para abajo como en el juego.
 */
export function upkeepRange(amount: number): [number, number] {
  return [Math.floor(amount * 0.1 + 1e-9), Math.floor(amount * 0.333 + 1e-9)];
}
```

4b. `data.ts`, en `Ficha`:

```ts
  deploy: {
    attach: Ref[];
    upkeep: (Ref & { amount: number })[];
    /** En horas, sin mantenimiento y afuera de una base. */
    decay: { delay: number; duration: number } | null;
  } | null;
  vibration: number | null;
  detectedBy: Ref | null;
```

4c. `rustCopy.ts`, interfaz:

```ts
    building: string;
    attach: string;
    upkeep: string;
    upkeepNote: string;
    decay: string;
    decayOut: (t: string) => string;
    decayIn: (t: string) => string;
    decayDelay: (t: string) => string;
    decayNote: string;
    detectedBy: string;
    vibration: (n: number) => string;
```

EN:

```ts
    building: "Building",
    attach: "Takes",
    upkeep: "Upkeep per day",
    upkeepNote: "From the smallest base to the biggest: the tool cupboard charges more the more pieces the base has.",
    decay: "Decay",
    decayOut: (t) => `Outside: ${t}`,
    decayIn: (t) => `Inside: ${t}`,
    decayDelay: (t) => `Starts after ${t}`,
    decayNote: "Time until it breaks with no upkeep in the tool cupboard.",
    detectedBy: "Detected by",
    vibration: (n) => `vibration level ${n}`,
```

ES:

```ts
    building: "Construcción",
    attach: "Se le puede poner",
    upkeep: "Mantenimiento por día",
    upkeepNote: "De la base más chica a la más grande: el armario cobra más cuantas más piezas tenga la base.",
    decay: "Desgaste",
    decayOut: (t) => `Afuera: ${t}`,
    decayIn: (t) => `Adentro: ${t}`,
    decayDelay: (t) => `Empieza a las ${t}`,
    decayNote: "Lo que tarda en romperse si el armario no tiene con qué pagar el mantenimiento.",
    detectedBy: "Lo detecta",
    vibration: (n) => `nivel de vibración ${n}`,
```

4d. En `FichaMore.tsx` (importar `upkeepRange` de `./format`), agregar:

```tsx
/** Lo de construcción: qué se le pone (puertas), cuánto mantenimiento paga y cuánto tarda en romperse. */
export function BuildingSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const d = ficha.deploy;
  if (!d) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.building}</h2>
      {d.attach.length > 0 && (
        <>
          <h3 className="rs-sub">{t.attach}</h3>
          <ul className="rs-refs">
            {d.attach.map((a) => (
              <li key={a.id}>
                <RefLink r={a} route={route} navigate={navigate}>
                  <Icon id={a.id} size={32} />
                  <span>{say(a.name, lang)}</span>
                </RefLink>
              </li>
            ))}
          </ul>
        </>
      )}
      {d.upkeep.length > 0 && (
        <>
          <h3 className="rs-sub">{t.upkeep}</h3>
          <ul className="rs-yields">
            {d.upkeep.map((u) => {
              const [lo, hi] = upkeepRange(u.amount);
              return (
                <li key={u.id}>
                  <RefLink r={u} route={route} navigate={navigate}>
                    <Icon id={u.id} size={28} />
                    <span>{say(u.name, lang)}</span>
                    <b>{`${num(lo)}–${num(hi)}`}</b>
                  </RefLink>
                </li>
              );
            })}
          </ul>
          <p className="rs-ficha-note">{t.upkeepNote}</p>
        </>
      )}
      {d.decay && (
        <>
          <h3 className="rs-sub">{t.decay}</h3>
          <p className="rs-meta">
            <span>{t.decayOut(formatDuration(d.decay.duration * 3600))}</span>
            <span>{t.decayIn(formatDuration(d.decay.duration * 36000))}</span>
            {d.decay.delay > 0 && <span>{t.decayDelay(formatDuration(d.decay.delay * 3600))}</span>}
          </p>
          <p className="rs-ficha-note">{t.decayNote}</p>
        </>
      )}
    </section>
  );
}

/** Qué lo detecta: el sensor sísmico, con el nivel de vibración de la explosión. */
export function DetectedSection({ ficha, route, navigate }: Props) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  if (!ficha.vibration || !ficha.detectedBy) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.detectedBy}</h2>
      <p className="rs-meta">
        <RefLink r={ficha.detectedBy} route={route} navigate={navigate}>
          <Icon id={ficha.detectedBy.id} size={28} />
          <span>{say(ficha.detectedBy.name, lang)}</span>
        </RefLink>
        <span>{t.vibration(ficha.vibration)}</span>
      </p>
    </section>
  );
}
```

`* 36000` es la duración en horas × 3.600 × 10: adentro de una base dura diez veces más (`upkeep_inside_decay_scale`).

4e. En `rust-items.css`: `.rs-sub { margin: 12px 0 6px; color: var(--rs-dim); font: 700 12px/1.2 "Roboto Condensed", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }` y `.rs-sub:first-of-type { margin-top: 0; }`.

4f. En `ItemFicha.tsx`, importar `BuildingSection` y `DetectedSection` y ponerlos antes de `<RepairSection …/>`.

- [ ] **Step 5: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 6: Ver en localhost**

`/es/rust/objetos/puerta-de-chapa` (cerradura numérica, de llave, cierrapuertas, aldabas; 15–49 fragmentos; afuera 8 h, adentro 80 h), `/es/rust/objetos/caja-grande-de-madera` (desgaste con "Empieza a las 5 h", sin mantenimiento), `/es/rust/objetos/carga-explosiva-con-temporizador` (sensor sísmico, nivel 3). A 375 px.

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts site/test/rustFormat.test.ts
git commit -m "feat(rust): construcción en la ficha: qué se le pone, mantenimiento, desgaste y el sensor sísmico" -m "El mantenimiento sale de la receta (sólo los recursos) con el rango del armario, 10 % a 33,3 %; el desgaste, de A6, donde el juego lo trae. Los explosivos dicen con qué nivel de vibración los detecta el sensor."
```

---

### Task B8: Las skins en la ficha y el tope de peso

Necesita A7.

**Files:**
- Modify: `games/rust/tools/site_data.py`, `games/rust/tools/tests/test_site_data.py`
- Modify: `site/src/rust/items/FichaMore.tsx`, `site/src/rust/items/ItemFicha.tsx`, `site/src/rust/items/data.ts`, `site/src/rustCopy.ts`, `site/src/styles/rust-items.css`
- Modify: `site/test/rustItems.test.ts`
- Regenerate: `games/rust/data/site/`

**Interfaces:**
- Consumes: `skins.json` (A7).
- Produces:
  - `build(items_doc, loot, shops, mixing=None, deployables=None, skins=None)`;
  - ficha: `"skins": [{"id", "name", "icon", "workshop"}]` (lista vacía si no tiene);
  - `FichaMore.tsx`: `SkinsSection`;
  - copia: `items.skins(n)`, `items.workshop`;
  - un test de peso: ningún archivo de fichas pasa de **48 KB con gzip**.
- Peso medido al relevar: hoy el más grande pesa 14,5 KB con gzip; "se obtiene reciclando" le suma ~10 KB y las skins ~0,3 KB por archivo. El tope deja margen para las NPC y "se obtiene de". Si se pasa, el plan B es guardar en `recycledFrom` sólo `[id, cantidad, chatarra]` y tomar el nombre de `list.json`, que la ficha ya puede pedir con `loadList()` (medido: suma 2,8 KB en vez de 10).

- [ ] **Step 1: Escribir los tests que fallan**

1a. En `test_site_data.py`, en `TestBuild`:

```python
    def test_skins(self):
        skins = {"items": {"rifle.ak": [{"id": 10135, "name": {"en": "Digital Camo AK47", "es": "AK47 con camuflaje digital"},
                                         "icon": "skins/10135", "workshop": True}]}}
        out = rust_site.build(DOC, LOOT, SHOPS, None, None, skins)
        self.assertEqual(out["fichas"]["assault-rifle"]["skins"][0]["icon"], "skins/10135")
        self.assertEqual(out["fichas"]["wood"]["skins"], [])
```

y en `TestBuildReal`, un test nuevo:

```python
    def test_ningun_archivo_de_fichas_pasa_de_48_kb_con_gzip(self):
        import gzip
        for f in sorted((rust_site.OUT / "items").glob("*.json")):
            size = len(gzip.compress(f.read_bytes()))
            self.assertLess(size, 48_000, f"{f.name}: {size} bytes con gzip")
```

1b. En `site/test/rustItems.test.ts`, en el test del AK en español, agregar:

```ts
    expect(html).toContain("AK47 con camuflaje digital");
    expect(html).toContain('src="/rust/skins/10135.webp"');
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games/rust/tools/tests/test_site_data.py -v` → ERROR (`build()` no acepta `skins`). El de peso pasa (todavía no está todo).

- [ ] **Step 3: `site_data.py`**

Cambiar la firma a `def build(items_doc, loot, shops, mixing=None, deployables=None, skins=None):`, agregar al diccionario de cada ficha:

```python
            "skins": (skins or {}).get("items", {}).get(i["id"], []),
```

y en `main()`: `out = build(load("items.json"), load("loot.json"), load("shops.json"), optional("mixing.json"), optional("deployables.json"), optional("skins.json"))`.

Run: `python games/rust/tools/site_data.py` y `python -m unittest discover -s games/rust/tools/tests -v` → PASS. Anotar el peso del archivo más grande:

```bash
python -c "import gzip,pathlib; print(max((len(gzip.compress(p.read_bytes())), p.name) for p in pathlib.Path('games/rust/data/site/items').glob('*.json')))"
```

- [ ] **Step 4: El sitio**

4a. `data.ts`, en `Ficha`:

```ts
  /** `icon`: ruta debajo de `/rust/` sin `.webp` (`skins/10135` o `items/rifle.ak.ice`). */
  skins: { id: number; name: Loc; icon: string | null; workshop: boolean }[];
```

4b. `rustCopy.ts`, interfaz: `skins: (n: string) => string;` y `workshop: string;`.
EN: `skins: (n) => \`Skins (${n})\`, workshop: "Workshop",` — ES: `skins: (n) => \`Skins (${n})\`, workshop: "Workshop",` ("skin" es la palabra que usa la comunidad hispana de Rust).

4c. En `FichaMore.tsx`:

```tsx
/** Las skins que trae el juego para este objeto, con su ícono. Las de workshop llevan la etiqueta. */
export function SkinsSection({ ficha }: { ficha: Ficha }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  if (!ficha.skins.length) return null;
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{t.skins(ficha.skins.length.toLocaleString(locale))}</h2>
      <ul className="rs-skins">
        {ficha.skins.map((s) => (
          <li key={s.id}>
            <span className="rs-slot">
              {s.icon && <img src={`/rust/${s.icon}.webp`} alt="" width={64} height={64} loading="lazy" />}
            </span>
            <span>{say(s.name, lang)}</span>
            {s.workshop && <em className="rs-tag">{t.workshop}</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

4d. En `ItemFicha.tsx`, importar `SkinsSection` y ponerla al final, después de `<RepairSection …/>`.

4e. En `rust-items.css`:

```css
/* Las skins, en la misma grilla que la lista de objetos. */
.rs-skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.rs-skins li { display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.2; color: var(--rs-soft); }
.rs-skins .rs-slot { padding: 10px; }
.rs-skins .rs-tag { margin: 0; align-self: start; }
```

- [ ] **Step 5: Correr los tests**

Run (desde `site/`): `npx vitest run test/rust` → PASS. `npx tsc --noEmit -p .` limpio.

- [ ] **Step 6: Ver en localhost**

`/es/rust/objetos/fusil-de-asalto`: 12 skins con ícono (3 de las de cristal pueden venir sin ícono: casillero vacío, sin texto roto); a 375 px, dos o tres por fila, y los nombres largos ("Rifle de Asalto de Diamante Rosa") bajan de renglón sin cortar palabras.

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/data/site site/src/rust/items site/src/rustCopy.ts site/src/styles/rust-items.css site/test/rustItems.test.ts
git commit -m "feat(rust): las skins del juego en cada ficha, y un tope de peso para los archivos de fichas" -m "Doce skins para el AK con su ícono y su nombre oficial. Ningún archivo de fichas puede pasar de 48 KB con gzip: lo cuida un test, porque cada ficha baja su archivo entero."
```

---

### Task B9: Build, prerender, revisión en celular y avance

**Files:**
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Todos los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v` → PASS (con el juego instalado, ~5 min).
Run (desde `site/`): `npx vitest run` → PASS salvo `test/deadlock.test.ts` y `test/deadlockBuilds.test.ts`, ajenos.

- [ ] **Step 2: Build completo**

Run (desde `site/`): `npm run build`
Expected: termina sin errores; la guardia de "cargando…" no salta; la cantidad de rutas es la de antes (24.288 o la de hoy). `dist/rust/skins/` existe.

- [ ] **Step 3: Peso**

```bash
python -c "import gzip,pathlib; s=sorted(len(gzip.compress(p.read_bytes())) for p in pathlib.Path('games/rust/data/site/items').glob('*.json')); print('máx', s[-1], 'mediana', s[len(s)//2])"
```

Expected: máximo < 48.000 bytes. Anotar el número en el avance.

- [ ] **Step 4: Revisión visual (localhost, 375 px y escritorio, en/es)**

En el panel Browser de la app (no redimensionar el Chrome de ZoTaD), con `resize_window` del panel:
- `/es/rust/objetos/fusil-de-asalto`: efectos no (no tiene), crafteo con banco 3, reciclaje en cuatro filas, botín con científicos y estado, reparación, skins;
- `/es/rust/objetos/municion-de-escopeta-de-40-mm` (o su slug): reciclaje "× 3 + 75 %" y "× 1" en la verde, y los científicos pesados ×4–21;
- `/es/rust/objetos/fragmentos-de-metal`: se obtiene reciclando (20 y el botón), fundiendo, del suelo, regalos;
- `/es/rust/objetos/puerta-de-chapa`: construcción completa;
- `/es/rust/objetos/jeringa-medica` y `/es/rust/objetos/carne-de-oso-cocinada`: efectos;
- `/en/rust/items/small-present`: qué trae.
En todas: sin scroll horizontal, ninguna palabra cortada, sin bordes de color, la página prerenderizada (ver el HTML de `dist`) trae las secciones nuevas.

- [ ] **Step 5: Registrar el avance**

Agregar a `.superpowers/sdd/progress.md`:

```markdown
# Progreso: docs/superpowers/plans/2026-10-05-rust-objetos-2b.md
Base del plan 2b: <commit de B1>
B1..B9 y A1..A7: <estado por tarea, con commits y lo que dejó la revisión>.
Peso: archivo de fichas más grande <N> KB con gzip.
Pendiente para ZoTaD: los nombres hechos a mano (científicos por lugar, entrega de Papá Noel) y si se instala el servidor dedicado (plan 2c).
```

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(rust): el avance del plan 2b"
```

---

## Fuera de este plan (y por qué)

- **Botín del Drybox de las lanchas** ("Scientist PT Boat Drybox", "Scientist RHIB Drybox" en rusthelp): `ptboat_storage.prefab` y `rhib_storage_drybox.prefab` son `StorageContainer` sin tabla, y ningún `LootSpawn` del cliente da los números de rusthelp (AK 2,84 % ×1–3). Lo llena código del servidor.
- **Cuánto da cada nodo, árbol y animal** (mineral de metal ×250–600, grasa del oso ×46–100…): los `ResourceDispenser` de esos prefabs no vienen en el cliente; sólo quedan los de algunos árboles de monumentos y los bloqueos del laboratorio (500 fragmentos y 10 de metal de alta calidad). Mostrar sólo esos sería engañoso. Lo de "se obtiene de" que sí sale del juego (recolectables, fundir, cocinar, quemar, usar, mesa de mezcla, abrir regalos) entra en A5, A2 y B6.
- **Desgaste de 442 de los 532 deployables** (banco de trabajo, armario, muro alto de piedra…): el cliente no trae su `DeployableDecay`. Se muestra donde está y no se inventa el resto.
- **Costo del árbol tecnológico:** la wiki oficial dice 500 por nodo en el banco 3 y rusthelp 120 (el de la mesa de investigación); el costo de cada nodo lo calcula el código (`costOverride` = −1 en todos), así que no se puede verificar desde los datos.
- **Skins de workshop que se compran en Steam** (cientos por objeto en rusthelp, con precio de mercado): no están en el juego; salen de la API de Steam. Se muestran las 308 que trae el juego.
- **Detector de metales** ("Detected from" en rusthelp): las tablas están (`DiggableEntityLoot`, con bioma y topología), pero cómo se combinan la global y la del bioma lo decide el servidor y no está verificado.
- **Vendedor de ganado** (rusthelp: gears ×2–15 en "Livestock Vendor"): la tabla (`LivestockVendor.SaleTable`) trae presupuesto, umbral y redondeo; la cuenta es del servidor.
- **Reparación con martillo** (deployables): la fórmula de 2024 (× 0,5 del costo) da 75 fragmentos para la puerta de chapa, igual que rusthelp, pero no da sus números para la caja grande (122 y 28) ni el muro alto (1.998): algo cambió y no se sabe qué.
- **La ropa de los NPC en el cadáver:** el juego no la borra, pero `StripWear` no está claro y rusthelp no la cuenta. Queda afuera hasta probarlo en el juego.
- **Los modificadores nuevos** (pasteles, galope de la jeringa) y las `RandomOptions` de algunos peces: el número de tipo no tiene nombre verificado.
- **Guardias de Bandit Camp y científicos de Outpost:** zona segura; rusthelp tampoco los lista.
- **Cajas de eventos sin nombre de la comunidad** (`giftbox_loot`, `xmastunnellootbox`, `satellite_crate_*`) y las tiendas de las ciudades flotantes (rusthelp las tiene, nosotros todavía no las tratamos como monumento): una línea en `CONTAINERS`/`SHOP_MONUMENTS` cuando ZoTaD elija el nombre.
- **Espacios de la mochila, vida (HP), "se puede poner en barcos" y controlador/coronas de puertas:** el campo no se identificó (mochila, controlador) o es del plan 3 (vida, con la calculadora de raideo).

## Diferencias con rusthelp que se dejan así

- **Tiempo de fabricación:** rusthelp da 35 s para el AK, la wiki oficial y el juego 45 s. Se sigue al juego.
- **Algunas probabilidades de armas y munición** son más altas que en rusthelp (escopeta de corredera en la entrega aérea 38,96 % contra 23,44 %; 5,56 en la caja bloqueada 37 % ×50–170 contra 30 % ×120; huevos de Pascua). Las tablas del juego tienen entradas repetidas (la escopeta aparece dos veces en `GunRoll_Medium`) y nuestro cálculo las suma, como el juego; rusthelp parece no hacerlo (o simula). En los casos sin repetidos, los números coinciden al centésimo.
- **Estado de la escopeta de corredera en la caja de élite:** rusthelp "1–2 %", nosotros "1–3 %" (0,01–0,03 redondeado; rusthelp trunca).

## Plan 2c (propuesto, necesita permiso para descargar)

Casi todo lo que queda afuera vive en el **servidor dedicado de Rust** (Steam, app 258550, gratis, varios GB con SteamCMD). Sus prefabs traen lo que el cliente no (los `ResourceDispenser` de nodos, árboles y animales, todo el `DeployableDecay`, la tabla del Drybox, la cuenta del vendedor de ganado), y su código es .NET sin IL2CPP (`RustDedicated_Data/Managed/Assembly-CSharp.dll`), así que las fórmulas se leen exactas en vez de inferirlas del código de 2024. Un plan 2c sería: instalarlo con SteamCMD en `C:\RustServer` (fuera del repo), sumar `SERVER_DIR` a las herramientas y repetir las sondas de este plan sobre sus bundles. **No se descarga nada sin el visto bueno de ZoTaD.**
