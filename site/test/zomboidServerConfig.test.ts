/**
 * El generador de servidor de Project Zomboid (2026-10-01), la parte pura: el modelo de la configuración
 * (`zomboid/server/config.ts`), los dos escritores (`lua.ts`, `ini.ts`) y el link para compartir (`link.ts`), con el
 * `server.json` real. Los valores esperados son los del juego 42.21 (ver "Lo que dice el juego" en
 * docs/superpowers/plans/2026-10-01-zomboid-servidor.md): el "Default" del juego es Apocalipsis, no el de Java.
 */
import { describe, expect, it } from "vitest";
import { coerce, daysInMonth, fromPreset, iniChanges, linkedValues, resetOption, sandboxChanges, setOption, type Config } from "../src/zomboid/server/config";
import { fullPreset, iniByKey, INI_DEFAULTS, optionByKey, SERVER } from "../src/zomboid/server/data";
import { writeIni } from "../src/zomboid/server/ini";
import { decodeConfig, encodeConfig, INI_NO_LINK, INI_SECRET, isDefaultConfig } from "../src/zomboid/server/link";
import { writeSandboxLua } from "../src/zomboid/server/lua";

const sandboxOpt = (key: string) => {
  const o = optionByKey(key);
  if (!o) throw new Error(`no está la opción ${key}`);
  return o;
};
const iniOpt = (key: string) => {
  const o = iniByKey(key);
  if (!o) throw new Error(`no está la opción del .ini ${key}`);
  return o;
};
/** Una configuración con cambios, sin tocar la de entrada. */
const withChanges = (c: Config, sandbox: Record<string, unknown> = {}, ini: Record<string, unknown> = {}): Config => ({
  ...c,
  sandbox: { ...c.sandbox, ...(sandbox as Config["sandbox"]) },
  ini: { ...c.ini, ...(ini as Config["ini"]) },
});

describe("los presets, como los carga el juego", () => {
  it("un preset recién elegido no tiene cambios", () => {
    for (const p of SERVER.presets) expect(sandboxChanges(fromPreset(p.id)), p.id).toEqual([]);
    expect(sandboxChanges(fromPreset("outbreak"))).toEqual([]);
  });

  it("Brote inicial corta el agua con la opción 3, y Apocalipsis arranca el día 9 aunque Java diga 23", () => {
    expect(fullPreset("outbreak").WaterShut).toBe(3);
    expect(fullPreset("apocalypse").StartDay).toBe(9);
    expect(sandboxOpt("StartDay").default).toBe(23);
    // Las 269, completas, en cada preset.
    for (const p of SERVER.presets) expect(Object.keys(fullPreset(p.id)), p.id).toHaveLength(SERVER.options.length);
    // 6 meses después: la población, el mes y los cortes que dice el plan.
    expect(fullPreset("six-months-later")).toMatchObject({
      "ZombieConfig.PopulationMultiplier": 1.6,
      TimeSinceApo: 7,
      StartMonth: 12,
      WaterShutModifier: -1,
    });
  });

  it("fromPreset arma las 269 de sandbox y las 144 del .ini, sin extras", () => {
    const c = fromPreset("rising");
    expect(c.preset).toBe("rising");
    expect(Object.keys(c.sandbox)).toHaveLength(269);
    expect(Object.keys(c.ini)).toHaveLength(144);
    expect(c.ini).toEqual(INI_DEFAULTS);
    expect(c.extraLua).toEqual([]);
    expect(c.extraIni).toEqual([]);
    expect(iniChanges(c)).toEqual([]);
  });

  it("los cambios se cuentan contra el preset base, en el orden de las hojas", () => {
    const c = withChanges(fromPreset("apocalypse"), { "ZombieLore.Speed": 1, Zombies: 2 }, { PVP: false });
    // Zombies (hoja Zombi, primera) antes que ZombieLore.Speed (subtítulo de la misma hoja, más abajo).
    expect(sandboxChanges(c)).toEqual(["Zombies", "ZombieLore.Speed"]);
    expect(iniChanges(c)).toEqual(["PVP"]);
    // El mismo valor que el preset no es un cambio.
    expect(sandboxChanges(withChanges(fromPreset("apocalypse"), { Zombies: 4 }))).toEqual([]);
  });
});

describe("coerce", () => {
  it("rechaza lo que el juego ignoraría y acepta lo que escribe un formulario o un link", () => {
    expect(coerce(iniOpt("MaxPlayers"), "300")).toEqual({ ok: false, reason: "range" });
    expect(coerce(iniOpt("MaxPlayers"), "64")).toEqual({ ok: true, value: 64 });
    expect(coerce(iniOpt("MaxPlayers"), "6.5")).toEqual({ ok: false, reason: "type" });
    expect(coerce(sandboxOpt("Zombies"), 7)).toEqual({ ok: false, reason: "enum" });
    expect(coerce(sandboxOpt("Zombies"), "0")).toEqual({ ok: false, reason: "enum" });
    expect(coerce(sandboxOpt("Zombies"), "2")).toEqual({ ok: true, value: 2 });
    expect(coerce(sandboxOpt("FoodLootNew"), "0.8")).toEqual({ ok: true, value: 0.8 });
    expect(coerce(sandboxOpt("FoodLootNew"), "mucho")).toEqual({ ok: false, reason: "type" });
    expect(coerce(sandboxOpt("FoodLootNew"), "")).toEqual({ ok: false, reason: "type" });
    expect(coerce(sandboxOpt("FoodLootNew"), "0x2")).toEqual({ ok: false, reason: "type" });
    expect(coerce(sandboxOpt("FoodLootNew"), 5)).toEqual({ ok: false, reason: "range" });
    expect(coerce(iniOpt("PVP"), "false")).toEqual({ ok: true, value: false });
    expect(coerce(iniOpt("PVP"), true)).toEqual({ ok: true, value: true });
    expect(coerce(iniOpt("PVP"), "quizás")).toEqual({ ok: false, reason: "type" });
    expect(coerce(iniOpt("BadWordPolicy"), 3)).toEqual({ ok: true, value: 3 });
    expect(coerce(iniOpt("BadWordPolicy"), 4)).toEqual({ ok: false, reason: "enum" });
    // El servidor corta cada renglón del .ini en el "=" (`line.split("=")[1]`): "PublicName=Mi = server" cargaría "Mi ".
    expect(coerce(iniOpt("PublicName"), "Mi = server")).toEqual({ ok: false, reason: "equals" });
    expect(coerce(iniOpt("PublicDescription"), "Mods: https://x.com/?id=5")).toEqual({ ok: false, reason: "equals" });
    expect(coerce(iniOpt("PublicName"), "Mi server")).toEqual({ ok: true, value: "Mi server" });
    // En el Lua el texto va entre comillas: ahí el "=" no rompe nada.
    expect(coerce(sandboxOpt("WorldItemRemovalList"), "a=b")).toEqual({ ok: true, value: "a=b" });
    // `coerce` distingue las del .ini por no tener `name` (las de sandbox lo traen siempre): si eso cambia, el aviso
    // del "=" se apaga sin que falle nada más.
    for (const o of SERVER.ini) expect("name" in o, o.key).toBe(false);
    for (const o of SERVER.options) expect("name" in o, o.key).toBe(true);
    // Ningún default del juego tiene un "=": el .ini de entrada se lee entero.
    for (const o of SERVER.ini) if (o.type === "string" || o.type === "text") expect(coerce(o, o.default).ok, o.key).toBe(true);
    // Un texto no puede bajar de renglón: rompería el renglón del .ini y el texto entre comillas del Lua.
    expect(coerce(iniOpt("PublicName"), "a\nb")).toEqual({ ok: true, value: "a b" });
  });
});

describe("las opciones enlazadas, como la pantalla de servidor del juego", () => {
  const apo = fromPreset("apocalypse");

  it("Zombies en Muy alto pone la población en 1.6 (ZombiePopulationMultiplierTable), y queda como cambio", () => {
    const c = setOption(apo, "sandbox", "Zombies", 2);
    expect(c.sandbox["ZombieConfig.PopulationMultiplier"]).toBe(1.6);
    expect(sandboxChanges(c)).toEqual(["Zombies", "ZombieConfig.PopulationMultiplier"]);
    expect(setOption(apo, "sandbox", "Zombies", 1).sandbox["ZombieConfig.PopulationMultiplier"]).toBe(2.5);
    expect(setOption(apo, "sandbox", "Zombies", 6).sandbox["ZombieConfig.PopulationMultiplier"]).toBe(0);
    // Volver a Normal vuelve a 0.65: sin cambios.
    expect(sandboxChanges(setOption(c, "sandbox", "Zombies", 4))).toEqual([]);
  });

  it("ZombieRespawn pone las tres de reaparición", () => {
    expect(linkedValues("ZombieRespawn", 1)).toEqual({
      "ZombieConfig.RespawnHours": 16,
      "ZombieConfig.RespawnUnseenHours": 6,
      "ZombieConfig.RespawnMultiplier": 0.5,
    });
    const c = setOption(apo, "sandbox", "ZombieRespawn", 2);
    expect(c.sandbox).toMatchObject({ "ZombieConfig.RespawnHours": 72, "ZombieConfig.RespawnUnseenHours": 16, "ZombieConfig.RespawnMultiplier": 0.1 });
    expect(setOption(apo, "sandbox", "ZombieRespawn", 3).sandbox).toMatchObject({
      "ZombieConfig.RespawnHours": 216,
      "ZombieConfig.RespawnUnseenHours": 48,
      "ZombieConfig.RespawnMultiplier": 0.05,
    });
  });

  it("ZombieMigrate pone RedistributeHours en 12 o en 0", () => {
    expect(setOption(apo, "sandbox", "ZombieMigrate", false).sandbox["ZombieConfig.RedistributeHours"]).toBe(0);
    expect(setOption(fromPreset("rising"), "sandbox", "ZombieMigrate", true).sandbox["ZombieConfig.RedistributeHours"]).toBe(12);
  });

  it("volver al preset vuelve también las enlazadas", () => {
    const c = setOption(setOption(apo, "sandbox", "Zombies", 2), "sandbox", "ZombieRespawn", 1);
    expect(sandboxChanges(resetOption(resetOption(c, "sandbox", "Zombies"), "sandbox", "ZombieRespawn"))).toEqual([]);
    // Una enlazada sola vuelve sola.
    const back = resetOption(c, "sandbox", "ZombieConfig.PopulationMultiplier");
    expect(back.sandbox.Zombies).toBe(2);
    expect(back.sandbox["ZombieConfig.PopulationMultiplier"]).toBe(0.65);
  });

  it("una opción sin vínculo cambia sola, y el .ini nunca arrastra nada", () => {
    expect(linkedValues("ZombieLore.Speed", 1)).toEqual({});
    expect(sandboxChanges(setOption(apo, "sandbox", "ZombieLore.Speed", 1))).toEqual(["ZombieLore.Speed"]);
    expect(iniChanges(setOption(apo, "ini", "PVP", false))).toEqual(["PVP"]);
  });

  it("ni un link ni un preset pasan por los vínculos: cada valor viene como está", () => {
    const c = decodeConfig(new URLSearchParams("s=Zombies:2"));
    expect(c.sandbox.Zombies).toBe(2);
    expect(c.sandbox["ZombieConfig.PopulationMultiplier"]).toBe(0.65);
  });

  it("el día de inicio no pasa del último del mes, como Page3:syncStartDay", () => {
    expect(daysInMonth(1993, 2)).toBe(28);
    expect(daysInMonth(1996, 2)).toBe(29);
    expect(daysInMonth(1993, 7)).toBe(31);
    const day31 = setOption(apo, "sandbox", "StartDay", 31);
    expect(day31.sandbox.StartDay).toBe(31);
    expect(setOption(day31, "sandbox", "StartMonth", 2).sandbox.StartDay).toBe(28);
    // 1996 es bisiesto: StartYear 4 = 1996.
    const feb96 = setOption(setOption(day31, "sandbox", "StartYear", 4), "sandbox", "StartMonth", 2);
    expect(feb96.sandbox.StartDay).toBe(29);
    expect(setOption(setOption(apo, "sandbox", "StartMonth", 4), "sandbox", "StartDay", 31).sandbox.StartDay).toBe(30);
  });
});

describe("el link para compartir", () => {
  const shared = withChanges(
    fromPreset("apocalypse"),
    { Zombies: 2, "ZombieLore.Speed": 1, WorldItemRemovalList: "Base.Hat; x" },
    { Password: "secreto" },
  );

  it("lleva sólo los cambios, y nunca las contraseñas ni los tokens", () => {
    const q = encodeConfig(shared);
    expect(q).not.toContain("secreto");
    expect(q).not.toContain("Password");
    for (const key of ["RCONPassword", "DiscordToken", "WebhookAddress"]) {
      const c = withChanges(fromPreset("apocalypse"), {}, { [key]: "x-privado-x" });
      expect(encodeConfig(c), key).not.toContain("privado");
    }
    expect(INI_SECRET).toEqual(["Password", "RCONPassword", "DiscordToken", "WebhookAddress"]);
    // Tampoco la IP anunciada, los ids del servidor ni las rutas de tu compu (no son secretos, pero no se comparten).
    const priv = withChanges(fromPreset("apocalypse"), {}, {
      server_browser_announced_ip: "203.0.113.7",
      ResetID: 424242,
      ServerPlayerID: 777777,
      BadWordListFile: "C:/Users/fulano/malas.txt",
      GoodWordListFile: "C:/Users/fulano/buenas.txt",
      Seed: "semilla",
    });
    const pq = encodeConfig(priv);
    for (const key of INI_NO_LINK) expect(pq, key).not.toContain(encodeURIComponent(key));
    expect(pq).not.toContain("fulano");
    // `Seed` sí viaja: es la gracia de compartir un mundo.
    expect(decodeConfig(new URLSearchParams(pq)).ini.Seed).toBe("semilla");
    // Y un link armado a mano no las pone.
    expect(decodeConfig(new URLSearchParams("i=ResetID:5;server_browser_announced_ip:1.2.3.4")).ini).toMatchObject({
      ResetID: INI_DEFAULTS.ResetID,
      server_browser_announced_ip: INI_DEFAULTS.server_browser_announced_ip,
    });
    // Ni los extras (Task 3): son del archivo de cada uno.
    expect(encodeConfig({ ...shared, extraLua: ["MiMod = { A = 1 },"], extraIni: ["Raro=1"] })).toBe(q);
  });

  it("ida y vuelta: los tres cambios vuelven y Password queda en su default", () => {
    const back = decodeConfig(new URLSearchParams(encodeConfig(shared)));
    expect(back.preset).toBe("apocalypse");
    expect(sandboxChanges(back)).toEqual(["Zombies", "ZombieLore.Speed", "WorldItemRemovalList"]);
    expect(back.sandbox.Zombies).toBe(2);
    expect(back.sandbox["ZombieLore.Speed"]).toBe(1);
    expect(back.sandbox.WorldItemRemovalList).toBe("Base.Hat; x");
    expect(back.ini.Password).toBe("");
    expect(iniChanges(back)).toEqual([]);
  });

  it("el .ini y otro preset también viajan", () => {
    const c = withChanges(fromPreset("extinction"), { DayLength: 6 }, { MaxPlayers: 64, PublicName: "Mi server: el bueno" });
    const back = decodeConfig(new URLSearchParams(encodeConfig(c)));
    expect(back.preset).toBe("extinction");
    expect(sandboxChanges(back)).toEqual(["DayLength"]);
    expect(back.ini).toMatchObject({ MaxPlayers: 64, PublicName: "Mi server: el bueno" });
  });

  it("un link roto se lee como se puede: preset desconocido, claves que no existen y valores fuera de rango se descartan", () => {
    const c = decodeConfig(new URLSearchParams("p=nada&s=Zombies:9;NoExiste:1;Zombies2:x"));
    expect(c.preset).toBe("apocalypse");
    expect(sandboxChanges(c)).toEqual([]);
    // El prototipo no es una clave.
    expect(sandboxChanges(decodeConfig(new URLSearchParams("s=constructor:1;__proto__:2;toString:3")))).toEqual([]);
    // Lo que sirve, queda: el resto no lo tira.
    expect(decodeConfig(new URLSearchParams("p=rising&s=Zombies:9;DayLength:6;sinvalor;:3&i=MaxPlayers:999;PVP:false")))
      .toMatchObject({ preset: "rising", sandbox: { DayLength: 6, Zombies: 5 }, ini: { MaxPlayers: 32, PVP: false } });
    // Un link armado a mano no puede poner una contraseña.
    expect(decodeConfig(new URLSearchParams("i=Password:abc;RCONPassword:def")).ini).toMatchObject({ Password: "", RCONPassword: "" });
    // Un `%` suelto no tira la página.
    expect(() => decodeConfig(new URLSearchParams("s=WorldItemRemovalList:%E0%A4%A"))).not.toThrow();
  });

  it("la configuración de entrada (Apocalipsis sin cambios) no necesita link", () => {
    expect(isDefaultConfig(fromPreset("apocalypse"))).toBe(true);
    expect(isDefaultConfig(fromPreset("outbreak"))).toBe(false);
    expect(isDefaultConfig(withChanges(fromPreset("apocalypse"), {}, { PVP: false }))).toBe(false);
  });
});

describe("SandboxVars.lua, en el formato del juego", () => {
  const lua = writeSandboxLua(fromPreset("apocalypse"), "en");

  it("la tabla, los valores y las tablas anidadas", () => {
    expect(lua.startsWith("SandboxVars = {\n    VERSION = 6,\n")).toBe(true);
    expect(lua).toContain("    Zombies = 4,\n");
    expect(lua).toContain("    FoodLootNew = 0.8,\n");
    // Los double van con el `String.valueOf` de Java: 216.0 y no 216.
    expect(lua).toContain("    HoursForCorpseRemoval = 216.0,\n");
    expect(lua).toContain("    ZombieLore = {\n");
    expect(lua).toContain("        Speed = 4,\n");
    expect(lua).toContain("    ZombieLore = {\n");
    expect(lua.endsWith("}\n")).toBe(true);
    // Apocalipsis trae la velocidad en 4 (Aleatoria): ése es el Default que escribe el juego, no el 2 de Java.
    expect(lua).toContain("    ZombieLore = {\n        -- How fast zombies move. Default = Random\n        -- 1 = Sprinters\n");
    expect(lua).toContain("    Nutrition = true,\n");
    expect(lua).toContain('    WorldItemRemovalList = "Base.Hat, Base.Glasses, Base.Maggots');
  });

  it("primero las opciones sueltas, después las cinco tablas en el orden del juego, y cada una se cierra", () => {
    const tables = [...lua.matchAll(/^ {4}(\w+) = \{$/gm)].map((m) => m[1]);
    expect(tables).toEqual(["Basement", "Map", "ZombieLore", "ZombieConfig", "MultiplierConfig"]);
    expect(lua.match(/^ {4}\},$/gm)).toHaveLength(5);
    expect(lua.indexOf("    Zombies = 4,")).toBeLessThan(lua.indexOf("    Basement = {"));
    // Las 269, una vez cada una.
    expect(lua.match(/^ {4,8}\w+ = [^{].*,$/gm)!.length).toBe(1 + SERVER.options.length);
  });

  it("la ayuda del juego como comentario, con Min/Max/Default (de Apocalipsis) o las etiquetas del enum", () => {
    // El Default es el del juego (Apocalipsis), no el de Java (0.6 → 0.8): el juego lo fija al cargar Apocalypse.lua.
    expect(lua).toContain("    -- Any food that can rot or spoil. Min: 0.00 Max: 4.00 Default: 0.80\n    FoodLootNew = 0.8,\n");
    expect(lua).toContain("Min: -1 Max: 2147483647 Default: 14\n    WaterShutModifier = 14,\n");
    expect(lua).toMatch(/Default = Normal\n {4}-- 1 = Insane\n[\s\S]*?-- 6 = None\n {4}Zombies = 4,\n/);
    // La ayuda de varios renglones va en varios comentarios.
    expect(lua).toContain("    -- How long after the end of the world to begin.\n    -- This will affect starting world erosion");
    // El año y el día no tienen etiquetas en el juego: no se listan 100 renglones de "-- i = 1993".
    expect(lua).not.toContain("-- 1 = 1993");
    // En español, con el texto del juego en español.
    const es = writeSandboxLua(fromPreset("apocalypse"), "es");
    expect(es).toContain("    -- Cualquier alimento que pueda pudrirse o echarse a perder. Mínimo=0.00 Máximo=4.00 Por defecto=0.80\n");
    expect(es).toMatch(/Por defecto=Normal\n {4}-- 1 = /);
  });

  it("los cambios, los textos escapados y lo de los mods al final, tal cual", () => {
    const c: Config = {
      ...withChanges(fromPreset("apocalypse"), { Zombies: 2, "ZombieLore.Speed": 1, WorldItemRemovalList: 'Base.Hat, "x" \\ y', FoodLootNew: 1 }),
      extraLua: ["    MiMod = {\n        Cosa = true,\n    },"],
    };
    const out = writeSandboxLua(c, "en");
    expect(out).toContain("    Zombies = 2,\n");
    expect(out).toContain("        Speed = 1,\n");
    expect(out).toContain("    FoodLootNew = 1.0,\n");
    expect(out).toContain('    WorldItemRemovalList = "Base.Hat, \\"x\\" \\\\ y",\n');
    expect(out.endsWith("    },\n    MiMod = {\n        Cosa = true,\n    },\n}\n")).toBe(true);
  });
});

describe("el .ini, en el formato del juego", () => {
  const ini = writeIni(fromPreset("apocalypse"), "en");

  it("cada opción con su ayuda y un renglón en blanco, en el orden del juego", () => {
    expect(ini).toContain("DefaultPort=16261\n");
    expect(ini).toContain("PVP=true\n");
    expect(ini.startsWith("# Default starting port for player data.")).toBe(true);
    expect(ini).toContain("# Players can hurt and kill other players");
    // Los int y double con su rango, como el juego.
    expect(ini).toContain("Min: 0 Max: 65535 Default: 16261\nDefaultPort=16261\n\n");
    expect(ini).toContain("PVPMeleeDamageModifier=30.0\n");
    expect(ini).toContain("PublicName=My PZ Server\n");
    expect(ini).toContain("Map=Muldraugh, KY\n");
    expect(ini.indexOf("DefaultPort=")).toBeLessThan(ini.indexOf("PublicName="));
    // El "\n" de la ayuda de PublicDescription es lo que hay que escribir, no un salto: queda escrito.
    expect(ini).toContain("# Description displayed in the in-game public server browser. Typing \\n will create a new line");
    // La ayuda de varios renglones (un <br> del juego) va en varios comentarios.
    expect(ini).toMatch(/# Maximum number of players [^\n]*\n# WARNING: Server player counts above 32/);
  });

  it("no escribe ResetID, ServerPlayerID ni Seed si no los tocaste: el servidor los sortea la primera vez", () => {
    const random = SERVER.ini.filter((o) => o.random).map((o) => o.key);
    expect(random.sort()).toEqual(["ResetID", "Seed", "ServerPlayerID"]);
    for (const key of random) expect(ini, key).not.toMatch(new RegExp(`^${key}=`, "m"));
    expect(ini.match(/^\w+=/gm)).toHaveLength(SERVER.ini.length - 3);
    const touched = writeIni(withChanges(fromPreset("apocalypse"), {}, { ResetID: 12345, Seed: "abc" }), "en");
    expect(touched).toMatch(/^ResetID=12345$/m);
    expect(touched).toMatch(/^Seed=abc$/m);
    expect(touched).not.toMatch(/^ServerPlayerID=/m);
  });

  it("los cambios, la contraseña (es tu archivo) y los renglones desconocidos al final", () => {
    const c: Config = { ...withChanges(fromPreset("apocalypse"), {}, { PVP: false, MaxPlayers: 64, Password: "secreto" }), extraIni: ["Raro=1"] };
    const out = writeIni(c, "es");
    expect(out).toContain("PVP=false\n");
    expect(out).toContain("MaxPlayers=64\n");
    expect(out).toContain("Password=secreto\n");
    expect(out.endsWith("Raro=1\n")).toBe(true);
    expect(out).toContain("# Puerto inicial por defecto para los datos del jugador.");
  });
});
