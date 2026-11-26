/**
 * Dónde viven los seguidos de cada cuenta (2026-11-20). `d1FollowStore` es la base de verdad
 * (`migrations/0004_follows.sql`); `memFollowStore` hace lo mismo en memoria para los tests.
 */
export type Follows = { follows: number[] };

export interface FollowStore {
  get(steamId: string, game: string): Promise<Follows>;
  save(steamId: string, game: string, f: Follows, now: number): Promise<void>;
}

export function memFollowStore(): FollowStore {
  const m = new Map<string, Follows>();
  return {
    get: async (s, g) => m.get(`${s}|${g}`) ?? { follows: [] },
    save: async (s, g, f) => void m.set(`${s}|${g}`, { follows: [...f.follows] }),
  };
}

export function d1FollowStore(db: D1Database): FollowStore {
  return {
    async get(steamId, game) {
      const r = await db.prepare("select profile_ids from follows where steam_id = ? and game = ?").bind(steamId, game).first<{ profile_ids: string }>();
      return r ? { follows: JSON.parse(r.profile_ids) as number[] } : { follows: [] };
    },
    async save(steamId, game, f, now) {
      await db
        .prepare(
          "insert into follows (steam_id, game, profile_ids, updated_at) values (?, ?, ?, ?) " +
            "on conflict (steam_id, game) do update set profile_ids = excluded.profile_ids, updated_at = excluded.updated_at",
        )
        .bind(steamId, game, JSON.stringify(f.follows), now)
        .run();
    },
  };
}
