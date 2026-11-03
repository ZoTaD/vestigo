/**
 * Los filtros de la lista de Skins (2026-11-03), en la query para que un enlace o un recargo los conserve:
 * `?q=&cat=&weapon=&rarity=&st=1&sv=1&sort=price`. Puros, para probarlos sin navegador.
 */
import { CS2_CATS, CS2_RARITIES, type Cs2Cat, type Cs2Rarity } from "../../cs2Copy";
import type { SkinPrice, SkinRow } from "../data";

export interface SkinFilters {
  q: string;
  cat: Cs2Cat | null;
  weapon: string | null;
  rarity: Cs2Rarity | null;
  st: boolean;
  sv: boolean;
  sort: "rarity" | "price" | "name";
}

export function readSkinFilters(search: string): SkinFilters {
  const p = new URLSearchParams(search);
  const cat = p.get("cat");
  const rarity = p.get("rarity");
  const sort = p.get("sort");
  return {
    q: p.get("q") ?? "",
    cat: CS2_CATS.includes(cat as Cs2Cat) ? (cat as Cs2Cat) : null,
    weapon: p.get("weapon"),
    rarity: CS2_RARITIES.includes(rarity as Cs2Rarity) ? (rarity as Cs2Rarity) : null,
    st: p.get("st") === "1",
    sv: p.get("sv") === "1",
    sort: sort === "price" || sort === "name" ? sort : "rarity",
  };
}

export function writeSkinFilters(f: SkinFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.cat) p.set("cat", f.cat);
  if (f.weapon) p.set("weapon", f.weapon);
  if (f.rarity) p.set("rarity", f.rarity);
  if (f.st) p.set("st", "1");
  if (f.sv) p.set("sv", "1");
  if (f.sort !== "rarity") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function filterSkins(rows: readonly SkinRow[], f: SkinFilters): SkinRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.cat || r.cat === f.cat) &&
      (!f.weapon || r.weapon === f.weapon) &&
      (!f.rarity || r.rarity === f.rarity) &&
      (!f.st || r.st) &&
      (!f.sv || r.sv) &&
      (!q || `${r.name} ${r.phase ?? ""}`.toLowerCase().includes(q)),
  );
}

/** El precio más bajo de una skin (cualquier desgaste, normal): con él se ordena por precio. */
export const lowest = (p: SkinPrice | undefined): number | null => {
  const v = (p?.n ?? []).filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
};

export function sortSkins(rows: SkinRow[], prices: Record<string, SkinPrice>, sort: SkinFilters["sort"]): SkinRow[] {
  if (sort === "name") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "price") return [...rows].sort((a, b) => (lowest(prices[b.slug]) ?? -1) - (lowest(prices[a.slug]) ?? -1));
  // Rareza: de la más alta a la más baja; dentro, como viene (por arma y nombre).
  return [...rows].sort((a, b) => CS2_RARITIES.indexOf(a.rarity) - CS2_RARITIES.indexOf(b.rarity));
}
