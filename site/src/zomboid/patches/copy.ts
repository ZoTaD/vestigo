/**
 * Los textos de la pestaña Parches de Project Zomboid (2026-10-02), en inglés y español con voseo: la lista de versiones
 * (`/parches`), la página de cada una (`/parches/42-21`) y las etiquetas de los campos del diff (`FIELD_LABELS`). El
 * `<head>` sigue en `zomboidCopy.ts` (`seo.patches` y `seo.detail.patches`): lo escribe el prerender sin bajar la pestaña.
 *
 * Todo esto es texto nuestro, y los resúmenes de cada versión también (la Crónica, con su fuente enlazada). Las
 * etiquetas de los campos usan las palabras de las fichas de Objetos donde las hay ("Defensa contra mordiscos"), así un
 * cambio se lee igual que el número en la ficha.
 */
import { useLang, type Lang } from "../../i18n";
import type { Kind } from "./data";

/** Cómo se nombra cada tipo en una cuenta: singular, plural y, en español, si es femenino ("2 recetas cambiadas"). */
export interface KindNoun {
  one: string;
  many: string;
  fem?: boolean;
}

export interface PzPatchesCopy {
  title: string;
  /** `oldest`: la versión más vieja de la lista; `first`: la primera que guardamos completa; `current`: la de hoy. */
  intro: (oldest: string, first: string | null, current: string) => string;
  hand: string;
  kinds: Record<Kind, string>;
  nouns: Record<Kind, KindNoun>;
  added: (n: string) => string;
  removed: (n: string) => string;
  changed: (n: string) => string;
  branch: { stable: string; unstable: string };
  hotfixes: string;
  hotfixCount: (n: string) => string;
  sources: string;
  /** El texto de cada enlace a una fuente, por su `kind`. */
  sourceKind: Record<string, string>;
  /** Para una fuente de un tipo sin texto: "Fuente (dominio)". */
  sourceOther: (host: string) => string;
  /** El texto de cuando la versión es la primera que guardamos completa. Las cifras ya formateadas. */
  first: (counts: string) => string;
  /** El chip de la lista para la primera versión guardada. */
  firstChip: string;
  before: (first: string) => string;
  beforeChip: string;
  /** Comparada con la anterior y sin ningún dato distinto. */
  same: string;
  sameChip: string;
  hotfixOf: (v: string) => string;
  up: string;
  down: string;
  notFound: string;
  back: string;
  backBottom: string;
  kicker: string;
  highlights: string;
  whatChanged: string;
  /** El "Qué cambió" de cada ficha (`ChangesBox`). */
  box: { title: string; appeared: string; all: string };
  /** "Comparada con la" + la versión enlazada + "." */
  comparedWith: string;
  unstableOn: (date: string) => string;
  more: (n: number) => string;
  /** "y" / "and", para cerrar una enumeración. */
  and: string;
  yes: string;
  no: string;
  /** Un renglón de receta: "cualquiera con la etiqueta x" y "(se conserva)". */
  anyTagged: (tag: string) => string;
  kept: string;
  or: string;
  /** Las etiquetas con patrón, con el nombre de la habilidad ya puesto. */
  pattern: {
    xpBoost: (skill: string) => string;
    skillLevel: (skill: string) => string;
    skillXp: (skill: string) => string;
    levelXp: (level: number) => string;
    levelName: (level: string) => string;
    levelDesc: (level: string) => string;
    autoLearn: (skill: string) => string;
  };
}

const EN: PzPatchesCopy = {
  title: "Patch notes",
  intro: (oldest, first, current) =>
    first
      ? `Every Project Zomboid version since ${oldest}, told in our own words, and since ${first} the exact list of what changed in items, recipes, traits, skills, moodles and server options. We're on ${current}.`
      : `Every Project Zomboid version since ${oldest}, told in our own words. We're on ${current}.`,
  hand: "the summaries are ours; the official notes are linked on each version",
  kinds: {
    items: "Items",
    recipes: "Recipes",
    traits: "Traits",
    professions: "Professions",
    skills: "Skills",
    moodles: "Moodles",
    sandbox: "Sandbox options",
  },
  nouns: {
    items: { one: "item", many: "items" },
    recipes: { one: "recipe", many: "recipes" },
    traits: { one: "trait", many: "traits" },
    professions: { one: "profession", many: "professions" },
    skills: { one: "skill", many: "skills" },
    moodles: { one: "moodle", many: "moodles" },
    sandbox: { one: "sandbox option", many: "sandbox options" },
  },
  added: (n) => `New (${n})`,
  removed: (n) => `Removed (${n})`,
  changed: (n) => `Changed (${n})`,
  branch: { stable: "Stable", unstable: "Unstable" },
  hotfixes: "Hotfixes",
  hotfixCount: (n) => (n === "1" ? "1 hotfix" : `${n} hotfixes`),
  sources: "Sources",
  sourceKind: { notes: "Full notes from The Indie Stone", steam: "Announcement on Steam" },
  sourceOther: (host) => `Source (${host})`,
  first: (counts) =>
    `This is the first version we saved in full: ${counts}. From the next one on, this is where you'll see what changed in each of them.`,
  firstChip: "first saved",
  before: (first) => `This patch is older than ${first}: from that version on we compare each one against the last.`,
  beforeChip: `not compared`,
  same: "We compared it with the previous version and no data changed: items, recipes, traits, skills, moodles and sandbox options stayed the same.",
  sameChip: "no data changes",
  hotfixOf: (v) => `Hotfix for ${v}`,
  up: "up",
  down: "down",
  notFound: "We couldn't find that version. Look for it in the list.",
  back: "All versions",
  backBottom: "Back to all versions",
  kicker: "Project Zomboid · Patch notes",
  highlights: "The highlights",
  whatChanged: "What changed",
  box: { title: "What changed", appeared: "Added in this version", all: "All versions" },
  comparedWith: "Compared with",
  unstableOn: (date) => `hit the unstable branch on ${date}`,
  more: (n) => `and ${n} more`,
  and: "and",
  yes: "yes",
  no: "no",
  anyTagged: (tag) => `any tagged ${tag}`,
  kept: " (kept)",
  or: " or ",
  pattern: {
    xpBoost: (s) => `${s} boost`,
    skillLevel: (s) => `${s} level`,
    skillXp: (s) => `${s} XP`,
    levelXp: (n) => `XP for level ${n}`,
    levelName: (n) => `Level ${n} name`,
    levelDesc: (n) => `Level ${n} text`,
    autoLearn: (s) => `Learned on its own at ${s}`,
  },
};

const ES: PzPatchesCopy = {
  title: "Notas del parche",
  intro: (oldest, first, current) =>
    first
      ? `Cada versión de Project Zomboid desde la ${oldest}, contada con nuestras palabras, y desde la ${first} la lista exacta de lo que cambió en objetos, recetas, rasgos, habilidades, moodles y opciones de servidor. Vamos por la ${current}.`
      : `Cada versión de Project Zomboid desde la ${oldest}, contada con nuestras palabras. Vamos por la ${current}.`,
  hand: "los resúmenes son nuestros; las notas oficiales están enlazadas en cada versión",
  kinds: {
    items: "Objetos",
    recipes: "Recetas",
    traits: "Rasgos",
    professions: "Profesiones",
    skills: "Habilidades",
    moodles: "Moodles",
    sandbox: "Opciones de sandbox",
  },
  nouns: {
    items: { one: "objeto", many: "objetos" },
    recipes: { one: "receta", many: "recetas", fem: true },
    traits: { one: "rasgo", many: "rasgos" },
    professions: { one: "profesión", many: "profesiones", fem: true },
    skills: { one: "habilidad", many: "habilidades", fem: true },
    moodles: { one: "moodle", many: "moodles" },
    sandbox: { one: "opción de sandbox", many: "opciones de sandbox", fem: true },
  },
  added: (n) => `Nuevos (${n})`,
  removed: (n) => `Quitados (${n})`,
  changed: (n) => `Cambiados (${n})`,
  branch: { stable: "Estable", unstable: "Unstable" },
  hotfixes: "Hotfixes",
  hotfixCount: (n) => (n === "1" ? "1 hotfix" : `${n} hotfixes`),
  sources: "Fuentes",
  sourceKind: { notes: "Notas completas de The Indie Stone", steam: "Anuncio en Steam" },
  sourceOther: (host) => `Fuente (${host})`,
  first: (counts) =>
    `Es la primera versión que guardamos completa: ${counts}. Desde la próxima, acá aparece qué cambió en cada uno.`,
  firstChip: "la primera guardada",
  before: (first) => `Este parche es anterior a la ${first}: desde esa versión comparamos una contra otra.`,
  beforeChip: "sin comparar",
  same: "La comparamos con la versión anterior y no cambió ningún dato: objetos, recetas, rasgos, habilidades, moodles y opciones de sandbox quedaron igual.",
  sameChip: "sin cambios de datos",
  hotfixOf: (v) => `Hotfix de la ${v}`,
  up: "sube",
  down: "baja",
  notFound: "No encontramos esa versión. Buscala en la lista.",
  back: "Todas las versiones",
  backBottom: "Volver a todas las versiones",
  kicker: "Project Zomboid · Notas del parche",
  highlights: "Lo más importante",
  whatChanged: "Qué cambió",
  box: { title: "Qué cambió", appeared: "Apareció en esta versión", all: "Todas las versiones" },
  comparedWith: "Comparada con la",
  unstableOn: (date) => `llegó a Unstable el ${date}`,
  more: (n) => `y ${n} más`,
  and: "y",
  yes: "sí",
  no: "no",
  anyTagged: (tag) => `cualquiera con la etiqueta ${tag}`,
  kept: " (se conserva)",
  or: " o ",
  pattern: {
    xpBoost: (s) => `Bonificación de ${s}`,
    skillLevel: (s) => `Nivel de ${s}`,
    skillXp: (s) => `XP de ${s}`,
    levelXp: (n) => `XP para el nivel ${n}`,
    levelName: (n) => `Nombre del nivel ${n}`,
    levelDesc: (n) => `Texto del nivel ${n}`,
    autoLearn: (s) => `Se aprende sola con ${s} en`,
  },
};

export const PATCHES_COPY: Record<Lang, PzPatchesCopy> = { en: EN, es: ES };
export const usePatchesCopy = (): PzPatchesCopy => PATCHES_COPY[useLang().lang];

/**
 * TEXTO NUESTRO: el nombre de cada campo que compara site.py, por su clave. Los de `stats.` van sin el prefijo (en
 * `STAT_LABELS`), y los de sandbox aparte (`SANDBOX_LABELS`): `n` o `type` dicen otra cosa en una opción de servidor.
 * Una clave que no esté en ninguna se muestra cruda (`fieldLabel` da `null`).
 */
export const FIELD_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    name: "Name",
    type: "Type",
    cat: "Category",
    weight: "Weight",
    tags: "Tags",
    teaches: "Teaches",
    research: "Researching it teaches",
    opens: "Opens",
    cost: "Cost",
    desc: "Description",
    recipes: "Recipes",
    exclusive: "Mutually exclusive",
    grantedTraits: "Traits it grants",
    traits: "Traits",
    time: "Time",
    category: "Category",
    kind: "Kind",
    inputs: "Ingredients and tools",
    outputs: "Result",
    stations: "Workstation",
    professionOnly: "Profession only",
    disabledInMultiplayer: "Off in multiplayer",
  },
  es: {
    name: "Nombre",
    type: "Tipo",
    cat: "Categoría",
    weight: "Peso",
    tags: "Etiquetas",
    teaches: "Enseña",
    research: "Se investiga",
    opens: "Abre",
    cost: "Costo",
    desc: "Descripción",
    recipes: "Recetas",
    exclusive: "Excluyentes",
    grantedTraits: "Rasgos que da",
    traits: "Rasgos",
    time: "Tiempo",
    category: "Categoría",
    kind: "Clase",
    inputs: "Ingredientes y herramientas",
    outputs: "Resultado",
    stations: "Estación",
    professionOnly: "Sólo de profesión",
    disabledInMultiplayer: "Apagado en multijugador",
  },
};

export const SANDBOX_LABELS: Record<Lang, Record<string, string>> = {
  en: { default: "Default value", min: "Minimum", max: "Maximum", n: "Number of options", type: "Value type" },
  es: { default: "Valor por defecto", min: "Mínimo", max: "Máximo", n: "Cantidad de opciones", type: "Tipo de valor" },
};

export const STAT_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    minDamage: "Min damage",
    maxDamage: "Max damage",
    minRange: "Min range",
    maxRange: "Max range",
    baseSpeed: "Speed",
    criticalChance: "Critical chance",
    critDmgMultiplier: "Critical multiplier",
    conditionMax: "Durability",
    conditionLowerChanceOneIn: "Wear (1 in N)",
    hungerChange: "Hunger",
    thirstChange: "Thirst",
    calories: "Calories",
    daysFresh: "Stays fresh (days)",
    daysTotallyRotten: "Fully rotten after (days)",
    minutesToCook: "Cooking time (minutes)",
    capacity: "Capacity",
    weightReduction: "Weight reduction",
    biteDefense: "Bite defense",
    scratchDefense: "Scratch defense",
    bulletDefense: "Bullet defense",
    insulation: "Insulation",
    windResistance: "Wind resistance",
    waterResistance: "Water resistance",
    maxAmmo: "Capacity",
    aimingTime: "Aiming time",
    reloadTime: "Reload time",
    recoilDelay: "Recoil",
    soundRadius: "Noise radius",
    twoHanded: "Two-handed",
  },
  es: {
    minDamage: "Daño mínimo",
    maxDamage: "Daño máximo",
    minRange: "Alcance mínimo",
    maxRange: "Alcance máximo",
    baseSpeed: "Velocidad",
    criticalChance: "Probabilidad de crítico",
    critDmgMultiplier: "Multiplicador de crítico",
    conditionMax: "Durabilidad",
    conditionLowerChanceOneIn: "Desgaste (1 en N)",
    hungerChange: "Hambre",
    thirstChange: "Sed",
    calories: "Calorías",
    daysFresh: "Se conserva (días)",
    daysTotallyRotten: "Se pudre del todo a los (días)",
    minutesToCook: "Tiempo de cocción (minutos)",
    capacity: "Capacidad",
    weightReduction: "Reduce el peso",
    biteDefense: "Defensa contra mordiscos",
    scratchDefense: "Defensa contra rasguños",
    bulletDefense: "Defensa antibalas",
    insulation: "Aislamiento",
    windResistance: "Resistencia al viento",
    waterResistance: "Impermeabilidad",
    maxAmmo: "Capacidad",
    aimingTime: "Tiempo de apuntado",
    reloadTime: "Tiempo de recarga",
    recoilDelay: "Retroceso",
    soundRadius: "Radio del ruido",
    twoHanded: "A dos manos",
  },
};
