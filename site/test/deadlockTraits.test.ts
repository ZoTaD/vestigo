import { describe, expect, it } from "vitest";
import { matchTraits, profileTraits, type ProfileInput } from "../src/deadlockTraits";
import type { HistoryRow, MatchPlayer, ParsedMatch } from "../src/deadlockMatch";
import { readFileSync } from "node:fs";
import { DEADLOCK_COPY } from "../src/deadlockCopy";

const row = (i: number, over: Partial<HistoryRow> = {}): HistoryRow => ({
  matchId: i,
  heroId: 1,
  won: i % 2 === 0,
  kills: 5,
  deaths: 5,
  assists: 5,
  netWorth: 30000,
  durationS: 1800,
  // Un día entre partidas: cada una es su propia sesión.
  startTime: 1_000_000 - i * 86_400,
  badge: 70,
  lastHits: 150,
  denies: 2,
  mode: 4,
  gameMode: 1,
  ...over,
});

const base = (over: Partial<ProfileInput>): ProfileInput => ({
  rows: [],
  vs: [],
  streak: null,
  forma: null,
  rankNet: null,
  mates: [],
  now: 1_000_000,
  ...over,
});

const ids = (ts: { id: string }[]) => ts.map((t) => t.id);

describe("Deadlock: rasgos del perfil", () => {
  it("lee los percentiles contra el rango, y los flojos al revés", () => {
    const vs = (key: string, percentile: number) => ({ key, mine: 0, median: 0, percentile, lowerIsBetter: false, digits: 0 });
    const out = profileTraits(base({ vs: [vs("accuracy", 82), vs("deaths", 20), vs("kda", 50)] }));
    expect(ids(out)).toEqual(["sharpshooter", "diesALot"]);
    expect(out[1].value).toBe(80);
  });

  it("racha, rango y especialista", () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(i, { won: i % 3 !== 0 }));
    const out = ids(profileTraits(base({ rows, streak: { length: 4, won: false }, rankNet: 3 })));
    expect(out).toContain("coldStreak");
    expect(out).toContain("climbing");
    expect(out).toContain("specialist");
    expect(out).toContain("oneTrick");
    expect(out).toContain("winning");
  });

  it("se tiltea: gana menos justo después de perder", () => {
    // Sesiones de dos partidas pegadas: la segunda se pierde si la primera se perdió.
    const rows: HistoryRow[] = [];
    for (let s = 0; s < 20; s++) {
      const perdio = s % 2 === 0;
      const t = 1_000_000 - s * 86_400;
      rows.push(row(s * 2, { startTime: t, won: !perdio }));
      rows.push(row(s * 2 + 1, { startTime: t + 1800 + 300, won: !perdio }));
    }
    expect(ids(profileTraits(base({ rows })))).toContain("tilts");
  });

  it("sin datos no afirma nada", () => {
    expect(profileTraits(base({ rows: [row(1), row(2)] }))).toEqual([]);
  });
});

const player = (slot: number, team: number, over: Partial<MatchPlayer> = {}): MatchPlayer => ({
  accountId: slot,
  slot,
  heroId: slot,
  team,
  won: team === 0,
  kills: 4,
  deaths: 4,
  assists: 4,
  netWorth: 30000 + slot,
  level: 30,
  damage: 20000 + slot,
  boss: 3000 + slot,
  healing: 0,
  abilityPoints: 30,
  lane: 1,
  purchases: [],
  souls: [
    { t: 600, netWorth: 8000 + slot },
    { t: 1800, netWorth: 30000 + slot },
  ],
  damageFrom: new Map(),
  ...over,
});

const matchOf = (players: MatchPlayer[]): ParsedMatch =>
  ({ matchId: 1, durationS: 1800, startTime: 0, winningTeam: 0, players }) as unknown as ParsedMatch;

describe("Deadlock: rasgos de una partida", () => {
  it("el que cargó la partida y el que la sufrió", () => {
    const players = Array.from({ length: 12 }, (_, i) => player(i, i < 6 ? 0 : 1));
    players[0] = player(0, 0, { damage: 60000, netWorth: 50000, kills: 15, deaths: 1 });
    players[7] = player(7, 1, { damage: 4000, deaths: 12, netWorth: 15000 });
    const m = matchOf(players);
    const carry = ids(matchTraits(players[0], m));
    expect(carry).toEqual(expect.arrayContaining(["mostSouls", "topDamage", "killLeader", "untouchable"]));
    const feeder = ids(matchTraits(players[7], m));
    expect(feeder).toEqual(expect.arrayContaining(["diedMost", "lowImpact", "poorest"]));
  });

  it("la remontada es del equipo que ganó viniendo de atrás", () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      player(i, i < 6 ? 0 : 1, {
        souls: [
          { t: 600, netWorth: i < 6 ? 6000 : 9000 },
          { t: 1800, netWorth: 30000 },
        ],
      })
    );
    const m = matchOf(players);
    expect(ids(matchTraits(players[0], m))).toContain("comeback");
    expect(ids(matchTraits(players[6], m))).toContain("threwLead");
  });
});

describe("Deadlock: cada rasgo tiene su texto", () => {
  it("en los dos idiomas, y para cada id que el módulo puede emitir", () => {
    const en = Object.keys(DEADLOCK_COPY.en.deadlock.report.traits.list).sort();
    const es = Object.keys(DEADLOCK_COPY.es.deadlock.report.traits.list).sort();
    expect(es).toEqual(en);
    // Los ids salen del código fuente: un rasgo nuevo sin texto no se dibujaría.
    const src = readFileSync(new URL("../src/deadlockTraits.ts", import.meta.url), "utf8");
    const emitted = new Set([...src.matchAll(/"([a-zA-Z]+)"(?=, "(?:good|bad|neutral)"|, "[a-zA-Z]+"\]|\])/g)].map((m) => m[1]));
    for (const id of ["farmer", "tilts", "comeback"]) expect(emitted).toContain(id);
    for (const id of emitted) expect(en, id).toContain(id);
  });
});
