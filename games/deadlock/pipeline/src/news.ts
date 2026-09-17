/**
 * Vestigo News: de las notas de parche de Valve a una edición del periódico.
 *
 * **La fuente es Steam News, no el foro.** El feed `/v1/patches` de deadlock-api
 * republica el foro, y el post del foro es un recorte de ~300 caracteres que
 * apunta a Steam. El foro, además, contesta a los agentes con una página de
 * "verificando tu navegador". La API de noticias de Steam es pública, no pide
 * clave y trae el texto entero en BBCode, una línea por cambio:
 *
 *   [p]- Celeste: Shining Wonder damage reduced from 165 to 140[/p]
 *
 * Todo lo de este archivo es puro —texto adentro, estructura afuera— para poder
 * probarlo contra notas reales sin red. Lo que baja y escribe está en
 * `news-run.ts`.
 *
 * **Sólo sale en inglés.** El español se carga a mano en
 * `data/news/<fecha>.es.json` (decisión de ZoTaD del 2026-09-17): las líneas
 * libres ("ahora rebota con Ricochet") no se traducen bien con un glosario, y
 * un periódico con frases mal traducidas es peor que uno que dice "traducción
 * en camino". Los nombres de héroes, habilidades y objetos sí salen en los dos
 * idiomas, porque el juego ya los trae traducidos.
 */

export type Dir = "up" | "down" | "mid" | "fix";
export type Verdict = "nerf" | "buff" | "mixed" | "fix";

export interface NewsLine {
  /** La línea tal como la escribió Valve, sin el guion. Es la clave del `.es.json`. */
  src: string;
  /**
   * Lo que se muestra en inglés: "cooldown: 34s → 38s", sin el héroe ni la
   * habilidad. Falta cuando es igual a `src`, para no guardar cada línea dos veces.
   */
  text?: string;
  dir: Dir;
}

export interface Named {
  name: { en: string; es: string };
  img: string;
}

export interface HeroGroup {
  /** Sin habilidad: vida, arma, movimiento. */
  abilityId?: number;
  lines: NewsLine[];
}

export interface HeroEntry {
  heroId: number;
  verdict: Verdict;
  up: number;
  down: number;
  groups: HeroGroup[];
}

export interface ItemEntry {
  itemId: number;
  verdict: Verdict;
  lines: NewsLine[];
}

export interface Tally {
  nerf: number;
  buff: number;
  mixed: number;
  fix: number;
}

/**
 * Una edición. **Sin `generatedAt`**: se reescribe en cada corrida mientras el
 * parche está vigente, y una marca de hora haría que cada commit de la tier
 * list arrastrara un cambio acá aunque la edición fuera idéntica.
 */
export interface Edition {
  /** La fecha de publicación en Steam, YYYY-MM-DD. Es la URL de la edición. */
  slug: string;
  /** El nombre que usa Valve: "09-16-2026 Update". */
  title: string;
  date: string;
  url: string;
  /** Titular fijado a mano; sin él, el sitio elige de su banco de plantillas. */
  headline?: string;
  score: Tally;
  itemScore: Tally;
  totals: { heroes: number; heroLines: number; items: number; itemLines: number; general: number };
  general: NewsLine[];
  heroes: HeroEntry[];
  items: ItemEntry[];
  /** Líneas que no se supo a quién atribuir. Se muestran igual, al final. */
  unparsed: NewsLine[];
  abilities: Record<string, Named>;
  itemInfo: Record<string, Named & { slot: string }>;
}

export interface Overrides {
  headline?: string;
  dirs?: Record<string, Dir>;
}

/** Una noticia de `ISteamNews/GetNewsForApp`, con lo que usamos. */
export interface SteamNewsItem {
  title: string;
  url: string;
  contents: string;
  feedname: string;
  /** Segundos Unix. */
  date: number;
}

// ——— qué noticia es un parche ———

const DATE_TOKEN = /\b(\d{2})-(\d{2})-(\d{4})\b/;

/**
 * "Minor Update - 09-16-2026" y "Gameplay Update - 05-22-2026" son parches;
 * las notas de PC Gamer que Steam mezcla en el mismo feed no.
 */
export function isPatchPost(n: SteamNewsItem): boolean {
  return n.feedname === "steam_community_announcements" && /update/i.test(n.title) && DATE_TOKEN.test(n.title);
}

/** El nombre del parche como lo escribe el foro: "09-16-2026 Update". */
export function patchTitle(steamTitle: string): string {
  const m = steamTitle.match(DATE_TOKEN);
  return m ? `${m[0]} Update` : steamTitle;
}

export const slugOf = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

// ——— texto ———

const ENTITIES: Record<string, string> = { "&amp;": "&", "&gt;": ">", "&lt;": "<", "&quot;": '"', "&#039;": "'" };

/**
 * Secciones y líneas de un post en BBCode.
 *
 * Las secciones son `[b]\[ Heroes ][/b]`; lo que viene antes de la primera es
 * "general". Una línea sin guion es la continuación de la anterior: Valve parte
 * algunas (el convar de las ralentizaciones) y pegarla evita una línea huérfana.
 */
export function parseNotes(bbcode: string): Record<string, string[]> {
  const text = bbcode
    .replace(/\[\/?p\]|\[br\]/g, "\n")
    .replace(/\[\/?(?:b|i|u|list|\*)\]/g, "")
    .replace(/&(?:amp|gt|lt|quot|#039);/g, (e) => ENTITIES[e]);
  const out: Record<string, string[]> = {};
  let current = "general";
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const sec = l.match(/^\\?\[\s*([^\]]+?)\s*\\?\]$/);
    if (sec) {
      current = sec[1].toLowerCase();
      continue;
    }
    const list = (out[current] ??= []);
    if (/^[-•*]\s/.test(l)) list.push(l.replace(/^[-•*]\s+/, ""));
    else if (list.length) list[list.length - 1] += " " + l;
    else list.push(l);
  }
  return out;
}

/**
 * Atributos donde **más es peor**. En todo lo demás, subir el número es buff.
 *
 * Se compara el valor absoluto: "Bullet Resist Reduction reduced from -13% to
 * -12%" es una reducción más chica, o sea un nerf, aunque −12 sea mayor que −13.
 */
const WORSE_WHEN_HIGHER = /cooldown|\bcost\b|penalty|respawn|spawn time|cast delay|cast time|slow values|dash slows/i;

const firstNumber = (s: string): number | null => {
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

/**
 * Nerf o buff, por reglas.
 *
 * Lo que las reglas no pueden saber —"ahora rebota con Ricochet", "sólo puede
 * apuntar a héroes"— queda en `mid` y se corrige a mano en
 * `news-overrides/<fecha>.json`.
 */
export function classify(line: string): Dir {
  if (/^(?:[^:]+:\s*)?fixed\b/i.test(line)) return "fix";
  // "Buildup is 35% slower": la palabra ya dice para qué lado, sin número que comparar.
  if (/\bslower\b/i.test(line)) return "down";
  if (/\bfaster\b/i.test(line)) return "up";
  let bigger: boolean | null = null;
  const ft = line.match(/\bfrom\s+"?(.+?)"?\s+to\s+"?(.+?)"?(?:\s*\(.*\))?$/i);
  if (ft && !/changed from/i.test(line)) {
    const a = firstNumber(ft[1]);
    const b = firstNumber(ft[2]);
    if (a !== null && b !== null && a !== b) bigger = b > a;
  }
  if (bigger === null) {
    if (/\b(?:increased|increases)\b/i.test(line)) bigger = true;
    else if (/\b(?:reduced|decreased)\b/i.test(line)) bigger = false;
  }
  if (bigger === null) return "mid";
  return bigger !== WORSE_WHEN_HIGHER.test(line) ? "up" : "down";
}

/**
 * "T3 reduced from +8 to +6" → "Upgrade 3: +8 → +6".
 *
 * Lo que no tiene esa forma queda como está, con mayúscula inicial. Es texto
 * para leer rápido, no para procesar: el original sigue en `src`.
 */
export function compact(rest: string): string {
  const tier = (attr: string) =>
    attr
      .trim()
      .replace(/^T([123])\b\s*/, (_, n) => `Upgrade ${n} · `)
      .replace(/ · $/, "");
  let m = rest.match(/^(.*?)\s*(?:reduced|increased|decreased)?\s+from\s+"?(.+?)"?\s+to\s+"?(.+?)"?(\s*\(.*\))?$/i);
  if (m && !/changed from|\bnow\b/i.test(m[1])) {
    const attr = tier(m[1]);
    const arrow = (v: string) => v.replace(/->/g, "–");
    const note = m[4] ? ` ${m[4].trim()}` : "";
    return `${attr ? attr + ": " : ""}${arrow(m[2])} → ${arrow(m[3])}${note}`;
  }
  m = rest.match(/^(.*?)\s+(reduced|increased)\s+by\s+(~?\d+(?:\.\d+)?%)(.*)$/i);
  if (m) return `${tier(m[1])}: ${/reduced/i.test(m[2]) ? "−" : "+"}${m[3]}${m[4]}`;
  const free = rest.replace(/^T([123])\s+/, (_, n) => `Upgrade ${n} · `);
  return free.charAt(0).toUpperCase() + free.slice(1);
}

/** Una línea, sin `text` si no aporta nada distinto del original. */
const line = (src: string, text: string, dir: Dir): NewsLine => (text === src ? { src, dir } : { src, text, dir });

export function verdictOf(lines: NewsLine[]): Verdict {
  const up = lines.filter((l) => l.dir === "up").length;
  const down = lines.filter((l) => l.dir === "down").length;
  if (!up && !down) return "fix";
  // Mixto cuando ninguno de los dos lados dobla al otro: 3 contra 5 es mixto,
  // 2 contra 5 ya es nerf.
  if (up && down && Math.max(up, down) < 2 * Math.min(up, down)) return "mixed";
  return up > down ? "buff" : "nerf";
}

// ——— la edición ———

export interface AssetEntry {
  id: number;
  type: string;
  name: string;
  hero?: number | null;
  image?: string | null;
  image_webp?: string | null;
  shop_image_webp?: string | null;
  item_slot_type?: string | null;
}

export interface EditionInput {
  post: SteamNewsItem;
  heroNames: Record<string, string>;
  assetsEn: AssetEntry[];
  assetsEs: AssetEntry[];
  overrides?: Overrides;
}

const ORDER: Record<Verdict, number> = { nerf: 0, mixed: 1, buff: 2, fix: 3 };

const tally = (list: { verdict: Verdict }[]): Tally => ({
  nerf: list.filter((x) => x.verdict === "nerf").length,
  buff: list.filter((x) => x.verdict === "buff").length,
  mixed: list.filter((x) => x.verdict === "mixed").length,
  fix: list.filter((x) => x.verdict === "fix").length,
});

export function buildEdition(input: EditionInput): Edition {
  const { post, heroNames, assetsEn, assetsEs, overrides = {} } = input;
  const esName = new Map(assetsEs.map((a) => [a.id, a.name]));
  const dirOf = (src: string, fallback: string) => overrides.dirs?.[src] ?? classify(fallback);
  const sections = parseNotes(post.contents);
  const heroByName = new Map(Object.entries(heroNames).map(([id, name]) => [name.toLowerCase(), Number(id)]));
  const abilities: Record<string, Named> = {};
  const itemInfo: Record<string, Named & { slot: string }> = {};
  const unparsed: NewsLine[] = [];
  const img = (a: AssetEntry) => a.shop_image_webp ?? a.image_webp ?? a.image ?? "";

  // Héroes: "Nombre: resto". La habilidad es el prefijo más largo que coincide;
  // en un arreglo ("Fixed ... Rallying Charge") puede estar en el medio.
  const heroes = new Map<number, HeroEntry>();
  for (const src of sections.heroes ?? []) {
    const m = src.match(/^([^:]+):\s*(.+)$/);
    const heroId = m ? heroByName.get(m[1].trim().toLowerCase()) : undefined;
    if (!m || heroId === undefined) {
      unparsed.push(line(src, src, dirOf(src, src)));
      continue;
    }
    const rest = m[2];
    const own = assetsEn
      .filter((a) => a.type === "ability" && a.hero === heroId && a.name && a.name !== "Melee")
      .sort((a, b) => b.name.length - a.name.length);
    const low = rest.toLowerCase();
    const prefixed = own.find((a) => low.startsWith(a.name.toLowerCase() + " ") || low === a.name.toLowerCase());
    const ability = prefixed ?? (/^fixed\b/i.test(rest) ? own.find((a) => low.includes(a.name.toLowerCase())) : undefined);
    const body = prefixed ? rest.slice(prefixed.name.length).trim() : rest;
    if (ability) {
      abilities[ability.id] = { name: { en: ability.name, es: esName.get(ability.id) ?? ability.name }, img: img(ability) };
    }

    const entry = heroes.get(heroId) ?? { heroId, verdict: "fix" as Verdict, up: 0, down: 0, groups: [] };
    let group = entry.groups.find((g) => g.abilityId === ability?.id);
    if (!group) {
      group = { ...(ability ? { abilityId: ability.id } : {}), lines: [] };
      entry.groups.push(group);
    }
    group.lines.push(line(src, compact(body), dirOf(src, src)));
    heroes.set(heroId, entry);
  }
  const heroList = [...heroes.values()].map((h) => {
    // Lo del héroe (vida, arma) primero; las habilidades en el orden en que
    // las escribió Valve.
    h.groups.sort((a, b) => (a.abilityId === undefined ? -1 : 0) - (b.abilityId === undefined ? -1 : 0));
    const all = h.groups.flatMap((g) => g.lines);
    return {
      ...h,
      verdict: verdictOf(all),
      up: all.filter((l) => l.dir === "up").length,
      down: all.filter((l) => l.dir === "down").length,
    };
  });
  heroList.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.up + b.down - (a.up + a.down));

  // Objetos: "Nombre: resto".
  const upgrades = new Map(assetsEn.filter((a) => a.type === "upgrade").map((a) => [a.name.toLowerCase(), a]));
  const items = new Map<number, ItemEntry>();
  for (const src of sections.items ?? []) {
    const m = src.match(/^([^:]+):\s*(.+)$/);
    const item = m ? upgrades.get(m[1].trim().toLowerCase()) : undefined;
    if (!m || !item) {
      unparsed.push(line(src, src, dirOf(src, src)));
      continue;
    }
    itemInfo[item.id] = {
      name: { en: item.name, es: esName.get(item.id) ?? item.name },
      img: img(item),
      slot: item.item_slot_type ?? "",
    };
    const entry = items.get(item.id) ?? { itemId: item.id, verdict: "fix" as Verdict, lines: [] };
    entry.lines.push(line(src, compact(m[2]), dirOf(src, m[2])));
    items.set(item.id, entry);
  }
  const itemList = [...items.values()].map((i) => ({ ...i, verdict: verdictOf(i.lines) }));
  itemList.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.lines.length - a.lines.length);

  // Todo lo que no es héroe ni objeto va a "sistema", con su sección de origen.
  const general: NewsLine[] = Object.entries(sections)
    .filter(([k]) => k !== "heroes" && k !== "items")
    .flatMap(([, lines]) => lines.map((src) => line(src, src, dirOf(src, src))));

  const slug = slugOf(post.date);
  return {
    slug,
    title: patchTitle(post.title),
    date: new Date(post.date * 1000).toISOString(),
    url: post.url,
    ...(overrides.headline ? { headline: overrides.headline } : {}),
    score: tally(heroList),
    itemScore: tally(itemList),
    totals: {
      heroes: heroList.length,
      heroLines: heroList.reduce((n, h) => n + h.groups.reduce((m, g) => m + g.lines.length, 0), 0),
      items: itemList.length,
      itemLines: itemList.reduce((n, i) => n + i.lines.length, 0),
      general: general.length,
    },
    general,
    heroes: heroList,
    items: itemList,
    unparsed,
    abilities,
    itemInfo,
  };
}

export interface NewsIndexEntry {
  slug: string;
  title: string;
  date: string;
  headline?: string;
  score: Tally;
  itemScore: Tally;
}

export const indexEntry = (e: Edition): NewsIndexEntry => ({
  slug: e.slug,
  title: e.title,
  date: e.date,
  ...(e.headline ? { headline: e.headline } : {}),
  score: e.score,
  itemScore: e.itemScore,
});
