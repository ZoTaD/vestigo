/**
 * La lista de Dónde farmear de Warframe (2026-10-27): un buscador grande ("¿qué necesitás?"), chips de planeta y la
 * grilla de recursos con sus planetas, dibujada de a tandas. El planeta va en la dirección (`?planet=Jupiter`) y se
 * lee después del primer dibujo: el HTML prerenderizado es siempre la lista sin filtrar.
 */
import { useEffect, useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy } from "../../warframeCopy";
import { farmingPlanets, filterFarming, readPlanet, say, writePlanet, type FarmingRow } from "../data";
import { Icon, Panel, type Nav } from "../ui";

/** El alto de un casillero de recurso (ícono de 48 px, nombre y planetas), en px, medido en el navegador a 1.100 px (2026-10-27). */
const WF_RES_CELL = 76;
const WF_CHUNK = 60;

export default function FarmingList({ rows, route, navigate, missing = false }: { rows: FarmingRow[]; route: Route; navigate: Nav; missing?: boolean }) {
  const t = useWfCopy();
  const c = t.farming;
  const { lang } = useLang();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [planet, setPlanet] = useState<string | null>(null);
  useEffect(() => setPlanet(readPlanet(window.location.search)), []);
  const pick = (next: string | null) => {
    setPlanet(next);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${writePlanet(next)}`);
  };
  const planets = useMemo(() => farmingPlanets(rows), [rows]);
  const shown = useMemo(
    () => filterFarming(rows, planet, query).sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang)),
    [rows, planet, query, lang],
  );

  return (
    <main className="wf-main wf-farming">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede(rows.length.toLocaleString(locale))}</p>
        {missing && (
          <p className="wf-note" role="status">
            {c.missing}
          </p>
        )}
        <div className="wf-filters">
          <label className="wf-find is-big">
            <span className="wf-label">{c.search}</span>
            <input type="search" value={query} placeholder={c.searchPlaceholder} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="wf-chips" role="group" aria-label={c.planet}>
            <span className="wf-label">{c.planet}</span>
            <button type="button" className={`wf-pill${planet === null ? " is-on" : ""}`} aria-pressed={planet === null} onClick={() => pick(null)}>
              {c.all}
            </button>
            {planets.map((p) => (
              <button type="button" className={`wf-pill${planet === p[0] ? " is-on" : ""}`} aria-pressed={planet === p[0]} onClick={() => pick(p[0])} key={p[0]}>
                {say(p, lang)}
              </button>
            ))}
          </div>
          <p className="wf-count" aria-live="polite">
            {shown.length ? c.count(shown.length.toLocaleString(locale)) : c.none}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="wf-res-grid">
          <LazyRows
            items={shown}
            rowHeight={WF_RES_CELL}
            chunk={WF_CHUNK}
            tag="div"
            eager
            render={(r) => (
              <RouteLink key={r.slug} className="wf-res" to={{ ...route, view: "warframe", wfSection: "farming", detail: r.slug }} onNavigate={navigate} prefetch="press">
                <Icon img={r.img} size={48} />
                <span>
                  {say(r.name, lang)}
                  <small>{r.planets.length ? r.planets.map((p) => say(p, lang)).join(" · ") : c.noPlanet}</small>
                </span>
              </RouteLink>
            )}
          />
        </div>
      </Panel>
    </main>
  );
}
