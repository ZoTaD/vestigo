# Project Zomboid — Objetos y Recetas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar en la rama las pestañas **Objetos** (`/objetos`, 3.826 fichas) y **Recetas** (`/recetas`, 1.170 fichas) de Project Zomboid, con la estética de la libreta, todo enlazado entre sí y prerenderizado para Google.

**Architecture:**
- **Datos del sitio:** un paso nuevo del extractor, `games/zomboid/tools/site.py`, arma a partir de lo extraído los datos "listos para el sitio":
  - una lista liviana por pestaña;
  - las fichas repartidas en 64 archivos (shards) por un hash del slug;
  - relaciones ya resueltas: qué recetas hacen y usan cada objeto, con qué se repara, qué enseña cada libro, qué objetos aceptan las etiquetas de cada receta.
- **Carga:** cada página baja una sola ficha-shard (~10 KB comprimido) y la lista, sólo en la página de lista.
- **Pestañas:** usan el andamio: `TABS`/`preloadTab`, `PZ_TAB_FILES`, los slugs por sección `virtual:pz-slugs-es/<sec>`, `PZ_PUBLISHED`, `seo.detail`.
- **SSR:** el prerender precarga la lista o el shard en `entry-server.tsx`.

**Tech Stack:** Python 3 (site.py), React 18 + Vite + TS, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md`. Andamio ya hecho: `docs/superpowers/plans/2026-09-30-zomboid-andamio.md` (leer sus "Interfaces").
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. npm/vitest desde `site/`; los extractores desde la raíz. `test/deadlock.test.ts` falla por una dependencia ajena: ignorarlo.
- **Nunca `git add -A`**: las teselas del mapa quedan sin commitear a propósito. Agregar sólo los archivos de cada tarea.
- **Estética "Libreta de supervivencia"** (maqueta C: `C:\Users\Zotad\AppData\Local\Temp\claude\C--Users-Zotad-Desktop-vestigo\ca96eec0-83c4-45c2-9dad-1452baabff6b\scratchpad\pzmaq\c.html`, clases `.pz-*` en `site/src/styles/zomboid.css`):
  - hojas de papel con renglones sobre el verde del escritorio;
  - títulos en Old Standard TT, notas a mano en Caveat (lápiz rojo) y texto en Noto Sans;
  - los sellos del juego (`/zomboid/map/stamps/map_<n>.png`, teñidos con `mask`) como viñetas;
  - íconos del juego con `image-rendering: pixelated`.
- **Reglas de la casa:**
  - sin bordes ni barras de color en tarjetas o filas (el estado va por tinte, texto o cifra);
  - las palabras no se cortan (títulos con container queries);
  - pestañas y tablas sin scroll horizontal de la página en el celular (una tabla ancha scrollea dentro de su caja);
  - todo texto en/es, con voseo rioplatense;
  - nada de "sacado de los archivos del juego".
- **Nombres del juego:** salen de los datos, sin inventar. Si falta el español, va el inglés.
- **Nada huérfano:** toda ficha tiene un `<a href>` desde la lista de su pestaña (prerenderizado), y los objetos y recetas se enlazan entre sí.
- **Rendimiento:**
  - la cáscara no crece;
  - los JSON grandes nunca van en el chunk del área, sólo por `import()` dinámico;
  - una ficha baja la lista sólo si la necesita.
- Comentarios y commits en español rioplatense, explicando el porqué.

---

### Task 1: `site.py` — los datos del sitio, repartidos y con sus relaciones

**Files:**
- Create: `games/zomboid/tools/site.py`
- Modify: `games/zomboid/tools/extract.py` (al final de `main`, después de escribir, llama a `site.main()`), `games/zomboid/README.md`
- Create: `games/zomboid/data/site/**` (lo genera)
- Create: `site/src/zomboid/shard.ts`, `site/test/zomboidSiteData.test.ts`

**Interfaces:**
- **Shard:** `shard(slug) = fnv1a32(utf8(slug)) % 64`, escrito como dos dígitos (`"07"`).
  - En Python, en `site.py`.
  - En TS, `export function pzShard(slug: string): string` en `site/src/zomboid/shard.ts`.
  - Tienen que dar lo mismo.
- **`games/zomboid/data/site/items-list.json`:**
  ```json
  { "cats": { "<displayCategory>": { "en": "...", "es": "...", "n": 0 } },
    "rows": [ { "id": "crowbar", "en": "Crowbar", "es": "Palanca", "cat": "ToolWeapon", "icon": "Crowbar", "w": 2, "n": 2, "t": "weapon" } ] }
  ```
  - Una fila por ficha de `index.json` (`sec: "items"`), en el orden del índice.
  - `icon`, `cat`, `w` (peso) y `t` (tipo) salen de la primera variante.
  - `n` es la cantidad de variantes.
  - Sin `stats`: la lista es para buscar y navegar.
- **`games/zomboid/data/site/items/<NN>.json`:** `{ "<slug>": FichaObjeto }`, con:
  ```ts
  type Loc = { en: string; es: string };
  type Ref = { id: string; en: string; es: string; icon?: string | null }; // id = slug de la ficha destino
  interface FichaObjeto {
    id: string; en: string; es: string; cat: string; catName: Loc;
    variants: { gameId: string; en: string; es: string; icon: string | null; type: string; w: number | null;
                stats: Record<string, unknown>; tags: string[]; tip?: Loc }[];
    makes: Ref[];      // recetas que lo producen
    uses: Ref[];       // recetas que lo consumen (por objeto o por etiqueta)
    tools: Ref[];      // recetas donde es herramienta (mode "keep")
    fixedWith: { fixer: Ref; uses: number; skills: Record<string, number> }[];  // con qué se repara
    fixes: Ref[];      // objetos que este repara
    teaches: Ref[];    // recetas que enseña (libros y revistas)
    skillBook?: { skill: Loc; from: number; levels: number; mult: number };
  }
  ```
- **`games/zomboid/data/site/recipes-list.json`:**
  ```json
  { "cats": { "<category>": { "en", "es", "n" } },
    "rows": [ { "id": "saw-log", "en": "Saw Log", "es": "Aserrar troncos", "cat": "Carpentry", "kind": "craft", "icon": "Plank" } ] }
  ```
  Las recetas sin categoría van a `"Miscellaneous"`. `icon` es el del primer resultado, o el de la receta si es de construcción.
- **`games/zomboid/data/site/recipes/<NN>.json`:** `{ "<slug>": FichaReceta }`, con:
  ```ts
  interface FichaReceta {
    id: string; en: string; es: string; kind: "craft" | "build"; cat: string; catName: Loc; time: number;
    skills: { skill: Loc; lvl: number }[]; xp: { skill: Loc; xp: number }[];
    inputs: { n: number; keep: boolean; tag?: string; fluid?: Loc; opts: Ref[] }[];  // opts: objetos que sirven (etiqueta resuelta)
    outputs: ({ n: number; item: Ref } | { n: number; choices: { from: Ref[]; item: Ref }[] } | { entity: Loc })[];
    stations: Loc[];
    learn: null | { books: Ref[]; skills: { skill: Loc; lvl: number }[]; research: Ref[]; traits: Ref[]; professions: Ref[] };
    tip?: Loc;
  }
  ```
  - `learn: null` es "se sabe desde el principio".
  - Los `mappers` (el resultado depende del ingrediente) se resuelven a `choices`.
  - Las recetas que dan rasgos o profesiones salen de `traits.json` y `professions.json` (`recipes`).
- **Determinismo:** mismo orden siempre y archivos reescritos sólo si cambian, como el resto del extractor.
- **Qué lo dispara:** `extract.py` llama a `site.main()` al final, y `site.py` también corre solo (`python games/zomboid/tools/site.py`).

- [ ] **Step 1: Tests que fallan** (`site/test/zomboidSiteData.test.ts`, con los archivos reales a través de `import.meta.glob("../../games/zomboid/data/site/**/*.json", { eager: true })`):
  - **Shards:** `pzShard` de cada fila de `items-list` da el archivo donde está su ficha, y la ficha tiene su `id`. Lo mismo para recetas.
  - **Cobertura:** cada ficha de `index.json` (`items` y `recipes`) está exactamente una vez en su shard.
  - **Enlaces:** todo `Ref.id` de una ficha de objeto que apunte a recetas existe en `recipes-list`, y el de una receta que apunte a objetos existe en `items-list`.
  - **Simetría:** si una receta tiene un objeto en `outputs`, la ficha de ese objeto la tiene en `makes`. Si lo tiene en `inputs` sin `keep`, la tiene en `uses`; con `keep`, en `tools`.
  - **Casos conocidos:**
    - `crowbar`: 2 variantes y `makes` con la receta de forjar palanca.
    - `saw-log`: entrada con etiqueta `base:saw` resuelta a varias sierras, marcada `keep`, y salida de 3 `plank`.
    - un libro de habilidad tiene `skillBook` con su multiplicador.
    - una revista tiene `teaches` no vacío.
    - `herbalist` o la primera receta con `learn.traits` lo muestra.
  - **Peso:** ningún shard pasa 120 KB crudos, y cada lista pesa menos de 400 KB.
- [ ] **Step 2:** Escribir `site.py` y `shard.ts`, correr `python games/zomboid/tools/site.py`, ver los tests en verde. Después `python games/zomboid/tools/extract.py` una vez más, y `git status` sólo muestra `data/site/**` nuevo.
- [ ] **Step 3: Commit.**
  ```bash
  git add games/zomboid/tools/site.py games/zomboid/tools/extract.py games/zomboid/README.md games/zomboid/data/site site/src/zomboid/shard.ts site/test/zomboidSiteData.test.ts
  git commit -m "feat(zomboid): los datos del sitio para Objetos y Recetas, repartidos en 64 partes y con sus relaciones resueltas"
  ```

---

### Task 2: La pestaña Objetos

**Files:**
- Create: `site/src/zomboid/items/data.ts`, `site/src/zomboid/items/ZomboidItems.tsx` (lista y ficha, o dos archivos si pasa de ~350 líneas), `site/src/styles/zomboid-items.css`
- Modify: `site/src/zomboidCopy.ts` (textos de la pestaña, en/es)
- Create: `site/test/zomboidItems.test.ts`

**Interfaces:**
- **`data.ts`**, con la misma forma que `site/src/d2r/index.ts`:
  - `loadItemsList()`, `peekItemsList()`, `loadItem(slug)`, `peekItem(slug)`, con `import()` dinámico de `@zomboid/site/items-list.json` y de `@zomboid/site/items/<NN>.json`;
  - los shards se cargan por un mapa de `import.meta.glob("@zomboid/site/items/*.json")` sin `eager`;
  - un fallo se reintenta en la próxima llamada.
- **Registro de slugs:** `ZomboidItems.tsx` importa y registra `virtual:pz-slugs-es/items` y `virtual:pz-slugs-es/recipes` al cargarse.
- **Lista** (`route.detail` vacío):
  - Texto propio arriba, en una hoja: qué hay, cuántos objetos, qué se puede hacer. Es lo que lee Google.
  - Buscador que filtra por nombre en los dos idiomas.
  - Chips de categoría (las 77 del juego, agrupadas visualmente por tipo si ayuda).
  - La lista agrupada por categoría: cada fila es un `<a>` (`RouteLink`) con ícono, nombre y peso, y "×N variantes" si `n > 1`.
  - **Todas las filas van en el HTML** (sin paginar) para que ninguna ficha quede huérfana. Los íconos llevan `loading="lazy"` y `width`/`height`.
- **Ficha** (`route.detail`):
  - Hoja con el ícono grande, el nombre, la categoría y el peso.
  - **"ID del objeto"** con botón copiar, y el comando `/additem "usuario" Base.X` con botón copiar.
  - Si hay más de una variante: tabla de variantes con ícono, nombre, peso y lo que las diferencia.
  - Stats por tipo, en renglones de libreta:
    - **arma:** daño mín–máx, alcance, velocidad, crítico y multiplicador, durabilidad y "1 en N" de desgaste, empuje, daño a puertas y árboles, habilidad;
    - **ropa:** zona del cuerpo, protección contra mordida, rasguño y bala, aislamiento, viento, agua;
    - **contenedor:** capacidad y reducción de peso;
    - **comida:** hambre, sed, calorías y macros, días fresco y podrido, si se cocina;
    - **libro:** habilidad, niveles y multiplicador;
    - lo demás, los campos que haya.
  - Secciones enlazadas, cada una con su sello:
    - **Se fabrica con** (`makes`) → recetas;
    - **Se usa en** (`uses`) → recetas;
    - **Herramienta en** (`tools`);
    - **Se repara con** (`fixedWith`, con usos y habilidad);
    - **Repara** (`fixes`);
    - **Enseña** (`teaches`).
  - La ficha que no existe muestra la lista con una nota ("no encontramos ese objeto"), como hace D2R.
  - Etiquetas de stats en/es en la copia.
- **Vuelta arriba** al cambiar de ficha o de lista, y un `.pz-loading` con estilo (una hoja vacía con "cargando…" a mano), como `D2r.tsx`. Estas dos cosas van en `Zomboid.tsx` y valen para todas las pestañas.

- [ ] **Step 1: Tests que fallan** (`site/test/zomboidItems.test.ts`, renderizando con `LangContext` y con `withPublished(["items","recipes"])`, después de `await loadItemsList()` y `await loadItem("crowbar")`):
  - La lista en español tiene un `<a>` por cada ficha, que son 3.826 (`href="/es/project-zomboid/objetos/…"`), el link a `palanca` y el texto propio.
  - La ficha `/es/project-zomboid/objetos/palanca` tiene:
    - "Palanca", el ID `Base.Crowbar` y `/additem`;
    - las stats de daño con las cifras de los datos;
    - un link a una receta en `/es/project-zomboid/recetas/…`.
  - En inglés, con los textos en inglés.
  - Un slug que no existe muestra la lista con la nota.
  - Un libro de habilidad muestra la habilidad y el multiplicador.
- [ ] **Step 2:** Implementar hasta verde, más `npx tsc -b`.
- [ ] **Step 3:** Mirarlo en `http://localhost:5178/es/project-zomboid/objetos` (publicado sólo en el test: para verlo, sumar `"items"` a `PZ_PUBLISHED` localmente sin commitearlo, o esperar a la Task 4).
- [ ] **Step 4: Commit** con sólo los archivos de la tarea.

---

### Task 3: La pestaña Recetas

**Files:**
- Create: `site/src/zomboid/recipes/data.ts`, `site/src/zomboid/recipes/ZomboidRecipes.tsx`, `site/src/styles/zomboid-recipes.css`
- Modify: `site/src/zomboidCopy.ts`
- Create: `site/test/zomboidRecipes.test.ts`

**Interfaces:**
- **`data.ts`:** `loadRecipesList`, `peekRecipesList`, `loadRecipe(slug)`, `peekRecipe(slug)`, igual que Objetos.
- **Registro de slugs:** `recipes` e `items`.
- **Lista:**
  - Texto propio.
  - Buscador en/es.
  - Filtro Fabricación / Construcción.
  - Agrupada por categoría de receta: cada fila es un `<a>` con el ícono del resultado y el nombre.
  - Todas en el HTML.
- **Ficha:**
  - Nombre y categoría.
  - **Ingredientes:** "N ×" más las opciones con ícono y link a su objeto. Si es una etiqueta: "cualquiera de:" y la lista. Un fluido va con su nombre.
  - **Herramientas:** las entradas con `keep`, con link.
  - **Resultado:** objeto(s) con link, u "opciones según el ingrediente" (`choices`), o el mueble construido (`entity`).
  - **Tiempo:** el valor del juego tal cual, con la etiqueta "tiempo (unidades del juego)". No se convierte a segundos sin verificarlo.
  - **Habilidad requerida** y **XP que da**.
  - **Estación de trabajo.**
  - **Cómo se aprende:** "la sabés desde el principio" / libros o revistas (link) / al llegar a nivel N de X / investigando tal objeto (link) / rasgos y profesiones.
  - **Nota** (`tip`).
- La receta que no existe muestra la lista con una nota.

- [ ] **Step 1: Tests que fallan** (`site/test/zomboidRecipes.test.ts`):
  - La lista en/es tiene un `<a>` por receta: 1.170.
  - `/es/project-zomboid/recetas/<slug de SawLogs>` muestra la sierra como herramienta (link a un objeto), 1 tronco de entrada y 3 tablas de salida (link a `tabla`/`plank` según el slug real).
  - Una receta con libro muestra el libro con link.
  - Una de construcción muestra el mueble.
- [ ] **Step 2:** Implementar hasta verde, más `npx tsc -b`.
- [ ] **Step 3: Commit.**

---

### Task 4: Publicar Objetos y Recetas en la rama

**Files:**
- Modify: `site/src/route.ts` (`PZ_PUBLISHED = ["items", "recipes"]`), `site/src/Zomboid.tsx` (`TABS`), `site/src/areaFiles.ts` (`PZ_TAB_FILES`), `site/src/entry-server.tsx` (precarga), `site/src/zomboid/ZomboidHome.tsx` (links), los tests que asumían "ninguna publicada"
- Create/Modify: `site/test/zomboidPublish.test.ts`

**Interfaces:**
- **`entry-server.tsx`:** `preloadZomboid(route)`, como `preloadPoe2`. Para `items` o `recipes` espera la lista (si no hay `detail`) o la ficha (si hay).
- **Portada de la libreta:**
  - en "Lo que hay", "Objetos" y "Recetas" pasan a ser links a sus pestañas;
  - las solapas Objetos y Recetas quedan vivas;
  - las herramientas siguen "Pronto".

- [ ] **Step 1: Tests** (`site/test/zomboidPublish.test.ts`):
  - **Sitemap:** tiene `/es/project-zomboid/objetos`, `/es/project-zomboid/objetos/palanca`, `/en/project-zomboid/items/crowbar`, `/es/project-zomboid/recetas` y las fichas; en total 2 × (1 + 3.826 + 1 + 1.170) direcciones de Zomboid, más la portada.
  - **Head de `/es/project-zomboid/objetos/palanca`:**
    - título que empieza por "Palanca";
    - hreflang cruzado;
    - migas "Vestigo › Project Zomboid › Objetos › Palanca".
  - **Body:** `renderApp(parseRoute("/es/project-zomboid/objetos/palanca"))` trae la ficha entera (stats y links), no "cargando".
  - **Paridad:** `PZ_TAB_FILES` y `TABS` tienen las mismas claves.
- [ ] **Step 2:** Implementar, más `npx tsc -b`, `npx vitest run` y `npm run build`.
  - Anotar el número de rutas prerenderizadas (tendría que subir ~9.990) y el tiempo del prerender.
  - Anotar el peso del chunk de Objetos y del de Recetas (sin datos: tienen que ser chicos).
- [ ] **Step 3: Revisión visual** en `http://localhost:5178`:
  - `/es/project-zomboid/objetos` → buscar "palanca" → abrir la ficha → seguir a una receta → volver;
  - en celular (el `resize_window` del panel Browser), sin scroll horizontal;
  - la consola sin errores.
- [ ] **Step 4: Commit.**
  ```bash
  git commit -m "feat(zomboid): Objetos y Recetas publicadas en la sección, con sus fichas en el sitemap"
  ```
