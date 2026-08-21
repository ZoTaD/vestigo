import { useMemo, useState } from "react";
import { useUnits, unitsDataset, unitCosts, type Unit } from "./unitsData";
import { units as unitSlugs } from "./slugs";
import { useCopy, useLocale } from "./i18n";

const LOBBY_AVERAGE = 4.5;

type Sort = "play" | "placement" | "impact";

function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Placement split by star level — the whole point of the row's detail. */
function StarBars({ unit }: { unit: Unit }) {
  const copy = useCopy();
  const max = Math.max(...unit.stars.map((s) => s.games), 1);

  return (
    <div className="detail-col">
      <h4 className="detail-heading">{copy.units.starsHeading}</h4>
      <p className="detail-note">{copy.units.starsNote}</p>
      <ul className="tally-list">
        {unit.stars.map((s) => (
          <li className="tally" key={s.tier}>
            <span className="tally-label">
              <span className="tally-name">{copy.units.star(s.tier)}</span>
            </span>
            <span className="tally-track">
              <span
                className="tally-fill"
                data-good={s.avgPlacement <= LOBBY_AVERAGE}
                style={{ width: `${(s.games / max) * 100}%` }}
              />
            </span>
            <span className="tally-figures">
              <b>{s.avgPlacement.toFixed(1)}</b>
              <em>
                <span className="tally-unit">{copy.units.games(s.games.toLocaleString())}</span>
              </em>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnitRow({
  unit,
  rank,
  open,
  onToggle,
}: {
  unit: Unit;
  rank: number;
  /** Which unit is expanded lives in the URL, so a champion can be linked to. */
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();

  const impact = Math.abs(unit.delta).toFixed(2);
  const impactLabel = unit.delta <= 0 ? copy.units.better(impact) : copy.units.worse(impact);

  return (
    <li className="unit-row" data-open={open} style={{ "--i": rank } as React.CSSProperties}>
      <button className="unit-summary" onClick={onToggle} aria-expanded={open}>
        <span className="unit-rank">{String(rank).padStart(2, "0")}</span>

        <span className="unit-cell unit-face">
          <span className="unit" data-cost={unit.cost}>
            {unit.img ? (
              <img className="unit-portrait" src={unit.img} alt={unit.name} loading="lazy" />
            ) : (
              <span className="unit-portrait unit-fallback">{unit.name.slice(0, 2)}</span>
            )}
          </span>
          <span className="unit-id">
            <span className="unit-headname">{unit.name}</span>
            <span className="unit-tags">
              <span className="unit-cost" data-cost={unit.cost}>
                {unit.cost}
              </span>
              {unit.isCarry && <span className="unit-carry">{copy.units.carry}</span>}
              {unit.bestStar && (
                <span className="unit-beststar">{copy.units.bestStar(unit.bestStar.tier)}</span>
              )}
            </span>
          </span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value">{pct(unit.playRate, 1)}</span>
          <span className="metric-label">{copy.units.cols.play}</span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value" data-good={unit.avgPlacement <= LOBBY_AVERAGE}>
            {unit.avgPlacement.toFixed(2)}
          </span>
          <span className="metric-label">{copy.units.cols.place}</span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value" data-good={unit.delta <= 0}>
            {impactLabel}
          </span>
          <span className="metric-label">{copy.units.cols.impact}</span>
        </span>

        <span className="comp-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="comp-detail unit-detail">
          <StarBars unit={unit} />

          <div className="detail-col">
            <h4 className="detail-heading">{copy.units.itemsHeading}</h4>
            {unit.topItems.length === 0 ? (
              <p className="detail-note">{copy.units.noItems}</p>
            ) : (
              <>
                <p className="detail-note">{copy.units.itemsNote}</p>
                <ul className="unit-items-list">
                  {unit.topItems.map((it) => (
                    <li key={it.id}>
                      {it.img && <img src={it.img} alt="" loading="lazy" />}
                      <span className="ui-name">{it.name}</span>
                      <span className="ui-games">{copy.units.games(it.games.toLocaleString())}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function UnitsView({
  open: openSlug,
  onOpen,
}: {
  open?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const [sort, setSort] = useState<Sort>("play");
  const [cost, setCost] = useState<number | null>(null);
  const units = useUnits();

  const shown = useMemo(() => {
    const byCost = cost === null ? units : units.filter((u) => u.cost === cost);
    const sorted = [...byCost];
    if (sort === "play") sorted.sort((a, b) => b.playRate - a.playRate);
    else if (sort === "placement") sorted.sort((a, b) => a.avgPlacement - b.avgPlacement);
    else sorted.sort((a, b) => a.delta - b.delta);
    return sorted;
  }, [sort, cost, units]);

  const generated = new Date(unitsDataset.generatedAt).toLocaleString(locale, {
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <header className="masthead">
        <h1 className="title">
          {copy.units.title}
          <span className="title-break">{copy.units.titleBreak}</span>
        </h1>
        <p className="standfirst">{copy.units.standfirst}</p>
      </header>

      <main className="tiers">
        <div className="units-controls">
          <div className="cost-filter" role="group" aria-label={copy.units.filter.cost}>
            <button
              className="cost-chip"
              data-active={cost === null}
              onClick={() => setCost(null)}
            >
              {copy.units.filter.all}
            </button>
            {unitCosts.map((c) => (
              <button
                className="cost-chip"
                key={c}
                data-cost={c}
                data-active={cost === c}
                onClick={() => setCost(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <label className="unit-sort">
            <span className="seeker-label">{copy.units.sort.label}</span>
            <select
              className="seeker-input seeker-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="play">{copy.units.sort.play}</option>
              <option value="placement">{copy.units.sort.placement}</option>
              <option value="impact">{copy.units.sort.impact}</option>
            </select>
          </label>
        </div>

        <ol className="units-list">
          {shown.map((u, i) => {
            const slug = unitSlugs.toSlug.get(u.id);
            return (
              <UnitRow
                unit={u}
                rank={i + 1}
                key={u.id}
                open={!!slug && slug === openSlug}
                onToggle={() => onOpen(slug === openSlug ? undefined : slug)}
              />
            );
          })}
        </ol>

        <p className="units-updated">{generated}</p>
      </main>
    </>
  );
}
