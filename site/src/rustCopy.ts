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
