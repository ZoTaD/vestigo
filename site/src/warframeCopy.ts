/**
 * Los textos de la sección Warframe (2026-10-27), en inglés y español. Fuera de un componente (prerender, buscador de
 * la barra) se usa `WF_COPY[lang]`; adentro, `useWfCopy()`.
 *
 * Acá van sólo los textos de la interfaz del sitio. Los nombres, descripciones y estadísticas de las cosas del juego
 * salen siempre del export oficial (`_en` y `_es`), en los datos. Las excepciones son las rarezas, las polaridades, los
 * tipos de daño y las eras de reliquia, que la interfaz nombra sin dato al lado.
 */
import { useLang } from "./i18n";
import type { Kind, MasteryKind, StatKey, VaultStatus } from "./warframe/data";
import type { WfSection, WfTab } from "./route";

/** El orden de las pestañas en la barra. */
export const WF_TABS: WfSection[] = ["home", "arsenal", "relics", "farming", "mods", "builder", "rivens", "star-chart", "mastery", "prime-vault", "baro"];

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
/** Una descripción entra en 160 caracteres: lo que sobra se corta en una palabra entera. */
const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);

export interface WfCopy {
  tabs: Record<WfSection, string>;
  /** La insignia de una pestaña que todavía no tiene página. */
  soon: string;
  loading: string;
  loadError: string;
  retry: string;
  seo: Record<WfSection, Seo>;
  /** El <head> de una ficha: lo que se busca (el nombre y qué trae la página). `mod` sirve para mods y arcanos. */
  detailSeo: {
    arsenal: (name: string) => Seo;
    /** `name` va sin la palabra "Relic"/"Reliquia". */
    relics: (name: string) => Seo;
    farming: (name: string) => Seo;
    mod: (name: string, arcane: boolean) => Seo;
    /** Un nodo del mapa estelar: su planeta (en el idioma) y el tipo de misión como viene en los datos (en inglés). */
    "star-chart": (name: string, planet: string, type: string) => Seo;
  };
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
    /** El enlace de la ficha al armador (Warframes y armas primarias, secundarias y cuerpo a cuerpo). */
    buildIt: string;
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
    /** El encabezado de la primera columna de la tabla. */
    name: string;
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
  starChart: {
    h1: string;
    lede: (n: string) => string;
    /** El nombre del dibujo, para los lectores de pantalla. */
    map: string;
    /** Los lugares fuera de las órbitas (Vacío, Fortaleza Kuva, Zariman…). */
    outside: string;
    pick: string;
    /** El rótulo arriba del planeta elegido. */
    planet: string;
    allPlanets: string;
    all: string;
    type: string;
    nodes: (n: string) => string;
    levels: (lo: number, hi: number) => string;
    count: (n: string) => string;
    none: string;
    missing: string;
    node: string;
    mission: string;
    faction: string;
    level: string;
    best: string;
    mastery: string;
    dark: string;
    rotation: (r: string) => string;
    rewards: string;
    reward: string;
    chance: string;
    resources: string;
    noRewards: string;
  };
  masteryList: {
    h1: string;
    lede: (n: string) => string;
    search: string;
    searchPlaceholder: string;
    kind: string;
    all: string;
    kinds: Record<MasteryKind, string>;
    hide: string;
    count: (shown: string, total: string) => string;
    none: string;
    done: string;
    points: string;
    rank: string;
    legendary: (n: number) => string;
    next: (n: string, rank: string) => string;
    clear: string;
    clearAsk: string;
    pts: (n: string) => string;
    rankReq: (n: number) => string;
    note: string;
  };
  vaultList: {
    h1: string;
    lede: (n: string) => string;
    status: string;
    kind: string;
    all: string;
    /** El chip de cada estado. */
    statuses: Record<VaultStatus, string>;
    /** El estado escrito debajo de cada Prime. */
    statusLong: Record<VaultStatus, string>;
    count: (n: string) => string;
    none: string;
    changes: string;
    date: string;
    item: string;
    change: string;
    /** El estado de antes de un Prime nuevo. */
    added: string;
    noChanges: string;
    note: string;
  };
  /** La calculadora de Rivens (etapa 3). */
  rivens: {
    h1: string;
    lede: string;
    /** Sin disposición desde el Hotfix 44.1.3: `d` es el valor que trae el export. */
    notice: (d: string) => string;
    pick: string;
    searchPlaceholder: string;
    typesLabel: string;
    count: (n: string) => string;
    none: string;
    /** `?w=` con un arma que no está en la lista. */
    noRiven: (slug: string) => string;
    typeOf: (type: string) => string;
    change: string;
    rangeH: string;
    rangeNote: string;
    /** Los stats que no van en % (alcance, duración del combo…): su cifra no está verificada y no se muestran. */
    hidden: (names: string) => string;
    stat: string;
    combos: Record<"2" | "2-" | "3" | "3-", string>;
    positive: string;
    negative: string;
    rollH: string;
    rollLede: string;
    rollStat: string;
    rollCombo: string;
    rollSide: string;
    rollValue: string;
    rollPlaceholder: string;
    rollResult: string;
    rollOut: string;
    rollRange: string;
  };
  /** El armador (etapa 3). */
  builder: {
    h1: string;
    lede: string;
    /** Sin objeto elegido: cómo empezar, y los rótulos de los de ejemplo. */
    start: string;
    frames: string;
    weapons: string;
    pick: string;
    searchPlaceholder: string;
    all: string;
    kinds: Record<Kind, string>;
    /** El tipo de un objeto, en singular, debajo de su nombre. */
    kind1: Record<Kind, string>;
    count: (n: string) => string;
    none: string;
    change: string;
    close: string;
    rank: (n: number) => string;
    toArsenal: string;
    capacity: string;
    free: string;
    formas: string;
    /** El potenciador de un Warframe y el catalizador de un arma. */
    reactor: string;
    catalyst: string;
    over: (n: string) => string;
    copy: string;
    copied: string;
    copyFail: string;
    pin: string;
    unpin: string;
    compare: string;
    legendBase: string;
    legendRef: string;
    legendBuild: string;
    aura: string;
    stance: string;
    exilus: string;
    slots: string;
    empty: string;
    tap: string;
    noPol: string;
    rankLabel: string;
    rankDown: string;
    rankUp: string;
    remove: string;
    polarity: string;
    modSearch: (n: string) => string;
    noMods: string;
    stats: string;
    stat: string;
    base: string;
    ref: string;
    build: string;
    delta: string;
    isNew: string;
    groups: { damage: string; crit: string; gun: string; frame: string; abilities: string };
    /** Las filas de la tabla de un arma: el daño es por proyectil y el "por disparo" lo multiplica a la vista. */
    w: Record<"perShot" | "perHit" | "perShotNote" | "total" | "multishot" | "cc" | "cd" | "sc" | "rate" | "attackSpeed" | "mag" | "reload", string>;
    f: Record<"health" | "shield" | "armor" | "energy" | "strength" | "duration" | "efficiency" | "range", string>;
    /** Las stats que suma un mod, como se leen en la lista de mods de la build (los elementos salen de `damage`). */
    fx: Record<Exclude<StatKey, WfDamage>, string>;
    modsIn: string;
    noModsYet: string;
    notCounted: string;
    partly: string;
    note: string;
  };
  baroPage: {
    h1: string;
    lede: string;
    now: string;
    here: (relay: string) => string;
    coming: (relay: string) => string;
    leaves: (time: string, when: string) => string;
    arrives: (time: string, when: string) => string;
    item: string;
    ducats: string;
    credits: string;
    noItems: string;
    history: string;
    visit: (from: string, to: string) => string;
    items: (n: number) => string;
    noHistory: string;
  };
  /** Los tipos de misión del mapa estelar (`MISSION_TYPES` de `site_data.py`); el que no está acá se muestra tal cual. */
  missionType: Record<string, string>;
  /** Las facciones (`FACTIONS` de `site_data.py`); la que no está acá se muestra tal cual. */
  faction: Record<string, string>;
  /** Los rótulos de una tabla de recompensas de nodo ("Caches"); el que no está acá se muestra tal cual. */
  rewardLabel: Record<string, string>;
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
  tabs: { home: "Home", arsenal: "Arsenal", relics: "Relics", farming: "Where to farm", mods: "Mods", builder: "Builder", rivens: "Rivens", "star-chart": "Star Chart", mastery: "Mastery", "prime-vault": "Prime Vault", baro: "Baro Ki'Teer" },
  soon: "Soon",
  loading: "Loading…",
  loadError: "This page couldn't load.",
  retry: "Try again",
  seo: {
    home: {
      title: "Warframe: Arsenal, relics, where to farm and mods | Vestigo",
      description: "Arsenal, relics, farming and mods, plus the Star Chart, Mastery checklist, Prime Vault and Baro Ki'Teer, with the day's fissures and cycles.",
    },
    arsenal: { title: "Warframe Arsenal: Warframes, weapons and their parts | Vestigo", description: "Every Warframe, weapon and companion with its stats, abilities, recipe and where each part drops." },
    relics: { title: "Warframe relics: drops and Vault status | Vestigo", description: "Every Lith, Meso, Neo and Axi relic with its six rewards by refinement, where it drops, and whether it is in the Vault." },
    farming: { title: "Warframe: where to farm every resource | Vestigo", description: "Every resource with the planets and missions where it drops, and what you need it for." },
    mods: { title: "Warframe mods and arcanes: stats and drops | Vestigo", description: "Every mod and arcane with its polarity, drain, rank-by-rank stats and where it drops." },
    "star-chart": {
      title: "Warframe Star Chart: every node, mission and reward | Vestigo",
      description: "Every node of the Origin System by planet, with its mission type, faction, level, rewards by rotation and the resources of each planet.",
    },
    mastery: { title: "Warframe mastery checklist: every item that gives mastery | Vestigo", description: "Tick off every Warframe, weapon and companion you have ranked up and see your mastery points and the mastery rank they reach." },
    "prime-vault": { title: "Warframe Prime Vault: which Primes are vaulted | Vestigo", description: "Every Prime Warframe and weapon, whether its parts still drop from unvaulted relics, and when its Vault status changed." },
    baro: { title: "Baro Ki'Teer: inventory, arrival and past visits | Vestigo", description: "Where and when Baro Ki'Teer arrives, what he sells for ducats and credits, and every visit we have recorded." },
    builder: {
      title: "Warframe build planner: mods, capacity and stats | Vestigo",
      description: "Plan a Warframe or weapon build: pick a mod for each slot, set polarities and see capacity, damage, critical and ability stats change. Share it as a link.",
    },
    rivens: {
      title: "Warframe Riven calculator: stat ranges for every weapon | Vestigo",
      description: "The minimum and maximum of every Riven stat for any weapon, with two or three positives and a negative, and how good your roll is.",
    },
  },
  detailSeo: {
    arsenal: (name) => ({
      title: `${name} — Warframe build parts, where to farm and stats | Vestigo`,
      description: clip(`${name} in Warframe: its stats, the blueprint and parts with where each one drops, and the resources and credits to craft it.`),
    }),
    relics: (name) => ({
      title: `${name} Relic — Warframe drops, rewards and vault status | Vestigo`,
      description: clip(`${name} Relic in Warframe: its six rewards with the chance at each refinement, the missions where it drops and whether it is in the Vault.`),
    }),
    farming: (name) => ({
      title: `Where to farm ${name} in Warframe | Vestigo`,
      description: clip(`Where to farm ${name} in Warframe: the planets, missions and enemies that drop it, with the chance of each.`),
    }),
    mod: (name, arcane) => ({
      title: `${name} — Warframe ${arcane ? "arcane" : "mod"} drops and stats | Vestigo`,
      description: clip(`${name} in Warframe: ${arcane ? "its effect at every rank" : "its polarity, drain and stats at every rank"}, and where it drops.`),
    }),
    "star-chart": (name, planet, type) => ({
      title: `${name}, ${planet} — Warframe node rewards and drops | Vestigo`,
      description: clip(`${name} on ${planet} in Warframe: ${EN.missionType[type] ?? type} mission, its level, faction and rewards by rotation with the chance of each, and the planet's resources.`),
    }),
  },
  home: {
    kicker: "Warframe guide",
    h1: "Everything for your Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes and weapons with their parts and recipes, ${relics} relics with every reward, ${farming} resources with where to farm them and ${mods} mods and arcanes, plus a build planner, the Star Chart, a Mastery checklist, the Prime Vault and Baro Ki'Teer.`,
    cards: {
      arsenal: "Stats, abilities, recipe and where each part drops, for every Warframe and weapon.",
      relics: "The six rewards by refinement, where the relic drops and whether it is in the Vault.",
      farming: "Which planets and missions drop each resource, and what it is for.",
      mods: "Polarity, drain, stats by rank and where each mod and arcane drops.",
      builder: "Pick a mod for each slot and watch capacity and stats change.",
      rivens: "The range of every Riven stat for each weapon, and how good your roll is.",
      "star-chart": "Every node by planet with its mission, level and rewards by rotation.",
      mastery: "Tick off what you have ranked up and count your mastery points.",
      "prime-vault": "Which Primes still drop from relics and which are in the Vault.",
      baro: "Baro Ki'Teer's arrival, his inventory and his past visits.",
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
    buildIt: "Plan a build",
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
    name: "Name",
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
  starChart: {
    h1: "Warframe Star Chart",
    lede: (n) => `All ${n} nodes of the Origin System with their mission, faction, level and rewards.`,
    map: "Map of the Origin System",
    outside: "Beyond the orbits",
    pick: "Pick a planet to see its nodes.",
    planet: "Planet",
    allPlanets: "All planets",
    all: "All",
    type: "Mission",
    nodes: (n) => `${n} nodes`,
    levels: (lo, hi) => `level ${lo}–${hi}`,
    count: (n) => `${n} nodes shown`,
    none: "No node matches.",
    missing: "That node doesn't exist. Here is the full chart.",
    node: "Node",
    mission: "Mission",
    faction: "Faction",
    level: "Level",
    best: "Best drop",
    mastery: "Mastery rank",
    dark: "Dark Sector",
    rotation: (r) => `Rotation ${r}`,
    rewards: "Rewards",
    reward: "Reward",
    chance: "Chance",
    resources: "Planet resources",
    noRewards: "This node has no reward table of its own.",
  },
  masteryList: {
    h1: "Warframe mastery checklist",
    lede: (n) => `Tick off the ${n} Warframes, weapons and companions you have ranked up. Your ticks stay in this browser.`,
    search: "Search",
    searchPlaceholder: "Name…",
    kind: "Type",
    all: "All",
    kinds: { warframe: "Warframes", primary: "Primary", secondary: "Secondary", melee: "Melee", archwing: "Archwing", companion: "Companions", necramech: "Necramechs" },
    hide: "Hide ticked",
    count: (shown, total) => `${shown} shown of ${total}`,
    none: "Nothing matches.",
    done: "Ticked",
    points: "Mastery points",
    rank: "Mastery rank reached",
    legendary: (n) => `Legendary ${n}`,
    next: (n, rank) => `${n} more points for ${rank}`,
    clear: "Untick all",
    clearAsk: "Untick everything you have ticked?",
    pts: (n) => `${n} pts`,
    rankReq: (n) => `rank ${n}`,
    note: "Points count each item ranked to its maximum. Amps, Zaws, Kitguns, K-Drives and intrinsics are not listed yet.",
  },
  vaultList: {
    h1: "Warframe Prime Vault",
    lede: (n) => `Which of the ${n} Prime Warframes, weapons and companions still drop from relics you can get in missions, and which are in the Vault.`,
    status: "Status",
    kind: "Type",
    all: "All",
    statuses: { available: "Available", vaulted: "Vaulted", partial: "Partial", norelics: "No relics" },
    statusLong: { available: "Available", vaulted: "In the Vault", partial: "Partly vaulted", norelics: "Not in relics" },
    count: (n) => `${n} Primes`,
    none: "Nothing matches.",
    changes: "Vault changes",
    date: "Date",
    item: "Prime",
    change: "Change",
    added: "New",
    noChanges: "No changes yet: they are recorded since Oct 27, 2026.",
    note: "Available: every part drops from at least one relic that is not vaulted. In the Vault: no part does. Partial: some parts do and some don't. No relics: its parts are not in any relic (Founder Primes).",
  },
  rivens: {
    h1: "Riven calculator",
    lede: "The lowest and highest value of every Riven stat for any weapon, with two or three positives and with or without a negative, and how good your roll came out.",
    notice: (d) => `Since Hotfix 44.1.3 every Riven uses the same disposition: ${d}.`,
    pick: "Weapon",
    searchPlaceholder: "Search a weapon…",
    typesLabel: "Or pick a Riven type",
    count: (n) => `${n} shown`,
    none: "Nothing matches.",
    noRiven: (slug) => `“${slug}” doesn't take a Riven (or isn't a weapon we know). Pick another weapon below.`,
    typeOf: (type) => `${type} Riven`,
    change: "Change",
    rangeH: "Stat ranges at rank 8",
    rangeNote: "Rank 8 is a fully upgraded Riven. Damage to a faction is shown as a multiplier, as in the game.",
    hidden: (names) => `Not verified, not shown: ${names}.`,
    stat: "Stat",
    combos: { "2": "2 positives", "2-": "2 positives + negative", "3": "3 positives", "3-": "3 positives + negative" },
    positive: "Positive",
    negative: "Negative",
    rollH: "How good is my roll?",
    rollLede: "Pick the stat, how many positives your Riven has and the value it shows at rank 8.",
    rollStat: "Stat",
    rollCombo: "Riven",
    rollSide: "The stat is",
    rollValue: "Value",
    rollPlaceholder: "e.g. 180",
    rollResult: "of the way from the worst roll to the best",
    rollOut: "That value is outside the range for this stat.",
    rollRange: "Range",
  },
  builder: {
    h1: "Build planner",
    lede: "Pick a mod for each slot, set polarities and watch capacity and stats change. The build lives in the address: copy it to share it.",
    start: "Search for a Warframe or weapon, or start with one of these.",
    frames: "Warframes",
    weapons: "Weapons",
    pick: "What to build",
    searchPlaceholder: "Warframe or weapon…",
    all: "All",
    kinds: { warframe: "Warframes", primary: "Primary", secondary: "Secondary", melee: "Melee" },
    kind1: { warframe: "Warframe", primary: "Primary weapon", secondary: "Secondary weapon", melee: "Melee weapon" },
    count: (n) => `${n} shown`,
    none: "Nothing matches.",
    change: "Change",
    close: "Close",
    rank: (n) => `Rank ${n}`,
    toArsenal: "See in the Arsenal",
    capacity: "Capacity",
    free: "Free",
    formas: "Forma",
    reactor: "Orokin Reactor",
    catalyst: "Orokin Catalyst",
    over: (n) => `${n} over capacity: the game won't let you equip this build.`,
    copy: "Copy link",
    copied: "Link copied",
    copyFail: "Couldn't copy: the link is in the address bar.",
    pin: "Pin as reference",
    unpin: "Unpin reference",
    compare: "Comparison",
    legendBase: "Gray: no mods",
    legendRef: "Gray: pinned reference",
    legendBuild: "White: your build",
    aura: "Aura",
    stance: "Stance",
    exilus: "Exilus",
    slots: "Slots",
    empty: "Empty",
    tap: "tap to pick",
    noPol: "No polarity",
    rankLabel: "Rank",
    rankDown: "Rank down",
    rankUp: "Rank up",
    remove: "Remove",
    polarity: "Polarity",
    modSearch: (n) => `Search ${n} mods`,
    noMods: "No mod fits here.",
    stats: "Stats",
    stat: "Stat",
    base: "Base",
    ref: "Ref.",
    build: "Build",
    delta: "Change",
    isNew: "new",
    groups: { damage: "Damage", crit: "Critical and status", gun: "Weapon", frame: "Warframe", abilities: "Abilities" },
    w: {
      perShot: "Damage per shot", perHit: "Damage per hit", perShotNote: "per projectile × multishot", total: "Damage per projectile", multishot: "Multishot",
      cc: "Critical chance", cd: "Critical multiplier", sc: "Status chance", rate: "Fire rate", attackSpeed: "Attack speed", mag: "Magazine", reload: "Reload",
    },
    f: { health: "Health", shield: "Shield", armor: "Armor", energy: "Energy", strength: "Ability strength", duration: "Ability duration", efficiency: "Ability efficiency", range: "Ability range" },
    fx: {
      damage: "Damage", multishot: "Multishot", critChance: "Critical chance", critDamage: "Critical damage", statusChance: "Status chance",
      fireRate: "Fire rate", magazine: "Magazine", reload: "Reload speed", meleeDamage: "Melee damage", attackSpeed: "Attack speed",
      strength: "Ability strength", duration: "Ability duration", efficiency: "Ability efficiency", range: "Ability range",
      health: "Health", shield: "Shield", armor: "Armor", energy: "Energy",
    },
    modsIn: "Mods in the build",
    noModsYet: "No mods yet.",
    notCounted: "not counted",
    partly: "counted in part",
    note: "Arsenal values at rank 30, without arcanes, Riven or conditional effects (on kill, while aiming…): those are shown as text and not counted.",
  },
  baroPage: {
    h1: "Baro Ki'Teer",
    lede: "The Void Trader arrives at a relay every two weeks and stays for 48 hours, selling for ducats and credits. Here is his current visit and every visit we have recorded.",
    now: "Right now",
    here: (relay) => `At ${relay}`,
    coming: (relay) => `Next stop: ${relay}`,
    leaves: (time, when) => `Leaves in ${time} (${when})`,
    arrives: (time, when) => `Arrives in ${time} (${when})`,
    item: "Item",
    ducats: "Ducats",
    credits: "Credits",
    noItems: "His inventory hasn't shown up yet.",
    history: "Past visits",
    visit: (from, to) => `${from} – ${to}`,
    items: (n) => (n === 1 ? "1 item" : `${n} items`),
    noHistory: "No visits recorded yet: they are recorded since Oct 27, 2026.",
  },
  missionType: {
    Assassination: "Assassination", Exterminate: "Exterminate", Survival: "Survival", Rescue: "Rescue", Sabotage: "Sabotage", Capture: "Capture",
    Spy: "Spy", Defense: "Defense", "Mobile Defense": "Mobile Defense", Interception: "Interception", Hijack: "Hijack", Hive: "Hive",
    Excavation: "Excavation", "Infested Salvage": "Infested Salvage", Arena: "Arena", Pursuit: "Pursuit", Rush: "Rush", Assault: "Assault",
    Defection: "Defection", "Free Roam": "Free Roam", "The Circuit": "The Circuit", Disruption: "Disruption", "Void Flood": "Void Flood",
    "Void Cascade": "Void Cascade", "Void Armageddon": "Void Armageddon", Alchemy: "Alchemy", "Legacyte Harvest": "Legacyte Harvest",
    "Shrine Defense": "Shrine Defense", Faceoff: "Faceoff", Descent: "Descent", "The Perita Rebellion": "The Perita Rebellion", Relay: "Relay",
  },
  faction: {
    Grineer: "Grineer", Corpus: "Corpus", Infested: "Infested", Orokin: "Orokin", Sentient: "Sentient", "The Murmur": "The Murmur",
    Scaldra: "Scaldra", Techrot: "Techrot", Duviri: "Duviri", Anarchs: "Anarchs",
  },
  rewardLabel: { Caches: "Caches", "Survival Extra": "Survival extra", "Assassination Extra": "Assassination extra" },
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
  tabs: { home: "Inicio", arsenal: "Arsenal", relics: "Reliquias", farming: "Dónde farmear", mods: "Mods", builder: "Armador", rivens: "Rivens", "star-chart": "Mapa estelar", mastery: "Maestría", "prime-vault": "Prime Vault", baro: "Baro Ki'Teer" },
  soon: "Pronto",
  loading: "Cargando…",
  loadError: "Esta página no se pudo cargar.",
  retry: "Reintentar",
  seo: {
    home: {
      title: "Warframe: Arsenal, reliquias, dónde farmear y mods | Vestigo",
      description: "Arsenal, reliquias, dónde farmear y mods, más el Mapa estelar, la Maestría, el Prime Vault y Baro Ki'Teer, con las fisuras y los ciclos del día.",
    },
    arsenal: { title: "Arsenal de Warframe: Warframes, armas y sus partes | Vestigo", description: "Cada Warframe, arma y compañero con sus estadísticas, habilidades, receta y dónde cae cada parte." },
    relics: { title: "Reliquias de Warframe: recompensas y Vault | Vestigo", description: "Cada reliquia Lith, Meso, Neo y Axi con sus seis recompensas por refinamiento, dónde cae y si está en el Vault." },
    farming: { title: "Warframe: dónde farmear cada recurso | Vestigo", description: "Cada recurso con los planetas y misiones donde cae, y para qué sirve." },
    mods: { title: "Mods y arcanos de Warframe: estadísticas y drops | Vestigo", description: "Cada mod y arcano con su polaridad, costo, estadísticas por rango y dónde cae." },
    "star-chart": {
      title: "Mapa estelar de Warframe: cada nodo, misión y recompensa | Vestigo",
      description: "Cada nodo del Sistema Origen por planeta, con su tipo de misión, facción, nivel, recompensas por rotación y los recursos de cada planeta.",
    },
    mastery: { title: "Maestría de Warframe: todo lo que da maestría, para tildar | Vestigo", description: "Tildá cada Warframe, arma y compañero que subiste y mirá tus puntos de maestría y el rango que alcanzan." },
    "prime-vault": { title: "Prime Vault de Warframe: qué Prime está en el Vault | Vestigo", description: "Cada Warframe y arma Prime, si sus partes todavía caen de reliquias abiertas y cuándo cambió su estado en el Vault." },
    baro: { title: "Baro Ki'Teer: inventario, llegada y visitas anteriores | Vestigo", description: "Dónde y cuándo llega Baro Ki'Teer, qué vende por ducados y créditos, y cada visita que anotamos." },
    builder: {
      title: "Armador de builds de Warframe: mods, capacidad y stats | Vestigo",
      description: "Armá la build de un Warframe o un arma: elegí el mod de cada casillero, poné polaridades y mirá cambiar la capacidad, el daño y las habilidades.",
    },
    rivens: {
      title: "Calculadora de Rivens de Warframe: rangos por arma | Vestigo",
      description: "El mínimo y el máximo de cada stat de Riven para cualquier arma, con dos o tres positivos y un negativo, y qué tan buena es tu tirada.",
    },
  },
  detailSeo: {
    arsenal: (name) => ({
      title: `${name} — Warframe: partes, dónde farmear y estadísticas | Vestigo`,
      description: clip(`${name} en Warframe: sus estadísticas, el plano y las partes con dónde cae cada una, y los recursos y créditos para fabricarlo.`),
    }),
    relics: (name) => ({
      title: `Reliquia ${name} — Warframe: recompensas, drops y estado del Vault | Vestigo`,
      description: clip(`Reliquia ${name} de Warframe: sus seis recompensas con la chance de cada refinamiento, las misiones donde cae y si está en el Vault.`),
    }),
    farming: (name) => ({
      title: `Dónde farmear ${name} en Warframe | Vestigo`,
      description: clip(`Dónde farmear ${name} en Warframe: los planetas, misiones y enemigos que lo sueltan, con la chance de cada uno.`),
    }),
    mod: (name, arcane) => ({
      title: `${name} — Warframe: drops y estadísticas ${arcane ? "del arcano" : "del mod"} | Vestigo`,
      description: clip(`${name} en Warframe: ${arcane ? "su efecto en cada rango" : "su polaridad, costo y estadísticas en cada rango"}, y dónde cae.`),
    }),
    "star-chart": (name, planet, type) => ({
      title: `${name}, ${planet} — Warframe: recompensas y drops del nodo | Vestigo`,
      description: clip(`${name} (${planet}) en Warframe: misión de ${ES.missionType[type] ?? type}, su nivel, facción y recompensas por rotación con la chance de cada una, y los recursos del planeta.`),
    }),
  },
  home: {
    kicker: "Guía de Warframe",
    h1: "Todo para tu Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes y armas con sus partes y recetas, ${relics} reliquias con cada recompensa, ${farming} recursos con dónde farmearlos y ${mods} mods y arcanos, más un armador de builds, el Mapa estelar, la Maestría para tildar, el Prime Vault y Baro Ki'Teer.`,
    cards: {
      arsenal: "Estadísticas, habilidades, receta y dónde cae cada parte, de cada Warframe y arma.",
      relics: "Las seis recompensas por refinamiento, dónde cae la reliquia y si está en el Vault.",
      farming: "Qué planetas y misiones sueltan cada recurso, y para qué sirve.",
      mods: "Polaridad, costo, estadísticas por rango y dónde cae cada mod y arcano.",
      builder: "Elegí el mod de cada casillero y mirá cómo cambian la capacidad y las stats.",
      rivens: "El rango de cada stat de Riven para cada arma, y qué tan buena es tu tirada.",
      "star-chart": "Cada nodo por planeta con su misión, nivel y recompensas por rotación.",
      mastery: "Tildá lo que ya subiste y contá tus puntos de maestría.",
      "prime-vault": "Qué Prime todavía cae de reliquias y cuáles están en el Vault.",
      baro: "La llegada de Baro Ki'Teer, su inventario y sus visitas anteriores.",
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
    buildIt: "Armar build",
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
    name: "Nombre",
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
  starChart: {
    h1: "Mapa estelar de Warframe",
    lede: (n) => `Los ${n} nodos del Sistema Origen con su misión, facción, nivel y recompensas.`,
    map: "Mapa del Sistema Origen",
    outside: "Fuera de las órbitas",
    pick: "Tocá un planeta para ver sus nodos.",
    planet: "Planeta",
    allPlanets: "Todos los planetas",
    all: "Todas",
    type: "Misión",
    nodes: (n) => `${n} nodos`,
    levels: (lo, hi) => `nivel ${lo}–${hi}`,
    count: (n) => `${n} nodos a la vista`,
    none: "Ningún nodo coincide.",
    missing: "Ese nodo no existe. Acá está el mapa entero.",
    node: "Nodo",
    mission: "Misión",
    faction: "Facción",
    level: "Nivel",
    best: "Lo que más da",
    mastery: "Rango de maestría",
    dark: "Sector oscuro",
    rotation: (r) => `Rotación ${r}`,
    rewards: "Recompensas",
    reward: "Recompensa",
    chance: "Probabilidad",
    resources: "Recursos del planeta",
    noRewards: "Este nodo no tiene tabla de recompensas propia.",
  },
  masteryList: {
    h1: "Maestría de Warframe para tildar",
    lede: (n) => `Tildá los ${n} Warframes, armas y compañeros que ya subiste. Lo tildado queda en este navegador.`,
    search: "Buscar",
    searchPlaceholder: "Nombre…",
    kind: "Tipo",
    all: "Todos",
    kinds: { warframe: "Warframes", primary: "Primarias", secondary: "Secundarias", melee: "Cuerpo a cuerpo", archwing: "Archwing", companion: "Compañeros", necramech: "Necramechs" },
    hide: "Ocultar lo tildado",
    count: (shown, total) => `${shown} de ${total}`,
    none: "No hay coincidencias.",
    done: "Tildados",
    points: "Puntos de maestría",
    rank: "Rango de maestría alcanzado",
    legendary: (n) => `Legendario ${n}`,
    next: (n, rank) => `Faltan ${n} puntos para ${rank}`,
    clear: "Destildar todo",
    clearAsk: "¿Destildar todo lo que tildaste?",
    pts: (n) => `${n} pts`,
    rankReq: (n) => `rango ${n}`,
    note: "Los puntos cuentan cada objeto subido al máximo. Los Amps, Zaw, Kitguns, K-Drives y los intrínsecos todavía no están.",
  },
  vaultList: {
    h1: "Prime Vault de Warframe",
    lede: (n) => `Cuáles de los ${n} Warframes, armas y compañeros Prime todavía caen de reliquias que se consiguen en misiones, y cuáles están en el Vault.`,
    status: "Estado",
    kind: "Tipo",
    all: "Todos",
    statuses: { available: "Disponible", vaulted: "Vault", partial: "Parcial", norelics: "Sin reliquias" },
    statusLong: { available: "Disponible", vaulted: "En el Vault", partial: "En parte en el Vault", norelics: "Sin reliquias" },
    count: (n) => `${n} Prime`,
    none: "No hay coincidencias.",
    changes: "Cambios del Vault",
    date: "Fecha",
    item: "Prime",
    change: "Cambio",
    added: "Nuevo",
    noChanges: "Todavía no hubo cambios: se anotan desde el 27/10/2026.",
    note: "Disponible: cada parte cae de al menos una reliquia fuera del Vault. En el Vault: ninguna. Parcial: algunas sí y otras no. Sin reliquias: sus partes no están en ninguna reliquia (los Prime de fundador).",
  },
  rivens: {
    h1: "Calculadora de Rivens",
    lede: "El valor mínimo y el máximo de cada stat de Riven para cualquier arma, con dos o tres positivos y con o sin negativo, y qué tan buena salió tu tirada.",
    notice: (d) => `Desde el Hotfix 44.1.3 todos los Riven usan la misma disposición: ${d}.`,
    pick: "Arma",
    searchPlaceholder: "Buscá un arma…",
    typesLabel: "O elegí un tipo de Riven",
    count: (n) => `${n} a la vista`,
    none: "Nada coincide.",
    noRiven: (slug) => `“${slug}” no acepta Riven (o no es un arma que conozcamos). Elegí otra abajo.`,
    typeOf: (type) => `Riven de ${type}`,
    change: "Cambiar",
    rangeH: "Rangos de cada stat a rango 8",
    rangeNote: "El rango 8 es un Riven mejorado del todo. El daño a una facción se muestra como multiplicador, igual que en el juego.",
    hidden: (names) => `Sin verificar, no se muestran: ${names}.`,
    stat: "Stat",
    combos: { "2": "2 positivos", "2-": "2 positivos + negativo", "3": "3 positivos", "3-": "3 positivos + negativo" },
    positive: "Positivo",
    negative: "Negativo",
    rollH: "¿Qué tan buena salió mi tirada?",
    rollLede: "Elegí el stat, cuántos positivos tiene tu Riven y el valor que muestra a rango 8.",
    rollStat: "Stat",
    rollCombo: "Riven",
    rollSide: "El stat es",
    rollValue: "Valor",
    rollPlaceholder: "p. ej. 180",
    rollResult: "del camino entre la peor tirada y la mejor",
    rollOut: "Ese valor está fuera del rango de este stat.",
    rollRange: "Rango",
  },
  builder: {
    h1: "Armador de builds",
    lede: "Elegí el mod de cada casillero, poné polaridades y mirá cómo cambian la capacidad y las stats. La build queda en la dirección: copiala para compartirla.",
    start: "Buscá un Warframe o un arma, o empezá con uno de estos.",
    frames: "Warframes",
    weapons: "Armas",
    pick: "Qué armar",
    searchPlaceholder: "Warframe o arma…",
    all: "Todos",
    kinds: { warframe: "Warframes", primary: "Primarias", secondary: "Secundarias", melee: "Cuerpo a cuerpo" },
    kind1: { warframe: "Warframe", primary: "Arma primaria", secondary: "Arma secundaria", melee: "Arma cuerpo a cuerpo" },
    count: (n) => `${n} a la vista`,
    none: "Nada coincide.",
    change: "Cambiar",
    close: "Cerrar",
    rank: (n) => `Rango ${n}`,
    toArsenal: "Ver en el Arsenal",
    capacity: "Capacidad",
    free: "Libre",
    formas: "Formas",
    reactor: "Reactor Orokin",
    catalyst: "Catalizador Orokin",
    over: (n) => `Te pasaste por ${n}: el juego no deja equipar esta build.`,
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    copyFail: "No se pudo copiar: el enlace está en la barra de direcciones.",
    pin: "Fijar como referencia",
    unpin: "Soltar la referencia",
    compare: "Comparación",
    legendBase: "Gris: sin mods",
    legendRef: "Gris: la referencia fijada",
    legendBuild: "Blanco: tu build",
    aura: "Aura",
    stance: "Postura",
    exilus: "Exilio",
    slots: "Casilleros",
    empty: "Vacío",
    tap: "tocá para elegir",
    noPol: "Sin polaridad",
    rankLabel: "Rango",
    rankDown: "Bajar rango",
    rankUp: "Subir rango",
    remove: "Quitar",
    polarity: "Polaridad",
    modSearch: (n) => `Buscar entre ${n} mods`,
    noMods: "Acá no entra ningún mod.",
    stats: "Estadísticas",
    stat: "Stat",
    base: "Base",
    ref: "Ref.",
    build: "Build",
    delta: "Cambio",
    isNew: "nuevo",
    groups: { damage: "Daño", crit: "Crítico y estado", gun: "Arma", frame: "Warframe", abilities: "Habilidades" },
    w: {
      perShot: "Daño por disparo", perHit: "Daño por golpe", perShotNote: "por proyectil × multidisparo", total: "Daño por proyectil", multishot: "Multidisparo",
      cc: "Prob. crítica", cd: "Multiplicador crítico", sc: "Prob. de estado", rate: "Cadencia", attackSpeed: "Velocidad de ataque", mag: "Cargador", reload: "Recarga",
    },
    f: { health: "Salud", shield: "Escudo", armor: "Armadura", energy: "Energía", strength: "Fuerza", duration: "Duración", efficiency: "Eficiencia", range: "Rango" },
    fx: {
      damage: "Daño", multishot: "Multidisparo", critChance: "Prob. crítica", critDamage: "Daño crítico", statusChance: "Prob. de estado",
      fireRate: "Cadencia", magazine: "Cargador", reload: "Velocidad de recarga", meleeDamage: "Daño cuerpo a cuerpo", attackSpeed: "Velocidad de ataque",
      strength: "Fuerza", duration: "Duración", efficiency: "Eficiencia", range: "Rango",
      health: "Salud", shield: "Escudo", armor: "Armadura", energy: "Energía",
    },
    modsIn: "Mods de la build",
    noModsYet: "Todavía sin mods.",
    notCounted: "no se cuenta",
    partly: "se cuenta en parte",
    note: "Valores del Arsenal a rango 30, sin arcanos, Riven ni efectos condicionales (al matar, al apuntar…): esos se muestran como texto y no se cuentan.",
  },
  baroPage: {
    h1: "Baro Ki'Teer",
    lede: "El Comerciante del Vacío llega a un relé cada dos semanas y se queda 48 horas, vendiendo por ducados y créditos. Acá está su visita de ahora y cada visita que anotamos.",
    now: "Ahora",
    here: (relay) => `En ${relay}`,
    coming: (relay) => `Próxima parada: ${relay}`,
    leaves: (time, when) => `Se va en ${time} (${when})`,
    arrives: (time, when) => `Llega en ${time} (${when})`,
    item: "Objeto",
    ducats: "Ducados",
    credits: "Créditos",
    noItems: "Su inventario todavía no aparece.",
    history: "Visitas anteriores",
    visit: (from, to) => `${from} – ${to}`,
    items: (n) => (n === 1 ? "1 objeto" : `${n} objetos`),
    noHistory: "Todavía no hay visitas anotadas: se anotan desde el 27/10/2026.",
  },
  // De warframe-worldstate-data (MIT, `data/es/missionTypes.json`); los que no trae, del nombre de su nodo en el export
  // en español (Descenso, Confrontación, Repetidor, Cosecha de legacito, El Circuito) o del diccionario del juego
  // (`dict.es.json` de warframe-public-export-plus: Estampida, Armagedón del Vacío, Defensa del altar, La Rebelión de Perita).
  missionType: {
    Assassination: "Asesinato", Exterminate: "Exterminio", Survival: "Supervivencia", Rescue: "Rescate", Sabotage: "Sabotaje", Capture: "Captura",
    Spy: "Espionaje", Defense: "Defensa", "Mobile Defense": "Defensa móvil", Interception: "Interceptación", Hijack: "Usurpación", Hive: "Colmena",
    Excavation: "Excavación", "Infested Salvage": "Salvamento Infestado", Arena: "Rathuum", Pursuit: "Persecución", Rush: "Estampida", Assault: "Asalto",
    Defection: "Deserción", "Free Roam": "Recorrido libre", "The Circuit": "El Circuito", Disruption: "Interrupción", "Void Flood": "Inundación del Vacío",
    "Void Cascade": "Cascada del Vacío", "Void Armageddon": "Armagedón del Vacío", Alchemy: "Alquimia", "Legacyte Harvest": "Cosecha de legacito",
    "Shrine Defense": "Defensa del altar", Faceoff: "Confrontación", Descent: "Descenso", "The Perita Rebellion": "La Rebelión de Perita", Relay: "Repetidor",
  },
  // De warframe-worldstate-data (`data/es/factionsData.json`): los Orokin del mapa son los Corruptos del Vacío. El murmullo
  // sale del diccionario del juego; los Anarcas no tienen nombre de facción, el juego los llama "anarcas" en sus textos.
  faction: {
    Grineer: "Grineer", Corpus: "Corpus", Infested: "Infestados", Orokin: "Corruptos", Sentient: "Consciente", "The Murmur": "El murmullo",
    Scaldra: "Scaldra", Techrot: "Techrot", Duviri: "Duviri", Anarchs: "Anarcas",
  },
  rewardLabel: { Caches: "Cachés", "Survival Extra": "Supervivencia extra", "Assassination Extra": "Asesinato extra" },
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
