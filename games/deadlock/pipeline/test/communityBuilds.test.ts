import { describe, it, expect } from "vitest";
import { cleanName, isOffensive, abilityPath, wilson, styleOf, toBuild, pickIds, sortBuilds, indexCard, type RawBuild, type StatRow, type CatalogItem, type CommunityBuild } from "../src/communityBuilds";

const catalog: Record<string, CatalogItem> = {
  "1": { cost: 800, slot: "weapon" },
  "2": { cost: 1600, slot: "weapon" },
  "3": { cost: 3200, slot: "vitality" },
  "4": { cost: 6400, slot: "spirit" },
  "5": { cost: 800, slot: "vitality" },
};

describe("abilityPath", () => {
  it("un paso por desbloqueo y uno por mejora con su costo", () => {
    const path = abilityPath([
      { ability_id: 10, currency_type: 2, delta: -1 },
      { ability_id: 20, currency_type: 2, delta: -1 },
      { ability_id: 10, currency_type: 1, delta: -1 },
      { ability_id: 10, currency_type: 1, delta: -2 },
      { ability_id: 20, currency_type: 1, delta: -1 },
      { ability_id: 10, currency_type: 1, delta: -5 },
    ]);
    expect(path).toEqual([10, 20, 10, 10, 20, 10]);
  });

  it("junta los puntos gastados de a uno hasta el costo de la mejora", () => {
    const uno = (id: number) => ({ ability_id: id, currency_type: 1, delta: -1 });
    // Desbloquea y después 1 + 2 + 5 puntos de a uno.
    const path = abilityPath([{ ability_id: 7, currency_type: 2, delta: -1 }, ...Array.from({ length: 8 }, () => uno(7))]);
    expect(path).toEqual([7, 7, 7, 7]);
  });

  it("una mejora sin desbloqueo desbloquea primero", () => {
    expect(abilityPath([{ ability_id: 3, currency_type: 1, delta: -1 }])).toEqual([3, 3]);
  });

  it("no pasa del máximo, no repite desbloqueos e ignora ids raros", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({ ability_id: (i % 4) + 1, currency_type: 1, delta: -5 }));
    expect(abilityPath(muchos).length).toBe(16);
    expect(abilityPath([{ ability_id: 1, currency_type: 2, delta: -1 }, { ability_id: 1, currency_type: 2, delta: -1 }])).toEqual([1]);
    expect(abilityPath([{ ability_id: 0, currency_type: 2, delta: -1 }])).toEqual([]);
    expect(abilityPath(null)).toEqual([]);
  });

  it("cada habilidad tiene a lo sumo 4 pasos", () => {
    const path = abilityPath([{ ability_id: 9, currency_type: 1, delta: -50 }]);
    expect(path).toEqual([9, 9, 9, 9]);
  });
});

describe("wilson", () => {
  it("castiga las de pocas partidas", () => {
    expect(wilson(7, 10)).toBeLessThan(wilson(550, 1000));
    expect(wilson(0, 0)).toBe(0);
    expect(wilson(500, 1000)).toBeGreaterThan(0.46);
    expect(wilson(500, 1000)).toBeLessThan(0.5);
  });
});

describe("styleOf", () => {
  it("la categoría que se lleva más de la mitad de las almas, si no híbrida", () => {
    expect(styleOf([1, 2], catalog)).toBe("weapon");
    expect(styleOf([4, 1], catalog)).toBe("spirit");
    expect(styleOf([1, 3, 5], catalog)).toBe("vitality");
    expect(styleOf([1, 5], catalog)).toBe("hybrid");
    expect(styleOf([], catalog)).toBe("hybrid");
    expect(styleOf([999], catalog)).toBe("hybrid");
  });

  it("un objeto repetido cuenta una vez", () => {
    expect(styleOf([5, 1, 1, 1], catalog)).toBe("hybrid");
  });
});

const raw = (over: Partial<RawBuild["hero_build"]> = {}): RawBuild => ({
  hero_build: {
    hero_id: 6,
    hero_build_id: 5000,
    author_account_id: 42,
    last_updated_timestamp: 1_700_000_100,
    publish_timestamp: 1_700_000_000,
    name: "  Mi <b>build</b> ",
    description: "Linea 1\n\n\n\nLinea 2\u0007",
    language: 5,
    version: 3,
    tags: [111, 1, 111, 222],
    details: {
      mod_categories: [
        { name: "#Citadel_HeroBuilds_EarlyGame", description: null, mods: [{ ability_id: 1 }, { ability_id: 1 }, { ability_id: 5 }, { ability_id: 999 }] },
        { name: "Vacía", mods: [] },
        { name: "Final", description: "lo último", mods: [{ ability_id: 4 }, { ability_id: 3 }] },
      ],
      ability_order: { currency_changes: [{ ability_id: 10, currency_type: 2, delta: -1 }] },
    },
    ...over,
  },
  num_favorites: 12,
});

describe("toBuild", () => {
  const stat: StatRow = { hero_id: 6, hero_build_id: 5000, wins: 60, losses: 40, matches: 100, players: 30 };

  it("limpia el texto, saca categorías vacías, objetos que no existen y repetidos", () => {
    const b = toBuild(raw(), stat, catalog, new Set([111]));
    expect(b.name).toBe("Mi build");
    expect(b.desc).toBe("Linea 1\n\nLinea 2");
    expect(b.cats).toEqual([
      { name: "#Citadel_HeroBuilds_EarlyGame", desc: "", items: [1, 5] },
      { name: "Final", desc: "lo último", items: [4, 3] },
    ]);
    expect(b.tags).toEqual([111]);
  });

  it("calcula almas, objetos clave, estilo y orden", () => {
    const b = toBuild(raw(), stat, catalog, new Set());
    expect(b.souls).toBe(800 + 800 + 6400 + 3200);
    expect(b.key).toEqual([4, 3, 1]);
    expect(b.style).toBe("spirit");
    expect(b.path).toEqual([10]);
  });

  it("lleva las partidas o cero si no hay", () => {
    expect(toBuild(raw(), stat, catalog, new Set())).toMatchObject({ matches: 100, wins: 60, players: 30, favorites: 12, lang: 5, version: 3 });
    expect(toBuild(raw(), undefined, catalog, new Set())).toMatchObject({ matches: 0, wins: 0, players: 0 });
  });

  it("sin nombre, o con uno que no se publica, queda vacío", () => {
    expect(toBuild(raw({ name: "   " }), undefined, catalog, new Set()).name).toBe("");
    expect(toBuild(raw({ name: "Sexual misconduct Abrams" }), undefined, catalog, new Set()).name).toBe("");
    expect(toBuild(raw({ description: "fuck this" }), undefined, catalog, new Set()).desc).toBe("");
  });
});

describe("pickIds", () => {
  const row = (id: number, matches: number): StatRow => ({ hero_id: 6, hero_build_id: id, wins: 0, losses: 0, matches, players: 1 });

  it("las forzadas primero, después las más jugadas con el mínimo", () => {
    const rows = [row(2000, 400), row(3000, 900), row(4000, 100), row(50, 99999)];
    expect(pickIds(rows, [9000], 5, 300)).toEqual([9000, 3000, 2000]);
  });

  it("corta en keep sin contar las forzadas y no repite", () => {
    const rows = [row(2000, 400), row(3000, 900), row(5000, 800)];
    expect(pickIds(rows, [3000], 1, 300)).toEqual([3000, 5000]);
  });
});

describe("sortBuilds e indexCard", () => {
  const b = (id: number, matches: number, official?: true): CommunityBuild =>
    ({ id, matches, updated: 0, official, name: "x", authorName: "y", wins: 1, style: "hybrid", key: [1] }) as CommunityBuild;

  it("elegidas primero, después por partidas", () => {
    expect(sortBuilds([b(1, 10), b(2, 50), b(3, 5, true)]).map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("la tarjeta de la portada lleva lo justo", () => {
    expect(indexCard(b(1, 10, true))).toEqual({ id: 1, name: "x", authorName: "y", matches: 10, wins: 1, style: "hybrid", key: [1], official: true });
    expect(indexCard(b(2, 10))).not.toHaveProperty("official");
  });
});

describe("isOffensive", () => {
  it("encuentra insultos, odio y sexo en inglés, español y ruso, también con leetspeak", () => {
    for (const s of ["Investigate Enemies for Sexual misconduct", "sh1t build", "Chief Executive Goyim", "HUGE DICK energy", "la puta madre", "ебать абрамс", "Сука билд", "1488 build", "N1gg4"])
      expect(isOffensive(s), s).toBe(true);
  });
  it("deja pasar palabras sanas que contienen esas letras", () => {
    for (const s of ["Grape Abrams", "Computadora", "icono", "pijama", "analysis", "Dickens", "Cocktail", "небо и хлеба", "требует", "Concha Abrams? no: conchas", "Nazir", "Speedo", "Scrape build", "Specimen", "Abrams Marco (UPDATED)"])
      expect(isOffensive(s), s).toBe(s.includes("Concha"));
  });
});

describe("cleanName", () => {
  it("saca dominios, links de Twitch y los % WR del nombre", () => {
    expect(cleanName("Abrams - Hybrid-Close Range [61% WR] [tracklock.gg]")).toBe("Abrams - Hybrid-Close Range");
    expect(cleanName("INFERNUS REND AND BURN [55% WR] [deadlocklabs.gg]")).toBe("INFERNUS REND AND BURN");
    expect(cleanName("RAID BOSS ABRAMS [Lockbuilds.com]")).toBe("RAID BOSS ABRAMS");
    expect(cleanName("zxc | arbuz (t.tv/qtarsis)")).toBe("zxc | arbuz");
    expect(cleanName("twitch.tv/togetherdl punchbrams")).toBe("punchbrams");
    expect(cleanName("Абрамс [65% WR] от Бобби")).toBe("Абрамс от Бобби");
  });
  it("deja los nombres comunes como están", () => {
    for (const s of ["Rumples 1v11 Abrams 11/12", "Abrams Marco (UPDATED 15 Dec 2024)", "Iphonz Gorilla Abrams (10/31/26)", "Mr. Gun 2.0"]) expect(cleanName(s)).toBe(s);
  });
  it("si es sólo propaganda, queda vacío", () => {
    expect(cleanName("[deadlocklabs.gg]")).toBe("");
  });
});
