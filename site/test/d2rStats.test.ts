import { describe, expect, it } from "vitest";
import engine from "../../games/d2r/data/wiki/engine.json";
import uniques from "../../games/d2r/data/wiki/uniques.json";
import runewords from "../../games/d2r/data/wiki/runewords.json";
import { describeProps, sprintf, type Engine, type Prop } from "../src/d2r/stats";
import { runewordLines } from "../src/d2r/D2rRunewords";

/**
 * El motor de textos de Diablo II (2026-09-29) contra ítems conocidos: tienen
 * que leerse como en el juego, en inglés y en español de Latinoamérica.
 */
const E = engine as unknown as Engine;
const uniq = (key: string) => (uniques as unknown as { key: string; props: Prop[] }[]).find((u) => u.key === key)!;
const rw = (en: string) => (runewords as unknown as { name: { en: string } }[]).find((r) => r.name.en === en) as never;

describe("sprintf del juego", () => {
  it("en orden (inglés) y por posición (español)", () => {
    expect(sprintf("%d%% Chance to cast level %d %s on striking", [25, 3, "Frost Nova"])).toBe("25% Chance to cast level 3 Frost Nova on striking");
    expect(sprintf("%0%% de probabilidad de lanzar %2 nivel %1 al golpear", [25, 3, "Nova de escarcha"])).toBe("25% de probabilidad de lanzar Nova de escarcha nivel 3 al golpear");
    expect(sprintf("%+d to Life", [20])).toBe("+20 to Life");
    expect(sprintf("%+d to Life", ["(10-20)"])).toBe("+(10-20) to Life");
  });
});

describe("líneas de ítems conocidos", () => {
  it("Cresta del arlequín: grupo de atributos y stats por nivel", () => {
    const es = describeProps(uniq("Harlequin Crest").props, E, "es");
    expect(es).toContain("+2 a todas las habilidades");
    expect(es).toContain("+2 a todos los atributos");
    expect(es).toContain("+(1-148) de vida (Según el nivel del personaje)");
    expect(es).toContain("Reduce un 10% el daño físico recibido");
    expect(es).toContain("50% más de probabilidad de obtener objetos mágicos");
  });

  it("Kuko Shakaku: la pestaña de habilidades con su clase", () => {
    expect(describeProps(uniq("Kuko Shakaku").props, E, "en")).toContain("+3 to Bow and Crossbow Skills (Amazon Only)");
  });

  it("Piedra de Jordán: rango de daño y maná", () => {
    const en = describeProps(uniq("The Stone of Jordan").props, E, "en");
    expect(en).toEqual(["+1 to All Skills", "Adds 1-12 lightning damage", "+20 to Mana", "Increase Maximum Mana 25%"]);
  });

  it("Infinito: aura, habilidad al matar y cargas, con el orden del español", () => {
    const es = runewordLines(rw("Infinity"), 0, "es");
    expect(es).toContain("Aura de Convicción de nivel 12 al equiparse");
    expect(es).toContain("50% de probabilidad de lanzar Cadena de relámpagos nivel 20 al matar un enemigo");
    expect(es).toContain("Armadura de ciclón nivel 21 (cargas: 30/30)");
  });

  it("Enigma suma lo que dan sus runas en una armadura", () => {
    const en = runewordLines(rw("Enigma"), 1, "en");
    expect(en).toContain("+1 to Teleport");
    expect(en).toContain("+2 to All Skills");
    // Jah, Ith y Ber en la armadura: vida máxima, daño a maná y reducción de daño.
    expect(en).toContain("Increase Maximum Life 5%");
    expect(en).toContain("+15% Damage Taken Goes To Mana");
    expect(en).toContain("Physical Damage Received Reduced by 8%");
  });

  it("Espíritu no da lo mismo en un arma que en un escudo", () => {
    const weapon = runewordLines(rw("Spirit"), 0, "es");
    const shield = runewordLines(rw("Spirit"), 2, "es");
    expect(weapon).not.toEqual(shield);
  });
});
