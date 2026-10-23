/**
 * Motor del lector de partida de Stardew Valley (etapa 3, tarea 4). TypeScript puro: recibe la partida ya leída
 * (`parse.ts`) y los datos por parámetro, y devuelve ids y claves; los nombres los pone la pantalla.
 *
 * - `perfection`: las once partes de `Utility.percentGameComplete`, con sus pesos (`save.json`). Donde el juego mira a
 *   cada granjero (`Utility.GetFarmCompletion`), se hace igual: en las partes con número cuenta el granjero que más
 *   tiene; en las de sí o no, el anfitrión si la cumple y si no el primero que la cumpla. Obeliscos, reloj de oro y
 *   nueces son de la granja.
 * - `bundleStatus`: los paquetes del Centro Comunitario como los tiene la partida (`<bundleData>`, o `bundles.json` en
 *   las de antes de la 1.5), con lo que falta y lo que ya hay en los cofres.
 * - `weekGifts`: los cumpleaños de los próximos 7 días, cruzando estación y año.
 * - `missingFish`, `missingRecipes`: lo que falta para la colección, primero lo que se consigue ya.
 * - `today`: los consejos del día, en el orden de las reglas.
 */
import type { CalendarData, Festival } from "../calendar/state";
import { harvests, type CropsData, type Opts } from "../crops/calc";
import type { Room, Villager } from "../data";
import type { Fish } from "../fishing/state";
import type { Recipe } from "../recipes/state";
import { normId, type Player, type Save } from "./parse";

type Pair = [en: string, es: string];
type Season = 0 | 1 | 2 | 3;

/** La forma de `games/stardew/data/save.json` (`save_data.py`). */
export interface SaveData {
  perfection: { key: string; name: Pair; weight: number; total: number }[];
  /** Ids que cuentan en "Productos y recolección enviados". */
  shippable: string[];
  /** Ids de "Peces pescados" (también las medusas, que no están en `fish.json`). */
  fish: string[];
  /** Receta (clave del juego) → id del plato; `out` va sin prefijo en los objetos y con `(BC)` en los grandes. */
  cooking: { key: string; out: string }[];
  crafting: { key: string; out: string }[];
  /** Marca de correo de cada fruto estelar y dónde se consigue. */
  stardrops: { flag: string; name: Pair }[];
  obelisks: string[];
  clock: string;
  /** Misiones del Gremio de aventureros: monstruos que valen y cuántos. */
  slayer: { key: string; name: Pair; targets: string[]; count: number }[];
  /** Aldeanos de "Grandes amigos" y los corazones que piden (8 si se puede casar, 10 si no). */
  friends: { key: string; max: number }[];
  walnuts: number;
  /** Semana (1 a 32) → receta (clave) que enseña la Reina de la Salsa. */
  queenOfSauce: Record<string, string>;
}

export interface Part {
  key: string;
  weight: number;
  done: number;
  total: number;
  /** Cuánto de la parte vale para el juego, de 0 a 100 (en las de sí o no, 0 o 100). */
  pct: number;
  /** Ids o claves de lo que falta (vacío en el nivel y las nueces, que son un número). */
  missing: string[];
}

export interface Perfection {
  /** De 0 a 100. */
  total: number;
  parts: Part[];
}

const SEASON_DAYS = 28;
const YEAR_DAYS = 4 * SEASON_DAYS;
/** Puntos de amistad por corazón. */
const HEART = 250;
/** Clave del fruto estelar de las Minas: también vale el cofre del piso 100 (`Utility.foundAllStardrops`). */
const MINES_STARDROP = "CF_Mines";
const MINES_STARDROP_LEVEL = 100;
/** Correo que da los frutos estelares por hechos sin mirar los siete (`Utility.foundAllStardrops`). */
const MAX_STAMINA = "gotMaxStamina";

/** El nivel del granjero: la suma de las seis habilidades sobre 2, truncada (`Farmer.Level`). */
export const farmerLevel = (p: Player): number => Math.floor(p.skills.reduce((a, b) => a + b, 0) / 2);

const has = (map: Record<string, number>, id: string): boolean => normId(id) in map;

// --- Perfección ---------------------------------------------------------------------------------------------------

/** Lo que cuenta cada granjero en una parte con número: cuántos tiene y qué le falta. */
interface Count {
  done: number;
  missing: string[];
}

function count<T>(list: readonly T[], ok: (x: T) => boolean, id: (x: T) => string): Count {
  const missing: string[] = [];
  let done = 0;
  for (const x of list) {
    if (ok(x)) done++;
    else missing.push(id(x));
  }
  return { done, missing };
}

/** El granjero que más tiene; ante un empate, el primero (el anfitrión), como `GetFarmCompletion` con número. */
function best(players: readonly Player[], f: (p: Player) => Count): Count {
  let out = f(players[0]);
  for (const p of players.slice(1)) {
    const c = f(p);
    if (c.done > out.done) out = c;
  }
  return out;
}

/** El anfitrión si cumple; si no, el primero que cumpla; si nadie, el anfitrión (`GetFarmCompletion` con sí o no). */
function firstDone(players: readonly Player[], f: (p: Player) => Count, total: number): Count {
  return players.map(f).find((c) => c.done >= total) ?? f(players[0]);
}

function slayerOf(p: Player, data: SaveData): Count {
  return count(
    data.slayer,
    (q) => q.targets.reduce((a, t) => a + (p.kills[t] ?? 0), 0) >= q.count,
    (q) => q.key,
  );
}

function stardropsOf(p: Player, data: SaveData): Count {
  const mail = new Set(p.mail);
  if (mail.has(MAX_STAMINA)) return { done: data.stardrops.length, missing: [] };
  return count(
    data.stardrops,
    (s) => mail.has(s.flag) || (s.flag === MINES_STARDROP && p.minesChests.includes(MINES_STARDROP_LEVEL)),
    (s) => s.flag,
  );
}

export function perfection(save: Save, data: SaveData): Perfection {
  const ps = save.players;
  const built = new Set(save.buildings);
  const total: Record<string, number> = {
    shipped: data.shippable.length, obelisks: data.obelisks.length, clock: 1, slayer: data.slayer.length,
    friends: data.friends.length, level: 25, stardrops: data.stardrops.length, cooking: data.cooking.length,
    crafting: data.crafting.length, fish: data.fish.length, walnuts: data.walnuts,
  };
  const counts: Record<string, () => Count> = {
    shipped: () => best(ps, (p) => count(data.shippable, (id) => has(p.shipped, id), (id) => id)),
    obelisks: () => count(data.obelisks, (b) => built.has(b), (b) => b),
    clock: () => (built.has(data.clock) ? { done: 1, missing: [] } : { done: 0, missing: [data.clock] }),
    slayer: () => firstDone(ps, (p) => slayerOf(p, data), total.slayer),
    friends: () =>
      best(ps, (p) => count(data.friends, (f) => (p.friends[f.key]?.points ?? 0) >= f.max * HEART, (f) => f.key)),
    level: () => best(ps, (p) => ({ done: Math.min(farmerLevel(p), total.level), missing: [] })),
    stardrops: () => firstDone(ps, (p) => stardropsOf(p, data), total.stardrops),
    cooking: () =>
      best(ps, (p) => {
        const known = new Set(p.cooking);
        return count(data.cooking, (r) => known.has(r.key) && has(p.cooked, r.out), (r) => r.key);
      }),
    crafting: () => best(ps, (p) => count(data.crafting, (r) => (p.crafting[r.key] ?? 0) > 0, (r) => r.key)),
    fish: () => best(ps, (p) => count(data.fish, (id) => has(p.fish, id), (id) => id)),
    walnuts: () => ({ done: Math.min(save.walnuts, data.walnuts), missing: [] }),
  };
  /** Las de sí o no: el juego da todo el peso o nada. */
  const allOrNothing = new Set(["clock", "slayer", "stardrops"]);

  const parts: Part[] = data.perfection.map(({ key, weight }) => {
    const c = counts[key]?.() ?? { done: 0, missing: [] };
    const t = total[key] ?? 0;
    const share = t > 0 ? c.done / t : 0;
    const pct = allOrNothing.has(key) ? (c.done >= t && t > 0 ? 100 : 0) : share * 100;
    return { key, weight, done: c.done, total: t, pct, missing: c.missing };
  });
  const sum = parts.reduce((a, p) => a + (p.weight * p.pct) / 100, 0);
  const weights = parts.reduce((a, p) => a + p.weight, 0);
  return { total: weights > 0 ? (sum / weights) * 100 : 0, parts };
}

// --- Paquetes -----------------------------------------------------------------------------------------------------

export type BundleItem = [id: string, qty: number, quality: number];

export interface BundleState {
  index: number;
  /** Nombre interno (en inglés), como en `Data/Bundles`. */
  name: string;
  done: boolean;
  /** Lo que falta entregar (todo lo no entregado; `left` dice cuántos de esos hacen falta). */
  missing: BundleItem[];
  /** Cuántos objetos más pide el paquete. */
  left: number;
  /** Id → cuántos hay en la granja, de lo que falta (sin mirar la calidad). */
  have: Record<string, number>;
}

export interface RoomState {
  room: string;
  bundles: BundleState[];
}

/**
 * Los paquetes como los tiene la partida. Con la ruta Joja el Centro no se completa ("joja"); con `ccIsComplete`, todo
 * hecho ("complete"). Si la partida no trae `<bundleData>` (antes de la 1.5), los paquetes salen de `fallback`
 * (`bundles.json`).
 */
export function bundleStatus(save: Save, fallback?: readonly Room[]): RoomState[] | "joja" | "complete" {
  if (save.joja) return "joja";
  if (save.ccComplete) return "complete";
  const defs = save.bundles.defs.length
    ? save.bundles.defs
    : (fallback ?? []).flatMap((r) =>
        r.bundles.map((b) => ({ room: r.room, index: b.index, name: b.name[0], items: b.items, need: b.need })),
      );
  const rooms: RoomState[] = [];
  for (const d of defs) {
    let room = rooms.find((r) => r.room === d.room);
    if (!room) rooms.push((room = { room: d.room, bundles: [] }));
    // El lugar `i` del arreglo es el objeto `i`; el paquete está hecho con todo en true (`isBundleComplete`).
    const got = save.bundles.done[d.index] ?? [];
    const missing = d.items.filter((_, i) => !got[i]).map(([id, q, k]) => [id, q, k] as BundleItem);
    const delivered = d.items.length - missing.length;
    const done = (got.length > 0 && got.every(Boolean)) || delivered >= d.need;
    const have: Record<string, number> = {};
    if (!done) for (const [id] of missing) if ((save.items[id] ?? 0) > 0) have[id] = save.items[id];
    room.bundles.push({
      index: d.index, name: d.name, done,
      missing: done ? [] : missing,
      left: done ? 0 : Math.max(0, d.need - delivered),
      have,
    });
  }
  for (const r of rooms) r.bundles.sort((a, b) => a.index - b.index);
  return rooms;
}

// --- Fechas -------------------------------------------------------------------------------------------------------

/** Días desde el 1 de primavera del año 1 (contando ese día como 1), como `stats.DaysPlayed` sin saltos. */
const daysPlayed = (year: number, season: number, day: number): number =>
  (Math.max(1, year) - 1) * YEAR_DAYS + season * SEASON_DAYS + day;

/** El día que viene `n` días después, cruzando estación y año. */
function addDays(save: Pick<Save, "season" | "day" | "year">, n: number): { season: Season; day: number; year: number } {
  const t = daysPlayed(save.year, save.season, save.day) - 1 + n;
  return {
    year: Math.floor(t / YEAR_DAYS) + 1,
    season: (Math.floor(t / SEASON_DAYS) % 4) as Season,
    day: (t % SEASON_DAYS) + 1,
  };
}

// --- Regalos de la semana -----------------------------------------------------------------------------------------

export interface WeekGift {
  key: string;
  birthday: [season: number, day: number];
  /** 0 hoy, 7 dentro de una semana. */
  inDays: number;
  hearts: number;
  giftsWeek: number;
  /** Lo que le encanta, primero lo que hay en la granja. */
  loved: { id: string; have: number }[];
}

/** Días que se miran hacia adelante: del día de hoy al mismo día de la semana que viene. */
const WEEK = 7;

/** Los aldeanos que cumplen años de hoy a 7 días, por cercanía, con lo que les encanta y cuántos tiene la granja. */
export function weekGifts(save: Save, player: Player, villagers: readonly Villager[]): WeekGift[] {
  const out: WeekGift[] = [];
  for (let n = 0; n <= WEEK; n++) {
    const d = addDays(save, n);
    for (const v of villagers) {
      if (v.birthday[0] !== d.season || v.birthday[1] !== d.day) continue;
      const f = player.friends[v.key];
      const loved = v.tastes.love.map((id) => ({ id, have: save.items[normId(id)] ?? 0 }));
      loved.sort((a, b) => Number(b.have > 0) - Number(a.have > 0));
      out.push({
        key: v.key,
        birthday: [v.birthday[0], v.birthday[1]],
        inDays: n,
        hearts: Math.floor((f?.points ?? 0) / HEART),
        giftsWeek: f?.giftsWeek ?? 0,
        loved,
      });
    }
  }
  return out;
}

// --- Lo que falta -------------------------------------------------------------------------------------------------

export interface MissingFish {
  id: string;
  /** Se pesca en la estación de la partida. */
  now: boolean;
  /** Se pesca ahora y no en la estación que viene: se va al terminar esta. */
  leaving: boolean;
}

/**
 * Los peces que no pescó, primero los de la estación. Sin los del encargo del Sr. Qi, que no son de la colección. Con
 * `collection` (`save.json`, la lista de la perfección) suma al final los que no están en `fish.json` (las medusas), sin
 * estación.
 */
export function missingFish(
  player: Player,
  fish: readonly Fish[],
  season: number,
  collection: readonly string[] = [],
): MissingFish[] {
  const out = fish
    .filter((f) => !f.qiOrder && !has(player.fish, f.id))
    .map((f) => {
      const now = f.seasons.includes(season);
      return { id: f.id, now, leaving: now && !f.seasons.includes((season + 1) % 4) };
    });
  const known = new Set(fish.map((f) => f.id));
  const extra = collection
    .filter((id) => !known.has(id) && !has(player.fish, id))
    .map((id) => ({ id, now: false, leaving: false }));
  return [...out.filter((f) => f.now), ...out.filter((f) => !f.now), ...extra];
}

export interface MissingRecipe {
  kind: "cook" | "craft";
  /** Clave de la receta en el juego. */
  key: string;
  out: string;
  /** Ya la conoce. */
  known: boolean;
  /** Se consigue ya: la conoce, o la enseña la Reina de la Salsa un domingo que queda de esta estación. */
  now: boolean;
  /** Semana del programa de cocina que la enseña, si es una de esas. */
  tvWeek?: number;
}

/** Semana del programa de cocina (1 a 32) de un domingo (`TV.getWeeklyRecipe`: ciclo de 224 días). */
const tvWeek = (dp: number): number => Math.floor((dp % (2 * YEAR_DAYS)) / WEEK) || 32;

/**
 * Las recetas que no hizo nunca (cocina: conocida y cocinada; fabricación: hecha una vez), como las cuenta la
 * perfección. Primero las que se consiguen ya; con `date`, también las que la TV enseña en lo que queda de la estación.
 * Las claves salen de `save.json` (las de `recipes.json` se cruzan por el objeto que sale).
 */
export function missingRecipes(
  player: Player,
  recipes: readonly Recipe[],
  data: SaveData,
  date?: Pick<Save, "season" | "day" | "year">,
): MissingRecipe[] {
  const keyOf = { cook: new Map(data.cooking.map((r) => [r.out, r.key])), craft: new Map(data.crafting.map((r) => [r.out, r.key])) };
  const weekOf = new Map(Object.entries(data.queenOfSauce).map(([w, k]) => [k, Number(w)]));
  const tvNow = new Set<string>();
  if (date) {
    for (let d = Math.ceil(date.day / WEEK) * WEEK; d <= SEASON_DAYS; d += WEEK) {
      const k = data.queenOfSauce[String(tvWeek(daysPlayed(date.year, date.season, d)))];
      if (k) tvNow.add(k);
    }
  }
  const known = new Set(player.cooking);
  const out: MissingRecipe[] = [];
  for (const r of recipes) {
    const key = keyOf[r.kind].get(r.out);
    if (!key) continue; // el Anillo de bodas: no cuenta
    if (r.kind === "cook") {
      const isKnown = known.has(key);
      if (isKnown && has(player.cooked, r.out)) continue;
      const w = weekOf.get(key);
      out.push({ kind: "cook", key, out: r.out, known: isKnown, now: isKnown || tvNow.has(key), ...(w ? { tvWeek: w } : {}) });
    } else {
      const n = player.crafting[key];
      if ((n ?? 0) > 0) continue;
      out.push({ kind: "craft", key, out: r.out, known: n !== undefined, now: n !== undefined });
    }
  }
  return [...out.filter((r) => r.now), ...out.filter((r) => !r.now)];
}

// --- Qué hacer hoy ------------------------------------------------------------------------------------------------

export type TipKind = "birthday" | "festival" | "plant" | "fish" | "bundle" | "tv" | "cart";

export interface Tip {
  kind: TipKind;
  /**
   * birthday: [aldeano, regalos que le encantan y tiene…]; festival: [id del festival]; plant: ids de las cosechas;
   * fish: ids de los peces; bundle: ids de los objetos; tv: [receta]; cart: vacío.
   */
  ids: string[];
  /** Festival: 0 hoy, 1 mañana. */
  when?: 0 | 1;
  /** Festival: su nombre en [inglés, español], de `calendar.json`. */
  name?: Pair;
}

export interface TodayData {
  save: SaveData;
  villagers: readonly Villager[];
  calendar: CalendarData;
  crops: CropsData;
  fish: readonly Fish[];
  /** `bundles.json`: los paquetes de las partidas viejas y las estaciones de los objetos. */
  bundles: readonly Room[];
}

/** Opciones de cultivo para "últimos días para plantar": sin abono ni profesiones, fuera del invernadero. */
const PLANT_OPTS: Omit<Opts, "season" | "day" | "level"> = {
  fert: "none", tiller: false, agriculturist: false, artisan: false, sell: "raw", seeds: "buy",
  greenhouse: false, paddyBonus: false,
};

/** Desde qué día de la estación se avisa de los peces que se van: la última semana. */
const LEAVING_FROM = 22;

const festivalsOn = (cal: CalendarData, season: number, day: number): Festival[] =>
  cal.seasons[season]?.days[String(day)]?.festivals ?? [];

/**
 * Los consejos del día, en este orden: cumpleaños de hoy, festival hoy o mañana, últimos días para plantar, peces que
 * se van con la estación (en la última semana), objetos de paquetes de la estación que faltan y no tiene, la Reina de
 * la Salsa (domingo) y el carro ambulante (viernes y domingo).
 */
export function today(save: Save, player: Player, data: TodayData): Tip[] {
  const tips: Tip[] = [];
  const { season, day } = save;

  // Cumpleaños de hoy, con lo que le encanta y hay en la granja.
  for (const g of weekGifts(save, player, data.villagers)) {
    if (g.inDays !== 0) continue;
    tips.push({ kind: "birthday", ids: [g.key, ...g.loved.filter((l) => l.have > 0).map((l) => l.id)] });
  }

  // Festival hoy o mañana (sin repetir uno de varios días).
  const seen = new Set<string>();
  const tomorrow = addDays(save, 1);
  for (const [when, s, d] of [[0, season, day], [1, tomorrow.season, tomorrow.day]] as const) {
    for (const f of festivalsOn(data.calendar, s, d)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      tips.push({ kind: "festival", ids: [f.id], when, name: [f.name[0], f.name[1]] });
    }
  }

  // Últimos días para plantar: llega a cosecharse si se planta hoy y ya no si se planta mañana. Sin las semillas
  // silvestres: su cosecha es una al azar de la estación.
  if (day < SEASON_DAYS) {
    const opts = { ...PLANT_OPTS, season, level: player.skills[0] };
    const plant = data.crops.crops
      .filter((c) => !c.wild && harvests(c, { ...opts, day }).length > 0 && harvests(c, { ...opts, day: day + 1 }).length === 0)
      .map((c) => c.harvest);
    if (plant.length) tips.push({ kind: "plant", ids: [...new Set(plant)] });
  }

  // Peces de la estación que le faltan y se van al terminar (sólo la última semana).
  if (day >= LEAVING_FROM) {
    const leaving = missingFish(player, data.fish, season).filter((f) => f.leaving).map((f) => f.id);
    if (leaving.length) tips.push({ kind: "fish", ids: leaving });
  }

  // Objetos de paquetes de esta estación que faltan y no hay en la granja.
  const status = bundleStatus(save, data.bundles);
  if (Array.isArray(status)) {
    const seasons: Record<string, number[]> = {};
    for (const r of data.bundles) for (const [id, s] of Object.entries(r.seasons)) seasons[id] ??= s;
    const ids = new Set<string>();
    for (const r of status) {
      for (const b of r.bundles) {
        for (const [id, qty] of b.missing) {
          const s = seasons[id];
          if (s && s.length < 4 && s.includes(season) && (save.items[id] ?? 0) < qty) ids.add(id);
        }
      }
    }
    if (ids.size) tips.push({ kind: "bundle", ids: [...ids] });
  }

  // La Reina de la Salsa: el domingo enseña la receta de la semana.
  const sunday = day % WEEK === 0;
  if (sunday) {
    const key = data.save.queenOfSauce[String(tvWeek(daysPlayed(save.year, season, day)))];
    if (key && !player.cooking.includes(key)) tips.push({ kind: "tv", ids: [key] });
  }

  // El carro ambulante: viernes y domingo (`Forest.ShouldTravelingMerchantVisitToday`).
  if (day % WEEK % 5 === 0) tips.push({ kind: "cart", ids: [] });

  return tips;
}
