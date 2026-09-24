import gameArt from "@deadlock/game-art.json";
import { useEffect, useReducer } from "react";
import { useLang, type Lang } from "./i18n";
import type { BandId } from "./deadlockData";

/**
 * La capa de datos de la pestaña Héroes y de la página de cada héroe.
 *
 * Tres archivos, todos del pipeline de Deadlock (ver `heroKit.ts` y
 * `heroInsights.ts` allá):
 *
 * - `hero-kit.json`: los atributos base y el arma de los 38, para la tabla.
 * - `hero-kit/<id>.json`: arte, textos y habilidades de uno, para su página.
 * - `hero-insights.<banda>.json`: curva diaria, promedios por partida y
 *   enfrentamientos, medidos en la API en vivo sobre la ventana de la tier list.
 *
 * **Todo se baja con `import()`**: nadie que mire la tier list necesita las
 * habilidades de Dínamo. El prerender los precarga con las funciones `load*`
 * para que el HTML de cada página salga con su contenido (ver `entry-server`).
 */

// ---------------------------------------------------------------- tipos publicados

/** Un pedazo de texto del juego, ya limpio de HTML (ver `parseLoc` en el pipeline). */
export interface TextSpan {
  t: string;
  hi?: true;
  dim?: true;
  attr?: string;
  icon?: string;
}

export interface KitStat {
  label: string;
  value: string;
  unit: string;
  icon?: string;
  /** Cuánto suma cada punto de poder espiritual, según el juego. */
  spirit?: number;
}

export interface KitGroup {
  label?: string;
  passive?: true;
  stats: KitStat[];
}

export interface KitSection {
  text: TextSpan[];
  groups: KitGroup[];
  basics: KitStat[];
}

export interface KitAbility {
  id: number;
  slot: number;
  ultimate: boolean;
  name: string;
  img: string;
  video?: { mp4?: string; webm?: string };
  quip: TextSpan[];
  sections: KitSection[];
  cooldown?: KitStat;
  charges?: KitStat;
  upgrades: TextSpan[][];
}

export interface HeroText {
  role: string;
  playstyle: string;
  lore: string;
  tags: string[];
}

export interface HeroKitDetail {
  heroId: number;
  art: { card?: string; background?: string; vertical?: string };
  text: Record<Lang, HeroText>;
  abilities: Record<Lang, KitAbility[]>;
  icons: Record<string, string>;
}

export interface HeroWeapon {
  bulletDamage: number;
  pellets: number;
  fireRate: number;
  dps: number;
  sustainedDps: number;
  clip: number;
  reload: number;
  magazineDamage: number;
}

export interface HeroBaseStats {
  health: number;
  healthRegen: number;
  moveSpeed: number;
  sprintSpeed: number;
  stamina: number;
  lightMelee: number;
  heavyMelee: number;
  perBoon: { bulletDamage: number; health: number; spiritPower: number; meleeDamage: number };
  weapon?: HeroWeapon;
}

export interface HeroKitRow {
  heroId: number;
  complexity?: number;
  stats: HeroBaseStats;
  hash: string;
}

export interface HeroKitFile {
  generatedAt: string;
  heroes: Record<string, HeroKitRow>;
}

export const METRICS = [
  "kills",
  "deaths",
  "assists",
  "netWorth",
  "playerDamage",
  "damageTaken",
  "objectiveDamage",
  "lastHits",
  "accuracy",
] as const;
export type Metric = (typeof METRICS)[number];

export type DayPoint = [string, number, number];
export type PairPoint = [number, number, number];

export interface HeroInsight {
  daily: DayPoint[];
  perMatch: Partial<Record<Metric, number>>;
  vs: PairPoint[];
  with: PairPoint[];
}

export interface HeroInsightsFile {
  generatedAt: string;
  band: BandId;
  from: string;
  to: string;
  patch?: string;
  minPair: number;
  heroes: Record<string, HeroInsight>;
}

// ---------------------------------------------------------------- cargas

let kit: HeroKitFile | null = null;
let pidiendoKit: Promise<HeroKitFile | null> | null = null;

export function loadHeroKit(): Promise<HeroKitFile | null> {
  pidiendoKit ??= import("@deadlock/hero-kit.json")
    .then((m) => (kit = m.default as unknown as HeroKitFile))
    .catch(() => null);
  return pidiendoKit;
}

/**
 * Un archivo por héroe, con la ruta relativa y no con el alias: `import.meta.glob`
 * necesita ver el directorio para partirlo en un chunk por archivo.
 */
const DETALLES = import.meta.glob<{ default: HeroKitDetail }>("../../../deadlock/data/hero-kit/*.json");
const detalles = new Map<number, HeroKitDetail | null>();
const pidiendoDetalle = new Map<number, Promise<HeroKitDetail | null>>();

export function loadHeroDetail(heroId: number): Promise<HeroKitDetail | null> {
  const hit = pidiendoDetalle.get(heroId);
  if (hit) return hit;
  const key = Object.keys(DETALLES).find((k) => k.endsWith(`/hero-kit/${heroId}.json`));
  const p = key
    ? DETALLES[key]()
        .then((m) => m.default)
        .catch(() => null)
    : Promise.resolve(null);
  const guardado = p.then((d) => {
    detalles.set(heroId, d);
    return d;
  });
  pidiendoDetalle.set(heroId, guardado);
  return guardado;
}

const INSIGHTS: Record<BandId, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/hero-insights.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/hero-insights.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/hero-insights.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/hero-insights.arcanist-below.json"),
};
const insights = new Map<BandId, HeroInsightsFile | null>();
const pidiendoInsights = new Map<BandId, Promise<HeroInsightsFile | null>>();

export function loadInsights(band: BandId): Promise<HeroInsightsFile | null> {
  const hit = pidiendoInsights.get(band);
  if (hit) return hit;
  const p = INSIGHTS[band]()
    .then((m) => m.default as HeroInsightsFile)
    .catch(() => null)
    .then((f) => {
      insights.set(band, f);
      return f;
    });
  pidiendoInsights.set(band, p);
  return p;
}

/** Re-render cuando termina una carga; nada si ya estaba. */
function useLoad(done: boolean, load: () => Promise<unknown>, deps: unknown[]) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (done) return;
    let alive = true;
    load().then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useHeroKit(): HeroKitFile | null {
  useLoad(kit !== null, loadHeroKit, []);
  return kit;
}

/** `undefined` mientras baja, `null` si ese héroe no tiene archivo. */
export function useHeroDetail(heroId: number): HeroKitDetail | null | undefined {
  useLoad(detalles.has(heroId), () => loadHeroDetail(heroId), [heroId]);
  return detalles.has(heroId) ? detalles.get(heroId) : undefined;
}

export function useInsights(band: BandId): HeroInsightsFile | null | undefined {
  useLoad(insights.has(band), () => loadInsights(band), [band]);
  return insights.has(band) ? insights.get(band) : undefined;
}

/** El idioma de la página, con el inglés de respaldo. */
export function useKitLang(): Lang {
  return useLang().lang;
}

// ---------------------------------------------------------------- la tabla

/** Las columnas que se pueden ordenar. Las de la tier list y las del juego. */
export type SortKey =
  | "name"
  | "winRate"
  | "pickRate"
  | "banRate"
  | "health"
  | "healthRegen"
  | "healthPerBoon"
  | "moveSpeed"
  | "sprintSpeed"
  | "stamina"
  | "dps"
  | "sustainedDps"
  | "bulletDamage"
  | "fireRate"
  | "clip"
  | "reload"
  | "bulletPerBoon"
  | "spiritPerBoon"
  | "heavyMelee";

export interface TableRow {
  heroId: number;
  name: string;
  img: string;
  tier?: string;
  winRate?: number;
  pickRate?: number;
  /** En qué fracción de las partidas analizadas lo banearon; ver `RawHero.banRate`. */
  banRate?: number;
  stats?: HeroBaseStats;
}

/** El número de una fila para una columna, o `undefined` si no lo tiene. */
export function valueOf(row: TableRow, key: SortKey): number | string | undefined {
  const s = row.stats;
  const w = s?.weapon;
  switch (key) {
    case "name":
      return row.name;
    case "winRate":
      return row.winRate;
    case "pickRate":
      return row.pickRate;
    case "banRate":
      return row.banRate;
    case "health":
      return s?.health;
    case "healthRegen":
      return s?.healthRegen;
    case "healthPerBoon":
      return s?.perBoon.health;
    case "moveSpeed":
      return s?.moveSpeed;
    case "sprintSpeed":
      return s?.sprintSpeed;
    case "stamina":
      return s?.stamina;
    case "dps":
      return w?.dps;
    case "sustainedDps":
      return w?.sustainedDps;
    // Por disparo, no por proyectil: la escopeta de 9 perdigones de 3,6 hace 32
    // por disparo, y ordenarla por 3,6 la pondría última siendo de las que más pegan.
    case "bulletDamage":
      return w ? w.bulletDamage * w.pellets : undefined;
    case "fireRate":
      return w?.fireRate;
    case "clip":
      return w?.clip;
    case "reload":
      return w?.reload;
    case "bulletPerBoon":
      return s?.perBoon.bulletDamage;
    case "spiritPerBoon":
      return s?.perBoon.spiritPower;
    case "heavyMelee":
      return s?.heavyMelee;
  }
}

/**
 * Ordena por una columna. Los que no tienen el dato van **siempre al final**,
 * en cualquier sentido: un héroe sin arma no es "el de menos DPS".
 */
export function sortRows(rows: TableRow[], key: SortKey, dir: "asc" | "desc", locale = "en"): TableRow[] {
  const signo = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueOf(a, key);
    const vb = valueOf(b, key);
    if (va === undefined && vb === undefined) return a.name.localeCompare(b.name, locale);
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    const c =
      typeof va === "string" || typeof vb === "string"
        ? String(va).localeCompare(String(vb), locale)
        : va - vb;
    return c !== 0 ? c * signo : a.name.localeCompare(b.name, locale);
  });
}

/** El sentido en que arranca una columna: los nombres de A a Z, las cifras de mayor a menor. */
export const firstDir = (key: SortKey): "asc" | "desc" => (key === "name" || key === "reload" ? "asc" : "desc");

// ---------------------------------------------------------------- la página

export interface MetricRead {
  metric: Metric;
  value: number;
  /** El promedio de los héroes con dato. */
  avg: number;
  /** Qué parte de los otros héroes queda por debajo, de 0 a 1. */
  below: number;
}

/**
 * Dónde queda un héroe en cada promedio por partida, contra los otros.
 *
 * `below` es la fracción de los **otros** héroes con un valor menor: 0,97 en
 * asistencias quiere decir que 36 de los otros 37 dan menos asistencias.
 */
export function metricReads(file: HeroInsightsFile, heroId: number): MetricRead[] {
  const yo = file.heroes[String(heroId)]?.perMatch;
  if (!yo) return [];
  const out: MetricRead[] = [];
  for (const metric of METRICS) {
    const value = yo[metric];
    if (value === undefined) continue;
    const otros = Object.entries(file.heroes)
      .filter(([id, h]) => id !== String(heroId) && h.perMatch[metric] !== undefined)
      .map(([, h]) => h.perMatch[metric]!);
    if (otros.length === 0) continue;
    const todos = [...otros, value];
    out.push({
      metric,
      value,
      avg: todos.reduce((a, b) => a + b, 0) / todos.length,
      below: otros.filter((v) => v < value).length / otros.length,
    });
  }
  return out;
}

/** Las tres lecturas que más se alejan del medio: lo que distingue al héroe. */
export const standouts = (reads: MetricRead[], n = 3): MetricRead[] =>
  [...reads].sort((a, b) => Math.abs(b.below - 0.5) - Math.abs(a.below - 0.5)).slice(0, n);

/** Winrate de un cruce. */
export const pairRate = (p: PairPoint): number => p[2] / p[1];

/**
 * La curva diaria con el promedio de antes y de después del parche, cada uno
 * ponderado por partidas (un día con 800 partidas no pesa lo mismo que uno con
 * 1.700).
 */
export function dailySplit(daily: DayPoint[], patch?: string): { before?: number; after?: number } {
  const corte = patch ? patch.slice(0, 10) : undefined;
  const prom = (xs: DayPoint[]) => {
    const m = xs.reduce((n, d) => n + d[1], 0);
    return m > 0 ? xs.reduce((n, d) => n + d[2], 0) / m : undefined;
  };
  if (!corte) return { after: prom(daily) };
  // El día del parche va con "después" sólo si el parche salió temprano; como
  // no sabemos la hora de cada partida, ese día no cuenta para ninguno.
  return { before: prom(daily.filter((d) => d[0] < corte)), after: prom(daily.filter((d) => d[0] > corte)) };
}

/** "16m" → { n: "16", u: "m" }, para escribir la cifra grande y la unidad chica. */
export function splitValue(value: string, unit: string): { n: string; u: string } {
  const m = value.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { n: value, u: unit };
  return { n: m[1], u: (m[2] + unit).trim() };
}

/** Una cifra del juego con la coma decimal del idioma: "5.5" → "5,5" en español. */
export const localNumber = (n: string, lang: Lang): string => (lang === "es" ? n.replace(".", ",") : n);

/** Los héroes que tienen arma dibujada en el juego (la escribe game_assets.py). */
const GUNS = new Set<string>(gameArt.guns);

/**
 * El arma del héroe, sacada del juego (`panorama/images/heroes/guns/<código>_gun`).
 *
 * El código interno del héroe (inferno, gigawatt…) sólo aparece en la ruta de su
 * retrato, así que el arma se arma desde ahí. Sólo existe para las imágenes
 * servidas por el sitio (`/deadlock/game/`, ver `games/deadlock/tools/game_assets.py`);
 * con el retrato remoto devuelve `undefined` y la ficha no muestra arma.
 */
export function gunArt(card: string | undefined): string | undefined {
  const m = card?.match(/^\/deadlock\/game\/images\/heroes\/([a-z_]+)_card\.webp$/);
  return m && GUNS.has(m[1]) ? `/deadlock/game/images/heroes/guns/${m[1]}_gun.webp` : undefined;
}

