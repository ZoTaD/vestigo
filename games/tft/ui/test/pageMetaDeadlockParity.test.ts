import { describe, expect, it } from "vitest";
import { buildHeroes, PUBLISHED_BAND } from "../src/deadlockData";
import { buildItems } from "../src/deadlockItemsData";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "../src/deadlockSlugs";
import { parseRoute } from "../src/route";
import { prerenderPages } from "../src/prerender";
import { deadlockDetailSlugs, sitemapPaths, type SitemapData } from "../src/sitemap";
import { readFileSync } from "node:fs";

/**
 * `prerender.ts` y `PageMeta.tsx` resuelven el nombre de un héroe/ítem de
 * Deadlock por su cuenta, cada uno — es la única pieza que los dos sistemas
 * no comparten. Si alguna vez dejan de coincidir, la vista previa estática
 * de un link compartido diría un nombre y la página en vivo, otro.
 *
 * Esta prueba no importa `PageMeta.tsx` directamente (es un componente que
 * muta `document.head`, no una función pura) — en cambio reconstruye lo que
 * `detailName()` calcula, con el mismo camino de datos
 * (`buildHeroes`/`buildItems` sobre `PUBLISHED_BAND`) que ese archivo usa, y
 * lo compara contra lo que `prerenderPages()` puso en el título estático.
 */

const readDl = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../deadlock/data/${name}`, import.meta.url), "utf-8"));
const readTft = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url), "utf-8"));

const catalog = readTft("catalog.json");
const dlCatalog = readDl("catalog.json");
const dlHeroesFile = readDl("heroes.json");
const dlItemsFile = readDl("items.json");
const data: SitemapData = {
  champions: catalog.champions,
  traits: catalog.traits,
  items: catalog.items,
  comps: readTft("comps.json").comps,
  unitIds: readTft("units.json").units.map((u: { id: string }) => u.id),
  itemIds: readTft("items.json").items.map((i: { id: string }) => i.id),
  dlHeroes: dlCatalog.heroes,
  dlItems: dlCatalog.items,
  dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
};
const SET = String(catalog.set ?? "");
const pages = prerenderPages(data, SET);

/** Lo mismo que hace PageMeta.detailName() para un héroe de Deadlock. */
function liveHeroName(slug: string, lang: "en" | "es"): string | null {
  const id = dlHeroSlugs.toId.get(slug);
  if (!id) return null;
  const hero = buildHeroes(PUBLISHED_BAND, lang).find((h) => String(h.heroId) === id);
  return hero?.name ?? null;
}

/** Lo mismo que hace PageMeta.detailName() para un ítem de Deadlock. */
function liveItemName(slug: string, lang: "en" | "es"): string | null {
  const id = dlItemSlugs.toId.get(slug);
  if (!id) return null;
  const item = buildItems(PUBLISHED_BAND, lang).find((i) => String(i.itemId) === id);
  return item?.name ?? null;
}

describe("PageMeta y prerender coinciden en el nombre de cada héroe de Deadlock", () => {
  const slugs = deadlockDetailSlugs(data).heroes;

  it("hay héroes para probar", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    it(`"${slug}" — EN y ES`, () => {
      for (const lang of ["en", "es"] as const) {
        const page = pages.find((p) => p.path === `/${lang}/deadlock/${slug}`);
        const live = liveHeroName(slug, lang);
        expect(live).not.toBeNull();
        expect(page?.title).toContain(live as string);
      }
    });
  }
});

describe("PageMeta y prerender coinciden en el nombre de cada ítem de Deadlock", () => {
  const slugs = deadlockDetailSlugs(data).items;

  it("hay ítems para probar", () => {
    expect(slugs.length).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    it(`"${slug}" — EN y ES`, () => {
      for (const lang of ["en", "es"] as const) {
        const page = pages.find((p) => p.path === `/${lang}/deadlock/items/${slug}`);
        const live = liveItemName(slug, lang);
        expect(live).not.toBeNull();
        expect(page?.title).toContain(live as string);
      }
    });
  }
});
