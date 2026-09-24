# Valheim · Plan 1: el extractor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un script que lee el Valheim instalado y deja en el repo los datos (objetos, recetas, piezas, conversiones, criaturas, fuentes, comerciantes, biomas) en inglés y español, y los íconos y gráficos de interfaz en webp.

**Architecture:** Python con UnityPy. `unity.py` carga los bundles y resuelve referencias entre archivos; `records.py`, `sources.py`, `loc.py` y `biomes.py` son funciones puras (probadas con `unittest` sobre fragmentos reales de los typetrees); `extract.py` las orquesta y escribe `games/valheim/data/*.json` y `games/tft/ui/public/valheim/**.webp`. Se corre a mano una vez por parche.

**Tech Stack:** Python 3.14, UnityPy 1.25.3, TypeTreeGeneratorAPI 0.0.10, Pillow (ya instalados en `games/valheim/.venv`), `unittest` de la biblioteca estándar.

Diseño: `docs/design/2026-09-24-valheim-enciclopedia.md`. El Plan 2 (la sección y la primera entrega de Comidas e Hidromieles) se escribe cuando este esté hecho, sobre la forma real de los JSON.

## Global Constraints

- Juego en `C:\Program Files (x86)\Steam\steamapps\common\Valheim` (Unity 6000.0.75f1). Nunca se escribe ahí.
- Entorno: `games/valheim/.venv` (ignorado por git). Todos los comandos usan `games/valheim/.venv/Scripts/python`.
- Bundles que NO se cargan: `f9285044` (videos) y `61c598bb` (audio).
- Nombres y descripciones siempre como `{"en": ..., "es": ...}`; si falta el español se usa el inglés.
- Biomas por bit: 1 meadows, 2 swamp, 4 mountain, 8 blackforest, 16 plains, 32 ashlands, 64 deepnorth, 256 ocean, 512 mistlands.
- Actualización a mano, sin GitHub Action.
- Comentarios en español, con el estilo del repo: el porqué y lo medido.
- Íconos en `games/tft/ui/public/valheim/icons/<nombre>.webp`, interfaz en `games/tft/ui/public/valheim/ui/<nombre>.webp`.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `games/valheim/pipeline/unity.py` | Cargar el juego, índice global de objetos, resolver referencias entre archivos, clase de cada componente, nombre del prefab, exportar sprites. |
| `games/valheim/pipeline/loc.py` | Leer las tablas `localization*` y traducir tokens `$item_x`. |
| `games/valheim/pipeline/biomes.py` | Máscara de bits → ids de bioma, y filtro de aparecedores "en todos lados". |
| `games/valheim/pipeline/records.py` | Typetree → registro limpio: objeto, receta, pieza, conversión, tabla de botín, comerciante, criatura. |
| `games/valheim/pipeline/sources.py` | "De dónde sale" y "se usa en", cruzando todo. |
| `games/valheim/pipeline/extract.py` | Orquestar y escribir los JSON y los webp. |
| `games/valheim/pipeline/tests/test_*.py` | Pruebas de las funciones puras. |
| `games/valheim/README.md` | Cómo correrlo en cada parche. |

---

### Task 1: Traducciones y biomas

**Files:**
- Create: `games/valheim/pipeline/loc.py`
- Create: `games/valheim/pipeline/biomes.py`
- Test: `games/valheim/pipeline/tests/test_loc_biomes.py`
- Create: `games/valheim/pipeline/__init__.py` y `games/valheim/pipeline/tests/__init__.py` (vacíos)

**Interfaces:**
- Produces: `parse_localization(text: str) -> dict[str, dict]` (token sin `$` → `{"en","es"}`), `class Loc` con `Loc.t(token: str | None) -> dict | None`; `BIOMES: list[tuple[int, str, str]]` (bit, id, token de la tabla), `biomes_of(mask: int) -> list[str]`, `is_everywhere(mask: int) -> bool`.

- [ ] **Step 1: Test**

```python
# games/valheim/pipeline/tests/test_loc_biomes.py
import unittest
from pipeline.loc import parse_localization, Loc
from pipeline.biomes import biomes_of, is_everywhere

CSV = '\ufeff,English,Swedish,French,Italian,German,Spanish\n' \
      'item_gold,Bloodgold,Blodguld,Or de sang,Oro di sangue,Blutgold,Oro sanguino\n' \
      'item_solo_en,Only English,,,,,\n' \
      '"item_coma","Mead, strong",,,,,"Hidromiel, fuerte"\n'

class TestLoc(unittest.TestCase):
    def test_lee_ingles_y_espanol(self):
        d = parse_localization(CSV)
        self.assertEqual(d["item_gold"], {"en": "Bloodgold", "es": "Oro sanguino"})
        self.assertEqual(d["item_coma"], {"en": "Mead, strong", "es": "Hidromiel, fuerte"})

    def test_sin_espanol_cae_al_ingles(self):
        loc = Loc(parse_localization(CSV))
        self.assertEqual(loc.t("$item_solo_en"), {"en": "Only English", "es": "Only English"})

    def test_token_desconocido_es_none(self):
        self.assertIsNone(Loc({}).t("$nada"))
        self.assertIsNone(Loc({}).t(None))

class TestBiomes(unittest.TestCase):
    def test_bits(self):
        self.assertEqual(biomes_of(1 | 8), ["meadows", "blackforest"])
        self.assertEqual(biomes_of(64), ["deepnorth"])
        self.assertEqual(biomes_of(0), [])

    def test_en_todos_lados(self):
        # Carbonizados, Elaking y Jotun aparecen con casi todos los bits: son
        # eventos, no el bioma donde viven.
        self.assertTrue(is_everywhere(1 | 2 | 4 | 8 | 16 | 32 | 64 | 256 | 512))
        self.assertTrue(is_everywhere(1 | 2 | 4 | 8 | 16 | 256 | 512))
        self.assertFalse(is_everywhere(1 | 8))

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'pipeline.loc'`.

- [ ] **Step 3: Implementar**

```python
# games/valheim/pipeline/loc.py
"""
Las traducciones oficiales del juego.

Valheim trae su tabla en `resources.assets` como TextAssets `localization`,
`localization_deepnorth`, `localization_witch`… (CSV, 36 idiomas; medido el
2026-09-24: 5.744 filas en la principal). La primera columna es el token sin
`$`; el objeto dice `$item_gold` y la tabla `item_gold`.
"""
import csv, io


def parse_localization(text: str) -> dict[str, dict]:
    rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    if not rows:
        return {}
    head = [h.strip().strip('"') for h in rows[0]]
    en = head.index("English")
    es = head.index("Spanish") if "Spanish" in head else None
    out: dict[str, dict] = {}
    for r in rows[1:]:
        if len(r) <= en or not r[0].strip():
            continue
        e = {"en": r[en]}
        if es is not None and len(r) > es and r[es]:
            e["es"] = r[es]
        out[r[0].strip()] = e
    return out


class Loc:
    def __init__(self, table: dict[str, dict]):
        self.table = table

    def t(self, token: str | None) -> dict | None:
        """`{en, es}` de un token (`$item_x` o `item_x`); sin español, el inglés."""
        if not token:
            return None
        e = self.table.get(token.lstrip("$"))
        if not e:
            return None
        return {"en": e["en"], "es": e.get("es") or e["en"]}
```

```python
# games/valheim/pipeline/biomes.py
"""
Los biomas del juego, que en los datos son una máscara de bits (`Heightmap.Biome`).

Leído del juego el 2026-09-24: los aparecedores de criaturas y la vegetación
guardan `m_biome` como suma de estos bits. El Norte profundo (64) es el de la
1.0.
"""
BIOMES: list[tuple[int, str, str]] = [
    (1, "meadows", "biome_meadows"),
    (8, "blackforest", "biome_blackforest"),
    (2, "swamp", "biome_swamp"),
    (4, "mountain", "biome_mountain"),
    (16, "plains", "biome_plains"),
    (256, "ocean", "biome_ocean"),
    (512, "mistlands", "biome_mistlands"),
    (32, "ashlands", "biome_ashlands"),
    (64, "deepnorth", "biome_deepnorth"),
]


def biomes_of(mask: int) -> list[str]:
    """En el orden de progresión del juego (el de `BIOMES`), no en el de los bits."""
    return [bid for bit, bid, _ in BIOMES if mask & bit]


def is_everywhere(mask: int) -> bool:
    """
    Siete biomas o más: un evento o una aparición especial, no un hábitat.

    Medido: Carbonizados, Elaking y Jotun traen máscaras de 7 a 9 bits y
    aparecían "viviendo" en las Praderas.
    """
    return sum(1 for bit, _, _ in BIOMES if mask & bit) >= 7
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: 5 tests OK.

- [ ] **Step 5: Commit**

```bash
git add games/valheim/pipeline
git commit -m "feat(valheim): traducciones oficiales y biomas del juego"
```

---

### Task 2: Registros desde los typetrees

**Files:**
- Create: `games/valheim/pipeline/records.py`
- Test: `games/valheim/pipeline/tests/test_records.py`

**Interfaces:**
- Consumes: `Loc` (Task 1).
- Produces:
  - `kind_of(item_type: int, food: float) -> str` en `{"food","mead","weapon","armor","tool","ammo","material","trophy","misc"}`.
  - `item_record(prefab: str, shared: dict, loc: Loc, icon: str | None) -> dict | None` → `{id, name, desc, kind, itemType, icon, weight, stack, value, maxQuality, food, damage, damagePerLevel, armor, armorPerLevel, blockPower, setName}`; `None` si el nombre no traduce.
  - `requirements(resources: list[dict], name_of) -> list[dict]` → `[{item, amount, perLevel}]` (`name_of(pptr) -> str | None`).
  - `recipe_record(tree: dict, name_of, station_of) -> dict | None` → `{item, amount, station, level, requirements}`.
  - `drop_table(table: dict, name_of) -> dict` → `{min, max, chance, oneOfEach, items: [{item, min, max, weight}]}`.
  - `character_drops(tree: dict, name_of) -> list[dict]` → `[{item, min, max, chance, perLevel}]`.
  - `trader_items(tree: dict, name_of) -> list[dict]` → `[{item, stack, price, requiredKey}]`.

- [ ] **Step 1: Test** (los fragmentos son copias recortadas de typetrees reales leídos el 2026-09-24)

```python
# games/valheim/pipeline/tests/test_records.py
import unittest
from pipeline.loc import Loc
from pipeline.records import kind_of, item_record, requirements, recipe_record, drop_table, character_drops, trader_items

LOC = Loc({"item_carrotsoup": {"en": "Carrot Soup", "es": "Sopa de zanahoria"},
           "item_carrotsoup_description": {"en": "Warm soup.", "es": "Sopa caliente."}})
NAMES = {1: "Carrot", 2: "Mushroom", 3: "CarrotSoup", 9: "Coins"}
name_of = lambda p: NAMES.get(p["m_PathID"]) if p and p.get("m_PathID") else None
Z = {"m_damage": 0.0, "m_blunt": 0.0, "m_slash": 0.0, "m_pierce": 0.0, "m_chop": 0.0, "m_pickaxe": 0.0,
     "m_fire": 0.0, "m_frost": 0.0, "m_lightning": 0.0, "m_poison": 0.0, "m_spirit": 0.0, "m_nonPlayer": 0.0}

def shared(**kw):
    base = {"m_name": "$item_carrotsoup", "m_description": "$item_carrotsoup_description", "m_itemType": 2,
            "m_maxStackSize": 10, "m_weight": 1.0, "m_value": 0, "m_maxQuality": 1, "m_food": 15.0,
            "m_foodStamina": 45.0, "m_foodEitr": 0.0, "m_foodBurnTime": 1500.0, "m_foodRegen": 2.0,
            "m_armor": 0.0, "m_armorPerLevel": 0.0, "m_blockPower": 0.0, "m_setName": "",
            "m_damages": dict(Z), "m_damagesPerLevel": dict(Z)}
    base.update(kw); return base

class TestKind(unittest.TestCase):
    def test_tipos(self):
        self.assertEqual(kind_of(2, 15.0), "food")
        self.assertEqual(kind_of(2, 0.0), "mead")
        self.assertEqual(kind_of(14, 0), "weapon")
        self.assertEqual(kind_of(7, 0), "armor")
        self.assertEqual(kind_of(19, 0), "tool")
        self.assertEqual(kind_of(9, 0), "ammo")
        self.assertEqual(kind_of(1, 0), "material")
        self.assertEqual(kind_of(13, 0), "trophy")

class TestItem(unittest.TestCase):
    def test_comida(self):
        r = item_record("CarrotSoup", shared(), LOC, "carrotsoup")
        self.assertEqual(r["name"], {"en": "Carrot Soup", "es": "Sopa de zanahoria"})
        self.assertEqual(r["kind"], "food")
        self.assertEqual(r["food"], {"hp": 15.0, "st": 45.0, "eitr": 0.0, "min": 25, "regen": 2.0})
        self.assertIsNone(r["damage"])

    def test_arma_sin_ceros(self):
        d = dict(Z, m_slash=35.0, m_chop=10.0)
        r = item_record("CarrotSoup", shared(m_itemType=3, m_food=0.0, m_damages=d), LOC, None)
        self.assertEqual(r["damage"], {"slash": 35.0, "chop": 10.0})
        self.assertIsNone(r["food"])

    def test_sin_traduccion_no_entra(self):
        self.assertIsNone(item_record("X", shared(m_name="$item_nada"), LOC, None))

class TestRecipe(unittest.TestCase):
    def test_receta(self):
        tree = {"m_item": {"m_FileID": 0, "m_PathID": 3}, "m_amount": 1, "m_enabled": 1,
                "m_craftingStation": {"m_FileID": 0, "m_PathID": 77}, "m_minStationLevel": 2,
                "m_resources": [{"m_resItem": {"m_FileID": 0, "m_PathID": 1}, "m_amount": 1, "m_amountPerLevel": 0},
                                {"m_resItem": {"m_FileID": 0, "m_PathID": 2}, "m_amount": 3, "m_amountPerLevel": 1}]}
        r = recipe_record(tree, name_of, lambda p: "piece_cauldron" if p["m_PathID"] == 77 else None)
        self.assertEqual(r, {"item": "CarrotSoup", "amount": 1, "station": "piece_cauldron", "level": 2,
                             "requirements": [{"item": "Carrot", "amount": 1, "perLevel": 0},
                                              {"item": "Mushroom", "amount": 3, "perLevel": 1}]})

    def test_deshabilitada(self):
        self.assertIsNone(recipe_record({"m_enabled": 0, "m_item": {"m_PathID": 3}}, name_of, lambda p: None))

class TestDrops(unittest.TestCase):
    def test_tabla(self):
        t = {"m_drops": [{"m_item": {"m_FileID": 2, "m_PathID": 1}, "m_stackMin": 1, "m_stackMax": 2, "m_weight": 1.0}],
             "m_dropMin": 3, "m_dropMax": 4, "m_dropChance": 1.0, "m_oneOfEach": 0}
        self.assertEqual(drop_table(t, name_of), {"min": 3, "max": 4, "chance": 1.0, "oneOfEach": False,
                                                  "items": [{"item": "Carrot", "min": 1, "max": 2, "weight": 1.0}]})

    def test_criatura(self):
        t = {"m_drops": [{"m_prefab": {"m_FileID": 0, "m_PathID": 9}, "m_amountMin": 1, "m_amountMax": 3,
                          "m_chance": 0.05000000074505806, "m_levelMultiplier": 1}]}
        self.assertEqual(character_drops(t, name_of), [{"item": "Coins", "min": 1, "max": 3, "chance": 0.05, "perLevel": True}])

    def test_comerciante(self):
        t = {"m_items": [{"m_prefab": {"m_FileID": 2, "m_PathID": 1}, "m_stack": 1, "m_price": 100, "m_requiredGlobalKey": ""},
                         {"m_prefab": {"m_FileID": 2, "m_PathID": 2}, "m_stack": 5, "m_price": 620, "m_requiredGlobalKey": "defeated_bonemass"}]}
        self.assertEqual(trader_items(t, name_of), [{"item": "Carrot", "stack": 1, "price": 100, "requiredKey": None},
                                                    {"item": "Mushroom", "stack": 5, "price": 620, "requiredKey": "defeated_bonemass"}])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'pipeline.records'`.

- [ ] **Step 3: Implementar**

```python
# games/valheim/pipeline/records.py
"""
De un typetree del juego a un registro limpio.

Funciones puras: reciben el diccionario que devuelve `read_typetree()` y un
`name_of(pptr)` que resuelve referencias (ver `unity.py`), así se prueban sin
el juego. Los nombres de campo son los de las clases de `assembly_valheim.dll`
(Unity 6000.0.75f1, 1.0), leídos el 2026-09-24.
"""
from .loc import Loc

# `ItemDrop.ItemData.ItemType`, del juego.
WEAPON = {3, 4, 14, 20, 22}          # una mano, arco, dos manos, atgeir, dos manos izquierda
ARMOR = {5, 6, 7, 11, 17, 18, 24}    # escudo, casco, pecho, piernas, hombros, utilidad, abalorio
TOOL = {15, 19}                      # antorcha, herramienta
AMMO = {9, 23}


def kind_of(item_type: int, food: float) -> str:
    if item_type == 2:
        # Consumible con comida = comida; sin comida = hidromiel o poción.
        return "food" if food > 0 else "mead"
    if item_type in WEAPON:
        return "weapon"
    if item_type in ARMOR:
        return "armor"
    if item_type in TOOL:
        return "tool"
    if item_type in AMMO:
        return "ammo"
    if item_type == 13:
        return "trophy"
    if item_type in (1, 21):         # material, pescado
        return "material"
    return "misc"


def _dmg(d: dict) -> dict | None:
    out = {k[2:]: round(v, 2) for k, v in d.items() if k != "m_nonPlayer" and v}
    return out or None


def item_record(prefab: str, shared: dict, loc: Loc, icon: str | None) -> dict | None:
    name = loc.t(shared.get("m_name"))
    if not name:
        return None
    food = shared.get("m_food", 0.0)
    kind = kind_of(shared["m_itemType"], food)
    return {
        "id": prefab,
        "name": name,
        "desc": loc.t(shared.get("m_description")),
        "kind": kind,
        "itemType": shared["m_itemType"],
        "icon": icon,
        "weight": round(shared.get("m_weight", 0.0), 2),
        "stack": shared.get("m_maxStackSize", 1),
        "value": shared.get("m_value", 0),
        "maxQuality": shared.get("m_maxQuality", 1),
        "food": {"hp": food, "st": shared["m_foodStamina"], "eitr": shared["m_foodEitr"],
                 "min": round(shared["m_foodBurnTime"] / 60), "regen": shared["m_foodRegen"]} if food > 0 else None,
        "damage": _dmg(shared.get("m_damages", {})) if kind in ("weapon", "ammo", "tool") else None,
        "damagePerLevel": _dmg(shared.get("m_damagesPerLevel", {})) if kind in ("weapon", "ammo", "tool") else None,
        "armor": shared.get("m_armor") or None,
        "armorPerLevel": shared.get("m_armorPerLevel") or None,
        "blockPower": shared.get("m_blockPower") or None,
        "setName": shared.get("m_setName") or None,
    }


def requirements(resources: list[dict], name_of) -> list[dict]:
    out = []
    for r in resources:
        item = name_of(r["m_resItem"])
        if item:
            out.append({"item": item, "amount": r["m_amount"], "perLevel": r.get("m_amountPerLevel", 0)})
    return out


def recipe_record(tree: dict, name_of, station_of) -> dict | None:
    if not tree.get("m_enabled"):
        return None
    item = name_of(tree["m_item"])
    if not item:
        return None
    return {
        "item": item,
        "amount": tree["m_amount"],
        "station": station_of(tree["m_craftingStation"]) if tree["m_craftingStation"].get("m_PathID") else None,
        "level": tree["m_minStationLevel"],
        "requirements": requirements(tree["m_resources"], name_of),
    }


def drop_table(table: dict, name_of) -> dict:
    return {
        "min": table["m_dropMin"], "max": table["m_dropMax"],
        "chance": round(table["m_dropChance"], 3), "oneOfEach": bool(table["m_oneOfEach"]),
        "items": [{"item": name_of(d["m_item"]), "min": d["m_stackMin"], "max": d["m_stackMax"], "weight": d["m_weight"]}
                  for d in table["m_drops"] if name_of(d["m_item"])],
    }


def character_drops(tree: dict, name_of) -> list[dict]:
    return [{"item": name_of(d["m_prefab"]), "min": d["m_amountMin"], "max": d["m_amountMax"],
             "chance": round(d["m_chance"], 3), "perLevel": bool(d["m_levelMultiplier"])}
            for d in tree["m_drops"] if name_of(d["m_prefab"])]


def trader_items(tree: dict, name_of) -> list[dict]:
    return [{"item": name_of(i["m_prefab"]), "stack": i["m_stack"], "price": i["m_price"],
             "requiredKey": i["m_requiredGlobalKey"] or None}
            for i in tree["m_items"] if name_of(i["m_prefab"])]
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: todos OK (5 + 10).

- [ ] **Step 5: Commit**

```bash
git add games/valheim/pipeline
git commit -m "feat(valheim): registros de objetos, recetas, botín y comerciantes"
```

---

### Task 3: "De dónde sale" y "se usa en"

**Files:**
- Create: `games/valheim/pipeline/sources.py`
- Test: `games/valheim/pipeline/tests/test_sources.py`

**Interfaces:**
- Consumes: la forma de los registros de Task 2.
- Produces: `build_sources(recipes, conversions, creatures, gatherables, traders) -> dict[str, list[dict]]` y `build_used_in(recipes, conversions, pieces) -> dict[str, list[dict]]`. Tipos de fuente: `craft`, `convert`, `drop`, `gather`, `trader`.
  - `conversions`: `[{station, from, to, time, yield}]`
  - `creatures`: `{prefab: {drops: [...], biomes: [...]}}`
  - `gatherables`: `[{id, kind: "pickable"|"mine"|"tree"|"destructible", biomes, drops: {items: [...]}}]`
  - `traders`: `{trader: {items: [...]}}`
  - `pieces`: `{prefab: {requirements: [...]}}`

- [ ] **Step 1: Test**

```python
# games/valheim/pipeline/tests/test_sources.py
import unittest
from pipeline.sources import build_sources, build_used_in

RECIPES = [{"item": "CarrotSoup", "amount": 1, "station": "piece_cauldron", "level": 1,
            "requirements": [{"item": "Carrot", "amount": 1, "perLevel": 0}, {"item": "Mushroom", "amount": 3, "perLevel": 0}]}]
CONV = [{"station": "piece_fermenter", "from": "MeadBaseHealthMinor", "to": "MeadHealthMinor", "time": 2400.0, "yield": 6}]
CREATURES = {"Boar": {"drops": [{"item": "RawMeat", "min": 1, "max": 2, "chance": 1.0, "perLevel": True}], "biomes": ["meadows"]}}
GATHER = [{"id": "Pickable_Mushroom", "kind": "pickable", "biomes": ["meadows", "blackforest"],
           "drops": {"items": [{"item": "Mushroom", "min": 1, "max": 1, "weight": 1.0}]}}]
TRADERS = {"Haldor": {"items": [{"item": "Carrot", "stack": 1, "price": 50, "requiredKey": None}]}}
PIECES = {"piece_cauldron": {"requirements": [{"item": "Mushroom", "amount": 2}]}}

class TestSources(unittest.TestCase):
    def test_cada_tipo(self):
        s = build_sources(RECIPES, CONV, CREATURES, GATHER, TRADERS)
        self.assertEqual(s["CarrotSoup"], [{"kind": "craft", "station": "piece_cauldron", "level": 1, "amount": 1}])
        self.assertEqual(s["MeadHealthMinor"], [{"kind": "convert", "station": "piece_fermenter", "from": "MeadBaseHealthMinor", "time": 2400.0, "yield": 6}])
        self.assertEqual(s["RawMeat"], [{"kind": "drop", "from": "Boar", "min": 1, "max": 2, "chance": 1.0, "biomes": ["meadows"]}])
        self.assertEqual(s["Mushroom"], [{"kind": "gather", "from": "Pickable_Mushroom", "how": "pickable", "biomes": ["meadows", "blackforest"]}])
        self.assertEqual(s["Carrot"], [{"kind": "trader", "from": "Haldor", "price": 50, "stack": 1, "requiredKey": None}])

    def test_se_usa_en(self):
        u = build_used_in(RECIPES, CONV, PIECES)
        self.assertEqual(u["Mushroom"], [{"kind": "recipe", "item": "CarrotSoup", "amount": 3},
                                         {"kind": "piece", "item": "piece_cauldron", "amount": 2}])
        self.assertEqual(u["MeadBaseHealthMinor"], [{"kind": "convert", "item": "MeadHealthMinor", "station": "piece_fermenter"}])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: FAIL con `No module named 'pipeline.sources'`.

- [ ] **Step 3: Implementar**

```python
# games/valheim/pipeline/sources.py
"""
"De dónde sale" y "se usa en": los cruces que la ficha de cada objeto muestra.

Todo sale de registros ya limpios (`records.py`), así que acá no hay nada del
juego: sólo índices invertidos. El orden de las fuentes es el de cómo lo
consigue un jugador — lo hace, lo convierte, lo caza, lo junta, lo compra.
"""
from collections import defaultdict


def build_sources(recipes, conversions, creatures, gatherables, traders) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in recipes:
        out[r["item"]].append({"kind": "craft", "station": r["station"], "level": r["level"], "amount": r["amount"]})
    for c in conversions:
        out[c["to"]].append({"kind": "convert", "station": c["station"], "from": c["from"], "time": c.get("time"), "yield": c.get("yield")})
    for cid, cr in creatures.items():
        for d in cr["drops"]:
            out[d["item"]].append({"kind": "drop", "from": cid, "min": d["min"], "max": d["max"], "chance": d["chance"], "biomes": cr["biomes"]})
    for g in gatherables:
        for it in g["drops"]["items"]:
            out[it["item"]].append({"kind": "gather", "from": g["id"], "how": g["kind"], "biomes": g["biomes"]})
    for tid, t in traders.items():
        for i in t["items"]:
            out[i["item"]].append({"kind": "trader", "from": tid, "price": i["price"], "stack": i["stack"], "requiredKey": i["requiredKey"]})
    return dict(out)


def build_used_in(recipes, conversions, pieces) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in recipes:
        for q in r["requirements"]:
            out[q["item"]].append({"kind": "recipe", "item": r["item"], "amount": q["amount"]})
    for pid, p in pieces.items():
        for q in p["requirements"]:
            out[q["item"]].append({"kind": "piece", "item": pid, "amount": q["amount"]})
    for c in conversions:
        out[c["from"]].append({"kind": "convert", "item": c["to"], "station": c["station"]})
    return dict(out)
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: todos OK.

- [ ] **Step 5: Commit**

```bash
git add games/valheim/pipeline
git commit -m "feat(valheim): de dónde sale y dónde se usa cada objeto"
```

---

### Task 4: Cargar el juego y resolver referencias

**Files:**
- Create: `games/valheim/pipeline/unity.py`
- Test: `games/valheim/pipeline/tests/test_unity.py` (sólo la parte pura: el nombre de un archivo externo)

**Interfaces:**
- Produces:
  - `external_cab(path: str) -> str` (`"archive:/CAB-abc/CAB-abc"` → `"cab-abc"`).
  - `class Game(root: str = GAME_ROOT)` con:
    - `components(cls: str) -> list[Comp]`, donde `Comp` tiene `.cls`, `.key`, `.tree` (typetree), `.file` (SerializedFile), `.go` (clave del GameObject o `None`).
    - `ref(file, pptr: dict) -> tuple[str, int] | None` — la clave global de una referencia.
    - `prefab(key) -> str | None` — nombre del GameObject (si la clave es de un componente, el de su GameObject).
    - `comps_on(go_key) -> list[Comp]` — los componentes de un GameObject.
    - `name_of_in(file) -> callable(pptr) -> str | None` — el `name_of` de `records.py` para referencias de ese archivo.
    - `sprite_image(file, pptr)` → `PIL.Image` o `None`, y `sprite_name(file, pptr) -> str | None`.
    - `localization_texts() -> list[str]`.
    - `unity_version: str`.

- [ ] **Step 1: Test**

```python
# games/valheim/pipeline/tests/test_unity.py
import unittest
from pipeline.unity import external_cab

class TestExternal(unittest.TestCase):
    def test_cab_de_bundle(self):
        self.assertEqual(external_cab("archive:/CAB-f78add41ea118a2fa5f83cc81e6280d1/CAB-f78add41ea118a2fa5f83cc81e6280d1"),
                         "cab-f78add41ea118a2fa5f83cc81e6280d1")

    def test_archivo_suelto(self):
        self.assertEqual(external_cab("resources.assets"), "resources.assets")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: FAIL con `No module named 'pipeline.unity'`.

- [ ] **Step 3: Implementar**

```python
# games/valheim/pipeline/unity.py
"""
El juego instalado, leído con UnityPy.

**Todo vive en bundles que se refieren unos a otros.** Una receta del bundle
grande (`c4210710`) apunta a un objeto con `m_FileID: 2`, que es el segundo
archivo externo de SU archivo, no un índice global. Por eso toda referencia se
resuelve contra el archivo del componente que la contiene (`ref`) y se guarda
como clave global `(nombre del archivo en minúsculas, path_id)`.

Medido el 2026-09-24 (Unity 6000.0.75f1): los 797 bundles útiles cargan en
~25 s y la clase de cada MonoBehaviour se resuelve en ~7 s más. Los scripts
(MonoScript) viven en `86c3d76e` y los tipos se generan desde los DLL del
juego con TypeTreeGeneratorAPI.
"""
import os
from dataclasses import dataclass
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_ROOT = r"C:\Program Files (x86)\Steam\steamapps\common\Valheim"
SKIP_BUNDLES = {"f9285044", "61c598bb"}   # videos y audio: 3 GB que no hacen falta
LOOSE = ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets", "sharedassets0.assets"]


def external_cab(path: str) -> str:
    return os.path.basename(path.replace("\\", "/")).lower()


@dataclass
class Comp:
    cls: str
    key: tuple
    tree: dict
    file: object
    go: tuple | None
    obj: object


class Game:
    def __init__(self, root: str = GAME_ROOT):
        data = os.path.join(root, "valheim_Data")
        bundles = os.path.join(data, "StreamingAssets", "SoftRef", "Bundles")
        files = [os.path.join(bundles, f) for f in os.listdir(bundles) if f not in SKIP_BUNDLES]
        files += [os.path.join(data, f) for f in LOOSE]
        self.env = UnityPy.load(*files)
        self.unity_version = self.env.objects[0].assets_file.unity_version
        gen = TypeTreeGenerator(self.unity_version)
        gen.load_local_game(root)
        self.env.typetree_generator = gen
        self._objs: dict[tuple, object] = {}
        self._by_cls: dict[str, list[Comp]] = {}
        self._by_go: dict[tuple, list[Comp]] = {}
        self._names: dict[tuple, str | None] = {}
        for o in self.env.objects:
            if o.type.name in ("MonoBehaviour", "GameObject", "Sprite", "TextAsset"):
                self._objs[(o.assets_file.name.lower(), o.path_id)] = o

    def ref(self, file, pptr: dict | None) -> tuple | None:
        if not pptr or not pptr.get("m_PathID"):
            return None
        fid = pptr.get("m_FileID", 0)
        if fid == 0:
            return (file.name.lower(), pptr["m_PathID"])
        ext = file.externals[fid - 1]
        return (external_cab(ext.path), pptr["m_PathID"])

    def _class(self, o) -> str | None:
        try:
            return o.parse_as_object().m_Script.deref_parse_as_object().m_ClassName
        except Exception:
            return None

    def index(self, classes: set[str]) -> None:
        """Lee los typetrees de las clases pedidas (una sola pasada)."""
        for key, o in self._objs.items():
            if o.type.name != "MonoBehaviour":
                continue
            c = self._class(o)
            if c not in classes:
                continue
            tree = o.read_typetree()
            go = self.ref(o.assets_file, tree.get("m_GameObject"))
            comp = Comp(c, key, tree, o.assets_file, go, o)
            self._by_cls.setdefault(c, []).append(comp)
            if go:
                self._by_go.setdefault(go, []).append(comp)

    def components(self, cls: str) -> list[Comp]:
        return self._by_cls.get(cls, [])

    def comps_on(self, go_key: tuple | None) -> list[Comp]:
        return self._by_go.get(go_key, []) if go_key else []

    def prefab(self, key: tuple | None) -> str | None:
        if not key:
            return None
        if key in self._names:
            return self._names[key]
        o = self._objs.get(key)
        name = None
        if o is not None:
            if o.type.name == "GameObject":
                name = o.peek_name()
            elif o.type.name == "MonoBehaviour":
                go = self.ref(o.assets_file, o.read_typetree().get("m_GameObject"))
                g = self._objs.get(go)
                name = g.peek_name() if g is not None else None
        self._names[key] = name
        return name

    def name_of_in(self, file):
        return lambda pptr: self.prefab(self.ref(file, pptr))

    def _sprite(self, file, pptr):
        o = self._objs.get(self.ref(file, pptr))
        return o.read() if o is not None and o.type.name == "Sprite" else None

    def sprite_name(self, file, pptr) -> str | None:
        s = self._sprite(file, pptr)
        return s.m_Name if s else None

    def sprite_image(self, file, pptr):
        s = self._sprite(file, pptr)
        return s.image if s else None

    def localization_texts(self) -> list[str]:
        out = []
        for o in self._objs.values():
            if o.type.name != "TextAsset":
                continue
            t = o.read()
            if t.m_Name.startswith("localization"):
                raw = t.m_Script
                out.append(raw if isinstance(raw, str) else raw.decode("utf-8", "replace"))
        return out

    def ui_sprites(self, bundle_cab_prefix: str | None = None):
        """Todos los Sprites cargados, por nombre (para la interfaz)."""
        for o in self._objs.values():
            if o.type.name == "Sprite":
                yield o
```

- [ ] **Step 4: Correr los tests y una prueba real de humo**

Run: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`
Expected: todos OK.

Run (humo, ~40 s):
```bash
cd games/valheim && .venv/Scripts/python -c "
from pipeline.unity import Game
g = Game(); g.index({'Recipe','ItemDrop','ObjectDB'})
print(g.unity_version, len(g.components('Recipe')), len(g.components('ItemDrop')), len(g.components('ObjectDB')))
r = g.components('Recipe')[0]; print(r.tree['m_Name'], g.name_of_in(r.file)(r.tree['m_item']))"
```
Expected: `6000.0.75f1 481 1710 3` y una receta con el nombre de su objeto (no `None`).

- [ ] **Step 5: Commit**

```bash
git add games/valheim/pipeline
git commit -m "feat(valheim): lector del juego con referencias entre bundles"
```

---

### Task 5: Verificar los campos que faltan (vegetación de las expansiones)

Antes de escribir `extract.py`, mirar por dentro las clases que todavía no se abrieron. Es una tarea de lectura: el resultado es anotar los nombres de campo en el docstring de `extract.py`.

**Files:**
- Create: `games/valheim/pipeline/peek.py` (herramienta de diagnóstico que queda en el repo)

- [ ] **Step 1: Escribir la herramienta**

```python
# games/valheim/pipeline/peek.py
"""
Diagnóstico: imprime el typetree del primer componente de cada clase pedida.

  .venv/Scripts/python -m pipeline.peek LocationList ZoneSystem Pickable TreeBase

Sirve para la próxima vez que un parche cambie un campo: se mira acá antes de
tocar `extract.py`.
"""
import json, sys
from .unity import Game

SKIP = ("Effect", "effect", "Audio", "m_nview", "m_animator")


def short(v):
    if isinstance(v, dict):
        return {k: short(x) for k, x in v.items() if not any(s in k for s in SKIP)}
    if isinstance(v, list):
        return [short(x) for x in v[:2]] + ([f"...{len(v)}"] if len(v) > 2 else [])
    return v


if __name__ == "__main__":
    classes = set(sys.argv[1:])
    g = Game()
    g.index(classes)
    for c in classes:
        comps = g.components(c)
        print(f"===== {c}: {len(comps)}")
        if comps:
            print(json.dumps(short(comps[0].tree), ensure_ascii=False)[:3000])
```

- [ ] **Step 2: Correr**

Run: `cd games/valheim && .venv/Scripts/python -m pipeline.peek LocationList ZoneSystem Pickable TreeBase MineRock`
Expected: `LocationList` con una lista `m_vegetation` cuyos elementos tienen `m_prefab`, `m_enable` y `m_biome` (como `ZoneSystem.m_vegetation`); `Pickable` con `m_itemPrefab`, `m_amount` y `m_extraDrops`; `TreeBase` con `m_dropWhenDestroyed` (tabla de botín); `MineRock` con `m_dropItems`.

- [ ] **Step 3: Si algún campo difiere**, corregir los nombres en el Task 6 (`gatherables`) antes de implementarlo, y anotarlo en el docstring de `extract.py`.

- [ ] **Step 4: Commit**

```bash
git add games/valheim/pipeline/peek.py
git commit -m "chore(valheim): herramienta para mirar los campos de una clase del juego"
```

---

### Task 6: `extract.py` — datos

**Files:**
- Create: `games/valheim/pipeline/extract.py`
- Create: `games/valheim/data/` (salida)

**Interfaces:**
- Consumes: `Game`, `Loc`, `parse_localization`, `biomes_of`, `is_everywhere`, `BIOMES`, todos los de `records.py` y `sources.py`.
- Produces (lo que consume el Plan 2), en `games/valheim/data/`:
  - `items.json`: `{prefab: item_record + {"sources": [...], "usedIn": [...]}}`
  - `recipes.json`: `[recipe_record]`
  - `pieces.json`: `{prefab: {id, name, desc, icon, tool, category, comfort, station, requirements}}`
  - `conversions.json`: `[{station, from, to, time, yield}]`
  - `stations.json`: `{token: {name, icon}}`
  - `creatures.json`: `{prefab: {id, name, health, boss, biomes, drops}}`
  - `gatherables.json`: `[{id, name, kind, biomes, drops}]`
  - `traders.json`: `{prefab: {id, name, items}}`
  - `biomes.json`: `[{id, bit, name}]`
  - `meta.json`: `{unity, extractedAt, counts}`

- [ ] **Step 1: Implementar**

```python
# games/valheim/pipeline/extract.py
"""
Saca del Valheim instalado todo lo que muestra la sección.

  cd games/valheim && .venv/Scripts/python -m pipeline.extract

Se corre A MANO, una vez por parche (decisión de ZoTaD del 2026-09-24: los
parches de Valheim salen poco). Tarda ~1-2 min. Escribe `games/valheim/data/`
y los webp de `games/tft/ui/public/valheim/`.

Qué entra:
- Objetos: los de `ObjectDB.m_items` que tienen nombre traducido. Es la lista
  que el propio juego usa para saber qué existe; los ItemDrop sueltos que no
  están ahí son ataques de monstruos y piezas de prueba.
- Recetas: `ObjectDB.m_recipes` habilitadas.
- Piezas: las de cada `PieceTable` (martillo, azada, cultivador…), con la
  herramienta que las construye.
- Conversiones: `CookingStation`, `Fermenter` y `Smelter` (horno, fundición,
  alto horno, molino, rueca, refinería de eitr…).
- Criaturas: `Humanoid`/`Character` con `CharacterDrop`; su bioma sale de
  `SpawnSystemList` descartando las máscaras de 7+ biomas (eventos).
- Recolectables y minerales: los prefabs de la vegetación de `ZoneSystem` y de
  cada `LocationList` (ahí definen Mistlands, Ashlands y el Norte profundo su
  vegetación), con su `Pickable`, `MineRock5`, `MineRock`, `TreeBase` o
  `DropOnDestroyed`.
- Comerciantes: `Trader`.
"""
import json, os, time
from datetime import datetime, timezone
from .unity import Game
from .loc import Loc, parse_localization
from .biomes import BIOMES, biomes_of, is_everywhere
from .records import item_record, recipe_record, requirements, drop_table, character_drops, trader_items
from .sources import build_sources, build_used_in

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "..", "tft", "ui", "public", "valheim"))

CLASSES = {"ObjectDB", "ItemDrop", "Recipe", "Piece", "PieceTable", "CraftingStation", "CookingStation",
           "Fermenter", "Smelter", "Humanoid", "Character", "CharacterDrop", "SpawnSystemList", "ZoneSystem",
           "LocationList", "Pickable", "MineRock5", "MineRock", "TreeBase", "DropOnDestroyed", "Trader"}


def dump(name: str, obj) -> None:
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


class Icons:
    """Exporta cada sprite una sola vez, por nombre, a webp."""

    def __init__(self, game: Game, folder: str):
        self.game, self.folder, self.done = game, folder, set()
        os.makedirs(folder, exist_ok=True)

    def save(self, file, pptr) -> str | None:
        name = self.game.sprite_name(file, pptr)
        if not name:
            return None
        slug = name.lower().replace(" ", "_")
        if slug not in self.done:
            img = self.game.sprite_image(file, pptr)
            if img is None:
                return None
            img.save(os.path.join(self.folder, f"{slug}.webp"), "WEBP", quality=90, method=6)
            self.done.add(slug)
        return slug


def main() -> None:
    t0 = time.time()
    g = Game()
    g.index(CLASSES)
    loc = Loc({})
    for text in g.localization_texts():
        loc.table.update(parse_localization(text))
    icons = Icons(g, os.path.join(PUBLIC, "icons"))
    print(f"juego cargado ({g.unity_version}), {len(loc.table)} textos, {time.time() - t0:.0f}s")

    # --- ObjectDB: la que más objetos tiene es la del juego (hay 3 copias).
    odb = max(g.components("ObjectDB"), key=lambda c: len(c.tree["m_items"]))
    item_gos = {g.ref(odb.file, p) for p in odb.tree["m_items"]}
    recipe_keys = {g.ref(odb.file, p) for p in odb.tree["m_recipes"]}

    # --- Estaciones de crafteo: token → nombre e ícono.
    stations = {}
    station_by_key = {}
    for c in g.components("CraftingStation"):
        tok = c.tree["m_name"].lstrip("$")
        station_by_key[c.key] = tok
        if tok not in stations:
            stations[tok] = {"name": loc.t(tok), "icon": icons.save(c.file, c.tree.get("m_icon"))}

    # --- Objetos
    items = {}
    build_tables = {}   # clave de PieceTable → herramienta
    for c in g.components("ItemDrop"):
        if c.go not in item_gos:
            continue
        prefab = g.prefab(c.go)
        sh = c.tree["m_itemData"]["m_shared"]
        icon = icons.save(c.file, sh["m_icons"][0]) if sh.get("m_icons") else None
        rec = item_record(prefab, sh, loc, icon)
        if rec:
            items[prefab] = rec
            bt = g.ref(c.file, sh.get("m_buildPieces"))
            if bt:
                build_tables[bt] = prefab

    # --- Recetas
    recipes = []
    for c in g.components("Recipe"):
        if c.key not in recipe_keys:
            continue
        r = recipe_record(c.tree, g.name_of_in(c.file), lambda p, f=c.file: station_by_key.get(g.ref(f, p)))
        if r and r["item"] in items:
            recipes.append(r)

    # --- Piezas, con la herramienta que las construye
    pieces = {}
    for t in g.components("PieceTable"):
        tool = build_tables.get(t.go) or build_tables.get(t.key)
        for p in t.tree["m_pieces"]:
            go = g.ref(t.file, p)
            for pc in g.comps_on(go):
                if pc.cls != "Piece":
                    continue
                name = loc.t(pc.tree["m_name"])
                if not name:
                    continue
                prefab = g.prefab(go)
                pieces[prefab] = {
                    "id": prefab, "name": name, "desc": loc.t(pc.tree.get("m_description")),
                    "icon": icons.save(pc.file, pc.tree.get("m_icon")), "tool": tool,
                    "category": pc.tree["m_category"], "comfort": pc.tree["m_comfort"] or None,
                    "station": station_by_key.get(g.ref(pc.file, pc.tree["m_craftingStation"])),
                    "requirements": [{"item": q["item"], "amount": q["amount"]} for q in requirements(pc.tree["m_resources"], g.name_of_in(pc.file))],
                }

    # --- Conversiones (sin repetir la misma estación con el mismo par)
    conversions, seen = [], set()
    for cls in ("CookingStation", "Fermenter", "Smelter"):
        for c in g.components(cls):
            st = c.tree["m_name"].lstrip("$")
            name_of = g.name_of_in(c.file)
            for cv in c.tree.get("m_conversion", []):
                frm, to = name_of(cv["m_from"]), name_of(cv["m_to"])
                if not frm or not to or (st, frm, to) in seen:
                    continue
                seen.add((st, frm, to))
                time_s = cv.get("m_cookTime") or (c.tree.get("m_fermentationDuration") if cls == "Fermenter" else c.tree.get("m_secPerProduct"))
                conversions.append({"station": st, "from": frm, "to": to, "time": time_s, "yield": cv.get("m_producedItems", 1)})
            if st not in stations:
                stations[st] = {"name": loc.t(st), "icon": None}

    # --- Criaturas y sus biomas
    spawn_biomes: dict[str, set] = {}
    for c in g.components("SpawnSystemList"):
        for s in c.tree["m_spawners"]:
            if not s.get("m_enabled", 1) or is_everywhere(s["m_biome"]):
                continue
            name = g.prefab(g.ref(c.file, s["m_prefab"]))
            if name:
                spawn_biomes.setdefault(name, set()).update(biomes_of(s["m_biome"]))
    creatures = {}
    for cls in ("Humanoid", "Character"):
        for c in g.components(cls):
            prefab = g.prefab(c.go)
            name = loc.t(c.tree.get("m_name"))
            if not prefab or not name or prefab in creatures or prefab == "Player":
                continue
            drops = next((character_drops(d.tree, g.name_of_in(d.file)) for d in g.comps_on(c.go) if d.cls == "CharacterDrop"), [])
            creatures[prefab] = {"id": prefab, "name": name, "health": c.tree.get("m_health"), "boss": bool(c.tree.get("m_boss")),
                                 "biomes": sorted(spawn_biomes.get(prefab, []), key=lambda b: [x[1] for x in BIOMES].index(b)),
                                 "drops": [d for d in drops if d["item"] in items]}

    # --- Vegetación → recolectables y minerales
    veg: dict[tuple, int] = {}
    for cls in ("ZoneSystem", "LocationList"):
        for c in g.components(cls):
            for v in c.tree.get("m_vegetation", []):
                if v.get("m_enable"):
                    k = g.ref(c.file, v["m_prefab"])
                    if k:
                        veg[k] = veg.get(k, 0) | v["m_biome"]
    gatherables = []
    for go, mask in veg.items():
        for pc in g.comps_on(go):
            name_of = g.name_of_in(pc.file)
            if pc.cls == "Pickable":
                it = name_of(pc.tree["m_itemPrefab"])
                drops = {"items": [{"item": it, "min": pc.tree["m_amount"], "max": pc.tree["m_amount"], "weight": 1.0}] if it else []}
                extra = drop_table(pc.tree["m_extraDrops"], name_of)["items"]
                drops["items"] += extra
                kind = "pickable"
            elif pc.cls in ("MineRock5", "MineRock"):
                drops, kind = drop_table(pc.tree["m_dropItems"], name_of), "mine"
            elif pc.cls == "TreeBase":
                drops, kind = drop_table(pc.tree["m_dropWhenDestroyed"], name_of), "tree"
            elif pc.cls == "DropOnDestroyed":
                drops, kind = drop_table(pc.tree["m_dropWhenDestroyed"], name_of), "destructible"
            else:
                continue
            drops["items"] = [d for d in drops["items"] if d["item"] in items]
            if drops["items"]:
                prefab = g.prefab(go)
                name = loc.t(pc.tree.get("m_name") or pc.tree.get("m_overrideName")) or None
                gatherables.append({"id": prefab, "name": name, "kind": kind, "biomes": biomes_of(mask), "drops": drops})

    # --- Comerciantes
    traders = {}
    for c in g.components("Trader"):
        prefab = g.prefab(c.go)
        traders[prefab] = {"id": prefab, "name": loc.t(c.tree["m_name"]),
                           "items": [i for i in trader_items(c.tree, g.name_of_in(c.file)) if i["item"] in items]}

    # --- Cruces
    sources = build_sources(recipes, conversions, creatures, gatherables, traders)
    used = build_used_in(recipes, conversions, pieces)
    for pid, it in items.items():
        it["sources"] = sources.get(pid, [])
        it["usedIn"] = used.get(pid, [])

    dump("items.json", items)
    dump("recipes.json", recipes)
    dump("pieces.json", pieces)
    dump("conversions.json", conversions)
    dump("stations.json", stations)
    dump("creatures.json", creatures)
    dump("gatherables.json", gatherables)
    dump("traders.json", traders)
    dump("biomes.json", [{"id": bid, "bit": bit, "name": loc.t(tok)} for bit, bid, tok in BIOMES])
    counts = {"items": len(items), "recipes": len(recipes), "pieces": len(pieces), "conversions": len(conversions),
              "creatures": len(creatures), "gatherables": len(gatherables), "traders": len(traders), "icons": len(icons.done)}
    dump("meta.json", {"unity": g.unity_version, "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "counts": counts})
    print(counts, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Correr**

Run: `cd games/valheim && .venv/Scripts/python -m pipeline.extract`
Expected: una línea de conteos con, aproximadamente, `items` > 900, `recipes` ~ 480, `pieces` > 500, `conversions` > 80, `creatures` > 80, `gatherables` > 40, `traders` 6, `icons` > 1.000; sin excepción.

- [ ] **Step 3: Verificar a mano contra lo conocido**

```bash
cd games/valheim && .venv/Scripts/python -c "
import json
I = json.load(open('data/items.json', encoding='utf-8'))
print(I['Gold']['name'])                              # {'en': 'Bloodgold', 'es': 'Oro sanguino'}
print(I['MeadHealthMinor']['sources'])                # convert en piece_fermenter desde MeadBaseHealthMinor, yield 6
print([s for s in I['RawMeat']['sources'] if s['kind']=='drop'][:2])   # Boar en meadows
C = json.load(open('data/creatures.json', encoding='utf-8'))
print(C.get('Moose', {}).get('biomes'))              # ['deepnorth']
print(sorted({b for g in json.load(open('data/gatherables.json', encoding='utf-8')) for b in g['biomes']}))  # los nueve, o casi
"
```
Expected: los valores de los comentarios. Si `gatherables` no cubre Tierras Nubladas, Tierra de Ceniza o Norte profundo, revisar con `pipeline.peek LocationList` (Task 5) antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add games/valheim/pipeline/extract.py games/valheim/data games/tft/ui/public/valheim/icons
git commit -m "feat(valheim): extractor de datos e íconos del juego"
```

---

### Task 7: Gráficos de interfaz, fuentes y README

**Files:**
- Modify: `games/valheim/pipeline/extract.py` (agregar `export_ui`)
- Create: `games/valheim/README.md`

**Interfaces:**
- Produces: `games/tft/ui/public/valheim/ui/<nombre>.webp` para la lista `UI_SPRITES`, y `public/valheim/fonts/AveriaSerifLibre-*.ttf`, `AveriaSansLibre-*.ttf` (OFL).

- [ ] **Step 1: Agregar a `extract.py`**, antes de `main`:

```python
# Los gráficos de interfaz que usa la sección (bundle 9fe0899c). Lista cerrada a
# propósito: son ~30 de 246 y cada uno que se sume tiene que tener un uso.
UI_SPRITES = [
    "woodpanel_crafting", "woodpanel_info", "woodpanel_400_tileable", "woodpanel_512x512", "woodpanel_flik",
    "woodpanel_trophys", "button", "button_highlight", "button_pressed", "button_disabled", "button_tab",
    "button_tab_hover", "button_tab_selected", "item_bkg", "item_bkgh", "item_background", "item_background_sunken",
    "panel_bkg_256", "panel_bkg_128", "panel_border_128", "panel_interior_bkg_128", "panel_separator",
    "selection_frame", "crafting_panel_bkg", "inv_bkg", "tabletop", "skill_bkg", "chest_bkg", "trophy_board",
]
OFL_FONTS = {"AveriaSerifLibre-Regular", "AveriaSerifLibre-Bold", "AveriaSansLibre-Regular", "AveriaSansLibre-Bold"}


def export_ui(g: Game) -> int:
    out = os.path.join(PUBLIC, "ui")
    os.makedirs(out, exist_ok=True)
    want, n = set(UI_SPRITES), 0
    for o in g.ui_sprites():
        s = o.read()
        if s.m_Name in want:
            s.image.save(os.path.join(out, f"{s.m_Name}.webp"), "WEBP", lossless=True)
            want.discard(s.m_Name)
            n += 1
    if want:
        print("⚠ sprites de interfaz que no aparecieron:", sorted(want))
    return n


def export_fonts(g: Game) -> int:
    """Sólo Averia (OFL). Norse queda afuera hasta confirmar su licencia."""
    out = os.path.join(PUBLIC, "fonts")
    os.makedirs(out, exist_ok=True)
    n = 0
    for o in g.env.objects:
        if o.type.name != "Font":
            continue
        f = o.read()
        if f.m_Name in OFL_FONTS and f.m_FontData:
            with open(os.path.join(out, f"{f.m_Name}.ttf"), "wb") as fh:
                fh.write(bytes(f.m_FontData))
            n += 1
    return n
```

y en `main`, antes de los `dump`: `counts_ui = export_ui(g); counts_fonts = export_fonts(g)`, sumando `"ui": counts_ui, "fonts": counts_fonts` a `counts`.

- [ ] **Step 2: Correr y verificar**

Run: `cd games/valheim && .venv/Scripts/python -m pipeline.extract && ls ../tft/ui/public/valheim/ui | wc -l && ls ../tft/ui/public/valheim/fonts`
Expected: 29 webp en `ui/` y los 4 `.ttf` de Averia; ningún aviso de sprites faltantes.

- [ ] **Step 3: README**

```markdown
# Valheim

Datos y gráficos de la sección `/valheim`, sacados del juego instalado.

## En cada parche

1. Actualizar el juego en Steam.
2. Si no existe el entorno: `python -m venv games/valheim/.venv` y
   `games/valheim/.venv/Scripts/python -m pip install UnityPy TypeTreeGeneratorAPI`.
3. `cd games/valheim && .venv/Scripts/python -m pipeline.extract` (~1-2 min).
4. Revisar `git diff --stat games/valheim/data` y los conteos de `data/meta.json`.
5. Si un campo cambió de nombre: `.venv/Scripts/python -m pipeline.peek <Clase>`.

Tests: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`.

Diseño: `docs/design/2026-09-24-valheim-enciclopedia.md`.
```

- [ ] **Step 4: Commit**

```bash
git add games/valheim games/tft/ui/public/valheim
git commit -m "feat(valheim): gráficos de interfaz, fuentes libres y cómo actualizar"
```

---

## Self-review

- Cobertura del diseño, parte 1: objetos, recetas, piezas, conversiones (cocina, fermentador, hornos), criaturas con botín y bioma, recolectables y minerales por bioma (con `LocationList` para las expansiones), comerciantes, traducciones en/es, íconos, interfaz y fuentes OFL → Tasks 1-7. Norse queda afuera explícitamente (licencia).
- Partes 2 y 3 del diseño (sección, estilo, SEO): Plan 2, sobre la forma real de estos JSON.
- Nombres consistentes: `item_record`, `recipe_record`, `requirements`, `drop_table`, `character_drops`, `trader_items`, `build_sources`, `build_used_in`, `Game.index/components/comps_on/prefab/ref/name_of_in/sprite_name/sprite_image/localization_texts/ui_sprites` se usan igual en todas las tareas.
