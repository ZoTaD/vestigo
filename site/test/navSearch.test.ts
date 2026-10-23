import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasNavSearch, hitIconSize, loadNavSearcher, searchEntries } from "../src/navSearch";

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
    for (const g of ["valheim", "d2r", "zomboid", "rust", "terraria", "stardew"]) expect(hasNavSearch(g)).toBe(true);
    for (const g of ["deadlock", "poe2", "home"]) expect(hasNavSearch(g)).toBe(false);
  });
});

describe("el buscador de Stardew Valley (2026-10-22)", () => {
  it("busca objetos y aldeanos en los dos idiomas, y cada uno lleva a su ficha", async () => {
    const run = await loadNavSearcher("stardew");
    const [melon] = run("melon", "en", 10);
    expect(melon).toMatchObject({ name: "Melon", alt: "Melón", img: "/stardew/items/254.png", to: { view: "stardew", sdSection: "items", detail: "melon" } });
    expect(run("pastel ro", "es", 10)[0]).toMatchObject({ name: "Pastel rosa", to: { view: "stardew", sdSection: "items", detail: "pink-cake" } });
    const abigail = run("abigail", "es", 10).find((h) => h.to.sdSection === "villagers");
    expect(abigail).toMatchObject({ name: "Abigail", tab: "Aldeanos", img: "/stardew/portraits/abigail.png", to: { view: "stardew", sdSection: "villagers", detail: "abigail" } });
    expect(run("rasmodius", "es", 10)[0]).toMatchObject({ to: { sdSection: "villagers", detail: "wizard" } });
  });

  it("también busca los monstruos de Minas y combate, cada uno a su ficha", async () => {
    const run = await loadNavSearcher("stardew");
    // El ícono recortado a lo opaco (14x11), con su tamaño para dibujarlo a escala entera.
    const verde = { img: "/stardew/combat/i-green-slime.png", pix: [14, 11], to: { view: "stardew", sdSection: "mines", detail: "green-slime" } };
    expect(run("slime", "en", 10).find((h) => h.to.sdSection === "mines")).toMatchObject({ name: "Green Slime", alt: "Baba verde", tab: "Mines & combat", ...verde });
    expect(run("baba", "es", 10).find((h) => h.to.sdSection === "mines")).toMatchObject({ name: "Baba verde", tab: "Minas y combate", ...verde });
    // Los objetos siguen sin `pix`: se dibujan como siempre.
    expect(run("melon", "en", 10)[0].pix).toBeUndefined();
  });

  it("un ícono pixel va a escala entera, sin pasar de 30 px", () => {
    expect(hitIconSize([14, 11])).toEqual([28, 22]);
    expect(hitIconSize([16, 16])).toEqual([16, 16]);
    expect(hitIconSize([32, 30])).toEqual([32, 30]);
    expect(hitIconSize([7, 5])).toEqual([28, 20]);
    const css = readFileSync(new URL("../src/styles/shell.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.top-hit-ic img\.is-pix\s*\{[^}]*image-rendering:\s*pixelated[^}]*object-fit:\s*fill/);
  });
});
