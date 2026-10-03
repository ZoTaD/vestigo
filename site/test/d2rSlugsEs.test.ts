import { describe, expect, it } from "vitest";
import wikiIndex from "@d2r/wiki/index.json";
import dropsIndex from "@d2r/drops/index.json";
import patches from "@d2r/patches/index.json";
import d2meta from "@d2r/meta.json";
import { buildD2rEsSlugs } from "../src/d2r/slugs";
import { D2R_SECTION_ES, D2R_SECTIONS, parseRoute, registerD2rSlugs, routePath, type D2rTab } from "../src/route";
import { redirectsFile, sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

/**
 * Diablo II en español con la dirección en español (2026-09-30): `/es/d2r/unicos/la-rechinante` y no
 * `/es/d2r/uniques/the-gnasher`. El registro es del módulo, así que este archivo lo prende una vez para todo.
 */
const INDEX = [...wikiIndex, ...dropsIndex] as { sec: D2rTab; id: string; en: string; es: string }[];
const SLUGS = buildD2rEsSlugs(INDEX);
registerD2rSlugs(SLUGS);

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  d2: { ...d2meta, index: INDEX, patches },
  dates: { d2r: d2meta.extractedAt },
} as unknown as SitemapData;

describe("los slugs en español de las fichas", () => {
  it("salen del nombre oficial en español", () => {
    expect(SLUGS.uniques?.["the-gnasher"]).toBe("la-rechinante");
    expect(SLUGS.uniques?.["harlequin-crest"]).toBe("cresta-del-arlequin");
    expect(SLUGS.runewords?.spirit).toBe("espiritu");
    expect(SLUGS.sets?.["tal-rashas-wrappings"]).toBe("vestiduras-de-tal-rasha");
    expect(SLUGS.classes?.sorceress).toBe("hechicera");
    expect(SLUGS.drops?.mephisto).toBe("mefisto");
  });

  it("sólo guarda los que cambian: Enigma y la Paladín se llaman igual, y las runas y los parches no se traducen", () => {
    expect(SLUGS.runewords?.enigma).toBeUndefined();
    expect(SLUGS.classes?.paladin).toBeUndefined();
    expect(SLUGS.runes).toBeUndefined();
    expect(SLUGS.patches).toBeUndefined();
  });

  it("dos fichas con el mismo nombre en español llevan también el inglés", () => {
    // Wrath y Temper son las dos "Ira" en el juego.
    expect(SLUGS.runewords?.wrath).toBe("ira-wrath");
    expect(SLUGS.runewords?.temper).toBe("ira-temper");
  });

  it("cada dirección abre una sola ficha: sin repetidos y sin chocar con el slug inglés de otra", () => {
    const bySec = new Map<D2rTab, string[]>();
    for (const e of INDEX) bySec.set(e.sec, [...(bySec.get(e.sec) ?? []), e.id]);
    for (const [sec, ids] of bySec) {
      const es = ids.map((id) => SLUGS[sec]?.[id] ?? id);
      expect(new Set(es).size, sec).toBe(ids.length);
      for (const [i, slug] of es.entries()) if (slug !== ids[i]) expect(ids.includes(slug), `${sec}/${slug}`).toBe(false);
    }
  });
});

describe("las direcciones en español", () => {
  it("cada pestaña tiene su nombre en español, y en inglés no cambia nada", () => {
    for (const s of D2R_SECTIONS) {
      const r = parseRoute(`/es/d2r/${D2R_SECTION_ES[s]}`);
      expect(r.d2Section, s).toBe(s);
      expect(routePath(r)).toBe(`/es/d2r/${D2R_SECTION_ES[s]}`);
      expect(routePath({ ...r, lang: "en" })).toBe(`/en/d2r/${s}`);
    }
    expect(D2R_SECTION_ES.runewords).toBe("palabras-runicas");
    expect(D2R_SECTION_ES.uniques).toBe("unicos");
  });

  it("cada ficha va y vuelve: de la ruta a la dirección en español y de vuelta a la misma ficha", () => {
    for (const e of INDEX) {
      const es = routePath({ lang: "es", view: "d2r", dlSection: "meta", d2Section: e.sec, detail: e.id });
      const back = parseRoute(es);
      expect([back.d2Section, back.detail], es).toEqual([e.sec, e.id]);
      expect(routePath({ ...back, lang: "en" })).toBe(`/en/d2r/${e.sec}/${e.id}`);
    }
    expect(routePath(parseRoute("/es/d2r/unicos/la-rechinante"))).toBe("/es/d2r/unicos/la-rechinante");
    expect(parseRoute("/es/d2r/unicos/la-rechinante").detail).toBe("the-gnasher");
  });

  it("la dirección vieja (pestaña y ficha en inglés) abre la misma página, y la app la corrige a la nueva", () => {
    const old = parseRoute("/es/d2r/uniques/the-gnasher");
    expect([old.d2Section, old.detail]).toEqual(["uniques", "the-gnasher"]);
    expect(routePath(old)).toBe("/es/d2r/unicos/la-rechinante");
  });

  it("bajo /en, el slug inglés queda como está y uno en español también se traduce y abre su ficha", () => {
    expect(parseRoute("/en/d2r/uniques/the-gnasher").detail).toBe("the-gnasher");
    expect(routePath(parseRoute("/en/d2r/drops/mephisto"))).toBe("/en/d2r/drops/mephisto");
    // Un enlace en español compartido con el idioma cambiado a mano abre la ficha y no una rota.
    expect(parseRoute("/en/d2r/uniques/la-rechinante").detail).toBe("the-gnasher");
  });
});

describe("el sitemap, el <head> y las redirecciones", () => {
  const paths = sitemapPaths(data);
  const pages = prerenderPages(data);

  it("el sitemap lista las direcciones en español y ninguna vieja", () => {
    expect(paths).toContain("/es/d2r/palabras-runicas/enigma");
    expect(paths).toContain("/es/d2r/unicos/la-rechinante");
    expect(paths).toContain("/es/d2r/drops/mefisto");
    expect(paths).toContain("/es/d2r/parches/3-3");
    expect(paths).toContain("/en/d2r/uniques/the-gnasher");
    expect(paths).not.toContain("/es/d2r/uniques/the-gnasher");
    expect(paths.filter((p) => p.startsWith("/es/d2r")).length).toBe(paths.filter((p) => p.startsWith("/en/d2r")).length);
  });

  it("en el sitemap, cada página en español lista a su par en inglés aunque las palabras sean otras", () => {
    const xml = sitemapXml(data, "d2r");
    const entry = (loc: string) => {
      const start = xml.indexOf(`<loc>https://vestigo.gg${loc}</loc>`);
      return xml.slice(start, xml.indexOf("</url>", start));
    };
    expect(entry("/es/d2r/unicos/la-rechinante")).toContain('hreflang="en" href="https://vestigo.gg/en/d2r/uniques/the-gnasher"');
    expect(entry("/en/d2r/uniques/the-gnasher")).toContain('hreflang="es" href="https://vestigo.gg/es/d2r/unicos/la-rechinante"');
    expect(entry("/es/d2r/palabras-runicas")).toContain('hreflang="en" href="https://vestigo.gg/en/d2r/runewords"');
  });

  it("la fecha de un parche sale de su ficha, con la pestaña en español", () => {
    expect(sitemapLastmod("/es/d2r/parches/3-3", data)).toBe("2026-08-18");
    expect(sitemapLastmod("/en/d2r/patches/3-3", data)).toBe("2026-08-18");
  });

  it("cada página en español apunta a su par en inglés y al revés, con su título en español", () => {
    const es = pages.find((p) => p.path === "/es/d2r/unicos/la-rechinante")!;
    expect(es.canonical).toBe("https://vestigo.gg/es/d2r/unicos/la-rechinante");
    expect(es.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/d2r/uniques/the-gnasher" });
    expect(es.alternates).toContainEqual({ hreflang: "x-default", href: "https://vestigo.gg/en/d2r/uniques/the-gnasher" });
    expect(es.title).toContain("La rechinante");
    expect(es.lang).toBe("es");
    const en = pages.find((p) => p.path === "/en/d2r/uniques/the-gnasher")!;
    expect(en.alternates).toContainEqual({ hreflang: "es", href: "https://vestigo.gg/es/d2r/unicos/la-rechinante" });
  });

  it("cada dirección vieja manda con 301 a la nueva, y sólo esas", () => {
    const lines = redirectsFile(data).trim().split("\n");
    // La tier list de Deadlock, que hasta el 30/9 era /deadlock a secas.
    expect(lines).toContain("/en/deadlock  /en/deadlock/tier-list  301");
    expect(lines).toContain("/es/deadlock  /es/deadlock/tier-list  301");
    expect(lines).toContain("/es/d2r/runewords  /es/d2r/palabras-runicas  301");
    expect(lines).toContain("/es/d2r/runewords/enigma  /es/d2r/palabras-runicas/enigma  301");
    expect(lines).toContain("/es/d2r/uniques/the-gnasher  /es/d2r/unicos/la-rechinante  301");
    expect(lines).toContain("/es/d2r/drops/mephisto  /es/d2r/drops/mefisto  301");
    expect(lines).toContain("/es/d2r/runes/ber  /es/d2r/runas/ber  301");
    // Lo que no cambió no redirige (redirigir a sí misma sería un bucle).
    expect(lines.some((l) => l.startsWith("/es/d2r/bases "))).toBe(false);
    expect(lines.some((l) => l.startsWith("/es/d2r/drops "))).toBe(false);
    expect(lines.filter((l) => l.startsWith("/en/"))).toEqual(["/en/deadlock  /en/deadlock/tier-list  301"]);
    for (const l of lines) {
      const [from, to, code] = l.split(/\s+/);
      expect(code).toBe("301");
      expect(from).not.toBe(to);
      expect(paths, to).toContain(to);
      expect(paths, from).not.toContain(from);
    }
  });
});
