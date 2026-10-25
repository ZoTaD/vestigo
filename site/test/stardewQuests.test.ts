/**
 * La pestaña Misiones de Stardew Valley (etapa 4, tarea 9): las cadenas de la historia (cada misión una sola vez), los
 * pedidos que piden todo o una opción al azar, la lista larga de opciones fuera de los objetivos, la vista en la
 * dirección y las dos vistas dibujadas en los dos idiomas, sin huecos del juego.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/quests.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, STARDEW_PUBLISHED, type Route } from "../src/route";
import { STARDEW_TABS } from "../src/stardewCopy";
import { loadQuests } from "../src/stardew/data";
import { QuestBook } from "../src/stardew/quests/StardewQuests";
import {
  isLongPick,
  nextElsewhere,
  orderPick,
  questChains,
  readQuestView,
  requesters,
  shortGoal,
  viewOfAnchor,
  writeQuestView,
  type QuestsData,
  type QuestView,
} from "../src/stardew/quests/state";

const data = raw as unknown as QuestsData;
beforeAll(() => loadQuests());
const order = (key: string) => data.orders.find((o) => o.key === key)!;
const quest = (key: string) => data.story.find((q) => q.key === key)!;
const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "quests" }) as Route;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const book = (initial: QuestView, lang: "en" | "es" = "en", who = "") =>
  inLang(lang, createElement(QuestBook, { data, route: route(lang), navigate: () => undefined, initial, initialWho: who }));
/** El HTML del elemento con ese `id` (con lo que tenga adentro, hasta su cierre). */
const row = (html: string, id: string) => {
  const at = html.indexOf(`id="${id}"`);
  expect(at, id).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<(\w+)/.exec(html.slice(start))![1];
  const tags = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  throw new Error(`sin cierre: ${id}`);
};
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("las cadenas de la historia", () => {
  it("no repiten misiones y cubren las 66", () => {
    const keys = questChains(data).flat().map((q) => q.key);
    expect(keys).toHaveLength(66);
    expect(new Set(keys).size).toBe(66);
  });

  it("la 6 abre la 7 y la 8; la 8 queda con la 6 y la 132 la nombra aparte", () => {
    const chains = questChains(data);
    expect(chains.find((c) => c[0].key === "6")!.map((q) => q.key)).toEqual(["6", "7", "8"]);
    expect(chains.find((c) => c[0].key === "132")!.map((q) => q.key)).toEqual(["132", "133"]);
    expect(nextElsewhere(data, quest("132")).map((q) => q.key)).toEqual(["8"]);
    expect(nextElsewhere(data, quest("6"))).toEqual([]);
    expect(chains.find((c) => c[0].key === "14")!.map((q) => q.key)).toEqual(["14", "17", "18"]);
    // Las sueltas son cadenas de una, y las cadenas van en el orden de la clave con que empiezan.
    expect(chains.find((c) => c[0].key === "101")).toHaveLength(1);
    expect(chains.map((c) => Number(c[0].key))).toEqual([...chains.map((c) => Number(c[0].key))].sort((a, b) => a - b));
  });
});

describe("los pedidos", () => {
  it("piden todo o una opción al azar", () => {
    expect(orderPick(order("Willy"))).toBe("all");
    expect(orderPick(order("Emily"))).toBe("all");
    expect(orderPick(order("Willy2"))).toBe("all");
    expect(orderPick(order("Robin2"))).toBe("one");
    expect(orderPick(order("Lewis"))).toBe("one");
    expect(orderPick(order("DesertFestivalMarlon3"))).toBe("one");
    expect(data.orders.filter(isLongPick).map((o) => o.key)).toEqual(["Demetrius", "Lewis"]);
  });

  it("la lista larga de opciones sale de los objetivos, en los dos idiomas", () => {
    const names = (key: string, lang: 0 | 1) => {
      const o = order(key);
      const r = (i: number) => data.refs[o.items[i].id];
      return [r(0)[2 + lang], r(o.items.length - 1)[2 + lang]] as const;
    };
    const [f, l] = names("Lewis", 0);
    expect(shortGoal(order("Lewis").goals[0][0], f, l, "of one of the options below")).toBe("Harvest 100 of one of the options below.");
    expect(shortGoal(order("Lewis").goals[1][0], f, l, "X")).toBe("Ship 100 X.");
    const [fe, le] = names("Lewis", 1);
    expect(shortGoal(order("Lewis").goals[0][1], fe, le, "de una de las opciones de abajo")).toBe("Cultiva 100 de una de las opciones de abajo.");
    const [fd, ld] = names("Demetrius", 1);
    expect(shortGoal(order("Demetrius").goals[0][1], fd, ld, "Y")).toBe("Pesca 10 Y.");
    // Sin los dos nombres, queda como estaba.
    expect(shortGoal("Pesca 10 sardinas.", "Atún", "Sardina", "Y")).toBe("Pesca 10 sardinas.");
  });

  it("quiénes piden, sin repetir y en orden", () => {
    const who = requesters(data, "orders");
    expect(who[0]).toBe("Willy");
    expect(new Set(who).size).toBe(who.length);
    expect(who).toContain("Marlon");
    expect(requesters(data, "story")).toContain("Jodi");
    expect(requesters(data, "story")).not.toContain(null);
    for (const k of [...requesters(data, "orders"), ...requesters(data, "story")]) expect(data.people[k], k).toBeTruthy();
  });
});

describe("la dirección", () => {
  it("quests en inglés, misiones en español, publicada, en la barra después de Aldeanos", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/quests");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/misiones");
    expect(parseRoute("/es/stardew-valley/misiones")).toMatchObject({ view: "stardew", sdSection: "quests" });
    expect(STARDEW_PUBLISHED).toContain("quests");
    expect(STARDEW_TABS.indexOf("quests")).toBe(STARDEW_TABS.indexOf("villagers") + 1);
  });

  it("la vista viaja en ?v=; los Pedidos van sin nada; un ancla sin ?v= abre su vista", () => {
    expect(readQuestView("")).toBe("orders");
    expect(readQuestView("?v=story")).toBe("story");
    expect(readQuestView("?v=nada")).toBe("orders");
    expect(writeQuestView("orders")).toBe("");
    expect(writeQuestView("story")).toBe("?v=story");
    expect(viewOfAnchor(data, "willy")).toBe("orders");
    expect(viewOfAnchor(data, "101")).toBe("story");
    expect(viewOfAnchor(data, "nada")).toBeNull();
  });
});

describe("las vistas dibujadas", () => {
  it("los Pedidos: el de Willy con su retrato, 3000 de oro, los días y lo que pide enlazado", () => {
    for (const lang of ["en", "es"] as const) {
      const willy = row(book("orders", lang), "willy");
      expect(willy).toContain('src="/stardew/portraits/willy.png"');
      expect(plain(willy)).toContain(lang === "en" ? "3,000" : "3.000");
      expect(plain(willy)).toContain(lang === "en" ? "7 days" : "7 días");
      expect(willy).toContain(lang === "en" ? 'href="/en/stardew-valley/items/bug-meat"' : 'href="/es/stardew-valley/objetos/carne-de-insecto"');
      expect(willy).toMatch(/<img[^>]*loading="lazy"[^>]*decoding="async"/);
    }
  });

  it("el oro que depende de la opción va de un mínimo a un máximo; Lewis pliega el cartel y lista las 18 opciones", () => {
    const lewis = row(book("orders", "en"), "lewis");
    expect(plain(lewis)).toContain("1,250–16,000");
    expect(lewis).toContain("<details");
    expect(plain(lewis)).toContain("Harvest 100 of one of the options below.");
    expect((lewis.match(/class="sd-qo-opt"/g) ?? []).length).toBe(18);
    const es = row(book("orders", "es"), "lewis");
    expect(plain(es)).toContain("1.250–16.000");
    // Las 18 opciones piden lo mismo: la cantidad va una vez en el rótulo, no en cada casillero.
    expect(plain(es)).toContain("Pide 100 de uno de estos, elegido al azar");
    expect(es).not.toContain("×100");
  });

  it("los premios: la carta con su dibujo, la amistad con quien lo pide y el mueble sin ficha sin enlace", () => {
    const robin = row(book("orders", "es"), "robin");
    expect(plain(robin)).toContain("+250 de amistad con Robin");
    expect(robin).toContain('src="/stardew/rewards/f-2186.png"');
    expect(robin).not.toContain("objetos/f-2186");
    const pam = plain(row(book("orders", "en"), "pam"));
    expect(pam).toContain("New TV channel");
    const marlon = row(book("orders", "en"), "desertfestivalmarlon1");
    expect(marlon).toContain('src="/stardew/portraits/marlon.png"');
    expect(plain(marlon)).toMatch(/35/);
  });

  it("las Misiones: la cadena de la 6, la de Jodi con su retrato y la coliflor, y la 132 que sigue en la 8", () => {
    const html = book("story", "es");
    const seis = row(html, "6");
    expect(plain(seis)).toContain("Cómo empezar");
    expect(plain(row(html, "101"))).toContain("Jodi");
    expect(row(html, "101")).toContain('src="/stardew/portraits/jodi.png"');
    expect(row(html, "101")).toContain('href="/es/stardew-valley/objetos/coliflor"');
    expect(plain(row(html, "101"))).toContain("350");
    expect(row(html, "132")).toContain('href="#8"');
  });

  it("el filtro por aldeano deja sólo los suyos", () => {
    const html = book("orders", "en", "Wizard");
    expect(html).toContain('id="wizard"');
    expect(html).toContain('id="wizard2"');
    expect(html).not.toContain('id="willy"');
    const story = book("story", "en", "Jodi");
    expect(story).toContain('id="101"');
    expect(story).not.toContain('id="6"');
  });

  it("cada fila tiene su ancla, sin repetir: las que enlaza la ficha de Objetos existen", () => {
    const orders = book("orders", "en");
    const story = book("story", "en");
    for (const o of data.orders) expect(orders, o.slug).toContain(`id="${o.slug}"`);
    for (const q of data.story) expect(story, q.slug).toContain(`id="${q.slug}"`);
    for (const html of [orders, story]) {
      const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("sin huecos ni claves del juego, y dentro del presupuesto", () => {
    for (const lang of ["en", "es"] as const)
      for (const v of ["orders", "story"] as const) {
        const html = book(v, lang);
        expect(plain(html), `${lang} ${v}`).not.toMatch(/[{}[\]]|undefined|NaN|null/);
        expect((html.match(/<[a-z][^>]*>/g) ?? []).length).toBeLessThan(2200);
        expect((html.match(/<img /g) ?? []).length).toBeLessThanOrEqual(150);
      }
  });
});
