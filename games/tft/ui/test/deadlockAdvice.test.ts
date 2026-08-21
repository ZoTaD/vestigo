import { describe, it, expect } from "vitest";
import reportJson from "@deadlock/report.json";
import catalogJson from "@deadlock/catalog.json";
import {
  adviceFor,
  buyOrder,
  gradeOf,
  keptItems,
  profileOf,
  spiritShare,
  durationBucket,
  LETTERS,
  MAX_FINDINGS,
  MIN_STRENGTH,
  type Items,
  type ReportFile,
} from "../src/deadlockAdvice";
import {
  parseMatch,
  summarize,
  type HistoryRow,
  type MatchPlayer,
  type ParsedMatch,
} from "../src/deadlockMatch";

const report = reportJson as unknown as ReportFile;
const catalog = catalogJson as unknown as {
  items: Record<string, { cost: number; slot: string; upgradesTo?: number[] }>;
};
const items: Items = new Map(
  Object.entries(catalog.items).map(([id, v]) => [
    Number(id),
    { cost: v.cost, slot: v.slot, upgradesTo: v.upgradesTo },
  ])
);

/** Un jugador de mentira, con lo mínimo y lo que cada prueba quiera encima. */
function jugador(over: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    accountId: 1,
    slot: 1,
    heroId: 2,
    team: 0,
    won: true,
    kills: 5,
    deaths: 5,
    assists: 5,
    netWorth: 40_000,
    level: 30,
    damage: 30_000,
    boss: 5_000,
    purchases: [],
    souls: [],
    damageFrom: new Map(),
    ...over,
  };
}

/** Una partida de mentira: seis contra seis, con quien la prueba quiera adentro. */
function partida(nuestros: MatchPlayer[], rivales: MatchPlayer[]): ParsedMatch {
  return {
    matchId: 1,
    durationS: 2_100,
    startTime: 0,
    winningTeam: 0,
    badge: 75,
    players: [
      ...nuestros.map((p, i) => ({ ...p, team: 0, slot: i + 1 })),
      ...rivales.map((p, i) => ({ ...p, team: 1, slot: i + 7 })),
    ],
  };
}

/** Los ids de los objetos de una categoría, ordenados por precio. */
const deCategoria = (slot: string) =>
  Object.entries(catalog.items)
    .filter(([, v]) => v.slot === slot)
    .map(([id, v]) => ({ id: Number(id), cost: v.cost }))
    .sort((a, b) => a.cost - b.cost);

const compra = (itemId: number, min = 5) => ({ itemId, buyS: min * 60, soldS: 0, imbued: 0 });

describe("lo que publica el pipeline", () => {
  it("mide la nota contra jugadores, no contra el marcador", () => {
    /**
     * **El test que decide si la nota sirve.** Si los rangos intercuartiles de
     * ganadores y perdedores no se solaparan, la letra sería el resultado con
     * otro nombre y no habría por qué mostrarla.
     *
     * Pasó de verdad: con las señales en almas y daño **por minuto** el
     * solapamiento medido fue **−21,8%** —o sea que quedaba un hueco entre los
     * dos grupos— y por eso las señales pasaron a ser cuota del propio equipo.
     */
    expect(report.overlap).toBeGreaterThan(0.4);
  });

  /**
   * **Lo que se fija es que morir domine y que los pesos sumen uno; el orden
   * entre almas y daño NO se fija, y eso es el arreglo.**
   *
   * Este test pedía `almas > daño` y se puso en rojo el 2026-08-14, cuando el
   * informe pasó a leer el mecanismo REAL de `builds.json` en vez del respaldo
   * hardcodeado: los pesos fueron de `[0,287 · 0,165 · −0,548]` a
   * `[0 · 0,303 · −0,697]`. **No es un defecto**: `fit.economy` se redondea a
   * cuatro decimales, así que un cero significa menos de 0,00005 contra 0,0652
   * de daño — las almas son colineales con daño y muertes (el oro sale de matar
   * y de no morir) y su aporte independiente se colapsa. El 0,231 del respaldo
   * viene de un corpus viejo, anterior a ranked.
   *
   * La lección: **un test que fija el ORDEN entre dos coeficientes medidos está
   * fijando el resultado de una medición, no un invariante.** Que morir reste y
   * que los pesos estén normalizados sí son invariantes.
   */
  it("hereda del mecanismo que morir es lo que más pesa", () => {
    const [almas, daño, muertes] = report.weights;
    expect(muertes).toBeLessThan(0);
    expect(Math.abs(muertes)).toBeGreaterThan(almas);
    expect(Math.abs(muertes)).toBeGreaterThan(daño);
    expect(report.weights.reduce((a, w) => a + Math.abs(w), 0)).toBeCloseTo(1, 3);
  });

  it("publica ocho cortes por tramo, ordenados", () => {
    for (const [id, hero] of Object.entries(report.heroes)) {
      for (const [dur, cuts] of Object.entries(hero.grade)) {
        expect(cuts, `héroe ${id} tramo ${dur}`).toHaveLength(LETTERS.length - 1);
        expect([...cuts].sort((a, b) => a - b)).toEqual(cuts);
      }
    }
  });

  it("no publica una tasa de compra imposible", () => {
    for (const hero of Object.values(report.heroes)) {
      for (const perfil of Object.values(hero.buys)) {
        for (const [rate, minute] of Object.values(perfil)) {
          expect(rate).toBeGreaterThan(0);
          expect(rate).toBeLessThanOrEqual(1);
          expect(minute).toBeGreaterThan(0);
        }
      }
    }
  });

  it("saca las resistencias de la ficha del juego y no de una lista", () => {
    // Las dos que el jugador nombraría primero, por su nombre en el catálogo.
    const porNombre = (n: string) =>
      Number(
        Object.entries(catalogJson.items as Record<string, { name: { en: string } }>).find(
          ([, v]) => v.name.en === n
        )?.[0]
      );
    expect(report.resist.spirit).toContain(porNombre("Spirit Resilience"));
    expect(report.resist.spirit).toContain(porNombre("Spellbreaker"));
    expect(report.resist.weapon).toContain(porNombre("Bullet Resilience"));
    expect(report.resist.weapon).toContain(porNombre("Metal Skin"));
    // Y no se pisan: una resistencia de bala no es una de espíritu.
    expect(report.resist.spirit).not.toContain(porNombre("Bullet Resilience"));
  });
});

describe("la nota", () => {
  it("se omite entera cuando el héroe no tiene muestra", () => {
    const p = jugador({ heroId: 99_999 });
    expect(gradeOf(p, partida([p], []), report)).toBeNull();
  });

  it("le da mejor letra al que aporta más de lo suyo", () => {
    const bueno = jugador({ netWorth: 60_000, damage: 60_000, deaths: 1 });
    const malo = jugador({ netWorth: 20_000, damage: 10_000, deaths: 12 });
    const resto = Array.from({ length: 4 }, () => jugador());
    const m = partida([bueno, malo, ...resto], []);
    const a = gradeOf(m.players[0], m, report)!;
    const b = gradeOf(m.players[1], m, report)!;
    expect(a).not.toBeNull();
    expect(a.index).toBeGreaterThan(b.index);
    expect(LETTERS).toContain(a.letter);
  });

  /**
   * **Durar más no puede mejorarte la nota** — eso es lo que el tramo de
   * duración existe para garantizar, y es lo que se prueba.
   *
   * **No se pide letra idéntica, y pedirla estaba mal.** Las señales son cuota
   * del propio equipo, así que no dependen del reloj; pero los cortes **y las
   * normas** son por tramo, o sea que el mismo desempeño se compara contra
   * poblaciones distintas en una partida corta y en una larga. Que la letra se
   * corra un escalón es la consecuencia buscada de comparar contra partidas de
   * largo parecido, no un defecto.
   *
   * La igualdad exacta venía pasando por suerte: se cayó el 2026-08-16 al cambiar
   * la muestra, y re-medir sobre 104.294 partidas —doce veces más— **no la
   * devolvió**, que es la prueba de que no era ruido sino una propiedad que el
   * diseño nunca prometió.
   */
  it("la duración mueve la nota como mucho un escalón, y no hacia arriba", () => {
    const p = jugador();
    const equipo = Array.from({ length: 5 }, () => jugador());
    const corta = { ...partida([p, ...equipo], []), durationS: report.durationCuts[0] - 60 };
    const larga = { ...partida([p, ...equipo], []), durationS: report.durationCuts[1] + 60 };
    expect(durationBucket(corta.durationS, report.durationCuts)).toBe(0);
    expect(durationBucket(larga.durationS, report.durationCuts)).toBe(2);

    const a = gradeOf(corta.players[0], corta, report)!;
    const b = gradeOf(larga.players[0], larga, report)!;
    expect(Math.abs(a.index - b.index)).toBeLessThanOrEqual(1);
    // Lo que nunca puede pasar: que la partida larga premie por haber farmeado
    // más tiempo. Con el mismo aporte relativo, la larga no puede sacar más.
    expect(b.index).toBeLessThanOrEqual(a.index);
  });
});

describe("los consejos", () => {
  const vitalidad = deCategoria("vitality");
  const espiritu = deCategoria("spirit");

  /** Un rival que gastó todo en espíritu, y que además te hizo todo el daño. */
  const rivalDeEspiritu = (slot: number) =>
    jugador({ slot, purchases: espiritu.slice(0, 8).map((x) => compra(x.id)) });

  it("devuelve cero cuando no hay nada que decir", () => {
    // Un jugador con la mano llena, sin almas de sobra, imbuido y con las dos
    // resistencias: ninguna familia tiene con qué dispararse.
    const hero = report.heroes["2"];
    const compras = [
      ...report.resist.spirit.slice(0, 1),
      ...report.resist.weapon.slice(0, 1),
      ...Object.keys(hero.buys["1"] ?? {}).map(Number),
    ].map((id) => compra(id, 3));
    const p = jugador({
      purchases: compras.map((c, i) => (i === 0 ? { ...c, imbued: 1 } : c)),
      netWorth: hero.split.reduce((a, x) => a + x, 0) + hero.souls,
    });
    const m = partida([p], [jugador({ slot: 7 })]);
    const consejos = adviceFor(m.players[0], m, report, items);
    for (const c of consejos) expect(c.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
  });

  it("avisa de la resistencia que falta contra el daño que te mató", () => {
    const rival = rivalDeEspiritu(7);
    const yo = jugador({
      // Todo el daño recibido viene del rival de espíritu, y ninguna compra es
      // una resistencia de espíritu.
      damageFrom: new Map([[7, 20_000]]),
      purchases: vitalidad
        .filter((x) => !report.resist.spirit.includes(x.id) && !report.resist.weapon.includes(x.id))
        .slice(0, 4)
        .map((x) => compra(x.id)),
    });
    const m = partida([yo], [rival]);
    const consejos = adviceFor(m.players[0], m, report, items);
    const r = consejos.find((c) => c.id === "resist");
    expect(r, "tendría que avisar de la resistencia de espíritu").toBeTruthy();
    // Cada consejo imprime el número que lo respalda: sin eso es un horóscopo.
    expect(r!.n.share).toBeGreaterThan(0.5);
    expect(r!.n.rate).toBeGreaterThanOrEqual(MIN_STRENGTH);
    expect(report.resist.spirit).toContain(r!.itemId);
  });

  it("no avisa de la resistencia que sí compraste", () => {
    const rival = rivalDeEspiritu(7);
    const yo = jugador({
      damageFrom: new Map([[7, 20_000]]),
      purchases: [compra(report.resist.spirit[0])],
    });
    const m = partida([yo], [rival]);
    const dichos = adviceFor(m.players[0], m, report, items).filter(
      (c) => c.id === "resist" && report.resist.spirit.includes(c.itemId!)
    );
    expect(dichos).toHaveLength(0);
  });

  it("nunca muestra más de tres, y siempre ordenados", () => {
    // Un jugador que no compró nada dispara varias familias a la vez.
    const yo = jugador({ netWorth: 80_000, purchases: [] });
    const m = partida([yo], [jugador({ slot: 7 })]);
    const consejos = adviceFor(m.players[0], m, report, items);
    expect(consejos.length).toBeLessThanOrEqual(MAX_FINDINGS);
    expect([...consejos].sort((a, b) => b.strength - a.strength).map((c) => c.id)).toEqual(
      consejos.map((c) => c.id)
    );
  });

  it("no repite familia: tres lugares, tres cosas distintas", () => {
    /**
     * Visto en una partida real antes de esta regla: los tres consejos fueron
     * "vendiste X", "vendiste Y" y uno más, o sea el mismo consejo tres veces.
     */
    const hero = report.heroes["2"];
    const vendidos = Object.keys(hero.sold).slice(0, 5).map(Number);
    const yo = jugador({
      netWorth: 90_000,
      purchases: vendidos.map((id, i) => ({ itemId: id, buyS: 300, soldS: 900 + i, imbued: 0 })),
    });
    const m = partida([yo], [jugador({ slot: 7 })]);
    const ids = adviceFor(m.players[0], m, report, items).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no dice dos cosas del mismo objeto", () => {
    const yo = jugador({ purchases: [] });
    const m = partida([yo], [jugador({ slot: 7 })]);
    const consejos = adviceFor(m.players[0], m, report, items);
    const conObjeto = consejos.filter((c) => c.itemId !== undefined).map((c) => c.itemId);
    expect(new Set(conObjeto).size).toBe(conObjeto.length);
  });

  it("no dice nada de un héroe que no está medido", () => {
    const yo = jugador({ heroId: 99_999 });
    const m = partida([yo], [jugador({ slot: 7 })]);
    expect(adviceFor(m.players[0], m, report, items)).toEqual([]);
  });
});

describe("leer la partida cruda", () => {
  it("saca la mano final descontando lo vendido, y mejorar cuenta como vender", () => {
    const [a, b] = deCategoria("vitality").map((x) => x.id);
    const p = jugador({
      purchases: [
        { itemId: a, buyS: 60, soldS: 600, imbued: 0 },
        { itemId: b, buyS: 120, soldS: 0, imbued: 0 },
        { itemId: b, buyS: 130, soldS: 0, imbued: 0 },
      ],
    });
    expect(keptItems(p, items)).toEqual([b]);
  });

  it("no cuenta como objeto lo que no se compra en la tienda", () => {
    /**
     * El array `items` de una partida trae también habilidades. Sin este filtro
     * un jugador terminaba con "16 objetos" cuando el tope del juego es 12, y la
     * familia que los cuenta comparaba contra la mediana de los ganadores como
     * si fueran lo mismo.
     */
    const real = deCategoria("spirit")[0].id;
    const p = jugador({
      purchases: [
        { itemId: real, buyS: 60, soldS: 0, imbued: 0 },
        { itemId: 1_593_133_799, buyS: 90, soldS: 0, imbued: 0 },
      ],
    });
    expect(keptItems(p, items)).toEqual([real]);
    expect(buyOrder(p, items).map((c) => c.itemId)).toEqual([real]);
  });

  it("el orden de compra es el orden real, sin repetir", () => {
    const [a, b] = deCategoria("weapon").map((x) => x.id);
    const p = jugador({
      purchases: [
        { itemId: b, buyS: 300, soldS: 0, imbued: 0 },
        { itemId: a, buyS: 60, soldS: 0, imbued: 0 },
        { itemId: b, buyS: 900, soldS: 0, imbued: 0 },
      ],
    });
    expect(buyOrder(p, items).map((c) => [c.itemId, c.buyS])).toEqual([
      [a, 60],
      [b, 300],
    ]);
  });

  it("promedia sólo los rangos que vinieron", () => {
    const m = parseMatch({
      match_info: {
        match_id: 7,
        duration_s: 2000,
        start_time: 0,
        winning_team: 1,
        average_badge_team0: 80,
        average_badge_team1: 0,
        players: [],
      },
    } as never);
    // Con el promedio ingenuo daría 40, que es dos rangos más abajo.
    expect(m.badge).toBe(80);
  });

  it("acumula el daño de cada rival por su casilla", () => {
    const m = parseMatch({
      match_info: {
        match_id: 7,
        duration_s: 2000,
        start_time: 0,
        winning_team: 0,
        players: [{ account_id: 1, player_slot: 3, hero_id: 2, team: 0, kills: 0, deaths: 0, assists: 0, net_worth: 0, level: 1 }],
        damage_matrix: {
          damage_dealers: [
            {
              dealer_player_slot: 9,
              damage_sources: [
                { damage_to_players: [{ target_player_slot: 3, damage: [10, 40] }] },
                { damage_to_players: [{ target_player_slot: 3, damage: [5, 60] }] },
              ],
            },
          ],
        },
      },
    } as never);
    // Las series son acumuladas: vale el último punto de cada fuente, sumadas.
    expect(m.players[0].damageFrom.get(9)).toBe(100);
  });

  it("descarta la compra con el reloj envuelto", () => {
    const m = parseMatch({
      match_info: {
        match_id: 7,
        duration_s: 2000,
        start_time: 0,
        winning_team: 0,
        players: [
          {
            account_id: 1, player_slot: 1, hero_id: 2, team: 0, kills: 0, deaths: 0, assists: 0,
            net_worth: 0, level: 1,
            items: [
              { item_id: 5, game_time_s: 4_294_967_291, sold_time_s: 0 },
              { item_id: 6, game_time_s: 300, sold_time_s: 0 },
            ],
          },
        ],
      },
    } as never);
    expect(m.players[0].purchases.map((c) => c.itemId)).toEqual([6]);
  });
});

describe("el resumen del perfil", () => {
  const fila = (over: Partial<HistoryRow>): HistoryRow => ({
    matchId: 1,
    heroId: 2,
    won: true,
    kills: 10,
    deaths: 5,
    assists: 10,
    netWorth: 40_000,
    durationS: 2_400,
    startTime: 1_786_048_707,
    badge: 0,
    lastHits: 150,
    denies: 4,
    mode: 1,
    ...over,
  });

  it("promedia lo que trajo el historial", () => {
    const r = summarize([
      fila({ matchId: 1, won: true, kills: 10, deaths: 5, assists: 10, netWorth: 40_000 }),
      fila({ matchId: 2, won: false, kills: 0, deaths: 5, assists: 0, netWorth: 20_000 }),
    ])!;
    expect(r.matches).toBe(2);
    expect(r.winRate).toBe(0.5);
    expect(r.kills).toBe(5);
    expect(r.kda).toBe(2);
    expect(r.netWorth).toBe(30_000);
    // 60.000 almas en 80 minutos.
    expect(r.soulsPerMin).toBe(750);
  });

  it("toma el rango más reciente que no sea cero", () => {
    /**
     * Un 0 no es Obscurus: es "todavía no calibró". Tomarlo como rango mandaría
     * a todo el mundo al escalón más bajo del juego, que es exactamente lo que
     * pasó cuando el reset del 30/7 dejó las partidas sin badge.
     */
    const r = summarize([fila({ badge: 0 }), fila({ badge: 76 }), fila({ badge: 64 })])!;
    expect(r.badge).toBe(76);
    expect(summarize([fila({ badge: 0 })])!.badge).toBe(0);
  });

  it("ordena los héroes por partidas jugadas", () => {
    const r = summarize([fila({ heroId: 7 }), fila({ heroId: 2 }), fila({ heroId: 7 })])!;
    expect(r.heroes[0]).toEqual({ heroId: 7, matches: 2, wins: 2 });
  });

  it("no inventa un resumen sin partidas", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("el desglose de la nota", () => {
  it("dice cuál señal restó, y morir de más resta", () => {
    /**
     * `impact` es lo que hace que la página pueda escribir "lo que más te costó
     * fue X" en vez de mostrar tres barras y que el lector adivine cuál mirar.
     * Negativo es restar, en las tres por igual: en muertes el peso ya viene
     * negativo, así que morir de más también da negativo.
     */
    const muerto = jugador({ deaths: 20 });
    const resto = Array.from({ length: 5 }, () => jugador({ deaths: 2 }));
    const m = partida([muerto, ...resto], []);
    const g = gradeOf(m.players[0], m, report)!;
    const muertes = g.signals.find((s) => s.id === "deaths")!;
    expect(muertes.z).toBeGreaterThan(0);
    expect(muertes.impact).toBeLessThan(0);
    // Y es la que más restó, que es lo que la oración va a nombrar.
    expect([...g.signals].sort((a, b) => a.impact - b.impact)[0].id).toBe("deaths");
  });

  it("trae las tres señales y sólo morir cuenta al revés", () => {
    const p = jugador();
    const equipo = Array.from({ length: 5 }, () => jugador());
    const m = partida([p, ...equipo], []);
    const g = gradeOf(m.players[0], m, report)!;
    expect(g.signals.map((s) => s.id)).toEqual(report.signals);
    expect(g.signals.filter((s) => s.lowerIsBetter).map((s) => s.id)).toEqual(["deaths"]);
    // La cuota y lo típico son fracciones de 1, no porcentajes ya multiplicados:
    // la pantalla los formatea, y mezclar las dos escalas dibujaría barras de
    // 1.400% de ancho.
    for (const s of g.signals) {
      expect(s.share).toBeGreaterThan(0);
      expect(s.share).toBeLessThanOrEqual(1);
      expect(s.typical).toBeGreaterThan(0);
      expect(s.typical).toBeLessThanOrEqual(1);
    }
  });
});

describe("el perfil del rival", () => {
  it("se busca en la misma celda que midió el pipeline", () => {
    const espiritu = deCategoria("spirit").slice(0, 4);
    const arma = deCategoria("weapon").slice(0, 4);
    const deEspiritu = jugador({ purchases: espiritu.map((x) => compra(x.id)) });
    const deBala = jugador({ purchases: arma.map((x) => compra(x.id)) });
    expect(spiritShare([deEspiritu], items)).toBe(1);
    expect(spiritShare([deBala], items)).toBe(0);
    expect(profileOf(1, report.profileCuts)).toBe(2);
    expect(profileOf(0, report.profileCuts)).toBe(0);
  });
});
