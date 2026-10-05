/**
 * El modelo de la calculadora de raideo de Rust (2026-10-05), sin React. Los datos (`raid.json`, de
 * `games/rust/tools/raid.py`) traen ya el daño por unidad de cada explosivo contra cada objetivo: acá sólo se divide la
 * vida, se busca la mezcla más barata en azufre y se lee y escribe la selección en la URL.
 *
 * Lo usan la pestaña Raideo, los bloques de las fichas de Objetos y el adelanto de la portada: `raid.json` pesa ~15 KB
 * y viaja en un chunk compartido.
 */
import raid from "@rust/raid.json";

export type Kind = "building" | "door" | "window" | "external" | "deployable";
export type Loc = { en: string; es: string | null };
export interface Explosive {
  id: string;
  slug: string;
  name: Loc;
  /** La probabilidad de que falle (carga de mochila, bean can): la cantidad no la cuenta, la página la avisa. */
  dud: number;
  cost: { sulfur: number; gunpowder: number; time: number; raw: Record<string, number> } | null;
}
export interface Target {
  id: string;
  kind: Kind;
  slug: string | null;
  item: string | null;
  icon: string;
  name: Loc;
  hp: number;
  /** Daño por unidad de cada explosivo que le hace algo. */
  dmg: Record<string, number>;
}
export type Selection = Record<string, number>;
export type Mix = { counts: Record<string, number>; sulfur: number };

export const EXPLOSIVES = raid.explosives as unknown as Explosive[];
export const TARGETS = raid.targets as unknown as Target[];
export const KINDS: Kind[] = ["building", "door", "window", "external", "deployable"];
const BY_ID = new Map(TARGETS.map((t) => [t.id, t]));
const BY_ITEM = new Map(TARGETS.filter((t) => t.item).map((t) => [t.item!, t]));
const EX_BY_ID = new Map(EXPLOSIVES.map((e) => [e.id, e]));
/** El tope de cantidad por objetivo en la selección: más que eso es un error de tipeo, no una base. */
export const MAX_QTY = 99;

export const targetForItem = (itemId: string) => BY_ITEM.get(itemId);
export const explosiveById = (id: string) => EX_BY_ID.get(id);

/** Cuántos hacen falta. El −1e-9 es el mismo de raid.py: un 2,0000000001 por redondeo no pide 3. */
export function hitsFor(t: Target, explosiveId: string): number | null {
  const d = t.dmg[explosiveId];
  return d && d > 0 ? Math.ceil(t.hp / d - 1e-9) : null;
}

const mixes = new Map<string, Mix | null>();

/**
 * La combinación de explosivos crafteables que rompe el objetivo con menos azufre. Programación dinámica sobre el daño,
 * en milésimas: `best[h]` es el azufre mínimo para hacer al menos `h`. raid.py redondea el daño a 3 decimales, así que
 * en milésimas la cuenta es exacta y da lo mismo que `hitsFor` (con centésimas, la bala explosiva contra madera pedía
 * una de más). Una pared blindada son 2.000.000 de estados × 6 explosivos (~20 ms): se calcula sólo cuando se pide y se
 * guarda.
 */
export function cheapestMix(t: Target): Mix | null {
  if (mixes.has(t.id)) return mixes.get(t.id)!;
  const opts = EXPLOSIVES.filter((e) => e.cost && t.dmg[e.id] > 0).map((e) => ({
    id: e.id,
    d: Math.max(1, Math.round(t.dmg[e.id] * 1000)),
    c: e.cost!.sulfur,
  }));
  let out: Mix | null = null;
  if (opts.length) {
    const H = Math.round(t.hp * 1000);
    const best = new Float64Array(H + 1).fill(Infinity);
    const pick = new Int8Array(H + 1).fill(-1);
    best[0] = 0;
    for (let h = 1; h <= H; h++) {
      for (let i = 0; i < opts.length; i++) {
        const v = best[Math.max(0, h - opts[i].d)] + opts[i].c;
        if (v < best[h]) {
          best[h] = v;
          pick[h] = i;
        }
      }
    }
    const counts: Record<string, number> = {};
    for (let h = H; h > 0; h = Math.max(0, h - opts[pick[h]].d)) counts[opts[pick[h]].id] = (counts[opts[pick[h]].id] ?? 0) + 1;
    out = { counts, sulfur: best[H] };
  }
  mixes.set(t.id, out);
  return out;
}

/** La selección entera con un solo explosivo; `null` si algún objetivo no se rompe con él. */
export function selectionCost(sel: Selection, explosiveId: string) {
  const ex = EX_BY_ID.get(explosiveId);
  if (!ex) return null;
  let count = 0;
  for (const [id, qty] of Object.entries(sel)) {
    const t = BY_ID.get(id);
    const n = t ? hitsFor(t, explosiveId) : null;
    if (n === null) return null;
    count += n * qty;
  }
  const c = ex.cost;
  return { count, sulfur: c ? c.sulfur * count : null, gunpowder: c ? c.gunpowder * count : null, time: c ? c.time * count : null };
}

/** La mezcla más barata de la selección: la de cada objetivo, por su cantidad. */
export function selectionMix(sel: Selection): Mix | null {
  const counts: Record<string, number> = {};
  let sulfur = 0;
  for (const [id, qty] of Object.entries(sel)) {
    const t = BY_ID.get(id);
    const m = t ? cheapestMix(t) : null;
    if (!m) return null;
    sulfur += m.sulfur * qty;
    for (const [e, n] of Object.entries(m.counts)) counts[e] = (counts[e] ?? 0) + n * qty;
  }
  return Object.keys(counts).length ? { counts, sulfur } : null;
}

/**
 * `?o=building.stone:2,door.hinged.metal` → { "building.stone": 2, "door.hinged.metal": 1 }. Lo desconocido se ignora, la
 * cantidad tiene que ser sólo dígitos (nada de "1e1" o "0x5") y un id repetido suma, con el tope de siempre.
 */
export function parseSelection(search: string): Selection {
  const raw = new URLSearchParams(search).get("o");
  const out: Selection = {};
  for (const part of (raw ?? "").split(",")) {
    const [id, q] = part.split(":");
    if (!BY_ID.has(id)) continue;
    if (q !== undefined && !/^\d+$/.test(q)) continue;
    const n = q === undefined ? 1 : Number(q);
    if (n > 0) out[id] = Math.min((out[id] ?? 0) + n, MAX_QTY);
  }
  return out;
}

/** La selección para la URL; vacía, sin `?`. Sólo ids conocidos y enteros de 1 a 99; la cantidad 1 no se escribe. */
export function formatSelection(sel: Selection): string {
  const parts = Object.entries(sel)
    .filter(([id, n]) => BY_ID.has(id) && Number.isInteger(n) && n >= 1 && n <= MAX_QTY)
    .map(([id, n]) => (n === 1 ? id : `${id}:${n}`));
  return parts.length ? `?o=${parts.join(",")}` : "";
}
