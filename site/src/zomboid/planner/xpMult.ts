/**
 * El multiplicador de XP de un personaje en una habilidad (2026-09-30), la misma cuenta para el Planificador
 * (`skills.ts`) y para la calculadora de Habilidades (`skills/calc.ts`). Vive en un módulo aparte, sin datos de rasgos
 * ni de profesiones, para que la calculadora no tenga que traer las reglas del planificador y para que la regla esté
 * escrita una sola vez: si un parche la cambia, cambian las dos pestañas juntas.
 *
 * Lo que hace el juego (42.21, `IsoGameCharacter$XP.AddXP`, ver pj-1-report.md): la tabla de la bonificación de inicio
 * de esa habilidad (`boost` de cada habilidad, o `meta.boostMultipliers`) en `min(boostCap, bonificación)` y, encima,
 * el `mult` de cada rasgo (`xpMult`) que nombra la habilidad. Se multiplican, no se reemplazan. El libro leído y el
 * multiplicador del servidor vienen después en el mismo método, y los suma quien los necesite.
 */
import meta from "@zomboid/meta.json";

const BOOST_CAP: number = meta.boostCap;

/** Lo único de un rasgo que mira la cuenta: Aprendiz rápido/lento, Pacifista e Ingenioso traen `xpMult`. */
export type MultTrait = { xpMult?: { mult: number; skills: string[] }[] };

/**
 * El multiplicador de XP de `skill` (su slug de ficha) con esa bonificación de inicio y esos rasgos. Una bonificación
 * por encima del tope cuenta como el tope (el juego guarda `Math.min(3, nivel)`); una que la tabla no tiene, ×1.
 */
export function xpMult(table: Record<string, number>, boost: number, skill: string, traits: readonly MultTrait[]): number {
  let mult = table[String(Math.min(BOOST_CAP, Math.max(0, boost)))] ?? 1;
  for (const t of traits) for (const m of t.xpMult ?? []) if (m.skills.includes(skill)) mult *= m.mult;
  return mult;
}
