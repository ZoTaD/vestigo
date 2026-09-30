/**
 * Cómo se leen las chances en la calculadora (2026-09-29): "1 en 3.912", que
 * es como lo dice un jugador, con los millones en palabras, y los nombres de
 * TC que se pueden decir en castellano ("armaduras hasta nivel 60").
 */
import type { D2rCopy } from "../../d2rCopy";

type DropsCopy = D2rCopy["drops"];

/** Lo que se escribe donde una chance sería cero: no sale nunca. */
const NONE = "—";

/**
 * El N de "1 en N": "3,3" (bajo 10 lleva un decimal), "3.912" (de 10 para
 * arriba va entero) o "2,1 millones"; "—" si no sale nunca. Una chance casi
 * segura (N bajo 1,05) daría "1": eso lo resuelve `odds`, que es lo que se usa.
 */
export function oddsN(p: number, locale: string, td: DropsCopy): string {
  // Sin chance no hay N: 1 / 0 daría "∞ millones".
  if (!(p > 0)) return NONE;
  const n = 1 / p;
  if (n >= 1e6) return td.million((n / 1e6).toLocaleString(locale, { maximumFractionDigits: 1 }));
  return n < 10 ? n.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString(locale);
}

/**
 * Lo que se lee de una chance: "1 en 3.912" (lo de siempre), "siempre" si es 1
 * y "—" si no sale nunca. Una casi segura no cabe en "1 en N": pasado 0,952 el N
 * (menor que 1,05) se redondea a "1" y "1 en 1" parecería certeza para un 97,7%.
 * Esas van en porcentaje, con un decimal como mucho y redondeado para abajo, así
 * nunca dice 100 sin serlo ("97,7%", "99,9%").
 */
export function odds(p: number, locale: string, td: DropsCopy): string {
  if (!(p > 0)) return NONE;
  if (p >= 1) return td.always;
  if (1 / p < 1.05) {
    // El 1e-9 tapa el error de coma flotante (0,977 · 1000 puede dar 976,99…); el tope, que 0,9999999999 llegue a 100.
    const tenths = Math.min(999, Math.floor(p * 1000 + 1e-9));
    return td.pct((tenths / 10).toLocaleString(locale, { maximumFractionDigits: 1 }));
  }
  return td.oneIn(oddsN(p, locale, td));
}

/**
 * Los TC de acto: "Act 5 (N) Equip C", "Act 1 Good", "Act 5 (H) Champ C Desecrated". El acto, la dificultad ((N) Pesadilla,
 * (H) Infierno, nada Normal), el tipo, la letra (que sólo ordena la cadena) y si es de Zona de Terror.
 */
const ACT_TC = /^Act (\d) (?:\((N|H)\) )?(\w+)(?: [A-Z]x?)?( Desecrated)?$/;

/**
 * Cómo se dice un TC en "¿De dónde sale este número?": los automáticos ("armaduras hasta nivel 60"), las runas y los de acto
 * ("Acto 5 · Pesadilla · equipo", con "· Zona de Terror" si es de una) se pueden decir; el resto (los Worldstone Shards, las
 * sub-TCs de un jefe como "Countess Rune (H)") queda como lo llama el juego.
 */
export function tcLabel(name: string, td: DropsCopy): string {
  const m = /^(weap|armo|mele|bow)(\d+)$/.exec(name);
  if (m) return { weap: td.tcWeap, armo: td.tcArmo, mele: td.tcMele, bow: td.tcBow }[m[1] as "weap" | "armo" | "mele" | "bow"](m[2]);
  const r = /^Runes (\d+)$/.exec(name);
  if (r) return td.tcRunes(r[1]);
  const a = ACT_TC.exec(name);
  // Sólo los tipos que tienen nombre en la copia: uno nuevo de un parche queda como lo llama el juego hasta que se lo nombre.
  if (!a || !Object.prototype.hasOwnProperty.call(td.tcKinds, a[3])) return name;
  const diff = td.diffs[a[2] === "H" ? 2 : a[2] === "N" ? 1 : 0];
  return [td.act(Number(a[1])), diff, td.tcKinds[a[3] as keyof DropsCopy["tcKinds"]], ...(a[4] ? [td.tzBadge] : [])].join(" · ");
}
