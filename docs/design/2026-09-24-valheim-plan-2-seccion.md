# Valheim · Plan 2: la sección

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (lo ejecuta la misma sesión que lo escribió). Steps use checkbox (`- [ ]`) syntax.

**Goal:** La sección `/valheim` en localhost, completa: portada, diez pestañas (Comidas, Hidromieles, Armas, Armaduras, Herramientas, Construcción, Materiales, Criaturas, Biomas, Jefes) con tablas y filtros, y una ficha por objeto, criatura, bioma y jefe, en inglés y español, con los gráficos del juego.

**Architecture:** Dos capas. (1) Python: el extractor suma lo que piden las guías (jefes, poderes, debilidades, entornos, consejos de Hugin, arte) y un paso nuevo `site.py` arma, desde `games/valheim/data/`, los archivos que consume la web (`data/site/*.json`: una lista por pestaña con todo lo que la ficha necesita ya resuelto, un índice buscable, biomas y jefes). (2) React en `games/tft/ui`: vista `valheim` con sub-pestañas (`vhSection`) como PoE2, una tabla genérica configurada por pestaña, una ficha genérica y las guías.

**Tech Stack:** Python 3.14 + UnityPy (ya instalado), React 18 + Vite del sitio, vitest para lo puro del frontend.

Diseño: `docs/design/2026-09-24-valheim-enciclopedia.md`. SEO, prerender, sitemap, portada del sitio y publicación quedan para el Plan 3.

## Pedidos de ZoTaD que entran acá (2026-09-24, después de ver las maquetas)

- Más filtros para encontrar rápido.
- **El buscador no arrastra lo escrito al cambiar de pestaña**: cada pestaña arranca con sus filtros limpios.
- Las pestañas que faltaban: Armaduras, Materiales, Criaturas.
- Qué tener en cuenta en cada bioma y cada jefe, con imágenes.

## Global Constraints

- Nombres `{en, es}` oficiales del juego; la barra de Vestigo no se toca (sólo colores); sin filos de color en tarjetas ni filas.
- Rutas: `/{lang}/valheim` (portada), `/{lang}/valheim/{tab}`, `/{lang}/valheim/{tab}/{slug}`. `tab` ∈ `foods, meads, weapons, armor, tools, building, materials, creatures, biomes, bosses`. Slug desde el nombre en inglés (`slugify` de `route.ts`).
- Datos fuera del bundle principal: cada archivo de `data/site/` se pide al abrir su pestaña (`import.meta.glob`, como `poe2EncyclopediaData.ts`) y queda en memoria.
- Imágenes: íconos `/valheim/icons/<n>.webp`, interfaz `/valheim/ui/<n>.webp`, arte `/valheim/art/<n>.webp`.
- Fuentes: Averia Serif/Sans Libre desde `/valheim/fonts/`. Norse no.
- Actualización a mano: `extract` → `site` (el README lo dice).

## Archivos

| Archivo | Qué |
|---|---|
| `games/valheim/pipeline/extract.py` (mod) | `skill`, `setName`, debilidades, trofeo por criatura, altares, poderes, entornos por bioma, temas de Hugin, arte. |
| `games/valheim/pipeline/site.py` | De `data/*.json` a `data/site/*.json`. |
| `games/valheim/pipeline/tiers.py` | Puro: bioma de progresión de cada objeto, categorías de filtro. |
| `games/valheim/pipeline/tests/test_tiers.py` | Tests de lo anterior. |
| `games/tft/ui/src/route.ts` (mod) | Vista `valheim`, `vhSection`, parseo y armado. |
| `games/tft/ui/src/valheimData.ts` | Tipos y carga de `data/site`. |
| `games/tft/ui/src/valheimCopy.ts` | Textos de la sección (en/es). |
| `games/tft/ui/src/valheimTabs.ts` | Por pestaña: columnas, filtros y orden por defecto (puro, testeado). |
| `games/tft/ui/src/Valheim.tsx` | Portada, sub-navegación y ruteo interno. |
| `games/tft/ui/src/ValheimList.tsx` | Tabla con filtros genérica. |
| `games/tft/ui/src/ValheimDetail.tsx` | Ficha de objeto y pieza. |
| `games/tft/ui/src/ValheimGuide.tsx` | Ficha de criatura, bioma y jefe. |
| `games/tft/ui/src/styles/valheim.css` | Estilo del juego bajo `.vh`. |
| `games/tft/ui/src/{App,Nav}.tsx`, `vite.config.ts`, `styles/tokens.css` (mod) | Enchufar la vista, alias `@valheim`, paleta `[data-game="valheim"]`. |
| `games/tft/ui/test/valheim*.test.ts` | Rutas y filtros. |

---

### Task 1: El extractor suma lo de las guías

**Files:** Modify `games/valheim/pipeline/extract.py`, `records.py`; Test `tests/test_records.py`.

**Interfaces — produce, además de lo del Plan 1:**
- `items.json`: cada objeto suma `skill` (int, `m_skillType`) y ya tenía `setName`.
- `creatures.json`: cada criatura suma `weak: [dmg]`, `resist: [dmg]`, `immune: [dmg]` (de `m_damageModifiers`: 2 y 6 débil, 8 levemente débil; 1, 5 y 7 resistente; 3 y 4 inmune), `faction` (int) y `trophy` (id del trofeo que suelta, o null) e `icon` (el del trofeo).
- `bosses.json`: `[{id, name, health, order, summon: {item, amount, altar}, power: {name, tooltip, cooldown} | null, drops, trophy, icon, art}]` — desde `OfferingBowl` (`m_bossItem`, `m_bossItems`, `m_bossPrefab`) y los `ItemStand` con `m_guardianPower` (el SE_Stats trae `m_name`, `m_tooltip`, `m_cooldown`; el trofeo en `m_supportedItems` dice de qué jefe es). Se excluyen los altares cuyo `m_bossPrefab` no es una criatura (efectos, sitios de ofrenda).
- `environments.json`: `{biome: {cold, freezing, wet, freezingAtNight, coldAtNight, envs: [...]}}` — de `EnvMan.m_environments` (flags `m_isCold`, `m_isFreezing`, `m_isWet`, `m_isColdAtNight`, `m_isFreezingAtNight`) y de qué entornos usa cada bioma (`EnvMan.m_biomes` y `LocationList.m_biomeEnvironments`).
- `hugin.json`: `{topic: {label, text}}` desde las filas `tutorial_<x>_topic/_label/_text` de la tabla.
- `public/valheim/art/`: `biome_<id>.webp` (852×480, del bundle `d59cfac`: `biome_meadows`, `biome_blackforest`, `biome_swamp`, `biome_mountain`, `biome_heath`→`plains`, `biome_ocean`, `biome_mistlands`, `biome_ashlands`), `deepnorth_logo.webp` (`Valheim_DeepNorth_Logo`, no hay ilustración del Norte profundo) y `boss_<id>.webp` (arte de logros `eikthyr_sony`, `elder_sony`, `bonemass_sony`, `moder_sony`, `yagluth_sony`, `queen_sony`, `fader_sony`, `frozen_king_sony`).

- [ ] **Step 1: Test de `damage_mods`** (en `test_records.py`)

```python
from pipeline.records import damage_mods

class TestDamageMods(unittest.TestCase):
    def test_troll(self):
        # Leído del Troll el 2026-09-24.
        dm = {"m_blunt": 1, "m_slash": 0, "m_pierce": 2, "m_chop": 4, "m_pickaxe": 4, "m_fire": 0,
              "m_frost": 0, "m_lightning": 0, "m_poison": 0, "m_spirit": 3, "m_nonPlayer": 0}
        self.assertEqual(damage_mods(dm), {"weak": ["pierce"], "resist": ["blunt"], "immune": ["spirit"]})
```

`chop` y `pickaxe` con 4 ("ignorar") no son información útil sobre una criatura: se dejan afuera.

- [ ] **Step 2:** correr y ver que falla (`ImportError: damage_mods`).
- [ ] **Step 3: Implementar** en `records.py`:

```python
WEAK, RESIST, IMMUNE = {2, 6, 8}, {1, 5, 7}, {3}

def damage_mods(dm: dict) -> dict:
    """`HitData.DamageModifier` → qué le pega de más y qué de menos. Talar y minar no cuentan."""
    out = {"weak": [], "resist": [], "immune": []}
    for k, v in dm.items():
        name = k[2:]
        if name in ("chop", "pickaxe", "nonPlayer"):
            continue
        if v in WEAK: out["weak"].append(name)
        elif v in RESIST: out["resist"].append(name)
        elif v in IMMUNE: out["immune"].append(name)
    return out
```

y `item_record` suma `"skill": shared.get("m_skillType", 0)`.
- [ ] **Step 4:** en `extract.py`: `CLASSES` suma `"OfferingBowl", "ItemStand", "EnvMan"`; las criaturas suman `**damage_mods(c.tree.get("m_damageModifiers", {}))`, `faction`, `trophy` (el primer drop con `itemType == 13`) e `icon`; se escriben `bosses.json`, `environments.json`, `hugin.json` y se exporta el arte (`export_art`, con la lista de arriba, lossy calidad 85). Los poderes se resuelven con `g._objs[g.ref(file, pptr)].read_typetree()`.
- [ ] **Step 5: Verificar**

```bash
cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . && .venv/Scripts/python -m pipeline.extract
.venv/Scripts/python -c "import json;B=json.load(open('data/bosses.json',encoding='utf-8'));print([(b['id'],b['summon'],bool(b['power'])) for b in B])"
```
Expected: 8 jefes (Eikthyr, gd_king, Bonemass, Dragon, GoblinKing, SeekerQueen, Fader, FrozenKing) con su ofrenda (Moder sin ítem: se invoca con huevos en soportes) y 7 con poder; `environments.json` con `mountain.freezing` o `cold` verdadero y `deepnorth.freezing` verdadero.
- [ ] **Step 6: Commit** `feat(valheim): jefes, poderes, debilidades, entornos y arte para las guías`.

### Task 2: `tiers.py` + `site.py`

**Interfaces:**
- `tiers.item_tier(item_id, items, recipes_by_item, depth=0) -> str | None`: el bioma de progresión. Si se junta, se caza o se cultiva: el primer bioma (en orden de progresión) de sus fuentes. Si se fabrica: el más avanzado de sus ingredientes. Sin datos: `None`.
- `tiers.mead_effect(prefab: str) -> str` ∈ `health, stamina, eitr, resist, other` por el nombre del prefab (`MeadHealth*`, `MeadStamina*`, `MeadEitr*`, `Mead*Resist*`, resto).
- `tiers.food_focus(food) -> str` ∈ `health, stamina, eitr, balanced` (el mayor de los tres si supera al segundo por 30%; si no, balanced).
- `tiers.weapon_class(skill: int) -> str` (1 sword, 2 knife, 3 club, 4 polearm, 5 spear, 7 axe, 8 bow, 9 elemental, 10 blood, 11 fists, 12 pickaxe, 14 crossbow, otro "other").
- `tiers.armor_slot(item_type: int) -> str` (5 shield, 6 helmet, 7 chest, 11 legs, 17 cape, 18 utility, 24 trinket).
- `site.py` escribe `data/site/`: `foods.json, meads.json, weapons.json, armor.json, tools.json, building.json, materials.json, creatures.json, biomes.json, bosses.json, index.json, meta.json`. Cada fila trae `id, slug, name, icon` + lo de su tabla + `recipe` (con cada ingrediente como `{id, slug, tab, name, icon, amount, perLevel}`) + `sources` y `usedIn` resueltos igual (`{kind, …, ref: {slug, tab, name, icon}}`). `biomes.json`: por bioma `{id, name, art, env, creatures[], resources[], boss, foods[] (las mejores con ingredientes del bioma), tips[]}`. `index.json`: `[{slug, tab, en, es, icon}]`.

- [ ] Tests de `item_tier` (fuente directa, fabricado con ingredientes de dos biomas → el más avanzado, ciclo cortado por `depth`), `mead_effect`, `food_focus`, `weapon_class`, `armor_slot` en `tests/test_tiers.py`; correr, ver fallar, implementar, ver pasar.
- [ ] `site.py` + correr: `.venv/Scripts/python -m pipeline.site` imprime conteos por pestaña (comidas ~97, hidromieles ~24, armas ~180, armaduras ~190, construcción ~548, materiales ~320, criaturas ~150, biomas 9, jefes 8) y el peso total de `data/site` (objetivo < 3 MB).
- [ ] Commit `feat(valheim): datos de la web por pestaña, con bioma de progresión`.

### Task 3: Rutas, datos y enchufe en el sitio

- [ ] `route.ts`: `View` suma `"valheim"`; `export type ValheimSection = "home" | "foods" | … | "bosses"`; `VALHEIM_SECTIONS`; `Route.vhSection?`; `parseRoute` (`/valheim` → home; `/valheim/<tab>` y `/valheim/<tab>/<slug>`); `routePath` inverso. Test en `test/valheimRoute.test.ts` (ida y vuelta de las tres formas, sección desconocida → home).
- [ ] `vite.config.ts`: alias `@valheim` → `games/valheim/data/site`.
- [ ] `valheimData.ts`: tipos de las filas y `loadTab(tab)`, `peekTab(tab)`, `loadIndex()`, con caché como PoE2.
- [ ] `valheimCopy.ts`: textos en/es (pestañas, columnas, filtros, fichas, guías) con `useValheimCopy()`.
- [ ] `Nav.tsx`: Valheim deja de ser "Pronto" y es un enlace a `/valheim` (el buscador de la barra, dentro de Valheim, busca objetos como en PoE2). `App.tsx`: bloque `place === "valheim"` con `data-game="valheim"`. `tokens.css`: paleta `[data-game="valheim"]` (latón `#c8963e`, crema, madera).
- [ ] `styles/valheim.css`: `.vh` con Averia, `.vh-slot` (`item_bkg`), `.vh-panel` (`woodpanel_*` en `border-image`), `.vh-tabs` (`button_tab*`), barras de comida, chips de bioma.
- [ ] Verificar: `npx tsc --noEmit -p .` limpio; `/es/valheim` abre sin errores de consola.
- [ ] Commit `feat(valheim): la sección en el sitio, rutas y estilo del juego`.

### Task 4: La tabla con filtros (`valheimTabs.ts` + `ValheimList.tsx`)

**Interfaces:** `TABS: Record<Tab, TabConfig>`; `TabConfig = { columns: Column[]; filters: Filter[]; sort: {key, dir} }`; `Filter` es `{key, kind: "chips" | "select", options(rows) -> Option[], test(row, value) -> boolean}`; `applyFilters(rows, config, state) -> rows` puro.

Filtros por pestaña:
- Comidas: bioma (de progresión), enfoque (vida/aguante/eitr/equilibrada), estación.
- Hidromieles: efecto (curación, aguante, eitr, resistencias, otros), bioma.
- Armas: clase (espada, hacha, maza, lanza, atgeir, arco, ballesta, cuchillo, puños, magia elemental, magia de sangre), daño principal (cortante, contundente, perforante, elemental), bioma, estación.
- Armaduras: parte (casco, pecho, piernas, capa, escudo, utilidad, abalorio), set, bioma, estación.
- Herramientas: tipo (herramienta, flecha, perno, otra munición).
- Construcción: herramienta (martillo, azada, cultivador, banquetes), categoría del juego, sólo con confort, estación.
- Materiales: bioma (donde se encuentra), cómo se consigue (cazando, juntando, minando, talando, cultivando, pescando, en cofres, comprando), se usa en (comidas, armas, armaduras, construcción).
- Criaturas: bioma, tipo (jefe, normal), débil a.
- Todas: buscador (nombre en los dos idiomas, sin tildes) y orden por columna.

**El estado de filtros vive por pestaña y se reinicia al cambiar de pestaña** (pedido de ZoTaD): el componente se monta con `key={tab}`.

- [ ] Test `test/valheimTabs.test.ts`: `applyFilters` combina filtros con Y, el buscador encuentra "nucleo" en "Núcleo" y el nombre en el otro idioma, y cada pestaña declara al menos 2 filtros además del buscador.
- [ ] Implementar y verificar en el navegador cada pestaña (con y sin filtros, EN/ES, 375 px sin scroll de costado salvo la tabla).
- [ ] Commit `feat(valheim): pestañas con tabla, filtros y orden`.

### Task 5: La ficha (`ValheimDetail.tsx`)

- [ ] Marco de madera (`woodpanel_info`), ícono grande en casilla, nombre en los dos idiomas, descripción del juego.
- [ ] Según el tipo: barras de comida; daño y daño por nivel; armadura y bloqueo; confort.
- [ ] Receta con estación y nivel, ingredientes enlazados (casillas con cantidad), tabla de mejoras por calidad (cantidad = `amount + perLevel × (q − 1)`).
- [ ] Hidromieles: la cadena ingredientes → Malta en su caldero → Fermentador (duración) → ×N.
- [ ] "De dónde sale" agrupado por tipo, con el bioma y la probabilidad; "Se usa en" como mosaico de casillas enlazadas.
- [ ] Anterior/siguiente de la lista y volver a la pestaña.
- [ ] Commit `feat(valheim): ficha de cada objeto`.

### Task 6: Guías (`ValheimGuide.tsx`)

- [ ] Criatura: trofeo como imagen, vida, débil/resistente/inmune con los nombres de daño, botín con probabilidad, biomas.
- [ ] Bioma: la ilustración del juego de cabecera (Norte profundo: su logo), el entorno (frío, congelante, mojado, qué hidromiel conviene: resistencia a la escarcha si es congelante), las criaturas con su debilidad, los recursos que da y con qué se minan (nivel de pico), las mejores comidas que se cocinan con lo del bioma, el jefe (con enlace) y los consejos de Hugin que correspondan.
- [ ] Jefe: arte del logro, cómo se invoca (la ofrenda con su ícono y de dónde sale), vida, debilidades, poder que deja (nombre, texto oficial, recarga), botín.
- [ ] Portada `/valheim`: los nueve biomas con su ilustración en orden de progresión, las pestañas, buscador global y conteos.
- [ ] Commit `feat(valheim): guías de criaturas, biomas y jefes, y la portada`.

### Task 7: Verificación completa

- [ ] `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t .`; `cd games/tft/ui && npx vitest run && npx tsc --noEmit -p .`.
- [ ] Recorrer en el navegador (tab propia, sin mover la del usuario): portada, cada pestaña con filtros, una ficha de cada tipo, un bioma y un jefe; EN y ES; 375 px; consola sin errores.
- [ ] Dejar `vestigo-ui` corriendo y avisar a ZoTaD con enlaces.

## Self-review

- Pedidos de ZoTaD: filtros (Task 4), buscador que no arrastra (Task 4, `key={tab}`), Armaduras/Materiales/Criaturas (Tasks 2 y 4), biomas y jefes con imágenes (Tasks 1 y 6). Diseño: pestañas, ficha, "de dónde sale", "se usa en", hidromieles con su cadena, EN/ES, estilo del juego → Tasks 3-6. SEO/publicación → Plan 3.
- Los componentes de React no llevan su código entero en el plan: lo ejecuta la misma sesión que lo escribió; las interfaces, los filtros y las verificaciones están fijados arriba.
