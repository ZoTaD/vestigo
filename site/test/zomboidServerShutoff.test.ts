/**
 * La calculadora de cortes de agua y luz (2026-10-02), `/servidor/cortes-de-agua-y-luz`: la cuenta (`shutoffCalc.ts`, pura)
 * con valores calculados a mano, y la página como la escribe el prerender, en español (abierta en frío) y en inglés.
 *
 * Archivo aparte, como `zomboidServerPresets.test.ts`: el primer test de la página abre la dirección en español antes de
 * que nadie haya anotado los slugs de la pestaña. Por eso acá no se importa de entrada nada que traiga
 * `ZomboidServer.tsx` ni `Zomboid.tsx` (su portada también los anota).
 */
import { describe, expect, it } from "vitest";
import pzIndex from "../../games/zomboid/data/index.json";
import { renderApp } from "../src/entry-server";
import { metaFor } from "../src/prerender";
import { parseRoute, type PzTab } from "../src/route";
import { fullPreset } from "../src/zomboid/server/data";
import { cutAt, cutRange, realTime, worldOf, type Cut, type World } from "../src/zomboid/server/shutoffCalc";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const ES_PATH = "/es/project-zomboid/servidor/cortes-de-agua-y-luz";
const EN_PATH = "/en/project-zomboid/server/water-and-power-shutoff";

/** El 9 de julio de 1993 a las 9 AM, sin meses desde el apocalipsis y con días de 1 h 30 min: Apocalipsis. */
const APO: World = { year: 1993, month: 7, day: 9, startTime: 2, timeSinceApo: 1, dayLength: 4 };
const at = (c: Cut) => (c.kind === "at" ? { iso: c.date.toISOString(), h: c.afterStartHours } : c.kind);
const iso = (s: string) => new Date(s).toISOString();

describe("cutAt", () => {
  it("el mundo de Apocalipsis: el 9 de julio de 1993 a las 9 AM, con 14 días", () => {
    expect(worldOf(fullPreset("apocalypse"))).toEqual(APO);
    expect(fullPreset("apocalypse").WaterShutModifier).toBe(14);
  });

  it("servidor con Apocalipsis: agua y luz el 23 de julio a las 7:00, 334 h después de empezar", () => {
    for (const what of ["water", "power"] as const) expect(at(cutAt(APO, 14, what))).toEqual({ iso: iso("1993-07-23T07:00Z"), h: 334 });
  });

  it("6 meses después: −1 con 6 meses desde el apocalipsis, ya no hay al empezar", () => {
    const w = worldOf(fullPreset("six-months-later"));
    expect(w.timeSinceApo).toBe(7);
    expect(cutAt(w, -1, "water")).toEqual({ kind: "start" });
    expect(cutAt(w, -1, "power")).toEqual({ kind: "start" });
  });

  it("un mes desde el apocalipsis resta 30 días: con 14, ya no hay; con 45, el 24 de julio", () => {
    const w = { ...APO, timeSinceApo: 2 };
    expect(cutAt(w, 14, "water")).toEqual({ kind: "start" });
    expect(cutAt(w, 14, "power")).toEqual({ kind: "start" });
    expect(at(cutAt(w, 45, "water"))).toEqual({ iso: iso("1993-07-24T07:00Z"), h: 358 });
  });

  it("arrancando a las 12 AM, la edad cuenta desde las 7:00 del día anterior", () => {
    expect(at(cutAt({ ...APO, startTime: 7 }, 14, "water"))).toEqual({ iso: iso("1993-07-22T07:00Z"), h: 319 });
  });

  it("2147483647 es nunca", () => {
    expect(cutAt(APO, 2147483647, "water")).toEqual({ kind: "never" });
    expect(cutAt(APO, 2147483647, "power")).toEqual({ kind: "never" });
  });

  it("arrancando justo a las 7 AM, el primer tick ya suma una noche: con 14, el 22 de julio, 312 h después", () => {
    // `GameTime.update` suma la noche cuando la hora previa es <= 7 y la nueva > 7: con 7:00 en punto, en el primer tick.
    const w = { ...APO, startTime: 1 };
    for (const what of ["water", "power"] as const) expect(at(cutAt(w, 14, what))).toEqual({ iso: iso("1993-07-22T07:00Z"), h: 312 });
    expect(cutAt(w, 0, "water")).toEqual({ kind: "start" });
    expect(cutAt(w, 0, "power")).toEqual({ kind: "start" });
  });

  it("el borde: con 1 y arranque a las 7 AM (edad 24 h), el agua ya no está y la luz se corta justo al empezar", () => {
    const w = { ...APO, startTime: 1 };
    expect(cutAt(w, 1, "water")).toEqual({ kind: "start" });
    expect(at(cutAt(w, 1, "power"))).toEqual({ iso: iso("1993-07-09T07:00Z"), h: 0 });
  });

  it("el año elegido manda en el calendario: en 1996 (bisiesto) el 15 de febrero + 14 días es el 29", () => {
    const w = { ...APO, year: 1996, month: 2, day: 15 };
    expect(at(cutAt(w, 14, "water"))).toEqual({ iso: iso("1996-02-29T07:00Z"), h: 334 });
  });
});

describe("cutRange", () => {
  it("un jugador con Apocalipsis: el agua (0-30 días) va de ya cortada al 7 de agosto, que es el día 29", () => {
    const r = cutRange(APO, 2, "water");
    expect(r.from).toEqual({ kind: "start" });
    expect(at(r.to)).toEqual({ iso: iso("1993-08-07T07:00Z"), h: 29 * 24 - 2 });
  });

  it("la luz (14 a 30 días) va del 23 de julio al 7 de agosto", () => {
    const r = cutRange(APO, 2, "power");
    expect(at(r.from)).toEqual({ iso: iso("1993-07-23T07:00Z"), h: 334 });
    expect(at(r.to)).toEqual({ iso: iso("1993-08-07T07:00Z"), h: 29 * 24 - 2 });
  });

  it("Brote inicial: el agua (0-2 meses, opción 3) hasta el 6 de septiembre, el día 59", () => {
    const w = worldOf(fullPreset("outbreak"));
    expect(fullPreset("outbreak").WaterShut).toBe(3);
    expect(at(cutRange(w, 3, "water").to)).toEqual({ iso: iso("1993-09-06T07:00Z"), h: 59 * 24 - 2 });
  });

  it("Instantáneo y Deshabilitado", () => {
    expect(cutRange(APO, 1, "water")).toEqual({ from: { kind: "start" }, to: { kind: "start" } });
    expect(cutRange(APO, 9, "power")).toEqual({ from: { kind: "never" }, to: { kind: "never" } });
  });
});

describe("realTime", () => {
  it("334 h del juego con días de 1 h 30 min son 1252,5 minutos reales", () => {
    expect(realTime(APO, 334)).toBe(1252.5);
  });
  it("en tiempo real, una hora es una hora", () => {
    expect(realTime({ ...APO, dayLength: 27 }, 334)).toBe(334 * 60);
  });
});

describe("la página", () => {
  it("en español, abierta en frío: el 23 de julio de 1993 y el texto propio", async () => {
    expect(parseRoute(ES_PATH)).toMatchObject({ pzSection: "server", detail: "cortes-de-agua-y-luz" });
    // `Zomboid.tsx` se importa recién acá: su portada anota los slugs del Servidor al cargarse (enlaza dos fichas), y con
    // un import de arriba la dirección ya llegaría traducida.
    const { preloadTab } = await import("../src/Zomboid");
    await preloadTab(parseRoute(ES_PATH));
    expect(parseRoute(ES_PATH)).toMatchObject({ pzSection: "server", detail: "water-and-power-shutoff" });

    // Las duraciones llevan espacios duros entre la cifra y la unidad ("20 h"): acá se leen como espacios.
    const html = (await renderApp(parseRoute(ES_PATH))).replace(/\u00a0/g, " ");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Cortes de agua y luz en Project Zomboid<\/h1>/);
    expect(html).not.toContain("No encontramos");
    expect(html).not.toContain("pz-loading");
    expect(html).not.toMatch(/archivos del juego|sacad[oa] de/i);
    // El breadcrumb: Servidor › Cortes de agua y luz.
    expect(html).toMatch(/<nav class="pzi-crumb"[^>]*><a href="\/es\/project-zomboid\/servidor"[^>]*>Servidor<\/a>/);
    // Apocalipsis en un servidor: el agua y la luz, el 23 de julio a las 7:00, con lo que eso es en días y en tiempo real.
    expect(html.match(/23 de julio de 1993, 7:00/g)).toHaveLength(2);
    expect(html).toContain("13 días y 22 horas después de empezar");
    expect(html).toContain("≈ 20 h 53 min reales con días de 1 h 30 min");
    expect(html).toContain("Arranca el 9 de julio de 1993, 9:00");
    // Los dos modos y las entradas con las etiquetas del juego.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Servidor</);
    expect(html).toContain("Partida de un jugador");
    expect(html).toContain("Meses desde el apocalipsis");
    expect(html).toContain(">Julio<");
    expect(html).toContain(">9 AM<");
    expect(html).toContain(">1 hora y media<");
    // El texto propio: lo que nadie explica.
    expect(html).toContain("En un servidor manda el modificador");
    expect(html).toContain("El día se cuenta desde las 7:00");
    expect(html).toContain("Cada mes desde el apocalipsis resta 30 días");
    expect(html).toContain("es en realidad de 0 a 29");
    // Volver al generador con estos valores (Apocalipsis sin cambios: la dirección limpia).
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/servidor"[^>]*>Llevar estos valores al generador/);
  });

  it("en inglés", async () => {
    const html = await renderApp(parseRoute(EN_PATH));
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Water and Power Shutoff<\/h1>/);
    expect(html).toContain("July 23, 1993, 7:00");
    expect(html).toContain("13 days and 22 hours after you start");
    expect(html).toContain("On a server the modifier is what counts");
    expect(html).not.toContain("pz-loading");
  });

  it("el generador dice el día del corte junto a cada modificador", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/servidor"));
    const water = html.match(/data-key="WaterShutModifier"([\s\S]*?)class="pzsv-meta"/)?.[1] ?? "";
    const power = html.match(/data-key="ElecShutModifier"([\s\S]*?)class="pzsv-meta"/)?.[1] ?? "";
    expect(water).toContain("Con esta configuración, el agua se corta el 23 de julio de 1993, 7:00.");
    expect(power).toContain("Con esta configuración, la luz se corta el 23 de julio de 1993, 7:00.");
    // Y el link a la calculadora (Apocalipsis sin cambios: sin `?`; en el navegador lleva `?p=&s=`).
    for (const note of [water, power]) expect(note).toMatch(/<a href="\/es\/project-zomboid\/servidor\/cortes-de-agua-y-luz">Calculadora de cortes(<!-- -->)? →<\/a>/);
    const en = await renderApp(parseRoute("/en/project-zomboid/server"));
    expect(en).toContain("With these settings, the water shuts off on July 23, 1993, 7:00");
  });

  it("el <head> es el de la ficha", () => {
    const entry = INDEX.find((e) => e.sec === "server" && e.id === "water-and-power-shutoff")!;
    const es = metaFor(parseRoute(ES_PATH), "es", entry.es);
    const en = metaFor(parseRoute(EN_PATH), "en", entry.en);
    expect(es.title).toBe("Cortes de agua y luz en Project Zomboid (Build 42) | Vestigo");
    expect(en.title).toBe("Project Zomboid Water and Power Shutoff (Build 42) | Vestigo");
    // Las dos de 60 (el plan decía 59 para la de español: mide 60), debajo del tope de 65.
    expect(es.title.length).toBe(60);
    expect(en.title.length).toBe(60);
    expect(es.description).toContain("la fecha y la hora exactas");
  });
});
