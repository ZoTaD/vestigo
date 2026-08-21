import { describe, it, expect } from "vitest";
import { titleBand } from "../src/PageMeta";
import { metaFor } from "../src/prerender";
import { DEADLOCK_SECTIONS, LANGS, SECTIONS, type Route } from "../src/route";

const meta = (over: Partial<Route> = {}): Route => ({
  lang: "en",
  view: "tft",
  section: "meta",
  ...over,
});

describe("titleBand", () => {
  it("titles a band page after its band", () => {
    expect(titleBand(meta({ band: "diamond-emerald" }))).toBe("diamond-emerald");
  });

  // The regression: the route carries a band as soon as anyone picks one, so
  // /tft/meta — the page that ranks for "tier list" — was being retitled after
  // whichever band a returning visitor had picked.
  it("leaves the default band's page on the section's own title", () => {
    expect(titleBand(meta({ band: "global" }))).toBeNull();
    expect(titleBand(meta())).toBeNull();
  });

  it("titles apex after itself now that it is no longer the default", () => {
    expect(titleBand(meta({ band: "apex" }))).toBe("apex");
  });

  it("lets a comp's own name win over the band it was opened from", () => {
    expect(titleBand(meta({ band: "silver-below", detail: "sorcerer-zoe" }))).toBeNull();
  });

  it("has nothing to say about other sections", () => {
    expect(titleBand(meta({ section: "units", band: "platinum-gold" }))).toBeNull();
    expect(titleBand(meta({ view: "home", band: "platinum-gold" }))).toBeNull();
  });
});

/**
 * Las tres pestañas de Deadlock son tres páginas del sitemap, así que necesitan
 * tres títulos.
 *
 * La regresión: `seo.deadlock` era un título único para el juego entero, así que
 * `/deadlock`, `/deadlock/items` y `/deadlock/patches` salían al sitemap con el
 * mismo texto — tres URLs peleando por la misma búsqueda, y la de objetos
 * perdiendo justo la que le corresponde. Es el mismo error que ya se había
 * pagado con las bandas de TFT.
 */
describe("cada pestaña de Deadlock tiene su propio título", () => {
  const de = (dlSection: (typeof DEADLOCK_SECTIONS)[number], lang: "en" | "es" = "en") =>
    metaFor({ lang, view: "deadlock", section: "meta", dlSection }, lang, "17", null);

  it.each(LANGS)("no repite ni título ni descripción en %s", (lang) => {
    const titulos = DEADLOCK_SECTIONS.map((s) => de(s, lang).title);
    const descripciones = DEADLOCK_SECTIONS.map((s) => de(s, lang).description);
    expect(new Set(titulos).size).toBe(DEADLOCK_SECTIONS.length);
    expect(new Set(descripciones).size).toBe(DEADLOCK_SECTIONS.length);
  });

  it("le da a la pestaña de objetos las palabras por las que se la busca", () => {
    expect(de("items").title.toLowerCase()).toContain("item");
    expect(de("items", "es").title.toLowerCase()).toContain("objetos");
  });

  it("deja el meta con el título llano del juego, que es la URL indexada", () => {
    expect(de("meta").title).toContain("Hero Tier List");
  });
});

/**
 * `metaFor` es una cadena de ramas sobre `seo[...]`, así que un cambio de forma
 * en la copia rompe una vista sin que TypeScript diga nada — el acceso final es
 * un `as`. Pasó al partir `seo.deadlock` en tres: entre editar la copia y editar
 * la rama, la home tiraba una excepción adentro de PageMeta.
 *
 * Esto recorre todas las vistas en los dos idiomas por esa única razón.
 */
describe("metaFor resuelve todas las vistas", () => {
  const vistas: Route["view"][] = ["home", "tft", "deadlock", "privacy", "terms"];

  it.each(vistas)("no explota en %s", (view) => {
    for (const lang of LANGS) {
      const m = metaFor({ lang, view, section: "meta", dlSection: "meta" }, lang, "17", null);
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.description.length).toBeGreaterThan(5);
    }
  });

  it.each(SECTIONS)("no explota en la pestaña de TFT %s", (section) => {
    const m = metaFor({ lang: "en", view: "tft", section, dlSection: "meta" }, "en", "17", null);
    expect(m.title.length).toBeGreaterThan(5);
  });
});
