/**
 * La tarjeta de impacto para compartir (2026-11-20): una imagen de 1200×630
 * (lo que muestran X y Discord) con el héroe, el impacto, el puesto, el
 * resultado y los mejores momentos. Se dibuja en un `<canvas>` del navegador;
 * no pasa por ningún servidor.
 */

export interface ImpactCardData {
  hero: string;
  /** La carta del héroe (misma dirección del sitio, para poder exportar el canvas). */
  heroImg: string | null;
  kda: string;
  impact: number;
  impactText: string;
  rank: string;
  result: string;
  won: boolean;
  tag: string | null;
  moments: { time: string; text: string; value: number; valueText: string }[];
  title: string;
  footer: string;
  labels: { impact: string; moments: string };
}

const W = 1200;
const H = 630;
const INK = "#14110d";
const PAPER = "#f7e9d5";
const GOOD = "#97da79";
const BAD = "#ef5b4b";
const ACCENT = "#f59a6c";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/** Corta un texto con "…" para que entre en `max` píxeles. */
function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export async function drawImpactCard(d: ImpactCardData): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Impact, sans-serif";
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;

  // Fondo de tinta con una veta del color del resultado.
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, d.won ? "rgba(151,218,121,0.10)" : "rgba(239,91,75,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // La carta del héroe a la izquierda.
  const img = d.heroImg ? await loadImage(d.heroImg) : null;
  if (img) {
    const h = 520;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    g.save();
    g.beginPath();
    g.roundRect?.(56, 56, w, h, 14) ?? g.rect(56, 56, w, h);
    g.clip();
    g.drawImage(img, 56, 56, w, h);
    g.restore();
  }
  const x0 = img ? 56 + (img.naturalWidth / img.naturalHeight) * 520 + 48 : 72;
  const wText = W - x0 - 56;

  // Tira de papel con el título, torcida como en el sitio.
  g.save();
  g.translate(x0, 70);
  g.rotate(-0.02);
  g.font = `800 26px ${display}`;
  const tw = g.measureText(d.title.toUpperCase()).width;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, tw + 28, 42);
  g.fillStyle = INK;
  g.textBaseline = "middle";
  g.fillText(d.title.toUpperCase(), 14, 22);
  g.restore();

  g.textBaseline = "alphabetic";
  g.fillStyle = PAPER;
  g.font = `800 64px ${display}`;
  g.fillText(fit(g, d.hero.toUpperCase(), wText), x0, 180);
  g.font = `600 28px ${display}`;
  g.fillStyle = "rgba(247,233,213,0.75)";
  g.fillText(`${d.kda} · ${d.result}`, x0, 220);

  // El impacto, grande.
  g.font = `700 22px ${display}`;
  g.fillStyle = "rgba(247,233,213,0.55)";
  g.fillText(d.labels.impact.toUpperCase(), x0, 280);
  g.font = `800 110px ${display}`;
  g.fillStyle = d.impact >= 0 ? GOOD : BAD;
  g.fillText(d.impactText, x0, 380);
  const iw = g.measureText(d.impactText).width;
  if (d.tag) {
    g.font = `800 30px ${display}`;
    const tg = d.tag.toUpperCase();
    const tgw = g.measureText(tg).width;
    g.fillStyle = d.impact >= 0 ? PAPER : "rgba(239,91,75,0.25)";
    g.fillRect(x0 + iw + 24, 318, tgw + 24, 46);
    g.fillStyle = d.impact >= 0 ? INK : BAD;
    g.fillText(tg, x0 + iw + 36, 352);
  }
  g.font = `600 26px ${display}`;
  g.fillStyle = "rgba(247,233,213,0.75)";
  g.fillText(d.rank, x0, 420);

  // Los mejores momentos.
  g.font = `700 20px ${display}`;
  g.fillStyle = "rgba(247,233,213,0.55)";
  g.fillText(d.labels.moments.toUpperCase(), x0, 470);
  d.moments.slice(0, 3).forEach((m, i) => {
    const y = 506 + i * 34;
    g.font = `600 24px ${display}`;
    g.fillStyle = "rgba(247,233,213,0.55)";
    g.fillText(m.time, x0, y);
    g.fillStyle = PAPER;
    g.font = `500 24px ${display}`;
    g.fillText(fit(g, m.text, wText - 190), x0 + 80, y);
    g.font = `700 24px ${display}`;
    g.fillStyle = m.value >= 0 ? GOOD : BAD;
    const vw = g.measureText(m.valueText).width;
    g.fillText(m.valueText, x0 + wText - vw, y);
  });

  // Pie: la dirección.
  g.font = `700 22px ${display}`;
  g.fillStyle = ACCENT;
  const fw = g.measureText(d.footer).width;
  g.fillText(d.footer, W - 56 - fw, H - 28);
  return cv;
}

/** Comparte la imagen si el navegador puede (celular); si no, la descarga. */
export async function shareOrDownload(cv: HTMLCanvasElement, name: string, text: string): Promise<"shared" | "downloaded"> {
  const blob: Blob | null = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob) throw new Error("no se pudo armar la imagen");
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch {
      // Cancelado: se descarga igual.
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
