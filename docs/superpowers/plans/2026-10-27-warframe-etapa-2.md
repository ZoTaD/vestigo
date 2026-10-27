# Warframe etapa 2 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sumar a la sección Warframe cuatro pestañas: Mapa estelar (con ficha por nodo), Maestría (lista para tildar),
Prime Vault (con historial) y Baro Ki'Teer (en vivo + historial guardado por una Action).

**Architecture:** `games/warframe/tools/site_data.py` suma tres salidas (`star-chart`, `mastery`, `prime-vault`) con el
mismo formato que la etapa 1 (lista liviana + fichas partidas por hash). `tools/baro.py` es aparte: lee la API de
warframestat y anota visitas en `data/baro/history.json`. En el sitio cada pestaña viaja en su chunk
(`site/src/warframe/<pestaña>/`), con sus textos en `warframeCopy.ts` y sus tipos/cargas en `warframe/data.ts`.

**Tech Stack:** Python 3 (stdlib + unittest), Vite + React + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-warframe-design.md`, sección "Etapa 2" (leela entera antes de cada tarea).

## Global Constraints

- Todo en español rioplatense: código, comentarios, commits. Mirá cómo comenta el código vecino y escribí igual.
- Commits escuetos: título + 2–4 viñetas, sin planes, IDs ni tráfico.
- No inventar datos: lo que no está en el export, la tabla de drops o la API no se muestra.
- Sin bordes de color en tarjetas ni filas (tinte, texto o cifra). Sin logos de Digital Extremes.
- Los títulos no cortan palabras: se achican con container queries, nunca `overflow-wrap: anywhere`.
- Listas de más de ~150 filas con `LazyRows` (`site/src/LazyRows.tsx`), `rowHeight` medido en el navegador.
- Imágenes de lista con `loading="lazy"`, `decoding="async"` y tamaño fijo (usar `Icon` de `warframe/ui.tsx`).
- Datos nunca en el chunk de entrada: cada JSON con `import()`; los JSON se importan enteros.
- `localStorage` siempre dentro de try/catch; la página anda igual sin almacenamiento.
- La clave de cada pestaña es su segmento inglés: `"star-chart"`, `"mastery"`, `"prime-vault"`, `"baro"`; en español
  `mapa-estelar`, `maestria`, `prime-vault`, `baro`.
- **Nunca dos builds a la vez** y no correr `npm run build` en las tareas 1–6 (sólo la tarea 7). Los tests de Python
  leen `games/warframe/raw/` (ya bajado); correrlos uno por vez.
- Tests Python: `python -m unittest discover -s games/warframe/tools/tests`. Tests del sitio: `cd site && npx vitest run <archivos>`; `npx tsc -b` para tipos.
- El servidor de la rama es `vestigo-warframe-2` (puerto 5236) en `.claude/launch.json`: cada pestaña se prueba ahí apenas anda.

## Review Focus

- Un nodo cuyo nombre aparece en dos planetas (o un nodo sin tabla de drops): slug único y ficha que dice "sin tabla", sin romper. → test en Tarea 1.
- Maestría con `localStorage` lleno, bloqueado o con basura (JSON roto, slugs que ya no existen): la página carga y los ignora. → test en Tarea 5.
- Baro fuera de su visita, con inventario vacío, o con la API caída: el bloque en vivo se oculta o dice cuándo llega; el historial sigue. → tests en Tareas 2 y 6.
- Un Prime cuyas partes no aparecen en ninguna reliquia (fundadores): estado `norelics`, nunca "Vault". → test en Tarea 1.
- Una ficha en español abierta en frío (`/es/warframe/mapa-estelar/<slugEs>`): resuelve por `es/NN.json` como las demás. → test en Tarea 3.

---

### Task 1: Datos de Mapa estelar, Maestría y Prime Vault (`site_data.py`)

**Files:**
- Modify: `games/warframe/tools/site_data.py`
- Test: `games/warframe/tools/tests/test_site_data.py`
- Regenerate: `games/warframe/data/` (`python games/warframe/tools/site_data.py`)

**Interfaces:**
- Produces (archivos, todos JSON compacto como los de la etapa 1):
  - `star-chart/list.json`: `[{slug, slugEs, name: [en,es], planet: [en,es], pi: int, type: str, faction: str, lv: [min,max], mr: int, dark: bool, best: {name: [en,es], chance: float} | null}]` en orden `systemIndex` y después el orden del export. `type` y `faction` son las claves inglesas de `MISSION_TYPES`/`FACTIONS`. `best`: el objeto de menor chance de la última rotación (C si hay, si no la única).
  - `star-chart/f/NN.json`: ficha `{slug, slugEs, name, planet, pi, type, faction, lv, mr, dark, rewards: [{label: str|null, rot: str|null, items: [{ref: str, chance: float}]}], resources: [refKey], refs}`. `label` es el paréntesis de la tabla de drops cuando no es el tipo del nodo ("Caches"), con " Extra" si la fila lo trae; `items` de mayor a menor chance; `resources` son las claves en `refs` de los recursos de Dónde farmear cuyo `planets` incluye el planeta (por nombre inglés), ordenados por nombre.
  - `star-chart/es/NN.json`: `{slugEs: slug}` como las otras pestañas.
  - `mastery/list.json`: `[{slug, slugEs, name, img, kind, rank: 30|40, xp: int}]`; `kind` es el del Arsenal salvo `"necramech"` para `productCategory == "MechSuits"`.
  - `prime-vault/list.json`: `[{slug, slugEs, name, img, kind, status: "available"|"vaulted"|"partial"|"norelics"}]` para cada fila del Arsenal con `prime: true`.
  - `prime-vault/history.json`: `[{date: "YYYY-MM-DD", slug, from: status|null, to: status}]`, lo más nuevo primero.
  - Las fuentes `k: "mission"` de **todas** las fichas (arsenal, relics, farming, mods) ganan `node: "node:<slug>"` cuando su `where` es un nodo de `ExportRegions`, y esa clave entra en `refs` con `tab: "star-chart"`.
  - `meta.json` `counts` suma `"star-chart"`, `"mastery"`, `"prime-vault"`.

- [ ] **Step 1: Tests que fallan** (en `TestSiteData`, usando `self.out = site_data.build(write=False)`; `build` devuelve las nuevas pestañas en `out["lists"]` y `out["fichas"]["star-chart"]`):

```python
def test_mapa_269_nodos_con_tipo_y_faccion(self):
    L = self.out["lists"]["star-chart"]
    self.assertEqual(len(L), 269)
    self.assertTrue(all(n["type"] in site_data.MISSION_TYPES.values() for n in L))
    self.assertTrue(all(n["faction"] in site_data.FACTIONS.values() for n in L))
    self.assertEqual(len({n["slug"] for n in L}), 269)
    self.assertEqual(len({n["slugEs"] for n in L}), 269)

def test_nodo_hydron(self):
    f = self.out["fichas"]["star-chart"]["hydron"]
    self.assertEqual((f["planet"][0], f["type"], f["faction"]), ("Sedna", "Defense", "Grineer"))
    self.assertEqual([r["rot"] for r in f["rewards"]], ["A", "B", "C"])
    self.assertTrue(all(it["ref"] in f["refs"] for r in f["rewards"] for it in r["items"]))

def test_nodo_sin_tabla(self):  # Mercury/M Prime es Exterminio: sin recompensas propias
    f = self.out["fichas"]["star-chart"]["m-prime"]
    self.assertEqual(f["rewards"], [])

def test_fuentes_de_mision_enlazan_al_nodo(self):
    fi = next(fi for fi in self.out["fichas"]["relics"].values() if any(s.get("node") for s in fi["sources"]))
    for s in fi["sources"]:
        if s.get("node"):
            self.assertEqual(fi["refs"][s["node"]]["tab"], "star-chart")

def test_maestria(self):
    M = {m["slug"]: m for m in self.out["lists"]["mastery"]}
    self.assertEqual((M["excalibur"]["rank"], M["excalibur"]["xp"]), (30, 6000))
    self.assertEqual((M["braton"]["rank"], M["braton"]["xp"]), (30, 3000))
    self.assertEqual((M["kuva-brakk"]["rank"], M["kuva-brakk"]["xp"]), (40, 4000))
    self.assertEqual((M["voidrig"]["kind"], M["voidrig"]["xp"]), ("necramech", 8000))
    self.assertFalse(any(m["kind"] == "exalted" for m in M.values()))

def test_prime_vault(self):
    V = {v["slug"]: v["status"] for v in self.out["lists"]["prime-vault"]}
    self.assertEqual(V["excalibur-prime"], "norelics")
    self.assertTrue(set(V.values()) >= {"available", "vaulted"})

def test_historial_vault(self):
    prev = [{"slug": "a", "status": "available"}, {"slug": "b", "status": "vaulted"}]
    new = [{"slug": "a", "status": "vaulted"}, {"slug": "b", "status": "vaulted"}, {"slug": "c", "status": "available"}]
    h = site_data.vault_history(prev, new, [{"date": "2026-10-01", "slug": "z", "from": None, "to": "vaulted"}], "2026-10-27")
    self.assertEqual(h[:2], [{"date": "2026-10-27", "slug": "a", "from": "available", "to": "vaulted"},
                             {"date": "2026-10-27", "slug": "c", "from": None, "to": "available"}])
    self.assertEqual(h[2]["slug"], "z")
    self.assertEqual(site_data.vault_history(None, new, [], "2026-10-27"), [])  # primera corrida: sin eventos
```

(Si algún slug de los tests no existe tal cual, buscá el real en los datos y ajustá el test, no la regla.)

- [ ] **Step 2: Correr y ver que fallan** — `python -m unittest discover -s games/warframe/tools/tests -k mapa -k nodo -k maestria -k vault -k fuentes` → FAIL.

- [ ] **Step 3: Implementar en `site_data.py`**
  - `MISSION_TYPES: dict[int, str]` y `FACTIONS: dict[int, str]` (constantes con comentario "fijado cruzando la tabla de drops y solNodes.json de warframe-worldstate-data"):
    `MISSION_TYPES = {0: "Assassination", 1: "Exterminate", 2: "Survival", 3: "Rescue", 4: "Sabotage", 5: "Capture", 7: "Spy", 8: "Defense", 9: "Mobile Defense", 13: "Interception", 14: "Hijack", 15: "Hive", 17: "Excavation", 21: "Infested Salvage", 22: "Arena", 24: "Pursuit", 25: "Rush", 26: "Assault", 27: "Defection", 28: "Free Roam", 31: "The Circuit", 33: "Disruption", 34: "Void Flood", 35: "Void Cascade", 36: "Void Armageddon", 38: "Alchemy", 40: "Legacyte Harvest", 41: "Shrine Defense", 42: "Faceoff", 43: "Descent", 44: "The Perita Rebellion", 45: "Relay"}`;
    `FACTIONS = {0: "Grineer", 1: "Corpus", 2: "Infested", 3: "Orokin", 5: "Sentient", 7: "The Murmur", 8: "Scaldra", 9: "Techrot", 10: "Duviri", 11: "Anarchs"}`. Un índice que no está → `ValueError` con el nodo (lo nuevo de un parche rompe el build de datos, no la página).
  - Nodos ↔ tabla de drops: la clave de `drops.missions()` es `where` = `"Planeta/Nodo (Tipo)"` o `"... (Tipo) Extra"`; se cruza con `(systemName, name)` en casefold. Las filas que no son nodos (eventos, Proxima, Duviri sin fin) se ignoran.
  - Slugs de nodo: `slugify(nombre)`; si choca, `<nombre>-<planeta>` (con `_unico`). Español igual con los nombres `_es`.
  - Referencias de los ítems de recompensa con `R.de_nombre(item)` (las reliquias de la tabla de misiones vienen como "Lith A1 Relic": resolvelas con `R.de_reliquia` cuando la clave sin " Relic" está en `por_reliquia`).
  - Maestría: rango = `maxLevelCap` del export, o 40 si `MechSuits`, o 30; xp = rango × (200 si warframe/archwing/companion/necramech, 100 si arma). Afuera `exalted` y `productCategory == "SpecialItems"`.
  - Vault: para cada Prime, por parte (no el plano principal si no tiene fuentes de reliquia… usá `parts` que ya trae `sources`): la parte está "abierta" si alguna fuente `relic` tiene `vaulted == False`. Todas abiertas → `available`; ninguna parte con fuente relic → `norelics`; ninguna abierta → `vaulted`; si no → `partial`.
  - `vault_history(prev: list|None, new: list, history: list, today: str) -> list` pura: `prev is None` → devuelve `history` tal cual; si no, eventos por cada slug nuevo o con estado distinto (orden de `new`), delante del historial previo.
  - En `main()`/`escribir`: leer `prime-vault/list.json` y `history.json` previos de `DATA` si existen antes de escribir, y escribir el historial. `TABS` suma `"star-chart"` (las otras dos no tienen fichas: escribirlas aparte en `archivos()`).
- [ ] **Step 4: Correr todos los tests de Python** → PASS (los de la etapa 1 también).
- [ ] **Step 5: Regenerar** `python games/warframe/tools/site_data.py` y revisar que `git status` sólo muestre archivos de `data/` nuevos o con el campo `node` agregado.
- [ ] **Step 6: Commit** `feat(warframe): datos del mapa estelar, maestría y Prime Vault`.

---

### Task 2: Historial de Baro (`baro.py` + Action)

Puede correr en paralelo con la Tarea 1 (no toca `site_data.py`).

**Files:**
- Create: `games/warframe/tools/baro.py`, `games/warframe/tools/tests/test_baro.py`, `games/warframe/data/baro/history.json` (`{"visits": []}`), `.github/workflows/publish-baro.yml`

**Interfaces:**
- Produces `data/baro/history.json`: `{"visits": [{"start": iso, "end": iso, "location": [en,es], "items": [{"unique": str, "name": [en,es], "ducats": int, "credits": int, "ref": {"tab","slug","slugEs","img"} | null}]}]}`, la visita más nueva primero.
- Funciones: `parse_visit(en: dict, es: dict, refs: dict[str, dict], now: datetime) -> dict | None` (None si `now` no está entre `activation` y `expiry` o el inventario viene vacío); `merge(history: dict, visit: dict) -> tuple[dict, bool]` (no duplica por `start`); `refs_from_lists(data_dir: Path) -> dict` (nombre inglés en casefold → ref, de `arsenal/list.json` y `mods/list.json`).
- La API: `https://api.warframestat.us/pc/voidTrader?language={en,es}`; campos `activation`, `expiry`, `location`, `inventory: [{uniqueName, item, ducats, credits}]`. Los nombres en español se emparejan por `uniqueName`.

- [ ] **Step 1: Tests** con un JSON de muestra escrito en el test (no red): visita activa → items con nombres `[en, es]` y `ref` resuelto para un nombre que está en el Arsenal ("Prisma Grakata" o el que haya en `arsenal/list.json`) y `null` para un cosmético; `now` antes de `activation` → `None`; inventario vacío → `None`; `merge` dos veces la misma visita → una sola y `False` la segunda vez.
- [ ] **Step 2:** correrlos → FAIL.
- [ ] **Step 3:** implementar. `main()` baja las dos URLs (User-Agent `vestigo-baro`, timeout 30 s), y si hay visita nueva escribe el archivo (JSON con `ensure_ascii=False`, indent 1) e imprime `nueva`; si no, `igual`. Lo bajado es dato: sólo `json.loads`.
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5:** `publish-baro.yml`: copiá la forma de `publish-warframe.yml` (checkout fijado por commit sin credenciales, token sólo en el push, reintento con rebase), cron `"0 14 * * 6"` + `workflow_dispatch`, `timeout-minutes: 5`, sin dependencias (stdlib), commit `chore(warframe): Baro del <fecha>` sólo de `games/warframe/data/baro`. Comentario arriba: por qué **no** está en `workflow_run` de `deploy.yml` (ver spec). No tocar `deploy.yml`.
- [ ] **Step 6: Commit** `feat(warframe): historial de Baro Ki'Teer con una Action los sábados`.

---

### Task 3: Plomería de las 4 pestañas + Mapa estelar en el sitio

**Files:**
- Modify: `site/src/route.ts` (WfTab, WF_SECTIONS, WF_DETAIL_SECTIONS += `"star-chart"`, WF_PUBLISHED, WF_SECTION_ES), `site/src/warframeCopy.ts` (WF_TABS, tabs, seo, cards, `detailSeo["star-chart"]`, textos `starChart`, `missionType: Record<string, Pair-like>`, `faction`), `site/src/Warframe.tsx` (TABS/TAB_DATA: sólo `star-chart` en esta tarea), `site/src/areaFiles.ts` (WF_TAB_FILES), `site/src/warframe/data.ts` (tipos `StarRow`, `StarFicha`, `Source` mission con `node?: string`, `DATA_TABS += "star-chart"`, loaders), `site/src/warframe/Sources.tsx` (la columna de misión enlaza al nodo si `s.node`), `site/src/warframe/WarframeHome.tsx` (TAB_ICON para las cuatro pestañas nuevas, con íconos que ya existen en `site/public/warframe/s/`), `site/src/warframe/sitemapData.ts`, `site/src/sitemap.ts`, `site/vite.config.ts` (leer `star-chart/list.json`), `site/src/navSearch.ts` (los nodos), `site/scripts/perf.mjs` (PAGES).
- Create: `site/src/warframe/starchart/WfStarChart.tsx`, `StarChartList.tsx`, `OrbitMap.tsx`, `NodePage.tsx`; estilos al final de `site/src/styles/warframe.css`.
- Test: `site/test/warframeRoute.test.ts`, `warframeData.test.ts`, `warframeSeo.test.ts`, `areas.test.ts` (los que ya existen: extenderlos).

**Interfaces:**
- Consumes: archivos de la Tarea 1.
- Produces: `WfTab = "arsenal" | "relics" | "farming" | "mods" | "star-chart" | "mastery" | "prime-vault" | "baro"`; `WF_TABS` en ese orden con `"home"` primero; en `warframeCopy` las claves de `tabs`/`seo`/`cards` para las ocho. Las Tareas 4–6 sólo suman su componente a `TABS` y su archivo a `WF_TAB_FILES`; hasta entonces su pestaña sale apagada ("Pronto") como en la etapa 1. **`WF_PUBLISHED` suma cada pestaña recién en su tarea** (si no, el sitemap lista páginas que muestran la portada).
- `filterStars(rows, planet: string | null, type: string | null)`; `readStarFilters(search) / writeStarFilters({planet, type})` con `?planet=<slugify(planeta en)>&type=<tipo>` en `data.ts`.

- [ ] **Step 1: Tests que fallan**: `/en/warframe/star-chart/hydron` y `/es/warframe/mapa-estelar/hydron` parsean a `wfSection: "star-chart", detail: "hydron"` y `routePath` vuelve a la misma dirección; `filterStars` por planeta y tipo; `detailSeo["star-chart"]("Hydron", "Sedna", "Defense")` en los dos idiomas trae el nombre y el planeta y entra en 160; `WF_TAB_FILES` coincide con `TABS` (`areas.test.ts` ya lo compara); la ficha en español en frío resuelve por `es/NN.json` (como el test equivalente de reliquias).
- [ ] **Step 2:** `npx vitest run test/warframe*.test.ts test/areas.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
  - **Lista** (maqueta A + tabla C, ver spec y `scratchpad/maq/a-orbitas.html` + `c-tabla.html` en `warframe-mapa-maquetas`, puerto 5237): arriba un panel con título/lede; `OrbitMap` es un SVG (viewBox 640×640) con el sol, las órbitas de Mercury…Sedna (orden del juego: Mercury, Venus, Earth, Mars, Ceres, Jupiter, Saturn, Uranus, Neptune, Pluto, Eris, Sedna), las lunas Lua/Phobos/Deimos/Europa junto a su planeta y los demás lugares como botones; cada planeta es un `RouteLink` a `?planet=<slug>` (prerenderable, sin JS). Abajo, chips de tipo de misión del planeta elegido y la tabla: Nodo (enlace a la ficha), Misión, Facción, Nivel, Lo que más da (`best`). Sin filtro, todas las filas agrupadas por planeta con `LazyRows tag="tr"` (medí `rowHeight`).
  - **Ficha** (`NodePage`): kicker con planeta (+ "Sector oscuro"), h1 con el nombre, datos (misión, facción, nivel, maestría si > 0), una tabla por `rewards` (título "Rotación A" o el `label`), cada ítem con su enlace si `refs[ref].tab`; "Recursos del planeta" con íconos (`Icon`) enlazados a Dónde farmear; sin `rewards`: el texto `starChart.noRewards`. Un enlace "← Mapa estelar" con `?planet=` del planeta.
  - Textos: tipos de misión y facciones EN/ES (los españoles de warframe-worldstate-data `data/es/missionTypes.json` y `factionsData.json`; "Descent"/"Faceoff"/"Relay"/"The Perita Rebellion"/"Legacyte Harvest"/"Shrine Defense"/"The Circuit" que no estén ahí: usá el nombre del nodo en `ExportRegions_es` como guía o dejalos en inglés).
- [ ] **Step 4:** tests + `npx tsc -b` → PASS. Levantá `vestigo-warframe-2` (5236) y revisá `/en/warframe/star-chart`, `?planet=sedna`, `/es/warframe/mapa-estelar/hydron` y `/en/warframe/relics/<una con misiones>` (el enlace al nodo): sin errores de consola, mobile 375 sin scroll horizontal, zoom de cerca a títulos y cifras.
- [ ] **Step 5: Commit** `feat(warframe): pestaña Mapa estelar con ficha por nodo`.

---

### Task 4: Maestría en el sitio

**Files:**
- Create: `site/src/warframe/mastery/WfMastery.tsx`, `site/src/warframe/mastery/mastery.ts`, `site/test/warframeMastery.test.ts`
- Modify: `Warframe.tsx` (TABS), `areaFiles.ts`, `route.ts` (WF_PUBLISHED), `warframeCopy.ts` (textos `mastery`), `warframe/data.ts` (`MasteryRow`, `loadMastery()` con `import("@warframe/mastery/list.json")`), `warframe.css`, `perf.mjs`.

**Interfaces:**
- `mastery.ts`: `masteryRank(xp: number): { rank: number; legendary: number; next: number | null }` (rango n ≤ 30 con 2.500·n²; desde 2.250.000, `legendary = floor((xp − 2.250.000) / 147.500)`; `next` = xp que falta para el siguiente); `readChecked(storage: Storage | null): Set<string>` y `writeChecked(storage, set)` con la clave `"vestigo:wf:mastery"` (array JSON de slugs), ambos con try/catch y tolerantes a basura.

- [ ] **Step 1: Tests**: `masteryRank(0)` → rank 0; `2500` → 1; `9999` → 1; `10000` → 2; `2_250_000` → `{rank: 30, legendary: 0}`; `2_397_500` → legendary 1; `readChecked` con `"no es json"`, con `{}` y con un `Storage` que tira en `getItem` → `Set` vacío; ida y vuelta `writeChecked`/`readChecked`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. La página: encabezado con el total tildado (xp, rango alcanzado, "L1" si legendario) y cuántos de cuántos; chips por tipo (`warframe, primary, secondary, melee, archwing, companion, necramech`), "Ocultar lo tildado", buscador; filas con checkbox accesible (label), ícono, nombre enlazado al Arsenal, tipo y xp; `LazyRows`. El estado de tildado se lee en `useEffect` (el prerender sale sin tildes, sin desajuste de hidratación). **Step 4:** tests + tsc + revisar en 5236 (`/en/warframe/mastery`, `/es/warframe/maestria`, recargar y ver que recuerda). **Step 5: Commit** `feat(warframe): pestaña Maestría para tildar`.

---

### Task 5: Prime Vault y Baro en el sitio

**Files:**
- Create: `site/src/warframe/vault/WfVault.tsx`, `site/src/warframe/baro/WfBaro.tsx`, `site/src/warframe/baro/baroLive.ts`, `site/test/warframeBaro.test.ts`
- Modify: `Warframe.tsx`, `areaFiles.ts`, `route.ts` (WF_PUBLISHED += las dos), `warframeCopy.ts`, `warframe/data.ts` (`VaultRow`, `VaultEvent`, `BaroHistory` y sus `import()`), `warframe.css`, `perf.mjs`.

**Interfaces:**
- `baroLive.ts`: `parseBaro(json: unknown, now: number): BaroLive | null` y `fetchBaro(lang, signal?)` (timeout 6 s como `live.ts`, `null` si falla); `BaroLive = { active: boolean; location: string; startsAt: number; endsAt: number; items: { unique: string; name: string; ducats: number; credits: number }[] }`.

- [ ] **Step 1: Tests** de `parseBaro`: activa con inventario → items; antes de llegar → `active: false` con `startsAt`; vencida → `null`; forma rara → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar.
  - **Prime Vault**: título + lede; chips de estado (Disponible / Vault / Parcial / Sin reliquias) y de tipo; grilla de íconos con nombre enlazado a la ficha del Arsenal (`LazyRows tag="div"`); al pie "Cambios del Vault" desde `history.json` (fecha, objeto, de → a), y si está vacío, "Se anota desde el 27/10/2026".
  - **Baro**: el bloque en vivo (después de montar, como la portada): si está, relé, cuenta regresiva a que se va y la tabla de inventario (nombre enlazado si el `unique` aparece en el historial con `ref`, ducados, créditos); si no, relé y cuenta regresiva a que llega. Abajo, el historial (visita por visita, la más nueva primero). Si la API falla, sólo el historial.
- [ ] **Step 4:** tests + tsc + revisar en 5236 las cuatro direcciones (en/es). **Step 5: Commit** `feat(warframe): pestañas Prime Vault y Baro Ki'Teer`.

---

### Task 6: Medir, anotar y PR

- [ ] **Step 1:** `npm test` completo y los tests de Python → todo verde.
- [ ] **Step 2:** `npm run build` (uno solo, con el pico de RAM sumando procesos node/esbuild como en la etapa 1) → anotar tiempo, rutas y RAM en la tabla "Mediciones" del spec (columna nueva "etapa 2").
- [ ] **Step 3:** `vite preview` en 4173 y `npm run perf` → todas las páginas dentro del presupuesto; anotar las nuevas en la tabla de perf del spec.
- [ ] **Step 4:** commit de docs, push y PR escueto contra `main`. No fusionar.
