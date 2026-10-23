/**
 * Motor del lector de partida de Stardew (etapa 3, tarea 4): perfección, paquetes, regalos de la semana, lo que falta y
 * "qué hacer hoy". Corre sobre la partida mínima (`fixtures/stardew-save-mini.xml`: 26 de verano del año 2, dos
 * granjeros) y, aparte, sobre una partida real si se pasa `SDV_SAVE=<ruta>`.
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import bundlesJson from "../../games/stardew/data/bundles.json";
import calendarJson from "../../games/stardew/data/calendar.json";
import cropsJson from "../../games/stardew/data/crops.json";
import fishJson from "../../games/stardew/data/fish.json";
import recipesJson from "../../games/stardew/data/recipes.json";
import saveJson from "../../games/stardew/data/save.json";
import villagersJson from "../../games/stardew/data/villagers.json";
import type { CalendarData } from "../src/stardew/calendar/state";
import type { CropsData } from "../src/stardew/crops/calc";
import type { Room, Villager } from "../src/stardew/data";
import type { Fish } from "../src/stardew/fishing/state";
import type { Recipe } from "../src/stardew/recipes/state";
import { parseSave, type Save } from "../src/stardew/save/parse";
import {
  bundleStatus,
  farmerLevel,
  missingFish,
  missingRecipes,
  perfection,
  shownPercent,
  today,
  weekGifts,
  type SaveData,
  type TodayData,
} from "../src/stardew/save/progress";

const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString(s: string, type: string): Document };
const mini = readFileSync(new URL("./fixtures/stardew-save-mini.xml", import.meta.url), "utf8");

const leer = (xml = mini): Save => {
  const s = parseSave(xml, parser);
  if ("error" in s) throw new Error(`no se leyó: ${s.error}`);
  return s;
};

const data = saveJson as unknown as SaveData;
const villagers = villagersJson as unknown as Villager[];
const rooms = bundlesJson as unknown as Room[];
const fish = (fishJson as unknown as { fish: Fish[] }).fish;
const recipes = (recipesJson as unknown as { recipes: Recipe[] }).recipes;
const todayData: TodayData = {
  save: data,
  villagers,
  calendar: calendarJson as unknown as CalendarData,
  crops: cropsJson as unknown as CropsData,
  fish,
  bundles: rooms,
};

/** La misma partida en otra fecha. */
const en = (s: Save, season: 0 | 1 | 2 | 3, day: number, year = s.year): Save => ({ ...s, season, day, year });

describe("perfection", () => {
  const s = leer();
  const p = perfection(s, data);
  const part = (k: string) => p.parts.find((x) => x.key === k)!;

  it("da un total entre 0 y 100, con las once partes del juego y sus pesos", () => {
    expect(p.total).toBeGreaterThan(0);
    expect(p.total).toBeLessThan(100);
    expect(p.parts.map((x) => x.key)).toEqual(data.perfection.map((x) => x.key));
    expect(p.parts.reduce((a, x) => a + x.weight, 0)).toBe(100);
  });

  it("la parte de recetas cuenta la cocinada (conocida y hecha), no las sólo conocidas", () => {
    expect(part("cooking").done).toBe(1);
    expect(part("cooking").total).toBe(data.cooking.length);
    expect(part("cooking").missing).not.toContain("Fried Egg");
    expect(part("cooking").missing).toContain("Omelet");
  });

  it("suma cada parte como Utility.percentGameComplete", () => {
    const esperado =
      (2 / data.shippable.length) * 15 + // 24 y 188
      1 + // obelisco de la tierra (el reloj de oro sigue en obra)
      0 + 0 + // cazador, amigos
      (Math.min(farmerLevel(s.players[0]), 25) / 25) * 5 +
      0 + // frutos estelares
      (1 / data.cooking.length) * 10 +
      (1 / data.crafting.length) * 10 +
      (2 / data.fish.length) * 10 +
      (17 / 130) * 5;
    expect(farmerLevel(s.players[0])).toBe(6);
    expect(p.total).toBeCloseTo(esperado, 6);
    expect(part("clock").missing).toEqual(["Gold Clock"]);
    expect(part("obelisks").done).toBe(1);
    expect(part("obelisks").missing).toEqual(["Water Obelisk", "Desert Obelisk", "Island Obelisk"]);
  });

  it("toma lo mejor de cada granjero: si el segundo pescó más, cuenta el suyo", () => {
    const t = leer();
    t.players[1].fish = { "128": 1, "129": 1, "130": 1 };
    expect(perfection(t, data).parts.find((x) => x.key === "fish")!.done).toBe(3);
  });

  it("frutos estelares: el correo gotMaxStamina los da todos; el cofre del piso 100 vale por CF_Mines", () => {
    const t = leer();
    t.players[0].mail.push("gotMaxStamina");
    const sd = perfection(t, data).parts.find((x) => x.key === "stardrops")!;
    expect(sd.pct).toBe(100);
    expect(sd.missing).toEqual([]);

    const u = leer();
    u.players[0].minesChests.push(100);
    const sd2 = perfection(u, data).parts.find((x) => x.key === "stardrops")!;
    expect(sd2.missing).not.toContain("CF_Mines");
    expect(sd2.missing).not.toContain("CF_Fair");
    expect(sd2.pct).toBe(0);
  });

  it("cazador de monstruos: todas las misiones o nada", () => {
    const t = leer();
    const kills: Record<string, number> = {};
    for (const q of data.slayer) kills[q.targets[0]] = q.count;
    t.players[1].kills = kills;
    const sl = perfection(t, data).parts.find((x) => x.key === "slayer")!;
    expect(sl.pct).toBe(100);
    delete kills[data.slayer[0].targets[0]];
    const sl2 = perfection(t, data).parts.find((x) => x.key === "slayer")!;
    expect(sl2.pct).toBe(0);
  });
});

describe("perfection: de qué granjero sale cada parte", () => {
  it("cada parte dice de quién sale (who): el que más tiene, o el anfitrión si empatan; las de la granja, null", () => {
    const t = leer();
    // El invitado tiene a todos los amigos al máximo; el anfitrión, a nadie.
    t.players[1].friends = Object.fromEntries(
      data.friends.map((f) => [f.key, { points: f.max * 250, giftsWeek: 0, giftToday: false, status: "Friendly" }]),
    );
    t.players[0].friends = {};
    const p = perfection(t, data);
    const part = (k: string) => p.parts.find((x) => x.key === k)!;
    expect(part("friends").who).toBe(1);
    expect(part("friends").missing).toEqual([]);
    // Empate en peces (los dos pescaron lo mismo): el anfitrión.
    t.players[1].fish = { ...t.players[0].fish };
    expect(perfection(t, data).parts.find((x) => x.key === "fish")!.who).toBe(0);
    for (const k of ["obelisks", "clock", "walnuts"]) expect(part(k).who).toBeNull();
  });

  it("en las de sí o no, el primero que la cumple aunque no sea el anfitrión", () => {
    const t = leer();
    const kills: Record<string, number> = {};
    for (const q of data.slayer) kills[q.targets[0]] = q.count;
    t.players[1].kills = kills;
    expect(perfection(t, data).parts.find((x) => x.key === "slayer")!.who).toBe(1);
    // Si nadie la cumple, el anfitrión.
    expect(perfection(leer(), data).parts.find((x) => x.key === "slayer")!.who).toBe(0);
  });
});

describe("shownPercent", () => {
  it("trunca a un decimal: nunca dice 100 sin estarlo", () => {
    expect(shownPercent(99.96)).toBe(99.9);
    expect(shownPercent(99.99999)).toBe(99.9);
    expect(shownPercent(12.38)).toBe(12.3);
    expect(shownPercent(100)).toBe(100);
    // Un 100 que la suma de flotantes deja apenas por debajo sigue siendo 100.
    expect(shownPercent(100 - 1e-12)).toBe(100);
    expect(shownPercent(0)).toBe(0);
  });
});

describe("bundleStatus", () => {
  it("un paquete hecho no aparece como faltante y uno a medias lista sólo lo que le falta", () => {
    const s = leer();
    s.items["20"] = 3;
    const st = bundleStatus(s);
    if (!Array.isArray(st)) throw new Error("esperaba salas");
    const pantry = st.find((r) => r.room === "Pantry")!;
    expect(pantry.bundles.map((b) => [b.index, b.done, b.missing.length])).toEqual([[0, true, 0], [1, true, 0]]);
    const crafts = st.find((r) => r.room === "Crafts Room")!.bundles[0];
    expect(crafts.done).toBe(false);
    expect(crafts.missing).toEqual([["18", 1, 0], ["20", 1, 0], ["22", 1, 0]]);
    expect(crafts.have).toEqual({ "20": 3 });
  });

  it("con joja da \"joja\" y con el Centro terminado \"complete\"", () => {
    expect(bundleStatus({ ...leer(), joja: true })).toBe("joja");
    expect(bundleStatus({ ...leer(), ccComplete: true })).toBe("complete");
  });

  it("sin <bundleData> (antes de la 1.5) usa bundles.json", () => {
    const s = leer();
    // Primavera de bundles.json: Chirivía, Judía verde, Coliflor y Patata; entregó las dos primeras.
    s.bundles = { defs: [], done: { 0: [true, true, false, false, false, false, false, false, false, false, false, false] } };
    const st = bundleStatus(s, rooms);
    if (!Array.isArray(st)) throw new Error("esperaba salas");
    expect(st.map((r) => r.room)).toEqual(rooms.map((r) => r.room));
    const b0 = st.find((r) => r.room === "Pantry")!.bundles.find((b) => b.index === 0)!;
    expect(b0.name).toBe("Spring Crops");
    expect(b0.done).toBe(false);
    expect(b0.missing.map((m) => m[0])).toEqual(["190", "192"]);
    expect(b0.left).toBe(2);
    // Un paquete sin nada entregado lista todo.
    const b1 = st.find((r) => r.room === "Pantry")!.bundles.find((b) => b.index === 1)!;
    expect(b1.missing.length).toBe(rooms[0].bundles[1].items.length);
  });
});

describe("weekGifts", () => {
  it("con la partida en el 26 de verano trae a Penny (2 de otoño) a 4 días, ordenados por cercanía", () => {
    const s = leer();
    const w = weekGifts(s, s.players[0], villagers);
    const penny = w.find((x) => x.key === "Penny")!;
    expect(penny.birthday).toEqual([2, 2]);
    expect(penny.inDays).toBe(4);
    expect(w[0].key).toBe("Leo");
    expect(w[0].inDays).toBe(0);
    expect(w.map((x) => x.inDays)).toEqual([...w.map((x) => x.inDays)].sort((a, b) => a - b));
    expect(w.find((x) => x.key === "Elliott")!.inDays).toBe(7);
    expect(w.some((x) => x.key === "Dwarf")).toBe(false);
  });

  it("el 28 de invierno pasa a la primavera del año siguiente", () => {
    const s = en(leer(), 3, 28);
    const w = weekGifts(s, s.players[0], villagers);
    expect(w.find((x) => x.key === "Kent")).toMatchObject({ birthday: [0, 4], inDays: 4 });
    expect(w.find((x) => x.key === "Lewis")).toMatchObject({ birthday: [0, 7], inDays: 7 });
  });

  it("trae corazones, regalos de la semana y lo que le encanta con cuántos tiene la granja", () => {
    const s = en(leer(), 2, 18);
    s.items["74"] = 2;
    const robin = weekGifts(s, s.players[0], villagers).find((x) => x.key === "Robin")!;
    expect(robin.inDays).toBe(3);
    expect(robin.hearts).toBe(2);
    expect(robin.giftsWeek).toBe(1);
    expect(robin.loved[0]).toEqual({ id: "74", have: 2 });
  });
});

describe("missingFish y missingRecipes", () => {
  it("los peces que faltan, primero los de la estación de la partida", () => {
    const s = leer();
    const m = missingFish(s.players[0], fish, s.season);
    expect(m.some((x) => x.id === "131")).toBe(false);
    const firstOff = m.findIndex((x) => !x.now);
    expect(m.slice(0, firstOff).every((x) => fish.find((f) => f.id === x.id)!.seasons.includes(1))).toBe(true);
    expect(m.slice(firstOff).every((x) => !x.now)).toBe(true);
    expect(m.some((x) => x.id === "898")).toBe(false);
  });

  it("con la colección de save.json suma al final las medusas, que no están en fish.json", () => {
    const s = leer();
    expect(fish.some((f) => f.id === "SeaJelly")).toBe(false);
    s.players[0].fish.CaveJelly = 1;
    const m = missingFish(s.players[0], fish, s.season, data.fish);
    const jellies = m.filter((x) => !fish.some((f) => f.id === x.id));
    expect(jellies).toEqual([
      { id: "SeaJelly", now: false, leaving: false },
      { id: "RiverJelly", now: false, leaving: false },
    ].sort((a, b) => data.fish.indexOf(a.id) - data.fish.indexOf(b.id)));
    expect(m.slice(-jellies.length)).toEqual(jellies);
    expect(m.some((x) => x.id === "131")).toBe(false);
  });

  it("las recetas que faltan, primero las que ya se pueden hacer", () => {
    const s = leer();
    const m = missingRecipes(s.players[0], recipes, data, s);
    const cook = m.filter((x) => x.kind === "cook");
    expect(cook.some((x) => x.key === "Fried Egg")).toBe(false);
    expect(cook[0]).toMatchObject({ key: "Omelet", known: true, now: true });
    expect(m.some((x) => x.kind === "craft" && x.key === "Chest")).toBe(false);
    expect(m.some((x) => x.key === "Wedding Ring")).toBe(false);
  });
});

describe("today", () => {
  it("el día de un cumpleaños lo pone primero, con el regalo que le encanta y tiene", () => {
    const s = leer();
    const leo = villagers.find((v) => v.key === "Leo")!;
    s.items[leo.tastes.love[0]] = 1;
    const t = today(s, s.players[0], todayData);
    expect(t[0].kind).toBe("birthday");
    expect(t[0].ids).toEqual(["Leo", leo.tastes.love[0]]);
  });

  it("el cumpleaños de hoy no sale si ya se le regaló hoy", () => {
    const s = leer();
    s.players[0].friends.Leo = { points: 0, giftsWeek: 1, giftToday: true, status: "Friendly" };
    expect(today(s, s.players[0], todayData).some((x) => x.kind === "birthday")).toBe(false);
    // Al otro granjero, que no le regaló, sí se lo recuerda.
    expect(today(s, s.players[1], todayData).some((x) => x.kind === "birthday")).toBe(true);
  });

  it("el festival de mañana (Danza de las medusas el 28 de verano)", () => {
    const s = en(leer(), 1, 27);
    const f = today(s, s.players[0], todayData).find((x) => x.kind === "festival")!;
    expect(f).toMatchObject({ ids: ["summer28"], when: 1, name: ["Dance of the Moonlight Jellies", "Danza de las medusas lunares"] });
  });

  it("últimos días para plantar: lo que llega si se planta hoy y mañana ya no", () => {
    const s = en(leer(), 0, 24);
    const p = today(s, s.players[0], todayData).find((x) => x.kind === "plant")!;
    // La Chirivía tarda 4 días: plantada el 24 se cosecha el 28; el 25 ya no llega.
    expect(p.ids).toContain("24");
  });

  it("plantar: no da lo que todavía llega si se planta mañana, ni las semillas silvestres", () => {
    const s = en(leer(), 0, 21);
    const p = today(s, s.players[0], todayData).find((x) => x.kind === "plant")!;
    // El 21 es el último día del Jazz azul (7 días); la Chirivía (4) todavía llega el 22.
    expect(p.ids).toContain("597");
    expect(p.ids).not.toContain("24");
    // Las semillas de primavera también tardan 7, pero su cosecha (16) es una de varias al azar.
    expect(p.ids).not.toContain("16");
  });

  it("peces que se van al terminar la estación y objetos de paquetes de la estación", () => {
    const s = leer();
    const t = today(s, s.players[0], todayData);
    const f = t.find((x) => x.kind === "fish")!;
    expect(f.ids).toContain("128"); // el pez globo es sólo de verano
    expect(f.ids).not.toContain("131");
    // Sólo en la última semana de la estación (del 22 al 28).
    const antes = en(leer(), 1, 21);
    expect(today(antes, antes.players[0], todayData).some((x) => x.kind === "fish")).toBe(false);
    const ultimo = en(leer(), 1, 22);
    expect(today(ultimo, ultimo.players[0], todayData).some((x) => x.kind === "fish")).toBe(true);
    const b = t.find((x) => x.kind === "bundle");
    // Los paquetes de esta partida que faltan son de primavera: en verano no hay objetos de la estación.
    expect(b).toBeUndefined();
    const sp = en(leer(), 0, 10);
    // De los que faltan (18, 20, 22), bundles.json marca de primavera sólo el Puerro (20).
    expect(today(sp, sp.players[0], todayData).find((x) => x.kind === "bundle")!.ids).toEqual(["20"]);
    // Si ya tiene uno en los cofres, no se lo recuerda.
    sp.items["20"] = 1;
    expect(today(sp, sp.players[0], todayData).find((x) => x.kind === "bundle")).toBeUndefined();
  });

  it("la Reina de la Salsa el domingo si no conoce la receta, y el carro viernes y domingo", () => {
    const dom = en(leer(), 0, 7, 1);
    const t = today(dom, dom.players[0], todayData);
    expect(t.find((x) => x.kind === "tv")).toMatchObject({ ids: [data.queenOfSauce["1"]] });
    expect(t.some((x) => x.kind === "cart")).toBe(true);
    const vie = en(leer(), 0, 5, 1);
    expect(today(vie, vie.players[0], todayData).some((x) => x.kind === "cart")).toBe(true);
    const lun = en(leer(), 0, 1, 1);
    const tl = today(lun, lun.players[0], todayData);
    expect(tl.some((x) => x.kind === "cart" || x.kind === "tv")).toBe(false);
  });

  it("respeta el orden de las reglas", () => {
    const orden = ["birthday", "festival", "plant", "fish", "bundle", "tv", "cart"];
    const s = en(leer(), 1, 28);
    const t = today(s, s.players[0], todayData).map((x) => orden.indexOf(x.kind));
    expect(t).toEqual([...t].sort((a, b) => a - b));
  });
});

describe("una partida real", () => {
  it.skipIf(!process.env.SDV_SAVE)("la perfección da un número entre 0 y 100 sin NaN (SDV_SAVE)", () => {
    const s = parseSave(readFileSync(process.env.SDV_SAVE!, "utf8"), parser) as Save;
    expect("error" in s).toBe(false);
    const p = perfection(s, data);
    console.log(
      `perfección de la partida real: ${p.total.toFixed(2)} %`,
      p.parts.map((x) => `${x.key} ${x.done}/${x.total}`).join(", "),
    );
    expect(Number.isNaN(p.total)).toBe(false);
    expect(p.total).toBeGreaterThanOrEqual(0);
    expect(p.total).toBeLessThanOrEqual(100);
    for (const x of p.parts) expect(Number.isFinite(x.pct)).toBe(true);
    const st = bundleStatus(s, rooms);
    expect(st === "joja" || st === "complete" || Array.isArray(st)).toBe(true);
    expect(Array.isArray(today(s, s.players[0], todayData))).toBe(true);
  });
});
