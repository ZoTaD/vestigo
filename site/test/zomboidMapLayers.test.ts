/**
 * Las capas del Mapa de Project Zomboid (2026-09-30, Task 3): la lógica pura de `layers.ts`, sin navegador.
 *
 * - De un `zones/<id>.json` de región a las zonas de cada capa. Una zona que cruza la frontera entre dos regiones viene
 *   en las dos, y se dibuja una vez: se deduplica por `tipo|x,y,w,h|nombre|extras`, no por la posición sola, porque el
 *   juego tiene zonas idénticas que sólo cambian el piso o la dirección (y son dos zonas de verdad).
 * - El filtro de los puntos de aparición por profesión, con la regla del juego: un pueblo sin lista para esa profesión
 *   usa la de "desempleado".
 * - De una anotación de escondite a un marcador: el sello (su archivo) y el color, o el texto en el idioma de la página.
 *
 * Con los datos reales donde importa: la deduplicación tiene que dar lo mismo que cuenta la leyenda, y cada sello y cada
 * profesión de los datos tienen que resolverse.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import { MAP_COPY } from "../src/zomboid/map/copy";
import type { ItemRef } from "../src/zomboid/map/data";
import Legend from "../src/zomboid/map/Legend";
import StashCard from "../src/zomboid/map/StashCard";
import {
  annotationMark,
  parseZones,
  professionSlug,
  spawnMarks,
  spawnMissing,
  stashMainAnnotation,
  stashPin,
  zoneLabel,
  zonesAt,
  zonesIn,
  type Zone,
  type ZonesFile,
} from "../src/zomboid/map/layers";
import {
  ZONE_LAYER,
  type Annotation,
  type SpawnData,
  type StampDef,
  type Stash,
  type ZoneDefs,
} from "../src/zomboid/map/layerMeta";
import { ZONE_NAMES } from "../src/zomboid/map/zoneNames";
import { LAYERS, type LayerId } from "../src/zomboid/map/url";

const DATA = join(__dirname, "..", "..", "games", "zomboid", "data");
const WEB = join(DATA, "map", "web");
const read = <T,>(...parts: string[]): T => JSON.parse(readFileSync(join(...parts), "utf-8")) as T;

const ALL = new Set<LayerId>(LAYERS);
const only = (...ids: LayerId[]) => new Set<LayerId>(ids);
const world = { x0: 0, y0: 0, x1: 20000, y1: 20000 };

describe("de un zones/<id>.json a las zonas de cada capa", () => {
  // Dos regiones vecinas: el mismo lugar para autos de la policía está en las dos (cruza la frontera).
  const a: ZonesFile = {
    zones: {
      ParkingStall: [
        [1495, 10, 10, 5, "police"],
        [20, 10, 3, 5],
        [20, 10, 3, 5, "", { d: "N" }],
        [20, 10, 3, 5, "", { d: "S" }],
      ],
      Basement: [[30, 30, 8, 8, "", { stair: [2, 0, "S"] }]],
      LootZone: [
        [40, 40, 5, 5, "Rich"],
        [40, 40, 5, 5, "Rich", { z: 1 }],
      ],
      Region: [[0, 0, 1500, 1500, "Muldraugh"]],
    },
    zonesP: { Forest: [{ p: [100, 100, 200, 100, 200, 200, 100, 200] }] },
  };
  const b: ZonesFile = {
    zones: { ParkingStall: [[1495, 10, 10, 5, "police"]], TownZone: [[1500, 0, 300, 300]] },
    zonesP: { Forest: [{ p: [100, 100, 200, 100, 200, 200, 100, 200] }], Ranch: [{ p: [1600, 0, 1650, 0, 1650, 50], n: "cow" }] },
  };
  const za = parseZones(a);
  const zb = parseZones(b);

  it("cada tipo va a su capa, y las regiones con nombre (Region) no son capa", () => {
    expect(za.map((z) => z.kind)).not.toContain("Region");
    expect(ZONE_LAYER).toEqual({
      ParkingStall: "vehiculos",
      Forest: "recoleccion",
      DeepForest: "recoleccion",
      Vegitation: "recoleccion",
      FarmLand: "recoleccion",
      Farm: "recoleccion",
      TownZone: "recoleccion",
      TrailerPark: "recoleccion",
      Ranch: "animales",
      Basement: "sotanos",
      ZombiesType: "zombis",
      ZoneStory: "historias",
      LootZone: "botin",
      BuildingName: "edificios",
    });
  });

  it("lee el rectángulo, el nombre y los extras (piso, dirección, escalera); los polígonos con su caja", () => {
    const basement = za.find((z) => z.kind === "Basement")!;
    expect(basement).toMatchObject({ rect: [30, 30, 8, 8], box: [30, 30, 38, 38], name: "", stair: [2, 0, "S"] });
    expect(za.find((z) => z.kind === "LootZone" && z.z === 1)).toBeTruthy();
    expect(za.find((z) => z.kind === "ParkingStall" && z.d === "N")).toBeTruthy();
    const ranch = zb.find((z) => z.kind === "Ranch")!;
    expect(ranch).toMatchObject({ name: "cow", box: [1600, 0, 1650, 50] });
    expect(ranch.poly).toEqual([1600, 0, 1650, 0, 1650, 50]);
  });

  it("deduplica lo que viene en dos regiones por tipo|x,y,w,h|nombre|extras: el piso y la dirección cuentan", () => {
    const got = zonesIn([za, zb], world, ALL);
    const stalls = got.filter((z) => z.kind === "ParkingStall");
    // La de la policía una vez; las tres del (20, 10) quedan: sin dirección, al norte y al sur son tres zonas.
    expect(stalls).toHaveLength(4);
    expect(stalls.filter((z) => z.name === "police")).toHaveLength(1);
    expect(got.filter((z) => z.kind === "LootZone")).toHaveLength(2);
    expect(got.filter((z) => z.kind === "Forest")).toHaveLength(1);
  });

  it("sólo las capas prendidas y sólo lo que toca el rectángulo", () => {
    expect(zonesIn([za, zb], world, only("sotanos")).map((z) => z.kind)).toEqual(["Basement"]);
    expect(zonesIn([za, zb], { x0: 1550, y0: 0, x1: 1700, y1: 60 }, ALL).map((z) => z.kind).sort()).toEqual(["Ranch", "TownZone"]);
  });

  it("de abajo hacia arriba para dibujar (la recolección abajo, los autos arriba); al tocar, el de arriba primero", () => {
    const kinds = zonesIn([za, zb], world, ALL).map((z) => z.kind);
    expect(kinds.indexOf("Forest")).toBeLessThan(kinds.indexOf("ParkingStall"));
    expect(kinds.indexOf("TownZone")).toBeLessThan(kinds.indexOf("Basement"));
    // (1602, 1) cae en el corral y en el pueblo; (1500, 12), en el lugar de la policía (1495…1505) y en el pueblo.
    expect(zonesAt([za, zb], 1602, 1, ALL).map((z) => z.kind)).toEqual(["Ranch", "TownZone"]);
    expect(zonesAt([za, zb], 1500, 12, ALL).map((z) => z.kind)).toEqual(["ParkingStall", "TownZone"]);
    // Adentro del polígono del bosque sí; afuera del triángulo del corral, no.
    expect(zonesAt([za, zb], 150, 150, ALL).map((z) => z.kind)).toEqual(["Forest"]);
    expect(zonesAt([za, zb], 1601, 45, only("animales"))).toEqual([]);
  });

  it("con los datos reales: deduplicar todas las regiones da lo mismo que cuenta la leyenda (que sólo cuenta lo que pasa en el juego)", () => {
    const meta = read<{ counts: { zones: Record<string, number> } }>(DATA, "map", "meta.json");
    const defs = read<{ zoneDefs: ZoneDefs }>(WEB, "common.json").zoneDefs;
    const regions = readdirSync(join(WEB, "zones")).filter((f) => f.endsWith(".json"));
    const all = zonesIn(
      regions.map((f) => parseZones(read<ZonesFile>(WEB, "zones", f), defs)),
      { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 },
      ALL,
    );
    const got: Record<string, number> = {};
    for (const z of all) got[z.kind] = (got[z.kind] ?? 0) + 1;
    // Los lugares para autos sin tabla se dibujan (rotulados "acá no aparecen autos") pero no se cuentan: ahí no pasa nada.
    const noCars = all.filter((z) => z.kind === "ParkingStall" && zoneLabel(z, ZONE_NAMES.es, defs).endsWith(ZONE_NAMES.es.zone.noVehicles));
    expect(noCars.length).toBeGreaterThan(50);
    got.ParkingStall -= noCars.length;
    expect(got).toEqual(meta.counts.zones);
    expect(meta.counts.zones.ParkingStall).toBeGreaterThan(9000);
  });

  it("el sótano de la región de Muldraugh trae su escalera", () => {
    const mul = parseZones(read<ZonesFile>(WEB, "zones", "7_6.json"));
    const basements = mul.filter((z) => z.kind === "Basement");
    expect(basements.length).toBeGreaterThan(10);
    for (const z of basements) expect(z.stair).toHaveLength(3);
  });
});

describe("lo que dice cada zona al tocarla", () => {
  const es = ZONE_NAMES.es;
  const en = ZONE_NAMES.en;
  const defs = read<{ zoneDefs: ZoneDefs }>(WEB, "common.json").zoneDefs;
  const zone = (kind: Zone["kind"], name = "", extra: Partial<Zone> = {}): Zone => ({
    kind,
    name,
    key: kind,
    box: [0, 0, 1, 1],
    area: 1,
    rect: [0, 0, 1, 1],
    ...extra,
  });
  const label = (kind: Zone["kind"], name = "", t = es, extra: Partial<Zone> = {}) => zoneLabel(zone(kind, name, extra), t, defs);

  it("el tipo de vehículo, la especie, el tipo de zombi y la historia, en los dos idiomas", () => {
    expect(label("ParkingStall", "police")).toBe("Vehículos: policía");
    expect(label("ParkingStall", "police", en)).toBe("Vehicles: police");
    // El juego busca los autos en minúsculas: "Police" es la misma tabla.
    expect(label("ParkingStall", "Police")).toBe("Vehículos: policía");
    expect(label("ParkingStall")).toBe("Vehículos: cualquier auto");
    expect(label("ParkingStall", "parkingstall")).toBe("Vehículos: cualquier auto");
    // El embotellamiento "rtrafficjam…" sólo sale una de cada diez veces (Rand.Next(100) < 10 en IsoChunk); el otro, siempre.
    expect(label("ParkingStall", "rtrafficjamw")).toBe("Vehículos: a veces un embotellamiento");
    expect(label("ParkingStall", "rtrafficjamw", en)).toBe("Vehicles: sometimes a traffic jam");
    expect(label("ParkingStall", "trafficjamW")).toBe("Vehículos: embotellamiento");
    expect(label("Ranch", "cowlarge")).toBe("Animales: vacas (corral grande)");
    expect(label("Ranch", "notchicken")).toBe("Animales: vacas, ovejas o chanchos");
    expect(label("ZombiesType", "Offices")).toBe("Zombis: oficinistas");
    // Las claves que en el juego son otra tabla ("Coffeshop" = CoffeeShop) se nombran como esa tabla.
    expect(label("ZombiesType", "Coffeshop")).toBe(label("ZombiesType", "CoffeeShop"));
    expect(label("ZombiesType", "Swimmer")).toBe("Zombis: bañistas");
    expect(label("ZoneStory", "Forest")).toBe("Historia: una escena al azar en el bosque");
    expect(label("ZoneStory", "Lake", en)).toBe("Story: a random scene by the lake");
    expect(label("ZoneStory", "Baseball")).toBe("Historia: un partido de béisbol");
    expect(label("Forest")).toBe("Recolección: bosque");
    expect(label("LootZone", "Rich")).toBe("Botín rico");
  });

  it("sólo lo que el juego define: los nombres que no están (erratas, espacios, mayúsculas) son los de todo el mundo", () => {
    // ZombiesZoneDefinition busca el nombre tal cual: " Offices", "Office" o "church" usan `Default`.
    for (const n of [" Offices", "Office", "Church", "church", "Farmer", "MusicFest", "SomeNewPlace"])
      expect(label("ZombiesType", n), n).toBe("Zombis: variados");
    expect(label("ZombiesType", "SomeNewPlace", en)).toBe("Zombies: mixed");
    // Un lugar para autos con un tipo que el juego no tiene no pone ninguno (ni "ejército", que no existe en 42.21).
    for (const n of ["army", "burnt", "spiffos", "racecar12", "trafficjamne"])
      expect(label("ParkingStall", n), n).toBe(`Vehículos: ${es.zone.noVehicles}`);
    // Sin jerga: "acá no aparecen autos", no "sin tipo".
    expect(es.zone.noVehicles).toBe("acá no aparecen autos");
    expect(en.zone.noVehicles).toBe("no cars spawn here");
    // Las historias se comparan con `String.equals` (con mayúsculas): el juego usa "KirstyKormick", no "KirstyCormick".
    expect(label("ZoneStory", "Forest")).toBe("Historia: una escena al azar en el bosque");
    expect(label("ZoneStory", "Duke"), "un nombre que el juego usa y la tabla no trae va separado en palabras").toBe("Historia: Duke");
  });

  it("las zonas de historia que el juego nunca arma no son historias: parseZones las deja afuera", () => {
    const file: ZonesFile = {
      zones: { ZoneStory: [[0, 0, 5, 5, "Forest"], [10, 0, 5, 5, "forest"], [20, 0, 5, 5], [30, 0, 5, 5, "KirstyCormick"], [40, 0, 5, 5, "KirstyKormick"]] },
      zonesP: { ZoneStory: [{ p: [0, 0, 9, 0, 9, 9], n: "NewsStory" }, { p: [0, 0, 9, 0, 9, 9], n: "Lake" }, { p: [0, 0, 9, 0, 9, 9] }] },
    };
    const names = (z: Zone[]) => z.filter((x) => x.kind === "ZoneStory").map((x) => x.name).sort();
    expect(names(parseZones(file, defs))).toEqual(["Forest", "KirstyKormick", "Lake"]);
    // Sin `defs` (los tests de geometría) entran todas.
    expect(names(parseZones(file))).toHaveLength(8);
  });

  it("con los datos reales: las zonas de historia sin historia son estas (salen de las clases del .jar vía zoneDefs.stories)", () => {
    const zones = read<{ zones: Record<string, { n?: string }[]> }>(DATA, "map", "zones.json").zones.ZoneStory;
    const dead = zones.filter((z) => !defs.stories.includes(z.n ?? ""));
    // 18 de 171: 11 sin nombre, 4 "forest" en minúscula, NewsStory, nolans y KirstyCormick (con C: el juego dice K).
    expect(dead).toHaveLength(18);
    expect([...new Set(dead.map((z) => z.n ?? ""))].sort()).toEqual(["", "KirstyCormick", "NewsStory", "forest", "nolans"]);
    expect(dead.filter((z) => !z.n)).toHaveLength(11);
    // Las que quedan son las de las clases del juego, y ninguna de las muertas aparece en la capa ni en el buscador.
    expect([...new Set(zones.filter((z) => defs.stories.includes(z.n ?? "")).map((z) => z.n))].sort()).toEqual([
      "Baseball", "Beach", "Forest", "FrankHemingway", "Lake", "MusicFest", "MusicFestStage", "SirTwiggy",
    ]);
    const search = read<{ k: string; en: string }[]>(WEB, "search.json").filter((h) => h.k === "story").map((h) => h.en);
    for (const gone of ["Kirsty Cormick", "Nolans", "News Story"]) expect(search, gone).not.toContain(gone);
    // `zoneDefs.stories` es exactamente lo que el juego usa en 42.21 (más Duke, que ninguna zona de este mapa usa).
    expect(defs.stories).toEqual(["Baseball", "Beach", "Duke", "Forest", "FrankHemingway", "KirstyKormick", "Lake", "MusicFest", "MusicFestStage", "SirTwiggy"]);
  });

  it("con los datos reales: estos son los nombres de zombis del mapa que el juego no define (usan `Default`)", () => {
    const zones = read<{ zones: Record<string, { n?: string }[]> }>(DATA, "map", "zones.json").zones;
    const undefinedNames = [...new Set(zones.ZombiesType.map((z) => z.n ?? ""))].filter((n) => n && !Object.hasOwn(defs.zombies, n)).sort();
    // Si un parche arregla o suma alguno, esta lista cambia a propósito: se revisa y se actualiza.
    expect(undefinedNames).toEqual(
      [" ConstructionSite", " Factory", " Offices", " ThunderGas", "Athletics", "Butcher", "Cafe", "Church", "church", "CoffeShop", "FancyRestaurant", "Farmer", "Football", "MusicFest", "Office", "shootingrange", "StreetSport"].sort(),
    );
    const vehicles = [...new Set(zones.ParkingStall.map((z) => z.n ?? ""))].filter((n) => label("ParkingStall", n).endsWith(es.zone.noVehicles)).sort();
    expect(vehicles).toEqual(["army", "burnt", "racecar12", "racecar34", "racecar58", "rtrafficjamns", "shitmobile", "spiffos", "trafficjamne"]);
  });

  it("el sótano aclara que es posible y al azar en cada partida", () => {
    expect(label("Basement", "", es, { stair: [2, 0, "S"] })).toMatch(/posible.*azar/i);
    expect(label("Basement", "", en, { stair: [2, 0, "S"] })).toMatch(/possible.*random/i);
  });

  it("los edificios con nombre, separados en palabras; un nombre que no está en la tabla también", () => {
    expect(label("BuildingName", "KnoxBank")).toBe("Knox Bank");
    expect(label("BuildingName", "BinkysFarm", en)).toBe("Binky's Farm");
  });

  it("el piso, si no es la planta baja", () => {
    expect(label("LootZone", "Rich", es, { z: 1 })).toBe("Botín rico · piso 1");
  });

  it("con los datos reales: cada tipo de vehículo, de zombi, de corral y de historia que el juego define tiene nombre propio", () => {
    const zones = read<{ zones: Record<string, { n?: string }[]> }>(DATA, "map", "zones.json").zones;
    for (const t of [es, en]) {
      for (const [kind, table] of [
        ["ParkingStall", t.vehicleTypes],
        ["ZombiesType", t.zombieTypes],
        ["ZoneStory", t.stories],
      ] as const) {
        for (const n of new Set(zones[kind].map((z) => z.n ?? ""))) {
          if (kind === "ZoneStory" && !defs.stories.includes(n)) continue; // no se muestra (ver arriba)
          const text = zoneLabel(zone(kind, n), t, defs);
          // Traducido: sale de la tabla (o es el respaldo de "no definido"), nunca el nombre del juego separado en palabras.
          expect(Object.values(table).concat(t.zone.noVehicles).some((v) => text.endsWith(`: ${v}`)), `${kind} "${n}": ${text}`).toBe(true);
        }
      }
      for (const n of new Set(zones.Ranch.map((z) => z.n ?? ""))) {
        const text = zoneLabel(zone("Ranch", n), t, defs);
        const species = Object.values(t.ranch.species);
        expect(species.some((v) => text === t.zone.animals(v) || text.startsWith(t.zone.animals(`${v} (`))), `Ranch "${n}": ${text}`).toBe(true);
      }
    }
  });
});

describe("los puntos de aparición por profesión", () => {
  const known = new Set(["mechanic", "custom-occupation", "fishing-guide", "chef", "doctor", "fitness-instructor", "welder"]);

  it("pasa los nombres del juego (B41 y B42) al slug de la ficha", () => {
    expect(professionSlug("mechanics", known)).toBe("mechanic");
    expect(professionSlug("mechanic", known)).toBe("mechanic");
    expect(professionSlug("angler", known)).toBe("fishing-guide");
    expect(professionSlug("fisherman", known)).toBe("fishing-guide");
    expect(professionSlug("unemployed", known)).toBe("custom-occupation");
    expect(professionSlug("fitnessInstructor", known)).toBe("fitness-instructor");
    expect(professionSlug("metalworker", known)).toBe("welder");
    expect(professionSlug("all", known)).toBeNull();
    expect(professionSlug("astronaut", known)).toBeNull();
  });

  const data: SpawnData = {
    towns: [
      {
        id: "Muldraugh, KY",
        name: "Muldraugh, KY",
        points: [
          [1, 1, 0, ["chef", "unemployed"]],
          [2, 2, 0, ["unemployed"]],
          [3, 3, 1, ["mechanics"]],
        ],
      },
      { id: "Ekron, KY", name: "Ekron, KY", points: [[9, 9, 0, ["unemployed"]]] },
    ],
    zones: [
      [5, 5, 0, ["all"]],
      [6, 6, 0, ["angler"]],
    ],
  };
  const at = (prof: string | null) => spawnMarks(data, prof, known).map((m) => m.x);

  it("sin filtro, todos, con su pueblo y sus profesiones", () => {
    const marks = spawnMarks(data, null, known);
    expect(marks.map((m) => m.x)).toEqual([1, 2, 3, 9, 5, 6]);
    expect(marks[0]).toMatchObject({ town: "Muldraugh", profs: ["chef", "custom-occupation"], all: false, z: 0 });
    expect(marks[2]).toMatchObject({ z: 1, profs: ["mechanic"] });
    expect(marks[4]).toMatchObject({ town: null, all: true });
    // Un pueblo con sólo la lista de desempleado recibe a todas las profesiones.
    expect(marks[3]).toMatchObject({ town: "Ekron", all: true });
  });

  it("con una profesión: sus puntos; un pueblo sin lista para ella usa la de desempleado; los de todas siempre", () => {
    expect(at("mechanic")).toEqual([3, 9, 5]);
    expect(at("chef")).toEqual([1, 9, 5]);
    expect(at("fishing-guide")).toEqual([1, 2, 9, 5, 6]);
  });

  it("con los datos reales: los puntos que nombran casi todas dicen cuáles faltan (no \"todas\")", () => {
    const index = read<{ sec: string; id: string }[]>(DATA, "index.json");
    const slugs = new Set(index.filter((e) => e.sec === "professions").map((e) => e.id));
    const spawns = read<{ spawns: SpawnData }>(WEB, "common.json").spawns;
    const almost = spawnMarks(spawns, null, slugs).filter((m) => spawnMissing(m, slugs).length === 2);
    expect(almost.length).toBe(40);
    for (const m of almost) expect(spawnMissing(m, slugs).sort()).toEqual(["doctor", "engineer"]);
    expect(spawnMissing({ x: 0, y: 0, z: 0, town: null, profs: [], all: true }, slugs)).toEqual([]);
    expect(MAP_COPY.es.spawn.allBut(new Intl.ListFormat("es", { type: "conjunction" }).format(["Médico", "Ingeniero"]))).toBe(
      "todas menos Médico e Ingeniero",
    );
  });

  it("con los datos reales: cada profesión de los puntos es una ficha de Profesiones", () => {
    const index = read<{ sec: string; id: string }[]>(DATA, "index.json");
    const slugs = new Set(index.filter((e) => e.sec === "professions").map((e) => e.id));
    const spawns = read<{ spawns: SpawnData }>(WEB, "common.json").spawns;
    const tokens = new Set([...spawns.towns.flatMap((t) => t.points), ...spawns.zones].flatMap((p) => p[3]));
    for (const t of tokens) if (t !== "all") expect(professionSlug(t, slugs), t).not.toBeNull();
    // Y cada profesión tiene al menos un lugar donde aparecer (por la de desempleado, si no tiene propia).
    for (const s of slugs) expect(spawnMarks(spawns, s, slugs).length, s).toBeGreaterThan(0);
  });
});

describe("de una anotación de escondite a un marcador", () => {
  const stamps: Record<string, StampDef> = {
    Circle: { file: "map_o.png", group: "Symbols" },
    X: { file: "map_x.png", group: "Symbols" },
    Cross: { file: "map_cross.png", group: "Symbols" },
  };
  const note: Annotation = { x: 2121, y: 6019, color: "#a60e0e", text: "Piano teacher's house", es: "Casa de profe de piano" };

  it("un sello: su archivo (Circle es map_o.png) y su color", () => {
    expect(annotationMark({ x: 2174, y: 6012, color: "#a60e0e", stamp: "Circle" }, "es", stamps)).toEqual({
      kind: "stamp",
      x: 2174,
      y: 6012,
      color: "#a60e0e",
      src: "/zomboid/map/stamps/map_o.png",
    });
    expect(annotationMark({ x: 0, y: 0, color: "#a60e0e", stamp: "Unicornio" }, "es", stamps)).toBeNull();
  });

  it("un texto, en el idioma de la página si el juego lo tradujo", () => {
    expect(annotationMark(note, "es", stamps)).toEqual({ kind: "text", x: 2121, y: 6019, color: "#a60e0e", text: "Casa de profe de piano" });
    expect(annotationMark(note, "en", stamps)).toMatchObject({ text: "Piano teacher's house" });
    expect(annotationMark({ ...note, es: undefined }, "es", stamps)).toMatchObject({ text: "Piano teacher's house" });
  });

  it("un color que no es #rrggbb no pasa al estilo", () => {
    expect(annotationMark({ ...note, color: "red;background:url(x)" }, "en", stamps)).toMatchObject({ color: "#212121" });
  });

  it("de lejos, el escondite es un solo sello: el más cercano al lugar, puesto en el lugar", () => {
    const stash = {
      building: [2174, 6011] as [number, number],
      annotations: [{ x: 2086, y: 6020, color: "#a60e0e", stamp: "Cross" }, { x: 2174, y: 6012, color: "#28307d", stamp: "Circle" }, note],
    };
    expect(stashPin(stash, stamps)).toEqual({ x: 2174, y: 6011, color: "#28307d", src: "/zomboid/map/stamps/map_o.png" });
    // Sin sellos (sólo texto), una X del color de la nota.
    expect(stashPin({ building: [1, 2], annotations: [note] }, stamps)).toEqual({ x: 1, y: 2, color: "#a60e0e", src: "/zomboid/map/stamps/map_x.png" });
  });

  it("la anotación que marca el escondite (la que se enfoca de cerca): el sello más cercano, o la primera nota", () => {
    const stash = {
      building: [2174, 6011] as [number, number],
      annotations: [note, { x: 2086, y: 6020, color: "#a60e0e", stamp: "Cross" }, { x: 2174, y: 6012, color: "#28307d", stamp: "Circle" }],
    };
    expect(stashMainAnnotation(stash, stamps)).toBe(2);
    expect(stashMainAnnotation({ building: [1, 2], annotations: [{ x: 0, y: 0, color: "#000000", stamp: "Unicornio" }, note] }, stamps)).toBe(1);
    expect(stashMainAnnotation({ building: [1, 2], annotations: [] }, stamps)).toBe(-1);
    // Con los datos reales, todos los escondites tienen una: ninguno queda sin elemento para el teclado de cerca.
    const common = read<{ stamps: Record<string, StampDef>; stashes: Stash[] }>(WEB, "common.json");
    for (const s of common.stashes) {
      const i = stashMainAnnotation(s, common.stamps);
      expect(i, s.id).toBeGreaterThanOrEqual(0);
      expect(annotationMark(s.annotations[i], "es", common.stamps), s.id).not.toBeNull();
    }
  });

  it("con los datos reales: cada sello de cada escondite tiene su archivo en el sitio", () => {
    const common = read<{ stamps: Record<string, StampDef>; stashes: { annotations: Annotation[] }[] }>(WEB, "common.json");
    const pub = join(__dirname, "..", "public");
    let stampsSeen = 0;
    for (const s of common.stashes) {
      for (const a of s.annotations) {
        const m = annotationMark(a, "es", common.stamps);
        // El juego trae dos anotaciones vacías (`addStamp(nil, "", …)` en Louisville): no hay nada que dibujar.
        if (a.stamp || a.text) expect(m, JSON.stringify(a)).not.toBeNull();
        else expect(m).toBeNull();
        if (m?.kind === "stamp") {
          stampsSeen++;
          expect(existsSync(join(pub, m.src)), m.src).toBe(true);
        }
      }
    }
    expect(stampsSeen).toBeGreaterThan(200);
  });

  it("con los datos reales: el mapa de cada escondite tiene ficha de objeto para enlazar", () => {
    const common = read<{ stashes: { item: string }[]; items: Record<string, { id: string; en: string; es: string }> }>(WEB, "common.json");
    for (const s of common.stashes) expect(common.items[s.item], s.item).toMatchObject({ id: expect.stringMatching(/^map-/) });
  });
});

describe("la leyenda y la hoja del escondite, en el servidor", () => {
  const html = (lang: "en" | "es", el: ReactElement) =>
    renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
  const meta = read<{ counts: { zones: Record<string, number>; lootRich: number; spawns: number; stashes: number } }>(DATA, "map", "meta.json");
  const legend = (lang: "en" | "es", layers: LayerId[], zoom = 2) =>
    html(lang, createElement(Legend, { layers, onToggle: () => undefined, prof: null, onProf: () => undefined, zoom }));

  it("la densidad de zombis: apagada, sólo el nombre; prendida, la clave menos/más y nunca una cuenta", () => {
    expect(legend("es", [])).not.toContain("menos zombis");
    for (const [lang, name, less, more] of [
      ["es", "Densidad de zombis", "menos zombis", "más zombis"],
      ["en", "Zombie density", "fewer zombies", "more zombies"],
    ] as const) {
      const html = legend(lang, ["densidad"]);
      expect(html).toContain(name);
      expect(html).toContain(less);
      expect(html).toContain(more);
      expect(html).not.toMatch(/\d+ zombi/); // nunca una cuenta
      expect(html).not.toMatch(/game files|archivos del juego/i);
    }
  });

  it("la leyenda entra al prerender: cada capa con su nombre y cuántas hay en todo Knox County", () => {
    const es = legend("es", []);
    for (const id of LAYERS) expect(es).toContain(MAP_COPY.es.layers.names[id]);
    const n = (v: number) => v.toLocaleString("es-AR");
    expect(es).toContain(n(meta.counts.zones.ParkingStall));
    expect(es).toContain(n(meta.counts.spawns));
    expect(es).toContain(`>${n(meta.counts.stashes)}<`);
    // Apagadas: ni la explicación ni el filtro.
    expect(es).not.toContain("<select");
    expect(es).not.toContain(MAP_COPY.es.layers.about.sotanos);
    const en = legend("en", []);
    expect(en).toContain(MAP_COPY.en.layers.names.escondites);
    expect(en).toContain(meta.counts.zones.ParkingStall.toLocaleString("en-US"));
  });

  it("el botín rico cuenta sólo las zonas Rich (objects.lua trae además una Poor)", () => {
    expect(meta.counts.lootRich).toBe(meta.counts.zones.LootZone - 1);
    const botin = legend("es", []).match(/Botín rico<\/span><span class="pzm-layer-n">([^<]+)</)?.[1];
    expect(botin).toBe(String(meta.counts.lootRich));
  });

  it("una capa de zonas prendida que a este zoom no se dibuja dice que hay que acercarse", () => {
    const far = MAP_COPY.es.layers.zoomIn;
    const count = (s: string) => s.split(far).length - 1;
    // Al zoom 2 se ven todas; al 1, la recolección y los autos todavía no; al 0, ninguna capa de zonas.
    expect(count(legend("es", ["vehiculos", "recoleccion", "zombis", "escondites"], 2))).toBe(0);
    expect(count(legend("es", ["vehiculos", "recoleccion", "zombis", "escondites"], 1))).toBe(2);
    expect(count(legend("es", ["vehiculos", "recoleccion", "zombis", "escondites"], 0))).toBe(3);
    // Como Leaflet elige la tesela: 1,5 redondea a 2.
    expect(count(legend("es", ["recoleccion"], 1.5))).toBe(0);
    expect(legend("en", ["zombis"], -1)).toContain(MAP_COPY.en.layers.zoomIn);
  });

  it("prendidas: qué muestra cada una, la clave de la recolección y el filtro de profesiones", () => {
    const es = legend("es", ["recoleccion", "sotanos", "apariciones"]);
    expect(es).toContain(MAP_COPY.es.layers.about.sotanos);
    for (const k of ["bosque", "vegetación", "pueblo"]) expect(es).toContain(k);
    expect(es).toMatch(/<select[^>]*>.*Todas las profesiones.*Mecánico/s);
  });

  const common = read<{ stashes: Stash[]; items: Record<string, ItemRef> }>(WEB, "common.json");
  const card = (lang: "en" | "es", stash: Stash) =>
    html(
      lang,
      createElement(StashCard, {
        stash,
        items: common.items,
        route: parseRoute(`/${lang}/project-zomboid/${lang === "es" ? "mapa" : "map"}`),
        navigate: () => undefined,
        onClose: () => undefined,
      }),
    );

  it("la hoja del escondite: el mapa con enlace a su ficha, qué esconde y cómo está el lugar", () => {
    const stash = common.stashes.find((s) => s.id === "BBurgStashMap1")!;
    const en = card("en", stash);
    expect(en).toContain('href="/en/project-zomboid/items/map-rosewood"');
    expect(en).toContain("Map: Rosewood");
    expect(en).toContain("Brandenburg");
    expect(en).toContain(MAP_COPY.en.stash.loots.gun);
    expect(en).toContain(MAP_COPY.en.stash.zombies(5, "5"));
    expect(MAP_COPY.es.stash.zombies(1, "1")).toBe("1 zombi alrededor");
    expect(MAP_COPY.en.stash.zombies(1, "1")).toBe("1 zombie around the place");
    const es = card("es", stash);
    expect(es).toContain("Mapa: Rosewood");
    expect(es).toContain(MAP_COPY.es.stash.barricades("50"));
  });

  it("las notas de los mapas no salen del mapa: ninguna hoja de escondite las repite (hay palabrotas del juego)", () => {
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
    for (const stash of common.stashes) {
      for (const lang of ["en", "es"] as const) {
        const out = card(lang, stash);
        for (const a of stash.annotations) {
          for (const text of [a.text, a.es]) {
            // Las de una sola palabra corta pueden ser el nombre del pueblo ("ekron", "IRVINGTON"): esas no cuentan.
            if (text && text.length > 10) expect(out, `${stash.id}: ${text}`).not.toContain(escape(text));
          }
        }
      }
    }
  });
});
