# Warframe etapa 3 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sumar a la sección Warframe dos pestañas: el Armador de builds (Warframes y armas primarias, secundarias y
cuerpo a cuerpo, con la build en la dirección) y la calculadora de Rivens.

**Architecture:** `games/warframe/tools/builder.py` (nuevo, lo llama `site_data.py`) escribe `data/builder/` y
`data/rivens/` desde el export. En el sitio, las cuentas son funciones puras en `site/src/warframe/builder/calc.ts`,
`buildUrl.ts` y `site/src/warframe/rivens/riven.ts`, probadas con vitest contra los casos del documento de fórmulas;
cada pestaña viaja en su chunk con sus textos en `warframeCopy.ts` y sus cargas en `warframe/data.ts`.

**Tech Stack:** Python 3 (stdlib + unittest), Vite + React + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-warframe-design.md`, sección "Etapa 3" (leela entera antes de cada
tarea), y `docs/superpowers/specs/2026-10-27-warframe-formulas.md` (fórmulas y casos de prueba con su fuente).

## Global Constraints

- Todo en español rioplatense: código, comentarios, commits. Mirá cómo comenta el código vecino y escribí igual.
- Commits escuetos: título + 2–4 viñetas, sin planes, IDs ni tráfico.
- No inventar datos ni fórmulas: lo que el documento de fórmulas marca "NO VERIFICADO" no se muestra. Nada de DPS.
- Sin bordes de color en tarjetas ni filas (tinte, texto o cifra). Sin logos de Digital Extremes. Polaridades con
  glifos propios simples (no el arte del juego).
- Los títulos no cortan palabras: se achican con container queries, nunca `overflow-wrap: anywhere`.
- Listas de más de ~150 filas con `LazyRows` (`site/src/LazyRows.tsx`), `rowHeight` medido en el navegador.
- Imágenes de lista con `loading="lazy"`, `decoding="async"` y tamaño fijo (usar `Icon` de `warframe/ui.tsx`).
- Datos nunca en el chunk de entrada: cada JSON con `import()`; los JSON se importan enteros.
- Claves de pestaña: `"builder"` (ES `armador`) y `"rivens"` (ES `rivens`).
- **Nunca dos builds a la vez** y no correr `npm run build` en las tareas 1–4 (sólo la 5). Tests de Python de a uno.
- Tests Python: `python -m unittest discover -s games/warframe/tools/tests`. Sitio: `cd site && npx vitest run <archivos>`; `npx tsc -b`.
- Servidor de la rama: `vestigo-warframe-3` (puerto 5239), ya levantado. Cada pestaña se prueba ahí apenas anda.
- Maqueta elegida: B "Hoja técnica" + cifras grandes de la C, en
  `C:/Users/Zotad/AppData/Local/Temp/claude/C--Users-Zotad-Desktop-vestigo--claude-worktrees-warframe-etapa-3-f06981/8b8f2260-e668-404a-aa1d-7bed46cd1dec/scratchpad/maq/` (`b.html`, `c.html`, `base.css`, `common.js`).

## Review Focus

- Una dirección de build vieja o rota (slug que ya no existe, mod en un casillero que no le corresponde, rango mayor al
  máximo, polaridad desconocida, basura): la página abre con lo que se pudo leer y descarta el resto. → Tarea 2.
- Un mod con efecto condicional o un texto que la tabla de patrones no conoce: se muestra el texto y no suma. → Tarea 1.
- Escopetas: el export da daño y estado por perdigón; el multidisparo base (`multishot` del export) se muestra aparte y
  el daño por disparo no se multiplica en silencio. → Tarea 2 (caso Hek).
- Un arma sin Riven (exaltadas, `omegaAttenuation` ≠ 1,2 y sin tipo de Riven) en `?w=`: la página dice que no acepta
  Riven en vez de mostrar rangos. → Tarea 4.
- Capacidad excedida: la build se sigue mostrando, con la capacidad en negativo y un aviso (no se bloquea). → Tarea 2.

---

### Task 1: Datos del armador y de Rivens (`builder.py`)

**Files:**
- Create: `games/warframe/tools/builder.py`, `games/warframe/tools/tests/test_builder.py`
- Modify: `games/warframe/tools/site_data.py` (`build()` suma las salidas de `builder.build_data(...)` y `archivos()` las escribe)
- Escribe: `games/warframe/data/builder/items.json`, `games/warframe/data/builder/mods-{warframe,primary,secondary,melee}.json`, `games/warframe/data/rivens/list.json`

**Interfaces (JSON que consumen las tareas 2–4; `Pair` = `[en, es]`):**

```ts
type Kind = "warframe" | "primary" | "secondary" | "melee";
type Pol = "madurai" | "vazarin" | "naramon" | "zenurik" | "unairu" | "penjaga" | "umbra"; // AP_ATTACK, AP_DEFENSE, AP_TACTIC, AP_POWER, AP_WARD, AP_PRECEPT, AP_UMBRA
// items.json: { items: BuildItem[] }
type BuildItem = {
  slug: string; name: Pair; kind: Kind; icon: string;   // slug e ícono = los del Arsenal (para enlazar a su ficha)
  cap: number;                                          // 30, o maxLevelCap
  compat: string[];                                     // valores de compatName que le entran (p. ej. ["Rifle", "Braton"] o ["WARFRAME", "Excalibur"])
  w?: { dmg: number[] /* damagePerShot, 20 posiciones */; cc: number; cd: number; sc: number; rate: number;
        mag?: number; reload?: number; ms: number; bow: boolean; shotgun: boolean; riven?: string };
  f?: { health: number; shield: number; armor: number; energy: number };   // a rango 30 (regla 34.0 + excepciones)
};
// mods-<kind>.json: { mods: BuildMod[] }
type BuildMod = {
  slug: string;              // el de la pestaña Mods (ficha `/mods/<slug>`); único por uniqueName
  name: Pair; pol: Pol | null; rarity: string; drain: number /* baseDrain, negativo en auras y posturas */;
  max: number /* fusionLimit */; slot: "normal" | "aura" | "stance"; exilus: boolean /* isUtility */;
  compat: string; icon?: string;
  fx: [StatKey, number[]][];  // por stat, el valor en cada rango 0..max, en puntos (165 = +165 %); sólo lo reconocido e incondicional
  text: Pair[];               // las líneas de levelStats al rango máximo, limpias (para mostrar)
};
type StatKey = "damage" | "impact" | "puncture" | "slash" | "heat" | "cold" | "electricity" | "toxin" | "blast"
  | "corrosive" | "gas" | "magnetic" | "radiation" | "viral" | "multishot" | "critChance" | "critDamage" | "statusChance"
  | "fireRate" | "magazine" | "reload" | "meleeDamage" | "attackSpeed" | "strength" | "duration" | "efficiency" | "range"
  | "health" | "shield" | "armor" | "energy";
// rivens/list.json
type RivenData = {
  types: { key: string /* "rifle" | "shotgun" | "pistol" | "melee" | "archgun" | "kitgun" | "zaw" */; name: Pair;
           stats: { tag: string; name: Pair; value: number /* el value del export, con signo */ }[] }[];
  weapons: { slug: string; name: Pair; type: string; d: number /* omegaAttenuation */; icon: string }[];
};
```

- [ ] **Step 1: Tests que fallan** en `test_builder.py` (leen `games/warframe/raw/`):
  - `test_parse_serration`: el mod con `uniqueName` `/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod` da `fx == [["damage", [15, 30, …, 165]]]`, `max == 10`, `pol == "madurai"`, `drain == 4`.
  - `test_parse_condicional`: ningún mod con "On Kill" / "on Kill" / "after" / "while" en la línea suma esa línea a `fx` (Galvanized Chamber: el multidisparo base sí, el condicional no).
  - `test_elementos_y_fisicos`: Hellfire → `heat`; Infected Clip → `toxin`; un mod con `<DT_SLASH_COLOR>Slash` → `slash`.
  - `test_aura_y_postura`: Steel Charge `slot == "aura"`, `drain == -4`, `max == 5`; una postura (`type == "STANCE"`) `slot == "stance"`.
  - `test_exilus`: un mod con `isUtility` tiene `exilus: true`.
  - `test_items`: Braton `w.dmg[:3] == [7.92, 7.92, 8.16]` (con tolerancia), `w.cc == 0.12`, `w.mag == 45`, `kind == "primary"`; Hek `shotgun == True`; un arco (`trigger` o nombre de clase que lo identifique: verificalo en el export) `bow == True`; Excalibur `f == {health: 370, shield: 370, armor: 240, energy: 150}`; Inaros `f.health == 2310` y `f.shield == 0`; Wisp `f.energy == 300`.
  - `test_rivens`: siete tipos; Rifle `WeaponCritChanceMod` ≈ 0.016666; Braton en `weapons` con `type == "rifle"` y `d == 1.2`; ningún arma con `d` distinto de 1,2 en `weapons`.
  - `test_compat`: cada `BuildItem` de arma tiene al menos 20 mods compatibles en su archivo, y Excalibur al menos 100.
- [ ] **Step 2:** correr y ver que fallan (`python -m unittest games.warframe.tools.tests.test_builder` o con discover).
- [ ] **Step 3: Implementar `build_data(items_arsenal, mods_slugs) -> dict[str, object]` en `builder.py`.**
  - Tabla de patrones de texto → `StatKey` (con test por cada patrón: los más comunes están en el diseño; los que no
    entran quedan sólo en `text`). Una línea suma sólo si su número es el único de la línea y no tiene condición.
  - Excepciones de rango 30: copiá la tabla "Rank Up Exceptions" de `https://wiki.warframe.com/w/Warframes` **releyendo
    la página** (el documento de fórmulas avisa que se reprodujo con un extractor); las del documento son el punto de
    partida. Constante `RANGO30` con comentario de fuente y fecha.
  - `compat` de cada objeto: los `compatName` que usan sus mods (clase de arma + nombre propio para los mods exclusivos,
    p. ej. "Braton"; Warframes: `WARFRAME`, `AURA` y su nombre). Verificá contra el export qué valores existen.
  - Slugs: los de `site_data.py` (Arsenal y Mods); no inventes otros.
- [ ] **Step 4:** correr los tests y que pasen; correr `python games/warframe/tools/site_data.py` para regenerar
  `data/` y mirar tamaños (cada archivo < 600 KB; si `mods-warframe.json` pasa, avisá).
- [ ] **Step 5: Commit** `feat(warframe): datos del armador y de Rivens`.

### Task 2: Cuentas del armador y la build en la dirección

**Files:**
- Create: `site/src/warframe/builder/calc.ts`, `site/src/warframe/builder/buildUrl.ts`, `site/test/warframeBuilder.test.ts`

**Interfaces:**
- Consumes: los tipos de la Tarea 1 (copialos a `site/src/warframe/data.ts` como `BuildItem`, `BuildMod`, `StatKey`, `Pol`, `Kind`).
- Produces:
  ```ts
  type Slot = { id: SlotId; pol: Pol | null; mod: BuildMod | null; rank: number };
  type SlotId = "aura" | "stance" | "exilus" | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  type Build = { item: BuildItem; slots: Slot[]; reactor: boolean };
  modDrain(mod: BuildMod, rank: number, slotPol: Pol | null): number          // positivo = gasta; auras/posturas negativo = suman
  capacity(build: Build): { total: number; used: number; free: number }
  formas(build: Build): number                                                // casilleros con polaridad puesta
  weaponStats(item: BuildItem, slots: Slot[]): WeaponStats                    // base y modificado
  frameStats(item: BuildItem, slots: Slot[]): FrameStats
  type DmgType = "impact"|"puncture"|"slash"|"heat"|"cold"|"electricity"|"toxin"|"blast"|"corrosive"|"gas"|"magnetic"|"radiation"|"viral";
  type WeaponStats = { base: WStat; mod: WStat };
  type WStat = { total: number; byType: Partial<Record<DmgType, number>>; cc: number; cd: number; sc: number; rate: number; mag?: number; reload?: number; ms: number };
  type FrameStats = { base: FStat; mod: FStat };
  type FStat = { health: number; shield: number; armor: number; energy: number; strength: number; duration: number; efficiency: number; range: number };
  encodeBuild(b: Build): string            // el `search` sin "?"
  decodeBuild(search: string, items: BuildItem[], mods: BuildMod[]): Build | null   // null sólo si `i` no existe
  modFits(mod: BuildMod, item: BuildItem, slot: SlotId): boolean
  ```

- [ ] **Step 1: Tests que fallan**: un `it` por cada fila de las tablas "Casos de prueba" del documento de fórmulas
  (armas, Warframes, drenaje), con el valor esperado de la tabla y tolerancia de 0,01 (o la que diga la fila). Armá
  los `BuildItem`/`BuildMod` de prueba a mano con los números del export que cita cada fila. Además:
  - `decodeBuild` con basura (`m=9.no-existe.99`, `p=x`, rango mayor al máximo, un mod de aura en el casillero 0): no
    tira, descarta lo inválido y recorta el rango; `encodeBuild(decodeBuild(s))` es estable.
  - capacidad excedida: `free < 0` sin error.
  - Hek: `base.total` es por perdigón (75) y `ms` = 7.
  - eficiencia con dos mods que pasan el tope: 175.
- [ ] **Step 2:** `cd site && npx vitest run test/warframeBuilder.test.ts` → fallan.
- [ ] **Step 3: Implementar** según el documento de fórmulas: elementos sobre el daño base ya modificado; combinación por
  orden de casillero (0–7, después exilio) con los innatos del arma al final; cuantización de cada tipo a 1/32 del
  daño base total (caso Nagantaka); estado por perdigón; arcos ×2 en cadencia; cargador al más cercano; recarga
  `base / (1 + %)`; Warframes `(rango30) × (1 + Σ%)`, eficiencia tope 175. Polaridad distinta: ×1,25 al más cercano.
  `meleeDamage` suma como `damage` y `attackSpeed` como `rate` en cuerpo a cuerpo.
- [ ] **Step 4:** tests en verde y `npx tsc -b` sin errores.
- [ ] **Step 5: Commit** `feat(warframe): cuentas del armador`.

### Task 3: Pestaña Armador

**Files:**
- Modify: `site/src/route.ts` (WfTab, WF_SECTIONS, WF_PUBLISHED, WF_SECTION_ES += `builder`→`armador` y `rivens`→`rivens`), `site/src/warframeCopy.ts` (WF_TABS, tabs, seo, cards de la portada, textos `builder` y `rivens`, en y es), `site/src/Warframe.tsx` (TABS y TAB_DATA de `builder`), `site/src/areaFiles.ts` (WF_TAB_FILES), `site/src/warframe/data.ts` (`loadBuilderItems()`, `loadBuilderMods(kind)` con un `import()` por archivo), `site/src/warframe/WarframeHome.tsx` (ícono de la tarjeta), `site/src/warframe/arsenal/` (la ficha de Warframes y armas primarias/secundarias/cuerpo a cuerpo suma "Armar build" → `/builder?i=<slug>`), `site/src/styles/warframe.css`, `site/scripts/perf.mjs` (PAGES += `/en/warframe/builder`, `/es/warframe/armador?i=excalibur`, `/en/warframe/builder?i=braton&m=…` con una build de 6 mods).
- Create: `site/src/warframe/builder/WfBuilder.tsx` (y los componentes que hagan falta en esa carpeta).
- Test: extender `site/test/warframeRoute.test.ts`, `warframeSeo.test.ts`, `areas.test.ts`.

- [ ] **Step 1: Tests que fallan**: rutas `/en/warframe/builder` y `/es/warframe/armador` parsean a `wfSection: "builder"` y vuelven a la misma dirección (el `search` se conserva); `areas.test.ts` pide el archivo de `builder`; SEO con título y descripción en los dos idiomas.
- [ ] **Step 2:** que fallen; **Step 3:** la plomería; **Step 4:** que pasen.
- [ ] **Step 5: La pantalla** como la maqueta B + cifras de la C:
  - Arriba: elegir objeto (buscador con los ~600 objetos; `LazyRows` si la lista abierta pasa de 150), nombre, ícono,
    tipo, enlace a su ficha del Arsenal. Cifras grandes base → build con la diferencia, y "Fijar como referencia".
  - Izquierda (arriba en el teléfono): capacidad usada/total, potenciador, Formas, "Copiar enlace"; aura/postura,
    exilio y los 8 casilleros en lista. Tocar un casillero abre ahí su rango, su polaridad y el buscador de mods
    compatibles (filtro por polaridad y texto; `LazyRows`).
  - Derecha: tabla base / build / cambio; los mods que no suman (texto no reconocido) aparecen como "no se cuenta".
  - Sin objeto elegido: la pantalla dice cómo empezar y muestra 6 Warframes y 6 armas para arrancar.
  - La dirección se actualiza con `history.replaceState` al cambiar la build (sin agregar entradas al historial).
- [ ] **Step 6:** probar en http://localhost:5239/en/warframe/builder y /es/warframe/armador: escritorio y 375 px, sin
  errores de consola, una build de 6 mods del Braton que coincide con los tests, enlace copiado que reabre igual.
  Capturas con zoom a cifras y títulos.
- [ ] **Step 7: Commit** `feat(warframe): armador de builds`.

### Task 4: Pestaña Rivens

**Files:**
- Create: `site/src/warframe/rivens/riven.ts`, `site/src/warframe/rivens/WfRivens.tsx`, `site/test/warframeRiven.test.ts`
- Modify: `site/src/Warframe.tsx` (TABS/TAB_DATA de `rivens`), `site/src/areaFiles.ts`, `site/src/warframe/data.ts` (`loadRivens()`), `site/src/warframeCopy.ts` (si faltan textos), `site/src/styles/warframe.css`, `site/scripts/perf.mjs` (`/en/warframe/rivens`, `/es/warframe/rivens?w=braton`).

**Interfaces:**
- Consumes: `RivenData` (Tarea 1).
- Produces:
  ```ts
  type Combo = "2" | "2-" | "3" | "3-";  // positivos y con/sin negativo
  rivenRange(value: number, d: number, combo: Combo, curse: boolean, rank?: 8): [min: number, max: number]   // en %; para el negativo, curse = true
  rivenGrade(value: number, d: number, combo: Combo, curse: boolean, shown: number): number | null          // 0..100, null si cae afuera
  ```

- [ ] **Step 1: Tests que fallan**: cada fila de "Casos de prueba — Rivens" del documento de fórmulas (rango 8, D 1,2,
  min W 0,9 / max W 1,1) con tolerancia 0,01; `rivenGrade` del mínimo = 0, del máximo = 100, fuera de rango = null.
- [ ] **Step 2–4:** que fallen, implementar, que pasen.
- [ ] **Step 5: La pantalla**: buscador de arma (o los 7 tipos), aviso de que desde el Hotfix 44.1.3 no hay disposición
  (con el valor del export), tabla por stat con mín–máx en las 4 combinaciones (en el teléfono, una tarjeta por stat
  con las cuatro), y "¿qué tan bueno salió?" (stat + combinación + valor → %). `?w=<slug>` elige el arma; un arma sin
  Riven lo dice.
- [ ] **Step 6:** probar en localhost en los dos idiomas, escritorio y 375 px; capturas.
- [ ] **Step 7: Commit** `feat(warframe): calculadora de Rivens`.

### Task 5: Medir, anotar y PR

- [ ] **Step 1:** con nada más compilando, `cd site && npm run build` midiendo tiempo y pico de RAM igual que en la
  etapa 2 (sección "Mediciones" del diseño); `check-links` en 0.
- [ ] **Step 2:** `npm run preview` (4173) y `npm run perf` con `PW_CHROMIUM` como en la etapa 2; todas las páginas
  dentro del presupuesto.
- [ ] **Step 3:** anotar en el diseño "Mediciones de la etapa 3" (tabla de build y de perf).
- [ ] **Step 4:** tests completos (Python y vitest) en verde; push y PR escueto contra `main` (título + 2–4 viñetas).
  No fusionar.
