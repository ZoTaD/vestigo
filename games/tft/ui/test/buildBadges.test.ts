import { describe, expect, it } from "vitest";
import { WINRATE_SIGMAS, badgesFor } from "../src/deadlockBuildsData";

const b = (winRate: number, matches: number) => ({ winRate, matches });

describe("badgesFor", () => {
  it("marca como más jugada a la primera, que es como vienen ordenadas", () => {
    const out = badgesFor([b(0.5, 2000), b(0.5, 800), b(0.5, 400)]);
    expect(out[0]).toContain("played");
    expect(out[1]).not.toContain("played");
  });

  it("enciende la de mejor winrate cuando la ventaja se sostiene", () => {
    // El caso de Wraith: 61,3% con n=377 contra 52,9% con n=5.631. Son ocho
    // puntos y medio con errores de 2,6 y 0,7: se sostiene de sobra.
    const out = badgesFor([b(0.529, 5631), b(0.507, 2155), b(0.613, 377)]);
    expect(out[2]).toContain("winrate");
    expect(out[0]).toContain("played");
  });

  it("no la enciende cuando la diferencia es ruido", () => {
    // Lady Geist: 50,8% con n=539 contra 50,0% con n=1.793. Ocho décimas con
    // errores de 2,2 y 1,2 — una moneda. En 29 de 34 héroes pasa esto.
    const out = badgesFor([b(0.5, 1793), b(0.508, 539), b(0.479, 355)]);
    expect(out.flat()).not.toContain("winrate");
  });

  it("exige ganarle a TODAS las demás, no sólo a la más jugada", () => {
    // La segunda le saca mucho a la primera pero empata con la tercera: no hay
    // una "mejor", hay dos parecidas.
    const out = badgesFor([b(0.5, 4000), b(0.6, 400), b(0.598, 400)]);
    expect(out.flat()).not.toContain("winrate");
  });

  it("puede poner las dos etiquetas en la misma build", () => {
    // Si la más jugada es además la que mejor rinde, lo dice.
    const out = badgesFor([b(0.6, 4000), b(0.5, 400), b(0.49, 380)]);
    expect(out[0]).toEqual(["played", "winrate"]);
  });

  it("no etiqueta nada cuando el héroe tiene una sola build", () => {
    // Con una sola no hay nada que distinguir, y "la más jugada" de una sola
    // sería una etiqueta sin contenido. Cuatro héroes están así hoy.
    expect(badgesFor([b(0.55, 900)])).toEqual([[]]);
  });

  it("no etiqueta nada con la lista vacía", () => {
    expect(badgesFor([])).toEqual([]);
  });

  it("aguanta una build sin partidas sin dividir por cero", () => {
    const out = badgesFor([b(0.5, 1000), b(0.9, 0)]);
    expect(out.flat()).not.toContain("winrate");
  });

  it("el umbral es de dos errores estándar", () => {
    expect(WINRATE_SIGMAS).toBe(2);
  });
});
