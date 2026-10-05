/**
 * El buscador y el filtro de la lista de Objetos de Rust (2026-10-05), sin React para probarlos solos. Busca en el
 * nombre inglés, el español y el shortname (`rifle.ak`), sin tildes ni mayúsculas, y pide todas las palabras.
 */
import type { ListRow } from "./data";

export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

export function filterRows(rows: ListRow[], cat: string | null, query: string): ListRow[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return rows.filter((r) => {
    if (cat && r.cat !== cat) return false;
    if (!words.length) return true;
    const hay = normalize(`${r.en} ${r.es ?? ""} ${r.id}`);
    return words.every((w) => hay.includes(w));
  });
}
