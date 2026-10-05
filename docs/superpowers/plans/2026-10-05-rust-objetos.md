# Rust — plan 2: la pestaña Objetos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/en/rust/items` y `/es/rust/objetos` existan: la lista de los 1.032 objetos con filtro por categoría y buscador, y una ficha por objeto (`/es/rust/objetos/fusil-de-asalto`) con crafteo, investigación, "se usa en", reciclaje, botín y tiendas. Además, lo que la revisión del plan 1 dejó para acá: buscador en la portada, h1 más buscable, JSON-LD `WebApplication` en la portada, vista previa (OG) propia, test de `parseRoute` con detalle y `redirectOf` con `m_FileID` ≠ 0.

**Architecture:**
- **Datos (Python):** tres pasos, cada uno con su salida.
  - `extract.py` (ya existe) suma el reciclaje y la chatarra de investigación de cada objeto, y las eficiencias de las recicladoras.
  - `world.py` (nuevo) lee las escenas del juego: el botín de cada caja y las tiendas de cada monumento (`loot.json`, `shops.json`).
  - `site_data.py` (nuevo, sin el juego) arma lo que baja el sitio: la lista liviana, las fichas repartidas en 32 archivos por el hash del slug y los slugs en español.
- **Sitio:** la pestaña Objetos es un chunk aparte (`rust/items/RustItems.tsx`), como las de Zomboid. La lista y cada archivo de fichas son `import()` aparte (reusa `once` y `shardedFichas` de `zomboid/store.ts`). La pestaña anota los slugs en español al cargarse, así una dirección en frío ya llega traducida.
- **SEO:** cada ficha entra al sitemap, al prerender y al `<head>`, con migas de pan.

**Tech Stack:** Python 3.14 + UnityPy 1.25.4 + Pillow (+ fontTools y brotli para la vista previa), React 18 + Vite + TypeScript, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-10-05-rust.md` (sección "2. Objetos"). Estética A "Inventario": paneles `rgba(30,30,28,.78)` sin bordes, casilleros `rgba(255,255,255,.07)`, texto `#e2dbd3`, secundario `#a39d93`, verde `#6c8e36` (con texto blanco, el fondo es `#55702a` por contraste), Roboto Condensed en mayúsculas para títulos y etiquetas.
- Todo texto de la UI en inglés y español. En español la pestaña es `objetos` y cada ficha lleva el slug en español (`slugEs` de `items.json`). Los nombres y descripciones de los objetos son los oficiales del juego (es-ES).
- Nada de "sacado de los archivos del juego" en la UI. Ni "según los datos del juego", ni "extraído".
- Sin bordes ni barras de color en tarjetas o filas: el estado va por tinte, texto o cifra.
- Los títulos se achican con container queries y las palabras nunca se cortan (nada de `overflow-wrap: anywhere` ni `word-break`).
- Celular (375 px): sin scroll horizontal; las pestañas y los filtros bajan de fila.
- Comentarios y mensajes de commit en español rioplatense, con el estilo del repo: explican el porqué. Sin `Co-Authored-By`.
- Tests de TS: `npx vitest run <archivo>` desde `site/`. Tests de Python: `python -m unittest discover -s games/rust/tools/tests -v` desde la raíz del worktree. `test/deadlock.test.ts` y `test/deadlockBuilds.test.ts` pueden fallar por motivos ajenos (duckdb, 39 héroes): no son parte de este trabajo.
- Worktree: `C:\Users\Zotad\Desktop\vestigo-rust`, rama `feat/rust`. Todas las rutas son relativas a esa carpeta. Servidor local: `vestigo-rust` en `.claude/launch.json` (puerto 5179).
- Instalación del juego: `C:\Program Files (x86)\Steam\steamapps\common\Rust` (`RUST_DIR`), build de Steam 25681799.
- **A `main` NO.** Se publica cuando estén Objetos y Raideo (plan 3) y ZoTaD lo pida.
- Fuera de este plan: los bloques de raideo de la ficha ("qué rompe" un explosivo, "cuánto cuesta romper" una pared o puerta) van en el plan 3, con la calculadora.
- Máximo 2 subagentes a la vez.
- Datos verificados al relevar (2026-10-05). Si el código da otra cosa, pará y avisá antes de tocar un test:
  - **Reciclaje:**
    - salen los ingredientes de la receta (`ItemBlueprint.ingredients`) dividido `amountToCreate`, menos la chatarra que pide la receta;
    - más `ItemBlueprint.scrapFromRecycle`, que no se multiplica por la eficiencia;
    - con una cantidad mayor que 1 por objeto, sale `ceil(cantidad × eficiencia)`; con 1 o menos, sale 1 con probabilidad `cantidad × eficiencia`;
    - engranajes (`gears`): ingredientes `metal.fragments` 25 y `scrap` 100, `scrapFromRecycle` 10. En recicladora común: 13 fragmentos y 10 de chatarra;
    - componentes técnicos (`techparts`): `metal.refined` 2 y `scrap` 50, `scrapFromRecycle` 20. Dan 1 de metal de alta calidad y 20 de chatarra.
  - **Recicladoras:** `RecyclerConfig` (content.bundle) tiene tipo 0 = 0,5, tipo 1 = 0,4 y tipo 2 = 0,75. El tipo 1 es el de Outpost (`compound.prefab`) y Bandit Camp (`bandit_town.prefab`). El 0, el de los demás monumentos. El 2 es la recicladora roja de la planta de energía, que pide la red eléctrica, y queda afuera.
  - **Chatarra para investigar:** la rareza de la receta (`ItemBlueprint.rarity`), o la del objeto si la de la receta es 0. Común = 20, poco común = 75, rara = 125, muy rara o ninguna = 500. Si la receta trae `scrapRequired` > 0, manda ese número. Esperado: AK 500, C4 500, lanzacohetes 500, Thompson 125, semiautomático 125, cerradura de código 75, puerta de garaje 75, hacha 75.
  - **Botín:**
    - las cajas son MonoBehaviour `LootContainer`, `LockedByEntCrate`, `HackableLockedCrate`, `SupplyDrop` y `FreeableLootContainer` en `Bundles/shared/assetscenes.bundle`, con el nombre del prefab en su GameObject (`assets/bundled/prefabs/radtown/crate_elite.prefab`);
    - si la caja tiene `LootSpawnSlots`, se usan sólo esos: cada uno se tira `numberToSpawn` veces con probabilidad `probability`. Si no tiene, se tira `lootDefinition` `maxDefinitionsToSpawn` veces;
    - un `LootSpawn` con `subSpawn` elige una sola subcategoría por peso, sobre la suma de todos los pesos. Si no tiene `subSpawn`, da todos sus `items`;
    - `scrapAmount` es chatarra fija;
    - las referencias entre archivos se resuelven por `m_FileID` → `assets_file.externals[m_FileID-1].path` (un `CAB-…`) → el archivo con ese nombre.
  - **Tiendas:**
    - `NPCVendingMachine` e `InvisibleVendingMachine` dentro de las escenas de monumentos (`BuildPlayer-AssetScene-monument.N`, en assetscenes.bundle);
    - el prefab del monumento se encuentra subiendo por los `Transform` hasta la raíz;
    - `vendingOrders` apunta a un `NPCVendingOrder` (content.bundle) con `orders[]`: `sellItem`, `sellItemAmount`, `sellItemAsBP`, `currencyItem`, `currencyAmount`, `randomDetails.useRandom`;
    - Outpost tiene Building, Tools, Weapons, Components, Resources, Attire y Compound_Extra1. Bandit Camp tiene Weapons_Bandit, FoodVendor, building_bandit, BuyResources, Vehicles, Bandit_ProduceExchange y Bandit_Farming.
  - **Nombres oficiales de monumentos** (engine.json): `outpost`, `bandit_camp`, `fishing_village_display_name`, `stables_a`, `stables_b` y `waterwell`.

---

## File Structure

**Python (`games/rust/tools/`):**
- `extract.py` (modificar): reciclaje, chatarra de investigación, eficiencias de las recicladoras y `redirectOf` entre archivos.
- `world.py` (crear): botín por caja y tiendas por monumento. Escribe `games/rust/data/loot.json` y `games/rust/data/shops.json`.
- `site_data.py` (crear): de `items.json`, `loot.json` y `shops.json` arma `games/rust/data/site/list.json`, `site/items/NN.json` (32) y `site/slugs-es.json`.
- `ui.py` (modificar): suma la vista previa `site/public/rust/og.jpg`.
- `tests/test_extract.py` (modificar), `tests/test_world.py` (crear) y `tests/test_site_data.py` (crear).
- `games/rust/README.md` (modificar): los pasos nuevos.

**Sitio (`site/src/`):**
- `rust/items/data.ts`: tipos, carga de la lista y de las fichas, `preloadItemsRoute`.
- `rust/items/filter.ts`: `normalize` y `filterRows`, sin React.
- `rust/items/RustItems.tsx`: la pestaña (lista o ficha).
- `rust/items/ItemList.tsx`: la lista.
- `rust/items/ItemFicha.tsx`: la ficha.
- `rust/items/recycle.ts`: la cuenta del reciclador, sin React.
- `rust/RsLoading.tsx`: la hoja de "cargando…".
- `rust/RustSearch.tsx`: el buscador de la portada.
- `styles/rust-items.css`: estilos de la pestaña.
- **Se modifican:**
  - `Rust.tsx`: pestañas lazy y `preloadTab`;
  - `rust/RustHome.tsx`: h1, buscador y casilleros enlazados;
  - `rustCopy.ts`: textos;
  - `route.ts`: `RUST_PUBLISHED`;
  - `areas.ts` y `areaFiles.ts`: la pestaña en su chunk;
  - `entry-server.tsx`: precarga del prerender;
  - `sitemap.ts`, `prerender.ts` y `PageMeta.tsx`: SEO;
  - `vite.config.ts`: datos del sitemap, slugs y guardia del prerender.
- **Tests (`site/test/`):** `rustItemsData.test.ts`, `rustFilter.test.ts`, `rustRecycle.test.ts`, `rustItems.test.ts` y `rustColdLoad.test.ts`. Se modifican `rustRoute.test.ts`, `rustSeo.test.ts` y `rustHome.test.ts`.

---

### Task 1: Reciclaje, investigación y recicladoras en el extractor

**Files:**
- Modify: `games/rust/tools/extract.py`
- Modify: `games/rust/tools/tests/test_extract.py`
- Regenerate: `games/rust/data/items.json`, `games/rust/data/meta.json`

**Interfaces:**
- Produces, en `games/rust/data/items.json`:
  - arriba, junto a `"items"`: `"recyclers": { "monument": 0.5, "safezone": 0.4 }`;
  - en cada objeto:
    - `"recycle": { "scrap": 10, "out": [{ "id": "metal.fragments", "amount": 25 }] } | null`, con `amount` por objeto reciclado, al 100 %, sin la chatarra de la receta;
    - `craft.researchScrap: number | null` (`null` si no se investiga).
- Python:
  - `research_scrap(item_rarity: int, bp: dict) -> int`;
  - `recycle_of(bp: dict | None, by_pid: dict) -> dict | None`;
  - `read_content() -> (texts, recyclers)`, que reemplaza a `read_texts()`;
  - `RECYCLER_TYPES = {0: "monument", 1: "safezone"}`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `games/rust/tools/tests/test_extract.py`, antes de `if __name__ == "__main__":` si existe (si no existe, al final):

```python
class TestResearchScrap(unittest.TestCase):
    """Sin el juego: la tabla del ResearchTable (rareza → chatarra) y el `scrapRequired` que la pisa."""

    def test_rareza_de_la_receta_y_si_no_la_del_objeto(self):
        bp = {"rarity": 2, "scrapRequired": 0}
        self.assertEqual(extract.research_scrap(0, bp), 75)
        self.assertEqual(extract.research_scrap(2, {"rarity": 0, "scrapRequired": 0}), 75)
        self.assertEqual(extract.research_scrap(1, {"rarity": 0, "scrapRequired": 0}), 20)
        self.assertEqual(extract.research_scrap(3, {"rarity": 3, "scrapRequired": 0}), 125)
        self.assertEqual(extract.research_scrap(4, {"rarity": 4, "scrapRequired": 0}), 500)
        self.assertEqual(extract.research_scrap(0, {"rarity": 0, "scrapRequired": 0}), 500)

    def test_scrap_required_manda(self):
        self.assertEqual(extract.research_scrap(3, {"rarity": 0, "scrapRequired": 100}), 100)


class TestRecycleOf(unittest.TestCase):
    """Sin el juego: qué sale del reciclador por cada objeto, al 100 %."""

    BY_PID = {1: "metal.fragments", 2: "scrap", 3: "metal.refined"}

    def bp(self, ings, amount=1, scrap=0):
        return {
            "ingredients": [{"itemDef": {"m_FileID": 0, "m_PathID": p}, "amount": a} for p, a in ings],
            "amountToCreate": amount,
            "scrapFromRecycle": scrap,
        }

    def test_la_chatarra_de_la_receta_no_vuelve_y_la_de_reciclar_si(self):
        got = extract.recycle_of(self.bp([(1, 25.0), (2, 100.0)], scrap=10), self.BY_PID)
        self.assertEqual(got, {"scrap": 10, "out": [{"id": "metal.fragments", "amount": 25}]})

    def test_se_divide_por_lo_que_da_la_receta(self):
        got = extract.recycle_of(self.bp([(1, 10.0)], amount=4), self.BY_PID)
        self.assertEqual(got, {"scrap": 0, "out": [{"id": "metal.fragments", "amount": 2.5}]})

    def test_sin_receta_o_sin_nada_que_dar_no_se_recicla(self):
        self.assertIsNone(extract.recycle_of(None, self.BY_PID))
        self.assertIsNone(extract.recycle_of(self.bp([(2, 20.0)]), self.BY_PID))


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestRecycleAndResearchInGame(unittest.TestCase):
    def test_eficiencias_de_las_recicladoras(self):
        self.assertEqual(data()["recyclers"], {"monument": 0.5, "safezone": 0.4})

    def test_engranajes_y_componentes_tecnicos(self):
        self.assertEqual(item("gears")["recycle"], {"scrap": 10, "out": [{"id": "metal.fragments", "amount": 25}]})
        self.assertEqual(item("techparts")["recycle"], {"scrap": 20, "out": [{"id": "metal.refined", "amount": 2}]})

    def test_un_arma_devuelve_sus_ingredientes(self):
        ak = item("rifle.ak")["recycle"]
        self.assertEqual(ak["scrap"], 0)
        self.assertIn({"id": "riflebody", "amount": 1}, ak["out"])

    def test_chatarra_para_investigar(self):
        want = {
            "rifle.ak": 500, "explosive.timed": 500, "rocket.launcher": 500, "smg.thompson": 125,
            "rifle.semiauto": 125, "lock.code": 75, "wall.frame.garagedoor": 75, "hatchet": 75,
        }
        for sid, scrap in want.items():
            self.assertEqual(item(sid)["craft"]["researchScrap"], scrap, sid)

    def test_lo_que_no_se_investiga_no_tiene_costo(self):
        for it in data()["items"]:
            if it["craft"] and not it["craft"]["researchable"]:
                self.assertIsNone(it["craft"]["researchScrap"], it["id"])
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: FAIL/ERROR en `TestResearchScrap`, `TestRecycleOf` y `TestRecycleAndResearchInGame` (`AttributeError: module 'extract' has no attribute 'research_scrap'`, `KeyError: 'recyclers'`). Los tests viejos siguen pasando.

- [ ] **Step 3: Implementar en `extract.py`**

3a. Debajo de `RARITIES`, agregar:

```python
# La chatarra que pide la mesa de investigación, por rareza (`ResearchTable.ScrapForResearch`). Lo cuida un test con
# ocho objetos de valor conocido (AK 500, Thompson 125, cerradura de código 75…).
RESEARCH_SCRAP = {1: 20, 2: 75, 3: 125, 4: 500, 0: 500}
# Las recicladoras que se muestran, por `recyclerType`. El 1 es el de Outpost y Bandit Camp (relevado el 2026-10-05 en
# las escenas de `compound.prefab` y `bandit_town.prefab`); el 0, el de los demás monumentos. El 2 es la roja de la
# planta de energía, que pide la red eléctrica: queda afuera.
RECYCLER_TYPES = {0: "monument", 1: "safezone"}
```

3b. Reemplazar `read_texts()` entero por:

```python
def read_content():
    """
    Lo que se lee de `content.bundle`: los textos oficiales por token ({"en": {...}, "es": {...}}; no hay es-MX, el
    juego trae es-ES) y la eficiencia de cada recicladora ({"monument": 0.5, "safezone": 0.4}). Juntos porque abrir
    el bundle (4,6 GB) es lo que tarda.
    """
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    texts = {}
    for lang, folder in (("en", "en"), ("es", "es-es")):
        texts[lang] = json.loads(env.container[f"assets/localization/{folder}/engine.json"].read().m_Script)
    scripts = {o.path_id: o.read().m_ClassName for o in env.objects if o.type.name == "MonoScript"}
    recyclers = None
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        tt = o.read_typetree()
        if scripts.get(tt.get("m_Script", {}).get("m_PathID")) == "RecyclerConfig":
            recyclers = {
                RECYCLER_TYPES[c["recyclerType"]]: round(c["efficiency"], 3)
                for c in tt["recyclerTypeConfigs"]
                if c["recyclerType"] in RECYCLER_TYPES
            }
            break
    if not recyclers or set(recyclers) != set(RECYCLER_TYPES.values()):
        raise SystemExit(f"RecyclerConfig no trae los tipos esperados: {recyclers}")
    return texts, recyclers
```

Nota: leer todos los MonoBehaviour de content tarda (~1.300 LootSpawn y miles más). Si el `for` pasa de 60 s, cortar antes leyendo sólo los que tienen `m_Name == "RecyclerConfig"`: `o.peek_name()` de UnityPy devuelve el nombre sin leer el typetree entero. El orden queda `if o.peek_name() != "RecyclerConfig": continue` antes de `read_typetree()`.

3c. Arriba de `build_items`, agregar:

```python
def research_scrap(item_rarity, bp):
    """La chatarra para investigar: `scrapRequired` si la receta lo trae, si no la tabla por rareza (la de la receta, o
    la del objeto si la receta no tiene)."""
    if bp["scrapRequired"] > 0:
        return bp["scrapRequired"]
    return RESEARCH_SCRAP[bp["rarity"] or item_rarity]


def recycle_of(bp, by_pid):
    """
    Qué da un objeto en el reciclador, por unidad y al 100 %: los ingredientes de su receta divididos lo que da la
    receta, sin la chatarra que pide (el reciclador se la saltea), más `scrapFromRecycle`, que es fija. La eficiencia
    y el redondeo los pone el sitio (`site/src/rust/items/recycle.ts`). `None` si no da nada.
    """
    if not bp:
        return None
    out = []
    for i in bp["ingredients"]:
        sid = by_pid.get(i["itemDef"]["m_PathID"]) if i["itemDef"]["m_FileID"] == 0 else None
        if sid is None or sid == "scrap":
            continue
        out.append({"id": sid, "amount": number(i["amount"] / bp["amountToCreate"])})
    scrap = bp["scrapFromRecycle"]
    if not out and not scrap:
        return None
    return {"scrap": scrap, "out": out}
```

3d. En `build_items`, el `craft` lleva la chatarra y cada objeto su reciclaje. Reemplazar el bloque `craft = None … }` y el `items.append({...})` por:

```python
        craft = None
        if bp and bp["userCraftable"]:
            craft = {
                "ingredients": [{"id": by_pid[i["itemDef"]["m_PathID"]], "amount": number(i["amount"])} for i in bp["ingredients"]],
                "amount": bp["amountToCreate"],
                "time": number(bp["time"]),
                "workbench": bp["workbenchLevelRequired"],
                "researchable": bool(bp["isResearchable"]),
                "researchScrap": research_scrap(d["rarity"], bp) if bp["isResearchable"] else None,
                "default": bool(bp["defaultBlueprint"]),
            }
        items.append({
            "id": sid,
            "itemid": d["itemid"],
            "name": {"en": name_en, "es": text_of(texts, "es", tok_name["token"]) or None},
            "desc": {
                "en": text_of(texts, "en", tok_desc["token"]) or tok_desc["legacyEnglish"] or None,
                "es": text_of(texts, "es", tok_desc["token"]) or None,
            },
            "category": CATEGORIES[d["category"]],
            "rarity": RARITIES.get(d["rarity"], "none"),
            "stack": d["stackable"],
            "condition": {"max": number(cond["max"]), "repairable": bool(cond["repairable"])} if cond["enabled"] else None,
            "redirectOf": redirect_of(redirect, by_pid),
            "craft": craft,
            "recycle": recycle_of(bp, by_pid),
        })
```

3e. `redirectOf` con `m_FileID` ≠ 0 (pendiente de la revisión final del plan 1). Hoy un redirect a otro archivo queda `None` y el objeto se muestra como si fuera propio. Agregar arriba de `build_items`:

```python
def redirect_of(ref, by_pid):
    """
    El objeto base de una skin o variante. Todos los `ItemDefinition` viven en `items.preload.bundle`, así que un
    `isRedirectOf` a otro archivo (`m_FileID` ≠ 0) sería un objeto que no conocemos: corta en vez de mostrar la skin
    como si fuera un objeto propio.
    """
    if not ref["m_PathID"]:
        return None
    if ref["m_FileID"] != 0:
        raise SystemExit(f"isRedirectOf a otro archivo ({ref}): revisar antes de publicar")
    return by_pid.get(ref["m_PathID"])
```

3f. `collect()` y `main()` usan `read_content`:

```python
def collect(previous=None):
    """Lee el juego y devuelve los datos, sin escribir nada (lo usan los tests). `previous` ver `assign_slugs`."""
    classes = load_classes(BUNDLES / "shared" / "items.preload.bundle")
    texts, recyclers = read_content()
    return {"items": build_items(classes, texts, previous), "recyclers": recyclers, "build": read_build()}
```

En `main()`, la línea del cuerpo pasa a ser:

```python
    body = json.dumps({"items": items, "recyclers": got["recyclers"]}, ensure_ascii=False, indent=1)
```

3g. Buscar cualquier otro uso de `read_texts` (`grep -n read_texts games/rust/tools/*.py games/rust/tools/tests/*.py`) y pasarlo a `read_content()[0]`.

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS todos. Si `test_chatarra_para_investigar` falla en algún objeto, **pará y avisá** con el valor que dio: no se toca el número del test.

- [ ] **Step 5: Regenerar los datos y mirar el diff**

Run: `python games/rust/tools/extract.py`
Expected: `[rust] build 25681799: 1032 objetos, 648 recetas`.

Run: `git diff --stat games/rust/data`
Expected: cambian `items.json` (campos nuevos) y `meta.json` (hash y `extractedAt`). No cambia ningún `slug`. Verificar con:

Run: `git diff games/rust/data/items.json | grep -E '^[-+] +"slug' | head`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/extract.py games/rust/tools/tests/test_extract.py games/rust/data/items.json games/rust/data/meta.json
git commit -m "feat(rust): el extractor suma el reciclaje, la chatarra para investigar y las recicladoras"
```

---

### Task 2: El botín de cada caja y las tiendas de cada monumento (`world.py`)

**Files:**
- Create: `games/rust/tools/world.py`
- Create: `games/rust/tools/tests/test_world.py`
- Create (salida): `games/rust/data/loot.json`, `games/rust/data/shops.json`

**Interfaces:**
- Consumes: `extract.BUNDLES`, `extract.DATA`, `extract.read_content()`, `extract.text_of()` y `extract.number()` (Task 1).
- Produces:
  - `games/rust/data/loot.json`:
    ```
    { "containers": { "elite": { "en": "Elite Crate", "es": "Caja de élite" }, … },
      "items": { "rifle.ak": [ { "c": "elite", "chance": 0.0123, "min": 1, "max": 1, "bp": false }, … ], … } }
    ```
    - `chance` es la probabilidad de que una caja traiga al menos uno, de 0 a 1, con 4 decimales;
    - la lista de cada objeto va ordenada por `chance` de mayor a menor;
    - las entradas de plano (`bp: true`) van aparte de las del objeto mismo.
  - `games/rust/data/shops.json`:
    ```
    { "shops": { "outpost": { "en": "Outpost", "es": "Puesto Avanzado" }, … },
      "orders": [ { "shop": "outpost", "item": "rifle.ak", "amount": 1, "bp": false, "currency": "scrap", "price": 500 }, … ] }
    ```
  - Python: `roll_chances(spawn, resolve) -> dict[(sid, bp), float]`, `container_chances(tt, resolve) -> dict[(sid, bp), (chance, min, max)]`, `collect() -> {"loot": ..., "shops": ...}`, `main()`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `games/rust/tools/tests/test_world.py`:

```python
"""
Tests de `world.py` (2026-10-05): el botín de cada caja y las tiendas de cada monumento.

La parte sin el juego prueba la cuenta de probabilidades con árboles sintéticos. La parte con el juego lee
`assetscenes.bundle` y `content.bundle` (~30 s) una sola vez para todos los tests.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402
import world  # noqa: E402

HAVE_GAME = (extract.BUNDLES / "shared" / "assetscenes.bundle").exists()
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        _DATA = world.collect()
    return _DATA


def leaf(*sids, bp=False, amount=1.0, max_amount=-1.0):
    return {"subSpawn": [], "items": [{"sid": s, "amount": amount, "isBP": int(bp), "maxAmount": max_amount} for s in sids]}


def node(*children):
    """children: (peso, subárbol)."""
    return {"subSpawn": [{"weight": w, "category": c, "extraSpawns": 0} for w, c in children], "items": []}


class TestRollChances(unittest.TestCase):
    """`roll_chances` con árboles armados a mano: `resolve` es la identidad y los ítems traen `sid` ya resuelto."""

    def test_una_hoja_da_todos_sus_items(self):
        self.assertEqual(world.roll_chances(leaf("a", "b"), lambda x: x), {("a", False): 1.0, ("b", False): 1.0})

    def test_una_rama_elige_una_por_peso(self):
        tree = node((1, leaf("a")), (3, leaf("b")))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.25)
        self.assertAlmostEqual(got[("b", False)], 0.75)

    def test_las_probabilidades_se_multiplican_por_nivel(self):
        tree = node((1, node((1, leaf("a")), (1, leaf("b")))), (1, leaf("c")))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.25)
        self.assertAlmostEqual(got[("c", False)], 0.5)

    def test_una_categoria_vacia_cuenta_en_el_peso_y_no_da_nada(self):
        tree = node((1, leaf("a")), (1, None))
        self.assertAlmostEqual(world.roll_chances(tree, lambda x: x)[("a", False)], 0.5)

    def test_un_plano_va_aparte(self):
        self.assertEqual(world.roll_chances(leaf("a", bp=True), lambda x: x), {("a", True): 1.0})


class TestContainerChances(unittest.TestCase):
    def test_tiradas_de_la_definicion(self):
        tt = {"lootDefinition": node((1, leaf("a")), (1, leaf("b"))), "maxDefinitionsToSpawn": 2, "LootSpawnSlots": [], "scrapAmount": 0}
        got = world.container_chances(tt, lambda x: x)
        # 1 − (1 − 0,5)² = 0,75
        self.assertAlmostEqual(got[("a", False)][0], 0.75)

    def test_las_ranuras_mandan_sobre_la_definicion(self):
        tt = {
            "lootDefinition": leaf("x"), "maxDefinitionsToSpawn": 1, "scrapAmount": 0,
            "LootSpawnSlots": [{"definition": leaf("a"), "numberToSpawn": 2, "probability": 0.5}],
        }
        got = world.container_chances(tt, lambda x: x)
        self.assertNotIn(("x", False), got)
        self.assertAlmostEqual(got[("a", False)][0], 0.75)

    def test_la_chatarra_fija(self):
        tt = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "LootSpawnSlots": [], "scrapAmount": 25}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("scrap", False)], (1.0, 25, 25))

    def test_cantidades(self):
        tt = {"lootDefinition": leaf("a", amount=2, max_amount=5), "maxDefinitionsToSpawn": 1, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 5))


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestWorldInGame(unittest.TestCase):
    def test_las_cajas_conocidas_estan_con_nombre_en_los_dos_idiomas(self):
        boxes = data()["loot"]["containers"]
        for key in ("elite", "military", "crate", "basic", "tools", "barrel", "locked", "heli", "bradley", "supply"):
            self.assertIn(key, boxes)
            self.assertTrue(boxes[key]["en"] and boxes[key]["es"], key)

    def test_la_ak_sale_de_la_caja_de_elite_y_no_de_un_barril(self):
        ak = {e["c"]: e for e in data()["loot"]["items"]["rifle.ak"] if not e["bp"]}
        self.assertIn("elite", ak)
        self.assertGreater(ak["elite"]["chance"], 0)
        self.assertLess(ak["elite"]["chance"], 1)
        self.assertNotIn("barrel", ak)

    def test_la_chatarra_fija_de_la_caja_de_elite(self):
        scrap = {e["c"]: e for e in data()["loot"]["items"]["scrap"]}
        self.assertEqual((scrap["elite"]["chance"], scrap["elite"]["min"]), (1.0, 25))

    def test_probabilidades_validas_y_ordenadas(self):
        for sid, rows in data()["loot"]["items"].items():
            chances = [r["chance"] for r in rows]
            self.assertEqual(chances, sorted(chances, reverse=True), sid)
            for r in rows:
                self.assertTrue(0 < r["chance"] <= 1, (sid, r))
                self.assertTrue(1 <= r["min"] <= r["max"], (sid, r))

    def test_tiendas_de_outpost_y_bandit_camp(self):
        shops = data()["shops"]
        self.assertEqual(shops["shops"]["outpost"]["es"], "Puesto Avanzado")
        self.assertEqual(shops["shops"]["bandit"]["en"], "Bandit Camp")
        where = {o["shop"] for o in shops["orders"]}
        self.assertTrue({"outpost", "bandit", "fishing"} <= where)

    def test_cada_orden_apunta_a_objetos_conocidos(self):
        # Contra el items.json ya extraído (Task 1), que no lleva los ocultos. Si falla por un objeto oculto, esa orden
        # no se puede mostrar (no tiene ficha): se filtra en `collect_shops`, no se toca el test.
        ids = {i["id"] for i in json.loads((extract.DATA / "items.json").read_text(encoding="utf-8"))["items"]}
        for o in data()["shops"]["orders"]:
            self.assertIn(o["item"], ids, o)
            self.assertIn(o["currency"], ids, o)
            self.assertGreater(o["price"], 0, o)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest games.rust.tools.tests.test_world -v` (o `python -m unittest discover -s games/rust/tools/tests -p "test_world.py" -v`)
Expected: ERROR `ModuleNotFoundError: No module named 'world'`.

- [ ] **Step 3: Implementar `world.py`**

Crear `games/rust/tools/world.py`:

```python
"""
El botín de cada caja y las tiendas de cada monumento de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md.

Lee las escenas del juego (`Bundles/shared/assetscenes.bundle`) junto con `content.bundle` (los `LootSpawn` y los
`NPCVendingOrder`) e `items.preload.bundle` (los objetos), porque las referencias cruzan de un archivo a otro.
Escribe:
  - `games/rust/data/loot.json`: por objeto, en qué cajas aparece, con la probabilidad de que una caja traiga al menos
    uno y la cantidad;
  - `games/rust/data/shops.json`: qué vende cada tienda de monumento (Outpost, Bandit Camp, pueblo pesquero, rancho,
    granero, pozo de agua) y a qué precio.

La cuenta del botín sigue `LootContainer.PopulateLoot` y `LootSpawn.SpawnIntoContainer` del juego: si la caja tiene
ranuras (`LootSpawnSlots`) se tiran ésas, cada una `numberToSpawn` veces con su probabilidad; si no, `lootDefinition`
`maxDefinitionsToSpawn` veces. Un `LootSpawn` con subcategorías elige una por peso; uno sin, da todos sus objetos. Es
la probabilidad por caja, no por partida: el servidor también decide cuántas cajas hay.

Uso, desde la raíz del repo (tarda ~30 s):
    python games/rust/tools/world.py
"""
import json
import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import BUNDLES, DATA, read_content, text_of  # noqa: E402

# Las cajas que se muestran, por el nombre del prefab sin carpeta ni extensión. Varios prefabs que el jugador ve como
# la misma caja (los barriles azul y amarillo, las cajas de los vagones) comparten clave; la ficha se queda con la
# probabilidad más alta. Lo que no está acá no se muestra: el extractor lista lo que deja afuera.
CONTAINERS = {
    "crate_elite": "elite",
    "crate_normal": "military", "wagon_crate_normal": "military",
    "crate_normal_2": "crate", "wagon_crate_normal_2": "crate",
    "crate_basic": "basic",
    "crate_tools": "tools",
    "crate_medical": "medical",
    "crate_food_1": "food", "crate_food_2": "food", "foodbox": "food",
    "crate_ammunition": "ammo",
    "crate_fuel": "fuel",
    "crate_mine": "mine", "minecart": "mine",
    "tech_parts_1": "tech", "tech_parts_2": "tech",
    "vehicle_parts": "vehicle", "vehicle_parts_advanced": "vehicle",
    "loot-barrel-1": "barrel", "loot-barrel-2": "barrel", "loot_barrel_1": "barrel", "loot_barrel_2": "barrel",
    "oil_barrel": "oil", "diesel_barrel_world": "oil",
    "trash-pile-1": "trash",
    "roadsign1": "roadsign", "roadsign2": "roadsign", "roadsign3": "roadsign", "roadsign4": "roadsign",
    "roadsign5": "roadsign", "roadsign6": "roadsign", "roadsign7": "roadsign", "roadsign8": "roadsign",
    "roadsign9": "roadsign",
    "food_cache_001": "cache", "food_cache_002": "cache", "food_cache_003": "cache", "food_cache_004": "cache",
    "food_cache_005": "cache",
    "crate_underwater_basic": "underwater", "crate_underwater_advanced": "underwater_adv",
    "heli_crate": "heli",
    "bradley_crate": "bradley",
    "codelockedhackablecrate": "locked", "codelockedhackablecrate_oilrig": "locked",
    "supply_drop": "supply",
}
# Los nombres de las cajas. Los que el juego tiene en engine.json van por su token (`lootfood`, `supplydrop`); los demás,
# escritos acá: el juego no los nombra en ningún texto.
CONTAINER_NAMES = {
    "elite": ("Elite Crate", "Caja de élite"),
    "military": ("Military Crate", "Caja militar"),
    "crate": ("Crate", "Caja"),
    "basic": ("Basic Crate", "Caja básica"),
    "tools": ("Toolbox", "Caja de herramientas"),
    "medical": ("Medical Crate", "Caja médica"),
    "food": "lootfood",
    "ammo": ("Ammo Crate", "Caja de munición"),
    "fuel": ("Fuel Crate", "Caja de combustible"),
    "mine": ("Mine Crate", "Caja de mina"),
    "tech": ("Tech Parts Crate", "Caja de componentes"),
    "vehicle": ("Vehicle Parts Crate", "Caja de piezas de vehículo"),
    "barrel": ("Barrel", "Barril"),
    "oil": ("Oil Barrel", "Barril de petróleo"),
    "trash": ("Trash Pile", "Pila de basura"),
    "roadsign": ("Road Sign", "Cartel de ruta"),
    "cache": ("Food Cache", "Escondite de comida"),
    "underwater": ("Underwater Crate", "Caja submarina"),
    "underwater_adv": ("Advanced Underwater Crate", "Caja submarina avanzada"),
    "heli": ("Patrol Helicopter Crate", "Caja del helicóptero de patrulla"),
    "bradley": ("Bradley APC Crate", "Caja del Bradley"),
    "locked": ("Locked Crate", "Caja bloqueada"),
    "supply": "supplydrop",
}
LOOT_CLASSES = {"LootContainer", "LockedByEntCrate", "HackableLockedCrate", "SupplyDrop", "FreeableLootContainer"}
# Las tiendas, por el prefab del monumento donde está la máquina. La clave sale de la primera coincidencia; el nombre,
# del token oficial (engine.json).
SHOP_MONUMENTS = [
    ("/monument/medium/compound.prefab", "outpost"),
    ("/monument/medium/bandit_town.prefab", "bandit"),
    ("/monument/fishing_village/", "fishing"),
    ("/monument/small/stables_a.prefab", "ranch"),
    ("/monument/small/stables_b.prefab", "barn"),
    ("/monument/tiny/water_well_", "well"),
]
SHOP_TOKENS = {
    "outpost": "outpost", "bandit": "bandit_camp", "fishing": "fishing_village_display_name",
    "ranch": "stables_a", "barn": "stables_b", "well": "waterwell",
}
VENDING_CLASSES = {"NPCVendingMachine", "InvisibleVendingMachine"}


class World:
    """Los tres bundles juntos y cómo seguir una referencia de un archivo a otro."""

    def __init__(self):
        shared = BUNDLES / "shared"
        self.env = UnityPy.load(*(str(shared / b) for b in ("assetscenes.bundle", "content.bundle", "items.preload.bundle")))
        self.by_file = {}
        for o in self.env.objects:
            self.by_file.setdefault(o.assets_file.name, {})[o.path_id] = o
        self.script_names = {}
        self.trees = {}
        self.spawns = {}

    def obj(self, owner, ref):
        """El objeto al que apunta `ref` ({m_FileID, m_PathID}) desde `owner`, o `None`."""
        if not ref or not ref.get("m_PathID"):
            return None
        af = owner.assets_file
        fid = ref["m_FileID"]
        name = af.name if fid == 0 else af.externals[fid - 1].path.split("/")[-1]
        return self.by_file.get(name, {}).get(ref["m_PathID"])

    def tree(self, o):
        key = (o.assets_file.name, o.path_id)
        if key not in self.trees:
            self.trees[key] = o.read_typetree()
        return self.trees[key]

    def class_of(self, o, tt):
        s = self.obj(o, tt.get("m_Script"))
        if s is None:
            return None
        key = (s.assets_file.name, s.path_id)
        if key not in self.script_names:
            self.script_names[key] = s.read().m_ClassName
        return self.script_names[key]

    def behaviours(self, classes):
        """(objeto, typetree, clase) de cada MonoBehaviour de esas clases."""
        for o in self.env.objects:
            if o.type.name != "MonoBehaviour":
                continue
            try:
                tt = self.tree(o)
            except Exception:  # noqa: BLE001 — hay MonoBehaviour sin typetree legible (UI de Unity): no son de acá.
                continue
            cls = self.class_of(o, tt)
            if cls in classes:
                yield o, tt, cls

    def go_name(self, o, tt):
        go = self.obj(o, tt["m_GameObject"])
        return go.read().m_Name if go else ""

    def root_name(self, o, tt):
        """El nombre del GameObject raíz (en una escena de monumento, el prefab del monumento)."""
        go = self.obj(o, tt["m_GameObject"]).read()
        tr = None
        for c in go.m_Components:
            comp = getattr(c, "component", c).deref()  # la forma cambia entre versiones de UnityPy
            if comp.type.name == "Transform":
                tr = comp.read()
                break
        name = go.m_Name
        while tr is not None and tr.m_Father and tr.m_Father.m_PathID:
            tr = tr.m_Father.deref().read()
            name = tr.m_GameObject.deref().read().m_Name
        return name

    def shortname(self, owner, ref):
        o = self.obj(owner, ref)
        return self.tree(o)["shortname"] if o else None

    def spawn_tree(self, owner, ref):
        """
        Un `LootSpawn` como árbol simple, con las referencias ya seguidas (cada una desde el archivo donde vive su
        dueño): `{"subSpawn": [{"weight", "category": árbol | None}], "items": [{"sid", "amount", "isBP", "maxAmount"}]}`.
        `None` si `ref` no apunta a nada. Se arma una vez por `LootSpawn` (muchas cajas comparten subárboles).
        `extraSpawns` todavía no se cuenta: si alguna subcategoría lo trae, avisa por stderr para revisarlo.
        """
        o = self.obj(owner, ref)
        if o is None:
            return None
        key = (o.assets_file.name, o.path_id)
        if key not in self.spawns:
            t = self.tree(o)
            if any(s.get("extraSpawns") for s in t["subSpawn"]):
                print(f"[rust] {t['m_Name']}: subcategorías con extraSpawns, sin contar", file=sys.stderr)
            self.spawns[key] = {
                "subSpawn": [{"weight": s["weight"], "category": self.spawn_tree(o, s["category"])} for s in t["subSpawn"]],
                "items": [
                    {"sid": self.shortname(o, i["itemDef"]), "amount": i["amount"], "isBP": i["isBP"], "maxAmount": i["maxAmount"]}
                    for i in t["items"]
                ],
            }
        return self.spawns[key]


def roll_chances(spawn, resolve):
    """
    Una tirada de un `LootSpawn`: {(shortname, es_plano): probabilidad de que salga}. `spawn` es el árbol de
    `World.spawn_tree` (o `None`, que no da nada); `resolve(x)` sigue una subcategoría. Con árboles ya resueltos (lo que
    arma `World.spawn_tree`, y los de los tests) es la identidad.
    """
    out = {}
    if not spawn:
        return out
    subs = spawn.get("subSpawn") or []
    if subs:
        total = sum(s["weight"] for s in subs)
        if total <= 0:
            return out
        for s in subs:
            child = resolve(s["category"])
            if not child:
                continue
            p = s["weight"] / total
            for k, v in roll_chances(child, resolve).items():
                out[k] = out.get(k, 0.0) + p * v
        return out
    for it in spawn.get("items") or []:
        if it["sid"]:
            out[(it["sid"], bool(it["isBP"]))] = 1.0
    return out


def amounts(spawn, resolve, acc=None):
    """{(shortname, es_plano): (mínimo, máximo)} de una tirada: la cantidad de cada ítem en las hojas del árbol."""
    acc = {} if acc is None else acc
    if not spawn:
        return acc
    for s in spawn.get("subSpawn") or []:
        amounts(resolve(s["category"]), resolve, acc)
    for it in spawn.get("items") or []:
        sid = it["sid"]
        if not sid:
            continue
        lo = max(1, int(it["amount"]))
        hi = max(lo, int(it["maxAmount"])) if it["maxAmount"] > 0 else lo
        key = (sid, bool(it["isBP"]))
        old = acc.get(key)
        acc[key] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return acc


def container_chances(tt, resolve):
    """
    {(shortname, es_plano): (probabilidad de que la caja traiga al menos uno, mínimo, máximo)}. Cada tirada es
    independiente: P = 1 − Π (1 − p_tirada).
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
        for key, p in roll_chances(spawn, resolve).items():
            miss[key] = miss.get(key, 1.0) * (1 - min(1.0, p_roll) * p)
        amounts(spawn, resolve, amt)
    out = {k: (1 - m, *amt[k]) for k, m in miss.items() if m < 1}
    if tt.get("scrapAmount"):
        out[("scrap", False)] = (1.0, tt["scrapAmount"], tt["scrapAmount"])
    return out


def collect_loot(w, texts):
    by_key, ignored = {}, set()
    for o, tt, _ in w.behaviours(LOOT_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue  # una instancia dentro de una escena: el prefab ya cuenta
        base = path.rsplit("/", 1)[-1].removesuffix(".prefab").removesuffix(".entity")
        key = CONTAINERS.get(base)
        if key is None:
            ignored.add(base)
            continue
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
        for item_key, (p, lo, hi) in container_chances(resolved, lambda x: x).items():
            prev = by_key.setdefault(key, {}).get(item_key)
            if prev is None or p > prev[0]:
                by_key[key][item_key] = (p, lo, hi)
    if ignored:
        print(f"[rust] cajas que no se muestran: {', '.join(sorted(ignored))}", file=sys.stderr)

    items = {}
    for key, found in by_key.items():
        for (sid, bp), (p, lo, hi) in found.items():
            items.setdefault(sid, []).append({"c": key, "chance": round(p, 4), "min": lo, "max": hi, "bp": bp})
    for rows in items.values():
        rows.sort(key=lambda r: (-r["chance"], r["c"], r["bp"]))
    names = {}
    for key in sorted(by_key):
        n = CONTAINER_NAMES[key]
        names[key] = {"en": n[0], "es": n[1]} if isinstance(n, tuple) else {"en": text_of(texts, "en", n), "es": text_of(texts, "es", n)}
    return {"containers": names, "items": dict(sorted(items.items()))}


def collect_shops(w, texts):
    orders, seen = [], set()
    for o, tt, _ in w.behaviours(VENDING_CLASSES):
        if not o.assets_file.name.startswith("BuildPlayer-AssetScene-monument"):
            continue  # el prefab suelto, o la ciudad flotante (todavía no es un monumento del mapa)
        root = w.root_name(o, tt)
        shop = next((k for frag, k in SHOP_MONUMENTS if frag in root), None)
        if shop is None:
            raise SystemExit(f"tienda en un monumento sin nombre: {root}")
        vo = w.obj(o, tt.get("vendingOrders"))
        if vo is None:
            continue
        name = w.tree(vo)["m_Name"]
        if (shop, name) in seen:
            continue  # el mismo monumento en sus variantes (pueblo pesquero a/b/c, pozo a…e)
        seen.add((shop, name))
        for od in w.tree(vo)["orders"]:
            if od["randomDetails"]["useRandom"]:
                continue  # precio al azar (vendedor ambulante): no hay un número que mostrar
            item, currency = w.shortname(vo, od["sellItem"]), w.shortname(vo, od["currencyItem"])
            if not item or not currency:
                continue
            orders.append({
                "shop": shop, "item": item, "amount": od["sellItemAmount"], "bp": bool(od["sellItemAsBP"]),
                "currency": currency, "price": od["currencyAmount"],
            })
    orders.sort(key=lambda r: (r["shop"], r["item"], r["bp"], r["price"]))
    shops = {k: {"en": text_of(texts, "en", t), "es": text_of(texts, "es", t)} for k, t in SHOP_TOKENS.items()
             if any(r["shop"] == k for r in orders)}
    return {"shops": shops, "orders": orders}


def collect():
    """Lee el juego y devuelve `{"loot": ..., "shops": ...}` sin escribir nada (lo usan los tests)."""
    texts, _ = read_content()
    w = World()
    return {"loot": collect_loot(w, texts), "shops": collect_shops(w, texts)}


def main():
    got = collect()
    for name in ("loot", "shops"):
        (DATA / f"{name}.json").write_text(json.dumps(got[name], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_items = len(got["loot"]["items"])
    print(f"[rust] botín: {len(got['loot']['containers'])} cajas, {n_items} objetos; tiendas: {len(got['shops']['orders'])} órdenes")


if __name__ == "__main__":
    main()
```

Nota para quien implementa: si `test_tiendas_de_outpost_y_bandit_camp` no encuentra Outpost, sumar `"monuments.bundle"` a la tupla de `World.__init__`. En el sondeo del 5/10, las escenas `BuildPlayer-AssetScene-monument.N` estaban en assetscenes.

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -p "test_world.py" -v`
Expected: PASS (los del juego tardan ~30 s en total). Si `test_la_ak_sale_de_la_caja_de_elite…` falla, mirar la salida de `[rust] cajas que no se muestran:` antes de tocar nada.

- [ ] **Step 5: Escribir los datos y revisarlos a ojo**

Run: `python games/rust/tools/world.py`
Expected: `[rust] botín: 23 cajas, N objetos; tiendas: M órdenes` (23 = las claves de `CONTAINER_NAMES` que existan en el juego). En stderr, la lista de cajas que no se muestran (`invisible_*`, `dm *`, `giftbox_loot`, `loot-barrel-tutorial`, `xmastunnellootbox`, `satellite_crate_*`…).

Run: `python -c "import json;d=json.load(open('games/rust/data/loot.json',encoding='utf-8'));print(d['items']['rifle.ak'][:3]);print(d['items']['explosive.timed'][:3])"`
Expected: la AK con `elite` (y `locked`, `bradley` o `heli`) y una probabilidad entre 0,01 y 0,5. Si sale 1.0 o 0.0001, revisar la cuenta antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add games/rust/tools/world.py games/rust/tools/tests/test_world.py games/rust/data/loot.json games/rust/data/shops.json
git commit -m "feat(rust): el botín de cada caja y las tiendas de cada monumento"
```

---

### Task 3: Los archivos del sitio (`site_data.py`)

**Files:**
- Create: `games/rust/tools/site_data.py`
- Create: `games/rust/tools/tests/test_site_data.py`
- Modify: `games/rust/README.md`
- Create (salida): `games/rust/data/site/list.json`, `games/rust/data/site/items/00.json` … `31.json`, `games/rust/data/site/slugs-es.json`

**Interfaces:**
- Consumes: `games/rust/data/items.json` (Task 1), `loot.json` y `shops.json` (Task 2).
- Produces:
  - `list.json`:
    ```
    { "cats": ["weapon", …],
      "rows": [{ "id": "rifle.ak", "slug": "assault-rifle", "slugEs": "fusil-de-asalto", "en": "Assault Rifle", "es": "Fusil de asalto", "cat": "weapon" }] }
    ```
    - `cats` va en el orden de `CATEGORY_ORDER`, sólo las que tienen objetos;
    - `rows` va ordenado por `en`, sin redirects.
  - `items/NN.json`: `{ "<slug en>": Ficha }`, repartido por `shard(slug)` (FNV-1a 32 % 32, dos dígitos). Cada `Ficha`:
    ```
    { "id", "itemid", "slug", "slugEs", "name": {en, es}, "desc": {en, es}, "cat", "rarity", "stack",
      "condition": {max, repairable} | null,
      "craft": { "amount", "time", "workbench", "researchScrap": n | null, "default": bool,
                 "ingredients": [Ref & { "amount" }] } | null,
      "usedIn": Ref[],
      "recycle": { "scrap": n, "out": [Ref & { "amount" }], "eff": { "monument": 0.5, "safezone": 0.4 } } | null,
      "loot": [{ "c": "elite", "name": {en, es}, "chance", "min", "max", "bp" }],
      "shops": [{ "shop": {en, es}, "amount", "bp", "currency": Ref, "price" }] }
    ```
    - `Ref = { "id": "rifle.ak", "slug": "assault-rifle" | null, "name": {en, es} }`, con `slug` `null` si el objeto no tiene ficha (redirect u oculto);
    - `name.es` puede ser `null` en todo el archivo: el sitio cae al inglés.
  - `slugs-es.json`: `{ "items": { "<slug en>": "<slug es>" } }`, sólo los que cambian.
  - Python: `fnv1a32(s)`, `shard(slug, n=SHARDS)`, `build(items_doc, loot, shops) -> {"list", "fichas", "slugsEs"}`, `main()`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `games/rust/tools/tests/test_site_data.py`:

```python
"""
Tests de `site_data.py` (2026-10-05): lo que baja el sitio para la pestaña Objetos. No necesitan el juego: usan datos
sintéticos y, si existen, los JSON ya extraídos.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import site_data as rust_site  # noqa: E402  (no se llama `site.py`: Python ya importó su `site` al arrancar)


def it(sid, en, es=None, cat="weapon", craft=None, recycle=None, redirect=None):
    return {
        "id": sid, "itemid": 1, "slug": None if redirect else en.lower().replace(" ", "-"),
        "slugEs": None if redirect else (es or en).lower().replace(" ", "-"),
        "name": {"en": en, "es": es}, "desc": {"en": "d", "es": None}, "category": cat, "rarity": "rare", "stack": 1,
        "condition": None, "redirectOf": redirect, "craft": craft, "recycle": recycle, "icon": True,
    }


DOC = {
    "recyclers": {"monument": 0.5, "safezone": 0.4},
    "items": [
        it("rifle.ak", "Assault Rifle", "Fusil de asalto", craft={
            "ingredients": [{"id": "wood", "amount": 200}], "amount": 1, "time": 45, "workbench": 3,
            "researchable": True, "researchScrap": 500, "default": False,
        }, recycle={"scrap": 0, "out": [{"id": "wood", "amount": 200}]}),
        it("wood", "Wood", "Madera", cat="resources"),
        it("scrap", "Scrap", "Chatarra", cat="resources"),
        it("rifle.ak.ice", "Ice AK", None, redirect="rifle.ak"),
    ],
}
LOOT = {
    "containers": {"elite": {"en": "Elite Crate", "es": "Caja de élite"}},
    "items": {"rifle.ak": [{"c": "elite", "chance": 0.1, "min": 1, "max": 1, "bp": False}]},
}
SHOPS = {
    "shops": {"outpost": {"en": "Outpost", "es": "Puesto Avanzado"}},
    "orders": [{"shop": "outpost", "item": "wood", "amount": 1000, "bp": False, "currency": "scrap", "price": 50}],
}


class TestShard(unittest.TestCase):
    def test_igual_que_pzShardOf(self):
        # Los mismos valores que da `pzShardOf(slug, 32)` de site/src/zomboid/shard.ts (lo prueba también rustItemsData.test.ts).
        self.assertEqual(rust_site.fnv1a32(""), 0x811C9DC5)
        self.assertEqual(rust_site.fnv1a32("a"), 0xE40C292C)
        self.assertEqual(rust_site.shard("a"), f"{0xE40C292C % 32:02d}")


class TestBuild(unittest.TestCase):
    def setUp(self):
        self.out = rust_site.build(DOC, LOOT, SHOPS)
        self.fichas = self.out["fichas"]

    def test_la_lista_sin_redirects_y_ordenada(self):
        rows = self.out["list"]["rows"]
        self.assertEqual([r["id"] for r in rows], ["rifle.ak", "scrap", "wood"])
        self.assertEqual(rows[0], {"id": "rifle.ak", "slug": "assault-rifle", "slugEs": "fusil-de-asalto", "en": "Assault Rifle", "es": "Fusil de asalto", "cat": "weapon"})
        self.assertEqual(self.out["list"]["cats"], ["weapon", "resources"])

    def test_la_receta_con_referencias_y_se_usa_en(self):
        ak = self.fichas["assault-rifle"]
        self.assertEqual(ak["craft"]["ingredients"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 200}])
        self.assertEqual(ak["craft"]["researchScrap"], 500)
        self.assertEqual([r["id"] for r in self.fichas["wood"]["usedIn"]], ["rifle.ak"])

    def test_reciclaje_con_las_eficiencias(self):
        rec = self.fichas["assault-rifle"]["recycle"]
        self.assertEqual(rec["eff"], {"monument": 0.5, "safezone": 0.4})
        self.assertEqual(rec["out"][0]["slug"], "wood")

    def test_botin_y_tiendas_con_nombres(self):
        self.assertEqual(self.fichas["assault-rifle"]["loot"], [{"c": "elite", "name": {"en": "Elite Crate", "es": "Caja de élite"}, "chance": 0.1, "min": 1, "max": 1, "bp": False}])
        shop = self.fichas["wood"]["shops"][0]
        self.assertEqual(shop["shop"], {"en": "Outpost", "es": "Puesto Avanzado"})
        self.assertEqual((shop["currency"]["id"], shop["price"], shop["amount"]), ("scrap", 50, 1000))

    def test_los_slugs_en_espanol_solo_los_que_cambian(self):
        self.assertEqual(self.out["slugsEs"], {"items": {"assault-rifle": "fusil-de-asalto", "wood": "madera", "scrap": "chatarra"}})

    def test_secciones_vacias(self):
        scrap = self.fichas["scrap"]
        self.assertEqual((scrap["craft"], scrap["recycle"], scrap["loot"], scrap["shops"], scrap["usedIn"]), (None, None, [], [], []))


REAL = os.path.join(os.path.dirname(__file__), "..", "..", "data")


@unittest.skipUnless(os.path.exists(os.path.join(REAL, "loot.json")), "sin loot.json (correr world.py)")
class TestBuildReal(unittest.TestCase):
    def test_cada_objeto_visible_tiene_ficha_y_cada_ficha_su_archivo(self):
        load = lambda n: json.load(open(os.path.join(REAL, n), encoding="utf-8"))  # noqa: E731
        out = rust_site.build(load("items.json"), load("loot.json"), load("shops.json"))
        visible = [i for i in load("items.json")["items"] if i["slug"]]
        self.assertEqual(len(out["fichas"]), len(visible))
        self.assertEqual(len(out["list"]["rows"]), len(visible))
        ak = out["fichas"]["assault-rifle"]
        self.assertTrue(ak["loot"])
        self.assertEqual(ak["craft"]["researchScrap"], 500)
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `python -m unittest discover -s games/rust/tools/tests -p "test_site_data.py" -v`
Expected: ERROR `ModuleNotFoundError: No module named 'site_data'`. El archivo no se llama `site.py` a propósito: Python importa su propio `site` al arrancar, y un `import site` devolvería ése aunque el nuestro vaya primero en `sys.path`.

- [ ] **Step 3: Implementar `site_data.py`**

Crear `games/rust/tools/site_data.py`:

```python
"""
Los archivos que baja la pestaña Objetos de Rust (2026-10-05), armados de lo que escribieron `extract.py` (objetos,
recetas, reciclaje) y `world.py` (botín, tiendas). No lee el juego: corre en un segundo.

Escribe en `games/rust/data/site/`:
  - `list.json`: la lista liviana (id, slugs, nombres, categoría) y las categorías con objetos, en orden;
  - `items/NN.json`: las fichas, repartidas en 32 archivos por el hash del slug, para que cada página baje uno solo;
  - `slugs-es.json`: los slugs en español que cambian, para que la pestaña traduzca una dirección antes de bajar nada.

Uso, desde la raíz del repo:
    python games/rust/tools/site_data.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "site"
# 1.032 fichas en 32 archivos: ~32 por archivo, ~8 KB con gzip cada uno.
SHARDS = 32
# El orden de los filtros: el del inventario del juego.
CATEGORY_ORDER = [
    "weapon", "construction", "items", "resources", "attire", "tool", "medical", "food", "ammunition", "traps",
    "misc", "component", "electrical", "fun",
]


def fnv1a32(s):
    """FNV-1a de 32 bits sobre los bytes UTF-8 de `s`: `pzHash` de site/src/zomboid/shard.ts paso por paso."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug, n=SHARDS):
    """El archivo de una ficha: `pzShardOf(slug, 32)` del sitio. Si se cambia uno se cambia el otro."""
    return f"{fnv1a32(slug) % n:02d}"


def build(items_doc, loot, shops):
    items = items_doc["items"]
    by_id = {i["id"]: i for i in items}

    def ref(sid):
        i = by_id.get(sid)
        if i is None:
            return {"id": sid, "slug": None, "name": {"en": sid, "es": None}}
        return {"id": sid, "slug": i["slug"], "name": i["name"]}

    visible = sorted((i for i in items if i["slug"]), key=lambda i: (i["name"]["en"].lower(), i["id"]))
    used_in = {}
    for i in visible:
        for ing in (i["craft"] or {}).get("ingredients", []):
            used_in.setdefault(ing["id"], []).append(i["id"])

    containers = loot["containers"]
    shops_by_item = {}
    for o in shops["orders"]:
        shops_by_item.setdefault(o["item"], []).append({
            "shop": shops["shops"][o["shop"]], "amount": o["amount"], "bp": o["bp"], "currency": ref(o["currency"]),
            "price": o["price"],
        })

    fichas = {}
    for i in visible:
        craft = None
        if i["craft"]:
            c = i["craft"]
            craft = {
                "amount": c["amount"], "time": c["time"], "workbench": c["workbench"],
                "researchScrap": c.get("researchScrap"), "default": c["default"],
                "ingredients": [{**ref(g["id"]), "amount": g["amount"]} for g in c["ingredients"]],
            }
        recycle = None
        if i.get("recycle"):
            recycle = {
                "scrap": i["recycle"]["scrap"],
                "out": [{**ref(o["id"]), "amount": o["amount"]} for o in i["recycle"]["out"]],
                "eff": items_doc["recyclers"],
            }
        fichas[i["slug"]] = {
            "id": i["id"], "itemid": i["itemid"], "slug": i["slug"], "slugEs": i["slugEs"], "name": i["name"],
            "desc": i["desc"], "cat": i["category"], "rarity": i["rarity"], "stack": i["stack"],
            "condition": i["condition"], "craft": craft,
            "usedIn": [ref(u) for u in used_in.get(i["id"], [])],
            "recycle": recycle,
            "loot": [{"c": r["c"], "name": containers[r["c"]], "chance": r["chance"], "min": r["min"], "max": r["max"], "bp": r["bp"]}
                     for r in loot["items"].get(i["id"], [])],
            "shops": shops_by_item.get(i["id"], []),
        }

    present = {i["category"] for i in visible}
    return {
        "list": {
            "cats": [c for c in CATEGORY_ORDER if c in present],
            "rows": [{"id": i["id"], "slug": i["slug"], "slugEs": i["slugEs"], "en": i["name"]["en"], "es": i["name"]["es"], "cat": i["category"]}
                     for i in visible],
        },
        "fichas": fichas,
        "slugsEs": {"items": {i["slug"]: i["slugEs"] for i in visible if i["slugEs"] != i["slug"]}},
    }


def main():
    load = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))  # noqa: E731
    out = build(load("items.json"), load("loot.json"), load("shops.json"))
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    dump = lambda path, obj: path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")  # noqa: E731
    dump(OUT / "list.json", out["list"])
    dump(OUT / "slugs-es.json", out["slugsEs"])
    # Todos los archivos siempre, aunque alguno quede vacío: el sitio los carga con un glob.
    shards = {f"{n:02d}": {} for n in range(SHARDS)}
    for slug, f in out["fichas"].items():
        shards[shard(slug)][slug] = f
    for n, content in shards.items():
        dump(OUT / "items" / f"{n}.json", content)
    print(f"[rust] sitio: {len(out['fichas'])} fichas en {SHARDS} archivos")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr los tests**

Run: `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS todo (extract, world, site).

- [ ] **Step 5: Escribir los archivos y medir el peso**

Run: `python games/rust/tools/site_data.py`
Expected: `[rust] sitio: 1032 fichas en 32 archivos`.

Run: `python -c "import gzip,pathlib;fs=sorted(pathlib.Path('games/rust/data/site/items').glob('*.json'));print('lista',len(gzip.compress(pathlib.Path('games/rust/data/site/list.json').read_bytes()))//1024,'KB');print('ficha max',max(len(gzip.compress(f.read_bytes())) for f in fs)//1024,'KB')"`
Expected: la lista por debajo de 40 KB con gzip y el archivo de fichas más grande por debajo de 30 KB. Si se pasa, subir `SHARDS` a 64 (y el número del sitio, Task 4).

- [ ] **Step 6: README**

En `games/rust/README.md`, reemplazar la sección "En cada actualización" por:

```markdown
## En cada actualización (primer jueves del mes)

1. Actualizá el juego en Steam.
2. `python games/rust/tools/extract.py` (objetos, recetas, reciclaje, íconos; ~20 s).
3. `python games/rust/tools/world.py` (botín de las cajas y tiendas de los monumentos; ~30 s).
4. `python games/rust/tools/site_data.py` (los archivos que baja la pestaña Objetos; un segundo).
5. `python -m unittest discover -s games/rust/tools/tests -v`. Si un número de los tests cambió, revisá en el juego
   que el cambio sea real antes de tocar el test.
6. Commiteá `games/rust/data` y `site/public/rust/items`.
```

- [ ] **Step 7: Commit**

```bash
git add games/rust/tools/site_data.py games/rust/tools/tests/test_site_data.py games/rust/README.md games/rust/data/site
git commit -m "feat(rust): los archivos de la pestaña Objetos (lista, fichas repartidas y slugs en español)"
```

---

### Task 4: La carga de datos en el sitio y las cuentas sin React

**Files:**
- Create: `site/src/rust/items/data.ts`
- Create: `site/src/rust/items/filter.ts`
- Create: `site/src/rust/items/recycle.ts`
- Create: `site/test/rustItemsData.test.ts`
- Create: `site/test/rustFilter.test.ts`
- Create: `site/test/rustRecycle.test.ts`

**Interfaces:**
- Consumes: `games/rust/data/site/*` (Task 3), `once` y `shardedFichas` de `site/src/zomboid/store.ts`, `pzShardOf` de `site/src/zomboid/shard.ts`.
- Produces:
  - `data.ts`:
    - tipos `Loc`, `Ref`, `ListRow`, `ItemsList`, `Ficha`;
    - `RUST_SHARDS = 32`;
    - `peekList(): ItemsList | null` y `loadList(): Promise<ItemsList>`;
    - `peekItem(slug): Ficha | null | undefined` y `loadItem(slug): Promise<Ficha | null>`;
    - `preloadItemsRoute(route: Route): Promise<void>`;
    - `say(loc: Loc, lang): string`.
  - `filter.ts`: `normalize(s: string): string` y `filterRows(rows: ListRow[], cat: string | null, query: string): ListRow[]`.
  - `recycle.ts`: `recycleYield(amount: number, eff: number): { kind: "fixed"; n: number } | { kind: "chance"; pct: number }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `site/test/rustRecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recycleYield } from "../src/rust/items/recycle";

/** La cuenta del reciclador (Recycler.RecycleThink): más de 1 por objeto, ceil(cantidad × eficiencia); 1 o menos, una chance. */
describe("lo que da el reciclador", () => {
  it("los engranajes dan 13 fragmentos en una recicladora común y 10 en zona segura", () => {
    expect(recycleYield(25, 0.5)).toEqual({ kind: "fixed", n: 13 });
    expect(recycleYield(25, 0.4)).toEqual({ kind: "fixed", n: 10 });
  });
  it("2 de metal de alta calidad al 50 % es 1 seguro", () => {
    expect(recycleYield(2, 0.5)).toEqual({ kind: "fixed", n: 1 });
  });
  it("1 o menos es una probabilidad", () => {
    expect(recycleYield(1, 0.5)).toEqual({ kind: "chance", pct: 50 });
    expect(recycleYield(0.5, 0.4)).toEqual({ kind: "chance", pct: 20 });
  });
});
```

Crear `site/test/rustFilter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterRows, normalize } from "../src/rust/items/filter";
import type { ListRow } from "../src/rust/items/data";

const row = (id: string, en: string, es: string | null, cat: string): ListRow => ({ id, slug: en.toLowerCase(), slugEs: (es ?? en).toLowerCase(), en, es, cat });
const rows = [row("rifle.ak", "Assault Rifle", "Fusil de asalto", "weapon"), row("explosive.timed", "Timed Explosive Charge", "Carga explosiva con temporizador", "tool"), row("cloth", "Cloth", "Tela", "resources")];

describe("el buscador y el filtro de Objetos", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(normalize("  Médica ÁRBOL ")).toBe("medica arbol");
  });
  it("busca en los dos idiomas y por shortname", () => {
    expect(filterRows(rows, null, "fusil").map((r) => r.id)).toEqual(["rifle.ak"]);
    expect(filterRows(rows, null, "assault").map((r) => r.id)).toEqual(["rifle.ak"]);
    expect(filterRows(rows, null, "explosive.timed").map((r) => r.id)).toEqual(["explosive.timed"]);
    expect(filterRows(rows, null, "c4").map((r) => r.id)).toEqual([]);
  });
  it("todas las palabras tienen que estar", () => {
    expect(filterRows(rows, null, "carga temporizador").map((r) => r.id)).toEqual(["explosive.timed"]);
  });
  it("filtra por categoría, y sin búsqueda devuelve todo lo de la categoría", () => {
    expect(filterRows(rows, "resources", "").map((r) => r.id)).toEqual(["cloth"]);
    expect(filterRows(rows, null, "").length).toBe(3);
  });
});
```

Crear `site/test/rustItemsData.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pzShardOf } from "../src/zomboid/shard";
import { loadItem, loadList, peekItem, peekList, RUST_SHARDS, say } from "../src/rust/items/data";

const DIR = join(__dirname, "../../games/rust/data/site/items");

describe("los datos de Objetos de Rust", () => {
  it("cada ficha vive en el archivo que dice el sitio (el mismo hash que site_data.py)", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(RUST_SHARDS);
    for (const f of files) {
      const shard = JSON.parse(readFileSync(join(DIR, f), "utf-8")) as Record<string, unknown>;
      for (const slug of Object.keys(shard)) expect(`${pzShardOf(slug, RUST_SHARDS)}.json`).toBe(f);
    }
  });

  it("la lista y una ficha se cargan una vez y quedan para el primer render", async () => {
    expect(peekList()).toBeNull();
    const list = await loadList();
    expect(peekList()).toBe(list);
    expect(list.rows.length).toBeGreaterThan(1000);
    expect(peekItem("assault-rifle")).toBeUndefined();
    const ak = await loadItem("assault-rifle");
    expect(ak?.id).toBe("rifle.ak");
    expect(peekItem("assault-rifle")).toBe(ak);
    expect(await loadItem("no-existe")).toBeNull();
    expect(await loadItem("constructor")).toBeNull();
  });

  it("say cae al inglés si no hay español", () => {
    expect(say({ en: "Ice AK", es: null }, "es")).toBe("Ice AK");
    expect(say({ en: "Wood", es: "Madera" }, "es")).toBe("Madera");
    expect(say({ en: "Wood", es: "Madera" }, "en")).toBe("Wood");
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustRecycle.test.ts test/rustFilter.test.ts test/rustItemsData.test.ts`
Expected: FAIL, no encuentra los módulos.

- [ ] **Step 3: Implementar**

Crear `site/src/rust/items/recycle.ts`:

```ts
/**
 * Lo que da el reciclador de Rust por cada objeto (2026-10-05), como `Recycler.RecycleThink` del juego: un ingrediente
 * con más de 1 por objeto sale entero, redondeado para arriba (`ceil(cantidad × eficiencia)`); uno con 1 o menos sale
 * de a uno, con probabilidad `cantidad × eficiencia`. `amount` es por objeto y al 100 % (lo escribe `extract.py`).
 */
export type RecycleYield = { kind: "fixed"; n: number } | { kind: "chance"; pct: number };

export function recycleYield(amount: number, eff: number): RecycleYield {
  if (amount > 1) return { kind: "fixed", n: Math.ceil(amount * eff - 1e-9) };
  return { kind: "chance", pct: Math.round(amount * eff * 100) };
}
```

Crear `site/src/rust/items/filter.ts`:

```ts
/**
 * El buscador y el filtro de la lista de Objetos de Rust (2026-10-05), sin React para probarlos solos. Busca en el
 * nombre inglés, el español y el shortname (`rifle.ak`), sin tildes ni mayúsculas, y pide todas las palabras.
 */
import type { ListRow } from "./data";

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

export function filterRows(rows: ListRow[], cat: string | null, query: string): ListRow[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (cat && r.cat !== cat) return false;
    if (!words.length) return true;
    const hay = normalize(`${r.en} ${r.es ?? ""} ${r.id}`);
    return words.every((w) => hay.includes(w));
  });
}
```

Crear `site/src/rust/items/data.ts`:

```ts
/**
 * Los datos de la pestaña Objetos de Rust (2026-10-05), tal como los escribe `games/rust/tools/site_data.py`: la lista
 * liviana (`list.json`) y las fichas repartidas en 32 archivos por el hash del slug (`items/NN.json`). Bajan con los
 * mismos ayudantes que Zomboid (`zomboid/store.ts`): `load*` pide una sola vez, `peek*` devuelve lo que ya llegó para
 * el primer render y el prerender.
 *
 * Los `import()` van escritos acá para que Vite arme un chunk por archivo: nada de esto viaja en el de la pestaña.
 */
import type { Route } from "../../route";
import { once, shardedFichas } from "../../zomboid/store";
import { pzShardOf } from "../../zomboid/shard";

export type Loc = { en: string; es: string | null };
/** Un enlace a otro objeto: `slug` es `null` si no tiene ficha (una skin, un objeto oculto). */
export interface Ref {
  id: string;
  slug: string | null;
  name: Loc;
}
export interface ListRow {
  id: string;
  slug: string;
  slugEs: string;
  en: string;
  es: string | null;
  cat: string;
}
export interface ItemsList {
  cats: string[];
  rows: ListRow[];
}
export interface Ficha {
  id: string;
  itemid: number;
  slug: string;
  slugEs: string;
  name: Loc;
  desc: Loc;
  cat: string;
  rarity: string;
  stack: number;
  condition: { max: number; repairable: boolean } | null;
  craft: {
    amount: number;
    time: number;
    workbench: number;
    researchScrap: number | null;
    default: boolean;
    ingredients: (Ref & { amount: number })[];
  } | null;
  usedIn: Ref[];
  recycle: { scrap: number; out: (Ref & { amount: number })[]; eff: { monument: number; safezone: number } } | null;
  loot: { c: string; name: Loc; chance: number; min: number; max: number; bp: boolean }[];
  shops: { shop: Loc; amount: number; bp: boolean; currency: Ref; price: number }[];
}

/** `SHARDS` de site_data.py: si se cambia uno se cambia el otro (lo prueba rustItemsData.test.ts). */
export const RUST_SHARDS = 32;

const list = once<ItemsList>(() => import("@rust/site/list.json"));
const fichas = shardedFichas<Ficha>(
  import.meta.glob<{ default: Record<string, Ficha> }>("@rust/site/items/*.json"),
  (slug) => pzShardOf(slug, RUST_SHARDS),
);

export const peekList = (): ItemsList | null => list.peek();
export const loadList = (): Promise<ItemsList> => list.load();
export const peekItem = (slug: string): Ficha | null | undefined => fichas.peek(slug);
export const loadItem = (slug: string): Promise<Ficha | null> => fichas.load(slug);

/** El nombre en el idioma de la página; el juego no traduce todo, y lo que falta va en inglés. */
export const say = (loc: Loc, lang: "en" | "es"): string => (lang === "es" && loc.es) || loc.en;

/**
 * Lo que necesita una dirección de la pestaña antes del primer render: la ficha, o la lista si es la lista o si la
 * ficha no existe (se muestra la lista con una nota). Para el prerender y para `preloadTab`.
 */
export async function preloadItemsRoute(route: Route): Promise<void> {
  if (route.detail && (await loadItem(route.detail))) return;
  await loadList();
}
```

Si `import.meta.glob` con alias (`@rust/…`) no devuelve nada en vitest, mirar cómo lo resuelve `zomboid/items/data.ts`: usa la misma forma (`"@zomboid/site/items/*.json"`) y funciona, así que debería andar igual. El alias `@rust` ya está en `vite.config.ts` y `tsconfig.json` desde el plan 1.

- [ ] **Step 4: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustRecycle.test.ts test/rustFilter.test.ts test/rustItemsData.test.ts`
Expected: PASS. Run `npx tsc --noEmit -p .` → sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add site/src/rust/items/data.ts site/src/rust/items/filter.ts site/src/rust/items/recycle.ts site/test/rustItemsData.test.ts site/test/rustFilter.test.ts site/test/rustRecycle.test.ts
git commit -m "feat(rust): la carga de la lista y las fichas de Objetos, el buscador y la cuenta del reciclador"
```

---

### Task 5: La pestaña Objetos (lista y ficha) conectada

**Files:**
- Create: `site/src/rust/items/RustItems.tsx`
- Create: `site/src/rust/items/ItemList.tsx`
- Create: `site/src/rust/items/ItemFicha.tsx`
- Create: `site/src/rust/RsLoading.tsx`
- Create: `site/src/useLoad.ts` (se mueve de `zomboid/ui.tsx`)
- Modify: `site/src/zomboid/ui.tsx` (re-exporta `useLoad`)
- Create: `site/src/styles/rust-items.css`
- Create: `site/test/rustItems.test.ts`
- Create: `site/test/rustColdLoad.test.ts`
- Modify: `site/src/rustCopy.ts`
- Modify: `site/src/Rust.tsx`
- Modify: `site/src/route.ts` (`RUST_PUBLISHED`)
- Modify: `site/src/areas.ts`, `site/src/areaFiles.ts`
- Modify: `site/src/entry-server.tsx`
- Modify: `site/vite.config.ts` (sólo la lista de chunks que el prerender exige)
- Modify: `site/test/rustRoute.test.ts`, `site/test/rustHome.test.ts`, `site/test/rustSeo.test.ts`, `site/test/areas.test.ts`

**Interfaces:**
- Consumes: `data.ts`, `filter.ts` y `recycle.ts` (Task 4); `games/rust/data/site/slugs-es.json` (Task 3); `registerRustSlugs` de `route.ts`; `useLoad` (pasa a `site/src/useLoad.ts`); `RouteLink`; `lazyWithPreload`.
- Produces:
  - `Rust.tsx`: `export const preloadTab = (route: Route) => Promise<void>`;
  - `RUST_TAB_FILES` en `areaFiles.ts`;
  - `RustCopy.items` (los textos de abajo) y `RustCopy.seo.detail(name)`, `RustCopy.loading`, `RustCopy.loadError`, `RustCopy.retry`;
  - la clase `rs-loading` (la guardia del prerender la busca en Task 7).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `site/test/rustItems.test.ts`:

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

describe("la pestaña Objetos de Rust", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/objetos"));
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
    await preloadTab(parseRoute("/en/rust/items/wood"));
    await preloadTab(parseRoute("/en/rust/items/gears"));
  });

  it("la lista enlaza cada ficha con su slug en español y trae los filtros", () => {
    const html = render("es", "/es/rust/objetos");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(html).toContain(">Armas<");
    expect(html).toContain('type="search"');
    expect(html).not.toContain("rs-loading");
  });

  it("la pestaña ya no está apagada", () => {
    expect(render("es", "/es/rust")).toContain('href="/es/rust/objetos"');
  });

  it("la ficha del AK: nombre, comando, receta con enlaces, investigación y botín", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain("<h1");
    expect(html).toContain("Fusil de asalto");
    expect(html).toContain("inventory.give rifle.ak 1");
    expect(html).toMatch(/href="\/es\/rust\/objetos\/[^"]+"/);
    expect(html).toContain("500");
    expect(html).toContain("Caja de élite");
    expect(html).not.toContain("rs-loading");
  });

  it("la madera: se usa en, y la tienda de Outpost si la vende", () => {
    const html = render("en", "/en/rust/items/wood");
    expect(html).toContain("Used in");
    expect(html).toContain('href="/en/rust/items/assault-rifle"');
  });

  it("los engranajes: lo que da el reciclador en cada recicladora", () => {
    const html = render("en", "/en/rust/items/gears");
    expect(html).toContain("Recycling");
    expect(html).toContain(">13<");
    expect(html).toContain(">10<");
  });

  it("una ficha que no existe muestra la lista con una nota", async () => {
    await preloadTab(parseRoute("/es/rust/objetos/no-existe"));
    const html = render("es", "/es/rust/objetos/no-existe");
    expect(html).toContain("rs-missing");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
  });
});
```

Crear `site/test/rustColdLoad.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/route";

/**
 * En frío, `main.tsx` lee la dirección antes de que la pestaña anote sus slugs: `detail` llega como "fusil-de-asalto".
 * Después de `preloadRoute` (que baja la pestaña), leerla de nuevo tiene que dar el slug inglés.
 */
describe("una ficha de Rust en español, en frío", () => {
  it("después de bajar la pestaña, la dirección ya está traducida", async () => {
    const { preloadRoute } = await import("../src/areas");
    const cold = parseRoute("/es/rust/objetos/fusil-de-asalto");
    await preloadRoute(cold);
    expect(parseRoute("/es/rust/objetos/fusil-de-asalto").detail).toBe("assault-rifle");
    const { peekItem } = await import("../src/rust/items/data");
    expect(peekItem("assault-rifle")?.id).toBe("rifle.ak");
  });
});
```

En `site/test/rustRoute.test.ts`:
- reemplazar el test "una pestaña que todavía no se publicó (o que no existe) muestra la portada" por:

```ts
  it("Objetos ya está publicada; Raideo todavía no, y muestra la portada", () => {
    expect(routePath(parseRoute("/es/rust/objetos"))).toBe("/es/rust/objetos");
    expect(routePath(parseRoute("/es/rust/raideo"))).toBe("/es/rust");
    expect(routePath(parseRoute("/en/rust/no-existe"))).toBe("/en/rust");
  });
```

- y agregar al final del `describe` el test de `parseRoute` con detalle que quedó pendiente del plan 1:

```ts
  it("parseRoute lee la ficha en los dos idiomas y con el slug del otro idioma", () => {
    registerRustSlugs({ items: { "assault-rifle": "fusil-de-asalto" } });
    expect(parseRoute("/es/rust/objetos/fusil-de-asalto")).toMatchObject({ lang: "es", view: "rust", rsSection: "items", detail: "assault-rifle" });
    expect(parseRoute("/en/rust/items/assault-rifle")).toMatchObject({ lang: "en", rsSection: "items", detail: "assault-rifle" });
    // El slug se traduce en los dos idiomas: un link en inglés con el slug español abre la misma ficha.
    expect(parseRoute("/en/rust/items/fusil-de-asalto").detail).toBe("assault-rifle");
    expect(parseRoute("/es/rust/items/assault-rifle")).toMatchObject({ rsSection: "items", detail: "assault-rifle" });
  });
```

En `site/test/rustHome.test.ts`, el test "las pestañas sin publicar se ven apagadas…" pasa a ser:

```ts
  it("Objetos enlaza; Raideo y las pestañas de las etapas que vienen se ven apagadas", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust/objetos"');
    expect(html).not.toContain('href="/es/rust/raideo"');
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Raideo</);
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Monumentos</);
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustItems.test.ts test/rustColdLoad.test.ts test/rustRoute.test.ts test/rustHome.test.ts`
Expected: FAIL (`preloadTab` no existe, Objetos sin publicar).

- [ ] **Step 3: Los textos (`rustCopy.ts`)**

3a. En `interface RustCopy`, agregar después de `seo`:

```ts
  /** El `<head>` de una ficha de Objetos. */
  detailSeo: (name: string) => Seo;
  loading: string;
  loadError: string;
  retry: string;
  items: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    all: string;
    cats: Record<string, string>;
    count: (n: string) => string;
    empty: string;
    missing: string;
    shortname: string;
    itemid: string;
    command: string;
    copy: string;
    copied: string;
    stack: string;
    condition: string;
    repairable: string;
    notRepairable: string;
    craft: string;
    gives: (n: number) => string;
    seconds: (s: string) => string;
    workbench: (n: number) => string;
    noWorkbench: string;
    research: (n: string) => string;
    defaultBp: string;
    usedIn: string;
    recycle: string;
    recycleMonument: string;
    recycleSafe: string;
    chance: (pct: number) => string;
    loot: string;
    lootNote: string;
    blueprint: string;
    shops: string;
    shopRow: (amount: number, item: string, price: number, currency: string) => string;
    back: string;
  };
```

3b. En `EN`, después de `seo: {…},`:

```ts
  detailSeo: (name) => ({
    title: `${name} — Rust: Crafting, Recycling and Where to Find It | Vestigo`,
    description: `How to craft ${name} in Rust: recipe, workbench and research cost, what it recycles into, which crates drop it, where to buy it, and its shortname and spawn command.`,
  }),
  loading: "Loading…",
  loadError: "This page didn't load.",
  retry: "Try again",
  items: {
    h1: "Rust items",
    lede: (n) => `${n} items with their recipe, what they recycle into, where they drop and where to buy them.`,
    search: "Search items",
    searchPlaceholder: "AK, C4, sulfur, rifle.ak…",
    all: "All",
    cats: {
      weapon: "Weapons", construction: "Construction", items: "Items", resources: "Resources", attire: "Attire",
      tool: "Tools", medical: "Medical", food: "Food", ammunition: "Ammo", traps: "Traps", misc: "Misc",
      component: "Components", electrical: "Electrical", fun: "Fun",
    },
    count: (n) => `${n} items`,
    empty: "Nothing matches that search.",
    missing: "That item doesn't exist (or changed its name). Here's the full list.",
    shortname: "Shortname",
    itemid: "Item ID",
    command: "Spawn command",
    copy: "Copy",
    copied: "Copied",
    stack: "Stack",
    condition: "Durability",
    repairable: "repairable",
    notRepairable: "not repairable",
    craft: "Crafting",
    gives: (n) => (n > 1 ? `Makes ${n}` : "Makes 1"),
    seconds: (s) => `${s} s`,
    workbench: (n) => `Workbench level ${n}`,
    noWorkbench: "No workbench",
    research: (n) => `Research: ${n} scrap`,
    defaultBp: "Known from the start",
    usedIn: "Used in",
    recycle: "Recycling",
    recycleMonument: "Monument recycler",
    recycleSafe: "Safe zone recycler",
    chance: (pct) => `${pct}% chance`,
    loot: "Where to find it",
    lootNote: "Chance that one container has at least one.",
    blueprint: "Blueprint",
    shops: "Where to buy it",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} for ${price} ${currency}`,
    back: "All items",
  },
```

3c. En `ES`, después de `seo: {…},`:

```ts
  detailSeo: (name) => ({
    title: `${name} — Rust: crafteo, reciclaje y dónde encontrarlo | Vestigo`,
    description: `Cómo craftear ${name} en Rust: receta, banco y costo de investigación, lo que da al reciclarlo, en qué cajas aparece, dónde comprarlo, su shortname y el comando para spawnearlo.`,
  }),
  loading: "Cargando…",
  loadError: "Esta página no cargó.",
  retry: "Reintentar",
  items: {
    h1: "Objetos de Rust",
    lede: (n) => `${n} objetos con su receta, lo que dan al reciclarlos, dónde aparecen y dónde comprarlos.`,
    search: "Buscar objetos",
    searchPlaceholder: "AK, C4, azufre, rifle.ak…",
    all: "Todos",
    cats: {
      weapon: "Armas", construction: "Construcción", items: "Objetos", resources: "Recursos", attire: "Ropa",
      tool: "Herramientas", medical: "Medicina", food: "Comida", ammunition: "Munición", traps: "Trampas",
      misc: "Misceláneos", component: "Componentes", electrical: "Electricidad", fun: "Diversión",
    },
    count: (n) => `${n} objetos`,
    empty: "No hay nada con esa búsqueda.",
    missing: "Ese objeto no existe (o cambió de nombre). Acá está la lista completa.",
    shortname: "Shortname",
    itemid: "ID del objeto",
    command: "Comando para spawnearlo",
    copy: "Copiar",
    copied: "Copiado",
    stack: "Pila",
    condition: "Durabilidad",
    repairable: "se repara",
    notRepairable: "no se repara",
    craft: "Crafteo",
    gives: (n) => (n > 1 ? `Da ${n}` : "Da 1"),
    seconds: (s) => `${s} s`,
    workbench: (n) => `Banco de nivel ${n}`,
    noWorkbench: "Sin banco",
    research: (n) => `Investigar: ${n} de chatarra`,
    defaultBp: "Se sabe desde el principio",
    usedIn: "Se usa en",
    recycle: "Reciclaje",
    recycleMonument: "Recicladora de monumento",
    recycleSafe: "Recicladora de zona segura",
    chance: (pct) => `${pct} % de chance`,
    loot: "Dónde aparece",
    lootNote: "Probabilidad de que una caja traiga al menos uno.",
    blueprint: "Plano",
    shops: "Dónde comprarlo",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} por ${price} de ${currency}`,
    back: "Todos los objetos",
  },
```

- [ ] **Step 4: La hoja de carga (`rust/RsLoading.tsx`)**

```tsx
/**
 * La hoja de "cargando…" de Rust (2026-10-05): un panel del inventario vacío, del alto de una página para que el pie no
 * salte. Si los datos no llegan (`onRetry`), dice qué pasó y ofrece reintentar. El prerender corta el build si una
 * página sale con esta hoja (`vite.config.ts`).
 */
import { useRustCopy } from "../rustCopy";

export default function RsLoading({ onRetry }: { onRetry?: () => void }) {
  const c = useRustCopy();
  return (
    <main className="rs-main rs-loading" aria-busy={!onRetry}>
      <div className="rs-pnl">
        {onRetry ? (
          <p role="alert">
            {c.loadError}{" "}
            <button type="button" className="rs-btn" onClick={onRetry}>
              {c.retry}
            </button>
          </p>
        ) : (
          <p>{c.loading}</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: La pestaña (`rust/items/RustItems.tsx`)**

```tsx
/**
 * La pestaña Objetos de Rust (2026-10-05): la lista (`/rust/items`) o la ficha de un objeto (`/rust/items/assault-rifle`,
 * `/es/rust/objetos/fusil-de-asalto`). Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los datos no viajan en este chunk (`data.ts`): la lista baja en la lista, y una ficha baja sólo su archivo. Si la
 * ficha no existe se muestra la lista con una nota.
 */
import slugsEs from "@rust/site/slugs-es.json";
import { registerRustSlugs, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { loadItem, loadList, peekItem, peekList } from "./data";
import ItemFicha from "./ItemFicha";
import ItemList from "./ItemList";
import "../../styles/rust-items.css";

// Al cargarse el módulo y no en un efecto: `preloadRoute` baja este chunk antes de que `App` lea la dirección, así
// `/es/rust/objetos/fusil-de-asalto` ya llega como `assault-rifle`.
registerRustSlugs(slugsEs);

type Nav = (r: Route) => void;

export default function RustItems({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekItem(slug!), () => loadItem(slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList() ?? undefined, loadList);

  if (item.failed) return <RsLoading onRetry={item.retry} />;
  if (item.value) return <ItemFicha ficha={item.value} route={route} navigate={navigate} key={item.value.id} />;
  if (slug !== null && item.value === undefined) return <RsLoading />;
  if (list.failed) return <RsLoading onRetry={list.retry} />;
  if (!list.value) return <RsLoading />;
  return <ItemList list={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
```

`useLoad` hoy vive en `zomboid/ui.tsx`, que importa `ZomboidHome` (y con eso, la portada de Zomboid entraría en el chunk de Rust). Antes de este paso, moverlo:
- crear `site/src/useLoad.ts` con la función `useLoad` tal cual está en `zomboid/ui.tsx` (líneas ~210–241, con su comentario y los imports de React que use: `useEffect`, `useReducer`, `useState`);
- en `zomboid/ui.tsx`, borrar la definición y dejar `export { useLoad } from "../useLoad";`, así los imports de Zomboid no cambian;
- sacar de `zomboid/ui.tsx` los imports de React que queden sin usar.

`once` y `shardedFichas` (`zomboid/store.ts`) y `pzShardOf` (`zomboid/shard.ts`) sí se importan directo: no traen nada más. Después de moverlo, `npx vitest run test/zomboid` tiene que seguir en verde.

- [ ] **Step 6: La lista (`rust/items/ItemList.tsx`)**

```tsx
/**
 * La lista de Objetos de Rust (2026-10-05): casilleros del inventario con el ícono y el nombre, filtro por categoría y
 * buscador. Todos los objetos van en el HTML (el prerender los escribe): son los enlaces por los que Google llega a cada
 * ficha. El filtro y la búsqueda sólo esconden.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import type { ItemsList } from "./data";
import { filterRows } from "./filter";

type Nav = (r: Route) => void;

export default function ItemList({ list, route, navigate, missing }: { list: ItemsList; route: Route; navigate: Nav; missing: boolean }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterRows(list.rows, cat, query), [list.rows, cat, query]);
  return (
    <main className="rs-main">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(list.rows.length.toLocaleString(locale))}</p>
        {missing && <p className="rs-missing" role="status">{t.missing}</p>}
        <label className="rs-search">
          <span className="rs-hd">{t.search}</span>
          <input type="search" value={query} placeholder={t.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="rs-cats" role="group" aria-label={t.search}>
          <button type="button" className={`rs-cat${cat === null ? " is-on" : ""}`} aria-pressed={cat === null} onClick={() => setCat(null)}>
            {t.all}
          </button>
          {list.cats.map((c) => (
            <button type="button" key={c} className={`rs-cat${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {t.cats[c] ?? c}
            </button>
          ))}
        </div>
        <p className="rs-count-line">{t.count(rows.length.toLocaleString(locale))}</p>
        {rows.length === 0 && <p className="rs-empty">{t.empty}</p>}
        <ul className="rs-grid">
          {rows.map((r) => {
            const name = (lang === "es" && r.es) || r.en;
            return (
              <li key={r.id}>
                <RouteLink className="rs-cell" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate} prefetch="press">
                  <span className="rs-slot">
                    <img src={`/rust/items/${r.id}.webp`} alt="" width={64} height={64} loading="lazy" />
                  </span>
                  <span className="rs-cell-name">{name}</span>
                </RouteLink>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: La ficha (`rust/items/ItemFicha.tsx`)**

```tsx
/**
 * La ficha de un objeto de Rust (2026-10-05). Arriba, el ícono en su casillero, el nombre y la descripción oficiales y
 * los datos para copiar (shortname, itemid, comando de admin). Después, cada sección sólo si tiene algo: crafteo, se usa
 * en, reciclaje (en las dos recicladoras), dónde aparece y dónde comprarlo.
 */
import { useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useRustCopy } from "../../rustCopy";
import { say, type Ficha, type Ref } from "./data";
import { recycleYield } from "./recycle";

type Nav = (r: Route) => void;

export default function ItemFicha({ ficha, route, navigate }: { ficha: Ficha; route: Route; navigate: Nav }) {
  const t = useRustCopy().items;
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = say(ficha.name, lang);
  const desc = say(ficha.desc, lang);
  const link = (r: Ref, children: ReactNode) =>
    r.slug ? (
      <RouteLink className="rs-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.slug }} onNavigate={navigate}>
        {children}
      </RouteLink>
    ) : (
      <span className="rs-ref">{children}</span>
    );
  const icon = (id: string, size = 40) => <img src={`/rust/items/${id}.webp`} alt="" width={size} height={size} />;
  const command = `inventory.give ${ficha.id} 1`;
  const c = ficha.craft;
  const r = ficha.recycle;
  return (
    <main className="rs-main rs-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "items", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-ficha-top">
        <span className="rs-slot rs-slot-big">{icon(ficha.id, 128)}</span>
        <div className="rs-title">
          <p className="rs-hd">{t.cats[ficha.cat] ?? ficha.cat}</p>
          <h1 className="rs-h1">{name}</h1>
          {desc && <p className="rs-lede">{desc}</p>}
        </div>
        <dl className="rs-facts">
          <Copyable label={t.shortname} value={ficha.id} />
          <Copyable label={t.itemid} value={String(ficha.itemid)} />
          <Copyable label={t.command} value={command} />
          <div>
            <dt>{t.stack}</dt>
            <dd>{num(ficha.stack)}</dd>
          </div>
          {ficha.condition && (
            <div>
              <dt>{t.condition}</dt>
              <dd>
                {num(ficha.condition.max)} · {ficha.condition.repairable ? t.repairable : t.notRepairable}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {c && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.craft}</h2>
          <ul className="rs-ings">
            {c.ingredients.map((g) => (
              <li key={g.id}>
                {link(g, <>
                  <span className="rs-slot">{icon(g.id)}<b className="rs-qty">{num(g.amount)}</b></span>
                  <span>{say(g.name, lang)}</span>
                </>)}
              </li>
            ))}
          </ul>
          <p className="rs-meta">
            <span>{t.gives(c.amount)}</span>
            <span>{t.seconds(num(c.time))}</span>
            <span>{c.workbench ? t.workbench(c.workbench) : t.noWorkbench}</span>
            {c.researchScrap !== null && <span>{t.research(num(c.researchScrap))}</span>}
            {c.default && <span>{t.defaultBp}</span>}
          </p>
        </section>
      )}

      {ficha.usedIn.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.usedIn}</h2>
          <ul className="rs-refs">
            {ficha.usedIn.map((u) => (
              <li key={u.id}>{link(u, <>{icon(u.id, 32)}<span>{say(u.name, lang)}</span></>)}</li>
            ))}
          </ul>
        </section>
      )}

      {r && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.recycle}</h2>
          <table className="rs-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{t.recycleMonument} ({Math.round(r.eff.monument * 100)} %)</th>
                <th scope="col">{t.recycleSafe} ({Math.round(r.eff.safezone * 100)} %)</th>
              </tr>
            </thead>
            <tbody>
              {r.scrap > 0 && (
                <tr>
                  <th scope="row">{link({ id: "scrap", slug: "scrap", name: { en: "Scrap", es: "Chatarra" } }, <>{icon("scrap", 28)}<span>{lang === "es" ? "Chatarra" : "Scrap"}</span></>)}</th>
                  <td>{num(r.scrap)}</td>
                  <td>{num(r.scrap)}</td>
                </tr>
              )}
              {r.out.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{link(o, <>{icon(o.id, 28)}<span>{say(o.name, lang)}</span></>)}</th>
                  {[r.eff.monument, r.eff.safezone].map((eff, i) => {
                    const y = recycleYield(o.amount, eff);
                    return <td key={i}>{y.kind === "fixed" ? num(y.n) : t.chance(y.pct)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ficha.loot.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.loot}</h2>
          <p className="rs-note">{t.lootNote}</p>
          <table className="rs-table">
            <tbody>
              {ficha.loot.map((l) => (
                <tr key={`${l.c}-${l.bp}`}>
                  <th scope="row">
                    {say(l.name, lang)}
                    {l.bp && <em className="rs-tag">{t.blueprint}</em>}
                  </th>
                  <td>{l.min === l.max ? `× ${num(l.min)}` : `× ${num(l.min)}–${num(l.max)}`}</td>
                  <td>{formatChance(l.chance, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ficha.shops.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.shops}</h2>
          <ul className="rs-shops">
            {ficha.shops.map((s, i) => (
              <li key={i}>
                <b>{say(s.shop, lang)}</b>
                <span>
                  {t.shopRow(s.amount, s.bp ? `${name} (${t.blueprint})` : name, s.price, say(s.currency.name, lang))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** 0,0123 → "1,2 %"; por debajo de 0,1 % se dice "< 0,1 %" en vez de un cero que miente. */
function formatChance(p: number, locale: string): string {
  if (p >= 0.995) return "100 %";
  if (p < 0.001) return `< ${(0.1).toLocaleString(locale)} %`;
  const pct = p * 100;
  return `${pct.toLocaleString(locale, { maximumFractionDigits: pct < 10 ? 1 : 0 })} %`;
}

/** Un dato con botón de copiar. Sin JS (el prerender) se ve el texto, que se puede seleccionar igual. */
function Copyable({ label, value }: { label: string; value: string }) {
  const t = useRustCopy().items;
  const [done, setDone] = useState(false);
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button
          type="button"
          className="rs-copy"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              window.setTimeout(() => setDone(false), 1500);
            }, () => undefined);
          }}
        >
          {done ? t.copied : t.copy}
        </button>
      </dd>
    </div>
  );
}
```

Nota: el test de los engranajes espera `>13<` y `>10<`, que son las celdas de fragmentos (13 al 50 %) y de chatarra (10). `num(13)` da "13" sin separador en los dos idiomas.

- [ ] **Step 8: Los estilos (`styles/rust-items.css`)**

```css
/*
 * Rust, pestaña Objetos (2026-10-05). Hereda las variables de `.rs` (rust.css). Casilleros del inventario, sin bordes de
 * color: lo activo va por tinte (verde oscuro con texto blanco, 5,6:1).
 */
.rs-search { display: block; margin: 0 0 12px; }
.rs-search input {
  width: 100%;
  max-width: 420px;
  margin-top: 6px;
  padding: 10px 12px;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  color: var(--rs-text);
  font: 400 17px/1.3 "Roboto Condensed", sans-serif;
}
.rs-cats { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 10px; }
.rs-cat {
  padding: 7px 12px;
  border: 0;
  background: rgba(255, 255, 255, 0.06);
  color: #bcb5ab;
  font: 700 13px/1.2 "Roboto Condensed", sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.rs-cat.is-on { background: #55702a; color: #fff; }
.rs-count-line, .rs-empty, .rs-note { margin: 0 0 10px; color: var(--rs-dim); font-size: 15px; }
.rs-missing { margin: 0 0 12px; padding: 10px 12px; background: var(--rs-red-tint); }

.rs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.rs-cell { display: flex; flex-direction: column; gap: 4px; height: 100%; color: inherit; text-decoration: none; }
.rs-cell .rs-slot { padding: 14px; }
.rs-cell-name { font-size: 14px; line-height: 1.2; color: var(--rs-soft); hyphens: manual; }
a.rs-cell:hover .rs-cell-name { color: #fff; }
a.rs-cell:hover .rs-slot { background: rgba(255, 255, 255, 0.12); }

.rs-ficha { display: grid; gap: 12px; }
.rs-back { justify-self: start; color: var(--rs-dim); text-decoration: none; font: 700 14px/1 "Roboto Condensed", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
.rs-back:hover { color: #fff; }
.rs-ficha-top { display: grid; grid-template-columns: 128px 1fr; gap: 18px; align-items: start; }
.rs-slot-big { width: 128px; padding: 12px; }
.rs-facts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 18px; margin: 0; }
.rs-facts dt { color: var(--rs-dim); font: 700 12px/1.2 "Roboto Condensed", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
.rs-facts dd { display: flex; gap: 8px; align-items: center; margin: 4px 0 0; }
.rs-facts code { padding: 3px 6px; background: rgba(0, 0, 0, 0.45); font-size: 14px; }
.rs-copy, .rs-btn {
  padding: 4px 8px;
  border: 0;
  background: rgba(255, 255, 255, 0.08);
  color: var(--rs-text);
  font: 700 12px/1.2 "Roboto Condensed", sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.rs-copy:hover, .rs-btn:hover { background: #55702a; color: #fff; }

.rs-ings, .rs-refs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rs-ings .rs-ref { display: flex; flex-direction: column; gap: 4px; width: 88px; font-size: 14px; line-height: 1.2; }
.rs-ings .rs-slot { width: 64px; padding: 10px; }
.rs-qty { position: absolute; right: 4px; bottom: 2px; font-size: 13px; text-shadow: 0 1px 2px #000; }
.rs-refs .rs-ref { display: flex; gap: 6px; align-items: center; padding: 4px 8px 4px 4px; background: var(--rs-slot); font-size: 15px; }
.rs-ref { color: inherit; text-decoration: none; }
a.rs-ref:hover { color: #fff; }
.rs-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 12px 0 0; color: var(--rs-soft); }

.rs-table { width: 100%; border-collapse: collapse; font-size: 15px; }
.rs-table th, .rs-table td { padding: 7px 8px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
.rs-table thead th { color: var(--rs-dim); font: 700 12px/1.2 "Roboto Condensed", sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
.rs-table th[scope="row"] { font-weight: 400; }
.rs-table th[scope="row"] .rs-ref { display: inline-flex; gap: 6px; align-items: center; }
.rs-table td { white-space: nowrap; }
.rs-tag { margin-left: 8px; padding: 1px 6px; background: rgba(255, 255, 255, 0.08); font-size: 12px; font-style: normal; text-transform: uppercase; }

.rs-shops { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.rs-shops li { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.rs-shops b { font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }

@media (max-width: 640px) {
  .rs-ficha-top { grid-template-columns: 80px 1fr; }
  .rs-slot-big { width: 80px; padding: 8px; }
  .rs-grid { grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); }
  .rs-table { font-size: 14px; }
  .rs-table td { white-space: normal; }
}
```

- [ ] **Step 9: Conectar (`Rust.tsx`, `route.ts`, `areas.ts`, `areaFiles.ts`, `entry-server.tsx`)**

9a. `site/src/route.ts`: `export const RUST_PUBLISHED: RustTab[] = ["items"];`

9b. `site/src/Rust.tsx` entero:

```tsx
/**
 * La sección Rust (2026-10-05): la barra del inventario y la página abierta. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Cada pestaña con página viaja en su chunk (`TABS`, y su archivo en `RUST_TAB_FILES` de areaFiles.ts). Las que
 * todavía no tienen (`RUST_PUBLISHED` en route.ts) se muestran apagadas y sin enlace, y una dirección a una de ellas
 * muestra la portada. Las de las etapas que vienen (Monumentos, Electricidad…) se anuncian igual, sin dirección. La
 * tipografía y la hoja de estilos viajan con este chunk: sólo las baja quien entra a Rust.
 */
import { Suspense, useEffect } from "react";
import home from "@rust/home.json";
import { lazyWithPreload } from "./lazyWithPreload";
import RouteLink from "./RouteLink";
import { parseRoute, registerRustSlugs, routePath, RUST_PUBLISHED, type Route, type RustSection } from "./route";
import { RUST_TABS, useRustCopy } from "./rustCopy";
import RsLoading from "./rust/RsLoading";
import RustHome from "./rust/RustHome";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/roboto-condensed/800.css";
import "./styles/rust.css";

// Los casilleros de la portada enlazan su ficha: sus slugs en español van con el área, así no hace falta bajar los de
// la pestaña Objetos para dibujar la portada.
registerRustSlugs({ items: Object.fromEntries(home.filter((h) => h.slugEs !== h.slug).map((h) => [h.slug, h.slugEs])) });

type Nav = (route: Route) => void;
type TabProps = { route: Route; navigate: Nav };

const RsItems = lazyWithPreload(() => import("./rust/items/RustItems"));

/** Las pestañas con página, cada una en su chunk. Una nueva suma su línea acá, en `RUST_TAB_FILES` y en `RUST_PUBLISHED`. */
const TABS: Partial<Record<RustSection, ReturnType<typeof lazyWithPreload<TabProps>>>> = { items: RsItems };

/**
 * Los datos que una pestaña baja aparte de su chunk, pedidos junto con él. En frío, `main.tsx` lee la dirección antes de
 * que la pestaña anote sus slugs en español: primero el chunk, y la ficha se busca con la dirección leída de nuevo.
 */
const TAB_DATA: Partial<Record<RustSection, (route: Route) => Promise<void>>> = {
  items: (route) =>
    Promise.all([RsItems.preload(), import("./rust/items/data")]).then(([, m]) => m.preloadItemsRoute(parseRoute(routePath(route)))),
};

/** Baja el chunk de la pestaña de una ruta de Rust, y sus datos (la portada ya viene con el área). */
export const preloadTab = (route: Route): Promise<void> => {
  const sec = route.rsSection ?? "home";
  return Promise.all([TABS[sec]?.preload(), TAB_DATA[sec]?.(route)]).then(() => undefined);
};

const isLive = (tab: RustSection) => tab === "home" || (RUST_PUBLISHED as RustSection[]).includes(tab);

export default function Rust({ route, navigate }: TabProps) {
  const section = route.rsSection ?? "home";
  const Tab = TABS[section];
  // Cambiar de pestaña o de ficha arranca arriba, como cambiar de página: un objeto del fondo de la lista abría su
  // ficha a la altura donde estaba el casillero.
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [section, route.detail]);
  return (
    <div className="rs">
      <Tabs route={route} navigate={navigate} />
      {Tab ? (
        <Suspense fallback={<RsLoading />}>
          <Tab route={route} navigate={navigate} />
        </Suspense>
      ) : (
        <RustHome route={route} navigate={navigate} />
      )}
    </div>
  );
}

/** La barra del inventario: las pestañas que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: TabProps) {
  const t = useRustCopy();
  const current = route.rsSection ?? "home";
  return (
    <div className="rs-tabs-band">
      <nav className="rs-tabs" aria-label="Rust">
        {RUST_TABS.map((tab) =>
          isLive(tab) ? (
            <RouteLink
              className={`rs-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "rust", rsSection: tab, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
            </span>
          ),
        )}
        {t.soonTabs.map((name) => (
          <span className="rs-tab is-soon" aria-disabled="true" title={t.soon} key={name}>
            {name}
          </span>
        ))}
      </nav>
    </div>
  );
}
```

Si `lazyWithPreload<TabProps>` como tipo no compila (`ReturnType` de un genérico), copiar la forma de `Zomboid.tsx` para su `TABS` (línea ~47); el tipo exacto no importa mientras `TABS[sec]?.preload()` y `<Tab route navigate />` compilen.

9c. `site/src/areas.ts`: reemplazar `export const RustArea = lazyWithPreload(() => import("./Rust"));` por:

```ts
const loadRust = () => import("./Rust");
export const RustArea = lazyWithPreload(loadRust);
```

y en `preloadRoute`, después de la línea de Zomboid:

```ts
  if (route.view === "rust") await loadRust().then((m) => m.preloadTab(route)).catch(() => undefined);
```

Actualizar el comentario de `preloadRoute`: "en Deadlock, Diablo II, Project Zomboid y Rust".

9d. `site/src/areaFiles.ts`: agregar debajo de `PZ_TAB_FILES` (importar `RustSection` del `import type` de route que ya existe):

```ts
/** Las pestañas de Rust que viajan en su propio chunk, igual que `TABS` en `Rust.tsx` (2026-10-05). */
export const RUST_TAB_FILES: Partial<Record<RustSection, string>> = {
  items: "src/rust/items/RustItems.tsx",
};
```

y en `filesFor`:

```ts
        : route.view === "zomboid"
          ? PZ_TAB_FILES[route.pzSection ?? "home"]
          : route.view === "rust"
            ? RUST_TAB_FILES[route.rsSection ?? "home"]
            : undefined;
```

En `vite.config.ts`, la línea `for (const file of [...Object.values(AREA_FILES), …, ...Object.values(PZ_TAB_FILES)]) chunkOf(file!);` suma `...Object.values(RUST_TAB_FILES)`, con el import correspondiente desde `./src/areaFiles`.

Si `test/areas.test.ts` compara `TABS` con los archivos (lo hace para Zomboid), sumar el caso de Rust con la misma forma que el de Zomboid.

9e. `site/src/entry-server.tsx`: agregar el import `import { preloadItemsRoute as preloadRsItemsRoute } from "./rust/items/data";` y en `preload`, después de la línea de Zomboid:

```ts
  if (route.view === "rust") return preloadRust(route, quiet);
```

y la función, debajo de `preloadZomboid`:

```ts
/**
 * Rust (2026-10-05): la lista de Objetos, o el archivo de la ficha (y la lista si la ficha no existe). Sin esto la
 * página sale con "cargando…" y sin un solo enlace; el prerender corta el build si pasa (`vite.config.ts`).
 */
async function preloadRust(route: Route, quiet: (p: Promise<unknown>) => Promise<unknown>): Promise<void> {
  if (route.rsSection === "items") await quiet(preloadRsItemsRoute(route));
}
```

- [ ] **Step 10: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustItems.test.ts test/rustColdLoad.test.ts test/rustRoute.test.ts test/rustHome.test.ts test/areas.test.ts test/rustSeo.test.ts`
Expected: PASS, salvo `rustSeo.test.ts` "las pestañas que todavía no se publicaron no entran", que ahora falla porque Objetos ya está publicada. Cambiar ese test por:

```ts
  it("Objetos entra; Raideo, que todavía no se publicó, no", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/rust/objetos");
    expect(paths).toContain("/en/rust/items");
    expect(paths.some((p) => p.startsWith("/es/rust/raideo") || p.startsWith("/en/rust/raid"))).toBe(false);
  });
```

y volver a correr. Después: `npx tsc --noEmit -p .` sin errores nuevos.

- [ ] **Step 11: Ver en localhost**

Levantar el servidor `vestigo-rust` (`preview_start` con `{name: "vestigo-rust"}`). Abrir:
- `http://localhost:5179/es/rust/objetos`;
- `/es/rust/objetos/fusil-de-asalto`;
- `/en/rust/items/gears`.

Revisar con `read_console_messages` que no haya errores. Con `read_page`, que estén las secciones. Sacar una captura de la ficha del AK.

- [ ] **Step 12: Commit**

```bash
git add site/src/rust site/src/useLoad.ts site/src/zomboid/ui.tsx site/src/styles/rust-items.css site/src/Rust.tsx site/src/rustCopy.ts site/src/route.ts site/src/areas.ts site/src/areaFiles.ts site/src/entry-server.tsx site/vite.config.ts site/test/rustItems.test.ts site/test/rustColdLoad.test.ts site/test/rustRoute.test.ts site/test/rustHome.test.ts site/test/rustSeo.test.ts site/test/areas.test.ts
git commit -m "feat(rust): la pestaña Objetos, con la lista, la ficha y la dirección en español en frío"
```

---

### Task 6: La portada: h1 buscable, buscador y casilleros enlazados

**Files:**
- Create: `site/src/rust/RustSearch.tsx`
- Modify: `site/src/rust/RustHome.tsx`
- Modify: `site/src/rustCopy.ts`
- Modify: `site/src/styles/rust.css`
- Modify: `site/test/rustHome.test.ts`

**Interfaces:**
- Consumes: `loadList`, `peekList` y `ListRow` de `rust/items/data.ts`; `filterRows` de `rust/items/filter.ts`.
- Produces: `RustCopy.home.h1: string`, `RustCopy.home.searchLabel: string` y el componente `RustSearch`.

- [ ] **Step 1: Escribir los tests que fallan**

En `site/test/rustHome.test.ts`:
- en "dice qué hay, con las cifras de los datos, en español", reemplazar `expect(html).toContain("Guía de Rust en español");` por:

```ts
    expect(html).toMatch(/<h1[^>]*>Guía de Rust en español<\/h1>/);
    expect(html).toContain('type="search"');
```

- y agregar:

```ts
  it("en inglés, el h1 dice lo que se busca", () => {
    expect(render("en", "/en/rust")).toMatch(/<h1[^>]*>Rust Guide: Items, Crafting &amp; Raids<\/h1>/);
  });

  it("los casilleros enlazan la ficha de cada objeto con su slug en español", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(html).toContain('href="/es/rust/objetos/azufre"');
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustHome.test.ts`
Expected: FAIL (h1 dice "Rust", no hay buscador). El de los casilleros ya puede pasar si Task 5 publicó Objetos.

- [ ] **Step 3: Textos**

En `rustCopy.ts`, `home` suma `h1` y `searchLabel` (agregarlos también a la interfaz):
- EN: `h1: "Rust Guide: Items, Crafting & Raids"`, `searchLabel: "Find an item"`;
- ES: `h1: "Guía de Rust en español"`, `searchLabel: "Buscar un objeto"`;
- `kicker` queda igual en los dos idiomas: `"Rust"`. Antes decía "Guía de Rust en español", que pasa al h1.

- [ ] **Step 4: El buscador (`rust/RustSearch.tsx`)**

```tsx
/**
 * El buscador de la portada de Rust (2026-10-05): escribe y te lleva a la ficha. La lista se pide recién al enfocar el
 * campo (no viaja con la portada); hasta ocho resultados, con Enter abre el primero. En el prerender es sólo el campo.
 */
import { useState } from "react";
import { useLang } from "../i18n";
import RouteLink from "../RouteLink";
import type { Route } from "../route";
import { useRustCopy } from "../rustCopy";
import { loadList, peekList, type ListRow } from "./items/data";
import { filterRows } from "./items/filter";

type Nav = (r: Route) => void;

export default function RustSearch({ route, navigate }: { route: Route; navigate: Nav }) {
  const c = useRustCopy();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(() => peekList()?.rows ?? null);
  const want = () => {
    if (!rows) loadList().then((l) => setRows(l.rows), () => undefined);
  };
  const hits = rows && query.trim() ? filterRows(rows, null, query).slice(0, 8) : [];
  const to = (r: ListRow): Route => ({ ...route, view: "rust", rsSection: "items", detail: r.slug });
  return (
    <form
      className="rs-find"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (hits[0]) navigate(to(hits[0]));
      }}
    >
      <label>
        <span className="rs-hd">{c.home.searchLabel}</span>
        <input type="search" value={query} placeholder={c.items.searchPlaceholder} onFocus={want} onChange={(e) => (want(), setQuery(e.target.value))} />
      </label>
      {hits.length > 0 && (
        <ul className="rs-find-hits">
          {hits.map((r) => (
            <li key={r.id}>
              <RouteLink className="rs-ref" to={to(r)} onNavigate={navigate}>
                <img src={`/rust/items/${r.id}.webp`} alt="" width={28} height={28} />
                <span>{(lang === "es" && r.es) || r.en}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
```

- [ ] **Step 5: La portada (`rust/RustHome.tsx`)**

- `<h1 className="rs-h1">Rust</h1>` pasa a `<h1 className="rs-h1">{t.h1}</h1>`.
- Debajo del `<p className="rs-lede">…</p>`, agregar `<RustSearch route={route} navigate={navigate} />` con su import (`import RustSearch from "./RustSearch";`).
- Los casilleros ya enlazan cuando `isLive("items")`, así que no hace falta tocarlos. Sí se saca el `title={name}` del `RouteLink` del casillero: el nombre ya está en el `alt` de la imagen, que es lo que lee un lector de pantalla, y con los dos lo anunciaba dos veces.

En `rust.css`, como el h1 ahora es largo, achicar su escala: `.rs-h1 { font: 800 clamp(30px, 8cqi, 52px)/1.05 … }`. Las palabras no se cortan: el `container-type` de `.rs-title` ya está. Sumar el estilo del buscador:

```css
.rs-find { position: relative; margin: 0 0 18px; }
.rs-find input {
  width: 100%;
  max-width: 420px;
  margin-top: 6px;
  padding: 10px 12px;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  color: var(--rs-text);
  font: 400 17px/1.3 "Roboto Condensed", sans-serif;
}
.rs-find-hits { display: grid; gap: 2px; max-width: 420px; margin: 4px 0 0; padding: 0; list-style: none; }
.rs-find-hits .rs-ref { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: rgba(0, 0, 0, 0.55); color: inherit; text-decoration: none; }
.rs-find-hits .rs-ref:hover { background: #55702a; color: #fff; }
```

- [ ] **Step 6: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustHome.test.ts test/rustItems.test.ts`
Expected: PASS.

- [ ] **Step 7: Ver en localhost**

En `http://localhost:5179/es/rust`, escribir "fusil" en el buscador. Tiene que aparecer "Fusil de asalto", y con Enter abrir la ficha. Probar el celular en el panel Browser (`resize_window` preset `mobile`, **sólo** en el panel de la app, nunca en el Chrome de ZoTaD): el h1 no se corta en medio de una palabra y no hay scroll horizontal. Volver a `desktop` al terminar.

- [ ] **Step 8: Commit**

```bash
git add site/src/rust/RustSearch.tsx site/src/rust/RustHome.tsx site/src/rustCopy.ts site/src/styles/rust.css site/test/rustHome.test.ts
git commit -m "feat(rust): la portada con el h1 que se busca, el buscador de objetos y los casilleros enlazados"
```

---

### Task 7: SEO: fichas en el sitemap, `<head>`, JSON-LD, vista previa propia

**Files:**
- Modify: `site/src/sitemap.ts`
- Modify: `site/src/prerender.ts`
- Modify: `site/src/PageMeta.tsx`
- Modify: `site/vite.config.ts`
- Modify: `games/rust/tools/ui.py`
- Create (salida): `site/public/rust/og.jpg`
- Modify: `site/test/rustSeo.test.ts`

**Interfaces:**
- Consumes: `games/rust/data/site/list.json` y `slugs-es.json` (Task 3), `RUST_COPY[lang].detailSeo` (Task 5), `peekItem` y `loadItem` (Task 4).
- Produces:
  - `RustSitemapData.items?: { slug: string; en: string; es: string | null }[]`;
  - `ogImageUrl` devuelve `/rust/og.jpg` para toda la sección.

- [ ] **Step 1: Escribir los tests que fallan**

En `site/test/rustSeo.test.ts`, cambiar el `data` de arriba por uno con fichas, y registrar los slugs como lo hace el build:

```ts
import list from "../../games/rust/data/site/list.json";
import slugsEs from "../../games/rust/data/site/slugs-es.json";
import { parseRoute, registerRustSlugs } from "../src/route";
import { jsonLdFor, ogImageUrl } from "../src/prerender";

registerRustSlugs(slugsEs);

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: list.rows.map((r) => ({ slug: r.slug, en: r.en, es: r.es })) },
  dates: { rust: rsMeta.extractedAt },
} as unknown as SitemapData;
```

(Fusionar estos imports con los que ya tiene el archivo: `parseRoute` ya se importa.) Y agregar:

```ts
  it("cada ficha entra al sitemap con su slug en cada idioma", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/rust/items/assault-rifle");
    expect(paths).toContain("/es/rust/objetos/fusil-de-asalto");
    expect(paths.filter((p) => p.startsWith("/es/rust/objetos/")).length).toBe(list.rows.length);
  });

  it("la ficha lleva el nombre del objeto en el título y migas hasta él", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/rust/objetos/fusil-de-asalto")!;
    expect(page.title).toMatch(/^Fusil de asalto — Rust/);
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/rust/items/assault-rifle" });
    const crumbs = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] };
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Vestigo", "Rust", "Objetos", "Fusil de asalto"]);
  });

  it("la portada se presenta como aplicación web gratuita", () => {
    const route = parseRoute("/es/rust");
    const ld = jsonLdFor(route, "es", { title: "t", description: "d", canonical: "https://vestigo.gg/es/rust", image: "i" }, data, null);
    expect(ld).toContainEqual(expect.objectContaining({ "@type": "WebApplication", isAccessibleForFree: true }));
  });

  it("toda la sección usa su propia vista previa", () => {
    expect(ogImageUrl(parseRoute("/es/rust"))).toBe("https://vestigo.gg/rust/og.jpg");
    expect(ogImageUrl(parseRoute("/en/rust/items/assault-rifle"))).toBe("https://vestigo.gg/rust/og.jpg");
  });
```

- [ ] **Step 2: Correr y verlos fallar**

Run (desde `site/`): `npx vitest run test/rustSeo.test.ts`
Expected: FAIL (no hay fichas en el sitemap, título sin nombre, sin `WebApplication`, OG genérica).

- [ ] **Step 3: `sitemap.ts`**

- `RustSitemapData` suma:

```ts
  /** Las fichas de Objetos (`games/rust/data/site/list.json`): slug inglés y nombres, para el sitemap y el `<head>`. */
  items?: { slug: string; en: string; es: string | null }[];
```

- En `sitemapPaths`, en el bloque de Rust, después de las pestañas:

```ts
      if (RUST_PUBLISHED.includes("items")) {
        for (const it of data.rs.items ?? []) paths.push(routePath({ ...base, lang, view: "rust", rsSection: "items", detail: it.slug }));
      }
```

- [ ] **Step 4: `prerender.ts`**

4a. `detailNames`, antes del `return out;`:

```ts
  for (const e of data.rs?.items ?? []) out[`rs-items/${e.slug}`] = lang === "es" ? e.es || e.en : e.en;
```

4b. En `prerenderPages`, en la cadena de `detailKey`, antes del `: null` final:

```ts
                : route.view === "rust"
                  ? `rs-${route.rsSection ?? "home"}/${route.detail}`
```

4c. `metaFor`: reemplazar la línea de Rust por:

```ts
  // Rust (2026-10-05): la portada, cada pestaña y cada ficha de Objetos. Una ficha sin nombre todavía (el archivo no
  // llegó al navegador) lleva el de su pestaña.
  if (route.view === "rust") {
    const r = RUST_COPY[lang];
    if (route.rsSection === "items" && route.detail && detailName) return r.detailSeo(detailName);
    return r.seo[route.rsSection ?? "home"];
  }
```

4d. `jsonLdFor`, el bloque de Rust entero:

```ts
  if (route.view === "rust") {
    // Vestigo › Rust › pestaña › ficha. La portada, además, como aplicación web gratuita (el buscador, la cuenta del
    // wipe y las herramientas), con el nombre de la guía.
    const sec = route.rsSection ?? "home";
    const trail = [{ name: brand, url: home }, { name: "Rust", url: routeUrl({ ...route, rsSection: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: RUST_COPY[lang].tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    const out: object[] = trail.length > 2 ? [crumbs(trail)] : [];
    if (sec === "home") {
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication", name: RUST_COPY[lang].home.h1, description: page.description,
        url: page.canonical, applicationCategory: "GameApplication", operatingSystem: "Any", inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, about: { "@type": "VideoGame", name: "Rust" },
      });
    }
    return out;
  }
```

4e. `ogImageUrl`, después de la línea de Diablo II:

```ts
  // Rust tiene la suya (un cuadro del juego con el título, `games/rust/tools/ui.py`).
  if (route.view === "rust") return `${SITE_ORIGIN}/rust/og.jpg`;
```

- [ ] **Step 5: `PageMeta.tsx` (el `<head>` al navegar)**

- Import: `import { loadItem as loadRsItem, peekItem as peekRsItem } from "./rust/items/data";`.
- En `dlDetailName`, antes del `return null;` final:

```ts
  if (route.view === "rust" && route.rsSection === "items" && route.detail) {
    const f = peekRsItem(route.detail);
    return f ? (lang === "es" ? f.name.es || f.name.en : f.name.en) : null;
  }
```

- En el `useEffect`, después del bloque de Zomboid:

```ts
    // Y para una ficha de Rust, con el archivo de la ficha (que la pestaña ya pidió).
    if (route.view === "rust" && route.rsSection === "items" && route.detail && !peekRsItem(route.detail)) {
      let vivo = true;
      loadRsItem(route.detail).then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
```

- [ ] **Step 6: `vite.config.ts`**

6a. En `readSitemapData`, el bloque de Rust pasa a ser:

```ts
  // Rust (2026-10-05): el sello del extractor y las fichas de Objetos. Sin el sello, la sección queda afuera del sitemap;
  // sin la lista (site_data.py sin correr), sin fichas. Los slugs en español se anotan antes de armar ninguna dirección.
  let rs: SitemapData["rs"];
  try {
    const m = JSON.parse(readFileSync(`${rustDir}/meta.json`, "utf-8"));
    let items: RustSitemapData["items"];
    try {
      const list = JSON.parse(readFileSync(`${rustDir}/site/list.json`, "utf-8")) as { rows: { slug: string; en: string; es: string | null }[] };
      items = list.rows.map(({ slug, en, es }) => ({ slug, en, es }));
      registerRustSlugs(JSON.parse(readFileSync(`${rustDir}/site/slugs-es.json`, "utf-8")));
    } catch {
      items = undefined;
    }
    rs = { build: m.build, extractedAt: m.extractedAt, items };
  } catch {
    rs = undefined;
  }
```

Con los imports `registerRustSlugs` (de `./src/route`) y `type RustSitemapData` (de `./src/sitemap`), junto a los que ya trae el archivo.

6b. En `prerenderRoutes`, al lado de la guardia de Zomboid:

```ts
          if (route.view === "rust" && cuerpo.includes("rs-loading")) {
            throw new Error(`prerender: ${page.path} salió con la hoja de "cargando…" en vez de sus datos.`);
          }
```

- [ ] **Step 7: La vista previa (`ui.py` → `site/public/rust/og.jpg`)**

Run: `python -m pip install fonttools brotli`
Expected: instalado (o "already satisfied").

En `games/rust/tools/ui.py`, agregar debajo de `BLUR = 6`:

```python
OG = Path(__file__).resolve().parents[3] / "site" / "public" / "rust" / "og.jpg"
# La tipografía de la sección (Roboto Condensed 800, OFL), la misma que baja el sitio: Pillow no lee woff2, así que se
# pasa a TTF en memoria con fontTools.
FONT_WOFF2 = Path(__file__).resolve().parents[3] / "site" / "node_modules" / "@fontsource" / "roboto-condensed" / "files" / "roboto-condensed-latin-800-normal.woff2"


def og_image(frame: Image.Image) -> None:
    """La vista previa de 1200×630: el cuadro del menú oscurecido, "RUST" grande y la bajada, en el estilo del HUD."""
    import io

    from fontTools.ttLib import TTFont
    from PIL import ImageDraw, ImageEnhance, ImageFont

    ttf = io.BytesIO()
    font = TTFont(str(FONT_WOFF2))
    font.flavor = None
    font.save(ttf)
    big = ImageFont.truetype(io.BytesIO(ttf.getvalue()), 190)
    small = ImageFont.truetype(io.BytesIO(ttf.getvalue()), 44)

    w, h = 1200, 630
    im = frame.copy()
    scale = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - w) // 2, (im.height - h) // 2
    im = ImageEnhance.Brightness(im.crop((left, top, left + w, top + h))).enhance(0.45)
    draw = ImageDraw.Draw(im)
    draw.rectangle((60, 150, 760, 480), fill=(30, 30, 28))
    draw.text((95, 165), "RUST", font=big, fill=(226, 219, 211))
    draw.text((100, 380), "ITEMS · CRAFTING · RAIDS", font=small, fill=(163, 157, 147))
    draw.rectangle((60, 500, 300, 512), fill=(108, 142, 54))
    draw.text((60, 540), "vestigo.gg", font=small, fill=(226, 219, 211))
    im.save(OG, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{OG.name}: {w}x{h}, {OG.stat().st_size // 1024} KB")
```

En `main()`, dentro del `for`, después de `im = Image.open(png).convert("RGB")` y antes del `thumbnail`, guardar una copia sin desenfocar para la vista previa (`sharp = im.copy()`). Al final del `for`, si `name == "outpost"`, llamar `og_image(sharp)`. Ojo: el panel oscuro va opaco porque Pillow no mezcla `rgba` con `draw.rectangle` sobre RGB. El tono es el del panel (`#1e1e1c`).

Run: `python games/rust/tools/ui.py`
Expected: `outpost.webp: …` y `og.jpg: 1200x630, ~80–150 KB`. Abrir `site/public/rust/og.jpg` con Read para mirarla. Que "RUST" entre entero en el panel; si se sale, bajar `big` a 170.

- [ ] **Step 8: Correr los tests**

Run (desde `site/`): `npx vitest run test/rustSeo.test.ts test/rustItems.test.ts test/rustHome.test.ts test/rustRoute.test.ts`
Expected: PASS. `npx tsc --noEmit -p .` sin errores nuevos.

- [ ] **Step 9: Commit**

```bash
git add site/src/sitemap.ts site/src/prerender.ts site/src/PageMeta.tsx site/vite.config.ts games/rust/tools/ui.py site/public/rust/og.jpg site/test/rustSeo.test.ts
git commit -m "feat(rust): cada ficha de Objetos en el sitemap y el <head>, la portada como aplicación web y su vista previa"
```

---

### Task 8: Build, prerender y revisión en celular

**Files:**
- Ninguno nuevo. Arreglos chicos donde haga falta.

- [ ] **Step 1: Todos los tests**

Run (desde la raíz): `python -m unittest discover -s games/rust/tools/tests -v`
Expected: PASS.

Run (desde `site/`): `npx vitest run`
Expected: PASS, salvo `deadlock.test.ts` y `deadlockBuilds.test.ts` (ajenos, ver Global Constraints).

- [ ] **Step 2: Build completo**

Run (desde `site/`): `npm run build`
Expected:
- termina sin error y dice `Prerenderizadas N rutas`, con N ≈ 22.222 + 2 × 1.032 + 2 (las listas);
- ninguna página corta por la guardia de "cargando…".

Si se queda sin memoria, correrlo con `NODE_OPTIONS=--max-old-space-size=6144` (Netlify ya tiene 6 GB desde Zomboid).

Run: `grep -c "<loc>" site/dist/sitemaps/rust.xml`
Expected: 2 + 2 + 2 × 1.032 = 2.068.

Run: `grep -o '<h1[^>]*>[^<]*' site/dist/es/rust/objetos/fusil-de-asalto.html; grep -c 'href="/es/rust/objetos/' site/dist/es/rust/objetos.html`
Expected: el h1 "Fusil de asalto" y más de 1.000 enlaces en la lista.

- [ ] **Step 3: Peso**

Run: `ls -la site/dist/assets | grep -iE "RustItems|list-|rust" | head -20`
Expected:
- el chunk de la pestaña no trae la lista ni las fichas (pesa decenas de KB, no cientos);
- la lista y cada archivo de fichas van en chunks aparte.

- [ ] **Step 4: Revisión visual (localhost)**

Con el servidor `vestigo-rust` (`preview_start`), en el panel Browser de la app (nunca en el Chrome de ZoTaD):
- escritorio: `/es/rust`, `/es/rust/objetos` (filtrar por Armas, buscar "azufre"), `/es/rust/objetos/fusil-de-asalto`, `/en/rust/items/gears`, `/es/rust/objetos/chatarra`;
- celular (`resize_window` preset `mobile`), las mismas páginas:
  - sin scroll horizontal: `document.documentElement.scrollWidth <= innerWidth` con `javascript_tool`;
  - las categorías bajan de fila;
  - la tabla de reciclaje entra;
  - ningún título corta una palabra;
- volver a `desktop`;
- `read_console_messages` sin errores;
- capturas de la lista y de la ficha del AK en los dos tamaños, para mostrarle a ZoTaD.

- [ ] **Step 5: Registrar el avance**

En `.superpowers/sdd/progress.md`, agregar al final:

```markdown
# Progreso: docs/superpowers/plans/2026-10-05-rust-objetos.md
Plan 2 (Objetos): completo. Build OK (N rutas), sitemap rust 2.068 URLs. Pendiente: plan 3 (Raideo); a main cuando ZoTaD lo pida.
```

(con N real).

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore(rust): la pestaña Objetos revisada en build y en celular"
```

Y avisarle a ZoTaD con las capturas: la pestaña está en localhost:5179. **No** se sube a `main`.
