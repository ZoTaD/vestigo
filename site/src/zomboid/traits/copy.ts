/**
 * Los textos de la pestaña Rasgos de Project Zomboid (2026-09-30), en inglés y español con voseo: la lista de rasgos y
 * profesiones (`/rasgos`), la de profesiones (`/profesiones`) y las dos fichas. Van en un módulo propio y no en
 * `zomboidCopy.ts` para que las pestañas de esta tanda no se pisen (ver el plan). El `<head>` sí sigue allá
 * (`seo.traits`, `seo.professions` y `seo.detail`): lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres y las descripciones de los rasgos y las profesiones salen de los datos, con la
 * traducción oficial.
 *
 * Los puntos van como los muestra el juego al crear el personaje: lo que le hacen a tus puntos para gastar. Un rasgo
 * positivo de costo 4 es "−4" (te los saca) y uno negativo de costo −4 es "+4" (te los da); `getRightLabel()` de
 * `CharacterTraitDefinition` hace esa cuenta. Una profesión de costo 8 (Desempleado) te da 8: "+8".
 */
import { useLang } from "../../i18n";

/** Positivos (cuestan puntos), negativos (dan puntos) y los que no se eligen al crear el personaje. */
export type TraitGroup = "positive" | "negative" | "granted";

export interface PzTraitsCopy {
  traitsTitle: string;
  traitsIntro: (profs: string, pos: string, neg: string, granted: string, version: string) => string[];
  profsTitle: string;
  profsIntro: (profs: string, version: string) => string[];
  /** El enlace de `/profesiones` a la lista con los rasgos. */
  toTraits: string;
  hand: string;
  search: string;
  searchHint: string;
  showing: (shown: string, total: string) => string;
  empty: string;
  groups: Record<TraitGroup | "professions", string>;
  /** La nota a lápiz junto al título de cada hoja de la lista. */
  groupNotes: Partial<Record<TraitGroup | "professions", string>>;
  noBoosts: string;
  notFoundTrait: string;
  notFoundProf: string;
  backTraits: string;
  backProfs: string;
  otherName: (name: string) => string;
  kinds: Record<TraitGroup, string>;
  profession: string;
  /** Lo que un rasgo hace con tus puntos, en palabras (el número va al lado). */
  traitPrice: (group: TraitGroup, n: number) => string;
  /** Lo mismo para una profesión: cuántos puntos te deja para rasgos. */
  profPrice: (n: number) => string;
  profOnly: string;
  /**
   * El renglón que une a los rasgos gemelos (el que se elige y el de profesión, con el mismo nombre en el juego): el
   * texto va antes del enlace al otro, y `twinMark` sigue al nombre del de profesión para que el enlace no diga
   * exactamente lo mismo que el título de la página.
   */
  twin: { toProf: string; toPick: string };
  twinMark: string;
  traitSheets: { boosts: string; recipes: string; exclusive: string; professions: string; traits: string; grants: string };
  profSheets: { boosts: string; traits: string; recipes: string; towns: string };
  more: (n: number) => string;
  /** Los enlaces al Planificador de personaje: desde una profesión y desde un rasgo que se elige. */
  plannerBtn: string;
  tryPlanner: string;
}

const pts = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const EN: PzTraitsCopy = {
  traitsTitle: "Project Zomboid Traits and Professions",
  traitsIntro: (profs, pos, neg, granted, v) => [
    `Every trait and profession in Project Zomboid Build ${v}: ${profs} professions, ${pos} positive traits, ${neg} negative ones and ${granted} you can't pick when you create your character.`,
    "Positive traits cost points (−) and negative ones give you points (+); your profession decides how many you start with. Each page has what the trait does, the skills it raises, the recipes it gives and what it can't be combined with.",
  ],
  profsTitle: "Project Zomboid Professions",
  profsIntro: (profs, v) => [
    `The ${profs} professions in Project Zomboid Build ${v}, with the points each one gives or takes, the skills it starts with, its free traits and the recipes it already knows.`,
    "The profession is the first thing you pick: it decides how many points you have left for traits.",
  ],
  toTraits: "All traits, positive and negative →",
  hand: "search in English or Spanish",
  search: "Search a trait or a profession",
  searchHint: "brave, ladrón, burglar…",
  showing: (shown, total) => `Showing ${shown} of ${total}`,
  empty: "Nothing by that name. Try it in Spanish.",
  groups: {
    professions: "Professions",
    positive: "Positive traits",
    negative: "Negative traits",
    granted: "Not picked at creation",
  },
  groupNotes: { professions: "the points you start with", positive: "they cost points", negative: "they give you points" },
  noBoosts: "No skill bonuses",
  notFoundTrait: "We couldn't find that trait. Look for it in the list.",
  notFoundProf: "We couldn't find that profession. Look for it in the list.",
  backTraits: "All traits",
  backProfs: "All professions",
  otherName: (name) => `in Spanish: ${name}`,
  kinds: { positive: "Positive trait", negative: "Negative trait", granted: "Trait" },
  profession: "Profession",
  traitPrice: (group, n) =>
    group === "positive" ? `Costs ${pts(n, "point", "points")}` : group === "negative" ? `Gives you ${pts(n, "point", "points")}` : "Not picked at creation",
  profPrice: (n) => (n > 0 ? `Gives you ${pts(n, "point", "points")} for traits` : n < 0 ? `Costs ${pts(-n, "point", "points")}` : "Doesn't change your points"),
  profOnly: "profession only",
  twin: { toProf: "A profession also brings it, as a separate trait:", toPick: "There's also one you pick when you create your character:" },
  twinMark: "profession",
  traitSheets: {
    boosts: "Skills it raises",
    recipes: "Recipes it gives",
    exclusive: "Can't be combined with",
    professions: "Professions that bring it",
    traits: "Traits that bring it",
    grants: "Brings with it",
  },
  profSheets: { boosts: "Starting skills", traits: "Free traits", recipes: "Recipes it already knows", towns: "Where it can start" },
  more: (n) => `and ${n} more`,
  plannerBtn: "Build a character with this profession",
  tryPlanner: "Try it in the character planner",
};

const ES: PzTraitsCopy = {
  traitsTitle: "Rasgos y profesiones de Project Zomboid",
  traitsIntro: (profs, pos, neg, granted, v) => [
    `Todos los rasgos y profesiones de Project Zomboid Build ${v}: ${profs} profesiones, ${pos} rasgos positivos, ${neg} negativos y ${granted} que no se eligen al crear el personaje.`,
    "Los rasgos positivos cuestan puntos (−) y los negativos te dan puntos (+); la profesión decide con cuántos arrancás. Cada ficha tiene qué hace el rasgo, las habilidades que sube, las recetas que da y con qué no se combina.",
  ],
  profsTitle: "Profesiones de Project Zomboid",
  profsIntro: (profs, v) => [
    `Las ${profs} profesiones de Project Zomboid Build ${v}, con los puntos que da o quita cada una, las habilidades con las que arranca, sus rasgos gratis y las recetas que ya sabe.`,
    "La profesión es lo primero que elegís: de ella depende cuántos puntos te quedan para los rasgos.",
  ],
  toTraits: "Todos los rasgos, positivos y negativos →",
  hand: "buscá en español o en inglés",
  search: "Buscar un rasgo o una profesión",
  searchHint: "valiente, burglar, ladrón…",
  showing: (shown, total) => `Mostrando ${shown} de ${total}`,
  empty: "Nada con ese nombre. Probá en inglés.",
  groups: {
    professions: "Profesiones",
    positive: "Rasgos positivos",
    negative: "Rasgos negativos",
    granted: "No se eligen al crear el personaje",
  },
  groupNotes: { professions: "los puntos con los que arrancás", positive: "cuestan puntos", negative: "te dan puntos" },
  noBoosts: "Sin habilidades de más",
  notFoundTrait: "No encontramos ese rasgo. Buscalo en la lista.",
  notFoundProf: "No encontramos esa profesión. Buscala en la lista.",
  backTraits: "Todos los rasgos",
  backProfs: "Todas las profesiones",
  otherName: (name) => `en inglés: ${name}`,
  kinds: { positive: "Rasgo positivo", negative: "Rasgo negativo", granted: "Rasgo" },
  profession: "Profesión",
  traitPrice: (group, n) =>
    group === "positive" ? `Cuesta ${pts(n, "punto", "puntos")}` : group === "negative" ? `Te da ${pts(n, "punto", "puntos")}` : "No se elige al crear el personaje",
  profPrice: (n) => (n > 0 ? `Te da ${pts(n, "punto", "puntos")} para rasgos` : n < 0 ? `Cuesta ${pts(-n, "punto", "puntos")}` : "No cambia tus puntos"),
  profOnly: "sólo de profesión",
  twin: { toProf: "Una profesión también lo trae, como rasgo aparte:", toPick: "También hay uno que se elige al crear el personaje:" },
  twinMark: "de profesión",
  traitSheets: {
    boosts: "Habilidades que sube",
    recipes: "Recetas que da",
    exclusive: "No se combina con",
    professions: "Profesiones que lo traen",
    traits: "Rasgos que lo traen",
    grants: "Trae con él",
  },
  profSheets: { boosts: "Habilidades iniciales", traits: "Rasgos gratis", recipes: "Recetas que ya sabe", towns: "Dónde puede empezar" },
  more: (n) => `y ${n} más`,
  plannerBtn: "Armar un personaje con esta profesión",
  tryPlanner: "Probalo en el planificador de personaje",
};

export const TRAITS_COPY: Record<"en" | "es", PzTraitsCopy> = { en: EN, es: ES };
export const useTraitsCopy = (): PzTraitsCopy => TRAITS_COPY[useLang().lang];
