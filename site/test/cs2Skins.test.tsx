import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SkinFicha, SkinRow } from "../src/cs2/data";
import SkinPage from "../src/cs2/skins/SkinPage";
import { filterSkins, readSkinFilters } from "../src/cs2/skins/filters";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const row = (slug: string, o: Partial<SkinRow> = {}): SkinRow => ({
  slug, name: `AK-47 | ${slug}`, weapon: "AK-47", cat: "rifles", rarity: "covert", min: 0, max: 1, st: true, sv: false, img: slug, ...o,
});
const ROWS = [row("a"), row("b", { cat: "knives", weapon: "Karambit", name: "★ Karambit | b" }), row("c", { st: false, sv: true })];

describe("filtros de Skins", () => {
  it("lee la query y deja sólo lo que pide", () => {
    expect(filterSkins(ROWS, readSkinFilters("?cat=knives")).map((r) => r.slug)).toEqual(["b"]);
    expect(filterSkins(ROWS, readSkinFilters("?sv=1")).map((r) => r.slug)).toEqual(["c"]);
    expect(filterSkins(ROWS, readSkinFilters("?q=karam")).map((r) => r.slug)).toEqual(["b"]);
    expect(filterSkins(ROWS, readSkinFilters("")).length).toBe(3);
  });
});

describe("ficha de una skin", () => {
  const ficha: SkinFicha = {
    ...row("bayonet-doppler-ruby", { name: "★ Bayonet | Doppler", phase: "Ruby", min: 0, max: 0.08, cat: "knives" }),
    desc: "", wears: [], cases: [], collections: [], variants: ["bayonet-doppler-phase-1"],
  };
  const html = renderToString(
    <LangContext.Provider value={{ lang: "es", setLang: () => undefined }}>
      <SkinPage
        ficha={ficha}
        price={{ n: [900, 800, null, null, null] }}
        skins={new Map([["bayonet-doppler-phase-1", row("bayonet-doppler-phase-1", { name: "★ Bayonet | Doppler", phase: "Phase 1" })]])}
        skinPrices={{ "bayonet-doppler-phase-1": { n: [500, 450, null, null, null] } }}
        cases={new Map()}
        collections={new Map()}
        date="2026-11-03"
        route={parseRoute("/es/cs2/skins/bayonet-doppler-ruby")}
        navigate={() => undefined}
      />
    </LangContext.Provider>,
  );
  it("lleva el nombre como h1 y enlaza a las otras fases", () => {
    expect(html).toMatch(/<h1[^>]*>★ Bayonet \| Doppler · Ruby<\/h1>/);
    expect(html).toContain('href="/es/cs2/skins/bayonet-doppler-phase-1"');
  });
  it("sólo los desgastes que alcanza su float", () => {
    expect(html).toContain("Recién fabricado");
    expect(html).toContain("Casi nuevo");
    expect(html).not.toContain("Deplorable");
  });
  it("dice que no sale de cajas si no tiene ninguna", () => {
    expect(html).toContain("No sale de cajas");
  });
});
