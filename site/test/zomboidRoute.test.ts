import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseRoute, PZ_PUBLISHED, PZ_SECTION_ES, PZ_SECTIONS, registerPzSlugs, routePath } from "../src/route";

/** Project Zomboid (2026-09-30): la portada, las pestañas y las fichas, en los dos idiomas. */
describe("las direcciones de Project Zomboid", () => {
  // Una pestaña sin publicar cae en la portada: para probar las direcciones de cada una se las da por publicadas a
  // todas, y al terminar la lista vuelve a ser la de `route.ts` (desde el 2026-09-30 ya no está vacía: Objetos).
  const published = [...PZ_PUBLISHED];
  beforeAll(() => {
    PZ_PUBLISHED.splice(0, PZ_PUBLISHED.length, ...PZ_SECTIONS);
  });
  afterAll(() => {
    PZ_PUBLISHED.splice(0, PZ_PUBLISHED.length, ...published);
  });

  it("la portada es /project-zomboid en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const r = parseRoute(`/${lang}/project-zomboid`);
      expect(r).toMatchObject({ lang, view: "zomboid", pzSection: "home" });
      expect(routePath(r)).toBe(`/${lang}/project-zomboid`);
    }
  });

  it("/zomboid a secas ya no es la sección: el 301 lo hace Netlify", () => {
    // `/zomboid/items/…` es la carpeta de los íconos: si fuera una página no se le podría dar caché sin cachear HTML.
    expect(parseRoute("/es/zomboid").view).not.toBe("zomboid");
    expect(parseRoute("/zomboid/items/crowbar.png").view).not.toBe("zomboid");
  });

  it("cada pestaña tiene su nombre en inglés y en español", () => {
    for (const tab of PZ_SECTIONS) {
      expect(routePath(parseRoute(`/en/project-zomboid/${tab}`))).toBe(`/en/project-zomboid/${tab}`);
      const es = parseRoute(`/es/project-zomboid/${PZ_SECTION_ES[tab]}`);
      expect(es.pzSection, tab).toBe(tab);
      expect(routePath(es)).toBe(`/es/project-zomboid/${PZ_SECTION_ES[tab]}`);
      expect(routePath({ ...es, lang: "en" })).toBe(`/en/project-zomboid/${tab}`);
    }
    expect(PZ_SECTION_ES.items).toBe("objetos");
    expect(PZ_SECTION_ES.map).toBe("mapa");
  });

  it("una pestaña que no existe cae en la portada, y las que no tienen fichas no leen detalle", () => {
    expect(routePath(parseRoute("/es/project-zomboid/no-existe"))).toBe("/es/project-zomboid");
    expect(parseRoute("/en/project-zomboid/map/muldraugh").detail).toBeUndefined();
  });

  it("una pestaña que todavía no se publicó cae en la portada, con su dirección corregida", () => {
    PZ_PUBLISHED.splice(0);
    try {
      expect(parseRoute("/es/project-zomboid/mapa")).toMatchObject({ view: "zomboid", pzSection: "home" });
      expect(parseRoute("/es/project-zomboid/mapa").detail).toBeUndefined();
      expect(routePath(parseRoute("/es/project-zomboid/mapa"))).toBe("/es/project-zomboid");
    } finally {
      // Aunque falle un expect: si no, los tests que siguen correrían sin ninguna pestaña publicada.
      PZ_PUBLISHED.splice(0, PZ_PUBLISHED.length, ...PZ_SECTIONS);
    }
  });

  it("las fichas llevan el slug de su idioma, y el inglés bajo /es sigue abriéndolas", () => {
    registerPzSlugs({ items: { crowbar: "palanca" } });
    const es = parseRoute("/es/project-zomboid/objetos/palanca");
    expect(es).toMatchObject({ pzSection: "items", detail: "crowbar" });
    expect(routePath(es)).toBe("/es/project-zomboid/objetos/palanca");
    expect(routePath({ ...es, lang: "en" })).toBe("/en/project-zomboid/items/crowbar");
    expect(parseRoute("/es/project-zomboid/objetos/crowbar").detail).toBe("crowbar");
  });

  it("un slug en español bajo /en también abre la ficha (y la dirección se corrige al inglés)", () => {
    registerPzSlugs({ items: { crowbar: "palanca" } });
    const r = parseRoute("/en/project-zomboid/objetos/palanca");
    expect(r).toMatchObject({ pzSection: "items", detail: "crowbar" });
    expect(routePath(r)).toBe("/en/project-zomboid/items/crowbar");
  });
});
