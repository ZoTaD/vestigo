import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "./i18n";
import { text } from "./localized";
import RouteLink from "./RouteLink";
import type { Route } from "./route";
import { catalog } from "./deadlockData";
import Flag from "./DeadlockFlag";
import { LADDER_COPY } from "./deadlockLadderCopy";
import { fetchStatBoard, floorFor, formatStat, STATS, type StatKey, type StatRow } from "./deadlockStatBoards";
import { type Region } from "./deadlockRegions";
import DeadlockDropdown from "./DeadlockDropdown";
import { regionOptions } from "./deadlockLadderCopy";

/**
 * Los rankings por estadística (2026-11-17): una tabla por número, con héroe y
 * región opcionales. Todo en vivo (ver `deadlockStatBoards.ts`).
 */
export default function DeadlockStatBoard({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  const { lang } = useLang();
  const locale = useLocale();
  const c = LADDER_COPY[lang];
  const [stat, setStat] = useState<StatKey>("avg_kills_per_match");
  const [hero, setHero] = useState<number | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [rows, setRows] = useState<StatRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const heroes = useMemo(
    () =>
      Object.entries(catalog.heroes)
        .map(([id, h]) => ({ id: Number(id), name: text(h.name, lang, `#${id}`) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [lang]
  );
  const def = STATS.find((s) => s.key === stat)!;

  useEffect(() => {
    let vivo = true;
    setRows(null);
    setFailed(false);
    fetchStatBoard({ stat, hero, region }).then(
      (r) => vivo && setRows(r),
      () => vivo && setFailed(true)
    );
    return () => {
      vivo = false;
    };
  }, [stat, hero, region]);

  return (
    <section className="box dl-sb">
      <div className="box-head">
        <h2 className="box-title">{c.stats.title}</h2>
      </div>
      <p className="dl-hb-lead">{c.stats.lead}</p>

      <div className="dl-hb-controls">
        <div className="dl-sb-ctl">
          <span className="dl-sb-label">{c.stats.stat}</span>
          <DeadlockDropdown
            label={c.stats.stat}
            value={stat}
            onChange={setStat}
            options={STATS.map((s) => ({ value: s.key, label: c.stats.names[s.key] }))}
          />
        </div>
        <div className="dl-sb-ctl">
          <span className="dl-sb-label">{c.stats.hero}</span>
          <DeadlockDropdown
            label={c.stats.hero}
            value={hero === null ? "" : String(hero)}
            onChange={(v) => setHero(v ? Number(v) : null)}
            options={[{ value: "", label: c.stats.anyHero }, ...heroes.map((h) => ({ value: String(h.id), label: h.name }))]}
          />
        </div>
        <div className="dl-sb-ctl">
          <span className="dl-sb-label">{c.regionLabel}</span>
          <DeadlockDropdown
            label={c.regionLabel}
            value={region ?? ""}
            onChange={(v) => setRegion((v || null) as Region | null)}
            options={regionOptions(c)}
          />
        </div>
        <span className="dl-sb-floor">{c.stats.floor(String(floorFor(hero)))}</span>
      </div>

      {!rows && !failed && <p className="box-empty">{c.stats.loading}</p>}
      {failed && <p className="dl-notice">{c.stats.failed}</p>}
      {rows && rows.length === 0 && <p className="box-empty">{c.stats.empty}</p>}

      {rows && rows.length > 0 && (
        <div className="dl-sb-table" role="table">
          <div className="dl-sb-head" role="row">
            <span className="dl-hb-pos" role="columnheader">#</span>
            <span role="columnheader">{c.hero.cols.player}</span>
            <span className="dl-hb-num" role="columnheader">{c.stats.names[stat]}</span>
            <span className="dl-hb-num" role="columnheader">{c.stats.matches}</span>
          </div>
          {rows.map((r) => (
            <div className="dl-sb-row" role="row" key={r.accountId}>
              <span className="dl-hb-pos">{r.place}</span>
              <span className="dl-hb-player">
                <span className="dl-hb-flag">
                  <Flag code={r.cc} />
                </span>
                <RouteLink
                  className="dl-lb-name"
                  to={{ ...route, view: "deadlock", dlSection: "player", detail: String(r.accountId) }}
                  onNavigate={navigate}
                >
                  {r.name ?? r.accountId}
                </RouteLink>
                {r.reg && <span className="dl-hb-reg">{r.reg}</span>}
              </span>
              <span className="dl-hb-num dl-hb-score">{formatStat(def, r.value, locale)}</span>
              <span className="dl-hb-num">{r.matches.toLocaleString(locale)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
