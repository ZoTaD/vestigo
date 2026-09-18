import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prerenderPages, renderHtml, metaFor } from "../src/prerender";
import { sitemapPaths, deadlockDetailSlugs, type SitemapData } from "../src/sitemap";
import { parseRoute } from "../src/route";

/**
 * El HTML estático que ven los scrapers de link previews.
 *
 * Lo que se prueba acá no es que las etiquetas existan, sino que **digan lo
 * mismo que diría la app**: el valor entero de este archivo es que una página
 * compartida se previsualice como la página que es.
 */

const readDl = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../deadlock/data/${name}`, import.meta.url), "utf-8"));

const dlCatalog = readDl("catalog.json");
const dlHeroesFile = readDl("heroes.json");
const dlItemsFile = readDl("items.json");
const data: SitemapData = {
  dlHeroes: dlCatalog.heroes,
  dlItems: dlCatalog.items,
  dlHeroIds: dlHeroesFile.heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: dlItemsFile.items.map((i: { itemId: number }) => String(i.itemId)),
};
const pages = prerenderPages(data);

// El primer héroe/ítem de la banda por defecto — no se asume ningún nombre
// puntual, porque el catálogo cambia de una corrida del pipeline a otra.
const heroId = dlHeroesFile.heroes[0].heroId as number;
const itemId = dlItemsFile.items[0].itemId as number;
const heroSlug = deadlockDetailSlugs(data).heroes[data.dlHeroIds.indexOf(String(heroId))];
const itemSlug = deadlockDetailSlugs(data).items[data.dlItemIds.indexOf(String(itemId))];

describe("prerenderPages", () => {
  it("cubre exactamente las direcciones que el sitemap declara", () => {
    // Si el sitemap pide indexar una URL que no tiene HTML propio, esa página
    // vuelve a previsualizarse como la home, que es el bug que esto arregla.
    expect(pages.map((p) => p.path).sort()).toEqual([...sitemapPaths(data)].sort());
  });

  it("le da a cada página su propio título", () => {
    const titles = new Set(pages.map((p) => p.title));
    // No todas son únicas —las dos traducciones de un ítem pueden coincidir—
    // pero un puñado de títulos para cientos de páginas sería el bug de vuelta.
    expect(titles.size).toBeGreaterThan(pages.length / 2);
  });

  it("nombra el héroe en el idioma de la página", () => {
    const en = pages.find((p) => p.path === `/en/deadlock/${heroSlug}`);
    const es = pages.find((p) => p.path === `/es/deadlock/${heroSlug}`);
    expect(en?.title).toContain(dlCatalog.heroes[String(heroId)].name.en);
    expect(es?.title).toContain(dlCatalog.heroes[String(heroId)].name.es);
    // La copia es distinta aunque el nombre propio coincida.
    expect(en?.title).not.toBe(es?.title);
  });

  it("apunta el canonical a su propia URL, no a la home", () => {
    for (const p of pages) expect(p.canonical).toBe(`https://vestigo.gg${p.path}`);
  });

  it("declara las dos traducciones y un x-default", () => {
    const p = pages.find((x) => x.path === "/es/deadlock/items")!;
    expect(p.alternates.map((a) => a.hreflang).sort()).toEqual(["en", "es", "x-default"]);
    expect(p.alternates.find((a) => a.hreflang === "x-default")!.href).toContain("/en/");
  });

  it("usa la misma copia que la app para una ruta sin detalle", () => {
    const route = parseRoute("/en/deadlock/items");
    const mine = metaFor(route, "en", null);
    const page = pages.find((p) => p.path === "/en/deadlock/items")!;
    expect(page.title).toBe(mine.title);
    expect(page.description).toBe(mine.description);
  });

  /**
   * TFT salió del sitio el 2026-09-15. Sin HTML propio, una `/tft/...` la
   * contesta Netlify con 301 (ver `netlify.toml`); si volviera a prerenderizarse,
   * el archivo estático ganaría a la redirección y la página vieja seguiría viva.
   */
  it("no escribe ninguna página de TFT", () => {
    expect(pages.some((p) => /\/tft(\/|$)/.test(p.path))).toBe(false);
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

  const page = pages.find((p) => p.path === `/es/deadlock/items/${itemSlug}`)!;
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
    expect(html).toContain(`content="https://vestigo.gg/es/deadlock/items/${itemSlug}"`);
    expect(html).not.toContain(`content="https://vestigo.gg/en"`);
  });

  it("conserva la imagen de la tarjeta", () => {
    // El borrado se lleva TODAS las og, así que la imagen hay que reponerla; sin
    // esto la tarjeta queda sin imagen y el arreglo sería un empeoramiento.
    // Sin imágenes dibujadas, es la genérica.
    expect(html).toContain(`property="og:image" content="https://vestigo.gg/og.jpg"`);
    expect(html).toContain(`name="twitter:image" content="https://vestigo.gg/og.jpg"`);
  });

  it("usa la imagen propia del ítem cuando el build la dibujó", () => {
    const [conImagen] = prerenderPages(data, () => true).filter((p) => p.path === page.path);
    const out = renderHtml(base, conImagen, "Vestigo");
    expect(out).toContain(`property="og:image" content="https://vestigo.gg/og/es/deadlock/items/${itemSlug}.jpg"`);
    expect(out).toContain('property="og:image:width" content="1200"');
  });

  it("lleva migas de pan como datos estructurados", () => {
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"BreadcrumbList"');
    expect(html.split("application/ld+json").length - 1).toBe(1);
  });

  it("escapa las comillas para no romper el atributo", () => {
    const raro = { ...page, title: 'Ítem "raro" & <b>', description: "x" };
    expect(renderHtml(base, raro, "Vestigo")).toContain("&quot;raro&quot;");
  });
});

describe("las páginas de héroe e ítem de Deadlock", () => {
  it("le da al héroe su propio título, distinto del genérico de /deadlock", () => {
    const heroPage = pages.find((p) => p.path === `/en/deadlock/${heroSlug}`);
    const listPage = pages.find((p) => p.path === "/en/deadlock");
    expect(heroPage).toBeDefined();
    expect(heroPage?.title).toContain(dlCatalog.heroes[String(heroId)].name.en);
    expect(heroPage?.title).not.toBe(listPage?.title);
  });

  it("le da al ítem su propio título, distinto del genérico de /deadlock/items", () => {
    const itemPage = pages.find((p) => p.path === `/en/deadlock/items/${itemSlug}`);
    const listPage = pages.find((p) => p.path === "/en/deadlock/items");
    expect(itemPage).toBeDefined();
    expect(itemPage?.title).toContain(dlCatalog.items[String(itemId)].name.en);
    expect(itemPage?.title).not.toBe(listPage?.title);
  });
});

describe("las ediciones de Vestigo News", () => {
  const conNews: SitemapData = {
    ...data,
    dlNews: [{ slug: "2026-09-16", title: "09-16-2026 Update", date: "2026-09-16T20:16:43.000Z", headline: "Thanks Yoshi", score: { nerf: 7, buff: 10, mixed: 2, fix: 1 } }],
  };
  const pagesNews = prerenderPages(conNews, () => true);
  const edicion = pagesNews.find((p) => p.path === "/en/deadlock/patches/2026-09-16")!;
  const portada = pagesNews.find((p) => p.path === "/en/deadlock/patches")!;

  it("cada edición tiene su título, su imagen y su fecha", () => {
    expect(edicion.title).toContain("09-16-2026 Update");
    expect(edicion.title).toContain("Vestigo News");
    expect(edicion.image).toBe("https://vestigo.gg/og/en/deadlock/patches/2026-09-16.jpg");
    expect(edicion.ogType).toBe("article");
    expect(edicion.published).toBe("2026-09-16T20:16:43.000Z");
  });

  it("es un NewsArticle con fecha para Google", () => {
    const article = edicion.jsonLd.find((x) => (x as { "@type": string })["@type"] === "NewsArticle") as Record<string, unknown>;
    expect(article).toBeDefined();
    expect(article.datePublished).toBe("2026-09-16T20:16:43.000Z");
    expect(article.alternativeHeadline).toBe("Thanks Yoshi");
  });

  it("/deadlock/patches lleva la imagen de la última edición, que es la URL que se comparte", () => {
    expect(portada.image).toBe("https://vestigo.gg/og/en/deadlock/patches/2026-09-16.jpg");
    expect(portada.ogType).toBe("website");
  });

  it("declara la fecha de publicación en el HTML", () => {
    const html = renderHtml(`<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>`, edicion, "Vestigo");
    expect(html).toContain('property="article:published_time"');
    expect(html).toContain('property="og:type" content="article"');
  });
});
