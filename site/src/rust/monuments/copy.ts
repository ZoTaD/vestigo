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
  spawns: {
    lootTitle: string;
    npcTitle: string;
    pickupTitle: string;
    note: string;
    respawn: (a: number, b: number) => string;
    byTier: string;
    variants: string;
    power: string;
    about: (avg: string) => string;
    loading: string;
    failed: string;
    noLoot: string;
    item: string;
    amount: string;
    chance: string;
    tableNote: string;
    events: Record<string, string>;
  };
  grid: {
    title: string;
    lede: (fuse: string, big: number, small: number) => string;
    stage: (n: number) => string;
    fuses: (n: number) => string;
    note: string;
    wear: (worst: number, time: string, slow: string, popHi: number, popLo: number, times: number) => string;
  };
  apartments: {
    title: string;
    lede: (shops: number) => string;
    room: string;
    cost: string;
    rent: string;
    perDay: (n: number) => string;
    taxTitle: string;
    taxNote: (scale: number) => string;
    freeHours: (h: number) => string;
    evict: (h: number) => string;
    masterKey: (n: number) => string;
    shopsTitle: string;
    shopOpen: (total: number, fee: number, hours: number, perHour: number) => string;
    shopTakeover: (h: number) => string;
    defaults: string;
  };
  seo: { monument: (name: string) => Seo };
}

const EN: MonumentsCopy = {
  h1: "Rust monuments",
  lede: (n) => `The ${n} monuments on the map with the crates and NPCs that spawn there, their keycard puzzle, fuses, recyclers, radiation and what the power grid turns on.`,
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
  spawns: {
    lootTitle: "Crates and barrels",
    npcTitle: "NPCs",
    pickupTitle: "On the ground",
    note: "With the monument full. Each spot picks one crate at random, so the number is a range and ≈ is the average. Open a crate to see its loot.",
    respawn: (a, b) => (a === b ? `Crates come back ${a} min after being looted.` : `Crates come back ${a}–${b} min after being looted.`),
    byTier: "The crates change with the map tier where the monument spawns; the range covers every tier.",
    variants: "Counted on the first version of the monument; the others can change a little.",
    power: "with power",
    about: (avg) => `≈ ${avg}`,
    loading: "Loading…",
    failed: "Couldn't load the loot. Close it and open it again.",
    noLoot: "Drops no loot.",
    item: "Item",
    amount: "Amount",
    chance: "Chance",
    tableNote: "Chance that one brings at least one.",
    events: { xmas: "Christmas", halloween: "Halloween", easter: "Easter" },
  },
  grid: {
    title: "The Power Trip grid",
    lede: (fuse, big, small) => `Players power up the Power Plant by putting ${fuse}s into its two fuse boxes (${big} and ${small} slots). Each stage lights up more of the island:`,
    stage: (n) => `Stage ${n}`,
    fuses: (n) => (n === 1 ? "1 fuse" : `${n} fuses`),
    note: "With power, green recyclers outside safe zones work better.",
    wear: (worst, time, slow, popHi, popLo, times) =>
      `Fuses wear out, so the grid goes up and down with what players do. The ${worst} most worn last ${time} with ${popHi} or more players online (${times} times as long with ${popLo} or fewer); the rest wear at ${slow} of that speed.`,
  },
  apartments: {
    title: "Apartments",
    lede: (shops) => `Rent a room from the concierge, paid in scrap every day. The complex also has ${shops} shops players can rent.`,
    room: "Room",
    cost: "To move in",
    rent: "Rent",
    perDay: (n) => `${n} a day`,
    taxTitle: "Resource tax",
    taxNote: (scale) =>
      scale > 0
        ? `Each day the rent adds this much scrap (×${scale}) per full stack of each resource kept in the room or carried by its tenants nearby:`
        : "Off by default. A server can turn it on: then each day the rent adds this much scrap per full stack of each resource kept in the room or carried by its tenants nearby.",
    freeHours: (h) => `The first ${h} hours are free.`,
    evict: (h) => `Unpaid for ${h} hours, the room is lost along with what's inside.`,
    masterKey: (n) => `The security guard sells a master key for ${n} scrap.`,
    shopsTitle: "Rentable shops",
    shopOpen: (total, fee, hours, perHour) =>
      `Opening one costs ${total} scrap: ${fee} up front plus ${hours} hours of rent at ${perHour} an hour. After that it's ${perHour} scrap an hour, taken from the shop's vending machine; if it runs out, the shop closes.`,
    shopTakeover: (h) =>
      `Another player's shop can be taken over by paying double, except in its first ${h} hours. Each takeover adds 1× to the price and the rent.`,
    defaults: "Game defaults: a server can change them.",
  },
  seo: {
    monument: (name) => ({
      title: `${name} — Rust Monument: Loot, Keycards and Fuses | Vestigo`,
      description: `${name} in Rust: the crates and NPCs that spawn, keycards and fuses for the puzzle, recyclers, radiation and what the Power Trip grid powers.`,
    }),
  },
};

const ES: MonumentsCopy = {
  h1: "Monumentos de Rust",
  lede: (n) => `Los ${n} monumentos del mapa con las cajas y los NPC que aparecen, su puzzle de tarjetas, fusibles, recicladoras, radiación y lo que prende la red eléctrica.`,
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
  spawns: {
    lootTitle: "Cajas y barriles",
    npcTitle: "NPC",
    pickupTitle: "En el suelo",
    note: "Con el monumento lleno. Cada lugar elige una caja al azar, así que el número es un rango y ≈ el promedio. Abrí una caja para ver su botín.",
    respawn: (a, b) => (a === b ? `Las cajas vuelven ${a} min después de saquearlas.` : `Las cajas vuelven entre ${a} y ${b} min después de saquearlas.`),
    byTier: "Las cajas cambian según el tier del mapa donde cae el monumento; el rango los cubre a todos.",
    variants: "Contado en la primera versión del monumento; las otras pueden cambiar un poco.",
    power: "con energía",
    about: (avg) => `≈ ${avg}`,
    loading: "Cargando…",
    failed: "No se pudo cargar el botín. Cerrala y abrila de nuevo.",
    noLoot: "No deja botín.",
    item: "Objeto",
    amount: "Cantidad",
    chance: "Probabilidad",
    tableNote: "Probabilidad de que una traiga al menos uno.",
    events: { xmas: "Navidad", halloween: "Halloween", easter: "Pascua" },
  },
  grid: {
    title: "La red de Power Trip",
    lede: (fuse, big, small) => `Los jugadores prenden la central nuclear poniendo ${fuse} en sus dos cajas de fusibles (de ${big} y ${small} ranuras). Cada etapa prende más cosas en la isla:`,
    stage: (n) => `Etapa ${n}`,
    fuses: (n) => (n === 1 ? "1 fusible" : `${n} fusibles`),
    note: "Con energía, las recicladoras verdes fuera de las zonas seguras rinden más.",
    wear: (worst, time, slow, popHi, popLo, times) =>
      `Los fusibles se gastan, así que la red sube y baja según lo que hagan los jugadores. Los ${worst} más gastados duran ${time} con ${popHi} jugadores o más en el servidor (${times} veces más con ${popLo} o menos); el resto se gasta al ${slow} de esa velocidad.`,
  },
  apartments: {
    title: "Apartamentos",
    lede: (shops) => `Se alquila un cuarto al conserje y se paga en chatarra cada día. El complejo tiene además ${shops} tiendas que pueden alquilar los jugadores.`,
    room: "Cuarto",
    cost: "Para entrar",
    rent: "Alquiler",
    perDay: (n) => `${n} por día`,
    taxTitle: "Impuesto por recursos",
    taxNote: (scale) =>
      scale > 0
        ? `Cada día el alquiler suma esta chatarra (×${scale}) por cada pila completa de cada recurso guardada en el cuarto o encima de sus inquilinos cerca:`
        : "Apagado por defecto. Un servidor lo puede prender: entonces cada día el alquiler suma esta chatarra por cada pila completa de cada recurso guardada en el cuarto o encima de sus inquilinos cerca.",
    freeHours: (h) => `Las primeras ${h} horas son gratis.`,
    evict: (h) => `Con ${h} horas sin pagar se pierde el cuarto y lo que hay adentro.`,
    masterKey: (n) => `El guardia de seguridad vende una llave maestra por ${n} de chatarra.`,
    shopsTitle: "Tiendas alquilables",
    shopOpen: (total, fee, hours, perHour) =>
      `Abrir una cuesta ${total} de chatarra: ${fee} de entrada más ${hours} horas de alquiler a ${perHour} por hora. Después son ${perHour} de chatarra por hora, que se sacan de la máquina expendedora de la tienda; si se acaba, la tienda cierra.`,
    shopTakeover: (h) =>
      `La tienda de otro jugador se puede quitar pagando el doble, salvo en sus primeras ${h} horas. Cada vez que cambia de dueño suma 1× al precio y al alquiler.`,
    defaults: "Valores por defecto del juego: un servidor los puede cambiar.",
  },
  seo: {
    monument: (name) => ({
      title: `${name} en Rust: botín, tarjetas y fusibles del monumento | Vestigo`,
      description: `${name} en Rust: cajas y NPC que aparecen, tarjetas y fusibles del puzzle, recicladoras, radiación y lo que prende la red de Power Trip.`,
    }),
  },
};

export const MONUMENTS_COPY: Record<"en" | "es", MonumentsCopy> = { en: EN, es: ES };
export const useMonumentsCopy = (): MonumentsCopy => MONUMENTS_COPY[useLang().lang];
