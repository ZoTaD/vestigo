/**
 * El visor del mapa: un lienzo con arrastre y zoom (rueda, pellizco, botones),
 * una vista general del mundo entero y mosaicos más finos según el zoom, todo
 * calculado en Web Workers a partir de la semilla (`pool.ts`).
 *
 * Coordenadas: las del juego (x este, z norte, metros). La cámara guarda el
 * punto del mundo que está en el centro y cuántos metros mide un píxel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkerPool } from "./pool";
import type { Layer } from "./palette";
import type { RegionResult } from "./worker";

export const WORLD = 10500;
const SPAN = WORLD * 2;
/**
 * La vista general: el mundo entero en BASE×BASE píxeles (~10 m por píxel, la
 * grilla del minimapa del juego). Con 1024 se veía borroso entre la vista
 * general y los mosaicos finos (ZoTaD, 2026-09-25).
 */
const BASE = 2048;
const TILE = 256;
/** El nivel de mosaico más fino: 21.000 / 2^7 / 256 ≈ 0,64 m por píxel. */
const MAX_LEVEL = 7;
const MIN_MPP = 0.4;
const MAX_MPP = (SPAN / 380);

export interface Marker {
  key: string;
  x: number;
  z: number;
  color: string;
  icon?: HTMLImageElement | null;
  label?: string;
  size?: number;
}

/** Una línea entre dos puntos del mundo (los portales con el mismo nombre). */
export interface MapLine { x1: number; z1: number; x2: number; z2: number; color: string }

/**
 * La niebla de lo no explorado: una imagen alineada al mundo (fila 0 = norte)
 * que cubre un cuadrado de `span` metros centrado en (0, 0).
 */
export interface FogLayer { canvas: HTMLCanvasElement; span: number }

export interface HoverInfo { x: number; z: number; biome: number | null; height: number | null }

interface Tile { canvas: HTMLCanvasElement; biomes: Uint16Array; heights: Float32Array; x0: number; z0: number; step: number; used: number }

export interface ViewerHandle {
  exportPng: () => Promise<Blob | null>;
  goTo: (x: number, z: number, mpp?: number) => void;
}

interface Props {
  seed: string;
  layer: Layer;
  grid: boolean;
  markers: Marker[];
  onHover: (h: HoverInfo | null) => void;
  onProgress: (p: number, ms?: number) => void;
  onError?: (e: string) => void;
  onMarker?: (key: string | null) => void;
  /** El punto bajo el mouse (y dónde está el mouse, en píxeles del visor), para la ventanita. */
  onMarkerHover?: (h: { key: string; sx: number; sy: number } | null) => void;
  handle?: (h: ViewerHandle) => void;
  initial?: { x: number; z: number; mpp: number } | null;
  onView?: (v: { x: number; z: number; mpp: number }) => void;
  fog?: FogLayer | null;
  lines?: MapLine[];
}

export default function MapViewer({ seed, layer, grid, markers, onHover, onProgress, onError, onMarker, onMarkerHover, handle, initial, onView, fog, lines }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const pool = useRef<WorkerPool | null>(null);
  const cam = useRef({ x: initial?.x ?? 0, z: initial?.z ?? 0, mpp: initial?.mpp ?? 0 });
  const base = useRef<{ canvas: HTMLCanvasElement; biomes: Uint16Array; heights: Float32Array; ready: boolean; preview?: HTMLCanvasElement } | null>(null);
  const tiles = useRef(new Map<string, Tile>());
  const pending = useRef(new Set<string>());
  const frame = useRef(0);
  const gen = useRef(0);
  const [, setTick] = useState(0);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const fogRef = useRef(fog);
  fogRef.current = fog;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // --- dibujo
  const draw = useCallback(() => {
    frame.current = 0;
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { width: W, height: H } = c;
    const dpr = window.devicePixelRatio || 1;
    const { x: cx, z: cz } = cam.current;
    const mpp = cam.current.mpp / dpr;
    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, W, H);
    // Sin suavizado al ampliar: mejor píxeles nítidos que una mancha borrosa.
    ctx.imageSmoothingEnabled = mpp > SPAN / BASE;
    const toSx = (x: number) => (x - cx) / mpp + W / 2;
    const toSy = (z: number) => (cz - z) / mpp + H / 2;
    const b = base.current;
    if (b) {
      const s = SPAN / mpp;
      // La previa gruesa va debajo y la vista general encima: mientras llegan
      // las franjas, lo que falta se ve con la previa, y lo que ya llegó nunca
      // queda tapado (antes la previa pisaba las primeras franjas y el norte
      // quedaba borroso; ZoTaD, 2026-09-25).
      if (b.preview && !b.ready) ctx.drawImage(b.preview, toSx(-WORLD), toSy(WORLD), s, s);
      ctx.drawImage(b.canvas, toSx(-WORLD), toSy(WORLD), s, s);
    }
    // Mosaicos del nivel que corresponde a este zoom (y los que ya estén de niveles cercanos).
    const want = levelFor(cam.current.mpp);
    if (want > 0) {
      // Primero los gruesos y encima los finos: un mosaico grueso que llegó
      // tarde no tapa uno más nítido (eso también se veía borroso).
      const list = [...tiles.current.values()].sort((a, b) => b.step - a.step);
      for (const t of list) {
        const size = TILE * t.step / mpp;
        const sx = toSx(t.x0), sy = toSy(t.z0);
        if (sx > W || sy > H || sx + size < 0 || sy + size < 0) continue;
        t.used = performance.now();
        ctx.drawImage(t.canvas, sx, sy, size, size);
      }
    }
    // Grilla de 1 km (y de 64 m, la de las zonas del juego, cuando hay mucho zoom).
    if (grid) {
      const stepM = mpp < 1.5 ? 64 : mpp < 12 ? 500 : 1000;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const xMin = cx - (W / 2) * mpp, xMax = cx + (W / 2) * mpp;
      const zMin = cz - (H / 2) * mpp, zMax = cz + (H / 2) * mpp;
      for (let x = Math.ceil(xMin / stepM) * stepM; x <= xMax; x += stepM) { const sx = Math.round(toSx(x)) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
      for (let z = Math.ceil(zMin / stepM) * stepM; z <= zMax; z += stepM) { const sy = Math.round(toSy(z)) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
      ctx.stroke();
    }
    // La niebla de lo que nadie exploró (de la partida que subió la persona).
    const fg = fogRef.current;
    if (fg) {
      const s = fg.span / mpp;
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fg.canvas, toSx(-fg.span / 2), toSy(fg.span / 2), s, s);
      ctx.imageSmoothingEnabled = smooth;
    }
    // Las líneas entre portales con el mismo nombre.
    const ls = linesRef.current;
    if (ls?.length) {
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      for (const l of ls) {
        ctx.strokeStyle = l.color;
        ctx.beginPath();
        ctx.moveTo(toSx(l.x1), toSy(l.z1));
        ctx.lineTo(toSx(l.x2), toSy(l.z2));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // El borde del mundo.
    ctx.strokeStyle = "rgba(242,196,111,0.35)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(toSx(0), toSy(0), WORLD / mpp, 0, Math.PI * 2);
    ctx.stroke();
    // Marcadores: un punto con halo oscuro, o el ícono del juego; etiqueta si la
    // lleva. Según el zoom (ZoTaD, 2026-09-25: de lejos se amontonaban): de
    // lejos, puntos chicos y sólo el nombre del inicio; de cerca, íconos y todos
    // los nombres. `mppCss` = metros por píxel de pantalla.
    const mppCss = cam.current.mpp;
    const far = mppCss > 12, mid = mppCss > 4;
    ctx.font = `${12 * dpr}px "Averia Sans Libre", system-ui, sans-serif`;
    ctx.textAlign = "center";
    for (const m of markersRef.current) {
      const sx = toSx(m.x), sy = toSy(m.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const base = m.size ?? 5;
      const major = base >= 6;
      const r = (far ? (major ? base * 0.75 : 2) : mid ? (major ? base : 3) : base) * dpr;
      if (far && !major) {
        ctx.fillStyle = m.color;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
        continue;
      }
      if (m.icon && m.icon.complete && m.icon.naturalWidth) {
        const s = r * 3.2;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath(); ctx.arc(sx, sy, s * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(m.icon, sx - s / 2, sy - s / 2, s, s);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath(); ctx.arc(sx, sy, r + 2 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      }
      if (m.label && (!far || base >= 7) && (!mid || major)) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillText(m.label, sx + 1, sy - r * 2.2 + 1);
        ctx.fillStyle = "#f2e2bd";
        ctx.fillText(m.label, sx, sy - r * 2.2);
      }
    }
  }, [grid]);

  const redraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // --- mosaicos a pedido
  const requestTiles = useCallback(() => {
    const c = cv.current, p = pool.current;
    if (!c || !p || !base.current?.ready) return;
    const L = levelFor(cam.current.mpp);
    if (L <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const tw = SPAN / 2 ** L;
    const step = tw / TILE;
    const { x: cx, z: cz } = cam.current;
    const mpp = cam.current.mpp / dpr;
    const halfW = (c.width / 2) * mpp, halfH = (c.height / 2) * mpp;
    const i0 = Math.floor((cx - halfW + WORLD) / tw), i1 = Math.floor((cx + halfW + WORLD) / tw);
    const j0 = Math.floor((WORLD - (cz + halfH)) / tw), j1 = Math.floor((WORLD - (cz - halfH)) / tw);
    const my = gen.current;
    const list: { i: number; j: number; d: number }[] = [];
    for (let j = Math.max(0, j0); j <= Math.min(2 ** L - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(2 ** L - 1, i1); i++) {
        const x0 = -WORLD + i * tw, z0 = WORLD - j * tw;
        // Fuera del círculo del mundo no hay nada que calcular.
        const nx = Math.max(x0, Math.min(0, x0 + tw)), nz = Math.max(z0 - tw, Math.min(0, z0));
        if (nx * nx + nz * nz > WORLD * WORLD) continue;
        const key = `${layer}/${L}/${i}/${j}`;
        if (tiles.current.has(key) || pending.current.has(key)) continue;
        const d = Math.hypot(x0 + tw / 2 - cx, z0 - tw / 2 - cz);
        list.push({ i, j, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    for (const { i, j } of list) {
      const key = `${layer}/${L}/${i}/${j}`;
      const x0 = -WORLD + i * tw, z0 = WORLD - j * tw;
      pending.current.add(key);
      p.run({ seed, x0, z0, step, w: TILE, h: TILE, layer }, true).promise.then((r) => {
        pending.current.delete(key);
        if (my !== gen.current) return;
        tiles.current.set(key, { ...toCanvas(r, TILE, TILE), biomes: r.biomes, heights: r.heights, x0, z0, step, used: performance.now() });
        evict(tiles.current, 260);
        redraw();
      }).catch(() => pending.current.delete(key));
    }
  }, [seed, layer, redraw]);

  // --- vista general, por bandas, con una previa rápida
  useEffect(() => {
    if (!pool.current) pool.current = new WorkerPool();
    const p = pool.current;
    p.clear();
    gen.current++;
    const my = gen.current;
    tiles.current.clear();
    pending.current.clear();
    base.current = null;
    const t0 = performance.now();
    onProgress(0);
    const preview = 256;
    const pStep = SPAN / preview;
    const baseStep = SPAN / BASE;
    const full = document.createElement("canvas");
    full.width = BASE; full.height = BASE;
    const fctx = full.getContext("2d")!;
    const biomes = new Uint16Array(BASE * BASE);
    const heights = new Float32Array(BASE * BASE);
    let done = 0;
    const bands = 64;
    const rows = BASE / bands;
    p.run({ seed, x0: -WORLD, z0: WORLD, step: pStep, w: preview, h: preview, layer }, true).promise.then((r) => {
      if (my !== gen.current || base.current?.ready) return;
      base.current = { canvas: full, biomes, heights, ready: false, preview: toCanvas(r, preview, preview).canvas };
      redraw();
    }).catch(() => undefined);
    for (let b = 0; b < bands; b++) {
      p.run({ seed, x0: -WORLD, z0: WORLD - b * rows * baseStep, step: baseStep, w: BASE, h: rows, layer }).promise.then((r) => {
        if (my !== gen.current) return;
        fctx.putImageData(new ImageData(new Uint8ClampedArray(r.pixels.buffer as ArrayBuffer), BASE, rows), 0, b * rows);
        biomes.set(r.biomes, b * rows * BASE);
        heights.set(r.heights, b * rows * BASE);
        done++;
        base.current = { canvas: full, biomes, heights, ready: done === bands, preview: base.current?.preview };
        onProgress(done / bands, done === bands ? performance.now() - t0 : undefined);
        if (done === bands) requestTiles();
        redraw();
      }).catch((e) => { if (e !== "cancelado") onError?.(String(e)); });
    }
    return () => { p.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, layer]);

  useEffect(() => () => { pool.current?.destroy(); pool.current = null; }, []);
  useEffect(() => { redraw(); }, [markers, grid, fog, lines, redraw]);

  // --- tamaño del lienzo
  useEffect(() => {
    const el = wrap.current, c = cv.current;
    if (!el || !c) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(el.clientWidth * dpr);
      c.height = Math.round(el.clientHeight * dpr);
      if (!cam.current.mpp) cam.current.mpp = (SPAN * 1.04) / Math.min(el.clientWidth, el.clientHeight);
      redraw();
      requestTiles();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw, requestTiles]);

  // --- interacción
  const viewChanged = useRef(0);
  const afterMove = useCallback(() => {
    redraw();
    clearTimeout(viewChanged.current);
    viewChanged.current = window.setTimeout(() => {
      requestTiles();
      onView?.({ ...cam.current });
    }, 120);
  }, [redraw, requestTiles, onView]);

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    const el = wrap.current!;
    const { x, z, mpp } = cam.current;
    const next = Math.max(MIN_MPP, Math.min(MAX_MPP, mpp * factor));
    const dx = sx - el.clientWidth / 2, dy = sy - el.clientHeight / 2;
    // El punto bajo el cursor queda quieto.
    cam.current = { x: x + dx * (mpp - next), z: z - dy * (mpp - next), mpp: next };
    afterMove();
  }, [afterMove]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    // Con el mouse, sin botón apretado no se arrastra: si quedó un puntero
    // "apretado" porque el soltar se perdió (fuera de la ventana), se olvida.
    // Si no, el mapa se movía al pasar el mouse y no salía la ventanita.
    if (e.pointerType === "mouse" && e.buttons === 0) pointers.current.delete(e.pointerId);
    const prev = pointers.current.get(e.pointerId);
    if (prev) {
      if (pointers.current.size === 1) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        moved.current += Math.abs(dx) + Math.abs(dy);
        cam.current = { ...cam.current, x: cam.current.x - dx * cam.current.mpp, z: cam.current.z + dy * cam.current.mpp };
        afterMove();
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.entries()];
        const other = a[0] === e.pointerId ? b[1] : a[1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        moved.current += 10;
        if (before > 0 && after > 0) zoomAt((e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top, before / after);
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // Lo que hay bajo el cursor: el mosaico más fino que lo cubra, si no la vista general.
    const { x: cx, z: cz, mpp } = cam.current;
    const wx = cx + (sx - el.clientWidth / 2) * mpp, wz = cz - (sy - el.clientHeight / 2) * mpp;
    onHover(sample(wx, wz));
    // La ventanita del lugar bajo el mouse (no mientras se arrastra).
    if (onMarkerHover && pointers.current.size === 0) {
      const m = markerAt(sx, sy);
      onMarkerHover(m ? { key: m.key, sx, sy } : null);
      el.style.cursor = m ? "pointer" : "";
    }
  };
  /** El marcador más cercano a un punto de la pantalla, a menos de 14 px. */
  const markerAt = (sx: number, sy: number): Marker | null => {
    const el = wrap.current!;
    const { x: cx, z: cz, mpp } = cam.current;
    let best: Marker | null = null, bd = 14;
    for (const m of markersRef.current) {
      const d = Math.hypot((m.x - cx) / mpp + el.clientWidth / 2 - sx, (cz - m.z) / mpp + el.clientHeight / 2 - sy);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (moved.current < 6 && onMarker) {
      const el = wrap.current!;
      const r = el.getBoundingClientRect();
      const best = markerAt(e.clientX - r.left, e.clientY - r.top);
      onMarker(best ? best.key : null);
    }
  };

  const sample = (wx: number, wz: number): HoverInfo => {
    if (wx * wx + wz * wz > WORLD * WORLD) return { x: wx, z: wz, biome: null, height: null };
    let bestT: Tile | null = null;
    for (const t of tiles.current.values()) {
      if (wx >= t.x0 && wx < t.x0 + TILE * t.step && wz <= t.z0 && wz > t.z0 - TILE * t.step && (!bestT || t.step < bestT.step)) bestT = t;
    }
    if (bestT) {
      const i = Math.floor((wx - bestT.x0) / bestT.step), j = Math.floor((bestT.z0 - wz) / bestT.step);
      return { x: wx, z: wz, biome: bestT.biomes[j * TILE + i], height: bestT.heights[j * TILE + i] };
    }
    const b = base.current;
    if (!b) return { x: wx, z: wz, biome: null, height: null };
    const i = Math.floor((wx + WORLD) / (SPAN / BASE)), j = Math.floor((WORLD - wz) / (SPAN / BASE));
    const k = Math.max(0, Math.min(BASE * BASE - 1, j * BASE + i));
    return { x: wx, z: wz, biome: b.biomes[k], height: b.heights[k] };
  };

  // --- lo que el padre puede pedir: exportar y moverse
  useEffect(() => {
    handle?.({
      exportPng: () => new Promise((res) => (cv.current ? cv.current.toBlob((b) => res(b), "image/png") : res(null))),
      goTo: (x, z, mpp) => {
        cam.current = { x, z, mpp: mpp ?? Math.min(cam.current.mpp, 4) };
        afterMove();
      },
    });
  }, [handle, afterMove]);

  const zoomBtn = (f: number) => {
    const el = wrap.current!;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, f);
  };
  const reset = () => {
    const el = wrap.current!;
    cam.current = { x: 0, z: 0, mpp: (SPAN * 1.04) / Math.min(el.clientWidth, el.clientHeight) };
    afterMove();
    setTick((n) => n + 1);
  };

  return (
    <div className="vm-view" ref={wrap}>
      <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={() => { onHover(null); onMarkerHover?.(null); }} style={{ touchAction: "none" }} />
      <div className="vm-zoom">
        <button type="button" onClick={() => zoomBtn(0.5)} aria-label="+">+</button>
        <button type="button" onClick={() => zoomBtn(2)} aria-label="−">−</button>
        <button type="button" onClick={reset} aria-label="⟲">⟲</button>
      </div>
    </div>
  );
}

/** El nivel de mosaico para un zoom: 0 = alcanza la vista general. */
function levelFor(mpp: number): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const want = mpp / dpr;
  // Los mosaicos entran apenas la vista general queda más gruesa que la pantalla.
  if (want >= (SPAN / BASE) * 1.05) return 0;
  const L = Math.ceil(Math.log2(SPAN / (TILE * want)));
  // El nivel 3 (≈10 m) es lo mismo que la vista general: los mosaicos empiezan en el 4.
  return Math.max(4, Math.min(MAX_LEVEL, L));
}

function toCanvas(r: RegionResult, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.pixels.buffer as ArrayBuffer), w, h), 0, 0);
  return { canvas: c };
}

function evict(map: Map<string, Tile>, max: number) {
  if (map.size <= max) return;
  const byUse = [...map.entries()].sort((a, b) => a[1].used - b[1].used);
  for (const [k] of byUse.slice(0, map.size - max)) map.delete(k);
}
