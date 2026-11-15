import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  abilityPath,
  limpiar,
  cleanName,
  isOffensive,
  styleOf,
  toBuild,
  wilson,
  type BuildStyle,
  type CatalogItem,
  type CommunityBuild,
  type CurrencyChange,
  type HeroBuildsFile,
  type IndexCard,
  type IndexFile,
  type RawBuild,
  type StatRow,
  type Tag,
} from "./communityBuildsCore";

export { abilityPath, cleanName, isOffensive, styleOf, toBuild, wilson };
export type { BuildStyle, CatalogItem, CommunityBuild, CurrencyChange, HeroBuildsFile, IndexCard, IndexFile, RawBuild, StatRow, Tag };

/**
 * Las builds del juego que más se juegan, con su % de victoria (2026-11-15).
 *
 *   npm run build:community-builds
 *
 * Para la Biblioteca de builds (`/deadlock/builds`). Plan:
 * `docs/plans/2026-11-15-builds-comunidad-plan.md`.
 *
 * 1. `analytics/hero-build-stats`: partidas, victorias y jugadores de cada
 *    build del juego en los últimos `DAYS` días, todos los héroes en un pedido.
 *    Es la build que cada uno tenía elegida al empezar la partida.
 * 2. Por héroe, las `KEEP` más jugadas (con al menos `MIN_MATCHES`), más las que
 *    elige Vestigo (`vestigo-builds.json`) y las que la gente subió a Vestigo
 *    (`/api/builds/published`), aunque tengan pocas partidas.
 * 3. El detalle de cada una (`/v1/builds`), el nombre de Steam de los autores
 *    (`/v1/players/steam`, 100 por pedido) y las etiquetas del juego en los dos
 *    idiomas (`/v1/assets/build-tags`).
 *
 * Escribe `community-builds/index.json` (lo justo para la portada) y
 * `community-builds/<heroId>.json` (el detalle): una ficha baja sólo su héroe.
 * ~1.800 pedidos de detalle, de a `CONCURRENCY`, una vez por día. Si un héroe
 * falla queda el archivo que había.
 */

const API = "https://api.deadlock-api.com/v1";
const SITE = "https://vestigo.gg";
const DATA_DIR = "../data";
const OUT_DIR = `${DATA_DIR}/community-builds`;
export const DAYS = 30;
/** Cuántas builds se publican por héroe (sin contar las elegidas y las subidas). */
export const KEEP = 40;
/** Menos partidas que esto no entran por popularidad: el % no dice nada. */
export const MIN_MATCHES = 300;
/** Cuántas van al índice por héroe: las que se prerenderizan y la portada. */
export const INDEX_TOP = 10;
const CONCURRENCY = 8;
/** Las builds con id chico son las predeterminadas del juego, sin autor (ver `topPlayers.ts`). */
const MIN_BUILD_ID = 1000;

/**
 * Qué builds entran de un héroe: las forzadas (elegidas y subidas) y después
 * las más jugadas con al menos `MIN_MATCHES`, hasta `KEEP`.
 */
export function pickIds(rows: StatRow[], forced: number[], keep = KEEP, min = MIN_MATCHES): number[] {
  const out = [...new Set(forced)];
  const populares = rows
    .filter((r) => r.hero_build_id >= MIN_BUILD_ID && r.matches >= min)
    .sort((a, b) => b.matches - a.matches || a.hero_build_id - b.hero_build_id);
  for (const r of populares) {
    if (out.length >= keep + forced.length) break;
    if (!out.includes(r.hero_build_id)) out.push(r.hero_build_id);
  }
  return out;
}

/** El orden en que se publican: elegidas, después por partidas. */
export function sortBuilds(builds: CommunityBuild[]): CommunityBuild[] {
  return [...builds].sort((a, b) => Number(!!b.official) - Number(!!a.official) || b.matches - a.matches || b.updated - a.updated);
}

export function indexCard(b: CommunityBuild): IndexCard {
  const c: IndexCard = { id: b.id, name: b.name, authorName: b.authorName, matches: b.matches, wins: b.wins, style: b.style, key: b.key };
  if (b.official) c.official = true;
  if (b.verified) c.verified = true;
  return c;
}

/* ── La corrida ────────────────────────────────────────────────────── */

async function traer<T>(path: string, base = API): Promise<T> {
  let ultimo: unknown;
  for (let intento = 0; intento < 5; intento++) {
    try {
      const res = await fetch(`${base}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`${path.split("?")[0]} contestó ${res.status}`), { final: true });
      return (await res.json()) as T;
    } catch (e) {
      ultimo = e;
      if ((e as { final?: boolean }).final) break;
      // 504 y 429 son pasajeros en deadlock-api: se espera más cada vez (5, 10, 15, 20 s).
      if (intento < 4) await espera(5000 * (intento + 1));
    }
  }
  throw ultimo;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Corre `fn` sobre la lista de a `n` por vez. */
async function enTandas<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await fn(xs[k]);
      }
    }),
  );
  return out;
}

interface Forced {
  hero: number;
  id: number;
}

function leerJson<T>(path: string, porDefecto: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

async function main() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DAYS * 86_400_000);
  // Redondeado a la hora: la API contesta de su caché sin gastar el límite.
  const desdeUnix = Math.floor(desde.getTime() / 3_600_000) * 3600;

  const catalogo = JSON.parse(readFileSync(`${DATA_DIR}/catalog.json`, "utf8")) as { items: Record<string, CatalogItem & { cost?: number }> };
  const catalog: Record<string, CatalogItem> = {};
  for (const [id, it] of Object.entries(catalogo.items)) if (it.cost && it.slot) catalog[id] = { cost: it.cost, slot: it.slot };
  const heroes = (JSON.parse(readFileSync(`${DATA_DIR}/heroes.json`, "utf8")) as { heroes: { heroId: number }[] }).heroes.map((h) => h.heroId);

  const elegidas = leerJson<{ builds: Forced[] }>(`${DATA_DIR}/vestigo-builds.json`, { builds: [] }).builds;
  let subidas: Forced[] = [];
  try {
    subidas = (await traer<{ builds: { hero: number; id: number }[] }>("api/builds/published", SITE)).builds;
  } catch (e) {
    console.log(`  las subidas a Vestigo no contestaron (${e instanceof Error ? e.message : e}); sigo sin ellas`);
  }
  const oficial = new Set(elegidas.map((b) => b.id));
  const verificada = new Set(subidas.map((b) => b.id));
  const top = leerJson<{ heroes: Record<string, { builds: { id: number }[] }> }>(`${DATA_DIR}/top-players.json`, { heroes: {} });
  const deLosMejores = new Set(Object.values(top.heroes).flatMap((h) => h.builds.map((b) => b.id)));

  // Las etiquetas del juego, en los dos idiomas.
  const [tagsEn, tagsEs] = await Promise.all(
    ["english", "spanish"].map((l) => traer<{ id: number; label: string; icon?: string }[]>(`assets/build-tags?language=${l}`)),
  );
  const tags: Record<string, Tag> = {};
  for (const t of tagsEn) tags[t.id] = { en: t.label, es: tagsEs.find((x) => x.id === t.id)?.label ?? t.label, icon: t.icon ?? "" };
  const tagIds = new Set(Object.keys(tags).map(Number));

  const stats = await traer<StatRow[]>(`analytics/hero-build-stats?min_unix_timestamp=${desdeUnix}&min_matches=100`);
  const porHeroe = new Map<number, StatRow[]>();
  for (const r of stats) {
    const xs = porHeroe.get(r.hero_id) ?? [];
    xs.push(r);
    porHeroe.set(r.hero_id, xs);
  }
  const statDe = new Map(stats.map((r) => [r.hero_build_id, r]));
  console.log(`  ${stats.length} builds con partidas en ${porHeroe.size} héroes`);

  mkdirSync(OUT_DIR, { recursive: true });
  const index: IndexFile = { generatedAt: ahora.toISOString(), from: desde.toISOString().slice(0, 10), to: ahora.toISOString().slice(0, 10), matches: 0, heroes: {} };
  for (const r of stats) index.matches += r.matches;

  const porHeroeOut = new Map<number, CommunityBuild[]>();
  for (const hero of heroes) {
    const forzadas = [
      ...elegidas.filter((b) => b.hero === hero).map((b) => b.id),
      ...subidas.filter((b) => b.hero === hero).map((b) => b.id),
      ...(top.heroes[String(hero)]?.builds ?? []).map((b) => b.id),
    ];
    const ids = pickIds(porHeroe.get(hero) ?? [], forzadas);
    const crudas = await enTandas(ids, CONCURRENCY, async (id) => {
      try {
        const [raw] = await traer<RawBuild[]>(`builds?hero_id=${hero}&build_id=${id}&only_latest=true`);
        return raw ?? null;
      } catch {
        return null; // una build borrada no tira al héroe
      }
    });
    const builds = crudas
      .filter((r): r is RawBuild => !!r && r.hero_build.hero_id === hero)
      .map((r) => {
        const b = toBuild(r, statDe.get(r.hero_build.hero_build_id), catalog, tagIds);
        if (oficial.has(b.id)) b.official = true;
        if (verificada.has(b.id)) b.verified = true;
        if (deLosMejores.has(b.id)) b.top = true;
        return b;
      })
      .filter((b) => b.cats.length > 0);
    porHeroeOut.set(hero, builds);
    console.log(`  ${hero}: ${ids.length} pedidas, ${builds.length} publicadas`);
  }

  // Los nombres de Steam, 100 cuentas por pedido.
  const cuentas = [...new Set([...porHeroeOut.values()].flat().map((b) => b.author))];
  const perfiles = new Map<number, { name: string; avatar: string }>();
  for (let i = 0; i < cuentas.length; i += 100) {
    try {
      const q = cuentas.slice(i, i + 100).map((id) => `account_ids=${id}`).join("&");
      const rows = await traer<{ account_id: number; personaname?: string; avatar?: string }[]>(`players/steam?${q}`);
      for (const r of rows) {
        const avatar = /^https:\/\/avatars\.steamstatic\.com\/[\w.]+$/.test(r.avatar ?? "") ? r.avatar! : "";
        // Sin publicidad de otros sitios en el nombre (cuentas que se llaman "deadlocked.gg").
        const nombre = cleanName(limpiar(r.personaname, 60)).slice(0, 40);
        // Un nombre que no se publica queda vacío: el sitio pone "Jugador".
        perfiles.set(r.account_id, { name: isOffensive(nombre) ? "" : nombre, avatar });
      }
    } catch (e) {
      console.log(`  nombres de Steam: ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const hero of heroes) {
    const archivo = `${OUT_DIR}/${hero}.json`;
    const builds = sortBuilds(porHeroeOut.get(hero) ?? []);
    for (const b of builds) {
      const p = perfiles.get(b.author);
      if (p) {
        b.authorName = p.name;
        b.authorAvatar = p.avatar;
      }
    }
    if (builds.length === 0) {
      const anterior = leerJson<HeroBuildsFile | null>(archivo, null);
      if (anterior) {
        index.heroes[hero] = { builds: anterior.builds.length, matches: anterior.builds.reduce((s, b) => s + b.matches, 0), top: anterior.builds.slice(0, INDEX_TOP).map(indexCard) };
        console.log(`  ${hero}: sin builds, queda el anterior`);
      }
      continue;
    }
    const usadas = new Set(builds.flatMap((b) => b.tags));
    const file: HeroBuildsFile = {
      generatedAt: index.generatedAt,
      from: index.from,
      to: index.to,
      heroId: hero,
      tags: Object.fromEntries(Object.entries(tags).filter(([id]) => usadas.has(Number(id)))),
      builds,
    };
    writeFileSync(archivo, JSON.stringify(file));
    index.heroes[hero] = {
      builds: builds.length,
      matches: (porHeroe.get(hero) ?? []).reduce((s, r) => s + r.matches, 0),
      top: builds.slice(0, INDEX_TOP).map(indexCard),
    };
  }
  if (Object.keys(index.heroes).length === 0) throw new Error("ningún héroe salió");
  writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(index));
  console.log(`  listo: ${Object.keys(index.heroes).length} héroes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
