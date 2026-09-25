import { describe, expect, it } from "vitest";
import { PHASE_CUTS, byPhase } from "../src/deadlockBuildsData";

const compra = (minute: number, itemId = minute) => ({
  itemId,
  name: `#${itemId}`,
  img: "",
  cost: 800,
  slot: "spirit",
  minute,
  upgrade: false,
});

describe("byPhase", () => {
  it("reparte las compras en los tres tramos", () => {
    const out = byPhase([compra(3), compra(15), compra(30)]);
    expect(out.map((g) => g.phase)).toEqual(["early", "mid", "late"]);
    expect(out.map((g) => g.buys.length)).toEqual([1, 1, 1]);
  });

  it("el minuto del corte cae en el tramo de arriba", () => {
    // 12 es el primer minuto de "mid" y 22 el primero de "late": los rótulos
    // dicen 0-12 y 12-22, así que el borde tiene que pertenecer a uno solo.
    const out = byPhase([compra(11), compra(12), compra(21), compra(22)]);
    expect(out.find((g) => g.phase === "early")!.buys.map((b) => b.minute)).toEqual([11]);
    expect(out.find((g) => g.phase === "mid")!.buys.map((b) => b.minute)).toEqual([12, 21]);
    expect(out.find((g) => g.phase === "late")!.buys.map((b) => b.minute)).toEqual([22]);
  });

  it("no devuelve el tramo que quedó vacío, para que no dibuje una sección sola", () => {
    const out = byPhase([compra(4), compra(28)]);
    expect(out.map((g) => g.phase)).toEqual(["early", "late"]);
  });

  it("conserva el orden de compra adentro de cada tramo", () => {
    // Llegan ya ordenadas por el pipeline, con la cadena respetada: reordenar
    // acá desharía el arreglo que hace que un componente venga antes que su mejora.
    const out = byPhase([compra(5, 1), compra(5, 2), compra(7, 3)]);
    expect(out[0].buys.map((b) => b.itemId)).toEqual([1, 2, 3]);
  });

  it("devuelve vacío sin compras", () => {
    expect(byPhase([])).toEqual([]);
  });

  it("los cortes son los del formato: 12 y 22", () => {
    expect(PHASE_CUTS).toEqual({ mid: 12, late: 22 });
  });
});
