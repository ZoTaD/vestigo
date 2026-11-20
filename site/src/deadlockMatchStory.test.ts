import { describe, expect, it } from "vitest";
import { matchStory, worstCollapse, type StoryInput } from "./deadlockMatchStory";
import type { ReplayFight } from "./deadlockReplay";

const fight = (start: number, before: number, after: number): ReplayFight => ({
  start,
  end: start + 10,
  kills: [],
  deaths: [0, 3],
  winner: 0,
  before,
  after,
  view: [0, 0, 1, 1],
});

const base = (over: Partial<StoryInput> = {}): StoryInput => ({
  winner: 0,
  duration: 2000,
  chance: () => 0.6,
  fights: [],
  objectives: [],
  midBoss: [],
  ledger: [],
  totals: new Map(),
  teamOf: (s) => (s < 6 ? 0 : 1),
  ...over,
});

describe("worstCollapse", () => {
  it("encuentra la racha más larga dentro de la ventana", () => {
    const o = (t: number, team = 1) => ({ t, team, id: 5 });
    expect(worstCollapse([o(100), o(200), o(230), o(260), o(900)], 1)).toEqual({ n: 3, from: 100, to: 230 });
    expect(worstCollapse([o(100, 0)], 1)).toBeNull();
  });
});

describe("matchStory", () => {
  it("elige como vuelco la pelea que más ayudó al ganador", () => {
    const s = matchStory(base({ fights: [fight(300, 0.5, 0.55), fight(900, 0.45, 0.7)] }));
    expect(s[0]).toMatchObject({ kind: "turn", t: 900, pts: 25, phase: "flip" });
  });

  it("una pelea pareja no cuenta como vuelco", () => {
    const pareja = { ...fight(300, 0.5, 0.7), deaths: [2, 2] as [number, number], winner: null };
    expect(matchStory(base({ fights: [pareja] })).find((f) => f.kind === "turn")).toBeUndefined();
  });

  it("marca la remontada si el ganador estuvo abajo del 35 %", () => {
    const s = matchStory(base({ chance: (t) => (t < 1200 ? 0.25 : 0.8) }));
    expect(s.find((f) => f.kind === "comeback")).toMatchObject({ team: 0 });
    expect(s.find((f) => f.kind === "control")).toBeUndefined();
  });

  it("marca el control si el ganador nunca bajó del 45 %", () => {
    expect(matchStory(base()).find((f) => f.kind === "control")).toBeTruthy();
  });

  it("cuenta al que más sumó del ganador y al que más restó del perdedor", () => {
    const s = matchStory(base({ totals: new Map([[1, 20], [2, 5], [7, -3], [8, -15]]) }));
    expect(s.find((f) => f.kind === "carry")).toMatchObject({ slot: 1 });
    expect(s.find((f) => f.kind === "sink")).toMatchObject({ slot: 8 });
  });

  it("no pasa de cinco hechos", () => {
    const s = matchStory(
      base({
        chance: (t) => (t < 1200 ? 0.25 : 0.8),
        fights: [fight(900, 0.3, 0.6)],
        objectives: [100, 150, 200, 250].map((t) => ({ t, team: 1, id: 5 })),
        midBoss: [{ t: 1000, team: 0 }],
        totals: new Map([[1, 20], [8, -15]]),
        ledger: [{ t: 300, slot: 9, kind: "farm", value: -8 }],
      }),
    );
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s[0].kind).toBe("turn");
  });
});
