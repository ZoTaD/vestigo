/**
 * Los títulos y descripciones de cada página, en los dos idiomas (2026-09-25).
 *
 * Los usan el prerender (en el build) y `PageMeta` (al navegar, un chunk
 * aparte): nada de esto hace falta para pintar la página, así que salió de
 * `i18n.ts` y del JS de entrada.
 */
import { COPY, useLang, type Lang } from "./i18n";

const EN = {
  /**
   * What search engines and link previews show.
   *
   * Titles use the words people actually search with — "deadlock item tier
   * list", "poe2 currency prices" — which is the phrase we can realistically
   * rank for against sites with years of authority.
   *
   * Kept near 60 characters: past that Google truncates the title in results.
   */
  seo: {
    poe2: {
      economy: {
        title: () => "Path of Exile 2 economy: currency and unique prices | Vestigo",
        description: () =>
          "Divine, chaos and exalted orb rates, and the price of every currency item and unique " +
          "this league — with what is rising, falling and trading most this week.",
      },
      encyclopedia: {
        title: () => "Path of Exile 2 encyclopedia: gems, uniques, bases and currency | Vestigo",
        description: () =>
          "Every skill and support gem, unique, base type and currency item in Path of Exile 2, " +
          "with the game's own art and tooltips and the stats of each gem at every level.",
      },
      patches: {
        title: () => "Path of Exile 2 patch notes, patch by patch | Vestigo",
        description: () =>
          "Every Path of Exile 2 patch, sorted into buffs, nerfs, fixes and new content, with the " +
          "gems and uniques it touches shown as in the game.",
      },
      tree: {
        title: () => "Path of Exile 2 passive tree planner, level by level | Vestigo",
        description: () =>
          "Plan your Path of Exile 2 passive tree point by point with the official tree and art: see it " +
          "at every level, add your gems and export the .build file for the in-game Build Planner.",
      },
      regex: {
        title: () => "Path of Exile 2 regex generator for waystones, tablets and vendors | Vestigo",
        description: () =>
          "Build the in-game search regex for waystones, tablets, gear, vendors and relics, with minimum values, " +
          "for the game in English or Spanish. Copy it and paste it into the stash or vendor search.",
      },
      /** Las páginas con detalle: una liga, una categoría, una ficha, una edición. */
      detail: {
        league: (name: string) => ({
          title: `Path of Exile 2 economy in ${name}: currency and unique prices | Vestigo`,
          description: `What every currency item and unique is worth in the ${name} league of Path of Exile 2, and what is rising, falling and trading most this week.`,
        }),
        cat: (cat: string) =>
          ({
            gems: { title: "Path of Exile 2 gems: every skill, support and spirit gem | Vestigo", description: "Every skill, support and spirit gem in Path of Exile 2 with the game's own tooltip and its stats at every level." },
            uniques: { title: "Path of Exile 2 uniques: every unique item and its mods | Vestigo", description: "Every unique item in Path of Exile 2 with its modifiers, base type and what it sells for this league." },
            bases: { title: "Path of Exile 2 base types: weapons, armour and jewellery | Vestigo", description: "Every weapon, armour, jewellery and flask base in Path of Exile 2 with its properties, requirements and implicits." },
            currency: { title: "Path of Exile 2 currency: orbs, runes, soul cores and omens | Vestigo", description: "Every currency item in Path of Exile 2 — orbs, runes, soul cores, omens and more — with what it does." },
          })[cat] ?? { title: "Path of Exile 2 encyclopedia | Vestigo", description: "" },
        entry: (name: string, cat: string) => {
          const kind = ({ gems: "gem", uniques: "unique", bases: "base type", currency: "currency" } as Record<string, string>)[cat] ?? "item";
          const extra = ({ gems: "its stats at every level", uniques: "its modifiers and price", bases: "its properties and the uniques built on it", currency: "what it does" } as Record<string, string>)[cat] ?? "";
          return {
            title: `${name} — Path of Exile 2 ${kind} | Vestigo`,
            description: `${name} in Path of Exile 2: the in-game tooltip, ${extra}, and every patch that changed it.`,
          };
        },
        edition: (version: string) => ({
          title: `Path of Exile 2 ${version} patch notes | Vestigo`,
          description: `Every change in Path of Exile 2 patch ${version}: buffs, nerfs, fixes and new content, with each gem and unique shown as in the game.`,
        }),
      },
    },
    home: {
      title: () => "Vestigo — Tier lists, builds and data for the games you play",
      description: () =>
        "Tier lists, builds, guides and tools built from each game's own data: " +
        "Deadlock, Path of Exile 2 and Valheim.",
    },
    deadlock: {
      heroes: {
        title: () => "Deadlock Heroes Compared — Health, Weapon and Stats | Vestigo",
        description: () =>
          "All Deadlock heroes side by side with the game's own numbers: health, speed, weapon " +
          "DPS, clip, reload and what each boon adds. Sort by any column.",
      },
      "street-brawl": {
        title: () => "Deadlock Street Brawl Tier List and Win Rates | Vestigo",
        description: () =>
          "Which Deadlock heroes win Street Brawl, the 4v4 mode. Win rate and pick rate measured " +
          "on real Street Brawl matches, with who moved since the patch.",
      },
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
      builder: {
        title: () => "Deadlock Build Maker — Plan Your Items | Vestigo",
        description: () =>
          "Build a Deadlock item build in a copy of the game's shop: souls, investment bonus, upgrades, " +
          "and how close it is to the builds that win. Share it with a link.",
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
        title: () => "Deadlock Patch Notes, Nerfs and Buffs | Vestigo News",
        description: () =>
          "Every change in the latest Deadlock patch at a glance: which heroes and items were " +
          "nerfed or buffed, ability by ability, and what the numbers say since it landed.",
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
        /**
         * "Counters" salió del título el 2026-09-18: la página no los tiene
         * todavía, y prometer en el título lo que la página no da es la clase
         * de clic que se va a los tres segundos. Volvió el 2026-09-22 sólo a
         * la ficha de Héroes, que ya muestra contra quién pierde cada uno.
         */
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — Deadlock Item Stats | Vestigo`
            : dlSection === "patches"
              ? `Deadlock ${name}: Every Nerf, Buff and Change | Vestigo News`
              : dlSection === "heroes"
                ? `${name} — Deadlock Counters, Abilities and Stats | Vestigo`
                : `${name} — Deadlock Build & Win Rate | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "patches"
            ? `Every hero and item change in Deadlock's ${name}, ability by ability and marked as ` +
              "nerf or buff, with the official notes and what the numbers say since it landed."
            : dlSection === "heroes"
            ? `${name} in Deadlock: every ability with the game's numbers and clips, base stats, ` +
              "the heroes that counter them, the ones they beat, and who they pair best with."
            : dlSection === "items"
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
  },
};

const ES: typeof EN = {
  // Los títulos en español no son traducciones literales: se escriben con las
  // palabras que la gente busca de verdad ("mejores objetos", "tier list"),
  // que no siempre coinciden con las del inglés. Es también donde hay menos
  // competencia, así que vale la pena tratarlos como texto original.
  seo: {
    poe2: {
      economy: {
        title: () => "Economía de Path of Exile 2: precios de orbes y únicos | Vestigo",
        description: () =>
          "Cuánto vale el divino en caos y exaltados, y el precio de cada moneda y cada único de " +
          "la liga, con lo que más sube, baja y se comercia esta semana.",
      },
      encyclopedia: {
        title: () => "Enciclopedia de Path of Exile 2: gemas, únicos, bases y monedas | Vestigo",
        description: () =>
          "Todas las gemas de habilidad y de apoyo, los únicos, las bases y las monedas de Path of " +
          "Exile 2, con el arte y los textos oficiales del juego en español y cada gema nivel por nivel.",
      },
      patches: {
        title: () => "Notas de parche de Path of Exile 2, parche por parche | Vestigo",
        description: () =>
          "Cada parche de Path of Exile 2 ordenado en mejoras, nerfeos, arreglos y contenido nuevo, " +
          "con las gemas y los únicos que toca tal como se ven en el juego.",
      },
      tree: {
        title: () => "Árbol de pasivas de Path of Exile 2: planificador nivel por nivel | Vestigo",
        description: () =>
          "Armá tu árbol de pasivas de Path of Exile 2 punto por punto con el árbol y el arte oficiales, " +
          "en español: miralo en cada nivel, sumá tus gemas y exportá el .build para el Build Planner del juego.",
      },
      regex: {
        title: () => "Generador de regex de Path of Exile 2 en español: piedras guía, tablillas y vendedores | Vestigo",
        description: () =>
          "Armá el regex de la búsqueda del juego para piedras guía, tablillas, equipo, vendedores y reliquias, con " +
          "valores mínimos, para el juego en español o en inglés. Copialo y pegalo en el alijo o en el vendedor.",
      },
      detail: {
        league: (name: string) => ({
          title: `Economía de Path of Exile 2 en ${name}: orbes y únicos | Vestigo`,
          description: `Cuánto vale cada moneda y cada único en la liga ${name} de Path of Exile 2, y lo que más sube, baja y se comercia esta semana.`,
        }),
        cat: (cat: string) =>
          ({
            gems: { title: "Gemas de Path of Exile 2: habilidad, apoyo y espíritu | Vestigo", description: "Todas las gemas de habilidad, de apoyo y de espíritu de Path of Exile 2, con el tooltip oficial en español y sus números en cada nivel." },
            uniques: { title: "Únicos de Path of Exile 2: todos, con sus modificadores | Vestigo", description: "Todos los objetos únicos de Path of Exile 2 con sus modificadores en español, su base y lo que valen esta liga." },
            bases: { title: "Bases de Path of Exile 2: armas, armaduras y joyería | Vestigo", description: "Todas las bases de armas, armaduras, joyería y frascos de Path of Exile 2 con sus propiedades, requisitos e implícitos." },
            currency: { title: "Monedas de Path of Exile 2: orbes, runas, núcleos y presagios | Vestigo", description: "Todas las monedas de Path of Exile 2 —orbes, runas, núcleos de alma, presagios y más— con lo que hace cada una." },
          })[cat] ?? { title: "Enciclopedia de Path of Exile 2 | Vestigo", description: "" },
        entry: (name: string, cat: string) => {
          const kind = ({ gems: "gema", uniques: "único", bases: "base", currency: "moneda" } as Record<string, string>)[cat] ?? "objeto";
          const extra = ({ gems: "sus números en cada nivel", uniques: "sus modificadores y su precio", bases: "sus propiedades y los únicos que la usan", currency: "lo que hace" } as Record<string, string>)[cat] ?? "";
          return {
            title: `${name} — ${kind} de Path of Exile 2 | Vestigo`,
            description: `${name} en Path of Exile 2: el tooltip oficial en español, ${extra} y cada parche que lo cambió.`,
          };
        },
        edition: (version: string) => ({
          title: `Notas del parche ${version} de Path of Exile 2 | Vestigo`,
          description: `Todos los cambios del parche ${version} de Path of Exile 2: mejoras, nerfeos, arreglos y lo nuevo, con cada gema y único como en el juego.`,
        }),
      },
    },
    home: {
      title: () => "Vestigo — Tier lists, builds y datos de tus juegos",
      description: () =>
        "Tier lists, builds, guías y herramientas hechas con los datos de cada juego: " +
        "Deadlock, Path of Exile 2 y Valheim.",
    },
    deadlock: {
      heroes: {
        title: () => "Héroes de Deadlock comparados — vida, arma y atributos | Vestigo",
        description: () =>
          "Todos los héroes de Deadlock lado a lado con los números del juego: vida, velocidad, " +
          "DPS del arma, cargador, recarga y lo que suma cada bendición. Ordena por cualquier columna.",
      },
      "street-brawl": {
        title: () => "Tier list de pelea callejera (Street Brawl) de Deadlock | Vestigo",
        description: () =>
          "Qué héroes de Deadlock ganan en la pelea callejera, el modo 4 contra 4. Victorias y uso " +
          "medidos sobre partidas reales de Street Brawl, con quién se movió desde el parche.",
      },
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
      builder: {
        title: () => "Armador de builds de Deadlock — planeá tus objetos | Vestigo",
        description: () =>
          "Armá una build de Deadlock en una copia de la tienda del juego: almas, bonificación de inversión, " +
          "mejoras y cuánto se parece a las builds que ganan. Compartila con un link.",
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
        title: () => "Notas del parche de Deadlock: nerfs y buffs | Vestigo News",
        description: () =>
          "Todos los cambios del último parche de Deadlock de un vistazo: qué héroes y objetos " +
          "se nerfearon o buffearon, habilidad por habilidad, y qué dicen los números desde que salió.",
      },
      detail: {
        title: (name: string, dlSection: string) =>
          dlSection === "items"
            ? `${name} — estadísticas de Deadlock | Vestigo`
            : dlSection === "patches"
              ? `Deadlock ${name}: todos los nerfs, buffs y cambios | Vestigo News`
              : dlSection === "heroes"
                ? `${name} — counters, habilidades y atributos de Deadlock | Vestigo`
                : `${name} — build y winrate de Deadlock | Vestigo`,
        description: (name: string, dlSection: string) =>
          dlSection === "patches"
            ? `Todos los cambios de héroes y objetos del ${name} de Deadlock, habilidad por habilidad ` +
              "y marcados como nerf o buff, con las notas oficiales y qué dicen los números desde que salió."
            : dlSection === "heroes"
            ? `${name} en Deadlock: cada habilidad con los números y clips del juego, atributos ` +
              "base, sus counters, a quién le gana y con quién combina mejor."
            : dlSection === "items"
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
  },
};

export const SEO_COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

/** La copia del sitio con la de este módulo adentro, un objeto por idioma. */
const WITH: Record<Lang, (typeof COPY)[Lang] & typeof EN> = {
  en: { ...COPY.en, ...EN },
  es: { ...COPY.es, ...ES },
};

export const copyFor = (lang: Lang) => WITH[lang];
export const useCopy = () => WITH[useLang().lang];
