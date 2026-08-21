import { describe, it, expect } from "vitest";
import { bonusFor, LADDERS, INVESTMENT_CAP, WEAPON, VITALITY, SPIRIT } from "../src/investment";

/**
 * **Esta tabla está transcrita a mano y no hay quién la valide.** No la publica
 * la API de assets —se revisaron las 108 rutas del OpenAPI— ni la wiki. Sale de
 * capturas de la tienda del juego del 2026-07-31.
 *
 * Por eso el test la fija escalón por escalón: si alguien la toca sin querer, o
 * si alguien la actualiza por un parche, tiene que ser una decisión visible en el
 * diff y no un número que se movió solo.
 */
describe("la escalera de inversión, tal como la muestra el juego", () => {
  it("tiene once escalones y los mismos umbrales en las tres categorías", () => {
    const umbrales = [800, 1_600, 2_400, 3_200, 4_800, 6_400, 8_000, 11_200, 16_000, 22_400, 28_800];
    for (const [nombre, escalera] of Object.entries(LADDERS)) {
      expect(escalera.map((r) => r.souls), nombre).toEqual(umbrales);
    }
  });

  it("premia lo que dice la tienda", () => {
    expect(WEAPON.map((r) => r.bonus)).toEqual([9, 12, 15, 18, 46, 54, 62, 74, 86, 100, 115]);
    expect(VITALITY.map((r) => r.bonus)).toEqual([9, 12, 15, 20, 38, 42, 46, 50, 54, 60, 66]);
    expect(SPIRIT.map((r) => r.bonus)).toEqual([7, 11, 15, 19, 38, 45, 52, 59, 66, 75, 100]);
  });

  // Verificado contra una captura: al comprar Ricochet (6.400) el juego saltó a
  // ese escalón y mostró +54%. Es el caso que ata la tabla a la realidad.
  it("6.400 almas de arma dan +54%, que es lo que mostró el juego", () => {
    expect(bonusFor("weapon", 6_400)).toBe(54);
  });

  /**
   * El premio llega **al cruzar** el umbral, no antes: el juego no interpola. Con
   * 4.700 almas de arma seguís en el escalón de 3.200.
   */
  it("no interpola entre escalones", () => {
    expect(bonusFor("weapon", 3_200)).toBe(18);
    expect(bonusFor("weapon", 4_700)).toBe(18);
    expect(bonusFor("weapon", 4_800)).toBe(46);
  });

  it("no da nada por debajo del primer escalón", () => {
    expect(bonusFor("spirit", 0)).toBe(0);
    expect(bonusFor("spirit", 799)).toBe(0);
    expect(bonusFor("spirit", 800)).toBe(7);
  });

  /**
   * Pasarse del tope no suma. Está medido que pasa de verdad: el 10,5% de las
   * categorías de una build publicada supera las 28.800, y la más cargada llega
   * al 144% de ese número.
   */
  it("se topea en 28.800 y de ahí no sube más", () => {
    expect(INVESTMENT_CAP).toBe(28_800);
    expect(bonusFor("spirit", INVESTMENT_CAP)).toBe(100);
    expect(bonusFor("spirit", 41_600)).toBe(100);
    expect(bonusFor("weapon", 999_999)).toBe(115);
  });

  it("las tres escaleras suben siempre", () => {
    for (const [nombre, escalera] of Object.entries(LADDERS)) {
      for (let i = 1; i < escalera.length; i++) {
        expect(escalera[i].bonus, `${nombre} escalón ${i}`).toBeGreaterThan(escalera[i - 1].bonus);
      }
    }
  });
});
