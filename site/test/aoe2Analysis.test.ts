import { describe, expect, it } from "vitest";
import { analizar } from "../src/aoe2/api/analysis";
import type { Accion } from "../src/aoe2/api/replay";

const q = (t: number, id: number, player: number, amount = 1): Accion => ({ t, kind: "queue", id, player, amount });
const r = (t: number, id: number, player: number): Accion => ({ t, kind: "research", id, player });

describe("análisis de una grabación de AoE2", () => {
  it("APM por minuto de juego, último clic de cada edad y unidades con cantidad", () => {
    const acciones = [q(10, 83, 1), q(40, 83, 1, 5), r(500, 101, 1), r(520, 101, 1), r(1100, 102, 1), q(600, 4, 1), q(620, 4, 1), q(30, 83, 2)];
    const a = analizar({ acciones, cuenta: { 1: 1200, 2: 600 }, fin: 1200 });
    expect(a[1].apm).toBe(60);
    expect(a[2].apm).toBe(30);
    expect(a[1].ages).toEqual([520, 1100, null]);
    expect(a[1].units).toEqual([[83, 6], [4, 2]]);
    expect(a[2].ages).toEqual([null, null, null]);
  });
  it("una partida de menos de 2 minutos no da APM", () => {
    expect(analizar({ acciones: [], cuenta: { 1: 50 }, fin: 90 })[1].apm).toBeNull();
  });
});
