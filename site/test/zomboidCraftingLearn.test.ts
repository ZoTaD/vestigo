/**
 * Fabricación, Task 4 (2026-10-02): qué hay que aprender y con qué, dónde aparece más cada cosa, tu personaje y lo que
 * ya tenés. Render estático en español, con el `craft.json` de verdad (y uno de prueba para el "Más fácil").
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import craftJson from "../../games/zomboid/data/craft.json";
import pzIndex from "../../games/zomboid/data/index.json";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { parseRoute, registerPzSlugs, routePath, type PzTab } from "../src/route";
import type { CraftData } from "../src/zomboid/crafting/data";
import { plan } from "../src/zomboid/crafting/engine";
import { EMPTY, type CraftState } from "../src/zomboid/crafting/state";
import { CRAFT_COPY } from "../src/zomboid/crafting/copy";
import RouteSheet, { linksOf, loadRoomNamer } from "../src/zomboid/crafting/RouteSheet";
import TreeSheet from "../src/zomboid/crafting/TreeSheet";
import LearnSheet from "../src/zomboid/crafting/LearnSheet";
import Character from "../src/zomboid/crafting/Character";
import { roomName } from "../src/zomboid/map/rooms";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const craft = craftJson as unknown as CraftData;
const t = CRAFT_COPY.es;
const ES = "/es/project-zomboid/fabricacion";
/** Lo que React escribe escapado en el HTML. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const sinBotin = (d: CraftData): CraftData => ({
  ...d, loot: false,
  items: Object.fromEntries(Object.entries(d.items).map(([k, { w: _w, ...v }]) => [k, v])),
});

beforeAll(async () => {
  registerPzSlugs(buildEsSlugs(INDEX, []));
  // Los nombres de los cuartos bajan aparte al montarse la hoja de ruta: acá, antes de dibujar.
  await loadRoomNamer();
});

function render(d: CraftData, st: CraftState) {
  const route = parseRoute(ES);
  const { trees, totals } = plan(d, st);
  const wrap = (el: ReactElement) =>
    renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));
  const common = { data: d, st, set: () => undefined, route, navigate: () => undefined };
  return {
    totals,
    route: wrap(createElement(RouteSheet, { ...common, totals })),
    learn: wrap(createElement(LearnSheet, { ...common, totals })),
    tree: wrap(createElement(TreeSheet, { ...common, trees })),
    char: wrap(createElement(Character, { data: d, st, set: () => undefined, route })),
  };
}

/** El pedazo de una hoja debajo de un título (hasta el próximo `<h3`). */
const part = (html: string, title: string) => {
  const at = html.indexOf(`>${title}<`);
  if (at < 0) return "";
  const end = html.indexOf("<h3", at + 1);
  return html.slice(at, end < 0 ? undefined : end);
};

describe("Para aprender: la bragueta de metal", () => {
  const { learn } = render(craft, { ...EMPTY, q: [{ id: "metal-codpiece", qty: 1 }] });

  it("la receta, con link a Recetas, y «la aprendés con cualquiera de»", () => {
    expect(learn).toContain(t.learnTitle);
    expect(learn).toContain(esc(craft.recipes["forge-codpiece"].es));
    expect(learn).toContain('href="/es/project-zomboid/recetas/');
    expect(learn).toContain(t.learnWith);
  });

  it("la revista, con link a Objetos", () => {
    const mag = "magazine-european-armor-in-the-late-medieval-era";
    expect(learn).toContain(esc(craft.items[mag].es));
    expect(learn).toMatch(/href="\/es\/project-zomboid\/objetos\/[^"]+"/);
  });

  it("nivel 6 de Herrería, con link a Habilidades", () => {
    expect(learn).toContain("nivel 6");
    expect(learn).toMatch(/href="\/es\/project-zomboid\/habilidades\/[^"]+"/);
  });

  it("la bragueta de cuero en «desarmá o estudiá»", () => {
    const at = learn.indexOf(t.research);
    expect(at).toBeGreaterThan(-1);
    expect(learn.slice(at)).toContain(esc(craft.items["leather-codpiece"].es));
  });
});

describe("Para aprender: los clavos y tu personaje", () => {
  it("sin personaje: una receta de forjar clavos que sabe el herrero", () => {
    const { learn } = render(craft, { ...EMPTY, q: [{ id: "nails", qty: 10 }], b: null });
    expect(learn).toContain(t.learnTitle);
    expect(learn).toMatch(/Forjar/);
    const prof = routePath(linksOf(parseRoute(ES)).prof("blacksmith"));
    expect(learn).toContain(`href="${prof}"`);
    expect(learn).toContain(esc(craft.profs.blacksmith.es));
  });

  it("siendo herrero: no hay nada que aprender", () => {
    const { learn } = render(craft, { ...EMPTY, q: [{ id: "nails", qty: 10 }], b: "blacksmith" });
    expect(learn).toBe("");
  });

  it("«Tu personaje»: herrero elegido y el link a Personaje con el ?b=", () => {
    const { char } = render(craft, { ...EMPTY, q: [{ id: "nails", qty: 10 }], b: "blacksmith" });
    expect(char).toContain(t.charTitle);
    expect(char).toContain(t.noProf);
    expect(char).toMatch(/<option value="blacksmith" selected="">/);
    expect(char).toContain('href="/es/project-zomboid/personaje?b=blacksmith"');
    expect(char).toContain(t.charNote);
  });

  it("los rasgos del ?b= como chips con «Sacar»", () => {
    const { char } = render(craft, { ...EMPTY, q: [{ id: "nails", qty: 1 }], b: "carpenter.handy" });
    expect(char).toContain(esc(craft.traits.handy.es));
    expect(char).toContain(t.remove);
  });
});

describe("lo que ya tenés", () => {
  it("con un tronco, 10 tablas piden 3 troncos y el «tengo» del tronco dice 1", () => {
    const { route, tree } = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }], have: { log: 1 } });
    const raw = part(route, t.raw);
    expect(raw).toContain("Tronco");
    expect(raw).toMatch(/>3</);
    expect(raw).toMatch(/<input[^>]*type="number"[^>]*value="1"/);
    expect(raw).toContain(`>${t.have}<`);
    // El árbol: un «tengo» en el nodo que se fabrica (la tabla).
    expect(tree).toContain(`>${t.have}<`);
  });

  it("una herramienta: la casilla «la tengo», y marcada dice «✓ la tenés»", () => {
    const off = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }] }).route;
    expect(part(off, t.tools)).toContain(t.haveTool);
    expect(part(off, t.tools)).not.toContain(t.youHaveIt);
    const pick = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }] }).totals.tools[0].pick;
    const on = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }], have: { [pick]: 1 } }).route;
    expect(part(on, t.tools)).toContain(t.youHaveIt);
    expect(part(on, t.tools)).toMatch(/type="checkbox"[^>]*checked=""/);
  });

  it("un objeto que ya tenés entero sigue en la lista, con su «tengo», para poder sacarlo", () => {
    const { route } = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }], have: { log: 4 } });
    expect(part(route, t.raw)).toMatch(/<input[^>]*value="4"/);
    expect(part(route, t.raw)).toMatch(/>0</);
    expect(part(route, t.raw)).not.toContain("-0");
  });
});

describe("Más fácil: dónde aparece", () => {
  it("con botín: el cuarto, la chance y en cuántos lugares, con link a la ficha", () => {
    const d: CraftData = { ...craft, items: { ...craft.items, log: { ...craft.items.log, w: ["kitchen", "counter", 0.039, 12] } } };
    const { route } = render(d, { ...EMPTY, q: [{ id: "plank", qty: 10 }] });
    const raw = part(route, t.raw);
    expect(raw).toContain(esc(`Más fácil: ${roomName("kitchen", "es")} · 3,9 % · en 12 lugares`));
    expect(raw).toContain(t.whereLink);
    expect(raw).toContain('href="/es/project-zomboid/objetos/tronco"');
  });

  it("sin botín: nada", () => {
    const { route } = render(sinBotin(craft), { ...EMPTY, q: [{ id: "plank", qty: 10 }] });
    expect(route).not.toContain("Más fácil");
    expect(route).not.toContain(t.whereLink);
  });

  it("«en cualquier lugar» sin «en» doble", () => {
    const { route } = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }] });
    expect(route).not.toMatch(/en: en /);
  });
});

describe("Te deja", () => {
  it("10 tablas: Carpintería +20 XP, con link a la habilidad", () => {
    const { route } = render(craft, { ...EMPTY, q: [{ id: "plank", qty: 10 }] });
    const xp = part(route, t.xpTitle);
    expect(xp).toContain("Carpintería");
    expect(xp).toContain("+20 XP");
    expect(xp).toContain('href="/es/project-zomboid/habilidades/carpinteria"');
  });
});
