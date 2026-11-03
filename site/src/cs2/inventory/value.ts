/**
 * Valuar un inventario de CS2 (2026-11-03, etapa 3) con los precios de todo Skinport (`prices/all.json`). Puro.
 */
import type { Cs2Rarity } from "../../cs2Copy";
import type { InvItem } from "./steam";

/** La rareza de Steam (en inglés, de armas, stickers y agentes) → la del sitio, para el color. */
const RARITY: Record<string, Cs2Rarity> = {
  "Base Grade": "consumer", "Consumer Grade": "consumer", "Industrial Grade": "industrial", "Mil-Spec Grade": "milspec",
  Restricted: "restricted", Classified: "classified", Covert: "covert", Extraordinary: "extraordinary", Contraband: "contraband",
  "High Grade": "milspec", Remarkable: "restricted", Exotic: "classified",
  Distinguished: "milspec", Exceptional: "restricted", Superior: "classified", Master: "covert",
};
export const rarityKey = (r: string): Cs2Rarity => RARITY[r] ?? "consumer";

export interface Valued extends InvItem {
  price: number | null;
  /** Cantidad × precio; null sin precio. */
  total: number | null;
}

export function valuate(items: InvItem[], prices: Record<string, number>) {
  const out: Valued[] = items.map((x) => {
    const price = prices[x.name] ?? null;
    return { ...x, price, total: price == null ? null : price * x.n };
  });
  const byTypeMap = new Map<string, number>();
  for (const x of out) byTypeMap.set(x.type, (byTypeMap.get(x.type) ?? 0) + (x.total ?? 0));
  return {
    items: out,
    total: out.reduce((s, x) => s + (x.total ?? 0), 0),
    count: out.reduce((s, x) => s + x.n, 0),
    unpriced: out.filter((x) => x.price == null).length,
    byType: [...byTypeMap].sort((a, b) => b[1] - a[1]),
  };
}
