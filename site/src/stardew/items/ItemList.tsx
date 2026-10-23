/**
 * La lista de objetos de Stardew Valley (2026-10-22): un buscador, chips de categoría y de fuente, y la grilla de
 * casilleros del inventario dibujada de a tandas (son casi 900). Al pasar el mouse (o el foco) por un casillero aparece
 * el cartelito crema del juego con el nombre y el precio: uno solo para toda la grilla, que se mueve al casillero.
 *
 * Los filtros van en la dirección (`?cat=crops&from=fished`), así se pueden compartir. Se leen después del primer
 * dibujo: el HTML prerenderizado es siempre la lista sin filtrar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../i18n";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useStardewCopy } from "../../stardewCopy";
import { filterRows, GROUPS, readFilters, SOURCES, writeFilters, type Filters, type Group, type Row, type SourceFilter } from "../data";
import { Box, Gold, Slot, Sprite, type Nav } from "../ui";

/** El alto de un casillero de la grilla, en px, medido en el navegador a 1.400 px (2026-10-22). */
const SD_CELL = 64;
/** Cuántos casilleros lleva una tanda: con 15 columnas, unas 4 filas. */
const SD_CHUNK = 60;

/** El cartelito del casillero que tiene el mouse o el foco: qué objeto y dónde, relativo a la grilla. */
type Tip = { row: Row; x: number; y: number };

export default function ItemList({ rows, route, navigate, missing }: { rows: Row[]; route: Route; navigate: Nav; missing: boolean }) {
  const t = useStardewCopy();
  const c = t.items;
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ group: null, source: null });
  const [tip, setTip] = useState<Tip | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => setFilters(readFilters(window.location.search)), []);
  // Sobre el estado de ese momento (no el del último dibujo), y la dirección al día con lo elegido.
  const pick = (patch: Partial<Filters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeFilters(next)}`);
      return next;
    });
  const shown = useMemo(() => filterRows(rows, filters, query), [rows, filters, query]);

  const point = (row: Row, el: HTMLElement) => {
    const box = grid.current?.getBoundingClientRect();
    const cell = el.getBoundingClientRect();
    if (box) setTip({ row, x: cell.left - box.left + cell.width / 2, y: cell.top - box.top });
  };

  return (
    <main className="sd-main sd-items">
      <Box className="sd-intro">
        <h1 className="sd-h1">{c.h1}</h1>
        <p className="sd-lede">{c.lede(rows.length.toLocaleString(locale))}</p>
        {missing && (
          <p className="sd-note" role="status">
            {c.missing}
          </p>
        )}
        <div className="sd-filters">
          <label className="sd-find">
            <span className="sd-label">{c.search}</span>
            <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="sd-chips" role="group" aria-label={c.category}>
            <span className="sd-label">{c.category}</span>
            <button
              type="button"
              className={`sd-pill${filters.group === null ? " is-on" : ""}`}
              aria-pressed={filters.group === null}
              onClick={() => pick({ group: null })}
            >
              {c.all}
            </button>
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <button
                type="button"
                className={`sd-pill${filters.group === g ? " is-on" : ""}`}
                aria-pressed={filters.group === g}
                onClick={() => pick({ group: g })}
                key={g}
              >
                {c.groups[g]}
              </button>
            ))}
          </div>
          <div className="sd-chips" role="group" aria-label={c.from}>
            <span className="sd-label">{c.from}</span>
            <button
              type="button"
              className={`sd-pill${filters.source === null ? " is-on" : ""}`}
              aria-pressed={filters.source === null}
              onClick={() => pick({ source: null })}
            >
              {c.anySource}
            </button>
            {(Object.keys(SOURCES) as SourceFilter[]).map((s) => (
              <button
                type="button"
                className={`sd-pill${filters.source === s ? " is-on" : ""}`}
                aria-pressed={filters.source === s}
                onClick={() => pick({ source: s })}
                key={s}
              >
                {c.sources[s]}
              </button>
            ))}
          </div>
          <p className="sd-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(locale)) : c.none}
          </p>
        </div>
      </Box>

      <Box className="sd-inv">
        <div className="sd-inv-grid" ref={grid} onPointerLeave={() => setTip(null)} onBlur={() => setTip(null)}>
          <LazyRows
            items={shown}
            rowHeight={SD_CELL}
            chunk={SD_CHUNK}
            tag="div"
            eager
            // Las tandas se piden cerca de la pantalla: con 15 columnas de 64 px, el margen de siempre (1.200 px) traía
            // unos 400 sprites al abrir, el doble del presupuesto de 200 imágenes.
            margin={200}
            render={(r, i) => (
              <RouteLink
                key={r.id}
                className="sd-icell"
                to={{ ...route, view: "stardew", sdSection: "items", detail: r.slug }}
                onNavigate={navigate}
                prefetch="press"
                onPointerEnter={(e) => point(r, e.currentTarget)}
                onFocus={(e) => point(r, e.currentTarget)}
              >
                <Slot>{!skipSprite(i, SD_CHUNK) && <Sprite id={r.id} w={r.w} h={r.h} size={48} />}</Slot>
                <span className="visually-hidden">{r.name}</span>
              </RouteLink>
            )}
          />
          {tip && (
            <div className="sd-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
              <b>{tip.row.name}</b>
              {tip.row.price > 0 && <Gold n={tip.row.price} />}
            </div>
          )}
        </div>
      </Box>
    </main>
  );
}
