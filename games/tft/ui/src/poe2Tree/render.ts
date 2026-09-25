/**
 * Dibuja el árbol en un canvas con los sprites oficiales del export: textura de
 * fondo, dibujo de cada grupo, círculo central con el arte de la clase, arte de
 * la ascendencia, conexiones (arcos dentro de una órbita), íconos y marcos.
 *
 * Arrastrar mueve, la rueda o dos dedos acercan, un toque toma o saca un nodo.
 */
import type { CSSProperties } from "react";
import type { Planner, WeaponSet } from "./planner";
import { spriteUrl, type Sheet, type Tree, type TreeNode } from "./data";

type Img = HTMLImageElement;

const FR = {
  small: ["PSSkillFrame", "PSSkillFrameHighlighted", "PSSkillFrameActive"],
  notable: ["NotableFrameUnallocated", "NotableFrameCanAllocate", "NotableFrameAllocated"],
  keystone: ["KeystoneFrameUnallocated", "KeystoneFrameCanAllocate", "KeystoneFrameAllocated"],
  jewel: ["JewelFrameUnallocated", "JewelFrameCanAllocate", "JewelFrameAllocated"],
  ascSmall: ["AscendancyFrameNormalUnallocated", "AscendancyFrameNormalCanAllocate", "AscendancyFrameNormalAllocated"],
  ascNotable: ["AscendancyFrameNotableUnallocated", "AscendancyFrameNotableCanAllocate", "AscendancyFrameNotableAllocated"],
  oracle: ["OracleFrameUnallocated", "OracleFrameCanAllocate", "OracleFrameAllocated"],
  oracleNotable: ["OracleFrameNotableUnallocated", "OracleFrameNotableCanAllocate", "OracleFrameNotableAllocated"],
} as const;

function frameSet(n: TreeNode): readonly string[] {
  if (n.a) return n.k === "notable" ? FR.ascNotable : FR.ascSmall;
  if (n.uc) return n.k === "notable" ? FR.oracleNotable : FR.oracle;
  if (n.k === "notable" || n.k === "keystone" || n.k === "jewel") return FR[n.k];
  return FR.small;
}
export const iconPrefix = (n: TreeNode) => (n.k === "keystone" ? "keystone" : n.k === "notable" ? "notable" : "normal");

/** El ícono de un nodo como estilo CSS, para las listas fuera del canvas. */
export function iconStyle(T: Tree, n: TreeNode, px: number): CSSProperties {
  const sh = T.sprites.skills;
  const f = sh.frames[`${iconPrefix(n)}Active:${n.ic}`];
  if (!f) return {};
  const k = px / f[2];
  return {
    backgroundImage: `url(${spriteUrl(sh.file)})`,
    backgroundPosition: `-${f[0] * k}px -${f[1] * k}px`,
    backgroundSize: `${sh.w * k}px ${sh.h * k}px`,
  };
}

/** Un cuadro del arte de la clase (0 = la clase, 1… = sus ascendencias) como estilo CSS. */
export function classArtStyle(T: Tree, clsEn: string, frame: number, px: number): CSSProperties {
  // La hoja de retratos (150 KB para todas las clases) y no el fondo de cada
  // clase (~500 KB cada uno): el elegidor muestra las ocho a la vez.
  const small = T.sprites.portraits;
  const sh = small ?? T.sprites[`background-${clsEn.toLowerCase()}`];
  const f = small ? small.frames[`${clsEn}:Class${frame}`] : sh?.frames[`Class${frame}`];
  if (!f) return {};
  const k = px / f[2];
  return {
    backgroundImage: `url(${spriteUrl(sh.file)})`,
    backgroundPosition: `-${f[0] * k}px -${f[1] * k}px`,
    backgroundSize: `${sh.w * k}px ${sh.h * k}px`,
  };
}

const images = new Map<string, Promise<Img>>();
function image(file: string): Promise<Img> {
  let p = images.get(file);
  if (!p) {
    p = new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = fail;
      img.src = spriteUrl(file);
    });
    images.set(file, p);
  }
  return p;
}

export interface ViewOpts {
  /** Qué hace un toque sobre un nodo. */
  onToggle: (id: string) => void;
  onHover: (id: string | null, x: number, y: number) => void;
}

export class TreeView {
  private ctx: CanvasRenderingContext2D;
  private img: Record<string, Img> = {};
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private ro: ResizeObserver;
  private pattern: CanvasPattern | null = null;
  cam = { x: 0, y: 0, s: 0.1 };
  hover: string | null = null;
  hoverPath: string[] | null = null;
  /** Nivel que se está mirando: lo de más adelante se ve apagado. */
  upTo = 100;
  /** Nivel de cada punto de la ruta (lo calcula la página). */
  levelOf: (id: string) => number | null = () => null;
  match: Set<string> | null = null;
  /** Lo que tapa el cajón a la derecha, en px: el centro de la vista se corre. */
  insetRight = 0;
  private groupNodes = new Map<number, string[]>();
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private T: Tree, private P: Planner, private opts: ViewOpts) {
    this.ctx = canvas.getContext("2d")!;
    for (const [id, n] of Object.entries(T.nodes)) {
      const l = this.groupNodes.get(n.g) ?? [];
      l.push(id);
      this.groupNodes.set(n.g, l);
    }
    this.bind();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement!);
    this.resize();
    const base = ["skills", "skills-disabled", "frame", "group-background", "background", "mastery-effect-active", "mastery-effect-disabled"];
    for (const s of base) this.want(s);
  }

  destroy(): void {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup) f();
  }

  private want(sheet: string): void {
    const sh = this.T.sprites[sheet];
    if (!sh || this.img[sheet]) return;
    image(sh.file).then((i) => { this.img[sheet] = i; this.draw(); }).catch(() => {});
  }

  resize(): void {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.draw();
  }

  focus(x: number, y: number, s?: number): void {
    const z = s ?? this.cam.s;
    this.cam = { x: x + this.insetRight / 2 / z, y, s: z };
    this.draw();
  }

  /** Centra el inicio de la clase con su zona alrededor. */
  home(): void {
    const st = this.T.nodes[this.P.start];
    this.focus(st.x * 1.7, st.y * 1.7, Math.min(0.12, Math.max(0.05, this.w / 14000)));
  }

  ascCircle(): [number, number, number] | null {
    return this.T.classes[this.P.ci].asc.find((a) => a.id === this.P.asc)?.c ?? null;
  }

  private toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.cam.s + this.cam.x, (sy - this.h / 2) / this.cam.s + this.cam.y];
  }

  private radius(n: TreeNode): number {
    return n.k === "keystone" ? 110 : n.k === "notable" || n.k === "jewel" ? 80 : 56;
  }

  pick(sx: number, sy: number): string | null {
    const [wx, wy] = this.toWorld(sx, sy);
    let best: string | null = null;
    let bd = Infinity;
    const min = 8 / this.cam.s;
    for (const [id, n] of Object.entries(this.T.nodes)) {
      if (!this.P.visible(id)) continue;
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < Math.max(this.radius(n), min) && d < bd) { bd = d; best = id; }
    }
    return best;
  }

  private zoomAt(sx: number, sy: number, s: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    s = Math.min(0.8, Math.max(0.015, s));
    this.cam.s = s;
    this.cam.x = wx - (sx - this.w / 2) / s;
    this.cam.y = wy - (sy - this.h / 2) / s;
    this.draw();
  }

  zoomBy(f: number): void {
    this.zoomAt(this.w / 2, this.h / 2, this.cam.s * f);
  }

  private bind(): void {
    const c = this.canvas;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    let pinch: { d: number; s: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, local(e));
      c.setPointerCapture(e.pointerId);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.cam.s };
        drag = null;
      } else {
        drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
        if (drag.moved) {
          this.cam.x = drag.cx - dx / this.cam.s;
          this.cam.y = drag.cy - dy / this.cam.s;
          this.draw();
          if (this.hover) { this.hover = null; this.hoverPath = null; this.opts.onHover(null, 0, 0); }
          return;
        }
      }
      if (e.pointerType === "touch") return;
      const id = this.pick(p.x, p.y);
      if (id !== this.hover) {
        this.hover = id;
        this.hoverPath = id ? this.P.path(id) : null;
        c.style.cursor = id ? "pointer" : "grab";
        this.draw();
      }
      this.opts.onHover(id, e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
      if (drag && !drag.moved) {
        const p = local(e);
        const id = this.pick(p.x, p.y);
        if (id) {
          this.opts.onToggle(id);
          this.hoverPath = this.P.path(id);
          if (e.pointerType === "touch") {
            this.hover = id;
            this.opts.onHover(id, e.clientX, e.clientY);
          }
          this.draw();
        }
      }
      drag = null;
    };
    const leave = () => {
      if (drag) return;
      this.hover = null;
      this.hoverPath = null;
      this.opts.onHover(null, 0, 0);
      this.draw();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.cam.s * Math.pow(1.0015, -e.deltaY));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    c.addEventListener("wheel", wheel, { passive: false });
    this.cleanup.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("wheel", wheel);
    });
  }

  draw(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  /** 2 = tomado hasta el nivel mirado, 1 = en la ruta más adelante o camino del cursor, 0 = nada. */
  private state(id: string): 0 | 1 | 2 {
    const P = this.P;
    if (id === P.start || id === P.ascStart) return 2;
    if (P.route.includes(id) || P.ascRoute.includes(id)) {
      const l = this.levelOf(id);
      return l != null && l <= this.upTo ? 2 : 1;
    }
    if (this.hoverPath?.includes(id)) return 1;
    return 0;
  }

  private sprite(sheet: string, key: string, x: number, y: number, mult = 1): boolean {
    const sh: Sheet | undefined = this.T.sprites[sheet];
    const img = this.img[sheet];
    const f = sh?.frames[key];
    if (!sh || !img || !f) return false;
    const w = (f[2] / sh.scale) * mult, h = (f[3] / sh.scale) * mult;
    this.ctx.drawImage(img, f[0], f[1], f[2], f[3], x - w / 2, y - h / 2, w, h);
    return true;
  }

  private paint(): void {
    const { ctx, T, P, cam } = this;
    const cls = T.classes[P.ci];
    const artSheet = `background-${cls.en.toLowerCase()}`;
    this.want(artSheet);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.img.background) {
      this.pattern ??= ctx.createPattern(this.img.background, "repeat");
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.pattern!;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-cam.x, -cam.y);
    const pad = 400;
    const vx0 = cam.x - this.w / 2 / cam.s - pad, vx1 = cam.x + this.w / 2 / cam.s + pad;
    const vy0 = cam.y - this.h / 2 / cam.s - pad, vy1 = cam.y + this.h / 2 / cam.s + pad;
    const inView = (x: number, y: number) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

    // dibujo de fondo de cada grupo: encendido si hay algo tomado en él
    for (const [x, y, g, art] of T.masteries) {
      if (!inView(x, y)) continue;
      const on = this.groupNodes.get(g)?.some((id) => this.state(id) === 2);
      ctx.save();
      ctx.globalAlpha = on ? 0.9 : 0.55;
      this.sprite(on ? "mastery-effect-active" : "mastery-effect-disabled", art, x, y);
      ctx.restore();
    }

    // arte de la clase dentro del círculo central
    const artImg = this.img[artSheet];
    const artSh = T.sprites[artSheet];
    const art0 = artSh?.frames.Class0;
    if (artImg && art0) {
      const size = art0[2] / artSh.scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 1480, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(artImg, art0[0], art0[1], art0[2], art0[3], -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    this.sprite("group-background", "startNode:MainCircle", 0, 0);
    const st = T.nodes[P.start];
    ctx.save();
    ctx.rotate(Math.atan2(st.y, st.x) + Math.PI / 2);
    this.sprite("group-background", "startNode:MainCircleActive", 0, 0);
    ctx.restore();

    // círculo de la ascendencia con su arte
    const ac = this.ascCircle();
    if (ac) {
      const [x, y, r] = ac;
      const idx = cls.asc.find((a) => a.id === P.asc)!.art;
      const f = artSh?.frames[`Class${idx}`];
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#050506";
      ctx.fill();
      ctx.lineWidth = 30;
      ctx.strokeStyle = "#2a2219";
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#8a6f3e";
      ctx.stroke();
      ctx.clip();
      if (artImg && f) {
        ctx.globalAlpha = 0.75;
        ctx.drawImage(artImg, f[0], f[1], f[2], f[3], x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // conexiones
    const lw = Math.max(9, 1.4 / cam.s);
    for (const [a, b] of T.edges) {
      const na = T.nodes[a], nb = T.nodes[b];
      if (na.hc || nb.hc) continue;
      const okA = na.k === "start" ? a === P.start : P.visible(a);
      const okB = nb.k === "start" ? b === P.start : P.visible(b);
      if (!okA || !okB) continue;
      if (!inView(na.x, na.y) && !inView(nb.x, nb.y)) continue;
      const sa = this.state(a), sb = this.state(b);
      const lv = sa === 2 && sb === 2 ? 2 : sa && sb ? 1 : 0;
      ctx.beginPath();
      const g = T.groups[na.g];
      if (na.g === nb.g && na.o === nb.o && na.o > 0 && g) {
        const r = Math.hypot(na.x - g[0], na.y - g[1]);
        const a0 = Math.atan2(na.y - g[1], na.x - g[0]);
        let d = Math.atan2(nb.y - g[1], nb.x - g[0]) - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        ctx.arc(g[0], g[1], r, a0, a0 + d, d < 0);
      } else {
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
      }
      if (lv === 2) {
        ctx.strokeStyle = "rgba(255,210,120,.16)";
        ctx.lineWidth = lw * 2.6;
        ctx.stroke();
        ctx.strokeStyle = "#d8b56a";
        ctx.lineWidth = lw * 1.25;
      } else if (lv === 1) {
        ctx.strokeStyle = "#7a6440";
        ctx.lineWidth = lw * 1.1;
      } else {
        ctx.strokeStyle = "#2e2b26";
        ctx.lineWidth = lw;
      }
      ctx.stroke();
    }

    // nodos
    for (const [id, n] of Object.entries(T.nodes)) {
      if (!inView(n.x, n.y) || !P.visible(id)) continue;
      const s = this.state(id);
      if (n.k === "asc-start") {
        this.sprite("frame", "frame:AscendancyStartNode", n.x, n.y, 1.6);
        continue;
      }
      if (n.k !== "jewel" && n.ic) {
        const sheet = s ? "skills" : "skills-disabled";
        const key = `${iconPrefix(n)}${s ? "Active" : "Inactive"}:${n.ic}`;
        const sh = T.sprites[sheet], f = sh?.frames[key], img = this.img[sheet];
        if (f && img) {
          const z = f[2] / sh.scale;
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, z / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, f[0], f[1], f[2], f[3], n.x - z / 2, n.y - z / 2, z, z);
          ctx.restore();
        }
      }
      this.sprite("frame", `frame:${frameSet(n)[s]}`, n.x, n.y);
      const ws: WeaponSet | undefined = P.ws[id];
      if (ws && s) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.k === "notable" ? 84 : n.k === "keystone" ? 118 : 60, 0, Math.PI * 2);
        ctx.lineWidth = 12;
        ctx.strokeStyle = ws === 1 ? "rgba(220,70,50,.95)" : "rgba(90,200,90,.95)";
        ctx.stroke();
      }
      if (this.match?.has(id)) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, this.radius(n) + 28, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(10, 2.2 / cam.s);
        ctx.strokeStyle = "rgba(120,190,255,.95)";
        ctx.stroke();
      }
      if (id === this.hover) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, this.radius(n) + 10, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,230,170,.10)";
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
