// site/test/d2rDropsSimUi.test.ts
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropData } from "../src/d2r/drops/data";
import { PlaceSelect } from "../src/d2r/drops/DropLists";
import DropsSim from "../src/d2r/drops/DropsSim";
import { sourceKill } from "../src/d2r/drops/places";
import { simulateRuns, summarize, type Loot } from "../src/d2r/drops/simulate";
import { DEFAULT_STATE, MAX_RUNS, MAX_SEED, readState, toOpts, toSettings, writeState, type DropsState } from "../src/d2r/drops/state";
import NumField, { parseNum, type NumFieldProps } from "../src/d2r/drops/NumField";
import { Chips } from "../src/d2r/ui";
import { tr } from "../src/d2r/wiki";
import { LangContext } from "../src/i18n";

// `useDeferredValue` en el servidor devuelve el mismo valor, así que no se nota si el simulador lo usa. Acá se le puede fijar la
// copia atrasada (`lag.stale`) para ver qué sale de ella y qué del estado vivo, como pasa en el navegador mientras se escribe.
const lag = vi.hoisted(() => ({ stale: undefined as unknown }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useDeferredValue: (v: unknown) => (lag.stale !== undefined ? lag.stale : v) };
});
afterEach(() => {
  lag.stale = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));
const inEn = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "en", setLang: () => undefined } }, el));

describe("el simulador en la página", () => {
  const st = { ...DEFAULT_STATE, m: "sim" as const, place: { k: "s" as const, id: "mephisto" }, runs: 50 };

  it("antes de abrir el cofre muestra el botón y nada más", () => {
    const html = inEs(createElement(DropsSim, { st, set: () => undefined }));
    expect(html).toContain("Abrir el cofre");
    expect(html).not.toContain("runs de Mefisto");
  });

  it("con semilla, el mismo cofre cada vez", () => {
    const opened = { ...st, seed: 42 };
    const a = inEs(createElement(DropsSim, { st: opened, set: () => undefined }));
    const b = inEs(createElement(DropsSim, { st: opened, set: () => undefined }));
    expect(a).toBe(b);
    expect(a).toContain("50 runs de Mefisto");
    expect(a).toContain("montones de oro");
  });
});

// Lo que sigue va más allá de los dos tests del plan: qué se dibuja en el piso, los bordes de la página y lo que pasa al tocar.

const D = dropData();
/** Lo que React escribe en un texto: así se compara un nombre con el marcado. */
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
/** Lo que hay en el piso, en orden: el color, el nombre y cuántas veces salió (1 si no lleva cifra). */
const onGround = (html: string) =>
  [...html.matchAll(/<span class="d2-dr-loot is-(\w+)">([^<]*)(?:<small>×(\d+)<\/small>)?<\/span>/g)].map((m) => ({ tone: m[1], name: m[2], count: Number(m[3] ?? 1) }));
const page = (s: DropsState) => inEs(createElement(DropsSim, { st: s, set: () => undefined }));

type Props = { className?: string; children?: unknown; onClick?: () => unknown; onChange?: (v: unknown) => void; sourcesOnly?: boolean };
const findAll = (node: unknown, pred: (el: ReactElement<Props>) => boolean, out: ReactElement<Props>[] = []): ReactElement<Props>[] => {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, pred, out));
  else if (isValidElement<Props>(node)) {
    if (pred(node)) out.push(node);
    findAll(node.props.children, pred, out);
  }
  return out;
};
/**
 * Dibuja la página sin un DOM: se llama al componente adentro de un render (sus hooks lo piden), se lee el árbol de
 * elementos que devuelve y se dispara lo que tocaría quien la use. Devuelve el árbol y lo que le pasó a `set`.
 */
const mount = (state: DropsState) => {
  const calls: Partial<DropsState>[] = [];
  let tree: ReactElement<Props> | undefined;
  const Probe = () => {
    tree = DropsSim({ st: state, set: (p) => void calls.push(p) }) as ReactElement<Props>;
    return null;
  };
  inEs(createElement(Probe));
  return { tree: tree!, calls };
};

describe("el cofre abierto", () => {
  const st: DropsState = { ...DEFAULT_STATE, m: "sim", place: { k: "s", id: "mephisto" }, runs: 50 };
  /** El cofre que la página tiene que dibujar, sacado directo del motor. */
  const chest = (s: DropsState) => {
    const src = D.sourceById.get((s.place as { id: string }).id)!;
    return summarize(D, simulateRuns(D, sourceKill(D, src, s.pdiff, toOpts(s))!, toSettings(s), s.runs, s.seed));
  };
  const nameOf = (l: Loot) => (l.id ? (l.q === "set" ? D.setById : D.uniqueById).get(l.id)!.n.es : D.bases[l.code].n.es);

  it("con otra semilla, otro cofre", () => {
    expect(page({ ...st, seed: 42 })).not.toBe(page({ ...st, seed: 43 }));
  });

  it("cerrado no ofrece copiar el enlace; abierto pasa a «Abrir otro» y sí", () => {
    const closed = page(st);
    expect(closed).not.toContain("Copiar enlace");
    expect(closed).not.toContain("Abrir otro");
    const opened = page({ ...st, seed: 42 });
    expect(opened).toContain("Abrir otro");
    expect(opened).toContain("Copiar enlace");
    expect(opened).not.toContain("Abrir el cofre");
  });

  it("el piso lista lo notable con el nombre de cada único y pieza, su color y cuántas veces salió", () => {
    const big: DropsState = { ...st, runs: 1000, seed: 42 };
    const html = page(big);
    const ground = onGround(html);
    const expected = chest(big).notable.map(({ loot, count }) => ({ tone: D.bases[loot.code].t === "rune" ? "rune" : loot.q, name: esc(nameOf(loot)), count }));
    // Únicos, piezas de conjunto y runas: los tres colores del piso salen en un cofre de mil runs.
    expect(new Set(ground.map((g) => g.tone))).toEqual(new Set(["unique", "set", "rune"]));
    // Un único sale con su nombre y no con el de su base (el motor lo trae con el código de la base y su id).
    expect(ground).toEqual(expected);
    expect(ground.some((g) => g.count > 1)).toBe(true);
    // Lo que sale una sola vez no lleva «×1».
    expect(html).not.toContain("×1<");
  });

  it("el piso va de lo más buscado a lo menos: la runa más alta primero y las runas bajas al final", () => {
    // La Condesa de Infierno en mil runs: suelta Ist (la más alta que da), únicos, piezas y todas las runas de abajo.
    const countess: DropsState = { ...st, place: { k: "s", id: "the-countess" }, runs: 1000, seed: 42 };
    const ground = onGround(page(countess));
    const shape = ground.map((g) => g.tone).filter((tone, i, all) => tone !== all[i - 1]);
    expect(shape).toEqual(["rune", "unique", "set", "rune"]);
    expect(ground[0].name).toBe("Runa Ist");
    expect(ground[ground.length - 1].name).toBe("Runa El");
  });

  it("debajo del piso van los raros, los mágicos, los normales y el oro, con los separadores del idioma", () => {
    const big: DropsState = { ...st, runs: 1000, seed: 42 };
    const sum = chest(big);
    const n = (x: number) => x.toLocaleString("es-AR");
    expect(/<p class="d2-dr-sum">(.*?)<\/p>/.exec(page(big))![1]).toBe(
      `<span class="is-rare">${n(sum.rare)} raros</span><span class="is-magic">${n(sum.magic)} mágicos</span><span>${n(sum.normal)} normales</span><span>${n(sum.gold)} montones de oro</span>`,
    );
  });

  it("dice cuántas runs y de quién, con el número escrito como en el idioma", () => {
    const big: DropsState = { ...st, runs: 1000, seed: 42 };
    expect(page(big)).toContain("1.000 runs de Mefisto:");
    expect(inEn(createElement(DropsSim, { st: big, set: () => undefined }))).toContain("1,000 runs of Mephisto:");
  });

  it("si no cayó nada notable, lo dice", () => {
    // Una sola run de un superúnico de Normal casi nunca trae algo notable: se toma la primera semilla que no lo trae.
    const one: DropsState = { ...st, place: { k: "s", id: "bishibosh" }, pdiff: 0, runs: 1 };
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((s) => chest({ ...one, seed: s }).notable.length === 0);
    expect(seed).toBeDefined();
    const html = page({ ...one, seed: seed! });
    expect(html).toContain("Esta vez nada especial. Abrí otro.");
    expect(html).not.toContain("d2-dr-loot");
  });

  it("en inglés se lee en inglés, con los nombres del juego en inglés", () => {
    const opened: DropsState = { ...st, seed: 42 };
    const html = inEn(createElement(DropsSim, { st: opened, set: () => undefined }));
    expect(html).toContain("50 runs of Mephisto:");
    expect(html).toContain("Open another");
    expect(html).toContain("gold piles");
    const named = chest(opened).notable.find((x) => x.loot.id);
    // Si la semilla no trajera ningún único ni pieza, el test tiene que decirlo con una aserción y no con un error de tipos.
    expect(named, "el cofre de la semilla 42 trae algún único o alguna pieza").toBeDefined();
    const first = named!.loot;
    expect(html).toContain(esc((first.q === "set" ? D.setById : D.uniqueById).get(first.id!)!.n.en));
  });
});

describe("los bordes del simulador", () => {
  const base: DropsState = { ...DEFAULT_STATE, m: "sim", runs: 20, seed: 7 };

  it("sin lugar (o con un área, que llega de otro modo) pide elegir un jefe y no ofrece abrir nada", () => {
    for (const place of [null, { k: "a" as const, id: 12, cat: "champ" as const }]) {
      const html = page({ ...base, place });
      expect(html, JSON.stringify(place)).toContain("Elegí un jefe o superúnico y abrí el cofre.");
      expect(html, JSON.stringify(place)).not.toContain("d2-dr-open-btn");
      expect(html, JSON.stringify(place)).not.toContain("runs de");
    }
  });

  it("un jefe que en esa dificultad no suelta nada lo avisa, en vez de pedir que elijas uno", () => {
    // El Clon de Diablo sólo suelta en Infierno.
    const clone = { ...base, place: { k: "s" as const, id: "diablo-clone" } };
    for (const pdiff of [0, 1] as const) {
      const html = page({ ...clone, pdiff });
      expect(html).toContain("Con estas opciones acá no cae nada.");
      // El pedido del simulador es la frase entera; el selector trae aparte su propia opción «Elegí un jefe o superúnico».
      expect(html).not.toContain("Elegí un jefe o superúnico y abrí el cofre.");
      expect(html).not.toContain("d2-dr-open-btn");
    }
    expect(page({ ...clone, pdiff: 2 })).toContain("d2-dr-open-btn");
  });

  it("el selector del simulador sólo ofrece jefes y superúnicos, y su texto no habla de áreas", () => {
    const html = page({ ...base, place: null });
    expect(html.match(/<optgroup/g)).toHaveLength(1);
    // Sin lugar elegido, la opción del texto es la que sale seleccionada.
    expect(html).toContain('<option value="" disabled="" selected="">Elegí un jefe o superúnico</option>');
    expect(html).not.toContain("o un área");
    const en = inEn(createElement(DropsSim, { st: { ...base, place: null }, set: () => undefined }));
    expect(en).toContain('<option value="" disabled="" selected="">Choose a boss or super unique</option>');
    expect(en).not.toContain("or an area");
  });

  it("todos los jefes y superúnicos abren su cofre en las tres dificultades, con el nombre de cada cosa que cae", () => {
    for (const src of D.sources) {
      for (const pdiff of [0, 1, 2] as const) {
        const s: DropsState = { ...base, place: { k: "s", id: src.id }, pdiff };
        const html = page(s);
        const label = `${src.id} ${pdiff}`;
        if (!sourceKill(D, src, pdiff, toOpts(s))) {
          expect(html, label).toContain("Con estas opciones acá no cae nada.");
          continue;
        }
        expect(html, label).toContain(`20 runs de ${esc(tr(src.n, "es"))}:`);
        // Una base o un único sin nombre dejaría una etiqueta vacía en el piso.
        for (const g of onGround(html)) expect(g.name.trim(), label).not.toBe("");
      }
    }
  });
});

describe("las regiones vivas", () => {
  const st: DropsState = { ...DEFAULT_STATE, m: "sim", place: { k: "s", id: "mephisto" }, runs: 50 };

  it("el resumen del cofre está en una región viva que ya existe antes de abrirlo", () => {
    // Un lector de pantalla no anuncia una región que nace con su contenido: tiene que estar antes, vacía.
    const closed = page(st);
    expect(closed.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(closed).toContain('<div aria-live="polite"></div>');
    const opened = page({ ...st, seed: 42 });
    expect(opened.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(opened).toContain('<div aria-live="polite"><p class="d2-dr-sum">');
    // La lista del piso (cientos de etiquetas) no se anuncia entera: la región lleva sólo el resumen.
    const region = /<div aria-live="polite">(.*?)<\/div>/.exec(opened)![1];
    expect(region).not.toContain("d2-dr-loot");
    expect(region).toContain("montones de oro");
  });

  it("sin jefe elegido no hay nada que anunciar", () => {
    expect(page({ ...st, place: null })).not.toContain("aria-live");
  });
});

describe("lo que hace el simulador al tocar", () => {
  const st: DropsState = { ...DEFAULT_STATE, m: "sim", place: { k: "s", id: "mephisto" }, runs: 50 };
  const openButton = (tree: ReactElement<Props>) => {
    const open = findAll(tree, (el) => el.props.className === "d2-dr-open-btn");
    expect(open).toHaveLength(1);
    return open[0];
  };

  it("abrir el cofre elige una semilla que no es cero y que el enlace sabe leer", () => {
    const { tree, calls } = mount(st);
    const open = openButton(tree);
    open.props.onClick!();
    open.props.onClick!();
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(Object.keys(c)).toEqual(["seed"]);
      const seed = c.seed!;
      expect(Number.isInteger(seed)).toBe(true);
      // El cero es «sin abrir».
      expect(seed).toBeGreaterThan(0);
      // El enlace que se copia abre ese mismo cofre.
      expect(readState(writeState({ ...st, seed })).seed).toBe(seed);
    }
  });

  it("la semilla va de 1 al tope del enlace, en los dos extremos del azar", () => {
    const { tree, calls } = mount(st);
    const open = openButton(tree);
    const random = vi.spyOn(Math, "random");
    for (const r of [0, 0.9999999999, 1 - Number.EPSILON / 2]) {
      random.mockReturnValue(r);
      open.props.onClick!();
    }
    expect(calls).toEqual([{ seed: 1 }, { seed: MAX_SEED }, { seed: MAX_SEED }]);
  });

  it("cambiar el lugar, la dificultad o las runs cierra el cofre; el campo de runs va de 1 al tope", () => {
    const { tree, calls } = mount({ ...st, seed: 42 });
    findAll(tree, (el) => el.type === PlaceSelect)[0].props.onChange!({ k: "s", id: "baal" });
    findAll(tree, (el) => el.type === Chips)[0].props.onChange!(1);
    // El campo no pelea con lo que se escribe (d2rDropsControls.test.ts): pasa números ya acotados a su rango ("5000" da el
    // tope, "0" da 1, "12.6" da 13 y uno vacío no pasa nada), y el simulador cierra el cofre con cada uno distinto.
    const runs = findAll(tree, (el) => el.type === NumField)[0] as ReactElement<NumFieldProps>;
    expect([runs.props.min, runs.props.max]).toEqual([1, MAX_RUNS]);
    for (const text of ["250", "5000", "0", "", "abc", "12.6"]) {
      const v = parseNum(text, runs.props.min, runs.props.max);
      if (v !== null) runs.props.onChange(v);
    }
    expect(calls).toEqual([
      { place: { k: "s", id: "baal" }, seed: 0 },
      { pdiff: 1, seed: 0 },
      { runs: 250, seed: 0 },
      { runs: MAX_RUNS, seed: 0 },
      { runs: 1, seed: 0 },
      { runs: 13, seed: 0 },
    ]);
  });

  it("tocar la dificultad que ya está elegida no cierra el cofre", () => {
    // `Chips` avisa también cuando se toca la opción activa.
    const { tree, calls } = mount({ ...st, pdiff: 2, seed: 42 });
    const diff = findAll(tree, (el) => el.type === Chips)[0];
    diff.props.onChange!(2);
    expect(calls).toEqual([]);
    diff.props.onChange!(0);
    expect(calls).toEqual([{ pdiff: 0, seed: 0 }]);
  });

  it("dejar las runs como estaban (o escribir de más sobre el tope) tampoco cierra el cofre", () => {
    const same = mount({ ...st, runs: 50, seed: 42 });
    findAll(same.tree, (el) => el.type === NumField)[0].props.onChange!(50);
    expect(same.calls).toEqual([]);
    // De más sobre el tope da el tope, que es el número que ya estaba.
    const top = mount({ ...st, runs: MAX_RUNS, seed: 42 });
    findAll(top.tree, (el) => el.type === NumField)[0].props.onChange!(parseNum(`${MAX_RUNS}0`, 1, MAX_RUNS));
    expect(top.calls).toEqual([]);
  });

  it("el selector de lugar es el de jefes y superúnicos: recibe `sourcesOnly`", () => {
    const select = findAll(mount(st).tree, (el) => el.type === PlaceSelect);
    expect(select).toHaveLength(1);
    expect(select[0].props.sourcesOnly).toBe(true);
  });

  it("el campo de runs llega hasta el tope compartido", () => {
    expect(page(st)).toContain(`min="1" max="${MAX_RUNS}"`);
  });
});

describe("copiar el enlace", () => {
  const url = "https://vestigo.test/es/d2r/drops?m=sim&src=s.mephisto&seed=42";
  const opened: DropsState = { ...DEFAULT_STATE, m: "sim", place: { k: "s", id: "mephisto" }, runs: 50, seed: 42 };
  /** El botón «Copiar enlace» del cofre abierto. */
  const shareButton = () => {
    const found = findAll(mount(opened).tree, (el) => el.props.className === "d2-chip");
    expect(found).toHaveLength(1);
    return found[0];
  };
  /** Toca el botón `times` veces con un `window` y un portapapeles de mentira; devuelve lo que se escribió, se preguntó y se programó. */
  const tap = async (clipboard: unknown, times = 1) => {
    const button = shareButton();
    const log = { prompts: [] as unknown[][], delays: [] as number[], cleared: [] as unknown[] };
    vi.stubGlobal("navigator", { clipboard });
    vi.stubGlobal("window", {
      location: { href: url },
      prompt: (...args: unknown[]) => void log.prompts.push(args),
      setTimeout: (_fn: unknown, ms: number) => log.delays.push(ms),
      clearTimeout: (id: unknown) => void log.cleared.push(id),
    });
    for (let i = 0; i < times; i++) await button.props.onClick!();
    return log;
  };

  it("copia la dirección de la página y no pregunta nada", async () => {
    const written: string[] = [];
    const log = await tap({ writeText: async (text: string) => void written.push(text) });
    expect(written).toEqual([url]);
    expect(log.prompts).toEqual([]);
    // El aviso «Enlace copiado» dura 1,8 s.
    expect(log.delays).toEqual([1800]);
  });

  it("un segundo copiado apaga el reloj del primero: el aviso no se corta antes de tiempo", async () => {
    const log = await tap({ writeText: async () => undefined }, 2);
    expect(log.delays).toEqual([1800, 1800]);
    // `setTimeout` de mentira devuelve 1, 2…: el reloj del primer toque es el 1.
    expect(log.cleared.at(-1)).toBe(1);
  });

  it("si el navegador no deja escribir en el portapapeles, ofrece el enlace para copiarlo a mano", async () => {
    const log = await tap({
      writeText: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    expect(log.prompts).toEqual([["Copiar enlace", url]]);
    // Sin copia no hay aviso de «Enlace copiado» ni reloj.
    expect(log.delays).toEqual([]);
  });

  it("sin portapapeles (un navegador viejo o una página sin https), también", async () => {
    const log = await tap(undefined);
    expect(log.prompts).toEqual([["Copiar enlace", url]]);
    expect(log.delays).toEqual([]);
  });
});

describe("los controles responden al toque y el cofre va una vuelta atrás", () => {
  const st: DropsState = { ...DEFAULT_STATE, m: "sim", place: { k: "s", id: "mephisto" }, runs: 50 };

  it("mientras la copia atrasada no alcanza, los controles muestran lo nuevo y el cofre, lo de antes", () => {
    // Recién se tocó «Abrir» con 300 runs: el estado vivo ya lo trae, la copia atrasada todavía lo tiene cerrado y con 50.
    lag.stale = { ...st, runs: 50, seed: 0 };
    const html = page({ ...st, runs: 300, seed: 42 });
    expect(html).toContain('value="300"');
    expect(html).toContain("Abrir otro");
    expect(html).not.toContain("runs de Mefisto");
    expect(html).not.toContain("d2-dr-ground");
    // Cuando la copia alcanza, sale el cofre.
    lag.stale = undefined;
    expect(page({ ...st, runs: 300, seed: 42 })).toContain("300 runs de Mefisto:");
  });

  it("y al revés: el selector y la dificultad ya son los nuevos y el cofre sigue siendo el del viejo hasta que alcanza", () => {
    lag.stale = { ...st, seed: 42 };
    const html = page({ ...st, place: { k: "s", id: "baal" }, pdiff: 0, seed: 0 });
    expect(html).toContain('<option value="s.baal" selected="">Baal</option>');
    expect(html).toContain('<button type="button" class="d2-chip is-on" aria-pressed="true">Normal</button>');
    expect(html).toContain("50 runs de Mefisto:");
    expect(html).toContain("Abrir el cofre");
  });

  it("el texto del cofre cuenta las runs del cofre que se ve, no las que ya se escribieron en el campo", () => {
    lag.stale = { ...st, runs: 50, seed: 42 };
    const html = page({ ...st, runs: 300, seed: 42 });
    expect(html).toContain('value="300"');
    expect(html).toContain("50 runs de Mefisto:");
    expect(html).not.toContain("300 runs");
  });
});

describe("los topes que comparten el enlace y el simulador", () => {
  it("la dirección acota las runs y la semilla a lo mismo que usa el simulador", () => {
    expect([MAX_RUNS, MAX_SEED]).toEqual([1000, 2147483646]);
    expect(readState(`?n=${MAX_RUNS + 1}`).runs).toBe(MAX_RUNS);
    expect(readState(`?n=${MAX_RUNS}`).runs).toBe(MAX_RUNS);
    expect(readState(`?seed=${MAX_SEED + 1}`).seed).toBe(MAX_SEED);
    // La semilla más alta que sortea el botón vuelve intacta de la dirección.
    expect(readState(writeState({ ...DEFAULT_STATE, seed: MAX_SEED })).seed).toBe(MAX_SEED);
  });
});
