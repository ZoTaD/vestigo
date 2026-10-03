/**
 * El motor del Planificador de fabricación de Project Zomboid (2026-10-01), sin React. Diseño:
 * docs/design/2026-09-30-zomboid.md (Pestañas, 5). Mismo esquema que `valheimPlanner.ts`: el árbol se dibuja rama por
 * rama y los totales juntan la demanda de cada objeto antes de redondear sus tandas.
 *
 * Unidades: toda cantidad interna va en "unidades" = usos para un drenable (cordel: 5 por objeto lleno), objetos para
 * lo demás. Una línea pide usos de un drenable salvo `ic` (ItemCount); lo que sale de una receta sale lleno.
 */
import { own, type CIn, type CRecipe, type CraftData, type Loc } from "./data";
import { BUILD, isBuild, type CraftState } from "./state";

const EPS = 0.01;
const MAX_DEPTH = 12;
const TOL = 1e-9;

export const unitsPer = (d: CraftData, id: string): number => own(d.items, id)?.u ?? 1;
/** Unidades → objetos para mostrar: 8 usos de cordel son 2 cordeles. */
export const asItems = (d: CraftData, id: string, units: number): number => Math.ceil(units / unitsPer(d, id) - TOL);

export function lineUnits(d: CraftData, line: CIn, id: string): number {
  const n = line.on?.[id] ?? line.n;
  const u = d.items[id]?.u;
  return u && line.ic ? n * u : n;
}

export function outUnits(d: CraftData, r: CRecipe, id: string): number {
  let n = 0;
  for (const o of r.out) {
    if ("i" in o && o.i === id) n += o.n;
    else if ("m" in o && o.m.some(([out]) => out === id)) n += o.n;
  }
  return n * unitsPer(d, id);
}

/** Las opciones de una línea para fabricar `id`: si esa línea decide el resultado (itemMapper), sólo las que dan `id`. */
export function allowed(r: CRecipe, li: number, id: string | null): string[] {
  const line = r.in[li];
  if (id) {
    for (const o of r.out) {
      if (!("m" in o) || !o.mi.includes(li)) continue;
      const hit = o.m.find(([out]) => out === id);
      if (!hit) continue;
      if (hit[1].length) return line.o.filter((x) => hit[1].includes(x));
      const covered = new Set(o.m.flatMap(([, from]) => from));
      return line.o.filter((x) => !covered.has(x));
    }
  }
  return line.o;
}

const consumed = (l: CIn) => !l.k && !l.fl && !l.any;

/** Las recetas que tu personaje ya sabe: las de su profesión, sus rasgos gratis y los que elegiste. */
export function knownSet(d: CraftData, b: string | null): Set<string> {
  const out = new Set<string>();
  if (!b) return out;
  const [prof, ...picked] = b.split(".");
  const traits = new Set([...picked, ...(own(d.profs, prof)?.traits ?? [])]);
  for (const [rid, r] of Object.entries(d.recipes)) {
    const l = r.learn;
    if (l && (l.profs.includes(prof) || l.traits.some((t) => traits.has(t)))) out.add(rid);
  }
  return out;
}
export const knows = (d: CraftData, known: Set<string>, rid: string): boolean => !d.recipes[rid]?.learn || known.has(rid);
const eligible = (d: CraftData, known: Set<string>, rid: string) => knows(d, known, rid) && !d.recipes[rid].x;

export type Costs = Map<string, number>;

export function recipeCost(d: CraftData, c: Costs, r: CRecipe, id: string): number {
  const per = outUnits(d, r, id);
  if (!per) return Infinity;
  let sum = 0;
  r.in.forEach((line, li) => {
    if (!consumed(line)) return;
    let best = Infinity;
    for (const o of allowed(r, li, id)) best = Math.min(best, lineUnits(d, line, o) * (c.get(o) ?? 1));
    sum += best;
  });
  return sum / per + EPS;
}

/** Costo por unidad de cada objeto, con lo de siempre (sin lo que elegiste a mano). Punto fijo: los ciclos no cuelgan. */
export function costs(d: CraftData, known: Set<string>): Costs {
  const c: Costs = new Map();
  const open: string[] = [];
  for (const id of Object.keys(d.items)) {
    const recs = (d.makes[id] ?? []).filter((rid) => eligible(d, known, rid));
    if (!recs.length || d.items[id].f) c.set(id, 1 / unitsPer(d, id));
    else { c.set(id, Infinity); open.push(id); }
  }
  for (let round = 0; round < 64; round++) {
    let changed = false;
    for (const id of open) {
      for (const rid of d.makes[id]) {
        if (!eligible(d, known, rid)) continue;
        const v = recipeCost(d, c, d.recipes[rid], id);
        if (v < c.get(id)! - TOL) { c.set(id, v); changed = true; }
      }
    }
    if (!changed) break;
  }
  for (const id of open) if (!Number.isFinite(c.get(id)!)) c.set(id, 1 / unitsPer(d, id));
  return c;
}

export interface Ctx { known: Set<string>; c: Costs }
const cache = new WeakMap<CraftData, Map<string, Ctx>>();
/** El personaje y los costos, una vez por personaje: cambiar una receta o una cantidad no los recalcula. */
export function context(d: CraftData, st: CraftState): Ctx {
  let m = cache.get(d);
  if (!m) cache.set(d, (m = new Map()));
  const key = st.b ?? "";
  let ctx = m.get(key);
  if (!ctx) {
    const known = knownSet(d, st.b);
    ctx = { known, c: costs(d, known) };
    m.set(key, ctx);
  }
  return ctx;
}

function bestRecipe(d: CraftData, c: Costs, pool: string[], id: string): string {
  const lv = (rid: string) => (d.recipes[rid].sk ?? []).reduce((s, [, l]) => s + l, 0);
  return pool
    .map((rid) => ({ rid, cost: recipeCost(d, c, d.recipes[rid], id), lv: lv(rid) }))
    .sort((a, b) => (Math.abs(a.cost - b.cost) > TOL ? a.cost - b.cost : a.lv - b.lv || (a.rid < b.rid ? -1 : 1)))[0].rid;
}

export type LeafWhy = "raw" | "found" | "chosen" | "learn" | "undo" | "cycle";
export type Via = { recipe: string } | { why: LeafWhy };

export function viaOf(d: CraftData, st: CraftState, ctx: Ctx, id: string, root: boolean): Via {
  // Los ids de `st` vienen del link: sólo claves propias de los datos, aunque no haya pasado por `sanitize`.
  if (isBuild(id)) return own(d.recipes, id.slice(BUILD.length))?.kind === "build" ? { recipe: id.slice(BUILD.length) } : { why: "raw" };
  const recs = own(d.makes, id) ?? [];
  if (!root && st.leaf.includes(id)) return { why: "chosen" };
  if (!recs.length) return { why: "raw" };
  const picked = own(st.r, id);
  if (picked && recs.includes(picked)) return { recipe: picked };
  const forced = root || st.make.includes(id);
  if (!forced && own(d.items, id)?.f) return { why: "found" };
  const elig = recs.filter((rid) => eligible(d, ctx.known, rid));
  // Lo pedido o lo que querés fabricar: si nada se puede hacer ya, la que hay que aprender antes que una de abrir cajas
  // o deshacer (los clavos pedidos se forjan, no salen de "abrir caja de 100").
  const unx = recs.filter((rid) => !d.recipes[rid].x);
  const pool = elig.length ? elig : forced ? (unx.length ? unx : recs) : [];
  // Sin camino como paso intermedio: si queda alguna receta sin `x`, es que ninguna se sabe ("hay que aprender"); si no, sólo
  // sale de abrir, desarmar o recargar otra cosa. Las de `x` no cuentan para "aprender": aprenderlas no lo haría fabricable.
  if (!pool.length) return { why: unx.length ? "learn" : "undo" };
  return { recipe: bestRecipe(d, ctx.c, pool, id) };
}

export function pickOpt(d: CraftData, st: CraftState, c: Costs, rid: string, li: number, id: string | null): string | null {
  const line = d.recipes[rid].in[li];
  const opts = allowed(d.recipes[rid], li, id);
  if (!opts.length) return null;
  const chosen = own(st.o, `${rid}.${li}`);
  if (chosen && opts.includes(chosen)) return chosen;
  if (line.k) return opts.find((o) => d.items[o]?.f) ?? opts.find((o) => !d.makes[o]) ?? opts[0];
  // A igual costo gana el material más común (el que más recetas piden): para un palo largo, el retoño y no el palo de
  // hockey, que cuestan lo mismo pero nadie corta uno para eso. Después, el orden de la línea.
  const uses = usesOf(d);
  let best = opts[0];
  let bv = Infinity;
  for (const o of opts) {
    const v = lineUnits(d, line, o) * (c.get(o) ?? 1);
    if (v < bv - TOL || (Math.abs(v - bv) <= TOL && (uses.get(o) ?? 0) > (uses.get(best) ?? 0))) { best = o; bv = v; }
  }
  return best;
}

const usesCache = new WeakMap<CraftData, Map<string, number>>();
/** En cuántas recetas aparece cada objeto como ingrediente gastado: lo común antes que lo raro, en un empate. */
function usesOf(d: CraftData): Map<string, number> {
  let m = usesCache.get(d);
  if (m) return m;
  m = new Map();
  for (const r of Object.values(d.recipes)) for (const l of r.in) if (consumed(l)) for (const o of l.o) m.set(o, (m.get(o) ?? 0) + 1);
  usesCache.set(d, m);
  return m;
}

export interface NodeLine {
  li: number; keep: boolean; opts: string[]; pick: string | null; qty: number;
  child?: TreeNode; fluid?: { name: Loc; liters: number }; any?: true;
}
export interface TreeNode {
  id: string; qty: number; recipe?: string; why?: LeafWhy; crafts?: number; made?: number;
  alts: string[]; lines: NodeLine[];
}

/** Una rama para dibujar: `qty` en unidades. Un objeto que ya está en su propia rama se corta ahí. */
export function tree(d: CraftData, st: CraftState, ctx: Ctx, id: string, qty: number, path: string[] = []): TreeNode {
  const build = isBuild(id);
  const alts = build ? [] : own(d.makes, id) ?? [];
  if (path.includes(id) || path.length > MAX_DEPTH) return { id, qty, why: "cycle", alts, lines: [] };
  // Raíz = la rama que se dibuja o cualquier otro objetivo, igual que en `totals`: si pedís el estante y clavos, los clavos
  // del estante se ven forjados (como en la lista), no "se encuentra".
  const via = viaOf(d, st, ctx, id, path.length === 0 || st.q.some((t) => t.id === id));
  if (!("recipe" in via)) return { id, qty, why: via.why, alts, lines: [] };
  const rid = via.recipe;
  const r = d.recipes[rid];
  const per = build ? 1 : outUnits(d, r, id);
  const crafts = Math.ceil(qty / per - TOL);
  const sub = [...path, id];
  const lines = r.in.map((line, li): NodeLine => {
    if (line.fl) return { li, keep: false, opts: [], pick: null, qty: line.n * crafts, fluid: { name: line.fl, liters: line.n * crafts } };
    if (line.any) return { li, keep: !!line.k, opts: [], pick: null, qty: line.n, any: true };
    const opts = allowed(r, li, build ? null : id);
    const pick = pickOpt(d, st, ctx.c, rid, li, build ? null : id);
    if (!pick) return { li, keep: !!line.k, opts, pick: null, qty: 0 };
    if (line.k) {
      const q = unitsPer(d, pick);
      return { li, keep: true, opts, pick, qty: q, child: st.make.includes(pick) ? tree(d, st, ctx, pick, q, sub) : undefined };
    }
    const q = lineUnits(d, line, pick) * crafts;
    return { li, keep: false, opts, pick, qty: q, child: tree(d, st, ctx, pick, q, sub) };
  });
  return { id, qty, recipe: rid, crafts, made: crafts * per, alts, lines };
}

export interface Totals {
  raw: { id: string; units: number; why: LeafWhy }[];
  tools: { opts: string[]; pick: string }[];
  fluids: { name: Loc; liters: number }[];
  stations: string[];
  skills: [skill: string, lvl: number][];
  learn: string[];
  xp: [skill: string, xp: number][];
  steps: { id: string; recipe: string; crafts: number }[];
  left: { id: string; units: number }[];
}

/** Los totales: la demanda de cada objeto junta (padres antes que hijos), con lo que tenés restado. */
export function totals(d: CraftData, st: CraftState, ctx: Ctx): Totals {
  const targets = new Set(st.q.map((t) => t.id));
  const via = (id: string) => viaOf(d, st, ctx, id, targets.has(id));
  const forLine = (id: string) => (isBuild(id) ? null : id);
  const kids = (id: string): string[] => {
    const v = via(id);
    if (!("recipe" in v)) return [];
    return d.recipes[v.recipe].in.flatMap((line, li) => {
      if (line.fl || line.any) return [];
      const p = pickOpt(d, st, ctx.c, v.recipe, li, forLine(id));
      return p && (!line.k || st.make.includes(p)) ? [p] : [];
    });
  };
  const demand = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const t of st.q) add(demand, t.id, isBuild(t.id) ? t.qty : t.qty * unitsPer(d, t.id));

  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const k of kids(id)) visit(k);
    order.push(id);
  };
  for (const t of st.q) visit(t.id);
  order.reverse();

  const raw = new Map<string, { units: number; why: LeafWhy }>();
  const addRaw = (id: string, units: number, why: LeafWhy) => {
    const e = raw.get(id);
    raw.set(id, { units: (e?.units ?? 0) + units, why: e?.why ?? why });
  };
  const tools = new Map<string, { opts: string[]; pick: string }>();
  const fluids = new Map<string, { name: Loc; liters: number }>();
  const stations = new Set<string>();
  const skills = new Map<string, number>();
  const xp = new Map<string, number>();
  const learn = new Set<string>();
  const left = new Map<string, number>();
  const steps: Totals["steps"] = [];
  const toolMade = new Set<string>();
  const done = new Set<string>();

  for (const id of order) {
    done.add(id);
    const have = isBuild(id) ? 0 : (own(st.have, id) ?? 0) * unitsPer(d, id);
    const q = Math.max(0, (demand.get(id) ?? 0) - have);
    if (q <= 0) continue;
    const v = via(id);
    if (!("recipe" in v)) { addRaw(id, q, v.why); continue; }
    const r = d.recipes[v.recipe];
    const per = isBuild(id) ? 1 : outUnits(d, r, id);
    const crafts = Math.ceil(q / per - TOL);
    steps.push({ id, recipe: v.recipe, crafts });
    if (!isBuild(id) && crafts * per > q + TOL) add(left, id, crafts * per - q);
    for (const o of r.out) if ("i" in o && o.i !== id) add(left, o.i, o.n * crafts * unitsPer(d, o.i));
    for (const s of r.st ?? []) stations.add(s);
    for (const [s, lvl] of r.sk ?? []) skills.set(s, Math.max(skills.get(s) ?? 0, lvl));
    for (const [s, n] of r.xp ?? []) add(xp, s, n * crafts);
    if (!knows(d, ctx.known, v.recipe)) learn.add(v.recipe);
    r.in.forEach((line, li) => {
      if (line.fl) {
        const key = line.fl.en;
        const e = fluids.get(key) ?? { name: line.fl, liters: 0 };
        e.liters += line.n * crafts;
        fluids.set(key, e);
        return;
      }
      if (line.any) return;
      const p = pickOpt(d, st, ctx.c, v.recipe, li, forLine(id));
      if (!p) return;
      if (line.k) {
        const opts = allowed(r, li, forLine(id));
        const key = [...opts].sort().join("|");
        if (!tools.has(key)) tools.set(key, { opts, pick: p });
        if (st.make.includes(p) && !toolMade.has(p)) {
          toolMade.add(p);
          if (done.has(p)) addRaw(p, unitsPer(d, p), "cycle"); else add(demand, p, unitsPer(d, p));
        }
        return;
      }
      const n = lineUnits(d, line, p) * crafts;
      if (done.has(p)) addRaw(p, n, "cycle"); else add(demand, p, n);
    });
  }

  const byName = <T,>(m: Map<string, T>) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    raw: [...raw].map(([id, e]) => ({ id, units: e.units, why: e.why })),
    tools: [...tools.values()],
    fluids: [...fluids.values()],
    stations: [...stations],
    skills: byName(skills),
    learn: [...learn],
    xp: byName(xp),
    steps: steps.reverse(),
    left: [...left].map(([id, units]) => ({ id, units })),
  };
}

export function plan(d: CraftData, st: CraftState): { trees: TreeNode[]; totals: Totals } {
  const ctx = context(d, st);
  return {
    trees: st.q.map((t) => tree(d, st, ctx, t.id, isBuild(t.id) ? t.qty : t.qty * unitsPer(d, t.id))),
    totals: totals(d, st, ctx),
  };
}
