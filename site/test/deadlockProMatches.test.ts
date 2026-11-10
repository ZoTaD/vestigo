import { describe, expect, it } from "vitest";
import { maxOrder } from "../src/DeadlockProMatches";

describe("maxOrder", () => {
  it("ordena por cuál llegó primero a los 4 puntos y después por puntos", () => {
    // La 2 llega a 4 primero, después la 1; la 3 tiene 2 puntos y la 4 ninguno.
    const path = [1, 2, 3, 2, 2, 1, 2, 3, 1, 1];
    expect(maxOrder(path, [1, 2, 3, 4])).toEqual([2, 1, 3]);
  });
});
