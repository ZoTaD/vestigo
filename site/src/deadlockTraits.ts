import { soulsAt, type Form, type HistoryRow, type MatchPlayer, type ParsedMatch, type Streak } from "./deadlockMatch";
import type { Peer } from "./deadlockPeers";
import type { VsRow } from "./deadlockVsBand";

/**
 * Los rasgos de un jugador: etiquetas cortas, buenas o malas, que dicen cómo
 * juega (ZoTaD, 2026-10-12).
 *
 * Hay dos juegos de etiquetas con la misma forma: las del **perfil**, que miran
 * la temporada, y las de **una partida**, que miran sólo esa. Ninguna es una
 * opinión: cada una sale de una regla con su umbral, y lleva el número que la
 * disparó para poder mostrarlo al lado.
 *
 * Acá no hay texto. El nombre y la explicación de cada rasgo viven en
 * `deadlockCopy.ts`, por `id`.
 */

export type TraitTone = "good" | "bad" | "neutral";

/** Cómo se lee `value`: un percentil, una proporción (0 a 1) o una cuenta. */
export type TraitUnit = "percentile" | "share" | "count";

export interface Trait {
  id: string;
  tone: TraitTone;
  value: number;
  unit: TraitUnit;
  /** El héroe del que habla el rasgo, si habla de uno. */
  heroId?: number;
}

const trait = (id: string, tone: TraitTone, value: number, unit: TraitUnit, heroId?: number): Trait => ({
  id,
  tone,
  value,
  unit,
  ...(heroId === undefined ? {} : { heroId }),
});

/* ── El perfil ────────────────────────────────────────────────────────────── */

/** "Mejor que el N %" de su rango: de acá para arriba es un punto fuerte. */
export const HIGH_PERCENTILE = 65;
/** Y de acá para abajo, uno flojo. */
export const LOW_PERCENTILE = 35;

/** Cada métrica contra el rango, con el rasgo que da arriba y el que da abajo. */
const VS_TRAITS: Record<string, [good: string, bad: string]> = {
  net_worth_per_min: ["farmer", "lowFarm"],
  player_damage_per_min: ["damageDealer", "lowDamage"],
  accuracy: ["sharpshooter", "sprayer"],
  deaths: ["survivor", "diesALot"],
  last_hits: ["lastHitter", "missesLastHits"],
  kda: ["cleanKda", "roughKda"],
};

/** Partidas que hacen falta para afirmar algo sobre un subconjunto. */
const MIN_SUBSET = 8;
/** Un winrate de acá para arriba (o su espejo para abajo) ya es un patrón. */
const STRONG_WR = 0.62;
/** Minutos entre el final de una partida y el arranque de la siguiente para ser la misma sesión. */
const SESSION_GAP_S = 30 * 60;

const winRate = (rows: HistoryRow[]): number => rows.filter((r) => r.won).length / Math.max(1, rows.length);

export interface ProfileInput {
  /** Las partidas que se miden, la más nueva primero. */
  rows: HistoryRow[];
  /** La comparación contra el rango; vacía si todavía no cargó o no tiene rango. */
  vs: VsRow[];
  streak: Streak | null;
  forma: Form | null;
  /** Subrangos netos de la temporada (`RankTrail.net`), si hay recorrido. */
  rankNet: number | null;
  /** Los compañeros con los que más jugó, ya cruzados con `rows`. */
  mates: Peer[];
  /** El momento "ahora", en segundos. Se pasa para que la función sea pura. */
  now: number;
}

export function profileTraits({ rows, vs, streak, forma, rankNet, mates, now }: ProfileInput): Trait[] {
  const out: Trait[] = [];

  // 1. Contra su rango.
  for (const r of vs) {
    const ids = VS_TRAITS[r.key];
    if (!ids) continue;
    if (r.percentile >= HIGH_PERCENTILE) out.push(trait(ids[0], "good", r.percentile, "percentile"));
    // El rasgo flojo se cuenta al revés: "el N % de tu rango lo hace mejor".
    else if (r.percentile <= LOW_PERCENTILE) out.push(trait(ids[1], "bad", 100 - r.percentile, "percentile"));
  }

  // 2. El momento: racha, forma y recorrido de rango.
  if (streak && streak.length >= 3) out.push(trait(streak.won ? "hotStreak" : "coldStreak", streak.won ? "good" : "bad", streak.length, "count"));
  if (forma && forma.results.length >= 10) {
    const wr = forma.wins / forma.results.length;
    if (wr >= 0.65) out.push(trait("inForm", "good", wr, "share"));
    else if (wr <= 0.35) out.push(trait("outOfForm", "bad", wr, "share"));
  }
  if (rankNet !== null && rankNet >= 2) out.push(trait("climbing", "good", rankNet, "count"));
  if (rankNet !== null && rankNet <= -2) out.push(trait("falling", "bad", -rankNet, "count"));

  if (rows.length >= 20) {
    const wr = winRate(rows);
    if (wr >= 0.55) out.push(trait("winning", "good", wr, "share"));
    else if (wr <= 0.45) out.push(trait("losing", "bad", wr, "share"));
  }

  // 3. Los héroes.
  const porHeroe = new Map<number, HistoryRow[]>();
  for (const r of rows) porHeroe.set(r.heroId, [...(porHeroe.get(r.heroId) ?? []), r]);
  const heroes = [...porHeroe.entries()].sort((a, b) => b[1].length - a[1].length);
  const top = heroes[0];
  if (top && rows.length >= 15) {
    const share = top[1].length / rows.length;
    if (share >= 0.6) out.push(trait("oneTrick", "neutral", share, "share", top[0]));
  }
  const especial = heroes.find(([, rs]) => rs.length >= 10 && rs.length / rows.length >= 0.25 && winRate(rs) >= 0.58);
  if (especial) out.push(trait("specialist", "good", winRate(especial[1]), "share", especial[0]));
  if (top && top[1].length >= 12 && winRate(top[1]) <= 0.42) out.push(trait("stubborn", "bad", winRate(top[1]), "share", top[0]));
  const ultimas = rows.slice(0, 30);
  if (ultimas.length >= 20) {
    const distintos = new Map<number, number>();
    for (const r of ultimas) distintos.set(r.heroId, (distintos.get(r.heroId) ?? 0) + 1);
    if (distintos.size >= 10 && Math.max(...distintos.values()) / ultimas.length <= 0.2) {
      out.push(trait("widePool", "bad", distintos.size, "count"));
    }
  }

  // 4. El largo de la partida.
  const pair = (subset: HistoryRow[], good: string, bad: string) => {
    if (subset.length < MIN_SUBSET) return;
    const wr = winRate(subset);
    if (wr >= STRONG_WR) out.push(trait(good, "good", wr, "share"));
    else if (wr <= 1 - STRONG_WR) out.push(trait(bad, "bad", wr, "share"));
  };
  pair(rows.filter((r) => r.durationS >= 40 * 60), "closer", "fadesLate");
  pair(rows.filter((r) => r.durationS > 0 && r.durationS < 25 * 60), "winsEarly", "losesEarly");

  // 5. Las sesiones: qué pasa después de perder y cuando se alarga la noche.
  const cron = [...rows].sort((a, b) => a.startTime - b.startTime);
  const trasPerder: HistoryRow[] = [];
  const trasGanar: HistoryRow[] = [];
  const frescas: HistoryRow[] = [];
  const largas: HistoryRow[] = [];
  let enSesion = 0;
  cron.forEach((r, i) => {
    const prev = cron[i - 1];
    const sigue = !!prev && r.startTime - (prev.startTime + prev.durationS) <= SESSION_GAP_S;
    enSesion = sigue ? enSesion + 1 : 1;
    if (sigue) (prev.won ? trasGanar : trasPerder).push(r);
    (enSesion >= 4 ? largas : frescas).push(r);
  });
  if (trasPerder.length >= MIN_SUBSET && trasGanar.length >= MIN_SUBSET) {
    const gap = winRate(trasPerder) - winRate(trasGanar);
    if (gap <= -0.15) out.push(trait("tilts", "bad", winRate(trasPerder), "share"));
  }
  if (trasPerder.length >= MIN_SUBSET && winRate(trasPerder) >= 0.58) out.push(trait("bouncesBack", "good", winRate(trasPerder), "share"));
  if (largas.length >= MIN_SUBSET && frescas.length >= MIN_SUBSET) {
    const gap = winRate(largas) - winRate(frescas);
    if (gap <= -0.15) out.push(trait("fadesInSessions", "bad", winRate(largas), "share"));
    else if (gap >= 0.15) out.push(trait("warmsUp", "good", winRate(largas), "share"));
  }

  // 6. La gente y el ritmo.
  const duo = mates.filter((m) => m.matches >= 5).sort((a, b) => b.wins / b.matches - a.wins / a.matches)[0];
  if (duo && duo.wins / duo.matches >= 0.65) out.push(trait("duo", "good", duo.wins / duo.matches, "share"));
  const juntos = mates.filter((m) => m.matches >= 3).reduce((a, m) => a + m.matches, 0);
  if (rows.length >= 20 && juntos === 0) out.push(trait("soloQueue", "neutral", rows.length, "count"));
  const recientes = rows.filter((r) => now - r.startTime <= 14 * 86_400).length;
  if (recientes >= 40) out.push(trait("grinder", "neutral", recientes, "count"));

  return ordered(out);
}

/* ── Una partida ──────────────────────────────────────────────────────────── */

/** El segundo en que se mira "el arranque" de la partida. */
const EARLY_S = 10 * 60;
/** Cuántas almas de más (o de menos) contra el rival ya son una ventaja clara. */
const LEAD_GAP = 0.15;

export function matchTraits(p: MatchPlayer, m: ParsedMatch): Trait[] {
  const out: Trait[] = [];
  const all = m.players;
  const team = all.filter((x) => x.team === p.team);
  const sum = (xs: MatchPlayer[], f: (x: MatchPlayer) => number) => xs.reduce((a, x) => a + f(x), 0);
  const share = (f: (x: MatchPlayer) => number) => {
    const t = sum(team, f);
    return t > 0 ? f(p) / t : 0;
  };
  /** El único primero (o último) de la partida en algo: un empate no es de nadie. */
  const alone = (f: (x: MatchPlayer) => number, sign: 1 | -1 = 1) => all.every((x) => x === p || sign * f(x) < sign * f(p));
  /** El puesto entre los doce, 1 = el que más. */
  const place = (f: (x: MatchPlayer) => number) => all.filter((x) => f(x) > f(p)).length + 1;

  const dmg = share((x) => x.damage);
  const souls = share((x) => x.netWorth);
  const boss = share((x) => x.boss);
  const heal = share((x) => x.healing);
  const teamKills = sum(team, (x) => x.kills);
  const kp = teamKills > 0 ? (p.kills + p.assists) / teamKills : 0;
  const larga = m.durationS >= 20 * 60;

  /** El primero de su equipo, sin serlo de la partida. */
  const teamBest = (f: (x: MatchPlayer) => number) => team.every((x) => x === p || f(x) < f(p));

  if (alone((x) => x.netWorth)) out.push(trait("mostSouls", "good", p.netWorth, "count"));
  else if (teamBest((x) => x.netWorth)) out.push(trait("teamRichest", "good", souls, "share"));
  if (alone((x) => x.damage)) out.push(trait("topDamage", "good", p.damage, "count"));
  else if (dmg >= 0.28) out.push(trait("carriedDamage", "good", dmg, "share"));
  else if (teamBest((x) => x.damage)) out.push(trait("teamTopDamage", "good", dmg, "share"));
  if (p.boss > 0 && alone((x) => x.boss)) out.push(trait("objectives", "good", boss, "share"));
  if (p.healing > 0 && alone((x) => x.healing) && heal >= 0.35) out.push(trait("healer", "good", heal, "share"));
  if (larga && p.deaths <= 2) out.push(trait("untouchable", "good", p.deaths, "count"));
  if (p.kills > 0 && alone((x) => x.kills)) out.push(trait("killLeader", "good", p.kills, "count"));
  if (p.assists > 0 && alone((x) => x.assists)) out.push(trait("playmaker", "good", p.assists, "count"));
  if (teamKills >= 10 && kp >= 0.7) out.push(trait("everywhere", "good", kp, "share"));
  if (dmg - souls >= 0.06) out.push(trait("efficient", "good", dmg, "share"));

  if (p.deaths >= 8 && alone((x) => x.deaths)) out.push(trait("diedMost", "bad", p.deaths, "count"));
  if (dmg > 0 && dmg <= 0.09) out.push(trait("lowImpact", "bad", dmg, "share"));
  if (souls - dmg >= 0.06) out.push(trait("farmedNotFought", "bad", dmg, "share"));
  if (alone((x) => x.netWorth, -1)) out.push(trait("poorest", "bad", p.netWorth, "count"));
  if (teamKills >= 10 && kp <= 0.3) out.push(trait("absent", "bad", kp, "share"));
  if (larga && sum(team, (x) => x.boss) > 0 && boss <= 0.05) out.push(trait("noObjectives", "bad", boss, "share"));

  // El arranque contra el final, y la partida del equipo.
  if (m.durationS >= 15 * 60 && p.souls.length > 0) {
    const early = place((x) => soulsAt(x, EARLY_S));
    const end = place((x) => x.netWorth);
    if (early <= 2) out.push(trait("fastStart", "good", early, "count"));
    if (early >= 8 && end <= 3) out.push(trait("lateBloomer", "good", end, "count"));
    if (early <= 3 && end >= 9) out.push(trait("lostLead", "bad", end, "count"));

    // La peor y la mejor diferencia de almas que tuvo su equipo, contra las del rival.
    const rival = all.filter((x) => x.team !== p.team);
    const tiempos = [...new Set(all.flatMap((x) => x.souls.map((s) => s.t)))];
    const gaps = tiempos.map((t) => {
      const mine = sum(team, (x) => soulsAt(x, t));
      const theirs = sum(rival, (x) => soulsAt(x, t));
      return theirs > 0 ? (mine - theirs) / theirs : 0;
    });
    const worst = Math.min(0, ...gaps);
    const best = Math.max(0, ...gaps);
    if (p.won && worst <= -LEAD_GAP) out.push(trait("comeback", "good", -worst, "share"));
    if (!p.won && best >= LEAD_GAP) out.push(trait("threwLead", "bad", best, "share"));
  }

  const recibido = (x: MatchPlayer) => [...x.damageFrom.values()].reduce((a, b) => a + b, 0);
  if (recibido(p) > 0 && alone(recibido)) out.push(trait("focused", "neutral", recibido(p), "count"));

  return ordered(out);
}

/** Las buenas primero, después las malas y al final las que sólo describen. */
function ordered(traits: Trait[]): Trait[] {
  const rank: Record<TraitTone, number> = { good: 0, bad: 1, neutral: 2 };
  return [...traits].sort((a, b) => rank[a.tone] - rank[b.tone]);
}
