/**
 * Los datos de la pestaña Habilidades y libros de Project Zomboid (2026-09-30), tal como los escribe
 * `games/zomboid/tools/site.py`: `site/skills.json`, las 35 habilidades en el orden del juego, cada una con su XP por
 * nivel, su tabla de bonificación, sus libros (`from`–`to` y el multiplicador), las revistas cuyas recetas la usan, los
 * VHS y programas de TV que dan XP y los rasgos y profesiones que la suben. Ver `.superpowers/sdd/pj-1-report.md`.
 *
 * Como en Rasgos y Moodles, viajan enteros en el chunk de la pestaña (~16 KB con gzip): la lista los usa a todos (la XP
 * de 0 a 10 de cada una) y así la pestaña no pasa nunca por "cargando…" ni necesita línea en `TAB_DATA`.
 */
import skillsJson from "@zomboid/site/skills.json";
import type { Loc, Ref } from "../items/data";
import { fold } from "../ui";
import type { FichaChange } from "../patches/data";

export type { Loc, Ref };

/** Un libro de habilidad: multiplica la XP de la subida a los niveles `from` a `to` (los dos incluidos). */
export interface SkillBook {
  item: Ref;
  from: number;
  to: number;
  mult: number;
}

/**
 * Un VHS o un programa de TV que da XP de esta habilidad: `xp` es la XP base (antes de multiplicadores). En la TV, `en`
 * y `es` son el nombre del canal (el juego no lo traduce) y hay una entrada por emisión.
 */
export interface SkillMedia {
  id: string;
  en: string;
  es: string;
  kind: "vhs" | "tv";
  xp: number;
  /**
   * Alguna línea de la cinta también está en otra, y el juego da la XP de cada línea una sola vez: si viste la otra
   * antes, ésta da menos. La ficha dice "hasta" (Woodcraft E3 y Home VHS: no 9).
   */
  shared?: boolean;
  /** TV: el día de la partida en que sale (1 = el día en que arranca). Cada emisión sale una sola vez. */
  day?: number;
  /** TV: a qué hora empieza y termina, en minutos desde la medianoche de ese día (`end` puede ser 1440). */
  start?: number;
  end?: number;
  /** TV: termina el día 1 antes de la hora en que arranca una partida nueva (`meta.gameStartMinute`): no se ve. */
  beforeStart?: boolean;
}

/** Un rasgo o una profesión que arranca la habilidad con `lvl` niveles (puede ser negativo: Enclenque en Fuerza). */
export interface SkillLink extends Ref {
  lvl: number;
}

export interface SkillData {
  id: string;
  en: string;
  es: string;
  cat: { id: string; en: string; es: string };
  /** `xp[n]`: la XP para pasar del nivel n al n+1 (diez valores). */
  xp: number[];
  /** Fuerza y Estado físico arrancan en 5. */
  start?: number;
  /** El multiplicador de XP según la bonificación de inicio: "0" a "3" (3 es 3 o más). */
  boost: Record<string, number>;
  books: SkillBook[];
  magazines: Ref[];
  media: SkillMedia[];
  traits: SkillLink[];
  professions: SkillLink[];
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

export const ALL_SKILLS = skillsJson as unknown as SkillData[];

const byId = new Map(ALL_SKILLS.map((s) => [s.id, s]));

/** La habilidad de un slug; `null` si no existe (un Map: un slug de la dirección no tropieza con el prototipo). */
export const findSkill = (id: string | undefined): SkillData | null => (id ? (byId.get(id) ?? null) : null);

/** El nivel con que arranca cualquier personaje (Fuerza y Estado físico, 5). */
export const startLevel = (s: SkillData): number => s.start ?? 0;

/** Las categorías del juego, en el orden en que aparecen sus habilidades, con el nombre que les da el juego. */
export const SKILL_CATS: SkillData["cat"][] = [...new Map(ALL_SKILLS.map((s) => [s.cat.id, s.cat])).values()];

/** Las habilidades de una categoría, en el orden del juego. */
export const skillsIn = (cat: string): SkillData[] => ALL_SKILLS.filter((s) => s.cat.id === cat);

/**
 * CRITERIO NUESTRO, no del juego: el sello de la libreta de cada categoría (las habilidades no tienen ícono propio en el
 * juego). Una categoría nueva de un parche va con el asterisco.
 */
const CAT_STAMP: Record<string, string> = {
  Combat: "crossedswords",
  Firearm: "gun",
  Crafting: "hammer",
  Survivalist: "tent",
  PhysicalCategory: "lightning",
  FarmingCategory: "leaf",
};
export const catStamp = (cat: string): string => CAT_STAMP[cat] ?? "asterisk";

/** ¿La habilidad responde a lo que se busca? Por su nombre en los dos idiomas y sin tildes. */
export function skillMatches(s: SkillData, query: string): boolean {
  const needle = fold(query.trim());
  return !needle || fold(`${s.en} ${s.es}`).includes(needle);
}

