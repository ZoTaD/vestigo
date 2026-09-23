import { describe, expect, it } from "vitest";
import * as copia from "../src/deadlockInvestment";
import * as original from "../../../deadlock/pipeline/src/investment";

describe("escalera de inversión", () => {
  it("es la misma que la del pipeline", () => {
    expect(copia.LADDERS).toEqual(original.LADDERS);
    expect(copia.INVESTMENT_CAP).toBe(original.INVESTMENT_CAP);
  });
});
