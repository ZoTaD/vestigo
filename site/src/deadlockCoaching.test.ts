import { describe, expect, it } from "vitest";
import { coachingOf, fightCenter } from "./deadlockCoaching";
import { parseReplay, type RawReplayInfo, type ReplayFight } from "./deadlockReplay";

/** Un jugador quieto en un punto del mapa (0..1000) durante `n` segundos. */
const still = (slot: number, mx: number, my: number, n = 60, combat = 0) => {
  const wx = (mx / 1000) * 21504 - 10752;
  const wy = 10752 - (my / 1000) * 21504;
  const px = Math.round(((wx + 10752) / 21504) * 16383);
  const py = Math.round(((wy + 10752) / 21504) * 16383);
  return {
    player_slot: slot, x_min: -10752, y_min: -10752, x_max: 10752, y_max: 10752,
    x_pos: Array(n).fill(px), y_pos: Array(n).fill(py), health: Array(n).fill(100), combat_type: Array(n).fill(combat),
  };
};
const worldOf = (mx: number, my: number) => ({ x: (mx / 1000) * 21504 - 10752, y: 10752 - (my / 1000) * 21504 });

describe("coachingOf", () => {
  // 1 y 2 son compañeros (equipo 0); 1 está solo lejos, 2 junto a 3 (rival).
  const raw: RawReplayInfo = {
    match_paths: { paths: [still(1, 100, 100, 60, 2), still(2, 500, 500, 60, 1), still(3, 520, 500)] },
    players: [
      { player_slot: 1, death_details: [{ game_time_s: 30, killer_player_slot: 3, death_pos: worldOf(100, 100), death_duration_s: 10 }] },
      { player_slot: 2 },
      { player_slot: 3, death_details: [{ game_time_s: 20, killer_player_slot: 2, death_pos: worldOf(520, 500), death_duration_s: 10 }, { game_time_s: 25, killer_player_slot: 2, death_pos: worldOf(520, 500), death_duration_s: 1 }] },
    ],
    objectives: [{ destroyed_time_s: 50, team: 0, team_objective_id: 5 }],
  };
  const r = parseReplay(raw)!;
  const teamOf = (s: number) => (s === 3 ? 1 : 0);
  const fight: ReplayFight = {
    start: 20, end: 25, kills: r.deaths.filter((d) => d.victim === 3), deaths: [0, 2], winner: 0, before: 0.5, after: 0.6, view: [0, 0, 1, 1],
  };
  const c = coachingOf(r, teamOf, [fight], 60);

  it("cuenta la muerte sin compañeros cerca", () => {
    expect(c.get(1)).toMatchObject({ deaths: 1, deathsAlone: 1 });
  });

  it("separa quién estuvo en la pelea y quién se la perdió", () => {
    expect(c.get(2)).toMatchObject({ fightsAlive: 1, fightsPresent: 1, fightsMissed: 0 });
    expect(c.get(1)).toMatchObject({ fightsAlive: 1, fightsPresent: 0, fightsMissed: 1 });
  });

  it("marca la estructura propia que cayó con el jugador lejos", () => {
    // El caminante 5 (carril 1) de Hidden King está en (208, 720): 2 está en el medio, lejos.
    expect(c.get(2)!.structuresAway).toHaveLength(1);
  });

  it("reparte el tiempo entre peleando, farmeando, moviéndose y muerto", () => {
    const t1 = c.get(1)!.time;
    expect(t1.dead).toBe(10);
    expect(t1.farming).toBe(50);
    expect(c.get(2)!.time.fighting).toBe(60);
  });

  it("el centro de una pelea es el promedio de las muertes", () => {
    const [x, y] = fightCenter(fight);
    expect(x).toBeCloseTo(520, 0);
    expect(y).toBeCloseTo(500, 0);
  });
});
