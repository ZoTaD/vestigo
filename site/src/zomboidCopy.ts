/**
 * Los textos de la sección Project Zomboid (2026-09-30), en inglés y español. Diseño: docs/design/2026-09-30-zomboid.md.
 *
 * Los nombres del juego (objetos, recetas, rasgos, profesiones) no van acá: salen de los datos, con la traducción
 * oficial. Acá va lo nuestro: pestañas, títulos para Google y los textos de la libreta.
 */
import { useLang } from "./i18n";
import type { PzSection, PzTab } from "./route";
import type { Band } from "./zomboid/loot/chance";

/** Las pestañas, en el orden en que se dibujan. Las profesiones no tienen pestaña propia: las muestra "Rasgos". */
export const PZ_TABS: PzSection[] = ["home", "map", "items", "recipes", "crafting", "traits", "planner", "skills", "moodles", "server", "patches"];

type Seo = { title: string; description: string };

/**
 * El nombre de una ficha como va en el `<title>`, la descripción y las migas (2026-09-30), sin espacios de más. Los libros
 * de habilidad van entre comillas y las traducciones del juego a veces dejan un espacio pegado a la comilla por dentro
 * (`Puntería IV: " Tácticas de francotirador"`, `"…y la tierra "`): en el título eso se lee como un hueco doble, y si el
 * nombre ya traía otro espacio al lado, son dos seguidos de verdad. Se colapsa todo espacio repetido (un espacio duro
 * también) y se pelan las comillas por dentro. Sólo para Google y la pestaña del navegador: el nombre que se lee en la
 * ficha es el del juego, tal cual.
 */
export function tidyTitleName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/"([^"]*)"/g, (_, inner: string) => `"${inner.trim()}"`)
    .replace(/“([^”]*)”/g, (_, inner: string) => `“${inner.trim()}”`)
    .trim();
}

/** El nombre de un sello del juego (`map_<nombre>.png`) que ilustra una línea. */
type Stamp = string;

/**
 * Los renglones de números de una ficha de objeto (`zomboid/items/stats.ts` decide cuáles lleva cada tipo). Van por id
 * y no por el campo del juego: un renglón puede juntar varios (daño mín–máx, crítico con su multiplicador).
 *
 * Las etiquetas en español usan las palabras del cartel del juego donde las tiene (Translate/ES_MX: "Aislamiento",
 * "Impermeabilidad", "Infelicidad", "Defensa contra mordiscos"…), así se reconocen al jugar; las que el juego no
 * muestra van con palabras nuestras.
 */
export type PzStatId =
  // Armas cuerpo a cuerpo
  | "skill" | "damage" | "range" | "speed" | "crit" | "sharpness" | "hits" | "twoHanded" | "durability" | "pushBack" | "door"
  | "tree"
  // Armas de fuego (y cargadores)
  | "ammoRef" | "magRef" | "magCap" | "rounds" | "hitChance" | "aim" | "reload" | "recoil" | "noise"
  // Explosivos
  | "blast" | "blastRange" | "fireRange" | "smokeRange" | "noiseRange" | "timer" | "sensor"
  // Ropa y contenedores
  | "body" | "bite" | "scratch" | "bullet" | "insulation" | "wind" | "water" | "vision" | "hearing" | "runSpeed"
  | "combatSpeed" | "fabric" | "capacity" | "weightReduction"
  // Comida, ánimo y remedios
  | "hunger" | "thirst" | "calories" | "carbs" | "fats" | "proteins" | "fresh" | "rotten" | "cook" | "raw"
  | "unhappy" | "boredom" | "stress" | "fatigue" | "pain"
  // Libros
  | "bookSkill" | "bookLevels" | "bookMult" | "pages"
  // Lo demás
  | "fluid" | "uses" | "light" | "bandage" | "alcohol" | "alcoholic" | "transmit" | "battery"
  | "hitChanceMod" | "aimMod" | "recoilMod" | "reloadMod" | "rangeMod";

/** Las familias en que se agrupan los chips de las 77 categorías (ver `zomboid/items/ItemList.tsx`). */
export type PzItemGroup = "weapons" | "wear" | "food" | "tools" | "materials" | "reading" | "other";

/** La pestaña Objetos: la lista (con su texto para Google) y la ficha de cada objeto. */
export interface PzItemsCopy {
  title: string;
  intro: (items: string, variants: string, cats: string, version: string) => string[];
  hand: string;
  weightNote: string;
  search: string;
  searchHint: string;
  chips: string;
  all: string;
  groups: Record<PzItemGroup, string>;
  showing: (shown: string, total: string) => string;
  empty: string;
  variantsN: (n: number) => string;
  notFound: string;
  back: string;
  weight: string;
  /** El nombre en el otro idioma, anotado a mano: quien juega en inglés busca en inglés. */
  otherName: (name: string) => string;
  idTitle: string;
  command: string;
  user: string;
  copy: string;
  copied: string;
  statsTitle: string;
  firstVariant: string;
  variantsTitle: string;
  cols: { name: string; id: string; weight: string; diff: string };
  sameStats: string;
  rel: { makes: string; uses: string; tools: string; fixedWith: string; fixes: string; teaches: string; research: string };
  /** Junto a "Se fabrica con": abre el Planificador de fabricación con este objeto ya pedido. */
  craftLink: string;
  more: (n: number) => string;
  fixUses: (n: string) => string;
  stats: Record<PzStatId, string>;
  yes: string;
  upTo: (n: string) => string;
  days: (n: number, text: string) => string;
  wear: (max: string, oneIn: string | null) => string;
  improvised: string;
  dangerous: string;
  fabrics: Record<string, string>;
  /** "Dónde aparece" (2026-10-01): de dónde sale el objeto, con la chance por mueble y el link al mapa. */
  where: PzWhereCopy;
}

/** La hoja "Dónde aparece" de la ficha de un objeto. */
export interface PzWhereCopy {
  title: string;
  /** Qué significa el número (no de dónde sale): la chance por mueble, en Normal, y que la configuración la escala. */
  note: string;
  rooms: string;
  anywhere: string;
  /** Los otros cuartos del mapa que tienen el mismo botín. */
  alsoAs: (names: string) => string;
  onMap: (n: string) => string;
  seeOne: string;
  stashes: string;
  seeStashes: string;
  zombies: string;
  anyZombie: string;
  maleZombie: string;
  femaleZombie: string;
  outfit: (name: string) => string;
  /** `n` decide el singular ("1 atuendo más"); `text` es el número ya escrito en el idioma de la página. */
  moreOutfits: (n: number, text: string) => string;
  vehicles: string;
  moreVehicles: (n: number, text: string) => string;
  bags: string;
  moreRooms: (n: number, text: string) => string;
  /** Las chances en palabras, de la más alta a la más baja (las bandas de `zomboid/loot/chance.ts`). */
  bands: Record<Band, string>;
  /** Cuándo sale sólo con una condición: en algunos muebles, si el edificio tiene cierto cuarto, junto a ciertos objetos. */
  force: { t: string; r: string; i: string };
}

/** Fabricar (con lo que tenés en la mano) o construir (un mueble, en el lugar): los dos tipos de receta del juego. */
export type PzRecipeKind = "craft" | "build";

/** La pestaña Recetas: la lista (con su texto para Google) y la ficha de cada receta. */
export interface PzRecipesCopy {
  title: string;
  intro: (total: string, craft: string, build: string, cats: string, version: string) => string[];
  hand: string;
  search: string;
  searchHint: string;
  filters: string;
  all: string;
  kinds: Record<PzRecipeKind, string>;
  catsHead: string;
  showing: (shown: string, total: string) => string;
  empty: string;
  /** La nota a lápiz de una fila de construcción. */
  buildMark: string;
  notFound: string;
  back: string;
  otherName: (name: string) => string;
  inputsTitle: string;
  toolsTitle: string;
  /** La nota a lápiz junto a "Herramientas". */
  toolsNote: string;
  outTitle: string;
  reqsTitle: string;
  learnTitle: string;
  /** El tiempo va tal cual lo declara el juego: no está verificado a cuántos segundos equivale. */
  time: string;
  skill: string;
  xp: string;
  station: string;
  none: string;
  anyOf: string;
  anyItem: string;
  anyContainer: string;
  liters: (n: string) => string;
  /** El líquido que va adentro de un recipiente (el de la línea anterior en la receta del juego). */
  holding: (amount: string, fluid: string) => string;
  fluidUsed: string;
  choices: string;
  otherwise: string;
  /** Sólo para el lector de pantalla: lo que dice la flecha entre lo que entra y lo que sale ("Barra de acero da Mazo"). */
  gives: string;
  built: string;
  /** Una receta sin resultado que trabaja sobre un objeto que ponés (teñir una prenda, reparar, abrir una lata). */
  changesItem: string;
  /** Junto a "Qué da": abre el Planificador de fabricación con esta receta ya elegida. */
  craftLink: string;
  noOutput: string;
  known: string;
  learnAny: string;
  byReading: string;
  /** "Al llegar a Herrería 6 y Metalurgia 4": `skills` ya viene unido con `join`. */
  bySkill: (skills: string) => string;
  byResearch: string;
  byTrait: (n: number) => string;
  byProfession: (n: number) => string;
  /** Une una lista con "y" (hacen falta todas) o con "o" (alcanza con una). */
  join: (parts: string[], how: "and" | "or") => string;
  /**
   * La palabra que va antes de `next` en esa unión ("o", o "u" delante de un sonido /o/): para cuando los elementos son
   * enlaces y no texto, y `join` no alcanza. `join` usa esta misma, así que no pueden decir cosas distintas.
   */
  joinWord: (how: "and" | "or", next: string) => string;
  more: (n: number) => string;
}

export interface ZomboidCopy {
  tabs: Record<PzSection, string>;
  soon: string;
  /** La hoja de cualquier pestaña mientras bajan su chunk o sus datos, y qué decir si no llegan. */
  loading: string;
  loadError: string;
  retry: string;
  items: PzItemsCopy;
  recipes: PzRecipesCopy;
  /**
   * La portada y cada pestaña; `detail`, el `<head>` de una ficha de las secciones que las tienen. El título empieza por
   * el nombre de la ficha, que es lo que se busca ("crowbar project zomboid"), y con un nombre de 20 letras entra en
   * los 65 caracteres que Google muestra. Una sección sin plantilla (los parches) usa el de su pestaña.
   *
   * `via` sólo llega en los seis rasgos de profesión que tienen un gemelo que se elige (Herrería, Cocinar…: mismo
   * nombre y misma descripción en el juego): los nombres de las profesiones que lo traen, en el idioma de la página
   * (`via` del índice, ver `site_index` en extract.py). Con eso el <head> de los dos no es el mismo.
   */
  seo: Record<PzSection, Seo> & { detail: Partial<Record<PzTab, (name: string, via?: string[]) => Seo>> };
  home: {
    kicker: (version: string) => string;
    lede: (items: string, recipes: string) => string;
    hand: string;
    notes: { safe: string; nope: string; guns: string };
    haveTitle: string;
    counts: { key: "items" | "recipes" | "skillBooks" | "magazines" | "traits" | "professions" | "moodles"; label: string; stamp: Stamp }[];
    aboutTitle: string;
    about: (version: string, items: string, recipes: string, traits: string, professions: string) => string[];
    /** El renglón de "La libreta" que lleva a Parches: el texto y, aparte, lo que va enlazado. */
    patchesLink: (version: string) => [string, string];
    toolsTitle: string;
    /** `more`: un segundo link del renglón, a una ficha de la herramienta (ver `TOOL_TAB` en ZomboidHome.tsx). */
    tools: { title: string; text: string; stamp: Stamp; more?: string }[];
  };
}

/** "Burger Flipper and Chef" / "Aprendiz de cocina y Cocinero". */
const listOf = (lang: "en" | "es", names: string[]): string => new Intl.ListFormat(lang, { type: "conjunction" }).format(names);

const EN: ZomboidCopy = {
  tabs: {
    home: "Notebook", map: "Map", items: "Items", recipes: "Recipes", crafting: "Crafting", traits: "Traits",
    professions: "Professions", planner: "Character", skills: "Skills", moodles: "Moodles", server: "Server", patches: "Patches",
  },
  soon: "Soon",
  loading: "loading…",
  loadError: "This page couldn't load. Check your connection.",
  retry: "Try again",
  items: {
    title: "Project Zomboid items",
    intro: (items, variants, cats, v) => [
      `All ${items} items in Project Zomboid Build ${v} (${variants} counting variants), in ${cats} categories: weapons, clothing, food, tools, books, furniture and everything you can pick up off the floor.`,
      "Each page has the item's real stats, its item ID with the /additem command ready to copy, the recipes that make it and use it, what repairs it and what it teaches if it's a book or a magazine.",
    ],
    hand: "search in English or Spanish",
    weightNote: "the number on the right is the weight",
    search: "Search an item",
    searchHint: "crowbar, palanca, backpack…",
    chips: "Categories",
    all: "All",
    groups: {
      weapons: "Weapons", wear: "Clothing and bags", food: "Food and outdoors", tools: "Tools and gear",
      materials: "Materials and furniture", reading: "Reading and mementos", other: "Other",
    },
    showing: (shown, total) => `Showing ${shown} of ${total}`,
    empty: "Nothing by that name. Try it in Spanish.",
    variantsN: (n) => `×${n} variants`,
    notFound: "We couldn't find that item. Look for it in the list.",
    back: "All items",
    weight: "Weight",
    otherName: (name) => `in Spanish: ${name}`,
    idTitle: "Item ID",
    command: "Command",
    user: "username",
    copy: "Copy",
    copied: "Copied!",
    statsTitle: "The numbers",
    firstVariant: "for the first variant",
    variantsTitle: "Variants",
    cols: { name: "Name", id: "ID", weight: "Weight", diff: "What changes" },
    sameStats: "same stats",
    rel: {
      makes: "Made with", uses: "Used in", tools: "Tool in", fixedWith: "Repaired with", fixes: "Repairs",
      teaches: "Teaches", research: "Researching it teaches",
    },
    craftLink: "Plan what to gather →",
    more: (n) => `and ${n} more`,
    fixUses: (n) => `uses ${n}`,
    stats: {
      skill: "Skill", damage: "Damage", range: "Range", speed: "Speed", crit: "Critical", sharpness: "Sharpness",
      hits: "Zombies per swing", twoHanded: "Two-handed", durability: "Durability", pushBack: "Push back",
      door: "Door damage", tree: "Tree damage",
      ammoRef: "Ammo", magRef: "Magazine", magCap: "Magazine capacity", rounds: "Capacity", hitChance: "Base hit chance",
      aim: "Aiming time", reload: "Reload time", recoil: "Recoil", noise: "Noise radius",
      blast: "Blast power", blastRange: "Blast radius", fireRange: "Fire radius", smokeRange: "Smoke radius",
      noiseRange: "Noise radius", timer: "Timer", sensor: "Sensor range",
      body: "Slot", bite: "Bite defense", scratch: "Scratch defense", bullet: "Bullet defense",
      insulation: "Insulation", wind: "Wind resistance", water: "Water resistance", vision: "Vision impairment",
      hearing: "Hearing impairment", runSpeed: "Run speed", combatSpeed: "Combat speed", fabric: "Fabric",
      capacity: "Capacity", weightReduction: "Weight reduction",
      hunger: "Hunger", thirst: "Thirst", calories: "Calories", carbs: "Carbohydrates", fats: "Fat", proteins: "Proteins",
      fresh: "Stays fresh", rotten: "Fully rotten after", cook: "Cookable", raw: "Eating it raw", unhappy: "Unhappiness",
      boredom: "Boredom", stress: "Stress", fatigue: "Fatigue", pain: "Pain relief",
      bookSkill: "Skill", bookLevels: "For levels", bookMult: "XP multiplier", pages: "Pages",
      fluid: "Holds", uses: "Uses", light: "Light range", bandage: "Bandage power", alcohol: "Disinfectant power",
      alcoholic: "Soaked in alcohol", transmit: "Transmit range", battery: "Uses batteries", hitChanceMod: "Hit chance",
      aimMod: "Aiming time", recoilMod: "Recoil", reloadMod: "Reload time", rangeMod: "Range",
    },
    yes: "yes",
    upTo: (n) => `up to ${n}`,
    days: (n, text) => `${text} ${n === 1 ? "day" : "days"}`,
    wear: (max, oneIn) => (oneIn ? `${max} · wears 1 in ${oneIn}` : max),
    improvised: "improvised",
    dangerous: "dangerous",
    fabrics: { Cotton: "Cotton", Leather: "Leather", Denim: "Denim" },
    where: {
      title: "Where to find it",
      note: "Chance that one piece of furniture has at least one, with loot set to Normal (for zombies, vehicles and bags: per zombie, per vehicle part or per bag). Your game's loot settings raise or lower it and the best places stay the same, except for the loose clutter some furniture comes with, which those settings don't touch.",
      rooms: "In rooms",
      anywhere: "Anywhere without its own loot",
      alsoAs: (names) => `also: ${names}`,
      onMap: (n) => `${n} on the map`,
      seeOne: "see one on the map",
      stashes: "In stashes",
      seeStashes: "see the stashes on the map",
      zombies: "On zombies",
      anyZombie: "Any zombie",
      maleZombie: "Male zombie",
      femaleZombie: "Female zombie",
      outfit: (name) => `Zombie: ${name}`,
      moreOutfits: (n, text) => `and ${text} more ${n === 1 ? "outfit" : "outfits"}`,
      vehicles: "In vehicles",
      moreVehicles: (n, text) => `and ${text} more ${n === 1 ? "vehicle" : "vehicles"}`,
      bags: "Inside bags and boxes",
      moreRooms: (n, text) => `+${text} ${n === 1 ? "place" : "places"} less likely`,
      bands: { veryCommon: "very common", common: "common", uncommon: "uncommon", rare: "rare", veryRare: "very rare" },
      force: { t: "only in some furniture", r: "only if the building has a certain room", i: "only next to certain objects" },
    },
  },
  recipes: {
    title: "Project Zomboid recipes",
    intro: (total, craft, build, cats, v) => [
      `All ${total} recipes in Project Zomboid Build ${v}: ${craft} crafting recipes and ${build} building recipes, in ${cats} categories, from sawing a log to forging a crowbar or building a kiln.`,
      "Each page has the ingredients and the tools (with every item that works for each one), the time, the required skill, the XP it gives, the workstation and how you learn it: known from the start, from a book or a magazine, by leveling a skill, by researching an item, or with a trait or a profession.",
    ],
    hand: "search in English or Spanish",
    search: "Search a recipe",
    searchHint: "saw log, aserrar, kiln…",
    filters: "Filters",
    all: "All",
    kinds: { craft: "Crafting", build: "Building" },
    catsHead: "Categories",
    showing: (shown, total) => `Showing ${shown} of ${total}`,
    empty: "No recipe by that name. Try it in Spanish.",
    buildMark: "you build it",
    notFound: "We couldn't find that recipe. Look for it in the list.",
    back: "All recipes",
    otherName: (name) => `in Spanish: ${name}`,
    inputsTitle: "Ingredients",
    toolsTitle: "Tools",
    toolsNote: "go back to your inventory",
    outTitle: "Result",
    reqsTitle: "Requirements and XP",
    learnTitle: "How you learn it",
    time: "Time (game units)",
    skill: "Required skill",
    xp: "XP it gives",
    station: "Workstation",
    none: "none",
    anyOf: "any of:",
    anyItem: "any item",
    anyContainer: "any container",
    liters: (n) => `${n}\u00a0L`,
    holding: (amount, fluid) => `with ${amount} of ${fluid}`,
    fluidUsed: "the liquid is used up",
    choices: "Depends on the ingredient:",
    otherwise: "with any other",
    gives: "gives",
    built: "you build it in place",
    changesItem: "Changes the item you use",
    craftLink: "Plan this recipe →",
    noOutput: "No fixed result: it's decided when you make it.",
    known: "You know it from the start.",
    learnAny: "Any one of these is enough:",
    byReading: "Reading",
    bySkill: (skills) => `Reaching ${skills}`,
    byResearch: "Researching",
    byTrait: (n) => (n === 1 ? "With the trait" : "With one of the traits"),
    byProfession: (n) => (n === 1 ? "With the profession" : "With one of the professions"),
    join: (parts, how) =>
      parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${how} ${parts[parts.length - 1]}`,
    joinWord: (how) => how,
    more: (n) => `and ${n} more`,
  },
  seo: {
    home: {
      title: "Project Zomboid Map, Items & Recipes (Build 42) | Vestigo",
      description: "Project Zomboid Build 42 in one place: the Knox County map, every item and recipe with its real stats, traits, professions and a character planner.",
    },
    map: {
      title: "Project Zomboid Map (Build 42): Interactive Knox County | Vestigo",
      description: "Interactive Project Zomboid Build 42 map of Knox County: every building and street, zombie density, vehicle and foraging zones, spawn points and stashes.",
    },
    items: {
      title: "Project Zomboid Items List: Weapons, Clothing, Food | Vestigo",
      description: "Every Project Zomboid Build 42 item with its real stats: weapons, clothing, food, tools and books, the recipes that make and use each one, and its item ID.",
    },
    recipes: {
      title: "Project Zomboid Recipes (Build 42): Ingredients and XP | Vestigo",
      description: "Every Project Zomboid Build 42 crafting recipe: ingredients and tools, time, required skill, the XP it gives, the workstation and how you learn it.",
    },
    crafting: {
      title: "Project Zomboid Crafting Planner: What to Gather | Vestigo",
      description: "Pick what to make in Project Zomboid Build 42 and get the full recipe tree, the materials to gather, the skills and books you need, and where to find them.",
    },
    traits: {
      title: "Project Zomboid Traits (Build 42): Costs and Effects | Vestigo",
      description: "Every Project Zomboid Build 42 trait: point cost, what it does, the skills it boosts, the recipes it grants and the traits it can't be combined with.",
    },
    professions: {
      title: "Project Zomboid Professions: Points and Free Traits | Vestigo",
      description: "Every Project Zomboid Build 42 profession with its points, starting skills, free traits and known recipes, to pick the right one for your run.",
    },
    planner: {
      title: "Project Zomboid Character Planner (Build 42) | Vestigo",
      description: "Plan your Project Zomboid Build 42 character: profession, traits and points, the starting skills and the recipes you know. Free, no account, shareable by link.",
    },
    skills: {
      title: "Project Zomboid Skills, Skill Books and XP Calculator | Vestigo",
      description: "Project Zomboid Build 42 skills: XP per level, which skill book to read at each level, the VHS tapes and TV shows that give XP, and magazines. XP calculator.",
    },
    moodles: {
      title: "Project Zomboid Moodles: What Each One Means | Vestigo",
      description: "Every Project Zomboid moodle with its icon, its levels, what it does to your character and how to get rid of it: bleeding, pain, cold, panic and more.",
    },
    server: {
      title: "Project Zomboid Server Settings & Sandbox Generator | Vestigo",
      description: "Set up your Project Zomboid Build 42 server: every sandbox option explained, the game presets, a paste-your-file editor and the day water and power shut off.",
    },
    patches: {
      title: "Project Zomboid Patch Notes Explained (Build 42) | Vestigo",
      description: "Every Project Zomboid Build 42 patch summarized, and exactly what changed in each item, recipe and trait from one version to the next.",
    },
    detail: {
      items: (name) => ({
        title: `${name} in Project Zomboid: Stats and ID | Vestigo`,
        description: `${name} in Project Zomboid Build 42: its real stats, the item ID with its /additem command, and the recipes that make it and use it.`,
      }),
      recipes: (name) => ({
        title: `${name}: Project Zomboid Crafting Recipe | Vestigo`,
        description: `${name}, a Project Zomboid Build 42 crafting recipe: ingredients and tools, time, required skill, XP given, the workstation and how you learn it.`,
      }),
      traits: (name, via) =>
        via?.length
          ? {
              title: `${name} Profession Trait, Project Zomboid | Vestigo`,
              description: `The ${name} trait from the ${listOf("en", via)} profession${via.length > 1 ? "s" : ""} in Project Zomboid Build 42: what it does, skills it boosts and the traits it conflicts with.`,
            }
          : {
              title: `${name} Trait in Project Zomboid | Vestigo`,
              description: `The ${name} trait in Project Zomboid Build 42: point cost, what it does, skills it boosts, recipes it grants and the traits it conflicts with.`,
            },
      professions: (name) => ({
        title: `${name} Profession in Project Zomboid | Vestigo`,
        description: `The ${name} profession in Project Zomboid Build 42: its points, starting skills, free traits and the recipes it already knows.`,
      }),
      skills: (name) => ({
        title: `${name} in Project Zomboid: Leveling Guide | Vestigo`,
        description: `How to level ${name} in Project Zomboid Build 42: the XP per level, which skill book to read at each level, the VHS tapes and an XP calculator.`,
      }),
      moodles: (name) => ({
        title: `${name} Moodle in Project Zomboid | Vestigo`,
        description: `The ${name} moodle in Project Zomboid: its icon, its levels, what it does to your character and how to get rid of it.`,
      }),
      // Las dos páginas de Servidor: lo que se busca es "project zomboid sandbox presets", con el juego adelante.
      server: (name) => ({
        title: `Project Zomboid ${name} (Build 42) | Vestigo`,
        description: SERVER_DETAIL_DESC.en[name] ?? `${name} for your Project Zomboid Build 42 server: every option with the game's own values, free and with a link to share.`,
      }),
      // Cada versión de Parches (2026-10-02): lo que se busca es "project zomboid 42.21 patch notes". El nombre es la
      // versión ("42.21.1"), no una ficha: la descripción entra en 160 con versiones de hasta tres números. Un build sin
      // número nuevo ("42.22 (build 3)") se come 9 letras más: sin ": What Changed", el título sigue en 65.
      patches: (v) => ({
        title: `Project Zomboid ${v} Patch Notes${v.includes("(build") ? "" : ": What Changed"} | Vestigo`,
        description: `Project Zomboid ${v} in our own words, plus the exact list of items, recipes, traits and sandbox options that changed, with before and after values.`,
      }),
    },
  },
  home: {
    kicker: (v) => `Build ${v} · Knox County, KY`,
    lede: (items, recipes) => `The map with every building and stash, ${items} items, ${recipes} recipes and the planners to last one more day.`,
    hand: "↓ start here",
    notes: { safe: "safe house", nope: "nope!", guns: "guns here?" },
    haveTitle: "What's in here",
    counts: [
      { key: "items", label: "Items", stamp: "axe" },
      { key: "recipes", label: "Recipes", stamp: "hammer" },
      { key: "skillBooks", label: "Skill books", stamp: "book" },
      { key: "magazines", label: "Magazines", stamp: "star" },
      { key: "traits", label: "Traits", stamp: "heart" },
      { key: "professions", label: "Professions", stamp: "wrench" },
      { key: "moodles", label: "Moodles", stamp: "medcross" },
    ],
    aboutTitle: "The notebook",
    about: (v, items, recipes, traits, professions) => [
      `Everything about Project Zomboid Build ${v} in one notebook: the Knox County map, ${items} items with their real stats, ${recipes} crafting and building recipes, ${traits} traits and ${professions} professions.`,
      "Each item leads to the recipes that make and use it and to where it spawns on the map. No account, and every page has a link you can share.",
    ],
    patchesLink: (v) => [`Data from ${v} · `, "What changed in each patch"],
    toolsTitle: "Tools",
    tools: [
      { title: "Map of Knox County", text: "Every building, street, stash and zone, with a link for any spot.", stamp: "house" },
      { title: "Character planner", text: "Profession, traits and points, your starting skills and the recipes you know.", stamp: "facehappy" },
      { title: "What do I need to make…?", text: "The full recipe tree and where to find each thing.", stamp: "gears" },
      { title: "Server settings", text: "Every sandbox option, explained.", stamp: "satellite", more: "The five presets, compared" },
      { title: "Water and power", text: "The exact day they shut off in your world.", stamp: "lightning" },
    ],
  },
};

const ES: ZomboidCopy = {
  tabs: {
    home: "Libreta", map: "Mapa", items: "Objetos", recipes: "Recetas", crafting: "Fabricación", traits: "Rasgos",
    professions: "Profesiones", planner: "Personaje", skills: "Habilidades", moodles: "Moodles", server: "Servidor", patches: "Parches",
  },
  soon: "Pronto",
  loading: "cargando…",
  loadError: "No se pudo cargar esta página. Revisá la conexión.",
  retry: "Reintentar",
  items: {
    title: "Objetos de Project Zomboid",
    intro: (items, variants, cats, v) => [
      `Los ${items} objetos de Project Zomboid Build ${v} (${variants} contando variantes), en ${cats} categorías: armas, ropa, comida, herramientas, libros, muebles y todo lo que se puede levantar del piso.`,
      "Cada ficha tiene sus números reales, el ID con el comando /additem listo para copiar, las recetas con las que se fabrica y en las que se usa, con qué se repara y qué enseña si es un libro o una revista.",
    ],
    hand: "buscá en español o en inglés",
    weightNote: "el número de la derecha es el peso",
    search: "Buscar un objeto",
    searchHint: "palanca, crowbar, mochila…",
    chips: "Categorías",
    all: "Todas",
    groups: {
      weapons: "Armas", wear: "Ropa y bolsos", food: "Comida y campo", tools: "Herramientas y útiles",
      materials: "Materiales y muebles", reading: "Lectura y recuerdos", other: "Otros",
    },
    showing: (shown, total) => `Mostrando ${shown} de ${total}`,
    empty: "Nada con ese nombre. Probá en inglés.",
    variantsN: (n) => `×${n} variantes`,
    notFound: "No encontramos ese objeto. Buscalo en la lista.",
    back: "Todos los objetos",
    weight: "Peso",
    otherName: (name) => `en inglés: ${name}`,
    idTitle: "ID del objeto",
    command: "Comando",
    user: "usuario",
    copy: "Copiar",
    copied: "¡Copiado!",
    statsTitle: "Los números",
    firstVariant: "de la primera variante",
    variantsTitle: "Variantes",
    cols: { name: "Nombre", id: "ID", weight: "Peso", diff: "Lo que cambia" },
    sameStats: "mismos números",
    rel: {
      makes: "Se fabrica con", uses: "Se usa en", tools: "Herramienta en", fixedWith: "Se repara con", fixes: "Repara",
      teaches: "Enseña", research: "Investigándolo aprendés",
    },
    craftLink: "Planificá qué juntar →",
    more: (n) => `y ${n} más`,
    fixUses: (n) => `gasta ${n}`,
    // Las del juego donde las tiene (ver `PzStatId`). Sin género donde el objeto puede ser de cualquiera: "Se conserva
    // 5 días" y no "Fresca durante" (un pan no es fresca), "Comerlo crudo: peligroso" y no "Cruda: peligrosa".
    stats: {
      skill: "Habilidad", damage: "Daño", range: "Alcance", speed: "Velocidad", crit: "Crítico", sharpness: "Afilado",
      hits: "Zombis por golpe", twoHanded: "A dos manos", durability: "Durabilidad", pushBack: "Empuje",
      door: "Daño a puertas", tree: "Daño a árboles",
      ammoRef: "Munición", magRef: "Cargador", magCap: "Capacidad del cargador", rounds: "Capacidad",
      hitChance: "Puntería base", aim: "Tiempo de apuntado", reload: "Tiempo de recarga", recoil: "Retroceso",
      noise: "Radio del ruido",
      blast: "Potencia de la explosión", blastRange: "Radio de la explosión", fireRange: "Radio del fuego",
      smokeRange: "Radio del humo", noiseRange: "Radio del ruido", timer: "Temporizador", sensor: "Alcance del sensor",
      body: "Ocupa el lugar de", bite: "Defensa contra mordiscos", scratch: "Defensa contra rasguños", bullet: "Defensa antibalas",
      insulation: "Aislamiento", wind: "Resistencia al viento", water: "Impermeabilidad", vision: "Visión impedida",
      hearing: "Audición impedida", runSpeed: "Velocidad de carrera", combatSpeed: "Velocidad de combate", fabric: "Tela",
      capacity: "Capacidad", weightReduction: "Reduce el peso",
      hunger: "Hambre", thirst: "Sed", calories: "Calorías", carbs: "Carbohidratos", fats: "Grasa", proteins: "Proteínas",
      fresh: "Se conserva", rotten: "Se pudre del todo a los", cook: "Se cocina", raw: "Comerlo crudo",
      unhappy: "Infelicidad", boredom: "Aburrimiento", stress: "Estrés", fatigue: "Cansancio", pain: "Alivio del dolor",
      bookSkill: "Habilidad", bookLevels: "Sirve para los niveles", bookMult: "Multiplicador de XP", pages: "Páginas",
      fluid: "Le entran", uses: "Usos", light: "Alcance de la luz", bandage: "Poder de venda",
      alcohol: "Poder desinfectante", alcoholic: "Con alcohol", transmit: "Alcance de transmisión", battery: "Usa pilas",
      hitChanceMod: "Puntería", aimMod: "Tiempo de apuntado", recoilMod: "Retroceso", reloadMod: "Tiempo de recarga",
      rangeMod: "Alcance",
    },
    yes: "sí",
    upTo: (n) => `hasta ${n}`,
    days: (n, text) => `${text} ${n === 1 ? "día" : "días"}`,
    wear: (max, oneIn) => (oneIn ? `${max} · desgaste 1 en ${oneIn}` : max),
    improvised: "improvisada",
    dangerous: "peligroso",
    fabrics: { Cotton: "Algodón", Leather: "Cuero", Denim: "Jean" },
    where: {
      title: "Dónde aparece",
      note: "Chance de que un mueble traiga al menos uno, con el botín en Normal (en zombis, vehículos y bolsos, por cada zombi, parte del vehículo o bolso). La configuración de botín de tu partida la sube o la baja y los mejores lugares siguen siendo los mismos, salvo por los cachivaches sueltos que traen algunos muebles, que esa configuración no toca.",
      rooms: "En habitaciones",
      anywhere: "En cualquier lugar sin botín propio",
      alsoAs: (names) => `también: ${names}`,
      onMap: (n) => `${n} en el mapa`,
      seeOne: "ver una en el mapa",
      stashes: "En escondites",
      seeStashes: "ver los escondites en el mapa",
      zombies: "En zombis",
      anyZombie: "Cualquier zombi",
      maleZombie: "Zombi hombre",
      femaleZombie: "Zombi mujer",
      outfit: (name) => `Zombi: ${name}`,
      moreOutfits: (n, text) => `y ${text} ${n === 1 ? "atuendo" : "atuendos"} más`,
      vehicles: "En vehículos",
      moreVehicles: (n, text) => `y ${text} ${n === 1 ? "vehículo" : "vehículos"} más`,
      bags: "Dentro de bolsos y cajas",
      moreRooms: (n, text) => `+${text} ${n === 1 ? "lugar" : "lugares"} con menos chance`,
      bands: { veryCommon: "muy común", common: "común", uncommon: "poco común", rare: "raro", veryRare: "muy raro" },
      force: { t: "sólo en algunos muebles", r: "sólo si el edificio tiene cierto cuarto", i: "sólo junto a ciertos objetos" },
    },
  },
  recipes: {
    title: "Recetas de Project Zomboid",
    intro: (total, craft, build, cats, v) => [
      `Las ${total} recetas de Project Zomboid Build ${v}: ${craft} de fabricación y ${build} de construcción, en ${cats} categorías, desde aserrar un tronco hasta forjar una palanca o levantar un horno.`,
      "Cada ficha tiene los ingredientes y las herramientas (con todos los objetos que sirven para cada uno), el tiempo, la habilidad que pide, la XP que da, la estación de trabajo y cómo se aprende: sabida desde el principio, con un libro o una revista, subiendo una habilidad, investigando un objeto, o con un rasgo o una profesión.",
    ],
    hand: "buscá en español o en inglés",
    search: "Buscar una receta",
    searchHint: "aserrar, saw log, horno…",
    filters: "Filtros",
    all: "Todas",
    kinds: { craft: "Fabricación", build: "Construcción" },
    catsHead: "Categorías",
    showing: (shown, total) => `Mostrando ${shown} de ${total}`,
    empty: "Ninguna receta con ese nombre. Probá en inglés.",
    buildMark: "se construye",
    notFound: "No encontramos esa receta. Buscala en la lista.",
    back: "Todas las recetas",
    otherName: (name) => `en inglés: ${name}`,
    inputsTitle: "Ingredientes",
    toolsTitle: "Herramientas",
    toolsNote: "vuelven a tu inventario",
    outTitle: "Resultado",
    reqsTitle: "Requisitos y XP",
    learnTitle: "Cómo se aprende",
    time: "Tiempo (unidades del juego)",
    skill: "Habilidad requerida",
    xp: "XP que da",
    station: "Estación de trabajo",
    none: "ninguna",
    anyOf: "cualquiera de:",
    anyItem: "cualquier objeto",
    anyContainer: "cualquier recipiente",
    liters: (n) => `${n}\u00a0L`,
    holding: (amount, fluid) => `con ${amount} de ${fluid}`,
    fluidUsed: "el líquido se gasta",
    choices: "Según el ingrediente:",
    otherwise: "con cualquier otro",
    gives: "da",
    built: "se construye en el lugar",
    changesItem: "Modifica el objeto que usás",
    craftLink: "Planificá esta receta →",
    noOutput: "No da un objeto fijo: el resultado se decide al hacerla.",
    known: "La sabés desde el principio.",
    learnAny: "Alcanza con una de estas:",
    byReading: "Leyendo",
    bySkill: (skills) => `Al llegar a ${skills}`,
    byResearch: "Investigando",
    byTrait: (n) => (n === 1 ? "Con el rasgo" : "Con uno de los rasgos"),
    byProfession: (n) => (n === 1 ? "Con la profesión" : "Con una de las profesiones"),
    // "y" pasa a "e" antes de un sonido /i/ ("Herrería e Ingeniería") y "o" a "u" antes de un sonido /o/: con nombres
    // de habilidades puede tocar cualquiera.
    joinWord: (how, next) => (how === "and" ? (/^h?i(?![aeou])/i.test(next) ? "e" : "y") : /^h?o/i.test(next) ? "u" : "o"),
    join: (parts, how) => {
      if (parts.length < 2) return parts.join("");
      const last = parts[parts.length - 1];
      return `${parts.slice(0, -1).join(", ")} ${ES.recipes.joinWord(how, last)} ${last}`;
    },
    more: (n) => `y ${n} más`,
  },
  seo: {
    home: {
      title: "Project Zomboid en español: mapa, objetos y recetas | Vestigo",
      description: "Todo Project Zomboid Build 42 en español: el mapa de Knox County, cada objeto y receta con sus números reales, rasgos, profesiones y planificador de personaje.",
    },
    map: {
      title: "Mapa de Project Zomboid (Build 42): Knox County | Vestigo",
      description: "Mapa interactivo de Project Zomboid Build 42: cada edificio y calle de Knox County, densidad de zombis, zonas de vehículos y de recolección, y escondites.",
    },
    items: {
      title: "Objetos de Project Zomboid: armas, ropa y comida | Vestigo",
      description: "Todos los objetos de Project Zomboid Build 42 con sus números reales: armas, ropa, comida, herramientas y libros, con las recetas que los usan y su ID.",
    },
    recipes: {
      title: "Recetas de Project Zomboid (Build 42): materiales y XP | Vestigo",
      description: "Todas las recetas de Project Zomboid Build 42: ingredientes y herramientas, tiempo, habilidad requerida, XP que dan, estación de trabajo y cómo se aprenden.",
    },
    crafting: {
      title: "Planificador de fabricación de Project Zomboid | Vestigo",
      description: "Elegí qué querés fabricar en Project Zomboid Build 42 y mirá el árbol de recetas, los materiales, los libros y habilidades que hacen falta y dónde conseguirlos.",
    },
    traits: {
      title: "Rasgos de Project Zomboid (Build 42): costos y efectos | Vestigo",
      description: "Todos los rasgos de Project Zomboid Build 42 con su costo en puntos, qué hacen, las habilidades que suben, las recetas que dan y con cuáles no se combinan.",
    },
    professions: {
      title: "Profesiones de Project Zomboid: puntos y rasgos | Vestigo",
      description: "Todas las profesiones de Project Zomboid Build 42: puntos, habilidades iniciales, rasgos gratis y recetas conocidas, para elegir la mejor para tu partida.",
    },
    planner: {
      title: "Planificador de personaje de Project Zomboid (Build 42) | Vestigo",
      description: "Armá tu personaje de Project Zomboid Build 42: profesión, rasgos, puntos, habilidades iniciales y recetas. Gratis, sin cuenta y con link para compartir.",
    },
    skills: {
      title: "Habilidades de Project Zomboid: libros y XP por nivel | Vestigo",
      description: "Habilidades de Project Zomboid Build 42: XP por nivel, qué libro leer en cada tramo, los VHS y programas de TV que dan XP y las revistas. Con calculadora.",
    },
    moodles: {
      title: "Moodles de Project Zomboid: qué significa cada uno | Vestigo",
      description: "Todos los moodles de Project Zomboid con su ícono, sus niveles, qué le hacen a tu personaje y cómo sacártelos de encima: sangrado, dolor, frío, pánico y más.",
    },
    server: {
      title: "Generador de servidor de Project Zomboid (sandbox) | Vestigo",
      description: "Configurá tu servidor de Project Zomboid Build 42: cada opción de sandbox explicada, presets, un editor para pegar tu archivo y cuándo se cortan agua y luz.",
    },
    patches: {
      title: "Notas del parche de Project Zomboid (Build 42) | Vestigo",
      description: "Cada parche de Project Zomboid Build 42 resumido en español, y qué cambió exactamente en cada objeto, receta y rasgo de una versión a la otra.",
    },
    detail: {
      items: (name) => ({
        title: `${name} en Project Zomboid: stats e ID | Vestigo`,
        description: `${name} en Project Zomboid Build 42: sus números reales, el ID con el comando /additem y las recetas con las que se fabrica y en las que se usa.`,
      }),
      recipes: (name) => ({
        title: `${name}: receta de Project Zomboid | Vestigo`,
        description: `${name}, receta de Project Zomboid Build 42: ingredientes, herramientas, tiempo, habilidad, XP que da, estación de trabajo y cómo se aprende.`,
      }),
      // Con "qué habilidades sube, qué recetas da": con el nombre más largo (Conocimiento de la naturaleza, 29 letras) la
      // frase anterior llegaba a 164 caracteres y Google la cortaba.
      traits: (name, via) =>
        via?.length
          ? {
              title: `${name} (de profesión) en Project Zomboid | Vestigo`,
              description: `El rasgo ${name} de ${via.length > 1 ? "las profesiones" : "la profesión"} ${listOf("es", via)} en Project Zomboid Build 42: qué hace, qué habilidades sube y con cuáles no se combina.`,
            }
          : {
              title: `${name}: rasgo de Project Zomboid | Vestigo`,
              description: `El rasgo ${name} de Project Zomboid Build 42: su costo, qué hace, qué habilidades sube, qué recetas da y con cuáles no se combina.`,
            },
      professions: (name) => ({
        title: `${name}: profesión de Project Zomboid | Vestigo`,
        description: `La profesión ${name} de Project Zomboid Build 42: sus puntos, las habilidades con las que arranca, sus rasgos gratis y las recetas que ya sabe.`,
      }),
      skills: (name) => ({
        title: `${name}: habilidad de Project Zomboid | Vestigo`,
        description: `Cómo subir ${name} en Project Zomboid Build 42: la XP por nivel, qué libro leer en cada tramo, los VHS que dan XP y una calculadora de XP.`,
      }),
      moodles: (name) => ({
        title: `${name}: moodle de Project Zomboid | Vestigo`,
        description: `El moodle ${name} de Project Zomboid: su ícono, sus niveles, qué le hace a tu personaje y cómo sacártelo de encima.`,
      }),
      server: (name) => ({
        title: `${name} en Project Zomboid (Build 42) | Vestigo`,
        description: SERVER_DETAIL_DESC.es[name] ?? `${name} para tu servidor de Project Zomboid Build 42: cada opción con los valores del juego, gratis y con link para compartir.`,
      }),
      // Cada versión de Parches (2026-10-02): lo que se busca es "notas del parche 42.21". Con build ("42.22 (build 3)"),
      // sin ": qué cambió", así el título entra en 65; "La 42.22", sin "versión", deja la descripción en 160.
      patches: (v) => ({
        title: `Notas del parche ${v} de Project Zomboid${v.includes("(build") ? "" : ": qué cambió"} | Vestigo`,
        description: `La ${v} de Project Zomboid contada con nuestras palabras, y qué objetos, recetas, rasgos y opciones de sandbox cambiaron, con el antes y el después.`,
      }),
    },
  },
  home: {
    kicker: (v) => `Build ${v} · Knox County, KY`,
    lede: (items, recipes) => `El mapa con cada edificio y escondite, ${items} objetos, ${recipes} recetas y los planificadores para durar un día más. En español.`,
    hand: "↓ empezá por acá",
    notes: { safe: "casa segura", nope: "¡no!", guns: "¿armas acá?" },
    haveTitle: "Lo que hay",
    counts: [
      { key: "items", label: "Objetos", stamp: "axe" },
      { key: "recipes", label: "Recetas", stamp: "hammer" },
      { key: "skillBooks", label: "Libros de habilidad", stamp: "book" },
      { key: "magazines", label: "Revistas", stamp: "star" },
      { key: "traits", label: "Rasgos", stamp: "heart" },
      { key: "professions", label: "Profesiones", stamp: "wrench" },
      { key: "moodles", label: "Moodles", stamp: "medcross" },
    ],
    aboutTitle: "La libreta",
    about: (v, items, recipes, traits, professions) => [
      `Todo Project Zomboid Build ${v} en una libreta: el mapa de Knox County, ${items} objetos con sus números reales, ${recipes} recetas de fabricación y construcción, ${traits} rasgos y ${professions} profesiones.`,
      "Cada objeto lleva a las recetas que lo hacen y lo usan, y a dónde aparece en el mapa. Sin cuenta, y cada página tiene un link para compartir.",
    ],
    patchesLink: (v) => [`Datos de la ${v} · `, "Qué cambió en cada parche"],
    toolsTitle: "Herramientas",
    tools: [
      { title: "Mapa de Knox County", text: "Cada edificio, calle, escondite y zona, con un link para cualquier lugar.", stamp: "house" },
      { title: "Planificador de personaje", text: "Profesión, rasgos y puntos, tus habilidades iniciales y las recetas que sabés.", stamp: "facehappy" },
      { title: "¿Qué necesito para fabricar…?", text: "El árbol completo de recetas y dónde conseguir cada cosa.", stamp: "gears" },
      { title: "Configuración de servidor", text: "Todas las opciones de sandbox, explicadas.", stamp: "satellite", more: "Los cinco presets, comparados" },
      { title: "Agua y luz", text: "El día exacto en que se cortan en tu partida.", stamp: "lightning" },
    ],
  },
};

/**
 * La descripción de cada una de las dos fichas de Servidor, por su nombre en el índice (`SERVER_PAGES` en extract.py,
 * texto nuestro): son páginas distintas y no comparten una plantilla. Un nombre que no esté acá usa la genérica.
 */
const SERVER_DETAIL_DESC: Record<"en" | "es", Record<string, string>> = {
  en: {
    "Sandbox Presets":
      "The five Project Zomboid Build 42 sandbox presets compared option by option: Apocalypse, Outbreak, Extinction, Rising and Six Months Later.",
    "Water and Power Shutoff":
      "When the water and power shut off in Project Zomboid Build 42: the exact in-game date and time for your server or single-player world.",
  },
  es: {
    "Presets de sandbox":
      "Los cinco presets de sandbox de Project Zomboid Build 42 comparados opción por opción: Apocalipsis, Brote inicial, Extinción, En ascenso y 6 meses después.",
    "Cortes de agua y luz":
      "Cuándo se cortan el agua y la luz en Project Zomboid Build 42: la fecha y la hora exactas del juego para tu servidor o tu partida.",
  },
};

export const ZOMBOID_COPY: Record<"en" | "es", ZomboidCopy> = { en: EN, es: ES };
export const useZomboidCopy = (): ZomboidCopy => ZOMBOID_COPY[useLang().lang];
