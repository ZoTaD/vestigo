/**
 * La pestaña Maestría de Warframe (2026-10-27, etapa 2): todo lo que da maestría, para tildar. Arriba, lo tildado (puntos,
 * rango que alcanzan y cuántos de cuántos); después el buscador, los chips de tipo y "Ocultar lo tildado"; abajo la lista
 * de a tandas, con el nombre enlazado a su ficha del Arsenal.
 *
 * Lo tildado vive en `localStorage` y se lee después del primer dibujo (`useEffect`): el HTML prerenderizado sale sin
 * tildes y la hidratación coincide. Sin almacenamiento la página anda igual, sin recordar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useWfCopy } from "../../warframeCopy";
import { fold, loadMastery, MASTERY_KINDS, peekMastery, say, type MasteryKind, type MasteryRow } from "../data";
import { Icon, Panel, WfLoading, type Nav } from "../ui";
import { browserStorage, masteryRank, readChecked, writeChecked } from "./mastery";

/** El alto de una fila de la lista con su separación, en px, medido en el navegador (2026-10-27). */
const MASTERY_ROW = 56;
/** Cuántas filas dibuja cada tanda; las del primer tramo llevan su ícono, las de abajo lo piden al llegar. */
const MASTERY_CHUNK = 60;

export default function WfMastery({ route, navigate }: { route: Route; navigate: Nav }) {
  const list = useLoad("list", () => peekMastery() ?? undefined, () => loadMastery());
  if (list.failed) return <WfLoading onRetry={list.retry} />;
  if (!list.value) return <WfLoading />;
  return <MasteryList rows={list.value} route={route} navigate={navigate} />;
}

function MasteryList({ rows, route, navigate }: { rows: MasteryRow[]; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.masteryList;
  const { lang } = useLang();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MasteryKind | null>(null);
  const [hide, setHide] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setChecked(readChecked(browserStorage())), []);

  const toggle = (slug: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      writeChecked(browserStorage(), next);
      return next;
    });
  const clear = () => {
    if (!window.confirm(c.clearAsk)) return;
    const none = new Set<string>();
    writeChecked(browserStorage(), none);
    setChecked(none);
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)), [rows, lang]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return sorted.filter((r) => (!kind || r.kind === kind) && (!hide || !checked.has(r.slug)) && (!q || fold(r.name[0]).includes(q) || fold(r.name[1]).includes(q)));
  }, [sorted, kind, hide, checked, query]);

  // Lo tildado que ya no está en la lista (algo que el juego sacó) no suma.
  const tickedRows = useMemo(() => rows.filter((r) => checked.has(r.slug)), [rows, checked]);
  const xp = tickedRows.reduce((sum, r) => sum + r.xp, 0);
  const mr = masteryRank(xp);
  const num = (n: number) => n.toLocaleString(locale);
  const rankLabel = mr.legendary > 0 ? c.legendary(mr.legendary) : String(mr.rank);
  const nextRank = mr.rank >= 30 ? c.legendary(mr.legendary + 1) : `${mr.rank + 1}`;

  return (
    <main className="wf-main wf-mastery">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede(num(rows.length))}</p>
        <dl className="wf-mastery-sum" aria-live="polite">
          <div className="wf-stat">
            <dt>{c.done}</dt>
            <dd>
              {num(tickedRows.length)} / {num(rows.length)}
            </dd>
          </div>
          <div className="wf-stat">
            <dt>{c.points}</dt>
            <dd>{num(xp)}</dd>
          </div>
          <div className="wf-stat">
            <dt>{c.rank}</dt>
            <dd>{rankLabel}</dd>
          </div>
        </dl>
        <p className="wf-dim wf-mastery-next">{c.next(num(mr.next), nextRank)}</p>
        <div className="wf-filters">
          <label className="wf-find">
            <span className="wf-label">{c.search}</span>
            <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="wf-chips" role="group" aria-label={c.kind}>
            <span className="wf-label">{c.kind}</span>
            <button type="button" className={`wf-pill${kind === null ? " is-on" : ""}`} aria-pressed={kind === null} onClick={() => setKind(null)}>
              {c.all}
            </button>
            {MASTERY_KINDS.map((k) => (
              <button type="button" className={`wf-pill${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)} key={k}>
                {c.kinds[k]}
              </button>
            ))}
            <button type="button" className={`wf-pill${hide ? " is-on" : ""}`} aria-pressed={hide} onClick={() => setHide((h) => !h)}>
              {c.hide}
            </button>
            {checked.size > 0 && (
              <button type="button" className="wf-pill" onClick={clear}>
                {c.clear}
              </button>
            )}
          </div>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(num(shown.length), num(rows.length)) : c.none}
          </p>
        </div>
      </Panel>

      <Panel>
        <ul className="wf-mastery-list">
          <LazyRows
            items={shown}
            rowHeight={MASTERY_ROW}
            chunk={MASTERY_CHUNK}
            tag="li"
            eager
            margin={400}
            render={(r, i) => {
              const name = say(r.name, lang);
              const on = checked.has(r.slug);
              return (
                <li key={r.slug} className={`wf-mastery-row${on ? " is-on" : ""}`}>
                  <label className="wf-mastery-tick">
                    <input type="checkbox" checked={on} onChange={() => toggle(r.slug)} />
                    <span className="wf-mastery-sr">{name}</span>
                  </label>
                  {skipSprite(i, MASTERY_CHUNK) ? <Icon img={null} size={40} /> : <Icon img={r.img} size={40} />}
                  <RouteLink className="wf-mastery-name" to={{ ...route, view: "warframe", wfSection: "arsenal", detail: r.slug }} onNavigate={navigate} prefetch="press">
                    {name}
                  </RouteLink>
                  <span className="wf-mastery-kind">{c.kinds[r.kind]}</span>
                  <span className="wf-mastery-xp">
                    {c.pts(num(r.xp))}
                    {r.rank === 40 && <small>{c.rankReq(40)}</small>}
                  </span>
                </li>
              );
            }}
          />
        </ul>
        <p className="wf-dim wf-mastery-foot">{c.note}</p>
      </Panel>
    </main>
  );
}
