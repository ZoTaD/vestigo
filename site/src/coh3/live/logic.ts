/**
 * La lógica pura de las pestañas en vivo de CoH3 (Ranking, Jugador y Partida, 2026-11-04): leer lo que se escribe en el
 * buscador, el estado del ranking en la dirección, el resumen de las partidas cargadas, el némesis y la serie de ELO.
 * Sin React ni pedidos: la prueban `test/coh3Live.test.ts`.
 */
import type { Mode } from "../api/leaderboards";

/** La clave de una facción de cualquiera de los tres juegos (`american`, `okw`, `panzer_elite`…). */
type Faction = string;
import type { MatchSummary, Standing } from "../api/relic";

export const MODES: readonly Mode[] = ["1v1", "2v2", "3v3", "4v4"];
/** El orden de las facciones de CoH3 (las de otro juego van después, en el orden en que aparecen). */
export const FACTIONS: readonly Faction[] = ["american", "british", "german", "dak"];
const isMode = (v: string | null): v is Mode => !!v && (MODES as readonly string[]).includes(v);
const isFaction = (v: string | null): v is Faction => !!v && (FACTIONS as readonly string[]).includes(v);

// ——— Buscador de jugadores ———

/**
 * Lo que alguien escribió en el buscador:
 * - un link de coh3stats (`/players/871` o `/players/871-rei`) o de esta misma pestaña → el perfil;
 * - un SteamID64 (`7656…`, 17 cifras) o un link de Steam `/profiles/7656…` → se busca por Steam;
 * - un número corto → un perfil, pero también puede ser un alias (hay jugadores que se llaman "1234"): va `alias` igual;
 * - cualquier otra cosa → un alias exacto (Relic distingue mayúsculas).
 */
export type PlayerQuery =
  | { kind: "empty" }
  | { kind: "profile"; id: number; alias: string | null }
  | { kind: "steam"; steamId: string }
  | { kind: "alias"; alias: string };

export function normalizeQuery(raw: string): PlayerQuery {
  const q = raw.trim().replace(/\s+/g, " ");
  if (!q) return { kind: "empty" };
  const perfil = /(?:coh3stats\.com\/players|\/coh3\/(?:players|jugadores))\/(\d{1,10})(?:\D|$)/i.exec(q);
  if (perfil) return { kind: "profile", id: Number(perfil[1]), alias: null };
  const steamUrl = /steamcommunity\.com\/profiles\/(7656\d{13})(?:\D|$)/i.exec(q);
  if (steamUrl) return { kind: "steam", steamId: steamUrl[1] };
  if (/^7656\d{13}$/.test(q)) return { kind: "steam", steamId: q };
  if (/^\d{1,10}$/.test(q) && Number(q) > 0) return { kind: "profile", id: Number(q), alias: q };
  return { kind: "alias", alias: q.slice(0, 64) };
}

// ——— Ranking: el estado en la dirección (`?m=1v1&f=german&p=2&r=2074389`) ———

export type LadderState = { mode: Mode; faction: Faction; page: number; region: number | null };
export const LADDER_DEFAULT: LadderState = { mode: "1v1", faction: "american", page: 1, region: null };
export const PAGE_SIZE = 50;

export function parseLadderQuery(search: string, regions: readonly number[]): LadderState {
  const p = new URLSearchParams(search);
  const m = p.get("m"), f = p.get("f"), pg = p.get("p"), r = p.get("r");
  const page = pg && /^\d{1,5}$/.test(pg) ? Math.max(1, Number(pg)) : 1;
  const region = r && /^\d{1,12}$/.test(r) && regions.includes(Number(r)) ? Number(r) : null;
  return { mode: isMode(m) ? m : LADDER_DEFAULT.mode, faction: isFaction(f) ? f : LADDER_DEFAULT.faction, page, region };
}

/** La query del estado, sin lo que está en su valor de siempre (la dirección queda corta y se comparte igual). */
export function ladderQuery(s: LadderState): string {
  const p = new URLSearchParams();
  if (s.mode !== LADDER_DEFAULT.mode) p.set("m", s.mode);
  if (s.faction !== LADDER_DEFAULT.faction) p.set("f", s.faction);
  if (s.page > 1) p.set("p", String(s.page));
  if (s.region != null) p.set("r", String(s.region));
  const q = p.toString();
  return q ? `?${q}` : "";
}

/** El primer puesto de una página (la API cuenta desde 1). */
export const pageStart = (page: number) => (page - 1) * PAGE_SIZE + 1;
export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

// ——— Porcentajes ———

/** % de victorias (0–100), o null sin partidas. */
export const winRate = (wins: number, losses: number): number | null => (wins + losses > 0 ? (wins / (wins + losses)) * 100 : null);

// ——— Jugador ———

type Me<T extends MatchSummary> = { match: T; me: T["players"][number] };
/** Las partidas en las que aparece el jugador, con su fila. */
export function mine<T extends MatchSummary>(matches: readonly T[], profileId: number): Me<T>[] {
  const out: Me<T>[] = [];
  for (const match of matches) {
    const me = match.players.find((p) => p.profileId === profileId);
    if (me) out.push({ match, me });
  }
  return out;
}

/** Totales del ranking: partidas, victorias, la facción más jugada y el mejor puesto (de las tablas de automatch). */
export function standingsTotals(st: readonly Standing[]) {
  const auto = st.filter((s) => !s.ranked);
  const wins = auto.reduce((n, s) => n + s.wins, 0);
  const losses = auto.reduce((n, s) => n + s.losses, 0);
  const porFaccion = new Map<Faction, number>();
  for (const s of auto) porFaccion.set(s.faction, (porFaccion.get(s.faction) ?? 0) + s.wins + s.losses);
  let topFaction: { faction: Faction; games: number } | null = null;
  for (const [faction, games] of porFaccion) if (games > 0 && (!topFaction || games > topFaction.games)) topFaction = { faction, games };
  const ranked = auto.filter((s) => s.rank > 0);
  const best = ranked.reduce<Standing | null>((a, s) => (!a || s.rank < a.rank || (s.rank === a.rank && (s.elo ?? 0) > (a.elo ?? 0)) ? s : a), null);
  return { games: wins + losses, wins, losses, winRate: winRate(wins, losses), topFaction, best };
}

export type RecentSummary = {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** Duración media en segundos. */
  avgDuration: number | null;
  topFaction: { faction: Faction; games: number } | null;
  /** Suma del cambio de ELO de las partidas con ELO (las personalizadas no lo tienen). */
  eloDelta: number;
};

/** El resumen de las partidas recientes cargadas (las del historial de Relic, unas 50). */
export function recentSummary(matches: readonly MatchSummary[], profileId: number): RecentSummary {
  const rows = mine(matches, profileId);
  let wins = 0, losses = 0, dur = 0, eloDelta = 0;
  const porFaccion = new Map<Faction, number>();
  for (const { match, me } of rows) {
    if (me.result === "win") wins++;
    else if (me.result === "loss") losses++;
    dur += match.duration;
    if (me.eloBefore != null && me.eloAfter != null) eloDelta += me.eloAfter - me.eloBefore;
    if (me.faction) porFaccion.set(me.faction, (porFaccion.get(me.faction) ?? 0) + 1);
  }
  let topFaction: RecentSummary["topFaction"] = null;
  for (const [faction, games] of porFaccion) if (!topFaction || games > topFaction.games) topFaction = { faction, games };
  return {
    games: rows.length,
    wins,
    losses,
    winRate: winRate(wins, losses),
    avgDuration: rows.length ? dur / rows.length : null,
    topFaction,
    eloDelta,
  };
}

export type Rival = { profileId: number; alias: string; country: string | null; beats: number; games: number };

/**
 * El némesis: el rival que más veces le ganó en las partidas cargadas (empate: el que más veces jugó en contra, y
 * después el alias). En 2v2 o más, cada rival del equipo ganador suma una. Sin derrotas, null.
 */
export function nemesis(matches: readonly MatchSummary[], profileId: number): Rival | null {
  const rivales = new Map<number, Rival>();
  for (const { match, me } of mine(matches, profileId)) {
    for (const p of match.players) {
      if (p.team === me.team || p.profileId === profileId) continue;
      const r = rivales.get(p.profileId) ?? { profileId: p.profileId, alias: p.alias, country: p.country, beats: 0, games: 0 };
      r.games++;
      if (me.result === "loss" && p.result === "win") r.beats++;
      rivales.set(p.profileId, r);
    }
  }
  let top: Rival | null = null;
  for (const r of rivales.values()) {
    if (r.beats === 0) continue;
    if (!top || r.beats > top.beats || (r.beats === top.beats && (r.games > top.games || (r.games === top.games && r.alias.localeCompare(top.alias) < 0)))) top = r;
  }
  return top;
}

export type EloPoint = { matchId: number; t: number; elo: number; delta: number; result: "win" | "loss" | "other" };
export type SeriesKey = `${Mode}:${Faction}`;

/** Las series de ELO que hay en las partidas cargadas (modo y facción), las de más partidas primero. */
export function eloSeriesKeys(matches: readonly MatchSummary[], profileId: number): { key: SeriesKey; mode: Mode; faction: Faction; n: number }[] {
  const n = new Map<SeriesKey, number>();
  for (const { match, me } of mine(matches, profileId)) {
    if (!isMode(match.mode) || !me.faction || me.eloAfter == null) continue;
    const k: SeriesKey = `${match.mode}:${me.faction}`;
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n]
    .map(([key, c]) => {
      const [mode, faction] = key.split(":") as [Mode, Faction];
      return { key, mode, faction, n: c };
    })
    .sort((a, b) => b.n - a.n || MODES.indexOf(a.mode) - MODES.indexOf(b.mode) || FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction));
}

/** El ELO después de cada partida de un modo y una facción, de la más vieja a la más nueva. */
export function eloSeries(matches: readonly MatchSummary[], profileId: number, mode: Mode, faction: Faction): EloPoint[] {
  return mine(matches, profileId)
    .filter(({ match, me }) => match.mode === mode && me.faction === faction && me.eloAfter != null)
    .map(({ match, me }) => ({
      matchId: match.id,
      t: match.start,
      elo: me.eloAfter as number,
      delta: me.eloBefore != null ? (me.eloAfter as number) - me.eloBefore : 0,
      result: me.result,
    }))
    .sort((a, b) => a.t - b.t);
}

/** Valores redondos para el eje del gráfico de ELO: de `min` a `max`, entre 3 y 6 marcas. */
export function eloTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => span / s <= 5) ?? 1000;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

// ——— Textos chicos ———

/** `desert_village_2p_mkiii` → `Desert Village`; el nombre de verdad sale de `maps.json` cuando está. */
export function prettyMap(raw: string): string {
  const s = raw
    .replace(/^\(\d\)\s*/, "")
    .replace(/^mp_\d+p_/, "")
    .replace(/_\d+p(?=_|$)/g, "")
    .replace(/_mk[ivx]+$/i, "")
    .replace(/_/g, " ")
    .trim();
  return s.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase()) || raw;
}

/** `(2) Road to Tunis` → `Road to Tunis`: el modo ya está a la vista. */
export const stripPlayers = (name: string) => name.replace(/^\(\d\)\s*/, "");

/** 1802 s → "30:02"; con horas, "1:02:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** Cuánto hace, en la unidad más grande que entra: [valor negativo, unidad] para `Intl.RelativeTimeFormat`. */
export function agoParts(thenSec: number, nowMs: number): [number, Intl.RelativeTimeFormatUnit] {
  const d = Math.max(0, nowMs / 1000 - thenSec);
  if (d < 60) return [0, "minute"];
  if (d < 3600) return [-Math.floor(d / 60), "minute"];
  if (d < 86400) return [-Math.floor(d / 3600), "hour"];
  if (d < 86400 * 30) return [-Math.floor(d / 86400), "day"];
  if (d < 86400 * 365) return [-Math.floor(d / (86400 * 30)), "month"];
  return [-Math.floor(d / (86400 * 365)), "year"];
}
