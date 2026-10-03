/**
 * Las habilidades del Planificador de personaje de Project Zomboid (2026-09-30): el nivel con que arranca cada una y cuánto
 * multiplica la XP. Van en un módulo aparte de `build.ts` para que lo que ve la pestaña Rasgos (los enlaces "Probalo en el
 * planificador" usan `encode`) no arrastre `skills.json`. Las reglas (tope 0–10, bonificación `min(3, nivel)`, tablas por
 * habilidad y `mult` de los rasgos) están explicadas en el encabezado de `build.ts`.
 */
import meta from "@zomboid/meta.json";
import skillsJson from "@zomboid/skills.json";
import { slugify } from "../../route";
import type { Ref } from "../traits/data";
import { held, professionOf, type Build } from "./build";
import { xpMult } from "./xpMult";

type SkillJson = { en: string; es: string; cat: Ref; start?: number; boost?: Record<string, number> };
export interface Skill {
  /** El slug de su ficha, que es el que usan las bonificaciones de rasgos y profesiones. */
  id: string;
  en: string;
  es: string;
  cat: Ref;
  /** Fuerza y Estado físico arrancan en 5. */
  start: number;
  /** El multiplicador de XP por bonificación: "0" a "3" (3 es 3 o más). */
  table: Record<string, number>;
}

const BOOST_CAP: number = meta.boostCap;

/**
 * Las habilidades cuyo multiplicador con bonificación 1 no es el de la tabla común (`meta.boostMultipliers["1"]`), sin
 * contar las de tabla plana (Fuerza y Estado físico dan ×1 en todo, que coincide con el común). Hoy es sólo Carrera
 * (×1,25); el texto de "Todas las habilidades" sale de acá y no la nombra a mano.
 */
export const levelOneExceptions = (): Skill[] =>
  SKILLS.filter((s) => s.table["1"] !== (meta.boostMultipliers as Record<string, number>)["1"]);

/**
 * Las 35 habilidades, en el orden del juego. Salen de `data/skills.json` (6 KB) y no de `site/skills.json` (73 KB, con
 * los libros y los medios de cada ficha): el planificador sólo necesita el nombre, la categoría, el inicio y la tabla. El
 * slug de ficha es el del nombre en inglés, como lo arma el extractor; el test lo compara con `site/skills.json`.
 */
export const SKILLS: Skill[] = Object.values(skillsJson as unknown as Record<string, SkillJson>).map((s) => ({
  id: slugify(s.en),
  en: s.en,
  es: s.es,
  cat: s.cat,
  start: s.start ?? 0,
  table: s.boost ?? (meta.boostMultipliers as Record<string, number>),
}));

export interface SkillRow extends Skill {
  /** El nivel con el que arranca, 0–10. */
  level: number;
  /** La bonificación que guarda el juego: `min(boostCap, nivel)`. */
  boost: number;
  /** Cuánto se multiplica la XP que gana. */
  mult: number;
  /** Si el juego la muestra al crear el personaje: tiene entrada en el mapa (sube o baja algo, o es Fuerza/Estado físico). */
  listed: boolean;
}

/** El nivel inicial y el multiplicador de XP de cada habilidad, en el orden del juego. */
export function skills(b: Build): SkillRow[] {
  const prof = professionOf(b);
  const traits = held(b).map((h) => h.trait);
  const sum = new Map<string, number>();
  const add = (id: string, lvl: number) => sum.set(id, (sum.get(id) ?? 0) + lvl);
  for (const t of traits) for (const x of t.xpBoosts) add(x.skill.id, x.lvl);
  for (const x of prof.xpBoosts) add(x.skill.id, x.lvl);
  return SKILLS.map((s) => {
    const level = Math.min(10, Math.max(0, s.start + (sum.get(s.id) ?? 0)));
    const boost = Math.min(BOOST_CAP, level);
    // La cuenta del multiplicador es la misma que usa la calculadora de Habilidades: vive en `xpMult.ts`.
    const mult = xpMult(s.table, boost, s.id, traits);
    return { ...s, level, boost, mult, listed: s.start !== 0 || sum.has(s.id) };
  });
}
