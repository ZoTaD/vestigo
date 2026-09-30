import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRoute, routePath } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { metaFor, prerenderPages } from "../src/prerender";
import home from "../../games/d2r/data/home.json";
import d2meta from "../../games/d2r/data/meta.json";

/** Diablo II: Resurrected (2026-09-29): las direcciones de la portada, las pestañas y las fichas. */
describe("las direcciones de Diablo II", () => {
  it("la portada es /d2r en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const r = parseRoute(`/${lang}/d2r`);
      expect(r.view).toBe("d2r");
      expect(r.d2Section).toBe("home");
      expect(routePath(r)).toBe(`/${lang}/d2r`);
    }
  });

  it("una pestaña que todavía no existe cae en la portada", () => {
    expect(routePath(parseRoute("/es/d2r/no-existe"))).toBe("/es/d2r");
  });

  it("pestañas y fichas de la wiki", () => {
    const r = parseRoute("/es/d2r/runewords/enigma");
    expect(r.d2Section).toBe("runewords");
    expect(r.detail).toBe("enigma");
    expect(routePath(r)).toBe("/es/d2r/runewords/enigma");
    expect(routePath(parseRoute("/en/d2r/planner"))).toBe("/en/d2r/planner");
    // Las bases y el planificador no tienen fichas.
    expect(parseRoute("/es/d2r/bases/monarch").detail).toBeUndefined();
  });
});

describe("Diablo II en el sitemap y el prerender", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    d2: d2meta,
    dates: { d2r: d2meta.extractedAt },
  } as unknown as SitemapData;

  it("la portada entra, en su grupo y con la fecha de sus datos", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/d2r");
    expect(paths).toContain("/en/d2r");
    expect(sitemapLastmod("/es/d2r", data)).toBe(d2meta.extractedAt.slice(0, 10));
    expect(sitemapXml(data, "d2r")).toContain("https://vestigo.gg/es/d2r");
    expect(sitemapXml(data, "site")).not.toContain("/d2r");
  });

  it("sin el extractor corrido, Diablo II queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, d2: undefined })).not.toContain("/es/d2r");
  });

  it("título y descripción propios, con lo que se busca", () => {
    const es = metaFor(parseRoute("/es/d2r"), "es", null);
    const en = metaFor(parseRoute("/en/d2r"), "en", null);
    expect(es.title).toMatch(/palabras rúnicas/i);
    expect(en.title).toMatch(/runewords/i);
    const page = prerenderPages(data).find((p) => p.path === "/es/d2r");
    expect(page?.canonical).toBe("https://vestigo.gg/es/d2r");
  });
});

describe("los datos que saca el extractor", () => {
  it("las 33 runas en orden, con nombre en los dos idiomas y sin la marca de género del juego", () => {
    expect(home.runes).toHaveLength(33);
    expect(home.runes[0].id).toBe("el");
    expect(home.runes[32].id).toBe("zod");
    for (const r of home.runes) {
      expect(r.name.en).toMatch(/Rune$/);
      expect(r.name.es).toMatch(/^Runa /);
      for (const rw of r.runewords) expect(rw.es).not.toMatch(/^\[/);
    }
  });

  it("las ocho clases, con el Conjurador en español de Latinoamérica", () => {
    expect(home.classes.map((c) => c.id)).toEqual(["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress", "warlock"]);
    expect(home.classes.at(-1)?.name.es).toBe("Conjurador");
  });

  it("las cifras de meta.json son las de home.json (la portada del sitio lee meta.json)", () => {
    expect(d2meta.counts).toEqual(home.counts);
    expect(home.counts.runes).toBe(home.runes.length);
  });

  it("cada imagen que pide la portada existe en public/d2r", () => {
    const src = readFileSync(new URL("../src/d2r/D2rHome.tsx", import.meta.url), "utf-8");
    const fixed = [...src.matchAll(/gameImg\("([^"$`]+)"/g)].map((m) => m[1]);
    const icons = [...src.matchAll(/"((?:rune|item|quest|event|class)\/[a-z0-9-]+)"/g)].map((m) => m[1]);
    const runes = home.runes.map((r) => `rune/${r.id}`);
    const classes = home.classes.map((c) => `class/${c.id}`);
    const dir = new URL("../public/d2r/game/", import.meta.url);
    for (const p of [...fixed, ...icons, ...runes, ...classes]) {
      const file = new URL(p + (p === "logo" ? ".avif" : ".webp"), dir);
      expect(() => readFileSync(file), p).not.toThrow();
    }
  });
});

import dropsIndex from "../../games/d2r/data/drops/index.json";

describe("la calculadora de drops en las direcciones, el sitemap y el prerender", () => {
  it("la pestaña y la ficha de cada jefe", () => {
    expect(routePath(parseRoute("/es/d2r/drops"))).toBe("/es/d2r/drops");
    const r = parseRoute("/en/d2r/drops/mephisto");
    expect(r.d2Section).toBe("drops");
    expect(r.detail).toBe("mephisto");
  });

  it("entran al sitemap y cada ficha tiene título con lo que se busca", () => {
    const withDrops = {
      dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
      d2: { ...d2meta, index: dropsIndex },
      dates: { d2r: d2meta.extractedAt },
    } as unknown as SitemapData;
    const paths = sitemapPaths(withDrops);
    expect(paths).toContain("/es/d2r/drops");
    expect(paths).toContain("/en/d2r/drops/mephisto");
    expect(metaFor(parseRoute("/es/d2r/drops/mephisto"), "es", "Mefisto").title).toMatch(/^Qué suelta Mefisto/);
    expect(metaFor(parseRoute("/en/d2r/drops"), "en", null).title).toMatch(/Drop Calculator/);
  });
});

// Lo que rodea a la pestaña (Task 11): lo que se repite en varios archivos tiene que coincidir, el índice de
// fichas, el sitemap y el prerender.
import { D2R_TAB_FILES } from "../src/areaFiles";
import { D2R_LIVE, D2R_TABS } from "../src/d2rCopy";
import { loadD2Index, peekD2Index } from "../src/d2r/index";
import wikiIndex from "../../games/d2r/data/wiki/index.json";
import { D2R_SECTIONS } from "../src/route";

describe("la calculadora de drops: lo que tiene que coincidir entre archivos", () => {
  it("las pestañas de la barra (d2rCopy) son las direcciones de la sección (route), en el mismo orden", () => {
    expect(D2R_TABS.filter((t) => t !== "home")).toEqual(D2R_SECTIONS);
    expect(D2R_LIVE).toContain("drops");
  });

  it("D2R_TAB_FILES nombra el mismo archivo que TABS en D2r.tsx: si no, el HTML prerenderizado de la pestaña sale sin su JS ni su CSS", () => {
    const src = readFileSync(new URL("../src/D2r.tsx", import.meta.url), "utf-8");
    const lazies = new Map([...src.matchAll(/const (\w+) = lazyWithPreload\(\(\) => import\("\.\/([\w/]+)"\)\);/g)].map((m) => [m[1], m[2]]));
    const tabs = src.slice(src.indexOf("const TABS"), src.indexOf("};", src.indexOf("const TABS")));
    const bySection = Object.fromEntries([...tabs.matchAll(/^\s+"?([\w-]+)"?: (\w+),$/gm)].filter((m) => lazies.has(m[2])).map((m) => [m[1], lazies.get(m[2])]));
    const files = Object.fromEntries(Object.entries(D2R_TAB_FILES).map(([s, f]) => [s, f!.replace(/^src\//, "").replace(/\.tsx?$/, "")]));
    expect(Object.keys(bySection).sort()).toEqual([...D2R_SECTIONS].sort());
    expect(files).toEqual(bySection);
  });

  it("el índice de fichas junta la wiki y los jefes: el <head> de una ficha al navegar lo usa", async () => {
    const index = await loadD2Index();
    expect(index).toHaveLength(wikiIndex.length + dropsIndex.length);
    expect(index.some((e) => e.sec === "runewords" && e.id === "enigma")).toBe(true);
    expect(index.find((e) => e.sec === "drops" && e.id === "mephisto")).toMatchObject({ en: "Mephisto", es: "Mefisto" });
    expect(peekD2Index()).toBe(index);
  });
});

describe("la calculadora de drops en el sitemap y el prerender", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    d2: { ...d2meta, index: dropsIndex },
    dates: { d2r: d2meta.extractedAt },
  } as unknown as SitemapData;
  const pages = prerenderPages(data);
  const page = (path: string) => pages.find((p) => p.path === path)!;
  const types = (p: { jsonLd: object[] }) => p.jsonLd.map((j) => (j as { "@type": string })["@type"]);

  it("la pestaña y una ficha por jefe y por idioma, en el sitemap de Diablo II y con la fecha de sus datos", () => {
    const xml = sitemapXml(data, "d2r");
    expect(xml).toContain("<loc>https://vestigo.gg/es/d2r/drops</loc>");
    expect(xml).toContain("<loc>https://vestigo.gg/en/d2r/drops/mephisto</loc>");
    expect(sitemapXml(data, "site")).not.toContain("/drops");
    expect(sitemapPaths(data).filter((p) => p.includes("/d2r/drops/"))).toHaveLength(dropsIndex.length * 2);
    expect(sitemapLastmod("/es/d2r/drops", data)).toBe(d2meta.extractedAt.slice(0, 10));
    expect(sitemapLastmod("/es/d2r/drops/mephisto", data)).toBe(d2meta.extractedAt.slice(0, 10));
  });

  it("la pestaña lleva las migas y es una aplicación web gratuita; la ficha de un jefe, sólo las migas", () => {
    expect(page("/es/d2r/drops").title).toMatch(/^Calculadora de drops/);
    expect(types(page("/es/d2r/drops"))).toEqual(["BreadcrumbList", "WebApplication"]);
    expect(types(page("/es/d2r/drops/mephisto"))).toEqual(["BreadcrumbList"]);
    expect(JSON.stringify(page("/es/d2r/drops/mephisto").jsonLd)).toContain('"name":"Mefisto"');
  });

  it("cada jefe del índice tiene su página, con su nombre en el título, en los dos idiomas", () => {
    for (const e of dropsIndex) {
      expect(page(`/en/d2r/drops/${e.id}`)?.title, e.id).toContain(e.en);
      expect(page(`/es/d2r/drops/${e.id}`)?.title, e.id).toContain(e.es);
    }
  });

  it("la aplicación web se llama como la herramienta, no como la etiqueta corta de la pestaña", () => {
    const app = (path: string) => (page(path).jsonLd as { "@type": string; name?: string }[]).find((j) => j["@type"] === "WebApplication");
    expect(app("/es/d2r/drops")?.name).toBe("Calculadora de drops");
    expect(app("/en/d2r/drops")?.name).toBe("Drop calculator");
  });
});

// Si uno de los dos archivos del índice no llega (un corte de red, un archivo viejo después de publicar), el otro tiene que
// seguir dando sus nombres. Cada caso pide el módulo de cero (`resetModules`) porque el índice guarda lo que cargó.
import { vi } from "vitest";

describe("el índice de fichas cuando un archivo no llega", () => {
  const cargarSin = async (...rotos: string[]) => {
    vi.resetModules();
    for (const r of rotos) {
      vi.doMock(`@d2r/${r}/index.json`, () => {
        throw new Error(`no llegó ${r}`);
      });
    }
    try {
      return await (await import("../src/d2r/index")).loadD2Index();
    } finally {
      for (const r of rotos) vi.doUnmock(`@d2r/${r}/index.json`);
      vi.resetModules();
    }
  };

  it("sin las fichas de los jefes, la wiki sigue dando sus nombres", async () => {
    const index = await cargarSin("drops");
    expect(index).toHaveLength(wikiIndex.length);
    expect(index.some((e) => e.sec === "runewords" && e.id === "enigma")).toBe(true);
  });

  it("sin la wiki, los jefes siguen dando sus nombres", async () => {
    const index = await cargarSin("wiki");
    expect(index).toHaveLength(dropsIndex.length);
    expect(index.find((e) => e.sec === "drops" && e.id === "mephisto")).toMatchObject({ es: "Mefisto" });
  });

  it("si no llega ninguno se rechaza, como antes: el <head> se queda con el título de la pestaña", async () => {
    // Vitest envuelve el error de la simulación en el suyo; alcanza con que la promesa se rechace.
    await expect(cargarSin("wiki", "drops")).rejects.toThrow();
  });
});
