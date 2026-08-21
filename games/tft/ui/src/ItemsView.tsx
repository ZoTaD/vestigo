import { useMemo, useState } from "react";
import { useItems, itemsDataset, type Item } from "./itemsData";
import { items as itemSlugs } from "./slugs";
import { useCopy, useLocale } from "./i18n";

const LOBBY_AVERAGE = 4.5;

type Sort = "play" | "placement" | "impact";

function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

function ItemRow({
  item,
  rank,
  open,
  onToggle,
}: {
  item: Item;
  rank: number;
  /** Which item is expanded lives in the URL, so a build can be linked to. */
  open: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();

  const impact = Math.abs(item.delta).toFixed(2);
  const impactLabel = item.delta <= 0 ? copy.items.better(impact) : copy.items.worse(impact);

  return (
    <li className="unit-row" data-open={open} style={{ "--i": rank } as React.CSSProperties}>
      <button className="unit-summary" onClick={onToggle} aria-expanded={open}>
        <span className="unit-rank">{String(rank).padStart(2, "0")}</span>

        <span className="unit-cell unit-face">
          <span className="item-thumb">
            {item.img ? (
              <img src={item.img} alt={item.name} loading="lazy" />
            ) : (
              <span className="item-thumb-fallback">{item.name.slice(0, 2)}</span>
            )}
          </span>
          <span className="unit-id">
            <span className="unit-headname">{item.name}</span>
            {item.components.length > 0 && (
              <span className="item-recipe">
                {item.components.map((c, i) => (
                  <span className="item-part" key={`${c.id}-${i}`} title={c.name}>
                    {i > 0 && <i className="ip-plus">+</i>}
                    {c.img && <img src={c.img} alt={c.name} loading="lazy" />}
                  </span>
                ))}
              </span>
            )}
          </span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value">{pct(item.playRate, 1)}</span>
          <span className="metric-label">{copy.items.cols.play}</span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value" data-good={item.avgPlacement <= LOBBY_AVERAGE}>
            {item.avgPlacement.toFixed(2)}
          </span>
          <span className="metric-label">{copy.items.cols.place}</span>
        </span>

        <span className="unit-cell unit-metric">
          <span className="metric-value" data-good={item.delta <= 0}>
            {impactLabel}
          </span>
          <span className="metric-label">{copy.items.cols.impact}</span>
        </span>

        <span className="comp-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="comp-detail unit-detail">
          <div className="detail-col">
            <h4 className="detail-heading">{copy.items.bestOn}</h4>
            <p className="detail-note">{copy.items.bestOnNote}</p>
            <ul className="carrier-list">
              {item.bestUnits.map((u) => (
                <li key={u.id}>
                  <span className="unit" data-cost={u.cost}>
                    {u.img ? (
                      <img className="unit-portrait" src={u.img} alt={u.name} loading="lazy" />
                    ) : (
                      <span className="unit-portrait unit-fallback">{u.name.slice(0, 2)}</span>
                    )}
                  </span>
                  <span className="carrier-name">{u.name}</span>
                  <span className="carrier-figs">
                    <b data-good={u.avgPlacement <= LOBBY_AVERAGE}>{u.avgPlacement.toFixed(1)}</b>
                    <em>{copy.items.games(u.games.toLocaleString())}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ItemsView({
  open: openSlug,
  onOpen,
}: {
  open?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const [sort, setSort] = useState<Sort>("play");
  const items = useItems();

  const shown = useMemo(() => {
    const sorted = [...items];
    if (sort === "play") sorted.sort((a, b) => b.playRate - a.playRate);
    else if (sort === "placement") sorted.sort((a, b) => a.avgPlacement - b.avgPlacement);
    else sorted.sort((a, b) => a.delta - b.delta);
    return sorted;
  }, [sort, items]);

  const generated = new Date(itemsDataset.generatedAt).toLocaleString(locale, {
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <header className="masthead">
        <h1 className="title">
          {copy.items.title}
          <span className="title-break">{copy.items.titleBreak}</span>
        </h1>
        <p className="standfirst">{copy.items.standfirst}</p>
      </header>

      <main className="tiers">
        <div className="units-controls units-controls-end">
          <label className="unit-sort">
            <span className="seeker-label">{copy.items.sort.label}</span>
            <select
              className="seeker-input seeker-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="play">{copy.items.sort.play}</option>
              <option value="placement">{copy.items.sort.placement}</option>
              <option value="impact">{copy.items.sort.impact}</option>
            </select>
          </label>
        </div>

        <ol className="units-list">
          {shown.map((it, i) => {
            const slug = itemSlugs.toSlug.get(it.id);
            return (
              <ItemRow
                item={it}
                rank={i + 1}
                key={it.id}
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
