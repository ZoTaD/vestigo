/**
 * Los textos de la sección Terraria (2026-10-12), en inglés y español. Fuera de un componente (prerender, buscador de
 * la barra) se usa `TERRARIA_COPY[lang]`; adentro, `useTerrariaCopy()`.
 */
import { useLang } from "./i18n";
import type { TerrariaSection } from "./route";

/** El orden de las pestañas en la regla de profundidad. */
/** De arriba abajo, como las capas del mundo. */
export const TERRARIA_TABS: TerrariaSection[] = ["home", "npcs", "fishing", "items", "crafting", "bosses", "patches"];

export type Kind = "melee" | "ranged" | "magic" | "summon" | "ammo" | "armor" | "accessory" | "tool" | "consumable" | "material" | "block" | "vanity" | "misc";
export const KINDS: Kind[] = ["melee", "ranged", "magic", "summon", "ammo", "armor", "accessory", "tool", "consumable", "material", "block", "vanity", "misc"];

type Seo = { title: string; description: string };
/** Qué tiene una ficha: de ahí sale su título. */
export type TerrariaHas = { craft?: boolean; uses?: boolean; drops?: boolean };

export interface TerrariaCopy {
  /** Cada pestaña: su nombre y la capa del mundo donde vive. */
  tabs: Record<TerrariaSection, string>;
  layers: Record<TerrariaSection, string>;
  /** Las pestañas de las etapas que vienen: se anuncian apagadas, [capa, nombre]. */
  soonTabs: [string, string][];
  soon: string;
  seo: Record<TerrariaSection, Seo>;
  detailSeo: (name: string, has?: TerrariaHas) => Seo;
  /** El título de las notas de una versión. */
  patchSeo: (version: string) => Seo;
  loading: string;
  loadError: string;
  retry: string;
  kinds: Record<Kind, string>;
  rarity: (r: number) => string;
  home: {
    h1: string;
    lede: (items: string, recipes: string) => string;
    searchLabel: string;
    searchPlaceholder: string;
    searchNone: string;
    surface: string;
    surfaceTag: string;
    tools: { tab: TerrariaSection | null; title: string; text: string }[];
    underground: string;
    undergroundTag: (items: string) => string;
    featured: string;
    byKind: string;
    caverns: string;
    cavernsTag: string;
    figures: { items: string; recipes: string; craftable: string; drops: string };
    underworld: string;
    underworldTag: string;
    about: (items: string, recipes: string, version: string) => string[];
  };
  items: {
    h1: string;
    lede: (n: string) => string;
    filterLabel: string;
    all: string;
    anyRarity: string;
    count: (n: string) => string;
    none: string;
    missing: string;
    back: string;
    damage: string;
    defense: string;
    stats: string;
    stat: {
      damage: (cls: string) => string;
      classes: { melee: string; ranged: string; magic: string; summon: string; none: string };
      crit: string;
      speed: string;
      knockback: string;
      defense: string;
      pick: string;
      axe: string;
      hammer: string;
      mana: string;
      healLife: string;
      healMana: string;
      fishing: string;
      bait: string;
      range: string;
      stack: string;
      sell: string;
      rarity: string;
      noValue: string;
    };
    speeds: string[];
    knockbacks: string[];
    coins: [string, string, string, string];
    tags: { consumable: string; material: string; expert: string; master: string; autoReuse: string };
    recipeTitle: string;
    recipesTitle: (n: number) => string;
    makes: (n: number) => string;
    at: string;
    byHand: string;
    flags: string[];
    usesTitle: (n: number) => string;
    needs: (n: number) => string;
    dropsTitle: string;
    dropModes: Record<string, string>;
    openTree: string;
  };
  fishing: {
    h1: string;
    lede: string;
    poles: string;
    polesHint: string;
    baits: string;
    baitsHint: string;
    crates: string;
    cratesHint: string;
    quest: (n: number) => string;
    questHint: string;
  };
  patches: {
    h1: string;
    lede: (n: number) => string;
    english: string;
    changes: (n: string) => string;
    back: string;
    title: (version: string) => string;
  };
  bosses: {
    h1: string;
    lede: string;
    progress: (done: number, total: number) => string;
    reset: string;
    pre: string;
    hard: string;
    defeated: string;
    summon: string;
    unlocks: string;
    stats: { life: string; damage: string; defense: string };
    classic: string;
    drops: string;
    expertOnly: string;
    masterOnly: string;
  };
  npcs: {
    h1: string;
    lede: string;
    biome: string;
    who: string;
    whoHint: string;
    result: string;
    empty: string;
    price: string;
    pylon: string;
    pylonYes: (name: string) => string;
    pylonNo: string;
    pylonRule: string;
    levels: Record<"love" | "like" | "dislike" | "hate", string>;
    factors: { biome: (level: string, biome: string) => string; npc: (level: string, npc: string) => string; solitude: string; crowd: (n: number) => string };
    table: string;
    tableBiomes: string;
    tableNpcs: string;
    clear: string;
  };
  crafting: {
    h1: string;
    lede: string;
    pick: string;
    pickPlaceholder: string;
    unknown: string;
    tryOne: string;
    quantity: string;
    tree: string;
    recipeOf: (i: number, n: number) => string;
    base: string;
    loop: string;
    anyOf: string;
    totals: string;
    stations: string;
    noStations: string;
    collapse: string;
    expand: string;
    openItem: string;
  };
}

const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);
const join = (parts: string[], and: string): string => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}` : parts[0] ?? "");

const RARITY_EN: Record<number, string> = { [-13]: "Master", [-12]: "Expert", [-11]: "Quest", [-1]: "Gray", 0: "White", 1: "Blue", 2: "Green", 3: "Orange", 4: "Light red", 5: "Pink", 6: "Light purple", 7: "Lime", 8: "Yellow", 9: "Cyan", 10: "Red", 11: "Purple" };
const RARITY_ES: Record<number, string> = { [-13]: "Maestro", [-12]: "Experto", [-11]: "Misión", [-1]: "Gris", 0: "Blanco", 1: "Azul", 2: "Verde", 3: "Naranja", 4: "Rojo claro", 5: "Rosa", 6: "Violeta claro", 7: "Lima", 8: "Amarillo", 9: "Cian", 10: "Rojo", 11: "Violeta" };

const EN: TerrariaCopy = {
  tabs: { home: "Home", items: "Items", crafting: "Crafting tree", bosses: "Bosses", npcs: "NPCs", fishing: "Fishing", patches: "Patches" },
  layers: { home: "Sky", npcs: "Surface", fishing: "Ocean", items: "Underground", crafting: "Caverns", bosses: "Underworld", patches: "Space" },
  soonTabs: [["Sky", "Classes"]],
  soon: "Soon",
  seo: {
    home: {
      title: "Terraria Guide: Every Item, Recipe and Crafting Tree | Vestigo",
      description: "Every Terraria 1.4.5 item with its stats, recipe, uses and drops, plus the full crafting tree of anything down to the raw materials.",
    },
    items: {
      title: "Terraria Items List: Stats, Recipes and Drops | Vestigo",
      description: "All Terraria 1.4.5 items by type and rarity: weapons, armor, accessories, tools and materials, each with its stats, recipe and where it drops.",
    },
    fishing: {
      title: "Terraria Fishing: Poles, Bait Power, Crates and Quest Fish | Vestigo",
      description: "Every Terraria fishing pole and bait with its fishing power, all the crates before and after Hardmode, and the quest fish the Angler asks for.",
    },
    patches: {
      title: "Terraria Patch Notes: Every Version's Changelog | Vestigo",
      description: "The full Terraria changelog, version by version, from 1.0.1 to the latest 1.4.5 update: additions, balance changes and bug fixes.",
    },
    bosses: {
      title: "Terraria Boss Checklist: Order, Summons and Drops | Vestigo",
      description: "Every Terraria boss in progression order: how to summon it, its life, damage and defense, what it drops and what beating it unlocks. Tick them off as you go.",
    },
    npcs: {
      title: "Terraria NPC Happiness Calculator: Biomes, Neighbors and Pylons | Vestigo",
      description: "Pick a biome and who lives together and see each Terraria NPC's shop price and whether they sell the pylon, with every NPC's liked biomes and neighbors.",
    },
    crafting: {
      title: "Terraria Crafting Tree Calculator: Every Material You Need | Vestigo",
      description: "Pick any Terraria item and get its whole crafting tree down to the raw materials, with the total of each one and the crafting stations you need.",
    },
  },
  detailSeo: (name, has = {}) => {
    const topics = [...(has.craft ? ["recipe"] : []), "stats", ...(has.uses ? ["uses"] : []), ...(has.drops ? ["drops"] : [])];
    const parts = [
      ...(has.craft ? ["how to craft it and at which station"] : []),
      ...(has.drops ? ["which enemies drop it and how often"] : []),
      ...(has.uses ? ["what you can make with it"] : []),
    ];
    return {
      title: `${name} — Terraria: ${join(topics, "and")} | Vestigo`,
      description: clip(`${name} in Terraria 1.4.5: its stats and rarity${parts.length ? `, ${join(parts, "and")}` : ", sell price and what it is for"}.`),
    };
  },
  patchSeo: (version) => ({
    title: `Terraria ${version} Patch Notes: Changes and Fixes | Vestigo`,
    description: `Everything that changed in Terraria ${version}: new content, balance changes and bug fixes, straight from the game's changelog.`,
  }),
  loading: "Loading…",
  loadError: "The data didn't load.",
  retry: "Try again",
  kinds: { melee: "Melee", ranged: "Ranged", magic: "Magic", summon: "Summon", ammo: "Ammo", armor: "Armor", accessory: "Accessories", tool: "Tools", consumable: "Consumables", material: "Materials", block: "Blocks & furniture", vanity: "Vanity", misc: "Other" },
  rarity: (r) => RARITY_EN[r] ?? RARITY_EN[0],
  home: {
    h1: "Terraria: every item, recipe and crafting tree",
    lede: (items, recipes) => `${items} items and ${recipes} recipes of 1.4.5: what each thing does, how you craft it, where it drops and what to build next.`,
    searchLabel: "Find an item",
    searchPlaceholder: "Terra Blade, Hellstone, wings…",
    searchNone: "Nothing by that name.",
    surface: "Surface",
    surfaceTag: "Start here",
    tools: [
      { tab: "crafting", title: "Crafting tree", text: "Pick an item and get every material, down to the ore." },
      { tab: "items", title: "Item list", text: "Everything by type and rarity, with stats, recipe and drops." },
      { tab: "bosses", title: "Boss checklist", text: "What to fight next, how to summon it and what it drops." },
      { tab: "npcs", title: "NPC happiness", text: "Who lives where, for the best prices and pylons." },
    ],
    underground: "Underground",
    undergroundTag: (items) => `${items} items`,
    featured: "Most searched",
    byKind: "By type",
    caverns: "Caverns",
    cavernsTag: "The numbers",
    figures: { items: "items", recipes: "recipes", craftable: "craftable items", drops: "enemy drops" },
    underworld: "Underworld",
    underworldTag: "What this is",
    about: (items, recipes, version) => [
      `A complete reference for Terraria ${version}: ${items} items with their damage, speed, knockback, defense, rarity and sell price, and the ${recipes} recipes of the game with the crafting station each one needs.`,
      "Every item page lists what it is crafted from, everything it is used in and the enemies that drop it with their drop chance. The crafting tree unfolds any item down to its raw materials and adds up how much of each you have to gather.",
    ],
  },
  items: {
    h1: "Terraria items",
    lede: (n) => `All ${n} items of 1.4.5. Filter by type or rarity, or search by name.`,
    filterLabel: "Search items",
    all: "All",
    anyRarity: "Any rarity",
    count: (n) => `${n} items`,
    none: "Nothing matches.",
    missing: "That item doesn't exist. Here is the full list.",
    back: "All items",
    damage: "damage",
    defense: "defense",
    stats: "Stats",
    stat: {
      damage: (cls) => `${cls} damage`,
      classes: { melee: "Melee", ranged: "Ranged", magic: "Magic", summon: "Summon", none: "" },
      crit: "Critical strike chance",
      speed: "Use speed",
      knockback: "Knockback",
      defense: "Defense",
      pick: "Pickaxe power",
      axe: "Axe power",
      hammer: "Hammer power",
      mana: "Mana cost",
      healLife: "Restores life",
      healMana: "Restores mana",
      fishing: "Fishing power",
      bait: "Bait power",
      range: "Range",
      stack: "Max stack",
      sell: "Sells for",
      rarity: "Rarity",
      noValue: "No value",
    },
    speeds: ["Insanely fast", "Very fast", "Fast", "Average", "Slow", "Very slow", "Extremely slow", "Snail"],
    knockbacks: ["No knockback", "Extremely weak", "Very weak", "Weak", "Average", "Strong", "Very strong", "Extremely strong", "Insane"],
    coins: ["platinum", "gold", "silver", "copper"],
    tags: { consumable: "Consumable", material: "Material", expert: "Expert", master: "Master", autoReuse: "Autoswing" },
    recipeTitle: "Recipe",
    recipesTitle: (n) => `Recipes (${n})`,
    makes: (n) => `Makes ${n}`,
    at: "At",
    byHand: "By hand",
    flags: ["Near water", "Near honey", "Near lava", "In a snow biome", "In a graveyard", "Corruption worlds", "Crimson worlds"],
    usesTitle: (n) => (n === 1 ? "Used in 1 recipe" : `Used in ${n} recipes`),
    needs: (n) => `needs ${n}`,
    dropsTitle: "Dropped by",
    dropModes: { n: "Classic", e: "Expert", m: "Master", "": "" },
    openTree: "See the full crafting tree",
  },
  fishing: {
    h1: "Terraria fishing",
    lede: "Poles, bait, crates and the Angler's quest fish. Fishing power is your pole plus your bait: more power, better catches.",
    poles: "Fishing poles",
    polesHint: "By fishing power, weakest first.",
    baits: "Bait",
    baitsHint: "By bait power, strongest first. Each cast has a chance to use up the bait: the stronger it is, the longer it lasts.",
    crates: "Crates",
    cratesHint: "After Hardmode starts, every crate you fish is its Hardmode version.",
    quest: (n) => `Quest fish (${n})`,
    questHint: "The Angler asks for one of these each day. They can't be sold or stored for later quests.",
  },
  patches: {
    h1: "Terraria patch notes",
    lede: (n) => `The game's changelog, ${n} versions from the first patch to the latest.`,
    english: "",
    changes: (n) => `${n} changes`,
    back: "All versions",
    title: (version) => `Terraria ${version} patch notes`,
  },
  bosses: {
    h1: "Terraria boss checklist",
    lede: "Every boss in the order you usually fight them: how it shows up, what it drops and what it unlocks. Your ticks are saved in this browser.",
    progress: (done, total) => `${done} of ${total} defeated`,
    reset: "Clear ticks",
    pre: "Pre-Hardmode",
    hard: "Hardmode",
    defeated: "Defeated",
    summon: "Summon",
    unlocks: "Unlocks",
    stats: { life: "Life", damage: "Damage", defense: "Defense" },
    classic: "Classic mode values",
    drops: "Drops",
    expertOnly: "Expert",
    masterOnly: "Master",
  },
  npcs: {
    h1: "Terraria NPC happiness calculator",
    lede: "Pick a biome and who lives together. You get each NPC's shop price and whether they sell the pylon there.",
    biome: "Biome",
    who: "Who lives here",
    whoHint: "NPCs within 25 blocks of each other count as neighbors.",
    result: "Prices in this house",
    empty: "Pick at least one NPC.",
    price: "Price",
    pylon: "Pylon",
    pylonYes: (name) => `Sells the ${name}`,
    pylonNo: "No pylon",
    pylonRule: "An NPC sells the biome's pylon when their price is 90% or lower.",
    levels: { love: "loves", like: "likes", dislike: "dislikes", hate: "hates" },
    factors: {
      biome: (level, biome) => `${level} ${biome}`,
      npc: (level, npc) => `${level} the ${npc}`,
      solitude: "few neighbors",
      crowd: (n) => `crowded (${n} neighbors)`,
    },
    table: "What every NPC likes",
    tableBiomes: "Biomes",
    tableNpcs: "Neighbors",
    clear: "Clear",
  },
  crafting: {
    h1: "Terraria crafting tree",
    lede: "Pick an item and get everything it takes, down to the raw materials.",
    pick: "Item to craft",
    pickPlaceholder: "Zenith, Terra Blade, Ankh Shield…",
    unknown: "That item can't be crafted or doesn't exist. Pick another one.",
    tryOne: "Try one of these",
    quantity: "Quantity",
    tree: "Tree",
    recipeOf: (i, n) => `Recipe ${i} of ${n}`,
    base: "raw",
    loop: "loops back",
    anyOf: "Any of",
    totals: "Raw materials",
    stations: "Crafting stations",
    noStations: "Everything is crafted by hand.",
    collapse: "Collapse",
    expand: "Expand",
    openItem: "Open the item page",
  },
};

const ES: TerrariaCopy = {
  tabs: { home: "Portada", items: "Objetos", crafting: "Árbol de crafteo", bosses: "Jefes", npcs: "NPC", fishing: "Pesca", patches: "Parches" },
  layers: { home: "Cielo", npcs: "Superficie", fishing: "Océano", items: "Subsuelo", crafting: "Cavernas", bosses: "Inframundo", patches: "Espacio" },
  soonTabs: [["Cielo", "Clases"]],
  soon: "Pronto",
  seo: {
    home: {
      title: "Guía de Terraria: objetos, recetas y árbol de crafteo | Vestigo",
      description: "Todos los objetos de Terraria 1.4.5 con sus estadísticas, receta, usos y quién los suelta, y el árbol de crafteo completo hasta los materiales base.",
    },
    items: {
      title: "Objetos de Terraria: estadísticas, recetas y botín | Vestigo",
      description: "Todos los objetos de Terraria 1.4.5 por tipo y rareza: armas, armaduras, accesorios, herramientas y materiales, con sus estadísticas, receta y botín.",
    },
    fishing: {
      title: "Pesca en Terraria: cañas, cebos, cajas y peces de misión | Vestigo",
      description: "Todas las cañas y cebos de Terraria con su poder de pesca, las cajas de antes y después del Hardmode, y los peces de misión que pide el Pescador.",
    },
    patches: {
      title: "Parches de Terraria: las notas de cada versión | Vestigo",
      description: "El registro de cambios completo de Terraria, versión por versión, de la 1.0.1 a la última 1.4.5: novedades, cambios de balance y errores corregidos.",
    },
    bosses: {
      title: "Jefes de Terraria: orden, invocación y botín | Vestigo",
      description: "Todos los jefes de Terraria en orden de progresión: cómo invocarlo, su vida, daño y defensa, qué suelta y qué destraba vencerlo. Marcalos a medida que avanzás.",
    },
    npcs: {
      title: "Felicidad de los NPC de Terraria: biomas, vecinos y pilones | Vestigo",
      description: "Elegí un bioma y quiénes viven juntos y mirá el precio de la tienda de cada NPC de Terraria y si vende el pilón, con los biomas y vecinos que prefiere cada uno.",
    },
    crafting: {
      title: "Árbol de crafteo de Terraria: todos los materiales | Vestigo",
      description: "Elegí cualquier objeto de Terraria y mirá su árbol de crafteo completo hasta los materiales base, con el total de cada uno y las estaciones que hacen falta.",
    },
  },
  detailSeo: (name, has = {}) => {
    const topics = [...(has.craft ? ["receta"] : []), "estadísticas", ...(has.uses ? ["usos"] : []), ...(has.drops ? ["botín"] : [])];
    const parts = [
      ...(has.craft ? ["cómo se fabrica y en qué estación"] : []),
      ...(has.drops ? ["qué enemigos lo sueltan y con qué probabilidad"] : []),
      ...(has.uses ? ["qué se puede fabricar con él"] : []),
    ];
    return {
      title: `${name} — Terraria: ${join(topics, "y")} | Vestigo`,
      description: clip(`${name} en Terraria 1.4.5: sus estadísticas y rareza${parts.length ? `, ${join(parts, "y")}` : ", precio de venta y para qué sirve"}.`),
    };
  },
  patchSeo: (version) => ({
    title: `Terraria ${version}: notas del parche, cambios y arreglos | Vestigo`,
    description: `Todo lo que cambió en Terraria ${version}: contenido nuevo, cambios de balance y errores corregidos, del registro de cambios del propio juego.`,
  }),
  loading: "Cargando…",
  loadError: "Los datos no cargaron.",
  retry: "Reintentar",
  kinds: { melee: "Cuerpo a cuerpo", ranged: "A distancia", magic: "Magia", summon: "Invocación", ammo: "Munición", armor: "Armaduras", accessory: "Accesorios", tool: "Herramientas", consumable: "Consumibles", material: "Materiales", block: "Bloques y muebles", vanity: "Vanidad", misc: "Otros" },
  rarity: (r) => RARITY_ES[r] ?? RARITY_ES[0],
  home: {
    h1: "Terraria: objetos, recetas y árbol de crafteo",
    lede: (items, recipes) => `${items} objetos y ${recipes} recetas de la 1.4.5: qué hace cada cosa, cómo se fabrica, quién la suelta y qué construir después.`,
    searchLabel: "Buscar un objeto",
    searchPlaceholder: "Espada Terra, piedra infernal, alas…",
    searchNone: "No hay nada con ese nombre.",
    surface: "Superficie",
    surfaceTag: "Empezá por acá",
    tools: [
      { tab: "crafting", title: "Árbol de crafteo", text: "Elegí un objeto y mirá cada material, hasta el mineral." },
      { tab: "items", title: "Lista de objetos", text: "Todo por tipo y rareza, con estadísticas, receta y botín." },
      { tab: "bosses", title: "Lista de jefes", text: "Con quién pelear después, cómo invocarlo y qué suelta." },
      { tab: "npcs", title: "Felicidad de los NPC", text: "Quién vive dónde, para los mejores precios y pilones." },
    ],
    underground: "Subsuelo",
    undergroundTag: (items) => `${items} objetos`,
    featured: "Los más buscados",
    byKind: "Por tipo",
    caverns: "Cavernas",
    cavernsTag: "Los números",
    figures: { items: "objetos", recipes: "recetas", craftable: "objetos fabricables", drops: "botines de enemigos" },
    underworld: "Inframundo",
    underworldTag: "Qué es esto",
    about: (items, recipes, version) => [
      `Una referencia completa de Terraria ${version}: ${items} objetos con su daño, velocidad, retroceso, defensa, rareza y precio de venta, y las ${recipes} recetas del juego con la estación que pide cada una.`,
      "La ficha de cada objeto dice con qué se fabrica, en todo lo que se usa y qué enemigos lo sueltan, con su probabilidad. El árbol de crafteo despliega cualquier objeto hasta sus materiales base y suma cuánto hay que juntar de cada uno.",
    ],
  },
  items: {
    h1: "Objetos de Terraria",
    lede: (n) => `Los ${n} objetos de la 1.4.5. Filtrá por tipo o rareza, o buscá por nombre.`,
    filterLabel: "Buscar objetos",
    all: "Todos",
    anyRarity: "Cualquier rareza",
    count: (n) => `${n} objetos`,
    none: "No hay coincidencias.",
    missing: "Ese objeto no existe. Acá está la lista completa.",
    back: "Todos los objetos",
    damage: "de daño",
    defense: "de defensa",
    stats: "Estadísticas",
    stat: {
      damage: (cls) => `Daño${cls ? ` ${cls}` : ""}`,
      classes: { melee: "cuerpo a cuerpo", ranged: "a distancia", magic: "mágico", summon: "de invocación", none: "" },
      crit: "Probabilidad de crítico",
      speed: "Velocidad de uso",
      knockback: "Retroceso",
      defense: "Defensa",
      pick: "Poder de pico",
      axe: "Poder de hacha",
      hammer: "Poder de martillo",
      mana: "Costo de maná",
      healLife: "Restaura vida",
      healMana: "Restaura maná",
      fishing: "Poder de pesca",
      bait: "Poder de cebo",
      range: "Alcance",
      stack: "Máximo por pila",
      sell: "Se vende por",
      rarity: "Rareza",
      noValue: "Sin valor",
    },
    speeds: ["Rapidísima", "Muy rápida", "Rápida", "Normal", "Lenta", "Muy lenta", "Lentísima", "De caracol"],
    knockbacks: ["Sin retroceso", "Debilísimo", "Muy débil", "Débil", "Normal", "Fuerte", "Muy fuerte", "Fortísimo", "Descomunal"],
    coins: ["de platino", "de oro", "de plata", "de cobre"],
    tags: { consumable: "Consumible", material: "Material", expert: "Experto", master: "Maestro", autoReuse: "Uso continuo" },
    recipeTitle: "Receta",
    recipesTitle: (n) => `Recetas (${n})`,
    makes: (n) => `Salen ${n}`,
    at: "En",
    byHand: "A mano",
    flags: ["Cerca de agua", "Cerca de miel", "Cerca de lava", "En un bioma de nieve", "En un cementerio", "Mundos con Corrupción", "Mundos con Carmesí"],
    usesTitle: (n) => (n === 1 ? "Se usa en 1 receta" : `Se usa en ${n} recetas`),
    needs: (n) => `pide ${n}`,
    dropsTitle: "Lo sueltan",
    dropModes: { n: "Clásico", e: "Experto", m: "Maestro", "": "" },
    openTree: "Ver el árbol de crafteo completo",
  },
  fishing: {
    h1: "Pesca en Terraria",
    lede: "Cañas, cebos, cajas y los peces de misión del Pescador. El poder de pesca es el de tu caña más el de tu cebo: con más poder, mejores capturas.",
    poles: "Cañas de pescar",
    polesHint: "Por poder de pesca, de la más floja a la mejor.",
    baits: "Cebos",
    baitsHint: "Por poder de cebo, del más fuerte al más flojo. Cada lanzamiento puede gastar el cebo: cuanto más fuerte, más dura.",
    crates: "Cajas",
    cratesHint: "Cuando empieza el Hardmode, cada caja que pescás es su versión de Hardmode.",
    quest: (n) => `Peces de misión (${n})`,
    questHint: "El Pescador pide uno por día. No se pueden vender ni guardar para otra misión.",
  },
  patches: {
    h1: "Parches de Terraria",
    lede: (n) => `El registro de cambios del juego: ${n} versiones, del primer parche al último.`,
    english: "Las notas son las originales del juego, en inglés.",
    changes: (n) => `${n} cambios`,
    back: "Todas las versiones",
    title: (version) => `Notas del parche ${version} de Terraria`,
  },
  bosses: {
    h1: "Jefes de Terraria",
    lede: "Todos los jefes en el orden en que se suelen pelear: cómo aparece cada uno, qué suelta y qué destraba. Tus marcas se guardan en este navegador.",
    progress: (done, total) => `${done} de ${total} vencidos`,
    reset: "Borrar marcas",
    pre: "Antes del Hardmode",
    hard: "Hardmode",
    defeated: "Vencido",
    summon: "Invocación",
    unlocks: "Destraba",
    stats: { life: "Vida", damage: "Daño", defense: "Defensa" },
    classic: "Valores del modo Clásico",
    drops: "Botín",
    expertOnly: "Experto",
    masterOnly: "Maestro",
  },
  npcs: {
    h1: "Felicidad de los NPC de Terraria",
    lede: "Elegí un bioma y quiénes viven juntos. Sale el precio de la tienda de cada NPC y si vende el pilón de ese bioma.",
    biome: "Bioma",
    who: "Quiénes viven acá",
    whoHint: "Los NPC a 25 bloques o menos entre sí cuentan como vecinos.",
    result: "Precios en esta casa",
    empty: "Elegí al menos un NPC.",
    price: "Precio",
    pylon: "Pilón",
    pylonYes: (name) => `Vende: ${name}`,
    pylonNo: "Sin pilón",
    pylonRule: "Un NPC vende el pilón del bioma cuando su precio es del 90 % o menos.",
    levels: { love: "adora", like: "le gusta", dislike: "no le gusta", hate: "odia" },
    factors: {
      biome: (level, biome) => `${level}: ${biome}`,
      npc: (level, npc) => `${level}: ${npc}`,
      solitude: "pocos vecinos",
      crowd: (n) => `amontonado (${n} vecinos)`,
    },
    table: "Qué prefiere cada NPC",
    tableBiomes: "Biomas",
    tableNpcs: "Vecinos",
    clear: "Limpiar",
  },
  crafting: {
    h1: "Árbol de crafteo de Terraria",
    lede: "Elegí un objeto y mirá todo lo que lleva, hasta los materiales base.",
    pick: "Objeto a fabricar",
    pickPlaceholder: "Cénit, Espada Terra, Escudo de Ankh…",
    unknown: "Ese objeto no se fabrica o no existe. Elegí otro.",
    tryOne: "Probá con uno de estos",
    quantity: "Cantidad",
    tree: "Árbol",
    recipeOf: (i, n) => `Receta ${i} de ${n}`,
    base: "base",
    loop: "vuelve atrás",
    anyOf: "Cualquiera de",
    totals: "Materiales base",
    stations: "Estaciones de crafteo",
    noStations: "Todo se fabrica a mano.",
    collapse: "Plegar",
    expand: "Desplegar",
    openItem: "Abrir la ficha",
  },
};

export const TERRARIA_COPY: Record<"en" | "es", TerrariaCopy> = { en: EN, es: ES };
export const useTerrariaCopy = (): TerrariaCopy => TERRARIA_COPY[useLang().lang];
