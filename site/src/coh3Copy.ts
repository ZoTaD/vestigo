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
export const COH3_TABS: Coh3Section[] = ["home", "leaderboards", "ranks", "stats", "tier-list", "units", "weapons", "battlegroups", "penetration", "dps", "patches", "maps", "challenges", "achievements", "final-stand"];

/** Las cuatro facciones, con su clave en los datos y su emblema en `public/coh3/i/`. */
export type Faction = "american" | "british" | "german" | "dak";
export const FACTIONS: Faction[] = ["american", "british", "german", "dak"];
export const FACTION_ICON: Record<Faction, string> = {
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
  } satisfies Record<Coh3Section, string>,
  faction: { american: "US Forces", british: "British Forces", german: "Wehrmacht", dak: "Afrika Korps" } satisfies Record<Faction, string>,
  factionShort: { american: "USF", british: "British", german: "Wehrmacht", dak: "DAK" } satisfies Record<Faction, string>,
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
