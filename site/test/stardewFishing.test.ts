/**
 * La pestaña Pesca de Stardew Valley (etapa 2, tarea 5): `canCatch` (el pez de medianoche, uno de dos franjas, uno de
 * trampa, uno de lluvia con sol, uno sólo de la isla), la dirección que guarda los filtros y la pantalla dibujada sin
 * navegador (como el prerender).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/fish.json";
import list from "../../games/stardew/data/site/list.json";
import { LangContext } from "../src/i18n";
import { parseRoute, registerStardewSlugs, routePath, type Route } from "../src/route";
import { FishFinder } from "../src/stardew/fishing/StardewFishing";
import {
  canCatch,
  catchNow,
  DEFAULT_FISH_STATE,
  fishSeasons,
  fishTable,
  fmtRange,
  isQiFamily,
  readFishState,
  slotLabel,
  withPrices,
  writeFishState,
  type Fish,
  type FishData,
  type FishState,
} from "../src/stardew/fishing/state";

const data: FishData = withPrices(raw as Omit<FishData, "prices">, list as [string, string, number, number, number, number, number][]);
// Como hace `loadFish` al bajar los datos: los enlaces en español usan el slug del pez en español.
registerStardewSlugs({ items: Object.fromEntries(data.fish.map((f) => [f.slug, f.slugEs])) });
const fish = (slug: string): Fish => data.fish.find((f) => f.slug === slug)!;
const st = (x: Partial<FishState>): FishState => ({ ...DEFAULT_FISH_STATE, ...x });
const placeKeys = data.places.map((p) => p.key);
const route = { lang: "en", view: "stardew", sdSection: "fishing" } as Route;

/** La pantalla dibujada con un estado: los peces de "ahora" y las filas de la tabla, en el orden en que salen. */
function screen(state: FishState, lang: "en" | "es" = "en") {
  const html = renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(FishFinder, { data, route: { ...route, lang }, navigate: () => undefined, initial: state })),
  );
  const now = [...html.matchAll(/data-now="([\w-]+)"/g)].map((m) => m[1]);
  const rows = [...html.matchAll(/data-fish="([\w-]+)"/g)].map((m) => m[1]);
  return { html, now, rows };
}

describe("canCatch", () => {
  const when = { place: "any", season: 0, weather: "sunny", time: 600 } as const;

  it("el pez de medianoche: la Carpa nocturna (22:00 a 2:00) se pesca de 12 a 2 y no a la mañana", () => {
    const carp = fish("midnight-carp");
    expect(carp.times).toEqual([[2200, 2600]]);
    expect(canCatch(carp, { ...when, season: 2, time: 2400 })).toBe(true);
    expect(canCatch(carp, { ...when, season: 2, time: 2200 })).toBe(true);
    expect(canCatch(carp, { ...when, season: 2, time: 600 })).toBe(false);
    expect(canCatch(carp, { ...when, season: 2, time: 2000 })).toBe(false);
    // Fuera de otoño e invierno, no en el pueblo; en la isla, todo el año.
    expect(canCatch(carp, { ...when, season: 0, time: 2400, place: "Mountain" })).toBe(false);
    expect(canCatch(carp, { ...when, season: 0, time: 2400, place: "IslandWest" })).toBe(true);
  });

  it("uno de dos franjas: la Albacora (6 a 11 y 18 a 2) no se pesca al mediodía", () => {
    const albacore = fish("albacore");
    const fall = { ...when, season: 2 };
    expect(canCatch(albacore, { ...fall, time: 600 })).toBe(true);
    expect(canCatch(albacore, { ...fall, time: 1000 })).toBe(true);
    expect(canCatch(albacore, { ...fall, time: 1200 })).toBe(false);
    expect(canCatch(albacore, { ...fall, time: 1600 })).toBe(false);
    expect(canCatch(albacore, { ...fall, time: 1800 })).toBe(true);
    expect(canCatch(albacore, { ...fall, time: 2400 })).toBe(true);
    expect(canCatch(albacore, { ...fall, time: null })).toBe(true);
  });

  it("uno de trampa: a cualquier hora y clima, sólo en su trampa o en cualquier lugar", () => {
    const lobster = fish("lobster");
    expect(lobster.crabPot).toBe(true);
    for (const time of [600, 1400, 2400, null]) for (const weather of ["sunny", "rainy"] as const) for (const season of [0, 1, 2, 3]) {
      expect(canCatch(lobster, { place: "any", season, weather, time })).toBe(true);
      expect(canCatch(lobster, { place: "CrabPot:ocean", season, weather, time })).toBe(true);
    }
    expect(canCatch(lobster, { ...when, place: "CrabPot:freshwater" })).toBe(false);
    expect(canCatch(lobster, { ...when, place: "Beach" })).toBe(false);
    // Y uno de caña no sale en la trampa.
    expect(canCatch(fish("sardine"), { ...when, place: "CrabPot:ocean" })).toBe(false);
  });

  it("uno de lluvia con sol: el Siluro sólo con lluvia", () => {
    const catfish = fish("catfish");
    expect(catfish.weather).toBe("rainy");
    expect(canCatch(catfish, { ...when, weather: "rainy" })).toBe(true);
    expect(canCatch(catfish, { ...when, weather: "sunny" })).toBe(false);
    // Y uno de sol con lluvia: el Pez sol.
    expect(canCatch(fish("sunfish"), { ...when, weather: "rainy" })).toBe(false);
  });

  it("la estación del lugar manda: el Pez carmesí es de verano en la playa", () => {
    const crimson = fish("crimsonfish");
    expect(canCatch(crimson, { ...when, season: 1, place: "Beach" })).toBe(true);
    expect(canCatch(crimson, { ...when, season: 3, place: "Beach" })).toBe(false);
    expect(fishSeasons(crimson)).toEqual([1]);
  });

  it("uno sólo de la isla no se pierde: el Pez león se pesca todo el año en la isla", () => {
    const lion = fish("lionfish");
    for (const season of [0, 1, 2, 3]) expect(canCatch(lion, { ...when, season, place: "IslandSouth" })).toBe(true);
    expect(canCatch(lion, { ...when, place: "Beach" })).toBe(false);
    expect(fishSeasons(lion)).toEqual([0, 1, 2, 3]);
    // El Pez globo es de verano en la playa, pero en la isla todo el año.
    expect(canCatch(fish("pufferfish"), { ...when, season: 0, time: 1200, place: "Beach" })).toBe(false);
    expect(canCatch(fish("pufferfish"), { ...when, season: 0, time: 1200, place: "IslandWest" })).toBe(true);
  });

  it("los legendarios del encargo del Sr. Qi no salen en \"ahora\": sólo con el encargo activo", () => {
    for (const slug of ["son-of-crimsonfish", "ms-angler", "legend-ii", "radioactive-carp", "glacierfish-jr"]) {
      const f = fish(slug);
      expect(isQiFamily(f)).toBe(true);
      for (const season of [0, 1, 2, 3]) expect(canCatch(f, { ...when, season, weather: "rainy", time: null })).toBe(false);
      expect(fishSeasons(f)).toEqual([0, 1, 2, 3]);
    }
    expect(isQiFamily(fish("angler"))).toBe(false);
    expect(canCatch(fish("angler"), { ...when, season: 2, place: "Town" })).toBe(true);
  });

  it("el submarino y el Mercado nocturno son de invierno", () => {
    expect(canCatch(fish("blobfish"), { ...when, season: 3, place: "Submarine" })).toBe(true);
    expect(canCatch(fish("blobfish"), { ...when, season: 0, place: "Submarine" })).toBe(false);
  });
});

describe("las horas como se ven", () => {
  it("la medianoche es 12:00 y las 2 de la mañana, 2:00", () => {
    expect(fmtRange([2200, 2600], "es")).toBe("10:00 pm a 2:00 am");
    expect(fmtRange([600, 1900], "en")).toBe("6:00 am – 7:00 pm");
    expect(fmtRange([2400, 2600], "es")).toBe("12:00 am a 2:00 am");
  });

  it("las franjas de dos horas", () => {
    expect(slotLabel(600)).toBe("6–8 am");
    expect(slotLabel(1000)).toBe("10 am–12 pm");
    expect(slotLabel(2200)).toBe("10 pm–12 am");
    expect(slotLabel(2400)).toBe("12–2 am");
  });
});

describe("listas", () => {
  it("por defecto: cualquier lugar, primavera, sol, 6 a 8 de la mañana", () => {
    expect(DEFAULT_FISH_STATE).toMatchObject({ place: "any", season: 0, weather: "sunny", time: 600 });
    const now = catchNow(data, DEFAULT_FISH_STATE, "en").map((f) => f.slug);
    expect(now).toContain("sardine");
    expect(now).toContain("lobster");
    expect(now).not.toContain("catfish");
    expect(now).not.toContain("pufferfish");
  });

  it("la tabla tiene los 74 y se filtra por tipo y por estación", () => {
    expect(fishTable(data, DEFAULT_FISH_STATE, "en")).toHaveLength(74);
    const legends = fishTable(data, st({ kind: "legendary" }), "en");
    expect(legends.every((f) => f.legendary)).toBe(true);
    expect(legends.map((f) => f.slug)).toContain("crimsonfish");
    const traps = fishTable(data, st({ kind: "crabPot" }), "en");
    expect(traps).toHaveLength(10);
    expect(fishTable(data, st({ kind: "rod" }), "en").some((f) => f.crabPot)).toBe(false);
    const winter = fishTable(data, st({ tseason: 3 }), "en").map((f) => f.slug);
    expect(winter).toContain("squid");
    expect(winter).not.toContain("sunfish");
  });

  it("el precio sale de la lista de objetos", () => {
    expect(data.prices["128"]).toBe(200);
  });
});

describe("la dirección de Pesca", () => {
  it("los valores por defecto no escriben nada", () => {
    expect(writeFishState(DEFAULT_FISH_STATE)).toBe("");
    expect(readFishState("", placeKeys)).toEqual(DEFAULT_FISH_STATE);
  });

  it("conserva los filtros", () => {
    const s = st({ place: "CrabPot:ocean", season: 3, weather: "rainy", time: 2400, kind: "legendary", tseason: 2 });
    const q = writeFishState(s);
    expect(q.startsWith("?")).toBe(true);
    expect(readFishState(q, placeKeys)).toEqual(s);
    expect(readFishState(writeFishState(st({ time: null })), placeKeys).time).toBeNull();
  });

  it("un valor inválido cae al defecto", () => {
    expect(readFishState("?place=Narnia&season=9&weather=snow&time=700&kind=boss&tseason=x", placeKeys)).toEqual(DEFAULT_FISH_STATE);
    expect(readFishState("?time=2600", placeKeys).time).toBe(DEFAULT_FISH_STATE.time);
  });

  it("la pestaña se escribe en su idioma", () => {
    expect(routePath({ ...route, lang: "es" })).toBe("/es/stardew-valley/pesca");
    expect(routePath(route)).toBe("/en/stardew-valley/fishing");
    expect(parseRoute("/es/stardew-valley/pesca")).toMatchObject({ view: "stardew", sdSection: "fishing" });
  });
});

describe("pantalla de Pesca", () => {
  it("los filtros cambian la grilla", () => {
    const base = screen(DEFAULT_FISH_STATE);
    expect(base.now).toContain("sardine");
    expect(base.now).not.toContain("catfish");
    const rain = screen(st({ weather: "rainy" }));
    expect(rain.now).toContain("catfish");
    expect(rain.now).not.toEqual(base.now);
    const night = screen(st({ season: 2, time: 2400, place: "Mountain" }));
    expect(night.now).toContain("midnight-carp");
    expect(night.now).not.toContain("lobster");
    const trap = screen(st({ place: "CrabPot:freshwater", time: 1400 }));
    expect(trap.now.sort()).toEqual(["crayfish", "periwinkle", "snail"]);
  });

  it("la tabla con los 74, las etiquetas de legendario y trampa, y el enlace a la ficha", () => {
    const { html, rows } = screen(DEFAULT_FISH_STATE, "es");
    expect(rows).toHaveLength(74);
    expect(html).toContain("Legendario");
    expect(html).toContain("Trampa");
    expect(html).toContain('href="/es/stardew-valley/objetos/pez-globo"');
    expect(html).toContain("10:00 pm a 2:00 am");
    expect(html).toContain("Encargo del Sr. Qi");
  });

  it("filtrar la tabla no toca la grilla", () => {
    const a = screen(DEFAULT_FISH_STATE);
    const b = screen(st({ kind: "legendary" }));
    expect(b.now).toEqual(a.now);
    expect(b.rows.length).toBeLessThan(a.rows.length);
  });
});
