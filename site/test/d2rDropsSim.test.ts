import { describe, expect, it } from "vitest";
import { chancePerKill } from "../src/d2r/drops/engine";
import { dropData } from "../src/d2r/drops/data";
import { NO_TZ, sourceKill } from "../src/d2r/drops/places";
import { isRune, mulberry32, rollItem, simulateKill, simulateRuns, summarize, type Loot, type LootQuality } from "../src/d2r/drops/simulate";
import type { Settings } from "../src/d2r/drops/types";

const D = dropData();
const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const kill = (id: string, diff: 0 | 1 | 2 = 2) => sourceKill(D, D.sourceById.get(id)!, diff, NO_TZ)!;

/**
 * Simula `n` muertes y compara, de cada único o pieza buscado, cuántas lo soltaron con la cuenta exacta del motor
 * (5σ). Pide al menos un 2% de chance: con menos, el margen de 5σ pasa del 15% y la prueba pierde fuerza.
 */
function matchesExact(id: string, diff: 0 | 1 | 2, s: Settings, n: number, targets: { k: "u" | "s"; id: string }[]) {
  const k = kill(id, diff);
  const rnd = mulberry32(31);
  const hits = targets.map(() => 0);
  for (let i = 0; i < n; i++) {
    const loot = simulateKill(D, k, s, rnd);
    targets.forEach((t, j) => {
      if (loot.some((l) => l.q === (t.k === "u" ? "unique" : "set") && l.id === t.id)) hits[j]++;
    });
  }
  targets.forEach((t, j) => {
    const exact = chancePerKill(D, t, k, s);
    const sigma = Math.sqrt((exact * (1 - exact)) / n);
    expect(exact, t.id).toBeGreaterThan(0.02);
    expect(Math.abs(hits[j] / n - exact), t.id).toBeLessThan(5 * sigma);
  });
}

describe("el simulador", () => {
  it("la misma semilla da la misma secuencia y el mismo cofre", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(simulateRuns(D, kill("mephisto"), S0, 20, 7)).toEqual(simulateRuns(D, kill("mephisto"), S0, 20, 7));
  });

  it("nunca más de 6 ítems por muerte, ni con 8 jugadores contra Baal", () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 3000; i++) expect(simulateKill(D, kill("baal"), { ...S0, players: 8 }, rnd).length).toBeLessThanOrEqual(6);
  });

  // Los sorteos largos llevan su propio tope de tiempo (60 s): con toda la suite en paralelo tardan unos 2 s acá y el
  // tope por defecto (5 s) queda justo en un runner de CI.
  it("el sorteo da lo mismo que la cuenta exacta: Ist de la Condesa en 100.000 muertes", () => {
    const k = kill("the-countess");
    const exact = chancePerKill(D, { k: "b", code: "r24" }, k, S0);
    const rnd = mulberry32(2026);
    const n = 100_000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (simulateKill(D, k, S0, rnd).some((l) => l.code === "r24")) hits++;
    const sigma = Math.sqrt((exact * (1 - exact)) / n);
    expect(Math.abs(hits / n - exact)).toBeLessThan(5 * sigma);
  }, 60_000);

  it("el resumen separa lo notable (únicos, piezas y runas) del resto", () => {
    const sum = summarize(D, simulateRuns(D, kill("mephisto"), { ...S0, mf: 500 }, 300, 99));
    expect(sum.notable.every((x) => x.loot.q === "unique" || x.loot.q === "set" || isRune(x.loot.code))).toBe(true);
    expect(sum.rare + sum.magic).toBeGreaterThan(0);
    expect(sum.gold).toBeGreaterThan(0);
  });

  // Las runas salen siempre normales, así que Ist no pasa por el sorteo de calidad ni por el del ítem: un único y una
  // pieza sí. Andariel en Pesadilla, con 8 jugadores y 500% de MF, los suelta lo bastante seguido.
  it("el sorteo de calidad da lo mismo que la cuenta exacta: un único y una pieza de Andariel en 60.000 muertes", () => {
    matchesExact("andariel", 1, { ...S0, mf: 500, players: 8 }, 60_000, [
      { k: "u", id: "nagelring" },
      { k: "s", id: "cathans-seal" },
    ]);
  }, 60_000);

  it("la calidad que trae el TC llega hasta la pieza: el Rey Vaca con 300% de MF en 40.000 muertes", () => {
    // Su TC sube mucho la chance de pieza (983 de 1024). El de sus armaduras (Uitem C), por donde sale Sander's Taboo,
    // trae un modificador más bajo (800): vale el mayor de la cadena. Cleglaw's Claw sale por Melee B, que no trae el suyo.
    matchesExact("the-cow-king", 0, { ...S0, mf: 300 }, 40_000, [
      { k: "s", id: "sanders-taboo" },
      { k: "s", id: "cleglaws-claw" },
    ]);
  }, 60_000);

  it("un único que el TC nombra sale sin sorteo de calidad: el Bilis del Defensor de Talic Colosal", () => {
    matchesExact("colossal-talic", 2, S0, 5_000, [{ k: "u", id: "defenders-bile" }]);
  });

  // El motor no cuenta lo que sale raro, mágico o normal: acá se fuerzan los dados para seguir el orden del juego.
  // A nivel 1 no hay ningún único ni pieza que entre; a nivel 99 sí (el casquete tiene un único y dos piezas).
  it("la calidad de un ítem sigue el orden del juego y lo fallido cae a raro o mágico según la base", () => {
    const WIN = 0;
    const FAIL = 0.999999;
    const quality = (code: string, mlvl: number, ...dice: number[]): Loot =>
      rollItem(D, code, [0, 0, 0, 0], { ...kill("mephisto"), mlvl }, S0, () => dice.shift() ?? FAIL);
    // [base, nivel del monstruo, dados en orden (único, pieza, raro, mágico; lo que falta sale mal), calidad]
    const cases: [string, number, number[], LootQuality][] = [
      ["cap", 1, [WIN], "rare"], // único fallido: no hay ninguno para elegir
      ["cm3", 1, [WIN], "magic"], // ...y un talismán nunca es raro
      ["cap", 1, [FAIL, WIN], "magic"], // pieza fallida
      ["cap", 1, [FAIL, FAIL, WIN], "rare"],
      ["cap", 1, [FAIL, FAIL, FAIL, WIN], "magic"],
      ["cap", 1, [], "normal"],
      ["rin", 1, [], "magic"], // un anillo nunca es normal...
      ["rin", 1, [FAIL, FAIL, WIN], "rare"], // ...pero sí puede ser raro
      ["cm3", 1, [FAIL, FAIL, WIN], "magic"], // el talismán no tira el raro
      ["r24", 1, [WIN, WIN, WIN, WIN], "normal"], // las runas salen siempre normales
      ["cap", 99, [WIN], "unique"],
      ["cap", 99, [FAIL, WIN], "set"],
    ];
    for (const [code, mlvl, dice, want] of cases) expect(quality(code, mlvl, ...dice).q, `${code} nivel ${mlvl} ${dice}`).toBe(want);
    // Lo que sale es de esa base: el único o la pieza que entra al sorteo.
    expect(D.uniqueById.get(quality("cap", 99, WIN).id!)?.code).toBe("cap");
    expect(D.setById.get(quality("cap", 99, FAIL, WIN).id!)?.code).toBe("cap");
  });

  it("otra semilla da otro cofre: manda la semilla del enlace", () => {
    expect(simulateRuns(D, kill("mephisto"), S0, 20, 7)).not.toEqual(simulateRuns(D, kill("mephisto"), S0, 20, 8));
  });

  // El piso va de lo más buscado a lo menos: las runas desde Ist (r24) hacia arriba, los únicos y las piezas por nivel y, al
  // final, las runas de abajo, que salen a montones y tapaban a todo lo demás.
  it("el resumen cuenta y ordena lo notable: las runas desde Ist, los únicos, las piezas y al final las runas bajas", () => {
    const shako = D.uniqueById.get("harlequin-crest")!;
    const tal = D.setById.get("tal-rashas-guardianship")!;
    const uni: Loot = { code: shako.code, q: "unique", id: shako.id };
    const runs: Loot[][] = [
      [{ code: "r24", q: "normal" }, { code: "gld", q: "normal" }, { code: "cap", q: "rare" }],
      [{ code: "r30", q: "normal" }, uni, { code: "cap", q: "magic" }],
      [{ code: "r24", q: "normal" }, { code: tal.code, q: "set", id: tal.id }, uni, { code: "gld", q: "normal" }, { code: "hp1", q: "normal" }],
      // Mal (r23) es la más alta de las bajas; El (r01), la más baja.
      [{ code: "r01", q: "normal" }, { code: "r23", q: "normal" }],
    ];
    const sum = summarize(D, runs);
    expect(sum.notable.map((x) => [x.loot.id ?? x.loot.code, x.count])).toEqual([["r30", 1], ["r24", 2], [shako.id, 2], [tal.id, 1], ["r23", 1], ["r01", 1]]);
    // Raros, mágicos y el resto (una poción); el oro va aparte, contado por montón.
    expect([sum.rare, sum.magic, sum.normal, sum.gold]).toEqual([1, 1, 1, 2]);
  });

  describe("el orden del piso", () => {
    const rune = (code: string): Loot => ({ code, q: "normal" });
    const unique = (u: { code: string; id: string }): Loot => ({ code: u.code, q: "unique", id: u.id });
    const piece = (x: { code: string; id: string }): Loot => ({ code: x.code, q: "set", id: x.id });
    const order = (...drops: Loot[]) => summarize(D, [drops]).notable.map((x) => x.loot.id ?? x.loot.code);
    /**
     * De los datos, dos del mismo nivel (a y b), uno de más nivel (high) y uno de menos (low): así el test no depende de nombres.
     * El nivel del par no es el más alto ni el más bajo, para que existan los otros dos.
     */
    const tiers = <T extends { id: string; code: string; lvl: number }>(xs: T[]) => {
      const byLvl = new Map<number, T[]>();
      for (const x of xs) byLvl.set(x.lvl, [...(byLvl.get(x.lvl) ?? []), x]);
      const lvls = [...byLvl.keys()].sort((p, q) => p - q);
      const [lvl, [a, b]] = [...byLvl.entries()].find(([l, g]) => g.length >= 2 && l > lvls[0] && l < lvls[lvls.length - 1])!;
      return { a, b, high: xs.find((x) => x.lvl > lvl)!, low: xs.find((x) => x.lvl < lvl)! };
    };
    const uniques = D.uniques.filter((u) => !u.f);

    it("una Ber va primero, un único bajo en el medio y una El al final, salgan en el orden que salgan", () => {
      const low = D.uniqueById.get("nagelring")!;
      const [ber, el, nag] = [rune("r30"), rune("r01"), unique(low)];
      for (const drops of [[el, nag, ber], [ber, nag, el], [nag, el, ber], [el, ber, nag]]) expect(order(...drops)).toEqual(["r30", low.id, "r01"]);
    });

    it("Ist es donde empiezan las runas que se buscan: desde r24 van antes que los únicos, y Mal (r23) después de todo", () => {
      const u = unique(uniques[0]);
      expect(order(rune("r23"), u, rune("r24"))).toEqual(["r24", u.id, "r23"]);
    });

    it("las runas altas van de la más alta a la más baja, y las bajas también", () => {
      expect(order(rune("r05"), rune("r24"), rune("r02"), rune("r33"), rune("r30"), rune("r23"))).toEqual(["r33", "r30", "r24", "r23", "r05", "r02"]);
    });

    it("los únicos van del nivel más alto al más bajo y, a igual nivel, del que más salió al que menos", () => {
      const { a, b, high, low } = tiers(uniques);
      // El de menos nivel sale 5 veces y b 3: si mandara la cantidad, el orden sería otro.
      const drops = [...Array(5).fill(unique(low)), unique(a), unique(b), unique(b), unique(b), unique(high)];
      expect(order(...drops)).toEqual([high.id, b.id, a.id, low.id]);
    });

    it("las piezas de conjunto, igual", () => {
      const { a, b, high, low } = tiers(D.sets);
      const drops = [...Array(5).fill(piece(low)), piece(a), piece(b), piece(b), piece(b), piece(high)];
      expect(order(...drops)).toEqual([high.id, b.id, a.id, low.id]);
    });

    it("un único va antes que una pieza aunque su nivel sea menor", () => {
      const lowUnique = [...uniques].sort((p, q) => p.lvl - q.lvl)[0];
      const highPiece = [...D.sets].sort((p, q) => q.lvl - p.lvl)[0];
      expect(lowUnique.lvl).toBeLessThan(highPiece.lvl);
      expect(order(piece(highPiece), unique(lowUnique))).toEqual([lowUnique.id, highPiece.id]);
    });

    it("a igual nivel y cantidad, el orden no depende de cuál salió primero", () => {
      const { a, b } = tiers(uniques);
      expect(order(unique(a), unique(b))).toEqual(order(unique(b), unique(a)));
      const s = tiers(D.sets);
      expect(order(piece(s.a), piece(s.b))).toEqual(order(piece(s.b), piece(s.a)));
    });
  });

  it("isRune reconoce exactamente las runas del juego", () => {
    for (const [code, base] of Object.entries(D.bases)) expect(isRune(code), code).toBe(base.t === "rune");
    for (let n = 1; n <= 33; n++) expect(isRune(`r${String(n).padStart(2, "0")}`), `r${n}`).toBe(true);
    for (const code of ["gld", "cap", "hp1", "r3", "r300", "xr30", "r30x", ""]) expect(isRune(code), code).toBe(false);
  });
});
