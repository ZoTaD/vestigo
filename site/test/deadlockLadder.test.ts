import { describe, it, expect } from "vitest";
import {
  FLOORS,
  MIN_ROWS,
  PODIUM_FLOORS,
  PODIUM_SIZE,
  RANKED_SINCE,
  wilsonScore,
} from "../src/deadlockLadder";

/**
 * El piso de partidas NO puede ser fijo: 200 funciona para un héroe popular y
 * deja vacío a uno raro. Baja por escalones hasta llegar a MIN_ROWS.
 */
describe("los escalones del piso", () => {
  it("van de mayor a menor y terminan en un número usable", () => {
    expect(FLOORS).toEqual([...FLOORS].sort((a, b) => b - a));
    expect(FLOORS[FLOORS.length - 1]).toBeGreaterThan(0);
  });

  /**
   * **El piso arrancaba en 200 y bajó a 50 el 2026-08-13**, y este test cambió
   * con él porque cambió su motivo. Existía para sacar a las cuentas de 30
   * partidas al 100%; ese problema lo resolvió el filtro de clasificatorias —en
   * el pool de 400 con 25+ partidas ranked, el winrate máximo es 79,3% y ninguno
   * pasa de 85%—, no el piso.
   *
   * Lo que el piso decide ahora es **cuánta gente compite por los cien lugares**:
   * con 100 partidas califican 782 personas y el número cien tiene 56% de
   * victorias; con 50 califican 7.490 y el número cien tiene 68,4%.
   *
   * 50 es además el que usa el propio Deadlock para sus leaderboards globales.
   */
  it("es el mismo que exige el juego para su leaderboard global", () => {
    expect(FLOORS[0]).toBe(50);
  });

  it("nunca baja tanto como para que una racha corta sea un ranking", () => {
    expect(FLOORS[FLOORS.length - 1]).toBeGreaterThanOrEqual(10);
  });

  it("pide al menos 20 filas para dar una tabla por buena", () => {
    expect(MIN_ROWS).toBe(20);
  });
});

/**
 * El podio de un héroe se conforma con menos partidas que la tabla global: son
 * dos semanas de ranked y exigir cien partidas CON UN HÉROE deja casi todos los
 * podios vacíos.
 */
describe("el podio por héroe", () => {
  /**
   * Los dos pisos son los del propio Deadlock: 50 para el leaderboard global y
   * 20 para los de héroe. Que el de héroe sea más flojo no es una concesión —es
   * la misma proporción que usa el juego.
   */
  it("es más flojo que la tabla global, y es el que usa el juego", () => {
    expect(PODIUM_FLOORS[0]).toBeLessThan(FLOORS[0]);
    expect(PODIUM_FLOORS[0]).toBe(20);
  });

  it("baja por escalones, igual que la tabla", () => {
    expect(PODIUM_FLOORS).toEqual([...PODIUM_FLOORS].sort((a, b) => b - a));
  });

  it("son tres puestos: oro, plata y bronce", () => {
    expect(PODIUM_SIZE).toBe(3);
  });
});

/**
 * **El modo clasificatorio existió hace dos años y volvió con el reset.** Sin el
 * corte por fecha, la tabla mezclaría a quienes lo jugaron en 2024 con los de
 * esta temporada — la misma trampa que documenta `RANKED_SINCE` del historial.
 */
describe("la ventana de clasificatorias", () => {
  it("arranca el día que ranked volvió, no antes", () => {
    expect(RANKED_SINCE).toBe(Date.UTC(2026, 6, 30, 16, 19, 0) / 1000);
  });

  it("está en segundos, que es lo que pide la API", () => {
    // En milisegundos serían 13 dígitos y la API devolvería vacío sin fallar,
    // que es la clase de error que se ve como "no hay jugadores".
    expect(String(RANKED_SINCE).length).toBe(10);
  });
});

/**
 * El puntaje que decide quién es el mejor. Los casos fijan el comportamiento,
 * no los decimales: si alguna vez se cambia la fórmula, estas tres cosas tienen
 * que seguir siendo ciertas o el ranking dejó de contestar la pregunta.
 */
describe("el puntaje de Wilson", () => {
  /**
   * **Wilson descuenta la muestra chica, pero NO la elimina**, y confundir las
   * dos cosas costó un test en rojo el 2026-08-13: se esperaba que 10-0 quedara
   * por debajo de 195-300 y no es así —da 0,72 contra 0,59—, porque diez
   * victorias seguidas son evidencia fuerte de verdad.
   *
   * Lo que saca del ranking a una cuenta de diez partidas es el PISO de
   * partidas (`FLOORS`, hoy 100 efectivas), no esta fórmula. Wilson ordena a
   * los que ya pasaron el piso; el piso decide quién entra.
   */
  it("descuenta la racha corta respecto de su propia tasa", () => {
    // 10 de 10 es un 100% crudo; el piso de Wilson lo baja a ~72%.
    expect(wilsonScore(10, 10)).toBeLessThan(0.8);
    expect(wilsonScore(10, 10)).toBeGreaterThan(0.6);
  });

  it("con la misma cantidad de partidas, gana el que ganó más", () => {
    expect(wilsonScore(70, 100)).toBeGreaterThan(wilsonScore(60, 100));
  });

  it("desempata a favor de quien tiene más evidencia", () => {
    // Mismo winrate, distinta muestra: gana el que lo sostuvo más veces.
    expect(wilsonScore(140, 200)).toBeGreaterThan(wilsonScore(70, 100));
  });

  it("nunca supera al winrate crudo: es un piso, no un premio", () => {
    for (const [w, n] of [
      [50, 100],
      [1, 3],
      [270, 300],
    ] as const) {
      expect(wilsonScore(w, n)).toBeLessThanOrEqual(w / n);
    }
  });

  it("no explota sin partidas", () => {
    expect(wilsonScore(0, 0)).toBe(0);
  });

  /**
   * El caso real que motivó el cambio, medido el 2026-08-13: ordenando por
   * ganadas, el número uno del mundo tenía 128 victorias en 270 partidas — un
   * 47,4%. Cualquiera de los que ganan menos pero mejor tiene que pasarle.
   */
  it("deja atrás al que jugó mucho y ganó poco", () => {
    const elQueMasJugo = wilsonScore(128, 270);
    const elQueMejorJuega = wilsonScore(65, 82);
    expect(elQueMejorJuega).toBeGreaterThan(elQueMasJugo);
  });
});
