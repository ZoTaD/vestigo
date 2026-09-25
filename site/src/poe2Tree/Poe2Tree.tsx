/**
 * Árbol de pasivas de PoE2 (2026-09-25), la maqueta "A · Pantalla del juego":
 * el árbol ocupa la pantalla, la clase arriba a la izquierda, los puntos arriba
 * al centro, un cajón con la ruta, las gemas y el archivo del juego a la derecha,
 * y la barra de niveles abajo.
 *
 * La build viaja en el link (`?b=`, ver share.ts) y se lleva al juego con el
 * `.build` del Build Planner (buildFile.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../i18n";
import { fold } from "../poe2EncyclopediaData";
import { loadGemIds, loadTexts, loadTree, type Texts, type Tree } from "./data";
import { Planner, type WeaponSet } from "./planner";
import { ASC_TOTAL, ascAt, mainAt, MAX_LEVEL, questAt } from "./points";
import { classArtStyle, iconStyle, TreeView } from "./render";
import { decode, encode, type GemStage } from "./share";
import { applyImport, fromBuild, toBuild } from "./buildFile";
import { useTreeCopy } from "./copy";
import GemEditor from "./GemEditor";

type Tab = "route" | "gems" | "share";

function readCode(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("b");
}

function writeCode(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("b", code);
  else url.searchParams.delete("b");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export default function Poe2Tree() {
  const t = useTreeCopy();
  const { lang } = useLang();
  const [T, setT] = useState<Tree | null>(null);
  const [X, setX] = useState<Texts | null>(null);
  const [failed, setFailed] = useState(false);
  const P = useRef<Planner | null>(null);
  const V = useRef<TreeView | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  const [lvl, setLvl] = useState(MAX_LEVEL);
  const [tab, setTab] = useState<Tab>("route");
  const [wsNext, setWsNext] = useState<WeaponSet>(0);
  const [q, setQ] = useState("");
  const [gems, setGems] = useState<GemStage[]>([]);
  const [picker, setPicker] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState(false);
  const wsRef = useRef(wsNext);
  wsRef.current = wsNext;

  // datos
  useEffect(() => {
    let alive = true;
    Promise.all([loadTree(), loadTexts(lang)])
      .then(([tree, texts]) => { if (alive) { setT(tree); setX(texts); } })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [lang]);

  // la build del link, o elegir clase
  useEffect(() => {
    if (!T || P.current) return;
    const p = new Planner(T, 0);
    const shared = decode(readCode() ?? "");
    if (shared && T.classes[shared.ci]) {
      p.setClass(shared.ci);
      const a = T.classes[shared.ci].asc[shared.asc];
      if (a?.c) p.setAsc(a.id);
      p.load([...shared.route, ...shared.ascRoute.map((id) => ({ id }))]);
      setGems(shared.gems);
    } else {
      setPicker(true);
    }
    P.current = p;
    bump();
  }, [T, bump]);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((x) => (x === m ? null : x)), 3200);
  }, []);

  // el canvas
  useEffect(() => {
    if (!T || !P.current || !canvas.current || V.current) return;
    const v = new TreeView(canvas.current, T, P.current, {
      onToggle: (id) => {
        const p = P.current!;
        if (p.has(id)) p.drop(id);
        else p.take(id, wsRef.current);
        bump();
      },
      onHover: (id, x, y) => setTip(id ? { id, x, y } : null),
    });
    V.current = v;
    // el cajón tapa la derecha en pantallas anchas: el centro de la vista se corre
    const wide = window.matchMedia("(min-width: 1181px)");
    const inset = () => { v.insetRight = wide.matches ? 392 : 0; };
    inset();
    wide.addEventListener("change", inset);
    v.home();
    return () => { wide.removeEventListener("change", inset); v.destroy(); V.current = null; };
  }, [T, rev === 0 ? 0 : 1, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = P.current;
  const levels = useMemo(() => (p ? p.levels() : { main: [], asc: [] }), [p, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const levelOf = useMemo(() => {
    const m = new Map<string, number | null>();
    p?.route.forEach((id, i) => m.set(id, levels.main[i]));
    p?.ascRoute.forEach((id, i) => m.set(id, levels.asc[i]));
    return m;
  }, [p, levels]);

  // búsqueda
  const matches = useMemo(() => {
    const f = fold(q.trim());
    if (!f || f.length < 2 || !X || !p) return null;
    const out = new Set<string>();
    for (const [id, [n, stats]] of Object.entries(X.nodes)) {
      if (!p.visible(id)) continue;
      if (fold(n).includes(f) || stats.some((s) => fold(s).includes(f))) out.add(id);
    }
    return out;
  }, [q, X, p, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // la vista sigue al estado
  useEffect(() => {
    const v = V.current;
    if (!v) return;
    v.upTo = lvl;
    v.levelOf = (id) => levelOf.get(id) ?? null;
    v.match = matches;
    v.hoverPath = v.hover && p ? p.path(v.hover) : null;
    v.draw();
  }, [lvl, levelOf, matches, p, rev]);

  // el link
  useEffect(() => {
    if (!p || !T) return;
    const empty = !p.route.length && !p.ascRoute.length && !gems.length;
    const ascIdx = T.classes[p.ci].asc.findIndex((a) => a.id === p.asc);
    writeCode(empty ? null : encode({
      ci: p.ci,
      asc: ascIdx,
      route: p.route.map((id) => ({ id, ws: p.ws[id] ?? 0 })),
      ascRoute: p.ascRoute,
      gems,
    }));
  }, [p, T, rev, gems]);

  // El árbol ocupa lo que queda de la pantalla debajo de la barra de Vestigo,
  // que en un celular baja a tres renglones: se mide en vez de suponerla.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const set = () => el.style.setProperty("--p2t-top", `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, [T, X, rev === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // reproducir la ruta
  useEffect(() => {
    if (!playing) return;
    const h = window.setInterval(() => {
      setLvl((l) => {
        if (l >= MAX_LEVEL) { setPlaying(false); return MAX_LEVEL; }
        return l + 1;
      });
    }, 90);
    return () => window.clearInterval(h);
  }, [playing]);

  if (failed) return <div className="p2t-stage"><p className="p2t-center">{t.failed}</p></div>;
  if (!T || !X || !p) return <div className="p2t-stage"><p className="p2t-center">{t.loading}</p></div>;

  const cls = T.classes[p.ci];
  const nm = (id: string) => X.names[id] ?? id;
  const bonus = p.bonus();
  const inLvl = (i: number) => { const l = levels.main[i]; return l != null && l <= lvl; };
  const used = p.route.filter((id, i) => !p.ws[id] && inLvl(i)).length;
  const w1 = p.route.filter((id, i) => p.ws[id] === 1 && inLvl(i)).length;
  const w2 = p.route.filter((id, i) => p.ws[id] === 2 && inLvl(i)).length;
  const over = levels.main.filter((l) => l == null).length;
  const ascUsed = levels.asc.filter((l) => l != null && l <= lvl).length;

  const chooseClass = (ci: number) => {
    if (ci !== p.ci && (p.route.length || p.ascRoute.length) && !window.confirm(t.confirmClass)) return;
    if (ci !== p.ci) p.setClass(ci);
    setPicker(false);
    V.current?.home();
    bump();
  };
  const chooseAsc = (id: string) => {
    p.setAsc(p.asc === id ? null : id);
    const c = V.current?.ascCircle();
    if (c) V.current!.focus(c[0], c[1], 0.3);
    bump();
  };
  const focusNode = (id: string) => {
    const n = T.nodes[id];
    V.current?.focus(n.x, n.y, 0.28);
    setDrawer(false);
  };
  const cycleWs = (id: string) => {
    p.setWs(id, (((p.ws[id] ?? 0) + 1) % 3) as WeaponSet);
    bump();
  };

  const download = async () => {
    const ids = await loadGemIds();
    const title = name.trim() || `${nm(cls.en)}${p.asc ? ` · ${nm(p.asc)}` : ""}`;
    const blob = new Blob([JSON.stringify(toBuild(p, gems, ids, title), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]+/g, "").trim() || "vestigo"}.build`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importFile = async (file: File) => {
    try {
      const [ids, text] = await Promise.all([loadGemIds(), file.text()]);
      const imp = fromBuild(JSON.parse(text), T, ids);
      if (!imp) throw new Error("bad");
      applyImport(p, imp);
      setGems(imp.gems);
      if (typeof JSON.parse(text).name === "string") setName(JSON.parse(text).name);
      setPicker(false);
      V.current?.home();
      bump();
      flash(t.share.imported(p.route.length + p.ascRoute.length) + (imp.unknown ? ` ${t.share.unknown(imp.unknown)}` : ""));
    } catch {
      flash(t.share.bad);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash(t.share.copied);
    } catch {
      window.prompt(t.share.copy, window.location.href);
    }
  };

  // ---------- ruta ----------
  const row = (id: string, i: number, asc: boolean) => {
    const n = T.nodes[id];
    const l = asc ? levels.asc[i] : levels.main[i];
    const c = n.k === "notable" ? " is-nt" : n.k === "keystone" ? " is-ks" : asc ? " is-as" : "";
    const later = l == null || l > lvl;
    const ws = p.ws[id];
    return (
      <li
        key={id}
        className={`p2t-row${c}${later ? " is-later" : ""}${l == null ? " is-over" : ""}`}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${asc ? "a" : "m"}:${i}`); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const [kind, from] = e.dataTransfer.getData("text/plain").split(":");
          if ((kind === "a") !== asc) return;
          if (Number(from) === i) return;
          if (p.move(Number(from), i, asc)) bump();
          else flash(t.cantMove);
        }}
      >
        <span className="p2t-row-lv">{l ?? "—"}</span>
        <button type="button" className="p2t-row-main" onClick={() => focusNode(id)}>
          <span className="p2t-ic" style={iconStyle(T, n, 22)} />
          <span className="p2t-row-n">{X.nodes[id]?.[0]}</span>
        </button>
        {!asc && (
          <button type="button" className={`p2t-ws is-w${ws ?? 0}`} title={t.wsCycle} onClick={() => cycleWs(id)}>
            {ws === 1 ? "I" : ws === 2 ? "II" : "·"}
          </button>
        )}
      </li>
    );
  };
  const route = () => {
    if (!p.route.length && !p.ascRoute.length) return <p className="p2t-empty">{t.empty}</p>;
    const bands: JSX.Element[] = [];
    for (let b = 0; b < 10; b++) {
      const lo = b * 10 + 1, hi = b * 10 + 10;
      const idx = p.route.map((_, i) => i).filter((i) => { const l = levels.main[i]; return l != null && l >= lo && l <= hi; });
      if (!idx.length) continue;
      bands.push(
        <div key={b}>
          <div className="p2t-band">{t.band(Math.max(2, lo), hi)}<span>{t.nPoints(idx.length)}</span></div>
          <ol className="p2t-list">{idx.map((i) => row(p.route[i], i, false))}</ol>
        </div>,
      );
    }
    const overIdx = p.route.map((_, i) => i).filter((i) => levels.main[i] == null);
    return (
      <>
        {bands}
        {!!overIdx.length && (
          <div>
            <div className="p2t-band is-over">{t.noPoints}<span>{t.nPoints(overIdx.length)}</span></div>
            <ol className="p2t-list">{overIdx.map((i) => row(p.route[i], i, false))}</ol>
          </div>
        )}
        {!!p.ascRoute.length && (
          <div>
            <div className="p2t-band is-as">{t.asc}<span>{p.ascRoute.length} / {ASC_TOTAL}</span></div>
            {[0, 1, 2, 3].map((k) => {
              const ids = p.ascRoute.slice(k * 2, k * 2 + 2);
              if (!ids.length) return null;
              return (
                <div key={k}>
                  <div className="p2t-sub">{t.trial(k + 1, levels.asc[k * 2] ?? 0)}</div>
                  <ol className="p2t-list">{ids.map((id, j) => row(id, k * 2 + j, true))}</ol>
                </div>
              );
            })}
            {p.ascRoute.length > ASC_TOTAL && (
              <ol className="p2t-list">{p.ascRoute.slice(ASC_TOTAL).map((id, j) => row(id, ASC_TOTAL + j, true))}</ol>
            )}
          </div>
        )}
        <p className="p2t-hint">{t.dragHint}</p>
        <button type="button" className="p2t-btn is-quiet" onClick={() => { if (window.confirm(t.confirmClear)) { p.clear(); bump(); } }}>{t.clear}</button>
      </>
    );
  };

  // ---------- tooltip ----------
  const tipBox = () => {
    if (!tip || !X.nodes[tip.id]) return null;
    const n = T.nodes[tip.id];
    const [title, stats] = X.nodes[tip.id];
    const cls2 = n.k === "keystone" ? " is-ks" : n.k === "notable" ? " is-nt" : n.a ? " is-as" : "";
    const i = p.route.indexOf(tip.id), j = p.ascRoute.indexOf(tip.id);
    let foot: string;
    if (tip.id === p.ascStart) foot = t.tip.ascStart;
    else if (i >= 0) foot = levels.main[i] != null ? `${t.tip.point(i + 1, levels.main[i]!)} · ${t.tip.remove}` : t.tip.noPoints;
    else if (j >= 0) foot = `${t.tip.ascPoint(j + 1, levels.asc[j] ?? 0)} · ${t.tip.remove}`;
    else {
      const path = p.path(tip.id);
      foot = path ? t.tip.add(path.length) : n.uc ? t.tip.locked : "";
    }
    const ws = p.ws[tip.id];
    const style = {
      left: Math.min(tip.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360),
      top: Math.min(tip.y + 18, (typeof window !== "undefined" ? window.innerHeight : 800) - 220),
    };
    return (
      <div className={`p2t-tip${cls2}`} style={style} role="tooltip">
        <div className="p2t-tip-h">{title}</div>
        <div className="p2t-tip-b">
          {stats.length ? stats.map((s, k) => <div key={k}>{s.split("\n").map((l, m) => <div key={m}>{l}</div>)}</div>)
            : <div className="is-dim">{Object.values(T.nodes).some((o) => o.mc === tip.id) ? t.tip.choose : t.tip.none}</div>}
        </div>
        {!!ws && <div className={`p2t-tip-ws is-w${ws}`}>{ws === 1 ? t.set1 : t.set2}</div>}
        {foot && <div className="p2t-tip-f">{foot}</div>}
      </div>
    );
  };

  // ---------- barra de niveles ----------
  const pct = (l: number) => `${((l - 1) / (MAX_LEVEL - 1)) * 100}%`;

  return (
    <div className="p2t" ref={root}>
      <div className="p2t-stage">
        <canvas ref={canvas} className="p2t-canvas" aria-label={t.h1} />

        <div className="p2t-left">
        <section className="p2t-cls p2t-panel">
          <div className="p2t-cls-in">
            <span className="p2t-portrait" style={classArtStyle(T, cls.en, 0, 64)} />
            <div className="p2t-cls-t">
              <div className="p2t-cls-n">{nm(cls.en)}</div>
              <div className="p2t-cls-a">
                <span>{p.asc ? nm(p.asc) : t.noAsc}</span>
                <button type="button" className="p2t-link" onClick={() => setPicker(true)}>{t.change}</button>
              </div>
            </div>
          </div>
          <div className="p2t-ascs">
            {cls.asc.map((a) => (
              a.c ? (
                <button key={a.id} type="button" className={`p2t-asc${a.id === p.asc ? " is-on" : ""}`} onClick={() => chooseAsc(a.id)} aria-pressed={a.id === p.asc}>
                  <span className="p2t-asc-p" style={classArtStyle(T, cls.en, a.art, 44)} />
                  <span>{nm(a.id)}</span>
                </button>
              ) : (
                <span key={a.id} className="p2t-asc is-soon">
                  <span className="p2t-asc-p" style={classArtStyle(T, cls.en, a.art, 44)} />
                  <span>{t.soon}</span>
                </span>
              )
            ))}
          </div>
        </section>

        <div className="p2t-tools">
          <label className="p2t-search">
            <input className="p2t-input" type="search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
            {matches && <span>{t.matches(matches.size)}</span>}
          </label>
          <div className="p2t-zoom">
            <button type="button" className="p2t-btn" aria-label={t.zoomIn} onClick={() => V.current?.zoomBy(1.4)}>+</button>
            <button type="button" className="p2t-btn" aria-label={t.zoomOut} onClick={() => V.current?.zoomBy(1 / 1.4)}>−</button>
          </div>
        </div>
        </div>

        <div className="p2t-pts" aria-live="polite">
          <div className="p2-plate-head is-small p2t-plate"><p className="p2-plate">{t.points(used, mainAt(lvl, bonus))}</p></div>
          <div className="p2t-pts-sub">
            <span>{t.asc} <b>{ascUsed} / {ascAt(lvl)}</b></span>
            <span className="is-w1">{t.set1} <b>{w1} / {questAt(lvl)}</b></span>
            <span className="is-w2">{t.set2} <b>{w2} / {questAt(lvl)}</b></span>
            {over > 0 && <span className="is-over">{t.over(over)}</span>}
          </div>
        </div>


        <div className="p2t-corner">
          {p.asc && <button type="button" className="p2t-btn" onClick={() => { const c = V.current?.ascCircle(); if (c) V.current!.focus(c[0], c[1], 0.3); }}>{t.ascBtn}</button>}
          <button type="button" className="p2t-btn" onClick={() => V.current?.home()}>{t.home}</button>
          <button type="button" className="p2t-btn p2t-drawer-open" onClick={() => setDrawer(true)}>{t.tabs.route}</button>
        </div>

        <aside className={`p2t-drawer p2t-panel${drawer ? " is-open" : ""}`}>
          <div className="p2-plate-head is-small"><p className="p2-plate">{t.routeHead}</p></div>
          <button type="button" className="p2t-drawer-close" aria-label="×" onClick={() => setDrawer(false)}>×</button>
          <div className="p2t-tabs" role="tablist">
            {(["route", "gems", "share"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`p2-stab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{t.tabs[k]}</button>
            ))}
          </div>
          <div className="p2t-body">
            {tab === "route" && route()}
            {tab === "gems" && <GemEditor stages={gems} level={lvl} onChange={setGems} />}
            {tab === "share" && (
              <div className="p2t-share">
                <p>{t.share.how} <b>{t.share.folder}</b>. {t.share.how2}</p>
                <label className="p2t-field">{t.share.name}<input className="p2t-input" value={name} placeholder={`${nm(cls.en)}${p.asc ? ` · ${nm(p.asc)}` : ""}`} onChange={(e) => setName(e.target.value)} /></label>
                <button type="button" className="p2t-btn is-gold" onClick={download}>{t.share.download}</button>
                <label className="p2t-btn p2t-file">
                  {t.share.import}
                  <input type="file" accept=".build,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
                </label>
                <p>{t.share.link}</p>
                <button type="button" className="p2t-btn" onClick={copyLink}>{t.share.copy}</button>
                <p className="p2t-note">{t.share.note}</p>
              </div>
            )}
          </div>
        </aside>

        <section className="p2t-lvbar p2t-panel">
          <button type="button" className="p2t-btn p2t-play" aria-label={playing ? t.pause : t.play} title={playing ? t.pause : t.play}
            onClick={() => { if (!playing && lvl >= MAX_LEVEL) setLvl(1); setPlaying(!playing); }}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="p2t-lv"><small>{t.level}</small>{lvl}</div>
          <div className="p2t-track">
            <div className="p2t-rail" />
            <div className="p2t-fill" style={{ width: pct(lvl) }} />
            {p.route.map((id, i) => {
              const l = levels.main[i];
              if (l == null) return null;
              const k = T.nodes[id].k;
              return <i key={id} className={`p2t-tick${k === "notable" || k === "keystone" ? " is-nt" : ""}`} style={{ left: pct(l) }} />;
            })}
            {gems.map((g, k) => <i key={k} className="p2t-gm" style={{ left: pct(g.from) }} title={t.gems.stage(g.from, g.to)} />)}
            {[1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => <span key={v} className="p2t-ax" style={{ left: pct(v) }}>{v}</span>)}
            <div className="p2t-knob" style={{ left: pct(lvl) }} />
            <input type="range" min={1} max={MAX_LEVEL} value={lvl} aria-label={t.level} onChange={(e) => { setPlaying(false); setLvl(+e.target.value); }} />
          </div>
          <div className="p2t-wsel">
            <span className="p2t-wsel-l">{t.nextClicks}</span>
            <div className="p2t-wsel-b" role="group" aria-label={t.nextClicks}>
              {([0, 1, 2] as WeaponSet[]).map((w) => (
                <button key={w} type="button" className={`p2t-btn is-w${w}${wsNext === w ? " is-on" : ""}`} aria-pressed={wsNext === w} onClick={() => setWsNext(w)}>
                  {w === 0 ? t.both : w === 1 ? t.set1 : t.set2}
                </button>
              ))}
            </div>
          </div>
        </section>

        {picker && (
          <div className="p2t-modal" role="dialog" aria-label={t.pickClass}>
            <div className="p2t-modal-in p2t-panel">
              <div className="p2-plate-head is-small"><p className="p2-plate">{t.pickClass}</p></div>
              <div className="p2t-classes">
                {T.classes.map((c, ci) => (
                  <button key={c.en} type="button" className={`p2t-class${ci === p.ci ? " is-on" : ""}`} onClick={() => chooseClass(ci)}>
                    <span className="p2t-class-p" style={classArtStyle(T, c.en, 0, 96)} />
                    <span>{nm(c.en)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {toast && <div className="p2t-toast" role="status">{toast}</div>}
      </div>
      {tipBox()}
    </div>
  );
}
