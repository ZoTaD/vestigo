// site/test/d2rDropsFarmBlock.test.ts
// "Dónde farmearlo" en las fichas de la wiki (Task 12): los mejores jefes y áreas de un único, una runa
// o un conjunto, ya calculados, con el enlace a la calculadora.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import farmU from "../../games/d2r/data/drops/computed/farm-u.json";
import farmS from "../../games/d2r/data/drops/computed/farm-s.json";
import wikiUniques from "../../games/d2r/data/wiki/uniques.json";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import D2rUniques from "../src/d2r/D2rUniques";
import D2rRunes from "../src/d2r/D2rRunes";
import D2rSets from "../src/d2r/D2rSets";
import { SETS, maxReq } from "../src/d2r/sets";
import { runeShort } from "../src/d2r/runes";
import type { Rune } from "../src/d2r/wiki";
import { FarmPieces } from "../src/d2r/drops/FarmBlock";
import type { FarmEntry, FarmFile } from "../src/d2r/drops/farm";
import { dropData } from "../src/d2r/drops/data";
import { bestPlaces } from "../src/d2r/drops/places";
import { readState, toOpts, toSettings } from "../src/d2r/drops/state";

const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));

/**
 * Lo que esta temporada sólo cae en Clasificación (`l: 1` en los datos): el primer único y la primera pieza de
 * conjunto, sacados de los datos y no escritos a mano, así los tests siguen valiendo cuando cambie la temporada
 * (y se saltean si ya no hay ninguno).
 */
const FARM_U = farmU as unknown as FarmFile;
const FARM_S = farmS as unknown as FarmFile;
const LADDER_UNIQUE = (wikiUniques as unknown as { id: string }[]).find((u) => FARM_U[u.id]?.l)?.id;
const LADDER_PIECE = SETS.flatMap((s) => s.items.map((i) => ({ set: s.id, id: i.id }))).find((x) => FARM_S[x.id]?.l);

describe("Dónde farmearlo en las fichas de la wiki", () => {
  const page = (C: typeof D2rUniques, path: string) => inEs(createElement(C, { route: parseRoute(path), navigate: () => undefined }));

  it("la Cresta del arlequín: los mejores jefes y el enlace a la calculadora con el ítem", () => {
    const html = page(D2rUniques, "/es/d2r/uniques/harlequin-crest");
    expect(html).toContain("Dónde farmearlo");
    expect(html).toMatch(/Mefisto|Diablo|Baal/);
    expect(html).toContain('href="/es/d2r/drops?i=u.harlequin-crest"');
  });

  it("la runa Ist: la Condesa primero", () => {
    expect(page(D2rRunes, "/es/d2r/runes/ist")).toContain("La Condesa");
  });

  it("un conjunto: dónde farmear cada pieza", () => {
    const html = page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings");
    expect(html).toContain("Dónde farmear cada pieza");
    expect(html).toContain("i=s.tal-rashas-guardianship");
  });

  it.skipIf(!LADDER_UNIQUE)("lo que esta temporada sólo cae en Clasificación lo avisa (los datos traen `l: 1`)", () => {
    expect(page(D2rUniques, `/es/d2r/uniques/${LADDER_UNIQUE}`)).toContain("en Clasificación");
    expect(page(D2rUniques, "/es/d2r/uniques/harlequin-crest")).not.toContain("en Clasificación");
  });
});

// Lo que sigue lo sumó la Task 12 encima de los cuatro tests del plan: los bordes del bloque
// (sin áreas, sin nada, área de campeones), la lista del conjunto y el idioma.
describe("Dónde farmearlo: los bordes del bloque", () => {
  const page = (C: typeof D2rUniques, path: string, lang: "es" | "en" = "es") =>
    renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(C, { route: parseRoute(path), navigate: () => undefined })));
  /** Las filas de la lista de jefes y áreas: quién, dónde y la chance, tal cual se leen. */
  const rows = (html: string) => [...html.matchAll(/<li><b>([^<]*)<\/b><small>([^<]*)<\/small><span>([^<]*)<\/span><\/li>/g)].map((m) => ({ name: m[1], where: m[2], odds: m[3] }));

  it("tres jefes y, al final, la mejor área con su dificultad y su tipo de monstruo", () => {
    const filas = rows(page(D2rUniques, "/es/d2r/uniques/harlequin-crest"));
    expect(filas).toHaveLength(4);
    for (const f of filas) expect(f.odds).toMatch(/^1 en /);
    for (const f of filas.slice(0, 3)) expect(f.where).toMatch(/^(Normal|Pesadilla|Infierno)$/);
    expect(filas[3].where).toMatch(/^Mejor área · (Normal|Pesadilla|Infierno) · Común$/);
    // Los jefes van del que más lo suelta al que menos: el N de "1 en N" sube (sin el punto de los miles).
    const ns = filas.slice(0, 3).map((f) => Number(f.odds.replace("1 en ", "").replaceAll(".", "")));
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
  });

  it("la runa Ist: la Condesa es la primera fila", () => {
    const filas = rows(page(D2rRunes, "/es/d2r/runes/ist"));
    expect(filas[0].name).toBe("La Condesa");
    expect(filas[0].odds).toMatch(/^1 en /);
  });

  it("la Corona de las Eras no cae de los comunes: su mejor área lo dice con «Campeón»", () => {
    const filas = rows(page(D2rUniques, "/es/d2r/uniques/crown-of-ages"));
    expect(filas[filas.length - 1].where).toMatch(/^Mejor área · .+ · Campeón$/);
  });

  it("lo que sólo suelta un jefe no lleva área, y lo que cae siempre dice «siempre»", () => {
    const html = page(D2rUniques, "/es/d2r/uniques/annihilus");
    expect(rows(html)).toEqual([{ name: "Clon de Diablo", where: "Infierno", odds: "siempre" }]);
    expect(html).not.toContain("Mejor área");
  });

  it("un único que no cae de ningún lado no muestra el bloque, ni el enlace, pero sí su ficha", () => {
    const html = page(D2rUniques, "/es/d2r/uniques/horadric-staff");
    expect(html).toContain('class="d2-box"');
    expect(html).not.toContain("Dónde farmearlo");
    expect(html).not.toContain("Abrir en la calculadora");
  });

  it("la lista del conjunto trae una fila por pieza, en el orden del conjunto, cada una con su enlace", () => {
    const set = SETS.find((s) => s.id === "tal-rashas-wrappings")!;
    const html = page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings");
    const enlaces = [...html.matchAll(/href="\/es\/d2r\/drops\?i=s\.([^"&]+)"/g)].map((m) => m[1]);
    expect(enlaces).toEqual(set.items.map((it) => it.id));
  });

  it.skipIf(!LADDER_PIECE)("un conjunto que esta temporada sólo cae en Clasificación lo avisa en su lista, y otro no", () => {
    expect(page(D2rSets, `/es/d2r/sets/${LADDER_PIECE!.set}`)).toContain("en Clasificación");
    expect(page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings")).not.toContain("en Clasificación");
  });

  it("la runa lleva el enlace a la calculadora con su código: Ist es b.r24", () => {
    expect(page(D2rRunes, "/es/d2r/runes/ist")).toContain('href="/es/d2r/drops?i=b.r24"');
  });

  it("en inglés el bloque sale en inglés, con los nombres, las chances y el enlace de /en", () => {
    const html = page(D2rUniques, "/en/d2r/uniques/harlequin-crest", "en");
    expect(html).toContain("Where to farm it");
    expect(html).toMatch(/Mephisto|Diablo|Baal/);
    expect(html).not.toContain("Mefisto");
    expect(html).toMatch(/1 in [\d,]+/);
    expect(html).toContain('href="/en/d2r/drops?i=u.harlequin-crest"');
  });

  it("en inglés el tipo de monstruo no se llama «Normal»: chocaba con la dificultad Normal", () => {
    const filas = rows(page(D2rUniques, "/en/d2r/uniques/harlequin-crest", "en"));
    expect(filas[3].where).toMatch(/^Best area · (Normal|Nightmare|Hell) · Regular$/);
  });
});

// Review de la Task 12, importante 1: lo que esta temporada sólo cae en Clasificación se calculó con Clasificación
// prendida, y la calculadora sólo la prende con `l=1`. Sin él, el enlace abría en «Con estas opciones no lo suelta nadie.».
describe("Dónde farmearlo: los enlaces llevan Clasificación a la calculadora", () => {
  const page = (C: typeof D2rUniques, path: string) => inEs(createElement(C, { route: parseRoute(path), navigate: () => undefined }));
  /** El `?...` del primer enlace a la calculadora de la página, como lo lee el navegador (sin el `&amp;` del HTML). */
  const query = (html: string) => {
    const href = /href="(\/es\/d2r\/drops\?[^"]+)"/.exec(html)![1].replaceAll("&amp;", "&");
    return href.slice(href.indexOf("?"));
  };
  const bosses = (target: NonNullable<ReturnType<typeof readState>["item"]>, ladder: boolean) => {
    const st = { ...readState(""), item: target, ladder };
    return bestPlaces(dropData(), target, toSettings(st), toOpts(st), [0, 1, 2], 3).bosses.map((r) => r.key);
  };

  it.skipIf(!LADDER_UNIQUE)("el enlace de un único de Clasificación lleva l=1, y el de la Cresta del arlequín no", () => {
    expect(page(D2rUniques, `/es/d2r/uniques/${LADDER_UNIQUE}`)).toContain(`href="/es/d2r/drops?i=u.${LADDER_UNIQUE}&amp;l=1"`);
    expect(page(D2rUniques, "/es/d2r/uniques/harlequin-crest")).not.toContain("l=1");
  });

  it.skipIf(!LADDER_UNIQUE)("la calculadora lee ese enlace como el ítem en Clasificación, y da los mismos jefes que el bloque", () => {
    const st = readState(query(page(D2rUniques, `/es/d2r/uniques/${LADDER_UNIQUE}`)));
    expect(st.item).toEqual({ k: "u", id: LADDER_UNIQUE });
    expect(st.ladder).toBe(true);
    // Los jefes de la calculadora con ese estado son los del bloque, en el mismo orden.
    expect(bosses(st.item!, st.ladder)).toEqual(FARM_U[LADDER_UNIQUE!].b.map(([key]) => key));
    // Y sin l=1 (el enlace de antes) no cae de nadie: por eso el bloque tiene que llevarlo.
    expect(bosses(st.item!, false)).toEqual([]);
  });

  it("el enlace de un único de siempre no prende Clasificación", () => {
    const st = readState(query(page(D2rUniques, "/es/d2r/uniques/harlequin-crest")));
    expect(st.item).toEqual({ k: "u", id: "harlequin-crest" });
    expect(st.ladder).toBe(false);
  });

  it.skipIf(!LADDER_PIECE)("en el conjunto, el enlace de cada pieza de Clasificación lleva l=1 y da los mismos jefes que la fila", () => {
    const html = page(D2rSets, `/es/d2r/sets/${LADDER_PIECE!.set}`);
    expect(html).toContain(`href="/es/d2r/drops?i=s.${LADDER_PIECE!.id}&amp;l=1"`);
    const st = readState(query(html.slice(html.indexOf(`i=s.${LADDER_PIECE!.id}`) - 40)));
    expect(st.item).toEqual({ k: "s", id: LADDER_PIECE!.id });
    expect(st.ladder).toBe(true);
    expect(bosses(st.item!, true)[0]).toBe(FARM_S[LADDER_PIECE!.id].b[0][0]);
    expect(page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings")).not.toContain("l=1");
  });
});

// Una lista de piezas mezclada (unas sólo en Clasificación y otras no) no existe esta temporada, pero el día que exista
// no puede llevar un aviso equivocado: se prueba con datos armados a mano.
describe("Dónde farmearlo: la lista de piezas de un conjunto mezclado", () => {
  const route = parseRoute("/es/d2r/sets/cualquiera");
  const pieces = [
    { id: "alfa", name: { en: "Alpha", es: "Alfa" } },
    { id: "beta", name: { en: "Beta", es: "Beta" } },
  ];
  const entry = (l?: 1): FarmEntry => ({ b: [["s.mephisto.2", 0.01]], a: [], ...(l ? { l } : {}) });
  const list = (file: FarmFile) => inEs(createElement(FarmPieces, { pieces, file, route }));
  const count = (html: string, s: string) => html.split(s).length - 1;

  it("todas de Clasificación: el aviso va en la lista y todos los enlaces llevan l=1", () => {
    const html = list({ alfa: entry(1), beta: entry(1) });
    expect(html).toContain("en Clasificación");
    expect(count(html, "&amp;l=1")).toBe(2);
    expect(html).not.toContain("Mefisto · Infierno · Clasificación");
  });

  it("mezcladas: el aviso de la lista no dice Clasificación, y la pieza de Clasificación lo dice sola y lleva l=1", () => {
    const html = list({ alfa: entry(1), beta: entry() });
    expect(html).not.toContain("en Clasificación");
    expect(count(html, "&amp;l=1")).toBe(1);
    expect(html).toContain('href="/es/d2r/drops?i=s.alfa&amp;l=1"');
    expect(html).toContain('href="/es/d2r/drops?i=s.beta"');
    expect(count(html, "Mefisto · Infierno · Clasificación")).toBe(1);
    expect(html).toContain("Mefisto · Infierno</small>");
  });

  it("ninguna de Clasificación: ni aviso ni l=1", () => {
    const html = list({ alfa: entry(), beta: entry() });
    expect(html).not.toContain("Clasificación");
    expect(html).not.toContain("l=1");
  });

  it("una pieza sin datos no cuenta para el aviso: las que se muestran son todas de Clasificación", () => {
    const html = list({ alfa: entry(1) });
    expect(html).toContain("en Clasificación");
    expect(count(html, "<li>")).toBe(1);
  });
});

// Review de la Task 12, menores 4 y 5: la nota dice la unidad de cada cifra, y en inglés el tipo de monstruo no choca con la dificultad.
describe("Dónde farmearlo: la nota dice la unidad", () => {
  const page = (C: typeof D2rUniques, path: string, lang: "es" | "en" = "es") =>
    renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(C, { route: parseRoute(path), navigate: () => undefined })));

  it("con jefes y área: por muerte en los jefes y por monstruo en el área", () => {
    expect(page(D2rUniques, "/es/d2r/uniques/harlequin-crest")).toMatch(/Por muerte, con 1 jugador y 300% de hallazgo mágico; en el área, por monstruo\./);
    expect(page(D2rUniques, "/en/d2r/uniques/harlequin-crest", "en")).toMatch(/Per kill, with 1 player and 300% magic find; in the area, per monster\./);
  });

  it("sin fila de área la nota no habla del área", () => {
    const html = page(D2rUniques, "/es/d2r/uniques/annihilus");
    expect(html).toContain("Por muerte, con 1 jugador y 300% de hallazgo mágico.");
    expect(html).not.toContain("por monstruo");
  });

  it("la lista de piezas de un conjunto es sólo de jefes: por muerte, sin área", () => {
    const html = page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings");
    expect(html).toContain("Por muerte, con 1 jugador y 300% de hallazgo mágico.");
    expect(html).not.toContain("por monstruo");
  });

  it.skipIf(!LADDER_UNIQUE)("lo de Clasificación también dice la unidad, y sigue avisando que sólo cae ahí", () => {
    const html = page(D2rUniques, `/es/d2r/uniques/${LADDER_UNIQUE}`);
    expect(html).toMatch(/Por muerte, con 1 jugador y 300% de hallazgo mágico, en Clasificación \(esta temporada sólo cae ahí\)/);
    expect(html).toContain("por monstruo");
  });
});

// Review de la Task 12, menor 6: el bloque es una región con nombre, y los nombres de las piezas (enlaces sin más pista que el color) se subrayan.
describe("Dónde farmearlo: accesibilidad", () => {
  const page = (C: typeof D2rUniques, path: string) => inEs(createElement(C, { route: parseRoute(path), navigate: () => undefined }));
  /** El título al que apunta el `aria-labelledby` de la región, o `undefined` si no hay o no existe. */
  const nombre = (html: string) => {
    const id = /<section[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
    if (!id) return undefined;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<h2[^>]*\\sid="${esc}"[^>]*>([^<]*)</h2>`).exec(html)?.[1];
  };

  it("la región se llama como su título, en los tres tipos de ficha", () => {
    expect(nombre(page(D2rUniques, "/es/d2r/uniques/harlequin-crest"))).toBe("Dónde farmearlo");
    expect(nombre(page(D2rRunes, "/es/d2r/runes/ist"))).toBe("Dónde farmearlo");
    expect(nombre(page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings"))).toBe("Dónde farmear cada pieza");
  });
});

// Review de la Task 12, importante 2: el Grial, el planificador y las palabras rúnicas importaban `SETS` y `runeShort` de las
// páginas de las fichas, y con ellas bajaban los datos de farmeo, el bloque y su hoja de estilos sin mostrar nada de eso.
describe("Las páginas sin bloque no cargan el bloque", () => {
  const SRC = fileURLToPath(new URL("../src", import.meta.url));
  const resolveFile = (base: string) =>
    [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find((f) => existsSync(f) && statSync(f).isFile());
  /** Lo que un archivo importa de verdad al correr (no `import type`), sólo rutas relativas: el resto (react, @d2r/…) no puede traer una ficha. */
  const imports = (file: string): string[] => {
    const src = readFileSync(file, "utf8");
    const re = [/^\s*import\s+(?!type[\s{])[^;"']*?(?:\bfrom\s+)?["'](\.{1,2}\/[^"']+)["']/gm, /^\s*export\s+(?!type[\s{])[^;"']*?\bfrom\s+["'](\.{1,2}\/[^"']+)["']/gm];
    return re.flatMap((r) => [...src.matchAll(r)].map((m) => m[1]));
  };
  /** Todos los archivos que se cargan al abrir uno (sus imports, y los de esos, hasta el final), con las hojas de estilo como hojas. */
  const closure = (entry: string): string[] => {
    const seen = new Set<string>();
    const stack = [join(SRC, entry)];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      if (!/\.tsx?$/.test(f)) continue;
      for (const rel of imports(f)) {
        const next = resolveFile(resolve(dirname(f), rel));
        if (next) stack.push(next);
      }
    }
    return [...seen].map((f) => relative(SRC, f).replaceAll("\\", "/"));
  };

  it("control: el recorrido encuentra el bloque y su hoja en las fichas que sí lo muestran", () => {
    for (const ficha of ["d2r/D2rUniques.tsx", "d2r/D2rRunes.tsx", "d2r/D2rSets.tsx"]) {
      const files = closure(ficha);
      expect(files, ficha).toContain("d2r/drops/FarmBlock.tsx");
      expect(files, ficha).toContain("styles/d2r-farm.css");
    }
  });

  it("control: el Grial, el planificador y las palabras rúnicas toman lo que necesitan de sus módulos chicos", () => {
    expect(closure("d2r/D2rGrail.tsx")).toEqual(expect.arrayContaining(["d2r/sets.ts", "d2r/runes.ts"]));
    expect(closure("d2r/D2rPlanner.tsx")).toContain("d2r/sets.ts");
    expect(closure("d2r/D2rRunewords.tsx")).toContain("d2r/runes.ts");
    // Y las fichas también: los toman de ahí y no los definen ellas.
    expect(closure("d2r/D2rSets.tsx")).toContain("d2r/sets.ts");
    expect(closure("d2r/D2rRunes.tsx")).toContain("d2r/runes.ts");
  });

  it.each(["d2r/D2rGrail.tsx", "d2r/D2rPlanner.tsx", "d2r/D2rRunewords.tsx"])("%s no trae las fichas, ni el bloque, ni sus hojas", (page) => {
    const files = closure(page);
    // El recorrido tiene que estar viendo algo: el Grial y las palabras rúnicas leen la wiki.
    expect(files).toContain("d2r/wiki.ts");
    for (const prohibido of ["d2r/D2rSets.tsx", "d2r/D2rRunes.tsx", "d2r/D2rUniques.tsx", "d2r/drops/FarmBlock.tsx", "styles/d2r-farm.css", "styles/d2r-drops.css"]) {
      expect(files, prohibido).not.toContain(prohibido);
    }
  });
});

// Review de la Task 12, menores 3 y 6: el bloque baja una hoja chica con sus reglas y no la de toda la calculadora.
describe("Dónde farmearlo: la hoja de estilos", () => {
  const SRC = fileURLToPath(new URL("../src", import.meta.url));
  const read = (p: string) => readFileSync(join(SRC, p), "utf8");
  const count = (text: string, s: string) => text.split(s).length - 1;

  it("el bloque baja d2r-farm.css y no d2r-drops.css", () => {
    const src = read("d2r/drops/FarmBlock.tsx");
    expect(src).toContain("styles/d2r-farm.css");
    expect(src).not.toContain("styles/d2r-drops.css");
  });

  it("las reglas del bloque y de la nota viven en d2r-farm.css y no se repiten en la hoja de la calculadora", () => {
    const farm = read("styles/d2r-farm.css");
    const drops = read("styles/d2r-drops.css");
    for (const sel of [".d2-dr-note {", ".d2-dr-block {", ".d2-dr-mini {", ".d2-dr-mini li {", ".d2-dr-mini a {"]) {
      expect(count(farm, sel), `${sel} en d2r-farm.css`).toBe(1);
      expect(count(drops, sel), `${sel} en d2r-drops.css`).toBe(0);
    }
  });

  it("la calculadora baja también la hoja del bloque: su nota bajo cada título es la misma regla", () => {
    expect(read("d2r/D2rDrops.tsx")).toContain("styles/d2r-farm.css");
  });

  it("los nombres de las piezas se subrayan al pasar el mouse y con el foco del teclado", () => {
    const farm = read("styles/d2r-farm.css");
    expect(farm).toMatch(/\.d2-dr-mini a:hover,\s*\.d2-dr-mini a:focus-visible\s*\{[^}]*text-decoration:\s*underline/);
  });
});

// Lo que las fichas compartían con el Grial, el planificador y las palabras rúnicas, ahora en módulos de su tamaño.
describe("Los conjuntos y el nombre corto de las runas viven en módulos chicos", () => {
  it("los conjuntos van del de menor nivel al de mayor, según su pieza más alta", () => {
    expect(SETS).toHaveLength(34);
    const niveles = SETS.map(maxReq);
    expect(niveles).toEqual([...niveles].sort((a, b) => a - b));
    expect(maxReq(SETS[SETS.length - 1])).toBe(Math.max(...SETS.flatMap((s) => s.items.map((i) => i.req))));
  });

  it("el nombre corto de una runa es el mismo en los dos idiomas", () => {
    const ber = { name: { en: "Ber Rune", es: "Runa Ber" } } as Rune;
    expect(runeShort(ber)).toBe("Ber");
  });
});
