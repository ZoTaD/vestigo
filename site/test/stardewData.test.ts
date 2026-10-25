import { readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import ItemList from "../src/stardew/items/ItemList";
import ItemPage from "../src/stardew/items/ItemPage";
import VillagerList from "../src/stardew/villagers/VillagerList";
import VillagerPage from "../src/stardew/villagers/VillagerPage";
import { routePath, type Route } from "../src/route";
import {
  filterRows,
  filterVillagers,
  giftIdeas,
  loadBundles,
  loadItem,
  loadList,
  loadVillagers,
  machineTime,
  peekItem,
  peekList,
  preloadItemsRoute,
  readFilters,
  readVillagerFilters,
  writeVillagerFilters,
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

  it("la lista trae los 885 objetos con su nombre en el idioma pedido", async () => {
    const en = await loadList("en");
    const es = await loadList("es");
    expect(en).toHaveLength(885);
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
    expect(html).toContain('href="/es/stardew-valley/centro-comunitario#pantry"');
    expect(html).toContain("Se transforma en");
    expect(html).toContain("Vino de Melón");
    expect(html).toContain('href="/es/stardew-valley/objetos/barril"');
    expect(html).toContain('href="/es/stardew-valley/objetos/pastel-rosa"');
    expect(html).toContain('href="/es/stardew-valley/objetos/semillas-de-melon"');
    expect(html).toContain("12 días hasta la cosecha");
    // La imagen grande va sin `lazy`; el resto, con.
    expect(html).toMatch(/<img[^>]*src="\/stardew\/items\/254.png"(?![^>]*loading)[^>]*>/);
  });

  it("la ficha son dos cajas del menú (maqueta A) y los cruces van en el orden de la consigna", async () => {
    const ficha = (await loadItem("melon"))!;
    const html = inLang("es", createElement(ItemPage, { ficha, route: { lang: "es", view: "stardew", sdSection: "items" } as Route, navigate: nav }));
    expect(html.match(/class="sd-box[ "]/g) ?? []).toHaveLength(2);
    const order = ["Le encanta a", "Le gusta a", "No le gusta a", "Centro Comunitario", "Se transforma en", "Se usa en", "Dónde se consigue"].map((h) => html.indexOf(`>${h}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Se fabrica con va entre Se usa en y Dónde se consigue.
    const cake = inLang("es", createElement(ItemPage, { ficha: (await loadItem("pink-cake"))!, route: { lang: "es", view: "stardew", sdSection: "items" } as Route, navigate: nav }));
    expect(cake.indexOf(">Se fabrica con<")).toBeGreaterThan(cake.indexOf(">No le gusta a<"));
  });

  it("los rótulos de gustos van en singular, como en la consigna", async () => {
    const { STARDEW_COPY } = await import("../src/stardewCopy");
    expect(STARDEW_COPY.es.items.tasteHeads).toEqual({ love: "Le encanta a", like: "Le gusta a", dislike: "No le gusta a", hate: "Lo odia" });
    expect(STARDEW_COPY.en.items.tasteHeads.hate).toBe("Hated by");
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

  // Los cruces de la etapa 4: Granja, Museo, Misiones e Isla. Las anclas son el slug de la fila en cada pestaña.
  const page = async (lang: "en" | "es", slug: string) =>
    inLang(lang, createElement(ItemPage, { ficha: (await loadItem(slug))!, route: { lang, view: "stardew", sdSection: "items", detail: slug } as Route, navigate: nav }));

  it("el huevo dice qué animal lo produce, enlazado a su fila en Granja", async () => {
    const en = await page("en", "egg");
    expect(en).toContain(">Produced by<");
    expect(en).toContain('href="/en/stardew-valley/farm#white-chicken"');
    // Con el sprite del animal adulto, a tamaño fijo.
    expect(en).toContain('src="/stardew/animals/white-chicken.png" alt="" width="64" height="64" loading="lazy"');
    expect(en).toContain("White Chicken");
    const es = await page("es", "large-egg");
    expect(es).toContain('href="/es/stardew-valley/granja#white-chicken"');
    expect(es).toContain("Gallina blanca");
    expect(es).toContain("con mucha amistad");
  });

  it("la madera dice qué edificios la piden, con cuánta", async () => {
    const en = await page("en", "wood");
    expect(en).toContain(">Used to build<");
    // En la vista de Edificios de la Granja, en la fila del corral.
    expect(en).toContain('href="/en/stardew-valley/farm?v=buildings#coop"');
    expect(en).toMatch(/<b>Coop<\/b>.*?× 300/);
    const es = await page("es", "wood");
    expect(es).toContain(">Para construir<");
    expect(es).toContain("Corral");
  });

  it("el museo: se dona (enlaza a su casillero), y el premio sin ficha va con su dibujo a la fila del premio", async () => {
    const en = await page("en", "chicken-statue");
    expect(en).toContain(">Museum<");
    expect(en).toContain("Donate it to the museum");
    // "Se dona al museo" lleva a su casillero en la Colección.
    expect(en).toContain('href="/en/stardew-valley/museum#chicken-statue"');
    // El premio es un mueble, (F)1305: con su dibujo y su nombre, enlazado a la fila del premio en el Museo.
    expect(en).toContain('href="/en/stardew-valley/museum?v=rewards#reward-chicken"');
    // A escala entera con tamaño fijo: 16×32 a 2× en la caja de 64 px.
    expect(en).toMatch(/<img[^>]*src="\/stardew\/rewards\/f-1305.png"[^>]*width="32" height="64"[^>]*><\/span><span><b>Chicken Statue<\/b>/);
    expect(en).not.toContain("(F)1305");
    expect(en).not.toContain("F)1305.png");
    const es = await page("es", "chicken-statue");
    expect(es).toContain('href="/es/stardew-valley/museo#chicken-statue"');
    // Los rollos enanos dan la guía, que sí tiene ficha.
    const rollo = await page("en", "dwarf-scroll-i");
    expect(rollo).toContain('href="/en/stardew-valley/items/dwarvish-translation-guide"');
  });

  it("un premio del museo enlaza a su fila en la vista de premios", async () => {
    const en = await page("en", "dwarvish-translation-guide");
    expect(en).toContain('href="/en/stardew-valley/museum?v=rewards#reward-dwarf"');
    expect(en).toContain("Dwarf Scroll I");
    const es = await page("es", "dwarvish-translation-guide");
    expect(es).toContain('href="/es/stardew-valley/museo?v=rewards#reward-dwarf"');
  });

  it("lo piden: los pedidos y misiones, enlazados a Misiones", async () => {
    const en = await page("en", "bug-meat");
    expect(en).toContain(">Requested by<");
    expect(en).toContain('href="/en/stardew-valley/quests#willy"');
    expect(en).toContain("Juicy Bugs Wanted!");
    const es = await page("es", "bug-meat");
    expect(es).toContain(">Lo piden<");
    expect(es).toContain('href="/es/stardew-valley/misiones#willy"');
  });

  it("el premio de un pedido y la tienda que no cobra en oro", async () => {
    const maquina = await page("en", "sewing-machine");
    expect(maquina).toContain('href="/en/stardew-valley/quests#emily"');
    const flauta = await page("en", "horse-flute");
    expect(flauta).toContain("Qi&#x27;s Walnut Room");
    // 50 gemas de Qi: la cifra con el sprite de la gema y su nombre, nada de "g".
    expect(flauta).toMatch(/50<img[^>]*src="\/stardew\/items\/858.png"[^>]*><small>Qi Gem<\/small>/);
    const gema = await page("en", "qi-gem");
    expect(gema).toContain('href="/en/stardew-valley/island#qichallenge2"');
    expect(gema).toMatch(/src="\/stardew\/items\/73.png"/);
    expect(gema).not.toContain("{0}");
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
    expect(html).toContain("885 items");
    // Los casilleros de más allá de la primera tanda van sin imagen en el prerender.
    expect((html.match(/<img/g) ?? []).length).toBeLessThanOrEqual(120);
  });
});

describe("aldeanos", () => {
  const abigail = async () => (await loadVillagers()).find((x) => x.key === "Abigail")!;

  it("Abigail tiene cumpleaños, se puede cortejar y le encanta la calabaza", async () => {
    const v = await abigail();
    expect(v.birthday).toEqual([2, 13]);
    expect(v.romance).toBe(true);
    expect(v.tastes.love).toContain("276");
  });

  it("al cargarlos se anotan los slugs en español de las direcciones", async () => {
    await loadVillagers();
    expect(routePath({ lang: "es", view: "stardew", sdSection: "villagers", detail: "wizard" } as Route)).toBe("/es/stardew-valley/aldeanos/rasmodius");
    expect(routePath({ lang: "en", view: "stardew", sdSection: "villagers", detail: "wizard" } as Route)).toBe("/en/stardew-valley/villagers/wizard");
  });

  it("regalos fáciles: lo que le encanta y se cultiva o se compra", async () => {
    const rows = await loadList("en");
    const easy = giftIdeas(await abigail(), rows).map((r) => r.id);
    expect(easy).toContain("276");
    // Todos le encantan y tienen una fuente que el jugador controla.
    const loved = (await abigail()).tastes.love;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of easy) {
      expect(loved).toContain(id);
      expect(byId.get(id)!.has & (16 | 32)).toBeGreaterThan(0);
    }
    // Lo que sólo se obtiene de otra forma (un libro del botín) queda fuera.
    expect(easy).not.toContain("Book_Void");
  });

  it("filtros: cortejables y estación del cumpleaños, también en la dirección", async () => {
    const all = await loadVillagers();
    const romance = filterVillagers(all, { romance: true, season: null });
    expect(romance.every((v) => v.romance)).toBe(true);
    expect(romance.some((v) => v.key === "Abigail")).toBe(true);
    const fall = filterVillagers(all, { romance: false, season: 2 });
    expect(fall.every((v) => v.birthday[0] === 2)).toBe(true);
    expect(fall.some((v) => v.key === "Abigail")).toBe(true);
    expect(filterVillagers(all, { romance: false, season: null })).toHaveLength(34);
    expect(readVillagerFilters("?romance=1&season=3")).toEqual({ romance: true, season: 3 });
    expect(readVillagerFilters("?season=9&romance=x")).toEqual({ romance: false, season: null });
    expect(writeVillagerFilters({ romance: true, season: 3 })).toBe("?romance=1&season=3");
    expect(writeVillagerFilters({ romance: false, season: null })).toBe("");
  });

  it("la lista dibuja los 34 retratos enlazados, con el cumpleaños", async () => {
    const villagers = await loadVillagers();
    const route = { lang: "es", view: "stardew", sdSection: "villagers" } as Route;
    const html = inLang("es", createElement(VillagerList, { villagers, route, navigate: nav, missing: false }));
    expect(html).toContain('href="/es/stardew-valley/aldeanos/abigail"');
    expect(html).toContain("/stardew/portraits/abigail.png");
    expect(html).toContain("Otoño 13");
    expect(html).toContain("Cortejables");
    expect(html.match(/<img/g) ?? []).toHaveLength(34);
  });

  it("la ficha de Abigail: dos cajas, regalos fáciles arriba y las cuatro filas de gustos", async () => {
    const rows = await loadList("es");
    const villager = await abigail();
    const route = { lang: "es", view: "stardew", sdSection: "villagers", detail: "abigail" } as Route;
    const html = inLang("es", createElement(VillagerPage, { villager, rows, route, navigate: nav }));
    expect(html).toMatch(/<h1[^>]*>Abigail<\/h1>/);
    expect(html).toContain("Otoño 13");
    expect(html).toContain("Pueblo Pelícano");
    expect(html.match(/class="sd-box[ "]/g) ?? []).toHaveLength(2);
    const order = ["Regalos fáciles", "Le encanta", "Le gusta", "No le gusta", "Lo odia"].map((h) => html.indexOf(`>${h}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // La calabaza (Pumpkin) enlazada a su ficha de Objetos, con el nombre del juego.
    expect(html).toContain('href="/es/stardew-valley/objetos/calabaza"');
    // El retrato grande va sin `lazy`.
    expect(html).toMatch(/<img[^>]*src="\/stardew\/portraits\/abigail.png"(?![^>]*loading)[^>]*>/);
  });

  it("un aldeano que no se corteja no dice que se pueda cortejar, y el que no tiene región conocida no la muestra", async () => {
    const rows = await loadList("en");
    const krobus = (await loadVillagers()).find((x) => x.key === "Krobus")!;
    const html = inLang("en", createElement(VillagerPage, { villager: krobus, rows, route: { lang: "en", view: "stardew", sdSection: "villagers", detail: "krobus" } as Route, navigate: nav }));
    expect(html).not.toContain("Romanceable");
    expect(html).not.toContain("Other");
  });
});
