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
      // Las pestañas con página más las que se anuncian: cuando una se publica, sale de la lista de "pronto".
      expect(c.soonTabs.length + RUST_TABS.length).toBe(8);
      for (const tab of RUST_TABS) expect(c.soonTabs).not.toContain(c.tabs[tab]);
    }
  });

  it("los títulos empiezan por lo que se busca", () => {
    expect(RUST_COPY.en.seo.home.title).toMatch(/^Rust Guide/);
    expect(RUST_COPY.es.seo.home.title).toMatch(/^Guía de Rust/);
    // Inglés primero: el español no se vende como ventaja (2026-10-09).
    for (const lang of ["en", "es"] as const) expect(JSON.stringify(RUST_COPY[lang].home) + RUST_COPY[lang].seo.home.title).not.toMatch(/en español|in spanish/i);
    expect(RUST_COPY.en.seo.raid.title).toMatch(/^Rust Raid Calculator/);
    expect(RUST_COPY.es.seo.raid.title).toMatch(/^Calculadora de raideo de Rust/);
  });
});
