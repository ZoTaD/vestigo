import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, type Lang } from "./i18n";
import type { Route } from "./route";
import RouteLink from "./RouteLink";
import { usePoe2Copy } from "./poe2Copy";
import { useItemTip } from "./Poe2Tooltip";
import { loadIndex, nameOf, type IndexEntry } from "./poe2EncyclopediaData";
import {
  EDITIONS,
  editionRefs,
  loadAllEditions,
  loadEdition,
  seriesOf,
  walk,
  type Dir,
  type Edition,
  type EditionMeta,
  type Line,
} from "./poe2PatchesData";

/**
 * Diario de parches de PoE2 (2026-09-23): una edición por parche, con las notas
 * oficiales en el idioma del lector, cada línea marcada como mejora, nerfeo,
 * novedad o arreglo, y las gemas y únicos que nombra con su dibujo y su tooltip.
 *
 * La cabecera usa el banner de desafíos del juego (el de la liga del parche si
 * lo hay) y la hemeroteca el estandarte de liga de la creación de personaje.
 */

type Nav = (route: Route) => void;

/** Cada serie de versiones con su nombre y el emblema de su liga (texturas del juego). */
const SERIES: Record<string, { name: string; emblem: string }> = {
  "0.5": { name: "Return of the Ancients", emblem: "/poe2/ui/league-runes-of-aldur.webp" },
  "0.4": { name: "The Last of the Druids", emblem: "/poe2/ui/league-dawn-of-the-hunt.webp" },
  "0.3": { name: "The Third Edict", emblem: "/poe2/ui/league-abyss.webp" },
};
/** Las ediciones de la liga evento Forbidden Rites llevan su banner; el resto, el genérico. */
const bannerOf = (v: string) => (/^0\.5\.5/.test(v) ? "/poe2/ui/banner-forbidden-rites.webp" : "/poe2/ui/banner-challenges.webp");
const RARITY: Record<string, string> = { gems: "gem", uniques: "unique", bases: "normal", currency: "currency" };
const DIRS = ["up", "down", "new", "fix"] as const;
const MARK: Record<Dir, string> = { up: "▲", down: "▼", new: "✦", fix: "⚒", mid: "◆" };

export default function Poe2Patches({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = usePoe2Copy().pat;
  const { lang } = useLang();
  const meta = EDITIONS.find((e) => e.slug === route.detail) ?? EDITIONS[0];
  const [ed, setEd] = useState<Edition | null>(null);
  const [index, setIndex] = useState<Map<string, IndexEntry> | null>(null);
  const [only, setOnly] = useState<Dir | null>(null);
  useEffect(() => {
    let vivo = true;
    setOnly(null);
    loadEdition(meta.slug).then((e) => vivo && setEd(e));
    return () => { vivo = false; };
  }, [meta.slug]);
  useEffect(() => {
    let vivo = true;
    loadIndex().then((i) => vivo && setIndex(new Map(i.map((e) => [e.id, e]))));
    return () => { vivo = false; };
  }, []);
  const to = (slug?: string): Route => ({ ...route, view: "poe2", p2Section: "patches", detail: slug });

  return (
    <main className="p2 p2-page p2-pat">
      <header className="p2-title">
        <h1>{t.title}</h1>
        <p>{t.lede}</p>
      </header>
      <div className="p2-pat-cols">
        <div className="p2-pat-main">
          {!ed || ed.slug !== meta.slug ? (
            <p className="p2-loading">{t.loading}</p>
          ) : (
            <EditionView ed={ed} meta={meta} lang={lang} index={index} only={only} setOnly={setOnly} route={route} navigate={navigate} />
          )}
        </div>
        <Archive current={meta.slug} to={to} navigate={navigate} lang={lang} />
      </div>
    </main>
  );
}

function EditionView({
  ed, meta, lang, index, only, setOnly, route, navigate,
}: {
  ed: Edition; meta: EditionMeta; lang: Lang; index: Map<string, IndexEntry> | null;
  only: Dir | null; setOnly: (d: Dir | null) => void; route: Route; navigate: Nav;
}) {
  const t = usePoe2Copy().pat;
  const { bind, node } = useItemTip();
  const es = lang === "es" && ed.es ? ed.es : null;
  const sections = es ?? ed.en;
  const title = (lang === "es" && ed.title.es) || ed.title.en;
  const url = (lang === "es" && ed.url.es) || ed.url.en;
  const date = new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(ed.date + "T12:00:00Z"));
  const refs = useMemo(() => editionRefs(sections).filter((id) => index?.has(id)), [sections, index]);
  const counts = useMemo(() => {
    const c: Record<Dir | "all", number> = { up: 0, down: 0, new: 0, fix: 0, mid: 0, all: 0 };
    for (const s of sections) for (const l of walk(s.lines)) {
      c.all++;
      if (l.dir) c[l.dir]++;
    }
    return c;
  }, [sections]);
  const ctx: LineCtx = { lang, index, bind, route, navigate };
  const keep = (l: Line): boolean => !only || l.dir === only || (l.kids ?? []).some(keep);
  const visible = sections.map((s) => ({ ...s, lines: s.lines.filter(keep) })).filter((s) => s.lines.length > 0);

  return (
    <article className="p2-pat-ed">
      <header className="p2-pat-hero" style={{ ["--banner" as string]: `url(${bannerOf(ed.version)})` }}>
        <div className="p2-pat-hero-in">
          <div className="p2-pat-kind">{ed.kind === "content" ? t.content : t.patch}</div>
          <h2 className="p2-pat-ver">{ed.version}</h2>
          <div className="p2-pat-title">{title}</div>
          <div className="p2-pat-date">
            {date} ·{" "}
            <a href={url} target="_blank" rel="noopener noreferrer">{t.official} ↗</a>
          </div>
        </div>
      </header>

      <div className="p2-pat-seals" role="group" aria-label={t.filter}>
        <button className={`p2-pat-seal${!only ? " is-on" : ""}`} onClick={() => setOnly(null)}>
          <b>{counts.all}</b>
          <span>{t.all}</span>
        </button>
        {DIRS.map((d) => (
          <button key={d} className={`p2-pat-seal is-${d}${only === d ? " is-on" : ""}`} disabled={!counts[d]} onClick={() => setOnly(only === d ? null : d)}>
            <b><i aria-hidden="true">{MARK[d]}</i> {counts[d]}</b>
            <span>{t[d]}</span>
          </button>
        ))}
      </div>

      {lang === "es" && !ed.es && <p className="p2-pat-warn">{t.noSpanish}</p>}

      {refs.length > 0 && index && (
        <section className="p2-panel p2-pat-touch">
          <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.touches}</h2></div>
          <div className="p2-pat-refs">
            {refs.slice(0, 48).map((id) => {
              const e = index.get(id)!;
              return (
                <RouteLink key={id} to={{ ...route, view: "poe2", p2Section: "encyclopedia", detail: id }} onNavigate={navigate} className={`p2-pat-ref is-${RARITY[e.cat]}`} {...bind(id)}>
                  <span className={`p2-enc-art${e.cat === "gems" ? " is-gem" : ""}`}>{e.icon && <img src={e.icon} alt="" loading="lazy" />}</span>
                  <span className="p2-enc-name">{nameOf(e, lang)}</span>
                </RouteLink>
              );
            })}
          </div>
        </section>
      )}

      {visible.map((s, i) => (
        <section className="p2-panel p2-pat-sec" key={i}>
          {s.title && <div className="p2-plate-head is-small"><h3 className="p2-plate">{s.title}</h3></div>}
          <ul className="p2-pat-lines">{s.lines.map((l, k) => <LineView key={k} l={l} ctx={ctx} keep={keep} />)}</ul>
        </section>
      ))}

      {ed.hotfixes.length > 0 && !only && (
        <section className="p2-panel p2-pat-sec">
          <div className="p2-plate-head is-small"><h3 className="p2-plate">{t.hotfixes}</h3></div>
          {ed.hotfixes.map((h, i) => {
            const lines = (lang === "es" && h.es) || h.lines;
            return (
              <details className="p2-pat-hf" key={i}>
                <summary>
                  <span>{h.title}</span>
                  <span className="p2-tt-k">{h.date}</span>
                </summary>
                {lang === "es" && !h.es && <p className="p2-pat-warn">{t.onlyEnglishHotfix}</p>}
                <ul className="p2-pat-lines">{lines.map((l, k) => <LineView key={k} l={l} ctx={ctx} keep={() => true} />)}</ul>
              </details>
            );
          })}
        </section>
      )}
      {node}
    </article>
  );
}

interface LineCtx {
  lang: Lang;
  index: Map<string, IndexEntry> | null;
  bind: ReturnType<typeof useItemTip>["bind"];
  route: Route;
  navigate: Nav;
}

function LineView({ l, ctx, keep }: { l: Line; ctx: LineCtx; keep: (l: Line) => boolean }) {
  const kids = (l.kids ?? []).filter(keep);
  return (
    <li className={`p2-pat-line${l.dir ? ` is-${l.dir}` : ""}`}>
      <span className="p2-pat-mark" aria-hidden="true">{l.dir ? MARK[l.dir] : "·"}</span>
      <span className="p2-pat-text">{withRefs(l, ctx)}</span>
      {kids.length > 0 && <ul className="p2-pat-lines is-kids">{kids.map((k, i) => <LineView key={i} l={k} ctx={ctx} keep={keep} />)}</ul>}
    </li>
  );
}

/** El texto de la línea con cada nombre de la enciclopedia hecho enlace, en su color y con su tooltip. */
function withRefs(l: Line, { lang, index, bind, route, navigate }: LineCtx): ReactNode {
  if (!l.refs?.length || !index) return l.text;
  const names = l.refs
    .map((id) => index.get(id))
    .filter((e): e is IndexEntry => !!e)
    .flatMap((e) => [...new Set([nameOf(e, lang), e.en, e.es])].map((n) => ({ n, e })))
    .sort((a, b) => b.n.length - a.n.length);
  if (!names.length) return l.text;
  const re = new RegExp(`(${names.map((x) => x.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const byName = new Map(names.map((x) => [x.n, x.e]));
  return l.text.split(re).map((part, i) => {
    const e = byName.get(part);
    if (!e) return <Fragment key={i}>{part}</Fragment>;
    return (
      <RouteLink key={i} to={{ ...route, view: "poe2", p2Section: "encyclopedia", detail: e.id }} onNavigate={navigate} className={`p2-pat-name is-${RARITY[e.cat]}`} {...bind(e.id)}>
        {e.icon && <img src={e.icon} alt="" loading="lazy" />}
        {part}
      </RouteLink>
    );
  });
}

/** La hemeroteca: cada serie bajo el estandarte de su liga, con sus ediciones. */
function Archive({ current, to, navigate, lang }: { current: string; to: (s?: string) => Route; navigate: Nav; lang: Lang }) {
  const t = usePoe2Copy().pat;
  const series = [...new Set(EDITIONS.map((e) => seriesOf(e.version)))];
  const fmt = (d: string) => new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  return (
    <aside className="p2-pat-archive" aria-label={t.archive}>
      <h2 className="p2-pat-archive-h">{t.archive}</h2>
      {series.map((s) => (
        <div className="p2-pat-series" key={s}>
          <div className="p2-pat-standard">
            {SERIES[s] && <img src={SERIES[s].emblem} alt="" />}
            <div className="p2-pat-standard-v">{s}</div>
            {SERIES[s] && <div className="p2-pat-standard-n">{SERIES[s].name}</div>}
          </div>
          <ol className="p2-pat-eds">
            {EDITIONS.filter((e) => seriesOf(e.version) === s).map((e) => (
              <li key={e.slug}>
                <RouteLink to={to(e.slug)} onNavigate={navigate} className={`p2-pat-edlink${e.slug === current ? " is-on" : ""}${e.kind === "content" ? " is-content" : ""}`} active={e.slug === current}>
                  <span className="p2-pat-edv">{e.version}</span>
                  <span className="p2-pat-edd">{fmt(e.date)}</span>
                  <span className="p2-pat-edc">
                    {e.counts.up > 0 && <i className="is-up">▲{e.counts.up}</i>}
                    {e.counts.down > 0 && <i className="is-down">▼{e.counts.down}</i>}
                    {e.counts.new > 0 && <i className="is-new">✦{e.counts.new}</i>}
                  </span>
                </RouteLink>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </aside>
  );
}

/**
 * El historial de una ficha de la enciclopedia: las líneas de parche que la
 * nombran, de la más nueva a la más vieja. Pide todas las ediciones (~700 KB,
 * una vez por visita) sólo cuando se abre una ficha.
 */
export function EntryHistory({ id, route, navigate }: { id: string; route: Route; navigate: Nav }) {
  const t = usePoe2Copy();
  const { lang } = useLang();
  const [hits, setHits] = useState<{ ed: Edition; lines: Line[] }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    loadAllEditions().then((eds) => {
      if (!vivo) return;
      const out: { ed: Edition; lines: Line[] }[] = [];
      for (const ed of eds) {
        const sections = (lang === "es" && ed.es) || ed.en;
        const lines: Line[] = [];
        for (const s of sections) for (const l of walk(s.lines)) if (l.refs?.includes(id)) lines.push(l);
        if (lines.length) out.push({ ed, lines });
      }
      setHits(out);
    });
    return () => { vivo = false; };
  }, [id, lang]);
  if (!hits || hits.length === 0) return null;
  return (
    <section className="p2-panel p2-enc-hist">
      <div className="p2-plate-head is-small"><h2 className="p2-plate">{t.enc.patches}</h2></div>
      <ol className="p2-enc-hist-list">
        {hits.slice(0, 10).map(({ ed, lines }) => (
          <li key={ed.slug}>
            <RouteLink to={{ ...route, view: "poe2", p2Section: "patches", detail: ed.slug }} onNavigate={navigate} className="p2-enc-hist-v">
              {ed.version}
            </RouteLink>
            <ul className="p2-pat-lines">
              {lines.map((l, i) => (
                <li key={i} className={`p2-pat-line${l.dir ? ` is-${l.dir}` : ""}`}>
                  <span className="p2-pat-mark" aria-hidden="true">{l.dir ? MARK[l.dir] : "·"}</span>
                  <span className="p2-pat-text">{l.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
