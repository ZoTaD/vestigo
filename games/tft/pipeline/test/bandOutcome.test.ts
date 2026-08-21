import { describe, it, expect } from "vitest";
import { bandOutcome, provisionalAllowed } from "../src/build";
import { EXCLUSIVE } from "../src/bands";

describe("bandOutcome", () => {
  it("publica normal con muestra suficiente", () => {
    expect(bandOutcome(2000, true)).toBe("full");
    expect(bandOutcome(54496, false)).toBe("full");
  });

  // El caso que existe para esto: el permiso está concedido y la banda tiene poco.
  it("publica provisional con el permiso concedido", () => {
    expect(bandOutcome(500, true)).toBe("provisional");
    expect(bandOutcome(1999, true)).toBe("provisional");
  });

  it("no publica provisional sin el permiso", () => {
    expect(bandOutcome(1500, false)).toBe("empty");
  });

  // silver-below vive acá: fina siempre, no por transición.
  it("publica vacío por debajo del piso, aun con el permiso concedido", () => {
    expect(bandOutcome(499, true)).toBe("empty");
  });

  // silver-below tiene hoy 1.576 tableros del parche vigente — por encima del
  // piso provisional (500) pero por debajo de MIN_BAND_BOARDS (2.000). Esto NO
  // es el caso que destapó el bug histórico del portón (`isNewestPatch` en vez
  // del permiso ya resuelto): bandOutcome recibe el permiso como segundo
  // argumento, ya resuelto, así que pasarle `false` a mano da "empty" pase lo
  // que pase con la banda — este test ya pasaba con el código de antes del
  // arreglo. La cobertura real de esa regresión está en los tests de
  // provisionalAllowed de más abajo, que sí ejercitan cómo se resuelve el permiso.
  it("banda con 1.576 tableros y el permiso en false publica vacío", () => {
    expect(bandOutcome(1576, false)).toBe("empty");
  });
});

describe("provisionalAllowed", () => {
  // provisionalAllowed en sí no sabe de bandas: solo mira si CADA número de la
  // lista está por debajo del piso. La lista que build.ts le pasa tiene que
  // ser la de las cuatro bandas EXCLUSIVE (apex, diamond-emerald,
  // platinum-gold, silver-below) y nunca BANDS, que además trae "global" — la
  // banda agregada, que se solapa con las demás a propósito y es, por eso
  // mismo, la más grande. Mirarla la haría cruzar el piso antes que ninguna
  // banda real y revocaría el permiso para todas antes de tiempo. Este array
  // fija esa forma: un número por banda exclusiva, en ese mismo orden.
  it("EXCLUSIVE tiene las cuatro bandas que reciben conteo", () => {
    expect(EXCLUSIVE.map((b) => b.id)).toEqual([
      "apex",
      "diamond-emerald",
      "platinum-gold",
      "silver-below",
    ]);
  });

  // La transición: el parche recién salió y todavía ninguna de las cuatro
  // bandas exclusivas tiene 2.000.
  it("permite provisional cuando ninguna de las cuatro bandas exclusivas llegó al piso", () => {
    expect(provisionalAllowed(true, [1576, 1200, 900, 700])).toBe(true);
  });

  // Apenas una banda exclusiva cruza el piso, la transición terminó para todas.
  it("no permite provisional en cuanto una banda exclusiva cruza el piso", () => {
    expect(provisionalAllowed(true, [25072, 1576, 900, 700])).toBe(false);
  });

  // Un parche archivado nunca es provisional, sin importar cuán finas sean sus bandas.
  it("no permite provisional en un parche archivado", () => {
    expect(provisionalAllowed(false, [900, 700, 500, 300])).toBe(false);
  });
});
