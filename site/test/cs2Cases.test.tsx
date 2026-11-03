import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CasePage from "../src/cs2/cases/CasePage";
import type { CaseFicha, CasePrice, SkinPrice, SkinRow } from "../src/cs2/data";
import { LangContext, type Lang } from "../src/i18n";
import { parseRoute } from "../src/route";

const skin = (slug: string, rarity: SkinRow["rarity"]): SkinRow => ({
  slug, name: `AK-47 | ${slug}`, weapon: "AK-47", cat: "rifles", rarity, min: 0, max: 1, st: true, sv: false, img: slug,
});
const SKINS = new Map([skin("a", "covert"), skin("b", "milspec")].map((s) => [s.slug, s]));
const PRICES: Record<string, SkinPrice> = { a: { n: [10, 8, 6, 5, 4] }, b: { n: [1, 1, 1, 1, 1] } };
const ficha = (kind: CaseFicha["kind"]): CaseFicha => ({
  slug: "x-case", name: "X Case", kind, date: "2024-01-16", img: "x-case", n: 2,
  groups: [{ rarity: "covert", skins: ["a"] }, { rarity: "milspec", skins: ["b"] }], rare: [],
});

function render(lang: Lang, f: CaseFicha, price: CasePrice) {
  return renderToString(
    <LangContext.Provider value={{ lang, setLang: () => undefined }}>
      <CasePage ficha={f} price={price} skins={SKINS} skinPrices={PRICES} date="2026-11-03" route={parseRoute(`/${lang}/cs2/cases/x-case`)} navigate={() => undefined} />
    </LangContext.Provider>,
  );
}

describe("ficha de una caja", () => {
  it("muestra la probabilidad de cada grupo y el devuelve en rojo si no recupera", () => {
    const html = render("es", ficha("case"), { price: 0.5, ev: 0.6, ret: 0.2 });
    expect(html).toContain("79,92");
    expect(html).toMatch(/class="c2-num is-down"[^>]*>20/);
    expect(html).toContain("<h1");
  });
  it("sin valor esperado dice que faltan precios", () => {
    expect(render("es", ficha("case"), { price: 0.5 })).toContain("faltan precios");
  });
  it("una terminal no muestra probabilidades ni devuelve", () => {
    const html = render("en", ficha("terminal"), { price: 0.06 });
    expect(html).not.toContain("79.92");
    expect(html).not.toContain("Returns");
    expect(html).toContain("Terminals don&#x27;t open with a key");
  });
});
