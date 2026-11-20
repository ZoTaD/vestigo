import { describe, expect, it } from "vitest";
import mapJson from "@deadlock/map.json";
import model from "@deadlock/impact-model.json";
import {
  coefAt,
  curveAt,
  farmLedger,
  structureMarks,
  matchImpact,
  modelChance,
  objectiveSpots,
  playPts,
  stateAt,
  STRUCTURE_SPOTS,
  type ImpactModel,
  deadAt,
  fightView,
  assistsOf,
  impactLedger,
  ledgerTotals,
  parseReplay,
  posAt,
  replayFights,
  toMap,
  type RawReplayInfo,
} from "./deadlockReplay";

const path = (slot: number, xs: number[], ys: number[], combat: number[] = []) => ({
  player_slot: slot,
  x_min: -10752,
  y_min: -10752,
  x_max: 10752,
  y_max: 10752,
  x_pos: xs,
  y_pos: ys,
  health: xs.map(() => 80),
  combat_type: combat.length ? combat : xs.map(() => 0),
});

const info = (extra: Partial<RawReplayInfo> = {}): RawReplayInfo => ({
  match_paths: {
    interval_s: 1,
    x_resolution: 16383,
    y_resolution: 16383,
    paths: [path(1, [0, 16383, 16383], [0, 16383, 16383], [0, 1, 2]), path(2, [8191, 8191, 8191], [8191, 8191, 8191])],
  },
  players: [
    { player_slot: 1, death_details: [] },
    {
      player_slot: 2,
      death_details: [
        { game_time_s: 100, killer_player_slot: 1, death_pos: { x: 0, y: 0 }, killer_pos: { x: 1000, y: 0 }, death_duration_s: 20 },
        { game_time_s: 110, killer_player_slot: 1, death_pos: { x: 0, y: 0 }, death_duration_s: 20 },
      ],
    },
  ],
  objectives: [{ destroyed_time_s: 120, team: 1, team_objective_id: 9 }],
  ...extra,
});

describe("toMap", () => {
  it("pone el centro del mundo en el centro y la y para abajo", () => {
    expect(toMap(0, 0)).toEqual([500, 500]);
    expect(toMap(-10752, 10752)).toEqual([0, 0]);
    expect(toMap(10752, -10752)).toEqual([1000, 1000]);
  });
});

describe("parseReplay", () => {
  it("devuelve null sin posiciones", () => {
    expect(parseReplay({ players: [] })).toBeNull();
    expect(parseReplay({ match_paths: { paths: [] }, players: [] })).toBeNull();
  });

  it("pasa las posiciones al encuadre del mapa", () => {
    const r = parseReplay(info())!;
    const t = r.tracks.get(1)!;
    expect(t.x[0]).toBeCloseTo(0);
    expect(t.y[0]).toBeCloseTo(1000);
    expect(t.x[1]).toBeCloseTo(1000);
    expect(t.y[1]).toBeCloseTo(0);
  });

  it("sólo cuenta como pelea el combate contra héroes", () => {
    const t = parseReplay(info())!.tracks.get(1)!;
    expect([...t.fight]).toEqual([0, 1, 0]);
  });

  it("lee muertes y estructuras", () => {
    const r = parseReplay(info())!;
    expect(r.deaths.map((d) => d.t)).toEqual([100, 110]);
    expect(r.deaths[0].from).toEqual([((1000 + 10752) / 21504) * 1000, 500]);
    expect(r.deaths[1].from).toBeNull();
    expect(r.objectives).toEqual([{ t: 120, team: 1, id: 9 }]);
  });
});

describe("posAt", () => {
  it("interpola entre muestras cercanas", () => {
    const r = parseReplay(info({ match_paths: { paths: [path(1, [8000, 8100], [8000, 8000])] } }))!;
    const a = posAt(r.tracks.get(1)!, 1, 0);
    const b = posAt(r.tracks.get(1)!, 1, 1);
    const mid = posAt(r.tracks.get(1)!, 1, 0.5);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2);
  });

  it("no dibuja el viaje de un teletransporte", () => {
    const r = parseReplay(info())!;
    const p = posAt(r.tracks.get(1)!, 1, 0.4);
    expect(p.x).toBeCloseTo(0);
  });
});

describe("deadAt", () => {
  it("cuenta la muerte hasta que revive", () => {
    const r = parseReplay(info())!;
    expect(deadAt(r.deaths, 2, 99)).toBeNull();
    expect(deadAt(r.deaths, 2, 105)?.t).toBe(100);
    expect(deadAt(r.deaths, 2, 131)).toBeNull();
  });
});

describe("replayFights", () => {
  it("junta muertes cercanas y elige ganador", () => {
    const r = parseReplay(info())!;
    const fights = replayFights(r, (s) => (s === 1 ? 0 : 1), () => 0.5, 600);
    expect(fights).toHaveLength(1);
    expect(fights[0].deaths).toEqual([0, 2]);
    expect(fights[0].winner).toBe(0);
  });

  it("el encuadre abarca las muertes y es 4:3", () => {
    const r = parseReplay(info())!;
    const v = fightView(r.deaths);
    for (const d of r.deaths) {
      expect(d.at[0]).toBeGreaterThan(v[0]);
      expect(d.at[0]).toBeLessThan(v[2]);
    }
    expect((v[2] - v[0]) / (v[3] - v[1])).toBeCloseTo(4 / 3);
  });
});

describe("assistsOf", () => {
  // Tres jugadores: 1 mata a 2; 3 es compañero de 1 y está pegado a 2; 4 también, pero lejos.
  const near = (slot: number, x: number) => path(slot, Array(20).fill(x), Array(20).fill(8191));
  const raw = (): RawReplayInfo => ({
    match_paths: { interval_s: 1, x_resolution: 16383, y_resolution: 16383, paths: [near(1, 8191), near(2, 8191), near(3, 8300), near(4, 16000)] },
    players: [
      { player_slot: 1 },
      { player_slot: 2, death_details: [{ game_time_s: 10, killer_player_slot: 1, death_pos: { x: 0, y: 0 }, death_duration_s: 5 }] },
      { player_slot: 3 },
      { player_slot: 4 },
    ],
  });
  const teamOf = (s: number) => (s === 2 ? 1 : 0);

  it("cuenta a los compañeros cercanos y no a los lejanos", () => {
    const r = parseReplay(raw())!;
    expect(assistsOf(r, r.deaths[0], teamOf)).toEqual([3]);
  });

  it("reparte la kill: la mitad para quien mató, el resto entre las asistencias", () => {
    const r = parseReplay(raw())!;
    const led = impactLedger(r, teamOf, { deathPts: () => 4, objectivePts: () => 0 });
    const tot = ledgerTotals(led, r.tracks.keys());
    expect(tot.get(1)).toBe(2);
    expect(tot.get(3)).toBe(2);
    expect(tot.get(2)).toBe(-4);
    expect(tot.get(4)).toBe(0);
  });

  it("sin asistencias la kill entera es de quien mató", () => {
    const r = parseReplay(raw())!;
    const led = impactLedger(r, teamOf, { deathPts: () => 4, objectivePts: () => 0 }).filter((e) => e.kind !== "assist");
    expect(led.find((e) => e.kind === "kill")!.value).toBe(2);
    const solo = parseReplay({ ...raw(), match_paths: { paths: raw().match_paths!.paths!.filter((p) => p.player_slot !== 3) } })!;
    const k = impactLedger(solo, teamOf, { deathPts: () => 4, objectivePts: () => 0 }).find((e) => e.kind === "kill")!;
    expect(k.value).toBe(4);
  });
});

describe("impactLedger", () => {
  it("suma al que mata y resta al que muere", () => {
    const r = parseReplay(info())!;
    const teamOf = (s: number) => (s === 1 ? 0 : 1);
    const tot = ledgerTotals(impactLedger(r, teamOf, { deathPts: () => 3, objectivePts: () => 0 }), r.tracks.keys());
    expect(tot.get(1)).toBe(6);
    expect(tot.get(2)).toBe(-6);
  });

  it("reparte una estructura entre los rivales vivos", () => {
    const r = parseReplay(info())!;
    const teamOf = (s: number) => (s === 1 ? 0 : 1);
    const led = impactLedger(r, teamOf, { deathPts: () => 0, objectivePts: () => 5 }).filter((e) => e.kind === "objective");
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ slot: 1, value: 5 });
  });

  it("lo que gana un equipo lo pierde el otro: el total da cero", () => {
    const r = parseReplay(info())!;
    const teamOf = (s: number) => (s === 1 ? 0 : 1);
    const led = impactLedger(r, teamOf, { deathPts: () => 2, objectivePts: () => 5, midBoss: [{ t: 50, team: 0 }], bossPts: () => 3 });
    expect(led.reduce((s, e) => s + e.value, 0)).toBeCloseTo(0);
    expect(led.find((e) => e.kind === "objectiveLost")).toMatchObject({ slot: 2, value: -5 });
    expect(led.find((e) => e.kind === "bossLost")).toMatchObject({ slot: 2, value: -3 });
  });
});

describe("STRUCTURE_SPOTS", () => {
  it("coincide con map.json", () => {
    const pts = (mapJson as unknown as { points: Record<string, [number, number, number][]> }).points;
    const de = (k: string) => pts[k].map(([x, y, c]) => [Math.round(x * 1000), Math.round(y * 1000), c === 2 ? 0 : 1]);
    const sinCarril = (k: keyof typeof STRUCTURE_SPOTS) => STRUCTURE_SPOTS[k].map(([x, y, team]) => [x, y, team]);
    expect(sinCarril("walker")).toEqual(de("walker"));
    expect(sinCarril("baseGuardian")).toEqual(de("base-guardian"));
    expect(sinCarril("shrine")).toEqual(de("shrine"));
    expect(sinCarril("patron")).toEqual(de("patron"));
  });

  it("los guardianes de línea son simétricos (girados 180°) entre los dos equipos", () => {
    const g = STRUCTURE_SPOTS.guardian;
    for (const [x, y, team, lane] of g.filter((s) => s[2] === 0)) {
      const espejo = g.find((s) => s[2] === 1 && s[3] === (lane === 1 ? 4 : lane === 4 ? 1 : 3))!;
      expect(Math.abs(1000 - x - espejo[0])).toBeLessThan(5);
      expect(Math.abs(1000 - y - espejo[1])).toBeLessThan(5);
      expect(team).toBe(0);
    }
  });

  it("da los lugares del dueño de la estructura", () => {
    // Tier2Lane2 no existe: sin lugar. Tier2Lane4 de Archmother: el caminante de la derecha.
    expect(objectiveSpots({ t: 1, team: 1, id: 6 })).toEqual([]);
    expect(objectiveSpots({ t: 1, team: 1, id: 8 })).toEqual([[800, 278]]);
    expect(objectiveSpots({ t: 1, team: 0, id: 1 })).toEqual([[140, 566]]);
    expect(objectiveSpots({ t: 1, team: 0, id: 12 })).toHaveLength(2);
    expect(objectiveSpots({ t: 1, team: 1, id: 10 })).toHaveLength(2);
  });
});

describe("el modelo", () => {
  const m = model as unknown as ImpactModel;

  it("todo parejo es 50 %", () => {
    expect(modelChance(m, [0, 0, 0, 0, 0, 0, 0], [10000, 10000], 900)).toBeCloseTo(0.5);
  });

  it("ir arriba en almas o en kills sube la chance de Hidden King", () => {
    expect(modelChance(m, [0, 0, 0, 0, 0, 0, 0], [12000, 10000], 900)).toBeGreaterThan(0.6);
    expect(modelChance(m, [0, 5, 0, 0, 0, 0, 0], [10000, 10000], 900)).toBeGreaterThan(0.5);
  });

  it("una kill vale lo mismo para los dos equipos con todo parejo", () => {
    expect(playPts(m, 0.5, 600, "kill", 0)).toBeCloseTo(playPts(m, 0.5, 600, "kill", 1));
    expect(playPts(m, 0.5, 600, "kill", 0)).toBeGreaterThan(1);
    expect(playPts(m, 0.5, 600, "kill", 0)).toBeLessThan(6);
  });

  it("una jugada mueve menos cuando la partida ya está definida", () => {
    expect(playPts(m, 0.95, 1200, "kill", 0)).toBeLessThan(playPts(m, 0.5, 1200, "kill", 0) / 3);
  });

  it("una kill tarde vale más que una temprano", () => {
    expect(playPts(m, 0.5, 2100, "kill", 0)).toBeGreaterThan(playPts(m, 0.5, 360, "kill", 0));
  });

  it("interpola entre minutos y se queda en los extremos", () => {
    expect(coefAt(m, 0, "play")).toEqual(m.minutes[0].play);
    expect(coefAt(m, 99_999, "play")).toEqual(m.minutes[m.minutes.length - 1].play);
    expect(coefAt(m, 750, "play")).toHaveLength(6);
    for (const v of coefAt(m, 750, "play")) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("matchImpact", () => {
  const m = model as unknown as ImpactModel;
  const r = parseReplay(info())!;
  const teamOf = (s: number) => (s === 1 ? 0 : 1);
  const imp = matchImpact(m, r, teamOf, [], () => [1000, 1000], 600);

  it("la curva salta en cada kill a favor de quien mató", () => {
    expect(curveAt(imp.curve, 100.02)).toBeGreaterThan(curveAt(imp.curve, 99.98));
  });

  it("cuenta las kills en stateAt sólo después de que pasan", () => {
    expect(stateAt(r, teamOf, [], 100)[1]).toBe(0);
    expect(stateAt(r, teamOf, [], 100.5)[1]).toBe(1);
  });

  it("el Patrón vale lo que le faltaba al que lo rompió", () => {
    expect(imp.objectivePts.get(r.objectives[0])!).toBeGreaterThan(0);
  });
});

describe("farmLedger", () => {
  const m = model as unknown as ImpactModel;
  const curve = [{ t: 0, p: 0.5 }, { t: 1000, p: 0.5 }];
  const teamOf = (s: number) => (s <= 2 ? 0 : 1);
  const farm = new Map([
    [1, [{ t: 300, v: 3000 }, { t: 600, v: 6000 }]],
    [2, [{ t: 300, v: 1000 }, { t: 600, v: 2000 }]],
    [3, [{ t: 300, v: 2000 }, { t: 600, v: 4000 }]],
    [4, [{ t: 300, v: 2000 }, { t: 600, v: 4000 }]],
  ]);
  const led = farmLedger(m, curve, teamOf, () => [10000, 10000], farm);

  it("suma al que farmeó más que los rivales y resta al que menos", () => {
    const tot = (s: number) => led.filter((e) => e.slot === s).reduce((x, e) => x + e.value, 0);
    expect(tot(1)).toBeGreaterThan(0);
    expect(tot(2)).toBeLessThan(0);
  });

  it("el total da cero", () => {
    expect(led.reduce((x, e) => x + e.value, 0)).toBeCloseTo(0);
  });
});

describe("structureMarks", () => {
  it("asigna la estructura que cayó al lugar más cerca de los atacantes", () => {
    // Un atacante (equipo 0) parado sobre el caminante de Archmother de la derecha (800, 278).
    const wx = (800 / 1000) * 21504 - 10752;
    const wy = 10752 - (278 / 1000) * 21504;
    const px = Math.round(((wx + 10752) / 21504) * 16383);
    const py = Math.round(((wy + 10752) / 21504) * 16383);
    const r = parseReplay({
      match_paths: { paths: [path(1, Array(20).fill(px), Array(20).fill(py))] },
      players: [{ player_slot: 1 }],
      objectives: [{ destroyed_time_s: 10, team: 1, team_objective_id: 10 }],
    })!;
    const marks = structureMarks(r, () => 0);
    const caidos = marks.filter((m) => m.fell !== null);
    expect(caidos).toHaveLength(1);
    // Un santuario (sin carril) se asigna por cercanía: el de Archmother más cerca del atacante.
    expect(caidos[0]).toMatchObject({ kind: "shrine", x: 631, y: 150, team: 1, fell: 10 });
    expect(marks.filter((m) => m.kind === "guardian")).toHaveLength(6);
  });

  it("con carril marca exacto, sin mirar dónde estaban", () => {
    const r = parseReplay({
      match_paths: { paths: [path(1, Array(20).fill(8191), Array(20).fill(8191))] },
      players: [{ player_slot: 1 }],
      objectives: [{ destroyed_time_s: 10, team: 0, team_objective_id: 12 }],
    })!;
    const caidos = structureMarks(r, () => 1).filter((m) => m.fell !== null);
    expect(caidos).toHaveLength(2);
    for (const m of caidos) expect(m).toMatchObject({ kind: "baseGuardian", team: 0, lane: 1 });
  });
});
