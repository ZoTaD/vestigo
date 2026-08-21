# Tier list de ítems de Deadlock — plan de implementación

**Diseño:** `docs/design/2026-07-30-tier-list-de-items-deadlock-design.md`
**Fecha:** 2026-07-30

**Objetivo:** una pestaña `/deadlock/items` que rankea los 156 ítems de tienda
contra la base de su propio precio, con la brecha por rango arriba, alimentada por
un `build:items` nuevo que corre en la misma Action que la tier list de héroes.

**Arquitectura:** copia exacta de la forma que ya tiene la tier list de héroes —
pipeline que consulta el snapshot con DuckDB y escribe un JSON por banda, capa de
datos en el navegador que resuelve nombres en tiempo de render, y una vista que
reusa `.tool-head` y el plegado de `TierGroup`. Lo único nuevo de verdad es la
métrica.

## Restricciones globales

- **Toda la prosa va en `games/tft/ui/src/i18n.ts`**, en los dos idiomas. Ningún
  texto en ningún otro archivo.
- **El vocabulario del juego no se escribe: se baja traducido.** 172 de 173 ítems
  tienen nombre propio en español en la API de assets.
- **Español neutro latinoamericano, sin voseo.**
- **Slugs y rutas en inglés** (`/deadlock/items`).
- **Los números que se muestran vienen con el dato que los respalda** en el tooltip.
- **Las imágenes se referencian, no se re-alojan** (URLs de `assets-bucket`).
- Redondeo estable (`Number(n.toFixed(d))`) para que dos corridas del mismo dato
  produzcan el mismo archivo y el guardián no commitee ruido.

## Constantes fijadas por la medición

| Constante | Valor | De dónde sale |
|---|---|---|
| `MIN_BUYS` | 300 | Con 300 los 156 ítems califican en las 4 bandas |
| `MIN_FOR_GAP` | 1000 | Es una resta; 5× el mínimo de un winrate suelto |
| Cortes de tier | `+2 / +0,8 / −0,3 / −1,8` | Cuartiles medidos (q1 −1,04, mediana −0,14, q3 +0,75) |
| Umbral "Difícil" | `+2,5` | 20 de 148 |
| Umbral "Perdona" | `−1,0` | 11 de 148; asimétrico porque la distribución lo está |
| Modo de juego | `Normal` | `Unranked` incluye Street Brawl, 12,4% de partidas |
| Filtro del catálogo | `shopable === true` | Da 23/43/46/44, los mismos 156 del snapshot |

---

## Tarea 1: el filtro de modo, que también corrige héroes

**Archivos:** modificar `games/deadlock/pipeline/src/snapshot.ts`; crear
`games/deadlock/pipeline/test/snapshot.test.ts`.

**Produce:** `PLAYED_GAME_MODE = "Normal"` exportado, y `windowSql` filtrando por
`game_mode` además de `match_mode`.

- [ ] Test que falla: `windowSql` tiene que incluir `game_mode = 'Normal'`, y
      `PLAYED_GAME_MODE` tiene que existir.
- [ ] Correrlo y verlo fallar.
- [ ] Agregar la constante y la línea del `where`, con el comentario que explica que
      `match_mode='Unranked'` incluye Street Brawl (12,4% de partidas, 14,4 min
      contra 38,4) y que los 17 ítems de coste 9999 salen sólo de ahí.
- [ ] Correr los tests del pipeline. Verde.
- [ ] Commit.

## Tarea 2: el catálogo de ítems

**Archivos:** modificar `games/deadlock/pipeline/src/catalog.ts`; crear
`games/deadlock/pipeline/test/catalog.test.ts`.

**Produce:**
```ts
export interface CatalogItem {
  name: Localized;
  /** Imagen de tienda, la que dibuja una fila. */
  img: string;
  cost: number;
  /** 1-4. El de 9999 (tier 5) no se publica: es de Street Brawl. */
  tier: number;
  slot: "weapon" | "vitality" | "spirit";
}
export const isShopItem: (i: RawItem) => boolean;
// Catalog gana: items: Record<string, CatalogItem>
```

- [ ] Test que falla: `buildCatalog` con dos ítems de prueba devuelve `items` con
      nombre bilingüe, y `isShopItem` deja afuera los de coste 9999 y los no
      `shopable`.
- [ ] Correrlo y verlo fallar.
- [ ] Implementar: bajar `items?language=english|spanish`, filtrar
      `type === "upgrade" && shopable === true && cost !== 9999`, cruzar por id.
      Sin `shop_image` el ítem se omite, igual que un héroe sin retrato.
- [ ] Tests verdes.
- [ ] Correr `npm run catalog` de verdad y verificar que escribe 156 ítems.
- [ ] Commit (incluye `catalog.json` regenerado).

## Tarea 3: `build:items`

**Archivos:** crear `games/deadlock/pipeline/src/items.ts` y
`games/deadlock/pipeline/test/items.test.ts`; modificar `package.json`.

**Consume:** `windowSql`, `partitionsCovering`, `connect` de `snapshot.ts`;
`fetchPatches`, `patchWindows` de `patches.ts`; `BANDS`, `bandPath` de `bands.ts`.

**Produce:**
```ts
export interface ItemStat {
  itemId: number; n: number; delta: number; winRateRaw: number;
  pickRate: number; buyMinute: number; gap?: number; thinData?: boolean;
}
export interface ItemsFile {
  generatedAt: string; band: string;
  patch: { date: string; title: string; link: string };
  provisional?: boolean;
  costBaselines: Record<string, number>;
  matches: number; boards: number; from: string; to: string;
  items: ItemStat[];
}
export function baselinesFrom(rows: RawItemRow[]): Map<number, number>;
export function shrinkageToward(rates: Rate[], center: number): number;
export function itemsFileFrom(rows, band, totals, extra, patch, generatedAt): ItemsFile;
```

`windowSql` no trae las columnas de ítems, así que `items.ts` arma su propia
expresión (`itemsWindowSql`) con `items.item_id`, `items.game_time_s` y el tier —
los nombres con punto van entre comillas dobles, que es la parte que cuesta
descubrir.

- [ ] Tests que fallan, sobre funciones puras y sin red:
      `baselinesFrom` promedia por precio; `shrinkageToward` encoge hacia el centro
      dado y no hacia 50%; `itemsFileFrom` marca `thinData` bajo 300, omite `gap`
      (ausente, no 0) cuando falta muestra, y ordena por `delta`.
- [ ] Correrlos y verlos fallar.
- [ ] Implementar.
- [ ] Tests verdes.
- [ ] Correr `npm run build:items` contra el snapshot real y verificar los cuatro
      archivos: 156 ítems, las bases cerca de 50,1 / 50,8 / 50,7 / 55,1.
- [ ] Commit.

## Tarea 4: la capa de datos del navegador

**Archivos:** crear `games/tft/ui/src/deadlockItems.ts`; modificar
`games/tft/ui/test/deadlock.test.ts`.

**Produce:** `useItems(band)`, `buildItems(band, lang)`, `tierOfDelta(delta)`,
`gapLabelOf(gap)`, `gapMovers(items, top)`, `type Item`, `type GapLabel`.

- [ ] Tests que fallan: `tierOfDelta` en los cuatro cortes; `gapLabelOf` asimétrico
      (+2,5 / −1,0) y `null` cuando `gap` es `undefined`; `buildItems` resuelve
      nombre e imagen del catálogo y cae al id cuando falta.
- [ ] Correrlos y verlos fallar.
- [ ] Implementar, copiando el patrón de `deadlockData.ts`: import estático de la
      banda por defecto, `import()` dinámico para las otras tres, nombres resueltos
      en tiempo de render.
- [ ] Tests verdes.
- [ ] Commit.

## Tarea 5: la ruta y la pestaña

**Archivos:** modificar `games/tft/ui/src/route.ts`, `App.tsx`, `sitemap.ts`,
`test/route.test.ts`, `test/sitemap.test.ts`.

- [ ] Tests que fallan: `parseRoute("/es/deadlock/items")` da
      `dlSection: "items"`; `routePath` lo reconstruye; el sitemap incluye
      `/en/deadlock/items` y `/es/deadlock/items`; `/tft/patches` **sigue** cayendo
      en el meta de TFT (la razón por la que `DeadlockSection` es un tipo aparte).
- [ ] Correrlos y verlos fallar.
- [ ] `DeadlockSection` pasa a `"meta" | "items" | "patches"`, en ese orden — es el
      orden en que se dibujan las pestañas.
- [ ] Tests verdes.
- [ ] Commit.

## Tarea 6: la vista

**Archivos:** crear `games/tft/ui/src/DeadlockItems.tsx`; modificar `i18n.ts`
(copia EN y ES), `styles/` (clases `dl-item*`), `App.tsx`.

`DeadlockItems.tsx` aparte y no dentro de `Deadlock.tsx`: ese archivo ya tiene 408
líneas y dos vistas; una tercera lo vuelve difícil de sostener.

- [ ] Franja de brecha: dos lados, seis ítems cada uno, con el número en el tooltip.
- [ ] Cuatro grupos por precio con el ícono de alma; 6400 y 3200 abiertos, 1600 y
      800 plegados; contenido montado aunque esté plegado.
- [ ] Fila: imagen, nombre, chip de categoría, `delta` grande, winrate crudo y
      pickrate chicos, chip de brecha sólo cuando hay algo que decir.
- [ ] Copia en los dos idiomas, sin una sola palabra fuera de `i18n.ts`.
- [ ] `npm test` verde en la UI.
- [ ] Commit.

## Tarea 7: la Action, verificación y publicación

**Archivos:** modificar `.github/workflows/publish-deadlock.yml`.

- [ ] Agregar el paso `build:items` después de `build:heroes`, **sin**
      `continue-on-error`.
- [ ] `npm run build` de la UI: compila y no rompe el bundle.
- [ ] Levantar el dev server y verificar en el navegador: `/en/deadlock/items` y
      `/es/deadlock/items`, sin errores de consola.
- [ ] **Criterio de aceptación medido**: la primera fila de ítem entra en la primera
      pantalla a 720 px de alto.
- [ ] Verificar en 375 px de ancho (la regla de tipografía del proyecto).
- [ ] Capturas para ZoTaD.
- [ ] Commit y push a `main`.
