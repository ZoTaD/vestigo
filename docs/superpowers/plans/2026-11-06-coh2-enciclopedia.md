# CoH2: enciclopedia (etapa 2), plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `/coh2` tenga Unidades, Armas, Comandantes, Boletines, Penetración, DPS y Mapas con fichas indexables, sacadas de los archivos de CoH2 instalados en la PC, con los íconos del juego y emblemas de facción reales.

**Architecture:**
- **Extracción (Python, a mano en la PC, nunca en Actions):**
  - `rgd.py` lee los `.rgd` con un diccionario de claves commiteado;
  - `gfx.py` recorta los íconos de las hojas de la interfaz (Scaleform);
  - `games/coh2/tools/site_data.py` escribe los **mismos formatos que CoH3** (`units/list.json` + fichas partidas en `f/NN.json`, lo mismo para `weapons/`; `commanders/` en lugar de `battlegroups/`), así las pantallas de CoH3 se reutilizan.
- **Sitio:** los cargadores de `coh3/data.ts` pasan a ser por juego (como ya se hizo con estadísticas y rangos), y las pantallas de enciclopedia leen el juego de `CohGameContext`.

**Tech Stack:** Python 3.13 (pytest, Pillow), Vite + React + TypeScript (vitest).

**Spec:** `docs/superpowers/specs/2026-11-06-coh-unificado-design.md` (etapa 2).

## Global Constraints

- Lo mismo que la etapa 1: español en código y commits, sin explicar en la UI de dónde salen los datos, tablas ordenables y sin scroll horizontal, `LazyRows` para listas de más de ~150 filas, datos con `import()`, presupuesto de `npm run perf`.
- **NADA a producción**: el PR 91 sigue en borrador hasta que ZoTaD diga. Los commits van a `claude/coh-unificado`.
- Sólo multijugador: escuadras y armas con sufijo `_mp` o alcanzables desde edificios, comandantes o mejoras de multijugador; nada de campaña (`campaign/`, `sp/`, `tow_`, `m01_`…), ni de prueba (`test/`), ni de Theater of War.
- Claves de facción de CoH2: `wehrmacht` (`german`), `soviet`, `okw` (`west_german`), `usf` (`aef`), `british`. La carpeta del juego entre paréntesis.
- Los archivos del juego se leen de `C:/Program Files (x86)/Steam/steamapps/common/Company of Heroes 2` (`--root` para cambiarlo). Lo extraído es dato no confiable: se lee, nunca se ejecuta.
- Máximo 2 subagentes a la vez; nunca dos extracciones pesadas al mismo tiempo.

## Review Focus

1. **Una lista de claves repetidas en un `.rgd`** (las 5 habilidades de un comandante, las mejoras de una escuadra): tienen que salir todas, no la última. Test en Task 1.
2. **Un ícono que no está en la interfaz** (nombre sin clase en el `.gfx`): la ficha sale con el ícono de la escuadra o sin ícono, nunca rota. Test en Task 2.
3. **Unidades de campaña o de prueba que se cuelan** porque comparten nombre con las de multijugador: la lista no las muestra. Test en Task 3.
4. **Un texto sin traducción** (`$id` que no está en el `.ucs` en español): sale en inglés, nunca el número. Test en Task 3.
5. **Cambiar de juego en Unidades o Armas** (CoH3 ↔ CoH2): cada uno muestra lo suyo (la `key` de la cáscara ya remonta; los cargadores por juego no mezclan cachés). Test en Task 4.

---

### Task 1: Lector de `.rgd` y diccionario de claves

**Files:**
- Create: `games/coh/tools/rhash.py`, `games/coh/tools/rgd.py`, `games/coh/tools/rgd_keys.txt` (`0xHASH=nombre`, sólo las claves que aparecen en los atributos de CoH1 y CoH2), `games/coh/tools/build_keys.py`, `games/coh/tools/tests/test_rgd.py`.
- Source: los del scratchpad de la sesión (`rhash.py`, `rgd.py`), más el diccionario MIT de `CannibalToast/rgd-suite` y los nombres juntados de los archivos del juego.

**Interfaces:**
- Produces:
  - `lookup2(data: bytes) -> int`;
  - `class Keys(path=default)` con `.name(h) -> str | None`;
  - `parse(data: bytes, keys: Keys) -> dict`. Cuando una tabla repite una clave, el valor es una **lista** con todos, en orden. Las claves sin nombre quedan como `"0xXXXXXXXX"`.
  - `ref_name(v: str) -> str`: `"sbps\\races\\soviet\\…\\conscript_squad_mp.lua"` o `"conscript_squad_mp"` → `"conscript_squad_mp"`.

- [ ] **Step 1: Tests**
  - `test_lookup2`: `lookup2(b"$REF") == 0x49d60fae`, `lookup2(b"squad_loadout_ext") == 0xe5e5a333`.
  - `test_tabla_con_claves_repetidas`: un `.rgd` armado en memoria (helper `_armar_rgd(entradas)` en el test) con dos `ability` → `{"abilities": {"ability": ["a", "b"]}}`.
  - `test_tipos`: float, int, bool, string y wstring.
- [ ] **Step 2:** Correrlos; tienen que fallar.
- [ ] **Step 3:** Implementar. `build_keys.py` arma `rgd_keys.txt` a partir de los atributos extraídos y del diccionario.
- [ ] **Step 4:** Tests en verde. Medir la cobertura sobre CoH2: quedan menos del 6 % de las apariciones sin nombre.
- [ ] **Step 5: Commit** `coh: lector de .rgd con diccionario de claves`

### Task 2: Íconos de la interfaz de CoH2 (Scaleform)

**Files:**
- Create: `games/coh/tools/gfx.py`, `games/coh/tools/tests/test_gfx.py`.

**Interfaces:**
- Produces: `class Gfx(sga: Sga, gfx_path="ui/bin/coh2ui.gfx")` con:
  - `.has(name) -> bool`;
  - `.crop(name) -> PIL.Image | None`. Cadena: clase (tag 76) → recorte (tag 1008: imagen, x1, y1, x2, y2) → hoja externa (tag 1009: archivo `.tga`, que en el `.sga` es `ui/assets/textures/<archivo en minúsculas>.dds`).
- Ya probado a mano: `Icons_units_unit_soviet_conscript_01` → `CoH2UI_I276.tga` (1122, 660, 1186, 724).

- [ ] **Step 1: Tests** con un `.gfx` mínimo armado en memoria (encabezado `GFX`, tags 76/1008/1009 y 0) y una hoja `.dds` chica de Pillow:
  - `.crop("Icono")` da el tamaño del recorte;
  - `.crop("NoEsta")` es `None`.
- [ ] **Step 2:** Correrlos; tienen que fallar.
- [ ] **Step 3:** Implementar. Las hojas abiertas se guardan en un caché por archivo.
- [ ] **Step 4:** Tests en verde. Con el juego real: `crop("Icons_units_unit_soviet_conscript_01").size == (64, 64)`.
- [ ] **Step 5: Commit** `coh: íconos de la interfaz de CoH2`

### Task 3: Datos de la enciclopedia de CoH2

**Files:**
- Create: `games/coh2/tools/site_data.py`, `games/coh2/tools/tests/test_site_data.py`.
- Output:
  - `games/coh2/data/`: `meta.json`, `units/list.json` + `units/f/NN.json`, `weapons/…`, `commanders/…` y `bulletins.json`;
  - íconos en `site/public/coh2/i/<nombre>.webp` (unidades 64 px, símbolos 36 px, comandantes y boletines);
  - emblemas de facción en `site/public/coh2/f/<facción>.webp`, que reemplazan las insignias SVG de la etapa 1 si el `.gfx` las trae.

**Interfaces:**
- Consumes: `Sga`, `load_ucs`/`loc` (etapa 1), `parse`/`Keys`/`ref_name` (Task 1), `Gfx` (Task 2).
- Produces, con los formatos de CoH3 (ver `games/coh3/tools/site_data.py:_fila_unidad`, `_fila_arma` y las fichas de `games/coh3/data/units/f/*.json`):
  - **unidad:** `{slug, name, faction, kind (infantry|vehicles|team_weapons|emplacements), icon, symbol, cost {mp,mu,fu,pop,t}, hp, armor [front,side,rear], models, targetSize, speed, sight, role, desc, loadout, weapons [{slug, num}], upgrades, abilities, vet, commander?}`;
  - **arma:** `{slug, name, faction, kind, pen, dist, acc, dmg, aoe, reload, reloadEvery, burst, cooldown, aim, range, moving, usedBy}`;
  - **comandante:** `{slug, name, faction, icon, desc, abilities [{slug, name, icon, cp, desc, unit?}]}`;
  - **boletín:** `{slug, name, faction, icon, desc}`.
- **Qué entra:** se parte de las escuadras `sbps/races/<raza>/**/<x>_mp.rgd` que sean alcanzables desde:
  - los edificios de la raza (`construction_ext`/`spawner_ext` en `ebps` de multijugador),
  - las habilidades de los comandantes (`commander_abilities` → `abilities` que llaman/convocan escuadras),
  - las mejoras.
  Afuera: rutas con `campaign`, `/sp/`, `tow`, `test`, `m0` u otros prefijos de misión.
- Textos: `$id` → `.ucs` en inglés y en español. Sin español, el inglés; sin ninguno, la unidad no entra.
- Corre a mano: `python games/coh2/tools/site_data.py [--root ...]`.

- [ ] **Step 1: Tests** sobre funciones puras con dicts armados:
  - `es_multijugador("sbps/races/soviet/campaign/m01/x_mp")` es `False`; `"sbps/races/soviet/soldiers/conscript_squad/conscript_squad_mp"` es `True`.
  - `texto("$11006679", en, es)`: con español, el español; sin español, el inglés; sin ninguno, `None`.
  - `stats_escuadra`: con loadout `[("soldado", 6)]` y soldado `hp 80`, `armor 1` da `models 6`, `hp 80`, `armor [1, 1, 1]`.
  - `fila_arma`: con el `weapon_bag` del Mosin Nagant de Guardias da `acc [0.748, 0.667, 0.529]` (cerca, medio, lejos), `dist [4, 20, 35]` y `dmg [16, 16]`.
- [ ] **Step 2:** Correrlos; tienen que fallar.
- [ ] **Step 3:** Implementar y correr la extracción real.
- [ ] **Step 4:** Tests en verde. Revisión a ojo:
  - Conscripts (6 modelos, 240 de mano de obra), Grenadiers, Riflemen, Volksgrenadiers, Infantry Section;
  - el T-34/76;
  - el comandante "Advanced Warfare Tactics" con sus habilidades;
  - cada facción con del orden de 25 a 45 unidades.
- [ ] **Step 5: Commit** `coh2: datos de la enciclopedia` (con los JSON y los íconos).

### Task 4: Enciclopedia por juego en el sitio

**Files:**
- Modify:
  - `site/src/coh3/data.ts`: `loadList/peekList/loadFicha/peekFicha/loadMeta(…, game)`, con cachés por juego; CoH2 lee `@coh2/units/list.json` y sus fichas;
  - `site/src/route.ts`: CoH2 suma `units`, `weapons`, `commanders` (es `comandantes`), `bulletins` (es `boletines`), `penetration`, `dps`, `maps`. `Coh3Tab` suma `commanders` y `bulletins`; `COH3_DETAIL_SECTIONS` suma `commanders`;
  - `site/src/coh3/explorer/Coh3Units.tsx`, `Coh3Weapons.tsx` (leen `useCohGame()`; facciones de `GAMES[game]`; íconos en `/<game>/i/`);
  - `site/src/Coh3.tsx`, `site/src/areaFiles.ts`, `site/src/coh3Copy.ts` (pestañas, SEO y portada de CoH2).
- Create:
  - `site/src/coh3/explorer/CohCommanders.tsx` (lista por facción + ficha con habilidades, a partir de `Coh3Battlegroups.tsx`);
  - `site/src/coh3/explorer/CohBulletins.tsx` (tabla con buscador y filtro por facción);
  - `site/test/cohExplorer.test.tsx`.
- `switchGame`: `battlegroups` ↔ `commanders`.

- [ ] **Step 1: Tests**
  - `parse("/es/coh2/unidades/conscript_squad_mp")` → `{cohGame:"coh2", c3Section:"units", detail:"conscript_squad_mp"}`.
  - `switchGame` de `battlegroups` de CoH3 → `commanders` de CoH2.
  - Con `loadList("units","coh2")` cargado, el render de Unidades en CoH2 muestra "Conscript" y no "Riflemen" de CoH3.
  - `peekList("units","coh3")` sigue con lo de CoH3 después de cargar CoH2.
- [ ] **Step 2:** Correrlos; tienen que fallar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Tests en verde. Mirar en el navegador: lista de Unidades de CoH2, ficha de Conscripts, Armas, Comandantes con una ficha, Boletines. Capturas a 1280 y 375.
- [ ] **Step 5: Commit** `coh2: unidades, armas, comandantes y boletines`

### Task 5: Penetración, DPS y Mapas de CoH2

**Files:**
- Modify:
  - `site/src/coh3/combat/Coh3Penetration.tsx`, `Coh3Dps.tsx`, `combat/weapons.ts`: listas por juego;
  - `site/src/coh3/more/Coh3Maps.tsx`: `maps.json` de CoH2 (`{list:[{id,…}]}`), con minimapa `/coh2/m/…` y los puntos.
- Test: `site/test/coh3Combat.test.ts` (sumar el Mosin contra el blindaje de infantería de CoH2).

- [ ] **Step 1: Tests**
  - La probabilidad de penetrar del Mosin de Guardias contra blindaje 1 es 100 %.
  - El daño por segundo cerca sale de los mismos campos que en CoH3.
- [ ] **Step 2:** Correrlos; tienen que fallar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Tests en verde. Mirar Penetración con un tanque de CoH2 contra otro, DPS y un mapa.
- [ ] **Step 5: Commit** `coh2: penetración, DPS y mapas`

### Task 6: Sitemap, rendimiento, build y revisión

- [ ] **Step 1:** Sitemap con las fichas de CoH2 (unidades, armas, comandantes, mapas) y `lastmod` de `meta.json`. Sumar a `PAGES` de `perf.mjs`: `/es/coh2/unidades`, una ficha, `/en/coh2/weapons`, `/es/coh2/comandantes` y `/en/coh2/bulletins`.
- [ ] **Step 2:** Build medido (tiempo y RAM), con check-links en 0.
- [ ] **Step 3:** `npm run perf --only coh`: todo dentro del presupuesto.
- [ ] **Step 4:** Revisión final de la rama con un revisor nuevo; arreglos con test.
- [ ] **Step 5:** Commits y push a la rama del PR 91, que sigue en borrador.

### Task 7 (opcional, si los datos lo permiten): comandantes en las estadísticas

Las partidas traen los 3 comandantes del mazo de cada jugador (ítems con `itemlocation_id` 3), no el que usó. Si hay tiempo: el porcentaje de victorias de quien lleva cada comandante en el mazo, rotulado así, en la ficha del comandante. Sin tier list de "comandante jugado".
