/**
 * Dónde viven las builds subidas a Vestigo. `d1Store` es la base de verdad
 * (`migrations/0003_builds.sql`); `memStore` hace lo mismo en memoria para los
 * tests.
 */

export interface PublishedBuild {
  buildId: number;
  heroId: number;
  accountId: number;
  name: string;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** Con el nombre y la foto de Steam de quien la subió (los guarda el login). */
export type PublishedWithAuthor = PublishedBuild & { authorName: string; authorAvatar: string };

export interface BuildStore {
  get(buildId: number): Promise<PublishedBuild | null>;
  /** Crea o actualiza; `createdAt` queda el de la primera vez. */
  save(b: PublishedBuild): Promise<PublishedBuild>;
  remove(buildId: number, accountId: number): Promise<boolean>;
  byAccount(accountId: number): Promise<PublishedBuild[]>;
  byHero(heroId: number, limit: number): Promise<PublishedWithAuthor[]>;
  /** Todas, sólo héroe e id: para el pipeline. */
  all(): Promise<{ heroId: number; buildId: number }[]>;
}

interface Row {
  build_id: number;
  hero_id: number;
  account_id: number;
  name: string;
  tags: string;
  note: string;
  created_at: number;
  updated_at: number;
  author_name?: string | null;
  author_avatar?: string | null;
}

function parseTags(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

const fromRow = (r: Row): PublishedBuild => ({
  buildId: r.build_id,
  heroId: r.hero_id,
  accountId: r.account_id,
  name: r.name,
  tags: parseTags(r.tags),
  note: r.note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** El SteamID64 de una cuenta: así se cruza con `users`. */
export const STEAM_BASE = 76561197960265728n;

export function d1Store(db: D1Database): BuildStore {
  return {
    async get(buildId) {
      const r = await db.prepare("select * from builds where build_id = ?1").bind(buildId).first<Row>();
      return r ? fromRow(r) : null;
    },
    async save(b) {
      await db
        .prepare(
          `insert into builds (build_id, hero_id, account_id, name, tags, note, created_at, updated_at)
           values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
           on conflict(build_id) do update set hero_id = ?2, account_id = ?3, name = ?4, tags = ?5, note = ?6, updated_at = ?7`,
        )
        .bind(b.buildId, b.heroId, b.accountId, b.name, JSON.stringify(b.tags), b.note, b.updatedAt)
        .run();
      return (await this.get(b.buildId))!;
    },
    async remove(buildId, accountId) {
      const r = await db.prepare("delete from builds where build_id = ?1 and account_id = ?2").bind(buildId, accountId).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    async byAccount(accountId) {
      const { results } = await db.prepare("select * from builds where account_id = ?1 order by updated_at desc").bind(accountId).all<Row>();
      return results.map(fromRow);
    },
    async byHero(heroId, limit) {
      // users.steam_id es texto: se arma el SteamID64 con la cuenta.
      const { results } = await db
        .prepare(
          `select b.*, u.name as author_name, u.avatar as author_avatar from builds b
           left join users u on u.steam_id = cast(b.account_id + ${STEAM_BASE} as text)
           where b.hero_id = ?1 order by b.updated_at desc limit ?2`,
        )
        .bind(heroId, limit)
        .all<Row>();
      return results.map((r) => ({ ...fromRow(r), authorName: r.author_name ?? "", authorAvatar: r.author_avatar ?? "" }));
    },
    async all() {
      const { results } = await db.prepare("select hero_id, build_id from builds").all<{ hero_id: number; build_id: number }>();
      return results.map((r) => ({ heroId: r.hero_id, buildId: r.build_id }));
    },
  };
}

export function memStore(users: Map<number, { name: string; avatar: string }> = new Map()): BuildStore {
  const rows = new Map<number, PublishedBuild>();
  return {
    async get(id) {
      return rows.get(id) ?? null;
    },
    async save(b) {
      const prev = rows.get(b.buildId);
      const row = { ...b, createdAt: prev?.createdAt ?? b.updatedAt };
      rows.set(b.buildId, row);
      return row;
    },
    async remove(id, acc) {
      const r = rows.get(id);
      if (!r || r.accountId !== acc) return false;
      rows.delete(id);
      return true;
    },
    async byAccount(acc) {
      return [...rows.values()].filter((r) => r.accountId === acc).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async byHero(hero, limit) {
      return [...rows.values()]
        .filter((r) => r.heroId === hero)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
        .map((r) => ({ ...r, authorName: users.get(r.accountId)?.name ?? "", authorAvatar: users.get(r.accountId)?.avatar ?? "" }));
    },
    async all() {
      return [...rows.values()].map((r) => ({ heroId: r.heroId, buildId: r.buildId }));
    },
  };
}
