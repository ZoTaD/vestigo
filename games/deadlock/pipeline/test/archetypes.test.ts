import { describe, it, expect } from "vitest";
import {
  projectSimplex, furthestSum, archetypes, elegirK, asignar, varianzaTotal,
  separacion, MEJORA_MINIMA, MIN_SEPARACION,
} from "../src/archetypes";

/** Una malla determinista de combinaciones convexas de `esquinas`. */
function nube(esquinas: number[][], paso = 5): number[][] {
  const out: number[][] = [];
  const d = esquinas[0].length;
  const k = esquinas.length;
  const rec = (idx: number, resto: number, pesos: number[]) => {
    if (idx === k - 1) {
      const w = [...pesos, resto / paso];
      const punto = new Array(d).fill(0);
      for (let j = 0; j < k; j++) for (let c = 0; c < d; c++) punto[c] += w[j] * esquinas[j][c];
      out.push(punto);
      return;
    }
    for (let i = 0; i <= resto; i++) rec(idx + 1, resto - i, [...pesos, i / paso]);
  };
  rec(0, paso, []);
  return out;
}

describe("projectSimplex", () => {
  it("devuelve algo que suma 1 y no tiene negativos", () => {
    for (const v of [[3, -1, 0.5], [0, 0, 0], [-5, -5, -5], [10, 0, 0]]) {
      const p = projectSimplex(v);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      for (const x of p) expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("no toca lo que ya está en el símplex", () => {
    const v = [0.2, 0.3, 0.5];
    expect(projectSimplex(v)).toEqual(v.map((x) => expect.closeTo(x, 10)));
  });

  it("manda al vértice más cercano cuando un componente domina", () => {
    const p = projectSimplex([9, 0, 0]);
    expect(p[0]).toBeCloseTo(1, 10);
    expect(p[1]).toBeCloseTo(0, 10);
  });
});

describe("furthestSum", () => {
  it("elige las esquinas de un triángulo y no su interior", () => {
    const esquinas = [[0, 0], [1, 0], [0, 1]];
    const X = nube(esquinas, 6);
    const idx = furthestSum(X, 3);
    expect(idx).toHaveLength(3);
    // Cada esquina tiene que estar entre las elegidas.
    for (const e of esquinas) {
      const alguna = idx.some((i) => Math.hypot(X[i][0] - e[0], X[i][1] - e[1]) < 1e-9);
      expect(alguna).toBe(true);
    }
  });

  it("no se rompe con menos filas que arquetipos pedidos", () => {
    expect(furthestSum([[1, 1]], 3)).toHaveLength(1);
    expect(furthestSum([], 3)).toEqual([]);
  });
});

describe("archetypes", () => {
  /** Cuánto se aleja el arquetipo estimado de la esquina verdadera más cercana. */
  const errorEsquinas = (Z: number[][], esquinas: number[][]): number =>
    Math.max(
      ...esquinas.map((e) => Math.min(...Z.map((z) => Math.hypot(...z.map((v, j) => v - e[j])))))
    );

  it("recupera las tres esquinas que generaron la nube", () => {
    const esquinas = [[0, 0], [1, 0], [0, 1]];
    const { Z, rss } = archetypes(nube(esquinas, 8), 3);
    expect(Z).toHaveLength(3);
    // Los datos SON combinaciones convexas exactas, así que el ajuste es casi
    // perfecto y las esquinas se recuperan.
    expect(errorEsquinas(Z, esquinas)).toBeLessThan(0.05);
    expect(rss).toBeLessThan(0.05);
  });

  it("funciona en más dimensiones que dos", () => {
    const esquinas = [
      [1, 0, 0, 0.2], [0, 1, 0, 0.8], [0, 0, 1, 0.5],
    ];
    const { Z } = archetypes(nube(esquinas, 6), 3);
    expect(errorEsquinas(Z, esquinas)).toBeLessThan(0.12);
  });

  it("cada arquetipo es una combinación convexa de jugadores reales", () => {
    // Es la propiedad que lo separa de k-means: las filas de B viven en el
    // símplex, así que ningún arquetipo puede caer fuera del casco convexo.
    const { B } = archetypes(nube([[0, 0], [1, 0], [0, 1]], 6), 3);
    for (const fila of B) {
      expect(fila.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      for (const w of fila) expect(w).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("cada jugador queda como una mezcla que suma 1", () => {
    const { A } = archetypes(nube([[0, 0], [1, 0], [0, 1]], 5), 3);
    for (const fila of A) expect(fila.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("es determinista: dos corridas dan lo mismo", () => {
    const X = nube([[0, 0], [1, 0], [0, 1]], 5);
    const a = archetypes(X, 3);
    const b = archetypes(X, 3);
    expect(a.Z).toEqual(b.Z);
    expect(a.rss).toBe(b.rss);
  });

  it("no explota con una sola fila ni con la matriz vacía", () => {
    expect(archetypes([], 3).Z).toEqual([]);
    const uno = archetypes([[1, 2]], 3);
    expect(uno.Z).toHaveLength(1);
    expect(uno.rss).toBeCloseTo(0, 10);
  });
});

describe("elegirK", () => {
  it("le da dos arquetipos a un héroe que se juega de dos formas", () => {
    // Dos cúmulos apretados y lejanos: un solo arquetipo no puede describirlos.
    const X = [
      ...Array.from({ length: 20 }, (_, i) => [0 + i * 0.001, 0 + i * 0.001]),
      ...Array.from({ length: 20 }, (_, i) => [5 + i * 0.001, 5 + i * 0.001]),
    ];
    expect(elegirK(X, 3).k).toBe(2);
  });

  it("le da uno solo al que se juega de una forma", () => {
    // El caso Mo & Krill: todo el mundo hace casi lo mismo. La varianza
    // explicada SOLA no lo detecta —partir una nube apretada igual mejora el
    // error en proporción— y por eso existe `MIN_SEPARACION`.
    const X = Array.from({ length: 40 }, (_, i) => [1 + (i % 5) * 0.002, 2 + (i % 3) * 0.002]);
    expect(elegirK(X, 3).k).toBe(1);
  });

  it("no parte un héroe cuyas dos formas difieren menos que el corte", () => {
    // Dos cúmulos separados, pero por 0,05: existen, y no son dos builds.
    const X = [
      ...Array.from({ length: 20 }, () => [0, 0]),
      ...Array.from({ length: 20 }, () => [0.05, 0]),
    ];
    expect(elegirK(X, 3).k).toBe(1);
    expect(MIN_SEPARACION).toBe(0.15);
  });

  it("nunca devuelve más que el máximo pedido", () => {
    const X = nube([[0, 0], [1, 0], [0, 1], [1, 1]], 4);
    expect(elegirK(X, 3).k).toBeLessThanOrEqual(3);
    expect(MEJORA_MINIMA).toBe(0.05);
  });
});

describe("separacion", () => {
  it("es infinita con un solo arquetipo, porque no hay con qué confundirlo", () => {
    expect(separacion([[1, 2, 3]])).toBe(Infinity);
  });

  it("la manda el par MÁS PARECIDO, no el más distinto", () => {
    const Z = [[0, 0], [1, 0], [0.02, 0]];
    expect(separacion(Z)).toBeCloseTo(0.02, 10);
  });

  it("mira la coordenada de mayor diferencia, no el promedio", () => {
    // Dos builds iguales salvo un objeto que una lleva y la otra no: son dos.
    expect(separacion([[0.5, 0.5, 0.0], [0.5, 0.5, 0.9]])).toBeCloseTo(0.9, 10);
  });
});

describe("asignar", () => {
  it("devuelve el arquetipo de mayor peso y ese peso como convicción", () => {
    const r = asignar([[0.9, 0.05, 0.05], [0.3, 0.4, 0.3]]);
    expect(r[0]).toEqual({ archetype: 0, commitment: 0.9 });
    expect(r[1]).toEqual({ archetype: 1, commitment: 0.4 });
  });
});

describe("varianzaTotal", () => {
  it("es cero cuando todas las filas son iguales", () => {
    expect(varianzaTotal([[1, 2], [1, 2], [1, 2]])).toBeCloseTo(0, 12);
  });

  it("crece con la dispersión", () => {
    const poca = varianzaTotal([[0, 0], [1, 0]]);
    const mucha = varianzaTotal([[0, 0], [10, 0]]);
    expect(mucha).toBeGreaterThan(poca);
  });
});
