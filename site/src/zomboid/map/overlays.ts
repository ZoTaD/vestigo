/**
 * Las capas del juego sobre el visor del Mapa de Project Zomboid (2026-09-30, Task 3): la parte que toca Leaflet. La
 * lógica (qué zona es qué, qué punto va con qué profesión, cómo se dibuja una anotación) está en `layers.ts`; acá se
 * arma sobre el mapa:
 *
 * - **Zonas** (vehículos, recolección, animales, sótanos, zombis, historias, botín, edificios con nombre): una capa de
 *   canvas por tesela, como la base de papel. Pide `zones/<id>` de las regiones que toca la tesela, y sólo existe en el
 *   mapa mientras haya alguna de esas capas prendida: con todas apagadas no se pide nada. Qué es cada zona se cuenta en
 *   una nota que sigue al cursor, o al tocar en el celular.
 * - **Densidad de zombis** (2026-10-01): otra capa de canvas por tesela, con `zombies.bin` (ver `heat.ts`), que se pide
 *   la primera vez que se prende la capa y nunca con la capa apagada. Un cuadrito por chunk de cerca; de lejos, el
 *   máximo de cada bloque.
 * - **Puntos de aparición**: un sello de estrella por punto (son 421), con sus profesiones al pasar el mouse.
 * - **Escondites**: de cerca, sus anotaciones como en el mapa del juego (los sellos teñidos con `mask`, las notas en
 *   Caveat, la letra del juego, de su color); de lejos, un solo sello por escondite. Al tocarlos, la página abre su hoja.
 *
 * Recibe `L` de afuera, como `paper.ts`: el que importa Leaflet es `viewer.ts`.
 */
import type * as Leaflet from "leaflet";
import profNames from "virtual:pz-names/professions";
import type { Lang } from "../../i18n";
import { MAP_COPY } from "./copy";
import type { MapCommon } from "./data";
import { heatTileCells, heatWindow, loadDensity } from "./heat";
import { STREET_THEME } from "./labels";
import {
  annotationMark,
  drawZones,
  fallbackProf,
  spawnMarks,
  spawnMissing,
  STAMP_CANVAS,
  stampSrc,
  stashMainAnnotation,
  stashPin,
  zoneLabel,
  zonesAt,
  zonesIn,
  zoneText,
  type SpawnMark,
} from "./layers";
import { LAYER_STAMP, layersAtZoom, SPAWN_COLOR, ZONE_LAYER, ZONES_FROM } from "./layerMeta";
import { pxPerTile, regionsIn, tileRect, type Rect } from "./paper";
import { loadZones, peekZones } from "./regionData";
import { MIN_ZOOM, PROFESSIONS, type LayerId, type MapBase } from "./url";
import { ZONE_NAMES } from "./zoneNames";

/** Las profesiones con ficha (sus slugs): para pasar los nombres del juego de los puntos de aparición. */
const KNOWN_PROFS = PROFESSIONS;

/** Las capas que se dibujan como zonas (todas menos los puntos de aparición y los escondites). */
const ZONE_LAYERS = new Set<LayerId>(Object.values(ZONE_LAYER));

/**
 * Desde este zoom los escondites se ven enteros (todas sus anotaciones); antes, un sello por escondite y sólo las
 * anotaciones del que está abierto. Al zoom 4 las notas de Muldraugh (19 escondites) se apilaban y tapaban las calles;
 * al 5 cada casilla son dos píxeles y entran sin pisarse.
 */
export const STASH_NEAR = 5;
/** Desde este zoom se ven las anotaciones del escondite abierto aunque todavía no estén las de todos. */
const STASH_PICK_FROM = 3;
/**
 * La escala de las anotaciones (`--pzm-k` en el CSS: un sello de 21 px y una nota de Caveat de 14 px con k = 1). No se
 * midió contra el juego: es el tamaño que se lee sin tapar las calles. Al zoom 5 va en 1 y al 6 crece a 1,5 con el
 * mapa; más lejos (el escondite abierto, desde el zoom 3) se queda en 1.
 */
const STASH_K = (z: number) => Math.min(1.5, Math.max(1, pxPerTile(z) / 2));

export interface OverlayOptions {
  L: typeof Leaflet;
  map: Leaflet.Map;
  common: MapCommon;
  lang: Lang;
  base: MapBase;
  bounds: Leaflet.LatLngBounds;
  maxZoom: number;
  /** Tocaron un escondite (su id). */
  onStash: (id: string) => void;
}

export interface Overlays {
  setLayers: (on: readonly LayerId[], prof: string | null) => void;
  setLang: (lang: Lang) => void;
  setBase: (base: MapBase) => void;
  /** Marca el escondite abierto (y apaga un poco los demás); `null` para ninguno. */
  pickStash: (id: string | null) => void;
  destroy: () => void;
}

/**
 * Los sellos teñidos para el canvas, con un halo claro (en canvas no hay `mask`: se tiñe con `source-in`, que es lo
 * mismo). Se arma uno por sello y color, una vez; si la imagen todavía no llegó devuelve `null` y avisa al llegar para
 * que las teselas se redibujen con el sello.
 */
function stampTinter(onReady: () => void) {
  const images = new Map<string, HTMLImageElement>();
  const tinted = new Map<string, HTMLCanvasElement>();
  let queued = false;
  const canvas = (size: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  };
  const tint = (img: HTMLImageElement, color: string) => {
    const c = canvas(64);
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, 64, 64);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    return c;
  };
  return (file: string, color: string): HTMLCanvasElement | null => {
    const key = `${file}|${color}`;
    const done = tinted.get(key);
    if (done) return done;
    let img = images.get(file);
    if (!img) {
      img = new Image();
      img.onload = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          onReady();
        });
      };
      img.src = stampSrc(`map_${file}.png`);
      images.set(file, img);
      return null;
    }
    if (!img.complete || !img.naturalWidth) return null;
    const out = canvas(STAMP_CANVAS);
    const g = out.getContext("2d")!;
    const pad = (STAMP_CANVAS - 64) / 2;
    const halo = tint(img, "rgba(250,247,236,0.92)");
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) g.drawImage(halo, pad + dx, pad + dy);
    g.drawImage(tint(img, color), pad, pad);
    tinted.set(key, out);
    return out;
  };
}

type ZonesLayer = Leaflet.GridLayer & { on_: ReadonlySet<LayerId>; lang_: Lang; base_: MapBase };

export function mountOverlays(opts: OverlayOptions): Overlays {
  const { L, map, common } = opts;
  let lang = opts.lang;
  let base = opts.base;
  let on = new Set<LayerId>();
  let prof: string | null = null;
  let t = MAP_COPY[lang];
  let names = ZONE_NAMES[lang];

  for (const [name, z] of [["pzm-zones", 405], ["pzm-spawns", 610], ["pzm-stashes", 620]] as const) {
    const pane = map.createPane(name);
    pane.style.zIndex = String(z);
  }
  // El canvas de las zonas no ataja el mouse: lo que hay debajo se averigua con la casilla (ver `hover`).
  map.getPane("pzm-zones")!.style.pointerEvents = "none";
  const stashPane = map.getPane("pzm-stashes")!;

  // ── Zonas ──
  let zones: ZonesLayer | null = null;
  const stamp = stampTinter(() => zones?.redraw());
  const Zones = L.GridLayer.extend({
    createTile(this: ZonesLayer, coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
      const tile = L.DomUtil.create("canvas", "pzm-zone-tile") as HTMLCanvasElement;
      const size = this.getTileSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tile.width = size.x * dpr;
      tile.height = size.y * dpr;
      const rect = tileRect(coords.x, coords.y, coords.z, size.x);
      const scale = pxPerTile(coords.z);
      // Con margen: el sello o el nombre de una zona que está al lado se asoma a esta tesela.
      const pad = 48 / scale;
      const wide: Rect = { x0: rect.x0 - pad, y0: rect.y0 - pad, x1: rect.x1 + pad, y1: rect.y1 + pad };
      // Sólo las capas que ya llegaron a su zoom (ver `ZONE_MIN_ZOOM`); si no queda ninguna, la tesela va vacía y no se
      // pide ninguna región.
      const layerOn = layersAtZoom(this.on_, coords.z);
      if (![...layerOn].some((id) => ZONE_LAYERS.has(id))) {
        queueMicrotask(() => done(undefined, tile));
        return tile;
      }
      const copy = ZONE_NAMES[this.lang_];
      const theme = STREET_THEME[this.base_];
      Promise.all(regionsIn(wide, common.regions, "zones").map((id) => loadZones(id, common.zoneDefs))).then(
        (lists) => {
          const ctx = tile.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawZones(ctx, zonesIn(lists, wide, layerOn), rect, scale, { stamp, text: (z) => zoneText(z, copy, common.zoneDefs), theme });
          }
          done(undefined, tile);
        },
        (err: Error) => done(err, tile),
      );
      return tile;
    },
  }) as new (options: Leaflet.GridLayerOptions) => ZonesLayer;

  const syncZones = () => {
    const want = [...on].some((id) => ZONE_LAYERS.has(id));
    if (!want) {
      zones?.remove();
      zones = null;
      hideTip();
      return;
    }
    if (!zones) {
      zones = new Zones({
        bounds: opts.bounds,
        // A propósito: el `minZoom` de GridLayer es 0 si no se dice, y por debajo la capa no dibujaba nada sin avisar.
        // Más lejos que esto la leyenda dice "acercá".
        minZoom: ZONES_FROM,
        maxZoom: opts.maxZoom,
        noWrap: true,
        pane: "pzm-zones",
        className: "pzm-zones",
        updateWhenZooming: false,
      });
      zones.on_ = new Set(on);
      zones.lang_ = lang;
      zones.base_ = base;
      zones.addTo(map);
      return;
    }
    zones.on_ = new Set(on);
    zones.lang_ = lang;
    zones.base_ = base;
    zones.redraw();
  };

  // ── Densidad de zombis ──
  // Abajo de las zonas (405) y arriba de las teselas: es un sombreado del terreno. Sobre el papel va `multiply`, como un
  // lápiz que oscurece sin tapar. Sobre el satélite no: es oscuro y verde, y multiplicar un rojo suave por un verde
  // oscuro casi no se nota (los valores 1–2, que son la mayoría, desaparecían); ahí va la mezcla normal, que el rojo
  // se lee y la imagen de abajo igual se ve por la transparencia.
  const heatPane = map.createPane("pzm-heat");
  heatPane.style.zIndex = "402";
  heatPane.style.pointerEvents = "none";
  const blendHeat = () => {
    heatPane.style.mixBlendMode = base === "paper" ? "multiply" : "normal";
  };
  blendHeat();
  let heat: Leaflet.GridLayer | null = null;
  const Heat = L.GridLayer.extend({
    createTile(this: Leaflet.GridLayer, coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
      const tile = L.DomUtil.create("canvas", "pzm-heat-tile") as HTMLCanvasElement;
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const head = common.zombies;
      loadDensity(head).then(
        (levels) => {
          const { k, x0, y0, n } = heatTileCells(coords.x, coords.y, coords.z, size.x, head.cell);
          const px = heatWindow(levels[k], x0, y0, n, head.max);
          const src = document.createElement("canvas");
          src.width = src.height = n;
          src.getContext("2d")!.putImageData(new ImageData(px, n, n), 0, 0);
          const ctx = tile.getContext("2d");
          if (ctx) {
            // Sin suavizado: cada cuadrito es un chunk del juego (de cerca) o el máximo de varios (de lejos).
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, 0, 0, size.x, size.y);
          }
          done(undefined, tile);
        },
        (err: Error) => done(err, tile),
      );
      return tile;
    },
  }) as new (options: Leaflet.GridLayerOptions) => Leaflet.GridLayer;

  const syncHeat = () => {
    const want = on.has("densidad");
    if (!want) {
      heat?.remove();
      heat = null;
      return;
    }
    if (heat) return;
    heat = new Heat({
      bounds: opts.bounds,
      // A propósito: el `minZoom` de GridLayer es 0 si no se dice, y la densidad se ve también con el condado entero.
      minZoom: MIN_ZOOM,
      maxZoom: opts.maxZoom,
      noWrap: true,
      pane: "pzm-heat",
      className: "pzm-heat",
      updateWhenZooming: false,
    }).addTo(map);
  };

  // La nota de qué es cada zona: sigue al cursor, o queda donde se tocó (en el celular no hay cursor).
  const tip = L.tooltip({ className: "pzm-tip", direction: "top", offset: [0, -12], opacity: 1 });
  const tipBody = document.createElement("div");
  // Lo que dice la nota ahora: con el mouse quieto sobre la misma zona, `mousemove` llega en cada cuadro y no hace
  // falta rehacer sus renglones, sólo moverla.
  let tipText = "";
  function hideTip() {
    tipText = "";
    if (map.hasLayer(tip)) map.closeTooltip(tip);
  }
  const showZones = (at: Leaflet.LatLng): boolean => {
    if (!zones) return false;
    const lists = regionsIn({ x0: at.lng, y0: at.lat, x1: at.lng, y1: at.lat }, common.regions, "zones")
      .map(peekZones)
      .filter((l): l is NonNullable<typeof l> => !!l);
    const hits = zonesAt(lists, at.lng, at.lat, layersAtZoom(on, map.getZoom()));
    if (!hits.length) {
      hideTip();
      return false;
    }
    // Lo que hay en ese lugar, de arriba hacia abajo, sin repetir una línea (dos autos iguales pegados).
    const lines = [...new Set(hits.map((z) => zoneLabel(z, names, common.zoneDefs)))].slice(0, 4);
    const text = lines.join("\n");
    if (text !== tipText) {
      tipText = text;
      tipBody.replaceChildren(
        ...lines.map((line) => {
          const row = document.createElement("span");
          row.textContent = line;
          return row;
        }),
      );
      tip.setContent(tipBody);
    }
    tip.setLatLng(at);
    if (!map.hasLayer(tip)) map.openTooltip(tip);
    return true;
  };
  // Sobre un sello (un punto, un escondite) manda su propia nota.
  const onMarker = (e: Leaflet.LeafletMouseEvent) =>
    e.originalEvent.target instanceof Element && !!e.originalEvent.target.closest(".leaflet-marker-icon");
  let frame = 0;
  let last: Leaflet.LeafletMouseEvent | null = null;
  // Mientras se arrastra el mapa, la nota no persigue al cursor.
  let dragging = false;
  const onDrag = (e: Leaflet.LeafletEvent) => {
    dragging = e.type === "dragstart";
    if (dragging) hideTip();
  };
  const onMove = (e: Leaflet.LeafletMouseEvent) => {
    last = e;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (!last || dragging || onMarker(last)) return hideTip();
      showZones(last.latlng);
    });
  };
  const onClick = (e: Leaflet.LeafletMouseEvent) => {
    if (!onMarker(e)) showZones(e.latlng);
  };
  map.on("mousemove", onMove);
  map.on("click", onClick);
  map.on("dragstart dragend", onDrag);
  map.on("mouseout movestart", hideTip);

  // ── Puntos de aparición ──
  const spawns = L.layerGroup([], { pane: "pzm-spawns" });
  const profName = (slug: string) => {
    const n = profNames[slug];
    return n ? n[lang === "es" ? 1 : 0] : slug;
  };
  const fallback = fallbackProf(KNOWN_PROFS);
  const list = (names: string[]) => new Intl.ListFormat(lang, { type: "conjunction" }).format(names);
  const spawnTip = (m: SpawnMark) => {
    const lines = [t.spawn.title(m.town ?? "")];
    // Las que faltan, por nombre: 40 puntos nombran 23 de las 25 y decían "todas". Hasta tres se dicen así ("todas menos
    // Médico e Ingeniero"); más, se lista lo que tiene.
    const missing = spawnMissing(m, KNOWN_PROFS);
    if (!missing.length) lines.push(t.spawn.all);
    else if (missing.length <= 3) lines.push(t.spawn.allBut(list(missing.map(profName).sort((a, b) => a.localeCompare(b, lang)))));
    else if (m.profs.length) {
      // La lista de "desempleado" es la de todas las profesiones que el pueblo no nombra: se dice así, no con el nombre.
      const names = m.profs
        .filter((s) => s !== fallback)
        .map(profName)
        .sort((a, b) => a.localeCompare(b, lang));
      const shown = names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t.spawn.more(String(names.length - 4))}` : names.join(", ");
      const rest = fallback !== null && m.profs.includes(fallback);
      lines.push(shown ? (rest ? `${shown} ${t.spawn.rest}` : shown) : t.spawn.others);
    }
    if (m.z) lines[0] += ` · ${t.spawn.floor(String(m.z))}`;
    const box = document.createElement("div");
    for (const line of lines) {
      const row = document.createElement("span");
      row.textContent = line;
      box.append(row);
    }
    return box;
  };
  // Para qué profesión están armados los sellos (`undefined`: todavía para ninguna). Prender y apagar la capa no los
  // rehace: son 421 marcadores.
  let spawnsFor: string | null | undefined;
  const buildSpawns = () => {
    spawnsFor = prof;
    spawns.clearLayers();
    for (const m of spawnMarks(common.spawns, prof, KNOWN_PROFS)) {
      const icon = document.createElement("span");
      icon.className = "pzm-mark-in pz-stamp";
      icon.style.setProperty("--stamp", `url(${stampSrc(`map_${LAYER_STAMP.apariciones}.png`)})`);
      icon.style.color = SPAWN_COLOR;
      L.marker([m.y + 0.5, m.x + 0.5], {
        icon: L.divIcon({ className: "pzm-mark pzm-spawn", html: icon, iconSize: [0, 0] }),
        pane: "pzm-spawns",
        keyboard: false,
      })
        .bindTooltip(() => spawnTip(m), { className: "pzm-tip", direction: "top", offset: [0, -12], opacity: 1 })
        .addTo(spawns);
    }
  };

  // ── Escondites ──
  // Por escondite: sus anotaciones en un grupo propio (para mostrar sólo las del abierto), el sello de lejos y la
  // anotación que lo marca, que de cerca es la que se elige con el teclado. Así hay un solo elemento enfocable por
  // escondite a cualquier zoom: de lejos el sello, de cerca esa anotación.
  interface StashMarks {
    near: Leaflet.LayerGroup;
    pin: Leaflet.Marker;
    main: Leaflet.Marker | null;
    els: HTMLElement[];
  }
  const stashFar = L.layerGroup([], { pane: "pzm-stashes" });
  const stashMarks = new Map<string, StashMarks>();
  let picked: string | null = null;
  const stashStamp = (src: string, color: string) => {
    const el = document.createElement("span");
    el.className = "pzm-mark-in pz-stamp";
    el.style.setProperty("--stamp", `url(${src})`);
    el.style.color = color;
    return el;
  };
  const clearStashes = () => {
    for (const m of stashMarks.values()) m.near.remove();
    stashFar.clearLayers();
    stashMarks.clear();
  };
  const buildStashes = () => {
    clearStashes();
    for (const s of common.stashes) {
      const els: HTMLElement[] = [];
      const near = L.layerGroup([], { pane: "pzm-stashes" });
      const open = () => opts.onStash(s.id);
      const town = s.town ?? (s.near ? t.stash.near(s.near) : "");
      const mainAt = stashMainAnnotation(s, common.stamps);
      let main: Leaflet.Marker | null = null;
      s.annotations.forEach((a, i) => {
        const m = annotationMark(a, lang, common.stamps);
        if (!m) return;
        let el: HTMLElement;
        if (m.kind === "stamp") el = stashStamp(m.src, m.color);
        else {
          // La nota va sólo acá, en el mapa: ni en un `title` ni en la hoja del escondite (hay alguna con palabrotas).
          el = document.createElement("span");
          el.className = "pzm-note";
          el.textContent = m.text;
          el.style.color = m.color;
        }
        const isMain = i === mainAt;
        const marker = L.marker([m.y, m.x], {
          icon: L.divIcon({ className: `pzm-mark pzm-ann is-${m.kind}${isMain ? " is-main" : ""}`, html: el, iconSize: [0, 0] }),
          pane: "pzm-stashes",
          keyboard: isMain,
          // El nombre que lee el lector y el teclado es el del escondite, nunca la nota.
          title: isMain ? t.stash.pin(town) : "",
        }).on("click", open);
        marker.addTo(near);
        if (isMain) main = marker;
        els.push(el);
      });
      // De lejos, un sello en el lugar: el que se elige con el teclado mientras no se ven las anotaciones.
      const pinAt = stashPin(s, common.stamps);
      const pinEl = stashStamp(pinAt.src, pinAt.color);
      const pin = L.marker([pinAt.y + 0.5, pinAt.x + 0.5], {
        icon: L.divIcon({ className: "pzm-mark pzm-stash-pin", html: pinEl, iconSize: [0, 0] }),
        pane: "pzm-stashes",
        keyboard: true,
        title: t.stash.pin(town),
        alt: t.stash.pin(town),
      })
        .on("click", () => {
          open();
          // De muy lejos no se distinguen las anotaciones: se acerca hasta verlas, con el escondite en el medio.
          if (map.getZoom() < 4) map.setView([pinAt.y, pinAt.x], 4);
        })
        .addTo(stashFar);
      els.push(pinEl);
      stashMarks.set(s.id, { near, pin, main, els });
    }
  };
  const markPicked = () => {
    stashPane.classList.toggle("has-pick", picked !== null);
    for (const [id, m] of stashMarks) for (const el of m.els) el.classList.toggle("is-picked", id === picked);
  };
  const syncStashes = () => {
    const show = on.has("escondites");
    const z = map.getZoom();
    const near = z >= STASH_NEAR;
    stashPane.style.setProperty("--pzm-k", String(STASH_K(z)));
    if (show && !stashMarks.size) buildStashes();
    const toggle = (g: Leaflet.Layer, want: boolean) => (want ? !map.hasLayer(g) && g.addTo(map) : g.remove());
    toggle(stashFar, show && !near);
    for (const [id, m] of stashMarks) {
      const ownNear = show && (near || (id === picked && z >= STASH_PICK_FROM));
      toggle(m.near, ownNear);
      // De lejos, el abierto muestra sus anotaciones pero el que se enfoca sigue siendo su sello: la anotación principal
      // sale del orden del teclado (Leaflet le pone `tabindex="0"` cada vez que la agrega).
      const el = m.main?.getElement();
      if (el) el.tabIndex = near ? 0 : -1;
    }
    markPicked();
  };
  map.on("zoomend", syncStashes);

  return {
    setLayers(next, nextProf) {
      on = new Set(next);
      prof = nextProf;
      syncZones();
      // Las teselas no dependen de la base ni del idioma; sólo cambia cómo se mezcla (`blendHeat`).
      syncHeat();
      if (on.has("apariciones")) {
        if (spawnsFor !== prof) buildSpawns();
        if (!map.hasLayer(spawns)) spawns.addTo(map);
      } else spawns.remove();
      syncStashes();
    },
    setLang(next) {
      if (next === lang) return;
      lang = next;
      t = MAP_COPY[lang];
      names = ZONE_NAMES[lang];
      hideTip();
      if (zones) syncZones();
      // Las notas de los escondites cambian de idioma; los sellos de lejos, de título.
      if (stashMarks.size) {
        buildStashes();
        syncStashes();
      }
    },
    setBase(next) {
      if (next === base) return;
      base = next;
      blendHeat();
      if (zones) syncZones();
    },
    pickStash(id) {
      picked = id;
      syncStashes();
    },
    destroy() {
      heat?.remove();
      cancelAnimationFrame(frame);
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.off("dragstart dragend", onDrag);
      map.off("mouseout movestart", hideTip);
      map.off("zoomend", syncStashes);
    },
  };
}
