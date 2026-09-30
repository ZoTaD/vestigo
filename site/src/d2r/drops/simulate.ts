/**
 * El simulador de la calculadora de drops (2026-09-29): "abrir el cofre" de N
 * runs con las mismas reglas que el motor exacto, sorteadas. La semilla va en
 * el enlace (mulberry32), así el mismo enlace da el mismo cofre y se puede
 * compartir. El test compara el sorteo con la cuenta exacta.
 */
import type { Indexed } from "./data";
import { MAX_ITEMS, eligibleSets, eligibleUniques, maxQ, negativeSequence, rollOf } from "./engine";
import { condOk, ladderOk, qualityChance, ratioRow } from "./rules";
import type { KillCtx, Q4, Settings, TcEntry } from "./types";

export type LootQuality = "unique" | "set" | "rare" | "magic" | "normal";
export interface Loot {
  code: string;
  q: LootQuality;
  /** El único o la pieza, si salió uno. */
  id?: string;
}

/** Generador con semilla: rápido y con buena distribución para esto. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { rar: number }>(list: T[], rnd: () => number): T | null {
  const total = list.reduce((n, x) => n + x.rar, 0);
  if (!total) return null;
  let r = rnd() * total;
  for (const x of list) {
    if (r < x.rar) return x;
    r -= x.rar;
  }
  return list[list.length - 1];
}

/** La calidad de una base, en el orden del juego: único, conjunto, raro, mágico, normal. */
export function rollItem(D: Indexed, code: string, q: Q4, kill: KillCtx, s: Settings, rnd: () => number): Loot {
  const b = D.bases[code];
  if (!b || b.qf === 1) return { code, q: "normal" };
  const row = ratioRow(D.ratio, b);
  if (rnd() < qualityChance(row.U, "u", kill.mlvl, b.q, s.mf, q[0])) {
    const u = pickWeighted(eligibleUniques(D, code, kill, s), rnd);
    // Único fallido: sale raro (o mágico, si la base no puede ser rara).
    return u ? { code, q: "unique", id: u.id } : { code, q: b.qf === 3 ? "magic" : "rare" };
  }
  if (rnd() < qualityChance(row.S, "s", kill.mlvl, b.q, s.mf, q[1])) {
    const x = pickWeighted(eligibleSets(D, code, kill, s), rnd);
    return x ? { code, q: "set", id: x.id } : { code, q: "magic" };
  }
  if (b.qf !== 3 && rnd() < qualityChance(row.R, "r", kill.mlvl, b.q, s.mf, q[2])) return { code, q: "rare" };
  if (b.qf >= 2 || rnd() < qualityChance(row.M, "m", kill.mlvl, b.q, s.mf, q[3])) return { code, q: "magic" };
  return { code, q: "normal" };
}

function runEntry(D: Indexed, e: TcEntry, q: Q4, kill: KillCtx, s: Settings, rnd: () => number, out: Loot[]) {
  const t = e[0];
  const qe = maxQ(q, e[2]);
  if (D.tcs[t]) return runTc(D, t, qe, kill, s, rnd, out);
  if (out.length >= MAX_ITEMS) return;
  if (t === "gld") return void out.push({ code: "gld", q: "normal" });
  if (!D.bases[t]) {
    const fu = D.uniqueByKey.get(t);
    if (fu) return void out.push({ code: fu.code, q: "unique", id: fu.id });
    const fs = D.setByKey.get(t);
    if (fs) return void out.push({ code: fs.code, q: "set", id: fs.id });
    return;
  }
  out.push(rollItem(D, t, qe, kill, s, rnd));
}

function runTc(D: Indexed, name: string, q: Q4, kill: KillCtx, s: Settings, rnd: () => number, out: Loot[]) {
  const tc = D.tcs[name];
  const qq = maxQ(q, tc.q);
  const { list, noDrop, total } = rollOf(D, name, kill, s);
  if (tc.p >= 0) {
    for (let i = 0; i < tc.p && out.length < MAX_ITEMS; i++) {
      let r = rnd() * total;
      if (r < noDrop) continue;
      r -= noDrop;
      for (const e of list) {
        if (r < e[1]) {
          runEntry(D, e, qq, kill, s, rnd, out);
          break;
        }
        r -= e[1];
      }
    }
  } else {
    for (const e of negativeSequence(list, -tc.p)) {
      if (out.length >= MAX_ITEMS) break;
      runEntry(D, e, qq, kill, s, rnd, out);
    }
  }
}

/** Lo que suelta una muerte. */
export function simulateKill(D: Indexed, kill: KillCtx, s: Settings, rnd: () => number): Loot[] {
  const out: Loot[] = [];
  const tc = D.tcs[kill.tc];
  if (tc && condOk(tc.c, kill) && ladderOk(tc.lad, s.ladder, s.season)) runTc(D, kill.tc, [0, 0, 0, 0], kill, s, rnd, out);
  return out;
}

/** Lo que sueltan N runs (una muerte cada una), siempre igual para la misma semilla. */
export function simulateRuns(D: Indexed, kill: KillCtx, s: Settings, runs: number, seed: number): Loot[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: runs }, () => simulateKill(D, kill, s, rnd));
}

/** ¿Es una runa? Sus códigos van de r01 (El) a r33 (Zod). */
export const isRune = (code: string): boolean => /^r\d\d$/.test(code);

/** Desde Ist (r24) las runas están entre lo más buscado. Las de abajo salen a montones: van al final para no tapar lo demás. */
const FIRST_WANTED_RUNE = "r24";

export interface LootSummary {
  /**
   * Únicos, piezas y runas, contados y ordenados de lo más buscado a lo menos:
   * 1. las runas desde Ist hacia arriba, la más alta primero;
   * 2. los únicos, los de más nivel primero y, a igual nivel, los que más salieron;
   * 3. las piezas de conjunto, igual;
   * 4. las demás runas, la más alta primero.
   */
  notable: { loot: Loot; count: number }[];
  rare: number;
  magic: number;
  normal: number;
  gold: number;
}

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/**
 * Cuenta lo que sueltan las runs: cada único, pieza y runa con las veces que salió, en el orden de `LootSummary.notable`, y de
 * lo demás sólo cuántos hay (raros, mágicos, normales y montones de oro). El nivel de un único o una pieza sale de `D`.
 */
export function summarize(D: Indexed, runs: Loot[][]): LootSummary {
  const notable = new Map<string, { loot: Loot; count: number }>();
  const sum: LootSummary = { notable: [], rare: 0, magic: 0, normal: 0, gold: 0 };
  for (const loot of runs.flat()) {
    const rune = isRune(loot.code);
    if (loot.q === "unique" || loot.q === "set" || rune) {
      const key = `${loot.q}|${loot.id ?? loot.code}`;
      const hit = notable.get(key);
      if (hit) hit.count++;
      else notable.set(key, { loot, count: 1 });
    } else if (loot.code === "gld") sum.gold++;
    else sum[loot.q as "rare" | "magic" | "normal"]++;
  }
  const group = (l: Loot) => (isRune(l.code) ? (l.code >= FIRST_WANTED_RUNE ? 0 : 3) : l.q === "unique" ? 1 : 2);
  const level = (l: Loot) => (l.id ? ((l.q === "unique" ? D.uniqueById : D.setById).get(l.id)?.lvl ?? 0) : 0);
  const key = (l: Loot) => l.id ?? l.code;
  sum.notable = [...notable.values()].sort((a, b) => {
    const [ga, gb] = [group(a.loot), group(b.loot)];
    if (ga !== gb) return ga - gb;
    // Cada runa sale una sola vez en la lista: sólo importa cuál es más alta.
    if (ga === 0 || ga === 3) return cmp(b.loot.code, a.loot.code);
    // El id desempata para que el orden no dependa de cuál salió primero.
    return level(b.loot) - level(a.loot) || b.count - a.count || cmp(key(a.loot), key(b.loot));
  });
  return sum;
}
