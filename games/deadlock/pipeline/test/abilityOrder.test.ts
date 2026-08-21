import { describe, it, expect } from "vitest";
import { unlockOrderFromSequences, MAX_NIVELES } from "../src/abilities";

/** n copias de la misma secuencia. */
const rep = (n: number, seq: number[]) => Array.from({ length: n }, () => [...seq]);

describe("unlockOrderFromSequences", () => {
  it("saca el orden de la primera aparición de cada habilidad", () => {
    const { order } = unlockOrderFromSequences(rep(50, [10, 10, 20, 30, 20, 40, 30, 10]));
    expect(order).toEqual([10, 20, 30, 40]);
  });

  it("devuelve el paso a paso completo, con repeticiones", () => {
    const { path } = unlockOrderFromSequences(rep(50, [10, 10, 20, 30]));
    expect(path).toEqual([10, 10, 20, 30]);
  });

  it("decide cada paso por MAYORÍA, no copiando la secuencia más jugada", () => {
    // 60 suben 20 en el segundo paso y 40 suben 30: el paso 2 es 20, aunque
    // ninguna secuencia entera sea mayoría absoluta.
    const seqs = [...rep(60, [10, 20, 30, 40]), ...rep(40, [10, 30, 20, 40])];
    expect(unlockOrderFromSequences(seqs).path).toEqual([10, 20, 30, 40]);
  });

  it("separa dos poblaciones que maxean distinto — el caso McGinnis", () => {
    const muro = rep(300, [10, 10, 10, 10, 20, 30, 40]);
    const torreta = rep(300, [20, 20, 20, 20, 10, 30, 40]);
    expect(unlockOrderFromSequences(muro).order[0]).toBe(10);
    expect(unlockOrderFromSequences(torreta).order[0]).toBe(20);
    // Y el paso a paso también las distingue, no sólo la primera.
    expect(unlockOrderFromSequences(muro).path.slice(0, 4)).toEqual([10, 10, 10, 10]);
    expect(unlockOrderFromSequences(torreta).path.slice(0, 4)).toEqual([20, 20, 20, 20]);
  });

  it("el largo es la mediana: no inventa pasos que la mitad no alcanza", () => {
    const seqs = [...rep(50, [10, 20]), ...rep(50, [10, 20, 30, 40, 10, 20])];
    expect(unlockOrderFromSequences(seqs).path.length).toBeLessThanOrEqual(6);
    expect(unlockOrderFromSequences(seqs).path[0]).toBe(10);
  });

  it("deja afuera del orden una subida rarísima", () => {
    // 99 jugadores normales y 1 que arranca con una habilidad que nadie sube.
    const seqs = [...rep(99, [10, 20, 30, 40]), [99, 10, 20, 30, 40]];
    expect(unlockOrderFromSequences(seqs).order).not.toContain(99);
  });

  it("nunca devuelve más de cuatro", () => {
    const seqs = rep(40, [10, 20, 30, 40, 50, 60]);
    expect(unlockOrderFromSequences(seqs).order).toHaveLength(4);
  });

  it("es determinista ante empates", () => {
    const seqs = [...rep(50, [10, 20]), ...rep(50, [20, 10])];
    const a = unlockOrderFromSequences(seqs);
    const b = unlockOrderFromSequences(seqs);
    expect(a).toEqual(b);
  });

  it("no explota sin secuencias", () => {
    expect(unlockOrderFromSequences([])).toEqual({ order: [], path: [] });
    expect(unlockOrderFromSequences([[]])).toEqual({ order: [], path: [] });
  });

  /**
   * El bug que encontró contrastar contra las guías: McGinnis publicaba Mini
   * Turret **seis veces** en quince pasos. Una habilidad se desbloquea una vez y
   * se mejora tres, así que cuatro es el tope del juego — la secuencia publicada
   * era una que ningún jugador pudo jugar.
   */
  it("nunca sube una habilidad más veces de las que el juego permite", () => {
    // La mayoría pone cinco puntos seguidos en la misma: el modo por posición,
    // resuelto independiente en cada paso, la repetiría las cinco veces.
    const seqs = [
      ...rep(70, [10, 20, 20, 20, 20, 20, 30, 10, 10, 40]),
      ...rep(30, [10, 20, 30, 40, 20, 30, 10, 20, 30, 40]),
    ];
    const { path } = unlockOrderFromSequences(seqs);
    const cuenta = new Map<number, number>();
    for (const id of path) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    for (const [, n] of cuenta) expect(n).toBeLessThanOrEqual(MAX_NIVELES);
    expect(MAX_NIVELES).toBe(4);
  });

  it("el orden y el paso a paso NO se contradicen", () => {
    // Se calculaban por separado —el path por moda, el orden por mediana de la
    // primera aparición— y McGinnis publicaba "Muro → Specter → Torreta"
    // mientras su grilla mostraba la torreta segunda.
    const seqs = [
      ...rep(60, [10, 20, 20, 20, 30, 40]),
      ...rep(40, [10, 30, 20, 40, 20, 30]),
    ];
    const { order, path } = unlockOrderFromSequences(seqs);
    const primeras: number[] = [];
    for (const id of path) if (!primeras.includes(id)) primeras.push(id);
    expect(order.slice(0, primeras.length)).toEqual(primeras);
  });
});
