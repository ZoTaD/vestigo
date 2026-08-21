import { describe, it, expect } from "vitest";
import {
  RANKED_MODE,
  RANKED_SINCE,
  RANKED_MIN,
  FORM_WINDOW,
  rankedCorpus,
  streakOf,
  formOf,
  summarize,
  type HistoryRow,
} from "../src/deadlockMatch";

/** Una fila de historial de mentira, con lo mínimo y lo que cada prueba pida encima. */
function fila(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    matchId: 1,
    heroId: 2,
    won: true,
    kills: 5,
    deaths: 5,
    assists: 5,
    netWorth: 40_000,
    durationS: 2_400,
    startTime: RANKED_SINCE,
    badge: 0,
    lastHits: 150,
    denies: 4,
    mode: RANKED_MODE,
    ...over,
  };
}

const DIA = 86_400;

describe("streakOf", () => {
  // "1 victoria seguida" no es una racha, es la última partida (regla del diseño).
  it("una sola partida no es racha", () => {
    expect(streakOf([fila({ won: true })])).toBeNull();
  });

  it("sin filas no hay racha", () => {
    expect(streakOf([])).toBeNull();
  });

  it("cuenta las victorias consecutivas desde la más reciente", () => {
    const rows = [fila({ won: true }), fila({ won: true }), fila({ won: true }), fila({ won: false })];
    expect(streakOf(rows)).toEqual({ length: 3, won: true });
  });

  // Una racha se corta en la primera partida que no comparte el resultado, sin
  // seguir mirando más allá por si hay otra tanda del mismo signo.
  it("una derrota en el medio corta la racha ahí, sin seguir contando después", () => {
    const rows = [
      fila({ won: true }),
      fila({ won: true }),
      fila({ won: false }),
      fila({ won: true }),
      fila({ won: true }),
      fila({ won: true }),
    ];
    expect(streakOf(rows)).toEqual({ length: 2, won: true });
  });

  it("también cuenta rachas de derrotas", () => {
    const rows = [fila({ won: false }), fila({ won: false }), fila({ won: true })];
    expect(streakOf(rows)).toEqual({ length: 2, won: false });
  });
});

/**
 * El caso que más cuesta si se rompe: el modo 4 existió hace dos años, se dejó
 * de jugar y volvió el 2026-07-30. Medido contra la cuenta real, hay 40 filas
 * modo 4 de hasta 632 días antes del reset — otra época del juego — y ese hueco
 * significa que nunca pueden contar como ranked, ni siquiera para decidir si hay
 * muestra. Si `rankedCorpus` las contara, una cuenta vieja con historial largo
 * "tendría ranked" el mismo día que abrió el modo, sin haber jugado ni una.
 */
describe("rankedCorpus — el hueco de 632 días", () => {
  const antes = RANKED_SINCE - 632 * DIA;

  it("nunca cuenta el modo 4 anterior al reset, ni para el número ni para el filtro", () => {
    const viejas = Array.from({ length: 15 }, (_, i) => fila({ mode: RANKED_MODE, startTime: antes - i * DIA }));
    const nuevasRanked = Array.from({ length: 6 }, (_, i) =>
      fila({ mode: RANKED_MODE, startTime: RANKED_SINCE + i * 3_600 })
    );
    const noRanked = Array.from({ length: 5 }, (_, i) => fila({ mode: 1, startTime: RANKED_SINCE + i * 3_600 }));
    const rows = [...nuevasRanked, ...noRanked, ...viejas];

    const corpus = rankedCorpus(rows);
    // Si las 15 viejas contaran, el total sería 21 (≥10) y el corte se habría
    // hecho mal: de acá para abajo, todo lo que sigue prueba que no pasó.
    expect(corpus.ranked).toBe(6);
    expect(corpus.fallback).toBe(true);
    expect(corpus.rows).toHaveLength(rows.length);
  });

  it("una fila justo en el segundo de apertura cuenta; un segundo antes no", () => {
    const justo = fila({ mode: RANKED_MODE, startTime: RANKED_SINCE });
    const antesDeUnSegundo = fila({ mode: RANKED_MODE, startTime: RANKED_SINCE - 1 });
    expect(rankedCorpus([justo]).ranked).toBe(1);
    expect(rankedCorpus([antesDeUnSegundo]).ranked).toBe(0);
  });
});

describe("rankedCorpus — el umbral de 10", () => {
  const ranked = (n: number) =>
    Array.from({ length: n }, (_, i) => fila({ mode: RANKED_MODE, startTime: RANKED_SINCE + i * 3_600 }));
  const otras = Array.from({ length: 5 }, (_, i) => fila({ mode: 1, startTime: RANKED_SINCE + i * 3_600 }));

  it("con 9 ranked (debajo del mínimo) devuelve todo y marca el respaldo", () => {
    const rows = [...ranked(9), ...otras];
    const corpus = rankedCorpus(rows);
    expect(corpus.ranked).toBe(9);
    expect(corpus.fallback).toBe(true);
    expect(corpus.rows).toHaveLength(rows.length);
  });

  it("con exactamente 10 ranked ya alcanza: sólo ranked, sin respaldo", () => {
    const rows = [...ranked(10), ...otras];
    const corpus = rankedCorpus(rows);
    expect(corpus.ranked).toBe(10);
    expect(corpus.fallback).toBe(false);
    expect(corpus.rows).toHaveLength(10);
    expect(corpus.rows.every((r) => r.mode === RANKED_MODE && r.startTime >= RANKED_SINCE)).toBe(true);
  });

  it("no modifica el array que recibió", () => {
    const rows = [...ranked(10), ...otras];
    const copia = [...rows];
    rankedCorpus(rows);
    expect(rows).toEqual(copia);
  });
});

describe("formOf", () => {
  it("sin partidas no hay forma", () => {
    expect(formOf([])).toBeNull();
  });

  it("usa la ventana de 20 por defecto", () => {
    const rows = Array.from({ length: 25 }, (_, i) => fila({ won: i < 12 }));
    const f = formOf(rows)!;
    expect(f.results).toHaveLength(FORM_WINDOW);
    expect(f.wins + f.losses).toBe(FORM_WINDOW);
  });

  // Con menos partidas que la ventana, se informa lo que hay: no se rellena
  // hasta 20 con algo que no jugó.
  it("con menos filas que la ventana, usa las que hay sin rellenar", () => {
    const rows = [fila({ won: true }), fila({ won: true }), fila({ won: false })];
    const f = formOf(rows)!;
    expect(f.results).toEqual([true, true, false]);
    expect(f.wins).toBe(2);
    expect(f.losses).toBe(1);
  });

  it("la más reciente va primero en la tira", () => {
    const rows = [fila({ won: false }), fila({ won: true })];
    expect(formOf(rows)!.results).toEqual([false, true]);
  });

  it("acepta una ventana más chica que la que pida el que llama", () => {
    const rows = Array.from({ length: 10 }, () => fila({ won: true }));
    expect(formOf(rows, 3)!.results).toHaveLength(3);
  });

  it("no modifica el array que recibió", () => {
    const rows = [fila({ won: true }), fila({ won: false })];
    const copia = [...rows];
    formOf(rows);
    expect(rows).toEqual(copia);
  });
});

describe("summarize — regresión más los promedios nuevos", () => {
  it("sigue dando lo mismo que antes en los campos que ya tenía", () => {
    const r = summarize([
      fila({ matchId: 1, won: true, kills: 10, deaths: 5, assists: 10, netWorth: 40_000 }),
      fila({ matchId: 2, won: false, kills: 0, deaths: 5, assists: 0, netWorth: 20_000 }),
    ])!;
    expect(r.matches).toBe(2);
    expect(r.winRate).toBe(0.5);
    expect(r.kills).toBe(5);
    expect(r.kda).toBe(2);
    expect(r.netWorth).toBe(30_000);
    expect(r.soulsPerMin).toBe(750);
  });

  // Medido sobre 475 filas reales: last_hits mediana 174, denies mediana 4. Acá
  // sólo se fija que se promedien igual que kills/deaths, con números simples.
  it("promedia los golpes y los denies por partida", () => {
    const r = summarize([
      fila({ matchId: 1, lastHits: 200, denies: 6 }),
      fila({ matchId: 2, lastHits: 100, denies: 2 }),
    ])!;
    expect(r.lastHits).toBe(150);
    expect(r.denies).toBe(4);
  });
});
