/**
 * La copia de TFT, en los dos idiomas (2026-09-25).
 *
 * TFT no se sirve desde el 2026-09-15 (ver `route.ts`), pero su copia seguía en
 * `i18n.ts` y viajaba en el JS de entrada de todas las páginas. Queda acá, con
 * las vistas de TFT que la usan, por si el juego vuelve. Las vistas de TFT
 * importan `useCopy` de acá: da la copia del sitio con estas secciones adentro.
 */
import { COPY, useLang, type Lang } from "./i18n";

const EN = {
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
};

const ES: typeof EN = {
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
};

export const TFT_COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

/** La copia del sitio con la de este módulo adentro, un objeto por idioma. */
const WITH: Record<Lang, (typeof COPY)[Lang] & typeof EN> = {
  en: { ...COPY.en, ...EN },
  es: { ...COPY.es, ...ES },
};

export const copyFor = (lang: Lang) => WITH[lang];
export const useCopy = () => WITH[useLang().lang];
