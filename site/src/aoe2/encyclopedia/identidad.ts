/**
 * Qué es cada civ de un vistazo (2026-11-26, maqueta A de la ficha del árbol): sus mejores unidades, lo que le falta
 * que más pesa y los bonos de civ que toca cada unidad, todo calculado con los datos del juego (sin opiniones a mano).
 * Sin React; tests en `test/aoe2Identidad.test.ts`.
 *
 * - **Mejores unidades**: la última unidad de cada línea que la civ tiene (más la única), armada con sus mejoras y bonos
 *   y comparada con la misma unidad genérica con todas las mejoras comunes (`fuerza`). S = un 4% mejor o más; A = casi
 *   igual (desde -4%), o la única; B = el resto. Así el Paladín franco es S aunque no tenga Pureza de sangre: su +20% de
 *   PV la compensa. Asedio, barcos y monjes sólo entran si un bono los toca (casi todas las civs los tienen completos y
 *   llenarían la lista); del castillo, sólo la única (no el trebuchet).
 * - **Lo que más pesa** de lo que falta: la última unidad de una línea o una tecnología que mejora 30 unidades o más.
 * - Las tecnologías únicas que traen sus efectos en los datos (Yeomen de los Britanos, sí; Código caballeresco, no)
 *   suman su nombre a las etiquetas de la unidad que mejoran.
 */
import type { Lang } from "../../i18n";
import { aplicar, claseValor, type Combatiente, type Fx } from "./calc";
import { armar, base, mejorasPara } from "./armar";
import { estado, type Arbol, type CivFx, type Nombre, type Tecnologia, type Unidad } from "./data";

/** Lo que tiene menos de esta parte de las civs es regional o único: si falta, no cuenta como "le falta". */
export const COMUN = 0.3;
const MILITAR = new Set([12, 87, 101]);
const CASTILLO = 82;
const SOLO_CON_BONO = new Set([49, 45, 104]);
const MAX_POR_EDIFICIO = 2;
const MAX = 5;

export type Tier = "S" | "A" | "B";
export type Mejor = {
  unidad: Unidad;
  tier: Tier;
  unica: boolean;
  /** Los bonos de civ que la tocan, en texto corto ("+20% PV"). */
  bonos: string[];
  /** Las tecnologías únicas de la civ que la mejoran. */
  unicas: Tecnologia[];
  /** Mejoras comunes que no tiene. */
  faltan: Tecnologia[];
  /** Cuánto mejor que la misma unidad genérica con todas las mejoras comunes (1 = igual). */
  fuerza: number;
};

const comunes = new Map<Arbol, Map<string, number>>();
/** Qué parte de las civs tiene cada nodo. */
export function parteCivs(a: Arbol, nodo: string): number {
  let m = comunes.get(a);
  if (!m) {
    m = new Map();
    const civs = Object.values(a.civs);
    a.nodes.forEach((n, i) => m!.set(n, civs.filter((s) => s[i] !== "0").length / Math.max(1, civs.length)));
    comunes.set(a, m);
  }
  return m.get(nodo) ?? 0;
}

const toca = (u: Unidad, [, uid, cls]: Fx) => (uid !== -1 && uid === u.id) || (uid === -1 && cls !== -1 && cls === u.class);

const pct = (v: number) => Math.round(Math.abs(v - 1) * 100);
const ARMOR: Record<Lang, Record<number, string>> = {
  en: { 3: "pierce armor", 4: "melee armor" },
  es: { 3: "armadura a distancia", 4: "armadura cuerpo a cuerpo" },
};

/** Un efecto en pocas palabras ("+20% PV", "+1 ataque", "-15% costo"); null si no es de los que se entienden solos. */
export function fxCorto([tipo, , , attr, d]: Fx, lang: Lang, clases: Record<string, Nombre> = {}): string | null {
  const es = lang === "es";
  const signo = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (attr === 0) {
    if (tipo === 5) return `${d >= 1 ? "+" : "-"}${pct(d)}% ${es ? "PV" : "HP"}`;
    if (tipo === 4) return `${signo(Math.round(d))} ${es ? "PV" : "HP"}`;
  }
  if (attr === 9 && tipo === 4) {
    const [c, v] = claseValor(d);
    if (!v) return null;
    if (c === 3 || c === 4) return `${signo(v)} ${es ? "ataque" : "attack"}`;
    const contra = clases[String(c)]?.[lang];
    return contra ? `${signo(v)} ${es ? "ataque contra" : "attack vs"} ${contra.toLowerCase()}` : null;
  }
  if (attr === 9 && tipo === 5) return null;
  if (attr === 8 && tipo === 4) {
    const [c, v] = claseValor(d);
    return v && ARMOR[lang][c] ? `${signo(v)} ${ARMOR[lang][c]}` : null;
  }
  if (attr === 100 && tipo === 5) return `${d < 1 ? "-" : "+"}${pct(d)}% ${es ? "costo" : "cost"}`;
  if (attr === 5 && tipo === 5) return `${d >= 1 ? "+" : "-"}${pct(d)}% ${es ? "velocidad" : "speed"}`;
  if (attr === 10 && tipo === 5 && d > 0) return `${d < 1 ? "+" : "-"}${Math.round(Math.abs(1 / d - 1) * 100)}% ${es ? "cadencia" : "rate of fire"}`;
  if (attr === 1 && tipo === 4) return `${signo(Math.round(d))} ${es ? "visión" : "line of sight"}`;
  if (attr === 12 && tipo === 4) return `${signo(Math.round(d))} ${es ? "alcance" : "range"}`;
  return null;
}

/** Los bonos de civ (no los de equipo) que tocan a una unidad, en texto corto. Los efectos del mismo atributo se juntan
 * antes de escribirlos: los Britanos dan +1 de alcance a los arqueros de a pie en Castillos y otro en Imperial, y se lo
 * sacan al Guerrillero; eso es "+2 alcance" para el Arquero de tiro largo y nada para el Guerrillero. */
export function bonosDe(u: Unidad, civ: string, fx: CivFx, lang: Lang, clases: Record<string, Nombre> = {}): string[] {
  const suma = new Map<string, Fx>();
  const orden: string[] = [];
  for (const [, fxs] of fx[civ]?.bonus ?? []) {
    for (const f of fxs) {
      if (!toca(u, f)) continue;
      const [tipo, , , attr, d] = f;
      if (tipo !== 4 && tipo !== 5) continue;
      // Ataque y armadura van por clase (el valor lleva la clase × 256); lo demás, por atributo.
      const clase = attr === 8 || attr === 9 ? claseValor(d)[0] : -1;
      const k = `${tipo}|${attr}|${clase}`;
      const prev = suma.get(k);
      if (!prev) {
        suma.set(k, [tipo, -1, -1, attr, d]);
        orden.push(k);
      } else if (tipo === 5) prev[4] *= d;
      else prev[4] = attr === 8 || attr === 9 ? clase * 256 + (claseValor(prev[4])[1] + claseValor(d)[1]) : prev[4] + d;
    }
  }
  const out: string[] = [];
  for (const k of orden) {
    const f = suma.get(k)!;
    const neutro = f[0] === 5 ? Math.abs(f[4] - 1) < 1e-6 : f[3] === 8 || f[3] === 9 ? claseValor(f[4])[1] === 0 : Math.abs(f[4]) < 1e-6;
    if (neutro) continue;
    const txt = fxCorto(f, lang, clases);
    if (txt && !out.includes(txt)) out.push(txt);
  }
  return out;
}

/** Las mejoras comunes de una unidad que la civ no tiene. */
export function mejorasQueFaltan(u: Unidad, civ: string, a: Arbol, ts: ReadonlyMap<number, Tecnologia>): Tecnologia[] {
  return u.upgrades
    .map((id) => ts.get(id))
    .filter((x): x is Tecnologia => !!x && x.kind === "Research" && parteCivs(a, `t${x.id}`) >= COMUN && estado(a, civ, `t${x.id}`) === "0");
}

/** La última de su línea que tiene la civ (el Paladín y no el Caballero). */
function esUltima(u: Unidad, civ: string, a: Arbol): boolean {
  const i = u.line.indexOf(u.id);
  return u.line.slice(i + 1).every((id) => estado(a, civ, `u${id}`) === "0");
}

const ORDEN: Record<Tier, number> = { S: 0, A: 1, B: 2 };

const ataque = (c: Combatiente) => Math.max(c.attacks[4] ?? 0, c.attacks[3] ?? 0, 1);
const armadura = (c: Combatiente) => (c.armors[4] ?? 0) + (c.armors[3] ?? 0);

/** La unidad de la civ (con lo que tiene y sus bonos) contra la genérica con todas las mejoras comunes: vida × ataque ×
 * cadencia, más un 8% por cada punto de armadura de diferencia, un 5% por casilla de alcance y la mitad de lo que le
 * baje el costo un bono. */
export function fuerza(u: Unidad, civ: string, a: Arbol, ts: readonly Tecnologia[], fx: CivFx): number {
  const comunes = ts.filter((x) => u.upgrades.includes(x.id) && x.kind === "Research" && x.fx.length > 0 && parteCivs(a, `t${x.id}`) >= COMUN).sort((x, y) => x.age - y.age || x.id - y.id);
  const gen = aplicar(base(u), comunes.flatMap((x) => x.fx));
  const suya = armar(u, civ, 4, fx, mejorasPara(ts, a, civ, u, 4));
  let r = (suya.hp / Math.max(1, gen.hp)) * (ataque(suya) / ataque(gen)) * (suya.reload > 0 && gen.reload > 0 ? gen.reload / suya.reload : 1);
  r *= 1 + 0.08 * (armadura(suya) - armadura(gen));
  r *= 1 + 0.05 * (suya.range - gen.range);
  for (const [, fxs] of fx[civ]?.bonus ?? []) for (const f of fxs) if (f[3] === 100 && f[0] === 5 && f[4] < 1 && toca(u, f)) r *= 1 + (1 - f[4]) / 2;
  return r;
}

/** Sus mejores unidades, de la más fuerte a la menos (hasta 5, no más de 2 del mismo edificio). */
export function mejoresUnidades(
  civ: string,
  a: Arbol,
  us: readonly Unidad[],
  ts: readonly Tecnologia[],
  fx: CivFx,
  lang: Lang,
  clases: Record<string, Nombre> = {},
): Mejor[] {
  const tecs = new Map(ts.map((x) => [x.id, x]));
  const cand: Mejor[] = [];
  for (const u of us) {
    if (estado(a, civ, `u${u.id}`) === "0") continue;
    const unica = u.kind === "UniqueUnit";
    const militar = MILITAR.has(u.building) || (u.building === CASTILLO && unica);
    const conBono = SOLO_CON_BONO.has(u.building);
    if (!militar && !conBono) continue;
    if (u.slug.endsWith(`-${u.id}`)) continue;
    // Lo de Feudal (Explorador, Hombre de armas) no es "su mejor unidad", salvo la única.
    if (u.age <= 2 && !unica) continue;
    if (!esUltima(u, civ, a)) continue;
    const bonos = bonosDe(u, civ, fx, lang, clases);
    const unicas = ts.filter((x) => x.kind === "UniqueTech" && estado(a, civ, `t${x.id}`) !== "0" && x.fx.some((f) => toca(u, f)));
    if (conBono && !bonos.length && !unicas.length) continue;
    const faltan = mejorasQueFaltan(u, civ, a, tecs);
    const f = fuerza(u, civ, a, ts, fx);
    const tier: Tier = f >= 1.04 ? "S" : f >= 0.96 || unica ? "A" : "B";
    cand.push({ unidad: u, tier, unica, bonos, unicas, faltan, fuerza: f });
  }
  // Si dos candidatas son de la misma línea (Drakkar y Drakkar de élite), queda la de más adelante.
  // Las regionales traen la línea sola: ahí la de élite se reconoce por el slug.
  const enLinea = (m: Mejor) =>
    cand.some((o) => o !== m && ((o.unidad.line.indexOf(m.unidad.id) >= 0 && o.unidad.line.indexOf(m.unidad.id) < o.unidad.line.indexOf(o.unidad.id)) || o.unidad.slug === `elite-${m.unidad.slug}`));
  const solas = cand.filter((m) => !enLinea(m));
  cand.length = 0;
  cand.push(...solas);
  // Los barcos al final del empate: lo que se busca es en qué es fuerte en tierra.
  cand.sort((x, y) => ORDEN[x.tier] - ORDEN[y.tier] || Number(x.unidad.naval) - Number(y.unidad.naval) || y.fuerza - x.fuerza || Number(y.unica) - Number(x.unica) || y.unidad.hp - x.unidad.hp);
  const porEdificio = new Map<number, number>();
  const out: Mejor[] = [];
  for (const m of cand) {
    const n = porEdificio.get(m.unidad.building) ?? 0;
    if (n >= MAX_POR_EDIFICIO && !m.unica) continue;
    porEdificio.set(m.unidad.building, n + 1);
    out.push(m);
    if (out.length >= MAX) break;
  }
  // La única siempre aparece, aunque no entre por puntaje.
  const uu = cand.find((m) => m.unica);
  if (uu && !out.includes(uu)) out[out.length - 1] = uu;
  return out;
}

/** Si lo que falta pesa en una partida: la última unidad de su línea, o una tecnología que mejora 30 unidades o más. */
export function pesa(k: "u" | "t", id: number, us: ReadonlyMap<number, Unidad>, ts: ReadonlyMap<number, Tecnologia>): boolean {
  if (k === "t") return (ts.get(id)?.units.length ?? 0) >= 30;
  const u = us.get(id);
  return !!u && u.line[u.line.length - 1] === u.id && u.line.length > 1;
}
