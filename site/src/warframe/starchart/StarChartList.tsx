/**
 * La lista del Mapa estelar de Warframe (2026-10-27, etapa 2): arriba el dibujo de las órbitas (maqueta A) con los
 * lugares fuera de órbita en botones y, al lado, el planeta elegido con sus tipos de misión; abajo la tabla de nodos
 * (maqueta C): nodo, misión, facción, nivel y lo que más da.
 *
 * El planeta y el tipo van en la dirección (`?planet=sedna&type=Defense`) y cada planeta, botón y chip es un enlace de
 * verdad a esa dirección: el HTML prerenderizado es siempre el mapa sin filtrar (con los enlaces), y el filtro se lee
 * después del primer dibujo. Sin planeta, la tabla trae los 269 nodos agrupados por planeta, de a tandas; con planeta,
 * aparecen los chips de sus tipos de misión.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useLocale } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy } from "../../warframeCopy";
import { effectiveStarType, filterStars, noStarFilters, readStarFilters, say, sortStars, starLevel, starPlanets, starTypes, writeStarFilters, type StarFilters, type StarPlanet, type StarRow } from "../data";
import { Panel, type Nav } from "../ui";
import OrbitMap, { inOrbit } from "./OrbitMap";

/** El alto de una fila de la tabla, en px, medido en el navegador a 1.280 px (2026-10-27): 36,4 una de nodo, 37 una de
 * planeta y 49,6 la que parte en dos renglones lo que más da. */
const STAR_ROW = 37;

type Line = { k: "planet"; p: StarPlanet } | { k: "node"; r: StarRow };

export default function StarChartList({ rows, route, navigate, missing = false }: { rows: StarRow[]; route: Route; navigate: Nav; missing?: boolean }) {
  const t = useWfCopy();
  const c = t.starChart;
  const { lang } = useLang();
  const locale = useLocale();
  const [f, setF] = useState<StarFilters>(noStarFilters);
  useEffect(() => setF(readStarFilters(window.location.search)), []);

  const planets = useMemo(() => starPlanets(rows), [rows]);
  const sel = planets.find((p) => p.slug === f.planet) ?? null;
  const planet = sel?.slug ?? null;
  // Un tipo que el planeta no tiene (o sin planeta elegido) no deja la tabla filtrada sin salida: se ignora.
  const types = useMemo(() => (sel ? sel.types : starTypes(rows)), [sel, rows]);
  const type = effectiveStarType(planet, f.type, types);
  const shown = useMemo(() => filterStars(sortStars(rows), planet, type), [rows, planet, type]);
  // Sin planeta, cada planeta arranca con su fila de título.
  const lines = useMemo<Line[]>(() => {
    if (planet) return shown.map((r) => ({ k: "node", r }));
    const out: Line[] = [];
    let last = "";
    for (const r of shown) {
      if (r.planet[0] !== last) {
        last = r.planet[0];
        const p = planets.find((x) => x.name[0] === last);
        if (p) out.push({ k: "planet", p });
      }
      out.push({ k: "node", r });
    }
    return out;
  }, [shown, planet, planets]);

  const listTo: Route = { ...route, view: "warframe", wfSection: "star-chart", detail: undefined };
  /** Un enlace a la misma lista con otros filtros: anda sin JS y, con JS, cambia el filtro sin recargar. */
  const filterLink = (next: StarFilters, children: ReactNode, className: string, on: boolean, key?: string) => (
    <RouteLink
      key={key}
      className={`${className}${on ? " is-on" : ""}`}
      to={listTo}
      search={writeStarFilters(next)}
      aria-current={on ? "true" : undefined}
      onNavigate={(r) => {
        navigate(r);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeStarFilters(next)}`);
        setF(next);
      }}
    >
      {children}
    </RouteLink>
  );
  /** Tocar el planeta elegido lo suelta. */
  const planetFilter = (slug: string): StarFilters => ({ planet: slug === planet ? null : slug, type: null });
  const outside = planets.filter((p) => !inOrbit(p));
  const missionName = (ty: string) => t.missionType[ty] ?? ty;
  const factionName = (fa: string) => t.faction[fa] ?? fa;
  const num = (n: number) => n.toLocaleString(locale);
  const pct = (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 2 })} %`;

  return (
    <main className="wf-main wf-star">
      <Panel>
        <h1 className="wf-h1">{c.h1}</h1>
        <p className="wf-lede">{c.lede(num(rows.length))}</p>
        {missing && (
          <p className="wf-note" role="status">
            {c.missing}
          </p>
        )}
      </Panel>

      <div className="wf-star-stage">
        <Panel className="wf-star-map">
          <OrbitMap planets={planets} selected={planet} label={c.map} link={(slug, children, on) => filterLink(planetFilter(slug), children, "wf-planet-link", on)} />
          <h2 className="wf-h2 wf-star-outside">{c.outside}</h2>
          <div className="wf-chips">
            {outside.map((p) =>
              filterLink(
                planetFilter(p.slug),
                <>
                  {say(p.name, lang)} <span className="wf-dim">· {num(p.n)}</span>
                </>,
                "wf-pill",
                p.slug === planet,
                p.slug,
              ),
            )}
          </div>
        </Panel>

        <Panel className="wf-star-side">
          {sel ? (
            <>
              <p className="wf-kicker">{c.planet}</p>
              <h2 className="wf-star-planet">{say(sel.name, lang)}</h2>
              <p className="wf-dim">
                {c.nodes(num(sel.n))} · {c.levels(sel.lo, sel.hi)}
              </p>
            </>
          ) : (
            <>
              <h2 className="wf-star-planet">{c.allPlanets}</h2>
              <p className="wf-dim">{c.pick}</p>
              {/* Los mismos planetas que el dibujo, en texto: con su cantidad de nodos y su nivel. */}
              <ul className="wf-star-rail">
                {planets.map((p) => (
                  <li key={p.slug}>
                    {filterLink(
                      planetFilter(p.slug),
                      <>
                        <b>{say(p.name, lang)}</b>
                        <span>
                          {c.nodes(num(p.n))} · {p.lo}–{p.hi}
                        </span>
                      </>,
                      "wf-star-rail-link",
                      false,
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* Los tipos de misión, sólo del planeta elegido (los 32 de todo el mapa son demasiados para elegir). */}
          {sel && (
            <div className="wf-chips wf-star-types" role="group" aria-label={c.type}>
              <span className="wf-label">{c.type}</span>
              {filterLink({ planet, type: null }, c.all, "wf-pill", type === null)}
              {types.map((ty) => filterLink({ planet, type: ty }, missionName(ty), "wf-pill", ty === type, ty))}
            </div>
          )}
          {sel && filterLink(noStarFilters, c.allPlanets, "wf-back wf-star-clear", false)}
        </Panel>
      </div>

      <Panel>
        <p className="wf-count" aria-live="polite">
          {shown.length ? c.count(num(shown.length)) : c.none}
        </p>
        <div className="wf-table-wrap">
          <table className="wf-table wf-star-table">
            <thead>
              <tr>
                <th>{c.node}</th>
                <th>{c.mission}</th>
                <th className="wf-star-fac">{c.faction}</th>
                <th className="is-num">{c.level}</th>
                <th className="wf-star-best">{c.best}</th>
              </tr>
            </thead>
            <tbody>
              <LazyRows
                items={lines}
                rowHeight={STAR_ROW}
                tag="tr"
                eager
                render={(l) =>
                  l.k === "planet" ? (
                    <tr className="wf-star-group" key={`p-${l.p.slug}`}>
                      <th colSpan={5} scope="colgroup">
                        {say(l.p.name, lang)} <span>{c.nodes(num(l.p.n))}</span>
                      </th>
                    </tr>
                  ) : (
                    <tr key={l.r.slug}>
                      <td>
                        <RouteLink className="wf-star-node" to={{ ...listTo, detail: l.r.slug }} onNavigate={navigate} prefetch="press">
                          {say(l.r.name, lang)}
                        </RouteLink>
                        {l.r.dark && <small className="wf-star-dark">{c.dark}</small>}
                      </td>
                      <td>{missionName(l.r.type)}</td>
                      <td className="wf-star-fac">{factionName(l.r.faction)}</td>
                      <td className="is-num">{starLevel(l.r.lv)}</td>
                      <td className="wf-star-best">
                        {l.r.best ? (
                          <>
                            <b>{say(l.r.best.name, lang)}</b> {pct(l.r.best.chance)}
                          </>
                        ) : (
                          <span className="wf-dim">—</span>
                        )}
                      </td>
                    </tr>
                  )
                }
              />
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
