/**
 * El Mapa de Project Zomboid en el servidor (2026-09-30): Leaflet no corre en el prerender, así que el HTML de la
 * pestaña trae la hoja de introducción (con las cifras del mapa) y la vista del mapa entero como imagen, en los dos
 * idiomas. El visor se monta después, en el navegador.
 *
 * Si algo del render importara Leaflet (que toca `window` y `document` al cargarse), este archivo ni arrancaría: el
 * `vi.mock` de abajo lo hace explotar a propósito.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LangContext } from "../src/i18n";
import { parseRoute, type Route } from "../src/route";
import ZomboidMap from "../src/zomboid/map/ZomboidMap";
import { MAP_COPY } from "../src/zomboid/map/copy";
import mapMeta from "../../games/zomboid/data/map/meta.json";
import type { MapCommon } from "../src/zomboid/map/data";

vi.mock("leaflet", () => {
  throw new Error("Leaflet no puede entrar al render del servidor");
});

const route = (lang: "en" | "es"): Route => ({ ...parseRoute(`/${lang}/project-zomboid`), pzSection: "map" });
const render = (lang: "en" | "es") =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang, setLang: () => undefined } },
      createElement(ZomboidMap, { route: route(lang), navigate: () => undefined }),
    ),
  );

describe("el Mapa en el prerender", () => {
  it("corre sin navegador", () => {
    expect(typeof window).toBe("undefined");
    expect(() => render("es")).not.toThrow();
  });

  it("en español: el título que se busca, la intro con las cifras del mapa y la vista entera", () => {
    const html = render("es");
    expect(html).toMatch(/<h1[^>]*>Mapa de Project Zomboid/);
    const n = (v: number) => v.toLocaleString("es-AR");
    expect(mapMeta.counts.buildings).toBeGreaterThan(9000);
    for (const v of [mapMeta.counts.buildings, mapMeta.counts.streets, mapMeta.counts.stashes]) expect(html).toContain(n(v));
    expect(html).toContain("Knox County");
    expect(html).toMatch(/<img[^>]+src="\/zomboid\/map\/overview\.webp"/);
    expect(html).toMatch(/<img[^>]+alt="[^"]*Knox County[^"]*"/);
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("en");
    expect(html).toMatch(/<h1[^>]*>Project Zomboid Map/);
    expect(html).toContain(mapMeta.counts.buildings.toLocaleString("en-US"));
    expect(html).toContain(MAP_COPY.en.base.sat);
    expect(html).not.toContain(MAP_COPY.es.base.paper);
  });

  it("la vista del mapa entero es lo más grande de la página (la pinta Google y el primer cuadro): prioridad alta", () => {
    for (const lang of ["en", "es"] as const) {
      const img = render(lang).match(/<img[^>]*overview\.webp[^>]*>/)?.[0];
      expect(img, lang).toContain('fetchpriority="high"');
    }
  });

  it("la imagen del mapa entero existe y la intro no cuenta de dónde salen los datos", () => {
    expect(existsSync(join(__dirname, "..", "public", "zomboid", "map", "overview.webp"))).toBe(true);
    for (const lang of ["en", "es"] as const) {
      const html = render(lang).toLowerCase();
      expect(html).not.toMatch(/game files|archivos del juego|extra[íi]d|sacad[oa]s? de/);
    }
  });

  it("los controles del visor ya están en el HTML (la base y el link), sin depender de la dirección", () => {
    const html = render("es");
    expect(html).toContain(MAP_COPY.es.base.sat);
    expect(html).toContain(MAP_COPY.es.base.paper);
    expect(html).toContain(MAP_COPY.es.place.copy);
    // La dirección (?x=&y=) no existe en el servidor: las coordenadas se escriben recién en el navegador.
    expect(html).not.toMatch(/x=\d/);
  });
});

/**
 * El chunk de la pestaña tiene que llegar rápido para el primer dibujo: lo que sólo usa el visor (la lógica de las capas,
 * las tablas de nombres de zonas, la lista de archivos de las regiones) no puede entrar por un import de la página.
 */
describe("lo que viaja en el chunk de la pestaña", () => {
  const dir = join(__dirname, "..", "src", "zomboid", "map");
  // Los `import type` no cuentan: TypeScript los borra y no traen código.
  const imports = (f: string) =>
    [...readFileSync(join(dir, f), "utf-8").matchAll(/^import(?!\s+type\b)[^;]*?from\s+"([^"]+)"/gms)].map((m) => m[1]);

  it("la página, la leyenda, la hoja del escondite, el buscador y sus módulos no importan lo del visor", () => {
    const tab = ["ZomboidMap.tsx", "Legend.tsx", "StashCard.tsx", "MapSearch.tsx", "copy.ts", "layerMeta.ts", "url.ts", "data.ts"];
    for (const f of tab) {
      const got = imports(f);
      // Tampoco la hoja del edificio ni las tablas de habitaciones (Task 4): llegan con `lazy()`, después del visor.
      for (const viewerOnly of ["./layers", "./zoneNames", "./regionData", "./overlays", "./labels", "./paper", "./rooms", "./BuildingSheet", "./search", "./heat"])
        expect(got, `${f} importa ${viewerOnly}`).not.toContain(viewerOnly);
    }
    // El visor, sí; y `import.meta.glob` sólo en regionData.ts.
    expect(imports("overlays.ts")).toEqual(expect.arrayContaining(["./layers", "./zoneNames", "./regionData"]));
    expect(imports("overlays.ts")).toContain("./heat");
    expect(readFileSync(join(dir, "data.ts"), "utf-8")).not.toContain("import.meta.glob");
    expect(readFileSync(join(dir, "regionData.ts"), "utf-8")).toContain("import.meta.glob");
    // La hoja del edificio, con `lazy(() => import(...))`; el buscador (su orden y `search.json`), con `import()` al
    // entrar al buscador.
    expect(readFileSync(join(dir, "ZomboidMap.tsx"), "utf-8")).toContain('import("./BuildingSheet")');
    expect(readFileSync(join(dir, "MapSearch.tsx"), "utf-8")).toContain('import("./search")');
    // El visor lleva la geometría de los edificios, no las tablas de nombres de las habitaciones (van con la hoja).
    expect(imports("viewer.ts")).toContain("./buildings");
    expect(imports("viewer.ts")).not.toContain("./rooms");
    expect(imports("BuildingSheet.tsx")).toContain("./rooms");
  });
});

/**
 * `destroy()` de `viewer.ts` esquiva un error de Leaflet 1.9 tocando dos campos que Leaflet no publica: `_animatingZoom` (el
 * fin de la animación de zoom) y `scrollWheelZoom._timer` (el zoom pendiente de la rueda). Si una versión nueva de Leaflet
 * los renombra, la limpieza no hace nada y el error vuelve sin avisar: este canario falla antes.
 */
describe("los campos privados de Leaflet que usa destroy()", () => {
  // El que se empaqueta es `leaflet-src.js` (Leaflet 1.9.4 no tiene campo `module`: Vite toma `main`); el `.esm.js`
  // también se mira, por si una versión nueva lo publica como `module` y pasa a ser ese.
  const dist = join(__dirname, "..", "node_modules", "leaflet", "dist");
  const files = ["leaflet-src.js", "leaflet-src.esm.js"].map((f) => [f, readFileSync(join(dist, f), "utf-8")] as const);

  it("lo que se empaqueta es leaflet-src.js", () => {
    const pkg = JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf-8")) as { main?: string; module?: string };
    expect(pkg.module ?? pkg.main).toBe("dist/leaflet-src.js");
  });

  it("Leaflet todavía los escribe: _animatingZoom y scrollWheelZoom._timer", () => {
    for (const [f, src] of files) {
      expect(src, f).toMatch(/this\._animatingZoom\s*=/);
      // El manejador de la rueda se cuelga del mapa con la clave `scrollWheelZoom` (`map.scrollWheelZoom`)…
      expect(src, f).toMatch(/addInitHook\(\s*'addHandler',\s*'scrollWheelZoom'/);
      // …y su `_timer` lo arma `_onWheelScroll` con un setTimeout.
      expect(src, f).toMatch(/this\._timer\s*=\s*setTimeout\(bind\(this\._performZoom/);
    }
  });

  it("y viewer.ts los toca con `?.`: sin rueda (o sin ese campo) destroy() no tira antes de map.remove()", () => {
    const viewer = readFileSync(join(__dirname, "..", "src", "zomboid", "map", "viewer.ts"), "utf-8");
    expect(viewer).toMatch(/scrollWheelZoom\?\._timer/);
    expect(viewer).not.toMatch(/scrollWheelZoom\._timer/);
  });
});

/**
 * El dibujo de la base de papel y de los nombres, sin navegador: un contexto de canvas de mentira anota lo que se le
 * pide. Leaflet sigue afuera (el `vi.mock` de arriba): `paper.ts` y `labels.ts` sólo lo importan como tipo.
 */
function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
    lineTo: () => calls.push("line"),
    closePath: () => undefined,
    fill: (rule?: string) => calls.push(`fill ${ctx.fillStyle} ${rule ?? ""}`.trim()),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle}`),
    save: () => undefined,
    restore: () => undefined,
    translate: (x: number, y: number) => calls.push(`at ${x},${y}`),
    rotate: () => undefined,
    measureText: (s: string) => ({ width: s.length * 6 }),
    strokeText: () => undefined,
    fillText: (s: string) => calls.push(`text ${s}`),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("la base de papel", async () => {
  const { drawPaper, pxPerTile, regionsIn, tileRect } = await import("../src/zomboid/map/paper");
  const common = (await import("../../games/zomboid/data/map/web/common.json")).default as unknown as MapCommon;

  it("una tesela cubre la parte del mundo que dice tiles.json: 256 casillas al zoom 4, 4.096 al 0", () => {
    expect(pxPerTile(4)).toBe(1);
    expect(tileRect(41, 37, 4)).toEqual({ x0: 10496, y0: 9472, x1: 10752, y1: 9728 });
    expect(tileRect(2, 2, 0)).toEqual({ x0: 8192, y0: 8192, x1: 12288, y1: 12288 });
  });

  it("pide sólo las regiones con dibujo que toca la tesela (el Knox Bank de Muldraugh está en la 7_6)", () => {
    // La tesela del banco (10623, 9685) va de 10.496 a 10.752: cruza la frontera de 10.500 y pide las dos regiones.
    expect(regionsIn(tileRect(41, 37, 4), common.regions)).toEqual(["6_6", "7_6"]);
    expect(regionsIn(tileRect(42, 37, 4), common.regions)).toEqual(["7_6"]);
    // Una tesela del zoom 0 toca varias regiones, y ninguna sin dibujo.
    const ids = regionsIn(tileRect(2, 2, 0), common.regions);
    expect(ids.length).toBeGreaterThan(4);
    for (const id of ids) expect(common.regions.find((r) => r.id === id)?.draw).toBe(1);
  });

  it("pinta en el orden del mapa de papel (agua, rutas, edificios) y sólo lo que cae en la tesela", () => {
    const { ctx, calls } = fakeCtx();
    const rect = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const square = (x: number, y: number) => [[x, y, x + 10, y, x + 10, y + 10, x, y + 10]];
    drawPaper(
      ctx,
      [
        {
          b: { Residential: [square(10, 10), square(500, 500)] },
          roads: { primary: [square(20, 20)], trail: [square(30, 30)] },
          water: [square(40, 40)],
        },
      ],
      common.style,
      rect,
      1,
    );
    const fills = calls.filter((c) => c.startsWith("fill"));
    const rgb = (c: number[]) => `rgb(${c.join(",")})`;
    expect(fills).toEqual([
      `fill ${rgb(common.style.water)} nonzero`,
      `fill ${rgb(common.style.roads.trail)} nonzero`,
      `fill ${rgb(common.style.roads.primary)} nonzero`,
      `fill ${rgb(common.style.buildings.Residential)} nonzero`,
    ]);
    // El edificio de (500, 500) queda afuera: no se traza.
    expect(calls).not.toContain("move 500,500");
  });
});

describe("los nombres del mapa", async () => {
  const { labelText, labelVisible, streetLabels, drawStreetLabels, fits, STREET_THEME, STREETS_FROM } = await import("../src/zomboid/map/labels");
  const common = (await import("../../games/zomboid/data/map/web/common.json")).default as unknown as MapCommon;
  const label = (key: string) => common.labels.find((l) => l.key === key)!;

  it("los pueblos se ven de lejos y se van de cerca, cuando llegan las calles", () => {
    const muldraugh = label("MapLabel_Muldraugh");
    expect(labelVisible(muldraugh, 0)).toBe(true);
    expect(labelVisible(muldraugh, 2)).toBe(true);
    expect(labelVisible(muldraugh, STREETS_FROM + 0.5)).toBe(false);
    // Los lugares (el aeropuerto, un camping) al revés: de cerca.
    const place = common.labels.find((l) => l.layer === "text-place")!;
    expect(labelVisible(place, 1)).toBe(false);
    expect(labelVisible(place, 4)).toBe(true);
  });

  it("con la traducción del juego donde la tiene", () => {
    expect(labelText(label("MapLabel_OhioRiver"), "es")).toBe("RÍO OHIO");
    expect(labelText(label("MapLabel_OhioRiver"), "en")).toBe("OHIO RIVER");
    expect(labelText(label("MapLabel_Muldraugh"), "es")).toBe("MULDRAUGH");
  });

  it("una calle lleva su nombre sólo si entra a lo largo, y cada tesela escribe las que la tocan", () => {
    const labels = streetLabels(common.streets);
    expect(labels).toHaveLength(common.streets.length);
    const oak = labels.find((l) => l.name === "Oak St")!;
    expect(oak.length).toBeGreaterThan(1000);
    expect(fits(oak, 40, 0.5)).toBe(true);
    expect(fits({ ...oak, length: 20 }, 40, 0.5)).toBe(false);
    // La tesela del zoom 4 donde cae el nombre de Oak St lo escribe, en su lugar de la tesela.
    const { ctx, calls } = fakeCtx();
    const rect = { x0: Math.floor(oak.x / 256) * 256, y0: Math.floor(oak.y / 256) * 256, x1: 0, y1: 0 };
    rect.x1 = rect.x0 + 256;
    rect.y1 = rect.y0 + 256;
    drawStreetLabels(ctx, labels, rect, 4, STREET_THEME.sat);
    expect(calls).toContain("text Oak St");
    expect(calls).toContain(`at ${oak.x - rect.x0},${oak.y - rect.y0}`);
  });
});
