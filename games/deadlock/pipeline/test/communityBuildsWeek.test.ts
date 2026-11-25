import { describe, expect, it } from "vitest";
import { RISE_MIN, WEEK_MIN, weekPicks, type StatRow } from "../src/communityBuildsCore";
import { weekCards, weekWithBuilds } from "../src/communityBuilds";
import type { CommunityBuild } from "../src/communityBuildsCore";

const row = (id: number, matches: number, wins: number): StatRow => ({ hero_id: 1, hero_build_id: id, matches, wins, losses: matches - wins, players: matches });

describe("weekPicks", () => {
  it("elige la más jugada, la de mejor % con piso y la que más sube", () => {
    const week = [row(1001, 10_000, 5_000), row(1002, 3_000, 1_800), row(1003, 4_000, 2_100), row(1004, 500, 400)];
    const prev = [row(1001, 10_000, 5_000), row(1002, 2_900, 1_500), row(1003, 500, 250)];
    const p = weekPicks(week, prev);
    expect(p.popular?.id).toBe(1001);
    // 1004 tiene 80% pero menos de WEEK_MIN partidas: no entra en "mejor %".
    expect(WEEK_MIN).toBeGreaterThan(500);
    expect(p.best?.id).toBe(1002);
    // 1003 pasó de 500/13.400 a 4.000/17.500 de las partidas del héroe.
    expect(p.rising?.id).toBe(1003);
    expect(p.rising!.share - p.rising!.prevShare).toBeGreaterThanOrEqual(RISE_MIN);
    expect(p.rising?.prevMatches).toBe(500);
  });

  it("no cuenta las builds predeterminadas del juego", () => {
    const p = weekPicks([row(5, 50_000, 30_000), row(1001, 2_000, 1_000)], []);
    expect(p.popular?.id).toBe(1001);
  });

  it("sin semana anterior no hay en alza, y una subida chica tampoco cuenta", () => {
    expect(weekPicks([row(1001, 5_000, 2_500)], []).rising).toBeUndefined();
    const p = weekPicks([row(1001, 5_000, 2_500), row(1002, 5_100, 2_550)], [row(1001, 5_000, 2_500), row(1002, 5_000, 2_500)]);
    expect(p.rising).toBeUndefined();
  });

  it("sin filas no elige nada", () => {
    expect(weekPicks([], [])).toEqual({});
  });
});

describe("weekWithBuilds / weekCards", () => {
  const build = (id: number) => ({ id, name: `B${id}`, authorName: "x", matches: 99, wins: 50, style: "weapon", key: [] }) as unknown as CommunityBuild;
  const stat = (id: number) => ({ id, matches: 10, wins: 6, prevMatches: 4, prevWins: 2, share: 0.5, prevShare: 0.2 });

  it("se queda sólo con las que tienen ficha y pone los números de la semana en la tarjeta", () => {
    const w = weekWithBuilds({ popular: stat(1), best: stat(2) }, [build(1)]);
    expect(w).toEqual({ popular: stat(1) });
    const cards = weekCards(w!, [build(1)]);
    expect(cards.popular).toMatchObject({ id: 1, name: "B1", matches: 10, wins: 6, prevMatches: 4, share: 0.5 });
  });

  it("sin ninguna con ficha devuelve undefined", () => {
    expect(weekWithBuilds({ best: stat(2) }, [build(1)])).toBeUndefined();
    expect(weekWithBuilds(undefined, [build(1)])).toBeUndefined();
  });
});
