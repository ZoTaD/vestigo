import { describe, expect, it } from "vitest";
import { aplicarRespuesta, climbers, countriesOf, eloHistogram, percentileOf, type Tabla } from "../src/aoe2/leaderboards/logic";

describe("ranking de AoE2: lógica", () => {
  it("el histograma junta de a 100 puntos", () => {
    expect(eloHistogram([1000, 1050, 1120])).toEqual([
      { from: 1000, count: 2 },
      { from: 1100, count: 1 },
    ]);
  });
  it("deja en cero los tramos vacíos del medio", () => {
    expect(eloHistogram([800, 1010]).map((b) => b.count)).toEqual([1, 0, 1]);
  });
  it("percentil: qué parte de los jugadores tiene menos ELO", () => {
    expect(percentileOf(1100, eloHistogram([1000, 1050, 1120]))).toBe(66.7);
    expect(percentileOf(500, eloHistogram([1000]))).toBe(0);
  });
  it("subieron hoy: por diferencia y sólo los que estaban ayer", () => {
    const hoy = { 1: 1500, 2: 1600, 3: 2000 };
    const ayer = { 1: 1450, 2: 1500 };
    expect(climbers(hoy, ayer, 5)).toEqual([
      { profileId: 2, elo: 1600, delta: 100 },
      { profileId: 1, elo: 1500, delta: 50 },
    ]);
  });
  it("subieron hoy: ignora a los que bajaron o quedaron igual", () => {
    expect(climbers({ 1: 1400, 2: 1500 }, { 1: 1450, 2: 1500 }, 5)).toEqual([]);
  });
  it("países presentes, de más a menos jugadores", () => {
    expect(countriesOf([{ country: "ar" }, { country: "br" }, { country: "ar" }, { country: null }])).toEqual(["ar", "br"]);
  });
  it("una respuesta de un pedido viejo (otro modo) no pisa la tabla", () => {
    const fila = (n: number) => ({ rank: n, profileId: n, alias: `j${n}`, country: null, elo: 1000, maxElo: 1000, wins: 1, losses: 1, streak: 0, lastMatch: 0 });
    const t: Tabla = { gen: 2, rows: [], total: 0 };
    expect(aplicarRespuesta(t, { gen: 1, rows: [fila(1)], total: 9, append: false })).toBe(t);
    const nueva = aplicarRespuesta(t, { gen: 2, rows: [fila(1)], total: 9, append: false });
    expect(nueva.rows).toHaveLength(1);
    expect(aplicarRespuesta(nueva, { gen: 2, rows: [fila(2)], total: 9, append: true }).rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});
