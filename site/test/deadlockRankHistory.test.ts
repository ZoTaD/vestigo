import { describe, it, expect } from "vitest";
import { scoreOf, rankSteps, trailOf, type RankPoint } from "../src/deadlockRankHistory";

/** Un punto de `mmr-history` de mentira: sólo el badge y, si hace falta, cuándo. */
function punto(badge: number, i: number, over: Partial<RankPoint> = {}): RankPoint {
  return {
    matchId: 1000 + i,
    startTime: 1_786_000_000 + i * 3_600,
    badge,
    score: scoreOf(badge),
    ...over,
  };
}

describe("scoreOf", () => {
  // Medido en vivo el 2026-09-07 sobre tres cuentas (14, 164 y 241 partidas):
  // `player_score` es exactamente `(división − 1) × 6 + subnivel`, así que la
  // escala vertical del gráfico es el escalón de la escalera, sin inventar nada.
  it("es el escalón de la escalera, del 1 al 66", () => {
    expect(scoreOf(11)).toBe(1);
    expect(scoreOf(16)).toBe(6);
    expect(scoreOf(21)).toBe(7);
    expect(scoreOf(71)).toBe(37);
    expect(scoreOf(116)).toBe(66);
  });

  it("sigue contando arriba de Eternus VI, que es lo que hace el juego", () => {
    expect(scoreOf(121)).toBe(67);
  });
});

describe("rankSteps", () => {
  it("marca el delta contra la partida anterior, y 0 en la primera", () => {
    const pasos = rankSteps([punto(71, 0), punto(71, 1), punto(72, 2), punto(71, 3)]);
    expect(pasos.get(1000)).toMatchObject({ badge: 71, previo: 0, delta: 0 });
    expect(pasos.get(1001)).toMatchObject({ badge: 71, previo: 71, delta: 0 });
    expect(pasos.get(1002)).toMatchObject({ badge: 72, previo: 71, delta: 1 });
    expect(pasos.get(1003)).toMatchObject({ badge: 71, previo: 72, delta: -1 });
  });

  it("ignora las filas sin rango", () => {
    const pasos = rankSteps([punto(0, 0), punto(71, 1)]);
    expect(pasos.has(1000)).toBe(false);
    expect(pasos.get(1001)).toMatchObject({ previo: 0, delta: 0 });
  });
});

describe("trailOf", () => {
  it("no dibuja nada con menos de dos puntos", () => {
    expect(trailOf([])).toBeNull();
    expect(trailOf([punto(71, 0)])).toBeNull();
  });

  it("mide el neto en subniveles entre la primera y la última", () => {
    const t = trailOf([punto(71, 0), punto(72, 1), punto(73, 2), punto(73, 3)]);
    expect(t?.net).toBe(2);
    expect(t?.first.badge).toBe(71);
    expect(t?.last.badge).toBe(73);
    expect(t?.matches).toBe(4);
  });

  // Un ascenso de Arconte VI (76) a Oráculo I (81) es UN subnivel, no cinco:
  // el badge salta de decena y el escalón no.
  it("cruza de división sin inflar el neto", () => {
    const t = trailOf([punto(76, 0), punto(81, 1)]);
    expect(t?.net).toBe(1);
  });

  it("recuerda el pico sólo cuando quedó atrás", () => {
    const sube = trailOf([punto(71, 0), punto(73, 1), punto(72, 2)]);
    expect(sube?.peak?.badge).toBe(73);
    const enElPico = trailOf([punto(71, 0), punto(72, 1), punto(73, 2)]);
    expect(enElPico?.peak).toBeNull();
  });

  it("ordena por fecha aunque la API venga desordenada", () => {
    const t = trailOf([punto(73, 2), punto(71, 0), punto(72, 1)]);
    expect(t?.points.map((p) => p.badge)).toEqual([71, 72, 73]);
    expect(t?.net).toBe(2);
  });

  it("descarta las filas sin rango", () => {
    const t = trailOf([punto(0, 0), punto(71, 1), punto(72, 2)]);
    expect(t?.matches).toBe(2);
  });

  // Los cortes de división que quedan DENTRO del recorrido, con el badge del
  // primer subnivel de la división que empieza ahí: la línea se rotula con
  // el rango al que se entra, que es lo que alguien quiere leer.
  it("ubica los cortes de división que el recorrido cruza", () => {
    const t = trailOf([punto(75, 0), punto(76, 1), punto(81, 2), punto(82, 3)]);
    expect(t?.boundaries).toEqual([{ score: 42.5, badge: 81 }]);
    const sinCruce = trailOf([punto(71, 0), punto(73, 1)]);
    expect(sinCruce?.boundaries).toEqual([]);
  });

  // La escala vertical deja medio escalón de aire arriba y abajo, y nunca es
  // más angosta que dos escalones: una línea plana en el centro y no pegada
  // al borde.
  it("da una escala con aire, y una mínima cuando la línea es plana", () => {
    const t = trailOf([punto(71, 0), punto(73, 1)]);
    expect(t?.lo).toBe(36.5);
    expect(t?.hi).toBe(39.5);
    const plana = trailOf([punto(71, 0), punto(71, 1)]);
    expect(plana?.lo).toBe(36);
    expect(plana?.hi).toBe(38);
  });
});
