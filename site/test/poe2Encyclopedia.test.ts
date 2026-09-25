import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { levelText, fold } from "../src/poe2EncyclopediaData";
import { slugify } from "../src/route";

/**
 * La enciclopedia y el diario de parches de PoE2 salen de dos pipelines que se
 * corren a mano (encyclopedia.py y patches.mjs). Estos tests miran lo que
 * dejaron escrito: que cada ficha que el sitio enlaza exista, que cada dibujo
 * esté en public/, y que las menciones de los parches apunten a fichas reales.
 */
const DATA = join(__dirname, "..", "..", "games", "poe2", "data");
const PUBLIC = join(__dirname, "..", "public");
const read = (p: string) => JSON.parse(readFileSync(join(DATA, p), "utf-8"));

const index: { id: string; cat: string; en: string; es: string; icon: string | null }[] = read("encyclopedia/index.json");
const cats = ["gems", "uniques", "bases", "currency"] as const;
const rows = Object.fromEntries(cats.map((c) => [c, read(`encyclopedia/${c}.json`) as { slug: string; en: string; es: string; icon: string | null }[]]));

describe("índice de la enciclopedia", () => {
  it("no repite ids", () => {
    expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
  });

  it("cada id abre una ficha de su categoría", () => {
    for (const e of index) {
      const [cat, slug] = e.id.split("/");
      expect(rows[cat]?.some((r) => r.slug === slug), e.id).toBe(true);
    }
  });

  it("tiene todo lo que tienen las categorías", () => {
    expect(index.length).toBe(cats.reduce((n, c) => n + rows[c].length, 0));
  });
});

describe("fichas", () => {
  it("cada dibujo que se enlaza existe en public/", () => {
    const icons = new Set(cats.flatMap((c) => rows[c].map((r) => r.icon)).filter((i): i is string => !!i));
    const missing = [...icons].filter((i) => !existsSync(join(PUBLIC, i)));
    expect(missing).toEqual([]);
  });

  it("los slugs son los que arma el sitio (un duplicado lleva -2, -3…)", () => {
    for (const c of cats) {
      for (const r of rows[c]) {
        expect(r.slug.replace(/-\d+$/, ""), `${c}/${r.en}`).toBe(slugify(r.en).replace(/-\d+$/, ""));
      }
    }
  });

  it("cada ficha tiene nombre en los dos idiomas", () => {
    for (const c of cats) for (const r of rows[c]) expect(r.en && r.es, `${c}/${r.slug}`).toBeTruthy();
  });
});

describe("diario de parches", () => {
  const dir = join(DATA, "patches");
  const eds = readdirSync(dir).filter((f) => /^\d.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")));
  const ids = new Set(index.map((e) => e.id));
  type L = { text: string; refs?: string[]; kids?: L[] };
  const walk = function* (ls: L[]): Generator<L> {
    for (const l of ls) {
      yield l;
      if (l.kids) yield* walk(l.kids);
    }
  };

  it("cada mención apunta a una ficha de la enciclopedia", () => {
    const bad: string[] = [];
    for (const ed of eds)
      for (const secs of [ed.en, ed.es ?? []])
        for (const s of secs) for (const l of walk(s.lines)) for (const r of l.refs ?? []) if (!ids.has(r)) bad.push(`${ed.slug}: ${r}`);
    expect(bad).toEqual([]);
  });

  it("el índice lista todas las ediciones escritas", () => {
    const list = read("patches/index.json").editions.map((e: { slug: string }) => e.slug).sort();
    expect(list).toEqual(eds.map((e) => e.slug).sort());
  });
});

describe("levelText", () => {
  it("llena la plantilla con los números del nivel", () => {
    const l = { t: "Deals {0} to {1} Cold Damage", v: [["23", "35"], ["31", "47"]] };
    expect(levelText(l, 1)).toBe("Deals 23 to 35 Cold Damage");
    expect(levelText(l, 2)).toBe("Deals 31 to 47 Cold Damage");
  });

  it("un nivel de más usa el último que hay", () => {
    expect(levelText({ t: "{0}%", v: [["1"], ["2"]] }, 20)).toBe("2%");
  });

  it("una línea que cambia de forma trae el texto entero de cada nivel", () => {
    expect(levelText({ t: null, v: ["Fires 1 Projectile", "Fires 2 Projectiles"] }, 2)).toBe("Fires 2 Projectiles");
  });

  it("una línea fija no tiene números por nivel", () => {
    expect(levelText({ t: "Cannot Evade", v: null }, 5)).toBe("Cannot Evade");
  });
});

describe("fold", () => {
  it("busca sin tildes ni mayúsculas", () => {
    expect(fold("Núcleo de ALMA")).toBe("nucleo de alma");
  });
});
