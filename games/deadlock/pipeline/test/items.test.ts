import { describe, it, expect } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  baselinesFrom,
  shrinkageToward,
  shrinkTo,
  itemsFileFrom,
  itemStatsSql,
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

/**
 * Un objeto que sólo compra un héroe fuerte gana porque gana el héroe. Medido
 * en Fantasma+ (auditoría del 2026-09-29, §3): descontar el héroe mueve 0,4-1,0
 * puntos de media y cambia de tercio a 43 de 156 objetos.
 */
describe("el héroe que lo compra", () => {
  /**
   * Dos héroes de 1.000 partidas en la misma banda: el 1 gana el 70% y el 2 el
   * 30%. El objeto 10 lo compra sólo el 1, en todas. El 20 lo compra la mitad
   * de cada uno, y en ésas los dos ganan 10 puntos más que su héroe (80% y 40%).
   */
  const leer = async (): Promise<RawItemRow[]> => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as
      select *, list_transform(item_ids, x -> 600) as item_times from (
        select n as match_id, TIMESTAMP '2026-09-30 00:00:00' as start_time, 10 as tier, hero_id,
               case when hero_id = 1 then n % 10 < 7 else n % 10 < 3 end as won,
               list_filter([10, 20]::UBIGINT[], x -> (x = 10 and hero_id = 1)
                 or (x = 20 and ((hero_id = 1 and n % 10 in (0, 1, 2, 3, 7))
                              or (hero_id = 2 and n % 10 in (0, 1, 5, 6, 7))))) as item_ids
        from (select n, case when n < 1000 then 1 else 2 end as hero_id from range(2000) r(n))
      )`);
    const crudas = (await con.runAndReadAll(itemStatsSql("select * from t", "10", "10, 20"))).getRowObjects();
    return crudas.map((x) => ({
      item_id: Number(x.item_id),
      cost: 3200,
      buys: x.buys as bigint,
      wins: x.wins as bigint,
      hero_wins: Number(x.hero_wins),
      buy_seconds: Number(x.buy_seconds),
    }));
  };

  it("la consulta suma, compra por compra, el winrate del héroe en la banda", async () => {
    const filas = await leer();
    const de = (id: number) => filas.find((f) => f.item_id === id)!;
    expect(Number(de(10).buys)).toBe(1000);
    expect(Number(de(10).wins)).toBe(700);
    expect(de(10).hero_wins).toBeCloseTo(700, 6);
    expect(Number(de(20).wins)).toBe(600);
    expect(de(20).hero_wins).toBeCloseTo(500, 6);
  });

  it("el objeto del héroe fuerte deja de verse bueno, y el que rinde más que su héroe sube", async () => {
    const filas = await leer();
    const file = itemsFileFrom(filas, banda, totales, parche, "2026-09-30T00:00:00Z");
    const de = (id: number) => file.items.find((i) => i.itemId === id)!;
    expect(de(10).delta).toBeLessThan(0);
    expect(de(20).delta).toBeGreaterThan(0);
    // Lo crudo sigue siendo lo que midió: el 70% del héroe fuerte.
    expect(de(10).winRateRaw).toBeCloseTo(0.7, 6);

    // Sin descontar el héroe, que es lo que se publicaba, el orden era el contrario.
    const sinHeroe = itemsFileFrom(
      filas.map(({ hero_wins: _, ...f }) => f),
      banda, totales, parche, "2026-09-30T00:00:00Z"
    );
    expect(sinHeroe.items.find((i) => i.itemId === 10)!.delta).toBeGreaterThan(0);
  });

  it("la base del precio sale de las mismas compras ajustadas: el objeto promedio sigue en 0", async () => {
    const file = itemsFileFrom(await leer(), banda, totales, parche, "2026-09-30T00:00:00Z");
    // (700 − 700 + 500) + (600 − 500 + 500) sobre 2.000 compras.
    expect(file.costBaselines["3200"]).toBeCloseTo(0.55, 4);
  });
});
