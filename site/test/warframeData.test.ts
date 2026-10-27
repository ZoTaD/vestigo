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
import { loadFicha, loadList, peekFicha, preloadRoute, say, WF_SHARDS } from "../src/warframe/data";

const dir = new URL("../../games/warframe/data/arsenal/f/", import.meta.url);
const noop = () => undefined;
const inLang = (lang: "en" | "es", el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: noop } }, el));
const route = (lang: "en" | "es", wfSection: "arsenal" | "relics", detail?: string) => ({ lang, view: "warframe", wfSection, detail }) as Route;

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
