/**
 * Los textos de la pestaña Habilidades y libros de Project Zomboid (2026-09-30), en inglés y español con voseo: la lista
 * (`/habilidades`), la ficha de cada habilidad y su calculadora. Van en un módulo propio y no en `zomboidCopy.ts`, como
 * los de Rasgos y Moodles; el `<head>` sí sigue allá (`seo.skills` y `seo.detail.skills`): lo escribe el prerender sin
 * bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres de las habilidades, de sus categorías, de los libros, las revistas, los VHS,
 * los canales de TV, los rasgos y las profesiones salen de los datos, con la traducción oficial (el nombre del canal, el
 * juego no lo traduce).
 */
import { useLang } from "../../i18n";

export interface PzSkillsCopy {
  title: string;
  intro: (n: string, books: string, version: string) => string[];
  hand: string;
  search: string;
  searchHint: string;
  showing: (shown: string, total: string) => string;
  empty: string;
  /** "De 0 a 10: 32.775 XP", en cada fila de la lista y en la cabecera de la ficha. */
  zeroToTen: (xp: string) => string;
  /** Fuerza y Estado físico: "arranca en 5". */
  startsAt: (n: number) => string;
  bookCount: (n: number) => string;
  notFound: string;
  back: string;
  kicker: (version: string) => string;
  otherName: (name: string) => string;

  xpTitle: string;
  colLevel: string;
  colXp: string;
  colTotal: string;
  colBook: string;

  booksTitle: string;
  booksNote: string;
  noBooks: string;
  levels: (from: number, to: number) => string;
  readFrom: (n: number) => string;

  magazinesTitle: string;
  magazinesNote: string;
  more: (n: number) => string;

  mediaTitle: string;
  mediaNote: (cutoff: number) => string;
  mediaXp: (xp: string) => string;
  mediaUpTo: (xp: string) => string;

  tvTitle: string;
  /** "Día 2 · 12:00–18:00": cuándo sale una emisión. */
  tvWhen: (day: number, from: string, to: string) => string;
  /** El programa del día 1 que termina antes de la hora de arranque por defecto (9:00); se ve si se arranca antes. */
  tvBeforeStart: (time: string) => string;
  tvTotal: string;
  tvNote: (cutoff: number) => string;

  whoTitle: string;
  whoStart: string;
  whoMult: string;
  whoNone: string;

  calc: {
    title: string;
    hand: string;
    from: string;
    to: string;
    boost: string;
    boostHint: string;
    boostOption: (n: number, mult: string) => string;
    traits: string;
    books: string;
    bar: (xp: string, from: number, to: number) => string;
    earn: (xp: string) => string;
    multNote: (mult: string) => string;
    withoutBooks: (xp: string) => string;
    colLevels: string;
    colRead: string;
    colBar: string;
    colEarn: string;
    noBook: string;
    readHint: string;
    serverNote: string;
  };
}

const EN: PzSkillsCopy = {
  title: "Project Zomboid Skills and Skill Books",
  intro: (n, books, v) => [
    `The ${n} skills in Project Zomboid Build ${v}, with the XP each level asks for, the ${books} skill books and the level range each one boosts, the magazines with recipes for that skill, and the VHS tapes and TV shows that give XP.`,
    "Each skill has a calculator: from one level to another, with or without books and with your starting bonus, how much XP you need and what to read at each step.",
  ],
  hand: "pick a skill",
  search: "Search a skill",
  searchHint: "carpentry, cocina, aiming…",
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  empty: "No skill by that name. Try it in Spanish.",
  zeroToTen: (xp) => `0 to 10: ${xp} XP`,
  startsAt: (n) => `starts at ${n}`,
  bookCount: (n) => (n === 1 ? "1 book" : `${n} books`),
  notFound: "We couldn't find that skill. Look for it in the list.",
  back: "All skills",
  kicker: (v) => `Skill · Build ${v}`,
  otherName: (name) => `in Spanish: ${name}`,

  xpTitle: "XP per level",
  colLevel: "Level",
  colXp: "XP",
  colTotal: "Total",
  colBook: "Book",

  booksTitle: "Skill books",
  booksNote: "Read it whole and it multiplies all the XP you earn until you reach the last level of its range.",
  noBooks: "This skill has no books.",
  levels: (from, to) => `levels ${from}–${to}`,
  readFrom: (n) => `readable from level ${n}`,

  magazinesTitle: "Magazines",
  magazinesNote: "They teach recipes that use the skill. They don't give XP.",
  more: (n) => `and ${n} more`,

  mediaTitle: "VHS tapes that give XP",
  mediaNote: (cutoff) =>
    `Base XP, before multipliers, and only while the skill is below level ${cutoff}. Each line of a tape counts once; "up to" means part of the tape is also on another one.`,
  mediaXp: (xp) => `+${xp} XP`,
  mediaUpTo: (xp) => `up to ${xp} XP`,

  tvTitle: "TV shows that give XP",
  tvWhen: (day, from, to) => `Day ${day} · ${from}–${to}`,
  tvBeforeStart: (time) => `(ends before ${time}, the default start time; not in the total)`,
  tvTotal: "In total",
  tvNote: (cutoff) =>
    `Each show airs once, on that day of your game (day 1 is the day you start) and in that time slot: tune in within it and it plays from the start. Base XP, before multipliers, and only while the skill is below level ${cutoff}.`,

  whoTitle: "Traits and professions",
  whoStart: "Starting levels",
  whoMult: "XP multiplier",
  whoNone: "No trait or profession changes this skill.",

  calc: {
    title: "XP calculator",
    hand: "how much is left?",
    from: "From level",
    to: "To level",
    boost: "Starting bonus",
    boostHint: "The level your character started with in this skill, from profession and traits.",
    boostOption: (n, mult) => (n === 0 ? `None: ×${mult}` : n >= 3 ? `3 or more: ×${mult}` : `${n}: ×${mult}`),
    traits: "Traits",
    books: "Reading the books",
    bar: (xp, from, to) => `The bar asks for ${xp} XP from level ${from} to ${to}.`,
    earn: (xp) => `${xp} XP`,
    multNote: (mult) => `to earn doing things (the XP each recipe shows), with your ×${mult}`,
    withoutBooks: (xp) => `Without books: ${xp} XP.`,
    colLevels: "Levels",
    colRead: "What to read",
    colBar: "Bar",
    colEarn: "To earn",
    noBook: "no book",
    readHint: "Each book can be read from one level before its range. Half-read gives part of the multiplier, and only one book counts at a time.",
    serverNote: "With the server's XP multiplier at 1, the default.",
  },
};

const ES: PzSkillsCopy = {
  title: "Habilidades y libros de Project Zomboid",
  intro: (n, books, v) => [
    `Las ${n} habilidades de Project Zomboid Build ${v}, con la XP que pide cada nivel, los ${books} libros de habilidad y el tramo que multiplica cada uno, las revistas con recetas de esa habilidad y los VHS y programas de TV que dan XP.`,
    "Cada habilidad tiene su calculadora: de un nivel a otro, con o sin libros y con tu bonificación de inicio, cuánta XP te hace falta y qué leer en cada tramo.",
  ],
  hand: "elegí una habilidad",
  search: "Buscar una habilidad",
  searchHint: "carpintería, cooking, puntería…",
  showing: (shown, total) => `Mostrando ${shown} de ${total}`,
  empty: "Ninguna habilidad con ese nombre. Probá en inglés.",
  zeroToTen: (xp) => `De 0 a 10: ${xp} XP`,
  startsAt: (n) => `arranca en ${n}`,
  bookCount: (n) => (n === 1 ? "1 libro" : `${n} libros`),
  notFound: "No encontramos esa habilidad. Buscala en la lista.",
  back: "Todas las habilidades",
  kicker: (v) => `Habilidad · Build ${v}`,
  otherName: (name) => `en inglés: ${name}`,

  xpTitle: "XP por nivel",
  colLevel: "Nivel",
  colXp: "XP",
  colTotal: "Total",
  colBook: "Libro",

  booksTitle: "Libros de habilidad",
  booksNote: "Leído entero, multiplica toda la XP que ganes hasta llegar al último nivel de su tramo.",
  noBooks: "Esta habilidad no tiene libros.",
  levels: (from, to) => `niveles ${from}–${to}`,
  readFrom: (n) => `se lee desde el nivel ${n}`,

  magazinesTitle: "Revistas",
  magazinesNote: "Enseñan recetas que usan la habilidad. No dan XP.",
  more: (n) => `y ${n} más`,

  mediaTitle: "VHS que dan XP",
  mediaNote: (cutoff) =>
    `XP base, antes de multiplicadores, y sólo mientras la habilidad esté por debajo del nivel ${cutoff}. Cada línea de una cinta cuenta una sola vez; "hasta" es que parte de la cinta también está en otra.`,
  mediaXp: (xp) => `+${xp} XP`,
  mediaUpTo: (xp) => `hasta ${xp} XP`,

  tvTitle: "Programas de TV que dan XP",
  tvWhen: (day, from, to) => `Día ${day} · ${from}–${to}`,
  tvBeforeStart: (time) => `(termina antes de las ${time}, la hora de arranque por defecto; no suma al total)`,
  tvTotal: "En total",
  tvNote: (cutoff) =>
    `Cada programa sale una sola vez, ese día de la partida (el 1 es el día en que arrancás) y en ese horario: si ponés el canal dentro del horario, lo ves desde el principio. XP base, antes de multiplicadores, y sólo mientras la habilidad esté por debajo del nivel ${cutoff}.`,

  whoTitle: "Rasgos y profesiones",
  whoStart: "Niveles de inicio",
  whoMult: "Multiplican la XP",
  whoNone: "Ningún rasgo ni profesión cambia esta habilidad.",

  calc: {
    title: "Calculadora de XP",
    hand: "¿cuánto te falta?",
    from: "De nivel",
    to: "A nivel",
    boost: "Bonificación de inicio",
    boostHint: "El nivel con que arrancó tu personaje en esta habilidad, por profesión y rasgos.",
    boostOption: (n, mult) => (n === 0 ? `Ninguna: ×${mult}` : n >= 3 ? `3 o más: ×${mult}` : `${n}: ×${mult}`),
    traits: "Rasgos",
    books: "Leyendo los libros",
    bar: (xp, from, to) => `La barra pide ${xp} XP del nivel ${from} al ${to}.`,
    earn: (xp) => `${xp} XP`,
    multNote: (mult) => `a ganar haciendo cosas (la XP que dice cada receta), con tu ×${mult}`,
    withoutBooks: (xp) => `Sin libros: ${xp} XP.`,
    colLevels: "Niveles",
    colRead: "Qué leer",
    colBar: "Barra",
    colEarn: "A ganar",
    noBook: "sin libro",
    readHint: "Cada libro se puede leer desde un nivel antes de su tramo. Leído a medias da una parte del multiplicador, y vale uno solo a la vez.",
    serverNote: "Con el multiplicador de XP del servidor en 1, el de siempre.",
  },
};

export const SKILLS_COPY: Record<"en" | "es", PzSkillsCopy> = { en: EN, es: ES };
export const useSkillsCopy = (): PzSkillsCopy => SKILLS_COPY[useLang().lang];
