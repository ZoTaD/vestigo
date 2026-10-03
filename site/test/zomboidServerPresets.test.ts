/**
 * Los presets de sandbox comparados (2026-10-02), `/servidor/presets-de-sandbox`: las filas (`presetRows`, puro) y la
 * página como la escribe el prerender, en español (abierta en frío) y en inglés, con su `<head>` y en el sitemap.
 *
 * Archivo aparte, como `zomboidColdLoadMoodles.test.ts`: el primer test abre la dirección en español antes de que nadie
 * haya anotado los slugs de la pestaña. Por eso acá no se importa de entrada nada que traiga `ZomboidServer.tsx` ni
 * `Zomboid.tsx` (su portada también los anota).
 */
import { describe, expect, it } from "vitest";
import pzMeta from "../../games/zomboid/data/meta.json";
import pzIndex from "../../games/zomboid/data/index.json";
import { renderApp } from "../src/entry-server";
import { metaFor } from "../src/prerender";
import { parseRoute, type PzTab } from "../src/route";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { presetRows } from "../src/zomboid/server/config";
import { fullPreset, SERVER } from "../src/zomboid/server/data";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const ES_PATH = "/es/project-zomboid/servidor/presets-de-sandbox";
const EN_PATH = "/en/project-zomboid/server/sandbox-presets";
/** El texto sin los `<wbr>` de las claves largas. */
const plain = (html: string) => html.replace(/<wbr\/>/g, "");

describe("presetRows", () => {
  const rows = presetRows();

  it("las 153 opciones en las que algún preset difiere de otro, en el orden de las hojas", () => {
    expect(rows).toHaveLength(153);
    const order = SERVER.options.map((o) => o.key);
    const at = rows.map((r) => order.indexOf(r.key));
    expect(at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]))).toBe(true);
    for (const r of rows) expect(r.values, r.key).toEqual(SERVER.presets.map((p) => fullPreset(p.id)[r.key]));
  });

  it("los valores en el orden de los presets: Zombies, el corte del agua; StartDay no está", () => {
    expect(SERVER.presets.map((p) => p.id)).toEqual(["apocalypse", "outbreak", "extinction", "rising", "six-months-later"]);
    const by = new Map(rows.map((r) => [r.key, r.values]));
    expect(by.get("Zombies")).toEqual([4, 4, 3, 5, 1]);
    expect(by.get("WaterShutModifier")).toEqual([14, 14, 14, 14, -1]);
    expect(by.has("StartDay")).toBe(false);
    expect(SERVER.presets.every((p) => fullPreset(p.id).StartDay === 9)).toBe(true);
  });
});

describe("la página", () => {
  it("en español, abierta en frío: los cinco presets, Número de zombies con sus etiquetas y las cifras", async () => {
    // `main.tsx` lee la dirección antes de que la pestaña anote sus slugs: llega `detail: "presets-de-sandbox"`.
    expect(parseRoute(ES_PATH)).toMatchObject({ pzSection: "server", detail: "presets-de-sandbox" });
    // `Zomboid.tsx` se importa recién acá: su portada anota los slugs del Servidor al cargarse (enlaza dos fichas), y con
    // un import de arriba la dirección ya llegaría traducida.
    const { preloadTab } = await import("../src/Zomboid");
    await preloadTab(parseRoute(ES_PATH));
    expect(parseRoute(ES_PATH)).toMatchObject({ pzSection: "server", detail: "sandbox-presets" });

    const html = plain(await renderApp(parseRoute(ES_PATH)));
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Presets de sandbox de Project Zomboid<\/h1>/);
    expect(html).not.toContain("No encontramos");
    expect(html).not.toContain("pz-loading");
    expect(html).not.toMatch(/archivos del juego|sacad[oa] de/i);
    // El breadcrumb: Servidor › Presets de sandbox.
    expect(html).toMatch(/<nav class="pzi-crumb"[^>]*><a href="\/es\/project-zomboid\/servidor"[^>]*>Servidor<\/a>/);
    expect(html).toMatch(/›[\s\S]{0,80}Presets de sandbox/);
    for (const p of SERVER.presets) expect(html, p.id).toContain(p.name.es);
    expect(html).toContain("153 de 269");
    // La fila de Zombies, hasta la siguiente: el nombre del juego y las etiquetas de cada preset.
    const row = html.match(/data-key="Zombies">([\s\S]*?)<\/tr>/)?.[1] ?? "";
    expect(row).toContain("Número de zombies");
    for (const label of ["Normal", "Alto", "Bajo", "Zombicidio"]) expect(row, label).toContain(`>${label}<`);
    // Con el filtro prendido, sólo las 153; Fecha de inicio (9 en los cinco) no está.
    expect(html.match(/<tr class="pzsp-row[^"]*" data-key=/g)).toHaveLength(153);
    expect(html).not.toContain('data-key="StartDay"');
    // Lo que difiere de Apocalipsis va con tinte: en Zombies, Extinción, En ascenso y 6 meses después.
    expect(row.match(/class="pzsp-cell is-diff"/g)).toHaveLength(3);
    // Debajo de cada preset, el link al generador con el preset puesto.
    for (const p of SERVER.presets) expect(html, p.id).toContain(`href="/es/project-zomboid/servidor?p=${p.id}"`);
    expect(html).toContain("Usarlo en el generador");
  });

  it("en inglés", async () => {
    const html = plain(await renderApp(parseRoute(EN_PATH)));
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Sandbox Presets<\/h1>/);
    for (const p of SERVER.presets) expect(html, p.id).toContain(p.name.en);
    expect(html).toContain("153 of 269");
    const row = html.match(/data-key="Zombies">([\s\S]*?)<\/tr>/)?.[1] ?? "";
    expect(row).toContain("Zombie Count");
    for (const label of ["Normal", "High", "Low", "Insane"]) expect(row, label).toContain(`>${label}<`);
    expect(html).toContain('href="/en/project-zomboid/server?p=outbreak"');
    expect(html).toContain("Use it in the generator");
  });

  it("el <head> es el de la ficha", () => {
    // El nombre de la ficha, del índice, como se lo pasa el prerender (`detailNames`).
    const entry = INDEX.find((e) => e.sec === "server" && e.id === "sandbox-presets")!;
    expect(metaFor(parseRoute(ES_PATH), "es", entry.es).title).toBe("Presets de sandbox en Project Zomboid (Build 42) | Vestigo");
    expect(metaFor(parseRoute(EN_PATH), "en", entry.en).title).toBe("Project Zomboid Sandbox Presets (Build 42) | Vestigo");
    expect(metaFor(parseRoute(ES_PATH), "es", entry.es).description).toContain("comparados opción por opción");
  });

  it("en el sitemap, en los dos idiomas", () => {
    const data = {
      dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
      zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, index: INDEX },
      dates: { zomboid: pzMeta.extractedAt },
    } as unknown as SitemapData;
    const paths = sitemapPaths(data);
    expect(paths).toContain(ES_PATH);
    expect(paths).toContain(EN_PATH);
  });
});
