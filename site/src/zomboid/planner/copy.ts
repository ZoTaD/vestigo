/**
 * Los textos del Planificador de personaje de Project Zomboid (2026-09-30), en inglés y español con voseo. Van en un
 * módulo propio y no en `zomboidCopy.ts` para que las pestañas de esta tanda no se pisen (ver el plan). El `<head>` sí
 * sigue allá (`seo.planner`): lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres de las profesiones, los rasgos, las habilidades y las recetas salen de los
 * datos, con la traducción oficial.
 */
import { useLang } from "../../i18n";

export interface PzPlannerCopy {
  title: string;
  intro: (profs: string, pos: string, neg: string, version: string) => string[];
  hand: string;
  profTitle: string;
  profNote: string;
  groups: { positive: string; negative: string };
  groupNotes: { positive: string; negative: string };
  search: string;
  searchHint: string;
  empty: string;
  /** Por qué un rasgo está apagado. `from` es de dónde viene el rasgo que lo apaga, si no lo elegiste vos. */
  excludes: (name: string, from?: string) => string;
  brings: (via: string, name: string, from?: string) => string;
  given: (from: string) => string;
  /** Lo que se dice cuando cambiar de profesión saca rasgos: concuerda con la cantidad (uno o varios). */
  dropped: (names: string, count: number) => string;
  sheetTitle: string;
  pointsLabel: string;
  breakdown: (prof: string, traits: string) => string;
  needPoints: string;
  conflict: (a: string, b: string) => string;
  profession: string;
  traitsHeld: string;
  noTraits: string;
  free: (from: string) => string;
  remove: (name: string) => string;
  copy: string;
  copied: string;
  copyWhat: string;
  reset: string;
  skillsTitle: string;
  skillsNote: string;
  allSkillsTitle: string;
  /**
   * `m` son los multiplicadores de 0 a 3 de bonificación; `noLoss`, las habilidades que sin bonificación no pierden XP;
   * `flat`, las que ganan siempre lo mismo; `traits`, los rasgos que multiplican; `odd`, las habilidades que en nivel 1
   * no siguen la tabla común, con su multiplicador ("Carrera ×1,25"), o "" si no hay. Todo de los datos: el texto no
   * nombra a nadie a mano.
   */
  allSkillsIntro: (m: string[], noLoss: string, flat: string, traits: string, odd: string) => string;
  cols: { skill: string; xp: string };
  level: (n: number) => string;
  recipesTitle: string;
  recipesNote: string;
  /** Junto a "Recetas que sabés": abre el Planificador de fabricación con este personaje. */
  craftLink: string;
  /** El mismo link con el personaje de entrada: lleva a la página limpia, sin "este personaje". */
  craftLinkEmpty: string;
  noRecipes: string;
  more: (n: number) => string;
  /** La barra de puntos que acompaña en el celular mientras se eligen rasgos. */
  bar: { points: string; toSheet: string };
  join: (names: string[]) => string;
  /** El panel del sobreviviente en 3D (2026-10-01). `loading` existe sólo en el navegador, después de tocar "Ver en 3D". */
  survivor: {
    title: string;
    dressedAs: (prof: string) => string;
    /** El nombre del grupo Hombre/Mujer, para los lectores de pantalla. */
    sex: string;
    male: string;
    female: string;
    view3d: string;
    loading: string;
    noWebgl: string;
    failed: string;
    retry: string;
    turnLeft: string;
    turnRight: string;
    front: string;
    wearing: string;
  };
}

const joinWith = (word: string) => (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${word} ${names[names.length - 1]}`;

const EN: PzPlannerCopy = {
  title: "Project Zomboid Character Planner",
  intro: (profs, pos, neg, v) => [
    `Plan your Project Zomboid Build ${v} survivor before you start: pick one of the ${profs} professions and add or remove traits (${pos} positive, ${neg} negative) to see your points, the skills you start with, how fast each one levels up and the recipes you already know.`,
    "Points work like in the game: your profession gives or takes some, positive traits cost points and negative ones give them back, and you can't start below zero. Copy the link to share your character.",
  ],
  hand: "the link keeps your character",
  profTitle: "Profession",
  profNote: "the points you start with",
  groups: { positive: "Positive traits", negative: "Negative traits" },
  groupNotes: { positive: "they cost points", negative: "they give you points" },
  search: "Search a trait",
  searchHint: "brave, torpe, strong…",
  empty: "No trait by that name. Try it in Spanish.",
  excludes: (name, from) => (from ? `Can't be combined with ${name}, which comes with ${from}` : `Can't be combined with ${name}`),
  brings: (via, name, from) =>
    from ? `It brings ${via}, which can't be combined with ${name} (from ${from})` : `It brings ${via}, which can't be combined with ${name}`,
  given: (from) => `You already have it with ${from}`,
  dropped: (names, n) => `We removed ${names}: ${n === 1 ? "it can't" : "they can't"} be combined with what your new profession brings.`,
  sheetTitle: "Your character",
  pointsLabel: "Points to spend",
  breakdown: (prof, traits) => `profession ${prof} · traits ${traits}`,
  needPoints: "You need at least 0 to start: drop a positive trait or add a negative one.",
  conflict: (a, b) => `${a} and ${b} can't go together.`,
  profession: "Profession",
  traitsHeld: "Traits",
  noTraits: "No traits yet: pick them from the list.",
  free: (from) => `free with ${from}`,
  remove: (name) => `Remove ${name}`,
  copy: "Copy link",
  copied: "Copied!",
  copyWhat: "to this character",
  reset: "Start over",
  skillsTitle: "Starting skills",
  skillsNote: "XP: how much of what you earn counts",
  allSkillsTitle: "Every skill",
  allSkillsIntro: (m, noLoss, flat, traits, odd) =>
    `With no bonus a skill earns ${m[0]} of its XP, except ${noLoss}. Starting at level 1, 2, or 3 and up gives ${m[1]}, ${m[2]} and ${m[3]}, except ${flat}, which always earn ${m[1]}.${odd ? ` Exception at level 1: ${odd}.` : ""} ${traits} multiply on top.`,
  cols: { skill: "Skill", xp: "XP" },
  level: (n) => `Level ${n}`,
  recipesTitle: "Recipes you know",
  recipesNote: "besides the ones everyone knows",
  craftLink: "Plan what to craft with this character →",
  craftLinkEmpty: "Plan what to craft →",
  noRecipes: "None besides the ones everyone knows.",
  more: (n) => `and ${n} more`,
  bar: { points: "Points", toSheet: "See your character ↓" },
  join: joinWith("and"),
  survivor: {
    title: "Your survivor",
    // "in the Unemployed outfit": con "dressed as a…" salía "an Unemployed".
    dressedAs: (prof) => `in the ${prof} outfit`,
    sex: "Male or female",
    male: "Male",
    female: "Female",
    view3d: "View in 3D",
    loading: "Building the model…",
    noWebgl: "Your browser can't show 3D, so here's the picture.",
    failed: "The 3D model didn't load.",
    retry: "Try again",
    turnLeft: "Turn left",
    turnRight: "Turn right",
    front: "Face front",
    wearing: "Wearing",
  },
};

const ES: PzPlannerCopy = {
  title: "Planificador de personaje de Project Zomboid",
  intro: (profs, pos, neg, v) => [
    `Armá tu sobreviviente de Project Zomboid Build ${v} antes de empezar: elegí una de las ${profs} profesiones y sumá o sacá rasgos (${pos} positivos y ${neg} negativos) para ver tus puntos, las habilidades con las que arrancás, qué tan rápido sube cada una y las recetas que ya sabés.`,
    "Los puntos funcionan como en el juego: la profesión te da o te saca, los rasgos positivos cuestan puntos y los negativos te los devuelven, y no podés empezar con menos de cero. Copiá el link para compartir tu personaje.",
  ],
  hand: "el link guarda tu personaje",
  profTitle: "Profesión",
  profNote: "los puntos con los que arrancás",
  groups: { positive: "Rasgos positivos", negative: "Rasgos negativos" },
  groupNotes: { positive: "cuestan puntos", negative: "te dan puntos" },
  search: "Buscar un rasgo",
  searchHint: "valiente, clumsy, fuerte…",
  empty: "Ningún rasgo con ese nombre. Probá en inglés.",
  excludes: (name, from) => (from ? `No se combina con ${name}, que trae ${from}` : `No se combina con ${name}`),
  brings: (via, name, from) =>
    from ? `Trae ${via}, que no se combina con ${name} (de ${from})` : `Trae ${via}, que no se combina con ${name}`,
  given: (from) => `Ya lo tenés con ${from}`,
  dropped: (names, n) => `Sacamos ${names}: ${n === 1 ? "no se combina" : "no se combinan"} con lo que trae tu nueva profesión.`,
  sheetTitle: "Tu personaje",
  pointsLabel: "Puntos para gastar",
  breakdown: (prof, traits) => `profesión ${prof} · rasgos ${traits}`,
  needPoints: "Necesitás al menos 0 para empezar: sacá un rasgo positivo o sumá uno negativo.",
  conflict: (a, b) => `${a} y ${b} no van juntos.`,
  profession: "Profesión",
  traitsHeld: "Rasgos",
  noTraits: "Todavía sin rasgos: elegilos de la lista.",
  free: (from) => `gratis con ${from}`,
  remove: (name) => `Sacar ${name}`,
  copy: "Copiar link",
  copied: "¡Copiado!",
  copyWhat: "de este personaje",
  reset: "Empezar de nuevo",
  skillsTitle: "Habilidades iniciales",
  skillsNote: "XP: cuánto te rinde lo que ganás",
  allSkillsTitle: "Todas las habilidades",
  allSkillsIntro: (m, noLoss, flat, traits, odd) =>
    `Sin bonificación, una habilidad gana ${m[0]} de su XP, salvo ${noLoss}. Arrancar en nivel 1, 2 o 3 y más da ${m[1]}, ${m[2]} y ${m[3]}, salvo ${flat}, que ganan siempre ${m[1]}.${odd ? ` Excepción en nivel 1: ${odd}.` : ""} ${traits} multiplican encima.`,
  cols: { skill: "Habilidad", xp: "XP" },
  level: (n) => `Nivel ${n}`,
  recipesTitle: "Recetas que sabés",
  recipesNote: "además de las que sabe todo el mundo",
  craftLink: "Planificá qué fabricar con este personaje →",
  craftLinkEmpty: "Planificá qué fabricar →",
  noRecipes: "Ninguna más que las que sabe todo el mundo.",
  more: (n) => `y ${n} más`,
  bar: { points: "Puntos", toSheet: "Ver tu personaje ↓" },
  join: joinWith("y"),
  survivor: {
    title: "Tu sobreviviente",
    dressedAs: (prof) => `con la ropa de ${prof}`,
    sex: "Hombre o mujer",
    male: "Hombre",
    female: "Mujer",
    view3d: "Ver en 3D",
    loading: "Armando el modelo…",
    noWebgl: "Tu navegador no puede mostrar 3D: queda la imagen.",
    failed: "No se pudo cargar el 3D.",
    retry: "Probar de nuevo",
    turnLeft: "Girar a la izquierda",
    turnRight: "Girar a la derecha",
    front: "Volver al frente",
    wearing: "Lleva puesto",
  },
};

export const PLANNER_COPY: Record<"en" | "es", PzPlannerCopy> = { en: EN, es: ES };
export const usePlannerCopy = (): PzPlannerCopy => PLANNER_COPY[useLang().lang];
