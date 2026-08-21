import { describe, it, expect } from "vitest";
import { toLobby } from "../src/normalize";
import { findContested } from "../src/contested";
import { defaultCalibration } from "../src/context";
import type { Board, Lobby } from "../src/types";

import sameComp from "./fixtures/NA1_5594105892.json";
import partial from "./fixtures/NA1_5601977115.json";

const raw = (f: unknown) => (f as { match: unknown }).match;
const lobby: Lobby = toLobby(raw(sameComp));
/** Pretend every unit on a board has the same pickrate, to isolate the effect. */
const everyUnitAt = (board: Board, rate: number): Record<string, number> =>
  Object.fromEntries(board.units.map((u) => [u.id, rate]));

const byName = (name: string): Board => {
  const board = lobby.boards.find((b) => b.gameName === name);
  if (!board) throw new Error(`no board for ${name}`);
  return board;
};

describe("findContested", () => {
  // jasonjava (4th) and Dubhangur (7th) both ran DarkStar into a Chogath carry.
  it("flags a rival on the exact same comp", () => {
    const findings = findContested(byName("jasonjava"), lobby);
    const exact = findings.find((f) => f.id === "contested-comp");
    expect(exact).toBeDefined();
    expect(exact!.severity).toBe("high");
    expect(exact!.detail).toContain("Dubhangur");
  });

  it("reports the rival's placement, so the reader can judge who won the fight", () => {
    const exact = findContested(byName("Dubhangur"), lobby).find(
      (f) => f.id === "contested-comp"
    );
    expect(exact!.detail).toContain("jasonjava");
    expect(exact!.detail).toMatch(/4/);
  });

  // Vuo and Monstrata both carried Leona, but out of different traits.
  it("flags a shared carry even when the traits differ", () => {
    const findings = findContested(byName("Vuo"), lobby);
    const carry = findings.find((f) => f.id === "contested-carry");
    expect(carry).toBeDefined();
    expect(carry!.detail).toContain("Monstrata");
    expect(findings.some((f) => f.id === "contested-comp")).toBe(false);
  });

  it("says nothing about a carry nobody else played", () => {
    // G Ree carried Diana; no one else in this lobby did.
    const findings = findContested(byName("G Ree"), lobby);
    expect(findings.some((f) => f.id === "contested-carry")).toBe(false);
  });

  it("judges crowding against each champion's pickrate, not the raw count", () => {
    const me = byName("jasonjava");
    const shared = me.units[0].id;
    const rivalsWithIt = lobby.boards.filter(
      (b) => b.puuid !== me.puuid && b.units.some((u) => u.id === shared)
    ).length;

    // Same board, same rivals. Only the champion's popularity changes — and it
    // has to flip the verdict, because that is the whole correction.
    const common = findContested(me, lobby, {
      calibration: { ...defaultCalibration, pickRates: everyUnitAt(me, 0.95) },
    });
    const rare = findContested(me, lobby, {
      calibration: { ...defaultCalibration, pickRates: everyUnitAt(me, 0.02) },
    });

    expect(rivalsWithIt).toBeGreaterThan(0);
    expect(common.some((f) => f.id === "contested-crowd")).toBe(false);
    expect(rare.some((f) => f.id === "contested-crowd")).toBe(true);
  });

  it("shows the expected number beside the real one", () => {
    const me = byName("jasonjava");
    const found = findContested(me, lobby, {
      calibration: { ...defaultCalibration, pickRates: everyUnitAt(me, 0.02) },
    }).find((f) => f.id === "contested-crowd");
    expect(found!.detail).toMatch(/when the normal number is/);
    expect(found!.evidence).toContain("4.84");
  });

  it("says nothing about crowding when no pickrates were supplied", () => {
    const found = findContested(byName("jasonjava"), lobby);
    expect(found.some((f) => f.id === "contested-crowd")).toBe(false);
  });

  it("quotes the calibration it was given, not a number frozen in the code", () => {
    const calibration = {
      ...defaultCalibration,
      matches: 1234,
      contest: { placementCost: 0.41, carriesCompared: 9 },
    };
    const exact = findContested(byName("jasonjava"), lobby, { calibration }).find(
      (f) => f.id === "contested-comp"
    );
    expect(exact!.evidence).toContain("1234");
    expect(exact!.evidence).toContain("0.41");
  });

  it("states a measured cost rather than asserting the contest caused the loss", () => {
    const exact = findContested(byName("jasonjava"), lobby).find(
      (f) => f.id === "contested-comp"
    );
    expect(exact!.evidence).toMatch(/placements on average/);
    // Never claims contest cost the stars: the data showed that effect is noise.
    expect(exact!.detail).not.toMatch(/estrella/i);
  });

  it("survives a lobby holding a single player", () => {
    const solo = toLobby(raw(partial));
    expect(() => findContested(solo.boards[0], solo)).not.toThrow();
    expect(findContested(solo.boards[0], solo)).toEqual([]);
  });
});
