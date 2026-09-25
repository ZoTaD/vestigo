import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

/**
 * PoE2 en el sitemap y en el prerender (2026-09-23): cada pestaña, liga,
 * categoría, ficha y edición tiene su dirección, en los dos idiomas, con su
 * propio título. Se arma con los archivos reales de `games/poe2/data`.
 */
const DATA = join(__dirname, "..", "..", "games", "poe2", "data");
const read = (p: string) => JSON.parse(readFileSync(join(DATA, p), "utf-8"));
const leagues = read("economy/leagues.json").leagues as { slug: string; name: string }[];
const entries = read("encyclopedia/index.json") as { id: string; cat: string; en: string; es: string }[];
const editions = read("patches/index.json").editions;

const data: SitemapData = {
  dlHeroes: {},
  dlItems: {},
  dlHeroIds: [],
  dlItemIds: [],
  p2: { leagues, entries, editions },
};
const paths = sitemapPaths(data);
const p2 = paths.filter((p) => p.includes("/poe2"));

describe("PoE2 en el sitemap", () => {
  it("lista cada ficha, liga y edición en los dos idiomas", () => {
    // las 5 pestañas (economía, enciclopedia, parches, árbol, regex) + ligas + categorías + fichas + ediciones
    const perLang = 5 + (leagues.length - 1) + 4 + entries.length + editions.length;
    expect(p2.length).toBe(perLang * 2);
  });

  it("la liga por defecto no se repite: ya es /poe2", () => {
    expect(p2).toContain("/es/poe2");
    expect(p2).toContain("/es/poe2/tree");
    expect(p2).not.toContain(`/es/poe2/economy/${leagues[0].slug}`);
    expect(p2).toContain(`/es/poe2/economy/${leagues[1].slug}`);
  });

  it("no repite direcciones", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("PoE2 en el prerender", () => {
  const pages = prerenderPages(data);
  const page = (path: string) => pages.find((p) => p.path === path)!;

  it("cada ficha lleva su nombre en el título, en su idioma", () => {
    const comet = entries.find((e) => e.id === "gems/comet")!;
    expect(page("/es/poe2/encyclopedia/gems/comet").title).toContain(comet.es);
    expect(page("/en/poe2/encyclopedia/gems/comet").title).toContain(comet.en);
  });

  it("no hay dos páginas de PoE2 con el mismo título en el mismo idioma", () => {
    for (const lang of ["en", "es"]) {
      const titles = pages.filter((p) => p.path.startsWith(`/${lang}/poe2`)).map((p) => p.title);
      const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
      // El pipeline desambigua los nombres que la traducción oficial repite.
      expect(dup).toEqual([]);
    }
  });

  it("categorías, ligas y ediciones tienen título propio", () => {
    expect(page("/es/poe2/encyclopedia/uniques").title).toMatch(/Únicos/);
    expect(page(`/en/poe2/economy/${leagues[1].slug}`).title).toContain(leagues[1].name);
    expect(page(`/es/poe2/patches/${editions[0].slug}`).title).toContain(editions[0].version);
  });

  it("las fichas llevan migas de pan hasta la categoría", () => {
    const ld = page("/es/poe2/encyclopedia/gems/comet").jsonLd as { itemListElement: { name: string }[] }[];
    expect(ld[0].itemListElement.map((i) => i.name)).toEqual(["Vestigo", "Path of Exile 2", "Enciclopedia", "Gemas", "Cometa"]);
  });
});
