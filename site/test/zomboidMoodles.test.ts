/**
 * La pestaña Moodles de Project Zomboid (2026-09-30): la lista de los 26 (`/moodles`) y la ficha de cada uno, con los
 * datos reales de `games/zomboid/data/site/moodles.json` y el "qué hacer" nuestro (`moodles/advice.ts`). Se renderiza
 * la pestaña sola (`ZomboidMoodles`), como `zomboidTraits.test.ts`; el cableado (solapa, prerender, sitemap) lo prueba
 * `zomboidPublish.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pzIndex from "../../games/zomboid/data/index.json";
import moodlesJson from "../../games/zomboid/data/site/moodles.json";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { parseRoute, registerPzSlugs, routePath, type PzTab, type Route } from "../src/route";
import { ADVICE, ADVICE_ITEM_SLUGS_ES, adviceLinks } from "../src/zomboid/moodles/advice";
import { MOODLE_GROUPS, MOODLES, moodleMatches, moodleTint } from "../src/zomboid/moodles/data";
import ZomboidMoodles from "../src/zomboid/moodles/ZomboidMoodles";

const renderRoute = (route: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidMoodles, { route, navigate: () => undefined }),
    ),
  );
const render = (path: string) => renderRoute(parseRoute(path));
const base = (lang: "en" | "es") => parseRoute(`/${lang}/project-zomboid`);
/** La dirección de una ficha, con el slug de su idioma. */
const href = (lang: "en" | "es", sec: PzTab, id?: string) => routePath({ ...base(lang), pzSection: sec, detail: id });
const ficha = (lang: "en" | "es", id: string) => render(href(lang, "moodles", id));
/** El HTML de una hoja de la ficha por su clase (`pzmo-levels`, `pzmo-advice`…). */
const sheet = (html: string, cls: string): string => {
  const m = html.match(new RegExp(`<section class="[^"]*\\b${cls}\\b[^"]*">([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`no está la hoja ${cls}`);
  return m[1];
};
const links = (html: string, lang: "en" | "es", sec: PzTab) =>
  new Set([...html.matchAll(new RegExp(`href="(${href(lang, sec)}/[^"]+)"`, "g"))].map((m) => m[1]));

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const ids = (sec: PzTab) => new Set(INDEX.filter((e) => e.sec === sec).map((e) => e.id));
/** El HTML escapa el apóstrofo y las comillas: así se compara un texto del juego con lo que sale. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

describe("los datos de los moodles", () => {
  it("son los 26 del juego, cada uno en una sola hoja de la lista, con nombre en inglés y en español", () => {
    expect(MOODLES).toHaveLength(26);
    expect(MOODLES.map((m) => m.id)).toEqual((moodlesJson as { id: string }[]).map((m) => m.id));
    const grouped = MOODLE_GROUPS.flatMap((g) => g.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(MOODLES.map((m) => m.id).sort());
    // El nombre es texto nuestro (el juego sólo nombra los niveles): en español no puede quedar el inglés.
    for (const m of MOODLES) expect(m.es, m.id).not.toBe(m.en);
    expect(MOODLES.find((m) => m.id === "bleeding")).toMatchObject({ en: "Bleeding", es: "Sangrado" });
    // Con el nombre que muestra el moodle en la partida (Moodles_CantSprint_lvl1), no con el tipo interno "CantSprint".
    expect(MOODLES.find((m) => m.id === "restricted-movement")).toMatchObject({ en: "Restricted Movement", es: "Movimiento restringido" });
  });

  it("el círculo se tiñe como en el juego: de gris a rojo (o a verde, en los buenos) según el nivel", () => {
    expect(moodleTint(0, false)).toBe("rgb(128 128 128)");
    expect(moodleTint(1, false)).toBe("rgb(159 96 96)");
    expect(moodleTint(4, false)).toBe("rgb(255 0 0)");
    expect(moodleTint(2, true)).toBe("rgb(64 191 64)");
  });

  it("se buscan por su nombre y por el de cualquiera de sus niveles, en los dos idiomas y sin tildes", () => {
    const find = (q: string) => MOODLES.filter((m) => moodleMatches(m, q)).map((m) => m.id);
    expect(find("queasy")).toEqual(["sick"]);
    expect(find("nauseas")).toContain("sick");
    expect(find("sangrado")).toEqual(["bleeding"]);
    expect(find("peckish")).toEqual(["hungry"]);
    expect(find("")).toHaveLength(26);
  });
});

describe("la lista de moodles", () => {
  it("en español tiene un <a> por cada uno de los 26, agrupados en sus hojas, con el texto que lee Google", () => {
    const html = render("/es/project-zomboid/moodles");
    expect(links(html, "es", "moodles").size).toBe(26);
    expect(href("es", "moodles", "bleeding")).toBe("/es/project-zomboid/moodles/sangrado");
    expect(html).toContain('href="/es/project-zomboid/moodles/sangrado"');
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Moodles de Project Zomboid<\/h1>/);
    expect(html).toContain("Los 26 moodles de Project Zomboid");
    for (const h of ["Necesidades", "Cuerpo", "Ánimo", "Heridas y enfermedades", "Temperatura", "Al morir"]) expect(html).toContain(h);
    // Cada fila lleva el círculo teñido con el ícono del juego encima, y los nombres de sus niveles.
    expect(html).toContain('src="/zomboid/moodles/Status_Bleeding.webp"');
    expect(html).toContain("Sangrado leve · Sangrando · Sangrado severo · Pérdida masiva de sangre");
    expect(html).toMatch(/<input type="search"/);
  });

  it("en inglés, con los slugs en inglés", () => {
    const html = render("/en/project-zomboid/moodles");
    expect(links(html, "en", "moodles").size).toBe(26);
    expect(html).toContain('href="/en/project-zomboid/moodles/bleeding"');
    expect(html).toContain("Project Zomboid Moodles");
    expect(html).toContain("Minor Bleeding · Bleeding · Severe Bleeding · Massive Blood Loss");
  });

  it("un moodle que no existe muestra la lista con su nota", () => {
    const html = render("/es/project-zomboid/moodles/no-existe");
    expect(html).toContain("No encontramos ese moodle");
    expect(links(html, "es", "moodles").size).toBe(26);
  });
});

describe("la ficha de un moodle", () => {
  it("Sangrado en español: sus cuatro niveles con nombre y descripción, y qué hacer con enlaces a los objetos", () => {
    const html = ficha("es", "bleeding");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Sangrado<\/h1>/);
    expect(html).toContain("en inglés: Bleeding");
    const levels = sheet(html, "pzmo-levels");
    const bleeding = MOODLES.find((m) => m.id === "bleeding")!;
    expect(bleeding.levels).toHaveLength(4);
    for (const l of bleeding.levels) {
      expect(levels).toContain(esc(l.name.es));
      expect(levels).toContain(esc(l.desc.es));
    }
    expect(levels).toContain("Se requiere un vendaje.");
    // Cada nivel con su círculo teñido: del más claro al rojo pleno.
    for (const lvl of [1, 2, 3, 4]) expect(levels).toContain(`--pzmo-tint:${moodleTint(lvl, false)}`);
    const advice = sheet(html, "pzmo-advice");
    expect(advice).toContain("Qué hacer");
    expect(advice).toContain("Abrí el panel de salud");
    expect(advice).toContain('href="/es/project-zomboid/objetos/venda"');
    expect(advice).toContain(`href="${href("es", "items", "suture-needle")}"`);
  });

  it("Bleeding en inglés, con los niveles del juego en inglés y los enlaces con el slug inglés", () => {
    const html = ficha("en", "bleeding");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Bleeding<\/h1>/);
    expect(html).toContain("in Spanish: Sangrado");
    const levels = sheet(html, "pzmo-levels");
    for (const s of ["Minor Bleeding", "Bandage required.", "Massive Blood Loss", "Death from blood loss imminent."]) expect(levels).toContain(s);
    const advice = sheet(html, "pzmo-advice");
    expect(advice).toContain("What to do");
    expect(advice).toContain('href="/en/project-zomboid/items/bandage"');
  });

  it("Saciedad es de los buenos: su círculo se tiñe de verde", () => {
    const html = ficha("es", "food-eaten");
    expect(sheet(html, "pzmo-levels")).toContain(`--pzmo-tint:${moodleTint(4, true)}`);
    expect(html).toContain("de los buenos");
  });

  it("la ficha enlaza a los otros moodles de su hoja", () => {
    const related = sheet(ficha("es", "bleeding"), "pzmo-related");
    expect(related).toContain(`href="${href("es", "moodles", "pain")}"`);
    expect(related).not.toContain(`href="${href("es", "moodles", "bleeding")}"`);
  });

  it("ninguna de las 26 fichas sale sin título, niveles ni consejo, en los dos idiomas", () => {
    for (const m of MOODLES) {
      for (const lang of ["en", "es"] as const) {
        const html = ficha(lang, m.id);
        expect(html, `${lang} ${m.id}`).toMatch(new RegExp(`<h1 class="pzi-h1"[^>]*>${esc(m[lang])}</h1>`));
        expect(html, `${lang} ${m.id}`).not.toContain("No encontramos");
        expect(sheet(html, "pzmo-levels").match(/class="pzmo-level"/g), `${lang} ${m.id}`).toHaveLength(m.levels.length);
        expect(sheet(html, "pzmo-advice").length, `${lang} ${m.id}`).toBeGreaterThan(80);
      }
    }
  });
});

describe("el consejo de qué hacer (texto nuestro)", () => {
  it("cada moodle tiene el suyo en inglés y en español, de una a tres frases", () => {
    expect(Object.keys(ADVICE).sort()).toEqual(MOODLES.map((m) => m.id).sort());
    for (const [id, a] of Object.entries(ADVICE)) {
      for (const lang of ["en", "es"] as const) {
        const plain = a[lang].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        const sentences = plain.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«"])/).filter(Boolean);
        expect(sentences.length, `${lang} ${id}: ${plain}`).toBeGreaterThanOrEqual(1);
        expect(sentences.length, `${lang} ${id}: ${plain}`).toBeLessThanOrEqual(3);
        expect(plain, `${lang} ${id}`).not.toMatch(/\[|\]\(/);
      }
    }
  });

  it("cada enlace lleva a una ficha que existe, y los dos idiomas enlazan lo mismo", () => {
    const moodleIds = new Set(MOODLES.map((m) => m.id));
    for (const [id, a] of Object.entries(ADVICE)) {
      const en = adviceLinks(a.en);
      const es = adviceLinks(a.es);
      expect(es.map((l) => `${l.sec}:${l.id}`).sort(), id).toEqual(en.map((l) => `${l.sec}:${l.id}`).sort());
      for (const l of en) {
        const known = l.sec === "moodles" ? moodleIds : ids(l.sec);
        expect(known.has(l.id), `${id} → ${l.sec}/${l.id}`).toBe(true);
      }
    }
    // Los que pide el plan: vendas y antibióticos, y los analgésicos.
    const all = Object.values(ADVICE).flatMap((a) => adviceLinks(a.en).map((l) => l.id));
    for (const item of ["bandage", "antibiotics", "painkillers"]) expect(all).toContain(item);
  });

  it("los slugs en español de los objetos enlazados son los mismos que arma el build", () => {
    const linked = new Set(Object.values(ADVICE).flatMap((a) => adviceLinks(a.en).filter((l) => l.sec === "items").map((l) => l.id)));
    const built = buildEsSlugs(INDEX, []).items ?? {};
    expect(Object.keys(ADVICE_ITEM_SLUGS_ES).sort()).toEqual([...linked].filter((id) => built[id]).sort());
    for (const id of linked) expect(ADVICE_ITEM_SLUGS_ES[id] ?? id, id).toBe(built[id] ?? id);
  });

  it("anotar esos pocos slugs no borra los de la pestaña Objetos si ya estaban", () => {
    registerPzSlugs(buildEsSlugs(INDEX, []));
    registerPzSlugs({ items: ADVICE_ITEM_SLUGS_ES });
    expect(href("es", "items", "crowbar")).toBe("/es/project-zomboid/objetos/palanca");
    expect(href("es", "items", "bandage")).toBe("/es/project-zomboid/objetos/venda");
  });

  it("la infección zombi no tiene cura en el juego sin mods, y el consejo lo dice", () => {
    expect(ADVICE.zombie.en).toMatch(/no cure in vanilla/i);
    expect(ADVICE.zombie.es).toMatch(/no tiene cura/);
    expect(ADVICE.sick.en).toMatch(/no cure in vanilla/i);
    expect(ADVICE.sick.es).toMatch(/no tiene cura/);
  });
});
