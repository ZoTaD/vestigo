import { describe, it, expect } from "vitest";
import { parseRoute, routePath, routeUrl, slugify, type Route } from "../src/route";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Miss Fortune")).toBe("miss-fortune");
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
    expect(parseRoute("/es/tft/units").lang).toBe("es");
    expect(parseRoute("/en/tft/units").lang).toBe("en");
  });

  it("defaults to English, the site's default language", () => {
    expect(parseRoute("/").lang).toBe("en");
    expect(parseRoute("").lang).toBe("en");
  });

  it("reads views and sections", () => {
    expect(parseRoute("/en")).toEqual({ lang: "en", view: "home", section: "meta", dlSection: "meta" });
    expect(parseRoute("/es/deadlock")).toMatchObject({ lang: "es", view: "deadlock" });
    expect(parseRoute("/en/privacy")).toMatchObject({ view: "privacy" });
    expect(parseRoute("/en/tft/items")).toMatchObject({ view: "tft", section: "items" });
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

  /**
   * `items` existe en los dos juegos y significa cosas distintas: en TFT son los
   * objetos de TFT y en Deadlock los de la tienda. Que el slug se repita está
   * bien —cada uno vive bajo su juego— pero son tipos separados, así que conviene
   * fijar que ninguno se cuela en el otro.
   */
  it("mantiene separados los dos /items", () => {
    expect(parseRoute("/en/deadlock/items")).toMatchObject({ view: "deadlock", dlSection: "items" });
    expect(parseRoute("/en/tft/items")).toMatchObject({ view: "tft", section: "items" });
  });

  it("una pestaña de Deadlock que no existe cae en el meta, no en una página en blanco", () => {
    expect(parseRoute("/en/deadlock/nada")).toMatchObject({ view: "deadlock", dlSection: "meta" });
  });

  /**
   * Las pestañas de los dos juegos son conjuntos distintos a propósito. Si
   * "patches" viviera en el tipo compartido, `/tft/patches` parsearía a una
   * pestaña que no existe y el sitio contestaría 200 en una URL vacía.
   */
  it("no acepta una pestaña de Deadlock en TFT", () => {
    expect(parseRoute("/en/tft/patches")).toMatchObject({ view: "tft", section: "meta" });
  });

  it("falls back to the meta tab when /tft carries no section", () => {
    expect(parseRoute("/en/tft")).toMatchObject({ view: "tft", section: "meta" });
  });

  it("reads a detail slug", () => {
    expect(parseRoute("/en/tft/units/jinx")).toMatchObject({
      view: "tft",
      section: "units",
      detail: "jinx",
    });
  });

  it("ignores a detail on sections that have no detail pages", () => {
    expect(parseRoute("/en/tft/ladder/anything").detail).toBeUndefined();
    expect(parseRoute("/en/tft/player/someone").detail).toBeUndefined();
  });

  it("still understands paths from before languages were in the URL", () => {
    // Links shared earlier must not break.
    expect(parseRoute("/tft/items")).toMatchObject({
      lang: "en",
      view: "tft",
      section: "items",
    });
  });

  it("shows the site rather than nothing when the path is nonsense", () => {
    expect(parseRoute("/en/wat")).toMatchObject({ view: "home" });
    expect(parseRoute("/zz/tft")).toMatchObject({ lang: "en", view: "home" });
  });
});

describe("the rank band in the meta URL", () => {
  it("reads a band, so each rank's meta is a page of its own", () => {
    expect(parseRoute("/en/tft/meta/diamond-emerald")).toMatchObject({
      view: "tft",
      section: "meta",
      band: "diamond-emerald",
      detail: undefined,
    });
  });

  it("keeps the comp slug working after a band", () => {
    expect(parseRoute("/es/tft/meta/platinum-gold/sorcerer-zoe")).toMatchObject({
      lang: "es",
      section: "meta",
      band: "platinum-gold",
      detail: "sorcerer-zoe",
    });
  });

  // These URLs are in the sitemap and may already be indexed.
  it("still reads a bare comp slug as a comp, not as a band", () => {
    expect(parseRoute("/en/tft/meta/sorcerer-zoe")).toMatchObject({
      section: "meta",
      band: undefined,
      detail: "sorcerer-zoe",
    });
  });

  it("leaves the default band out of the path, so the meta keeps one address", () => {
    expect(routePath({ lang: "en", view: "tft", section: "meta", dlSection: "meta", band: "global" })).toBe(
      "/en/tft/meta"
    );
  });

  // Apex used to be the default and owned the bare /tft/meta. Now that the
  // Platinum+ cut is the default, apex is a band like any other and needs its
  // own address rather than silently resolving to the front page.
  it("gives apex its own address now that it is not the default", () => {
    expect(routePath({ lang: "en", view: "tft", section: "meta", dlSection: "meta", band: "apex" })).toBe(
      "/en/tft/meta/apex"
    );
    expect(parseRoute("/en/tft/meta/apex").band).toBe("apex");
  });

  it("ignores a band on sections that do not have one", () => {
    expect(parseRoute("/en/tft/units/diamond-emerald")).toMatchObject({
      section: "units",
      band: undefined,
      detail: "diamond-emerald",
    });
  });
});

describe("routePath", () => {
  const cases: [Route, string][] = [
    [{ lang: "en", view: "home", section: "meta", dlSection: "meta" }, "/en"],
    [{ lang: "es", view: "home", section: "meta", dlSection: "meta" }, "/es"],
    [{ lang: "en", view: "tft", section: "meta", dlSection: "meta" }, "/en/tft/meta"],
    [{ lang: "es", view: "tft", section: "units", dlSection: "meta" }, "/es/tft/units"],
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
    [{ lang: "en", view: "tft", section: "units", dlSection: "meta", detail: "jinx" }, "/en/tft/units/jinx"],
    [
      { lang: "es", view: "tft", section: "meta", dlSection: "meta", band: "silver-below" },
      "/es/tft/meta/silver-below",
    ],
    [
      { lang: "en", view: "tft", section: "meta", dlSection: "meta", band: "platinum-gold", detail: "sorcerer-zoe" },
      "/en/tft/meta/platinum-gold/sorcerer-zoe",
    ],
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
    expect(routeUrl({ lang: "es", view: "tft", section: "items", dlSection: "meta" })).toBe(
      "https://vestigo.gg/es/tft/items"
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
