import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prerenderPages, renderHtml, metaFor, titleBand } from "../src/prerender";
import { sitemapPaths, deadlockDetailSlugs, type SitemapData } from "../src/sitemap";
import { parseRoute } from "../src/route";

/**
 * El HTML estático que ven los scrapers de link previews.
 *
 * Lo que se prueba acá no es que las etiquetas existan, sino que **digan lo
 * mismo que diría la app**: el valor entero de este archivo es que una página
 * compartida se previsualice como la página que es.
 */

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
const SET = String(catalog.set ?? "");
const pages = prerenderPages(data, SET);

describe("prerenderPages", () => {
  it("cubre exactamente las direcciones que el sitemap declara", () => {
    // Si el sitemap pide indexar una URL que no tiene HTML propio, esa página
    // vuelve a previsualizarse como la home, que es el bug que esto arregla.
    expect(pages.map((p) => p.path).sort()).toEqual([...sitemapPaths(data)].sort());
  });

  it("le da a cada página su propio título", () => {
    const titles = new Set(pages.map((p) => p.title));
    // No todas son únicas —las dos traducciones de una comp pueden coincidir—
    // pero un puñado de títulos para cientos de páginas sería el bug de vuelta.
    expect(titles.size).toBeGreaterThan(pages.length / 2);
  });

  it("nombra la unidad en el idioma de la página", () => {
    const en = pages.find((p) => p.path === "/en/tft/units/lissandra");
    const es = pages.find((p) => p.path === "/es/tft/units/lissandra");
    expect(en?.title).toContain("Lissandra");
    expect(es?.title).toContain("Lissandra");
    // La copia es distinta aunque el nombre propio coincida.
    expect(en?.title).not.toBe(es?.title);
  });

  it("apunta el canonical a su propia URL, no a la home", () => {
    for (const p of pages) expect(p.canonical).toBe(`https://vestigo.gg${p.path}`);
  });

  it("declara las dos traducciones y un x-default", () => {
    const p = pages.find((x) => x.path === "/es/tft/meta")!;
    expect(p.alternates.map((a) => a.hreflang).sort()).toEqual(["en", "es", "x-default"]);
    expect(p.alternates.find((a) => a.hreflang === "x-default")!.href).toContain("/en/");
  });

  it("conserva el título de la tier list en la banda por defecto", () => {
    // El bug que ya pasó una vez: la ruta lleva banda apenas el visitante elige
    // una, y titular por eso solo retitulaba la página que pelea por "tier list".
    expect(titleBand(parseRoute("/en/tft/meta"))).toBeNull();
    expect(titleBand(parseRoute("/en/tft/meta/apex"))).toBe("apex");
  });

  it("usa la misma copia que la app para una ruta sin detalle", () => {
    const route = parseRoute("/en/tft/items");
    const mine = metaFor(route, "en", SET, null);
    const page = pages.find((p) => p.path === "/en/tft/items")!;
    expect(page.title).toBe(mine.title);
    expect(page.description).toBe(mine.description);
  });
});

describe("renderHtml", () => {
  const base =
    `<!doctype html><html><head>` +
    `<title>Vestigo — Get better at the games you play</title>` +
    `<meta name="description" content="generico">` +
    `<meta property="og:title" content="generico">` +
    `<meta property="og:url" content="https://vestigo.gg/en">` +
    `<meta property="og:image" content="https://vestigo.gg/og.jpg">` +
    `<meta name="twitter:title" content="generico">` +
    `</head><body></body></html>`;

  const page = pages.find((p) => p.path === "/es/tft/units/lissandra")!;
  const html = renderHtml(base, page, "Vestigo");

  it("pone el título de la página en el HTML crudo", () => {
    expect(html).toContain(`<title>${page.title}</title>`);
    expect(html).not.toContain("Get better at the games you play</title>");
  });

  it("no deja dos versiones de la misma etiqueta", () => {
    // Dos og:title es pedirle al scraper que elija, y elige el primero.
    for (const tag of ["og:title", "og:url", "og:description", "twitter:title"]) {
      expect(html.split(`"${tag}"`).length - 1).toBe(1);
    }
  });

  it("corrige la og:url, que apuntaba a la home en todas las páginas", () => {
    expect(html).toContain(`content="https://vestigo.gg/es/tft/units/lissandra"`);
    expect(html).not.toContain(`content="https://vestigo.gg/en"`);
  });

  it("conserva la imagen de la tarjeta", () => {
    // El borrado se lleva TODAS las og, así que la imagen hay que reponerla; sin
    // esto la tarjeta queda sin imagen y el arreglo sería un empeoramiento.
    expect(html).toContain(`property="og:image" content="https://vestigo.gg/og.jpg"`);
    expect(html).toContain(`name="twitter:image" content="https://vestigo.gg/og.jpg"`);
  });

  it("escapa las comillas para no romper el atributo", () => {
    const raro = { ...page, title: 'Comp "rara" & <b>', description: "x" };
    expect(renderHtml(base, raro, "Vestigo")).toContain("&quot;rara&quot;");
  });
});

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
