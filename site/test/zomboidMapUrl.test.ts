import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  LAYERS,
  MAP_H,
  MAP_W,
  MAX_ZOOM,
  MIN_ZOOM,
  NEAR,
  mergeMapQuery,
  readMapUrl,
  writeMapUrl,
  type MapState,
} from "../src/zomboid/map/url";

/**
 * La dirección del Mapa de Project Zomboid (2026-09-30): dónde está el mapa, con qué zoom, qué capas y qué base. Es lo
 * que viaja en un link copiado, así que tiene que ir y volver sin perder nada, entender los links que ya circulan en la
 * comunidad y no dejar que un número roto mande el mapa afuera del mundo.
 */
const state = (s: Partial<MapState>): MapState => ({ ...DEFAULT_VIEW, ...s });

describe("writeMapUrl", () => {
  it("escribe los nuestros: ?x=&y=&z=, y las capas y la base sólo si hay", () => {
    expect(writeMapUrl(state({ x: 10623, y: 9685, z: 4 }))).toBe("?x=10623&y=9685&z=4");
    expect(writeMapUrl(state({ x: 1, y: 2, z: 2.5, layers: ["vehiculos", "escondites"], base: "paper" }))).toBe(
      "?x=1&y=2&z=2.5&capas=vehiculos,escondites&base=paper",
    );
  });

  it("redondea: casillas enteras y el zoom con dos decimales", () => {
    expect(writeMapUrl(state({ x: 10623.6, y: 9685.2, z: 3.14159 }))).toBe("?x=10624&y=9685&z=3.14");
  });

  it("nunca escribe NaN: un estado roto vuelve al valor de siempre, y el infinito al borde", () => {
    expect(writeMapUrl(state({ x: NaN, y: NaN, z: NaN }))).toBe("?x=10600&y=9600&z=2");
    expect(writeMapUrl(state({ x: 5, y: NaN, z: 3 }))).toBe("?x=5&y=9600&z=3");
    expect(writeMapUrl(state({ x: Infinity, y: -Infinity, z: Infinity }))).toBe(`?x=${MAP_W}&y=0&z=${MAX_ZOOM}`);
    for (const url of [writeMapUrl(state({ x: NaN, y: NaN, z: NaN }))]) expect(url).not.toMatch(/NaN/);
  });
});

describe("readMapUrl", () => {
  it("sin nada del mapa en la dirección, null (el visor abre en Muldraugh)", () => {
    expect(readMapUrl("", "")).toBeNull();
    expect(readMapUrl("?utm_source=x", "#arriba")).toBeNull();
    expect(DEFAULT_VIEW).toEqual({ x: 10600, y: 9600, z: 2, layers: [], base: "sat", prof: null, building: null });
  });

  it("ida y vuelta: lo que escribe lo lee igual", () => {
    for (const s of [
      state({ x: 10623, y: 9685, z: 4 }),
      state({ x: 0, y: 0, z: MIN_ZOOM, base: "paper" }),
      state({ x: MAP_W, y: MAP_H, z: MAX_ZOOM, layers: ["vehiculos", "sotanos", "escondites"] }),
      state({ x: 13077, y: 2238, z: 2.25, layers: ["zombis"], base: "paper" }),
    ]) {
      expect(readMapUrl(writeMapUrl(s), "")).toEqual(s);
    }
  });

  it("acepta ?x=&y=&zoom= (el formato de otros visores)", () => {
    // zoom=3 son tres píxeles por casilla: 4 + log2(3), con dos decimales como todo zoom que escribimos.
    expect(readMapUrl("?x=11701&y=6898&zoom=3", "")).toEqual(state({ x: 11701, y: 6898, z: 5.58 }));
  });

  it("acepta el hash de la comunidad #XxYxZ, con el zoom de otro visor como vista de calle", () => {
    // El tercer número es el zoom de otro visor, con otra escala (el nuestro nunca escribió un hash): el lugar es lo que
    // importa, y se abre de cerca (zoom 5, dos píxeles por casilla: a 4 un edificio mide lo que un punto). Chico o grande.
    expect(readMapUrl("", "#10866x9982x2533")).toEqual(state({ x: 10866, y: 9982, z: NEAR }));
    expect(readMapUrl("", "#10866x9982x3")).toEqual(state({ x: 10866, y: 9982, z: NEAR }));
    expect(readMapUrl("", "#10866x9982x8")).toEqual(state({ x: 10866, y: 9982, z: NEAR }));
    // Sin zoom, el de siempre.
    expect(readMapUrl("", "#10866x9982")).toEqual(state({ x: 10866, y: 9982 }));
  });

  it("no inventa formatos: #v2;… y ?goto= no dicen nada del mapa (no hay link de ningún visor que los use)", () => {
    expect(readMapUrl("", "#v2;x=10791;y=9953;z=0")).toBeNull();
    expect(readMapUrl("?goto=10791,9953", "")).toBeNull();
  });

  it("?x=&y=&z=0&zoom=16 (pzmap2dzi): `z` es el piso, no el zoom, y `zoom` son los píxeles por casilla", () => {
    // Nuestro zoom es 2^(z−4) píxeles por casilla: zoom=16 son 2^4 → z 8, recortado al máximo del visor.
    expect(readMapUrl("?x=10866&y=9982&z=0&zoom=16", "")).toEqual(state({ x: 10866, y: 9982, z: MAX_ZOOM }));
    expect(readMapUrl("?x=10866&y=9982&zoom=16", "")).toEqual(state({ x: 10866, y: 9982, z: MAX_ZOOM }));
    // zoom=1 es un píxel por casilla: nuestro zoom 4.
    expect(readMapUrl("?x=10866&y=9982&z=0&zoom=1", "")).toEqual(state({ x: 10866, y: 9982, z: 4 }));
    expect(readMapUrl("?x=10866&y=9982&z=0&zoom=2", "")).toEqual(state({ x: 10866, y: 9982, z: 5 }));
    expect(readMapUrl("?x=10866&y=9982&zoom=0.5", "")).toEqual(state({ x: 10866, y: 9982, z: 3 }));
    // Con `zoom`, el `z` sigue siendo el piso: nunca se lee como zoom.
    expect(readMapUrl("?x=10866&y=9982&z=3&zoom=1", "")).toEqual(state({ x: 10866, y: 9982, z: 4 }));
    expect(readMapUrl("?x=10866&y=9982&z=-1&zoom=2", "")).toEqual(state({ x: 10866, y: 9982, z: 5 }));
  });

  it("un link de otro visor sin zoom que se entienda se abre a la escala de la calle (5), no más lejos", () => {
    expect(NEAR).toBe(5);
    for (const zoom of ["abc", "0", "-3", "0x10", "Infinity"])
      expect(readMapUrl(`?x=10866&y=9982&z=0&zoom=${zoom}`, ""), zoom).toEqual(state({ x: 10866, y: 9982, z: NEAR }));
    // Un `zoom=` vacío no cuenta: el link es de los nuestros.
    expect(readMapUrl("?x=10866&y=9982&z=3&zoom=", "")).toEqual(state({ x: 10866, y: 9982, z: 3 }));
  });

  it("`z` solo, sin `zoom`, sigue siendo el zoom de los nuestros", () => {
    expect(readMapUrl("?x=10866&y=9982&z=3", "")).toEqual(state({ x: 10866, y: 9982, z: 3 }));
    expect(readMapUrl("?x=10866&y=9982&z=0", "")).toEqual(state({ x: 10866, y: 9982, z: 0 }));
    expect(readMapUrl("?x=10866&y=9982&z=5.5", "")).toEqual(state({ x: 10866, y: 9982, z: 5.5 }));
  });

  it("al reescribir un link de otro visor queda en el nuestro, con el zoom que se entendió", () => {
    const at = readMapUrl("?x=10866&y=9982&z=0&zoom=16", "")!;
    expect(writeMapUrl(at)).toBe("?x=10866&y=9982&z=6");
  });

  it("los nuestros mandan sobre el hash", () => {
    expect(readMapUrl("?x=100&y=200&z=1", "#10866x9982x2")).toEqual(state({ x: 100, y: 200, z: 1 }));
  });

  it("recorta al mapa lo que se sale: casillas afuera del mundo y zooms que no existen", () => {
    expect(readMapUrl("?x=-50&y=99999&z=40", "")).toEqual(state({ x: 0, y: MAP_H, z: MAX_ZOOM }));
    expect(readMapUrl("?x=99999&y=-1&z=-9", "")).toEqual(state({ x: MAP_W, y: 0, z: MIN_ZOOM }));
    expect(readMapUrl("", "#-5x-5x1")).toEqual(state({ x: 0, y: 0, z: NEAR }));
  });

  it("un número roto no rompe el link: se usa el valor de siempre para esa parte", () => {
    expect(readMapUrl("?x=abc&y=abc&z=2", "")).toBeNull();
    expect(readMapUrl("?x=10000&y=9000&z=zz", "")).toEqual(state({ x: 10000, y: 9000, z: DEFAULT_VIEW.z }));
    expect(readMapUrl("?x=10000&y=9000&z=", "")).toEqual(state({ x: 10000, y: 9000 }));
  });

  it("una `x` o una `y` sola toma el valor de siempre para la que falta (el link no se pierde)", () => {
    // Sin `z` ni `zoom` no es un link nuestro: abre en la calle.
    expect(readMapUrl("?x=10000", "")).toEqual(state({ x: 10000, z: NEAR }));
    expect(readMapUrl("?y=9000", "")).toEqual(state({ y: 9000, z: NEAR }));
    expect(readMapUrl("?x=10000&y=abc&z=4", "")).toEqual(state({ x: 10000, z: 4 }));
    expect(readMapUrl("?x=-50&zoom=1", "")).toEqual(state({ x: 0, z: 4 }));
  });

  it("?x=&y= sin `z` ni `zoom` (a mano o de otro lado) abre en la calle; con `z` roto o vacío, el zoom de siempre", () => {
    expect(readMapUrl("?x=10866&y=9982", "")).toEqual(state({ x: 10866, y: 9982, z: NEAR }));
    expect(readMapUrl("?x=10866&y=9982&capas=zombis", "")).toEqual(state({ x: 10866, y: 9982, z: NEAR, layers: ["zombis"] }));
    expect(readMapUrl("?x=10866&y=9982&z=", "")).toEqual(state({ x: 10866, y: 9982 }));
    expect(readMapUrl("?x=10866&y=9982&z=zz", "")).toEqual(state({ x: 10866, y: 9982 }));
  });

  it("sólo números decimales: hex, exponente y demás se toman como rotos", () => {
    expect(readMapUrl("?x=0x10&y=0x20", "")).toBeNull();
    expect(readMapUrl("?x=1e3&y=1e3", "")).toBeNull();
    expect(readMapUrl("?x=0x10&y=500", "")).toEqual(state({ y: 500, z: NEAR }));
    expect(readMapUrl("?x=1&y=1&z=0x3", "")).toEqual(state({ x: 1, y: 1 }));
    expect(readMapUrl("?x=Infinity&y=500", "")).toEqual(state({ y: 500, z: NEAR }));
    // Los decimales sí: el zoom va con fracción, y los espacios de los costados no molestan.
    expect(readMapUrl("?x=10.5&y=%209600%20&z=2.25", "")).toEqual(state({ x: 11, z: 2.25 }));
  });

  it("capas y base solas abren en Muldraugh con esas capas", () => {
    expect(readMapUrl("?capas=vehiculos", "")).toEqual(state({ layers: ["vehiculos"] }));
    expect(readMapUrl("?base=papel", "")).toEqual(state({ base: "paper" }));
    expect(readMapUrl("?base=paper", "")).toEqual(state({ base: "paper" }));
    // Sin importar mayúsculas, como las capas.
    expect(readMapUrl("?base=PAPER", "")).toEqual(state({ base: "paper" }));
    expect(readMapUrl("?base=Papel", "")).toEqual(state({ base: "paper" }));
    expect(readMapUrl("?x=1&y=1&base=luna", "")).toEqual(state({ x: 1, y: 1, z: NEAR }));
  });

  it("las capas se limpian: minúsculas, sin repetidas ni basura, y `layers=` también vale", () => {
    expect(readMapUrl("?capas=Vehiculos,,escondites,vehiculos,<script>,a b", "")!.layers).toEqual(["vehiculos", "escondites"]);
    expect(readMapUrl("?layers=zombis", "")!.layers).toEqual(["zombis"]);
  });

  it("sólo quedan las capas que existen, en el orden de la leyenda (el link no cambia según el orden en que se prendieron)", () => {
    expect(LAYERS).toEqual([
      "vehiculos",
      "recoleccion",
      "animales",
      "sotanos",
      "zombis",
      "densidad",
      "historias",
      "botin",
      "edificios",
      "apariciones",
      "escondites",
    ]);
    expect(readMapUrl("?capas=escondites,luna,sotanos,c1,vehiculos", "")!.layers).toEqual(["vehiculos", "sotanos", "escondites"]);
    // Una dirección con sólo capas que no existen no dice nada del mapa.
    expect(readMapUrl(`?capas=${Array.from({ length: 50 }, (_, i) => `c${i}`).join(",")}`, "")).toBeNull();
    expect(writeMapUrl(state({ layers: ["escondites", "vehiculos"] }))).toContain("&capas=vehiculos,escondites");
  });

  it("entiende los nombres en inglés de las capas (un link armado en la página en inglés)", () => {
    expect(readMapUrl("?layers=stashes,vehicles,forage,animals,basements,zombies,density,stories,loot,buildings,spawns", "")!.layers).toEqual(LAYERS);
  });

  it("la densidad también entra con sus nombres en inglés", () => {
    expect(readMapUrl("?layers=heatmap", "")!.layers).toEqual(["densidad"]);
    expect(writeMapUrl(state({ layers: ["densidad", "zombis"] }))).toContain("&capas=zombis,densidad");
  });

  it("la profesión de los puntos de aparición viaja en `profesion=`, sólo con esa capa prendida", () => {
    const s = state({ x: 10600, y: 9600, z: 3, layers: ["apariciones"], prof: "mechanic" });
    expect(writeMapUrl(s)).toBe("?x=10600&y=9600&z=3&capas=apariciones&profesion=mechanic");
    expect(readMapUrl(writeMapUrl(s), "")).toEqual(s);
    // Sin la capa, la profesión no dice nada: ni se escribe ni se lee.
    expect(writeMapUrl(state({ prof: "mechanic" }))).toBe("?x=10600&y=9600&z=2");
    expect(readMapUrl("?x=1&y=1&profesion=mechanic", "")!.prof).toBeNull();
    // `profession=` también, y la basura no pasa.
    expect(readMapUrl("?capas=apariciones&profession=Fishing-Guide", "")!.prof).toBe("fishing-guide");
    expect(readMapUrl("?capas=apariciones&profesion=<b>", "")!.prof).toBeNull();
  });

  it("sólo las profesiones que existen: un slug inventado no filtra ni queda en el link", () => {
    for (const p of ["astronaut", "mechanics", "doctor-who", "custom"]) {
      const s = readMapUrl(`?x=1&y=1&capas=apariciones&profesion=${p}`, "")!;
      expect(s.prof, p).toBeNull();
      expect(writeMapUrl(s), p).not.toContain("profesion=");
    }
    expect(readMapUrl("?x=1&y=1&capas=apariciones&profesion=doctor", "")!.prof).toBe("doctor");
    expect(writeMapUrl(state({ layers: ["apariciones"], prof: "astronaut" }))).not.toContain("profesion=");
  });
});

describe("el edificio abierto (Task 4)", () => {
  it("viaja en `edificio=` con el id del juego, ida y vuelta", () => {
    const s = state({ x: 10628, y: 9695, z: 5, building: "41_37_45" });
    expect(writeMapUrl(s)).toBe("?x=10628&y=9695&z=5&edificio=41_37_45");
    expect(readMapUrl(writeMapUrl(s), "")).toEqual(s);
    // Solo, sin lugar: abre en Muldraugh y el visor va hasta el edificio.
    expect(readMapUrl("?edificio=41_37_45", "")).toEqual(state({ building: "41_37_45" }));
    expect(readMapUrl("?building=41_37_45", "")!.building).toBe("41_37_45");
  });

  it("un id que no tiene la forma del juego no pasa", () => {
    for (const b of ["", "knoxbank", "41_37", "41_37_45_1", "<b>", "-1_2_3"]) {
      expect(readMapUrl(`?x=1&y=1&edificio=${encodeURIComponent(b)}`, "")!.building, b).toBeNull();
    }
    expect(writeMapUrl(state({ building: "nada" }))).not.toContain("edificio=");
  });
});

describe("mergeMapQuery: lo que no es del mapa queda en la dirección", () => {
  it("reemplaza lo del mapa y deja lo demás, después", () => {
    const s = state({ x: 5, y: 6, z: 3, layers: ["zombis"] });
    expect(mergeMapQuery("?utm_source=x&x=1&y=2&z=4&capas=botin&ref=abc", s)).toBe("?x=5&y=6&z=3&capas=zombis&utm_source=x&ref=abc");
    expect(mergeMapQuery("", s)).toBe(writeMapUrl(s));
  });

  it("borra también los nombres de otros visores y los viejos, para que no se lean dos veces", () => {
    const s = state({ x: 5, y: 6, z: 3 });
    expect(mergeMapQuery("?zoom=16&layers=stashes&profession=doctor&building=1_2_3&base=paper&lang=es", s)).toBe("?x=5&y=6&z=3&lang=es");
    expect(mergeMapQuery("?edificio=1_2_3", state({ building: null }))).toBe(writeMapUrl(state({})));
  });
});
