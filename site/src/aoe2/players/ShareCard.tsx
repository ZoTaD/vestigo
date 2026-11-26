/**
 * La tarjeta para compartir el perfil de AoE2 (2026-11-20): se dibuja en un `<canvas>` de 1200×630 al apretar el
 * botón (sin servidor) y se baja como PNG. Fondo con una captura del juego, alias, ELO de mapa aleatorio 1v1 (o el
 * mejor que tenga), la civ más jugada con su escudo y la forma de las últimas 10.
 */
import { useState } from "react";
import { useAoe2Copy } from "../../aoe2Copy";
import type { Aoe2Result } from "../api/wel";

const W = 1200;
const H = 630;
export type ShareData = { alias: string; country: string | null; elo: number | null; eloLabel: string; civ: { slug: string; name: string } | null; form: Aoe2Result[] };

const cargar = (src: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });

export async function dibujar(d: ShareData, t: { win: string; loss: string; other: string; mostPlayed: string; form: string }): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  await document.fonts?.ready;
  const [fondo, escudo, corona] = await Promise.all([cargar("/aoe2/ui/strip-1.webp"), d.civ ? cargar(`/aoe2/civ/${d.civ.slug}.webp`) : null, cargar("/aoe2/ui/shield-sp.webp")]);
  g.fillStyle = "#0b0f14";
  g.fillRect(0, 0, W, H);
  if (fondo) {
    const esc = Math.max(W / fondo.naturalWidth, H / fondo.naturalHeight);
    g.globalAlpha = 0.55;
    g.drawImage(fondo, (W - fondo.naturalWidth * esc) / 2, (H - fondo.naturalHeight * esc) / 2, fondo.naturalWidth * esc, fondo.naturalHeight * esc);
    g.globalAlpha = 1;
  }
  const deg = g.createLinearGradient(0, 0, 0, H);
  deg.addColorStop(0, "rgba(11,15,20,0.2)");
  deg.addColorStop(1, "rgba(11,15,20,0.95)");
  g.fillStyle = deg;
  g.fillRect(0, 0, W, H);
  if (corona) g.drawImage(corona, 70, 70, 90, 121);
  g.textBaseline = "top";
  g.fillStyle = "#eef2f6";
  g.font = `900 72px Cinzel, Georgia, serif`;
  g.fillText(d.alias.slice(0, 20), 190, 80, W - 260);
  g.fillStyle = "#cfd8e3";
  g.font = `600 28px "Noto Sans", system-ui, sans-serif`;
  g.fillText(`AGE OF EMPIRES II${d.country ? ` · ${d.country.toUpperCase()}` : ""}`, 192, 170);
  // ELO grande.
  g.fillStyle = "#f0bf4c";
  g.font = `900 120px Cinzel, Georgia, serif`;
  g.fillText(d.elo != null ? String(d.elo) : "–", 70, 260);
  g.fillStyle = "#93a3b5";
  g.font = `600 26px "Noto Sans", system-ui, sans-serif`;
  g.fillText(d.eloLabel, 74, 395);
  // Civ más jugada.
  if (d.civ) {
    if (escudo) g.drawImage(escudo, 700, 262, 110, 110);
    g.fillStyle = "#eef2f6";
    g.font = `700 40px Cinzel, Georgia, serif`;
    g.fillText(d.civ.name, 830, 282, W - 880);
    g.fillStyle = "#93a3b5";
    g.font = `600 24px "Noto Sans", system-ui, sans-serif`;
    g.fillText(t.mostPlayed, 832, 336);
  }
  // Forma.
  g.fillStyle = "#93a3b5";
  g.font = `600 24px "Noto Sans", system-ui, sans-serif`;
  g.fillText(t.form, 74, 470);
  d.form.forEach((r, i) => {
    const x = 74 + i * 62;
    g.fillStyle = r === "win" ? "rgba(105,210,127,0.25)" : r === "loss" ? "rgba(242,107,91,0.25)" : "rgba(147,163,181,0.2)";
    g.fillRect(x, 510, 52, 52);
    g.fillStyle = r === "win" ? "#69d27f" : r === "loss" ? "#f26b5b" : "#93a3b5";
    g.font = `800 28px "Noto Sans", system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText(r === "win" ? t.win : r === "loss" ? t.loss : t.other, x + 26, 521);
    g.textAlign = "left";
  });
  g.fillStyle = "#f0bf4c";
  g.font = `700 30px "Noto Sans", system-ui, sans-serif`;
  g.textAlign = "right";
  g.fillText("vestigo.gg", W - 60, H - 70);
  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

export default function ShareCard({ data }: { data: ShareData }) {
  const t = useAoe2Copy();
  const [busy, setBusy] = useState(false);
  const bajar = async () => {
    setBusy(true);
    try {
      const b = await dibujar(data, { win: t.pl.formWin, loss: t.pl.formLoss, other: t.pl.formOther, mostPlayed: t.me.mostPlayed, form: t.pl.formH });
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${data.alias.replace(/[^\w.-]+/g, "_")}-aoe2-vestigo.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="a2-btn" onClick={() => void bajar()} disabled={busy}>
      {t.me.card}
    </button>
  );
}
