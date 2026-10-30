import { useEffect, useState } from "react";
import type { BandId } from "./deadlockData";
import type { HeroInsightsFile } from "./deadlockHeroKitData";

/**
 * El Armador de equipo (2026-10-30): la cuenta del draft, la misma que ajusta
 * `games/deadlock/pipeline/src/draftModel.ts` (ver el comentario de allá). Si se
 * cambia una, se cambia la otra: los tests de los dos lados prueban los mismos
 * casos.
 */

export interface DraftBand {
  scale: number;
  matches: number;
  accuracy: number;
  brier: number;
  from: string;
  to: string;
}

export interface DraftModelFile {
  generatedAt: string;
  cv: number;
  ca: number;
  bands: Partial<Record<BandId, DraftBand>>;
}

export interface Tables {
  L: Map<number, number>;
  vs: Map<string, number>;
  with: Map<string, number>;
}

/** Un equipo: seis lugares, `null` el vacío. */
export type Team = (number | null)[];
export const TEAM_SIZE = 6;

const logit = (p: number) => Math.log(p / (1 - p));
const key = (a: number, b: number) => `${a}:${b}`;
export const sigma = (x: number) => 1 / (1 + Math.exp(-x));

export function tablesOf(heroes: { heroId: number; winRate: number }[], insights: HeroInsightsFile): Tables {
  const L = new Map(heroes.map((h) => [h.heroId, logit(h.winRate)]));
  const vs = new Map<string, number>();
  const wi = new Map<string, number>();
  for (const [id, h] of Object.entries(insights.heroes)) {
    for (const [b, n, w] of h.vs) vs.set(key(Number(id), b), logit((w + 1) / (n + 2)));
    for (const [b, n, w] of h.with) wi.set(key(Number(id), b), logit((w + 1) / (n + 2)));
  }
  return { L, vs, with: wi };
}

/**
 * Las piezas del margen entre los equipos, antes de la escala. Sumadas dan lo
 * mismo que `draftMargin` del pipeline; separadas son las razones que muestra
 * la página. `side` +1 favorece al equipo A y −1 al B.
 */
export type Part =
  | { kind: "hero"; hero: number; side: 1 | -1; value: number }
  | { kind: "counter"; hero: number; enemy: number; side: 1 | -1; value: number }
  | { kind: "synergy"; hero: number; ally: number; side: 1 | -1; value: number };

export function parts(t: Tables, A: number[], B: number[], cv: number, ca: number): Part[] {
  const out: Part[] = [];
  const lado = (T: number[], E: number[], side: 1 | -1) => {
    for (const a of T) {
      const base = t.L.get(a) ?? 0;
      out.push({ kind: "hero", hero: a, side, value: side * base });
      for (const b of E) {
        const v = t.vs.get(key(a, b));
        if (v !== undefined) out.push({ kind: "counter", hero: a, enemy: b, side, value: side * cv * (v - base) });
      }
      for (const x of T) {
        if (x === a) continue;
        const v = t.with.get(key(a, x));
        if (v !== undefined) out.push({ kind: "synergy", hero: a, ally: x, side, value: side * ca * (v - base) });
      }
    }
  };
  lado(A, B, 1);
  lado(B, A, -1);
  return out;
}

export const draftMargin = (t: Tables, A: number[], B: number[], cv: number, ca: number) =>
  parts(t, A, B, cv, ca).reduce((n, p) => n + p.value, 0);

/**
 * Las razones que más pesan, en puntos de probabilidad del equipo A.
 *
 * Un cruce entre a y b aparece dos veces (a contra b y b contra a), igual que
 * una sinergia (a con x y x con a): se juntan en una sola razón. El peso de una
 * razón es cuánto se movería la probabilidad sin ella.
 */
export interface Reason {
  kind: Part["kind"];
  /** El héroe del lado favorecido primero. */
  heroes: number[];
  side: 1 | -1;
  pp: number;
}

export function reasons(ps: Part[], scale: number, top = 5): Reason[] {
  const total = ps.reduce((n, p) => n + p.value, 0);
  const p0 = sigma(scale * total);
  const grupos = new Map<string, { kind: Part["kind"]; heroes: number[]; value: number }>();
  for (const p of ps) {
    let k: string;
    let heroes: number[];
    if (p.kind === "hero") {
      k = `h${p.hero}`;
      heroes = [p.hero];
    } else if (p.kind === "counter") {
      // Del lado de A primero, así el par es el mismo venga de donde venga.
      const [a, b] = p.side === 1 ? [p.hero, p.enemy] : [p.enemy, p.hero];
      k = `c${a}:${b}`;
      heroes = [a, b];
    } else {
      const [a, b] = [p.hero, p.ally].sort((x, y) => x - y);
      k = `s${a}:${b}`;
      heroes = [a, b];
    }
    const g = grupos.get(k) ?? { kind: p.kind, heroes, value: 0 };
    g.value += p.value;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => {
      const side: 1 | -1 = g.value >= 0 ? 1 : -1;
      // Un cruce que favorece a B se cuenta desde el héroe de B.
      const heroes = g.kind === "counter" && side === -1 ? [...g.heroes].reverse() : g.heroes;
      return { kind: g.kind, heroes, side, pp: (p0 - sigma(scale * (total - g.value))) * 100 };
    })
    .filter((r) => Math.abs(r.pp) >= 0.1)
    .sort((a, b) => Math.abs(b.pp) - Math.abs(a.pp))
    .slice(0, top);
}

/** Los mejores héroes para el próximo lugar de un equipo: los que más suben su probabilidad. */
export function bestPicks(
  t: Tables,
  heroes: number[],
  own: number[],
  enemy: number[],
  scale: number,
  cv: number,
  ca: number,
  top = 3
): { hero: number; p: number }[] {
  const usados = new Set([...own, ...enemy]);
  return heroes
    .filter((h) => !usados.has(h))
    .map((h) => ({ hero: h, p: sigma(scale * draftMargin(t, [...own, h], enemy, cv, ca)) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, top);
}

// ---------------------------------------------------------------- la URL

/** `?a=1,15,-,…&b=…`: los equipos viajan en el enlace, con `-` por lugar vacío. */
export function encodeTeam(team: Team): string {
  const s = team.map((h) => (h === null ? "-" : String(h))).join(",");
  return s.replace(/(,-)+$/, "").replace(/^-$/, "");
}

export function decodeTeam(raw: string | null, valid: Set<number>): Team {
  const out: Team = Array(TEAM_SIZE).fill(null);
  if (!raw) return out;
  raw
    .split(",")
    .slice(0, TEAM_SIZE)
    .forEach((x, i) => {
      const n = Number(x);
      if (Number.isInteger(n) && valid.has(n) && !out.includes(n)) out[i] = n;
    });
  return out;
}

// ---------------------------------------------------------------- los datos

let modelo: DraftModelFile | null | undefined;
let pidiendo: Promise<void> | null = null;

/** El modelo baja con la pestaña, por `import()`, nunca con el JS de entrada. */
export function useDraftModel(): DraftModelFile | null | undefined {
  const [, set] = useState(0);
  useEffect(() => {
    if (modelo !== undefined) return;
    let vivo = true;
    pidiendo ??= import("@deadlock/draft-model.json")
      .then((m) => {
        modelo = m.default as unknown as DraftModelFile;
      })
      .catch(() => {
        modelo = null;
      });
    pidiendo.then(() => vivo && set((n) => n + 1));
    return () => {
      vivo = false;
    };
  }, []);
  return modelo;
}
