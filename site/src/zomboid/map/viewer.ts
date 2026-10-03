/**
 * El visor del Mapa de Project Zomboid (2026-09-30): Leaflet con las dos bases, los nombres, las capas del juego
 * (`overlays.ts`, Task 3), los edificios (Task 4: al tocar uno se busca en `bld/<región>.json` y se dibuja su planta) y
 * los eventos que la página necesita (dónde quedó el mapa, qué casilla está bajo el cursor, qué escondite o qué edificio
 * tocaron).
 *
 * Es el único archivo que importa Leaflet y su CSS, y la página lo pide con `import()` recién al montarse: Leaflet toca
 * `window` y `document` al cargarse, así que no puede entrar al prerender ni a los tests, y así viaja en su propio chunk
 * (`leaflet`, ver `manualChunks` en `vite.config.ts`) que sólo baja quien abre el Mapa.
 *
 * Coordenadas: CRS simple con `Transformation(1/16, 0, 1/16, 0)`, así `latLng(y, x)` es la casilla (x, y) del mundo y
 * el zoom 4 es un píxel por casilla, como las teselas de `map.py` (ver `games/zomboid/data/map/tiles.json`). La y crece
 * hacia el sur, igual que en el juego.
 */
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import tiles from "@zomboid/map/tiles.json";
import type { Lang } from "../../i18n";
import type { MapCommon } from "./data";
import { labelKind, labelSize, labelText, labelVisible, STREET_THEME, streetLabels, streetLayer } from "./labels";
import { mountOverlays } from "./overlays";
import { paperLayer, regionsIn } from "./paper";
import { loadBuildings, loadRegion } from "./regionData";
import { buildingAt, buildingCell, defaultFloor, rectsOf, shiftIntoView, type Building, type Inset } from "./buildings";
import { BUILDING_FROM, MAP_H, MAP_W, MAX_ZOOM, MIN_ZOOM, type LayerId, type MapBase } from "./url";

export interface ViewerOptions {
  el: HTMLElement;
  common: MapCommon;
  view: { x: number; y: number; z: number };
  base: MapBase;
  lang: Lang;
  zoomIn: string;
  zoomOut: string;
  /** Al terminar de mover o de hacer zoom: el centro (en casillas) y el zoom. */
  onMove: (view: { x: number; y: number; z: number }) => void;
  /** La casilla bajo el cursor, o `null` si salió del mapa o del mundo. */
  onPointer: (at: { x: number; y: number } | null) => void;
  /** Tocaron un escondite (su id): la página abre su hoja. */
  onStash: (id: string) => void;
  /** Tocaron el mapa (o Enter con el mapa enfocado) desde `BUILDING_FROM`: el edificio de ahí, o `null` si no hay. */
  onBuilding: (b: Building | null) => void;
  /** Lo que tapa la hoja del edificio abierta, medido en el momento (cambia con el tamaño de la hoja y de la pantalla); sin hoja, todo en cero. */
  inset: () => Inset;
  /** La base terminó de cargar sus primeras teselas (o pasó `LOAD_FALLBACK_MS` sin noticias): la página ya puede sacar la vista del mapa entero que tapaba el visor. Una sola vez. */
  onLoad: () => void;
}

export interface Viewer {
  setBase: (base: MapBase) => void;
  setLang: (lang: Lang) => void;
  /** Los textos de los botones de zoom (Leaflet los escribe una sola vez, al crearlos): para cuando cambia el idioma. */
  setZoomTitles: (zoomIn: string, zoomOut: string) => void;
  /** Las capas del juego prendidas y la profesión de los puntos de aparición (`null`, todas). */
  setLayers: (layers: readonly LayerId[], prof: string | null) => void;
  /** Marca el escondite de la hoja abierta; `null` al cerrarla. */
  pickStash: (id: string | null) => void;
  /** El edificio de una casilla (pide el archivo de su región si hace falta). */
  buildingAt: (x: number, y: number) => Promise<Building | null>;
  /** Un edificio por su id (el de `edificio=` en la dirección). */
  findBuilding: (id: string) => Promise<Building | null>;
  /**
   * Dibuja la planta de un piso del edificio abierto; `null` la borra. Con `reveal`, si el edificio no se ve entero, el
   * mapa va hasta él (y lo deja a la vista, no abajo de la hoja).
   */
  showBuilding: (b: Building | null, floor: string, reveal?: boolean) => void;
  /** Marca una habitación (sus rectángulos) sobre la planta; `null` la desmarca. Sólo toca esa capa: la planta no se redibuja. */
  markRoom: (rects: readonly number[][] | null) => void;
  /**
   * Corre el mapa lo justo para que el edificio quede entero en lo que la hoja deja libre. Si el mapa está volando (el
   * buscador), espera a que llegue: correrlo en el medio cortaría el vuelo.
   */
  keepInView: (b: Building) => void;
  /** Lleva el mapa a una casilla con un zoom (el buscador). */
  flyTo: (x: number, y: number, z: number) => void;
  destroy: () => void;
}

const CRS: L.CRS = L.Util.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1 / 16, 0, 1 / 16, 0) });

/** Una caja `[x1, y1, x2, y2]` en casillas, como límites de Leaflet. */
const box = ([x1, y1, x2, y2]: number[]) => L.latLngBounds([y1, x1], [y2, x2]);

/** Desde este zoom la tesela satelital se estira más allá de un píxel por casilla: se ve en píxeles, como el juego. */
const NATIVE = 4;
/** Al ir hasta un edificio (un link con `edificio=`), por lo menos este zoom: se ven sus cuartos. */
const BUILDING_ZOOM = 4.5;
/** Si ninguna capa avisa que cargó (Leaflet no dispara `load` cuando no hay teselas que pedir), a los 8 s la vista del mapa entero se va igual. */
const LOAD_FALLBACK_MS = 8000;

export function mountViewer(opts: ViewerOptions): Viewer {
  const { el, common } = opts;
  // Después de `destroy` no se avisa nada: una animación que termina tarde movería la dirección de otra página.
  let dead = false;
  const world = box([0, 0, MAP_W, MAP_H]);
  const map = L.map(el, {
    crs: CRS,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    // De a cuartos: la rueda y el pellizco acercan suave, sin saltos de a un nivel entero.
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 110,
    // El crédito de The Indie Stone ya va en el pie de la sección, y la marca de Leaflet no aporta en la libreta.
    attributionControl: false,
    zoomControl: false,
    maxBounds: world.pad(0.15),
    maxBoundsViscosity: 0.9,
    keyboardPanDelta: 120,
  });
  // Lo que hay que deshacer si el montaje se corta a la mitad (o en `destroy`).
  let fallback: number | undefined;
  let resize: ResizeObserver | null = null;
  // Si algo tira a mitad del montaje (una capa, los datos), no queda un mapa de Leaflet huérfano en el contenedor ni el
  // reloj de 8 s dando vueltas: se desarma acá y el error sigue hasta la página, que muestra "Reintentar". El reintento
  // monta otro mapa en el mismo contenedor, y Leaflet no deja si el anterior no se sacó.
  try {
    L.control.zoom({ position: "topleft", zoomInTitle: opts.zoomIn, zoomOutTitle: opts.zoomOut }).addTo(map);
    // Leaflet escribe el `title` y el `aria-label` de cada botón al crearlo y no los vuelve a mirar.
    const setZoomTitles = (zoomIn: string, zoomOut: string) => {
      for (const [cls, title] of [["in", zoomIn], ["out", zoomOut]] as const) {
        const a = el.querySelector(`.leaflet-control-zoom-${cls}`);
        a?.setAttribute("title", title);
        a?.setAttribute("aria-label", title);
      }
    };
    map.setView([opts.view.y, opts.view.x], opts.view.z, { animate: false });

    // Lo más lejos que se puede ir es hasta ver el mundo entero en el contenedor (en un celular, por debajo del zoom 0).
    const fitMin = () => map.setMinZoom(Math.max(MIN_ZOOM, Math.min(0, Math.floor(map.getBoundsZoom(world) * 4) / 4)));
    fitMin();

    // Los nombres van en capas propias y sin atajar el mouse (arrastrar sobre un nombre mueve el mapa). Las calles, arriba
    // de las teselas y de las zonas (405); los pueblos y lugares, arriba también de los sellos de las capas del juego
    // (puntos de aparición 610, escondites 620) y abajo de las notas de Leaflet (650): un pueblo lleno de sellos tapaba
    // su propio nombre. Como no atajan el mouse, los sellos de abajo se siguen tocando.
    // La planta del edificio abierto, arriba de las zonas de las capas (400) y abajo de las calles.
    for (const [name, z] of [["pzm-bld", 415], ["pzm-streets", 420], ["pzm-labels", 640]] as const) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = "none";
    }

    const sat = L.tileLayer(tiles.sat.url, {
      tileSize: tiles.tileSize,
      minNativeZoom: tiles.sat.minZoom,
      maxNativeZoom: tiles.sat.maxNativeZoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: box(tiles.sat.bounds),
      noWrap: true,
      className: "pzm-sat",
      keepBuffer: 3,
    });
    // La base de papel: el color del papel es el fondo del contenedor (`is-paper` en el CSS), encima la mancha del
    // bosque y encima el dibujo.
    const forest = L.tileLayer(tiles.forest.url, {
      tileSize: tiles.tileSize,
      minNativeZoom: tiles.forest.minZoom,
      maxNativeZoom: tiles.forest.maxNativeZoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: box(tiles.forest.bounds),
      noWrap: true,
      className: "pzm-forest",
      zIndex: 1,
    });
    const paper = paperLayer(L, {
      style: common.style,
      regions: common.regions,
      load: loadRegion,
      bounds: world,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    paper.setZIndex(2);
    // La página tapa el visor con la vista del mapa entero hasta que la base pinta algo: la primera de las dos capas de la
    // base en avisar (`load` es "las teselas que se ven ya llegaron"). Va antes de `setBase`, que es quien las pone a cargar.
    let loaded = false;
    const loadedOnce = () => {
      if (loaded || dead) return;
      loaded = true;
      window.clearTimeout(fallback);
      opts.onLoad();
    };
    fallback = window.setTimeout(loadedOnce, LOAD_FALLBACK_MS);
    sat.on("load", loadedOnce);
    paper.on("load", loadedOnce);
    const paperBase = L.layerGroup([forest, paper]);
    const [r, g, b] = common.style.background;
    el.style.setProperty("--pzm-paper-bg", `rgb(${r},${g},${b})`);

    const streets = streetLayer(L, {
      labels: streetLabels(common.streets),
      theme: STREET_THEME[opts.base],
      bounds: world,
      maxZoom: MAX_ZOOM,
    }).addTo(map);
    // Las calles van en canvas: si se escriben antes de que llegue la letra de la libreta, salen con la del sistema.
    document.fonts?.load('600 12px "Noto Sans"').then(() => streets.redraw(), () => undefined);

    // Las capas del juego (zonas, puntos de aparición, escondites): arriba de la base y abajo de los nombres.
    const overlays = mountOverlays({
      L,
      map,
      common,
      lang: opts.lang,
      base: opts.base,
      bounds: world,
      maxZoom: MAX_ZOOM,
      onStash: (id) => !dead && opts.onStash(id),
    });

    let base: MapBase | null = null;
    const setBase = (next: MapBase) => {
      if (next === base) return;
      base = next;
      overlays.setBase(next);
      if (next === "paper") {
        sat.remove();
        paperBase.addTo(map);
      } else {
        paperBase.remove();
        sat.addTo(map);
      }
      el.classList.toggle("is-paper", next === "paper");
      streets.options.theme = STREET_THEME[next];
      streets.redraw();
    };
    setBase(opts.base);

    // Los textos del mapa: un marcador con texto de verdad cada uno. Se rehacen al cambiar de idioma.
    const labels = L.layerGroup([], { pane: "pzm-labels" }).addTo(map);
    const shown: { label: MapCommon["labels"][number]; marker: L.Marker }[] = [];
    const buildLabels = (lang: Lang) => {
      labels.clearLayers();
      shown.length = 0;
      for (const label of common.labels) {
        const text = document.createElement("span");
        text.textContent = labelText(label, lang);
        text.style.fontSize = `${labelSize(label)}px`;
        if (label.rotation) text.style.setProperty("--pzm-rot", `${-label.rotation}deg`);
        const marker = L.marker([label.y, label.x], {
          icon: L.divIcon({ className: `pzm-label is-${labelKind(label.layer)}`, html: text, iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
          pane: "pzm-labels",
        });
        labels.addLayer(marker);
        shown.push({ label, marker });
      }
      showLabels();
    };
    const showLabels = () => {
      const z = map.getZoom();
      for (const { label, marker } of shown) {
        const node = marker.getElement();
        if (node) node.style.display = labelVisible(label, z) ? "" : "none";
      }
    };
    buildLabels(opts.lang);

    const near = () => el.classList.toggle("is-near", map.getZoom() > NATIVE);
    near();
    map.on("zoomend", () => {
      showLabels();
      near();
    });
    map.on("moveend", () => {
      if (dead) return;
      const c = map.getCenter();
      opts.onMove({ x: c.lng, y: c.lat, z: map.getZoom() });
    });

    // ── Los edificios (Task 4) ──
    // La planta: relleno del lápiz de la libreta y las paredes de cada cuarto en el color del papel. Sólo lápiz no se
    // leía sobre el satélite, donde los techos son rojizos; con las líneas claras se ve el edificio y cómo se divide.
    const pencil = getComputedStyle(el).getPropertyValue("--pz-pencil").trim() || "#b3261e";
    const paperInk = getComputedStyle(el).getPropertyValue("--pz-paper").trim() || "#efe9d8";
    const plan = L.layerGroup([], { pane: "pzm-bld" }).addTo(map);
    // La habitación marcada va en su propia capa: pasar el mouse por las filas de la hoja la rehace a ella sola. Si fuera
    // la misma de la planta, cada `mouseenter` borraba y volvía a dibujar todos los cuartos del piso (cientos de `path` en
    // los edificios grandes de Louisville).
    const hot = L.layerGroup([], { pane: "pzm-bld" }).addTo(map);
    const rect = ([x, y, w, h]: readonly number[], strong: boolean) =>
      L.rectangle(box([x, y, x + w, y + h]), {
        pane: "pzm-bld",
        interactive: false,
        color: paperInk,
        weight: strong ? 2.5 : 1.5,
        opacity: 0.95,
        fillColor: pencil,
        fillOpacity: strong ? 0.7 : 0.4,
      });
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // El edificio abierto en pantalla, con la caja de la hoja de por medio: su caja del mundo, en límites de Leaflet. La
    // del dato es semiabierta (x2 es el último cuarto más su ancho) pero acá se toma +1, de más: no hace daño.
    const whereOf = (b: Building) => {
      const [x1, y1, x2, y2] = b.box;
      return box([x1, y1, x2 + 1, y2 + 1]);
    };
    /**
     * Corre el mapa para que `b` quede entero en lo que la hoja no tapa. El centro del mapa es justo donde llega el
     * edificio del buscador o de un link, y en el celular la hoja cubre de ahí para abajo: sin esto, lo que se pedía
     * ver quedaba abajo de la hoja.
     */
    const settle = (b: Building, animate: boolean) => {
      const where = whereOf(b);
      // Con este CRS la y (la latitud) crece hacia el sur de la pantalla: `getNorthWest` es la esquina de abajo a la
      // izquierda. Por eso se toma el mínimo y el máximo de las dos esquinas y no se confía en cuál es cuál.
      const a = map.latLngToContainerPoint(where.getSouthWest());
      const c = map.latLngToContainerPoint(where.getNorthEast());
      const size = map.getSize();
      const px = { left: Math.min(a.x, c.x), top: Math.min(a.y, c.y), right: Math.max(a.x, c.x), bottom: Math.max(a.y, c.y) };
      const [dx, dy] = shiftIntoView(px, { width: size.x, height: size.y }, opts.inset());
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) map.panBy([dx, dy], { animate: animate && !reduced });
    };
    // Mientras el buscador vuela, el edificio que hay que acomodar espera acá hasta el `moveend` del vuelo. Un arrastre
    // lo cancela: si la persona agarró el mapa, no se lo vuelve a mover.
    let flying = false;
    let waiting: Building | null = null;
    map.on("dragstart", () => {
      flying = false;
      waiting = null;
    });
    // Terminó el vuelo del buscador: recién ahora se puede sacar el edificio de abajo de la hoja.
    map.on("moveend", () => {
      if (dead || !flying) return;
      flying = false;
      const b = waiting;
      waiting = null;
      if (b) settle(b, true);
    });
    const keepInView: Viewer["keepInView"] = (b) => {
      if (flying) waiting = b;
      else settle(b, true);
    };
    const showBuilding: Viewer["showBuilding"] = (b, floor, reveal) => {
      plan.clearLayers();
      if (!b) return;
      // El mismo piso que muestra la hoja: si el edificio no tiene el pedido (un depto que sólo tiene piso 1), el de
      // siempre.
      const f = b.floors[floor] ? floor : defaultFloor(b);
      for (const r of b.floors[f] ?? []) for (const rc of rectsOf(r)) plan.addLayer(rect(rc, false));
      // Si no se ve entero, o se ve tan de lejos que es un punto (un link con `edificio=` y sin lugar abre en el pueblo).
      // Sin animación: es un link que recién se abre. Después `settle` lo saca de abajo de la hoja (si ya está montada;
      // si no, la hoja lo pide al montarse).
      if (reveal) {
        const where = whereOf(b);
        if (map.getZoom() < BUILDING_FROM || !map.getBounds().contains(where))
          map.setView(where.getCenter(), Math.max(map.getZoom(), BUILDING_ZOOM), { animate: false });
        settle(b, false);
      }
    };
    const markRoom: Viewer["markRoom"] = (rects) => {
      hot.clearLayers();
      for (const rc of rects ?? []) hot.addLayer(rect(rc, true));
    };
    const buildingHere = async (x: number, y: number) => {
      const ids = regionsIn({ x0: x, y0: y, x1: x + 1, y1: y + 1 }, common.regions, "bld");
      return buildingAt(await Promise.all(ids.map(loadBuildings)), x, y);
    };
    const findBuilding = async (id: string) => {
      const cell = buildingCell(id);
      if (!cell) return null;
      const [x0, y0, x1, y1] = cell;
      for (const rid of regionsIn({ x0, y0, x1, y1 }, common.regions, "bld")) {
        const hit = (await loadBuildings(rid)).find((b) => b.id === id);
        if (hit) return hit;
      }
      return null;
    };
    // El último toque manda: si el archivo de la región tarda y mientras se toca otro edificio, el primero no pisa al
    // segundo al llegar.
    let pickSeq = 0;
    const pickAt = (x: number, y: number) => {
      const seq = ++pickSeq;
      buildingHere(x, y).then(
        (b) => !dead && seq === pickSeq && opts.onBuilding(b),
        () => undefined,
      );
    };
    map.on("click", (e: L.LeafletMouseEvent) => {
      // Un sello (un punto, un escondite) tiene su propio clic.
      const target = e.originalEvent.target;
      if (dead || map.getZoom() < BUILDING_FROM || (target instanceof Element && target.closest(".leaflet-marker-icon"))) return;
      pickAt(Math.floor(e.latlng.lng), Math.floor(e.latlng.lat));
    });
    // Con el teclado: Enter con el mapa enfocado abre el edificio del centro (las flechas lo mueven, +/− acercan).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.target !== el || map.getZoom() < BUILDING_FROM) return;
      e.preventDefault();
      const c = map.getCenter();
      pickAt(Math.floor(c.lng), Math.floor(c.lat));
    };
    el.addEventListener("keydown", onKey);
    const flyTo = (x: number, y: number, z: number) => {
      waiting = null;
      if (reduced) map.setView([y, x], z, { animate: false });
      else {
        flying = true;
        map.flyTo([y, x], z, { duration: 0.8 });
      }
    };

    // La casilla bajo el cursor, una vez por cuadro: `mousemove` llega mucho más seguido de lo que se ve.
    let frame = 0;
    let last: L.LatLng | null = null;
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      last = e.latlng;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (dead) return;
        const p = last;
        opts.onPointer(p && world.contains(p) ? { x: Math.floor(p.lng), y: Math.floor(p.lat) } : null);
      });
    });
    map.on("mouseout", () => {
      last = null;
      opts.onPointer(null);
    });

    // El contenedor cambia de tamaño sin que cambie la ventana (el panel del celular, la barra que baja): Leaflet tiene
    // que volver a medirlo, o quedan franjas sin teselas.
    resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      map.invalidateSize();
      fitMin();
    });
    resize?.observe(el);

    return {
      setBase,
      setLang: (lang) => {
        buildLabels(lang);
        overlays.setLang(lang);
      },
      setZoomTitles,
      setLayers: overlays.setLayers,
      pickStash: overlays.pickStash,
      buildingAt: buildingHere,
      findBuilding,
      showBuilding,
      markRoom,
      keepInView,
      flyTo,
      destroy: () => {
        dead = true;
        el.removeEventListener("keydown", onKey);
        window.clearTimeout(fallback);
        cancelAnimationFrame(frame);
        overlays.destroy();
        resize?.disconnect();
        // Leaflet 1.9 deja programados dos relojes que `remove()` no cancela: el zoom pendiente de la rueda (junta los
        // giros de 40 ms) y el fin de la animación de zoom (250 ms). Si la página se cierra justo después de girar la
        // rueda, corren sobre un mapa sin panes y tiran "Cannot read properties of undefined (reading '_leaflet_pos')".
        // Se cancela el primero y el segundo sale sin hacer nada si no hay animación en curso.
        // Con `?.`: si una versión nueva de Leaflet no trae el manejador de la rueda (o lo llama de otra forma), esto no tira
        // antes de `map.remove()`. `zomboidMap.test.ts` vigila que los dos nombres sigan en Leaflet.
        const leaflet = map as unknown as { _animatingZoom?: boolean; scrollWheelZoom?: { _timer?: number } };
        window.clearTimeout(leaflet.scrollWheelZoom?._timer);
        leaflet._animatingZoom = false;
        map.remove();
      },
    };
  } catch (e) {
    dead = true;
    window.clearTimeout(fallback);
    resize?.disconnect();
    map.remove();
    throw e;
  }
}
