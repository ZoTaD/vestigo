/**
 * La lista de reliquias de Warframe (2026-10-27): un buscador, chips de era y "Fuera del Vault", y las reliquias
 * agrupadas por era, cada grupo dibujado de a tandas (son casi 800). Los filtros van en la dirección
 * (`?era=Axi&open=1`) y se leen después del primer dibujo: el HTML prerenderizado es siempre la lista sin filtrar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy } from "../../warframeCopy";
import { ERAS, filterRelics, noRelicFilters, readRelicFilters, say, writeRelicFilters, type RelicFilters, type RelicRow } from "../data";
import { Icon, Panel, type Nav } from "../ui";

/** El alto de un casillero de reliquia (ícono de 48 px y nombre), en px, medido en el navegador a 1.100 px (2026-10-27). */
const WF_RELIC_CELL = 64;
const WF_CHUNK = 60;

export default function RelicList({ rows, route, navigate, missing = false }: { rows: RelicRow[]; route: Route; navigate: Nav; missing?: boolean }) {
  const t = useWfCopy();
  const c = t.relics;
  const { lang } = useLang();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<RelicFilters>(noRelicFilters);
  useEffect(() => setFilters(readRelicFilters(window.location.search)), []);
  const pick = (patch: Partial<RelicFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeRelicFilters(next)}`);
      return next;
    });
  const shown = useMemo(() => filterRelics(rows, filters, query), [rows, filters, query]);
  // Por era, en el orden de las eras, y dentro de cada una por nombre (A1, A2… A10).
  const groups = useMemo(
    () =>
      ERAS.map((era) => ({ era, rows: shown.filter((r) => r.era === era).sort((a, b) => a.name[0].localeCompare(b.name[0], "en", { numeric: true })) })).filter((g) => g.rows.length > 0),
    [shown],
  );

  return (
    <main className="wf-main wf-relics">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede(rows.length.toLocaleString(locale))}</p>
        {missing && (
          <p className="wf-note" role="status">
            {c.missing}
          </p>
        )}
        <div className="wf-filters">
          <label className="wf-find">
            <span className="wf-label">{c.search}</span>
            <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="wf-chips" role="group" aria-label={c.era}>
            <span className="wf-label">{c.era}</span>
            <button type="button" className={`wf-pill${filters.era === null ? " is-on" : ""}`} aria-pressed={filters.era === null} onClick={() => pick({ era: null })}>
              {c.all}
            </button>
            {ERAS.map((era) => (
              <button type="button" className={`wf-pill${filters.era === era ? " is-on" : ""}`} aria-pressed={filters.era === era} onClick={() => pick({ era })} key={era}>
                {t.era[era]}
              </button>
            ))}
            <button type="button" className={`wf-pill${filters.open ? " is-on" : ""}`} aria-pressed={filters.open} onClick={() => pick({ open: !filters.open })}>
              {c.noVault}
            </button>
          </div>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(locale)) : c.none}
          </p>
        </div>
      </Panel>

      {groups.map((g, gi) => (
        <Panel key={g.era}>
          <h2 className="wf-h2">
            {t.era[g.era]} <span className="wf-dim">{g.rows.length.toLocaleString(locale)}</span>
          </h2>
          <div className="wf-relic-grid">
            <LazyRows
              items={g.rows}
              rowHeight={WF_RELIC_CELL}
              chunk={WF_CHUNK}
              tag="div"
              eager={gi === 0}
              render={(r) => (
                <RouteLink key={r.slug} className={`wf-relic${r.vaulted ? " is-vaulted" : ""}`} to={{ ...route, view: "warframe", wfSection: "relics", detail: r.slug }} onNavigate={navigate} prefetch="press">
                  <Icon img={r.img} size={48} />
                  <span>
                    {say(r.name, lang)}
                    {r.vaulted && <small>Vault</small>}
                  </span>
                </RouteLink>
              )}
            />
          </div>
        </Panel>
      ))}
    </main>
  );
}
