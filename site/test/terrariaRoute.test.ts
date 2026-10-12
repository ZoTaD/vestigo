import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoute, registerTerrariaSlugs, routePath, TERRARIA_SECTION_ES, type Route } from "../src/route";
import { TR_SHARDS } from "../src/terraria/data";
import { isTrLoadingPage } from "../src/terraria/loadingGuard";
import { TERRARIA_COPY } from "../src/terrariaCopy";
import { pzShardOf } from "../src/zomboid/shard";

const base: Route = { lang: "en", view: "terraria", dlSection: "meta" };
const dir = new URL("../../games/terraria/data/site/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf-8"));

describe("rutas de Terraria", () => {
  it("las pestañas se escriben en su idioma y se leen en los dos", () => {
    expect(TERRARIA_SECTION_ES).toEqual({ items: "objetos", crafting: "crafteo", bosses: "jefes", npcs: "npc", fishing: "pesca", patches: "parches" });
    expect(routePath({ ...base, trSection: "home" })).toBe("/en/terraria");
    expect(routePath({ ...base, trSection: "items" })).toBe("/en/terraria/items");
    expect(routePath({ ...base, lang: "es", trSection: "crafting" })).toBe("/es/terraria/crafteo");
    expect(parseRoute("/es/terraria/objetos")).toMatchObject({ view: "terraria", trSection: "items", lang: "es" });
    expect(parseRoute("/es/terraria/items")).toMatchObject({ view: "terraria", trSection: "items" });
    expect(parseRoute("/en/terraria/crafteo")).toMatchObject({ view: "terraria", trSection: "crafting" });
  });

  it("una pestaña que no existe muestra la portada", () => {
    expect(parseRoute("/en/terraria/classes")).toMatchObject({ view: "terraria", trSection: "home" });
    expect(parseRoute("/en/terraria/classes").detail).toBeUndefined();
    expect(parseRoute("/es/terraria/pesca")).toMatchObject({ trSection: "fishing" });
    expect(parseRoute("/es/terraria/parches/1-4-5-8")).toMatchObject({ trSection: "patches", detail: "1-4-5-8" });
    expect(parseRoute("/es/terraria/jefes")).toMatchObject({ trSection: "bosses" });
    expect(parseRoute("/es/terraria/npc")).toMatchObject({ trSection: "npcs" });
  });

  it("la ficha va y vuelve entre idiomas con su slug de cada uno", () => {
    registerTerrariaSlugs({ items: { "terra-blade": "espada-terra" } });
    const en = parseRoute("/en/terraria/items/terra-blade");
    expect(en).toMatchObject({ trSection: "items", detail: "terra-blade" });
    expect(routePath({ ...en, lang: "es" })).toBe("/es/terraria/objetos/espada-terra");
    expect(parseRoute("/es/terraria/objetos/espada-terra").detail).toBe("terra-blade");
    // Un slug que no se conoce se deja como vino: la pestaña muestra la lista con el aviso.
    expect(parseRoute("/es/terraria/objetos/no-existe").detail).toBe("no-existe");
  });

  it("el árbol no tiene fichas: su objeto viaja en el #hash", () => {
    expect(parseRoute("/en/terraria/crafting/zenith").detail).toBeUndefined();
  });
});

describe("datos de Terraria: lo que escribe site_data.py coincide con lo que lee el sitio", () => {
  it("hay exactamente TR_SHARDS archivos de fichas y cada ficha está en el suyo", () => {
    const files = readdirSync(new URL("items/", dir)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(TR_SHARDS);
    let n = 0;
    for (const file of files) {
      for (const slug of Object.keys(read(`items/${file}`))) {
        expect(`${pzShardOf(slug, TR_SHARDS)}.json`, slug).toBe(file);
        n++;
      }
    }
    expect(n).toBe(read("list.json").length);
  });

  it("los nombres van alineados con la lista, y el mapa de español apunta a slugs que existen", () => {
    const rows: [number, string][] = read("list.json");
    expect(read("names-en.json")).toHaveLength(rows.length);
    const es: [string, string][] = read("names-es.json");
    expect(es).toHaveLength(rows.length);
    const slugs = new Set(rows.map((r) => r[1]));
    expect(existsSync(new URL("es/00.json", dir))).toBe(true);
    for (const file of readdirSync(new URL("es/", dir))) {
      for (const [slugEs, slugEn] of Object.entries(read(`es/${file}`) as Record<string, string>)) {
        expect(`${pzShardOf(slugEs, TR_SHARDS)}.json`, slugEs).toBe(file);
        expect(slugs.has(slugEn), slugEn).toBe(true);
        // El español de un objeto no puede ser el inglés de otro: la dirección se lee en los dos idiomas.
        expect(slugs.has(slugEs), slugEs).toBe(false);
      }
    }
  });

  it("valores conocidos del juego: la Zenith lleva diez espadas y la Terra Blade, tres", () => {
    const zenith = read(`items/${pzShardOf("zenith", TR_SHARDS)}.json`).zenith;
    expect(zenith.recipes[0][4]).toHaveLength(10);
    const terra = read(`items/${pzShardOf("terra-blade", TR_SHARDS)}.json`)["terra-blade"];
    expect(terra.recipes[0][4].map((i: number[]) => terra.refs[i[0]][2])).toEqual(["True Night's Edge", "True Excalibur", "Broken Hero Sword"]);
    expect(terra.stats.damage).toBe(85);
  });
});

describe("textos y guardia de Terraria", () => {
  it("títulos con la marca y descripciones de un largo razonable", () => {
    for (const lang of ["en", "es"] as const) {
      const c = TERRARIA_COPY[lang];
      const pages = [...Object.values(c.seo), c.patchSeo("1.4.5.8"), c.detailSeo("Terra Blade", { craft: true, uses: true, drops: true }), c.detailSeo("Dirt Block"), c.detailSeo("The Horseman's Blade", { drops: true })];
      for (const p of pages) {
        expect(p.title.endsWith("| Vestigo"), p.title).toBe(true);
        expect(p.description.length, p.description).toBeGreaterThanOrEqual(80);
        expect(p.description.length, p.description).toBeLessThanOrEqual(160);
      }
    }
  });

  it("la hoja de cargando se reconoce por su clase entera", () => {
    expect(isTrLoadingPage('<main class="tr-main tr-loading" aria-busy="true">')).toBe(true);
    expect(isTrLoadingPage('<div class="tr-loading-bar">')).toBe(false);
    expect(isTrLoadingPage('<main class="tr-main tr-items">')).toBe(false);
  });
});
