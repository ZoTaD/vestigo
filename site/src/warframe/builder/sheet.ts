/**
 * Las filas que muestra el armador (2026-10-27): de `weaponStats` y `frameStats` a la tabla base / build / cambio y a las
 * cifras grandes de arriba. Sólo lo que dan esas funciones: nada de DPS ni ráfaga. Puras, para probarlas sin navegador.
 */
import type { Kind } from "../data";
import type { DmgType, FStat, WStat } from "./calc";

/** Cómo se escribe una cifra: entero o con decimales, porcentaje de una fracción (0,3 → 30 %), multiplicador o segundos. */
export type Fmt = "num" | "frac" | "pct" | "mult" | "sec";
export type Row = {
  key: string;
  group: "damage" | "crit" | "gun" | "frame" | "abilities";
  base: number;
  now: number;
  fmt: Fmt;
  /** Menos es mejor (la recarga). */
  inv?: boolean;
  /** Un tipo de daño, debajo del daño por proyectil. */
  sub?: DmgType;
};

/** El orden de los tipos de daño debajo del total: físicos, primarios y combinados. */
export const DMG_ORDER: DmgType[] = ["impact", "puncture", "slash", "heat", "cold", "electricity", "toxin", "blast", "corrosive", "gas", "magnetic", "radiation", "viral"];

/**
 * Las filas de un arma. El daño por disparo es el por proyectil × multidisparo, y se dice así en la tabla; en cuerpo a
 * cuerpo es el daño por golpe, sin "por proyectil" ni multidisparo.
 */
export function weaponRows(kind: Kind, base: WStat, now: WStat): Row[] {
  const melee = kind === "melee";
  const rows: Row[] = [{ key: melee ? "perHit" : "perShot", group: "damage", base: base.total * base.ms, now: now.total * now.ms, fmt: "num" }];
  if (!melee) rows.push({ key: "total", group: "damage", base: base.total, now: now.total, fmt: "num" });
  for (const t of DMG_ORDER) {
    const b = base.byType[t] ?? 0;
    const n = now.byType[t] ?? 0;
    if (b || n) rows.push({ key: t, group: "damage", base: b, now: n, fmt: "num", sub: t });
  }
  if (!melee) rows.push({ key: "multishot", group: "damage", base: base.ms, now: now.ms, fmt: "num" });
  rows.push(
    { key: "cc", group: "crit", base: base.cc, now: now.cc, fmt: "frac" },
    { key: "cd", group: "crit", base: base.cd, now: now.cd, fmt: "mult" },
    { key: "sc", group: "crit", base: base.sc, now: now.sc, fmt: "frac" },
    { key: kind === "melee" ? "attackSpeed" : "rate", group: "gun", base: base.rate, now: now.rate, fmt: "num" },
  );
  if (base.mag !== undefined && now.mag !== undefined) rows.push({ key: "mag", group: "gun", base: base.mag, now: now.mag, fmt: "num" });
  if (base.reload !== undefined && now.reload !== undefined) rows.push({ key: "reload", group: "gun", base: base.reload, now: now.reload, fmt: "sec", inv: true });
  return rows;
}

/** Las filas de un Warframe: lo de su cuerpo y lo de sus habilidades (en %). */
export function frameRows(base: FStat, now: FStat): Row[] {
  const body = (["health", "shield", "armor", "energy"] as const).map((k): Row => ({ key: k, group: "frame", base: base[k], now: now[k], fmt: "num" }));
  const abil = (["strength", "duration", "efficiency", "range"] as const).map((k): Row => ({ key: k, group: "abilities", base: base[k], now: now[k], fmt: "pct" }));
  return [...body, ...abil];
}

/** Las cifras grandes de arriba: en un arma, el daño por disparo (la grande) y lo que más se mira; en un Warframe, las habilidades y el cuerpo. */
export const TILE_KEYS: Record<"weapon" | "melee" | "frame", string[]> = {
  weapon: ["perShot", "cc", "cd", "sc", "multishot", "rate", "mag"],
  melee: ["perHit", "cc", "cd", "sc", "attackSpeed"],
  frame: ["strength", "duration", "efficiency", "range", "health", "shield", "energy", "armor"],
};

/** El cambio de base a build: "—" si no cambió, "nuevo" si no había, y si no el porcentaje entero con su signo. */
export function delta(base: number, now: number, inv = false): { pct: number | null; good: boolean } | null {
  const d = now - base;
  if (Math.abs(d) < 0.005) return null;
  return { pct: base ? (d / Math.abs(base)) * 100 : null, good: inv ? d < 0 : d > 0 };
}

/** Decimales del cambio: entero; de menos de 1 %, uno, así no se lee "+0 %" (y dos si no llega a 0,1 %). */
export const deltaDigits = (pct: number): number => (Math.abs(pct) < 0.1 ? 2 : Math.abs(pct) < 1 ? 1 : 0);
