import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute, PZ_PUBLISHED, PZ_SECTION_ES, type PzTab } from "../src/route";
import Zomboid from "../src/Zomboid";
import { PZ_TABS, ZOMBOID_COPY } from "../src/zomboidCopy";
import meta from "../../games/zomboid/data/meta.json";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Zomboid, { route: parseRoute(path), navigate: () => undefined })),
  );

/**
 * La primera pestaña que todavía no tiene página. No es `mapa` fijo: el día que se publique, este test tiene que seguir
 * probando lo mismo con la que venga después. Si ya se publicaron todas, los dos tests que la usan se saltean.
 */
const soon = PZ_TABS.find((t): t is PzTab => t !== "home" && !PZ_PUBLISHED.includes(t));

describe("la portada de Project Zomboid", () => {
  it("dice qué hay, con las cifras de los datos, en español", () => {
    const html = render("es", "/es/project-zomboid");
    expect(html).toContain("Project Zomboid");
    expect(html).toContain("Lo que hay");
    // Las recetas son todas las que lista su pestaña (fabricar y construir: 1.170), no sólo las de fabricar (969).
    const recipes = meta.counts.recipes + meta.counts.buildRecipes;
    expect(recipes).toBe(1170);
    expect(html).toMatch(new RegExp(`Recetas<b>${recipes.toLocaleString("es-AR").replace(".", "\\.")}</b>`));
    expect(html).not.toContain(meta.counts.recipes.toLocaleString("es-AR"));
    expect(html).toContain(`Build ${meta.version}`);
    expect(html).toContain("casa segura");
  });

  it("las dos fichas del Servidor van con su dirección en español, aunque la pestaña no se haya bajado", () => {
    // Este archivo no importa `ZomboidServer.tsx`: los slugs los tiene que anotar la portada. Antes salía
    // `/servidor/water-and-power-shutoff` (el id en inglés) y la portada prerenderizada enlazaba eso.
    const tools = render("es", "/es/project-zomboid").split('class="pz-tools"')[1] ?? "";
    expect(tools).toContain('href="/es/project-zomboid/servidor/presets-de-sandbox"');
    expect(tools).toContain('href="/es/project-zomboid/servidor/cortes-de-agua-y-luz"');
    expect(tools).not.toMatch(/servidor\/(sandbox-presets|water-and-power-shutoff)/);
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("en", "/en/project-zomboid");
    expect(html).toContain("What&#x27;s in here");
    expect(html).toContain("safe house");
  });

  it.skipIf(!soon)("las pestañas que todavía no tienen página se ven apagadas y sin enlace", () => {
    const html = render("es", "/es/project-zomboid");
    expect(html).toContain('href="/es/project-zomboid"');
    expect(html).not.toContain(`href="/es/project-zomboid/${PZ_SECTION_ES[soon!]}"`);
    expect(html).toMatch(new RegExp(`class="pz-tab is-soon"[^>]*>${ZOMBOID_COPY.es.tabs[soon!]}<`));
    // El `title` no lo lee un lector de pantalla ni se ve con el dedo: el "Pronto" también va escondido dentro del texto.
    expect(html).toMatch(new RegExp(`class="pz-tab is-soon"[^>]*>${ZOMBOID_COPY.es.tabs[soon!]}<span class="visually-hidden"> — (<!-- -->)?${ZOMBOID_COPY.es.soon}</span></span>`));
  });

  it.skipIf(!PZ_PUBLISHED.includes("map"))("la herramienta del Mapa enlaza a su pestaña, y las que vienen siguen en Pronto", () => {
    for (const lang of ["en", "es"] as const) {
      const html = render(lang, `/${lang}/project-zomboid`);
      const tools = html.slice(html.indexOf('class="pz-tools"'));
      const map = ZOMBOID_COPY[lang].home.tools[0].title;
      expect(tools).toContain(`href="/${lang}/project-zomboid/${lang === "es" ? "mapa" : "map"}" class="pz-tool-link">${map}</a>`);
      // El Mapa, el Planificador de personaje, el de fabricación, la Configuración de servidor y Agua y luz ya no dicen
      // "Pronto" (los otros los prueban zomboidPlanner.test.ts, zomboidCrafting.test.ts y zomboidPublish.test.ts); las
      // que faltan, sí. Con las cinco publicadas no queda ninguna (`match` da `null`, no una lista vacía).
      expect(tools.match(new RegExp(`class="pz-soon">${ZOMBOID_COPY[lang].soon}<`, "g")) ?? []).toHaveLength(ZOMBOID_COPY[lang].home.tools.length - 5);
    }
  });

  it.skipIf(!soon)("una pestaña que todavía no existe muestra la portada", () => {
    const html = render("es", `/es/project-zomboid/${PZ_SECTION_ES[soon!]}`);
    expect(html).toContain("Lo que hay");
    // La solapa marcada es la que se ve (la portada), no la que pide la dirección y todavía no existe.
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>Libreta</);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
