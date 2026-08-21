import { describe, it, expect } from "vitest";
import { sortPatches, patchWindows } from "../src/patches";
import { shrinkageFrom, shrink } from "../src/build";

describe("sortPatches", () => {
  /**
   * El caso que obliga a mirar `pub_date` y no el título: el parche del
   * 2026-07-28 se llama "06-30-2026 Update". El título es la fecha de la build y
   * lo que importa es cuándo llegó a los jugadores.
   */
  it("ordena por fecha de publicación y no por el título", () => {
    const p = sortPatches([
      { title: "06-30-2026 Update", pub_date: "2026-07-28T20:28:07Z", link: "a" },
      { title: "05-22-2026 Update", pub_date: "2026-06-12T10:00:00Z", link: "b" },
    ]);
    expect(p[0].date).toBe("2026-07-28T20:28:07Z");
    expect(p[0].title).toBe("06-30-2026 Update");
  });

  it("descarta las entradas sin fecha usable en vez de ordenarlas mal", () => {
    const p = sortPatches([
      { title: "sin fecha" },
      { title: "vacía", pub_date: "" },
      { title: "buena", pub_date: "2026-07-28T20:28:07Z" },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0].title).toBe("buena");
  });
});

describe("patchWindows", () => {
  const patch = "2026-07-28T00:00:00Z";

  it("mide desde el parche hacia adelante", () => {
    const w = patchWindows(patch, new Date("2026-07-29T00:00:00Z"), 15);
    expect(w.after.from).toBe("2026-07-28T00:00:00.000Z");
    expect(w.after.to).toBe("2026-07-29T00:00:00.000Z");
  });

  /**
   * `before` dura lo mismo que `after`, y eso es el punto: comparar un parche
   * anterior de 46 días contra uno de un día enfrentaría un promedio asentado
   * contra un estreno, y además obligaría a leer el doble de particiones.
   */
  it("el tramo de antes dura lo mismo que el de después", () => {
    const w = patchWindows(patch, new Date("2026-07-29T00:00:00Z"), 15);
    expect(w.before.from).toBe("2026-07-27T00:00:00.000Z");
    expect(w.before.to).toBe("2026-07-28T00:00:00.000Z");
  });

  /**
   * **El tope es del LARGO, no del final — y estuvo al revés.** Hasta el
   * 2026-08-16 esto esperaba `after.to === "2026-08-12"`: en octubre, la tier
   * list medía hasta agosto. El test codificaba el bug con el nombre correcto.
   *
   * Con el parche del 28/7 eso dejó la lista congelada el 12/8, sumando un día
   * de atraso por día, con las partidas disponibles y tiradas.
   */
  it("se topea por el arranque, para que un parche viejo no arrastre meses", () => {
    const w = patchWindows(patch, new Date("2026-10-01T00:00:00Z"), 15);
    expect(w.after.to).toBe("2026-10-01T00:00:00.000Z");
    expect(w.after.from).toBe("2026-09-16T00:00:00.000Z");
    expect(w.before.from).toBe("2026-07-13T00:00:00.000Z");
  });

  /** Recién salido el parche, la ventana arranca AHÍ y no quince días antes. */
  it("no cruza el parche cuando es reciente", () => {
    const w = patchWindows(patch, new Date("2026-08-02T00:00:00Z"), 15);
    expect(w.after.from).toBe("2026-07-28T00:00:00.000Z");
    expect(w.after.to).toBe("2026-08-02T00:00:00.000Z");
  });

  /** Y nunca se queda quieta: el final sigue a `now` pase el tiempo que pase. */
  it("el final siempre es ahora", () => {
    for (const dia of ["2026-07-29", "2026-08-16", "2026-12-01"]) {
      const w = patchWindows(patch, new Date(`${dia}T00:00:00Z`), 15);
      expect(w.after.to).toBe(`${dia}T00:00:00.000Z`);
    }
  });

  // Un parche de hace minutos no puede dar una ventana de cero.
  it("nunca da una ventana vacía", () => {
    const w = patchWindows(patch, new Date("2026-07-28T00:10:00Z"), 15);
    expect(new Date(w.after.to).getTime()).toBeGreaterThan(new Date(w.after.from).getTime());
  });
});

/**
 * El encogimiento existe porque la ventana arranca en el parche: el día que sale
 * uno hay horas de partidas, y ahí el orden crudo es ruido (medido: ±3,5 puntos
 * al 95%, con el top 8 entero cabiendo en 3,8).
 */
describe("shrinkageFrom / shrink", () => {
  const rate = (wr: number, n: number) => ({ wr, n });

  it("no encoge cuando hay muestra de sobra", () => {
    // Héroes bien separados y con muchas partidas: la diferencia es real.
    const k = shrinkageFrom([rate(0.56, 50_000), rate(0.5, 50_000), rate(0.44, 50_000)]);
    expect(shrink(0.56, 50_000, k)).toBeCloseTo(0.56, 2);
  });

  it("encoge fuerte cuando la muestra es fina", () => {
    const k = shrinkageFrom([rate(0.56, 50_000), rate(0.5, 50_000), rate(0.44, 50_000)]);
    const flaco = shrink(0.7, 30, k);
    expect(flaco).toBeLessThan(0.7);
    expect(flaco).toBeGreaterThan(0.5);
  });

  // El centro se SABE: en un juego de dos equipos el winrate medio es 50% por
  // construcción, así que no hay que estimarlo como en TFT.
  it("encoge hacia el 50% y no hacia el promedio observado", () => {
    const k = shrinkageFrom([rate(0.6, 10_000), rate(0.62, 10_000), rate(0.61, 10_000)]);
    expect(shrink(0.61, 5, k)).toBeLessThan(0.61);
  });

  it("si el azar explica toda la diferencia, no queda señal que preservar", () => {
    // Tres héroes idénticos: lo que varían es puro muestreo.
    const k = shrinkageFrom([rate(0.5, 100), rate(0.5, 100), rate(0.5, 100)]);
    expect(k).toBe(Number.POSITIVE_INFINITY);
    expect(shrink(0.9, 10, k)).toBe(0.5);
  });

  it("sin héroes suficientes no inventa un encogimiento", () => {
    expect(shrinkageFrom([])).toBe(0);
    expect(shrinkageFrom([rate(0.55, 100)])).toBe(0);
    expect(shrink(0.55, 100, 0)).toBe(0.55);
  });

  // El que tiene menos partidas tiene que moverse más. Es toda la idea.
  it("mueve más al que menos evidencia tiene", () => {
    const k = shrinkageFrom([rate(0.56, 20_000), rate(0.5, 20_000), rate(0.44, 20_000)]);
    const mueve = (n: number) => Math.abs(0.58 - shrink(0.58, n, k));
    expect(mueve(300)).toBeGreaterThan(mueve(1500));
    expect(mueve(1500)).toBeGreaterThan(mueve(20_000));
  });
});
