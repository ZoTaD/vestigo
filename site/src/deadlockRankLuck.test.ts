import { describe, expect, it } from "vitest";
import { badgeOfScore, luckOf } from "./deadlockRankLuck";

/** Una partida de 12: yo en Team0 con 5 compañeros de `mate` y 6 rivales de `enemy`. */
function partida(id: number, mate: number, enemy: number, won: boolean) {
  const players = [{ account_id: 1, team: "Team0" }];
  for (let i = 0; i < 5; i++) players.push({ account_id: id * 100 + i, team: "Team0" });
  for (let i = 0; i < 6; i++) players.push({ account_id: id * 100 + 50 + i, team: "Team1" });
  const badges: [number, number][] = [];
  for (let i = 0; i < 5; i++) badges.push([id * 100 + i, mate]);
  for (let i = 0; i < 6; i++) badges.push([id * 100 + 50 + i, enemy]);
  return { match: { match_id: id, winning_team: won ? "Team0" : "Team1", players }, badges };
}

describe("suerte de rango", () => {
  it("cuenta las partidas con el equipo más bajo y cuántas se ganaron", () => {
    const ps = [
      partida(1, 72, 74, false),
      partida(2, 72, 74, true),
      partida(3, 74, 72, true),
      partida(4, 73, 73, true),
      partida(5, 73, 73, false),
    ];
    const badges = new Map(ps.flatMap((p) => p.badges));
    const l = luckOf(1, ps.map((p) => p.match), badges)!;
    expect(l.matches).toHaveLength(5);
    expect(l.lower).toBe(2);
    expect(l.lowerWon).toBe(1);
    expect(l.higher).toBe(1);
    expect(l.higherWon).toBe(1);
  });

  it("promedia en escalones: Arconte VI y Oráculo I están a un paso", () => {
    const ps = [1, 2, 3, 4, 5].map((i) => partida(i, 76, 81, true));
    const l = luckOf(1, ps.map((p) => p.match), new Map(ps.flatMap((p) => p.badges)))!;
    expect(l.enemies - l.mates).toBe(1);
    expect(badgeOfScore(l.mates)).toBe(76);
    expect(badgeOfScore(l.enemies)).toBe(81);
  });

  it("deja afuera las partidas con pocos rangos conocidos", () => {
    const ps = [1, 2, 3, 4, 5].map((i) => partida(i, 0, 73, true));
    expect(luckOf(1, ps.map((p) => p.match), new Map(ps.flatMap((p) => p.badges)))).toBeNull();
  });
});
