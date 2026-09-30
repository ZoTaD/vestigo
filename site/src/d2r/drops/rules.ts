/**
 * Las reglas del juego que no dependen de un TC entero (2026-09-29), como las
 * documenta la guía oficial (`dataguide/docs/itemratio-calc.html`,
 * `treasureclassex.js`, `desecratedzones.js`): el NoDrop según los jugadores,
 * la chance de cada calidad, las condiciones, la Clasificación y la mejora de
 * TC. Las cuentas usan enteros donde el juego usa enteros, para dar lo mismo.
 */
import type { Indexed } from "./data";
import type { BaseItem, KillCtx, Ratio3, RatioRow, TcCond } from "./types";

/** Cuántos jugadores cuentan: vos y cada uno del grupo cerca tuyo enteros, el resto medio. */
export function playerExponent(players: number, party: number): number {
  return Math.floor(1 + (players - 1) / 2 + (party - 1) / 2);
}

/** El NoDrop con más jugadores: la chance de no soltar nada, elevada a N, con el truncado del juego. */
export function adjustNoDrop(noDrop: number, probSum: number, n: number): number {
  if (noDrop <= 0 || probSum <= 0 || n <= 1) return noDrop;
  const ratio = Math.pow(noDrop / (noDrop + probSum), n);
  return Math.trunc(probSum / (1 / ratio - 1));
}

/** El hallazgo mágico que cuenta: para único, conjunto y raro rinde cada vez menos pasado el 10%. */
export function effectiveMf(mf: number, quality: "u" | "s" | "r" | "m"): number {
  if (quality === "m" || mf <= 10) return 100 + mf;
  const dim = quality === "u" ? 250 : quality === "s" ? 500 : 600;
  return 100 + Math.trunc((mf * dim) / (mf + dim));
}

/** La chance de una calidad para una base de nivel qlvl que suelta un monstruo de nivel mlvl. */
export function qualityChance(r: Ratio3, quality: "u" | "s" | "r" | "m", mlvl: number, qlvl: number, mf: number, tcMod: number): number {
  const [rarity, divisor, min] = r;
  let chance = (rarity - Math.trunc((mlvl - qlvl) / divisor)) * 128;
  chance = Math.trunc((chance * 100) / effectiveMf(mf, quality));
  if (chance < min) chance = min;
  chance -= Math.trunc((chance * tcMod) / 1024);
  return chance <= 128 ? 1 : 128 / chance;
}

/** La fila de itemratio de una base: excepcional o élite, y de clase o no. */
export function ratioRow(rows: RatioRow[], b: BaseItem): RatioRow {
  return rows.find((r) => r.u === b.u && r.cl === b.cl) ?? rows[0];
}

/** Las siete condiciones que usa el juego (dificultad, aterrorizado, Heraldo y su nivel). */
export function condOk(c: TcCond | undefined, k: Pick<KillCtx, "diff" | "desec" | "herald" | "tier">): boolean {
  if (!c) return true;
  if (c.diff !== undefined && c.diff !== k.diff) return false;
  if (c.desec !== undefined && c.desec !== k.desec) return false;
  if (c.herald !== undefined && c.herald !== k.herald) return false;
  if (c.tier && (k.tier < c.tier[0] || k.tier > c.tier[1])) return false;
  return true;
}

/** Si algo exclusivo de Clasificación sale en esta partida. Pasada su última temporada exclusiva, sale en todas. */
export function ladderOk(lad: [number, number] | undefined, ladder: boolean, season: number): boolean {
  if (!lad || !lad[0]) return true;
  if (ladder) return season >= lad[0];
  return lad[1] > 0 && season > lad[1];
}

/**
 * La mejora de TC: recorre la cadena de filas contiguas con su mismo grupo, desde donde está hacia adelante, y
 * sube mientras el nivel de la siguiente no pase `level`. Nunca baja. Sólo cuenta la cadena y no todo el número de
 * grupo, porque el número se reusa en filas que no son contiguas (otra cadena, muchas veces de otra dificultad) y a
 * nivel alto saltaría a ella: la Condesa de Normal caía en la de Pesadilla. La cadena en sí sí puede cruzar
 * dificultades cuando sus filas son contiguas (19 de 82, como los cofres: de "Act 1 Chest A" a "Act 5 (H) Chest C").
 */
export function upgradeTc(D: Indexed, name: string, level: number): string {
  const chain = D.chains.get(name);
  if (!chain) return name;
  let best = name;
  for (let i = chain.indexOf(name) + 1; i < chain.length; i++) {
    if ((D.tcs[chain[i]].l ?? 0) > level) break;
    best = chain[i];
  }
  return best;
}
