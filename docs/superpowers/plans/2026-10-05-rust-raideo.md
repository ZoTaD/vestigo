# Rust — plan 3: la calculadora de raideo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/en/rust/raid` y `/es/rust/raideo` existan. La página tiene:
- un selector de objetivos con cantidades (paredes por grado, puertas, ventanas, muros externos, TC, torreta…);
- cuántos explosivos de cada tipo hacen falta, con el azufre, la pólvora y el tiempo de crafteo;
- la mezcla más barata en azufre;
- la tabla completa objetivo × explosivo;
- un link para compartir la selección.

También se suman los dos bloques de raideo de las fichas de Objetos ("Cuánto cuesta romperlo" y "Qué rompe") y el adelanto de la calculadora en la portada.

**Architecture:**
- **Datos:** `games/rust/tools/raid.py` lee el juego con el `World` de `world.py` (plan 2). Junta la vida y la protección de cada objetivo, el daño de cada explosivo y su costo, recursivo desde las recetas. Hace la cuenta de daño por unidad y escribe `games/rust/data/raid.json`, que es chico (~15 KB).
- **Sitio:** `rust/raid/model.ts` divide la vida por el daño, arma la mezcla más barata (programación dinámica sobre el daño) y lee y escribe la selección en la URL. La pestaña `rust/raid/RustRaid.tsx` va en su chunk. Los bloques de la ficha y de la portada usan el mismo `model.ts`.
- **La fórmula, en un solo lugar (Python):** daño por unidad = Σ (daño del tipo × (1 − protección del tipo)). El sitio sólo hace `ceil(vida ÷ daño)`.

**Tech Stack:** Python 3.14 + UnityPy 1.25.4, React 18 + Vite + TypeScript, Vitest.

## Global Constraints

- **Requiere el plan 2 terminado** (`docs/superpowers/plans/2026-10-05-rust-objetos.md`): usa `world.World`, `site/src/rust/items/*`, `useLoad`, `RsLoading`, `RUST_TAB_FILES` y el `TABS` de `Rust.tsx`.
- Diseño: `docs/design/2026-10-05-rust.md`, sección "3. Raideo". Estética A "Inventario": paneles `rgba(30,30,28,.78)` sin bordes, casilleros `rgba(255,255,255,.07)`, texto `#e2dbd3`, secundario `#a39d93`, verde de acción `#55702a` con texto blanco, Roboto Condensed.
- Todo texto en inglés y español. En español la pestaña es `raideo`. Los nombres de objetos y explosivos son los oficiales del juego (es-ES): "Carga explosiva con temporizador", "Misil", "Bolsa explosiva"… En los textos propios se puede decir "C4", porque así lo busca la gente.
- Nada de "sacado de los archivos del juego" en la UI.
- Sin bordes ni barras de color en tarjetas o filas: el estado va por tinte, texto o cifra.
- Los títulos se achican con container queries y las palabras nunca se cortan.
- Celular (375 px): sin scroll horizontal de la página. La tabla completa puede deslizarse adentro de su propio contenedor (`overflow-x: auto`); la página no.
- Comentarios y commits en español rioplatense, explicando el porqué. Sin `Co-Authored-By`.
- Tests de TS: `npx vitest run <archivo>` desde `site/`. Tests de Python: `python -m unittest discover -s games/rust/tools/tests -v` desde la raíz del worktree.
- Worktree `C:\Users\Zotad\Desktop\vestigo-rust`, rama `feat/rust`, servidor local `vestigo-rust` (puerto 5179). Máximo 2 subagentes a la vez. **A `main` NO** hasta que ZoTaD lo pida.
- **Datos verificados al relevar (2026-10-05), build de Steam 25681799.** Si el código da otra cosa, pará y avisá antes de tocar un test.
  - **Tipos de daño:** índices de `ProtectionProperties.amounts` (28 valores): Bullet 9, Heat 5, BluntTrauma 11, Stab 15, Explosion 16, AntiVehicle 22.
  - **Grados** (`BuildingGrade`, content.bundle):

    | Grado | Vida | Protección |
    |---|---|---|
    | `twigs` | 10 | `BlockTwig` |
    | `wood` | 250 | `BlockWood` |
    | `stone` | 500 | `BlockStone` |
    | `metal` | 1000 | `BlockMetal` |
    | `toptier` | 2000 | `BlockMetal` |

    - Todas las piezas de construcción tienen `Construction.healthMultiplier` 1,0: pared, cimiento, piso y marco tienen la misma vida en cada grado.
  - **Protección contra explosión:**
    - `BlockWood` 0,1, `BlockStone` 0,5, `BlockMetal` 0,5;
    - `MetalDoor` 0,2 y `WoodDoor` −1,0 (la explosión le hace el doble);
    - otras de `BlockStone`: Bullet 0,99, Blunt 0,98, Stab 0,95.
  - **Explosivos** (`damageTypes` del prefab, assetscenes.bundle):

    | Explosivo | Prefab | Daño | Falla |
    |---|---|---|---|
    | C4 | `assets/prefabs/tools/c4/explosive.timed.deployed.prefab` | Explosion 550 | — |
    | Cohete | `assets/prefabs/ammo/rocket/rocket_basic.prefab` | Explosion 275, Blunt 75 | — |
    | Cohete HV | `assets/prefabs/ammo/rocket/rocket_hv.prefab` | Explosion 30, Bullet 150, AntiVehicle 300 | — |
    | Carga de mochila | `assets/prefabs/weapons/satchelcharge/explosive.satchel.deployed.prefab` | Explosion 75, Blunt 200, Stab 200 | `dudChance` 0,2 |
    | Bean can | `assets/prefabs/weapons/beancan grenade/grenade.beancan.deployed.prefab` | Explosion 15, Blunt 50, Stab 50 | `dudChance` 0,15 |
    | Granada HE de 40 mm | `assets/prefabs/ammo/40mmgrenade/40mm_grenade_he.prefab` | Explosion 35, Blunt 55 | — |

    **Bala explosiva 5.56** (`ammo.rifle.explosive`):
    - la bala (`assets/prefabs/ammo/rifle/riflebullet_explosive.prefab`) hace Bullet 50 y Explosion 0,01;
    - el daño radial (`ItemModProjectileRadialDamage` del objeto) hace Explosion 5;
    - contra construcciones, la parte de bala cuenta al 40 % (`BULLET_ON_BUILDING = 0.4`). No se encontró de dónde sale en el código. Se calibró con dos valores conocidos de la comunidad (pared de piedra 185 balas, de madera 49), y el 0,4 da los dos exactos. Contra chapa y blindado la bala no cuenta (Bullet 0,9999), así que el factor no cambia nada ahí.
  - **Objetivos con prefab** (vida, protección):
    - puertas:
      - `door.hinged.wood` 200 `WoodDoor`, `door.hinged.metal` 250 `MetalDoor`, `door.hinged.toptier` 1000 `MetalDoor`;
      - las dobles (`door.double.hinged.*`), con la misma vida que las simples;
      - `wall.frame.garagedoor` 600 `MetalDoor` y `floor.ladder.hatch` 250 `MetalDoor`;
      - `wall.frame.shopfront.metal` 750 `BlockMetal`;
    - ventanas y rejas: `wall.window.bars.metal` 500 `BlockMetal`, `wall.window.bars.toptier` 500 `BlockMetal`, `wall.window.glass.reinforced` 350 `BlockMetal` y `shutter.metal.embrasure.a` 500 `DeployableMetal`;
    - muros y portones externos, todos de 500: los de madera con `BlockWood`, los de piedra con `BlockStone`;
    - deployables: `cupboard.tool` 100 `WoodDoor`, `autoturret` 1000 `turret_protection`, `wall.frame.cell` y `wall.frame.cell.gate` 300 `MetalDoor`, `floor.grill` 250 `MetalDoor`, `workbench3` 750 `DeployableMetal` y `box.wooden.large` 300 `DeployableWood`.
  - **Costos (recetas de `items.json`):**
    - pólvora: 30 carbón + 20 azufre → 10;
    - explosivos: 50 pólvora + 3 combustible de grado bajo + 10 azufre + 10 fragmentos → 1;
    - **en azufre:** C4 2.200, cohete 1.400, cohete HV 200, bean can 120, carga de mochila 480 (4 bean cans), bala explosiva 25 (la receta da 2);
    - la granada HE de 40 mm no se craftea: no tiene costo.
  - **Valores de la comunidad que los tests exigen exactos** (cantidad sin contar fallas):

    | Objetivo | C4 | Cohete | Carga de mochila | Bean can |
    |---|---|---|---|---|
    | Pared de madera | 1 | 2 | 3 | — |
    | Pared de piedra | 2 | 4 | 10 | 46 |
    | Pared de chapa | 4 | 8 | 23 | — |
    | Pared blindada | 8 | 15 | 46 | — |
    | Puerta de chapa | 1 | 2 | 4 | — |
    | Puerta de garaje | 2 | 3 | 9 | — |
    | Puerta de madera | — | — | 2 | — |

    **Bala explosiva**, con ±2 de tolerancia por los decimales: piedra 185, madera 49, chapa 400, puerta de chapa 63, garaje 150.

---

## File Structure

**Python:**
- `games/rust/tools/raid.py` (crear): objetivos, explosivos, daño por unidad y costos. Escribe `games/rust/data/raid.json`.
- `games/rust/tools/tests/test_raid.py` (crear).
- `games/rust/README.md` (modificar): el paso nuevo.

**Sitio (`site/src/`):**
- `rust/raid/model.ts` (crear): tipos, `hitsFor`, `cheapestMix`, `selectionCost`, `parseSelection`, `formatSelection`, `targetForItem`, `explosiveById`.
- `rust/raid/RustRaid.tsx` (crear): la pestaña.
- `rust/raid/RaidTable.tsx` (crear): la tabla completa, que la usan la pestaña y nadie más.
- `rust/items/RaidBlocks.tsx` (crear): los dos bloques de la ficha.
- `rust/RaidPreview.tsx` (crear): el adelanto de la portada.
- `styles/rust-raid.css` (crear).
- **Se modifican:**
  - `rustCopy.ts`: textos;
  - `route.ts`: `RUST_PUBLISHED`;
  - `Rust.tsx`: `TABS`;
  - `areaFiles.ts`: `RUST_TAB_FILES`;
  - `rust/items/ItemFicha.tsx`: monta `RaidBlocks`;
  - `rust/RustHome.tsx`: monta `RaidPreview`;
  - `prerender.ts`: JSON-LD de la calculadora.
- **Tests (`site/test/`):** `rustRaidModel.test.ts`, `rustRaid.test.ts` y `rustRaidBlocks.test.ts` (crear). Se modifican `rustRoute.test.ts`, `rustHome.test.ts` y `rustSeo.test.ts`.

---

### Task 1: El extractor de raideo (`raid.py`)

**Files:**
- Create: `games/rust/tools/raid.py`
- Create: `games/rust/tools/tests/test_raid.py`
- Modify: `games/rust/README.md`
- Create (salida): `games/rust/data/raid.json`

**Interfaces:**
- Consumes:
  - `world.World` (plan 2): `.behaviours(classes)`, `.go_name(o, tt)`, `.obj(owner, ref)` y `.tree(o)`;
  - `extract.DATA`;
  - `games/rust/data/items.json`.
- Produces: `games/rust/data/raid.json`:
  ```
  { "explosives": [ { "id": "explosive.timed", "slug": "timed-explosive-charge", "name": {en, es}, "dud": 0,
                      "cost": { "sulfur": 2200, "gunpowder": 1000, "time": 330, "raw": { "sulfur": 2200, "charcoal": 3000, … } } | null } ],
    "targets": [ { "id": "building.stone", "kind": "building", "slug": null, "item": null, "icon": "stones",
                   "name": {en, es}, "hp": 500, "dmg": { "explosive.timed": 275, "ammo.rocket.basic": 139, … } } ] }
  ```
  - `kind` es uno de `building`, `door`, `window`, `external` o `deployable`;
  - `item` es el shortname del objeto si el objetivo es un objeto (puerta, TC…), y `slug` el de su ficha;
  - `dmg` es el daño por unidad de cada explosivo, con 3 decimales; un explosivo que no le hace nada no aparece;
  - el orden es el de `EXPLOSIVES` y `TARGETS`.
- Python: `damage_per_unit(damage_types, prot) -> float`, `hits(hp, dmg) -> int | None`, `craft_cost(sid, items, qty=1.0) -> dict | None`, `collect() -> dict`, `main()`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `games/rust/tools/tests/test_raid.py`:

```python
"""
Tests de `raid.py` (2026-10-05): daño por unidad, golpes, costos y una muestra de valores conocidos de la comunidad.

La parte sin el juego prueba las cuentas con números a mano y con `items.json`. La parte con el juego lee los bundles
una vez (~30 s) y compara ~25 combinaciones objetivo × explosivo con lo que sabe cualquier jugador de Rust.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402
import raid  # noqa: E402

HAVE_GAME = (extract.BUNDLES / "shared" / "assetscenes.bundle").exists()
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        _DATA = raid.collect()
    return _DATA


def items():
    return {i["id"]: i for i in json.loads((extract.DATA / "items.json").read_text(encoding="utf-8"))["items"]}


class TestDamage(unittest.TestCase):
    def test_suma_por_tipo_con_la_proteccion(self):
        prot = [0.0] * 28
        prot[16], prot[11] = 0.5, 0.98
        self.assertAlmostEqual(raid.damage_per_unit([(16, 275.0), (11, 75.0)], prot), 139.0)

    def test_proteccion_negativa_multiplica(self):
        prot = [0.0] * 28
        prot[16] = -1.0
        self.assertAlmostEqual(raid.damage_per_unit([(16, 550.0)], prot), 1100.0)

    def test_golpes(self):
        self.assertEqual(raid.hits(500, 275), 2)
        self.assertEqual(raid.hits(500, 250), 2)
        self.assertEqual(raid.hits(250, 247.5), 2)
        self.assertIsNone(raid.hits(500, 0))


class TestCraftCost(unittest.TestCase):
    def test_azufre_y_polvora_de_cada_explosivo(self):
        it = items()
        want = {
            "explosive.timed": (2200, 1000), "ammo.rocket.basic": (1400, 650), "ammo.rocket.hv": (200, 100),
            "grenade.beancan": (120, 60), "explosive.satchel": (480, 240), "ammo.rifle.explosive": (25, 10),
        }
        for sid, (sulfur, gunpowder) in want.items():
            c = raid.craft_cost(sid, it)
            self.assertAlmostEqual(c["raw"]["sulfur"], sulfur, msg=sid)
            self.assertAlmostEqual(c["gunpowder"], gunpowder, msg=sid)

    def test_lo_que_no_se_craftea_no_tiene_costo(self):
        self.assertIsNone(raid.craft_cost("ammo.grenadelauncher.he", items()))


# (objetivo, explosivo) → golpes exactos, sin contar fallas. Ver "Global Constraints" del plan.
KNOWN = {
    ("building.wood", "explosive.timed"): 1, ("building.wood", "ammo.rocket.basic"): 2, ("building.wood", "explosive.satchel"): 3,
    ("building.stone", "explosive.timed"): 2, ("building.stone", "ammo.rocket.basic"): 4, ("building.stone", "explosive.satchel"): 10,
    ("building.stone", "grenade.beancan"): 46,
    ("building.metal", "explosive.timed"): 4, ("building.metal", "ammo.rocket.basic"): 8, ("building.metal", "explosive.satchel"): 23,
    ("building.toptier", "explosive.timed"): 8, ("building.toptier", "ammo.rocket.basic"): 15, ("building.toptier", "explosive.satchel"): 46,
    ("door.hinged.metal", "explosive.timed"): 1, ("door.hinged.metal", "ammo.rocket.basic"): 2, ("door.hinged.metal", "explosive.satchel"): 4,
    ("wall.frame.garagedoor", "explosive.timed"): 2, ("wall.frame.garagedoor", "ammo.rocket.basic"): 3, ("wall.frame.garagedoor", "explosive.satchel"): 9,
    ("door.hinged.wood", "explosive.satchel"): 2,
}
# La bala explosiva, con ±2 (los decimales de la parte de bala).
KNOWN_AMMO = {"building.stone": 185, "building.wood": 49, "building.metal": 400, "door.hinged.metal": 63, "wall.frame.garagedoor": 150}


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestRaidInGame(unittest.TestCase):
    def target(self, tid):
        return next(t for t in data()["targets"] if t["id"] == tid)

    def test_valores_conocidos_de_la_comunidad(self):
        for (tid, eid), want in KNOWN.items():
            t = self.target(tid)
            self.assertEqual(raid.hits(t["hp"], t["dmg"][eid]), want, (tid, eid, t["hp"], t["dmg"][eid]))

    def test_bala_explosiva(self):
        for tid, want in KNOWN_AMMO.items():
            t = self.target(tid)
            got = raid.hits(t["hp"], t["dmg"]["ammo.rifle.explosive"])
            self.assertLessEqual(abs(got - want), 2, (tid, got, want))

    def test_vida_de_los_grados_y_puertas(self):
        want = {"building.twigs": 10, "building.wood": 250, "building.stone": 500, "building.metal": 1000, "building.toptier": 2000,
                "door.hinged.metal": 250, "door.hinged.toptier": 1000, "wall.frame.garagedoor": 600, "cupboard.tool": 100}
        for tid, hp in want.items():
            self.assertEqual(self.target(tid)["hp"], hp, tid)

    def test_cada_explosivo_con_nombre_y_falla(self):
        ex = {e["id"]: e for e in data()["explosives"]}
        self.assertEqual(ex["explosive.satchel"]["dud"], 0.2)
        self.assertEqual(ex["grenade.beancan"]["dud"], 0.15)
        self.assertEqual(ex["explosive.timed"]["dud"], 0)
        self.assertEqual(ex["explosive.timed"]["name"]["es"], "Carga explosiva con temporizador")
        self.assertIsNone(ex["ammo.grenadelauncher.he"]["cost"])

    def test_todos_los_objetivos_tienen_nombre_y_algo_que_los_rompe(self):
        for t in data()["targets"]:
            self.assertTrue(t["name"]["en"] and t["name"]["es"], t["id"])
            self.assertTrue(t["dmg"], t["id"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -p "test_raid.py" -v`
Expected: ERROR `ModuleNotFoundError: No module named 'raid'`.

- [ ] **Step 3: Implementar `raid.py`**

Crear `games/rust/tools/raid.py`:

```python
"""
Los datos de la calculadora de raideo de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md.

Por cada objetivo (pared de cada grado, puertas, ventanas, muros externos, deployables) la vida y la protección del
juego, y por cada explosivo su daño y su costo. La cuenta es la del juego: daño por unidad = Σ por tipo de daño
(daño × (1 − protección)); golpes = ⌈vida ÷ daño por unidad⌉. Se escribe ya hecha (`dmg` por objetivo y explosivo) para
que el sitio sólo divida: la fórmula vive en un solo lugar.

No se cuenta el radio de la explosión (se supone pegado al objetivo) ni las fallas de la carga de mochila y la bean can
(el sitio las avisa aparte, con su probabilidad).

Lee assetscenes, content e items.preload con el `World` de `world.py` (~30 s) y `games/rust/data/items.json` (nombres,
slugs y recetas). Escribe `games/rust/data/raid.json`.

Uso, desde la raíz del repo:
    python games/rust/tools/raid.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import DATA  # noqa: E402
from world import World  # noqa: E402

# El enum `DamageType` del juego: el índice en `ProtectionProperties.amounts`. Relevado el 2026-10-05 (BlockStone tiene
# Explosion 0,5 en el 16 y Bullet 0,99 en el 9).
BULLET, EXPLOSION = 9, 16
# La parte de bala de la munición explosiva cuenta al 40 % contra construcciones. Calibrado con dos valores conocidos de
# la comunidad (pared de piedra 185 balas, de madera 49), que el 0,4 da exactos; el origen en el código del juego no se
# encontró. Contra chapa y blindado no cambia nada: la protección contra bala es 0,9999.
BULLET_ON_BUILDING = 0.4

# Los grados de construcción: (BuildingGrade.m_Name, nombre en/es, ícono). Todas las piezas tienen
# `healthMultiplier` 1,0, así que "pared" vale por piso, cimiento o marco del mismo grado (la página lo aclara).
GRADES = [
    ("twigs", ("Twig wall", "Pared de ramitas"), "wood"),
    ("wood", ("Wooden wall", "Pared de madera"), "wood"),
    ("stone", ("Stone wall", "Pared de piedra"), "stones"),
    ("metal", ("Sheet metal wall", "Pared de chapa"), "metal.fragments"),
    ("toptier", ("Armored wall", "Pared blindada"), "metal.refined"),
]
# Los objetivos que son un objeto: (shortname, tipo, prefab). El nombre y el ícono salen del objeto.
P = "assets/prefabs/"
TARGETS = [
    ("door.hinged.wood", "door", P + "building/door.hinged/door.hinged.wood.prefab"),
    ("door.hinged.metal", "door", P + "building/door.hinged/door.hinged.metal.prefab"),
    ("door.hinged.toptier", "door", P + "building/door.hinged/door.hinged.toptier.prefab"),
    ("door.double.hinged.wood", "door", P + "building/door.double.hinged/door.double.hinged.wood.prefab"),
    ("door.double.hinged.metal", "door", P + "building/door.double.hinged/door.double.hinged.metal.prefab"),
    ("door.double.hinged.toptier", "door", P + "building/door.double.hinged/door.double.hinged.toptier.prefab"),
    ("wall.frame.garagedoor", "door", P + "building/wall.frame.garagedoor/wall.frame.garagedoor.prefab"),
    ("floor.ladder.hatch", "door", P + "building/floor.ladder.hatch/floor.ladder.hatch.prefab"),
    ("wall.frame.shopfront.metal", "door", P + "building/wall.frame.shopfront/wall.frame.shopfront.metal.prefab"),
    ("wall.window.bars.metal", "window", P + "building/wall.window.bars/wall.window.bars.metal.prefab"),
    ("wall.window.bars.toptier", "window", P + "building/wall.window.bars/wall.window.bars.toptier.prefab"),
    ("wall.window.glass.reinforced", "window", P + "building/wall.window.reinforcedglass/wall.window.glass.reinforced.prefab"),
    ("shutter.metal.embrasure.a", "window", P + "building/wall.window.embrasure/shutter.metal.embrasure.a.prefab"),
    ("wall.external.high", "external", P + "building/wall.external.high.wood/wall.external.high.wood.prefab"),
    ("wall.external.high.stone", "external", P + "building/wall.external.high.stone/wall.external.high.stone.prefab"),
    ("gates.external.high.wood", "external", P + "building/gates.external.high/gates.external.high.wood/gates.external.high.wood.prefab"),
    ("gates.external.high.stone", "external", P + "building/gates.external.high/gates.external.high.stone/gates.external.high.stone.prefab"),
    ("cupboard.tool", "deployable", P + "deployable/tool cupboard/cupboard.tool.deployed.prefab"),
    ("autoturret", "deployable", P + "npc/autoturret/autoturret_deployed.prefab"),
    ("wall.frame.cell", "deployable", P + "building/wall.frame.cell/wall.frame.cell.prefab"),
    ("wall.frame.cell.gate", "deployable", P + "building/wall.frame.cell/wall.frame.cell.gate.prefab"),
    ("floor.grill", "deployable", P + "building/floor.grill/floor.grill.prefab"),
    ("workbench3", "deployable", P + "deployable/tier 3 workbench/workbench3.deployed.prefab"),
    ("box.wooden.large", "deployable", P + "deployable/large wood storage/box.wooden.large.prefab"),
]
# Los explosivos, en el orden de la tabla: (shortname, prefab con `damageTypes`).
EXPLOSIVES = [
    ("explosive.timed", P + "tools/c4/explosive.timed.deployed.prefab"),
    ("ammo.rocket.basic", P + "ammo/rocket/rocket_basic.prefab"),
    ("ammo.rocket.hv", P + "ammo/rocket/rocket_hv.prefab"),
    ("explosive.satchel", P + "weapons/satchelcharge/explosive.satchel.deployed.prefab"),
    ("grenade.beancan", P + "weapons/beancan grenade/grenade.beancan.deployed.prefab"),
    ("ammo.rifle.explosive", P + "ammo/rifle/riflebullet_explosive.prefab"),
    ("ammo.grenadelauncher.he", P + "ammo/40mmgrenade/40mm_grenade_he.prefab"),
]
# Los intermedios que se abren al calcular el costo: el azufre está adentro de la pólvora, los explosivos y las bean cans
# (la carga de mochila lleva cuatro). Lo demás (tela, componentes, caños) se muestra tal cual.
EXPAND = {"gunpowder", "explosives", "grenade.beancan"}


def damage_per_unit(damage_types, prot):
    """Σ daño × (1 − protección) por tipo. `damage_types` es [(tipo, daño)]; `prot`, los 28 `amounts`."""
    return sum(amount * (1 - prot[t]) for t, amount in damage_types)


def hits(hp, dmg):
    """Cuántos hacen falta; `None` si no le hace daño. El −1e-9 evita que un 2,0000000001 por redondeo pida 3."""
    if dmg <= 0:
        return None
    return math.ceil(hp / dmg - 1e-9)


def craft_cost(sid, items, qty=1.0):
    """
    Lo que cuesta craftear `qty` unidades: {"raw": {id: cantidad}, "gunpowder": n, "time": segundos}, abriendo los
    intermedios de `EXPAND`. `gunpowder` cuenta toda la pólvora, también la que va adentro de los explosivos. `None` si
    el objeto no se craftea.
    """
    it = items.get(sid)
    c = it and it["craft"]
    if not c:
        return None
    crafts = qty / c["amount"]
    out = {"raw": {}, "gunpowder": 0.0, "time": crafts * c["time"]}
    for g in c["ingredients"]:
        n = g["amount"] * crafts
        if g["id"] == "gunpowder":
            out["gunpowder"] += n
        sub = craft_cost(g["id"], items, n) if g["id"] in EXPAND else None
        if sub:
            for k, v in sub["raw"].items():
                out["raw"][k] = out["raw"].get(k, 0.0) + v
            out["gunpowder"] += sub["gunpowder"]
            out["time"] += sub["time"]
        else:
            out["raw"][g["id"]] = out["raw"].get(g["id"], 0.0) + n
    return out


def rounded(cost):
    if cost is None:
        return None
    r = lambda x: round(x, 2) if x % 1 else int(x)  # noqa: E731
    return {
        "sulfur": r(cost["raw"].get("sulfur", 0)), "gunpowder": r(cost["gunpowder"]), "time": r(cost["time"]),
        "raw": {k: r(v) for k, v in sorted(cost["raw"].items())},
    }


def read_game(w):
    """Del juego: {grado: (vida, amounts)}, {prefab: (vida, amounts)}, {prefab: (damageTypes, dud)} y el radial de la bala."""
    grades = {}
    for o, tt, _ in w.behaviours({"BuildingGrade"}):
        if tt["m_Name"] in {g for g, _, _ in GRADES}:
            grades[tt["m_Name"]] = (tt["baseHealth"], w.tree(w.obj(o, tt["damageProtecton"]))["amounts"])
    wanted_targets = {path for _, _, path in TARGETS}
    wanted_ex = {path for _, path in EXPLOSIVES}
    targets, explosives = {}, {}
    for o, tt, cls in w.behaviours(None):
        path = w.go_name(o, tt)
        if path in wanted_targets and "startHealth" in tt and path not in targets:
            prot = w.obj(o, tt["baseProtection"])
            targets[path] = (tt["startHealth"], w.tree(prot)["amounts"])
        if path in wanted_ex and "damageTypes" in tt and path not in explosives:
            explosives[path] = ([(d["type"], d["amount"]) for d in tt["damageTypes"]], round(tt.get("dudChance", 0) or 0, 3))
    radial = None
    for o, tt, _ in w.behaviours({"ItemModProjectileRadialDamage"}):
        go = w.obj(o, tt["m_GameObject"])
        owner = next((w.tree(c) for c in w.by_file[o.assets_file.name].values()
                      if c.type.name == "MonoBehaviour" and w.tree(c).get("m_GameObject") == tt["m_GameObject"] and "shortname" in w.tree(c)), None)
        if owner and owner["shortname"] == "ammo.rifle.explosive":
            radial = (tt["damage"]["type"], tt["damage"]["amount"])
    missing = [p for p in wanted_targets | wanted_ex if p not in targets and p not in explosives]
    if missing or len(grades) != len(GRADES) or radial is None:
        raise SystemExit(f"faltan datos de raideo: prefabs {missing}, grados {sorted(grades)}, radial {radial}")
    return grades, targets, explosives, radial


def collect():
    items = {i["id"]: i for i in json.loads((DATA / "items.json").read_text(encoding="utf-8"))["items"]}
    grades, prefab_targets, prefab_ex, radial = read_game(World())

    explosives = []
    damage_of = {}
    for sid, path in EXPLOSIVES:
        types, dud = prefab_ex[path]
        if sid == "ammo.rifle.explosive":
            # La bala al 40 % contra construcciones, más la explosión radial del objeto.
            types = [(t, a * BULLET_ON_BUILDING if t == BULLET else a) for t, a in types] + [radial]
        damage_of[sid] = types
        it = items[sid]
        explosives.append({"id": sid, "slug": it["slug"], "name": it["name"], "dud": dud, "cost": rounded(craft_cost(sid, items))})

    def dmg_map(prot):
        out = {}
        for sid, _ in EXPLOSIVES:
            d = damage_per_unit(damage_of[sid], prot)
            if d > 0:
                out[sid] = round(d, 3)
        return out

    targets = []
    for g, (en, es), icon in GRADES:
        hp, prot = grades[g]
        targets.append({"id": f"building.{g}", "kind": "building", "slug": None, "item": None, "icon": icon,
                        "name": {"en": en, "es": es}, "hp": int(hp), "dmg": dmg_map(prot)})
    for sid, kind, path in TARGETS:
        hp, prot = prefab_targets[path]
        it = items[sid]
        targets.append({"id": sid, "kind": kind, "slug": it["slug"], "item": sid, "icon": sid,
                        "name": {"en": it["name"]["en"], "es": it["name"]["es"] or it["name"]["en"]}, "hp": int(hp), "dmg": dmg_map(prot)})
    return {"explosives": explosives, "targets": targets}


def main():
    got = collect()
    (DATA / "raid.json").write_text(json.dumps(got, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[rust] raideo: {len(got['targets'])} objetivos, {len(got['explosives'])} explosivos")


if __name__ == "__main__":
    main()
```

Notas para quien implementa:
- `World.behaviours(None)` tiene que devolver todos los MonoBehaviour. Si el `behaviours` del plan 2 filtra con `if cls in classes`, cambiarlo a `if classes is None or cls in classes`. Es un cambio de una línea en `world.py`, y sus tests tienen que seguir en verde.
- `read_game` toma el prefab sólo si el nombre de su GameObject es la ruta completa: las instancias dentro de escenas tienen nombres cortos y no entran.
- Buscar el dueño del `ItemModProjectileRadialDamage` recorriendo todos los objetos del archivo es lento (1 vez, ~1 s en items.preload). Si tarda más de 10 s, cambiarlo por un índice `{m_GameObject.m_PathID: shortname}` armado una vez con los `ItemDefinition` (como hace `extract.build_items`).

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS todo. Si falla `test_valores_conocidos_de_la_comunidad`, el mensaje trae `(objetivo, explosivo, vida, daño)`: **pará y avisá** con eso. No se toca el número del test.

- [ ] **Step 5: Escribir los datos**

Run: `python games/rust/tools/raid.py`
Expected: `[rust] raideo: 29 objetivos, 7 explosivos` (5 grados + 24 con prefab).

Run: `python -c "import json;d=json.load(open('games/rust/data/raid.json',encoding='utf-8'));t=next(x for x in d['targets'] if x['id']=='building.stone');print(t['dmg']);print(d['explosives'][0]['cost'])"`
Expected:
- `explosive.timed: 275.0` y `ammo.rocket.basic: 139.0` en la pared de piedra;
- el C4 con `sulfur: 2200`, `gunpowder: 1000` y `time: 330`: 30 s del C4, más 20 × 5 s de los explosivos, más 100 tandas de pólvora × 2 s.

- [ ] **Step 6: README**

En `games/rust/README.md`, en "En cada actualización", después del paso de `world.py`, agregar:

```markdown
4. `python games/rust/tools/raid.py` (vida, protección y daño para la calculadora de raideo; ~30 s).
```

y renumerar los pasos siguientes.

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/raid.py games/rust/tools/world.py games/rust/tools/tests/test_raid.py games/rust/README.md games/rust/data/raid.json
git commit -m "feat(rust): los datos de la calculadora de raideo, validados contra los valores que conoce la comunidad"
```

---

### Task 2: El modelo de la calculadora (`model.ts`)

**Files:**
- Create: `site/src/rust/raid/model.ts`
- Create: `site/test/rustRaidModel.test.ts`

**Interfaces:**
- Consumes: `games/rust/data/raid.json` (Task 1) por el alias `@rust`.
- Produces (`model.ts`):
  - tipos `Explosive`, `Target`, `Kind`, `Selection = Record<string, number>`, `Mix = { counts: Record<string, number>; sulfur: number }`;
  - `EXPLOSIVES: Explosive[]`, `TARGETS: Target[]`, `KINDS: Kind[]`;
  - `hitsFor(t: Target, explosiveId: string): number | null`;
  - `cheapestMix(t: Target): Mix | null`, con memo por objetivo;
  - `selectionCost(sel: Selection, explosiveId: string): { count: number; sulfur: number | null; gunpowder: number | null; time: number | null } | null`;
  - `selectionMix(sel: Selection): Mix | null`;
  - `parseSelection(search: string): Selection` y `formatSelection(sel: Selection): string`;
  - `targetForItem(itemId: string): Target | undefined` y `explosiveById(id: string): Explosive | undefined`.

- [ ] **Step 1: Escribir el test que falla**

Crear `site/test/rustRaidModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cheapestMix, EXPLOSIVES, explosiveById, formatSelection, hitsFor, parseSelection, selectionCost, selectionMix, TARGETS, targetForItem,
} from "../src/rust/raid/model";

const t = (id: string) => TARGETS.find((x) => x.id === id)!;

describe("el modelo de la calculadora de raideo", () => {
  it("divide la vida por el daño, redondeando para arriba", () => {
    expect(hitsFor(t("building.stone"), "explosive.timed")).toBe(2);
    expect(hitsFor(t("building.stone"), "ammo.rocket.basic")).toBe(4);
    expect(hitsFor(t("building.toptier"), "explosive.timed")).toBe(8);
    expect(hitsFor(t("door.hinged.metal"), "explosive.satchel")).toBe(4);
  });

  it("un explosivo que no le hace nada da null", () => {
    expect(hitsFor(t("building.stone"), "no-existe")).toBeNull();
  });

  it("la mezcla más barata rompe el objetivo y no cuesta más que el mejor explosivo solo", () => {
    for (const target of TARGETS) {
      const mix = cheapestMix(target);
      if (!mix) continue;
      const dealt = Object.entries(mix.counts).reduce((s, [id, n]) => s + n * target.dmg[id], 0);
      expect(dealt).toBeGreaterThanOrEqual(target.hp - 1e-6);
      const single = EXPLOSIVES.filter((e) => e.cost && target.dmg[e.id]).map((e) => hitsFor(target, e.id)! * e.cost!.sulfur);
      expect(mix.sulfur).toBeLessThanOrEqual(Math.min(...single) + 1e-6);
    }
  });

  it("la pared de piedra sale más barata mezclando que con 2 C4 (4.400 de azufre)", () => {
    expect(cheapestMix(t("building.stone"))!.sulfur).toBeLessThan(4400);
  });

  it("suma la selección: 2 paredes de piedra y 1 puerta de chapa con C4", () => {
    const got = selectionCost({ "building.stone": 2, "door.hinged.metal": 1 }, "explosive.timed")!;
    expect(got.count).toBe(5);
    expect(got.sulfur).toBe(5 * 2200);
  });

  it("si algún objetivo no se rompe con ese explosivo, la suma no existe", () => {
    expect(selectionCost({ "building.stone": 1 }, "no-existe")).toBeNull();
  });

  it("la mezcla de la selección suma la de cada objetivo por su cantidad", () => {
    const one = cheapestMix(t("building.stone"))!;
    expect(selectionMix({ "building.stone": 3 })!.sulfur).toBe(3 * one.sulfur);
  });

  it("la selección va y vuelve por la URL, sin objetivos desconocidos ni cantidades raras", () => {
    const sel = { "building.stone": 2, "door.hinged.metal": 1 };
    const s = formatSelection(sel);
    expect(s).toBe("?o=building.stone:2,door.hinged.metal");
    expect(parseSelection(s)).toEqual(sel);
    expect(parseSelection("?o=no.existe:3,building.wood:0,building.metal:abc,building.stone:999")).toEqual({ "building.stone": 99 });
    expect(formatSelection({})).toBe("");
  });

  it("encuentra el objetivo de un objeto y el explosivo por id", () => {
    expect(targetForItem("door.hinged.metal")?.hp).toBe(250);
    expect(targetForItem("rifle.ak")).toBeUndefined();
    expect(explosiveById("explosive.timed")?.cost?.sulfur).toBe(2200);
  });
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run (desde `site/`): `npx vitest run test/rustRaidModel.test.ts`
Expected: FAIL, no encuentra el módulo.

- [ ] **Step 3: Implementar `model.ts`**

```ts
/**
 * El modelo de la calculadora de raideo de Rust (2026-10-05), sin React. Los datos (`raid.json`, de
 * `games/rust/tools/raid.py`) traen ya el daño por unidad de cada explosivo contra cada objetivo: acá sólo se divide la
 * vida, se busca la mezcla más barata en azufre y se lee y escribe la selección en la URL.
 *
 * Lo usan la pestaña Raideo, los bloques de las fichas de Objetos y el adelanto de la portada: `raid.json` pesa ~15 KB
 * y viaja en un chunk compartido.
 */
import raid from "@rust/raid.json";

export type Kind = "building" | "door" | "window" | "external" | "deployable";
export type Loc = { en: string; es: string | null };
export interface Explosive {
  id: string;
  slug: string;
  name: Loc;
  /** La probabilidad de que falle (carga de mochila, bean can): la cantidad no la cuenta, la página la avisa. */
  dud: number;
  cost: { sulfur: number; gunpowder: number; time: number; raw: Record<string, number> } | null;
}
export interface Target {
  id: string;
  kind: Kind;
  slug: string | null;
  item: string | null;
  icon: string;
  name: Loc;
  hp: number;
  /** Daño por unidad de cada explosivo que le hace algo. */
  dmg: Record<string, number>;
}
export type Selection = Record<string, number>;
export type Mix = { counts: Record<string, number>; sulfur: number };

export const EXPLOSIVES = raid.explosives as unknown as Explosive[];
export const TARGETS = raid.targets as unknown as Target[];
export const KINDS: Kind[] = ["building", "door", "window", "external", "deployable"];
const BY_ID = new Map(TARGETS.map((t) => [t.id, t]));
const BY_ITEM = new Map(TARGETS.filter((t) => t.item).map((t) => [t.item!, t]));
const EX_BY_ID = new Map(EXPLOSIVES.map((e) => [e.id, e]));
/** El tope de cantidad por objetivo en la selección: más que eso es un error de tipeo, no una base. */
const MAX_QTY = 99;

export const targetForItem = (itemId: string) => BY_ITEM.get(itemId);
export const explosiveById = (id: string) => EX_BY_ID.get(id);

/** Cuántos hacen falta. El −1e-9 es el mismo de raid.py: un 2,0000000001 por redondeo no pide 3. */
export function hitsFor(t: Target, explosiveId: string): number | null {
  const d = t.dmg[explosiveId];
  return d && d > 0 ? Math.ceil(t.hp / d - 1e-9) : null;
}

const mixes = new Map<string, Mix | null>();

/**
 * La combinación de explosivos crafteables que rompe el objetivo con menos azufre. Programación dinámica sobre el daño,
 * en milésimas: `best[h]` es el azufre mínimo para hacer al menos `h`. raid.py redondea el daño a 3 decimales, así que
 * en milésimas la cuenta es exacta y da lo mismo que `hitsFor` (con centésimas, la bala explosiva contra madera pedía
 * una de más). Una pared blindada son 2.000.000 de estados × 6 explosivos (~20 ms): se calcula sólo cuando se pide y se
 * guarda.
 */
export function cheapestMix(t: Target): Mix | null {
  if (mixes.has(t.id)) return mixes.get(t.id)!;
  const opts = EXPLOSIVES.filter((e) => e.cost && t.dmg[e.id] > 0).map((e) => ({
    id: e.id,
    d: Math.max(1, Math.round(t.dmg[e.id] * 1000)),
    c: e.cost!.sulfur,
  }));
  let out: Mix | null = null;
  if (opts.length) {
    const H = Math.round(t.hp * 1000);
    const best = new Float64Array(H + 1).fill(Infinity);
    const pick = new Int8Array(H + 1).fill(-1);
    best[0] = 0;
    for (let h = 1; h <= H; h++) {
      for (let i = 0; i < opts.length; i++) {
        const v = best[Math.max(0, h - opts[i].d)] + opts[i].c;
        if (v < best[h]) {
          best[h] = v;
          pick[h] = i;
        }
      }
    }
    const counts: Record<string, number> = {};
    for (let h = H; h > 0; h = Math.max(0, h - opts[pick[h]].d)) counts[opts[pick[h]].id] = (counts[opts[pick[h]].id] ?? 0) + 1;
    out = { counts, sulfur: best[H] };
  }
  mixes.set(t.id, out);
  return out;
}

/** La selección entera con un solo explosivo; `null` si algún objetivo no se rompe con él. */
export function selectionCost(sel: Selection, explosiveId: string) {
  const ex = EX_BY_ID.get(explosiveId);
  if (!ex) return null;
  let count = 0;
  for (const [id, qty] of Object.entries(sel)) {
    const t = BY_ID.get(id);
    const n = t ? hitsFor(t, explosiveId) : null;
    if (n === null) return null;
    count += n * qty;
  }
  const c = ex.cost;
  return { count, sulfur: c ? c.sulfur * count : null, gunpowder: c ? c.gunpowder * count : null, time: c ? c.time * count : null };
}

/** La mezcla más barata de la selección: la de cada objetivo, por su cantidad. */
export function selectionMix(sel: Selection): Mix | null {
  const counts: Record<string, number> = {};
  let sulfur = 0;
  for (const [id, qty] of Object.entries(sel)) {
    const t = BY_ID.get(id);
    const m = t ? cheapestMix(t) : null;
    if (!m) return null;
    sulfur += m.sulfur * qty;
    for (const [e, n] of Object.entries(m.counts)) counts[e] = (counts[e] ?? 0) + n * qty;
  }
  return Object.keys(counts).length ? { counts, sulfur } : null;
}

/** `?o=building.stone:2,door.hinged.metal` → { "building.stone": 2, "door.hinged.metal": 1 }. Lo desconocido se ignora. */
export function parseSelection(search: string): Selection {
  const raw = new URLSearchParams(search).get("o");
  const out: Selection = {};
  for (const part of (raw ?? "").split(",")) {
    const [id, q] = part.split(":");
    if (!BY_ID.has(id)) continue;
    const n = q === undefined ? 1 : Number(q);
    if (Number.isInteger(n) && n > 0) out[id] = Math.min(n, MAX_QTY);
  }
  return out;
}

/** La selección para la URL; vacía, sin `?`. La cantidad 1 no se escribe. */
export function formatSelection(sel: Selection): string {
  const parts = Object.entries(sel)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => (n === 1 ? id : `${id}:${n}`));
  return parts.length ? `?o=${parts.join(",")}` : "";
}
```

- [ ] **Step 4: Correr el test**

Run (desde `site/`): `npx vitest run test/rustRaidModel.test.ts`
Expected: PASS. El test de la mezcla recorre los 29 objetivos (~15 millones de estados en total): tiene que tardar menos de 3 s. Si tarda más, avisar antes de bajar la resolución, porque con menos decimales la mezcla puede pedir un explosivo de más.

- [ ] **Step 5: Commit**

```bash
git add site/src/rust/raid/model.ts site/test/rustRaidModel.test.ts
git commit -m "feat(rust): el modelo de la calculadora de raideo (golpes, mezcla más barata y selección en la URL)"
```

---

### Task 3: La pestaña Raideo

**Files:**
- Create: `site/src/rust/raid/RustRaid.tsx`
- Create: `site/src/rust/raid/RaidTable.tsx`
- Create: `site/src/styles/rust-raid.css`
- Create: `site/test/rustRaid.test.ts`
- Modify: `site/src/rustCopy.ts`
- Modify: `site/src/route.ts` (`RUST_PUBLISHED`)
- Modify: `site/src/Rust.tsx` (`TABS`)
- Modify: `site/src/areaFiles.ts` (`RUST_TAB_FILES`)
- Modify: `site/test/rustRoute.test.ts`, `site/test/rustHome.test.ts`

**Interfaces:**
- Consumes: `model.ts` (Task 2); `say` de `rust/items/data.ts` (plan 2); `RouteLink`, `useLang` y `useLocale`.
- Produces: `RustCopy.raid` (textos de abajo) y el componente por defecto de `RustRaid.tsx`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `site/test/rustRaid.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la pestaña Raideo", () => {
  beforeAll(() => preloadTab(parseRoute("/es/rust/raideo")));

  it("tiene su h1, el selector y la tabla completa en el HTML", () => {
    const html = render("es", "/es/rust/raideo");
    expect(html).toMatch(/<h1[^>]*>Calculadora de raideo de Rust<\/h1>/);
    expect(html).toContain("Pared de piedra");
    expect(html).toContain("Puerta de chapa");
    expect(html).toContain('id="tabla"');
    expect(html).not.toContain("rs-loading");
  });

  it("la tabla dice 2 C4 para la pared de piedra", () => {
    const html = render("es", "/es/rust/raideo");
    expect(html).toMatch(/data-cell="building\.stone\|explosive\.timed"[^>]*>2</);
  });

  it("los objetivos que son objetos enlazan su ficha", () => {
    expect(render("es", "/es/rust/raideo")).toContain('href="/es/rust/objetos/puerta-de-chapa"');
  });

  it("en inglés", () => {
    const html = render("en", "/en/rust/raid");
    expect(html).toMatch(/<h1[^>]*>Rust Raid Calculator<\/h1>/);
    expect(html).toContain("Stone wall");
  });
});
```

En `site/test/rustRoute.test.ts`, el test "Objetos ya está publicada; Raideo todavía no…" pasa a ser:

```ts
  it("Objetos y Raideo están publicadas; lo que no existe muestra la portada", () => {
    expect(routePath(parseRoute("/es/rust/objetos"))).toBe("/es/rust/objetos");
    expect(routePath(parseRoute("/es/rust/raideo"))).toBe("/es/rust/raideo");
    expect(routePath(parseRoute("/en/rust/raid"))).toBe("/en/rust/raid");
    expect(routePath(parseRoute("/en/rust/no-existe"))).toBe("/en/rust");
  });
```

En `site/test/rustHome.test.ts`, el test "Objetos enlaza; Raideo y las pestañas…" pasa a ser:

```ts
  it("Objetos y Raideo enlazan; las pestañas de las etapas que vienen se ven apagadas", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust/objetos"');
    expect(html).toContain('href="/es/rust/raideo"');
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Monumentos</);
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustRaid.test.ts test/rustRoute.test.ts test/rustHome.test.ts`
Expected: FAIL (Raideo sin publicar).

- [ ] **Step 3: Textos (`rustCopy.ts`)**

En `interface RustCopy`, agregar:

```ts
  raid: {
    h1: string;
    lede: string;
    pick: string;
    kinds: Record<"building" | "door" | "window" | "external" | "deployable", string>;
    buildingNote: string;
    hp: (n: string) => string;
    add: string;
    remove: string;
    clear: string;
    empty: string;
    result: string;
    explosive: string;
    amount: string;
    sulfur: string;
    gunpowder: string;
    time: string;
    notCraftable: string;
    dud: (pct: number) => string;
    cheapest: string;
    share: string;
    copied: string;
    table: string;
    tableNote: string;
    minutes: (m: string) => string;
  };
```

EN:

```ts
  raid: {
    h1: "Rust Raid Calculator",
    lede: "Pick what you want to break and how many: you get how many explosives of each kind it takes, the sulfur it costs and the cheapest mix.",
    pick: "What do you want to break?",
    kinds: { building: "Building", door: "Doors", window: "Windows and bars", external: "External walls", deployable: "Deployables" },
    buildingNote: "Every building piece of a grade has the same health: a stone wall, floor or foundation take the same.",
    hp: (n) => `${n} HP`,
    add: "Add",
    remove: "Remove",
    clear: "Clear",
    empty: "Add something to break and the cost shows up here.",
    result: "What it takes",
    explosive: "Explosive",
    amount: "Amount",
    sulfur: "Sulfur",
    gunpowder: "Gunpowder",
    time: "Craft time",
    notCraftable: "Can't be crafted",
    dud: (pct) => `Fails ${pct}% of the time: bring extra.`,
    cheapest: "Cheapest in sulfur",
    share: "Copy link",
    copied: "Link copied",
    table: "Full raid table",
    tableNote: "Explosives needed for one of each, placed right on the target. Duds not counted.",
    minutes: (m) => `${m} min`,
  },
```

ES:

```ts
  raid: {
    h1: "Calculadora de raideo de Rust",
    lede: "Elegí qué querés romper y cuántos: te dice cuántos explosivos de cada tipo hacen falta, el azufre que cuesta y la mezcla más barata.",
    pick: "¿Qué querés romper?",
    kinds: { building: "Construcción", door: "Puertas", window: "Ventanas y rejas", external: "Muros externos", deployable: "Deployables" },
    buildingNote: "Todas las piezas de un mismo grado tienen la misma vida: una pared, un piso o un cimiento de piedra cuestan lo mismo.",
    hp: (n) => `${n} de vida`,
    add: "Sumar",
    remove: "Sacar",
    clear: "Vaciar",
    empty: "Sumá algo para romper y acá aparece lo que cuesta.",
    result: "Lo que hace falta",
    explosive: "Explosivo",
    amount: "Cantidad",
    sulfur: "Azufre",
    gunpowder: "Pólvora",
    time: "Tiempo de crafteo",
    notCraftable: "No se craftea",
    dud: (pct) => `Falla el ${pct} % de las veces: llevá de más.`,
    cheapest: "Lo más barato en azufre",
    share: "Copiar link",
    copied: "Link copiado",
    table: "Tabla completa de raideo",
    tableNote: "Explosivos para romper uno de cada uno, pegados al objetivo. Sin contar las fallas.",
    minutes: (m) => `${m} min`,
  },
```

- [ ] **Step 4: La tabla completa (`rust/raid/RaidTable.tsx`)**

```tsx
/**
 * La tabla de raideo completa (2026-10-05): cada objetivo contra cada explosivo. Va entera en el HTML (es lo que más se
 * busca: "rust raid table") y se desliza adentro de su caja en el celular, sin mover la página.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "../items/data";
import { EXPLOSIVES, hitsFor, KINDS, TARGETS } from "./model";

type Nav = (r: Route) => void;

export default function RaidTable({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useRustCopy().raid;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <section className="rs-pnl" id="tabla">
      <h2 className="rs-hd">{t.table}</h2>
      <p className="rs-note">{t.tableNote}</p>
      <div className="rs-scroll">
        <table className="rs-table rs-raid-table">
          <thead>
            <tr>
              <th scope="col" />
              {EXPLOSIVES.map((e) => (
                <th scope="col" key={e.id} title={say(e.name, lang)}>
                  <img src={`/rust/items/${e.id}.webp`} alt={say(e.name, lang)} width={32} height={32} />
                </th>
              ))}
            </tr>
          </thead>
          {KINDS.map((k) => (
            <tbody key={k}>
              <tr>
                <th scope="colgroup" colSpan={EXPLOSIVES.length + 1} className="rs-kind">
                  {t.kinds[k]}
                </th>
              </tr>
              {TARGETS.filter((x) => x.kind === k).map((x) => (
                <tr key={x.id}>
                  <th scope="row">
                    {x.slug ? (
                      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: x.slug }} onNavigate={navigate}>
                        {say(x.name, lang)}
                      </RouteLink>
                    ) : (
                      say(x.name, lang)
                    )}
                  </th>
                  {EXPLOSIVES.map((e) => {
                    const n = hitsFor(x, e.id);
                    return (
                      <td key={e.id} data-cell={`${x.id}|${e.id}`}>
                        {n === null ? "—" : n.toLocaleString(locale)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: La pestaña (`rust/raid/RustRaid.tsx`)**

```tsx
/**
 * La calculadora de raideo de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md, "3. Raideo".
 *
 * Arriba, el selector: cada objetivo con su vida y un contador. Al lado, lo que cuesta la selección con cada explosivo
 * y la mezcla más barata. Abajo, la tabla completa. La selección vive en la URL (`?o=building.stone:2`): el link se
 * comparte tal cual. Se lee al montar (el prerender sale con la selección vacía) y se escribe con `replaceState`, sin
 * llenar el historial.
 */
import { useEffect, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "../items/data";
import RaidTable from "./RaidTable";
import { EXPLOSIVES, formatSelection, KINDS, parseSelection, selectionCost, selectionMix, TARGETS, type Selection } from "./model";
import "../../styles/rust-raid.css";

type Nav = (r: Route) => void;

export default function RustRaid({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const t = c.raid;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => Math.round(n).toLocaleString(locale);
  const [sel, setSel] = useState<Selection>({});
  // Hasta leer la URL no se escribe nada: si no, el primer render (vacío, igual al prerender) borraba el `?o=` del link
  // compartido antes de leerlo.
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSel(parseSelection(window.location.search));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const url = window.location.pathname + formatSelection(sel) + window.location.hash;
    if (url !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", url);
  }, [sel, ready]);

  const bump = (id: string, d: number) =>
    setSel((s) => {
      const n = Math.max(0, Math.min(99, (s[id] ?? 0) + d));
      const next = { ...s };
      if (n) next[id] = n;
      else delete next[id];
      return next;
    });
  const picked = Object.keys(sel).length > 0;
  const mix = picked ? selectionMix(sel) : null;

  return (
    <main className="rs-main rs-raid">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede}</p>
      </section>

      <div className="rs-raid-grid">
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.pick}</h2>
          {KINDS.map((k) => (
            <div key={k} className="rs-raid-kind">
              <h3>{t.kinds[k]}</h3>
              {k === "building" && <p className="rs-note">{t.buildingNote}</p>}
              <ul className="rs-raid-targets">
                {TARGETS.filter((x) => x.kind === k).map((x) => {
                  const name = say(x.name, lang);
                  const qty = sel[x.id] ?? 0;
                  return (
                    <li key={x.id} className={qty ? "is-on" : undefined}>
                      <img src={`/rust/items/${x.icon}.webp`} alt="" width={32} height={32} />
                      <span className="rs-raid-name">
                        {name}
                        <small>{t.hp(num(x.hp))}</small>
                      </span>
                      <span className="rs-stepper">
                        <button type="button" onClick={() => bump(x.id, -1)} disabled={!qty} aria-label={`${t.remove}: ${name}`}>
                          −
                        </button>
                        <b aria-live="polite">{qty}</b>
                        <button type="button" onClick={() => bump(x.id, 1)} aria-label={`${t.add}: ${name}`}>
                          +
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="rs-pnl rs-raid-result" aria-live="polite">
          <h2 className="rs-hd">{t.result}</h2>
          {!picked ? (
            <p className="rs-note">{t.empty}</p>
          ) : (
            <>
              {mix && (
                <div className="rs-raid-mix">
                  <b>{t.cheapest}</b>
                  <span>
                    {Object.entries(mix.counts)
                      .map(([id, n]) => `${num(n)} × ${say(EXPLOSIVES.find((e) => e.id === id)!.name, lang)}`)
                      .join(" + ")}
                  </span>
                  <span className="rs-raid-sulfur">
                    {num(mix.sulfur)} {t.sulfur.toLowerCase()}
                  </span>
                </div>
              )}
              <table className="rs-table">
                <thead>
                  <tr>
                    <th scope="col">{t.explosive}</th>
                    <th scope="col">{t.amount}</th>
                    <th scope="col">{t.sulfur}</th>
                    <th scope="col">{t.gunpowder}</th>
                    <th scope="col">{t.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPLOSIVES.map((e) => {
                    const r = selectionCost(sel, e.id);
                    if (!r) return null;
                    return (
                      <tr key={e.id}>
                        <th scope="row">
                          <img src={`/rust/items/${e.id}.webp`} alt="" width={28} height={28} /> {say(e.name, lang)}
                          {e.dud > 0 && <small className="rs-dud">{t.dud(Math.round(e.dud * 100))}</small>}
                        </th>
                        <td>{num(r.count)}</td>
                        {r.sulfur === null ? (
                          <td colSpan={3} className="rs-note">{t.notCraftable}</td>
                        ) : (
                          <>
                            <td>{num(r.sulfur)}</td>
                            <td>{num(r.gunpowder!)}</td>
                            <td>{t.minutes((r.time! / 60).toLocaleString(locale, { maximumFractionDigits: 1 }))}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="rs-raid-actions">
                <button
                  type="button"
                  className="rs-btn"
                  onClick={() =>
                    navigator.clipboard?.writeText(window.location.href).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }, () => undefined)
                  }
                >
                  {copied ? t.copied : t.share}
                </button>
                <button type="button" className="rs-btn" onClick={() => setSel({})}>
                  {t.clear}
                </button>
              </p>
            </>
          )}
        </section>
      </div>

      <RaidTable route={route} navigate={navigate} />
    </main>
  );
}
```

- [ ] **Step 6: Estilos (`styles/rust-raid.css`)**

```css
/* Rust, calculadora de raideo (2026-10-05). Hereda las variables de `.rs` y las tablas de rust-items.css. */
.rs-raid { display: grid; gap: 12px; }
.rs-raid-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; align-items: start; }
.rs-raid-result { position: sticky; top: 12px; }
.rs-raid-kind h3 { margin: 14px 0 6px; font: 700 14px/1.2 "Roboto Condensed", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--rs-soft); }
.rs-raid-targets { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.rs-raid-targets li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 4px 6px; background: var(--rs-slot); }
.rs-raid-targets li.is-on { background: rgba(108, 142, 54, 0.28); }
.rs-raid-name { display: flex; flex-direction: column; font-size: 15px; line-height: 1.2; }
.rs-raid-name small { color: var(--rs-dim); font-size: 13px; }
.rs-stepper { display: inline-flex; align-items: center; gap: 6px; }
.rs-stepper button {
  width: 30px;
  height: 30px;
  border: 0;
  background: rgba(255, 255, 255, 0.08);
  color: var(--rs-text);
  font: 700 18px/1 "Roboto Condensed", sans-serif;
  cursor: pointer;
}
.rs-stepper button:hover:not(:disabled) { background: #55702a; color: #fff; }
.rs-stepper button:disabled { opacity: 0.35; cursor: default; }
.rs-stepper b { min-width: 2ch; text-align: center; }
.rs-raid-mix { display: grid; gap: 4px; margin: 0 0 12px; padding: 10px 12px; background: rgba(108, 142, 54, 0.22); }
.rs-raid-sulfur { font-size: 22px; font-weight: 800; }
.rs-dud { display: block; color: var(--rs-dim); font-size: 12px; }
.rs-raid-actions { display: flex; gap: 8px; margin: 12px 0 0; }
.rs-scroll { overflow-x: auto; }
.rs-raid-table td { text-align: center; }
.rs-raid-table thead th { text-align: center; }
.rs-kind { padding-top: 14px; color: var(--rs-dim); font: 700 12px/1.2 "Roboto Condensed", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; text-align: left; }

@media (max-width: 860px) {
  .rs-raid-grid { grid-template-columns: 1fr; }
  .rs-raid-result { position: static; }
}
```

- [ ] **Step 7: Conectar**

- `route.ts`: `export const RUST_PUBLISHED: RustTab[] = ["items", "raid"];`
- `Rust.tsx`:
  - agregar `const RsRaid = lazyWithPreload(() => import("./rust/raid/RustRaid"));`;
  - en `TABS`, `{ items: RsItems, raid: RsRaid }`. No suma `TAB_DATA`: los datos de raideo viajan con el módulo (`raid.json` es estático y chico).
- `areaFiles.ts`: `RUST_TAB_FILES` suma `raid: "src/rust/raid/RustRaid.tsx",`.
- `rustCopy.ts`: el texto del "Adelanto" de la portada ya enlaza la pestaña por `RUST_PUBLISHED`; no hay que tocarlo.

- [ ] **Step 8: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustRaid.test.ts test/rustRoute.test.ts test/rustHome.test.ts test/rustItems.test.ts test/areas.test.ts test/rustSeo.test.ts`
Expected: PASS, salvo `rustSeo.test.ts` "Objetos entra; Raideo, que todavía no se publicó, no", que ahora falla. Reemplazarlo por:

```ts
  it("Objetos y Raideo entran al sitemap", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/rust/objetos");
    expect(paths).toContain("/es/rust/raideo");
    expect(paths).toContain("/en/rust/raid");
  });
```

y volver a correr. `npx tsc --noEmit -p .` sin errores nuevos.

- [ ] **Step 9: Ver en localhost**

Con `vestigo-rust` (`preview_start`):
- abrir `http://localhost:5179/es/rust/raideo`;
- sumar 2 paredes de piedra y 1 puerta de chapa. La URL tiene que quedar `?o=building.stone:2,door.hinged.metal`, y el C4 tiene que decir 5 y 11.000 de azufre;
- recargar: la selección tiene que seguir;
- `read_console_messages` sin errores;
- captura de la página.

- [ ] **Step 10: Commit**

```bash
git add site/src/rust/raid site/src/styles/rust-raid.css site/src/rustCopy.ts site/src/route.ts site/src/Rust.tsx site/src/areaFiles.ts site/test/rustRaid.test.ts site/test/rustRoute.test.ts site/test/rustHome.test.ts site/test/rustSeo.test.ts
git commit -m "feat(rust): la calculadora de raideo, con la mezcla más barata, la tabla completa y la selección en el link"
```

---

### Task 4: Raideo en las fichas y en la portada

**Files:**
- Create: `site/src/rust/items/RaidBlocks.tsx`
- Create: `site/src/rust/RaidPreview.tsx`
- Create: `site/test/rustRaidBlocks.test.ts`
- Modify: `site/src/rust/items/ItemFicha.tsx`
- Modify: `site/src/rust/RustHome.tsx`
- Modify: `site/src/rustCopy.ts`
- Modify: `site/src/styles/rust-raid.css`
- Modify: `site/test/rustHome.test.ts`

**Interfaces:**
- Consumes: `model.ts` (Task 2), `RustCopy.raid` (Task 3), `formatSelection`.
- Produces:
  - `RustCopy.raidBlocks`: `{ toBreak: string; breaks: string; open: string }`;
  - `RustCopy.home.raidPreview`: `{ title: string; calc: string; table: string; c4: string }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `site/test/rustRaidBlocks.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("el raideo en las fichas", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/objetos/puerta-de-chapa"));
    await preloadTab(parseRoute("/es/rust/objetos/carga-explosiva-con-temporizador"));
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
  });

  it("una puerta dice cuánto cuesta romperla y abre la calculadora con ella elegida", () => {
    const html = render("es", "/es/rust/objetos/puerta-de-chapa");
    expect(html).toContain("Cuánto cuesta romperla");
    expect(html).toMatch(/data-cell="door\.hinged\.metal\|explosive\.timed"[^>]*>1</);
    expect(html).toContain('href="/es/rust/raideo?o=door.hinged.metal"');
  });

  it("el C4 dice qué rompe", () => {
    const html = render("es", "/es/rust/objetos/carga-explosiva-con-temporizador");
    expect(html).toContain("Qué rompe");
    expect(html).toMatch(/data-cell="building\.stone\|explosive\.timed"[^>]*>2</);
  });

  it("un objeto que no es ni explosivo ni objetivo no muestra nada de raideo", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).not.toContain("Qué rompe");
    expect(html).not.toContain("Cuánto cuesta romperla");
  });
});
```

En `site/test/rustHome.test.ts`, agregar:

```ts
  it("el adelanto de la calculadora: C4 y azufre para la pared de piedra, y los dos botones", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain("Pared de piedra");
    expect(html).toMatch(/data-cell="building\.stone"[^>]*>2 C4 · 4\.400</);
    expect(html).toContain('href="/es/rust/raideo"');
    expect(html).toContain('href="/es/rust/raideo#tabla"');
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustRaidBlocks.test.ts test/rustHome.test.ts`
Expected: FAIL.

- [ ] **Step 3: Textos**

En `rustCopy.ts`, interfaz:

```ts
  raidBlocks: { toBreak: string; breaks: string; open: string };
```

y en `home` (interfaz y valores) `raidPreview: { title: string; calc: string; table: string; c4: string };`.

- EN:
  - `raidBlocks: { toBreak: "What it takes to break it", breaks: "What it breaks", open: "Open in the raid calculator" }`;
  - `home.raidPreview: { title: "Raid costs", calc: "Calculate", table: "Full table", c4: "C4" }`.
- ES:
  - `raidBlocks: { toBreak: "Cuánto cuesta romperla", breaks: "Qué rompe", open: "Abrir en la calculadora de raideo" }`;
  - `home.raidPreview: { title: "Lo que cuesta raidear", calc: "Calcular", table: "Ver tabla", c4: "C4" }`.

"Cuánto cuesta romperla" va en femenino porque casi todos los objetivos son puertas, paredes o ventanas. Si ZoTaD prefiere neutro, "Cuánto cuesta romperlo"; queda anotado para la revisión.

- [ ] **Step 4: Los bloques de la ficha (`rust/items/RaidBlocks.tsx`)**

```tsx
/**
 * El raideo en la ficha de un objeto (2026-10-05): si es un objetivo (puerta, ventana, TC…), cuánto cuesta romperlo con
 * cada explosivo; si es un explosivo, qué rompe (los grados de construcción y las puertas). Los datos salen del mismo
 * `model.ts` de la calculadora, así los números nunca se contradicen.
 */
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say } from "./data";
import { EXPLOSIVES, explosiveById, formatSelection, hitsFor, targetForItem, TARGETS } from "../raid/model";

export default function RaidBlocks({ itemId, route }: { itemId: string; route: Route }) {
  const c = useRustCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const target = targetForItem(itemId);
  const explosive = explosiveById(itemId);
  if (!target && !explosive) return null;
  const raidPath = routePath({ ...route, view: "rust", rsSection: "raid", detail: undefined });
  return (
    <>
      {target && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{c.raidBlocks.toBreak}</h2>
          <table className="rs-table">
            <tbody>
              {EXPLOSIVES.map((e) => {
                const n = hitsFor(target, e.id);
                if (n === null) return null;
                return (
                  <tr key={e.id}>
                    <th scope="row">
                      <img src={`/rust/items/${e.id}.webp`} alt="" width={28} height={28} /> {say(e.name, lang)}
                    </th>
                    <td data-cell={`${target.id}|${e.id}`}>{num(n)}</td>
                    <td>{e.cost ? `${num(n * e.cost.sulfur)} ${c.raid.sulfur.toLowerCase()}` : c.raid.notCraftable}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rs-raid-actions">
            <a className="rs-btn" href={raidPath + formatSelection({ [target.id]: 1 })}>
              {c.raidBlocks.open}
            </a>
          </p>
        </section>
      )}
      {explosive && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{c.raidBlocks.breaks}</h2>
          <table className="rs-table">
            <tbody>
              {TARGETS.filter((x) => x.kind === "building" || x.kind === "door").map((x) => {
                const n = hitsFor(x, explosive.id);
                if (n === null) return null;
                return (
                  <tr key={x.id}>
                    <th scope="row">{say(x.name, lang)}</th>
                    <td data-cell={`${x.id}|${explosive.id}`}>{num(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rs-raid-actions">
            <a className="rs-btn" href={raidPath}>
              {c.raidBlocks.open}
            </a>
          </p>
        </section>
      )}
    </>
  );
}
```

Los enlaces a la calculadora van con `<a>` común y no con `RouteLink`: llevan la selección en la query, y `RouteLink` arma la dirección sólo con la ruta.

En `ItemFicha.tsx`:
- importar `RaidBlocks`;
- montarlo después de la sección de reciclaje y antes de "Dónde aparece": `<RaidBlocks itemId={ficha.id} route={route} />`.

- [ ] **Step 5: El adelanto de la portada (`rust/RaidPreview.tsx`)**

```tsx
/**
 * El adelanto de la calculadora en la portada de Rust (2026-10-05): cuatro objetivos de siempre con lo que cuestan en C4
 * y en azufre, y los botones a la calculadora y a la tabla completa.
 */
import { useLang, useLocale } from "../i18n";
import { routePath, type Route } from "../route";
import { useRustCopy } from "../rustCopy";
import { say } from "./items/data";
import { explosiveById, hitsFor, TARGETS } from "./raid/model";

const SHOWN = ["building.stone", "building.metal", "door.hinged.metal", "wall.frame.garagedoor"];

export default function RaidPreview({ route }: { route: Route }) {
  const c = useRustCopy();
  const p = c.home.raidPreview;
  const { lang } = useLang();
  const locale = useLocale();
  const c4 = explosiveById("explosive.timed")!;
  const raid = routePath({ ...route, view: "rust", rsSection: "raid", detail: undefined });
  return (
    <section className="rs-pnl">
      <h2 className="rs-hd">{p.title}</h2>
      <ul className="rs-raid-preview">
        {SHOWN.map((id) => {
          const t = TARGETS.find((x) => x.id === id)!;
          const n = hitsFor(t, c4.id)!;
          return (
            <li key={id}>
              <span>{say(t.name, lang)}</span>
              <b data-cell={id}>
                {n} {p.c4} · {(n * c4.cost!.sulfur).toLocaleString(locale)}
              </b>
            </li>
          );
        })}
      </ul>
      <p className="rs-raid-actions">
        <a className="rs-btn" href={raid}>
          {p.calc}
        </a>
        <a className="rs-btn" href={`${raid}#tabla`}>
          {p.table}
        </a>
      </p>
    </section>
  );
}
```

`4.400` en es-AR lleva punto de miles: el test lo espera así. En inglés sale `4,400`.

En `RustHome.tsx`:
- importar `RaidPreview`;
- montarlo en el `<aside className="rs-side">`, después de `<Wipe />` y antes del panel de herramientas: `<RaidPreview route={route} />`.

El estilo del adelanto va en `styles/rust.css` y no en `rust-raid.css`: la portada no carga `rust-raid.css`, y `rust.css` se carga en toda la sección. Agregar a `styles/rust.css`:

```css
.rs-raid-preview { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.rs-raid-preview li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 8px; background: var(--rs-slot); }
.rs-raid-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
a.rs-btn { display: inline-block; padding: 8px 12px; text-decoration: none; }
```

y borrar la regla `.rs-raid-actions` de `rust-raid.css` (Task 3): ahora vive en `rust.css`.

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustRaidBlocks.test.ts test/rustHome.test.ts test/rustItems.test.ts test/rustRaid.test.ts`
Expected: PASS.

Revisar el peso. `raid.json` ahora viaja con la portada (por el adelanto): mirar con `npm run build` que el chunk de `Rust.tsx` no pase de ~30 KB con gzip. Si pasa, el adelanto puede leer sólo los cuatro números de un JSON chico que escriba `raid.py` (`raid-preview.json`): avisar antes de hacerlo.

- [ ] **Step 7: Commit**

```bash
git add site/src/rust/items/RaidBlocks.tsx site/src/rust/RaidPreview.tsx site/src/rust/items/ItemFicha.tsx site/src/rust/RustHome.tsx site/src/rustCopy.ts site/src/styles/rust.css site/src/styles/rust-raid.css site/test/rustRaidBlocks.test.ts site/test/rustHome.test.ts
git commit -m "feat(rust): el raideo en las fichas (cuánto cuesta romperla, qué rompe) y el adelanto en la portada"
```

---

### Task 5: SEO de la calculadora, build y revisión en celular

**Files:**
- Modify: `site/src/prerender.ts`
- Modify: `site/test/rustSeo.test.ts`
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: El test que falla**

En `site/test/rustSeo.test.ts`, agregar:

```ts
  it("la calculadora se presenta como aplicación web gratuita, con migas", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/rust/raideo")!;
    expect(page.title).toMatch(/^Calculadora de raideo de Rust/);
    const types = page.jsonLd.map((j) => (j as { "@type": string })["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("WebApplication");
    const app = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "WebApplication") as { name: string };
    expect(app.name).toBe("Calculadora de raideo de Rust");
  });
```

Run (desde `site/`): `npx vitest run test/rustSeo.test.ts`
Expected: FAIL (la calculadora no tiene `WebApplication`).

- [ ] **Step 2: `prerender.ts`**

En el bloque de Rust de `jsonLdFor`, la condición `if (sec === "home")` pasa a cubrir también la calculadora, con su nombre:

```ts
    if (sec === "home" || sec === "raid") {
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication",
        name: sec === "raid" ? RUST_COPY[lang].raid.h1 : RUST_COPY[lang].home.h1, description: page.description,
        url: page.canonical, applicationCategory: "GameApplication", operatingSystem: "Any", inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, about: { "@type": "VideoGame", name: "Rust" },
      });
    }
```

Run: `npx vitest run test/rustSeo.test.ts`
Expected: PASS.

- [ ] **Step 3: Todos los tests**

Run (desde la raíz): `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS.

Run (desde `site/`): `npx vitest run`
Expected: PASS, salvo `deadlock.test.ts` y `deadlockBuilds.test.ts` (ajenos).

- [ ] **Step 4: Build**

Run (desde `site/`): `npm run build`. Si se queda sin memoria, `NODE_OPTIONS=--max-old-space-size=6144`.
Expected: sin error.

Run: `grep -c "<loc>" site/dist/sitemaps/rust.xml`
Expected: 2.070 (las 2.068 del plan 2 más `/en/rust/raid` y `/es/rust/raideo`).

Run: `grep -c 'data-cell=' site/dist/es/rust/raideo.html`
Expected: 29 × 7 = 203 celdas como mínimo (la tabla completa está en el HTML).

- [ ] **Step 5: Revisión visual (localhost, panel Browser de la app)**

- **Escritorio:**
  - `/es/rust/raideo`: sumar y sacar objetivos y mirar la mezcla más barata;
  - copiar el link y abrirlo en otra pestaña: la selección tiene que estar;
  - `/es/rust/raideo#tabla` tiene que bajar a la tabla;
  - `/es/rust/objetos/puerta-de-chapa` y `/es/rust/objetos/carga-explosiva-con-temporizador`;
  - `/es/rust`: el adelanto.
- **Celular** (`resize_window` preset `mobile`, **nunca** en el Chrome de ZoTaD):
  - la página no tiene scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`);
  - la tabla completa se desliza adentro de su caja;
  - los botones − y + se tocan bien (30 px);
  - el h1 no corta palabras.
- Volver a `desktop`.
- `read_console_messages` sin errores.
- Capturas de la calculadora con una selección (escritorio y celular) y del bloque de la ficha, para ZoTaD.

- [ ] **Step 6: Registrar y commitear**

En `.superpowers/sdd/progress.md`, agregar:

```markdown
# Progreso: docs/superpowers/plans/2026-10-05-rust-raideo.md
Plan 3 (Raideo): completo. Build OK, sitemap rust 2.070 URLs. Etapa 1 de Rust lista (Portada + Objetos + Raideo): esperando que ZoTaD diga para subir a main.
```

```bash
git add site/src/prerender.ts site/test/rustSeo.test.ts .superpowers/sdd/progress.md
git commit -m "feat(rust): la calculadora como aplicación web en el <head>, revisada en build y en celular"
```

Avisarle a ZoTaD con las capturas: la etapa 1 de Rust está completa en localhost:5179. **No** se sube a `main` hasta que lo pida.
