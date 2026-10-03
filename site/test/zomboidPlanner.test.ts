/**
 * El Planificador de personaje de Project Zomboid (2026-09-30): la cuenta pura (`zomboid/planner/build.ts`) con los
 * datos reales de `games/zomboid/data/site/{traits,professions}.json` y `data/skills.json`, y el render del servidor de
 * la pestaña. Los valores esperados están hechos a mano con esos datos, con la cuenta en el comentario de cada uno.
 *
 * Las reglas que se prueban (de dónde salen, en `build.ts`):
 * - puntos = costo de la profesión − Σ costo de los rasgos elegidos (`CharacterCreationProfession:PointToSpend`);
 * - nivel = clamp(inicio + Σ bonificaciones de la profesión y de todos los rasgos, 0, 10), con inicio 5 en Fuerza y
 *   Estado físico (`IsoGameCharacter.applyTraits`);
 * - multiplicador = tabla[min(3, nivel)] × el `mult` de cada rasgo que nombra la habilidad (`IsoGameCharacter$XP.AddXP`).
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pzIndex from "../../games/zomboid/data/index.json";
import pzMeta from "../../games/zomboid/data/meta.json";
import siteSkills from "../../games/zomboid/data/site/skills.json";
import traitsJson from "../../games/zomboid/data/site/traits.json";
import { filesFor } from "../src/areaFiles";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { LangContext } from "../src/i18n";
import { jsonLdFor, metaFor } from "../src/prerender";
import { parseRoute, PZ_PUBLISHED, registerPzSlugs, routeUrl, type PzTab, type Route } from "../src/route";
import { sitemapLastmod, sitemapPaths, type SitemapData } from "../src/sitemap";
import { ZOMBOID_COPY } from "../src/zomboidCopy";
import {
  blocker,
  decode,
  DEFAULT_BUILD,
  DEFAULT_PROF,
  encode,
  pickProfession,
  points,
  recipes,
  toggleTrait,
  valid,
  type Build,
} from "../src/zomboid/planner/build";
import { levelOneExceptions, SKILLS, skills } from "../src/zomboid/planner/skills";
import { PLANNER_COPY } from "../src/zomboid/planner/copy";
import ZomboidPlanner from "../src/zomboid/planner/ZomboidPlanner";
import { findProfession, findTrait } from "../src/zomboid/traits/data";
import { ItemIcon } from "../src/zomboid/ui";

/** El nivel y el multiplicador de una habilidad en un personaje. */
const skill = (b: Build, id: string) => {
  const row = skills(b).find((s) => s.id === id);
  if (!row) throw new Error(`no está la habilidad ${id}`);
  return row;
};

describe("los datos que usa el planificador", () => {
  it("las 35 habilidades, en el orden del juego y con el mismo id que sus fichas", () => {
    // El planificador lee `data/skills.json` (6 KB) y no `site/skills.json` (73 KB, con libros y medios): el id de ficha
    // sale del nombre en inglés. Si un día no coinciden, esto lo dice antes de que un rasgo sume en la habilidad que no es.
    expect(SKILLS.map((s) => s.id)).toEqual((siteSkills as { id: string }[]).map((s) => s.id));
    // Y la tabla de multiplicadores de cada una es la que resolvió el extractor para su ficha.
    for (const s of siteSkills as { id: string; boost: Record<string, number> }[]) {
      expect(SKILLS.find((x) => x.id === s.id)!.table, s.id).toEqual(s.boost);
    }
  });

  it("los nombres del caso del plan: «Sigiloso» es Graceful y excluye a «Torpe» (Clumsy); el sigilo es «Discreto»", () => {
    expect(findTrait("graceful")).toMatchObject({ en: "Graceful", es: "Sigiloso", cost: 4 });
    expect(findTrait("clumsy")).toMatchObject({ en: "Clumsy", es: "Torpe", cost: -2 });
    expect(findTrait("inconspicuous")).toMatchObject({ en: "Inconspicuous", es: "Discreto", cost: 4 });
    expect(findTrait("graceful")!.exclusive.map((r) => r.id)).toContain("clumsy");
    expect(findProfession("burglar")).toMatchObject({ es: "Ladrón", cost: -6 });
  });

  it("la profesión de entrada es Desempleado, la primera de la lista del juego", () => {
    expect(DEFAULT_PROF).toBe("custom-occupation");
    expect(findProfession(DEFAULT_PROF)).toMatchObject({ es: "Desempleado", cost: 8, icon: null });
    expect(DEFAULT_BUILD).toEqual({ prof: DEFAULT_PROF, traits: [] });
  });
});

describe("encode y decode", () => {
  it("ida y vuelta: el mismo personaje, con los rasgos en un orden fijo (el link no depende del orden de los clics)", () => {
    const b: Build = { prof: "burglar", traits: ["inconspicuous", "clumsy"] };
    const code = encode(b);
    expect(code).toBe("burglar.clumsy.inconspicuous");
    expect(encode({ prof: "burglar", traits: ["clumsy", "inconspicuous"] })).toBe(code);
    expect(decode(code)).toEqual({ prof: "burglar", traits: ["clumsy", "inconspicuous"] });
    for (const x of [DEFAULT_BUILD, { prof: "veteran", traits: ["deaf", "fast-learner", "strong"] }]) {
      expect(decode(encode(x))).toEqual(x);
    }
  });

  it("es corto: la profesión y los rasgos por su slug, separados por un punto que la query no escapa", () => {
    const code = encode({ prof: "veteran", traits: ["strong", "deaf"] });
    expect(code).toBe("veteran.deaf.strong");
    expect(new URLSearchParams({ b: code }).toString()).toBe("b=veteran.deaf.strong");
  });

  it("descarta lo que no conoce, lo repetido y lo que no se elige (un rasgo de profesión), sin tirar el resto", () => {
    expect(decode("burglar.no-existe.clumsy.clumsy")).toEqual({ prof: "burglar", traits: ["clumsy"] });
    // `burglar` como rasgo es el que trae la profesión: no se elige.
    expect(decode("burglar.burglar.brave")).toEqual({ prof: "burglar", traits: ["brave"] });
    // Una profesión que no existe vuelve a Desempleado y conserva los rasgos.
    expect(decode("astronauta.brave")).toEqual({ prof: DEFAULT_PROF, traits: ["brave"] });
    // Un slug con mayúsculas o espacios alrededor (alguien lo copió a mano) igual se lee.
    expect(decode(" Burglar.Clumsy ")).toEqual({ prof: "burglar", traits: ["clumsy"] });
  });

  it("sin nada que reconocer devuelve null", () => {
    expect(decode("")).toBeNull();
    expect(decode("nada.de.esto")).toBeNull();
    expect(decode("...")).toBeNull();
  });
});

describe("Ladrón con Discreto y Torpe (el caso del plan)", () => {
  // «Sigiloso» en el español del juego es Graceful, que no se combina con Torpe: el rasgo de sigilo que se quiso decir es
  // Discreto (Inconspicuous). Los dos cuestan 4, así que la cuenta de puntos es la misma.
  const b: Build = { prof: "burglar", traits: ["inconspicuous", "clumsy"] };

  it("los puntos: −6 de la profesión, −4 de Discreto y +2 de Torpe", () => {
    // PointToSpend = pointToSpend + cost. addTrait resta el costo de cada rasgo:
    //   pointToSpend = 0 − 4 (Discreto) − (−2) (Torpe) = −2; cost (Ladrón) = −6 → −2 + (−6) = −8.
    expect(points(b)).toBe(-8);
    // Menos de cero: el juego no deja empezar.
    expect(valid(b)).toBe(false);
  });

  it("los niveles: Destreza, Sigilo y Pies ligeros 2 (de la profesión); Fuerza y Estado físico 5; el resto 0", () => {
    // Ladrón: XPBoosts = Nimble=2; Sneak=2; Lightfoot=2. Su rasgo gratis (Ladrón), Discreto y Torpe no suben nada.
    for (const id of ["nimble", "sneaking", "lightfooted"]) expect(skill(b, id).level, id).toBe(2);
    expect(skill(b, "fitness").level).toBe(5);
    expect(skill(b, "strength").level).toBe(5);
    for (const id of ["carpentry", "aiming", "running", "first-aid"]) expect(skill(b, id).level, id).toBe(0);
  });

  it("los multiplicadores: ×1,33 en las tres que suben 2, ×1 en Fuerza, Estado físico y Carrera, ×0,25 el resto", () => {
    // Bonificación 2 → ×1,33. Fuerza y Estado físico nunca suben ni bajan (×1). Carrera sin bonificación no se reduce
    // (×1). Cualquier otra sin bonificación, ×0,25. Ningún rasgo de este personaje multiplica.
    for (const id of ["nimble", "sneaking", "lightfooted"]) expect(skill(b, id).mult, id).toBeCloseTo(1.33, 10);
    for (const id of ["fitness", "strength", "running"]) expect(skill(b, id).mult, id).toBe(1);
    for (const id of ["carpentry", "aiming", "cooking"]) expect(skill(b, id).mult, id).toBe(0.25);
  });

  it("las habilidades que el juego lista al crear el personaje: las que suben, más Fuerza y Estado físico", () => {
    expect(skills(b).filter((s) => s.listed).map((s) => s.id)).toEqual(["fitness", "strength", "lightfooted", "nimble", "sneaking"]);
  });

  it("las recetas: las 13 de Ladrón (ni su rasgo gratis ni Discreto ni Torpe enseñan)", () => {
    const burglar = findProfession("burglar")!;
    expect(recipes(b).map((r) => r.id).sort()).toEqual(burglar.recipes.map((r) => r.id).sort());
    expect(recipes(b)).toHaveLength(13);
  });
});

describe("la cuenta con los rasgos que multiplican y el tope de 10", () => {
  it("Monitor de fitness + Atlético + Aprendiz rápido + Pacifista + No oyente + Enclenque", () => {
    const b: Build = { prof: "fitness-instructor", traits: ["athletic", "fast-learner", "reluctant-fighter", "deaf", "weak"] };
    // Puntos: −6 (profesión) − 10 (Atlético) − 6 (Aprendiz rápido) + 5 (Pacifista) + 12 (No oyente) + 6 (Enclenque) = 1.
    expect(points(b)).toBe(1);
    expect(valid(b)).toBe(true);
    // Estado físico: 5 + 3 (profesión) + 4 (Atlético) = 12 → tope 10; ×1 siempre (Aprendiz rápido no la incluye).
    expect(skill(b, "fitness")).toMatchObject({ level: 10, mult: 1 });
    // Fuerza: 5 + 1 (profesión) − 2 (Enclenque) = 4; ×1.
    expect(skill(b, "strength")).toMatchObject({ level: 4, mult: 1 });
    // Carrera: 2 (profesión) → ×1,33 × 1,3 (Aprendiz rápido) = 1,729.
    expect(skill(b, "running").level).toBe(2);
    expect(skill(b, "running").mult).toBeCloseTo(1.729, 10);
    // Hacha y Puntería sin bonificación: ×0,25 × 1,3 × 0,75 (Pacifista) = 0,24375.
    expect(skill(b, "axe").mult).toBeCloseTo(0.24375, 10);
    expect(skill(b, "aiming").mult).toBeCloseTo(0.24375, 10);
    // Recarga y Mantenimiento no las toca Pacifista: ×0,25 × 1,3 = 0,325.
    expect(skill(b, "reloading").mult).toBeCloseTo(0.325, 10);
    expect(skill(b, "maintenance").mult).toBeCloseTo(0.325, 10);
  });

  it("Carpintero + Corredor + Ingenioso + Analfabeto: Carrera 1 da ×1,25 e Ingenioso sólo multiplica Elaboración", () => {
    const b: Build = { prof: "carpenter", traits: ["runner", "crafty", "illiterate"] };
    // Puntos: −2 − 4 (Corredor) − 3 (Ingenioso) + 10 (Analfabeto) = 1.
    expect(points(b)).toBe(1);
    // Carrera 1 (Corredor): la única que con 1 da ×1,25. No es de Elaboración.
    expect(skill(b, "running")).toMatchObject({ level: 1, mult: 1.25 });
    // Carpintería 4 (profesión) → bonificación min(3, 4) = 3 → ×1,66 × 1,3 = 2,158.
    expect(skill(b, "carpentry").level).toBe(4);
    expect(skill(b, "carpentry").mult).toBeCloseTo(2.158, 10);
    // Tallado 1 → ×1 × 1,3; Mantenimiento 1 → ×1 (es de Combate, no de Elaboración).
    expect(skill(b, "carving").mult).toBeCloseTo(1.3, 10);
    expect(skill(b, "maintenance")).toMatchObject({ level: 1, mult: 1 });
    // Cocina sin bonificación: ×0,25 × 1,3 = 0,325.
    expect(skill(b, "cooking").mult).toBeCloseTo(0.325, 10);
  });

  it("un rasgo que trae otro suma también las bonificaciones del que trae (Metabolismo lento → Sobrepeso)", () => {
    // Metabolismo lento trae Sobrepeso (Fitness −1): Estado físico 5 − 1 = 4. Y no cuesta: los puntos son 8 + 2.
    const b: Build = { prof: DEFAULT_PROF, traits: ["slow-metabolism"] };
    expect(skill(b, "fitness").level).toBe(4);
    expect(points(b)).toBe(10);
  });

  it("nunca baja de 0: Débil deja Fuerza en 5 − 5 = 0", () => {
    expect(skill({ prof: DEFAULT_PROF, traits: ["puny"] }, "strength").level).toBe(0);
  });
});

describe("rasgos que no se combinan", () => {
  it("dos rasgos excluyentes elegidos → valid false aunque sobren puntos", () => {
    const b: Build = { prof: DEFAULT_PROF, traits: ["graceful", "clumsy"] };
    // 8 − 4 + 2 = 6 puntos: sobran, y aun así no vale.
    expect(points(b)).toBe(6);
    expect(valid(b)).toBe(false);
  });

  it("también contra el rasgo gratis de la profesión: Veterano trae Insensible, que excluye a Valiente", () => {
    const b: Build = { prof: "veteran", traits: ["brave"] };
    expect(valid(b)).toBe(false);
    expect(blocker({ prof: "veteran", traits: [] }, "brave")).toMatchObject({ kind: "excludes", by: { id: "desensitized" }, from: { kind: "profession", id: "veteran" } });
  });

  it("y contra lo que trae un rasgo, de los dos lados: Metabolismo lento trae Sobrepeso, que excluye a Atlético", () => {
    expect(valid({ prof: DEFAULT_PROF, traits: ["slow-metabolism", "athletic"] })).toBe(false);
    // Con Metabolismo lento elegido, Atlético se apaga por Sobrepeso (que trae Metabolismo lento).
    expect(blocker({ prof: DEFAULT_PROF, traits: ["slow-metabolism"] }, "athletic")).toMatchObject({
      kind: "excludes",
      by: { id: "high-weight" },
      from: { kind: "trait", id: "slow-metabolism" },
    });
    // Con Atlético elegido, Metabolismo lento se apaga porque trae Sobrepeso (`isMutuallyExclusive` mira lo que trae).
    expect(blocker({ prof: DEFAULT_PROF, traits: ["athletic"] }, "slow-metabolism")).toMatchObject({
      kind: "brings",
      via: { id: "high-weight" },
      by: { id: "athletic" },
    });
  });

  it("un rasgo libre no tiene motivo para apagarse, y uno elegido tampoco", () => {
    expect(blocker(DEFAULT_BUILD, "brave")).toBeNull();
    expect(blocker({ prof: DEFAULT_PROF, traits: ["brave"] }, "brave")).toBeNull();
  });
});

describe("cambiar de profesión y sumar rasgos", () => {
  it("elegir una profesión saca los rasgos que no se combinan con los que trae, como el juego", () => {
    const { build, dropped } = pickProfession({ prof: DEFAULT_PROF, traits: ["brave", "deaf"] }, "veteran");
    expect(build).toEqual({ prof: "veteran", traits: ["deaf"] });
    expect(dropped).toEqual(["brave"]);
  });

  it("toggleTrait suma y saca, y no suma un rasgo que no se elige", () => {
    const one = toggleTrait(DEFAULT_BUILD, "brave");
    expect(one.traits).toEqual(["brave"]);
    expect(toggleTrait(one, "brave").traits).toEqual([]);
    expect(toggleTrait(DEFAULT_BUILD, "burglar")).toEqual(DEFAULT_BUILD);
    expect(toggleTrait(DEFAULT_BUILD, "no-existe")).toEqual(DEFAULT_BUILD);
  });
});

describe("todos los rasgos elegibles tienen puntos", () => {
  it("los 81 que se eligen (49 positivos y 32 negativos) cuestan o dan algo; los 16 de profesión no se eligen", () => {
    const all = traitsJson as { id: string; cost: number; professionOnly: boolean }[];
    const pickable = all.filter((t) => toggleTrait(DEFAULT_BUILD, t.id).traits.length === 1);
    expect(pickable).toHaveLength(81);
    expect(pickable.every((t) => t.cost !== 0 && !t.professionOnly)).toBe(true);
  });
});

const route = (lang: "en" | "es"): Route => ({ ...parseRoute(`/${lang}/project-zomboid`), pzSection: "planner" });
const render = (lang: "en" | "es") =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang, setLang: () => undefined } },
      createElement(ZomboidPlanner, { route: route(lang), navigate: () => undefined }),
    ),
  );

describe("la pestaña en el servidor", () => {
  it("en español: su título, su texto, las 25 profesiones, los 81 rasgos y el personaje de entrada", () => {
    const html = render("es");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Planificador de personaje de Project Zomboid<\/h1>/);
    expect(html).toContain("25 profesiones");
    expect(html).toContain("Copiá el link");
    // Una tarjeta por profesión, con Desempleado elegida (la de entrada) y +8 puntos para gastar.
    expect(html.match(/class="pzb-prof(?: is-on)?"/g)).toHaveLength(25);
    expect(html).toMatch(/class="pzb-prof is-on"[^>]*aria-pressed="true"[\s\S]*?Desempleado/);
    expect(html.match(/class="pzb-trait[^"]*"/g)).toHaveLength(81);
    expect(html).toMatch(/class="pzb-points"[\s\S]*?<b>\+8<\/b>/);
    // Fuerza y Estado físico en 5 en la hoja del personaje.
    expect(html).toContain("Estado físico");
    // Nunca cuenta de dónde salen los datos.
    expect(html).not.toMatch(/archivos del juego|game files/i);
  });

  it("«Todas las habilidades» nombra la excepción de nivel 1 (Carrera ×1,25) armada desde los datos, en los dos idiomas", () => {
    // Carrera es la única cuya tabla con bonificación 1 no es la común (×1); el texto no la escribe a mano.
    expect(levelOneExceptions().map((s) => s.en)).toEqual(["Running"]);
    const es = render("es");
    const en = render("en");
    expect(es).toMatch(/Excepción en nivel 1: Carrera ×1,25\./);
    expect(en).toMatch(/Exception at level 1: Running ×1\.25\./);
    // Y sin la coma de más antes del «o».
    expect(es).toContain("nivel 1, 2 o 3");
  });

  // El texto sólo sabe de excepciones en el nivel 1. Si un parche le pone a una habilidad otro multiplicador en el 2 o el
  // 3 (fuera de las de tabla plana, Fuerza y Estado físico), esto falla y avisa que hay que contarlo.
  it("ninguna habilidad se aparta de la tabla común en los niveles 2 y 3, salvo las de tabla plana", () => {
    const common = pzMeta.boostMultipliers as Record<string, number>;
    for (const s of SKILLS) {
      const flat = new Set(Object.values(s.table)).size === 1;
      if (flat) continue;
      expect(s.table["2"], s.en).toBe(common["2"]);
      expect(s.table["3"], s.en).toBe(common["3"]);
    }
  });

  it("lo que carga la pestaña Rasgos (build.ts, link.tsx, TraitFicha.tsx) no importa las habilidades: skills.json queda en el planificador", () => {
    // Sigue el grafo de imports estáticos relativos desde esos archivos (de varias líneas y reexportados incluidos) y
    // ninguno puede llegar a `planner/skills.ts` ni a un skills.json. No cuentan los `import type` (se borran al
    // compilar) ni los `import()` (son otro chunk: el recuadro "Qué cambió" baja aparte y ése sí trae skills.json).
    const root = new URL("../src/", import.meta.url);
    const seen = new Set<string>();
    const reached: string[] = [];
    const visit = (url: URL) => {
      if (seen.has(url.href)) return;
      seen.add(url.href);
      const src = readFileSync(url, "utf8").replace(/(?:import|export)\s+type\s[^;]*?from\s*["'][^"']+["']/g, "");
      for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s+)["']([^"']+)["']/g)) {
        const spec = m[1];
        if (/skills(\.json)?$/.test(spec)) reached.push(`${url.pathname.split("/src/")[1]} → ${spec}`);
        if (!spec.startsWith(".")) continue;
        const base = new URL(spec, url);
        const found = ["", ".ts", ".tsx", "/index.ts"].map((ext) => new URL(base.href + ext)).find((u) => {
          try {
            return readFileSync(u) && /\.(ts|tsx)$/.test(u.pathname);
          } catch {
            return false;
          }
        });
        if (found) visit(found);
      }
    };
    for (const f of ["zomboid/planner/build.ts", "zomboid/planner/link.tsx", "zomboid/traits/TraitFicha.tsx", "zomboid/traits/ProfessionFicha.tsx"])
      visit(new URL(f, root));
    expect(seen.size).toBeGreaterThan(4);
    expect(reached).toEqual([]);
  });

  it("el aviso de rasgos sacados concuerda con la cantidad", () => {
    expect(PLANNER_COPY.es.dropped("Valiente", 1)).toContain("no se combina con");
    expect(PLANNER_COPY.es.dropped("Valiente y Sordo", 2)).toContain("no se combinan con");
    expect(PLANNER_COPY.en.dropped("Brave", 1)).toContain("it can't be combined");
    expect(PLANNER_COPY.en.dropped("Brave and Deaf", 2)).toContain("they can't be combined");
  });

  it("Desempleado, la única profesión sin ícono en el juego, lleva la hoja en blanco de la libreta (acá y en Rasgos)", () => {
    expect(render("es")).toMatch(/class="pzb-prof is-on"[^>]*><span class="pzi-noicon is-blank"/);
    // Es el mismo `ItemIcon` de la lista de Rasgos: una profesión sin ícono, la hoja; un objeto sin ícono, el hueco de siempre.
    expect(renderToStaticMarkup(createElement(ItemIcon, { icon: null, dir: "professions", size: 48 }))).toContain('class="pzi-noicon is-blank"');
    expect(renderToStaticMarkup(createElement(ItemIcon, { icon: null, dir: "items" }))).toContain('class="pzi-noicon"');
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("en");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Character Planner<\/h1>/);
    expect(html).toContain("Custom Occupation");
    expect(html).not.toContain("Desempleado");
    expect(html).not.toMatch(/archivos del juego|game files/i);
  });
});

/**
 * Personaje publicada (2026-09-30): la solapa, el sitemap (una página por idioma, sin fichas), el chunk que pide el HTML,
 * el prerender con la misma entrada que usa el build, el JSON-LD de herramienta, y los enlaces que llegan desde la
 * portada y desde las fichas de profesión y de rasgo.
 */
describe("Personaje publicada", () => {
  const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, index: INDEX },
    dates: { zomboid: pzMeta.extractedAt },
  } as unknown as SitemapData;
  // Lo mismo que hace el build en `readSitemapData`: los slugs en español, antes de leer ninguna dirección.
  beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

  it("está en PZ_PUBLISHED y la dirección abre la pestaña en los dos idiomas", () => {
    expect(PZ_PUBLISHED).toContain("planner");
    expect(parseRoute("/es/project-zomboid/personaje")).toMatchObject({ view: "zomboid", pzSection: "planner", detail: undefined });
    expect(parseRoute("/en/project-zomboid/planner")).toMatchObject({ view: "zomboid", pzSection: "planner" });
  });

  it("el sitemap tiene la página en los dos idiomas, y nada debajo (no tiene fichas)", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/project-zomboid/personaje");
    expect(paths).toContain("/en/project-zomboid/planner");
    expect(paths.filter((p) => /^\/(en|es)\/project-zomboid\/(planner|personaje)\/./.test(p))).toEqual([]);
    expect(sitemapLastmod("/es/project-zomboid/personaje", data)).toBe(pzMeta.extractedAt.slice(0, 10));
  });

  it("el HTML de la pestaña pide su chunk además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/personaje"))).toEqual(["src/Zomboid.tsx", "src/zomboid/planner/ZomboidPlanner.tsx"]);
  });

  it("el prerender trae el planificador entero, con la solapa de Personaje marcada", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/personaje"));
    expect(html).not.toContain("pz-loading");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Planificador de personaje de Project Zomboid<\/h1>/);
    expect(html.match(/class="pzb-trait[^"]*"/g)).toHaveLength(81);
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/personaje"[^>]*aria-current="page"[^>]*>Personaje</);
    // La profesión del personaje enlaza a su ficha.
    expect(html).toContain('href="/es/project-zomboid/profesiones/desempleado"');
    const en = await renderApp(parseRoute("/en/project-zomboid/planner"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Character Planner<\/h1>/);
  });

  it("el <head>: el título que se busca y el planificador como aplicación web gratuita", () => {
    const route = parseRoute("/es/project-zomboid/personaje");
    const page = metaFor(route, "es", null);
    expect(page.title).toBe(ZOMBOID_COPY.es.seo.planner.title);
    const ld = jsonLdFor(route, "es", { ...page, canonical: routeUrl(route), image: "" }, data, null) as { "@type": string; name?: string }[];
    expect(ld.find((x) => x["@type"] === "WebApplication")).toMatchObject({ name: "Planificador de personaje de Project Zomboid (Build 42)" });
    expect(ld.some((x) => x["@type"] === "BreadcrumbList")).toBe(true);
  });

  it("la portada enlaza la herramienta a la pestaña: ya no dice «Pronto»", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    const tools = html.slice(html.indexOf('class="pz-tools"'));
    expect(tools).toContain('href="/es/project-zomboid/personaje" class="pz-tool-link">Planificador de personaje</a>');
    expect(tools).not.toMatch(/Planificador de personaje<em class="pz-soon">/);
    // Dice lo que hace hoy: el 3D llega después.
    expect(tools).not.toContain("3D");
  });

  it("la ficha de una profesión lleva al planificador con ella elegida", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid/profesiones/ladron"));
    expect(html).toMatch(/<a href="\/es\/project-zomboid\/personaje\?b=burglar" class="pzt-planbtn">Armar un personaje con esta profesión<\/a>/);
    // Desempleado es el de entrada: el link va limpio.
    const unemployed = await renderApp(parseRoute("/en/project-zomboid/professions/custom-occupation"));
    expect(unemployed).toContain('<a href="/en/project-zomboid/planner" class="pzt-planbtn">Build a character with this profession</a>');
    // Y ese link, leído por el planificador, es Ladrón sin rasgos.
    expect(decode("burglar")).toEqual({ prof: "burglar", traits: [] });
  });

  it("la ficha de un rasgo que se elige lleva al planificador con él; la de uno de profesión, no", async () => {
    const brave = await renderApp(parseRoute("/es/project-zomboid/rasgos/valiente"));
    expect(brave).toContain(`href="/es/project-zomboid/personaje?b=${DEFAULT_PROF}.brave"`);
    expect(brave).toContain("Probalo en el planificador de personaje");
    const burglar = await renderApp(parseRoute("/es/project-zomboid/rasgos/ladron"));
    expect(burglar).not.toContain("pzt-planbtn");
  });
});
