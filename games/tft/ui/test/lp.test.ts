import { describe, it, expect } from "vitest";
import { absoluteLp, attribute, series, type LpSnapshot } from "../src/lp";

describe("absoluteLp", () => {
  it("empieza en cero en el piso de la escala", () => {
    expect(absoluteLp("IRON", "IV", 0)).toBe(0);
  });

  it("cuenta cien por división y cuatrocientos por tier", () => {
    expect(absoluteLp("IRON", "I", 0)).toBe(300);
    expect(absoluteLp("BRONZE", "IV", 0)).toBe(400);
    expect(absoluteLp("GOLD", "I", 42)).toBe(3 * 400 + 300 + 42);
  });

  // El punto entero de la escala: sin ella este ascenso se lee como −88.
  it("hace que un ascenso sume", () => {
    const antes = absoluteLp("GOLD", "I", 100)!;
    const despues = absoluteLp("PLATINUM", "IV", 12)!;
    expect(despues - antes).toBe(12);
  });

  it("pega Master justo arriba de Diamante I", () => {
    expect(absoluteLp("DIAMOND", "I", 100)).toBe(absoluteLp("MASTER", "", 0));
  });

  it("trata Master, GM y Challenger como un solo pool", () => {
    expect(absoluteLp("CHALLENGER", "", 900)).toBe(absoluteLp("MASTER", "", 900));
    expect(absoluteLp("GRANDMASTER", "I", 300)).toBe(absoluteLp("MASTER", "", 300));
  });

  it("no se marea con minúsculas ni espacios", () => {
    expect(absoluteLp(" gold ", " i ", 42)).toBe(absoluteLp("GOLD", "I", 42));
  });

  it("devuelve null cuando no sabe", () => {
    expect(absoluteLp("", "", 0)).toBeNull();
    expect(absoluteLp("GOLD", "", 0)).toBeNull();
    expect(absoluteLp("UNRANKED", "I", 0)).toBeNull();
  });
});

const snap = (o: Partial<LpSnapshot> = {}): LpSnapshot => ({
  tier: "GOLD",
  division: "I",
  leaguePoints: 0,
  games: 100,
  setNumber: 17,
  takenAt: 1_000,
  ...o,
});

const game = (matchId: string, playedAt: number, queueId = 1100) => ({
  matchId,
  playedAt,
  queueId,
});

describe("series", () => {
  it("deja solo el set pedido y ordena por fecha", () => {
    const pts = series(
      [
        snap({ takenAt: 3_000, leaguePoints: 30 }),
        snap({ takenAt: 1_000, leaguePoints: 10 }),
        snap({ takenAt: 2_000, setNumber: 16 }),
      ],
      17
    );
    expect(pts.map((p) => p.takenAt)).toEqual([1_000, 3_000]);
  });

  it("descarta los que no se pueden ubicar en la escala", () => {
    expect(series([snap({ tier: "" })], 17)).toEqual([]);
  });

  it("sin set pedido no filtra por set", () => {
    expect(series([snap({ setNumber: 16 }), snap({ takenAt: 2_000 })], null)).toHaveLength(2);
  });
});

describe("attribute", () => {
  it("marca la partida cuando el contador dice que fue una sola", () => {
    const got = attribute(
      [
        snap({ takenAt: 1_000, games: 100, leaguePoints: 10 }),
        snap({ takenAt: 3_000, games: 101, leaguePoints: 44 }),
      ],
      [game("M1", 2_000)]
    );
    expect(got.get("M1")).toBe(34);
  });

  it("informa una pérdida con su signo", () => {
    const got = attribute(
      [
        snap({ takenAt: 1_000, games: 100, leaguePoints: 44 }),
        snap({ takenAt: 3_000, games: 101, leaguePoints: 26 }),
      ],
      [game("M1", 2_000)]
    );
    expect(got.get("M1")).toBe(-18);
  });

  it("no dice nada si el contador vio más partidas de las que tenemos", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100 }), snap({ takenAt: 3_000, games: 103 })],
      [game("M1", 2_000)]
    );
    expect(got.size).toBe(0);
  });

  it("no dice nada si hay dos candidatas para un solo movimiento", () => {
    const got = attribute(
      [snap({ takenAt: 1_000, games: 100 }), snap({ takenAt: 5_000, games: 101 })],
      [game("M1", 2_000), game("M2", 3_000)]
    );
    expect(got.size).toBe(0);
  });

  it("ignora las partidas que no son ranked al elegir la candidata", () => {
    const got = attribute(
      [
        snap({ takenAt: 1_000, games: 100, leaguePoints: 10 }),
        snap({ takenAt: 5_000, games: 101, leaguePoints: 30 }),
      ],
      [game("M1", 2_000, 1090), game("M2", 3_000, 1100)]
    );
    expect(got.get("M2")).toBe(20);
    expect(got.has("M1")).toBe(false);
  });

  it("no atribuye a través de un cambio de set", () => {
    const got = attribute(
      [
        snap({ takenAt: 1_000, games: 100, setNumber: 16 }),
        snap({ takenAt: 3_000, games: 101, setNumber: 17 }),
      ],
      [game("M1", 2_000)]
    );
    expect(got.size).toBe(0);
  });

  it("atribuye un ascenso como ganancia, no como derrumbe", () => {
    const got = attribute(
      [
        snap({ takenAt: 1_000, games: 100, tier: "GOLD", division: "I", leaguePoints: 100 }),
        snap({ takenAt: 3_000, games: 101, tier: "PLATINUM", division: "IV", leaguePoints: 12 }),
      ],
      [game("M1", 2_000)]
    );
    expect(got.get("M1")).toBe(12);
  });

  it("con un solo snapshot no hay ventana", () => {
    expect(attribute([snap()], [game("M1", 2_000)]).size).toBe(0);
  });

  it("no toma una partida anterior al primer snapshot", () => {
    const got = attribute(
      [snap({ takenAt: 2_000, games: 100 }), snap({ takenAt: 4_000, games: 101 })],
      [game("M1", 1_000)]
    );
    expect(got.size).toBe(0);
  });
});
