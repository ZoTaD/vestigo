import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalize, SEARCH_INDEX, SEARCH_ZOOM, searchMap, type SearchEntry } from "../src/zomboid/map/search";
import { MAP_COPY, searchKindLabel } from "../src/zomboid/map/copy";

/**
 * El buscador del Mapa de Project Zomboid (2026-09-30, Task 4): calles, pueblos, escondites, edificios con nombre e
 * historias, en inglés y en español, con `search.json` de `map.py`. El orden es lo que más importa: lo que es igual a lo
 * escrito va primero, después lo que empieza así y al final lo que lo contiene. Se prueba con entradas armadas a mano
 * (el orden exacto) y con las reales (que lo que se busca de verdad aparezca arriba).
 */
const e = (k: SearchEntry["k"], en: string, es = en, x = 0, y = 0): SearchEntry => ({ k, en, es, x, y });
const WEB = join(__dirname, "..", "..", "games", "zomboid", "data", "map", "web");
const real = JSON.parse(readFileSync(join(WEB, "search.json"), "utf-8")) as SearchEntry[];
const common = JSON.parse(readFileSync(join(WEB, "common.json"), "utf-8")) as { zoneDefs: { stories: string[] } };

describe("normalize", () => {
  it("sin mayúsculas, sin tildes, sin apóstrofos y con un solo espacio entre palabras", () => {
    expect(normalize("  Campo de  Béisbol ")).toBe("campo de beisbol");
    expect(normalize("Greene's")).toBe("greenes");
    expect(normalize("St. Michael’s Cathedral")).toBe("st michaels cathedral");
    expect(normalize("U-Store It")).toBe("u store it");
    expect(normalize("Cabaña")).toBe("cabana");
  });
});

describe("searchMap: el orden", () => {
  const list = [
    e("street", "Main Street Extension"),
    e("stash", "the bank on main street"),
    e("street", "Main St"),
    e("town", "Main"),
    e("building", "Mainland Bank"),
  ];

  it("exacto, después prefijo, después contiene; y en cada uno, la palabra entera antes que el pedazo", () => {
    expect(searchMap(list, "main", "en").map((h) => h.en)).toEqual([
      "Main",
      "Main St",
      "Main Street Extension",
      "Mainland Bank",
      "the bank on main street",
    ]);
    const mid = [e("street", "Embankment Rd"), e("building", "Knox Bank")];
    expect(searchMap(mid, "bank", "en").map((h) => h.en)).toEqual(["Knox Bank", "Embankment Rd"]);
  });

  it("dentro de cada grupo: el tipo (pueblo, edificio, historia, calle, escondite) y después el nombre más corto", () => {
    const tied = [e("stash", "Bank stash"), e("street", "Bank St"), e("building", "Bank Building"), e("story", "Bank Story")];
    expect(searchMap(tied, "bank", "en").map((h) => h.k)).toEqual(["building", "story", "street", "stash"]);
    const short = [e("street", "Oak Road Long"), e("street", "Oak Rd")];
    expect(searchMap(short, "oak", "en").map((h) => h.en)).toEqual(["Oak Rd", "Oak Road Long"]);
  });

  it("encuentra en los dos idiomas y muestra el del idioma de la página", () => {
    const lake = e("town", "Fallas Lake", "Lago Fallas");
    expect(searchMap([lake], "lago", "en")).toHaveLength(1);
    expect(searchMap([lake], "fallas lake", "es")).toHaveLength(1);
    // Exacto en el otro idioma también es exacto: "Fallas Lake" escrito entero en la página en español va primero.
    const other = e("street", "Fallas Lake Road");
    expect(searchMap([other, lake], "fallas lake", "es")[0]).toMatchObject(lake);
    expect(searchMap([lake], "lago", "es")[0].label).toBe("Lago Fallas");
    expect(searchMap([lake], "lago", "en")[0].label).toBe("Fallas Lake");
  });

  it("sin tildes ni mayúsculas, y nada con menos de dos letras", () => {
    const b = e("story", "Baseball Diamond", "Campo de béisbol");
    expect(searchMap([b], "BEISBOL", "es")).toHaveLength(1);
    expect(searchMap([b], "", "es")).toEqual([]);
    expect(searchMap([b], " b ", "es")).toEqual([]);
    expect(searchMap([b], "zz", "es")).toEqual([]);
  });

  it("devuelve como mucho `limit`", () => {
    const many = Array.from({ length: 30 }, (_, i) => e("street", `Elm ${i}`));
    expect(searchMap(many, "elm", "en")).toHaveLength(8);
    expect(searchMap(many, "elm", "en", 3)).toHaveLength(3);
  });
});

describe("searchMap con search.json", () => {
  it("el índice del módulo es search.json, y cada resultado trae el zoom de su clase", () => {
    expect(SEARCH_INDEX).toEqual(real);
    expect(searchMap(real, "muldraugh", "en")[0].z).toBe(SEARCH_ZOOM.town);
  });

  it("trae las cinco clases de cosas", () => {
    expect(new Set(real.map((r) => r.k))).toEqual(new Set(["street", "town", "stash", "building", "story"]));
  });

  it("lo que se busca de verdad aparece primero", () => {
    expect(searchMap(real, "muldraugh", "es")[0]).toMatchObject({ k: "town", en: "Muldraugh" });
    expect(searchMap(real, "knox bank", "es")[0]).toMatchObject({ k: "building", en: "Knox Bank" });
    expect(searchMap(real, "west point", "en")[0]).toMatchObject({ k: "town" });
    expect(searchMap(real, "main st", "en")[0]).toMatchObject({ k: "street", en: "Main St" });
    // En español, con el nombre del juego en español y sin tilde.
    const diamonds = searchMap(real, "campo de beisbol", "es");
    expect(diamonds.map((h) => h.k)).toEqual(["story", "story"]);
  });

  it("las historias son sólo las que el juego arma (common.json zoneDefs.stories)", () => {
    expect(searchMap(real, "kirsty", "en")).toEqual([]);
    expect(searchMap(real, "news", "en").filter((h) => h.k === "story")).toEqual([]);
    expect(common.zoneDefs.stories).toContain("SirTwiggy");
    expect(searchMap(real, "sir twiggy", "en")[0]).toMatchObject({ k: "story" });
  });

  it("al elegir, cada clase va a un zoom que la deja ver", () => {
    expect(SEARCH_ZOOM.town).toBeLessThan(SEARCH_ZOOM.street);
    expect(SEARCH_ZOOM.street).toBeLessThanOrEqual(SEARCH_ZOOM.building);
    for (const z of Object.values(SEARCH_ZOOM)) expect(z).toBeGreaterThanOrEqual(2);
    for (const z of Object.values(SEARCH_ZOOM)) expect(z).toBeLessThanOrEqual(6);
  });
});

describe("el tipo de cada resultado", () => {
  it("las vías del tren se llaman así y no «Calle»; las calles siguen siendo calles", () => {
    const rail = SEARCH_INDEX.find((e) => e.k === "street" && e.en.includes("Railroad"))!;
    expect(searchKindLabel(rail, MAP_COPY.es)).toBe("Vía del tren");
    expect(searchKindLabel(rail, MAP_COPY.en)).toBe("Railroad");
    const street = SEARCH_INDEX.find((e) => e.k === "street" && e.en === "Back Rail Lane")!;
    expect(searchKindLabel(street, MAP_COPY.es)).toBe("Calle");
  });
});
