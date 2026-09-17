import { describe, it, expect } from "vitest";
import {
  buildEdition,
  classify,
  compact,
  isPatchPost,
  parseNotes,
  patchTitle,
  slugOf,
  verdictOf,
  type AssetEntry,
  type SteamNewsItem,
} from "../src/news";

// Recorte real del parche del 16/9, con el formato que devuelve Steam News.
const BBCODE =
  "[p][b]\\[ General ][/b][/p][p][/p]" +
  "[p]- Guardian bounty increased by 10%[/p]" +
  "[p]- All move slow values reduced by ~20% globally[/p]" +
  "[p]- Slows now also affect air drag by 35% of the slow value (convar citadel_enable_slows_affect_air_drag[/p][p]to toggle the slow drag behavior on and off)[/p]" +
  "[p][b]\\[ Items ][/b][/p]" +
  "[p]- Weakening Headshot: Bullet Resist Reduction reduced from -13% to -12%[/p]" +
  "[p]- Golden Goose Egg: Souls per minute reduced from 90 to 80[/p]" +
  "[p]- Spiritual Overflow: Buildup is 35% slower[/p]" +
  "[p]- Mystery Item: Something changed[/p]" +
  "[p][b]\\[ Heroes ][/b][/p]" +
  "[p]- Celeste: Stamina cooldown increased from 5 to 5.3[/p]" +
  "[p]- Celeste: Dazzling Trick cooldown increased from 34s to 38s[/p]" +
  "[p]- Celeste: Shining Wonder T3 Max Bounces reduced from +8 to +6[/p]" +
  "[p]- Paige: Fixed some collision issues with Rallying Charge[/p]" +
  "[p]- Paige: Heavy Melee spirit scaling increased from 0.3 to 0.45[/p]" +
  "[p]- Viscous: Goo Ball T3 now also increases spirit scaling by 0.2[/p]";

const POST: SteamNewsItem = {
  title: "Minor Update - 09-16-2026",
  url: "https://store.steampowered.com/news/x",
  contents: BBCODE,
  feedname: "steam_community_announcements",
  date: Date.UTC(2026, 8, 16, 20, 16) / 1000,
};

const ASSETS: AssetEntry[] = [
  { id: 1, type: "ability", name: "Dazzling Trick", hero: 81, image_webp: "dt.webp" },
  { id: 2, type: "ability", name: "Shining Wonder", hero: 81, image_webp: "sw.webp" },
  { id: 3, type: "ability", name: "Melee", hero: 81 },
  { id: 4, type: "ability", name: "Rallying Charge", hero: 67, image_webp: "rc.webp" },
  { id: 5, type: "ability", name: "Goo Ball", hero: 35, image_webp: "gb.webp" },
  { id: 10, type: "upgrade", name: "Weakening Headshot", item_slot_type: "weapon", shop_image_webp: "wh.webp" },
  { id: 11, type: "upgrade", name: "Golden Goose Egg", item_slot_type: "spirit", image_webp: "gg.webp" },
  { id: 12, type: "upgrade", name: "Spiritual Overflow", item_slot_type: "weapon", image_webp: "so.webp" },
];
const ASSETS_ES: AssetEntry[] = [
  { id: 1, type: "ability", name: "Truco Deslumbrante" },
  { id: 11, type: "upgrade", name: "Huevo de Oro" },
];
const HEROES = { "81": "Celeste", "67": "Paige", "35": "Viscous" };

describe("qué noticia es un parche", () => {
  it("toma los anuncios con fecha de build y deja afuera la prensa", () => {
    expect(isPatchPost(POST)).toBe(true);
    expect(isPatchPost({ ...POST, feedname: "PCGamesN", title: "Valve's nerf-happy new Deadlock update" })).toBe(false);
    expect(isPatchPost({ ...POST, title: "Deadlock Fall Sale" })).toBe(false);
  });

  it("nombra el parche como el foro", () => {
    expect(patchTitle(POST.title)).toBe("09-16-2026 Update");
  });

  it("usa la fecha de publicación en UTC como dirección", () => {
    expect(slugOf(POST.date)).toBe("2026-09-16");
  });
});

describe("parseNotes", () => {
  it("separa secciones y pega la línea que Valve partió en dos", () => {
    const s = parseNotes(BBCODE);
    expect(Object.keys(s)).toEqual(["general", "items", "heroes"]);
    expect(s.general).toHaveLength(3);
    expect(s.general[2]).toBe(
      "Slows now also affect air drag by 35% of the slow value (convar citadel_enable_slows_affect_air_drag to toggle the slow drag behavior on and off)"
    );
    expect(s.heroes[0]).toBe("Celeste: Stamina cooldown increased from 5 to 5.3");
  });

  it("decodifica las entidades HTML", () => {
    expect(parseNotes("[p]- Guardians +75%-&gt;-50%[/p]").general[0]).toBe("Guardians +75%->-50%");
  });
});

describe("classify", () => {
  it.each([
    ["Celeste: Shining Wonder damage reduced from 165 to 140", "down"],
    ["Graves: Health per boon increased from 33 to 35", "up"],
    // Más recarga es peor.
    ["Celeste: Dazzling Trick cooldown increased from 34s to 38s", "down"],
    ["Shadow Weave: Cooldown reduced from 45s to 37s", "up"],
    // Se compara el valor absoluto: una reducción de resistencia más chica es un nerf.
    ["Weakening Headshot: Bullet Resist Reduction reduced from -13% to -12%", "down"],
    ["Golden Goose Egg: Damage Penalty increased from -10% to -15%", "down"],
    ["Guardian bounty increased by 10%", "up"],
    ["Spiritual Overflow: Buildup is 35% slower", "down"],
    ["Paige: Fixed some collision issues with Rallying Charge", "fix"],
    ["Venator: Ira Domini now works with Ricochet, all the shots will bounce", "mid"],
  ])("%s → %s", (line, dir) => {
    expect(classify(line)).toBe(dir);
  });
});

describe("compact", () => {
  it.each([
    ["cooldown increased from 34s to 38s", "cooldown: 34s → 38s"],
    ["T3 Max Bounces reduced from +8 to +6", "Upgrade 3 · Max Bounces: +8 → +6"],
    ["T2 reduced from +80 to +70", "Upgrade 2: +80 → +70"],
    ["Gun falloff range reduced from 18m->54m to 16m->48m", "Gun falloff range: 18m–54m → 16m–48m"],
    ["DPS reduced by 25%", "DPS: −25%"],
    ["T3 now also increases spirit scaling by 0.2", "Upgrade 3 · now also increases spirit scaling by 0.2"],
    ["now works with Ricochet", "Now works with Ricochet"],
  ])("%s", (rest, out) => {
    expect(compact(rest)).toBe(out);
  });
});

describe("verdictOf", () => {
  const l = (...dirs: ("up" | "down" | "mid" | "fix")[]) => dirs.map((dir) => ({ src: "", dir }));
  it("mixto sólo cuando ningún lado dobla al otro", () => {
    expect(verdictOf(l("up", "up", "up", "down", "down", "down", "down", "down"))).toBe("mixed");
    expect(verdictOf(l("up", "up", "down", "down", "down", "down", "down"))).toBe("nerf");
    expect(verdictOf(l("up", "mid"))).toBe("buff");
    expect(verdictOf(l("mid", "fix"))).toBe("fix");
  });
});

describe("buildEdition", () => {
  const e = buildEdition({ post: POST, heroNames: HEROES, assetsEn: ASSETS, assetsEs: ASSETS_ES });

  it("agrupa cada héroe por habilidad, con lo del héroe primero", () => {
    const celeste = e.heroes.find((h) => h.heroId === 81)!;
    expect(celeste.verdict).toBe("nerf");
    expect(celeste.groups.map((g) => g.abilityId)).toEqual([undefined, 1, 2]);
    expect(celeste.groups[1].lines[0]).toEqual({
      src: "Celeste: Dazzling Trick cooldown increased from 34s to 38s",
      text: "cooldown: 34s → 38s",
      dir: "down",
    });
    expect(e.abilities["1"]).toEqual({ name: { en: "Dazzling Trick", es: "Truco Deslumbrante" }, img: "dt.webp" });
    // Sin traducción, el nombre en inglés.
    expect(e.abilities["2"].name.es).toBe("Shining Wonder");
  });

  it("encuentra la habilidad en el medio de un arreglo", () => {
    const paige = e.heroes.find((h) => h.heroId === 67)!;
    expect(paige.groups.find((g) => g.abilityId === 4)!.lines[0].dir).toBe("fix");
  });

  it("junta todas las líneas de cada objeto y guarda su tienda", () => {
    expect(e.items.map((i) => i.itemId).sort()).toEqual([10, 11, 12]);
    expect(e.itemInfo["11"]).toEqual({ name: { en: "Golden Goose Egg", es: "Huevo de Oro" }, img: "gg.webp", slot: "spirit" });
    expect(e.itemInfo["10"].img).toBe("wh.webp");
  });

  it("no pierde lo que no reconoce", () => {
    expect(e.unparsed.map((l) => l.src)).toEqual(["Mystery Item: Something changed"]);
  });

  it("no repite el texto cuando es igual al original", () => {
    expect(e.general[0]).toEqual({ src: "Guardian bounty increased by 10%", dir: "up" });
  });

  it("cuenta y ordena: nerfs primero", () => {
    expect(e.score).toEqual({ nerf: 1, buff: 2, mixed: 0, fix: 0 });
    expect(e.heroes[0].heroId).toBe(81);
    expect(e.totals).toEqual({ heroes: 3, heroLines: 6, items: 3, itemLines: 3, general: 3 });
  });

  it("aplica las correcciones y el titular fijado a mano", () => {
    const fixed = buildEdition({
      post: POST,
      heroNames: HEROES,
      assetsEn: ASSETS,
      assetsEs: ASSETS_ES,
      overrides: { headline: "Thanks Yoshi", dirs: { "All move slow values reduced by ~20% globally": "mid" } },
    });
    expect(fixed.headline).toBe("Thanks Yoshi");
    expect(fixed.general[1].dir).toBe("mid");
    // Sin corrección, menos ralentización cuenta como buff: la regla trata "slow values" como algo donde más es peor.
    expect(e.general[1].dir).toBe("up");
  });
});
