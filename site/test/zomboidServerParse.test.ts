/**
 * "Pegá tu archivo" del generador de servidor de Project Zomboid (2026-10-01): el lector seguro de `SandboxVars.lua`
 * (`parseSandboxLua`, un tokenizador a mano que nunca ejecuta nada), el del `.ini` (`parseIni`), cuál de los dos es
 * (`fileKind`) y cómo se vuelve una configuración (`fromParsed`, `nearestPreset`). Con el `server.json` real y archivos
 * con trampas: el `SandboxVars.lua` del juego (un `require`), el formato viejo de `SixMonthsLater.lua` (un `tonumber`),
 * un servidor con mods y un intento de ejecutar código.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import OptionRow from "../src/zomboid/server/OptionRow";
import ZomboidServer from "../src/zomboid/server/ZomboidServer";
import { fromParsed, fromPreset, nearestPreset, sandboxChanges, type Config } from "../src/zomboid/server/config";
import { fullPreset, INI_DEFAULTS, SERVER } from "../src/zomboid/server/data";
import { parseIni, writeIni } from "../src/zomboid/server/ini";
import { fileKind, parseSandboxLua, writeSandboxLua } from "../src/zomboid/server/lua";

/**
 * Un pedazo de `media/lua/shared/Sandbox/SixMonthsLater.lua` de la 42.21, tal cual (con sus tabs, los renglones
 * comentados y el `tonumber(...)` de la población): el formato de antes de la Build 42, que el juego todavía trae.
 */
const SIX_MONTHS = `return {
    VERSION = 5,
    Zombies = 1,
    Distribution = 1,
    DayLength = 3,
    StartYear = 1,
    StartMonth = 12,
    StartDay = 9,
    StartTime = 2,
    WaterShut = 1,
    ElecShut = 1,
    WaterShutModifier = -1,
    ElecShutModifier = -1,
--     FoodLoot = 4,
--     CannedFoodLoot = 4,
    LootItemRemovalList = "",
    Temperature = 3,
    ErosionDays = 0,
    XpMultiplier = 1.0,
    ZombieAttractionMultiplier = 1.0,
	-- please ensure that Base.Maggots stays in the list with any future changes due to corpse maggots,
    WorldItemRemovalList = "Base.Hat,Base.Glasses,Base.Maggots,Base.Slug,Base.Slug2,Base.Snail,Base.Worm,Base.Dung_Mouse,Base.Dung_Rat",
    HoursForWorldItemRemoval = 24.0,
    TimeSinceApo = 7,
    GeneratorFuelConsumption = 0.1,
    EnablePoisoning = 1,
	MaggotSpawn = 1,
    Map = {
        AllowMiniMap = false,
        AllowWorldMap = true,
        MapAllKnown = false,
    },
    ZombieLore = {
        Speed = 2,
		DisableFakeDead = 1,
        FenceThumpersRequired = 50,
    },
    ZombieConfig = {
        PopulationMultiplier = tonumber(ZombiePopulationMultiplier.VeryHigh),
        PopulationStartMultiplier = tonumber(ZombiePopulationStartMultiplier.VeryHigh),
        PopulationPeakDay = 5,
        RespawnHours = 72.0,
        RallyGroupRadius = 10,
    },
}
`;

/** El renglón (desde 1) donde aparece `needle` por primera vez. */
const lineOf = (text: string, needle: string): number => text.slice(0, text.indexOf(needle)).split("\n").length;

describe("parseSandboxLua: lo que escribe el generador vuelve igual", () => {
  for (const id of ["extinction", "apocalypse", "six-months-later"] as const) {
    it(`${id}, en español y en inglés: los valores de las 269 y ningún aviso`, () => {
      for (const lang of ["es", "en"] as const) {
        const r = parseSandboxLua(writeSandboxLua(fromPreset(id), lang));
        expect(r.ok).toBe(true);
        expect(r.wrapper).toBe("SandboxVars");
        expect(r.version).toBe(SERVER.version);
        expect(r.issues).toEqual([]);
        expect(r.extra).toEqual([]);
        expect(r.values).toEqual({ ...fullPreset(id) });
      }
    });
  }

  it("textos con comillas, barras y comillas simples sobreviven ida y vuelta", () => {
    const c: Config = { ...fromPreset("apocalypse") };
    c.sandbox = { ...c.sandbox, LootItemRemovalList: 'Base.A,"raro"\\Base.B\'s' };
    const r = parseSandboxLua(writeSandboxLua(c, "en"));
    expect(r.values.LootItemRemovalList).toBe('Base.A,"raro"\\Base.B\'s');
    expect(r.issues).toEqual([]);
  });
});

describe("parseSandboxLua: archivos con trampas", () => {
  it("el SandboxVars.lua del juego (un require): ok false, syntax en el renglón 1, sin tirar", () => {
    const r = parseSandboxLua('SandboxVars = require "Sandbox/Apocalypse"\n\ngetSandboxOptions():initSandboxVars()');
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ kind: "syntax", line: 1 });
    expect(r.values).toEqual({});
  });

  it("el formato viejo (SixMonthsLater.lua): el tonumber es un syntax en su renglón y el resto se lee", () => {
    const r = parseSandboxLua(SIX_MONTHS);
    expect(r.ok).toBe(true);
    expect(r.wrapper).toBe("return");
    expect(r.version).toBe(5);
    expect(r.values.TimeSinceApo).toBe(7);
    expect(r.values.Zombies).toBe(1);
    expect(r.values.WaterShutModifier).toBe(-1);
    expect(r.values.HoursForWorldItemRemoval).toBe(24);
    expect(r.values.GeneratorFuelConsumption).toBe(0.1);
    expect(r.values.LootItemRemovalList).toBe("");
    expect(r.values.WorldItemRemovalList).toContain("Base.Maggots");
    // Lo que sigue al tab de `EnablePoisoning = 1,\t` y el renglón con tab.
    expect(r.values.MaggotSpawn).toBe(1);
    expect(r.values["Map.AllowWorldMap"]).toBe(true);
    expect(r.values["ZombieLore.FenceThumpersRequired"]).toBe(50);
    // Los renglones comentados no se leen.
    expect(r.values).not.toHaveProperty("FoodLoot");
    expect(r.issues.find((i) => i.key === "FoodLoot")).toBeUndefined();
    // Los dos tonumber, cada uno en su renglón; lo que viene después se sigue leyendo.
    const syntax = r.issues.filter((i) => i.kind === "syntax");
    expect(syntax.map((i) => i.line)).toEqual([
      lineOf(SIX_MONTHS, "PopulationMultiplier = tonumber"),
      lineOf(SIX_MONTHS, "PopulationStartMultiplier = tonumber"),
    ]);
    expect(r.values).not.toHaveProperty("ZombieConfig.PopulationMultiplier");
    expect(r.values["ZombieConfig.PopulationPeakDay"]).toBe(5);
    expect(r.values["ZombieConfig.RallyGroupRadius"]).toBe(10);
    // La versión vieja avisa, y XpMultiplier (que ya no existe) es desconocida y se conserva.
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: "version", line: 2 }));
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: "unknown", key: "XpMultiplier", line: lineOf(SIX_MONTHS, "XpMultiplier") }));
    expect(r.extra.some((e) => e.includes("XpMultiplier = 1.0"))).toBe(true);
  });

  it("un servidor con mods: la tabla del mod va entera a extra y el escritor la devuelve al final", () => {
    const text = "SandboxVars = {\n VERSION = 6,\n Zombies = 2,\n MiMod = {\n  Cosa = true,\n },\n}";
    const r = parseSandboxLua(text);
    expect(r.ok).toBe(true);
    expect(r.values.Zombies).toBe(2);
    expect(r.version).toBe(6);
    expect(r.extra).toHaveLength(1);
    expect(r.extra[0]).toContain("MiMod = {\n  Cosa = true,\n }");
    expect(r.issues).toEqual([expect.objectContaining({ kind: "unknown", key: "MiMod", line: 4 })]);
    // Sin la versión vieja: 6 no avisa.
    const out = writeSandboxLua(fromParsed(r), "es");
    expect(out).toMatch(/MiMod = \{\n {2}Cosa = true,\n \},\n\}\n$/);
    // Lo que escribe vuelve a leerse igual, con el mod y Zombies.
    const again = parseSandboxLua(out);
    expect(again.values.Zombies).toBe(2);
    expect(again.extra).toHaveLength(1);
    expect(again.issues.filter((i) => i.kind !== "unknown")).toEqual([]);
  });

  it("una clave desconocida dentro de una tabla del juego vuelve a su tabla, no al final", () => {
    const r = parseSandboxLua("SandboxVars = {\n ZombieLore = {\n  Speed = 1,\n  DeUnMod = 3,\n },\n}");
    expect(r.values["ZombieLore.Speed"]).toBe(1);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "unknown", key: "ZombieLore.DeUnMod", line: 4 })]);
    const c = fromParsed(r);
    const out = writeSandboxLua(c, "en");
    // Adentro de ZombieLore = { … }, que el juego lee por nombre: al final pisaría la tabla entera.
    const lore = out.slice(out.indexOf("    ZombieLore = {"), out.indexOf("    ZombieConfig = {"));
    expect(lore).toContain("DeUnMod = 3,");
    const again = parseSandboxLua(out);
    expect(again.values["ZombieLore.Speed"]).toBe(1);
    expect(again.issues).toEqual([expect.objectContaining({ kind: "unknown", key: "ZombieLore.DeUnMod" })]);
  });

  it("fuera de rango, de la lista o de tipo: un aviso por clave, el valor afuera y el que usa el juego", () => {
    const r = parseSandboxLua('SandboxVars = {\n Zombies = 9,\n FoodLootNew = "mucho",\n DayLength = 0,\n ZombieConfig = {\n  PopulationMultiplier = 99,\n },\n Distribution = 2,\n}');
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "Zombies", kind: "enum", used: 4, line: 2, got: "9" }));
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "FoodLootNew", kind: "type", line: 3 }));
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "DayLength", kind: "enum", line: 4 }));
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "ZombieConfig.PopulationMultiplier", kind: "range", line: 6 }));
    expect(r.values).not.toHaveProperty("Zombies");
    expect(r.values).not.toHaveProperty("FoodLootNew");
    expect(r.values.Distribution).toBe(2);
    // Lo que se descarta queda en Apocalipsis, como hace el juego.
    expect(fromParsed(r).sandbox.Zombies).toBe(fullPreset("apocalypse").Zombies);
  });

  it("una tabla donde va un valor, o un valor donde va una tabla del juego: type, sin romper el resto", () => {
    const r = parseSandboxLua("SandboxVars = {\n Zombies = { 1 },\n ZombieLore = 3,\n Distribution = 2,\n}");
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "Zombies", kind: "type", line: 2 }));
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "ZombieLore", kind: "type", line: 3 }));
    expect(r.values.Distribution).toBe(2);
    expect(r.extra).toEqual([]);
  });

  it("comentarios de bloque, al final del renglón, comillas simples, punto y coma y sin coma final", () => {
    const text = [
      "--[[ un bloque",
      "     de dos renglones = { ]]",
      "--[==[ otro ]] que sigue ]==]",
      "SandboxVars = { -- abre",
      "  VERSION = 6; -- con punto y coma",
      "  Zombies = 3, -- al final",
      "  LootItemRemovalList = 'Base.A,Base.B', --[[ adentro ]] Distribution = 2;",
      "  WorldItemRemovalList = \"con \\\"comillas\\\" y \\\\ y \\n\",",
      "  GeneratorFuelConsumption = 1.5e-1,",
      "  ZombieConfig = { PopulationMultiplier = .5 }",
      "}",
    ].join("\n");
    const r = parseSandboxLua(text);
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({
      Zombies: 3,
      LootItemRemovalList: "Base.A,Base.B",
      Distribution: 2,
      // El salto de renglón se vuelve un espacio, como en el formulario: rompería el .ini y el Lua del juego.
      WorldItemRemovalList: 'con "comillas" y \\ y  ',
      GeneratorFuelConsumption: 0.15,
      "ZombieConfig.PopulationMultiplier": 0.5,
    });
  });

  it("lo que sigue a la tabla cerrada es un after y se ignora", () => {
    const r = parseSandboxLua("SandboxVars = {\n Zombies = 3,\n}\n\ngetSandboxOptions():initSandboxVars()\n");
    expect(r.ok).toBe(true);
    expect(r.values.Zombies).toBe(3);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "after", line: 5 })]);
  });

  it("una tabla sin envoltorio, Version con minúsculas y los textos que nunca cierran", () => {
    const bare = parseSandboxLua("{ Version = 6, Zombies = 2 }");
    expect(bare.wrapper).toBeNull();
    expect(bare.version).toBe(6);
    expect(bare.values.Zombies).toBe(2);
    // Un texto sin cerrar no cuelga ni tira: es un syntax.
    const open = parseSandboxLua('SandboxVars = {\n LootItemRemovalList = "sin cerrar,\n Zombies = 2,\n}');
    expect(open.issues.some((i) => i.kind === "syntax")).toBe(true);
    const block = parseSandboxLua("SandboxVars = {\n --[[ sin cerrar\n Zombies = 2,\n}");
    expect(block.issues.some((i) => i.kind === "syntax")).toBe(true);
    // Una tabla sin cerrar: lo leído vale, con un syntax.
    const unclosed = parseSandboxLua("SandboxVars = {\n Zombies = 2,\n");
    expect(unclosed.values.Zombies).toBe(2);
    expect(unclosed.issues.some((i) => i.kind === "syntax")).toBe(true);
    for (const text of ["", "   ", "-- nada", "SandboxVars", "SandboxVars = ", "}", "= = =", "return return {"]) {
      const r = parseSandboxLua(text);
      expect(r.ok, JSON.stringify(text)).toBe(false);
    }
  });

  it("más de 512 KB: ok false, sin leerlo", () => {
    const r = parseSandboxLua(`SandboxVars = { Zombies = 2, LootItemRemovalList = "${"x".repeat(520 * 1024)}" }`);
    expect(r.ok).toBe(false);
    expect(r.values).toEqual({});
    expect(r.issues[0].kind).toBe("size");
  });

  it("claves que tropiezan con el prototipo no ensucian nada", () => {
    const r = parseSandboxLua("SandboxVars = {\n __proto__ = 1,\n constructor = { toString = 2 },\n hasOwnProperty = 3,\n}");
    expect(r.issues.map((i) => i.kind)).toEqual(["unknown", "unknown", "unknown"]);
    expect(Object.keys(r.values)).toEqual([]);
    expect(({} as Record<string, unknown>).toString).toBe(Object.prototype.toString);
  });
});

describe("parseSandboxLua no ejecuta nada", () => {
  afterEach(() => vi.restoreAllMocks());

  it("os.execute es un syntax, y ni eval ni Function se llaman", () => {
    const evalSpy = vi.spyOn(globalThis, "eval");
    const fnSpy = vi.spyOn(globalThis, "Function");
    const r = parseSandboxLua('return { A = os.execute("rm -rf /") }');
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: "syntax", line: 1 }));
    expect(r.values).toEqual({});
    const r2 = parseSandboxLua('SandboxVars = {\n Zombies = (function() return 1 end)(),\n Distribution = 2,\n}\nos.exit()');
    expect(r2.issues).toContainEqual(expect.objectContaining({ kind: "syntax", line: 2 }));
    expect(r2.values).toEqual({ Distribution: 2 });
    expect(evalSpy).not.toHaveBeenCalled();
    expect(fnSpy).not.toHaveBeenCalled();
  });
});

describe("parseIni", () => {
  it("el ejemplo: comentario, bool, rango, un = en el texto, una lista y una clave desconocida", () => {
    const r = parseIni("# hola\nPVP=false\nMaxPlayers=300\nPublicName=Mi = server\nMods=a;b\nRaro=1\n");
    expect(r.values.PVP).toBe(false);
    expect(r.values).not.toHaveProperty("MaxPlayers");
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "MaxPlayers", kind: "range", used: 32, line: 3 }));
    expect(r.values.PublicName).toBe("Mi = server");
    // El servidor lee hasta el segundo "=": se avisa, y se conserva lo que escribiste.
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "PublicName", kind: "equals", used: "Mi ", line: 4 }));
    expect(r.values.Mods).toBe("a;b");
    expect(r.extra).toEqual(["Raro=1"]);
    expect(r.issues).toContainEqual(expect.objectContaining({ key: "Raro", kind: "unknown", line: 6 }));
  });

  it("lo que escribe el generador vuelve igual, sin avisos", () => {
    for (const lang of ["es", "en"] as const) {
      const r = parseIni(writeIni(fromPreset("extinction"), lang));
      expect(r.issues).toEqual([]);
      expect(r.extra).toEqual([]);
      // Sin las tres que sortea el servidor: el escritor no las pone si no las tocaste.
      const random = SERVER.ini.filter((o) => o.random).map((o) => o.key);
      expect({ ...r.values }).toEqual(Object.fromEntries(Object.entries(INI_DEFAULTS).filter(([k]) => !random.includes(k))));
    }
  });

  it("las claves son exactas (como el juego), los \\r de Windows no molestan y un renglón sin = es un syntax", () => {
    const r = parseIni("pvp=false\r\nPVP=true\r\nsin igual\r\n\r\n  # con sangría\r\nResetID=123456\r\nPassword=secreta\r\n");
    expect(r.values.PVP).toBe(true);
    expect(r.extra).toEqual(["pvp=false"]);
    expect(r.issues).toContainEqual(expect.objectContaining({ kind: "syntax", line: 3 }));
    expect(r.values.ResetID).toBe(123456);
    expect(r.values.Password).toBe("secreta");
  });

  it("más de 512 KB: sin leerlo", () => {
    const r = parseIni(`PublicName=${"x".repeat(520 * 1024)}`);
    expect(r.values).toEqual({});
    expect(r.issues[0].kind).toBe("size");
  });
});

describe("fileKind", () => {
  it("Lua si arranca con SandboxVars o return, o si hay una { antes de cualquier =; si no, .ini", () => {
    expect(fileKind("SandboxVars = {\n}")).toBe("lua");
    expect(fileKind("-- comentario\n--[[ otro = ]]\nreturn {")).toBe("lua");
    expect(fileKind("{ Zombies = 2 }")).toBe("lua");
    expect(fileKind(SIX_MONTHS)).toBe("lua");
    expect(fileKind("# servertest.ini\nPVP=true\nPublicDescription={hola}")).toBe("ini");
    expect(fileKind("PVP=true")).toBe("ini");
    expect(fileKind("")).toBe("ini");
  });
});

describe("nearestPreset y fromParsed", () => {
  it("de En ascenso con 3 cambios: { rising, 3 }", () => {
    const values = { ...fullPreset("rising"), Zombies: 1, Distribution: 2, "ZombieLore.Speed": 1 };
    expect(nearestPreset(values)).toEqual({ id: "rising", diff: 3 });
  });

  it("cada preset entero se reconoce, y lo que el archivo no trae cuenta como Apocalipsis", () => {
    for (const p of SERVER.presets) expect(nearestPreset({ ...fullPreset(p.id) })).toEqual({ id: p.id, diff: 0 });
    expect(nearestPreset({ Zombies: 2 })).toEqual({ id: "apocalypse", diff: 1 });
    // Vacío: Apocalipsis, que es el primero del juego.
    expect(nearestPreset({})).toEqual({ id: "apocalypse", diff: 0 });
  });

  it("fromParsed: base la más parecida, lo que falta en Apocalipsis, el .ini sobre los defaults y los extras", () => {
    const lua = parseSandboxLua(writeSandboxLua(fromPreset("outbreak"), "es").replace(/^ {4}Zombies = /m, "    MiMod = { A = 1 },\n    Zombies = "));
    const ini = parseIni("PVP=false\nRaro=1\nPassword=x\n");
    const c = fromParsed(lua, ini);
    expect(c.preset).toBe("outbreak");
    expect(sandboxChanges(c)).toEqual([]);
    expect(c.ini).toEqual({ ...INI_DEFAULTS, PVP: false, Password: "x" });
    expect(c.extraLua).toHaveLength(1);
    expect(c.extraIni).toEqual(["Raro=1"]);
    // Un archivo corto: lo que no trae queda en Apocalipsis aunque la base sea otra.
    const short = fromParsed(parseSandboxLua("return { Zombies = 2 }"), undefined, "six-months-later");
    expect(short.preset).toBe("six-months-later");
    expect(short.sandbox).toEqual({ ...fullPreset("apocalypse"), Zombies: 2 });
    expect(short.ini).toEqual({ ...INI_DEFAULTS });
    // Sin nada: la de entrada.
    expect(fromParsed()).toEqual(fromPreset("apocalypse"));
  });

  it("al cargar un archivo no se aplican las opciones enlazadas: queda lo que dice el archivo", () => {
    // En la pantalla del juego, Zombies = 1 arrastraría la población; un archivo dice las dos cosas por separado.
    const c = fromParsed(parseSandboxLua("return { Zombies = 1, ZombieConfig = { PopulationMultiplier = 1.0 } }"));
    expect(c.sandbox.Zombies).toBe(1);
    expect(c.sandbox["ZombieConfig.PopulationMultiplier"]).toBe(1);
  });
});

describe("parseSandboxLua: más formas de Lua", () => {
  it("una coma que falta: syntax en el renglón siguiente, y los dos valores se leen", () => {
    const r = parseSandboxLua("SandboxVars = {\n Zombies = 2\n Distribution = 2,\n}");
    expect(r.values).toMatchObject({ Zombies: 2, Distribution: 2 });
    expect(r.issues).toEqual([expect.objectContaining({ kind: "syntax", line: 3 })]);
  });

  it("textos largos [[…]], números en hexadecimal y escapes de Lua", () => {
    const r = parseSandboxLua('return {\n LootItemRemovalList = [[\nBase.A]],\n ErosionDays = 0x10,\n WorldItemRemovalList = "\\65\\x42\\z\n   C",\n}');
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({ LootItemRemovalList: "Base.A", ErosionDays: 16, WorldItemRemovalList: "ABC" });
  });

  it("una cuenta después del valor no se toma a medias", () => {
    const r = parseSandboxLua("return {\n FoodLootNew = 1.0 * 2,\n Distribution = 2,\n}");
    expect(r.values).toEqual({ Distribution: 2 });
    expect(r.issues).toEqual([expect.objectContaining({ kind: "syntax", line: 2 })]);
  });

  it("una tabla de un mod con algo que no es un valor no se conserva (no se devuelve código)", () => {
    const r = parseSandboxLua('SandboxVars = {\n MiMod = { A = print("hola") },\n Zombies = 2,\n}');
    expect(r.extra).toEqual([]);
    expect(r.values.Zombies).toBe(2);
    expect(r.issues).toEqual([expect.objectContaining({ kind: "syntax", line: 2 })]);
  });

  it("un archivo de 40.000 renglones de basura se lee rápido y sin tirar", () => {
    const junk = "SandboxVars = {\n" + "a b c ( ) = = , ; } {\n".repeat(20000) + "}";
    const t0 = performance.now();
    const r = parseSandboxLua(junk);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.ok).toBe(true);
  });
});

describe("el escritor con lo que trae un archivo", () => {
  it("un extra sin sangría ni coma la recibe; uno que ya la trae va tal cual", () => {
    const c: Config = { ...fromPreset("apocalypse"), extraLua: ["MiMod = 1", "    Otro = {\n        A = 2,\n    },"] };
    const out = writeSandboxLua(c, "en");
    expect(out.endsWith("    MiMod = 1,\n    Otro = {\n        A = 2,\n    },\n}\n")).toBe(true);
  });
});

describe("la hoja en la página", () => {
  const render = (path: string) =>
    renderToStaticMarkup(
      createElement(
        LangContext.Provider,
        { value: { lang: parseRoute(path).lang, setLang: () => undefined } },
        createElement(ZomboidServer, { route: parseRoute(path), navigate: () => undefined }),
      ),
    );

  it("/es/project-zomboid/servidor trae 'Pegá tu archivo' arriba del generador, con el texto de privacidad", () => {
    const route = parseRoute("/es/project-zomboid/servidor");
    expect(route.pzSection).toBe("server");
    const html = render("/es/project-zomboid/servidor");
    expect(html).toContain("Pegá tu archivo");
    expect(html).toContain("Tu archivo no sale de tu navegador.");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="\.lua,\.ini,\.txt"/);
    expect(html).toContain("<textarea");
    // Arriba de los presets.
    expect(html.indexOf("Pegá tu archivo")).toBeLessThan(html.indexOf("Empezá de un preset"));
    expect(html).not.toMatch(/archivos del juego|sacad[oa] de/i);
  });

  it("en inglés también", () => {
    const html = render("/en/project-zomboid/server");
    expect(html).toContain("Paste your file");
    expect(html).toContain("Your file never leaves your browser.");
  });
});

describe("fix de la revisión: nada tira, la última asignación gana, el tope en bytes", () => {
  it("10.000 tablas anidadas (de un mod, en una tabla del juego o donde va un valor): syntax, sin tirar", () => {
    for (const text of [
      `return { A = ${"{ A = ".repeat(10000)}1${" }".repeat(10000)}, Zombies = 2 }`,
      `return { ZombieLore = { X = ${"{ X = ".repeat(10000)}1${" }".repeat(10000)} }, Zombies = 2 }`,
      `return { Zombies = ${"{ A = ".repeat(10000)}1${" }".repeat(10000)}, Distribution = 2 }`,
      `return { A = ${"{ A = ".repeat(10000)}`,
      `return { ${"{ ".repeat(10000)}`,
      `return { ${"( ".repeat(10000)}`,
    ]) {
      const r = parseSandboxLua(text);
      expect(r.ok).toBe(true);
      expect(r.issues.some((i) => i.kind === "syntax" || i.kind === "type")).toBe(true);
      // La tabla honda no se conserva: no es una tabla de valores que el juego vaya a leer.
      expect(r.extra).toEqual([]);
    }
    const deep = parseSandboxLua(`return { A = ${"{ A = ".repeat(10000)}1${" }".repeat(10000)}, Zombies = 2 }`);
    expect(deep.values).toEqual({ Zombies: 2 });
    expect(deep.issues).toEqual([expect.objectContaining({ kind: "syntax", line: 1, deep: true })]);
    // Las de verdad (dos o tres niveles) se siguen conservando.
    expect(parseSandboxLua("return { MiMod = { A = { B = { C = 1 } } } }").extra).toEqual(["MiMod = { A = { B = { C = 1 } } }"]);
  });

  it("un extra con un tramo largo de espacios en el medio se escribe rápido", () => {
    const c: Config = { ...fromPreset("apocalypse"), extraLua: [`MiMod = "a${" ".repeat(200000)}b"`] };
    const t0 = performance.now();
    writeSandboxLua(c, "en");
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("una clave repetida: gana la última, como en Lua (y una tabla del juego repetida reemplaza a la primera)", () => {
    const valid = parseSandboxLua("return { Zombies = 2, Zombies = 9 }");
    expect(valid.values).not.toHaveProperty("Zombies");
    expect(valid.issues).toEqual([expect.objectContaining({ key: "Zombies", kind: "enum" })]);
    const fixed = parseSandboxLua("return { Zombies = 9, Zombies = 2 }");
    expect(fixed.values).toEqual({ Zombies: 2 });
    expect(fixed.issues).toEqual([]);
    const nil = parseSandboxLua("return { Zombies = 2, Zombies = nil }");
    expect(nil.values).toEqual({});
    const tables = parseSandboxLua("return {\n ZombieLore = { Speed = 1, DeUnMod = 1 },\n ZombieLore = { Strength = 1 },\n}");
    expect(tables.values).toEqual({ "ZombieLore.Strength": 1 });
    expect(tables.extra).toEqual([]);
    expect(tables.issues).toEqual([]);
    const mods = parseSandboxLua("return {\n MiMod = { A = 1 },\n Otro = 1,\n MiMod = { A = 2 },\n}");
    expect(mods.extra).toEqual(["Otro = 1", "MiMod = { A = 2 }"]);
    expect(mods.issues.map((i) => [i.key, i.line])).toEqual([
      ["Otro", 3],
      ["MiMod", 4],
    ]);
  });

  it("el tope de 512 KB es en bytes de UTF-8, como el archivo en disco", () => {
    const fits = parseSandboxLua(`return { LootItemRemovalList = "${"ñ".repeat(200 * 1024)}" }`); // 400 KB
    expect(fits.ok).toBe(true);
    const over = parseSandboxLua(`return { LootItemRemovalList = "${"ñ".repeat(300 * 1024)}" }`); // 600 KB
    expect(over.ok).toBe(false);
    expect(over.issues[0].kind).toBe("size");
    expect(parseIni(`PublicName=${"€".repeat(200 * 1024)}`).issues[0].kind).toBe("size"); // 600 KB
  });

  it("los syntax dicen si el juego no cargaría el archivo así como está", () => {
    const fatal = (text: string) => parseSandboxLua(text).issues.filter((i) => i.kind === "syntax").map((i) => !!i.fatal);
    expect(fatal('return {\n A = "sin cerrar,\n Zombies = 2,\n}')).toEqual([true]);
    expect(fatal("return {\n Zombies = 2\n Distribution = 2,\n}")).toEqual([true]);
    expect(fatal("return {\n Zombies = 2,\n")).toEqual([true]);
    expect(fatal("return {\n Zombies = tonumber(X.Y),\n}")).toEqual([false]);
    expect(fatal('SandboxVars = require "Sandbox/Apocalypse"')).toEqual([false]);
  });
});

describe("la fila de un texto del .ini con = que llegó cargado", () => {
  it("se marca con lo que lee el servidor", () => {
    const opt = SERVER.ini.find((o) => o.key === "PublicName")!;
    const html = renderToStaticMarkup(
      createElement(
        LangContext.Provider,
        { value: { lang: "es", setLang: () => undefined } },
        createElement(OptionRow, { kind: "ini", opt, value: "Mi = server", baseText: "", changed: true, onSet: () => undefined, onReset: () => undefined }),
      ),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("el servidor corta el texto ahí y lee &quot;Mi &quot;");
  });
});
