import { useEffect, useState } from "react";
import type { HistoryRow } from "./deadlockMatch";
import { inScope } from "./deadlockMatch";
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
 * **La rareza es medida, no inventada.** Statlocker pone "0,01 % ultra rare"
 * en todo; acá el porcentaje sale de contar en el scoreboard de la temporada
 * cuántos jugadores pasan cada umbral. Donde la API no mide algo (rachas,
 * victorias sin morir) no se muestra porcentaje.
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
  /** La temporada del logro: cada una tiene los suyos. */
  season: number;
  group: Group;
  tier: Tier;
  face: Face;
  /** Lo que va en la chapa de abajo: "#1", "500", "12". */
  tag: string;
  kind: AchievementKind;
  /** Sólo en las que faltan: cuánto hay y cuánto se pide. */
  progress?: { have: number; need: number };
  /** Qué fracción de los jugadores de la temporada lo tiene (0–1), si se sabe. */
  rarity?: number;
}

/* ---------------------------------------------------------------- umbrales */

/** Umbrales de bronce, plata, oro y eterna, de menor a mayor. */
type Steps = [number, number, number, number];

/** Por temporada: partidas con un héroe y partidas en total (clasificatorias). */
export const MASTERY: Steps = [25, 75, 200, 400];
export const CAREER: Steps = [100, 300, 600, 1000];
export const STREAK: Steps = [5, 8, 12, 18];
export const KILLS: Steps = [15, 20, 25, 30];
export const SOULS: Steps = [65_000, 80_000, 100_000, 120_000];
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

export interface SeasonRarity {
  players: number;
  feats: Record<string, Record<string, number>>;
  peak: Record<string, number>;
  heroes: Record<string, Record<string, number>>;
}

export interface SeasonRecords {
  final: boolean;
  rarity?: SeasonRarity;
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
        season,
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
          season,
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

/* --------------------------------------------------------- por temporada */

/**
 * Cada temporada tiene sus logros (ZoTaD, 6/11): la que terminó queda
 * congelada y la nueva arranca de cero. Todo se cuenta sobre las
 * clasificatorias de esa temporada, que es lo mismo que mide el scoreboard de
 * donde salen los porcentajes de rareza (`build:hero-records`).
 */
export interface SeasonInput {
  accountId: number;
  season: number;
  /** El historial entero; acá se filtra a las clasificatorias de la temporada. */
  history: HistoryRow[];
  rankSeries: RankPoint[];
  records: RecordsFile | null;
  /** Si es la vigente: sólo ella tiene "lo próximo". */
  current: boolean;
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

/** La división más baja de cada metal del pico, la que cuenta el archivo de rarezas. */
const PEAK_FLOOR: Record<Tier, number> = { bronze: 6, silver: 7, gold: 9, eternal: 11 };

/** Qué fracción de los jugadores de la temporada tiene el logro, si se sabe. */
export function rarityOf(a: Achievement, rar: SeasonRarity | undefined): number | undefined {
  if (!rar || rar.players <= 0) return undefined;
  const share = (n: number | undefined) => (n == null ? undefined : n / rar.players);
  const k = a.kind;
  switch (k.type) {
    case "record":
      return k.place / rar.players;
    case "mastery": {
      // Contra los que jugaron ese héroe: si no, uno nuevo parece rarísimo.
      const h = rar.heroes[String(k.heroId)];
      return h?.players ? (h[String(k.need)] ?? 0) / h.players : undefined;
    }
    case "career":
      return share(rar.feats.matches?.[String(k.need)]);
    case "bestKills":
      return share(rar.feats.max_kills_per_match?.[String(reached(k.n, KILLS))]);
    case "bestSouls":
      return share(rar.feats.max_net_worth_per_match?.[String(reached(k.n, SOULS))]);
    case "peak":
      return share(rar.peak[String(PEAK_FLOOR[a.tier])]);
    default:
      return undefined;
  }
}

/** El metal de una rareza: eterna < 1 %, oro < 5 %, plata < 20 %, bronce el resto. */
export function tierOfRarity(x: number): Tier {
  return x < 0.01 ? "eternal" : x < 0.05 ? "gold" : x < 0.2 ? "silver" : "bronze";
}

/** Para ordenar las que no tienen porcentaje: una rareza estimada por metal. */
const TIER_GUESS: Record<Tier, number> = { eternal: 0.005, gold: 0.03, silver: 0.1, bronze: 0.3 };

/** Los logros de una temporada, ganados y por ganar, de más raro a menos. */
export function seasonAchievements(inp: SeasonInput): { earned: Achievement[]; next: Achievement[] } {
  const S = inp.season;
  const rec = inp.records?.seasons[String(S)];
  const earned: Achievement[] = recordsOf(inp.records, inp.accountId).filter((a) => a.season === S);
  const next: Achievement[] = [];

  // Sólo clasificatorias de la temporada: lo mismo que cuenta el scoreboard.
  const h = inp.history.filter((r) => inScope(r, "ranked") && seasonAt(r.startTime)?.id === S);

  // Maestría por héroe en la temporada.
  const porHeroe = new Map<number, number>();
  for (const r of h) porHeroe.set(r.heroId, (porHeroe.get(r.heroId) ?? 0) + 1);
  const heroes = [...porHeroe].sort((a, b) => b[1] - a[1]);
  for (const [heroId, n] of heroes) {
    const t = stepTier(n, MASTERY);
    if (!t) continue;
    const r = reached(n, MASTERY);
    earned.push({
      id: `mastery-${S}-${heroId}`,
      season: S,
      group: "mastery",
      tier: t,
      face: { kind: "hero", heroId },
      tag: String(r),
      kind: { type: "mastery", heroId, matches: n, need: r },
    });
  }
  if (inp.current && heroes[0]) {
    const [heroId, n] = heroes[0];
    const sig = nextStep(n, MASTERY);
    if (sig != null) {
      next.push({
        id: `mastery-next-${S}-${heroId}`,
        season: S,
        group: "mastery",
        tier: stepTier(sig, MASTERY)!,
        face: { kind: "hero", heroId },
        tag: String(sig),
        kind: { type: "mastery", heroId, matches: n, need: sig },
        progress: { have: n, need: sig },
      });
    }
  }
  const steps = (
    have: number,
    st: Steps,
    id: string,
    group: Group,
    face: Face,
    kind: (have: number, need: number) => AchievementKind,
    actual = false
  ) => pushSteps(earned, inp.current ? next : [], S, have, st, id, group, face, kind, actual);

  steps(h.length, CAREER, `career-${S}`, "mastery", { kind: "icon", icon: "duration" }, (have, need) => ({
    type: "career",
    matches: have,
    need,
  }));

  steps(longestWinStreak(h), STREAK, `streak-${S}`, "feats", { kind: "icon", icon: "fire_rate" }, (have, need) => ({
    type: "streak",
    n: have,
    need,
  }), true);
  const kills = maxBy(h, (r) => r.kills);
  if (kills) {
    steps(kills.kills, KILLS, `kills-${S}`, "feats", { kind: "hero", heroId: kills.heroId }, (have, need) => ({
      type: "bestKills",
      n: have,
      heroId: kills.heroId,
      need,
    }), true);
  }
  const almas = maxBy(h, (r) => r.netWorth);
  if (almas) {
    steps(almas.netWorth, SOULS, `souls-${S}`, "feats", { kind: "hero", heroId: almas.heroId }, (have, need) => ({
      type: "bestSouls",
      n: have,
      heroId: almas.heroId,
      need,
    }), true);
  }
  const sinMorir = h.filter((r) => r.won && r.deaths === 0).length;
  steps(sinMorir, DEATHLESS, `deathless-${S}`, "feats", { kind: "icon", icon: "health" }, (have, need) => ({
    type: "deathless",
    n: have,
    need,
  }), true);

  // El pico de rango de la temporada.
  let pico = 0;
  for (const p of inp.rankSeries) if (seasonAt(p.startTime)?.id === S && p.badge > pico) pico = p.badge;
  const pt = peakTier(pico);
  if (pt) {
    earned.push({
      id: `peak-${S}`,
      season: S,
      group: "rank",
      tier: pt,
      face: { kind: "rank", badge: pico },
      tag: `S${S}`,
      kind: { type: "peak", season: S, badge: pico },
    });
  }

  // Veterano: jugó clasificatorias en la temporada 1, la de la beta cerrada.
  if (S === 1 && h.length > 0) {
    earned.push({
      id: "veteran-1",
      season: 1,
      group: "season",
      tier: "silver",
      face: { kind: "icon", icon: "recharge" },
      tag: "S1",
      kind: { type: "veteran", season: 1 },
    });
  }

  // El metal sale de la rareza medida cuando se sabe: eterna es "de poca gente".
  for (const a of earned) {
    a.rarity = rarityOf(a, rec?.rarity);
    if (a.rarity != null) a.tier = tierOfRarity(a.rarity);
  }
  const valor = (a: Achievement) => a.rarity ?? TIER_GUESS[a.tier];
  earned.sort((a, b) => valor(a) - valor(b) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  next.sort((a, b) => ratio(b) - ratio(a));
  return { earned, next };
}

/** Las temporadas con algo para mostrar, de la más nueva a la más vieja. */
export function seasonsWithMatches(history: HistoryRow[]): number[] {
  const ids = new Set<number>();
  for (const r of history) {
    const s = seasonAt(r.startTime);
    if (s && inScope(r, "ranked")) ids.add(s.id);
  }
  return [...ids].sort((a, b) => b - a);
}

const ratio = (a: Achievement): number => (a.progress ? a.progress.have / a.progress.need : 0);

/** Suma la medalla alcanzada (si hay) y la próxima (si hay) de una escalera de umbrales. */
function pushSteps(
  earned: Achievement[],
  next: Achievement[],
  season: number,
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
    earned.push({ id, season, group, tier: t, face, tag: tagOf(actual ? have : r), kind: kind(have, actual ? have : r) });
  }
  const n = nextStep(have, steps);
  if (n != null && have > 0) {
    next.push({
      id: `${id}-next`,
      season,
      group,
      tier: stepTier(n, steps)!,
      face,
      tag: tagOf(n),
      kind: kind(have, n),
      progress: { have, need: n },
    });
  }
}

/** La temporada de un logro. */
export function seasonOf(a: Achievement): number {
  return a.season;
}

/** "65k" en vez de "65000": la chapa es chica. */
export function tagOf(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n);
}
