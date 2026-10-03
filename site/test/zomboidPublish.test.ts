/**
 * Objetos y Recetas publicadas en la sección (2026-09-30): cada pestaña entra al sitemap con sus fichas (3.826 objetos,
 * 1.170 recetas), el prerender escribe la ficha entera (no "cargando…") con la misma entrada que usa el build
 * (`renderApp`), la portada las enlaza, y los enlaces de una a la otra llevan a páginas que existen.
 */
import { beforeAll, describe, expect, it } from "vitest";
import pzMeta from "../../games/zomboid/data/meta.json";
import pzIndex from "../../games/zomboid/data/index.json";
import itemsList from "../../games/zomboid/data/site/items-list.json";
import recipesList from "../../games/zomboid/data/site/recipes-list.json";
import { filesFor } from "../src/areaFiles";
import { metaFor } from "../src/prerender";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { parseRoute, PZ_DETAILS_PENDING, PZ_PUBLISHED, registerPzSlugs, routePath, type PzTab } from "../src/route";
import { sitemapLastmod, sitemapPaths, type SitemapData } from "../src/sitemap";
import patchIndex from "../../games/zomboid/data/site/patches/index.json";
import chronicle21 from "../../games/zomboid/data/patches/chronicle/42-21.json";
import { preloadTab } from "../src/Zomboid";
import { peekItem } from "../src/zomboid/items/data";
import { peekRecipe } from "../src/zomboid/recipes/data";
import { PZ_SHARDS, pzShard } from "../src/zomboid/shard";
import { ZOMBOID_COPY } from "../src/zomboidCopy";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, index: INDEX },
  dates: { zomboid: pzMeta.extractedAt },
} as unknown as SitemapData;

// Lo mismo que hace el build en `readSitemapData`: los slugs en español, antes de leer ninguna dirección.
beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

describe("Objetos publicada", () => {
  it("está en PZ_PUBLISHED", () => {
    expect(PZ_PUBLISHED).toContain("items");
  });

  it("el sitemap tiene la lista y cada ficha, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/objetos");
    expect(paths).toContain("/en/project-zomboid/items");
    expect(paths).toContain("/es/project-zomboid/objetos/palanca");
    expect(paths).toContain("/en/project-zomboid/items/crowbar");
    const items = INDEX.filter((e) => e.sec === "items").length;
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(items|objetos)\/./.test(p))).toHaveLength(2 * items);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/objetos/palanca"))).toEqual(["src/Zomboid.tsx", "src/zomboid/items/ZomboidItems.tsx"]);
  });

  it("el prerender de la ficha trae el cuerpo entero, no la hoja de «cargando…»", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/objetos/palanca"));
    expect(html).not.toContain("pz-loading");
    expect(html).toContain("Palanca");
    expect(html).toContain("Base.Crowbar");
    expect(html).toContain("0,6–1,15");
    expect(html).toMatch(/href="\/es\/project-zomboid\/recetas\/[^"]+"/);
    // La solapa de Objetos es un enlace vivo y marcada como la página actual.
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/objetos"[^>]*aria-current="page"[^>]*>Objetos</);
  });

  it("el prerender de la lista trae un enlace por ficha", async () => {
    const html = await renderApp(parseRoute("/en/project-zomboid/items"));
    expect(html).not.toContain("pz-loading");
    const links = new Set(html.match(/href="\/en\/project-zomboid\/items\/[^"]+"/g) ?? []);
    expect(links.size).toBe(itemsList.rows.length);
  });

  it("una ficha que no existe se prerenderiza como la lista con su nota", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/objetos/no-existe-esto"));
    expect(html).toContain("No encontramos ese objeto");
    expect(html).toContain('href="/es/project-zomboid/objetos/palanca"');
  });

  it("la portada enlaza la cifra de Objetos a su pestaña", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/objetos" class="pz-count-link">[\s\S]*?Objetos<b>[^<]+<\/b><\/a>/);
  });

  it("preloadTab baja los datos de la ficha junto con el chunk: el primer render no pasa por «cargando…»", async () => {
    expect(peekItem("shovel")).toBeUndefined();
    await preloadTab(parseRoute("/en/project-zomboid/items/shovel"));
    expect(peekItem("shovel")?.en).toBe("Shovel");
  });
});

const RECIPES = INDEX.filter((e) => e.sec === "recipes");

describe("Recetas publicada", () => {
  it("está en PZ_PUBLISHED", () => {
    expect(PZ_PUBLISHED).toContain("recipes");
  });

  it("el sitemap tiene la lista y cada receta, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/recetas");
    expect(paths).toContain("/en/project-zomboid/recipes");
    expect(paths).toContain("/es/project-zomboid/recetas/aserrar-troncos");
    expect(paths).toContain("/en/project-zomboid/recipes/saw-log");
    expect(RECIPES).toHaveLength(1170);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(recipes|recetas)\/./.test(p))).toHaveLength(2 * RECIPES.length);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/recetas/aserrar-troncos"))).toEqual(["src/Zomboid.tsx", "src/zomboid/recipes/ZomboidRecipes.tsx"]);
  });

  it("el prerender de la ficha trae el cuerpo entero, no la hoja de «cargando…»", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/recetas/aserrar-troncos"));
    expect(html).not.toContain("pz-loading");
    expect(html).toContain("Aserrar troncos");
    expect(html).toContain('href="/es/project-zomboid/objetos/tabla"');
    expect(html).toMatch(/tiempo \(unidades del juego\)/i);
    // La solapa de Recetas es un enlace vivo y marcada como la página actual.
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/recetas"[^>]*aria-current="page"[^>]*>Recetas</);
  });

  it("el prerender de la lista trae un enlace por receta", async () => {
    const html = await renderApp(parseRoute("/en/project-zomboid/recipes"));
    expect(html).not.toContain("pz-loading");
    const links = new Set(html.match(/href="\/en\/project-zomboid\/recipes\/[^"]+"/g) ?? []);
    expect(links.size).toBe(recipesList.rows.length);
  });

  it("una receta que no existe se prerenderiza como la lista con su nota", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/recetas/no-existe-esto"));
    expect(html).toContain("No encontramos esa receta");
    expect(html).toContain('href="/es/project-zomboid/recetas/aserrar-troncos"');
  });

  it("cada enlace a una receta desde la ficha de un objeto lleva a una receta publicada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/objetos/palanca"));
    const hrefs = [...new Set([...html.matchAll(/href="(\/es\/project-zomboid\/recetas\/[^"]+)"/g)].map((m) => m[1]))];
    expect(hrefs.length).toBeGreaterThan(0);
    const ids = new Set(RECIPES.map((e) => e.id));
    for (const href of hrefs) {
      const route = parseRoute(href);
      expect(route.pzSection, href).toBe("recipes");
      expect(ids.has(route.detail!), href).toBe(true);
      expect(routePath(route)).toBe(href);
    }
    // Y la página del otro lado es la receta (con el link de vuelta a la palanca), no la lista con "no encontramos".
    const forge = await renderApp(parseRoute(routePath({ ...parseRoute("/es/project-zomboid"), pzSection: "recipes", detail: "forge-crowbar" })));
    expect(forge).not.toContain("No encontramos esa receta");
    expect(forge).toContain('href="/es/project-zomboid/objetos/palanca"');
  });

  it("la portada enlaza la cifra de Recetas a su pestaña", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/recetas" class="pz-count-link">[\s\S]*?Recetas<b>[^<]+<\/b><\/a>/);
  });

  it("preloadTab baja los datos de la ficha junto con el chunk", async () => {
    expect(peekRecipe("forge-saw")).toBeUndefined();
    await preloadTab(parseRoute("/en/project-zomboid/recipes/forge-saw"));
    expect(peekRecipe("forge-saw")?.en).toBeTruthy();
  });
});

const TRAITS = INDEX.filter((e) => e.sec === "traits");
const PROFESSIONS = INDEX.filter((e) => e.sec === "professions");
const esPath = (sec: PzTab, id?: string) => routePath({ ...parseRoute("/es/project-zomboid"), pzSection: sec, detail: id });

/**
 * Rasgos publicada (2026-09-30), con las profesiones adentro: sin solapa propia, pero con lista (`/profesiones`) y
 * fichas, que van al sitemap como las de cualquier pestaña. La solapa marcada en una profesión es "Rasgos".
 */
describe("Rasgos publicada", () => {
  it("está en PZ_PUBLISHED, con las profesiones", () => {
    expect(PZ_PUBLISHED).toContain("traits");
    expect(PZ_PUBLISHED).toContain("professions");
  });

  it("el sitemap tiene las dos listas y cada ficha de rasgo y de profesión, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    for (const p of ["/es/project-zomboid/rasgos", "/en/project-zomboid/traits", "/es/project-zomboid/profesiones", "/en/project-zomboid/professions"]) {
      expect(paths).toContain(p);
    }
    expect(paths).toContain("/es/project-zomboid/rasgos/cobarde");
    expect(paths).toContain("/en/project-zomboid/traits/cowardly");
    expect(paths).toContain("/es/project-zomboid/profesiones/ladron");
    expect(paths).toContain("/en/project-zomboid/professions/burglar");
    expect(TRAITS).toHaveLength(97);
    expect(PROFESSIONS).toHaveLength(25);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(traits|rasgos)\/./.test(p))).toHaveLength(2 * TRAITS.length);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(professions|profesiones)\/./.test(p))).toHaveLength(2 * PROFESSIONS.length);
  });

  it("el HTML de rasgos y de profesiones pide el mismo chunk además del área", () => {
    const both = ["src/Zomboid.tsx", "src/zomboid/traits/ZomboidTraits.tsx"];
    expect(filesFor(parseRoute("/es/project-zomboid/rasgos/cobarde"))).toEqual(both);
    expect(filesFor(parseRoute("/es/project-zomboid/profesiones"))).toEqual(both);
  });

  it("el prerender de la ficha de un rasgo trae el cuerpo entero y la solapa de Rasgos marcada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/rasgos/cobarde"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Cobarde<\/h1>/);
    expect(html).toContain("Te da 2 puntos");
    expect(html).toContain('href="/es/project-zomboid/rasgos/valiente"');
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/rasgos"[^>]*aria-current="page"[^>]*>Rasgos</);
  });

  it("el prerender de la ficha de una profesión trae el cuerpo entero, y la solapa marcada es Rasgos", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/profesiones/ladron"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Ladrón<\/h1>/);
    expect(html).toContain("Cuesta 6 puntos");
    expect(html).toContain('href="/es/project-zomboid/rasgos/ladron"');
    expect(html).toMatch(/href="\/es\/project-zomboid\/recetas\/[^"]+"/);
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/rasgos"[^>]*aria-current="page"[^>]*>Rasgos</);
    // Las profesiones no tienen solapa: la barra no suma una.
    expect(html).not.toMatch(/class="pz-tab[^"]*"[^>]*>Profesiones</);
    const en = await renderApp(parseRoute("/en/project-zomboid/professions/burglar"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Burglar<\/h1>/);
    expect(en).toMatch(/<a [^>]*href="\/en\/project-zomboid\/traits"[^>]*aria-current="page"[^>]*>Traits</);
  });

  it("el prerender de las dos listas trae un enlace por ficha", async () => {
    const traits = await renderApp(parseRoute("/en/project-zomboid/traits"));
    expect(traits).not.toContain("pz-loading");
    expect(new Set(traits.match(/href="\/en\/project-zomboid\/traits\/[^"]+"/g) ?? []).size).toBe(TRAITS.length);
    expect(new Set(traits.match(/href="\/en\/project-zomboid\/professions\/[^"]+"/g) ?? []).size).toBe(PROFESSIONS.length);
    const profs = await renderApp(parseRoute("/es/project-zomboid/profesiones"));
    expect(profs).toContain("Profesiones de Project Zomboid");
    expect(new Set(profs.match(/href="\/es\/project-zomboid\/profesiones\/[^"]+"/g) ?? []).size).toBe(PROFESSIONS.length);
  });

  it("la portada enlaza las cifras de Rasgos y de Profesiones a sus listas", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/rasgos" class="pz-count-link">[\s\S]*?Rasgos<b>[^<]+<\/b><\/a>/);
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/profesiones" class="pz-count-link">[\s\S]*?Profesiones<b>[^<]+<\/b><\/a>/);
  });

  it("una receta enlaza al rasgo y a la profesión que la enseñan, y del otro lado están sus fichas", async () => {
    const html = await renderApp(parseRoute(esPath("recipes", "make-mildew-cure")));
    const trait = esPath("traits", "gardener");
    const prof = esPath("professions", "farmer");
    expect(html).toContain(`href="${trait}"`);
    expect(html).toContain(`href="${prof}"`);
    const t = await renderApp(parseRoute(trait));
    expect(t).not.toContain("No encontramos ese rasgo");
    expect(t).toContain(`href="${esPath("recipes", "make-mildew-cure")}"`);
    const p = await renderApp(parseRoute(prof));
    expect(p).not.toContain("No encontramos esa profesión");
    expect(p).toContain(`href="${esPath("recipes", "make-mildew-cure")}"`);
  });

  it("ninguna ficha de rasgo ni de profesión se prerenderiza «cargando…» ni como la lista", async () => {
    for (const e of [...TRAITS, ...PROFESSIONS]) {
      const path = esPath(e.sec, e.id);
      const html = await renderApp(parseRoute(path));
      expect(html, path).not.toContain('class="pz-loading"');
      expect(html, path).toMatch(/<h1 class="pzi-h1"[^>]*>[^<]+<\/h1>/);
      expect(html, path).not.toContain("No encontramos");
    }
  });
});

const MOODLES = INDEX.filter((e) => e.sec === "moodles");

/**
 * Moodles publicada (2026-09-30): la lista de los 26 y una ficha por moodle, al sitemap en los dos idiomas. Los datos
 * viajan en el chunk (como en Rasgos), así que el prerender sale entero sin línea en `preloadZomboid`.
 */
describe("Moodles publicada", () => {
  it("está en PZ_PUBLISHED", () => {
    expect(PZ_PUBLISHED).toContain("moodles");
  });

  it("el sitemap tiene la lista y cada ficha, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/moodles");
    expect(paths).toContain("/en/project-zomboid/moodles");
    expect(paths).toContain("/es/project-zomboid/moodles/sangrado");
    expect(paths).toContain("/en/project-zomboid/moodles/bleeding");
    expect(MOODLES).toHaveLength(26);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/moodles\/./.test(p))).toHaveLength(2 * MOODLES.length);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/moodles/sangrado"))).toEqual(["src/Zomboid.tsx", "src/zomboid/moodles/ZomboidMoodles.tsx"]);
  });

  it("el prerender de Sangrado trae la ficha entera, con la solapa de Moodles marcada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/moodles/sangrado"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Sangrado<\/h1>/);
    expect(html).toContain("Pérdida masiva de sangre");
    expect(html).toContain('href="/es/project-zomboid/objetos/venda"');
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/moodles"[^>]*aria-current="page"[^>]*>Moodles</);
    const en = await renderApp(parseRoute("/en/project-zomboid/moodles/bleeding"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Bleeding<\/h1>/);
    expect(en).toContain('href="/en/project-zomboid/items/bandage"');
  });

  it("el prerender de la lista trae un enlace por moodle", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/moodles"));
    expect(html).not.toContain("pz-loading");
    expect(new Set(html.match(/href="\/es\/project-zomboid\/moodles\/[^"]+"/g) ?? []).size).toBe(MOODLES.length);
  });

  it("la portada enlaza la cifra de Moodles a su lista", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/moodles" class="pz-count-link">[\s\S]*?Moodles<b>26<\/b><\/a>/);
  });

  it("cada enlace de un consejo lleva a una ficha que se prerenderiza, no a la lista con «no encontramos»", async () => {
    const hrefs = new Set<string>();
    for (const m of MOODLES) {
      const html = await renderApp(parseRoute(esPath("moodles", m.id)));
      expect(html, m.id).not.toContain('class="pz-loading"');
      expect(html, m.id).not.toContain("No encontramos");
      const advice = html.slice(html.indexOf("pzmo-advice"), html.indexOf("pzmo-related"));
      for (const [, href] of advice.matchAll(/href="([^"]+)"/g)) hrefs.add(href);
    }
    expect(hrefs.size).toBeGreaterThan(30);
    for (const href of hrefs) {
      const route = parseRoute(href);
      expect(routePath(route), href).toBe(href);
      expect(INDEX.some((e) => e.sec === route.pzSection && e.id === route.detail), href).toBe(true);
    }
  });
});

const SKILLS = INDEX.filter((e) => e.sec === "skills");

/**
 * Habilidades publicada (2026-09-30): la lista de las 35 y una ficha por habilidad, al sitemap en los dos idiomas. Los
 * datos viajan en el chunk (como en Rasgos y Moodles), así que el prerender sale entero sin línea en `preloadZomboid`.
 */
describe("Habilidades publicada", () => {
  it("está en PZ_PUBLISHED", () => {
    expect(PZ_PUBLISHED).toContain("skills");
  });

  it("el sitemap tiene la lista y cada ficha, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/habilidades");
    expect(paths).toContain("/en/project-zomboid/skills");
    expect(paths).toContain("/es/project-zomboid/habilidades/carpinteria");
    expect(paths).toContain("/en/project-zomboid/skills/carpentry");
    expect(SKILLS).toHaveLength(35);
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(skills|habilidades)\/./.test(p))).toHaveLength(2 * SKILLS.length);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/habilidades/carpinteria"))).toEqual(["src/Zomboid.tsx", "src/zomboid/skills/ZomboidSkills.tsx"]);
  });

  it("el prerender de Carpintería trae la ficha entera y la calculadora, con la solapa de Habilidades marcada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/habilidades/carpinteria"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Carpintería<\/h1>/);
    expect(html).toContain("La barra pide 32.775 XP del nivel 0 al 10.");
    expect(html).toContain('href="/es/project-zomboid/objetos/carpinteria-i-guia-para-clavar"');
    expect(html).toContain('href="/es/project-zomboid/profesiones/carpintero"');
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/habilidades"[^>]*aria-current="page"[^>]*>Habilidades</);
    const en = await renderApp(parseRoute("/en/project-zomboid/skills/carpentry"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Carpentry<\/h1>/);
    expect(en).toContain('href="/en/project-zomboid/items/carpentry-i-a-guide-to-nailing"');
  });

  it("el prerender de la lista trae un enlace por habilidad", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/habilidades"));
    expect(html).not.toContain("pz-loading");
    expect(new Set(html.match(/href="\/es\/project-zomboid\/habilidades\/[^"]+"/g) ?? []).size).toBe(SKILLS.length);
  });

  it("la portada enlaza la cifra de libros de habilidad a la lista", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/habilidades" class="pz-count-link">[\s\S]*?Libros de habilidad<b>120<\/b><\/a>/);
  });

  it("cada enlace de cada ficha lleva a una página que existe, no a la lista con «no encontramos»", async () => {
    const hrefs = new Set<string>();
    for (const s of SKILLS) {
      const html = await renderApp(parseRoute(esPath("skills", s.id)));
      expect(html, s.id).not.toContain('class="pz-loading"');
      expect(html, s.id).not.toContain("No encontramos");
      const main = html.slice(html.indexOf("pzs-head"));
      for (const [, href] of main.matchAll(/href="(\/es\/project-zomboid\/[^"]+\/[^"]+)"/g)) hrefs.add(href);
    }
    // Libros, revistas, rasgos y profesiones de las 35 fichas.
    expect(hrefs.size).toBeGreaterThan(200);
    for (const href of hrefs) {
      const route = parseRoute(href);
      expect(routePath(route), href).toBe(href);
      expect(INDEX.some((e) => e.sec === route.pzSection && e.id === route.detail), href).toBe(true);
    }
  });
});

/**
 * Servidor publicada (2026-10-01): el generador (`/servidor`) entra al sitemap (sus dos fichas, recién con su página), el HTML pide
 * su chunk, el prerender escribe las 413 filas (no "cargando…") con la solapa marcada, el `<head>` lleva el título que se
 * busca, y la portada enlaza "Configuración de servidor". Los presets comparados (`/servidor/presets-de-sandbox`) y
 * la calculadora de cortes (`/servidor/cortes-de-agua-y-luz`), 2026-10-02, tienen su página: entran al sitemap y se
 * enlazan desde el generador y desde la portada.
 */
describe("Servidor publicada", () => {
  it("está en PZ_PUBLISHED, con fichas", () => {
    expect(PZ_PUBLISHED).toContain("server");
    expect(parseRoute("/es/project-zomboid/servidor")).toMatchObject({ view: "zomboid", pzSection: "server", detail: undefined });
    expect(parseRoute("/es/project-zomboid/servidor/presets-de-sandbox")).toMatchObject({ pzSection: "server", detail: "sandbox-presets" });
    expect(parseRoute("/es/project-zomboid/servidor/cortes-de-agua-y-luz")).toMatchObject({ pzSection: "server", detail: "water-and-power-shutoff" });
  });

  it("el sitemap tiene el generador, los presets comparados y la calculadora de cortes, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/servidor");
    expect(paths).toContain("/en/project-zomboid/server");
    // Los presets comparados tienen su página desde la Task 4.
    expect(paths).toContain("/es/project-zomboid/servidor/presets-de-sandbox");
    expect(paths).toContain("/en/project-zomboid/server/sandbox-presets");
    // La calculadora de cortes, desde la Task 5: ya no queda ninguna ficha del Servidor sin página.
    expect(paths).toContain("/es/project-zomboid/servidor/cortes-de-agua-y-luz");
    expect(paths).toContain("/en/project-zomboid/server/water-and-power-shutoff");
    expect(PZ_DETAILS_PENDING.server ?? []).toEqual([]);
  });

  it("una ficha pendiente es una ficha del índice, y el filtro saca sólo ésas del sitemap", () => {
    // Lo que frena una página conectada que sigue en la lista es el test de arriba (la lista vacía); éste no.
    for (const [sec, ids] of Object.entries(PZ_DETAILS_PENDING)) {
      for (const id of ids ?? []) expect(INDEX.some((e) => e.sec === sec && e.id === id), `${sec}/${id}`).toBe(true);
    }
    // El filtro saca sólo ésas: con la calculadora anotada como pendiente un momento, sale del sitemap y nada más.
    const saved = PZ_DETAILS_PENDING.server;
    try {
      PZ_DETAILS_PENDING.server = ["water-and-power-shutoff"];
      const paths = sitemapPaths(data);
      expect(paths).not.toContain("/es/project-zomboid/servidor/cortes-de-agua-y-luz");
      expect(paths).toContain("/es/project-zomboid/servidor/presets-de-sandbox");
    } finally {
      if (saved) PZ_DETAILS_PENDING.server = saved;
      else delete PZ_DETAILS_PENDING.server;
    }
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/servidor"))).toEqual(["src/Zomboid.tsx", "src/zomboid/server/ZomboidServer.tsx"]);
  });

  it("el prerender trae el generador entero, con la solapa de Servidor marcada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/servidor"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Generador de servidor de Project Zomboid<\/h1>/);
    expect(html.match(/class="pzsv-row[^"]*" data-key=/g)).toHaveLength(269 + 144);
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/servidor"[^>]*aria-current="page"[^>]*>Servidor</);
    // Los presets comparados: "Comparar los presets" debajo de las tarjetas, y "en qué cambia" en cada una, a su preset.
    expect(html).toMatch(/<p class="pzsv-compare"><a href="\/es\/project-zomboid\/servidor\/presets-de-sandbox"[^>]*>Comparar los presets/);
    expect(html.match(/<a href="\/es\/project-zomboid\/servidor\/presets-de-sandbox#preset-[\w-]+" class="pzsv-preset-compare"><span class="visually-hidden">[^<]+: <\/span>en qué cambia<\/a>/g)).toHaveLength(5);
    const en = await renderApp(parseRoute("/en/project-zomboid/server"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Server Settings Generator<\/h1>/);
    // Una dirección que no existe debajo de la pestaña: el generador, con el aviso.
    expect(await renderApp(parseRoute("/es/project-zomboid/servidor/no-existe"))).toContain("No encontramos esa página");
  });

  it("el <head>: el título nuevo, y el de cada ficha con su descripción propia", () => {
    expect(metaFor(parseRoute("/es/project-zomboid/servidor"), "es", null).title).toBe("Generador de servidor de Project Zomboid (sandbox) | Vestigo");
    expect(metaFor(parseRoute("/en/project-zomboid/server"), "en", null).title).toBe("Project Zomboid Server Settings & Sandbox Generator | Vestigo");
    for (const lang of ["en", "es"] as const) {
      const make = ZOMBOID_COPY[lang].seo.detail.server!;
      const seen = new Set<string>();
      for (const e of INDEX.filter((x) => x.sec === "server")) {
        const { title, description } = make(e[lang]);
        expect(title, title).toContain(e[lang]);
        expect(title.length, title).toBeLessThanOrEqual(65);
        expect(description.length, description).toBeGreaterThan(80);
        seen.add(description);
      }
      // Cada ficha con la suya, no una plantilla compartida.
      expect(seen.size).toBe(2);
    }
    expect(ZOMBOID_COPY.en.seo.detail.server!("Sandbox Presets").title).toBe("Project Zomboid Sandbox Presets (Build 42) | Vestigo");
    expect(ZOMBOID_COPY.es.seo.detail.server!("Presets de sandbox").title).toBe("Presets de sandbox en Project Zomboid (Build 42) | Vestigo");
  });

  it("la portada enlaza la configuración de servidor, los presets comparados y Agua y luz", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    const tools = html.slice(html.indexOf('class="pz-tools"'));
    expect(tools).toContain('href="/es/project-zomboid/servidor" class="pz-tool-link">Configuración de servidor</a>');
    expect(tools).toContain('href="/es/project-zomboid/servidor/presets-de-sandbox" class="pz-tool-link pz-tool-more">Los cinco presets, comparados</a>');
    expect(tools).toContain('href="/es/project-zomboid/servidor/cortes-de-agua-y-luz" class="pz-tool-link">Agua y luz</a>');
    expect(tools).not.toMatch(/Agua y luz<em class="pz-soon">/);
  });
});

/**
 * Parches (2026-10-02): la lista y una página por versión, con el slug igual en los dos idiomas. Las versiones no están
 * en el índice de fichas: el sitemap las lee de `site/patches/index.json` (`readSitemapData` en vite.config.ts), con la
 * fecha de su Crónica como `lastmod`.
 */
describe("Parches publicada", () => {
  const withPatches = {
    ...data,
    zb: { ...data.zb!, patches: patchIndex.patches.map(({ slug, version, date, updated }) => ({ slug, version, date, updated })) },
  } as SitemapData;

  it("está en PZ_PUBLISHED", () => {
    expect(PZ_PUBLISHED).toContain("patches");
    expect(parseRoute("/es/project-zomboid/parches/42-21")).toMatchObject({ view: "zomboid", pzSection: "patches", detail: "42-21" });
  });

  it("el sitemap tiene la lista y cada versión, en los dos idiomas", () => {
    const paths = sitemapPaths(withPatches);
    expect(paths).toContain("/es/project-zomboid/parches");
    expect(paths).toContain("/en/project-zomboid/patches");
    expect(paths).toContain("/en/project-zomboid/patches/42-20");
    expect(paths).toContain("/es/project-zomboid/parches/42-21");
    expect(paths.filter((p) => /\/project-zomboid\/(patches|parches)\/./.test(p))).toHaveLength(2 * patchIndex.patches.length);
  });

  it("el lastmod de una versión es la fecha de su Crónica, y el de la lista la más nueva", () => {
    expect(sitemapLastmod("/es/project-zomboid/parches/42-21", withPatches)).toBe(chronicle21.updated ?? chronicle21.date);
    const newest = patchIndex.patches.map((p) => p.updated ?? p.date).sort().at(-1);
    expect(sitemapLastmod("/en/project-zomboid/patches", withPatches)).toBe(newest);
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/parches/42-21"))).toEqual(["src/Zomboid.tsx", "src/zomboid/patches/ZomboidPatches.tsx"]);
  });

  it("el prerender de la página trae la versión entera, con la solapa de Parches marcada", async () => {
    const route = parseRoute("/es/project-zomboid/parches/42-21");
    await preloadTab(route);
    const html = await renderApp(route);
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>42\.21<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/parches"[^>]*aria-current="page"[^>]*>Parches</);
  });

  it("la portada enlaza la pestaña", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toContain('href="/es/project-zomboid/parches" class="pz-tool-link">Qué cambió en cada parche</a>');
  });
});

/**
 * La guarda del prerender (2026-09-30): ninguna ficha publicada sale con la hoja de "cargando…". Una por cada archivo de
 * fichas (100 de objetos y 100 de recetas), con `renderApp` como el build: si una ficha cayera en un archivo que no se
 * pide, o una pestaña nueva no esperara sus datos en `preloadZomboid`, la página saldría sin un dato ni un enlace. El
 * build además corta si pasa (`prerenderRoutes` en vite.config.ts). Va al final: baja todos los archivos, y los tests de
 * `preloadTab` de arriba necesitan que alguno no haya llegado.
 */
describe("ninguna ficha se prerenderiza «cargando…»", () => {
  const onePerShard = (sec: PzTab) => {
    const byShard = new Map<string, { id: string; es: string }>();
    for (const e of INDEX) if (e.sec === sec && !byShard.has(pzShard(e.id))) byShard.set(pzShard(e.id), e);
    return [...byShard.values()];
  };

  it.each(["items", "recipes"] as const)("una ficha de %s por archivo, entera", async (sec) => {
    const fichas = onePerShard(sec);
    expect(fichas).toHaveLength(PZ_SHARDS);
    for (const f of fichas) {
      const path = routePath({ ...parseRoute("/es/project-zomboid"), pzSection: sec, detail: f.id });
      const html = await renderApp(parseRoute(path));
      expect(html, path).not.toContain('class="pz-loading"');
      expect(html, path).toContain(`<h1 class="pzi-h1"`);
    }
  });
});
