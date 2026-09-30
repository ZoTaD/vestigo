import { describe, expect, it } from "vitest";
import { adjustNoDrop, condOk, effectiveMf, ladderOk, playerExponent, qualityChance, upgradeTc } from "../src/d2r/drops/rules";
import { dropData } from "../src/d2r/drops/data";

/** Las fórmulas del juego, contra cuentas hechas a mano (guía oficial, itemratio-calc). */
describe("NoDrop y jugadores", () => {
  it("vos, el grupo cerca cuenta entero y el resto medio", () => {
    expect(playerExponent(1, 1)).toBe(1);
    expect(playerExponent(2, 1)).toBe(1); // /players 2 = /players 1
    expect(playerExponent(3, 1)).toBe(2);
    expect(playerExponent(8, 1)).toBe(4); // partida llena sin grupo
    expect(playerExponent(8, 7)).toBe(7);
  });

  it("la chance de no soltar nada se eleva a N, con el truncado del juego", () => {
    expect(adjustNoDrop(100, 100, 1)).toBe(100);
    // (100/200)^2 = 0,25 → 100 / (1/0,25 − 1) = 33,3 → 33
    expect(adjustNoDrop(100, 100, 2)).toBe(33);
    expect(adjustNoDrop(0, 100, 4)).toBe(0);
  });
});

describe("calidad", () => {
  it("el MF rinde menos pasado el 10% para único, conjunto y raro, no para mágico", () => {
    expect(effectiveMf(10, "u")).toBe(110);
    expect(effectiveMf(300, "u")).toBe(100 + Math.trunc((300 * 250) / 550)); // 236
    expect(effectiveMf(300, "s")).toBe(100 + Math.trunc((300 * 500) / 800)); // 287
    expect(effectiveMf(300, "m")).toBe(400);
  });

  it("chance de único de un Shako (qlvl 58) que suelta Mefisto (mlvl 87) sin MF", () => {
    // (400 − (87−58)/1) × 128 = 47.488; sin MF queda igual; mínimo 6.400 no aplica; TC 0.
    expect(qualityChance([400, 1, 6400], "u", 87, 58, 0, 0)).toBeCloseTo(128 / 47488, 12);
    // Con el modificador de TC de un jefe (983): 47.488 − 47.488·983/1024 = 1.902 (truncado)
    expect(qualityChance([400, 1, 6400], "u", 87, 58, 0, 983)).toBeCloseTo(128 / (47488 - Math.trunc((47488 * 983) / 1024)), 12);
  });

  it("el mínimo corta antes del modificador de TC y una chance ≤ 128 es segura", () => {
    // (400 − 90)·128 = 39.680; con MF 9999 queda 39.680·100/343 = 11.568, pero el mínimo (20.000 acá) la sube.
    const withMin = qualityChance([400, 1, 20000], "u", 99, 9, 9999, 0);
    expect(withMin).toBeCloseTo(128 / 20000, 12);
    expect(qualityChance([400, 1, 6400], "u", 99, 1, 0, 1024)).toBe(1);
  });
});

describe("condiciones y Clasificación", () => {
  const kill = { diff: 2 as const, desec: false, herald: false, tier: 0 };
  it("condiciones", () => {
    expect(condOk(undefined, kill)).toBe(true);
    expect(condOk({ diff: 2 }, kill)).toBe(true);
    expect(condOk({ diff: 2 }, { ...kill, diff: 1 })).toBe(false);
    expect(condOk({ desec: true }, kill)).toBe(false);
    expect(condOk({ herald: true, tier: [3, 4] }, { ...kill, herald: true, tier: 3 })).toBe(true);
    expect(condOk({ tier: [5, 99] }, { ...kill, herald: true, tier: 4 })).toBe(false);
  });

  it("exclusivo de Clasificación de la temporada 3 a la 14: en la 15 sale en todas", () => {
    expect(ladderOk(undefined, false, 15)).toBe(true);
    expect(ladderOk([3, 14], false, 15)).toBe(true);
    expect(ladderOk([3, 14], false, 14)).toBe(false);
    expect(ladderOk([15, 0], true, 15)).toBe(true);
    expect(ladderOk([15, 0], false, 15)).toBe(false);
  });
});

/**
 * La mejora de TC recorre la cadena de filas CONTIGUAS con el mismo número de grupo (guía oficial,
 * treasureclassex.js). Ese número se reusa en Normal, Pesadilla e Infierno, así que juntar todas las TCs de un
 * mismo número mezcla cadenas que no tienen nada que ver: estos casos usan cadenas reales de drops.json.
 */
describe("mejora de TC por cadenas", () => {
  const D = dropData();

  it("la Condesa de Normal en Zona de Terror sube de A a B a C y no se pasa a Pesadilla", () => {
    // En la tabla: Countess Desecrated A (nivel 11) → B (34) → C (48), y enseguida Countess (N), que no tiene
    // grupo. Las de Pesadilla (Countess (N) Desecrated A, nivel 45…) llevan el mismo número de grupo pero son
    // otra cadena: con una lista por número, a nivel 48 la Condesa de Normal caía en la de Pesadilla.
    const [a, b, c] = ["Countess Desecrated A", "Countess Desecrated B", "Countess Desecrated C"];
    const nightmare = "Countess (N) Desecrated A";
    expect([a, b, c].map((n) => D.tcs[n].l)).toEqual([11, 34, 48]);
    expect(D.tcs[nightmare].g).toBe(D.tcs[a].g); // el mismo número, reusado
    expect(D.tcs[nightmare].l).toBe(45); // y a nivel 48 ya le alcanza
    expect(D.tcs["Countess (N)"].g).toBeUndefined(); // lo que corta la cadena

    expect(upgradeTc(D, a, 47)).toBe(b);
    expect(upgradeTc(D, a, 48)).toBe(c);
    expect(upgradeTc(D, a, 999)).toBe(c);
    expect(D.chains.get(a)).toEqual([a, b, c]);
    expect(D.chains.get(a)).toBe(D.chains.get(c)); // cada TC de la cadena apunta a la misma lista
  });

  it("un cofre sube por escalones de la cadena: nivel intermedio y borde exacto", () => {
    // Una sola cadena larga (45 filas, de Normal a Infierno) que arranca así: Act 1 Chest A (sin nivel, o sea 0),
    // B (5), C (9), Act 2 Chest A (12), B (15), C (18)…
    const rows = ["Act 1 Chest A", "Act 1 Chest B", "Act 1 Chest C", "Act 2 Chest A", "Act 2 Chest B", "Act 2 Chest C"];
    expect(rows.map((n) => D.tcs[n].l ?? 0)).toEqual([0, 5, 9, 12, 15, 18]);
    const [a1a, a1b, a1c, a2a, a2b, a2c] = rows;

    expect(upgradeTc(D, a1a, 4)).toBe(a1a); // a la siguiente (5) le falta uno
    expect(upgradeTc(D, a1a, 5)).toBe(a1b); // borde exacto: nivel igual al de la siguiente
    expect(upgradeTc(D, a1a, 11)).toBe(a1c); // intermedio: pasa B (5) y C (9), no Act 2 Chest A (12)
    expect(upgradeTc(D, a1a, 12)).toBe(a2a); // borde exacto, ya en el acto siguiente
    expect(upgradeTc(D, a2a, 17)).toBe(a2b); // arrancando a mitad de cadena
    expect(upgradeTc(D, a2a, 18)).toBe(a2c);
    expect(upgradeTc(D, a1a, 999)).toBe("Act 5 (H) Chest C"); // el final de la cadena
  });

  it("una TC sin grupo no cambia y ninguna baja", () => {
    expect(upgradeTc(D, "Countess (N)", 999)).toBe("Countess (N)"); // sin grupo
    expect(upgradeTc(D, "no existe", 999)).toBe("no existe"); // ni está en la tabla
    // Con nivel 0 devuelve la misma, arranque donde arranque: nunca vuelve hacia atrás en la cadena.
    expect(upgradeTc(D, "Countess Desecrated C", 0)).toBe("Countess Desecrated C");
    expect(upgradeTc(D, "Act 3 Chest A", 0)).toBe("Act 3 Chest A");
  });

  it("cada cadena real es de filas contiguas de la tabla, con el mismo grupo y con el nivel que no baja", () => {
    const names = Object.keys(D.tcs);
    expect([...D.chains.keys()]).toEqual(names.filter((n) => D.tcs[n].g)); // sólo las TCs con grupo tienen cadena
    for (const chain of new Set(D.chains.values())) {
      const start = names.indexOf(chain[0]);
      expect(names.slice(start, start + chain.length)).toEqual(chain); // contiguas en la tabla
      expect(new Set(chain.map((n) => D.tcs[n].g)).size).toBe(1); // del mismo grupo
      const levels = chain.map((n) => D.tcs[n].l ?? 0);
      expect(levels).toEqual([...levels].sort((x, y) => x - y)); // por eso alcanza con cortar en la primera que no llega
    }
    // Y la cadena no se corta antes: dos filas seguidas del mismo grupo son de la misma cadena.
    names.forEach((n, i) => {
      const g = D.tcs[n].g;
      if (g && D.tcs[names[i + 1]]?.g === g) expect(D.chains.get(names[i + 1])).toBe(D.chains.get(n));
    });
  });
});
