# Warframe, etapa 1 — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans, tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** publicar la sección Warframe con Portada en vivo, Arsenal, Reliquias, Dónde farmear y Mods y arcanos, con la estética A "Arsenal".

**Arquitectura:** como Stardew. Python baja el Public Export y la tabla oficial de drops a `games/warframe/raw/` (ignorada), arma `games/warframe/data/` (en git) y los íconos WebP en `site/public/warframe/`. El sitio es un área perezosa (`src/Warframe.tsx`) con una pestaña por chunk, fichas partidas por hash del slug y slugs en español anotados en `route.ts`. Lo en vivo se pide en el navegador a `api.warframestat.us`; los ciclos se calculan.

**Tecnologías:** Python 3.14 + Pillow (unittest), React + Vite + TypeScript (vitest), prerender propio del sitio.

**Diseño:** `docs/superpowers/specs/2026-10-26-warframe-design.md`. Maqueta elegida: A "Arsenal" (en el scratchpad de la sesión del 26/10, `wf-maquetas/index.html`; la tarea 5 copia sus estilos).

## Restricciones globales

- Todo en español: código, comentarios, commits. PR y commits escuetos (título + 2–4 viñetas).
- Direcciones: segmento `warframe` (`/en/warframe`, `/es/warframe`). Pestañas `arsenal` → `arsenal`, `relics` → `reliquias`, `farming` → `donde-farmear`, `mods` → `mods`. Fichas `/<pestaña>/<slug>`. Assets en `/warframe/...`.
- Nombres, descripciones y estadísticas salen **siempre** del export oficial (`_en` y `_es`). A mano sólo la interfaz (`warframeCopy.ts`).
- Si un dato no está en ninguna fuente, la ficha no lo inventa: "no cae en misiones" y nada más.
- Vault: rótulo "Vault · no cae en misiones" sólo cuando la reliquia no aparece en **ninguna** tabla de recompensas de la tabla de drops.
- Sin logos de Warframe ni de Digital Extremes. Pie con aviso de no afiliación ("Warframe es marca de Digital Extremes"). Sin "sacado de los archivos del juego" en la interfaz.
- Estética A: azul noche con resplandor radial, paneles de vidrio translúcidos **sin bordes de color**, Rajdhani (títulos, rótulos, cifras) y Barlow (texto) con `@fontsource`, acento `#6fd3ff`, rarezas por color de texto (común `#c9a26b`, poco común `#d8dde3`, rara `#f2d36b`).
- Presupuesto por página al abrir, en frío: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos de DOM, sin errores de JS ni 4xx/5xx.
- Grillas de más de ~150 con `LazyRows`. Imágenes `loading="lazy"`, `decoding="async"`, tamaño fijo; sólo la grande de una ficha sin `lazy`.
- Datos fuera del chunk de entrada; JSON importados enteros. Los títulos no se cortan (container queries).
- `games/warframe/data` en `paths` de `deploy.yml` y en el `ignore` de `netlify.toml`. `https://api.warframestat.us` en `connect-src` de la CSP.
- Nunca dos procesos pesados a la vez (build, perf, scripts de datos).

## Foco de revisión

- Dos cosas con el mismo nombre en inglés (un mod y un arcano, o un Warframe y su arma exaltada): slugs únicos por pestaña. Lo prueba la tarea 4.
- Abrir en frío una ficha en español (`/es/warframe/reliquias/lith-a1`) antes de bajar la lista. Lo prueba la tarea 6.
- `api.warframestat.us` caída o lenta: la portada se ve entera sin el bloque en vivo y sin errores en consola. Lo prueba la tarea 5.
- Una parte o plano que no cae en ningún lado (plano principal de tienda): la ficha muestra "no cae en misiones" y ninguna sección vacía. Lo prueba la tarea 6.
- Una reliquia que sólo cae en un botín (Cetus, Zariman…) no es Vault. Lo prueba la tarea 2.

---

### Tarea 1: Bajar y leer lo crudo (`fetch.py`, `wf.py`)

**Archivos:**
- Crear: `games/warframe/tools/fetch.py`, `games/warframe/tools/wf.py`, `games/warframe/.gitignore` (`raw/`)
- Test: `games/warframe/tools/tests/test_wf.py`

**Interfaces:**
- Produce:
  - `fetch.py`: `python games/warframe/tools/fetch.py` baja `index_en`/`index_es` (`https://origin.warframe.com/PublicExport/index_{lang}.txt.lzma`), cada export (`http://content.warframe.com/PublicExport/Manifest/<línea>`), `ExportManifest.json` y la tabla de drops (`https://www.warframe.com/droptables`, sigue el redirect) a `games/warframe/raw/` (`Export*_{en,es}.json`, `ExportManifest.json`, `drops.html`, `index.json` = `{lang: [líneas]}`). `--check` imprime `cambió`/`igual` comparando `index.json` contra `games/warframe/data/meta.json["index"]` y sale 0.
  - `unlzma(raw: bytes) -> bytes`: LZMA "alone" sin marca de fin: `FORMAT_RAW` con `lc/lp/pb` del byte 0 y `dict_size` de los bytes 1-4, datos desde el byte 13.
  - `wf.py`: `export(name: str, lang: str) -> list[dict]` (`export("Warframes","es")` → la lista `ExportWarframes`; para archivos con varias listas, `export_all(name, lang) -> dict`), `by_unique(name, lang) -> dict[str, dict]`, `clean(text: str) -> str` (saca `<DT_..._COLOR>`, `<LOWER_IS_BETTER>` y demás marcas `<…>`, cambia `|DAMAGE|`-style por `X`, normaliza `\r\n`), `slugify(s) -> str` (igual que `site/src/route.ts`), `icon_url(unique: str) -> str | None` (desde `ExportManifest`).
  - Si falta `raw/`, corta con "corré games/warframe/tools/fetch.py".

- [ ] **Paso 1: tests que fallan**

```python
class TestWf(unittest.TestCase):
    def test_excalibur_en_los_dos_idiomas(self):
        en = wf.by_unique("Warframes", "en")["/Lotus/Powersuits/Excalibur/Excalibur"]
        es = wf.by_unique("Warframes", "es")["/Lotus/Powersuits/Excalibur/Excalibur"]
        self.assertEqual((en["health"], en["shield"], en["armor"], en["power"]), (270, 270, 240, 100))
        self.assertEqual([a["abilityName"] for a in es["abilities"]][3], "Espada exaltada")
    def test_clean(self):
        self.assertEqual(wf.clean("efecto <DT_SLASH_COLOR>cortante."), "efecto cortante.")
    def test_icono(self):
        self.assertTrue(wf.icon_url("/Lotus/Powersuits/Excalibur/Excalibur").startswith("https://content.warframe.com/PublicExport/Lotus/Interface/Icons/"))
    def test_unlzma(self):
        raw = (wf.RAW / "index_en.txt.lzma").read_bytes()
        self.assertIn(b"ExportWarframes_en.json!", fetch.unlzma(raw))
```

- [ ] **Paso 2:** `python -m unittest discover -s games/warframe/tools/tests` → falla.
- [ ] **Paso 3:** implementar; `fetch.py` guarda también los `.lzma` del índice para el test. Correrlo una vez.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** commit `feat(warframe): bajada del export oficial y la tabla de drops`.

### Tarea 2: La tabla de drops (`drops.py`)

**Archivos:**
- Crear: `games/warframe/tools/drops.py`
- Test: `games/warframe/tools/tests/test_drops.py`

**Interfaces:**
- Consume: `raw/drops.html`. Secciones por `<h3 id="…">`: `missionRewards`, `relicRewards`, `keyRewards`, `transientRewards`, `sortieRewards`, `cetusRewards`, `solarisRewards`, `deimosRewards`, `zarimanRewards`, `entratiLabRewards`, `hexRewards`, `modByDrop`, `blueprintByDrop`, `resourceByDrop`, `relicByAvatar`.
- Produce (nombres de objetos tal cual en inglés; los porcentajes como `float` en %):
  - `missions() -> list[dict]`: `{"where": "Mercury/Apollodorus (Survival)", "rot": "A"|"B"|"C"|None, "item": str, "chance": float}`.
  - `bounties() -> list[dict]`: `{"where": "Cetus", "tier": str, "stage": str|None, "rot": str|None, "item", "chance"}` para las seis secciones de botines; `keys()`, `transient()`, `sorties()` con la forma de `missions()` (`where` = el encabezado de la tabla).
  - `relics() -> dict[str, dict[str, list[tuple[str, str, float]]]]`: `{"Axi A1": {"Intact": [(item, rarity, chance)×6], "Exceptional": …, "Flawless": …, "Radiant": …}}`.
  - `by_drop(section: str) -> dict[str, list[dict]]` para `modByDrop`, `blueprintByDrop`, `resourceByDrop`: `item → [{"who": str, "drop": float, "chance": float, "eff": drop*chance/100}]`.
  - `relic_sources() -> dict[str, list[dict]]`: dónde cae cada reliquia, juntando `missions`, `bounties`, `keys`, `transient` (el nombre "Lith A1 Relic" se normaliza a "Lith A1").
  - `vaulted(relic: str) -> bool`: `not relic_sources().get(relic)`.

- [ ] **Paso 1: tests que fallan** (valores del 26/10; si un parche los mueve, actualizar con lo que diga la tabla)

```python
class TestDrops(unittest.TestCase):
    def test_reliquia_por_refinamiento(self):
        r = drops.relics()["Axi A1"]
        self.assertEqual(len(r["Intact"]), 6)
        self.assertIn(("Nikana Prime Blueprint", "Rare", 2.0), r["Intact"])
        self.assertIn(("Nikana Prime Blueprint", "Rare", 10.0), r["Radiant"])
    def test_mision_con_rotacion(self):
        m = [x for x in drops.missions() if x["where"] == "Mercury/Apollodorus (Survival)" and x["item"] == "Serration"]
        self.assertEqual((m[0]["rot"], m[0]["chance"]), ("B", 7.69))
    def test_vault(self):
        self.assertFalse(drops.vaulted("Lith A1"))
        self.assertTrue(drops.vaulted("Lith H2"))
    def test_botin_solo_no_es_vault(self):
        solo_botin = {r for r, s in drops.relic_sources().items() if s and all(x.get("tier") for x in s)}
        for r in solo_botin:
            self.assertFalse(drops.vaulted(r))
    def test_enemigo_con_efectiva(self):
        raptor = next(x for x in drops.by_drop("resourceByDrop")["Neural Sensors"] if x["who"] == "Raptor")
        self.assertEqual((raptor["drop"], raptor["chance"], raptor["eff"]), (100.0, 50.0, 50.0))
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar con `html.parser` de la biblioteca estándar (sin dependencias nuevas). Cachear el parseo por proceso.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** commit `feat(warframe): lectura de la tabla oficial de drops`.

### Tarea 3: Partes, recetas y de dónde sale cada cosa (`relations.py`)

**Archivos:**
- Crear: `games/warframe/tools/relations.py`, `games/warframe/tools/exceptions.py`
- Test: `games/warframe/tools/tests/test_relations.py`

**Interfaces:**
- Consume: `wf.*`, `drops.*`.
- Produce:
  - `recipe_for(result_unique: str) -> dict | None`: de `ExportRecipes`, `{"unique", "credits": buildPrice, "seconds": buildTime, "ingredients": [{"unique", "n"}]}`.
  - `parts(unique: str) -> list[dict]`: las partes de un Warframe, arma o compañero: el plano principal y cada componente de la receta que tenga receta propia o sea parte Prime, `{"unique", "name": [en, es], "n", "sources": list[Source]}`. Nombre en inglés de una parte para cruzar con la tabla: el nombre del componente + `" Blueprint"` cuando la tabla nombra el plano.
  - `Source` (dict): `{"k": "relic", "relic": "Axi A1", "rarity": "Rare", "vaulted": bool}` | `{"k": "mission", "where", "rot", "chance"}` | `{"k": "bounty", "where", "tier", "stage", "rot", "chance"}` | `{"k": "enemy", "who", "eff"}` | `{"k": "other", "where", "chance"}` (llaves, incursiones, dinámicas).
  - `sources_by_name(name_en: str) -> list[Source]`: busca el nombre en todas las tablas.
  - `resource_planets(unique: str) -> list[[en, es]]`: los planetas de la línea "Location:" / "Ubicación:" de la descripción del recurso, cruzados contra los `systemName` de `ExportRegions` en cada idioma.
  - `resources() -> list[str]`: los `uniqueName` de recursos que piden las recetas de lo del Arsenal o que aparecen en `resourceByDrop`.
  - `exceptions.py`: `UNRESOLVED: dict[str, str]` nombre de la tabla de drops → motivo, para lo que no cruza a propósito.

- [ ] **Paso 1: tests que fallan**

```python
class TestRelations(unittest.TestCase):
    def test_partes_de_excalibur_en_war(self):
        ps = {p["name"][0]: p for p in relations.parts("/Lotus/Powersuits/Excalibur/Excalibur")}
        chasis = next(s for s in ps["Excalibur Chassis"]["sources"] if s["k"] == "mission")
        self.assertEqual((chasis["where"], chasis["chance"]), ("Mars/War (Assassination)", 38.72))
    def test_parte_prime_desde_reliquias(self):
        nik = relations.sources_by_name("Nikana Prime Blueprint")
        self.assertIn({"k": "relic", "relic": "Axi A1", "rarity": "Rare", "vaulted": drops.vaulted("Axi A1")}, nik)
    def test_planetas_del_recurso(self):
        self.assertEqual(relations.resource_planets("/Lotus/Types/Items/MiscItems/NeuralSensor"), [["Jupiter", "Júpiter"]])
    def test_todo_lo_de_la_tabla_cruza_o_tiene_motivo(self):
        sueltos = relations.unresolved_drop_names()
        self.assertEqual(sorted(set(sueltos) - set(exceptions.UNRESOLVED)), [])
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar. `unresolved_drop_names()` devuelve las partes Prime y planos de la tabla de drops que no se resuelven a ningún `uniqueName`; llenar `UNRESOLVED` sólo con lo que se revisó a mano (con motivo).
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** commit `feat(warframe): partes, recetas y fuentes de cada objeto`.

### Tarea 4: Datos del sitio e íconos (`site_data.py`, `images.py`)

**Archivos:**
- Crear: `games/warframe/tools/site_data.py`, `games/warframe/tools/images.py`
- Crear (salida, en git): `games/warframe/data/meta.json`, `games/warframe/data/<tab>/list.json`, `games/warframe/data/<tab>/f/NN.json`, `games/warframe/data/<tab>/es/NN.json` para `tab` en `arsenal`, `relics`, `farming`, `mods`; `site/public/warframe/s/*.webp` (128 px) y `site/public/warframe/l/*.webp` (256 px)
- Test: `games/warframe/tools/tests/test_site_data.py`

**Interfaces:**
- Consume: tareas 1-3.
- Produce (lo que lee el sitio):
  - `CHUNKS = 32` por pestaña; `shard(slug) = fnv1a(slug) % 32`, el mismo hash que `pzShardOf` de `site/src/zomboid/shard.ts`.
  - Slugs: `slugify` del nombre en inglés; el español, del nombre en español. Si choca dentro de la pestaña, se suma el tipo (`-arcane`, `-mod`, `-exalted`); si sigue chocando, el final del `uniqueName`.
  - `list.json` (por pestaña): `[{slug, slugEs, name: [en, es], img, …filtros}]`. Filtros: arsenal `kind` (`warframe`, `primary`, `secondary`, `melee`, `archwing`, `companion`), `prime: bool`, `mr`; relics `era` (`Lith`, `Meso`, `Neo`, `Axi`, `Requiem`), `vaulted`; farming `planets: [[en, es]]`; mods `kind` (`mod`, `arcane`), `type`, `rarity`, `polarity`, `compat`.
  - Fichas (`f/NN.json` → `{slug: Ficha}`):
    - Arsenal: `{slug, slugEs, name, desc, kind, img, mr, stats, abilities?: [{name, desc}], passive?, parts: [{name, n, img?, sources}], recipe: {credits, seconds, ingredients: [{ref, n}]} | null, refs}`. `stats` de un Warframe: `{health, shield, armor, energy, sprint}`; de un arma: `{damage: [[tipo, valor]], total, crit, critMult, status, fireRate, magazine?, reload?, multishot?, trigger?}`.
    - Reliquia: `{slug, slugEs, name, era, vaulted, img, rewards: [{ref, rarity, chances: [intact, exceptional, flawless, radiant]}], sources, refs}`.
    - Recurso: `{slug, slugEs, name, desc, img, planets, sources, usedIn: [ref], refs}`.
    - Mod/arcano: `{slug, slugEs, name, kind, type, rarity, polarity, drain, maxRank, compat, ranks: [[en, es]], img, sources, refs}`.
    - `refs`: `{ref: {tab, slug, slugEs, name: [en, es], img}}` de todo lo nombrado.
  - `es/NN.json` → `{slugEs: slug}` repartido por el slug español.
  - `meta.json`: `{generatedAt, index: {lang: [líneas]}, counts: {arsenal, relics, farming, mods}}`.
  - Tipos de daño de `damagePerShot` (20 posiciones): `DAMAGE_TYPES` en `site_data.py`, fijado por el test con 3 armas.
  - `images.py`: baja cada ícono usado una vez a `raw/icons/` y escribe `s/<archivo>.webp` 128 px y, para el Arsenal, `l/<archivo>.webp` 256 px (calidad 82, `method=6`). Las reliquias usan un ícono por era (`relic-lith`, …).

- [ ] **Paso 1: tests que fallan**

```python
class TestSiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.out = site_data.build(write=False)
    def test_slugs_unicos_por_pestana(self):
        for tab, rows in self.out["lists"].items():
            for k in ("slug", "slugEs"):
                vals = [r[k] for r in rows]
                self.assertEqual(len(vals), len(set(vals)), (tab, k))
    def test_mismo_hash_que_el_sitio(self):
        self.assertEqual(site_data.shard("melon"), 28 % 32)
    def test_excalibur(self):
        f = self.out["fichas"]["arsenal"]["excalibur"]
        self.assertEqual(f["stats"]["armor"], 240)
        self.assertEqual(f["slugEs"], "excalibur")
    def test_dano_por_tipo(self):
        braton = self.out["fichas"]["arsenal"]["braton"]["stats"]["damage"]
        self.assertEqual(sorted(t for t, _ in braton), ["impact", "puncture", "slash"])
    def test_sin_fuente_no_inventa(self):
        sin = [p for f in self.out["fichas"]["arsenal"].values() for p in f["parts"] if not p["sources"]]
        self.assertTrue(sin)  # existen (planos de tienda) y quedan con sources == []
    def test_cada_fila_tiene_ficha_e_icono(self):
        for tab, rows in self.out["lists"].items():
            for r in rows:
                self.assertIn(r["slug"], self.out["fichas"][tab])
                self.assertTrue((images.SMALL / f"{r['img']}.webp").exists(), r["img"])
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar; `site_data.build(write=True)` escribe todo; `images.py` corre aparte. Medir `du -sh games/warframe/data site/public/warframe` y anotarlo en el diseño.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** commit `feat(warframe): datos del sitio e íconos`.

### Tarea 5: Área, direcciones, portada en vivo y estética A

**Archivos:**
- Modificar (el bloque de Stardew en cada uno como modelo): `site/src/route.ts` (`View` suma `"warframe"`; `WfTab = "arsenal" | "relics" | "farming" | "mods"`, `WfSection = "home" | WfTab`, `WF_SEGMENT = "warframe"`, `WF_SECTIONS`, `WF_DETAIL_SECTIONS` = las cuatro, `WF_PUBLISHED`, `WF_SECTION_ES = { arsenal: "arsenal", relics: "reliquias", farming: "donde-farmear", mods: "mods" }`, `registerWfSlugs(slugs: Partial<Record<WfTab, Record<string, string>>>)`; `Route` suma `wfSection?: WfSection`), `site/src/areas.ts`, `site/src/areaFiles.ts`, `site/src/App.tsx`, `site/src/Nav.tsx`, `site/src/gameGroups.ts` (grupo `arpg`), `site/src/i18n.ts` (nombre, aviso de no afiliación, panel de la portada general), `site/tsconfig.json` y `site/vite.config.ts` (alias `@warframe` → `games/warframe/data`), `site/package.json` (`@fontsource/rajdhani`, `@fontsource/barlow`), `netlify.toml` (`connect-src https://api.warframestat.us`)
- Crear: `site/src/Warframe.tsx`, `site/src/warframeCopy.ts`, `site/src/warframe/ui.tsx`, `site/src/warframe/WarframeHome.tsx`, `site/src/warframe/cycles.ts`, `site/src/warframe/live.ts`, `site/src/styles/warframe.css`, el logo monocromo propio del menú (SVG, como los de `bde41c79`)
- Test: `site/test/warframeRoute.test.ts`, `site/test/warframeLive.test.ts`, la línea de Warframe en `site/test/areas.test.ts`

**Interfaces:**
- Produce:
  - `Warframe.tsx`: `default`, `preloadTab(route)`, `notePop`/`cameFromHistory`, `TABS` una línea por pestaña (lo lee `areas.test.ts`), como `Stardew.tsx`.
  - `warframeCopy.ts`: `WF_COPY: {en, es}` y `useWfCopy()`; `tabs`, `seo` por sección, `home`, una clave por pestaña, `rarity`, `polarity`, `damage` (nombres de los tipos de daño de `DAMAGE_TYPES`), `era`, `vault`.
  - `warframe/ui.tsx`: `<Panel>` (vidrio), `<Icon img size big? lazy?>` (usa `/warframe/s/` o `/warframe/l/`), `<Rarity r>`, `<WfLoading>`.
  - `cycles.ts`: `cetus(now: number) -> {state: "day"|"night", endsAt: number}`, `vallis(now) -> {state: "warm"|"cold", endsAt}`, `cambion(now) -> {state: "fass"|"vome", endsAt}` con las épocas y duraciones del código de warframestat (MIT), citado en un comentario.
  - `live.ts`: `fetchLive(lang: "en"|"es", signal?: AbortSignal) -> Promise<Live | null>` contra `https://api.warframestat.us/pc/?language=<lang>`; `Live = {fissures: {node, mission, era, endsAt, hard}[], baro: {active, location, endsAt|startsAt}, sortie: {boss, missions: {node, type, modifier}[]} | null}`; cualquier error → `null`, sin `console.error`.
  - Portada: título, introducción, el bloque en vivo (ciclos siempre; Baro, fisuras por era e incursión si `fetchLive` respondió), una tarjeta por pestaña y el buscador del juego. El prerender no trae el bloque de `fetchLive`.

- [ ] **Paso 1: tests que fallan**

```ts
it("lee y escribe las direcciones de Warframe en los dos idiomas", () => {
  expect(parseRoute("/en/warframe")).toMatchObject({ view: "warframe", wfSection: "home" });
  expect(parseRoute("/es/warframe/donde-farmear")).toMatchObject({ view: "warframe", wfSection: "farming" });
  registerWfSlugs({ relics: { "lith-a1": "lith-a1" }, farming: { "neural-sensors": "sensores-neurales" } });
  expect(routePath({ lang: "es", view: "warframe", wfSection: "farming", detail: "neural-sensors" } as Route)).toBe("/es/warframe/donde-farmear/sensores-neurales");
});
it("los ciclos coinciden con la API (fixture del día en que se escribió)", () => {
  for (const f of fixtures) expect(Math.abs(cetus(f.now).endsAt - f.cetusEnds)).toBeLessThan(60_000);
});
it("sin red la portada no rompe", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("caída"))) as never;
  expect(await fetchLive("en")).toBeNull();
});
```

Los fixtures (`site/test/fixtures/warframe-cycles.json`) se toman de `https://api.warframestat.us/pc/cetusCycle`, `vallisCycle` y `cambionCycle` el día que se escribe la tarea (tres tomas separadas).

- [ ] **Paso 2:** `npx vitest run test/warframeRoute.test.ts test/warframeLive.test.ts test/areas.test.ts` → falla.
- [ ] **Paso 3:** implementar. Sumar `vestigo-warframe` al `.claude/launch.json` del checkout principal (puerto libre) y conectar la portada apenas funcione.
- [ ] **Paso 4:** pasan; en dev `/en/warframe` y `/es/warframe` con la estética de la maqueta A, el bloque en vivo lleno y, con la red cortada en DevTools, sin él.
- [ ] **Paso 5:** commit `feat(warframe): área, direcciones y portada en vivo`.

### Tarea 6: Arsenal y Reliquias (listas y fichas) + `data.ts`

**Archivos:**
- Crear: `site/src/warframe/data.ts`, `site/src/warframe/arsenal/WfArsenal.tsx`, `ArsenalList.tsx`, `ArsenalPage.tsx`, `site/src/warframe/relics/WfRelics.tsx`, `RelicList.tsx`, `RelicPage.tsx`, `site/src/warframe/Sources.tsx`
- Modificar: `Warframe.tsx` (`TABS`, `TAB_DATA`), `areaFiles.ts`
- Test: `site/test/warframeData.test.ts`

**Interfaces:**
- Consume: datos de la tarea 4 por `@warframe/*`, `once`/`shardedFichas`, `pzShardOf`, `LazyRows`.
- Produce en `warframe/data.ts`: `WF_SHARDS = 32`, `peekList/loadList(tab)`, `peekFicha/loadFicha(tab, slug)`, `preloadRoute(route)` (resuelve el slug español antes de pedir la ficha), `say(pair, lang)`.
- `Sources.tsx`: `<Sources list={Source[]} />` — una tabla por tipo (reliquias con rareza y Vault, misiones con rotación y %, botines, enemigos con % efectivo), ordenada de mayor a menor chance. Con la lista vacía muestra el texto `copy.noDrops` ("No cae en misiones").

- [ ] **Paso 1: tests que fallan**

```ts
it("WF_SHARDS es el CHUNKS de site_data.py", () => expect(WF_SHARDS).toBe(32));
it("la ficha de Excalibur trae las partes de War", async () => {
  const f = await loadFicha("arsenal", "excalibur");
  const chasis = f!.parts.find((p) => p.name[0] === "Excalibur Chassis")!;
  expect(chasis.sources).toContainEqual(expect.objectContaining({ k: "mission", chance: 38.72 }));
});
it("abre en frío una reliquia en español", async () => {
  await preloadRoute({ lang: "es", view: "warframe", wfSection: "relics", detail: "lith-a1" } as Route);
  expect(peekFicha("relics", "lith-a1")).toBeTruthy();
});
it("una parte sin fuente muestra 'no cae en misiones' y nada vacío", () => {
  const html = renderToStaticMarkup(createElement(Sources, { list: [] }));
  expect(html).toContain(WF_COPY.es.noDrops);
  expect(html).not.toContain("<table");
});
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar.
  - **Arsenal, lista:** grilla de íconos 128 px con nombre, de a tandas (`LazyRows`, `tag="div"`, `rowHeight` medido), buscador, chips de `kind` y "Prime", filtros en la dirección (`?kind=`). **Ficha:** la de la maqueta A (ícono 256 sin `lazy` a la izquierda; maestría, nombre, descripción; estadísticas en paneles con barra; habilidades 1-4 o daño por tipo; "Partes" con `<Sources>` por parte; "Receta" con créditos, tiempo e ingredientes enlazados a Dónde farmear).
  - **Reliquias, lista:** por era, con chip "sin Vault". **Ficha:** las 6 recompensas (ícono, nombre enlazado a su ficha del Arsenal si es parte de algo publicado, rareza) con una columna por refinamiento, el rótulo de Vault y `<Sources>` de la reliquia.
- [ ] **Paso 4:** pasan. En dev: `/en/warframe/arsenal`, `/en/warframe/arsenal/excalibur`, `/es/warframe/reliquias/lith-a1`.
- [ ] **Paso 5:** commit `feat(warframe): Arsenal y Reliquias con fichas cruzadas`.

### Tarea 7: Dónde farmear y Mods y arcanos

**Archivos:**
- Crear: `site/src/warframe/farming/WfFarming.tsx`, `FarmingList.tsx`, `FarmingPage.tsx`, `site/src/warframe/mods/WfMods.tsx`, `ModList.tsx`, `ModPage.tsx`
- Modificar: `Warframe.tsx`, `areaFiles.ts`
- Test: en `site/test/warframeData.test.ts`

- [ ] **Paso 1: tests que fallan**

```ts
it("los sensores neurales: Júpiter y el Raptor", async () => {
  const f = await loadFicha("farming", "neural-sensors");
  expect(f!.planets).toContainEqual(["Jupiter", "Júpiter"]);
  expect(f!.sources).toContainEqual(expect.objectContaining({ k: "enemy", who: "Raptor", eff: 50 }));
});
it("Sierra: 11 rangos, drenaje 4 y cae en Apolodoro B", async () => {
  const f = await loadFicha("mods", "serration");
  expect(f!.maxRank).toBe(10);
  expect(f!.drain).toBe(4);
  expect(f!.sources).toContainEqual(expect.objectContaining({ k: "mission", rot: "B", chance: 7.69 }));
});
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar.
  - **Dónde farmear, lista:** buscador grande arriba ("¿qué necesitás?") y la grilla de recursos con sus planetas; filtro por planeta. **Ficha:** "Dónde conviene": lo de mayor chance primero (planetas, enemigos con % efectivo, misiones y botines) con `<Sources>`; "Lo piden": las recetas del Arsenal que lo usan, enlazadas.
  - **Mods y arcanos, lista:** chips mod/arcano, tipo, rareza y polaridad; `LazyRows`. **Ficha:** efecto por rango (selector de rango), drenaje, polaridad, compatibilidad y `<Sources>`.
- [ ] **Paso 4:** pasan. En dev: `/en/warframe/farming/neural-sensors`, `/es/warframe/mods/sierra`.
- [ ] **Paso 5:** commit `feat(warframe): Dónde farmear y Mods y arcanos`.

### Tarea 8: SEO, publicación, Action semanal y medición

**Archivos:**
- Modificar, siguiendo a Stardew en cada uno: `site/src/sitemap.ts` (grupo `warframe`, portada, pestañas y una dirección por ficha, `lastmod` de `meta.generatedAt`), `site/src/prerender.ts` (títulos con lo que se busca: arsenal "Excalibur — Warframe build parts, where to farm and stats", reliquias "Lith A1 Relic — Warframe drops, rewards and vault status", recursos "Where to farm Neural Sensors in Warframe", mods "Serration — Warframe mod drops and stats"; JSON-LD con migas; OG propia), `site/src/PageMeta.tsx`, `site/src/entry-server.tsx`, `site/vite.config.ts` (`readSitemapData`, la guardia de "cargando" en `site/src/warframe/loadingGuard.ts`), `site/src/navSearch.ts` (las cuatro pestañas), `site/src/Home.tsx`, `site/public/404.html`, `netlify.toml` (`/warframe` sin idioma → `/en/warframe` 301, caché de un día para `/warframe/s/*` y `/warframe/l/*`, `games/warframe/data` en `ignore`), `.github/workflows/deploy.yml` (`games/warframe/data/**`), `site/scripts/perf.mjs`
- Crear: `games/warframe/tools/og.py` → `site/public/warframe/og.jpg` (1200×630, sin logos de DE), `.github/workflows/publish-warframe.yml` (lunes 09:30 UTC + manual: `fetch.py --check`; si `igual`, termina; si `cambió`, corre `fetch.py`, `site_data.py`, `images.py` y abre un PR con `gh pr create`; permisos `contents: write`, `pull-requests: write`)
- Test: lo que ya prueba cada archivo (`sitemap`, `prerender`, `navSearch`, `areas`), con un `warframeSeo.test.ts` como `stardewSeo.test.ts`

- [ ] **Paso 1:** sumar los casos de Warframe a los tests de SEO, sitemap y navSearch; verificar que fallan.
- [ ] **Paso 2:** implementar.
- [ ] **Paso 3:** `npm test --prefix site` en verde (el de Deadlock puede fallar en un worktree sin `games/deadlock/pipeline/node_modules`: no cuenta).
- [ ] **Paso 4: medir.** `npm run build` en `main` y en la rama, con el pico de RAM sumando procesos `node`/`esbuild` nuevos cada 0,5 s y la duración; `check-links` en 0. `perf.mjs --budget --only warframe` contra `vite preview` (4173) con `PW_CHROMIUM` apuntando al headless shell de `~/AppData/Local/ms-playwright`. Páginas: `/en/warframe`, `/es/warframe`, `/en/warframe/arsenal`, `/en/warframe/arsenal/excalibur`, `/es/warframe/reliquias/lith-a1`, `/en/warframe/farming/neural-sensors`, `/es/warframe/mods`, `/en/warframe/mods/serration`. Anotar todo en el diseño.
- [ ] **Paso 5:** capturas en escritorio y móvil de esas páginas.
- [ ] **Paso 6:** commit, push de `feat/warframe` y PR contra `main`. No se fusiona sin que ZoTaD lo diga.

---

## Lo que queda para la etapa 2

Mapa estelar con nodos, maestría para tildar, Prime Vault y Baro con historial.
