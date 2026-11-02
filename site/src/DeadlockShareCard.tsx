import { useState } from "react";
import { useLang } from "./i18n";
import { useCopy } from "./deadlockCopy";
import { heroImg, rankLabel, rankOf } from "./deadlockReportData";
import { variantUrl } from "./GameImg";

/**
 * "Share card": una imagen de 1200×630 del perfil, para pegar en X o Discord.
 *
 * **No es una imagen OG por jugador**: las páginas son estáticas y no hay una
 * función de servidor que la dibuje al vuelo, así que la arma el navegador en
 * un `<canvas>` cuando se aprieta el botón, y se baja como PNG. El enlace del
 * perfil se copia aparte.
 *
 * Las imágenes de héroes y rangos se sirven desde el sitio (mismo origen) y no
 * ensucian el lienzo. El avatar de Steam viene de otro dominio: se pide con
 * `crossOrigin` y, si no llega o no lo permite, la tarjeta sale sin él en vez
 * de fallar entera.
 */

export interface ShareData {
  accountId: number;
  name: string;
  avatar?: string;
  badge: number;
  peak: number | null;
  matches: number;
  winRate: number;
  kda: string;
  heroes: number[];
  /** "Season 1", "All time": de qué habla la tarjeta. */
  scope: string;
}

const W = 1200;
const H = 630;
const CREAM = "#f3e6cf";
const INK = "#2a211a";
const RED = "#b2401c";
const BG = "#191512";

function load(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** La fuente de títulos del sitio, leída del CSS para no repetir su nombre. */
function displayFont(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  return v || "Impact, sans-serif";
}

async function draw(d: ShareData, labels: { rank: string; peak: string; matches: string; winRate: string; kda: string; heroes: string }, lang: string): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  await document.fonts?.ready;
  const title = displayFont();

  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  // El papel crema del estilo Cartel, con margen.
  g.fillStyle = CREAM;
  g.fillRect(40, 40, W - 80, H - 80);

  const rango = rankOf(d.badge);
  const [avatar, insignia, pico, ...caras] = await Promise.all([
    d.avatar ? load(d.avatar, true) : Promise.resolve(null),
    rango ? load(rango.img, false) : Promise.resolve(null),
    d.peak && rankOf(d.peak) ? load(rankOf(d.peak)!.img, false) : Promise.resolve(null),
    ...d.heroes.slice(0, 3).map((h) => {
      const src = heroImg(h);
      return src ? load(variantUrl(src, 160), false) : Promise.resolve(null);
    }),
  ]);

  let x = 90;
  if (avatar) {
    g.drawImage(avatar, x, 90, 120, 120);
    x += 150;
  }
  g.fillStyle = INK;
  g.font = `64px ${title}`;
  g.textBaseline = "top";
  g.fillText(d.name.slice(0, 22), x, 92, W - x - 90);
  g.fillStyle = RED;
  g.font = `600 26px system-ui, sans-serif`;
  g.fillText(`DEADLOCK · ${d.scope.toUpperCase()}`, x, 172);

  // El rango, grande, a la izquierda.
  if (insignia && rango) {
    const h = 150;
    const w = h * (insignia.naturalWidth / Math.max(1, insignia.naturalHeight));
    g.drawImage(insignia, 90, 250, w, h);
    g.fillStyle = INK;
    g.font = `40px ${title}`;
    g.fillText(rankLabel(rango, lang as "en" | "es"), 90, 415, 420);
    g.fillStyle = "#6b5d4f";
    g.font = `22px system-ui, sans-serif`;
    g.fillText(labels.rank, 90, 465);
  }
  // El pico sólo si se lee distinto del rango de hoy: arriba de Eternus II los
  // badges siguen subiendo pero se llaman igual.
  const p = d.peak ? rankOf(d.peak) : null;
  if (pico && p && (!rango || rankLabel(p, lang as "en" | "es") !== rankLabel(rango, lang as "en" | "es"))) {
    g.drawImage(pico, 90, 500, 40 * (pico.naturalWidth / Math.max(1, pico.naturalHeight)), 40);
    g.fillStyle = INK;
    g.font = `600 22px system-ui, sans-serif`;
    g.fillText(`${labels.peak}: ${rankLabel(p, lang as "en" | "es")}`, 145, 510, 380);
  }

  // Las cifras, a la derecha.
  const cifras: [string, string][] = [
    [labels.matches, d.matches.toLocaleString(lang)],
    [labels.winRate, `${Math.round(d.winRate * 100)}%`],
    [labels.kda, d.kda],
  ];
  cifras.forEach(([k, v], i) => {
    const cx = 560 + i * 200;
    g.fillStyle = "#6b5d4f";
    g.font = `600 20px system-ui, sans-serif`;
    g.fillText(k.toUpperCase(), cx, 255);
    g.fillStyle = INK;
    g.font = `52px ${title}`;
    g.fillText(v, cx, 285, 190);
  });

  // Los héroes más jugados.
  g.fillStyle = "#6b5d4f";
  g.font = `600 20px system-ui, sans-serif`;
  g.fillText(labels.heroes.toUpperCase(), 560, 395);
  caras.forEach((img, i) => {
    if (img) g.drawImage(img, 560 + i * 120, 425, 100, 100);
  });

  g.fillStyle = RED;
  g.font = `600 24px system-ui, sans-serif`;
  g.textAlign = "right";
  g.fillText(`vestigo.gg/deadlock/player/${d.accountId}`, W - 90, 548);

  return new Promise((ok) => {
    try {
      c.toBlob((b) => ok(b), "image/png");
    } catch {
      ok(null);
    }
  });
}

export default function DeadlockShareCard({ data }: { data: ShareData }) {
  const copy = useCopy();
  const { lang } = useLang();
  const c = copy.deadlock.report.share;
  const [url, setUrl] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function armar() {
    setHaciendo(true);
    let blob = await draw(data, c.labels, lang);
    // Si el avatar ensució el lienzo, se rehace sin él.
    if (!blob && data.avatar) blob = await draw({ ...data, avatar: undefined }, c.labels, lang);
    setHaciendo(false);
    if (blob) setUrl(URL.createObjectURL(blob));
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`https://vestigo.gg/${lang}/deadlock/player/${data.accountId}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: el enlace está en la barra */
    }
  }

  return (
    <div className="dl-share">
      {url ? (
        <>
          <img className="dl-share-preview" src={url} alt={c.alt(data.name)} width={W / 4} height={H / 4} />
          <a className="dl-share-btn" href={url} download={`vestigo-${data.accountId}.png`}>
            {c.download}
          </a>
        </>
      ) : (
        <button type="button" className="dl-share-btn" onClick={armar} disabled={haciendo}>
          {haciendo ? c.making : c.button}
        </button>
      )}
      <button type="button" className="dl-share-btn is-quiet" onClick={copiar}>
        {copiado ? c.copied : c.copyLink}
      </button>
    </div>
  );
}
