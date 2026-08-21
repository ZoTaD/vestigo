import { describe, it, expect } from "vitest";
import {
  baselinesFrom,
  shrinkageToward,
  shrinkTo,
  itemsFileFrom,
  MIN_BUYS,
  type RawItemRow,
} from "../src/items";
import { BANDS } from "../src/bands";

const banda = BANDS[0];
const parche = { date: "2026-07-28T20:28:00Z", title: "06-30-2026 Update", link: "https://x" };
const totales = { matches: 26202, boards: 314424, from: "2026-07-28", to: "2026-07-30" };

const fila = (itemId: number, cost: number, buys: number, wr: number): RawItemRow => ({
  item_id: itemId,
  cost,
  buys: BigInt(buys),
  wins: BigInt(Math.round(buys * wr)),
  buy_seconds: 1200,
});

/**
 * La base de cada precio es todo el andamio: el `delta` que se publica es una
 * resta contra ella. Si se calcula mal, cada número de la página está corrido.
 */
describe("la base de cada precio", () => {
  it("es el winrate agregado de las compras de ese precio, no el promedio de los ítems", () => {
    // Un ítem muy comprado al 52% y uno poco comprado al 40%: el agregado tiene
    // que pesar por compras, no dar 46%.
    const bases = baselinesFrom([fila(1, 3200, 9000, 0.52), fila(2, 3200, 1000, 0.4)]);
    expect(bases.get(3200)).toBeCloseTo(0.508, 4);
  });

  it("separa un precio de otro", () => {
    const bases = baselinesFrom([fila(1, 800, 1000, 0.5), fila(2, 6400, 1000, 0.55)]);
    expect(bases.get(800)).toBeCloseTo(0.5, 4);
    expect(bases.get(6400)).toBeCloseTo(0.55, 4);
  });
});

/**
 * El encogimiento va **hacia la base del precio**, no hacia 50%.
 *
 * Para un ítem de 6400 el centro honesto es 55,06%: encogerlo hacia 50 lo
 * premiaría otra vez por ser caro, que es exactamente el sesgo que esta página
 * existe para corregir.
 */
describe("el encogimiento", () => {
  it("no mueve nada cuando hay muestra de sobra", () => {
    expect(shrinkTo(0.6, 1_000_000, 300, 0.5)).toBeCloseTo(0.6, 3);
  });

  it("deja el ítem en el centro cuando no hay muestra", () => {
    expect(shrinkTo(0.9, 0, 300, 0.55)).toBeCloseTo(0.55, 6);
  });

  it("tira hacia el centro del precio y NO hacia 50%", () => {
    // 100 compras con k=300 deja el ítem a un cuarto del camino desde el centro.
    expect(shrinkTo(0.7, 100, 300, 0.55)).toBeCloseTo(0.5875, 4);
  });

  it("encoge más cuanto menos se diferencian los ítems entre sí", () => {
    const parecidos = [
      { wr: 0.501, n: 10000 },
      { wr: 0.499, n: 10000 },
      { wr: 0.5, n: 10000 },
    ];
    const distintos = [
      { wr: 0.56, n: 10000 },
      { wr: 0.44, n: 10000 },
      { wr: 0.5, n: 10000 },
    ];
    expect(shrinkageToward(parecidos, 0.5)).toBeGreaterThan(shrinkageToward(distintos, 0.5));
  });
});

describe("el archivo de una banda", () => {
  const filas = [
    fila(1, 3200, 5000, 0.564),
    fila(2, 3200, 11000, 0.399),
    fila(3, 3200, 70000, 0.507),
    fila(4, 6400, 40000, 0.57),
    fila(5, 6400, 20000, 0.53),
    fila(6, 6400, 12000, 0.551),
  ];
  const file = itemsFileFrom(filas, banda, totales, parche, "2026-07-30T00:00:00Z");

  it("ordena por delta, que es el número que rankea", () => {
    const deltas = file.items.map((i) => i.delta);
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
  });

  /**
   * Un ítem de 3200 al 56,4% tiene que ganarle a uno de 6400 al 55,1%: el
   * primero está muy por encima de lo que rinde su precio y el segundo apenas
   * por debajo. Es el punto entero de la métrica y por eso tiene su propio test.
   */
  it("pone al de 3200 que sobresale por encima del de 6400 que no", () => {
    const puesto = (id: number) => file.items.findIndex((i) => i.itemId === id);
    expect(puesto(1)).toBeLessThan(puesto(6));
  });

  it("publica la base de cada precio, sin la cual el delta no se puede verificar", () => {
    expect(Object.keys(file.costBaselines).sort()).toEqual(["3200", "6400"]);
    expect(file.costBaselines["6400"]).toBeGreaterThan(file.costBaselines["3200"]);
  });

  it("marca la muestra fina en vez de esconderla", () => {
    const conFino = itemsFileFrom(
      [...filas, fila(7, 3200, MIN_BUYS - 1, 0.7)],
      banda, totales, parche, "2026-07-30T00:00:00Z"
    );
    expect(conFino.items.find((i) => i.itemId === 7)?.thinData).toBe(true);
    expect(conFino.items.find((i) => i.itemId === 1)?.thinData).toBeUndefined();
  });

  it("guarda el minuto de compra, que ubica al ítem en la partida", () => {
    expect(file.items[0].buyMinute).toBe(20);
  });

  it("normaliza el pickRate contra las filas jugador de la banda", () => {
    const item3 = file.items.find((i) => i.itemId === 3)!;
    expect(item3.pickRate).toBeCloseTo(70000 / totales.boards, 4);
  });
});
