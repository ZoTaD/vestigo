import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { cleanDesc, localized, type Effects, type Localized } from "./catalog-text";
import { publishedSet, setFromEnv } from "./sets";
import { archivedSetNumbers } from "./setsArchive";

// CommunityDragon is the primary source for TFT static data: Riot stopped
// updating Data Dragon for TFT (it is stuck on Set 9).
//
// The same catalog is published in 28 locales, so the game's own names and
// descriptions are already translated — we download them rather than write
// them. English leads because it is the site's default and the language Riot's
// third-party review reads it in.
const LOCALES = { en: "en_us", es: "es_mx" } as const;
const cdragonUrl = (locale: string) =>
  `https://raw.communitydragon.org/latest/cdragon/tft/${locale}.json`;
const ASSET_BASE = "https://raw.communitydragon.org/latest/game/";
/**
 * De qué set se baja el catálogo: el que el sitio publica, no el que está vivo.
 *
 * Tiene que ser el mismo que `build.ts`, y por eso sale de la misma función en
 * vez de ser un literal como era hasta ahora. Si el catálogo se adelantara al
 * set nuevo mientras el sitio todavía muestra el viejo, las unidades del viejo
 * dejarían de tener nombre e imagen: la UI resuelve cada id contra este archivo.
 *
 * String porque CommunityDragon indexa sus sets por clave de texto (`en.sets["17"]`)
 * y el prefijo de los ids es `TFT17_`.
 */
const SET = String(setFromEnv(process.env.TFT_SET) ?? publishedSet(archivedSetNumbers()));
const OUT = "../data/catalog.json";

/**
 * The raw game data, which is the only place a champion's Team Planner code id
 * lives. The processed catalog above does not carry it.
 *
 * Team Planner codes let a player paste a comp into the game and be told which
 * champions to buy. The format is `02` + ten 12-bit champion ids (three hex
 * each) + `TFTSetNN`. The id is NOT the alphabetical order or the array index —
 * it is an intrinsic per-champion number stored under this CDTB-hashed field on
 * the character record. Verified by round-tripping two real in-game codes.
 */
const MAP22_URL =
  "https://raw.communitydragon.org/latest/game/data/maps/shipping/map22/map22.bin.json";
const TEAM_ID_FIELD = "{4d4e5cf5}";

/**
 * character_id → Team Planner code id, pulled from the raw game data.
 *
 * The field key is a hash of the real field name, stable as long as Riot does
 * not rename it; if the extraction ever returns nothing the caller warns rather
 * than shipping a catalog that silently lost every code.
 */
async function fetchTeamIds(setPrefix: string): Promise<Map<string, number>> {
  const res = await fetch(MAP22_URL);
  if (!res.ok) throw new Error(`map22 responded ${res.status}`);
  const data = (await res.json()) as unknown;

  const charRe = new RegExp(`${setPrefix}_[A-Za-z0-9]+`);
  const ids = new Map<string, number>();

  // The id sits on the character record; the champion it belongs to is the only
  // string field on that record naming a set champion.
  const championIn = (o: Record<string, unknown>): string | null => {
    for (const v of Object.values(o)) {
      if (typeof v === "string") {
        const m = charRe.exec(v);
        if (m) return m[0];
      }
    }
    return null;
  };

  const stack: unknown[] = [data];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const x of node) if (x && typeof x === "object") stack.push(x);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const rec = node as Record<string, unknown>;
    const id = rec[TEAM_ID_FIELD];
    if (typeof id === "number") {
      const champion = championIn(rec);
      if (champion && !ids.has(champion)) ids.set(champion, id);
    }
    for (const v of Object.values(rec)) if (v && typeof v === "object") stack.push(v);
  }
  return ids;
}

// CDragon ships asset paths as uppercase `.tex`; the served files are
// lowercase `.png` under the game asset root.
function assetUrl(texPath: string): string {
  return ASSET_BASE + texPath.toLowerCase().replace(/\.tex$/, ".png");
}

interface CDragonChampion {
  apiName: string;
  name: string;
  cost: number;
  tileIcon: string;
  traits: string[];
}
interface CDragonTrait {
  apiName: string;
  name: string;
  icon: string;
  // Each effect is one breakpoint; `minUnits` is how many units activate it.
  effects?: { minUnits?: number }[];
}
interface CDragonItem {
  apiName: string;
  name: string;
  icon: string;
  composition: string[];
  desc?: string;
  /** The numbers the description cites as `@Variable@`. */
  effects?: Effects;
}
interface CDragonFile {
  items: CDragonItem[];
  sets: Record<string, { name: string; champions: CDragonChampion[]; traits: CDragonTrait[] }>;
}

async function fetchLocale(locale: string): Promise<CDragonFile> {
  const res = await fetch(cdragonUrl(locale));
  if (!res.ok) throw new Error(`CommunityDragon responded ${res.status} for ${locale}`);
  return (await res.json()) as CDragonFile;
}

const byApiName = <T extends { apiName: string }>(rows: T[]) =>
  new Map(rows.map((r) => [r.apiName, r]));

async function main() {
  console.log(`fetching CommunityDragon TFT catalog (${Object.values(LOCALES).join(", ")})...`);
  const [en, es] = await Promise.all([fetchLocale(LOCALES.en), fetchLocale(LOCALES.es)]);

  const enSet = en.sets[SET];
  if (!enSet) throw new Error(`Set ${SET} not present in CommunityDragon`);
  // A missing Spanish set is survivable — every name falls back to English —
  // so it is a warning rather than a stop.
  const esSet = es.sets[SET];
  if (!esSet) console.warn(`warning: set ${SET} missing from ${LOCALES.es}, falling back to English`);

  const esChampions = byApiName(esSet?.champions ?? []);
  const esTraits = byApiName(esSet?.traits ?? []);
  const esItems = byApiName(es.items);

  // The copy-build code is a nicety, not the catalog's reason to exist, so a
  // failed fetch warns and the catalog ships without codes rather than aborting.
  let teamIds = new Map<string, number>();
  try {
    console.log("fetching champion Team Planner code ids from raw game data...");
    teamIds = await fetchTeamIds(`TFT${SET}`);
    if (teamIds.size === 0) console.warn("warning: extracted 0 team code ids — has the field moved?");
    else console.log(`  got ${teamIds.size} champion team codes`);
  } catch (e) {
    console.warn(`warning: could not fetch team codes (${(e as Error).message}) — codes will be absent`);
  }

  const champions: Record<
    string,
    { name: Localized; cost: number; img: string; teamId?: number }
  > = {};
  for (const c of enSet.champions) {
    if (!c.apiName || !c.tileIcon) continue;
    const teamId = teamIds.get(c.apiName);
    champions[c.apiName] = {
      name: localized(c.name, esChampions.get(c.apiName)?.name),
      cost: c.cost,
      img: assetUrl(c.tileIcon),
      ...(typeof teamId === "number" ? { teamId } : {}),
    };
  }

  // Breakpoints come from CDragon rather than a hand-written table, so a set
  // change refreshes them along with everything else.
  const traits: Record<string, { name: Localized; img: string; breakpoints: number[] }> = {};
  for (const t of enSet.traits) {
    if (!t.apiName || !t.icon) continue;
    const breakpoints = (t.effects ?? [])
      .map((e) => e.minUnits)
      .filter((n): n is number => typeof n === "number" && n > 0)
      .sort((a, b) => a - b);
    traits[t.apiName] = {
      name: localized(t.name, esTraits.get(t.apiName)?.name),
      img: assetUrl(t.icon),
      breakpoints: [...new Set(breakpoints)],
    };
  }

  // `composition` holds the two components a completed item is built from —
  // this is the recipe table the recommendation engine will need later, so it
  // never has to be hand-written.
  // CDragon ships every item from every set ever (3.6k, mostly old augments).
  // Keep only what matters here: this set's crafting graph plus set-specific
  // items. Everything else is dead weight in the bundle.
  //
  // English decides what to keep, so both languages describe the same catalog.
  const craftable = en.items.filter((it) => (it.composition?.length ?? 0) === 2);
  const componentIds = new Set(craftable.flatMap((it) => it.composition));
  const keep = (it: CDragonItem) =>
    (it.composition?.length ?? 0) === 2 ||
    componentIds.has(it.apiName) ||
    it.apiName.startsWith("TFT_Item_") ||
    it.apiName.startsWith(`TFT${SET}_`);

  const items: Record<
    string,
    { name: Localized; img: string; composition: string[]; desc: Localized }
  > = {};
  for (const it of en.items) {
    if (!it.apiName || !it.name || !it.icon || !keep(it)) continue;
    const translated = esItems.get(it.apiName);
    items[it.apiName] = {
      name: localized(it.name, translated?.name),
      img: assetUrl(it.icon),
      composition: it.composition ?? [],
      // Each language resolves its own text against its own numbers.
      desc: localized(
        cleanDesc(it.desc, it.effects),
        cleanDesc(translated?.desc, translated?.effects)
      ),
    };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        set: SET,
        generatedAt: new Date().toISOString(),
        langs: Object.keys(LOCALES),
        champions,
        traits,
        items,
      },
      null,
      2
    ),
    "utf-8"
  );

  const translatedItems = Object.values(items).filter((i) => i.name.es !== i.name.en).length;
  const translatedTraits = Object.values(traits).filter((t) => t.name.es !== t.name.en).length;
  console.log(
    `wrote ${Object.keys(champions).length} champions, ${Object.keys(traits).length} traits ` +
      `and ${Object.keys(items).length} items to ${OUT}\n` +
      `  translated: ${translatedItems} items, ${translatedTraits} traits`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
