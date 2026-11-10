import { describe, expect, it } from "vitest";
import * as copia from "../src/deadlockInvestment";
import * as original from "../../games/deadlock/pipeline/src/investment";

describe("escalera de inversión", () => {
  it("es la misma que la del pipeline", () => {
    expect(copia.LADDERS).toEqual(original.LADDERS);
    expect(copia.INVESTMENT_CAP).toBe(original.INVESTMENT_CAP);
  });
});

describe("rungFill", () => {
  it("llena por escalones, no por almas", () => {
    expect(copia.rungFill("vitality", 0)).toBe(0);
    expect(copia.rungFill("vitality", 800)).toBeCloseTo(1 / 11);
    expect(copia.rungFill("vitality", 11_200)).toBeCloseTo(8 / 11);
    expect(copia.rungFill("weapon", 24_800)).toBeCloseTo((10 + 2400 / 6400) / 11);
    expect(copia.rungFill("spirit", 28_800)).toBe(1);
    expect(copia.rungFill("spirit", 40_000)).toBe(1);
  });
});
