/**
 * Los filtros de cada pestaña de Valheim (2026-09-24), sin React.
 *
 * Pedido de ZoTaD al ver las maquetas: "más filtros para encontrar cosas
 * rápido". Cada pestaña declara los suyos; todos son de una sola opción
 * (elegir otra reemplaza) y se combinan con Y. Los contadores de cada opción
 * se calculan con los demás filtros aplicados, así nunca se ofrece una opción
 * que deja la lista vacía.
 */
import type { Lang } from "./i18n";
import type { ValheimTab } from "./route";
import type { ValheimCopy } from "./valheimCopy";
import { BIOME_IDS, fold, stationOf, tx, type AnyRow, type CreatureRow, type ItemRow, type PieceRow, type Txt } from "./valheimData";

export type ListTab = Exclude<ValheimTab, "biomes" | "bosses" | "places">;
export const LIST_TABS: ListTab[] = ["foods", "meads", "weapons", "armor", "tools", "building", "materials", "creatures"];

export interface FilterDef {
  key: string;
  title: keyof ValheimCopy["filters"];
  /** Los valores del filtro que tiene una fila (una fila puede tener varios). */
  values: (r: AnyRow) => string[];
  /** Nombres propios de los valores que salen de los datos (estaciones, sets). */
  names?: (r: AnyRow) => [string, Txt][];
  /** Texto de un valor, con la copia y los nombres juntados de las filas. */
  text: (v: string, t: ValheimCopy, lang: Lang, names: Map<string, Txt>) => string;
  /** Orden fijo de los valores (biomas en progresión); sin esto, por cantidad. */
  order?: string[];
  /** Una columna de opciones en vez de fichas en fila (listas largas). */
  column?: boolean;
  /** Es un interruptor (sí/no), no una lista de opciones. */
  toggle?: boolean;
}

const it = (r: AnyRow) => r as ItemRow;
const pc = (r: AnyRow) => r as PieceRow;
const cr = (r: AnyRow) => r as CreatureRow;
const named = (v: string, lang: Lang, names: Map<string, Txt>, fallback: string) => tx(names.get(v), lang) || fallback;

const biomeTier: FilterDef = {
  key: "biome", title: "biome", values: (r) => (it(r).tier ? [it(r).tier as string] : []),
  text: (v, t) => t.biomes[v as keyof ValheimCopy["biomes"]] ?? v, order: BIOME_IDS, column: true,
};
const biomeFound: FilterDef = { ...biomeTier, values: (r) => (it(r).biomes ?? cr(r).biomes ?? []) as string[] };
const station: FilterDef = {
  key: "station", title: "station",
  values: (r) => {
    const s = stationOf(r);
    return [s ? s.name.en : "-"];
  },
  names: (r) => {
    const s = stationOf(r);
    return s ? [[s.name.en, s.name]] : [];
  },
  text: (v, t, lang, names) => (v === "-" ? t.filters.noStation : named(v, lang, names, v)), column: true,
};

/** El daño que más pesa, agrupando fuego, escarcha, rayo, veneno y espíritu como "elemental". */
export function mainDamage(d: Record<string, number> | null | undefined): string | null {
  if (!d) return null;
  const phys = ["slash", "blunt", "pierce"];
  let best: string | null = null, max = 0, elem = 0;
  for (const [k, v] of Object.entries(d)) {
    if (k === "chop" || k === "pickaxe") continue;
    if (phys.includes(k)) {
      if (v > max) { max = v; best = k; }
    } else elem += v;
  }
  return elem > max ? "elemental" : best;
}

const DAMAGE_TEXT = (v: string, t: ValheimCopy) => (v === "elemental" ? `${t.damage.fire} / ${t.damage.frost} / ${t.damage.lightning}` : t.damage[v] ?? v);

export const FILTERS: Record<ListTab, FilterDef[]> = {
  foods: [
    biomeTier,
    { key: "focus", title: "focus", values: (r) => [it(r).focus ?? "balanced"], text: (v, t) => t.focus[v] ?? v, order: ["health", "stamina", "eitr", "balanced"] },
    station,
  ],
  meads: [
    { key: "effect", title: "effect", values: (r) => [it(r).effect ?? "other"], text: (v, t) => t.effect[v] ?? v, order: ["health", "stamina", "eitr", "resist", "other"] },
    biomeTier,
  ],
  weapons: [
    { key: "cls", title: "cls", values: (r) => [it(r).cls ?? "other"], text: (v, t) => t.weaponCls[v] ?? v, column: true },
    { key: "dmg", title: "dmg", values: (r) => { const m = mainDamage(it(r).damage); return m ? [m] : []; }, text: DAMAGE_TEXT, order: ["slash", "blunt", "pierce", "elemental"] },
    biomeTier,
    station,
  ],
  armor: [
    { key: "slot", title: "slot", values: (r) => [it(r).slot ?? "other"], text: (v, t) => t.slot[v] ?? v, order: ["helmet", "chest", "legs", "cape", "shield", "utility", "trinket", "other"] },
    biomeTier,
    {
      key: "set", title: "set", values: (r) => (it(r).setName ? [it(r).setName as string] : []),
      names: (r) => (it(r).setName && it(r).slot === "chest" ? [[it(r).setName as string, it(r).name]] : []),
      text: (v, _t, lang, names) => named(v, lang, names, v), column: true,
    },
    station,
  ],
  tools: [
    { key: "kind", title: "kind", values: (r) => [it(r).toolKind ?? "tool"], text: (v, t) => t.toolKind[v] ?? v, order: ["tool", "arrow", "bolt", "ammo"] },
    biomeTier,
  ],
  building: [
    { key: "tool", title: "tool", values: (r) => (pc(r).tool ? [pc(r).tool as string] : []), text: (v, t) => t.tool[v] ?? v, order: ["Hammer", "Hoe", "Cultivator", "Feaster"] },
    {
      key: "category", title: "category", values: (r) => (pc(r).categoryName ? [`${pc(r).tool}:${pc(r).category}`] : []),
      names: (r) => (pc(r).categoryName ? [[`${pc(r).tool}:${pc(r).category}`, pc(r).categoryName as Txt]] : []),
      text: (v, _t, lang, names) => named(v, lang, names, v), column: true,
    },
    { key: "comfort", title: "comfort", toggle: true, values: (r) => (pc(r).comfort ? ["yes"] : []), text: () => "" },
    biomeTier,
    station,
  ],
  materials: [
    { key: "kind", title: "kind", values: (r) => [it(r).matKind ?? "material"], text: (v, t) => (v === "trophy" ? t.filters.trophy : t.filters.material), order: ["material", "trophy"] },
    biomeFound,
    { key: "how", title: "how", values: (r) => it(r).hows ?? [], text: (v, t) => t.how[v] ?? v, column: true },
    { key: "usedFor", title: "usedFor", values: (r) => it(r).usedFor ?? [], text: (v, t) => t.tabs[v as ValheimTab] ?? v, column: true },
  ],
  creatures: [
    { key: "type", title: "type", values: (r) => [cr(r).boss ? "boss" : "normal"], text: (v, t) => (v === "boss" ? t.filters.boss : t.filters.normal), order: ["normal", "boss"] },
    biomeFound,
    { key: "weak", title: "weak", values: (r) => cr(r).weak ?? [], text: (v, t) => t.damage[v] ?? v, column: true },
  ],
};

export type FilterState = Record<string, string | null>;

/** Coincide con el buscador: nombre en los dos idiomas, sin tildes ni mayúsculas. */
export function matchesQuery(r: AnyRow, q: string): boolean {
  const f = fold(q.trim());
  if (!f) return true;
  return fold(r.name.en).includes(f) || fold(r.name.es).includes(f);
}

/** Las filas que pasan el buscador y todos los filtros (salvo `except`, para contar opciones). */
export function applyFilters(rows: AnyRow[], defs: FilterDef[], state: FilterState, q: string, except?: string): AnyRow[] {
  const active = defs.filter((d) => d.key !== except && state[d.key]);
  return rows.filter((r) => matchesQuery(r, q) && active.every((d) => d.values(r).includes(state[d.key] as string)));
}

/** Las opciones de un filtro con cuántas filas quedarían eligiendo cada una. */
export function filterOptions(rows: AnyRow[], def: FilterDef, defs: FilterDef[], state: FilterState, q: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of applyFilters(rows, defs, state, q, def.key)) {
    for (const v of new Set(def.values(r))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const out = [...counts.entries()];
  if (def.order) {
    const o = def.order;
    return out.sort((a, b) => (o.indexOf(a[0]) + 1 || 999) - (o.indexOf(b[0]) + 1 || 999));
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/** Los nombres propios que usan los filtros de una pestaña, juntados de las filas. */
export function collectNames(rows: AnyRow[], defs: FilterDef[]): Map<string, Txt> {
  const m = new Map<string, Txt>();
  for (const d of defs) {
    if (!d.names) continue;
    for (const r of rows) for (const [k, v] of d.names(r)) if (!m.has(k)) m.set(k, v);
  }
  return m;
}
