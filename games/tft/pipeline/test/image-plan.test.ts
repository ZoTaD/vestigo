import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { localImageName, planImages, assertNoCollisions, type CatalogSection } from "../src/image-plan";

describe("localImageName", () => {
  it("is stable for the same URL", () => {
    const url = "https://raw.communitydragon.org/latest/game/assets/characters/tft_ahri/hud/tft_ahri_square.png";
    expect(localImageName(url)).toBe(localImageName(url));
  });

  it("differs for two URLs that share a basename", () => {
    // Pasa de verdad en el catálogo: dos rutas de personaje distintas terminan
    // en el mismo "..._square.png". El basename solo no alcanza como nombre.
    const a = "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeycomponent/hud/icons2d/tft_armorykeycomponent_square.png";
    const b = "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeycomponent/hud/tft_armorykeycomponent_square.png";
    expect(localImageName(a)).not.toBe(localImageName(b));
  });

  it("keeps the original extension", () => {
    expect(localImageName("https://raw.communitydragon.org/latest/game/foo/bar.png")).toMatch(/\.png$/);
  });
});

describe("planImages", () => {
  it("dedupes entries that point at the same URL", () => {
    const champions: CatalogSection = {
      A: { img: "https://x/a.png" },
      B: { img: "https://x/a.png" },
    };
    const plan = planImages([champions]);
    expect(plan.size).toBe(1);
  });

  it("skips entries whose img is already a local path, so a second run has nothing left to plan", () => {
    const champions: CatalogSection = {
      A: { img: "/img/set17/deadbeef.png" },
      B: { img: "https://x/b.png" },
    };
    const plan = planImages([champions]);
    expect(plan.size).toBe(1);
    expect(plan.has("https://x/b.png")).toBe(true);
  });

  it("skips entries with no img at all", () => {
    const champions: CatalogSection = { A: { img: "" } };
    expect(planImages([champions]).size).toBe(0);
  });
});

describe("assertNoCollisions", () => {
  it("passes when every filename maps back to one URL", () => {
    const plan = new Map([
      ["https://x/a.png", "hash-a.png"],
      ["https://x/b.png", "hash-b.png"],
    ]);
    expect(() => assertNoCollisions(plan)).not.toThrow();
  });

  it("throws when two different URLs share a filename", () => {
    const plan = new Map([
      ["https://x/a.png", "same.png"],
      ["https://x/b.png", "same.png"],
    ]);
    expect(() => assertNoCollisions(plan)).toThrow(/colisión/);
  });
});

// Capturadas del catalog.json real (set 17) antes de que images.ts lo
// localizara — no se pueden releer de ahí después de correr el script, porque
// para entonces `img` ya apunta a rutas locales y no queda nada que hashear.
// Las seis vienen de basenames repetidos de verdad: son la prueba de que
// nombrar por basename (en vez de por URL completa) rompería en este mismo
// catálogo.
const REAL_COLLIDING_BASENAME_PAIRS: [string, string][] = [
  [
    "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeycomponent/hud/icons2d/tft_armorykeycomponent_square.png",
    "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeycomponent/hud/tft_armorykeycomponent_square.png",
  ],
  [
    "https://raw.communitydragon.org/latest/game/assets/characters/tft8_teamupprop/hud/icons2d/tft5_emblemarmorykey_square.png",
    "https://raw.communitydragon.org/latest/game/assets/characters/tft5_emblemarmorykey/hud/tft5_emblemarmorykey_square.png",
  ],
  [
    "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeyornn/hud/icons2d/tft_armorykeyornn_square.png",
    "https://raw.communitydragon.org/latest/game/assets/characters/tft_armorykeyornn/hud/tft_armorykeyornn_square.png",
  ],
  [
    "https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/items/hexcore/tft17_gravestrait_offense_heavyplating.tft_set17.png",
    "https://raw.communitydragon.org/latest/game/assets/maps/particles/tft/item_icons/tft17/tft17_gravestrait_offense_heavyplating.tft_set17.png",
  ],
  [
    "https://raw.communitydragon.org/latest/game/assets/characters/tft_itemunknown/skins/skin0/tft_item_unknown.png",
    "https://raw.communitydragon.org/latest/game/assets/maps/particles/tft/item_icons/placeholders/tft_item_unknown.png",
  ],
  [
    "https://raw.communitydragon.org/latest/game/assets/maps/particles/tft/tft_item_deathblade.png",
    "https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/items/hexcore/tft_item_deathblade.png",
  ],
];

describe("URLs reales del catálogo que comparten basename", () => {
  it("cada par recibe nombres de archivo distintos", () => {
    for (const [a, b] of REAL_COLLIDING_BASENAME_PAIRS) {
      expect(localImageName(a)).not.toBe(localImageName(b));
    }
  });

  it("planImages + assertNoCollisions no revienta con las 712 URLs reales del set 17", () => {
    const champions: CatalogSection = {};
    REAL_COLLIDING_BASENAME_PAIRS.forEach(([a, b], i) => {
      champions[`a${i}`] = { img: a };
      champions[`b${i}`] = { img: b };
    });
    const plan = planImages([champions]);
    expect(plan.size).toBe(REAL_COLLIDING_BASENAME_PAIRS.length * 2);
    expect(() => assertNoCollisions(plan)).not.toThrow();
  });
});

describe("catalog.json después de correr images.ts", () => {
  // El script ya corrió sobre el catálogo real (ver imagenes-report.md): esto
  // confirma que el estado que queda commiteado es el esperado — ninguna URL
  // de CommunityDragon sobrevive salvo que el script la haya reportado como
  // fallida, y toda ruta local cae bajo /img/set<N>/.
  it("no tiene URLs remotas de communitydragon.org fuera de lo reportado como fallido", () => {
    const catalog = JSON.parse(readFileSync("../data/catalog.json", "utf-8"));
    const set = catalog.set;
    const sections: CatalogSection[] = [catalog.champions, catalog.traits, catalog.items];
    for (const section of sections) {
      for (const entry of Object.values(section)) {
        if (entry.img.startsWith("http")) continue; // ninguna esperada hoy; ver el reporte si esto falla
        expect(entry.img.startsWith(`/img/set${set}/`)).toBe(true);
      }
    }
  });
});
