import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "./i18n";
import { text } from "./localized";
import type { MatchPlayer, ParsedMatch } from "./deadlockMatch";
import { heroImg, heroName, itemOf } from "./deadlockReportData";
import GameImg, { variantUrl } from "./GameImg";
import { MATCH_TABS_COPY } from "./deadlockMatchTabsCopy";
import { impactOf, teamSoulsAt } from "./deadlockMatchImpact";
import DeadlockStoryCard from "./DeadlockStoryCard";
import DeadlockCoachCard from "./DeadlockCoachCard";
import DeadlockProCompare, { compareStatsOf } from "./DeadlockProCompare";
import type { PlayerCoaching } from "./deadlockCoaching";
import { drawImpactCard, shareOrDownload } from "./deadlockImpactCard";
import { heroCard } from "./deadlockReportData";
import type { StoryFact } from "./deadlockMatchStory";
import {
  deadAt,
  curveAt,
  objectiveKind,
  type LedgerEntry,
  posAt,

  structureMarks,
  type StructureMark,
  type Replay,
  type ReplayDeath,
  type ReplayFight,
} from "./deadlockReplay";
import "./styles/deadlock-replay.css";

/**
 * La pestaña Repetición de una partida (2026-11-20): la partida entera sobre
 * el mapa, con marcador, lo que pasó y la curva de chance como barra para
 * moverse; y adentro, "Pelea por pelea", que acerca el mapa a cada pelea y la
 * repite sola.
 *
 * El dibujo va en `<canvas>` y lo mueve un `requestAnimationFrame` que no pasa
 * por React: el estado de React (marcador, lista) se actualiza cada medio
 * segundo de partida, que alcanza y no redibuja la lista 60 veces por segundo.
 */

const TEAM = ["Hidden King", "Archmother"] as const;
const RELIEF = "/deadlock/game/map/relief.webp";
const SPEEDS = [2, 8, 20, 40] as const;
const FIGHT_SPEEDS = [1, 3, 6] as const;
/** Desde cuánto una compra entra en la lista: objetos de tier 3 y 4. */
const BIG_ITEM = 3000;

const mmss = (s: number): string => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const corto = (x: number, lang: Lang): string =>
  Math.abs(x) >= 1000 ? `${(x / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })}k` : Math.round(x).toLocaleString(lang);
const pts1 = (v: number, lang: Lang) => (Math.round(v * 10) / 10).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (p: number) => Math.min(99, Math.max(1, Math.round(p * 100)));

/** Los colores salen del CSS de la pestaña; el canvas los lee una vez al montar. */
interface Palette {
  team: [string, string];
  good: string;
  warn: string;
  bad: string;
  text: string;
  accent: string;
  ink: string;
}
function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    team: [v("--rp-amber", "#f0a34a"), v("--rp-sapphire", "#6fa8e6")],
    good: v("--good", "#97da79"),
    warn: "#f0c24b",
    bad: v("--bad", "#ef5b4b"),
    text: v("--text", "#f7e9d5"),
    accent: v("--accent-lit", "#f59a6c"),
    ink: "#0e0c09",
  };
}

type View = [number, number, number, number];
const WHOLE: View = [0, 0, 1000, 1000];

/* ── Dibujo ──────────────────────────────────────────────────────────────── */

function sizeCanvas(cv: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return [g, w, h];
}

interface MapScene {
  match: ParsedMatch;
  replay: Replay;
  marks: StructureMark[];
  /** Las fotos de cada estructura (la variante A de los íconos). */
  structImgs: Record<StructureMark["kind"] | "patron-1", HTMLImageElement>;
  imgs: Map<number, HTMLImageElement>;
  relief: HTMLImageElement;
  pal: Palette;
}

/* ── Estructuras ──────────────────────────────────────────────────────────
   La foto de cada una (las mismas de la pestaña Mapa, con fondo transparente)
   sin recortar, con un halo del color del dueño; las caídas, en gris. */

/** El alto de cada estructura en pantalla, relativo: el Patrón es el más grande. */
const STRUCT_SIZE: Record<StructureMark["kind"], number> = { guardian: 0.8, walker: 1, baseGuardian: 0.8, shrine: 0.85, patron: 1.3 };

function drawStructures(
  g: CanvasRenderingContext2D,
  s: MapScene,
  t: number,
  X: (x: number) => number,
  Y: (y: number) => number,
  w: number,
  h: number,
  zoomed: boolean,
) {
  const base = Math.max(18, Math.min(32, w / 20)) * (zoomed ? 1.6 : 1);
  for (const m of s.marks) {
    const x = X(m.x);
    const y = Y(m.y);
    if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
    const im = m.kind === "patron" ? s.structImgs[m.team === 0 ? "patron-1" : "patron"] : s.structImgs[m.kind];
    if (!im?.complete || !im.naturalWidth) continue;
    const caida = m.fell !== null && m.fell <= t;
    const alto = base * STRUCT_SIZE[m.kind];
    const k = alto / im.naturalHeight;
    const iw = im.naturalWidth * k;
    g.save();
    // La base del color del dueño, bajo los pies: las fotos son todas anaranjadas.
    if (!caida) {
      g.beginPath();
      g.ellipse(x, y + alto * 0.42, iw * 0.55, alto * 0.16, 0, 0, Math.PI * 2);
      g.fillStyle = s.pal.team[m.team === 0 ? 0 : 1];
      g.globalAlpha = 0.85;
      g.fill();
      g.globalAlpha = 1;
    }
    if (caida) {
      g.globalAlpha = 0.4;
      g.filter = "grayscale(1)";
    } else {
      // El halo del equipo: la sombra de la misma figura, sin corrimiento.
      g.shadowColor = s.pal.team[m.team === 0 ? 0 : 1];
      g.shadowBlur = Math.max(4, alto / 5);
    }
    g.drawImage(im, x - iw / 2, y - alto / 2, iw, alto);
    g.restore();
  }
}

/* ── Mapa de calor ─────────────────────────────────────────────────────────
   Una grilla chica que el canvas agranda con suavizado: eso ya da la mancha
   sin calcular ningún desenfoque (lo mismo que DeadlockKillMap). */

export interface HeatLayer {
  canvas: HTMLCanvasElement;
  /** Cruces a dibujar encima (las muertes del jugador), en el encuadre del mapa. */
  marks?: [number, number][];
}

/** Las grillas de muertes de cada héroe (las de la ficha de héroe), en su pedazo. */
const KILL_MAPS = import.meta.glob<{ default: { size: number; deaths: string } }>("../../games/deadlock/data/kill-map/*.json");

const HEAT_SIZE = 64;

/** Pinta una grilla de 0..1 con una rampa de color; `rotate` la gira 180°. */
function heatCanvas(values: Float32Array, size: number, lo: number[], hi: number[], rotate = false, floor = 40, gain = 200): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < 0.06) continue;
    const j = rotate ? values.length - 1 - i : i;
    img.data[j * 4] = Math.round(lo[0] + (hi[0] - lo[0]) * v);
    img.data[j * 4 + 1] = Math.round(lo[1] + (hi[1] - lo[1]) * v);
    img.data[j * 4 + 2] = Math.round(lo[2] + (hi[2] - lo[2]) * v);
    img.data[j * 4 + 3] = Math.round(floor + v * gain);
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Dónde pasó el tiempo un jugador (vivo), en una grilla de 0..1 con raíz para que se vea lo poco. */
function timeHeat(replay: Replay, slot: number): HTMLCanvasElement | null {
  const tr = replay.tracks.get(slot);
  if (!tr) return null;
  const grid = new Float32Array(HEAT_SIZE * HEAT_SIZE);
  for (let i = 0; i < tr.x.length; i++) {
    if (deadAt(replay.deaths, slot, i * replay.interval)) continue;
    const cx = Math.min(HEAT_SIZE - 1, Math.max(0, Math.floor((tr.x[i] / 1000) * HEAT_SIZE)));
    const cy = Math.min(HEAT_SIZE - 1, Math.max(0, Math.floor((tr.y[i] / 1000) * HEAT_SIZE)));
    grid[cy * HEAT_SIZE + cx]++;
  }
  const max = Math.max(...grid);
  if (max === 0) return null;
  for (let i = 0; i < grid.length; i++) grid[i] = Math.sqrt(grid[i] / max);
  // Turquesa: el relieve es marrón anaranjado y una mancha naranja no se ve.
  return heatCanvas(grid, HEAT_SIZE, [30, 150, 180], [210, 255, 255], false, 70, 185);
}

/** Dónde muere en general este héroe; la grilla está con la base propia abajo. */
async function heroDeathHeat(heroId: number, team: number): Promise<HTMLCanvasElement | null> {
  const load = KILL_MAPS[`../../games/deadlock/data/kill-map/${heroId}.json`];
  if (!load) return null;
  const file = (await load()).default;
  const bin = atob(file.deaths);
  const grid = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) grid[i] = bin.charCodeAt(i) / 255;
  return heatCanvas(grid, file.size, [120, 20, 24], [255, 196, 90], team === 1);
}

/** El encuadre con que se dibujó el mapa: para saber qué hay bajo el puntero. */
interface MapFrame {
  v: View;
  sx: number;
  r: number;
}

function drawMap(
  cv: HTMLCanvasElement,
  s: MapScene,
  t: number,
  view: View,
  zoomed: boolean,
  focus: number | null = null,
  heat: HeatLayer | null = null,
): MapFrame | null {
  const [g, w, h] = sizeCanvas(cv);
  if (w === 0 || h === 0) return null;
  // El encuadre conserva la proporción: se agranda hacia el lado que sobra.
  let v = view;
  {
    const vw = v[2] - v[0];
    const vh = v[3] - v[1];
    const cx = (v[0] + v[2]) / 2;
    const cy = (v[1] + v[3]) / 2;
    if (w / h > vw / vh) {
      const nw = vh * (w / h);
      v = [cx - nw / 2, v[1], cx + nw / 2, v[3]];
    } else {
      const nh = vw * (h / w);
      v = [v[0], cy - nh / 2, v[2], cy + nh / 2];
    }
  }
  const sx = w / (v[2] - v[0]);
  const X = (x: number) => (x - v[0]) * sx;
  const Y = (y: number) => (y - v[1]) * sx;
  g.fillStyle = s.pal.ink;
  g.fillRect(0, 0, w, h);
  if (s.relief.complete && s.relief.naturalWidth) g.drawImage(s.relief, X(0), Y(0), X(1000) - X(0), Y(1000) - Y(0));
  g.fillStyle = zoomed ? "rgba(14,12,9,0.2)" : "rgba(14,12,9,0.35)";
  g.fillRect(0, 0, w, h);
  const r = Math.max(9, Math.min(17, w / 34)) * (zoomed ? 1.3 : 1);
  const { replay, match } = s;
  const teamOf = (slot: number) => match.players.find((p) => p.slot === slot)?.team ?? 0;

  // La capa de calor del jugador que se sigue, estirada sobre todo el mapa.
  if (heat) {
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.globalAlpha = 0.85;
    g.drawImage(heat.canvas, X(0), Y(0), X(1000) - X(0), Y(1000) - Y(0));
    g.restore();
  }
  drawStructures(g, s, t, X, Y, w, h, zoomed);
  if (heat?.marks) {
    // Cada muerte de la partida del jugador: una cruz clara con borde.
    for (const [mx, my] of heat.marks) {
      const x = X(mx);
      const y = Y(my);
      const c = 6;
      g.lineWidth = 4;
      g.strokeStyle = s.pal.ink;
      g.beginPath();
      g.moveTo(x - c, y - c);
      g.lineTo(x + c, y + c);
      g.moveTo(x + c, y - c);
      g.lineTo(x - c, y + c);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = s.pal.text;
      g.stroke();
    }
  }

  // Estelas: los últimos segundos de cada uno; el que se sigue, medio minuto.
  for (const p of match.players) {
    const tr = replay.tracks.get(p.slot);
    if (!tr) continue;
    const trail = p.slot === focus ? 30 : zoomed ? 6 : 8;
    g.lineWidth = p.slot === focus ? 3 : 2;
    g.globalAlpha = focus !== null && p.slot !== focus ? 0.3 : 1;
    g.beginPath();
    let prev: { x: number; y: number } | null = null;
    for (let k = Math.max(0, t - trail); k <= t; k += replay.interval) {
      if (deadAt(replay.deaths, p.slot, k)) {
        prev = null;
        continue;
      }
      const q = posAt(tr, replay.interval, k);
      // Un salto (revivir, teletransporte) corta la estela en vez de cruzar el mapa.
      if (!prev || Math.abs(q.x - prev.x) + Math.abs(q.y - prev.y) > 60) g.moveTo(X(q.x), Y(q.y));
      else g.lineTo(X(q.x), Y(q.y));
      prev = q;
    }
    g.strokeStyle = s.pal.team[p.team === 0 ? 0 : 1] + (p.slot === focus ? "" : "99");
    g.stroke();
    g.globalAlpha = 1;
  }

  // Muertes recientes: una cruz del color de quien murió y la línea desde quien lo mató.
  const win = zoomed ? 30 : 14;
  for (const d of replay.deaths) {
    if (d.t > t || t - d.t > win) continue;
    g.globalAlpha = 1 - (t - d.t) / win;
    if (d.from) {
      g.setLineDash([4, 4]);
      g.strokeStyle = s.pal.text;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(X(d.from[0]), Y(d.from[1]));
      g.lineTo(X(d.at[0]), Y(d.at[1]));
      g.stroke();
      g.setLineDash([]);
    }
    const x = X(d.at[0]);
    const y = Y(d.at[1]);
    const c = r * 0.55;
    g.strokeStyle = s.pal.team[teamOf(d.victim) === 0 ? 0 : 1];
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - c, y - c);
    g.lineTo(x + c, y + c);
    g.moveTo(x + c, y - c);
    g.lineTo(x - c, y + c);
    g.stroke();
    g.globalAlpha = 1;
  }

  // Héroes: el retrato en un círculo del color del equipo y la vida por fuera.
  for (const p of match.players) {
    const tr = replay.tracks.get(p.slot);
    if (!tr || deadAt(replay.deaths, p.slot, t)) continue;
    const q = posAt(tr, replay.interval, t);
    const x = X(q.x);
    const y = Y(q.y);
    if (x < -r || y < -r || x > w + r || y > h + r) continue;
    const apagado = focus !== null && p.slot !== focus;
    g.globalAlpha = apagado ? 0.4 : 1;
    if (p.slot === focus) {
      g.beginPath();
      g.arc(x, y, r + 9, 0, Math.PI * 2);
      g.strokeStyle = s.pal.accent;
      g.lineWidth = 2;
      g.stroke();
    }
    if (q.fighting) {
      g.beginPath();
      g.arc(x, y, r + 6, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,93,71,0.3)";
      g.fill();
    }
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.closePath();
    g.fillStyle = "#1a1612";
    g.fill();
    g.clip();
    const im = s.imgs.get(p.slot);
    if (im?.complete && im.naturalWidth) g.drawImage(im, x - r, y - r, r * 2, r * 2);
    g.restore();
    g.lineWidth = 2.5;
    g.strokeStyle = s.pal.team[p.team === 0 ? 0 : 1];
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = q.hp > 50 ? s.pal.good : q.hp > 25 ? s.pal.warn : s.pal.bad;
    g.beginPath();
    g.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (q.hp / 100));
    g.stroke();
    g.globalAlpha = 1;
  }
  return { v, sx, r };
}

function drawCurve(
  cv: HTMLCanvasElement,
  chanceAt: (t: number) => number,
  fights: ReplayFight[],
  s: MapScene,
  t: number,
  from: number,
  to: number,
) {
  const [g, w, h] = sizeCanvas(cv);
  if (w === 0 || h === 0) return;
  const X = (k: number) => ((k - from) / (to - from)) * w;
  const Y = (p: number) => h - p * h;
  const teamOf = (slot: number) => s.match.players.find((p) => p.slot === slot)?.team ?? 0;
  g.fillStyle = "rgba(240,163,74,0.07)";
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = "rgba(111,168,230,0.07)";
  g.fillRect(0, h / 2, w, h / 2);
  for (const f of fights) {
    if (f.end < from || f.start > to) continue;
    g.fillStyle = f.kills.length >= 4 ? "rgba(245,154,108,0.2)" : "rgba(245,154,108,0.1)";
    g.fillRect(X(f.start - 4), 0, Math.max(3, X(f.end + 4) - X(f.start - 4)), h);
  }
  const pts: [number, number][] = [];
  for (let k = from; k <= to; k += Math.max(1, (to - from) / 300)) pts.push([k, chanceAt(k)]);
  pts.push([to, chanceAt(to)]);
  ([0, 1] as const).forEach((team) => {
    g.save();
    g.beginPath();
    g.rect(0, team === 0 ? 0 : h / 2, w, h / 2);
    g.clip();
    g.beginPath();
    g.moveTo(X(pts[0][0]), h / 2);
    for (const [k, p] of pts) g.lineTo(X(k), Y(p));
    g.lineTo(X(pts[pts.length - 1][0]), h / 2);
    g.closePath();
    g.fillStyle = s.pal.team[team] + "55";
    g.fill();
    g.restore();
  });
  g.strokeStyle = "rgba(247,233,213,0.25)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  g.beginPath();
  pts.forEach(([k, p], i) => (i ? g.lineTo(X(k), Y(p)) : g.moveTo(X(k), Y(p))));
  g.strokeStyle = s.pal.text;
  g.lineWidth = 1.6;
  g.stroke();
  // Kills arriba o abajo según quién murió; estructuras como triángulos.
  for (const d of s.replay.deaths) {
    if (d.t < from || d.t > to) continue;
    const vt = teamOf(d.victim);
    g.fillStyle = s.pal.team[vt === 0 ? 1 : 0];
    g.fillRect(X(d.t) - 1, vt === 1 ? 0 : h - 6, 2, 6);
  }
  for (const o of s.replay.objectives) {
    if (o.t < from || o.t > to) continue;
    const x = X(o.t);
    const top = o.team === 1;
    g.fillStyle = s.pal.team[o.team === 0 ? 1 : 0];
    g.beginPath();
    g.moveTo(x, top ? 8 : h - 8);
    g.lineTo(x - 4, top ? 14 : h - 14);
    g.lineTo(x + 4, top ? 14 : h - 14);
    g.fill();
  }
  g.strokeStyle = s.pal.accent;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(t), 0);
  g.lineTo(X(t), h);
  g.stroke();
  g.fillStyle = s.pal.accent;
  g.beginPath();
  g.arc(X(t), Y(chanceAt(t)), 4, 0, Math.PI * 2);
  g.fill();
}

/* ── Desglose de un jugador ──────────────────────────────────────────────── */

type Group = "kills" | "assists" | "deaths" | "structures" | "structuresLost" | "boss" | "farm";
const GROUP_OF: Record<LedgerEntry["kind"], Group> = {
  kill: "kills",
  assist: "assists",
  death: "deaths",
  objective: "structures",
  objectiveLost: "structuresLost",
  boss: "boss",
  bossLost: "boss",
  farm: "farm",
};
const GROUPS: Group[] = ["kills", "assists", "deaths", "structures", "structuresLost", "boss", "farm"];

/** Cuántos momentos se listan: los que más movieron, para arriba o para abajo. */
const TOP_MOMENTS = 10;

function PlayerImpact({
  player,
  total,
  entries,
  duration,
  t,
  lang,
  hero,
  chip,
  onSeek,
  onBack,
  coach,
  allCoach,
  rank,
  tag,
  onCopyLink,
  compare,
}: {
  compare?: React.ReactNode;
  rank: { pos: number; of: number };
  tag: "mvp" | "sink" | null;
  onCopyLink: () => Promise<boolean>;
  coach?: PlayerCoaching;
  allCoach?: Map<number, PlayerCoaching>;
  player: MatchPlayer;
  total: number;
  entries: LedgerEntry[];
  duration: number;
  t: number;
  lang: Lang;
  hero: (slot: number) => string;
  chip: (p: MatchPlayer | undefined, px?: number) => React.ReactNode;
  onSeek: (t: number) => void;
  onBack: () => void;
}) {
  const c = MATCH_TABS_COPY[lang].replay;
  const s = MATCH_TABS_COPY[lang].share;
  const ic = MATCH_TABS_COPY[lang].impact;
  const fmt = (v: number) => `${v >= 0 ? "+" : "−"}${pts1(Math.abs(v), lang)}`;
  const [aviso, setAviso] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);

  // Por tipo: cuántas veces y cuánto.
  const groups = GROUPS.map((g) => {
    const es = entries.filter((e) => GROUP_OF[e.kind] === g);
    return { g, n: es.length, v: es.reduce((s, e) => s + e.value, 0) };
  }).filter((x) => x.n > 0 && Math.abs(x.v) >= 0.05);

  // La curva: el impacto acumulado a lo largo de la partida.
  const W = 300;
  const H = 64;
  const pts: [number, number][] = [[0, 0]];
  let acc = 0;
  for (const e of [...entries].sort((a, b) => a.t - b.t)) {
    pts.push([e.t, acc]);
    acc += e.value;
    pts.push([e.t, acc]);
  }
  pts.push([duration, acc]);
  const lo = Math.min(0, ...pts.map((p) => p[1]));
  const hi = Math.max(0, ...pts.map((p) => p[1]));
  const span = Math.max(1, hi - lo);
  const X = (s: number) => (s / duration) * W;
  const Y = (v: number) => 4 + ((hi - v) / span) * (H - 8);
  const line = pts.map(([s, v]) => `${X(s).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  const moments = entries
    .filter((e) => e.kind !== "farm" && e.kind !== "objectiveLost" && e.kind !== "bossLost")
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, TOP_MOMENTS)
    .sort((a, b) => a.t - b.t);

  const what = (e: LedgerEntry): string => {
    if (e.kind === "kill" && e.death) return c.mKill(hero(e.death.victim));
    if (e.kind === "assist" && e.death) return c.mAssist(hero(e.death.victim));
    if (e.kind === "death" && e.death)
      return e.death.killer ? c.mDeath(hero(e.death.killer)) : c.mDeathAlone;
    if (e.kind === "objective" && e.objective) return c.mObjective(c.objectives[objectiveKind(e.objective.id)]);
    if (e.kind === "boss") return c.mBoss;
    return "";
  };

  /** La imagen para compartir: héroe, impacto, puesto y los 3 momentos más pesados. */
  const tarjeta = async () => {
    setArmando(true);
    try {
      // Para compartir va lo mejor: con impacto positivo, las 3 jugadas que más sumaron.
      const top = [...moments]
        .filter((e) => total < 0 || e.value > 0)
        .sort((a, b) => (total < 0 ? Math.abs(b.value) - Math.abs(a.value) : b.value - a.value))
        .slice(0, 3)
        .sort((a, b) => a.t - b.t);
      const cv = await drawImpactCard({
        hero: hero(player.slot),
        heroImg: heroCard(player.heroId),
        kda: `${player.kills}/${player.deaths}/${player.assists}`,
        impact: total,
        impactText: fmt(total),
        rank: ic.rank(rank.pos, rank.of),
        result: player.won ? s.won : s.lost,
        won: player.won,
        tag: tag === "mvp" ? ic.mvp : tag === "sink" ? ic.sink : null,
        moments: top.map((e) => ({ time: mmss(e.t), text: what(e), value: e.value, valueText: fmt(e.value) })),
        title: s.cardTitle,
        footer: "vestigo.gg",
        labels: { impact: ic.col, moments: c.momentsTitle },
      });
      const r = await shareOrDownload(cv, `vestigo-${hero(player.slot).toLowerCase().replace(/\s+/g, "-")}.png`, s.shareText(hero(player.slot), fmt(total)));
      setAviso(r === "shared" ? s.shared : s.downloaded);
    } catch {
      setAviso(s.cardFailed);
    } finally {
      setArmando(false);
    }
  };

  const seekCurve = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    if (r.width > 0) onSeek(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * duration);
  };

  return (
    <div className="dl-rp-player">
      <button type="button" className="dl-rp-link" onClick={onBack}>
        {c.allPlayers}
      </button>
      <div className="dl-rp-player-head">
        {chip(player, 40)}
        <span>
          <b>{hero(player.slot)}</b>
          <small>
            {player.kills}/{player.deaths}/{player.assists} · {player.won ? c.won : c.lost}
          </small>
        </span>
        <b className={`dl-rp-player-total ${total >= 0 ? "is-good" : "is-bad"}`}>{fmt(total)}</b>
      </div>

      <div className="dl-rp-share">
        <button
          type="button"
          onClick={async () => {
            const ok = await onCopyLink();
            setAviso(ok ? s.copied : s.copyFailed);
          }}
        >
          {s.copyLink}
        </button>
        <button type="button" onClick={tarjeta} disabled={armando}>
          {armando ? s.making : s.card}
        </button>
        {aviso && (
          <span className="dl-rp-share-note" role="status">
            {aviso}
          </span>
        )}
      </div>

      <svg
        className="dl-rp-spark"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={c.sparkLabel}
        onPointerDown={seekCurve}
      >
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="dl-rp-spark-zero" />
        <polyline points={line} className={acc >= 0 ? "is-good" : "is-bad"} />
        <line x1={X(t)} x2={X(t)} y1={0} y2={H} className="dl-rp-spark-now" />
      </svg>
      <p className="dl-rp-spark-axis">
        <span>0:00</span>
        <span>{c.sparkLabel}</span>
        <span>{mmss(duration)}</span>
      </p>

      <ul className="dl-rp-groups">
        {groups.map(({ g, n, v }) => (
          <li key={g}>
            <span>
              {c.groups[g]}
              {g !== "farm" && <small> ×{n}</small>}
            </span>
            <b className={v >= 0 ? "is-good" : "is-bad"}>{fmt(v)}</b>
          </li>
        ))}
      </ul>

      {coach && allCoach && <DeadlockCoachCard coach={coach} all={allCoach} lang={lang} />}
      {compare}

      <h4 className="dl-rp-h">{c.momentsTitle}</h4>
      <ol className="dl-rp-moments">
        {moments.map((e, i) => (
          <li key={i}>
            <button type="button" onClick={() => onSeek(e.t - 6)}>
              <span className="dl-rp-ev-t">{mmss(e.t)}</span>
              <span>{what(e)}</span>
              <b className={e.value >= 0 ? "is-good" : "is-bad"}>{fmt(e.value)}</b>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Componente ──────────────────────────────────────────────────────────── */

type Mode = { kind: "match" } | { kind: "fight"; fight: ReplayFight };

export default function DeadlockMatchReplay({ match, lang }: { match: ParsedMatch; lang: Lang }) {
  const c = MATCH_TABS_COPY[lang].replay;
  const replay = match.replay;
  if (!replay) {
    return (
      <section className="box dl-rep-block">
        <p className="detail-note">{c.noData}</p>
      </section>
    );
  }
  return <ReplayView match={match} replay={replay} lang={lang} />;
}

function ReplayView({ match, replay, lang }: { match: ParsedMatch; replay: Replay; lang: Lang }) {
  const c = MATCH_TABS_COPY[lang].replay;
  const D = match.durationS;
  const bySlot = useMemo(() => new Map(match.players.map((p) => [p.slot, p])), [match]);
  const teamOf = useCallback((slot: number) => bySlot.get(slot)?.team ?? 0, [bySlot]);
  const hero = useCallback(
    (slot: number) => {
      const p = bySlot.get(slot);
      const n = p ? heroName(p.heroId) : null;
      return n ? text(n, lang, "") : "?";
    },
    [bySlot, lang],
  );

  // El impacto se arma una vez por partida y lo comparte con "Tu informe".
  const imp = useMemo(() => impactOf(match)!, [match]);
  const soulsAt = useCallback((t: number) => teamSoulsAt(match, t), [match]);
  const chance = useCallback((t: number) => curveAt(imp.curve, t), [imp]);
  const fights = imp.fights;
  const ledger = imp.ledger;
  const impact = imp.totals;

  const [mode, setMode] = useState<Mode>({ kind: "match" });
  const [side, setSide] = useState<"events" | "impact">("events");
  /** El jugador que se sigue: el mapa lo resalta y el panel muestra su desglose. */
  const [focus, setFocus] = useState<number | null>(null);
  const focusRef = useRef<number | null>(null);
  const frameRef = useRef<MapFrame | null>(null);
  /** La capa de calor del jugador que se sigue: apagada, dónde estuvo o dónde murió. */
  const [heatMode, setHeatMode] = useState<"off" | "time" | "deaths">("off");
  const heatRef = useRef<HeatLayer | null>(null);
  /** El héroe bajo el puntero, con dónde poner su nombre. */
  const [hover, setHover] = useState<{ slot: number; x: number; y: number } | null>(null);
  focusRef.current = focus;
  useEffect(() => {
    dirty.current = true;
  }, [focus]);
  const [order, setOrder] = useState<"weight" | "time">("weight");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [ui, setUi] = useState(0);

  const tRef = useRef(0);
  const playRef = useRef(false);
  const speedRef = useRef(speed);
  const modeRef = useRef<Mode>(mode);
  const dirty = useRef(true);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const curveRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  speedRef.current = speed;
  modeRef.current = mode;

  const windowOf = (m: Mode): [number, number] =>
    m.kind === "fight" ? [Math.max(0, m.fight.start - 15), Math.min(D, m.fight.end + 6)] : [0, D];

  const scene = useMemo<MapScene | null>(() => {
    if (typeof window === "undefined") return null;
    const relief = new Image();
    relief.decoding = "async";
    relief.src = RELIEF;
    const imgs = new Map<number, HTMLImageElement>();
    for (const p of match.players) {
      const src = heroImg(p.heroId);
      if (!src) continue;
      const im = new Image();
      im.src = variantUrl(src, 48);
      imgs.set(p.slot, im);
    }
    const teamOf = (slot: number) => match.players.find((p) => p.slot === slot)?.team ?? 0;
    const foto = (f: string) => {
      const im = new Image();
      im.decoding = "async";
      im.src = `/deadlock/game/map/${f}.webp`;
      return im;
    };
    const structImgs = {
      // El guardián de línea no tiene foto propia en el Mapa: va la del de base, que es el mismo modelo.
      guardian: foto("base-guardian"),
      walker: foto("walker"),
      baseGuardian: foto("base-guardian"),
      shrine: foto("shrine"),
      patron: foto("patron-3"),
      "patron-1": foto("patron-2"),
    };
    return {
      match,
      replay,
      marks: structureMarks(replay, teamOf),
      structImgs,
      imgs,
      relief,
      pal: readPalette(document.documentElement),
    };
  }, [match, replay]);

  const seek = useCallback((t: number) => {
    const [a, b] = windowOf(modeRef.current);
    tRef.current = Math.max(a, Math.min(b, t));
    dirty.current = true;
    setUi(Math.floor(tRef.current * 2) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPlay = useCallback((on: boolean) => {
    playRef.current = on;
    setPlaying(on);
  }, []);

  // El reloj y el dibujo.
  useEffect(() => {
    if (!scene) return;
    const root = rootRef.current;
    if (root) scene.pal = readPalette(root);
    const redraw = () => (dirty.current = true);
    scene.relief.onload = redraw;
    scene.imgs.forEach((im) => (im.onload = redraw));
    Object.values(scene.structImgs).forEach((im) => im.addEventListener("load", redraw));
    const ro = new ResizeObserver(redraw);
    if (mapRef.current) ro.observe(mapRef.current);
    if (curveRef.current) ro.observe(curveRef.current);
    let last = performance.now();
    let raf = 0;
    let shown = -1;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      const [a, b] = windowOf(m);
      if (playRef.current) {
        tRef.current = Math.min(b, tRef.current + dt * speedRef.current);
        if (tRef.current >= b) setPlay(false);
        dirty.current = true;
      }
      if (dirty.current) {
        dirty.current = false;
        const t = tRef.current;
        if (mapRef.current)
          frameRef.current = drawMap(
            mapRef.current,
            scene,
            t,
            m.kind === "fight" ? m.fight.view : WHOLE,
            m.kind === "fight",
            focusRef.current,
            heatRef.current,
          );
        if (curveRef.current) drawCurve(curveRef.current, chance, fights, scene, t, a, b);
        const half = Math.floor(t * 2) / 2;
        if (half !== shown) {
          shown = half;
          setUi(half);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, chance, fights, setPlay]);

  // Arranca donde dice el enlace (?t=segundo&p=jugador) o justo antes de la
  // primera pelea: el principio de la partida es farmeo.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = Number(q.get("p"));
    if (q.has("p") && bySlot.has(p)) {
      setFocus(p);
      setSide("impact");
    }
    const t = Number(q.get("t"));
    seek(q.has("t") && Number.isFinite(t) ? t : fights.length ? Math.max(0, fights[0].start - 10) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fights, seek]);

  /** El enlace a este segundo, siguiendo al jugador elegido si hay uno. */
  const copyLink = async (): Promise<boolean> => {
    const u = new URL(window.location.href);
    u.search = "";
    u.searchParams.set("t", String(Math.floor(tRef.current)));
    if (focusRef.current !== null) u.searchParams.set("p", String(focusRef.current));
    try {
      await navigator.clipboard.writeText(u.toString());
      return true;
    } catch {
      return false;
    }
  };

  const enterFight = (f: ReplayFight) => {
    const m: Mode = { kind: "fight", fight: f };
    modeRef.current = m;
    setMode(m);
    setSpeed(3);
    seek(Math.max(0, f.start - 15));
    setPlay(true);
  };
  const leaveFight = () => {
    const t = tRef.current;
    const m: Mode = { kind: "match" };
    modeRef.current = m;
    setMode(m);
    setSpeed(8);
    setPlay(false);
    seek(t);
  };

  const toggle = () => {
    const [a, b] = windowOf(modeRef.current);
    if (!playRef.current && tRef.current >= b - 0.5) seek(a);
    setPlay(!playRef.current);
  };

  const scrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointermove" && e.buttons === 0) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const [a, b] = windowOf(modeRef.current);
    seek(a + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (b - a));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== "CANVAS") return;
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      seek(tRef.current + 10);
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      seek(tRef.current - 10);
    }
  };

  /* ── Lo que se muestra al lado ── */

  const t = ui;
  const p0 = chance(t);
  const fav = p0 >= 0.5 ? 0 : 1;
  const [sa, sb] = soulsAt(t);

  type Ev =
    | { t: number; kind: "kill"; d: ReplayDeath; v: number }
    | { t: number; kind: "obj"; team: number; id: number; v: number }
    | { t: number; kind: "boss"; team: number; v: number }
    | { t: number; kind: "item"; p: MatchPlayer; itemId: number };
  const events = useMemo<Ev[]>(() => {
    const ev: Ev[] = [];
    for (const d of replay.deaths) ev.push({ t: d.t, kind: "kill", d, v: imp.deathPts.get(d) ?? 0 });
    for (const o of replay.objectives) ev.push({ t: o.t, kind: "obj", team: o.team, id: o.id, v: imp.objectivePts.get(o) ?? 0 });
    for (const b of match.midBoss) if (b.team === 0 || b.team === 1) ev.push({ t: b.t, kind: "boss", team: b.team, v: imp.bossPts.get(b) ?? 0 });
    for (const p of match.players)
      for (const it of p.purchases)
        if (!it.soldS && (itemOf(it.itemId)?.cost ?? 0) >= BIG_ITEM) ev.push({ t: it.buyS, kind: "item", p, itemId: it.itemId });
    return ev.sort((a, b) => a.t - b.t);
  }, [replay, match, imp]);

  // La lista sigue al reloj.
  const lastIdx = events.reduce((n, e, i) => (e.t <= t ? i : n), -1);
  useEffect(() => {
    if (mode.kind !== "match" || side !== "events" || lastIdx < 0) return;
    const el = listRef.current?.children[lastIdx] as HTMLElement | undefined;
    const box = listRef.current;
    if (el && box) {
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - el.offsetHeight)
        box.scrollTop = Math.max(0, top - box.clientHeight / 2);
    }
  }, [lastIdx, mode.kind, side]);

  const chip = (p: MatchPlayer | undefined, px = 24) =>
    p ? (
      <GameImg
        className={`dl-rp-chip ${p.team === 0 ? "is-amber" : "is-sapphire"}`}
        src={heroImg(p.heroId) ?? ""}
        alt={hero(p.slot)}
        title={hero(p.slot)}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
      />
    ) : null;

  const evRow = (e: Ev, i: number) => {
    const cls = `dl-rp-ev${e.t > t ? " is-future" : ""}${e.t <= t && t - e.t < 6 ? " is-now" : ""}`;
    const go = () => seek(e.t - 6);
    const time = <span className="dl-rp-ev-t">{mmss(e.t)}</span>;
    if (e.kind === "kill") {
      const k = bySlot.get(e.d.killer);
      const vic = bySlot.get(e.d.victim);
      return (
        <li key={i} className={cls}>
          <button type="button" onClick={go}>
            {time}
            <span className="dl-rp-ev-what">
              {chip(k)}
              <span>{k ? c.kill(hero(e.d.killer), hero(e.d.victim)) : c.died(hero(e.d.victim))}</span>
              {chip(vic)}
            </span>
            <span className="dl-rp-ev-v is-good">+{pts1(e.v, lang)}</span>
          </button>
        </li>
      );
    }
    if (e.kind === "obj") {
      const by = e.team === 0 ? 1 : 0;
      return (
        <li key={i} className={cls}>
          <button type="button" onClick={go}>
            {time}
            <span className="dl-rp-ev-what">
              <i className={`dl-rp-dia ${by === 0 ? "is-amber" : "is-sapphire"}`} aria-hidden="true" />
              <span>{c.objective(TEAM[by], c.objectives[objectiveKind(e.id)])}</span>
            </span>
            <span className="dl-rp-ev-v is-good">+{pts1(e.v, lang)}</span>
          </button>
        </li>
      );
    }
    if (e.kind === "boss") {
      return (
        <li key={i} className={cls}>
          <button type="button" onClick={go}>
            {time}
            <span className="dl-rp-ev-what">
              <i className={`dl-rp-dia ${e.team === 0 ? "is-amber" : "is-sapphire"}`} aria-hidden="true" />
              <span>{c.midboss(TEAM[e.team as 0 | 1])}</span>
            </span>
            <span className="dl-rp-ev-v is-good">+{pts1(e.v, lang)}</span>
          </button>
        </li>
      );
    }
    const it = itemOf(e.itemId);
    const name = it ? text(it.name, lang, "") : "";
    return (
      <li key={i} className={cls}>
        <button type="button" onClick={go}>
          {time}
          <span className="dl-rp-ev-what">
            {chip(e.p)}
            {it && <GameImg className="dl-rp-item" src={it.img} alt="" width={22} height={22} loading="lazy" decoding="async" />}
            <span>
              {hero(e.p.slot)} {c.bought(name)}
            </span>
          </span>
          <span className="dl-rp-ev-v is-dim">{corto(it?.cost ?? 0, lang)}</span>
        </button>
      </li>
    );
  };

  const impactRows = [...impact].map(([slot, v]) => ({ p: bySlot.get(slot)!, v })).filter((r) => r.p).sort((a, b) => b.v - a.v);
  const maxImpact = Math.max(1, ...impactRows.map((r) => Math.abs(r.v)));

  const sortedFights = useMemo(
    () =>
      [...fights].sort((a, b) =>
        order === "weight" ? Math.abs(b.after - b.before) - Math.abs(a.after - a.before) : a.start - b.start,
      ),
    [fights, order],
  );

  const fightTitle = (f: ReplayFight) =>
    f.winner === null ? c.fightEven(f.deaths[0]) : c.fightTitle(TEAM[f.winner], f.deaths[f.winner === 0 ? 1 : 0], f.deaths[f.winner]);

  const fightPanel = (f: ReplayFight) => {
    const part = new Map<number, { k: number; a: number; d: number; v: number }>();
    for (const e of ledger) {
      if (!e.death || !f.kills.includes(e.death)) continue;
      const row = part.get(e.slot) ?? { k: 0, a: 0, d: 0, v: 0 };
      if (e.kind === "kill") row.k++;
      else if (e.kind === "assist") row.a++;
      else if (e.kind === "death") row.d++;
      row.v += e.value;
      part.set(e.slot, row);
    }
    const rows = [...part].map(([slot, e]) => ({ p: bySlot.get(slot)!, ...e })).sort((a, b) => b.v - a.v);
    const first = f.kills[0];
    const w = f.winner ?? (f.after >= f.before ? 0 : 1);
    const diff = (k: number) => {
      const [a, b] = soulsAt(k);
      return a - b;
    };
    const gained = Math.abs(diff(Math.min(D, f.end + 60)) - diff(Math.max(0, f.start - 10)));
    return (
      <div className="dl-rp-fight">
        <p className="dl-rp-verdict">
          {first.killer && bySlot.has(first.killer) ? c.firstFell(hero(first.victim), hero(first.killer)) : c.firstFellAlone(hero(first.victim))}{" "}
          {c.soulsAfter(TEAM[w], corto(gained, lang))}
        </p>
        {(
          [
            [c.before, f.before],
            [c.after, f.after],
          ] as const
        ).map(([label, p]) => (
          <div className="dl-rp-meter" key={label}>
            <p>
              <span>{label}</span>
              <span>
                <b className="is-amber">{pct(p)} %</b> – <b className="is-sapphire">{pct(1 - p)} %</b>
              </span>
            </p>
            <div className="dl-rp-meter-bar">
              <i className="is-amber" style={{ width: `${p * 100}%` }} />
              <i className="is-sapphire" />
            </div>
          </div>
        ))}
        <h4 className="dl-rp-h">
          {c.whoDid} <span className="dl-rp-beta">{c.beta}</span>
        </h4>
        <ul className="dl-rp-who">
          {rows.map((r) => (
            <li key={r.p.slot}>
              {chip(r.p, 26)}
              <span>
                {hero(r.p.slot)}
                <small>{[r.k ? c.kills(r.k) : "", r.a ? c.assists(r.a) : "", r.d ? c.diedTag : ""].filter(Boolean).join(" · ")}</small>
              </span>
              <b className={r.v >= 0 ? "is-good" : "is-bad"}>
                {r.v >= 0 ? "+" : ""}
                {r.v.toLocaleString(lang, { maximumFractionDigits: 1 })}
              </b>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  /** El héroe vivo más cerca del puntero, si está encima de su retrato. */
  const heroAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = frameRef.current;
    if (!f) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: { slot: number; d: number; x: number; y: number } | null = null;
    for (const p of match.players) {
      const tr = replay.tracks.get(p.slot);
      if (!tr || deadAt(replay.deaths, p.slot, tRef.current)) continue;
      const q = posAt(tr, replay.interval, tRef.current);
      const x = (q.x - f.v[0]) * f.sx;
      const y = (q.y - f.v[1]) * f.sx;
      const d = Math.hypot(x - px, y - py);
      if (d <= f.r + 4 && (!best || d < best.d)) best = { slot: p.slot, d, x, y };
    }
    return best;
  };
  const onMapMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const h = heroAt(e);
    e.currentTarget.style.cursor = h ? "pointer" : "default";
    setHover(h ? { slot: h.slot, x: h.x, y: h.y } : null);
  };
  const onMapClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const h = heroAt(e);
    if (!h) return;
    // Seguirlo: el mapa lo resalta y el panel abre su impacto.
    setFocus(focus === h.slot ? null : h.slot);
    if (mode.kind === "match") setSide("impact");
  };
  const recientes = replay.deaths.filter((d) => d.t <= t && t - d.t <= 10).slice(-4);

  /** Un hecho del resumen lleva a su momento: la pelea, el segundo o el jugador. */
  const pickFact = (f: StoryFact) => {
    if (f.kind === "turn") {
      enterFight(f.fight);
      return;
    }
    if (mode.kind === "fight") leaveFight();
    setPlay(false);
    if (f.kind === "comeback") seek(f.t - 10);
    else if (f.kind === "collapse") seek(f.from - 10);
    else if (f.kind === "boss") seek(f.t - 10);
    else if (f.kind === "carry" || f.kind === "sink" || f.kind === "farm") {
      setFocus(f.slot);
      setSide("impact");
    }
    rootRef.current?.querySelector(".dl-rp-main")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Arma la capa de calor cuando cambia el jugador o el modo.
  useEffect(() => {
    let vivo = true;
    const p = focus !== null ? bySlot.get(focus) : undefined;
    if (!p || heatMode === "off") {
      heatRef.current = null;
      dirty.current = true;
      return;
    }
    if (heatMode === "time") {
      const cv = timeHeat(replay, p.slot);
      heatRef.current = cv ? { canvas: cv } : null;
      dirty.current = true;
    } else {
      const marks = replay.deaths.filter((d) => d.victim === p.slot).map((d) => d.at);
      heroDeathHeat(p.heroId, p.team).then((cv) => {
        if (!vivo) return;
        heatRef.current = cv ? { canvas: cv, marks } : { canvas: document.createElement("canvas"), marks };
        dirty.current = true;
      });
    }
    return () => {
      vivo = false;
    };
  }, [focus, heatMode, replay, bySlot]);

  const [wa, wb] = windowOf(mode);
  const lead = Math.abs(sa - sb);

  return (
    <section className="box dl-rep-block dl-replay" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="box-head">
        <h2 className="box-title">{c.title}</h2>
        <div className="dl-rp-modes" role="tablist">
          <button type="button" role="tab" aria-selected={mode.kind === "match"} onClick={() => mode.kind !== "match" && leaveFight()}>
            {c.modes.match}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode.kind === "fight"}
            disabled={fights.length === 0}
            onClick={() => mode.kind !== "fight" && sortedFights[0] && enterFight(sortedFights[0])}
          >
            {c.modes.fights}
          </button>
        </div>
      </div>
      <p className="detail-note dl-rp-lead">{c.lead}</p>
      <DeadlockStoryCard match={match} story={imp.story} lang={lang} onPick={pickFact} />

      <div className="dl-rp-score">
        {([0, 1] as const).map((team) => (
          <ul className={`dl-rp-side ${team === 0 ? "is-amber" : "is-sapphire"}`} key={team}>
            {match.players
              .filter((p) => p.team === team)
              .map((p) => {
                const tr = replay.tracks.get(p.slot);
                const dead = deadAt(replay.deaths, p.slot, t);
                const hp = dead || !tr ? 0 : posAt(tr, replay.interval, t).hp;
                const k = replay.deaths.filter((d) => d.killer === p.slot && d.t <= t).length;
                const dd = replay.deaths.filter((d) => d.victim === p.slot && d.t <= t).length;
                return (
                  <li key={p.slot} className={dead ? "is-dead" : undefined}>
                    <span className="dl-rp-face">
                      {chip(p, 40)}
                      {dead && (
                        <span className="dl-rp-respawn" title={c.respawn(Math.ceil(dead.t + dead.dur - t))}>
                          {Math.ceil(dead.t + dead.dur - t)}
                        </span>
                      )}
                    </span>
                    <span className="dl-rp-hp">
                      <i style={{ width: `${hp}%` }} data-level={hp > 50 ? "ok" : hp > 25 ? "mid" : "low"} />
                    </span>
                    <span className="dl-rp-kd">
                      {k}/{dd}
                    </span>
                  </li>
                );
              })}
          </ul>
        ))}
        <div className="dl-rp-mid">
          <p className="dl-rp-souls">
            <b className="is-amber">{corto(sa, lang)}</b> <span>{c.souls}</span> <b className="is-sapphire">{corto(sb, lang)}</b>
          </p>
          <p className="dl-rp-ahead">{lead < 50 ? c.even : c.ahead(TEAM[sa > sb ? 0 : 1], corto(lead, lang))}</p>
        </div>
      </div>

      <div className="dl-rp-main">
        <div className={`dl-rp-map${mode.kind === "fight" ? " is-zoomed" : ""}`}>
          <canvas
            ref={mapRef}
            aria-label={c.title}
            onPointerMove={onMapMove}
            onPointerLeave={() => setHover(null)}
            onClick={onMapClick}
          />
          {hover && bySlot.get(hover.slot) && (
            <span className="dl-rp-tip" style={{ left: hover.x, top: hover.y }}>
              {hero(hover.slot)}
            </span>
          )}
          {focus !== null && bySlot.get(focus) && (
            <div className="dl-rp-heat" role="group" aria-label={c.heat.label}>
              {(["off", "time", "deaths"] as const).map((k) => (
                <button type="button" key={k} aria-pressed={heatMode === k} onClick={() => setHeatMode(k)}>
                  {c.heat[k]}
                </button>
              ))}
            </div>
          )}
          {heatMode === "deaths" && focus !== null && bySlot.get(focus) && (
            <p className="dl-rp-heat-note">{c.heat.deathsNote(hero(focus))}</p>
          )}
          {recientes.length > 0 && (
            <ol className="dl-rp-feed" aria-label={c.recentKills}>
              {recientes.map((d) => (
                <li key={`${d.t}-${d.victim}`}>
                  {d.killer ? chip(bySlot.get(d.killer), 22) : <span className="dl-rp-feed-none" />}
                  <span aria-hidden="true">✕</span>
                  {chip(bySlot.get(d.victim), 22)}
                  <span className="dl-rp-sr">
                    {d.killer ? c.kill(hero(d.killer), hero(d.victim)) : c.died(hero(d.victim))}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="dl-rp-badge">
            <span>{c.chanceLabel}</span>
            <b className={fav === 0 ? "is-amber" : "is-sapphire"}>
              {pct(fav === 0 ? p0 : 1 - p0)} % {TEAM[fav]}
            </b>
          </p>
          {mode.kind === "fight" && (
            <button type="button" className="dl-rp-back" onClick={leaveFight}>
              {c.back}
            </button>
          )}
        </div>

        <div className="dl-rp-panel">
          {mode.kind === "match" ? (
            <>
              <div className="dl-rp-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={side === "events"} onClick={() => setSide("events")}>
                  {c.tabs.events}
                </button>
                <button type="button" role="tab" aria-selected={side === "impact"} onClick={() => setSide("impact")}>
                  {c.tabs.impact} <span className="dl-rp-beta">{c.beta}</span>
                </button>
              </div>
              {side === "events" ? (
                <ol className="dl-rp-list" ref={listRef}>
                  {events.map(evRow)}
                </ol>
              ) : (
                <div className="dl-rp-list">
                  {focus !== null && bySlot.get(focus) ? (
                    <PlayerImpact
                      player={bySlot.get(focus)!}
                      total={impact.get(focus) ?? 0}
                      entries={ledger.filter((e) => e.slot === focus)}
                      duration={D}
                      t={t}
                      lang={lang}
                      hero={hero}
                      chip={chip}
                      onSeek={(s) => {
                        setPlay(false);
                        seek(s);
                      }}
                      onBack={() => setFocus(null)}
                      coach={imp.coaching.get(focus)}
                      allCoach={imp.coaching}
                      rank={{
                        pos: [...impact].sort((a, b) => b[1] - a[1]).findIndex(([sl]) => sl === focus) + 1,
                        of: impact.size,
                      }}
                      tag={imp.mvp === focus ? "mvp" : imp.sink === focus ? "sink" : null}
                      onCopyLink={copyLink}
                      compare={(() => {
                        const p = bySlot.get(focus);
                        const mine = p ? compareStatsOf(match, imp, focus) : null;
                        return p && mine ? (
                          <DeadlockProCompare key={focus} heroId={p.heroId} duration={D} matchId={match.matchId} mine={mine} lang={lang} />
                        ) : null;
                      })()}
                    />
                  ) : (
                    <>
                      <p className="dl-rp-note">{c.impactLead}</p>
                      <ul className="dl-rp-impact">
                        {impactRows.map(({ p, v }) => (
                          <li key={p.slot}>
                            <button type="button" onClick={() => setFocus(p.slot)} aria-label={c.seeDetail(hero(p.slot))}>
                              {chip(p, 26)}
                              <span className="dl-rp-impact-who">
                                <span>
                                  {hero(p.slot)}
                                  <small>
                                    {p.kills}/{p.deaths}/{p.assists}
                                  </small>
                                </span>
                                <span className="dl-rp-impact-bar">
                                  <i
                                    className={v >= 0 ? "is-good" : "is-bad"}
                                    style={
                                      v >= 0
                                        ? { left: "50%", width: `${(v / maxImpact) * 50}%` }
                                        : { right: "50%", width: `${(-v / maxImpact) * 50}%` }
                                    }
                                  />
                                </span>
                              </span>
                              <b className={v >= 0 ? "is-good" : "is-bad"}>
                                {v >= 0 ? "+" : "−"}
                                {pts1(Math.abs(v), lang)}
                              </b>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dl-rp-fighthead">
                <h3 className={mode.fight.winner === 1 ? "is-sapphire" : mode.fight.winner === 0 ? "is-amber" : undefined}>
                  {fightTitle(mode.fight)}
                </h3>
                <p>{c.fightSub(mmss(mode.fight.start), mmss(mode.fight.end), mode.fight.kills.length, Math.max(1, mode.fight.end - mode.fight.start))}</p>
              </div>
              {fightPanel(mode.fight)}
              <div className="dl-rp-tabs">
                <button type="button" aria-pressed={order === "weight"} onClick={() => setOrder("weight")}>
                  {c.byWeight}
                </button>
                <button type="button" aria-pressed={order === "time"} onClick={() => setOrder("time")}>
                  {c.byTime}
                </button>
              </div>
              <ol className="dl-rp-list dl-rp-fights">
                {sortedFights.map((f) => {
                  const w = f.winner ?? (f.after >= f.before ? 0 : 1);
                  return (
                    <li key={f.start} className={f === mode.fight ? "is-on" : undefined}>
                      <button type="button" onClick={() => enterFight(f)}>
                        <span className="dl-rp-ev-t">{mmss(f.start)}</span>
                        <span className="dl-rp-fc">
                          <b>
                            <span className="is-amber">{f.deaths[1]}</span> – <span className="is-sapphire">{f.deaths[0]}</span>
                          </b>
                          <span className="dl-rp-fc-faces">
                            {f.kills.map((d, i) => (
                              <span key={i}>{chip(bySlot.get(d.victim), 18)}</span>
                            ))}
                          </span>
                        </span>
                        <span className={`dl-rp-ev-v ${w === 0 ? "is-amber" : "is-sapphire"}`}>
                          ±{c.chancePts(Math.round(Math.abs(f.after - f.before) * 100))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>

      <div className="dl-rp-transport">
        <button type="button" className="dl-rp-play" onClick={toggle} aria-label={playing ? c.pause : c.play}>
          {playing ? "❚❚" : "▶"}
        </button>
        <span className="dl-rp-clock">{mmss(t)}</span>
        <div className="dl-rp-curve">
          <canvas
            ref={curveRef}
            aria-label={c.chanceAxis}
            onPointerDown={scrub}
            onPointerMove={scrub}
          />
          <p className="dl-rp-axis" aria-hidden="true">
            <span className="is-amber">▲ {c.favourite(TEAM[0])}</span>
            <span>
              {mmss(wa)} · {c.chanceAxis} · {mmss(wb)}
            </span>
            <span className="is-sapphire">{c.favourite(TEAM[1])} ▼</span>
          </p>
        </div>
        <div className="dl-rp-speed" role="group" aria-label={c.speed}>
          {(mode.kind === "fight" ? FIGHT_SPEEDS : SPEEDS).map((s) => (
            <button type="button" key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
