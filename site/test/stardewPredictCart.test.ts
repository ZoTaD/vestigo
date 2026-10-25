// Carro ambulante contra el juego real: cada caso de `cart.json` lo escribió el
// oráculo (`games/stardew/tools/oracle`, comando `cart`) llamando a
// `ShopBuilder.GetShopStock("Traveler")`; el calendario sale de
// `Forest.ShouldTravelingMerchantVisitToday` y `Data/PassiveFestivals`.
import { describe, expect, it } from "vitest";
import fx from "./fixtures/stardew-predict/cart.json";
import raw from "../../games/stardew/data/predict.json";
import {
  cartDays,
  guaranteeByVisit,
  predictCart,
  STOCK_ILIMITADO,
  type CartItem,
  type CartState,
} from "../src/stardew/predict/cart";
import type { PredictData } from "../src/stardew/predict/query";

const data = raw as unknown as PredictData;

interface Caso {
  gameId: number;
  legacy: boolean;
  year: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  daysPlayed: number;
  cc: boolean;
  joja: boolean;
  multi: boolean;
  hearts: string[];
  y1: number;
  items: (string | number)[][];
}

const casos = fx.cases as Caso[];

function estado(c: Caso): CartState {
  return {
    seed: { gameId: c.gameId, legacy: c.legacy },
    daysPlayed: c.daysPlayed,
    season: c.season,
    day: c.day,
    year: c.year,
    multiplayer: c.multi,
    ccComplete: c.cc,
    jojaComplete: c.joja,
    hearts14: c.hearts,
    visitsUntilY1Guarantee: c.y1,
  };
}

function esperado(c: Caso): CartItem[] {
  return c.items.map(([id, price, stock, receta]) => {
    const x: CartItem = { id: id as string, price: price as number, stock: stock as number };
    if (receta === 1) x.recipe = true;
    return x;
  });
}

describe("predictCart contra el juego", () => {
  it("el fixture cubre las partidas, los años, el Mercado nocturno y las entradas raras", () => {
    expect(new Set(casos.map((c) => c.gameId)).size).toBe(3);
    expect(casos.some((c) => c.legacy)).toBe(true);
    expect(casos.some((c) => c.year === 1 && c.season === 0 && c.day === 5)).toBe(true);
    for (const d of [15, 16, 17]) expect(casos.some((c) => c.season === 3 && c.day === d)).toBe(true);
    const ids = new Set(casos.flatMap((c) => c.items.map((i) => i[0] as string)));
    for (const id of ["(O)485", "(O)801", "(O)347", "(BC)136", "(O)433", "(H)RedFez", "(F)RetroCatalogue",
      "(F)JunimoCatalogue", "(F)JojaCatalogue", "(F)AbigailPortrait", "(O)SkillBook_0"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("cada caso: ids, precio, cantidad y receta exactos, en el orden de la tienda", () => {
    for (const c of casos) {
      const nombre = `${c.gameId} ${c.year}-${c.season}-${c.day} y1=${c.y1} cc=${c.cc} joja=${c.joja} multi=${c.multi}`;
      expect(predictCart(estado(c), data), nombre).toEqual(esperado(c));
    }
  });

  it("lo ilimitado es int.MaxValue, como en el juego", () => {
    expect(STOCK_ILIMITADO).toBe(2147483647);
  });
});

describe("cartDays contra el calendario del juego", () => {
  const leer = (xs: string[]) =>
    xs.map((x) => {
      const [s, d, kind] = x.split(" ");
      return { season: Number(s), day: Number(d), kind };
    });
  const abierto = leer(fx.calendar.desertOpen);
  const cerrado = leer(fx.calendar.desertClosed);

  it("un año entero, con y sin el desierto abierto", () => {
    const sin = (xs: ReturnType<typeof cartDays>) => xs.map(({ season, day, kind }) => ({ season, day, kind }));
    expect(sin(cartDays({ season: 0, day: 1, year: 1 }, cerrado.length))).toEqual(cerrado);
    expect(sin(cartDays({ season: 0, day: 1, year: 1 }, abierto.length, { desertOpen: true }))).toEqual(abierto);
  });

  it("arranca el mismo día, sigue en el año siguiente y lleva el año", () => {
    const xs = cartDays({ season: 3, day: 26, year: 1 }, 4);
    expect(xs).toEqual([
      { season: 3, day: 26, year: 1, kind: "cart" },
      { season: 3, day: 28, year: 1, kind: "cart" },
      { season: 0, day: 5, year: 2, kind: "cart" },
      { season: 0, day: 7, year: 2, kind: "cart" },
    ]);
  });
});

describe("guaranteeByVisit (VisitsUntilY1Guarantee entre visitas)", () => {
  it("baja uno por cada día de carro en el bosque o de Mercado nocturno después de hoy, hasta -1", () => {
    const hoy = { season: 3 as const, day: 14, year: 1 };
    const dias = cartDays(hoy, 6, { desertOpen: true });
    // 14 (hoy, ya descontado en la partida), 15/16/17 Mercado, 19, 21.
    expect(guaranteeByVisit(3, hoy, dias)).toEqual([3, 2, 1, 0, -1, -1]);
  });

  it("el Festival del desierto no la cuenta", () => {
    const hoy = { season: 0 as const, day: 14, year: 1 };
    const dias = cartDays(hoy, 5, { desertOpen: true });
    expect(dias.map((d) => d.kind)).toEqual(["cart", "desertFestival", "desertFestival", "desertFestival", "cart"]);
    expect(guaranteeByVisit(1, hoy, dias)).toEqual([1, 1, 1, 1, 0]);
  });

  it("si hoy no hay carro, el primero ya descuenta", () => {
    const hoy = { season: 0 as const, day: 1, year: 1 };
    expect(guaranteeByVisit(2, hoy, cartDays(hoy, 3))).toEqual([1, 0, -1]);
  });
});
