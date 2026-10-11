import { describe, expect, it } from "vitest";
import { hasNavSearch, searchEntries } from "../src/navSearch";

/**
 * El buscador de la barra dentro de cada juego (2026-10-11). Antes, en Diablo II, Project Zomboid y Rust decía "Buscar
 * un jugador" y mandaba a Deadlock.
 */
const entries = [
  { key: "ammo", en: "5.56 Rifle Ammo", es: "Munición del calibre 5.56", extra: "ammo.rifle", to: { detail: "ammo" } },
  { key: "ak", en: "Assault Rifle", es: "Fusil de asalto", extra: "rifle.ak", to: { detail: "ak" } },
  { key: "body", en: "Rifle Body", es: "Cuerpo de fusil", extra: "riflebody", to: { detail: "body" } },
  { key: "rope", en: "Rope", es: "Soga", to: { detail: "rope" } },
];

describe("searchEntries", () => {
  it("pide dos letras y busca sin tildes ni mayúsculas", () => {
    expect(searchEntries(entries, "r", "en", 10)).toEqual([]);
    expect(searchEntries(entries, "MUNICION", "es", 10).map((h) => h.key)).toEqual(["ammo"]);
  });

  it("primero lo que empieza con lo escrito, después lo que lo contiene y al final lo del otro idioma", () => {
    expect(searchEntries(entries, "rifle", "en", 10).map((h) => h.key)).toEqual(["body", "ammo", "ak"]);
    // En español nadie se llama "rifle": los tres llegan por el nombre inglés o el shortname, en su orden.
    expect(searchEntries(entries, "rifle", "es", 10).map((h) => h.key)).toEqual(["ammo", "ak", "body"]);
    expect(searchEntries(entries, "fusil", "es", 10).map((h) => h.key)).toEqual(["ak", "body"]);
  });

  it("con varias palabras las pide todas, y corta en el máximo", () => {
    expect(searchEntries(entries, "rifle ammo", "en", 10).map((h) => h.key)).toEqual(["ammo"]);
    expect(searchEntries(entries, "ri", "en", 1)).toHaveLength(1);
  });

  it("devuelve el nombre en el idioma de la página y el otro debajo, sólo si es distinto", () => {
    const [ak] = searchEntries(entries, "assault", "en", 10);
    expect(ak).toMatchObject({ name: "Assault Rifle", alt: "Fusil de asalto", to: { detail: "ak" } });
    const same = searchEntries([{ key: "x", en: "Enigma", es: "Enigma", to: {} }], "enig", "es", 10);
    expect(same[0].alt).toBeUndefined();
  });
});

describe("hasNavSearch", () => {
  it("los cuatro juegos con fichas buscan en la barra; Deadlock y PoE2 siguen con lo suyo", () => {
    for (const g of ["valheim", "d2r", "zomboid", "rust"]) expect(hasNavSearch(g)).toBe(true);
    for (const g of ["deadlock", "poe2", "home"]) expect(hasNavSearch(g)).toBe(false);
  });
});
