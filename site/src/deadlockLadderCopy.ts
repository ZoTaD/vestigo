import type { Lang } from "./i18n";
import { REGIONS, type Region } from "./deadlockRegions";
import type { StatKey } from "./deadlockStatBoards";

/**
 * Los textos de las pestañas nuevas del leaderboard (2026-11-17): por héroe,
 * por estadística y "¿Entro?". Van aparte de `deadlockCopy.ts`, que ya pasa
 * las 4.000 líneas.
 */

export type LadderTab = "world" | "hero" | "stats" | "one-tricks" | "check";

export interface LadderCopy {
  tabs: Record<LadderTab, string>;
  regions: Record<Region | "all", string>;
  regionLabel: string;
  order: { label: string; rank: string; score: string };
  hero: {
    title: (hero: string) => string;
    lead: (hero: string, pool: string, floor: string) => string;
    howScore: string;
    cols: {
      player: string;
      heroes: string;
      matches: string;
      winRate: string;
      rank: string;
      kda: string;
      souls: string;
      damage: string;
      score: string;
    };
    scoreTitle: (score: string, hero: string) => string;
    kdaTitle: string;
    empty: string;
    emptyRegion: string;
    loading: string;
    pick: string;
    updated: (date: string) => string;
  };
  stats: {
    title: string;
    lead: string;
    stat: string;
    hero: string;
    anyHero: string;
    names: Record<StatKey, string>;
    value: string;
    matches: string;
    floor: (n: string) => string;
    loading: string;
    failed: string;
    empty: string;
  };
  check: {
    title: string;
    lead: string;
    placeholder: string;
    go: string;
    searching: string;
    notFound: string;
    failed: string;
    pickOne: string;
    world: string;
    worldIn: (place: string) => string;
    worldYes: string;
    worldNo: (left: string) => string;
    worldCount: (n: string, floor: string) => string;
    heroesTitle: string;
    heroIn: (place: string) => string;
    heroYes: string;
    heroNo: (left: string) => string;
    noRanked: string;
    matchesN: (n: string) => string;
    seeBoard: string;
  };
  worldAside: string;
  worldAsideLead: string;
}

export const LADDER_COPY: Record<Lang, LadderCopy> = {
  en: {
    tabs: { world: "World", hero: "By hero", stats: "Stats", "one-tricks": "One-tricks", check: "Am I in?" },
    regionLabel: "Region",
    regions: { all: "All regions", NA: "North America", EU: "Europe", SA: "South America", AS: "Asia", OC: "Oceania" },
    order: { label: "Order by", rank: "Rank", score: "Hero score" },
    hero: {
      title: (h) => `${h} leaderboard`,
      lead: (h, pool, floor) =>
        `The best ${h} players this season, out of ${pool} with ${floor}+ ranked matches on the hero.`,
      howScore:
        "Hero score, 0 to 100: 55% in-game rank, 20% wins, 15% kills, deaths, assists, souls, damage " +
        "and objective damage per minute, 10% MVP finishes. Wins and numbers are compared with players " +
        "of the same rank, and they count for less with few matches. 99 means better than 99% of the " +
        "players on the list.",
      cols: {
        player: "Player",
        heroes: "Top heroes",
        matches: "Matches",
        winRate: "Win rate",
        rank: "Rank",
        kda: "K / D / A per min",
        souls: "Souls / min",
        damage: "Damage / min",
        score: "Score",
      },
      scoreTitle: (s, h) => `Better than ${s}% of the ranked ${h} players we measure`,
      kdaTitle: "Kills, deaths and assists per minute with the hero",
      empty: "No one has enough ranked matches on this hero yet.",
      emptyRegion: "No one from this region makes the list yet.",
      loading: "Loading the leaderboard…",
      pick: "Pick a hero",
      updated: (d) => `Updated ${d}`,
    },
    stats: {
      title: "Stat leaderboards",
      lead: "Who leads every number in ranked this season. Averages need a minimum of matches so two lucky games do not top the list.",
      stat: "Stat",
      hero: "Hero",
      anyHero: "All heroes",
      names: {
        matches: "Most matches",
        wins: "Most wins",
        winrate: "Win rate",
        avg_kills_per_match: "Kills per match",
        avg_deaths_per_match: "Fewest deaths per match",
        avg_assists_per_match: "Assists per match",
        avg_player_damage_per_match: "Hero damage per match",
        avg_net_worth_per_match: "Souls per match",
        avg_last_hits_per_match: "Last hits per match",
        avg_denies_per_match: "Denies per match",
        avg_boss_damage_per_match: "Objective damage per match",
        max_kills_per_match: "Most kills in one match",
        max_player_damage_per_match: "Most damage in one match",
        max_net_worth_per_match: "Most souls in one match",
      },
      value: "Value",
      matches: "Matches",
      floor: (n) => `${n}+ ranked matches`,
      loading: "Loading…",
      failed: "deadlock-api is not answering right now. Try again in a minute.",
      empty: "No one qualifies for this list yet.",
    },
    check: {
      title: "Am I on the leaderboard?",
      lead: "Search your Steam name or paste your profile link. We check every hero list and how many ranked matches you still need.",
      placeholder: "Steam name, profile link or account ID",
      go: "Check",
      searching: "Searching…",
      notFound: "No Deadlock player found with that name.",
      failed: "deadlock-api is not answering right now. Try again in a minute.",
      pickOne: "Which one is you?",
      world: "World leaderboard",
      worldIn: (p) => `You are #${p} in the world.`,
      worldYes: "You have enough matches. You are outside the published top for now.",
      worldNo: (left) => `${left} more ranked matches to enter.`,
      worldCount: (n, floor) => `${n} of ${floor} ranked matches this season`,
      heroesTitle: "Hero leaderboards",
      heroIn: (p) => `#${p}`,
      heroYes: "Enough matches, outside the top",
      heroNo: (left) => `${left} matches to go`,
      noRanked: "No ranked matches this season yet.",
      matchesN: (n) => `${n} matches`,
      seeBoard: "See the list",
    },
    worldAside: "Leaderboard by hero",
    worldAsideLead: "Pick a hero to see its top players, with their score, numbers and region.",
  },
  es: {
    tabs: { world: "Mundo", hero: "Por héroe", stats: "Estadísticas", "one-tricks": "One-tricks", check: "¿Entro?" },
    regionLabel: "Región",
    regions: { all: "Todas las regiones", NA: "Norteamérica", EU: "Europa", SA: "Sudamérica", AS: "Asia", OC: "Oceanía" },
    order: { label: "Ordenar por", rank: "Rango", score: "Puntaje de héroe" },
    hero: {
      title: (h) => `Ranking de ${h}`,
      lead: (h, pool, floor) =>
        `Los mejores con ${h} esta temporada, de ${pool} jugadores con ${floor}+ partidas clasificatorias con el héroe.`,
      howScore:
        "Puntaje de héroe, de 0 a 100: 55% el rango del juego, 20% las victorias, 15% kills, muertes, " +
        "asistencias, almas, daño y daño a objetivos por minuto, y 10% las veces que terminó MVP. Las " +
        "victorias y los números se comparan con jugadores de su mismo rango, y con pocas partidas pesan " +
        "menos. 99 es mejor que el 99% de la lista.",
      cols: {
        player: "Jugador",
        heroes: "Sus héroes",
        matches: "Partidas",
        winRate: "Victorias",
        rank: "Rango",
        kda: "K / M / A por min",
        souls: "Almas / min",
        damage: "Daño / min",
        score: "Puntaje",
      },
      scoreTitle: (s, h) => `Mejor que el ${s}% de los que juegan ${h} en clasificatorias`,
      kdaTitle: "Kills, muertes y asistencias por minuto con el héroe",
      empty: "Todavía nadie tiene suficientes partidas clasificatorias con este héroe.",
      emptyRegion: "Todavía nadie de esta región entra en la lista.",
      loading: "Cargando el ranking…",
      pick: "Elegí un héroe",
      updated: (d) => `Actualizado el ${d}`,
    },
    stats: {
      title: "Rankings por estadística",
      lead: "Quién encabeza cada número en clasificatorias esta temporada. Los promedios piden un mínimo de partidas, para que dos partidas con suerte no encabecen la lista.",
      stat: "Estadística",
      hero: "Héroe",
      anyHero: "Todos los héroes",
      names: {
        matches: "Más partidas",
        wins: "Más victorias",
        winrate: "Porcentaje de victorias",
        avg_kills_per_match: "Kills por partida",
        avg_deaths_per_match: "Menos muertes por partida",
        avg_assists_per_match: "Asistencias por partida",
        avg_player_damage_per_match: "Daño a héroes por partida",
        avg_net_worth_per_match: "Almas por partida",
        avg_last_hits_per_match: "Últimos golpes por partida",
        avg_denies_per_match: "Denegadas por partida",
        avg_boss_damage_per_match: "Daño a objetivos por partida",
        max_kills_per_match: "Más kills en una partida",
        max_player_damage_per_match: "Más daño en una partida",
        max_net_worth_per_match: "Más almas en una partida",
      },
      value: "Valor",
      matches: "Partidas",
      floor: (n) => `${n}+ partidas clasificatorias`,
      loading: "Cargando…",
      failed: "deadlock-api no responde ahora. Probá de nuevo en un minuto.",
      empty: "Todavía nadie entra en esta lista.",
    },
    check: {
      title: "¿Estoy en el ranking?",
      lead: "Buscá tu nombre de Steam o pegá el enlace de tu perfil. Revisamos la lista de cada héroe y cuántas clasificatorias te faltan.",
      placeholder: "Nombre de Steam, enlace del perfil o ID de cuenta",
      go: "Revisar",
      searching: "Buscando…",
      notFound: "No encontramos a nadie en Deadlock con ese nombre.",
      failed: "deadlock-api no responde ahora. Probá de nuevo en un minuto.",
      pickOne: "¿Cuál sos?",
      world: "Ranking mundial",
      worldIn: (p) => `Estás en el puesto #${p} del mundo.`,
      worldYes: "Tenés las partidas. Por ahora quedás fuera del top publicado.",
      worldNo: (left) => `Te faltan ${left} clasificatorias para entrar.`,
      worldCount: (n, floor) => `${n} de ${floor} clasificatorias esta temporada`,
      heroesTitle: "Rankings por héroe",
      heroIn: (p) => `#${p}`,
      heroYes: "Con partidas, fuera del top",
      heroNo: (left) => `Faltan ${left} partidas`,
      noRanked: "Todavía no jugaste clasificatorias esta temporada.",
      matchesN: (n) => `${n} partidas`,
      seeBoard: "Ver la lista",
    },
    worldAside: "Ranking por héroe",
    worldAsideLead: "Elegí un héroe para ver sus mejores jugadores, con su puntaje, sus números y su región.",
  },
};

/** Las opciones del desplegable de región: todas primero, después cada una. */
export function regionOptions(c: LadderCopy): { value: Region | ""; label: string }[] {
  return [{ value: "", label: c.regions.all }, ...REGIONS.map((r) => ({ value: r, label: c.regions[r] }))];
}
