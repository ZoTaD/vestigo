import {
  balancear, damageOf, desbalancear, vectorsFor, type ItemMeta, type PlayerRow,
} from "./features";
import { asignar, elegirK, MIN_CUOTA } from "./archetypes";
import { unlockOrderFromSequences } from "./abilities";

/**
 * De jugadores a builds publicables, vía Archetypal Analysis.
 *
 * **Reemplaza a la firma hecha a mano** —héroe + tipo de daño + habilidad
 * imbuida— que agrupaba desde el 2026-07-30. Esa firma no fallaba por simple:
 * fallaba por incompleta. No miraba **qué sube el jugador**, así que un McGinnis
 * que maxea el muro y uno que maxea la torreta caían en el mismo grupo si
 * compraban parecido, y la tarjeta les mostraba la misma build a dos formas
 * distintas de jugar.
 *
 * Lo que sale de acá tiene la forma que ya consumía el resto del pipeline, así
 * que el pareo, el mecanismo y los counters no se enteran del cambio: **AA cambia
 * cómo se agrupa, no cómo se mide**.
 */

/** Prevalencia mínima para que un objeto sea parte del núcleo de una build. */
export const CORE_PREVALENCIA = 0.15;

/** Cuántas formas de jugar puede publicar un héroe. Es lo que muestra la tarjeta. */
export const MAX_ARQUETIPOS = 3;

export interface ArchetypeGroup {
  heroId: number;
  damage: "weapon" | "spirit" | "vitality";
  ability: number;
  matches: number;
  winRate: number;
  /** "id:prevalencia,..." — el mismo texto que producía SQL. */
  core: string;
  /**
   * El orden de subida medido sobre **los miembros de este arquetipo**.
   *
   * Es la mitad que faltaba: sin esto las habilidades entraban al vector que
   * agrupa pero el orden que se publicaba venía de otra fuente que no sabe de
   * arquetipos, así que dos builds del mismo héroe mostraban el orden idéntico
   * aunque AA las hubiera separado justamente por lo que maxean.
   */
  abilityOrder: number[];
  /** El paso a paso, con repeticiones. Misma población que `abilityOrder`. */
  abilityPath: number[];
  /**
   * Cuán puros son los suyos: el peso medio del arquetipo entre sus jugadores.
   *
   * Se publica porque **una build armada con gente que apenas la juega merece
   * leerse distinto que una armada con puristas**. Con 0,9 la build describe a su
   * gente; con 0,45 esa gente está a mitad de camino de otra.
   */
  commitment: number;
}

/** El valor que más se repite; 0 si no hay ninguno. */
function modal(valores: number[]): number {
  const cuenta = new Map<number, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor = 0;
  let mejorN = 0;
  // Se recorre ordenado para que un empate no dependa del orden de inserción.
  for (const [v, n] of [...cuenta].sort((a, b) => a[0] - b[0])) {
    if (n > mejorN) { mejorN = n; mejor = v; }
  }
  return mejor;
}

export interface OpcionesGrupo {
  maxK?: number;
  /** Partidas mínimas para que un arquetipo se publique. */
  minGroup?: number;
  minCuota?: number;
}

/**
 * Los arquetipos de UN héroe.
 *
 * Devuelve la lista vacía —y eso es una respuesta, no un error— cuando el héroe
 * no llega a la muestra mínima o cuando no hay ni un objeto que se construya lo
 * suficiente como para describir una build.
 *
 * **`jugadores` tiene que venir en un orden estable.** El ajuste de AA toma una
 * submuestra de paso fijo, así que el orden decide cuáles filas entran: con las
 * filas llegando en el orden que quiso SQL, dos corridas sobre los mismos datos
 * dieron 81 y 90 arquetipos. Quien llame a esto ordena; `builds.ts` lo hace por
 * `pid` en la propia consulta.
 */
export function archetypesForHero(
  jugadores: PlayerRow[],
  items: Map<number, ItemMeta>,
  opts: OpcionesGrupo = {}
): ArchetypeGroup[] {
  const maxK = opts.maxK ?? MAX_ARQUETIPOS;
  const minGroup = opts.minGroup ?? 150;
  if (jugadores.length < minGroup) return [];

  const crudo = vectorsFor(jugadores, items);
  if (crudo.columns.length === 0 || crudo.X.length === 0) return [];
  const v = balancear(crudo);
  const { k, decomp } = elegirK(v.X, maxK, {
    unscale: (Z) => desbalancear(Z, crudo),
    minCuota: opts.minCuota ?? MIN_CUOTA,
  });
  const asign = asignar(decomp.A);

  const out: ArchetypeGroup[] = [];
  for (let a = 0; a < k; a++) {
    const idx = asign.map((x, i) => (x.archetype === a ? i : -1)).filter((i) => i >= 0);
    if (idx.length < minGroup) continue;
    const miembros = idx.map((i) => jugadores[i]);

    const cuenta = new Map<number, number>();
    for (const m of miembros) for (const id of new Set(m.items)) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    const core = [...cuenta.entries()]
      .map(([id, c]) => ({ id, prev: c / miembros.length }))
      .filter((x) => x.prev >= CORE_PREVALENCIA)
      .sort((x, y) => y.prev - x.prev || x.id - y.id);
    if (core.length === 0) continue;

    const subidas = unlockOrderFromSequences(
      miembros.map((m) => m.abilitySeq ?? []).filter((s) => s.length > 0)
    );

    out.push({
      heroId: miembros[0].heroId,
      damage: damageOf(core.map((c) => c.id), items) as "weapon" | "spirit" | "vitality",
      ability: modal(miembros.map((m) => m.imbued).filter((x) => x > 0)),
      matches: miembros.length,
      winRate: miembros.filter((m) => m.won).length / miembros.length,
      core: core.map((c) => `${c.id}:${c.prev.toFixed(4)}`).join(","),
      abilityOrder: subidas.order,
      abilityPath: subidas.path,
      commitment: idx.reduce((s, i) => s + asign[i].commitment, 0) / idx.length,
    });
  }
  // Por partidas, que es como la tarjeta ordena las pestañas: la más jugada primero.
  return out.sort((a, b) => b.matches - a.matches);
}
