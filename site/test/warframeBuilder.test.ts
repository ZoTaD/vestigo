import { describe, expect, it } from "vitest";
import itemsJson from "../../games/warframe/data/builder/items.json";
import primaryJson from "../../games/warframe/data/builder/mods-primary.json";
import warframeJson from "../../games/warframe/data/builder/mods-warframe.json";
import meleeJson from "../../games/warframe/data/builder/mods-melee.json";
import arsenalList from "../../games/warframe/data/arsenal/list.json";
import { inBuilder, NOT_IN_BUILDER, type BuildItem, type BuildMod, type Kind, type Pol, type StatKey } from "../src/warframe/data";
import { abilityCost, bonus, capacity, channelDrain, combatDamage, emptyBuild, formas, frameStats, modDrain, modFits, weaponStats, type Slot, type SlotId } from "../src/warframe/builder/calc";
import { decodeBuild, encodeBuild } from "../src/warframe/builder/buildUrl";
import { modFamily, modsClash } from "../src/warframe/builder/calc";
import { delta, deltaDigits, weaponRows } from "../src/warframe/builder/sheet";

const items = itemsJson.items as BuildItem[];
const modsPrimary = primaryJson.mods as BuildMod[];
const modsWarframe = warframeJson.mods as BuildMod[];
const modsMelee = meleeJson.mods as BuildMod[];
const real = (slug: string) => items.find((x) => x.slug === slug)!;

/** Un arma de prueba: `dmg` en el orden del export (Impacto, Perforación, Corte, Calor, Frío, Electricidad, Toxina…). */
function arma(dmg: Partial<Record<"i" | "p" | "c" | "heat" | "cold" | "elec" | "tox", number>>, w: Partial<NonNullable<BuildItem["w"]>> = {}, kind: Kind = "primary"): BuildItem {
  const d = Array<number>(20).fill(0);
  [dmg.i, dmg.p, dmg.c, dmg.heat, dmg.cold, dmg.elec, dmg.tox].forEach((v, i) => (d[i] = v ?? 0));
  return { slug: "prueba", name: ["Prueba", "Prueba"], kind, icon: "", cap: 30, compat: ["PRIMARY", "Rifle", "Melee"],
    w: { dmg: d, cc: 0.1, cd: 2, sc: 0.1, rate: 1, mag: 10, reload: 2, ms: 1, bow: false, shotgun: false, ...w } };
}
const frame = (f: NonNullable<BuildItem["f"]>): BuildItem => ({ slug: "frame", name: ["F", "F"], kind: "warframe", icon: "", cap: 30, compat: ["WARFRAME", "AURA"], f });
/** Un mod de prueba con un valor fijo (rango 0 = máximo). */
function mod(fx: [StatKey, number][], extra: Partial<BuildMod> = {}): BuildMod {
  return { slug: fx.map((e) => e[0]).join("-") || "m", name: [fx.map((e) => e[0]).join("+"), ""], pol: "madurai", rarity: "Common", drain: 4, max: 0,
    slot: "normal", exilus: false, compat: "Rifle", fx: fx.map(([k, v]) => [k, [v]]), text: [], ...extra };
}
/** Casilleros 0, 1, 2… con los mods dados, en ese orden. */
const en = (...ms: BuildMod[]): Slot[] => ms.map((m, i) => ({ id: i as SlotId, pol: null, mod: m, rank: 0 }));
const cerca = (got: number, exp: number, tol = 0.01) => expect(Math.abs(got - exp)).toBeLessThanOrEqual(tol);

describe("armador de Warframe: armas", () => {
  it("base 18 + Serration r9 (+150 %) = 45", () => cerca(weaponStats(arma({ i: 18 }), en(mod([["damage", 150]]))).mod.total, 45));

  // Karak con el reparto del export (13,05 / 8,7 / 7,25 = 29).
  const karak = arma({ i: 13.05, p: 8.7, c: 7.25 });
  it("Karak 29 + Serration (+165 %) = 76,85", () => cerca(weaponStats(karak, en(mod([["damage", 165]]))).mod.total, 76.85));

  it("Karak 29 + Serration + Hellfire (+90 %): calor 69,165, total 146,015", () => {
    const s = weaponStats(karak, en(mod([["damage", 165]]), mod([["heat", 90]]))).mod;
    cerca(s.byType.heat!, 69.165);
    cerca(s.total, 146.015);
  });

  it("Reconifex 40 base, 60 % Perforación + Piercing Hit (+90 %): +21,6 de Perforación", () => {
    const r = arma({ i: 16, p: 24 });
    const s = weaponStats(r, en(mod([["puncture", 90]])));
    cerca(s.mod.byType.puncture! - s.base.byType.puncture!, 21.6);
  });

  it("Karak Corte 7,3 + Fanged Fusillade (+120 %): Corte 16,06, total 37,76", () => {
    const s = weaponStats(arma({ i: 13, p: 8.7, c: 7.3 }), en(mod([["slash", 120]]))).mod;
    cerca(s.byType.slash!, 16.06);
    cerca(s.total, 37.76);
  });

  it("Amprex (sólo Electricidad) + Fanged Fusillade: el Corte no suma nada", () => {
    expect(weaponStats(arma({ elec: 22 }), en(mod([["slash", 120]]))).mod.byType.slash).toBeUndefined();
  });

  it("Nagantaka Prime + Cryo, Malignant Force, Hellfire, Piercing Caliber, Valence Formation: cuantizado 951,5", () => {
    const n = arma({ i: 1.73, p: 15.57, c: 155.7 });
    const sl = en(mod([["cold", 90]]), mod([["toxin", 60]]), mod([["heat", 90]]), mod([["puncture", 120]]), mod([["gas", 200]]));
    const q = combatDamage(n, sl);
    cerca(q.byType.viral!, 259.5);
    cerca(q.byType.heat!, 156.78125);
    cerca(q.byType.gas!, 346);
    cerca(q.byType.puncture!, 32.4375);
    cerca(q.byType.slash!, 156.78125);
    expect(q.byType.impact).toBeUndefined();
    cerca(q.total, 951.5);
    expect(Math.round(q.total)).toBe(952);
  });

  it("cuantización: base 100 (I30/P30/C40) da Corte 40,625; con Maim (+120 %) 87,5", () => {
    const b = arma({ i: 30, p: 30, c: 40 });
    cerca(combatDamage(b, []).byType.slash!, 40.625);
    cerca(combatDamage(b, en(mod([["slash", 120]]))).byType.slash!, 87.5);
  });

  it("Prova (Electricidad innata) + Frío, Toxina, Calor en casilleros 1-3: Viral + Radiación", () => {
    const prova = arma({ i: 52, elec: 76 }, {}, "melee");
    const sl: Slot[] = [{ id: 0, pol: null, mod: null, rank: 0 }, ...[mod([["cold", 60]]), mod([["toxin", 60]]), mod([["heat", 60]])].map((m, i) => ({ id: (i + 1) as SlotId, pol: null, mod: m, rank: 0 }))];
    const t = Object.keys(weaponStats(prova, sl).mod.byType).sort();
    expect(t).toEqual(["impact", "radiation", "viral"]);
  });

  it("Amprex + Hellfire + Cryo Rounds: Explosivo + Electricidad; sólo Hellfire: Radiación", () => {
    const amprex = arma({ elec: 22 });
    expect(Object.keys(weaponStats(amprex, en(mod([["heat", 90]]), mod([["cold", 90]]))).mod.byType).sort()).toEqual(["blast", "electricity"]);
    expect(Object.keys(weaponStats(amprex, en(mod([["heat", 90]]))).mod.byType)).toEqual(["radiation"]);
  });

  it("un innato con un mod del mismo elemento toma la posición del mod (Stormbringer arriba en el Amprex)", () => {
    const amprex = arma({ elec: 22 });
    const t = weaponStats(amprex, en(mod([["electricity", 90]]), mod([["heat", 90]]), mod([["cold", 90]])));
    expect(Object.keys(t.mod.byType).sort()).toEqual(["cold", "radiation"]);
  });

  const braton = arma({ i: 7.92, p: 7.92, c: 8.16 }, { cc: 0.12, cd: 1.6, mag: 45, reload: 2 });
  it("Braton CC 12 % + Point Strike 150 + Argon Scope 135 = 46,2 %", () => cerca(weaponStats(braton, en(mod([["critChance", 150]]), mod([["critChance", 135]]))).mod.cc, 0.462, 1e-4));
  it("Braton CC 12 % + Point Strike + Arcane Avenger (+45 plano) = 75 %", () => cerca(bonus(0.12, 150, 0.45), 0.75, 1e-4));
  it("Braton CD 1,6 + Vital Sense 120 + Bladed Rounds 120 = 5,44×", () => cerca(weaponStats(braton, en(mod([["critDamage", 120]]), mod([["critDamage", 120]]))).mod.cd, 5.44));
  it("Braton CD 1,6 + Vital Sense + Tenacious Bond (+1,2 plano) = 4,72×", () => cerca(bonus(1.6, 120, 1.2), 4.72));
  it("Gram CC 15 % + True Steel 120 + Blood Rush 40×(7−1) = 69 %", () => {
    const gram = arma({ i: 24, p: 24, c: 112 }, { cc: 0.15 }, "melee");
    cerca(weaponStats(gram, en(mod([["critChance", 120]]), mod([["critChance", 240]]))).mod.cc, 0.69, 1e-4);
  });
  it("Lex multidisparo 1 + 180 % = 2,8", () => cerca(weaponStats(arma({ i: 13 }), en(mod([["multishot", 180]]))).mod.ms, 2.8));
  it("Hek multidisparo 7 + Hell's Chamber 120 % = 15,4", () => cerca(weaponStats(arma({ i: 75 }, { ms: 7 }), en(mod([["multishot", 120]]))).mod.ms, 15.4));
  it("Karak 29 + Split Chamber 90 %: 55,1 medio por disparo", () => {
    const s = weaponStats(karak, en(mod([["multishot", 90]]))).mod;
    cerca(s.total * s.ms, 55.1);
  });
  it("Hek: 75 por perdigón × 7 = 525 (el daño no se multiplica en silencio)", () => {
    const s = weaponStats(real("hek"), []).base;
    cerca(s.total, 75);
    expect(s.ms).toBe(7);
    cerca(s.total * s.ms, 525);
    cerca(s.sc, 0.107143, 1e-6);
  });
  it("Snipetron SC 12 % + Rifle Aptitude 90 + Hammer Shot 80 = 32,4 %", () => cerca(weaponStats(arma({ i: 18 }, { sc: 0.12 }), en(mod([["statusChance", 90]]), mod([["statusChance", 80]]))).mod.sc, 0.324, 1e-4));
  it("Speed Trigger r5 en arco: +120 %", () => {
    const st = modsPrimary.find((m) => m.slug === "speed-trigger")!;
    const s = weaponStats(real("paris"), [{ id: 0, pol: null, mod: st, rank: 5 }]);
    cerca(s.mod.rate / s.base.rate - 1, 1.2, 1e-6);
  });
  it("Speed Trigger + Shred: +90 % de cadencia", () => {
    const s = weaponStats(braton, en(mod([["fireRate", 60]]), mod([["fireRate", 30]])));
    cerca(s.mod.rate / s.base.rate - 1, 0.9, 1e-6);
  });
  it("Braton cargador 45 + Magazine Warp 30 % = 59", () => expect(weaponStats(braton, en(mod([["magazine", 30]]))).mod.mag).toBe(59));
  it("Braton recarga 2,0 + Fast Hands 30 % ≈ 1,54 s", () => cerca(weaponStats(braton, en(mod([["reload", 30]]))).mod.reload!, 1.5385, 1e-4));
  it("Braton recarga 2,0 + Tainted Mag −30 % ≈ 2,857 s", () => cerca(weaponStats(braton, en(mod([["reload", -30]]))).mod.reload!, 2.857, 1e-3));

  it("cuerpo a cuerpo: el daño cuerpo a cuerpo suma como daño y la velocidad de ataque como cadencia", () => {
    const m = arma({ i: 100 }, { rate: 1 }, "melee");
    const s = weaponStats(m, en(mod([["meleeDamage", 100]]), mod([["attackSpeed", 20]]))).mod;
    cerca(s.total, 200);
    cerca(s.rate, 1.2);
    // En un arma de fuego, esas dos no suman.
    const f = weaponStats(arma({ i: 100 }), en(mod([["meleeDamage", 100]]), mod([["attackSpeed", 20]]))).mod;
    cerca(f.total, 100);
    cerca(f.rate, 1);
  });

  it("con los datos reales: Braton + Serration rango 10 da 63,6", () => {
    const serr = modsPrimary.find((m) => m.slug === "serration")!;
    const b = real("braton");
    expect(modFits(serr, b, 0)).toBe(true);
    const s = weaponStats(b, [{ id: 0, pol: null, mod: serr, rank: 10 }]);
    cerca(s.base.total, 24);
    cerca(s.mod.total, 63.6);
    expect(s.mod.mag).toBe(45);
    cerca(s.mod.cc, 0.12, 1e-9);
  });
});

describe("armador de Warframe: Warframes", () => {
  // El paso de rango 0 a 30 lo hace builder.py: se prueba en los datos.
  it("Excalibur r0 salud 270 → r30 370", () => expect(real("excalibur").f!.health).toBe(370));
  it("Excalibur r0 energía 100 → r30 150", () => expect(real("excalibur").f!.energy).toBe(150));
  it("Rhino escudo 455 → r30 555; armadura 240 sin cambio", () => expect(real("rhino").f).toMatchObject({ shield: 555, armor: 240 }));
  it("Wisp energía 200 → r30 300 (excepción); escudo 180 → 280", () => expect(real("wisp").f).toMatchObject({ energy: 300, shield: 280 }));
  it("Inaros salud 2110 → r30 2310 (excepción); escudo 0", () => expect(real("inaros").f).toMatchObject({ health: 2310, shield: 0 }));

  it("Excalibur r30 370 + Vitality (+100 %) = 740", () => {
    const vit = modsWarframe.find((m) => m.slug === "vitality")!;
    const s = frameStats(real("excalibur"), [{ id: 0, pol: null, mod: vit, rank: 10 }]);
    expect(s.base.health).toBe(370);
    cerca(s.mod.health, 740);
  });
  it("habilidad de 25 de energía + Streamline (+30 %) = 17,5", () => cerca(abilityCost(25, 130), 17.5));
  it("canalizada 10/s, duración 140 %, eficiencia 130 % = 5/s", () => cerca(channelDrain(10, 130, 140), 5));
  it("Blind Rage + Streamline: eficiencia 75 %, coste 125 %", () => {
    const s = frameStats(frame({ health: 100, shield: 100, armor: 100, energy: 100 }), en(mod([["strength", 99], ["efficiency", -55]]), mod([["efficiency", 30]])));
    expect(s.mod.efficiency).toBe(75);
    cerca(abilityCost(1, s.mod.efficiency), 1.25);
  });
  it("Blind Rage + Fleeting Expertise (canalizada): 237,5 % → tope 175 %", () => cerca(channelDrain(1, 100 - 55 + 60, 100 - 60), 1.75));
  it("Blind Rage + Continuity (canalizada) ≈ 119,2 %", () => cerca(channelDrain(1, 45, 130), 1.192, 1e-3));
  it("eficiencia con dos mods que pasan el tope: 175", () => {
    const s = frameStats(frame({ health: 100, shield: 100, armor: 100, energy: 100 }), en(mod([["efficiency", 30]]), mod([["efficiency", 60]])));
    expect(s.base.efficiency).toBe(100);
    expect(s.mod.efficiency).toBe(175);
  });
  it("fuerza, duración y rango: 100 + Σ%", () => {
    const s = frameStats(frame({ health: 100, shield: 100, armor: 100, energy: 100 }), en(mod([["strength", 30]]), mod([["duration", -60]]), mod([["range", 45]])));
    expect(s.mod).toMatchObject({ strength: 130, duration: 40, range: 145 });
  });
});

describe("armador de Warframe: drenaje y capacidad", () => {
  const serration = modsPrimary.find((m) => m.slug === "serration")!;
  const conDrenaje = (drain: number, pol: Pol = "madurai", slot: BuildMod["slot"] = "normal") => mod([], { drain, max: 10, pol, slot });

  it("Serration r10 sin polaridad = 14", () => expect(modDrain(serration, 10, null)).toBe(14));
  it("Serration r10 en Madurai = 7", () => expect(modDrain(serration, 10, "madurai")).toBe(7));
  it("Intensify r5 (6+5 = 11) en polaridad distinta = 14", () => {
    const intensify = modsWarframe.find((m) => m.slug === "intensify")!;
    expect(modDrain(intensify, 5, "vazarin")).toBe(14);
  });
  it("drenaje 14 en polaridad distinta = 18", () => expect(modDrain(conDrenaje(14), 0, "naramon")).toBe(18));
  for (const [d, mas] of [[2, 1], [5, 1], [6, 2], [9, 2], [10, 3], [13, 3], [16, 4]] as const) {
    it(`drenaje ${d} en polaridad distinta: +${mas}`, () => expect(modDrain(conDrenaje(d), 0, "naramon") - d).toBe(mas));
  }
  it("aura de 5 en igual polaridad: +10", () => expect(modDrain(conDrenaje(-5, "madurai", "aura"), 0, "madurai")).toBe(-10));
  it("aura de 5 / 9 en polaridad distinta: +4 / +7", () => {
    expect(modDrain(conDrenaje(-5, "madurai", "aura"), 0, "naramon")).toBe(-4);
    const steel = modsWarframe.find((m) => m.slug === "steel-charge")!;
    expect(modDrain(steel, 5, "naramon")).toBe(-7);
    expect(modDrain(steel, 5, null)).toBe(-9);
  });
  it("Split Chamber r5 = 15", () => expect(modDrain(modsPrimary.find((m) => m.slug === "split-chamber")!, 5, null)).toBe(15));
  it("el rango se recorta al máximo del mod", () => expect(modDrain(serration, 99, null)).toBe(14));

  it("capacidad: 30, ×2 con potenciador, el aura suma; excedida queda negativa sin error", () => {
    const b = emptyBuild(real("excalibur"));
    const steel = modsWarframe.find((m) => m.slug === "steel-charge")!;
    b.slots.find((s) => s.id === "aura")!.mod = steel;
    b.slots.find((s) => s.id === "aura")!.rank = 5;
    b.slots.find((s) => s.id === "aura")!.pol = "madurai";
    expect(capacity(b)).toEqual({ total: 48, used: 0, free: 48 });
    b.reactor = true;
    expect(capacity(b).total).toBe(78);
    b.reactor = false;
    const grandes = modsWarframe.filter((m) => m.slot === "normal" && !m.exilus && m.drain >= 6).slice(0, 8);
    grandes.forEach((m, i) => { const s = b.slots.find((x) => x.id === i)!; s.mod = m; s.rank = m.max; });
    const c = capacity(b);
    expect(c.free).toBeLessThan(0);
    expect(c.free).toBe(c.total - c.used);
    expect(formas(b)).toBe(1);
  });

  it("modFits: aura sólo en el casillero de aura de un Warframe; exilio sólo con isUtility; compat por compatName", () => {
    const exc = real("excalibur");
    const steel = modsWarframe.find((m) => m.slug === "steel-charge")!;
    expect(modFits(steel, exc, "aura")).toBe(true);
    expect(modFits(steel, exc, 0)).toBe(false);
    expect(modFits(serration, exc, 0)).toBe(false);
    expect(modFits(serration, real("braton"), "exilus")).toBe(false);
    const util = modsPrimary.find((m) => m.exilus)!;
    expect(modFits(util, real("braton"), "exilus")).toBe(true);
    expect(modFits(serration, real("braton"), "aura")).toBe(false);
    const postura = modsMelee.find((m) => m.slot === "stance" && real("gram").compat.includes(m.compat))!;
    expect(modFits(postura, real("gram"), "stance")).toBe(true);
    expect(modFits(postura, real("gram"), 3)).toBe(false);
  });
});

describe("armador de Warframe: la build en la dirección", () => {
  const todos = [...modsPrimary, ...modsWarframe, ...modsMelee];

  it("ida y vuelta: Braton con Serration y Split Chamber, polaridad y potenciador", () => {
    const s = "i=braton&m=0.serration.10,1.split-chamber.5&p=0.madurai&o=1";
    const b = decodeBuild(s, items, todos)!;
    expect(b.reactor).toBe(true);
    expect(b.slots.find((x) => x.id === 0)).toMatchObject({ pol: "madurai", rank: 10 });
    expect(b.slots.find((x) => x.id === 0)!.mod!.slug).toBe("serration");
    expect(encodeBuild(b)).toBe(s);
    expect(decodeBuild("?" + s, items, todos)).toEqual(b);
  });

  it("null sólo si el objeto no existe", () => {
    expect(decodeBuild("i=no-existe&m=0.serration.10", items, todos)).toBeNull();
    expect(decodeBuild("", items, todos)).toBeNull();
    expect(decodeBuild("i=braton", items, todos)).not.toBeNull();
  });

  it("basura: descarta lo inválido, recorta el rango y no tira", () => {
    const s = "i=excalibur&m=9.no-existe.99,0.steel-charge.5,aura.steel-charge.99,1.vitality.abc,2.serration.10,3.vitality.4,exilus.vitality.1,,x&p=x,0.madurai,aura.sarasa,99.naramon,1.umbra.extra&o=2";
    const b = decodeBuild(s, items, todos)!;
    expect(b).not.toBeNull();
    const aura = b.slots.find((x) => x.id === "aura")!;
    expect(aura.mod!.slug).toBe("steel-charge");
    expect(aura.rank).toBe(5);
    expect(aura.pol).toBeNull();
    expect(b.slots.find((x) => x.id === 0)!.mod).toBeNull();
    expect(b.slots.find((x) => x.id === 0)!.pol).toBe("madurai");
    expect(b.slots.find((x) => x.id === 1)).toMatchObject({ rank: 10, pol: "umbra" });
    expect(b.slots.find((x) => x.id === 2)!.mod).toBeNull();
    expect(b.slots.find((x) => x.id === 3)!.mod).toBeNull(); // Vitality ya está en el 1
    expect(b.reactor).toBe(false);
    const enc = encodeBuild(b);
    expect(encodeBuild(decodeBuild(enc, items, todos)!)).toBe(enc);
  });

  it("familias: no entran dos versiones del mismo mod (Serration y Amalgam Serration, Flow y Archon Flow…)", () => {
    const b = decodeBuild("i=braton&m=0.serration.10,1.amalgam-serration.5,2.split-chamber.5,3.primed-shred.10,4.shred.5", items, todos)!;
    expect(b.slots.find((x) => x.id === 1)!.mod).toBeNull();
    expect(b.slots.find((x) => x.id === 4)!.mod).toBeNull();
    expect(b.slots.find((x) => x.id === 3)!.mod!.slug).toBe("primed-shred");
    const f = decodeBuild("i=excalibur&m=0.archon-flow.10,1.flow.5,2.umbral-vitality.10,3.vitality.10", items, todos)!;
    expect(f.slots.filter((x) => x.mod).map((x) => x.mod!.slug)).toEqual(["archon-flow", "umbral-vitality"]);
  });

  it("incompatibles de la wiki: Galvanized Chamber no entra con Split Chamber, ni Amalgam con Serration", () => {
    const b = decodeBuild("i=braton&m=0.split-chamber.5,1.galvanized-chamber.10,2.serration.10,3.amalgam-serration.10", items, todos)!;
    expect(b.slots.filter((x) => x.mod).map((x) => x.mod!.slug)).toEqual(["split-chamber", "serration"]);
    const g = decodeBuild("i=braton&m=0.galvanized-chamber.10,1.split-chamber.5", items, todos)!;
    expect(g.slots.filter((x) => x.mod).map((x) => x.mod!.slug)).toEqual(["galvanized-chamber"]);
    const por = (slug: string) => modsPrimary.find((m) => m.slug === slug)!;
    expect(modsClash(por("split-chamber"), por("galvanized-chamber"))).toBe(true);
    expect(modsClash(por("galvanized-chamber"), por("split-chamber"))).toBe(true);
    expect(modsClash(por("serration"), por("amalgam-serration"))).toBe(true);
    expect(modsClash(por("point-strike"), por("critical-delay"))).toBe(true);
    expect(modsClash(por("serration"), por("split-chamber"))).toBe(false);
  });

  it("un solo mod por nombre en cada archivo (sin las variantes de rango 3, 5 y 10 del export)", () => {
    for (const ms of [modsPrimary, modsWarframe, modsMelee]) {
      const nombres = ms.map((m) => m.name[0]);
      expect(nombres.filter((n, i) => nombres.indexOf(n) !== i)).toEqual([]);
    }
    expect(modsPrimary.filter((m) => m.name[0] === "Serration").map((m) => [m.max, m.drain])).toEqual([[10, 4]]);
    expect(modsPrimary.filter((m) => m.name[0] === "Hellfire").map((m) => m.max)).toEqual([5]);
  });

  it("la clave de familia saca Primed, Amalgam, Archon, Umbral y Flawed, pero no Galvanized", () => {
    expect(modFamily(["Amalgam Serration", ""])).toBe("Serration");
    expect(modFamily(["Primed Shred", ""])).toBe("Shred");
    expect(modFamily(["Archon Flow", ""])).toBe("Flow");
    expect(modFamily(["Umbral Vitality", ""])).toBe("Vitality");
    expect(modFamily(["Flawed Serration", ""])).toBe("Serration");
    expect(modFamily(["Galvanized Chamber", ""])).toBe("Galvanized Chamber");
    expect(modFamily(["Split Chamber", ""])).toBe("Split Chamber");
  });

  it("un arma sin casillero de aura ni postura los ignora", () => {
    const b = decodeBuild("i=braton&m=aura.steel-charge.5,stance.x.1&p=aura.madurai", items, todos)!;
    expect(b.slots.map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, "exilus"]);
    expect(encodeBuild(b)).toBe("i=braton");
  });
});

describe("armador de Warframe: la build de 6 mods del Braton (la que prueba la pestaña)", () => {
  const url = "i=braton&m=0.serration.10,1.split-chamber.5,2.point-strike.5,3.vital-sense.5,4.hellfire.5,5.infected-clip.5&p=0.madurai,1.madurai&o=1";
  const b = decodeBuild(url, items, modsPrimary)!;

  it("se lee entera y vuelve a escribirse igual", () => {
    expect(b.slots.filter((s) => s.mod).length).toBe(6);
    expect(encodeBuild(b)).toBe(url);
  });
  it("daño: 24 → 178,08 por proyectil (Calor + Toxina = Gas 114,48), ×1,9 multidisparo = 338,35 por disparo", () => {
    const s = weaponStats(b.item, b.slots);
    cerca(s.base.total, 24);
    cerca(s.mod.total, 178.08);
    cerca(s.mod.byType.gas!, 114.48);
    cerca(s.mod.byType.impact!, 20.988);
    expect(s.mod.byType.heat).toBeUndefined();
    cerca(s.mod.ms, 1.9);
    cerca(s.mod.total * s.mod.ms, 338.352);
    cerca(s.mod.cc, 0.3, 1e-9);
    cerca(s.mod.cd, 3.52);
    cerca(s.mod.sc, 0.06, 1e-9);
  });
  it("capacidad 55 de 60 con catalizador y dos Formas", () => {
    expect(capacity(b)).toEqual({ total: 60, used: 55, free: 5 });
    expect(formas(b)).toBe(2);
  });
});

describe("armador de Warframe: qué fichas del Arsenal enlazan al armador", () => {
  it("NOT_IN_BUILDER es justo lo del Arsenal de esos cuatro tipos que no está en items.json", () => {
    const enArmador = new Set(items.map((x) => x.slug));
    const fuera = (arsenalList as { slug: string; kind: string }[]).filter((r) => ["warframe", "primary", "secondary", "melee"].includes(r.kind) && !enArmador.has(r.slug)).map((r) => r.slug);
    expect([...NOT_IN_BUILDER].sort()).toEqual(fuera.sort());
    expect(inBuilder("braton", "primary")).toBe(true);
    expect(inBuilder("voidrig", "warframe")).toBe(false);
    expect(inBuilder("itzal", "archwing")).toBe(false);
  });
});

describe("armador de Warframe: las filas de la pantalla", () => {
  it("el daño por disparo es por proyectil × multidisparo, y en cuerpo a cuerpo es por golpe", () => {
    const hek = real("hek");
    const s = weaponStats(hek, []);
    const rows = weaponRows("primary", s.base, s.mod);
    cerca(rows.find((r) => r.key === "perShot")!.now, s.mod.total * s.mod.ms);
    expect(rows.find((r) => r.key === "multishot")!.now).toBe(hek.w!.ms);
    expect(weaponRows("melee", s.base, s.mod)[0]!.key).toBe("perHit");
    expect(rows.find((r) => r.key === "reload")?.inv).toBe(true);
  });
  it("cuerpo a cuerpo: sin daño por proyectil ni multidisparo", () => {
    const s = weaponStats(real("skana"), []);
    const keys = weaponRows("melee", s.base, s.mod).map((r) => r.key);
    expect(keys).toContain("perHit");
    expect(keys).not.toContain("total");
    expect(keys).not.toContain("multishot");
  });
  it("el cambio chico lleva decimales: nunca \"+0 %\"", () => {
    expect(deltaDigits(25)).toBe(0);
    expect(deltaDigits(-1)).toBe(0);
    expect(deltaDigits(0.4)).toBe(1);
    expect(deltaDigits(-0.6)).toBe(1);
    expect(deltaDigits(0.04)).toBe(2);
  });
  it("el cambio: nada si no cambió, nuevo si no había, y la recarga más corta es mejor", () => {
    expect(delta(10, 10)).toBeNull();
    expect(delta(0, 5)).toEqual({ pct: null, good: true });
    expect(delta(2, 1.5, true)).toEqual({ pct: -25, good: true });
  });
});
