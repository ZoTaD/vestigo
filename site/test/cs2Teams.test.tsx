import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { age, PlayerPage } from "../src/cs2/esports/teams/Cs2Players";
import { TeamPage } from "../src/cs2/esports/teams/Cs2Teams";
import { lpSlug, type EsIndex, type Player, type Team } from "../src/cs2/esports/teams/data";
import { MapTiles, rankTicks } from "../src/cs2/esports/teams/parts";
import { LangContext } from "../src/i18n";
import type { Route } from "../src/route";

const wrap = (el: React.ReactElement) =>
  renderToString(<LangContext.Provider value={{ lang: "es", setLang: () => undefined }}>{el}</LangContext.Provider>).replace(/<!-- -->/g, "");
const route = { lang: "es", view: "cs2", c2Section: "teams" } as Route;
const nav = () => undefined;
const idx: EsIndex = { teams: [{ slug: "mouz", name: "MOUZ", logo: "mouz", rank: 1, region: null, pts: 1960 }], players: [{ slug: "xertion", id: "xertioN", team_slug: "mouz" }], tours: [], flags: ["il"] };
const team = (over: Partial<Team> = {}): Team => ({
  slug: "mouz", lp: "MOUZ", name: "MOUZ", logo: "mouz",
  vrs: { rank: 1, pts: 1960, region: null, prev: 4, history: [] },
  location: "Germany Europe", igl: "xertioN", coaches: ["sycrone"], winnings: 8887874, created: "2002",
  roster: [{ lp: "XertioN", id: "xertioN", name: "Dorian Berman", flag: "il", since: "2022-08-26", captain: true, role: "player" }],
  results: [], maps: [], matches: [], ...over,
});

describe("la ficha de equipo", () => {
  it("cabecera con el puesto y el movimiento, y el plantel con enlace al jugador", () => {
    const html = wrap(<TeamPage team={team()} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("#1");
    expect(html).toContain("▲ 3 desde el mes pasado");
    expect(html).toContain("US$ 8.887.874");
    expect(html).toContain('href="/es/cs2/jugadores/xertion"');
    expect(html).toContain("Capitán");
    expect(html).toContain('src="/cs2/flags/il.svg"');
    expect(html).not.toContain("Germany Europe"); // la sede de Liquipedia (países pegados) no se muestra
  });

  it("sin partidos no hay mosaicos de mapas: lo dice", () => {
    const html = wrap(<TeamPage team={team()} idx={idx} route={route} navigate={nav} />);
    expect(html).not.toContain("c2-tm-tile");
    expect(html).toContain("Sin partidos de torneos S o A");
  });

  it("un mapa jugado una vez dice \"1 jugado\"", () => {
    const html = wrap(<MapTiles maps={[{ map: "Dust II", played: 1, won: 1, ct_w: 7, ct_p: 12, t_w: 6, t_p: 9 }]} />);
    expect(html).toContain("1 jugado");
    expect(html).toContain('src="/cs2/maps/dust-ii.webp"');
    expect(html).toContain("Defendiendo (CT)");
  });

  it("un equipo sin página en Liquipedia: sin plantel y sin enlaces a jugadores", () => {
    const html = wrap(<TeamPage team={team({ lp: null, slug: "1win", name: "1win", logo: null, roster: [], vrs: { rank: 12, pts: 1598, region: null, history: [] } })} idx={idx} route={route} navigate={nav} />);
    expect(html).not.toContain("/jugadores/");
    expect(html).toContain("1win");
  });

  it("un partido ganado por abandono", () => {
    const html = wrap(<TeamPage team={team({ matches: [{ t: 1793500000, opp: "Aurora Gaming", opp_lp: "Aurora_Gaming", tour: "PGL", tour_lp: "PGL/2026/Masters", won: true, maps: [{ map: "Mirage", us: null, them: null, ff: true }, { map: "Cache", us: 13, them: 2 }] }] })} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("Mirage W–FF");
    expect(html).toContain("2–0");
    expect(html).toContain('href="/es/cs2/torneos/pgl-2026-masters"');
  });
});

describe("la ficha de jugador", () => {
  it("edad, equipo con enlace y el aviso de estadísticas", () => {
    const p: Player = { slug: "xertion", lp: "XertioN", id: "xertioN", name: "Dorian Berman", flag: "il", born: "2004-07-22", roles: ["In-game leader"], team_lp: "MOUZ", team_slug: "mouz", winnings: 772773 };
    const html = wrap(<PlayerPage p={p} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain('href="/es/cs2/equipos/mouz"');
    expect(html).toContain("próximamente");
    expect(age("2004-07-22", new Date("2026-11-03T00:00:00Z"))).toBe(22);
    expect(age("2004-12-01", new Date("2026-11-03T00:00:00Z"))).toBe(21);
  });

  it("un jugador sin equipo", () => {
    const p: Player = { slug: "x", lp: "X", id: "x", name: null, flag: null, born: null, roles: [], team_lp: null, team_slug: null, winnings: null };
    expect(wrap(<PlayerPage p={p} idx={idx} route={route} navigate={nav} />)).toContain("Sin equipo");
  });

  it("el slug de Liquipedia es el mismo que arma el script", () => {
    expect(lpSlug("Team_Vitality")).toBe("team-vitality");
    expect(lpSlug("PGL/2026/Masters")).toBe("pgl-2026-masters");
    expect(lpSlug("XertioN")).toBe("xertion");
  });
});

describe("la ficha de torneo", () => {
  const base = { slug: "pgl-2026-masters", lp: "PGL/2026/Masters", name: "PGL Masters Bucharest 2026", state: "concluded" as const, organizer: "PGL", location: "Bucharest", venue: null, prize: 1250000, start: "2026-10-24", end: "2026-10-31", tier: "S", streams: ["pgl"] };
  it("sin partidos lo dice, y un terminado no pone Twitch", async () => {
    const { TourPage } = await import("../src/cs2/esports/TourPage");
    const html = wrap(<TourPage tour={{ ...base, teams: [], matches: [] }} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("No hay partidos programados");
    expect(html).not.toContain("twitch.tv/pgl");
    expect(html).toContain("US$ 1.250.000");
  });
  it("participantes con enlace a su ficha y el partido con su resultado", async () => {
    const { TourPage } = await import("../src/cs2/esports/TourPage");
    const tour = { ...base, teams: ["MOUZ", "Aurora_Gaming"], matches: [{ t: 1793500000, a: "MOUZ", b: "Aurora Gaming", a_lp: "MOUZ", b_lp: "Aurora_Gaming", bo: 3, maps: [{ map: "Mirage", a: null, b: null, ha: [], hb: [], ff: "a" as const }, { map: "Cache", a: 13, b: 2, ha: [["ct", 10], ["t", 3]] as [string, number][], hb: [["t", 2], ["ct", 0]] as [string, number][] }] }] };
    const html = wrap(<TourPage tour={tour} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain('href="/es/cs2/equipos/mouz"');
    expect(html).toContain("Aurora Gaming");
    expect(html).toContain("2–0");
  });
});

describe("arreglos de la revisión final", () => {
  it("la ficha de torneo sale en hora UTC en el HTML (la local recién en el navegador): sin error al hidratar", async () => {
    const { TourPage } = await import("../src/cs2/esports/TourPage");
    const tour = { slug: "x", lp: "X", name: "X", state: "concluded" as const, organizer: null, location: null, venue: null, prize: null, start: null, end: null, tier: "S", streams: [], teams: [], matches: [{ t: Date.UTC(2026, 9, 31, 23, 30) / 1000, a: "A", b: "B", a_lp: null, b_lp: null, bo: 3, maps: [{ map: "Nuke", a: 13, b: 5, ha: [], hb: [] }] }] };
    const html = wrap(<TourPage tour={tour} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("23:30 UTC");
    expect(html).toContain("Sábado, 31 de octubre");
  });
  it("un equipo regional muestra su puesto en la región", () => {
    const html = wrap(<TeamPage team={team({ vrs: { rank: null, region_rank: 14, pts: 1500, region: "europe", history: [] } })} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("#14");
    expect(html).toContain("de Europa");
  });
  it("el equipo de un jugador fuera del ranking, sin guiones bajos", () => {
    const p: Player = { slug: "y", lp: "Y", id: "y", name: null, flag: null, born: null, roles: [], team_lp: "Team_Spirit_Academy", team_slug: "team-spirit-academy", winnings: null };
    const html = wrap(<PlayerPage p={p} idx={idx} route={route} navigate={nav} />);
    expect(html).toContain("Team Spirit Academy");
  });
});

describe("el eje del ranking", () => {
  const y = (max: number) => (r: number) => 14 + ((r - 1) / (max - 1)) * 176;
  it("no amontona los números aunque el equipo haya caído al puesto 253", () => {
    const t = rankTicks(253, y(253));
    expect(t[0]).toBe(1);
    expect(t[t.length - 1]).toBe(253);
    for (let i = 1; i < t.length; i++) expect(y(253)(t[i]) - y(253)(t[i - 1])).toBeGreaterThanOrEqual(16);
  });
  it("con un equipo siempre arriba muestra los puestos cercanos", () => {
    expect(rankTicks(12, y(12))).toEqual([1, 5, 10, 12]);
  });
});
