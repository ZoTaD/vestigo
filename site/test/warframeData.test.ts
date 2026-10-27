import { readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import { routePath, type Route } from "../src/route";
import { WF_COPY } from "../src/warframeCopy";
import ArsenalList from "../src/warframe/arsenal/ArsenalList";
import ArsenalPage from "../src/warframe/arsenal/ArsenalPage";
import RelicPage from "../src/warframe/relics/RelicPage";
import Sources from "../src/warframe/Sources";
import { loadFicha, readModFilters, loadList, peekFicha, preloadRoute, say, sortSources, WF_SHARDS } from "../src/warframe/data";
import FarmingPage from "../src/warframe/farming/FarmingPage";
import ModList from "../src/warframe/mods/ModList";
import ModPage from "../src/warframe/mods/ModPage";

const dir = new URL("../../games/warframe/data/arsenal/f/", import.meta.url);
const noop = () => undefined;
const inLang = (lang: "en" | "es", el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: noop } }, el));
const route = (lang: "en" | "es", wfSection: "arsenal" | "relics" | "farming" | "mods", detail?: string) => ({ lang, view: "warframe", wfSection, detail }) as Route;

describe("datos de Warframe: Arsenal y Reliquias", () => {
  it("WF_SHARDS es el CHUNKS de site_data.py", () => expect(WF_SHARDS).toBe(32));

  it("hay exactamente WF_SHARDS archivos de fichas", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(WF_SHARDS);
  });

  it("la ficha de Excalibur trae las partes de War", async () => {
    const f = await loadFicha("arsenal", "excalibur");
    const chasis = f!.parts.find((p) => p.name[0] === "Excalibur Chassis")!;
    expect(chasis.sources).toContainEqual(expect.objectContaining({ k: "mission", chance: 38.72 }));
  });

  it("abre en frío una reliquia en español", async () => {
    await preloadRoute(route("es", "relics", "lith-a1"));
    expect(peekFicha("relics", "lith-a1")).toBeTruthy();
  });

  it("abre en frío un objeto cuyo slug cambia en español, y deja anotada la dirección", async () => {
    const list = await loadList("arsenal");
    const row = list.find((r) => r.slug !== r.slugEs)!;
    await preloadRoute(route("es", "arsenal", row.slugEs));
    expect(peekFicha("arsenal", row.slug)).toBeTruthy();
    expect(routePath(route("es", "arsenal", row.slug))).toBe(`/es/warframe/arsenal/${row.slugEs}`);
  });

  it("la lista del Arsenal trae los siete tipos", async () => {
    const list = await loadList("arsenal");
    expect(new Set(list.map((r) => r.kind))).toEqual(new Set(["warframe", "primary", "secondary", "melee", "archwing", "companion", "exalted"]));
  });

  it("say elige el idioma y cae al inglés", () => {
    expect(say(["a", "b"], "es")).toBe("b");
    expect(say(["a", ""], "es")).toBe("a");
    expect(say(["a", "b"], "en")).toBe("a");
  });

  it("una parte sin fuente muestra 'no cae en misiones' y nada vacío", () => {
    const html = inLang("es", createElement(Sources, { list: [], refs: {} }));
    expect(html).toContain(WF_COPY.es.noDrops);
    expect(html).not.toContain("<table");
  });

  it("la ficha de Excalibur arma 'Plano de' en español y 'Blueprint' en inglés, y no deja secciones vacías", async () => {
    const f = (await loadFicha("arsenal", "excalibur"))!;
    const es = inLang("es", createElement(ArsenalPage, { ficha: f, route: route("es", "arsenal", "excalibur"), navigate: noop }));
    const en = inLang("en", createElement(ArsenalPage, { ficha: f, route: route("en", "arsenal", "excalibur"), navigate: noop }));
    expect(es).toContain("Plano de Excalibur");
    expect(en).toContain("Excalibur Blueprint");
    expect(es).toContain(WF_COPY.es.noDrops);
    expect(es).not.toContain("<table></table>");
  });

  it("la ficha de una reliquia muestra sus seis recompensas y el rótulo de Vault", async () => {
    const f = (await loadFicha("relics", "lith-a1"))!;
    const html = inLang("en", createElement(RelicPage, { ficha: f, route: route("en", "relics", "lith-a1"), navigate: noop }));
    expect(html.replaceAll("&#x27;", "'")).toContain(WF_COPY.en.vault);
    expect(html.match(/data-reward/g)).toHaveLength(6);
  });

  it("la lista del Arsenal dibuja los chips de tipo, con las exaltadas", async () => {
    const rows = await loadList("arsenal");
    const html = inLang("en", createElement(ArsenalList, { rows, route: route("en", "arsenal"), navigate: noop }));
    expect(html).toContain("Exalted");
  });
});

describe("datos de Warframe: Dónde farmear y Mods", () => {
  it("los sensores neurales: Júpiter y el Raptor", async () => {
    const f = await loadFicha("farming", "neural-sensors");
    expect(f!.planets).toContainEqual(["Jupiter", "Júpiter"]);
    expect(f!.sources).toContainEqual(expect.objectContaining({ k: "enemy", who: "Raptor", eff: 50 }));
  });
  it("Sierra: 11 rangos, drenaje 4 y cae en Apolodoro B", async () => {
    const f = await loadFicha("mods", "serration");
    expect(f!.maxRank).toBe(10);
    expect(f!.drain).toBe(4);
    expect(f!.sources).toContainEqual(expect.objectContaining({ k: "mission", rot: "B", chance: 7.69 }));
  });
  it("sortSources ordena a los enemigos por su probabilidad efectiva", () => {
    const sorted = sortSources([
      { k: "enemy", who: "A", eff: 5, chance: 90 },
      { k: "enemy", who: "B", eff: 50, chance: 10 },
    ]);
    expect(sorted.map((s) => (s as { who: string }).who)).toEqual(["B", "A"]);
  });
  it("la ficha de un recurso nombra lo que lo pide y la de un arcano no inventa lo que no tiene", async () => {
    const r = (await loadFicha("farming", "neural-sensors"))!;
    const html = inLang("es", createElement(FarmingPage, { ficha: r, route: route("es", "farming", "neural-sensors"), navigate: noop }));
    expect(html).toContain("Ash");
    const a = (await loadFicha("mods", "arcane-victory"))!;
    const ah = inLang("en", createElement(ModPage, { ficha: a, route: route("en", "mods", "arcane-victory"), navigate: noop }));
    expect(ah).not.toContain("Polarity");
    expect(ah).not.toContain("Drain");
  });
  it("la lista de mods dibuja los chips de mod y arcano", async () => {
    const rows = await loadList("mods");
    const html = inLang("en", createElement(ModList, { rows, route: route("en", "mods"), navigate: noop }));
    expect(html).toContain("Arcanes");
  });
  it("en los sensores neurales el grupo de enemigos va primero (50 % efectivo)", async () => {
    const f = (await loadFicha("farming", "neural-sensors"))!;
    const html = inLang("en", createElement(Sources, { list: f.sources, refs: f.refs }));
    expect(html.indexOf(WF_COPY.en.sources.enemy)).toBeGreaterThan(-1);
    expect(html.indexOf("<h4 class=\"wf-h3\">" + WF_COPY.en.sources.enemy)).toBeLessThan(html.indexOf("<h4 class=\"wf-h3\">" + WF_COPY.en.sources.mission));
  });
  it("kind=arcane en la dirección ignora type y polarity", () => {
    expect(readModFilters("?kind=arcane&type=PRIMARY&polarity=madurai&rarity=Rare")).toEqual({ kind: "arcane", type: null, rarity: "Rare", polarity: null });
    expect(readModFilters("?kind=mod&type=PRIMARY").type).toBe("PRIMARY");
  });
  it("la tabla de mods encabeza su primera columna con 'Name'", async () => {
    const rows = await loadList("mods");
    expect(inLang("en", createElement(ModList, { rows, route: route("en", "mods"), navigate: noop }))).toContain("<th>Name</th>");
  });
});
