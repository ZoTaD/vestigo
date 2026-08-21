import { describe, it, expect } from "vitest";
import {
  vectorsFor, balancear, desbalancear, damageOf, MIN_PREVALENCIA,
  type PlayerRow, type ItemMeta,
} from "../src/features";
import { elegirK, asignar } from "../src/archetypes";

const meta = new Map<number, ItemMeta>([
  [1, { cost: 800, slot: "weapon" }],
  [2, { cost: 3200, slot: "weapon" }],
  [3, { cost: 800, slot: "spirit" }],
  [4, { cost: 6400, slot: "spirit" }],
  [5, { cost: 1600, slot: "vitality" }],
]);

const jugador = (p: Partial<PlayerRow>): PlayerRow => ({
  heroId: 8, won: true, items: [1], abilities: [{ id: 100, levels: 4 }], imbued: 0, ...p,
});

describe("vectorsFor", () => {
  it("deja afuera los objetos que casi nadie lleva", () => {
    const jugadores = [
      ...Array.from({ length: 19 }, () => jugador({ items: [1, 2] })),
      jugador({ items: [1, 2, 3] }), // el 3 lo lleva 1 de 20 = 5%
      ...Array.from({ length: 80 }, () => jugador({ items: [1, 2] })),
    ];
    const { columns } = vectorsFor(jugadores, meta);
    const ids = columns.filter((c) => c.kind === "item").map((c) => (c as { id: number }).id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // 1 de 100 = 1%, debajo del 5%
    expect(MIN_PREVALENCIA).toBe(0.05);
  });

  it("las almas van como fracción de lo gastado, no en crudo", () => {
    const { columns, X } = vectorsFor([jugador({ items: [2, 4] })], meta, 0);
    const iArma = columns.findIndex((c) => c.kind === "souls" && c.slot === "weapon");
    const iEsp = columns.findIndex((c) => c.kind === "souls" && c.slot === "spirit");
    // 3200 de arma y 6400 de espíritu sobre 9600.
    expect(X[0][iArma]).toBeCloseTo(3200 / 9600, 6);
    expect(X[0][iEsp]).toBeCloseTo(6400 / 9600, 6);
  });

  it("las habilidades van como fracción de los niveles subidos", () => {
    const { columns, X } = vectorsFor(
      [jugador({ abilities: [{ id: 100, levels: 3 }, { id: 200, levels: 1 }] })],
      meta,
      0
    );
    const i100 = columns.findIndex((c) => c.kind === "ability" && c.id === 100);
    const i200 = columns.findIndex((c) => c.kind === "ability" && c.id === 200);
    expect(X[0][i100]).toBeCloseTo(0.75, 6);
    expect(X[0][i200]).toBeCloseTo(0.25, 6);
  });

  it("las columnas salen ordenadas por id y no por frecuencia", () => {
    // Si el orden dependiera de los datos, una partida de más podría permutar
    // coordenadas y mover los arquetipos sin que cambiara nada real.
    const jugadores = [
      ...Array.from({ length: 10 }, () => jugador({ items: [4, 2] })),
      ...Array.from({ length: 3 }, () => jugador({ items: [1] })),
    ];
    const ids = vectorsFor(jugadores, meta)
      .columns.filter((c) => c.kind === "item")
      .map((c) => (c as { id: number }).id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("no explota sin jugadores", () => {
    expect(vectorsFor([], meta)).toEqual({ columns: [], X: [] });
  });

  it("un jugador sin objetos conocidos no divide por cero", () => {
    const { X } = vectorsFor([jugador({ items: [999] })], meta, 0);
    for (const x of X[0]) expect(Number.isFinite(x)).toBe(true);
  });
});

describe("balancear", () => {
  it("hace que los tres bloques pesen lo mismo aunque haya 40 objetos y 3 almas", () => {
    const jugadores = Array.from({ length: 4 }, (_, i) =>
      jugador({ items: [1, 2, 3, 4, 5].slice(0, (i % 4) + 1) })
    );
    const v = vectorsFor(jugadores, meta, 0);
    const b = balancear(v);
    const suma = (kind: string, fila: number[]) =>
      fila.reduce((a, x, j) => a + (v.columns[j].kind === kind ? x * x : 0), 0);
    // Con todas las coordenadas al máximo, cada bloque aportaría 1/3.
    const unos = new Array(v.columns.length).fill(1);
    const escalado = balancear({ columns: v.columns, X: [unos] }).X[0];
    const w = suma("item", escalado);
    const s = suma("souls", escalado);
    const a = suma("ability", escalado);
    expect(w).toBeCloseTo(s, 10);
    expect(s).toBeCloseTo(a, 10);
    expect(b.X).toHaveLength(jugadores.length);
  });

  it("desbalancear devuelve la escala original", () => {
    const v = vectorsFor([jugador({ items: [1, 4] })], meta, 0);
    const vuelta = desbalancear(balancear(v).X, v);
    for (let j = 0; j < v.X[0].length; j++) expect(vuelta[0][j]).toBeCloseTo(v.X[0][j], 10);
  });
});

describe("damageOf", () => {
  it("decide por almas, no por cantidad de objetos", () => {
    // Cuatro objetos de arma baratos (800×2 + 3200 = 4800) contra uno de
    // espíritu caro (6400): gana espíritu. La firma vieja decía arma.
    expect(damageOf([1, 2, 4], meta)).toBe("spirit");
    expect(damageOf([1, 2], meta)).toBe("weapon");
    expect(damageOf([5], meta)).toBe("vitality");
  });

  it("ignora objetos que no están en el catálogo", () => {
    expect(damageOf([999, 4], meta)).toBe("spirit");
  });
});

describe("el vector separa formas de jugar de verdad", () => {
  it("parte a un héroe que maxea dos habilidades distintas con los mismos objetos", () => {
    // El caso McGinnis: MISMOS objetos, distinta habilidad maxeada. Si las
    // habilidades no entraran al vector —o si los objetos las ahogaran— esto
    // daría un solo arquetipo.
    const muro = Array.from({ length: 60 }, () =>
      jugador({ items: [1, 2, 5], abilities: [{ id: 100, levels: 4 }, { id: 200, levels: 1 }] })
    );
    const torreta = Array.from({ length: 60 }, () =>
      jugador({ items: [1, 2, 5], abilities: [{ id: 100, levels: 1 }, { id: 200, levels: 4 }] })
    );
    const crudo = vectorsFor([...muro, ...torreta], meta, 0);
    const v = balancear(crudo);
    // `unscale` es obligatorio con el vector balanceado: si no, la separación se
    // mide en unidades encogidas y nunca llega al corte.
    const { k, decomp } = elegirK(v.X, 3, { unscale: (Z) => desbalancear(Z, crudo) });
    expect(k).toBe(2);

    // Y cada jugador cae en el suyo.
    const asign = asignar(decomp.A);
    const grupoMuro = new Set(asign.slice(0, 60).map((a) => a.archetype));
    const grupoTorreta = new Set(asign.slice(60).map((a) => a.archetype));
    expect(grupoMuro.size).toBe(1);
    expect(grupoTorreta.size).toBe(1);
    expect([...grupoMuro][0]).not.toBe([...grupoTorreta][0]);
  });

  it("NO parte a un héroe que se juega de una sola forma", () => {
    // El caso Mo & Krill. Variación chica alrededor de una sola manera: un 10%
    // compra un objeto barato de más. AA lo detecta como extremo —porque lo es—
    // y es `MIN_CUOTA` quien decide que doce personas no son una build.
    const jugadores = Array.from({ length: 120 }, (_, i) =>
      jugador({
        items: i % 10 === 0 ? [1, 2, 5, 3] : [1, 2, 5],
        abilities: [{ id: 100, levels: 3 }, { id: 200, levels: 2 }],
      })
    );
    const crudo = vectorsFor(jugadores, meta, 0);
    const v = balancear(crudo);
    expect(elegirK(v.X, 3, { unscale: (Z) => desbalancear(Z, crudo) }).k).toBe(1);
  });

  it("y si esa minoría crece hasta ser media población, sí es una build", () => {
    // El mismo dato con 50/50 en vez de 90/10: ahora sí son dos formas.
    const jugadores = Array.from({ length: 120 }, (_, i) =>
      jugador({
        items: i % 2 === 0 ? [1, 2, 5, 3, 4] : [1, 2, 5],
        abilities: [{ id: 100, levels: 3 }, { id: 200, levels: 2 }],
      })
    );
    const crudo = vectorsFor(jugadores, meta, 0);
    const v = balancear(crudo);
    expect(elegirK(v.X, 3, { unscale: (Z) => desbalancear(Z, crudo) }).k).toBe(2);
  });
});
