import { LADDERS, bonusFor } from "./deadlockInvestment";
import type { Slot } from "./deadlockItemsData";

/**
 * La lógica del armador de builds, sin React: qué pasa al agregar o sacar un
 * objeto, cuánto suma y cómo viaja la build en el link.
 *
 * **Las reglas son las de la tienda del juego**, no unas propias:
 * - Doce casillas.
 * - Comprar la mejora de algo que tenés **reemplaza al componente en su
 *   casilla**: el juego lo consume y te descuenta lo que pagaste. Por eso la
 *   mejora entra aunque la build esté llena, y por eso el total de almas es
 *   la suma de los objetos finales (el precio de la mejora ya incluye el del
 *   componente).
 * - Comprar un componente cuando ya tenés su mejora no tiene sentido y no se
 *   hace.
 */

export const BUILD_SLOTS = 12;

export interface BuilderItem {
  itemId: number;
  cost: number;
  slot: Slot;
  upgradesFrom: number[];
  upgradesTo: number[];
}

export type Lookup = (itemId: number) => BuilderItem | undefined;

export type AddResult =
  | { items: number[]; result: "added" }
  | { items: number[]; result: "upgraded"; replaced: number }
  | { items: number[]; result: "duplicate" | "has-upgrade" | "full" | "unknown" };

/**
 * Recorre la cadena de mejoras en una dirección, todos los escalones: hacia
 * abajo (`upgradesFrom`, los componentes) o hacia arriba (`upgradesTo`, en qué
 * se convierte). Con un visto por si algún día el catálogo trae un ciclo.
 */
function cadena(itemId: number, lookup: Lookup, dir: "upgradesFrom" | "upgradesTo"): number[] {
  const vistos = new Set<number>();
  const pendientes = [...(lookup(itemId)?.[dir] ?? [])];
  while (pendientes.length > 0) {
    const id = pendientes.shift()!;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pendientes.push(...(lookup(id)?.[dir] ?? []));
  }
  return [...vistos];
}

/** Los componentes de un objeto en todos los escalones de abajo (del III: el II y el I). */
export const componentsOf = (itemId: number, lookup: Lookup): number[] => cadena(itemId, lookup, "upgradesFrom");

/** En qué se puede convertir un objeto, en todos los escalones de arriba. */
export const upgradesOf = (itemId: number, lookup: Lookup): number[] => cadena(itemId, lookup, "upgradesTo");

/**
 * Lo que la tienda muestra como ADQUIRIDO: los objetos de la build **y los
 * componentes que cada uno consumió**, como el juego. Con un objeto de escalón
 * III, su componente II y el I de ese también salen apagados (lo marcó ZoTaD el
 * 2026-09-23).
 */
export function ownedWithComponents(build: number[], lookup: Lookup): Set<number> {
  const out = new Set(build);
  for (const id of build) for (const c of componentsOf(id, lookup)) out.add(c);
  return out;
}

export function addItem(build: number[], itemId: number, lookup: Lookup): AddResult {
  const item = lookup(itemId);
  if (!item) return { items: build, result: "unknown" };
  if (build.includes(itemId)) return { items: build, result: "duplicate" };

  // Cualquier componente de la cadena, no sólo el del escalón de abajo: con un
  // I en la build, comprar el III directo lo consume igual que en el juego.
  const componente = componentsOf(itemId, lookup).find((c) => build.includes(c));
  if (componente !== undefined) {
    return {
      items: build.map((id) => (id === componente ? itemId : id)),
      result: "upgraded",
      replaced: componente,
    };
  }
  if (upgradesOf(itemId, lookup).some((u) => build.includes(u))) return { items: build, result: "has-upgrade" };
  if (build.length >= BUILD_SLOTS) return { items: build, result: "full" };
  return { items: [...build, itemId], result: "added" };
}

export const removeItem = (build: number[], itemId: number): number[] => build.filter((id) => id !== itemId);

/** Comprarlo mejoraría algo que ya está en la build: el juego le pega el sello "MEJORA". */
export const upgradesOwned = (item: BuilderItem, build: number[]): boolean =>
  item.upgradesFrom.some((c) => build.includes(c));

export interface SlotInvestment {
  souls: number;
  bonus: number;
  /** El próximo escalón de la escalera, o ausente en el tope. */
  next?: { souls: number; bonus: number };
}

export interface Investment extends Record<Slot, SlotInvestment> {
  total: number;
}

export function investment(build: number[], lookup: Lookup): Investment {
  const almas: Record<Slot, number> = { weapon: 0, vitality: 0, spirit: 0 };
  for (const id of build) {
    const it = lookup(id);
    if (it) almas[it.slot] += it.cost;
  }
  const de = (slot: Slot): SlotInvestment => {
    const souls = almas[slot];
    const next = LADDERS[slot].find((r) => r.souls > souls);
    return { souls, bonus: bonusFor(slot, souls), ...(next ? { next: { souls: next.souls, bonus: next.bonus } } : {}) };
  };
  return {
    weapon: de("weapon"),
    vitality: de("vitality"),
    spirit: de("spirit"),
    total: almas.weapon + almas.vitality + almas.spirit,
  };
}

export function overlap(a: number[], b: number[]): number {
  const s = new Set(b);
  return a.filter((x) => s.has(x)).length;
}

/**
 * La build en el link: `<héroe>.<objeto>.<objeto>…`, cada id en base 36.
 *
 * Base 36 porque los ids del juego son de 10 dígitos y así quedan en 6: doce
 * objetos entran en un link de ~90 caracteres, que se pega en Discord sin
 * romperse en dos renglones.
 */
export const encodeBuild = (heroId: number, items: number[]): string =>
  [heroId, ...items].map((n) => n.toString(36)).join(".");

export function decodeBuild(s: string): { heroId: number; items: number[] } | null {
  const partes = s.split(".");
  const heroId = parseInt(partes[0] ?? "", 36);
  if (!partes[0] || !/^[0-9a-z]+$/.test(partes[0]) || !Number.isFinite(heroId)) return null;
  const items: number[] = [];
  for (const p of partes.slice(1)) {
    if (!/^[0-9a-z]+$/.test(p)) continue;
    const id = parseInt(p, 36);
    if (Number.isFinite(id) && !items.includes(id)) items.push(id);
    if (items.length === BUILD_SLOTS) break;
  }
  return { heroId, items };
}
