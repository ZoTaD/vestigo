/**
 * Los textos de la sección Rust (2026-10-05), en inglés y español. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los nombres del juego (objetos, recetas) no van acá: salen de los datos, con la traducción oficial (es-ES, que es
 * la que trae el juego). Acá va lo nuestro: pestañas, títulos para Google y los textos de la portada.
 */
import { useLang } from "./i18n";
import type { EffectStat, HowKind, LootEvent, LootKind, ModStat, RecyclerKey } from "./rust/items/data";
import type { RustSection, RustTab } from "./route";

/** Las pestañas, en el orden en que se dibujan. */
export const RUST_TABS: RustSection[] = ["home", "items", "raid"];

type Seo = { title: string; description: string };

/**
 * Lo que una ficha de Objetos tiene de verdad, para que su descripción no prometa lo que no hay (384 objetos no se
 * craftean y la mayoría no se vende): receta, tienda y botín/NPC/recolectables. Sin dato, no se promete nada de eso.
 */
export interface RustHas {
  craft?: boolean;
  shop?: boolean;
  loot?: boolean;
}

export interface RustCopy {
  tabs: Record<RustSection, string>;
  soon: string;
  /** Las pestañas de las etapas que vienen: se anuncian apagadas, sin dirección. */
  soonTabs: string[];
  seo: Record<RustSection, Seo>;
  /** El `<head>` de una ficha de Objetos. */
  detailSeo: (name: string, has?: RustHas) => Seo;
  loading: string;
  loadError: string;
  retry: string;
  items: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    all: string;
    cats: Record<string, string>;
    /** Para el lector de pantalla del grupo de filtros por categoría. */
    categories: string;
    /** `n` decide singular o plural; `shown` es la cifra ya formateada en el idioma de la página. */
    count: (n: number, shown: string) => string;
    empty: string;
    missing: string;
    shortname: string;
    itemid: string;
    command: string;
    copy: string;
    copied: string;
    stack: string;
    condition: string;
    repairable: string;
    notRepairable: string;
    craft: string;
    gives: (n: number) => string;
    seconds: (s: string) => string;
    workbench: (n: number) => string;
    noWorkbench: string;
    research: (n: string) => string;
    defaultBp: string;
    usedIn: string;
    recycle: string;
    recycler: string;
    recycleGives: string;
    recyclers: Record<RecyclerKey, string>;
    chance: (pct: number) => string;
    /** Un porcentaje con el espacio del idioma ("50%" / "50 %"). */
    pct: (p: number) => string;
    despawn: string;
    repair: string;
    repairMax: string;
    repairLoss: (pct: string) => string;
    repairBp: string;
    use: string;
    stats: Record<EffectStat, string>;
    mods: Record<ModStat, string>;
    /** "+50 % durante 30 min". */
    modRow: (value: string, duration: string) => string;
    /** Un efecto que se reparte en el tiempo: "en 30 s". */
    overTime: (t: string) => string;
    /** "Se echa a perder en 24 h". */
    spoil: (t: string) => string;
    /** Lo mismo con dos puntos, cuando sigue el enlace al objeto en que queda. */
    spoilInto: (t: string) => string;
    recycleNote: string;
    recycledFrom: string;
    recycledItem: string;
    showRest: (n: string) => string;
    loot: string;
    lootNote: string;
    lootBox: string;
    lootAmount: string;
    lootChance: string;
    lootCond: string;
    kinds: Record<Exclude<LootKind, "box">, string>;
    events: Record<LootEvent, string>;
    contents: string;
    obtained: string;
    turnsInto: string;
    building: string;
    attach: string;
    upkeep: string;
    upkeepNote: string;
    decay: string;
    decayOut: (t: string) => string;
    decayIn: (t: string) => string;
    decayDelay: (t: string) => string;
    decayNote: string;
    detectedBy: string;
    vibration: (n: number) => string;
    skins: (n: string) => string;
    workshop: string;
    how: Record<HowKind, string>;
    perUnit: (pct: string) => string;
    blueprint: string;
    shops: string;
    shopRow: (amount: number, item: string, price: number, currency: string) => string;
    back: string;
  };
  raidBlocks: { toBreak: string; breaks: string; open: string };
  raid: {
    h1: string;
    lede: string;
    pick: string;
    kinds: Record<"building" | "door" | "window" | "external" | "deployable", string>;
    buildingNote: string;
    hp: (n: string) => string;
    add: string;
    remove: string;
    clear: string;
    empty: string;
    result: string;
    explosive: string;
    amount: string;
    sulfur: string;
    gunpowder: string;
    time: string;
    notCraftable: string;
    dud: (pct: number) => string;
    cheapest: string;
    share: string;
    copied: string;
    copyFailed: string;
    table: string;
    tableNote: string;
    minutes: (m: string) => string;
  };
  home: {
    kicker: string;
    h1: string;
    searchLabel: string;
    lede: (items: string, recipes: string) => string;
    slotsTitle: string;
    wipe: { title: string; days: string; hours: string; minutes: string; note: string };
    raidPreview: { title: string; calc: string; table: string; c4: string };
    toolsTitle: string;
    tools: { tab: RustTab; title: string; text: string }[];
    aboutTitle: string;
    about: (items: string, recipes: string) => string[];
  };
}

const EN: RustCopy = {
  tabs: { home: "Home", items: "Items", raid: "Raid" },
  soon: "Soon",
  soonTabs: ["Monuments", "Electricity", "Farming", "Server", "Patches"],
  seo: {
    home: {
      title: "Rust Guide: Items, Crafting, Recycling and Raid Calculator | Vestigo",
      description: "Every Rust item with its crafting recipe, recycling output and where to find it, plus a raid calculator and the countdown to the next forced wipe.",
    },
    items: {
      title: "Rust Items List: Crafting, Recycling and Where to Find Them | Vestigo",
      description: "Every Rust item with its crafting recipe and workbench, what it recycles into, which crates drop it, its shortname and the admin command to spawn it.",
    },
    raid: {
      title: "Rust Raid Calculator: Sulfur Cost for Every Wall and Door | Vestigo",
      description: "How many C4, rockets, satchels or explosive ammo you need for any wall, door or deployable in Rust, the sulfur it costs and the cheapest mix.",
    },
  },
  detailSeo: (name, has = {}) => {
    const parts = [
      ...(has.craft ? ["its recipe, workbench and research cost"] : []),
      ...(has.loot ? ["which crates and NPCs drop it"] : []),
      ...(has.shop ? ["where to buy it"] : []),
    ];
    const tail = parts.length ? ", plus its shortname and spawn command" : "what it is for, its shortname and spawn command";
    return {
      title: `${name} — Rust: Crafting, Recycling and Where to Find It | Vestigo`,
      description: `${has.craft ? `How to craft ${name} in Rust` : `${name} in Rust`}: ${parts.join(", ")}${tail}.`,
    };
  },
  loading: "Loading…",
  loadError: "This page didn't load.",
  retry: "Try again",
  items: {
    h1: "Rust items",
    lede: (n) => `${n} items with their recipe, what they recycle into, where they drop and where to buy them.`,
    search: "Search items",
    searchPlaceholder: "AK, C4, sulfur, rifle.ak…",
    all: "All",
    cats: {
      weapon: "Weapons", construction: "Construction", items: "Items", resources: "Resources", attire: "Attire",
      tool: "Tools", medical: "Medical", food: "Food", ammunition: "Ammo", traps: "Traps", misc: "Misc",
      component: "Components", electrical: "Electrical", fun: "Fun",
    },
    categories: "Categories",
    count: (n, shown) => (n === 1 ? `${shown} item` : `${shown} items`),
    empty: "Nothing matches that search.",
    missing: "That item doesn't exist (or changed its name). Here's the full list.",
    shortname: "Shortname",
    itemid: "Item ID",
    command: "Spawn command",
    copy: "Copy",
    copied: "Copied",
    stack: "Stack",
    condition: "Durability",
    repairable: "repairable",
    notRepairable: "not repairable",
    craft: "Crafting",
    gives: (n) => (n > 1 ? `Makes ${n}` : "Makes 1"),
    seconds: (s) => `${s} s`,
    workbench: (n) => `Workbench level ${n}`,
    noWorkbench: "No workbench",
    research: (n) => `Research: ${n} scrap`,
    defaultBp: "Known from the start",
    usedIn: "Used in",
    recycledFrom: "Recycled from",
    recycledItem: "Item",
    showRest: (n) => `Show the other ${n}`,
    recycle: "Recycling",
    recycler: "Recycler",
    recycleGives: "Gives",
    recyclers: { red: "Red (Power Plant)", green_power: "Green, powered", green: "Green", yellow: "Yellow (safe zone)" },
    chance: (pct) => `${pct}% chance`,
    pct: (p) => `${p}%`,
    despawn: "Despawns after",
    repair: "Repair",
    repairMax: "At the repair bench, from broken to full.",
    repairLoss: (pct) => `Each repair takes ${pct}% off max condition`,
    repairBp: "Needs the blueprint",
    use: "When used",
    stats: {
      calories: "Calories", hydration: "Hydration", poison: "Poison", radiation: "Radiation", bleeding: "Bleeding",
      health: "Health", healthOverTime: "Health over time",
    },
    mods: {
      woodYield: "Wood yield", oreYield: "Ore yield", radiationResistance: "Radiation resistance",
      maxHealth: "Max health", scrapYield: "Scrap yield",
    },
    modRow: (value, duration) => `${value} for ${duration}`,
    overTime: (t) => `over ${t}`,
    spoil: (t) => `Spoils after ${t}`,
    spoilInto: (t) => `Spoils after ${t}:`,
    recycleNote: "“+ 50%” is the chance of getting one more. For an item at full condition: a worn one gives less. The green recycler gives more while the monument's power grid is on, and the red one only works with it.",
    loot: "Where to find it",
    lootNote: "Chance that a crate, NPC or item has at least one. In crates the amount counts all its rolls; for NPCs it is what the slot that gives the most provides. Condition: how worn it comes out.",
    lootBox: "Source",
    lootAmount: "Amount",
    lootChance: "Chance",
    lootCond: "Condition",
    kinds: { npc: "NPC", item: "Opened", collect: "Pick up" },
    events: { xmas: "Christmas", halloween: "Halloween", easter: "Easter" },
    contents: "What's inside",
    obtained: "Obtained from",
    turnsInto: "Turns into",
    building: "Building",
    attach: "Takes",
    upkeep: "Upkeep per day",
    upkeepNote: "From the smallest base to the biggest: the tool cupboard charges more the more pieces the base has.",
    decay: "Decay",
    decayOut: (t) => `Outside: ${t}`,
    decayIn: (t) => `Inside: ${t}`,
    decayDelay: (t) => `Starts after ${t}`,
    decayNote: "Time until it breaks with no upkeep in the tool cupboard.",
    detectedBy: "Detected by",
    vibration: (n) => `vibration level ${n}`,
    skins: (n) => `Skins (${n})`,
    workshop: "Workshop",
    how: { cook: "Cooking or smelting", burn: "Burning", swap: "Using it", mix: "Mixing table" },
    perUnit: (pct) => `${pct} per unit`,
    blueprint: "Blueprint",
    shops: "Where to buy it",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} for ${price} ${currency}`,
    back: "All items",
  },
  raidBlocks: { toBreak: "What it takes to break it", breaks: "What it breaks", open: "Open in the raid calculator" },
  raid: {
    h1: "Rust Raid Calculator",
    lede: "Pick what you want to break and how many: you get how many explosives of each kind it takes, the sulfur it costs and the cheapest mix.",
    pick: "What do you want to break?",
    kinds: { building: "Building", door: "Doors", window: "Windows and bars", external: "External walls", deployable: "Deployables" },
    buildingNote: "Every building piece of a grade has the same health: a stone wall, floor or foundation take the same.",
    hp: (n) => `${n} HP`,
    add: "Add",
    remove: "Remove",
    clear: "Clear",
    empty: "Add something to break and the cost shows up here.",
    result: "What it takes",
    explosive: "Explosive",
    amount: "Amount",
    sulfur: "Sulfur",
    gunpowder: "Gunpowder",
    time: "Craft time",
    notCraftable: "Can't be crafted",
    dud: (pct) => `Fails ${pct}% of the time: bring extra.`,
    cheapest: "Cheapest in sulfur",
    share: "Copy link",
    copied: "Link copied",
    copyFailed: "Couldn't copy: copy it from the address bar",
    table: "Full raid table",
    tableNote: "Explosives needed for one of each, placed right on the target. Duds not counted.",
    minutes: (m) => `${m} min`,
  },
  home: {
    kicker: "Rust",
    h1: "Rust Guide: Items, Crafting & Raids",
    searchLabel: "Find an item",
    lede: (items, recipes) => `${items} items with their crafting, recycling and where they drop, ${recipes} recipes and the raid calculator to know how much sulfur it takes to get in.`,
    slotsTitle: "Most searched",
    wipe: {
      title: "Next forced wipe",
      days: "days",
      hours: "hours",
      minutes: "min",
      note: "First Thursday of every month, when Facepunch ships the update (around 2 pm New York time).",
    },
    raidPreview: { title: "Raid costs", calc: "Calculate", table: "Full table", c4: "C4" },
    toolsTitle: "Tools",
    tools: [
      { tab: "items", title: "Items", text: "Recipe, workbench, recycling, loot and shortname of every item." },
      { tab: "raid", title: "Raid calculator", text: "Explosives and sulfur for any wall, door or deployable." },
    ],
    aboutTitle: "About this guide",
    about: (items, recipes) => [
      `Everything about Rust in one place: ${items} items with their official names, ${recipes} crafting recipes with the workbench and time they need, what each item gives in the recycler and where it drops.`,
      "The raid calculator tells you how many explosives any wall, door or deployable takes and what that costs in sulfur. No account, and every page has a link you can share.",
    ],
  },
};

const ES: RustCopy = {
  tabs: { home: "Portada", items: "Objetos", raid: "Raideo" },
  soon: "Pronto",
  soonTabs: ["Monumentos", "Electricidad", "Granjas", "Servidor", "Parches"],
  seo: {
    home: {
      title: "Rust en español: objetos, crafteo, reciclaje y calculadora de raideo | Vestigo",
      description: "Todos los objetos de Rust con su crafteo, lo que dan al reciclarlos y dónde aparecen, la calculadora de raideo y la cuenta regresiva al próximo wipe.",
    },
    items: {
      title: "Objetos de Rust: crafteo, reciclaje y dónde encontrarlos | Vestigo",
      description: "Todos los objetos de Rust con su receta y banco de trabajo, lo que dan en el reciclador, en qué cajas aparecen, su shortname y el comando para spawnearlos.",
    },
    raid: {
      title: "Calculadora de raideo de Rust: cuánto azufre cuesta cada pared y puerta | Vestigo",
      description: "Cuántos C4, cohetes, cargas de mochila o balas explosivas necesitás para cada pared, puerta o deployable de Rust, el azufre que cuesta y la mezcla más barata.",
    },
  },
  detailSeo: (name, has = {}) => {
    const parts = [
      ...(has.craft ? ["su receta, banco y costo de investigación"] : []),
      ...(has.loot ? ["en qué cajas y NPC aparece"] : []),
      ...(has.shop ? ["dónde comprarlo"] : []),
    ];
    const tail = parts.length ? ", más su shortname y el comando para spawnearlo" : "para qué sirve, su shortname y el comando para spawnearlo";
    return {
      title: `${name} — Rust: crafteo, reciclaje y dónde encontrarlo | Vestigo`,
      description: `${has.craft ? `Cómo craftear ${name} en Rust` : `${name} en Rust`}: ${parts.join(", ")}${tail}.`,
    };
  },
  loading: "Cargando…",
  loadError: "Esta página no cargó.",
  retry: "Reintentar",
  items: {
    h1: "Objetos de Rust",
    lede: (n) => `${n} objetos con su receta, lo que dan al reciclarlos, dónde aparecen y dónde comprarlos.`,
    search: "Buscar objetos",
    searchPlaceholder: "AK, C4, azufre, rifle.ak…",
    all: "Todos",
    cats: {
      weapon: "Armas", construction: "Construcción", items: "Objetos", resources: "Recursos", attire: "Ropa",
      tool: "Herramientas", medical: "Medicina", food: "Comida", ammunition: "Munición", traps: "Trampas",
      misc: "Misceláneos", component: "Componentes", electrical: "Electricidad", fun: "Diversión",
    },
    categories: "Categorías",
    count: (n, shown) => (n === 1 ? `${shown} objeto` : `${shown} objetos`),
    empty: "No hay nada con esa búsqueda.",
    missing: "Ese objeto no existe (o cambió de nombre). Acá está la lista completa.",
    shortname: "Shortname",
    itemid: "ID del objeto",
    command: "Comando para spawnearlo",
    copy: "Copiar",
    copied: "Copiado",
    stack: "Pila",
    condition: "Durabilidad",
    repairable: "se repara",
    notRepairable: "no se repara",
    craft: "Crafteo",
    gives: (n) => (n > 1 ? `Da ${n}` : "Da 1"),
    seconds: (s) => `${s} s`,
    workbench: (n) => `Banco de nivel ${n}`,
    noWorkbench: "Sin banco",
    research: (n) => `Investigar: ${n} de chatarra`,
    defaultBp: "Se sabe desde el principio",
    usedIn: "Se usa en",
    recycledFrom: "Se obtiene reciclando",
    recycledItem: "Objeto",
    showRest: (n) => `Ver las ${n} restantes`,
    recycle: "Reciclaje",
    recycler: "Recicladora",
    recycleGives: "Da",
    recyclers: { red: "Roja (planta de energía)", green_power: "Verde con electricidad", green: "Verde", yellow: "Amarilla (zona segura)" },
    chance: (pct) => `${pct} % de chance`,
    pct: (p) => `${p} %`,
    despawn: "Desaparece del piso en",
    repair: "Reparación",
    repairMax: "En el banco de reparación, de roto a entero.",
    repairLoss: (pct) => `Cada reparación le saca ${pct} % de condición máxima`,
    repairBp: "Pide el plano",
    use: "Al usarlo",
    stats: {
      calories: "Calorías", hydration: "Hidratación", poison: "Veneno", radiation: "Radiación", bleeding: "Sangrado",
      health: "Vida", healthOverTime: "Vida con el tiempo",
    },
    mods: {
      woodYield: "Rendimiento de madera", oreYield: "Rendimiento de mineral", radiationResistance: "Resistencia a la radiación",
      maxHealth: "Vida máxima",
      scrapYield: "Rendimiento de chatarra",
    },
    modRow: (value, duration) => `${value} durante ${duration}`,
    overTime: (t) => `en ${t}`,
    spoil: (t) => `Se echa a perder en ${t}`,
    spoilInto: (t) => `Se echa a perder en ${t}:`,
    recycleNote: "“+ 50 %” es la chance de que salga uno más. Con el objeto entero: uno gastado da menos. La verde rinde más mientras el monumento tiene la red eléctrica prendida, y la roja sólo anda con ella.",
    loot: "Dónde aparece",
    lootNote: "Probabilidad de que una caja, un NPC o un objeto traiga al menos uno. En las cajas la cantidad cuenta todas sus tiradas; en los NPC, es lo que da la ranura que más aporta. Estado: qué tan gastado sale.",
    lootBox: "Dónde",
    lootAmount: "Cantidad",
    lootChance: "Probabilidad",
    lootCond: "Estado",
    kinds: { npc: "NPC", item: "Se abre", collect: "Del suelo" },
    events: { xmas: "Navidad", halloween: "Halloween", easter: "Pascua" },
    contents: "Qué trae",
    obtained: "Se obtiene de",
    turnsInto: "Se convierte en",
    building: "Construcción",
    attach: "Se le puede poner",
    upkeep: "Mantenimiento por día",
    upkeepNote: "De la base más chica a la más grande: el armario cobra más cuantas más piezas tenga la base.",
    decay: "Desgaste",
    decayOut: (t) => `Afuera: ${t}`,
    decayIn: (t) => `Adentro: ${t}`,
    decayDelay: (t) => `Empieza después de ${t}`,
    decayNote: "Lo que tarda en romperse si el armario no tiene con qué pagar el mantenimiento.",
    detectedBy: "Lo detecta",
    vibration: (n) => `nivel de vibración ${n}`,
    skins: (n) => `Skins (${n})`,
    workshop: "Workshop",
    how: { cook: "Cocinando o fundiendo", burn: "Quemándolo", swap: "Usándolo", mix: "Mesa de mezcla" },
    perUnit: (pct) => `${pct} por unidad`,
    blueprint: "Plano",
    shops: "Dónde comprarlo",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} por ${price} de ${currency}`,
    back: "Todos los objetos",
  },
  raidBlocks: { toBreak: "Lo que cuesta romperlo", breaks: "Qué rompe", open: "Abrir en la calculadora de raideo" },
  raid: {
    h1: "Calculadora de raideo de Rust",
    lede: "Elegí qué querés romper y cuántos: te dice cuántos explosivos de cada tipo hacen falta, el azufre que cuesta y la mezcla más barata.",
    pick: "¿Qué querés romper?",
    kinds: { building: "Construcción", door: "Puertas", window: "Ventanas y rejas", external: "Muros externos", deployable: "Deployables" },
    buildingNote: "Todas las piezas de un mismo grado tienen la misma vida: una pared, un piso o un cimiento de piedra cuestan lo mismo.",
    hp: (n) => `${n} de vida`,
    add: "Sumar",
    remove: "Sacar",
    clear: "Vaciar",
    empty: "Sumá algo para romper y acá aparece lo que cuesta.",
    result: "Lo que hace falta",
    explosive: "Explosivo",
    amount: "Cantidad",
    sulfur: "Azufre",
    gunpowder: "Pólvora",
    time: "Tiempo de crafteo",
    notCraftable: "No se craftea",
    dud: (pct) => `Falla el ${pct} % de las veces: llevá de más.`,
    cheapest: "Lo más barato en azufre",
    share: "Copiar link",
    copied: "Link copiado",
    copyFailed: "No se pudo copiar: copialo de la barra de direcciones",
    table: "Tabla completa de raideo",
    tableNote: "Explosivos para romper uno de cada uno, pegados al objetivo. Sin contar las fallas.",
    minutes: (m) => `${m} min`,
  },
  home: {
    kicker: "Rust",
    h1: "Guía de Rust en español",
    searchLabel: "Buscar un objeto",
    lede: (items, recipes) => `${items} objetos con su crafteo, reciclaje y dónde aparecen, ${recipes} recetas y la calculadora de raideo para saber cuánto azufre cuesta entrar.`,
    slotsTitle: "Lo más buscado",
    wipe: {
      title: "Próximo wipe forzado",
      days: "días",
      hours: "horas",
      minutes: "min",
      note: "Primer jueves de cada mes, cuando Facepunch saca la actualización (cerca de las 14 de Nueva York).",
    },
    raidPreview: { title: "Lo que cuesta raidear", calc: "Calcular", table: "Ver tabla", c4: "C4" },
    toolsTitle: "Herramientas",
    tools: [
      { tab: "items", title: "Objetos", text: "Receta, banco, reciclaje, loot y shortname de cada objeto." },
      { tab: "raid", title: "Calculadora de raideo", text: "Explosivos y azufre para cada pared, puerta o deployable." },
    ],
    aboutTitle: "Sobre esta guía",
    about: (items, recipes) => [
      `Todo Rust en un lugar y en español: ${items} objetos con sus nombres oficiales, ${recipes} recetas de crafteo con el banco y el tiempo que piden, lo que da cada objeto en el reciclador y dónde aparece.`,
      "La calculadora de raideo te dice cuántos explosivos lleva cada pared, puerta o deployable y cuánto azufre cuesta. Sin cuenta, y cada página tiene un link para compartir.",
    ],
  },
};

export const RUST_COPY: Record<"en" | "es", RustCopy> = { en: EN, es: ES };
export const useRustCopy = (): RustCopy => RUST_COPY[useLang().lang];
