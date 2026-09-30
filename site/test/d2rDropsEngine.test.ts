/**
 * El motor exacto de la calculadora de drops: cada regla con datos de juguete, y contra las referencias del evaluador exacto
 * independiente del repo, `games/d2r/tools/drops_check.py`. Para volver a sacarlas (desde la raíz, después de drops.py):
 *   python games/d2r/tools/drops_check.py
 * Imprime las filas de "contra el evaluador exacto" tal como van acá, y las de d2rDropsPlaces.test.ts.
 */
import { describe, expect, it } from "vitest";
import { chancePerKill, explainPath } from "../src/d2r/drops/engine";
import { dropData, indexData } from "../src/d2r/drops/data";
import type { DropData, KillCtx, Settings, Target } from "../src/d2r/drops/types";

const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const kill = (tc: string, mlvl = 50, extra: Partial<KillCtx> = {}): KillCtx => ({ tc, mlvl, diff: 2, desec: false, herald: false, tier: 0, ...extra });
const loc = (s: string) => ({ en: s, es: s });

/** Un juego de juguete: cada regla se prueba sola, con números que se sacan a mano. */
const toy = indexData({
  tcs: {
    Root: { p: 1, e: [["cap", 100]], nd: 100 },
    Twice: { p: 2, e: [["cap", 1]], nd: 1 },
    Neg: { p: -2, e: [["Root", 1], ["cap", 1]] },
    NegShort: { p: -1, e: [["Root", 1], ["cap", 1]] },
    Capped: { p: -7, e: [["hp1", 6], ["cap", 1]] },
    Boss: { p: 1, e: [["Plain", 1]], q: [1024, 0, 0, 0] },
    Plain: { p: 1, e: [["cap", 1]] },
    Cond: { p: 1, e: [["OnlyTz", 1], ["cap", 1]] },
    OnlyTz: { p: 1, e: [["rin", 1]], c: { desec: true } },
    Named: { p: 1, e: [["Biggin's Bonnet", 1]] },
    // Por tirada PickX da el casquete el 60% y PickY el 40%; NegTwice tira a PickY dos veces: pesa 2 × 0,4 = 0,8.
    PickX: { p: 1, e: [["cap", 3], ["hp1", 2]] },
    PickY: { p: 1, e: [["cap", 2], ["hp1", 3]] },
    NegTwice: { p: -3, e: [["PickX", 1], ["PickY", 2]] },
    // Una tirada negativa cuya primera entrada es una sub-TC condicional (OnlyTz sólo pasa aterrorizado).
    NegCond: { p: -1, e: [["OnlyTz", 1], ["cap", 1]] },
    // Exclusivo de Clasificación desde la temporada 16.
    LadderOnly: { p: 1, e: [["cap", 1]], lad: [16, 0] },
  },
  bases: {
    cap: { q: 1, t: "helm", u: 0, cl: 0, qf: 0, k: "a", n: loc("Cap"), img: null },
    rin: { q: 1, t: "ring", u: 0, cl: 0, qf: 2, k: "m", n: loc("Ring"), img: null },
    hp1: { q: 1, t: "hpot", u: 0, cl: 0, qf: 1, k: "m", n: loc("Potion"), img: null },
  },
  uniques: [{ id: "biggins-bonnet", key: "Biggin's Bonnet", code: "cap", lvl: 3, rar: 1, n: loc("Biggin's Bonnet"), img: null }],
  sets: [{ id: "sigons-visor", set: "sigons-complete-steel", key: "Sigon's Visor", code: "cap", lvl: 3, rar: 1, n: loc("Sigon's Visor"), img: null }],
  ratio: [{ u: 0, cl: 0, U: [400, 1, 6400], S: [160, 2, 5600], R: [100, 2, 3200], M: [34, 3, 192] }],
  monsters: {},
  areas: [],
  sources: [],
  tz: { b: [[3, 45], [40, 71], [70, 96]], boost: 2, heraldTc: [0], maxTier: 0 },
} as unknown as DropData);
const CAP: Target = { k: "b", code: "cap" };

describe("el motor con datos de juguete", () => {
  it("una tirada con NoDrop igual al resto: 50%", () => {
    expect(chancePerKill(toy, CAP, kill("Root"), S0)).toBeCloseTo(0.5, 12);
  });

  it("dos tiradas: 1 − 0,5² = 75%", () => {
    expect(chancePerKill(toy, CAP, kill("Twice"), S0)).toBeCloseTo(0.75, 12);
  });

  it("con /players 3 el NoDrop baja de 100 a 33", () => {
    expect(chancePerKill(toy, CAP, kill("Root"), { ...S0, players: 3 })).toBeCloseTo(100 / 133, 12);
  });

  it("tiradas negativas: la segunda entrada sale segura", () => {
    expect(chancePerKill(toy, CAP, kill("Neg"), S0)).toBeCloseTo(1, 12);
  });

  it("el tope de 6 ítems: después de 6 pociones el casquete no sale", () => {
    expect(chancePerKill(toy, CAP, kill("Capped"), S0)).toBe(0);
  });

  it("sin el tope de 6 ítems el casquete que viene detrás de las 6 pociones sí sale", () => {
    // Con `cap: false` nada se corta: la misma TC que con el tope da 0 da seguro.
    expect(chancePerKill(toy, CAP, kill("Capped"), S0, { cap: false })).toBe(1);
  });

  it("una sola tirada negativa: sale la primera entrada (Root) y el casquete la mitad de las veces", () => {
    // NegShort hace una tirada: Root sale seguro y el casquete, que va segundo, queda fuera de la secuencia.
    expect(chancePerKill(toy, CAP, kill("NegShort"), S0)).toBeCloseTo(0.5, 12);
  });

  it("la calidad de un jefe llega a lo que tira su sub-TC (el máximo de la cadena)", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Boss", 50), S0)).toBeCloseTo(1, 12);
  });

  it("un único que pide más nivel que el monstruo no sale; el conjunto se tira después del único", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Plain", 2), S0)).toBe(0);
    const pu = 128 / ((400 - 49) * 128);
    const ps = 128 / ((160 - Math.trunc(49 / 2)) * 128);
    expect(chancePerKill(toy, { k: "s", id: "sigons-visor" }, kill("Plain", 50), S0)).toBeCloseTo((1 - pu) * ps, 12);
  });

  it("una sub-TC que no pasa su condición sale del sorteo con su peso", () => {
    expect(chancePerKill(toy, CAP, kill("Cond"), S0)).toBeCloseTo(1, 12);
    expect(chancePerKill(toy, CAP, kill("Cond", 50, { desec: true }), S0)).toBeCloseTo(0.5, 12);
  });

  it("una sub-TC condicional que no pasa sale antes de contar las tiradas negativas: la entrada siguiente ocupa su tirada", () => {
    // NegCond tira una vez. Sin Zona de Terror OnlyTz sale de la lista y esa tirada es la del casquete; aterrorizado, la tirada
    // es la de OnlyTz (un anillo) y el casquete queda afuera. La guía del juego no dice si la sub-TC que no pasa ocupa su lugar,
    // y en datos reales cambia números (los "Worldstone Shard Parent", ver `rollOf`): esto fija la regla que usa el motor.
    expect(chancePerKill(toy, CAP, kill("NegCond"), S0)).toBe(1);
    expect(chancePerKill(toy, CAP, kill("NegCond", 50, { desec: true }), S0)).toBe(0);
  });

  it("un único por nombre sale seguro", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Named"), S0)).toBe(1);
  });

  it("el camino principal lleva del jefe al casquete", () => {
    const path = explainPath(toy, { k: "u", id: "biggins-bonnet" }, kill("Boss", 50), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["Boss", "Plain"]);
    expect(path.end.code).toBe("cap");
    expect(path.end.quality).toBe(1);
  });

  it("en una TC de tiradas negativas nada se sortea: el paso sale seguro (share 1) y no Prob / total", () => {
    // Neg da sus dos entradas (Root y cap) sin tirar dados: con Prob / total el paso diría 0,5.
    const path = explainPath(toy, CAP, kill("Neg"), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["Neg"]);
    expect(path.end.code).toBe("cap");
    expect(path.end.share).toBe(1);
  });

  it("en tiradas negativas lo que queda fuera de la secuencia nunca sale: el camino no pasa por ahí", () => {
    // NegShort hace una sola tirada: sale Root y cap queda afuera, así que el camino baja por Root
    // (con Prob / total, cap parecía la salida directa).
    const path = explainPath(toy, CAP, kill("NegShort"), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["NegShort", "Root"]);
    expect(path.end.code).toBe("cap");
    expect(path.end.share).toBe(0.5);
  });

  it("en tiradas negativas una entrada que se repite pesa por cada vez que sale: PickY (×2, 0,4 c/u) le gana a PickX (×1, 0,6)", () => {
    // NegTwice tira PickX una vez y PickY dos. Por tirada PickX da el casquete más seguido (0,6 contra 0,4), pero
    // PickY sale dos veces y pesa 0,8. Con share 1 en todas las entradas de la secuencia el camino elegía PickX.
    const path = explainPath(toy, CAP, kill("NegTwice"), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["NegTwice", "PickY"]);
    expect(path.steps[1].share).toBe(1);
    expect(path.end.code).toBe("cap");
    expect(path.end.share).toBeCloseTo(0.4, 12);
  });

  it("explainPath rechaza el TC raíz como chancePerKill: si no pasa su condición no hay camino", () => {
    // OnlyTz sólo suelta en una zona aterrorizada. Sin ella la chance es 0 y un camino sería inventado.
    const RING: Target = { k: "b", code: "rin" };
    expect(chancePerKill(toy, RING, kill("OnlyTz"), S0)).toBe(0);
    expect(explainPath(toy, RING, kill("OnlyTz"), S0)).toBeNull();
    const path = explainPath(toy, RING, kill("OnlyTz", 50, { desec: true }), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["OnlyTz"]);
    expect(path.end.code).toBe("rin");
  });

  it("explainPath rechaza el TC raíz exclusivo de Clasificación cuando la partida no lo es", () => {
    expect(chancePerKill(toy, CAP, kill("LadderOnly"), S0)).toBe(0);
    expect(explainPath(toy, CAP, kill("LadderOnly"), S0)).toBeNull();
    const path = explainPath(toy, CAP, kill("LadderOnly"), { ...S0, ladder: true, season: 16 })!;
    expect(path.steps.map((s) => s.tc)).toEqual(["LadderOnly"]);
    expect(path.end.code).toBe("cap");
  });

  it("si ninguna entrada aporta (un único que pide más nivel que el monstruo) no hay camino: es null, no uno inventado", () => {
    const BONNET: Target = { k: "u", id: "biggins-bonnet" };
    expect(chancePerKill(toy, BONNET, kill("Plain", 2), S0)).toBe(0);
    expect(explainPath(toy, BONNET, kill("Plain", 2), S0)).toBeNull();
  });
});

/**
 * Las referencias salen de un evaluador exacto independiente (`games/d2r/tools/drops_check.py`, que las imprime con
 * `python games/d2r/tools/drops_check.py`), sobre los datos del parche instalado (3.3.93847), con y sin el tope de 6
 * ítems. Validación (2026-09-29):
 * - sin el tope y sobre las propias tablas de Silospen, da sus números en vivo al 0,000%;
 * - un Montecarlo del proceso de la muerte coincide con él.
 * Silospen difiere por dos cosas: recorta las tiradas a 6 (en vez de cortar en el sexto ítem) y usa tablas
 * anteriores al 3.3. Tolerancia: 1e-6 relativo.
 */
describe("contra el evaluador exacto: jefes de Infierno", () => {
  const D = dropData();
  const SHAKO: Target = { k: "u", id: "harlequin-crest" };
  const BER: Target = { k: "b", code: "r30" };
  const TAL: Target = { k: "s", id: "tal-rashas-guardianship" };
  const exact = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(1e-6);
  // [TC, nivel, buscado, opciones, sin tope, con el tope de 6]
  const cases: [string, number, Target, Settings, number, number][] = [
    ["Mephisto (H)", 87, SHAKO, S0, 0.00058571902, 0.000561844573],
    ["Diablo (H)", 94, SHAKO, S0, 0.000569889288, 0.000546659845],
    ["Baal (H)", 99, SHAKO, S0, 0.000564657314, 0.000541641057],
    ["Andarielq (H)", 75, SHAKO, S0, 0.000424887693, 0.000423171889],
    ["Duriel (H)", 88, SHAKO, S0, 0.00088304134, 0.000275787941],
    ["Nihlathak (H)", 92, SHAKO, S0, 6.48373041e-5, 6.48373041e-5],
    ["Radament (H)", 83, SHAKO, S0, 6.32257558e-5, 6.32257558e-5],
    ["Summoner (H)", 80, SHAKO, S0, 5.94030562e-5, 5.94030562e-5],
    ["Blood Raven (H)", 88, SHAKO, S0, 3.94769482e-5, 3.94769482e-5],
    ["Izual (H)", 86, SHAKO, S0, 3.76115065e-5, 3.76115065e-5],
    ["Griswold (H)", 84, SHAKO, S0, 3.36375269e-5, 3.36375269e-5],
    ["Mephisto (H)", 87, SHAKO, { ...S0, mf: 300 }, 0.0013817088, 0.00132541725],
    ["Baal (H)", 99, SHAKO, { ...S0, mf: 300 }, 0.00133157406, 0.00127732331],
    ["Andarielq (H)", 75, SHAKO, { ...S0, mf: 300 }, 0.00100222125, 0.000998176653],
    ["Mephisto (H)", 87, SHAKO, { ...S0, players: 8 }, 0.000721794703, 0.00061871308],
    ["Baal (H)", 99, SHAKO, { ...S0, players: 8 }, 0.00069584135, 0.000596465095],
    ["Andarielq (H)", 75, SHAKO, { ...S0, players: 8 }, 0.000740797564, 0.000656685702],
    ["Mephisto (H)", 87, BER, S0, 1.75243329e-5, 1.68097701e-5],
    ["Baal (H)", 99, BER, S0, 1.7520944e-5, 1.68065193e-5],
    ["Baal (H)", 99, TAL, S0, 0.000516279123, 0.000495234192],
  ];
  for (const [tc, mlvl, target, s, off, cap6] of cases) {
    const name = `${tc} · ${JSON.stringify(target)} · MF ${s.mf} · ${s.players} jugador(es)`;
    it(`${name} · sin tope`, () => exact(chancePerKill(D, target, kill(tc, mlvl), s, { cap: false }), off));
    it(`${name} · con el tope de 6`, () => exact(chancePerKill(D, target, kill(tc, mlvl), s), cap6));
  }
});

/** Silospen en vivo, donde el parche 3.3 no cambió nada y el tope no importa (1%). */
describe("contra Silospen en vivo", () => {
  const D = dropData();
  const SHAKO: Target = { k: "u", id: "harlequin-crest" };
  const close = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(0.01);
  const cases: [string, number, number][] = [
    ["Nihlathak (H)", 92, 0.0000648373],
    ["Radament (H)", 83, 0.00006322576],
    ["Summoner (H)", 80, 0.00005940306],
    ["Blood Raven (H)", 88, 0.00003947695],
    ["Izual (H)", 86, 0.00003761151],
  ];
  for (const [tc, mlvl, want] of cases) it(`${tc} · Cresta del arlequín`, () => close(chancePerKill(D, SHAKO, kill(tc, mlvl), S0), want));

  it("Mefisto y Andariel no llegan a la Guardia de Tal Rasha (base de nivel 82)", () => {
    expect(chancePerKill(D, { k: "s", id: "tal-rashas-guardianship" }, kill("Mephisto (H)", 87), S0)).toBe(0);
    expect(chancePerKill(D, { k: "s", id: "tal-rashas-guardianship" }, kill("Andarielq (H)", 75), S0)).toBe(0);
  });
});

/**
 * "¿De dónde sale este número?" cuando el camino pasa por una TC de tiradas negativas (Ist, la runa 24).
 * Ahí nada se sortea: las entradas de la secuencia salen seguras, y con Prob / total la pantalla diría "1 de
 * cada 2 por tirada" de un paso que ocurre siempre. Sólo cambia lo que se muestra: la chance no se toca.
 */
describe("el camino principal por TCs de tiradas negativas", () => {
  const D = dropData();
  const IST: Target = { k: "b", code: "r24" };

  it("Condesa (2 tiradas fijas): la runa sale segura y los sorteos de después siguen en Prob / total", () => {
    const path = explainPath(D, IST, kill("Countess (H)", 82), S0)!;
    const at = path.steps.findIndex((s) => s.tc === "Countess Rune (H)");
    expect(at).toBeGreaterThan(0);
    expect(path.steps[at].share).toBe(1);
    const later = path.steps.slice(at + 1);
    expect(later.length).toBeGreaterThan(0);
    for (const s of later) {
      expect(s.share, s.tc).toBeGreaterThan(0);
      expect(s.share, s.tc).toBeLessThan(1);
    }
  });

  it("Pindleskin (5 tiradas fijas): la TC de ítems sale segura", () => {
    const path = explainPath(D, IST, kill("Act 5 (H) Super Cx", 86), S0)!;
    expect(path.steps.find((s) => s.tc === "Act 5 (H) Uitem C")?.share).toBe(1);
  });
});

/**
 * "¿De dónde sale este número?" en los dos casos que rompían el tope fijo de 32 pasos y el share plano de las
 * tiradas negativas:
 * - de Baal a una base de Normal el camino recorre toda la cascada de Equip (Infierno → Pesadilla → Normal),
 *   34 pasos, aunque la chance ronda el 1,9%: un null querría decir "no puede salir";
 * - Griswold hace 3 tiradas fijas: Uitem C una vez y Melee B dos (su Prob es 2). Por tirada Uitem C da la
 *   Crystal Sword un poco más seguido (5,08e-3 contra 4,85e-3 en el nivel 84), pero Melee B da 9,67e-3 en sus
 *   dos tiradas: ése es el camino que tiene que mostrar.
 */
describe("el camino principal en datos reales: cascadas largas y entradas repetidas", () => {
  const D = dropData();
  const CRS: Target = { k: "b", code: "crs" };

  it("Baal (H) a la Crystal Sword: el camino entero, sin cortarse en 32 pasos", () => {
    // Si la chance es positiva, null no vale: tiene que haber camino.
    expect(chancePerKill(D, CRS, kill("Baal (H)", 99), S0)).toBeGreaterThan(0.01);
    const path = explainPath(D, CRS, kill("Baal (H)", 99), S0);
    expect(path).not.toBeNull();
    expect(path!.end.code).toBe("crs");
    expect(path!.steps.length).toBeGreaterThan(32);
  });

  it("Griswold (H) a la Crystal Sword: pasa por Melee B (sale dos veces) y no por Uitem C (una)", () => {
    const path = explainPath(D, CRS, kill("Griswold (H)", 84), S0)!;
    expect(path.steps[0].tc).toBe("Griswold (H)");
    expect(path.steps[1].tc).toBe("Act 1 (H) Melee B");
    expect(path.steps[1].share).toBe(1);
    expect(path.end.code).toBe("crs");
  });
});
