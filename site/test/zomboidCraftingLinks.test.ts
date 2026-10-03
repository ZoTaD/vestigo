/**
 * Las entradas al Planificador de fabricación desde el resto de la libreta (2026-10-02, Fabricación Task 5): la ficha de
 * un objeto que se fabrica ("Planificá qué juntar"), la de una receta ("Planificá esta receta") y Personaje ("Planificá
 * qué fabricar con este personaje"). Cada una es un `<a href>` con lo suyo ya elegido en la query, que Fabricación lee al
 * montarse; acá se prueba la dirección y el prerender de cada ficha. Y el `lastmod` de Fabricación sigue al botín.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import craftJson from "../../games/zomboid/data/craft.json";
import itemsList from "../../games/zomboid/data/site/items-list.json";
import pzIndex from "../../games/zomboid/data/index.json";
import pzMeta from "../../games/zomboid/data/meta.json";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { parseRoute, registerPzSlugs, routePath, type PzTab, type Route } from "../src/route";
import { sitemapLastmod, type SitemapData } from "../src/sitemap";
import type { CraftData } from "../src/zomboid/crafting/data";
import { craftHref } from "../src/zomboid/crafting/link";
import { decodeState, sanitize } from "../src/zomboid/crafting/state";
import { KnownRecipes } from "../src/zomboid/planner/ZomboidPlanner";
import { DEFAULT_BUILD, knownNotRecipes } from "../src/zomboid/planner/build";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const craft = craftJson as unknown as CraftData;
// Lo mismo que hace el build en `readSitemapData`: los slugs en español, antes de leer ninguna dirección.
beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

const base = (lang: "en" | "es"): Route => parseRoute(`/${lang}/project-zomboid`);
const ficha = (lang: "en" | "es", sec: PzTab, id: string) => routePath({ ...base(lang), pzSection: sec, detail: id });
/** Los enlaces "Planificá…" al planificador de fabricación que tiene un HTML (no la solapa de la pestaña, que va siempre). */
const craftLinks = (html: string, lang: "en" | "es") => {
  const path = lang === "es" ? "/es/project-zomboid/fabricacion" : "/en/project-zomboid/crafting";
  return [...html.matchAll(new RegExp(`<a href="(${path}[^"]*)" class="pzi-craftlink"`, "g"))].map((m) => m[1]);
};

describe("craftHref", () => {
  it("lleva a la pestaña con lo elegido, desde cualquier página y en el idioma de la página", () => {
    expect(craftHref(parseRoute(ficha("es", "items", "plank")), { q: [{ id: "plank", qty: 1 }] })).toBe("/es/project-zomboid/fabricacion?q=plank");
    expect(craftHref(parseRoute("/en/project-zomboid/items/plank"), { q: [{ id: "plank", qty: 1 }] })).toBe("/en/project-zomboid/crafting?q=plank");
    // Sin nada elegido, la página limpia.
    expect(craftHref(base("es"), {})).toBe("/es/project-zomboid/fabricacion");
  });
});

describe("la ficha de un objeto", () => {
  it("uno que se fabrica lleva al planificador con él pedido", async () => {
    expect(ficha("es", "items", "plank")).toBe("/es/project-zomboid/objetos/tabla");
    const html = await renderApp(parseRoute("/es/project-zomboid/objetos/tabla"));
    expect(html).toContain('href="/es/project-zomboid/fabricacion?q=plank"');
    expect(html).toContain("Planificá qué juntar →");
    const en = await renderApp(parseRoute("/en/project-zomboid/items/plank"));
    expect(en).toContain('href="/en/project-zomboid/crafting?q=plank"');
    expect(en).toContain("Plan what to gather →");
  });

  it("uno que no se fabrica, no", async () => {
    const id = (itemsList as { rows: { id: string }[] }).rows.map((r) => r.id).find((x) => !Object.hasOwn(craft.makes, x))!;
    const html = await renderApp(parseRoute(ficha("es", "items", id)));
    expect(html).toContain("pzi-ficha");
    expect(craftLinks(html, "es")).toEqual([]);
  });
});

describe("la ficha de una receta", () => {
  it("la que da un objeto lo pide, con esta receta elegida", async () => {
    const html = await renderApp(parseRoute(ficha("es", "recipes", "saw-log")));
    expect(html).toContain('href="/es/project-zomboid/fabricacion?q=plank&amp;r=plank~saw-log"');
    expect(html).toContain("Planificá esta receta →");
    // Y Fabricación se queda con las dos cosas (la receta es una de las que dan tablas).
    expect(sanitize(craft, decodeState("?q=plank&r=plank~saw-log"))).toMatchObject({ q: [{ id: "plank", qty: 1 }], r: { plank: "saw-log" } });
  });

  it("una construcción se pide por su receta", async () => {
    const id = Object.keys(craft.recipes).find((k) => craft.recipes[k].kind === "build")!;
    const html = await renderApp(parseRoute(ficha("es", "recipes", id)));
    expect(craftLinks(html, "es")).toEqual([`/es/project-zomboid/fabricacion?q=c:${id}`]);
    expect(sanitize(craft, decodeState(`?q=c:${id}`)).q).toEqual([{ id: `c:${id}`, qty: 1 }]);
  });

  it("una sin resultado (afilar una hoja), ninguno", async () => {
    const html = await renderApp(parseRoute(ficha("es", "recipes", "sharpen-blade")));
    expect(html).toContain("pzi-ficha");
    expect(craftLinks(html, "es")).toEqual([]);
  });
});

describe("Personaje", () => {
  const render = (build: typeof DEFAULT_BUILD, lang: "en" | "es" = "es") =>
    renderToStaticMarkup(
      createElement(
        LangContext.Provider,
        { value: { lang, setLang: () => undefined } },
        createElement(KnownRecipes, { build, route: parseRoute(`/${lang}/project-zomboid/personaje`), navigate: () => undefined }),
      ),
    );

  it("con un herrero, lleva al planificador con ese personaje", () => {
    const html = render({ prof: "blacksmith", traits: [] });
    expect(html).toContain('href="/es/project-zomboid/fabricacion?b=blacksmith"');
    expect(html).toContain("Planificá qué fabricar con este personaje →");
  });

  it("el de entrada, a la página limpia y sin \"con este personaje\"", () => {
    expect(craftLinks(render(DEFAULT_BUILD), "es")).toEqual(["/es/project-zomboid/fabricacion"]);
    expect(render(DEFAULT_BUILD)).toContain("Planificá qué fabricar →");
    expect(render(DEFAULT_BUILD)).not.toContain("con este personaje");
    expect(render(DEFAULT_BUILD, "en")).toContain('href="/en/project-zomboid/crafting"');
  });

  // Como en las fichas de rasgo y de profesión: lo que se sabe sin ser receta va en texto, debajo, y suma a la cifra.
  it("lo que se sabe sin ser receta también está, en texto y una vez cada cosa", () => {
    const mech = render({ prof: "mechanic", traits: [] });
    expect(mech).toMatch(/<li>Mecánica básica<\/li>/);
    expect(mech).toMatch(/<li>Mecánica básica<\/li><li>Mecánica intermedia<\/li><li>Mecánica avanzada<\/li>/);
    expect(knownNotRecipes({ prof: "mechanic", traits: [] }).map((k) => k.en)).toEqual([
      "Basic Mechanics",
      "Intermediate Mechanics",
      "Advanced Mechanics",
    ]);
    // Herborista y Conocimiento de la naturaleza traen los dos "Remedios herbales": sale una vez.
    const both = knownNotRecipes({ prof: DEFAULT_BUILD.prof, traits: ["herbalist-herbalist", "bushcrafter"] });
    expect(both.filter((k) => k.en === "Herbal Remedies")).toHaveLength(1);
    expect(both).toHaveLength(6);
    expect(render(DEFAULT_BUILD)).toContain("Ninguna más que las que sabe todo el mundo.");
  });

  it("el prerender de la pestaña trae el link", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/personaje"));
    expect(craftLinks(html, "es")).toEqual(["/es/project-zomboid/fabricacion"]);
  });
});

describe("el lastmod de Fabricación sigue al botín, como Objetos", () => {
  const data = (lootExtractedAt?: string) =>
    ({
      dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
      zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, index: INDEX, lootExtractedAt },
      dates: { zomboid: pzMeta.extractedAt },
    }) as unknown as SitemapData;
  const own = pzMeta.extractedAt.slice(0, 10);

  it("con un botín posterior, lleva esa fecha; con uno anterior o sin botín, la suya", () => {
    for (const p of ["/es/project-zomboid/fabricacion", "/en/project-zomboid/crafting"]) {
      expect(sitemapLastmod(p, data("2099-01-05T10:00:00Z")), p).toBe("2099-01-05");
      expect(sitemapLastmod(p, data("2000-01-05T10:00:00Z")), p).toBe(own);
      expect(sitemapLastmod(p, data()), p).toBe(own);
    }
  });
});
