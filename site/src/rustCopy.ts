/**
 * Los textos de la sección Rust (2026-10-05), en inglés y español. Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los nombres del juego (objetos, recetas) no van acá: salen de los datos, con la traducción oficial (es-ES, que es
 * la que trae el juego). Acá va lo nuestro: pestañas, títulos para Google y los textos de la portada.
 */
import { useLang } from "./i18n";
import type { RustSection, RustTab } from "./route";

/** Las pestañas, en el orden en que se dibujan. */
export const RUST_TABS: RustSection[] = ["home", "items", "raid"];

type Seo = { title: string; description: string };

export interface RustCopy {
  tabs: Record<RustSection, string>;
  soon: string;
  /** Las pestañas de las etapas que vienen: se anuncian apagadas, sin dirección. */
  soonTabs: string[];
  seo: Record<RustSection, Seo>;
  /** El `<head>` de una ficha de Objetos. */
  detailSeo: (name: string) => Seo;
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
    recycleMonument: string;
    recycleSafe: string;
    chance: (pct: number) => string;
    loot: string;
    lootNote: string;
    lootBox: string;
    lootAmount: string;
    lootChance: string;
    blueprint: string;
    shops: string;
    shopRow: (amount: number, item: string, price: number, currency: string) => string;
    back: string;
  };
  home: {
    kicker: string;
    lede: (items: string, recipes: string) => string;
    slotsTitle: string;
    wipe: { title: string; days: string; hours: string; minutes: string; note: string };
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
  detailSeo: (name) => ({
    title: `${name} — Rust: Crafting, Recycling and Where to Find It | Vestigo`,
    description: `How to craft ${name} in Rust: recipe, workbench and research cost, what it recycles into, which crates drop it, where to buy it, and its shortname and spawn command.`,
  }),
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
    recycle: "Recycling",
    recycleMonument: "Monument recycler",
    recycleSafe: "Safe zone recycler",
    chance: (pct) => `${pct}% chance`,
    loot: "Where to find it",
    lootNote: "Chance that one container has at least one.",
    lootBox: "Container",
    lootAmount: "Amount",
    lootChance: "Chance",
    blueprint: "Blueprint",
    shops: "Where to buy it",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} for ${price} ${currency}`,
    back: "All items",
  },
  home: {
    kicker: "Rust guide",
    lede: (items, recipes) => `${items} items with their crafting, recycling and where they drop, ${recipes} recipes and the raid calculator to know how much sulfur it takes to get in.`,
    slotsTitle: "Most searched",
    wipe: {
      title: "Next forced wipe",
      days: "days",
      hours: "hours",
      minutes: "min",
      note: "First Thursday of every month, when Facepunch ships the update (around 2 pm New York time).",
    },
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
  detailSeo: (name) => ({
    title: `${name} — Rust: crafteo, reciclaje y dónde encontrarlo | Vestigo`,
    description: `Cómo craftear ${name} en Rust: receta, banco y costo de investigación, lo que da al reciclarlo, en qué cajas aparece, dónde comprarlo, su shortname y el comando para spawnearlo.`,
  }),
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
    recycle: "Reciclaje",
    recycleMonument: "Recicladora de monumento",
    recycleSafe: "Recicladora de zona segura",
    chance: (pct) => `${pct} % de chance`,
    loot: "Dónde aparece",
    lootNote: "Probabilidad de que una caja traiga al menos uno.",
    lootBox: "Caja",
    lootAmount: "Cantidad",
    lootChance: "Probabilidad",
    blueprint: "Plano",
    shops: "Dónde comprarlo",
    shopRow: (amount, item, price, currency) => `${amount} × ${item} por ${price} de ${currency}`,
    back: "Todos los objetos",
  },
  home: {
    kicker: "Guía de Rust en español",
    lede: (items, recipes) => `${items} objetos con su crafteo, reciclaje y dónde aparecen, ${recipes} recetas y la calculadora de raideo para saber cuánto azufre cuesta entrar.`,
    slotsTitle: "Lo más buscado",
    wipe: {
      title: "Próximo wipe forzado",
      days: "días",
      hours: "horas",
      minutes: "min",
      note: "Primer jueves de cada mes, cuando Facepunch saca la actualización (cerca de las 14 de Nueva York).",
    },
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
