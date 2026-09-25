import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useCopy, useLang, type Lang } from "./i18n";
import { takePendingSearch } from "./pendingSearch";
import {
  loadEconomy,
  loadUniques,
  peekEconomy,
  peekUniques,
  pickCurrency,
  fmtAmount,
  nameOf,
  haystack,
  isThin,
  leagueBySlug,
  sibling,
  baseName,
  BASE_LEAGUES,
  type League,
  type Economy,
  type ExchangeRow,
  type UniqueRow,
  type Tab,
  type UniqueRows,
} from "./poe2EconomyData";

/**
 * Economía de PoE2 — la maqueta "B · Mercado" que eligió ZoTaD el 2026-09-23.
 *
 * Arriba el cambio del divino, después lo que más sube, baja y se comercia, y
 * abajo la lista entera por pestaña, como las pestañas del alijo del juego. Al
 * pasar el mouse por un objeto aparece su tooltip con el formato del juego.
 *
 * El estilo del juego (Fontin, placas doradas, pestañas del alijo) vive todo
 * bajo `.p2` en `styles/poe2.css`; la barra de Vestigo de arriba no se toca.
 */

type Row = ExchangeRow | UniqueRow;
type Kind = "currency" | "unique";
type SortKey = "name" | "v" | "chg" | "vol";
interface Tip { row: Row; kind: Kind; sub?: string; x: number; y: number }

const MOVER_MIN_VOLUME = 5;

export default function Poe2Economy({ league: leagueSlug, onLeague }: { league?: string; onLeague: (l: League) => void }) {
  const copy = useCopy();
  const t = copy.poe2;
  const { lang } = useLang();
  const league = leagueBySlug(leagueSlug);
  const [eco, setEco] = useState<Economy | null>(() => peekEconomy(league.slug));
  const [tabId, setTabId] = useState("Currency");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "v", dir: -1 });
  const [tip, setTip] = useState<Tip | null>(null);
  const [jumped, setJumped] = useState(false);
  /**
   * Las filas de los únicos llegan en su propio archivo (2026-09-25): son tres
   * cuartos del peso de la liga y la página abre en Moneda. Se piden al abrir
   * una pestaña de únicos o al buscar, que busca en todas las pestañas.
   */
  const [uniq, setUniq] = useState<UniqueRows | null>(() => peekUniques(league.slug));

  // Al cambiar de liga se queda la anterior a la vista hasta que llega la
  // nueva (se ve atenuada), así la página no salta a "Cargando" y vuelve.
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    setError(false);
    loadEconomy(league.slug).then((e) => vivo && setEco(e), () => vivo && setError(true));
    setUniq(peekUniques(league.slug));
    return () => { vivo = false; };
  }, [league.slug]);

  // Una búsqueda que llega desde la barra de arriba con la página ya abierta:
  // la barra navega a esta misma ruta, la página se vuelve a dibujar y acá se
  // recoge el texto. Sin dependencias a propósito — tiene que mirar en cada vuelta.
  useEffect(() => {
    const q = takePendingSearch();
    if (q) { setQuery(q); setJumped(false); }
  });

  const tabs = useMemo(() => {
    if (!eco) return [];
    // Una pestaña sin nada no se muestra: Standard no trae únicos, y en las
    // ligas hardcore chicas medio intercambio viene vacío. Las de únicos saben
    // cuántas filas tienen aunque todavía no hayan llegado.
    return [
      ...eco.exchange.map((tb) => ({ ...tb, count: tb.rows.length, kind: "currency" as Kind })),
      ...eco.uniques.map((tb) => ({ ...tb, rows: uniq?.[tb.id] ?? [], kind: "unique" as Kind })),
    ].filter((tb) => tb.count > 0) as (Tab<Row> & { count: number; kind: Kind })[];
  }, [eco, uniq]);

  const wantUniques = !!query.trim() || tabs.some((tb) => tb.kind === "unique" && tb.id === tabId);
  useEffect(() => {
    if (!wantUniques || uniq) return;
    let vivo = true;
    loadUniques(league.slug).then((u) => vivo && setUniq(u), () => undefined);
    return () => { vivo = false; };
  }, [wantUniques, uniq, league.slug]);

  // Si la búsqueda vino de la barra, abre la primera pestaña donde hay algo
  // (esperando a los únicos, que también pueden tenerlo).
  useEffect(() => {
    if (!eco || jumped || !query || (!uniq && eco.uniques.length > 0)) return;
    setJumped(true);
    const q = query.toLowerCase();
    const hit = tabs.find((tb) => tb.rows.some((r) => haystack(r).includes(q)));
    if (hit) setTabId(hit.id);
  }, [eco, jumped, query, tabs, uniq]);

  if (!eco) {
    return (
      <main className="p2 p2-page">
        <p className="p2-loading">{error ? t.loadError : t.loading}</p>
      </main>
    );
  }
  const stale = eco.league !== league.id;

  const cur = tabs.find((tb) => tb.id === tabId) ?? tabs[0];
  if (!cur) {
    return (
      <main className="p2 p2-page">
        <LeaguePicker league={league} onPick={onLeague} />
        <p className="p2-loading">{t.empty}</p>
      </main>
    );
  }
  const allEx = eco.exchange.flatMap((tb) => tb.rows.map((r) => ({ row: r, cat: tb.label[lang] })));
  const liquid = allEx.filter(({ row }) => row.vol >= MOVER_MIN_VOLUME && row.chg != null && row.icon && row.id !== "divine");
  const byChg = [...liquid].sort((a, b) => (b.row.chg ?? 0) - (a.row.chg ?? 0));
  const rising = byChg.slice(0, 7);
  const falling = byChg.slice(-7).reverse();
  const traded = [...allEx].filter(({ row }) => row.id !== "divine" && row.icon).sort((a, b) => b.row.vol - a.row.vol).slice(0, 7);
  const find = (id: string) => allEx.find(({ row }) => row.id === id)?.row;

  const q = query.trim().toLowerCase();
  const shown = cur.rows.filter((r) => !q || haystack(r).includes(q));
  const val = (r: Row, k: SortKey): number | string =>
    k === "name" ? nameOf(r, lang) : k === "vol" ? ("n" in r ? r.n : r.vol) : k === "chg" ? r.chg ?? -1e9 : r.v;
  shown.sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    return (typeof x === "string" ? x.localeCompare(y as string, lang) : x - (y as number)) * sort.dir;
  });
  // Los que casi no se venden van al final: su precio no es confiable.
  const rows = [...shown.filter((r) => !isThin(r)), ...shown.filter(isThin)].slice(0, 200);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? <span className="p2-arrow">{sort.dir < 0 ? "▼" : "▲"}</span> : null);
  const hover = (row: Row, kind: Kind, sub?: string) => (e: MouseEvent) => setTip({ row, kind, sub, x: e.clientX, y: e.clientY });

  const date = new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(eco.updated));
  const chaosRow = find("chaos");
  const exRow = find("exalted");

  const moverList = (list: { row: ExchangeRow; cat: string }[], right: (row: ExchangeRow) => ReactNode) =>
    list.length ? <div className="p2-mlist">{list.map((m) => mover(m, right(m.row)))}</div> : <p className="p2-mempty">{t.fewData}</p>;
  const mover = ({ row, cat }: { row: ExchangeRow; cat: string }, right: ReactNode) => (
    <div className="p2-mrow" key={row.id} onMouseMove={hover(row, "currency", cat)} onMouseLeave={() => setTip(null)}>
      {row.icon ? <img className="p2-mrow-ic" src={row.icon} alt="" loading="lazy" /> : <span />}
      <div>
        <div className="p2-mrow-n">{nameOf(row, lang)}</div>
        <div className="p2-mrow-c">{cat}</div>
      </div>
      <div className="p2-mrow-r">{right}</div>
    </div>
  );

  return (
    <main className={`p2 p2-page${stale ? " is-stale" : ""}`} aria-busy={stale}>
      <header className="p2-title">
        <h1>{t.title}</h1>
        <p>{t.lede}</p>
      </header>

      <LeaguePicker league={league} onPick={onLeague} />

      <section className="p2-panel">
        <div className="p2-plate-head"><h2 className="p2-plate">{t.market(baseName(league))}</h2></div>
        <div className="p2-coins">
          <div className="p2-coin">
            <img src={eco.core.divine.icon} alt="" />
            <div><div className="p2-coin-k">{t.reference}</div><div className="p2-coin-v">{nameOf(eco.core.divine, lang)}</div></div>
          </div>
          {([["chaos", chaosRow], ["exalted", exRow]] as const).map(([id, row]) => (
            <div className="p2-coin" key={id}>
              <img src={eco.core[id].icon} alt="" />
              <div>
                <div className="p2-coin-k">{nameOf(eco.core[id], lang)}</div>
                <div className="p2-coin-v num">{fmtAmount(eco.rates[id], lang)} <small>{t.perDivine}</small></div>
              </div>
              {row && (
                <div className="p2-coin-s">
                  <Spark data={row.spark} w={90} h={30} />
                  <Change v={row.chg} lang={lang} /> <span className="p2-flat">{t.days7}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="p2-movers">
        <section className="p2-panel">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.rising}</h2></div>
          {moverList(rising, (r) => <><Price e={eco} v={r.v} lang={lang} block /><Change v={r.chg} lang={lang} /></>)}
        </section>
        <section className="p2-panel">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.falling}</h2></div>
          {moverList(falling, (r) => <><Price e={eco} v={r.v} lang={lang} block /><Change v={r.chg} lang={lang} /></>)}
        </section>
        <section className="p2-panel">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.traded}</h2></div>
          {moverList(traded, (r) => <><Price e={eco} v={r.vol} lang={lang} block /><span className="p2-flat">{t.tradedWord}</span></>)}
        </section>
      </div>

      <section className="p2-panel p2-list">
        <div className="p2-plate-head"><h2 className="p2-plate">{t.priceList}</h2></div>
        {(["currency", "unique"] as Kind[]).filter((kind) => tabs.some((tb) => tb.kind === kind)).map((kind) => (
          <div className="p2-tabrow" key={kind}>
            <span className="p2-tabrow-lbl">{kind === "currency" ? t.exchange : t.uniques}</span>
            <div className="p2-stabs" role="tablist">
              {tabs.filter((tb) => tb.kind === kind).map((tb) => (
                <button
                  key={tb.id}
                  role="tab"
                  aria-selected={tb.id === cur.id}
                  className={`p2-stab${tb.id === cur.id ? " is-on" : ""}`}
                  onClick={() => setTabId(tb.id)}
                >
                  {tb.label[lang]}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="p2-tools">
          <input
            className="p2-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchTab}
            aria-label={t.searchTab}
          />
          <span className="p2-count">{t.count(cur.kind === "unique" && !uniq ? cur.count : shown.length)}</span>
        </div>
        <div className="p2-tablewrap">
          <table className="p2-table">
            <thead>
              <tr>
                <th />
                <th onClick={() => toggleSort("name")}>{t.colItem}{arrow("name")}</th>
                <th className="r" onClick={() => toggleSort("v")}>{t.colPrice}{arrow("v")}</th>
                <th className="p2-hide-sm">{t.colWeek}</th>
                <th className="r" onClick={() => toggleSort("chg")}>{t.colChange}{arrow("chg")}</th>
                <th className="r p2-hide-sm" onClick={() => toggleSort("vol")}>{cur.kind === "unique" ? t.colListings : t.colVolume}{arrow("vol")}</th>
              </tr>
            </thead>
            <tbody onMouseLeave={() => setTip(null)}>
              {cur.kind === "unique" && !uniq && (
                <tr><td colSpan={6} className="p2-loading">{t.loading}</td></tr>
              )}
              {rows.map((r) => {
                const u = "n" in r;
                const thin = isThin(r);
                return (
                  <tr key={r.id} onMouseMove={hover(r, cur.kind)}>
                    <td className="p2-ic"><div className="p2-icbox">{r.icon && <img src={r.icon} alt="" loading="lazy" />}</div></td>
                    <td>
                      <div className={`p2-n${u ? " is-unique" : ""}`}>{nameOf(r, lang)}</div>
                      {u && <div className="p2-b">{lang === "es" ? r.base : r.baseEn}</div>}
                    </td>
                    <td className="r p2-pr">
                      <Price e={eco} v={r.v} lang={lang} />
                      {thin && <span className="p2-low">{t.fewSales}</span>}
                    </td>
                    <td className="p2-hide-sm"><Spark data={r.spark} w={96} h={26} /></td>
                    <td className="r p2-ch"><Change v={thin ? null : r.chg} lang={lang} /></td>
                    <td className="r p2-vo p2-hide-sm">{u ? fmtAmount(r.n, lang) : <Price e={eco} v={r.vol} lang={lang} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="p2-note">{t.note(eco.league, date)}</p>
      {tip && <Tooltip tip={tip} eco={eco} lang={lang} />}
    </main>
  );
}

/**
 * Qué liga mirar: la liga en sí (pestañas como las del alijo) y, aparte, si es
 * hardcore. Son dos preguntas distintas y así se leen, en vez de seis botones
 * con "HC" delante de la mitad.
 */
function LeaguePicker({ league, onPick }: { league: League; onPick: (l: League) => void }) {
  const t = useCopy().poe2;
  const hc = league.hardcore;
  const other = sibling(league, !hc);
  return (
    <div className="p2-league" role="group" aria-label={t.league}>
      <span className="p2-tabrow-lbl">{t.league}</span>
      <div className="p2-stabs" role="radiogroup" aria-label={t.league}>
        {BASE_LEAGUES.map((b) => {
          const target = sibling(b, hc) ?? b;
          const on = baseName(b) === baseName(league);
          return (
            <button
              key={b.slug}
              role="radio"
              aria-checked={on}
              className={`p2-stab${on ? " is-on" : ""}`}
              onClick={() => !on && onPick(target)}
            >
              {baseName(b)}
              {b.permanent && <em className="p2-stab-note">{t.permanent}</em>}
            </button>
          );
        })}
      </div>
      <div className="p2-mode" role="radiogroup" aria-label={t.mode}>
        {([false, true] as const).map((want) => {
          const target = want === hc ? league : other;
          return (
            <button
              key={String(want)}
              role="radio"
              aria-checked={want === hc}
              className={`p2-mode-b${want === hc ? " is-on" : ""}${want ? " is-hc" : ""}`}
              disabled={!target}
              onClick={() => target && want !== hc && onPick(target)}
            >
              {want ? t.hardcore : t.softcore}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Price({ e, v, lang, block }: { e: Economy; v: number; lang: Lang; block?: boolean }) {
  const p = pickCurrency(e, v);
  const c = e.core[p.cur];
  return (
    <span className={`p2-price${block ? " is-block" : ""}`}>
      <span className="num">{fmtAmount(p.amount, lang)}</span>
      <img src={c.icon} alt={nameOf(c, lang)} title={nameOf(c, lang)} />
    </span>
  );
}

function Change({ v, lang }: { v: number | null; lang: Lang }) {
  if (v == null) return <span className="p2-flat">—</span>;
  const cls = v > 2 ? "p2-up" : v < -2 ? "p2-down" : "p2-flat";
  const txt = new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: Math.abs(v) >= 10 ? 0 : 1 }).format(v);
  return <span className={`${cls} num`}>{v > 0 ? "+" : ""}{txt}%</span>;
}

/** Siete días en una línea: % acumulado desde el primero, con la línea del cero punteada. */
function Spark({ data, w, h }: { data: (number | null)[]; w: number; h: number }) {
  const pts = data.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg className="p2-spark" width={w} height={h} aria-hidden="true" />;
  const vs = pts.map((p) => p[1]);
  let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const n = data.length - 1;
  const X = (i: number) => 2 + (i / n) * (w - 4);
  const Y = (v: number) => 2 + (1 - (v - lo) / (hi - lo)) * (h - 4);
  const last = vs[vs.length - 1];
  const col = last > 2 ? "var(--p2-up)" : last < -2 ? "var(--p2-down)" : "var(--p2-sand)";
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg className="p2-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={2} x2={w - 2} y1={Y(0)} y2={Y(0)} stroke="#3a3226" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={X(li)} cy={Y(lv)} r={2.2} fill={col} />
    </svg>
  );
}

/** El tooltip del juego: cabecera con el color de la rareza, separadores y el precio. */
function Tooltip({ tip, eco, lang }: { tip: Tip; eco: Economy; lang: Lang }) {
  const t = useCopy().poe2;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: tip.x + 22, top: tip.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = tip.x + 22;
    if (left + w > window.innerWidth - 8) left = tip.x - w - 22;
    const top = Math.max(8, Math.min(tip.y - h / 2, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [tip.x, tip.y, tip.row]);

  const r = tip.row;
  const u = "n" in r;
  const div = r.v, chaos = div * eco.rates.chaos, ex = div * eco.rates.exalted;
  const eq: string[] = [];
  if (div < 1) eq.push(`${fmtAmount(div, lang)} div`);
  if (div >= 1) eq.push(`${fmtAmount(chaos, lang)} ${t.chaos}`);
  if (ex >= 1) eq.push(`${fmtAmount(ex, lang)} ${t.exalted}`);
  const mods = u ? (lang === "es" ? r.mods : r.modsEn) : [];
  const imps = u ? (lang === "es" ? r.imps : r.impsEn) : [];

  return (
    <div ref={ref} className={`p2-tt is-${tip.kind}`} style={pos} role="tooltip">
      <div className="p2-tt-head">
        <div>{nameOf(r, lang)}</div>
        {u && <div className="p2-tt-base">{lang === "es" ? r.base : r.baseEn}</div>}
      </div>
      <div className="p2-tt-body">
        {u && r.lvl > 0 && (<><div><span className="p2-tt-k">{t.reqLevel} </span><span className="p2-tt-w">{r.lvl}</span></div><div className="p2-tt-sep" /></>)}
        {imps.map((m, i) => <div className="p2-tt-mod" key={`i${i}`}>{m}</div>)}
        {imps.length > 0 && <div className="p2-tt-sep" />}
        {mods.map((m, i) => <div className="p2-tt-mod" key={i}>{m}</div>)}
        {u && r.corrupted && <div className="p2-tt-corr">{t.corrupted}</div>}
        <div className="p2-tt-sep" />
        <div className="p2-tt-k">{t.priceIn(eco.league)}</div>
        <div className="p2-tt-price"><Price e={eco} v={div} lang={lang} /></div>
        <div className="p2-tt-k is-small">{eq.join(" · ")}</div>
        {u && <div className="p2-tt-k is-small">{t.listings(fmtAmount(r.n, lang))}</div>}
        {tip.sub && <div className="p2-tt-k is-small">{tip.sub}</div>}
      </div>
    </div>
  );
}
