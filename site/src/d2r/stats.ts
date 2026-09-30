/**
 * El motor de textos de Diablo II (2026-09-29): de las propiedades de un ítem
 * ([código, parámetro, mín, máx], tal como las escribe `games/d2r/tools/wiki.py`)
 * a las líneas del tooltip, en inglés y en español de Latinoamérica, con las
 * mismas reglas que usa el juego (`itemstatcost.txt`: descfunc, descval,
 * dgrp). Lo usan las fichas de la wiki y el planificador, así que un ítem se lee
 * igual en los dos lados.
 *
 * Tres cosas del juego que no son obvias:
 * - Los textos en español usan marcadores posicionales (`%0`, `%1`, `%2`) y
 *   cambian el orden de las palabras; los de inglés van en orden (`%d … %s`).
 *   `sprintf` entiende las dos formas con los mismos argumentos.
 * - Las stats "por nivel" guardan el valor en octavos: `par` 12 es 1,5 por nivel.
 * - Si las cuatro resistencias (o los cuatro atributos) valen lo mismo, el juego
 *   escribe una sola línea de grupo ("+X a todas las resistencias").
 */

export type Lang = "en" | "es";
export type Loc = { en: string; es: string };
/** Una propiedad tal como está en las tablas: [código, parámetro, mín, máx]. */
export type Prop = [string, number | string, number, number];

export interface StatInfo {
  id: number;
  /** descpriority: las líneas van de mayor a menor. */
  p: number;
  /** descfunc */
  f: number;
  /** descval */
  v: number;
  pos?: string;
  neg?: string;
  s2?: string;
  g?: number;
  gf?: number;
  gv?: number;
  gpos?: string;
  gneg?: string;
  gs2?: string;
}

export interface Engine {
  stats: Record<string, StatInfo>;
  props: Record<string, { f: number; s: string | null; v: number | null }[]>;
  skills: Record<string, { name: Loc; cls: number | null }>;
  classes: { id: string; code: string; all: string; only: string; tabs: string[]; base: Record<string, number | null> }[];
  monsters: Record<string, Loc>;
  str: Record<string, Loc>;
}

/**
 * Una stat ya convertida desde su propiedad. `min`/`max` son el rango con que
 * puede salir; `perLevel` es el valor en octavos por nivel de personaje.
 */
export interface Stat {
  s: string;
  par?: number;
  min: number;
  max: number;
  perLevel?: number;
  /** Para las habilidades con evento o cargas: [probabilidad o cargas, nivel]. */
  a?: number;
  b?: number;
}

/** Una línea del tooltip. `p` es su prioridad (las de mayor prioridad van primero). */
export interface Line {
  text: string;
  p: number;
}

/** Pseudo-stats que no existen como tales en el juego pero que el tooltip escribe aparte. */
const ED = "~ed";
const SOCKETS = "item_numsockets";
const ETHEREAL = "~ethereal";
const INDESTRUCTIBLE = "item_indesctructible";
const RAND_CLASS = "~randclass";

/**
 * `sprintf` del juego: `%d`, `%+d`, `%i`, `%s`, `%%` en orden, y `%0`…`%9` por
 * posición. Un argumento de texto (un rango "(20-30)") se escribe tal cual, con
 * el signo adelante si el formato lo pide.
 */
export function sprintf(fmt: string, args: (number | string)[]): string {
  let seq = 0;
  return fmt.replace(/%(%|\+?[dui]|s|\d)/g, (_, t: string) => {
    if (t === "%") return "%";
    const a = /^\d$/.test(t) ? args[Number(t)] : args[seq++];
    if (a === undefined) return "";
    if (t.startsWith("+")) {
      if (typeof a === "number") return a >= 0 ? `+${a}` : String(a);
      return a.startsWith("-") || a.startsWith("+") ? a : `+${a}`;
    }
    return String(a);
  });
}

const say = (E: Engine, key: string | undefined, lang: Lang): string => (key ? E.str[key]?.[lang] ?? "" : "");

/** De propiedades a stats, con la función de cada una (`properties.txt`). */
export function toStats(props: Prop[], E: Engine): Stat[] {
  const out: Stat[] = [];
  for (const [code, par, min, max] of props) {
    const fs = E.props[code];
    if (!fs) continue;
    const npar = typeof par === "number" ? par : Number.parseInt(par, 10);
    for (const { f, s, v } of fs) {
      switch (f) {
        case 5: out.push({ s: "mindamage", min, max }); break;
        case 6: out.push({ s: "maxdamage", min, max }); break;
        case 7: out.push({ s: ED, min, max }); break;
        case 10: // Pestaña de habilidades: el parámetro es clase×3 + pestaña.
        case 22: // Una habilidad (de clase, de otra clase o un aura): el parámetro es la habilidad.
          if (s) out.push({ s, par: npar, min, max });
          break;
        case 11: // Habilidad con evento: mín = probabilidad, máx = nivel.
        case 19: // Cargas: mín = cargas, máx = nivel.
          if (s) out.push({ s, par: npar, min: 0, max: 0, a: min, b: max });
          break;
        case 12: // Habilidad al azar de un rango: se muestra como "+N a una habilidad".
          out.push({ s: "item_singleskill", par: -1, min: npar || min, max: npar || max });
          break;
        case 13: break; // Durabilidad máxima: va en la línea de durabilidad de la base.
        case 14: out.push({ s: SOCKETS, min: min || npar, max: max || npar }); break;
        case 15: if (s) out.push({ s, min, max: min }); break;
        case 16: if (s) out.push({ s, min: max, max }); break;
        case 17:
          if (!s) break;
          // Las "por nivel" (y la duración del frío o el veneno) usan el parámetro.
          if (s.endsWith("_perlevel") || s.includes("perlevel")) out.push({ s, min: 0, max: 0, perLevel: npar });
          else if (s === "coldlength" || s === "poisonlength") out.push({ s, min: npar || min, max: npar || max });
          else out.push({ s, min: Number.isFinite(npar) ? npar : min, max: Number.isFinite(npar) ? npar : max });
          break;
        case 20: out.push({ s: INDESTRUCTIBLE, min: 1, max: 1 }); break;
        case 23: out.push({ s: ETHEREAL, min: 1, max: 1 }); break;
        case 24: if (s === "item_reanimate") out.push({ s, par: npar, min, max }); break;
        case 21: if (s) out.push({ s, par: v ?? npar, min, max }); break;
        case 36: out.push({ s: RAND_CLASS, min, max }); break;
        default:
          if (s) out.push({ s, par: Number.isFinite(npar) ? npar : undefined, min, max });
      }
    }
  }
  return out;
}

/** Suma stats iguales (misma stat y mismo parámetro): lo que hace el planificador con todo el equipo. */
export function sumStats(stats: Stat[]): Stat[] {
  const byKey = new Map<string, Stat>();
  for (const st of stats) {
    // Las habilidades con evento y las cargas no se suman: son líneas distintas.
    if (st.a !== undefined) {
      byKey.set(`${st.s}|${st.par}|${byKey.size}`, { ...st });
      continue;
    }
    const k = `${st.s}|${st.par ?? ""}`;
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, { ...st });
    else {
      cur.min += st.min;
      cur.max += st.max;
      if (st.perLevel) cur.perLevel = (cur.perLevel ?? 0) + st.perLevel;
    }
  }
  return [...byKey.values()];
}

/** El valor de una stat para un nivel de personaje (el máximo del rango, o lo elegido). */
export function valueAt(st: Stat, clvl: number, pick: "min" | "max" = "max"): number {
  const base = pick === "min" ? st.min : st.max;
  return st.perLevel ? base + Math.floor((st.perLevel * clvl) / 8) : base;
}

/**
 * El valor como lo escribe la wiki: "25", "(20-30)", o para las stats por nivel
 * el rango entre el nivel 1 y el 99 ("(0-74)"), que es como se leen en las wikis
 * del juego y encaja en cualquier orden de palabras del texto.
 */
function shown(st: Stat, lang: Lang, clvl?: number): number | string {
  if (st.perLevel) {
    if (clvl) return valueAt(st, clvl);
    const lo = st.min + Math.floor(st.perLevel / 8);
    const hi = st.max + Math.floor((st.perLevel * 99) / 8);
    return lo === hi ? lo : `(${lo}-${hi})`;
  }
  if (st.min === st.max) return st.min;
  if (st.min < 0 && st.max < 0) return `-(${-st.max}-${-st.min})`;
  return `(${st.min}-${st.max})`;
}

const rangeText = (a: number, b: number) => (a === b ? String(a) : `(${a}-${b})`);

/** El nombre de una habilidad; `-1` es "una habilidad al azar". */
function skillName(E: Engine, id: number | undefined, lang: Lang): string {
  if (id === undefined || id < 0) return lang === "es" ? "una habilidad al azar" : "a random skill";
  return E.skills[String(id)]?.name[lang] ?? `#${id}`;
}

/**
 * Las líneas del tooltip para un conjunto de stats, ordenadas como en el juego.
 * `clvl` resuelve las stats por nivel a un número (el planificador); sin él se
 * escriben "por nivel" (las fichas).
 */
export function describe(stats: Stat[], E: Engine, lang: Lang, clvl?: number): Line[] {
  const lines: Line[] = [];
  const left = new Map<string, Stat[]>();
  for (const st of stats) left.set(st.s, [...(left.get(st.s) ?? []), st]);
  const take = (s: string): Stat | undefined => {
    const xs = left.get(s);
    if (!xs?.length) return undefined;
    const st = xs.shift();
    if (!xs.length) left.delete(s);
    return st;
  };
  const prio = (s: string, fallback = 0) => E.stats[s]?.p ?? fallback;
  const T = (key: string) => say(E, key, lang);

  // Daño mejorado.
  const ed = take(ED);
  if (ed) lines.push({ text: sprintf(T("strModEnhancedDamage"), [shown(ed, lang, clvl)]), p: prio("item_maxdamage_percent", 129) });

  // Rangos de daño: "Agrega X-Y de daño de fuego" si están el mínimo y el máximo.
  const ranges: [string, string, string, string][] = [
    ["mindamage", "maxdamage", "strModMinDamageRange", "strModMinDamage"],
    ["firemindam", "firemaxdam", "strModFireDamageRange", "strModFireDamage"],
    ["lightmindam", "lightmaxdam", "strModLightningDamageRange", "strModLightningDamage"],
    ["coldmindam", "coldmaxdam", "strModColdDamageRange", "strModColdDamage"],
    ["magicmindam", "magicmaxdam", "strModMagicDamageRange", "strModMagicDamage"],
  ];
  for (const [lo, hi, rangeKey, oneKey] of ranges) {
    if (!left.has(lo) || !left.has(hi)) continue;
    const a = take(lo)!;
    const b = take(hi)!;
    const text =
      a.min === a.max && b.min === b.max && a.min === b.min
        ? sprintf(T(oneKey), [a.min])
        : sprintf(T(rangeKey), [rangeText(a.min, a.max), rangeText(b.min, b.max)]);
    lines.push({ text, p: prio(lo) });
    if (lo === "coldmindam") take("coldlength");
  }
  // Veneno: el juego guarda el daño por cuadro (en 256avos) y la duración en cuadros (25 por segundo).
  if (left.has("poisonmindam") && left.has("poisonmaxdam")) {
    const a = take("poisonmindam")!;
    const b = take("poisonmaxdam")!;
    const len = take("poisonlength");
    const frames = len ? len.max : 0;
    const dmg = (x: number) => Math.round((x * frames) / 256);
    const secs = frames ? Math.round(frames / 25) : 0;
    const text =
      a.min === b.max && a.min === a.max
        ? sprintf(T("strModPoisonDamage"), [dmg(a.min), secs])
        : sprintf(T("strModPoisonDamageRange"), [rangeText(dmg(a.min), dmg(a.max)), rangeText(dmg(b.min), dmg(b.max)), secs]);
    lines.push({ text, p: prio("poisonmindam") });
  }
  take("coldlength");
  take("poisonlength");

  // Grupos: si todas las stats de un grupo valen lo mismo, una sola línea.
  const groups = new Map<number, string[]>();
  for (const [name, info] of Object.entries(E.stats)) if (info.g) groups.set(info.g, [...(groups.get(info.g) ?? []), name]);
  for (const [, members] of groups) {
    const got = members.map((m) => left.get(m)?.[0]);
    if (got.some((x) => !x)) continue;
    const first = got[0]!;
    if (!got.every((x) => x!.min === first.min && x!.max === first.max && x!.perLevel === first.perLevel)) continue;
    const info = E.stats[members[0]];
    members.forEach((m) => take(m));
    lines.push({ text: sprintf(T(info.gpos ?? info.pos ?? ""), [shown(first, lang, clvl)]), p: Math.max(...members.map((m) => prio(m))) });
  }

  // Todo lo demás, con la función de descripción de cada stat.
  for (const [name, xs] of [...left.entries()]) {
    for (const st of xs) {
      const text = line(st, name, E, lang, clvl);
      if (text) lines.push({ text, p: prio(name, name === SOCKETS ? -1 : 0) });
    }
  }
  return lines.sort((x, y) => y.p - x.p);
}

function line(st: Stat, name: string, E: Engine, lang: Lang, clvl?: number): string {
  const T = (key: string | undefined) => say(E, key, lang);
  if (name === SOCKETS) return sprintf(T("Socketable"), [rangeText(st.min, st.max)]);
  if (name === INDESTRUCTIBLE) return T("ModStre9s");
  if (name === ETHEREAL) return T("strethereal");
  if (name === RAND_CLASS) return sprintf(T("ChronicleRandomClassSkillLevel"), [shown(st, lang, clvl)]);
  const info = E.stats[name];
  if (!info) return "";
  const value = shown(st, lang, clvl);
  const neg = typeof value === "number" ? value < 0 : value.startsWith("-");
  const fmt = T(neg && info.neg ? info.neg : info.pos);
  const tail = info.s2 ? ` ${T(info.s2)}` : "";
  const cls = (i: number | null | undefined) => (i === null || i === undefined ? undefined : E.classes[i]);
  switch (info.f) {
    case 0: return "";
    case 5: return sprintf(fmt, [typeof value === "number" ? Math.round((value * 100) / 128) : value]);
    case 11: {
      // "Repara 1 de durabilidad en X segundos": el valor es cuántas centésimas de punto por segundo.
      const v = typeof value === "number" ? value : st.max;
      return v ? sprintf(T("ModStre9u"), [1, Math.round(100 / v)]) : "";
    }
    case 12: {
      // "Golpear al objetivo lo ciega" y "+N" sólo si pasa de 1.
      const v = typeof value === "number" ? value : st.max;
      return v > 1 ? `${fmt} +${v}` : fmt;
    }
    case 13: {
      const c = cls(st.par);
      return c ? sprintf(T(c.all), [value]) : "";
    }
    case 14: {
      const par = st.par ?? 0;
      const c = cls(Math.floor(par / 3));
      if (!c) return "";
      return `${sprintf(T(c.tabs[par % 3]), [value])} ${T(c.only)}`.trim();
    }
    case 15: return sprintf(fmt, [st.a ?? 0, st.b ?? 0, skillName(E, st.par, lang)]);
    case 16: return sprintf(fmt, [value, skillName(E, st.par, lang)]);
    case 23: return sprintf(fmt, [value, E.monsters[String(st.par)]?.[lang] ?? ""]);
    case 24: return sprintf(fmt, [st.b ?? 0, skillName(E, st.par, lang), st.a ?? 0, st.a ?? 0]);
    case 27: {
      const sk = E.skills[String(st.par)];
      const c = cls(sk?.cls);
      return sprintf(fmt, [value, skillName(E, st.par, lang), c ? T(c.only) : ""]).trim();
    }
    case 28: return sprintf(fmt, [value, skillName(E, st.par, lang)]);
    case 29: return sprintf(fmt, [typeof value === "number" ? Math.abs(value) : value.replace(/^-/, "")]) + tail;
    default: return sprintf(fmt, [value]) + tail;
  }
}

/** Atajo: las líneas de un ítem a partir de sus propiedades. */
export const describeProps = (props: Prop[], E: Engine, lang: Lang, clvl?: number): string[] =>
  describe(toStats(props, E), E, lang, clvl).map((l) => l.text);
