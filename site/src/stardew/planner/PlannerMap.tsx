/**
 * El mapa del planificador: un `<canvas>` con la granja, lo colocado, los alcances y la vista previa de lo que se va a
 * poner. Mueve y acerca solo (rueda, botón del medio o Espacio, dos dedos); colocar y borrar los decide el padre con
 * `onStroke`, una pasada por trazo (lo que se pinta arrastrando es un solo paso de Deshacer).
 */
import { useEffect, useRef, useState } from "react";
import { Board, line, rangeTiles, sizeOf, type Coverage, type PlannerItem } from "./model";

/** Un trazo: empieza, pasa por casillas y termina; `cancel` lo deshace entero (llegó el segundo dedo). */
export interface Stroke {
  begin(erase: boolean): void;
  at(x: number, y: number): void;
  end(): void;
  cancel(): void;
}

interface View {
  k: number;
  ox: number;
  oy: number;
}

const MIN_K = 0.35;
const MAX_K = 8;
// Lo que se pinta arrastrando: cultivos y caminos. Lo demás se pone de a uno, en la casilla donde se apretó.
const PAINTS = new Set(["crop", "path"]);
const COLORS = { water: "rgba(64, 150, 255, 0.34)", scare: "rgba(255, 226, 110, 0.26)", diamond: "rgba(255, 190, 40, 0.28)", junimo: "rgba(110, 230, 120, 0.24)" };
const BAD = "rgba(230, 40, 30, 0.42)";

const images = new Map<string, HTMLImageElement>();
function image(src: string, onLoad: () => void): HTMLImageElement | null {
  let im = images.get(src);
  if (!im) {
    im = new Image();
    im.decoding = "async";
    im.src = src;
    images.set(src, im);
  }
  if (im.complete && im.naturalWidth) return im;
  im.addEventListener("load", onLoad, { once: true });
  return null;
}

export default function PlannerMap({
  board,
  cover,
  selected,
  erasing,
  showRanges,
  outOfSeason,
  stroke,
  label,
}: {
  board: Board;
  cover: Coverage;
  selected: PlannerItem | null;
  erasing: boolean;
  showRanges: boolean;
  /** ¿El cultivo de este id está fuera de la estación elegida? (se dibuja apagado) */
  outOfSeason: (id: string) => boolean;
  stroke: Stroke;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  // Lo vigente para los manejadores de entrada, que se enganchan una sola vez.
  const latest = useRef({ selected, erasing, stroke });
  useEffect(() => {
    latest.current = { selected, erasing, stroke };
  }, [selected, erasing, stroke]);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [tick, redraw] = useState(0);
  const farm = board.farm;
  const W = farm.w * 16;
  const H = farm.h * 16;

  // La vista inicial: el mapa entero si entra a 1×, si no a 1× y centrado. Cambia con la granja.
  useEffect(() => {
    view.current = null;
    redraw((n) => n + 1);
  }, [farm.key]);

  // El tamaño del canvas sigue al de su caja (y a la densidad de la pantalla).
  useEffect(() => {
    const c = canvas.current!;
    const ro = new ResizeObserver(() => redraw((n) => n + 1));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // --- Dibujo -------------------------------------------------------------------------------------------------
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (!cw || !ch) return;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    if (!view.current) {
      const fit = Math.min(cw / W, ch / H);
      const k = fit >= 1 ? Math.min(Math.floor(fit), 3) : Math.max(fit, Math.min(1, MAX_K));
      view.current = { k, ox: (cw - W * k) / 2, oy: (ch - H * k) / 2 };
    }
    const { k, ox, oy } = view.current;
    const g = c.getContext("2d")!;
    const again = () => redraw((n) => n + 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#1b3b12";
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = false;
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);

    const map = image(`/stardew/${farm.img}`, again);
    if (map) g.drawImage(map, 0, 0);

    const tile = (x: number, y: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(x * 16, y * 16, 16, 16);
    };
    const draw = (it: PlannerItem, x: number, y: number, alpha = 1) => {
      const im = image(`/stardew/${it.img}`, again);
      if (!im) return;
      const h = sizeOf(it)[1];
      // Abajo a la izquierda de la huella, como `Building.draw` y los objetos de 16×32; el frutal, centrado.
      const dx = it.place === "tree" ? x * 16 - (it.iw - 16) / 2 : x * 16;
      const dy = (y + h) * 16 - it.ih;
      g.globalAlpha = alpha;
      g.drawImage(im, dx, dy, it.iw, it.ih);
      g.globalAlpha = 1;
    };

    // Primero los pisos; después todo lo demás ordenado por su borde de abajo (lo de adelante tapa a lo de atrás).
    const list = board.placed.map((p) => ({ p, it: board.items.get(p.id)! })).filter((e) => e.it);
    for (const { p, it } of list) if (it.place === "floor") draw(it, p.x, p.y);
    const rest = list.filter((e) => e.it.place !== "floor").sort((a, b) => a.p.y + sizeOf(a.it)[1] - (b.p.y + sizeOf(b.it)[1]) || a.p.x - b.p.x);
    for (const { p, it } of rest) draw(it, p.x, p.y, it.cat === "crop" && outOfSeason(it.id) ? 0.45 : 1);

    // Los alcances: todos con el botón, o el de lo que se está por colocar.
    if (showRanges) {
      for (const i of cover.scared) tile(i % farm.w, Math.floor(i / farm.w), COLORS.scare);
      for (const i of cover.watered) tile(i % farm.w, Math.floor(i / farm.w), COLORS.water);
      for (const { p, it } of list) {
        if (it.range?.[0] === "diamond" || it.range?.[0] === "junimo") for (const [x, y] of rangeTiles(it, p.x, p.y)) tile(x, y, it.range[0] === "diamond" ? COLORS.diamond : COLORS.junimo);
      }
      // Lo que quedó afuera: cultivos sin riego en rojo y sin espantapájaros con una marca negra; frutales trabados.
      for (const i of cover.dry) tile(board.placed[i].x, board.placed[i].y, BAD);
      g.fillStyle = "rgba(20, 12, 8, 0.85)";
      for (const i of cover.exposed) g.fillRect(board.placed[i].x * 16 + 10, board.placed[i].y * 16 + 1, 5, 5);
      for (const i of cover.blocked) {
        const p = board.placed[i];
        g.strokeStyle = BAD;
        g.lineWidth = 2;
        g.strokeRect(p.x * 16 - 15, p.y * 16 - 15, 46, 46);
      }
    }

    // La vista previa bajo el cursor.
    if (hover) {
      const [hx, hy] = hover;
      if (erasing) {
        g.strokeStyle = "rgba(255, 255, 255, 0.9)";
        g.lineWidth = 1.5;
        g.strokeRect(hx * 16 + 0.75, hy * 16 + 0.75, 14.5, 14.5);
      } else if (selected) {
        if (selected.range) {
          const color = selected.cat === "water" ? COLORS.water : selected.cat === "scare" ? COLORS.scare : selected.range[0] === "diamond" ? COLORS.diamond : COLORS.junimo;
          for (const [x, y] of rangeTiles(selected, hx, hy)) tile(x, y, color);
        }
        const ok = board.canPlace(selected, hx, hy);
        draw(selected, hx, hy, 0.7);
        if (!ok) {
          const [w, h] = sizeOf(selected);
          g.fillStyle = BAD;
          g.fillRect(hx * 16, hy * 16, w * 16, h * 16);
        }
      }
    }
  }, [board, cover, selected, erasing, showRanges, hover, tick, farm, W, H, outOfSeason]);

  // --- Entrada ------------------------------------------------------------------------------------------------
  useEffect(() => {
    const c = canvas.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "paint" | "erase" | "pan" | "pinch" | null = null;
    let last: [number, number] | null = null;
    let pinch: { d: number; cx: number; cy: number; v: View } | null = null;
    let space = false;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const tileAt = (x: number, y: number): [number, number] => {
      const v = view.current!;
      return [Math.floor((x - v.ox) / v.k / 16), Math.floor((y - v.oy) / v.k / 16)];
    };
    const zoomAt = (x: number, y: number, k: number, base = view.current!) => {
      const nk = Math.min(MAX_K, Math.max(MIN_K, k));
      view.current = { k: nk, ox: x - ((x - base.ox) * nk) / base.k, oy: y - ((y - base.oy) * nk) / base.k };
    };
    const cur = () => latest.current;

    const down = (e: PointerEvent) => {
      if (!view.current) return;
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        if (mode === "paint" || mode === "erase") cur().stroke.cancel();
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: { ...view.current } };
        mode = "pinch";
        setHover(null);
        return;
      }
      if (pointers.size > 2) return;
      const { selected: sel, erasing: er } = cur();
      if (e.button === 1 || space || (e.button === 0 && !sel && !er)) {
        mode = "pan";
        e.preventDefault();
        return;
      }
      if (e.button !== 0 && e.button !== 2) return;
      mode = e.button === 2 || er ? "erase" : "paint";
      cur().stroke.begin(mode === "erase");
      last = tileAt(p.x, p.y);
      cur().stroke.at(...last);
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (e.pointerType === "mouse") {
        const t = tileAt(p.x, p.y);
        setHover((h) => (h && h[0] === t[0] && h[1] === t[1] ? h : t));
      }
      if (!prev) return;
      pointers.set(e.pointerId, p);
      if (mode === "pan" && view.current) {
        view.current = { ...view.current, ox: view.current.ox + p.x - prev.x, oy: view.current.oy + p.y - prev.y };
        redraw((n) => n + 1);
      } else if (mode === "pinch" && pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        zoomAt(pinch.cx, pinch.cy, (pinch.v.k * d) / Math.max(1, pinch.d), pinch.v);
        view.current = { ...view.current!, ox: view.current!.ox + cx - pinch.cx, oy: view.current!.oy + cy - pinch.cy };
        redraw((n) => n + 1);
      } else if (mode === "paint" || mode === "erase") {
        const t = tileAt(p.x, p.y);
        if (last && t[0] === last[0] && t[1] === last[1]) return;
        // Todas las casillas entre la anterior y esta: un arrastre rápido salta varias de un evento al otro.
        const from = last ?? t;
        last = t;
        if (mode === "erase" || PAINTS.has(cur().selected?.cat ?? "")) for (const [x, y] of line(from, t).slice(1)) cur().stroke.at(x, y);
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (mode === "paint" || mode === "erase") cur().stroke.end();
      if (pointers.size === 0) {
        mode = null;
        pinch = null;
        last = null;
      }
    };
    const leave = () => setHover(null);
    const wheel = (e: WheelEvent) => {
      if (!view.current) return;
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, view.current.k * (e.deltaY < 0 ? 1.25 : 0.8));
      redraw((n) => n + 1);
    };
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        space = e.type === "keydown";
        c.style.cursor = space ? "grab" : "";
      }
    };
    const menu = (e: Event) => e.preventDefault();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("contextmenu", menu);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("contextmenu", menu);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, []);

  return <canvas ref={canvas} className="sd-pl-canvas" role="img" aria-label={label} />;
}
