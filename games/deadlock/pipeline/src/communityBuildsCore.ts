/**
 * Lo puro de las builds de la comunidad (2026-11-15): tipos, el filtro de
 * textos, el orden de habilidades y cómo se recorta una build del juego. Sin
 * Node ni dependencias: lo usan el pipeline (`communityBuilds.ts`), la API
 * (`api/src/builds/routes.ts`, las notas) y el sitio
 * (`site/src/deadlockCommunityBuilds.ts`, las builds recién subidas que
 * todavía no están en los datos del día).
 */

const MAX_CATS = 12;
const MAX_ITEMS_PER_CAT = 30;
const MAX_PATH = 16;
const UPGRADE_COSTS = [1, 2, 5];

/**
 * Lo que no se publica tal cual (2026-11-15): el sitio se promociona y las
 * fichas se prerenderizan para Google, así que un nombre de build o de autor
 * con insultos, odio o sexo explícito se reemplaza por uno neutro y la
 * descripción se saca. Raíces en inglés, español y ruso; se compara sin
 * acentos, en minúsculas y con los números típicos de leetspeak (0→o, 1→i,
 * 3→e, 4→a, 5→s).
 */
/** En cualquier parte del texto: no aparecen dentro de palabras sanas. */
const EN_CUALQUIER_PARTE = [
  "fuck", "shit", "cunt", "bitch", "whore", "slut", "pussy", "penis", "vagina", "porn", "sexual", "rapist", "nigg", "faggot",
  "retard", "tranny", "goyim", "hitler", "1488", "molest", "jizz", "dildo", "hentai", "fisting", "incest", "masturb", "orgasm",
  "horny", "mierda", "pendejo", "maricon", "chupala",
];
/** Al principio de una palabra (raíces rusas que, en el medio, son parte de palabras comunes). */
const AL_EMPEZAR = ["хуй", "хуе", "хуё", "пизд", "ебат", "ебал", "ёб", "бляд", "блят", "сука", "залуп", "пидор", "пидр", "шлюх", "мудак", "дроч"];
/** Sólo la palabra entera o su plural: dentro de otras son inocentes (grape, icono, pijama, computadora…). */
const ENTERAS = [
  "dick", "cock", "sex", "rape", "fag", "kike", "chink", "spic", "nazi", "heil", "kkk", "pedo", "cum", "anal", "tits", "boob",
  "boobs", "milf", "puta", "puto", "verga", "pija", "concha", "cono", "culo", "joto", "pete",
];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[01345@$]/g, (c) => LEET[c] ?? c);
export function isOffensive(text: string): boolean {
  if (!text) return false;
  // Con los números tal cual (1488) y con leetspeak (sh1t → shit).
  const crudo = text.toLowerCase();
  const t = normalizar(text);
  const palabras = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (EN_CUALQUIER_PARTE.some((p) => t.includes(normalizar(p)) || crudo.includes(p))) return true;
  if (palabras.some((w) => AL_EMPEZAR.some((p) => w.startsWith(normalizar(p))))) return true;
  return palabras.some((w) => ENTERAS.some((p) => w === p || w === `${p}s` || w === `${p}es`));
}

/**
 * El nombre sin propaganda: muchas builds se llaman "Abrams [61% WR]
 * [tracklock.gg]". El % de victoria que vale es el medido, y un dominio en el
 * nombre es publicidad de otro sitio. Se sacan los dominios, los links de
 * Twitch y los "% WR"; si no queda nada, el nombre queda vacío.
 */
export function cleanName(name: string): string {
  return name
    .replace(/\[?\(?\s*~?\d{1,3}(?:[.,]\d+)?\s*%\s*(?:wr|win\s*rate|winrate)?\s*\)?\]?/gi, " ")
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:twitch\.tv|t\.tv|youtube\.com|youtu\.be)\/[\w-]+/gi, " ")
    .replace(/\[?\s*(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:gg|com|net|io|org|ru|tv|app|lol|xyz|me|co)\b(?:\/\S*)?\s*\]?/gi, " ")
    .replace(/\[\s*\]|\(\s*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-|~·:,]+|[\s\-|~·:,]+$/g, "")
    .trim();
}


/* ── Lo que se publica ─────────────────────────────────────────────── */

export interface CommunityBuild {
  id: number;
  name: string;
  desc: string;
  author: number;
  authorName: string;
  /** La foto chica de Steam, o "". */
  authorAvatar: string;
  /** El idioma de la build según Steam (`ELanguage`: 0 inglés, 5 español, 6 chino, 8 ruso…). */
  lang: number;
  version: number;
  /** Unix (s) de la última edición y de la primera publicación. */
  updated: number;
  published: number;
  favorites: number;
  /** En la ventana de `DAYS` días. 0 si casi no se juega (una elegida o subida nueva). */
  matches: number;
  wins: number;
  players: number;
  /** Las etiquetas del juego que tiene (ids de `tags` del índice). */
  tags: number[];
  style: BuildStyle;
  /** Lo que cuesta todo lo de la build, sin contar dos veces un objeto. */
  souls: number;
  /** Los 3 objetos más caros: la cara de la build en una lista. */
  key: number[];
  cats: { name: string; desc: string; items: number[] }[];
  /** El orden de habilidades: el id en cada paso (el primero desbloquea, los otros mejoran). */
  path: number[];
  /** Elegida por Vestigo. */
  official?: true;
  /** Subida a Vestigo por su autor, con la cuenta de Steam verificada. */
  verified?: true;
  /** Una de las que más usan los 20 mejores de la escalera (`top-players.json`). */
  top?: true;
}

export type BuildStyle = "weapon" | "spirit" | "vitality" | "hybrid";

export interface Tag {
  en: string;
  es: string;
  icon: string;
}

export interface HeroBuildsFile {
  generatedAt: string;
  from: string;
  to: string;
  heroId: number;
  tags: Record<string, Tag>;
  builds: CommunityBuild[];
}

export type IndexCard = Pick<CommunityBuild, "id" | "name" | "authorName" | "matches" | "wins" | "style" | "key"> & { official?: true; verified?: true };

export interface IndexFile {
  generatedAt: string;
  from: string;
  to: string;
  /** Partidas con build propia en la ventana, todos los héroes. */
  matches: number;
  heroes: Record<string, { builds: number; matches: number; top: IndexCard[] }>;
}

/* ── Lo que contesta la API ────────────────────────────────────────── */

export interface StatRow {
  hero_id: number;
  hero_build_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
}

export interface CurrencyChange {
  ability_id: number;
  currency_type: number;
  delta: number;
}

export interface RawBuild {
  hero_build: {
    hero_id: number;
    hero_build_id: number;
    author_account_id: number;
    last_updated_timestamp: number;
    publish_timestamp?: number;
    name: string;
    description?: string | null;
    language: number;
    version: number;
    tags?: number[] | null;
    details?: {
      mod_categories?: { name?: string | null; description?: string | null; mods?: { ability_id: number }[] | null }[] | null;
      ability_order?: { currency_changes?: CurrencyChange[] | null } | null;
    } | null;
  };
  num_favorites?: number | null;
}

export interface CatalogItem {
  cost: number;
  slot: "weapon" | "vitality" | "spirit";
}

/* ── Las cuentas, sin red ──────────────────────────────────────────── */

/**
 * El orden de habilidades del juego al formato del sitio (`addAbilityPoint`):
 * un paso por desbloqueo (moneda 2) y uno por cada mejora (moneda 1, cuesta 1,
 * 2 y 5 puntos). Algunas builds gastan los puntos de a uno: se juntan hasta
 * llegar al costo de la mejora siguiente.
 */
export function abilityPath(changes: CurrencyChange[] | null | undefined, max = MAX_PATH): number[] {
  const path: number[] = [];
  const nivel = new Map<number, number>();
  const pendiente = new Map<number, number>();
  for (const c of changes ?? []) {
    if (path.length >= max) break;
    const id = c.ability_id;
    if (!Number.isInteger(id) || id <= 0) continue;
    if (c.currency_type === 2) {
      if (nivel.has(id)) continue;
      nivel.set(id, 0);
      path.push(id);
    } else if (c.currency_type === 1) {
      // Una mejora sin desbloqueo antes: el juego lo desbloquea igual.
      if (!nivel.has(id)) {
        nivel.set(id, 0);
        path.push(id);
        if (path.length >= max) break;
      }
      let puntos = (pendiente.get(id) ?? 0) + Math.abs(c.delta);
      let n = nivel.get(id)!;
      while (n < UPGRADE_COSTS.length && puntos >= UPGRADE_COSTS[n] && path.length < max) {
        puntos -= UPGRADE_COSTS[n];
        n++;
        path.push(id);
      }
      nivel.set(id, n);
      pendiente.set(id, puntos);
    }
  }
  return path;
}

/** El límite inferior de Wilson al 95%: ordena por victoria sin premiar a las de pocas partidas. */
export function wilson(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centro = p + (z * z) / (2 * n);
  const margen = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (centro - margen) / d;
}

/** Arma, espíritu o vitalidad si una se lleva más de la mitad de las almas; si no, híbrida. */
export function styleOf(items: number[], catalog: Record<string, CatalogItem>): BuildStyle {
  const almas = { weapon: 0, vitality: 0, spirit: 0 };
  for (const id of new Set(items)) {
    const it = catalog[String(id)];
    if (it) almas[it.slot] += it.cost;
  }
  const total = almas.weapon + almas.vitality + almas.spirit;
  if (total === 0) return "hybrid";
  for (const s of ["weapon", "spirit", "vitality"] as const) if (almas[s] / total > 0.5) return s;
  return "hybrid";
}

export const limpiar = (s: string | null | undefined, max: number) =>
  (s ?? "")
    // Sin caracteres de control ni el HTML que algunos pegan en la descripción.
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

/** Una build del juego, recortada y con lo que calcula el sitio. */
export function toBuild(
  raw: RawBuild,
  stat: StatRow | undefined,
  catalog: Record<string, CatalogItem>,
  tagIds: Set<number>,
): CommunityBuild {
  const h = raw.hero_build;
  const cats = (h.details?.mod_categories ?? [])
    .map((c) => ({
      name: limpiar(c.name, 40),
      desc: limpiar(c.description, 160),
      // Sólo objetos que existen: las builds viejas traen algunos que ya no están.
      items: [...new Set((c.mods ?? []).map((m) => m.ability_id))].filter((id) => catalog[String(id)]).slice(0, MAX_ITEMS_PER_CAT),
    }))
    .filter((c) => c.items.length > 0)
    .slice(0, MAX_CATS);
  const todos = [...new Set(cats.flatMap((c) => c.items))];
  const souls = todos.reduce((s, id) => s + catalog[String(id)].cost, 0);
  const key = [...todos].sort((a, b) => catalog[String(b)].cost - catalog[String(a)].cost || a - b).slice(0, 3);
  const nombre = cleanName(limpiar(h.name, 120)).slice(0, 80);
  const desc = limpiar(h.description, 600);
  for (const c of cats) if (isOffensive(c.name) || isOffensive(c.desc)) Object.assign(c, { name: "", desc: "" });
  return {
    id: h.hero_build_id,
    // Sin nombre (o con uno que no se publica) el sitio pone "Build #<id>".
    name: nombre && !isOffensive(nombre) ? nombre : "",
    desc: isOffensive(desc) ? "" : desc,
    author: h.author_account_id,
    authorName: "",
    authorAvatar: "",
    lang: h.language ?? 0,
    version: h.version ?? 1,
    updated: h.last_updated_timestamp,
    published: h.publish_timestamp ?? h.last_updated_timestamp,
    favorites: raw.num_favorites ?? 0,
    matches: stat?.matches ?? 0,
    wins: stat?.wins ?? 0,
    players: stat?.players ?? 0,
    tags: [...new Set(h.tags ?? [])].filter((t) => tagIds.has(t)),
    style: styleOf(todos, catalog),
    souls,
    key,
    cats,
    path: abilityPath(h.details?.ability_order?.currency_changes),
  };
}

