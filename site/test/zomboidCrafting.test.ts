/**
 * La pestaña Fabricación de Project Zomboid (2026-10-02): el Planificador de fabricación publicado. El motor lo prueban
 * `zomboidCraftEngine.test.ts` y `zomboidCraftState.test.ts`; acá va lo que se ve: el prerender (la página limpia, sin
 * nada elegido, que es la que lee Google), el sitemap, el `<head>`, el chunk, la hoja de ruta y el árbol con un plan de
 * verdad, y las reglas de la casa en su hoja de estilos.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import craftJson from "../../games/zomboid/data/craft.json";
import pzIndex from "../../games/zomboid/data/index.json";
import pzMeta from "../../games/zomboid/data/meta.json";
import { filesFor } from "../src/areaFiles";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { jsonLdFor, metaFor } from "../src/prerender";
import { parseRoute, PZ_PUBLISHED, registerPzSlugs, routeUrl, type PzTab } from "../src/route";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { ZOMBOID_COPY } from "../src/zomboidCopy";
import type { CraftData } from "../src/zomboid/crafting/data";
import { plan } from "../src/zomboid/crafting/engine";
import { EMPTY, type CraftState } from "../src/zomboid/crafting/state";
import { CRAFT_COPY, IDEAS } from "../src/zomboid/crafting/copy";
import RouteSheet, { shareLink } from "../src/zomboid/crafting/RouteSheet";
import TreeSheet from "../src/zomboid/crafting/TreeSheet";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const craft = craftJson as unknown as CraftData;
/** El mismo de la Task 2: sin botín, cada objeto que tiene receta se fabrica (el número no depende del botín). */
const sinBotin = (d: CraftData): CraftData => ({
  ...d, loot: false,
  items: Object.fromEntries(Object.entries(d.items).map(([k, { f: _f, w: _w, ...v }]) => [k, v])),
});

// Lo mismo que hace el build en `readSitemapData`: los slugs en español, antes de leer ninguna dirección.
beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

const ES = "/es/project-zomboid/fabricacion";
const EN = "/en/project-zomboid/crafting";
const nameOf = (id: string, lang: "en" | "es") =>
  id.startsWith("c:") ? craft.recipes[id.slice(2)][lang] : craft.items[id][lang];
/** Lo que React escribe escapado en el HTML (los apóstrofos y las comillas de algunos nombres). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("Fabricación publicada", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, index: INDEX },
    dates: { zomboid: pzMeta.extractedAt },
  } as unknown as SitemapData;

  it("está en PZ_PUBLISHED y la dirección abre la pestaña en los dos idiomas", () => {
    expect(PZ_PUBLISHED).toContain("crafting");
    expect(parseRoute(ES)).toMatchObject({ view: "zomboid", pzSection: "crafting", detail: undefined });
    expect(parseRoute(EN)).toMatchObject({ view: "zomboid", pzSection: "crafting", detail: undefined });
  });

  it("el sitemap tiene la página en los dos idiomas, y nada debajo (no tiene fichas)", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain(ES);
    expect(paths).toContain(EN);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(crafting|fabricacion)\/./.test(p))).toEqual([]);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute(ES))).toEqual(["src/Zomboid.tsx", "src/zomboid/crafting/ZomboidCrafting.tsx"]);
  });

  it("el <head>: el título que se busca, la herramienta como aplicación web y las migas", () => {
    for (const [path, lang, start] of [
      [ES, "es", "Planificador de fabricación de Project Zomboid"],
      [EN, "en", "Project Zomboid Crafting Planner"],
    ] as const) {
      const route = parseRoute(path);
      const page = metaFor(route, lang, null);
      expect(page.title).toBe(ZOMBOID_COPY[lang].seo.crafting.title);
      expect(page.title.length).toBeLessThanOrEqual(65);
      expect(page.title.startsWith(start)).toBe(true);
      const ld = jsonLdFor(route, lang, { ...page, canonical: routeUrl(route), image: "" }, data, null) as {
        "@type": string; name?: string; itemListElement?: { name: string }[];
      }[];
      // Con el nombre de la herramienta: el título sin la marca.
      const app = ld.find((x) => x["@type"] === "WebApplication");
      expect(app?.name).toBe(page.title.replace(/\s*\|.*$/, ""));
      expect(app?.name?.startsWith(start)).toBe(true);
      if (lang === "es") {
        const crumbs = ld.find((x) => x["@type"] === "BreadcrumbList")!;
        expect(crumbs.itemListElement!.map((x) => x.name)).toEqual(["Vestigo", "Project Zomboid", "Fabricación"]);
      }
    }
  });

  it("el prerender trae la página entera, con las cifras, las ideas y la solapa marcada", async () => {
    const html = await renderApp(parseRoute(ES));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Planificador de fabricación<\/h1>/);
    expect(html).toContain(craft.counts.craftable.toLocaleString("es-AR"));
    expect(html).toContain(`Se pueden fabricar ${craft.counts.craftable.toLocaleString("es-AR")} objetos`);
    expect(html).toContain(`Build ${craft.v}`);
    for (const id of IDEAS) expect(html, id).toContain(esc(nameOf(id, "es")));
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/fabricacion"[^>]*aria-current="page"[^>]*>Fabricación</);
    // Sin nada elegido, la hoja de ruta es la nota a mano.
    expect(html).toContain(CRAFT_COPY.es.empty);
    expect(html).not.toMatch(/archivos del juego|game files/i);

    const en = await renderApp(parseRoute(EN));
    expect(en).not.toContain("pz-loading");
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Crafting planner<\/h1>/);
    expect(en).toContain(`${craft.counts.craftable.toLocaleString("en-US")} items can be crafted`);
    for (const id of IDEAS) expect(en, id).toContain(esc(nameOf(id, "en")));
    expect(en).toMatch(/<a [^>]*href="\/en\/project-zomboid\/crafting"[^>]*aria-current="page"[^>]*>Crafting</);
    expect(en).not.toMatch(/archivos del juego|game files/i);
  });

  it("la portada enlaza «¿Qué necesito para fabricar…?» a la pestaña: ya no dice «Pronto»", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    const tools = html.slice(html.indexOf('class="pz-tools"'));
    expect(tools).toContain('href="/es/project-zomboid/fabricacion" class="pz-tool-link">¿Qué necesito para fabricar…?</a>');
  });
});

describe("las ideas para empezar", () => {
  it("cada una existe: un objeto que se fabrica o una construcción", () => {
    expect(IDEAS).toHaveLength(10);
    for (const id of IDEAS) {
      if (id.startsWith("c:")) expect(craft.recipes[id.slice(2)]?.kind, id).toBe("build");
      else expect(craft.makes[id]?.length, id).toBeGreaterThan(0);
    }
  });
});

/** La hoja de ruta y el árbol de un estado, dibujados en el servidor en español (o inglés). */
function sheets(d: CraftData, st: CraftState, lang: "en" | "es" = "es") {
  const route = parseRoute(lang === "es" ? ES : EN);
  const { trees, totals } = plan(d, st);
  const wrap = (el: ReactElement) =>
    renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
  const common = { data: d, st, set: () => undefined, route, navigate: () => undefined };
  return {
    route: wrap(createElement(RouteSheet, { ...common, totals })),
    tree: wrap(createElement(TreeSheet, { ...common, trees })),
  };
}

/** El pedazo de la hoja de ruta que va debajo de un título (hasta el próximo `<h3`). */
const part = (html: string, title: string) => {
  const at = html.indexOf(`>${title}<`);
  if (at < 0) return "";
  const end = html.indexOf("<h3", at + 1);
  return html.slice(at, end < 0 ? undefined : end);
};

describe("la hoja de ruta: 10 tablas", () => {
  const st: CraftState = { ...EMPTY, q: [{ id: "plank", qty: 10 }] };
  const t = CRAFT_COPY.es;
  // Después de anotar los slugs en español (el `beforeAll` de arriba): los links llevan "tronco", no "log".
  let html = "";
  let tree = "";
  beforeAll(() => ({ route: html, tree } = sheets(craft, st)));

  it("para juntar: 4 troncos, con su link a Objetos", () => {
    const raw = part(html, t.raw);
    expect(raw).toContain("Tronco");
    expect(raw).toMatch(/>4</);
    expect(raw).toContain('href="/es/project-zomboid/objetos/tronco"');
  });

  it("las herramientas: «una de» las sierras, cada una con link", () => {
    const tools = part(html, t.tools);
    expect(tools).toContain(t.oneOf);
    for (const id of ["hacksaw", "simple-wood-saw", "wood-saw"]) expect(tools).toContain(esc(craft.items[id].es));
  });

  it("los pasos: 4 × Aserrar troncos → 12 Tablas, con link a la receta", () => {
    const steps = part(html, t.steps);
    expect(steps).toMatch(/4 ×/);
    expect(steps).toContain("Aserrar troncos");
    expect(steps).toContain('href="/es/project-zomboid/recetas/aserrar-troncos"');
    expect(steps).toMatch(/12/);
  });

  it("te sobran 2 tablas", () => {
    const left = part(html, t.left);
    expect(left).toMatch(/>2</);
    expect(left).toContain("Tabla");
  });

  it("el link para compartir es el de la página con ?q=plank*10", () => {
    expect(html).toContain(t.share);
    expect(shareLink(parseRoute(ES), st)).toMatch(/\/es\/project-zomboid\/fabricacion\?q=plank\*10$/);
  });

  it("el árbol: «Cambiar receta» con las 3 recetas de tablas", () => {
    const sel = tree.match(/<select[^>]*aria-label="Cambiar receta[^"]*"[^>]*>(.*?)<\/select>/);
    expect(sel).not.toBeNull();
    expect(sel![1].match(/<option/g)).toHaveLength(3);
    for (const rid of craft.makes.plank) expect(sel![1]).toContain(`value="${rid}"`);
    // Y la raíz no tiene "Lo consigo": es lo que pediste.
    expect(tree.indexOf(t.getIt)).toBe(tree.lastIndexOf(t.getIt));
  });

  it("en inglés, con los textos en inglés", () => {
    const en = sheets(craft, st, "en");
    expect(en.route).toContain(CRAFT_COPY.en.raw);
    expect(en.route).toContain("Log");
    expect(en.route).toContain('href="/en/project-zomboid/recipes/saw-log"');
    expect(en.route).not.toContain("Tronco");
  });
});

describe("la hoja de ruta: una construcción", () => {
  const st: CraftState = { ...EMPTY, q: [{ id: "c:large-plant-drying-rack", qty: 1 }] };

  it.skipIf(!craft.loot)("con botín: 2 cordeles para juntar (8 usos), que se encuentran", () => {
    const { route: html } = sheets(craft, st);
    const raw = part(html, CRAFT_COPY.es.raw);
    expect(raw).toContain("Cordel");
    expect(raw).toMatch(/>2</);
    expect(raw).toContain(CRAFT_COPY.es.uses(8));
    expect(raw).toContain(CRAFT_COPY.es.why.found);
  });

  it("sin botín: el cordel se fabrica (2 × Hacer cordel) y lo que se junta es el cáñamo", () => {
    const d = sinBotin(craft);
    const { route: html, tree } = sheets(d, st);
    const raw = part(html, CRAFT_COPY.es.raw);
    expect(raw).not.toContain(">Cordel<");
    expect(raw).toContain(esc(d.items["hemp-dogbane"].es));
    const steps = part(html, CRAFT_COPY.es.steps);
    expect(steps).toContain(esc(d.recipes["craft-twine"].es));
    // La construcción en el árbol va a su receta, no a Objetos.
    expect(tree).toContain('href="/es/project-zomboid/recetas/');
    // La estación de la construcción, la habilidad, con su link a Habilidades.
    expect(part(html, CRAFT_COPY.es.skills)).toContain('href="/es/project-zomboid/habilidades/carpinteria"');
  });
});

describe("las reglas de la casa en la hoja de estilos", () => {
  const css = readFileSync(new URL("../src/styles/zomboid-crafting.css", import.meta.url), "utf-8");
  it("sin filos de color en filas ni tarjetas, y sin cortar palabras", () => {
    expect(css).not.toMatch(/border-(left|right|top)\s*:/);
    expect(css).not.toMatch(/overflow-wrap\s*:\s*anywhere/);
    expect(css).not.toMatch(/word-break/);
  });
  it("la pestaña usa la libreta de Objetos, y el árbol sangra 12 px por nivel", () => {
    const tsx = readFileSync(new URL("../src/zomboid/crafting/ZomboidCrafting.tsx", import.meta.url), "utf-8");
    expect(tsx).toContain('import "../../styles/zomboid-items.css"');
    expect(tsx).toContain('import "../../styles/zomboid-crafting.css"');
    expect(css).toMatch(/padding-left:\s*12px/);
  });
});
