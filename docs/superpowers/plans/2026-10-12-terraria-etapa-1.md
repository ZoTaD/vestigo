# Terraria etapa 1 — plan de implementación

> **Para quien lo ejecute:** se ejecuta en esta misma sesión, tarea por tarea (superpowers:executing-plans). Los
> pasos llevan casilla (`- [ ]`) para seguir el avance.

**Objetivo:** publicar la sección Terraria con Portada, Objetos (lista y ficha) y Árbol de crafteo.

**Arquitectura:** un extractor en `games/terraria/tools` (C# por reflexión sobre `TerrariaServer.exe` + Python) deja
JSON en `games/terraria/data`; el sitio los lee con `import()` por pestaña, igual que Rust, con las fichas partidas en
pedazos como Zomboid. La lógica del árbol es un módulo sin React.

**Tecnología:** C# (.NET Framework 4, `csc.exe` x86), Python 3.14 + Pillow + pytest, Vite + React 18 + TypeScript,
vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-terraria-etapa-1-design.md`

**Nota de formato:** ZoTaD aprobó el spec y se fue sin poder revisar este plan; lo ejecuta quien lo escribió, con el
contexto entero. Por eso las tareas fijan archivos, interfaces y pruebas, pero no repiten el código línea por línea.

## Restricciones globales

- Todo en español (código, comentarios, commits, docs). UI en inglés primero y español a la par; nunca "en español"
  como ventaja.
- Las 8 reglas de rendimiento de `CLAUDE.md`: presupuesto ≤ 250 pedidos, ≤ 200 imágenes, ≤ 3.000 nodos, sin errores;
  `LazyRows` en listas largas; imágenes de lista `lazy` + `async` + caja fija; datos nunca en el chunk de entrada;
  JSON importados enteros; `games/terraria/data` en el `ignore` de Netlify; build ≤ 6 GB medido antes y después.
- Publicar los datos de un juego no cambia el HTML de los otros (el HTML carga `/app.js`, sin hash).
- Sin bordes ni barras de color en tarjetas; las palabras no se cortan (container queries); nada sobre de dónde
  salen los datos en la UI; aviso de no afiliación con Re-Logic al pie.
- Máximo 2 agentes a la vez; el extractor nunca en paralelo con otro proceso pesado.
- No tocar archivos de Deadlock: ZoTaD trabaja ahí en otra rama.
- La parte de barra/portada del sitio depende de ZoTaD/vestigo#4 en `main`.

## Foco de revisión

1. Recetas con ciclos (plataformas ↔ madera): el árbol no puede colgarse ni repetir ramas sin fin → test del módulo.
2. Objetos con el mismo nombre (cajas de música, estandartes): slugs únicos y estables → test de `site_data.py`.
3. Objeto sin sprite: casillero vacío, no imagen rota → test de `site_data.py` (`sprite: false`) y componente.
4. `#hash` del árbol con un slug inexistente o no fabricable: buscador con aviso, sin error → test del módulo de
   selección.
5. Slug en español que no existe en inglés (o al revés) al cambiar de idioma: la ficha tiene que abrir → test de
   rutas ida y vuelta.

## Archivos

```
games/terraria/
  README.md                 cómo regenerar todo en cada parche
  tools/Dump.cs             vuelca objetos, recetas, grupos, estaciones, textos (y drops/tiendas si salen)
  tools/dump.ps1            extrae XNA del .msi, compila y corre Dump.exe contra la instalación
  tools/xnb.py              XNB + LZX → PNG
  tools/sprites.py          sprites de objeto (primer cuadro) y arte de la sección → site/public/terraria
  tools/site_data.py        caché → games/terraria/data
  tools/tests/test_site_data.py
  cache/                    (sin versionar) salida de Dump.exe
  data/meta.json, home.json, site/list.json, site/slugs-es.json, site/recipes.json, site/items/<n>.json
site/src/Terraria.tsx       cáscara de la sección: capas, regla de profundidad, pie
site/src/terraria/
  data.ts                   tipos + cargadores (import() de list, recipes y pedazos de ficha)
  i18n.ts                   textos de la sección EN/ES
  ui.tsx                    Slot (casillero con sprite), nombre con rareza, monedas
  TerrariaHome.tsx
  items/ItemList.tsx, ItemPage.tsx, classify.ts, stats.ts
  crafting/tree.ts          expansión, ciclos, totales (sin React)
  crafting/CraftingPage.tsx
  sitemapPages.ts
site/src/styles/terraria.css (+ terraria-items.css, terraria-crafting.css)
site/test/terraria-tree.test.ts, terraria-route.test.ts
```

Se modifican: `route.ts`, `areas.ts`, `areaFiles.ts`, `App.tsx`, `vite.config.ts`, `navSearch.ts`, `Nav.tsx`,
`gameGroups.ts`, `Home.tsx`, `i18n.ts`, `netlify.toml`, `scripts/perf.mjs`, `test/areas.test.ts`.

---

### Tarea 1: extractor del juego (`Dump.cs` + `dump.ps1`)

**Produce** en `games/terraria/cache/`:
- `items.json`: `[{id, internal, name, frames, deprecated, …campos primitivos de Item distintos del valor por defecto}]`
  (`internal` = nombre de la constante de `ItemID`, que es la clave de los textos).
- `recipes.json`: `[{i, createItem:{type,stack}, requiredItem:[{type,stack}], requiredTile, acceptedGroups:[int],
  needWater, needHoney, needLava, needSnowBiome, needGraveyardBiome, alchemy, corruption, crimson, …}]`
- `groups.json`: `{"<id>": {name, items:[int], icon:int}}` desde `RecipeGroup.recipeGroups`.
- `tiles.json`: `{"<tileId>": {name, item:int}}` para cada `requiredTile` usado (objeto con `createTile == tileId`
  y menor `placeStyle`; `name` de `Recipe.GetRequiredTileName` si no falla).
- `en-US.*.json`, `es-ES.*.json`: los recursos de textos.
- `drops.json`, `shops.json`: sólo si el bloque no falla.

- [ ] Pasar la sonda a `tools/Dump.cs`; sumar `internal` (reflexión sobre los campos `const` de `ItemID`),
      `frames` (`Main.itemAnimations[id]`, 1 si es nulo), `deprecated` (`ItemID.Sets.Deprecated[id]`).
- [ ] Sumar `groups.json` y `tiles.json`.
- [ ] Intento acotado de drops y tiendas: probar `Main.Initialize_AlmostEverything`/los inicializadores que pida
      `Projectile.SetDefaults` y `NPC.SetDefaults`; si en ~1 h de trabajo no sale, dejar el bloque con su `try` y
      anotar en el README dónde quedó.
- [ ] `dump.ps1`: `msiexec /a` del `xnafx40_redist.msi` a `cache/xna` (si falta), compilar, correr.
- [ ] Verificar: 6.195 objetos, 3.603 recetas, Terra Blade = True Night's Edge + True Excalibur + Broken Hero Sword.
- [ ] Commit.

### Tarea 2: sprites y arte (`xnb.py`, `sprites.py`)

**Produce:** `site/public/terraria/items/<id>.png` (primer cuadro: alto ÷ `frames`), `site/public/terraria/art/*`
(logo, fondos 0/1/2/3/4/7/8/9/11/69/127, pasto, casilleros, sol, nubes) y `cache/sprites.json` `{id: [w, h]}`.

- [ ] Pasar `xnb.py` de la sonda; `sprites.py` con la lista de arte y el recorte por cuadros.
- [ ] Verificar a ojo una hoja de contacto de 40 objetos al azar, incluidos animados.
- [ ] Commit (los PNG se versionan, como los de Rust).

### Tarea 3: datos del sitio (`site_data.py`) con tests

**Produce** (`games/terraria/data/`):
- `site/list.json`: `[[id, slugEn, nameEn, nameEs, kind, rare, w, h, k1, k2]]` (fila compacta; `w = 0` sin sprite).
- `site/slugs-es.json`: `{slugEs: slugEn}`.
- `site/items/<n>.json`: `{ "<slugEn>": Item }`, `n = id // 250`. `Item` = `{id, slug, slugEs, name:{en,es},
  tip:{en,es}, kind, rare, value, stats:{…}, recipes:[int], uses:[int], drops:[…], shops:[…]}`.
- `site/recipes.json`: `{recipes:[[out, qty, tile, [[item|-group, n]…], flags]], groups:{id:{en,es,items,icon}},
  tiles:{id:{en,es,item}}}`.
- `meta.json`: `{version, counts:{items, recipes, craftable}, generatedAt}`; `home.json`: destacados a mano.

- [ ] Tests primero (`pytest games/terraria/tools/tests`): slugs únicos; ancla con `slugs` previos; toda receta
      apunta a objetos presentes; todo slug de `list` está en su pedazo; grupos resueltos; Zenith con 10
      ingredientes; un objeto sin sprite sale con `w = 0`; receta con estación sin objeto conocido → error.
- [ ] Implementar: filtro (con nombre y no obsoleto), `kind` (clasificación), slugs, textos EN/ES, recetas, usos.
- [ ] Correr contra la caché real y commitear los datos.

### Tarea 4: base de la sección y Portada

- [ ] `route.ts` (vista `terraria`, secciones `home|items|crafting`, `objetos`/`crafteo` en ES, slugs ES↔EN),
      `areas.ts`, `areaFiles.ts`, `App.tsx`, alias `@terraria` en `vite.config.ts`, con su test de rutas.
- [ ] `Terraria.tsx`: capas, regla de profundidad (fila arriba en teléfono), pestañas apagadas de las etapas 2 y 3,
      pie con aviso de no afiliación. `terraria.css`, tipografía Comic Neue por `@fontsource`.
- [ ] `TerrariaHome.tsx` según la maqueta C. Conectar en localhost (`vestigo-terraria` en `launch.json`).
- [ ] Commit.

### Tarea 5: Objetos

- [ ] `classify.ts`/`stats.ts` (velocidad y retroceso en palabras con los umbrales del juego, monedas) con tests.
- [ ] `ItemList.tsx` (buscador, filtros por tipo y rareza, `LazyRows`), `ItemPage.tsx` (stats, recetas, usos,
      de dónde sale si hay, enlace al árbol), H1 y título.
- [ ] Sitemap y prerender de fichas (`sitemapPages.ts`, `vite.config.ts`). Commit.

### Tarea 6: Árbol de crafteo

**Interfaz** (`crafting/tree.ts`):
`expand(db, itemId, qty, choice: Record<number, number>) → Node`, con
`Node = {item, group?, qty, recipe?, crafts, children: Node[], base: boolean, cycle: boolean}`;
`totals(node) → {base: Map<number|string, number>, stations: number[]}`.

- [ ] Tests primero: Terra Blade (profundidad y totales), cantidad ×N con recetas que dan más de 1, ciclo
      plataforma ↔ madera, grupo como hoja única, cambio de receta por nodo, slug inexistente.
- [ ] Implementar `tree.ts`; `CraftingPage.tsx` (buscador, `#hash`, árbol plegable, resumen). Commit.

### Tarea 7: integración, medición y PR

- [ ] `navSearch.ts`, `Nav.tsx`, `gameGroups.ts`, `Home.tsx`, `i18n.ts` (requiere #4 en `main`: fusionar `main` en
      la rama primero; si #4 sigue abierto, basar esta parte en `feat/categorias` y decirlo en el PR).
- [ ] `netlify.toml` (ignore, caché de `/terraria/*`, redirección `/terraria`), `perf.mjs` (4 páginas).
- [ ] `npm test`, `npm run build` (anotar tiempo y pico de RAM, antes y después), `check:links`, `npm run perf`.
- [ ] PR a `main`. El merge lo hace ZoTaD.
