/**
 * Los textos de la sección Warframe (2026-10-27), en inglés y español. Fuera de un componente (prerender, buscador de
 * la barra) se usa `WF_COPY[lang]`; adentro, `useWfCopy()`.
 *
 * Acá van sólo los textos de la interfaz del sitio. Los nombres, descripciones y estadísticas de las cosas del juego
 * salen siempre del export oficial (`_en` y `_es`), en los datos. Las excepciones son las rarezas, las polaridades, los
 * tipos de daño y las eras de reliquia, que la interfaz nombra sin dato al lado.
 */
import { useLang } from "./i18n";
import type { WfSection, WfTab } from "./route";

/** El orden de las pestañas en la barra. */
export const WF_TABS: WfSection[] = ["home", "arsenal", "relics", "farming", "mods"];

/** Las rarezas de un mod, como las deja `site_data.py` (`r.title()`). */
export type WfRarity = "Common" | "Uncommon" | "Rare" | "Legendary";
/** Las polaridades de `POLARITIES` en `site_data.py`. */
export type WfPolarity = "madurai" | "vazarin" | "naramon" | "zenurik" | "unairu" | "umbra" | "penjaga" | "universal" | "any";
/** Los tipos de daño de `DAMAGE_TYPES` en `site_data.py`, en el mismo orden. */
export type WfDamage =
  | "impact" | "puncture" | "slash" | "heat" | "cold" | "electricity" | "toxin" | "blast" | "radiation" | "gas"
  | "magnetic" | "viral" | "corrosive" | "void" | "tau" | "cinematic" | "shield_drain" | "health_drain" | "energy_drain" | "true";
/** Las eras de reliquia (`ERAS` en `site_data.py`) y Omnia, que sólo aparece en las fisuras en vivo. */
export type WfEra = "Lith" | "Meso" | "Neo" | "Axi" | "Requiem" | "Vanguard" | "Omnia";

/** Los tipos del Arsenal (`kind` en `site_data.py`), en el orden de los chips. */
export type WfKind = "warframe" | "primary" | "secondary" | "melee" | "archwing" | "companion" | "exalted";
export const WF_KINDS: WfKind[] = ["warframe", "primary", "secondary", "melee", "archwing", "companion", "exalted"];

type Seo = { title: string; description: string };

export interface WfCopy {
  tabs: Record<WfSection, string>;
  /** La insignia de una pestaña que todavía no tiene página. */
  soon: string;
  loading: string;
  loadError: string;
  retry: string;
  seo: Record<WfSection, Seo>;
  home: {
    kicker: string;
    h1: string;
    lede: (arsenal: string, relics: string, farming: string, mods: string) => string;
    /** Qué hay en cada pestaña: la tarjeta de la portada. */
    cards: Record<WfTab, string>;
    live: {
      heading: string;
      cycles: string;
      cetus: string;
      vallis: string;
      cambion: string;
      /** Cada ciclo: el estado. */
      state: { day: string; night: string; warm: string; cold: string; fass: string; vome: string };
      left: (time: string) => string;
      baro: string;
      baroHere: (time: string) => string;
      baroSoon: (time: string) => string;
      fissures: string;
      fissuresNone: string;
      steel: string;
      sortie: string;
      sortieBoss: (boss: string) => string;
    };
    about: string;
  };
  arsenal: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    kind: string;
    all: string;
    kinds: Record<WfKind, string>;
    prime: string;
    count: (n: string) => string;
    none: string;
    missing: string;
    /** El rango de maestría que pide. */
    mastery: (n: number) => string;
    /** El texto del plano principal de un objeto: "X Blueprint" / "Plano de X". */
    blueprint: (name: string) => string;
    stats: string;
    damage: string;
    abilities: string;
    passive: string;
    parts: string;
    recipe: string;
    credits: string;
    time: string;
    ingredients: string;
    stat: Record<"health" | "shield" | "armor" | "energy" | "sprint" | "total" | "crit" | "critMult" | "status" | "fireRate" | "magazine" | "reload" | "multishot" | "trigger", string>;
    /** Cómo se dispara; lo que no está acá se muestra tal cual. */
    trigger: Record<string, string>;
    /** Unidades de tiempo: días, horas, minutos y segundos. */
    units: { d: string; h: string; min: string; s: string };
  };
  relics: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    era: string;
    all: string;
    /** El chip que deja sólo las que todavía caen en misiones. */
    noVault: string;
    count: (n: string) => string;
    none: string;
    missing: string;
    /** El título de una reliquia: "Lith A1 Relic" / "Reliquia Lith A1". */
    relicOf: (name: string) => string;
    rewards: string;
    reward: string;
    /** Los cuatro refinamientos, en el orden de `chances`. */
    refinement: [string, string, string, string];
  };
  /** Las tablas de "dónde cae" que comparten Arsenal, Reliquias y, después, Dónde farmear y Mods. */
  sources: {
    heading: string;
    relic: string;
    rarity: string;
    mission: string;
    where: string;
    rot: string;
    chance: string;
    bounty: string;
    tier: string;
    stage: string;
    other: string;
    enemy: string;
    eff: string;
  };
  farming: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    planet: string;
    all: string;
    count: (n: string) => string;
    none: string;
    missing: string;
    /** Lo de mayor chance primero. */
    best: string;
    usedBy: string;
    /** El recurso en la lista sin planeta conocido. */
    noPlanet: string;
  };
  mods: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    kind: string;
    all: string;
    mods: string;
    arcanes: string;
    type: string;
    /** Nombre de cada tipo; el que no está acá se muestra con su nombre del export. */
    types: Record<string, string>;
    rarity: string;
    polarity: string;
    compat: string;
    drain: string;
    rank: string;
    effect: string;
    count: (n: string) => string;
    none: string;
    missing: string;
  };
  rarity: Record<WfRarity, string>;
  polarity: Record<WfPolarity, string>;
  /** Los nombres de los tipos de daño (`DAMAGE_TYPES`). */
  damage: Record<WfDamage, string>;
  era: Record<WfEra, string>;
  /** El rótulo de una reliquia que no cae en ninguna misión. */
  vault: string;
  /** El texto de una parte o plano que no aparece en ninguna tabla de drops. */
  noDrops: string;
}

const EN: WfCopy = {
  tabs: { home: "Home", arsenal: "Arsenal", relics: "Relics", farming: "Where to farm", mods: "Mods" },
  soon: "Soon",
  loading: "Loading…",
  loadError: "This page couldn't load.",
  retry: "Try again",
  seo: {
    home: {
      title: "Warframe: Arsenal, relics, where to farm and mods | Vestigo",
      description: "Every Warframe and weapon with its parts, every relic with its drops, where to farm each resource and every mod, with the day's fissures, Baro and cycles.",
    },
    arsenal: { title: "Warframe Arsenal: Warframes, weapons and their parts | Vestigo", description: "Every Warframe, weapon and companion with its stats, abilities, recipe and where each part drops." },
    relics: { title: "Warframe relics: drops and Vault status | Vestigo", description: "Every Lith, Meso, Neo and Axi relic with its six rewards by refinement, where it drops, and whether it is in the Vault." },
    farming: { title: "Warframe: where to farm every resource | Vestigo", description: "Every resource with the planets and missions where it drops, and what you need it for." },
    mods: { title: "Warframe mods and arcanes: stats and drops | Vestigo", description: "Every mod and arcane with its polarity, drain, rank-by-rank stats and where it drops." },
  },
  home: {
    kicker: "Warframe guide",
    h1: "Everything for your Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes and weapons with their parts and recipes, ${relics} relics with every reward, ${farming} resources with where to farm them and ${mods} mods and arcanes.`,
    cards: {
      arsenal: "Stats, abilities, recipe and where each part drops, for every Warframe and weapon.",
      relics: "The six rewards by refinement, where the relic drops and whether it is in the Vault.",
      farming: "Which planets and missions drop each resource, and what it is for.",
      mods: "Polarity, drain, stats by rank and where each mod and arcane drops.",
    },
    live: {
      heading: "Right now",
      cycles: "Open worlds",
      cetus: "Plains of Eidolon",
      vallis: "Orb Vallis",
      cambion: "Cambion Drift",
      state: { day: "Day", night: "Night", warm: "Warm", cold: "Cold", fass: "Fass", vome: "Vome" },
      left: (time) => `${time} left`,
      baro: "Baro Ki'Teer",
      baroHere: (time) => `Leaves in ${time}`,
      baroSoon: (time) => `Arrives in ${time}`,
      fissures: "Void fissures",
      fissuresNone: "No open fissures.",
      steel: "Steel Path",
      sortie: "Sortie",
      sortieBoss: (boss) => `Boss: ${boss}`,
    },
    about: "Warframe is a trademark of Digital Extremes. Vestigo is an unofficial fan site.",
  },
  arsenal: {
    h1: "Warframe Arsenal",
    lede: (n) => `All ${n} Warframes and weapons with their stats, recipes and parts.`,
    search: "Search",
    searchPlaceholder: "Name…",
    kind: "Type",
    all: "All",
    kinds: { warframe: "Warframes", primary: "Primary", secondary: "Secondary", melee: "Melee", archwing: "Archwing", companion: "Companions", exalted: "Exalted" },
    prime: "Prime",
    count: (n) => `${n} shown`,
    none: "Nothing matches.",
    missing: "That page doesn't exist. Here is the full list.",
    mastery: (n) => `Mastery rank ${n}`,
    blueprint: (name) => `${name} Blueprint`,
    stats: "Stats",
    damage: "Damage",
    abilities: "Abilities",
    passive: "Passive",
    parts: "Parts",
    recipe: "Recipe",
    credits: "Credits",
    time: "Build time",
    ingredients: "Ingredients",
    stat: { health: "Health", shield: "Shield", armor: "Armor", energy: "Energy", sprint: "Sprint speed", total: "Total damage", crit: "Critical chance", critMult: "Critical multiplier", status: "Status chance", fireRate: "Fire rate", magazine: "Magazine", reload: "Reload", multishot: "Multishot", trigger: "Trigger" },
    trigger: { AUTO: "Auto", SEMI: "Semi-auto", CHARGE: "Charge", HELD: "Held", BURST: "Burst", ACTIVE: "Active", DUPLEX: "Duplex" },
    units: { d: "d", h: "h", min: "min", s: "s" },
  },
  relics: {
    h1: "Warframe relics",
    lede: (n) => `All ${n} relics with their rewards and where to get them.`,
    search: "Search",
    searchPlaceholder: "Relic, like Lith A1…",
    era: "Era",
    all: "All",
    noVault: "Not in the Vault",
    count: (n) => `${n} shown`,
    none: "Nothing matches.",
    missing: "That page doesn't exist. Here is the full list.",
    relicOf: (name) => `${name} Relic`,
    rewards: "Rewards",
    reward: "Reward",
    refinement: ["Intact", "Exceptional", "Flawless", "Radiant"],
  },
  sources: {
    heading: "Where it drops",
    relic: "Relics",
    rarity: "Rarity",
    mission: "Missions",
    where: "Where",
    rot: "Rotation",
    chance: "Chance",
    bounty: "Bounties",
    tier: "Bounty",
    stage: "Stage",
    other: "Other",
    enemy: "Enemies",
    eff: "Effective chance",
  },
  farming: {
    h1: "Where to farm in Warframe",
    lede: (n) => `All ${n} resources with the missions where they drop.`,
    search: "What do you need?",
    searchPlaceholder: "Neural Sensors, Orokin Cell, Plastids…",
    planet: "Planet",
    all: "All",
    count: (n) => `${n} resources`,
    none: "No resource matches.",
    missing: "That resource doesn't exist. Here is the full list.",
    best: "Best places",
    usedBy: "Needed by",
    noPlanet: "No planet",
  },
  mods: {
    h1: "Warframe mods and arcanes",
    lede: (n) => `All ${n} mods and arcanes with their stats and drops.`,
    search: "Search",
    searchPlaceholder: "Serration, Arcane Grace…",
    kind: "Kind",
    all: "All",
    mods: "Mods",
    arcanes: "Arcanes",
    type: "Type",
    types: {
      WARFRAME: "Warframe", PRIMARY: "Primary", SECONDARY: "Secondary", MELEE: "Melee", ARCANE: "Arcane", SENTINEL: "Sentinel", STANCE: "Stance", OTHER: "Other",
      PARAZON: "Parazon", "ARCH-GUN": "Arch-Gun", AURA: "Aura", "ARCH-MELEE": "Arch-Melee", KAVAT: "Kavat", KUBROW: "Kubrow", ARCHWING: "Archwing", "HELMINTH CHARGER": "Helminth Charger",
    },
    rarity: "Rarity",
    polarity: "Polarity",
    compat: "Fits",
    drain: "Base drain",
    rank: "Rank",
    effect: "Effect",
    count: (n) => `${n} mods and arcanes`,
    none: "No mod matches.",
    missing: "That mod doesn't exist. Here is the full list.",
  },
  rarity: { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", Legendary: "Legendary" },
  polarity: { madurai: "Madurai", vazarin: "Vazarin", naramon: "Naramon", zenurik: "Zenurik", unairu: "Unairu", umbra: "Umbra", penjaga: "Penjaga", universal: "Universal", any: "Any" },
  damage: {
    impact: "Impact", puncture: "Puncture", slash: "Slash", heat: "Heat", cold: "Cold", electricity: "Electricity", toxin: "Toxin", blast: "Blast",
    radiation: "Radiation", gas: "Gas", magnetic: "Magnetic", viral: "Viral", corrosive: "Corrosive", void: "Void", tau: "Tau", cinematic: "Cinematic",
    shield_drain: "Shield drain", health_drain: "Health drain", energy_drain: "Energy drain", true: "True",
  },
  era: { Lith: "Lith", Meso: "Meso", Neo: "Neo", Axi: "Axi", Requiem: "Requiem", Vanguard: "Vanguard", Omnia: "Omnia" },
  vault: "Vault · doesn't drop in missions",
  noDrops: "Doesn't drop in missions",
};

const ES: WfCopy = {
  tabs: { home: "Inicio", arsenal: "Arsenal", relics: "Reliquias", farming: "Dónde farmear", mods: "Mods" },
  soon: "Pronto",
  loading: "Cargando…",
  loadError: "Esta página no se pudo cargar.",
  retry: "Reintentar",
  seo: {
    home: {
      title: "Warframe: Arsenal, reliquias, dónde farmear y mods | Vestigo",
      description: "Cada Warframe y arma con sus partes, cada reliquia con sus recompensas, dónde farmear cada recurso y todos los mods, con las fisuras del día, Baro y los ciclos.",
    },
    arsenal: { title: "Arsenal de Warframe: Warframes, armas y sus partes | Vestigo", description: "Cada Warframe, arma y compañero con sus estadísticas, habilidades, receta y dónde cae cada parte." },
    relics: { title: "Reliquias de Warframe: recompensas y Vault | Vestigo", description: "Cada reliquia Lith, Meso, Neo y Axi con sus seis recompensas por refinamiento, dónde cae y si está en el Vault." },
    farming: { title: "Warframe: dónde farmear cada recurso | Vestigo", description: "Cada recurso con los planetas y misiones donde cae, y para qué sirve." },
    mods: { title: "Mods y arcanos de Warframe: estadísticas y drops | Vestigo", description: "Cada mod y arcano con su polaridad, costo, estadísticas por rango y dónde cae." },
  },
  home: {
    kicker: "Guía de Warframe",
    h1: "Todo para tu Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes y armas con sus partes y recetas, ${relics} reliquias con cada recompensa, ${farming} recursos con dónde farmearlos y ${mods} mods y arcanos.`,
    cards: {
      arsenal: "Estadísticas, habilidades, receta y dónde cae cada parte, de cada Warframe y arma.",
      relics: "Las seis recompensas por refinamiento, dónde cae la reliquia y si está en el Vault.",
      farming: "Qué planetas y misiones sueltan cada recurso, y para qué sirve.",
      mods: "Polaridad, costo, estadísticas por rango y dónde cae cada mod y arcano.",
    },
    live: {
      heading: "Ahora mismo",
      cycles: "Mundos abiertos",
      cetus: "Llanuras de Eidolon",
      vallis: "Valle de Orbis",
      cambion: "Deriva Cambion",
      state: { day: "Día", night: "Noche", warm: "Cálido", cold: "Frío", fass: "Fass", vome: "Vome" },
      left: (time) => `faltan ${time}`,
      baro: "Baro Ki'Teer",
      baroHere: (time) => `Se va en ${time}`,
      baroSoon: (time) => `Llega en ${time}`,
      fissures: "Fisuras del Vacío",
      fissuresNone: "No hay fisuras abiertas.",
      steel: "Sendero de Acero",
      sortie: "Incursión",
      sortieBoss: (boss) => `Jefe: ${boss}`,
    },
    about: "Warframe es marca de Digital Extremes. Vestigo es un sitio de fans no oficial.",
  },
  arsenal: {
    h1: "Arsenal de Warframe",
    lede: (n) => `Los ${n} Warframes y armas con sus estadísticas, recetas y partes.`,
    search: "Buscar",
    searchPlaceholder: "Nombre…",
    kind: "Tipo",
    all: "Todos",
    kinds: { warframe: "Warframes", primary: "Primarias", secondary: "Secundarias", melee: "Cuerpo a cuerpo", archwing: "Archwing", companion: "Compañeros", exalted: "Exaltadas" },
    prime: "Prime",
    count: (n) => `${n} a la vista`,
    none: "No hay nada que coincida.",
    missing: "Esa página no existe. Acá está la lista completa.",
    mastery: (n) => `Rango de maestría ${n}`,
    blueprint: (name) => `Plano de ${name}`,
    stats: "Estadísticas",
    damage: "Daño",
    abilities: "Habilidades",
    passive: "Pasiva",
    parts: "Partes",
    recipe: "Receta",
    credits: "Créditos",
    time: "Tiempo de fabricación",
    ingredients: "Ingredientes",
    stat: { health: "Salud", shield: "Escudo", armor: "Armadura", energy: "Energía", sprint: "Velocidad de carrera", total: "Daño total", crit: "Prob. de crítico", critMult: "Multiplicador crítico", status: "Prob. de estado", fireRate: "Cadencia", magazine: "Cargador", reload: "Recarga", multishot: "Multidisparo", trigger: "Disparo" },
    trigger: { AUTO: "Automático", SEMI: "Semiautomático", CHARGE: "Carga", HELD: "Mantenido", BURST: "Ráfaga", ACTIVE: "Activo", DUPLEX: "Dúplex" },
    units: { d: "d", h: "h", min: "min", s: "s" },
  },
  relics: {
    h1: "Reliquias de Warframe",
    lede: (n) => `Las ${n} reliquias con sus recompensas y dónde conseguirlas.`,
    search: "Buscar",
    searchPlaceholder: "Reliquia, como Lith A1…",
    era: "Era",
    all: "Todas",
    noVault: "Fuera del Vault",
    count: (n) => `${n} a la vista`,
    none: "No hay nada que coincida.",
    missing: "Esa página no existe. Acá está la lista completa.",
    relicOf: (name) => `Reliquia ${name}`,
    rewards: "Recompensas",
    reward: "Recompensa",
    refinement: ["Intacta", "Excepcional", "Impecable", "Radiante"],
  },
  sources: {
    heading: "Dónde cae",
    relic: "Reliquias",
    rarity: "Rareza",
    mission: "Misiones",
    where: "Dónde",
    rot: "Rotación",
    chance: "Probabilidad",
    bounty: "Recompensas de bounty",
    tier: "Bounty",
    stage: "Etapa",
    other: "Otros",
    enemy: "Enemigos",
    eff: "Prob. efectiva",
  },
  farming: {
    h1: "Dónde farmear en Warframe",
    lede: (n) => `Los ${n} recursos con las misiones donde caen.`,
    search: "¿Qué necesitás?",
    searchPlaceholder: "Sensores neurales, Célula Orokin, Plástidos…",
    planet: "Planeta",
    all: "Todos",
    count: (n) => `${n} recursos`,
    none: "Ningún recurso coincide.",
    missing: "Ese recurso no existe. Acá va la lista entera.",
    best: "Dónde conviene",
    usedBy: "Lo piden",
    noPlanet: "Sin planeta",
  },
  mods: {
    h1: "Mods y arcanos de Warframe",
    lede: (n) => `Los ${n} mods y arcanos con sus estadísticas y drops.`,
    search: "Buscar",
    searchPlaceholder: "Sierra, Arcano Gracia…",
    kind: "Clase",
    all: "Todos",
    mods: "Mods",
    arcanes: "Arcanos",
    type: "Tipo",
    types: {
      WARFRAME: "Warframe", PRIMARY: "Primaria", SECONDARY: "Secundaria", MELEE: "Cuerpo a cuerpo", ARCANE: "Arcano", SENTINEL: "Centinela", STANCE: "Postura", OTHER: "Otros",
      PARAZON: "Parazón", "ARCH-GUN": "Arma de Archwing", AURA: "Aura", "ARCH-MELEE": "Melé de Archwing", KAVAT: "Kavat", KUBROW: "Kubrow", ARCHWING: "Archwing", "HELMINTH CHARGER": "Cargador Helminth",
    },
    rarity: "Rareza",
    polarity: "Polaridad",
    compat: "Sirve para",
    drain: "Costo base",
    rank: "Rango",
    effect: "Efecto",
    count: (n) => `${n} mods y arcanos`,
    none: "Ningún mod coincide.",
    missing: "Ese mod no existe. Acá va la lista entera.",
  },
  rarity: { Common: "Común", Uncommon: "Poco común", Rare: "Rara", Legendary: "Legendaria" },
  polarity: { madurai: "Madurai", vazarin: "Vazarin", naramon: "Naramon", zenurik: "Zenurik", unairu: "Unairu", umbra: "Umbra", penjaga: "Penjaga", universal: "Universal", any: "Cualquiera" },
  damage: {
    impact: "Impacto", puncture: "Perforación", slash: "Tajo", heat: "Calor", cold: "Frío", electricity: "Electricidad", toxin: "Toxina", blast: "Explosión",
    radiation: "Radiación", gas: "Gas", magnetic: "Magnético", viral: "Viral", corrosive: "Corrosivo", void: "Vacío", tau: "Tau", cinematic: "Cinemático",
    shield_drain: "Drenaje de escudo", health_drain: "Drenaje de salud", energy_drain: "Drenaje de energía", true: "Verdadero",
  },
  era: { Lith: "Lith", Meso: "Meso", Neo: "Neo", Axi: "Axi", Requiem: "Réquiem", Vanguard: "Vanguardia", Omnia: "Omnia" },
  vault: "Vault · no cae en misiones",
  noDrops: "No cae en misiones",
};

export const WF_COPY: Record<"en" | "es", WfCopy> = { en: EN, es: ES };
export const useWfCopy = (): WfCopy => WF_COPY[useLang().lang];
