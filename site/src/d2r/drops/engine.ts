/**
 * El motor exacto de la calculadora de drops (2026-09-29): la chance de que
 * una muerte suelte lo que buscás. Las reglas están en
 * docs/design/2026-09-29-d2r-calculadora-drops.md: tiradas positivas y
 * negativas, NoDrop según los jugadores, el tope de 6 ítems por muerte, la
 * calidad heredada (el máximo de la cadena), condiciones, Clasificación y el
 * sorteo del único o la pieza.
 *
 * El tope obliga a contar ítems: cada TC da una distribución sobre (cuántos
 * ítems generó, si ya salió el buscado), en `d[k*2 + h]`. Lo que no puede
 * llegar al buscado sólo suma ítems, y esa parte no depende de qué se busca:
 * se calcula una vez por contexto (`CountCache`) y la comparten todas las
 * búsquedas. Así "¿Dónde lo farmeo?" recorre cientos de lugares al instante.
 */
import type { Indexed } from "./data";
import { adjustNoDrop, condOk, ladderOk, playerExponent, qualityChance, ratioRow } from "./rules";
import type { DropSetItem, DropUnique, KillCtx, Q4, Settings, Target, TcEntry } from "./types";

/** El juego no suelta más de 6 ítems por muerte, pociones y oro incluidos. */
export const MAX_ITEMS = 6;
const NO_Q: Q4 = [0, 0, 0, 0];

export const maxQ = (a: Q4, b?: Q4): Q4 =>
  b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a;

export interface Roll {
  list: TcEntry[];
  noDrop: number;
  total: number;
}

/** Las entradas que pueden salir de un TC en esta muerte y el NoDrop ajustado por jugadores. */
export function rollOf(D: Indexed, name: string, kill: KillCtx, s: Settings): Roll {
  const tc = D.tcs[name];
  // Una sub-TC que no pasa su condición (o no es de esta partida) sale del sorteo con su Prob. En un TC de tiradas negativas sale
  // ANTES de contarlas (`negativeSequence` recorre esta lista), así que la entrada siguiente ocupa su lugar. Es lo que dice la guía
  // de datos del juego de ConditionCalc: "If this is a sub-treasure class, its Prob is completely removed from the roll". Y cambia
  // números: en los "Worldstone Shard Parent … A" (que cuelgan de los Uitem, Citem, Champ y
  // Super de Infierno) la tercera entrada, un TC de equipo, sale sólo así; ocupando su lugar, Pindleskin, Griswold y los campeones
  // y únicos de Infierno darían entre 0,6 y 2,5% menos. En los Heraldos da igual (sus entradas suman justo sus tiradas). Un test de
  // juguete (NegCond, d2rDropsEngine.test.ts) fija esta regla: cambiarla lo pone en rojo.
  const list = tc.e.filter(([t]) => {
    const sub = D.tcs[t];
    return !sub || (condOk(sub.c, kill) && ladderOk(sub.lad, s.ladder, s.season));
  });
  const sum = list.reduce((n, e) => n + e[1], 0);
  const noDrop = tc.p >= 0 ? adjustNoDrop(tc.nd ?? 0, sum, playerExponent(s.players, s.party)) : 0;
  return { list, noDrop, total: sum + noDrop };
}

/** Las tiradas negativas: cada entrada tantas veces como su Prob, en orden, hasta completar. */
export function negativeSequence(list: TcEntry[], picks: number): TcEntry[] {
  const out: TcEntry[] = [];
  for (const e of list) for (let i = 0; i < e[1] && out.length < picks; i++) out.push(e);
  return out;
}

const reachMemo = new WeakMap<Indexed, Map<string, Set<string>>>();
/**
 * Todo lo que puede salir de un TC (bases, oro y nombres), sin mirar condiciones. Devuelve el conjunto memoizado
 * mismo: de sólo lectura, para que ningún llamador pueda corromper la memoria.
 */
export function reach(D: Indexed, name: string): ReadonlySet<string> {
  let memo = reachMemo.get(D);
  if (!memo) reachMemo.set(D, (memo = new Map()));
  const hit = memo.get(name);
  if (hit) return hit;
  const out = new Set<string>();
  memo.set(name, out); // corta los ciclos
  for (const [t] of D.tcs[name]?.e ?? []) {
    if (D.tcs[t]) for (const x of reach(D, t)) out.add(x);
    else out.add(t);
  }
  return out;
}

/** Los nombres con que el buscado puede aparecer en un TC: su base y, si es único o pieza, su nombre. */
export function targetKeys(D: Indexed, t: Target): string[] {
  if (t.k === "b") return [t.code];
  const x = t.k === "u" ? D.uniqueById.get(t.id) : D.setById.get(t.id);
  return x ? [x.code, x.key] : [];
}

export function eligibleUniques(D: Indexed, code: string, kill: KillCtx, s: Settings): DropUnique[] {
  return (D.uniquesByCode.get(code) ?? []).filter((u) => u.lvl <= kill.mlvl && ladderOk(u.lad, s.ladder, s.season) && condOk(u.c, kill));
}

export function eligibleSets(D: Indexed, code: string, kill: KillCtx, s: Settings): DropSetItem[] {
  return (D.setsByCode.get(code) ?? []).filter((x) => x.lvl <= kill.mlvl && ladderOk(x.lad, s.ladder, s.season));
}

/** La chance en la hoja y sus dos partes: la calidad y cuál de los posibles sale (null si no aplica). */
export function leafParts(
  D: Indexed,
  target: Target,
  code: string,
  q: Q4,
  kill: KillCtx,
  s: Settings,
): { hit: number; quality: number | null; pick: number | null } {
  const none = { hit: 0, quality: null, pick: null };
  if (!D.bases[code]) {
    // Un único o una pieza nombrados en el TC salen con esa calidad, sin sorteo.
    const fu = D.uniqueByKey.get(code);
    if (fu) return { hit: target.k === "u" && target.id === fu.id ? 1 : 0, quality: null, pick: null };
    const fs = D.setByKey.get(code);
    if (fs) return { hit: target.k === "s" && target.id === fs.id ? 1 : 0, quality: null, pick: null };
    return none;
  }
  const base = D.bases[code];
  if (target.k === "b") return { hit: target.code === code ? 1 : 0, quality: null, pick: null };
  const wanted = target.k === "u" ? D.uniqueById.get(target.id) : D.setById.get(target.id);
  if (!wanted || wanted.code !== code || base.qf === 1) return none;
  const row = ratioRow(D.ratio, base);
  const pu = qualityChance(row.U, "u", kill.mlvl, base.q, s.mf, q[0]);
  const pool: { id: string; rar: number }[] = target.k === "u" ? eligibleUniques(D, code, kill, s) : eligibleSets(D, code, kill, s);
  const w = pool.find((x) => x.id === target.id)?.rar ?? 0;
  const sum = pool.reduce((n, x) => n + x.rar, 0);
  const pick = w && sum ? w / sum : 0;
  // La calidad de conjunto sólo se tira si falló la de único.
  const quality = target.k === "u" ? pu : (1 - pu) * qualityChance(row.S, "s", kill.mlvl, base.q, s.mf, q[1]);
  return { hit: quality * pick, quality, pick };
}

/** (ítems generados k, salió el buscado h) → probabilidad, en `d[k*2 + h]`. */
type Dist = Float64Array;

function itemDist(room: number, p: number): Dist {
  const d = new Float64Array((room + 1) * 2);
  if (room === 0) d[0] = 1;
  else {
    d[2] = 1 - p;
    d[3] = p;
  }
  return d;
}
/** Un ítem que no es el buscado: ocupa un lugar si queda. */
const OTHER_ITEM: Dist[] = Array.from({ length: MAX_ITEMS + 1 }, (_, room) => itemDist(room, 0));

/**
 * Corre las tiradas de un TC con `cap` lugares libres; `sub` da la distribución de cada entrada.
 * Sin tope (`limited` en falso) nada se corta: la cuenta de ítems se satura en `cap` y no bloquea.
 */
function runPicks(cap: number, picks: number, roll: Roll, sub: (e: TcEntry, room: number) => Dist, limited = true): Dist {
  let state = new Float64Array((cap + 1) * 2);
  state[0] = 1;
  const seq = picks >= 0 ? null : negativeSequence(roll.list, -picks);
  const n = seq ? seq.length : picks;
  const weights = seq ? null : roll.list.map((e) => e[1] / roll.total);
  const nodrop = seq || !roll.total ? 0 : roll.noDrop / roll.total;
  for (let i = 0; i < n; i++) {
    const next = new Float64Array((cap + 1) * 2);
    for (let used = 0; used <= cap; used++) {
      for (let h = 0; h < 2; h++) {
        const pi = state[used * 2 + h];
        if (!pi) continue;
        if ((limited && used === cap) || (!seq && !roll.total)) {
          next[used * 2 + h] += pi;
          continue;
        }
        if (nodrop) next[used * 2 + h] += pi * nodrop;
        const room = limited ? cap - used : cap;
        const count = seq ? 1 : roll.list.length;
        for (let j = 0; j < count; j++) {
          const e = seq ? seq[i] : roll.list[j];
          const w = pi * (seq ? 1 : weights![j]);
          const d = sub(e, room);
          for (let k = 0; k <= room; k++) {
            const miss = d[k * 2];
            const hit = d[k * 2 + 1];
            const to = Math.min(used + k, cap);
            if (miss) next[to * 2 + h] += w * miss;
            if (hit) next[to * 2 + 1] += w * hit;
          }
        }
      }
    }
    state = next;
  }
  return state;
}

/** Cuántos ítems da un TC que no puede dar el buscado: vale para cualquier búsqueda con el mismo contexto. */
class CountCache {
  private memo = new Map<string, Dist>();
  constructor(
    readonly D: Indexed,
    readonly kill: KillCtx,
    readonly s: Settings,
    readonly limited: boolean,
  ) {}
  dist(name: string, cap: number): Dist {
    const key = `${name}|${cap}`;
    let d = this.memo.get(key);
    if (!d) {
      const roll = rollOf(this.D, name, this.kill, this.s);
      d = runPicks(cap, this.D.tcs[name].p, roll, (e, room) => (this.D.tcs[e[0]] ? this.dist(e[0], room) : OTHER_ITEM[room]), this.limited);
      this.memo.set(key, d);
    }
    return d;
  }
}

const countCaches = new Map<string, CountCache>();
function countsFor(D: Indexed, kill: KillCtx, s: Settings, limited: boolean): CountCache {
  // Contar ítems no depende del nivel ni del MF: sólo de las condiciones, de los jugadores y del tope.
  const key = `${kill.diff}|${+kill.desec}|${+kill.herald}|${kill.tier}|${s.players}|${s.party}|${+s.ladder}|${s.season}|${+limited}`;
  let c = countCaches.get(key);
  if (!c || c.D !== D) countCaches.set(key, (c = new CountCache(D, kill, s, limited)));
  return c;
}

class Evaluator {
  private dists = new Map<string, Dist>();
  private leaves = new Map<string, number>();
  readonly keys: string[];
  constructor(
    readonly D: Indexed,
    readonly target: Target,
    readonly kill: KillCtx,
    readonly s: Settings,
    readonly counts: CountCache,
  ) {
    this.keys = targetKeys(D, target);
  }

  get limited(): boolean {
    return this.counts.limited;
  }

  reaches(name: string): boolean {
    if (!this.D.tcs[name]) return this.keys.includes(name);
    const r = reach(this.D, name);
    return this.keys.some((k) => r.has(k));
  }

  tcDist(name: string, cap: number, q: Q4): Dist {
    const qq = maxQ(q, this.D.tcs[name].q);
    const key = `${name}|${cap}|${qq}`;
    let d = this.dists.get(key);
    if (!d) {
      const roll = rollOf(this.D, name, this.kill, this.s);
      d = runPicks(cap, this.D.tcs[name].p, roll, (e, room) => this.entryDist(e, room, qq), this.limited);
      this.dists.set(key, d);
    }
    return d;
  }

  entryDist(e: TcEntry, room: number, q: Q4): Dist {
    const qe = maxQ(q, e[2]);
    if (this.D.tcs[e[0]]) return this.reaches(e[0]) ? this.tcDist(e[0], room, qe) : this.counts.dist(e[0], room);
    if (!this.keys.includes(e[0])) return OTHER_ITEM[room];
    return itemDist(room, this.leaf(e[0], qe));
  }

  leaf(code: string, q: Q4): number {
    const key = `${code}|${q}`;
    let p = this.leaves.get(key);
    if (p === undefined) this.leaves.set(key, (p = leafParts(this.D, this.target, code, q, this.kill, this.s).hit));
    return p;
  }

  root(): number {
    const d = this.tcDist(this.kill.tc, MAX_ITEMS, NO_Q);
    let p = 0;
    for (let k = 0; k <= MAX_ITEMS; k++) p += d[k * 2 + 1];
    return p;
  }
}

/**
 * La chance de que una muerte suelte al menos uno del buscado. `{ cap: false }` no aplica el tope de 6 ítems:
 * es lo que calcula Silospen, y sólo sirve para compararse con él.
 */
export function chancePerKill(D: Indexed, target: Target, kill: KillCtx, s: Settings, opts: { cap?: boolean } = {}): number {
  const tc = D.tcs[kill.tc];
  if (!tc || !condOk(tc.c, kill) || !ladderOk(tc.lad, s.ladder, s.season)) return 0;
  const ev = new Evaluator(D, target, kill, s, countsFor(D, kill, s, opts.cap !== false));
  if (!ev.reaches(kill.tc)) return 0;
  return ev.root();
}

export interface PathStep {
  tc: string;
  picks: number;
  /**
   * La chance de tomar este camino en una tirada del TC anterior. Es 1 en el primero y en las entradas de un TC con
   * tiradas negativas: esa tirada se hace siempre. No mira el tope de 6 ítems, que puede dejarla sin hacer (la
   * chance por muerte sí lo mira).
   */
  share: number;
}
export interface PathEnd {
  code: string;
  share: number;
  quality: number | null;
  pick: number | null;
}

/** El camino que más aporta, para "¿De dónde sale este número?". */
export function explainPath(D: Indexed, target: Target, kill: KillCtx, s: Settings): { steps: PathStep[]; end: PathEnd } | null {
  // La misma puerta que chancePerKill: un TC raíz que no pasa su condición o su Clasificación no suelta nada.
  const tc = D.tcs[kill.tc];
  if (!tc || !condOk(tc.c, kill) || !ladderOk(tc.lad, s.ladder, s.season)) return null;
  const ev = new Evaluator(D, target, kill, s, countsFor(D, kill, s, true));
  if (!ev.reaches(kill.tc)) return null;
  const steps: PathStep[] = [{ tc: kill.tc, picks: tc.p, share: 1 }];
  let name = kill.tc;
  let q = maxQ(NO_Q, tc.q);
  // El camino siempre baja y el grafo de TC no tiene ciclos: nunca tiene más pasos que TC hay.
  for (let guard = Object.keys(D.tcs).length; guard > 0; guard--) {
    const roll = rollOf(D, name, kill, s);
    // Con tiradas negativas nada se sortea: las entradas de la secuencia salen seguras y las demás nunca.
    const seq = D.tcs[name].p < 0 ? negativeSequence(roll.list, -D.tcs[name].p) : null;
    let best: { e: TcEntry; share: number; score: number } | null = null;
    for (const e of seq ? new Set(seq) : roll.list) {
      if (!ev.reaches(e[0])) continue;
      const d = ev.entryDist(e, MAX_ITEMS, q);
      let hit = 0;
      for (let k = 0; k <= MAX_ITEMS; k++) hit += d[k * 2 + 1];
      const share = seq ? 1 : e[1] / roll.total;
      // Una entrada que la secuencia repite se tira esas veces: pesa por cada una.
      const weight = seq ? seq.filter((x) => x === e).length : share;
      if (!best || weight * hit > best.score) best = { e, share, score: weight * hit };
    }
    // Si ninguna entrada aporta, el buscado no puede salir de acá: el camino sería inventado.
    if (!best || best.score === 0) return null;
    q = maxQ(q, best.e[2]);
    const next = best.e[0];
    if (!D.tcs[next]) {
      const parts = leafParts(D, target, next, q, kill, s);
      return { steps, end: { code: next, share: best.share, quality: parts.quality, pick: parts.pick } };
    }
    q = maxQ(q, D.tcs[next].q);
    steps.push({ tc: next, picks: D.tcs[next].p, share: best.share });
    name = next;
  }
  return null;
}
