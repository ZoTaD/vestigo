import { describe, expect, it } from "vitest";
import { bySlot, type AbilityView } from "../src/deadlockBuildsData";

/**
 * Las filas de la grilla de habilidades van en el orden en que **el juego** las
 * numera, no en el que se suben.
 *
 * El caso que lo motivó es real: Ivy (héroe 20) se sube Entangling Thorns →
 * Stone Form → Kudzu Connection → Air Drop, pero el juego las numera Entangling
 * Thorns (1), Kudzu Connection (2), Stone Form (3), Air Drop (4). Con las filas
 * en orden de subida, la página mostraba 1, 3, 2, 4.
 */

const a = (id: number, name: string, slot?: number): AbilityView => ({
  id,
  name,
  img: "",
  ...(slot ? { slot } : {}),
});

describe("bySlot", () => {
  it("pone las filas en el orden en que el juego numera las habilidades", () => {
    // Tal como venían de `abilityOrder` para Ivy: 1, 3, 2, 4.
    const subida = [
      a(1, "Entangling Thorns", 1),
      a(3, "Stone Form", 3),
      a(2, "Kudzu Connection", 2),
      a(4, "Air Drop", 4),
    ];
    expect(bySlot(subida).map((x) => x.name)).toEqual([
      "Entangling Thorns",
      "Kudzu Connection",
      "Stone Form",
      "Air Drop",
    ]);
  });

  it("no toca el orden cuando ya viene bien", () => {
    const ok = [a(1, "Uno", 1), a(2, "Dos", 2), a(3, "Tres", 3), a(4, "Cuatro", 4)];
    expect(bySlot(ok).map((x) => x.slot)).toEqual([1, 2, 3, 4]);
  });

  it("deja el orden intacto en datos viejos, que no traen casilla", () => {
    // `sort` es estable, así que sin `slot` las filas quedan como venían y el
    // panel viejo de "orden de desbloqueo" sigue numerando bien.
    const viejo = [a(9, "C"), a(7, "A"), a(8, "B")];
    expect(bySlot(viejo).map((x) => x.name)).toEqual(["C", "A", "B"]);
  });

  it("manda al final a la que no tenga casilla, sin perderla", () => {
    const mezcla = [a(4, "Sin casilla"), a(1, "Primera", 1), a(2, "Segunda", 2)];
    expect(bySlot(mezcla).map((x) => x.name)).toEqual(["Primera", "Segunda", "Sin casilla"]);
  });

  it("no muta el array que recibe", () => {
    const orig = [a(3, "Tres", 3), a(1, "Uno", 1)];
    bySlot(orig);
    expect(orig.map((x) => x.slot)).toEqual([3, 1]);
  });
});
