import { describe, expect, it } from "vitest";
import { binsFrom, coverageOf, daysFrom, seOf, sidesFrom, tierOfBadgeSql } from "../src/ranks";

describe("binsFrom", () => {
  it("parte el badge en rango y subnivel", () => {
    const [b] = binsFrom([{ badge: 86, matches: 3, players: 2 }]);
    expect(b).toMatchObject({ badge: 86, tier: 8, sub: 6, matches: 3, players: 2 });
  });

  it("rellena los huecos interiores, porque un escalón vacío es información", () => {
    const out = binsFrom([
      { badge: 81, matches: 5, players: 5 },
      { badge: 84, matches: 7, players: 7 },
    ]);
    expect(out.map((b) => b.badge)).toEqual([81, 82, 83, 84]);
    expect(out[1].players).toBe(0);
  });

  it("no dibuja los escalones vacíos de los extremos", () => {
    // Hoy la escalera topea en Oráculo: veinte escalones en cero de Ascendente y
    // Eternus serían media pantalla en blanco que no dice nada.
    const out = binsFrom([{ badge: 41, matches: 1, players: 1 }]);
    expect(out).toHaveLength(1);
  });

  it("saltea el subnivel 0, que no existe en el juego", () => {
    // El badge vale rango*10 + subnivel con el subnivel arrancando en 1, así que
    // `x0` es un hueco de la numeración y no un escalón al que se pueda llegar.
    const out = binsFrom([
      { badge: 16, matches: 1, players: 1 },
      { badge: 21, matches: 1, players: 1 },
    ]);
    expect(out.map((b) => b.badge)).toEqual([16, 21]);
  });

  it("suma cuando el mismo badge llega repetido", () => {
    const [b] = binsFrom([
      { badge: 55, matches: 2, players: 1 },
      { badge: 55, matches: 3, players: 4 },
    ]);
    expect(b).toMatchObject({ matches: 5, players: 5 });
  });

  it("devuelve vacío si no hay ni un badge", () => {
    expect(binsFrom([])).toEqual([]);
  });
});

describe("el rango sale con floor y no con redondeo", () => {
  it("usa floor en el SQL", () => {
    // El bug ya se cometió una vez midiendo para el diseño: en DuckDB `86 / 10`
    // es 8.6 y `(8.6)::INT` **redondea a 9**, así que un Oráculo 6 aparecía como
    // Fantasma. Este test fija la forma de la expresión porque el error no se ve
    // en el resultado: da una escalera creíble con la gente en el rango de al lado.
    expect(tierOfBadgeSql()).toContain("floor(");
    expect(tierOfBadgeSql()).not.toMatch(/\(\s*\w+\s*\/\s*10\s*\)::INT/);
  });

  it("acepta la columna que se le pase", () => {
    expect(tierOfBadgeSql("rango")).toContain("rango");
  });
});

describe("seOf", () => {
  it("es 0,5/raíz(n) en puntos de winrate", () => {
    expect(seOf(10_000)).toBeCloseTo(0.005, 6);
    expect(seOf(2_500)).toBeCloseTo(0.01, 6);
  });

  it("devuelve Infinity con cero partidas en vez de dividir por cero", () => {
    expect(seOf(0)).toBe(Infinity);
  });
});

describe("sidesFrom", () => {
  const filas = [
    { tier: 8, matches: 30_000, team0Wins: 15_300 },
    { tier: 1, matches: 500, team0Wins: 260 },
  ];

  it("deja afuera el rango que no llega al mínimo", () => {
    expect(sidesFrom(filas, 20_000).map((s) => s.tier)).toEqual([8]);
  });

  it("calcula el winrate del lado 0 y su error", () => {
    const [row] = sidesFrom(filas, 20_000);
    expect(row.team0).toBeCloseTo(0.51, 6);
    expect(row.se).toBeCloseTo(0.5 / Math.sqrt(30_000), 6);
  });

  it("ordena por rango, de abajo hacia arriba", () => {
    const out = sidesFrom(
      [
        { tier: 8, matches: 30_000, team0Wins: 15_000 },
        { tier: 2, matches: 30_000, team0Wins: 15_000 },
      ],
      1_000
    );
    expect(out.map((s) => s.tier)).toEqual([2, 8]);
  });
});

describe("coverageOf", () => {
  it("es la fracción del último día, no la del período", () => {
    // El período entero arrastra los días de calibración temprana (2,3% el 30/7),
    // que ya no describen a nadie. El cartel tiene que decir cómo está hoy.
    const dias = [
      { day: "2026-07-30", rows: 140_400, ranked: 3_229 },
      { day: "2026-08-01", rows: 111_144, ranked: 52_904 },
    ];
    expect(coverageOf(dias)).toBeCloseTo(52_904 / 111_144, 6);
  });

  it("no depende del orden en que vengan los días", () => {
    const dias = [
      { day: "2026-08-01", rows: 100, ranked: 50 },
      { day: "2026-07-30", rows: 100, ranked: 1 },
    ];
    expect(coverageOf(dias)).toBeCloseTo(0.5, 6);
  });

  it("es 0 si no hay ni un día", () => {
    expect(coverageOf([])).toBe(0);
  });
});

describe("daysFrom", () => {
  it("rellena con ceros los rangos sin partidas, para que la serie no tenga huecos", () => {
    const [dia] = daysFrom([{ day: "2026-08-01", tier: 8, matches: 10, players: 4 }]);
    expect(dia.matches).toHaveLength(12);
    expect(dia.matches[8]).toBe(10);
    expect(dia.matches[0]).toBe(0);
    expect(dia.players[8]).toBe(4);
  });

  it("ordena los días de más viejo a más nuevo", () => {
    const out = daysFrom([
      { day: "2026-08-01", tier: 1, matches: 1, players: 1 },
      { day: "2026-07-30", tier: 1, matches: 1, players: 1 },
    ]);
    expect(out.map((d) => d.day)).toEqual(["2026-07-30", "2026-08-01"]);
  });

  it("descarta un rango que no existe en vez de agrandar el array", () => {
    const [dia] = daysFrom([{ day: "2026-08-01", tier: 99, matches: 10, players: 4 }]);
    expect(dia.matches).toHaveLength(12);
    expect(dia.matches.every((n) => n === 0)).toBe(true);
  });
});
