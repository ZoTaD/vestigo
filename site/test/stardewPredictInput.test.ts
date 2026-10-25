// La entrada de la pestaña Predictor (tarea 7): la semilla y la fecha de la dirección, lo que se lee de la partida y
// las predicciones armadas con eso. Las predicciones mismas ya se prueban contra el juego en los otros
// `stardewPredict*.test.ts`; acá, que la entrada llegue bien a cada una y que no salga nada roto (NaN, fechas que no
// existen).
import { describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/predict.json";
import type { PredictData } from "../src/stardew/predict/query";
import {
  addDays,
  cleanSeed,
  dailyLuck,
  fortuneKeys,
  GEODE_KINDS,
  geodesFor,
  predictAll,
  readManual,
  saveFlags,
  weddingDaysPlayed,
  writeManual,
  type PredictInput,
} from "../src/stardew/predict/input";
import { predictGeodes } from "../src/stardew/predict/geodes";
import { daysPlayed } from "../src/stardew/predict/rng";
import type { PredictFarmer, SavePredict } from "../src/stardew/save/parse";

const data = raw as unknown as PredictData;

const granjero = (o: Partial<PredictFarmer> = {}): PredictFarmer => ({
  name: "Fulana",
  host: true,
  uid: "-6368268736843601728",
  uidHalf: 85660768,
  geodesCracked: 31,
  mysteryBoxesOpened: 2,
  deepestMineLevel: 45,
  fishingLevel: 4,
  mastery0: 0,
  bookMystery: 0,
  mail: [],
  spouse14: [],
  mailReceived: [],
  mailTomorrow: [],
  recipes: [],
  specialCharm: false,
  ...o,
});

const partida = (o: Partial<SavePredict> = {}): SavePredict => ({
  gameId: 452435081,
  legacy: false,
  daysPlayed: daysPlayed(2, 10, 2),
  dailyLuck: 0.05,
  weatherTomorrow: "Rain",
  lowestMineLevel: 45,
  multiplayer: false,
  visitsUntilY1Guarantee: -1,
  farmers: [granjero()],
  qiBeans: false,
  goldenCoconutCracked: false,
  weddings: [],
  ...o,
});

const conPartida = (s = partida(), farmer = 0): PredictInput => ({ from: "save", save: s, farmer, season: 2, day: 10, year: 2 });
const aMano: PredictInput = { from: "manual", seed: { gameId: 452435081, legacy: false }, season: 1, day: 10, year: 2 };

/** Ningún número de la predicción es NaN ni infinito. */
const sinNaN = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === "number" && !Number.isFinite(v) ? `ROTO:${v}` : v));

describe("readManual / writeManual", () => {
  it("la semilla se limpia de espacios y ceros adelante; la fecha es p<estación>-<día>-<año>", () => {
    expect(readManual("?seed=%20000452435081&day=p0-2-1")).toEqual({ seed: { gameId: 452435081, legacy: false }, season: 0, day: 2, year: 1 });
    expect(readManual("?semilla=12&dia=p1-15-2&legacy=1")).toEqual({ seed: { gameId: 12, legacy: true }, season: 1, day: 15, year: 2 });
  });

  it("semilla vacía, con letras o de 11 dígitos", () => {
    expect(readManual("?seed=abc")).toEqual({ error: "bad" });
    expect(readManual("?seed=")).toEqual({ error: "empty" });
    expect(readManual("?seed=%20%20")).toEqual({ error: "empty" });
    expect(readManual("?seed=12345678901")).toEqual({ error: "bad" });
    expect(readManual("?seed=1234567890")).toMatchObject({ seed: { gameId: 1234567890 } });
    expect(readManual("?seed=-5")).toEqual({ error: "bad" });
    expect(cleanSeed("0000")).toBe(0);
  });

  it("sin semilla, null; una fecha que no existe queda en el 1 de primavera del año 1", () => {
    expect(readManual("")).toBeNull();
    expect(readManual("?day=p1-2-1")).toBeNull();
    for (const d of ["p4-1-1", "p0-29-1", "p0-0-1", "p0-1-0", "otoño"]) {
      expect(readManual(`?seed=7&day=${d}`), d).toMatchObject({ season: 0, day: 1, year: 1 });
    }
  });

  it("writeManual escribe los nombres del idioma y vuelve a leerse igual", () => {
    const m = { seed: { gameId: 452435081, legacy: true }, season: 3 as const, day: 28, year: 3 };
    expect(writeManual(m, "en")).toBe("?seed=452435081&day=p3-28-3&legacy=1");
    expect(writeManual(m, "es")).toBe("?semilla=452435081&dia=p3-28-3&legacy=1");
    expect(readManual(writeManual(m, "es"))).toEqual(m);
    expect(writeManual({ ...m, seed: { gameId: 5, legacy: false } }, "en")).toBe("?seed=5&day=p3-28-3");
  });
});

describe("la partida", () => {
  it("saveFlags: el correo del anfitrión y del granjero que mira cada predicción", () => {
    const host = granjero({
      mailReceived: ["ccBoilerRoom", "ccCraftsRoom", "ccPantry", "ccFishTank", "ccVault", "ccBulletin", "Got_Capsule"],
      mail: ["VisitedQuarryMine"],
    });
    const peon = granjero({ host: false, name: "Mengano", mailReceived: ["ccPantry", "sawQiPlane", "gotFirstBillboardPrizeTicket"] });
    const s = partida({ farmers: [host, peon], multiplayer: true });
    expect(saveFlags(s, 0)).toEqual({
      ccComplete: true, jojaComplete: false, desertOpen: true, quarry: true, gotCapsule: true, raccoonTreeFallen: false,
      ccPantry: true, sawQiPlane: false, billboardTicket: true,
    });
    expect(saveFlags(s, 1)).toMatchObject({ ccPantry: true, sawQiPlane: true, quarry: true });
    // La cantera no abre si el correo del cuarto llega mañana.
    expect(saveFlags(partida({ farmers: [granjero({ ...host, mailTomorrow: ["ccCraftsRoom"] })] }), 0).quarry).toBe(false);
    // Con JojaMember el Centro no cuenta como terminado; la ruta de Joja sí.
    const joja = granjero({ mailReceived: ["JojaMember", "jojaVault", "ccVault", "jojaPantry", "jojaBoilerRoom", "jojaCraftsRoom", "jojaFishTank"] });
    expect(saveFlags(partida({ farmers: [joja] }), 0)).toMatchObject({ ccComplete: false, jojaComplete: true, desertOpen: true });
  });

  it("weddingDaysPlayed: la boda cae el primer día sin festival ni lluvia verde desde su fecha", () => {
    const seed = { gameId: 452435081, legacy: false };
    const hoy = { season: 0 as const, day: 10, year: 1, daysPlayed: daysPlayed(0, 10, 1) };
    expect(weddingDaysPlayed([{ season: 0, day: 12, year: 1, roommate: false }], hoy, seed, data)).toEqual([daysPlayed(0, 12, 1)]);
    // El 13 de primavera es el festival del huevo: pasa al 14.
    expect(weddingDaysPlayed([{ season: 0, day: 13, year: 1, roommate: false }], hoy, seed, data)).toEqual([daysPlayed(0, 14, 1)]);
    // Una fecha ya pasada (comprometidos todavía): mañana.
    expect(weddingDaysPlayed([{ season: 0, day: 3, year: 1, roommate: false }], hoy, seed, data)).toEqual([daysPlayed(0, 11, 1)]);
  });

  it("la suerte: el amuleto suma 0,025 (float) y la frase de la tele sigue los umbrales del juego", () => {
    expect(dailyLuck(0, true)).toBeCloseTo(0.025, 6);
    expect(dailyLuck(0.19, true)).toBeCloseTo(0.2, 6);
    expect(fortuneKeys(0, 0)).toEqual(["13201"]);
    expect(fortuneKeys(-0.12, -0.12)).toEqual(["13191"]);
    expect(fortuneKeys(-0.1, -0.1)).toEqual(["13192"]);
    expect(fortuneKeys(-0.05, -0.05)).toEqual(["13193", "13195"]);
    expect(fortuneKeys(-0.02, -0.02)).toEqual(["13200"]);
    expect(fortuneKeys(0.12, 0.12)).toEqual(["13197"]);
    expect(fortuneKeys(0.1, 0.1)).toEqual(["13198"]);
    expect(fortuneKeys(0.05, 0.05)).toEqual(["13199"]);
    expect(fortuneKeys(0.02, 0.02)).toEqual(["13200"]);
    for (const k of ["13191", "13192", "13193", "13195", "13197", "13198", "13199", "13200", "13201"]) expect(data.fortune[k], k).toHaveLength(2);
  });
});

describe("predictAll", () => {
  it("con partida: mañana exacto, la suerte, 7 días de Minas, 4 visitas del carro y noches con evento", () => {
    const p = predictAll(conPartida(), data);
    expect(sinNaN(p)).not.toContain("ROTO");
    expect(p.tomorrow).toEqual({ kind: "rain" });
    expect(p.season[0].weather).toEqual({ kind: "rain" });
    expect(p.season).toHaveLength(18);
    expect(p.season[17].date).toEqual({ season: 2, day: 28, year: 2 });
    expect(p.luck).toEqual({ value: 0.05, keys: ["13199"] });
    expect(p.mines).toHaveLength(7);
    expect(p.mines[0].daysPlayed).toBe(daysPlayed(2, 10, 2));
    expect(p.mines[6].date).toEqual({ season: 2, day: 16, year: 2 });
    expect(p.cart).toHaveLength(4);
    for (const v of p.cart) expect(v.items.length).toBeGreaterThan(9);
    // Hoy es el 10 de otoño (mañana no hay festival): el carro viene el viernes 12 y el domingo 14.
    expect(p.cart.map((v) => v.date.day)).toEqual([12, 14, 19, 21]);
    expect(p.nights.every((n) => n.pick !== null)).toBe(true);
    expect(p.used).toMatchObject({ lowestMineLevel: 45, quarry: false, multiplayer: false });
  });

  it("el día de una boda: mañana es Wedding y esa noche no hay evento", () => {
    const p = predictAll(conPartida(partida({ weddings: [{ season: 2, day: 11, year: 2, roommate: false }] })), data);
    expect(p.tomorrow).toEqual({ kind: "wedding" });
    expect(p.used.weddings).toBe(1);
  });

  it("la mudanza de Krobus: sin evento esa noche, pero el clima no pasa a Wedding", () => {
    // Una semilla con evento la noche que lleva al 11 de otoño del año 2, para ver que la mudanza lo saca.
    for (let g = 1; g < 3000; g++) {
      const s = partida({ gameId: g, farmers: [granjero({ mailReceived: ["sawQiPlane"] })] });
      const sin = predictAll(conPartida(s), data, { fairyRose: false });
      if (!sin.nights.some((n) => n.date.day === 11 && n.date.season === 2)) continue;
      const k = predictAll(conPartida({ ...s, weddings: [{ season: 2, day: 11, year: 2, roommate: true }] }), data, { fairyRose: false });
      expect(k.nights.some((n) => n.date.day === 11 && n.date.season === 2)).toBe(false);
      expect(k.tomorrow).toEqual(sin.tomorrow);
      expect(k.tomorrow?.kind).not.toBe("wedding");
      expect(k.season[0].weather.kind).not.toBe("wedding");
      return;
    }
    throw new Error("ninguna semilla con evento esa noche");
  });

  it("la receta del anillo de bodas: sólo en multijugador y no si el granjero ya la sabe", () => {
    const anillo = (s: SavePredict) => predictAll(conPartida(s), data).cart.flatMap((v) => v.items).filter((x) => x.id === "(O)801");
    expect(anillo(partida())).toHaveLength(0);
    expect(anillo(partida({ multiplayer: true })).length).toBeGreaterThan(0);
    expect(anillo(partida({ multiplayer: true, farmers: [granjero({ recipes: ["Wedding Ring"] })] }))).toHaveLength(0);
  });

  it("sin partida: sin mañana exacto ni suerte; el año 1 avisa que la col morada puede cambiar la lista", () => {
    const p = predictAll(aMano, data);
    expect(sinNaN(p)).not.toContain("ROTO");
    expect(p.tomorrow).toBeNull();
    expect(p.luck).toBeNull();
    expect(p.mines).toHaveLength(7);
    expect(p.cart.every((v) => !v.y1Unknown)).toBe(true);
    const y1 = predictAll({ ...aMano, year: 1 }, data);
    expect(y1.cart.every((v) => v.y1Unknown)).toBe(true);
    // El piso 120 elegido a mano trae pisos de hongos en alguno de los días.
    const hondo = predictAll(aMano, data, { manual: { lowest120: true } });
    expect(hondo.used.lowestMineLevel).toBe(120);
    expect(hondo.mines.some((d) => d.mushroom.length > 0)).toBe(true);
    expect(p.mines.every((d) => d.mushroom.length === 0)).toBe(true);
  });

  it("sin saber la rosa de hadas las noches que cambian traen las dos ramas; con la respuesta, no", () => {
    // Una semilla y una fecha cualquiera: se busca alguna con hada en las próximas 14 noches.
    for (let g = 1; g < 400; g++) {
      const input: PredictInput = { ...aMano, seed: { gameId: g, legacy: false }, season: 0, day: 5, year: 1 };
      const p = predictAll(input, data);
      const fork = p.nights.find((n) => typeof n.pick === "object");
      if (!fork) continue;
      expect(predictAll(input, data, { fairyRose: true }).nights.every((n) => typeof n.pick === "string")).toBe(true);
      expect(predictAll(input, data, { fairyRose: false }).nights.every((n) => typeof n.pick === "string")).toBe(true);
      return;
    }
    throw new Error("ninguna semilla con una noche que dependa de la rosa");
  });

  it("el Aceite de ajo cambia sólo los pisos de hoy: los otros días salen como sin ajo", () => {
    const sin = predictAll(aMano, data);
    const con = predictAll(aMano, data, { garlicOil: true });
    expect(con.mines[0].infested).toEqual([]);
    expect(con.mines[0].slime).toEqual([]);
    expect(con.mines.slice(1)).toEqual(sin.mines.slice(1));
    // Alguno de los otros días tiene pisos infestados (si no, el test no diría nada).
    expect(sin.mines.slice(1).some((d) => d.infested.length + d.slime.length > 0)).toBe(true);
  });

  it("el 28 de invierno: la estación no tiene más días y las fechas pasan al año siguiente", () => {
    const p = predictAll({ ...aMano, season: 3, day: 28, year: 1 }, data);
    expect(p.season).toEqual([]);
    expect(p.mines[1].date).toEqual({ season: 0, day: 1, year: 2 });
    expect(addDays({ season: 3, day: 27, year: 1 }, 2)).toEqual({ season: 0, day: 1, year: 2 });
  });
});

describe("geodesFor", () => {
  it("sin partida no hay geodas (hace falta el id del granjero)", () => {
    expect(geodesFor(aMano, data, "535")).toBeNull();
  });

  it("una partida de antes de la 1.3 sin el id del granjero: tampoco (el juego le da uno al azar al cargarla)", () => {
    expect(geodesFor(conPartida(partida({ farmers: [granjero({ uid: "0", uidHalf: 0 })] })), data, "535")).toBeNull();
  });

  it("con partida, las 20 aperturas de cada tipo con el estado del granjero elegido", () => {
    const s = partida({ farmers: [granjero(), granjero({ host: false, uidHalf: 12345, geodesCracked: 0 })] });
    for (const k of GEODE_KINDS) {
      const g = geodesFor(conPartida(s), data, k)!;
      expect(g, k).toHaveLength(20);
      expect(sinNaN(g)).not.toContain("ROTO");
    }
    const del2 = geodesFor(conPartida(s, 1), data, "535")!;
    const esperado = predictGeodes("535", {
      seed: { gameId: 452435081, legacy: false }, uidHalf: 12345, geodesCracked: 0, mysteryBoxesOpened: 2, deepestMineLevel: 45,
      fishingLevel: 4, season: 2, day: 10, mail: [], mastery0: 0, bookMystery: 0, qiBeans: false, goldenCoconutCracked: false,
    }, data, 20);
    expect(del2).toEqual(esperado);
  });
});
