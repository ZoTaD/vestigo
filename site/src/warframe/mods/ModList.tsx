/**
 * La lista de Mods y arcanos de Warframe (2026-10-27): un buscador y chips de clase (mod/arcano), tipo, rareza y
 * polaridad, con una tabla dibujada de a tandas (son 1.750). Los filtros van en la dirección
 * (`?kind=arcane&rarity=Rare`) y se leen después del primer dibujo: el HTML prerenderizado es la lista sin filtrar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy, type WfPolarity, type WfRarity } from "../../warframeCopy";
import { filterMods, modTypes, MOD_RARITIES, noModFilters, readModFilters, say, writeModFilters, type ModFilters, type ModRow } from "../data";
import { Icon, Panel, Rarity, type Nav } from "../ui";

/** El alto de una fila de la tabla (ícono de 40 px), en px, medido en el navegador a 1.100 px (2026-10-27). */
const WF_MOD_ROW = 56;
const WF_CHUNK = 60;
const POLARITIES: WfPolarity[] = ["madurai", "vazarin", "naramon", "zenurik", "unairu", "penjaga", "umbra", "universal", "any"];

export default function ModList({ rows, route, navigate, missing = false }: { rows: ModRow[]; route: Route; navigate: Nav; missing?: boolean }) {
  const t = useWfCopy();
  const c = t.mods;
  const { lang } = useLang();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ModFilters>(noModFilters);
  useEffect(() => setFilters(readModFilters(window.location.search)), []);
  const pick = (patch: Partial<ModFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeModFilters(next)}`);
      return next;
    });
  const types = useMemo(() => modTypes(rows, filters.kind), [rows, filters.kind]);
  const shown = useMemo(
    () => filterMods(rows, filters, query).sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)),
    [rows, filters, query, lang],
  );
  const chip = (label: string, on: boolean, onClick: () => void, key: string) => (
    <button type="button" className={`wf-pill${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick} key={key}>
      {label}
    </button>
  );

  return (
    <main className="wf-main wf-mods">
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
            {chip(c.all, filters.kind === null, () => pick({ kind: null }), "all")}
            {chip(c.mods, filters.kind === "mod", () => pick({ kind: "mod", type: filters.type === "ARCANE" ? null : filters.type }), "mod")}
            {chip(c.arcanes, filters.kind === "arcane", () => pick({ kind: "arcane", type: null, polarity: null }), "arcane")}
          </div>
          {filters.kind !== "arcane" && (
            <div className="wf-chips" role="group" aria-label={c.type}>
              <span className="wf-label">{c.type}</span>
              {chip(c.all, filters.type === null, () => pick({ type: null }), "all")}
              {types
                .filter((ty) => ty !== "ARCANE")
                .map((ty) => chip(c.types[ty] ?? ty, filters.type === ty, () => pick({ type: ty }), ty))}
            </div>
          )}
          <div className="wf-chips" role="group" aria-label={c.rarity}>
            <span className="wf-label">{c.rarity}</span>
            {chip(c.all, filters.rarity === null, () => pick({ rarity: null }), "all")}
            {MOD_RARITIES.map((r) => chip(t.rarity[r as WfRarity], filters.rarity === r, () => pick({ rarity: r }), r))}
          </div>
          {filters.kind !== "arcane" && (
            <div className="wf-chips" role="group" aria-label={c.polarity}>
              <span className="wf-label">{c.polarity}</span>
              {chip(c.all, filters.polarity === null, () => pick({ polarity: null }), "all")}
              {POLARITIES.map((p) => chip(t.polarity[p], filters.polarity === p, () => pick({ polarity: p }), p))}
            </div>
          )}
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(locale)) : c.none}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="wf-table-wrap">
          <table className="wf-table wf-mod-table">
            <thead>
              <tr>
                <th>{c.name}</th>
                <th>{c.type}</th>
                <th>{c.rarity}</th>
                <th>{c.polarity}</th>
              </tr>
            </thead>
            <tbody>
              <LazyRows
                items={shown}
                rowHeight={WF_MOD_ROW}
                chunk={WF_CHUNK}
                tag="tr"
                eager
                render={(r) => (
                  <tr key={r.slug}>
                    <td>
                      <RouteLink className="wf-reward" to={{ ...route, view: "warframe", wfSection: "mods", detail: r.slug }} onNavigate={navigate} prefetch="press">
                        <Icon img={r.img} size={40} />
                        <span>{say(r.name, lang)}</span>
                      </RouteLink>
                    </td>
                    <td>{c.types[r.type] ?? r.type}</td>
                    <td>
                      <Rarity r={r.rarity} />
                    </td>
                    <td>{r.polarity ? (t.polarity[r.polarity as WfPolarity] ?? r.polarity) : ""}</td>
                  </tr>
                )}
              />
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
