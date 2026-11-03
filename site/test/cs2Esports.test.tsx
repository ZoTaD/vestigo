import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { featured, moveLabel, pending } from "../src/cs2/esports/Cs2Esports";
import type { TourRow } from "../src/cs2/esports/data";
import type { Match } from "../src/cs2/esports/matches";
import { byLocalDay, initials, TeamLogo, Twitch } from "../src/cs2/esports/parts";
import { LangContext } from "../src/i18n";

const wrap = (el: React.ReactElement) => renderToString(<LangContext.Provider value={{ lang: "es", setLang: () => undefined }}>{el}</LangContext.Provider>);
const tour = (name: string, state: TourRow["state"], tier: TourRow["tier"], start = "2026-11-02"): TourRow => ({
  slug: name, name, state, tier, start, end: start, series: null, organizer: null, type: null, location: null, venue: null, prize: null, teams: null, streams: [],
});
const side = (slug: string | null) => ({ slug, name: slug ?? "", short: slug ?? "" });
const match = (t: number, score: [number, number] | null = null): Match => ({ t, a: side("A"), b: side(null), score, bo: 3, tour: { slug: "x", name: "X" } });

describe("la pestaña Torneos", () => {
  it("arriba va el S en curso; si no hay en curso, el próximo", () => {
    expect(featured([tour("a", "ongoing", "A"), tour("s", "ongoing", "S")])?.name).toBe("s");
    expect(featured([tour("p", "upcoming", "S"), tour("c", "concluded", "S")])?.name).toBe("p");
    expect(featured([])).toBeUndefined();
  });

  it("el movimiento en el ranking", () => {
    expect(moveLabel({ rank: 1, prev: 4 }, "nuevo")).toEqual({ text: "▲ 3", dir: "up" });
    expect(moveLabel({ rank: 5, prev: 3 }, "nuevo")).toEqual({ text: "▼ 2", dir: "down" });
    expect(moveLabel({ rank: 2, prev: 2 }, "nuevo")).toEqual({ text: "=", dir: "eq" });
    expect(moveLabel({ rank: 9, prev: null }, "nuevo")).toEqual({ text: "nuevo", dir: "up" });
  });

  it("próximos: sin los jugados ni los de hace más de 3 horas, del más cercano al más lejano", () => {
    const now = 1_800_000_000;
    const ms = [match(now + 7200), match(now - 4 * 3600), match(now + 60), match(now + 100, [2, 1])];
    expect(pending(ms, now).map((m) => m.t)).toEqual([now + 60, now + 7200]);
  });

  it("los días en la hora local: Hoy, Mañana y después la fecha", () => {
    const now = new Date(2026, 10, 3, 20, 0);
    const at = (d: number, h: number) => match(new Date(2026, 10, d, h, 0).getTime() / 1000);
    const g = byLocalDay([at(3, 22), at(4, 1), at(4, 9), at(6, 12)], "es", now, { today: "Hoy", tomorrow: "Mañana", yesterday: "Ayer" });
    expect(g.map((x) => [x.label, x.items.length])).toEqual([["Hoy", 1], ["Mañana", 2], ["Viernes, 6 de noviembre", 1]]);
    expect(byLocalDay([at(2, 23)], "es", now, { today: "Hoy", tomorrow: "Mañana", yesterday: "Ayer" })[0].label).toBe("Ayer");
  });

  it("las iniciales de un equipo sin logo", () => {
    expect(initials("MOUZ")).toBe("MO");
    expect(initials("Natus Vincere")).toBe("NV");
    expect(initials("")).toBe("?");
    const html = wrap(<TeamLogo lp="Nadie" name="Natus Vincere" teams={{}} />);
    expect(html).toContain("c2-logo is-text");
    expect(html).toContain(">NV<");
    expect(wrap(<TeamLogo lp="MOUZ" name="MOUZ" teams={{ MOUZ: { name: "MOUZ", logo: "mouz" } }} />)).toContain('src="/cs2/t/mouz.webp"');
  });

  it("Twitch no carga hasta que se toca", () => {
    const html = wrap(<Twitch channel="eslcs" title="IEM" />);
    expect(html).not.toContain("<iframe");
    expect(html.replace(/<!-- -->/g, "")).toContain("twitch.tv/eslcs");
  });
});
