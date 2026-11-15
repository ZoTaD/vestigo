import { useEffect, useState } from "react";

/**
 * Las builds del juego con su % de victoria (2026-11-15), de
 * `games/deadlock/pipeline/src/communityBuilds.ts`. Plan:
 * `docs/plans/2026-11-15-builds-comunidad-plan.md`.
 *
 * Partido como lo escribe el pipeline: `index.json` para la portada y un
 * archivo por héroe para su biblioteca y sus fichas. Los dos bajan por
 * `import()` con la pestaña Builds, nunca con el JS de entrada, y quedan en una
 * caché que los hooks leen en el primer render (así el prerender sale con la
 * página entera: `entry-server.tsx` los precarga).
 */

import {
  cleanName,
  isOffensive,
  toBuild,
  type BuildStyle,
  type CatalogItem,
  type CommunityBuild,
  type HeroBuildsFile,
  type IndexCard,
  type IndexFile as BuildsIndexFile,
  type RawBuild,
  type Tag as BuildTag,
} from "../../games/deadlock/pipeline/src/communityBuildsCore";

export { cleanName, isOffensive };
export type { BuildStyle, BuildTag, BuildsIndexFile, CommunityBuild, HeroBuildsFile, IndexCard };

/* ── Carga ─────────────────────────────────────────────────────────── */

const HERO_FILES = import.meta.glob<{ default: HeroBuildsFile }>("../../games/deadlock/data/community-builds/[0-9]*.json");

let index: BuildsIndexFile | null | undefined;
let pidiendoIndex: Promise<void> | null = null;
const heroes = new Map<number, HeroBuildsFile | null>();
const pidiendoHeroe = new Map<number, Promise<void>>();

export function loadBuildsIndex(): Promise<void> {
  pidiendoIndex ??= import("@deadlock/community-builds/index.json")
    .then((m) => {
      index = m.default as unknown as BuildsIndexFile;
    })
    .catch(() => {
      index = null;
    });
  return pidiendoIndex;
}

export function loadHeroCommunityBuilds(heroId: number): Promise<void> {
  const ya = pidiendoHeroe.get(heroId);
  if (ya) return ya;
  const load = HERO_FILES[`../../games/deadlock/data/community-builds/${heroId}.json`];
  const p = load
    ? load()
        .then((m) => void heroes.set(heroId, m.default))
        .catch(() => void heroes.set(heroId, null))
    : Promise.resolve(void heroes.set(heroId, null));
  pidiendoHeroe.set(heroId, p);
  return p;
}

/** Lo ya cargado, sin pedir nada (para el `<head>` de la página). */
export const peekHeroCommunityBuilds = (heroId: number): HeroBuildsFile | null | undefined => heroes.get(heroId);

/** `undefined` mientras carga, `null` si no hay archivo. */
export function useBuildsIndex(): BuildsIndexFile | null | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (index !== undefined) return;
    let vivo = true;
    loadBuildsIndex().then(() => vivo && bump((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return index;
}

export function useHeroCommunityBuilds(heroId: number | null): HeroBuildsFile | null | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (heroId === null || heroes.has(heroId)) return;
    let vivo = true;
    loadHeroCommunityBuilds(heroId).then(() => vivo && bump((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, [heroId]);
  return heroId === null ? null : heroes.get(heroId);
}

/**
 * Una build que todavía no está en los datos del día (recién subida a
 * Vestigo): se pide en vivo a deadlock-api y se recorta con las mismas reglas
 * que el pipeline (`toBuild`). Sin partidas: la estadística llega con la
 * corrida de mañana.
 */
const vivas = new Map<number, Promise<CommunityBuild | null>>();
export function fetchLiveBuild(heroId: number, id: number, catalog: Record<string, CatalogItem>): Promise<CommunityBuild | null> {
  const ya = vivas.get(id);
  if (ya) return ya;
  const p = fetch(`https://api.deadlock-api.com/v1/builds?hero_id=${heroId}&build_id=${id}&only_latest=true`)
    .then((r) => (r.ok ? (r.json() as Promise<RawBuild[]>) : []))
    .then((rows) => {
      const raw = rows.find((x) => x?.hero_build?.hero_build_id === id && x.hero_build.hero_id === heroId);
      if (!raw) return null;
      const b = toBuild(raw, undefined, catalog, new Set());
      return b.cats.length > 0 ? b : null;
    })
    .catch(() => null);
  vivas.set(id, p);
  return p;
}

/* ── Cuentas ───────────────────────────────────────────────────────── */

export const winRate = (b: { wins: number; matches: number }): number | null => (b.matches > 0 ? b.wins / b.matches : null);

/** El límite inferior de Wilson al 95 %: el mismo criterio que el pipeline. */
export function wilson(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centro = p + (z * z) / (2 * n);
  const margen = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centro - margen) / d;
}

/** Debajo de esto el % de victoria se muestra pero no se compara: dice poco. */
export const MIN_MATCHES_FOR_RATE = 200;
/** Para "Recomendadas por datos": muy jugadas, no la de 300 partidas con suerte. */
export const MIN_MATCHES_RECOMMENDED = 2000;

export type BuildSort = "popular" | "winrate" | "new";

export function sortBuilds<T extends Pick<CommunityBuild, "matches" | "wins" | "updated" | "id"> & { official?: true }>(builds: T[], sort: BuildSort): T[] {
  const key: Record<BuildSort, (b: T) => number> = {
    popular: (b) => b.matches,
    winrate: (b) => (b.matches >= MIN_MATCHES_FOR_RATE ? wilson(b.wins, b.matches) : -1 + b.matches / 1e9),
    new: (b) => b.updated,
  };
  const k = key[sort];
  return [...builds].sort((a, b) => k(b) - k(a) || b.matches - a.matches || a.id - b.id);
}

/**
 * Las recomendadas de un héroe: las que eligió Vestigo y, si no hay, las 3 con
 * mejor victoria (Wilson) entre las muy jugadas. Las segundas dicen "elegida
 * por datos": no se disfrazan de recomendación de una persona.
 */
export function recommended(all: CommunityBuild[], n = 3, lang?: "en" | "es"): { builds: CommunityBuild[]; byData: boolean } {
  const oficiales = all.filter((b) => b.official);
  if (oficiales.length > 0) return { builds: oficiales, byData: false };
  // Las que se pueden leer: en inglés o en el idioma de la página, si alcanzan.
  const legibles = lang ? all.filter((b) => b.lang === 0 || langMatches(b.lang, lang)) : all;
  const builds = legibles.filter((b) => b.matches >= MIN_MATCHES_RECOMMENDED).length >= n ? legibles : all;
  let muy = builds.filter((b) => b.matches >= MIN_MATCHES_RECOMMENDED);
  // Un héroe poco jugado, sin ninguna muy jugada: las del cuarto de arriba en partidas.
  if (muy.length === 0) {
    const corte = [...builds].sort((a, b) => b.matches - a.matches)[Math.max(0, Math.ceil(builds.length / 4) - 1)]?.matches ?? 0;
    muy = builds.filter((b) => b.matches >= Math.max(MIN_MATCHES_FOR_RATE, corte));
  }
  return { builds: sortBuilds(muy, "winrate").slice(0, n), byData: true };
}

/** Los objetos de una build, sin repetir, en el orden de sus categorías. */
export const allItems = (b: Pick<CommunityBuild, "cats">): number[] => [...new Set(b.cats.flatMap((c) => c.items))];

/** Cuántos objetos comparten dos builds. */
export function shared(a: number[], b: number[]): number {
  const s = new Set(a);
  return [...new Set(b)].filter((x) => s.has(x)).length;
}

/**
 * Los idiomas de Steam (`ELanguage`) que tienen nombre propio en el filtro;
 * los demás van a "Otros".
 */
export const BUILD_LANGS: Record<number, { en: string; es: string }> = {
  0: { en: "English", es: "Inglés" },
  5: { en: "Spanish", es: "Español" },
  26: { en: "Spanish (LatAm)", es: "Español (Latam)" },
  8: { en: "Russian", es: "Ruso" },
  6: { en: "Chinese", es: "Chino" },
  7: { en: "Chinese (Trad.)", es: "Chino (trad.)" },
  22: { en: "Portuguese (BR)", es: "Portugués (BR)" },
  11: { en: "Portuguese", es: "Portugués" },
  1: { en: "German", es: "Alemán" },
  2: { en: "French", es: "Francés" },
  4: { en: "Korean", es: "Coreano" },
  10: { en: "Japanese", es: "Japonés" },
  12: { en: "Polish", es: "Polaco" },
  21: { en: "Turkish", es: "Turco" },
  25: { en: "Ukrainian", es: "Ucraniano" },
};
/** Los dos españoles cuentan como uno para el filtro "en mi idioma". */
export const langMatches = (buildLang: number, lang: "en" | "es"): boolean => (lang === "es" ? buildLang === 5 || buildLang === 26 : buildLang === 0);

/* ── Lo subido a Vestigo y tu cuenta (en vivo, por la API) ─────────── */

export interface PublishedRow {
  id: number;
  hero: number;
  author: number;
  authorName: string;
  authorAvatar: string;
  name: string;
  tags: string[];
  note: string;
  created: number;
  updated: number;
}

/** Las etiquetas que suma Vestigo al subir (iguales a `TAGS` de `api/src/builds/routes.ts`). */
export const VESTIGO_TAGS = ["beginner", "lane", "aggressive", "tank", "support", "late", "anti-spirit", "anti-gun", "fun"] as const;
export type VestigoTag = (typeof VESTIGO_TAGS)[number];
export const NOTE_MAX = 200;
export const MAX_TAGS = 4;

const enNavegador = () => typeof window !== "undefined" && typeof fetch !== "undefined";

/** Las builds subidas a Vestigo de un héroe. `[]` si la API no contesta: la página sigue con las del juego. */
export function usePublished(heroId: number | null, version = 0): PublishedRow[] | undefined {
  const [rows, setRows] = useState<{ hero: number; v: number; rows: PublishedRow[] } | undefined>();
  useEffect(() => {
    if (heroId === null || !enNavegador()) return;
    let vivo = true;
    fetch(`/api/builds?hero=${heroId}`, { credentials: "same-origin" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : { builds: [] }))
      .then((b: { builds?: PublishedRow[] }) => vivo && setRows({ hero: heroId, v: version, rows: Array.isArray(b.builds) ? b.builds : [] }))
      .catch(() => vivo && setRows({ hero: heroId, v: version, rows: [] }));
    return () => {
      vivo = false;
    };
  }, [heroId, version]);
  return rows && rows.hero === heroId ? rows.rows : undefined;
}

export interface Account {
  steamId: string;
  accountId: number;
  name: string;
  avatar: string;
}

/** La cookie que deja el login (`api/src/index.ts`): dice "hay sesión" sin preguntar. */
export const hasSession = (): boolean => typeof document !== "undefined" && /(?:^|;\s*)vg_in=1/.test(document.cookie);

/** La cuenta guardada por `NavAccount` (que la confirma con `/api/me`). */
export function storedAccount(): Account | null {
  if (!hasSession()) return null;
  try {
    const raw = localStorage.getItem("vg_account");
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

/** La sesión, leída después de montar (el HTML prerenderizado no sabe quién mira). */
export function useAccount(): { account: Account | null; ready: boolean } {
  const [state, set] = useState<{ account: Account | null; ready: boolean }>({ account: null, ready: false });
  useEffect(() => {
    if (!hasSession()) {
      set({ account: null, ready: true });
      return;
    }
    const guardada = storedAccount();
    if (guardada) set({ account: guardada, ready: true });
    let vivo = true;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Account>) : null))
      .then((a) => vivo && set({ account: a, ready: true }))
      .catch(() => vivo && set({ account: guardada, ready: true }));
    return () => {
      vivo = false;
    };
  }, []);
  return state;
}

/** Entrar con Steam y volver a la misma página. */
export const loginHref = (back: string): string => `/api/auth/steam?return=${encodeURIComponent(back)}`;

export interface GameBuildRow {
  buildId: number;
  heroId: number;
  author: number;
  name: string;
  version: number;
  updated: number;
}

export type MineState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; published: PublishedRow[] }
  | { status: "ok"; game: GameBuildRow[]; published: PublishedRow[] };

export function useMine(enabled: boolean, version = 0): MineState {
  const [s, set] = useState<MineState>({ status: "loading" });
  useEffect(() => {
    if (!enabled || !enNavegador()) return;
    let vivo = true;
    set({ status: "loading" });
    fetch("/api/builds/mine", { credentials: "same-origin" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { game?: GameBuildRow[]; published?: PublishedRow[] };
        if (!vivo) return;
        if (r.status === 401) set({ status: "signed-out" });
        else if (r.ok) set({ status: "ok", game: body.game ?? [], published: body.published ?? [] });
        else set({ status: "error", published: body.published ?? [] });
      })
      .catch(() => vivo && set({ status: "error", published: [] }));
    return () => {
      vivo = false;
    };
  }, [enabled, version]);
  return s;
}

export type PublishError = "signed_out" | "origin" | "slow_down" | "id" | "note" | "not_yours" | "too_many" | "game_unavailable" | "network";

export async function publishBuild(id: number, tags: string[], note: string): Promise<{ ok: true } | { ok: false; error: PublishError }> {
  try {
    const r = await fetch("/api/builds", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, tags, note }),
    });
    if (r.ok) return { ok: true };
    const b = (await r.json().catch(() => ({}))) as { error?: PublishError };
    return { ok: false, error: b.error ?? "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function unpublishBuild(id: number): Promise<boolean> {
  try {
    const r = await fetch(`/api/builds/${id}`, { method: "DELETE", credentials: "same-origin" });
    return r.ok;
  } catch {
    return false;
  }
}
