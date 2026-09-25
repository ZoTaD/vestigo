/**
 * El mapa interactivo de Valheim (2026-09-24, pedido de ZoTaD: "la gente pone
 * su semilla del mapa y puede ver su mapa con diferentes opciones").
 *
 * La semilla y la vista viajan en la URL (`?seed=…&x=…&z=…&m=…`) para
 * compartir. Todo se calcula en el navegador: `MapViewer` pinta el terreno y
 * `useLocations` ubica los lugares con el algoritmo del juego.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../i18n";
import { useValheimCopy } from "../valheimCopy";
import { useMapCopy } from "./copy";
import MapViewer, { type HoverInfo, type Marker, type ViewerHandle } from "./MapViewer";
import { BIOME_ID, BIOME_ORDER, WATER_LEVEL, type Layer } from "./palette";
import { landColor } from "./engine/render";
import { defaultHidden, useLocations, type MapLocation } from "./locations";
import LocationPanel from "./LocationPanel";
import MapTip from "./MapTip";
import SaveLoader from "./SaveLoader";
import { useSaveCopy } from "./saveCopy";
import { useSaves } from "./useSaves";

const SEED_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSeed(): string {
  let s = "";
  const r = new Uint32Array(10);
  crypto.getRandomValues(r);
  for (const n of r) s += SEED_CHARS[n % SEED_CHARS.length];
  return s;
}

function readUrl() {
  if (typeof window === "undefined") return { seed: "", view: null };
  const q = new URLSearchParams(window.location.search);
  const x = Number(q.get("x")), z = Number(q.get("z")), m = Number(q.get("m"));
  return {
    seed: (q.get("seed") ?? "").slice(0, 64),
    view: q.has("x") && Number.isFinite(x) && Number.isFinite(z) && m > 0 ? { x, z, mpp: m } : null,
  };
}

function writeUrl(seed: string, view: { x: number; z: number; mpp: number } | null) {
  const q = new URLSearchParams();
  if (seed) q.set("seed", seed);
  if (view) {
    q.set("x", String(Math.round(view.x)));
    q.set("z", String(Math.round(view.z)));
    q.set("m", String(Math.round(view.mpp * 100) / 100));
  }
  const url = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
  window.history.replaceState(window.history.state, "", url);
}

export default function ValheimMap({ openPage }: { openPage: (tab: string, slug: string) => void }) {
  const t = useMapCopy();
  const v = useValheimCopy();
  const { lang } = useLang();
  const first = useMemo(readUrl, []);
  const [seed, setSeed] = useState(first.seed);
  const [input, setInput] = useState(first.seed);
  const [layer, setLayer] = useState<Layer>("relief");
  const [grid, setGrid] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [progress, setProgress] = useState<{ p: number; ms?: number }>({ p: 0 });
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<{ key: string; sx: number; sy: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const viewer = useRef<ViewerHandle | null>(null);
  const view = useRef(first.view);

  // Sin semilla en la URL, una al azar para que el mapa no arranque vacío.
  useEffect(() => {
    if (!seed) {
      const s = randomSeed();
      setSeed(s);
      setInput(s);
      writeUrl(s, null);
    }
  }, [seed]);

  const loc = useLocations(seed);
  const saves = useSaves();
  const sc = useSaveCopy();
  const [hidden, setHidden] = useState<Set<string>>(defaultHidden);

  // El inicio va aparte, siempre visible y con su nombre; los jefes, con el suyo.
  const markers: Marker[] = useMemo(() => (loc.items ?? [])
    .filter((l) => !hidden.has(l.type))
    .map((l) => ({
      key: l.key, x: l.x, z: l.z, color: l.color, icon: l.icon,
      size: l.category === "start" ? 7 : l.major ? 6 : 4,
      label: l.category === "start" ? t.spawn : l.category === "boss" ? l.name[lang] : undefined,
    })),
  [loc.items, hidden, lang, t.spawn]);

  const allMarkers = useMemo(() => [...markers, ...saves.markers], [markers, saves.markers]);
  const byKey = useMemo(() => new Map((loc.items ?? []).map((l) => [l.key, l])), [loc.items]);
  const sel: MapLocation | undefined = selected ? byKey.get(selected) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = input.trim();
    if (!s || s === seed) return;
    setSeed(s);
    setSelected(null);
    writeUrl(s, view.current);
  };
  const onView = useCallback((vw: { x: number; z: number; mpp: number }) => {
    view.current = vw;
    writeUrl(seed, vw);
  }, [seed]);
  const onProgress = useCallback((p: number, ms?: number) => setProgress({ p, ms }), []);
  const onHandle = useCallback((h: ViewerHandle) => { viewer.current = h; }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* sin permiso para el portapapeles: no pasa nada */ }
  };
  const savePng = async () => {
    const b = await viewer.current?.exportPng();
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `valheim-${seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const hb = hover?.biome != null ? BIOME_ID[hover.biome] : null;

  return (
    <div className="vm">
      <header className="vh-head vm-head">
        <h1>{t.h1}</h1>
        <p>{t.lede}</p>
      </header>

      <form className="vm-seed" onSubmit={submit}>
        <label>
          <span>{t.seed}</span>
          <input className="vh-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={64}
            spellCheck={false} autoComplete="off" aria-describedby="vm-seed-hint" />
        </label>
        <button type="submit" className="vm-btn is-main">{t.go}</button>
        <button type="button" className="vm-btn" onClick={() => { const s = randomSeed(); setInput(s); setSeed(s); setSelected(null); writeUrl(s, view.current); }}>{t.random}</button>
        <button type="button" className="vm-btn" onClick={copyLink}>{copied ? t.copied : t.copy}</button>
        <button type="button" className="vm-btn" onClick={savePng}>{t.png}</button>
        <small id="vm-seed-hint">{t.seedHint}</small>
      </form>

      <div className="vm-layout">
        <div className="vm-stage" ref={stage}>
          <MapViewer seed={seed} layer={layer} grid={grid} markers={allMarkers} fog={saves.fog} lines={saves.lines} onHover={setHover} onProgress={onProgress} onError={() => setFailed(true)} onMarkerHover={setTip}
            onMarker={setSelected} handle={onHandle} initial={first.view} onView={onView} />
          <div className="vm-status">
            {failed ? t.noEngine : progress.p < 1 ? t.generating(progress.p) : progress.ms ? t.generated(progress.ms / 1000) : null}
            {loc.progress != null && loc.progress < 1 ? ` · ${t.placing(loc.progress)}` : loc.items ? ` · ${t.placed(loc.items.length)}` : ""}
          </div>
          {hover && (
            <div className="vm-cursor">
              {hover.biome == null ? t.outside : (
                <>
                  <b>{hb ? v.biomes[hb as keyof typeof v.biomes] : "—"}</b>
                  {hover.height != null && <span>{hover.height < WATER_LEVEL ? t.water : `${t.height} ${Math.round(hover.height - WATER_LEVEL)} m`}</span>}
                </>
              )}
              <span className="vh-dim">x {Math.round(hover.x)} · z {Math.round(hover.z)}</span>
            </div>
          )}
          {tip && saves.info.get(tip.key) && (() => {
            const s = saves.info.get(tip.key)!;
            const box = { w: stage.current?.clientWidth ?? 800 };
            const left = tip.sx + 16 + 240 > box.w ? Math.max(4, tip.sx - 256) : tip.sx + 16;
            return (
              <div className="vm-tip" style={{ left, top: tip.sy + 14, width: 240 }} role="tooltip">
                <div className="vm-tip-body">
                  <h4>{s.kind === "base" ? sc.kinds.base : s.label || sc.unnamed}</h4>
                  <p className="vm-tip-kind">{sc.kinds[s.kind]}{s.owner ? ` · ${sc.of(s.owner)}` : ""}</p>
                  {s.kind === "base" && s.extra && <p>{sc.basePieces(s.extra)}</p>}
                  <p className="vm-tip-pos">x {Math.round(s.x)} · z {Math.round(s.z)}</p>
                </div>
              </div>
            );
          })()}
          {tip && byKey.get(tip.key) && tip.key !== selected && (
            <MapTip l={byKey.get(tip.key)!} sx={tip.sx} sy={tip.sy} biome={hover?.biome ?? null} spawn={loc.spawn}
              box={{ w: stage.current?.clientWidth ?? 800, h: stage.current?.clientHeight ?? 600 }} />
          )}
          {sel && (
            <div className="vm-pop">
              <button type="button" className="vm-pop-x" onClick={() => setSelected(null)} aria-label={t.close}>×</button>
              <h3>{sel.name[lang]}</h3>
              <p className="vh-dim">{sel.categoryName[lang]}</p>
              {sel.candidate && <p className="vm-note">{t.candidates}</p>}
              <p>{t.coords}: x {Math.round(sel.x)} · z {Math.round(sel.z)} · {Math.round(Math.hypot(sel.x, sel.z))} m {t.distance}</p>
              {sel.page && <button type="button" className="vm-btn is-main" onClick={() => openPage(sel.page!.tab, sel.page!.slug)}>{t.openPage}</button>}
            </div>
          )}
        </div>

        <aside className="vm-side">
          <LocationPanel loc={loc} hidden={hidden} setHidden={setHidden} select={setSelected}
            goTo={(x, z) => viewer.current?.goTo(x, z, Math.min(view.current?.mpp ?? 4, 4))}
            center={() => view.current ?? { x: 0, z: 0 }}
            extra={<>
          <SaveLoader saves={saves} onWorld={(w) => {
            // El mundo trae su semilla: el mapa pasa a ser el de ese mundo.
            if (w.seedName && w.seedName !== seed) { setInput(w.seedName); setSeed(w.seedName); setSelected(null); writeUrl(w.seedName, view.current); }
          }} />
          <section className="vh-box vm-panel">
            <h3>{t.layers}</h3>
            <div className="vh-opts">
              {(["relief", "biomes", "height"] as Layer[]).map((l) => (
                <button key={l} type="button" className="vh-chip" aria-pressed={layer === l} onClick={() => setLayer(l)}>{t.layer[l]}</button>
              ))}
              <button type="button" className="vh-chip" aria-pressed={grid} onClick={() => setGrid(!grid)}>{t.grid}</button>
            </div>
            <h3 style={{ marginTop: 14 }}>{t.legend}</h3>
            <ul className="vm-legend">
              {BIOME_ORDER.map((b) => {
                const c = landColor(b);
                return <li key={b}><i style={{ background: `#${c.toString(16).padStart(6, "0")}` }} />{v.biomes[BIOME_ID[b] as keyof typeof v.biomes]}</li>;
              })}
            </ul>
          </section>
            </>} />
        </aside>
      </div>

      <section className="vm-about">
        <div>
          <h2>{t.howTitle}</h2>
          {t.how.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <div>
          <h2>{t.findSeedTitle}</h2>
          {t.findSeed.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>
    </div>
  );
}
