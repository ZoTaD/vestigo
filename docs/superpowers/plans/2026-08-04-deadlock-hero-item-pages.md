# Deadlock Hero & Item Indexable Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Deadlock hero and item its own indexable URL (`/deadlock/<hero-slug>`, `/deadlock/items/<item-slug>`), reusing the same content that already renders inside the expandable rows on `/deadlock` and `/deadlock/items` today — no new content, just an address, a title, and a description Google can index separately.

**Architecture:** Ports the mechanism TFT already uses for `/tft/units/<slug>` and `/tft/items/<slug>` (`route.ts`'s `detail` segment, `slugs.ts`'s slug maps, `sitemap.ts`'s path list, `prerender.ts`'s per-route SEO copy, the Vite plugins that turn all of that into static HTML at build time) onto Deadlock's hero and item catalogs. Only the **published default band** gets detail URLs — both because a rank-by-rank duplicate would compete with itself in search, and because only that band's data loads synchronously (a hard requirement for server-side rendering, explained in Task 8).

**Tech Stack:** React 18 + TypeScript, Vite, Vitest. No new dependencies.

**Spec:** `docs/design/2026-08-04-deadlock-hero-item-pages-design.md` — read it before starting.

## Global Constraints

- Every new user-facing string goes in `games/tft/ui/src/i18n.ts`, in both `EN` and `ES`. `ES` is typed as `typeof EN`, so a missing key is a compile error.
- Slugs are always built from the **English** name, even for the Spanish page — one entity, one address, in every language (already the rule for TFT; this plan applies it to Deadlock).
- Only the **published default band** (`PUBLISHED_BAND` in `games/tft/ui/src/deadlockData.ts`) gets hero/item detail URLs.
- A slug that doesn't resolve to a real hero/item must render the page anyway (list closed, generic title) — never a blank page or a crash.
- Commit after every task, in the project's existing style (`feat(deadlock): ...` / `test(deadlock): ...`).
- Do **not** push to `main` or trigger the Netlify deploy as part of this plan — verify on localhost (including a real `npm run build`, since the SEO/prerender plugins only run in build mode) and stop there.

---

### Task 1: Route support for Deadlock hero and item detail URLs

**Files:**
- Modify: `games/tft/ui/src/route.ts`
- Test: `games/tft/ui/test/route.test.ts`

**Interfaces:**
- Produces: `DL_DETAIL_SECTIONS: DeadlockSection[]`; `parseRoute`/`routePath` now read and write a `detail` segment for `dlSection` "meta" (as `/deadlock/<slug>`, since "meta" is the section with no name in the URL) and "items" (as `/deadlock/items/<slug>`).

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `games/tft/ui/test/route.test.ts` (the file already imports `parseRoute`, `routePath`; no new imports needed):

```ts
describe("las páginas de héroe e ítem de Deadlock", () => {
  it("una URL bajo /deadlock sin sección conocida es un héroe", () => {
    const r = parseRoute("/en/deadlock/infernus");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "meta", detail: "infernus" });
    expect(routePath(r)).toBe("/en/deadlock/infernus");
  });

  it("sin héroe, la URL de meta sigue siendo la pestaña sola", () => {
    const r = parseRoute("/en/deadlock");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "meta" });
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/en/deadlock");
  });

  it("un ítem va bajo /deadlock/items/<slug>", () => {
    const r = parseRoute("/en/deadlock/items/basic-magazine");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "items", detail: "basic-magazine" });
    expect(routePath(r)).toBe("/en/deadlock/items/basic-magazine");
  });

  it("sin ítem, /deadlock/items sigue sirviendo la lista sola", () => {
    expect(routePath(parseRoute("/en/deadlock/items"))).toBe("/en/deadlock/items");
  });

  it("ranks y patches no tienen detalle, aunque la URL traiga un segmento de más", () => {
    expect(routePath(parseRoute("/en/deadlock/ranks/algo"))).toBe("/en/deadlock/ranks");
    expect(routePath(parseRoute("/en/deadlock/patches/algo"))).toBe("/en/deadlock/patches");
  });

  it("existe en español también", () => {
    expect(routePath(parseRoute("/es/deadlock/infernus"))).toBe("/es/deadlock/infernus");
    expect(routePath(parseRoute("/es/deadlock/items/basic-magazine"))).toBe(
      "/es/deadlock/items/basic-magazine"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/route.test.ts`
Expected: FAIL — `/en/deadlock/infernus` currently parses with `dlSection` falling back to the default and no `detail` at all (the current code only recognises `rest[1]` as a `dlSection` name, and Deadlock's `routePath` never appends a third segment).

- [ ] **Step 3: Implement the route changes**

In `games/tft/ui/src/route.ts`, add this constant right after `DEADLOCK_SECTIONS`:

```ts
/**
 * Qué pestañas de Deadlock tienen página de detalle. "meta" son héroes,
 * "items" son ítems; rangos y parches no tienen una unidad que abrir.
 */
export const DL_DETAIL_SECTIONS: DeadlockSection[] = ["meta", "items"];
```

Replace the `head === "deadlock"` branch inside `parseRoute`:

```ts
  if (head === "deadlock") {
    const dlSection = rest[1] && isDlSection(rest[1]) ? rest[1] : DEFAULT_DL_SECTION;
    return { ...base, view: "deadlock", dlSection };
  }
```

with:

```ts
  if (head === "deadlock") {
    const maybeSection = rest[1];
    // "meta" (héroes) es la sección por defecto y no lleva su nombre en la
    // URL, así que el segmento después de "deadlock" puede ser el nombre de
    // otra pestaña (items/ranks/patches) O el slug de un héroe. Si no es una
    // pestaña conocida, es un héroe.
    if (maybeSection && isDlSection(maybeSection)) {
      const dlSection = maybeSection;
      const detail = DL_DETAIL_SECTIONS.includes(dlSection) && rest[2] ? rest[2] : undefined;
      return { ...base, view: "deadlock", dlSection, detail };
    }
    return { ...base, view: "deadlock", dlSection: DEFAULT_DL_SECTION, detail: maybeSection || undefined };
  }
```

Replace the `view === "deadlock"` branch inside `routePath`:

```ts
  if (view === "deadlock") {
    return dlSection === DEFAULT_DL_SECTION ? `/${lang}/deadlock` : `/${lang}/deadlock/${dlSection}`;
  }
```

with:

```ts
  if (view === "deadlock") {
    if (dlSection === DEFAULT_DL_SECTION) {
      return detail ? `/${lang}/deadlock/${detail}` : `/${lang}/deadlock`;
    }
    const dlPath = `/${lang}/deadlock/${dlSection}`;
    return DL_DETAIL_SECTIONS.includes(dlSection) && detail ? `${dlPath}/${detail}` : dlPath;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/route.test.ts`
Expected: PASS, all tests including the new block.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd games/tft/ui && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add games/tft/ui/src/route.ts games/tft/ui/test/route.test.ts
git commit -m "feat(deadlock): route support for hero and item detail URLs"
```

---

### Task 2: `deadlockSlugs.ts` — slug maps for heroes and items

**Files:**
- Create: `games/tft/ui/src/deadlockSlugs.ts`
- Test: `games/tft/ui/test/deadlockSlugs.test.ts`

**Interfaces:**
- Consumes: `buildHeroes`, `PUBLISHED_BAND` from `./deadlockData` (existing); `buildItems` from `./deadlockItemsData` (existing); `slugify` from `./route` (existing).
- Produces: `heroes: SlugMap`, `items: SlugMap` (each `{ toId: Map<string, string>, toSlug: Map<string, string> }`) — consumed by Tasks 6, 8, 9, and indirectly by Task 4's tests.

- [ ] **Step 1: Write the failing tests**

Create `games/tft/ui/test/deadlockSlugs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { heroes, items } from "../src/deadlockSlugs";

describe("deadlockSlugs", () => {
  it("arma un slug por cada héroe con datos en la banda por defecto", () => {
    expect(heroes.toId.size).toBeGreaterThan(0);
    expect(heroes.toSlug.size).toBe(heroes.toId.size);
  });

  it("arma un slug por cada ítem con datos en la banda por defecto", () => {
    expect(items.toId.size).toBeGreaterThan(0);
    expect(items.toSlug.size).toBe(items.toId.size);
  });

  it("los slugs de héroe van y vuelven", () => {
    for (const [slug, id] of heroes.toId) {
      expect(heroes.toSlug.get(id)).toBe(slug);
    }
  });

  it("los slugs de ítem van y vuelven", () => {
    for (const [slug, id] of items.toId) {
      expect(items.toSlug.get(id)).toBe(slug);
    }
  });

  it("los slugs son minúsculas y con guiones, sin espacios", () => {
    for (const slug of heroes.toId.keys()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/deadlockSlugs.test.ts`
Expected: FAIL with "Cannot find module '../src/deadlockSlugs'".

- [ ] **Step 3: Implement `deadlockSlugs.ts`**

Create `games/tft/ui/src/deadlockSlugs.ts`:

```ts
import { buildHeroes, PUBLISHED_BAND } from "./deadlockData";
import { buildItems } from "./deadlockItemsData";
import { slugify } from "./route";

/**
 * Los nombres en la URL de héroes e ítems de Deadlock, y cómo volver de ahí.
 *
 * Calco exacto de `slugs.ts` (TFT): un slug siempre sale del nombre en
 * inglés, aunque la página esté en español — mismo motivo de siempre, un
 * héroe no puede tener dos direcciones según el idioma.
 *
 * Sólo cubre la banda publicada por defecto (`PUBLISHED_BAND`): es la única
 * con datos disponibles de forma síncrona, que es lo que hace falta para
 * que el prerender le dé contenido real a la página (ver la Decisión y el
 * §3 del spec).
 */

interface SlugMap {
  /** slug → id, para leer una URL. */
  toId: Map<string, string>;
  /** id → slug, para escribir una. */
  toSlug: Map<string, string>;
}

/** Colisión de nombre → sufijo numerado, igual que en slugs.ts. */
function buildMap(entries: { id: string; name: string }[]): SlugMap {
  const toId = new Map<string, string>();
  const toSlug = new Map<string, string>();
  for (const { id, name } of entries) {
    const base = slugify(name) || slugify(id);
    let slug = base;
    for (let n = 2; toId.has(slug) && toId.get(slug) !== id; n++) slug = `${base}-${n}`;
    if (toSlug.has(id)) continue;
    toId.set(slug, id);
    toSlug.set(id, slug);
  }
  return { toId, toSlug };
}

const en = "en" as const;

export const heroes: SlugMap = buildMap(
  buildHeroes(PUBLISHED_BAND, en).map((h) => ({ id: String(h.heroId), name: h.name }))
);

export const items: SlugMap = buildMap(
  buildItems(PUBLISHED_BAND, en).map((i) => ({ id: String(i.itemId), name: i.name }))
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/deadlockSlugs.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/deadlockSlugs.ts games/tft/ui/test/deadlockSlugs.test.ts
git commit -m "feat(deadlock): add slug maps for heroes and items"
```

---

### Task 3: SEO copy for hero and item detail pages

**Files:**
- Modify: `games/tft/ui/src/i18n.ts`

**Interfaces:**
- Produces: `copy.seo.deadlock.detail.title(name, dlSection)`, `copy.seo.deadlock.detail.description(name, dlSection)` — consumed by Task 5.

No test file — compile-checked, same as every other i18n addition in this codebase.

- [ ] **Step 1: Add the `EN.seo.deadlock.detail` block**

In `games/tft/ui/src/i18n.ts`, find the `seo.deadlock` object's `patches` entry (English block, look for `"Deadlock Patch Winners and Losers | Vestigo"`):

```ts
      patches: {
        title: () => "Deadlock Patch Winners and Losers | Vestigo",
        description: () =>
          "Every Deadlock hero the latest patch moved, measured against the same stretch of " +
          "the game right before it landed.",
      },
    },
```

Replace with (adding `detail` as a new sibling before the closing `},`):

```ts
      patches: {
        title: () => "Deadlock Patch Winners and Losers | Vestigo",
        description: () =>
          "Every Deadlock hero the latest patch moved, measured against the same stretch of " +
          "the game right before it landed.",
      },
      detail: {
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — Deadlock Item Stats | Vestigo`
            : `${name} — Deadlock Build & Counters | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `How ${name} performs in Deadlock: win rate against its own price, pick rate, ` +
              "and the heroes that carry it best."
            : `How to play ${name} in Deadlock: win rate, pick rate, the recommended build ` +
              "order, and the matchups that change it.",
      },
    },
```

- [ ] **Step 2: Add the mirrored `ES.seo.deadlock.detail` block**

Find the same `patches` entry in the Spanish block (look for `"Ganadores y perdedores del parche de Deadlock | Vestigo"`):

```ts
      patches: {
        title: () => "Ganadores y perdedores del parche de Deadlock | Vestigo",
        description: () =>
          "Todos los héroes de Deadlock que movió el último parche, medidos contra el mismo " +
          "tramo de juego justo anterior.",
      },
    },
```

Replace with:

```ts
      patches: {
        title: () => "Ganadores y perdedores del parche de Deadlock | Vestigo",
        description: () =>
          "Todos los héroes de Deadlock que movió el último parche, medidos contra el mismo " +
          "tramo de juego justo anterior.",
      },
      detail: {
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — estadísticas de Deadlock | Vestigo`
            : `${name} — build y counters de Deadlock | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `Cómo rinde ${name} en Deadlock: victorias contra su propio precio, uso, y los ` +
              "héroes que mejor lo llevan."
            : `Cómo jugar ${name} en Deadlock: victorias, uso, el orden de compra recomendado ` +
              "y los enfrentamientos que lo cambian.",
      },
    },
```

- [ ] **Step 3: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add games/tft/ui/src/i18n.ts
git commit -m "feat(deadlock): add EN/ES SEO copy for hero and item detail pages"
```

---

### Task 4: `sitemap.ts` — list the new URLs

**Files:**
- Modify: `games/tft/ui/src/sitemap.ts`
- Test: `games/tft/ui/test/sitemap.test.ts`

**Interfaces:**
- Consumes: `heroes`, `items` from `./deadlockSlugs` (Task 2, test only).
- Produces: `SitemapData` gains `dlHeroes`, `dlItems`, `dlHeroIds`, `dlItemIds`; new export `deadlockDetailSlugs(data): { heroes: string[]; items: string[] }`; `sitemapPaths()` includes the new URLs — consumed by Task 5 and Task 7.

- [ ] **Step 1: Write the failing tests**

In `games/tft/ui/test/sitemap.test.ts`, add these imports at the top (alongside the existing ones):

```ts
import dlCatalogJson from "@deadlock/catalog.json";
import dlHeroesJson from "@deadlock/heroes.json";
import dlItemsJson from "@deadlock/items.json";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "../src/deadlockSlugs";
```

Change the `import { detailSlugs, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";` line to also import `deadlockDetailSlugs`:

```ts
import {
  detailSlugs,
  deadlockDetailSlugs,
  sitemapPaths,
  sitemapXml,
  type SitemapData,
} from "../src/sitemap";
```

Extend the `data` fixture object:

```ts
const data = {
  champions: (catalogJson as any).champions,
  traits: (catalogJson as any).traits,
  items: (catalogJson as any).items,
  comps: (compsJson as any).comps,
  unitIds: (unitsJson as any).units.map((u: { id: string }) => u.id),
  itemIds: (itemsJson as any).items.map((i: { id: string }) => i.id),
  dlHeroes: (dlCatalogJson as any).heroes,
  dlItems: (dlCatalogJson as any).items,
  dlHeroIds: (dlHeroesJson as any).heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: (dlItemsJson as any).items.map((i: { itemId: number }) => String(i.itemId)),
} as SitemapData;
```

Add a new `describe` block, right after the existing `describe("detailSlugs", ...)` block:

```ts
describe("deadlockDetailSlugs", () => {
  it("matches the hero slugs the app serves", () => {
    expect(new Set(deadlockDetailSlugs(data).heroes)).toEqual(new Set(dlHeroSlugs.toSlug.values()));
  });

  it("matches the item slugs the app serves", () => {
    expect(new Set(deadlockDetailSlugs(data).items)).toEqual(new Set(dlItemSlugs.toSlug.values()));
  });
});
```

Add this test inside the existing `describe("sitemapPaths", ...)` block (after the `it("lista las tres pestañas de Deadlock...")` test):

```ts
  it("incluye una página por héroe y por ítem de Deadlock, en la banda por defecto", () => {
    const dlDetails = deadlockDetailSlugs(data);
    expect(dlDetails.heroes.length).toBeGreaterThan(0);
    expect(dlDetails.items.length).toBeGreaterThan(0);
    for (const slug of dlDetails.heroes) {
      expect(paths).toContain(`/en/deadlock/${slug}`);
      expect(paths).toContain(`/es/deadlock/${slug}`);
    }
    for (const slug of dlDetails.items) {
      expect(paths).toContain(`/en/deadlock/items/${slug}`);
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/sitemap.test.ts`
Expected: FAIL — `deadlockDetailSlugs` does not exist yet, and `SitemapData` doesn't have the `dl*` fields.

- [ ] **Step 3: Implement the `sitemap.ts` changes**

In `games/tft/ui/src/sitemap.ts`, extend the `SitemapData` interface:

```ts
export interface SitemapData {
  champions: Record<string, { name: Localized }>;
  traits: Record<string, { name: Localized }>;
  items: Record<string, { name: Localized }>;
  /** From comps.json: the shape the meta page is built from. */
  comps: { signature: string; trait: string; carries: string[] }[];
  /** From units.json and items.json: which ids actually have a page. */
  unitIds: string[];
  itemIds: string[];
  /** Deadlock's catalog: hero and item name, in both languages. */
  dlHeroes: Record<string, { name: Localized }>;
  dlItems: Record<string, { name: Localized }>;
  /** Which heroes/items have data in the published default band. */
  dlHeroIds: string[];
  dlItemIds: string[];
}
```

Add this function right after `detailSlugs` (no new import needed — `sitemapPaths` calls the two hero/item loops explicitly below rather than looping over `DL_DETAIL_SECTIONS`, so `route.ts`'s existing import list in this file does not change):

```ts
/** Every hero/item detail slug the Deadlock pages should list. */
export function deadlockDetailSlugs(data: SitemapData): { heroes: string[]; items: string[] } {
  return {
    heroes: uniqueSlugs(data.dlHeroIds.map((id) => data.dlHeroes[id]?.name.en ?? id)),
    items: uniqueSlugs(data.dlItemIds.map((id) => data.dlItems[id]?.name.en ?? id)),
  };
}
```

In `sitemapPaths()`, replace:

```ts
    // Las pestañas de Deadlock. La de meta sale como /deadlock a secas, que es
    // la URL que ya estaba indexada.
    for (const dlSection of DEADLOCK_SECTIONS) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection }));
    }
```

with:

```ts
    // Las pestañas de Deadlock. La de meta sale como /deadlock a secas, que es
    // la URL que ya estaba indexada.
    for (const dlSection of DEADLOCK_SECTIONS) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection }));
    }
    // Una página por héroe y por ítem de la banda publicada por defecto. No
    // se recorre DL_DETAIL_SECTIONS genéricamente porque cada sección saca
    // sus slugs de un catálogo distinto (héroes vs. ítems).
    for (const slug of deadlockDetailSlugs(data).heroes) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "meta", detail: slug }));
    }
    for (const slug of deadlockDetailSlugs(data).items) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "items", detail: slug }));
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/sitemap.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd games/tft/ui && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add games/tft/ui/src/sitemap.ts games/tft/ui/test/sitemap.test.ts
git commit -m "feat(deadlock): list hero and item detail pages in the sitemap"
```

---

### Task 5: `prerender.ts` — titles and descriptions for the new pages

**Files:**
- Modify: `games/tft/ui/src/prerender.ts`
- Test: `games/tft/ui/test/prerender.test.ts`

**Interfaces:**
- Consumes: `deadlockDetailSlugs` from `./sitemap` (Task 4).
- Produces: `detailNames()` and `prerenderPages()` resolve Deadlock hero/item slugs; `metaFor()` branches to `seo.deadlock.detail` for Deadlock routes with a `detail`.

- [ ] **Step 1: Write the failing tests**

In `games/tft/ui/test/prerender.test.ts`, find the top of the file and extend the `read`/`data` setup. Replace:

```ts
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8"));

const catalog = read("catalog.json");
const data: SitemapData = {
  champions: catalog.champions,
  traits: catalog.traits,
  items: catalog.items,
  comps: read("comps.json").comps,
  unitIds: read("units.json").units.map((u: { id: string }) => u.id),
  itemIds: read("items.json").items.map((i: { id: string }) => i.id),
};
```

with:

```ts
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8"));
const readDl = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../deadlock/data/${name}`, import.meta.url), "utf-8"));

const catalog = read("catalog.json");
const dlCatalog = readDl("catalog.json");
const dlHeroesFile = readDl("heroes.json");
const dlItemsFile = readDl("items.json");
const data: SitemapData = {
  champions: catalog.champions,
  traits: catalog.traits,
  items: catalog.items,
  comps: read("comps.json").comps,
  unitIds: read("units.json").units.map((u: { id: string }) => u.id),
  itemIds: read("items.json").items.map((i: { id: string }) => i.id),
  dlHeroes: dlCatalog.heroes,
  dlItems: dlCatalog.items,
  dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
};
```

Add this new `describe` block at the end of the file:

```ts
describe("las páginas de héroe e ítem de Deadlock", () => {
  // El primer héroe/ítem de la banda por defecto — no se asume ningún nombre
  // puntual, porque el catálogo cambia de una corrida del pipeline a otra.
  const heroId = dlHeroesFile.heroes[0].heroId as number;
  const itemId = dlItemsFile.items[0].itemId as number;

  it("le da al héroe su propio título, distinto del genérico de /deadlock", () => {
    const idx = data.dlHeroIds.indexOf(String(heroId));
    const slug = deadlockDetailSlugs(data).heroes[idx];
    const heroPage = pages.find((p) => p.path === `/en/deadlock/${slug}`);
    const listPage = pages.find((p) => p.path === "/en/deadlock");
    expect(heroPage).toBeDefined();
    expect(heroPage?.title).toContain(dlCatalog.heroes[String(heroId)].name.en);
    expect(heroPage?.title).not.toBe(listPage?.title);
  });

  it("le da al ítem su propio título, distinto del genérico de /deadlock/items", () => {
    const idx = data.dlItemIds.indexOf(String(itemId));
    const slug = deadlockDetailSlugs(data).items[idx];
    const itemPage = pages.find((p) => p.path === `/en/deadlock/items/${slug}`);
    const listPage = pages.find((p) => p.path === "/en/deadlock/items");
    expect(itemPage).toBeDefined();
    expect(itemPage?.title).toContain(dlCatalog.items[String(itemId)].name.en);
    expect(itemPage?.title).not.toBe(listPage?.title);
  });

  it("nombra al héroe en el idioma de la página", () => {
    const idx = data.dlHeroIds.indexOf(String(heroId));
    const slug = deadlockDetailSlugs(data).heroes[idx];
    const en = pages.find((p) => p.path === `/en/deadlock/${slug}`);
    const es = pages.find((p) => p.path === `/es/deadlock/${slug}`);
    expect(en?.title).toContain(dlCatalog.heroes[String(heroId)].name.en);
    expect(es?.title).toContain(dlCatalog.heroes[String(heroId)].name.es);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd games/tft/ui && npx vitest run test/prerender.test.ts`
Expected: FAIL to even collect (TypeScript error: `SitemapData` is missing `dlHeroes`/`dlItems`/`dlHeroIds`/`dlItemIds` until Task 4 lands — if Task 4 is already committed, this instead fails because `/en/deadlock/<hero-slug>` pages don't exist in `pages` yet, so `heroSlug`/`itemPage` are `undefined` and the `toBeDefined()` assertions fail).

- [ ] **Step 3: Implement the `prerender.ts` changes**

Add `deadlockDetailSlugs` to the existing import from `./sitemap` at the top of `games/tft/ui/src/prerender.ts`:

```ts
import { detailSlugs, deadlockDetailSlugs, sitemapPaths, type SitemapData } from "./sitemap";
```

(Adjust to match whatever the existing import line actually names — it already imports `detailSlugs`/`sitemapPaths`/`SitemapData` from `./sitemap`; add `deadlockDetailSlugs` to that same line.)

In the `detailNames` function, replace:

```ts
function detailNames(data: SitemapData, lang: Lang): Record<string, string> {
  const slugs = detailSlugs(data);
  const out: Record<string, string> = {};

  slugs.units.forEach((slug, i) => {
    const id = data.unitIds[i];
    out[`units/${slug}`] = say(data.champions[id]?.name as Localized, lang, slug);
  });
  slugs.items.forEach((slug, i) => {
    const id = data.itemIds[i];
    out[`items/${slug}`] = say(data.items[id]?.name as Localized, lang, slug);
  });
  slugs.meta.forEach((slug, i) => {
    const comp = data.comps[i];
    if (!comp) return;
    const trait = say(data.traits[comp.trait]?.name as Localized, lang, "");
    const carries = comp.carries.map((id) => say(data.champions[id]?.name as Localized, lang, ""));
    out[`meta/${slug}`] = [trait, ...carries].filter(Boolean).join(" ");
  });

  return out;
}
```

with:

```ts
function detailNames(data: SitemapData, lang: Lang): Record<string, string> {
  const slugs = detailSlugs(data);
  const out: Record<string, string> = {};

  slugs.units.forEach((slug, i) => {
    const id = data.unitIds[i];
    out[`units/${slug}`] = say(data.champions[id]?.name as Localized, lang, slug);
  });
  slugs.items.forEach((slug, i) => {
    const id = data.itemIds[i];
    out[`items/${slug}`] = say(data.items[id]?.name as Localized, lang, slug);
  });
  slugs.meta.forEach((slug, i) => {
    const comp = data.comps[i];
    if (!comp) return;
    const trait = say(data.traits[comp.trait]?.name as Localized, lang, "");
    const carries = comp.carries.map((id) => say(data.champions[id]?.name as Localized, lang, ""));
    out[`meta/${slug}`] = [trait, ...carries].filter(Boolean).join(" ");
  });

  const dlSlugs = deadlockDetailSlugs(data);
  dlSlugs.heroes.forEach((slug, i) => {
    const id = data.dlHeroIds[i];
    out[`dl-meta/${slug}`] = say(data.dlHeroes[id]?.name as Localized, lang, slug);
  });
  dlSlugs.items.forEach((slug, i) => {
    const id = data.dlItemIds[i];
    out[`dl-items/${slug}`] = say(data.dlItems[id]?.name as Localized, lang, slug);
  });

  return out;
}
```

In `prerenderPages`, replace:

```ts
    const detail = route.detail ? (names[lang][`${route.section}/${route.detail}`] ?? null) : null;
```

with:

```ts
    const detailKey = route.detail
      ? route.view === "deadlock"
        ? `dl-${route.dlSection}/${route.detail}`
        : `${route.section}/${route.detail}`
      : null;
    const detail = detailKey ? (names[lang][detailKey] ?? null) : null;
```

In `metaFor`, replace:

```ts
  if (detailName) {
    return {
      title: seo.detail.title(detailName, route.section, set),
      description: seo.detail.description(detailName, route.section, set),
    };
  }
```

with:

```ts
  if (detailName && route.view === "deadlock") {
    return {
      title: seo.deadlock.detail.title(detailName, route.dlSection),
      description: seo.deadlock.detail.description(detailName, route.dlSection),
    };
  }
  if (detailName) {
    return {
      title: seo.detail.title(detailName, route.section, set),
      description: seo.detail.description(detailName, route.section, set),
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd games/tft/ui && npx vitest run test/prerender.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd games/tft/ui && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add games/tft/ui/src/prerender.ts games/tft/ui/test/prerender.test.ts
git commit -m "feat(deadlock): give hero and item detail pages their own SEO title and description"
```

---

### Task 6: `PageMeta.tsx` — the same titles for the live single-page app

**Files:**
- Modify: `games/tft/ui/src/PageMeta.tsx`

**Interfaces:**
- Consumes: `heroes`, `items` from `./deadlockSlugs` (Task 2); `buildHeroes`, `PUBLISHED_BAND` from `./deadlockData` (existing, aliased if needed to avoid clashing with TFT's own `DEFAULT_BAND`); `buildItems` from `./deadlockItemsData` (existing).

No test file — `PageMeta` itself renders nothing testable (it mutates `document.head`); Task 5's tests already cover the shared `metaFor` logic this relies on.

- [ ] **Step 1: Add the imports**

In `games/tft/ui/src/PageMeta.tsx`, add these imports alongside the existing ones:

```tsx
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { buildHeroes, PUBLISHED_BAND as DL_PUBLISHED_BAND } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
```

- [ ] **Step 2: Extend `detailName`**

Find the `detailName` function:

```tsx
/** The display name behind a detail slug, in the language on screen. */
function detailName(route: Route, lang: "en" | "es"): string | null {
  if (!route.detail) return null;
  if (route.section === "units") {
    const id = unitSlugs.toId.get(route.detail);
    return id ? text(catalog.champions[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "items") {
    const id = itemSlugs.toId.get(route.detail);
    return id ? text(catalog.items[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "meta") {
    const band = route.band ?? DEFAULT_BAND;
    const id = compSlugs(band).toId.get(route.detail);
    const comp = id ? buildComps(band, lang).find((c) => c.id === id) : undefined;
    return comp ? compName(comp) : null;
  }
  return null;
}
```

Replace with:

```tsx
/** The display name behind a detail slug, in the language on screen. */
function detailName(route: Route, lang: "en" | "es"): string | null {
  if (!route.detail) return null;
  if (route.view === "deadlock") {
    if (route.dlSection === "meta") {
      const id = dlHeroSlugs.toId.get(route.detail);
      if (!id) return null;
      const hero = buildHeroes(DL_PUBLISHED_BAND, lang).find((h) => String(h.heroId) === id);
      return hero?.name ?? null;
    }
    if (route.dlSection === "items") {
      const id = dlItemSlugs.toId.get(route.detail);
      if (!id) return null;
      const item = buildDlItems(DL_PUBLISHED_BAND, lang).find((i) => String(i.itemId) === id);
      return item?.name ?? null;
    }
    return null;
  }
  if (route.section === "units") {
    const id = unitSlugs.toId.get(route.detail);
    return id ? text(catalog.champions[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "items") {
    const id = itemSlugs.toId.get(route.detail);
    return id ? text(catalog.items[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "meta") {
    const band = route.band ?? DEFAULT_BAND;
    const id = compSlugs(band).toId.get(route.detail);
    const comp = id ? buildComps(band, lang).find((c) => c.id === id) : undefined;
    return comp ? compName(comp) : null;
  }
  return null;
}
```

- [ ] **Step 3: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors. (If `PUBLISHED_BAND` or `DEFAULT_BAND` name clashes are reported, confirm the alias `DL_PUBLISHED_BAND` above is used consistently — `PageMeta.tsx` already imports TFT's own `DEFAULT_BAND` under its plain name for the `meta`/`band` branch, so the Deadlock one must stay aliased.)

- [ ] **Step 4: Commit**

```bash
git add games/tft/ui/src/PageMeta.tsx
git commit -m "feat(deadlock): resolve hero/item slugs for the live app's page title"
```

---

### Task 7: `vite.config.ts` — feed Deadlock's catalog to the sitemap and prerender plugins

**Files:**
- Modify: `games/tft/ui/vite.config.ts`

**Interfaces:**
- Consumes: `deadlockDir` (already defined as a constant in this file), `SitemapData` (Task 4's extended shape).

No test file — this is a Vite build plugin; verified in Task 11 by actually running `npm run build`.

- [ ] **Step 1: Extend `seoFiles()`**

In `games/tft/ui/vite.config.ts`, find `function seoFiles()`:

```ts
function seoFiles(): Plugin {
  const read = (name: string) => JSON.parse(readFileSync(`${dataDir}/${name}`, "utf-8"));

  return {
    name: "vestigo-seo-files",
    apply: "build",
    generateBundle() {
      const catalog = read("catalog.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
      };
```

Replace with:

```ts
function seoFiles(): Plugin {
  const read = (name: string) => JSON.parse(readFileSync(`${dataDir}/${name}`, "utf-8"));
  const readDl = (name: string) => JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));

  return {
    name: "vestigo-seo-files",
    apply: "build",
    generateBundle() {
      const catalog = read("catalog.json");
      const dlCatalog = readDl("catalog.json");
      const dlHeroesFile = readDl("heroes.json");
      const dlItemsFile = readDl("items.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
        dlHeroes: dlCatalog.heroes,
        dlItems: dlCatalog.items,
        dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
        dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      };
```

- [ ] **Step 2: Extend `prerenderRoutes()`**

In the same file, find `function prerenderRoutes()` and its `generateBundle` body:

```ts
    async generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset") {
        this.warn("No se encontró index.html en el bundle: no se prerenderizó ninguna ruta.");
        return;
      }
      const html = String(entry.source);

      const catalog = read("catalog.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
      };
```

Replace with:

```ts
    async generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset") {
        this.warn("No se encontró index.html en el bundle: no se prerenderizó ninguna ruta.");
        return;
      }
      const html = String(entry.source);

      const readDl = (name: string) => JSON.parse(readFileSync(`${deadlockDir}/${name}`, "utf-8"));
      const catalog = read("catalog.json");
      const dlCatalog = readDl("catalog.json");
      const dlHeroesFile = readDl("heroes.json");
      const dlItemsFile = readDl("items.json");
      const data: SitemapData = {
        champions: catalog.champions,
        traits: catalog.traits,
        items: catalog.items,
        comps: read("comps.json").comps,
        unitIds: read("units.json").units.map((u: { id: string }) => u.id),
        itemIds: read("items.json").items.map((i: { id: string }) => i.id),
        dlHeroes: dlCatalog.heroes,
        dlItems: dlCatalog.items,
        dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
        dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
      };
```

- [ ] **Step 3: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add games/tft/ui/vite.config.ts
git commit -m "feat(deadlock): feed the hero and item catalog to the sitemap and prerender plugins"
```

---

### Task 8: `Deadlock.tsx` — the open hero comes from the URL

**Files:**
- Modify: `games/tft/ui/src/Deadlock.tsx`

**Interfaces:**
- Consumes: `heroes` from `./deadlockSlugs` (Task 2, imported as `heroSlugs`).
- Produces: `Deadlock` now takes `open?: string` and `onOpen: (slug?: string) => void` props — consumed by Task 10.

No dedicated test file — `Deadlock.tsx` has none today either; verified in Task 11.

- [ ] **Step 1: Add the import**

In `games/tft/ui/src/Deadlock.tsx`, add this import alongside the existing ones:

```tsx
import { heroes as heroSlugs } from "./deadlockSlugs";
```

- [ ] **Step 2: Change `TierGroup` to work off slugs instead of a numeric id**

Find the `TierGroup` function:

```tsx
function TierGroup({
  tier,
  heroes,
  allHeroes,
  crest,
  open,
  onToggle,
  abiertoHero,
  onHero,
}: {
  tier: string;
  heroes: Hero[];
  allHeroes: Hero[];
  crest: ReturnType<typeof bandCrest>;
  open: boolean;
  onToggle: () => void;
  /** Qué héroe tiene la build abierta. Uno solo a la vez. */
  abiertoHero: number | null;
  onHero: (heroId: number) => void;
}) {
```

Replace the type of `abiertoHero`/`onHero` and their doc comment:

```tsx
function TierGroup({
  tier,
  heroes,
  allHeroes,
  crest,
  open,
  onToggle,
  abiertoSlug,
  onHero,
}: {
  tier: string;
  heroes: Hero[];
  allHeroes: Hero[];
  crest: ReturnType<typeof bandCrest>;
  open: boolean;
  onToggle: () => void;
  /** El slug del héroe con la build abierta, si hay uno. Vive en la URL. */
  abiertoSlug?: string;
  onHero: (slug?: string) => void;
}) {
```

Inside the same function, find:

```tsx
          <ol className="dl-list">
            {heroes.map((h) => (
              <HeroRow
                key={h.heroId}
                hero={h}
                rank={allHeroes.indexOf(h) + 1}
                open={abiertoHero === h.heroId}
                onToggle={() => onHero(h.heroId)}
              />
            ))}
          </ol>
```

Replace with:

```tsx
          <ol className="dl-list">
            {heroes.map((h) => {
              const slug = heroSlugs.toSlug.get(String(h.heroId));
              return (
                <HeroRow
                  key={h.heroId}
                  hero={h}
                  rank={allHeroes.indexOf(h) + 1}
                  open={!!slug && slug === abiertoSlug}
                  onToggle={() => onHero(slug === abiertoSlug ? undefined : slug)}
                />
              );
            })}
          </ol>
```

- [ ] **Step 3: Change `Deadlock` itself to take `open`/`onOpen` and force the right tier group visible**

Find:

```tsx
export default function Deadlock({
  section,
  band,
  picker,
}: {
  section: DeadlockSection;
  band: BandId;
  /** El selector, dibujado por App para que la banda sobreviva al cambio de pestaña. */
  picker: React.ReactNode;
}) {
```

Replace with:

```tsx
export default function Deadlock({
  section,
  band,
  picker,
  open,
  onOpen,
}: {
  section: DeadlockSection;
  band: BandId;
  /** El selector, dibujado por App para que la banda sobreviva al cambio de pestaña. */
  picker: React.ReactNode;
  /**
   * El slug del héroe con la fila abierta, si la URL trae uno. Vive en la
   * URL y no en estado local, para que un héroe se pueda compartir por
   * link — mismo criterio que `UnitsView` de TFT.
   */
  open?: string;
  onOpen: (slug?: string) => void;
}) {
```

Find:

```tsx
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(OPEN_BY_DEFAULT));

  /**
   * Qué héroe tiene su build desplegada. **Uno solo a la vez**: la tarjeta es
   * alta, y con dos abiertas la lista deja de leerse como una tier list. Volver a
   * apretar el mismo lo cierra.
   */
  const [heroAbierto, setHeroAbierto] = useState<number | null>(null);
  const alternarTier = (tier: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(tier)) next.add(tier);
      return next;
    });
```

Replace with:

```tsx
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(OPEN_BY_DEFAULT));
  const alternarTier = (tier: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(tier)) next.add(tier);
      return next;
    });

  /**
   * El tier del héroe que la URL abre, para forzar su grupo visible.
   *
   * Sin esto, un link directo a un héroe de tier D abriría su fila pero el
   * grupo D seguiría plegado por defecto: la fila existiría en el HTML (y
   * Google la vería) pero nadie la vería en pantalla al abrir el link.
   */
  const heroTier = open
    ? meta?.heroes.find((h) => heroSlugs.toSlug.get(String(h.heroId)) === open)?.tier
    : undefined;
  const abiertosEfectivo = heroTier ? new Set(abiertos).add(heroTier) : abiertos;
```

Find, further down in the same function's JSX:

```tsx
          {!enParches &&
            TIER_ORDER.map((tier) => {
              const heroes = meta.heroes.filter((h) => h.tier === tier);
              if (heroes.length === 0) return null;
              return (
                <TierGroup
                  key={tier}
                  tier={tier}
                  heroes={heroes}
                  allHeroes={meta.heroes}
                  crest={crest}
                  open={abiertos.has(tier)}
                  onToggle={() => alternarTier(tier)}
                  abiertoHero={heroAbierto}
                  onHero={(id) => setHeroAbierto((prev) => (prev === id ? null : id))}
                />
              );
            })}
```

Replace with:

```tsx
          {!enParches &&
            TIER_ORDER.map((tier) => {
              const heroes = meta.heroes.filter((h) => h.tier === tier);
              if (heroes.length === 0) return null;
              return (
                <TierGroup
                  key={tier}
                  tier={tier}
                  heroes={heroes}
                  allHeroes={meta.heroes}
                  crest={crest}
                  open={abiertosEfectivo.has(tier)}
                  onToggle={() => alternarTier(tier)}
                  abiertoSlug={open}
                  onHero={onOpen}
                />
              );
            })}
```

- [ ] **Step 4: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: an error at the call site in `App.tsx` (`<Deadlock section={...} band={...} picker={...} />` is now missing the required `onOpen` prop) — that's expected and gets fixed in Task 10. Confirm there are no OTHER errors (in `Deadlock.tsx` itself).

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/Deadlock.tsx
git commit -m "feat(deadlock): drive the open hero row from the URL"
```

---

### Task 9: `DeadlockItems.tsx` — the open item comes from the URL

**Files:**
- Modify: `games/tft/ui/src/DeadlockItems.tsx`

**Interfaces:**
- Consumes: `items` from `./deadlockSlugs` (Task 2, imported as `itemSlugs`).
- Produces: `DeadlockItems` now takes `open?: string` and `onOpen: (slug?: string) => void` props — consumed by Task 10.

- [ ] **Step 1: Add the import**

In `games/tft/ui/src/DeadlockItems.tsx`, add:

```tsx
import { items as itemSlugs } from "./deadlockSlugs";
```

- [ ] **Step 2: Change `CostGroup` to work off slugs instead of a numeric id**

Find:

```tsx
function CostGroup({
  cost,
  items,
  base,
  open,
  onToggle,
  openItem,
  onToggleItem,
}: {
  cost: number;
  items: Item[];
  base: number;
  open: boolean;
  onToggle: () => void;
  openItem: number | null;
  onToggleItem: (itemId: number) => void;
}) {
```

Replace with:

```tsx
function CostGroup({
  cost,
  items,
  base,
  open,
  onToggle,
  openSlug,
  onOpenItem,
}: {
  cost: number;
  items: Item[];
  base: number;
  open: boolean;
  onToggle: () => void;
  /** El slug del ítem con la ficha abierta, si hay uno. Vive en la URL. */
  openSlug?: string;
  onOpenItem: (slug?: string) => void;
}) {
```

Inside the same function, find:

```tsx
          <ol className="dl-list dl-item-list">
            {items.map((i) => (
              <ItemRow
                key={i.itemId}
                item={i}
                base={base}
                cost={precio}
                open={openItem === i.itemId}
                onToggle={() => onToggleItem(i.itemId)}
              />
            ))}
          </ol>
```

Replace with:

```tsx
          <ol className="dl-list dl-item-list">
            {items.map((i) => {
              const slug = itemSlugs.toSlug.get(String(i.itemId));
              return (
                <ItemRow
                  key={i.itemId}
                  item={i}
                  base={base}
                  cost={precio}
                  open={!!slug && slug === openSlug}
                  onToggle={() => onOpenItem(slug === openSlug ? undefined : slug)}
                />
              );
            })}
          </ol>
```

- [ ] **Step 3: Change `DeadlockItems` itself to take `open`/`onOpen` and force the right cost group visible**

Find:

```tsx
export default function DeadlockItems({
  band,
  picker,
}: {
  band: BandId;
  picker: React.ReactNode;
}) {
```

Replace with:

```tsx
export default function DeadlockItems({
  band,
  picker,
  open,
  onOpen,
}: {
  band: BandId;
  picker: React.ReactNode;
  /** El slug del ítem con la ficha abierta, si la URL trae uno. */
  open?: string;
  onOpen: (slug?: string) => void;
}) {
```

Find:

```tsx
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(OPEN_COSTS));
  const alternar = (cost: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(cost)) next.add(cost);
      return next;
    });

  /**
   * Qué ítem tiene la ficha abierta. **Uno solo a la vez**, y no un Set como los
   * precios: abrir una ficha es leerla, y dos fichas abiertas separan la que
   * estás leyendo de la fila que la abrió. Volver a tocar la misma la cierra.
   */
  const [itemAbierto, setItemAbierto] = useState<number | null>(null);
  const alternarItem = (itemId: number) =>
    setItemAbierto((prev) => (prev === itemId ? null : itemId));
```

Replace with:

```tsx
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(OPEN_COSTS));
  const alternar = (cost: number) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(cost)) next.add(cost);
      return next;
    });

  /**
   * El precio del ítem que la URL abre, para forzar su grupo visible — mismo
   * motivo que el tier forzado en `Deadlock.tsx`.
   */
  const openCost = open
    ? meta?.items.find((i) => itemSlugs.toSlug.get(String(i.itemId)) === open)?.cost
    : undefined;
  const abiertosEfectivo = openCost !== undefined ? new Set(abiertos).add(openCost) : abiertos;
```

Find, further down in the same function's JSX:

```tsx
            {COSTS.map((cost) => {
              const delGrupo = meta.items
                .filter((i) => i.cost === cost)
                .sort(
                  (a, b) =>
                    TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.delta - a.delta
                );
              if (delGrupo.length === 0) return null;
              return (
                <CostGroup
                  key={cost}
                  cost={cost}
                  items={delGrupo}
                  base={meta.file.costBaselines[String(cost)] ?? 0.5}
                  open={abiertos.has(cost)}
                  onToggle={() => alternar(cost)}
                  openItem={itemAbierto}
                  onToggleItem={alternarItem}
                />
              );
            })}
```

Replace with:

```tsx
            {COSTS.map((cost) => {
              const delGrupo = meta.items
                .filter((i) => i.cost === cost)
                .sort(
                  (a, b) =>
                    TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.delta - a.delta
                );
              if (delGrupo.length === 0) return null;
              return (
                <CostGroup
                  key={cost}
                  cost={cost}
                  items={delGrupo}
                  base={meta.file.costBaselines[String(cost)] ?? 0.5}
                  open={abiertosEfectivo.has(cost)}
                  onToggle={() => alternar(cost)}
                  openSlug={open}
                  onOpenItem={onOpen}
                />
              );
            })}
```

- [ ] **Step 4: Type-check**

Run: `cd games/tft/ui && npx tsc -b --noEmit`
Expected: an error at the call site in `App.tsx` (missing `onOpen` prop) — expected, fixed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/DeadlockItems.tsx
git commit -m "feat(deadlock): drive the open item panel from the URL"
```

---

### Task 10: Wire it all into `App.tsx`

**Files:**
- Modify: `games/tft/ui/src/App.tsx`

**Interfaces:**
- Consumes: `DeadlockSection` type from `./route` (Task 1); `Deadlock`'s and `DeadlockItems`'s new `open`/`onOpen` props (Tasks 8, 9).

- [ ] **Step 1: Import `DeadlockSection`**

In `games/tft/ui/src/App.tsx`, find the import from `./route`:

```ts
import {
  LANGS,
  SECTIONS,
  DEADLOCK_SECTIONS,
  parseRoute,
  routePath,
  type Route,
  type Section,
} from "./route";
```

Replace with:

```ts
import {
  LANGS,
  SECTIONS,
  DEADLOCK_SECTIONS,
  parseRoute,
  routePath,
  type Route,
  type Section,
  type DeadlockSection,
} from "./route";
```

- [ ] **Step 2: Add a `goDlDetail` navigation helper**

Find `goDetail` (TFT's equivalent):

```ts
  /** Opening or closing a detail is a navigation, so it gets its own URL. */
  const goDetail = (next: Section, slug?: string) =>
    navigate({ ...route, view: "tft", section: next, detail: slug });
```

Add, right after it:

```ts
  /** Same idea, for Deadlock's hero and item detail pages. */
  const goDlDetail = (next: DeadlockSection, slug?: string) =>
    navigate({ ...route, view: "deadlock", dlSection: next, detail: slug });
```

- [ ] **Step 3: Clear `detail` when switching Deadlock tabs, and wire the two components**

Find:

```tsx
      {place === "deadlock" && (
        <>
          {/* La misma barra que TFT, con las pestañas de este juego. Que sea el
              mismo control y no uno propio es deliberado: quien viene de la otra
              pestaña no tiene que aprender nada nuevo. */}
          <nav className="switcher" aria-label={copy.games.deadlock}>
            {DEADLOCK_SECTIONS.map((id) => (
              <RouteLink
                className="switch"
                key={id}
                to={{ ...route, view: "deadlock", dlSection: id }}
                active={route.dlSection === id}
                onNavigate={navigate}
              >
                {copy.deadlock.tabs[id]}
              </RouteLink>
            ))}
          </nav>
          {route.dlSection === "items" ? (
            <DeadlockItems band={dlBand} picker={dlPicker} />
          ) : route.dlSection === "ranks" ? (
            /* Sin `picker`: la escalera es el eje sobre el que se definen las
               bandas, así que filtrarla por una no significaría nada. */
            <DeadlockRanks />
          ) : (
            <Deadlock section={route.dlSection} band={dlBand} picker={dlPicker} />
          )}
        </>
      )}
```

Replace with:

```tsx
      {place === "deadlock" && (
        <>
          {/* La misma barra que TFT, con las pestañas de este juego. Que sea el
              mismo control y no uno propio es deliberado: quien viene de la otra
              pestaña no tiene que aprender nada nuevo. */}
          <nav className="switcher" aria-label={copy.games.deadlock}>
            {DEADLOCK_SECTIONS.map((id) => (
              <RouteLink
                className="switch"
                key={id}
                // El héroe o ítem abierto no sobrevive al cambio de pestaña: es
                // igual que TFT, que limpia `detail` en su propio switcher.
                to={{ ...route, view: "deadlock", dlSection: id, detail: undefined }}
                active={route.dlSection === id}
                onNavigate={navigate}
              >
                {copy.deadlock.tabs[id]}
              </RouteLink>
            ))}
          </nav>
          {route.dlSection === "items" ? (
            <DeadlockItems
              band={dlBand}
              picker={dlPicker}
              open={route.detail}
              onOpen={(slug) => goDlDetail("items", slug)}
            />
          ) : route.dlSection === "ranks" ? (
            /* Sin `picker`: la escalera es el eje sobre el que se definen las
               bandas, así que filtrarla por una no significaría nada. */
            <DeadlockRanks />
          ) : (
            <Deadlock
              section={route.dlSection}
              band={dlBand}
              picker={dlPicker}
              // Sólo "meta" tiene héroe abierto; "patches" usa el mismo
              // componente pero no lee `open`.
              open={route.dlSection === "meta" ? route.detail : undefined}
              onOpen={(slug) => goDlDetail("meta", slug)}
            />
          )}
        </>
      )}
```

- [ ] **Step 4: Type-check and run the full test suite**

Run: `cd games/tft/ui && npx tsc -b --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add games/tft/ui/src/App.tsx
git commit -m "feat(deadlock): wire hero and item detail pages into the app shell"
```

---

### Task 11: Manual verification on localhost

No code changes — confirms the feature works end to end, including the part no unit test can cover: a real production build's prerendered HTML and generated sitemap.

- [ ] **Step 1: Verify live navigation with the dev server**

Run: `cd games/tft/ui && npm run dev` (or use the project's `preview_start` tool).

- Open `/en/deadlock`. Click a hero row. Confirm the URL becomes `/en/deadlock/<hero-slug>` and the row stays open.
- Reload that URL directly. Confirm the same hero's row opens automatically, **and its tier group is visibly expanded** (not just present in the DOM) — this is the case Task 8's `abiertosEfectivo` exists to cover. Pick a hero from tier C or D specifically for this check, since tiers S/A/B are open by default anyway and wouldn't catch a regression here.
- Switch to the Items tab. Confirm the URL drops the hero slug (goes to plain `/en/deadlock/items`), not `/en/deadlock/items/<hero-slug>`.
- Click an item row on `/en/deadlock/items`. Confirm the URL becomes `/en/deadlock/items/<item-slug>` and, for an item whose price group is closed by default, that the group visibly opens.
- Repeat the hero check once in Spanish (`/es/deadlock/<hero-slug>`), confirming the page renders in Spanish with the same hero open.
- Visit a nonsense slug, e.g. `/en/deadlock/not-a-real-hero`. Confirm the page renders normally (list closed, no crash), not a blank screen.

- [ ] **Step 2: Verify the production build's prerendered HTML and sitemap**

Run: `cd games/tft/ui && npm run build`
Expected: build succeeds. Check the build's own log output for the "Prerenderizadas N rutas" line — N should be roughly 200 higher than before this feature (38 heroes + ~150 items, in 2 languages).

Then inspect two of the generated files directly (paths will be under `games/tft/ui/dist/`):

- `dist/en/deadlock/<a-real-hero-slug>.html` — open it and confirm: the `<title>` is the hero's own title (not "Hero tier list | Vestigo"), and the hero's name appears in the visible HTML body (view-source, not the rendered page — this is the part Google's first pass actually reads).
- `dist/en/deadlock/items/<a-real-item-slug>.html` — same check, for an item.
- `dist/sitemap.xml` — confirm it contains entries for the same two URLs, each with an `<xhtml:link rel="alternate" hreflang="es" .../>` pointing at the Spanish twin.

- [ ] **Step 3: Report back**

Once every check above passes, report to the user that the feature works on localhost (both dev-server navigation and a real production build's prerendered output) and ask whether to push the commits to `main` — do not push automatically.

---

## Self-Review Notes

- **Spec coverage:** URL scheme (Task 1), default-band-only (Tasks 2, 4 — slugs and sitemap both derive from `PUBLISHED_BAND` data only), no new content (Tasks 8/9 reuse `HeroRow`/`ItemRow` unchanged), build-card left in its normal loading state (no task touches `deadlockBuildsData.ts` or its `import()` — deliberately, per the spec's Decision), invalid-slug handling (already true of `open={!!slug && slug === openSlug}` — an unmatched slug simply never equals any row's slug, so nothing opens, and `detailName`/`metaFor` fall back to the section's generic title), SEO copy (Task 3), tests mirroring TFT's existing coverage shape (Tasks 1, 2, 4, 5) — all covered.
- **Placeholder scan:** none found — every step shows the exact before/after code.
- **Type consistency checked:** `SlugMap`/`heroes`/`items` from Task 2 are used with the same shape in Tasks 4, 6, 8, 9 (`.toSlug.get(String(numericId))`, `.toId.get(slugString)`). `SitemapData`'s four new fields (`dlHeroes`, `dlItems`, `dlHeroIds`, `dlItemIds`) are produced identically in Tasks 4/5's test fixtures and Task 7's real plugin code — same field names, same shapes (`Record<string, {name: Localized}>` and `string[]`). `open?: string` / `onOpen: (slug?: string) => void` prop names match exactly between Tasks 8/9 (the components) and Task 10 (the caller).
