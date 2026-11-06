import type { Lang } from "./i18n";
import type { Achievement, Group, Tier } from "./deadlockAchievements";

/** Los textos de los logros y de las pestañas del perfil. */

const nf = (lang: Lang) => (n: number) => n.toLocaleString(lang);

const METRIC: Record<Lang, Record<string, string>> = {
  en: {
    rank: "Rank",
    kills: "Kills",
    assists: "Assists",
    player_damage: "Damage",
    net_worth: "Souls",
    last_hits: "Last hits",
    wins: "Wins",
    matches: "Matches played",
    max_kills_per_match: "Kills in one match",
    boss_damage: "Objective damage",
    hero_bullets_hit_crit: "Headshots",
  },
  es: {
    rank: "Rango",
    kills: "Kills",
    assists: "Asistencias",
    player_damage: "Daño",
    net_worth: "Almas",
    last_hits: "Golpes de gracia",
    wins: "Victorias",
    matches: "Partidas jugadas",
    max_kills_per_match: "Kills en una partida",
    boss_damage: "Daño a objetivos",
    hero_bullets_hit_crit: "Tiros a la cabeza",
  },
};

export const ACH_COPY = {
  en: {
    tabs: { overview: "Overview", matches: "Matches", heroes: "Heroes", rank: "Rank", achievements: "Achievements" },
    tiers: { eternal: "Eternal", gold: "Gold", silver: "Silver", bronze: "Bronze" } as Record<Tier, string>,
    groups: {
      world: "World records",
      mastery: "Mastery",
      feats: "Feats",
      rank: "Rank",
      season: "Seasons",
    } as Record<Group, string>,
    all: "All",
    earned: (n: number) => `${n} earned`,
    next: "Up next",
    nextLead: "The closest ones to unlock.",
    none: "No achievements yet. Play a few ranked matches and come back.",
    lead: "Medals earned by playing. World records are the top 10 of each hero (top 100 for all heroes) in ranked, per season.",
    best: "Best achievements",
    seeAll: (n: number) => `See all ${n}`,
    howTiers: "Bronze, silver, gold and eternal: the higher the metal, the harder it is.",
  },
  es: {
    tabs: { overview: "Resumen", matches: "Partidas", heroes: "Héroes", rank: "Rango", achievements: "Logros" },
    tiers: { eternal: "Eterna", gold: "Oro", silver: "Plata", bronze: "Bronce" } as Record<Tier, string>,
    groups: {
      world: "Récords del mundo",
      mastery: "Maestría",
      feats: "Hazañas",
      rank: "Rango",
      season: "Temporadas",
    } as Record<Group, string>,
    all: "Todos",
    earned: (n: number) => `${n} ganados`,
    next: "Lo próximo",
    nextLead: "Los que tenés más cerca.",
    none: "Todavía no hay logros. Jugá unas clasificatorias y volvé.",
    lead: "Medallas que se ganan jugando. Los récords del mundo son el top 10 de cada héroe (top 100 con todos los héroes) en clasificatorias, por temporada.",
    best: "Mejores logros",
    seeAll: (n: number) => `Ver los ${n}`,
    howTiers: "Bronce, plata, oro y eterna: cuanto más alto el metal, más difícil.",
  },
};

export type ProfileTab = keyof (typeof ACH_COPY)["en"]["tabs"];
export const PROFILE_TABS: ProfileTab[] = ["overview", "matches", "heroes", "rank", "achievements"];

/** El título y la línea de abajo de un logro. `hero` resuelve el nombre del héroe. */
export function achievementText(
  a: Achievement,
  lang: Lang,
  hero: (id: number) => string,
  rank: (badge: number) => string
): { title: string; detail: string } {
  const n = nf(lang);
  const es = lang === "es";
  const k = a.kind;
  switch (k.type) {
    case "record": {
      const m = METRIC[lang][k.metric] ?? k.metric;
      const lugar = es ? `#${k.place} del mundo` : `World #${k.place}`;
      if (k.metric === "rank") {
        return k.heroId == null
          ? { title: es ? "Ranking mundial" : "World ranking", detail: `${lugar} · Season ${k.season}` }
          : { title: es ? `Rango con ${hero(k.heroId)}` : `${hero(k.heroId)} rank`, detail: `${lugar} · Season ${k.season}` };
      }
      if (k.heroId == null) {
        return { title: m, detail: `${lugar} · ${es ? "todos los héroes" : "all heroes"} · Season ${k.season}` };
      }
      return { title: `${hero(k.heroId)} · ${m}`, detail: `${lugar} · Season ${k.season}` };
    }
    case "mastery":
      return a.progress
        ? {
            title: es ? `Maestría: ${hero(k.heroId)}` : `${hero(k.heroId)} mastery`,
            detail: es ? `${n(k.matches)} / ${n(k.need)} partidas` : `${n(k.matches)} / ${n(k.need)} matches`,
          }
        : {
            title: es ? `Maestría: ${hero(k.heroId)}` : `${hero(k.heroId)} mastery`,
            detail: es ? `${n(k.matches)} partidas con ${hero(k.heroId)}` : `${n(k.matches)} matches on ${hero(k.heroId)}`,
          };
    case "career":
      return {
        title: es ? `${n(k.need)} partidas` : `${n(k.need)} matches`,
        detail: a.progress
          ? `${n(k.matches)} / ${n(k.need)}`
          : es
            ? `${n(k.matches)} en total, con todos los héroes`
            : `${n(k.matches)} in total, all heroes`,
      };
    case "streak":
      return {
        title: es ? `Racha de ${k.need}` : `${k.need}-win streak`,
        detail: a.progress
          ? es
            ? `Tu mejor racha: ${k.n}`
            : `Your best streak: ${k.n}`
          : es
            ? `${k.n} victorias seguidas`
            : `${k.n} wins in a row`,
      };
    case "bestKills":
      return {
        title: es ? `Masacre de ${k.need}` : `${k.need}-kill rampage`,
        detail: a.progress
          ? es
            ? `Tu récord: ${k.n} kills`
            : `Your record: ${k.n} kills`
          : es
            ? `${k.n} kills en una partida con ${hero(k.heroId)}`
            : `${k.n} kills in one match on ${hero(k.heroId)}`,
      };
    case "bestSouls":
      return {
        title: es ? "Bolsillo lleno" : "Deep pockets",
        detail: a.progress
          ? es
            ? `Tu récord: ${n(k.n)} de ${n(k.need)} almas`
            : `Your record: ${n(k.n)} of ${n(k.need)} souls`
          : es
            ? `${n(k.n)} almas en una partida con ${hero(k.heroId)}`
            : `${n(k.n)} souls in one match on ${hero(k.heroId)}`,
      };
    case "deathless":
      return {
        title: es ? "Intocable" : "Untouchable",
        detail: a.progress
          ? `${k.n} / ${k.need} ${es ? "victorias sin morir" : "deathless wins"}`
          : es
            ? `${k.n} ${k.n === 1 ? "victoria" : "victorias"} sin morir ni una vez`
            : `${k.n} ${k.n === 1 ? "win" : "wins"} without dying once`,
      };
    case "peak":
      return { title: es ? `Pico de la Season ${k.season}` : `Season ${k.season} peak`, detail: rank(k.badge) };
    case "veteran":
      return {
        title: es ? "Veterano de la beta" : "Closed beta veteran",
        detail: es ? "Jugó clasificatorias en la Season 1" : "Played ranked in Season 1",
      };
  }
}
