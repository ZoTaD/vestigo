/**
 * La imagen para compartir de la ruleta (2026-11-25): 1200×630, lo que
 * muestran X y Discord. El héroe a la izquierda y las cuatro etapas a la
 * derecha. Se dibuja en un `<canvas>` del navegador, como la de Impacto
 * (`deadlockImpactCard.ts`), con las imágenes servidas por el sitio.
 */

export interface RouletteCardData {
  title: string;
  subtitle: string;
  hero: string;
  heroImg: string | null;
  heroColor: string | null;
  stages: { name: string; items: { img: string; slot: "weapon" | "vitality" | "spirit" }[] }[];
  cta: string;
  footer: string;
}

const W = 1200;
const H = 630;
const INK = "#14110d";
const PAPER = "#f7e9d5";
const ACCENT = "#f59a6c";
/** El fondo de cada estante, como la tienda del juego. */
const SLOT_BG = { weapon: "#c3742a", vitality: "#5d9a38", spirit: "#8a55c4" } as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export async function drawRouletteCard(d: RouletteCardData): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-display").trim() || "Impact, sans-serif";
  const body = css.getPropertyValue("--font-text").trim() || "sans-serif";
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;

  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  // Una veta del color del héroe detrás de su carta.
  const grad = g.createRadialGradient(210, 300, 20, 210, 300, 420);
  grad.addColorStop(0, `${d.heroColor ?? ACCENT}88`);
  grad.addColorStop(1, "transparent");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const [hero, ...icons] = await Promise.all([d.heroImg ? loadImage(d.heroImg) : Promise.resolve(null), ...d.stages.flatMap((s) => s.items.map((i) => loadImage(i.img)))]);

  // La carta del héroe.
  const cx = 56;
  const cy = 96;
  const cw = 300;
  const ch = 410;
  g.save();
  roundRect(g, cx, cy, cw, ch, 14);
  g.clip();
  g.fillStyle = "#231d16";
  g.fillRect(cx, cy, cw, ch);
  if (hero) {
    const s = Math.max(cw / hero.width, ch / hero.height);
    g.drawImage(hero, cx + (cw - hero.width * s) / 2, cy + (ch - hero.height * s) / 2, hero.width * s, hero.height * s);
  }
  g.restore();
  g.font = `700 40px ${display}`;
  g.fillStyle = PAPER;
  g.fillText(fit(g, d.hero.toUpperCase(), cw), cx, cy + ch + 50);

  // Título.
  const x0 = 410;
  g.font = `700 54px ${display}`;
  g.fillStyle = PAPER;
  g.fillText(d.title.toUpperCase(), x0, 92);
  g.font = `600 24px ${body}`;
  g.fillStyle = ACCENT;
  g.fillText(d.subtitle, x0, 128);

  // Las cuatro etapas: nombre a la izquierda y tres íconos.
  const icon = 78;
  const gap = 14;
  let y = 160;
  let k = 0;
  for (const st of d.stages) {
    g.font = `700 24px ${display}`;
    g.fillStyle = "#cdbca3";
    g.fillText(fit(g, st.name.toUpperCase(), 170), x0, y + icon / 2 + 9);
    st.items.forEach((it, j) => {
      const x = x0 + 190 + j * (icon + gap);
      g.save();
      roundRect(g, x, y, icon, icon, 10);
      g.fillStyle = SLOT_BG[it.slot];
      g.fill();
      g.clip();
      const im = icons[k++];
      if (im) g.drawImage(im, x + 8, y + 8, icon - 16, icon - 16);
      g.restore();
    });
    y += icon + 16;
  }

  // El desafío y la dirección.
  g.font = `700 30px ${display}`;
  g.fillStyle = ACCENT;
  g.fillText(fit(g, d.cta.toUpperCase(), W - x0 - 56), x0, H - 40);
  g.font = `700 22px ${display}`;
  g.fillStyle = "#9c8c76";
  const fw = g.measureText(d.footer).width;
  g.fillText(d.footer, W - 56 - fw, 92 - 34);
  return cv;
}
