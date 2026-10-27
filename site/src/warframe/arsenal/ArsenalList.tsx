/**
 * La lista del Arsenal de Warframe (2026-10-27): un buscador, chips de tipo (con las exaltadas) y "Prime", y la grilla de
 * íconos de 128 px con el nombre, dibujada de a tandas (son más de 800). Los filtros van en la dirección
 * (`?kind=melee&prime=1`), así se pueden compartir. Se leen después del primer dibujo: el HTML prerenderizado es siempre
 * la lista sin filtrar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy, WF_KINDS } from "../../warframeCopy";
import { filterArsenal, noArsenalFilters, readArsenalFilters, say, sortArsenal, writeArsenalFilters, type ArsenalFilters, type ArsenalRow } from "../data";
import { Icon, Panel, type Nav } from "../ui";

/** El alto de un casillero de la grilla (ícono de 128 px y nombre en dos líneas), en px, medido en el navegador a 1.100 px (2026-10-27). */
const WF_CELL = 188;
/** Cuántos casilleros lleva una tanda: con 6 a 7 columnas, unas 8 filas. */
const WF_CHUNK = 48;

export default function ArsenalList({ rows, route, navigate, missing = false }: { rows: ArsenalRow[]; route: Route; navigate: Nav; missing?: boolean }) {
  const t = useWfCopy();
  const c = t.arsenal;
  const { lang } = useLang();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ArsenalFilters>(noArsenalFilters);
  useEffect(() => setFilters(readArsenalFilters(window.location.search)), []);
  // Sobre el estado de ese momento (no el del último dibujo), y la dirección al día con lo elegido.
  const pick = (patch: Partial<ArsenalFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeArsenalFilters(next)}`);
      return next;
    });
  const sorted = useMemo(() => sortArsenal(rows, lang), [rows, lang]);
  const shown = useMemo(() => filterArsenal(sorted, filters, query, lang), [sorted, filters, query, lang]);

  return (
    <main className="wf-main wf-arsenal">
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
          <div className="wf-chips" role="group" aria-label={c.kind}>
            <span className="wf-label">{c.kind}</span>
            <button type="button" className={`wf-pill${filters.kind === null ? " is-on" : ""}`} aria-pressed={filters.kind === null} onClick={() => pick({ kind: null })}>
              {c.all}
            </button>
            {WF_KINDS.map((k) => (
              <button type="button" className={`wf-pill${filters.kind === k ? " is-on" : ""}`} aria-pressed={filters.kind === k} onClick={() => pick({ kind: k })} key={k}>
                {c.kinds[k]}
              </button>
            ))}
            <button type="button" className={`wf-pill${filters.prime ? " is-on" : ""}`} aria-pressed={filters.prime} onClick={() => pick({ prime: !filters.prime })}>
              {c.prime}
            </button>
          </div>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(locale)) : c.none}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="wf-grid">
          <LazyRows
            items={shown}
            rowHeight={WF_CELL}
            chunk={WF_CHUNK}
            tag="div"
            eager
            // Las tandas se piden cerca de la pantalla: con el margen de siempre (1.200 px) se traían cientos de íconos al abrir.
            margin={300}
            render={(r, i) => (
              <RouteLink key={r.slug} className="wf-cell" to={{ ...route, view: "warframe", wfSection: "arsenal", detail: r.slug }} onNavigate={navigate} prefetch="press">
                {skipSprite(i, WF_CHUNK) ? <Icon img={null} size={128} /> : <Icon img={r.img} size={128} />}
                <span>{say(r.name, lang)}</span>
              </RouteLink>
            )}
          />
        </div>
      </Panel>
    </main>
  );
}
