/**
 * La calculadora de Habilidades de Project Zomboid (2026-09-30), pura: sin React ni navegador, así se prueba con los
 * datos reales y la cuenta a mano (`test/zomboidSkills.test.ts`). Dice cuánta XP pide la barra para ir de un nivel a
 * otro, qué libro conviene leer en cada tramo y cuánta XP hay que ganar haciendo cosas (la que dice cada receta) con los
 * multiplicadores del personaje y del libro.
 *
 * Todo repite lo que hace el juego (42.21), leído en su código:
 *
 * **XP por nivel** — `PerkFactory`: `xp[n]` es lo que pide la barra para pasar del nivel n al n+1 (`site/skills.json`).
 *
 * **Multiplicadores** — `IsoGameCharacter$XP.AddXP`, en este orden y multiplicados: la tabla de la bonificación de
 * inicio × los rasgos que nombran la habilidad (eso es `charMult`, la misma cuenta del Planificador: `xpMult.ts`), × el
 * multiplicador del libro leído si es mayor que 1 (`getMultiplier`), × el del servidor (acá, 1: el de siempre).
 *
 * **Libros** — `ISReadABook` (media/lua/shared/TimedActions) le pone a la habilidad `addXpMultiplier(perk, mult,
 * LvlSkillTrained, MaxLevelTrained)`, que en los datos son `from` y `to`. `AddXP` lo aplica a toda la XP que ganes y lo
 * borra cuando la XP total cruza la del nivel `to` (o baja de la del nivel `from − 1`). El libro no se deja leer antes
 * del nivel `from − 1` (`checkLevel`: `LvlSkillTrained > nivel + 1` vuelve las páginas a 0). O sea: un libro "niveles
 * 1–2" multiplica la subida al nivel 1 y al 2, y se lee desde el nivel 0. Leído a medias da una parte (cada 10 % de
 * páginas, un 10 % del multiplicador): la cuenta supone el libro entero. Hay un solo multiplicador por habilidad: leer
 * otro libro de la misma pisa el anterior.
 */
import { xpMult, type MultTrait } from "../planner/xpMult";
import type { SkillBook, SkillData } from "./data";

export const MAX_LEVEL = 10;

const clampLevel = (n: number): number => Math.min(MAX_LEVEL, Math.max(0, Math.trunc(n)));

/** La XP que pide la barra para ir del nivel `from` al `to` (0–10). Un tramo vacío o al revés, 0. */
export function xpNeeded(skill: Pick<SkillData, "xp">, from: number, to: number): number {
  let sum = 0;
  for (let n = clampLevel(from); n < clampLevel(to); n++) sum += skill.xp[n] ?? 0;
  return sum;
}

/** El libro que multiplica la subida al nivel `level` (la del nivel `level − 1` al `level`), o `null`. */
export const bookFor = (skill: Pick<SkillData, "books">, level: number): SkillBook | null =>
  skill.books.find((b) => b.from <= level && level <= b.to) ?? null;

/**
 * El multiplicador de XP del personaje en esa habilidad: su bonificación de inicio (0 a 3; más cuenta como 3) y los
 * rasgos que tiene. Sin el libro, que depende del tramo.
 */
export const charMult = (skill: Pick<SkillData, "id" | "boost">, boost: number, traits: readonly MultTrait[]): number =>
  xpMult(skill.boost, boost, skill.id, traits);

/** Un tramo de niveles con el mismo libro (o sin libro). */
export interface Stretch {
  from: number;
  to: number;
  book: SkillBook | null;
  /** La XP que pide la barra en el tramo. */
  bar: number;
  /** El multiplicador de todo el tramo: el del personaje × el del libro. */
  mult: number;
  /** La XP que hay que ganar haciendo cosas: `bar / mult`. */
  earn: number;
}

export interface Plan {
  stretches: Stretch[];
  bar: number;
  earn: number;
}

/**
 * De `from` a `to` con el multiplicador `mult` del personaje (`charMult`): en tramos por libro, leyendo cada uno a su
 * tiempo (`useBooks`), o en un solo tramo sin libros. Cada subida de nivel usa el libro que la multiplica; las subidas
 * seguidas con el mismo libro van en un mismo tramo.
 */
export function withBooks(skill: Pick<SkillData, "xp" | "books">, from: number, to: number, mult = 1, useBooks = true): Plan {
  const stretches: Stretch[] = [];
  const a = clampLevel(from);
  const b = clampLevel(to);
  for (let n = a; n < b; n++) {
    const book = useBooks ? bookFor(skill, n + 1) : null;
    const last = stretches[stretches.length - 1];
    if (last && last.book === book) last.to = n + 1;
    else stretches.push({ from: n, to: n + 1, book, bar: 0, mult: 0, earn: 0 });
  }
  for (const s of stretches) {
    s.bar = xpNeeded(skill, s.from, s.to);
    s.mult = mult * (s.book && s.book.mult > 1 ? s.book.mult : 1);
    s.earn = s.mult > 0 ? s.bar / s.mult : 0;
  }
  return {
    stretches,
    bar: stretches.reduce((sum, s) => sum + s.bar, 0),
    earn: stretches.reduce((sum, s) => sum + s.earn, 0),
  };
}

/** Redondea hacia arriba sin que la coma flotante sume uno de más (1753,0000000002 es 1753). */
export const ceilXp = (n: number): number => Math.ceil(n - 1e-9);

/**
 * La XP a ganar en números enteros, para mostrar: la de cada tramo y la total, que suman igual.
 *
 * El juego acumula la XP con decimales y de corrido (`IsoGameCharacter$XP.xpMap` guarda un Float por habilidad, y lo
 * que sobra de una acción al pasar de nivel sigue contando para el siguiente): no hay un redondeo por tramo. Por eso el
 * total es la suma exacta redondeada hacia arriba (con una menos no llegás), y cada tramo es lo que avanza ese total
 * redondeado de un tramo al otro: `ceil(acumulado hasta acá) − ceil(acumulado hasta el anterior)`. Así la tabla cierra
 * con el total (redondeando cada tramo por su lado, Puntería 0→4 con Aprendiz rápido daba 462 + 1.293 = 1.755 contra un
 * total de 1.754), y ningún tramo se aleja más de 1 de su cuenta exacta.
 */
export function roundEarn(plan: Pick<Plan, "stretches">): { stretches: number[]; total: number } {
  let exact = 0;
  let shown = 0;
  const stretches = plan.stretches.map((s) => {
    exact += s.earn;
    const step = ceilXp(exact) - shown;
    shown += step;
    return step;
  });
  return { stretches, total: shown };
}
