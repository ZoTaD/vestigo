import { describe, it, expect } from "vitest";
import { metaFor } from "../src/prerender";
import { DEADLOCK_PAGES, LANGS, type Route } from "../src/route";

/**
 * Las pestañas de Deadlock son páginas del sitemap, así que necesitan títulos
 * distintos.
 *
 * La regresión: `seo.deadlock` era un título único para el juego entero, así que
 * `/deadlock`, `/deadlock/items` y `/deadlock/patches` salían al sitemap con el
 * mismo texto — tres URLs peleando por la misma búsqueda, y la de objetos
 * perdiendo justo la que le corresponde.
 */
describe("cada pestaña de Deadlock tiene su propio título", () => {
  const de = (dlSection: (typeof DEADLOCK_PAGES)[number], lang: "en" | "es" = "en") =>
    metaFor({ lang, view: "deadlock", dlSection }, lang, null);

  it.each(LANGS)("no repite ni título ni descripción en %s", (lang) => {
    const titulos = DEADLOCK_PAGES.map((s) => de(s, lang).title);
    const descripciones = DEADLOCK_PAGES.map((s) => de(s, lang).description);
    expect(new Set(titulos).size).toBe(DEADLOCK_PAGES.length);
    expect(new Set(descripciones).size).toBe(DEADLOCK_PAGES.length);
  });

  it("le da a la pestaña de objetos las palabras por las que se la busca", () => {
    expect(de("items").title.toLowerCase()).toContain("item");
    expect(de("items", "es").title.toLowerCase()).toContain("objetos");
  });

  it("deja el meta con el título llano del juego, que es la URL indexada", () => {
    expect(de("meta").title).toContain("Hero Tier List");
  });

  it("nombra al héroe o al ítem cuando la ruta abre uno", () => {
    const hero = metaFor(
      { lang: "en", view: "deadlock", dlSection: "meta", detail: "infernus" },
      "en",
      "Infernus"
    );
    expect(hero.title).toContain("Infernus");
    expect(hero.title).not.toBe(de("meta").title);
  });
});

/**
 * `metaFor` es una cadena de ramas sobre `seo[...]`, así que un cambio de forma
 * en la copia rompe una vista sin que TypeScript diga nada — el acceso final es
 * un `as`. Pasó al partir `seo.deadlock` en tres: entre editar la copia y editar
 * la rama, la home tiraba una excepción adentro de PageMeta.
 *
 * Esto recorre todas las vistas que el sitio sirve, en los dos idiomas, por esa
 * única razón. "tft" no está: `parseRoute` dejó de producirla el 2026-09-15.
 */
describe("metaFor resuelve todas las vistas", () => {
  const vistas: Route["view"][] = ["home", "deadlock", "privacy", "terms"];

  it.each(vistas)("no explota en %s", (view) => {
    for (const lang of LANGS) {
      const m = metaFor({ lang, view, dlSection: "meta" }, lang, null);
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.description.length).toBeGreaterThan(5);
    }
  });
});
