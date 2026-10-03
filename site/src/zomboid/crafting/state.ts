/**
 * Lo que elegiste en el Planificador de fabricación (2026-10-01) y cómo viaja en la dirección. Los ids son siempre los
 * internos (los slugs en inglés de las fichas), en los dos idiomas: cambiar de idioma no rompe el link.
 *
 * `q=plank*10,c:large-plant-drying-rack&r=plank~saw-log&o=craft-twine.0~hemp-dogbane&x=nails&f=twine&t=plank*4&b=carpenter`
 * - q: lo que querés (`c:` adelante = una construcción, por el slug de su receta), `*N` la cantidad si no es 1;
 * - r: objeto~receta elegida; o: receta.línea~opción elegida;
 * - x: lo conseguís (no se fabrica); f: lo fabricás aunque se encuentre (o una herramienta que querés hacer);
 * - t: lo que ya tenés, en objetos; b: tu personaje, como en Personaje.
 */
import { own, type CraftData } from "./data";
import { EMPTY, encodeState, type CraftState, type Target } from "./query";

// La forma y cómo se escribe viven en `query.ts`, que es lo único que necesitan los enlaces de las otras pestañas.
export { EMPTY, encodeState };
export type { CraftState, Target };
export const MAX_QTY = 999;
export const BUILD = "c:";
export const isBuild = (id: string): boolean => id.startsWith(BUILD);

const clamp = (n: number) => Math.min(MAX_QTY, Math.max(0, Math.round(n) || 0));
const COUNT_RE = /^(.+?)(?:\*(-?\d+))?$/;
export function decodeState(search: string): CraftState {
  const p = new URLSearchParams(search);
  const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const withQty = (k: string) => list(k).flatMap((tok) => {
    const m = COUNT_RE.exec(tok);
    return m ? [{ id: m[1], qty: m[2] ? Number(m[2]) : 1 }] : [];
  });
  const read = (k: string) => {
    // Por pares y `fromEntries` (no `o[k] = v`): así `__proto__~x` queda como una clave más, que `sanitize` descarta, en vez
    // de tocar el prototipo del objeto.
    const o = new Map<string, string>();
    for (const tok of list(k)) { const i = tok.indexOf("~"); if (i > 0) o.set(tok.slice(0, i), tok.slice(i + 1)); }
    return Object.fromEntries(o) as Record<string, string>;
  };
  return {
    q: withQty("q"), r: read("r"), o: read("o"), leaf: list("x"), make: list("f"),
    have: Object.fromEntries(withQty("t").map((t) => [t.id, t.qty])), b: p.get("b") || null,
  };
}

/** Sólo lo que existe y tiene sentido: así un link viejo (de otro parche) o tocado a mano no rompe la página. */
export function sanitize(d: CraftData, st: CraftState): CraftState {
  // Siempre claves propias de los datos (`own`): un link con `constructor` o `toString` no tiene que pasar ni romper nada.
  const okTarget = (id: string) => (isBuild(id) ? own(d.recipes, id.slice(BUILD.length))?.kind === "build" : !!own(d.makes, id));
  const sum = new Map<string, number>();
  for (const t of st.q) if (okTarget(t.id)) sum.set(t.id, (sum.get(t.id) ?? 0) + t.qty);
  const q = [...sum].map(([id, qty]) => ({ id, qty: clamp(qty) })).filter((t) => t.qty > 0);
  const r = Object.fromEntries(Object.entries(st.r).filter(([id, rid]) => !!own(d.makes, id)?.includes(rid)));
  const o = Object.fromEntries(Object.entries(st.o).filter(([key, opt]) => {
    const [rid, li] = [key.slice(0, key.lastIndexOf(".")), Number(key.slice(key.lastIndexOf(".") + 1))];
    return Number.isInteger(li) && !!own(d.recipes, rid)?.in[li]?.o.includes(opt);
  }));
  const items = (xs: string[]) => [...new Set(xs.filter((id) => !!own(d.items, id)))];
  const have = Object.fromEntries(Object.entries(st.have).filter(([id, n]) => !!own(d.items, id) && clamp(n) > 0).map(([id, n]) => [id, clamp(n)]));
  return { q, r, o, leaf: items(st.leaf), make: items(st.make), have, b: cleanB(st.b) };
}

/**
 * Un link que llega con algo elegido **se suma** a lo guardado, no lo reemplaza (2026-10-02). Los botones "Planificá…"
 * de Objetos, Recetas y Personaje traen un objetivo o un personaje; un link compartido trae el plan entero de otro. La
 * query no distingue uno de otro, y en los dos casos lo seguro es no perder la lista guardada sin aviso:
 *  - objetivos: los de los dos; si uno ya estaba, queda la cantidad mayor (así recargar la página no la va sumando);
 *  - recetas, opciones, lo que tenés y el personaje: manda lo del link;
 *  - "lo consigo" / "lo fabrico": los de los dos, y lo que dice el link gana si se contradicen.
 */
export function mergeState(saved: CraftState, link: CraftState): CraftState {
  const qty = new Map(saved.q.map((t) => [t.id, t.qty]));
  for (const t of link.q) qty.set(t.id, Math.max(qty.get(t.id) ?? 0, t.qty));
  const leaf = [...new Set([...saved.leaf.filter((id) => !link.make.includes(id)), ...link.leaf])];
  const make = [...new Set([...saved.make.filter((id) => !link.leaf.includes(id)), ...link.make])];
  return {
    q: [...qty].map(([id, n]) => ({ id, qty: n })),
    r: { ...saved.r, ...link.r },
    o: { ...saved.o, ...link.o },
    leaf,
    make,
    have: { ...saved.have, ...link.have },
    b: link.b ?? saved.b,
  };
}

/**
 * Con qué arranca la hoja: lo de la dirección sumado a lo guardado en este navegador (`saved`, la query sin `?`, o
 * `null`). "Vacía" es sin nada del planificador: un `?utm_source=` solo no cuenta. Siempre pasa por `sanitize`.
 */
export function startState(d: CraftData, search: string, saved: string | null): CraftState {
  const link = decodeState(search);
  const mine = saved ? decodeState(`?${saved}`) : EMPTY;
  return sanitize(d, encodeState(link) ? mergeState(mine, link) : mine);
}

/** Un slug de profesión o de rasgo como los escribe Personaje (`police-officer`, `blacksmith-knowledge-blacksmith`). */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Los nombres que tiene cualquier objeto de JS (`constructor`, `tostring`…): nunca son una profesión ni un rasgo. */
const JS_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype).map((n) => n.toLowerCase()));
const okSlug = (x: string) => x.length <= 60 && SLUG_RE.test(x) && !JS_NAMES.has(x);
/**
 * El `?b=` de Personaje, limpio: la profesión y los rasgos con forma de slug, sin repetir y en orden (como `encode` de
 * `planner/build.ts`). No se valida contra las 14 profesiones de `craft.json`: ésas son sólo las que enseñan recetas, y
 * un personaje policía con un rasgo que sí enseña (Pescador, Herrería…) perdía el rasgo al llegar acá. Tampoco contra
 * la lista entera de Personaje: su decodificador trae los datos de Rasgos (~23 KB con gzip), más que la pestaña entera.
 * Una profesión o un rasgo que no existe no hace nada acá (`knownSet` lee sólo claves propias de `craft.json`) y
 * Personaje lo descarta al abrir el link. Nunca tira: cualquier texto da un `b` limpio o `null`.
 */
export function cleanB(b: string | null): string | null {
  const [prof = "", ...rest] = (b ?? "").trim().toLowerCase().split(".");
  if (!okSlug(prof)) return null;
  const traits = [...new Set(rest.filter(okSlug))].sort().slice(0, 40);
  return [prof, ...traits].join(".");
}

export function addTarget(st: CraftState, id: string): CraftState {
  const hit = st.q.find((t) => t.id === id);
  return hit ? setQty(st, id, hit.qty + 1) : { ...st, q: [...st.q, { id, qty: 1 }] };
}
export function setQty(st: CraftState, id: string, qty: number): CraftState {
  const n = clamp(qty);
  return { ...st, q: n > 0 ? st.q.map((t) => (t.id === id ? { id, qty: n } : t)) : st.q.filter((t) => t.id !== id) };
}
export const removeTarget = (st: CraftState, id: string): CraftState => setQty(st, id, 0);
export function setRecipe(st: CraftState, id: string, rid: string | null): CraftState {
  const r = { ...st.r };
  if (rid) r[id] = rid; else delete r[id];
  // Elegir una receta es querer fabricarlo: deja de estar entre lo que conseguís.
  return { ...st, r, leaf: st.leaf.filter((x) => x !== id) };
}
export function setOpt(st: CraftState, rid: string, li: number, opt: string | null): CraftState {
  const o = { ...st.o };
  if (opt) o[`${rid}.${li}`] = opt; else delete o[`${rid}.${li}`];
  return { ...st, o };
}
/** "Lo consigo" (`on`) o volver a lo de siempre. Es excluyente con "lo fabrico". */
export function setLeaf(st: CraftState, id: string, on: boolean): CraftState {
  const leaf = st.leaf.filter((x) => x !== id);
  return { ...st, leaf: on ? [...leaf, id] : leaf, make: on ? st.make.filter((x) => x !== id) : st.make };
}
export function setMake(st: CraftState, id: string, on: boolean): CraftState {
  const make = st.make.filter((x) => x !== id);
  return { ...st, make: on ? [...make, id] : make, leaf: on ? st.leaf.filter((x) => x !== id) : st.leaf };
}
export function setHave(st: CraftState, id: string, n: number): CraftState {
  const have = { ...st.have };
  if (clamp(n) > 0) have[id] = clamp(n); else delete have[id];
  return { ...st, have };
}
export const setB = (st: CraftState, b: string | null): CraftState => ({ ...st, b: b || null });
