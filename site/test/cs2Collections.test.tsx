import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bestReturns } from "../src/cs2/Cs2Home";
import CollPage from "../src/cs2/collections/CollPage";
import type { CaseRow, CollFicha, SkinRow } from "../src/cs2/data";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const caseRow = (slug: string): CaseRow => ({ slug, name: slug, kind: "case", date: null, img: slug, n: 17 });

describe("portada de CS2", () => {
  it("la cinta sólo trae cajas con 'devuelve', de mayor a menor", () => {
    const rows = [caseRow("a"), caseRow("b"), caseRow("c")];
    expect(bestReturns(rows, { a: { price: 1, ev: 1, ret: 0.3 }, b: { price: 1 }, c: { price: 1, ev: 2, ret: 0.8 } }).map((r) => r.slug)).toEqual(["c", "a"]);
  });
});

describe("ficha de una colección", () => {
  const skin: SkinRow = { slug: "s", name: "AK-47 | S", weapon: "AK-47", cat: "rifles", rarity: "covert", min: 0, max: 0.5, st: false, sv: false, img: "s" };
  const ficha: CollFicha = { slug: "the-x-collection", name: "The X Collection", date: "2026-07-08", img: "x", n: 1, groups: [{ rarity: "covert", skins: ["s"] }], cases: [] };
  const html = renderToString(
    <LangContext.Provider value={{ lang: "es", setLang: () => undefined }}>
      <CollPage ficha={ficha} skins={new Map([["s", skin]])} skinPrices={{ s: { n: [3, 2, 1, null, null] } }} cases={new Map()} date="2026-11-03" route={parseRoute("/es/cs2/colecciones/the-x-collection")} navigate={() => undefined} />
    </LangContext.Provider>,
  );
  it("dice que no sale de cajas y lista sus skins por rareza", () => {
    expect(html).toContain("Ninguna caja trae esta colección");
    expect(html).toContain("Encubierto");
    expect(html).toContain('href="/es/cs2/skins/s"');
  });
});
