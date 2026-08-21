import { describe, it, expect } from "vitest";
import {
  tierOfDelta,
  buildItems,
  scatterOf,
  shopMap,
  usageMedian,
  quadrantOf,
  COSTS,
  SLOTS,
  OPEN_COSTS,
  type Item,
} from "../src/deadlockItemsData";
import { PUBLISHED_BAND } from "../src/deadlockData";
import items from "@deadlock/items.json";
import catalog from "@deadlock/catalog.json";

const file = items as unknown as {
  band: string;
  costBaselines: Record<string, number>;
  items: { itemId: number; delta: number; n: number }[];
};
const cat = catalog as unknown as { items: Record<string, { cost: number }> };

/**
 * Los mismos cuatro cortes para los cuatro precios, porque el delta ya está
 * medido contra la base de su propio precio. Una S de 800 y una S de 6400
 * significan lo mismo: dos puntos por encima de lo que rinde ese precio.
 */
describe("de delta a letra", () => {
  it("corta donde dice el diseño", () => {
    expect(tierOfDelta(5.12)).toBe("S");
    expect(tierOfDelta(2)).toBe("S");
    expect(tierOfDelta(1.99)).toBe("A");
    expect(tierOfDelta(0.8)).toBe("A");
    expect(tierOfDelta(0.79)).toBe("B");
    expect(tierOfDelta(-0.3)).toBe("B");
    expect(tierOfDelta(-0.31)).toBe("C");
    expect(tierOfDelta(-1.8)).toBe("C");
    expect(tierOfDelta(-9.68)).toBe("D");
  });
});

describe("la lista publicada", () => {
  const built = buildItems(PUBLISHED_BAND, "en");

  it("es la banda por defecto y trae los 156 ítems de tienda", () => {
    expect(file.band).toBe(PUBLISHED_BAND);
    expect(built.length).toBe(Object.keys(cat.items).length);
  });

  it("resuelve nombre, imagen y precio del catálogo", () => {
    const uno = built[0];
    expect(uno.name).not.toMatch(/^#/);
    expect(uno.img).toMatch(/^https?:\/\//);
    expect(COSTS).toContain(uno.cost as (typeof COSTS)[number]);
  });

  it("traduce al español sin tocar el precio ni el delta", () => {
    const en = buildItems(PUBLISHED_BAND, "en");
    const es = buildItems(PUBLISHED_BAND, "es");
    const iEn = en.find((i) => i.name === "Extended Magazine");
    const iEs = es.find((i) => i.itemId === iEn!.itemId);
    expect(iEs!.name).toBe("Cargador Ampliado");
    expect(iEs!.delta).toBe(iEn!.delta);
  });

  it("cae en los cuatro precios de la tienda y en ninguno más", () => {
    expect([...new Set(built.map((i) => i.cost))].sort((a, b) => b - a)).toEqual([...COSTS]);
  });

  /**
   * El motivo entero de la página: si las S fueran todas del precio más caro,
   * estaríamos publicando la lista de los competidores con otro número encima.
   */
  it("reparte las S entre varios precios, que es el punto de la métrica", () => {
    const eses = built.filter((i) => i.tier === "S");
    expect(eses.length).toBeGreaterThan(0);
    expect(new Set(eses.map((i) => i.cost)).size).toBeGreaterThan(1);
  });

  it("publica la base de cada precio, que es contra lo que se resta el delta", () => {
    for (const cost of COSTS) {
      expect(file.costBaselines[String(cost)]).toBeGreaterThan(0.4);
      expect(file.costBaselines[String(cost)]).toBeLessThan(0.7);
    }
  });

  // El confundido que la página existe para corregir, verificado sobre el archivo
  // que se publica: comprar algo de 6400 rinde más que comprar algo de 800, y por
  // eso ninguno de los dos se puede comparar contra el promedio general.
  it("mide que el precio más caro rinde más, que es el sesgo que se corrige", () => {
    expect(file.costBaselines["6400"]).toBeGreaterThan(file.costBaselines["800"]);
  });

  it("abre los dos precios donde elegir cambia algo", () => {
    expect([...OPEN_COSTS].sort((a, b) => b - a)).toEqual([6400, 3200]);
  });
});

/**
 * Los dos cuadrantes que la página existe para señalar.
 *
 * `sleeper` le gana a su precio y casi nadie lo compra; `trap` lo compra medio
 * servidor y resta. Los otros dos son la respuesta esperada — un ítem bueno que
 * todos compran no es noticia.
 */
describe("los cuadrantes", () => {
  const item = (itemId: number, delta: number, pickRate: number): Item =>
    ({
      itemId, n: 5000, delta, winRateRaw: 0.5, pickRate, buyMinute: 20,
      name: `i${itemId}`, img: "", cost: 3200, slot: "spirit", tier: tierOfDelta(delta),
    }) as Item;

  it("corta el uso por la mediana de la propia banda, no por un número inventado", () => {
    expect(usageMedian([item(1, 0, 0.02), item(2, 0, 0.08), item(3, 0, 0.3)])).toBeCloseTo(0.08, 4);
  });

  it("nombra los cuatro casos", () => {
    expect(quadrantOf(item(1, 2, 0.02), 0.08)).toBe("sleeper");
    expect(quadrantOf(item(2, 2, 0.3), 0.08)).toBe("staple");
    expect(quadrantOf(item(3, -2, 0.3), 0.08)).toBe("trap");
    expect(quadrantOf(item(4, -2, 0.02), 0.08)).toBe("niche");
  });

  it("ordena los sleepers por lo que rinden y las trampas por lo que restan", () => {
    const s = scatterOf([
      item(1, 3, 0.01), item(2, 5, 0.02), item(3, -1, 0.3), item(4, -4, 0.4), item(5, 1, 0.5),
    ]);
    expect(s.sleepers.map((p) => p.itemId)).toEqual([2, 1]);
    expect(s.traps.map((p) => p.itemId)).toEqual([4, 3]);
  });

  /** Sobre los datos publicados, no sobre un caso inventado. */
  it("encuentra los dos grupos en la banda por defecto", () => {
    const s = scatterOf(buildItems(PUBLISHED_BAND, "en"));
    expect(s.sleepers.length).toBeGreaterThan(5);
    expect(s.traps.length).toBeGreaterThan(5);
    // Ningún ítem puede caer en los dos lados a la vez.
    const ids = new Set([...s.sleepers, ...s.traps].map((p) => p.itemId));
    expect(ids.size).toBe(s.sleepers.length + s.traps.length);
  });
});

describe("el mapa de la tienda", () => {
  const cells = shopMap(buildItems(PUBLISHED_BAND, "en"));

  it("tiene una celda por precio y categoría", () => {
    expect(cells.length).toBe(COSTS.length * SLOTS.length);
  });

  it("cuenta todos los ítems una sola vez", () => {
    expect(cells.reduce((a, c) => a + c.n, 0)).toBe(buildItems(PUBLISHED_BAND, "en").length);
  });

  /**
   * La celda que el gráfico pinta más fuerte es la de 3200-vitalidad, y se
   * verificó contra las cuatro bandas antes de dibujarla: rinde entre −1,2 y
   * −1,4 en todas. Si algún día deja de ser negativa, este test lo dice.
   */
  it("mantiene negativa la peor góndola medida", () => {
    const peor = cells.find((c) => c.cost === 3200 && c.slot === "vitality")!;
    expect(peor.delta).toBeLessThan(0);
  });
});
