# Planificador de Valheim — plan de implementación

> **Para agentes:** usar superpowers:executing-plans (o subagent-driven-development)
> tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** la pestaña `/valheim/planner` (elegir qué fabricar, con nivel y
cantidad) y `/valheim/planner/route` (la hoja de ruta: qué juntar, cuánto,
dónde, qué estaciones, peso), según la maqueta B.

**Arquitectura:** el extractor suma el combustible de las conversiones;
`pipeline/planner.py` arma `data/site/planner.json` (el grafo de recetas,
conversiones y fuentes, con nombres resueltos); `valheimPlanner.ts` hace todo
el cálculo sin React; un store chico guarda la lista en `localStorage` y en la
URL; dos componentes dibujan los dos pasos.

**Stack:** Python 3 + UnityPy (pipeline), React 18 + TypeScript + Vite,
Vitest, unittest.

## Restricciones globales

- Diseño: `docs/design/2026-09-25-valheim-planificador.md`; maqueta B del lienzo https://claude.ai/artifact/L4XbqFiH1Ea9tHL9C2mKPJ.
- Español del sitio en **tú** (no voseo). Nombres oficiales del juego.
- **Sin bordes ni barras de color en tarjetas o filas**: tinte, texto o cifra.
- Todo el trabajo en el worktree `C:\Users\Zotad\Desktop\vestigo-planificador`, rama `feat/valheim-planificador`. No tocar `C:\Users\Zotad\Desktop\vestigo` (otra sesión trabaja ahí), salvo `.claude/launch.json`.
- Python del pipeline: `PY=/c/Users/Zotad/Desktop/vestigo/games/valheim/.venv/Scripts/python` (el venv vive en la copia principal), corrido desde `games/valheim` del worktree.
- Tests de la UI: `cd games/tft/ui && npx vitest run <archivo>`. `test/deadlock.test.ts` ya falla en el worktree (falta `@duckdb/node-api` en `games/deadlock`): no es de este trabajo.
- Los ídolos (`Upgrader*`) no entran al cálculo.
- No publicar a producción: se deja en localhost para que ZoTaD lo apruebe.

---

### Tarea 1: combustible de las conversiones en el extractor

**Archivos:**
- Modificar: `games/valheim/pipeline/extract.py` (bloque "Conversiones", ~línea 305)
- Regenera: `games/valheim/data/*.json` (sólo debería cambiar `conversions.json`)

**Produce:** cada conversión de un `Smelter` con combustible trae
`"fuel": {"item": "<id>", "perProduct": <n>}`.

- [ ] **Paso 1: agregar el combustible.** En el bucle de conversiones:

```python
    for cls in ("CookingStation", "Fermenter", "Smelter"):
        for c in g.components(cls):
            st = c.tree["m_name"].lstrip("$")
            name_of = g.name_of_in(c.file)
            # El combustible (2026-09-25, para el Planificador): la fundición y el
            # alto horno queman 2 de carbón por barra; el horno de carbón no lleva.
            fuel = name_of(c.tree.get("m_fuelItem")) if cls == "Smelter" else None
            for cv in c.tree.get("m_conversion", []):
                frm, to = name_of(cv["m_from"]), name_of(cv["m_to"])
                if not frm or not to or (st, frm, to) in seen:
                    continue
                seen.add((st, frm, to))
                time_s = cv.get("m_cookTime") or (c.tree.get("m_fermentationDuration") if cls == "Fermenter" else c.tree.get("m_secPerProduct"))
                row = {"station": st, "from": frm, "to": to, "time": time_s, "yield": cv.get("m_producedItems", 1)}
                if fuel:
                    row["fuel"] = {"item": fuel, "perProduct": c.tree.get("m_fuelPerProduct", 1)}
                conversions.append(row)
```

- [ ] **Paso 2: correr el extractor** (~4 min, necesita el juego instalado):
  `cd games/valheim && $PY -m pipeline.extract`

- [ ] **Paso 3: revisar.** `git diff --stat games/valheim/data` tiene que
  mostrar `conversions.json` (y quizá `meta.json`). Comprobar:

```bash
$PY -c "import json;c=json.load(open('data/conversions.json',encoding='utf8'));print([x for x in c if x['to'] in ('Iron','Coal','Eitr')])"
```

  Esperado: `Iron` desde `IronOre`/`IronScrap` con `fuel {"item":"Coal","perProduct":2}`,
  `Coal` sin `fuel`, `Eitr` con `fuel` de savia. Si cambió algo más que las
  conversiones (el juego se actualizó), anotarlo y seguir: `pipeline.site` se
  corre en la tarea 2.

- [ ] **Paso 4: commit.**

```bash
git add games/valheim/pipeline/extract.py games/valheim/data
git commit -m "feat(valheim): el extractor lee el combustible de las fundiciones"
```

---

### Tarea 2: `planner.json` desde el pipeline

**Archivos:**
- Crear: `games/valheim/pipeline/planner.py`
- Crear: `games/valheim/pipeline/tests/test_planner.py`
- Modificar: `games/valheim/pipeline/fixes.py` (agregar `PLANNER_PREFER`)
- Modificar: `games/valheim/pipeline/site.py` (llamar a `planner.build` antes de volcar las pestañas)
- Genera: `games/valheim/data/site/planner.json`

**Produce** (`planner.json`, lo consume la tarea 3):

```
{ items:    { <id>: {name:{en,es}, icon, weight, tier, slug, tab, cat?, maxQ?} },
  recipes:  { <id>: {st, lv, n, req:[[id, amount, perLevel]], any?} },
  convert:  { <id>: [{st, from, time, n, fuel?:[id, perProduct]}] },
  sources:  { <id>: [{how, biomes, name, slug?, tab?, chance?, min?, max?, price?}] },
  stations: { <token>: {name, icon, slug, tab} },
  prefer:   { <id>: "craft" | "raw" | "from:<id>" } }
```

Ids: los del juego para objetos, `piece:<pid>` para piezas, `boss:<id>` para
las ofrendas de un jefe (estación `altar:<id>`).

- [ ] **Paso 1: `PLANNER_PREFER` en `fixes.py`** (al final del archivo):

```python
# El camino por defecto del Planificador (2026-09-25) donde el primero no es el
# de siempre. Wiki "Iron": sale de la chatarra de las criptas hundidas y de los
# montículos de barro del Pantano (el mineral de hierro, sólo de meteoritos y
# del hierro de pantano). Wiki "Coal": con madera en el horno de carbón.
PLANNER_PREFER: dict[str, str] = {"Iron": "from:IronScrap", "Coal": "from:Wood"}
```

- [ ] **Paso 2: test que falla** — `pipeline/tests/test_planner.py`:

```python
import unittest

from pipeline import planner


def refs(*keys):
    return {k: {"slug": k.lower(), "tab": "materials", "name": {"en": k, "es": k}, "icon": k.lower()} for k in keys}


class PlannerTest(unittest.TestCase):
    def setUp(self):
        ids = ("Sword", "Iron", "IronScrap", "IronOre", "Coal", "Wood", "Bronze", "Copper", "Tin", "Upgrader2Weapon")
        self.items = {k: {"weight": 1.0, "maxQuality": 1, "sources": []} for k in ids}
        self.items["Sword"]["maxQuality"] = 4
        self.items["IronScrap"]["sources"] = [{"kind": "gather", "how": "mine", "biomes": ["swamp"], "from": "mudpile"}]
        self.recipes = [
            {"item": "Sword", "station": "piece_forge", "level": 2, "amount": 1, "anyOne": False,
             "requirements": [{"item": "Iron", "amount": 20, "perLevel": 10}, {"item": "Upgrader2Weapon", "amount": 1, "perLevel": 0}]},
            {"item": "Bronze", "station": "piece_forge", "level": 1, "amount": 5, "anyOne": False,
             "requirements": [{"item": "Copper", "amount": 10, "perLevel": 1}, {"item": "Tin", "amount": 5, "perLevel": 1}]},
            {"item": "Bronze", "station": "piece_forge", "level": 1, "amount": 1, "anyOne": False,
             "requirements": [{"item": "Copper", "amount": 2, "perLevel": 1}, {"item": "Tin", "amount": 1, "perLevel": 1}]},
        ]
        self.conversions = [
            {"station": "piece_smelter", "from": "IronOre", "to": "Iron", "time": 30.0, "yield": 1, "fuel": {"item": "Coal", "perProduct": 2}},
            {"station": "piece_smelter", "from": "IronScrap", "to": "Iron", "time": 30.0, "yield": 1, "fuel": {"item": "Coal", "perProduct": 2}},
            {"station": "piece_charcoalkiln", "from": "Wood", "to": "Coal", "time": 15.0, "yield": 1},
        ]
        self.pieces = {"forge": {"station": None, "requirements": [{"item": "Copper", "amount": 6}]}}
        self.bosses = [{"id": "Eikthyr", "biome": "meadows",
                        "summon": {"item": "Wood", "amount": 2, "altar": {"en": "Mystical Altar", "es": "Altar místico"}}}]
        self.ref = refs(*ids) | refs("piece:forge") | {"boss:Eikthyr": {"slug": "eikthyr", "tab": "bosses", "name": {"en": "Eikthyr", "es": "Eikthyr"}, "icon": None}}

    def build(self, listed):
        station = lambda t: {"slug": t, "tab": "building", "name": {"en": t, "es": t}, "icon": None}
        return planner.build(self.items, self.recipes, self.pieces, self.conversions, self.bosses, self.ref,
                             lambda k: "swamp", station, lambda s: dict(s), listed)

    def test_los_idolos_no_entran(self):
        p = self.build({"Sword": "weapons"})
        self.assertEqual(p["recipes"]["Sword"]["req"], [["Iron", 20, 10]])
        self.assertNotIn("Upgrader2Weapon", p["items"])

    def test_la_receta_mas_chica(self):
        p = self.build({"Bronze": "materials"})
        self.assertEqual(p["recipes"]["Bronze"]["n"], 1)
        self.assertEqual(p["recipes"]["Bronze"]["req"], [["Copper", 2, 1], ["Tin", 1, 1]])

    def test_conversiones_con_combustible_y_alcance(self):
        p = self.build({"Sword": "weapons"})
        self.assertIn({"st": "piece_smelter", "from": "IronScrap", "time": 30.0, "n": 1, "fuel": ["Coal", 2]}, p["convert"]["Iron"])
        self.assertEqual(set(p["items"]), {"Sword", "Iron", "IronOre", "IronScrap", "Coal", "Wood"})
        self.assertEqual(p["items"]["Sword"]["cat"], "weapons")
        self.assertEqual(p["items"]["Sword"]["maxQ"], 4)
        self.assertNotIn("cat", p["items"]["Iron"])
        self.assertEqual(p["prefer"], {"Iron": "from:IronScrap", "Coal": "from:Wood"})

    def test_fuentes_resumidas(self):
        p = self.build({"Sword": "weapons"})
        self.assertEqual(p["sources"]["IronScrap"], [{"how": "mine", "biomes": ["swamp"], "name": None}])

    def test_piezas_y_jefes(self):
        p = self.build({"piece:forge": "building"})
        self.assertEqual(p["recipes"]["piece:forge"]["req"], [["Copper", 6, 0]])
        self.assertEqual(p["recipes"]["boss:Eikthyr"], {"st": "altar:Eikthyr", "lv": 1, "n": 1, "req": [["Wood", 2, 0]]})
        self.assertEqual(p["items"]["boss:Eikthyr"]["cat"], "bosses")
        self.assertEqual(p["stations"]["altar:Eikthyr"]["name"]["es"], "Altar místico")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Paso 3: correrlo y verlo fallar.**
  `cd games/valheim && $PY -m unittest pipeline.tests.test_planner -v`
  Esperado: `ImportError`/`AttributeError` (no hay `planner.build`).

- [ ] **Paso 4: `pipeline/planner.py`:**

```python
"""
El Planificador (2026-09-25): `data/site/planner.json`, el grafo con el que la
pestaña calcula cuánto juntar de cada cosa y dónde.

Pedido de ZoTaD: eliges lo que quieres fabricar y te dice qué juntar, cuánto y
de dónde sale. Diseño: docs/design/2026-09-25-valheim-planificador.md. Lo arma
`site.py` al final, con las referencias ya resueltas; la web sólo suma.
"""
from .fixes import PLANNER_PREFER

CATS = ("weapons", "armor", "tools", "foods", "meads", "materials", "building", "bosses")
# Lo que se junta en la zona antes que el botín de cofres y vasijas.
HOW_ORDER = ["drop", "mine", "tree", "pickable", "farm", "location", "extract", "fish", "destructible", "trader", "chest"]
MAX_SOURCES = 4


def is_idol(iid: str) -> bool:
    """Los ídolos de la forja oculta (1.0, wiki "Bronze Battle Idol"): botín para una mejora al azar, no un material."""
    return iid.startswith("Upgrader")


def build(items, recipes, pieces, conversions, bosses, ref, tier_of, station_ref, src, listed) -> dict:
    """
    `listed`: los ids publicados en cada pestaña ({"SwordIron": "weapons",
    "piece:forge": "building"}). Entra al catálogo lo que de eso se fabrica, se
    cocina o se construye, más las ofrendas de cada jefe; el resto del grafo son
    sus ingredientes.
    """
    recipe: dict[str, dict] = {}
    by_item: dict[str, list] = {}
    for r in recipes:
        by_item.setdefault(r["item"], []).append(r)
    for iid, rs in by_item.items():
        # Con dos recetas (bronce de a 1 y de a 5) va la más chica: suma exacto.
        r = min(rs, key=lambda x: (x["amount"], x["level"]))
        recipe[iid] = {"st": r["station"], "lv": r["level"], "n": r["amount"],
                       "req": [[q["item"], q["amount"], q.get("perLevel", 0)] for q in r["requirements"] if not is_idol(q["item"])],
                       **({"any": True} if r.get("anyOne") else {})}
    for pid, p in pieces.items():
        recipe[f"piece:{pid}"] = {"st": p["station"], "lv": 1, "n": 1, "req": [[q["item"], q["amount"], 0] for q in p["requirements"]]}
    altars = {}
    for b in bosses:
        s, key = b["summon"], f"boss:{b['id']}"
        if s.get("item") and key in ref:
            recipe[key] = {"st": f"altar:{b['id']}", "lv": 1, "n": 1, "req": [[s["item"], s["amount"], 0]]}
            altars[f"altar:{b['id']}"] = {"name": s.get("altar") or ref[key]["name"], "icon": None, "slug": ref[key]["slug"], "tab": ref[key]["tab"]}

    # Una conversión por par: la misma carne se asa en dos estaciones de cocina.
    convert: dict[str, list] = {}
    for c in sorted(conversions, key=lambda c: (c["to"], c["from"])):
        rows = convert.setdefault(c["to"], [])
        if any(x["from"] == c["from"] for x in rows):
            continue
        row = {"st": c["station"], "from": c["from"], "time": c.get("time"), "n": c.get("yield") or 1}
        if c.get("fuel"):
            row["fuel"] = [c["fuel"]["item"], c["fuel"]["perProduct"]]
        rows.append(row)

    catalog = {k: cat for k, cat in listed.items() if cat in CATS and (k in recipe or k in convert)}
    catalog |= {k: "bosses" for k in recipe if k.startswith("boss:")}

    # Todo lo que se alcanza desde el catálogo por recetas, conversiones y combustible.
    seen, todo = set(), list(catalog)
    while todo:
        k = todo.pop()
        if k in seen or k not in ref:
            continue
        seen.add(k)
        todo += [q[0] for q in recipe.get(k, {}).get("req", [])]
        for c in convert.get(k, []):
            todo.append(c["from"])
            if c.get("fuel"):
                todo.append(c["fuel"][0])

    out_items = {}
    for k in sorted(seen):
        r, it = ref[k], items.get(k) or {}
        row = {"name": r["name"], "icon": r["icon"], "weight": it.get("weight", 0), "tier": tier_of(k), "slug": r["slug"], "tab": r["tab"]}
        if k in catalog:
            row["cat"] = catalog[k]
        if (it.get("maxQuality") or 1) > 1:
            row["maxQ"] = it["maxQuality"]
        out_items[k] = row

    out_recipes = {k: {**r, "req": [q for q in r["req"] if q[0] in out_items]} for k, r in recipe.items() if k in out_items}
    out_convert = {}
    for k, rows in convert.items():
        if k not in out_items:
            continue
        ok = [c for c in rows if c["from"] in out_items and (not c.get("fuel") or c["fuel"][0] in out_items)]
        if ok:
            out_convert[k] = ok

    def summary(k):
        it = items.get(k)
        if not it:
            return []
        rows, keys = [], set()
        for s in it["sources"]:
            if s["kind"] not in ("drop", "gather", "farm", "trader"):
                continue
            x = src(s)
            how = x.get("how") or x["kind"]
            name = (x.get("ref") or {}).get("name") if x["kind"] == "drop" else x.get("name")
            if x["kind"] == "drop" and not name:
                continue  # una criatura que no se lista (variante de prueba)
            key = (how, (name or {}).get("en"))
            if key in keys:
                continue
            keys.add(key)
            row = {"how": how, "biomes": x.get("biomes") or [], "name": name}
            if x["kind"] == "drop":
                row |= {"slug": x["ref"]["slug"], "tab": x["ref"]["tab"]}
            for f in ("chance", "min", "max", "price"):
                if x.get(f) is not None:
                    row[f] = x[f]
            rows.append(row)
        rows.sort(key=lambda r: HOW_ORDER.index(r["how"]) if r["how"] in HOW_ORDER else len(HOW_ORDER))
        return rows[:MAX_SOURCES]

    sources = {k: v for k in out_items if (v := summary(k))}

    tokens = {r["st"] for r in out_recipes.values() if r["st"]} | {c["st"] for rows in out_convert.values() for c in rows}
    stations = {}
    for t in sorted(tokens):
        if t in altars:
            stations[t] = altars[t]
            continue
        s = station_ref(t)
        if s:
            stations[t] = {"name": s["name"], "icon": s["icon"], "slug": s["slug"], "tab": s["tab"]}

    prefer = {k: v for k, v in PLANNER_PREFER.items() if k in out_items}
    return {"items": out_items, "recipes": out_recipes, "convert": out_convert, "sources": sources, "stations": stations, "prefer": prefer}
```

- [ ] **Paso 5: correr los tests y verlos pasar.**
  `$PY -m unittest pipeline.tests.test_planner -v` → 5 OK.

- [ ] **Paso 6: conectarlo en `site.py`.** Import: `from . import fixes, places, planner, wiki`.
  Justo antes de `for tab, rows in tabs.items(): sizes[tab] = dump(...)`
  (después de los `remap`):

```python
    # El Planificador (2026-09-25): su propio archivo, que sólo carga esa pestaña.
    boss_biome = {f"boss:{b['id']}": b["biome"] for b in bosses}

    def tier_of(k):
        return tiers.piece(k[6:]) if k.startswith("piece:") else boss_biome.get(k) or tier.get(k)

    listed = {("piece:" + r["id"] if t == "building" else r["id"]): t for t, rows in tabs.items() if t in planner.CATS for r in rows}
    plan = planner.build(items, recipes, pieces, conversions, bosses, ref, tier_of, station_ref, src, listed)
    remap(plan)
```

  y después del volcado de las pestañas: `sizes["planner"] = dump("planner.json", plan)`.

- [ ] **Paso 7: correr el sitio y revisar.**
  `$PY -m pipeline.site && $PY -m pipeline.check_links` (0 enlaces rotos).
  `git diff --stat games/valheim/data/site` → nuevo `planner.json`; las
  demás pestañas iguales salvo lo que traiga la extracción de la tarea 1.
  Revisar los materiales con más de un camino:

```bash
$PY - <<'EOF'
import json
p=json.load(open('data/site/planner.json',encoding='utf8'))
print(len(p['items']), 'objetos,', sum('cat' in x for x in p['items'].values()), 'en el catálogo')
for k, rows in p['convert'].items():
    if len(rows) > 1 or (k in p['recipes'] and rows):
        print(k, [r['from'] for r in rows], 'receta' if k in p['recipes'] else '', p['prefer'].get(k, ''))
print(p['recipes']['THSwordKrom']); print(p['convert']['Iron']); print(p['sources'].get('Entrails'))
EOF
```

  Para cada material donde el primer camino no es el de siempre, sumarlo a
  `PLANNER_PREFER` con su porqué y volver a correr `pipeline.site`. Tamaño
  esperado de `planner.json`: menos de 400 KB.

- [ ] **Paso 8: commit.**

```bash
git add games/valheim/pipeline games/valheim/data/site/planner.json
git commit -m "feat(valheim): planner.json, el grafo de recetas y fuentes del Planificador"
```

---

### Tarea 3: el cálculo (`valheimPlanner.ts`)

**Archivos:**
- Crear: `games/tft/ui/src/valheimPlanner.ts`
- Crear: `games/tft/ui/test/valheimPlanner.test.ts`

**Consume:** la forma de `planner.json` de la tarea 2.
**Produce** (lo usan las tareas 4 a 7): los tipos `PlannerData`, `PItem`,
`PSource`, `PlanState`, `Pick`, `Via`, `Step`, `Plan`, `TreeNode`, `PlanCat`,
`PLAN_CATS`, `EMPTY_PLAN`, `CARRY`, y las funciones `viaOptions(d,id)`,
`viaOf(d,st,id)`, `stepFor(d,st,id,qty,via,level?)`, `plan(d,st)`,
`tree(d,st,id,qty)`, `sanitize(d,st)`, `addPick(st,id)`, `setPick(st,i,patch)`,
`setVia(st,id,via|null)`, `setAny(st,id,reqId)`, `encodePlan(st)`,
`decodePlan(search)`.

- [ ] **Paso 1: test que falla** — `test/valheimPlanner.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addPick, decodePlan, EMPTY_PLAN, encodePlan, plan, sanitize, setPick, tree,
  type PlannerData, type PlanState,
} from "../src/valheimPlanner";

const T = (en: string) => ({ en, es: en });
const it0 = (en: string, weight = 1, extra: object = {}) => ({ name: T(en), icon: null, weight, tier: null, slug: en.toLowerCase(), tab: "materials", ...extra });
const st = (t: string) => ({ name: T(t), icon: null, slug: t, tab: "building" });

const D: PlannerData = {
  items: {
    HelmetIron: it0("Iron Helmet", 3, { cat: "armor", maxQ: 4 }),
    Sausages: it0("Sausages", 0.5, { cat: "foods" }),
    FishWraps: it0("Fish wraps", 1, { cat: "foods" }),
    Iron: it0("Iron", 12), IronScrap: it0("Scrap iron", 10, { tier: "swamp" }), IronOre: it0("Iron ore", 10),
    Coal: it0("Coal", 2), Wood: it0("Wood", 2, { tier: "meadows" }), DeerHide: it0("Deer hide", 1, { tier: "meadows" }),
    Entrails: it0("Entrails", 0.5, { tier: "swamp" }), RawMeat: it0("Boar meat", 1, { tier: "meadows" }), Thistle: it0("Thistle", 0.1, { tier: "blackforest" }),
    Fish1: it0("Perch", 2), Fish2: it0("Pike", 2),
  },
  recipes: {
    HelmetIron: { st: "piece_forge", lv: 1, n: 1, req: [["Iron", 20, 5], ["DeerHide", 2, 0]] },
    Sausages: { st: "piece_cauldron", lv: 2, n: 4, req: [["Entrails", 4, 1], ["RawMeat", 1, 1], ["Thistle", 1, 1]] },
    FishWraps: { st: "piece_cauldron", lv: 1, n: 1, req: [["Fish1", 1, 0], ["Fish2", 1, 0]], any: true },
  },
  convert: {
    Iron: [{ st: "piece_smelter", from: "IronOre", time: 30, n: 1, fuel: ["Coal", 2] }, { st: "piece_smelter", from: "IronScrap", time: 30, n: 1, fuel: ["Coal", 2] }],
    Coal: [{ st: "piece_charcoalkiln", from: "Wood", time: 15, n: 1 }],
  },
  sources: {
    IronScrap: [{ how: "mine", biomes: ["swamp"], name: T("Muddy scrap pile") }],
    IronOre: [{ how: "location", biomes: [], name: null }],
    Coal: [{ how: "drop", biomes: [], name: T("Surtling"), min: 4, max: 5 }],
  },
  stations: { piece_forge: st("forge"), piece_cauldron: st("cauldron"), piece_smelter: st("smelter"), piece_charcoalkiln: st("kiln") },
  prefer: { Iron: "from:IronScrap" },
};
const S = (picks: PlanState["picks"], extra: Partial<PlanState> = {}): PlanState => ({ ...EMPTY_PLAN, picks, ...extra });
const qty = (rows: { id: string; qty: number }[], id: string) => rows.find((r) => r.id === id)?.qty;

describe("el Planificador de Valheim", () => {
  it("cada nivel cuesta más, como en el juego, y pide la estación más alta", () => {
    const p = plan(D, S([{ id: "HelmetIron", qty: 1, level: 3 }]));
    expect(qty(p.table, "Iron")).toBe(20 + 5 * 1 + 5 * 2);
    expect(qty(p.table, "DeerHide")).toBe(2);
    expect(p.stations).toContainEqual(["piece_forge", 3]);
  });

  it("baja hasta lo crudo con el combustible, el peso y los minutos de fundición", () => {
    const p = plan(D, S([{ id: "HelmetIron", qty: 3, level: 2 }]));
    expect(qty(p.table, "Iron")).toBe(75);
    expect(qty(p.raw, "IronScrap")).toBe(75);
    expect(qty(p.raw, "Wood")).toBe(150);
    expect(qty(p.raw, "DeerHide")).toBe(6);
    expect(qty(p.raw, "Coal")).toBeUndefined();
    expect(p.weight).toBe(75 * 10 + 150 * 2 + 6);
    expect(p.trips).toBe(4);
    expect(p.fuelMinutes).toBe(38);
    expect(p.biomes).toEqual(["meadows", "swamp"]);
  });

  it("redondea las tandas para arriba y avisa lo que sobra", () => {
    const p = plan(D, S([{ id: "Sausages", qty: 10, level: 1 }]));
    expect(qty(p.table, "Entrails")).toBe(12);
    expect(qty(p.table, "RawMeat")).toBe(3);
    expect(p.leftovers).toEqual([{ id: "Sausages", asked: 10, made: 12 }]);
    expect(p.stations).toContainEqual(["piece_cauldron", 2]);
  });

  it("respeta el camino elegido e ignora uno que no existe", () => {
    expect(qty(plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Iron: "from:IronOre" } })).raw, "IronOre")).toBe(20);
    expect(qty(plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Iron: "from:Gold" } })).raw, "IronScrap")).toBe(20);
    const coalRaw = plan(D, S([{ id: "HelmetIron", qty: 1, level: 1 }], { via: { Coal: "raw" } }));
    expect(qty(coalRaw.raw, "Coal")).toBe(40);
    expect(qty(coalRaw.raw, "Wood")).toBeUndefined();
  });

  it("en las recetas de uno cualquiera usa el primero o el elegido", () => {
    expect(qty(plan(D, S([{ id: "FishWraps", qty: 2, level: 1 }])).table, "Fish1")).toBe(2);
    const p = plan(D, S([{ id: "FishWraps", qty: 2, level: 1 }], { any: { FishWraps: "Fish2" } }));
    expect(qty(p.table, "Fish2")).toBe(2);
    expect(qty(p.table, "Fish1")).toBeUndefined();
  });

  it("arma el árbol de un material", () => {
    const t = tree(D, EMPTY_PLAN, "Iron", 105);
    expect(t.st).toBe("piece_smelter");
    expect(t.kids.map((k) => [k.id, k.qty])).toEqual([["IronScrap", 105], ["Coal", 210]]);
    expect(t.kids[1].kids.map((k) => [k.id, k.qty])).toEqual([["Wood", 210]]);
  });

  it("corta un ciclo sin colgarse", () => {
    const C: PlannerData = { ...D, items: { ...D.items, A: it0("A", 1, { cat: "materials" }), B: it0("B") },
      convert: { A: [{ st: "x", from: "B", time: 1, n: 1 }], B: [{ st: "x", from: "A", time: 1, n: 1 }] } };
    const p = plan(C, S([{ id: "A", qty: 1, level: 1 }]));
    expect(p.raw.length).toBeGreaterThan(0);
    expect(tree(C, EMPTY_PLAN, "A", 1).kids[0].kids[0].kids).toEqual([]);
  });

  it("guarda la lista en la dirección y la vuelve a leer", () => {
    const s = S([{ id: "HelmetIron", qty: 1, level: 2 }, { id: "Sausages", qty: 10, level: 1 }, { id: "piece:forge", qty: 1, level: 1 }],
      { via: { Iron: "from:IronOre" }, any: { FishWraps: "Fish2" } });
    const q = encodePlan(s);
    expect(q).toBe("l=HelmetIron.2,Sausages*10,piece:forge&via=Iron~from:IronOre&any=FishWraps~Fish2");
    expect(decodePlan(`?${q}`)).toEqual(s);
    expect(decodePlan("")).toEqual(EMPTY_PLAN);
  });

  it("limpia lo que no está en el catálogo y acota nivel y cantidad", () => {
    const s = sanitize(D, S([{ id: "HelmetIron", qty: 5000, level: 9 }, { id: "Iron", qty: 1, level: 1 }, { id: "Nope", qty: 1, level: 1 }]));
    expect(s.picks).toEqual([{ id: "HelmetIron", qty: 999, level: 4 }]);
  });

  it("agregar suma uno y cantidad cero lo saca", () => {
    const a = addPick(addPick(EMPTY_PLAN, "Sausages"), "Sausages");
    expect(a.picks).toEqual([{ id: "Sausages", qty: 2, level: 1 }]);
    expect(setPick(a, 0, { qty: 0 }).picks).toEqual([]);
    expect(setPick(a, 0, { level: 3 }).picks[0].level).toBe(3);
  });
});

describe("con los datos del juego", () => {
  const real = JSON.parse(readFileSync(new URL("../../../valheim/data/site/planner.json", import.meta.url), "utf-8")) as PlannerData;

  it("la armadura de hierro a nivel 2, Krom y 10 salchichas dan lo de la maqueta", () => {
    const p = plan(real, decodePlan("?l=HelmetIron.2,ArmorIronChest.2,ArmorIronLegs.2,THSwordKrom,Sausages*10"));
    expect(Object.fromEntries(p.table.map((n) => [n.id, n.qty]))).toEqual({
      Iron: 105, DeerHide: 6, Bronze: 20, ScaleHide: 5, Entrails: 12, RawMeat: 3, Thistle: 3,
    });
    expect(qty(p.raw, "IronScrap")).toBe(105);
    expect(qty(p.raw, "CopperOre")).toBe(40);
    expect(qty(p.raw, "TinOre")).toBe(20);
    expect(qty(p.raw, "Wood")).toBe(330);
    expect(p.stations).toContainEqual(["piece_forge", 3]);
    expect(JSON.stringify(p)).not.toContain("Upgrader");
  });
});
```

- [ ] **Paso 2: correrlo y verlo fallar.** `npx vitest run test/valheimPlanner.test.ts` → falla al importar.

- [ ] **Paso 3: `src/valheimPlanner.ts`:**

```ts
/**
 * El cálculo del Planificador de Valheim (2026-09-25), sin React.
 *
 * Pedido de ZoTaD: eliges lo que quieres fabricar, con nivel y cantidad, y te
 * dice cuánto juntar de cada cosa y dónde. Los datos salen de
 * `games/valheim/data/site/planner.json` (`pipeline/planner.py`). Diseño:
 * docs/design/2026-09-25-valheim-planificador.md.
 */
import { BIOME_IDS, type BiomeId, type Txt } from "./valheimData";

export type PlanCat = "weapons" | "armor" | "tools" | "foods" | "meads" | "materials" | "building" | "bosses";
export const PLAN_CATS: PlanCat[] = ["weapons", "armor", "tools", "foods", "meads", "materials", "building", "bosses"];

export interface PItem { name: Txt; icon: string | null; weight: number; tier: BiomeId | null; slug: string | null; tab: string | null; cat?: PlanCat; maxQ?: number }
export type PReq = [id: string, amount: number, perLevel: number];
export interface PRecipe { st: string | null; lv: number; n: number; req: PReq[]; any?: boolean }
export interface PConvert { st: string; from: string; time: number | null; n: number; fuel?: [id: string, perProduct: number] }
export interface PSource { how: string; biomes: BiomeId[]; name: Txt | null; slug?: string | null; tab?: string | null; chance?: number; min?: number; max?: number; price?: number }
export interface PStation { name: Txt; icon: string | null; slug: string | null; tab: string | null }
export interface PlannerData {
  items: Record<string, PItem>;
  recipes: Record<string, PRecipe>;
  convert: Record<string, PConvert[]>;
  sources: Record<string, PSource[]>;
  stations: Record<string, PStation>;
  prefer: Record<string, string>;
}

export interface Pick { id: string; qty: number; level: number }
/** La lista, el camino elegido para cada material y el ingrediente de las recetas de "uno cualquiera". */
export interface PlanState { picks: Pick[]; via: Record<string, string>; any: Record<string, string> }
export const EMPTY_PLAN: PlanState = { picks: [], via: {}, any: {} };

/** Cómo se consigue algo: fabricándolo, convirtiendo otra cosa (`from:IronScrap`) o juntándolo tal cual. */
export type Via = "craft" | "raw" | `from:${string}`;

/** La carga de un vikingo sin cinturón ni efectos. */
export const CARRY = 300;
export const MAX_QTY = 999;

export function viaOptions(d: PlannerData, id: string): Via[] {
  const out: Via[] = [];
  if (d.recipes[id]) out.push("craft");
  for (const c of d.convert[id] ?? []) out.push(`from:${c.from}`);
  if (d.sources[id]?.length) out.push("raw");
  return out;
}

/** El camino de un material: el elegido, el preferido del pipeline o el primero que haya. */
export function viaOf(d: PlannerData, st: PlanState, id: string): Via {
  const opts = viaOptions(d, id) as string[];
  for (const v of [st.via[id], d.prefer[id]]) if (v && opts.includes(v)) return v as Via;
  return (opts[0] as Via | undefined) ?? "raw";
}

export interface Step {
  id: string;
  qty: number;
  made: number;
  batches: number;
  st: string | null;
  lv: number;
  inputs: [string, number][];
  /** Segundos de estación (conversiones). */
  time: number;
  /** Quema combustible (fundición, alto horno, refinería). */
  fuel: boolean;
}

/**
 * Una vuelta de receta o de conversión para `qty` de `id`. En una receta, el
 * nivel suma las mejoras como el juego (`Piece.Requirement.GetAmount`):
 * fabricar cuesta `amount` y subir al nivel k cuesta `perLevel × (k − 1)`.
 */
export function stepFor(d: PlannerData, st: PlanState, id: string, qty: number, via: Via, level = 1): Step | null {
  if (via === "craft") {
    const r = d.recipes[id];
    if (!r) return null;
    const batches = Math.ceil(qty / r.n);
    const reqs = r.any && r.req.length ? [r.req.find((q) => q[0] === st.any[id]) ?? r.req[0]] : r.req;
    const ups = (level * (level - 1)) / 2;
    const inputs: [string, number][] = [];
    for (const [rid, amount, perLevel] of reqs) {
      const n = amount * batches + perLevel * ups * qty;
      if (n > 0) inputs.push([rid, n]);
    }
    return { id, qty, made: batches * r.n, batches, st: r.st, lv: r.lv + level - 1, inputs, time: 0, fuel: false };
  }
  if (via.startsWith("from:")) {
    const from = via.slice(5);
    const c = (d.convert[id] ?? []).find((x) => x.from === from);
    if (!c) return null;
    const batches = Math.ceil(qty / c.n);
    const inputs: [string, number][] = [[from, batches]];
    if (c.fuel) inputs.push([c.fuel[0], c.fuel[1] * batches]);
    return { id, qty, made: batches * c.n, batches, st: c.st, lv: 1, inputs, time: (c.time ?? 0) * batches, fuel: !!c.fuel };
  }
  return null;
}

/** Lo elegido siempre se fabrica: si su camino es "juntarlo", va el primero que lo fabrica. */
function makeVia(d: PlannerData, st: PlanState, id: string): Via | null {
  const v = viaOf(d, st, id);
  return v !== "raw" ? v : viaOptions(d, id).find((o) => o !== "raw") ?? null;
}

export interface Need { id: string; qty: number }
export interface Plan {
  /** Lo que va a la mesa, con para qué objetos de la lista. */
  table: (Need & { for: string[] })[];
  /** Lo que hay que salir a juntar, de mayor a menor. */
  raw: Need[];
  /** Cada fundición, cocción o fabricación intermedia, sumada. */
  steps: Step[];
  /** Estación → nivel más alto que se pide. */
  stations: [string, number][];
  weight: number;
  trips: number;
  fuelMinutes: number;
  biomes: BiomeId[];
  leftovers: { id: string; asked: number; made: number }[];
}

export function plan(d: PlannerData, st: PlanState): Plan {
  const table = new Map<string, { qty: number; for: string[] }>();
  const stations = new Map<string, number>();
  const bump = (s: string | null, lv: number) => { if (s) stations.set(s, Math.max(stations.get(s) ?? 0, lv)); };
  const leftovers: Plan["leftovers"] = [];
  for (const p of st.picks) {
    const via = makeVia(d, st, p.id);
    const s = via ? stepFor(d, st, p.id, p.qty, via, p.level) : null;
    if (!s) continue;
    bump(s.st, s.lv);
    if (s.made > p.qty) leftovers.push({ id: p.id, asked: p.qty, made: s.made });
    for (const [id, n] of s.inputs) {
      const e = table.get(id) ?? { qty: 0, for: [] };
      e.qty += n;
      if (!e.for.includes(p.id)) e.for.push(p.id);
      table.set(id, e);
    }
  }

  // Orden topológico por el camino elegido: cada material se procesa una vez,
  // con toda su demanda junta (así las tandas se redondean una sola vez). Un
  // ciclo se corta ahí: ese material se junta tal cual.
  const mark = new Map<string, 1 | 2>();
  const cut = new Set<string>();
  const order: string[] = [];
  const kids = (id: string) => {
    const s = stepFor(d, st, id, 1, viaOf(d, st, id));
    return s ? s.inputs.map((x) => x[0]) : [];
  };
  const visit = (id: string) => {
    const m = mark.get(id);
    if (m === 2) return;
    if (m === 1) { cut.add(id); return; }
    mark.set(id, 1);
    for (const c of kids(id)) visit(c);
    mark.set(id, 2);
    order.push(id);
  };
  for (const id of table.keys()) visit(id);
  order.reverse();

  const demand = new Map<string, number>([...table].map(([id, e]) => [id, e.qty]));
  const raw = new Map<string, number>();
  const done = new Set<string>();
  const steps: Step[] = [];
  const addRaw = (id: string, n: number) => raw.set(id, (raw.get(id) ?? 0) + n);
  for (const id of order) {
    done.add(id);
    const q = demand.get(id) ?? 0;
    if (!q) continue;
    const via = cut.has(id) ? "raw" : viaOf(d, st, id);
    const s = via === "raw" ? null : stepFor(d, st, id, q, via);
    if (!s) { addRaw(id, q); continue; }
    steps.push(s);
    bump(s.st, s.lv);
    for (const [c, n] of s.inputs) {
      if (done.has(c)) addRaw(c, n);
      else demand.set(c, (demand.get(c) ?? 0) + n);
    }
  }

  const rawList = [...raw].map(([id, qty]) => ({ id, qty })).sort((a, b) => b.qty - a.qty || a.id.localeCompare(b.id));
  const weight = Math.round(rawList.reduce((w, n) => w + n.qty * (d.items[n.id]?.weight ?? 0), 0) * 10) / 10;
  const tiers = new Set(rawList.map((n) => d.items[n.id]?.tier).filter(Boolean));
  return {
    table: [...table].map(([id, e]) => ({ id, qty: e.qty, for: e.for })),
    raw: rawList,
    steps,
    stations: [...stations],
    weight,
    trips: Math.ceil(weight / CARRY),
    fuelMinutes: Math.round(steps.filter((s) => s.fuel).reduce((t, s) => t + s.time, 0) / 60),
    biomes: BIOME_IDS.filter((b) => tiers.has(b)),
    leftovers,
  };
}

export interface TreeNode { id: string; qty: number; st: string | null; per: number; kids: TreeNode[] }

/**
 * El desglose de un material para dibujarlo. Cada rama se calcula sola, así que
 * si dos ramas comparten una tanda (rarísimo) la suma puede diferir en una
 * tanda de "Para juntar", que sí junta la demanda.
 */
export function tree(d: PlannerData, st: PlanState, id: string, qty: number, path: string[] = []): TreeNode {
  const via = path.includes(id) || path.length > 8 ? "raw" : viaOf(d, st, id);
  const s = via === "raw" ? null : stepFor(d, st, id, qty, via);
  return {
    id, qty, st: s?.st ?? null, per: s ? s.made / s.batches : 1,
    kids: s ? s.inputs.map(([c, n]) => tree(d, st, c, n, [...path, id])) : [],
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo));

/** Sólo lo que está en el catálogo, con nivel y cantidad dentro de lo posible. */
export function sanitize(d: PlannerData, st: PlanState): PlanState {
  const picks = st.picks
    .filter((p) => d.items[p.id]?.cat)
    .map((p) => ({ id: p.id, qty: clamp(p.qty, 1, MAX_QTY), level: clamp(p.level, 1, d.items[p.id].maxQ ?? 1) }));
  return { ...st, picks };
}

export function addPick(st: PlanState, id: string): PlanState {
  const i = st.picks.findIndex((p) => p.id === id);
  if (i >= 0) return setPick(st, i, { qty: Math.min(MAX_QTY, st.picks[i].qty + 1) });
  return { ...st, picks: [...st.picks, { id, qty: 1, level: 1 }] };
}

export function setPick(st: PlanState, i: number, patch: Partial<Pick>): PlanState {
  const next = { ...st.picks[i], ...patch };
  const picks = next.qty > 0 ? st.picks.map((p, j) => (j === i ? next : p)) : st.picks.filter((_, j) => j !== i);
  return { ...st, picks };
}

export function setVia(st: PlanState, id: string, via: Via | null): PlanState {
  const next = { ...st.via };
  if (via) next[id] = via; else delete next[id];
  return { ...st, via: next };
}

export function setAny(st: PlanState, id: string, reqId: string): PlanState {
  return { ...st, any: { ...st.any, [id]: reqId } };
}

// La dirección: `l=HelmetIron.2,Sausages*10,piece:forge&via=Iron~from:IronOre&any=FishWraps~Fish2`.
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ":");
const pairs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${enc(k)}~${enc(v)}`).join(",");

export function encodePlan(st: PlanState): string {
  const parts: string[] = [];
  if (st.picks.length) parts.push("l=" + st.picks.map((p) => enc(p.id) + (p.level > 1 ? `.${p.level}` : "") + (p.qty > 1 ? `*${p.qty}` : "")).join(","));
  if (Object.keys(st.via).length) parts.push("via=" + pairs(st.via));
  if (Object.keys(st.any).length) parts.push("any=" + pairs(st.any));
  return parts.join("&");
}

const PICK_RE = /^(.+?)(?:\.(\d+))?(?:\*(\d+))?$/;

export function decodePlan(search: string): PlanState {
  const q = new URLSearchParams(search);
  const picks: Pick[] = [];
  for (const tok of (q.get("l") ?? "").split(",")) {
    const m = PICK_RE.exec(tok.trim());
    if (m) picks.push({ id: m[1], level: m[2] ? Number(m[2]) : 1, qty: m[3] ? Number(m[3]) : 1 });
  }
  const read = (k: string) => {
    const o: Record<string, string> = {};
    for (const tok of (q.get(k) ?? "").split(",")) {
      const i = tok.indexOf("~");
      if (i > 0) o[tok.slice(0, i)] = tok.slice(i + 1);
    }
    return o;
  };
  return { picks, via: read("via"), any: read("any") };
}
```

- [ ] **Paso 4: correr y ver pasar.** `npx vitest run test/valheimPlanner.test.ts` → todos PASS.
  Si el test con datos reales falla, revisar primero `planner.json` (tarea 2)
  antes de tocar el cálculo.

- [ ] **Paso 5: commit.**

```bash
git add games/tft/ui/src/valheimPlanner.ts games/tft/ui/test/valheimPlanner.test.ts
git commit -m "feat(valheim): el cálculo del Planificador (niveles, tandas, caminos, hasta lo crudo)"
```

---

### Tarea 4: carga de datos, store y rutas

**Archivos:**
- Modificar: `games/tft/ui/src/valheimData.ts` (cargador de `planner`)
- Crear: `games/tft/ui/src/valheimPlannerStore.ts`
- Modificar: `games/tft/ui/src/route.ts` (sección `planner`)
- Modificar: `games/tft/ui/test/valheimRoute.test.ts`

**Produce:** `loadPlanner()`, `peekPlanner()`; `usePlan()`, `setPlan(st)`,
`getPlan()`, `writeUrl()`, `addToPlan(id)`, `useHave(list)`; la sección
`"planner"` con detalle opcional `"route"`.

- [ ] **Paso 1: test de rutas que falla** (agregar en `valheimRoute.test.ts`):

```ts
  it("el Planificador y su hoja de ruta (2026-09-25)", () => {
    const r = parseRoute("/es/valheim/planner");
    expect(r.vhSection).toBe("planner");
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/es/valheim/planner");
    const h = parseRoute("/en/valheim/planner/route");
    expect(h.detail).toBe("route");
    expect(routePath(h)).toBe("/en/valheim/planner/route");
    expect(parseRoute("/es/valheim/planner/otra").detail).toBeUndefined();
  });
```

  `npx vitest run test/valheimRoute.test.ts` → FAIL.

- [ ] **Paso 2: `route.ts`.** Tipo:
  `export type ValheimSection = "home" | ValheimTab | "patches" | "map" | "planner";`
  y en `parseRoute`, después de la línea de `"map"`:

```ts
    if (rest[1] === "planner") return { ...base, view: "valheim", vhSection: "planner", detail: rest[2] === "route" ? "route" : undefined };
```

  Actualizar el comentario de las secciones: "planner" es el Planificador
  (`/valheim/planner?l=…`) y su hoja de ruta (`/valheim/planner/route`).
  `npx vitest run test/valheimRoute.test.ts` → PASS.

- [ ] **Paso 3: cargador en `valheimData.ts`** (debajo de `peekIndex`):

```ts
/** El grafo del Planificador (`pipeline/planner.py`): sólo lo pide esa pestaña. */
export const loadPlanner = () => load<PlannerData>("planner");
export const peekPlanner = (): PlannerData | null => (listos.get("planner") as PlannerData | undefined) ?? null;
```

  con `import type { PlannerData } from "./valheimPlanner";` arriba.

- [ ] **Paso 4: `src/valheimPlannerStore.ts`:**

```ts
/**
 * La lista del Planificador (2026-09-25): una sola para todo el sitio, así el
 * botón "Agregar al Planificador" de cada ficha y la pestaña ven lo mismo. Se
 * guarda en este navegador y, en las páginas del Planificador, en la dirección
 * (para compartirla). Sin cuentas.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { addPick, decodePlan, EMPTY_PLAN, encodePlan, type PlanState } from "./valheimPlanner";

const KEY = "vestigo:valheim:planner";
const HAVE = "vestigo:valheim:planner:have";
const onPlanner = () => typeof window !== "undefined" && window.location.pathname.includes("/valheim/planner");

let plan: PlanState = EMPTY_PLAN;
let ready = false;
const subs = new Set<() => void>();

function start() {
  if (ready || typeof window === "undefined") return;
  ready = true;
  const fromUrl = onPlanner() ? decodePlan(window.location.search) : EMPTY_PLAN;
  if (fromUrl.picks.length) { plan = fromUrl; return; }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) plan = decodePlan(`?${saved}`);
  } catch { /* sin almacenamiento: la lista vive sólo en esta pestaña */ }
}

export function getPlan(): PlanState {
  start();
  return plan;
}

/** Deja la lista en la dirección, sin sumar una entrada al historial. Sólo en el Planificador. */
export function writeUrl() {
  if (!onPlanner()) return;
  const q = encodePlan(getPlan());
  window.history.replaceState(window.history.state, "", window.location.pathname + (q ? `?${q}` : ""));
}

export function setPlan(next: PlanState) {
  start();
  plan = next;
  try { localStorage.setItem(KEY, encodePlan(next)); } catch { /* ídem */ }
  writeUrl();
  subs.forEach((f) => f());
}

export const addToPlan = (id: string) => setPlan(addPick(getPlan(), id));

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const usePlan = (): PlanState => useSyncExternalStore(subscribe, getPlan, () => EMPTY_PLAN);

/** "Ya lo tengo": sólo visual, por lista; si la lista cambia, se empieza de cero. */
function readHave(list: string): Set<string> {
  try {
    const o = JSON.parse(localStorage.getItem(HAVE) ?? "null");
    return new Set(o && o.list === list ? o.ids : []);
  } catch {
    return new Set();
  }
}

export function useHave(list: string): [Set<string>, (id: string) => void] {
  const [have, setHave] = useState<Set<string>>(() => new Set());
  useEffect(() => setHave(readHave(list)), [list]);
  const toggle = (id: string) => setHave((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(HAVE, JSON.stringify({ list, ids: [...n] })); } catch { /* ídem */ }
    return n;
  });
  return [have, toggle];
}
```

- [ ] **Paso 5: tipos y tests.** `npx tsc -b` (desde `games/tft/ui`) va a marcar
  los usos de `ValheimSection` que no contemplan `"planner"`
  (`prerender.ts`, `Valheim.tsx`): se arreglan en la tarea 5. Correr
  `npx vitest run test/valheimRoute.test.ts test/valheimPlanner.test.ts` → PASS.

- [ ] **Paso 6: commit.**

```bash
git add games/tft/ui/src/route.ts games/tft/ui/src/valheimData.ts games/tft/ui/src/valheimPlannerStore.ts games/tft/ui/test/valheimRoute.test.ts
git commit -m "feat(valheim): ruta, datos y lista guardada del Planificador"
```

---

### Tarea 5: textos, pestaña, SEO y página del Planificador (paso 1)

**Archivos:**
- Modificar: `games/tft/ui/src/valheimCopy.ts` (bloque `plan` en EN y ES)
- Modificar: `games/tft/ui/src/Valheim.tsx` (pestaña, tarjeta en la portada, render)
- Modificar: `games/tft/ui/src/prerender.ts` (título, descripción, migas, WebApplication)
- Modificar: `games/tft/ui/src/sitemap.ts` (`/valheim/planner`)
- Crear: `games/tft/ui/src/ValheimPlanner.tsx` (carga los datos y elige el paso)
- Crear: `games/tft/ui/src/ValheimPlannerPick.tsx` (paso 1)
- Crear: `games/tft/ui/src/styles/valheim-planner.css`; importarlo en `src/main.tsx` después de `valheim.css`
- Test: `games/tft/ui/test/sitemap.test.ts` (o `prerender.test.ts`): el planner está en el sitemap en los dos idiomas.

- [ ] **Paso 1: test del sitemap que falla** (en `test/sitemap.test.ts`, usando el `SitemapData` de ejemplo que ya arma ese archivo, con `vh`):

```ts
  it("incluye el Planificador de Valheim en los dos idiomas (2026-09-25)", () => {
    const paths = sitemapPaths(DATA_WITH_VH);
    expect(paths).toContain("/es/valheim/planner");
    expect(paths).toContain("/en/valheim/planner");
    expect(paths).not.toContain("/es/valheim/planner/route");
  });
```

  (`DATA_WITH_VH`: el objeto de datos del archivo con `vh: { entries: [], editions: [] }`;
  si el archivo no tiene uno, armarlo con el mínimo que pide `SitemapData`.)
  → FAIL.

- [ ] **Paso 2: `sitemap.ts`**, junto a la línea del mapa:
  `paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "planner" }));` → PASS.

- [ ] **Paso 3: textos.** En `valheimCopy.ts`, dentro de `EN` (después de `map`):

```ts
  // El Planificador (2026-09-25): eliges qué fabricar y te dice qué juntar y dónde.
  plan: {
    tab: "Planner",
    hub: "What to gather, and where",
    seoTitle: "Valheim Crafting Planner (1.0): every material and where to find it | Vestigo",
    seoDesc: "Pick what you want to make in Valheim — weapons and armor at any upgrade level, food, meads, buildings, boss offerings — and get every material you need, the biome and creature it comes from, the stations and the total weight. Free, in your browser.",
    title: "Planner",
    lede: "Build your list and get the route: what to gather, how much and in which biome.",
    search: "Search anything you can craft, cook or build",
    all: "All",
    cats: { weapons: "Weapons", armor: "Armor", tools: "Tools", foods: "Food", meads: "Meads", materials: "Materials", building: "Building", bosses: "Bosses" } as Record<string, string>,
    biome: "Biome",
    colItem: "Item", colWhere: "Made at", colBiome: "Biome",
    add: "+ Add",
    inList: (n: number) => `✓ In your list · ${n}`,
    more: (n: number) => `Show ${n} more`,
    noHits: "Nothing you can make matches that.",
    yourList: "Your list",
    clear: "Clear",
    empty: "Your list is empty. Add what you want to make from the table.",
    level: (n: number) => `Level ${n}`,
    less: "One less", plus: "One more", remove: "Remove", qty: "Amount",
    batch: (n: number, made: number) => `Made ${n} at a time: you get ${made}`,
    rawCount: "raw materials",
    biomeCount: "biomes to visit",
    next: "Next: materials →",
    saved: "Your list stays in this browser and in the link.",
    open: (n: number) => `Your list · ${n}`,
    close: "Close",
    routeTitle: "Route",
    back: "← Back to the list",
    weight: "weight",
    trips: (n: number) => `${n} ${n === 1 ? "trip" : "trips"} at 300`,
    smelting: "min of smelting",
    biomes: "biomes",
    breakdown: "Breakdown",
    toTable: "What goes on the table",
    toRaw: "Down to raw",
    forWhat: (names: string) => `For ${names}`,
    atStation: (st: string, n: number) => (n > 1 ? `${st}, ${n} at a time` : st),
    gather: "To gather",
    ready: (a: number, b: number) => `${a} of ${b} ready`,
    have: "I have it",
    stations: "Stations you need",
    stationLevel: (name: string, lv: number) => (lv > 1 ? `${name} · level ${lv}` : name),
    paths: "Paths",
    viaCraft: (st: string) => `craft it (${st})`,
    viaFrom: (name: string) => `from ${name}`,
    viaRaw: "gather it as is",
    anyOf: (name: string) => `${name}: use`,
    copy: "Copy link",
    copied: "Link copied",
    nothing: "Your list is empty.",
    goPick: "Pick what to make",
    how: { drop: "Dropped by", mine: "Mined", tree: "Chop trees", pickable: "Picked up", farm: "Farmed", location: "Found at", extract: "Extracted", fish: "Fished", destructible: "Break", trader: "Sold by", chest: "Chests" } as Record<string, string>,
    left: (asked: number, made: number) => `you asked for ${asked}, you get ${made}`,
    addBtn: "+ Add to the Planner",
    inPlanner: (n: number) => `✓ In the Planner · ${n}`,
    see: "See the list",
  },
```

  y en `ES`:

```ts
  plan: {
    tab: "Planificador",
    hub: "Qué juntar y dónde",
    seoTitle: "Planificador de Valheim (1.0): todos los materiales y dónde conseguirlos | Vestigo",
    seoDesc: "Elige lo que quieres fabricar en Valheim — armas y armaduras en cualquier nivel, comidas, hidromieles, construcciones, ofrendas de jefes — y obtén cada material que necesitas, el bioma y la criatura de donde sale, las estaciones y el peso total. Gratis, en tu navegador.",
    title: "Planificador",
    lede: "Arma tu lista y te damos la hoja de ruta: qué juntar, cuánto y en qué bioma.",
    search: "Busca cualquier cosa que se fabrique, se cocine o se construya",
    all: "Todo",
    cats: { weapons: "Armas", armor: "Armaduras", tools: "Herramientas", foods: "Comidas", meads: "Hidromieles", materials: "Materiales", building: "Construcción", bosses: "Jefes" },
    biome: "Bioma",
    colItem: "Objeto", colWhere: "Se hace en", colBiome: "Bioma",
    add: "+ Agregar",
    inList: (n) => `✓ En la lista · ${n}`,
    more: (n) => `Ver ${n} más`,
    noHits: "No hay nada que se fabrique con ese nombre.",
    yourList: "Tu lista",
    clear: "Vaciar",
    empty: "Tu lista está vacía. Agrega desde la tabla lo que quieres fabricar.",
    level: (n) => `Nivel ${n}`,
    less: "Uno menos", plus: "Uno más", remove: "Quitar", qty: "Cantidad",
    batch: (n, made) => `Salen de a ${n}: te quedan ${made}`,
    rawCount: "materiales crudos",
    biomeCount: "biomas por recorrer",
    next: "Siguiente: materiales →",
    saved: "La lista queda guardada en este navegador y en el enlace.",
    open: (n) => `Tu lista · ${n}`,
    close: "Cerrar",
    routeTitle: "Hoja de ruta",
    back: "← Volver a la lista",
    weight: "de peso",
    trips: (n) => `${n} ${n === 1 ? "viaje" : "viajes"} con 300 de carga`,
    smelting: "min de fundición",
    biomes: "biomas",
    breakdown: "Desglose",
    toTable: "Lo que va a la mesa",
    toRaw: "Hasta lo crudo",
    forWhat: (names) => `Para ${names}`,
    atStation: (st, n) => (n > 1 ? `${st}, de a ${n}` : st),
    gather: "Para juntar",
    ready: (a, b) => `${a} de ${b} listos`,
    have: "Ya lo tengo",
    stations: "Estaciones que necesitas",
    stationLevel: (name, lv) => (lv > 1 ? `${name} · nivel ${lv}` : name),
    paths: "Caminos",
    viaCraft: (st) => `fabricarlo (${st})`,
    viaFrom: (name) => `de ${name}`,
    viaRaw: "juntarlo tal cual",
    anyOf: (name) => `${name}: usar`,
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    nothing: "Tu lista está vacía.",
    goPick: "Elegir qué fabricar",
    how: { drop: "Lo suelta", mine: "Se mina", tree: "Talando árboles", pickable: "Se recoge", farm: "Se cultiva", location: "Está en", extract: "Se extrae", fish: "Se pesca", destructible: "Rompiendo", trader: "Lo vende", chest: "En cofres" },
    left: (asked, made) => `pediste ${asked}, salen ${made}`,
    addBtn: "+ Agregar al Planificador",
    inPlanner: (n) => `✓ En el Planificador · ${n}`,
    see: "Ver la lista",
  },
```

- [ ] **Paso 4: `prerender.ts`.** En `metaFor`, después de la línea del mapa:
  `if (sec === "planner") return { title: v.plan.seoTitle, description: v.plan.seoDesc };`.
  En `jsonLdFor`, el nombre de la miga:
  `sec === "patches" ? v.pat.tab : sec === "map" ? v.map.tab : sec === "planner" ? v.plan.tab : v.tabs[sec]`
  y, como el mapa, un `WebApplication` para `sec === "planner"` con
  `v.plan.seoTitle`/`v.plan.seoDesc`.

- [ ] **Paso 5: `ValheimPlanner.tsx`:**

```tsx
/**
 * El Planificador de Valheim (2026-09-25): paso 1, elegir (`/valheim/planner`),
 * y paso 2, la hoja de ruta (`/valheim/planner/route`). Maqueta B que eligió
 * ZoTaD; diseño en docs/design/2026-09-25-valheim-planificador.md.
 */
import { useEffect, useState } from "react";
import { useValheimCopy } from "./valheimCopy";
import { loadPlanner, peekPlanner } from "./valheimData";
import type { PlannerData } from "./valheimPlanner";
import type { Nav, To } from "./ValheimParts";
import ValheimPlannerPick from "./ValheimPlannerPick";
import ValheimPlannerRoute from "./ValheimPlannerRoute";

export default function ValheimPlanner({ detail, to, navigate }: { detail?: string; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const [data, setData] = useState<PlannerData | null>(peekPlanner);
  useEffect(() => {
    let vivo = true;
    if (!data) loadPlanner().then((d) => vivo && setData(d)).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  if (!data) {
    return (
      <header className="vh-head">
        <h1>{detail === "route" ? t.plan.routeTitle : t.plan.title}</h1>
        <p>{t.plan.lede}</p>
      </header>
    );
  }
  return detail === "route"
    ? <ValheimPlannerRoute data={data} to={to} navigate={navigate} />
    : <ValheimPlannerPick data={data} to={to} navigate={navigate} />;
}
```

  (La tarea 6 crea `ValheimPlannerRoute.tsx`; mientras tanto, un
  `export default function ValheimPlannerRoute() { return null; }` provisorio
  para que compile, que la tarea 6 reemplaza.)

- [ ] **Paso 6: `ValheimPlannerPick.tsx`:**

```tsx
/** Paso 1 del Planificador: el catálogo con filtros y tu lista (maqueta B). */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import type { ValheimSection } from "./route";
import { useValheimCopy } from "./valheimCopy";
import { BIOME_IDS, fold, tx } from "./valheimData";
import { PLAN_CATS, plan as calc, sanitize, setPick, addPick, type PlanCat, type PlannerData } from "./valheimPlanner";
import { setPlan, usePlan, writeUrl } from "./valheimPlannerStore";
import { Slot, type Nav, type To } from "./ValheimParts";

const PAGE = 60;

export default function ValheimPlannerPick({ data, to, navigate }: { data: PlannerData; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const raw = usePlan();
  const st = useMemo(() => sanitize(data, raw), [data, raw]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<PlanCat | null>(null);
  const [biome, setBiome] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState(false);
  useEffect(() => { writeUrl(); }, []);
  useEffect(() => setShown(PAGE), [q, cat, biome]);

  const catalog = useMemo(() => Object.entries(data.items)
    .filter(([, it]) => it.cat)
    .sort(([, a], [, b]) => (BIOME_IDS.indexOf(a.tier ?? ("" as never)) + 1 || 99) - (BIOME_IDS.indexOf(b.tier ?? ("" as never)) + 1 || 99)
      || tx(a.name, lang).localeCompare(tx(b.name, lang))), [data, lang]);
  const hits = useMemo(() => {
    const f = fold(q.trim());
    return catalog.filter(([, it]) => (!cat || it.cat === cat) && (!biome || it.tier === biome)
      && (!f || fold(it.name.en).includes(f) || fold(it.name.es).includes(f)));
  }, [catalog, q, cat, biome]);
  const qtyOf = new Map(st.picks.map((p) => [p.id, p.qty]));
  const summary = useMemo(() => calc(data, st), [data, st]);
  const where = (id: string) => {
    const r = data.recipes[id];
    const s = r ? data.stations[r.st ?? ""] : data.stations[data.convert[id]?.[0]?.st ?? ""];
    if (!s) return "";
    return r && r.lv > 1 ? `${tx(s.name, lang)} ${r.lv}` : tx(s.name, lang);
  };
  const leftover = new Map(summary.leftovers.map((l) => [l.id, l]));

  return (
    <div className="vp">
      <header className="vh-head">
        <h1>{t.plan.title}</h1>
        <p>{t.plan.lede}</p>
      </header>
      <div className="vp-grid">
        <section className="vh-box vp-cat" aria-label={t.plan.title}>
          <div className="vp-filters">
            <input className="vh-input vp-search" type="search" value={q} placeholder={t.plan.search} aria-label={t.plan.search} onChange={(e) => setQ(e.target.value)} />
            <div className="vp-chips">
              <button type="button" className={`vp-chip${cat ? "" : " is-on"}`} onClick={() => setCat(null)}>{t.plan.all}</button>
              {PLAN_CATS.map((c) => (
                <button key={c} type="button" className={`vp-chip${cat === c ? " is-on" : ""}`} onClick={() => setCat(cat === c ? null : c)}>{t.plan.cats[c]}</button>
              ))}
            </div>
            <div className="vp-chips">
              <span className="vp-label">{t.plan.biome}</span>
              {BIOME_IDS.map((b) => (
                <button key={b} type="button" className={`vp-chip${biome === b ? " is-on" : ""}`} onClick={() => setBiome(biome === b ? null : b)}>{t.biomes[b]}</button>
              ))}
            </div>
          </div>
          <div className="vp-tr vp-th" aria-hidden="true">
            <span /><span>{t.plan.colItem}</span><span>{t.plan.colWhere}</span><span>{t.plan.colBiome}</span><span />
          </div>
          {hits.length === 0 && <p className="vp-none">{t.plan.noHits}</p>}
          {hits.slice(0, shown).map(([id, it]) => {
            const n = qtyOf.get(id);
            return (
              <div key={id} className={`vp-tr${n ? " is-in" : ""}`}>
                <Slot icon={it.icon} size="sm" />
                <span className="vp-name">
                  {it.slug && it.tab ? <RouteLink to={to(it.tab as ValheimSection, it.slug)} onNavigate={navigate}>{tx(it.name, lang)}</RouteLink> : tx(it.name, lang)}
                  <small>{t.plan.cats[it.cat!]}</small>
                </span>
                <span className="vp-dim">{where(id)}</span>
                <span className="vp-dim">{it.tier ? t.biomes[it.tier] : ""}</span>
                <button type="button" className={`vp-add${n ? " is-in" : ""}`} onClick={() => setPlan(addPick(st, id))}>{n ? t.plan.inList(n) : t.plan.add}</button>
              </div>
            );
          })}
          {hits.length > shown && (
            <button type="button" className="vp-more" onClick={() => setShown(shown + PAGE)}>{t.plan.more(Math.min(PAGE, hits.length - shown))}</button>
          )}
        </section>

        <aside className={`vh-box vp-list${open ? " is-open" : ""}`} aria-label={t.plan.yourList}>
          <button type="button" className="vp-bar" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>{t.plan.open(st.picks.length)}</span><span>{open ? t.plan.close : "▲"}</span>
          </button>
          <div className="vp-list-in">
            <div className="vp-list-head">
              <h2>{t.plan.yourList}</h2>
              {st.picks.length > 0 && <button type="button" className="vp-link" onClick={() => setPlan({ ...st, picks: [] })}>{t.plan.clear}</button>}
            </div>
            {st.picks.length === 0 && <p className="vp-dim">{t.plan.empty}</p>}
            {st.picks.map((p, i) => {
              const it = data.items[p.id];
              const left = leftover.get(p.id);
              return (
                <div key={p.id} className="vp-pick">
                  <Slot icon={it.icon} size="sm" />
                  <span className="vp-pick-main">
                    <b>{tx(it.name, lang)}</b>
                    {(it.maxQ ?? 1) > 1 && (
                      <select className="vp-sel" aria-label={t.plan.level(p.level)} value={p.level} onChange={(e) => setPlan(setPick(st, i, { level: Number(e.target.value) }))}>
                        {Array.from({ length: it.maxQ! }, (_, k) => <option key={k} value={k + 1}>{t.plan.level(k + 1)}</option>)}
                      </select>
                    )}
                    {left && <small>{t.plan.batch(data.recipes[p.id]?.n ?? data.convert[p.id]?.[0]?.n ?? 1, left.made)}</small>}
                  </span>
                  <span className="vp-qty">
                    <button type="button" className="vp-step" aria-label={t.plan.less} onClick={() => setPlan(setPick(st, i, { qty: p.qty - 1 }))}>−</button>
                    <input type="number" min={1} max={999} value={p.qty} aria-label={t.plan.qty} onChange={(e) => setPlan(setPick(st, i, { qty: Math.max(1, Number(e.target.value) || 1) }))} />
                    <button type="button" className="vp-step" aria-label={t.plan.plus} onClick={() => setPlan(setPick(st, i, { qty: p.qty + 1 }))}>+</button>
                  </span>
                </div>
              );
            })}
            {st.picks.length > 0 && (
              <>
                <hr className="vp-hr" />
                <div className="vp-sum">
                  <span><b>{summary.raw.length}</b>{t.plan.rawCount}</span>
                  <span><b>{summary.biomes.length}</b>{t.plan.biomeCount}</span>
                </div>
                <RouteLink className="vp-go" to={to("planner", "route")} onNavigate={navigate}>{t.plan.next}</RouteLink>
              </>
            )}
            <p className="vp-saved">{t.plan.saved}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Paso 7: `Valheim.tsx`.** Importar `ValheimPlanner`. En la
  sub-navegación, después del enlace del mapa:
  `<RouteLink className="vh-tab is-home" to={to("planner")} active={sec === "planner"} onNavigate={navigate}>{t.plan.tab}</RouteLink>`.
  En la portada, una tarjeta más en `.vh-hub` (ícono `forge`, texto
  `t.plan.tab` / `t.plan.hub`). En el render:
  `: sec === "planner" ? <ValheimPlanner detail={route.detail} to={to} navigate={navigate} />`.

- [ ] **Paso 8: `styles/valheim-planner.css`** (importado en `main.tsx`):

```css
/* ---------------------------------------------------------------------------
   PLANIFICADOR DE VALHEIM (2026-09-25) — maqueta B, "Hoja de ruta".
   Cajas oscuras `.vh-box`, tablas como la enciclopedia. Sin bordes ni barras
   de color en filas o tarjetas (pedido de ZoTaD): lo elegido va con tinte.
--------------------------------------------------------------------------- */
.vp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 22px; align-items: start; }
.vp-cat { padding: 16px 0 8px; border-radius: 8px; }
.vp-filters { display: grid; gap: 10px; padding: 0 14px 12px; }
.vp-search { width: 100%; box-sizing: border-box; }
.vp-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.vp-label { color: var(--vh-faint); font-size: 13px; margin-right: 4px; }
.vp-chip { padding: 6px 12px; border: 0; border-radius: 999px; background: rgba(255, 230, 180, 0.07); color: #d8c7a4; font: 700 13px var(--vh-sans); cursor: pointer; }
.vp-chip:hover { background: rgba(255, 230, 180, 0.12); }
.vp-chip.is-on { background: rgba(242, 196, 111, 0.2); color: var(--vh-brass-lt); }
.vp-tr { display: grid; grid-template-columns: 38px minmax(0, 1fr) 150px 130px 150px; gap: 12px; align-items: center; padding: 6px 14px; }
.vp-tr:nth-child(even of .vp-tr:not(.vp-th)) { background: rgba(255, 230, 180, 0.025); }
.vp-tr.is-in { background: rgba(242, 196, 111, 0.08); }
.vp-th { font: 700 12px var(--vh-sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--vh-faint); padding-top: 2px; padding-bottom: 6px; }
.vp-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; font: 700 15px var(--vh-sans); color: var(--vh-cream); }
.vp-name a { color: inherit; text-decoration: none; }
.vp-name a:hover { color: var(--vh-brass-lt); }
.vp-name small { color: var(--vh-faint); font: 400 12.5px var(--vh-sans); }
.vp-dim { color: var(--vh-dim); font-size: 14px; }
.vp-add { height: 32px; border: 0; border-radius: 6px; background: rgba(255, 230, 180, 0.09); color: var(--vh-text); font: 700 13.5px var(--vh-sans); cursor: pointer; }
.vp-add:hover { background: rgba(255, 230, 180, 0.15); }
.vp-add.is-in { background: rgba(242, 196, 111, 0.2); color: var(--vh-brass-lt); }
.vp-more { display: block; margin: 10px auto 6px; padding: 8px 18px; border: 0; border-radius: 6px; background: rgba(255, 230, 180, 0.08); color: var(--vh-text); font: 700 14px var(--vh-sans); cursor: pointer; }
.vp-none { color: var(--vh-dim); padding: 20px 14px; }

.vp-list { position: sticky; top: 16px; border-radius: 8px; }
.vp-list-in { padding: 16px; display: grid; gap: 12px; }
.vp-bar { display: none; }
.vp-list-head { display: flex; align-items: baseline; justify-content: space-between; }
.vp-list-head h2 { margin: 0; font: 700 22px var(--vh-serif); color: var(--vh-cream); }
.vp-link { border: 0; background: none; color: var(--vh-faint); font: 400 13px var(--vh-sans); cursor: pointer; }
.vp-pick { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.vp-pick-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.vp-pick-main b { font: 700 14px var(--vh-sans); color: var(--vh-cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vp-pick-main small { color: var(--vh-faint); font-size: 12px; }
.vp-sel { width: 100px; height: 26px; padding: 0 4px; background: rgba(0, 0, 0, 0.45); color: var(--vh-text); border: 0; border-radius: 4px; font: 400 13px var(--vh-sans); }
.vp-qty { display: flex; align-items: center; gap: 4px; }
.vp-qty input { width: 42px; height: 26px; text-align: center; background: rgba(0, 0, 0, 0.45); color: var(--vh-text); border: 0; border-radius: 4px; font: 700 14px var(--vh-sans); -moz-appearance: textfield; }
.vp-qty input::-webkit-inner-spin-button { -webkit-appearance: none; }
.vp-step { width: 26px; height: 26px; border-radius: 4px; border: 0; background: rgba(255, 230, 180, 0.08); color: var(--vh-text); font: 700 15px var(--vh-sans); cursor: pointer; }
.vp-hr { height: 1px; border: 0; background: var(--vh-line); margin: 4px 0; }
.vp-sum { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.vp-sum span { display: flex; flex-direction: column; color: var(--vh-dim); font-size: 12.5px; }
.vp-sum b { font: 700 24px var(--vh-serif); color: var(--vh-brass-lt); }
.vp-go { display: block; text-align: center; padding: 12px; border-radius: 8px; background: var(--vh-brass); color: #1a0f07; font: 700 16px var(--vh-sans); text-decoration: none; }
.vp-go:hover { background: var(--vh-brass-lt); }
.vp-saved { margin: 0; color: var(--vh-faint); font-size: 12px; text-align: center; }

@media (max-width: 900px) {
  .vp-grid { grid-template-columns: minmax(0, 1fr); }
  .vp-tr { grid-template-columns: 38px minmax(0, 1fr) auto; }
  .vp-tr > :nth-child(3), .vp-tr > :nth-child(4) { display: none; }
  .vp-add { padding: 0 10px; }
  /* La lista pasa a una barra fija abajo que se abre. */
  .vp-list { position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 40; border-radius: 12px 12px 0 0; max-height: 80vh; overflow: auto; }
  .vp-bar { display: flex; width: 100%; justify-content: space-between; padding: 14px 18px; border: 0; background: none; color: var(--vh-brass-lt); font: 700 15px var(--vh-sans); cursor: pointer; }
  .vp-list:not(.is-open) .vp-list-in { display: none; }
  .vp { padding-bottom: 70px; }
}
```

- [ ] **Paso 9: tipos y tests.** `npx tsc -b` sin errores;
  `npx vitest run test/sitemap.test.ts test/prerender.test.ts test/valheimRoute.test.ts test/valheimPlanner.test.ts` → PASS.
  Si `prerender.test.ts` cuenta páginas de Valheim, sumar las 2 nuevas.

- [ ] **Paso 10: commit.**

```bash
git add games/tft/ui/src games/tft/ui/test
git commit -m "feat(valheim): pestaña Planificador, paso 1 (elegir) con textos, SEO y estilos"
```

---

### Tarea 6: la hoja de ruta (paso 2)

**Archivos:**
- Crear/reemplazar: `games/tft/ui/src/ValheimPlannerRoute.tsx`
- Modificar: `games/tft/ui/src/styles/valheim-planner.css` (bloque de la hoja de ruta)

**Consume:** `plan`, `tree`, `viaOptions`, `viaOf`, `setVia`, `setAny`, `sanitize`
(tarea 3); `usePlan`, `setPlan`, `writeUrl`, `useHave` (tarea 4); copia `plan` (tarea 5).

- [ ] **Paso 1: `ValheimPlannerRoute.tsx`:**

```tsx
/** Paso 2 del Planificador: la hoja de ruta (maqueta B). */
import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n";
import RouteLink from "./RouteLink";
import type { ValheimSection } from "./route";
import { useValheimCopy, type ValheimCopy } from "./valheimCopy";
import { tx } from "./valheimData";
import {
  encodePlan, plan as calc, sanitize, setAny, setVia, tree, viaOf, viaOptions,
  type PlannerData, type PSource, type TreeNode, type Via,
} from "./valheimPlanner";
import { setPlan, useHave, usePlan, writeUrl } from "./valheimPlannerStore";
import { Slot, type Nav, type To } from "./ValheimParts";
import type { Lang } from "./i18n";

function sourceText(s: PSource, t: ValheimCopy, lang: Lang): string {
  const who = s.name ? tx(s.name, lang) : "";
  if (s.how === "drop") {
    const n = s.min != null && s.max != null ? (s.min === s.max ? ` ${s.min}` : ` ${s.min}–${s.max}`) : "";
    const pc = s.chance != null && s.chance < 1 ? ` · ${Math.round(s.chance * 100)} %` : "";
    return `${who}${n}${pc}`;
  }
  const label = t.plan.how[s.how] ?? s.how;
  return who ? `${label}: ${who}` : label;
}

export default function ValheimPlannerRoute({ data, to, navigate }: { data: PlannerData; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const { lang } = useLang();
  const raw = usePlan();
  const st = useMemo(() => sanitize(data, raw), [data, raw]);
  const p = useMemo(() => calc(data, st), [data, st]);
  const [mode, setMode] = useState<"table" | "raw">("raw");
  const [have, toggle] = useHave(encodePlan(st));
  const [copied, setCopied] = useState(false);
  useEffect(() => { writeUrl(); }, []);
  // La hoja de ruta depende de cada lista: que no se indexe.
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  const name = (id: string) => tx(data.items[id]?.name, lang) || id;
  const stName = (tok: string | null) => (tok && data.stations[tok] ? tx(data.stations[tok].name, lang) : "");
  const link = (id: string, children: React.ReactNode) => {
    const it = data.items[id];
    return it?.slug && it.tab ? <RouteLink to={to(it.tab as ValheimSection, it.slug)} onNavigate={navigate}>{children}</RouteLink> : <>{children}</>;
  };

  if (st.picks.length === 0) {
    return (
      <div className="vp">
        <header className="vh-head"><h1>{t.plan.routeTitle}</h1><p>{t.plan.nothing}</p></header>
        <RouteLink className="vp-go vp-go-inline" to={to("planner")} onNavigate={navigate}>{t.plan.goPick}</RouteLink>
      </div>
    );
  }

  const ids = new Set([...p.table.map((n) => n.id), ...p.steps.map((s) => s.id), ...p.raw.map((n) => n.id)]);
  const choices = [...ids].filter((id) => viaOptions(data, id).length > 1);
  const anys = [...new Set([...st.picks.map((x) => x.id), ...p.steps.map((s) => s.id)])].filter((id) => data.recipes[id]?.any);
  const label = (id: string, v: Via) => (v === "craft" ? t.plan.viaCraft(stName(data.recipes[id]?.st ?? null)) : v === "raw" ? t.plan.viaRaw : t.plan.viaFrom(name(v.slice(5))));

  const Node = ({ n, depth }: { n: TreeNode; depth: number }) => (
    <>
      <div className={`vp-node d${Math.min(depth, 3)}`}>
        {depth > 0 && <span className="vp-twig" aria-hidden="true">└</span>}
        <Slot icon={data.items[n.id]?.icon} size={depth ? "xs" : "sm"} />
        <span className="vp-q">{n.qty}</span>
        <span className="vp-nname">{link(n.id, name(n.id))}</span>
        {n.st && <span className="vp-via">{t.plan.atStation(stName(n.st), n.per)}</span>}
      </div>
      {n.kids.map((k) => <Node key={k.id} n={k} depth={depth + 1} />)}
    </>
  );

  return (
    <div className="vp">
      <header className="vh-head vp-rhead">
        <div>
          <RouteLink className="vh-back" to={to("planner")} onNavigate={navigate}>{t.plan.back}</RouteLink>
          <h1>{t.plan.routeTitle}</h1>
          <p>{st.picks.map((x) => `${x.qty > 1 ? `${x.qty} × ` : ""}${name(x.id)}${x.level > 1 ? ` (${t.plan.level(x.level).toLowerCase()})` : ""}`).join(" · ")}</p>
        </div>
        <div className="vp-stats">
          <span><b>≈ {p.weight.toLocaleString(lang)}</b>{t.plan.weight}, {t.plan.trips(p.trips)}</span>
          {p.fuelMinutes > 0 && <span><b>{p.fuelMinutes}</b>{t.plan.smelting}</span>}
          <span><b>{p.biomes.length}</b>{t.plan.biomes}</span>
        </div>
      </header>

      <div className="vp-rgrid">
        <section className="vh-box vp-break" aria-label={t.plan.breakdown}>
          <div className="vp-break-head">
            <h2>{t.plan.breakdown}</h2>
            <div className="vp-seg" role="group" aria-label={t.plan.breakdown}>
              <button type="button" className={mode === "table" ? "is-on" : ""} aria-pressed={mode === "table"} onClick={() => setMode("table")}>{t.plan.toTable}</button>
              <button type="button" className={mode === "raw" ? "is-on" : ""} aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>{t.plan.toRaw}</button>
            </div>
          </div>
          {p.table.map((n) => (
            <div key={n.id} className="vp-branch">
              {mode === "raw"
                ? <Node n={tree(data, st, n.id, n.qty)} depth={0} />
                : (
                  <div className="vp-node d0">
                    <Slot icon={data.items[n.id]?.icon} size="sm" />
                    <span className="vp-q">{n.qty}</span>
                    <span className="vp-nname">{link(n.id, name(n.id))}</span>
                  </div>
                )}
              <small className="vp-for">{t.plan.forWhat(n.for.map(name).join(", "))}</small>
            </div>
          ))}
          {p.leftovers.map((l) => <p key={l.id} className="vp-note">{name(l.id)}: {t.plan.left(l.asked, l.made)}</p>)}
        </section>

        <aside className="vp-side">
          <section className="vh-box vp-gather" aria-label={t.plan.gather}>
            <div className="vp-list-head">
              <h2>{t.plan.gather}</h2>
              <span className="vp-dim">{t.plan.ready(p.raw.filter((n) => have.has(n.id)).length, p.raw.length)}</span>
            </div>
            {p.raw.map((n) => {
              const it = data.items[n.id];
              return (
                <label key={n.id} className={`vp-need${have.has(n.id) ? " is-done" : ""}`}>
                  <input type="checkbox" checked={have.has(n.id)} onChange={() => toggle(n.id)} aria-label={`${t.plan.have}: ${name(n.id)}`} />
                  <Slot icon={it?.icon} size="xs" />
                  <span className="vp-q">{n.qty}</span>
                  <span className="vp-need-main">
                    <span><b>{link(n.id, name(n.id))}</b>{it?.tier && <em>{t.biomes[it.tier]}</em>}</span>
                    <small>{(data.sources[n.id] ?? []).slice(0, 3).map((s) => sourceText(s, t, lang)).join(" · ")}</small>
                  </span>
                </label>
              );
            })}
          </section>

          <section className="vh-box vp-stations" aria-label={t.plan.stations}>
            <h2>{t.plan.stations}</h2>
            <div className="vp-chips">
              {p.stations.map(([tok, lv]) => (
                <span key={tok} className="vp-stchip">
                  {data.stations[tok]?.icon && <Slot icon={data.stations[tok].icon} size="xs" />}
                  {t.plan.stationLevel(stName(tok), lv)}
                </span>
              ))}
            </div>
            {(choices.length > 0 || anys.length > 0) && (
              <>
                <h3>{t.plan.paths}</h3>
                {choices.map((id) => (
                  <label key={id} className="vp-path">
                    <span>{name(id)}</span>
                    <select className="vp-sel" value={viaOf(data, st, id)} onChange={(e) => setPlan(setVia(raw, id, e.target.value as Via))}>
                      {viaOptions(data, id).map((v) => <option key={v} value={v}>{label(id, v)}</option>)}
                    </select>
                  </label>
                ))}
                {anys.map((id) => (
                  <label key={`any-${id}`} className="vp-path">
                    <span>{t.plan.anyOf(name(id))}</span>
                    <select className="vp-sel" value={st.any[id] ?? data.recipes[id].req[0][0]} onChange={(e) => setPlan(setAny(raw, id, e.target.value))}>
                      {data.recipes[id].req.map(([rid]) => <option key={rid} value={rid}>{name(rid)}</option>)}
                    </select>
                  </label>
                ))}
              </>
            )}
            <button type="button" className="vp-more" onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true)).catch(() => undefined); }}>
              {copied ? t.plan.copied : t.plan.copy}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: CSS de la hoja de ruta** (agregar a `valheim-planner.css`):

```css
/* ---------- hoja de ruta ---------- */
.vp-rhead { justify-content: space-between; }
.vp-rhead p { margin-top: 6px; }
.vp-stats { display: flex; gap: 28px; margin-left: auto; }
.vp-stats span { display: flex; flex-direction: column; align-items: flex-end; color: var(--vh-dim); font-size: 13px; }
.vp-stats b { font: 700 28px var(--vh-serif); color: var(--vh-brass-lt); }
.vp-rgrid { display: grid; grid-template-columns: minmax(0, 1fr) 460px; gap: 22px; align-items: start; }
.vp-break { padding: 14px 18px 18px; border-radius: 8px; }
.vp-break-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.vp-break-head h2, .vp-gather h2, .vp-stations h2 { margin: 0; font: 700 22px var(--vh-serif); color: var(--vh-cream); }
.vp-stations h2 { font-size: 18px; margin-bottom: 8px; }
.vp-stations h3 { margin: 14px 0 6px; font: 700 15px var(--vh-sans); color: var(--vh-cream); }
.vp-seg { display: flex; gap: 2px; padding: 3px; background: rgba(0, 0, 0, 0.4); border-radius: 8px; }
.vp-seg button { padding: 7px 12px; border: 0; background: none; color: var(--vh-dim); font: 700 14px var(--vh-sans); border-radius: 6px; cursor: pointer; }
.vp-seg button.is-on { background: rgba(242, 196, 111, 0.2); color: var(--vh-brass-lt); }
.vp-branch { padding: 10px 0; border-top: 1px solid rgba(200, 150, 62, 0.14); }
.vp-node { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.vp-node.d1 { padding-left: 28px; }
.vp-node.d2 { padding-left: 56px; }
.vp-node.d3 { padding-left: 84px; }
.vp-twig { color: #5e5140; width: 16px; text-align: center; flex: none; }
.vp-q { font: 700 16px var(--vh-serif); color: var(--vh-brass-lt); min-width: 36px; text-align: right; }
.vp-nname { font: 700 15px var(--vh-sans); color: var(--vh-cream); }
.vp-nname a, .vp-need-main a { color: inherit; text-decoration: none; }
.vp-nname a:hover, .vp-need-main a:hover { color: var(--vh-brass-lt); }
.vp-node.d0 .vp-nname { font-size: 17px; }
.vp-via { font-size: 12.5px; color: var(--vh-faint); padding: 3px 8px; border-radius: 999px; background: rgba(255, 230, 180, 0.06); }
.vp-for { display: block; color: var(--vh-faint); font-size: 12.5px; margin: 2px 0 0 46px; }
.vp-note { color: var(--vh-faint); font-size: 12.5px; margin: 10px 0 0; }
.vp-side { display: grid; gap: 18px; }
.vp-gather, .vp-stations { padding: 14px 18px; border-radius: 8px; }
.vp-need { display: grid; grid-template-columns: 20px 24px 44px minmax(0, 1fr); gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid rgba(200, 150, 62, 0.1); cursor: pointer; }
.vp-need input { width: 18px; height: 18px; margin: 0; accent-color: var(--vh-brass); }
.vp-need .vp-q { font-size: 15px; min-width: 0; }
.vp-need-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.vp-need-main span { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.vp-need-main b { font: 700 15px var(--vh-sans); color: var(--vh-cream); }
.vp-need-main em { font: 700 11px var(--vh-sans); font-style: normal; letter-spacing: 0.08em; text-transform: uppercase; color: var(--vh-brass); }
.vp-need-main small { color: var(--vh-dim); font-size: 12.5px; }
.vp-need.is-done { opacity: 0.45; }
.vp-need.is-done b { text-decoration: line-through; }
.vp-stchip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 999px; background: rgba(255, 230, 180, 0.07); font-size: 13.5px; }
.vp-path { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--vh-dim); font-size: 14px; padding: 3px 0; }
.vp-path .vp-sel { width: auto; max-width: 60%; }
.vp-go-inline { display: inline-block; padding: 10px 18px; }

@media (max-width: 1000px) {
  .vp-rgrid { grid-template-columns: minmax(0, 1fr); }
  .vp-stats { margin-left: 0; }
  .vp-stats span { align-items: flex-start; }
}
```

- [ ] **Paso 3: tipos y tests.** `npx tsc -b` sin errores;
  `npx vitest run test/valheimPlanner.test.ts` → PASS.

- [ ] **Paso 4: commit.**

```bash
git add games/tft/ui/src
git commit -m "feat(valheim): hoja de ruta del Planificador (desglose, para juntar, estaciones, caminos)"
```

---

### Tarea 7: "Agregar al Planificador" en las fichas y los jefes

**Archivos:**
- Crear: `games/tft/ui/src/ValheimPlanButton.tsx`
- Modificar: `games/tft/ui/src/ValheimDetail.tsx` (debajo de la cabecera)
- Modificar: `games/tft/ui/src/ValheimGuide.tsx` (`BossPage`, junto a "Cómo invocarlo")
- Modificar: `games/tft/ui/src/styles/valheim-planner.css`

- [ ] **Paso 1: `ValheimPlanButton.tsx`:**

```tsx
/** El botón "Agregar al Planificador" de cada ficha que se fabrica (2026-09-25). */
import RouteLink from "./RouteLink";
import { useValheimCopy } from "./valheimCopy";
import { addToPlan, usePlan } from "./valheimPlannerStore";
import type { Nav, To } from "./ValheimParts";

export default function ValheimPlanButton({ id, to, navigate }: { id: string; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const n = usePlan().picks.find((p) => p.id === id)?.qty ?? 0;
  return (
    <div className="vp-addrow">
      <button type="button" className={`vp-add${n ? " is-in" : ""}`} onClick={() => addToPlan(id)}>
        {n ? t.plan.inPlanner(n) : t.plan.addBtn}
      </button>
      {n > 0 && <RouteLink className="vp-link" to={to("planner")} onNavigate={navigate}>{t.plan.see}</RouteLink>}
    </div>
  );
}
```

- [ ] **Paso 2: en `ValheimDetail.tsx`**, después de `</header>`:

```tsx
          {(item?.recipe || item?.sources.some((s) => s.kind === "convert") || (piece?.req.length ?? 0) > 0) && (
            <ValheimPlanButton id={piece ? `piece:${row.id}` : row.id} to={to} navigate={navigate} />
          )}
```

- [ ] **Paso 3: en `BossPage`** de `ValheimGuide.tsx`, debajo del bloque de
  la ofrenda (`t.guide.summonAt`): `{item && <ValheimPlanButton id={`boss:${row.id}`} to={to} navigate={navigate} />}`.

- [ ] **Paso 4: CSS:**
  `.vp-addrow { display: flex; align-items: center; gap: 12px; margin: 12px 0 0; } .vp-addrow .vp-add { padding: 0 14px; }`

- [ ] **Paso 5:** `npx tsc -b` sin errores. Commit:

```bash
git add games/tft/ui/src
git commit -m "feat(valheim): Agregar al Planificador desde cada ficha y cada jefe"
```

---

### Tarea 8: localhost y verificación en el navegador

**Archivos:**
- Modificar: `C:\Users\Zotad\Desktop\vestigo\.claude\launch.json` (una configuración más; no se commitea)

- [ ] **Paso 1:** agregar la configuración:

```json
    {
      "name": "vestigo-ui-planificador",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "C:/Users/Zotad/Desktop/vestigo-planificador/games/tft/ui", "run", "dev", "--", "--port", "5176", "--strictPort"],
      "port": 5176,
      "autoPort": false
    }
```

- [ ] **Paso 2:** `preview_start {name: "vestigo-ui-planificador"}` y abrir
  `http://localhost:5176/es/valheim/planner`. Revisar consola sin errores.
- [ ] **Paso 3: el ejemplo de la maqueta.** Agregar casco, armadura y grebas de
  hierro (nivel 2), Krom y 10 salchichas; "Siguiente". En la hoja de ruta:
  105 de chatarra, 330 de madera, 40 y 20 de mineral de cobre y estaño; la
  forja nivel 3; las salchichas "pediste 10, salen 12". Cambiar el hierro a
  mineral de hierro y ver que cambia. Marcar "ya lo tengo" y recargar: sigue
  marcado. Copiar el enlace, abrirlo en otra pestaña: la misma lista.
- [ ] **Paso 4:** en una ficha (`/es/valheim/weapons/krom`), "Agregar al
  Planificador" suma y el contador cambia; en un jefe, lo mismo con la ofrenda.
- [ ] **Paso 5:** celular (375 px, en el panel Browser, no en el Chrome de
  ZoTaD): la lista va en la barra de abajo y se abre; sin scroll lateral.
- [ ] **Paso 6:** inglés (`/en/valheim/planner`) sin textos en español.
- [ ] **Paso 7:** `npx tsc -b && npx vitest run` (salvo `deadlock.test.ts`,
  que ya fallaba) y los tests del pipeline. Captura para ZoTaD y avisarle con
  el enlace de localhost. **No publicar** hasta que lo apruebe.
