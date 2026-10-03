/**
 * Los nombres del Mapa de Project Zomboid (2026-09-30): pueblos, ríos, bosques y lugares (los textos del mapa del
 * juego) y las calles.
 *
 * - **Textos del mapa** (64): van como marcadores de Leaflet con texto de verdad, con la traducción del juego donde la
 *   tiene ("RÍO OHIO"). Cada uno trae el rango de zoom del mapa del juego en que se ve; `GAME_ZOOM_OFFSET` lo pasa al
 *   zoom del visor: los pueblos se ven de lejos y se van al entrar en ellos, cuando aparecen las calles y los lugares.
 * - **Calles** (1.098 tramos, 959 nombres): son muchas para el DOM, así que se escriben en canvas, tesela por tesela,
 *   desde el zoom `STREETS_FROM`. Cada tesela escribe todas las que la tocan en la misma posición del mundo, así un
 *   nombre que cruza el borde entre dos teselas se ve entero. Sólo se escribe el nombre si entra a lo largo de su
 *   calle: de lejos, las cuadras cortas no se tapan de letras.
 *
 * Lógica pura (se prueba sin navegador); la capa de Leaflet recibe el `L` de afuera, como `paper.ts`.
 */
import type * as Leaflet from "leaflet";
import type { Lang } from "../../i18n";
import type { MapLabel, Street } from "./data";
import { pxPerTile, tileRect, type Rect } from "./paper";

/**
 * El zoom del mapa del juego menos este número es el del visor. El juego escala con el alto de la pantalla: en una de
 * 1080 píxeles, su zoom 15 es un píxel por casilla (nuestro 4). Se redondeó medio punto hacia arriba para que los
 * pueblos duren un poco más de cerca: al zoom 3 ya se leen las calles.
 */
export const GAME_ZOOM_OFFSET = 10.5;

export type LabelKind = "town" | "water" | "forest" | "place";

export function labelKind(layer: string): LabelKind {
  if (layer === "text-town") return "town";
  if (layer.startsWith("text-water")) return "water";
  if (layer === "text-forest") return "forest";
  return "place";
}

/** ¿Se ve este texto al zoom `z` del visor? Con el rango del juego pasado a nuestra escala. */
export const labelVisible = (l: MapLabel, z: number): boolean =>
  z >= l.minZoom - GAME_ZOOM_OFFSET && z <= l.maxZoom - GAME_ZOOM_OFFSET;

/** El texto en el idioma de la página: el del juego en español si lo tiene, si no el original. */
export const labelText = (l: MapLabel, lang: Lang): string => (lang === "es" && l.es) || l.text;

/**
 * El tamaño de letra de un texto, en píxeles de pantalla (no crece con el zoom: de cerca estorbaría). Los pueblos, según
 * su escala en el juego (Louisville, 10, es el más grande); los ríos grandes más que los arroyos.
 */
export function labelSize(l: MapLabel): number {
  const kind = labelKind(l.layer);
  if (kind === "town") return Math.round(Math.min(34, 12 + l.scale * 2.2));
  if (kind === "forest") return 15;
  if (kind === "water") return l.scale >= 2 ? 16 : 12;
  return 12;
}

/** Desde qué zoom del visor se escriben las calles. */
export const STREETS_FROM = 3;

/** El tamaño de letra de las calles a cada zoom. */
export const streetFont = (z: number): number => (z < 4 ? 10 : z < 5 ? 11 : z < 6 ? 12 : 13);

export interface StreetLabel {
  name: string;
  x: number;
  y: number;
  /** En radianes, ya derecho para leer (entre −90° y 90°: `map.py` lo da así). */
  angle: number;
  /** El largo de la calle, en casillas. */
  length: number;
}

/** Las etiquetas de las calles, una por tramo, con el largo de cada uno para saber si el nombre entra. */
export function streetLabels(streets: Street[]): StreetLabel[] {
  return streets.map((s) => {
    let length = 0;
    for (let i = 2; i < s.points.length; i += 2) length += Math.hypot(s.points[i] - s.points[i - 2], s.points[i + 1] - s.points[i - 1]);
    return { name: s.name, x: s.label[0], y: s.label[1], angle: (s.label[2] * Math.PI) / 180, length };
  });
}

/** Las que tienen el punto del nombre a menos de `margin` casillas del rectángulo (un nombre largo se asoma). */
export const streetsNear = (labels: StreetLabel[], rect: Rect, margin: number): StreetLabel[] =>
  labels.filter((l) => l.x >= rect.x0 - margin && l.x <= rect.x1 + margin && l.y >= rect.y0 - margin && l.y <= rect.y1 + margin);

/** ¿Entra el nombre a lo largo de su calle, con un poco de aire en cada punta? */
export const fits = (l: StreetLabel, textWidth: number, scale: number): boolean => l.length * scale >= textWidth + 8;

export interface LabelTheme {
  fill: string;
  halo: string;
}
/** Letra clara con halo oscuro sobre la vista satelital; tinta con halo de papel sobre el papel. */
export const STREET_THEME: Record<"sat" | "paper", LabelTheme> = {
  sat: { fill: "#f6f1e1", halo: "rgba(18,22,16,0.9)" },
  paper: { fill: "#2a2620", halo: "rgba(239,233,216,0.95)" },
};

type TextCtx = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "translate" | "rotate" | "measureText" | "fillText" | "strokeText" | "font" | "fillStyle" | "strokeStyle" | "lineWidth" | "lineJoin" | "textAlign" | "textBaseline"
>;

/** El margen para buscar calles alrededor de una tesela: la mitad del nombre más largo que puede asomarse, en píxeles. */
const REACH_PX = 160;

/** Escribe los nombres de las calles que tocan la tesela `rect`, a `scale` píxeles por casilla, con la letra de `z`. */
export function drawStreetLabels(ctx: TextCtx, labels: StreetLabel[], rect: Rect, z: number, theme: LabelTheme): number {
  const scale = pxPerTile(z);
  ctx.font = `600 ${streetFont(z)}px "Noto Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.fillStyle = theme.fill;
  ctx.strokeStyle = theme.halo;
  let drawn = 0;
  for (const l of streetsNear(labels, rect, REACH_PX / scale)) {
    const w = ctx.measureText(l.name).width;
    if (!fits(l, w, scale)) continue;
    ctx.save();
    ctx.translate((l.x - rect.x0) * scale, (l.y - rect.y0) * scale);
    ctx.rotate(l.angle);
    ctx.strokeText(l.name, 0, 0);
    ctx.fillText(l.name, 0, 0);
    ctx.restore();
    drawn++;
  }
  return drawn;
}

export interface StreetLayerOptions {
  labels: StreetLabel[];
  theme: LabelTheme;
  bounds: Leaflet.LatLngBounds;
  maxZoom: number;
}

/** La capa de Leaflet con los nombres de las calles. Cambiar `theme` y llamar a `redraw()` los repinta. */
export function streetLayer(L: typeof Leaflet, opts: StreetLayerOptions): Leaflet.GridLayer & { options: StreetLayerOptions } {
  const Streets = L.GridLayer.extend({
    createTile(this: Leaflet.GridLayer & { options: StreetLayerOptions }, coords: Leaflet.Coords) {
      const tile = L.DomUtil.create("canvas", "pzm-street-tile") as HTMLCanvasElement;
      const size = this.getTileSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tile.width = size.x * dpr;
      tile.height = size.y * dpr;
      const ctx = tile.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawStreetLabels(ctx, this.options.labels, tileRect(coords.x, coords.y, coords.z, size.x), coords.z, this.options.theme);
      }
      return tile;
    },
  }) as new (options: Leaflet.GridLayerOptions & StreetLayerOptions) => Leaflet.GridLayer & { options: StreetLayerOptions };
  return new Streets({
    ...opts,
    minZoom: STREETS_FROM,
    noWrap: true,
    pane: "pzm-streets",
    className: "pzm-streets",
    updateWhenZooming: false,
  });
}
