/**
 * El cálculo del Planificador de Valheim (2026-09-25), sin React.
 *
 * Pedido de ZoTaD: eliges lo que quieres fabricar, con nivel y cantidad, y te
 * dice cuánto juntar de cada cosa y dónde. Los datos salen de
 * `games/valheim/data/site/planner.json` (`pipeline/planner.py`). Diseño:
 * docs/design/2026-09-25-valheim-planificador.md.
 */
import { BIOME_IDS, type BiomeId, type Txt } from "./valheimData";

export type PlanCat = "weapons" | "armor" | "tools" | "foods" | "meads" | "materials" | "building" | "bosses";
export const PLAN_CATS: PlanCat[] = ["weapons", "armor", "tools", "foods", "meads", "materials", "building", "bosses"];

export interface PItem { name: Txt; icon: string | null; weight: number; tier: BiomeId | null; slug: string | null; tab: string | null; cat?: PlanCat; maxQ?: number }
export type PReq = [id: string, amount: number, perLevel: number];
/** `post`: la estación donde se termina (lo fundido del Norte profundo va a la fundición helada). */
export interface PRecipe { st: string | null; lv: number; n: number; req: PReq[]; any?: boolean; post?: string }
export interface PConvert { st: string; from: string; time: number | null; n: number; fuel?: [id: string, perProduct: number] }
export interface PSource { how: string; biomes: BiomeId[]; name: Txt | null; slug?: string | null; tab?: string | null; chance?: number; min?: number; max?: number; price?: number }
export interface PStation { name: Txt; icon: string | null; slug: string | null; tab: string | null }
export interface PlannerData {
  items: Record<string, PItem>;
  recipes: Record<string, PRecipe>;
  convert: Record<string, PConvert[]>;
  sources: Record<string, PSource[]>;
  stations: Record<string, PStation>;
  prefer: Record<string, string>;
}

export interface Pick { id: string; qty: number; level: number }
/** La lista, el camino elegido para cada material y el ingrediente de las recetas de "uno cualquiera". */
export interface PlanState { picks: Pick[]; via: Record<string, string>; any: Record<string, string> }
export const EMPTY_PLAN: PlanState = { picks: [], via: {}, any: {} };

/** Cómo se consigue algo: fabricándolo, convirtiendo otra cosa (`from:IronScrap`) o juntándolo tal cual. */
export type Via = "craft" | "raw" | `from:${string}`;

/** La carga de un vikingo sin cinturón ni efectos. */
export const CARRY = 300;
export const MAX_QTY = 999;

export function viaOptions(d: PlannerData, id: string): Via[] {
  const out: Via[] = [];
  if (d.recipes[id]) out.push("craft");
  for (const c of d.convert[id] ?? []) out.push(`from:${c.from}`);
  if (d.sources[id]?.length) out.push("raw");
  return out;
}

/** El camino de un material: el elegido, el preferido del pipeline o el primero que haya. */
export function viaOf(d: PlannerData, st: PlanState, id: string): Via {
  const opts = viaOptions(d, id) as string[];
  for (const v of [st.via[id], d.prefer[id]]) if (v && opts.includes(v)) return v as Via;
  return (opts[0] as Via | undefined) ?? "raw";
}

export interface Step {
  id: string;
  qty: number;
  made: number;
  batches: number;
  st: string | null;
  lv: number;
  inputs: [string, number][];
  /** Segundos de estación (conversiones). */
  time: number;
  /** Quema combustible (fundición, alto horno, refinería). */
  fuel: boolean;
  /** La estación donde se termina, si hay una. */
  post: string | null;
}

/**
 * Una vuelta de receta o de conversión para `qty` de `id`. En una receta, el
 * nivel suma las mejoras como el juego (`Piece.Requirement.GetAmount`):
 * fabricar cuesta `amount` y subir al nivel k cuesta `perLevel × (k − 1)`.
 */
export function stepFor(d: PlannerData, st: PlanState, id: string, qty: number, via: Via, level = 1): Step | null {
  if (via === "craft") {
    const r = d.recipes[id];
    if (!r) return null;
    const batches = Math.ceil(qty / r.n);
    const reqs = r.any && r.req.length ? [r.req.find((q) => q[0] === st.any[id]) ?? r.req[0]] : r.req;
    const ups = (level * (level - 1)) / 2;
    const inputs: [string, number][] = [];
    for (const [rid, amount, perLevel] of reqs) {
      const n = amount * batches + perLevel * ups * qty;
      if (n > 0) inputs.push([rid, n]);
    }
    return { id, qty, made: batches * r.n, batches, st: r.st, lv: r.lv + level - 1, inputs, time: 0, fuel: false, post: r.post ?? null };
  }
  if (via.startsWith("from:")) {
    const from = via.slice(5);
    const c = (d.convert[id] ?? []).find((x) => x.from === from);
    if (!c) return null;
    const batches = Math.ceil(qty / c.n);
    const inputs: [string, number][] = [[from, batches]];
    if (c.fuel) inputs.push([c.fuel[0], c.fuel[1] * batches]);
    return { id, qty, made: batches * c.n, batches, st: c.st, lv: 1, inputs, time: (c.time ?? 0) * batches, fuel: !!c.fuel, post: null };
  }
  return null;
}

/** Lo elegido siempre se fabrica: si su camino es "juntarlo", va el primero que lo fabrica. */
function makeVia(d: PlannerData, st: PlanState, id: string): Via | null {
  const v = viaOf(d, st, id);
  return v !== "raw" ? v : viaOptions(d, id).find((o) => o !== "raw") ?? null;
}

export interface Need { id: string; qty: number }
export interface Plan {
  /** Lo que va a la mesa, con para qué objetos de la lista. */
  table: (Need & { for: string[] })[];
  /** Lo que hay que salir a juntar, de mayor a menor. */
  raw: Need[];
  /** Cada fundición, cocción o fabricación intermedia, sumada. */
  steps: Step[];
  /** Estación → nivel más alto que se pide. */
  stations: [string, number][];
  weight: number;
  trips: number;
  fuelMinutes: number;
  biomes: BiomeId[];
  leftovers: { id: string; asked: number; made: number }[];
}

export function plan(d: PlannerData, st: PlanState): Plan {
  const table = new Map<string, { qty: number; for: string[] }>();
  const stations = new Map<string, number>();
  const bump = (s: string | null, lv: number) => { if (s) stations.set(s, Math.max(stations.get(s) ?? 0, lv)); };
  const leftovers: Plan["leftovers"] = [];
  for (const p of st.picks) {
    const via = makeVia(d, st, p.id);
    const s = via ? stepFor(d, st, p.id, p.qty, via, p.level) : null;
    if (!s) continue;
    bump(s.st, s.lv);
    bump(s.post, 1);
    if (s.made > p.qty) leftovers.push({ id: p.id, asked: p.qty, made: s.made });
    for (const [id, n] of s.inputs) {
      const e = table.get(id) ?? { qty: 0, for: [] };
      e.qty += n;
      if (!e.for.includes(p.id)) e.for.push(p.id);
      table.set(id, e);
    }
  }

  // Orden topológico por el camino elegido: cada material se procesa una vez,
  // con toda su demanda junta (así las tandas se redondean una sola vez). Un
  // ciclo se corta ahí: ese material se junta tal cual.
  const mark = new Map<string, 1 | 2>();
  const cut = new Set<string>();
  const order: string[] = [];
  const kids = (id: string) => {
    const s = stepFor(d, st, id, 1, viaOf(d, st, id));
    return s ? s.inputs.map((x) => x[0]) : [];
  };
  const visit = (id: string) => {
    const m = mark.get(id);
    if (m === 2) return;
    if (m === 1) { cut.add(id); return; }
    mark.set(id, 1);
    for (const c of kids(id)) visit(c);
    mark.set(id, 2);
    order.push(id);
  };
  for (const id of table.keys()) visit(id);
  order.reverse();

  const demand = new Map<string, number>([...table].map(([id, e]) => [id, e.qty]));
  const raw = new Map<string, number>();
  const done = new Set<string>();
  const steps: Step[] = [];
  const addRaw = (id: string, n: number) => raw.set(id, (raw.get(id) ?? 0) + n);
  for (const id of order) {
    done.add(id);
    const q = demand.get(id) ?? 0;
    if (!q) continue;
    const via = cut.has(id) ? "raw" : viaOf(d, st, id);
    const s = via === "raw" ? null : stepFor(d, st, id, q, via);
    if (!s) { addRaw(id, q); continue; }
    steps.push(s);
    bump(s.st, s.lv);
    bump(s.post, 1);
    for (const [c, n] of s.inputs) {
      if (done.has(c)) addRaw(c, n);
      else demand.set(c, (demand.get(c) ?? 0) + n);
    }
  }

  const rawList = [...raw].map(([id, qty]) => ({ id, qty })).sort((a, b) => b.qty - a.qty || a.id.localeCompare(b.id));
  const weight = Math.round(rawList.reduce((w, n) => w + n.qty * (d.items[n.id]?.weight ?? 0), 0) * 10) / 10;
  const tiers = new Set(rawList.map((n) => d.items[n.id]?.tier).filter(Boolean));
  return {
    table: [...table].map(([id, e]) => ({ id, qty: e.qty, for: e.for })),
    raw: rawList,
    steps,
    stations: [...stations],
    weight,
    trips: Math.ceil(weight / CARRY),
    fuelMinutes: Math.round(steps.filter((s) => s.fuel).reduce((t, s) => t + s.time, 0) / 60),
    biomes: BIOME_IDS.filter((b) => tiers.has(b)),
    leftovers,
  };
}

export interface TreeNode { id: string; qty: number; st: string | null; per: number; kids: TreeNode[] }

/**
 * El desglose de un material para dibujarlo. Cada rama se calcula sola, así que
 * si dos ramas comparten una tanda (rarísimo) la suma puede diferir en una
 * tanda de "Para juntar", que sí junta la demanda.
 */
export function tree(d: PlannerData, st: PlanState, id: string, qty: number, path: string[] = []): TreeNode {
  const via = path.includes(id) || path.length > 8 ? "raw" : viaOf(d, st, id);
  const s = via === "raw" ? null : stepFor(d, st, id, qty, via);
  return {
    id, qty, st: s?.st ?? null, per: s ? s.made / s.batches : 1,
    kids: s ? s.inputs.map(([c, n]) => tree(d, st, c, n, [...path, id])) : [],
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo));

/** Sólo lo que está en el catálogo, con nivel y cantidad dentro de lo posible. */
export function sanitize(d: PlannerData, st: PlanState): PlanState {
  const picks = st.picks
    .filter((p) => d.items[p.id]?.cat)
    .map((p) => ({ id: p.id, qty: clamp(p.qty, 1, MAX_QTY), level: clamp(p.level, 1, d.items[p.id].maxQ ?? 1) }));
  return { ...st, picks };
}

export function addPick(st: PlanState, id: string): PlanState {
  const i = st.picks.findIndex((p) => p.id === id);
  if (i >= 0) return setPick(st, i, { qty: Math.min(MAX_QTY, st.picks[i].qty + 1) });
  return { ...st, picks: [...st.picks, { id, qty: 1, level: 1 }] };
}

export function setPick(st: PlanState, i: number, patch: Partial<Pick>): PlanState {
  const next = { ...st.picks[i], ...patch };
  const picks = next.qty > 0 ? st.picks.map((p, j) => (j === i ? next : p)) : st.picks.filter((_, j) => j !== i);
  return { ...st, picks };
}

export function setVia(st: PlanState, id: string, via: Via | null): PlanState {
  const next = { ...st.via };
  if (via) next[id] = via; else delete next[id];
  return { ...st, via: next };
}

export function setAny(st: PlanState, id: string, reqId: string): PlanState {
  return { ...st, any: { ...st.any, [id]: reqId } };
}

// La dirección: `l=HelmetIron.2,Sausages*10,piece:forge&via=Iron~from:IronOre&any=FishWraps~Fish2`.
const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ":");
const pairs = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${enc(k)}~${enc(v)}`).join(",");

export function encodePlan(st: PlanState): string {
  const parts: string[] = [];
  if (st.picks.length) parts.push("l=" + st.picks.map((p) => enc(p.id) + (p.level > 1 ? `.${p.level}` : "") + (p.qty > 1 ? `*${p.qty}` : "")).join(","));
  if (Object.keys(st.via).length) parts.push("via=" + pairs(st.via));
  if (Object.keys(st.any).length) parts.push("any=" + pairs(st.any));
  return parts.join("&");
}

const PICK_RE = /^(.+?)(?:\.(\d+))?(?:\*(\d+))?$/;

export function decodePlan(search: string): PlanState {
  const q = new URLSearchParams(search);
  const picks: Pick[] = [];
  for (const tok of (q.get("l") ?? "").split(",")) {
    const m = PICK_RE.exec(tok.trim());
    if (m) picks.push({ id: m[1], level: m[2] ? Number(m[2]) : 1, qty: m[3] ? Number(m[3]) : 1 });
  }
  const read = (k: string) => {
    const o: Record<string, string> = {};
    for (const tok of (q.get(k) ?? "").split(",")) {
      const i = tok.indexOf("~");
      if (i > 0) o[tok.slice(0, i)] = tok.slice(i + 1);
    }
    return o;
  };
  return { picks, via: read("via"), any: read("any") };
}
