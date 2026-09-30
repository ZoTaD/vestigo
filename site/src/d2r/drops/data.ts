/**
 * Los datos de la calculadora de drops (2026-09-29), indexados una sola vez:
 * las cadenas de TCs para la mejora por nivel y los únicos y piezas de cada
 * base para el sorteo. `indexData` también sirve para datos de prueba.
 */
import raw from "@d2r/drops/drops.json";
import type { DropArea, DropData, DropSetItem, DropSource, DropUnique } from "./types";

export interface Indexed extends DropData {
  /**
   * De cada TC con grupo, la cadena de filas contiguas de la tabla con el mismo grupo, que es la que recorre el
   * juego al mejorarla (todas las de la cadena apuntan a la misma lista). El número de grupo se reusa en filas que
   * no son contiguas (otra cadena, muchas veces de otra dificultad): lo que separa una cadena de otra es el corte, no
   * la dificultad. Una cadena contigua sí puede cruzar dificultades: 19 de las 82 lo hacen, por ejemplo la de los
   * cofres, de "Act 1 Chest A" a "Act 5 (H) Chest C" (45 filas).
   */
  chains: Map<string, string[]>;
  uniqueByKey: Map<string, DropUnique>;
  uniqueById: Map<string, DropUnique>;
  setByKey: Map<string, DropSetItem>;
  setById: Map<string, DropSetItem>;
  /** Los que entran al sorteo de cada base (sin los que sólo salen por nombre). */
  uniquesByCode: Map<string, DropUnique[]>;
  setsByCode: Map<string, DropSetItem[]>;
  areaById: Map<number, DropArea>;
  sourceById: Map<string, DropSource>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

export function indexData(d: DropData): Indexed {
  // El orden de `d.tcs` es el de la tabla. Una fila sin grupo o de otro grupo corta la cadena.
  const chains = new Map<string, string[]>();
  let run: string[] = [];
  let runGroup = 0;
  for (const [name, tc] of Object.entries(d.tcs)) {
    if (!tc.g) {
      runGroup = 0;
      continue;
    }
    if (tc.g !== runGroup) {
      run = [];
      runGroup = tc.g;
    }
    run.push(name);
    chains.set(name, run);
  }
  const uniquesByCode = new Map<string, DropUnique[]>();
  for (const u of d.uniques) if (!u.f && u.rar > 0) push(uniquesByCode, u.code, u);
  const setsByCode = new Map<string, DropSetItem[]>();
  for (const x of d.sets) if (x.rar > 0) push(setsByCode, x.code, x);
  // Las Facetas de arcoíris comparten nombre: ninguna sale por nombre, así que alcanza con la primera.
  const uniqueByKey = new Map<string, DropUnique>();
  for (const u of d.uniques) if (!uniqueByKey.has(u.key)) uniqueByKey.set(u.key, u);
  return {
    ...d,
    chains,
    uniquesByCode,
    setsByCode,
    uniqueByKey,
    uniqueById: new Map(d.uniques.map((u) => [u.id, u])),
    setByKey: new Map(d.sets.map((x) => [x.key, x])),
    setById: new Map(d.sets.map((x) => [x.id, x])),
    areaById: new Map(d.areas.map((a) => [a.id, a])),
    sourceById: new Map(d.sources.map((s) => [s.id, s])),
  };
}

let cache: Indexed | null = null;
/** Los datos del juego, indexados la primera vez que se piden. */
export const dropData = (): Indexed => (cache ??= indexData(raw as unknown as DropData));
