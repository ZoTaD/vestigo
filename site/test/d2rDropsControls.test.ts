// site/test/d2rDropsControls.test.ts
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { D2R_COPY } from "../src/d2rCopy";
import DropsControls from "../src/d2r/drops/DropsControls";
import { odds, oddsN } from "../src/d2r/drops/format";
import ItemPicker, { PickerResults, searchItems } from "../src/d2r/drops/ItemPicker";
import NumField, { parseNum, type NumFieldProps } from "../src/d2r/drops/NumField";
import { dropData } from "../src/d2r/drops/data";
import { DEFAULT_STATE, readState, type DropsState, type Mode } from "../src/d2r/drops/state";
import { LangContext, type Lang } from "../src/i18n";

/**
 * Los controles y el buscador tal como los dibuja el prerender del sitio
 * (2026-09-29): lo que se ve y lo que no según el modo y las opciones. Lo que
 * pasa al escribir o tocar se cubre en los tests de estado y de búsqueda.
 */
const es = D2R_COPY.es.drops;
const en = D2R_COPY.en.drops;

const render = (el: ReactElement, lang: Lang = "es") => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => {} } }, el));
const controls = (st: Partial<DropsState>, mode: Mode, lang: Lang = "es") => render(createElement(DropsControls, { st: { ...DEFAULT_STATE, ...st }, set: () => {}, mode }), lang);

describe("los controles", () => {
  it("la dificultad se elige sólo en '¿Dónde lo farmeo?'", () => {
    const farm = controls({}, "farm");
    for (const d of [es.allDiffs, ...es.diffs]) expect(farm).toContain(`>${d}</button>`);
    for (const mode of ["drops", "sim"] as const) expect(controls({}, mode)).not.toContain(es.diffs[1]);
  });

  it("el nivel de la Zona de Terror y el del Heraldo se piden sólo con la zona prendida", () => {
    const off = controls({ tz: 0 }, "farm");
    expect(off).not.toContain(es.tzLevel);
    expect(off).not.toContain(es.herald);
    const on = controls({ tz: 91 }, "farm");
    expect(on).toContain(es.tzLevel);
    expect(on).toContain('value="91"');
    expect(on).toContain(es.herald);
  });

  it("del grupo cerca tuyo no puede haber más gente que jugadores", () => {
    const options = (players: number) => {
      const select = new RegExp(`${es.party}</span><select[^>]*>(.*?)</select>`).exec(controls({ players }, "farm"));
      return select ? (select[1].match(/<option/g) ?? []).length : -1;
    };
    expect(options(1)).toBe(1);
    expect(options(3)).toBe(3);
    expect(options(8)).toBe(8);
  });

  it("en inglés se leen los mismos controles", () => {
    const html = controls({}, "farm", "en");
    expect(html).toContain(en.mf);
    expect(html).toContain(en.diffs[1]);
  });
});

describe("el nivel del Heraldo", () => {
  const herald = (html: string) => html.includes(`${es.herald}</span><select`);

  it("en '¿Dónde lo farmeo?' sale con la Zona de Terror y las dificultades que incluyen Infierno", () => {
    expect(herald(controls({ tz: 90, diff: 0 }, "farm"))).toBe(false);
    expect(herald(controls({ tz: 90, diff: 1 }, "farm"))).toBe(false);
    expect(herald(controls({ tz: 90, diff: 2 }, "farm"))).toBe(true);
    expect(herald(controls({ tz: 90, diff: -1 }, "farm"))).toBe(true);
    expect(herald(controls({ tz: 0, diff: 2 }, "farm"))).toBe(false);
  });

  it("en '¿Qué suelta?' y el simulador manda la dificultad del lugar, no la de '¿Dónde lo farmeo?'", () => {
    for (const mode of ["drops", "sim"] as const) {
      expect(herald(controls({ tz: 90, pdiff: 2 }, mode))).toBe(true);
      expect(herald(controls({ tz: 90, pdiff: 1 }, mode))).toBe(false);
      expect(herald(controls({ tz: 90, pdiff: 0 }, mode))).toBe(false);
      expect(herald(controls({ tz: 90, diff: 2, pdiff: 0 }, mode))).toBe(false);
      expect(herald(controls({ tz: 0, pdiff: 2 }, mode))).toBe(false);
    }
  });

  it("va de 1 al nivel máximo de los datos (5 hoy)", () => {
    const select = new RegExp(`${es.herald}</span><select[^>]*>(.*?)</select>`).exec(controls({ tz: 90, diff: 2 }, "farm"));
    expect((select?.[1].match(/<option/g) ?? []).length).toBe(dropData().tz.maxTier);
    expect(dropData().tz.maxTier).toBe(5);
  });

  it("el tope sale de `tz.maxTier` y no de un 5 fijo: la dirección y el selector lo siguen si un parche lo cambia", () => {
    const tz = dropData().tz;
    const before = tz.maxTier;
    try {
      tz.maxTier = 3;
      expect(readState("?h=5").tier).toBe(3);
      const select = new RegExp(`${es.herald}</span><select[^>]*>(.*?)</select>`).exec(controls({ tz: 90, diff: 2 }, "farm"));
      expect((select?.[1].match(/<option/g) ?? []).length).toBe(3);
    } finally {
      tz.maxTier = before;
    }
  });
});

describe("'Más opciones'", () => {
  const closed = '<details class="d2-dr-extra">';
  const open = '<details class="d2-dr-extra" open="">';

  it("arranca cerrada, y con la clase propia (d2-dr-more es del botón de los pasos)", () => {
    const html = controls({}, "farm");
    expect(html).toContain(closed);
    expect(html).not.toContain("d2-dr-more");
  });

  it("se abre sola cuando el enlace ya trae una opción de adentro", () => {
    expect(controls({ ladder: true }, "farm")).toContain(open);
    expect(controls({ quest: true }, "drops")).toContain(open);
    expect(controls({ players: 4, party: 3 }, "sim")).toContain(open);
    expect(controls({ tz: 90, tier: 3 }, "farm")).toContain(open);
  });

  it("no se abre por lo que está afuera, ni por un nivel de Heraldo que no se ve", () => {
    expect(controls({ players: 4 }, "farm")).toContain(closed);
    expect(controls({ mf: 450 }, "farm")).toContain(closed);
    expect(controls({ tz: 90 }, "farm")).toContain(closed);
    expect(controls({ tz: 0, tier: 3 }, "farm")).toContain(closed);
    expect(controls({ tz: 90, tier: 3, diff: 0 }, "farm")).toContain(closed);
  });
});

describe("cómo se leen las chances, los bordes", () => {
  it("'1 millón' en singular y el plural en el resto", () => {
    expect(oddsN(1e-6, "es-AR", es)).toBe("1 millón");
    expect(odds(1e-6, "es-AR", es)).toBe("1 en 1 millón");
    // 1,04 millones se redondea a 1 y también va en singular.
    expect(oddsN(1 / 1_040_000, "es-AR", es)).toBe("1 millón");
    expect(oddsN(1 / 1_100_000, "es-AR", es)).toBe("1,1 millones");
    expect(oddsN(2e-7, "es-AR", es)).toBe("5 millones");
    expect(oddsN(1e-6, "en-US", en)).toBe("1 million");
    expect(oddsN(2e-7, "en-US", en)).toBe("5 million");
  });

  it("sin chance no hay número: el mismo guion que 'odds'", () => {
    expect(oddsN(0, "es-AR", es)).toBe("—");
    expect(oddsN(-1, "es-AR", es)).toBe("—");
    expect(oddsN(Number.NaN, "es-AR", es)).toBe("—");
    expect(odds(0, "es-AR", es)).toBe("—");
  });
});

describe("una chance casi segura no se dice '1 en 1'", () => {
  it("1 sale siempre, y lo que redondearía a '1 en 1' va en porcentaje", () => {
    expect(odds(1, "es-AR", es)).toBe("siempre");
    expect(odds(0.977, "es-AR", es)).toBe("97,7%");
    expect(odds(0.9996, "es-AR", es)).toBe("99,9%");
    expect(odds(0.9, "es-AR", es)).toBe("1 en 1,1");
    expect(odds(0, "es-AR", es)).toBe("—");
    expect(odds(0.977, "en-US", en)).toBe("97.7%");
    expect(odds(1, "en-US", en)).toBe("always");
  });

  it("el porcentaje se redondea para abajo: nunca dice 100 si no es seguro, y no lleva un decimal de más", () => {
    expect(odds(1 - 1e-12, "es-AR", es)).toBe("99,9%");
    // 97,69 va a 97,6 y no a 97,7: para abajo, no al más cercano.
    expect(odds(0.9769, "es-AR", es)).toBe("97,6%");
    expect(odds(0.99, "es-AR", es)).toBe("99%");
    expect(odds(1.5, "es-AR", es)).toBe("siempre");
  });

  it("el corte está donde 'oddsN' empezaría a decir '1': pasado 0,952", () => {
    expect(odds(0.953, "es-AR", es)).toBe("95,3%");
    expect(odds(0.95, "es-AR", es)).toBe("1 en 1,1");
    for (const p of [0.5, 0.25, 0.1, 1 / 3912]) expect(odds(p, "es-AR", es)).toMatch(/^1 en /);
  });
});

/**
 * Los campos numéricos (hallazgo mágico, nivel de la Zona de Terror, runs y el hallazgo mágico de la ficha) no pelean con lo que
 * se escribe: antes cada tecla se acotaba, así que borrar el nivel de la Zona de Terror dejaba 1 y escribir "85" daba "185" → 99.
 * Ahora el texto queda como se escribe, cada número válido va (acotado) a la cuenta y el texto se acota al salir o con Enter.
 */
describe("los campos numéricos no pelean con lo que se escribe", () => {
  it("un campo vacío o sin número no es ningún valor: no cambia nada mientras se escribe", () => {
    for (const text of ["", "  ", "abc", "-", "."]) expect(parseNum(text, 1, 99), JSON.stringify(text)).toBeNull();
  });

  it("un número se redondea y se acota al rango", () => {
    expect(parseNum("85", 1, 99)).toBe(85);
    expect(parseNum(" 8 ", 1, 99)).toBe(8);
    expect(parseNum("185", 1, 99)).toBe(99);
    expect(parseNum("0", 1, 99)).toBe(1);
    expect(parseNum("12.6", 1, 1000)).toBe(13);
    expect(parseNum("-5", 0, 9999)).toBe(0);
    expect(parseNum("12000", 0, 9999)).toBe(9999);
    expect(parseNum("0", 0, 9999)).toBe(0);
  });

  /** El campo de los controles que lleva esa etiqueta, sin dibujar nada: sus props. */
  const field = (st: Partial<DropsState>, label: string, set: (p: Partial<DropsState>) => void = () => {}) => {
    let tree: ReactElement | undefined;
    const Probe = () => {
      tree = DropsControls({ st: { ...DEFAULT_STATE, ...st }, set, mode: "farm" }) as ReactElement;
      return null;
    };
    render(createElement(Probe));
    const found: ReactElement<NumFieldProps>[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (isValidElement<{ children?: unknown; label?: string }>(node)) {
        if (node.type === NumField && node.props.label === label) found.push(node as ReactElement<NumFieldProps>);
        walk(node.props.children);
      }
    };
    walk(tree);
    expect(found, label).toHaveLength(1);
    return found[0].props;
  };

  it("el hallazgo mágico y el nivel de la Zona de Terror usan el campo, con su rango, y pasan el número a la calculadora", () => {
    const calls: Partial<DropsState>[] = [];
    const mf = field({}, es.mf, (p) => void calls.push(p));
    expect([mf.value, mf.min, mf.max]).toEqual([300, 0, 9999]);
    mf.onChange(450);
    const tz = field({ tz: 90 }, es.tzLevel, (p) => void calls.push(p));
    expect([tz.value, tz.min, tz.max]).toEqual([90, 1, 99]);
    tz.onChange(85);
    expect(calls).toEqual([{ mf: 450 }, { tz: 85 }]);
  });
});

describe("un valor en blanco en la dirección", () => {
  it("'?mf=%20' deja el hallazgo mágico de siempre, no lo pone en cero", () => {
    expect(readState("?mf=%20").mf).toBe(DEFAULT_STATE.mf);
    expect(readState("?mf=%2050%20").mf).toBe(50);
  });

  it("ningún número en blanco cambia nada", () => {
    expect(readState("?mf=%20&p=%20&g=%20&d=%20&pd=%20&tz=%20&h=%20&n=%20&seed=%20")).toEqual(DEFAULT_STATE);
  });
});

describe("el buscador sin apóstrofes", () => {
  const english = (q: string) => searchItems(q).map((x) => x.name.en);

  it("'griswolds' y 'griswold’s' (con la comilla del celular) encuentran lo mismo que 'griswold's' y 'griswold'", () => {
    for (const q of ["griswolds", "griswold’s", "griswold's", "griswold", "GRISWOLD´S"]) {
      const names = english(q);
      expect(names.length, q).toBeGreaterThan(0);
      expect(names.every((n) => n.includes("Griswold")), q).toBe(true);
    }
  });

  it("'tal rashas' encuentra las piezas de Tal Rasha", () => {
    for (const q of ["tal rashas", "tal rasha’s", "tal rasha's", "tal rasha"]) {
      const names = english(q);
      expect(names.length, q).toBeGreaterThan(0);
      expect(names.every((n) => n.includes("Tal Rasha")), q).toBe(true);
    }
  });

  it("'maras', 'andariels' y 'gheeds', que la gente escribe sin apóstrofe", () => {
    expect(english("maras")).toContain("Mara's Kaleidoscope");
    expect(english("andariels")).toContain("Andariel's Visage");
    expect(english("gheeds")).toContain("Gheed's Fortune");
  });

  it("una búsqueda que es sólo comillas no busca nada", () => {
    expect(searchItems("’’")).toEqual([]);
  });
});

describe("el buscador en la página", () => {
  it("arranca con su ayuda y sin resultados abiertos", () => {
    const html = render(createElement(ItemPicker, { onPick: () => {} }));
    expect(html).toContain(`placeholder="${es.search}"`);
    expect(html).not.toContain("d2-dr-hits");
    expect(html).not.toContain(es.noHits);
  });

  it("los resultados están en una región viva que ya existe antes de escribir", () => {
    expect(render(createElement(PickerResults, { q: "", onPick: () => {} }))).toBe('<div class="d2-dr-results" aria-live="polite"></div>');
  });

  it("con resultados: la lista lleva nombre para el lector de pantalla y no hay aviso", () => {
    const html = render(createElement(PickerResults, { q: "ber", onPick: () => {} }));
    expect(html).toContain(`<ul class="d2-dr-hits" aria-label="${es.search}">`);
    expect(html).toContain("Runa Ber");
    expect(html).not.toContain(es.noHits);
  });

  it("con dos letras o más que no dan nada, lo dice", () => {
    const html = render(createElement(PickerResults, { q: "zzqqx", onPick: () => {} }));
    expect(html).toContain(es.noHits);
    expect(html).not.toContain("d2-dr-hits");
    expect(render(createElement(PickerResults, { q: "zzqqx", onPick: () => {} }), "en")).toContain(en.noHits);
  });

  it("con una sola letra todavía no busca, así que no avisa", () => {
    expect(render(createElement(PickerResults, { q: "z", onPick: () => {} }))).not.toContain(es.noHits);
    expect(render(createElement(PickerResults, { q: " ’ ", onPick: () => {} }))).not.toContain(es.noHits);
  });
});

describe("los textos de la calculadora", () => {
  it("el español trae tantas listas como el inglés, y las tres dificultades", () => {
    expect(es.about).toHaveLength(en.about.length);
    expect(en.diffs).toHaveLength(3);
    expect(es.diffs).toHaveLength(3);
  });

  it("el aviso de la búsqueda sin resultados está en los dos idiomas", () => {
    expect(en.noHits).toBe("Nothing by that name.");
    expect(es.noHits).toBe("No hay nada con ese nombre.");
  });
});

describe("el cofre del simulador cuenta en singular cuando hay uno", () => {
  it("español", () => {
    const es = D2R_COPY.es.drops;
    expect(es.simLede("1", "Mefisto")).toBe("1 run de Mefisto:");
    expect(es.simLede("50", "Mefisto")).toBe("50 runs de Mefisto:");
    expect([es.rares("1"), es.magics("1"), es.normals("1"), es.gold("1")]).toEqual(["1 raro", "1 mágico", "1 normal", "1 montón de oro"]);
    expect([es.rares("2"), es.magics("2"), es.normals("2"), es.gold("2")]).toEqual(["2 raros", "2 mágicos", "2 normales", "2 montones de oro"]);
  });

  it("inglés", () => {
    const en = D2R_COPY.en.drops;
    expect(en.simLede("1", "Mephisto")).toBe("1 run of Mephisto:");
    expect([en.rares("1"), en.gold("1")]).toEqual(["1 rare", "1 gold pile"]);
    expect([en.rares("3"), en.gold("3")]).toEqual(["3 rares", "3 gold piles"]);
  });
});
