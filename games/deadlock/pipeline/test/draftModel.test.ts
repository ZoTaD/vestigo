import { describe, expect, it } from "vitest";
import { draftMargin, evaluate, fitBand, fitScale, heroScore, tablesOf, teamsOf } from "../src/draftModel";
import type { HeroInsightsFile } from "../src/heroInsights";

const ins = (heroes: HeroInsightsFile["heroes"]): HeroInsightsFile => ({
  generatedAt: "",
  band: "phantom-above",
  from: "2026-10-16",
  to: "2026-10-30",
  minPair: 100,
  heroes,
});
const vacio = { daily: [], perMatch: {} };

describe("modelo del draft", () => {
  const t = tablesOf(
    [
      { heroId: 1, winRate: 0.55 },
      { heroId: 2, winRate: 0.5 },
      { heroId: 3, winRate: 0.45 },
    ],
    ins({
      // 1 le gana a 2 mucho más de lo que dice su winrate; 2 juega bien con 3.
      "1": { ...vacio, vs: [[2, 998, 698]], with: [] },
      "2": { ...vacio, vs: [[1, 998, 300]], with: [[3, 198, 119]] },
      "3": { ...vacio, vs: [], with: [[2, 198, 119]] },
    })
  );

  it("un héroe sin cruces vale su winrate en log-odds", () => {
    expect(heroScore(t, 3, [], [1])).toBeCloseTo(Math.log(0.45 / 0.55), 6);
  });

  it("un rival que le cuesta lo hunde", () => {
    expect(heroScore(t, 2, [], [1])).toBeLessThan(heroScore(t, 2, [], []));
  });

  it("el margen es simétrico", () => {
    expect(draftMargin(t, [1], [2, 3])).toBeCloseTo(-draftMargin(t, [2, 3], [1]), 9);
  });

  it("un héroe desconocido cuenta como promedio", () => {
    expect(draftMargin(t, [99], [])).toBe(0);
  });

  it("la escala recupera la de los datos", () => {
    // Partidas sintéticas con P = σ(0.3·m): la escala ajustada tiene que andar cerca.
    const m: number[] = [];
    const w: number[] = [];
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20_000; i++) {
      const x = (azar() - 0.5) * 10;
      m.push(x);
      w.push(azar() < 1 / (1 + Math.exp(-0.3 * x)) ? 1 : 0);
    }
    expect(fitScale(m, w)).toBeCloseTo(0.3, 1);
    expect(evaluate(0.3, m, w).accuracy).toBeGreaterThan(0.6);
  });

  it("descarta partidas sin dos equipos de seis", () => {
    const seis = (team: string) => Array.from({ length: 6 }, (_, i) => ({ hero_id: i + 1, team }));
    expect(teamsOf({ match_id: 1, winning_team: "Team1", players: [...seis("Team0"), ...seis("Team1")] })?.win).toBe(0);
    expect(teamsOf({ match_id: 1, winning_team: "Team1", players: seis("Team0") })).toBeNull();
  });

  it("fitBand mide en la mitad que no usó", () => {
    const games = Array.from({ length: 200 }, (_, i) => ({ A: [1], B: [2], win: i % 3 === 0 ? 0 : 1 }));
    const r = fitBand(t, games);
    expect(r.matches).toBe(200);
    expect(r.accuracy).toBeGreaterThan(0.6);
  });
});
