// site/test/d2rDropsWhat.test.ts
import wikiIndex from "@d2r/wiki/index.json";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dropData } from "../src/d2r/drops/data";
import DropLists, { PlaceSelect } from "../src/d2r/drops/DropLists";
import DropsWhat from "../src/d2r/drops/DropsWhat";
import { odds } from "../src/d2r/drops/format";
import { bestPlaces, NO_TZ, type DropLine, type DropLists as Lists, type PlaceRef } from "../src/d2r/drops/places";
import SourcePage, { calcHref } from "../src/d2r/drops/SourcePage";
import { DEFAULT_STATE, readState, toSettings, type DropsState } from "../src/d2r/drops/state";
import type { Target } from "../src/d2r/drops/types";
import { tr } from "../src/d2r/wiki";
import { D2R_COPY } from "../src/d2rCopy";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));
const inEn = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "en", setLang: () => undefined } }, el));

describe("¿Qué suelta? y la ficha de cada jefe", () => {
  const route = parseRoute("/es/d2r/drops");

  it("sin lugar pide elegir uno", () => {
    const html = inEs(createElement(DropsWhat, { st: { ...DEFAULT_STATE, m: "drops" as const }, set: () => undefined, route, navigate: () => undefined }));
    // La misma frase es el texto de la opción deshabilitada del selector: se busca el párrafo del estado vacío, que es lo que puede faltar.
    expect(html).toContain('<p class="d2-empty">Elegí un jefe, un superúnico o un área</p>');
  });

  it("Mefisto en Infierno: runas y únicos con enlace a su ficha de la wiki", () => {
    const st = { ...DEFAULT_STATE, m: "drops" as const, place: { k: "s" as const, id: "mephisto" } };
    const html = inEs(createElement(DropsWhat, { st, set: () => undefined, route, navigate: () => undefined }));
    expect(html).toContain("Runa Cham");
    expect(html).toContain('href="/es/d2r/runas/cham"');
    expect(html).toContain('href="/es/d2r/unicos/');
    expect(html).toContain("Ver todo (");
  });

  it("la ficha de Mefisto: título, nivel y enlaces a la calculadora y al simulador", () => {
    const src = dropData().sourceById.get("mephisto")!;
    const html = inEs(createElement(SourcePage, { src, route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    expect(html).toContain("Qué suelta Mefisto");
    expect(html).toContain("nivel 87");
    expect(html).toContain("Runa Ber");
    // La ruta /d2r/drops llega en la Task 11 (que prueba el enlace entero): acá, sólo lo que arma la ficha.
    expect(html).toContain('?m=sim&amp;src=s.mephisto&amp;pd=2"');
  });
});

// Lo que sigue va más allá de los tres tests del plan: que los 500 y pico enlaces a la wiki existan, el selector de lugar y los bordes.

describe("los enlaces de las listas", () => {
  const D = dropData();
  const route = parseRoute("/es/d2r/drops");
  /** Las fichas que la wiki tiene: "runes/ber", "uniques/the-stone-of-jordan", "sets/tal-rashas-wrappings"… */
  const pages = new Set((wikiIndex as { sec: string; id: string }[]).map((e) => `${e.sec}/${e.id}`));
  const line = (target: Target): DropLine => ({ target, p: 0.01 });
  /** A qué fichas llevan los enlaces que dibuja la lista, en orden ("uniques/the-gnasher", leído de su dirección en español). */
  const links = (lists: Lists) =>
    [...inEs(createElement(DropLists, { lists, route, navigate: () => undefined })).matchAll(/href="(\/es\/d2r\/[^"]+)"/g)].map((m) => {
      const r = parseRoute(m[1]);
      return `${r.d2Section}/${r.detail}`;
    });
  /** De a 10: la lista muestra 24 antes de "Ver todo", así que una tanda así se ve entera. */
  const batches = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 10) }, (_, i) => xs.slice(i * 10, i * 10 + 10));

  it("cada runa lleva a la ficha de su runa", () => {
    const runes = Object.keys(D.bases)
      .filter((code) => /^r\d\d$/.test(code))
      .map((code) => line({ k: "b", code }));
    const found = links({ runes, uniques: [], sets: [] });
    expect(found).toHaveLength(runes.length);
    for (const l of found) expect(pages.has(l), l).toBe(true);
  });

  it("cada único lleva a su ficha, salvo los que sólo salen por nombre, que no tienen", () => {
    const linked = D.uniques.filter((u) => !u.f);
    expect(linked.length).toBeLessThan(D.uniques.length);
    const found = batches(D.uniques).flatMap((batch) => links({ runes: [], uniques: batch.map((u) => line({ k: "u", id: u.id })), sets: [] }));
    expect(found).toEqual(linked.map((u) => `uniques/${u.id}`));
    for (const l of found) expect(pages.has(l), l).toBe(true);
  });

  it("cada pieza de conjunto lleva a la ficha de su conjunto", () => {
    const found = batches(D.sets).flatMap((batch) => links({ runes: [], uniques: [], sets: batch.map((x) => line({ k: "s", id: x.id })) }));
    expect(found).toEqual(D.sets.map((x) => `sets/${x.set}`));
    for (const l of found) expect(pages.has(l), l).toBe(true);
  });
});

describe("el selector de lugar", () => {
  const D = dropData();
  const select = (value: PlaceRef | null, sourcesOnly = false) => inEs(createElement(PlaceSelect, { value, onChange: () => undefined, sourcesOnly }));
  /** Los valores de las opciones que salen elegidas. */
  const chosen = (html: string) => [...html.matchAll(/<option value="([^"]*)"[^>]*selected=""/g)].map((m) => m[1]);
  const tombs = D.areas.filter((a) => a.n.en === "Tal Rasha's Tomb");

  it("las siete tumbas de Tal Rasha son una sola opción, y cualquiera se ve elegida como esa", () => {
    expect(tombs).toHaveLength(7);
    expect(select(null).split(`>${tr(tombs[0].n, "es")}</option>`)).toHaveLength(2);
    // "¿Dónde lo farmeo?" puede mandar cualquiera de las siete: sin esto el selector mostraba al primer jefe.
    for (const t of tombs) expect(chosen(select({ k: "a", id: t.id, cat: "champ" })), `tumba ${t.id}`).toEqual([`a.${tombs[0].id}.champ`]);
  });

  it("un lugar que no existe se ve sin elegir, y uno que existe se ve elegido", () => {
    for (const value of [null, { k: "s", id: "no-existe" }, { k: "a", id: 9999, cat: "normal" }] as (PlaceRef | null)[]) {
      expect(chosen(select(value)), JSON.stringify(value)).toEqual([""]);
    }
    expect(chosen(select({ k: "s", id: "mephisto" }))).toEqual(["s.mephisto"]);
  });

  it("en el simulador sólo se ofrecen jefes y superúnicos", () => {
    const html = select({ k: "s", id: "mephisto" }, true);
    expect(html.match(/<optgroup/g)).toHaveLength(1);
    expect(html).not.toContain('value="a.');
  });
});

describe("¿Qué suelta? en un área", () => {
  const route = parseRoute("/es/d2r/drops");
  const nothing = "Con estas opciones acá no cae nada.";
  /** El Santuario del Caos, de Infierno: se puede aterrorizar. */
  const chaos = 108;
  const view = (render: typeof inEs) => (st: Partial<DropsState>) =>
    render(
      createElement(DropsWhat, {
        st: { ...DEFAULT_STATE, m: "drops" as const, place: { k: "a" as const, id: chaos, cat: "champ" as const }, ...st },
        set: () => undefined,
        route,
        navigate: () => undefined,
      }),
    );
  const what = view(inEs);
  /** Los tipos de monstruo que se ofrecen, en orden, con un asterisco el elegido. */
  const types = (html: string) =>
    [...html.matchAll(/<button type="button" class="d2-chip( is-on)?" aria-pressed="(?:true|false)">(Común|Campeón|Único|Heraldo)</g)].map((m) => m[2] + (m[1] ? "*" : ""));

  it("ofrece los tipos de monstruo y marca el elegido; el Heraldo, sólo con la Zona de Terror en Infierno", () => {
    expect(types(what({}))).toEqual(["Común", "Campeón*", "Único"]);
    expect(types(what({ tz: 90 }))).toEqual(["Común", "Campeón*", "Único", "Heraldo"]);
    expect(types(what({ tz: 90, pdiff: 1 }))).toEqual(["Común", "Campeón*", "Único"]);
  });

  it("en un área que no se puede aterrorizar no se ofrece el Heraldo, ni con la Zona de Terror en Infierno", () => {
    // La Forja del Dolor (Pandemonio) y la Cima de Arreat no entran en las Zonas de Terror: ahí nunca aparece un Heraldo.
    for (const id of [135, 120]) {
      expect(dropData().areaById.get(id)!.tz, String(id)).toBeUndefined();
      expect(types(what({ place: { k: "a", id, cat: "champ" }, tz: 90 })), String(id)).toEqual(["Común", "Campeón*", "Único"]);
      // Un enlace que lo trae igual se ve como el común.
      expect(types(what({ place: { k: "a", id, cat: "herald" }, tz: 90 })), String(id)).toEqual(["Común*", "Campeón", "Único"]);
    }
  });

  it("el grupo de tipos se llama «Tipo de monstruo» y no «Lugar», que es el selector", () => {
    expect(D2R_COPY.en.drops.monsterType).toBe("Monster type");
    expect(D2R_COPY.es.drops.monsterType).toBe("Tipo de monstruo");
    expect(what({})).toContain('role="group" aria-label="Tipo de monstruo"');
    expect(what({})).not.toContain('aria-label="Lugar"');
    expect(view(inEn)({})).toContain('role="group" aria-label="Monster type"');
  });

  it("un tipo que ya no se ofrece se ve como el común, con su chip marcado y su lista", () => {
    const herald = { k: "a" as const, id: chaos, cat: "herald" as const };
    // Con la Zona de Terror y en Infierno el Heraldo se ofrece, se ve elegido y suelta.
    expect(types(what({ place: herald, tz: 90 }))).toEqual(["Común", "Campeón", "Único", "Heraldo*"]);
    expect(what({ place: herald, tz: 90 })).not.toContain(nothing);
    // Al pasar a Pesadilla, o con un enlace viejo que trae el Heraldo sin la zona, ya no se ofrece: antes no quedaba ningún
    // chip marcado y la lista decía que no cae nada. Ahora es exactamente la del común.
    for (const st of [{ tz: 90, pdiff: 1 as const }, { tz: 0 }]) {
      const html = what({ place: herald, ...st });
      expect(types(html), JSON.stringify(st)).toEqual(["Común*", "Campeón", "Único"]);
      expect(html, JSON.stringify(st)).not.toContain(nothing);
      expect(html, JSON.stringify(st)).toBe(what({ place: { ...herald, cat: "normal" }, ...st }));
    }
  });

  it("un lugar que no se puede resolver vale como no haber elegido ninguno", () => {
    const empty = '<p class="d2-empty">Elegí un jefe, un superúnico o un área</p>';
    const withoutMonsters = dropData().areas.find((a) => !(a.mon.length || a.nmon.length))!;
    const broken: PlaceRef[] = [
      { k: "s", id: "no-existe" },
      { k: "a", id: 9999, cat: "normal" },
      // El selector no ofrece un área sin monstruos, y no tiene qué soltar.
      { k: "a", id: withoutMonsters.id, cat: "normal" },
    ];
    for (const place of broken) {
      const html = what({ place });
      expect(html, JSON.stringify(place)).toContain(empty);
      expect(html, JSON.stringify(place)).not.toContain(nothing);
      // Y sin lugar no hay tipos de monstruo que elegir.
      expect(types(html), JSON.stringify(place)).toEqual([]);
    }
    expect(what({ place: null })).toContain(empty);
  });

  it("muestra lo que suelta el tipo elegido", () => {
    const html = what({ place: { k: "a", id: chaos, cat: "unique" } });
    expect(html).toContain("Runas");
    expect(html).toMatch(/1 en [\d.]+/);
    expect(html).not.toContain(nothing);
  });

  it("da el mismo número que la fila del área en «¿Dónde lo farmeo?»: la Ber en el Santuario Arcano de Infierno", () => {
    // La fila promedia a los tres monstruos del área; antes la lista mostraba sólo al Espectro, casi el doble.
    const ber: Target = { k: "b", code: "r30" };
    const row = bestPlaces(dropData(), ber, toSettings(DEFAULT_STATE), NO_TZ, [2], 1000).areas.find((r) => r.area.id === 74)!;
    const html = what({ place: { k: "a", id: 74, cat: "normal" }, pdiff: 2 });
    expect(html).toContain(`<b>Runa Ber</b><small>${odds(row.p.normal, "es-AR", D2R_COPY.es.drops)}</small>`);
  });

  it("el Clon de Diablo, que sólo suelta en Infierno, avisa que no cae nada en las otras dificultades", () => {
    expect(what({ place: { k: "s", id: "diablo-clone" }, pdiff: 0 })).toContain(nothing);
    expect(what({ place: { k: "s", id: "diablo-clone" }, pdiff: 2 })).not.toContain(nothing);
  });
});

describe("la ficha de un jefe o superúnico según lo que tenga", () => {
  const D = dropData();
  /** La línea de abajo del título: qué es, dónde está y el nivel con que muere en Infierno. */
  const sub = (id: string) => {
    const html = inEs(createElement(SourcePage, { src: D.sourceById.get(id)!, route: parseRoute(`/es/d2r/drops/${id}`), navigate: () => undefined }));
    return /<p class="d2-detail-sub">([^<]*)<\/p>/.exec(html)?.[1];
  };
  const where = (id: string) => tr(D.areaById.get(D.sourceById.get(id)!.area!)!.n, "es");

  it("un jefe y un superúnico dicen qué son, en qué área y acto están y su nivel", () => {
    expect(sub("mephisto")).toBe(`Jefe · ${where("mephisto")} · Acto 3 · nivel 87`);
    expect(sub("pindleskin")).toMatch(new RegExp(`^Superúnico · ${where("pindleskin")} · Acto 5 · nivel \\d+$`));
  });

  it("el Clon de Diablo no tiene área: la ficha se arma igual, sin ella", () => {
    expect(D.sourceById.get("diablo-clone")!.area).toBeNull();
    expect(sub("diablo-clone")).toMatch(/^Jefe · nivel \d+$/);
  });
});

describe("los enlaces de la ficha a la calculadora y al simulador", () => {
  const base = "/es/d2r/drops";

  it("llevan el hallazgo mágico y los jugadores sólo si no son los de siempre", () => {
    // Con los valores de siempre la dirección queda como estaba: ni `mf` ni `p`.
    expect(calcHref(base, "sim", "mephisto", 2, DEFAULT_STATE.mf, DEFAULT_STATE.players)).toBe("/es/d2r/drops?m=sim&src=s.mephisto&pd=2");
    expect(calcHref(base, "drops", "baal", 0, 300, 1)).toBe("/es/d2r/drops?m=drops&src=s.baal&pd=0");
    expect(calcHref(base, "sim", "mephisto", 2, 450, 1)).toBe("/es/d2r/drops?m=sim&src=s.mephisto&pd=2&mf=450");
    expect(calcHref(base, "sim", "mephisto", 2, 300, 4)).toBe("/es/d2r/drops?m=sim&src=s.mephisto&pd=2&p=4");
    // Un hallazgo mágico de 0 también es distinto del de siempre.
    expect(calcHref(base, "drops", "mephisto", 1, 0, 8)).toBe("/es/d2r/drops?m=drops&src=s.mephisto&pd=1&mf=0&p=8");
  });

  it("la calculadora los lee tal como salieron de la ficha", () => {
    const st = readState(calcHref(base, "sim", "mephisto", 1, 0, 8).split("?")[1]);
    expect(st).toMatchObject({ m: "sim", place: { k: "s", id: "mephisto" }, pdiff: 1, mf: 0, players: 8 });
  });

  it("la ficha, tal como sale, dibuja los dos con los valores de siempre", () => {
    const html = inEs(createElement(SourcePage, { src: dropData().sourceById.get("mephisto")!, route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    expect(html).toContain('?m=sim&amp;src=s.mephisto&amp;pd=2"');
    expect(html).toContain('?m=drops&amp;src=s.mephisto&amp;pd=2"');
  });
});
