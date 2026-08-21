import { describe, it, expect } from "vitest";
import {
  recommend, supportFor, soporteDe, MIN_GANANCIA, MIN_COMPRAS, MIN_SOPORTE,
  type BaseItem, type Candidate, type Soporte,
} from "../src/recommend";
import type { ItemMeta } from "../src/features";

const meta = new Map<number, ItemMeta>([
  [1, { cost: 800, slot: "weapon" }],
  [2, { cost: 800, slot: "weapon" }],
  [3, { cost: 3200, slot: "weapon" }],
  [4, { cost: 3200, slot: "spirit" }],
  [5, { cost: 800, slot: "spirit" }],
  [6, { cost: 6400, slot: "vitality" }],
  [7, { cost: 800, slot: "weapon" }],
  [8, { cost: 800, slot: "weapon" }],
  [9, { cost: 3200, slot: "weapon" }],
]);

const base = (items: BaseItem[]) => items;
const cand = (p: Partial<Candidate> & { itemId: number }): Candidate => ({
  edge: 2, buys: 500, ...p,
});
/** Soporte de sobra, para los tests que no están probando la evidencia. */
const libre: Soporte = () => 999;
/** Soporte fijo, para probar el corte. */
const fijo = (n: number): Soporte => () => n;

describe("recommend", () => {
  it("cambia el que menos aporta por uno mejor del mismo precio y estante", () => {
    const r = recommend(
      base([{ itemId: 1, edge: 0.1 }, { itemId: 3, edge: 2.0, carries: true }]),
      [cand({ itemId: 2, edge: 1.4 })],
      meta,
      libre
    );
    expect(r.swaps).toHaveLength(1);
    expect(r.swaps[0]).toMatchObject({ out: 1, in: 2 });
    expect(r.items).toEqual([2, 3]);
  });

  it("NO toca los objetos marcados como que cargan la build", () => {
    // El entrante mide muchísimo más, y aun así el protegido se queda.
    const r = recommend(
      base([{ itemId: 1, edge: 0.2, carries: true }]),
      [cand({ itemId: 2, edge: 9 })],
      meta,
      libre
    );
    expect(r.swaps).toEqual([]);
    expect(r.items).toEqual([1]);
  });

  it("no cambia por otro precio ni por otro estante", () => {
    const r = recommend(
      base([{ itemId: 1, edge: 0, carries: true }, { itemId: 7, edge: 0 }]),
      [
        cand({ itemId: 3, edge: 9 }), // mismo estante, otro precio
        cand({ itemId: 5, edge: 9 }), // mismo precio, otro estante
      ],
      meta,
      libre
    );
    expect(r.swaps).toEqual([]);
  });

  it("exige que la ganancia supere el ruido", () => {
    const r = recommend(
      base([{ itemId: 1, edge: 1.0, carries: true }, { itemId: 7, edge: 1.0 }]),
      [cand({ itemId: 2, edge: 1.0 + MIN_GANANCIA - 0.01 })],
      meta,
      libre
    );
    expect(r.swaps).toEqual([]);
    expect(MIN_GANANCIA).toBe(0.5);
  });

  it("exige compras que respalden el aporte del entrante", () => {
    const r = recommend(
      base([{ itemId: 1, edge: 0, carries: true }, { itemId: 7, edge: 0 }]),
      [cand({ itemId: 2, edge: 5, buys: MIN_COMPRAS - 1 })],
      meta,
      libre
    );
    expect(r.swaps).toEqual([]);
  });

  it("exige que la combinación EXISTA en partidas reales", () => {
    // Es la garantía de que no armamos doce objetos que nadie juntó.
    const bueno = base([{ itemId: 1, edge: 0, carries: true }, { itemId: 7, edge: 0 }]);
    expect(recommend(bueno, [cand({ itemId: 2, edge: 5 })], meta, fijo(MIN_SOPORTE - 1)).swaps)
      .toEqual([]);
    expect(recommend(bueno, [cand({ itemId: 2, edge: 5 })], meta, fijo(MIN_SOPORTE)).swaps)
      .toHaveLength(1);
  });

  it("ataca primero al que menos aporta", () => {
    const r = recommend(
      base([
        { itemId: 1, edge: 0.1 },
        { itemId: 7, edge: 1.2 },
        { itemId: 3, edge: 3, carries: true },
      ]),
      [cand({ itemId: 2, edge: 2.0 })],
      meta,
      libre
    );
    // Sólo entra uno, y tiene que reemplazar al de 0,1 y no al de 1,2.
    expect(r.swaps).toHaveLength(1);
    expect(r.swaps[0].out).toBe(1);
  });

  it("no propone nada cuando la build más jugada ya es lo mejor", () => {
    // Este resultado TIENE que ser posible, o el algoritmo inventa mejoras
    // para justificarse.
    const r = recommend(
      base([{ itemId: 1, edge: 4 }, { itemId: 3, edge: 5 }]),
      [cand({ itemId: 2, edge: 1 })],
      meta,
      libre
    );
    expect(r.swaps).toEqual([]);
    expect(r.items).toEqual([1, 3]);
  });

  it("un objeto que salió no vuelve a entrar, y nunca hay repetidos", () => {
    // Sin esto, dos cambios que se gustan mutuamente se intercambian para siempre.
    const r = recommend(
      base([
        { itemId: 1, edge: 0.1 },
        { itemId: 7, edge: 0.1 },
        { itemId: 3, edge: 5, carries: true },
      ]),
      [cand({ itemId: 2, edge: 3 })],
      meta,
      libre
    );
    expect(r.swaps).toHaveLength(1);
    expect(new Set(r.items).size).toBe(r.items.length);
  });

  it("es determinista, y ante empate manda el id más chico", () => {
    const correr = () =>
      recommend(
        base([{ itemId: 1, edge: 0 }, { itemId: 3, edge: 5, carries: true }]),
        [cand({ itemId: 2, edge: 3 }), cand({ itemId: 7, edge: 3 })],
        meta,
        libre
      );
    expect(correr()).toEqual(correr());
    expect(correr().swaps[0].in).toBe(2);
  });

  it("no explota con la build vacía ni sin candidatos", () => {
    expect(recommend([], [cand({ itemId: 1 })], meta, libre)).toEqual({ items: [], swaps: [] });
    expect(recommend(base([{ itemId: 1, edge: 0 }]), [], meta, libre)).toEqual({
      items: [1], swaps: [],
    });
  });

  /**
   * El defecto que apareció con datos reales: un héroe llegó a NUEVE cambios,
   * o sea nueve de doce objetos distintos. Cada uno estaba respaldado contra el
   * núcleo original, pero la combinación acumulada no la respaldaba nadie.
   */
  it("le pide evidencia al conjunto que se va armando, no al núcleo de partida", () => {
    const vistos: number[][] = [];
    const espia: Soporte = (_id, conjunto) => {
      vistos.push([...conjunto]);
      return 999;
    };
    recommend(
      base([
        { itemId: 9, edge: 5, carries: true },
        { itemId: 1, edge: 0 },
        { itemId: 7, edge: 0.1 },
      ]),
      [cand({ itemId: 2, edge: 3 }), cand({ itemId: 8, edge: 3 })],
      meta,
      espia
    );
    // La primera consulta pregunta sólo por el protegido...
    expect(vistos[0]).toEqual([9]);
    // ...y después del primer cambio, el entrante ya forma parte de lo que hay
    // que respaldar.
    const despues = vistos.find((c) => c.length > 1);
    expect(despues).toBeDefined();
    expect(despues).toContain(9);
    expect(despues).toContain(2);
  });

  it("un conjunto sin respaldo frena la cadena de cambios", () => {
    // Soporte suficiente sólo mientras el conjunto sea chico.
    const soporte: Soporte = (_id, conjunto) => (conjunto.length <= 1 ? 999 : 0);
    const r = recommend(
      base([
        { itemId: 9, edge: 5, carries: true },
        { itemId: 1, edge: 0 },
        { itemId: 7, edge: 0.1 },
      ]),
      [cand({ itemId: 2, edge: 3 }), cand({ itemId: 8, edge: 3 })],
      meta,
      soporte
    );
    expect(r.swaps).toHaveLength(1);
  });
});

describe("supportFor y soporteDe", () => {
  const builds = [
    [1, 3, 5],
    [1, 3, 5],
    [1, 3, 9],
    [1, 5],
    [3, 5],
  ];

  it("cuenta sólo las partidas donde el objeto convive con TODO el conjunto", () => {
    // El conjunto es [1,3]: las dos primeras cuentan para el 5, la cuarta no
    // porque le falta el 3, y la quinta tampoco porque le falta el 1.
    expect(supportFor(builds, [1, 3], 5)).toBe(2);
    expect(supportFor(builds, [1, 3], 9)).toBe(1);
  });

  it("da cero si el objeto no aparece", () => {
    expect(supportFor(builds, [1, 3], 42)).toBe(0);
  });

  it("da cero sin conjunto, en vez de contar todo", () => {
    // Sin nada que respaldar, devolver el total dejaría pasar cualquier objeto.
    expect(supportFor(builds, [], 5)).toBe(0);
  });

  it("la versión indexada da exactamente lo mismo que la directa", () => {
    const s = soporteDe(builds);
    for (const conjunto of [[1, 3], [1], [3, 5], [], [42]]) {
      for (const id of [1, 3, 5, 9, 42]) {
        expect(s(id, conjunto)).toBe(supportFor(builds, conjunto, id));
      }
    }
  });
});
