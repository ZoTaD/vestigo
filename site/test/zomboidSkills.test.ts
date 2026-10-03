/**
 * La pestaña Habilidades y libros de Project Zomboid (2026-09-30): la cuenta pura de la calculadora (`skills/calc.ts`)
 * con los datos reales de `games/zomboid/data/site/skills.json`, y el render de la lista y de la ficha. Se renderiza la
 * pestaña sola (`ZomboidSkills`), como `zomboidMoodles.test.ts`; el cableado (solapa, prerender, sitemap) lo prueba
 * `zomboidPublish.test.ts`.
 *
 * Los valores esperados de la calculadora están hechos a mano con esos datos, con la cuenta en el comentario. Las reglas
 * (leídas en el juego 42.21, ver el encabezado de `calc.ts`):
 * - la barra pide `xp[n]` para pasar del nivel n al n+1 (Carpintería: 75, 150, 300, 750, 1500, 3000, 4500, 6000, 7500,
 *   9000; Fuerza y Estado físico: 1500 … 150000);
 * - lo que ganás haciendo algo se multiplica por la tabla de bonificación × los rasgos (`xpMult`) × el libro leído;
 * - un libro "niveles 1–2" multiplica la subida a 1 y a 2 (de la XP total del nivel 0 a la del nivel 2).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import skillItemSlugs from "virtual:pz-slugs-es/skill-items";
import pzIndex from "../../games/zomboid/data/index.json";
import pzMeta from "../../games/zomboid/data/meta.json";
import siteSkills from "../../games/zomboid/data/site/skills.json";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, type PzTab, type Route } from "../src/route";
import { bookFor, charMult, roundEarn, withBooks, xpNeeded } from "../src/zomboid/skills/calc";
import { ALL_SKILLS, findSkill, type SkillData } from "../src/zomboid/skills/data";
import ZomboidSkills from "../src/zomboid/skills/ZomboidSkills";
import { findTrait } from "../src/zomboid/traits/data";

const skill = (id: string): SkillData => {
  const s = findSkill(id);
  if (!s) throw new Error(`no está la habilidad ${id}`);
  return s;
};
const carpentry = skill("carpentry");
const trait = (id: string) => {
  const t = findTrait(id);
  if (!t) throw new Error(`no está el rasgo ${id}`);
  return t;
};

describe("los datos de las habilidades", () => {
  it("son las del juego, en su orden", () => {
    // El plan decía "35 habilidades" y el planificador dibuja 37 renglones (suma las categorías como títulos): las fichas
    // son las 35 habilidades que trae el juego, ni una más.
    expect(ALL_SKILLS).toHaveLength((siteSkills as unknown[]).length);
    expect(ALL_SKILLS).toHaveLength(35);
    expect(ALL_SKILLS.map((s) => s.id)).toEqual((siteSkills as { id: string }[]).map((s) => s.id));
  });
});

describe("xpNeeded", () => {
  it("suma la XP de cada nivel del tramo", () => {
    // 75 + 150 + 300 + 750 + 1500 + 3000 + 4500 + 6000 + 7500 + 9000
    expect(xpNeeded(carpentry, 0, 10)).toBe(32775);
    expect(xpNeeded(carpentry, 0, 1)).toBe(75);
    // De 3 a 5: xp[3] + xp[4] = 750 + 1500
    expect(xpNeeded(carpentry, 3, 5)).toBe(2250);
  });

  it("Estado físico tiene su propia tabla", () => {
    // 1500 + 3000 + 6000 + 9000 + 18000 + 30000 + 60000 + 90000 + 120000 + 150000
    expect(xpNeeded(skill("fitness"), 0, 10)).toBe(487500);
    // Arranca en 5: 30000 + 60000 + 90000 + 120000 + 150000
    expect(xpNeeded(skill("fitness"), 5, 10)).toBe(450000);
  });

  it("un tramo vacío o al revés no pide nada, y los niveles se recortan a 0–10", () => {
    expect(xpNeeded(carpentry, 5, 5)).toBe(0);
    expect(xpNeeded(carpentry, 7, 3)).toBe(0);
    expect(xpNeeded(carpentry, -2, 1)).toBe(75);
    expect(xpNeeded(carpentry, 9, 14)).toBe(9000);
  });
});

describe("bookFor", () => {
  it("el libro que multiplica la subida a cada nivel", () => {
    expect(bookFor(carpentry, 0)).toBeNull();
    expect(bookFor(carpentry, 1)?.item.id).toBe("carpentry-i-a-guide-to-nailing");
    expect(bookFor(carpentry, 2)?.item.id).toBe("carpentry-i-a-guide-to-nailing");
    expect(bookFor(carpentry, 3)?.item.id).toBe("carpentry-ii-carpentry-woodcraft-style");
    expect(bookFor(carpentry, 10)?.mult).toBe(16);
    expect(bookFor(skill("axe"), 4)).toBeNull();
  });
});

describe("charMult", () => {
  it("la tabla de la bonificación de inicio, con tope en 3", () => {
    expect(charMult(carpentry, 0, [])).toBe(0.25);
    expect(charMult(carpentry, 1, [])).toBe(1);
    expect(charMult(carpentry, 2, [])).toBe(1.33);
    expect(charMult(carpentry, 3, [])).toBe(1.66);
    // 5 cuenta como 3: el juego guarda min(3, nivel).
    expect(charMult(carpentry, 5, [])).toBe(1.66);
    // Carrera con bonificación 1 da ×1,25; Estado físico, ×1 siempre.
    expect(charMult(skill("running"), 1, [])).toBe(1.25);
    expect(charMult(skill("fitness"), 0, [])).toBe(1);
  });

  it("encima, los rasgos que multiplican esa habilidad", () => {
    // 1,33 × 1,3 (Ingenioso, Elaboración) = 1,729. Ingenioso no se combina con Aprendiz rápido ni lento.
    expect(charMult(carpentry, 2, [trait("crafty")])).toBeCloseTo(1.729, 6);
    // 0,25 × 1,3 (Aprendiz rápido) × 0,75 (Pacifista) = 0,24375
    expect(charMult(skill("aiming"), 0, [trait("fast-learner"), trait("reluctant-fighter")])).toBeCloseTo(0.24375, 6);
    // Pacifista no toca Carpintería: 1 × 0,7 (Aprendiz lento) = 0,7
    expect(charMult(carpentry, 1, [trait("slow-learner"), trait("reluctant-fighter")])).toBeCloseTo(0.7, 6);
    // Puntería sí: 0,25 × 0,75 = 0,1875
    expect(charMult(skill("aiming"), 0, [trait("reluctant-fighter")])).toBeCloseTo(0.1875, 6);
    // Estado físico no se multiplica por Aprendiz rápido.
    expect(charMult(skill("fitness"), 3, [trait("fast-learner")])).toBe(1);
  });
});

describe("withBooks", () => {
  it("Carpintería de 0 a 10 con ×1: un tramo por libro, y lo que hay que ganar", () => {
    const plan = withBooks(carpentry, 0, 10, 1);
    // 0→2: (75 + 150) / 3 = 75 · 2→4: (300 + 750) / 5 = 210 · 4→6: (1500 + 3000) / 8 = 562,5
    // 6→8: (4500 + 6000) / 12 = 875 · 8→10: (7500 + 9000) / 16 = 1031,25
    expect(plan.stretches.map((s) => [s.from, s.to, s.book?.mult ?? null, s.bar, s.earn])).toEqual([
      [0, 2, 3, 225, 75],
      [2, 4, 5, 1050, 210],
      [4, 6, 8, 4500, 562.5],
      [6, 8, 12, 10500, 875],
      [8, 10, 16, 16500, 1031.25],
    ]);
    expect(plan.bar).toBe(32775);
    // 75 + 210 + 562,5 + 875 + 1031,25
    expect(plan.earn).toBeCloseTo(2753.75, 6);
    // Cada libro se puede leer desde un nivel antes del primero de su tramo (el juego no deja leerlo antes).
    expect(plan.stretches.map((s) => s.book?.from)).toEqual([1, 3, 5, 7, 9]);
  });

  it("un tramo que empieza a mitad de un libro, sin bonificación (×0,25)", () => {
    const plan = withBooks(carpentry, 1, 5, 0.25);
    // 1→2 con el I: 150 / (0,25 × 3) = 200 · 2→4 con el II: 1050 / (0,25 × 5) = 840 · 4→5 con el III: 1500 / (0,25 × 8) = 750
    expect(plan.stretches.map((s) => [s.from, s.to, s.book?.item.id, s.earn])).toEqual([
      [1, 2, "carpentry-i-a-guide-to-nailing", 200],
      [2, 4, "carpentry-ii-carpentry-woodcraft-style", 840],
      [4, 5, "carpentry-iii-hand-crafted-shelving-and-storage", 750],
    ]);
    expect(plan.bar).toBe(2700);
    expect(plan.earn).toBe(1790);
  });

  it("Puntería tiene sus libros más flojos: con Pacifista y sin bonificación", () => {
    // (75 + 150) / (0,25 × 0,75 × 1,5) = 225 / 0,28125 = 800
    const plan = withBooks(skill("aiming"), 0, 2, charMult(skill("aiming"), 0, [trait("reluctant-fighter")]));
    expect(plan.stretches).toHaveLength(1);
    expect(plan.stretches[0].book?.mult).toBe(1.5);
    expect(plan.earn).toBeCloseTo(800, 6);
  });

  it("sin libros, o en una habilidad sin libros, es un solo tramo", () => {
    // 32775 / 1,66
    const plain = withBooks(carpentry, 0, 10, 1.66, false);
    expect(plain.stretches).toHaveLength(1);
    expect(plain.stretches[0].book).toBeNull();
    expect(plain.earn).toBeCloseTo(32775 / 1.66, 6);
    // Hacha no tiene libros: 75 + 150 + 300 = 525
    const axe = withBooks(skill("axe"), 0, 3, 1);
    expect(axe.stretches.map((s) => [s.from, s.to, s.book, s.bar])).toEqual([[0, 3, null, 525]]);
  });

  it("un tramo vacío no tiene renglones", () => {
    expect(withBooks(carpentry, 6, 6, 1)).toEqual({ stretches: [], bar: 0, earn: 0 });
  });
});

describe("roundEarn: la XP a ganar en enteros, con los tramos sumando el total", () => {
  it("Puntería 0→4 con Aprendiz rápido y sin bonificación (×0,325): 462 + 1.292 = 1.754", () => {
    const plan = withBooks(skill("aiming"), 0, 4, charMult(skill("aiming"), 0, [trait("fast-learner")]));
    // 0→2 con ×1,5: 225 / 0,4875 = 461,54 · 2→4 con ×2,5: 1050 / 0,8125 = 1292,31 · total exacto 1753,85 → 1754.
    // Acumulado redondeado: 462, y 1754 − 462 = 1292 (redondeando cada uno por su lado eran 462 + 1293 = 1755).
    expect(plan.earn).toBeCloseTo(1753.846, 3);
    expect(roundEarn(plan)).toEqual({ stretches: [462, 1292], total: 1754 });
  });

  it("Carpintería 3→7 con bonificación 3 y Aprendiz rápido (×2,158): 70 + 261 + 173 = 504", () => {
    const plan = withBooks(carpentry, 3, 7, charMult(carpentry, 3, [trait("fast-learner")]));
    // 3→4 con ×5: 750 / 10,79 = 69,51 · 4→6 con ×8: 4500 / 17,264 = 260,66 · 6→7 con ×12: 4500 / 25,896 = 173,77.
    // Acumulado: 69,51 → 70 · 330,17 → 331 (331 − 70 = 261) · 503,94 → 504 (504 − 331 = 173).
    const shown = roundEarn(plan);
    expect(shown).toEqual({ stretches: [70, 261, 173], total: 504 });
    expect(shown.stretches.reduce((a, b) => a + b, 0)).toBe(shown.total);
  });

  it("los tramos siempre suman el total, y ninguno se aleja más de 1 de su cuenta exacta", () => {
    for (const s of ALL_SKILLS) {
      for (const boost of [0, 1, 2, 3]) {
        const plan = withBooks(s, 0, 10, charMult(s, boost, [trait("fast-learner")]));
        const shown = roundEarn(plan);
        expect(shown.stretches.reduce((a, b) => a + b, 0), `${s.id} ${boost}`).toBe(shown.total);
        expect(shown.total, `${s.id} ${boost}`).toBe(Math.ceil(plan.earn - 1e-9));
        plan.stretches.forEach((st, i) => expect(Math.abs(shown.stretches[i] - st.earn), `${s.id} ${boost} ${i}`).toBeLessThan(1 + 1e-9));
      }
    }
  });
});

describe("los programas de TV (Life and Living TV, RadioData.xml)", () => {
  const tv = (s: SkillData) => s.media.filter((m) => m.kind === "tv");
  const total = (s: SkillData) => tv(s).reduce((sum, m) => sum + m.xp, 0);

  it("Carpintería: 53 líneas CRP+1 en el canal, a 50 XP cada una = 2.650, en ocho emisiones de días distintos", () => {
    // Contadas a mano en RadioData.xml de la 42.21 (las líneas de Life and Living TV con "CRP+1"): 53 × 50 = 2650.
    expect(total(carpentry)).toBe(2650);
    expect(tv(carpentry).map((m) => m.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(tv(carpentry).map((m) => m.en))).toEqual(new Set(["Life and Living TV"]));
    // Día 1, de 12:00 a 18:00 (timestamp 720 a 1080): seis líneas CRP+1 = 300.
    expect(tv(carpentry)[0]).toMatchObject({ day: 1, start: 720, end: 1080, xp: 300 });
  });

  it("las otras cinco habilidades del canal, con la misma cuenta (líneas × 50)", () => {
    // COO 61, FIS 17, FOR 12, TRA 8, FRM 6 líneas con +1.
    expect(total(skill("cooking"))).toBe(61 * 50);
    expect(total(skill("fishing"))).toBe(17 * 50);
    expect(total(skill("foraging"))).toBe(12 * 50);
    expect(total(skill("trapping"))).toBe(8 * 50);
    expect(total(skill("agriculture"))).toBe(6 * 50);
    expect(ALL_SKILLS.filter((s) => tv(s).length).map((s) => s.id).sort()).toEqual(
      ["agriculture", "carpentry", "cooking", "fishing", "foraging", "trapping"],
    );
  });

  it("el programa del día 1 que termina antes de las 9:00 (la hora de arranque por defecto) va marcado", () => {
    expect(pzMeta.gameStartMinute).toBe(540);
    const early = ALL_SKILLS.flatMap((s) => tv(s).filter((m) => m.beforeStart).map((m) => [s.id, m.day, m.start, m.end, m.xp]));
    expect(early).toEqual([["fishing", 1, 0, 360, 300]]);
  });
});

describe("los nombres del juego van sin barras de escape", () => {
  it("ningún nombre del índice trae una barra pegada a una comilla (la traducción ES_MX de la 42.21 la tiene en dos libros)", () => {
    const INDEX_NAMES = (pzIndex as { en: string; es: string }[]).flatMap((e) => [e.en, e.es]);
    expect(INDEX_NAMES.filter((n) => /\\["']/.test(n))).toEqual([]);
    // Soldadura IV venía con las dos comillas escapadas; Carpintería V, con la de cierre.
    expect(INDEX_NAMES).toContain('Soldadura IV: "Del mineral a placas: Manual completo de soldadura"');
    const v = carpentry.books.find((b) => b.from === 9)!;
    expect(v.item.es).toBe('Carpintería V: "Ensamblaje de Obra y Carpintería Arquitectónica"');
  });
});

const renderRoute = (route: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidSkills, { route, navigate: () => undefined }),
    ),
  );
const base = (lang: "en" | "es") => parseRoute(`/${lang}/project-zomboid`);
/** La dirección de una ficha, con el slug de su idioma. */
const href = (lang: "en" | "es", sec: PzTab, id?: string) => routePath({ ...base(lang), pzSection: sec, detail: id });
const render = (path: string) => renderRoute(parseRoute(path));
/** El HTML de una hoja de la ficha por su clase (`pzs-books`, `pzs-who`…). */
const sheet = (html: string, cls: string): string => {
  const m = html.match(new RegExp(`<section class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`no está la hoja ${cls}`);
  return m[1];
};
const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
const ES_SLUGS = buildEsSlugs(INDEX, []);
/** El HTML escapa el apóstrofo y las comillas: así se compara un texto del juego con lo que sale. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

describe("los slugs de los libros y las revistas", () => {
  it("son los mismos que arma el build para Objetos, de todos los que enlaza la pestaña", () => {
    const ids = new Set(ALL_SKILLS.flatMap((s) => [...s.books.map((b) => b.item.id), ...s.magazines.map((m) => m.id)]));
    expect(ids.size).toBeGreaterThan(150);
    const expected = Object.fromEntries(Object.entries(ES_SLUGS.items ?? {}).filter(([id]) => ids.has(id)));
    expect(skillItemSlugs).toEqual({ items: expected });
  });
});

describe("la lista", () => {
  it.each(["en", "es"] as const)("en %s, un enlace a cada habilidad y la XP de 0 a 10", (lang) => {
    const html = render(href(lang, "skills"));
    const links = new Set([...html.matchAll(new RegExp(`href="(${href(lang, "skills")}/[^"]+)"`, "g"))].map((m) => m[1]));
    expect(links.size).toBe(ALL_SKILLS.length);
    for (const s of ALL_SKILLS) expect(links.has(href(lang, "skills", s.id)), s.id).toBe(true);
    expect(html).toContain(lang === "es" ? "De 0 a 10: 32.775 XP" : "0 to 10: 32,775 XP");
    // Fuerza y Estado físico arrancan en 5, y la tabla es otra.
    expect(html).toContain(lang === "es" ? "De 0 a 10: 487.500 XP · arranca en 5" : "0 to 10: 487,500 XP · starts at 5");
    // Las categorías, con el nombre del juego.
    expect(html).toContain(lang === "es" ? "Combate: Cuerpo a cuerpo" : "Combat - Melee");
  });

  it("una dirección que no existe muestra la lista con un aviso", () => {
    const html = render("/es/project-zomboid/habilidades/no-existe");
    expect(html).toContain("No encontramos esa habilidad");
    expect(html).toContain('href="/es/project-zomboid/habilidades/carpinteria"');
  });
});

describe("la ficha de Carpintería", () => {
  it("en español, con sus cinco libros enlazados a Objetos y su multiplicador", () => {
    const html = render("/es/project-zomboid/habilidades/carpinteria");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Carpintería<\/h1>/);
    expect(html).toContain("De 0 a 10: 32.775 XP");
    const books = sheet(html, "pzs-books");
    for (const b of carpentry.books) {
      const slug = ES_SLUGS.items?.[b.item.id] ?? b.item.id;
      expect(books, b.item.id).toContain(`href="/es/project-zomboid/objetos/${slug}"`);
      expect(books).toContain(esc(b.item.es));
      expect(books).toContain(`niveles ${b.from}–${b.to} · ×${b.mult}`);
      expect(books).toContain(`se lee desde el nivel ${b.from - 1}`);
    }
    // El primer libro: "Carpintería I: «Guía para clavar»", con su slug en español.
    expect(books).toContain('href="/es/project-zomboid/objetos/carpinteria-i-guia-para-clavar"');
  });

  it("en inglés, con los mismos libros", () => {
    const html = render("/en/project-zomboid/skills/carpentry");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Carpentry<\/h1>/);
    const books = sheet(html, "pzs-books");
    for (const b of carpentry.books) {
      expect(books).toContain(`href="/en/project-zomboid/items/${b.item.id}"`);
      expect(books).toContain(`levels ${b.from}–${b.to} · ×${b.mult}`);
    }
    expect(books).toContain(esc('Carpentry I: "A Guide to Nailing"'));
  });

  it("la tabla de XP con el total y el libro de cada nivel", () => {
    const xp = sheet(render("/es/project-zomboid/habilidades/carpinteria"), "pzs-xp");
    // Nivel 3: 300, total 75 + 150 + 300 = 525, con el libro II (×5).
    expect(xp).toMatch(/<th scope="row">3<\/th><td>300<\/td><td>525<\/td><td>×5<\/td>/);
    expect(xp).toMatch(/<th scope="row">10<\/th><td>9\.000<\/td><td>32\.775<\/td><td>×16<\/td>/);
  });

  it("las revistas (enseñan recetas, no dan XP) y los VHS, con «hasta» en la cinta compartida", () => {
    const html = render("/es/project-zomboid/habilidades/carpinteria");
    const mags = sheet(html, "pzs-mags");
    expect(mags).toContain("Enseñan recetas que usan la habilidad. No dan XP.");
    for (const m of carpentry.magazines) expect(mags).toContain(`href="/es/project-zomboid/objetos/${ES_SLUGS.items?.[m.id] ?? m.id}"`);
    const media = sheet(html, "pzs-media");
    expect(media).toContain("<span>VHS: Woodcraft E1</span><b>+250 XP</b>");
    expect(media).toContain("<span>VHS: Woodcraft E3</span><b>hasta 250 XP</b>");
    expect(media).toContain(`por debajo del nivel ${pzMeta.mediaXpCutoff}`);
    const en = sheet(render("/en/project-zomboid/skills/carpentry"), "pzs-media");
    expect(en).toContain("<span>VHS: Woodcraft E3</span><b>up to 250 XP</b>");
  });

  it("los programas de TV, con su día y su horario, y el total del canal con «hasta»", () => {
    const tvEs = sheet(render("/es/project-zomboid/habilidades/carpinteria"), "pzs-tv");
    expect(tvEs).toContain("Life and Living TV");
    expect(tvEs).toContain("<span>Día 1 · 12:00–18:00</span><b>+300 XP</b>");
    // El del día 8 sale a la noche: 1080 a 1410 minutos = 18:00 a 23:30.
    expect(tvEs).toContain("<span>Día 8 · 18:00–23:30</span><b>+150 XP</b>");
    expect(tvEs).toContain("<span>En total</span><b>hasta 2.650 XP</b>");
    expect(tvEs).toContain("Cada programa sale una sola vez");
    const tvEn = sheet(render("/en/project-zomboid/skills/carpentry"), "pzs-tv");
    expect(tvEn).toContain("<span>Day 1 · 12:00–18:00</span><b>+300 XP</b>");
    expect(tvEn).toContain("<span>In total</span><b>up to 2,650 XP</b>");
    // La hoja de VHS sigue con los VHS solos.
    expect(sheet(render("/es/project-zomboid/habilidades/carpinteria"), "pzs-media")).not.toContain("Life and Living");
    // Pesca: el programa del día 1 a la madrugada termina antes de que arranque la partida (9:00).
    const fishing = sheet(render(href("es", "skills", "fishing")), "pzs-tv");
    expect(fishing).toMatch(/Día 1 · 0:00–6:00<small class="pzs-before"> \(termina antes de las 9:00, la hora de arranque por defecto; no suma al total\)<\/small>/);
    // Y el total no la cuenta: 550 en una partida normal, no 850.
    const fishTv = skill("fishing").media.filter((m) => m.kind === "tv");
    const seen = fishTv.filter((m) => !m.beforeStart).reduce((sum, m) => sum + m.xp, 0);
    expect(fishTv.some((m) => m.beforeStart)).toBe(true);
    expect(fishing).toContain(`<span>En total</span><b>hasta ${seen.toLocaleString("es-AR")} XP</b>`);
    // Una habilidad sin TV no tiene la hoja.
    expect(render(href("es", "skills", "axe"))).not.toContain("pzs-tv");
  });

  it("los rasgos y profesiones que la suben, enlazados, y los que multiplican su XP", () => {
    const who = sheet(render("/es/project-zomboid/habilidades/carpinteria"), "pzs-who");
    expect(who).toContain(`href="${href("es", "professions", "carpenter")}"`);
    expect(who).toMatch(/Carpintero<\/span><\/a><span class="pzi-meta">\+4</);
    expect(who).toContain(`href="${href("es", "traits", "handy")}"`);
    // Aprendiz rápido, lento e Ingenioso (Elaboración); Pacifista no toca Carpintería.
    expect(who).toContain(`href="${href("es", "traits", "fast-learner")}"`);
    expect(who).toContain(`href="${href("es", "traits", "crafty")}"`);
    expect(who).not.toContain(`href="${href("es", "traits", "reluctant-fighter")}"`);
    expect(who).toMatch(/<span class="pzi-meta">×1,3</);
  });

  it("la calculadora arranca de 0 a 10, sin bonificación y con los libros", () => {
    const calc = sheet(render("/es/project-zomboid/habilidades/carpinteria"), "pzs-calc");
    expect(calc).toContain("La barra pide 32.775 XP del nivel 0 al 10.");
    // 2753,75 / 0,25 = 11.015
    expect(calc).toContain("<b>11.015 XP</b> a ganar");
    // Sin libros: 32.775 / 0,25 = 131.100
    expect(calc).toContain("Sin libros: 131.100 XP.");
    expect(calc).toMatch(/<th scope="row">0 → 2<\/th><td>Carpintería I: (&quot;|")Guía para clavar(&quot;|") ×3<\/td><td>225<\/td><td>300<\/td>/);
  });
});
