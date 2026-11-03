import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarketBlock from "../src/cs2/market/MarketBlock";
import { LangContext } from "../src/i18n";

const wrap = (el: React.ReactElement) => renderToString(<LangContext.Provider value={{ lang: "es", setLang: () => undefined }}>{el}</LangContext.Provider>);

describe("el bloque de mercado de una ficha", () => {
  it("sin ventas no se dibuja", () => {
    expect(wrap(<MarketBlock sales={{}} history={null} />)).toBe("");
    expect(wrap(<MarketBlock sales={null} history={null} />)).toBe("");
  });
  it("una fila por variante, normal antes que StatTrak, y un día sin ventas en 24 h no rompe", () => {
    const html = wrap(<MarketBlock sales={{ "ST FN": [null, 200, 190, 180, 15], FT: [30, 31, 33, 35, 552] }} history={null} />);
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
    expect(html.indexOf(">FT<")).toBeLessThan(html.indexOf("StatTrak™ FN"));
    expect(html).toContain("552");
  });
  it("con 14 días de serie suma el gráfico", () => {
    const serie = Array.from({ length: 14 }, (_, i) => [`2026-11-${String(3 + i).padStart(2, "0")}`, 10 + i] as [string, number]);
    expect(wrap(<MarketBlock sales={{ FT: [1, 1, 1, 1, 50] }} history={serie} />)).toContain("últimos 14 días");
  });
});
