import { describe, expect, it } from "vitest";
import leaderboard from "./fixtures/aoe2/leaderboard.json";
import personal from "./fixtures/aoe2/personal.json";
import history from "./fixtures/aoe2/history.json";
import { modeOfMatchType, normalizeHistory, normalizeLeaderboard, normalizePersonal, type RawAoe2History } from "../src/aoe2/api/wel";
import { handleAoe2 } from "../src/aoe2/api/handler";

const hist = history as unknown as RawAoe2History;

/** Un fetch falso que contesta según el endpoint de la API. */
const fake =
  (por: Record<string, unknown>): typeof fetch =>
  async (input) => {
    const u = new URL(String(input));
    const ep = u.pathname.split("/").pop()!;
    const body = por[ep];
    if (body === undefined) return new Response("no", { status: 500 });
    return new Response(JSON.stringify(body), { status: 200 });
  };

describe("API de AoE2: normalización", () => {
  it("el ranking trae puesto, alias, país y ELO", () => {
    const { rows } = normalizeLeaderboard(leaderboard as never);
    expect(rows[0]).toMatchObject({ rank: 1, alias: "wR.Lucho", country: "ar", elo: 3061 });
    expect(rows[0].maxElo).toBeGreaterThanOrEqual(3061);
  });

  it("el perfil trae alias, Steam y un puesto por ranking", () => {
    const p = normalizePersonal(personal as never, 9423131)!;
    expect(p.profile).toMatchObject({ id: 9423131, alias: "wR.Lucho", country: "ar", steamId: "76561198259300707" });
    expect(p.standings.find((s) => s.leaderboard === 3)?.elo).toBeGreaterThan(2500);
  });

  it("un perfil sin rankings da standings vacío", () => {
    const raw = { ...(personal as object), leaderboardStats: [] };
    expect(normalizePersonal(raw as never, 9423131)!.standings).toEqual([]);
  });

  it("un perfil que no está en la respuesta es null", () => {
    expect(normalizePersonal(personal as never, 1)).toBeNull();
  });

  it("el historial trae jugadores con civ, equipo y ELO antes y después, la más nueva primero", () => {
    const ms = normalizeHistory(hist);
    expect(ms.length).toBe(6);
    expect(ms[0].start).toBeGreaterThanOrEqual(ms[1].start);
    const rm = ms.find((m) => m.id === 521941306)!;
    expect(rm.mode).toBe("rm1v1");
    expect(rm.map).toBe("arabian-desert");
    expect(rm.players).toHaveLength(2);
    expect(rm.players.find((p) => p.result === "win")).toMatchObject({ oldElo: 3021, newElo: 3022 });
  });

  it("un resultado que no es 0 ni 1 queda como 'other'", () => {
    const raro = structuredClone(hist);
    raro.matchHistoryStats[0].matchhistorymember[0].outcome = 4;
    const m = normalizeHistory(raro).find((x) => x.id === raro.matchHistoryStats[0].id)!;
    expect(m.players.find((p) => p.profileId === raro.matchHistoryStats[0].matchhistorymember[0].profile_id)!.result).toBe("other");
  });

  it("los tipos de partida verificados el 20/11", () => {
    expect([6, 7, 8, 9, 26, 27, 29, 2, 4, 66, 67, 0, 18, 122].map(modeOfMatchType)).toEqual([
      "rm1v1", "rmteam", "rmteam", "rmteam", "ew1v1", "ewteam", "ewteam", "dm1v1", "dmteam", "co", "co", "custom", "other", "other",
    ]);
  });
});

describe("API de AoE2: intermediario", () => {
  const ok = fake({ getLeaderBoard2: leaderboard, GetPersonalStat: personal, getRecentMatchHistory: history });
  const u = (q: string) => new URL(`http://x/api/aoe2/${q}`);

  it("ranking", async () => {
    const r = await handleAoe2(u("leaderboard?id=3&count=3"), ok);
    expect(r.status).toBe(200);
    expect((await r.json()).rows[0].alias).toBe("wR.Lucho");
  });

  it("un ranking que no existe es 400", async () => {
    expect((await handleAoe2(u("leaderboard?id=999"), ok)).status).toBe(400);
  });

  it("jugador con id inválido es 400", async () => {
    expect((await handleAoe2(u("player?id=abc"), ok)).status).toBe(400);
  });

  it("jugador desconocido (código 6) es 404", async () => {
    const r = await handleAoe2(u("player?id=5"), fake({ GetPersonalStat: { result: { code: 6 } }, getRecentMatchHistory: { result: { code: 6 } } }));
    expect(r.status).toBe(404);
  });

  it("jugador desconocido con el historial en código 7 también es 404", async () => {
    // El historial contesta antes que el perfil (así pasó el 20/11): su código 7 no puede volverse un 502.
    const lento: typeof fetch = async (input) => {
      const ep = new URL(String(input)).pathname.split("/").pop();
      if (ep === "GetPersonalStat") await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify({ result: { code: ep === "GetPersonalStat" ? 6 : 7 } }), { status: 200 });
    };
    const r = await handleAoe2(u("player?id=123"), lento);
    expect(r.status).toBe(404);
  });

  it("jugador: perfil, puestos y partidas", async () => {
    const r = await handleAoe2(u("player?id=9423131"), ok);
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.profile.alias).toBe("wR.Lucho");
    expect(b.matches).toHaveLength(6);
    // El intermediario decodifica las opciones y no manda el base64 crudo.
    expect(b.matches.every((m: { mapSize?: number; build?: number; options: unknown }) => typeof m.mapSize === "number" && m.build === undefined && m.options === null)).toBe(true);
  });

  it("partida dentro del historial del jugador", async () => {
    const r = await handleAoe2(u("match?id=521941306&p=9423131"), ok);
    expect(r.status).toBe(200);
    expect((await r.json()).mode).toBe("rm1v1");
  });

  it("partida que no está en el historial es 404", async () => {
    expect((await handleAoe2(u("match?id=1&p=9423131"), ok)).status).toBe(404);
  });

  it("si la API no contesta, 502 antes de 8 s", async () => {
    const colgado: typeof fetch = (_i, init) =>
      new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("abort"))));
    const t0 = Date.now();
    const r = await handleAoe2(u("leaderboard?id=3"), colgado);
    expect(r.status).toBe(502);
    expect(Date.now() - t0).toBeLessThan(8000);
  }, 10_000);
});
