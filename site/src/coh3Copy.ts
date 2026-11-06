/**
 * Los textos de la cáscara de Company of Heroes 3 (2026-11-04), en inglés y español: pestañas, SEO, portada y lo que
 * comparten las pantallas. Fuera de un componente (prerender) se usa `COH3_COPY[lang]`; adentro, `useCoh3Copy()`.
 *
 * Cada pestaña lleva sus propios textos en su carpeta (`coh3/<pestaña>/copy.ts`), así no viajan todos en el chunk
 * del área.
 */
import { useLang, type Lang } from "./i18n";
import type { Coh3Section, Coh3Tab } from "./route";

/** El orden de las pestañas en la barra. Jugadores y Partidas no van: se llega desde el ranking o el buscador. */
export const COH3_TABS: Coh3Section[] = ["home", "leaderboards", "ranks", "stats", "tier-list", "units", "weapons", "battlegroups", "commanders", "doctrines", "bulletins", "penetration", "dps", "patches", "maps", "challenges", "achievements", "final-stand"];

/** Las cuatro facciones, con su clave en los datos y su emblema en `public/coh3/i/`. */
export type Faction = "american" | "british" | "german" | "dak";
export const FACTIONS: Faction[] = ["american", "british", "german", "dak"];
export const FACTION_ICON: Record<Faction, string> & Record<string, string | undefined> = {
  american: "/coh3/f/american.webp",
  british: "/coh3/f/british.webp",
  german: "/coh3/f/german.webp",
  dak: "/coh3/f/dak.webp",
};
/** Del bando de cada facción: sólo se cruzan Aliados contra Eje. */
export const SIDE: Record<Faction, "allies" | "axis"> = { american: "allies", british: "allies", german: "axis", dak: "axis" };

type Seo = { title: string; description: string };
/** Una descripción entra en 160 caracteres: lo que sobra se corta en una palabra entera. */
const clip = (s: string): string => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/[\s,;:]+\S*$/, "")}…`);

const EN = {
  tabs: {
    home: "Home", units: "Units", weapons: "Weapons", battlegroups: "Battlegroups", maps: "Maps", penetration: "Penetration",
    dps: "DPS", patches: "Patches", leaderboards: "Leaderboards", players: "Players", matches: "Matches", stats: "Stats",
    "tier-list": "Tier list", challenges: "Challenges", "final-stand": "Final Stand", ranks: "Ranks", achievements: "Achievements",
    commanders: "Commanders", bulletins: "Intel bulletins", doctrines: "Doctrines",
  } satisfies Record<Coh3Section, string>,
  // Indexables con cualquier clave: las pestañas en vivo reciben facciones de CoH1 y CoH2 como `string`.
  faction: { american: "US Forces", british: "British Forces", german: "Wehrmacht", dak: "Afrika Korps" } as Record<Faction, string> & Record<string, string | undefined>,
  factionShort: { american: "USF", british: "British", german: "Wehrmacht", dak: "DAK" } as Record<Faction, string> & Record<string, string | undefined>,
  modes: { "1v1": "1v1", "2v2": "2v2", "3v3": "3v3", "4v4": "4v4" },
  t: {
    loading: "Loading…",
    error: "Couldn't load this. Try again in a minute.",
    notFound: "Not found.",
    search: "Search",
    sortHint: "Tap a column header to sort.",
    patch: (p: string) => `Patch ${p}`,
    soon: "Coming soon",
    back: "Back",
    none: "—",
    mp: "manpower",
    mu: "munitions",
    fu: "fuel",
    pop: "pop",
  },
  home: {
    h1: "Company of Heroes 3 stats, units and leaderboards",
    kicker: (patch: string) => `Command post · patch ${patch}`,
    lede: "Every unit, weapon and battlegroup, what each gun penetrates at every range, who wins each matchup and the live leaderboards.",
    inLadder: (n: string) => `${n} in the 1v1 ladder`,
    tools: "Tools",
    explorer: "Explorer",
    live: "Live",
    cards: {
      leaderboards: "Top players by faction and mode, from 1v1 to 4v4, updated every minute.",
      stats: "Win rate by faction, matchup, map and Elo band, from every automatch game of the last weeks.",
      "tier-list": "Which faction is strongest on each map and in each matchup, by Elo band.",
      units: "Every unit with health, armor, cost, weapons, upgrades and veterancy.",
      weapons: "Damage, accuracy, penetration and range of every gun.",
      battlegroups: "Every battlegroup with its branches, abilities and unlocks.",
      penetration: "Front, side and rear: the chance to penetrate, shots and seconds to kill at every range.",
      dps: "Compare the damage per second of any two units against any target.",
      patches: "What changed unit by unit between patches.",
      maps: "Every multiplayer map with its points and size.",
      challenges: "Daily and weekly challenges and their rewards.",
      ranks: "Every league and how many players are in each, by faction and mode, with Elo and countries.",
      achievements: "Every achievement and the share of players who have it.",
      commanders: "Every commander with its abilities and the units it unlocks.",
      bulletins: "Every intel bulletin and what it boosts.",
      doctrines: "Every doctrine with its two branches, command point costs and the units they unlock.",
      "final-stand": "Final Stand perks, technologies and units.",
      players: "", matches: "", home: "",
    } satisfies Record<Coh3Section, string>,
  },
  seo: {
    home: { title: "Company of Heroes 3 Stats, Leaderboards and Unit Explorer", description: "CoH3 leaderboards, faction win rates, battlegroup tier list, every unit and weapon, a penetration calculator and patch changes. Free, updated daily." },
    units: { title: "CoH3 Units: Health, Armor, Cost and Weapons", description: "Every Company of Heroes 3 unit by faction with health, front/side/rear armor, cost, weapons, upgrades and veterancy." },
    weapons: { title: "CoH3 Weapons: Damage, Penetration and Range", description: "Every Company of Heroes 3 weapon with damage, accuracy, penetration and range at near, mid and far distance." },
    battlegroups: { title: "CoH3 Battlegroups: Abilities and Unlocks", description: "Every Company of Heroes 3 battlegroup with its branches, abilities, units and command point costs." },
    maps: { title: "CoH3 Maps: Points and Size", description: "Every Company of Heroes 3 multiplayer map with its players, size and resource points." },
    penetration: { title: "CoH3 Penetration Calculator: Front, Side and Rear Armor", description: "Will it penetrate? Chance to penetrate front, side and rear armor at every range, with shots and seconds to kill." },
    dps: { title: "CoH3 DPS Calculator: Compare Units", description: "Compare the damage per second of Company of Heroes 3 units against infantry and vehicles at every range." },
    patches: { title: "CoH3 Patch Changes Unit by Unit", description: "What changed in each Company of Heroes 3 patch: health, armor, cost, damage and penetration, unit by unit." },
    leaderboards: { title: "CoH3 Leaderboards: 1v1 to 4v4 by Faction", description: "Live Company of Heroes 3 leaderboards for every faction and mode: Elo, wins, losses and win rate." },
    players: { title: "CoH3 Player Stats", description: "Company of Heroes 3 player standings, recent matches and win rate by faction." },
    matches: { title: "CoH3 Match Details", description: "Company of Heroes 3 match details: players, factions, Elo change and stats." },
    stats: { title: "CoH3 Stats: Faction Win Rates and Matchups", description: "Company of Heroes 3 win rate by faction, matchup, map and Elo band, from every automatch game." },
    "tier-list": { title: "CoH3 Tier List: Best Faction by Map and Elo", description: "Company of Heroes 3 faction tier list for every map and matchup, by Elo band, from every automatch game. Updated daily." },
    challenges: { title: "CoH3 Daily and Weekly Challenges", description: "Company of Heroes 3 daily and weekly challenges with their rewards." },
    ranks: { title: "CoH3 Ranks: Leagues, Elo and Player Distribution", description: "Company of Heroes 3 ranking tiers from Brass to Challenger, the Elo for each league and how many players are in each, by faction and mode." },
    achievements: { title: "CoH3 Achievements: Global Unlock Rates", description: "Every Company of Heroes 3 achievement with what it asks and the share of players who have unlocked it, from most common to rarest." },
    commanders: { title: "Commanders", description: "Commanders and their abilities." },
    bulletins: { title: "Intel bulletins", description: "Intel bulletins and what they boost." },
    doctrines: { title: "Doctrines", description: "Doctrines and their branches." },
    "final-stand": { title: "CoH3 Final Stand: Perks, Technologies and Units", description: "Company of Heroes 3 Final Stand perks, technologies and units by faction." },
  } satisfies Record<Coh3Section, Seo>,
  detailSeo: (sec: Coh3Tab, name: string): Seo => {
    const d: Partial<Record<Coh3Tab, Seo>> = {
      units: { title: `${name} – CoH3 Unit Stats`, description: clip(`${name} in Company of Heroes 3: health, armor, cost, weapons, upgrades, veterancy and what it penetrates.`) },
      weapons: { title: `${name} – CoH3 Weapon Stats`, description: clip(`${name} in Company of Heroes 3: damage, accuracy, penetration and range at near, mid and far distance, and which units use it.`) },
      battlegroups: { title: `${/battlegroup$/i.test(name) ? name : `${name} Battlegroup`} – CoH3`, description: clip(`${name} battlegroup in Company of Heroes 3: branches, abilities, units and command point costs.`) },
      maps: { title: `${name} – CoH3 Map`, description: clip(`${name} in Company of Heroes 3: players, size, points and faction win rates.`) },
      patches: { title: `CoH3 ${name} Changes`, description: clip(`What changed in Company of Heroes 3 ${name}, unit by unit: health, armor, cost, damage and penetration.`) },
      players: { title: `${name} – CoH3 Player Stats`, description: clip(`${name} in Company of Heroes 3: standings, recent matches and win rate by faction.`) },
    };
    return d[sec] ?? { title: `${name} – Company of Heroes 3`, description: clip(`${name} in Company of Heroes 3.`) };
  },
  credit: "Icons and game data © Relic Entertainment / SEGA. Match stats: coh3stats.com open data.",
};

const ES: typeof EN = {
  tabs: {
    home: "Portada", units: "Unidades", weapons: "Armas", battlegroups: "Battlegroups", maps: "Mapas", penetration: "Penetración",
    dps: "DPS", patches: "Parches", leaderboards: "Ranking", players: "Jugadores", matches: "Partidas", stats: "Estadísticas",
    "tier-list": "Tier list", challenges: "Desafíos", "final-stand": "Final Stand", ranks: "Rangos", achievements: "Logros",
    commanders: "Comandantes", bulletins: "Boletines de inteligencia", doctrines: "Doctrinas",
  },
  faction: { american: "Fuerzas de EE. UU.", british: "Fuerzas británicas", german: "Wehrmacht", dak: "Afrika Korps" },
  factionShort: { american: "EE. UU.", british: "Británicos", german: "Wehrmacht", dak: "DAK" },
  modes: { "1v1": "1v1", "2v2": "2v2", "3v3": "3v3", "4v4": "4v4" },
  t: {
    loading: "Cargando…",
    error: "No se pudo cargar. Probá de nuevo en un minuto.",
    notFound: "No se encontró.",
    search: "Buscar",
    sortHint: "Tocá un encabezado para ordenar.",
    patch: (p: string) => `Parche ${p}`,
    soon: "Muy pronto",
    back: "Volver",
    none: "—",
    mp: "mano de obra",
    mu: "munición",
    fu: "combustible",
    pop: "población",
  },
  home: {
    h1: "Company of Heroes 3: estadísticas, unidades y ranking",
    kicker: (patch: string) => `Puesto de mando · parche ${patch}`,
    lede: "Cada unidad, arma y battlegroup, cuánto penetra cada cañón a cada distancia, quién gana cada cruce y el ranking en vivo.",
    inLadder: (n: string) => `${n} en el ranking 1v1`,
    tools: "Herramientas",
    explorer: "Explorador",
    live: "En vivo",
    cards: {
      leaderboards: "Los mejores por facción y modo, de 1v1 a 4v4, al minuto.",
      stats: "Porcentaje de victorias por facción, cruce, mapa y banda de ELO, de cada partida de automatch de las últimas semanas.",
      "tier-list": "Qué facción es la más fuerte en cada mapa y en cada cruce, por banda de ELO.",
      units: "Cada unidad con vida, blindaje, costo, armas, mejoras y veteranía.",
      weapons: "Daño, precisión, penetración y alcance de cada arma.",
      battlegroups: "Cada battlegroup con sus ramas, habilidades y lo que desbloquea.",
      penetration: "Frente, lateral y trasero: la probabilidad de penetrar y cuántos disparos y segundos hacen falta, a cada distancia.",
      dps: "Compará el daño por segundo de dos unidades contra cualquier blanco.",
      patches: "Qué cambió, unidad por unidad, entre parches.",
      maps: "Cada mapa multijugador con sus puntos y su tamaño.",
      challenges: "Los desafíos diarios y semanales y sus premios.",
      ranks: "Cada liga y cuántos jugadores hay en cada una, por facción y modo, con ELO y países.",
      achievements: "Todos los logros y qué parte de los jugadores tiene cada uno.",
      commanders: "Cada comandante con sus habilidades y las unidades que habilita.",
      bulletins: "Cada boletín de inteligencia y qué mejora.",
      doctrines: "Cada doctrina con sus dos ramas, el costo en puntos de mando y las unidades que habilitan.",
      "final-stand": "Las mejoras, tecnologías y unidades de Final Stand.",
      players: "", matches: "", home: "",
    },
  },
  seo: {
    home: { title: "Company of Heroes 3: estadísticas, ranking y unidades", description: "Ranking de CoH3, victorias por facción, tier list de battlegroups, cada unidad y arma, calculadora de penetración y cambios de cada parche. Gratis." },
    units: { title: "Unidades de CoH3: vida, blindaje, costo y armas", description: "Cada unidad de Company of Heroes 3 por facción con vida, blindaje frontal, lateral y trasero, costo, armas, mejoras y veteranía." },
    weapons: { title: "Armas de CoH3: daño, penetración y alcance", description: "Cada arma de Company of Heroes 3 con daño, precisión, penetración y alcance a corta, media y larga distancia." },
    battlegroups: { title: "Battlegroups de CoH3: habilidades y desbloqueos", description: "Cada battlegroup de Company of Heroes 3 con sus ramas, habilidades, unidades y costo en puntos de mando." },
    maps: { title: "Mapas de CoH3: puntos y tamaño", description: "Cada mapa multijugador de Company of Heroes 3 con sus jugadores, tamaño y puntos de recursos." },
    penetration: { title: "Calculadora de penetración de CoH3: frente, lateral y trasero", description: "¿Le entra o rebota? La probabilidad de penetrar el blindaje frontal, lateral y trasero a cada distancia, con disparos y segundos para matar." },
    dps: { title: "Calculadora de DPS de CoH3: compará unidades", description: "Compará el daño por segundo de las unidades de Company of Heroes 3 contra infantería y vehículos a cada distancia." },
    patches: { title: "Cambios de cada parche de CoH3, unidad por unidad", description: "Qué cambió en cada parche de Company of Heroes 3: vida, blindaje, costo, daño y penetración, unidad por unidad." },
    leaderboards: { title: "Ranking de CoH3: de 1v1 a 4v4 por facción", description: "El ranking en vivo de Company of Heroes 3 para cada facción y modo: ELO, victorias, derrotas y porcentaje." },
    players: { title: "Estadísticas de jugador de CoH3", description: "Posiciones, partidas recientes y porcentaje de victorias por facción de un jugador de Company of Heroes 3." },
    matches: { title: "Detalle de partida de CoH3", description: "El detalle de una partida de Company of Heroes 3: jugadores, facciones, cambio de ELO y estadísticas." },
    stats: { title: "Estadísticas de CoH3: victorias por facción y cruces", description: "Porcentaje de victorias de Company of Heroes 3 por facción, cruce, mapa y banda de ELO, de cada partida de automatch." },
    "tier-list": { title: "Tier list de CoH3: la mejor facción por mapa y ELO", description: "La tier list de facciones de Company of Heroes 3 en cada mapa y cruce, por banda de ELO, de cada partida de automatch. Se actualiza a diario." },
    challenges: { title: "Desafíos diarios y semanales de CoH3", description: "Los desafíos diarios y semanales de Company of Heroes 3 con sus premios." },
    ranks: { title: "Rangos de CoH3: ligas, ELO y jugadores por liga", description: "Las ligas de Company of Heroes 3 de Latón a Retador, el ELO de cada una y cuántos jugadores hay en cada liga, por facción y modo." },
    achievements: { title: "Logros de CoH3: qué porcentaje los tiene", description: "Todos los logros de Company of Heroes 3 con lo que piden y qué porcentaje de los jugadores los desbloqueó, del más común al más raro." },
    commanders: { title: "Comandantes", description: "Los comandantes y sus habilidades." },
    bulletins: { title: "Boletines de inteligencia", description: "Los boletines de inteligencia y qué mejoran." },
    doctrines: { title: "Doctrinas", description: "Las doctrinas y sus ramas." },
    "final-stand": { title: "Final Stand de CoH3: mejoras, tecnologías y unidades", description: "Las mejoras, tecnologías y unidades de Final Stand de Company of Heroes 3 por facción." },
  },
  detailSeo: (sec: Coh3Tab, name: string): Seo => {
    const d: Partial<Record<Coh3Tab, Seo>> = {
      units: { title: `${name}: stats de la unidad en CoH3`, description: clip(`${name} en Company of Heroes 3: vida, blindaje, costo, armas, mejoras, veteranía y qué penetra.`) },
      weapons: { title: `${name}: stats del arma en CoH3`, description: clip(`${name} en Company of Heroes 3: daño, precisión, penetración y alcance a corta, media y larga distancia, y qué unidades la usan.`) },
      battlegroups: { title: `Battlegroup ${name} de CoH3`, description: clip(`El battlegroup ${name} de Company of Heroes 3: ramas, habilidades, unidades y costo en puntos de mando.`) },
      maps: { title: `${name}: mapa de CoH3`, description: clip(`${name} en Company of Heroes 3: jugadores, tamaño, puntos y victorias por facción.`) },
      patches: { title: `Cambios de CoH3 ${name}`, description: clip(`Qué cambió en Company of Heroes 3 ${name}, unidad por unidad: vida, blindaje, costo, daño y penetración.`) },
      players: { title: `${name}: estadísticas de jugador de CoH3`, description: clip(`${name} en Company of Heroes 3: posiciones, partidas recientes y porcentaje de victorias por facción.`) },
    };
    return d[sec] ?? { title: `${name}: Company of Heroes 3`, description: clip(`${name} en Company of Heroes 3.`) };
  },
  credit: "Íconos y datos del juego © Relic Entertainment / SEGA. Estadísticas de partidas: datos abiertos de coh3stats.com.",
};

export const COH3_COPY: Record<Lang, typeof EN> = { en: EN, es: ES };
export type Coh3Copy = typeof EN;

export function useCoh3Copy(): Coh3Copy {
  const { lang } = useLang();
  return COH3_COPY[lang];
}

/**
 * Los textos propios de CoH2 y CoH1 (2026-11-06): portada y SEO. Las pestañas y lo compartido salen de `COH3_COPY`;
 * acá va sólo lo que nombra al juego.
 */
type LiveSec = "home" | "leaderboards" | "ranks" | "stats" | "tier-list" | "achievements" | "players" | "matches" | "units" | "weapons" | "commanders" | "bulletins" | "penetration" | "dps" | "maps" | "doctrines";
type GameText = { name: string; h1: string; lede: string; seo: Record<LiveSec, Seo>; credit: string; ranksCard: string };
const credito = {
  en: "Icons and game data © Relic Entertainment / SEGA. Not affiliated with Relic or SEGA.",
  es: "Íconos y datos del juego © Relic Entertainment / SEGA. Sin afiliación con Relic ni SEGA.",
};
function textos(lang: Lang, nombre: string, corto: string, facciones: string, sinBlindaje = false): GameText {
  const t = conBlindaje(lang, nombre, corto, facciones);
  if (!sinBlindaje) return t;
  // CoH1 no tiene blindaje numérico: cada arma rinde distinto según el tipo de objetivo.
  const s = t.seo;
  if (lang === "es") {
    s.units = { title: `Unidades de ${corto}: vida, costo y armas`, description: clip(`Cada unidad de ${nombre} por facción con vida, costo, armas, mejoras y habilidades.`) };
    s.penetration = { title: `Calculadora de penetración de ${corto}`, description: clip(`¿Penetra? La probabilidad de penetrar de frente y por detrás en ${nombre} a cada distancia, según el tipo de objetivo, con disparos y segundos para matar.`) };
  } else {
    s.units = { title: `${corto} Units: Health, Cost and Weapons`, description: clip(`Every ${nombre} unit by faction with health, cost, weapons, upgrades and abilities.`) };
    s.penetration = { title: `${corto} Penetration Calculator`, description: clip(`Will it penetrate? Chance to penetrate from the front and the rear in ${nombre} at every range, by target type, with shots and seconds to kill.`) };
  }
  return t;
}
function conBlindaje(lang: Lang, nombre: string, corto: string, facciones: string): GameText {
  if (lang === "es")
    return {
      name: nombre,
      h1: `${nombre}: ranking, ELO y estadísticas`,
      lede: `El ranking de ${facciones} con el ELO de cada jugador, quién gana en cada mapa y la cantidad de jugadores por nivel. Se actualiza todos los días.`,
      credit: credito.es,
      ranksCard: "Cada nivel del ranking y cuántos jugadores hay en cada uno, por facción y modo, con ELO y países.",
      seo: {
        home: { title: `${nombre}: ranking con ELO y estadísticas`, description: clip(`Ranking de ${corto} con el ELO real de cada jugador, victorias por facción, mapa y ELO, niveles y logros. Gratis y al día.`) },
        leaderboards: { title: `Ranking de ${corto} con ELO: 1v1 a 4v4 por facción`, description: clip(`El ranking de ${nombre} de cada facción y modo, con el ELO de cada jugador, victorias, derrotas y racha.`) },
        ranks: { title: `Niveles de ${corto}: cuántos jugadores hay en cada uno`, description: clip(`Cuántos jugadores de ${nombre} hay en cada nivel del ranking, por facción y modo, con su ELO y sus países.`) },
        stats: { title: `Estadísticas de ${corto}: victorias por facción, mapa y ELO`, description: clip(`Qué facción gana más en ${nombre}, en cada cruce, cada mapa y cada tramo de ELO, con las partidas de las últimas semanas.`) },
        "tier-list": { title: `Tier list de ${corto}: la mejor facción por mapa y ELO`, description: clip(`La tier list de facciones de ${nombre} en cada mapa y cruce, por tramo de ELO, con las partidas de automatch de las últimas semanas.`) },
        achievements: { title: `Logros de ${corto}: qué porcentaje los tiene`, description: clip(`Todos los logros de ${nombre}, lo que piden y qué parte de los jugadores los desbloqueó.`) },
        players: { title: `Jugadores de ${corto}`, description: clip(`Posiciones, partidas recientes y ELO de un jugador de ${nombre}.`) },
        matches: { title: `Partida de ${corto}`, description: clip(`Una partida de ${nombre}: jugadores, facciones y cambio de ELO.`) },
        units: { title: `Unidades de ${corto}: vida, blindaje, costo y armas`, description: clip(`Cada unidad de ${nombre} por facción con vida, blindaje, costo, armas, mejoras, habilidades y veteranía.`) },
        weapons: { title: `Armas de ${corto}: daño, penetración y alcance`, description: clip(`Cada arma de ${nombre} con daño, precisión, penetración y alcance a corta, media y larga distancia.`) },
        commanders: { title: `Comandantes de ${corto}: habilidades y unidades`, description: clip(`Cada comandante de ${nombre} con sus cinco habilidades y las unidades que habilitan.`) },
        bulletins: { title: `Boletines de inteligencia de ${corto}`, description: clip(`Todos los boletines de inteligencia de ${nombre}, qué mejoran y para qué facciones sirven.`) },
        penetration: { title: `Calculadora de penetración de ${corto}`, description: clip(`¿Penetra? La probabilidad de penetrar el blindaje frontal y trasero en ${nombre} a cada distancia, con disparos y segundos para matar.`) },
        dps: { title: `Calculadora de DPS de ${corto}: comparar unidades`, description: clip(`El daño por segundo de las unidades de ${nombre} contra infantería y vehículos a cada distancia.`) },
        maps: { title: `Mapas de ${corto}`, description: clip(`Cada mapa de multijugador de ${nombre} con sus jugadores, tamaño y puntos.`) },
        doctrines: { title: `Doctrinas de ${corto}: ramas y puntos de mando`, description: clip(`Cada doctrina de ${nombre} con sus dos ramas, el costo en puntos de mando y las unidades que habilitan.`) },
      },
    };
  return {
    name: nombre,
    h1: `${nombre} leaderboards, Elo and stats`,
    lede: `The ${facciones} leaderboards with every player's Elo, who wins on each map and how many players sit at each level. Updated daily.`,
    credit: credito.en,
    ranksCard: "Every ranking level and how many players are in each, by faction and mode, with Elo and countries.",
    seo: {
      home: { title: `${nombre} Leaderboards with Elo and Stats`, description: clip(`${corto} leaderboards with every player's real Elo, faction win rates by map and Elo, rank levels and achievements. Free, updated daily.`) },
      leaderboards: { title: `${corto} Leaderboards with Elo: 1v1 to 4v4 by Faction`, description: clip(`${nombre} leaderboards for every faction and mode, with each player's Elo, wins, losses and streak.`) },
      ranks: { title: `${corto} Ranks: Players per Level by Faction`, description: clip(`How many ${nombre} players sit at each ranking level, by faction and mode, with Elo and countries.`) },
      stats: { title: `${corto} Stats: Faction Win Rates by Map and Elo`, description: clip(`Which ${nombre} faction wins most in each matchup, on each map and in each Elo band, from recent automatch games.`) },
      "tier-list": { title: `${corto} Tier List: Best Faction by Map and Elo`, description: clip(`${nombre} faction tier list for every map and matchup, by Elo band, from recent automatch games.`) },
      achievements: { title: `${corto} Achievements: Global Unlock Rates`, description: clip(`Every ${nombre} achievement with what it asks and the share of players who have unlocked it.`) },
      players: { title: `${corto} Player Stats`, description: clip(`${nombre} player standings, recent matches and Elo.`) },
      matches: { title: `${corto} Match Details`, description: clip(`${nombre} match details: players, factions and Elo change.`) },
      units: { title: `${corto} Units: Health, Armor, Cost and Weapons`, description: clip(`Every ${nombre} unit by faction with health, armor, cost, weapons, upgrades, abilities and veterancy.`) },
      weapons: { title: `${corto} Weapons: Damage, Penetration and Range`, description: clip(`Every ${nombre} weapon with damage, accuracy, penetration and range at near, mid and far distance.`) },
      commanders: { title: `${corto} Commanders: Abilities and Units`, description: clip(`Every ${nombre} commander with its five abilities and the units they unlock.`) },
      bulletins: { title: `${corto} Intel Bulletins`, description: clip(`Every ${nombre} intel bulletin, what it boosts and which factions can use it.`) },
      penetration: { title: `${corto} Penetration Calculator`, description: clip(`Will it penetrate? Chance to penetrate front and rear armor in ${nombre} at every range, with shots and seconds to kill.`) },
      dps: { title: `${corto} DPS Calculator: Compare Units`, description: clip(`Compare the damage per second of ${nombre} units against infantry and vehicles at every range.`) },
      maps: { title: `${corto} Maps`, description: clip(`Every ${nombre} multiplayer map with its players, size and points.`) },
      doctrines: { title: `${corto} Doctrines: Branches and Command Points`, description: clip(`Every ${nombre} doctrine with its two branches, command point costs and the units they unlock.`) },
    },
  };
}
export const COH_GAME_COPY: Record<"coh2" | "coh1", Record<Lang, GameText>> = {
  coh2: {
    en: textos("en", "Company of Heroes 2", "CoH2", "Ostheer, Soviets, OKW, US Forces and British"),
    es: textos("es", "Company of Heroes 2", "CoH2", "Ostheer, soviéticos, OKW, EE. UU. y británicos"),
  },
  coh1: {
    en: textos("en", "Company of Heroes", "CoH1", "Americans, Wehrmacht, British and Panzer Elite", true),
    es: textos("es", "Company of Heroes", "CoH1", "estadounidenses, Wehrmacht, británicos y Panzer Elite", true),
  },
};
/** El SEO de una pestaña de CoH2 o CoH1; una que no tiene texto propio cae en la portada. */
export function cohGameSeo(game: "coh2" | "coh1", lang: Lang, sec: string, detailName?: string | null): Seo {
  const g = COH_GAME_COPY[game][lang];
  if (sec === "players" && detailName) return { title: `${detailName} – ${g.seo.players.title}`, description: g.seo.players.description };
  // Una ficha de la enciclopedia: el nombre adelante, y el resto del título de su pestaña.
  if ((sec === "units" || sec === "weapons" || sec === "commanders" || sec === "doctrines" || sec === "maps") && detailName) {
    const base = g.seo[sec];
    return { title: `${detailName} – ${base.title.split(":")[0]}`, description: clip(`${detailName}. ${base.description}`) };
  }
  return g.seo[sec as LiveSec] ?? g.seo.home;
}
