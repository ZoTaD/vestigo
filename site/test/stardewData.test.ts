import { readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import ItemList from "../src/stardew/items/ItemList";
import ItemPage from "../src/stardew/items/ItemPage";
import { routePath, type Route } from "../src/route";
import {
  filterRows,
  loadBundles,
  loadItem,
  loadList,
  loadVillagers,
  machineTime,
  peekItem,
  peekList,
  preloadItemsRoute,
  readFilters,
  SD_SHARDS,
  say,
} from "../src/stardew/data";

const dir = new URL("../../games/stardew/data/site/items/", import.meta.url);

describe("datos de Stardew Valley", () => {
  it("SD_SHARDS es el CHUNKS de site_data.py", () => expect(SD_SHARDS).toBe(64));

  it("hay exactamente SD_SHARDS archivos de fichas", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(SD_SHARDS);
  });

  it("la ficha del melón trae precios, regalos, paquetes y máquinas", async () => {
    const f = await loadItem("melon");
    expect(f!.prices.base).toEqual([250, 312, 375, 500]);
    expect(f!.prices.pro.tiller).toEqual([275, 343, 412, 550]);
    expect(f!.tastes.love).toContain("Penny");
    expect(f!.bundles.length).toBe(2);
    expect(f!.machines.in.map((m) => m.machine)).toContain("(BC)12");
  });

  it("abre en frío una ficha en español", async () => {
    await preloadItemsRoute({ lang: "es", view: "stardew", sdSection: "items", detail: "pastel-rosa" } as Route);
    expect(peekItem("pink-cake")).toBeTruthy();
    // Y la dirección queda anotada: se escribe de nuevo con el slug en español.
    expect(routePath({ lang: "es", view: "stardew", sdSection: "items", detail: "pink-cake" } as Route)).toBe("/es/stardew-valley/objetos/pastel-rosa");
  });

  it("un objeto sin relaciones no tiene listas", async () => {
    // La Baya gema dulce: ningún aldeano tiene gusto especial y no va en paquetes (medido el 22/10).
    const f = await loadItem("sweet-gem-berry");
    expect(f!.tastes).toEqual({});
    expect(f!.bundles).toEqual([]);
  });

  it("una ficha que no existe es null, y su dirección cae en la lista", async () => {
    expect(await loadItem("no-existe")).toBeNull();
    await preloadItemsRoute({ lang: "en", view: "stardew", sdSection: "items", detail: "no-existe" } as Route);
    expect(peekList("en")).toBeTruthy();
  });

  it("una ficha con paquetes deja bajados los nombres de las salas", async () => {
    await preloadItemsRoute({ lang: "en", view: "stardew", sdSection: "items", detail: "melon" } as Route);
    const salas = await loadBundles();
    expect(salas.find((s) => s.room === "Pantry")!.name).toEqual(["Pantry", expect.any(String)]);
  });

  it("los aldeanos traen su clave y su slug", async () => {
    const v = await loadVillagers();
    expect(v.find((x) => x.key === "Penny")).toMatchObject({ slug: "penny" });
  });

  it("la lista trae los 888 objetos con su nombre en el idioma pedido", async () => {
    const en = await loadList("en");
    const es = await loadList("es");
    expect(en).toHaveLength(888);
    expect(en.find((r) => r.slug === "melon")).toMatchObject({ id: "254", name: "Melon", cat: -79, price: 250 });
    expect(es.find((r) => r.slug === "melon")!.name).toBe("Melón");
    // Los objetos con id de texto también.
    expect(en.some((r) => r.id === "SkillBook_4")).toBe(true);
  });

  it("say elige el idioma y cae al inglés si falta el español", () => {
    expect(say(["Melon", "Melón"], "es")).toBe("Melón");
    expect(say(["Melon", ""], "es")).toBe("Melon");
    expect(say(["Melon", "Melón"], "en")).toBe("Melon");
  });
});

describe("filtros de la lista", () => {
  it("se leen de la dirección y descartan lo que no conocen", () => {
    expect(readFilters("?cat=crops&from=fished")).toEqual({ group: "crops", source: "fished" });
    expect(readFilters("?cat=nada&from=")).toEqual({ group: null, source: null });
    expect(readFilters("")).toEqual({ group: null, source: null });
  });

  it("filtran por grupo, por fuente y por nombre sin acentos", async () => {
    const rows = await loadList("es");
    const crops = filterRows(rows, { group: "crops", source: null }, "");
    expect(crops.every((r) => [-75, -79, -80].includes(r.cat))).toBe(true);
    expect(crops.some((r) => r.slug === "melon")).toBe(true);
    expect(filterRows(rows, { group: "machines", source: null }, "").every((r) => r.id.startsWith("(BC)"))).toBe(true);
    const fished = filterRows(rows, { group: null, source: "fished" }, "");
    expect(fished.some((r) => r.slug === "pufferfish")).toBe(true);
    expect(fished.some((r) => r.slug === "melon")).toBe(false);
    expect(filterRows(rows, { group: null, source: "bundle" }, "melon").map((r) => r.slug)).toEqual(["melon"]);
  });
});

describe("tiempo de las máquinas", () => {
  it("minutos de juego en horas o días (1.440 minutos por día)", () => {
    expect(machineTime(180, 0)).toEqual({ unit: "h", n: 3, approx: false });
    expect(machineTime(10000, 0)).toEqual({ unit: "d", n: 7, approx: true });
    expect(machineTime(4320, 0)).toEqual({ unit: "d", n: 3, approx: false });
    expect(machineTime(30, 0)).toEqual({ unit: "m", n: 30, approx: false });
    expect(machineTime(0, 1)).toEqual({ unit: "d", n: 1, approx: false });
    expect(machineTime(0, 0)).toBeNull();
  });
});

const inLang = (lang: "en" | "es", el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const nav = () => undefined;

describe("la ficha de un objeto", () => {
  it("el melón en español: precios, Labrador, regalos, paquetes, máquinas, recetas y cultivo", async () => {
    await preloadItemsRoute({ lang: "es", view: "stardew", sdSection: "items", detail: "melon" } as Route);
    const ficha = (await loadItem("melon"))!;
    const route = { lang: "es", view: "stardew", sdSection: "items", detail: "melon" } as Route;
    const html = inLang("es", createElement(ItemPage, { ficha, route, navigate: nav }));
    expect(html).toMatch(/<h1[^>]*>Melón<\/h1>/);
    expect(html).toContain("Un capricho fresco y dulce de verano.");
    expect(html).toContain("Labrador");
    expect(html).toContain("Le encanta a");
    expect(html).toContain('href="/es/stardew-valley/aldeanos/penny"');
    expect(html).toContain("/stardew/portraits/penny.png");
    expect(html).toContain("Centro Comunitario");
    expect(html).toContain('href="/es/stardew-valley/centro-comunitario"');
    expect(html).toContain("Se transforma en");
    expect(html).toContain("Vino de Melón");
    expect(html).toContain('href="/es/stardew-valley/objetos/barril"');
    expect(html).toContain('href="/es/stardew-valley/objetos/pastel-rosa"');
    expect(html).toContain('href="/es/stardew-valley/objetos/semillas-de-melon"');
    expect(html).toContain("12 días hasta la cosecha");
    // La imagen grande va sin `lazy`; el resto, con.
    expect(html).toMatch(/<img[^>]*src="\/stardew\/items\/254.png"(?![^>]*loading)[^>]*>/);
  });

  it("un objeto sin relaciones no muestra secciones vacías", async () => {
    const ficha = (await loadItem("sweet-gem-berry"))!;
    const route = { lang: "en", view: "stardew", sdSection: "items", detail: "sweet-gem-berry" } as Route;
    const html = inLang("en", createElement(ItemPage, { ficha, route, navigate: nav }));
    for (const head of ["Loved by", "Liked by", "Disliked by", "Hated by", "Community Center", "Turns into", "Comes out of", "Used in", "Recipe"]) {
      expect(html, head).not.toContain(`>${head}<`);
    }
    expect(html).toContain("Where to get it");
  });

  it("una máquina sin fuentes ni usos muestra sólo la cabecera y los precios", async () => {
    const ficha = (await loadItem("wood-chair"))!;
    const html = inLang("en", createElement(ItemPage, { ficha, route: { lang: "en", view: "stardew", sdSection: "items" } as Route, navigate: nav }));
    expect(html).not.toContain("Where to get it");
    expect(html.match(/<h2/g) ?? []).toHaveLength(1);
  });
});

describe("la lista de objetos", () => {
  it("dibuja casilleros enlazados a cada ficha, con el nombre para leer", async () => {
    const rows = await loadList("en");
    const html = inLang("en", createElement(ItemList, { rows, route: { lang: "en", view: "stardew", sdSection: "items" } as Route, navigate: nav, missing: false }));
    expect(html).toContain('href="/en/stardew-valley/items/melon"');
    expect(html).toContain(">Melon<");
    expect(html).toContain("888 items");
    // Los casilleros de más allá de la primera tanda van sin imagen en el prerender.
    expect((html.match(/<img/g) ?? []).length).toBeLessThanOrEqual(120);
  });
});
