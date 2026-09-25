import { describe, it, expect } from "vitest";
import regexJson from "@poe2/regex/regex.json";
import { between, buildRegex, gameMatches, geq, lineRx, MAX_CHARS, type Pool, type RxData } from "../src/poe2Regex/regex";

const D = regexJson as unknown as RxData;
const POOLS: Pool[] = ["waystone", "tablet", "gear", "relic"];
/** Una línea como la escribe el juego: con número suelto o con el rango de la tirada. */
const write = (tpl: string, v: string) => tpl.replace(/#/g, v);

describe("poe2 regex: números", () => {
  it("≥ n coincide exactamente con los enteros desde n", () => {
    for (let n = 2; n <= 300; n++) {
      const rx = new RegExp(`^(?:${geq(n)})$`);
      for (let x = 0; x <= 999; x++) expect(rx.test(String(x)), `${n} vs ${x}`).toBe(x >= n);
    }
  });

  it("entre lo y hi, para el grado de las piedras guía", () => {
    for (let lo = 1; lo <= 16; lo++) {
      for (let hi = lo; hi <= 16; hi++) {
        const rx = new RegExp(`^(?:${between(lo, hi)})$`);
        for (let x = 1; x <= 16; x++) expect(rx.test(String(x)), `${lo}-${hi} vs ${x}`).toBe(x >= lo && x <= hi);
      }
    }
  });
});

describe("poe2 regex: cada pedazo encuentra sólo su línea", () => {
  for (const pool of POOLS) {
    for (const lang of ["en", "es"] as const) {
      it(`${pool} (${lang})`, () => {
        const lines = D.pools[pool];
        const texts = [...new Set(lines.map((l) => l[lang].toLowerCase()))];
        for (const it of lines) {
          const rx = new RegExp(it.tok[lang]);
          for (const v of ["+15", "+15(10-20)"]) {
            const hits = texts.filter((t) => rx.test(write(t, v)));
            expect(hits, `${it.tok[lang]} en "${it[lang]}"`).toEqual([it[lang].toLowerCase()]);
          }
          expect(it.tok[lang].length).toBeLessThanOrEqual(64);
        }
      });
    }
  }
});

describe("poe2 regex: valores mínimos", () => {
  const find = (pool: Pool, en: string) => D.pools[pool].find((l) => l.en === en)!;

  it("velocidad de movimiento con mínimo, con y sin rango, en los dos idiomas", () => {
    const ms = find("gear", "#% increased Movement Speed");
    for (const lang of ["en", "es"] as const) {
      const rx = new RegExp(lineRx(ms, lang, 25));
      for (const v of [10, 20, 24, 25, 30, 35]) {
        for (const txt of [`${v}`, `${v}(20-35)`]) {
          expect(rx.test(write(ms[lang].toLowerCase(), txt)), `${lang} ${txt}`).toBe(v >= 25);
        }
      }
      // otra línea que también habla de velocidad de movimiento no entra
      const other = find("gear", "Minions have #% increased Movement Speed");
      expect(rx.test(write(other[lang].toLowerCase(), "40"))).toBe(false);
    }
  });

  it("un mínimo no se confunde con el máximo del rango de la tirada", () => {
    const fire = find("waystone", "Monsters deal #% of Damage as Extra Fire");
    for (const lang of ["en", "es"] as const) {
      const rx = new RegExp(lineRx(fire, lang, 15));
      expect(rx.test(write(fire[lang].toLowerCase(), "12(5-20)"))).toBe(false);
      expect(rx.test(write(fire[lang].toLowerCase(), "18(5-20)"))).toBe(true);
    }
  });
});

describe("poe2 regex: un objeto de punta a punta", () => {
  const waystone = (lang: "en" | "es", fire: string, curse: boolean) => [
    lang === "es" ? "Piedra guía (grado 15)" : "Waystone (Tier 15)",
    lang === "es" ? "Rareza: Raro" : "Rarity: Rare",
    lang === "es" ? "Monstruos raros: +40%" : "Rare Monsters: +40%",
    write(D.pools.waystone.find((l) => l.en === "Monsters deal #% of Damage as Extra Fire")![lang], fire),
    ...(curse ? [D.pools.waystone.find((l) => l.en.includes("Temporal Chains"))![lang]] : []),
  ].join("\n");

  for (const lang of ["en", "es"] as const) {
    it(`piedra guía (${lang})`, () => {
      const fire = D.pools.waystone.find((l) => l.en === "Monsters deal #% of Damage as Extra Fire")!;
      const chains = D.pools.waystone.find((l) => l.en.includes("Temporal Chains"))!;
      const rx = buildRegex(D, {
        lang,
        match: "all",
        tier: [14, 16],
        rarity: ["Rare"],
        header: { rare: 30 },
        picks: [{ line: fire, want: true }, { line: chains, want: false }],
      });
      expect(rx.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(gameMatches(rx, waystone(lang, "12(5-20)", false))).toBe(true);
      expect(gameMatches(rx, waystone(lang, "12(5-20)", true))).toBe(false);
      const low = waystone(lang, "12(5-20)", false).replace("15", "9");
      expect(gameMatches(rx, low)).toBe(false);
      expect(gameMatches(rx, waystone(lang, "12(5-20)", false).replace("+40%", "+20%"))).toBe(false);
    });
  }
});
