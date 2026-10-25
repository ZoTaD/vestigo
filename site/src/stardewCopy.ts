/**
 * Los textos de la sección Stardew Valley (2026-10-22), en inglés y español. Fuera de un componente (prerender,
 * buscador de la barra) se usa `STARDEW_COPY[lang]`; adentro, `useStardewCopy()`.
 *
 * Acá van sólo los textos de la interfaz del sitio. Los nombres de las cosas del juego (objetos, aldeanos, festivales,
 * paquetes) salen de sus textos, en los datos. Las excepciones son las estaciones, las profesiones y los fertilizantes,
 * que la interfaz nombra sin dato al lado: van copiadas tal cual de los textos del juego, con la clave de donde salen.
 */
import { useLang } from "./i18n";
import type { StardewSection, StardewTab } from "./route";
import type { Fert } from "./stardew/crops/calc";
import type { SortKey } from "./stardew/crops/state";
import type { Kind } from "./stardew/fishing/state";
import type { View } from "./stardew/recipes/state";
import type { MinesView, WeaponSort, WeaponType } from "./stardew/mines/state";
import type { Group, SourceFilter } from "./stardew/data";
import type { CartKind } from "./stardew/predict/cart";
import type { NightEvent } from "./stardew/predict/night";
import type { DayWeather } from "./stardew/predict/weather";

/** El orden de las pestañas en la barra, como las del menú del juego. */
export const STARDEW_TABS: StardewSection[] = ["home", "items", "crops", "fishing", "mines", "recipes", "villagers", "calendar", "bundles", "save", "predict"];

export type Quality = "normal" | "silver" | "gold" | "iridium";
export const QUALITIES: Quality[] = ["normal", "silver", "gold", "iridium"];
/** Las profesiones que cambian el precio de venta. */
export type Profession = "tiller" | "agriculturist" | "artisan" | "rancher" | "fisher" | "angler" | "blacksmith" | "gemologist" | "tapper";
/** Los gustos de regalo, del que más suma al que más resta. */
export type Taste = "love" | "like" | "neutral" | "dislike" | "hate";
export const TASTES: Taste[] = ["love", "like", "neutral", "dislike", "hate"];

type Seo = { title: string; description: string };

/**
 * Qué tiene la ficha de un objeto, para que su `<head>` sólo prometa eso: los bits `has` de `list.json` (`HAS` en
 * `stardew/data.ts`; no se importa de ahí para no meter los datos en el chunk del prerender).
 */
const HAS_GIFT = 1, HAS_BUNDLE = 2, HAS_MACHINE = 4, HAS_RECIPE = 8, HAS_SOURCES = ~15;

/** Cortada a 160 caracteres en una palabra entera, como en Terraria. */
const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);
/** En español, un nombre de objeto en medio de la oración va en minúscula ("con una esquirla prismática"). */
const minus = (s: string): string => s.toLocaleLowerCase("es");
const join = (parts: string[], and: string): string => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}` : parts[0] ?? "");

/** Lo que se busca de un objeto, en el orden en que la ficha lo muestra. */
function itemTopics(has: number) {
  return {
    gift: (has & HAS_GIFT) > 0,
    bundle: (has & HAS_BUNDLE) > 0,
    uses: (has & (HAS_MACHINE | HAS_RECIPE)) > 0,
    machine: (has & HAS_MACHINE) > 0,
    recipe: (has & HAS_RECIPE) > 0,
    sources: (has & HAS_SOURCES) > 0,
  };
}

/** Los textos de la pestaña Objetos: la lista y la ficha. */
export interface ItemsCopy {
  h1: string;
  lede: (n: string) => string;
  /** La dirección traía un objeto que no existe: se muestra la lista con este aviso. */
  missing: string;
  back: string;
  search: string;
  searchPlaceholder: string;
  category: string;
  all: string;
  groups: Record<Group, string>;
  from: string;
  anySource: string;
  sources: Record<SourceFilter, string>;
  count: (n: string) => string;
  none: string;
  // La ficha.
  sellPrice: string;
  profession: string;
  noProfession: string;
  energy: string;
  health: string;
  /** Los títulos de los gustos de regalo: "Le encanta a" y la fila de retratos. */
  tasteHeads: Record<Exclude<Taste, "neutral">, string>;
  bundlesTitle: string;
  /** Lo que pide un paquete: "5 de calidad Oro". */
  bundleNeed: (qty: number, quality: string | null) => string;
  turnsInto: string;
  madeIn: string;
  /** Cuántos entran por vez en la máquina, si es más de uno. */
  perBatch: (n: number) => string;
  /** Cuánto tarda: minutos, horas o días, con "≈" si está redondeado. */
  time: (t: { unit: "m" | "h" | "d"; n: number; approx: boolean }) => string;
  usedIn: string;
  madeWith: string;
  kinds: Record<"cook" | "craft", string>;
  /** Cuántos salen de una receta, si es más de uno. */
  yields: (n: number) => string;
  whereTitle: string;
  src: {
    crop: string;
    tree: string;
    shop: string;
    fish: string;
    forage: string;
    monster: string;
    grow: (days: number) => string;
    regrow: (days: number) => string;
    mature: (days: number) => string;
    allYear: string;
  };
}

/** Los textos de la pestaña Aldeanos: la lista y la ficha. */
export interface VillagersCopy {
  h1: string;
  lede: (n: string) => string;
  /** La dirección traía un aldeano que no existe: se muestra la lista con este aviso. */
  missing: string;
  back: string;
  count: (n: string) => string;
  /** Los filtros: cortejables y estación del cumpleaños. */
  filterBirthday: string;
  filterRomance: string;
  allSeasons: string;
  /** "Otoño 13". */
  birthday: (season: string, day: number) => string;
  birthdayLabel: string;
  romanceable: string;
  region: string;
  /**
   * Dónde vive, por la `HomeRegion` del juego. `Other` (el Mago, Krobus, el Enano, Leo) no tiene un lugar que nombrar
   * y no se muestra. `Town` y `Desert` son los nombres del mapa del juego (`Utility.cs.5786` y `5861`).
   */
  regions: Record<string, string>;
  easyTitle: string;
  easyHint: string;
  /** Los títulos de las filas de gustos. */
  tasteHeads: Record<Exclude<Taste, "neutral">, string>;
  /** Cuántos objetos hay en una fila de gustos. */
  tasteCount: (n: string) => string;
}

/** Los textos de la pestaña Centro Comunitario: las salas, los paquetes y la lista para tildar. */
export interface BundlesCopy {
  h1: string;
  lede: (n: string) => string;
  /** Aviso de que la lista queda en este navegador. */
  saved: string;
  /** "3 de 6 paquetes". */
  progress: (done: string, total: string) => string;
  /** "Pide 4 de 6" (o "Pide los 4" si piden todos). */
  needs: (need: number, total: number) => string;
  /** "2 / 4": lo tildado y lo que pide. */
  have: (have: number, need: number) => string;
  complete: string;
  reward: string;
  onlyMissing: string;
  season: string;
  allSeasons: string;
  /** Nada que mostrar con los filtros puestos. */
  empty: string;
  /** El nombre accesible de un casillero tildable: "Tomate × 1, calidad Oro". */
  tick: (name: string, qty: number, quality: string | null) => string;
  /** El nombre de la cifra en oro de un paquete de la Bóveda. */
  gold: string;
}

/** Los textos de la pestaña Cultivos: la calculadora, la tabla y los frutales. */
export interface CropsCopy {
  h1: string;
  lede: string;
  season: string;
  day: string;
  level: string;
  fert: string;
  /** Los nombres de los fertilizantes: `DisplayName` de `Data/Objects` (368, 369, 919, 465, 466, 918). */
  ferts: Record<Fert, string>;
  professions: string;
  sell: string;
  sellBest: string;
  sellRaw: string;
  seeds: string;
  seedsBuy: string;
  seedsOwn: string;
  greenhouse: string;
  /** Qué cuenta la tabla, con el invernadero o sin él. */
  hint: (greenhouse: boolean) => string;
  /** Los títulos de las columnas. */
  cols: Record<SortKey, string>;
  sortBy: string;
  /** El que rebrota: "y cada 3". */
  regrow: (n: number) => string;
  /** No da ni una cosecha antes de que termine la estación. */
  late: string;
  raw: string;
  /** Con semillas compradas, los cultivos cuya semilla no se vende en ninguna tienda van aparte. */
  noShop: { h2: string; hint: string };
  /** Las semillas silvestres, que dan una recolección al azar: fuera del ranking. */
  wild: { h2: string; hint: string };
  /** Notas al pie: la Fresa (bajo la tabla de cultivos) y los frutales de la isla (bajo la de frutales). */
  notes: { strawberry: string; island: string };
  count: (n: string) => string;
  none: string;
  trees: {
    h2: string;
    hint: string;
    cols: { tree: string; season: string; days: string; sapling: string; perSeason: string; sell: string; payback: string };
    days: (n: number) => string;
    payback: (n: number) => string;
    noSapling: string;
  };
}

/** Los textos de la pestaña Pesca: "¿qué puedo pescar ahora?" y la tabla de todos los peces. */
export interface FishingCopy {
  h1: string;
  lede: string;
  now: { h2: string; place: string; anyPlace: string; island: string; water: string; traps: string; season: string; weather: string; time: string; anyTime: string };
  /** Sol y lluvia, como botones; "both" es lo que dice la tabla del pez que sale con cualquiera. */
  weathers: { sunny: string; rainy: string; both: string };
  count: (n: string) => string;
  none: string;
  /** Lo que pide el pez: dificultad (0 a 100) y nivel mínimo. */
  difficulty: (n: number) => string;
  level: (n: number) => string;
  anyHour: string;
  allYear: string;
  /** La marca de las estaciones de un pez que también vive en la isla, y la de uno que vive sólo ahí. */
  islandAllYear: string;
  onlyIsland: string;
  /** Las etiquetas de texto: legendario y trampa para cangrejos. */
  tags: { legendary: string; crabPot: string; qi: string };
  all: {
    h2: string;
    hint: string;
    kind: string;
    kinds: Record<Kind, string>;
    season: string;
    anySeason: string;
    cols: { fish: string; place: string; seasons: string; weather: string; hours: string; difficulty: string; price: string };
    count: (n: string) => string;
  };
}

/** Los textos de la pestaña Recetas y máquinas: las tres vistas, el buscador, cómo se aprende y las tablas de las máquinas. */
export interface RecipesCopy {
  h1: string;
  lede: string;
  view: string;
  views: Record<View, string>;
  search: string;
  searchPlaceholder: string;
  count: (n: string) => string;
  machinesCount: (n: string) => string;
  none: string;
  /** Cómo se aprende, con los nombres del juego (habilidad, aldeano, programa de TV) al lado. */
  unlock: {
    label: string;
    default: string;
    skill: (skill: string, level: number) => string;
    friend: (npc: string, hearts: number) => string;
    tv: (show: string) => string;
    other: string;
  };
  /** Cuántos salen de una receta, en el casillero ("× 10"). */
  makes: (n: number) => string;
  machine: {
    made: string;
    notMade: string;
    cols: { input: string; output: string; price: string; time: string };
    /** La colmena no recibe nada: hace miel con la flor que tenga cerca. */
    nearby: string;
    instant: string;
    more: (n: string) => string;
    less: string;
  };
}

/** Los textos de la pestaña Calendario: el tablón, los días de la semana y el detalle de un día. */
export interface CalendarCopy {
  h1: string;
  lede: string;
  season: string;
  /** Los días de la semana, de lunes a domingo: el día 1 de cada estación es lunes. */
  weekdays: [string, string, string, string, string, string, string];
  hint: string;
  /** "13 de otoño". */
  dayTitle: (day: number, season: string) => string;
  /** "15–17 de invierno", o el día solo. */
  range: (range: string, season: string) => string;
  birthday: (name: string) => string;
  profile: string;
  festival: string;
  passive: string;
  /** Qué pasa ese día: el festival ocupa el día, o se va y se viene. */
  festivalNote: string;
  passiveNote: string;
  empty: string;
  close: string;
}

/** Los textos de la pestaña Minas y combate: las cinco vistas y la ficha de un monstruo. */
export interface MinesCopy {
  h1: string;
  lede: string;
  view: string;
  views: Record<MinesView, string>;
  /** "El ascensor para cada 5 pisos, hasta el 120." */
  elevator: (every: number, last: number) => string;
  /** Los pisos de una zona o de un lugar; `to` null es sin fondo. */
  floors: (from: number, to: number | null) => string;
  noFloors: string;
  monsters: string;
  ores: string;
  chests: string;
  chestFloor: (n: number) => string;
  remixed: string;
  usualMonsters: string;
  stats: { hp: string; dmg: string; def: string; speed: string; xp: string };
  loot: string;
  noLoot: string;
  monstersCount: (n: string) => string;
  dangerousTag: string;
  /** Cuántos pueden caer de un objeto que el monstruo tira más de una vez. */
  upTo: (n: number) => string;
  weapons: {
    sortBy: string;
    sorts: Record<WeaponSort, string>;
    type: string;
    types: Record<WeaponType, string>;
    count: (n: string) => string;
    cols: { weapon: string; damage: string; speed: string; crit: string; where: string };
    /** Sale en los cofres y barriles de las Minas cerca de este piso (y desde cuál). */
    nearFloor: (base: number, min: number | null) => string;
    /** Cuándo la vende el Gremio: desde el principio o después de un piso. */
    shop: (floor: number | null) => string;
    galaxy: string;
    chest: (n: number) => string;
    /** Las otras fuentes de un arma (`WeaponSource`), con los nombres del juego ya en el idioma. */
    source: {
      special: (from: number, to: number | null) => string;
      specialDangerous: string;
      remixed: (n: number) => string;
      volcano: (rare: boolean) => string;
      forge: (weapon: string, item: string, n: number) => string;
      desert: (place: string, item: string) => string;
      /** La calavera embrujada: la mina de la cantera y la invasión de estatuas de Calico del festival. */
      hauntedSkull: (festival: string) => string;
      fishing: string;
      slayer: (goal: string) => string;
      festival: (festival: string, npc: string, price: number, currency: string) => string;
      start: string;
      quarry: string;
      mastery: (name: string) => string;
    };
    other: string;
    ammo: string;
    critMult: (n: string) => string;
  };
  gear: { rings: string; ringsHint: string; trinkets: string; trinketsHint: string; drops: string; noDrops: string };
  boots: { cols: { boots: string; defense: string; immunity: string; where: string } };
  monster: {
    missing: string;
    statsTitle: string;
    lootTitle: string;
    lootHint: string;
    whereTitle: string;
    dangerous: string;
    slayerTitle: string;
    /** "Matá 1.000 entre:", y después los monstruos que cuentan. */
    slayerGoal: (n: string) => string;
    reward: string;
    phone: string;
  };
}

/** Los textos del Lector de partida: la caja para elegir el archivo y las cajas de la partida leída. */
export interface SaveCopy {
  h1: string;
  lede: string;
  drop: string;
  pick: string;
  reading: string;
  whereTitle: string;
  /** Dónde está el archivo en cada sistema: el rótulo y la carpeta. */
  where: { os: string; path: string }[];
  fileHint: string;
  private: string;
  errors: Record<"not-xml" | "save-info" | "not-save" | "read" | "broken", string>;
  old: (version: string) => string;
  farm: (name: string) => string;
  date: (day: number, season: string, year: number) => string;
  farmer: string;
  host: string;
  other: string;
  forget: string;
  /** El enlace al Predictor con la misma partida. */
  toPredict: string;
  today: {
    title: string;
    empty: string;
    birthday: (name: string) => string;
    lovedHave: string;
    festival: (name: string, when: 0 | 1) => string;
    plant: string;
    fish: string;
    bundle: string;
    tv: (show: string, recipe: string) => string;
    cart: string;
  };
  perfection: {
    title: string;
    hint: string;
    points: (got: string, weight: string) => string;
    level: (level: number) => string;
    walnuts: string;
    allDone: string;
    hearts: (have: number, need: number) => string;
    /** Con más de un granjero: de quién sale lo que se muestra de la parte. */
    from: (name: string) => string;
  };
  gifts: {
    title: string;
    empty: string;
    today: string;
    inDays: (n: number) => string;
    on: (day: number, season: string) => string;
    hearts: (n: number) => string;
    giftsWeek: (n: number) => string;
    have: (n: string) => string;
  };
  cc: {
    title: string;
    joja: string;
    complete: string;
    roomDone: string;
    left: (n: number) => string;
    inFarm: (n: string) => string;
    sync: string;
    synced: (n: number) => string;
    gold: string;
  };
  missing: {
    title: string;
    fish: string;
    now: string;
    later: string;
    leaving: string;
    cook: string;
    craft: string;
    tv: string;
    count: (n: string) => string;
    none: string;
  };
}

/** Los textos del Predictor (tarea 7): la entrada (partida o semilla) y una caja por predicción. */
export interface PredictCopy {
  h1: string;
  lede: string;
  /** Lo que predice, en la pantalla sin entrada (es lo que indexa Google). */
  what: string[];
  fromSave: string;
  otherSeed: string;
  useSave: string;
  oldSave: string;
  openReader: string;
  formTitle: string;
  seed: string;
  seedWhere: string;
  seedErrors: Record<"empty" | "bad", string>;
  todayIs: string;
  season: string;
  day: string;
  year: string;
  /** `AGO_LegacyRandomization` de `Strings/UI`. */
  legacy: string;
  legacyHint: string;
  go: string;
  manualLimits: string;
  inYourSave: string;
  today: {
    title: string;
    tomorrow: string;
    luck: string;
    luckTv: string;
    luckTwo: string;
    luckNone: string;
    luckTomorrow: string;
    season: string;
    seasonEnds: string;
    weekdays: [string, string, string, string, string, string, string];
    todayCell: string;
    weather: Record<DayWeather["kind"], string>;
    or: (a: string, b: string) => string;
    note: string;
  };
  geodes: {
    title: string;
    kind: string;
    noSave: string;
    noId: string;
    note: string;
    oneOf: string;
  };
  mines: {
    title: string;
    garlic: string;
    garlicNote: string;
    kinds: Record<"infested" | "slime" | "quarry" | "mushroom", string>;
    none: string;
    skull: string;
    lowest: (n: number) => string;
    quarryOff: string;
    lowest120: string;
    quarryOn: string;
    dangerous: string;
  };
  cart: {
    title: string;
    where: Record<CartKind, string>;
    desertMaybe: string;
    stock: (n: number) => string;
    unlimited: string;
    recipe: string;
    ring: string;
    ringManual: string;
    y1: string;
    manual: string;
  };
  nights: {
    title: string;
    none: string;
    night: (date: string) => string;
    events: Record<NightEvent, string>;
    rose: string;
    roseOpts: Record<"yes" | "no" | "unknown", string>;
    roseNote: string;
    ifRose: string;
    otherwise: string;
    nothing: string;
    rest: string;
    outside: string;
    happened: Record<"sawQiPlane" | "gotCapsule" | "ccPantry" | "raccoonTreeFallen", string>;
    manual: string;
  };
}

export interface StardewCopy {
  tabs: Record<StardewSection, string>;
  /** El `<head>` de la portada y de cada pestaña: lo que se busca primero. */
  seo: Record<StardewSection, Seo>;
  /** El de una ficha de objeto; `has` son los bits de `list.json` y la ficha sólo promete lo que tiene. */
  itemSeo: (name: string, has?: number) => Seo;
  /** El de una ficha de aldeano. */
  villagerSeo: (name: string) => Seo;
  /** El de una ficha de monstruo. */
  monsterSeo: (name: string) => Seo;
  /** La insignia de una pestaña que todavía no tiene página. */
  soon: string;
  loading: string;
  loadError: string;
  retry: string;
  /** La marca de oro del juego, pegada a la cifra ("250g"). */
  gold: string;
  home: {
    kicker: string;
    h1: string;
    lede: (items: string, villagers: string, bundles: string) => string;
    /** Qué hay en cada pestaña: la tarjeta de la portada. */
    cards: Record<StardewTab, string>;
    featured: string;
    featuredHint: string;
    season: string;
    seasonPick: string;
    birthdays: string;
    festivals: string;
    day: (n: number) => string;
    about: (version: string) => string;
  };
  items: ItemsCopy;
  villagers: VillagersCopy;
  bundles: BundlesCopy;
  crops: CropsCopy;
  fishing: FishingCopy;
  recipes: RecipesCopy;
  calendar: CalendarCopy;
  mines: MinesCopy;
  save: SaveCopy;
  predict: PredictCopy;
  qualities: Record<Quality, string>;
  professions: Record<Profession, string>;
  tastes: Record<Taste, string>;
  /** Primavera, verano, otoño, invierno: `Utility.cs.5680` a `5683` de `Strings/StringsFromCSFiles`. */
  seasons: [string, string, string, string];
}

/** El Predictor en inglés. Los nombres del juego (objetos, estaciones) salen de los datos; acá, la interfaz. */
const PREDICT_EN: PredictCopy = {
  h1: "Stardew Valley predictor",
  lede: "What your next geodes will give, tomorrow's weather and today's luck, which Mines floors are infested this week, what the traveling cart sells and which nights bring an event.",
  what: [
    "The next 20 geodes, frozen and magma geodes, omni geodes, artifact troves, golden coconuts and mystery boxes",
    "Tomorrow's weather, today's luck and the rain for the rest of the season",
    "Monster, slime, quarry and mushroom floors of the Mines for the next 7 days",
    "The traveling cart's next 4 visits: what it sells, the price and how many",
    "The nights with the crop fairy, the witch, a meteorite and more, for the next two weeks",
  ],
  fromSave: "From your save",
  otherSeed: "Type a seed instead",
  useSave: "Use my save",
  oldSave: "Your save was read by an earlier version of the Save reader. Open it there again to see your geodes, your luck and everything that depends on your farm.",
  openReader: "Open your save in the Save reader",
  formTitle: "Predict from a seed",
  seed: "Seed",
  seedWhere: "It's the number in your save folder's name: for Farm_123456789 it's 123456789.",
  seedErrors: { empty: "Type your seed.", bad: "The seed is a number of up to 10 digits." },
  todayIs: "Today in your game",
  season: "Season",
  day: "Day",
  year: "Year",
  legacy: "Use Legacy Randomization",
  legacyHint: "Only if you turned it on in the advanced options when you made the farm.",
  go: "Predict",
  manualLimits: "With only the seed there are no geodes or luck (they need your farmer), and the Mines, the cart and the nights use what you pick below. With your save you get everything that can be known.",
  inYourSave: "In your save",
  today: {
    title: "Today and tomorrow",
    tomorrow: "Tomorrow",
    luck: "Today's luck",
    luckTv: "The fortune teller on TV says:",
    luckTwo: "She says one of these two.",
    luckNone: "Today's luck is in your save: open it in the Save reader to see it. Tomorrow's can't be predicted: it depends on everything you do today.",
    luckTomorrow: "Tomorrow's luck can't be predicted: it depends on everything you do today.",
    season: "The rest of the season",
    seasonEnds: "Tomorrow a new season starts.",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    todayCell: "Today",
    weather: { sun: "Sun", rain: "Rain", storm: "Storm", snow: "Snow", greenRain: "Green rain", festival: "Festival", wind: "Wind", wedding: "Wedding" },
    or: (a, b) => `${a} or ${b.toLowerCase()}`,
    note: "Whether it rains is exact. Storm or plain rain, and wind or sun, are decided that same morning by chance that depends on your steps: those days show both. A Rain Totem used today changes tomorrow.",
  },
  geodes: {
    title: "Geodes",
    kind: "What you open",
    noSave: "Geodes depend on your farmer, and that's in your save: open it in the Save reader to see them.",
    noId: "This save is from before version 1.3 and doesn't have your farmer's id: the game makes up a new one when it loads it. Play a day in 1.6 so it saves, and open it again in the Save reader.",
    note: "At Clint's anvil, not in the Geode Crusher. The list assumes you only open this kind: any other geode or box you open in between shifts it.",
    oneOf: "One of these (the game picks at random):",
  },
  mines: {
    title: "Mines",
    garlic: "I drank Garlic Oil today",
    garlicNote: "Garlic Oil turns off monster and slime floors for the day you drink it, and that changes which floors are quarry floors. The other days are shown without it.",
    kinds: { infested: "Monster floors", slime: "Slime floors", quarry: "Quarry floors", mushroom: "Mushroom floors" },
    none: "Nothing special.",
    skull: "The Skull Cavern can't be predicted: the game builds each floor with chance that doesn't come from your save.",
    lowest: (n) => `Your deepest floor is ${n}. If you go deeper today the list can change, and mushroom floors only show up once you've reached floor 120.`,
    quarryOff: "No quarry floors yet: they show up once the Crafts Room is restored and you've been in the Quarry Mine.",
    lowest120: "I've reached floor 120",
    quarryOn: "The Quarry Mine is open",
    dangerous: "Not for the Dangerous Mines of Mr. Qi's special order.",
  },
  cart: {
    title: "Traveling cart",
    where: { cart: "Cindersap Forest, until 8pm", nightMarket: "Night Market, on the beach, from 5pm", desertFestival: "Desert Festival, from 10am" },
    desertMaybe: "Only if the bus to the desert is fixed.",
    stock: (n) => `${n} in stock`,
    unlimited: "No limit",
    recipe: "Recipe",
    ring: "Only while another farmer is online.",
    ringManual: "In multiplayer it also sells the Wedding Ring recipe while another farmer is online.",
    y1: "In year 1, on the day the cart brings the guaranteed Red Cabbage Seeds, the rest of the list changes: open your save to see it exact.",
    manual: "Without your save it leaves out the portraits (14 hearts) and the Joja and Junimo catalogues.",
  },
  nights: {
    title: "Nights",
    none: "No night with an event in the next two weeks.",
    night: (date) => `The night before ${date}`,
    events: {
      fairy: "Crop fairy",
      witch: "Witch",
      meteorite: "Meteorite",
      owl: "Stone owl",
      capsule: "Strange capsule",
      earthquake: "Earthquake",
      raccoon: "The raccoons' tree falls",
      qiPlane: "Mr. Qi's plane",
    },
    rose: "Fairy rose on the farm",
    roseOpts: { yes: "Yes", no: "No", unknown: "Don't know" },
    roseNote: "A ripe Fairy Rose on the farm makes the crop fairy more likely.",
    ifRose: "With ripe fairy roses every night:",
    otherwise: "With none:",
    nothing: "nothing",
    rest: "The other nights in the next two weeks bring nothing.",
    outside: "Left out: changes from mail that arrives tomorrow (Community Center or Joja rooms, the movie theater, Willy's boat), JojaMart collapsing on a rainy night and a Rain Totem used today.",
    happened: { sawQiPlane: "I saw Mr. Qi's plane", gotCapsule: "The capsule already landed", ccPantry: "The Pantry is restored", raccoonTreeFallen: "The raccoons' tree fell" },
    manual: "Without your save it uses what you tick above; with nothing ticked, it assumes you haven't seen Mr. Qi's plane, the capsule hasn't landed, the Pantry isn't restored and the raccoons' tree is still standing. It also assumes nobody has the billboard prize ticket and there's no wedding these nights.",
  },
};

/** El Predictor en español. */
const PREDICT_ES: PredictCopy = {
  h1: "Predictor de Stardew Valley",
  lede: "Qué te van a dar las próximas geodas, el clima de mañana y la suerte de hoy, qué pisos de las Minas están infestados esta semana, qué vende el carro ambulante y qué noches traen un evento.",
  what: [
    "Las próximas 20 geodas, geodas heladas, de magma y omni, cofres de artefactos, cocos dorados y cajas misteriosas",
    "El clima de mañana, la suerte de hoy y la lluvia del resto de la estación",
    "Los pisos de monstruos, de babas, de cantera y de hongos de las Minas en los próximos 7 días",
    "Las próximas 4 visitas del carro ambulante: qué vende, a qué precio y cuántos",
    "Las noches con el hada de las cosechas, la bruja, un meteorito y más, en las próximas dos semanas",
  ],
  fromSave: "De tu partida",
  otherSeed: "Escribir una semilla",
  useSave: "Usar mi partida",
  oldSave: "Tu partida la leyó una versión anterior del Lector. Volvé a abrirla ahí para ver las geodas, la suerte y todo lo que depende de tu granja.",
  openReader: "Abrí tu partida en el Lector",
  formTitle: "Predecir con una semilla",
  seed: "Semilla",
  seedWhere: "Es el número del nombre de la carpeta de tu partida: en Granja_123456789 es 123456789.",
  seedErrors: { empty: "Escribí tu semilla.", bad: "La semilla es un número de hasta 10 cifras." },
  todayIs: "Hoy en tu partida",
  season: "Estación",
  day: "Día",
  year: "Año",
  legacy: "Usar aleatorización antigua",
  legacyHint: "Sólo si la prendiste en las opciones avanzadas al crear la granja.",
  go: "Predecir",
  manualLimits: "Con la semilla sola no hay geodas ni suerte (hacen falta los datos de tu granjero), y las Minas, el carro y las noches usan lo que elijas abajo. Con tu partida sale todo lo que se puede saber.",
  inYourSave: "En tu partida",
  today: {
    title: "Hoy y mañana",
    tomorrow: "Mañana",
    luck: "La suerte de hoy",
    luckTv: "La adivina de la tele dice:",
    luckTwo: "Dice una de estas dos.",
    luckNone: "La suerte de hoy está en tu partida: abrila en el Lector para verla. La de mañana no se puede predecir: depende de todo lo que hagas hoy.",
    luckTomorrow: "La suerte de mañana no se puede predecir: depende de todo lo que hagas hoy.",
    season: "Lo que queda de la estación",
    seasonEnds: "Mañana empieza otra estación.",
    weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    todayCell: "Hoy",
    weather: { sun: "Sol", rain: "Lluvia", storm: "Tormenta", snow: "Nieve", greenRain: "Lluvia verde", festival: "Festival", wind: "Viento", wedding: "Boda" },
    or: (a, b) => `${a} o ${b.toLowerCase()}`,
    note: "Si llueve o no es exacto. Tormenta o lluvia, y viento o sol, se deciden esa misma mañana con un azar que depende de tus pasos: esos días muestran las dos. Un tótem de lluvia usado hoy cambia el clima de mañana.",
  },
  geodes: {
    title: "Geodas",
    kind: "Qué abrís",
    noSave: "Las geodas dependen de tu granjero, y eso está en tu partida: abrila en el Lector para verlas.",
    noId: "Esta partida es anterior a la versión 1.3 y no trae el id de tu granjero: el juego le inventa uno nuevo al cargarla. Jugá un día en la 1.6 para que se guarde y volvé a abrirla en el Lector.",
    note: "En el yunque de Clint, no en la trituradora de geodas. La lista supone que abrís sólo este tipo: cualquier otra geoda o caja que abras en el medio la corre.",
    oneOf: "Una de estas (el juego elige al azar):",
  },
  mines: {
    title: "Minas",
    garlic: "Tomé Aceite de ajo hoy",
    garlicNote: "El Aceite de ajo apaga los pisos de monstruos y de babas el día que lo tomás, y con eso cambia qué pisos salen de cantera. Los otros días se muestran sin él.",
    kinds: { infested: "Pisos de monstruos", slime: "Pisos de babas", quarry: "Pisos de cantera", mushroom: "Pisos de hongos" },
    none: "Nada especial.",
    skull: "La Caverna Calavera no se puede predecir: el juego arma cada piso con un azar que no sale de tu partida.",
    lowest: (n) => `Tu piso más hondo es el ${n}. Si hoy bajás más, la lista puede cambiar, y los pisos de hongos aparecen recién cuando llegaste al 120.`,
    quarryOff: "Todavía sin pisos de cantera: aparecen con la Sala de artesanía restaurada y después de entrar a la mina de la cantera.",
    lowest120: "Llegué al piso 120",
    quarryOn: "La mina de la cantera está abierta",
    dangerous: "No vale para las Minas peligrosas del encargo especial de Qi.",
  },
  cart: {
    title: "Carro ambulante",
    where: { cart: "Bosque Cindersap, hasta las 20:00", nightMarket: "Mercado nocturno, en la playa, desde las 17:00", desertFestival: "Festival del desierto, desde las 10:00" },
    desertMaybe: "Sólo si ya arreglaste el autobús al desierto.",
    stock: (n) => `Hay ${n}`,
    unlimited: "Sin límite",
    recipe: "Receta",
    ring: "Sólo mientras haya otro granjero conectado.",
    ringManual: "En multijugador también vende la receta del anillo de bodas mientras haya otro granjero conectado.",
    y1: "En el año 1, el día que el carro trae las Semillas de lombarda garantizadas, el resto de la lista cambia: abrí tu partida para verla exacta.",
    manual: "Sin tu partida quedan afuera los retratos (14 corazones) y los catálogos de Joja y de los Junimos.",
  },
  nights: {
    title: "Noches",
    none: "Ninguna noche con evento en las próximas dos semanas.",
    night: (date) => `La noche antes del ${date}`,
    events: {
      fairy: "Hada de las cosechas",
      witch: "Bruja",
      meteorite: "Meteorito",
      owl: "Búho de piedra",
      capsule: "Cápsula extraña",
      earthquake: "Terremoto",
      raccoon: "Cae el árbol de los mapaches",
      qiPlane: "El avión del Sr. Qi",
    },
    rose: "Rosa de hadas en la granja",
    roseOpts: { yes: "Sí", no: "No", unknown: "No sé" },
    roseNote: "Una rosa de hadas madura en la granja hace más probable al hada de las cosechas.",
    ifRose: "Con rosas de hadas maduras todas las noches:",
    otherwise: "Sin ninguna:",
    nothing: "nada",
    rest: "Las otras noches de las próximas dos semanas no traen nada.",
    outside: "Queda afuera: lo que cambia el correo que llega mañana (salas del Centro Comunitario o de Joja, el cine, el barco de Willy), el derrumbe de JojaMart en una noche de lluvia y un tótem de lluvia usado hoy.",
    happened: { sawQiPlane: "Vi el avión del Sr. Qi", gotCapsule: "Ya cayó la cápsula", ccPantry: "La Despensa está restaurada", raccoonTreeFallen: "Ya cayó el árbol de los mapaches" },
    manual: "Sin tu partida usa lo que marques arriba; sin nada marcado, supone que no viste el avión del Sr. Qi, que no cayó la cápsula, que la Despensa no está restaurada y que el árbol de los mapaches sigue en pie. También supone que nadie tiene el boleto del premio del cartel y que no hay bodas estas noches.",
  },
};

const EN: StardewCopy = {
  tabs: { home: "Home", items: "Items", villagers: "Villagers", bundles: "Community Center", crops: "Crops", fishing: "Fishing", recipes: "Recipes", calendar: "Calendar", mines: "Mines & combat", save: "Save reader", predict: "Predictor" },
  seo: {
    home: {
      title: "Stardew Valley Guide: Crop Calculator, Fish, Gifts and Bundles | Vestigo",
      description: "Stardew Valley 1.6: crop profit calculator, what fish to catch now, recipes, birthdays and festivals, item prices, villager gifts and a bundle checklist.",
    },
    items: {
      title: "Stardew Valley Items List: Prices, Gifts and Uses | Vestigo",
      description: "Every Stardew Valley 1.6 item by category: sell price by quality, who loves it as a gift, which bundle takes it, what machines make of it and where to get it.",
    },
    villagers: {
      title: "Stardew Valley Villagers: Gift Guide and Birthdays | Vestigo",
      description: "Every Stardew Valley 1.6 villager with their birthday and the full list of gifts they love, like, dislike and hate. Filter by marriage candidates or season.",
    },
    bundles: {
      title: "Stardew Valley Community Center Bundles Checklist | Vestigo",
      description: "Every Stardew Valley Community Center bundle, room by room: what goes in each one, the reward, and what you can still get this season. Tick them off as you go.",
    },
    crops: {
      title: "Stardew Valley Crop Profit Calculator: Best Crops by Season | Vestigo",
      description: "Which Stardew Valley 1.6 crop makes the most gold per day this season: pick the planting day, farming level, fertilizer and professions. Fruit trees too.",
    },
    fishing: {
      title: "Stardew Valley Fish Guide: What Fish Can I Catch Now? | Vestigo",
      description: "What fish you can catch in Stardew Valley 1.6 right now: pick the place, season, weather and time. Every fish with its location, hours, difficulty and price.",
    },
    recipes: {
      title: "Stardew Valley Recipes: Cooking, Crafting and Machines | Vestigo",
      description: "Every Stardew Valley 1.6 cooking and crafting recipe with its ingredients and how to learn it, and what each machine makes, how long it takes and its price.",
    },
    calendar: {
      title: "Stardew Valley Calendar: Birthdays and Festivals | Vestigo",
      description: "The Stardew Valley 1.6 calendar by season: every villager birthday with the gifts they love, and every festival, from the Night Market to SquidFest.",
    },
    mines: {
      title: "Stardew Valley Mines Guide: Monsters, Weapons and Floors | Vestigo",
      description: "Stardew Valley 1.6 Mines and Skull Cavern floor by floor: monsters with their drops, every weapon sortable by damage, boots, rings and the chest rewards.",
    },
    save: {
      title: "Stardew Valley Save File Reader: Perfection Tracker | Vestigo",
      description: "Open your Stardew Valley 1.6 save to see your perfection, what the Community Center still needs, this week's birthdays and the fish and recipes you're missing.",
    },
    predict: {
      title: "Stardew Valley Predictor (1.6): Geodes, Weather, Mines & Traveling Cart | Vestigo",
      description: "What your next Stardew Valley 1.6 geodes and mystery boxes give, tomorrow's weather and luck, infested Mines floors, the traveling cart and night events.",
    },
  },
  itemSeo: (name, has = 0) => {
    const t = itemTopics(has);
    const topics = ["price", ...(t.gift ? ["gifts"] : []), ...(t.bundle ? ["bundles"] : []), ...(t.uses ? ["uses"] : [])];
    const head = topics.length > 1 ? join(topics, "and") : t.sources ? "price and where to get it" : "sell price";
    const parts = [
      ...(t.gift ? ["which villagers love or hate it"] : []),
      ...(t.bundle ? ["the bundles that need it"] : []),
      ...(t.machine ? ["what machines turn it into"] : []),
      ...(t.recipe ? ["the recipes that make or use it"] : []),
      ...(t.sources ? ["where to get it"] : []),
    ];
    return {
      title: `${name} — Stardew Valley ${head} | Vestigo`,
      description: clip(`${name} in Stardew Valley 1.6: its sell price by quality${parts.length ? `, ${join(parts, "and")}` : ""}.`),
    };
  },
  villagerSeo: (name) => ({
    title: `${name} — Stardew Valley best gifts and birthday | Vestigo`,
    description: clip(`Every gift ${name} loves, likes, dislikes and hates in Stardew Valley 1.6, the birthday, and the loved gifts you can grow or buy.`),
  }),
  monsterSeo: (name) => ({
    title: `${name} — Stardew Valley monster drops and floors | Vestigo`,
    description: clip(`${name} in Stardew Valley 1.6: health, damage and XP, every drop with its chance, the floors where it shows up and its Adventurer's Guild goal.`),
  }),
  soon: "Soon",
  loading: "Loading…",
  loadError: "This page couldn't load.",
  retry: "Try again",
  gold: "g",
  home: {
    kicker: "Stardew Valley 1.6 guide",
    h1: "Everything in the valley, in one menu",
    lede: (items, villagers, bundles) =>
      `${items} items with their price by quality and where to get them, ${villagers} villagers with every gift they love or hate, and the ${bundles} Community Center bundles.`,
    cards: {
      items: "Price by quality, gifts, bundles, machines and where to find each one.",
      villagers: "Birthdays, loved gifts and the whole list of what each villager likes.",
      bundles: "Every room and bundle with what goes in it. Tick them off as you go.",
      crops: "Gold per day of every crop with your planting day, level, fertilizer and professions.",
      fishing: "What bites right now by place, season, weather and time, and every fish with its hours.",
      recipes: "Every cooking and crafting recipe with how to learn it, and what each machine makes.",
      calendar: "Every birthday and festival of the year, with the gifts each villager loves.",
      mines: "Floors, monsters and their drops, every weapon by damage, boots and rings.",
      save: "Open your save file: perfection, what's left for each bundle and this week's birthdays.",
      predict: "Your next geodes, tomorrow's weather, infested floors, the traveling cart and night events.",
    },
    featured: "Most looked up",
    featuredHint: "Open an item to see its prices, who loves it and what it turns into.",
    season: "This season",
    seasonPick: "Season",
    birthdays: "Birthdays",
    festivals: "Festivals",
    day: (n) => `Day ${n}`,
    about: (version) => `Updated for version ${version}.`,
  },
  items: {
    h1: "Stardew Valley items",
    lede: (n) => `All ${n} items with their price by quality, gifts, bundles and uses.`,
    missing: "That item isn't in the game: here's the whole list.",
    back: "All items",
    search: "Search",
    searchPlaceholder: "Melon, Keg, Pufferfish…",
    category: "Category",
    all: "All",
    groups: { crops: "Crops", fish: "Fish", artisan: "Artisan goods", minerals: "Minerals & gems", cooking: "Cooking", forage: "Forage", machines: "Machines" },
    from: "Where it comes from",
    anySource: "Anywhere",
    sources: { grown: "Grown", fished: "Fished", bought: "Sold in shops", bundle: "For the Community Center" },
    count: (n) => `${n} items`,
    none: "No item matches.",
    sellPrice: "Sell price",
    profession: "Profession",
    noProfession: "None",
    energy: "Energy",
    health: "Health",
    tasteHeads: { love: "Loved by", like: "Liked by", dislike: "Disliked by", hate: "Hated by" },
    bundlesTitle: "Community Center",
    bundleNeed: (qty, quality) => `${qty}${quality ? ` · ${quality} quality` : ""}`,
    turnsInto: "Turns into",
    madeIn: "Comes out of",
    perBatch: (n) => `takes ${n}`,
    time: ({ unit, n, approx }) => `${approx ? "≈ " : ""}${unit === "m" ? `${n} min` : unit === "h" ? `${n} h` : n === 1 ? "1 day" : `${n} days`}`,
    usedIn: "Used in",
    madeWith: "Recipe",
    kinds: { cook: "Cooking", craft: "Crafting" },
    yields: (n) => `makes ${n}`,
    whereTitle: "Where to get it",
    src: {
      crop: "Grows from",
      tree: "Fruit tree",
      shop: "Sold by",
      fish: "Caught in",
      forage: "Found in",
      monster: "Dropped by",
      grow: (d) => `${d} days to grow`,
      regrow: (d) => `regrows every ${d} days`,
      mature: (d) => `${d} days to mature`,
      allYear: "All year",
    },
  },
  villagers: {
    h1: "Stardew Valley villagers",
    lede: (n) => `All ${n} villagers with their birthday and the gifts they love and hate.`,
    missing: "That villager does not exist. Here are all of them.",
    back: "All villagers",
    count: (n) => `${n} villagers`,
    filterBirthday: "Birthday",
    filterRomance: "Romanceable",
    allSeasons: "Any season",
    birthday: (season, day) => `${season} ${day}`,
    birthdayLabel: "Birthday",
    romanceable: "Romanceable",
    region: "Lives in",
    regions: { Town: "Pelican Town", Desert: "Calico Desert" },
    easyTitle: "Easy gifts",
    easyHint: "Loved gifts you can grow or buy.",
    tasteHeads: { love: "Loves", like: "Likes", dislike: "Dislikes", hate: "Hates" },
    tasteCount: (n) => `${n} items`,
  },
  bundles: {
    h1: "Community Center bundles",
    lede: (n) => `The ${n} bundles of the Community Center, room by room.`,
    saved: "Tick what you already handed in. Your list stays in this browser.",
    progress: (done, total) => `${done} of ${total} bundles`,
    needs: (need, total) => (need >= total ? `Needs all ${total}` : `Needs ${need} of ${total}`),
    have: (have, need) => `${have} / ${need}`,
    complete: "Done",
    reward: "Reward",
    onlyMissing: "Only what's missing",
    season: "In season",
    allSeasons: "Any season",
    empty: "Nothing left to show here.",
    tick: (name, qty, quality) => `${name} × ${qty}${quality ? `, ${quality} quality` : ""}`,
    gold: "Gold",
  },
  crops: {
    h1: "Stardew Valley crop profits",
    lede: "Which crop makes the most gold per day, from the day you plant it to the end of its season.",
    season: "Season",
    day: "Planting day",
    level: "Farming level",
    fert: "Fertilizer",
    ferts: { none: "None", basic: "Basic Fertilizer", quality: "Quality Fertilizer", deluxe: "Deluxe Fertilizer", speed: "Speed-Gro", deluxeSpeed: "Deluxe Speed-Gro", hyper: "Hyper Speed-Gro" },
    professions: "Professions",
    sell: "Sell",
    sellBest: "The best way",
    sellRaw: "Raw",
    seeds: "Seeds",
    seedsBuy: "Bought",
    seedsOwn: "Your own",
    greenhouse: "Greenhouse",
    hint: (gh) =>
      gh
        ? "In the greenhouse everything grows: one year from the planting day. Rice and Taro planted next to water."
        : "Until the last day of the season (or of the next one, if the crop keeps growing). Rice and Taro planted next to water.",
    cols: { name: "Crop", harvests: "Harvests", days: "Days", gross: "Gross", seeds: "Seeds", net: "Net", perDay: "Gold / day", sell: "Sell as" },
    sortBy: "Sort by",
    regrow: (n) => `then every ${n}`,
    late: "Too late",
    raw: "Raw",
    noShop: {
      h2: "Seeds not sold in shops",
      hint: "No shop sells these seeds: they're crafted, or come from the Traveling Cart, monsters, Mr. Qi or your own harvest. They're counted as your own seeds, free, so they don't compete with the ones you buy.",
    },
    wild: {
      h2: "Wild seeds",
      hint: "They give a random forage item of the season, so they stay out of the ranking. The numbers use the item on each row.",
    },
    notes: {
      strawberry: "Strawberry seeds are sold at the Egg Festival (Spring 13): planting them on day 1 works from the second year.",
      island: "Banana and Mango fruit all year round on Ginger Island.",
    },
    count: (n) => `${n} crops`,
    none: "Nothing grows this season outside the greenhouse.",
    trees: {
      h2: "Fruit trees",
      hint: "A grown tree gives one fruit a day in its season, normal quality the first year. The sapling isn't counted.",
      cols: { tree: "Tree", season: "Season", days: "Fruits in", sapling: "Sapling", perSeason: "Per season", sell: "Sell as", payback: "Pays off in" },
      days: (n) => `${n} days`,
      payback: (n) => (n === 1 ? "1 season" : `${n} seasons`),
      noSapling: "Not sold",
    },
  },
  fishing: {
    h1: "Stardew Valley fish",
    lede: "What you can catch right now, and every fish with where, when and how hard it is.",
    now: {
      h2: "What can I catch now?",
      place: "Place",
      anyPlace: "Anywhere in the valley",
      island: "Ginger Island (all)",
      water: "Fishing rod",
      traps: "Crab Pot",
      season: "Season",
      weather: "Weather",
      time: "Time",
      anyTime: "Any time",
    },
    weathers: { sunny: "Sun", rainy: "Rain", both: "Any" },
    count: (n) => `${n} fish`,
    none: "Nothing bites here with this season, weather and time.",
    difficulty: (n) => `Difficulty ${n}`,
    level: (n) => `Level ${n}+`,
    anyHour: "Any time",
    allYear: "All year",
    islandAllYear: "· island: all year",
    onlyIsland: "Island: all year",
    tags: { legendary: "Legendary", crabPot: "Crab Pot", qi: "Mr. Qi's special order" },
    all: {
      h2: "Every fish",
      hint: "Crab Pot catches don't depend on the time or the weather. Legendary fish bite once per save; their Mr. Qi versions only during his special order.",
      kind: "Kind",
      kinds: { all: "All", rod: "Fishing rod", crabPot: "Crab Pot", legendary: "Legendary" },
      season: "Season",
      anySeason: "Any season",
      cols: { fish: "Fish", place: "Where", seasons: "Seasons", weather: "Weather", hours: "Hours", difficulty: "Difficulty", price: "Price" },
      count: (n) => `${n} fish`,
    },
  },
  recipes: {
    h1: "Recipes and machines",
    lede: "Every dish and every crafted item with its ingredients and how you learn it, and what each machine turns things into.",
    view: "Show",
    views: { cook: "Cooking", craft: "Crafting", machines: "Machines" },
    search: "Search by name or ingredient",
    searchPlaceholder: "Pink Cake, Melon, Keg…",
    count: (n) => `${n} recipes`,
    machinesCount: (n) => `${n} machines`,
    none: "Nothing matches that search.",
    unlock: {
      label: "How to learn it",
      default: "From the start",
      skill: (skill, level) => `${skill} level ${level}`,
      friend: (npc, hearts) => `${npc} · ${hearts} ${hearts === 1 ? "heart" : "hearts"}`,
      tv: (show) => `TV (${show})`,
      other: "Other way",
    },
    makes: (n) => `× ${n}`,
    machine: {
      made: "Crafted with",
      notMade: "Not crafted: bought or earned.",
      cols: { input: "Goes in", output: "Comes out", price: "Price", time: "Time" },
      nearby: "nearby flower",
      instant: "Instant",
      more: (n) => `See all ${n}`,
      less: "Show fewer",
    },
  },
  calendar: {
    h1: "Calendar",
    lede: "Every birthday and festival of the year, laid out like the town board. Tap a day to see what the birthday villager loves and how long a festival lasts.",
    season: "Season",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    hint: "Tap a day to see its birthday gifts and festivals.",
    dayTitle: (day, season) => `${season} ${day}`,
    range: (range, season) => `${season} ${range}`,
    birthday: (name) => `${name}'s birthday`,
    profile: "Villager page",
    festival: "Festival",
    passive: "Passive festival",
    festivalNote: "The day is spent at the festival.",
    passiveNote: "Come and go as you like: the day goes on as usual.",
    empty: "No birthdays or festivals on this day.",
    close: "Close",
  },
  mines: {
    h1: "Mines and combat",
    lede: "The Mines and the Skull Cavern floor by floor, every monster with what it drops, and the weapons, boots and rings to get through them.",
    view: "Show",
    views: { floors: "Floors", monsters: "Monsters", weapons: "Weapons", gear: "Rings and trinkets", boots: "Boots" },
    elevator: (every, last) => `The elevator stops every ${every} floors, down to floor ${last}.`,
    floors: (from, to) => (to == null ? `Floor ${from} and below` : from === to ? `Floor ${from}` : `Floors ${from} to ${to}`),
    noFloors: "No floors",
    monsters: "Monsters",
    ores: "Ores and geodes",
    chests: "Chests",
    chestFloor: (n) => `Floor ${n}`,
    remixed: "With remixed chests, one of:",
    usualMonsters: "The usual monsters of that stretch of floors.",
    stats: { hp: "Health", dmg: "Damage", def: "Defense", speed: "Speed", xp: "XP" },
    loot: "Drops",
    noLoot: "Drops nothing.",
    monstersCount: (n) => `${n} monsters`,
    dangerousTag: "Dangerous version",
    upTo: (n) => `up to ${n}`,
    weapons: {
      sortBy: "Sort by",
      sorts: { dmg: "Damage", speed: "Speed", crit: "Critical" },
      type: "Type",
      types: { all: "All", sword: "Swords", dagger: "Daggers", club: "Clubs", slingshot: "Slingshots" },
      count: (n) => `${n} weapons`,
      cols: { weapon: "Weapon", damage: "Damage", speed: "Speed", crit: "Critical", where: "Where to get it" },
      nearFloor: (base, min) => `Found in the mines near floor ${base}${min ? ` (from floor ${min})` : ""}`,
      shop: (floor) => (floor ? `after floor ${floor}` : "from the start"),
      galaxy: "after the Galaxy Sword",
      chest: (n) => `Chest on floor ${n}`,
      source: {
        special: (from, to) => (to == null ? `Barrels and glowing monsters from floor ${from} down` : `Barrels and glowing monsters, floors ${from} to ${to}`),
        specialDangerous: "Barrels and glowing monsters in dangerous mode",
        remixed: (n) => `Remixed chest on floor ${n}`,
        volcano: (rare) => (rare ? "Rare Volcano Dungeon chest" : "Volcano Dungeon chest"),
        forge: (weapon, item, n) => `Forge: ${weapon} + ${item} × ${n}`,
        desert: (place, item) => `${place}: hold a ${item} on the pedestal`,
        hauntedSkull: (festival) => `Dropped by the Haunted Skull: in the Quarry Mine, and in the Skull Cavern during the ${festival} Calico statue invasion`,
        fishing: "Fishing treasure chests (only once)",
        slayer: (goal) => `Adventurer's Guild goal: ${goal}`,
        festival: (festival, npc, price, currency) => `${festival}, ${npc}'s stall: ${currency} × ${price}`,
        start: "You start the game with it",
        quarry: "The statue in the Quarry Mine",
        mastery: (name) => `${name} reward`,
      },
      other: "Another way (quest, event or special drop)",
      ammo: "Ammo",
      critMult: (n) => `× ${n}`,
    },
    gear: {
      rings: "Rings",
      ringsHint: "Up to two at a time, one on each hand. Open a ring to see how it's crafted or what drops it.",
      trinkets: "Trinkets",
      trinketsHint: "One at a time, after the Combat Mastery. X is a number each trinket rolls on its own.",
      drops: "Dropped by monsters",
      noDrops: "Doesn't drop",
    },
    boots: { cols: { boots: "Boots", defense: "Defense", immunity: "Immunity", where: "Where to get them" } },
    monster: {
      missing: "That monster isn't here. These are all of them.",
      statsTitle: "Stats",
      lootTitle: "Drops",
      lootHint: "The chance of getting at least one per kill; some drops roll more than once.",
      whereTitle: "Where it shows up",
      dangerous: "It also has a stronger version in dangerous mode, after Mr. Qi's challenge.",
      slayerTitle: "Adventurer's Guild",
      slayerGoal: (n) => `Slay ${n} in total of:`,
      reward: "Reward",
      phone: "Marlon's phone number, to use the Item Recovery Service by phone",
    },
  },
  predict: PREDICT_EN,
  save: {
    h1: "Save file reader",
    lede: "Open your save file to see how close you are to perfection, what each Community Center bundle still needs, whose birthday is coming up this week and which fish and recipes you're missing.",
    drop: "Drop your save file here",
    pick: "or choose it",
    reading: "Reading…",
    whereTitle: "Where your save is",
    where: [
      { os: "Windows", path: "%AppData%\\StardewValley\\Saves\\<farm>\\<farm>" },
      { os: "Mac and Linux", path: "~/.config/StardewValley/Saves/<farm>/<farm>" },
    ],
    fileHint: "Inside the farm's folder, open the file with the same name as the folder (not SaveGameInfo).",
    private: "The file is read right here in your browser and isn't uploaded anywhere. This page only remembers what it shows, until you forget it.",
    errors: {
      "not-xml": "That file isn't a Stardew Valley save. Open the file with the same name as the farm's folder.",
      "save-info": "That's SaveGameInfo, which only has the farmer. Open the other file in the same folder, the one named like the folder.",
      "not-save": "That file doesn't look like a Stardew Valley save. Open the file with the same name as the farm's folder.",
      read: "The browser couldn't read that file. Try choosing it again.",
      broken: "That save couldn't be shown, so it was forgotten. Try opening the file again.",
    },
    old: (version) =>
      `This save is from ${version.startsWith("<") ? `before version ${version.slice(1)}` : `version ${version}`}. It reads fine, but the 1.6 perfection can differ from what your game shows.`,
    farm: (name) => `${name} Farm`,
    date: (day, season, year) => `${season} ${day}, year ${year}`,
    farmer: "Farmer",
    host: "host",
    other: "Open another save",
    forget: "Forget this save",
    toPredict: "See what your save predicts",
    today: {
      title: "Today",
      empty: "Nothing special today.",
      birthday: (name) => `It's ${name}'s birthday`,
      lovedHave: "Loved gifts you have:",
      festival: (name, when) => (when === 0 ? `${name} is today` : `${name} is tomorrow`),
      plant: "Last day to plant these and still harvest them this season:",
      fish: "Fish you're missing that leave when the season ends:",
      bundle: "Bundle items of this season you don't have yet:",
      tv: (show, recipe) => `${show} teaches ${recipe} on TV today.`,
      cart: "The traveling merchant's cart is in the forest today, south of the farm.",
    },
    perfection: {
      title: "Perfection",
      hint: "Open a part to see what's left. The farm counts as one: in each part, the farmer who has the most.",
      points: (got, weight) => `${got} of ${weight} points`,
      level: (level) => `Farmer level ${level} of 25: the sum of your six skills, halved.`,
      walnuts: "Golden Walnuts are found on Ginger Island.",
      allDone: "Done.",
      hearts: (have, need) => `${have} / ${need} ♥`,
      from: (name) => `This part counts ${name}'s progress.`,
    },
    gifts: {
      title: "Gifts this week",
      empty: "No birthdays in the next 7 days.",
      today: "Today",
      inDays: (n) => (n === 1 ? "Tomorrow" : `In ${n} days`),
      on: (day, season) => `${season} ${day}`,
      hearts: (n) => `${n} ♥`,
      giftsWeek: (n) => `${n} of 2 gifts this week`,
      have: (n) => `You have ${n}`,
    },
    cc: {
      title: "Community Center",
      joja: "You joined Joja: the Community Center won't be restored, so there are no bundles left.",
      complete: "The Community Center is restored: every bundle is done.",
      roomDone: "Done.",
      left: (n) => (n === 1 ? "1 more item" : `${n} more items`),
      inFarm: (n) => `${n} on the farm`,
      sync: "Copy what's done to the checklist",
      synced: (n) => (n === 0 ? "The checklist was already up to date." : n === 1 ? "1 slot ticked in the checklist." : `${n} slots ticked in the checklist.`),
      gold: "Gold",
    },
    missing: {
      title: "Fish and recipes left",
      fish: "Fish",
      now: "You can get these now",
      later: "Later",
      leaving: "Leaves this season",
      cook: "Cooking",
      craft: "Crafting",
      tv: "On TV this season",
      count: (n) => `${n} left`,
      none: "None left.",
    },
  },
  qualities: { normal: "Normal", silver: "Silver", gold: "Gold", iridium: "Iridium" },
  // `LevelUp_ProfessionName_*` de `Strings/UI`.
  professions: {
    tiller: "Tiller",
    agriculturist: "Agriculturist",
    artisan: "Artisan",
    rancher: "Rancher",
    fisher: "Fisher",
    angler: "Angler",
    blacksmith: "Blacksmith",
    gemologist: "Gemologist",
    tapper: "Tapper",
  },
  tastes: { love: "Loves it", like: "Likes it", neutral: "Neutral", dislike: "Dislikes it", hate: "Hates it" },
  seasons: ["Spring", "Summer", "Fall", "Winter"],
};

const ES: StardewCopy = {
  tabs: { home: "Inicio", items: "Objetos", villagers: "Aldeanos", bundles: "Centro Comunitario", crops: "Cultivos", fishing: "Pesca", recipes: "Recetas", calendar: "Calendario", mines: "Minas y combate", save: "Lector de partida", predict: "Predictor" },
  seo: {
    home: {
      title: "Guía de Stardew Valley: cultivos, peces, regalos y paquetes | Vestigo",
      description: "Stardew Valley 1.6: calculadora de cultivos, qué pescar ahora, recetas, cumpleaños y festivales, precios, regalos de aldeanos y paquetes para tildar.",
    },
    items: {
      title: "Objetos de Stardew Valley: precios, regalos y usos | Vestigo",
      description: "Los objetos de Stardew Valley 1.6 por categoría: precio por calidad, a quién le encanta, en qué paquete va, qué sale de las máquinas y dónde se consigue.",
    },
    villagers: {
      title: "Aldeanos de Stardew Valley: regalos favoritos y cumpleaños | Vestigo",
      description: "Cada aldeano de Stardew Valley 1.6 con su cumpleaños y todos los regalos que le encantan, le gustan, no le gustan y odia. Filtrá por candidatos o estación.",
    },
    bundles: {
      title: "Paquetes del Centro Comunitario de Stardew Valley: lista para tildar | Vestigo",
      description: "Los paquetes del Centro Comunitario de Stardew Valley, sala por sala: qué lleva cada uno, la recompensa y qué se consigue esta estación. Tildalos al avanzar.",
    },
    crops: {
      title: "Calculadora de cultivos de Stardew Valley: los que más ganan por estación | Vestigo",
      description: "Qué cultivo de Stardew Valley 1.6 da más oro por día esta estación: elegí el día de siembra, el nivel, el fertilizante y las profesiones. Con los frutales.",
    },
    fishing: {
      title: "Peces de Stardew Valley: qué se puede pescar ahora | Vestigo",
      description: "Qué peces se pescan en Stardew Valley 1.6 ahora mismo: elegí el lugar, la estación, el clima y la hora. Cada pez con su lugar, horario, dificultad y precio.",
    },
    recipes: {
      title: "Recetas de Stardew Valley: cocina, fabricación y máquinas | Vestigo",
      description: "Todas las recetas de cocina y fabricación de Stardew Valley 1.6 con sus ingredientes y cómo se aprenden, y qué hace cada máquina, cuánto tarda y su precio.",
    },
    calendar: {
      title: "Calendario de Stardew Valley: cumpleaños y festivales | Vestigo",
      description: "Calendario de Stardew Valley 1.6: el cumpleaños de cada aldeano con los regalos que le encantan y cada festival, del Mercado nocturno a la Fiesta del Calamar.",
    },
    mines: {
      title: "Minas de Stardew Valley: monstruos, armas y pisos | Vestigo",
      description: "Las Minas y la Caverna Calavera de Stardew Valley 1.6 piso por piso: monstruos con su botín, cada arma ordenada por daño, botas, anillos y los cofres.",
    },
    save: {
      title: "Lector de partida de Stardew Valley: perfección y lo que falta | Vestigo",
      description: "Abrí tu partida de Stardew Valley 1.6 y mirá tu perfección, lo que le falta al Centro Comunitario, los cumpleaños de la semana y los peces y recetas.",
    },
    predict: {
      title: "Predictor de Stardew Valley (1.6): geodas, clima, minas y carro ambulante | Vestigo",
      description: "Qué dan tus próximas geodas y cajas en Stardew Valley 1.6, el clima y la suerte, los pisos infestados de las Minas, el carro ambulante y las noches con evento.",
    },
  },
  itemSeo: (name, has = 0) => {
    const t = itemTopics(has);
    const topics = ["precio", ...(t.gift ? ["regalos"] : []), ...(t.bundle ? ["paquetes"] : []), ...(t.uses ? ["usos"] : [])];
    const head = topics.length > 1 ? join(topics, "y") : t.sources ? "precio y dónde se consigue" : "precio de venta";
    const parts = [
      ...(t.gift ? ["a qué aldeanos les encanta o lo odian"] : []),
      ...(t.bundle ? ["los paquetes que lo piden"] : []),
      ...(t.machine ? ["en qué lo transforman las máquinas"] : []),
      ...(t.recipe ? ["las recetas que lo hacen o lo usan"] : []),
      ...(t.sources ? ["dónde se consigue"] : []),
    ];
    return {
      title: `${name} — Stardew Valley: ${head} | Vestigo`,
      description: clip(`${name} en Stardew Valley 1.6: su precio de venta por calidad${parts.length ? `, ${join(parts, "y")}` : ""}.`),
    };
  },
  monsterSeo: (name) => ({
    title: `${name} — Stardew Valley: botín y pisos donde sale | Vestigo`,
    description: clip(`${name} en Stardew Valley 1.6: salud, daño y experiencia, todo lo que suelta con su probabilidad, los pisos donde sale y su meta del Gremio de Aventureros.`),
  }),
  villagerSeo: (name) => ({
    title: `${name} — Stardew Valley: regalos favoritos y cumpleaños | Vestigo`,
    description: clip(`Todo lo que a ${name} le encanta, le gusta, no le gusta y odia de regalo en Stardew Valley 1.6, su cumpleaños y los favoritos que se cultivan o se compran.`),
  }),
  soon: "Pronto",
  loading: "Cargando…",
  loadError: "Esta página no se pudo cargar.",
  retry: "Reintentar",
  gold: "g",
  home: {
    kicker: "Guía de Stardew Valley 1.6",
    h1: "Todo el valle, en un solo menú",
    lede: (items, villagers, bundles) =>
      `${items} objetos con su precio por calidad y dónde se consiguen, ${villagers} aldeanos con cada regalo que les encanta o que odian, y los ${bundles} paquetes del Centro Comunitario.`,
    cards: {
      items: "Precio por calidad, regalos, paquetes, máquinas y dónde se consigue cada uno.",
      villagers: "Cumpleaños, regalos favoritos y la lista entera de lo que le gusta a cada aldeano.",
      bundles: "Cada sala y cada paquete con lo que lleva. Tachalos a medida que los completás.",
      crops: "El oro por día de cada cultivo con tu día de siembra, nivel, fertilizante y profesiones.",
      fishing: "Qué pica ahora según el lugar, la estación, el clima y la hora, y cada pez con su horario.",
      recipes: "Cada receta de cocina y fabricación con cómo se aprende, y qué hace cada máquina.",
      calendar: "Cada cumpleaños y festival del año, con los regalos que le encantan a cada aldeano.",
      mines: "Pisos, monstruos y lo que sueltan, cada arma por daño, botas y anillos.",
      save: "Abrí tu partida: la perfección, lo que falta de cada paquete y los cumpleaños de la semana.",
      predict: "Tus próximas geodas, el clima de mañana, los pisos infestados, el carro y las noches con evento.",
    },
    featured: "Los más buscados",
    featuredHint: "Abrí un objeto para ver sus precios, a quién le encanta y en qué se transforma.",
    season: "Esta temporada",
    seasonPick: "Estación",
    birthdays: "Cumpleaños",
    festivals: "Festivales",
    day: (n) => `Día ${n}`,
    about: (version) => `Al día con la versión ${version}.`,
  },
  items: {
    h1: "Objetos de Stardew Valley",
    lede: (n) => `Los ${n} objetos con su precio por calidad, regalos, paquetes y usos.`,
    missing: "Ese objeto no está en el juego: acá está la lista entera.",
    back: "Todos los objetos",
    search: "Buscar",
    searchPlaceholder: "Melón, barril, pez globo…",
    category: "Categoría",
    all: "Todo",
    groups: { crops: "Cultivos", fish: "Peces", artisan: "Artesanía", minerals: "Minerales y gemas", cooking: "Cocina", forage: "Forraje", machines: "Máquinas" },
    from: "De dónde sale",
    anySource: "De cualquier lado",
    sources: { grown: "Se cultiva", fished: "Se pesca", bought: "Se compra", bundle: "Para el Centro Comunitario" },
    count: (n) => `${n} objetos`,
    none: "Ningún objeto coincide.",
    sellPrice: "Precio de venta",
    profession: "Profesión",
    noProfession: "Ninguna",
    energy: "Energía",
    health: "Salud",
    tasteHeads: { love: "Le encanta a", like: "Le gusta a", dislike: "No le gusta a", hate: "Lo odia" },
    bundlesTitle: "Centro Comunitario",
    bundleNeed: (qty, quality) => `${qty}${quality ? ` · calidad ${quality}` : ""}`,
    turnsInto: "Se transforma en",
    madeIn: "Sale de",
    perBatch: (n) => `entran ${n}`,
    time: ({ unit, n, approx }) => `${approx ? "≈ " : ""}${unit === "m" ? `${n} min` : unit === "h" ? `${n} h` : n === 1 ? "1 día" : `${n} días`}`,
    usedIn: "Se usa en",
    madeWith: "Se fabrica con",
    kinds: { cook: "Cocina", craft: "Fabricación" },
    yields: (n) => `salen ${n}`,
    whereTitle: "Dónde se consigue",
    src: {
      crop: "Se cultiva con",
      tree: "Árbol frutal",
      shop: "Lo vende",
      fish: "Se pesca en",
      forage: "Se encuentra en",
      monster: "Lo suelta",
      grow: (d) => `${d} días hasta la cosecha`,
      regrow: (d) => `vuelve a dar cada ${d} días`,
      mature: (d) => `${d} días hasta dar fruto`,
      allYear: "Todo el año",
    },
  },
  villagers: {
    h1: "Aldeanos de Stardew Valley",
    lede: (n) => `Los ${n} aldeanos con su cumpleaños y los regalos que les encantan y que odian.`,
    missing: "Ese aldeano no existe. Acá están todos.",
    back: "Todos los aldeanos",
    count: (n) => `${n} aldeanos`,
    filterBirthday: "Cumpleaños",
    filterRomance: "Cortejables",
    allSeasons: "Cualquier estación",
    birthday: (season, day) => `${season} ${day}`,
    birthdayLabel: "Cumpleaños",
    romanceable: "Se puede cortejar",
    region: "Vive en",
    regions: { Town: "Pueblo Pelícano", Desert: "Desierto de Calico" },
    easyTitle: "Regalos fáciles",
    easyHint: "Lo que le encanta y podés cultivar o comprar.",
    tasteHeads: { love: "Le encanta", like: "Le gusta", dislike: "No le gusta", hate: "Lo odia" },
    tasteCount: (n) => `${n} objetos`,
  },
  bundles: {
    h1: "Paquetes del Centro Comunitario",
    lede: (n) => `Los ${n} paquetes del Centro Comunitario, sala por sala.`,
    saved: "Tildá lo que ya entregaste. Tu lista queda en este navegador.",
    progress: (done, total) => `${done} de ${total} paquetes`,
    needs: (need, total) => (need >= total ? `Pide los ${total}` : `Pide ${need} de ${total}`),
    have: (have, need) => `${have} / ${need}`,
    complete: "Listo",
    reward: "Recompensa",
    onlyMissing: "Sólo lo que falta",
    season: "De temporada",
    allSeasons: "Cualquier estación",
    empty: "No queda nada para mostrar acá.",
    tick: (name, qty, quality) => `${name} × ${qty}${quality ? `, calidad ${quality}` : ""}`,
    gold: "Oro",
  },
  crops: {
    h1: "Ganancias de los cultivos",
    lede: "Qué cultivo da más oro por día, desde el día en que lo plantás hasta el fin de su estación.",
    season: "Estación",
    day: "Día de siembra",
    level: "Nivel de agricultura",
    fert: "Fertilizante",
    ferts: { none: "Ninguno", basic: "Fertilizante básico", quality: "Fertilizante deluxe", deluxe: "Fertilizante de lujo", speed: "Acelerador básico", deluxeSpeed: "Acelerador deluxe", hyper: "Fertilizante ultra-rápido" },
    professions: "Profesiones",
    sell: "Venta",
    sellBest: "Lo mejor",
    sellRaw: "Crudo",
    seeds: "Semillas",
    seedsBuy: "Compradas",
    seedsOwn: "Propias",
    greenhouse: "Invernadero",
    hint: (gh) =>
      gh
        ? "En el invernadero crece todo: un año desde el día de siembra. Arroz y Taro plantados junto al agua."
        : "Hasta el último día de la estación (o de la siguiente, si el cultivo sigue creciendo). Arroz y Taro plantados junto al agua.",
    cols: { name: "Cultivo", harvests: "Cosechas", days: "Días", gross: "Bruto", seeds: "Semillas", net: "Neto", perDay: "Oro / día", sell: "Se vende" },
    sortBy: "Ordenar por",
    regrow: (n) => `y cada ${n}`,
    late: "No llega",
    raw: "Crudo",
    noShop: {
      h2: "Sin semilla en tienda",
      hint: "Ninguna tienda vende estas semillas: se fabrican o salen del carro ambulante, de monstruos, del Sr. Qi o de tu propia cosecha. Se cuentan como propias, sin costo, así no compiten con las que se compran.",
    },
    wild: {
      h2: "Semillas silvestres",
      hint: "Dan una recolección al azar de la estación, así que quedan fuera del ranking. Las cuentas usan el objeto de cada fila.",
    },
    notes: {
      strawberry: "Las semillas de fresa se compran en el Festival del huevo (13 de primavera): plantarlas el día 1 vale desde el segundo año.",
      island: "La Banana y el Mango dan fruto todo el año en la Isla Jengibre.",
    },
    count: (n) => `${n} cultivos`,
    none: "Fuera del invernadero no crece nada en esta estación.",
    trees: {
      h2: "Frutales",
      hint: "Un árbol adulto da una fruta por día en su estación, de calidad normal el primer año. El retoño no se cuenta.",
      cols: { tree: "Árbol", season: "Estación", days: "Da fruto en", sapling: "Retoño", perSeason: "Por estación", sell: "Se vende", payback: "Se paga en" },
      days: (n) => `${n} días`,
      payback: (n) => (n === 1 ? "1 estación" : `${n} estaciones`),
      noSapling: "No se vende",
    },
  },
  fishing: {
    h1: "Peces de Stardew Valley",
    lede: "Qué podés pescar ahora mismo, y cada pez con dónde, cuándo y qué tan difícil es.",
    now: {
      h2: "¿Qué puedo pescar ahora?",
      place: "Lugar",
      anyPlace: "Cualquier lugar del valle",
      island: "Isla Jengibre (todas)",
      water: "Caña de pescar",
      traps: "Trampa para cangrejos",
      season: "Estación",
      weather: "Clima",
      time: "Hora",
      anyTime: "Cualquier hora",
    },
    weathers: { sunny: "Sol", rainy: "Lluvia", both: "Cualquiera" },
    count: (n) => `${n} peces`,
    none: "Acá no pica nada con esta estación, este clima y esta hora.",
    difficulty: (n) => `Dificultad ${n}`,
    level: (n) => `Nivel ${n}+`,
    anyHour: "Cualquier hora",
    allYear: "Todo el año",
    islandAllYear: "· isla: todo el año",
    onlyIsland: "Isla: todo el año",
    tags: { legendary: "Legendario", crabPot: "Trampa", qi: "Encargo del Sr. Qi" },
    all: {
      h2: "Todos los peces",
      hint: "Lo de la trampa para cangrejos no depende de la hora ni del clima. Los legendarios se pescan una sola vez por partida; sus versiones del Sr. Qi, sólo durante su encargo especial.",
      kind: "Tipo",
      kinds: { all: "Todos", rod: "Con caña", crabPot: "Con trampa", legendary: "Legendarios" },
      season: "Estación",
      anySeason: "Cualquier estación",
      cols: { fish: "Pez", place: "Dónde", seasons: "Estaciones", weather: "Clima", hours: "Horario", difficulty: "Dificultad", price: "Precio" },
      count: (n) => `${n} peces`,
    },
  },
  recipes: {
    h1: "Recetas y máquinas",
    lede: "Cada plato y cada objeto que se fabrica con sus ingredientes y cómo se aprende, y en qué transforma las cosas cada máquina.",
    view: "Ver",
    views: { cook: "Cocina", craft: "Fabricación", machines: "Máquinas" },
    search: "Buscar por nombre o ingrediente",
    searchPlaceholder: "Pastel rosa, Melón, Barril…",
    count: (n) => `${n} recetas`,
    machinesCount: (n) => `${n} máquinas`,
    none: "No hay nada con esa búsqueda.",
    unlock: {
      label: "Cómo se aprende",
      default: "Desde el principio",
      skill: (skill, level) => `${skill} nivel ${level}`,
      friend: (npc, hearts) => `${npc} · ${hearts} ${hearts === 1 ? "corazón" : "corazones"}`,
      tv: (show) => `TV (${show})`,
      other: "Otra forma",
    },
    makes: (n) => `× ${n}`,
    machine: {
      made: "Se fabrica con",
      notMade: "No se fabrica: se compra o se gana.",
      cols: { input: "Entra", output: "Sale", price: "Precio", time: "Tiempo" },
      nearby: "flor cercana",
      instant: "Al instante",
      more: (n) => `Ver las ${n}`,
      less: "Ver menos",
    },
  },
  calendar: {
    h1: "Calendario",
    lede: "Cada cumpleaños y festival del año, como en el tablón del pueblo. Tocá un día para ver qué le encanta al cumpleañero y cuánto dura un festival.",
    season: "Estación",
    weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    hint: "Tocá un día para ver los regalos del cumpleaños y los festivales.",
    dayTitle: (day, season) => `${day} de ${season.toLowerCase()}`,
    range: (range, season) => `${range} de ${season.toLowerCase()}`,
    birthday: (name) => `Cumpleaños de ${name}`,
    profile: "Ver su ficha",
    festival: "Festival",
    passive: "Festival pasivo",
    festivalNote: "Ese día se pasa en el festival.",
    passiveNote: "Se va y se viene cuando uno quiere: el día sigue como siempre.",
    empty: "Ese día no hay cumpleaños ni festivales.",
    close: "Cerrar",
  },
  mines: {
    h1: "Minas y combate",
    lede: "Las Minas y la Caverna Calavera piso por piso, cada monstruo con lo que suelta, y las armas, botas y anillos para atravesarlas.",
    view: "Mostrar",
    views: { floors: "Pisos", monsters: "Monstruos", weapons: "Armas", gear: "Anillos y baratijas", boots: "Botas" },
    elevator: (every, last) => `El ascensor para cada ${every} pisos, hasta el ${last}.`,
    floors: (from, to) => (to == null ? `Del piso ${from} para abajo` : from === to ? `Piso ${from}` : `Pisos ${from} a ${to}`),
    noFloors: "Sin pisos",
    monsters: "Monstruos",
    ores: "Minerales y geodas",
    chests: "Cofres",
    chestFloor: (n) => `Piso ${n}`,
    remixed: "Con los cofres remezclados, uno de estos:",
    usualMonsters: "Los monstruos de siempre de ese tramo de pisos.",
    stats: { hp: "Salud", dmg: "Daño", def: "Defensa", speed: "Velocidad", xp: "Experiencia" },
    loot: "Botín",
    noLoot: "No suelta nada.",
    monstersCount: (n) => `${n} monstruos`,
    dangerousTag: "Versión peligrosa",
    upTo: (n) => `hasta ${n}`,
    weapons: {
      sortBy: "Ordenar por",
      sorts: { dmg: "Daño", speed: "Velocidad", crit: "Crítico" },
      type: "Tipo",
      types: { all: "Todas", sword: "Espadas", dagger: "Dagas", club: "Porras", slingshot: "Tirachinas" },
      count: (n) => `${n} armas`,
      cols: { weapon: "Arma", damage: "Daño", speed: "Velocidad", crit: "Crítico", where: "Dónde se consigue" },
      nearFloor: (base, min) => `Sale en las minas cerca del piso ${base}${min ? ` (desde el ${min})` : ""}`,
      shop: (floor) => (floor ? `después del piso ${floor}` : "desde el principio"),
      galaxy: "después de la Espada galaxia",
      chest: (n) => `Cofre del piso ${n}`,
      source: {
        special: (from, to) => (to == null ? `Barriles y monstruos que brillan, del piso ${from} para abajo` : `Barriles y monstruos que brillan, pisos ${from} a ${to}`),
        specialDangerous: "Barriles y monstruos que brillan en el modo peligroso",
        remixed: (n) => `Cofre remezclado del piso ${n}`,
        volcano: (rare) => (rare ? "Cofre raro de la mazmorra del volcán" : "Cofre de la mazmorra del volcán"),
        forge: (weapon, item, n) => `Forja: ${weapon} + ${minus(item)} × ${n}`,
        desert: (place, item) => `${place}: con una ${minus(item)} en la mano, sobre el pedestal`,
        hauntedSkull: (festival) => `La suelta la calavera embrujada: en la mina de la cantera y, en la Caverna Calavera, durante la invasión de estatuas de Calico del ${festival}`,
        fishing: "Cofres del tesoro de la pesca (una sola vez)",
        slayer: (goal) => `Meta del Gremio de Aventureros: ${goal}`,
        festival: (festival, npc, price, currency) => `${festival}, puesto de ${npc}: ${minus(currency)} × ${price}`,
        start: "Se empieza el juego con ella",
        quarry: "La estatua de la mina de la cantera",
        mastery: (name) => `Premio de la ${minus(name)}`,
      },
      other: "Otra forma (misión, evento o botín especial)",
      ammo: "Munición",
      critMult: (n) => `× ${n}`,
    },
    gear: {
      rings: "Anillos",
      ringsHint: "Hasta dos a la vez, uno en cada mano. Abrí un anillo para ver cómo se fabrica o quién lo suelta.",
      trinkets: "Baratijas",
      trinketsHint: "Una a la vez, después de la maestría de Combate. X es un número que cada baratija trae a su suerte.",
      drops: "La sueltan los monstruos",
      noDrops: "No la sueltan",
    },
    boots: { cols: { boots: "Botas", defense: "Defensa", immunity: "Inmunidad", where: "Dónde se consiguen" } },
    monster: {
      missing: "Ese monstruo no está. Estos son todos.",
      statsTitle: "Estadísticas",
      lootTitle: "Botín",
      lootHint: "La probabilidad de que caiga al menos uno por monstruo muerto; algunas cosas salen en más de una tirada.",
      whereTitle: "Dónde sale",
      dangerous: "Tiene además una versión más fuerte en el modo peligroso, después del desafío del Sr. Qi.",
      slayerTitle: "Gremio de Aventureros",
      slayerGoal: (n) => `Matá ${n} entre:`,
      reward: "Premio",
      phone: "El teléfono de Marlon, para usar el Servicio de Recuperación de Objetos por teléfono",
    },
  },
  predict: PREDICT_ES,
  save: {
    h1: "Lector de partida",
    lede: "Abrí el archivo de tu partida para ver cuánto te falta para la perfección, qué pide todavía cada paquete del Centro Comunitario, quién cumple años esta semana y qué peces y recetas te faltan.",
    drop: "Soltá acá el archivo de tu partida",
    pick: "o elegilo",
    reading: "Leyendo…",
    whereTitle: "Dónde está tu partida",
    where: [
      { os: "Windows", path: "%AppData%\\StardewValley\\Saves\\<granja>\\<granja>" },
      { os: "Mac y Linux", path: "~/.config/StardewValley/Saves/<granja>/<granja>" },
    ],
    fileHint: "Adentro de la carpeta de la granja, abrí el archivo que se llama igual que la carpeta (no SaveGameInfo).",
    private: "El archivo se lee acá, en tu navegador, y no se sube a ningún lado. Esta página sólo recuerda lo que muestra, hasta que lo olvides.",
    errors: {
      "not-xml": "Ese archivo no es una partida de Stardew Valley. Abrí el que se llama igual que la carpeta de la granja.",
      "save-info": "Ese es SaveGameInfo, que sólo tiene al granjero. Abrí el otro archivo de la misma carpeta, el que se llama como la carpeta.",
      "not-save": "Ese archivo no parece una partida de Stardew Valley. Abrí el que se llama igual que la carpeta de la granja.",
      read: "El navegador no pudo leer ese archivo. Probá elegirlo de nuevo.",
      broken: "Esa partida no se pudo mostrar, así que se olvidó. Probá abrir el archivo de nuevo.",
    },
    old: (version) =>
      `Esta partida es ${version.startsWith("<") ? `anterior a la versión ${version.slice(1)}` : `de la versión ${version}`}. Se lee igual, pero la perfección de la 1.6 puede no coincidir con la de tu juego.`,
    farm: (name) => `Granja ${name}`,
    date: (day, season, year) => `${day} de ${season.toLowerCase()}, año ${year}`,
    farmer: "Granjero",
    host: "anfitrión",
    other: "Abrir otra partida",
    forget: "Olvidar esta partida",
    toPredict: "Ver qué predice tu partida",
    today: {
      title: "Hoy",
      empty: "Hoy no hay nada especial.",
      birthday: (name) => `Hoy cumple años ${name}`,
      lovedHave: "Regalos que le encantan y tenés:",
      festival: (name, when) => (when === 0 ? `Hoy es ${name}` : `Mañana es ${name}`),
      plant: "Último día para plantar estos y cosecharlos en esta estación:",
      fish: "Peces que te faltan y se van al terminar la estación:",
      bundle: "Objetos de paquetes de esta estación que todavía no tenés:",
      tv: (show, recipe) => `Hoy ${show} enseña ${recipe} en la tele.`,
      cart: "Hoy está el carro de la mercader en el bosque, al sur de la granja.",
    },
    perfection: {
      title: "Perfección",
      hint: "Abrí una parte para ver lo que falta. La granja cuenta como una: en cada parte, el granjero que más tiene.",
      points: (got, weight) => `${got} de ${weight} puntos`,
      level: (level) => `Nivel de granjero ${level} de 25: la suma de tus seis habilidades, dividida por dos.`,
      walnuts: "Las nueces doradas se encuentran en la Isla Jengibre.",
      allDone: "Hecho.",
      hearts: (have, need) => `${have} / ${need} ♥`,
      from: (name) => `Esta parte cuenta lo de ${name}.`,
    },
    gifts: {
      title: "Regalos de la semana",
      empty: "Nadie cumple años en los próximos 7 días.",
      today: "Hoy",
      inDays: (n) => (n === 1 ? "Mañana" : `En ${n} días`),
      on: (day, season) => `${day} de ${season.toLowerCase()}`,
      hearts: (n) => `${n} ♥`,
      giftsWeek: (n) => `${n} de 2 regalos esta semana`,
      have: (n) => `Tenés ${n}`,
    },
    cc: {
      title: "Centro Comunitario",
      joja: "Te uniste a Joja: el Centro Comunitario no se va a restaurar, así que no quedan paquetes.",
      complete: "El Centro Comunitario está restaurado: todos los paquetes están hechos.",
      roomDone: "Hecho.",
      left: (n) => (n === 1 ? "Falta 1 objeto" : `Faltan ${n} objetos`),
      inFarm: (n) => `${n} en la granja`,
      sync: "Pasar lo hecho al checklist",
      synced: (n) => (n === 0 ? "El checklist ya estaba al día." : n === 1 ? "Se tildó 1 casillero en el checklist." : `Se tildaron ${n} casilleros en el checklist.`),
      gold: "Oro",
    },
    missing: {
      title: "Peces y recetas que faltan",
      fish: "Peces",
      now: "Se consiguen ya",
      later: "Más adelante",
      leaving: "Se va esta estación",
      cook: "Cocina",
      craft: "Fabricación",
      tv: "En la tele esta estación",
      count: (n) => `Faltan ${n}`,
      none: "No falta ninguno.",
    },
  },
  qualities: { normal: "Normal", silver: "Plata", gold: "Oro", iridium: "Iridio" },
  // `LevelUp_ProfessionName_*` de `Strings/UI.es-ES`.
  professions: {
    tiller: "Labrador",
    agriculturist: "Agricultor",
    artisan: "Artesano",
    rancher: "Ranchero",
    fisher: "Pescador",
    angler: "Pesquero",
    blacksmith: "Herrero",
    gemologist: "Gemólogo",
    tapper: "Resinador",
  },
  tastes: { love: "Le encanta", like: "Le gusta", neutral: "Le da igual", dislike: "No le gusta", hate: "Lo odia" },
  seasons: ["Primavera", "Verano", "Otoño", "Invierno"],
};

export const STARDEW_COPY: Record<"en" | "es", StardewCopy> = { en: EN, es: ES };
export const useStardewCopy = (): StardewCopy => STARDEW_COPY[useLang().lang];
