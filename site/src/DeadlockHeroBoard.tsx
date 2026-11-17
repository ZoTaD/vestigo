import { useMemo, useState } from "react";
import { useLang, useLocale } from "./i18n";
import { text } from "./localized";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { catalog } from "./deadlockData";
import { heroImg, rankLabel, rankOf } from "./deadlockReportData";
import RankBadge from "./DeadlockRankBadge";
import GameImg from "./GameImg";
import Flag from "./DeadlockFlag";
import { LADDER_COPY, regionOptions } from "./deadlockLadderCopy";
import DeadlockDropdown from "./DeadlockDropdown";
import { orderRows, useHeroBoard, type BoardOrder } from "./deadlockHeroBoards";
import { type Region } from "./deadlockRegions";

/**
 * El ranking completo de un héroe (2026-11-17), con el puntaje de héroe.
 *
 * **El orden por defecto sigue siendo el rango**, el mismo de la pestaña del
 * mundo y de las medallas del perfil; el puntaje es un segundo orden que se
 * elige. Los dos están explicados en la página: un número que no dice cómo
 * se calcula no se puede creer.
 */

const heroName = (id: number, lang: "en" | "es") => text(catalog.heroes[String(id)]?.name, lang, `#${id}`);

export default function DeadlockHeroBoard({
  heroId,
  route,
  navigate,
}: {
  heroId: number;
  route: Route;
  navigate: (r: Route) => void;
}) {
  const { lang } = useLang();
  const locale = useLocale();
  const c = LADDER_COPY[lang];
  const board = useHeroBoard(heroId);
  const [order, setOrder] = useState<BoardOrder>("rank");
  const [region, setRegion] = useState<Region | null>(null);
  const [q, setQ] = useState("");

  const nombre = heroName(heroId, lang);
  const filas = useMemo(() => {
    if (!board) return [];
    const todas = orderRows(board.rows, order, region);
    const t = q.trim().toLowerCase();
    return t ? todas.filter((r) => (r.name ?? String(r.id)).toLowerCase().includes(t)) : todas;
  }, [board, order, region, q]);

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const fecha = board ? new Date(board.generatedAt).toLocaleDateString(locale, { day: "numeric", month: "long" }) : "";

  return (
    <section className="box dl-hb">
      <div className="dl-hb-title">
        <GameImg className="dl-hb-face" src={heroImg(heroId) ?? ""} alt="" width={56} height={56} />
        <div>
          <h2 className="box-title">{c.hero.title(nombre)}</h2>
          {board && (
            <p className="dl-hb-lead">
              {c.hero.lead(nombre, board.pool.toLocaleString(locale), String(board.minMatches))}{" "}
              <span className="dl-hb-updated">{c.hero.updated(fecha)}</span>
            </p>
          )}
        </div>
      </div>

      {/* A la vista y no plegado: el puntaje es nuestro, y un número propio que
          no dice cómo se calcula es justo lo que se le critica al de Statlocker. */}
      <p className="dl-hb-how">{c.hero.howScore}</p>

      <div className="dl-hb-controls">
        <div className="seg" role="group" aria-label={c.order.label}>
          {(["rank", "score"] as const).map((o) => (
            <button key={o} type="button" data-active={order === o} aria-pressed={order === o} onClick={() => setOrder(o)}>
              {c.order[o]}
            </button>
          ))}
        </div>
        <DeadlockDropdown
          label={c.regionLabel}
          value={region ?? ""}
          onChange={(v) => setRegion((v || null) as Region | null)}
          options={regionOptions(c)}
        />
        <label className="field dl-hb-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.hero.cols.player} aria-label={c.hero.cols.player} autoComplete="off" />
        </label>
      </div>

      {board === undefined && <p className="box-empty">{c.hero.loading}</p>}
      {board === null && <p className="box-empty">{c.hero.empty}</p>}
      {board && filas.length === 0 && <p className="box-empty">{region ? c.hero.emptyRegion : c.hero.empty}</p>}

      {board && filas.length > 0 && (
        <div className="dl-hb-table" role="table">
          <div className="dl-hb-head" role="row">
            <span className="dl-hb-pos" role="columnheader">#</span>
            <span role="columnheader">{c.hero.cols.player}</span>
            <span className="dl-hb-tops" role="columnheader">{c.hero.cols.heroes}</span>
            <span className="dl-hb-num" role="columnheader">{c.hero.cols.matches}</span>
            <span className="dl-hb-num" role="columnheader">{c.hero.cols.winRate}</span>
            <span className="dl-hb-kda" role="columnheader" title={c.hero.kdaTitle}>{c.hero.cols.kda}</span>
            <span className="dl-hb-num dl-hb-wide" role="columnheader">{c.hero.cols.souls}</span>
            <span className="dl-hb-num dl-hb-wide" role="columnheader">{c.hero.cols.damage}</span>
            <span className="dl-hb-rank" role="columnheader">{c.hero.cols.rank}</span>
            <span className="dl-hb-num" role="columnheader">{c.hero.cols.score}</span>
          </div>
          {filas.map((r) => {
            const rango = r.badge ? rankOf(r.badge) : null;
            return (
              <div className="dl-hb-row" role="row" key={r.id}>
                <span className="dl-hb-pos">{r.place}</span>
                <span className="dl-hb-player">
                  <span className="dl-hb-flag">
                    <Flag code={r.cc} />
                  </span>
                  {/* Nombre de Steam: texto de terceros, se pinta como texto. */}
                  <RouteLink
                    className="dl-lb-name"
                    to={{ ...route, view: "deadlock", dlSection: "player", detail: String(r.id) }}
                    onNavigate={navigate}
                  >
                    {r.name ?? r.id}
                  </RouteLink>
                  {r.reg && <span className="dl-hb-reg">{r.reg}</span>}
                </span>
                <span className="dl-hb-tops">
                  {r.top.map((h) => (
                    <GameImg key={h} src={heroImg(h) ?? ""} alt={heroName(h, lang)} title={heroName(h, lang)} width={22} height={22} loading="lazy" decoding="async" />
                  ))}
                </span>
                <span className="dl-hb-num">{r.m.toLocaleString(locale)}</span>
                <span className="dl-hb-num">{pct(r.w / Math.max(1, r.m))}</span>
                <span className="dl-hb-kda">
                  {[r.kpm, r.dpm, r.apm].map((x) => x.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(" / ")}
                </span>
                <span className="dl-hb-num dl-hb-wide">{r.nw.toLocaleString(locale)}</span>
                <span className="dl-hb-num dl-hb-wide">{r.dmg.toLocaleString(locale)}</span>
                <span className="dl-hb-rank">
                  {rango ? (
                    <>
                      <RankBadge badge={r.badge!} height={17} />
                      <span className="dl-lb-rank-name">{rankLabel(rango, lang)}</span>
                    </>
                  ) : (
                    <span className="dl-lb-none">—</span>
                  )}
                </span>
                <span className="dl-hb-num dl-hb-score" title={c.hero.scoreTitle(String(Math.round(r.score)), nombre)}>
                  {r.score.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
