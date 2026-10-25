/**
 * La pestaña Predictor (tarea 7) dibujada sin navegador, como el prerender: sin entrada es el formulario; con una
 * partida guardada sin `predict` (la leyó el Lector de antes), el aviso de volver a abrirla; con partida o con semilla,
 * las cinco cajas sin ningún NaN y con los objetos enlazados a su ficha.
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/predict.json";
import { LangContext } from "../src/i18n";
import type { Route } from "../src/route";
import { STARDEW_COPY } from "../src/stardewCopy";
import { loadList, loadSaveBundle, type Row } from "../src/stardew/data";
import StardewPredict, { PredictView, predictSpriteFile, type PredictBundle } from "../src/stardew/predict/StardewPredict";
import type { PredictData } from "../src/stardew/predict/query";
import { parseSave, type Save } from "../src/stardew/save/parse";
import { SaveView } from "../src/stardew/save/StardewSave";
import { isSdLoadingPage } from "../src/stardew/loadingGuard";

const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString(s: string, type: string): Document };
const mini = readFileSync(new URL("./fixtures/stardew-save-mini.xml", import.meta.url), "utf8");
// La partida mínima con lo que lee el predictor: la semilla, la suerte y el id del granjero.
const conPredict = mini
  .replace("<name>Fulana</name>", "<name>Fulana</name><UniqueMultiplayerID>-6368268736843601728</UniqueMultiplayerID>")
  .replace("<year>2</year>", "<year>2</year><dailyLuck>-0.05</dailyLuck><uniqueIDForThisGame>452435081</uniqueIDForThisGame><mine_lowestLevelReached>45</mine_lowestLevelReached>");
const leer = (xml: string): Save => {
  const s = parseSave(xml, parser);
  if ("error" in s) throw new Error(`no se leyó: ${s.error}`);
  return s;
};

const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "predict" }) as Route;
const nav = () => undefined;
// Con los apóstrofos como texto (React los escribe `&#x27;`), así se compara con la copia tal cual.
const inLang = (lang: "en" | "es", el: ReactElement) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el)).replaceAll("&#x27;", "'");
const sinNaN = (html: string) => expect(html).not.toMatch(/NaN|undefined|Infinity/);

describe("Predictor sin entrada (el prerender)", () => {
  it.each(["en", "es"] as const)("%s: el formulario de semilla y fecha y la lista de lo que predice", (lang) => {
    const c = STARDEW_COPY[lang].predict;
    const html = inLang(lang, createElement(StardewPredict, { route: route(lang), navigate: nav }));
    expect(html).toContain(c.h1);
    expect(html).toContain(c.formTitle);
    expect(html).toContain(c.seedWhere);
    for (const w of c.what) expect(html).toContain(w);
    expect(html).toContain('inputMode="numeric"');
    expect(isSdLoadingPage(html)).toBe(false);
    // Sin datos: ninguna caja de predicción.
    expect(html).not.toContain(c.geodes.title);
    sinNaN(html);
  });
});

describe("Predictor con una partida guardada", () => {
  let bundle: { en: PredictBundle; es: PredictBundle };
  beforeAll(async () => {
    const [en, es] = await Promise.all([loadList("en"), loadList("es")]);
    const predict = raw as unknown as PredictData;
    bundle = { en: { predict, rows: en as Row[] }, es: { predict, rows: es as Row[] } };
  });
  const view = (stored: Save | null, lang: "en" | "es" = "en", manual: Parameters<typeof PredictView>[0]["manual"] = null) =>
    inLang(lang, createElement(PredictView, { route: route(lang), navigate: nav, stored, manual, data: bundle[lang] }));

  it("sin predict (la leyó el Lector de antes): el aviso de volver a abrirla, con el enlace, y el formulario", () => {
    const vieja = leer(conPredict);
    delete vieja.predict;
    for (const lang of ["en", "es"] as const) {
      const c = STARDEW_COPY[lang].predict;
      const html = view(vieja, lang);
      expect(html).toContain(c.oldSave);
      expect(html).toContain(lang === "en" ? 'href="/en/stardew-valley/save"' : 'href="/es/stardew-valley/partida"');
      expect(html).toContain(c.formTitle);
      expect(html).not.toContain(c.geodes.title);
      sinNaN(html);
    }
  });

  it("con predict: la granja, las cinco cajas, la frase de la tele y los objetos enlazados", () => {
    const s = leer(conPredict);
    for (const lang of ["en", "es"] as const) {
      const t = STARDEW_COPY[lang];
      const c = t.predict;
      const html = view(s, lang);
      expect(html).toContain(t.save.farm("Los Sauces"));
      for (const title of [c.today.title, c.geodes.title, c.mines.title, c.cart.title, c.nights.title]) expect(html).toContain(title);
      // -0,05: los espíritus están molestos (una de dos frases).
      expect(html).toContain(c.today.luckTwo);
      expect(html).toContain((raw as unknown as PredictData).fortune["13193"][lang === "en" ? 0 : 1]);
      // 20 geodas comunes del granjero.
      expect(html.match(/class="sd-pr-drop[" ]/g)?.length).toBe(20);
      expect(html).toContain(lang === "en" ? 'href="/en/stardew-valley/items/' : 'href="/es/stardew-valley/objetos/');
      // Dos granjeros: el selector.
      expect(html).toContain("Mengano");
      expect(html).not.toContain(c.geodes.noSave);
      sinNaN(html);
    }
  });

  it("cada casillero tiene su dibujo (muebles, sombreros y máquinas sin ficha también) y la g pegada al precio", () => {
    const s = leer(conPredict);
    // Varias semillas, para que salgan muebles en el carro.
    let muebles = 0;
    for (const g of [452435081, 177904899, 12345, 999]) {
      const html = view({ ...s, predict: { ...s.predict!, gameId: g } }, "en");
      expect(html).not.toContain('<span class="sd-slot"></span>');
      muebles += (html.match(/src="\/stardew\/predict\/f-/g) ?? []).length;
      expect(html).toMatch(/<span class="sd-gold">[\d,]+<small>g<\/small><\/span>/);
    }
    expect(muebles).toBeGreaterThan(0);
    expect(predictSpriteFile("(WP)MoreWalls:11")).toBe("wp-MoreWalls-11.png");
    expect(predictSpriteFile("(H)RedFez")).toBe("h-RedFez.png");
    // Cada id sin ficha que el predictor puede mostrar tiene su dibujo con tamaño (o es una máquina con bc-<n>.png).
    const d = raw as unknown as PredictData;
    for (const q of Object.keys(d.names)) expect(q.startsWith("(BC)") || !!d.sprites[q], q).toBe(true);
  });

  it("un solo granjero: dice que la receta del anillo de bodas aparece con otro conectado; los días llevan su clima en aria-label", () => {
    const s = leer(conPredict);
    const solo = { ...s, predict: { ...s.predict!, farmers: s.predict!.farmers.slice(0, 1), multiplayer: false } };
    const c = STARDEW_COPY.es.predict;
    const html = view(solo, "es");
    expect(html).toContain(c.cart.ringManual);
    expect(html).toMatch(/aria-label="\d+: (Sol|Lluvia|Tormenta|Nieve|Festival|Viento|Boda|Lluvia verde)/);
  });

  it("una semilla en la dirección manda sobre la partida: sin geodas ni suerte, con los avisos de lo que se supone", () => {
    const c = STARDEW_COPY.en.predict;
    const html = view(leer(conPredict), "en", { seed: { gameId: 452435081, legacy: false }, season: 2, day: 10, year: 2 });
    expect(html).toContain(c.geodes.noSave);
    expect(html).toContain(c.today.luckNone);
    expect(html).toContain(c.cart.manual);
    expect(html).toContain(c.nights.manual);
    if (!html.includes(c.nights.none)) expect(html).toContain(c.nights.rest);
    expect(html).toContain(c.useSave);
    expect(html).toContain('value="452435081"');
    sinNaN(html);
  });

  it("una semilla mal escrita: el error y el formulario, sin cajas", () => {
    const c = STARDEW_COPY.es.predict;
    const html = view(null, "es", { error: "bad" });
    expect(html).toContain(c.seedErrors.bad);
    expect(html).not.toContain(c.geodes.title);
  });

  it("el Lector enlaza al Predictor", async () => {
    const saveData = await loadSaveBundle("es");
    const html = inLang("es", createElement(SaveView, { save: leer(conPredict), data: saveData, route: { lang: "es", view: "stardew", sdSection: "save" } as Route, navigate: nav }));
    expect(html).toContain('href="/es/stardew-valley/predictor"');
    expect(html).toContain(STARDEW_COPY.es.save.toPredict);
  });
});
