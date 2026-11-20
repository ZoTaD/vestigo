/**
 * Los textos de la sección Age of Empires II (2026-11-20), en inglés y español. Diseño:
 * docs/superpowers/specs/2026-11-20-aoe2-design.md. Las pestañas suman sus textos acá a medida que se construyen.
 */
import { useLang, type Lang } from "./i18n";
import type { Aoe2Section, Aoe2Tab } from "./route";

/** El orden de las pestañas en la barra. */
export const AOE2_TABS: Aoe2Tab[] = ["leaderboards", "civilizations", "matchups", "maps", "players"];

type Seo = { title: string; description: string };

const en = {
  name: "Age of Empires II",
  tagline: "Definitive Edition · stats from every ranked game, updated daily",
  tabs: { leaderboards: "Leaderboards", players: "Players", matches: "Match", civilizations: "Civilizations", matchups: "Matchups", maps: "Maps" } satisfies Record<Aoe2Tab, string>,
  modes: { rm1v1: "Random Map 1v1", rmteam: "Random Map Team", ew1v1: "Empire Wars 1v1", ewteam: "Empire Wars Team", dm1v1: "Death Match 1v1", dmteam: "Death Match Team" },
  t: {
    soon: "Coming soon",
    building: "This tab is being built.",
    loading: "Loading…",
    small: "Small sample",
    smallNote: (n: number) => `Only ${n.toLocaleString("en")} games: take it as a hint, not a verdict.`,
    apiDown: "The game's servers aren't answering. Try again in a moment.",
    retry: "Try again",
  },
  home: {
    h1: "Age of Empires II: Definitive Edition stats",
    lead: "The ranked ladder, every player's profile and match history, and how each civilization does by rating, map and patch.",
  },
  seo: {
    home: { title: "Age of Empires II DE stats: ladder, civ win rates and player profiles", description: "Ranked ladder, player profiles with match history, and civilization win rates by rating, map and patch for AoE2: Definitive Edition, updated daily." },
    leaderboards: { title: "AoE2 DE leaderboards: Random Map, Empire Wars and Death Match", description: "Live Age of Empires II ranked ladders with rating, win rate, streak and a filter by country." },
    players: { title: "AoE2 DE player search", description: "Find any Age of Empires II player: rating, match history, civs, maps and rivals." },
    matches: { title: "AoE2 DE match", description: "Teams, civilizations, map and rating changes of an Age of Empires II match." },
    civilizations: { title: "AoE2 DE civilization win rates by rating, map and patch", description: "Which Age of Empires II civilizations win most in ranked, by rating band, map, mode and patch, with the sample size of every number." },
    matchups: { title: "AoE2 DE civ vs civ matchups", description: "Win rate of every Age of Empires II civilization against every other in ranked 1v1." },
    maps: { title: "AoE2 DE ranked maps and the best civs on each", description: "Age of Empires II ranked map pool: games, average length and the civilizations that win most on each map." },
  } satisfies Record<Aoe2Section, Seo>,
  detailSeo: (sec: Aoe2Tab, name: string): Seo =>
    sec === "maps"
      ? { title: `${name}: best civs in AoE2 DE`, description: `The Age of Empires II civilizations that win most on ${name}, by rating band.` }
      : { title: `${name} in AoE2 DE: win rate, best maps and matchups`, description: `How the ${name} do in ranked Age of Empires II: win rate by rating, best and worst maps and matchups.` },
};

const es: typeof en = {
  name: "Age of Empires II",
  tagline: "Definitive Edition · estadísticas de cada partida de ranking, al día",
  tabs: { leaderboards: "Ranking", players: "Jugadores", matches: "Partida", civilizations: "Civilizaciones", matchups: "Matchups", maps: "Mapas" },
  modes: { rm1v1: "Mapa aleatorio 1v1", rmteam: "Mapa aleatorio equipos", ew1v1: "Empire Wars 1v1", ewteam: "Empire Wars equipos", dm1v1: "Death Match 1v1", dmteam: "Death Match equipos" },
  t: {
    soon: "Muy pronto",
    building: "Esta pestaña se está construyendo.",
    loading: "Cargando…",
    small: "Muestra chica",
    smallNote: (n: number) => `Sólo ${n.toLocaleString("es")} partidas: tomalo como una pista, no como un veredicto.`,
    apiDown: "Los servidores del juego no responden. Probá de nuevo en un rato.",
    retry: "Reintentar",
  },
  home: {
    h1: "Estadísticas de Age of Empires II: Definitive Edition",
    lead: "El ranking, el perfil y el historial de cada jugador, y cómo le va a cada civilización según ELO, mapa y parche.",
  },
  seo: {
    home: { title: "Estadísticas de Age of Empires II DE: ranking, civs y perfiles", description: "Ranking, perfiles de jugador con historial de partidas y porcentaje de victoria de cada civilización por ELO, mapa y parche en AoE2: Definitive Edition, al día." },
    leaderboards: { title: "Ranking de AoE2 DE: mapa aleatorio, Empire Wars y Death Match", description: "Los rankings de Age of Empires II en vivo con ELO, % de victorias, racha y filtro por país." },
    players: { title: "Buscar jugadores de AoE2 DE", description: "Encontrá a cualquier jugador de Age of Empires II: ELO, historial, civs, mapas y rivales." },
    matches: { title: "Partida de AoE2 DE", description: "Equipos, civilizaciones, mapa y cambios de ELO de una partida de Age of Empires II." },
    civilizations: { title: "Porcentaje de victoria de las civs de AoE2 DE por ELO, mapa y parche", description: "Qué civilizaciones de Age of Empires II ganan más en ranking, por banda de ELO, mapa, modo y parche, con la muestra de cada cifra." },
    matchups: { title: "Matchups de AoE2 DE: civ contra civ", description: "Porcentaje de victoria de cada civilización de Age of Empires II contra cada una de las otras en 1v1." },
    maps: { title: "Mapas de ranking de AoE2 DE y las mejores civs en cada uno", description: "Los mapas de ranking de Age of Empires II: partidas, duración promedio y las civilizaciones que más ganan en cada uno." },
  },
  detailSeo: (sec, name) =>
    sec === "maps"
      ? { title: `${name}: las mejores civs en AoE2 DE`, description: `Las civilizaciones de Age of Empires II que más ganan en ${name}, por banda de ELO.` }
      : { title: `${name} en AoE2 DE: % de victorias, mejores mapas y matchups`, description: `Cómo les va a los ${name} en el ranking de Age of Empires II: % de victorias por ELO, mejores y peores mapas y matchups.` },
};

export const AOE2_COPY: Record<Lang, typeof en> = { en, es };
export const useAoe2Copy = () => AOE2_COPY[useLang().lang];
