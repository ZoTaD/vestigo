import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";
import opentype from "opentype.js";

/**
 * Las imágenes de vista previa (Open Graph) de cada página, dibujadas en el
 * build.
 *
 * Hasta el 2026-09-18 todas las páginas compartían `og.jpg`. Para X y Discord,
 * que es donde se comparte el periódico y las fichas de héroe, la imagen es lo
 * primero que se ve y decide el clic: acá cada héroe lleva su carta, cada
 * edición de Vestigo News su portada, y cada objeto su ícono.
 *
 * **Se dibujan en el build y no se commitean.** Son ~400 JPEG que cambiarían con
 * cada catálogo; en git serían megas por corrida. El build de Netlify las
 * genera con `sharp` y las sube como cualquier otro asset. Si el dibujo de una
 * falla (la carta no bajó, la fuente no está), esa página vuelve a `og.jpg` y
 * el build sigue: una vista previa genérica es mejor que un sitio sin publicar.
 *
 * **Sin fuentes del sistema.** El texto se convierte a trazos con `opentype.js`
 * a partir de los TTF de esta carpeta (Barlow y Barlow Condensed, licencia OFL,
 * las mismas familias del sitio). Así la imagen sale igual en Windows, en
 * Netlify y en cualquier máquina, y `sharp` no tiene que resolver una fuente
 * que puede no existir.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));
const loadFont = (file: string) => {
  const b = readFileSync(here(file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

let fonts: { display: opentype.Font; text: opentype.Font } | null = null;
const getFonts = () => (fonts ??= { display: loadFont("BarlowCondensed-Black.ttf"), text: loadFont("Barlow-Bold.ttf") });

const INK = "#ecdfc4";
const INK_SOFT = "#b9ad95";
const GOLD = "#c79a4e";
const GOLD_LIGHT = "#f3dca0";

/**
 * Un texto como trazo SVG, anclado a la izquierda en (x, y) sobre la línea base.
 *
 * **Los comandos del trazo se serializan acá y no con `toPathData`.** En
 * opentype.js 2.0 `toPathData` escribe "NaN" en algunas coordenadas aunque los
 * comandos estén bien (verificado: 282 comandos sin un solo NaN, y el texto
 * salía con letras cortadas o palabras enteras faltantes). Serializar los
 * números a mano lo evita del todo.
 */
function pathData(path: opentype.Path): string {
  const n = (v: number) => v.toFixed(2);
  return path.commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case "Q":
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case "C":
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
}
function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, fill: string, spacing = 0): string {
  const parts: string[] = [];
  let cx = x;
  for (const word of text.split(" ")) {
    if (word) {
      parts.push(pathData(font.getPath(word, cx, y, size, { kerning: false, letterSpacing: spacing / size })));
      cx += wordWidth(font, word, size, spacing);
    }
    cx += spaceWidth(font, size) + spacing;
  }
  return `<path d="${parts.join(" ")}" fill="${fill}"/>`;
}
const spaceWidth = (font: opentype.Font, size: number) => {
  const w = font.charToGlyph(" ").advanceWidth;
  return ((Number.isFinite(w) && (w as number) > 0 ? (w as number) : font.unitsPerEm * 0.25) * size) / font.unitsPerEm;
};
const wordWidth = (font: opentype.Font, word: string, size: number, spacing: number) =>
  font.getAdvanceWidth(word, size, { kerning: false }) + spacing * word.length;
const width = (font: opentype.Font, text: string, size: number, spacing = 0) => {
  const words = text.split(" ").filter(Boolean);
  return (
    words.reduce((w, word) => w + wordWidth(font, word, size, spacing), 0) +
    Math.max(0, words.length - 1) * (spaceWidth(font, size) + spacing) -
    spacing
  );
};

/** Parte un texto en hasta `maxLines` líneas que quepan en `maxWidth`, achicando la fuente si hace falta. */
function fitLines(font: opentype.Font, text: string, maxWidth: number, size: number, maxLines: number, minSize: number): { lines: string[]; size: number } {
  for (let s = size; s >= minSize; s -= 4) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const probe = cur ? `${cur} ${w}` : w;
      if (width(font, probe, s) <= maxWidth) cur = probe;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => width(font, l, s) <= maxWidth)) return { lines, size: s };
  }
  // No entra ni al mínimo: se corta con puntos suspensivos.
  const s = minSize;
  let t = text;
  while (t.length > 3 && width(font, t + "…", s) > maxWidth) t = t.slice(0, -1);
  return { lines: [t + "…"], size: s };
}

const cache = new Map<string, Promise<Buffer | null>>();
/** Una imagen remota, una sola vez por build. `null` si no bajó: la página sale sin ella. */
export function fetchImage(url: string): Promise<Buffer | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

export interface OgSpec {
  /** La línea chica de arriba: "DEADLOCK · HÉROE". */
  kicker: string;
  /** El título grande. */
  title: string;
  /** La línea de abajo del título, opcional: "54,5% de victorias · 6.445 partidas". */
  subtitle?: string;
  /** Pie: "vestigo.gg". */
  footer: string;
  /** Cartas de héroe (retratos altos) a la derecha, de 1 a 4. */
  cards?: string[];
  /** Un ícono cuadrado (objeto) en vez de cartas. */
  icon?: string;
  /** El color del héroe o del slot, para el tinte del fondo. */
  accent?: string;
}

const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : GOLD);

export async function renderOg(spec: OgSpec): Promise<Buffer> {
  const { display, text } = getFonts();
  const accent = hex(spec.accent ?? GOLD);
  const W = OG_WIDTH;
  const H = OG_HEIGHT;

  const cards = (spec.cards ?? []).slice(0, 4);
  const images = (await Promise.all(cards.map(fetchImage))).filter((b): b is Buffer => !!b);
  const icon = spec.icon ? await fetchImage(spec.icon) : null;

  // La zona de texto: todo el ancho si no hay arte, dos tercios si hay.
  const hasArt = images.length > 0 || !!icon;
  const textRight = hasArt ? (images.length > 1 ? 520 : 720) : W - 80;
  const textWidth = textRight - 80;

  const kickerSize = 30;
  const titleFit = fitLines(display, spec.title.toUpperCase(), textWidth, 128, 2, 64);
  const lineH = titleFit.size * 0.92;
  const subSize = 30;
  const blockH = kickerSize + 24 + titleFit.lines.length * lineH + (spec.subtitle ? 22 + subSize : 0);
  let y = (H - blockH) / 2 + kickerSize;

  const parts: string[] = [];
  parts.push(textPath(text, spec.kicker.toUpperCase(), 80, y, kickerSize, GOLD, 5));
  y += 24;
  for (const line of titleFit.lines) {
    y += lineH;
    parts.push(textPath(display, line, 78, y, titleFit.size, INK));
  }
  if (spec.subtitle) {
    y += 22 + subSize;
    parts.push(textPath(text, spec.subtitle, 80, y, subSize, INK_SOFT));
  }
  // Pie y marca.
  parts.push(textPath(text, spec.footer, 80, H - 48, 26, GOLD_LIGHT, 2));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#18201c"/><stop offset="1" stop-color="#0b100d"/>
    </linearGradient>
    <radialGradient id="tint" cx="${hasArt ? "85%" : "50%"}" cy="30%" r="70%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#101613" stop-opacity="1"/><stop offset="1" stop-color="#101613" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#tint)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${GOLD}"/>
  ${parts.join("\n  ")}
</svg>`;

  const layers: OverlayOptions[] = [];
  if (images.length > 0) {
    // Una carta grande a la derecha, o una tira de columnas recortadas al
    // rostro, como la portada del periódico.
    const n = images.length;
    const cardH = H;
    const cardW = n === 1 ? Math.round(cardH * (280 / 380)) : Math.round((W - textRight - (n - 1) * 6) / n);
    const totalW = n * cardW + (n - 1) * 6;
    let x = W - totalW;
    for (const img of images) {
      const resized = await sharp(img).resize(cardW, cardH, { fit: "cover", position: "top" }).png().toBuffer();
      layers.push({ input: resized, left: x, top: 0 });
      x += cardW + 6;
    }
    // Un degradado que funde el arte con el fondo del lado del texto.
    const fadeW = 260;
    const fade = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fadeW}" height="${H}"><defs><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="#101613" stop-opacity="1"/><stop offset="1" stop-color="#101613" stop-opacity="0"/></linearGradient></defs><rect width="${fadeW}" height="${H}" fill="url(#f)"/></svg>`
    );
    layers.push({ input: fade, left: W - totalW, top: 0 });
  } else if (icon) {
    const size = 300;
    const plate = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 80}" height="${size + 80}"><rect width="${size + 80}" height="${size + 80}" rx="36" fill="${accent}" fill-opacity="0.22"/></svg>`
    );
    const resized = await sharp(icon).resize(size, size, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(resized).metadata();
    const left = W - (size + 80) - 80;
    const top = Math.round((H - (size + 80)) / 2);
    layers.push({ input: plate, left, top });
    layers.push({ input: resized, left: left + 40 + Math.round((size - (meta.width ?? size)) / 2), top: top + 40 + Math.round((size - (meta.height ?? size)) / 2) });
  }

  return sharp(Buffer.from(svg))
    .composite([
      // El arte va debajo del texto: primero se apoya sobre el fondo y después
      // se vuelve a dibujar el SVG entero encima, con el fondo transparente.
      ...layers,
      { input: Buffer.from(svg.replace(/<rect width="\d+" height="\d+" fill="url\(#bg\)"\/>/, "")), left: 0, top: 0 },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
