/**
 * El motor del trade-up de CS2 (2026-11-03, etapa 2). Puro: recibe las skins, los precios y `tradeup.json`, y devuelve
 * números. Reglas en docs/superpowers/specs/2026-11-03-cs2-design.md ("Etapa 2"):
 *
 * - 10 entradas de la misma rareza dan una de la rareza de arriba de alguna de sus colecciones; 5 Encubiertos dan el
 *   objeto especial (cuchillo o guantes) de la caja de alguna de sus colecciones.
 * - Probabilidad de un resultado = (entradas de su colección / total) / (resultados de esa colección).
 * - Float de salida = mín. + promedio de los floats normalizados de las entradas × (máx. − mín.) de la salida. Es la
 *   fórmula que midió la comunidad (Valve no la publicó).
 * - StatTrak da StatTrak; Souvenir pierde el atributo y da normal.
 */
import { WEARS, type Cs2Rarity } from "../../cs2Copy";
import type { SkinPrice, SkinRow } from "../data";

export type Kind = "n" | "st" | "sv";
export interface Input {
  slug: string;
  float: number;
}
export interface Coll {
  name: string;
  tiers: Partial<Record<Cs2Rarity, string[]>>;
  rare: string[];
}
export interface TradeupCtx {
  skins: Map<string, SkinRow>;
  prices: Record<string, SkinPrice>;
  tradeup: Record<string, Coll>;
  /** La comisión del mercado al vender, de 0 a 1. */
  fee: number;
}
export interface Outcome {
  slug: string;
  /** null en un cuchillo sin pintura. */
  float: number | null;
  wear: number | null;
  chance: number;
  price: number | null;
  sug: boolean;
}
/** Por qué un contrato no se puede firmar (la interfaz lo traduce); `n`: cuántas faltan o sobran. */
export type Problem = { code: "empty" | "mixed" | "rarity" | "st" | "sv" | "nocase" | "top" } | { code: "missing" | "extra"; n: number };
export interface Contract {
  /** null si el contrato se puede firmar; si no, por qué no (igual se calcula con lo que hay). */
  valid: Problem | null;
  avgN: number;
  cost: number;
  outcomes: Outcome[];
  /** Valor esperado bruto (sólo con los resultados que tienen precio) y neto de comisión. */
  ev: number;
  net: number;
  /** Probabilidad de que el resultado, vendido, valga más que el costo (sin contar precios sugeridos). */
  win: number;
  profit: number;
}

/** Las rarezas de entrada, de la más baja a la más alta. Encubierto da el objeto especial. */
const LADDER: Cs2Rarity[] = ["consumer", "industrial", "milspec", "restricted", "classified", "covert"];
export const TRADEUP_RARITIES = LADDER;
export const nextRarity = (r: Cs2Rarity): Cs2Rarity | "special" | null => {
  const i = LADDER.indexOf(r);
  return i < 0 ? null : i === LADDER.length - 1 ? "special" : LADDER[i + 1];
};
export const needed = (r: Cs2Rarity): number => (r === "covert" ? 5 : 10);

export const wearOf = (f: number): number => {
  const i = WEARS.findIndex((w) => f >= w.from && f < w.to);
  return i < 0 ? WEARS.length - 1 : i;
};
const clamp = (f: number, s: SkinRow): number => (s.min == null || s.max == null ? 0 : Math.min(Math.max(f, s.min), s.max));
const norm = (f: number, s: SkinRow): number => (s.min == null || s.max == null || s.max === s.min ? 0 : (clamp(f, s) - s.min) / (s.max - s.min));

/** El precio de una skin a un float, en la versión que corresponde (normal, StatTrak o Souvenir). */
export function priceAt(p: SkinPrice | undefined, s: SkinRow, float: number | null, kind: Kind): { price: number | null; sug: boolean } {
  const i = s.min == null || float == null ? 0 : wearOf(float);
  const arr = kind === "st" ? p?.st : kind === "sv" ? p?.sv : p?.n;
  const price = arr?.[i] ?? null;
  const sug = kind === "n" && !!((p?.sug ?? 0) & (1 << i));
  return { price, sug };
}

/** Lo que puede salir de una colección para una rareza de entrada: la de arriba, o el especial de sus cajas. */
const outputsOf = (c: Coll | undefined, r: Cs2Rarity): string[] => {
  const nx = nextRarity(r);
  if (!c || !nx) return [];
  return nx === "special" ? c.rare : c.tiers[nx] ?? [];
};

export function contract(inputs: Input[], kind: Kind, ctx: TradeupCtx): Contract {
  const rows = inputs.flatMap((i) => {
    const s = ctx.skins.get(i.slug);
    return s ? [{ s, f: clamp(i.float, s) }] : [];
  });
  const empty: Contract = { valid: { code: "empty" }, avgN: 0, cost: 0, outcomes: [], ev: 0, net: 0, win: 0, profit: 0 };
  if (!rows.length) return empty;
  const rarity = rows[0].s.rarity;
  let valid: Problem | null = null;
  if (rows.some((r) => r.s.rarity !== rarity)) valid = { code: "mixed" };
  else if (!nextRarity(rarity)) valid = { code: "rarity" };
  else if (kind === "st" && rows.some((r) => !r.s.st)) valid = { code: "st" };
  else if (kind === "sv" && rows.some((r) => !r.s.sv)) valid = { code: "sv" };

  const avgN = rows.reduce((sum, r) => sum + norm(r.f, r.s), 0) / rows.length;
  const cost = rows.reduce((sum, r) => sum + (priceAt(ctx.prices[r.s.slug], r.s, r.f, kind).price ?? 0), 0);
  // Cuántas entradas aporta cada colección.
  const porCol = new Map<string, number>();
  for (const r of rows) porCol.set(r.s.col ?? "", (porCol.get(r.s.col ?? "") ?? 0) + 1);
  const outKind: Kind = kind === "st" ? "st" : "n";
  const outcomes: Outcome[] = [];
  for (const [col, n] of porCol) {
    const outs = outputsOf(ctx.tradeup[col], rarity);
    if (!outs.length) {
      valid ??= { code: rarity === "covert" ? "nocase" : "top" };
      continue;
    }
    for (const slug of outs) {
      const o = ctx.skins.get(slug);
      if (!o) continue;
      const float = o.min == null || o.max == null ? null : o.min + avgN * (o.max - o.min);
      const { price, sug } = priceAt(ctx.prices[slug], o, float, outKind);
      outcomes.push({ slug, float, wear: float == null ? null : wearOf(float), chance: n / rows.length / outs.length, price, sug });
    }
  }
  const falta = needed(rarity) - rows.length;
  if (!valid && falta > 0) valid = { code: "missing", n: falta };
  if (!valid && falta < 0) valid = { code: "extra", n: -falta };
  const ev = outcomes.reduce((s, o) => s + o.chance * (o.price ?? 0), 0);
  const net = ev * (1 - ctx.fee);
  const win = outcomes.filter((o) => o.price != null && !o.sug && o.price * (1 - ctx.fee) > cost).reduce((s, o) => s + o.chance, 0);
  return { valid, avgN, cost, outcomes, ev, net, win, profit: net - cost };
}

export interface Inverse {
  /** El float normalizado promedio por debajo del cual sale el desgaste pedido; null si la skin no tiene ese desgaste. */
  nMax: number | null;
  /** Y por encima del cual (para pedir un desgaste alto). */
  nMin: number;
  /** La probabilidad de sacarla con un contrato entero de su colección. */
  chance: number;
  /** Las entradas que sirven, de la más barata a la más cara, con el float máximo que pueden tener. */
  inputs: { slug: string; col: string; fMax: number | null; price: number | null }[];
}

export function inverse(target: string, wear: number, ctx: TradeupCtx, kind: Kind = "n"): Inverse {
  const t = ctx.skins.get(target);
  const none: Inverse = { nMax: null, nMin: 0, chance: 0, inputs: [] };
  if (!t) return none;
  let nMin = 0, nMax: number | null = 1;
  if (t.min != null && t.max != null) {
    const w = WEARS[wear];
    if (!w || w.to <= t.min || w.from >= t.max) return none;
    const span = t.max - t.min || 1;
    nMax = Math.min(1, (Math.min(w.to, t.max) - t.min) / span);
    nMin = Math.max(0, (w.from - t.min) / span);
  }
  // Las colecciones de donde sale: la suya (rareza de abajo) o, si es un especial, las que lo traen en su caja.
  const fuentes = Object.entries(ctx.tradeup).flatMap(([col, c]) => {
    if (c.rare.includes(target)) return [{ col, rarity: "covert" as Cs2Rarity, outs: c.rare }];
    if (t.col === col) {
      const i = LADDER.indexOf(t.rarity);
      return i > 0 ? [{ col, rarity: LADDER[i - 1], outs: c.tiers[t.rarity] ?? [] }] : [];
    }
    return [];
  });
  if (!fuentes.length) return { ...none, nMax };
  const chance = Math.max(...fuentes.map((f) => (f.outs.length ? 1 / f.outs.length : 0)));
  const inputs = fuentes
    .flatMap((f) => (ctx.tradeup[f.col].tiers[f.rarity] ?? []).map((slug) => ({ slug, col: f.col })))
    .flatMap(({ slug, col }) => {
      const s = ctx.skins.get(slug);
      if (!s) return [];
      // Lo más barato que sirve es lo más gastado permitido: apenas por debajo del máximo.
      const fMax = s.min == null || s.max == null ? null : s.min + (nMax ?? 0) * (s.max - s.min);
      const { price } = priceAt(ctx.prices[slug], s, fMax == null ? null : Math.max(s.min ?? 0, fMax - 1e-6), kind);
      return [{ slug, col, fMax, price }];
    })
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return { nMax, nMin, chance, inputs };
}
