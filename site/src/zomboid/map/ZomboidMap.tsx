/**
 * La pestaña Mapa de Project Zomboid (2026-09-30): `/en/project-zomboid/map`, `/es/project-zomboid/mapa`. Knox County
 * entero en una hoja grande pegada con cinta, con dos bases (la vista satelital y el mapa de papel con los colores del
 * juego), los nombres de pueblos y calles, y un link para cualquier lugar. Diseño: docs/design/2026-09-30-zomboid.md;
 * plan: docs/superpowers/plans/2026-09-30-zomboid-mapa.md (Task 2).
 *
 * **Servidor y navegador.** Leaflet no corre en el prerender: el HTML trae la hoja de introducción (con las cifras de
 * `map/meta.json`, 200 bytes) y la vista del mapa entero como imagen, que es lo que lee Google. Al montarse, la página
 * pide el visor (`viewer.ts`, con Leaflet, en su chunk) y `common.json`, y el mapa se despliega encima de la imagen.
 * Nada del render depende de la dirección (`?x=&y=`), que el servidor no conoce: la hidratación coincide siempre.
 *
 * **La dirección** la lleva `url.ts`: se lee al montar (acepta los formatos de la comunidad y los pasa al nuestro) y se
 * reescribe con `history.replaceState` al terminar cada movimiento, sin recargar ni sumar pasos al Atrás.
 *
 * **Las capas del juego** (Task 3): la hoja "Capas" del costado (`Legend.tsx`) las prende y las apaga, quedan en
 * `capas=` (y la profesión de los puntos de aparición en `profesion=`), y el visor las dibuja (`overlays.ts`). Al tocar
 * un escondite se abre su hoja sobre el mapa (`StashCard.tsx`).
 *
 * **Los edificios y el buscador** (Task 4): al tocar un edificio (o Enter con el mapa enfocado) se abre su hoja
 * (`BuildingSheet.tsx`, que llega con `lazy()` porque trae las tablas de habitaciones) y queda en `edificio=`. El
 * buscador (`MapSearch.tsx`) va arriba de la hoja del mapa y lleva el mapa hasta lo elegido.
 */
import mapMeta from "@zomboid/map/meta.json";
import meta from "@zomboid/meta.json";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import { parseRoute, type Route } from "../../route";
import { copyText } from "../ui";
import { useMapCopy, type PaperKind } from "./copy";
import { loadCommon, type MapCommon } from "./data";
import Legend from "./Legend";
import MapSearch from "./MapSearch";
import { sheetInset, type Building } from "./buildings";
import type { SearchHit } from "./search";
import StashCard from "./StashCard";
import { BUILDING_FROM, DEFAULT_VIEW, mergeMapQuery, readMapUrl, writeMapUrl, type LayerId, type MapBase, type MapState } from "./url";
import type { Viewer } from "./viewer";
import "../../styles/zomboid-map.css";

type Nav = (r: Route) => void;

/** Los tipos de edificio de la clave del mapa de papel, en el orden de la leyenda del juego. */
const PAPER_KINDS: PaperKind[] = [
  "Residential",
  "RetailAndCommercial",
  "RestaurantsAndEntertainment",
  "Hospitality",
  "Medical",
  "CommunityServices",
  "Industrial",
];
/** El tamaño de `overview.webp` (lo escribe `map.py`): el `<img>` lo declara para no correr la página al llegar. */
const OVERVIEW = { src: "/zomboid/map/overview.webp", width: 1238, height: 981 };

type Status = "idle" | "loading" | "ready" | "failed";
/** La vista del mapa entero tapa el visor hasta que la base carga sus primeras teselas (`wait`), se desvanece (`fade`) y se va (`done`). */
type Cover = "wait" | "fade" | "done";
/** Lo que dura el desvanecimiento (el CSS de `.pzm-overview.is-gone`): las teselas de Leaflet todavía se están mostrando. */
const FADE_MS = 350;

/**
 * El visor (con Leaflet) y `common.json`, pedidos juntos. En el navegador empiezan a bajar apenas llega este chunk: al
 * entrar directo, `main.tsx` lo trae antes de hidratar, y al pasar el mouse por la solapa, `RouteLink` también. Si se
 * esperaba al montaje, el mapa tardaba un viaje más en aparecer. No en el servidor ni en los tests: Leaflet toca
 * `window` al cargarse. `import()` y `loadCommon` piden una sola vez, así que el montaje reusa lo que ya está en camino.
 */
const loadViewer = () => Promise.all([import("./viewer"), loadCommon()]);
if (typeof window !== "undefined") loadViewer().catch(() => undefined);

/**
 * La hoja del edificio, en su chunk (con `rooms.ts`). No se baja al entrar: mucha gente mira el mapa de lejos y nunca toca
 * un edificio. Se pide la primera vez que el zoom llega a `BUILDING_FROM` (desde donde un toque busca edificios), o antes
 * si hace falta (un link con `edificio=`, el buscador); `import()` pide una sola vez.
 */
const loadSheet = () => import("./BuildingSheet");
const BuildingSheet = lazy(loadSheet);

/** Un nombre sin espacios ni signos, para comparar el del buscador ("Knox Bank") con el del juego ("KnoxBank"). */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Recibe la ruta y `navigate` como toda pestaña: la hoja de un escondite enlaza a la ficha de su mapa. */
export default function ZomboidMap({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useMapCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);

  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const [cover, setCover] = useState<Cover>("wait");
  // La base arranca en satélite en el servidor y en el primer render del navegador (la hidratación tiene que coincidir);
  // la de la dirección llega en el efecto.
  const [base, setBase] = useState<MapBase>(DEFAULT_VIEW.base);
  const [common, setCommon] = useState<MapCommon | null>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState(false);
  // Las capas y la profesión arrancan vacías por lo mismo que la base; el escondite abierto, ninguno.
  const [layers, setLayers] = useState<LayerId[]>(DEFAULT_VIEW.layers);
  const [prof, setProf] = useState<string | null>(DEFAULT_VIEW.prof);
  const [stashId, setStashId] = useState<string | null>(null);
  // El edificio con la hoja abierta, el piso que se ve (si el edificio no tiene ese piso, la hoja y la planta muestran
  // el de siempre, ver `defaultFloor`) y la habitación bajo el mouse (sus rectángulos).
  const [building, setBuilding] = useState<Building | null>(null);
  const [floor, setFloor] = useState("0");
  const [roomRects, setRoomRects] = useState<number[][] | null>(null);
  // El zoom de las teselas (redondeado, como lo elige Leaflet), para que la leyenda avise qué capas todavía no se ven.
  // Redondeado para no volver a dibujar la página en cada cuarto de zoom.
  const [tileZoom, setTileZoom] = useState(Math.round(DEFAULT_VIEW.z));

  const mapEl = useRef<HTMLDivElement>(null);
  const coordsEl = useRef<HTMLSpanElement>(null);
  const whereEl = useRef<HTMLSpanElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const state = useRef<MapState>(DEFAULT_VIEW);
  const copyTimer = useRef<number | undefined>(undefined);
  const sheetEl = useRef<HTMLElement>(null);
  // A dónde vuelve el foco al cerrar la hoja del edificio (el mapa o el buscador), y si el próximo dibujo de la planta
  // tiene que llevar el mapa hasta el edificio (un link con `edificio=`).
  const returnFocus = useRef<HTMLElement | null>(null);
  const revealNext = useRef(false);
  const pendingPick = useRef<SearchHit | null>(null);
  const buildingRef = useRef<Building | null>(null);
  buildingRef.current = building;
  // Lo último que dijo la nota a mano, para volver a escribirla al cambiar de idioma sin esperar a que se mueva el mouse.
  const lastNote = useRef<[number, number, boolean]>([DEFAULT_VIEW.x, DEFAULT_VIEW.y, false]);
  // Los textos y el idioma que usa el visor, al día aunque se cambie de idioma con el mapa abierto (o mientras llega).
  const copyRef = useRef(t);
  copyRef.current = t;
  const langRef = useRef(lang);
  langRef.current = lang;

  /** La nota a mano: la casilla bajo el cursor o, si no hay cursor (un dedo, el teclado), la del centro. */
  const note = (x: number, y: number, under: boolean) => {
    lastNote.current = [x, y, under];
    if (coordsEl.current) coordsEl.current.textContent = copyRef.current.coords(String(x), String(y));
    if (whereEl.current) whereEl.current.textContent = under ? copyRef.current.place.cursor : copyRef.current.place.center;
  };
  /**
   * Escribe el lugar en la dirección, si la dirección sigue siendo la del Mapa: al irse a otra página, el navegador ya
   * cambió la dirección antes de que el mapa se desmonte, y un movimiento que termina en ese medio no puede dejarle
   * `?x=&y=` a la portada. Por la ruta y no por el texto: al cambiar de idioma cambia la dirección y sigue siendo el Mapa.
   */
  const writeUrl = () => {
    if (parseRoute(window.location.pathname).pzSection !== "map") return;
    // Lo que no es del mapa (`?utm_source=`, `?ref=`) queda en la dirección.
    window.history.replaceState(window.history.state, "", window.location.pathname + mergeMapQuery(window.location.search, state.current));
  };

  /**
   * Abre la hoja de un edificio (o la cierra con `null`). Una hoja a la vez: abrir un edificio cierra la del escondite.
   * El foco se guarda para devolverlo al cerrar, salvo que ya esté adentro de la hoja (se tocó otro edificio con ella
   * abierta). Sólo toca refs y setters: el visor la llama desde sus eventos, con la página de cualquier render.
   */
  const openBuilding = (b: Building | null) => {
    if (b) {
      const active = document.activeElement;
      // Si no había nada enfocado (el `<body>`: la hoja se abrió desde un link), el foco vuelve al mapa.
      if (active instanceof HTMLElement && active !== document.body && !sheetEl.current?.contains(active)) returnFocus.current = active;
      setStashId(null);
      if (buildingRef.current?.id !== b.id) setFloor("0");
      // El mismo edificio con la hoja abierta: nada cambia en React, así que ningún efecto lo vuelve a acomodar. Si se
      // movió el mapa y quedó a medias bajo la hoja, se lo vuelve a meter en lo libre.
      else viewer.current?.keepInView(b);
    }
    // Cerrada la hoja, el foco guardado ya no vale: si no, la próxima que se abra desde un link (con el foco en el `<body>`)
    // se lo devolvería a un elemento de hace rato.
    else returnFocus.current = null;
    buildingRef.current = b;
    setBuilding(b);
    setRoomRects(null);
    state.current = { ...state.current, building: b?.id ?? null };
    writeUrl();
  };
  const closeBuilding = () => {
    // Antes de `openBuilding(null)`, que borra el foco guardado.
    const back = returnFocus.current;
    openBuilding(null);
    (back?.isConnected ? back : mapEl.current)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const fromUrl = readMapUrl(window.location.search, window.location.hash);
    state.current = fromUrl ?? DEFAULT_VIEW;
    setBase(state.current.base);
    setLayers(state.current.layers);
    setProf(state.current.prof);
    setTileZoom(Math.round(state.current.z));
    // Un link de otro visor (el hash, `?zoom=`) o con números fuera del mundo queda escrito en el nuestro.
    if (fromUrl) writeUrl();
    note(state.current.x, state.current.y, false);

    let alive = true;
    let mounted: Viewer | null = null;
    setStatus("loading");
    setCover("wait");
    // `.then(ok).catch(fallo)` y no `.then(ok, fallo)`: lo que tire `ok` (el montaje del visor, un estado) también es un
    // fallo, y si no, el cartel "Desplegando…" quedaría para siempre sin botón para reintentar.
    loadViewer()
      .then(([m, data]) => {
        if (!alive) return;
        mounted = m.mountViewer({
          el,
          common: data,
          view: state.current,
          base: state.current.base,
          lang: langRef.current,
          zoomIn: copyRef.current.zoomIn,
          zoomOut: copyRef.current.zoomOut,
          inset: () => sheetInset(sheetEl.current?.getBoundingClientRect() ?? null, el.getBoundingClientRect()),
          onMove: ({ x, y, z }) => {
            state.current = { ...state.current, x, y, z };
            if (z >= BUILDING_FROM) loadSheet().catch(() => undefined);
            setTileZoom(Math.round(z));
            writeUrl();
            note(Math.round(x), Math.round(y), false);
          },
          onPointer: (at) => (at ? note(at.x, at.y, true) : note(Math.round(state.current.x), Math.round(state.current.y), false)),
          onStash: (id) => {
            openBuilding(null);
            setStashId(id);
          },
          onBuilding: openBuilding,
          onLoad: () => setCover("fade"),
        });
        viewer.current = mounted;
        setCommon(data);
        setStatus("ready");
        if (state.current.z >= BUILDING_FROM || state.current.building) loadSheet().catch(() => undefined);
        // Un link con `edificio=`: se busca y se abre, y el mapa va hasta él. Si ya no existe (un parche lo sacó), se
        // borra de la dirección.
        const wanted = state.current.building;
        if (wanted)
          mounted.findBuilding(wanted).then(
            (b) => {
              if (!alive) return;
              revealNext.current = true;
              openBuilding(b);
            },
            () => undefined,
          );
      })
      .catch(() => {
        if (!alive) return;
        // Si el visor llegó a montarse antes del error, se desarma acá (y no se vuelve a desarmar al irse: `remove()` dos
        // veces tira).
        mounted?.destroy();
        mounted = null;
        viewer.current = null;
        setStatus("failed");
      });
    return () => {
      alive = false;
      mounted?.destroy();
      viewer.current = null;
    };
    // Se monta una vez (y otra si se reintenta): el idioma y la base se le pasan al visor por su lado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Al cambiar de idioma se escribe de nuevo lo que no vuelve a pasar por React: los textos del mapa y de las capas, los
  // botones de zoom de Leaflet y la nota de las coordenadas ("centro" / "center"), que espera al próximo movimiento.
  useEffect(() => {
    viewer.current?.setLang(lang);
    viewer.current?.setZoomTitles(copyRef.current.zoomIn, copyRef.current.zoomOut);
    note(...lastNote.current);
    // `note` sólo toca refs: no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  // La vista del mapa entero se va con un desvanecimiento: apenas carga la base se marca, y un rato después se saca.
  useEffect(() => {
    if (cover !== "fade") return;
    const id = window.setTimeout(() => setCover("done"), FADE_MS);
    return () => window.clearTimeout(id);
  }, [cover]);
  // Girar el celular o cambiar el tamaño de la ventana cambia lo que la hoja deja libre: mientras haya un edificio abierto
  // se lo vuelve a acomodar, una vez que se terminó de mover (un resize dispara decenas de eventos por segundo). Sólo si
  // cambió el ancho: en el celular el alto cambia solo cuando aparece o se esconde la barra del navegador o el teclado,
  // y ahí el refit deshacía un paneo hecho a propósito.
  const bldOpen = !!building;
  useEffect(() => {
    if (!bldOpen) return;
    let timer: number | undefined;
    let width = window.innerWidth;
    const refit = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const b = buildingRef.current;
        if (b) viewer.current?.keepInView(b);
      }, 200);
    };
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", refit);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", refit);
      window.removeEventListener("orientationchange", refit);
    };
  }, [bldOpen]);
  useEffect(() => viewer.current?.setBase(base), [base, status]);
  useEffect(() => viewer.current?.setLayers(layers, prof), [layers, prof, status]);
  useEffect(() => viewer.current?.pickStash(stashId), [stashId, status]);
  useEffect(() => {
    viewer.current?.showBuilding(building, floor, revealNext.current);
    revealNext.current = false;
  }, [building, floor, status]);
  // La habitación marcada es otra capa: pasar el mouse por las filas no redibuja la planta.
  useEffect(() => viewer.current?.markRoom(roomRects), [roomRects, status]);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // En el celular, el panel se cierra con Escape como cualquier hoja que se abre encima; la hoja del escondite y la del
  // edificio, igual (primero el panel, que está arriba). La del edificio devuelve el foco a donde estaba.
  useEffect(() => {
    if (!panel && !stashId && !building) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panel) setPanel(false);
      else if (building) closeBuilding();
      else setStashId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `closeBuilding` cambia en cada render pero sólo usa refs y setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, stashId, building]);

  const pickBase = (next: MapBase) => {
    setBase(next);
    state.current = { ...state.current, base: next };
    writeUrl();
  };

  /** Prende o apaga una capa. Sin los puntos de aparición, la profesión no filtra nada y se olvida. */
  const toggleLayer = (id: LayerId) => {
    const next = layers.includes(id) ? layers.filter((l) => l !== id) : [...layers, id];
    const nextProf = next.includes("apariciones") ? prof : null;
    setLayers(next);
    setProf(nextProf);
    if (!next.includes("escondites")) setStashId(null);
    state.current = { ...state.current, layers: next, prof: nextProf };
    writeUrl();
  };
  const pickProf = (next: string | null) => {
    setProf(next);
    state.current = { ...state.current, prof: next };
    writeUrl();
  };

  /**
   * Lo elegido en el buscador: el mapa va hasta ahí. Un edificio con nombre abre su hoja si el edificio de esa casilla
   * es el mismo (el punto de un rótulo del mapa, "Louisville Expo Center", puede caer sobre otro edificio); un escondite
   * prende su capa y abre su hoja.
   */
  const pickPlace = (hit: SearchHit) => {
    const v = viewer.current;
    if (!v || !common) {
      // El visor todavía no montó (el buscador se puede usar antes): se guarda y se aplica apenas esté.
      pendingPick.current = hit;
      return;
    }
    // Lo que estaba abierto ya no es de acá: un pueblo, una calle o una historia no tienen hoja, y un edificio o un
    // escondite abren la suya enseguida. Sin esto la planta del edificio de antes quedaba dibujada lejos, con su hoja.
    openBuilding(null);
    setStashId(null);
    v.flyTo(hit.x, hit.y, hit.z);
    if (hit.k === "building") {
      loadSheet().catch(() => undefined);
      v.buildingAt(hit.x, hit.y).then(
        (b) => {
          if (b?.name && compact(b.name) === compact(hit.en)) openBuilding(b);
        },
        () => undefined,
      );
    }
    if (hit.k === "stash") {
      const s = common.stashes.find((st) => Math.abs(st.building[0] - hit.x) <= 1 && Math.abs(st.building[1] - hit.y) <= 1);
      if (!s) return;
      if (!layers.includes("escondites")) toggleLayer("escondites");
      setStashId(s.id);
    }
  };
  // `pickPlace` de este render, para el efecto de abajo (que corre con `common` ya cargado).
  const pickRef = useRef(pickPlace);
  pickRef.current = pickPlace;
  useEffect(() => {
    const hit = pendingPick.current;
    if (status !== "ready" || !hit) return;
    pendingPick.current = null;
    pickRef.current(hit);
  }, [status]);

  const copyLink = async () => {
    const url = window.location.origin + window.location.pathname + writeMapUrl(state.current);
    if (!(await copyText(url))) return;
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const n = mapMeta.counts;
  const stash = stashId && common ? common.stashes.find((s) => s.id === stashId) : undefined;
  return (
    <main className="pz-main pzm">
      <section className="pz-page pzm-intro">
        <p className="pzm-kick">{t.kicker(meta.version)}</p>
        <h1 className="pzm-h1">{t.h1}</h1>
        <p className="pzm-lede">{t.lede(num(n.buildings), num(n.streets), num(n.stashes))}</p>
        <p className="pzm-hand">{t.hand}</p>
      </section>

      <div className="pzm-layout">
        <figure className="pzm-sheet">
          <span className="pz-tape pzm-tape is-a" aria-hidden="true" />
          <span className="pz-tape pzm-tape is-b" aria-hidden="true" />
          <MapSearch onPick={pickPlace} />
          <div className="pzm-frame">
            {/* La vista del mapa entero (lo más grande de la página, el LCP) tapa el visor hasta que la base carga. */}
            {cover !== "done" && (
              <img
                className={`pzm-overview${cover === "fade" ? " is-gone" : ""}`}
                {...{ fetchpriority: "high" }}
                src={OVERVIEW.src}
                width={OVERVIEW.width}
                height={OVERVIEW.height}
                alt={t.overviewAlt}
              />
            )}
            {/* El contenedor de Leaflet: React no le pone hijos ni le cambia la clase, así no pisa lo que arma Leaflet. */}
            <div className="pzm-leaflet" ref={mapEl} role="application" aria-label={t.mapLabel} />
            {status === "loading" && <p className="pzm-status">{t.loading}</p>}
            {status === "failed" && (
              <p className="pzm-status is-error" role="alert">
                {t.failed}{" "}
                <button type="button" className="pz-retry" onClick={() => setAttempt((a) => a + 1)}>
                  {t.retry}
                </button>
              </p>
            )}
            <p className="pzm-coords" aria-live="off">
              <span className="pzm-coords-xy" ref={coordsEl} />
              <span className="pzm-coords-where" ref={whereEl} />
            </p>
            {stash && common && (
              <StashCard stash={stash} items={common.items} route={route} navigate={navigate} onClose={() => setStashId(null)} />
            )}
            {building && common && (
              <Suspense fallback={null}>
                <BuildingSheet
                  building={building}
                  rooms={common.rooms}
                  floor={floor}
                  onFloor={(f) => {
                    setFloor(f);
                    setRoomRects(null);
                  }}
                  onRoom={setRoomRects}
                  onShown={() => buildingRef.current && viewer.current?.keepInView(buildingRef.current)}
                  onClose={closeBuilding}
                  focusRef={sheetEl}
                  route={route}
                  navigate={navigate}
                />
              </Suspense>
            )}
            <button
              type="button"
              className="pzm-panel-btn"
              aria-expanded={panel}
              aria-controls="pzm-side"
              onClick={() => setPanel((p) => !p)}
            >
              {t.panel.open}
            </button>
          </div>
        </figure>

        <aside id="pzm-side" className={`pzm-side${panel ? " is-open" : ""}`} aria-label={t.panel.open}>
          <button type="button" className="pzm-panel-close" onClick={() => setPanel(false)}>
            {t.panel.close}
          </button>
          <section className="pz-page pzm-card">
            <h2 className="pzm-h2">{t.base.title}</h2>
            <div className="pzm-bases" role="radiogroup" aria-label={t.base.title}>
              {(["sat", "paper"] as const).map((b) => (
                <label className={`pzm-base${base === b ? " is-on" : ""}`} key={b}>
                  <input type="radio" name="pzm-base" value={b} checked={base === b} onChange={() => pickBase(b)} />
                  <span className={`pzm-base-swatch is-${b}`} aria-hidden="true" />
                  {t.base[b]}
                </label>
              ))}
            </div>
            <p className="pzm-about">{t.about}</p>
            {base === "paper" && common && (
              <>
                <h3 className="pzm-h3">{t.base.key}</h3>
                <ul className="pzm-key">
                  {PAPER_KINDS.map((k) => {
                    const [r, g, b] = common.style.buildings[k] ?? common.style.buildings.yes;
                    return (
                      <li key={k}>
                        <span className="pzm-key-swatch" style={{ "--pzm-swatch": `rgb(${r},${g},${b})` } as CSSProperties} aria-hidden="true" />
                        {t.kinds[k]}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
          <Legend layers={layers} onToggle={toggleLayer} prof={prof} onProf={pickProf} zoom={tileZoom} />
          <section className="pz-page pzm-card">
            <h2 className="pzm-h2">{t.place.title}</h2>
            <button type="button" className={`pzm-copy${copied ? " is-done" : ""}`} onClick={copyLink}>
              {copied ? t.place.copied : t.place.copy}
            </button>
            <span className="visually-hidden" role="status">
              {copied ? t.place.copied : ""}
            </span>
            <p className="pzm-hint">{t.place.hint}</p>
            <p className="pzm-hint">{t.building.hint}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
