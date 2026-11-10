/** Los textos de la pestaña Ranking de CoH3 (2026-11-04). */
import { useLang } from "../../i18n";

const EN = {
  k: "Live ladder",
  h1: (g: string) => `${g} leaderboards`,
  /** El rótulo de la tabla abierta ("Leaderboards 1v1 · Wehrmacht"). */
  label: "Leaderboards",
  lede: "Live automatch standings for each mode and faction. Tap a player to open their profile.",
  mode: "Mode",
  faction: "Faction",
  region: "Region",
  world: "World",
  regions: {
    europe: "Europe",
    "north-america": "North America",
    "south-america": "South America",
    asia: "Asia",
    oceania: "Oceania",
    "middle-east": "Middle East",
    africa: "Africa",
    unknown: "Unknown",
  } as Record<string, string>,
  col: { rank: "Rank", player: "Player", elo: "ELO", wins: "Wins", losses: "Losses", wr: "Win rate", streak: "Streak", last: "Last game" },
  lastShort: "Last game",
  regionRank: (n: string) => `#${n} in the region`,
  noRecent: "No recent games",
  eloLast: "Elo from the player's latest game",
  loading: "Loading the ladder…",
  empty: "Nobody here yet.",
  error: "The leaderboard didn't load. Try again in a minute.",
  retry: "Retry",
  prev: "Previous",
  next: "Next",
  page: (p: string, of: string) => `Page ${p} of ${of}`,
  players: (n: string) => `${n} ranked players`,
  find: "Find a player",
  findHint: "Look up anyone by their exact in-game name.",
  streakW: (n: number) => `${n} wins in a row`,
  streakL: (n: number) => `${n} losses in a row`,
};

const ES: typeof EN = {
  k: "Ranking en vivo",
  h1: (g: string) => `Ranking de ${g}`,
  label: "Ranking",
  lede: "Las posiciones de automatch de cada modo y facción, en vivo. Tocá un jugador para ver su ficha.",
  mode: "Modo",
  faction: "Facción",
  region: "Región",
  world: "Mundo",
  regions: {
    europe: "Europa",
    "north-america": "Norteamérica",
    "south-america": "Sudamérica",
    asia: "Asia",
    oceania: "Oceanía",
    "middle-east": "Medio Oriente",
    africa: "África",
    unknown: "Sin región",
  },
  col: { rank: "Puesto", player: "Jugador", elo: "ELO", wins: "Victorias", losses: "Derrotas", wr: "% victorias", streak: "Racha", last: "Última partida" },
  lastShort: "Últ. partida",
  regionRank: (n: string) => `#${n} en la región`,
  noRecent: "Sin partidas recientes",
  eloLast: "ELO de la última partida del jugador",
  loading: "Cargando el ranking…",
  empty: "Todavía no hay nadie.",
  error: "El ranking no cargó. Probá de nuevo en un minuto.",
  retry: "Reintentar",
  prev: "Anterior",
  next: "Siguiente",
  page: (p: string, of: string) => `Página ${p} de ${of}`,
  players: (n: string) => `${n} jugadores en el ranking`,
  find: "Buscar jugador",
  findHint: "Encontrá a cualquiera por su nombre exacto en el juego.",
  streakW: (n: number) => `${n} victorias seguidas`,
  streakL: (n: number) => `${n} derrotas seguidas`,
};

export function useLbCopy() {
  const { lang } = useLang();
  return lang === "es" ? ES : EN;
}
