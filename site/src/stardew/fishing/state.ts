/**
 * Pesca de Stardew Valley (etapa 2, tarea 5): qué pez se pesca dónde y cuándo (`canCatch`), lo que se elige en la
 * pestaña, cómo viaja en la dirección (`?place=Beach&season=1&weather=rain&time=1800`) y las dos listas: la grilla de
 * "¿qué puedo pescar ahora?" y la tabla de todos los peces.
 *
 * Los datos son los de `fish.json` (more_data.py): horas en el formato del juego (600 son las 6 de la mañana, 2400 la
 * medianoche y 2600 las 2 de la mañana, el fin del día), estaciones de 0 (primavera) a 3 (invierno) y los lugares de
 * `Data/Locations`, con la estación de cada entrada si la tiene.
 */

type Lang = "en" | "es";
type Pair = [en: string, es: string];

export interface FishPlace {
  key: string;
  name: Pair;
  /** Las estaciones de la entrada del lugar; null si no tiene (manda la del pez). */
  seasons: number[] | null;
  /**
   * La entrada ignora los requisitos de `Data/Fish` (`IgnoreFishDataRequirements`, los legendarios): a cualquier hora,
   * con el clima de su condición y la estación de la entrada. Sin esto rigen las horas y el clima del pez.
   */
  own?: { weather: "sunny" | "rainy" | "both" };
}
export interface Fish {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  difficulty: number;
  behavior: string;
  /** Franjas [desde, hasta) en el formato del juego; vacío en los de trampa (cualquier hora). */
  times: [number, number][];
  seasons: number[];
  weather: "sunny" | "rainy" | "both";
  minLevel: number;
  legendary: boolean;
  crabPot: boolean;
  /** Sólo pica con el encargo especial "Familia legendaria" del Sr. Qi activo. */
  qiOrder?: boolean;
  places: FishPlace[];
}
export interface FishData {
  fish: Fish[];
  places: { key: string; name: Pair }[];
  /** El precio base de venta de cada pez, por id (de `list.json`). */
  prices: Record<string, number>;
}

/** Suma los precios de la lista de objetos (`list.json`: id, slug, categoría, precio…) a los datos de pesca. */
export function withPrices(raw: Omit<FishData, "prices">, rows: readonly (readonly [string, string, number, number, ...unknown[]])[]): FishData {
  const ids = new Set(raw.fish.map((f) => f.id));
  return { ...raw, prices: Object.fromEntries(rows.filter((r) => ids.has(r[0])).map((r) => [r[0], r[3]])) };
}

export type Weather = "sunny" | "rainy";
/** Dónde y cuándo: un lugar (su clave, o "any"), la estación, el clima y la franja de dos horas (null: cualquier hora). */
export interface When {
  place: string;
  season: number;
  weather: Weather;
  time: number | null;
}

/** Las franjas de dos horas: de 6–8 de la mañana a 12–2 de la noche (el día del juego termina a las 2). */
export const SLOTS = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400] as const;
const ALL_SEASONS = [0, 1, 2, 3];

/**
 * Los legendarios del encargo especial del Sr. Qi ("Familia legendaria"): sólo pican con el encargo activo, en cualquier
 * estación (su entrada en `Data/Locations` pide `PLAYER_SPECIAL_ORDER_RULE_ACTIVE Current LEGENDARY_FAMILY` e ignora
 * horas, clima y estación del pez). No salen en "¿qué puedo pescar ahora?": la tabla los muestra con su etiqueta.
 */
export const isQiFamily = (fish: Fish): boolean => !!fish.qiOrder;

/** "Isla Jengibre (todas)": las zonas de la isla y el Volcán, que está en ella. "Cualquier lugar" es el valle, sin la isla. */
export const ISLAND = "island";
export const isIsland = (key: string): boolean => key.startsWith("Island") || key === "Caldera";

/**
 * Las estaciones en que un lugar da el pez. Manda la de la entrada del lugar; si no tiene, la del pez. La isla es
 * verano todo el año: lo que se pesca ahí se pesca en cualquier estación. El submarino y el Mercado nocturno sólo
 * existen en el invierno (15 a 17).
 */
export function placeSeasons(fish: Fish, place: FishPlace): number[] {
  if (isQiFamily(fish)) return ALL_SEASONS;
  if (place.key === "Submarine" || place.key === "BeachNightMarket") return [3];
  if (place.seasons) return place.seasons;
  if (isIsland(place.key)) return ALL_SEASONS;
  return fish.seasons;
}

/**
 * Las estaciones en que se pesca, de primavera a invierno: en el valle (por defecto) o en la isla. Separadas porque la
 * isla es verano todo el año y, sumada, haría "todo el año" a cualquier pez que también vive ahí (el Atún).
 */
export const fishSeasons = (fish: Fish, where: "valley" | "island" = "valley"): number[] =>
  ALL_SEASONS.filter((s) => fish.places.some((p) => isIsland(p.key) === (where === "island") && placeSeasons(fish, p).includes(s)));

/** ¿Alguna franja del pez se pisa con la franja de dos horas que arranca en `time`? */
const inHours = (fish: Fish, time: number | null): boolean =>
  time == null || fish.times.length === 0 || fish.times.some(([from, to]) => from < time + 200 && to > time);

/** Los lugares que cuenta lo elegido: uno, las zonas de la isla, o el valle entero (sin la isla). */
const placesFor = (fish: Fish, place: string): FishPlace[] =>
  place === "any" ? fish.places.filter((p) => !isIsland(p.key)) : place === ISLAND ? fish.places.filter((p) => isIsland(p.key)) : fish.places.filter((p) => p.key === place);

/** El horario y el clima que se muestran: los de la entrada si todos sus lugares ignoran los del pez, si no los del pez. */
export function shownRules(fish: Fish): { times: [number, number][]; weather: Fish["weather"] } {
  if (isQiFamily(fish)) return { times: [], weather: "both" };
  const own = fish.places.map((p) => p.own);
  if (!own.length || own.some((o) => !o)) return { times: fish.times, weather: fish.weather };
  const ws = new Set(own.map((o) => o!.weather));
  return { times: [], weather: ws.size === 1 ? [...ws][0] : "both" };
}

/**
 * ¿Se pesca este pez ahí, en esa estación, con ese clima y a esa hora? Los de trampa, en su trampa (o en "cualquier
 * lugar") a cualquier hora, con cualquier clima y todo el año. Una entrada que ignora los requisitos del pez (`own`)
 * vale a cualquier hora y con el clima de su condición. "Cualquier lugar" no incluye la isla. Los del encargo del Sr. Qi, nunca. El nivel mínimo no filtra: se muestra al lado.
 */
export function canCatch(fish: Fish, when: When): boolean {
  if (isQiFamily(fish)) return false;
  return placesFor(fish, when.place).some((p) => {
    if (!placeSeasons(fish, p).includes(when.season)) return false;
    if (fish.crabPot) return true;
    const weather = p.own ? p.own.weather : fish.weather;
    if (weather !== "both" && weather !== when.weather) return false;
    return p.own ? true : inHours(fish, when.time);
  });
}

// --- Las horas como se ven ------------------------------------------------------------------------------------------

/** La hora del juego en reloj de 12 horas, como el del juego: 600 → 6:00 am, 2400 → 12:00 am, 2600 → 2:00 am. */
export function fmtTime(t: number): string {
  const h = Math.floor(t / 100) % 24;
  const m = t % 100;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** Una franja: "6:00 am – 7:00 pm", o "10:00 pm a 2:00 am" en español. */
export const fmtRange = ([from, to]: readonly [number, number], lang: Lang): string => `${fmtTime(from)}${lang === "es" ? " a " : " – "}${fmtTime(to)}`;

/** El botón de una franja de dos horas: "6–8 am", "10 am–12 pm", "12–2 am". */
export function slotLabel(t: number): string {
  const part = (x: number) => {
    const h = Math.floor(x / 100) % 24;
    return { n: h % 12 || 12, ap: h < 12 ? "am" : "pm" };
  };
  const a = part(t);
  const b = part(t + 200);
  return a.ap === b.ap ? `${a.n}–${b.n} ${b.ap}` : `${a.n} ${a.ap}–${b.n} ${b.ap}`;
}

// --- Lo que se elige y la dirección ---------------------------------------------------------------------------------

/** El filtro de la tabla de todos los peces: todos, los de caña, los de trampa o los legendarios. */
export const KINDS = ["all", "rod", "crabPot", "legendary"] as const;
export type Kind = (typeof KINDS)[number];

/** Arriba, "¿qué puedo pescar ahora?"; abajo, el filtro de la tabla (tipo y estación, null: cualquiera). */
export type FishState = When & { kind: Kind; tseason: number | null };

/** Cualquier lugar, primavera, sol, de 6 a 8 de la mañana; la tabla entera. */
export const DEFAULT_FISH_STATE: FishState = { place: "any", season: 0, weather: "sunny", time: 600, kind: "all", tseason: null };

const seasonOf = (v: string | null): number | null => (v && /^[0-3]$/.test(v) ? +v : null);

/** El estado escrito en la dirección; lo que no se conoce (un lugar que no está en `places`, una hora rara) queda por defecto. */
export function readFishState(search: string, places: readonly string[]): FishState {
  const q = new URLSearchParams(search);
  const d = DEFAULT_FISH_STATE;
  const place = q.get("place");
  const time = q.get("time");
  const kind = q.get("kind");
  const weather = q.get("weather");
  return {
    place: place && (place === ISLAND || places.includes(place)) ? place : d.place,
    season: seasonOf(q.get("season")) ?? d.season,
    weather: weather === "rain" ? "rainy" : weather === "sun" ? "sunny" : d.weather,
    time: time === "any" ? null : time && (SLOTS as readonly number[]).includes(+time) && /^\d+$/.test(time) ? +time : d.time,
    kind: kind && (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : d.kind,
    tseason: seasonOf(q.get("tseason")) ?? d.tseason,
  };
}

/** Lo contrario: el `?…` del estado, sólo con lo que no es el valor por defecto (vacío si no cambió nada). */
export function writeFishState(s: FishState): string {
  const d = DEFAULT_FISH_STATE;
  const q = new URLSearchParams();
  if (s.place !== d.place) q.set("place", s.place);
  if (s.season !== d.season) q.set("season", String(s.season));
  if (s.weather !== d.weather) q.set("weather", s.weather === "rainy" ? "rain" : "sun");
  if (s.time !== d.time) q.set("time", s.time == null ? "any" : String(s.time));
  if (s.kind !== d.kind) q.set("kind", s.kind);
  if (s.tseason !== d.tseason && s.tseason != null) q.set("tseason", String(s.tseason));
  const out = q.toString().replace(/%3A/g, ":");
  return out ? `?${out}` : "";
}

// --- Las listas -----------------------------------------------------------------------------------------------------

const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];
const byName = (lang: Lang) => (a: Fish, b: Fish) => say(a.name, lang).localeCompare(say(b.name, lang), lang);

/** Lo que se pesca con lo elegido arriba, por nombre. */
export const catchNow = (data: FishData, s: FishState, lang: Lang): Fish[] => data.fish.filter((f) => canCatch(f, s)).sort(byName(lang));

/** La tabla de todos los peces, con el filtro de tipo y de estación, por nombre. */
export function fishTable(data: FishData, s: FishState, lang: Lang): Fish[] {
  return data.fish
    .filter((f) => (s.kind === "all" ? true : s.kind === "rod" ? !f.crabPot : s.kind === "crabPot" ? f.crabPot : f.legendary))
    // La estación de la tabla mira el valle, o la isla si arriba se eligió la isla.
    .filter((f) => s.tseason == null || fishSeasons(f, s.place === ISLAND ? "island" : "valley").includes(s.tseason))
    .sort(byName(lang));
}
