/**
 * Motor de la calculadora de cultivos de Stardew (etapa 2, tarea 3). Los números esperados están calculados a mano con
 * las reglas del juego 1.6.15 (cotejadas contra el código de `HoeDirt.applySpeedIncreases`, `Crop.harvest` y
 * `Object.sellToStorePrice`); cada caso anota cómo sale.
 */
import { describe, expect, it } from "vitest";
import data from "../../games/stardew/data/crops.json";
import { growDays, harvests, profit, qualityOdds, type Crop, type Opts } from "../src/stardew/crops/calc";

const crops = data.crops as Crop[];
const crop = (slug: string): Crop => {
  const c = crops.find((x) => x.slug === slug);
  if (!c) throw new Error(`no está ${slug}`);
  return c;
};

const base: Opts = {
  season: 0, day: 1, level: 0, fert: "none", tiller: false, agriculturist: false, artisan: false,
  sell: "raw", seeds: "buy", greenhouse: false, paddyBonus: true,
};
const o = (x: Partial<Opts>): Opts => ({ ...base, ...x });

describe("qualityOdds", () => {
  it("nivel 0 sin fertilizante: oro 0,01; plata 0,99·0,02; el resto normal", () => {
    // oro = 0,2·0 + 0,2·0·(2/12) + 0,01 = 0,01; plata = min(0,75; 0,02) = 0,02.
    // Orden del juego: oro 0,01 → plata (1 − 0,01)·0,02 = 0,0198 → normal 0,9702.
    const q = qualityOdds(0, "none");
    expect(q[0]).toBeCloseTo(0.9702, 10);
    expect(q[1]).toBeCloseTo(0.0198, 10);
    expect(q[2]).toBeCloseTo(0.01, 10);
    expect(q[3]).toBe(0);
  });

  it("nivel 10 con abono de lujo: sin normal y suma 1", () => {
    // oro = 0,2 + 0,2·3·(12/12) + 0,01 = 0,81; iridio = 0,405; oro final = 0,595·0,81 = 0,48195;
    // plata = el resto (con q = 3 nunca sale normal) = 0,595·0,19 = 0,11305.
    const q = qualityOdds(10, "deluxe");
    expect(q[0]).toBe(0);
    expect(q[3]).toBeCloseTo(0.405, 10);
    expect(q[2]).toBeCloseTo(0.48195, 10);
    expect(q[1]).toBeCloseTo(0.11305, 10);
    expect(q[0] + q[1] + q[2] + q[3]).toBeCloseTo(1, 12);
  });

  it("el Speed-Gro no mejora la calidad", () => {
    expect(qualityOdds(4, "speed")).toEqual(qualityOdds(4, "none"));
  });
});

describe("growDays", () => {
  it("[1,2,2,2] con Speed-Gro: 6", () => {
    // total 7; ceil(7·0,1) = 1 día. La fase 1 vale 1 y la primera no baja de 1, así que se lo quita la 2.ª: 7 − 1 = 6.
    expect(growDays([1, 2, 2, 2], 0.1)).toBe(6);
  });

  it("Fresa [1,1,2,2,2] con Hyper: 5; Hyper + Agricultor: 4", () => {
    // total 8; ceil(8·0,33) = ceil(2,64) = 3 → fases 2.ª, 3.ª y 4.ª pierden uno: 8 − 3 = 5.
    expect(growDays(crop("strawberry").phases, 0.33)).toBe(5);
    // ceil(8·0,43) = ceil(3,44) = 4 → 8 − 4 = 4.
    expect(growDays(crop("strawberry").phases, 0.43)).toBe(4);
  });

  it("Chirivía [1,1,1,1]: las fases después de la primera pueden quedar en 0", () => {
    // Speed-Gro: ceil(0,4) = 1 → 3. Hyper: ceil(1,32) = 2 → 2. Hyper + Agricultor: ceil(1,72) = 2 → 2.
    expect(growDays([1, 1, 1, 1], 0.1)).toBe(3);
    expect(growDays([1, 1, 1, 1], 0.33)).toBe(2);
    expect(growDays([1, 1, 1, 1], 0.43)).toBe(2);
    // Deluxe (0,25): ceil(1) = 1 → 3.
    expect(growDays([1, 1, 1, 1], 0.25)).toBe(3);
  });

  it("no quita más de 3 vueltas: [1,1] con 0,9 queda en 1", () => {
    // total 2; ceil(1,8) = 2, pero sólo la 2.ª fase es elegible: vuelta 1 → 0; después ya no puede. 2 − 1 = 1.
    expect(growDays([1, 1], 0.9)).toBe(1);
  });

  it("la primera fase sí baja si vale más de 1", () => {
    // Fruta milenaria [2,7,7,7,5] = 28; Deluxe: ceil(7) = 7 → 21.
    expect(growDays([2, 7, 7, 7, 5], 0.25)).toBe(21);
  });

  it("sin velocidad no cambia", () => {
    expect(growDays([1, 2, 3], 0)).toBe(6);
  });
});

describe("harvests", () => {
  it("Chirivía, primavera día 1: 6 cosechas (5, 9, 13, 17, 21, 25)", () => {
    expect(harvests(crop("parsnip"), base)).toEqual([5, 9, 13, 17, 21, 25]);
  });

  it("Arándano, verano día 1: 13 días y rebrote cada 4 → 14, 18, 22, 26", () => {
    expect(harvests(crop("blueberry"), o({ season: 1 }))).toEqual([14, 18, 22, 26]);
  });

  it("Maíz, verano día 1: sigue en otoño (11 cosechas, la última el 27 de otoño)", () => {
    // 14 días → 15 de verano; cada 4: 19, 23, 27; otoño = días 29–56: 31, 35, …, 55.
    const h = harvests(crop("corn"), o({ season: 1 }));
    expect(h.length).toBe(11);
    expect(h[0]).toBe(15);
    expect(h.filter((d) => d > 28)).toEqual([31, 35, 39, 43, 47, 51, 55]);
  });

  it("Maíz plantado en otoño no cuenta más allá del otoño", () => {
    // 1 de otoño + 14 = 15; 19, 23, 27.
    expect(harvests(crop("corn"), o({ season: 2 }))).toEqual([15, 19, 23, 27]);
  });

  it("Fruta milenaria en primavera: 28 días y rebrote cada 7 hasta el fin del otoño", () => {
    // 1 + 28 = 29 (1 de verano); 36, 43, …, hasta ≤ 84: (84 − 29) / 7 = 7,86 → 8 cosechas.
    expect(harvests(crop("ancient-fruit"), base)).toEqual([29, 36, 43, 50, 57, 64, 71, 78]);
  });

  it("Melón el 20 de verano: no llega", () => {
    expect(harvests(crop("melon"), o({ season: 1, day: 20 }))).toEqual([]);
  });

  it("fuera de estación no se planta", () => {
    expect(harvests(crop("melon"), o({ season: 0 }))).toEqual([]);
  });

  it("invernadero: un año (112 días) desde la siembra sin mirar la estación", () => {
    // Melón en invierno, día 1, 12 días: 13, 25, …, 109 (≤ 1 + 111 = 112) → 9 cosechas.
    expect(harvests(crop("melon"), o({ season: 3, greenhouse: true }))).toEqual([13, 25, 37, 49, 61, 73, 85, 97, 109]);
  });

  it("Café de primavera sigue cosechando en verano", () => {
    // [1,2,2,3,2] = 10 → 11; rebrota cada 2 hasta el 28 de verano (56): 11, 13, …, 55 → 23 cosechas, 14 en verano.
    const h = harvests(crop("coffee-bean"), base);
    expect(h.length).toBe(23);
    expect(h[0]).toBe(11);
    expect(h.at(-1)).toBe(55);
    expect(h.filter((d) => d > 28).length).toBe(14);
  });

  it("Arroz con y sin el bonus del arrozal", () => {
    // [1,2,2,3] = 8. Sin bonus: 9, 17, 25.
    expect(harvests(crop("unmilled-rice"), o({ paddyBonus: false }))).toEqual([9, 17, 25]);
    // Con bonus 0,25: ceil(2) = 2 → 6 días: 7, 13, 19, 25.
    expect(harvests(crop("unmilled-rice"), base)).toEqual([7, 13, 19, 25]);
    // Bonus + Agricultor = 0,25f + 0,1f = 0,35f; ceil(8·0,35f = 2,8) = 3 → 5 días: 6, 11, 16, 21, 26.
    expect(harvests(crop("unmilled-rice"), o({ agriculturist: true }))).toEqual([6, 11, 16, 21, 26]);
    // A un cultivo que no es de arrozal no le cambia nada.
    expect(harvests(crop("parsnip"), o({ paddyBonus: false }))).toEqual(harvests(crop("parsnip"), base));
  });

  it("el fertilizante de velocidad acorta la primera cosecha y no el rebrote", () => {
    // Arándano [1,3,3,4,2] = 13; Speed-Gro ceil(1,3) = 2 → 11: 12, 16, 20, 24, 28.
    expect(harvests(crop("blueberry"), o({ season: 1, fert: "speed" }))).toEqual([12, 16, 20, 24, 28]);
  });
});

describe("profit", () => {
  it("Chirivía comprando semillas, nivel 0, sin abono", () => {
    // Precios por calidad: 35, floor(35·1,25) = 43, floor(35·1,5) = 52, 70.
    // Esperado = 0,9702·35 + 0,0198·43 + 0,01·52 = 35,3284; 6 cosechas → 211,9704.
    // Semillas: 6 siembras × 20 = 120. Neto 91,9704; ÷ (25 − 1) días = 3,8321.
    const p = profit(crop("parsnip"), base);
    expect(p.harvests).toBe(6);
    expect(p.yield).toBeCloseTo(6, 10);
    expect(p.gross).toBeCloseTo(211.9704, 6);
    expect(p.seedCost).toBe(120);
    expect(p.net).toBeCloseTo(91.9704, 6);
    expect(p.perDay).toBeCloseTo(91.9704 / 24, 6);
    expect(p.best).toBe("raw");
    expect(p.seedUnknown).toBe(false);
  });

  it("Labrador suma 10 % a la verdura", () => {
    // floor(35·1,1) = 38, floor(43·1,1) = 47, floor(52·1,1) = 57.
    // Esperado = 0,9702·38 + 0,0198·47 + 0,01·57 = 36,8676 + 0,9306 + 0,57 = 38,3682.
    const p = profit(crop("parsnip"), o({ tiller: true }));
    expect(p.gross).toBeCloseTo(6 * 38.3682, 6);
  });

  it("Arándano: 3 por cosecha + extra geométrica, la calidad sólo en la primera", () => {
    // Unidades por cosecha = 3 + 0,02/0,98. Precio esperado de la primera = 0,9702·50 + 0,0198·62 + 0,01·75 = 50,4876.
    // Las otras 2 + 0,0204… salen en normal (50). Por cosecha = 50,4876 + (2 + 0,02/0,98)·50.
    const per = 50.4876 + (2 + 0.02 / 0.98) * 50;
    const p = profit(crop("blueberry"), o({ season: 1 }));
    expect(p.harvests).toBe(4);
    expect(p.yield).toBeCloseTo(4 * (3 + 0.02 / 0.98), 10);
    expect(p.gross).toBeCloseTo(4 * per, 6);
    expect(p.seedCost).toBe(80); // rebrota: una sola semilla
    expect(p.perDay).toBeCloseTo((4 * per - 80) / (26 - 1), 6);
  });

  it("Melón el 20 de verano: 0 cosechas, neto negativo y perDay finito", () => {
    // Una semilla (80) y nada que vender: −80 ÷ (28 − 20) = −10.
    const p = profit(crop("melon"), o({ season: 1, day: 20 }));
    expect(p.harvests).toBe(0);
    expect(p.gross).toBe(0);
    expect(p.net).toBe(-80);
    expect(Number.isFinite(p.perDay)).toBe(true);
    expect(p.perDay).toBe(-10);
  });

  it("plantar el 28 sin cosecha no divide por cero", () => {
    const p = profit(crop("melon"), o({ season: 1, day: 28 }));
    expect(Number.isFinite(p.perDay)).toBe(true);
  });

  it("Melón con 'best' y Artesano elige el Barril", () => {
    // Vino 750·1,4 = 1050 por melón; mermelada 550·1,4 = 770; deshidratado 1900·1,4 / 5 = 532; crudo ≈ 250.
    // Verano día 1: 13, 25 → 2 cosechas → 2100 de bruto.
    const p = profit(crop("melon"), o({ season: 1, sell: "best", artisan: true }));
    expect(p.best).toBe("(BC)12");
    expect(p.harvests).toBe(2);
    expect(p.gross).toBeCloseTo(2100, 6);
    expect(p.net).toBeCloseTo(2100 - 160, 6);
  });

  it("con 'best', si el crudo rinde más se queda crudo", () => {
    // Fibra: no tiene productos en los datos.
    expect(profit(crop("fiber"), o({ sell: "best", seeds: "own" })).best).toBe("raw");
  });

  it("perDay de la Fruta milenaria plantada el 1 de primavera", () => {
    // 8 cosechas (29 … 78). Precio esperado: 0,9702·550 + 0,0198·687 + 0,01·825 = 533,61 + 13,6026 + 8,25 = 555,4626.
    // Semillas propias: neto 8 × 555,4626 = 4443,7008; ÷ (78 − 1) = 57,7104…
    const p = profit(crop("ancient-fruit"), o({ seeds: "own" }));
    expect(p.harvests).toBe(8);
    expect(p.net).toBeCloseTo(4443.7008, 6);
    expect(p.perDay).toBeCloseTo(4443.7008 / 77, 6);
  });

  it("Fruta milenaria en invernadero: varias cosechas en el año", () => {
    // 1 + 28 = 29; cada 7 hasta 112: 29, 36, …, 106 → 12 cosechas. Neto 12 × 555,4626 = 6665,5512; ÷ (106 − 1).
    const p = profit(crop("ancient-fruit"), o({ season: 3, greenhouse: true, seeds: "own" }));
    expect(p.harvests).toBe(12);
    expect(p.net).toBeCloseTo(6665.5512, 6);
    expect(p.perDay).toBeCloseTo(6665.5512 / 105, 6);
  });

  it("fuera de estación: 0 cosechas, sin costo de semilla y lo marca", () => {
    const p = profit(crop("melon"), o({ season: 0 }));
    expect(p.harvests).toBe(0);
    expect(p.seedCost).toBe(0);
    expect(p.net).toBe(0);
    expect(p.outOfSeason).toBe(true);
    expect(Number.isFinite(p.perDay)).toBe(true);
    expect(profit(crop("melon"), o({ season: 1 })).outOfSeason).toBe(false);
    expect(profit(crop("melon"), o({ season: 0, greenhouse: true })).outOfSeason).toBe(false);
  });

  it("Café con 'best' elige el Barril, y el Artesano no lo sube (el Café no es artesanal)", () => {
    // Unidades por cosecha = 4 + 0,02/0,98. Barril: 5 granos → 150, o sea 30 por grano; crudo ≈ 15 por grano.
    const u = 4 + 0.02 / 0.98;
    const p = profit(crop("coffee-bean"), o({ sell: "best", artisan: true, seeds: "own" }));
    expect(p.best).toBe("(BC)12");
    expect(p.gross).toBeCloseTo(23 * u * 30, 6);
  });

  it("semilla sin precio fijo: costo 0 y lo marca", () => {
    // La Zanahoria (sus semillas salen de las cajas misteriosas); la Fresa ya trae el precio del Festival del Huevo.
    const p = profit(crop("carrot"), base);
    expect(p.seedCost).toBe(0);
    expect(p.seedUnknown).toBe(true);
  });

  it("semilla de festival: paga el precio del festival", () => {
    // Fresa: 100 g en el Festival del Huevo; rebrota, así que se compra una sola semilla.
    const p = profit(crop("strawberry"), base);
    expect(p.seedCost).toBe(100);
    expect(p.seedUnknown).toBe(false);
  });

  it("con semillas propias no hay costo ni marca", () => {
    const p = profit(crop("parsnip"), o({ seeds: "own" }));
    expect(p.seedCost).toBe(0);
    expect(p.seedUnknown).toBe(false);
    expect(p.net).toBeCloseTo(p.gross, 10);
  });

  it("Fibra (tope de calidad 0 en los datos): todo a precio normal aun con nivel 10 y abono de lujo", () => {
    // Las 4 estaciones (días 1–112), 7 días: 8, 15, …, 106 → 15 cosechas. Unidades = (4 + 7)/2 + 0,01/0,99.
    // Precio 1 en todas; sin el tope, el iridio (×2) subiría la primera unidad.
    const fibra = crop("fiber");
    expect(fibra.maxQuality).toBe(0);
    const p = profit(fibra, o({ level: 10, fert: "deluxe", seeds: "own" }));
    expect(p.harvests).toBe(15);
    expect(p.gross).toBeCloseTo(15 * (5.5 + 0.01 / 0.99), 10);
  });

  it("un cultivo con tope de calidad 0 vende todo en normal", () => {
    // Igual que la Chirivía pero con maxQuality 0: 6 cosechas × 35.
    const p = profit({ ...crop("parsnip"), maxQuality: 0 }, base);
    expect(p.gross).toBeCloseTo(6 * 35, 10);
  });

  it("ningún cultivo da NaN con opciones extremas", () => {
    for (const c of crops)
      for (const season of [0, 1, 2, 3] as const)
        for (const day of [1, 15, 28]) {
          const p = profit(c, o({ season, day, level: 10, fert: "hyper", tiller: true, agriculturist: true, artisan: true, sell: "best" }));
          for (const v of [p.harvests, p.yield, p.gross, p.seedCost, p.net, p.perDay]) expect(Number.isFinite(v)).toBe(true);
        }
  });
});
