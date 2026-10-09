/**
 * Los textos de la pestaña Monumentos de Rust (2026-10-09), en inglés y español. Los nombres de los monumentos y de los
 * objetos salen de los datos.
 */
import { useLang } from "../../i18n";
import type { Card, PowerWhat, RecyclerColor } from "./data";

type Seo = { title: string; description: string };

export interface MonumentsCopy {
  h1: string;
  lede: (n: number) => string;
  back: string;
  missing: string;
  safe: string;
  types: Record<string, string>;
  cards: Record<Card, string>;
  recyclers: Record<RecyclerColor, string>;
  radiation: Record<"minimal" | "low" | "medium" | "high", string>;
  radiationLabel: string;
  noRadiation: string;
  facts: { type: string; tiers: string; size: string; minWorld: string; variants: string; safeZone: string };
  tier: (t: number) => string;
  tierNote: string;
  anyTier: string;
  meters: (a: number, b: number) => string;
  yes: string;
  no: string;
  puzzleTitle: string;
  card: (n: number, color: string) => string;
  fuses: (n: number) => string;
  noPuzzle: string;
  recyclersTitle: string;
  powerTitle: string;
  powerAt: (stage: number, fuses: number) => string;
  power: Record<PowerWhat, string>;
  shopTitle: string;
  shopRow: (amount: number, price: number, currency: string) => string;
  blueprint: string;
  serverNote: string;
  grid: {
    title: string;
    lede: (fuse: string, big: number, small: number) => string;
    stage: (n: number) => string;
    fuses: (n: number) => string;
    note: string;
  };
  apartments: {
    title: string;
    lede: (shops: number) => string;
    room: string;
    cost: string;
    rent: string;
    perDay: (n: number) => string;
    taxTitle: string;
    taxNote: string;
    defaults: string;
  };
  seo: { monument: (name: string) => Seo };
}

const EN: MonumentsCopy = {
  h1: "Rust monuments",
  lede: (n) => `The ${n} monuments on the map with their keycard puzzle, fuses, recyclers, radiation and what the power grid turns on.`,
  back: "All monuments",
  missing: "That monument doesn't exist (or changed its name). Here are all of them.",
  safe: "Safe zone",
  types: {
    cave: "Cave", airport: "Airfield", building: "Building", town: "Town", radtown: "Radtown", lighthouse: "Lighthouse",
    waterwell: "Water well", roadside: "Roadside", mountain: "Mountain", lake: "Lake",
  },
  cards: { green: "Green", blue: "Blue", red: "Red" },
  recyclers: { green: "Green", yellow: "Yellow (safe zone)", red: "Red (Power Plant)" },
  radiation: { minimal: "Minimal", low: "Low", medium: "Medium", high: "High" },
  radiationLabel: "Radiation",
  noRadiation: "None",
  facts: { type: "Type", tiers: "Map tier", size: "Size", minWorld: "Smallest map", variants: "Versions", safeZone: "Safe zone" },
  tier: (t) => `Tier ${t}`,
  tierNote: "Tier 0 is the outer ring by the coast and tier 2 the middle of the island.",
  anyTier: "Anywhere",
  meters: (a, b) => `${a} × ${b} m`,
  yes: "Yes",
  no: "No",
  puzzleTitle: "Puzzle",
  card: (n, color) => `${n} × ${color} keycard reader`,
  fuses: (n) => (n === 1 ? "1 fuse slot" : `${n} fuse slots`),
  noPuzzle: "No keycard puzzle.",
  recyclersTitle: "Recyclers",
  powerTitle: "Power grid",
  powerAt: (stage, fuses) => `Stage ${stage} (${fuses} Heavy Fuses)`,
  power: { lootroom: "Opens a loot room", fridge: "Powers a loot fridge", systems: "Powers the monument's systems" },
  shopTitle: "NPC shop",
  shopRow: (amount, price, currency) => `${amount} for ${price} ${currency}`,
  blueprint: "blueprint",
  serverNote: "Which crates and NPCs spawn here is decided by the server and isn't listed.",
  grid: {
    title: "The Power Trip grid",
    lede: (fuse, big, small) => `Players power up the Power Plant by putting ${fuse}s into its two fuse boxes (${big} and ${small} slots). Each stage lights up more of the island:`,
    stage: (n) => `Stage ${n}`,
    fuses: (n) => (n === 1 ? "1 fuse" : `${n} fuses`),
    note: "Fuses wear out, so the grid goes up and down with what players do. With power, green recyclers outside safe zones work better.",
  },
  apartments: {
    title: "Apartments",
    lede: (shops) => `Rent a room from the concierge, paid in scrap every day. The complex also has ${shops} shops players can rent.`,
    room: "Room",
    cost: "To move in",
    rent: "Rent",
    perDay: (n) => `${n} a day`,
    taxTitle: "Paying with resources",
    taxNote: "Scrap value of a full stack of each resource:",
    defaults: "Game defaults: a server can change them.",
  },
  seo: {
    monument: (name) => ({
      title: `${name} — Rust Monument: Keycards, Fuses and Recyclers | Vestigo`,
      description: `${name} in Rust: the keycards and fuses its puzzle needs, recyclers, radiation, safe zone and what the Power Trip grid turns on there.`,
    }),
  },
};

const ES: MonumentsCopy = {
  h1: "Monumentos de Rust",
  lede: (n) => `Los ${n} monumentos del mapa con su puzzle de tarjetas, fusibles, recicladoras, radiación y lo que prende la red eléctrica.`,
  back: "Todos los monumentos",
  missing: "Ese monumento no existe (o cambió de nombre). Acá están todos.",
  safe: "Zona segura",
  types: {
    cave: "Cueva", airport: "Aeródromo", building: "Edificio", town: "Pueblo", radtown: "Radtown", lighthouse: "Faro",
    waterwell: "Pozo", roadside: "Ruta", mountain: "Montaña", lake: "Lago",
  },
  cards: { green: "verde", blue: "azul", red: "roja" },
  recyclers: { green: "Verde", yellow: "Amarilla (zona segura)", red: "Roja (central nuclear)" },
  radiation: { minimal: "Mínima", low: "Baja", medium: "Media", high: "Alta" },
  radiationLabel: "Radiación",
  noRadiation: "No",
  facts: { type: "Tipo", tiers: "Zona del mapa", size: "Tamaño", minWorld: "Mapa mínimo", variants: "Versiones", safeZone: "Zona segura" },
  tier: (t) => `Tier ${t}`,
  tierNote: "El tier 0 es el anillo de afuera, cerca de la costa, y el 2 el centro de la isla.",
  anyTier: "En cualquier lado",
  meters: (a, b) => `${a} × ${b} m`,
  yes: "Sí",
  no: "No",
  puzzleTitle: "Puzzle",
  card: (n, color) => `${n} × lector de tarjeta ${color}`,
  fuses: (n) => (n === 1 ? "1 ranura de fusible" : `${n} ranuras de fusible`),
  noPuzzle: "Sin puzzle de tarjetas.",
  recyclersTitle: "Recicladoras",
  powerTitle: "Red eléctrica",
  powerAt: (stage, fuses) => `Etapa ${stage} (${fuses} Heavy Fuse)`,
  power: { lootroom: "Abre una sala de botín", fridge: "Prende una heladera con botín", systems: "Prende los sistemas del monumento" },
  shopTitle: "Tienda de NPC",
  shopRow: (amount, price, currency) => `${amount} por ${price} de ${currency}`,
  blueprint: "plano",
  serverNote: "Qué cajas y qué NPC aparecen acá lo decide el servidor y no está en esta lista.",
  grid: {
    title: "La red de Power Trip",
    lede: (fuse, big, small) => `Los jugadores prenden la central nuclear poniendo ${fuse} en sus dos cajas de fusibles (de ${big} y ${small} ranuras). Cada etapa prende más cosas en la isla:`,
    stage: (n) => `Etapa ${n}`,
    fuses: (n) => (n === 1 ? "1 fusible" : `${n} fusibles`),
    note: "Los fusibles se gastan, así que la red sube y baja según lo que hagan los jugadores. Con energía, las recicladoras verdes fuera de las zonas seguras rinden más.",
  },
  apartments: {
    title: "Apartamentos",
    lede: (shops) => `Se alquila un cuarto al conserje y se paga en chatarra cada día. El complejo tiene además ${shops} tiendas que pueden alquilar los jugadores.`,
    room: "Cuarto",
    cost: "Para entrar",
    rent: "Alquiler",
    perDay: (n) => `${n} por día`,
    taxTitle: "Pagar con recursos",
    taxNote: "Lo que vale en chatarra una pila completa de cada recurso:",
    defaults: "Valores por defecto del juego: un servidor los puede cambiar.",
  },
  seo: {
    monument: (name) => ({
      title: `${name} en Rust: tarjetas, fusibles y recicladoras del monumento | Vestigo`,
      description: `${name} en Rust: las tarjetas y fusibles de su puzzle, recicladoras, radiación, zona segura y lo que prende ahí la red de Power Trip.`,
    }),
  },
};

export const MONUMENTS_COPY: Record<"en" | "es", MonumentsCopy> = { en: EN, es: ES };
export const useMonumentsCopy = (): MonumentsCopy => MONUMENTS_COPY[useLang().lang];
