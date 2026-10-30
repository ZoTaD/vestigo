import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { badgeRange } from "./abilities";
import { BANDS, type BandId } from "./bands";
import type { HeroInsightsFile } from "./heroInsights";

/**
 * El modelo del Armador de equipo (2026-10-30): qué chances tiene un 6v6.
 *
 *   npm run build:draft
 *
 * Medir equipos enteros no alcanza: `hero-comb-stats` con `comb_size=6` trae 5–7
 * partidas por equipo. Así que cada héroe vale su winrate de la banda, corrido por
 * cómo le va contra cada rival y junto a cada aliado que tiene en el draft (los
 * cruces de `hero-insights.<banda>.json`), todo en log-odds:
 *
 *   s(a) = L(a) + CV · Σ rivales (vs(a,b) − L(a)) + CA · Σ aliados (with(a,x) − L(a))
 *   P(A gana) = σ(escala · (Σ_A s − Σ_B s))
 *
 * `CV` y `CA` se eligieron el 2026-10-30 con 6.000 partidas de Fantasma+: todas
 * las variantes probadas (sólo winrates, con cruces, con sinergias, con las dos)
 * aciertan entre 57,4 y 58,1 %, y 1 / 0,5 fue la mejor en el Brier. Lo que se
 * ajusta acá es la `escala`, por banda, con partidas reales de la ventana de la
 * tier list. El acierto se mide en dos mitades (se ajusta en una y se mide en la
 * otra), así la página no dice un número aprendido de memoria.
 *
 * Un cruce que no está (menos de `MIN_PAIR` partidas) suma 0, igual que un lugar
 * vacío en el armador: un héroe que no se conoce cuenta como uno promedio.
 */

const API = "https://api.deadlock-api.com/v1";
const DATA_DIR = "../data";
const OUT = `${DATA_DIR}/draft-model.json`;
/** Peso de los rivales y de los aliados (ver arriba). */
export const CV = 1;
export const CA = 0.5;
/** Partidas por banda: 3 pedidos de 1.000. */
const PAGES = 3;

export interface DraftBand {
  scale: number;
  /** Partidas con los dos equipos de seis. */
  matches: number;
  /** Fracción de partidas en que el favorito ganó, medida en la mitad que no se usó para ajustar. */
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

const logit = (p: number) => Math.log(p / (1 - p));
const key = (a: number, b: number) => `${a}:${b}`;

/** Las tablas de una banda. El +1/+2 es para que un 0 de 10 no dé infinito. */
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

/** Lo que vale un héroe en este draft, en log-odds. */
export function heroScore(t: Tables, a: number, allies: number[], enemies: number[]): number {
  const base = t.L.get(a) ?? 0;
  let s = base;
  for (const b of enemies) {
    const v = t.vs.get(key(a, b));
    if (v !== undefined) s += CV * (v - base);
  }
  for (const x of allies) {
    if (x === a) continue;
    const v = t.with.get(key(a, x));
    if (v !== undefined) s += CA * (v - base);
  }
  return s;
}

/** La diferencia entre los equipos antes de la escala. */
export function draftMargin(t: Tables, A: number[], B: number[]): number {
  const suma = (T: number[], E: number[]) => T.reduce((n, a) => n + heroScore(t, a, T, E), 0);
  return suma(A, B) - suma(B, A);
}

const sigma = (x: number) => 1 / (1 + Math.exp(-x));

/** La escala que mejor explica las partidas (máxima verosimilitud, Newton en una variable). */
export function fitScale(margins: number[], wins: number[]): number {
  let k = 0.1;
  for (let it = 0; it < 50; it++) {
    let g = 0;
    let h = 0;
    margins.forEach((m, i) => {
      const p = sigma(k * m);
      g += (p - wins[i]) * m;
      h += p * (1 - p) * m * m;
    });
    if (h === 0) break;
    const paso = g / h;
    k -= paso;
    if (Math.abs(paso) < 1e-7) break;
  }
  return k;
}

export function evaluate(k: number, margins: number[], wins: number[]): { accuracy: number; brier: number } {
  let ok = 0;
  let br = 0;
  margins.forEach((m, i) => {
    const p = sigma(k * m);
    if ((p > 0.5 ? 1 : 0) === wins[i]) ok++;
    br += (p - wins[i]) ** 2;
  });
  const n = margins.length || 1;
  return { accuracy: Math.round((ok / n) * 10_000) / 10_000, brier: Math.round((br / n) * 10_000) / 10_000 };
}

interface MetaMatch {
  match_id: number;
  winning_team: string;
  players: { hero_id: number; team: string }[];
}

/** Los dos equipos de seis y si ganó el primero; las partidas incompletas no sirven. */
export function teamsOf(m: MetaMatch): { A: number[]; B: number[]; win: number } | null {
  const A = m.players.filter((p) => p.team === "Team0").map((p) => p.hero_id);
  const B = m.players.filter((p) => p.team === "Team1").map((p) => p.hero_id);
  if (A.length !== 6 || B.length !== 6) return null;
  if (m.winning_team !== "Team0" && m.winning_team !== "Team1") return null;
  return { A, B, win: m.winning_team === "Team0" ? 1 : 0 };
}

/**
 * Ajusta en las partidas pares y mide en las impares, y al revés; publica la
 * escala de todas y el promedio de las dos mediciones.
 */
export function fitBand(t: Tables, games: { A: number[]; B: number[]; win: number }[]): Omit<DraftBand, "from" | "to"> {
  const m = games.map((g) => draftMargin(t, g.A, g.B));
  const w = games.map((g) => g.win);
  const par = (i: number) => i % 2 === 0;
  const pick = <T,>(xs: T[], f: (i: number) => boolean) => xs.filter((_, i) => f(i));
  const impar = (i: number) => !par(i);
  const e1 = evaluate(fitScale(pick(m, par), pick(w, par)), pick(m, impar), pick(w, impar));
  const e2 = evaluate(fitScale(pick(m, impar), pick(w, impar)), pick(m, par), pick(w, par));
  const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    scale: r4(fitScale(m, w)),
    matches: games.length,
    accuracy: r4((e1.accuracy + e2.accuracy) / 2),
    brier: r4((e1.brier + e2.brier) / 2),
  };
}

async function traer<T>(path: string): Promise<T> {
  // Sin User-Agent la API contesta 403 a algunos clientes.
  const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

interface TierListFile {
  from?: string;
  to?: string;
  heroes?: { heroId: number; winRate: number }[];
}

async function main() {
  const unix = (d: string) => Math.floor(Date.parse(d) / 1000);
  const anterior: DraftModelFile | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const out: DraftModelFile = { generatedAt: new Date().toISOString(), cv: CV, ca: CA, bands: { ...anterior?.bands } };

  for (const band of BANDS) {
    const tlPath = `${DATA_DIR}/heroes.${band.id}.json`;
    const insPath = `${DATA_DIR}/hero-insights.${band.id}.json`;
    if (!existsSync(tlPath) || !existsSync(insPath)) {
      console.log(`  ${band.id}: faltan la tier list o los cruces, la salteo`);
      continue;
    }
    const tl = JSON.parse(readFileSync(tlPath, "utf8")) as TierListFile;
    const ins = JSON.parse(readFileSync(insPath, "utf8")) as HeroInsightsFile;
    if (!tl.from || !tl.to || !tl.heroes?.length) continue;
    const t = tablesOf(tl.heroes, ins);
    const badge = badgeRange(band.tiers);
    const q =
      `min_average_badge=${badge.min}&max_average_badge=${badge.max}&game_mode=normal&include_player_info=true` +
      `&min_unix_timestamp=${unix(tl.from)}&max_unix_timestamp=${unix(`${tl.to}T23:59:59Z`)}` +
      `&order_by=match_id&order_direction=desc&limit=1000`;
    try {
      const partidas: MetaMatch[] = [];
      for (let i = 0; i < PAGES; i++) {
        const tope = partidas.length ? `&max_match_id=${Math.min(...partidas.map((p) => p.match_id)) - 1}` : "";
        const pagina = await traer<MetaMatch[]>(`matches/metadata?${q}${tope}`);
        partidas.push(...pagina);
        if (pagina.length < 1000) break;
      }
      const games = partidas.map(teamsOf).filter((g): g is NonNullable<typeof g> => g !== null);
      if (games.length < 500) {
        console.log(`  ${band.id}: sólo ${games.length} partidas completas; queda el modelo anterior`);
        continue;
      }
      out.bands[band.id] = { ...fitBand(t, games), from: tl.from, to: tl.to };
      const b = out.bands[band.id]!;
      console.log(`  ${band.id}: escala ${b.scale}, acierta ${(b.accuracy * 100).toFixed(1)} % en ${b.matches} partidas`);
    } catch (e) {
      console.log(`  ${band.id}: la API no contestó (${e instanceof Error ? e.message : e}); queda el modelo anterior`);
    }
  }
  if (!Object.keys(out.bands).length) throw new Error("ninguna banda tiene modelo");
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
