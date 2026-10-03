/**
 * La pestaña Parches de Project Zomboid (2026-10-02), dibujada como la escribe el prerender (`renderApp`): la lista de
 * versiones, la página de cada una con los datos de verdad (la 42.21, primera guardada, y la 42.20, anterior) y, con
 * una página inventada, el diff campo por campo: hasta la 42.22 no hay ningún diff de verdad.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import pzIndex from "../../games/zomboid/data/index.json";
import chronicle20 from "../../games/zomboid/data/patches/chronicle/42-20.json";
import chronicle21 from "../../games/zomboid/data/patches/chronicle/42-21.json";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { parseRoute, registerPzSlugs, type PzTab } from "../src/route";
import { preloadTab } from "../src/Zomboid";
import { primePatch, type PatchPage } from "../src/zomboid/patches/data";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];

beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

/** Un tramo de 40 letras de un texto, sin comillas ni `&`: el HTML los escapa y no se encontrarían tal cual. */
function fragment(text: string): string {
  for (let i = 0; i + 40 <= text.length; i++) {
    const s = text.slice(i, i + 40);
    if (!/["'&<>]/.test(s)) return s;
  }
  throw new Error(`sin un tramo limpio en: ${text}`);
}

async function render(path: string): Promise<string> {
  const route = parseRoute(path);
  await preloadTab(route);
  return renderApp(route);
}

describe("la lista de versiones", () => {
  it("trae cada versión enlazada, con su resumen, sin «cargando…»", async () => {
    const html = await render("/es/project-zomboid/parches");
    expect(html).toContain("Notas del parche");
    expect(html).toContain("42.21");
    expect(html).toContain("42.20");
    expect(html).toContain('href="/es/project-zomboid/parches/42-21"');
    expect(html).toContain('href="/es/project-zomboid/parches/42-20"');
    expect(html).toContain(fragment(chronicle21.summary.es));
    expect(html).not.toContain("pz-loading");
  });

  it("una versión que no existe muestra la lista con su nota", async () => {
    const html = await render("/es/project-zomboid/parches/41-78");
    expect(html).toContain("No encontramos esa versión");
    expect(html).toContain('href="/es/project-zomboid/parches/42-21"');
    expect(html).not.toContain("pz-loading");
  });
});

describe("la página de una versión", () => {
  it("la 42.21: resumen, highlights, fuentes y la primera guardada", async () => {
    const html = await render("/es/project-zomboid/parches/42-21");
    expect(html).toContain(fragment(chronicle21.summary.es));
    expect(html).toContain(fragment(chronicle21.highlights[0].es));
    expect(html).toMatch(/href="https:\/\/(theindiestone\.com|store\.steampowered\.com)\/[^"]*" rel="noopener"/);
    expect(html).toContain("Es la primera versión que guardamos completa");
    expect(html).toContain("4.878");
    expect(html).toContain("llegó a Unstable el");
    expect(html).toContain('href="/es/project-zomboid/parches"');
    expect(html).not.toContain("pz-loading");
  });

  it("la 42.20 en inglés: su resumen, sus hotfixes y que es anterior a la primera guardada", async () => {
    const html = await render("/en/project-zomboid/patches/42-20");
    expect(html).toContain(fragment(chronicle20.summary.en));
    expect(html).toContain("This patch is older than 42.21");
    expect(html).toContain("42.20.1");
    expect(html).not.toContain("pz-loading");
  });
});

/** La página sintética de la Task 3 (42.21 → 42.22): un tenedor nuevo, la cuchara quitada, el hacha más fuerte… */
const FAKE: PatchPage = {
  slug: "42-22",
  version: "42.22",
  date: "2026-11-02",
  hotfixes: 0,
  recorded: true,
  counts: {
    items: { added: 1, removed: 1, changed: 1 },
    recipes: { added: 0, removed: 0, changed: 1 },
    traits: { added: 0, removed: 0, changed: 1 },
    sandbox: { added: 0, removed: 0, changed: 1 },
  },
  highlights: [],
  sources: [],
  hotfixList: [],
  diff: {
    from: "42.21",
    fromSlug: "42-21",
    kinds: {
      items: {
        added: [{ id: "Base.Fork", n: { en: "Fork", es: "Tenedor" }, slug: "fork" }],
        removed: [{ id: "Base.Spoon", n: { en: "Spoon", es: "Cuchara" } }],
        changed: [
          {
            id: "Base.Axe",
            n: { en: "Axe", es: "Hacha" },
            slug: "axe",
            fields: [
              { f: "stats.maxDamage", b: 2, a: 2.2 },
              { f: "tags", add: ["base:fireaxe"] },
              { f: "stats.conditionLowerChanceOneInX", b: 1, a: 2 },
            ],
          },
        ],
      },
      recipes: {
        added: [],
        removed: [],
        changed: [
          {
            id: "MakeStake",
            n: { en: "Make Stake", es: "Hacer estaca" },
            slug: "make-stake",
            fields: [
              { f: "inputs", add: ["1× Base.TreeBranch2"], rem: ["1× Base.Plank|Base.TreeBranch2"] },
              { f: "time", b: 50, a: 40 },
            ],
          },
        ],
      },
      traits: {
        added: [],
        removed: [],
        changed: [
          {
            id: "strong",
            n: { en: "Strong", es: "Fuerte" },
            slug: "strong",
            fields: [
              { f: "cost", b: 10, a: 8 },
              { f: "exclusive", add: ["weak"] },
            ],
          },
        ],
      },
      sandbox: {
        added: [],
        removed: [],
        changed: [{ id: "WaterShutModifier", n: { en: "WaterShutModifier", es: "WaterShutModifier" }, fields: [{ f: "default", b: 14, a: 30 }] }],
      },
    },
  },
  names: {
    "Base.Plank": { en: "Plank", es: "Tablón" },
    "Base.TreeBranch2": { en: "Branch", es: "Rama" },
    weak: { en: "Weak", es: "Débil" },
  },
};

describe("el diff, con una página inventada", () => {
  it("cada tipo con sus nuevos, quitados y cambiados, enlazados a su ficha", async () => {
    primePatch("42-22", FAKE);
    const html = await render("/es/project-zomboid/parches/42-22");
    expect(html).not.toContain("pz-loading");
    expect(html).toContain("Objetos");
    expect(html).toContain("Nuevos (1)");
    expect(html).toContain("Quitados (1)");
    expect(html).toContain("Cambiados (1)");
    // El tenedor tiene ficha: enlace. La cuchara ya no existe: texto.
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/objetos\/[^"]+"[^>]*>Tenedor<\/a>/);
    expect(html).toContain("Cuchara");
    expect(html).not.toMatch(/>Cuchara<\/a>/);
    expect(html).toContain("Daño máximo");
    expect(html).toContain(">2,2<");
    expect(html).toContain("sube");
    expect(html).toContain("baja");
    expect(html).toContain("+ base:fireaxe");
    expect(html).toContain("Ingredientes y herramientas");
    expect(html).toContain("1× Rama");
    expect(html).toContain("Tablón o Rama");
    expect(html).toContain("+ Débil");
    expect(html).toContain("Opciones de sandbox");
    expect(html).toContain("WaterShutModifier");
    expect(html).toContain("Valor por defecto");
    // Una clave sin etiqueta va cruda, partida en su punto.
    expect(html).toContain("<code>stats.<wbr/>conditionLowerChanceOneInX</code>");
    // Comparada con la 42.21, enlazada.
    expect(html).toContain('href="/es/project-zomboid/parches/42-21"');
  });
});

/** Lo que el contrato de site.py prevé y hoy no tiene datos de verdad: un hotfix con página y una versión sin cambios. */
const BARE: PatchPage = {
  slug: "42-23",
  version: "42.23",
  date: "2026-12-01",
  hotfixes: 0,
  recorded: true,
  highlights: [],
  sources: [],
  hotfixList: [],
  names: {},
};

describe("los casos sin datos de verdad", () => {
  it("un hotfix con página enlaza a su versión", async () => {
    primePatch("42-21-1", { ...BARE, slug: "42-21-1", version: "42.21.1", date: "2026-09-30", hotfixOf: "42-21" });
    const html = await render("/es/project-zomboid/parches/42-21-1");
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/parches\/42-21"[^>]*>Hotfix de la 42\.21<\/a>/);
  });

  it("comparada y sin cambios de datos: lo dice, y nunca «anterior»", async () => {
    primePatch("42-23", BARE);
    const html = await render("/es/project-zomboid/parches/42-23");
    expect(html).not.toContain("pz-loading");
    expect(html).toContain("La comparamos con la versión anterior y no cambió ningún dato");
    expect(html).not.toContain("Este parche es anterior");
    expect(html).not.toContain("Es la primera versión que guardamos completa");
  });

  it("dos anuncios de Steam en la misma versión llevan su número", async () => {
    const html = await render("/es/project-zomboid/parches/42-21");
    const steam = chronicle21.sources.filter((s) => s.kind === "steam").length;
    expect(steam).toBe(2);
    expect(html).toContain(">Anuncio en Steam (1)<");
    expect(html).toContain(">Anuncio en Steam (2)<");
    expect(html).toContain(">Notas completas de The Indie Stone<");
  });
});

describe("el CSS", () => {
  it("sin bordes de color ni palabras cortadas", () => {
    const css = readFileSync(new URL("../src/styles/zomboid-patches.css", import.meta.url), "utf-8");
    expect(css).not.toContain("border-left");
    expect(css).not.toContain("border-color");
    expect(css).not.toContain("overflow-wrap: anywhere");
  });
});
