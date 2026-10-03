import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pzMeta from "../../games/zomboid/data/meta.json";
import pzIndex from "../../games/zomboid/data/index.json";
import { buildEsSlugs } from "../src/esSlugs";
import { parseRoute, PZ_DETAILS_PENDING, PZ_PUBLISHED, PZ_SECTION_ES, registerPzSlugs, routeUrl, type PzTab } from "../src/route";
import { sitemapIndexXml, sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { jsonLdFor, metaFor, prerenderPages } from "../src/prerender";
import { PZ_TABS, tidyTitleName, ZOMBOID_COPY } from "../src/zomboidCopy";

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt },
  dates: { zomboid: pzMeta.extractedAt },
} as unknown as SitemapData;

/** Corre `fn` con la pestaña dada por publicada, y la saca al terminar sólo si la puso este test. */
function withPublished(tab: PzTab, fn: () => void): void {
  const added = !PZ_PUBLISHED.includes(tab);
  if (added) PZ_PUBLISHED.push(tab);
  try {
    fn();
  } finally {
    if (added) PZ_PUBLISHED.splice(PZ_PUBLISHED.indexOf(tab), 1);
  }
}

describe("Project Zomboid en el sitemap y el <head>", () => {
  it("la portada entra en su grupo, con la fecha de sus datos", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/project-zomboid");
    expect(paths).toContain("/es/project-zomboid");
    expect(sitemapXml(data, "zomboid")).toContain("<loc>https://vestigo.gg/es/project-zomboid</loc>");
    expect(sitemapXml(data, "site")).not.toContain("project-zomboid");
    expect(sitemapLastmod("/es/project-zomboid", data)).toBe(pzMeta.extractedAt.slice(0, 10));
    // Y el índice de /sitemap.xml apunta a su sitemap.
    expect(sitemapIndexXml(data)).toContain("<loc>https://vestigo.gg/sitemaps/zomboid.xml</loc>");
  });

  it("las pestañas que todavía no se publicaron no entran", () => {
    // La pestaña de cada dirección se lee con `parseRoute`, que entiende los dos idiomas y manda una sin publicar a la
    // portada: si alguna se colara en el sitemap, su `pzSection` sería "home" y no estaría en `PZ_PUBLISHED`.
    const tabPaths = sitemapPaths(data).filter((p) => /^\/(en|es)\/project-zomboid\/./.test(p));
    for (const p of tabPaths) expect(PZ_PUBLISHED, p).toContain(parseRoute(p).pzSection);
  });

  it("sin el extractor corrido, Zomboid queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, zb: undefined })).not.toContain("/en/project-zomboid");
  });

  it("el título empieza por lo que se busca, en cada idioma", () => {
    expect(metaFor(parseRoute("/en/project-zomboid"), "en", null).title).toMatch(/^Project Zomboid Map/);
    expect(metaFor(parseRoute("/es/project-zomboid"), "es", null).title).toMatch(/^Project Zomboid en español/);
    // El Mapa se publicó el 2026-09-30 (una sin publicar muestra la portada): si algún día sale de `PZ_PUBLISHED`, se la
    // da por publicada para probar su título igual.
    withPublished("map", () => {
      expect(metaFor(parseRoute("/es/project-zomboid/mapa"), "es", null).title).toMatch(/^Mapa de Project Zomboid/);
      expect(metaFor(parseRoute("/en/project-zomboid/map"), "en", null).title).toMatch(/^Project Zomboid Map/);
    });
  });

  it("el Mapa publicado entra al sitemap de Zomboid, en los dos idiomas", () => {
    withPublished("map", () => {
      const paths = sitemapPaths(data);
      expect(paths).toContain("/en/project-zomboid/map");
      expect(paths).toContain("/es/project-zomboid/mapa");
    });
  });

  /**
   * La primera pestaña que todavía no tiene página. No es una fija: se fueron publicando (el Mapa era la de este test
   * hasta el 2026-09-30), y con esto el test sigue probando lo mismo con la que venga. Si ya están todas, se saltea.
   */
  const soon = PZ_TABS.find((t): t is PzTab => t !== "home" && !PZ_PUBLISHED.includes(t));
  it.skipIf(!soon)("una pestaña sin publicar lleva el título y el canonical de la portada, no los suyos", () => {
    const r = parseRoute(`/es/project-zomboid/${PZ_SECTION_ES[soon!]}`);
    expect(metaFor(r, "es", null).title).toMatch(/^Project Zomboid en español/);
    expect(routeUrl(r)).toBe("https://vestigo.gg/es/project-zomboid");
  });

  it("la página prerenderizada tiene canonical, hreflang y el idioma", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/project-zomboid")!;
    expect(page.canonical).toBe("https://vestigo.gg/es/project-zomboid");
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/project-zomboid" });
    expect(page.lang).toBe("es");
  });
});

/**
 * Las fichas (2026-09-30): cada pestaña publicada con fichas suma una dirección por ficha del índice, con su `<head>` y
 * su miga. Objetos se publicó el 2026-09-30; si algún día sale de `PZ_PUBLISHED`, el test la da por publicada igual y
 * la saca al terminar, pase lo que pase.
 */
describe("las fichas de Project Zomboid en el sitemap y el <head>", () => {
  const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
  const withIndex = { ...data, zb: { ...data.zb!, index: INDEX } } as SitemapData;
  let added = false;
  beforeAll(() => {
    // Lo mismo que hace el build en `readSitemapData`: los slugs en español, antes de armar ninguna dirección.
    registerPzSlugs(buildEsSlugs(INDEX, []));
    added = !PZ_PUBLISHED.includes("items");
    if (added) PZ_PUBLISHED.push("items");
  });
  afterAll(() => {
    if (added) PZ_PUBLISHED.splice(PZ_PUBLISHED.indexOf("items"), 1);
  });

  it("cada ficha de una pestaña publicada entra al sitemap de Zomboid, en los dos idiomas y emparejadas", () => {
    const paths = sitemapPaths(withIndex);
    expect(paths).toContain("/en/project-zomboid/items/crowbar");
    expect(paths).toContain("/es/project-zomboid/objetos/palanca");
    const xml = sitemapXml(withIndex, "zomboid");
    expect(xml).toContain("<loc>https://vestigo.gg/en/project-zomboid/items/crowbar</loc>");
    expect(xml).toContain("<loc>https://vestigo.gg/es/project-zomboid/objetos/palanca</loc>");
    expect(sitemapXml(withIndex, "site")).not.toContain("project-zomboid");
    // Las dos versiones de la palanca se nombran entre sí: son la misma página en dos idiomas.
    const palanca = xml.split("</url>").find((u) => u.includes("<loc>https://vestigo.gg/es/project-zomboid/objetos/palanca</loc>"))!;
    expect(palanca).toContain('hreflang="en" href="https://vestigo.gg/en/project-zomboid/items/crowbar"');
    expect(sitemapLastmod("/es/project-zomboid/objetos/palanca", withIndex)).toBe(pzMeta.extractedAt.slice(0, 10));
  });

  it("las fichas de las pestañas sin publicar no entran", () => {
    // Con Habilidades (2026-09-30) todas las secciones con fichas en el índice tienen pestaña publicada: para probar que
    // el sitemap deja afuera las que no, se saca una un momento de PZ_PUBLISHED.
    // Por qué así: sitemapPaths lee PZ_PUBLISHED, el array de route.ts (no recibe la lista por parámetro), y sin ninguna
    // sección sin publicar esta prueba pasaría sin probar nada. Se saca "skills" porque es la última que se publicó, pero
    // cualquiera serviría. El `finally` la devuelve a su lugar aunque algo falle, y las pruebas de un archivo corren en
    // serie: ninguna otra la ve faltar. Si algún día el sitemap recibe la lista, esto pasa a ser darle una con un hueco.
    const at = PZ_PUBLISHED.indexOf("skills");
    expect(at).toBeGreaterThanOrEqual(0);
    PZ_PUBLISHED.splice(at, 1);
    try {
      const details = sitemapPaths(withIndex).filter((p) => p.split("/").length > 4);
      // Sin las fichas que todavía no tienen página propia (las del Servidor hasta las Tasks 4 y 5).
      const pending = (e: (typeof INDEX)[number]) => !!PZ_DETAILS_PENDING[e.sec]?.includes(e.id);
      expect(details.length).toBe(2 * INDEX.filter((e) => PZ_PUBLISHED.includes(e.sec) && !pending(e)).length);
      for (const p of details) expect(PZ_PUBLISHED, p).toContain(parseRoute(p).pzSection);
      expect(INDEX.some((e) => !PZ_PUBLISHED.includes(e.sec))).toBe(true);
      expect(details.some((p) => /\/(skills|habilidades)\//.test(p))).toBe(false);
    } finally {
      PZ_PUBLISHED.splice(at, 0, "skills");
    }
  });

  it("la ficha prerenderizada lleva su título, su canonical y el hreflang a la del otro idioma", () => {
    const page = prerenderPages(withIndex).find((p) => p.path === "/es/project-zomboid/objetos/palanca")!;
    expect(page.title).toMatch(/^Palanca/);
    expect(page.canonical).toBe("https://vestigo.gg/es/project-zomboid/objetos/palanca");
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/project-zomboid/items/crowbar" });
    const en = prerenderPages(withIndex).find((p) => p.path === "/en/project-zomboid/items/crowbar")!;
    expect(en.title).toMatch(/^Crowbar/);
  });

  it("su JSON-LD tiene la miga con el nombre de la ficha", () => {
    const page = prerenderPages(withIndex).find((p) => p.path === "/es/project-zomboid/objetos/palanca")!;
    const crumbs = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as {
      itemListElement: { name: string; item: string }[];
    };
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual(["Vestigo", "Project Zomboid", "Objetos", "Palanca"]);
    expect(crumbs.itemListElement.at(-1)!.item).toBe("https://vestigo.gg/es/project-zomboid/objetos/palanca");
  });

  // Los seis rasgos gemelos tienen el mismo nombre y la misma descripción en el juego: el <head> del de profesión dice
  // de qué profesión viene, así Google no ve dos páginas iguales.
  it("el rasgo de profesión que tiene un gemelo que se elige lleva otro <head>, con sus profesiones", () => {
    withPublished("traits", () => {
      const pages = prerenderPages(withIndex);
      const page = (end: string, lang: "en" | "es") => pages.find((p) => p.path.startsWith(`/${lang}/`) && p.path.endsWith(end))!;
      for (const lang of ["en", "es"] as const) {
        const pick = page("-blacksmith", lang);
        const prof = page("-blacksmith2", lang);
        expect(prof.title, lang).not.toBe(pick.title);
        expect(prof.description, lang).not.toBe(pick.description);
        expect(prof.description, lang).toContain(lang === "es" ? "la profesión Herrero" : "the Blacksmith profession");
        const cook = page("-cook2", lang);
        expect(cook.description, lang).toContain(lang === "es" ? "las profesiones Aprendiz de cocina y Cocinero" : "the Burger Flipper and Chef professions");
      }
    });
  });

  // Handy y Tinkerer son "Manitas" los dos en el juego y no son gemelos (otro rasgo, otro costo): en español el <head>
  // lleva el inglés entre paréntesis, así no son dos páginas con el mismo título. En inglés ya se distinguen.
  it("dos fichas que el juego llama igual en español llevan el inglés en el <head> en español", () => {
    withPublished("traits", () => {
      const pages = prerenderPages(withIndex);
      const handy = pages.find((p) => p.path === "/es/project-zomboid/rasgos/manitas-handy")!;
      const tinkerer = pages.find((p) => p.path === "/es/project-zomboid/rasgos/manitas-tinkerer")!;
      expect(handy.title).toMatch(/^Manitas \(Handy\)/);
      expect(tinkerer.title).toMatch(/^Manitas \(Tinkerer\)/);
      expect(handy.description).not.toBe(tinkerer.description);
      expect(pages.find((p) => p.path === "/en/project-zomboid/traits/handy")!.title).toMatch(/^Handy/);
      // Una que no comparte nombre queda como está.
      expect(pages.find((p) => p.path === "/es/project-zomboid/objetos/palanca")!.title).toMatch(/^Palanca /);
    });
  });

  it("una sección con fichas y sin pestaña propia (profesiones) también toma su plantilla si se publica", () => {
    withPublished("professions", () => {
      const r = parseRoute("/en/project-zomboid/professions/carpenter");
      expect(r).toMatchObject({ pzSection: "professions", detail: "carpenter" });
      expect(metaFor(r, "en", "Carpenter").title).toMatch(/^Carpenter/);
    });
  });
});

describe("las plantillas del <head> de cada ficha", () => {
  const SECS: PzTab[] = ["items", "recipes", "traits", "professions", "skills", "moodles"];
  // Un nombre largo pero real (hay objetos más largos: ahí Google corta, pero lo que se busca va adelante).
  const NAME = "x".repeat(20);

  it("cada sección con fichas tiene la suya, en los dos idiomas, que empieza por el nombre y entra en 65 caracteres", () => {
    for (const lang of ["en", "es"] as const) {
      for (const sec of SECS) {
        const make = ZOMBOID_COPY[lang].seo.detail[sec];
        expect(make, `${lang} ${sec}`).toBeTypeOf("function");
        const { title, description } = make!(NAME);
        expect(title.startsWith(NAME), `${lang} ${sec}: ${title}`).toBe(true);
        expect(title, `${lang} ${sec}`).toMatch(/\| Vestigo$/);
        expect(title.length, `${lang} ${sec}: ${title}`).toBeLessThanOrEqual(65);
        expect(description, `${lang} ${sec}`).toContain(NAME);
        expect(description.length, `${lang} ${sec}`).toBeGreaterThan(80);
      }
    }
  });

  // Los libros de habilidad van entre comillas y las traducciones a veces dejan un espacio pegado a la comilla por dentro
  // ("Puntería IV: " Tácticas de francotirador""): en el título queda un hueco de más, o dos espacios seguidos.
  it("el nombre de una ficha con comillas no deja espacios de más en el título, la descripción ni la miga", () => {
    expect(tidyTitleName('Puntería IV: " Tácticas de francotirador"')).toBe('Puntería IV: "Tácticas de francotirador"');
    expect(tidyTitleName('Agricultura IV: "La genética y la tierra "')).toBe('Agricultura IV: "La genética y la tierra"');
    expect(tidyTitleName('Skirt -  "Garbage  Bag" ')).toBe('Skirt - "Garbage Bag"');
    // Con espacios duros y comillas tipográficas (“ ”, U+201C y U+201D).
    const nb = String.fromCharCode(160, 160), open = String.fromCharCode(0x201c), close = String.fromCharCode(0x201d);
    expect(tidyTitleName(`Aiming I:${nb}${open} Better Aiming ${close}`)).toBe(`Aiming I: ${open}Better Aiming${close}`);
    // Un nombre sano queda igual, con su apóstrofo y sus comillas.
    expect(tidyTitleName(`Agriculture III: "Liam Keating's Subsistence Farming"`)).toBe(`Agriculture III: "Liam Keating's Subsistence Farming"`);
    // Comillas sin cerrar: no se toca lo de adentro.
    expect(tidyTitleName('Bag " of holding')).toBe('Bag " of holding');

    withPublished("items", () => {
      const r = parseRoute("/es/project-zomboid/objetos");
      const route = { ...r, detail: "punteria-iv-tacticas-de-francotirador" };
      const { title, description } = metaFor(route, "es", 'Puntería IV: " Tácticas de francotirador"');
      expect(title.startsWith('Puntería IV: "Tácticas de francotirador" en Project Zomboid')).toBe(true);
      expect(description).toContain('Puntería IV: "Tácticas de francotirador" en Project Zomboid');
      const [crumbs] = jsonLdFor(route, "es", { title, description, canonical: routeUrl(route), image: "" }, data, 'Puntería IV: " Tácticas de francotirador"') as { itemListElement: { name: string }[] }[];
      expect(crumbs.itemListElement.at(-1)!.name).toBe('Puntería IV: "Tácticas de francotirador"');
    });
  });

  it("ningún título ni descripción de las 5.000 fichas del índice tiene dos espacios seguidos ni espacios dentro de las comillas", () => {
    for (const lang of ["en", "es"] as const) {
      const detail = ZOMBOID_COPY[lang].seo.detail;
      for (const e of pzIndex as { sec: PzTab; id: string; en: string; es: string }[]) {
        const make = detail[e.sec];
        if (!make) continue;
        const { title, description } = make(tidyTitleName(e[lang] || e.en));
        for (const text of [title, description]) {
          expect(text, `${lang} ${e.sec}/${e.id}`).not.toMatch(/\s{2,}/);
          for (const [, inner] of text.matchAll(/"([^"]*)"/g)) expect(inner, `${lang} ${e.sec}/${e.id}`).toBe(inner.trim());
        }
      }
    }
  });

  it("sin el nombre de la ficha (el índice no llegó), el <head> es el de la pestaña", () => {
    withPublished("items", () => {
      const r = parseRoute("/en/project-zomboid/items/crowbar");
      expect(metaFor(r, "en", null)).toEqual(ZOMBOID_COPY.en.seo.items);
    });
  });
});

/** Parches (2026-10-02): el título de cada versión empieza por lo que se busca y entra en 65 caracteres. */
describe("el <head> de Parches", () => {
  it("la plantilla de una versión, en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      // Un hotfix (tres números) y un build sin número nuevo, el nombre más largo que arma site.py.
      for (const v of ["42.21.1", "42.22 (build 3)"]) {
        const { title, description } = ZOMBOID_COPY[lang].seo.detail.patches!(v);
        expect(title.length, title).toBeLessThanOrEqual(65);
        expect(title, title).toMatch(/\| Vestigo$/);
        expect(title.startsWith(lang === "en" ? `Project Zomboid ${v}` : `Notas del parche ${v}`), title).toBe(true);
        expect(description.length, description).toBeGreaterThan(80);
        expect(description.length, description).toBeLessThanOrEqual(160);
      }
    }
    expect(ZOMBOID_COPY.es.seo.patches.title).toBe("Notas del parche de Project Zomboid (Build 42) | Vestigo");
    expect(ZOMBOID_COPY.en.seo.patches.title).toBe("Project Zomboid Patch Notes Explained (Build 42) | Vestigo");
  });

  it("el prerender de una versión: su título y su miga", () => {
    const withPatches = { ...data, zb: { ...data.zb!, patches: [{ slug: "42-21", version: "42.21", date: "2026-09-28", updated: "2026-10-02" }] } } as SitemapData;
    withPublished("patches", () => {
      const page = prerenderPages(withPatches).find((p) => p.path === "/es/project-zomboid/parches/42-21")!;
      expect(page.title).toBe("Notas del parche 42.21 de Project Zomboid: qué cambió | Vestigo");
      const crumbs = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] };
      expect(crumbs.itemListElement.map((c) => c.name)).toEqual(["Vestigo", "Project Zomboid", "Parches", "42.21"]);
    });
  });
});
