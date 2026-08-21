import { describe, it, expect } from "vitest";
import {
  BANDS, EXCLUSIVE, PREFERRED_BAND, FALLBACK_BAND, MIN_FOR_DEFAULT, defaultBandFor,
  RANKS, tierOfBadge, bandForTier, bandPath,
} from "../src/bands";
import { heroesFileFrom, ratesFrom, deltaPoints, type RawRow, type Rate } from "../src/build";

describe("los rangos", () => {
  it("son los 12 que tiene el juego", () => {
    expect(RANKS).toHaveLength(12);
    expect(RANKS[0]).toBe("Obscurus");
    expect(RANKS[11]).toBe("Eternus");
  });
});

describe("tierOfBadge", () => {
  // El juego reporta rango*10 + subnivel: 116 es Eternus 6, 91 es Phantom 1.
  it("saca el rango del badge y descarta el subnivel", () => {
    expect(tierOfBadge(116)).toBe(11);
    expect(tierOfBadge(91)).toBe(9);
    expect(tierOfBadge(0)).toBe(0);
  });

  it("no inventa un rango cuando no hay dato", () => {
    expect(tierOfBadge(null)).toBeNull();
    expect(tierOfBadge(undefined)).toBeNull();
  });

  it("rechaza un badge fuera de la escalera en vez de devolver un rango que no existe", () => {
    expect(tierOfBadge(999)).toBeNull();
  });
});

describe("las bandas", () => {
  // Fantasma+ es la banda por defecto: es donde empieza el juego que vale la
  // pena mirar (decisión de ZoTaD). Si esto cambia, cambia qué ve alguien que
  // entra sin elegir nada.
  it("prefiere abrir en Fantasma+", () => {
    expect(PREFERRED_BAND).toBe("phantom-above");
    expect(BANDS[0].id).toBe("phantom-above");
    expect(BANDS.find((b) => b.id === "phantom-above")!.tiers).toEqual([9, 10, 11]);
  });

  it("parten la escalera entera sin pisarse", () => {
    const cubiertos = EXCLUSIVE.flatMap((b) => b.tiers).sort((a, b) => a - b);
    expect(cubiertos).toEqual([...Array(12).keys()]);
  });

  /**
   * A diferencia de TFT, acá NO hay banda agregada. La de TFT existe porque el
   * cerebro de coaching necesita que "la banda de arriba" esté definida, y para
   * eso hace falta una que no clasifique a nadie. Deadlock no tiene ese cerebro
   * todavía: una banda de más sería un archivo más y ninguna pregunta contestada.
   */
  it("no tiene ninguna banda que se solape con otra", () => {
    expect(BANDS).toHaveLength(4);
    expect(EXCLUSIVE).toHaveLength(BANDS.length);
    for (let t = 0; t < 12; t++) {
      expect(BANDS.filter((b) => b.tiers.includes(t)), `rango ${t}`).toHaveLength(1);
    }
  });

  it("cada rango cae en la banda que le toca", () => {
    expect(bandForTier(11)).toBe("phantom-above");
    expect(bandForTier(9)).toBe("phantom-above");
    expect(bandForTier(8)).toBe("archon-oracle");
    expect(bandForTier(6)).toBe("ritualist-emissary");
    expect(bandForTier(0)).toBe("arcanist-below");
  });
});

describe("bandPath", () => {
  /**
   * Las cuatro llevan sufijo, incluida la que sea el defecto. Con el defecto
   * decidido por la muestra, un archivo que aparece y desaparece entre corridas
   * rompe el `import()` de Vite **en tiempo de build**, no en la página.
   */
  it("le pone sufijo a todas, sin excepción", () => {
    expect(bandPath("../data/heroes.json", PREFERRED_BAND)).toBe("../data/heroes.phantom-above.json");
    expect(bandPath("../data/heroes.json", "archon-oracle")).toBe("../data/heroes.archon-oracle.json");
    expect(bandPath("../data/items.json", "arcanist-below")).toBe("../data/items.arcanist-below.json");
  });
});

/**
 * **Una banda vacía por defecto es una página vacía**, y eso dejó de ser
 * hipotético el 2026-07-30: el soft reset topeó la colocación en Oráculo 6 y
 * Fantasma+ —nuestro defecto— se quedó sin una sola partida ranked durante 16
 * horas seguidas. Antes del reset era el 17,4% de la muestra.
 */
describe("qué banda se ve sin elegir nada", () => {
  it("es Fantasma+ apenas tiene con qué", () => {
    expect(defaultBandFor({ "phantom-above": MIN_FOR_DEFAULT, "archon-oracle": 999_999 })).toBe("phantom-above");
  });

  /**
   * Cede sólo cuando **las dos cosas** fallan: no llega al corte Y otra banda
   * tiene más de dónde medir. Con 7.999 contra 5.000 sigue ganando Fantasma+
   * aunque esté bajo el corte, porque igual es la de más muestra — ahí lo que
   * avisa es la etiqueta de provisional, no un cambio de defecto.
   */
  it("cede el lugar si no llega al corte y además hay otra con más muestra", () => {
    expect(defaultBandFor({ "phantom-above": 1_000, "archon-oracle": 5_000 })).toBe("archon-oracle");
    expect(defaultBandFor({ "phantom-above": MIN_FOR_DEFAULT - 1, "archon-oracle": 5_000 })).toBe("phantom-above");
  });

  // El caso real de hoy: Fantasma+ en cero y el juego topeado en Oráculo.
  it("con Fantasma+ vacío elige la de más muestra", () => {
    expect(
      defaultBandFor({ "phantom-above": 0, "archon-oracle": 2_900, "ritualist-emissary": 1_100, "arcanist-below": 400 })
    ).toBe("archon-oracle");
  });

  // Sin ninguna banda que llegue al corte no hay una "buena" que perder, así
  // que ahí sí gana la de más muestra y no la que sigue en la escalera.
  it("sin ninguna banda calificada, elige por muestra y no por altura", () => {
    expect(defaultBandFor({ "phantom-above": 10, "archon-oracle": 100, "arcanist-below": 900 })).toBe("arcanist-below");
  });

  /**
   * El bug real, visto en producción el 2026-08-04: Fantasma+ en 77 partidas
   * (bajo el corte) y `arcanist-below` con MÁS muestra cruda que
   * `archon-oracle` (33.537 contra 32.324) porque cubre cinco rangos en vez de
   * dos. La versión vieja de `defaultBandFor` publicaba "Arcanista y abajo"
   * por defecto — el sitio entero mostrando la peor banda apenas la mejor con
   * datos de verdad tenía sobra. Debe ganar `archon-oracle`: es la más alta de
   * la escalera que ya pasa el corte, sin importar que otra tenga más filas.
   */
  it("una banda más abajo con más muestra NO le gana a una más arriba que ya califica", () => {
    expect(
      defaultBandFor({
        "phantom-above": 77,
        "archon-oracle": 32_324,
        "ritualist-emissary": 20_109,
        "arcanist-below": 33_537,
      })
    ).toBe("archon-oracle");
  });

  it("empatadas gana la de más arriba", () => {
    expect(defaultBandFor({ "archon-oracle": 500, "ritualist-emissary": 500 })).toBe("archon-oracle");
  });

  // Sin una sola partida en ningún lado no hay nada que elegir, pero hay que
  // devolver algo: que sea el fallback y no una excepción, porque el que llama
  // ya va a fallar solo si de verdad no hay datos.
  it("sin muestra en ninguna banda cae al fallback", () => {
    expect(defaultBandFor({})).toBe(FALLBACK_BAND);
    expect(FALLBACK_BAND).toBe("archon-oracle");
  });
});

const row = (hero_id: number, matches: number, wins: number): RawRow => ({
  hero_id,
  matches: BigInt(matches),
  wins: BigInt(wins),
});

describe("deltaPoints", () => {
  it("da la diferencia en puntos de winrate", () => {
    expect(deltaPoints({ wr: 0.55, n: 5000 }, { wr: 0.5, n: 5000 })).toBe(5);
    expect(deltaPoints({ wr: 0.48, n: 5000 }, { wr: 0.52, n: 5000 })).toBe(-4);
  });

  /**
   * Una resta de dos winrates arrastra el ruido de los dos lados. Con muestra
   * chica, un punto de diferencia es indistinguible de cero, y publicarlo como
   * "sube" sería inventar una tendencia.
   */
  it("calla cuando cualquiera de los dos lados tiene poca muestra", () => {
    expect(deltaPoints({ wr: 0.6, n: 50 }, { wr: 0.5, n: 5000 })).toBeUndefined();
    expect(deltaPoints({ wr: 0.6, n: 5000 }, { wr: 0.5, n: 50 })).toBeUndefined();
  });

  // Cero significa "no se movió", que es una afirmación. La ausencia significa
  // "no sé", que cuando falta un lado es la verdad.
  it("devuelve ausencia y no cero cuando falta un lado", () => {
    expect(deltaPoints(undefined, { wr: 0.5, n: 5000 })).toBeUndefined();
    expect(deltaPoints({ wr: 0.5, n: 5000 }, undefined)).toBeUndefined();
  });
});

describe("ratesFrom", () => {
  it("saca winrate y muestra de las filas crudas", () => {
    const m = ratesFrom([row(1, 1000, 550)]);
    expect(m.get(1)).toEqual({ wr: 0.55, n: 1000 });
  });
});

describe("heroesFileFrom", () => {
  const band = BANDS[0];
  const totals = { matches: 1000, boards: 12000, from: "2026-07-15", to: "2026-07-29" };
  const patch = { date: "2026-07-28T20:28:07Z", title: "06-30-2026 Update", link: "x" };
  const vacio = {
    skillGap: new Map<number, number | undefined>(),
    before: new Map<number, Rate>(),
    matchesBefore: 0,
  };
  /** Muestra gorda y pareja, para que el encogimiento no mueva lo que se afirma. */
  const gordo = (id: number, wr: number): RawRow =>
    row(id, 60_000, Math.round(60_000 * wr));

  it("calcula winrate y pickrate sobre los denominadores correctos", () => {
    const f = heroesFileFrom([row(1, 500, 275)], band, totals, vacio, patch, "t");
    expect(f.heroes[0].winRate).toBe(0.55);
    // pickRate va contra las PARTIDAS de la banda, no contra las filas jugador.
    expect(f.heroes[0].pickRate).toBe(0.5);
  });

  /**
   * Almas, KDA y el conteo de partidas se sacaron el 2026-07-29: el primero mide
   * el farmeo del jugador, el segundo quién lo juega, y el tercero es lo mismo
   * que el pickrate sin normalizar. Ninguno rankea un héroe.
   */
  it("no publica almas, KDA ni nada que dependa de quién juegue", () => {
    const h = heroesFileFrom([row(1, 500, 275)], band, totals, vacio, patch, "t").heroes[0];
    for (const campo of ["kda", "netWorth", "lastHits", "denies", "kills", "deaths", "assists"]) {
      expect(h, campo).not.toHaveProperty(campo);
    }
  });

  // Sigue en el archivo aunque no se muestre: es el denominador del pickrate y
  // lo que decide thinData.
  it("conserva el conteo de partidas como dato interno", () => {
    expect(heroesFileFrom([row(1, 500, 275)], band, totals, vacio, patch, "t").heroes[0].matches).toBe(500);
  });

  it("lleva la brecha, y el cambio del parche con su 'de → a'", () => {
    const extra = {
      skillGap: new Map<number, number | undefined>([[1, 6.1]]),
      before: new Map<number, Rate>([[1, { wr: 0.5, n: 4000 }]]),
      matchesBefore: 8000,
    };
    const h = heroesFileFrom([row(1, 5000, 2750)], band, totals, extra, patch, "t").heroes[0];
    expect(h.skillGap).toBe(6.1);
    expect(h.trend).toBe(5);
    expect(h.winRateBefore).toBe(0.5);
    expect(h.pickRateBefore).toBe(0.5);
  });

  it("omite el campo entero cuando no hay muestra para calcularlo", () => {
    const extra = {
      skillGap: new Map<number, number | undefined>([[1, undefined]]),
      before: new Map<number, Rate>(),
      matchesBefore: 0,
    };
    const h = heroesFileFrom([row(1, 500, 275)], band, totals, extra, patch, "t").heroes[0];
    expect(h).not.toHaveProperty("skillGap");
    expect(h).not.toHaveProperty("trend");
  });

  /**
   * El "de → a" no se publica sin el cambio. Dos winrates sueltos invitan a
   * restarlos a ojo, y esa resta se saltearía la guarda de muestra que
   * `deltaPoints` aplica — que es justamente lo que evita anunciar un movimiento
   * que es ruido.
   */
  it("no publica el 'de' cuando el cambio no es publicable", () => {
    const extra = {
      skillGap: new Map<number, number | undefined>(),
      before: new Map<number, Rate>([[1, { wr: 0.5, n: 30 }]]),
      matchesBefore: 60,
    };
    const h = heroesFileFrom([row(1, 500, 275)], band, totals, extra, patch, "t").heroes[0];
    expect(h).not.toHaveProperty("trend");
    expect(h).not.toHaveProperty("winRateBefore");
  });

  it("anota el parche que describe la medición", () => {
    const f = heroesFileFrom([row(1, 500, 275)], band, totals, vacio, patch, "t");
    expect(f.patch.date).toBe("2026-07-28T20:28:07Z");
    expect(f.patch.title).toBe("06-30-2026 Update");
  });

  /**
   * El día que sale un parche la ventana tiene horas de partidas. Se publica
   * igual y se avisa: una lista del parche anterior con cara de actual es peor
   * que una lista fina que dice que es fina.
   */
  it("marca provisional a la banda con pocas partidas y no a la que tiene muestra", () => {
    const finita = heroesFileFrom([row(1, 500, 275)], band, { ...totals, matches: 2480 }, vacio, patch, "t");
    expect(finita.provisional).toBe(true);
    const gorda = heroesFileFrom([row(1, 500, 275)], band, { ...totals, matches: 69_000 }, vacio, patch, "t");
    expect(gorda.provisional).toBeUndefined();
  });

  it("ordena por winrate, de mejor a peor", () => {
    const f = heroesFileFrom([row(1, 1000, 400), row(2, 1000, 600)], band, totals, vacio, patch, "t");
    expect(f.heroes.map((h) => h.heroId)).toEqual([2, 1]);
  });

  // Un héroe que casi nadie juega se publica marcado, no se esconde: si
  // desapareciera de la lista se leería como que no existe en el juego.
  it("marca la muestra fina en vez de borrar al héroe", () => {
    const f = heroesFileFrom([row(7, 50, 25)], band, totals, vacio, patch, "t");
    expect(f.heroes[0].thinData).toBe(true);
    expect(f.heroes).toHaveLength(1);
  });

  it("no marca al que tiene muestra de sobra", () => {
    expect(heroesFileFrom([row(7, 5000, 2500)], band, totals, vacio, patch, "t").heroes[0].thinData).toBeUndefined();
  });

  it("redondea, para que dos corridas del mismo dato den el mismo archivo", () => {
    const f = heroesFileFrom([row(1, 3, 1)], band, totals, vacio, patch, "t");
    expect(String(f.heroes[0].winRate)).toBe("0.3333");
  });
});
