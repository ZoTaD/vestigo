/**
 * La cuenta de la Maestría de Warframe (2026-10-27, etapa 2): qué rango alcanza un total de puntos y cómo se guarda lo
 * tildado en el navegador. Sin React, así se prueba solo.
 */

/** La clave de `localStorage` con lo tildado: un arreglo JSON de slugs. */
export const MASTERY_KEY = "vestigo:wf:mastery";
/** Los puntos del rango de maestría 30: 2.500 · 30². */
export const MASTERY_30 = 2_250_000;
/** Lo que suma cada rango Legendario después del 30. */
export const LEGENDARY_STEP = 147_500;

export interface MasteryRank {
  /** El rango de maestría, de 0 a 30. */
  rank: number;
  /** Los rangos Legendarios sobre el 30 (0 si todavía no llega). */
  legendary: number;
  /** Los puntos que faltan para el rango siguiente. */
  next: number;
}

/** El rango que alcanza un total de puntos: 2.500·n² hasta el 30 y 147.500 más por cada Legendario. */
export function masteryRank(xp: number): MasteryRank {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  if (total >= MASTERY_30) {
    const legendary = Math.floor((total - MASTERY_30) / LEGENDARY_STEP);
    return { rank: 30, legendary, next: MASTERY_30 + LEGENDARY_STEP * (legendary + 1) - total };
  }
  let rank = Math.min(29, Math.floor(Math.sqrt(total / 2500)));
  // Contra el redondeo de la raíz: el rango es el mayor n con 2.500·n² ≤ puntos.
  while (2500 * (rank + 1) ** 2 <= total) rank++;
  while (rank > 0 && 2500 * rank ** 2 > total) rank--;
  return { rank, legendary: 0, next: 2500 * (rank + 1) ** 2 - total };
}

/** Lo tildado, leído del almacenamiento. Sin almacenamiento, con basura o con un error, un conjunto vacío. */
export function readChecked(storage: Storage | null): Set<string> {
  try {
    const raw = storage?.getItem(MASTERY_KEY);
    if (!raw) return new Set();
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return new Set();
    return new Set(data.filter((s): s is string => typeof s === "string"));
  } catch {
    return new Set();
  }
}

/** Guarda lo tildado. Si el almacenamiento no deja (modo privado, lleno), la página anda igual sin recordar. */
export function writeChecked(storage: Storage | null, checked: ReadonlySet<string>): void {
  try {
    storage?.setItem(MASTERY_KEY, JSON.stringify([...checked]));
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

/** El almacenamiento del navegador, o null si ni siquiera se puede nombrar (algunos navegadores tiran al acceder). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
