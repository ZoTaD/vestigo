import { describe, expect, it } from "vitest";
import { RUST_COPY, RUST_TABS } from "../src/rustCopy";

describe("la copia de Rust", () => {
  it("cada pestaña tiene nombre y SEO en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const c = RUST_COPY[lang];
      for (const tab of RUST_TABS) {
        expect(c.tabs[tab], `${lang} ${tab}`).toBeTruthy();
        expect(c.seo[tab].title, `${lang} ${tab}`).toMatch(/\| Vestigo$/);
        expect(c.seo[tab].description.length, `${lang} ${tab}`).toBeGreaterThan(80);
        expect(c.seo[tab].description.length, `${lang} ${tab}`).toBeLessThanOrEqual(160);
      }
      // Ya no queda ninguna pestaña anunciada: todas las de la etapa 2 tienen página (2026-10-09).
      expect(c.soonTabs).toHaveLength(0);
      expect(RUST_TABS).toHaveLength(8);
    }
  });

  it("los títulos empiezan por lo que se busca", () => {
    expect(RUST_COPY.en.seo.home.title).toMatch(/^Rust Guide/);
    expect(RUST_COPY.es.seo.home.title).toMatch(/^Guía de Rust/);
    // Inglés primero: el español no se vende como ventaja (2026-10-09).
    for (const lang of ["en", "es"] as const) expect(JSON.stringify(RUST_COPY[lang].home) + RUST_COPY[lang].seo.home.title).not.toMatch(/en español|in spanish/i);
    expect(RUST_COPY.es.seo.home.title).not.toMatch(/en español/);
    expect(RUST_COPY.en.seo.electricity.title).toMatch(/^Rust Electricity Simulator/);
    expect(RUST_COPY.es.seo.electricity.title).toMatch(/^Simulador de electricidad de Rust/);
    expect(RUST_COPY.en.circuitSeo("solar turret", "x").title).toMatch(/^Rust Solar Turret Circuit/);
    expect(RUST_COPY.es.circuitSeo("torreta solar", "x").title).toMatch(/^Circuito de torreta solar en Rust/);
    expect(RUST_COPY.en.seo.raid.title).toMatch(/^Rust Raid Calculator/);
    expect(RUST_COPY.es.seo.raid.title).toMatch(/^Calculadora de raideo de Rust/);
  });
});
