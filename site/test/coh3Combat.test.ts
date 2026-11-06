import { describe, expect, it } from "vitest";
import { at, cycle, resolveDist, hit, penChance, shotsPerSecond, type WeaponStats } from "../src/coh3/combat/engine";

// El cañón AT de 57 mm de EE. UU. (coh3-data v2.5.3): penetración 300/150/120 a 15/35/60 m.
const at57: WeaponStats = {
  pen: [300, 150, 120], dist: [15, 35, 60], acc: [0.067, 0.05, 0.04625], dmg: [160, 160], range: 60,
  reload: [3.25, 3.5], aim: [0.125, 0.125], cooldown: [1.25, 1.25], clip: 1,
};
const tiger = { hp: 1200, armor: [380, 210, 80] as [number, number, number] };
const pz4 = { hp: 720, armor: [170, 105, 70] as [number, number, number] };

describe("penetración (2026-11-04)", () => {
  it("interpola en línea recta y queda fija fuera de los puntos", () => {
    expect(at(at57.pen, at57.dist, 0)).toBe(300);
    expect(at(at57.pen, at57.dist, 15)).toBe(300);
    expect(at(at57.pen, at57.dist, 25)).toBe(225);
    expect(at(at57.pen, at57.dist, 35)).toBe(150);
    expect(at(at57.pen, at57.dist, 47.5)).toBe(135);
    expect(at(at57.pen, at57.dist, 80)).toBe(120);
  });

  it("los -1 de distancia se resuelven con el alcance", () => {
    expect(resolveDist([-1, -1, -1], [0, 40])).toEqual([0, 20, 40]);
    expect(resolveDist([10, -1, 40], [0, 40])).toEqual([10, 20, 40]);
  });

  it("probabilidad = pen / blindaje, con tope en 1", () => {
    expect(penChance(150, 300)).toBe(0.5);
    expect(penChance(400, 300)).toBe(1);
    expect(penChance(10, 0)).toBe(1);
  });

  it("57 mm contra el Tiger a 30 m: 49 % de frente, 89 % de costado, 100 % de atrás", () => {
    const f = hit(at57, tiger, 0, 30), s = hit(at57, tiger, 1, 30), r = hit(at57, tiger, 2, 30);
    expect(f.pen).toBeCloseTo(187.5);
    expect(Math.round(f.chance * 100)).toBe(49);
    expect(Math.round(s.chance * 100)).toBe(89);
    expect(r.chance).toBe(1);
    // 1200 / 160 = 7,5 → 8 impactos que penetren.
    expect(f.shotsToKill).toBe(8);
    expect(f.expectedShots).toBeGreaterThan(r.expectedShots);
  });

  it("fuera de alcance no hace daño", () => {
    const h = hit(at57, pz4, 2, 70);
    expect(h.inRange).toBe(false);
    expect(h.dps).toBe(0);
    expect(h.seconds).toBe(Infinity);
  });

  it("ciclo y cadencia de un cañón: apuntar + enfriar + recargar por disparo", () => {
    expect(cycle(at57)).toEqual({ secs: 1.375, shots: 1 });
    expect(shotsPerSecond(at57)).toBeCloseTo(1 / (1.375 + 3.375));
  });

  it("una ráfaga dispara varias balas por ciclo", () => {
    const mg: WeaponStats = { ...at57, burst: { dur: [2, 2], rate: [10, 10] }, cooldown: [1, 1], aim: [0, 0], reload: [0, 0], clip: 100 };
    expect(cycle(mg)).toEqual({ secs: 3, shots: 20 });
  });
});

describe("CoH2 con el mismo motor", () => {
  it("el Mosin de Conscripts siempre penetra a la infantería y su DPS sale de sus campos", async () => {
    const { loadFicha } = await import("../src/coh3/data");
    const { weaponStats, targetStats } = await import("../src/coh3/combat/weapons");
    const w = await loadFicha<Parameters<typeof weaponStats>[0]>("weapons", "mosin_nagant_rifle_conscript_mp", "coh2");
    const u = await loadFicha<Parameters<typeof targetStats>[0]>("units", "conscript_squad_mp", "coh2");
    expect(w && u).toBeTruthy();
    const h = hit(weaponStats(w!), targetStats(u!), 0, 10);
    expect(h.chance).toBe(1);
    expect(h.dps).toBeGreaterThan(0);
    expect(penChance(1, 1)).toBe(1);
  });
});

describe("CoH1: daño por tipo de blanco", () => {
  it("el arma se convierte con los multiplicadores del tipo de blanco, y la trasera con su multiplicador", async () => {
    const { contraBlanco, blancoCoh1 } = await import("../src/coh3/combat/weapons");
    const garand = {
      slug: "g", name: { en: "g" }, faction: "american", kind: "small_arms",
      pen: [1, 1, 1], dist: [10, 20, 30], acc: [0.5, 0.4, 0.3], dmg: [10, 10], range: [0, 35],
      targets: { tp_infantry: [1, 1, 1, 1], tp_armour_allies_sherman: [0.8, 0.5, 0.05, 2] },
    };
    const w = contraBlanco(garand as never, "tp_armour_allies_sherman");
    expect(w.pen).toEqual([0.05, 0.05, 0.05]);
    expect(w.acc).toEqual([0.4, 0.32, 0.24]);
    expect(w.dmg).toEqual([5, 5]);
    // Sin entrada para ese tipo: igual que antes.
    expect(contraBlanco(garand as never, "tp_nada").pen).toEqual([1, 1, 1]);
    const t = blancoCoh1({ hp: 636, models: 1 } as never, garand as never, "tp_armour_allies_sherman");
    expect(t.armor[0]).toBe(1);
    expect(t.armor[2]).toBeCloseTo(0.5);
  });
});
