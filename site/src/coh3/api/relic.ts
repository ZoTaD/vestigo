/**
 * Cliente de la API de Relic para CoH3 (2026-11-04): `https://coh3-api.reliclink.com/community/leaderboard/*` con
 * `title=coh3` (Steam). No manda CORS, así que se lee desde la función de Netlify (`handler.ts`).
 *
 * Arriba, los pedidos (con tiempo límite); abajo, funciones puras que pasan la respuesta cruda a la forma chica que usa
 * el sitio (con tests en `test/coh3Api.test.ts`). Relic contesta 200 también cuando falla: el error viene en
 * `result.code` (0 = SUCCESS; 5 NOT_FOUND, 6 UNKNOWN_PROFILE_IDS, 9 UNKNOWN_ALIASES…).
 */
import { factionOfRace, leaderboardById, modeOfMatchType, type Faction, type Mode } from "./leaderboards";

const BASE = "https://coh3-api.reliclink.com/community/leaderboard";
const UA = "Mozilla/5.0 (compatible; VestigoBot/1.0; +https://vestigo.gg)";
const TIEMPO = 7000;

/** La falla de un pedido: `upstream` es el estado HTTP, o el `result.code` de Relic si contestó 200, o 0 si no contestó. */
export class RelicError extends Error {
  constructor(readonly upstream: number) {
    super(`relic ${upstream}`);
  }
}

export const RELIC_NOT_FOUND = 5;
export const RELIC_UNKNOWN_PROFILE_IDS = 6;
export const RELIC_UNKNOWN_ALIASES = 9;

async function pedir<T>(fetcher: typeof fetch, path: string, params: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), title: "coh3" });
  let r: Response;
  try {
    r = await fetcher(`${BASE}/${path}?${q}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIEMPO),
    });
  } catch {
    throw new RelicError(0);
  }
  if (!r.ok) throw new RelicError(r.status);
  let data: { result?: { code?: number } };
  try {
    data = await r.json();
  } catch {
    throw new RelicError(r.status);
  }
  const code = data.result?.code ?? -1;
  if (code !== 0) throw new RelicError(code);
  return data as T;
}

// ---------- Forma cruda (sólo lo que se lee) ----------

export type RawMember = {
  profile_id: number;
  name: string;
  alias: string;
  personal_statgroup_id?: number;
  xp?: number;
  level?: number;
  leaderboardregion_id?: number;
  country?: string;
};
export type RawStatGroup = { id: number; type?: number; members: RawMember[] };
export type RawStat = {
  statgroup_id: number;
  leaderboard_id: number;
  wins: number;
  losses: number;
  streak: number;
  rank: number;
  ranktotal?: number;
  ranklevel?: number;
  rating: number;
  regionrank?: number;
  lastmatchdate: number;
  highestrating?: number;
};
export type RawLeaderboard = { statGroups: RawStatGroup[]; leaderboardStats: RawStat[]; rankTotal: number };
export type RawPersonalStat = { statGroups: RawStatGroup[]; leaderboardStats: RawStat[] };
export type RawMatch = {
  id: number;
  mapname: string;
  matchtype_id: number;
  description?: string;
  startgametime: number;
  completiontime: number;
  maxplayers?: number;
  matchhistoryreportresults: { profile_id: number; resulttype: number; teamid: number; race_id: number; counters: string }[];
  matchhistorymember: { profile_id: number; race_id: number; teamid: number; outcome: number; oldrating: number; newrating: number }[];
  matchurls?: { profile_id: number; key: string; size: number; datatype?: number }[];
};
export type RawHistory = { matchHistoryStats: RawMatch[]; profiles: RawMember[] };

// ---------- Pedidos ----------

export const getLeaderboard = (f: typeof fetch, id: number, start: number, count: number, region?: number) =>
  pedir<RawLeaderboard>(f, "getleaderboard2", {
    leaderboard_id: id,
    start,
    count,
    sortBy: 1,
    ...(region ? { leaderboardRegion_id: region } : {}),
  });

export const getPersonalStat = (f: typeof fetch, profileId: number) =>
  pedir<RawPersonalStat>(f, "getpersonalstat", { profile_ids: JSON.stringify([profileId]) });

/**
 * Búsqueda por alias: `getpersonalstat?aliases=["…"]`. Es exacta y distingue mayúsculas ("rei" no trae a "Rei"); con
 * más de un alias en la lista Relic contesta 503, así que va de a uno. No hay búsqueda por prefijo.
 */
export const findByAlias = (f: typeof fetch, alias: string) =>
  pedir<RawPersonalStat>(f, "getpersonalstat", { aliases: JSON.stringify([alias]) });

export const getRecentMatches = (f: typeof fetch, profileId: number) =>
  pedir<RawHistory>(f, "getRecentMatchHistoryByProfileId", { profile_id: profileId });

// ---------- Normalización ----------

/** `"/steam/76561198…"` → `"76561198…"`; otra plataforma → null. */
export const steamIdOf = (name: string | undefined): string | null => /^\/steam\/(\d{17})$/.exec(name ?? "")?.[1] ?? null;

export type LeaderboardRow = {
  rank: number;
  profileId: number;
  alias: string;
  country: string | null;
  steamId: string | null;
  elo: number;
  tier: number;
  wins: number;
  losses: number;
  streak: number;
  lastMatch: number;
  regionRank?: number;
};

export function normalizeLeaderboard(raw: RawLeaderboard, byRegion = false): { total: number; rows: LeaderboardRow[] } {
  const grupos = new Map(raw.statGroups.map((g) => [g.id, g]));
  const rows: LeaderboardRow[] = [];
  for (const s of raw.leaderboardStats) {
    const m = grupos.get(s.statgroup_id)?.members[0];
    if (!m) continue;
    rows.push({
      rank: s.rank,
      profileId: m.profile_id,
      alias: m.alias,
      country: m.country || null,
      steamId: steamIdOf(m.name),
      elo: s.rating,
      tier: s.ranklevel ?? 0,
      wins: s.wins,
      losses: s.losses,
      streak: s.streak,
      lastMatch: s.lastmatchdate,
      ...(byRegion && s.regionrank != null ? { regionRank: s.regionrank } : {}),
    });
  }
  // `leaderboardStats` ya viene en el orden del ranking (`statGroups`, no): se respeta.
  return { total: raw.rankTotal, rows };
}

export type Profile = { id: number; alias: string; country: string | null; steamId: string | null; level: number };
export type Standing = {
  leaderboardId: number;
  mode: Mode;
  faction: Faction;
  ranked: boolean;
  /** -1 si no está rankeado (pocas partidas o inactivo). */
  rank: number;
  total: number;
  elo: number;
  best: number;
  tier: number;
  wins: number;
  losses: number;
  streak: number;
  lastMatch: number;
};

const perfil = (m: RawMember): Profile => ({
  id: m.profile_id,
  alias: m.alias,
  country: m.country || null,
  steamId: steamIdOf(m.name),
  level: m.level ?? 0,
});

/** Las posiciones de un grupo personal en los leaderboards que conocemos (sin IA ni personalizadas). */
function standingsOf(raw: RawPersonalStat, statGroupId: number): Standing[] {
  const out: Standing[] = [];
  for (const s of raw.leaderboardStats) {
    if (s.statgroup_id !== statGroupId) continue;
    const lb = leaderboardById(s.leaderboard_id);
    if (!lb) continue;
    out.push({
      leaderboardId: lb.id,
      mode: lb.mode,
      faction: lb.faction,
      ranked: lb.ranked,
      rank: s.rank,
      total: s.ranktotal ?? 0,
      elo: s.rating,
      best: s.highestrating ?? s.rating,
      tier: s.ranklevel ?? 0,
      wins: s.wins,
      losses: s.losses,
      streak: s.streak,
      lastMatch: s.lastmatchdate,
    });
  }
  const orden = ["1v1", "2v2", "3v3", "4v4"];
  return out.sort((a, b) => Number(a.ranked) - Number(b.ranked) || orden.indexOf(a.mode) - orden.indexOf(b.mode) || b.elo - a.elo);
}

/** El grupo personal (un solo miembro) de un perfil; los de equipos fijos se ignoran. */
const grupoPersonal = (raw: RawPersonalStat, profileId: number) =>
  raw.statGroups.find((g) => g.members.length === 1 && g.members[0].profile_id === profileId);

export function normalizePersonal(raw: RawPersonalStat, profileId: number): { profile: Profile; standings: Standing[] } | null {
  const g = grupoPersonal(raw, profileId);
  if (!g) return null;
  return { profile: perfil(g.members[0]), standings: standingsOf(raw, g.id) };
}

export type SearchResult = Profile & { best: Pick<Standing, "mode" | "faction" | "elo" | "rank"> | null; games: number };

/** Resultados de buscar un alias: con su mejor ELO de automatch, los más jugados primero. */
export function normalizeSearch(raw: RawPersonalStat): SearchResult[] {
  return raw.statGroups
    .filter((g) => g.members.length === 1)
    .map((g) => {
      const st = standingsOf(raw, g.id).filter((s) => !s.ranked);
      const top = st.reduce<Standing | null>((a, s) => (!a || s.elo > a.elo ? s : a), null);
      return {
        ...perfil(g.members[0]),
        best: top && { mode: top.mode, faction: top.faction, elo: top.elo, rank: top.rank },
        games: st.reduce((n, s) => n + s.wins + s.losses, 0),
      };
    })
    .sort((a, b) => b.games - a.games || b.level - a.level)
    .slice(0, 25);
}

// ---------- Partidas ----------

/** Lo más útil de los counters de cada jugador (los nombres son los del juego). */
export type CounterSummary = {
  kills: number; // ekills: entidades enemigas matadas
  deaths: number; // edeaths: entidades propias perdidas
  squadsProduced: number; // sqprod
  squadsLost: number; // sqlost
  vehiclesProduced: number; // vprod
  vehiclesKilled: number; // vkill
  vehiclesLost: number; // vlost
  unitsProduced: number; // unitprod
  pointsCaptured: number; // pcap
  pointsRecaptured: number; // precap
  pointsLost: number; // plost
  damage: number; // dmgdone
  abilities: number; // abil
  bgAbilities: number; // cabil: habilidades del battlegroup
  apm: number; // totalcmds / minutos de partida (gt)
};

export function parseCounters(text: string): Record<string, number> {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number")) as Record<string, number>;
  } catch {
    return {};
  }
}

export function summarizeCounters(c: Record<string, number>): CounterSummary {
  const n = (k: string) => c[k] ?? 0;
  const min = n("gt") / 60;
  return {
    kills: n("ekills"),
    deaths: n("edeaths"),
    squadsProduced: n("sqprod"),
    squadsLost: n("sqlost"),
    vehiclesProduced: n("vprod"),
    vehiclesKilled: n("vkill"),
    vehiclesLost: n("vlost"),
    unitsProduced: n("unitprod"),
    pointsCaptured: n("pcap"),
    pointsRecaptured: n("precap"),
    pointsLost: n("plost"),
    damage: n("dmgdone"),
    abilities: n("abil"),
    bgAbilities: n("cabil"),
    apm: min > 0 ? Math.round(n("totalcmds") / min) : 0,
  };
}

export type Result = "win" | "loss" | "other";
export type MatchPlayer = {
  profileId: number;
  alias: string;
  country: string | null;
  faction: Faction | null;
  team: number;
  result: Result;
  eloBefore: number | null;
  eloAfter: number | null;
};
export type MatchSummary = {
  id: number;
  map: string;
  mode: Mode | "ai" | "custom" | "other";
  ranked: boolean;
  matchType: number;
  start: number;
  duration: number;
  players: (MatchPlayer & { counters?: HistoryCounters })[];
};
/** En el historial va sólo lo de la fila (50 partidas de 4v4 con el resumen entero pasaban los 100 KB). */
export type HistoryCounters = Pick<CounterSummary, "kills" | "deaths" | "unitsProduced" | "vehiclesKilled" | "pointsCaptured" | "damage" | "apm">;
const historyCounters = ({ kills, deaths, unitsProduced, vehiclesKilled, pointsCaptured, damage, apm }: CounterSummary): HistoryCounters => ({
  kills,
  deaths,
  unitsProduced,
  vehiclesKilled,
  pointsCaptured,
  damage,
  apm,
});
export type MatchDetail = Omit<MatchSummary, "players"> & {
  end: number;
  automatch: boolean;
  players: (MatchPlayer & { summary: CounterSummary; counters: Record<string, number> })[];
  /** La grabación de cada jugador en el almacén de Relic (`key` es una ruta, no una URL pública). */
  replays: { profileId: number; key: string; size: number }[];
};

const resultado = (o: number | undefined): Result => (o === 1 ? "win" : o === 0 ? "loss" : "other");
const elo = (v: number | undefined) => (typeof v === "number" && v > 0 ? v : null);

function jugadores(m: RawMatch, perfiles: Map<number, RawMember>) {
  const reportes = new Map(m.matchhistoryreportresults.map((r) => [r.profile_id, r]));
  const miembros = m.matchhistorymember.length
    ? m.matchhistorymember
    : m.matchhistoryreportresults.map((r) => ({ ...r, outcome: r.resulttype, oldrating: 0, newrating: 0 }));
  return miembros
    .map((mm) => {
      const p = perfiles.get(mm.profile_id);
      const r = reportes.get(mm.profile_id);
      const counters = r ? parseCounters(r.counters) : {};
      const base: MatchPlayer = {
        profileId: mm.profile_id,
        alias: p?.alias ?? "",
        country: p?.country || null,
        faction: factionOfRace(mm.race_id),
        team: mm.teamid,
        result: resultado(mm.outcome ?? r?.resulttype),
        eloBefore: elo(mm.oldrating),
        eloAfter: elo(mm.newrating),
      };
      return { base, counters };
    })
    .sort((a, b) => a.base.team - b.base.team || (b.base.eloBefore ?? 0) - (a.base.eloBefore ?? 0));
}

function cabecera(m: RawMatch) {
  const { mode, ranked } = modeOfMatchType(m.matchtype_id);
  return {
    id: m.id,
    map: m.mapname,
    mode,
    ranked,
    matchType: m.matchtype_id,
    start: m.startgametime,
    duration: Math.max(0, m.completiontime - m.startgametime),
  };
}

/** El historial reciente, chico: cabecera, jugadores y el resumen de counters de cada uno. Más nuevas primero. */
export function normalizeHistory(raw: RawHistory): MatchSummary[] {
  const perfiles = new Map(raw.profiles.map((p) => [p.profile_id, p]));
  return raw.matchHistoryStats
    .map((m) => ({
      ...cabecera(m),
      players: jugadores(m, perfiles).map(({ base, counters }) =>
        Object.keys(counters).length ? { ...base, counters: historyCounters(summarizeCounters(counters)) } : base,
      ),
    }))
    .sort((a, b) => b.start - a.start);
}

/** Una partida del historial con todo: los counters completos de cada jugador y las grabaciones. */
export function normalizeMatch(raw: RawHistory, matchId: number): MatchDetail | null {
  const m = raw.matchHistoryStats.find((x) => x.id === matchId);
  if (!m) return null;
  const perfiles = new Map(raw.profiles.map((p) => [p.profile_id, p]));
  return {
    ...cabecera(m),
    end: m.completiontime,
    automatch: m.description === "AUTOMATCH",
    players: jugadores(m, perfiles).map(({ base, counters }) => ({ ...base, summary: summarizeCounters(counters), counters })),
    replays: (m.matchurls ?? []).map((u) => ({ profileId: u.profile_id, key: u.key, size: u.size })),
  };
}
