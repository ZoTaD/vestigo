import { createContext, useContext } from "react";

/**
 * Every word on screen, in both languages.
 *
 * English is the default and the source of truth: the first readers of this site
 * are Riot's third-party review and Overwolf's dev-rel team, and the app has to
 * describe itself to them in their language without anyone flipping a switch.
 * Spanish is typed against the English shape, so a missing translation is a
 * compile error rather than a blank on the page.
 *
 * Prose lives here and only here. Nothing that renders text should hold a
 * sentence of its own — that is what let the whole app end up single-language.
 */

export type Lang = "en" | "es";

export const DEFAULT_LANG: Lang = "en";
const STORAGE_KEY = "vestigo.lang";

export function storedLang(): Lang {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "es" || saved === "en" ? saved : DEFAULT_LANG;
}

export function rememberLang(lang: Lang): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lang);
}

const EN = {
  brand: "Vestigo",
  games: {
    tft: "Teamfight Tactics",
    tftShort: "TFT",
    deadlock: "Deadlock",
    dota: "Dota 2",
    soon: "Soon",
    /** La insignia de una pestaña que ya se puede usar pero todavía se mueve. */
    beta: "Beta",
  },
  sections: {
    home: "Home",
    meta: "Meta",
    units: "Units",
    items: "Items",
    ladder: "Ladder",
    player: "Player",
  },
  language: {
    label: "Language",
    en: "EN",
    es: "ES",
  },

  home: {
    eyebrow: "Statistics from finished matches",
    /**
     * **"Vestigo" is Latin for "I track".** The line says so, which is a better
     * job for a masthead than promising an improvement: it tells a first-time
     * visitor what the name means and what the site does to a match, in four
     * words, and it keeps being true however many games are added under it.
     *
     * It is set in two parts because the home prints the second one as an
     * outline — see `title-break` in `styles/home.css`.
     */
    title: "Every match",
    titleBreak: "leaves a trace",
    lead:
      "Your matches already hold the answer. Vestigo reads them back to you and turns the " +
      "record into something you can act on before the next game.",
    counts: {
      matches: "matches read",
      measured: "last measured",
    },
    /** How old the freshest measurement is, said in words. */
    fresh: {
      today: "today",
      yesterday: "yesterday",
      days: (n: number) => `${n} days ago`,
    },
    /** The captions under each panel's figures. The figures themselves are
     *  measured — these only name them. */
    figures: {
      placement: (name: string) => `average placement · ${name}`,
      winRate: (name: string) => `win rate · ${name}`,
      matchesSet: (set: string) => `matches · set ${set}`,
      matchesBand: (band: string) => `matches · ${band}`,
      /** La banda que publica `heroes.json`, que es la que muestra el panel. */
      topBand: "Phantom+",
      unmeasured: "not measured yet",
    },
    games: {
      heading: "Where you can use it",
      cta: "Open",
      soonCta: "Coming soon",
      tft: "Meta report and match analysis, live now.",
      deadlock: "Hero and item tier lists, live now.",
      dota: "Not started yet — next on the roadmap after Deadlock.",
    },
  },


  meta: {
    title: "Meta",
    titleBreak: " compositions",
    standfirst:
      "Measured from real matches at the rank you pick. Units are ordered by how much the comp invests in " +
      "each one — not by what they cost. Stars mark who to take to 3★. Open a comp for the full plan.",
    tiers: {
      S: "Broken",
      A: "Very strong",
      B: "Solid",
      C: "Weak",
      D: "Avoid",
    } as Record<string, string>,
    // The bands do not stack: picking Gold shows what wins in Gold, not what
    // wins from Gold upward. Saying so matters — every other site's filter is
    // cumulative, so the expectation is the opposite.
    sets: {
      label: "Set",
      name: (n: number) => `Set ${n}`,
      soon: "soon",
      note: "The list covers the live set. The next one opens here once enough of it has been played.",
      /** Shown in the option itself, so the choice is labelled before it is made. */
      archived: "archived",
      /**
       * Replaces the note above while an archived set is on screen. It has to
       * say the numbers are final, not stale: a reader who thinks the page is
       * broken leaves, and one who thinks it is live is being misled.
       */
      archivedNote: (n: number) =>
        `Set ${n} is over. These numbers are the final measurement of it and no longer change.`,
    },
    bands: {
      label: "Rank",
      filter: "Filter by rank",
      note: "Each band is measured on its own games, not on the ranks above it.",
      loading: "Loading this rank's meta…",
      names: {
        global: "Platinum+",
        apex: "Master+",
        "diamond-emerald": "Diamond / Emerald",
        "platinum-gold": "Platinum / Gold",
        "silver-below": "Silver and below",
      } as Record<string, string>,
      thin:
        "We hold fewer games at this rank, so most of these comps rest on a thin sample. " +
        "Read them as a direction, not a ranking.",
      provisional: (patch: string) =>
        `Patch ${patch} has only just landed, so this list rests on far fewer games than usual ` +
        `and will move over the next days. We show it anyway because last patch's answer is a different game.`,
      // Nothing is broken and nothing is hidden: we simply do not have enough of
      // THIS patch at this rank yet, and last patch's answer is a different game.
      empty: (patch: string) =>
        `We don't have enough games at this rank on patch ${patch} yet. ` +
        `Rather than show you last patch's comps, this fills in as more games come in.`,
    },
    dataset: {
      comps: "Comps",
      set: "Set",
      patch: "Patch",
      updated: "Updated",
    },
    stats: {
      placement: "Place",
      top4: "Top 4",
      first: "1st",
      play: "Play",
    },
    // An average hides how a comp actually plays: reliably fourth is a very
    // different bet from wins-or-dies. Each label carries its own reason, so
    // nobody has to take the word on faith.
    // Labels name what the player gets, not what the statistic is called.
    // "Contested" and "high win rate" are how we think about the data; "expect
    // company" and "plays for first" are what someone deciding what to force
    // actually needs to hear.
    tags: {
      consistent: {
        label: "Safe top 4",
        why: "Lands in the top four often, but rarely takes first. A steady climb, not a spike.",
      },
      highWin: {
        label: "Plays for first",
        why: "Wins outright more often than most — at the cost of finishing low when it misses.",
      },
      contested: {
        label: "Widely played",
        why: "Enough people play it that someone is likely fighting you for the same units.",
      },
      thinData: {
        label: "Few games",
        why: "Measured over few boards, so treat these numbers as a hint rather than a fact.",
      },
    } as Record<string, { label: string; why: string }>,
    swing: {
      heading: "What swings this comp",
      note:
        "Optional units, ranked by how much the board's finish moves when they show up. " +
        "Measured against the same comp without them.",
      better: (n: string) => `${n} places better`,
      worse: (n: string) => `${n} places worse`,
      inWinners: "of winning boards",
      inLosers: "of losing boards",
    },
    detail: {
      itemsHeading: "Item priority",
      itemsNote:
        "Which items to commit to your strongest units first. Hover one to see the components it builds from.",
      unitsHeading: "Units and items",
      evidence: (level: string, boards: number) =>
        `In our data this comp ends on level ${level} on average, across ${boards} boards.`,
      carryTag: "carry",
      starTag: "take to 3★",
      // A rotation slot, named the way every TFT site names it.
      flexTag: "flex",
      flexWhy: (share: string) => `Fielded on ${share} of this comp's boards — one of the slots that rotates.`,
      noItems: "no items",
      withItems: "hold items",
      builtFrom: "Built from",
      baseComponent: "Base component",
      inGames: (share: string) => `in ${share} of games`,
    },
    // The same set with a champion or two swapped is shown as one row, with the
    // best build leading and its variants a click away. The tier line matters:
    // a variant can sit a tier lower than the build it hangs off.
    variants: {
      show: (n: number) => `${n === 1 ? "1 variant" : `${n} variants`}`,
      back: "Back to the main build",
      differentTier: (tier: string) => `This variant is Tier ${tier}`,
    },
    copyBuild: {
      label: "Copy build code",
      done: "Copied — paste it in TFT",
      hint: "Paste into the game's Team Planner to mark which champions to buy",
    },
  },

  units: {
    title: "Unit",
    titleBreak: " stats",
    standfirst:
      "Every champion, measured across the same high-elo matches. Ordered by how much they are " +
      "played — not by what they cost, because a shop price is not a measure of power.",
    sort: {
      label: "Sort by",
      play: "Most played",
      placement: "Best placement",
      impact: "Biggest impact",
    },
    filter: { cost: "Cost", all: "All" },
    cols: {
      unit: "Unit",
      cost: "Cost",
      play: "Play rate",
      place: "Avg. place",
      impact: "Impact",
    },
    carry: "carry",
    // Impact is placement-with minus placement-without: a negative number means
    // boards do better with the unit. Shown to the player as "+0.4 better".
    better: (n: string) => `${n} better`,
    worse: (n: string) => `${n} worse`,
    bestStar: (n: number) => `Best at ${n}★`,
    starsHeading: "Placement by star level",
    starsNote: "Where boards finish at each star level. A reroll unit only pays off at 3★.",
    itemsHeading: "What winners build",
    itemsNote: "The items the top-4 boards put on this unit.",
    noItems: "Rarely itemized — this unit is not a carry.",
    star: (n: number) => `${n}★`,
    games: (n: string) => `${n} games`,
  },

  items: {
    title: "Item",
    titleBreak: " stats",
    standfirst:
      "Every built item, measured across the same high-elo matches. Ordered by how often it is " +
      "built, with the champions that carry it best.",
    sort: {
      label: "Sort by",
      play: "Most built",
      placement: "Best placement",
      impact: "Biggest impact",
    },
    cols: { item: "Item", play: "Build rate", place: "Avg. place", impact: "Impact" },
    better: (n: string) => `${n} better`,
    worse: (n: string) => `${n} worse`,
    builtFrom: "Built from",
    bestOn: "Best carried by",
    bestOnNote: "The champions that hold this item most, with their average placement.",
    games: (n: string) => `${n} games`,
  },

  ladder: {
    title: "Challenger",
    titleBreak: " ladder",
    standfirst:
      "The top of the ranked ladder, by region — Riot's official standings, refreshed " +
      "periodically. In Teamfight Tactics a win is a top-4 finish.",
    region: "Region",
    cols: { rank: "#", player: "Player", lp: "LP", record: "W / L", top4: "Top 4" },
    unknown: "Unknown player",
    loading: "Loading the ladder…",
    empty: "No ladder data for this region yet.",
    error: "The ladder could not be loaded. Try again in a moment.",
  },

  plan: {
    reroll1: {
      badge: "Reroll 6",
      label: "1-cost reroll",
      steps: [
        "Sit at level 6 and slow roll for your 3-stars.",
        "Power spikes: 3-1, 3-5 and 4-1.",
        "Never drop below 50 gold — the interest pays for the rolling.",
      ],
    },
    reroll2: {
      badge: "Reroll 6",
      label: "2-cost reroll",
      steps: [
        "Level to 6 on 3-2 and slow roll there.",
        "Power spikes: 3-2, 4-1 and 4-5.",
        "Stay above 50 gold unless you have to stabilise.",
      ],
    },
    reroll3: {
      badge: "Reroll 7",
      label: "3-cost reroll",
      steps: [
        "Stabilise on level 7 around 3-5 with 40+ gold.",
        "Power spikes: 3-2, 3-5, 4-1 and 5-1.",
        "Once the 3-stars land, push to 8 to scale.",
      ],
    },
    fast8: {
      badge: "Fast 8",
      label: "Fast 8",
      steps: [
        "Prioritise levelling over rolling.",
        "Level 7 on 4-1; push to 8 and only then roll.",
        "Never drop below 50 gold before you start pushing XP.",
      ],
    },
    standard: {
      badge: "Standard",
      label: "Standard level curve",
      steps: [
        "Normal curve: 6 on 3-2, 7 on 4-1.",
        "Roll to stabilise when your health asks for it.",
        "Mind the interest — 50 gold is the comfortable floor.",
      ],
    },
  },

  // Each one states the measurement that produced it. A label a player cannot
  // check is a horoscope; one that shows its number is a mirror.
  playerTags: {
    heading: "What your last games say",
    note: "Read from your recent history. Each one shows the number behind it.",
    chainWins: {
      label: "Rides streaks",
      why: (rate: string, n: number) =>
        `After a top four you top four again ${rate} of the time, across ${n} chances.`,
    },
    chainLosses: {
      label: "Tilts",
      why: (rate: string, n: number) =>
        `After finishing bottom four you do it again ${rate} of the time, across ${n} chances. ` +
        "Consider stopping after two.",
    },
    forcer: {
      label: "Forces one board",
      why: (rate: string) =>
        `${rate} of your units carry over from the game before. You know your comp — but the ` +
        "lobby decides what is open.",
    },
    flexible: {
      label: "Plays what is open",
      why: (rate: string) =>
        `Only ${rate} of your units carry over between games. You follow the board rather than a plan.`,
    },
    unitGod: {
      label: (unit: string) => `${unit} specialist`,
      why: (unit: string, place: string) =>
        `You carry ${unit} more than anything else, and finish ${place} on average when you do.`,
    },
    highRoller: {
      label: "Rerolls",
      why: (rate: string, n: number) =>
        `You hit a three-star unit in ${n} of your recent games (${rate}).`,
    },
  },

  player: {
    title: "Match",
    titleBreak: " analysis",
    standfirst:
      "Search a Riot ID and open any match: we tell you what could have gone better against the " +
      "comp you were building, who was contesting it, and where your gold went.",
    riotId: "Riot ID",
    riotIdPlaceholder: "Name#TAG",
    region: "Region",
    regions: {
      na1: "North America",
      euw1: "Europe West",
      eun1: "Europe Nordic & East",
      br1: "Brazil",
      la1: "LAN",
      la2: "LAS",
      kr: "Korea",
      jp1: "Japan",
      oc1: "Oceania",
    } as Record<string, string>,
    search: "Analyze",
    searching: "Searching…",
    badRiotId: 'Type the full Riot ID, in the form "Name#TAG".',
    idleHint:
      "Type a Riot ID to see the history and, for each match, what could have gone better " +
      "against the comp you were building.",
    found: (n: number) => `${n} ${n === 1 ? "match" : "matches"} found`,
    /** The ACCOUNT level, which is not the board level a match ended on. */
    accountLevel: (n: number) => `Level ${n}`,
    /** Riot's tier names, keyed as the API writes them. */
    tiers: {
      IRON: "Iron",
      BRONZE: "Bronze",
      SILVER: "Silver",
      GOLD: "Gold",
      PLATINUM: "Platinum",
      EMERALD: "Emerald",
      DIAMOND: "Diamond",
      MASTER: "Master",
      GRANDMASTER: "Grandmaster",
      CHALLENGER: "Challenger",
    } as Record<string, string>,
    /** "Gold I · 42 LP". The apex tiers have no division and are not given one. */
    standing: (tier: string, division: string, lp: number) =>
      `${tier}${division ? ` ${division}` : ""} · ${lp} LP`,
    loading: (n: number) => ` · loading ${n}…`,
    offline: "Showing the matches we already had stored — Riot did not answer.",
    // Which meta a report was measured against is not a detail: the same board
    // is a mistake in one rank and normal play in another. It is stated on
    // screen every time, and stated louder when we had to guess.
    rank: {
      own: (band: string) => `Measured against the ${band} meta — your rank.`,
      fallback: (band: string) =>
        `This account has no ranked TFT standing, so it is measured against the ${band} meta.`,
      thinBand: (own: string, used: string) =>
        `We don't have enough ${own} games on this patch yet, so this is measured against ` +
        `the ${used} meta instead.`,
      waiting: "Loading the meta for your rank…",
    },
    level: "Lv.",
    round: "Round",
    place: "Place",
    notes: "Notes",
    matchLabel: (id: string, place: string, comp: string, notes: number) =>
      `Match ${id}: ${place} with ${comp}. ${notes} notes.`,
    noPlace: "no placement",
    noComp: "No clear comp",
    betterHeading: "What could have gone better",
    nothingToFlag:
      "Nothing to flag in this match: no gold left unspent, no gaps against the meta, no contested comps.",
    lobbyHeading: "The lobby",
    lobbyNote:
      "What your board was up against. Each of the eight boards is captured at the moment that " +
      "player was knocked out, not all at the same time.",
    ordinals: ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"],
  },

  profile: {
    severity: { high: "Key", medium: "To improve", info: "Context" } as Record<string, string>,
    historyHeading: "What your history says",
    historyNote: (n: number) => `Patterns that only show up looking at all ${n} matches together.`,
    matches: "Matches",
    avgPlacement: "Avg. place",
    top4: "Top 4",
    firsts: "Firsts",
    excluded: (n: number) =>
      `${n} ${n === 1 ? "match is" : "matches are"} left out of these numbers: Double Up and PvE ` +
      "are not measured by the same yardstick.",
    compsHeading: "The comps you play most",
    compsNote: "How often you built it, and where you placed on average.",
    championsHeading: "The champions you use most",
    championsNote: "Presence on your final board, with your average placement when you field them.",
    oneGame: "1 game",
    placeUnit: "place",
    timeline: {
      heading: "Recent games",
      note: "Placement in each game on screen, oldest to newest — the last bar is your latest.",
      tooltip: (place: string, date: string) => `${place} · ${date}`,
    },
    lp: {
      heading: "LP this set",
      note: "Every time we have looked up this account, since we started keeping track.",
      // Riot publishes no LP history, so there is genuinely nothing to draw on
      // a first visit. Saying so beats an empty box, and beats a line through
      // one point even more.
      none: "We have not recorded this account's rank yet.",
      justStarted:
        "We started tracking this account's LP today. Come back after the next ranked game " +
        "and this will have something to show.",
      net: (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n)} LP`,
      since: (points: number, day: string) =>
        `across ${points} readings since ${day}`,
      alt: (first: string, last: string) => `LP over time, from ${first} to ${last}.`,
    },
    places: {
      heading: "Where you finish",
      note: "Each column is a game that ended in that place. Gold is a top 4.",
      ordinals: ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"],
      tooltip: (place: string, count: number, total: number) =>
        `${place}: ${count} of ${total} games`,
    },
    coach: {
      heading: "What the players above you do differently",
      note:
        "Only habits that are a real choice, that the rank above makes less often, and that " +
        "cost you places at your own rank. All three, or it is not here.",
      you: "You",
      // Deliberately NOT "this costs you N places". The split is inflated by
      // causation running backwards — dying early produces both the habit and
      // the bad finish — and correcting for it over-corrects, because when you
      // were knocked out is the outcome. The honest claim is the association.
      cost: (places: string, boards: string) =>
        `At your rank, boards like this finish ${places} places lower on average, across ` +
        `${boards} boards. Part of that gap is the habit and part is a game that was ` +
        `already going wrong — a signal, not a price tag.`,
      games: (n: number) => `${n} ${n === 1 ? "game" : "games"}`,
      habits: {
        hoardsGold: "You end games with gold still in the bank",
        lowLevel: "You go out at a lower level",
        carryShort: "Your carry finishes without its three items",
        rerolls: "You roll for three stars on cheap units",
        contestedCarry: "You commit to a carry someone else is on",
        offMeta: "You play boards that match no comp in the list",
        lowTierComp: "You play comps from the bottom of the list",
      },
      empty:
        "On everything we measure, your habits already look like the rank above yours.",
      emptyList: (habits: string) => `Measured: ${habits}.`,
      top: "You are in the top band, so there is no rank above to compare you with.",
      thin: (n: number) =>
        `A rate needs at least ${n} games before it says anything. Play a few more and check back.`,
      unranked:
        "We need your rank to know who to compare you with, and Riot has not given us one yet.",
    },
  },

  errors: {
    PLAYER_NOT_FOUND: {
      title: "We could not find that Riot ID",
      hint: "Check the name and the tag. The tag goes after the #, with no spaces.",
    },
    RIOT_KEY_INVALID: {
      title: "The Riot key expired",
      hint: "Development keys last about 24 hours. It has to be renewed before searching again.",
    },
    RATE_LIMITED: {
      title: "Riot asked us to wait",
      hint: "Too many requests in a row. Try again in a few seconds.",
    },
    TOO_MANY_REQUESTS: {
      title: "Too many searches in a row",
      hint: "We limit how fast a single connection can search, to stay within Riot's quota. Give it a minute.",
    },
    NOT_CONFIGURED: {
      title: "The Riot key is not configured",
      hint: "There is no key loaded on the server side.",
    },
    UPSTREAM_ERROR: {
      title: "Riot did not answer properly",
      hint: "The problem is on their side. Try again in a little while.",
    },
    NETWORK: {
      // The request never reached anything, so we cannot say more than where it
      // was headed. Naming the possibilities matters: a browser extension or
      // antivirus silently refusing that one domain looks identical to being
      // offline, and the console shows ERR_CONNECTION_CLOSED, not an HTTP status.
      title: "We could not connect",
      hint:
        "The request never reached its destination. It could be your connection, the server " +
        "not running, or an extension or antivirus blocking access.",
    },
    BAD_REQUEST: {
      title: "That search is not valid",
      hint: 'Type the full Riot ID, in the form "Name#TAG".',
    },
  } as Record<string, { title: string; hint: string }>,

  deadlock: {
    eyebrow: "Vestigo · Deadlock",
    title: "Hero",
    titleBreak: " tier list",
    lead:
      "Win rates measured on real matches, cut by the rank the match was played at. " +
      "Heroes move — a hero that carries at Phantom can be the worst pick below Sentinel — " +
      "so pick the band you actually play in.",
    /**
     * "Patches" y no "Updates": el sitio ya se actualiza solo, así que
     * "Actualizaciones" se leería como novedades del producto. Lo que hay ahí
     * son los parches del juego, que es la palabra que usa el jugador.
     */
    tabs: {
      meta: "Meta",
      items: "Items",
      ranks: "Ranks",
      ladder: "Ladder",
      patches: "Patches",
      player: "Player",
      /** No se dibuja como pestaña: existe para titular `/deadlock/match/<id>`. */
      match: "Match",
    },

    /**
     * El informe de partida.
     *
     * **Cada frase imprime el número que la respalda.** Es la misma regla que los
     * Player Tags de TFT: sin el número, un consejo es un horóscopo. Y por eso
     * las familias son funciones — reciben lo medido y lo meten adentro de la
     * oración, en vez de dejarlo colgado al lado.
     */
    report: {
      searchTitle: "Your matches",
      searchLead:
        "Search your Steam name and open a match. The report compares what you bought, and when, " +
        "against the players who won from the same spot — same hero, same kind of enemy team.",
      placeholder: "Steam name",
      search: "Search",
      searching: "Searching…",
      noAccounts: "No account by that name.",
      recent: (n: number) =>
        n === 1 ? "1 match in the last 30 days" : `${n} matches in the last 30 days`,
      history: "Recent matches",
      loadingMatch: "Loading the match…",
      notFound: "deadlock-api does not have that match yet.",
      apiDown:
        "deadlock-api is not answering. The match data comes from there, so there is nothing to show right now.",
      noReference:
        "Our reference table could not be loaded, so there is nothing to compare this match against.",
      win: "Win",
      loss: "Loss",
      reportTitle: "What this match cost you",
      /** Que pueda no haber nada que decir es parte del diseño, no un error. */
      clean:
        "Nothing to fix on the shopping side: what you bought, and when, matches the players who won from the same spot.",
      measured: (band: string, matches: string) =>
        `Measured against ${band} — ${matches} matches since the current patch.`,
      pickPlayer: "Pick a player",
      you: "Report shown for",
      grade: "Grade",
      noGrade: "Not enough matches on this hero to grade it.",
      gradeHow: (letter: string, hero: string) =>
        `${letter} is where this ${hero} lands among every ${hero} in matches this long, on souls, ` +
        "hero damage and deaths — each one as a share of their own team, so the team's luck cancels out.",
      signals: { souls: "Souls", damage: "Damage", deaths: "Deaths" },
      /** El "de lo típico" que va al lado de cada barra del desglose. */
      typical: (x: string) => `typical ${x}`,
      /**
       * El veredicto de la nota, en una oración.
       *
       * **Existe porque tres barras no contestan "¿por qué C+?".** Obligan a
       * saber para qué lado es bueno cada una y cuál pesa más; la oración lo
       * dice y las barras quedan como el detalle que la respalda.
       */
      costMost: (p: { signal: string; mine: string; typical: string; hero: string }) =>
        `What cost you most: ${p.signal.toLowerCase()}. Your share was ${p.mine} of the team's, ` +
        `where a typical ${p.hero} sits at ${p.typical}.`,
      helpedMost: (p: { signal: string; mine: string; typical: string; hero: string }) =>
        `Nothing dragged the grade down — all three landed on the good side. The one that helped ` +
        `most was ${p.signal.toLowerCase()}: ${p.mine} of the team's, against ${p.typical} for a typical ${p.hero}.`,
      toggleCurve: "Show or hide this player's curve",
      backToMatches: "Back to the match list",
      backToSearch: "Search a player",
      noRank: "No ranked matches yet",
      /** Mientras el pedido del rango no volvio. NO afirma nada sobre el jugador. */
      rankUnknown: "Rank unavailable right now",
      calibrating: (done: number, total: number) => `Calibrating · ${done} of ${total}`,
      /** Debajo de la insignia de rango: cuántas de calibración faltan. */
      calibratingLeft: (left: number) =>
        left === 1 ? "1 placement match to go" : `${left} placement matches to go`,
      stats: {
        matches: "Matches",
        winRate: "Win rate",
        kda: "K/D/A",
        souls: "Souls per minute",
        top: "Most played",
        lastHitsDenies: "Last hits / denies",
      },
      /** Los títulos de las tarjetas de la columna lateral del perfil. */
      cards: {
        profile: "Player",
        heroes: "Most played",
        activity: "Activity",
        placings: "World ranking",
      },
      /**
       * La etiqueta del puesto mundial, al lado del rango.
       *
       * `worldTagLabel` es la palabra corta que precede al número: sin ella,
       * "#412" al lado de un rango se lee como un subnivel del rango.
       */
      worldTagLabel: "World",
      worldTagTitle: (of: string, min: number) =>
        `Out of ${of} players with ${min}+ ranked matches this season`,
      steamProfile: "Steam profile",
      /**
       * Los rótulos de la lista de partidas.
       *
       * **Existen porque una cifra sin rótulo no es un dato.** ZoTaD miró su
       * propio historial y no supo qué era "190/5" al lado del KDA: eran golpes
       * de gracia y denies.
       */
      histCols: {
        hero: "Hero",
        result: "Result",
        grade: "Grade",
        kda: "K/D/A",
        farm: "LH/DN",
        souls: "Souls",
        // "Time" y no "Length": el rótulo vive en una columna de 3,8rem y "Length"
        // pedía 69px de los 55 que tenía. Y para un mm:ss "Time" dice lo mismo.
        length: "Time",
        rank: "Rank",
        when: "When",
      },
      rankUp: "Rank up",
      rankUpTitle: (from: string, to: string) => `Rank up in this match: ${from} → ${to}`,
      /**
       * El filtro de modo, que manda sobre el perfil entero.
       *
       * Los `title` dicen **qué entra en cada uno**, porque "Normal" es el que
       * no se adivina: es todo lo que no es ranked ni pelea callejera, y ahí
       * caen también las partidas de `match_mode` 4 anteriores al reset.
       */
      scopes: {
        label: "Game mode",
        name: {
          all: "All",
          ranked: "Ranked",
          normal: "Normal",
          brawl: "Street Brawl",
        },
        title: {
          all: "Every match in the history",
          ranked: "Ranked matches since ranked opened",
          normal: "Everything that isn't ranked or Street Brawl",
          brawl: "Street Brawl matches",
        },
        /** Cuando el modo elegido no tiene ni una partida. */
        empty: "No matches in this mode.",
      },
      /**
       * Cuántos héroes lo tienen en el top 100 del mundo.
       *
       * Dice **cuántos**, no "estás rankeado": el número es el logro. Con uno
       * solo la frase cambia, porque "1 héroes" delata una plantilla.
       */
      placingsLead: (n: number) =>
        n === 1 ? "Top 100 in the world with 1 hero." : `Top 100 in the world with ${n} heroes.`,
      placingTitle: (hero: string, place: number) => `#${place} in the world with ${hero}`,
      /** El botón que alarga la lista de partidas. Copiado de op.gg, que corta en 20. */
      showMore: "Show more matches",
      /**
       * El calendario de actividad: doce semanas de puntos, uno por día.
       *
       * La leyenda nombra los dos extremos y nada más — un heatmap con cinco
       * rótulos explica menos que uno con dos.
       */
      activity: {
        weeks: (n: number) => `Last ${n} weeks`,
        won: "More wins",
        lost: "More losses",
        none: "Didn't play",
        day: (date: string, wins: number, losses: number) =>
          `${date} · ${wins}W ${losses}L`,
      },
      /** El título de una fila del historial: qué son los dos números que van juntos. */
      farmTitle: (lastHits: number, denies: number) => `${lastHits} last hits, ${denies} denies`,
      /** El botón de un héroe en "Most played": filtra el historial a ese héroe. */
      filterByHero: (hero: string) => `Filter by ${hero}`,
      /**
       * Cuántas de las filas elegidas se están dibujando.
       *
       * El tope de 40 es de presentación, no de datos (ver `HISTORY_DISPLAY_CAP`
       * en `DeadlockPlayer.tsx`): el filtro y el resumen siguen mirando todo lo
       * elegido, sólo la lista visible se corta. La frase tiene que decirlo o el
       * "40" se lee como el total real.
       */
      shown: (visible: number, total: number) => {
        if (visible >= total) return total === 1 ? "1 match" : `${total} matches`;
        return `Showing the ${visible} most recent of ${total} matches`;
      },
      /**
       * La racha, la forma y de qué corpus salen.
       *
       * **Ranked abrió el 2026-07-30, hace 13 días a la fecha de este trabajo.**
       * Por eso casi todas las cuentas caen hoy en `fallback`, y la frase de
       * respaldo está escrita para que la lea un jugador cualquiera un día
       * cualquiera — no como una disculpa por falta de datos.
       */
      streakForm: {
        title: "Recent form",
        streakWin: (n: number) => `${n} wins in a row`,
        streakLoss: (n: number) => `${n} losses in a row`,
        window: (n: number) => (n === 1 ? "Last match" : `Last ${n}`),
        ranked: (n: number) => `Measuring your ranked matches this season — ${n} so far.`,
        fallback: (n: number, min: number) => {
          const cuantas = n === 0 ? "no ranked matches yet" : n === 1 ? "only 1 ranked match" : `only ${n} ranked matches`;
          return `Ranked just opened this season, and you have ${cuantas} — this measures every match until you reach ${min}.`;
        },
        /**
         * Con un modo elegido a mano: dice cuál y sobre cuántas mide.
         *
         * **Una frase por modo y no una plantilla con el nombre adentro**: en
         * español "partidas de {Clasificatorias}" no se puede armar pegando el
         * rótulo de la pastilla, y forzarlo daba "partidas de clasificatorias".
         */
        scoped: {
          ranked: (n: number) =>
            n === 1 ? "Measuring 1 ranked match." : `Measuring your ${n} ranked matches.`,
          normal: (n: number) =>
            n === 1 ? "Measuring 1 normal match." : `Measuring your ${n} normal matches.`,
          brawl: (n: number) =>
            n === 1
              ? "Measuring 1 Street Brawl match."
              : `Measuring your ${n} Street Brawl matches.`,
        },
      },
      /**
       * Los rótulos del marcador.
       *
       * Cortos porque son encabezados de columna, y **no abreviados a una
       * letra**: "OBJ" se entiende, "O" no. El número exacto de cada celda vive
       * en su `title`, así que la columna puede ser corta sin perder nada.
       */
      cols: {
        player: "Player",
        souls: "Souls",
        kda: "K/D/A",
        damage: "Damage",
        obj: "Objectives",
        heal: "Healing",
        items: "Items",
      },
      soulsTitle: "Souls, minute by minute",
      soulsNote: (duration: string, max: string) =>
        `Every player's net worth across the ${duration}, up to ${max}. Amber is Hidden King, sapphire is Archmother.`,
      buildTitle: "What they bought, in order",
      boughtAt: (m: string) => `bought at minute ${m}`,
      adviceTitle: "What the shopping cost",
      /**
       * Las nueve familias. **Ninguna afirma sin decir contra qué**: siempre
       * aparece qué hicieron los que ganaron desde la misma situación, porque esa
       * comparación es lo único que convierte una observación en un consejo.
       */
      families: {
        resist: (p: { share: string; rate: string; item: string; spirit: boolean }) =>
          `${p.share} of the damage you took was ${p.spirit ? "spirit" : "bullet"}, and you finished ` +
          `without any ${p.spirit ? "spirit" : "bullet"} resist. ${p.rate} of the players who won ` +
          `against a team like that had ${p.item}.`,
        skipped: (p: { rate: string; item: string }) =>
          `${p.rate} of the players who won this matchup finished with ${p.item}, and you did not buy it.`,
        late: (p: { rate: string; item: string; mine: string; theirs: string }) =>
          `You bought ${p.item} at minute ${p.mine}. Among the ${p.rate} of winners who finish with it, ` +
          `the median buy is minute ${p.theirs}.`,
        unupgraded: (p: { rate: string; item: string; from: string }) =>
          `You finished the match still on ${p.from}. ${p.rate} of the winners upgraded it to ${p.item}.`,
        souls: (p: { mine: string; theirs: string }) =>
          `You ended the match sitting on ${p.mine} unspent souls. The winners on this hero ended on ${p.theirs}.`,
        slots: (p: { mine: string; theirs: string }) =>
          `You finished with ${p.mine} items. The winners on this hero finished with ${p.theirs}.`,
        split: (p: { weapon: string; vitality: string; spirit: string; theirs: string }) =>
          `You spent ${p.weapon} weapon, ${p.vitality} vitality, ${p.spirit} spirit. ` +
          `The winners on this hero spent ${p.theirs}.`,
        imbue: (p: { rate: string }) =>
          `You did not imbue any ability. ${p.rate} of the winners on this hero imbued one.`,
        sold: (p: { item: string; rate: string; at: string }) =>
          `You sold ${p.item} at minute ${p.at}. Only ${p.rate} of the winners who bought it sold it.`,
      },
    },

    /**
     * La escalera de rangos.
     *
     * **"Matches" y "Players" son dos preguntas distintas y por eso son un
     * toggle y no dos gráficos**: uno dice a qué nivel se está jugando y el otro
     * cuánta gente hay en cada escalón. Puestos uno al lado del otro, nadie
     * miraría el segundo.
     */
    /**
     * La curva de maestría, adentro de la fila del héroe.
     *
     * **El "caveat" no es una nota al pie que se pueda sacar.** La banda fija el
     * nivel de la sala, no la habilidad de la persona, así que parte de la subida
     * puede ser que quien acumuló partidas con un héroe sea además mejor jugador.
     * Lo que sostiene que igual mide al héroe es que el efecto **varía**: de −4,4
     * a +8,6 puntos entre los 38. Un sesgo global daría lo mismo para todos.
     */
    mastery: {
      title: "What practice buys",
      /**
       * **Dice los extremos en vez de afirmar una dirección**, y no es timidez.
       * La primera versión decía "gana X puntos más", que con un `boost` negativo
       * imprimía "gana −4,4 puntos más" — y encima no todas las curvas suben
       * parejo: McGinnis va 54,6 → 58,0 → 54,4 → 50,2. Resumir eso con una
       * flecha sería inventarle una tendencia que los cuatro tramos desmienten.
       */
      lead: (a: string, from: number, b: string, to: number) =>
        `Win rate goes from ${a} with ${from}+ games on this hero to ${b} with ${to}+.`,
      games: (from: number) => `${from}+ games`,
      caveat:
        "Measured inside one rank band, so the lobby level is held fixed. It does not separate " +
        "learning the hero from being a better player to begin with.",
    },

    /**
     * **Se llama `ladder` y no `ranks` porque `deadlock.ranks` ya existe**: es el
     * rótulo del filtro por rango de la tier list. La primera versión de esta
     * copia lo pisaba en silencio — TypeScript no se queja de una clave repetida
     * en un objeto literal, sólo lo avisa el bundler.
     */
    ladder: {
      title: "The",
      titleBreak: " ladder",
      lead:
        "Season 1 reset every rank on July 30. This is the ladder rebuilding itself, " +
        "day by day — how many players sit at each rank, and where the games are being played.",
      view: { matches: "Matches", players: "Players" },
      viewNote: {
        matches: "Where the games are being played, from each lobby's average rank.",
        players: "How many players we have seen at each rank, counted once, at their latest one.",
      },
      /**
       * El cartel de calibración. Lleva el número que lo respalda: una etiqueta
       * sin el dato que la sostiene es una opinión.
       */
      calibrating: (pct: string, ranked: string, seen: string) =>
        `Only ${pct} of players have finished placement so far (${ranked} of ${seen} accounts). ` +
        "The ones who finished first are the ones who play the most, who tend to sit higher — " +
        "so the top ranks look fuller than they are. This corrects itself as the rest calibrate.",
      players: "players",
      matches: "matches",
      day: "By day",
      empty: "No ranked matches yet.",
      /**
       * Los dos lados del mapa.
       *
       * **Cuál es cuál se verificó por dos caminos, porque suponerlo habría sido
       * publicar el resultado dado vuelta.** Los colores del juego
       * (`assets.deadlock-api.com/v2/colors`) traen `team1_color` en ámbar
       * (212,134,11) y `team2_color` en zafiro (77,117,195); el snapshot numera
       * desde cero, así que `Team0` es el ámbar. Lo confirma que nuestro `Team0`
       * dio 50,31% global y 52,44% en Eternus contra el 50,3% y 52,5% que
       * statlocker publica para Hidden King.
       *
       * **Los nombres van escritos acá y no bajados del catálogo**, al revés que
       * héroes, ítems y rangos: la API de assets no publica los nombres de los
       * patronos. Son nombres propios y no se traducen, como "Bebop". Ojo: "Amber
       * Hand" y "Sapphire Flame" son los nombres **viejos**, renombrados en el
       * update *Old Gods, New Blood*.
       */
      sides: {
        title: "Which side wins",
        lead:
          "Deadlock is not symmetrical, and the gap grows with rank. Measured on ranked matches only.",
        overall: (pct: string, err: string) => `${pct} ± ${err}`,
        team0: "Hidden King",
        team1: "Archmother",
        /** Cuando ningún rango llega solo: se dice qué falta, no se dibuja ruido. */
        thin: (min: string) =>
          `Not enough ranked games yet to break this down by rank — each one needs about ${min}. ` +
          "It fills in on its own as the ranked pool grows.",
      },
    },
    /**
     * La tarjeta de build. Los nombres de build ("Spirit DPS", "Weapon Vampiric")
     * son **vocabulario nuestro**, no del juego, así que viven acá y no se bajan
     * del catálogo — al revés que los nombres de héroes, ítems y habilidades.
     */
    buildCard: {
      toggle: (hero: string) => `See what to buy on ${hero}`,
      /**
       * **"Most played" y no "Recommended", que es lo que decía.**
       *
       * Las tres builds se eligen por cuánta gente las juega y los doce ítems de
       * cada una por prevalencia — el aporte medido de cada ítem se guarda pero
       * no filtra ni ordena nada. O sea que "Recomendada" prometía un juicio que
       * la tarjeta no emite: medido, el ítem publicado promedio tiene ventaja
       * −0,01, exactamente el promedio, y 57 de 102 builds llevan al menos uno
       * claramente malo. Con Echo Shard eso era visible desde afuera: la pestaña
       * de objetos lo mide en −4,12 y la build de Bebop lo recomendaba.
       */
      /**
       * Los tres tramos en los que se parte la secuencia de compras.
       *
       * **Los minutos se muestran y no sólo agrupan.** Una fila corrida de veinte
       * íconos obliga a contar para saber dónde estás; partida en tramos, la
       * pregunta "¿qué compro ahora?" se contesta mirando una sección sola.
       */
      phase: { early: "Early game", mid: "Mid game", late: "Late game" },
      phaseRange: { early: "0 – 12 min", mid: "12 – 22 min", late: "22+ min" },
      mostPlayed: "Most played",
      /** Sólo cuando le gana a todas las demás por dos errores estándar. */
      bestWinRate: "Best win rate",
      none: "Not enough games with this hero yet.",
      name: (damage: string, trait: string) => `${damage} ${trait}`,
      damage: { weapon: "Weapon damage", vitality: "Bonus health", spirit: "Spirit power" },
      trait: { dps: "DPS", vampiric: "Lifesteal", survival: "Bruiser" },
      /* Es la cuenta que hace la tienda: souls spent per category turned into
         the bonus the game grants for it. No dice "damage split" porque no
         reparte daño, y ya no dice "item mix" porque ya no cuenta objetos.

         Y ya no dice "what this build buys", que era lo que se contradecía con
         el dibujo: **la barra se llena con almas y el número es el escalón**, y
         la escalera salta fuerte —en arma, de +18% a +46% entre 3.200 y 4.800—,
         así que la barra más corta de McGinnis lleva casi el número más alto.
         El título ahora nombra lo que mide la barra, y el bonus al lado queda
         como lo que esa inversión te da. "Investment" es además la palabra que
         usa la tienda del juego. */
      damageSplit: "Soul investment",
      /** Las almas puestas en la categoría, y qué falta para el próximo escalón. */
      investment: (souls: string) => `${souls} souls`,
      unlockOrder: "Unlock order",
      /* "Skill path" y no "unlock order": lo que la grilla muestra ya no es cuál
         sale primero sino qué se sube en cada paso, que son 15 o 16. */
      skillPath: "Skill path",
      skillPathNote: "The order most players level abilities in, step by step.",
      skillStep: (n: number) => `step ${n}`,
      /* No dice "por escalón": ordenar por precio es cómo está la tienda, no
         cómo compra la gente. Medido: 50 de 57 builds no respetan ese orden. */
      buyOrder: "Buy order",
      buyOrderNote:
        "Every purchase in order, components included — a tier 4 is built, not bought. " +
        "The arrow marks a step that upgrades something already bought.",
      upgradeStep: "Upgrades something already bought",
      /**
       * "Core" y no "finished": abajo de este panel están los situacionales, y
       * llamar "terminada" a una build que no los incluye decía que ahí se acaba.
       * El par core / situacional es además el que usa el propio juego.
       */
      items: (n: string) => `The core build · ${n} items`,
      byTier: "What to buy at each step",
      sample: (matches: string, wr: string) => `${matches} games, ${wr}% won`,
      entersAt: (minute: string) => `Bought around minute ${minute}`,
      carried: (pct: string) => `${pct} of these builds carry it`,
      upgradedFrom: "Upgraded from",
      /**
       * Los doce salen por prevalencia, así que sin esto el aporte medido no
       * decidía nada de lo que se ve. Dice "carries" y no "best": el objeto no es
       * mejor en abstracto, es el que más aporta DENTRO de esta build.
       */
      carries: (pts: string) => `Carries this build · +${pts} win points`,
      /**
       * La cinta del cuadrado. **No dice "core" y es a propósito**: el panel
       * entero ya se llama "The core build", así que marcar cinco de doce como
       * core diría que los otros siete no lo son — dos cosas distintas con la
       * misma palabra en la misma tarjeta.
       */
      keyItem: "Key",
      /**
       * Se dice por lo que le pasa al lector —"esta build es un promedio de dos
       * cosas"— y no por el nombre del estadístico. El número va en el hover:
       * una etiqueta sin su dato es una opinión.
       */
      /* La cuarta pestaña: la única del sitio que dice lo que NOSOTROS
         recomendamos en vez de lo que la gente hace. Va con Beta al lado y con
         la cuenta a la vista — de qué build partimos, qué cambiamos, y cuántas
         partidas respaldan cada cambio. */
      ourPick: "Our pick",
      beta: "Beta",
      recoLead: (n: string) =>
        `Starting from the most played build, our measurements suggest ${n} ` +
        `${n === "1" ? "change" : "changes"}. Everything else stays.`,
      recoNone: "The most played build is already the best one we can measure — we'd change nothing.",
      recoWhy: (pts: string, games: string) => `+${pts} win points · ${games} games run it alongside the rest`,
      vsHero: (delta: string, hero: string) => ` · ${delta} vs this hero's ${hero}%`,
      blended: "Blended",
      blendedWhy: (pct: string) =>
        `Only ${pct}% of what these players do belongs to this build — the rest is part-way into another one`,
      crossesPatch:
        "The current patch doesn't have enough games yet, so these builds also " +
        "include games from before it — unlike the tier list above.",
      counters: "Situational — depends who you face",
      against: (foes: string) => `against ${foes}`,
      foot: (band: string, from: string, to: string) =>
        `${band}, ${from} to ${to}. Each item measured against players who reached the same minute with the same souls and spent them on something else.`,
    },
    patchPage: {
      title: "What the patch",
      titleBreak: " changed",
      lead:
        "Every hero that moved when the latest patch landed, measured against the same " +
        "stretch of the game right before it.",
    },
    /**
     * La página de ítems no habla de winrate y ésa es la decisión que la copia
     * tiene que transmitir. Un ítem de 6400 gana el 55% de sus partidas y uno de
     * 800 el 50%, y eso no dice cuál es mejor objeto: dice cuál se compra en
     * partidas que ya iban ganando.
     */
    itemsPage: {
      title: "Item",
      titleBreak: " tier list",
      lead:
        "Every item measured against what its own price is worth, not against the whole shop. " +
        "A 6400 item wins more than an 800 one because you only buy it in a match that " +
        "already went long — so the number here is how far each item beats the others that " +
        "cost the same.",
      /** El grupo lleva el precio, que es como el jugador piensa en la tienda. */
      costGroup: (cost: string, n: number) => `${cost} souls, ${n} items`,
      /** La base contra la que se resta, dicha en el encabezado del grupo. */
      baseline: (pct: string) => `anything at this price wins ${pct}`,
      slots: { weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" },
      /**
       * Qué da el ítem. Son los nombres de las cinco familias, no vocabulario de
       * ítem — el vocabulario sigue bajándose. El ícono es el del propio juego.
       */
      types: {
        bullet_damage: "Weapon damage",
        tech_damage: "Spirit damage",
        melee_damage: "Melee damage",
        health: "Health",
        healing: "Healing",
      },
      /**
       * "Edge" y no "vs its price".
       *
       * El rótulo tiene que leerse sin pensar. Qué se compara ya lo dice el
       * encabezado del grupo —el precio y lo que gana el promedio de ese precio—
       * así que la columna sólo necesita nombrar qué es el número: cuánto le saca
       * el ítem a sus pares. "Win rate" y "Pick rate" son las palabras que ya usa
       * la tier list de héroes; repetirlas es una cosa menos que aprender.
       */
      stats: { delta: "Edge", winRate: "Win rate", pickRate: "Pick rate" },
      deltaWhy: (points: string, base: string) =>
        `Wins ${points} points more than the average item at this price (${base}). ` +
        "Measured against its own price because buying something expensive already means the " +
        "match went long.",
      /**
       * Los encabezados de la ficha salen del propio juego: `innate`, `active` y
       * `passive` son los tres `section_type` que manda su API. Traducirlos es lo
       * único nuestro; agruparlos distinto sería enseñarle al jugador una lectura
       * del ítem que no coincide con la que ve adentro del juego.
       */
      detail: {
        toggle: (name: string) => `${name} — what it does`,
        loading: "Loading…",
        none: "The game publishes no description for this item.",
        /**
         * `innate` no está y no es un olvido: **el juego no le pone encabezado**.
         * Sus stats arrancan pegadas abajo del nombre, sin título — verificado en
         * cinco tarjetas reales. Poníamos "Always on" donde el juego no pone nada.
         */
        kinds: { active: "Active", passive: "Passive" },
        upgradesTo: "Upgrades to",
        upgradesFrom: "Upgrades from",
        souls: "souls",
      },
      loading: "Loading this rank's items…",
      charts: {
        aside: "What the shop looks like right now",
        tip: (edge: string, use: string) => `${edge} edge · bought in ${use} of matches`,
        scatter: {
          title: "What pays against what gets bought",
          note:
            "Every item at this rank. Left is rarely bought, right is bought a lot; above the " +
            "line beats its price, below it costs you.",
          quadrants: {
            sleeper: "Top left: pays and barely bought",
            trap: "Bottom right: bought a lot and costs you",
          },
          xAxis: "how often it gets bought",
          xLow: "Rarely",
          xHigh: "Always",
          alt: (sleepers: number, traps: number, band: string) =>
            `Usage against edge at ${band}: ${sleepers} items beat their price while being ` +
            `bought less than average, and ${traps} are bought more than average while losing ground.`,
        },
        callouts: {
          sleeper: {
            title: "Worth more than its usage",
            note: "Beats its price and fewer than half of players buy it.",
          },
          trap: {
            title: "Bought more than it earns",
            note: "More than half of players buy it and it still loses to its price.",
          },
        },
        heatmap: {
          title: "Where the value sits",
          note:
            "Average edge for each shelf of the shop. Verified across all four rank bands: the " +
            "strongly coloured cells keep their sign, the pale ones are the ones that do not.",
          priceHeader: "Price",
          tip: (cost: string, slot: string, edge: string, n: number) =>
            `${slot} at ${cost} souls: ${edge} on average across ${n} items`,
        },
        legend: { worse: "Below its price", par: "At its price", better: "Above its price" },
      },
      footnote:
        "The four Deadlock stats sites all rank items by raw win rate, which ranks them by " +
        "price. These numbers are ours: each item is pulled toward what its price is worth " +
        "by how little evidence backs it, and every baseline is published in the data file.",
    },
    ranks: { label: "Rank", filter: "Filter by rank", above: (rank: string) => `${rank}+` },
    /**
     * La ladder de jugadores (`/deadlock/ladder`, quién rinde mejor con cada
     * héroe).
     *
     * **Se llama `playerLadder` y no `ladder`, porque `deadlock.ladder` ya
     * existe**: es la copia de la escalera de RANGOS (`/deadlock/ranks`,
     * `DeadlockRanks.tsx`) — que además trae, en su propio comentario, la
     * advertencia de este mismo choque de nombres. Repetirlo habría pisado esa
     * copia en silencio, exactamente lo que ese comentario dice que ya pasó una
     * vez.
     *
     * `cols.badge` es la columna nueva que el plan no tenía: `last_team_avg_badge`
     * se midió el 2026-08-12 sobre 50 cuentas reales y el endpoint lo trae
     * siempre, así que la fila puede mostrar el rango real del jugador y no sólo
     * el puesto en la métrica elegida.
     */
    playerLadder: {
      title: "Best",
      titleBreak: " players",
      lead:
        "The best ranked players in the world, and who tops each hero. Every row shows how many " +
        "matches it is measured on — a 100% win rate over thirty games is a new account, not a king.",
      hero: "Hero",
      allHeroes: "All heroes",
      metric: "Sort by",
      metrics: { winrate: "Win rate", wins: "Wins", avg_net_worth_per_match: "Souls per match" },
      cols: { rank: "#", badge: "Rank", player: "Player", matches: "W / played", winRate: "Rating" },
      ratingTitle: (wr: string) => `Raw win rate ${wr}%. The rating is the win rate we can be confident in given how many games back it.`,
      /**
       * Cómo se ordena, dicho en la página y no en un tooltip.
       *
       * **El método es el producto.** Un ranking que no dice cómo ordena es el
       * PP score de Statlocker; este dice exactamente qué hace y por qué, en una
       * línea que se entiende sin saber estadística.
       */
      /**
       * **Describe la regla de verdad, y cambió cuando cambió la regla.**
       *
       * Decía que ordenaba el winrate sostenido, y desde que ordena el rango del
       * juego eso pasó a ser el desempate. Una explicación que describe la
       * versión anterior es peor que ninguna: se lee como si fuera cierta.
       */
      howRanked:
        "Ordered by in-game rank. Players on the same rank are split by how well their win rate " +
        "holds up over the games behind it, so a hot streak does not outrank a season.",
      floor: (n: string) => `Players with ${n}+ ranked matches`,
      thin: "Not enough ranked matches to rank anyone yet. Ranked only opened this season.",
      loading: "Loading the ladder…",
      failed: "deadlock-api is not answering, so there is nothing to rank right now.",
      /** Los títulos de las dos columnas. */
      worldTitle: "In the world",
      byHero: "By hero",
      /**
       * Qué se está contando. **Va siempre visible, no en un tooltip**: la
       * ventana de clasificatorias es de dos semanas y eso cambia cómo se leen
       * los números. Callarlo los haría parecer de toda la vida del juego.
       */
      rankedOnly: "Ranked matches only, since ranked opened on 30 July 2026.",
      /** Un héroe puede no tener tres jugadores con partidas suficientes todavía. */
      noPodium: "No one has enough ranked matches on this hero yet.",
      wins: (n: string) => `${n} wins`,
      of: (n: string) => `of ${n}`,
    },
    bands: {
      "phantom-above": "Phantom+",
      "archon-oracle": "Emissary / Oracle",
      "ritualist-emissary": "Mystic / Ritualist",
      "arcanist-below": "Sentinel and below",
    },
    note: "Each band is measured on its own matches, not on the ranks above it.",
    /**
     * Sólo aparece mientras la banda publicada no sea la preferida. No es una
     * disculpa por el tamaño de la muestra: contesta la pregunta de alguien
     * que entró buscando Fantasma+ y encontró otra cosa. Se apaga solo el día
     * que Fantasma+ junte partidas.
     */
    fallback: (shown: string) =>
      `Deadlock reset every rank on July 30 and placement caps at Oracle 6, so Phantom+ has no ranked ` +
      `matches yet. Showing ${shown} until it fills up — it switches back on its own.`,
    emptyBand: "No ranked matches at this rank yet — every rank was reset on July 30.",
    loading: "Loading this rank's heroes…",
    stats: { winRate: "Win rate", pickRate: "Pick rate" },
    /**
     * The two readings that replaced their raw numbers.
     *
     * "+3.0" and "−4.1" were honest and unreadable: you had to know what the
     * number measured, which way was good, and how big is big. A word lands in
     * one pass, and the number that backs it is one hover away.
     */
    difficulty: { hard: "Hard", easy: "Easy" },
    momentum: { up: "Rising", down: "Falling" },
    why: {
      skillGap: (points: string) =>
        `Wins ${points} points more at Phantom+ than at Sentinel and below. A hero that ` +
        "gains up there has something to learn; one that loses there works until the other " +
        "side knows better.",
      trend: (points: string) => `Win rate moved ${points} points against the previous 15 days.`,
    },
    thin: "Few matches",
    thinWhy: "Too few matches at this rank for the win rate to be steady.",
    sample: (matches: string, from: string, to: string) =>
      `${matches} matches · ${from} to ${to}`,
    patch: {
      heading: "What the patch changed",
      /** The patch is the window: everything above is measured since it landed. */
      since: (title: string) => `Measured since ${title}`,
      winners: "Winners",
      losers: "Losers",
      winRate: "Win rate",
      pickRate: "Pick rate",
      none: "No hero moved enough yet to call it a change.",

      /**
       * El historial, que es lo que esta pestaña tiene para mostrar hasta que
       * haya dos ventanas rankeadas que comparar.
       *
       * **La fecha manda sobre el título, y hay que decirlo**: Valve nombra cada
       * parche por la fecha de la build, así que el que llegó el 28 de julio se
       * llama "06-30-2026 Update". Sin la aclaración, la lista se lee como si
       * estuviera desordenada.
       */
      history: "Patch history",
      nameNote:
        "Valve names each patch after the build date, which is not the day it shipped — so the " +
        "list is ordered by when players actually got it.",
      read: "Read the notes",
      current: "Current",
    },
    footnote:
      "Deadlock is a Valve game and Vestigo is not affiliated with Valve. Match data comes " +
      "from the public deadlock-api.com snapshot; every figure on this page is our own.",
  },

  footer: {
    sources:
      "Match data from the Riot Games API · Portraits, items and names from CommunityDragon",
    // The footer is on every page, but the sources are not the same on every
    // page: nothing on /deadlock ever touched Riot or CommunityDragon. Naming
    // the wrong source is worse than naming none, so the line follows the game.
    sourcesDeadlock:
      "Match data from the public deadlock-api.com snapshot · Hero and item art from Valve",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    // Both documents are English-only, so a Spanish reader deserves fair warning
    // before the click rather than a surprise after it.
    englishOnly: "",
    disclaimer:
      "Vestigo isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot " +
      "Games or anyone officially involved in producing or managing Riot Games properties. Riot " +
      "Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
    disclaimerValve:
      "Vestigo isn't endorsed by Valve Corporation. Deadlock, Dota 2 and all associated " +
      "properties are trademarks or registered trademarks of Valve Corporation.",
  },

  // Said plainly, and without a pre-ticked box or a greyed-out "decline": the
  // refusal has to be as easy as the acceptance, or the consent is not consent.
  consent: {
    title: "Before you look around",
    body:
      "We'd like to use Google Analytics to see which pages people actually use, so we know " +
      "what to build next. It sets cookies and sends your visit to Google. Decline and none of " +
      "it loads — the site works exactly the same either way.",
    accept: "Accept",
    decline: "Decline",
    more: "Read the Privacy Policy",
    settings: "Cookies",
    on: "Analytics: on",
    off: "Analytics: off",
  },

  /**
   * What search engines and link previews show.
   *
   * Titles name the set, because that is how people actually search — "TFT set
   * 17 comps", not "TFT comps" — and it is the phrase we can realistically rank
   * for against sites with years of authority. The set number is passed in
   * rather than written here, so a new set does not silently date every page.
   *
   * Kept near 60 characters: past that Google truncates the title in results.
   */
  seo: {
    home: {
      title: () => "Vestigo — Get better at the games you play",
      description: () =>
        "Vestigo reads your finished matches and turns them into something you can " +
        "act on before the next game: meta reports and analysis of your own history.",
    },
    tft: {
      meta: {
        title: (set: string) => `TFT Set ${set} Meta Comps and Tier List | Vestigo`,
        description: (set: string) =>
          `The strongest Teamfight Tactics Set ${set} comps, ranked by average placement ` +
          "over thousands of high-elo games, with the units, items and level each one needs.",
      },
      // A band page is its own page, not a filter on the tier list: what wins in
      // Gold is a different answer from what wins in Master, and it is the
      // answer people actually search for.
      metaBand: {
        title: (band: string, set: string) => `TFT Set ${set} ${band} Meta Comps | Vestigo`,
        description: (band: string, set: string) =>
          `The best Teamfight Tactics Set ${set} comps in ${band}, ranked by average placement ` +
          `over real ${band} games — not carried over from higher ranks.`,
      },
      units: {
        title: (set: string) => `TFT Set ${set} Unit Stats and Win Rates | Vestigo`,
        description: (set: string) =>
          `Every Teamfight Tactics Set ${set} champion by play rate, average placement and ` +
          "the items they actually carry, measured across thousands of high-elo boards.",
      },
      items: {
        title: (set: string) => `TFT Set ${set} Item Stats and Best Carriers | Vestigo`,
        description: (set: string) =>
          `Which Teamfight Tactics Set ${set} items change where you place, what they are ` +
          "built from, and the champions that hold them best.",
      },
      ladder: {
        title: () => "TFT Challenger Ladder by Region | Vestigo",
        description: () =>
          "The top Teamfight Tactics players by region, with LP, wins and losses, " +
          "straight from Riot's ranked ladder.",
      },
      player: {
        title: () => "TFT Match History and Post-Game Analysis | Vestigo",
        description: () =>
          "Search any Riot ID and read the match back: where you placed, what you played, " +
          "and the habits across your history that cost you the most.",
      },
    },
    deadlock: {
      meta: {
        title: () => "Deadlock Hero Tier List and Win Rates | Vestigo",
        description: () =>
          "Which Deadlock heroes are actually winning, by rank. Win rate, pick rate and how " +
          "much each hero rewards knowing the game, measured on real matches.",
      },
      items: {
        title: () => "Deadlock Item Tier List — Best Items by Price | Vestigo",
        description: () =>
          "Which Deadlock items are actually worth their souls. Every item measured against " +
          "what its own price is worth, so a 6400 item is not called good just for being late.",
      },
      ranks: {
        title: () => "Deadlock Rank Distribution — Players by Rank | Vestigo",
        description: () =>
          "How many players sit at every Deadlock rank, and how the ladder is rebuilding itself " +
          "day by day since the Season 1 reset.",
      },
      ladder: {
        title: () => "Deadlock Player Ladder — Best Players by Hero and Rank | Vestigo",
        description: () =>
          "The best Deadlock players on each hero, at every rank, with the number of matches " +
          "behind every win rate so a new account never passes for a veteran.",
      },
      patches: {
        title: () => "Deadlock Patch Winners and Losers | Vestigo",
        description: () =>
          "Every Deadlock hero the latest patch moved, measured against the same stretch of " +
          "the game right before it landed.",
      },
      player: {
        title: () => "Deadlock Match History and Post-Game Report | Vestigo",
        description: () =>
          "Search your Deadlock matches and see what each one cost you: the items you skipped, " +
          "bought late or never upgraded, against the players who won from the same spot.",
      },
      /**
       * Cada partida es una URL propia, así que este título es el que ve alguien
       * que abre un link compartido en Discord — y también el que Google indexa.
       */
      match: {
        title: () => "Deadlock Match Report | Vestigo",
        description: () =>
          "A Deadlock match, player by player: a grade for all twelve and what the shopping " +
          "cost the one you pick, measured against the players who won from the same spot.",
      },
      detail: {
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — Deadlock Item Stats | Vestigo`
            : `${name} — Deadlock Build & Counters | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `How ${name} performs in Deadlock: win rate against its own price, pick rate, ` +
              "and the heroes that carry it best."
            : `How to play ${name} in Deadlock: win rate, pick rate, the recommended build ` +
              "order, and the matchups that change it.",
      },
    },
    privacy: {
      title: () => "Privacy Policy | Vestigo",
      description: () => "What Vestigo collects, why, and what it never touches.",
    },
    terms: {
      title: () => "Terms of Service | Vestigo",
      description: () => "The rules for using Vestigo, and the limits of what it promises.",
    },
    detail: {
      title: (name: string, section: string, set: string) =>
        section === "meta"
          ? `${name} — TFT Set ${set} Comp Guide | Vestigo`
          : `${name} — TFT Set ${set} Stats | Vestigo`,
      description: (name: string, section: string, set: string) =>
        section === "units"
          ? `How ${name} performs in Teamfight Tactics Set ${set}: play rate, average ` +
            "placement, the star levels worth chasing and the items it carries."
          : section === "items"
            ? `What ${name} does in Teamfight Tactics Set ${set}, what it is built from, ` +
              "and which champions place best holding it."
            : `How to play ${name} in Teamfight Tactics Set ${set}: the units, the items, ` +
              "the level to stop at and how often it wins.",
    },
  },
};

const ES: typeof EN = {
  brand: "Vestigo",
  games: {
    tft: "Teamfight Tactics",
    tftShort: "TFT",
    deadlock: "Deadlock",
    dota: "Dota 2",
    soon: "Pronto",
    /** La insignia de una pestaña que ya se puede usar pero todavía se mueve. */
    beta: "Beta",
  },
  sections: {
    home: "Inicio",
    meta: "Meta",
    units: "Unidades",
    items: "Ítems",
    ladder: "Ladder",
    player: "Jugador",
  },
  language: {
    label: "Idioma",
    en: "EN",
    es: "ES",
  },

  home: {
    eyebrow: "Estadística de partidas terminadas",
    /** Ver la nota de la versión en inglés: el lema explica el nombre. */
    title: "Toda partida",
    titleBreak: "deja rastro",
    lead:
      "Tus partidas ya tienen la respuesta. Vestigo te las lee de vuelta y convierte el " +
      "historial en algo que puedes usar antes de la próxima.",
    counts: {
      matches: "partidas leídas",
      measured: "última medición",
    },
    fresh: {
      today: "hoy",
      yesterday: "ayer",
      days: (n: number) => `hace ${n} días`,
    },
    figures: {
      placement: (name: string) => `posición media · ${name}`,
      winRate: (name: string) => `victorias · ${name}`,
      matchesSet: (set: string) => `partidas · set ${set}`,
      matchesBand: (band: string) => `partidas · ${band}`,
      topBand: "Phantom+",
      unmeasured: "todavía sin medir",
    },
    games: {
      heading: "Dónde puedes usarlo",
      cta: "Entrar",
      soonCta: "Muy pronto",
      tft: "Reporte del meta y análisis de partidas, funcionando ya.",
      deadlock: "Tier list de héroes e ítems, funcionando ya.",
      dota: "Todavía no arranca — es el próximo en la lista después de Deadlock.",
    },
  },


  meta: {
    title: "Composiciones",
    titleBreak: " del meta",
    standfirst:
      "Calculado con partidas reales del rango que elijas. El orden de las unidades sigue cuánto invierte " +
      "la comp en cada una — no cuánto cuestan. Las estrellas marcan a quién subir a 3★. Abre una comp para ver el plan completo.",
    tiers: {
      S: "Rotas",
      A: "Muy fuertes",
      B: "Sólidas",
      C: "Flojas",
      D: "Evitar",
    },
    sets: {
      label: "Set",
      name: (n) => `Set ${n}`,
      soon: "pronto",
      note: "La lista cubre el set en vivo. El siguiente se abre acá cuando se haya jugado lo suficiente.",
      archived: "archivado",
      archivedNote: (n) =>
        `El Set ${n} terminó. Estos números son su medición final y ya no cambian.`,
    },
    bands: {
      label: "Rango",
      filter: "Filtrar por rango",
      note: "Cada banda se mide con sus propias partidas, no con las de los rangos de arriba.",
      loading: "Cargando el meta de este rango…",
      names: {
        global: "Platino+",
        apex: "Máster+",
        "diamond-emerald": "Diamante / Esmeralda",
        "platinum-gold": "Platino / Oro",
        "silver-below": "Plata y abajo",
      } as Record<string, string>,
      thin:
        "Tenemos menos partidas en este rango, así que la mayoría de estas comps se apoya en una " +
        "muestra pequeña. Léelas como una orientación, no como un ranking.",
      provisional: (patch: string) =>
        `El parche ${patch} recién salió, así que esta lista se apoya en muchas menos partidas ` +
        `de lo habitual y va a moverse en los próximos días. La mostramos igual porque el parche ` +
        `anterior responde otra pregunta.`,
      empty: (patch: string) =>
        `Todavía no tenemos suficientes partidas de este rango en el parche ${patch}. ` +
        `Antes que mostrarte las comps del parche anterior, esto se completa solo a medida que lleguen.`,
    },
    dataset: {
      comps: "Comps",
      set: "Conjunto",
      patch: "Parche",
      updated: "Actualizado",
    },
    stats: {
      placement: "Posición",
      top4: "Top 4",
      first: "1.º",
      play: "Uso",
    },
    tags: {
      consistent: {
        label: "Top 4 seguro",
        why:
          "Entra al top cuatro con frecuencia, pero rara vez sale primera. " +
          "Sube poco a poco, sin picos.",
      },
      highWin: {
        label: "Busca el primero",
        why:
          "Gana con más frecuencia que la mayoría — a cambio de terminar abajo cuando falla.",
      },
      contested: {
        // "Muy jugada" quedaba ambiguo: en el Río de la Plata "jugado" también
        // quiere decir arriesgado, o sea lo contrario de lo que mide.
        label: "Popular",
        why: "La juega bastante gente: es probable que alguien compita por las mismas unidades.",
      },
      thinData: {
        label: "Pocas partidas",
        why: "Medida sobre pocos tableros: toma estos números como una pista, no como un hecho.",
      },
    },
    swing: {
      heading: "Qué inclina esta comp",
      note:
        "Unidades opcionales, ordenadas por cuánto se mueve el resultado del tablero cuando " +
        "aparecen. Medido contra la misma comp sin ellas.",
      better: (n: string) => `${n} puestos mejor`,
      worse: (n: string) => `${n} puestos peor`,
      inWinners: "de los tableros ganadores",
      inLosers: "de los perdedores",
    },
    detail: {
      itemsHeading: "Prioridad de ítems",
      itemsNote:
        "A qué ítems darles preferencia al equipar tus unidades fuertes. Pasa el mouse para ver con qué componentes se arma cada uno.",
      unitsHeading: "Unidades e ítems",
      evidence: (level, boards) =>
        `En nuestros datos esta comp termina en nivel ${level} de media, sobre ${boards} tableros.`,
      carryTag: "carry",
      starTag: "subir a 3★",
      flexTag: "flex",
      flexWhy: (share: string) => `Aparece en ${share} de los tableros de esta comp — es uno de los lugares que rota.`,
      noItems: "sin ítems",
      withItems: "con ítems",
      builtFrom: "Se arma con",
      baseComponent: "Componente base",
      inGames: (share) => `en ${share} de las partidas`,
    },
    variants: {
      show: (n: number) => `${n === 1 ? "1 variante" : `${n} variantes`}`,
      back: "Volver a la original",
      differentTier: (tier: string) => `Esta variante es Tier ${tier}`,
    },
    copyBuild: {
      label: "Copiar código de la build",
      done: "Copiado — pegalo en el TFT",
      hint: "Pegalo en el Planificador de Equipo del juego para ver qué campeones comprar",
    },
  },

  units: {
    title: "Estadísticas",
    titleBreak: " por unidad",
    standfirst:
      "Cada campeón, medido sobre las mismas partidas de high elo. Ordenado por cuánto se juega " +
      "—no por lo que cuesta, porque el precio de tienda no mide el poder.",
    sort: {
      label: "Ordenar por",
      play: "Más jugadas",
      placement: "Mejor puesto",
      impact: "Mayor impacto",
    },
    filter: { cost: "Costo", all: "Todas" },
    cols: {
      unit: "Unidad",
      cost: "Costo",
      play: "Uso",
      place: "Puesto",
      impact: "Impacto",
    },
    carry: "carry",
    better: (n) => `${n} mejor`,
    worse: (n) => `${n} peor`,
    bestStar: (n) => `Mejor a ${n}★`,
    starsHeading: "Puesto por nivel de estrella",
    starsNote: "Dónde terminan los tableros en cada nivel. Una unidad de reroll solo rinde a 3★.",
    itemsHeading: "Qué arman los que ganan",
    itemsNote: "Los ítems que los tableros top 4 le ponen a esta unidad.",
    noItems: "Casi nunca lleva ítems — no es carry.",
    star: (n) => `${n}★`,
    games: (n) => `${n} partidas`,
  },

  items: {
    title: "Estadísticas",
    titleBreak: " por ítem",
    standfirst:
      "Cada ítem armado, medido sobre las mismas partidas de high elo. Ordenado por cuánto se " +
      "arma, con los campeones que mejor lo llevan.",
    sort: {
      label: "Ordenar por",
      play: "Más armados",
      placement: "Mejor puesto",
      impact: "Mayor impacto",
    },
    cols: { item: "Ítem", play: "Uso", place: "Puesto", impact: "Impacto" },
    better: (n) => `${n} mejor`,
    worse: (n) => `${n} peor`,
    builtFrom: "Se arma con",
    bestOn: "Mejor llevado por",
    bestOnNote: "Los campeones que más llevan este ítem, con su puesto promedio.",
    games: (n) => `${n} partidas`,
  },

  ladder: {
    title: "Ladder",
    titleBreak: " de Challenger",
    standfirst:
      "La cima del ladder ranked, por región — el ranking oficial de Riot, actualizado cada " +
      "tanto. En Teamfight Tactics una victoria es terminar en el top 4.",
    region: "Región",
    cols: { rank: "#", player: "Jugador", lp: "LP", record: "V / D", top4: "Top 4" },
    unknown: "Jugador desconocido",
    loading: "Cargando el ladder…",
    empty: "Todavía no hay datos del ladder para esta región.",
    error: "No se pudo cargar el ladder. Prueba de nuevo en un momento.",
  },

  plan: {
    reroll1: {
      badge: "Reroll 6",
      label: "Reroll de 1 costo",
      steps: [
        "Quédate en nivel 6 y haz slow roll para llegar a 3 estrellas.",
        "Picos de poder: 3-1, 3-5 y 4-1.",
        "No bajes de 50 de oro: el interés paga el roll.",
      ],
    },
    reroll2: {
      badge: "Reroll 6",
      label: "Reroll de 2 costo",
      steps: [
        "Sube a nivel 6 en 3-2 y haz slow roll ahí.",
        "Picos de poder: 3-2, 4-1 y 4-5.",
        "Mantenete arriba de 50 de oro salvo que necesites estabilizar.",
      ],
    },
    reroll3: {
      badge: "Reroll 7",
      label: "Reroll de 3 costo",
      steps: [
        "Estabiliza en nivel 7 alrededor de 3-5 con 40+ de oro.",
        "Picos de poder: 3-2, 3-5, 4-1 y 5-1.",
        "Cuando cierres las 3 estrellas, sube a 8 para escalar.",
      ],
    },
    fast8: {
      badge: "Fast 8",
      label: "Fast 8",
      steps: [
        "Prioriza subir de nivel por encima de rollear.",
        "Nivel 7 en 4-1; empuja a 8 y recién ahí rollea.",
        "Nunca bajes de 50 de oro antes de empezar a empujar XP.",
      ],
    },
    standard: {
      badge: "Estándar",
      label: "Curva de nivel estándar",
      steps: [
        "Curva de nivel normal: 6 en 3-2, 7 en 4-1.",
        "Rollea para estabilizar cuando la vida lo pida.",
        "Cuida el interés: 50 de oro es el piso cómodo.",
      ],
    },
  },

  playerTags: {
    heading: "Qué dicen tus últimas partidas",
    note: "Sale de tu historial reciente. Cada una muestra el número que la respalda.",
    chainWins: {
      label: "Encadena rachas",
      why: (rate: string, n: number) =>
        `Después de un top cuatro vuelves a entrar el ${rate} de las veces, sobre ${n} oportunidades.`,
    },
    chainLosses: {
      label: "Encadena derrotas",
      why: (rate: string, n: number) =>
        `Después de terminar en la mitad de abajo repites el ${rate} de las veces, sobre ${n} ` +
        "oportunidades. Considera cortar después de dos.",
    },
    forcer: {
      label: "Fuerza siempre lo mismo",
      why: (rate: string) =>
        `El ${rate} de tus unidades se repite de una partida a la otra. Conoces tu comp — pero ` +
        "la lobby decide qué queda libre.",
    },
    flexible: {
      label: "Juega lo que hay",
      why: (rate: string) =>
        `Solo el ${rate} de tus unidades se repite entre partidas. Sigues el tablero, no un plan.`,
    },
    unitGod: {
      label: (unit: string) => `Especialista en ${unit}`,
      why: (unit: string, place: string) =>
        `${unit} es tu carry más frecuente, y con ella terminas ${place} en promedio.`,
    },
    highRoller: {
      label: "Rerollea",
      why: (rate: string, n: number) =>
        `Llegaste a una unidad de tres estrellas en ${n} de tus últimas partidas (${rate}).`,
    },
  },

  player: {
    title: "Análisis",
    titleBreak: " de partidas",
    standfirst:
      "Busca un Riot ID y abre cualquier partida: te decimos qué se pudo hacer mejor contra la " +
      "comp que estabas armando, quién te la disputaba y en qué se fue el oro.",
    riotId: "Riot ID",
    riotIdPlaceholder: "Nombre#TAG",
    region: "Región",
    regions: {
      na1: "Norteamérica",
      euw1: "Europa Oeste",
      eun1: "Europa Norte",
      br1: "Brasil",
      la1: "LAN",
      la2: "LAS",
      kr: "Corea",
      jp1: "Japón",
      oc1: "Oceanía",
    },
    search: "Analizar",
    searching: "Buscando…",
    badRiotId: 'Escribe el Riot ID completo, con la forma "Nombre#TAG".',
    idleHint:
      "Escribe un Riot ID para ver el historial y, en cada partida, qué se pudo hacer mejor " +
      "contra la comp que estabas armando.",
    found: (n) => `${n} ${n === 1 ? "partida encontrada" : "partidas encontradas"}`,
    accountLevel: (n) => `Nivel ${n}`,
    // Los nombres del cliente en español. Aspirante es Challenger: así lo
    // llama el juego, no es una traducción nuestra.
    tiers: {
      IRON: "Hierro",
      BRONZE: "Bronce",
      SILVER: "Plata",
      GOLD: "Oro",
      PLATINUM: "Platino",
      EMERALD: "Esmeralda",
      DIAMOND: "Diamante",
      MASTER: "Maestro",
      GRANDMASTER: "Gran maestro",
      CHALLENGER: "Aspirante",
    },
    standing: (tier, division, lp) => `${tier}${division ? ` ${division}` : ""} · ${lp} PL`,
    loading: (n) => ` · cargando ${n}…`,
    offline: "Mostrando las partidas que ya teníamos guardadas — Riot no respondió.",
    rank: {
      own: (band: string) => `Comparado con el meta de ${band} — tu rango.`,
      fallback: (band: string) =>
        `Esta cuenta no tiene rango en TFT clasificatoria, así que se compara con el meta de ${band}.`,
      thinBand: (own: string, used: string) =>
        `Todavía no tenemos suficientes partidas de ${own} en este parche, así que esto se ` +
        `compara con el meta de ${used}.`,
      waiting: "Cargando el meta de tu rango…",
    },
    level: "Nv.",
    round: "Ronda",
    place: "Puesto",
    notes: "Notas",
    matchLabel: (id, place, comp, notes) =>
      `Partida ${id}: ${place} con ${comp}. ${notes} notas.`,
    noPlace: "sin puesto",
    noComp: "Sin comp definida",
    betterHeading: "Qué se pudo hacer mejor",
    nothingToFlag:
      "Nada que señalar en esta partida: ni oro sin gastar, ni huecos contra el meta, ni comps disputadas.",
    lobbyHeading: "La lobby",
    lobbyNote:
      "Con qué se enfrentó tu tablero. Los ocho tableros están tomados en el momento en que cada " +
      "jugador fue eliminado, no todos a la vez.",
    ordinals: ["", "1.º", "2.º", "3.º", "4.º", "5.º", "6.º", "7.º", "8.º"],
  },

  profile: {
    severity: { high: "Clave", medium: "A mejorar", info: "Contexto" },
    historyHeading: "Lo que dice tu historial",
    historyNote: (n) => `Patrones que solo aparecen mirando las ${n} partidas juntas.`,
    matches: "Partidas",
    avgPlacement: "Puesto medio",
    top4: "Top 4",
    firsts: "Primeros",
    excluded: (n) =>
      `${n} ${n === 1 ? "partida queda" : "partidas quedan"} fuera de estos números: Doble Up y ` +
      "PvE no se miden con la misma vara.",
    compsHeading: "Las comps que más juegas",
    compsNote: "Cuántas veces la armaste y en qué puesto terminaste en promedio.",
    championsHeading: "Los campeones que más usas",
    championsNote: "Presencia en tu tablero final, con tu puesto promedio cuando la llevas.",
    oneGame: "1 partida",
    placeUnit: "puesto",
    timeline: {
      heading: "Partidas recientes",
      note: "Puesto en cada partida en pantalla, de la más vieja a la más nueva — la última barra es la más reciente.",
      tooltip: (place, date) => `${place} · ${date}`,
    },
    lp: {
      heading: "PL en este set",
      note: "Cada vez que consultamos esta cuenta, desde que empezamos a seguirla.",
      none: "Todavía no registramos el rango de esta cuenta.",
      justStarted:
        "Hoy empezamos a seguir los PL de esta cuenta. Vuelve después de la próxima partida " +
        "clasificatoria y acá va a haber algo para mostrar.",
      net: (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n)} PL`,
      since: (points, day) => `en ${points} lecturas desde el ${day}`,
      alt: (first, last) => `PL a lo largo del tiempo, de ${first} a ${last}.`,
    },
    places: {
      heading: "En qué puesto terminas",
      note: "Cada columna es una partida terminada en ese puesto. Las doradas son top 4.",
      ordinals: ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º", "7.º", "8.º"],
      tooltip: (place, count, total) => `${place}: ${count} de ${total} partidas`,
    },
    coach: {
      heading: "Qué hacen distinto los que están arriba",
      note:
        "Solo hábitos que son una decisión real, que el rango de arriba hace menos seguido, y " +
        "que te cuestan puestos en tu propio rango. Los tres, o no aparece acá.",
      you: "Tú",
      cost: (places, boards) =>
        `En tu rango, los tableros así terminan ${places} puestos más abajo en promedio, sobre ` +
        `${boards} tableros. Parte de esa diferencia es el hábito y parte es una partida que ya ` +
        `venía mal — es una señal, no un precio.`,
      games: (n) => `${n} ${n === 1 ? "partida" : "partidas"}`,
      habits: {
        hoardsGold: "Terminas las partidas con oro en el banco",
        lowLevel: "Caes con menos nivel",
        carryShort: "Tu carry termina sin sus tres ítems",
        rerolls: "Rolleas por tres estrellas en unidades baratas",
        contestedCarry: "Te comprometes con un carry que otro también juega",
        offMeta: "Juegas tableros que no coinciden con ninguna comp de la lista",
        lowTierComp: "Juegas comps del fondo de la lista",
      },
      empty:
        "En todo lo que medimos, tus hábitos ya se parecen a los del rango de arriba.",
      emptyList: (habits) => `Se midió: ${habits}.`,
      top: "Estás en la banda más alta, así que no hay un rango arriba con el cual compararte.",
      thin: (n) =>
        `Una tasa necesita al menos ${n} partidas para decir algo. Juega algunas más y vuelve a mirar.`,
      unranked:
        "Necesitamos tu rango para saber contra quién compararte, y Riot todavía no nos dio uno.",
    },
  },

  errors: {
    PLAYER_NOT_FOUND: {
      title: "No encontramos ese Riot ID",
      hint: "Revisa el nombre y el tag. El tag va después del #, sin espacios.",
    },
    RIOT_KEY_INVALID: {
      title: "La clave de Riot venció",
      hint: "Las claves de desarrollo duran unas 24 horas. Hay que renovarla para volver a buscar.",
    },
    RATE_LIMITED: {
      title: "Riot nos pidió esperar",
      hint: "Demasiadas consultas seguidas. Prueba de nuevo en unos segundos.",
    },
    TOO_MANY_REQUESTS: {
      title: "Demasiadas búsquedas seguidas",
      hint: "Limitamos qué tan rápido puede buscar una misma conexión, para no pasarnos de la cuota de Riot. Espera un minuto.",
    },
    NOT_CONFIGURED: {
      title: "Falta configurar la clave de Riot",
      hint: "No hay ninguna clave cargada del lado del servidor.",
    },
    UPSTREAM_ERROR: {
      title: "Riot no respondió bien",
      hint: "El problema está del lado de ellos. Prueba de nuevo en un rato.",
    },
    NETWORK: {
      title: "No pudimos conectarnos",
      hint:
        "El pedido no llegó a destino. Puede ser tu conexión, que el servidor no esté " +
        "corriendo, o que una extensión o antivirus esté bloqueando el acceso.",
    },
    BAD_REQUEST: {
      title: "Esa búsqueda no es válida",
      hint: 'Escribe el Riot ID completo, con la forma "Nombre#TAG".',
    },
  },

  deadlock: {
    eyebrow: "Vestigo · Deadlock",
    title: "Tier list",
    titleBreak: " de héroes",
    lead:
      "Porcentajes de victoria medidos sobre partidas reales, separados por el rango al que " +
      "se jugó cada una. Los héroes se mueven — uno que carga en Fantasma puede ser la peor " +
      "elección debajo de Centinela — así que elige la banda en la que juegas.",
    tabs: {
      meta: "Meta",
      items: "Objetos",
      ranks: "Rangos",
      ladder: "Escalera",
      patches: "Parches",
      player: "Jugador",
      match: "Partida",
    },

    report: {
      searchTitle: "Tus partidas",
      searchLead:
        "Busca tu nombre de Steam y abre una partida. El informe compara qué compraste, y cuándo, " +
        "contra los que ganaron desde la misma situación: mismo héroe y mismo tipo de equipo rival.",
      placeholder: "Nombre de Steam",
      search: "Buscar",
      searching: "Buscando…",
      noAccounts: "No hay ninguna cuenta con ese nombre.",
      recent: (n: number) =>
        n === 1 ? "1 partida en los últimos 30 días" : `${n} partidas en los últimos 30 días`,
      history: "Partidas recientes",
      loadingMatch: "Cargando la partida…",
      notFound: "deadlock-api todavía no tiene esa partida.",
      apiDown:
        "deadlock-api no está contestando. Los datos de la partida salen de ahí, así que ahora mismo no hay nada que mostrar.",
      noReference:
        "No se pudo cargar nuestra tabla de referencia, así que no hay contra qué comparar esta partida.",
      win: "Victoria",
      loss: "Derrota",
      reportTitle: "Qué te costó esta partida",
      clean:
        "No hay nada que corregir del lado de las compras: qué compraste, y cuándo, coincide con los que ganaron desde la misma situación.",
      measured: (band: string, matches: string) =>
        `Medido contra ${band} — ${matches} partidas desde el parche vigente.`,
      pickPlayer: "Elige un jugador",
      you: "Informe de",
      grade: "Nota",
      noGrade: "No hay partidas suficientes con este héroe para ponerle nota.",
      gradeHow: (letter: string, hero: string) =>
        `${letter} es dónde queda este ${hero} entre todos los ${hero} de partidas así de largas, en almas, ` +
        "daño a héroes y muertes — cada una como cuota de su propio equipo, así la suerte del equipo se cancela.",
      signals: { souls: "Almas", damage: "Daño", deaths: "Muertes" },
      typical: (x: string) => `lo típico es ${x}`,
      costMost: (p: { signal: string; mine: string; typical: string; hero: string }) =>
        `Lo que más te costó: ${p.signal.toLowerCase()}. Tu parte fue ${p.mine} de la de tu equipo, ` +
        `y la de un ${p.hero} típico es ${p.typical}.`,
      helpedMost: (p: { signal: string; mine: string; typical: string; hero: string }) =>
        `Nada te bajó la nota: las tres señales quedaron del lado bueno. La que más sumó fue ` +
        `${p.signal.toLowerCase()}: ${p.mine} de la de tu equipo, contra ${p.typical} de un ${p.hero} típico.`,
      toggleCurve: "Mostrar u ocultar la curva de este jugador",
      backToMatches: "Volver a la lista de partidas",
      backToSearch: "Buscar un jugador",
      noRank: "Todavía sin partidas rankeadas",
      rankUnknown: "No se pudo cargar el rango ahora",
      calibrating: (done: number, total: number) => `Calibrando · ${done} de ${total}`,
      calibratingLeft: (left: number) =>
        left === 1 ? "Falta 1 partida de calibración" : `Faltan ${left} partidas de calibración`,
      stats: {
        matches: "Partidas",
        winRate: "Victorias",
        kda: "K/M/A",
        souls: "Almas por minuto",
        top: "Más jugados",
        lastHitsDenies: "Golpes / denies",
      },
      cards: {
        profile: "Jugador",
        heroes: "Más jugados",
        activity: "Actividad",
        placings: "Ranking mundial",
      },
      worldTagLabel: "Mundo",
      worldTagTitle: (of: string, min: number) =>
        `De ${of} jugadores con ${min}+ partidas clasificatorias esta temporada`,
      steamProfile: "Perfil de Steam",
      histCols: {
        hero: "Héroe",
        result: "Resultado",
        grade: "Nota",
        kda: "K/M/A",
        farm: "GP/DN",
        souls: "Almas",
        // "Tiempo" y no "Duración": nueve caracteres en Cinzel espaciado pedían
        // 93px de los 55 de la columna, y era el rótulo que más se salía.
        length: "Tiempo",
        rank: "Rango",
        when: "Cuándo",
      },
      rankUp: "Ascenso",
      rankUpTitle: (from: string, to: string) => `Ascenso en esta partida: ${from} → ${to}`,
      scopes: {
        label: "Modo de juego",
        name: {
          all: "Todas",
          ranked: "Clasificatorias",
          normal: "Normales",
          brawl: "Pelea callejera",
        },
        title: {
          all: "Todas las partidas del historial",
          ranked: "Clasificatorias desde que abrió el ranked",
          normal: "Todo lo que no es clasificatoria ni pelea callejera",
          brawl: "Partidas de pelea callejera",
        },
        empty: "No hay partidas en este modo.",
      },
      placingsLead: (n: number) =>
        n === 1 ? "Top 100 del mundo con 1 héroe." : `Top 100 del mundo con ${n} héroes.`,
      placingTitle: (hero: string, place: number) => `#${place} del mundo con ${hero}`,
      showMore: "Mostrar más partidas",
      activity: {
        weeks: (n: number) => `Últimas ${n} semanas`,
        won: "Más victorias",
        lost: "Más derrotas",
        none: "Sin jugar",
        day: (date: string, wins: number, losses: number) =>
          `${date} · ${wins}V ${losses}D`,
      },
      farmTitle: (lastHits: number, denies: number) => `${lastHits} golpes, ${denies} denies`,
      filterByHero: (hero: string) => `Filtrar por ${hero}`,
      shown: (visible: number, total: number) => {
        if (visible >= total) return total === 1 ? "1 partida" : `${total} partidas`;
        return `Mostrando las ${visible} más recientes de ${total} partidas`;
      },
      streakForm: {
        title: "Forma reciente",
        streakWin: (n: number) => `${n} victorias seguidas`,
        streakLoss: (n: number) => `${n} derrotas seguidas`,
        window: (n: number) => (n === 1 ? "Última partida" : `Últimas ${n}`),
        ranked: (n: number) => `Midiendo tus partidas clasificatorias de esta temporada — llevas ${n}.`,
        fallback: (n: number, min: number) => {
          const cuantas =
            n === 0 ? "ninguna partida clasificatoria todavía" : n === 1 ? "sólo 1 partida clasificatoria" : `sólo ${n} partidas clasificatorias`;
          return `El modo clasificatorio recién abrió esta temporada y tienes ${cuantas} — esto mide todas tus partidas hasta que llegues a ${min}.`;
        },
        scoped: {
          ranked: (n: number) =>
            n === 1
              ? "Midiendo 1 partida clasificatoria."
              : `Midiendo tus ${n} partidas clasificatorias.`,
          normal: (n: number) =>
            n === 1 ? "Midiendo 1 partida normal." : `Midiendo tus ${n} partidas normales.`,
          brawl: (n: number) =>
            n === 1
              ? "Midiendo 1 partida de pelea callejera."
              : `Midiendo tus ${n} partidas de pelea callejera.`,
        },
      },
      cols: {
        player: "Jugador",
        souls: "Almas",
        kda: "K/M/A",
        damage: "Daño",
        obj: "Objetivos",
        heal: "Curación",
        items: "Objetos",
      },
      soulsTitle: "Las almas, minuto a minuto",
      soulsNote: (duration: string, max: string) =>
        `El patrimonio de cada jugador a lo largo de los ${duration}, hasta ${max}. Ámbar es Hidden King; zafiro, Archmother.`,
      buildTitle: "Qué compró, en orden",
      boughtAt: (m: string) => `comprado en el minuto ${m}`,
      adviceTitle: "Qué costaron las compras",
      families: {
        resist: (p: { share: string; rate: string; item: string; spirit: boolean }) =>
          `El ${p.share} del daño que recibiste fue de ${p.spirit ? "espíritu" : "bala"}, y terminaste ` +
          `sin resistencia de ${p.spirit ? "espíritu" : "bala"}. El ${p.rate} de los que ganaron ` +
          `contra un equipo así tenía ${p.item}.`,
        skipped: (p: { rate: string; item: string }) =>
          `El ${p.rate} de los que ganaron este cruce terminó con ${p.item}, y no lo compraste.`,
        late: (p: { rate: string; item: string; mine: string; theirs: string }) =>
          `Compraste ${p.item} en el minuto ${p.mine}. Entre el ${p.rate} de los que ganaron y terminan ` +
          `con él, la mediana de compra es el minuto ${p.theirs}.`,
        unupgraded: (p: { rate: string; item: string; from: string }) =>
          `Terminaste la partida todavía con ${p.from}. El ${p.rate} de los que ganaron lo mejoró a ${p.item}.`,
        souls: (p: { mine: string; theirs: string }) =>
          `Terminaste con ${p.mine} almas sin gastar. Los que ganaron con este héroe terminaron con ${p.theirs}.`,
        slots: (p: { mine: string; theirs: string }) =>
          `Terminaste con ${p.mine} objetos. Los que ganaron con este héroe terminaron con ${p.theirs}.`,
        split: (p: { weapon: string; vitality: string; spirit: string; theirs: string }) =>
          `Repartiste ${p.weapon} en arma, ${p.vitality} en vitalidad y ${p.spirit} en espíritu. ` +
          `Los que ganaron con este héroe repartieron ${p.theirs}.`,
        imbue: (p: { rate: string }) =>
          `No imbuiste ninguna habilidad. El ${p.rate} de los que ganaron con este héroe imbuyó una.`,
        sold: (p: { item: string; rate: string; at: string }) =>
          `Vendiste ${p.item} en el minuto ${p.at}. Solo el ${p.rate} de los que ganaron y lo compraron lo vendió.`,
      },
    },

    mastery: {
      title: "Qué compra la práctica",
      lead: (a, from, b, to) =>
        `El porcentaje de victoria va de ${a} con ${from}+ partidas con este héroe a ${b} con ${to}+.`,
      games: (from) => `${from}+ partidas`,
      caveat:
        "Medido dentro de una sola banda de rango, así que el nivel de la sala queda fijo. " +
        "No separa aprender al héroe de ser mejor jugador desde antes.",
    },

    ladder: {
      title: "La",
      titleBreak: " escalera",
      lead:
        "La Temporada 1 reinició todos los rangos el 30 de julio. Esto es la escalera " +
        "reconstruyéndose, día a día: cuánta gente hay en cada escalón y a qué nivel se juega.",
      view: { matches: "Partidas", players: "Jugadores" },
      viewNote: {
        matches: "A qué nivel se están jugando las partidas, según el promedio de cada sala.",
        players: "Cuánta gente vimos en cada rango, contada una sola vez, en el último que le conocemos.",
      },
      calibrating: (pct, ranked, seen) =>
        `Solo el ${pct} de los jugadores terminó su calibración (${ranked} de ${seen} cuentas). ` +
        "Los que terminaron primero son los que más juegan, que suelen estar más arriba, " +
        "así que los rangos altos se ven más llenos de lo que están. Se corrige solo a medida " +
        "que el resto calibra.",
      players: "jugadores",
      matches: "partidas",
      day: "Por día",
      empty: "Todavía no hay partidas rankeadas.",
      sides: {
        title: "Qué lado gana",
        lead:
          "Deadlock no es simétrico, y la diferencia crece con el rango. Medido solo sobre partidas rankeadas.",
        overall: (pct, err) => `${pct} ± ${err}`,
        // Nombres propios de los patronos: no se traducen, igual que "Bebop".
        team0: "Hidden King",
        team1: "Archmother",
        thin: (min) =>
          `Todavía no hay partidas rankeadas suficientes para separarlo por rango — cada uno ` +
          `necesita unas ${min}. Se completa solo a medida que crece el corpus rankeado.`,
      },
    },
    buildCard: {
      toggle: (hero) => `Ver qué comprar en ${hero}`,
      phase: { early: "Inicio", mid: "Medio juego", late: "Juego tardío" },
      phaseRange: { early: "0 – 12 min", mid: "12 – 22 min", late: "22+ min" },
      mostPlayed: "La más jugada",
      bestWinRate: "Mejor winrate",
      none: "Todavía no hay partidas suficientes con este héroe.",
      // Los rasgos van como sustantivo y no como adjetivo: "Vampirismo de
      // espíritu" se lee bien y "Vampírica de espíritu" no concuerda con nada.
      name: (damage, trait) => `${trait} de ${damage}`,
      damage: { weapon: "daño de arma", vitality: "vida extra", spirit: "poder espiritual" },
      trait: { dps: "Daño", vampiric: "Vampirismo", survival: "Aguante" },
      damageSplit: "Inversión de almas",
      investment: (souls: string) => `${souls} almas`,
      unlockOrder: "Orden de habilidades",
      skillPath: "Cómo subir las habilidades",
      skillPathNote: "El orden en que la mayoría sube sus habilidades, paso a paso.",
      skillStep: (n) => `paso ${n}`,
      buyOrder: "En qué orden comprar",
      buyOrderNote:
        "Cada compra en orden, con los componentes — un tier 4 se arma, no se compra. " +
        "La flecha marca un paso que mejora algo ya comprado.",
      upgradeStep: "Mejora algo que ya se compró",
      items: (n) => `La build core · ${n} objetos`,
      byTier: "Qué comprar en cada escalón",
      sample: (matches, wr) => `${matches} partidas, ${wr}% ganadas`,
      entersAt: (minute) => `Se compra cerca del minuto ${minute}`,
      carried: (pct) => `${pct} de estas builds lo llevan`,
      upgradedFrom: "Se mejora de",
      carries: (pts: string) => `Carga esta build · +${pts} puntos de victoria`,
      keyItem: "Clave",
      ourPick: "Nuestra recomendación",
      beta: "Beta",
      recoLead: (n: string) =>
        `Partiendo de la build más jugada, nuestras métricas sugieren ${n} ` +
        `${n === "1" ? "cambio" : "cambios"}. El resto queda igual.`,
      recoNone:
        "La build más jugada ya es la mejor que podemos medir — no cambiaríamos nada.",
      recoWhy: (pts: string, games: string) =>
        `+${pts} puntos de victoria · ${games} partidas lo llevan junto al resto`,
      vsHero: (delta: string, hero: string) => ` · ${delta} contra el ${hero}% del héroe`,
      blended: "Mezclada",
      blendedWhy: (pct: string) =>
        `Sólo el ${pct}% de lo que hace esta gente pertenece a esta build — el resto está a mitad de camino de otra`,
      crossesPatch:
        "El parche vigente todavía no junta partidas suficientes, así que estas " +
        "builds incluyen también partidas anteriores — al revés que la tier list de arriba.",
      counters: "Situacionales — dependen de quién enfrentes",
      against: (foes) => `contra ${foes}`,
      foot: (band, from, to) =>
        `${band}, del ${from} al ${to}. Cada objeto medido contra jugadores que llegaron al mismo minuto con las mismas almas y las gastaron en otra cosa.`,
    },
    patchPage: {
      title: "Qué cambió",
      titleBreak: " el parche",
      lead:
        "Todos los héroes que se movieron cuando entró el último parche, medidos contra el " +
        "mismo tramo de juego justo anterior.",
    },
    itemsPage: {
      title: "Tier list",
      titleBreak: " de objetos",
      lead:
        "Cada objeto medido contra lo que rinde su propio precio, no contra toda la tienda. " +
        "Uno de 6400 gana más que uno de 800 porque sólo se compra en una partida que ya venía " +
        "larga — así que el número de acá es cuánto le saca cada objeto a los que cuestan lo mismo.",
      costGroup: (cost, n) => `${cost} almas, ${n} objetos`,
      baseline: (pct) => `cualquiera de este precio gana ${pct}`,
      slots: { weapon: "Arma", vitality: "Vitalidad", spirit: "Espíritu" },
      types: {
        bullet_damage: "Daño de arma",
        tech_damage: "Daño de espíritu",
        melee_damage: "Daño cuerpo a cuerpo",
        health: "Vida",
        healing: "Curación",
      },
      stats: { delta: "Ventaja", winRate: "Victorias", pickRate: "Uso" },
      deltaWhy: (points, base) =>
        `Gana ${points} puntos más que el objeto promedio de este precio (${base}). Se mide ` +
        "contra su propio precio porque comprar algo caro ya significa que la partida se hizo larga.",
      detail: {
        toggle: (name) => `${name} — qué hace`,
        loading: "Cargando…",
        none: "El juego no publica descripción para este objeto.",
        kinds: { active: "Activo", passive: "Pasivo" },
        upgradesTo: "Mejora a",
        upgradesFrom: "Mejora de",
        souls: "almas",
      },
      loading: "Cargando los objetos de este rango…",
      charts: {
        aside: "Cómo está la tienda ahora",
        tip: (edge, use) => `${edge} de ventaja · comprado en el ${use} de las partidas`,
        scatter: {
          title: "Lo que rinde contra lo que se compra",
          note:
            "Todos los objetos de este rango. A la izquierda los que casi nadie compra, a la " +
            "derecha los que compra todo el mundo; arriba de la línea le ganan a su precio, " +
            "abajo te cuestan la partida.",
          quadrants: {
            sleeper: "Arriba a la izquierda: rinde y casi nadie lo compra",
            trap: "Abajo a la derecha: lo compra todo el mundo y resta",
          },
          xAxis: "cuánto se compra",
          xLow: "Casi nadie",
          xHigh: "Todos",
          alt: (sleepers, traps, band) =>
            `Uso contra ventaja en ${band}: ${sleepers} objetos le ganan a su precio y se ` +
            `compran menos que el promedio, y ${traps} se compran más que el promedio y pierden terreno.`,
        },
        callouts: {
          sleeper: {
            title: "Vale más de lo que se usa",
            note: "Le gana a su precio y lo compra menos de la mitad de los jugadores.",
          },
          trap: {
            title: "Se compra más de lo que rinde",
            note: "Lo compra más de la mitad y aun así pierde contra su precio.",
          },
        },
        heatmap: {
          title: "Dónde está el valor",
          note:
            "Ventaja promedio de cada estante de la tienda. Verificado contra las cuatro bandas " +
            "de rango: las celdas de color fuerte mantienen el signo, las pálidas son las que no.",
          priceHeader: "Precio",
          tip: (cost, slot, edge, n) =>
            `${slot} de ${cost} almas: ${edge} en promedio sobre ${n} objetos`,
        },
        legend: { worse: "Debajo de su precio", par: "En su precio", better: "Arriba de su precio" },
      },
      footnote:
        "Los cuatro sitios de estadísticas de Deadlock ordenan los objetos por victorias, que " +
        "es ordenarlos por precio. Estos números son nuestros: cada objeto se acerca a lo que " +
        "rinde su precio según qué tan poca evidencia lo respalda, y cada base se publica en " +
        "el archivo de datos.",
    },
    ranks: { label: "Rango", filter: "Filtrar por rango", above: (rank: string) => `${rank}+` },
    playerLadder: {
      title: "Mejores",
      titleBreak: " jugadores",
      lead:
        "Los mejores jugadores clasificatorios del mundo, y quién encabeza cada héroe. Cada fila " +
        "dice sobre cuántas partidas está medida — un 100% en treinta partidas es una cuenta nueva, no un rey.",
      hero: "Héroe",
      allHeroes: "Todos los héroes",
      metric: "Ordenar por",
      metrics: { winrate: "Victorias", wins: "Ganadas", avg_net_worth_per_match: "Almas por partida" },
      cols: { rank: "#", badge: "Rango", player: "Jugador", matches: "G / jugadas", winRate: "Puntaje" },
      ratingTitle: (wr: string) => `Victorias crudas: ${wr}%. El puntaje es el porcentaje del que se puede estar seguro con las partidas que lo respaldan.`,
      howRanked:
        "Ordenados por el rango del juego. Entre los que comparten rango decide cuánto se sostiene " +
        "su porcentaje sobre las partidas que lo respaldan, para que una racha buena no le gane a " +
        "una temporada entera.",
      floor: (n: string) => `Jugadores con ${n}+ partidas clasificatorias`,
      thin: "Todavía no hay suficientes partidas clasificatorias para ordenar a nadie. El modo recién abrió esta temporada.",
      loading: "Cargando la escalera…",
      failed: "deadlock-api no responde, así que no hay nada que ordenar ahora.",
      worldTitle: "En el mundo",
      byHero: "Por héroe",
      rankedOnly: "Sólo partidas clasificatorias, desde que el modo abrió el 30 de julio de 2026.",
      noPodium: "Todavía nadie tiene suficientes partidas clasificatorias con este héroe.",
      wins: (n: string) => `${n} ganadas`,
      of: (n: string) => `de ${n}`,
    },
    bands: {
      "phantom-above": "Fantasma+",
      "archon-oracle": "Emisario/a / Oráculo",
      "ritualist-emissary": "Místico/a / Ritualista",
      "arcanist-below": "Centinela y abajo",
    },
    note: "Cada banda se mide con sus propias partidas, no con las de los rangos de arriba.",
    fallback: (shown: string) =>
      `Deadlock reinició todos los rangos el 30 de julio y la colocación llega hasta Oráculo 6, así que ` +
      `Fantasma+ todavía no tiene partidas clasificatorias. Se muestra ${shown} hasta que junte muestra; ` +
      `el cambio ocurre solo.`,
    emptyBand: "Todavía no hay partidas clasificatorias en este rango — se reiniciaron todos el 30 de julio.",
    loading: "Cargando los héroes de este rango…",
    stats: { winRate: "Victorias", pickRate: "Uso" },
    difficulty: { hard: "Difícil", easy: "Fácil" },
    momentum: { up: "Subiendo", down: "Bajando" },
    why: {
      skillGap: (points) =>
        `Gana ${points} puntos más en Fantasma+ que en Centinela y abajo. Un héroe que sube ` +
        "allá arriba tiene algo que aprender; uno que baja funciona hasta que el rival sabe.",
      trend: (points) => `Sus victorias se movieron ${points} puntos contra los 15 días anteriores.`,
    },
    thin: "Pocas partidas",
    thinWhy: "Muy pocas partidas en este rango para que el porcentaje sea estable.",
    sample: (matches, from, to) => `${matches} partidas · ${from} a ${to}`,
    patch: {
      heading: "Qué cambió el parche",
      since: (title) => `Medido desde ${title}`,
      winners: "Ganadores",
      losers: "Perdedores",
      winRate: "Victorias",
      pickRate: "Uso",
      none: "Todavía ningún héroe se movió lo suficiente como para llamarlo un cambio.",
      history: "Historial de parches",
      nameNote:
        "Valve nombra cada parche por la fecha de la build, que no es el día en que salió, así " +
        "que la lista va ordenada por cuándo lo recibieron los jugadores.",
      read: "Ver las notas",
      current: "Vigente",
    },
    footnote:
      "Deadlock es un juego de Valve y Vestigo no está afiliado con Valve. Los datos de " +
      "partidas salen del snapshot público de deadlock-api.com; todos los números de esta " +
      "página son nuestros.",
  },

  footer: {
    sources:
      "Datos de partidas de la API de Riot Games · Retratos, ítems y nombres de CommunityDragon",
    sourcesDeadlock:
      "Datos de partidas del snapshot público de deadlock-api.com · Arte de héroes y objetos de Valve",
    privacy: "Política de Privacidad",
    terms: "Términos del Servicio",
    englishOnly: "(en inglés)",
    disclaimer:
      "Vestigo no está avalado por Riot Games y no refleja las opiniones ni los puntos de vista " +
      "de Riot Games ni de nadie oficialmente involucrado en la producción o gestión de las " +
      "propiedades de Riot Games. Riot Games y todas sus propiedades asociadas son marcas " +
      "comerciales o marcas registradas de Riot Games, Inc.",
    disclaimerValve:
      "Vestigo tampoco está avalado por Valve Corporation. Deadlock, Dota 2 y todas sus " +
      "propiedades asociadas son marcas comerciales o marcas registradas de Valve Corporation.",
  },

  consent: {
    title: "Antes de que mires",
    body:
      "Nos gustaría usar Google Analytics para ver qué páginas se usan de verdad y saber qué " +
      "construir después. Instala cookies y le manda tu visita a Google. Si lo rechazas no se " +
      "carga nada — el sitio funciona exactamente igual de las dos formas.",
    accept: "Aceptar",
    decline: "Rechazar",
    more: "Leer la Política de Privacidad",
    settings: "Cookies",
    on: "Analítica: activada",
    off: "Analítica: desactivada",
  },

  // Los títulos en español no son traducciones literales: se escriben con las
  // palabras que la gente busca de verdad ("comps de TFT", "mejores objetos"),
  // que no siempre coinciden con las del inglés. Es también donde hay menos
  // competencia, así que vale la pena tratarlos como texto original.
  seo: {
    home: {
      title: () => "Vestigo — Mejora en los juegos que juegas",
      description: () =>
        "Vestigo lee tus partidas terminadas y las convierte en algo accionable para la " +
        "próxima: reportes del meta y análisis de tu propio historial.",
    },
    tft: {
      meta: {
        title: (set: string) => `Comps y Tier List del Set ${set} de TFT | Vestigo`,
        description: (set: string) =>
          `Las mejores comps del Set ${set} de Teamfight Tactics, ordenadas por posición ` +
          "promedio sobre miles de partidas de high elo, con sus unidades, ítems y nivel.",
      },
      metaBand: {
        title: (band: string, set: string) =>
          `Mejores comps de TFT en ${band} — Set ${set} | Vestigo`,
        description: (band: string, set: string) =>
          `Las comps que mejor funcionan en ${band} en el Set ${set} de Teamfight Tactics, ` +
          `medidas con partidas reales de ${band} y no heredadas de los rangos de arriba.`,
      },
      units: {
        title: (set: string) => `Unidades del Set ${set} de TFT: estadísticas | Vestigo`,
        description: (set: string) =>
          `Todos los campeones del Set ${set} de Teamfight Tactics por uso, posición ` +
          "promedio y los ítems que llevan de verdad, medidos sobre miles de tableros.",
      },
      items: {
        title: (set: string) => `Mejores ítems del Set ${set} de TFT | Vestigo`,
        description: (set: string) =>
          `Qué ítems del Set ${set} de Teamfight Tactics cambian dónde terminas, con qué ` +
          "componentes se arman y qué campeones los aprovechan mejor.",
      },
      ladder: {
        title: () => "Ladder de Challenger de TFT por región | Vestigo",
        description: () =>
          "Los mejores jugadores de Teamfight Tactics por región, con LP, victorias y " +
          "derrotas, directo del ladder de Riot.",
      },
      player: {
        title: () => "Historial y análisis de partidas de TFT | Vestigo",
        description: () =>
          "Busca cualquier Riot ID y lee la partida de vuelta: dónde terminaste, qué " +
          "jugaste y qué costumbres de tu historial te salen más caras.",
      },
    },
    deadlock: {
      meta: {
        title: () => "Tier list de héroes de Deadlock y porcentajes de victoria | Vestigo",
        description: () =>
          "Qué héroes de Deadlock están ganando de verdad, por rango. Victorias, uso y cuánto " +
          "premia cada héroe saber jugarlo, medido sobre partidas reales.",
      },
      items: {
        title: () => "Tier list de objetos de Deadlock — los mejores por precio | Vestigo",
        description: () =>
          "Qué objetos de Deadlock valen de verdad sus almas. Cada uno medido contra lo que " +
          "rinde su propio precio, para que uno de 6400 no parezca bueno sólo por ser tardío.",
      },
      ranks: {
        title: () => "Distribución de rangos de Deadlock — jugadores por rango | Vestigo",
        description: () =>
          "Cuánta gente hay en cada rango de Deadlock, y cómo se reconstruye la escalera día a " +
          "día desde el reinicio de la Temporada 1.",
      },
      ladder: {
        title: () => "Escalera de jugadores de Deadlock — los mejores por héroe | Vestigo",
        description: () =>
          "Los mejores jugadores de Deadlock con cada héroe y en cada rango, con las partidas " +
          "detrás de cada porcentaje para que una cuenta nueva no pase por veterana.",
      },
      player: {
        title: () => "Historial de partidas e informe post-partida de Deadlock | Vestigo",
        description: () =>
          "Busca tus partidas de Deadlock y mira qué te costó cada una: los objetos que no " +
          "compraste, los que compraste tarde y los que no mejoraste, contra los que ganaron " +
          "desde la misma situación.",
      },
      match: {
        title: () => "Informe de partida de Deadlock | Vestigo",
        description: () =>
          "Una partida de Deadlock, jugador por jugador: una nota para los doce y qué le " +
          "costaron las compras al que elijas, medido contra los que ganaron desde la misma situación.",
      },
      patches: {
        title: () => "Ganadores y perdedores del parche de Deadlock | Vestigo",
        description: () =>
          "Todos los héroes de Deadlock que movió el último parche, medidos contra el mismo " +
          "tramo de juego justo anterior.",
      },
      detail: {
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — estadísticas de Deadlock | Vestigo`
            : `${name} — build y counters de Deadlock | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `Cómo rinde ${name} en Deadlock: victorias contra su propio precio, uso, y los ` +
              "héroes que mejor lo llevan."
            : `Cómo jugar ${name} en Deadlock: victorias, uso, el orden de compra recomendado ` +
              "y los enfrentamientos que lo cambian.",
      },
    },
    privacy: {
      title: () => "Política de Privacidad | Vestigo",
      description: () => "Qué recolecta Vestigo, por qué, y qué nunca toca.",
    },
    terms: {
      title: () => "Términos del Servicio | Vestigo",
      description: () => "Las reglas para usar Vestigo y los límites de lo que promete.",
    },
    detail: {
      title: (name: string, section: string, set: string) =>
        section === "meta"
          ? `${name} — guía de comp del Set ${set} de TFT | Vestigo`
          : `${name} — estadísticas del Set ${set} de TFT | Vestigo`,
      description: (name: string, section: string, set: string) =>
        section === "units"
          ? `Cómo rinde ${name} en el Set ${set} de Teamfight Tactics: uso, posición ` +
            "promedio, qué nivel de estrellas conviene y los ítems que lleva."
          : section === "items"
            ? `Qué hace ${name} en el Set ${set} de Teamfight Tactics, con qué se arma y ` +
              "qué campeones terminan mejor llevándolo."
            : `Cómo jugar ${name} en el Set ${set} de Teamfight Tactics: las unidades, los ` +
              "ítems, hasta qué nivel subir y con qué frecuencia gana.",
    },
  },
};

export const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

export const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

export const useLang = () => useContext(LangContext);
export const useCopy = () => COPY[useLang().lang];
/** Dates and thousands separators follow the language, not the machine. */
export const useLocale = () => (useLang().lang === "es" ? "es-AR" : "en-US");
