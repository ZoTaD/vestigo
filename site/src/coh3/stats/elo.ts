/**
 * La memoria de ELO de CoH1 y CoH2 (2026-11-06): `games/<juego>/stats/elo/<leaderboard>.json` = `{statgroup: [ELO,
 * sello]}`, que escribe `games/coh/tools/relic_daily.py` todos los días. Cada archivo viaja en su propio chunk y se pide
 * sólo cuando se abre ese ranking.
 */
import type { CohGame } from "../../route";

type Elo = Record<string, [number, number]>;
type Mod = { default: Elo };
const ARCHIVOS: Record<"coh2" | "coh1", Record<string, () => Promise<Mod>>> = {
  coh2: import.meta.glob<Mod>("../../../../games/coh2/stats/elo/*.json"),
  coh1: import.meta.glob<Mod>("../../../../games/coh1/stats/elo/*.json"),
};
const cache = new Map<string, Elo>();

/** El ELO conocido de un leaderboard, o `{}` si todavía no hay archivo. CoH3 no lo necesita (su ranking lo trae). */
export function loadElo(game: CohGame, leaderboard: number): Promise<Elo> {
  if (game === "coh3") return Promise.resolve({});
  const k = `${game}/${leaderboard}`;
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const archivo = Object.entries(ARCHIVOS[game]).find(([p]) => p.endsWith(`/elo/${leaderboard}.json`))?.[1];
  if (!archivo) return Promise.resolve({});
  return archivo().then((m) => {
    cache.set(k, m.default);
    return m.default;
  });
}
