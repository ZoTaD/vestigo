/**
 * La pestaña Minas y combate de Stardew Valley (etapa 3, tarea 6): la dirección que guarda la vista, el orden de las
 * armas, la ficha de un monstruo en los dos idiomas, y el enlace de una ficha de Objetos a la del monstruo que la
 * suelta. Las pantallas se dibujan sin navegador, como el prerender.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/mines.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, type Route } from "../src/route";
import { STARDEW_COPY } from "../src/stardewCopy";
import { loadItem, loadMines } from "../src/stardew/data";
import ItemPage from "../src/stardew/items/ItemPage";
import MonsterPage from "../src/stardew/mines/MonsterPage";
import { MinesBook } from "../src/stardew/mines/StardewMines";
import {
  avgDamage,
  DEFAULT_MINES_STATE,
  findMonster,
  gearSprite,
  lootRows,
  monsterOrder,
  pixelScale,
  readMinesState,
  weaponList,
  writeMinesState,
  zoneChests,
  type MinesData,
  type MinesState,
} from "../src/stardew/mines/state";

const data = raw as unknown as MinesData;
const route = (lang: "en" | "es", detail?: string) => ({ lang, view: "stardew", sdSection: "mines", detail }) as Route;
const nav = () => undefined;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const book = (state: Partial<MinesState>, lang: "en" | "es" = "en") =>
  inLang(lang, createElement(MinesBook, { data, route: route(lang), navigate: nav, initial: { ...DEFAULT_MINES_STATE, ...state } }));

describe("la dirección de Minas y combate", () => {
  it("se abre en Pisos; el valor por defecto no se escribe", () => {
    expect(readMinesState("")).toEqual(DEFAULT_MINES_STATE);
    expect(writeMinesState(DEFAULT_MINES_STATE)).toBe("");
  });

  it("guarda la vista en ?v=, y el orden y el tipo sólo en Armas", () => {
    const s: MinesState = { view: "weapons", sort: "crit", type: "dagger" };
    expect(writeMinesState(s)).toBe("?v=weapons&sort=crit&type=dagger");
    expect(readMinesState(writeMinesState(s))).toEqual(s);
    expect(writeMinesState({ ...s, view: "monsters" })).toBe("?v=monsters");
    expect(readMinesState("?v=garbage&sort=x&type=y")).toEqual(DEFAULT_MINES_STATE);
  });

  it("la pestaña y sus fichas tienen dirección en los dos idiomas", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/mines");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/minas");
    expect(parseRoute("/es/stardew-valley/minas")).toMatchObject({ view: "stardew", sdSection: "mines", lang: "es" });
  });
});

describe("las armas", () => {
  it("se ordenan por daño medio, de mayor a menor, con las tirachinas al final", () => {
    const list = weaponList(data, "dmg", "all", "en");
    const avgs = list.map(avgDamage);
    expect(avgs).toEqual([...avgs].sort((a, b) => b - a));
    // El Mazo del infinito (100–120) es la que más pega; la Espada oxidada (2–5) promedia 3,5.
    expect(list[0].name[0]).toBe("Infinity Gavel");
    expect(avgDamage(data.weapons.find((w) => w.id === "(W)0")!)).toBe(3.5);
    expect(list.slice(-3).every((w) => w.type === 4)).toBe(true);
  });

  it("se filtran por tipo: las dos clases de espada van juntas", () => {
    const swords = weaponList(data, "dmg", "sword", "en");
    expect(new Set(swords.map((w) => w.type))).toEqual(new Set([0, 3]));
    expect(weaponList(data, "speed", "dagger", "en").every((w) => w.type === 1)).toBe(true);
  });

  it("por crítico, la Aguja de iridio va primera (10 % × 7)", () => {
    expect(weaponList(data, "crit", "all", "en")[0].name[0]).toBe("Iridium Needle");
  });

  it("la tabla dibuja las 67 y dice dónde se compra cada una", () => {
    const html = book({ view: "weapons" });
    expect(html.match(/data-weapon=/g)).toHaveLength(67);
    // El Sable de plata: el Gremio lo vende a 750 g después del piso 20, y sale cerca del piso 50 (desde el 45).
    const row = html.slice(html.indexOf('data-weapon="silver-saber"'), html.indexOf("</tr>", html.indexOf('data-weapon="silver-saber"')));
    expect(row.replace(/<[^>]+>/g, "")).toContain("after floor 20");
    expect(row.replace(/<[^>]+>/g, "")).toContain("near floor 50 (from floor 45)");
  });
});

describe("los pisos", () => {
  it("cada zona de las Minas tiene sus cofres; la Calavera ninguno", () => {
    const zone = (k: string) => data.zones.find((z) => z.key === k)!;
    expect(zoneChests(data, zone("mines1")).map((c) => c.floor)).toEqual([10, 20]);
    expect(zoneChests(data, zone("mines3")).map((c) => c.floor)).toEqual([80, 90, 100, 110, 120]);
    expect(zoneChests(data, zone("skull"))).toEqual([]);
  });

  it("la vista de Pisos dibuja las 11 zonas, y la de infestación sin monstruos propios", () => {
    const html = book({});
    expect(html.match(/data-zone=/g)).toHaveLength(11);
    const inf = html.slice(html.indexOf('data-zone="infested"'), html.indexOf('data-zone="dino"'));
    expect(inf).toContain(STARDEW_COPY.en.mines.usualMonsters);
    expect(html).toContain('href="/en/stardew-valley/mines/green-slime"');
  });

  it("los monstruos van en el orden en que se encuentran: la Baba verde antes que la Momia", () => {
    const order = monsterOrder(data).map((m) => m.key);
    expect(order.indexOf("Green Slime")).toBeLessThan(order.indexOf("Mummy"));
    expect(order).toHaveLength(data.monsters.length);
  });
});

describe("la ficha de un monstruo", () => {
  it("la Baba verde existe en los dos idiomas", async () => {
    await loadMines(); // anota los slugs en español de los monstruos
    expect(findMonster(data, "green-slime")?.key).toBe("Green Slime");
    expect(findMonster(data, "baba-verde")?.key).toBe("Green Slime");
    expect(routePath(route("es", "green-slime"))).toBe("/es/stardew-valley/minas/baba-verde");
    expect(parseRoute("/es/stardew-valley/minas/baba-verde")).toMatchObject({ sdSection: "mines", detail: "green-slime" });
    expect(parseRoute("/en/stardew-valley/mines/green-slime")).toMatchObject({ sdSection: "mines", detail: "green-slime" });

    const slime = findMonster(data, "green-slime")!;
    const en = inLang("en", createElement(MonsterPage, { data, monster: slime, route: route("en", "green-slime"), navigate: nav }));
    const es = inLang("es", createElement(MonsterPage, { data, monster: slime, route: route("es", "green-slime"), navigate: nav }));
    expect(en).toContain(">Green Slime</h1>");
    expect(es).toContain(">Baba verde</h1>");
    // El botín enlaza a Objetos (la Baba, 766: 75 % + 5 % = 80 %), y la meta del Gremio trae su premio.
    expect(lootRows(slime)[0]).toEqual(["766", 0.8]);
    expect(es).toContain('href="/es/stardew-valley/objetos/');
    expect(en).toContain("80 %");
    expect(en).toContain("Slay 1,000 in total of:");
    expect(en).toContain("Slime Charmer Ring");
  });

  it("el sprite grande es un múltiplo entero de su tamaño", () => {
    expect(pixelScale(16, 24, 104, 104)).toBe(4);
    expect(pixelScale(32, 32, 104, 104)).toBe(3);
    expect(gearSprite("(W)4")).toBe("/stardew/combat/w-4.png");
    expect(gearSprite("(H)8")).toBe("/stardew/combat/h-8.png");
    expect(gearSprite("(O)434")).toBe("/stardew/items/434.png");
    expect(gearSprite("SkullKey")).toBeNull();
  });
});

describe("el cruce con Objetos", () => {
  it("un objeto que suelta un monstruo enlaza a su ficha", async () => {
    const ficha = (await loadItem("slime"))!;
    const src = ficha.sources.find((s) => s.k === "monster" && s.who[0] === "Green Slime");
    expect(src).toMatchObject({ slug: "green-slime", slugEs: "baba-verde" });
    const en = inLang("en", createElement(ItemPage, { ficha, route: { lang: "en", view: "stardew", sdSection: "items" } as Route, navigate: nav }));
    expect(en).toContain('href="/en/stardew-valley/mines/green-slime"');
    const es = inLang("es", createElement(ItemPage, { ficha, route: { lang: "es", view: "stardew", sdSection: "items" } as Route, navigate: nav }));
    expect(es).toContain('href="/es/stardew-valley/minas/baba-verde"');
  });
});
