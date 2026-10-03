import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pzIndex from "../../games/zomboid/data/index.json";
import { PZ_TABS, ZOMBOID_COPY } from "../src/zomboidCopy";
import { PZ_SECTIONS, type PzTab } from "../src/route";

describe("la copia de Project Zomboid", () => {
  it("cada pestaña tiene nombre y SEO en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const c = ZOMBOID_COPY[lang];
      for (const tab of ["home", ...PZ_SECTIONS] as const) {
        expect(c.tabs[tab], `${lang} ${tab}`).toBeTruthy();
        expect(c.seo[tab].title, `${lang} ${tab}`).toMatch(/\| Vestigo$/);
        expect(c.seo[tab].description.length, `${lang} ${tab}`).toBeGreaterThan(80);
      }
    }
  });

  it("los títulos empiezan por lo que se busca", () => {
    expect(ZOMBOID_COPY.en.seo.home.title).toMatch(/^Project Zomboid Map/);
    expect(ZOMBOID_COPY.es.seo.home.title).toMatch(/^Project Zomboid en español/);
    expect(ZOMBOID_COPY.es.seo.map.title).toMatch(/^Mapa de Project Zomboid/);
    expect(ZOMBOID_COPY.en.seo.traits.title).toMatch(/^Project Zomboid Traits/);
  });

  it("la barra dibuja once pestañas: profesiones va dentro de Rasgos", () => {
    expect(PZ_TABS).toHaveLength(11);
    expect(PZ_TABS).not.toContain("professions");
  });

  // Google corta el título a ~65 caracteres (el " | Vestigo" cuenta) y la descripción a ~160: un texto más largo sale
  // con puntos suspensivos y pierde justo el final, que suele ser lo que cierra la frase.
  it("ningún título pasa de 65 caracteres ni ninguna descripción de 160 (80 como mínimo)", () => {
    for (const lang of ["en", "es"] as const) {
      const c = ZOMBOID_COPY[lang];
      for (const tab of ["home", ...PZ_SECTIONS] as const) {
        const { title, description } = c.seo[tab];
        expect(title.length, `${lang} ${tab}: ${title}`).toBeLessThanOrEqual(65);
        expect(description.length, `${lang} ${tab}: ${description}`).toBeGreaterThanOrEqual(80);
        expect(description.length, `${lang} ${tab}: ${description}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it("las plantillas de ficha, con un nombre de 20 caracteres, entran en los mismos topes", () => {
    const name = "x".repeat(20);
    for (const lang of ["en", "es"] as const) {
      for (const [sec, make] of Object.entries(ZOMBOID_COPY[lang].seo.detail) as [PzTab, (n: string) => { title: string; description: string }][]) {
        // Parches no nombra una ficha sino una versión (2026-10-02): "42.21.1", no 20 letras.
        const { title, description } = make(sec === "patches" ? "42.21.1" : name);
        expect(title.length, `${lang} ${sec}: ${title}`).toBeLessThanOrEqual(65);
        expect(description.length, `${lang} ${sec}: ${description}`).toBeGreaterThanOrEqual(80);
        expect(description.length, `${lang} ${sec}: ${description}`).toBeLessThanOrEqual(160);
      }
    }
  });

  // Con 20 letras entraban, pero el nombre de rasgo más largo de verdad (Conocimiento de la naturaleza, 29) dejaba la
  // descripción en 164. Ésta usa los nombres reales, y los de los rasgos gemelos con sus profesiones.
  it("las fichas de rasgo, con el nombre real más largo y con los gemelos de profesión, entran en los topes", () => {
    type Entry = { sec: string; en: string; es: string; via?: { en: string[]; es: string[] } };
    const traits = (pzIndex as Entry[]).filter((e) => e.sec === "traits");
    for (const lang of ["en", "es"] as const) {
      const make = ZOMBOID_COPY[lang].seo.detail.traits!;
      const longest = traits.reduce((a, b) => (b[lang].length > a[lang].length ? b : a));
      if (lang === "es") expect(longest.es).toBe("Conocimiento de la naturaleza");
      for (const e of [longest, ...traits.filter((x) => x.via)]) {
        const { title, description } = make(e[lang], e.via?.[lang]);
        expect(title.length, `${lang}: ${title}`).toBeLessThanOrEqual(65);
        expect(description.length, `${lang}: ${description}`).toBeLessThanOrEqual(160);
        expect(description.length, `${lang}: ${description}`).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it("el título del mapa en español no repite «mapa»", () => {
    expect(ZOMBOID_COPY.es.seo.map.title.match(/mapa/gi)).toHaveLength(1);
  });

  // Un sello que la copia nombra y no existe se ve como un cuadrado vacío teñido: mejor que falle acá.
  it("cada sello que usa la copia tiene su imagen", () => {
    for (const lang of ["en", "es"] as const) {
      const { counts, tools } = ZOMBOID_COPY[lang].home;
      for (const { stamp } of [...counts, ...tools]) {
        expect(existsSync(new URL(`../public/zomboid/map/stamps/map_${stamp}.png`, import.meta.url)), `${lang}: map_${stamp}.png`).toBe(true);
      }
    }
  });

  it("los sellos fijos del mapa de la portada también", () => {
    // Están escritos en ZomboidHome.tsx (`stampStyle("house", …)`), no en la copia: se leen del código.
    const src = readFileSync(new URL("../src/zomboid/ZomboidHome.tsx", import.meta.url), "utf-8");
    const stamps = [...src.matchAll(/stampStyle\("([^"]+)"/g)].map((m) => m[1]);
    expect(stamps.length).toBeGreaterThanOrEqual(3);
    for (const stamp of stamps) expect(existsSync(new URL(`../public/zomboid/map/stamps/map_${stamp}.png`, import.meta.url)), `map_${stamp}.png`).toBe(true);
  });
});
