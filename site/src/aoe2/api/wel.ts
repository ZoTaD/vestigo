/**
 * Cliente de la API de World's Edge para Age of Empires II: DE (2026-11-20): `https://aoe-api.worldsedgelink.com/
 * community/leaderboard/*` con `title=age2`. Es la misma familia que la de Relic (CoH), así que el pedido es `relicGet`.
 * No manda CORS: se lee desde la función de Netlify (`handler.ts`). Verificado el 20/11: responde sin login.
 *
 * Arriba, los pedidos; abajo, funciones puras que pasan la respuesta cruda a la forma chica que usa el sitio (tests en
 * `test/aoe2Api.test.ts`, con respuestas reales recortadas en `test/fixtures/aoe2/`).
 */
import { relicGet, steamIdOf } from "../../coh3/api/relic";

export const AOE2_API = { apiBase: "https://aoe-api.worldsedgelink.com/community/leaderboard", title: "age2" };

export type Aoe2Mode = "rm1v1" | "rmteam" | "ew1v1" | "ewteam" | "dm1v1" | "dmteam";
export type MatchMode = Aoe2Mode | "co" | "custom" | "other";

/**
 * Los rankings (`getAvailableLeaderboards?title=age2`, 20/11). `co` son los de mando (consola). Los temporales
 * (`RBW_*`, `POM_*`, 5 Battle Royale) se muestran sólo si devuelven filas.
 */
export const LEADERBOARDS: { id: number; mode: Aoe2Mode | "co" | "other"; team: boolean }[] = [
  { id: 3, mode: "rm1v1", team: false },
  { id: 4, mode: "rmteam", team: true },
  { id: 13, mode: "ew1v1", team: false },
  { id: 14, mode: "ewteam", team: true },
  { id: 1, mode: "dm1v1", team: false },
  { id: 2, mode: "dmteam", team: true },
  { id: 15, mode: "co", team: false },
  { id: 16, mode: "co", team: true },
  { id: 17, mode: "co", team: false },
  { id: 18, mode: "co", team: true },
  { id: 5, mode: "other", team: false },
  { id: 25, mode: "other", team: false },
  { id: 26, mode: "other", team: true },
  { id: 27, mode: "other", team: false },
  { id: 28, mode: "other", team: true },
  { id: 29, mode: "other", team: false },
  { id: 30, mode: "other", team: true },
];
export const isLeaderboard = (id: number): boolean => LEADERBOARDS.some((l) => l.id === id);
/** El ranking de cada modo (el que sirve para su ELO). */
export const LEADERBOARD_OF: Record<Aoe2Mode, number> = { rm1v1: 3, rmteam: 4, ew1v1: 13, ewteam: 14, dm1v1: 1, dmteam: 2 };

/**
 * `matchtype_id` → modo. Verificado el 20/11 con los historiales de 5 jugadores de cada ranking: los de RM 1v1 juegan
 * 6 (2 jugadores), los de equipos 7/8/9 (4/6/8); Empire Wars 26–29 con la misma escala; Death Match 2 (1v1) y 3–5 (el 4
 * con 6 jugadores); mando 66–69. 0 es personalizada; 18–21 (rápidas) y 122/124 (mapas de la semana) quedan como "other".
 */
export function modeOfMatchType(t: number): MatchMode {
  if (t === 6) return "rm1v1";
  if (t >= 7 && t <= 9) return "rmteam";
  if (t === 26) return "ew1v1";
  if (t >= 27 && t <= 29) return "ewteam";
  if (t === 2) return "dm1v1";
  if (t >= 3 && t <= 5) return "dmteam";
  if (t >= 66 && t <= 69) return "co";
  if (t === 0) return "custom";
  return "other";
}

// ---------- Forma cruda (sólo lo que se lee) ----------

type RawMember = { profile_id: number; name: string; alias: string; country?: string; clanlist_name?: string; level?: number };
type RawStatGroup = { id: number; members: RawMember[] };
type RawStat = {
  statgroup_id: number;
  leaderboard_id: number;
  wins: number;
  losses: number;
  streak: number;
  rank: number;
  rating: number;
  highestrating?: number;
  lastmatchdate: number;
};
export type RawAoe2Leaderboard = { statGroups: RawStatGroup[]; leaderboardStats: RawStat[]; rankTotal: number };
export type RawAoe2Personal = { statGroups: RawStatGroup[]; leaderboardStats: RawStat[] };
export type RawAoe2Match = {
  id: number;
  mapname: string;
  matchtype_id: number;
  startgametime: number;
  completiontime: number;
  observertotal?: number;
  options?: string;
  matchhistorymember: { profile_id: number; civilization_id: number; teamid: number; outcome: number; oldrating: number; newrating: number }[];
  matchhistoryreportresults?: { profile_id: number; resulttype: number; teamid: number; civilization_id: number }[];
};
export type RawAoe2History = { matchHistoryStats: RawAoe2Match[]; profiles: RawMember[] };

// ---------- Pedidos ----------

export const getLeaderboard = (f: typeof fetch, id: number, start: number, count: number) =>
  relicGet<RawAoe2Leaderboard>(f, AOE2_API, "getLeaderBoard2", { leaderboard_id: id, start, count, sortBy: 1 });
export const getPersonalStat = (f: typeof fetch, profileId: number) =>
  relicGet<RawAoe2Personal>(f, AOE2_API, "GetPersonalStat", { profile_ids: JSON.stringify([profileId]) });
/** Búsqueda exacta por alias (distingue mayúsculas, igual que en CoH). */
export const findByAlias = (f: typeof fetch, alias: string) =>
  relicGet<RawAoe2Personal>(f, AOE2_API, "GetPersonalStat", { aliases: JSON.stringify([alias]) });
export const findBySteamId = (f: typeof fetch, steamId: string) =>
  relicGet<RawAoe2Personal>(f, AOE2_API, "GetPersonalStat", { profile_names: JSON.stringify([`/steam/${steamId}`]) });
/** Las ≈ 64 partidas más recientes del jugador. */
export const getRecentMatches = (f: typeof fetch, profileId: number) =>
  relicGet<RawAoe2History>(f, AOE2_API, "getRecentMatchHistory", { profile_ids: JSON.stringify([profileId]) });

// ---------- Normalización ----------

export type Aoe2Row = {
  rank: number;
  profileId: number;
  alias: string;
  country: string | null;
  elo: number;
  maxElo: number;
  wins: number;
  losses: number;
  streak: number;
  lastMatch: number;
};

function filas(raw: { statGroups: RawStatGroup[]; leaderboardStats: RawStat[] }): (Aoe2Row & { leaderboard: number; member: RawMember })[] {
  const grupos = new Map(raw.statGroups.map((g) => [g.id, g]));
  const out = [];
  for (const s of raw.leaderboardStats) {
    const m = grupos.get(s.statgroup_id)?.members[0];
    if (!m) continue;
    out.push({
      leaderboard: s.leaderboard_id,
      member: m,
      rank: s.rank,
      profileId: m.profile_id,
      alias: m.alias,
      country: m.country || null,
      elo: s.rating,
      maxElo: Math.max(s.rating, s.highestrating ?? 0),
      wins: s.wins,
      losses: s.losses,
      streak: s.streak,
      lastMatch: s.lastmatchdate,
    });
  }
  return out;
}

export function normalizeLeaderboard(raw: RawAoe2Leaderboard): { total: number; rows: Aoe2Row[] } {
  // `leaderboardStats` ya viene en el orden del ranking: se respeta.
  return { total: raw.rankTotal, rows: filas(raw).map(({ leaderboard: _l, member: _m, ...r }) => r) };
}

export type Aoe2Profile = { id: number; alias: string; country: string | null; steamId: string | null; clan: string | null; level: number };
export type Aoe2Standing = { leaderboard: number; elo: number; maxElo: number; rank: number; wins: number; losses: number; streak: number; lastMatch: number };

const perfil = (m: RawMember): Aoe2Profile => ({
  id: m.profile_id,
  alias: m.alias,
  country: m.country || null,
  steamId: steamIdOf(m.name),
  clan: m.clanlist_name || null,
  level: m.level ?? 0,
});

/** El perfil y un puesto por ranking; null si la respuesta no trae a ese jugador. */
export function normalizePersonal(raw: RawAoe2Personal, profileId: number): { profile: Aoe2Profile; standings: Aoe2Standing[] } | null {
  const m = raw.statGroups.flatMap((g) => g.members).find((x) => x.profile_id === profileId);
  if (!m) return null;
  const standings = filas(raw)
    .filter((r) => r.profileId === profileId)
    .map(({ leaderboard, elo, maxElo, rank, wins, losses, streak, lastMatch }) => ({ leaderboard, elo, maxElo, rank, wins, losses, streak, lastMatch }));
  return { profile: perfil(m), standings };
}

export type SearchResult = Aoe2Profile & { best: { leaderboard: number; elo: number; rank: number } | null };
export function normalizeSearch(raw: RawAoe2Personal): SearchResult[] {
  const st = filas(raw);
  return raw.statGroups.flatMap((g) => g.members).map((m) => {
    const mejor = st.filter((s) => s.profileId === m.profile_id).sort((a, b) => b.elo - a.elo)[0];
    return { ...perfil(m), best: mejor ? { leaderboard: mejor.leaderboard, elo: mejor.elo, rank: mejor.rank } : null };
  });
}

export type Aoe2Result = "win" | "loss" | "other";
export type Aoe2Player = {
  profileId: number;
  alias: string;
  country: string | null;
  civ: number;
  team: number;
  color: number | null;
  oldElo: number | null;
  newElo: number | null;
  result: Aoe2Result;
};
export type Aoe2Match = {
  id: number;
  start: number;
  end: number;
  map: string;
  matchType: number;
  mode: MatchMode;
  observers: number;
  /** El base64 crudo; el intermediario lo decodifica (`mapSize`) y lo manda en null. */
  options: string | null;
  /** Tamaño del mapa en casillas (de las opciones). */
  mapSize?: number;
  players: Aoe2Player[];
};

/** `"Arabian Desert.rms"` → `"arabian-desert"`. */
export const mapSlug = (name: string): string =>
  name
    .replace(/\.rms2?$/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** `outcome` 1 = ganó y 0 = perdió (verificado con el ELO de antes y después); cualquier otro valor, "other". */
const resultado = (o: number): Aoe2Result => (o === 1 ? "win" : o === 0 ? "loss" : "other");
const elo = (v: number): number | null => (v > 0 ? v : null);

export function normalizeHistory(raw: RawAoe2History): Aoe2Match[] {
  const perfiles = new Map((raw.profiles ?? []).map((p) => [p.profile_id, p]));
  return raw.matchHistoryStats
    .map((m) => ({
      id: m.id,
      start: m.startgametime,
      end: m.completiontime,
      map: mapSlug(m.mapname),
      matchType: m.matchtype_id,
      mode: modeOfMatchType(m.matchtype_id),
      observers: m.observertotal ?? 0,
      options: m.options ?? null,
      players: m.matchhistorymember.map((x) => {
        const p = perfiles.get(x.profile_id);
        return {
          profileId: x.profile_id,
          alias: p?.alias ?? String(x.profile_id),
          country: p?.country || null,
          civ: x.civilization_id,
          team: x.teamid,
          color: null,
          oldElo: elo(x.oldrating),
          newElo: elo(x.newrating),
          result: resultado(x.outcome),
        };
      }),
    }))
    .sort((a, b) => b.start - a.start);
}

export const normalizeMatch = (raw: RawAoe2History, id: number): Aoe2Match | null => normalizeHistory(raw).find((m) => m.id === id) ?? null;
