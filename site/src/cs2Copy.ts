/**
 * Los textos de la sección CS2 (2026-11-03), en inglés y español. Fuera de un componente (prerender, buscador de la
 * barra) se usa `CS2_COPY[lang]`; adentro, `useCs2Copy()`.
 *
 * Los nombres de skins, cajas y colecciones van en inglés en los dos idiomas (decisión de ZoTaD): están en los datos.
 * Acá va la interfaz y lo que se traduce: rarezas, desgastes y categorías, con sus nombres oficiales del juego.
 */
import { useLang } from "./i18n";
import type { Cs2DataTab, Cs2Section, Cs2Tab } from "./route";

/** El orden de las pestañas en la barra. */
export const CS2_TABS: Cs2Section[] = ["home", "skins", "cases", "market", "collections", "trade-up", "inventory", "crosshairs", "esports", "teams", "patches"];

/** Las rarezas como las deja `site_data.py` (`RARITY` de `cs2.py`), de la más alta a la más baja. */
export type Cs2Rarity = "contraband" | "extraordinary" | "covert" | "classified" | "restricted" | "milspec" | "industrial" | "consumer";
export const CS2_RARITIES: Cs2Rarity[] = ["contraband", "extraordinary", "covert", "classified", "restricted", "milspec", "industrial", "consumer"];
/** Las categorías de `CATS` en `site_data.py`, en el orden de los filtros. */
export type Cs2Cat = "rifles" | "pistols" | "smgs" | "heavy" | "knives" | "gloves" | "equipment";
export const CS2_CATS: Cs2Cat[] = ["rifles", "pistols", "smgs", "heavy", "knives", "gloves", "equipment"];
/** Los contenedores de `_kind` en `site_data.py`. */
export type Cs2Kind = "case" | "terminal" | "souvenir" | "package";

/** Los cinco desgastes en el orden de los precios (`WEARS` de `cs2.py`): abreviatura del mercado y cortes de float. */
export const WEARS = [
  { ab: "FN", from: 0, to: 0.07 },
  { ab: "MW", from: 0.07, to: 0.15 },
  { ab: "FT", from: 0.15, to: 0.38 },
  { ab: "WW", from: 0.38, to: 0.45 },
  { ab: "BS", from: 0.45, to: 1 },
] as const;

/** La probabilidad de cada grupo de una caja de armas (`ODDS` de `prices.py`), y la del objeto especial. */
export const CASE_ODDS: Partial<Record<Cs2Rarity, number>> = { covert: 0.0064, classified: 0.032, restricted: 0.1598, milspec: 0.7992 };
export const SPECIAL_ODDS = 0.0026;
export const KEY_PRICE = 2.49;

type Seo = { title: string; description: string };
/** Una descripción entra en 160 caracteres: lo que sobra se corta en una palabra entera. */
const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);

export interface Cs2Copy {
  tabs: Record<Cs2Section, string>;
  /** El título visible de cada pestaña, con el nombre del juego (la portada usa `home.h1`). */
  tabH1: Record<Exclude<Cs2Section, "home" | "crosshairs">, string>;
  loading: string;
  loadError: string;
  retry: string;
  seo: Record<Cs2Section, Seo>;
  detailSeo: Record<Cs2DataTab, (name: string) => Seo>;
  /** Una edición de Parches: `name` es "Parche del 28 de octubre de 2026" o el título del lanzamiento. */
  patchSeo: (name: string, launch: boolean) => Seo;
  /** Las fichas de la etapa 6b: un equipo, un jugador y un torneo, por su nombre. */
  esSeo: { teams: (name: string) => Seo; players: (name: string) => Seo; esports: (name: string) => Seo };
  rarity: Record<Cs2Rarity, string>;
  wear: [string, string, string, string, string];
  cat: Record<Cs2Cat, string>;
  kind: Record<Cs2Kind, string>;
  home: {
    kicker: string;
    h1: string;
    lede: string;
    ribbon: string;
    cards: Record<Cs2Tab, (n: string) => string>;
    pricesOf: (date: string) => string;
  };
  t: {
    skin: string;
    weapon: string;
    rarityCol: string;
    catCol: string;
    float: string;
    price: string;
    normal: string;
    stattrak: string;
    souvenir: string;
    suggested: string;
    suggestedHint: string;
    sugNote: string;
    wearCol: string;
    odds: string;
    priceFrom: string;
    priceTo: string;
    oddsEach: string;
    caseCol: string;
    key: string;
    ev: string;
    returns: string;
    returnsHint: string;
    evLine: (cost: string, ev: string, pct: string) => string;
    openCost: string;
    missing: string;
    special: (n: number) => string;
    skinsN: (n: number) => string;
    date: string;
    type: string;
    fromCases: string;
    fromCollections: string;
    noCases: string;
    collNoCases: string;
    listedNow: string;
    variants: string;
    terminalNote: string;
    noOdds: string;
    pricesNote: (date: string) => string;
    search: string;
    all: string;
    sort: string;
    sortRarity: string;
    sortPrice: string;
    sortReturn: string;
    sortDate: string;
    sortName: string;
    onlySt: string;
    onlySv: string;
    count: (n: string) => string;
    none: string;
    open: string;
  };
  /** La pestaña Equipos y las fichas de equipo, torneo y jugador (etapa 6b). */
  tm: {
    lede: string;
    world: string;
    regions: { europe: string; americas: string; asia: string };
    rank: (n: number) => string;
    regional: (region: string) => string;
    move: (n: number) => string;
    leader: string;
    coach: string;
    winnings: string;
    since: (y: string) => string;
    captain: string;
    inTeamSince: (y: string) => string;
    progress: string;
    progressLede: (rank: string) => string;
    achievements: string;
    place: (p: string) => string;
    maps: string;
    mapsLede: string;
    wonOf: (w: number, p: number) => string;
    onePlayed: string;
    defending: string;
    attacking: string;
    stronger: (side: "ct" | "t") => string;
    matches: string;
    won: string;
    lost: string;
    draw: string;
    forfeit: string;
    vs: (opp: string) => string;
    noData: string;
    statsSoon: string;
    age: (n: number) => string;
    roles: string;
    team: string;
    noTeam: string;
    participants: string;
    stage: string;
    credit: string;
  };
  /** La pestaña Torneos (etapa 6a). */
  es: {
    lede: string;
    live: string;
    startsOn: (date: string) => string;
    dates: (from: string, to: string) => string;
    prize: string;
    teams: (n: number) => string;
    organizer: string;
    watch: string;
    watchHint: string;
    noStream: string;
    tourMissing: string;
    next: string;
    results: string;
    loadingMatches: string;
    matchesError: string;
    noMatches: string;
    noResults: string;
    tbd: string;
    bo: (n: number) => string;
    today: string;
    tomorrow: string;
    yesterday: string;
    tournaments: string;
    ongoing: string;
    upcoming: string;
    concluded: string;
    vrs: string;
    vrsOf: (date: string) => string;
    vrsLede: string;
    regions: { global: string; europe: string; americas: string; asia: string };
    rank: string;
    team: string;
    since: (date: string) => string;
    points: string;
    isNew: string;
    whyTitle: (team: string, pts: string) => string;
    whyStart: (start: string) => string;
    factors: { bounty_offered: string; bounty_collected: string; network: string; lan: string };
    whyH2h: (h2h: string) => string;
    whyMatches: string;
    won: (opp: string) => string;
    lost: (opp: string) => string;
    credit: string;
  };
  /** La pestaña Parches (etapa 5). */
  pt: {
    lede: string;
    patch: string;
    launch: string;
    dir: { new: string; mid: string; fix: string };
    tally: { new: (n: number) => string; mid: (n: number) => string; fix: (n: number) => string };
    lines: (n: number) => string;
    official: string;
    steam: string;
    newer: string;
    older: string;
    archive: string;
    named: string;
    none: string;
  };
  /** La pestaña Mercado y el bloque de mercado de las fichas (etapa 4). */
  mk: {
    period: { "7v30": string; "1v7": string; "30v90": string };
    periodBefore: { "7v30": string; "1v7": string; "30v90": string };
    periodNow: { "7v30": string; "1v7": string; "30v90": string };
    minSales: string;
    kinds: { all: string; skins: string; cases: string };
    up: string;
    down: string;
    top: string;
    item: string;
    change: string;
    sales30: string;
    sales7: string;
    /** El encabezado corto de ventas del mes en la Pizarra, y el título de la columna de precio. */
    sales: string;
    price: string;
    none: string;
    note: string;
    block: string;
    variant: string;
    m90: string;
    m30: string;
    m7: string;
    m24: string;
    trend: string;
    blockNote: string;
    history: (days: number) => string;
  };
  /** La pestaña Inventario (etapa 3). */
  inv: {
    placeholder: string;
    go: string;
    loading: string;
    worth: (n: string) => string;
    noPrice: (n: number) => string;
    partial: string;
    all: string;
    sortBy: string;
    byTotal: string;
    byPrice: string;
    byName: string;
    each: string;
    error: { bad: string; private: string; notfound: string; busy: string; paste: string };
    paste: string;
    pasteHow: (hasLink: boolean) => string;
    pasteLink: string;
    pasteBox: string;
    pasteGo: string;
    empty: string;
    untradable: string;
    types: Record<string, string>;
  };
  /** La pestaña Trade-up (etapa 2). */
  tu: {
    build: string;
    find: string;
    kind: { n: string; st: string; sv: string };
    rarityIn: string;
    fee: string;
    searchAdd: string;
    fill: (n: number) => string;
    clear: string;
    example: string;
    inputs: (n: number, need: number) => string;
    results: string;
    collection: string;
    chance: string;
    ifWins: string;
    cost: string;
    ev: string;
    win: string;
    profit: string;
    netOf: (fee: string) => string;
    empty: string;
    remove: string;
    problem: { empty: string; mixed: string; rarity: string; st: string; sv: string; nocase: string; top: string; missing: (n: number) => string; extra: (n: number) => string };
    rules: string;
    target: string;
    searchTarget: string;
    inWear: string;
    needBelow: (n: string) => string;
    needBetween: (lo: string, hi: string) => string;
    noWear: (range: string) => string;
    chanceAll: (p: string) => string;
    noSource: string;
    candidates: string;
    fMax: string;
    tenOf: string;
    useThis: string;
  };
}

const EN: Cs2Copy = {
  tabs: { home: "Home", skins: "Skins", cases: "Cases", collections: "Collections", "trade-up": "Trade-up", inventory: "Inventory", market: "Market", patches: "Patches", esports: "Tournaments", teams: "Teams", players: "Players", crosshairs: "Crosshairs" },
  tabH1: {
    skins: "CS2 skins", cases: "CS2 cases", collections: "CS2 collections", "trade-up": "CS2 trade-up calculator",
    inventory: "CS2 inventory value", market: "CS2 skin market", patches: "CS2 patch notes", esports: "CS2 tournaments",
    teams: "CS2 pro teams", players: "CS2 pro players",
  },
  loading: "Loading…",
  loadError: "Couldn't load this page.",
  retry: "Retry",
  seo: {
    home: { title: "CS2 Skins, Cases & Prices | Vestigo", description: "Every CS2 skin, case and collection with today's price in each wear, case odds and expected value. Free, no gambling." },
    skins: { title: "CS2 Skins: Prices, Float Ranges & Cases | Vestigo", description: "All CS2 weapon, knife and glove skins with their price in each wear, StatTrak and Souvenir, float range and the case they drop from." },
    cases: { title: "CS2 Cases: Odds, Expected Value & Prices | Vestigo", description: "Every CS2 case, souvenir package and terminal with its price, the odds of each rarity and what opening it returns on average." },
    collections: { title: "CS2 Collections: Every Skin & Price | Vestigo", description: "Every CS2 weapon collection with its skins by rarity, their float ranges and prices, and the case or package it comes from." },
    teams: { title: "CS2 Pro Teams: Rosters, Maps & Ranking | Vestigo", description: "Every team in Valve's CS2 ranking: roster, how it has moved in the ranking, its titles, which maps it wins and whether it is stronger defending or attacking." },
    players: { title: "CS2 Pro Players: Teams, Roles & Prize Money | Vestigo", description: "CS2 pro players from the top 30 teams: nationality, age, roles, team and prize money." },
    esports: { title: "CS2 Tournaments, Matches & Valve Rankings | Vestigo", description: "CS2 tournaments live: today's and upcoming matches in your time zone, results, the stream, and Valve's official regional standings explained team by team." },
    patches: { title: "CS2 Patch Notes: Every Update | Vestigo", description: "Every CS2 update since the Limited Test, change by change: what's new, what changed and what got fixed, with the maps, weapons and cases it names." },
    market: { title: "CS2 Skin Market: Prices Going Up and Down | Vestigo", description: "Which CS2 skins and cases are going up and down in price this week, and which sell the most, from real Skinport sales." },
    inventory: { title: "CS2 Inventory Value Checker | Vestigo", description: "How much is your CS2 inventory worth? Paste your Steam profile and see every item with today's price, grouped by type. Free, no login." },
    crosshairs: { title: "CS2 Crosshair Generator & Sensitivity Converter | Vestigo", description: "Make your CS2 crosshair and copy its share code or console commands, convert old CSGO codes, and convert your sensitivity to Valorant, Deadlock, Apex and more." },
    "trade-up": { title: "CS2 Trade-Up Calculator: Odds, Floats & Profit | Vestigo", description: "Free CS2 trade-up calculator: the odds, exact float and price of every outcome, expected profit after fees, knife trade-ups and a reverse calculator." },
  },
  detailSeo: {
    skins: (n) => ({ title: `${n}: CS2 Price, Float & Cases | Vestigo`, description: clip(`${n}: price in every wear (normal, StatTrak and Souvenir), float range, rarity and the cases and collections it drops from.`) }),
    cases: (n) => ({ title: `${n}: CS2 Odds & Expected Value | Vestigo`, description: clip(`${n}: every skin inside with its price in each wear, the odds of each rarity, the knives and what opening it returns on average.`) }),
    collections: (n) => ({ title: `${n}: CS2 Skins & Prices | Vestigo`, description: clip(`${n}: every skin by rarity with its float range and price, and where the collection drops from.`) }),
  },
  esSeo: {
    teams: (n) => ({ title: `${n}: CS2 Roster, Maps & Ranking | Vestigo`, description: clip(`${n} in CS2: current roster, Valve ranking over time, recent results, which maps it wins and whether it is stronger defending or attacking, and its latest matches map by map.`) }),
    players: (n) => ({ title: `${n}: CS2 Player, Team & Role | Vestigo`, description: clip(`${n}, CS2 pro player: nationality, age, roles, current team and prize money.`) }),
    esports: (n) => ({ title: `${n}: CS2 Matches & Results | Vestigo`, description: clip(`${n} in CS2: dates, prize pool, teams and every match with its maps and the rounds won defending and attacking.`) }),
  },
  patchSeo: (n, launch) =>
    launch
      ? { title: `${n}: CS2 Update | Vestigo`, description: clip(`${n}: Valve's CS2 announcement, with what it adds and the cases and collections it names.`) }
      : { title: `CS2 Patch Notes: ${n} | Vestigo`, description: clip(`CS2 patch notes for the ${n}: every change by section, marked as new, changed or fixed, with the maps and weapons it touches.`) },
  rarity: {
    contraband: "Contraband", extraordinary: "Extraordinary", covert: "Covert", classified: "Classified",
    restricted: "Restricted", milspec: "Mil-Spec", industrial: "Industrial Grade", consumer: "Consumer Grade",
  },
  wear: ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"],
  cat: { rifles: "Rifles", pistols: "Pistols", smgs: "SMGs", heavy: "Heavy", knives: "Knives", gloves: "Gloves", equipment: "Equipment" },
  kind: { case: "Case", terminal: "Terminal", souvenir: "Souvenir package", package: "Collection package" },
  home: {
    kicker: "Counter-Strike 2",
    h1: "CS2 skins, cases and prices",
    lede: "Every skin with its price in each wear, every case with its odds and what it returns on average, every collection. No gambling, no case opening, nothing to sell.",
    ribbon: "What you get back on average per case opened",
    cards: {
      skins: (n) => `${n} weapon, knife and glove skins with float ranges and prices.`,
      cases: (n) => `${n} cases, terminals and souvenir packages with odds and expected value.`,
      collections: (n) => `${n} collections with every skin by rarity.`,
      "trade-up": () => "Odds, floats and profit of any contract, knife trade-ups and the reverse: what to put in to get the skin you want.",
      inventory: () => "Paste your Steam profile and see what your CS2 inventory is worth today, item by item.",
      market: () => "What's rising and falling this week, and what sells the most, from real sales.",
      patches: () => "Every update, change by change: what's new, what changed and what got fixed.",
      esports: () => "Live tournament with the stream, matches in your time zone and Valve's ranking explained.",
      teams: () => "Every ranked team: roster, ranking history, titles and which maps it wins, side by side.",
      players: () => "The players of the top 30 teams.",
      crosshairs: () => "Make your crosshair and copy its code, and convert your sensitivity to other games.",
    },
    pricesOf: (d) => `Prices of ${d}`,
  },
  t: {
    skin: "Skin",
    weapon: "Weapon",
    rarityCol: "Rarity",
    catCol: "Type",
    float: "Float",
    price: "Price",
    normal: "Normal",
    stattrak: "StatTrak™",
    souvenir: "Souvenir",
    suggested: "*",
    suggestedHint: "No listings: suggested price",
    sugNote: "Prices are the cheapest Skinport listing today. A price with * is Skinport's suggested price: nobody is selling that one right now.",
    wearCol: "Wear",
    odds: "Chance",
    priceFrom: "Price from",
    priceTo: "Price up to",
    oddsEach: "Each",
    caseCol: "Case",
    key: "Key",
    ev: "Expected value",
    returns: "You get back",
    returnsHint: "Expected value ÷ (case + key)",
    evLine: (cost, ev, pct) => `Opening it costs ${cost} for the case and key; on average you get something worth ${ev}, so you get back ${pct} of what you spent.`,
    openCost: "Case + key",
    missing: "missing prices",
    special: (n) => `Rare special item · ${n}`,
    skinsN: (n) => `${n} skin${n === 1 ? "" : "s"}`,
    date: "Released",
    type: "Type",
    fromCases: "Cases it drops from",
    fromCollections: "Collection",
    noCases: "It isn't in any case. It comes from its collection (weekly drops, souvenir packages or operations), from a trade-up, or you buy it.",
    collNoCases: "No case has this collection: its skins come from weekly drops, souvenir packages or operations, or from a trade-up.",
    listedNow: "Cheapest listing on Skinport today",
    variants: "Other phases",
    terminalNote: "Terminals don't open with a key: they offer skins one at a time at a fixed price, so they have no odds or expected value.",
    noOdds: "Valve doesn't publish odds for this container.",
    pricesNote: (d) => `Before fees, with the lowest Skinport listing of ${d}. A price with * is Skinport's suggested price: nobody is selling it right now. StatTrak drops 10% of the time.`,
    search: "Search",
    all: "All",
    sort: "Sort",
    sortRarity: "Rarity",
    sortPrice: "Price",
    sortReturn: "Returns",
    sortDate: "Newest",
    sortName: "Name",
    onlySt: "StatTrak",
    onlySv: "Souvenir",
    count: (n) => `${n} results`,
    none: "Nothing matches.",
    open: "Open",
  },
  tm: {
    lede: "Every team in Valve's ranking. Open one to see its roster, how it has moved, its titles and which maps it wins, defending or attacking.",
    world: "World ranking",
    regions: { europe: "Europe", americas: "Americas", asia: "Asia" },
    rank: (n) => `#${n} in the world`,
    regional: (r) => `in ${r}`,
    move: (n) => (n > 0 ? `▲ ${n} since last month` : n < 0 ? `▼ ${-n} since last month` : "Same as last month"),
    leader: "In-game leader",
    coach: "Coach",
    winnings: "Prize money",
    since: (y) => `Founded ${y}`,
    captain: "Captain",
    inTeamSince: (y) => `on the team since ${y}`,
    progress: "Valve ranking over time",
    progressLede: (r) => `Its world rank month by month. Today: ${r}.`,
    achievements: "Recent results",
    place: (p) => p.replace(" - ", "–"),
    maps: "Maps",
    mapsLede: "S and A-tier tournaments of the last 6 months. The rounds won on each side say whether the team is better defending (CT) or attacking (T) on that map.",
    wonOf: (w, p) => `won ${w} of ${p}`,
    onePlayed: "1 played",
    defending: "Defending (CT)",
    attacking: "Attacking (T)",
    stronger: (s) => (s === "ct" ? "Stronger defending" : "Stronger attacking"),
    matches: "Latest matches",
    won: "won",
    lost: "lost",
    draw: "draw",
    forfeit: "forfeit",
    vs: (o) => `vs ${o}`,
    noData: "No S or A-tier matches in the last 6 months.",
    statsSoon: "Per-player stats (rating, damage per round): coming soon.",
    age: (n) => `${n} years old`,
    roles: "Roles",
    team: "Team",
    noTeam: "No team",
    participants: "Teams",
    stage: "Matches",
    credit: "Teams, rosters, matches and logos via Liquipedia (CC BY-SA; logos are trademarks of each team). Ranking: Valve Regional Standings. Flags: flag-icons (MIT).",
  },
  es: {
    lede: "The tournament being played right now with its stream, upcoming matches in your time zone, results, and Valve's official ranking explained team by team.",
    live: "Live now",
    startsOn: (d) => `Starts ${d}`,
    dates: (a, b) => `${a} to ${b}`,
    prize: "prize pool",
    teams: (n) => `${n} teams`,
    organizer: "hosted by",
    watch: "Watch live on Twitch",
    watchHint: "The stream loads when you press play.",
    noStream: "Live, with no Twitch stream",
    tourMissing: "This tournament doesn't have its page yet. See every tournament in",
    next: "Upcoming matches",
    results: "Results",
    loadingMatches: "Loading matches…",
    matchesError: "Couldn't load the matches right now. The rest of the page is up to date.",
    noMatches: "No matches scheduled right now.",
    noResults: "No finished matches in the last few days.",
    tbd: "TBD",
    bo: (n) => `best of ${n}`,
    today: "Today",
    tomorrow: "Tomorrow",
    yesterday: "Yesterday",
    tournaments: "Tournaments",
    ongoing: "Live",
    upcoming: "Upcoming",
    concluded: "Finished",
    vrs: "Valve ranking",
    vrsOf: (d) => `Valve ranking · ${d}`,
    vrsLede: "The official ranking Valve uses to invite teams to the Majors. Updated on the first Monday of each month. Tap a team to see why it has those points.",
    regions: { global: "World", europe: "Europe", americas: "Americas", asia: "Asia" },
    rank: "Rank",
    team: "Team and players",
    since: (d) => `Since ${d}`,
    points: "Points",
    isNew: "new",
    whyTitle: (t, p) => `Why ${t} has ${p} points`,
    whyStart: (s) => `It starts with ${s} out of 2,000: the average of four things over the last 6 months, compared with every other team.`,
    factors: { bounty_offered: "What beating them paid out", bounty_collected: "Prize money it won", network: "Quality of the teams it beat", lan: "LAN wins" },
    whyH2h: (h) => `Head to head: ${h} points. Beating stronger teams adds, losing to weaker ones takes away.`,
    whyMatches: "Last matches that count",
    won: (o) => `Beat ${o}`,
    lost: (o) => `Lost to ${o}`,
    credit: "Matches and tournaments: Liquipedia (CC BY-SA). Team logos are trademarks of each team, via Liquipedia. Ranking: Valve Regional Standings.",
  },
  pt: {
    lede: "Every CS2 update, change by change: each line says whether it's new, a change or a fix, and which maps, weapons and cases it names.",
    patch: "Patch",
    launch: "Release",
    dir: { new: "New", mid: "Change", fix: "Fix" },
    tally: { new: (n) => `${n} new`, mid: (n) => `${n} change${n === 1 ? "" : "s"}`, fix: (n) => `${n} fix${n === 1 ? "" : "es"}` },
    lines: (n) => `${n} change${n === 1 ? "" : "s"}`,
    official: "Valve's official notes.",
    steam: "Read the announcement on Steam",
    newer: "Newer",
    older: "Older",
    archive: "Every patch",
    named: "Mentioned in this announcement",
    none: "This patch doesn't exist. Pick one from the list.",
  },
  mk: {
    period: { "7v30": "This week", "1v7": "Today", "30v90": "This month" },
    periodBefore: { "7v30": "Last 30 days", "1v7": "Last 7 days", "30v90": "Last 90 days" },
    periodNow: { "7v30": "last 7 days", "1v7": "today", "30v90": "last 30 days" },
    minSales: "Min. sales a month",
    kinds: { all: "All", skins: "Skins", cases: "Cases" },
    up: "Rising",
    down: "Falling",
    top: "Best sellers",
    item: "Item",
    change: "Change",
    sales30: "Sold this month",
    sales7: "Sold this week",
    sales: "Sold this month",
    price: "Typical sale price, before → now",
    none: "Nothing moves with these filters.",
    note: "Typical sale price: the middle of the real Skinport sales, so one odd sale doesn't move it. Only what sold 30 times or more this month for US$ 0.50 or more.",
    block: "Market",
    variant: "Version",
    m90: "Last 90 days",
    m30: "Last 30 days",
    m7: "Last 7 days",
    m24: "Today",
    trend: "Trend",
    blockNote: "What it actually sold for on Skinport: the typical sale price in each period (half of the sales went for more, half for less).",
    history: (d) => `Lowest price, last ${d} days`,
  },
  inv: {
    placeholder: "Steam profile URL, SteamID64 or custom name",
    go: "Check value",
    loading: "Reading the inventory from Steam…",
    worth: (n) => `${n} items · worth today`,
    noPrice: (n) => `${n} item${n === 1 ? "" : "s"} without a market price don't count.`,
    partial: "Only the first 6,000 items were read.",
    all: "All",
    sortBy: "Sort",
    byTotal: "Total value",
    byPrice: "Unit price",
    byName: "Name",
    each: "each",
    error: {
      bad: "That doesn't look like a Steam profile. Paste the profile URL, the SteamID64 (17 digits) or the custom name.",
      private: "That inventory is private. If it's yours, you can paste it by hand below.",
      notfound: "Steam doesn't know that profile.",
      busy: "Steam isn't answering right now. Try again in a few minutes or paste the inventory by hand.",
      paste: "That isn't a Steam inventory. Copy the whole page Steam shows and paste it again.",
    },
    paste: "Paste it by hand",
    pasteHow: (link) => (link ? "Open this link signed in to Steam, select all (Ctrl+A), copy and paste it here. Nothing leaves your computer." : "Open your inventory link on Steam signed in (steamcommunity.com/inventory/<your SteamID64>/730/2), copy it all and paste it here. Nothing leaves your computer."),
    pasteLink: "Open my inventory on Steam",
    pasteBox: "Paste the inventory here",
    pasteGo: "Read",
    empty: "This inventory has no CS2 items.",
    untradable: "not tradable",
    types: { Container: "Cases", Key: "Keys", Sticker: "Stickers", Agent: "Agents", Knife: "Knives", Gloves: "Gloves", Rifle: "Rifles", "Sniper Rifle": "Snipers", Pistol: "Pistols", SMG: "SMGs", Shotgun: "Shotguns", Machinegun: "Machine guns", Charm: "Charms", Graffiti: "Graffiti", "Music Kit": "Music kits", Patch: "Patches", Collectible: "Collectibles", Pass: "Passes", Tool: "Tools", Gift: "Gifts" },
  },
  tu: {
    build: "Build a contract",
    find: "Find a skin",
    kind: { n: "Normal", st: "StatTrak™", sv: "Souvenir" },
    rarityIn: "Input rarity",
    fee: "Fee",
    searchAdd: "Add a skin of this rarity…",
    fill: (n) => `Fill with ${n}`,
    clear: "Clear",
    example: "Load an example",
    inputs: (n, need) => `Inputs (${n}/${need})`,
    results: "Outcomes",
    collection: "Collection",
    chance: "Chance",
    ifWins: "Profit if it drops",
    cost: "Cost",
    ev: "Expected value",
    win: "Chance of making money",
    profit: "Expected profit",
    netOf: (fee) => `after a ${fee} fee`,
    empty: "Pick the input rarity and add skins with the search box.",
    remove: "Remove",
    problem: {
      empty: "Add skins to the contract.",
      mixed: "Every skin must have the same rarity.",
      rarity: "That rarity can't go into a contract.",
      st: "Some skins don't exist in StatTrak™.",
      sv: "Some skins don't exist as Souvenirs.",
      nocase: "Some Coverts come from a collection with no case: they can't give a knife or gloves.",
      top: "Some skins are already the top rarity of their collection.",
      missing: (n) => `${n} more skin${n === 1 ? "" : "s"} to complete the contract.`,
      extra: (n) => `${n} skin${n === 1 ? "" : "s"} too many for this contract.`,
    },
    rules: "Odds: each collection weighs by how many inputs it has, split among its outcomes. Output float uses each input's normalized float (the formula the community measured; Valve hasn't published it). 5 Coverts give a knife or gloves from one of their collections' cases. Souvenirs lose the attribute.",
    target: "I want",
    searchTarget: "Search the skin you want…",
    inWear: "in",
    needBelow: (n) => `The inputs' average normalized float must stay below ${n}.`,
    needBetween: (lo, hi) => `The inputs' average normalized float must stay between ${lo} and ${hi}.`,
    noWear: (range) => `This skin doesn't come in that wear: its float goes from ${range}.`,
    chanceAll: (p) => `With a full contract from its collection it drops ${p} of the time.`,
    noSource: "This skin can't come out of a contract.",
    candidates: "Inputs that work, cheapest first",
    fMax: "Max float",
    tenOf: "×10",
    useThis: "Use",
  },
};

const ES: Cs2Copy = {
  tabs: { home: "Inicio", skins: "Skins", cases: "Cajas", collections: "Colecciones", "trade-up": "Trade-up", inventory: "Inventario", market: "Mercado", patches: "Parches", esports: "Torneos", teams: "Equipos", players: "Jugadores", crosshairs: "Miras" },
  tabH1: {
    skins: "Skins de CS2", cases: "Cajas de CS2", collections: "Colecciones de CS2", "trade-up": "Calculadora de trade-up de CS2",
    inventory: "Valor del inventario de CS2", market: "Mercado de skins de CS2", patches: "Parches de CS2", esports: "Torneos de CS2",
    teams: "Equipos profesionales de CS2", players: "Jugadores profesionales de CS2",
  },
  loading: "Cargando…",
  loadError: "No se pudo cargar esta página.",
  retry: "Reintentar",
  seo: {
    home: { title: "Skins, cajas y precios de CS2 | Vestigo", description: "Cada skin, caja y colección de CS2 con el precio de hoy en cada desgaste, las probabilidades y el valor esperado de cada caja. Gratis, sin apuestas." },
    skins: { title: "Skins de CS2: precios, float y cajas | Vestigo", description: "Todas las skins de armas, cuchillos y guantes de CS2 con su precio en cada desgaste, StatTrak y Souvenir, rango de float y la caja de donde salen." },
    cases: { title: "Cajas de CS2: probabilidades, valor esperado y precios | Vestigo", description: "Cada caja, paquete de souvenir y terminal de CS2 con su precio, la probabilidad de cada rareza y cuánto devuelve abrirla en promedio." },
    collections: { title: "Colecciones de CS2: cada skin y su precio | Vestigo", description: "Cada colección de armas de CS2 con sus skins por rareza, su rango de float y precio, y la caja o el paquete de donde sale." },
    teams: { title: "Equipos profesionales de CS2: plantel, mapas y ranking | Vestigo", description: "Cada equipo del ranking de Valve de CS2: plantel, cómo se movió en el ranking, sus títulos, en qué mapas gana y si es más fuerte defendiendo o atacando." },
    players: { title: "Jugadores profesionales de CS2: equipos, roles y premios | Vestigo", description: "Jugadores profesionales de CS2 de los 30 mejores equipos: nacionalidad, edad, roles, equipo y premios." },
    esports: { title: "Torneos de CS2, partidos y ranking de Valve | Vestigo", description: "Los torneos de CS2 en vivo: partidos de hoy y próximos en tu hora, resultados, la transmisión y el ranking oficial de Valve explicado equipo por equipo." },
    patches: { title: "Parches de CS2: todas las actualizaciones | Vestigo", description: "Cada actualización de CS2 desde el Limited Test, cambio por cambio: qué es nuevo, qué cambió y qué se arregló, con los mapas, armas y cajas que nombra." },
    market: { title: "Mercado de skins de CS2: qué sube y qué baja de precio | Vestigo", description: "Qué skins y cajas de CS2 suben y bajan de precio esta semana, y cuáles se venden más, con ventas reales en Skinport." },
    inventory: { title: "Cuánto vale tu inventario de CS2 | Vestigo", description: "¿Cuánto vale tu inventario de CS2? Pegá tu perfil de Steam y mirá cada objeto con el precio de hoy, agrupado por tipo. Gratis y sin iniciar sesión." },
    crosshairs: { title: "Generador de mira y conversor de sensibilidad de CS2 | Vestigo", description: "Armá tu mira de CS2 y copiá su código o los comandos de consola, pasá códigos viejos de CSGO y convertí tu sensibilidad a Valorant, Deadlock, Apex y más." },
    "trade-up": { title: "Calculadora de trade-up de CS2: probabilidades, float y ganancia | Vestigo", description: "Calculadora de trade-up de CS2 gratis: probabilidad, float exacto y precio de cada resultado, ganancia esperada después de comisiones, cuchillos y calculadora inversa." },
  },
  detailSeo: {
    skins: (n) => ({ title: `${n}: precio, float y cajas en CS2 | Vestigo`, description: clip(`${n}: precio en cada desgaste (normal, StatTrak y Souvenir), rango de float, rareza y las cajas y colecciones de donde sale.`) }),
    cases: (n) => ({ title: `${n}: probabilidades y valor esperado en CS2 | Vestigo`, description: clip(`${n}: cada skin que trae con su precio en cada desgaste, la probabilidad de cada rareza, los cuchillos y cuánto devuelve abrirla en promedio.`) }),
    collections: (n) => ({ title: `${n}: skins y precios en CS2 | Vestigo`, description: clip(`${n}: cada skin por rareza con su rango de float y precio, y de dónde sale la colección.`) }),
  },
  esSeo: {
    teams: (n) => ({ title: `${n}: plantel, mapas y ranking en CS2 | Vestigo`, description: clip(`${n} en CS2: plantel actual, cómo se movió en el ranking de Valve, últimos resultados, en qué mapas gana y si es más fuerte defendiendo o atacando, y sus partidos mapa por mapa.`) }),
    players: (n) => ({ title: `${n}: jugador de CS2, equipo y rol | Vestigo`, description: clip(`${n}, jugador profesional de CS2: nacionalidad, edad, roles, equipo actual y premios.`) }),
    esports: (n) => ({ title: `${n}: partidos y resultados de CS2 | Vestigo`, description: clip(`${n} en CS2: fechas, premios, equipos y cada partido con sus mapas y las rondas ganadas defendiendo y atacando.`) }),
  },
  patchSeo: (n, launch) =>
    launch
      ? { title: `${n}: actualización de CS2 | Vestigo`, description: clip(`${n}: el anuncio de Valve para CS2, con lo que trae y las cajas y colecciones que nombra.`) }
      : { title: `${n.replace(/^Parche del /, "Parche de CS2 del ")} | Vestigo`, description: clip(`Las notas del ${n.replace(/^Parche del /, "parche de CS2 del ")}: cada cambio por sección, marcado como nuevo, cambio o arreglo, con los mapas y armas que toca.`) },
  rarity: {
    contraband: "Contrabando", extraordinary: "Extraordinario", covert: "Encubierto", classified: "Clasificado",
    restricted: "Restringido", milspec: "Grado militar", industrial: "Grado industrial", consumer: "Grado de consumo",
  },
  wear: ["Recién fabricado", "Casi nuevo", "Algo desgastado", "Bastante desgastado", "Deplorable"],
  cat: { rifles: "Rifles", pistols: "Pistolas", smgs: "Subfusiles", heavy: "Pesadas", knives: "Cuchillos", gloves: "Guantes", equipment: "Equipo" },
  kind: { case: "Caja", terminal: "Terminal", souvenir: "Paquete de souvenir", package: "Paquete de colección" },
  home: {
    kicker: "Counter-Strike 2",
    h1: "Skins, cajas y precios de CS2",
    lede: "Cada skin con su precio en cada desgaste, cada caja con sus probabilidades y cuánto devuelve en promedio, cada colección. Sin apuestas, sin abrir cajas, nada para vender.",
    ribbon: "Cuánto recuperás en promedio por caja abierta",
    cards: {
      skins: (n) => `${n} skins de armas, cuchillos y guantes con su float y precio.`,
      cases: (n) => `${n} cajas, terminales y paquetes de souvenir con probabilidades y valor esperado.`,
      collections: (n) => `${n} colecciones con cada skin por rareza.`,
      "trade-up": () => "Probabilidades, float y ganancia de cualquier contrato, cuchillos incluidos, y al revés: qué poner para sacar la skin que querés.",
      inventory: () => "Pegá tu perfil de Steam y mirá cuánto vale hoy tu inventario de CS2, objeto por objeto.",
      market: () => "Qué sube y qué baja esta semana, y qué se vende más, con ventas reales.",
      patches: () => "Cada actualización, cambio por cambio: qué es nuevo, qué cambió y qué se arregló.",
      esports: () => "El torneo en vivo con su transmisión, los partidos en tu hora y el ranking de Valve explicado.",
      teams: () => "Cada equipo del ranking: plantel, cómo se movió, títulos y en qué mapas gana, de qué lado.",
      players: () => "Los jugadores de los 30 mejores equipos.",
      crosshairs: () => "Armá tu mira y copiá su código, y pasá tu sensibilidad a otros juegos.",
    },
    pricesOf: (d) => `Precios del ${d}`,
  },
  t: {
    skin: "Skin",
    weapon: "Arma",
    rarityCol: "Rareza",
    catCol: "Tipo",
    float: "Float",
    price: "Precio",
    normal: "Normal",
    stattrak: "StatTrak™",
    souvenir: "Souvenir",
    suggested: "*",
    suggestedHint: "Sin publicaciones: precio sugerido",
    sugNote: "Los precios son la publicación más barata de hoy en Skinport. Un precio con * es el sugerido por Skinport: ahora nadie lo está vendiendo.",
    wearCol: "Desgaste",
    odds: "Probabilidad",
    priceFrom: "Precio desde",
    priceTo: "Precio hasta",
    oddsEach: "Cada una",
    caseCol: "Caja",
    key: "Llave",
    ev: "Valor esperado",
    returns: "Recuperás",
    returnsHint: "Valor esperado ÷ (caja + llave)",
    evLine: (cost, ev, pct) => `Abrirla cuesta ${cost} entre caja y llave; en promedio sale algo que vale ${ev}, así que recuperás el ${pct} de lo que gastaste.`,
    openCost: "Caja + llave",
    missing: "faltan precios",
    special: (n) => `Objeto especial · ${n}`,
    skinsN: (n) => `${n} skin${n === 1 ? "" : "s"}`,
    date: "Salió",
    type: "Tipo",
    fromCases: "Cajas de las que sale",
    fromCollections: "Colección",
    noCases: "No viene en ninguna caja. Sale de su colección (drops semanales, paquetes souvenir u operaciones), de un trade-up o se compra.",
    collNoCases: "Ninguna caja trae esta colección: sus skins salen de drops semanales, paquetes souvenir u operaciones, o de un trade-up.",
    listedNow: "Publicación más barata hoy en Skinport",
    variants: "Otras fases",
    terminalNote: "Las terminales no se abren con llave: ofrecen skins de a una a un precio fijo, así que no tienen probabilidades ni valor esperado.",
    noOdds: "Valve no publica probabilidades para este contenedor.",
    pricesNote: (d) => `Antes de comisiones, con la publicación más barata de Skinport del ${d}. Un precio con * es el sugerido por Skinport: ahora nadie lo está vendiendo. StatTrak sale el 10 % de las veces.`,
    search: "Buscar",
    all: "Todas",
    sort: "Orden",
    sortRarity: "Rareza",
    sortPrice: "Precio",
    sortReturn: "Devuelve",
    sortDate: "Más nuevas",
    sortName: "Nombre",
    onlySt: "StatTrak",
    onlySv: "Souvenir",
    count: (n) => `${n} resultados`,
    none: "No hay nada con eso.",
    open: "Abrir",
  },
  tm: {
    lede: "Cada equipo del ranking de Valve. Abrí uno para ver su plantel, cómo se movió, sus títulos y en qué mapas gana, defendiendo o atacando.",
    world: "Ranking mundial",
    regions: { europe: "Europa", americas: "América", asia: "Asia" },
    rank: (n) => `#${n} del mundo`,
    regional: (r) => `de ${r}`,
    move: (n) => (n > 0 ? `▲ ${n} desde el mes pasado` : n < 0 ? `▼ ${-n} desde el mes pasado` : "Igual que el mes pasado"),
    leader: "Líder",
    coach: "Entrenador",
    winnings: "Premios",
    since: (y) => `Desde ${y}`,
    captain: "Capitán",
    inTeamSince: (y) => `en el equipo desde ${y}`,
    progress: "Progresión en el ranking de Valve",
    progressLede: (r) => `Su puesto en el mundial mes a mes. Hoy, ${r}.`,
    achievements: "Últimos resultados",
    place: (p) => p.replace(/(\d+)(st|nd|rd|th)/g, "$1.º").replace(" - ", "–"),
    maps: "Mapas",
    mapsLede: "Torneos S y A de los últimos 6 meses. Las rondas ganadas de cada lado dicen si el equipo es mejor defendiendo (CT) o atacando (T) en ese mapa.",
    wonOf: (w, p) => `ganó ${w} de ${p}`,
    onePlayed: "1 jugado",
    defending: "Defendiendo (CT)",
    attacking: "Atacando (T)",
    stronger: (s) => (s === "ct" ? "Más fuerte defendiendo" : "Más fuerte atacando"),
    matches: "Últimos partidos",
    won: "ganó",
    lost: "perdió",
    draw: "empate",
    forfeit: "abandono",
    vs: (o) => `contra ${o}`,
    noData: "Sin partidos de torneos S o A en los últimos 6 meses.",
    statsSoon: "Estadísticas por jugador (rating, daño por ronda): próximamente.",
    age: (n) => `${n} años`,
    roles: "Roles",
    team: "Equipo",
    noTeam: "Sin equipo",
    participants: "Equipos",
    stage: "Partidos",
    credit: "Equipos, planteles, partidos y logos vía Liquipedia (CC BY-SA; los logos son marcas de cada equipo). Ranking: Valve Regional Standings. Banderas: flag-icons (MIT).",
  },
  es: {
    lede: "El torneo que se está jugando con su transmisión, los próximos partidos en tu hora, los resultados y el ranking oficial de Valve explicado equipo por equipo.",
    live: "En vivo",
    startsOn: (d) => `Empieza el ${d}`,
    dates: (a, b) => `Del ${a} al ${b}`,
    prize: "en premios",
    teams: (n) => `${n} equipos`,
    organizer: "organiza",
    watch: "Ver en vivo en Twitch",
    watchHint: "La transmisión carga cuando tocás para verla.",
    noStream: "En vivo, sin transmisión en Twitch",
    tourMissing: "Este torneo todavía no tiene su ficha. Mirá todos los torneos en",
    next: "Próximos partidos",
    results: "Resultados",
    loadingMatches: "Cargando partidos…",
    matchesError: "Ahora no se pudieron cargar los partidos. El resto de la página está al día.",
    noMatches: "No hay partidos programados por ahora.",
    noResults: "No hay partidos terminados en los últimos días.",
    tbd: "A definir",
    bo: (n) => `al mejor de ${n}`,
    today: "Hoy",
    tomorrow: "Mañana",
    yesterday: "Ayer",
    tournaments: "Torneos",
    ongoing: "En vivo",
    upcoming: "Próximos",
    concluded: "Terminados",
    vrs: "Ranking de Valve",
    vrsOf: (d) => `Ranking de Valve · ${d}`,
    vrsLede: "El ranking oficial con el que Valve invita a los equipos a los Majors. Se actualiza el primer lunes de cada mes. Tocá un equipo para ver por qué tiene esos puntos.",
    regions: { global: "Mundial", europe: "Europa", americas: "América", asia: "Asia" },
    rank: "Puesto",
    team: "Equipo y jugadores",
    since: (d) => `Desde el ${d}`,
    points: "Puntos",
    isNew: "nuevo",
    whyTitle: (t, p) => `Por qué ${t} tiene ${p} puntos`,
    whyStart: (s) => `Arranca con ${s} de 2.000 posibles: el promedio de cuatro cosas de los últimos 6 meses, comparado con el resto de los equipos.`,
    factors: { bounty_offered: "Lo que pagaba ganarle", bounty_collected: "Premios que ganó", network: "Nivel de los equipos que venció", lan: "Victorias en LAN" },
    whyH2h: (h) => `Cara a cara: ${h} puntos. Ganarle a uno mejor suma; perder con uno peor resta.`,
    whyMatches: "Últimos partidos que cuentan",
    won: (o) => `Le ganó a ${o}`,
    lost: (o) => `Perdió con ${o}`,
    credit: "Partidos y torneos: Liquipedia (CC BY-SA). Los logos son marcas de cada equipo, vía Liquipedia. Ranking: Valve Regional Standings.",
  },
  pt: {
    lede: "Cada actualización de CS2, cambio por cambio: cada línea dice si es algo nuevo, un cambio o un arreglo, y qué mapas, armas y cajas nombra.",
    patch: "Parche",
    launch: "Lanzamiento",
    dir: { new: "Nuevo", mid: "Cambio", fix: "Arreglo" },
    tally: { new: (n) => `${n} nuevo${n === 1 ? "" : "s"}`, mid: (n) => `${n} cambio${n === 1 ? "" : "s"}`, fix: (n) => `${n} arreglo${n === 1 ? "" : "s"}` },
    lines: (n) => `${n} cambio${n === 1 ? "" : "s"}`,
    official: "Notas oficiales de Valve, en inglés.",
    steam: "Ver el anuncio en Steam",
    newer: "Más nuevo",
    older: "Más viejo",
    archive: "Todos los parches",
    named: "Aparece en este anuncio",
    none: "Este parche no existe. Elegí uno de la lista.",
  },
  mk: {
    period: { "7v30": "Esta semana", "1v7": "Hoy", "30v90": "Este mes" },
    periodBefore: { "7v30": "Últimos 30 días", "1v7": "Últimos 7 días", "30v90": "Últimos 90 días" },
    periodNow: { "7v30": "últimos 7 días", "1v7": "hoy", "30v90": "últimos 30 días" },
    minSales: "Ventas mínimas por mes",
    kinds: { all: "Todo", skins: "Skins", cases: "Cajas" },
    up: "Suben",
    down: "Bajan",
    top: "Más vendidas",
    item: "Objeto",
    change: "Cambio",
    sales30: "Vendidas en el mes",
    sales7: "Vendidas en la semana",
    sales: "Vendidas en el mes",
    price: "Precio típico de venta, antes → ahora",
    none: "Nada se mueve con estos filtros.",
    note: "Precio típico de venta: el del medio de las ventas reales en Skinport, así una venta rara no lo mueve. Sólo lo que se vendió 30 veces o más en el mes por US$ 0,50 o más.",
    block: "Mercado",
    variant: "Versión",
    m90: "Últimos 90 días",
    m30: "Últimos 30 días",
    m7: "Últimos 7 días",
    m24: "Hoy",
    trend: "Tendencia",
    blockNote: "A cuánto se vendió de verdad en Skinport: el precio típico de venta de cada período (la mitad de las ventas fue más cara y la otra mitad más barata).",
    history: (d) => `Precio más bajo, últimos ${d} días`,
  },
  inv: {
    placeholder: "URL de tu perfil de Steam, SteamID64 o nombre",
    go: "Valuar",
    loading: "Leyendo el inventario en Steam…",
    worth: (n) => `${n} objetos · vale hoy`,
    noPrice: (n) => `${n} objeto${n === 1 ? "" : "s"} sin precio de mercado no ${n === 1 ? "suma" : "suman"}.`,
    partial: "Sólo se leyeron los primeros 6.000 objetos.",
    all: "Todo",
    sortBy: "Orden",
    byTotal: "Valor total",
    byPrice: "Precio unitario",
    byName: "Nombre",
    each: "c/u",
    error: {
      bad: "Eso no parece un perfil de Steam. Pegá la URL del perfil, el SteamID64 (17 dígitos) o el nombre personalizado.",
      private: "Ese inventario es privado. Si es el tuyo, podés pegarlo a mano acá abajo.",
      notfound: "Steam no conoce ese perfil.",
      busy: "Steam no está respondiendo. Probá en unos minutos o pegá el inventario a mano.",
      paste: "Eso no es un inventario de Steam. Copiá la página entera que muestra Steam y pegala de nuevo.",
    },
    paste: "Pegalo a mano",
    pasteHow: (link) => (link ? "Abrí este enlace con tu sesión de Steam, seleccioná todo (Ctrl+A), copialo y pegalo acá. Nada sale de tu computadora." : "Abrí el enlace de tu inventario en Steam con tu sesión (steamcommunity.com/inventory/<tu SteamID64>/730/2), copialo entero y pegalo acá. Nada sale de tu computadora."),
    pasteLink: "Abrir mi inventario en Steam",
    pasteBox: "Pegá el inventario acá",
    pasteGo: "Leer",
    empty: "Este inventario no tiene objetos de CS2.",
    untradable: "no intercambiable",
    types: { Container: "Cajas", Key: "Llaves", Sticker: "Stickers", Agent: "Agentes", Knife: "Cuchillos", Gloves: "Guantes", Rifle: "Rifles", "Sniper Rifle": "Francotiradores", Pistol: "Pistolas", SMG: "Subfusiles", Shotgun: "Escopetas", Machinegun: "Ametralladoras", Charm: "Llaveros", Graffiti: "Grafitis", "Music Kit": "Kits de música", Patch: "Parches", Collectible: "Coleccionables", Pass: "Pases", Tool: "Herramientas", Gift: "Regalos" },
  },
  tu: {
    build: "Armar contrato",
    find: "Busco esta skin",
    kind: { n: "Normal", st: "StatTrak™", sv: "Souvenir" },
    rarityIn: "Rareza de entrada",
    fee: "Comisión",
    searchAdd: "Sumar una skin de esta rareza…",
    fill: (n) => `Llenar con ${n}`,
    clear: "Vaciar",
    example: "Cargar un ejemplo",
    inputs: (n, need) => `Entradas (${n}/${need})`,
    results: "Resultados",
    collection: "Colección",
    chance: "Probabilidad",
    ifWins: "Ganancia si sale",
    cost: "Costo",
    ev: "Valor esperado",
    win: "Chance de ganar plata",
    profit: "Ganancia esperada",
    netOf: (fee) => `después de ${fee} de comisión`,
    empty: "Elegí la rareza de entrada y sumá skins con el buscador.",
    remove: "Quitar",
    problem: {
      empty: "Sumá skins al contrato.",
      mixed: "Todas las skins tienen que ser de la misma rareza.",
      rarity: "Esa rareza no se puede usar en un contrato.",
      st: "Hay skins que no existen en StatTrak™.",
      sv: "Hay skins que no existen en Souvenir.",
      nocase: "Hay Encubiertos de una colección que no sale de ninguna caja: no dan cuchillo ni guantes.",
      top: "Hay skins que ya son lo más alto de su colección.",
      missing: (n) => `${n === 1 ? "Falta" : "Faltan"} ${n} skin${n === 1 ? "" : "s"} para completar el contrato.`,
      extra: (n) => `${n === 1 ? "Sobra" : "Sobran"} ${n} skin${n === 1 ? "" : "s"} para este contrato.`,
    },
    rules: "Probabilidad: cada colección pesa según cuántas entradas aporta, repartido entre sus resultados. El float de salida usa el float normalizado de cada entrada (la fórmula que midió la comunidad; Valve no la publicó). 5 Encubiertos dan un cuchillo o guantes de la caja de alguna de sus colecciones. Los Souvenir pierden el atributo.",
    target: "Quiero",
    searchTarget: "Buscá la skin que querés…",
    inWear: "en",
    needBelow: (n) => `El float normalizado promedio de las entradas tiene que quedar por debajo de ${n}.`,
    needBetween: (lo, hi) => `El float normalizado promedio de las entradas tiene que quedar entre ${lo} y ${hi}.`,
    noWear: (range) => `Esta skin no viene en ese desgaste: su float va de ${range}.`,
    chanceAll: (p) => `Con un contrato entero de su colección sale el ${p} de las veces.`,
    noSource: "Esta skin no sale de ningún contrato.",
    candidates: "Entradas que sirven, de la más barata a la más cara",
    fMax: "Float máximo",
    tenOf: "×10",
    useThis: "Usar",
  },
};

export const CS2_COPY: Record<"en" | "es", Cs2Copy> = { en: EN, es: ES };
export const useCs2Copy = (): Cs2Copy => CS2_COPY[useLang().lang];
