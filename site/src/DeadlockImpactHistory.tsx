import { useEffect, useMemo, useState } from "react";
import type { Lang } from "./i18n";
import { text } from "./localized";
import { BRAWL_GAME_MODE, fetchMatch, type HistoryRow } from "./deadlockMatch";
import { impactOf } from "./deadlockMatchImpact";
import { heroImg, heroName } from "./deadlockReportData";
import GameImg from "./GameImg";
import { MATCH_TABS_COPY } from "./deadlockMatchTabsCopy";

/**
 * Tu impacto partida a partida, en el perfil (2026-11-20).
 *
 * El impacto necesita la metadata entera de cada partida (~1,3 MB, con las
 * posiciones), y el historial del perfil no la trae. Por eso se calcula **a
 * pedido**: un botón baja las últimas partidas de a una y guarda el resultado
 * en el navegador (`localStorage`), así la próxima visita lo muestra sin bajar
 * nada. Va en su propio pedazo de JS: el perfil no carga el cálculo hasta que
 * se abre Rendimiento.
 */

/** Cuántas partidas se calculan por tanda. */
const BATCH = 10;
const KEY = (account: number) => `vg_impact_v1:${account}`;

interface Saved {
  impact: number;
  heroId: number;
  won: boolean;
  tag: "mvp" | "sink" | null;
  rank: number;
  of: number;
  startTime: number;
}

function load(account: number): Record<string, Saved | null> {
  try {
    return JSON.parse(localStorage.getItem(KEY(account)) ?? "{}") as Record<string, Saved | null>;
  } catch {
    return {};
  }
}

function save(account: number, data: Record<string, Saved | null>) {
  try {
    localStorage.setItem(KEY(account), JSON.stringify(data));
  } catch {
    // Sin lugar o sin permiso: se recalcula la próxima vez.
  }
}

export default function DeadlockImpactHistory({
  accountId,
  history,
  lang,
  matchLink,
}: {
  accountId: number;
  history: HistoryRow[];
  lang: Lang;
  /** El enlace a la Repetición de una partida. */
  matchLink: (matchId: number, label: React.ReactNode) => React.ReactNode;
}) {
  const c = MATCH_TABS_COPY[lang].history;
  const ic = MATCH_TABS_COPY[lang].impact;
  const [saved, setSaved] = useState<Record<string, Saved | null>>({});
  const [working, setWorking] = useState<{ done: number; of: number } | null>(null);

  useEffect(() => setSaved(load(accountId)), [accountId]);

  // Las partidas que se pueden medir: las que no son pelea callejera, de la más nueva.
  const medibles = useMemo(
    () => history.filter((r) => r.gameMode !== BRAWL_GAME_MODE).sort((a, b) => b.startTime - a.startTime),
    [history],
  );
  const pendientes = medibles.filter((r) => !(String(r.matchId) in saved)).slice(0, BATCH);
  const hechas = medibles.filter((r) => saved[String(r.matchId)]).map((r) => ({ r, s: saved[String(r.matchId)]! }));

  const calcular = async () => {
    const lote = pendientes;
    setWorking({ done: 0, of: lote.length });
    const next = { ...load(accountId) };
    for (let i = 0; i < lote.length; i++) {
      const r = lote[i];
      try {
        const m = await fetchMatch(r.matchId);
        const imp = impactOf(m);
        const yo = m.players.find((p) => p.accountId === accountId);
        if (imp && yo) {
          const orden = [...imp.totals].sort((a, b) => b[1] - a[1]);
          next[String(r.matchId)] = {
            impact: imp.totals.get(yo.slot) ?? 0,
            heroId: yo.heroId,
            won: yo.won,
            tag: imp.mvp === yo.slot ? "mvp" : imp.sink === yo.slot ? "sink" : null,
            rank: orden.findIndex(([s]) => s === yo.slot) + 1,
            of: orden.length,
            startTime: r.startTime,
          };
        } else next[String(r.matchId)] = null;
      } catch {
        // Se la saltea esta vez; queda pendiente.
      }
      save(accountId, next);
      setSaved({ ...next });
      setWorking({ done: i + 1, of: lote.length });
    }
    setWorking(null);
  };

  const n = hechas.length;
  const prom = n ? hechas.reduce((s, x) => s + x.s.impact, 0) / n : 0;
  const mvps = hechas.filter((x) => x.s.tag === "mvp").length;
  const sinks = hechas.filter((x) => x.s.tag === "sink").length;
  // La tendencia: las más nuevas contra las más viejas de lo calculado.
  const mitad = Math.floor(n / 2);
  const nuevas = hechas.slice(0, mitad);
  const viejas = hechas.slice(n - mitad);
  const avg = (xs: typeof hechas) => (xs.length ? xs.reduce((s, x) => s + x.s.impact, 0) / xs.length : 0);
  const tendencia = n >= 6 ? avg(nuevas) - avg(viejas) : null;
  // Por héroe, con dos partidas o más.
  const porHeroe = [...hechas.reduce((m, x) => m.set(x.s.heroId, [...(m.get(x.s.heroId) ?? []), x.s.impact]), new Map<number, number[]>())]
    .filter(([, vs]) => vs.length >= 2)
    .map(([h, vs]) => ({ h, n: vs.length, v: vs.reduce((a, b) => a + b, 0) / vs.length }))
    .sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...hechas.map((x) => Math.abs(x.s.impact)));

  const pts = (v: number) =>
    `${v >= 0 ? "+" : "−"}${(Math.round(Math.abs(v) * 10) / 10).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const hn = (id: number) => {
    const x = heroName(id);
    return x ? text(x, lang, "") : String(id);
  };

  return (
    <section className="box dl-rep-block dl-imph">
      <div className="box-head">
        <h2 className="box-title">
          {c.title} <span className="dl-rp-beta">{MATCH_TABS_COPY[lang].replay.beta}</span>
        </h2>
      </div>
      <p className="detail-note">{c.lead}</p>

      {n > 0 && (
        <div className="dl-imph-sum">
          <p>
            <span className="dl-imph-k">{c.avg}</span>
            <b className={prom >= 0 ? "is-good" : "is-bad"}>{pts(prom)}</b>
            <small>{c.over(n)}</small>
          </p>
          <p>
            <span className="dl-imph-k">{ic.mvp}</span>
            <b>{mvps}</b>
          </p>
          <p>
            <span className="dl-imph-k">{ic.sink}</span>
            <b>{sinks}</b>
          </p>
          {tendencia !== null && (
            <p>
              <span className="dl-imph-k">{c.trend}</span>
              <b className={tendencia >= 0 ? "is-good" : "is-bad"}>{pts(tendencia)}</b>
              <small>{c.trendNote}</small>
            </p>
          )}
        </div>
      )}

      {pendientes.length > 0 && (
        <p className="dl-imph-go">
          <button type="button" onClick={calcular} disabled={working !== null}>
            {working ? c.working(working.done, working.of) : n === 0 ? c.first(pendientes.length) : c.more(pendientes.length)}
          </button>
          <small>{c.weight}</small>
        </p>
      )}

      {n > 0 && (
        <ol className="dl-imph-list">
          {hechas.map(({ r, s }) => (
            <li key={r.matchId}>
              {matchLink(
                r.matchId,
                <>
                  <GameImg src={heroImg(s.heroId) ?? ""} alt={hn(s.heroId)} width={26} height={26} loading="lazy" decoding="async" />
                  <span className="dl-imph-who">
                    {hn(s.heroId)}
                    <small className={s.won ? "is-good" : "is-bad"}>{s.won ? c.won : c.lost}</small>
                  </span>
                  <span className="dl-imph-bar">
                    <i
                      className={s.impact >= 0 ? "is-good" : "is-bad"}
                      style={s.impact >= 0 ? { left: "50%", width: `${(s.impact / max) * 50}%` } : { right: "50%", width: `${(-s.impact / max) * 50}%` }}
                    />
                  </span>
                  <b className={s.impact >= 0 ? "is-good" : "is-bad"}>{pts(s.impact)}</b>
                  {s.tag && <span className={`dl-rep-impact-tag is-${s.tag}`}>{s.tag === "mvp" ? ic.mvp : ic.sink}</span>}
                </>,
              )}
            </li>
          ))}
        </ol>
      )}

      {porHeroe.length > 0 && (
        <>
          <h3 className="dl-rep-sub">{c.byHero}</h3>
          <ul className="dl-imph-heroes">
            {porHeroe.map((x) => (
              <li key={x.h}>
                <GameImg src={heroImg(x.h) ?? ""} alt={hn(x.h)} width={26} height={26} loading="lazy" decoding="async" />
                <span>
                  {hn(x.h)} <small>{c.games(x.n)}</small>
                </span>
                <b className={x.v >= 0 ? "is-good" : "is-bad"}>{pts(x.v)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
