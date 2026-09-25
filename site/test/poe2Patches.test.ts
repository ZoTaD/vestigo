import { describe, it, expect } from "vitest";
// @ts-expect-error: módulo .mjs del pipeline, sin tipos (Node puro, sin dependencias)
import * as P from "../../games/poe2/pipeline/patches-parse.mjs";

describe("poe2 patches: títulos y versiones", () => {
  it("clasifica ediciones, hotfixes y lo que se ignora", () => {
    expect(P.classify("0.5.5c Patch Notes")).toEqual({ kind: "edition", version: "0.5.5c", content: false });
    expect(P.classify("Content Update 0.5.0 — Path of Exile 2: Return of the Ancients")).toMatchObject({ kind: "edition", version: "0.5.0", content: true });
    expect(P.classify("Actualización de contenido 0.5.5 — Path of Exile 2: Forbidden Rites")).toMatchObject({ content: true });
    expect(P.classify("Notas da atualização 0.5.3")).toMatchObject({ kind: "edition", version: "0.5.3" });
    expect(P.classify("0.5.4e Patch Notes (restartless)")).toMatchObject({ kind: "edition", version: "0.5.4e" });
    expect(P.classify("0.5.5 Hotfix")).toEqual({ kind: "hotfix", version: "0.5.5", nums: [1] });
    expect(P.classify("0.5.0b Hotfix 14 (Rolled back)")).toMatchObject({ nums: [14] });
    expect(P.classify("0.5.1 Hotfix - 0.5.1 Hotfix 5")).toMatchObject({ nums: [1, 2, 3, 4, 5] });
    expect(P.classify("Server Maintenance")).toBeNull();
    expect(P.classify("0.5.4e Maintenance")).toBeNull();
    expect(P.classify("0.5.3 Restart")).toBeNull();
  });

  it("ordena versiones con letra", () => {
    const vs = ["0.5.5", "0.5.4f", "0.5.5c", "0.5.10", "0.5.5b"].sort(P.cmpVersion);
    expect(vs).toEqual(["0.5.4f", "0.5.5", "0.5.5b", "0.5.5c", "0.5.10"]);
    expect(P.slugOf("0.5.5c")).toBe("0-5-5c");
  });

  it("lee las fechas de los dos foros", () => {
    expect(P.parseDate("Sep 17, 2026, 7:30:00 PM")).toBe("2026-09-17");
    expect(P.parseDate("17 sept. 2026 19:39:13")).toBe("2026-09-17");
    expect(P.parseDate("2 ago. 2026 10:00:00")).toBe("2026-08-02");
  });

  it("decodifica entidades", () => {
    expect(P.decode("Explosi&oacute;n &amp; da&ntilde;o hadn&#039;t &quot;x&quot;")).toBe("Explosión & daño hadn't \"x\"");
  });
});

describe("poe2 patches: el post", () => {
  const page = `<table class="forumTable forumPostListTable"><tr class="staff"><td>
    <div class="content"><h2>0.5.9 Patch Notes</h2><br>
    <h3>Table of Contents</h3><ul><li><a href="#a">Player Changes</a></li></ul>
    <img src="https://web.poecdn.com/public/news/banner.png">
    <h3>Player Changes</h3>
    <ul><li>Fixed a bug where <strong>Rakkar</strong> hadn&#039;t moved.</li>
    <li>Bonuses:<ul><li>1 Tablet: one</li><li>2 Tablets: two</li></ul></li></ul>
    <br/><a href="#top">Return to top</a>
    <strong>Monster Changes</strong><br>
    <ul><li>Reduced the damage of the Slam skill used by the Fury Monster.</li></ul>
    Updated Patch Notes:<br><ul><li>Added a new thing.</li></ul>
    </div><div class="signature"></div></td><td class="post_info"><span class="post_date">Sep 17, 2026, 7:30:00 PM</span></td></tr></table>
    <div class="content">otro post</div>`;

  it("saca el primer post, las secciones, las sublistas y el banner", () => {
    const post = P.firstPost(page);
    expect(post.date).toBe("2026-09-17");
    const { banner, sections } = P.parsePost(post.html, "0.5.9 Patch Notes");
    expect(banner).toBe("https://web.poecdn.com/public/news/banner.png");
    expect(sections.map((s: { title: string }) => s.title)).toEqual(["Player Changes", "Monster Changes", "Updated Patch Notes"]);
    expect(sections[0].lines[0].text).toBe("Fixed a bug where Rakkar hadn't moved.");
    expect(sections[0].lines[1]).toEqual({ text: "Bonuses:", kids: [{ text: "1 Tablet: one" }, { text: "2 Tablets: two" }] });
    expect(JSON.stringify(sections)).not.toMatch(/<|Return to top|Table of Contents|otro post/);
  });
});

describe("poe2 patches: dirección", () => {
  it.each([
    ["Fixed a bug where X did not work.", "fix"],
    ["Added a new Lineage Support Gem: Atziri's Communion.", "new"],
    ["Flame Wall now deals 20% more damage (previously 40%).", "down"],
    ["The Principal Infusion Notable now grants 30% increased duration (previously 20%).", "up"],
    ["Increased the damage of Spark from 10 to 14.", "up"],
    ["Reduced the cooldown of Shield Wall from 8 to 6 seconds.", "up"],
    ["Raised the mana cost of Spark from 5 to 7.", "down"],
    ["The basetype now has 725 Armour, 206 Energy Shield, and 130 Ward (previously 210 Armour, 60 Energy Shield, 11 Ward).", "up"],
    ["Transcendent Alloy can no longer be applied to Foci and Wands.", "down"],
    ["Ice Bite I Support is no longer limited to supporting just Attacks.", "up"],
    ["Reduced the damage of the Snipe skill used by the Cultist Archer Monster.", "up"],
    ["Bitter Dead now has a base Critical Strike chance of 12%.", "mid"],
    ["Barkskin: Now provides 50% of Energy Shield Lost as Armour at level 8 (previously 32%), scaling up to 62% at level 20 (previously 44%)", "up"],
    ["Comet: Now deals 212 to 318 Cold Damage at Gem level 11 (previously 223 to 335).", "down"],
    ["Boneshatter: Quality now grants 0-20% increased Attack Speed (previously 0-30% increased Attack Speed).", "down"],
    ["Earthquake: Aftershock now deals 184-666% of Attack damage at Gem levels 1-20 (previously 160-580%).", "up"],
    ["All Command Skills now have a 50% movement speed penalty during skill use (previously 70%).", "up"],
  ])("%s → %s", (text, dir) => {
    expect(P.dirOf(text)).toBe(dir);
  });

  it("en una sección de monstruos, lo que les baja es a favor del jugador", () => {
    expect(P.dirOf("Lowered the life of Jamanra, the Abomination by roughly 17%.", { foe: P.isFoeSection("Monster Changes") })).toBe("up");
  });

  it("copia las direcciones al español aunque el español aplane las sublistas", () => {
    const en = [
      { text: "Increased Spark damage from 10 to 14.", dir: "up" },
      { text: "Bonuses for Tablets:", kids: [{ text: "1 Tablet: adds 35% Expedition", dir: "new" }] },
      { text: "Fixed a bug with Rakkar.", dir: "fix" },
    ];
    const es = [
      { text: "Aumentamos el daño de Spark de 10 a 14." },
      { text: "Bonificaciones:" },
      { text: "1 tablilla: agrega 35% de Expedition" },
      { text: "Corregimos un error con Rakkar." },
    ];
    P.copyDirs(en, es);
    expect(es.map((l: { dir?: string }) => l.dir)).toEqual(["up", undefined, "new", "fix"]);
  });

  it("saca los renglones en portugués", () => {
    const secs = P.dropPortuguese([{ title: "", lines: [{ text: "Corrigido um problema no baú da guilda." }, { text: "Este parche contiene mejoras." }] }]);
    expect(secs[0].lines).toEqual([{ text: "Este parche contiene mejoras." }]);
  });
});

describe("poe2 patches: refs de la enciclopedia", () => {
  const match = P.makeMatcher([
    { id: "currency/chaos-orb", name: "Chaos Orb" },
    { id: "x/chaos", name: "Chaos" },
    { id: "gems/spark", name: "Spark" },
    { id: "gems/ice", name: "Ice" },
    { id: "uniques/facebreaker", name: "Facebreaker" },
  ]);
  it("nombre más largo, palabra entera, sin palabras comunes ni cortas", () => {
    expect(match("Your next Chaos Orb will be Chaos.")).toEqual(["currency/chaos-orb"]);
    expect(match("Sparkling Spark and Facebreaker's Ice.")).toEqual(["gems/spark", "uniques/facebreaker"]);
  });
  it("markRefs pone y saca", () => {
    const lines = [{ text: "Spark", refs: ["viejo"] }, { text: "nada", refs: ["viejo"] }];
    P.markRefs(lines, match);
    expect(lines).toEqual([{ text: "Spark", refs: ["gems/spark"] }, { text: "nada" }]);
    P.markRefs(lines, null);
    expect(lines).toEqual([{ text: "Spark" }, { text: "nada" }]);
  });
});
