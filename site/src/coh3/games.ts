/**
 * Lo que cambia entre Company of Heroes 3, 2 y 1 (2026-11-06) en la parte en vivo: la API de Relic de cada juego, sus
 * facciones, leaderboards, razas y tipos de partida. Diseño: docs/superpowers/specs/2026-11-06-coh-unificado-design.md.
 *
 * Sin React: lo usan la función de Netlify (`api/handler.ts`) y las pestañas. Los ids salen de
 * `getAvailableLeaderboards?title=coh2|coh1` (6/11). CoH1 es el relanzado de Steam (app 228200).
 */
import type { Lang } from "../i18n";
import { automatchId, factionOfRace, LEADERBOARDS, modeOfMatchType, type Mode } from "./api/leaderboards";

import type { CohGame } from "../route";
export type { CohGame };
export const COH_GAMES: CohGame[] = ["coh3", "coh2", "coh1"];
export type GameLeaderboard = { id: number; mode: Mode; faction: string; ranked: boolean };
export type MatchMode = { mode: Mode | "ai" | "custom" | "other"; ranked: boolean };

export interface GameConf {
  game: CohGame;
  /** El `title` de la API y el subdominio (`coh2-api.reliclink.com`). */
  title: string;
  apiBase: string;
  name: string;
  short: string;
  factions: string[];
  axis: string[];
  factionName: Record<Lang, Record<string, string>>;
  factionShort: Record<Lang, Record<string, string>>;
  factionIcon: Record<string, string>;
  leaderboards: GameLeaderboard[];
  raceToFaction: Record<number, string>;
  /** `matchtype_id` → modo (con "ai", "custom", "other" para lo que no es ranking por facción). */
  matchMode: (matchType: number) => MatchMode;
  /** `matchtype_id` → 1v1–4v4 si es una partida del ranking por facción; el resto → null. */
  modeOf: (matchType: number) => Mode | null;
  /** El leaderboard del ranking de un modo y una facción. */
  leaderboardOf: (mode: Mode, faction: string) => number;
  steamAppId: number;
  /** "coh3": ligas con nombre (Latón…Rival); "level": "Nivel N". */
  league: "coh3" | "level";
}

const MODES: Mode[] = ["1v1", "2v2", "3v3", "4v4"];
const api = (t: string) => `https://${t}-api.reliclink.com/community/leaderboard`;
/** CoH3 trae los emblemas del juego (webp); CoH1 y CoH2, por ahora, una insignia con la sigla (svg, `games/coh/tools/art.py`). */
/** CoH3 trae los emblemas del juego (webp); CoH1 y CoH2, por ahora, una insignia con la sigla (svg, `games/coh/tools/art.py`). */
const icons = (g: string, fs: string[]) => Object.fromEntries(fs.map((f) => [f, `/${g}/f/${f}.${g === "coh3" ? "webp" : "svg"}`]));

/** Los rankings de CoH1/CoH2: 4–19 = 1v1…4v4 con cuatro facciones por modo, en el orden de `orden`. */
function tabla(orden: string[], extra: GameLeaderboard[] = []): GameLeaderboard[] {
  return [
    ...MODES.flatMap((mode, i) => orden.map((faction, j) => ({ id: 4 + i * 4 + j, mode, faction, ranked: true }))),
    ...extra,
  ];
}

function conLeaderboards(c: Omit<GameConf, "leaderboardOf" | "modeOf">): GameConf {
  const por = new Map(c.leaderboards.filter((l) => l.ranked || c.game === "coh3").map((l) => [`${l.mode}|${l.faction}`, l.id]));
  return {
    ...c,
    leaderboardOf: (mode, faction) => {
      const id = por.get(`${mode}|${faction}`);
      if (id == null) throw new Error(`${c.game}: no hay leaderboard ${mode} ${faction}`);
      return id;
    },
    modeOf: (t) => {
      const m = c.matchMode(t).mode;
      return m === "ai" || m === "custom" || m === "other" ? null : m;
    },
  };
}

/** CoH1 y CoH2: 1–4 = 1v1…4v4 por facción; 0 personalizada; el resto (IA, equipos armados, Assault…) afuera. */
const modoClasico =
  (ia: (t: number) => boolean) =>
  (t: number): MatchMode =>
    t >= 1 && t <= 4 ? { mode: MODES[t - 1], ranked: true } : t === 0 ? { mode: "custom", ranked: false } : { mode: ia(t) ? "ai" : "other", ranked: false };

const COH3_FACTIONS = ["american", "british", "german", "dak"];
const COH3 = conLeaderboards({
  game: "coh3",
  title: "coh3",
  apiBase: api("coh3"),
  name: "Company of Heroes 3",
  short: "CoH3",
  factions: COH3_FACTIONS,
  axis: ["german", "dak"],
  factionName: {
    en: { american: "US Forces", british: "British Forces", german: "Wehrmacht", dak: "Afrika Korps" },
    es: { american: "Fuerzas de EE. UU.", british: "Fuerzas británicas", german: "Wehrmacht", dak: "Afrika Korps" },
  },
  factionShort: {
    en: { american: "USF", british: "British", german: "Wehrmacht", dak: "DAK" },
    es: { american: "EE. UU.", british: "Británicos", german: "Wehrmacht", dak: "DAK" },
  },
  factionIcon: icons("coh3", COH3_FACTIONS),
  leaderboards: [...LEADERBOARDS],
  raceToFaction: Object.fromEntries([129494, 137123, 198437, 203852, 197345].map((r) => [r, factionOfRace(r)!])),
  matchMode: modeOfMatchType,
  steamAppId: 1677280,
  league: "coh3",
});
// En CoH3 el ranking que se muestra es el de automatch (no el "ranked", vacío).
COH3.leaderboardOf = (mode, faction) => automatchId(mode, faction as never);

const COH2_FACTIONS = ["wehrmacht", "soviet", "okw", "usf", "british"];
const COH2 = conLeaderboards({
  game: "coh2",
  title: "coh2",
  apiBase: api("coh2"),
  name: "Company of Heroes 2",
  short: "CoH2",
  factions: COH2_FACTIONS,
  axis: ["wehrmacht", "okw"],
  factionName: {
    en: { wehrmacht: "Ostheer", soviet: "Soviet Union", okw: "Oberkommando West", usf: "US Forces", british: "British Forces" },
    es: { wehrmacht: "Ostheer", soviet: "Unión Soviética", okw: "Oberkommando West", usf: "Fuerzas de EE. UU.", british: "Fuerzas británicas" },
  },
  factionShort: {
    en: { wehrmacht: "Ostheer", soviet: "Soviets", okw: "OKW", usf: "USF", british: "UKF" },
    es: { wehrmacht: "Ostheer", soviet: "Soviéticos", okw: "OKW", usf: "EE. UU.", british: "Británicos" },
  },
  factionIcon: icons("coh2", COH2_FACTIONS),
  leaderboards: tabla(["wehrmacht", "soviet", "okw", "usf"], MODES.map((mode, i) => ({ id: 51 + i, mode, faction: "british", ranked: true }))),
  raceToFaction: { 0: "wehrmacht", 1: "soviet", 2: "okw", 3: "usf", 4: "british" },
  matchMode: modoClasico((t) => t >= 5 && t <= 16),
  steamAppId: 231430,
  league: "level",
});

const COH1_FACTIONS = ["american", "wehrmacht", "british", "panzer_elite"];
const COH1 = conLeaderboards({
  game: "coh1",
  title: "coh1",
  apiBase: api("coh1"),
  name: "Company of Heroes",
  short: "CoH1",
  factions: COH1_FACTIONS,
  axis: ["wehrmacht", "panzer_elite"],
  factionName: {
    en: { american: "Americans", wehrmacht: "Wehrmacht", british: "British", panzer_elite: "Panzer Elite" },
    es: { american: "Estadounidenses", wehrmacht: "Wehrmacht", british: "Británicos", panzer_elite: "Panzer Elite" },
  },
  factionShort: {
    en: { american: "Americans", wehrmacht: "Wehrmacht", british: "British", panzer_elite: "Panzer Elite" },
    es: { american: "EE. UU.", wehrmacht: "Wehrmacht", british: "Británicos", panzer_elite: "Panzer Elite" },
  },
  factionIcon: icons("coh1", COH1_FACTIONS),
  leaderboards: tabla(COH1_FACTIONS),
  raceToFaction: { 0: "american", 1: "wehrmacht", 2: "british", 3: "panzer_elite" },
  matchMode: modoClasico((t) => t === 14),
  steamAppId: 228200,
  league: "level",
});

export const GAMES: Record<CohGame, GameConf> = { coh3: COH3, coh2: COH2, coh1: COH1 };
export const gameOf = (g: CohGame | undefined): GameConf => GAMES[g ?? "coh3"];
export const isCohGame = (v: string | null | undefined): v is CohGame => v === "coh3" || v === "coh2" || v === "coh1";

const POR_ID: Record<CohGame, Map<number, GameLeaderboard>> = {
  coh3: new Map(COH3.leaderboards.map((l) => [l.id, l])),
  coh2: new Map(COH2.leaderboards.map((l) => [l.id, l])),
  coh1: new Map(COH1.leaderboards.map((l) => [l.id, l])),
};
export const leaderboardIn = (c: GameConf, id: number): GameLeaderboard | undefined => POR_ID[c.game].get(id);
