// site/test/d2rDropsUi.test.ts
import { describe, expect, it } from "vitest";
import { D2R_COPY } from "../src/d2rCopy";
import { dropData } from "../src/d2r/drops/data";
import { odds, tcLabel } from "../src/d2r/drops/format";
import { ALIASES, findItem, searchItems } from "../src/d2r/drops/ItemPicker";
import { DEFAULT_STATE, readState, writeState } from "../src/d2r/drops/state";
import { tr } from "../src/d2r/wiki";

const es = D2R_COPY.es.drops;

describe("el estado en la dirección", () => {
  it("lo que viene por defecto no se escribe", () => {
    expect(writeState(DEFAULT_STATE)).toBe("");
  });

  it("ida y vuelta con todo lo que se puede compartir", () => {
    const st = { ...DEFAULT_STATE, m: "sim" as const, item: { k: "u" as const, id: "harlequin-crest" }, place: { k: "a" as const, id: 12, cat: "champ" as const }, pdiff: 1 as const, mf: 450, players: 8, party: 3, diff: 2 as const, tz: 91, tier: 4, ladder: true, quest: true, runs: 250, seed: 12345 };
    expect(readState(writeState(st))).toEqual(st);
  });

  it("valores rotos caen en los de siempre y el grupo no pasa a los jugadores", () => {
    const st = readState("?m=xx&i=nada&mf=-5&p=3&g=9&tz=abc");
    expect(st.m).toBe("farm");
    expect(st.item).toBeNull();
    expect(st.mf).toBe(0);
    expect(st.party).toBe(3);
    expect(st.tz).toBe(0);
  });
});

describe("cómo se leen las chances", () => {
  it("1 en N, con los separadores del idioma y los millones con palabra", () => {
    expect(odds(1 / 3912, "es-AR", es)).toBe("1 en 3.912");
    expect(odds(0.25, "es-AR", es)).toBe("1 en 4");
    expect(odds(1 / 2_100_000, "es-AR", es)).toBe("1 en 2,1 millones");
    expect(odds(0, "es-AR", es)).toBe("—");
  });

  it("los nombres de TC que se pueden decir en castellano", () => {
    expect(tcLabel("armo60", es)).toBe("armaduras hasta nivel 60");
    expect(tcLabel("bow12", es)).toBe("arcos hasta nivel 12");
    expect(tcLabel("mele39", es)).toBe("armas cuerpo a cuerpo hasta nivel 39");
    expect(tcLabel("Runes 12", es)).toBe("runas (grupo 12)");
    expect(tcLabel("Mephisto (H)", es)).toBe("Mephisto (H)");
  });
});

describe("el buscador", () => {
  it("'shako' da la Cresta del arlequín primero, y 'soj' la Piedra de Jordán", () => {
    expect(searchItems("shako")[0].target).toEqual({ k: "u", id: "harlequin-crest" });
    expect(searchItems("shako").some((x) => x.target.k === "b" && x.target.code === "uap")).toBe(true);
    expect(searchItems("soj")[0].target).toEqual({ k: "u", id: "the-stone-of-jordan" });
  });

  it("en español y en inglés, y las runas", () => {
    expect(searchItems("cresta del arl")[0].target).toEqual({ k: "u", id: "harlequin-crest" });
    expect(searchItems("ber")[0].target).toEqual({ k: "b", code: "r30" });
  });

  it("cada sigla apunta a un único que existe", () => {
    const D = dropData();
    for (const id of Object.values(ALIASES)) expect(D.uniqueById.get(id), id).toBeDefined();
    expect(findItem({ k: "b", code: "r30" })?.kind).toBe("r");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import DropsFarm, { FARM_EXAMPLES } from "../src/d2r/drops/DropsFarm";

const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));

describe("¿Dónde lo farmeo?", () => {
  it("sin ítem muestra los ejemplos, y cada ejemplo existe", () => {
    const html = inEs(createElement(DropsFarm, { st: DEFAULT_STATE, set: () => undefined }));
    expect(html).toContain("Probá con");
    for (const ex of FARM_EXAMPLES) expect(findItem(ex), JSON.stringify(ex)).toBeDefined();
  });

  it("con la Cresta del arlequín: jefes arriba, áreas y la curva del hallazgo mágico", () => {
    const st = { ...DEFAULT_STATE, item: { k: "u" as const, id: "harlequin-crest" }, diff: 2 as const };
    const html = inEs(createElement(DropsFarm, { st, set: () => undefined }));
    expect(html).toContain("Jefes y superúnicos");
    expect(html).toMatch(/Mefisto|Diablo|Baal/);
    expect(html).toContain("1 en ");
    expect(html).toContain("Áreas");
    expect(html).toContain("Cuánto te suma el hallazgo mágico");
  });
});

// Lo que sigue lo sumó la Task 8 encima de los dos tests del plan: el camino de un número (se
// pliega y dice "siempre"), la curva del hallazgo mágico y los bordes de la lista.
import { isValidElement, type ReactElement } from "react";
import { AreaLine, NoDrop, Why } from "../src/d2r/drops/DropsFarm";
import MfCurve from "../src/d2r/drops/MfCurve";
import { chancePerKill, explainPath } from "../src/d2r/drops/engine";
import { bestPlaces, dropsAnywhere, NO_TZ, placeKill, type AreaRow } from "../src/d2r/drops/places";
import { ladderOk } from "../src/d2r/drops/rules";
import { SEASON } from "../src/d2r/season";
import { toOpts, toSettings } from "../src/d2r/drops/state";
import type { Diff, Target } from "../src/d2r/drops/types";

const cresta: Target = { k: "u", id: "harlequin-crest" };
const inEn = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "en", setLang: () => undefined } }, el));

describe("¿De dónde sale este número?", () => {
  const D = dropData();
  const s = toSettings(DEFAULT_STATE);
  const why = (target: Target, src: string, diff: Diff = 2) => {
    const kill = placeKill(D, { k: "s", id: src }, diff, NO_TZ)!;
    const place = tr(D.sourceById.get(src)!.n, "es");
    return { html: inEs(createElement(Why, { target, kill, s, place })), path: explainPath(D, target, kill, s)! };
  };
  /** Cuántas líneas dibuja el camino (el botón "N pasos más" cuenta como una). */
  const lines = (html: string) => (html.match(/<li>/g) ?? []).length;

  it("un camino largo deja el primer paso, «N pasos más» y los dos últimos", () => {
    const { html, path } = why(cresta, "mephisto");
    const n = path.steps.length;
    expect(n).toBeGreaterThan(5);
    expect(html).toContain(`${n - 3} pasos más`);
    // El primer paso, el botón, los dos últimos, el ítem y la calidad.
    expect(lines(html)).toBe(1 + 1 + 2 + 1 + 1);
    // El primero es el lugar y su dificultad, no el nombre del TC.
    expect(html).toContain("<li>Mefisto · Infierno: 7 tiradas</li>");
    for (const i of [n - 2, n - 1]) expect(html, `paso ${i}`).toContain(tcLabel(path.steps[i].tc, es));
    for (let i = 1; i <= n - 3; i++) expect(html, `paso ${i}`).not.toContain(tcLabel(path.steps[i].tc, es));
  });

  it("un paso casi seguro dice su porcentaje por tirada y no «1 en 1»", () => {
    // Los TC «Equip» encadenados pasan 85 de cada 87 tiradas (97,7%): «1 en 1» era un redondeo que parecía certeza.
    const { html, path } = why(cresta, "mephisto");
    const anteultimo = path.steps[path.steps.length - 2];
    expect(anteultimo.share).toBeGreaterThan(0.95);
    expect(anteultimo.share).toBeLessThan(1);
    // Sin espacio antes del %, como el resto del español del sitio ("300%").
    expect(html).toContain(`${tcLabel(anteultimo.tc, es)} (97,7% por tirada)`);
    expect(html).not.toMatch(/1 en 1[ )]/);
  });

  it("un camino corto se muestra entero, y lo que se tira siempre dice «siempre» y no «1 en 1»", () => {
    const { html, path } = why({ k: "b", code: "r24" }, "the-countess");
    expect(path.steps.length).toBeLessThanOrEqual(5);
    expect(html).not.toContain("pasos más");
    expect(html).toContain("<li>La Condesa · Infierno: 2 ítems fijos</li>");
    for (const step of path.steps.slice(1)) expect(html).toContain(tcLabel(step.tc, es));
    expect(lines(html)).toBe(path.steps.length + 1);
    // La Condesa tira ítems fijos y esa tirada no se sortea: el paso siguiente sale seguro.
    expect(path.steps[0].picks).toBeLessThan(0);
    expect(html).toContain("ítems fijos");
    expect(path.steps[1].share).toBe(1);
    expect(html).toContain(`${tcLabel(path.steps[1].tc, es)} (siempre)`);
    expect(html).not.toMatch(/1 en 1[ )]/);
  });

  it("un ítem con nombre en el TC sale seguro y no repite calidad ni sorteo", () => {
    // Annihilus lo suelta siempre el Clon de Diablo: la línea del ítem dice «siempre».
    const { html, path } = why({ k: "u", id: "annihilus" }, "diablo-clone");
    expect(path.end.share).toBe(1);
    expect(html).toContain("Annihilus (siempre)");
    expect(html).not.toContain("calidad");
    expect(html).not.toContain("entre los posibles");
    expect(lines(html)).toBe(path.steps.length + 1);
  });

  it("dice la calidad única y cuál de los posibles de la base sale", () => {
    // La Piedra de Jordán comparte base (un anillo) con otros únicos: 1 entre varios.
    const { html, path } = why({ k: "u", id: "the-stone-of-jordan" }, "andariel");
    expect(path.end.pick).toBeLessThan(1);
    expect(html).toMatch(/calidad única: 1 en [\d.,]+ con tu hallazgo mágico/);
    expect(html).toMatch(/entre los posibles de esa base: 1 en [\d.,]+/);
  });

  it("en una pieza de conjunto la calidad es la del conjunto", () => {
    const { html } = why({ k: "s", id: "tal-rashas-guardianship" }, "baal");
    expect(html).toMatch(/calidad de conjunto: 1 en /);
    expect(html).not.toContain("calidad única");
  });
});

// La tanda final: el camino "en palabras", como pedía el diseño ("equipo del Acto 3"), y no con los nombres crudos de los TC.
describe("¿De dónde sale este número? en palabras", () => {
  const D = dropData();
  const s = toSettings(DEFAULT_STATE);
  const en = D2R_COPY.en.drops;
  const kill = placeKill(D, { k: "s", id: "mephisto" }, 2, NO_TZ)!;

  it("la Cresta del arlequín desde Mefisto (Infierno): el lugar y su dificultad primero, y los TC de acto en palabras", () => {
    const html = inEs(createElement(Why, { target: cresta, kill, s, place: "Mefisto" }));
    expect(html).not.toContain("Act ");
    expect(html).toContain("<li>Mefisto · Infierno: 7 tiradas</li>");
    expect(html).toContain("Acto 5 · Pesadilla · equipo");
    const english = inEn(createElement(Why, { target: cresta, kill, s, place: "Mephisto" }));
    expect(english).toContain("<li>Mephisto · Hell: 7 picks</li>");
    expect(english).toContain("Act 5 · Nightmare · equipment");
    expect(english).not.toContain("(N)");
  });

  it("aterrorizado, el primer paso lo dice (y su TC de Zona de Terror da un solo ítem fijo, en singular)", () => {
    const tz = placeKill(D, { k: "s", id: "mephisto" }, 2, { ...NO_TZ, tz: 90 })!;
    expect(D.tcs[tz.tc].p).toBe(-1);
    expect(inEs(createElement(Why, { target: cresta, kill: tz, s, place: "Mefisto" }))).toContain("<li>Mefisto · Infierno · Zona de Terror: 1 ítem fijo</li>");
    expect(inEn(createElement(Why, { target: cresta, kill: tz, s, place: "Mephisto" }))).toContain("<li>Mephisto · Hell · Terror Zone: 1 fixed item</li>");
  });

  it("cada tipo de TC de acto tiene su nombre; la Zona de Terror se suma al final", () => {
    expect(tcLabel("Act 5 (N) Equip C", es)).toBe("Acto 5 · Pesadilla · equipo");
    expect(tcLabel("Act 1 Equip A", es)).toBe("Acto 1 · Normal · equipo");
    expect(tcLabel("Act 1 (H) Good", es)).toBe("Acto 1 · Infierno · botín bueno");
    expect(tcLabel("Act 5 (H) Champ C Desecrated", es)).toBe("Acto 5 · Infierno · campeones · Zona de Terror");
    expect(tcLabel("Act 5 (H) Super Cx", en)).toBe("Act 5 · Hell · super uniques");
    expect(tcLabel("Act 3 (H) Herald B", en)).toBe("Act 3 · Hell · Herald");
    const kinds = ["Equip", "Good", "Uitem", "Citem", "Melee", "Bow", "Magic", "Junk", "H2H", "Miss", "Cast", "Champ", "Unique", "Super", "Chest", "Wraith", "Cpot", "Herald"];
    for (const copy of [es, en]) expect(Object.keys(copy.tcKinds).sort()).toEqual([...kinds].sort());
    // Todos los TC de los datos con la forma "Act N [(N|H)] Tipo[ letra][ Desecrated]" se dicen en palabras (hoy, 769).
    const actTcs = Object.keys(D.tcs).filter((n) => /^Act \d (?:\([NH]\) )?\w+(?: [A-Z]x?)?(?: Desecrated)?$/.test(n));
    expect(actTcs.length).toBeGreaterThan(600);
    for (const name of actTcs) expect(tcLabel(name, es), name).not.toContain("Act ");
  });

  it("lo que no es de acto queda como lo llama el juego; los automáticos y las runas, como antes", () => {
    expect(tcLabel("Act 1 Worldstone Shards 3", es)).toBe("Act 1 Worldstone Shards 3");
    expect(tcLabel("Act 1 (H) Citem A Shard", es)).toBe("Act 1 (H) Citem A Shard");
    expect(tcLabel("Countess Rune (H)", es)).toBe("Countess Rune (H)");
    expect(tcLabel("armo60", es)).toBe("armaduras hasta nivel 60");
    expect(tcLabel("Runes 12", es)).toBe("runas (grupo 12)");
  });
});

describe("la curva del hallazgo mágico", () => {
  const D = dropData();
  const kill = placeKill(D, { k: "s", id: "mephisto" }, 2, NO_TZ)!;
  const curve = (target: Target, mf = 300) => inEs(createElement(MfCurve, { target, kill, st: { ...DEFAULT_STATE, mf } }));
  const dotX = (html: string) => Number(/<circle cx="([\d.]+)"/.exec(html)?.[1]);

  it("dibuja la curva y dice cuánto rinde cada tramo", () => {
    const html = curve(cresta);
    expect(html).toContain("<svg");
    // El juego achica el MF de los únicos: la chance se multiplica por 1 + 2,5·MF/(MF+250),
    // o sea ×2,36 de 0 a 300% y sólo ×1,17 más de 300 a 600%.
    expect(html).toContain("se multiplica por 2,36; de 300 a 600%, sólo por 1,17");
  });

  it("el punto sigue al hallazgo mágico de quien mira y se frena en 1.000", () => {
    // El eje va de 10 (MF 0) a 310 (MF 1.000) en un cuadro de 320.
    expect(dotX(curve(cresta, 0))).toBe(10);
    expect(dotX(curve(cresta, 300))).toBe(100);
    expect(dotX(curve(cresta, 1000))).toBe(310);
    expect(dotX(curve(cresta, 5000))).toBe(310);
  });

  it("el punto va sobre la curva aunque el hallazgo mágico no sea múltiplo de 50", () => {
    const vertices = /<polyline points="([^"]+)"/.exec(curve(cresta))![1].split(" ").map((v) => Number(v.split(",")[1]));
    const dotY = (mf: number) => Number(/<circle cx="[\d.]+" cy="([\d.]+)"/.exec(curve(cresta, mf))?.[1]);
    // En un múltiplo de 50 cae justo en un vértice.
    expect(dotY(300)).toBeCloseTo(vertices[6], 6);
    expect(dotY(1000)).toBeCloseTo(vertices[20], 6);
    // A mitad de tramo queda entre sus dos vértices (más chance, más arriba) y a menos de 1 px de la recta que los une:
    // antes tomaba la muestra más cercana y flotaba a 7 px de la curva.
    const [y0, y1] = [vertices[0], vertices[1]];
    expect(dotY(25)).toBeLessThan(y0);
    expect(dotY(25)).toBeGreaterThan(y1);
    expect(Math.abs(dotY(25) - (y0 + y1) / 2)).toBeLessThan(1);
  });

  it("el dibujo se describe con la chance en 0 y en 1.000, y no repite el título", () => {
    const label = /<svg[^>]*aria-label="([^"]*)"/.exec(curve(cresta))![1];
    const chance = (mf: number) => chancePerKill(D, cresta, kill, { ...toSettings(DEFAULT_STATE), mf });
    expect(label).not.toBe(es.mfTitle);
    expect(label).toContain(odds(chance(0), "es-AR", es));
    expect(label).toContain(odds(chance(1000), "es-AR", es));
  });

  it("una runa no cambia con el hallazgo mágico: no hay curva y lo dice, sin dar razones", () => {
    const html = curve({ k: "b", code: "r30" });
    expect(html).toContain("El hallazgo mágico no cambia esta chance.");
    expect(html).not.toContain("<svg");
    // La razón de antes («las runas y las bases no tiran calidad») era falsa para un único que cae siempre.
    expect(html).not.toContain("calidad");
  });

  it("lo mismo con un único que cae siempre, como el Annihilus", () => {
    const clon = placeKill(D, { k: "s", id: "diablo-clone" }, 2, NO_TZ)!;
    const html = inEs(createElement(MfCurve, { target: { k: "u", id: "annihilus" }, kill: clon, st: DEFAULT_STATE }));
    expect(html).toContain("El hallazgo mágico no cambia esta chance.");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("calidad");
  });
});

describe("¿Dónde lo farmeo?: los bordes de la lista", () => {
  const farm = (item: Target, extra: Partial<typeof DEFAULT_STATE> = {}) =>
    inEs(createElement(DropsFarm, { st: { ...DEFAULT_STATE, item, ...extra }, set: () => undefined }));

  it("cada ejemplo del principio lleva a jefes con su chance", () => {
    for (const ex of FARM_EXAMPLES) {
      const html = farm(ex);
      expect(html, JSON.stringify(ex)).toContain("Jefes y superúnicos");
      expect(html, JSON.stringify(ex)).toContain("1 en ");
      expect(html, JSON.stringify(ex)).not.toContain("no lo suelta nadie");
    }
  });

  it("muestra los diez mejores lugares de cada lista, de más a menos chance", () => {
    const [jefes, areas] = farm(cresta, { diff: 2 }).split('<h2 class="d2-h3">Áreas</h2>');
    /** El N de cada "1 en N" que casa, sin el punto de los miles. */
    const ns = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => Number(m[1].replaceAll(".", "")));
    const porMuerte = ns(jefes, /class="d2-dr-odds">1 en ([\d.]+)</g);
    const porComun = ns(areas, /<small>Común<\/small><b>1 en ([\d.]+)</g);
    for (const lista of [porMuerte, porComun]) {
      expect(lista).toHaveLength(10);
      expect([...lista].sort((a, b) => a - b)).toEqual(lista);
    }
    // La barra de cada jefe es la chance relativa a la del mejor (la primera va llena).
    const barras = [...jefes.matchAll(/<i style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
    expect(barras).toHaveLength(10);
    expect(barras[0]).toBe(100);
    barras.forEach((w, i) => expect(w, `barra ${i}`).toBeCloseTo((100 * porMuerte[0]) / porMuerte[i], 0));
  });

  it("una barra nunca baja del 3%, para que se vea aunque el lugar sea mucho peor que el mejor", () => {
    // La runa Ist: la Condesa es 1 en 287 y el resto ronda 1 en 10.000 o peor.
    const barras = [...farm({ k: "b", code: "r24" }, { diff: 2 }).matchAll(/<i style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
    expect(barras[0]).toBe(100);
    expect(barras.slice(1)).not.toHaveLength(0);
    for (const w of barras.slice(1)) expect(w).toBe(3);
  });

  it("lo que sale siempre dice «siempre» en su fila y no «1 en 1»", () => {
    const html = farm({ k: "u", id: "annihilus" });
    expect(html).toContain('class="d2-dr-odds">siempre<');
    expect(html).not.toContain("1 en 1<");
  });

  it("el ícono del encabezado es decorativo: el nombre ya está en el título", () => {
    const html = farm(cresta);
    expect(html).toMatch(/<img [^>]*alt=""/);
    expect(html).not.toContain('alt="Cresta del arlequín"');
  });

  it("lo que no cae en ningún lado lo avisa, sin listas ni curva", () => {
    const html = farm({ k: "u", id: "horadric-staff" });
    // No es "con estas opciones": no lo suelta ningún monstruo con ninguna (es de misión).
    expect(html).toContain("No lo suelta ningún monstruo.");
    expect(html).not.toContain("Con estas opciones no lo suelta nadie.");
    expect(html).not.toContain("Jefes y superúnicos");
    expect(html).not.toContain("Áreas");
    expect(html).not.toContain("Cuánto te suma el hallazgo mágico");
  });

  it("si sólo lo suelta un jefe no aparece la lista de áreas", () => {
    const html = farm({ k: "u", id: "annihilus" });
    expect(html).toContain("Jefes y superúnicos");
    expect(html).not.toContain("Áreas");
  });

  it("la dificultad elegida deja afuera a las demás", () => {
    const html = farm({ k: "u", id: "the-stone-of-jordan" }, { diff: 0 });
    expect(html).toContain("Normal · ");
    expect(html).not.toContain("Pesadilla");
    expect(html).not.toContain("Infierno");
  });

  it("con la Zona de Terror prendida suma filas marcadas y la cifra del Heraldo", () => {
    const off = farm(cresta, { diff: 2 });
    const on = farm(cresta, { diff: 2, tz: 90 });
    expect(off).not.toContain("Zona de Terror");
    expect(off).not.toContain("Heraldo");
    // Tanto los jefes aterrorizados como las áreas que se pueden aterrorizar llevan la marca.
    const [jefes, areas] = on.split('<h2 class="d2-h3">Áreas</h2>');
    expect(jefes).toContain("· Zona de Terror");
    expect(areas).toContain("· Zona de Terror");
    expect(areas).toContain("Heraldo");
  });

  it("en inglés los lugares y los textos salen en inglés", () => {
    const html = inEn(createElement(DropsFarm, { st: { ...DEFAULT_STATE, item: cresta, diff: 2 as const }, set: () => undefined }));
    expect(html).toContain("Bosses and super uniques");
    expect(html).toContain("Mephisto");
    expect(html).not.toContain("Mefisto");
    expect(html).toMatch(/1 in [\d,]+/);
    expect(html).toContain("How much magic find helps");
  });
});

// La tanda final: "Con estas opciones no lo suelta nadie." dice por qué cuando se puede saber.
describe("por qué no lo suelta nadie", () => {
  const D = dropData();
  const en = D2R_COPY.en.drops;
  /** El primer único que esta temporada sólo cae en Clasificación, sacado de los datos (si ya no hay, los tests se saltean). */
  const LADDER_ONLY = D.uniques.find((u) => !ladderOk(u.lad, false, SEASON))?.id;
  const farm = (item: Target, extra: Partial<typeof DEFAULT_STATE> = {}, render = inEs) =>
    render(createElement(DropsFarm, { st: { ...DEFAULT_STATE, item, ...extra }, set: () => undefined }));

  it.skipIf(!LADDER_ONLY)("lo que esta temporada sólo cae en Clasificación lo dice y ofrece prenderla", () => {
    const item: Target = { k: "u", id: LADDER_ONLY! };
    const html = farm(item);
    expect(html).toContain("Esta temporada sólo cae en Clasificación.");
    expect(html).toContain(">Prender Clasificación</button>");
    expect(html).not.toContain("Con estas opciones no lo suelta nadie.");
    expect(farm(item, {}, inEn)).toContain("This season it only drops on Ladder.");
    expect(farm(item, {}, inEn)).toContain(">Turn on Ladder</button>");
    // Con Clasificación prendida, cae.
    expect(farm(item, { ladder: true })).toContain("Jefes y superúnicos");
  });

  it.skipIf(!LADDER_ONLY)("el botón prende Clasificación", () => {
    const calls: unknown[] = [];
    let tree: ReactElement | undefined;
    const Probe = () => {
      tree = NoDrop({ target: { k: "u", id: LADDER_ONLY! }, st: DEFAULT_STATE, set: (p) => void calls.push(p) }) as ReactElement;
      return null;
    };
    inEs(createElement(Probe));
    /** Los botones del árbol de elementos que devolvió el componente, sin dibujar nada. */
    const buttons: ReactElement[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (isValidElement<{ children?: unknown }>(node)) {
        if (node.type === "button") buttons.push(node);
        walk(node.props.children);
      }
    };
    walk(tree);
    expect(buttons).toHaveLength(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(calls).toEqual([{ ladder: true }]);
  });

  it("lo que no suelta ningún monstruo con ninguna opción: los ítems de misión y la Antorcha del Infierno", () => {
    for (const id of ["horadric-staff", "staff-of-kings", "amulet-of-the-viper", "khalims-will", "hellfire-torch"]) {
      expect(dropsAnywhere(D, { k: "u", id }, SEASON), id).toBe(false);
      expect(farm({ k: "u", id }), id).toContain("No lo suelta ningún monstruo.");
    }
    expect(farm({ k: "u", id: "hellfire-torch" }, {}, inEn)).toContain("No monster drops it.");
    // Lo que sí cae en algún lado, aunque no con estas opciones, sigue con el aviso de siempre.
    expect(dropsAnywhere(D, { k: "u", id: "harlequin-crest" }, SEASON)).toBe(true);
    if (LADDER_ONLY) expect(dropsAnywhere(D, { k: "u", id: LADDER_ONLY }, SEASON)).toBe(true);
    expect(farm({ k: "u", id: "annihilus" }, { diff: 0 })).toContain("Con estas opciones no lo suelta nadie.");
    expect(en.none).toBe("Nothing drops it with these options.");
  });
});

describe("«¿Qué más suelta?» en una fila de área", () => {
  const D = dropData();
  const firstArea = (target: Target) => bestPlaces(D, target, toSettings(DEFAULT_STATE), toOpts(DEFAULT_STATE), [2], 10).areas[0];
  /** Todos los elementos del árbol que cumplen `pred`, sin dibujar nada. */
  const findAll = (node: unknown, pred: (el: ReactElement<{ className?: string; children?: unknown }>) => boolean, out: ReactElement[] = []): ReactElement[] => {
    if (Array.isArray(node)) node.forEach((n) => findAll(n, pred, out));
    else if (isValidElement<{ className?: string; children?: unknown }>(node)) {
      if (pred(node)) out.push(node);
      findAll(node.props.children, pred, out);
    }
    return out;
  };
  /**
   * Toca el botón de la fila sin un DOM: se llama al componente adentro de un render (los hooks lo piden),
   * se lee el árbol de elementos que devuelve y se dispara el `onClick` del botón. Devuelve lo que le pasó a `set`.
   */
  const tap = (row: AreaRow, target: Target) => {
    const calls: unknown[] = [];
    let tree: ReactElement | undefined;
    const Probe = () => {
      tree = AreaLine({ row, open: true, onToggle: () => undefined, target, st: DEFAULT_STATE, set: (p) => void calls.push(p) });
      return null;
    };
    inEs(createElement(Probe));
    const chip = findAll(tree, (el) => el.props.className === "d2-chip");
    expect(chip).toHaveLength(1);
    (chip[0].props as { onClick: () => void }).onClick();
    return calls;
  };

  it("abre el primer tipo de monstruo que suelta el ítem: la Corona de las Eras no cae de los comunes", () => {
    const corona: Target = { k: "u", id: "crown-of-ages" };
    const row = firstArea(corona);
    expect(row.p.normal).toBe(0);
    expect(row.p.champ).toBeGreaterThan(0);
    expect(tap(row, corona)).toEqual([{ m: "drops", place: { k: "a", id: row.area.id, cat: "champ" }, pdiff: 2 }]);
  });

  it("y si los comunes lo sueltan, abre los comunes", () => {
    const row = firstArea(cresta);
    expect(row.p.normal).toBeGreaterThan(0);
    expect(tap(row, cresta)).toEqual([{ m: "drops", place: { k: "a", id: row.area.id, cat: "normal" }, pdiff: 2 }]);
  });
});

// La pestaña entera (Task 11): la calculadora con sus tres modos y la ficha de cada jefe, por la dirección.
import D2rDrops from "../src/d2r/D2rDrops";
import { parseRoute } from "../src/route";

describe("la pestaña", () => {
  it("la calculadora con sus tres modos y el texto que la explica", () => {
    const html = inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops"), navigate: () => undefined }));
    expect(html).toContain("Calculadora de drops");
    for (const m of ["¿Dónde lo farmeo?", "¿Qué suelta?", "Simulador"]) expect(html).toContain(m);
    expect(html).toContain("Los números son exactos");
  });

  it("/d2r/drops/mephisto es la ficha de Mefisto; un id que no existe cae en la calculadora", () => {
    const mephisto = inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    expect(mephisto).toContain("Qué suelta Mefisto");
    expect(mephisto).toContain('href="/es/d2r/drops?m=sim&amp;src=s.mephisto&amp;pd=2"');
    expect(inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops/no-existe"), navigate: () => undefined }))).toContain("¿Dónde lo farmeo?");
  });
});

// Lo que rodea a la pestaña: el enlace compartido entra en el primer render, cada ficha lleva su `key`,
// la barra de la sección la dibuja y la portada la ofrece.
import { vi } from "vitest";
import D2r, { cameFromHistory, notePop, preloadTab } from "../src/D2r";
import D2rHome from "../src/d2r/D2rHome";
import { Calculator } from "../src/d2r/D2rDrops";

/** La calculadora tal como la arma el navegador, con la dirección ya puesta (en el prerender no hay `window`). */
const conEnlace = (search: string) => {
  vi.stubGlobal("window", { location: { search } });
  try {
    return inEs(createElement(Calculator, { route: parseRoute("/es/d2r/drops"), navigate: () => undefined, missing: false, initial: DEFAULT_STATE }));
  } finally {
    // Ningún otro render de este archivo tiene `window`: no se queda puesto.
    vi.unstubAllGlobals();
  }
};

describe("la pestaña: el enlace compartido y su lugar en la sección", () => {
  const ficha = (id: string) => D2rDrops({ route: parseRoute(`/es/d2r/drops/${id}`), navigate: () => undefined });

  it("un enlace con ítem y dificultad muestra el resultado ya en el primer render; sin enlace, el estado de fábrica", () => {
    const html = conEnlace("?i=u.harlequin-crest&d=2");
    expect(html).toContain("Jefes y superúnicos");
    expect(html).toMatch(/Mefisto|Diablo|Baal/);
    expect(html).not.toContain("Probá con");
    // Sin `window` (el prerender y los buscadores) sale el de fábrica: sin ítem, con los ejemplos.
    expect(inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops"), navigate: () => undefined }))).toContain("Probá con");
  });

  it("el modo, el lugar y las opciones del enlace también entran en el primer render", () => {
    const html = conEnlace("?m=sim&src=s.mephisto&pd=2&p=3");
    expect(html).toContain("Abrir el cofre");
    expect(html).toContain('<option value="s.mephisto" selected="">Mefisto</option>');
    expect(html).toContain('<option value="3" selected="">3</option>');
  });

  it("«Más opciones» viene abierta si el enlace trae algo de adentro, y cerrada si no", () => {
    const abierta = /<details class="d2-dr-extra" open="">/;
    expect(conEnlace("?p=3&g=2")).toMatch(abierta);
    expect(conEnlace("?l=1")).toMatch(abierta);
    expect(conEnlace("?q=1")).toMatch(abierta);
    expect(conEnlace("?mf=450")).not.toMatch(abierta);
    expect(conEnlace("")).not.toMatch(abierta);
  });

  it("los enlaces de la ficha de un jefe llevan a la calculadora con ese jefe elegido", () => {
    const html = inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    /** La dirección de uno de los dos enlaces de la ficha, sin el camino: lo que la calculadora lee de la barra. */
    const query = (mode: string) => {
      const start = html.indexOf(`href="/es/d2r/drops?m=${mode}`);
      expect(start, mode).toBeGreaterThan(-1);
      const href = html.slice(start + 'href="'.length, html.indexOf('"', start + 'href="'.length)).replaceAll("&amp;", "&");
      return href.slice(href.indexOf("?"));
    };
    const sim = conEnlace(query("sim"));
    expect(sim).toContain("Abrir el cofre");
    expect(sim).toContain('<option value="s.mephisto" selected="">Mefisto</option>');
    // "¿Qué suelta?" abre con Mefisto elegido; su lista se calcula después del primer pintado y mientras tanto dice
    // «calculando…» (ver d2rDropsLoad.test.ts).
    const drops = conEnlace(query("drops"));
    expect(drops).toContain(`<p class="d2-dr-busy">${es.calculating}</p>`);
    expect(drops).toContain('<option value="s.mephisto" selected="">Mefisto</option>');
  });

  it("cada ficha de jefe lleva su id como `key`: lo que se cambia en una no pasa a la siguiente", () => {
    expect(ficha("mephisto").key).toBe("mephisto");
    expect(ficha("diablo").key).toBe("diablo");
    // La calculadora no tiene `key`: un id que no existe sigue siendo la misma pantalla.
    expect(ficha("no-existe").key).toBeNull();
  });

  it("la sección dibuja Drops entre Breakpoints y el planificador, la marca en la barra y abre la calculadora o la ficha", async () => {
    for (const [path, cuerpo] of [["/es/d2r/drops", "¿Dónde lo farmeo?"], ["/es/d2r/drops/mephisto", "Qué suelta Mefisto"]]) {
      const route = parseRoute(path);
      await preloadTab(route);
      const html = inEs(createElement(D2r, { route, navigate: () => undefined }));
      expect(html, path).toContain(cuerpo);
      expect(html, path).toMatch(/<a href="\/es\/d2r\/drops" class="d2-tab is-on"[^>]*>Drops<\/a>/);
      expect(html.indexOf(">Breakpoints<"), path).toBeLessThan(html.indexOf(">Drops<"));
      expect(html.indexOf(">Drops<"), path).toBeLessThan(html.indexOf(">Planificador<"));
    }
  });

  it("la portada de la sección ofrece la calculadora primera entre las herramientas", () => {
    const html = inEs(createElement(D2rHome, { route: parseRoute("/es/d2r"), navigate: () => undefined }));
    const first = /<ul class="d2-tools"><li><a href="([^"]+)"[^>]*>.*?<h3>([^<]+)<\/h3>/.exec(html);
    expect(first?.[1]).toBe("/es/d2r/drops");
    expect(first?.[2]).toBe("Calculadora de drops");
  });
});

// La vuelta arriba al cambiar de pestaña o de ficha es para la navegación de la app: con Atrás y Adelante el navegador devuelve el
// lugar donde estabas, y volver arriba lo perdía (al volver a una lista larga desde una ficha).
describe("Atrás y Adelante no vuelven arriba", () => {
  it("la página que llegó con Atrás o Adelante no vuelve arriba; la navegación siguiente de la app sí", () => {
    // Sin nada anotado es una navegación de la app.
    expect(cameFromHistory("/es/d2r/drops")).toBe(false);
    notePop("/es/d2r/drops");
    expect(cameFromHistory("/es/d2r/drops")).toBe(true);
    // Se consume al preguntar: el siguiente cambio de página, de la app, vuelve arriba.
    expect(cameFromHistory("/es/d2r/drops")).toBe(false);
  });

  it("un Atrás hacia otra sección no se guarda para después: entrar a Diablo II con un enlace va arriba", () => {
    notePop("/es");
    expect(cameFromHistory("/es/d2r/drops/mephisto")).toBe(false);
    expect(cameFromHistory("/es")).toBe(false);
  });
});

// El directorio de jefes: lo que hace que las 128 fichas tengan un enlace de verdad desde su sección (sin él el buscador
// las encuentra en el sitemap pero no las indexa).
describe("el directorio de jefes al pie de la calculadora", () => {
  const D = dropData();
  const ids = D.sources.map((s) => s.id);
  const calc = (path: string, render: typeof inEs) => render(createElement(D2rDrops, { route: parseRoute(path), navigate: () => undefined }));
  /** Los ids de las fichas a las que enlaza la página, en el orden en que aparecen. */
  const fichas = (html: string, lang: string) => [...html.matchAll(new RegExp(`href="/${lang}/d2r/drops/([a-z0-9-]+)"`, "g"))].map((m) => m[1]);
  const actOf = (s: (typeof D.sources)[number]) => (s.area === null ? null : D.areaById.get(s.area)!.act);

  it("enlaza a la ficha de cada jefe y superúnico, una vez cada uno", () => {
    const html = calc("/es/d2r/drops", inEs);
    expect(html).toContain('href="/es/d2r/drops/mephisto"');
    expect(html).toContain('href="/es/d2r/drops/the-countess"');
    expect(fichas(html, "es")).toHaveLength(64);
    expect([...fichas(html, "es")].sort()).toEqual([...ids].sort());
    expect(html).toContain("Mefisto</a>");
  });

  it("los agrupa por acto: los jefes antes que los superúnicos, cada grupo en el orden de los datos, y el Clon de Diablo en «Eventos»", () => {
    const html = calc("/es/d2r/drops", inEs);
    const esperado = [1, 2, 3, 4, 5, null].flatMap((act) => {
      const delActo = D.sources.filter((s) => actOf(s) === act);
      return [...delActo.filter((s) => s.kind === "boss"), ...delActo.filter((s) => s.kind === "super")].map((s) => s.id);
    });
    expect(fichas(html, "es")).toEqual(esperado);
    expect(esperado.at(-1)).toBe("diablo-clone");
    // El título del bloque y un encabezado por grupo, en ese orden.
    const titulos = ["<h2 class=\"d2-h3\">Qué suelta cada jefe</h2>", "<h3>Acto 1</h3>", "<h3>Acto 2</h3>", "<h3>Acto 3</h3>", "<h3>Acto 4</h3>", "<h3>Acto 5</h3>", "<h3>Eventos</h3>"];
    const lugares = titulos.map((t) => html.indexOf(t));
    expect(lugares.every((i) => i >= 0), titulos.join(" ")).toBe(true);
    expect([...lugares].sort((a, b) => a - b)).toEqual(lugares);
  });

  it("en inglés, con las direcciones y los nombres en inglés", () => {
    const html = calc("/en/d2r/drops", inEn);
    expect(fichas(html, "en")).toHaveLength(64);
    expect(html).toContain('href="/en/d2r/drops/mephisto"');
    expect(html).toContain("Mephisto</a>");
    for (const t of ["What every boss drops", "<h3>Act 1</h3>", "<h3>Events</h3>"]) expect(html).toContain(t);
    expect(fichas(html, "es")).toHaveLength(0);
  });

  it("está con cualquier modo y también cuando la dirección no es una ficha; la ficha de un jefe no lo repite", () => {
    expect(fichas(calc("/es/d2r/drops/no-existe", inEs), "es")).toHaveLength(64);
    expect(fichas(conEnlace("?m=sim&src=s.mephisto"), "es")).toHaveLength(64);
    expect(fichas(conEnlace("?m=drops"), "es")).toHaveLength(64);
    expect(fichas(calc("/es/d2r/drops/mephisto", inEs), "es")).toHaveLength(0);
  });
});
