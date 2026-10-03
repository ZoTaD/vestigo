/**
 * Los datos de la pestaña Rasgos de Project Zomboid (2026-09-30), tal como los escribe `games/zomboid/tools/site.py`:
 * `site/traits.json` (97 rasgos) y `site/professions.json` (25 profesiones). Ver `.superpowers/sdd/pj-1-report.md`.
 *
 * A diferencia de Objetos y Recetas, viajan enteros en el chunk de la pestaña y no en archivos aparte: son dos archivos
 * chicos (~23 KB con gzip entre los dos) y la lista los usa enteros. Una ficha también los necesita a todos: "Rasgos que
 * lo traen" se arma dando vuelta los `grants` de los otros rasgos. Así la pestaña no pasa nunca por "cargando…" y no
 * necesita línea en `TAB_DATA` (`Zomboid.tsx`): bajar el chunk ya es bajar los datos.
 *
 * Los tipos siguen lo que escribe site.py de verdad: `lvl` en cada bonificación (puede ser negativo) y `grants` (los
 * rasgos que trae un rasgo: Metabolismo lento trae Sobrepeso). Un campo de más que sume el extractor no molesta.
 */
import professionsJson from "@zomboid/site/professions.json";
import traitsJson from "@zomboid/site/traits.json";
import type { Loc, Ref } from "../items/data";
import type { TraitGroup } from "./copy";
import type { FichaChange } from "../patches/data";

export type { Loc, Ref };

/** Una bonificación de habilidad: cuántos niveles suma (o resta: Enclenque, Fuerza). */
export interface SkillBoost {
  skill: Ref;
  lvl: number;
}

export interface Trait {
  id: string;
  en: string;
  es: string;
  /** 13 rasgos no traen descripción: el juego muestra en su lugar las habilidades que suben. */
  desc?: Loc;
  /** El costo del juego: > 0 cuesta puntos, < 0 los da, 0 sólo viene con una profesión. */
  cost: number;
  positive: boolean;
  /** No se elige al crear el personaje: viene con una profesión, con otro rasgo o con el peso. */
  professionOnly: boolean;
  exclusive: Ref[];
  xpBoosts: SkillBoost[];
  /** Sólo Aprendiz rápido/lento, Pacifista e Ingenioso: multiplican la XP de estas habilidades (ids de ficha). */
  xpMult?: { mult: number; skills: string[] }[];
  recipes: Ref[];
  /**
   * Lo que sabe y no es una receta con ficha (las temporadas de cultivo de Jardinero, la mecánica de autos de Mecánico
   * aficionado, los remedios herbales): sólo el nombre del juego, va como texto.
   */
  known?: Loc[];
  /**
   * El otro rasgo con el mismo nombre: seis vienen de a dos, el que se elige al crear el personaje y el de profesión
   * (Herrería y la Herrería del Herrero). La ficha de cada uno enlaza al otro.
   */
  twin?: Ref;
  /** Los rasgos que trae este (GrantedTraits). */
  grants: Ref[];
  icon: string | null;
  /** Las profesiones que lo traen. */
  grantedBy: Ref[];
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

export interface Profession {
  id: string;
  en: string;
  es: string;
  desc?: Loc;
  /** Los puntos que deja para rasgos: 8 (Desempleado) da 8, −6 (Ladrón) cuesta 6. */
  cost: number;
  xpBoosts: SkillBoost[];
  traits: Ref[];
  recipes: Ref[];
  /** Lo que ya sabe y no es una receta con ficha (Generador, Mecánica básica, las temporadas de cultivo). */
  known?: Loc[];
  /** Desempleado no tiene ícono. */
  icon: string | null;
  spawnTowns?: string[];
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

export const TRAITS = traitsJson as unknown as Trait[];
export const PROFESSIONS = professionsJson as unknown as Profession[];

const traitById = new Map(TRAITS.map((t) => [t.id, t]));
const profById = new Map(PROFESSIONS.map((p) => [p.id, p]));

/** El rasgo de un slug; `null` si no existe (un slug de la dirección no puede tropezar con nada del prototipo: es un Map). */
export const findTrait = (id: string | undefined): Trait | null => (id ? (traitById.get(id) ?? null) : null);
export const findProfession = (id: string | undefined): Profession | null => (id ? (profById.get(id) ?? null) : null);

/**
 * En qué hoja va un rasgo. Como las dos listas del juego: costo > 0, positivos; < 0, negativos. Los que el juego marca
 * como de profesión (`IsProfessionTrait`) no están en ninguna aunque tengan costo (Demacrado, −10): van aparte.
 */
export const traitGroup = (t: Trait): TraitGroup => (t.professionOnly || t.cost === 0 ? "granted" : t.cost > 0 ? "positive" : "negative");

/** Los rasgos que traen a otro (el revés de `grants`): Sobrepeso lo trae Metabolismo lento. */
const grantedByTrait = new Map<string, Ref[]>();
for (const t of TRAITS) {
  for (const g of t.grants) {
    const list = grantedByTrait.get(g.id) ?? [];
    list.push({ id: t.id, en: t.en, es: t.es, icon: t.icon });
    grantedByTrait.set(g.id, list);
  }
}
export const traitsGranting = (id: string): Ref[] => grantedByTrait.get(id) ?? [];

/**
 * Un número de puntos con su signo, como lo escribe el juego: "+4", "−6" (con el signo menos de verdad, que en Old
 * Standard mide lo mismo que el más) y "0".
 */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Lo que un rasgo le hace a tus puntos: un positivo de costo 4 te saca 4 ("−4"). Ver `copy.ts`. */
export const traitPoints = (t: Trait): number => -t.cost;

/**
 * La profesión de entrada del planificador: Desempleado (`base:unemployed`, en inglés "Custom Occupation"), la que el
 * juego pone primera en la lista (`populateProfessionList`) y la que queda elegida al abrir la pantalla (`create`).
 * Vive acá y no en `planner/build.ts` para que la ficha de un rasgo la use sin traer las habilidades del planificador.
 */
export const DEFAULT_PROF = "custom-occupation";

/** ¿Se elige al crear el personaje? Los de profesión (`isFree`) no; todos los demás cuestan o dan algo. */
export const pickable = (t: Trait): boolean => !t.professionOnly && t.cost !== 0;
