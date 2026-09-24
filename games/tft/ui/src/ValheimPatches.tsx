/**
 * La Crónica de Valheim (2026-09-24): una edición por parche, con las notas
 * oficiales de Iron Gate, cada línea marcada como novedad, cambio o arreglo, y
 * los objetos, criaturas y biomas que nombra enlazados a su ficha con su ícono.
 *
 * Mismo esquema que el diario de PoE2 (edición + hemeroteca al costado) con la
 * madera y el latón de la sección. Las notas salen sólo en inglés: el español
 * se carga a mano (ver `games/valheim/pipeline/patches.py`).
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, type Lang } from "./i18n";
import RouteLink from "./RouteLink";
import { useValheimCopy } from "./valheimCopy";
import { iconUrl, artUrl, loadIndex, peekIndex, type IndexEntry } from "./valheimData";
import { coverOf, loadEdition, loadEditions, peekEdition, peekEditions, type Body, type Dir, type Edition, type EditionMeta, type Line } from "./valheimPatchesData";
import type { Nav, To } from "./ValheimParts";

const DIRS: Dir[] = ["new", "mid", "fix"];
const MARK: Record<Dir, string> = { new: "✦", mid: "◆", fix: "⚒" };

const fmtDate = (d: string, lang: Lang, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", { ...opts, timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

function useEditions(): EditionMeta[] | null {
  const [eds, setEds] = useState<EditionMeta[] | null>(peekEditions);
  useEffect(() => {
    let vivo = true;
    if (!eds) loadEditions().then((e) => vivo && setEds(e)).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  return eds;
}

function useRefIndex(): Map<string, IndexEntry> | null {
  const build = (i: IndexEntry[]) => new Map(i.map((e) => [`${e.tab}/${e.slug}`, e]));
  const [idx, setIdx] = useState<Map<string, IndexEntry> | null>(() => {
    const i = peekIndex();
    return i ? build(i) : null;
  });
  useEffect(() => {
    let vivo = true;
    if (!idx) loadIndex().then((i) => vivo && setIdx(build(i))).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  return idx;
}

export default function ValheimPatches({ detail, to, navigate }: { detail?: string; to: To; navigate: Nav }) {
  const t = useValheimCopy().pat;
  const { lang } = useLang();
  const eds = useEditions();
  const meta = eds ? (detail ? eds.find((e) => e.slug === detail) : eds[0]) : null;
  const [ed, setEd] = useState<Edition | null>(() => (meta ? peekEdition(meta.slug) : null));
  useEffect(() => {
    if (!meta) return;
    let vivo = true;
    const ya = peekEdition(meta.slug);
    if (ya) setEd(ya);
    else loadEdition(meta.slug).then((e) => vivo && setEd(e)).catch(() => undefined);
    return () => { vivo = false; };
  }, [meta?.slug]);

  if (!eds) return <p className="vh-loading">{t.loading}</p>;
  if (!meta) return <p className="vh-loading">{t.notFound}</p>;
  const i = eds.indexOf(meta);
  const older = eds[i + 1] ?? null;
  const newer = i > 0 ? eds[i - 1] : null;

  return (
    <>
      <header className="vh-head">
        <h1>{t.title}</h1>
        <p>{t.lede}</p>
      </header>
      <div className="vh-pat">
        <div className="vh-pat-main">
          {!ed || ed.slug !== meta.slug ? <p className="vh-loading">{t.loading}</p> : <EditionView ed={ed} meta={meta} lang={lang} to={to} navigate={navigate} />}
          <nav className="vh-pager">
            {older ? <RouteLink to={to("patches", older.slug)} onNavigate={navigate}>← {t.prev} · {older.version}</RouteLink> : <span />}
            {newer ? <RouteLink to={to("patches", newer.slug)} onNavigate={navigate}>{t.next} · {newer.version} →</RouteLink> : <span />}
          </nav>
        </div>
        <Archive eds={eds} current={meta.slug} to={to} navigate={navigate} lang={lang} />
      </div>
    </>
  );
}

function EditionView({ ed, meta, lang, to, navigate }: { ed: Edition; meta: EditionMeta; lang: Lang; to: To; navigate: Nav }) {
  const t = useValheimCopy().pat;
  const index = useRefIndex();
  const [only, setOnly] = useState<Dir | null>(null);
  useEffect(() => setOnly(null), [ed.slug]);
  const es = lang === "es" ? ed.es ?? null : null;
  const body: Body = es ?? ed;
  const hotfixes = (ed.hotfixes ?? []).map((h, i) => ({ ...h, ...(es?.hotfixes?.[i] ?? {}) }));
  const title = (lang === "es" && ed.title.es) || ed.title.en || null;
  const cover = coverOf(meta);
  const sections = body.sections ?? [];

  const refs = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of sections) for (const l of s.lines ?? []) for (const r of l.refs ?? []) n.set(r, (n.get(r) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [sections]);
  const counts = meta.counts;
  const all = counts.new + counts.mid + counts.fix;
  const keep = (l: Line) => !only || l.dir === only;
  const visible = sections
    .map((s) => ({ ...s, lines: (s.lines ?? []).filter(keep) }))
    // Los separadores ("Resumen", "Notas completas") quedan sólo si viene algo abajo.
    .filter((s, i, arr) => s.lines.length > 0 || (s.major && arr.slice(i + 1).some((x) => !x.major && x.lines.length > 0)));
  const intro = body.intro ?? [];
  const ctx: Ctx = { index, lang, to, navigate };

  return (
    <article className="vh-frame">
      <div className="vh-inset vh-pat-ed">
        <header className={`vh-pat-hero${cover.logo ? " is-logo" : ""}${meta.kind === "content" ? " is-content" : ""}`}>
          <img className="vh-pat-cover" src={cover.src} alt="" width={960} height={540} />
          <div className="vh-pat-cap">
            <span className="vh-chip is-on">{meta.kind === "content" ? t.update : t.patch}</span>
            <h2>{meta.version}{title && <small>{title}</small>}</h2>
            <p>
              {fmtDate(meta.date, lang, { dateStyle: "long" })} ·{" "}
              <a href={ed.url} target="_blank" rel="noopener noreferrer">{t.official} ↗</a>
            </p>
          </div>
        </header>

        {all > 0 && (
          <div className="vh-opts vh-pat-seals" role="group" aria-label={t.filter}>
            <button className="vh-chip" aria-pressed={!only} onClick={() => setOnly(null)}>{t.all} <span className="vh-n">{all}</span></button>
            {DIRS.map((d) => (
              <button key={d} className={`vh-chip vh-pat-d is-${d}`} aria-pressed={only === d} disabled={!counts[d]} onClick={() => setOnly(only === d ? null : d)}>
                <i aria-hidden="true">{MARK[d]}</i> {t[d]} <span className="vh-n">{counts[d]}</span>
              </button>
            ))}
          </div>
        )}

        {lang === "es" && !ed.es && <p className="vh-pat-warn">{t.noSpanish}</p>}

        {intro.length > 0 && !only && <Letter paras={intro} />}

        {refs.length > 0 && index && !only && (
          <section>
            <p className="vh-h2">{t.touches} · {refs.length}</p>
            <div className="vh-mosaic">
              {refs.slice(0, 64).map((r) => {
                const e = index.get(r);
                if (!e) return null;
                const name = lang === "es" ? e.es || e.en : e.en;
                return (
                  <RouteLink key={r} to={to(e.tab, e.slug)} onNavigate={navigate} className="vh-slot" >
                    <span title={name} style={{ display: "contents" }}>
                      <RefPic e={e} alt={name} />
                    </span>
                  </RouteLink>
                );
              })}
            </div>
          </section>
        )}

        {visible.map((s, i) =>
          s.major ? (
            <h3 key={i} className="vh-pat-major"><span className="vh-plate">{s.title}</span></h3>
          ) : (
            <section key={i} className="vh-pat-sec">
              {s.title && <p className="vh-h2">{s.title}</p>}
              <ul className="vh-pat-lines">{s.lines.map((l, k) => <LineView key={k} l={l} ctx={ctx} />)}</ul>
            </section>
          ),
        )}

        {hotfixes.length > 0 && !only && (
          <section>
            <p className="vh-h2">{t.hotfixes}</p>
            {hotfixes.map((h, i) => (
              <details className="vh-pat-hf" key={i}>
                <summary><span>{h.title}</span><small>{fmtDate(h.date, lang, { day: "numeric", month: "short", year: "numeric" })}</small></summary>
                {(h.intro ?? []).map((p, k) => <p key={k} className="vh-pat-note">{p}</p>)}
                {(h.sections ?? []).map((s, k) => (
                  <div key={k} className="vh-pat-sec">
                    {s.title && !s.major && <p className="vh-h2">{s.title}</p>}
                    <ul className="vh-pat-lines">{(s.lines ?? []).map((l, j) => <LineView key={j} l={l} ctx={ctx} />)}</ul>
                  </div>
                ))}
              </details>
            ))}
          </section>
        )}
      </div>
    </article>
  );
}

/** La carta de los desarrolladores: los dos primeros párrafos y el resto plegado. */
function Letter({ paras }: { paras: string[] }) {
  const t = useValheimCopy().pat;
  const head = paras.slice(0, 2);
  const rest = paras.slice(2);
  return (
    <section className="vh-pat-letter">
      <p className="vh-h2">{t.letter}</p>
      {head.map((p, i) => <p key={i}>{p}</p>)}
      {rest.length > 0 && (
        <details>
          <summary>{t.readMore}</summary>
          {rest.map((p, i) => <p key={i}>{p}</p>)}
        </details>
      )}
    </section>
  );
}

function RefPic({ e, alt = "" }: { e: IndexEntry; alt?: string }) {
  if (e.icon) return <img src={iconUrl(e.icon)} alt={alt} loading="lazy" width={42} height={42} />;
  if (e.art) return <img src={artUrl(e.art)} alt={alt} loading="lazy" width={42} height={42} style={{ objectFit: "cover", width: "100%", height: "100%" }} />;
  return null;
}

interface Ctx { index: Map<string, IndexEntry> | null; lang: Lang; to: To; navigate: Nav }

function LineView({ l, ctx }: { l: Line; ctx: Ctx }) {
  if (l.note) return <li className="vh-pat-note">{l.text}</li>;
  return (
    <li className={`vh-pat-line${l.dir ? ` is-${l.dir}` : ""}`}>
      <span className="vh-pat-mark" aria-hidden="true">{l.dir ? MARK[l.dir] : "·"}</span>
      <span>{withRefs(l, ctx)}</span>
    </li>
  );
}

/**
 * El texto con cada nombre de la enciclopedia hecho enlace con su ícono. Igual
 * que el pipeline: los nombres de dos palabras o más sin mirar mayúsculas, los
 * de una respetándolas.
 */
function withRefs(l: Line, { index, lang, to, navigate }: Ctx): ReactNode {
  if (!l.refs?.length || !index) return l.text;
  const names = l.refs
    .map((r) => index.get(r))
    .filter((e): e is IndexEntry => !!e)
    .flatMap((e) => [...new Set([lang === "es" ? e.es : e.en, e.en, e.es])].filter(Boolean).map((n) => ({ n, e })))
    .sort((a, b) => b.n.length - a.n.length);
  if (!names.length) return l.text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\d-])(${names.map((x) => esc(x.n)).join("|")})(?![\\p{L}\\d-])`, "giu");
  const byName = new Map(names.map((x) => [x.n.toLowerCase(), x]));
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of l.text.matchAll(re)) {
    const hit = byName.get(m[1].toLowerCase());
    if (!hit || (!hit.n.includes(" ") && hit.n !== m[1])) continue;
    out.push(<Fragment key={`t${last}`}>{l.text.slice(last, m.index)}</Fragment>);
    out.push(
      <RouteLink key={`r${m.index}`} to={to(hit.e.tab, hit.e.slug)} onNavigate={navigate} className="vh-pat-name">
        <span className="vh-slot is-xs"><RefPic e={hit.e} /></span>
        {m[1]}
      </RouteLink>,
    );
    last = m.index! + m[1].length;
  }
  out.push(<Fragment key="fin">{l.text.slice(last)}</Fragment>);
  return out;
}

/** La hemeroteca: las ediciones por año, con su versión, fecha y conteos. */
function Archive({ eds, current, to, navigate, lang }: { eds: EditionMeta[]; current: string; to: To; navigate: Nav; lang: Lang }) {
  const t = useValheimCopy().pat;
  const years = [...new Set(eds.map((e) => e.date.slice(0, 4)))];
  return (
    <aside className="vh-pat-archive vh-box" aria-label={t.archive}>
      <h2 className="vh-h2">{t.archive}</h2>
      {years.map((y) => (
        <div key={y} className="vh-pat-year">
          <h3>{y}</h3>
          <ol>
            {eds.filter((e) => e.date.startsWith(y)).map((e) => {
              const name = (lang === "es" && e.title.es) || e.title.en;
              return (
                <li key={e.slug}>
                  <RouteLink to={to("patches", e.slug)} onNavigate={navigate} active={e.slug === current} className={`vh-pat-edlink${e.kind === "content" ? " is-content" : ""}`}>
                    <b>{e.version}</b>
                    <small>{fmtDate(e.date, lang, { day: "numeric", month: "short" })}</small>
                    {name && <em>{name}</em>}
                  </RouteLink>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </aside>
  );
}
