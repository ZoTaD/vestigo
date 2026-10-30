import { describe, expect, it } from "vitest";
import { categoriesOf, tally, topBuildIds } from "../src/topPlayers";

const p = (account_id: number, hero_id: number, team: string, hero_build_id?: number | null) => ({ account_id, hero_id, team, hero_build_id });

describe("top de jugadores", () => {
  const partidas = [
    { match_id: 1, winning_team: "Team0", players: [p(10, 1, "Team0", 5000), p(11, 1, "Team1", 5000)] },
    { match_id: 2, winning_team: "Team1", players: [p(10, 1, "Team0", 5000), p(12, 2, "Team1", 7000)] },
    { match_id: 3, winning_team: "Team1", players: [p(11, 1, "Team1", 6000), p(99, 1, "Team0", 6000)] },
    // Repetida: no cuenta dos veces. Y una build predeterminada (id chico) no es build.
    { match_id: 3, winning_team: "Team1", players: [p(11, 1, "Team1", 6000)] },
    { match_id: 4, winning_team: "Team0", players: [p(10, 1, "Team0", 50)] },
  ];

  it("cuenta sólo a los pedidos, con ese héroe, una vez por partida", () => {
    const t = tally(partidas, 1, [10, 11, 12]);
    expect(t.players.get(10)).toEqual({ n: 3, w: 2 });
    expect(t.players.get(11)).toEqual({ n: 2, w: 1 });
    expect(t.players.has(12)).toBe(false);
    expect(t.players.has(99)).toBe(false);
  });

  it("ordena las builds por cuántos de los top la usan", () => {
    const t = tally(partidas, 1, [10, 11]);
    expect(t.builds.get(5000)?.who.size).toBe(2);
    expect(t.builds.has(50)).toBe(false);
    expect(topBuildIds(t)).toEqual([5000, 6000]);
  });

  it("limpia las categorías de una build", () => {
    const cats = categoriesOf({
      hero_build: {
        hero_build_id: 1,
        author_account_id: 2,
        name: "x",
        details: {
          mod_categories: [
            { name: "  Early  ", mods: [{ ability_id: 1 }, { ability_id: 1 }, { ability_id: 2 }] },
            { name: "Vacía", mods: [] },
          ],
        },
      },
    });
    expect(cats).toEqual([{ name: "Early", items: [1, 2] }]);
  });
});
