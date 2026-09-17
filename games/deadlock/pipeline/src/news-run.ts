import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  buildEdition,
  indexEntry,
  isPatchPost,
  slugOf,
  type AssetEntry,
  type Edition,
  type Overrides,
  type SteamNewsItem,
} from "./news";

/**
 * Publica la edición de Vestigo News del parche vigente.
 *
 *   npm run build:news
 *
 * **Sólo reescribe la edición del último parche.** Su nota de análisis mejora
 * a medida que llegan partidas, así que se rehace en cada corrida. Las
 * ediciones anteriores quedan como se publicaron: sus números describen su
 * parche, y la tier list de hoy ya mide otro.
 *
 * Escribe `data/news/<fecha>.json` y el índice `data/news.json`. El índice va en
 * la raíz de `data/` a propósito: el guardián de publicación sólo mira los JSON
 * de ahí, y así una edición nueva cuenta como cambio.
 *
 * Los `.es.json` de la misma carpeta son la traducción hecha a mano. Este
 * script nunca los escribe.
 */

const STEAM_NEWS = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1422450&count=30&maxlength=0";
const ASSETS = "https://api.deadlock-api.com/v1/assets/items";
const DATA = "../data";
const NEWS_DIR = `${DATA}/news`;
const OVERRIDES_DIR = "news-overrides";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} contestó ${res.status}`);
  return (await res.json()) as T;
}

const readJson = <T>(path: string): T | undefined =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;

export function writeIndex(dir = NEWS_DIR, out = `${DATA}/news.json`, now = new Date()): number {
  const editions = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => readJson<Edition>(`${dir}/${f}`)!)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(indexEntry);
  writeFileSync(out, JSON.stringify({ generatedAt: now.toISOString(), editions }));
  return editions.length;
}

async function main() {
  const news = await getJson<{ appnews: { newsitems: SteamNewsItem[] } }>(STEAM_NEWS);
  const post = news.appnews.newsitems.filter(isPatchPost).sort((a, b) => b.date - a.date)[0];
  if (!post) throw new Error("Steam News no trajo ningún parche entre sus últimas 30 noticias.");

  const [assetsEn, assetsEs] = await Promise.all([
    getJson<AssetEntry[]>(ASSETS),
    getJson<AssetEntry[]>(`${ASSETS}?language=spanish`),
  ]);
  const catalog = readJson<{ heroes: Record<string, { name: { en: string } }> }>(`${DATA}/catalog.json`);
  if (!catalog) throw new Error("falta data/catalog.json: corré `npm run catalog` primero.");
  const heroNames = Object.fromEntries(Object.entries(catalog.heroes).map(([id, h]) => [id, h.name.en]));

  const slug = slugOf(post.date);
  const edition = buildEdition({
    post,
    heroNames,
    assetsEn,
    assetsEs,
    overrides: readJson<Overrides>(`${OVERRIDES_DIR}/${slug}.json`),
  });

  mkdirSync(NEWS_DIR, { recursive: true });
  writeFileSync(`${NEWS_DIR}/${slug}.json`, JSON.stringify(edition));
  const total = writeIndex();

  const { score, totals, unparsed } = edition;
  console.log(
    `${edition.title} (${slug}): ${totals.heroes} héroes, ${totals.items} objetos, ${totals.general} de sistema — ` +
      `${score.nerf} nerfs, ${score.buff} buffs, ${score.mixed} mixtos. ` +
      `Ediciones publicadas: ${total}.`
  );
  const mids = [...edition.heroes.flatMap((h) => h.groups.flatMap((g) => g.lines)), ...edition.items.flatMap((i) => i.lines)]
    .filter((l) => l.dir === "mid");
  if (mids.length) console.log(`sin clasificar (corregir en ${OVERRIDES_DIR}/${slug}.json):\n  ${mids.map((l) => l.src).join("\n  ")}`);
  if (unparsed.length) console.log(`sin atribuir:\n  ${unparsed.map((l) => l.src).join("\n  ")}`);
  if (!existsSync(`${NEWS_DIR}/${slug}.es.json`)) console.log(`falta la traducción: ${NEWS_DIR}/${slug}.es.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
