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

/** El orden de las pestañas en la barra, como las del menú del juego. */
export const STARDEW_TABS: StardewSection[] = ["home", "items", "crops", "fishing", "mines", "recipes", "villagers", "calendar", "bundles"];

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
    other: string;
    ammo: string;
    critMult: (n: string) => string;
  };
  gear: { rings: string; ringsHint: string; trinkets: string; trinketsHint: string; drops: string; noDrops: string };
  boots: { cols: { boots: string; defense: string; immunity: string; where: string } };
  monster: {
    back: string;
    missing: string;
    statsTitle: string;
    lootTitle: string;
    lootHint: string;
    whereTitle: string;
    nowhere: string;
    dangerous: string;
    slayerTitle: string;
    /** "Matá 1.000 entre:", y después los monstruos que cuentan. */
    slayerGoal: (n: string) => string;
    reward: string;
    phone: string;
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
  qualities: Record<Quality, string>;
  professions: Record<Profession, string>;
  tastes: Record<Taste, string>;
  /** Primavera, verano, otoño, invierno: `Utility.cs.5680` a `5683` de `Strings/StringsFromCSFiles`. */
  seasons: [string, string, string, string];
}

const EN: StardewCopy = {
  tabs: { home: "Home", items: "Items", villagers: "Villagers", bundles: "Community Center", crops: "Crops", fishing: "Fishing", recipes: "Recipes", calendar: "Calendar", mines: "Mines & combat" },
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
      back: "All monsters",
      missing: "That monster isn't here. These are all of them.",
      statsTitle: "Stats",
      lootTitle: "Drops",
      lootHint: "The chance of each drop per kill.",
      whereTitle: "Where it shows up",
      nowhere: "Not on any floor.",
      dangerous: "It also has a stronger version in dangerous mode, after Mr. Qi's challenge.",
      slayerTitle: "Adventurer's Guild",
      slayerGoal: (n) => `Slay ${n} in total of:`,
      reward: "Reward",
      phone: "Marlon's phone number, to use the Item Recovery Service by phone",
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
  tabs: { home: "Inicio", items: "Objetos", villagers: "Aldeanos", bundles: "Centro Comunitario", crops: "Cultivos", fishing: "Pesca", recipes: "Recetas", calendar: "Calendario", mines: "Minas y combate" },
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
    weapons: {
      sortBy: "Ordenar por",
      sorts: { dmg: "Daño", speed: "Velocidad", crit: "Crítico" },
      type: "Tipo",
      types: { all: "Todas", sword: "Espadas", dagger: "Dagas", club: "Porras", slingshot: "Tirachinas" },
      count: (n) => `${n} armas`,
      cols: { weapon: "Arma", damage: "Daño", speed: "Velocidad", crit: "Crítico", where: "Dónde se consigue" },
      nearFloor: (base, min) => `Sale en las minas cerca del piso ${base}${min ? ` (desde el ${min})` : ""}`,
      shop: (floor) => (floor ? `después del piso ${floor}` : "desde el principio"),
      galaxy: "después de la Espada galáctica",
      chest: (n) => `Cofre del piso ${n}`,
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
      back: "Todos los monstruos",
      missing: "Ese monstruo no está. Estos son todos.",
      statsTitle: "Estadísticas",
      lootTitle: "Botín",
      lootHint: "La probabilidad de cada cosa por monstruo muerto.",
      whereTitle: "Dónde sale",
      nowhere: "En ningún piso.",
      dangerous: "Tiene además una versión más fuerte en el modo peligroso, después del desafío del Sr. Qi.",
      slayerTitle: "Gremio de Aventureros",
      slayerGoal: (n) => `Matá ${n} entre:`,
      reward: "Premio",
      phone: "El teléfono de Marlon, para usar el Servicio de Recuperación de Objetos por teléfono",
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
