import { describe, it, expect } from "vitest";
import { parseRoute, routePath, routeUrl, slugify, type Route } from "../src/route";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Basic Magazine")).toBe("basic-magazine");
    expect(slugify("Gargoyle Stoneplate")).toBe("gargoyle-stoneplate");
  });

  it("drops apostrophes instead of turning them into hyphens", () => {
    expect(slugify("Guinsoo's Rageblade")).toBe("guinsoos-rageblade");
    expect(slugify("Warmog's Armor")).toBe("warmogs-armor");
  });

  it("strips accents, so one name never becomes two pages", () => {
    expect(slugify("Gólem")).toBe("golem");
    expect(slugify("Bardo")).toBe(slugify("Bardo"));
    expect(slugify("Aurelion Sol")).toBe("aurelion-sol");
  });

  it("collapses the punctuation in names that carry it", () => {
    expect(slugify("Nunu & Willump")).toBe("nunu-willump");
    expect(slugify("N.O.V.A.")).toBe("nova");
  });
});

describe("parseRoute", () => {
  it("reads the language from the front of the path", () => {
    expect(parseRoute("/es/deadlock/items").lang).toBe("es");
    expect(parseRoute("/en/deadlock/items").lang).toBe("en");
  });

  it("defaults to English, the site's default language", () => {
    expect(parseRoute("/").lang).toBe("en");
    expect(parseRoute("").lang).toBe("en");
  });

  it("reads views and sections", () => {
    expect(parseRoute("/en")).toEqual({ lang: "en", view: "home", section: "meta", dlSection: "meta" });
    expect(parseRoute("/es/deadlock")).toMatchObject({ lang: "es", view: "deadlock" });
    expect(parseRoute("/en/privacy")).toMatchObject({ view: "privacy" });
  });

  /**
   * Las pestañas de Deadlock. El meta se queda con `/deadlock` a secas: es la
   * URL que ya está indexada, y agregarle `/meta` partiría el posicionamiento
   * entre dos direcciones de la misma página.
   */
  it("lee las pestañas de Deadlock", () => {
    expect(parseRoute("/es/deadlock")).toMatchObject({ view: "deadlock", dlSection: "meta" });
    expect(parseRoute("/es/deadlock/items")).toMatchObject({
      view: "deadlock",
      dlSection: "items",
    });
    expect(parseRoute("/es/deadlock/patches")).toMatchObject({
      view: "deadlock",
      dlSection: "patches",
    });
  });

  it("una pestaña de Deadlock que no existe cae en el meta, no en una página en blanco", () => {
    expect(parseRoute("/en/deadlock/nada")).toMatchObject({ view: "deadlock", dlSection: "meta" });
  });

  it("shows the site rather than nothing when the path is nonsense", () => {
    expect(parseRoute("/en/wat")).toMatchObject({ view: "home" });
    expect(parseRoute("/zz/deadlock")).toMatchObject({ lang: "en", view: "home" });
  });
});

/**
 * TFT salió del sitio el 2026-09-15 (ver `route.ts`). Sus direcciones estaban
 * indexadas y compartidas, así que siguen llegando; en producción las contesta
 * `netlify.toml` con 301, y en el navegador —un link viejo dentro de la app, o
 * un `vite preview`— tienen que caer en la portada del idioma que nombran, no
 * en la vista de TFT ni en una página vacía.
 */
describe("las direcciones de TFT ya no llevan a TFT", () => {
  it("caen en la portada, con el idioma de la URL", () => {
    expect(parseRoute("/en/tft/units/jinx")).toMatchObject({ lang: "en", view: "home" });
    expect(parseRoute("/es/tft/meta")).toMatchObject({ lang: "es", view: "home" });
    expect(parseRoute("/es/tft/meta/platinum-gold/sorcerer-zoe")).toMatchObject({
      lang: "es",
      view: "home",
    });
  });

  it("también las de antes de que el idioma fuera parte de la URL", () => {
    expect(parseRoute("/tft/items")).toMatchObject({ lang: "en", view: "home" });
    expect(parseRoute("/tft")).toMatchObject({ lang: "en", view: "home" });
  });

  it("no dejan un detalle ni una banda colgando en la ruta", () => {
    const r = parseRoute("/en/tft/meta/apex");
    expect(r.detail).toBeUndefined();
    expect(r.band).toBeUndefined();
    expect(routePath(r)).toBe("/en");
  });
});

describe("routePath", () => {
  const cases: [Route, string][] = [
    [{ lang: "en", view: "home", section: "meta", dlSection: "meta" }, "/en"],
    [{ lang: "es", view: "home", section: "meta", dlSection: "meta" }, "/es"],
    [{ lang: "en", view: "deadlock", section: "meta", dlSection: "meta" }, "/en/deadlock"],
    [
      { lang: "en", view: "deadlock", section: "meta", dlSection: "items" },
      "/en/deadlock/items",
    ],
    [
      { lang: "es", view: "deadlock", section: "meta", dlSection: "items" },
      "/es/deadlock/items",
    ],
    [
      { lang: "en", view: "deadlock", section: "meta", dlSection: "patches" },
      "/en/deadlock/patches",
    ],
    [{ lang: "en", view: "terms", section: "meta", dlSection: "meta" }, "/en/terms"],
    [{ lang: "en", view: "privacy", section: "meta", dlSection: "meta" }, "/en/privacy"],
  ];

  it.each(cases)("builds %o", (route, expected) => {
    expect(routePath(route)).toBe(expected);
  });

  it("round-trips through parseRoute", () => {
    for (const [route] of cases) {
      expect(parseRoute(routePath(route))).toMatchObject({
        lang: route.lang,
        view: route.view,
      });
    }
  });
});

describe("routeUrl", () => {
  it("builds the absolute URL canonical and hreflang need", () => {
    expect(routeUrl({ lang: "es", view: "deadlock", section: "meta", dlSection: "items" })).toBe(
      "https://vestigo.gg/es/deadlock/items"
    );
  });
});

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

  it("ranks no tiene detalle, aunque la URL traiga un segmento de más", () => {
    expect(routePath(parseRoute("/en/deadlock/ranks/algo"))).toBe("/en/deadlock/ranks");
  });

  it("patches lleva la fecha de una edición de Vestigo News", () => {
    const r = parseRoute("/es/deadlock/patches/2026-09-16");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "patches", detail: "2026-09-16" });
    expect(routePath(r)).toBe("/es/deadlock/patches/2026-09-16");
    expect(routePath(parseRoute("/en/deadlock/patches"))).toBe("/en/deadlock/patches");
  });

  it("existe en español también", () => {
    expect(routePath(parseRoute("/es/deadlock/infernus"))).toBe("/es/deadlock/infernus");
    expect(routePath(parseRoute("/es/deadlock/items/basic-magazine"))).toBe(
      "/es/deadlock/items/basic-magazine"
    );
  });
});

describe("Path of Exile 2", () => {
  it("/poe2 es la Economía, sin el nombre de la pestaña en la URL", () => {
    const r = parseRoute("/es/poe2");
    expect(r.view).toBe("poe2");
    expect(r.p2Section).toBe("economy");
    expect(routePath(r)).toBe("/es/poe2");
  });

  it("una pestaña desconocida cae en Economía en vez de dar una página vacía", () => {
    const r = parseRoute("/en/poe2/nada");
    expect(r.view).toBe("poe2");
    expect(r.p2Section).toBe("economy");
    expect(routePath(r)).toBe("/en/poe2");
  });

  it("cambiar de idioma conserva la página", () => {
    expect(routePath({ ...parseRoute("/es/poe2"), lang: "en" })).toBe("/en/poe2");
  });

  it("la liga de la Economía va en la URL y sobrevive al cambio de idioma", () => {
    const r = parseRoute("/es/poe2/economy/hc-forbidden-rites");
    expect(r.p2Section).toBe("economy");
    expect(r.detail).toBe("hc-forbidden-rites");
    expect(routePath(r)).toBe("/es/poe2/economy/hc-forbidden-rites");
    expect(routePath({ ...r, lang: "en" })).toBe("/en/poe2/economy/hc-forbidden-rites");
  });

  it("la enciclopedia lleva categoría y ficha; parches, la edición", () => {
    const r = parseRoute("/es/poe2/encyclopedia/gems/untether");
    expect(r.p2Section).toBe("encyclopedia");
    expect(r.detail).toBe("gems/untether");
    expect(routePath(r)).toBe("/es/poe2/encyclopedia/gems/untether");
    expect(parseRoute("/es/poe2/encyclopedia/gems").detail).toBe("gems");
    expect(routePath(parseRoute("/en/poe2/encyclopedia"))).toBe("/en/poe2/encyclopedia");
    const p = parseRoute("/es/poe2/patches/0-5-5c/sobra");
    expect(p.detail).toBe("0-5-5c");
    expect(routePath(p)).toBe("/es/poe2/patches/0-5-5c");
  });

  it("una pestaña desconocida no se lleva lo que viene después como liga", () => {
    const r = parseRoute("/es/poe2/nada/standard");
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/es/poe2");
  });
});
