import { useEffect, useReducer } from "react";
import compsJson from "@data/comps.json";
import habitsJson from "@data/habits.json";
import type { HabitTable } from "@analysis/index";
import { catalog, text } from "./catalog";
import { DEFAULT_BAND, bandDataPath, type BandId, type LazyBandId } from "./bands";
import { useLang, type Lang } from "./i18n";
import { groupFamilies, type CompFamily } from "./families";

export type Archetype = "reroll1" | "reroll2" | "reroll3" | "fast8" | "standard";

interface RawUnitStat {
  id: string;
  boards: number;
  frequency: number;
  /** The analyzer keeps fringe units to explain outcomes; the tier list shows
   *  only the comp's identity, so rows stay the length they always were. */
  core?: boolean;
  avgStars: number;
  threeStarRate: number;
  avgItems: number;
  itemizedRate: number;
  items: { id: string; count: number }[];
  /** How the comp places with this unit on the board, and without it. The
   *  pipeline has measured both all along; nothing was reading them. */
  avgPlacementWith?: number;
  avgPlacementWithout?: number;
  /** How often the unit shows up among the comp's winning and losing boards. */
  winnerRate?: number;
  loserRate?: number;
}

interface RawComp {
  signature: string;
  trait: string;
  carry: string;
  carries: string[];
  rerollTarget: string;
  starTargets: string[];
  archetype: Archetype;
  avgLevel: number;
  count: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  playRate: number;
  units: RawUnitStat[];
  traits: { id: string; units: number; frequency: number }[];
  itemPriority: { id: string; count: number }[];
  tier: string;
}

export interface CompsFile {
  generatedAt: string;
  /** Which rank band these figures describe. */
  band?: string;
  /** Riot's client version behind the figures, e.g. "16.14". */
  patch?: string;
  /** The same patch as players say it: "17.7". */
  patchLabel?: string;
  /** True when the band had too little of this patch to publish a list. */
  insufficient?: boolean;
  /** True when the band publishes with a short sample because the patch just landed. */
  provisional?: boolean;
  /** Boards, not matches — eight per game. */
  sampleSize: number;
  calibration?: { matches: number };
  comps: RawComp[];
}

/**
 * The meta, one file per rank band.
 *
 * Apex is a static import so it travels in the main bundle and the first paint
 * needs no round trip. The other three are `import()`ed, which is what makes
 * Vite emit them as separate chunks: four metas in the bundle would be some
 * 1.8 MB of JSON, and only one of them is ever on screen.
 */
const files = new Map<BandId, CompsFile>([
  [DEFAULT_BAND, compsJson as unknown as CompsFile],
]);

const LOADERS: Record<LazyBandId, () => Promise<{ default: unknown }>> = {
  apex: () => import("@data/comps.apex.json"),
  "diamond-emerald": () => import("@data/comps.diamond-emerald.json"),
  "platinum-gold": () => import("@data/comps.platinum-gold.json"),
  "silver-below": () => import("@data/comps.silver-below.json"),
};

/** Fetch a band's file if it is not already here. Resolves once it is usable. */
export async function loadBand(band: BandId): Promise<void> {
  if (files.has(band)) return;
  const mod = await LOADERS[band as LazyBandId]();
  files.set(band, mod.default as CompsFile);
}

/**
 * Las tier lists congeladas de los sets que ya cerraron.
 *
 * `import.meta.glob` y no un `import()` con la ruta armada a mano porque Vite
 * necesita ver el patrón en tiempo de compilación para emitir los chunks. Hoy el
 * glob no encuentra nada —no hay ningún set archivado todavía— y eso es
 * exactamente lo que tiene que pasar: resuelve a un objeto vacío en vez de
 * romper el build, y el día que `close-set --freeze` escriba los archivos, el
 * siguiente build los toma solo sin tocar una línea de acá.
 *
 * Cada set congelado son cinco archivos de comps (uno por banda), y sólo se baja
 * el de la banda que se está mirando: son ~500 KB cada uno.
 */
const ARCHIVED = import.meta.glob("../../data/sets/*/comps*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const archivedFiles = new Map<string, CompsFile>();

const archivedKey = (set: number, band: BandId): string =>
  `../../data/sets/${set}/${bandDataPath(band)}`;

/** True cuando ese set congelado tiene un archivo para esa banda. */
export const hasArchived = (set: number, band: BandId): boolean =>
  archivedKey(set, band) in ARCHIVED;

/**
 * La tier list congelada de un set, o null si todavía no llegó.
 *
 * Devuelve null en vez de caer al set vigente a propósito: mostrar los números
 * del set nuevo bajo el título del viejo es peor que no mostrar nada, porque
 * nadie lo notaría.
 */
export const archivedFile = (set: number, band: BandId): CompsFile | null =>
  archivedFiles.get(archivedKey(set, band)) ?? null;

/** Baja la tier list congelada de un set si no está ya en memoria. */
export async function loadArchived(set: number, band: BandId): Promise<void> {
  const key = archivedKey(set, band);
  if (archivedFiles.has(key) || !(key in ARCHIVED)) return;
  const mod = await ARCHIVED[key]();
  archivedFiles.set(key, mod.default as CompsFile);
}

export const bandLoaded = (band: BandId): boolean => files.has(band);

/**
 * "El set vigente", como valor de `set`.
 *
 * Cero y no el número del set publicado a propósito: quien pregunta por el meta
 * de hoy no tiene por qué saber qué set es hoy, y así el caché de `byBandLang`
 * no cambia de clave —ni se invalida entero— el día que cambia el set.
 */
export const LIVE = 0;

const fileFor = (band: BandId, set: number = LIVE): CompsFile =>
  (set !== LIVE ? archivedFile(set, band) : null) ?? files.get(band) ?? files.get(DEFAULT_BAND)!;

/**
 * A band's raw file, for the analyzer, which compares a player's board against
 * the comps and the calibration of their own rank.
 *
 * Null until the band has arrived. The caller must wait rather than fall back:
 * measuring a Gold player's gold-hoarding against Master's threshold is the
 * mistake the bands exist to end.
 */
export const bandFile = (band: BandId): CompsFile | null => files.get(band) ?? null;

interface HabitsFile {
  patch?: string;
  patchLabel?: string;
  bands: Record<string, { boards: number; matches: number; habits: HabitTable }>;
}

/**
 * Every band's habits, in the bundle rather than fetched.
 *
 * The opposite call to the metas above, for the opposite reason: the coach needs
 * TWO bands at once — yours and the rung above — so a per-band fetch would cost
 * two round trips, and the whole file is under 3 KB because a habit is a handful
 * of scalars rather than fifty comps.
 *
 * Null for a band too thin to have been measured, which the caller must treat as
 * "no comparison available" rather than as zero.
 */
export const habitsFor = (band: string): HabitTable | null =>
  (habitsJson as unknown as HabitsFile).bands[band]?.habits ?? null;

/** How many boards a band's habits rest on, for the panel to print. */
export const habitBoards = (band: string): number =>
  (habitsJson as unknown as HabitsFile).bands[band]?.boards ?? 0;

/** Loads a band and reports whether it is ready, for views that need the file. */
export function useBandFile(band: BandId): CompsFile | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (files.has(band)) return;
    let alive = true;
    loadBand(band)
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [band]);

  return files.get(band) ?? null;
}

/**
 * Caches a build per band and language.
 *
 * The views call these on every render, and a comp carries its units, its items
 * and their translated names — rebuilding that on each keystroke of a filter
 * was never affordable.
 */
function byBandLang<T>(
  build: (band: BandId, lang: Lang, set: number) => T
): (band: BandId, lang: Lang, set?: number) => T {
  const cache = new Map<string, T>();
  return (band, lang, set = LIVE) => {
    // A band whose file has not arrived yet resolves to the default one, and is
    // cached under THAT name. Keying it by the band asked for would freeze the
    // default's comps under the other band's key and keep serving them after
    // the real file landed.
    //
    // Un set archivado no tiene ese fallback: o está su archivo o el llamador
    // (useBandMeta) devuelve null y muestra el placeholder. Caer al set vigente
    // sería servir los números del set nuevo bajo el título del viejo, que es
    // la versión más difícil de notar del error que este caché ya evitaba entre
    // bandas.
    const archivado = set !== LIVE;
    const effective = archivado || files.has(band) ? band : DEFAULT_BAND;
    const key = `${effective}|${set}|${lang}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const built = build(effective, lang, set);
    cache.set(key, built);
    return built;
  };
}

const stripSet = (id: string) => id.replace(/^TFT\d+_/, "");

/**
 * Which units are shown carrying items.
 *
 * This used to key off `itemizedRate` — the share of boards where the unit held
 * at least one item — and that is not a measure of anything. A TFT board hands
 * out far more components than any one unit can use, so leftovers land
 * everywhere: measured on our own data, Morgana held "an item" on 70% of boards
 * while averaging 1.9 of them, and Blitzcrank 68% at 1.77. Both were being
 * recommended as item holders. The result was 3.87 marked units per comp, with
 * 64% of comps marking four or more and one marking six. No competitor does
 * that, and it is not what the data says.
 *
 * `avgItems` separates them cleanly: a real recipient sits at 2.5-3.0 — a full
 * build — and a unit collecting scraps below 2. MetaTFT's own panel shows the
 * same shape from the other side, listing units by how often they hold zero.
 *
 * The comp's carries are always shown regardless: they are the comp's
 * definition, and a handful of them (summoner boards especially) average under
 * the threshold while still being the unit the comp is built around.
 */
const ITEM_BUILD = 2.3;

/**
 * How each archetype is played lives in the copy, not here: the badge, the label
 * and the steps are prose, and prose belongs in i18n.ts so both languages stay
 * in step. This file stays what it is — the shape of the data.
 */

/**
 * Which of a comp's measured units the tier list shows.
 *
 * Showing only the skeleton — units on half the boards or more — displayed a
 * "comp" of 3 champions whose own average level was 9.2. A level-9 board has
 * nine units on it; a flexible comp simply rotates the back line, so no single
 * rotation unit clears the 50% bar even though some slot always holds one.
 * 28 of 50 comps showed fewer than 8 units that way.
 *
 * So: every skeleton unit, then the most common rotations until the roster is
 * the size of the board this comp actually plays (its own average level). The
 * competitors draw the same picture — tactics.tools labels the two groups
 * "Core" and "Flex" on every comp row.
 */
export function selectRoster<T extends { core: boolean; frequency: number }>(
  units: T[],
  avgLevel: number
): (T & { flex: boolean })[] {
  const boardSize = Math.round(avgLevel);
  const core = units.filter((u) => u.core).map((u) => ({ ...u, flex: false }));
  const flex = units
    .filter((u) => !u.core)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, Math.max(0, boardSize - core.length))
    .map((u) => ({ ...u, flex: true }));
  return [...core, ...flex];
}

export interface ItemComponent {
  id: string;
  name: string;
  img: string;
}

export interface CompItem {
  id: string;
  name: string;
  img: string;
  share: number;
  desc: string;
  components: ItemComponent[];
}

/**
 * What having this unit is worth, inside this comp.
 *
 * `impact` is the placement with the unit minus the placement without it, so
 * negative is better — the same sign convention the units and items pages
 * already use. It is the closest thing the data has to advice: "find this one
 * and you finish a place and a half higher".
 */
export interface UnitImpact {
  /** Negative means boards holding this unit place better. */
  impact: number;
  /** Share of the comp's winning boards that had it. */
  winnerRate: number;
  /** Share of its losing boards that had it. */
  loserRate: number;
}

export interface CompUnit {
  id: string;
  name: string;
  cost: number;
  img: string;
  /**
   * True for a rotation slot: a unit under half the boards field, shown because
   * a real board of this comp is 8-9 units and the skeleton alone is not one.
   */
  flex: boolean;
  /** 3 when the comp reliably three-stars this unit, otherwise 0 (no marks). */
  stars: number;
  threeStarRate: number;
  itemizedRate: number;
  isStarTarget: boolean;
  isCarry: boolean;
  holdsItems: boolean;
  frequency: number;
  items: CompItem[];
  /** Absent when the sample on one side of the comparison was too thin to trust. */
  swing: UnitImpact | null;
}

export interface CompTrait {
  id: string;
  name: string;
  img: string;
  units: number;
  frequency: number;
}

/**
 * A one-word read on how a comp behaves, beyond its average.
 *
 * Two comps can share a placement and play completely differently: one that
 * reliably lands fourth is a different bet from one that either wins or dies.
 * The average hides that; these do not.
 *
 * Thresholds come from the quartiles of our own 41 comps rather than from
 * another site's numbers, which are computed over a different sample and a
 * different rank cut.
 */
export type CompTag = "consistent" | "highWin" | "contested" | "thinData";

/** Below this many boards the numbers move too much to lean on. */
const TAG_MIN_BOARDS = 50;

/** Linear-interpolated quantile. Empty input has no quantile, so: 0. */
function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export interface TagThresholds {
  /** Top-4 rate at the median: half the list is above it, always. */
  top4Median: number;
  /** Share of top-4s that are wins, at the 25th percentile. */
  convertLow: number;
  /** Win rate at the 75th percentile. */
  winHigh: number;
  /** Play rate at the 75th percentile: past this, expect company. */
  playHigh: number;
}

/**
 * The thresholds, measured on the comps being tagged instead of typed in.
 *
 * They used to be four constants — 0.57, 0.11, 0.17, 0.039 — read off the
 * quartiles of the 41 comps we had the day they were written. That is the same
 * mistake `estimateShrinkage` and `calibrate.ts` already fixed elsewhere, and it
 * failed the same way: the meta moved, the numbers stayed, and by 2026-07-26 no
 * comp in the list could earn "consistent" at all. A rule that tags nothing is
 * worse than no rule, and a set change would have frozen it for good.
 */
export function tagThresholds(comps: RawComp[]): TagThresholds {
  return {
    top4Median: quantile(comps.map((c) => c.top4Rate), 0.5),
    convertLow: quantile(comps.map(conversion), 0.25),
    winHigh: quantile(comps.map((c) => c.winRate), 0.75),
    playHigh: quantile(comps.map((c) => c.playRate), 0.75),
  };
}

/**
 * How much of a comp's top-4s it turns into wins.
 *
 * This is the statistic "consistent" was always about, and comparing win rate
 * and top-4 rate against separate thresholds only approximated it — badly. The
 * comps that reach the top four most often are also the ones that win most
 * often, so "high top-4 AND low win" describes almost nobody: on the real list
 * it picked exactly one comp per band, one bad week away from picking none.
 * The ratio separates them properly, and a bottom quartile always exists.
 */
const conversion = (c: RawComp) => (c.top4Rate > 0 ? c.winRate / c.top4Rate : 0);

function tagsFor(c: RawComp, t: TagThresholds): CompTag[] {
  const tags: CompTag[] = [];
  // Reaches the top half often, and closes it out less than most.
  if (c.top4Rate >= t.top4Median && conversion(c) <= t.convertLow) tags.push("consistent");
  else if (c.winRate >= t.winHigh) tags.push("highWin");
  if (c.playRate >= t.playHigh) tags.push("contested");
  if (c.count < TAG_MIN_BOARDS) tags.push("thinData");
  return tags;
}

export interface Comp {
  id: string;
  tier: string;
  /** How it behaves, past the averages. */
  tags: CompTag[];
  traitName: string;
  /** Up to two carries — comps are commonly known by both. */
  carryNames: string[];
  archetype: Archetype;
  avgLevel: number;
  units: CompUnit[];
  traits: CompTrait[];
  itemPriority: CompItem[];
  count: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  playRate: number;
}

/**
 * Whether an item is one the catalog can name and draw.
 *
 * The pipeline already drops placeholders like TFT_Item_EmptyBag, but the UI
 * guards the render too: an id with no catalog entry would otherwise draw as a
 * nameless, imageless chip, and there is never a reason to show one.
 */
// A function declaration, not a const arrow: it is reached through slugs.ts at
// module-init time, before this module's own const bindings have run, so it must
// be hoisted or that early call hits a temporal-dead-zone ReferenceError.
function isRealItem(id: string): boolean {
  return id in catalog.items;
}

function toItem(id: string, share: number, lang: Lang): CompItem {
  const entry = catalog.items[id];
  return {
    id,
    name: text(entry?.name, lang, stripSet(id)),
    img: entry?.img ?? "",
    share,
    desc: text(entry?.desc, lang),
    components: (entry?.composition ?? []).map((cid) => ({
      id: cid,
      name: text(catalog.items[cid]?.name, lang, stripSet(cid)),
      img: catalog.items[cid]?.img ?? "",
    })),
  };
}

function toUnit(raw: RawUnitStat, comp: RawComp, lang: Lang, flex: boolean): CompUnit {
  const champ = catalog.champions[raw.id];
  const isStarTarget = comp.starTargets.includes(raw.id);
  return {
    id: raw.id,
    name: text(champ?.name, lang, stripSet(raw.id)),
    cost: champ?.cost ?? 0,
    img: champ?.img ?? "",
    flex,
    // Only a genuine 3-star plan earns star marks, so the eye goes straight to
    // the units that matter.
    stars: isStarTarget ? 3 : 0,
    threeStarRate: raw.threeStarRate,
    itemizedRate: raw.itemizedRate,
    isStarTarget,
    isCarry: comp.carries.includes(raw.id),
    holdsItems: comp.carries.includes(raw.id) || (raw.avgItems ?? 0) >= ITEM_BUILD,
    frequency: raw.frequency,
    items: raw.items
      .filter((i) => isRealItem(i.id))
      .map((i) => toItem(i.id, Math.min(1, i.count / Math.max(1, raw.boards)), lang)),
    swing: toSwing(raw, comp),
  };
}

/**
 * A unit on nearly every board of the comp has no meaningful "without" to
 * compare against — the few boards missing it are usually someone dying at
 * stage 3, not a real alternative.
 */
const SWING_MIN_FREQUENCY = 0.05;
const SWING_MAX_FREQUENCY = 0.9;

/**
 * The unit has to actually tell winners from losers.
 *
 * This is the test that matters, and the placement difference alone fails it.
 * A unit present on 98% of winning boards and 94% of losing ones produces a
 * huge swing — the boards without it are broken games, and broken games place
 * last — while separating nothing a player could act on. Requiring a real gap
 * between the two rates keeps the advice to units whose presence is a genuine
 * choice.
 */
const SWING_MIN_SEPARATION = 0.05;

function toSwing(raw: RawUnitStat, comp: RawComp): UnitImpact | null {
  const { avgPlacementWith: withIt, avgPlacementWithout: without } = raw;
  if (typeof withIt !== "number" || typeof without !== "number") return null;
  if (raw.frequency < SWING_MIN_FREQUENCY || raw.frequency > SWING_MAX_FREQUENCY) return null;
  // Carries are the comp's definition, not a choice inside it: "this comp
  // places worse without its carry" is a tautology, not advice.
  if (comp.carries.includes(raw.id)) return null;

  const winnerRate = raw.winnerRate ?? 0;
  const loserRate = raw.loserRate ?? 0;
  if (Math.abs(winnerRate - loserRate) < SWING_MIN_SEPARATION) return null;

  return { impact: withIt - without, winnerRate, loserRate };
}

/**
 * The meta, with every name in one language.
 *
 * Built per language and cached, because the views call this on every render.
 */
export const buildComps = byBandLang((band: BandId, lang: Lang, set: number): Comp[] => {
  // Una vez por banda, no por comp: los umbrales describen a la lista entera.
  const all = fileFor(band, set).comps;
  const thresholds = tagThresholds(all);
  return all.map((c) => {
  const units = selectRoster(
    c.units.map((u) => ({ ...u, core: u.core !== false })),
    c.avgLevel
  )
    .map((u) => toUnit(u, c, lang, u.flex))
    // Skeleton before rotations, and inside each group by how much the comp
    // invests in the unit. Cost is deliberately NOT used: it is a shop price,
    // not a measure of importance.
    .sort((a, b) => {
      const ai = c.carries.indexOf(a.id);
      const bi = c.carries.indexOf(b.id);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      if (a.flex !== b.flex) return a.flex ? 1 : -1;
      return (
        b.itemizedRate - a.itemizedRate ||
        b.frequency - a.frequency ||
        a.name.localeCompare(b.name)
      );
    });

  return {
    id: c.signature,
    tier: c.tier,
    tags: tagsFor(c, thresholds),
    traitName: text(catalog.traits[c.trait]?.name, lang, stripSet(c.trait)),
    carryNames: c.carries.map((id) =>
      text(catalog.champions[id]?.name, lang, stripSet(id))
    ),
    archetype: c.archetype,
    avgLevel: c.avgLevel,
    units,
    traits: c.traits.map((t) => ({
      id: t.id,
      name: text(catalog.traits[t.id]?.name, lang, stripSet(t.id)),
      img: catalog.traits[t.id]?.img ?? "",
      units: t.units,
      frequency: t.frequency,
    })),
    itemPriority: c.itemPriority
      .filter((i) => isRealItem(i.id))
      .map((i) => toItem(i.id, i.count / Math.max(1, c.count), lang)),
    count: c.count,
    avgPlacement: c.avgPlacement,
    top4Rate: c.top4Rate,
    winRate: c.winRate,
    playRate: c.playRate,
  };
  });
});

export interface Dataset {
  generatedAt: string;
  /** Boards behind the meta: eight per match. */
  sampleSize: number;
  /** Matches behind it. The number that actually reads as "how much data". */
  matches: number;
  setLabel: string;
  /** The patch as players name it, e.g. "17.7". Empty on older files. */
  patchLabel: string;
  /** True when this band has too little of the current patch to say anything. */
  insufficient: boolean;
  /** True when the list is the new patch's and still on a thin sample. */
  provisional: boolean;
  /** True for a set that closed: these numbers are final, not stale. */
  archived: boolean;
}

export const datasetFor = (band: BandId, set: number = LIVE): Dataset => {
  const file = fileFor(band, set);
  return {
    generatedAt: file.generatedAt,
    sampleSize: file.sampleSize,
    matches: file.calibration?.matches ?? 0,
    // El catálogo describe el set vigente, así que para uno archivado el número
    // tiene que salir de lo que se pidió y no de él.
    setLabel: set === LIVE ? catalog.set : String(set),
    patchLabel: file.patchLabel ?? "",
    insufficient: file.insufficient === true,
    provisional: file.provisional === true,
    archived: set !== LIVE,
  };
};

const TIER_ORDER = ["S", "A", "B", "C", "D"];

/**
 * The tier list, grouped into families of near-identical comps.
 *
 * A family sits in the tier of its lead, and its variants are shown only through
 * the lead's toggle — so two comps that are the same set with one champion
 * swapped read as one row, not two. See families.ts for what counts as the same.
 */
export const buildTiers = byBandLang((band: BandId, lang: Lang, set: number) => {
  const families = groupFamilies(buildComps(band, lang, set));
  return TIER_ORDER.map((tier) => ({
    tier,
    families: families.filter((f) => f.lead.tier === tier),
  })).filter((group) => group.families.length > 0);
});

export interface BandMeta {
  band: BandId;
  comps: Comp[];
  tiers: { tier: string; families: CompFamily[] }[];
  dataset: Dataset;
}

/**
 * One band's meta, in the language the page is in.
 *
 * Null while a band is still downloading. The view shows a placeholder rather
 * than the band it came from: numbers from the wrong rank under the right
 * heading is precisely the mistake this whole feature exists to end.
 */
export function useBandMeta(band: BandId, set: number = LIVE): BandMeta | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const archivado = set !== LIVE;
  const listo = archivado ? archivedFile(set, band) !== null : files.has(band);

  useEffect(() => {
    if (listo) return;
    let alive = true;
    (archivado ? loadArchived(set, band) : loadBand(band))
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [band, set, archivado, listo]);

  if (!listo) return null;
  return {
    band,
    comps: buildComps(band, lang, set),
    tiers: buildTiers(band, lang, set),
    dataset: datasetFor(band, set),
  };
}
