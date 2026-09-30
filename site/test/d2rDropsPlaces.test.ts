/**
 * Los lugares de la calculadora de drops: cómo muere cada jefe, superúnico y monstruo de un área, y los mejores lugares. Las
 * chances con 1e-6 de tolerancia (`exact`) son del evaluador exacto independiente del repo, `games/d2r/tools/drops_check.py`:
 *   python games/d2r/tools/drops_check.py
 * (desde la raíz, después de drops.py) las vuelve a imprimir, junto con las de d2rDropsEngine.test.ts.
 */
import { describe, expect, it } from "vitest";
import { chancePerKill } from "../src/d2r/drops/engine";
import { dropData } from "../src/d2r/drops/data";
import { areaDropsOf, areaKills, bestPlaces, CATS, dropsOf, NO_TZ, placeKill, sourceKill, terrorLevel, type AreaRow, type PlaceOpts } from "../src/d2r/drops/places";
import type { Settings, Target } from "../src/d2r/drops/types";

const D = dropData();
const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const SHAKO: Target = { k: "u", id: "harlequin-crest" };
const IST: Target = { k: "b", code: "r24" };
const src = (id: string) => D.sourceById.get(id)!;
/** Referencias del evaluador exacto (drops_check.py) sobre el parche instalado, con el tope de 6. */
const exact = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(1e-6);

describe("jefes y superúnicos", () => {
  it("los jefes conservan su nivel; los superúnicos toman el del área y suman 3", () => {
    expect(sourceKill(D, src("mephisto"), 2, NO_TZ)?.mlvl).toBe(87);
    expect(sourceKill(D, src("the-countess"), 2, NO_TZ)?.mlvl).toBe(82); // Sótano de la torre 5: 79 + 3
    expect(sourceKill(D, src("pindleskin"), 2, NO_TZ)?.mlvl).toBe(86); // Templo de Nihlathak: 83 + 3
    expect(sourceKill(D, src("mephisto"), 2, NO_TZ)?.tc).toBe("Mephisto (H)");
  });

  it("Ist de la Condesa, Pindleskin y Eldritch; Shako de Mefisto, Radament y el Invocador", () => {
    exact(chancePerKill(D, IST, sourceKill(D, src("the-countess"), 2, NO_TZ)!, S0), 0.00348609357);
    exact(chancePerKill(D, IST, sourceKill(D, src("pindleskin"), 2, NO_TZ)!, S0), 2.94455037e-5);
    exact(chancePerKill(D, IST, sourceKill(D, src("eldritch-the-rectifier"), 2, NO_TZ)!, S0), 2.94455037e-5);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("mephisto"), 2, NO_TZ)!, S0), 0.000561844573);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("radament"), 2, NO_TZ)!, S0), 6.32257558e-5);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("the-summoner"), 2, NO_TZ)!, S0), 5.94030562e-5);
  });

  it("la Condesa sin el tope da el número de Silospen en vivo; con el tope de 6, las runas pierden un 18%", () => {
    const k = sourceKill(D, src("the-countess"), 2, NO_TZ)!;
    exact(chancePerKill(D, IST, k, S0, { cap: false }), 0.00423972729);
    expect(chancePerKill(D, IST, k, S0)).toBeLessThan(0.0036);
  });

  it("aterrorizado a nivel 90, Mefisto pasa a 95 (92 de la zona más el +3 de único) y usa su TC de Zona de Terror", () => {
    const k = sourceKill(D, src("mephisto"), 2, { ...NO_TZ, tz: 90 })!;
    expect(k.desec).toBe(true);
    expect(k.mlvl).toBe(95);
    expect(k.tc).toMatch(/^Mephisto \(H\) Desecrated/);
  });

  it("aterrorizado con tu nivel en 99, un jefe llega a 99: el tope de Infierno (96) más el +3, que puede pasarlo", () => {
    expect(sourceKill(D, src("mephisto"), 2, { ...NO_TZ, tz: 99 })?.mlvl).toBe(99);
  });

  it("el +3 no pasa del tope + 3, y nadie baja de su nivel: Baal (99) sigue en 99, y en Pesadilla (75) en 75", () => {
    expect(sourceKill(D, src("baal"), 2, { ...NO_TZ, tz: 99 })?.mlvl).toBe(99);
    expect(sourceKill(D, src("baal"), 2, { ...NO_TZ, tz: 70 })?.mlvl).toBe(99);
    expect(sourceKill(D, src("baal"), 1, { ...NO_TZ, tz: 70 })?.mlvl).toBe(75);
    // Sin Zona de Terror el jefe sigue con su nivel, sin el +3.
    expect(sourceKill(D, src("mephisto"), 2, NO_TZ)?.mlvl).toBe(87);
  });

  it("el Clon de Diablo no tiene área y suelta el Annihilus", () => {
    const k = sourceKill(D, src("diablo-clone"), 2, NO_TZ)!;
    const anni = D.uniques.find((u) => u.key === "Annihilus")!;
    expect(chancePerKill(D, { k: "u", id: anni.id }, k, S0)).toBeGreaterThan(0.99);
  });

  it("el Clon de Diablo sólo aparece en Infierno", () => {
    expect(sourceKill(D, src("diablo-clone"), 0, NO_TZ)).toBeNull();
    expect(sourceKill(D, src("diablo-clone"), 1, NO_TZ)).toBeNull();
  });

  it("en Normal el superúnico usa su propio nivel y en Pesadilla el del área; el jefe siempre el suyo", () => {
    expect(sourceKill(D, src("the-countess"), 0, NO_TZ)?.mlvl).toBe(11); // el suyo, 8, + 3
    expect(sourceKill(D, src("the-countess"), 1, NO_TZ)?.mlvl).toBe(45); // Sótano de la torre 5: 42 + 3
    expect(sourceKill(D, src("mephisto"), 0, NO_TZ)?.mlvl).toBe(26);
    expect(sourceKill(D, src("mephisto"), 1, NO_TZ)?.mlvl).toBe(59);
  });

  it("la TC de un superúnico sube por su cadena según el nivel; la de un jefe no", () => {
    // Cadáver ardiente (nivel 82): `Act 1 (H) Super A` sube hasta `Act 4 (H) Super A` (nivel 81); la que sigue pide 84.
    expect(sourceKill(D, src("corpsefire"), 2, NO_TZ)).toMatchObject({ tc: "Act 4 (H) Super A", mlvl: 82 });
    // Talic, Ancestro Colosal, es un jefe: su TC encabeza una cadena de tres de nivel 110 y no pasa a la de Korlic.
    expect(sourceKill(D, src("colossal-talic"), 2, NO_TZ)?.tc).toBe("Uber Talic");
  });
});

describe("monstruos de un área: Pozo nivel 1 en Infierno (comunes y Zona de Terror: iguales a Silospen en vivo)", () => {
  const pit = D.areaById.get(12)!;
  const one = (cat: "normal" | "champ" | "unique", mon: string, tz = 0) =>
    areaKills(D, pit, 2, cat, { ...NO_TZ, tz }).find((k) => k.mon === mon)!.kill!;

  it("comunes, campeones y únicos", () => {
    exact(chancePerKill(D, SHAKO, one("normal", "skeleton3"), S0), 4.83630312e-7);
    exact(chancePerKill(D, SHAKO, one("normal", "cr_archer3"), S0), 3.92949629e-7);
    // Campeones y únicos: el 3.3 cambió `Act 5 (H) Citem C` y `Uitem C` (Silospen en vivo: 7,98e-6 y 2,02e-5).
    exact(chancePerKill(D, SHAKO, one("champ", "skeleton3"), S0), 7.03104478e-6);
    exact(chancePerKill(D, SHAKO, one("unique", "skeleton3"), S0), 2.06240741e-5);
  });

  it("aterrorizados con tu nivel en 90", () => {
    exact(chancePerKill(D, SHAKO, one("normal", "skeleton3", 90), S0), 4.92880073e-7);
    exact(chancePerKill(D, SHAKO, one("normal", "cr_archer3", 90), S0), 4.00465059e-7);
  });

  it("Normal sortea de `mon` (y de `umon` para los únicos); Pesadilla e Infierno, de `nmon`", () => {
    // Tierras Altas Gélidas: las tres listas son distintas (las del Pozo son iguales y no probarían nada).
    const hl = D.areaById.get(111)!;
    const ids = (diff: 0 | 1 | 2, cat: "normal" | "champ" | "unique") => areaKills(D, hl, diff, cat, NO_TZ).map((k) => k.mon);
    expect(ids(0, "normal")).toEqual(hl.mon);
    expect(ids(0, "champ")).toEqual(hl.mon);
    expect(ids(0, "unique")).toEqual(hl.umon);
    expect(ids(1, "normal")).toEqual(hl.nmon);
    for (const cat of ["normal", "champ", "unique"] as const) expect(ids(2, cat)).toEqual(hl.nmon);
  });
});

/**
 * Lo que los casos de referencia no tocan: en el Pozo, `skeleton3` y `cr_archer3` no tienen TC aterrorizado y caen
 * a la común, así que ninguno prueba las columnas de campeón, único y Heraldo de la Zona de Terror ni la misión.
 * Los nombres y los niveles salen de las cadenas de TC de los datos (Herald B nivel 93, Herald C 96, etc.).
 */
describe("Zona de Terror y misión", () => {
  const pit = D.areaById.get(12)!;
  const at = (cat: "champ" | "unique" | "herald", tier = 1) =>
    areaKills(D, pit, 2, cat, { tz: 90, tier, quest: false }).find((k) => k.mon === "skeleton3")!.kill!;

  it("el nivel aterrorizado: tu nivel + 2 entre los topes de la dificultad, o el propio si era mayor", () => {
    expect(terrorLevel(D, 87, 90, 2)).toBe(92);
    expect(terrorLevel(D, 87, 99, 2)).toBe(96); // el tope de Infierno
    expect(terrorLevel(D, 40, 10, 2)).toBe(70); // el piso de Infierno
    expect(terrorLevel(D, 99, 90, 2)).toBe(99);
    expect(terrorLevel(D, 5, 30, 0)).toBe(32);
  });

  it("campeones, únicos y Heraldos aterrorizados usan cada uno su TC de Zona de Terror", () => {
    expect(at("champ")).toMatchObject({ tc: "Act 5 (H) Champ C Desecrated", mlvl: 94, desec: true, herald: false });
    expect(at("unique")).toMatchObject({ tc: "Act 5 (H) Unique C Desecrated", mlvl: 95, desec: true, herald: false });
    // El Heraldo sube el nivel de TC que usa, no el del ítem: 95 llega a la B (nivel 93); con el nivel 2 (+3), a la C (96).
    expect(at("herald", 1)).toMatchObject({ tc: "Act 5 (H) Herald B", mlvl: 95, herald: true, tier: 1 });
    expect(at("herald", 2)).toMatchObject({ tc: "Act 5 (H) Herald C", mlvl: 95, herald: true, tier: 2 });
  });

  it("los Heraldos sólo aparecen aterrorizados y en Infierno", () => {
    expect(areaKills(D, pit, 2, "herald", NO_TZ)).toEqual([]);
    expect(areaKills(D, pit, 1, "herald", { ...NO_TZ, tz: 90 })).toEqual([]);
  });

  it("la primera muerte de misión usa la TC de misión del jefe; aterrorizado manda la de Zona de Terror", () => {
    expect(sourceKill(D, src("mephisto"), 2, { ...NO_TZ, quest: true })?.tc).toBe("Mephistoq (H)");
    expect(sourceKill(D, src("mephisto"), 2, { ...NO_TZ, tz: 90, quest: true })?.tc).toMatch(/^Mephisto \(H\) Desecrated/);
  });
});

/**
 * El evento de Pandemonio sólo existe en Infierno: la Guarida de la Matrona, las Arenas Olvidadas, la Forja del Dolor y el
 * Tristram de los Uber traen monstruos y niveles para las tres dificultades en las tablas, pero en Normal y Pesadilla no se
 * llega nunca.
 */
describe("las áreas de Pandemonio sólo existen en Infierno", () => {
  const PANDEMONIO = [133, 134, 135, 136];

  it("los datos las marcan y fuera de Infierno no dan ninguna muerte, de ningún tipo", () => {
    expect(D.areas.filter((a) => a.hell).map((a) => a.id)).toEqual(PANDEMONIO);
    for (const id of PANDEMONIO) {
      const area = D.areaById.get(id)!;
      for (const diff of [0, 1] as const) {
        for (const cat of CATS) expect(areaKills(D, area, diff, cat, { ...NO_TZ, tz: 90 }), `${id} ${diff} ${cat}`).toEqual([]);
      }
    }
    // En Infierno siguen ahí: la Guarida de la Matrona tiene sus monstruos.
    expect(areaKills(D, D.areaById.get(133)!, 2, "normal", NO_TZ).length).toBeGreaterThan(0);
  });

  it("la Cresta del arlequín, buscada en las tres dificultades, no las ofrece fuera de Infierno", () => {
    const { areas } = bestPlaces(D, SHAKO, { ...S0, mf: 300 }, NO_TZ, [0, 1, 2], 1000);
    expect(areas.filter((r) => PANDEMONIO.includes(r.area.id) && r.diff < 2).map((r) => r.key)).toEqual([]);
    expect(areas.some((r) => r.area.id === 133 && r.diff === 2)).toBe(true);
  });
});

/**
 * "Por cada monstruo que matás" es por cada monstruo que aparece: el peso de cada uno es su Rarity de monstats (0 = no aparece al
 * azar), y uno que aparece pero no tiene TC para ese tipo de muerte cuenta en el promedio con chance 0. Antes quedaba afuera del
 * denominador y la fila salía más alta: el Worldstone Keep 2 ×1,18 (el Engendro de hielo frenético, peso 2 de 13, no tiene TC) y
 * la Forja del Dolor ×1,33 (el Señor del Foso, peso 1 de 4).
 */
describe("la mezcla de monstruos de un área", () => {
  const S300 = { ...S0, mf: 300 };
  const rowOf = (areaId: number, diff: 0 | 1 | 2, target = SHAKO) =>
    bestPlaces(D, target, S300, NO_TZ, [diff], 1000).areas.find((r) => r.area.id === areaId && !r.tz)!;
  /** El promedio de los monstruos de `list`, cada uno con su Rarity; el que no tiene TC para ese tipo, con chance 0. */
  const mix = (areaId: number, diff: 0 | 1 | 2, cat: "normal" | "unique", list: string[], target = SHAKO) => {
    const area = D.areaById.get(areaId)!;
    const kills = areaKills(D, area, diff, cat, NO_TZ);
    let num = 0;
    let den = 0;
    for (const mon of list) {
      const kill = kills.find((k) => k.mon === mon)?.kill;
      den += D.monsters[mon].rar;
      num += kill ? D.monsters[mon].rar * chancePerKill(D, target, kill, S300) : 0;
    }
    return num / den;
  };
  const same = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(1e-12);

  it("el Worldstone Keep 2 y la Forja del Dolor promedian también al monstruo sin TC, con chance 0", () => {
    const wsk2 = D.areaById.get(129)!;
    const furnace = D.areaById.get(135)!;
    // Los dos monstruos que aparecen sin TC, con su peso.
    expect(D.monsters.suicideminion6).toMatchObject({ rar: 2, tc: [expect.anything(), expect.anything(), ["", "", "", "", "", "", "", ""]] });
    expect(D.monsters.megademon6).toMatchObject({ rar: 1, tc: [expect.anything(), expect.anything(), ["", "", "", "", "", "", "", ""]] });
    same(rowOf(129, 2).p.normal, mix(129, 2, "normal", wsk2.nmon));
    same(rowOf(135, 2).p.normal, mix(135, 2, "normal", furnace.nmon));
  });

  it("un monstruo con Rarity 0 no aparece al azar y no pesa: los únicos de Normal de los Salones del Dolor", () => {
    // La Burla de Baal (Rarity 0, sin TC) está en la lista: si pesara 1, la cifra bajaría un cuarto.
    const halls = D.areaById.get(123)!;
    const EL: Target = { k: "b", code: "r01" };
    expect(halls.umon.map((m) => D.monsters[m].rar)).toEqual([2, 1, 0]);
    same(rowOf(123, 0, EL).p.unique, mix(123, 0, "unique", halls.umon, EL));
  });

  it("la fila lleva el tipo de monstruo que la explica: el primero que suelta el ítem", () => {
    const crown = bestPlaces(D, { k: "u", id: "crown-of-ages" }, S300, NO_TZ, [2], 10).areas[0];
    expect(crown.p.normal).toBe(0);
    expect(crown.cat).toBe("champ");
    expect(bestPlaces(D, SHAKO, S300, NO_TZ, [2], 10).areas[0].cat).toBe("normal");
  });
});

/**
 * "¿Qué más suelta?" de una fila de área lleva a "¿Qué suelta?" de esa área: las dos tienen que dar el mismo número. La fila
 * promedia a todos los monstruos del área (cada uno con su peso); la lista del área también, y no el monstruo más común solo,
 * que en el Santuario Arcano casi duplicaba la chance de la Ber.
 */
describe("«¿Qué suelta?» de un área da el número de su fila en «¿Dónde lo farmeo?»", () => {
  const S300 = { ...S0, mf: 300 };
  const BER: Target = { k: "b", code: "r30" };
  const lineOf = (lists: ReturnType<typeof areaDropsOf>, t: Target) =>
    [...lists.runes, ...lists.uniques, ...lists.sets].find((l) => JSON.stringify(l.target) === JSON.stringify(t));
  /** Cada fila contra la lista de su área, su dificultad, su tipo de monstruo y su Zona de Terror. */
  const check = (target: Target, rows: AreaRow[], o: PlaceOpts) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const lists = areaDropsOf(D, row.area, row.diff, row.cat, { ...o, tz: row.tz ? o.tz : 0 }, S300);
      const got = lineOf(lists, target)?.p ?? 0;
      const want = row.p[row.cat];
      expect(Math.abs(got - want) / want, `${row.key} ${row.cat}: ${got} vs ${want}`).toBeLessThan(1e-12);
    }
  };

  it("la Ber en el Santuario Arcano de Infierno: el promedio de sus tres monstruos, no el Espectro solo", () => {
    const row = bestPlaces(D, BER, S300, NO_TZ, [2], 1000).areas.find((r) => r.area.id === 74)!;
    check(BER, [row], NO_TZ);
    // El monstruo más común (los tres pesan 1: el primero, el Espectro) da mucho más que la fila.
    const one = chancePerKill(D, BER, placeKill(D, { k: "a", id: 74, cat: "normal" }, 2, NO_TZ)!, S300);
    expect(one / row.p.normal).toBeGreaterThan(1.5);
  });

  it("la Cresta del arlequín en sus mejores áreas de Infierno, con y sin Zona de Terror", () => {
    check(SHAKO, bestPlaces(D, SHAKO, S300, NO_TZ, [2], 2).areas, NO_TZ);
    const tz = { ...NO_TZ, tz: 90 };
    const rows = bestPlaces(D, SHAKO, S300, tz, [2], 3).areas;
    expect(rows.some((r) => r.tz)).toBe(true);
    check(SHAKO, rows, tz);
  });

  it("las listas del área van como las de una muerte: runas en su orden, únicos y piezas de más a menos probable", () => {
    const lists = areaDropsOf(D, D.areaById.get(74)!, 2, "normal", NO_TZ, S300);
    const codes = lists.runes.map((l) => (l.target.k === "b" ? l.target.code : ""));
    expect(codes).toEqual([...codes].sort());
    expect(codes).toContain("r30");
    for (const list of [lists.uniques, lists.sets]) {
      expect(list.length).toBeGreaterThan(0);
      for (let i = 1; i < list.length; i++) expect(list[i - 1].p).toBeGreaterThanOrEqual(list[i].p);
      expect(list.every((l) => l.p > 0)).toBe(true);
    }
  });

  it("un área sin muertes (Pandemonio fuera de Infierno) no suelta nada", () => {
    expect(areaDropsOf(D, D.areaById.get(133)!, 1, "normal", NO_TZ, S300)).toEqual({ runes: [], uniques: [], sets: [] });
  });
});

describe("los mejores lugares y lo que suelta cada uno", () => {
  it("las siete Tumbas de Tal Rasha, que son la misma área, salen una sola vez", () => {
    const { areas } = bestPlaces(D, { k: "u", id: "goreshovel" }, S0, NO_TZ, [0, 1, 2], 30);
    const tombs = areas.filter((r) => r.area.n.en === "Tal Rasha's Tomb");
    expect(tombs.length).toBeGreaterThan(0);
    const keys = tombs.map((r) => `${r.diff}|${r.tz}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("para la Cresta del arlequín en Infierno, Mefisto, Diablo y Baal van primeros", () => {
    const { bosses, areas } = bestPlaces(D, SHAKO, S0, NO_TZ, [2], 5);
    expect(bosses.slice(0, 3).map((b) => b.src.id).sort()).toEqual(["baal", "diablo", "mephisto"]);
    expect(bosses[0].p).toBeGreaterThan(bosses[4].p);
    expect(areas.length).toBeGreaterThan(0);
    expect(areas[0].best).not.toBeNull();
  });

  it("para Ist, la Condesa es la mejor", () => {
    expect(bestPlaces(D, IST, S0, NO_TZ, [2], 3).bosses[0].src.id).toBe("the-countess");
  });

  it("las claves de lugar: s.<id>.<dif> y a.<área>.<dif>, con .tz si está aterrorizado, sin repetirse", () => {
    const { bosses, areas } = bestPlaces(D, SHAKO, S0, { ...NO_TZ, tz: 90 }, [2], 1000);
    const keys = (rows: { key: string }[]) => rows.map((r) => r.key);
    expect(keys(bosses)).toEqual(expect.arrayContaining(["s.mephisto.2", "s.mephisto.2.tz"]));
    expect(keys(areas)).toEqual(expect.arrayContaining(["a.12.2", "a.12.2.tz"]));
    for (const rows of [bosses, areas]) {
      expect(new Set(keys(rows)).size).toBe(rows.length);
      expect(rows.every((r) => r.tz === r.key.endsWith(".tz"))).toBe(true);
    }
    // Sin Zona de Terror, ninguna fila lleva la marca.
    expect(bestPlaces(D, SHAKO, S0, NO_TZ, [2], 1000).areas.some((a) => a.tz || a.key.endsWith(".tz"))).toBe(false);
    // El Clon de Diablo no tiene área: no se aterroriza y su fila no se repite.
    const anni: Target = { k: "u", id: D.uniques.find((u) => u.key === "Annihilus")!.id };
    const clone = bestPlaces(D, anni, S0, { ...NO_TZ, tz: 90 }, [2], 1000).bosses.filter((b) => b.src.id === "diablo-clone");
    expect(keys(clone)).toEqual(["s.diablo-clone.2"]);
  });

  it("la fila de un área promedia a sus monstruos pesados por su aparición, y las filas van de mayor a menor", () => {
    const { areas } = bestPlaces(D, SHAKO, S0, NO_TZ, [2], 1000);
    // Pozo 1: tres monstruos de peso 2 con `H2H C` y un arquero de peso 1 con `Miss C` (referencias del evaluador exacto).
    const row = areas.find((a) => a.key === "a.12.2")!;
    exact(row.p.normal, (6 * 4.83630312e-7 + 3.92949629e-7) / 7);
    exact(row.p.champ, 7.03104478e-6);
    exact(row.p.unique, 2.06240741e-5);
    expect(row.p.herald).toBe(0);
    for (let i = 1; i < areas.length; i++) expect(areas[i - 1].p.normal).toBeGreaterThanOrEqual(areas[i].p.normal);
  });

  it("la memoria por muerte no mezcla lugares: cada fila coincide con recalcular sus monstruos uno por uno", () => {
    const { areas } = bestPlaces(D, SHAKO, S0, { ...NO_TZ, tz: 90 }, [1, 2], 1000);
    expect(areas.length).toBeGreaterThan(100);
    for (const row of areas.filter((_, i) => i % 7 === 0)) {
      for (const cat of CATS) {
        const kills = areaKills(D, row.area, row.diff, cat, { ...NO_TZ, tz: row.tz ? 90 : 0 });
        const weight = kills.reduce((n, k) => n + k.w, 0);
        // El que aparece sin TC para ese tipo cuenta en el peso con chance 0.
        const want = weight ? kills.reduce((n, k) => n + (k.kill ? k.w * chancePerKill(D, SHAKO, k.kill, S0) : 0), 0) / weight : 0;
        expect(Math.abs(row.p[cat] - want), `${row.key} ${cat}: ${row.p[cat]} vs ${want}`).toBeLessThanOrEqual(1e-12 * want);
      }
    }
  });

  it("qué suelta Mefisto: la Cresta del arlequín con la chance del motor, y runas de El a Cham", () => {
    const lists = dropsOf(D, sourceKill(D, src("mephisto"), 2, NO_TZ)!, S0);
    const shako = lists.uniques.find((l) => l.target.k === "u" && l.target.id === "harlequin-crest")!;
    exact(shako.p, 0.000561844573);
    const codes = lists.runes.map((l) => (l.target.k === "b" ? l.target.code : ""));
    expect(codes).toContain("r01");
    // Zod (r33) sólo está en `Runes 17`, que sólo cuelga de `Act 5 (H) Good` y su variante del Heraldo: Mefisto llega a Cham (r32).
    expect(codes).toContain("r32");
    expect(codes).not.toContain("r33");
    expect(lists.uniques[0].p).toBeGreaterThanOrEqual(lists.uniques[lists.uniques.length - 1].p);
  });

  it("Baal sí llega a Zod: las 33 runas, en su orden", () => {
    const codes = dropsOf(D, sourceKill(D, src("baal"), 2, NO_TZ)!, S0).runes.map((l) => (l.target.k === "b" ? l.target.code : ""));
    expect(codes).toHaveLength(33);
    expect(codes[0]).toBe("r01");
    expect(codes[32]).toBe("r33");
  });

  it("qué suelta el Clon de Diablo: sólo el Annihilus, que sale por su nombre en la TC", () => {
    const lists = dropsOf(D, sourceKill(D, src("diablo-clone"), 2, NO_TZ)!, S0);
    expect(lists.uniques).toEqual([{ target: { k: "u", id: D.uniques.find((u) => u.key === "Annihilus")!.id }, p: 1 }]);
    expect(lists.runes).toEqual([]);
    expect(lists.sets).toEqual([]);
  });

  it("un área como lugar: el monstruo más común del tipo elegido", () => {
    const k = placeKill(D, { k: "a", id: 12, cat: "champ" }, 2, NO_TZ)!;
    expect(k.mlvl).toBe(87); // Pozo 1 en Infierno: 85 + 2
  });
});

it("buscar la Cresta del arlequín en las tres dificultades tarda menos de 1,5 s", () => {
  const t0 = performance.now();
  bestPlaces(D, SHAKO, { ...S0, mf: 300 }, NO_TZ, [0, 1, 2], 10);
  expect(performance.now() - t0).toBeLessThan(1500);
});
