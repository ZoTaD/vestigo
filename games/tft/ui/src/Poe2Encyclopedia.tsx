import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLang, type Lang } from "./i18n";
import type { Route } from "./route";
import RouteLink from "./RouteLink";
import { usePoe2Copy } from "./poe2Copy";
import { ItemTooltip, useItemTip } from "./Poe2Tooltip";
import { LEAGUES } from "./poe2EconomyData";
import { EntryHistory } from "./Poe2Patches";
import {
  CATS,
  fold,
  isCat,
  levelText,
  loadCat,
  loadIndex,
  nameOf,
  tx,
  type Base,
  type Cat,
  type CatData,
  type Entry,
  type Gem,
  type IndexEntry,
  type LevelText,
  type Unique,
} from "./poe2EncyclopediaData";

/**
 * Enciclopedia de PoE2 (2026-09-23): portada, lista por categoría y ficha.
 *
 * `detail` es lo que viene en la URL después de `/encyclopedia`: nada (portada),
 * `gems` (lista) o `gems/untether` (ficha). Todo va con el estilo del juego bajo
 * `.p2` (styles/poe2.css + styles/poe2-codex.css): celdas del alijo, tooltip del
 * juego y placas doradas.
 */

type Nav = (route: Route) => void;
const RARITY: Record<Cat, string> = { gems: "gem", uniques: "unique", bases: "normal", currency: "currency" };

export default function Poe2Encyclopedia({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const [cat, slug] = (route.detail ?? "").split("/");
  const to = (detail?: string): Route => ({ ...route, view: "poe2", p2Section: "encyclopedia", detail });
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  useEffect(() => {
    let vivo = true;
    loadIndex().then((i) => vivo && setIndex(i));
    return () => { vivo = false; };
  }, []);

  if (!index) return <main className="p2 p2-page"><p className="p2-loading">{t.loading}</p></main>;

  return (
    <main className="p2 p2-page p2-enc">
      <header className="p2-title">
        <h1>{t.title}</h1>
        <p>{isCat(cat) ? t.catLede[cat] : t.lede}</p>
        <GlobalSearch index={index} to={to} navigate={navigate} />
      </header>
      <nav className="p2-enc-cats" aria-label={t.title}>
        {CATS.map((c) => (
          <RouteLink key={c} to={to(c)} onNavigate={navigate} className={`p2-stab${c === cat ? " is-on" : ""}`} active={c === cat}>
            {t.cats[c]}
            <em className="p2-stab-note">{index.filter((e) => e.cat === c).length}</em>
          </RouteLink>
        ))}
      </nav>
      {!isCat(cat) && <Home index={index} to={to} navigate={navigate} />}
      {isCat(cat) && !slug && <CatList cat={cat} to={to} navigate={navigate} />}
      {isCat(cat) && slug && <Detail cat={cat} slug={slug} to={to} route={route} navigate={navigate} />}
      <p className="p2-note">{t.fromGame}</p>
    </main>
  );
}

/** El buscador de toda la enciclopedia: nombre en los dos idiomas, sin tildes. */
function GlobalSearch({ index, to, navigate }: { index: IndexEntry[]; to: (d?: string) => Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    const starts: IndexEntry[] = [], has: IndexEntry[] = [];
    for (const e of index) {
      const n = fold(nameOf(e, lang)), o = fold(lang === "es" ? e.en : e.es);
      if (n.startsWith(f)) starts.push(e);
      else if (n.includes(f) || o.includes(f)) has.push(e);
    }
    return [...starts, ...has].slice(0, 12);
  }, [q, index, lang]);
  useEffect(() => {
    const close = (e: globalThis.MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="p2-enc-search" ref={box}>
      <input
        className="p2-input"
        type="search"
        value={q}
        placeholder={t.search}
        aria-label={t.search}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) { navigate(to(hits[0].id)); setOpen(false); setQ(""); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="p2-enc-hits" role="listbox">
          {hits.length === 0 && <div className="p2-enc-hit is-empty">{t.noResults}</div>}
          {hits.map((h) => (
            <RouteLink key={h.id} to={to(h.id)} onNavigate={(r) => { navigate(r); setOpen(false); setQ(""); }} className={`p2-enc-hit is-${RARITY[h.cat]}`}>
              <span className="p2-enc-hit-ic">{h.icon && <img src={h.icon} alt="" loading="lazy" />}</span>
              <span className="p2-enc-hit-n">{nameOf(h, lang)}</span>
              <span className="p2-enc-hit-c">{t.cats[h.cat]}</span>
            </RouteLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** La portada: las cuatro categorías como paneles, cada una con un mosaico de su arte. */
function Home({ index, to, navigate }: { index: IndexEntry[]; to: (d?: string) => Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  // Unos pocos dibujos por categoría, repartidos a lo largo de la lista para
  // que no salgan todos de la misma letra.
  const sample = (c: Cat, n: number) => {
    const rows = index.filter((e) => e.cat === c && e.icon);
    const step = Math.max(1, Math.floor(rows.length / n));
    return rows.filter((_, i) => i % step === 0).slice(0, n);
  };
  return (
    <div className="p2-enc-home">
      {CATS.map((c) => (
        <RouteLink key={c} to={to(c)} onNavigate={navigate} className="p2-panel p2-enc-tile">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.cats[c]}</h2></div>
          <div className={`p2-enc-mosaic is-${c}`} aria-hidden="true">
            {sample(c, c === "gems" ? 18 : 12).map((e) => <img key={e.id} src={e.icon!} alt="" loading="lazy" />)}
          </div>
          <p className="p2-enc-tile-lede">{t.catLede[c]}</p>
          <p className="p2-enc-tile-n">{t.count(index.filter((e) => e.cat === c).length)}</p>
        </RouteLink>
      ))}
    </div>
  );
}

/** Los filtros de cada categoría: qué campo mira y con qué nombre se muestra. */
function facetsOf(cat: Cat, rows: Entry[], lang: Lang, t: ReturnType<typeof usePoe2Copy>["enc"]) {
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  if (cat === "gems") {
    return [
      { id: "kind", opts: (["active", "support", "spirit"] as const).map((k) => ({ v: k, label: t.gemKinds[k] })), of: (r: Entry) => (r as Gem).kind },
      { id: "color", opts: (["str", "dex", "int"] as const).map((k) => ({ v: k, label: t.colors[k] })), of: (r: Entry) => (r as Gem).color },
    ];
  }
  if (cat === "bases") {
    const groups = (["weapon", "armour", "jewellery", "flask"] as const).map((k) => ({ v: k, label: t.groups[k] }));
    return [
      { id: "group", opts: groups, of: (r: Entry) => (r as Base).group },
      { id: "cls", opts: uniq(rows.map((r) => tx((r as Base).cls, lang))).sort().map((v) => ({ v, label: v })), of: (r: Entry) => tx((r as Base).cls, lang), dependsOn: "group" },
    ];
  }
  const clsOf = (r: Entry) => tx((r as Unique).cls, lang);
  return [{ id: "cls", opts: uniq(rows.map(clsOf)).sort().map((v) => ({ v, label: v })), of: clsOf }];
}

function CatList({ cat, to, navigate }: { cat: Cat; to: (d?: string) => Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [tip, setTip] = useState<{ entry: Entry; x: number; y: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    setRows(null);
    setPick({});
    setQ("");
    loadCat(cat).then((r) => vivo && setRows(r as Entry[]));
    return () => { vivo = false; };
  }, [cat]);

  if (!rows) return <p className="p2-loading">{t.loading}</p>;
  const facets = facetsOf(cat, rows, lang, t);
  const f = fold(q.trim());
  const shown = rows
    .filter((r) => facets.every((fc) => !pick[fc.id] || fc.of(r) === pick[fc.id]))
    .filter((r) => !f || fold(r.en).includes(f) || fold(r.es).includes(f))
    .sort((a, b) => nameOf(a, lang).localeCompare(nameOf(b, lang), lang));

  return (
    <section className="p2-panel p2-enc-list">
      <div className="p2-plate-head"><h2 className="p2-plate">{t.cats[cat]}</h2></div>
      {facets.map((fc) => {
        // La clase de una base depende del grupo elegido: sin grupo no se muestra (serían 30).
        if ("dependsOn" in fc && fc.dependsOn && !pick[fc.dependsOn]) return null;
        const opts = "dependsOn" in fc && fc.dependsOn
          ? fc.opts.filter((o) => rows.some((r) => facets.find((x) => x.id === fc.dependsOn)!.of(r) === pick[fc.dependsOn!] && fc.of(r) === o.v))
          : fc.opts;
        return (
          <div className="p2-stabs p2-enc-facet" key={fc.id} role="radiogroup">
            <button role="radio" aria-checked={!pick[fc.id]} className={`p2-stab${!pick[fc.id] ? " is-on" : ""}`} onClick={() => setPick((p) => ({ ...p, [fc.id]: "", ...(fc.id === "group" ? { cls: "" } : {}) }))}>
              {t.all}
            </button>
            {opts.map((o) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={pick[fc.id] === o.v}
                className={`p2-stab${pick[fc.id] === o.v ? " is-on" : ""}${fc.id === "color" ? ` is-${o.v}` : ""}`}
                onClick={() => setPick((p) => ({ ...p, [fc.id]: o.v, ...(fc.id === "group" ? { cls: "" } : {}) }))}
              >
                {o.label}
              </button>
            ))}
          </div>
        );
      })}
      <div className="p2-tools">
        <input className="p2-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchCat} aria-label={t.searchCat} />
        <span className="p2-count">{t.count(shown.length)}</span>
      </div>
      <div className="p2-enc-grid" onMouseLeave={() => setTip(null)}>
        {shown.map((r) => (
          <RouteLink
            key={r.slug}
            to={to(`${cat}/${r.slug}`)}
            onNavigate={navigate}
            className={`p2-enc-card is-${RARITY[cat]}`}
            onMouseMove={(e: MouseEvent) => setTip({ entry: r, x: e.clientX, y: e.clientY })}
          >
            <span className={`p2-enc-art${cat === "gems" ? " is-gem" : ""}`}>{r.icon && <img src={r.icon} alt="" loading="lazy" />}</span>
            <span className="p2-enc-name">{nameOf(r, lang)}</span>
          </RouteLink>
        ))}
        {shown.length === 0 && <p className="p2-mempty">{t.noResults}</p>}
      </div>
      {tip && <ItemTooltip cat={cat} entry={tip.entry} floating={{ x: tip.x, y: tip.y }} />}
    </section>
  );
}

function Detail({ cat, slug, to, route, navigate }: { cat: Cat; slug: string; to: (d?: string) => Route; route: Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [level, setLevel] = useState(1);
  useEffect(() => {
    let vivo = true;
    loadCat(cat).then((r) => vivo && setRows(r as Entry[]));
    return () => { vivo = false; };
  }, [cat]);
  useEffect(() => setLevel(1), [slug]);

  if (!rows) return <p className="p2-loading">{t.loading}</p>;
  const e = rows.find((r) => r.slug === slug);
  if (!e) return <p className="p2-loading">{t.notFound}</p>;
  const g = cat === "gems" ? (e as Gem) : null;
  const w = "w" in e ? e.w : 1, h = "h" in e ? e.h : 1;

  return (
    <div className="p2-enc-detail">
      <nav className="p2-crumbs" aria-label={t.back}>
        <RouteLink to={to()} onNavigate={navigate}>{t.back}</RouteLink>
        <span>›</span>
        <RouteLink to={to(cat)} onNavigate={navigate}>{t.cats[cat]}</RouteLink>
        <span>›</span>
        <b>{nameOf(e, lang)}</b>
      </nav>
      <div className="p2-enc-cols">
        <div className="p2-enc-main">
          <div className={`p2-enc-hero is-${RARITY[cat]}`} style={{ ["--cw" as string]: w, ["--ch" as string]: h }}>
            {e.icon && <img src={e.icon} alt={nameOf(e, lang)} />}
          </div>
          <ItemTooltip cat={cat} entry={e} level={level} />
          {g && g.nlev > 1 && (
            <label className="p2-enc-level">
              <span>{t.gemLevel(level)}</span>
              <input type="range" min={1} max={g.nlev} value={level} onChange={(ev) => setLevel(Number(ev.target.value))} />
            </label>
          )}
        </div>
        <div className="p2-enc-side">
          {g && g.sets.some((s) => s.levels.some((l) => l.en.v)) && <LevelTable g={g} lang={lang} level={level} onLevel={setLevel} />}
          {g && g.supports.length > 0 && <Supports ids={g.supports} rows={rows as Gem[]} to={to} navigate={navigate} />}
          {cat === "uniques" && <UniqueSide u={e as Unique} to={to} route={route} navigate={navigate} />}
          {cat === "bases" && <UniquesOnBase slug={slug} to={to} navigate={navigate} />}
          <EntryHistory id={`${cat}/${slug}`} route={route} navigate={navigate} />
        </div>
      </div>
    </div>
  );
}

/** Nivel por nivel: una columna por línea que cambia, con su plantilla arriba. */
function LevelTable({ g, lang, level, onLevel }: { g: Gem; lang: Lang; level: number; onLevel: (n: number) => void }) {
  const t = usePoe2Copy().enc;
  // Las columnas repetidas entre variantes (el daño de Cometa y el de Cometa con
  // infusión) salen una sola vez.
  const seen = new Set<string>();
  const cols = g.sets
    .flatMap((s) => s.levels.map((l) => (lang === "es" ? l.es : l.en)))
    .filter((l): l is LevelText => !!l.v)
    .filter((l) => {
      const k = JSON.stringify(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const head = (l: LevelText) => (l.t ?? "").replace(/\{\d+\}/g, "#");
  const cell = (l: LevelText, lv: number) => {
    const v = l.v?.[lv - 1];
    if (v == null) return "—";
    if (l.t == null) return String(levelText(l, lv) ?? "—");
    return Array.isArray(v) ? v.join(" – ") : String(v);
  };
  const levels = Array.from({ length: g.nlev }, (_, i) => i + 1);
  return (
    <section className="p2-panel">
      <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.perLevel}</h2></div>
      <div className="p2-tablewrap">
        <table className="p2-table p2-lvl">
          <thead>
            <tr>
              <th>{t.level}</th>
              {cols.map((l, i) => <th key={i}>{head(l)}</th>)}
            </tr>
          </thead>
          <tbody>
            {levels.map((lv) => (
              <tr key={lv} className={lv === level ? "is-on" : ""} onClick={() => onLevel(lv)}>
                <td className="p2-lvl-n">{lv}</td>
                {cols.map((l, i) => <td key={i}>{cell(l, lv)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Supports({ ids, rows, to, navigate }: { ids: string[]; rows: Gem[]; to: (d?: string) => Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const { bind, node } = useItemTip();
  const gems = ids.map((id) => rows.find((r) => r.slug === id)).filter((g): g is Gem => !!g);
  return (
    <section className="p2-panel">
      <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.recommended}</h2></div>
      <div className="p2-enc-mini">
        {gems.map((s) => (
          <RouteLink key={s.slug} to={to(`gems/${s.slug}`)} onNavigate={navigate} className="p2-enc-minicard is-gem" {...bind(`gems/${s.slug}`)}>
            <span className="p2-enc-art is-gem">{s.icon && <img src={s.icon} alt="" loading="lazy" />}</span>
            <span className="p2-enc-name">{nameOf(s, lang)}</span>
          </RouteLink>
        ))}
      </div>
      {node}
    </section>
  );
}

function UniqueSide({ u, to, route, navigate }: { u: Unique; to: (d?: string) => Route; route: Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const { bind, node } = useItemTip();
  const league = u.price ? LEAGUES.find((l) => l.slug === u.price!.league) : null;
  const fmt = (v: number) => new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: v >= 10 ? 0 : 2 }).format(v);
  return (
    <>
      {u.price && league && (
        <section className="p2-panel p2-enc-price">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.price}</h2></div>
          <div className="p2-enc-price-in">
            <div className="p2-coin-v num">{fmt(u.price.v)} <small>div</small></div>
            <div className="p2-tt-k">{t.priceIn(league.name)}</div>
            <RouteLink to={{ ...route, view: "poe2", p2Section: "economy", detail: league.slug }} onNavigate={navigate} className="p2-enc-link">
              {t.seeEconomy} →
            </RouteLink>
          </div>
        </section>
      )}
      {u.base && u.baseSlug && (
        <section className="p2-panel">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.basedOn}</h2></div>
          <div className="p2-enc-mini">
            <RouteLink to={to(`bases/${u.baseSlug}`)} onNavigate={navigate} className="p2-enc-minicard is-normal" {...bind(`bases/${u.baseSlug}`)}>
              <span className="p2-enc-name">{tx(u.base, lang)}</span>
            </RouteLink>
          </div>
          {node}
        </section>
      )}
    </>
  );
}

function UniquesOnBase({ slug, to, navigate }: { slug: string; to: (d?: string) => Route; navigate: Nav }) {
  const t = usePoe2Copy().enc;
  const { lang } = useLang();
  const { bind, node } = useItemTip();
  const [list, setList] = useState<CatData["uniques"] | null>(null);
  useEffect(() => {
    let vivo = true;
    loadCat("uniques").then((u) => vivo && setList(u.filter((x) => x.baseSlug === slug)));
    return () => { vivo = false; };
  }, [slug]);
  if (!list || list.length === 0) return null;
  return (
    <section className="p2-panel">
      <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.onThisBase}</h2></div>
      <div className="p2-enc-mini">
        {list.map((u) => (
          <RouteLink key={u.slug} to={to(`uniques/${u.slug}`)} onNavigate={navigate} className="p2-enc-minicard is-unique" {...bind(`uniques/${u.slug}`)}>
            <span className="p2-enc-art">{u.icon && <img src={u.icon} alt="" loading="lazy" />}</span>
            <span className="p2-enc-name">{nameOf(u, lang)}</span>
          </RouteLink>
        ))}
      </div>
      {node}
    </section>
  );
}
