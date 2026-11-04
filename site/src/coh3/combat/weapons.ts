/**
 * De los datos de un arma y una unidad (`games/coh3/data`) a lo que pide el motor (`engine.ts`), con la veteranía
 * aplicada (2026-11-04).
 */
import { resolveDist, type TargetStats, type Trio, type WeaponStats } from "./engine";
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
  burst?: { duration?: number[]; rate?: number[]; dur?: number[] } | null;
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

/** El arma lista para el motor, con la veteranía del que dispara. */
export function weaponStats(w: WeaponData, vet?: VetMods): WeaponStats {
  const range = pair(w.range, 0);
  const max = range[1] || 35;
  const v = vet ?? { accuracy: 1, penetration: 1, rateOfFire: 1, damage: 1 };
  const rof = Math.max(0.1, v.rateOfFire);
  const scale = (p: [number, number], k: number): [number, number] => [p[0] / k, p[1] / k];
  const burst = w.burst && (w.burst.duration || w.burst.dur) ? { dur: pair(w.burst.duration ?? w.burst.dur), rate: pair(w.burst.rate, 1) } : null;
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
  };
}

/** ¿Es un blindado? Algún lado con blindaje de más de 5. */
export const isArmored = (u: UnitTarget): boolean => !!u.armor && Math.max(...u.armor) > 5;
