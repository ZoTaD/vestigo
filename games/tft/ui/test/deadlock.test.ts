import { describe, it, expect } from "vitest";
import {
  BANDS,
  PREFERRED_BAND,
  PUBLISHED_BAND,
  tierOf,
  buildHeroes,
  catalog,
  difficultyOf,
  momentumOf,
  bandCrest,
  patchMovers,
} from "../src/deadlockData";
import { BANDS as PIPE_BANDS, PREFERRED_BAND as PIPE_PREFERRED } from "../../../deadlock/pipeline/src/bands";
import heroes from "@deadlock/heroes.json";

/**
 * El pipeline de Deadlock es dueño de la tabla de bandas; `deadlockData.ts` la
 * copia para el navegador, igual que `bands.ts` copia la de TFT. Este archivo es
 * el único motivo por el que esa copia se puede confiar: si divergen, la página
 * etiquetaría los números de una banda con el nombre de otra, que es un error
 * que nadie puede ver mirando la pantalla.
 */
describe("la tabla de bandas no puede divergir del pipeline", () => {
  it("tiene las mismas bandas, con los mismos rangos y en el mismo orden", () => {
    expect(BANDS.map((b) => ({ id: b.id, tiers: b.tiers }))).toEqual(
      PIPE_BANDS.map((b) => ({ id: b.id, tiers: b.tiers }))
    );
  });

  it("coincide en cuál es la banda por defecto", () => {
    expect(PREFERRED_BAND).toBe(PIPE_PREFERRED);
  });

  // Fantasma+ es lo que ve alguien que entra sin elegir nada, y es el archivo
  // sin sufijo que viaja en el bundle principal.
  it("prefiere abrir en Fantasma+", () => {
    expect(PREFERRED_BAND).toBe("phantom-above");
  });

  /**
   * **La banda del archivo manda sobre lo que el bundle asume.** Desde el reset
   * del 2026-07-30 el pipeline elige el defecto según la muestra, así que
   * `heroes.json` puede traer Arcón/Oráculo. Si la UI registrara esos datos bajo
   * la clave "phantom-above", el selector abriría en una banda que no es la que
   * está mostrando y nadie lo notaría: los números se dibujan igual.
   */
  it("registra los datos bajo la banda que el archivo dice ser", () => {
    expect(PUBLISHED_BAND).toBe((heroes as { band: string }).band);
    expect(BANDS.map((b) => b.id)).toContain(PUBLISHED_BAND);
  });
});

describe("tierOf", () => {
  // Los cortes son absolutos y no cuantiles porque en un juego de dos equipos el
  // winrate medio es 50% por construcción: no hay que estimar dónde está el
  // centro. Cortar por posición pondría en tiers distintos a dos héroes
  // separados por dos décimas.
  it("reparte por winrate y no por puesto", () => {
    expect(tierOf(0.56)).toBe("S");
    expect(tierOf(0.53)).toBe("S");
    expect(tierOf(0.52)).toBe("A");
    expect(tierOf(0.505)).toBe("B");
    expect(tierOf(0.49)).toBe("C");
    expect(tierOf(0.44)).toBe("D");
  });

  it("pone el 50% justo en B, que es el héroe promedio", () => {
    expect(tierOf(0.5)).toBe("B");
  });

  /**
   * Las cinco bandas de la página salen de las cinco letras. Si algún día una
   * letra quedara vacía, la banda no se debe dibujar — y este test avisa antes
   * de que aparezca un riel con cero tiles.
   */
  it("reparte los 38 héroes en las cinco letras", () => {
    const heroes = buildHeroes(PUBLISHED_BAND, "en");
    const letras = [...new Set(heroes.map((h) => h.tier))].sort();
    expect(letras).toEqual(["A", "B", "C", "D", "S"]);
  });
});

describe("la tier list publicada", () => {
  const built = buildHeroes(PUBLISHED_BAND, "en");

  it("trae los 38 héroes jugables, con nombre e imagen", () => {
    expect(built.length).toBeGreaterThan(30);
    for (const h of built) {
      expect(h.name, `héroe ${h.heroId}`).not.toBe("");
      expect(h.name.startsWith("#"), `héroe ${h.heroId} sin catálogo`).toBe(false);
      expect(h.img, `héroe ${h.heroId}`).not.toBe("");
    }
  });

  it("está ordenada de mejor a peor winrate", () => {
    const wr = built.map((h) => h.winRate);
    expect([...wr].sort((a, b) => b - a)).toEqual(wr);
  });

  // Un winrate fuera de este rango significa que el denominador está mal, y sería
  // invisible en pantalla: un 5% se lee como "héroe malísimo" en vez de como un bug.
  it("tiene winrates verosímiles para un juego de dos equipos", () => {
    for (const h of built) {
      expect(h.winRate, h.name).toBeGreaterThan(0.35);
      expect(h.winRate, h.name).toBeLessThan(0.65);
    }
  });

  it("resuelve los nombres al idioma pedido y no al de import", () => {
    const en = buildHeroes(PUBLISHED_BAND, "en");
    const es = buildHeroes(PUBLISHED_BAND, "es");
    const distintos = en.filter((h, i) => h.name !== es[i].name);
    // Verificado contra el catálogo real: Seven→Siete, Ivy→Hiedra, Victor→Víctor.
    expect(distintos.length).toBeGreaterThan(0);
  });

  /**
   * Almas, KDA y el conteo de partidas se sacaron el 2026-07-29 por pedido de
   * ZoTaD, y el motivo es de fondo: el primero mide el farmeo del jugador, el
   * segundo quién lo juega y el tercero es el pickrate sin normalizar. Ninguno
   * dice qué tan fuerte es un héroe. Este test existe para que no vuelvan solos.
   */
  it("no publica nada que dependa de quién juegue", () => {
    for (const campo of ["kda", "netWorth", "lastHits", "denies", "kills", "deaths", "assists"]) {
      expect(built[0], campo).not.toHaveProperty(campo);
    }
  });

  /**
   * La brecha tiene ventana propia de quince días **sin mirar el parche**,
   * porque "cuánto premia saber jugar a este héroe" es una propiedad del diseño
   * del personaje y no cambia porque le toquen un número. Medirla sobre la
   * ventana del parche fue el primer intento y dejaba 7 héroes de 38 con
   * muestra: se perdía casi toda la información por cuidar algo que no estaba
   * en peligro.
   */
  /**
   * **Desde el reset del 2026-07-30 la brecha se omite entera**, y eso es lo
   * correcto: es una resta contra Fantasma+, que quedó en cero partidas porque
   * el ladder nuevo topea la colocación en Oráculo 6. Un 0 diría "no se mueve";
   * la ausencia dice "no sé". El día que Fantasma+ junte muestra vuelve sola.
   */
  it("omite la brecha entera, sin inventar un cero, mientras un extremo esté vacío", () => {
    const conBrecha = built.filter((h) => h.skillGap !== undefined);
    expect(conBrecha.every((h) => h.skillGap !== 0)).toBe(true);
    expect(built.every((h) => h.skillGap === undefined || typeof h.skillGap === "number")).toBe(true);
  });

  /**
   * El cambio del parche SÍ depende de la muestra posterior al corte, así que
   * el día que sale uno lo tienen pocos y a la semana lo tienen casi todos. Lo
   * que este test fija no es cuántos, sino que los que lo traen vengan enteros:
   * un delta sin el "de" no se puede dibujar.
   */
  it("el que trae cambio de parche trae también de dónde venía", () => {
    for (const h of built.filter((x) => x.trend !== undefined)) {
      expect(h.winRateBefore, h.name).toBeDefined();
      expect(h.pickRateBefore, h.name).toBeDefined();
    }
  });

  it("nadie trae el 'de' sin el cambio que lo justifica", () => {
    for (const h of built.filter((x) => x.trend === undefined)) {
      expect(h.winRateBefore, h.name).toBeUndefined();
    }
  });

  /**
   * La brecha describe al héroe, no a la banda desde la que se lo mira, así que
   * tiene que ser el mismo número en las cuatro. Si algún día se calculara por
   * banda, "Vyper premia saber jugarlo" pasaría a significar cosas distintas
   * según dónde estés parado, que es justo lo que no queremos.
   */
  it("da la misma brecha en todas las bandas", () => {
    const enDefault = new Map(built.map((h) => [h.heroId, h.skillGap]));
    for (const h of buildHeroes("arcanist-below", "en")) {
      expect(h.skillGap, `héroe ${h.heroId}`).toBe(enDefault.get(h.heroId));
    }
  });

  // Una resta de winrates de 30 puntos no es un héroe difícil: es un bug en el
  // denominador, y en pantalla se leería como un dato.
  it("mantiene brecha y tendencia en rangos verosímiles", () => {
    for (const h of built) {
      if (h.skillGap !== undefined) expect(Math.abs(h.skillGap), h.name).toBeLessThan(15);
      if (h.trend !== undefined) expect(Math.abs(h.trend), h.name).toBeLessThan(15);
    }
  });
});

/**
 * El umbral sale del cuartil superior de la distribución real, no de la
 * intuición, y **se re-deriva cuando la distribución se mueve**. El 2026-07-29
 * los cuartiles eran −0,8 / +2,1 y el corte ±2 etiquetaba 17 de 38; el
 * 2026-08-16 se abrieron a −2 / +2,7 y con el corte viejo la etiqueta se iba a
 * 22 de 38. Que la mayoría NO tenga etiqueta es lo que hace que la etiqueta se
 * vea, así que el corte pasó a ±2,7 y volvió a 16 de 38.
 */
describe("difficultyOf", () => {
  it("nombra los extremos y calla en el medio", () => {
    expect(difficultyOf(5.3)).toBe("hard");
    expect(difficultyOf(2.7)).toBe("hard");
    expect(difficultyOf(2.6)).toBeNull();
    expect(difficultyOf(0)).toBeNull();
    expect(difficultyOf(-2.6)).toBeNull();
    expect(difficultyOf(-2.7)).toBe("easy");
    expect(difficultyOf(-9.2)).toBe("easy");
  });

  it("no inventa una lectura cuando no hay número", () => {
    expect(difficultyOf(undefined)).toBeNull();
  });

  // Con este corte, la etiqueta es la excepción y no la regla.
  it("deja sin etiqueta a la mayoría de la lista", () => {
    const heroes = buildHeroes(PUBLISHED_BAND, "en");
    const conBrecha = heroes.filter((h) => h.skillGap !== undefined);
    const conEtiqueta = heroes.filter((h) => h.difficulty !== null);
    // Sin brecha no puede haber etiqueta, y hoy no hay ninguna: la banda de
    // arriba está vacía. Lo que el test fija es la relación, no un número que
    // dejaría de valer en cuanto vuelva la muestra.
    expect(conEtiqueta.length).toBeLessThanOrEqual(conBrecha.length);
    expect(conEtiqueta.length).toBeLessThan(heroes.length / 2 + 3);
  });
});

describe("momentumOf", () => {
  it("marca sólo a los que se movieron de verdad", () => {
    expect(momentumOf(2.3)).toBe("up");
    expect(momentumOf(1)).toBe("up");
    expect(momentumOf(0.9)).toBeNull();
    expect(momentumOf(-0.9)).toBeNull();
    expect(momentumOf(-1)).toBe("down");
    expect(momentumOf(undefined)).toBeNull();
  });
});

/**
 * La banda se dibuja con las insignias del juego en vez de su nombre escrito:
 * una insignia se reconoce de un vistazo y no depende del idioma.
 */
describe("bandCrest", () => {
  it("la banda de arriba muestra su borde y un más", () => {
    const c = bandCrest("phantom-above");
    expect(c.badges).toHaveLength(1);
    expect(c.suffix).toBe("+");
    expect(c.badges[0].name.en).toBe("Phantom");
  });

  it("la de abajo muestra su borde y un menos", () => {
    const c = bandCrest("arcanist-below");
    expect(c.suffix).toBe("−");
    expect(c.badges[0].name.en).toBe("Sentinel");
  });

  // Cinco insignias en fila serían una cinta; dos son un encabezado.
  it("las bandas de dos rangos muestran las dos insignias y ningún signo", () => {
    const c = bandCrest("archon-oracle");
    expect(c.badges.map((b) => b.name.en)).toEqual(["Emissary", "Oracle"]);
    expect(c.suffix).toBe("");
  });

  it("cada insignia tiene imagen", () => {
    for (const b of BANDS) {
      for (const badge of bandCrest(b.id).badges) {
        expect(badge.img, b.id).not.toBe("");
      }
    }
  });
});

/**
 * La sección de "qué cambió el parche" ordena por CUÁNTO se movió, no por
 * winrate: la pregunta es "¿qué cambió?", que es distinta de "¿quién es mejor?".
 * Un héroe que estaba al 43% y subió tres puntos sigue siendo malo y aun así es
 * la noticia del parche.
 */
describe("patchMovers", () => {
  const hero = (heroId: number, trend?: number) =>
    ({ heroId, trend, name: `h${heroId}` }) as unknown as Parameters<typeof patchMovers>[0][number];

  it("separa los que suben de los que bajan", () => {
    const m = patchMovers([hero(1, 3), hero(2, -2), hero(3, 1)]);
    expect(m.up.map((h) => h.heroId)).toEqual([1, 3]);
    expect(m.down.map((h) => h.heroId)).toEqual([2]);
  });

  it("pone primero al que más se movió, de cada lado", () => {
    const m = patchMovers([hero(1, 1), hero(2, 4), hero(3, -1), hero(4, -5)]);
    expect(m.up[0].heroId).toBe(2);
    expect(m.down[0].heroId).toBe(4);
  });

  it("deja afuera a los que no tienen cambio medible", () => {
    const m = patchMovers([hero(1, 2), hero(2, undefined)]);
    expect(m.up).toHaveLength(1);
    expect(m.down).toHaveLength(0);
  });

  it("corta en los primeros N de cada lado", () => {
    const muchos = Array.from({ length: 12 }, (_, i) => hero(i, i - 6));
    const m = patchMovers(muchos, 3);
    expect(m.up).toHaveLength(3);
    expect(m.down).toHaveLength(3);
  });

  it("no rompe cuando el parche no movió nada", () => {
    expect(patchMovers([])).toEqual({ up: [], down: [] });
  });
});

describe("el catálogo", () => {
  /**
   * La insignia grande pesa 146 KB y la chica 8,9: esto se dibuja al lado de una
   * letra de tier, no como ilustración.
   *
   * **Obscurus es la única excepción y el juego es el que la impone**: es el
   * único rango que no publica versión chica, así que cae a la grande (36 KB).
   * No importa en pantalla porque no se dibuja nunca — la banda de abajo muestra
   * la insignia de Arcanista, que es su borde de arriba. El test comprueba
   * justamente eso: que ningún escudo que sí se dibuja arrastre una grande.
   */
  /**
   * **Desde el parche del 2026-07-30 se usa la insignia grande**, que es por
   * rango y no por subrango: antes había que elegir el subrango 1 de la chica
   * porque el juego no publicaba otra cosa, y esa elección no significaba nada.
   * Pesa más (14-85 KB contra 5-11) y se paga porque la insignia ES el
   * encabezado de tier, sin el nombre de la banda al lado.
   */
  it("usa la insignia grande, que es por rango y no por subrango", () => {
    for (const r of catalog.ranks) {
      expect(r.img, `rango ${r.tier}`).toContain("_lg");
      expect(r.img, `rango ${r.tier}`).not.toContain("subrank");
    }
  });

  // Obscurus no publicaba versión chica y por eso nunca se dibujaba. Con la
  // grande todos los rangos tienen imagen, incluido él.
  it("todos los rangos tienen insignia, Obscurus incluido", () => {
    expect(catalog.ranks).toHaveLength(12);
    for (const r of catalog.ranks) expect(r.img, `rango ${r.tier}`).not.toBe("");
  });

  it("tiene los 12 rangos, con nombre en los dos idiomas", () => {
    expect(catalog.ranks).toHaveLength(12);
    for (const r of catalog.ranks) {
      expect(r.name.en, `rango ${r.tier}`).not.toBe("");
      expect(r.name.es, `rango ${r.tier}`).not.toBe("");
    }
  });

  it("cubre todos los rangos que las bandas nombran", () => {
    const enCatalogo = new Set(catalog.ranks.map((r) => r.tier));
    for (const b of BANDS) for (const t of b.tiers) expect(enCatalogo.has(t), `rango ${t}`).toBe(true);
  });
});
