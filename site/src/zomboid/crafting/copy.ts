/**
 * Los textos del Planificador de fabricación de Project Zomboid (2026-10-02), en inglés y español con voseo. Van en un
 * módulo propio, como los de Personaje (`planner/copy.ts`): el `<head>` sigue en `zomboidCopy.ts` (`seo.crafting`), que
 * lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro. Los nombres de los objetos, las recetas, las estaciones y las habilidades salen de los
 * datos, con la traducción oficial. Las notas dicen qué significa cada cosa, nunca de dónde sale el número.
 */
import { useLang } from "../../i18n";
import type { CRecipe } from "./data";
import type { LeafWhy } from "./engine";

/** Por qué una hoja del árbol no se fabrica. `undo` y `raw` no llevan etiqueta: se juntan y listo. */
type WhyLabel = Exclude<LeafWhy, "raw" | "undo">;

export interface CraftCopy {
  title: string;
  /** Las cifras ya formateadas: objetos que se fabrican, construcciones, cuántos tienen más de una receta, la versión. */
  intro: (n: string, builds: string, multi: string, v: string) => string[];
  hand: string;
  pickTitle: string;
  search: string;
  searchHint: string;
  ideas: string;
  kinds: { all: string; items: string; builds: string };
  kindLabel: string;
  catLabel: string;
  allCats: string;
  recipes: (n: number) => string;
  add: string;
  addOne: (name: string) => string;
  remove: string;
  removeOne: (name: string) => string;
  more: string;
  none: string;
  inList: (n: number) => string;
  listTitle: string;
  listEmpty: string;
  qty: (name: string) => string;
  less: (name: string) => string;
  plus: (name: string) => string;
  clear: string;
  routeTitle: string;
  routeNote: string;
  empty: string;
  raw: string;
  tools: string;
  oneOf: string;
  andMore: (n: number) => string;
  fluids: string;
  liters: (n: string, name: string) => string;
  stations: string;
  buildIt: string;
  addToList: string;
  stationFound: string;
  skills: string;
  level: (n: number) => string;
  learnTitle: string;
  learnNote: string;
  learnWith: string;
  learnBooks: string;
  /** "llegar a Herrería nivel 6": el nombre de la habilidad ya traducido. */
  reach: (lvl: number, skill: string) => string;
  anyOfLv: string;
  research: string;
  traitsProfs: string;
  and: string;
  orWord: string;
  steps: string;
  left: string;
  uses: (n: number) => string;
  /** Dónde aparece más: el cuarto, la chance ya escrita ("3,9 %") y en cuántos lugares del mapa. */
  easiest: (room: string, pct: string, n: number) => string;
  /** Lo mismo para lo que aparece en cualquier lado (sin botín propio): sin "en N lugares", que no dice nada. */
  easiestAnywhere: (room: string, pct: string) => string;
  whereLink: string;
  charTitle: string;
  noProf: string;
  charNote: string;
  charLink: string;
  profLabel: string;
  have: string;
  haveOne: (name: string) => string;
  haveTool: string;
  youHaveIt: string;
  xpTitle: string;
  xp: (n: string) => string;
  why: Record<WhyLabel, string>;
  treeTitle: string;
  treeNote: string;
  with: string;
  switchRecipe: string;
  mustLearn: string;
  /** Las recetas que sólo sirven para abrir, partir, reparar o rehacer otra cosa, según cuál. */
  undoes: Record<NonNullable<CRecipe["x"]>, string>;
  getIt: string;
  makeIt: string;
  makeTool: string;
  getTool: string;
  anyContainer: string;
  toolsLine: string;
  pickOne: string;
  deep: (n: number) => string;
  share: string;
  copied: string;
  shareWhat: string;
}

/**
 * Para empezar, con la búsqueda vacía: cosas que se hacen temprano y que muestran el árbol (barril de lluvia, la forja,
 * el estante de secado, una fogata, armas y trampas caseras, la soga de tela, la tabla). Los mismos en los dos idiomas.
 */
export const IDEAS = [
  "c:rain-collector-barrel-tarp",
  "c:primitive-forge",
  "c:large-plant-drying-rack",
  "c:campfire",
  "wooden-spear",
  "crude-stone-axe",
  "molotov-cocktail",
  "noise-maker",
  "sheet-rope",
  "plank",
] as const;

const EN: CraftCopy = {
  title: "Crafting planner",
  intro: (n, builds, multi, v) => [
    `Pick what you want to make in Project Zomboid Build ${v} and get everything it takes: the full recipe tree, the materials to gather, the tools, the stations, the skills and what you need to learn.`,
    `${n} items can be crafted and ${builds} things can be built; ${multi} of them have more than one recipe, and you can switch any step.`,
  ],
  hand: "Whatever you can find lying around, you gather; the rest, you make.",
  pickTitle: "What do you want to make?",
  search: "Search an item or a build",
  searchHint: "plank, forge, spear…",
  ideas: "Ideas to start",
  kinds: { all: "All", items: "Items", builds: "Builds" },
  kindLabel: "What to show",
  catLabel: "Category",
  allCats: "Any",
  recipes: (n) => `${n} recipes`,
  add: "Add",
  addOne: (name) => `Add ${name}`,
  remove: "Remove",
  removeOne: (name) => `Remove ${name}`,
  more: "Show more",
  none: "Nothing by that name. Try it in Spanish.",
  inList: (n) => `in your list ×${n}`,
  listTitle: "Your list",
  listEmpty: "Nothing yet: add something from above.",
  qty: (name) => `How many ${name}`,
  less: (name) => `One less ${name}`,
  plus: (name) => `One more ${name}`,
  clear: "Clear the list",
  routeTitle: "Your roadmap",
  routeNote: "what you take into the game",
  empty: "Pick something on the left and everything you need to gather shows up here.",
  raw: "To gather",
  tools: "Tools (not used up)",
  oneOf: "one of",
  andMore: (n) => `and ${n} more`,
  fluids: "Liquids",
  liters: (n, name) => `${n} L of ${name}`,
  stations: "Workstations",
  buildIt: "build it:",
  addToList: "Add to your list",
  stationFound: "found already built",
  skills: "Skills",
  level: (n) => `level ${n}`,
  learnTitle: "To learn",
  learnNote: "recipes you don't know from the start",
  learnWith: "you learn it with any of:",
  learnBooks: "reading:",
  reach: (lvl, skill) => `reaching ${skill} level ${lvl}`,
  anyOfLv: "(any of these skills)",
  research: "take apart or study:",
  traitsProfs: "traits and professions that know it:",
  and: "and",
  orWord: "or",
  steps: "Steps, in order",
  left: "Left over",
  uses: (n) => (n === 1 ? "1 use" : `${n} uses`),
  easiest: (room, pct, n) => `Easiest: ${room} · ${pct} · in ${n} ${n === 1 ? "place" : "places"}`,
  easiestAnywhere: (room, pct) => `Easiest: ${room} · ${pct}`,
  whereLink: "Where to find it →",
  charTitle: "Your character",
  noProf: "No profession",
  charNote: "With your character, what you already know is crafted with nothing to learn.",
  charLink: "Build it in Character →",
  profLabel: "Profession",
  have: "have",
  haveOne: (name) => `have: ${name}`,
  haveTool: "I have it",
  youHaveIt: "✓ you have it",
  xpTitle: "It gives you",
  xp: (n) => `+${n} XP`,
  why: { found: "can be found", learn: "crafting it needs learning", cycle: "loops back on itself", chosen: "you get it" },
  treeTitle: "The full tree",
  treeNote: "switch any recipe or material",
  with: "with",
  switchRecipe: "Switch recipe",
  mustLearn: "(you need to learn it)",
  undoes: {
    pack: "(opening a pack)",
    undo: "(cutting up or taking apart another)",
    repair: "(repairing)",
    self: "(from another one like it)",
  },
  getIt: "I'll get it",
  makeIt: "I'll make it",
  makeTool: "I'll make it",
  getTool: "I'll get it",
  anyContainer: "any container",
  toolsLine: "Tools:",
  pickOne: "one of",
  deep: (n) => `↳ level ${n}`,
  share: "Copy link",
  copied: "Link copied",
  shareWhat: "to this roadmap",
};

const ES: CraftCopy = {
  title: "Planificador de fabricación",
  intro: (n, builds, multi, v) => [
    `Elegí qué querés fabricar en Project Zomboid Build ${v} y mirá todo lo que hace falta: el árbol completo de recetas, los materiales para juntar, las herramientas, las estaciones, las habilidades y lo que tenés que aprender.`,
    `Se pueden fabricar ${n} objetos y construir ${builds} cosas; ${multi} tienen más de una receta, y cualquier paso se puede cambiar.`,
  ],
  hand: "Lo que se encuentra tirado, se junta; lo demás, se fabrica.",
  pickTitle: "¿Qué querés fabricar?",
  search: "Buscá un objeto o una construcción",
  searchHint: "tabla, forja, lanza…",
  ideas: "Ideas para empezar",
  kinds: { all: "Todo", items: "Objetos", builds: "Construcciones" },
  kindLabel: "Qué mostrar",
  catLabel: "Categoría",
  allCats: "Todas",
  recipes: (n) => `${n} recetas`,
  add: "Sumar",
  addOne: (name) => `Sumar ${name}`,
  remove: "Sacar",
  removeOne: (name) => `Sacar ${name}`,
  more: "Ver más",
  none: "Nada con ese nombre. Probá en inglés.",
  inList: (n) => `en tu lista ×${n}`,
  listTitle: "Tu lista",
  listEmpty: "Todavía nada: sumá algo de arriba.",
  qty: (name) => `Cuántos de ${name}`,
  less: (name) => `Uno menos de ${name}`,
  plus: (name) => `Uno más de ${name}`,
  clear: "Vaciar la lista",
  routeTitle: "Tu hoja de ruta",
  routeNote: "lo que te llevás al juego",
  empty: "Elegí algo a la izquierda y acá aparece todo lo que tenés que juntar.",
  raw: "Para juntar",
  tools: "Herramientas (no se gastan)",
  oneOf: "una de",
  andMore: (n) => `y ${n} más`,
  fluids: "Líquidos",
  liters: (n, name) => `${n} L de ${name}`,
  stations: "Estaciones",
  buildIt: "construila:",
  addToList: "Sumar a tu lista",
  stationFound: "se encuentra hecha",
  skills: "Habilidades",
  level: (n) => `nivel ${n}`,
  learnTitle: "Para aprender",
  learnNote: "recetas que no se saben de entrada",
  learnWith: "la aprendés con cualquiera de:",
  learnBooks: "leyendo:",
  reach: (lvl, skill) => `llegar a ${skill} nivel ${lvl}`,
  anyOfLv: "(alcanza con una)",
  research: "desarmá o estudiá:",
  traitsProfs: "rasgos y profesiones que la saben:",
  and: "y",
  orWord: "o",
  steps: "Pasos, en orden",
  left: "Te sobran",
  uses: (n) => (n === 1 ? "1 uso" : `${n} usos`),
  easiest: (room, pct, n) => `Más fácil: ${room} · ${pct} · en ${n} ${n === 1 ? "lugar" : "lugares"}`,
  easiestAnywhere: (room, pct) => `Más fácil: ${room} · ${pct}`,
  whereLink: "Dónde aparece →",
  charTitle: "Tu personaje",
  noProf: "Sin profesión",
  charNote: "Con tu personaje, lo que ya sabés se fabrica sin aprender nada.",
  charLink: "Armalo en Personaje →",
  profLabel: "Profesión",
  have: "tengo",
  haveOne: (name) => `tengo: ${name}`,
  haveTool: "la tengo",
  youHaveIt: "✓ la tenés",
  xpTitle: "Te deja",
  xp: (n) => `+${n} XP`,
  why: { found: "se encuentra", learn: "fabricarlo pide aprender", cycle: "vuelve a sí mismo", chosen: "lo conseguís" },
  treeTitle: "El árbol completo",
  treeNote: "cambiá cualquier receta o material",
  with: "con",
  switchRecipe: "Cambiar receta",
  mustLearn: "(hay que aprenderla)",
  undoes: {
    pack: "(abriendo un paquete)",
    undo: "(partiendo o desarmando otra cosa)",
    repair: "(reparando)",
    self: "(a partir de otro igual)",
  },
  getIt: "Lo consigo",
  makeIt: "Lo fabrico",
  makeTool: "La fabrico",
  getTool: "La consigo",
  anyContainer: "cualquier recipiente",
  toolsLine: "Herramientas:",
  pickOne: "una de",
  deep: (n) => `↳ nivel ${n}`,
  share: "Copiar link",
  copied: "Link copiado",
  shareWhat: "de esta hoja de ruta",
};

export const CRAFT_COPY: Record<"en" | "es", CraftCopy> = { en: EN, es: ES };
export const useCraftCopy = (): CraftCopy => CRAFT_COPY[useLang().lang];
