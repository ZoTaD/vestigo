import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleCoh3 } from "../src/coh3/api/handler";
import { automatchId, factionOfRace, LEADERBOARDS, modeOfMatchType } from "../src/coh3/api/leaderboards";
import { normalizeHistory, normalizeLeaderboard, normalizeMatch, steamIdOf, summarizeCounters } from "../src/coh3/api/relic";

// Respuestas reales de Relic del 2026-11-04, recortadas (3 partidas) y con los SteamID cambiados.
const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/coh3/${n}.json`, import.meta.url), "utf-8"));
const LB = fx("leaderboard");
const PS = fx("personalstat");
const HIST = fx("history");
const SEARCH = fx("search");
const HIST_SIZE = JSON.stringify(HIST).length;
const YO = 1053920;

type Route = (url: URL) => Response;
const res = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
function fake(route: Route) {
  const pedidos: URL[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    pedidos.push(u);
    return route(u);
  }) as typeof fetch;
  return { f, pedidos };
}
const call = (q: string, route: Route) => {
  const { f, pedidos } = fake(route);
  return handleCoh3(new URL(`https://vestigo.gg/api/coh3/${q}`), f).then((r) => ({ r, pedidos }));
};
const relic: Route = (u) => {
  if (u.pathname.endsWith("getleaderboard2")) return res(LB);
  if (u.pathname.endsWith("getRecentMatchHistoryByProfileId")) return res(HIST);
  if (u.searchParams.has("aliases")) return res(SEARCH);
  return res(PS);
};

describe("catálogo de leaderboards", () => {
  it("16 de automatch y 16 ranked, ids únicos", () => {
    expect(LEADERBOARDS).toHaveLength(32);
    expect(new Set(LEADERBOARDS.map((l) => l.id)).size).toBe(32);
    expect(automatchId("1v1", "american")).toBe(2130255);
    expect(automatchId("4v4", "german")).toBe(2130360);
  });
  it("razas y tipos de partida", () => {
    expect([factionOfRace(203852), factionOfRace(198437), factionOfRace(2064141)]).toEqual(["british", "dak", null]);
    expect(modeOfMatchType(21)).toEqual({ mode: "2v2", ranked: false });
    expect(modeOfMatchType(3)).toEqual({ mode: "3v3", ranked: true });
    expect(modeOfMatchType(8).mode).toBe("ai");
    expect(modeOfMatchType(0).mode).toBe("custom");
  });
});

describe("normalización", () => {
  it("el ranking une statGroups y leaderboardStats por statgroup_id (vienen en otro orden)", () => {
    const { total, rows } = normalizeLeaderboard(LB);
    expect(total).toBe(1855);
    expect(rows[0]).toMatchObject({ rank: 1, alias: "Rei", country: "kr", elo: 2159, wins: 1175, losses: 178, streak: 7 });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].steamId).toMatch(/^\d{17}$/);
  });
  it("SteamID sólo de perfiles de Steam", () => {
    expect(steamIdOf("/steam/76561198000000001")).toBe("76561198000000001");
    expect(steamIdOf("/xboxlive/123")).toBeNull();
  });
  it("historial: más nuevas primero, jugadores por equipo con ELO y resumen de counters", () => {
    const ms = normalizeHistory(HIST);
    expect(ms).toHaveLength(3);
    expect(ms.map((m) => m.start)).toEqual([...ms.map((m) => m.start)].sort((a, b) => b - a));
    const dos = ms.find((m) => m.id === 84875493)!;
    expect(dos).toMatchObject({ map: "torrente_4p_mkiii", mode: "2v2", ranked: false, duration: 855 });
    expect(dos.players.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    const p = dos.players.find((x) => x.profileId === 211181)!;
    expect(p).toMatchObject({ faction: "german", result: "loss", eloBefore: 1670, eloAfter: 1667 });
    expect(p.counters).toMatchObject({ kills: 34, deaths: 51, unitsProduced: 36, pointsCaptured: 16, damage: 3567 });
    expect(p.counters!.apm).toBe(Math.round(1358 / (834 / 60)));
  });
  it("detalle: counters completos y grabaciones; null si no está", () => {
    const m = normalizeMatch(HIST, 84875493)!;
    expect(m.automatch).toBe(true);
    expect(m.players).toHaveLength(4);
    expect(Object.keys(m.players[0].counters).length).toBeGreaterThan(40);
    expect(m.replays).toHaveLength(4);
    expect(normalizeMatch(HIST, 1)).toBeNull();
  });
  it("counters vacíos no rompen", () => {
    expect(summarizeCounters({}).apm).toBe(0);
  });
});

describe("handleCoh3", () => {
  it("leaderboard: pide getleaderboard2 ordenado por ELO y cachea 60 s", async () => {
    const { r, pedidos } = await call("leaderboard?id=2130255&start=1&count=5&region=2074389", relic);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(r.headers.get("netlify-cdn-cache-control")).toContain("s-maxage=60");
    const q = pedidos[0].searchParams;
    expect([q.get("leaderboard_id"), q.get("sortBy"), q.get("count"), q.get("title"), q.get("leaderboardRegion_id")]).toEqual([
      "2130255",
      "1",
      "5",
      "coh3",
      "2074389",
    ]);
    const body = await r.json();
    expect(body.rows).toHaveLength(5);
    expect(body.rows[0].regionRank).toBeDefined();
  });
  it("leaderboard: ids, count y región inválidos → 400 sin pedirle nada a Relic", async () => {
    for (const q of ["id=2130283", "id=abc", "id=2130255&count=500", "id=2130255&start=0", "id=2130255&region=5"]) {
      const { r, pedidos } = await call(`leaderboard?${q}`, relic);
      expect([q, r.status, pedidos.length]).toEqual([q, 400, 0]);
    }
  });
  it("player: perfil, posiciones de los leaderboards conocidos y partidas; liviano", async () => {
    const { r, pedidos } = await call(`player?id=${YO}`, relic);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0].searchParams.get("profile_ids")).toBe(`[${YO}]`);
    const text = await r.clone().text();
    const body = JSON.parse(text);
    expect(body.profile).toMatchObject({ id: YO, alias: "Nicko", country: "ru" });
    expect(body.standings.every((s: { leaderboardId: number }) => s.leaderboardId !== 2130362)).toBe(true);
    expect(body.standings[0]).toMatchObject({ mode: "1v1", ranked: false });
    expect(body.standings.find((s: { leaderboardId: number }) => s.leaderboardId === 2130255)).toMatchObject({
      faction: "american",
      rank: 3,
      elo: 2061,
    });
    expect(body.matches).toHaveLength(3);
    expect(text.length).toBeLessThan(HIST_SIZE);
  });
  it("player inexistente (code 6) → 404", async () => {
    const { r } = await call("player?id=999999999", () => res({ result: { code: 6, message: "UNKNOWN_PROFILE_IDS" } }));
    expect(r.status).toBe(404);
  });
  it("match: busca en el historial del jugador", async () => {
    const { r, pedidos } = await call(`match?id=84300910&player=${YO}`, relic);
    expect(pedidos).toHaveLength(1);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
    expect((await r.json()).mode).toBe("1v1");
    expect((await call(`match?id=1&player=${YO}`, relic)).r.status).toBe(404);
    expect((await call("match?id=84300910", relic)).r.status).toBe(400);
  });
  it("search: por alias exacto, sin resultados → lista vacía", async () => {
    const { r, pedidos } = await call("search?q=%20Nicko%20", relic);
    expect(pedidos[0].searchParams.get("aliases")).toBe('["Nicko"]');
    const body = await r.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((x: { alias: string }) => x.alias.toLowerCase() === "nicko")).toBe(true);
    const nada = await call("search?q=zzqq", () => res({ result: { code: 9, message: "UNKNOWN_ALIASES" } }));
    expect([nada.r.status, (await nada.r.json()).results]).toEqual([200, []]);
    expect((await call("search?q=", relic)).r.status).toBe(400);
  });
  it("search: un SteamID64 se busca como perfil de Steam", async () => {
    const { r, pedidos } = await call("search?q=76561198404414770", relic);
    expect(pedidos[0].searchParams.get("profile_names")).toBe('["/steam/76561198404414770"]');
    expect(pedidos[0].searchParams.has("aliases")).toBe(false);
    expect(r.status).toBe(200);
  });
  it("CoH2 y CoH1: `g` cambia de API y valida contra sus leaderboards", async () => {
    const lb2 = JSON.parse(readFileSync(new URL("./fixtures/coh2/leaderboard.json", import.meta.url), "utf-8"));
    const { r, pedidos } = await call("leaderboard?g=coh2&id=6&count=5", () => res(lb2));
    expect(r.status).toBe(200);
    expect(pedidos[0].host).toBe("coh2-api.reliclink.com");
    expect(pedidos[0].searchParams.get("title")).toBe("coh2");
    const body = await r.json();
    expect(body.rows).toHaveLength(5);
    // CoH2 no manda ELO en el ranking.
    expect(body.rows[0].elo).toBeNull();
    expect(body.rows[0].tier).toBeGreaterThan(0);
    for (const q of ["g=coh4&id=6", "g=coh2&id=2130255", "g=coh1&id=51"]) {
      const x = await call(`leaderboard?${q}`, relic);
      expect([q, x.r.status, x.pedidos.length]).toEqual([q, 400, 0]);
    }
    const sinG = await call("leaderboard?id=2130255", relic);
    expect(sinG.pedidos[0].host).toBe("coh3-api.reliclink.com");
  });
  it("CoH1: partida sin counters, facciones por raza y ELO de antes y después", async () => {
    const h1 = JSON.parse(readFileSync(new URL("./fixtures/coh1/history.json", import.meta.url), "utf-8"));
    const m0 = h1.matchHistoryStats[0];
    const { r, pedidos } = await call(`match?g=coh1&id=${m0.id}&player=${m0.matchhistorymember[0].profile_id}`, () => res(h1));
    expect(pedidos[0].host).toBe("coh1-api.reliclink.com");
    const m = await r.json();
    expect(m.mode).toBe("1v1");
    expect(m.players.map((p: { faction: string }) => p.faction).sort()).toEqual(["american", "panzer_elite"]);
    expect(m.players.every((p: { eloAfter: number | null }) => typeof p.eloAfter === "number")).toBe(true);
    expect(m.players[0].summary.kills).toBe(0);
  });
  it("Relic falla → 502 con upstream; ruta desconocida → 404; POST → 405", async () => {
    const http = await call("leaderboard?id=2130255", () => new Response("", { status: 503 }));
    expect([http.r.status, await http.r.json()]).toEqual([502, { error: "upstream", upstream: 503 }]);
    expect(http.r.headers.get("cache-control")).toBe("no-store");
    const code = await call("leaderboard?id=2130255", () => res({ result: { code: 5, message: "NOT_FOUND" } }));
    expect(await code.r.json()).toEqual({ error: "upstream", upstream: 5 });
    const red = await call("leaderboard?id=2130255", () => {
      throw new TypeError("fetch failed");
    });
    expect(await red.r.json()).toEqual({ error: "upstream", upstream: 0 });
    expect((await call("nada", relic)).r.status).toBe(404);
    const post = await handleCoh3(new URL("https://vestigo.gg/api/coh3/search?q=a"), fetch, "POST");
    expect(post.status).toBe(405);
  });
});
