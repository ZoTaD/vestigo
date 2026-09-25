import { describe, expect, it } from "vitest";
import { upgradePriority, type AbilityView } from "../src/deadlockBuildsData";

/**
 * La prioridad de mejora sale de la senda: primero la habilidad que se completa
 * antes, y las que no llegan al máximo detrás, por cuántas subidas juntaron.
 */

const a = (id: number, name: string, slot: number): AbilityView => ({ id, name, img: "", slot });
const [p, r, e, s] = [a(1, "Pulsación", 1), a(2, "Aurora", 2), a(3, "Entrelazamiento", 3), a(4, "Singularidad", 4)];

describe("upgradePriority", () => {
  it("ordena por cuál se completa primero (la senda de Dynamo)", () => {
    // ◆ 1 ◆ ◆ 2 ◆ 3 · 1 · · 1 2 3 1 2 3 — tal como la muestra la grilla.
    const path = [1, 1, 2, 3, 1, 4, 1, 4, 2, 2, 2, 3, 3, 3, 4];
    expect(upgradePriority([p, r, e, s], path).map((x) => x.name)).toEqual([
      "Pulsación",
      "Aurora",
      "Entrelazamiento",
      "Singularidad",
    ]);
  });

  it("no depende del orden en que vienen las habilidades", () => {
    const path = [4, 3, 2, 1, 3, 3, 3, 2, 2, 2, 4, 4, 4, 1, 1];
    expect(upgradePriority([p, r, e, s], path).map((x) => x.id)).toEqual([3, 2, 4, 1]);
  });

  it("entre dos que no se completan, va primero la que juntó más subidas", () => {
    // Pulsación y Aurora completas; Entrelazamiento con dos mejoras, Singularidad con una.
    const path = [1, 2, 3, 4, 1, 1, 1, 2, 2, 2, 3, 3, 4];
    expect(upgradePriority([s, e, r, p], path).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it("a igual cantidad sin completar, va primero la que llegó antes", () => {
    const path = [1, 2, 3, 4, 1, 1, 1, 2, 2, 2, 4, 3];
    expect(upgradePriority([p, r, e, s], path).map((x) => x.id)).toEqual([1, 2, 4, 3]);
  });

  it("sin senda no hay prioridad", () => {
    expect(upgradePriority([p, r, e, s], [])).toEqual([]);
  });
});
