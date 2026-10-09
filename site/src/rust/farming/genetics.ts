/**
 * La genética de las plantas de Rust (2026-10-09), sin React. Copia la lógica del juego (decompilado público
 * github.com/MillionthOdin16/RustChangelog, `GrowableGenetics.CrossBreed` y `GrowableEntity`; ver
 * `games/rust/tools/farming_overrides.py`):
 *
 * - Cada planta tiene 6 genes. Cuando la central pasa a la etapa de cruza, por cada casillero se suman los pesos de
 *   cruza de las vecinas (misma planta, misma jardinera, vivas, a ≤ 1,5 m), agrupados por gen. Las sumas van en float
 *   de 32 bits, como en el juego: cinco verdes (5 × 0,6) empatan con tres rojos (3 × 1).
 * - Gana el gen de suma más alta. En un empate gana el primero que llega a esa suma recorriendo la lista de vecinas
 *   (`>` estricto), es decir el gen cuya última vecina aparece antes. El orden de la lista es el de la consulta física
 *   del juego y no se puede saber: acá todos los órdenes valen lo mismo, y el empate se vuelve probabilidad. El mismo
 *   orden vale para los 6 casilleros, así que los empates de distintos casilleros no son independientes: se recorre
 *   cada orden posible de las vecinas.
 * - El ganador reemplaza al gen de la central sólo si su suma es mayor que el peso de cruza del gen que ya tenía.
 */
export type Gene = "X" | "W" | "G" | "Y" | "H";
export const GENES: Gene[] = ["X", "W", "G", "Y", "H"];
/** Los pesos de cruza del juego (`GrowableGeneProperties`, `generic.genes`). Los pasa la pestaña desde los datos. */
export type CrossWeights = Record<Gene, number>;
export const SLOTS = 6;
export const MAX_NEIGHBOURS = 8;
export const POSITIVE: Record<Gene, boolean> = { X: false, W: false, G: true, Y: true, H: true };

/** "gggyyy" → ["G","G","G","Y","Y","Y"]; null si no son 6 letras de gen. */
export function parseGenes(s: string): Gene[] | null {
  const up = s.trim().toUpperCase();
  if (!/^[XWGYH]{6}$/.test(up)) return null;
  return [...up] as Gene[];
}

export const geneString = (g: readonly Gene[]): string => g.join("");

const f32 = Math.fround;

/**
 * Para un casillero: cuánto suma cada gen entre las vecinas (en float 32, como el juego) y quiénes empatan arriba.
 * Sin vecinas, nadie gana.
 */
function slotTally(neigh: Gene[], w: CrossWeights): { top: number; tied: Gene[]; counts: Map<Gene, number> } {
  const sums = new Map<Gene, number>();
  const counts = new Map<Gene, number>();
  for (const g of neigh) {
    sums.set(g, f32((sums.get(g) ?? 0) + f32(w[g])));
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let top = 0;
  for (const v of sums.values()) if (v > top) top = v;
  const tied = GENES.filter((g) => sums.get(g) === top && top > 0);
  return { top, tied, counts };
}

/**
 * Entre los genes empatados, la probabilidad de que cada uno complete primero su suma, con todos los órdenes de las
 * vecinas igual de probables: gana el grupo cuya última vecina aparece antes. Con grupos de distinto tamaño (5 verdes
 * contra 3 rojos) no es mitad y mitad.
 */
export function tieOdds(sizes: number[]): number[] {
  const memo = new Map<string, number[]>();
  const go = (rest: number[]): number[] => {
    const key = rest.join(",");
    const hit = memo.get(key);
    if (hit) return hit;
    const total = rest.reduce((a, b) => a + b, 0);
    const out = rest.map(() => 0);
    for (let i = 0; i < rest.length; i++) {
      if (!rest[i]) continue;
      const p = rest[i] / total;
      if (rest[i] === 1) {
        out[i] += p;
        continue;
      }
      const next = rest.slice();
      next[i]--;
      const sub = go(next);
      for (let j = 0; j < out.length; j++) out[j] += p * sub[j];
    }
    memo.set(key, out);
    return out;
  };
  return go(sizes);
}

export interface SlotOdds {
  /** Gen → probabilidad de quedar en ese casillero. */
  odds: Partial<Record<Gene, number>>;
  /** La suma que ganó y si alcanzó para cambiar el gen de la central. */
  top: number;
  changes: boolean;
  tied: Gene[];
}

/** El resultado de un casillero, solo (los empates de cada casillero por separado). */
export function crossSlot(center: Gene, neigh: Gene[], w: CrossWeights): SlotOdds {
  const { top, tied, counts } = slotTally(neigh, w);
  const changes = tied.length > 0 && top > f32(w[center]);
  if (!changes) return { odds: { [center]: 1 }, top, changes, tied };
  const odds: Partial<Record<Gene, number>> = {};
  const p = tieOdds(tied.map((g) => counts.get(g)!));
  tied.forEach((g, i) => (odds[g] = (odds[g] ?? 0) + p[i]));
  return { odds, top, changes, tied };
}

export interface Outcome {
  genes: string;
  p: number;
}

export interface CrossResult {
  slots: SlotOdds[];
  /** Los resultados posibles, del más probable al menos. */
  outcomes: Outcome[];
}

/**
 * La cruza entera. Si ningún casillero empata, sale un solo resultado. Si alguno empata, se recorren todos los órdenes
 * de las vecinas (a lo sumo 8! = 40.320, menos si hay vecinas iguales) y se cuenta qué deja cada uno en los 6 casilleros a la vez.
 */
export function crossBreed(center: Gene[], neighbours: Gene[][], w: CrossWeights): CrossResult {
  const n = neighbours.slice(0, MAX_NEIGHBOURS);
  const slots = center.map((c, i) => crossSlot(c, n.map((g) => g[i]), w));
  const tiedSlots = slots.map((s, i) => (s.changes && s.tied.length > 1 ? i : -1)).filter((i) => i >= 0);
  const sure = slots.map((s, i) => (s.changes ? s.tied[0] : center[i]));
  if (!tiedSlots.length) return { slots, outcomes: [{ genes: geneString(sure), p: 1 }] };

  // Las vecinas iguales son intercambiables: alcanza con recorrer los órdenes distintos del multiconjunto (cada uno sale
  // de la misma cantidad de permutaciones completas, así que todos pesan lo mismo).
  const kinds = [...new Map(n.map((g) => [geneString(g), g])).values()];
  const left = kinds.map((k) => n.filter((g) => geneString(g) === geneString(k)).length);
  const seq: Gene[][] = [];
  const tally = new Map<string, number>();
  let total = 0;
  const walk = () => {
    if (seq.length === n.length) {
      const res = sure.slice();
      for (const s of tiedSlots) res[s] = winnerInOrder(seq.map((g) => g[s]), slots[s].tied, w);
      const key = geneString(res);
      tally.set(key, (tally.get(key) ?? 0) + 1);
      total++;
      return;
    }
    for (let k = 0; k < kinds.length; k++) {
      if (!left[k]) continue;
      left[k]--;
      seq.push(kinds[k]);
      walk();
      seq.pop();
      left[k]++;
    }
  };
  walk();
  const outcomes = [...tally].map(([genes, c]) => ({ genes, p: c / total })).sort((a, b) => b.p - a.p || (a.genes < b.genes ? -1 : 1));
  return { slots, outcomes };
}

/** El gen que gana en un orden dado, recorriendo como el juego: el primero cuya suma supera a la mejor hasta ahí. */
function winnerInOrder(seq: Gene[], tied: Gene[], w: CrossWeights): Gene {
  const sums = new Map<Gene, number>();
  let best = 0;
  let who: Gene = tied[0];
  for (const g of seq) {
    const v = f32((sums.get(g) ?? 0) + f32(w[g]));
    sums.set(g, v);
    if (v > best) {
      best = v;
      who = g;
    }
  }
  return who;
}

export const countOf = (g: readonly Gene[], gene: Gene): number => g.filter((x) => x === gene).length;

/** Lo que hace falta de una planta para calcular sus números (de `farming.json`). */
export interface PlantStats {
  stages: { minutes: number; yield: number; resources: number; fixed?: true }[];
  water: number;
  harvest: { mult: number };
  clones: number;
  market: number;
}
export interface GeneRules {
  growthPerG: number;
  yieldPerY: number;
  waterPerW: number;
  marketPerGene: number;
}

/**
 * Minutos de semilla a madura (hasta el final de la etapa de fruto) con calidad perfecta: las etapas que no dependen de
 * las condiciones (`IgnoreConditions`, la de cruza) no se aceleran; las demás van 1 + 0,25 × G más rápido.
 */
export function ripeMinutes(p: PlantStats, genes: readonly Gene[], r: GeneRules): number {
  const speed = 1 + countOf(genes, "G") * r.growthPerG;
  return p.stages.slice(0, 6).reduce((t, s) => t + (s.fixed ? s.minutes : s.minutes / speed), 0);
}

/** Lo que da al cosechar con calidad perfecta: (recursos de la etapa madura + fruto × (1 + 0,25 × Y)) × multiplicador. */
export function harvestAmount(p: PlantStats, genes: readonly Gene[], r: GeneRules): number {
  const ripe = p.stages[6];
  const fruit = p.stages[5];
  return Math.round((ripe.resources + fruit.yield * (1 + countOf(genes, "Y") * r.yieldPerY)) * p.harvest.mult);
}

/** Clones al cortar: los de base + uno cada dos Y. */
export const cloneCount = (p: PlantStats, genes: readonly Gene[]): number => p.clones + Math.floor(countOf(genes, "Y") / 2);

/** Agua por actualización (por minuto): × (1 + 0,1 × W). */
export const waterUse = (p: PlantStats, genes: readonly Gene[], r: GeneRules): number => p.water * (1 + countOf(genes, "W") * r.waterPerW);

/** El valor de venta: base + 10 por gen bueno − 10 por gen malo, nunca menos de 0. */
export function marketValue(p: PlantStats, genes: readonly Gene[], r: GeneRules): number {
  const good = genes.filter((g) => POSITIVE[g]).length;
  return Math.max(0, p.market + good * r.marketPerGene - (genes.length - good) * r.marketPerGene);
}

export interface Plan {
  center: string;
  neighbours: string[];
  p: number;
}

/**
 * El buscador: con los clones que tenés (cada uno se puede plantar las veces que haga falta), qué central y qué
 * vecinas dan el objetivo con más probabilidad, usando las menos vecinas posibles. Si ya tenés el objetivo, no hace
 * falta cruzar. Prueba de a una vecina más por vez (todas las combinaciones con repetición de ese tamaño) y corta en el
 * primer tamaño que llega seguro; una combinación con empates se calcula entera sólo si puede ganarle a la mejor que ya
 * hay (su probabilidad nunca pasa la del casillero menos probable). El orden: más probable, después menos vecinas.
 */
export function findPlans(target: Gene[], owned: Gene[][], w: CrossWeights, max = MAX_NEIGHBOURS, limit = 3): Plan[] {
  const goal = geneString(target);
  const uniq = [...new Map(owned.map((g) => [geneString(g), g])).values()];
  if (uniq.some((g) => geneString(g) === goal)) return [{ center: goal, neighbours: [], p: 1 }];
  const idx = (g: Gene) => GENES.indexOf(g);
  const wf = GENES.map((g) => f32(w[g]));
  const tg = target.map(idx);
  const ug = uniq.map((g) => g.map(idx));
  const sums = [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  const pick: number[] = [];
  const plans: Plan[] = [];
  let top = 0;

  /** La probabilidad de que un casillero quede en el gen objetivo, con las vecinas de `pick`, y si hubo empate. */
  const slotOdds = (c: number[], slot: number): [number, boolean] => {
    sums.fill(0);
    counts.fill(0);
    for (const k of pick) {
      const g = ug[k][slot];
      sums[g] = f32(sums[g] + wf[g]);
      counts[g]++;
    }
    let best = 0;
    for (const v of sums) if (v > best) best = v;
    const center = c[slot];
    if (!(best > wf[center])) return [center === tg[slot] ? 1 : 0, false];
    const tied: number[] = [];
    for (let g = 0; g < 5; g++) if (sums[g] === best) tied.push(g);
    const at = tied.indexOf(tg[slot]);
    if (at < 0) return [0, false];
    if (tied.length === 1) return [1, false];
    return [tieOdds(tied.map((g) => counts[g]))[at], true];
  };

  for (let size = 1; size <= max; size++) {
    for (let ci = 0; ci < ug.length; ci++) {
      const c = ug[ci];
      const walk = (from: number) => {
        if (pick.length === size) {
          let prod = 1;
          let min = 1;
          let tied = false;
          for (let slot = 0; slot < SLOTS; slot++) {
            const [q, t] = slotOdds(c, slot);
            if (!q) return;
            prod *= q;
            if (q < min) min = q;
            if (t) tied = true;
          }
          let p = prod;
          if (tied) {
            if (min <= top) return;
            const neigh = pick.map((k) => uniq[k]);
            p = crossBreed(uniq[ci], neigh, w).outcomes.find((o) => o.genes === goal)?.p ?? 0;
          }
          if (p > 0) {
            plans.push({ center: geneString(uniq[ci]), neighbours: pick.map((k) => geneString(uniq[k])), p });
            if (p > top) top = p;
          }
          return;
        }
        for (let k = from; k < ug.length; k++) {
          pick.push(k);
          walk(k);
          pick.pop();
        }
      };
      walk(0);
    }
    if (top >= 1) break;
  }
  plans.sort((a, b) => b.p - a.p || a.neighbours.length - b.neighbours.length);
  const out: Plan[] = [];
  for (const pl of plans) {
    if (out.length >= limit) break;
    if (!out.some((o) => o.p >= pl.p && o.neighbours.length <= pl.neighbours.length)) out.push(pl);
  }
  return out;
}
