/**
 * La forma de lo elegido en el Planificador de fabricación y cómo se escribe en la dirección (el formato, en `state.ts`).
 * Separado de `state.ts` (2026-10-02) porque es lo único que necesitan los enlaces "Planificá…" de Objetos, Recetas y
 * Personaje (`link.tsx`): así esas pestañas no cargan la lectura, la limpieza ni los cambios del planificador.
 */
export interface Target { id: string; qty: number }
export interface CraftState {
  q: Target[]; r: Record<string, string>; o: Record<string, string>;
  leaf: string[]; make: string[]; have: Record<string, number>; b: string | null;
}
export const EMPTY: CraftState = { q: [], r: {}, o: {}, leaf: [], make: [], have: {}, b: null };

const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ":");
const pairs = (o: Record<string, string>) => Object.keys(o).sort().map((k) => `${enc(k)}~${enc(o[k])}`).join(",");
const counts = (xs: Target[]) => xs.map((t) => enc(t.id) + (t.qty !== 1 ? `*${t.qty}` : "")).join(",");

export function encodeState(st: CraftState): string {
  const parts: string[] = [];
  if (st.q.length) parts.push("q=" + counts(st.q));
  if (Object.keys(st.r).length) parts.push("r=" + pairs(st.r));
  if (Object.keys(st.o).length) parts.push("o=" + pairs(st.o));
  if (st.leaf.length) parts.push("x=" + [...st.leaf].sort().map(enc).join(","));
  if (st.make.length) parts.push("f=" + [...st.make].sort().map(enc).join(","));
  const have = Object.keys(st.have).sort().map((id) => ({ id, qty: st.have[id] }));
  if (have.length) parts.push("t=" + counts(have));
  if (st.b) parts.push("b=" + enc(st.b));
  return parts.join("&");
}
