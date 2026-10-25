/**
 * Lector del archivo de partida de Stardew (etapa 3, tarea 3). Corre sobre la partida mínima escrita a mano
 * (`fixtures/stardew-save-mini.xml`, con la forma de una de 1.6) y, aparte, sobre una partida real si se pasa
 * `SDV_SAVE=<ruta>` (no se sube ninguna al repo: tienen datos de una persona).
 *
 * Node no trae `DOMParser`: los tests le pasan el de `@xmldom/xmldom`; en el navegador se usa el nativo.
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import bundlesJson from "../../games/stardew/data/bundles.json";
import { parseSave, type Save, type SaveError } from "../src/stardew/save/parse";

// Sin onError, xmldom escribe cada error en la consola; los fatales igual tiran ParseError.
const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString(s: string, type: string): Document };
const mini = readFileSync(new URL("./fixtures/stardew-save-mini.xml", import.meta.url), "utf8");

const leer = (xml: string): Save => {
  const s = parseSave(xml, parser);
  if ("error" in s) throw new Error(`no se leyó: ${s.error}`);
  return s;
};

describe("parseSave: la partida mínima", () => {
  const s = leer(mini);

  it("lee la versión, la granja, la fecha y el clima", () => {
    expect(s.version).toBe("1.6.15");
    expect(s.farm).toBe("Los Sauces");
    expect(s.season).toBe(1);
    expect(s.day).toBe(26);
    expect(s.year).toBe(2);
    expect(s.raining).toBe(true);
    expect(s.weatherTomorrow).toBe("Sun");
    expect(s.walnuts).toBe(17);
  });

  it("trae a los dos granjeros, el anfitrión primero, y salta las cabañas sin dueño", () => {
    expect(s.players.map((p) => [p.name, p.host])).toEqual([["Fulana", true], ["Mengano", false]]);
  });

  it("lee las habilidades, los envíos, los peces y las recetas de cada uno", () => {
    const [a, b] = s.players;
    expect(a.skills).toEqual([4, 2, 2, 3, 1, 0]);
    expect(a.shipped).toEqual({ "24": 15, "188": 2 });
    expect(a.fish).toEqual({ "131": 4, "145": 1 });
    expect(a.cooking).toEqual(["Fried Egg", "Omelet"]);
    expect(a.cooked).toEqual({ "194": 3 });
    expect(a.crafting).toEqual({ Chest: 2, Torch: 0 });
    expect(b.fish).toEqual({ "131": 1 });
    expect(b.cooking).toEqual(["Fried Egg"]);
    expect(b.crafting).toEqual({});
  });

  it("el correo junta lo recibido, lo del buzón y lo de mañana", () => {
    expect(s.players[0].mail.sort()).toEqual(["CF_Fair", "CF_Fish", "Robin_Introduction", "spring_2_1"]);
  });

  it("lee la amistad: puntos, regalos de la semana y de hoy", () => {
    expect(s.players[0].friends.Robin).toEqual({ points: 520, giftsWeek: 1, giftToday: true, status: "Friendly" });
    expect(s.players[0].friends.Linus).toEqual({ points: 80, giftsWeek: 0, giftToday: false, status: "Friendly" });
    expect(s.players[1].friends.Robin.points).toBe(30);
  });

  it("lee los monstruos muertos y los cofres de las minas ya abiertos", () => {
    expect(s.players[0].kills).toEqual({ "Green Slime": 12, Bat: 3 });
    expect(s.players[1].kills).toEqual({});
    expect(s.players[0].minesChests).toEqual([10, 20]);
  });

  it("normaliza los ids: sin (O) en objetos, con el prefijo en el resto", () => {
    expect(s.players[0].inventory).toEqual({ "(T)Pickaxe": 1, "24": 7, "(BC)13": 1 });
    expect(s.players[1].inventory).toEqual({ "24": 3, "(W)0": 1 });
  });

  it("suma los objetos de los inventarios y de todos los cofres (granja, casa, heladera, Junimo)", () => {
    expect(s.items).toEqual({
      "(T)Pickaxe": 1, "(BC)13": 1, "(W)0": 1,
      "24": 7 + 3 + 10, "388": 99 + 1 + 5, "516": 1, "421": 2, "176": 4,
    });
  });

  it("los edificios terminados, en todos los lugares", () => {
    expect(s.buildings.sort()).toEqual(["Earth Obelisk", "Farmhouse", "Log Cabin"]);
  });

  it("los paquetes salen de <bundleData> de la partida aunque difieran de bundles.json", () => {
    expect(s.bundles.defs).toEqual([
      { room: "Pantry", index: 0, name: "Spring Crops", items: [["24", 1, 0], ["188", 1, 0], ["192", 1, 0]], need: 3 },
      { room: "Pantry", index: 1, name: "Summer Crops", items: [["256", 1, 0], ["260", 1, 0]], need: 2 },
      { room: "Crafts Room", index: 2, name: "Spring Foraging",
        items: [["16", 1, 0], ["18", 1, 0], ["20", 1, 0], ["22", 1, 0]], need: 4 },
    ]);
    const deJson = bundlesJson.find((r) => r.room === "Pantry")!.bundles.find((b) => b.index === 0)!;
    expect(deJson.items.length).not.toBe(s.bundles.defs[0].items.length);
    expect(s.bundles.done[0].every(Boolean)).toBe(true);
    expect(s.bundles.done[1].every(Boolean)).toBe(true);
    expect(s.bundles.done[2].slice(0, 4)).toEqual([true, false, false, false]);
  });

  it("sin JojaMember ni ccIsComplete: ni Joja ni Centro terminado", () => {
    expect(s.joja).toBe(false);
    expect(s.ccComplete).toBe(false);
  });
});

describe("parseSave: casos especiales", () => {
  it("JojaMember en el correo da joja: true", () => {
    const s = leer(mini.replace("<string>CF_Fair</string>", "<string>CF_Fair</string><string>JojaMember</string>"));
    expect(s.joja).toBe(true);
    expect(s.ccComplete).toBe(false);
  });

  it("ccIsComplete en el correo da ccComplete: true", () => {
    expect(leer(mini.replace("<string>CF_Fair</string>", "<string>ccIsComplete</string>")).ccComplete).toBe(true);
  });

  it("el SaveGameInfo (raíz <Farmer>) da save-info", () => {
    const info = `﻿<?xml version="1.0" encoding="utf-8"?><Farmer xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><name>X</name></Farmer>`;
    expect(parseSave(info, parser)).toEqual<SaveError>({ error: "save-info" });
  });

  it("un texto cualquiera da not-xml", () => {
    expect(parseSave("hola, esto no es una partida", parser)).toEqual<SaveError>({ error: "not-xml" });
    expect(parseSave("", parser)).toEqual<SaveError>({ error: "not-xml" });
    expect(parseSave("<SaveGame><player>", parser)).toEqual<SaveError>({ error: "not-xml" });
  });

  it("un XML que no es una partida da not-save", () => {
    expect(parseSave(`<?xml version="1.0"?><Otra><a>1</a></Otra>`, parser)).toEqual<SaveError>({ error: "not-save" });
  });

  it("sin <gameVersion> deduce la versión por las marcas de actualización y pasa el clima viejo (número) a nombre", () => {
    const sin = mini.replace(/<gameVersion>[^<]*<\/gameVersion>/g, "");
    expect(leer(sin).version).toBe("<1.3");
    expect(leer(sin.replace("<currentSeason>", "<hasApplied1_3_UpdateChanges>true</hasApplied1_3_UpdateChanges><currentSeason>")).version).toBe("1.3");
    expect(leer(sin.replace("<weatherForTomorrow>Sun", "<weatherForTomorrow>1")).weatherTomorrow).toBe("Rain");
    expect(leer(sin.replace("<currentSeason>", "<hasApplied1_4_UpdateChanges>true</hasApplied1_4_UpdateChanges><currentSeason>")).version).toBe("1.4");
  });
});

describe("parseSave: arreglos de la revisión", () => {
  it("una <SaveGame> sin <player> da not-save", () => {
    const sin = mini.replace(/<player>[\s\S]*<\/player>/, "");
    expect(parseSave(sin, parser)).toEqual<SaveError>({ error: "not-save" });
  });

  it("<parsererror> como raíz (Firefox) o al principio de la raíz (Chrome) da not-xml; uno hondo no", () => {
    expect(parseSave(`<parsererror>mal</parsererror>`, parser)).toEqual<SaveError>({ error: "not-xml" });
    const chrome = mini.replace("<player>", "<parsererror>mal</parsererror><player>");
    expect(parseSave(chrome, parser)).toEqual<SaveError>({ error: "not-xml" });
    const hondo = mini.replace("<name>Farm</name>", "<name>Farm</name><parsererror>no es del lector</parsererror>");
    expect("error" in parseSave(hondo, parser)).toBe(false);
  });

  it("la versión -1 del granjero (el valor por defecto) se ignora", () => {
    const sin = mini
      .replace(/<gameVersion>1\.6\.15<\/gameVersion>\s*<\/SaveGame>/, "</SaveGame>")
      .replace("<gameVersion>1.6.15</gameVersion>", "<gameVersion>-1</gameVersion>");
    expect(leer(sin).version).toBe("<1.3");
  });

  it("la caja de envíos chica no es un cofre: no se suma", () => {
    const caja = mini.replace(
      "<name>Farm</name>",
      `<name>Farm</name><objects><item><key><Vector2><X>1</X><Y>1</Y></Vector2></key><value>
        <Object xsi:type="Chest"><name>Mini-Shipping Bin</name><itemId>248</itemId><bigCraftable>true</bigCraftable>
        <items><Item xsi:type="Object"><itemId>388</itemId><stack>50</stack></Item></items>
        <specialChestType>MiniShippingBin</specialChestType></Object></value></item></objects>`,
    );
    expect(leer(caja).items["388"]).toBe(105);
  });

  it("antes de la 1.6, suma el <junimoChest> de la raíz", () => {
    const vieja = mini.replace(
      "<weatherForTomorrow>",
      `<junimoChest><Item xsi:type="Object"><parentSheetIndex>388</parentSheetIndex><Stack>8</Stack></Item></junimoChest><weatherForTomorrow>`,
    );
    expect(leer(vieja).items["388"]).toBe(113);
  });
});

describe("parseSave: una partida real", () => {
  it.skipIf(!process.env.SDV_SAVE)("la lee sin error y en menos de 2 s (SDV_SAVE)", () => {
    const xml = readFileSync(process.env.SDV_SAVE!, "utf8");
    const t0 = performance.now();
    const s = parseSave(xml, parser);
    const ms = performance.now() - t0;
    console.log(`partida real: ${(xml.length / 1e6).toFixed(1)} MB en ${ms.toFixed(0)} ms`);
    expect("error" in s).toBe(false);
    const save = s as Save;
    expect(save.players.length).toBeGreaterThan(0);
    expect(save.players[0].host).toBe(true);
    expect(save.day).toBeGreaterThanOrEqual(1);
    // `<bundleData>` existe desde la 1.5: antes los paquetes salen de bundles.json.
    if (save.version.startsWith("1.6")) expect(save.bundles.defs.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });
});

describe("parseSave: lo que lee el predictor", () => {
  // Con la forma de una partida 1.6.15 real: id de granjero largo, semilla, suerte y contadores en Values.
  const conPredict = mini
    .replace("<name>Fulana</name>", "<name>Fulana</name><UniqueMultiplayerID>-6368268736843601728</UniqueMultiplayerID><fishingLevel>7</fishingLevel>")
    .replace(
      /<stats xmlns:xsi="[^"]*">/,
      `<stats xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Values>
        <item><key><string>daysPlayed</string></key><value><unsignedInt>2</unsignedInt></value></item>
        <item><key><string>geodesCracked</string></key><value><unsignedInt>31</unsignedInt></value></item>
        <item><key><string>MysteryBoxesOpened</string></key><value><unsignedInt>12</unsignedInt></value></item>
        <item><key><string>mastery_0</string></key><value><unsignedInt>1</unsignedInt></value></item>
        <item><key><string>Book_Mystery</string></key><value><unsignedInt>1</unsignedInt></value></item>
      </Values>`,
    )
    .replace("<year>2</year>", "<year>2</year><dailyLuck>-0.012</dailyLuck><uniqueIDForThisGame>452435081</uniqueIDForThisGame><useLegacyRandom>false</useLegacyRandom><visitsUntilY1Guarantee>-1</visitsUntilY1Guarantee><mine_lowestLevelReached>45</mine_lowestLevelReached><specialOrders><SpecialOrder><specialRule>QI_BEANS, DROP_QI_BEANS</specialRule><questState>InProgress</questState></SpecialOrder></specialOrders>");

  it("lee la semilla, la suerte, el piso más hondo y el clima de mañana", () => {
    const p = leer(conPredict).predict!;
    expect(p.gameId).toBe(452435081);
    expect(p.legacy).toBe(false);
    expect(p.dailyLuck).toBe(-0.012);
    expect(p.lowestMineLevel).toBe(45);
    expect(p.visitsUntilY1Guarantee).toBe(-1);
    expect(p.weatherTomorrow).toBe("Sun");
    expect(p.daysPlayed).toBe(2);
    expect(p.multiplayer).toBe(true);
  });

  it("lowestMineLevel usa mine_lowestLevelReachedForOrder si es >= 0 y, si es negativo, mine_lowestLevelReached", () => {
    const forOrder = (n: number) =>
      conPredict.replace("<mine_lowestLevelReached>45</mine_lowestLevelReached>", `<mine_lowestLevelReached>45</mine_lowestLevelReached><mine_lowestLevelReachedForOrder>${n}</mine_lowestLevelReachedForOrder>`);
    expect(leer(forOrder(-1)).predict!.lowestMineLevel).toBe(45);
    expect(leer(forOrder(30)).predict!.lowestMineLevel).toBe(30);
    expect(leer(forOrder(0)).predict!.lowestMineLevel).toBe(0);
  });

  it("uidHalf es (int)uid / 2: los 32 bits bajos con signo, truncando hacia cero", () => {
    const f = leer(conPredict).predict!.farmers[0];
    expect(f.uid).toBe("-6368268736843601728");
    expect(f.uidHalf).toBe(85660768);
    // Un id cuyos 32 bits bajos son negativos e impares: -3 / 2 trunca a -1, no a -2.
    const impar = conPredict.replace("-6368268736843601728", "4294967293");
    expect(leer(impar).predict!.farmers[0].uidHalf).toBe(-1);
  });

  it("lee los contadores del anfitrión (las claves de Values no distinguen mayúsculas)", () => {
    const f = leer(conPredict).predict!.farmers[0];
    expect(f).toMatchObject({
      name: "Fulana", host: true, geodesCracked: 31, mysteryBoxesOpened: 12, mastery0: 1, bookMystery: 1,
      fishingLevel: 7, deepestMineLevel: 0,
    });
    expect(f.mail).toEqual(leer(conPredict).players[0].mail);
  });

  it("los granjeros sin id ni contadores quedan en cero", () => {
    const g = leer(conPredict).predict!.farmers[1];
    expect(g).toMatchObject({ name: "Mengano", host: false, uid: "0", uidHalf: 0, geodesCracked: 0, mastery0: 0 });
  });

  it("qiBeans: sólo con un encargo en curso cuya regla incluya DROP_QI_BEANS", () => {
    expect(leer(conPredict).predict!.qiBeans).toBe(true);
    expect(leer(conPredict.replace("<questState>InProgress", "<questState>Complete")).predict!.qiBeans).toBe(false);
    expect(leer(conPredict.replace("QI_BEANS, DROP_QI_BEANS", "QI_BEANS")).predict!.qiBeans).toBe(false);
    expect(leer(mini).predict!.qiBeans).toBe(false);
  });

  it("goldenCoconutCracked: la etiqueta de la raíz; sin ella, false", () => {
    expect(leer(conPredict).predict!.goldenCoconutCracked).toBe(false);
    const abierto = conPredict.replace("<year>2</year>", "<year>2</year><goldenCoconutCracked>true</goldenCoconutCracked>");
    expect(leer(abierto).predict!.goldenCoconutCracked).toBe(true);
    const cerrado = conPredict.replace("<year>2</year>", "<year>2</year><goldenCoconutCracked>false</goldenCoconutCracked>");
    expect(leer(cerrado).predict!.goldenCoconutCracked).toBe(false);
  });

  it("spouse14: aldeanos con 3500 puntos o más", () => {
    const rica = conPredict.replace("<Points>520</Points>", "<Points>3500</Points>");
    expect(leer(rica).predict!.farmers[0].spouse14).toEqual(["Robin"]);
    expect(leer(conPredict).predict!.farmers[0].spouse14).toEqual([]);
  });

  it("antes de la 1.6 los contadores salen de las etiquetas sueltas del <stats> de la raíz", () => {
    // El anfitrión de una partida vieja no trae <stats> propio: usa el de la raíz.
    const sinPropio = mini.replace(/(<player>[\s\S]*?)<stats[\s\S]*?<\/stats>/, "$1").replace("<year>2</year>", "<year>2</year><stats><geodesCracked>77</geodesCracked><daysPlayed>40</daysPlayed></stats>");
    const p = leer(sinPropio).predict!;
    expect(p.farmers[0].geodesCracked).toBe(77);
    expect(p.daysPlayed).toBe(40);
  });
});

describe("parseSave: lo que suma la pestaña Predictor (tarea 7)", () => {
  it("separa el correo recibido del que llega mañana (sin la marca %&NL&%)", () => {
    const f = leer(mini).predict!.farmers[0];
    expect(f.mailReceived).toEqual(["Robin_Introduction", "CF_Fair"]);
    expect(f.mailTomorrow).toEqual(["CF_Fish"]);
    // `mail` sigue siendo todo junto (recibido, buzón y mañana).
    expect(f.mail).toEqual(expect.arrayContaining(["Robin_Introduction", "CF_Fish", "spring_2_1"]));
  });

  it("recipes: las de fabricación y las de cocina que sabe", () => {
    expect(leer(mini).predict!.farmers[0].recipes).toEqual(["Chest", "Torch", "Fried Egg", "Omelet"]);
    expect(leer(mini).predict!.farmers[1].recipes).toEqual(["Fried Egg"]);
  });

  it("specialCharm: en la 1.6 es el correo HasSpecialCharm; la etiqueta vieja también vale; sin nada, false", () => {
    expect(leer(mini).predict!.farmers[0].specialCharm).toBe(false);
    const correo = mini.replace("<string>CF_Fair</string>", "<string>CF_Fair</string><string>HasSpecialCharm</string>");
    expect(leer(correo).predict!.farmers[0].specialCharm).toBe(true);
    // Sólo para mañana no cuenta (`hasSpecialCharm` mira `mailReceived`).
    const manana = mini.replace("<string>CF_Fish%&amp;NL&amp;%</string>", "<string>HasSpecialCharm</string>");
    expect(leer(manana).predict!.farmers[0].specialCharm).toBe(false);
    const con = mini.replace("<farmName>Los Sauces</farmName>", "<farmName>Los Sauces</farmName><hasSpecialCharm>true</hasSpecialCharm>");
    expect(leer(con).predict!.farmers[0].specialCharm).toBe(true);
  });

  it("weddings: la fecha de cada compromiso, con aldeanos y entre granjeros", () => {
    expect(leer(mini).predict!.weddings).toEqual([]);
    const novia = mini.replace(
      /<Status>Friendly<\/Status>(\s*<Proposer>)/,
      "<Status>Engaged</Status><WeddingDate><Year>2</Year><DayOfMonth>9</DayOfMonth><Season>summer</Season></WeddingDate>$1",
    );
    expect(leer(novia).predict!.weddings).toEqual([{ season: 1, day: 9, year: 2, roommate: false }]);
    // Krobus de compañero de cuarto: la mudanza también es un compromiso, marcado.
    const krobus = novia.replace("<RoommateMarriage>false</RoommateMarriage>", "<RoommateMarriage>true</RoommateMarriage>");
    expect(leer(krobus).predict!.weddings).toEqual([{ season: 1, day: 9, year: 2, roommate: true }]);
    const granjeros = mini.replace(
      "<farmhands>",
      `<farmerFriendships><item><key><FarmerPair><Farmer1>1</Farmer1><Farmer2>2</Farmer2></FarmerPair></key><value><Friendship><Points>0</Points><Status>Engaged</Status><WeddingDate><Year>1</Year><DayOfMonth>3</DayOfMonth><Season>fall</Season></WeddingDate></Friendship></value></item></farmerFriendships><farmhands>`,
    );
    expect(leer(granjeros).predict!.weddings).toEqual([{ season: 2, day: 3, year: 1, roommate: false }]);
    // Ya casados: la fecha queda guardada pero no hay boda por venir.
    const casada = novia.replace("<Status>Engaged</Status>", "<Status>Married</Status>");
    expect(leer(casada).predict!.weddings).toEqual([]);
  });
});
