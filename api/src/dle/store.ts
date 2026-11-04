import { rankPlays, type PlayRow } from "./logic";
import type { Entry, Mode } from "./types";

/**
 * Dónde viven los días, las partidas y los intentos del Deadlockdle. `d1Store`
 * es la base de verdad; `memStore` hace lo mismo en memoria para los tests.
 * Las tablas están en `migrations/0002_dle.sql`.
 */

export interface DayRow {
  date: string;
  mode: Mode;
  answer: Entry;
}

export interface Play {
  startedAt: number;
  finishedAt: number | null;
  /** Ids de los intentos, en orden. */
  guesses: string[];
}

export type RankRow = PlayRow & { name: string; avatar: string };
export interface Stats {
  streak: number;
  played: number;
  won: number;
}

export interface Store {
  day(date: string, mode: Mode): Promise<DayRow | null>;
  /** Si el día ya existe, devuelve el guardado: la respuesta no cambia nunca. */
  saveDay(row: DayRow): Promise<DayRow>;
  /** Id → última fecha en que fue respuesta, antes de `before`. */
  lastSeen(mode: Mode, before: string): Promise<Map<string, string>>;
  play(steamId: string, mode: Mode, date: string): Promise<Play | null>;
  /**
   * "duplicate" si ese intento ya estaba o la partida ya se ganó; "over" si ya
   * se usaron los `max` intentos.
   */
  addGuess(steamId: string, mode: Mode, date: string, entryId: string, at: number, solved: boolean, max: number): Promise<"ok" | "duplicate" | "over">;
  ranking(date: string, mode: Mode, limit: number): Promise<RankRow[]>;
  playerCount(date: string, mode: Mode): Promise<number>;
  myRank(steamId: string, date: string, mode: Mode): Promise<number | null>;
  myStats(steamId: string, mode: Mode, today: string): Promise<Stats>;
  /** Sólo para los tests: en producción los usuarios los guarda el login. */
  saveUser(steamId: string, name: string, avatar: string): Promise<void>;
}

const prevDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Días seguidos resueltos hasta hoy; si hoy todavía no se resolvió, desde ayer. */
function streakOf(solvedDays: Set<string>, today: string): number {
  let day = solvedDays.has(today) ? today : prevDay(today);
  let n = 0;
  while (solvedDays.has(day)) {
    n++;
    day = prevDay(day);
  }
  return n;
}

interface MemPlay extends Play {
  steamId: string;
  date: string;
  mode: Mode;
}

export function memStore(): Store {
  const days = new Map<string, DayRow>();
  const plays: MemPlay[] = [];
  const users = new Map<string, { name: string; avatar: string }>();
  const find = (steamId: string, mode: Mode, date: string) => plays.find((p) => p.steamId === steamId && p.mode === mode && p.date === date);
  const solved = (date: string, mode: Mode) =>
    plays
      .filter((p) => p.date === date && p.mode === mode && p.finishedAt !== null)
      .map((p) => ({ steamId: p.steamId, guesses: p.guesses.length, ms: p.finishedAt! - p.startedAt, finishedAt: p.finishedAt! }));

  return {
    async day(date, mode) {
      return days.get(`${date}|${mode}`) ?? null;
    },
    async saveDay(row) {
      const key = `${row.date}|${row.mode}`;
      if (!days.has(key)) days.set(key, row);
      return days.get(key)!;
    },
    async lastSeen(mode, before) {
      const seen = new Map<string, string>();
      for (const d of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
        if (d.mode === mode && d.date < before) seen.set(d.answer.id, d.date);
      }
      return seen;
    },
    async play(steamId, mode, date) {
      const p = find(steamId, mode, date);
      return p ? { startedAt: p.startedAt, finishedAt: p.finishedAt, guesses: [...p.guesses] } : null;
    },
    async addGuess(steamId, mode, date, entryId, at, isSolved, max) {
      let p = find(steamId, mode, date);
      if (p && (p.finishedAt !== null || p.guesses.includes(entryId))) return "duplicate";
      if (p && p.guesses.length >= max) return "over";
      if (!p) {
        p = { steamId, mode, date, startedAt: at, finishedAt: null, guesses: [] };
        plays.push(p);
      }
      p.guesses.push(entryId);
      if (isSolved) p.finishedAt = at;
      return "ok";
    },
    async ranking(date, mode, limit) {
      return rankPlays(solved(date, mode))
        .slice(0, limit)
        .map((r) => ({ ...r, name: users.get(r.steamId)?.name ?? "Steam user", avatar: users.get(r.steamId)?.avatar ?? "" }));
    },
    async playerCount(date, mode) {
      return plays.filter((p) => p.date === date && p.mode === mode).length;
    },
    async myRank(steamId, date, mode) {
      const i = rankPlays(solved(date, mode)).findIndex((r) => r.steamId === steamId);
      return i < 0 ? null : i + 1;
    },
    async myStats(steamId, mode, today) {
      const mine = plays.filter((p) => p.steamId === steamId && p.mode === mode);
      const won = new Set(mine.filter((p) => p.finishedAt !== null).map((p) => p.date));
      return { streak: streakOf(won, today), played: mine.length, won: won.size };
    },
    async saveUser(steamId, name, avatar) {
      users.set(steamId, { name, avatar });
    },
  };
}

export function d1Store(db: D1Database): Store {
  return {
    async day(date, mode) {
      const r = await db.prepare("select answer_json from dle_days where date = ?1 and mode = ?2").bind(date, mode).first<{ answer_json: string }>();
      return r ? { date, mode, answer: JSON.parse(r.answer_json) as Entry } : null;
    },
    async saveDay(row) {
      await db
        .prepare("insert into dle_days (date, mode, answer_id, answer_json) values (?1, ?2, ?3, ?4) on conflict do nothing")
        .bind(row.date, row.mode, row.answer.id, JSON.stringify(row.answer))
        .run();
      return (await this.day(row.date, row.mode))!;
    },
    async lastSeen(mode, before) {
      const { results } = await db
        .prepare("select answer_id, max(date) as date from dle_days where mode = ?1 and date < ?2 group by answer_id")
        .bind(mode, before)
        .all<{ answer_id: string; date: string }>();
      return new Map(results.map((r) => [r.answer_id, r.date]));
    },
    async play(steamId, mode, date) {
      const p = await db
        .prepare("select started_at, finished_at from dle_plays where steam_id = ?1 and date = ?2 and mode = ?3")
        .bind(steamId, date, mode)
        .first<{ started_at: number; finished_at: number | null }>();
      if (!p) return null;
      const { results } = await db
        .prepare("select answer_id from dle_guesses where steam_id = ?1 and date = ?2 and mode = ?3 order by n")
        .bind(steamId, date, mode)
        .all<{ answer_id: string }>();
      return { startedAt: p.started_at, finishedAt: p.finished_at, guesses: results.map((r) => r.answer_id) };
    },
    async addGuess(steamId, mode, date, entryId, at, isSolved, max) {
      // Todo en un lote, que D1 corre como una transacción: el número del intento sale de la tabla en el mismo
      // insert (dos intentos a la vez no se pisan), una partida terminada no acepta más, y la fila de la partida
      // se recalcula entera desde los intentos, así nunca queda desfasada.
      const [ins] = await db.batch([
        db
          .prepare(
            `insert into dle_guesses (steam_id, date, mode, n, answer_id, at, hit)
             select ?1, ?2, ?3,
               coalesce((select max(n) from dle_guesses where steam_id = ?1 and date = ?2 and mode = ?3), 0) + 1,
               ?4, ?5, ?6
             where not exists (select 1 from dle_plays where steam_id = ?1 and date = ?2 and mode = ?3 and finished_at is not null)
               and (select count(*) from dle_guesses where steam_id = ?1 and date = ?2 and mode = ?3) < ?7
             on conflict do nothing`,
          )
          .bind(steamId, date, mode, entryId, at, isSolved ? 1 : 0, max),
        db
          .prepare(
            `insert into dle_plays (steam_id, date, mode, started_at, finished_at, guesses, solved)
             select ?1, ?2, ?3, min(at), max(case when hit = 1 then at end), count(*), max(hit)
             from dle_guesses where steam_id = ?1 and date = ?2 and mode = ?3
             having count(*) > 0
             on conflict (steam_id, date, mode) do update set
               started_at = excluded.started_at, finished_at = excluded.finished_at,
               guesses = excluded.guesses, solved = excluded.solved`,
          )
          .bind(steamId, date, mode),
      ]);
      if (ins.meta.changes) return "ok";
      const p = await this.play(steamId, mode, date);
      return p && !p.finishedAt && p.guesses.length >= max && !p.guesses.includes(entryId) ? "over" : "duplicate";
    },
    async ranking(date, mode, limit) {
      const { results } = await db
        .prepare(
          `select p.steam_id, p.guesses, p.finished_at - p.started_at as ms, p.finished_at, coalesce(u.name, 'Steam user') as name, coalesce(u.avatar, '') as avatar
           from dle_plays p left join users u on u.steam_id = p.steam_id
           where p.date = ?1 and p.mode = ?2 and p.solved = 1
           order by p.guesses, ms, p.finished_at limit ?3`,
        )
        .bind(date, mode, limit)
        .all<{ steam_id: string; guesses: number; ms: number; finished_at: number; name: string; avatar: string }>();
      return results.map((r) => ({ steamId: r.steam_id, guesses: r.guesses, ms: r.ms, finishedAt: r.finished_at, name: r.name, avatar: r.avatar }));
    },
    async playerCount(date, mode) {
      const r = await db.prepare("select count(*) as n from dle_plays where date = ?1 and mode = ?2").bind(date, mode).first<{ n: number }>();
      return r?.n ?? 0;
    },
    async myRank(steamId, date, mode) {
      const me = await db
        .prepare("select guesses, finished_at - started_at as ms, finished_at from dle_plays where steam_id = ?1 and date = ?2 and mode = ?3 and solved = 1")
        .bind(steamId, date, mode)
        .first<{ guesses: number; ms: number; finished_at: number }>();
      if (!me) return null;
      const r = await db
        .prepare(
          `select count(*) as n from dle_plays where date = ?1 and mode = ?2 and solved = 1 and (
             guesses < ?3 or (guesses = ?3 and finished_at - started_at < ?4)
             or (guesses = ?3 and finished_at - started_at = ?4 and finished_at < ?5))`,
        )
        .bind(date, mode, me.guesses, me.ms, me.finished_at)
        .first<{ n: number }>();
      return (r?.n ?? 0) + 1;
    },
    async myStats(steamId, mode, today) {
      const { results } = await db
        .prepare("select date, solved from dle_plays where steam_id = ?1 and mode = ?2")
        .bind(steamId, mode)
        .all<{ date: string; solved: number }>();
      const won = new Set(results.filter((r) => r.solved).map((r) => r.date));
      return { streak: streakOf(won, today), played: results.length, won: won.size };
    },
    async saveUser(steamId, name, avatar) {
      const now = Date.now();
      await db
        .prepare("insert into users (steam_id, name, avatar, created_at, seen_at) values (?1, ?2, ?3, ?4, ?4) on conflict do nothing")
        .bind(steamId, name, avatar, now)
        .run();
    },
  };
}
