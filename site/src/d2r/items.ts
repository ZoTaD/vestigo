/**
 * Las líneas de base del tooltip de un ítem (2026-09-29): defensa, daño y
 * requisitos, calculados como el juego a partir de la base y de sus
 * propiedades.
 *
 * - Un ítem con "% de defensa mejorada" siempre tiene la defensa máxima de su
 *   base, y sobre esa se aplica el porcentaje; después se suma la defensa plana.
 * - El daño mejorado se aplica al daño de la base (una mano, dos manos,
 *   arrojamiento), y después se suma el daño mínimo y máximo plano.
 * - "-X% de requisitos" baja la fuerza y la destreza requeridas.
 */
import type { Lang, Prop } from "./stats";
import { gameStr, type Base } from "./wiki";

const range = (a: number, b: number) => (a === b ? String(a) : `(${a}-${b})`);

/** El rango [mín, máx] de una propiedad sumada (0 si no está). */
function sumProp(props: Prop[], codes: string[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const [c, , min, max] of props) {
    if (!codes.includes(c)) continue;
    lo += min;
    hi += max;
  }
  return [lo, hi];
}

/** Las líneas de base: defensa o daño, bloqueo y requisitos. */
export function baseLines(base: Base | undefined, props: Prop[], lang: Lang, reqLevel?: number): string[] {
  const out: string[] = [];
  const T = (k: string) => gameStr(k, lang);
  if (base?.def) {
    const [edLo, edHi] = sumProp(props, ["ac%"]);
    const [acLo, acHi] = sumProp(props, ["ac"]);
    const [dLo, dHi] = base.def;
    const lo = edLo || edHi ? Math.floor((dHi * (100 + edLo)) / 100) + acLo : dLo + acLo;
    const hi = edLo || edHi ? Math.floor((dHi * (100 + edHi)) / 100) + acHi : dHi + acHi;
    out.push(T("ItemStats1h").replace("%d", range(lo, hi)));
  }
  if (base?.dmg) {
    const [edLo, edHi] = sumProp(props, ["dmg%"]);
    const [minLo, minHi] = sumProp(props, ["dmg-min", "dmg-norm"]);
    const [maxLo, maxHi] = sumProp(props, ["dmg-max", "dmg-norm"]);
    const dmg = (pair: [number, number], key: string) => {
      const a = Math.floor((pair[0] * (100 + edLo)) / 100) + minLo;
      const a2 = Math.floor((pair[0] * (100 + edHi)) / 100) + minHi;
      const b = Math.floor((pair[1] * (100 + edLo)) / 100) + maxLo;
      const b2 = Math.floor((pair[1] * (100 + edHi)) / 100) + maxHi;
      const fmt = T(key);
      const parts = [range(a, a2), range(Math.max(b, a), Math.max(b2, a2))];
      let i = 0;
      out.push(fmt.replace(/%d/g, () => parts[i++] ?? ""));
    };
    if (base.dmg.throw) dmg(base.dmg.throw, "strItemStatThrowDamageRange");
    if (base.dmg.one && base.hands !== 2) dmg(base.dmg.one, "ItemStats1l");
    if (base.dmg.two) dmg(base.dmg.two, "ItemStats1m");
  }
  const [ease] = sumProp(props, ["ease"]);
  const req = (v: number) => Math.max(0, Math.floor((v * (100 + ease)) / 100));
  if (base && base.req.str) out.push(T("ItemStats1e").replace("%d", String(req(base.req.str))));
  if (base && base.req.dex) out.push(T("ItemStats1f").replace("%d", String(req(base.req.dex))));
  const lvl = reqLevel ?? base?.req.lvl ?? 0;
  if (lvl) out.push(T("ItemStats1p").replace("%d", String(lvl)));
  return out.filter(Boolean);
}

/**
 * El orden de las categorías en las listas (el del filtro de botín del juego):
 * primero lo que se viste, después las armas, después la joyería y los talismanes.
 */
export const CATEGORY_ORDER = [
  "helms", "circl", "armor", "shlds", "glove", "boots", "belts",
  "barbh", "druid", "necro", "palad", "warlo",
  "axes", "bows", "xbows", "daggs", "javel", "maces", "poles", "scept", "spear", "stave", "sword", "throw", "wands",
  "amazo", "assas", "sorce",
  "amule", "rings", "charm", "jewel",
];

/** El grupo grande de cada categoría, para los filtros: lo que se viste, armas, accesorios. */
export function groupOf(cat: string | null | undefined): "armor" | "weapon" | "acc" {
  if (!cat) return "acc";
  const i = CATEGORY_ORDER.indexOf(cat);
  if (i < 0 || i >= CATEGORY_ORDER.indexOf("amule")) return "acc";
  return i < CATEGORY_ORDER.indexOf("axes") ? "armor" : "weapon";
}
