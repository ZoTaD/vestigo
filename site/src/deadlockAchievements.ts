import { useEffect, useState } from "react";
import type { HistoryRow } from "./deadlockMatch";
import { inScope, RANKED_MODE } from "./deadlockMatch";
import type { HeroStat } from "./deadlockHeroStats";
import type { RankPoint } from "./deadlockRankHistory";
import { seasonAt } from "./deadlockSeasons";

/**
 * Los logros del perfil: medallas que se ganan jugando.
 *
 * **Todo sale de lo que el perfil ya tiene en memoria** —el historial, la
 * carrera por héroe, el rango partida por partida y la escalera por héroe— más
 * un solo archivo nuevo, `hero-records.json`, con el top 10 del mundo por héroe
 * y por métrica de cada temporada (lo publica `build:hero-records`). No hay un
 * pedido extra a deadlock-api por perfil.
 *
 * **Sin porcentajes de rareza inventados.** Statlocker pone "0,01 % ultra
 * rare" en todo; nosotros no sabemos cuánta gente tiene cada logro, así que la
 * rareza la dice el metal (bronce, plata, oro, eterna) y el umbral está escrito.
 */

export type Tier = "eternal" | "gold" | "silver" | "bronze";
export type Group = "world" | "mastery" | "feats" | "rank" | "season";

export const TIER_ORDER: Tier[] = ["eternal", "gold", "silver", "bronze"];
export const GROUPS: Group[] = ["world", "mastery", "feats", "rank", "season"];

/** Qué dice el logro. El texto se arma en el componente, en el idioma de la página. */
export type AchievementKind =
  | { type: "record"; metric: string; place: number; heroId: number | null; season: number }
  | { type: "mastery"; heroId: number; matches: number; need: number }
  | { type: "career"; matches: number; need: number }
  | { type: "streak"; n: number; need: number }
  | { type: "bestKills"; n: number; heroId: number; need: number }
  | { type: "bestSouls"; n: number; heroId: number; need: number }
  | { type: "deathless"; n: number; need: number }
  | { type: "peak"; season: number; badge: number }
  | { type: "veteran"; season: number };

/** Qué va adentro de la moneda. */
export type Face = { kind: "hero"; heroId: number } | { kind: "rank"; badge: number } | { kind: "icon"; icon: string };

export interface Achievement {
  id: string;
  group: Group;
  tier: Tier;
  face: Face;
  /** Lo que va en la chapa de abajo: "#1", "500", "12". */
  tag: string;
  kind: AchievementKind;
  /** Sólo en las que faltan: cuánto hay y cuánto se pide. */
  progress?: { have: number; need: number };
}

/* ---------------------------------------------------------------- umbrales */

/** Umbrales de bronce, plata, oro y eterna, de menor a mayor. */
type Steps = [number, number, number, number];

export const MASTERY: Steps = [50, 150, 400, 1000];
export const CAREER: Steps = [250, 1000, 2500, 5000];
export const STREAK: Steps = [5, 8, 12, 18];
export const KILLS: Steps = [15, 20, 25, 30];
export const SOULS: Steps = [50_000, 65_000, 80_000, 100_000];
export const DEATHLESS: Steps = [1, 5, 15, 40];

const STEP_TIERS: Tier[] = ["bronze", "silver", "gold", "eternal"];

/** El metal que alcanza `v`, o `null` si no llega al bronce. */
export function stepTier(v: number, steps: Steps): Tier | null {
  let t: Tier | null = null;
  steps.forEach((s, i) => {
    if (v >= s) t = STEP_TIERS[i];
  });
  return t;
}

/** El próximo umbral sobre `v`, o `null` si ya tiene la eterna. */
export function nextStep(v: number, steps: Steps): number | null {
  return steps.find((s) => v < s) ?? null;
}

/** El umbral del metal alcanzado (para decir "500 partidas", no "512"). */
function reached(v: number, steps: Steps): number {
  return [...steps].reverse().find((s) => v >= s) ?? 0;
}

/** Puesto en un top 10 de héroe: #1 eterna, podio oro, el resto plata. */
export function heroPlaceTier(place: number): Tier {
  return place === 1 ? "eternal" : place <= 3 ? "gold" : "silver";
}

/** Puesto en un top 100: #1 eterna, top 10 oro, top 50 plata, el resto bronce. */
export function topHundredTier(place: number): Tier {
  return place === 1 ? "eternal" : place <= 10 ? "gold" : place <= 50 ? "silver" : "bronze";
}

/** El rango más alto de una temporada, por división: Emissary bronce … Eternus eterna. */
export function peakTier(badge: number): Tier | null {
  const div = Math.floor(badge / 10);
  return div >= 11 ? "eternal" : div >= 9 ? "gold" : div >= 7 ? "silver" : div >= 6 ? "bronze" : null;
}

/* ------------------------------------------------------- récords del mundo */

export interface SeasonRecords {
  final: boolean;
  heroes: Record<string, Record<string, number[]>>;
  world: Record<string, number[]>;
}
export interface RecordsFile {
  generatedAt: string;
  metrics: string[];
  seasons: Record<string, SeasonRecords>;
}

/** Dónde aparece una cuenta en los récords, temporada por temporada. */
export function recordsOf(file: RecordsFile | null, accountId: number): Achievement[] {
  if (!file) return [];
  const out: Achievement[] = [];
  for (const [sid, rec] of Object.entries(file.seasons)) {
    const season = Number(sid);
    for (const [metric, ids] of Object.entries(rec.world)) {
      const i = ids.indexOf(accountId);
      if (i < 0) continue;
      out.push({
        id: `record-${season}-w-${metric}`,
        group: "world",
        tier: topHundredTier(i + 1),
        face: { kind: "icon", icon: METRIC_ICON[metric] ?? "spirit" },
        tag: `#${i + 1}`,
        kind: { type: "record", metric, place: i + 1, heroId: null, season },
      });
    }
    for (const [hid, porMetrica] of Object.entries(rec.heroes)) {
      for (const [metric, ids] of Object.entries(porMetrica)) {
        const i = ids.indexOf(accountId);
        if (i < 0) continue;
        out.push({
          id: `record-${season}-${hid}-${metric}`,
          group: "world",
          tier: heroPlaceTier(i + 1),
          face: { kind: "hero", heroId: Number(hid) },
          tag: `#${i + 1}`,
          kind: { type: "record", metric, place: i + 1, heroId: Number(hid), season },
        });
      }
    }
  }
  return out;
}

/** El ícono de cada métrica, para los récords del mundo entero (sin héroe). */
export const METRIC_ICON: Record<string, string> = {
  rank: "spirit",
  kills: "damage_crit",
  assists: "heal",
  player_damage: "damage_bullet_color",
  net_worth: "icon_soul",
  last_hits: "gold",
  wins: "spirit",
  matches: "duration",
  max_kills_per_match: "damage_crit",
  boss_damage: "armor_alt",
  hero_bullets_hit_crit: "damage_crit",
};

let records: RecordsFile | null = null;
let pidiendo: Promise<void> | null = null;

/** Baja el archivo de récords una vez; sin él, los logros salen igual sin los del mundo. */
export function useRecords(): RecordsFile | null {
  const [f, setF] = useState<RecordsFile | null>(records);
  useEffect(() => {
    if (records) return;
    let vivo = true;
    pidiendo ??= import("@deadlock/hero-records.json")
      .then((m) => {
        records = m.default as unknown as RecordsFile;
      })
      .catch(() => undefined);
    pidiendo.then(() => vivo && setF(records));
    return () => {
      vivo = false;
    };
  }, []);
  return f;
}

/* --------------------------------------------------------- todo el resto */

export interface AchievementInput {
  accountId: number;
  history: HistoryRow[];
  career: HeroStat[];
  rankSeries: RankPoint[];
  records: RecordsFile | null;
}

/** La racha de victorias más larga, en orden cronológico. */
export function longestWinStreak(rows: HistoryRow[]): number {
  const ordenadas = [...rows].sort((a, b) => a.startTime - b.startTime);
  let mejor = 0;
  let actual = 0;
  for (const r of ordenadas) {
    actual = r.won ? actual + 1 : 0;
    if (actual > mejor) mejor = actual;
  }
  return mejor;
}

/** La fila con más de algo. */
function maxBy(rows: HistoryRow[], f: (r: HistoryRow) => number): HistoryRow | null {
  let m: HistoryRow | null = null;
  for (const r of rows) if (!m || f(r) > f(m)) m = r;
  return m;
}

/**
 * Todos los logros de una cuenta, ganados y por ganar.
 *
 * Los ganados vienen ordenados de más a menos valioso (metal y después grupo);
 * los que faltan van con `progress` y sólo los que están más cerca.
 */
export function achievementsOf(inp: AchievementInput): { earned: Achievement[]; next: Achievement[] } {
  const earned: Achievement[] = [...recordsOf(inp.records, inp.accountId)];
  const next: Achievement[] = [];

  // La escalera por héroe y el ranking del mundo NO se leen de la escalera en
  // vivo: esa cambia de temporada a la semana del reset y las medallas se
  // perderían. Salen de los récords (métrica "rank"), sellados por temporada.

  // Maestría por héroe, con la carrera entera.
  const carrera = [...inp.career].sort((a, b) => b.matches - a.matches);
  for (const h of carrera) {
    const t = stepTier(h.matches, MASTERY);
    if (!t) continue;
    const r = reached(h.matches, MASTERY);
    earned.push({
      id: `mastery-${h.heroId}`,
      group: "mastery",
      tier: t,
      face: { kind: "hero", heroId: h.heroId },
      tag: String(r),
      kind: { type: "mastery", heroId: h.heroId, matches: h.matches, need: r },
    });
  }
  const favorito = carrera[0];
  if (favorito) {
    const n = nextStep(favorito.matches, MASTERY);
    if (n != null) {
      next.push({
        id: `mastery-next-${favorito.heroId}`,
        group: "mastery",
        tier: stepTier(n, MASTERY)!,
        face: { kind: "hero", heroId: favorito.heroId },
        tag: String(n),
        kind: { type: "mastery", heroId: favorito.heroId, matches: favorito.matches, need: n },
        progress: { have: favorito.matches, need: n },
      });
    }
  }
  const total = inp.career.reduce((s, h) => s + h.matches, 0);
  pushSteps(earned, next, total, CAREER, "career", "mastery", { kind: "icon", icon: "duration" }, (have, need) => ({
    type: "career",
    matches: have,
    need,
  }));

  // Hazañas: salen del historial, sólo de partidas normales y clasificatorias
  // (`match_mode` 1 y 4). Sin la pelea callejera (otro mapa, otras cifras) ni
  // los lobbies privados: medido el 5/11, una cuenta del top tenía 1.207.450
  // almas en una privada de 16 minutos.
  const h = inp.history.filter((r) => !inScope(r, "brawl") && (r.mode === 1 || r.mode === RANKED_MODE));
  pushSteps(earned, next, longestWinStreak(h), STREAK, "streak", "feats", { kind: "icon", icon: "fire_rate" }, (have, need) => ({
    type: "streak",
    n: have,
    need,
  }), true);
  const kills = maxBy(h, (r) => r.kills);
  if (kills) {
    pushSteps(earned, next, kills.kills, KILLS, "kills", "feats", { kind: "hero", heroId: kills.heroId }, (have, need) => ({
      type: "bestKills",
      n: have,
      heroId: kills.heroId,
      need,
    }), true);
  }
  const almas = maxBy(h, (r) => r.netWorth);
  if (almas) {
    pushSteps(earned, next, almas.netWorth, SOULS, "souls", "feats", { kind: "hero", heroId: almas.heroId }, (have, need) => ({
      type: "bestSouls",
      n: have,
      heroId: almas.heroId,
      need,
    }), true);
  }
  const sinMorir = h.filter((r) => r.won && r.deaths === 0).length;
  pushSteps(earned, next, sinMorir, DEATHLESS, "deathless", "feats", { kind: "icon", icon: "health" }, (have, need) => ({
    type: "deathless",
    n: have,
    need,
  }), true);

  // El rango más alto de cada temporada.
  const picos = new Map<number, number>();
  for (const p of inp.rankSeries) {
    const s = seasonAt(p.startTime);
    if (s && p.badge > (picos.get(s.id) ?? 0)) picos.set(s.id, p.badge);
  }
  for (const [season, badge] of [...picos].sort((a, b) => a[0] - b[0])) {
    const t = peakTier(badge);
    if (!t) continue;
    earned.push({
      id: `peak-${season}`,
      group: "rank",
      tier: t,
      face: { kind: "rank", badge },
      tag: `S${season}`,
      kind: { type: "peak", season, badge },
    });
  }

  // Veterano: jugó clasificatorias en la temporada 1, la de la beta cerrada.
  if (h.some((r) => inScope(r, "ranked") && seasonAt(r.startTime)?.id === 1)) {
    earned.push({
      id: "veteran-1",
      group: "season",
      tier: "silver",
      face: { kind: "icon", icon: "recharge" },
      tag: "S1",
      kind: { type: "veteran", season: 1 },
    });
  }

  const peso = (a: Achievement) => TIER_ORDER.indexOf(a.tier) * 10 + GROUPS.indexOf(a.group);
  earned.sort((a, b) => peso(a) - peso(b) || placeOf(a) - placeOf(b));
  // Lo más cerca primero.
  next.sort((a, b) => ratio(b) - ratio(a));
  return { earned, next };
}

const placeOf = (a: Achievement): number =>
  "place" in a.kind ? a.kind.place : 0;
const ratio = (a: Achievement): number => (a.progress ? a.progress.have / a.progress.need : 0);

/** Suma la medalla alcanzada (si hay) y la próxima (si hay) de una escalera de umbrales. */
function pushSteps(
  earned: Achievement[],
  next: Achievement[],
  have: number,
  steps: Steps,
  id: string,
  group: Group,
  face: Face,
  kind: (have: number, need: number) => AchievementKind,
  /** Hazañas: la chapa dice la cifra real (34 kills), no el umbral (30). */
  actual = false
): void {
  const t = stepTier(have, steps);
  if (t) {
    const r = reached(have, steps);
    earned.push({ id, group, tier: t, face, tag: tagOf(actual ? have : r), kind: kind(have, actual ? have : r) });
  }
  const n = nextStep(have, steps);
  if (n != null && have > 0) {
    next.push({
      id: `${id}-next`,
      group,
      tier: stepTier(n, steps)!,
      face,
      tag: tagOf(n),
      kind: kind(have, n),
      progress: { have, need: n },
    });
  }
}

/** La temporada de un logro, si es de una. */
export function seasonOf(a: Achievement): number | null {
  return "season" in a.kind ? a.kind.season : null;
}

/** "65k" en vez de "65000": la chapa es chica. */
export function tagOf(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n);
}
