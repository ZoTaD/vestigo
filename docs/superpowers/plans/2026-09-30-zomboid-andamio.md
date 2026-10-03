# Project Zomboid — el andamio para las pestañas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la base de Zomboid lista para construir las pestañas en paralelo sin que cada tanda toque los mismos archivos compartidos: direcciones que no pisan las carpetas de assets, caché de los íconos, un extractor que corta en vez de rotular mal, el índice de fichas con sus slugs en español, y el cableado de pestañas lazy + nombres de ficha en el `<head>` y el sitemap.

**Architecture:** Sale de la revisión general de la base (2026-09-30). Se replica para Zomboid el patrón de Diablo II: `TABS` + `preloadTab` en el área, `PZ_TAB_FILES` en `areaFiles.ts`, un módulo virtual `virtual:pz-slugs-es` armado en el build desde un índice de fichas (`games/zomboid/data/index.json`, lo escribe el extractor), `detailNames` en el prerender y el cargador de nombres en `PageMeta`. Con los mapas vacíos: cada pestaña después sólo suma una línea en cada uno.

**Tech Stack:** React 18 + Vite + TypeScript, Vitest, Python 3 (el extractor), Netlify.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md`. Plan anterior (ya ejecutado): `docs/superpowers/plans/2026-09-30-zomboid-base.md`.
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. npm/vitest desde `site/`. `test/deadlock.test.ts` falla por una dependencia que falta en este worktree: no es de este trabajo.
- **Nunca `git add -A`**: las teselas del mapa (`site/public/zomboid/map/{sat,forest}`) quedan sin commitear a propósito. Agregar sólo los archivos de cada tarea.
- Comentarios y commits en español rioplatense, explicando el porqué, como el resto del repo.
- Las carpetas de assets nunca se llaman como una página (regla de `netlify.toml`): las páginas de Zomboid viven bajo `/project-zomboid` y `/{en,es}/project-zomboid`; los assets bajo `/zomboid/...`.
- La dirección interna de una ficha es su slug en inglés (`crowbar`); en español se traduce con el registro de slugs (`registerPzSlugs`), igual que Diablo II.
- Reglas de UI: sin bordes de color en tarjetas; las palabras no se cortan; pestañas que bajan de fila en el celular; todo texto en/es; nada de "sacado de los archivos del juego".

---

### Task 1: Direcciones — sin el atajo `/zomboid`, pestañas no publicadas a la portada, slugs de cualquier idioma

**Files:**
- Modify: `site/src/route.ts`
- Modify: `site/test/zomboidRoute.test.ts`, `site/test/zomboidHome.test.ts`, `site/test/zomboidSeo.test.ts`
- Modify: `netlify.toml`, `site/src/Zomboid.tsx`

**Interfaces:**
- `parseRoute` para Zomboid:
  - sólo reconoce `/{lang}/project-zomboid/...` y `/project-zomboid/...`;
  - una pestaña que no está en `PZ_PUBLISHED` (o desconocida) devuelve la portada (`pzSection: "home"`, sin `detail`);
  - el slug de una ficha se traduce con `pzSlugsEs.toId` en los dos idiomas.
- El mismo cambio de `toId` en los dos idiomas vale para Diablo II (`d2rSlugsEs.toId`).
- `PZ_PUBLISHED` sigue siendo `export const PZ_PUBLISHED: PzTab[] = []` (un array que los tests pueden llenar y vaciar).

- [ ] **Step 1: Tests que fallan**

En `site/test/zomboidRoute.test.ts`:
- Reemplazar el test "/zomboid a secas…" por uno que diga que `/es/zomboid` ya **no** es Zomboid: `expect(parseRoute("/es/zomboid").view).not.toBe("zomboid")`. El 301 lo hace Netlify.
- Envolver los tests de pestañas y fichas con `beforeAll(() => { PZ_PUBLISHED.push(...PZ_SECTIONS); })` y `afterAll(() => { PZ_PUBLISHED.splice(0); })`.
- Sumar:

```ts
  it("una pestaña que todavía no se publicó cae en la portada, con su dirección corregida", () => {
    PZ_PUBLISHED.splice(0);
    expect(parseRoute("/es/project-zomboid/mapa")).toMatchObject({ view: "zomboid", pzSection: "home" });
    expect(routePath(parseRoute("/es/project-zomboid/mapa"))).toBe("/es/project-zomboid");
    PZ_PUBLISHED.push(...PZ_SECTIONS);
  });

  it("un slug en español bajo /en también abre la ficha (y la dirección se corrige al inglés)", () => {
    registerPzSlugs({ items: { crowbar: "palanca" } });
    const r = parseRoute("/en/project-zomboid/objetos/palanca");
    expect(r).toMatchObject({ pzSection: "items", detail: "crowbar" });
    expect(routePath(r)).toBe("/en/project-zomboid/items/crowbar");
  });
```

En `site/test/zomboidHome.test.ts`, el test "las pestañas que todavía no tienen página…" y "una pestaña que todavía no existe…" usan la primera pestaña no publicada en vez de `mapa` fijo. Tomarla de `PZ_TABS.find((t) => t !== "home" && !PZ_PUBLISHED.includes(t))`, con su nombre en español de `PZ_SECTION_ES`. Si no queda ninguna, el test se saltea con `it.skipIf`.

En `site/test/zomboidSeo.test.ts`, el test "las pestañas que todavía no se publicaron no entran" pasa a verificar que toda dirección `/xx/project-zomboid/<tab>…` del sitemap tenga su `<tab>` (leído con `parseRoute`) dentro de `PZ_PUBLISHED`.

Run: `npx vitest run test/zomboidRoute.test.ts test/zomboidHome.test.ts test/zomboidSeo.test.ts`
Expected: FAIL (el atajo todavía existe y las pestañas no publicadas no caen en la portada).

- [ ] **Step 2: `route.ts`**

- En `parseRoute`, la condición del bloque de Zomboid pasa a `if (head === PZ_SEGMENT) {` (sin `|| head === "zomboid"`), y el comentario de arriba se actualiza. El atajo se va porque convertía `/zomboid/items/…`, la carpeta de los íconos, en una página: no se le podía dar caché sin cachear también HTML.
- Dentro del bloque: `if (!tab || !PZ_PUBLISHED.includes(tab)) return { ...base, view: "zomboid", pzSection: "home" };`, con un comentario. Una pestaña que todavía no existe muestra la portada, y así la dirección, el título y el canonical dicen lo mismo que la pantalla.
- La línea del detalle pasa a `const detail = slug ? pzSlugsEs.toId(tab, slug) : undefined;`, con un comentario. El slug español de una ficha nunca coincide con el inglés de otra (lo garantiza `buildEsSlugs`), así que se puede traducir en los dos idiomas: `/en/…/objetos/palanca` abre la palanca en vez de una ficha rota.
- En el bloque de Diablo II, lo mismo: `const detail = slug ? d2rSlugsEs.toId(tab, slug) : slug;`.
- `isView` saca `"zomboid"` de la lista (no es un segmento de dirección: la dirección es `project-zomboid`).
- En `Zomboid.tsx`, el cálculo de la solapa activa (`isLive(section) ? section : "home"`) ya no hace falta: la ruta llega corregida. Dejar `const current = route.pzSection ?? "home";` y borrar el comentario que explicaba el caso.

- [ ] **Step 3: Netlify — el atajo con 301 y la caché de los assets**

En `netlify.toml`, junto a las redirecciones de TFT (antes de la regla `/*` del final):

```toml
# `/zomboid` era un atajo a la sección (2026-09-30); ahora manda con 301 a la
# dirección de verdad. La carpeta `/zomboid/...` es de assets (íconos, mapa).
[[redirects]]
  from = "/zomboid"
  to = "/en/project-zomboid"
  status = 301
[[redirects]]
  from = "/en/zomboid"
  to = "/en/project-zomboid"
  status = 301
[[redirects]]
  from = "/es/zomboid"
  to = "/es/project-zomboid"
  status = 301
```

Y en el bloque de `[[headers]]` de assets de juegos, después del último de Valheim, uno por carpeta con el mismo `Cache-Control = "public, max-age=86400, stale-while-revalidate=604800"`: `/zomboid/items/*`, `/zomboid/build/*`, `/zomboid/traits/*`, `/zomboid/professions/*`, `/zomboid/moodles/*`, `/zomboid/ui/*`, `/zomboid/map/*`.

- [ ] **Step 4: Tests, tipos y commit**

Run: `npx tsc -b` y `npx vitest run`. Expected: verde, salvo `deadlock.test.ts`.

```bash
git add site/src/route.ts site/src/Zomboid.tsx site/test/zomboidRoute.test.ts site/test/zomboidHome.test.ts site/test/zomboidSeo.test.ts netlify.toml
git commit -m "fix(zomboid): /zomboid deja de ser página (301) y sus carpetas de assets llevan caché

Las pestañas que todavía no se publicaron caen en la portada con la dirección
corregida, y el slug de una ficha se entiende en cualquier idioma."
```

---

### Task 2: El extractor corta en vez de rotular mal

**Files:**
- Modify: `games/zomboid/tools/extract.py`, `games/zomboid/tools/map.py`, `games/zomboid/README.md`

- [ ] **Step 1: Cortes**

En `extract.py`:
- Si `game_version()` devuelve `None`: `SystemExit` con un mensaje en español que diga qué no se encontró y cómo pasarla. No se conserva la versión anterior: datos de la 42.22 rotulados "42.21" son peores que no extraer.
- Si `steam_build()` devuelve `None`: aviso claro por stderr y `build: null`, sin cortar. Un `PZ_DIR` fuera de Steam es válido.
- Si `moodle_textures()` devuelve menos de 20 moodles, o `skillbook_perks()` devuelve vacío: `SystemExit` con mensaje.
- El lector de scripts borra también los comentarios `//` al final de una línea, cuando `//` va precedido de espacio y está fuera de comillas. Hoy no hay ninguno en la 42.21, pero el día que aparezca se leería como parte del valor.
- Al escribir un ícono: si en la carpeta existe un archivo con el mismo nombre salvo mayúsculas, se borra antes de escribir. En Windows el nombre viejo se quedaba, y Netlify distingue mayúsculas: daría 404.

En `map.py`:
- Escribe `games/zomboid/data/map/meta.json` con `{ "extractedAt": <fecha>, "dataHash": <hash> }`, con el mismo criterio que `extract.py`: la fecha sólo cambia si cambia el hash de los datos del mapa. Sirve para el `lastmod` de la pestaña Mapa.
- Cambia `lxml` por `xml.etree.ElementTree` si alcanza; si no alcanza, lo documenta en el README.

En `games/zomboid/README.md`: la dirección de la sección es `/project-zomboid` y no `/zomboid`, y se documentan las dependencias.

- [ ] **Step 2: Verificar y commit**

Run (desde la raíz): `python games/zomboid/tools/extract.py` y `python games/zomboid/tools/map.py --sin-teselas`.
Expected: terminan sin error. `git status` no muestra cambios en `games/zomboid/data` salvo el `map/meta.json` nuevo, porque los datos no cambiaron. Probar un corte: `PZ_DIR=C:\no-existe python games/zomboid/tools/extract.py` tiene que terminar con mensaje y código distinto de 0.

```bash
git add games/zomboid/tools/extract.py games/zomboid/tools/map.py games/zomboid/README.md games/zomboid/data/map/meta.json
git commit -m "fix(zomboid): el extractor corta si no encuentra la versión, los moodles o los libros"
```

---

### Task 3: El índice de fichas y sus slugs en español

**Files:**
- Modify: `games/zomboid/tools/extract.py` (escribe `games/zomboid/data/index.json`)
- Create: `site/src/esSlugs.ts`
- Modify: `site/src/d2r/slugs.ts` (usa `esSlugs.ts`)
- Modify: `site/vite.config.ts`, `site/src/vite-env.d.ts`
- Create: `site/test/zomboidIndex.test.ts`

**Interfaces:**
- `games/zomboid/data/index.json`: una lista de `{ "sec": "items"|"recipes"|"traits"|"professions"|"skills"|"moodles", "id": "<slug en inglés>", "en": "<nombre>", "es": "<nombre>", "ref": [ "<ids del juego>" ] }`. Orden estable: por `sec` en ese orden, después por `id`.
- `export function buildEsSlugs<T extends string>(index: readonly { sec: T; id: string; es: string }[], sameSlug: readonly T[]): Partial<Record<T, Record<string, string>>>` en `site/src/esSlugs.ts`.
- `buildD2rEsSlugs(index)` sigue existiendo en `site/src/d2r/slugs.ts` y devuelve lo mismo que hoy.
- El módulo virtual `virtual:pz-slugs-es` exporta por defecto `Partial<Record<PzTab, Record<string, string>>>`.

- [ ] **Step 1: El índice en el extractor**

En `extract.py`, una función `site_index(...)` que arma las fichas. Reglas:
- **Slug:** el mismo `slugify` que `site/src/route.ts` (NFD sin acentos, minúsculas, sin `'` ni `.`, lo demás a `-`, sin guiones en las puntas). Hay que escribirlo en Python y documentar que tiene que coincidir.
- **Objetos:** **una ficha por nombre en inglés**. Hay 3.826 nombres para 4.880 objetos; por ejemplo, 55 "Paperback" y 18 "Duffel Bag". `ref` lleva los ids de todos los objetos con ese nombre, ordenados. `es` es el nombre en español del primero.
- **Recetas** (craft y build): una ficha por receta. Si dos recetas dan el mismo slug, las dos llevan `-<slug del id>` ("Brew Coffee" y otras).
- **Rasgos, profesiones, habilidades y moodles:** una ficha por cada uno, con el slug del nombre en inglés. Ante un choque, `-<slug del id>`.
- **`es` vacío:** va el inglés, y el slug español queda igual al inglés.

Se escribe con el mismo criterio de "sólo si cambió" y entra en el hash que mueve `extractedAt`.

- [ ] **Step 2: `buildEsSlugs` genérico**

Crear `site/src/esSlugs.ts` con la lógica que hoy tiene `buildD2rEsSlugs` en `site/src/d2r/slugs.ts`: slugs desde `es`, choques con `-<id>`, y un slug español que coincide con el inglés de otra ficha también suma el id. Hay que parametrizar las secciones que no se traducen (`sameSlug`).

`site/src/d2r/slugs.ts` queda como:

```ts
export const buildD2rEsSlugs = (index) => buildEsSlugs(index, ["runes", "patches"]);
```

con sus tipos. Los tests de `d2rSlugsEs.test.ts` tienen que seguir pasando sin cambios.

- [ ] **Step 3: El módulo virtual y el registro en el build**

En `site/vite.config.ts`:
- `d2rSlugsModule` pasa a una fábrica `esSlugsModule(id: string, files: string[], build: () => object)` que sirve tanto `virtual:d2r-slugs-es` como `virtual:pz-slugs-es`.
- Para Zomboid lee `${zomboidDir}/index.json` y llama a `buildEsSlugs(index, [])`.
- El `manualChunks` ya excluye `\0virtual:d2r-`: generalizarlo a `\0virtual:` + `-slugs-es`, para que los dos vayan con su sección.
- En `readSitemapData`, `zb` suma `index` (el `index.json`) y se llama a `registerPzSlugs(buildEsSlugs(zb.index, []))`, igual que Diablo II.

En `site/src/vite-env.d.ts`, la declaración de `virtual:pz-slugs-es` con el tipo de arriba.

- [ ] **Step 3b: Tests**

Crear `site/test/zomboidIndex.test.ts`, con el índice real (`import index from "@zomboid/index.json"`):
- cada `id` es `slugify(en)` o empieza con `slugify(en) + "-"`;
- no hay `id` repetidos dentro de una `sec`;
- todos los objetos de `items.json` aparecen en algún `ref` de `sec: "items"`, exactamente una vez;
- el número de fichas de objetos es igual al número de nombres en inglés distintos;
- con `buildEsSlugs(index, [])`, la palanca (`Base.Crowbar`) tiene ficha `crowbar` con slug español `palanca`;
- ningún slug español de una sección es igual al slug inglés de otra ficha de esa sección.

Run: `npx vitest run test/zomboidIndex.test.ts test/d2rSlugsEs.test.ts test/d2r.test.ts` y `npx tsc -b`.

- [ ] **Step 4: Commit**

```bash
git add games/zomboid/tools/extract.py games/zomboid/data/index.json games/zomboid/data/meta.json site/src/esSlugs.ts site/src/d2r/slugs.ts site/vite.config.ts site/src/vite-env.d.ts site/test/zomboidIndex.test.ts
git commit -m "feat(zomboid): el índice de fichas y sus slugs en español, con el armado de Diablo II ahora compartido"
```

---

### Task 4: El cableado de pestañas y fichas

**Files:**
- Modify: `site/src/Zomboid.tsx`, `site/src/areas.ts`, `site/src/areaFiles.ts`, `site/test/areas.test.ts`
- Create: `site/src/zomboid/index.ts`
- Modify: `site/src/sitemap.ts`, `site/src/prerender.ts`, `site/src/PageMeta.tsx`, `site/src/zomboidCopy.ts`, `site/vite.config.ts`, `site/src/vite-env.d.ts`
- Modify: `site/test/zomboidSeo.test.ts`

**Interfaces:**
- **Slugs por pestaña (cambio sobre la Tarea 3).** `virtual:pz-slugs-es` entero pesa ~236 KB, contra 19 KB en Diablo II, y no puede viajar con la portada.
  - El plugin sirve además un módulo por sección: `virtual:pz-slugs-es/<sec>`, que exporta por defecto `{ [sec]: Record<string, string> }`, con su declaración en `vite-env.d.ts` (un `declare module "virtual:pz-slugs-es/*"`).
  - `Zomboid.tsx` **no** importa ninguno. Cada pestaña, al construirse, importa y registra (`registerPzSlugs`) las secciones que enlaza: la de Objetos, `items` y `recipes`.
  - Funciona porque `preloadTab` baja el chunk de la pestaña (reconocida por su nombre, que es fijo) antes de que la app lea la dirección, igual que `main.tsx` espera el área.
  - El build (Node) sigue registrando todo en `readSitemapData`.
  - Test en `areas.test.ts` o `zomboidIndex.test.ts`: el módulo de cada sección tiene exactamente las fichas de esa sección del módulo entero.
- `Zomboid.tsx`:
  - exporta `preloadTab(route)`;
  - tiene `const TABS: Partial<Record<PzSection, LazyTab>> = {}`, vacío por ahora, con el tipo de `lazyWithPreload`;
  - si la pestaña de la ruta está en `TABS`, la dibuja dentro de `<Suspense>`; si no, la portada.
- `areaFiles.ts`: `export const PZ_TAB_FILES: Partial<Record<PzSection, string>> = {}`, y `filesFor` suma la rama de Zomboid como la de Diablo II.
- `areas.ts`: `preloadRoute` suma `if (route.view === "zomboid") await loadZomboid().then((m) => m.preloadTab(route)).catch(() => undefined);`, con `const loadZomboid = () => import("./Zomboid")` compartido con `ZomboidArea`.
- `site/src/zomboid/index.ts`: `peekPzIndex()` y `loadPzIndex()`, que traen `@zomboid/index.json` con `import()` dinámico, con la misma forma que `site/src/d2r/index.ts`.
- `sitemap.ts`: `ZomboidSitemapData` suma `index?: { sec: PzTab; id: string; en: string; es: string }[]`. `sitemapPaths` suma, por cada pestaña publicada que esté en `PZ_DETAIL_SECTIONS`, una dirección por ficha del índice con esa `sec`.
- `prerender.ts`:
  - `detailNames` suma `zb-${sec}/${id}` → nombre en el idioma;
  - el `detailKey` suma la rama de Zomboid;
  - `metaFor` de Zomboid usa `ZOMBOID_COPY[lang].seo.detail[sec](name)` cuando hay `detailName` y la sección tiene plantilla.
- `zomboidCopy.ts`: `seo.detail: Partial<Record<PzTab, (name: string) => Seo>>` en EN y ES, para items, recipes, traits, professions, skills y moodles. Títulos que empiezan por el nombre, de hasta 65 caracteres con un nombre de 20.
- `PageMeta.tsx`: la rama de Zomboid en `dlDetailName`, con `peekPzIndex()`, y la de recarga cuando el índice todavía no llegó, igual que Diablo II.

- [ ] **Step 1: Tests que fallan**

En `site/test/zomboidSeo.test.ts`, con `PZ_PUBLISHED.push("items")` en un `beforeAll` y un `afterAll` que lo saca, y `data.zb.index` = el índice real:
- el sitemap tiene `/en/project-zomboid/items/crowbar` y `/es/project-zomboid/objetos/palanca`, en el grupo `zomboid`;
- la página prerenderizada de `/es/project-zomboid/objetos/palanca` tiene un título que empieza por "Palanca", canonical propio y hreflang en → `/en/project-zomboid/items/crowbar`;
- su JSON-LD tiene la miga "Palanca".

En `site/test/areas.test.ts`: toda clave de `PZ_TAB_FILES` está en `PZ_SECTIONS`, y cada archivo existe.

- [ ] **Step 2: Implementar las interfaces de arriba**

- [ ] **Step 3: Verificar**

Run: `npx tsc -b` y `npx vitest run`. Expected: verde, salvo `deadlock.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add site/src/Zomboid.tsx site/src/areas.ts site/src/areaFiles.ts site/test/areas.test.ts site/src/zomboid/index.ts site/src/sitemap.ts site/src/prerender.ts site/src/PageMeta.tsx site/src/zomboidCopy.ts site/vite.config.ts site/src/vite-env.d.ts site/test/zomboidSeo.test.ts
git commit -m "feat(zomboid): el cableado de pestañas lazy y fichas (preload, archivos, sitemap, <head> y nombres), vacío hasta que llegue cada pestaña"
```

---

### Task 5: La barra de pestañas, los colores y los textos para Google, en una pasada

**Files:**
- Modify: `site/src/styles/zomboid.css`, `site/src/Zomboid.tsx`, `site/src/zomboidCopy.ts`, `site/test/zomboidCopy.test.ts`

- [ ] **Step 1: Barra**

- Las solapas tienen `min-height: 40px` con el texto centrado; en el celular, 44px.
- Una solapa "Pronto" lleva además un `<span className="visually-hidden">` con `t.soon`, que ya existe en `base.css`, para que lo lean los lectores de pantalla y el tacto.
- El `title` se queda.

- [ ] **Step 2: Colores**

Los colores literales de `zomboid.css` que repiten los tokens de `[data-game="zomboid"]` pasan a `var(...)`:
- `#b9c2ad` → `--text-dim`;
- `#f3d36b` → `--accent`;
- `#f3eedf` y `#dfe4d6` → una variable nueva `--pz-desk-text` en `.pz`;
- `#8e8e8e` → `--pz-clip`.

Los de la leyenda del mapa y los del papel ya son variables.

- [ ] **Step 3: Textos para Google**

Reescribir los `seo` de EN y ES:
- **Títulos:** de hasta 65 caracteres, contando " | Vestigo".
- **Descripciones:** de hasta 160.
- **Palabras clave:** el principio de cada título se mantiene (lo verifican los tests existentes).
- **Mapa:** el título en español deja de repetir "mapa".

`zomboidCopy.test.ts` suma los topes (título ≤ 65, descripción entre 80 y 160) para todas las pestañas y para las plantillas de ficha con un nombre de 20 caracteres.

- [ ] **Step 4: Sellos**

En `zomboidCopy.test.ts`, cada `stamp` que usa la copia tiene su archivo `site/public/zomboid/map/stamps/map_<stamp>.png` (con `existsSync`).

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc -b` y `npx vitest run test/zomboidCopy.test.ts test/zomboidHome.test.ts test/zomboidSeo.test.ts`.

```bash
git add site/src/styles/zomboid.css site/src/Zomboid.tsx site/src/zomboidCopy.ts site/test/zomboidCopy.test.ts
git commit -m "fix(zomboid): solapas del tamaño del dedo, 'Pronto' legible, colores por token y títulos que Google no corta"
```
