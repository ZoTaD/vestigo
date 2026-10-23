/**
 * La pestaña Calendario de Stardew Valley (etapa 2, tarea 7): la dirección que guarda la estación y el día, el tablón de
 * 28 días con los festivales de varios días en cada celda de su rango, el detalle de un día con el cumpleañero y sus
 * regalos, y los festivales con rango en la portada. La pantalla se dibuja sin navegador (como el prerender).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import calRaw from "../../games/stardew/data/calendar.json";
import home from "../../games/stardew/data/home.json";
import listRaw from "../../games/stardew/data/site/list.json";
import namesEn from "../../games/stardew/data/site/names-en.json";
import villagersRaw from "../../games/stardew/data/villagers.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, type Route } from "../src/route";
import { CalendarBoard } from "../src/stardew/calendar/StardewCalendar";
import {
  DEFAULT_CALENDAR_STATE,
  festivalRange,
  readCalendarState,
  seasonCells,
  writeCalendarState,
  type CalendarData,
  type CalendarState,
} from "../src/stardew/calendar/state";
import type { CalendarBundle, Row, Villager } from "../src/stardew/data";
import StardewHome from "../src/stardew/StardewHome";

const cal = calRaw as unknown as CalendarData;
type RawRow = [string, string, number, number, number, number, number];
const rows: Row[] = (listRaw as unknown as RawRow[]).map((r, i) => ({
  id: r[0],
  slug: r[1],
  name: (namesEn as string[])[i],
  cat: r[2],
  price: r[3],
  w: r[4],
  h: r[5],
  has: r[6],
}));
const data: CalendarBundle = { cal, villagers: villagersRaw as unknown as Villager[], rows };
const route = { lang: "en", view: "stardew", sdSection: "calendar" } as Route;
const st = (x: Partial<CalendarState>): CalendarState => ({ ...DEFAULT_CALENDAR_STATE, ...x });
const WINTER = 3;
const FALL = 2;

function screen(state: CalendarState, lang: "en" | "es" = "en") {
  return renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(CalendarBoard, { data, route: { ...route, lang }, navigate: () => undefined, initial: state })),
  );
}
/** El HTML de la celda de un día. */
const cellOf = (html: string, day: number): string => {
  const at = html.lastIndexOf("<button", html.indexOf(`data-day="${day}"`));
  return html.slice(at, html.indexOf("</button>", at));
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("la dirección del Calendario", () => {
  it("se abre en primavera y sin día; el valor por defecto no se escribe", () => {
    expect(readCalendarState("")).toEqual({ season: 0, day: null });
    expect(writeCalendarState(DEFAULT_CALENDAR_STATE)).toBe("");
  });

  it("conserva la estación y el día", () => {
    const s = st({ season: FALL, day: 13 });
    expect(writeCalendarState(s)).toBe("?season=fall&day=13");
    expect(readCalendarState(writeCalendarState(s))).toEqual(s);
    expect(readCalendarState("?season=winter")).toEqual({ season: WINTER, day: null });
    expect(readCalendarState("?day=28")).toEqual({ season: 0, day: 28 });
  });

  it("una estación o un día inválidos caen al valor por defecto", () => {
    expect(readCalendarState("?season=monsoon&day=13")).toEqual({ season: 0, day: 13 });
    for (const day of ["0", "29", "-1", "1.5", "abc", "", "013"]) expect(readCalendarState(`?season=fall&day=${day}`)).toEqual({ season: FALL, day: null });
  });

  it("la pestaña tiene dirección en los dos idiomas", () => {
    expect(routePath(route)).toBe("/en/stardew-valley/calendar");
    expect(routePath({ ...route, lang: "es" })).toBe("/es/stardew-valley/calendario");
    expect(parseRoute("/es/stardew-valley/calendario")).toMatchObject({ view: "stardew", sdSection: "calendar", lang: "es" });
    expect(parseRoute("/en/stardew-valley/calendar/abigail").detail).toBeUndefined();
  });
});

describe("el tablón", () => {
  it("son 28 días, de a 7 por semana", () => {
    const html = screen(DEFAULT_CALENDAR_STATE);
    expect([...html.matchAll(/data-day="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("invierno muestra el Mercado nocturno en los días 15, 16 y 17, con el tinte que cruza hasta el 17", () => {
    const html = screen(st({ season: WINTER }));
    for (const day of [15, 16, 17]) {
      expect(cellOf(html, day)).toContain('data-fest="NightMarket"');
      expect(text(cellOf(html, day))).toContain("Night Market");
      expect(cellOf(html, day)).toContain("is-passive");
    }
    expect(cellOf(html, 14)).not.toContain("NightMarket");
    expect(cellOf(html, 18)).not.toContain("NightMarket");
    // El tinte sigue a la celda de al lado en el 15 y el 16; el 17 cierra el rango.
    expect(cellOf(html, 15)).toContain("joins-next");
    expect(cellOf(html, 16)).toContain("joins-next");
    expect(cellOf(html, 17)).not.toContain("joins-next");
    // El 17 también es el cumpleaños del Mago.
    expect(cellOf(html, 17)).toContain("/stardew/portraits/wizard.png");
  });

  it("un rango no cruza de una semana a la otra", () => {
    const cells = seasonCells({ seasons: [{ days: { "7": { birthdays: [], festivals: [{ id: "x", name: ["X", "X"], from: 7, to: 8, passive: true }] } } }] }, 0);
    expect(cells[6].festivals[0].joinsNext).toBe(false);
  });

  it("un festival de un día ocupa el día (no es pasivo) y lleva su retrato el cumpleaños", () => {
    const html = screen(st({ season: FALL }));
    expect(cellOf(html, 16)).toContain("is-fest");
    expect(text(cellOf(html, 16))).toContain("Stardew Valley Fair");
    expect(cellOf(html, 13)).toContain("/stardew/portraits/abigail.png");
    expect(cellOf(html, 13)).toContain('aria-label="Fall 13 · Abigail&#x27;s birthday"');
  });

  it("sin día elegido no hay detalle, sólo la indicación", () => {
    const html = screen(DEFAULT_CALENDAR_STATE);
    expect(html).not.toContain("data-detail");
    expect(html).toContain("Tap a day");
    expect(html.slice(html.indexOf('class="sd-cal"'))).not.toContain('aria-pressed="true"');
  });
});

describe("el detalle de un día", () => {
  it("el 13 de otoño muestra a Abigail con su ficha y los regalos que le encantan enlazados", () => {
    const html = screen(st({ season: FALL, day: 13 }));
    expect(cellOf(html, 13)).toContain('aria-pressed="true"');
    const at = html.indexOf('data-detail="13"');
    expect(at).toBeGreaterThan(0);
    const detail = html.slice(at);
    expect(text(detail)).toContain("Fall 13");
    expect(text(detail)).toContain("Abigail's birthday");
    expect(detail).toContain('href="/en/stardew-valley/villagers/abigail"');
    // La Amatista (66), la Calabaza (276) y el Pez globo (128) le encantan: casilleros enlazados a su ficha.
    expect(detail).toContain('href="/en/stardew-valley/items/amethyst"');
    expect(detail).toContain('href="/en/stardew-valley/items/pumpkin"');
    expect(detail).toContain('href="/en/stardew-valley/items/pufferfish"');
    expect(detail).toContain("/stardew/items/66.png");
    expect(text(detail)).toContain("Loves it");
  });

  it("un día de festival muestra su rango", () => {
    const html = screen(st({ season: WINTER, day: 16 }));
    const detail = text(html.slice(html.indexOf('data-detail="16"')));
    expect(detail).toContain("Night Market");
    expect(detail).toContain("Winter 15–17");
    expect(detail).toContain("Passive festival");
  });

  it("en español, con el rango y el día en su forma", () => {
    const html = screen(st({ season: WINTER, day: 15 }), "es");
    const detail = text(html.slice(html.indexOf('data-detail="15"')));
    expect(detail).toContain("15 de invierno");
    expect(detail).toContain("Mercado nocturno");
    expect(detail).toContain("15–17 de invierno");
  });

  it("un día vacío lo dice", () => {
    const html = screen(st({ season: 0, day: 2 }));
    expect(text(html.slice(html.indexOf('data-detail="2"')))).toContain("No birthdays or festivals");
  });
});

describe("los festivales en la portada", () => {
  it("el rango se escribe con raya: 15–17, o el día solo", () => {
    expect(festivalRange(15, 17)).toBe("15–17");
    expect(festivalRange(8, 8)).toBe("8");
  });

  it("home.json trae los pasivos de la 1.6 con su rango, iguales a los del calendario", () => {
    const winter = (home.seasons[WINTER].festivals as [number, number, [string, string]][]).map(([from, to, name]) => [from, to, name[0]]);
    expect(winter).toContainEqual([15, 17, "Night Market"]);
    expect(winter).toContainEqual([12, 13, "SquidFest"]);
    // Cada festival de la portada es uno del calendario con el mismo rango.
    home.seasons.forEach((s, i) => {
      for (const [from, to, name] of s.festivals as [number, number, [string, string]][]) {
        const f = cal.seasons[i].days[String(from)]?.festivals.find((x) => x.name[0] === name[0]);
        expect(f, `${name[0]}`).toMatchObject({ from, to });
      }
    });
  });

  it("la portada muestra el Festival del desierto como 15–17 y la tarjeta del Calendario", () => {
    const html = renderToStaticMarkup(
      createElement(LangContext.Provider, { value: { lang: "en", setLang: () => undefined } }, createElement(StardewHome, { route: { ...route, sdSection: "home" }, navigate: () => undefined, live: () => true })),
    );
    expect(text(html)).toContain("15–17 Desert Festival");
    expect(html).toContain('href="/en/stardew-valley/calendar"');
  });
});
