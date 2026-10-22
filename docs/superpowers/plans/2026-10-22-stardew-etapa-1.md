# Stardew Valley, etapa 1 — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans, tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** publicar la sección Stardew Valley con Portada, Objetos, Aldeanos y Centro Comunitario, con la estética A "Menú del juego".

**Arquitectura:** igual que Terraria. Scripts de Python leen lo que vuelca la sonda (`games/stardew/raw/`, ignorada) y escriben `games/stardew/data/` (en git) y los sprites en `site/public/stardew/`. El sitio es un área perezosa (`src/Stardew.tsx`) con una pestaña por chunk, fichas partidas en 64 pedazos y slugs en español anotados en `route.ts`.

**Tecnologías:** Python 3.14 + Pillow (unittest), React + Vite + TypeScript (vitest), prerender propio del sitio.

**Diseño:** `docs/superpowers/specs/2026-10-22-stardew-design.md`. Maqueta elegida: A, "Menú del juego" (marcos de `Maps/MenuTiles.png`, casilleros, tooltip crema, paisaje del título de fondo). La maqueta de referencia es `a.html` (la copia está en la tarea 4).

## Restricciones globales

- Todo se escribe en español: código, comentarios, commits.
- Direcciones: segmento `stardew-valley` (`/en/stardew-valley`, `/es/stardew-valley`). Pestañas `items` → `objetos`, `villagers` → `aldeanos`, `bundles` → `centro-comunitario`. Los assets viven en `/stardew/...`.
- Nombres y descripciones salen **siempre** de los textos del juego (`Strings/*.json` y `Strings/*.es-ES.json`). No se escriben a mano nombres en español del juego. Los textos de la interfaz del sitio sí van a mano, en `stardewCopy.ts`.
- No se copia texto de stardewvalleywiki.com (CC BY-NC-SA). Los números se pueden cotejar con ella.
- Interfaz sin "sacado de los archivos del juego". Pie con el aviso de no afiliación con ConcernedApe.
- **Sin el logo oficial** en el sitio. El título va en tipografía pixel.
- Tipografías: Pixelify Sans 500/700 (títulos y cifras) y Nunito 600/800 (texto), con `@fontsource`, importadas en `Stardew.tsx` para que viajen con el área.
- Presupuesto por página al abrir, en frío: ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos de DOM, sin errores de JS ni respuestas 4xx/5xx.
- Listas de más de ~150 filas con `LazyRows`. Imágenes de lista `loading="lazy"`, `decoding="async"` y tamaño fijo. Sprites con `image-rendering: pixelated`.
- Datos fuera del chunk de entrada. Los JSON se importan enteros, nunca una clave suelta.
- Sin bordes ni barras de color en tarjetas o filas: el marco de menú del juego es la excepción porque es el arte del juego, no un filo de color.
- Los títulos no se cortan: se achican con container queries, nunca `overflow-wrap: anywhere`.
- `games/stardew/data` va a los `paths` de `.github/workflows/deploy.yml` y al `ignore` de `netlify.toml`.

## Foco de revisión

- Un objeto con id de texto (`BasiliskPaw`, `SkillBook_4`, `Book_Void`): tiene que aparecer bien en gustos de regalo, listas y direcciones. Lo prueba la tarea 2.
- Un objeto que nadie usa (sin regalos especiales, sin paquetes, sin máquinas): la ficha no muestra secciones vacías. Lo prueba la tarea 5.
- Abrir en frío una ficha en español (`/es/stardew-valley/objetos/melon`) antes de bajar la lista. Lo prueba la tarea 5.
- El navegador sin `localStorage` (ventana privada, bloqueado): la lista de paquetes funciona igual, sin guardar. Lo prueba la tarea 7.
- Un aldeano no sociable (Gunther, Marlon, el Mago): no tiene ficha ni aparece en "le encanta a". Lo prueba la tarea 2.

---

### Tarea 1: Lectura de lo crudo y reglas del juego (`sdv.py`)

**Archivos:**
- Crear: `games/stardew/tools/sdv.py`
- Test: `games/stardew/tools/tests/test_sdv.py`

**Interfaces:**
- Produce:
  - `raw(name: str) -> dict`: lee `games/stardew/raw/<name>.json` (por ejemplo `"Data/Objects"` o `"Strings/Objects.es-ES"`).
  - `text(token: str | None, lang: str) -> str`: resuelve `[LocalizedText Strings\\X:Clave]` (y varios tokens en una cadena) con `Strings/X` o `Strings/X.es-ES`. Si no hay traducción al español, cae al inglés. Si no es un token, devuelve la cadena tal cual.
  - `slugify(s: str) -> str`: igual que `slugify` de `site/src/route.ts` (minúsculas, sin acentos, guiones).
  - `CATEGORIES: dict[int, tuple[str, str]]`: categoría → (en, es). Sale de `Strings/StringsFromCSFiles` por clave: -2 Gema, -4 Pez (`Object.cs.12852`), -5/-6 Producto animal (`12864`), -7 Cocina (`12853`), -12 Mineral (`12850`), -15 Recurso, -16 Recurso, -26 Artesanía (`12862`), -27 Sirope, -75 Verdura (`12851`), -79 Fruta (`12854`), -80 Flor (`12866`), -81 Forraje (`12869`). Las claves que no están en esta lista se buscan en `StringsFromCSFiles` por el texto inglés, y se toma la misma clave en es-ES.
  - `sell_prices(price: int, category: int) -> dict`: `{"base": [normal, plata, oro, iridio], "pro": {"tiller"|"artisan"|"rancher"|"fisher"|"angler"|"blacksmith"|"gemologist"|"tapper": [4 precios]}}`. Las calidades son ×1, ×1,25, ×1,5 y ×2, redondeado hacia abajo. Profesiones: Labrador +10 % (-75, -79, -80), Artesano +40 % (-26), Ranchero +20 % (-5, -6, -18), Pescador +25 % y Pescador experto +50 % (-4), Herrero +50 % (-15), Gemólogo +30 % (-2, -12), Sangrador +25 % (-27). Las profesiones se aplican sobre el precio con calidad, redondeando hacia abajo.
  - `energy(edibility: int) -> tuple[int, int] | None`: `(energía, salud)` = `(ceil(e*2,5), floor(energía*0,45))` si `e > 0`; si no, `None`.

- [ ] **Paso 1: tests que fallan**

```python
class TestSdv(unittest.TestCase):
    def test_text_resuelve_tokens_en_los_dos_idiomas(self):
        o = sdv.raw("Data/Objects")["254"]
        self.assertEqual(sdv.text(o["DisplayName"], "en"), "Melon")
        self.assertEqual(sdv.text(o["DisplayName"], "es"), "Melón")
    def test_precios_del_melon(self):
        p = sdv.sell_prices(250, -79)
        self.assertEqual(p["base"], [250, 312, 375, 500])
        self.assertEqual(p["pro"]["tiller"][0], 275)
    def test_categoria_fruta_en_espanol_sale_del_juego(self):
        self.assertEqual(sdv.CATEGORIES[-79][0], "Fruit")
        self.assertNotEqual(sdv.CATEGORIES[-79][1], "")
    def test_energia(self):
        self.assertEqual(sdv.energy(45), (113, 50))
        self.assertIsNone(sdv.energy(-300))
    def test_slug(self):
        self.assertEqual(sdv.slugify("Melón de verano"), "melon-de-verano")
```

- [ ] **Paso 2:** `python -m unittest discover -s games/stardew/tools/tests` → falla (no existe `sdv`).
- [ ] **Paso 3:** implementar `sdv.py`. Lee siempre de `games/stardew/raw/`. Si falta, corta con un error que dice "corré games/stardew/tools/dump.sh".
- [ ] **Paso 4:** los tests pasan.
- [ ] **Paso 5:** commit `feat(stardew): reglas del juego para los datos del sitio (sdv.py)`.

### Tarea 2: Relaciones entre objetos (`relations.py`)

**Archivos:**
- Crear: `games/stardew/tools/relations.py`
- Test: `games/stardew/tools/tests/test_relations.py`

**Interfaces:**
- Consume: `sdv.raw`, `sdv.text`, `sdv.CATEGORIES`.
- Produce (los ids de objeto siempre como `str`, como en `Data/Objects`; los de `BigCraftables` con prefijo `"(BC)"`):
  - `villagers() -> list[dict]`: los aldeanos sociables. Son los de `Data/Characters` con `CanSocialize` distinto de `"FALSE"` y una entrada en `NPCGiftTastes`. Hoy son 34. Cada uno lleva `{"key", "name": [en, es], "birthday": [season 0-3, day], "romance": bool, "region": str}`.
  - `gift_taste(npc: str, item_id: str) -> str`: `"love" | "like" | "neutral" | "dislike" | "hate"`. Precedencia, de mayor a menor: lista personal por id, lista personal por categoría (números negativos), lista universal por id, lista universal por categoría, y si no hay nada, `"neutral"`. Las listas de `NPCGiftTastes` van en los campos 1, 3, 5, 7 y 9 (amor, gusto, desagrado, odio, neutral) separados por `/`. Las universales son `Universal_Love` y las demás.
  - `tastes_by_item() -> dict[str, dict[str, list[str]]]`: objeto → `{"love": [npc…], "like": […], "dislike": […], "hate": […]}`. Sólo lo que difiere de neutral.
  - `bundles() -> list[dict]`: de `Data/Bundles`. Clave `"Sala/índice"`; valor `nombre/recompensa/ítems/color/requeridos/…/nombre traducido`. Ítems de a tres: `id cantidad calidad`; el id `-1` es oro. Cada paquete: `{"room": "Pantry", "index": 1, "room_name": [en, es], "name": [en, es], "items": [[id, qty, quality]], "need": int, "reward": [id, qty] | None}`. El nombre en español sale de `Strings/BundleNames.es-ES` si existe; si no, del último campo.
  - `bundles_by_item() -> dict[str, list[[room, bundle_index, qty, quality]]]`.
  - `recipes() -> list[dict]`: de `CraftingRecipes` y `CookingRecipes`, `{"kind": "craft"|"cook", "key", "name": [en, es], "out": id, "qty": int, "ings": [[id_o_categoría, n]]}`.
  - `machines_by_input() -> dict[str, list[dict]]`: de `Data/Machines`, qué produce cada objeto en cada máquina: `{"machine": "(BC)12", "out": id_o_sabor, "price": int, "minutes": int}`. Los productos con sabor (`FLAVORED_ITEM`) se calculan con la tabla `FLAVORED` del código del juego: Vino ×3, Jugo ×2,25, Jalea y Encurtido ×2 + 50, Fruta y hongos deshidratados ×7,5 + 25 (por 5), Huevas añejadas ×2 de la hueva, Miel por flor (precio de la flor ×2 + 100). Se redondea hacia abajo.
  - `sources_by_item() -> dict[str, list[dict]]`: de dónde sale cada objeto. Tipos: `{"k": "crop", "seed": id, "days": n, "seasons": [..], "regrow": n}`, `{"k": "tree", ...}` (FruitTrees), `{"k": "shop", "shop": key, "price": n}` (`Data/Shops`, sólo ítems de id fijo), `{"k": "fish", "where": [lugar…], "seasons": [..]}` (`Data/Fish` + `Locations.Fish`), `{"k": "forage", "where": [...], "seasons": [...]}` (`Locations.Forage`), `{"k": "monster", "who": nombre, "rate": p}` (`Data/Monsters`, botín en pares `id prob`).

- [ ] **Paso 1: tests que fallan** (los números son del juego 1.6.15 y se cotejaron con la maqueta)

```python
class TestRelations(unittest.TestCase):
    def test_a_penny_le_encanta_el_melon(self):
        self.assertIn("Penny", relations.tastes_by_item()["254"]["love"])
    def test_ids_de_texto_en_los_gustos(self):
        self.assertEqual(relations.gift_taste("Abigail", "BasiliskPaw"), "like")
    def test_no_sociables_fuera(self):
        keys = {v["key"] for v in relations.villagers()}
        self.assertEqual(len(keys), 34)
        self.assertNotIn("Gunther", keys)
        self.assertNotIn("Marlon", keys)
    def test_paquetes_del_melon(self):
        rooms = {(b[0], b[1]) for b in relations.bundles_by_item()["254"]}
        self.assertIn(("Pantry", 1), rooms)
        self.assertIn(("Pantry", 3), rooms)
    def test_recetas_del_melon(self):
        outs = {r["name"][0] for r in relations.recipes() if any(i[0] == "254" for i in r["ings"])}
        self.assertTrue({"Pink Cake", "Fruit Salad"} <= outs)
    def test_maquinas_del_melon(self):
        by = {m["machine"]: m["price"] for m in relations.machines_by_input()["254"]}
        self.assertEqual(by["(BC)12"], 750)
        self.assertEqual(by["(BC)15"], 550)
    def test_semilla_del_melon(self):
        crop = next(s for s in relations.sources_by_item()["254"] if s["k"] == "crop")
        self.assertEqual((crop["seed"], crop["days"], crop["seasons"]), ("479", 12, [1]))
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar. Los gustos se resuelven contra todos los objetos de `Data/Objects` (los ids de texto incluidos), no sólo los que aparecen en las listas.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** commit `feat(stardew): regalos, paquetes, recetas, máquinas y fuentes de cada objeto`.

### Tarea 3: Datos del sitio y sprites (`site_data.py`, `sprites.py`)

**Archivos:**
- Crear: `games/stardew/tools/site_data.py`, `games/stardew/tools/sprites.py`
- Crear (salida, en git): `games/stardew/data/{meta.json,home.json,villagers.json,bundles.json}`, `games/stardew/data/site/{list.json,names-en.json,names-es.json,items/NN.json,es/NN.json}`, `site/public/stardew/{items,portraits,ui}/`
- Test: `games/stardew/tools/tests/test_site_data.py`

**Interfaces:**
- Consume: todo lo de las tareas 1 y 2.
- Produce (lo que lee el sitio):
  - **Objetos del sitio:** los de `Data/Objects` menos `Type` `Litter`, `Quest`, `asdf` e `interactive`, y los de nombre `"???"`. Más los 182 `BigCraftables` (id `"(BC)n"`, slug con su nombre).
  - `list.json`: `[id, slug, cat, price, w, h, has][]`. `w`/`h` = 16×16 para objetos y 16×32 para BigCraftables. `has` es una máscara de bits: 1 regalo especial, 2 paquete, 4 máquina, 8 receta, 16 se cultiva, 32 tienda, 64 pesca, 128 forraje, 256 monstruo.
  - `names-en.json`: `string[]` en el orden de `list.json`. `names-es.json`: `[nombre, slugEs][]`.
  - `items/NN.json` (`NN` = `pzShardOf(slug, 64)`, mismo hash que `site/src/zomboid/shard.ts`): `{slug: Ficha}`. La ficha es: `{id, slug, slugEs, name:[en,es], desc:[en,es], cat, prices (de sell_prices), energy, tastes, bundles, recipes, machines, sources, refs}`. `refs` lleva todo objeto o aldeano nombrado: `{id: [slug, slugEs, en, es, w, h]}`.
  - `es/NN.json`: `{slugEs: slug}` repartido por el slug español.
  - `villagers.json`: `[{key, slug, slugEs, name, birthday, romance, region, tastes: {love:[id…], like, dislike, hate}}]`. El neutral no va.
  - `bundles.json`: salas en el orden del juego (Despensa, Sala de manualidades, Pecera, Sala de calderas, Tablón de anuncios, Cámara acorazada, Sótano abandonado), cada una con sus paquetes (tarea 2) y `refs` de sus objetos.
  - `home.json`: `{featured: [id…] (12, uno por categoría grande), seasons: [{birthdays: [[día, key]], festivals: [[día, [en, es]]]}×4]}`. Los festivales salen de `Data/Festivals/FestivalDates` (en `raw/Data/Festivals/`).
  - `meta.json`: `{version: "1.6.15", generatedAt, counts: {items, villagers, bundles, recipes}}`.
  - Sprites (`sprites.py`): `site/public/stardew/items/<archivo>.png` a tamaño nativo. El nombre de archivo es el id, con `(BC)n` → `bc-n`. Salen de `Maps/springobjects.png` (24 por fila) o de `TileSheets/Objects_2.png` cuando `Texture` lo dice, y de `TileSheets/Craftables.png` (8 por fila, 16×32) para BigCraftables. Además `portraits/<key-en-minúsculas>.png` (primer cuadro 64×64 de `Portraits/<Key>.png`) y `ui/frame.png` + `ui/slot.png` armados de `Maps/MenuTiles.png` como en `scratchpad/maq/build_assets.py`: el marco de 9 partes en 192×192 y el casillero en (128,128,64,64).

- [ ] **Paso 1: tests que fallan**

```python
class TestSiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.out = site_data.build(write=False)
    def test_cada_fila_tiene_ficha_y_sprite(self):
        for row in self.out["list"]:
            self.assertIn(row[1], self.out["fichas"])
            self.assertTrue((SPRITES / sprite_file(row[0])).exists())
    def test_64_pedazos_y_el_mismo_hash_que_el_sitio(self):
        self.assertEqual(site_data.CHUNKS, 64)
        self.assertEqual(site_data.shard("melon"), 28)  # pzShardOf("melon", 64) del sitio (FNV-1a de 32 bits)
    def test_melon_en_espanol(self):
        f = self.out["fichas"]["melon"]
        self.assertEqual(f["slugEs"], "melon")
        self.assertEqual(f["name"], ["Melon", "Melón"])
        self.assertEqual(f["prices"]["base"], [250, 312, 375, 500])
    def test_slugs_unicos(self):
        slugs = [r[1] for r in self.out["list"]]
        self.assertEqual(len(slugs), len(set(slugs)))
    def test_34_aldeanos_con_retrato(self):
        self.assertEqual(len(self.out["villagers"]), 34)
```

Si dos objetos dan el mismo slug, al segundo se le suma el id (`slug-123`).

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar. `site_data.build(write=True)` escribe todo; `python games/stardew/tools/site_data.py` lo corre. `sprites.py` va aparte porque sólo cambia con un parche.
- [ ] **Paso 4:** pasan. Correr los dos scripts y revisar el tamaño de `games/stardew/data` (`du -sh`). Debería quedar debajo de unos 5 MB.
- [ ] **Paso 5:** commit con los datos y los sprites: `feat(stardew): datos del sitio y sprites`.

### Tarea 4: Armazón del área, direcciones, Portada y estética A

**Archivos:**
- Modificar: `site/src/route.ts` (copiar el bloque de Terraria, líneas 305-330 aprox., y el `View`), `site/src/areas.ts`, `site/src/areaFiles.ts`, `site/src/App.tsx`, `site/src/Nav.tsx`, `site/src/gameGroups.ts` (grupo `survival` y `GAME_ORDER`), `site/src/i18n.ts` (nombre del juego, aviso de no afiliación con ConcernedApe, panel de la portada general), `site/tsconfig.json` (`@stardew/*`), `site/vite.config.ts` (alias `@stardew`), `site/package.json` (`@fontsource/pixelify-sans`, `@fontsource/nunito`)
- Crear: `site/src/Stardew.tsx`, `site/src/stardewCopy.ts`, `site/src/stardew/StardewHome.tsx`, `site/src/stardew/ui.tsx`, `site/src/styles/stardew.css`
- Test: `site/test/stardewRoute.test.ts` y la línea de Stardew en `site/test/areas.test.ts`

**Interfaces:**
- Produce:
  - En `route.ts`: `View` suma `"stardew"`. `StardewTab = "items" | "villagers" | "bundles"`, `StardewSection = "home" | StardewTab`, `STARDEW_SEGMENT = "stardew-valley"`, `STARDEW_SECTIONS`, `STARDEW_DETAIL_SECTIONS = ["items", "villagers"]`, `STARDEW_PUBLISHED`, `STARDEW_SECTION_ES = { items: "objetos", villagers: "aldeanos", bundles: "centro-comunitario" }`, `registerStardewSlugs(slugs)`. `Route` suma `sdSection?: StardewSection`.
  - `Stardew.tsx`: `default` (el área), `preloadTab(route)`, `notePop`/`cameFromHistory`, `TABS` con una línea por pestaña (lo lee `areas.test.ts`), igual que `Terraria.tsx`.
  - `stardewCopy.ts`: `STARDEW_COPY: {en, es}` con `tabs`, `home`, `items`, `villagers`, `bundles`, `qualities`, `professions`, `tastes`, `seasons` y `useStardewCopy()`.
  - `stardew/ui.tsx`: `<Box>` (el marco de menú: `border-image: url(/stardew/ui/frame.png) 64 / 32px`), `<Slot>` (casillero de 64 px con el sprite a 48 px), `<Sprite id w h size lazy>`, `<Gold n>`, `<SdLoading>`.
  - La barra de pestañas de la maqueta A: botones naranja de madera, el activo crema. El fondo es cielo con el paisaje (`/stardew/ui/panorama.png`, copiado de `LooseSprites/stardewPanorama.png` por `sprites.py`). Sin logo: el título "Stardew Valley" va en Pixelify Sans.

- [ ] **Paso 1: tests que fallan** (en `stardewRoute.test.ts`, con el estilo de `terrariaRoute.test.ts`)

```ts
it("lee y escribe las direcciones de Stardew en los dos idiomas", () => {
  expect(parseRoute("/en/stardew-valley")).toMatchObject({ view: "stardew", sdSection: "home" });
  expect(parseRoute("/es/stardew-valley/centro-comunitario")).toMatchObject({ view: "stardew", sdSection: "bundles" });
  expect(routePath({ lang: "es", view: "stardew", sdSection: "villagers", detail: "abigail" } as Route)).toBe("/es/stardew-valley/aldeanos/abigail");
});
it("una ficha en español con slug anotado", () => {
  registerStardewSlugs({ items: { "pink-cake": "pastel-rosa" } });
  expect(routePath({ lang: "es", view: "stardew", sdSection: "items", detail: "pink-cake" } as Route)).toBe("/es/stardew-valley/objetos/pastel-rosa");
});
```

- [ ] **Paso 2:** `npx vitest run test/stardewRoute.test.ts test/areas.test.ts` → falla.
- [ ] **Paso 3:** implementar. La Portada muestra el título, una introducción, una tarjeta por pestaña con su ícono (un sprite del juego), los 12 destacados de `home.json` como casilleros y "Esta temporada": selector de las 4 estaciones con los cumpleaños (retrato y día) y los festivales. La estación que abre es primavera.
- [ ] **Paso 4:** pasan. `npm run dev` en el worktree (`vestigo-stardew` en `.claude/launch.json`, puerto libre) muestra `/en/stardew-valley` y `/es/stardew-valley` con la estética de la maqueta A.
- [ ] **Paso 5:** commit `feat(stardew): área, direcciones y portada con la estética del menú del juego`.

### Tarea 5: Objetos (lista y ficha)

**Archivos:**
- Crear: `site/src/stardew/data.ts`, `site/src/stardew/items/StardewItems.tsx`, `ItemList.tsx`, `ItemPage.tsx`
- Modificar: `Stardew.tsx` (`TABS.items`, `TAB_DATA.items`), `areaFiles.ts` (`STARDEW_TAB_FILES.items`)
- Test: `site/test/stardewData.test.ts`

**Interfaces:**
- Consume: los archivos de la tarea 3 por `@stardew/site/*`, `once`/`shardedFichas` de `zomboid/store.ts`, `pzShardOf` de `zomboid/shard.ts`, `LazyRows`.
- Produce (en `stardew/data.ts`, con la forma de `terraria/data.ts`): `SD_SHARDS = 64`, `Row`, `Ficha`, `peekList/loadList(lang)`, `peekItem/loadItem(slug)`, `preloadItemsRoute(route)`, `loadVillagers()`, `loadBundles()`, `say(pair, lang)`.

- [ ] **Paso 1: tests que fallan**

```ts
it("SD_SHARDS es el CHUNKS de site_data.py", () => expect(SD_SHARDS).toBe(64));
it("la ficha del melón trae precios, regalos, paquetes y máquinas", async () => {
  const f = await loadItem("melon");
  expect(f!.prices.base).toEqual([250, 312, 375, 500]);
  expect(f!.tastes.love).toContain("Penny");
  expect(f!.bundles.length).toBe(2);
});
it("abre en frío una ficha en español", async () => {
  await preloadItemsRoute({ lang: "es", view: "stardew", sdSection: "items", detail: "pastel-rosa" } as Route);
  expect(peekItem("pink-cake")).toBeTruthy();
});
it("un objeto sin relaciones no tiene listas", async () => {
  // La Baya gema dulce: ningún aldeano tiene gusto especial y no va en paquetes (medido el 22/10).
  const f = await loadItem("sweet-gem-berry");
  expect(f!.tastes).toEqual({});
  expect(f!.bundles).toEqual([]);
});
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar.
  - **Lista:** grilla de casilleros (`<Slot>`), 64 px, de a tandas con `LazyRows` (`tag="div"`, `rowHeight` medido en el navegador). Buscador por nombre y chips de categoría (Cultivos = -75, -79 y -80; Peces; Artesanía; Minerales y gemas; Cocina; Forraje; Máquinas = BigCraftables; Todo). También chips por fuente usando `has`: se cultiva, se pesca, se compra, para el Centro Comunitario. Al pasar el mouse, tooltip crema con nombre y precio. Los filtros van en la dirección (`?cat=`), así se pueden compartir.
  - **Ficha:** la de la maqueta A. Cabecera con sprite grande, nombre, descripción del juego y etiquetas (categoría, estaciones, comestible con energía/salud). Precios por calidad, con un selector de profesión si aplica. Después, cada sección sólo si tiene algo: "Le encanta a / Le gusta a / No le gusta a / Lo odia" (retratos enlazados a Aldeanos), "Centro Comunitario" (enlaza a la sala), "Se transforma en" (máquina, producto, precio y tiempo), "Se usa en" (recetas), "Se fabrica con" (receta propia), "Dónde se consigue" (semilla y días, tienda y precio, pesca con lugares y estaciones, forraje, monstruos con probabilidad).
  - Sólo la imagen grande de la ficha va sin `lazy`.
- [ ] **Paso 4:** pasan. En dev: `/en/stardew-valley/items`, `/en/stardew-valley/items/melon` y `/es/stardew-valley/objetos/melon`.
- [ ] **Paso 5:** commit `feat(stardew): pestaña Objetos con lista filtrable y ficha cruzada`.

### Tarea 6: Aldeanos

**Archivos:**
- Crear: `site/src/stardew/villagers/StardewVillagers.tsx`, `VillagerPage.tsx`
- Modificar: `Stardew.tsx`, `areaFiles.ts`
- Test: en `site/test/stardewData.test.ts`

**Interfaces:**
- Consume: `loadVillagers()`, `loadList(lang)` (para nombres y sprites de los objetos de cada gusto), `<Slot>`, `<Sprite>`.

- [ ] **Paso 1: test que falla**

```ts
it("Abigail tiene cumpleaños, se puede cortejar y le encanta la calabaza", async () => {
  const v = (await loadVillagers()).find((x) => x.key === "Abigail")!;
  expect(v.birthday).toEqual([2, 13]);
  expect(v.romance).toBe(true);
  expect(v.tastes.love).toContain("276");
});
```

- [ ] **Paso 2:** falla.
- [ ] **Paso 3:** implementar.
  - **Lista:** los 34 retratos en marcos de menú, con nombre y cumpleaños. Filtros: cortejables y estación del cumpleaños.
  - **Ficha:** retrato grande, cumpleaños, región, cortejable. Después cinco filas de casilleros (Le encanta, Le gusta, No le gusta, Lo odia), cada uno enlazado a su ficha de Objetos. Arriba de todo va "Regalos fáciles": los que le encantan y se compran o se cultivan, sacados de `has`.
- [ ] **Paso 4:** pasa. En dev: `/en/stardew-valley/villagers` y `/es/stardew-valley/aldeanos/abigail`.
- [ ] **Paso 5:** commit `feat(stardew): pestaña Aldeanos con regalos por gusto`.

### Tarea 7: Centro Comunitario

**Archivos:**
- Crear: `site/src/stardew/bundles/StardewBundles.tsx`, `site/src/stardew/bundles/progress.ts`
- Modificar: `Stardew.tsx`, `areaFiles.ts`
- Test: `site/test/stardewBundles.test.ts`

**Interfaces:**
- Produce en `progress.ts`: `type Done = Record<string, true>` (clave `"Sala/índice:posición"`), `readDone(): Done` y `writeDone(d: Done): void` (`localStorage` con clave `sdv-cc-v1`, cada lectura y escritura en `try/catch`), `bundleState(b, done): { have: number; need: number; complete: boolean }` y `roomState(room, done)`.

- [ ] **Paso 1: tests que fallan**

```ts
it("un paquete se completa con los requeridos, no con todos", () => {
  const b = { room: "Pantry", index: 1, need: 4, items: [["254",1,0],["258",1,0],["260",1,0],["262",1,0],["264",1,0]] };
  const done = { "Pantry/1:0": true, "Pantry/1:1": true, "Pantry/1:2": true, "Pantry/1:3": true } as const;
  expect(bundleState(b as any, done)).toEqual({ have: 4, need: 4, complete: true });
});
it("sin localStorage no rompe", () => {
  const orig = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
  expect(readDone()).toEqual({});
  expect(() => writeDone({ a: true })).not.toThrow();
  Object.defineProperty(globalThis, "localStorage", { value: orig, configurable: true });
});
```

- [ ] **Paso 2:** fallan.
- [ ] **Paso 3:** implementar. Una caja de menú por sala con barra de avance en texto ("3 de 6 paquetes"). Cada paquete muestra sus casilleros: se tilda con clic, con la marca de calidad y la cantidad. Además: la recompensa, un interruptor "sólo lo que falta" y un filtro de estación que deja los objetos que se consiguen en esa estación (por `sources` de la ficha; si no se sabe, el objeto queda visible). En el prerender se dibuja todo destildado.
- [ ] **Paso 4:** pasan. En dev: `/en/stardew-valley/bundles`. Tildar, recargar y ver que quedó tildado.
- [ ] **Paso 5:** commit `feat(stardew): Centro Comunitario con lista para tildar`.

### Tarea 8: SEO, publicación y medición

**Archivos:**
- Modificar, siguiendo lo que hace Terraria en cada uno: `site/src/sitemap.ts` (`StardewSitemapData`, grupo `stardew` en `SITEMAP_GROUPS`, portada, pestañas y una dirección por objeto y aldeano, `lastmod` de `meta.generatedAt`), `site/src/prerender.ts` (títulos y descripciones con lo que se busca: "Melon — Stardew Valley price, gifts, bundles and uses"; JSON-LD con migas; `og.jpg` propia), `site/src/PageMeta.tsx` (nombre de la ficha y 404 si no existe), `site/src/entry-server.tsx` (precargas), `site/vite.config.ts` (`readSitemapData`, la lista de chunks, la guardia de "cargando" con `isSdLoadingPage` en `site/src/stardew/loadingGuard.ts`), `site/src/navSearch.ts` (`stardew` en `NAV_SEARCH_GAMES`: objetos y aldeanos), `site/src/Home.tsx` (panel del juego), `site/public/404.html`, `netlify.toml` (`/stardew` y `/stardew-valley` → `/en/stardew-valley` con 301, caché de un día para `/stardew/items/*`, `/stardew/portraits/*` y `/stardew/ui/*`, y `games/stardew/data` en `ignore`), `.github/workflows/deploy.yml` (`games/stardew/data/**` en `paths`), `site/scripts/perf.mjs` (páginas nuevas)
- Crear: `games/stardew/tools/og.py` → `site/public/stardew/og.jpg` (1200×630: el paisaje del título con el nombre en pixel, sin logo)
- Test: lo que ya prueba cada archivo (`sitemap`, `prerender`, `navSearch`, `areas`)

- [ ] **Paso 1:** sumar los casos de Stardew a los tests existentes de sitemap y navSearch (el patrón de Terraria en cada uno). Verificar que fallan.
- [ ] **Paso 2:** implementar la integración.
- [ ] **Paso 3:** `npm test --prefix site` en verde.
- [ ] **Paso 4: medir.** Primero, en `main` sin Stardew: `npm run build` con el pico de RAM (Administrador de tareas o `/usr/bin/time`) y la duración. Después lo mismo en la rama. Anotar las dos mediciones en el diseño. `npm run check:links` tiene que dar 0. Correr `npm run perf -- --only stardew --budget` contra `vite preview` en el puerto 4173, con el Chromium headless shell de la memoria de Terraria. Las 8 páginas nuevas tienen que quedar dentro del presupuesto: `/en/stardew-valley`, `/en/stardew-valley/items`, `/en/stardew-valley/items/melon`, `/es/stardew-valley/objetos/pastel-rosa`, `/en/stardew-valley/villagers`, `/es/stardew-valley/aldeanos/abigail`, `/en/stardew-valley/bundles` y `/es/stardew-valley/centro-comunitario`.
- [ ] **Paso 5:** capturas con `site/scripts/shots.mjs` de esas páginas, en escritorio y en móvil.
- [ ] **Paso 6:** commit, push de `feat/stardew` y PR contra `main`. La descripción del PR lleva las mediciones y las capturas. No se fusiona sin que ZoTaD lo diga.

---

## Lo que queda para la etapa 2

Calculadora de cultivos, Pesca, Recetas y máquinas, Calendario. Los datos ya los produce `relations.py`.
