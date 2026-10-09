/**
 * La pestaña Parches de Rust (2026-10-09): la lista de actualizaciones (`/rust/patches`) y cada edición
 * (`/rust/patches/livestock`), con las notas oficiales de Steam. En español, la edición sale traducida si está
 * traducida entera; si no, en inglés con un aviso. Plan: docs/superpowers/plans/2026-10-09-rust-parches.md.
 */
import type { ReactNode } from "react";
import itemSlugsEs from "@rust/site/slugs-es.json";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import { registerRustSlugs, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { usePatchesCopy } from "./copy";
import { loadEdition, loadIndex, peekEdition, peekIndex, type Block, type Edition, type IndexRow } from "./data";
import "../../styles/rust-patches.css";

// Las notas enlazan fichas de Objetos: en español, con su slug (como Raideo).
registerRustSlugs(itemSlugsEs);

type Nav = (r: Route) => void;

export default function RustPatches({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const ed = useLoad(slug, () => peekEdition(slug!), () => loadEdition(slug!));
  const needList = slug === null || ed.value === null;
  const list = useLoad(needList ? "index" : null, () => peekIndex() ?? undefined, loadIndex);
  if (ed.failed) return <RsLoading onRetry={ed.retry} />;
  if (ed.value) return <EditionPage ed={ed.value} route={route} navigate={navigate} key={ed.value.slug} />;
  if (slug !== null && ed.value === undefined) return <RsLoading />;
  if (list.failed) return <RsLoading onRetry={list.retry} />;
  if (!list.value) return <RsLoading />;
  return <PatchList rows={list.value.editions} route={route} navigate={navigate} missing={slug !== null} />;
}

export const formatDay = (date: string, locale: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function PatchList({ rows, route, navigate, missing }: { rows: IndexRow[]; route: Route; navigate: Nav; missing: boolean }) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <main className="rs-main rs-patches">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(rows.length)}</p>
        {missing && <p className="rs-missing">{t.missing}</p>}
      </section>
      <ul className="rs-patch-list">
        {rows.map((r, i) => (
          <li key={r.slug}>
            <RouteLink className="rs-patch-card" to={{ ...route, view: "rust", rsSection: "patches", detail: r.slug }} onNavigate={navigate}>
              <span className="rs-patch-cover">
                {r.cover && <img src={`/rust/patches/${r.cover}.webp`} alt="" width={320} height={180} loading={i < 3 ? undefined : "lazy"} decoding="async" />}
              </span>
              <span className="rs-patch-txt">
                <time dateTime={r.date}>{formatDay(r.date, locale)}</time>
                <b>{r.name}</b>
                <span className="rs-patch-heads">{(lang === "es" && r.headsEs ? r.headsEs : r.heads).slice(0, 4).join(" · ")}</span>
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </main>
  );
}

function EditionPage({ ed, route, navigate }: { ed: Edition; route: Route; navigate: Nav }) {
  const t = usePatchesCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const body = lang === "es" && ed.es ? ed.es : ed;
  const english = lang === "es" && !ed.es;
  const block = (b: Block, i: number) =>
    b.t === "code" ? (
      <pre key={i}>
        <code>{b.text}</code>
      </pre>
    ) : (
      <p key={i}>{withRefs(b, route, navigate)}</p>
    );
  return (
    <main className="rs-main rs-patches rs-ficha">
      <RouteLink className="rs-back" to={{ ...route, view: "rust", rsSection: "patches", detail: undefined }} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <article className="rs-pnl rs-patch">
        <header className="rs-patch-head">
          {ed.cover && <img className="rs-patch-hero" src={`/rust/patches/${ed.cover}.webp`} alt="" width={640} height={360} />}
          <div className="rs-title">
            <time className="rs-hd" dateTime={ed.date}>
              {formatDay(ed.date, locale)}
            </time>
            <h1 className="rs-h1">{ed.name}</h1>
            <p className="rs-meta">
              {ed.blog && (
                <a className="rs-btn" href={ed.blog} rel="noopener" target="_blank">
                  {t.blog}
                </a>
              )}
              <a className="rs-btn" href={ed.steam} rel="noopener" target="_blank">
                {t.steam}
              </a>
            </p>
          </div>
        </header>
        {english && <p className="rs-missing" lang="es">{t.inEnglish}</p>}
        <div lang={english ? "en" : undefined}>
          {(body.intro ?? []).map(block)}
          {body.sections.map((s, i) => {
            const H = s.level <= 2 ? "h2" : "h3";
            return (
              <section key={i} className={`rs-patch-sec is-l${Math.min(s.level, 3)}`}>
                <H>{s.title}</H>
                {groupLists(s.lines ?? []).map((g, j) =>
                  Array.isArray(g) ? (
                    <ul key={j}>
                      {g.map((b, k) => (
                        <li key={k}>{withRefs(b, route, navigate)}</li>
                      ))}
                    </ul>
                  ) : (
                    block(g, j)
                  ),
                )}
              </section>
            );
          })}
        </div>
        <p className="rs-note">{t.credit}</p>
      </article>
    </main>
  );
}

/** Las viñetas seguidas van juntas en una lista. */
function groupLists(lines: Block[]): (Block | Block[])[] {
  const out: (Block | Block[])[] = [];
  for (const b of lines) {
    const last = out[out.length - 1];
    if (b.t === "li" && Array.isArray(last)) last.push(b);
    else out.push(b.t === "li" ? [b] : b);
  }
  return out;
}

/** El renglón con cada objeto nombrado (la primera vez) enlazado a su ficha. */
export function withRefs(b: Block, route: Route, navigate: Nav): ReactNode {
  if (!b.refs?.length) return b.text;
  const spots = b.refs
    .map((r) => ({ r, at: b.text.indexOf(r.n) }))
    .filter((x) => x.at >= 0)
    .sort((a, c) => a.at - c.at);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const { r, at } of spots) {
    if (at < pos) continue;
    out.push(b.text.slice(pos, at));
    out.push(
      <RouteLink className="rs-patch-ref" to={{ ...route, view: "rust", rsSection: "items", detail: r.s }} onNavigate={navigate} key={at}>
        {r.n}
      </RouteLink>,
    );
    pos = at + r.n.length;
  }
  out.push(b.text.slice(pos));
  return out;
}
