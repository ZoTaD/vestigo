/**
 * De los datos de un arma y una unidad (`games/coh3/data`) a lo que pide el motor (`engine.ts`), con la veteranía
 * aplicada (2026-11-04).
 */
import { INFANTRY, resolveDist, type TargetStats, type Trio, type WeaponStats } from "./engine";
import type { VetMods } from "./vet";
import type { L10n } from "../data";
import type { Faction } from "../../coh3Copy";

/** Lo que traen la fila y la ficha de un arma; la ficha suma apuntado, enfriamiento, ráfaga y quién la usa. */
export interface WeaponData {
  slug: string;
  name: L10n | null;
  faction: Faction | null;
  kind?: string;
  cls?: string;
  pen: number[] | null;
  dist: number[] | null;
  acc: number[] | null;
  dmg: number[] | null;
  reload?: number[] | null;
  /** Disparos entre recargas (`reload.frequency`); sin él, se recarga después de cada ciclo. */
  reloadEvery?: number[] | null;
  range?: number[] | null;
  cooldown?: number[] | null;
  aim?: { fire?: number[]; ready?: number[] } | null;
  burst?: { duration?: number[]; rate?: number[]; dur?: number[]; rof?: number[] } | null;
  moving?: number | null;
  usedBy?: string[];
  users?: number;
  nameFromUnit?: boolean;
}

const pair = (v: number[] | null | undefined, d = 0): [number, number] => (v && v.length >= 2 ? [v[0], v[1]] : [d, d]);
const trio = (v: number[] | null | undefined, d = 0): Trio => (v && v.length >= 3 ? [v[0], v[1], v[2]] : [d, d, d]);

/** Las clases de arma de tiro directo contra blindados (sin granadas, morteros, artillería ni lanzallamas). */
const AT_CLS = new Set(["at_gun", "cannon", "cannon_burst", "cannon_small", "bazooka", "panzerbuchse"]);
/** ¿Sirve contra blindados? Por su clase si la trae; si no, lo que penetra 30 o más a alguna distancia. */
export const isAntiTank = (w: Pick<WeaponData, "pen"> & { cls?: string }): boolean =>
  !!w.pen && (w.cls ? AT_CLS.has(w.cls) : Math.max(...w.pen) >= 30);

/**
 * ¿Es el disparo de una habilidad (munición perforante, rompebúnkeres, tungsteno…) y no el arma de todos los días? Esos
 * traen penetraciones de 1000 o nombres de munición: no van en los counters, que comparan el arma de base.
 */
export const isAbilityShot = (w: { slug: string; pen: number[] | null }): boolean =>
  (!!w.pen && Math.max(...w.pen) >= 900) || /armor_piercing|bunker_buster|tungsten|hvap|apcr|_ap_|incendiary|barrage|_he_|he_rounds|ability/i.test(w.slug);

/** El arma lista para el motor, con la veteranía del que dispara. */
export function weaponStats(w: WeaponData, vet?: VetMods): WeaponStats {
  const range = pair(w.range, 0);
  const max = range[1] || 35;
  const v = vet ?? { accuracy: 1, penetration: 1, rateOfFire: 1, damage: 1 };
  const rof = Math.max(0.1, v.rateOfFire);
  const scale = (p: [number, number], k: number): [number, number] => [p[0] / k, p[1] / k];
  const burst = w.burst && (w.burst.duration || w.burst.dur) ? { dur: pair(w.burst.duration ?? w.burst.dur), rate: pair(w.burst.rate ?? w.burst.rof, 1) } : null;
  const every = w.reloadEvery ? (w.reloadEvery[0] + w.reloadEvery[1]) / 2 : 0;
  return {
    pen: trio(w.pen, 1).map((x) => x * v.penetration) as Trio,
    dist: resolveDist(trio(w.dist, -1), [range[0], max]),
    acc: trio(w.acc, 0).map((x) => x * v.accuracy) as Trio,
    dmg: pair(w.dmg).map((x) => x * v.damage) as [number, number],
    range: max,
    // La cadencia sube acortando el ciclo entero (apuntar, enfriar y recargar).
    aim: scale(pair(w.aim?.fire), rof),
    cooldown: scale(pair(w.cooldown), rof),
    reload: scale(pair(w.reload), rof),
    clip: every > 0 ? Math.round(every) + 1 : 1,
    burst,
    moving: w.moving ?? undefined,
  };
}

/** Lo que hace falta de una unidad como blanco. */
export interface UnitTarget {
  hp: number | null;
  armor: number[] | null;
  models?: number | null;
  targetSize?: number | null;
}

/** La unidad como blanco, con su veteranía. */
export function targetStats(u: UnitTarget, vet?: VetMods): TargetStats {
  const a = u.armor && u.armor.length >= 3 ? u.armor : [1, 1, 1];
  return {
    hp: (u.hp ?? 80) + (vet?.health ?? 0),
    armor: [a[0] + (vet?.frontArmor ?? 0), a[1] + (vet?.sideArmor ?? 0), a[2]],
    receivedAccuracy: vet?.receivedAccuracy ?? 1,
    receivedDamage: vet?.receivedDamage ?? 1,
    models: u.models ?? 1,
    // Sin el dato, el de un vehículo típico (20) o el de un soldado (1).
    targetSize: u.targetSize ?? (isArmored(u) ? 20 : 1),
  };
}

/** ¿Es un vehículo blindado? Los emplazamientos y las armas de dotación también traen blindaje, pero no son blancos de tanque. */
// CoH1 no tiene blindaje numérico (`armor` nulo): ahí un vehículo es todo lo que esté en `vehicles`.
export const isVehicle = (u: UnitTarget & { kind?: string }): boolean => u.kind === "vehicles" && (isArmored(u) || !u.armor);

/** ¿Es un blindado? Algún lado con blindaje de más de 5. */
export const isArmored = (u: UnitTarget): boolean => !!u.armor && Math.max(...u.armor) > 5;

/**
 * CoH1 (2026-11-06): no hay blindaje; cada arma trae multiplicadores por tipo de blanco (`targets[tp]` = [precisión,
 * daño, penetración, penetración trasera]) y la penetración es una probabilidad. El arma se convierte contra el tipo del
 * blanco y el motor de CoH3 sirve igual: blindaje 1 adelante (penetra con `pen × mult`) y 1/(mult. trasero) atrás.
 */
type ConBlancos = WeaponData & { targets?: Record<string, number[]> };
export function contraBlanco(w: ConBlancos, tp: string | null | undefined): WeaponData {
  const m = (tp && w.targets?.[tp]) || [1, 1, 1, 1];
  const por = (xs: number[] | null | undefined, k: number) => (xs ? xs.map((x) => Math.round(x * k * 1e6) / 1e6) : xs ?? null);
  return { ...w, acc: por(w.acc, m[0]), dmg: por(w.dmg, m[1]), pen: por(w.pen, m[2]) };
}
export function blancoCoh1(u: UnitTarget, w: ConBlancos, tp: string | null | undefined, vet?: VetMods): TargetStats {
  const trasera = (tp && w.targets?.[tp]?.[3]) || 1;
  return { ...targetStats({ ...u, armor: [1, 1, 1], targetSize: 1 }, vet), armor: [1, 1 / trasera, 1 / trasera] };
}

/**
 * Un arma contra un objetivo (una unidad, o la infantería genérica si es null), lista para el motor. En CoH1 el arma se
 * convierte contra el tipo de blanco del objetivo; la infantería genérica de CoH1 es `tp_infantry`.
 */
export function armaContra(
  game: string,
  w: WeaponData,
  u: (UnitTarget & { target?: string | null }) | null | undefined,
  vet?: VetMods,
): { w: WeaponData; t: TargetStats } {
  if (game !== "coh1") return { w, t: u ? targetStats(u, vet) : INFANTRY() };
  const tp = u ? u.target ?? null : "tp_infantry";
  return { w: contraBlanco(w, tp), t: u ? blancoCoh1(u, w, tp, vet) : INFANTRY() };
}
