/**
 * La base de papel del Mapa de Project Zomboid (2026-09-30): los polígonos del mapa de papel del juego (`worldmap.xml`,
 * partidos por región por `map.py`) pintados en canvas con la paleta del juego, así se ven como los mapas que se
 * encuentran en una partida y quedan nítidos a cualquier zoom (la tesela satelital, en cambio, se estira).
 *
 * La base entera es: el color del papel (el fondo del contenedor), la mancha del bosque (una capa de teselas propia,
 * `forest/`) y encima esta capa, que dibuja por tesela del visor, en orden: bosque cercano, agua, entradas, rutas,
 * senderos, vías y edificios por tipo. El orden es global: primero el agua de todas las regiones de la tesela, después
 * las rutas de todas… Así una ruta que cruza la frontera de dos regiones nunca queda debajo del agua de la otra.
 *
 * El dibujo es lógica pura sobre un `CanvasRenderingContext2D` (se prueba sin navegador). La capa de Leaflet recibe el
 * `L` de afuera en vez de importarlo: este archivo se puede cargar donde no hay `window`, y Leaflet viaja sólo en el
 * chunk del visor.
 */
import type * as Leaflet from "leaflet";
import type { MapStyle, Poly, RegionDraw, RegionRef, RGB, Ring } from "./data";

export const TILE = 256;

/** Cuántos píxeles mide una casilla a un zoom del visor: 1 en el zoom 4, la mitad por cada punto menos. */
export const pxPerTile = (z: number): number => 2 ** (z - 4);

/** Un rectángulo del mundo, en casillas. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** La parte del mundo que cubre la tesela (x, y) del zoom z. */
export function tileRect(x: number, y: number, z: number, size = TILE): Rect {
  const span = size / pxPerTile(z);
  return { x0: x * span, y0: y * span, x1: (x + 1) * span, y1: (y + 1) * span };
}

/** Las regiones que tocan un rectángulo y tienen el archivo pedido (por defecto, el dibujo). */
export function regionsIn(rect: Rect, regions: RegionRef[], file: "draw" | "zones" | "bld" = "draw"): string[] {
  return regions
    .filter((r) => r[file] && r.box[0] < rect.x1 && r.box[2] > rect.x0 && r.box[1] < rect.y1 && r.box[3] > rect.y0)
    .map((r) => r.id);
}

const rgb = ([r, g, b]: RGB, a = 1) => (a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`);

/** La caja de un anillo, calculada una vez (los datos de una región no cambian). */
const boxes = new WeakMap<Ring, [number, number, number, number]>();
function box(r: Ring): [number, number, number, number] {
  let b = boxes.get(r);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < b[0]) b[0] = r[i];
      if (r[i] > b[2]) b[2] = r[i];
      if (r[i + 1] < b[1]) b[1] = r[i + 1];
      if (r[i + 1] > b[3]) b[3] = r[i + 1];
    }
    boxes.set(r, b);
  }
  return b;
}
const touches = (r: Ring, v: Rect, pad = 0) => {
  const b = box(r);
  return b[0] <= v.x1 + pad && b[2] >= v.x0 - pad && b[1] <= v.y1 + pad && b[3] >= v.y0 - pad;
};

type Ctx = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "lineWidth" | "lineJoin" | "lineCap"
>;

function trace(ctx: Ctx, r: Ring, rect: Rect, scale: number, close: boolean) {
  ctx.moveTo((r[0] - rect.x0) * scale, (r[1] - rect.y0) * scale);
  for (let i = 2; i < r.length; i += 2) ctx.lineTo((r[i] - rect.x0) * scale, (r[i + 1] - rect.y0) * scale);
  if (close) ctx.closePath();
}

/**
 * Rellena polígonos de un color. Los que no tienen huecos van juntos en un solo camino con `nonzero` (dos que se pisan,
 * como las rutas en un cruce, se suman); los que tienen huecos, cada uno con `evenodd`, que es lo que hace hueco al
 * anillo de adentro sin depender del sentido en que se dibujó.
 *
 * El primero depende del giro: con `nonzero`, dos polígonos que se pisan y giran al revés se anulan. Por eso `map.py`
 * escribe todos los anillos de afuera girando igual (`wind` en `write_web`, y `zomboidMapData.test.ts` lo vigila).
 */
function fillPolys(ctx: Ctx, polys: Poly[] | undefined, color: string, rect: Rect, scale: number) {
  if (!polys?.length) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  let any = false;
  const holed: Poly[] = [];
  for (const p of polys) {
    if (!p[0] || !touches(p[0], rect)) continue;
    if (p.length > 1) holed.push(p);
    else {
      trace(ctx, p[0], rect, scale, true);
      any = true;
    }
  }
  if (any) ctx.fill("nonzero");
  for (const p of holed) {
    ctx.beginPath();
    for (const r of p) trace(ctx, r, rect, scale, true);
    ctx.fill("evenodd");
  }
}

/** Las clases de ruta de abajo hacia arriba: la principal queda encima de la que la cruza. */
const ROAD_ORDER = ["trail", "tertiary", "secondary", "primary"];
/** Las líneas (senderos sin polígono) miden esto de ancho en casillas, con un píxel como mínimo. */
const LINE_TILES = 2;
/** Desde este zoom los edificios llevan un contorno fino, para que se separen los que están pegados. */
const OUTLINE_FROM = 1; // píxeles por casilla: el zoom 4

/**
 * Pinta el dibujo de papel de unas regiones en la tesela que cubre `rect`, a `scale` píxeles por casilla. El canvas ya
 * viene escalado por la densidad de la pantalla; acá todo va en píxeles de CSS.
 */
export function drawPaper(ctx: Ctx, regions: RegionDraw[], style: MapStyle, rect: Rect, scale: number): void {
  const road = (cls: string) => style.roads[cls] ?? style.roads.tertiary;
  for (const r of regions) fillPolys(ctx, r.wood, rgb(style.forest), rect, scale);
  for (const r of regions) fillPolys(ctx, r.water, rgb(style.water), rect, scale);
  for (const r of regions) fillPolys(ctx, r.driveways, rgb(road("tertiary")), rect, scale);
  const classes = [...new Set(regions.flatMap((r) => Object.keys(r.roads ?? {})))].sort(
    (a, b) => ROAD_ORDER.indexOf(a) - ROAD_ORDER.indexOf(b),
  );
  for (const cls of classes) for (const r of regions) fillPolys(ctx, r.roads?.[cls], rgb(road(cls)), rect, scale);

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, LINE_TILES * scale);
  for (const r of regions) {
    for (const [cls, lines] of Object.entries(r.roadLines ?? {})) {
      ctx.strokeStyle = rgb(road(cls));
      ctx.beginPath();
      for (const l of lines) if (touches(l, rect, LINE_TILES)) trace(ctx, l, rect, scale, false);
      ctx.stroke();
    }
  }
  for (const r of regions) fillPolys(ctx, r.railway, rgb(style.railway), rect, scale);

  const kinds = [...new Set(regions.flatMap((r) => Object.keys(r.b ?? {})))].sort();
  for (const kind of kinds) {
    const color = style.buildings[kind] ?? style.buildings.yes;
    for (const r of regions) fillPolys(ctx, r.b?.[kind], rgb(color), rect, scale);
  }
  if (scale >= OUTLINE_FROM) {
    ctx.strokeStyle = "rgba(42,38,32,0.45)";
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (const r of regions) {
      for (const polys of Object.values(r.b ?? {})) {
        for (const p of polys) if (p[0] && touches(p[0], rect)) for (const ring of p) trace(ctx, ring, rect, scale, true);
      }
    }
    ctx.stroke();
  }
}

export interface PaperOptions {
  style: MapStyle;
  regions: RegionRef[];
  load: (id: string) => Promise<RegionDraw>;
  bounds: Leaflet.LatLngBounds;
  minZoom: number;
  maxZoom: number;
}

/**
 * La capa de Leaflet que dibuja el papel: una tesela de canvas por celda del visor, que pide las regiones que toca
 * (una vez cada una: `load` las guarda) y las pinta. Con la densidad de la pantalla (hasta 2×) para que se vea nítida
 * en un celular.
 */
export function paperLayer(L: typeof Leaflet, opts: PaperOptions): Leaflet.GridLayer {
  const Paper = L.GridLayer.extend({
    createTile(this: Leaflet.GridLayer, coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
      const tile = L.DomUtil.create("canvas", "pzm-paper-tile") as HTMLCanvasElement;
      const size = this.getTileSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tile.width = size.x * dpr;
      tile.height = size.y * dpr;
      const rect = tileRect(coords.x, coords.y, coords.z, size.x);
      Promise.all(regionsIn(rect, opts.regions).map(opts.load)).then(
        (drawn) => {
          const ctx = tile.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawPaper(ctx, drawn, opts.style, rect, pxPerTile(coords.z));
          }
          done(undefined, tile);
        },
        (err: Error) => done(err, tile),
      );
      return tile;
    },
  }) as new (options: Leaflet.GridLayerOptions) => Leaflet.GridLayer;
  return new Paper({
    bounds: opts.bounds,
    minZoom: opts.minZoom,
    maxZoom: opts.maxZoom,
    noWrap: true,
    className: "pzm-paper",
    // Al acercar con la rueda, no redibujar a cada paso intermedio: se estiran las que hay y se pintan al terminar.
    updateWhenZooming: false,
  });
}
