/**
 * Los lugares donde se farmea (2026-09-29): jefes, superúnicos y los monstruos
 * de cada área, en cada dificultad, con y sin Zona de Terror. Acá se decide el
 * TC de cada muerte (con su mejora por nivel) y su nivel; la chance la da el
 * motor. Reglas en docs/design/2026-09-29-d2r-calculadora-drops.md.
 */
import type { Indexed } from "./data";
import { chancePerKill, reach } from "./engine";
import { targetParam } from "./farm";
import { upgradeTc } from "./rules";
import type { Diff, DropArea, DropSource, KillCtx, Settings, Target } from "./types";

export type Cat = "normal" | "champ" | "unique" | "herald";
export const CATS: Cat[] = ["normal", "champ", "unique", "herald"];

/** Lo que cambia dónde y cómo muere el monstruo: Zona de Terror (tu nivel; 0 = sin), nivel del Heraldo y misión. */
export interface PlaceOpts {
  tz: number;
  tier: number;
  quest: boolean;
}
export const NO_TZ: PlaceOpts = { tz: 0, tier: 1, quest: false };
const noTz = (o: PlaceOpts): PlaceOpts => ({ ...o, tz: 0 });

/** Un lugar para "¿Qué suelta?" y el simulador: un jefe o superúnico, o un tipo de monstruo de un área. */
export type PlaceRef = { k: "s"; id: string } | { k: "a"; id: number; cat: Cat };

/** El nivel de un monstruo aterrorizado: tu nivel + 2 entre los topes de la dificultad, o el suyo si era mayor. */
export function terrorLevel(D: Indexed, base: number, clvl: number, diff: Diff): number {
  const [min, max] = D.tz.b[diff];
  return Math.max(base, Math.min(Math.max(clvl + D.tz.boost, min), max));
}

export const killKey = (k: KillCtx): string => `${k.tc}|${k.mlvl}|${k.diff}|${+k.desec}|${+k.herald}|${k.tier}`;

/** Cómo muere un jefe o superúnico en una dificultad; null si ahí no suelta nada. */
export function sourceKill(D: Indexed, src: DropSource, diff: Diff, o: PlaceOpts): KillCtx | null {
  const mon = D.monsters[src.mon];
  if (!mon) return null;
  const area = src.area !== null ? D.areaById.get(src.area) : undefined;
  const desec = o.tz > 0 && !!area?.tz;
  const boss = !!mon.boss;
  // Los jefes conservan su nivel; los superúnicos toman el del área (en Normal, el suyo) y suman 3.
  const own = boss || diff === 0 || !area ? mon.lv[diff] : area.lv[diff];
  // En una Zona de Terror los dos suben al nivel aterrorizado y suman el +3 de único, que puede pasar el tope de la zona (la guía
  // del juego lo dice del +3; Silospen y las guías de la comunidad ponen a los jefes con los únicos). Afuera, el jefe va sin él.
  // Ese +3 no pasa del tope de la zona + 3 (99 en Infierno, como Silospen): Baal, que ya es nivel 99, no llega a 102. Y nadie queda
  // por debajo de su nivel propio.
  const mlvl = desec ? Math.max(own, Math.min(terrorLevel(D, own, o.tz, diff) + 3, D.tz.b[diff][1] + 3)) : own + (boss ? 0 : 3);
  const m = mon.tc[diff];
  let tc = src.tc ? (desec && src.tcd?.[diff]) || src.tc[diff] : (desec && m[4]) || (o.quest && m[3]) || m[0];
  if (!tc || !D.tcs[tc]) return null;
  // Los jefes no mejoran su TC, salvo aterrorizados.
  if (!boss || desec) tc = upgradeTc(D, tc, mlvl);
  return { tc, mlvl, diff, desec, herald: false, tier: 0 };
}

/** Columna de TC de monstats para cada tipo: sin y con Zona de Terror. */
const TC_COL: Record<Cat, [number, number]> = { normal: [0, 4], champ: [1, 5], unique: [2, 6], herald: [2, 7] };
const BONUS: Record<Cat, number> = { normal: 0, champ: 2, unique: 3, herald: 3 };

/** Un monstruo de un área para un tipo de muerte: su peso de aparición y cómo muere (null si no tiene TC para ese tipo). */
export interface AreaKill {
  mon: string;
  w: number;
  kill: KillCtx | null;
}

/**
 * Los monstruos de un área para un tipo de muerte, cada uno con su peso de aparición: su Rarity de monstats, que es con lo que el
 * juego elige qué aparece (0 = no aparece al azar, así que no pesa). Van todos, también los que no tienen TC para ese tipo, con
 * `kill` null: "por cada monstruo que matás" cuenta cada monstruo que aparece, y ésos no sueltan nada.
 */
export function areaKills(D: Indexed, area: DropArea, diff: Diff, cat: Cat, o: PlaceOpts): AreaKill[] {
  // Las áreas de Pandemonio traen monstruos en las tres dificultades, pero el evento sólo existe en Infierno.
  if (area.hell && diff !== 2) return [];
  const desec = o.tz > 0 && !!area.tz;
  // Los Heraldos sólo aparecen en las Zonas de Terror de Infierno.
  if (cat === "herald" && !(desec && diff === 2 && D.tz.maxTier > 0)) return [];
  // En Pesadilla e Infierno todos salen de `nmon`; en Normal los únicos tienen su lista.
  const list = diff > 0 ? area.nmon : (cat === "unique" || cat === "herald") && area.umon.length ? area.umon : area.mon;
  const [plain, terror] = TC_COL[cat];
  const out: AreaKill[] = [];
  for (const id of list) {
    const mon = D.monsters[id];
    if (!mon) continue;
    const base = mon.boss || diff === 0 ? mon.lv[diff] : area.lv[diff];
    const mlvl = (desec ? terrorLevel(D, base, o.tz, diff) : base) + BONUS[cat];
    let tc = cat === "herald" ? mon.tc[diff][terror] : (desec && mon.tc[diff][terror]) || mon.tc[diff][plain];
    if (!tc || !D.tcs[tc]) {
      out.push({ mon: id, w: mon.rar, kill: null });
      continue;
    }
    // El Heraldo sube el nivel de TC que usa, no el del ítem.
    const boost = cat === "herald" ? (D.tz.heraldTc[Math.min(o.tier, D.tz.heraldTc.length) - 1] ?? 0) : 0;
    tc = upgradeTc(D, tc, mlvl + boost);
    out.push({ mon: id, w: mon.rar, kill: { tc, mlvl, diff, desec, herald: cat === "herald", tier: cat === "herald" ? o.tier : 0 } });
  }
  return out;
}

/**
 * La muerte que representa un lugar: el jefe, o el monstruo más común del área para ese tipo (de los que aparecen y sueltan algo).
 * Una sola muerte: la usa lo que necesita un monstruo concreto, como el simulador; las listas de un área son el promedio de todos
 * sus monstruos (`areaDropsOf`).
 */
export function placeKill(D: Indexed, place: PlaceRef, diff: Diff, o: PlaceOpts): KillCtx | null {
  if (place.k === "s") {
    const src = D.sourceById.get(place.id);
    return src ? sourceKill(D, src, diff, o) : null;
  }
  const area = D.areaById.get(place.id);
  if (!area) return null;
  let best: AreaKill | null = null;
  for (const k of areaKills(D, area, diff, place.cat, o)) if (k.kill && k.w > 0 && (!best || k.w > best.w)) best = k;
  return best?.kill ?? null;
}

export interface BossRow {
  key: string;
  src: DropSource;
  diff: Diff;
  tz: boolean;
  kill: KillCtx;
  p: number;
}
export interface AreaRow {
  key: string;
  area: DropArea;
  diff: Diff;
  tz: boolean;
  /** Chance por monstruo de cada tipo, promediada por su peso de aparición (el que aparece sin TC para ese tipo cuenta con 0). */
  p: Record<Cat, number>;
  /**
   * El tipo de monstruo que explica la fila: el primero que suelta el ítem. Los ítems altos (la Corona de las Eras) no caen de
   * los comunes: es el tipo que abre "¿Qué suelta?" y el que nombra la ficha de la wiki.
   */
  cat: Cat;
  /** La muerte que explica la fila (el monstruo más común de `cat` que lo suelta). */
  best: KillCtx | null;
}

/** Los mejores lugares para el buscado: jefes y superúnicos por muerte, y áreas por monstruo. */
export function bestPlaces(D: Indexed, target: Target, s: Settings, o: PlaceOpts, diffs: Diff[], limit = 10): { bosses: BossRow[]; areas: AreaRow[] } {
  // Muchos monstruos de un área (y muchas áreas) terminan en la misma TC al mismo nivel.
  const memo = new Map<string, number>();
  const chance = (kill: KillCtx) => {
    const key = killKey(kill);
    let p = memo.get(key);
    if (p === undefined) memo.set(key, (p = chancePerKill(D, target, kill, s)));
    return p;
  };

  const bosses: BossRow[] = [];
  for (const src of D.sources) {
    for (const diff of diffs) {
      for (const oo of o.tz > 0 ? [noTz(o), o] : [o]) {
        const kill = sourceKill(D, src, diff, oo);
        if (!kill || (oo.tz > 0 && !kill.desec)) continue;
        const p = chance(kill);
        if (p > 0) bosses.push({ key: `s.${src.id}.${diff}${kill.desec ? ".tz" : ""}`, src, diff, tz: kill.desec, kill, p });
      }
    }
  }

  const areas: AreaRow[] = [];
  // Las siete Tumbas de Tal Rasha son la misma área (nombre, niveles y monstruos): una fila, no siete iguales.
  const seen = new Set<string>();
  for (const area of D.areas) {
    const twin = JSON.stringify([area.n.en, area.act, area.lv, area.mon, area.nmon, area.umon]);
    if (seen.has(twin)) continue;
    seen.add(twin);
    for (const diff of diffs) {
      for (const oo of o.tz > 0 && area.tz ? [noTz(o), o] : [noTz(o)]) {
        const p: Record<Cat, number> = { normal: 0, champ: 0, unique: 0, herald: 0 };
        let first: Cat | null = null;
        let best: KillCtx | null = null;
        for (const cat of CATS) {
          const kills = areaKills(D, area, diff, cat, oo);
          const wsum = kills.reduce((n, k) => n + k.w, 0);
          if (!wsum) continue;
          p[cat] = kills.reduce((n, k) => n + (k.kill ? k.w * chance(k.kill) : 0), 0) / wsum;
          if (!first && p[cat] > 0) {
            let top: AreaKill | null = null;
            for (const k of kills) if (k.kill && k.w > 0 && chance(k.kill) > 0 && (!top || k.w > top.w)) top = k;
            first = cat;
            best = top?.kill ?? null;
          }
        }
        if (first) areas.push({ key: `a.${area.id}.${diff}${oo.tz > 0 ? ".tz" : ""}`, area, diff, tz: oo.tz > 0, p, cat: first, best });
      }
    }
  }

  bosses.sort((a, b) => b.p - a.p);
  areas.sort((a, b) => b.p.normal - a.p.normal || b.p.champ - a.p.champ || b.p.unique - a.p.unique);
  return { bosses: bosses.slice(0, limit), areas: areas.slice(0, limit) };
}

/**
 * ¿Lo suelta algún monstruo, con alguna opción? Se prueba con las más amplias: Clasificación prendida (lo que no es de esta
 * temporada no cae ni ahí), una Zona de Terror con tu nivel en 99 (sus filas y las de siempre: el nivel más alto de los
 * monstruos y sus TCs de zona) con cada nivel de Heraldo, con y sin la primera muerte de misión, en las tres dificultades. El
 * hallazgo mágico y los jugadores no pueden llevar una chance a 0. Los ítems de misión y la Antorcha del Infierno (nivel 110)
 * no los suelta nadie: "con estas opciones" no les sirve de nada.
 */
export function dropsAnywhere(D: Indexed, target: Target, season: number): boolean {
  const s: Settings = { mf: 0, players: 1, party: 1, ladder: true, season };
  for (const quest of [false, true]) {
    for (let tier = Math.max(1, D.tz.maxTier); tier >= 1; tier--) {
      const { bosses, areas } = bestPlaces(D, target, s, { tz: 99, tier, quest }, [0, 1, 2], 1);
      if (bosses.length || areas.length) return true;
    }
  }
  return false;
}

export interface DropLine {
  target: Target;
  p: number;
}
export interface DropLists {
  runes: DropLine[];
  uniques: DropLine[];
  sets: DropLine[];
}

/** Lo que puede soltar una muerte: runas (en su orden), únicos y piezas (de más a menos probable). */
export function dropsOf(D: Indexed, kill: KillCtx, s: Settings): DropLists {
  const r = reach(D, kill.tc);
  const line = (target: Target): DropLine => ({ target, p: chancePerKill(D, target, kill, s) });
  const byP = (a: DropLine, b: DropLine) => b.p - a.p;
  return {
    runes: Object.keys(D.bases)
      .filter((c) => /^r\d\d$/.test(c) && r.has(c))
      .sort()
      .map((code) => line({ k: "b", code }))
      .filter((x) => x.p > 0),
    uniques: D.uniques
      .filter((u) => r.has(u.code) || r.has(u.key))
      .map((u) => line({ k: "u", id: u.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
    sets: D.sets
      .filter((x) => r.has(x.code) || r.has(x.key))
      .map((x) => line({ k: "s", id: x.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
  };
}

/**
 * Lo que suelta un área para un tipo de monstruo, por cada monstruo que matás: el promedio de `dropsOf` sobre sus monstruos,
 * cada uno con su peso de aparición y el que aparece sin TC con 0, igual que la fila del área en "¿Dónde lo farmeo?" (el botón
 * "¿Qué más suelta?" de esa fila lleva acá, y los dos tienen que dar el mismo número). Los monstruos que mueren igual (misma TC,
 * nivel y condiciones) se calculan una sola vez: en un área quedan casi siempre de una a cuatro muertes distintas.
 */
export function areaDropsOf(D: Indexed, area: DropArea, diff: Diff, cat: Cat, o: PlaceOpts, s: Settings): DropLists {
  const kills = areaKills(D, area, diff, cat, o);
  const wsum = kills.reduce((n, k) => n + k.w, 0);
  if (!wsum) return { runes: [], uniques: [], sets: [] };
  const distinct = new Map<string, { kill: KillCtx; w: number }>();
  for (const k of kills) {
    if (!k.kill || !k.w) continue;
    const key = killKey(k.kill);
    const hit = distinct.get(key);
    if (hit) hit.w += k.w;
    else distinct.set(key, { kill: k.kill, w: k.w });
  }
  // Cada ítem, sumado por su clave de la dirección ("b.r30", "u.harlequin-crest"): el mismo sale de varias muertes.
  const sum = new Map<string, number>();
  for (const { kill, w } of distinct.values()) {
    const lists = dropsOf(D, kill, s);
    for (const l of [...lists.runes, ...lists.uniques, ...lists.sets]) {
      const key = targetParam(l.target);
      sum.set(key, (sum.get(key) ?? 0) + w * l.p);
    }
  }
  const line = (target: Target): DropLine => ({ target, p: (sum.get(targetParam(target)) ?? 0) / wsum });
  const byP = (a: DropLine, b: DropLine) => b.p - a.p;
  return {
    runes: Object.keys(D.bases)
      .filter((c) => /^r\d\d$/.test(c))
      .sort()
      .map((code) => line({ k: "b", code }))
      .filter((x) => x.p > 0),
    uniques: D.uniques
      .map((u) => line({ k: "u", id: u.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
    sets: D.sets
      .map((x) => line({ k: "s", id: x.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
  };
}
