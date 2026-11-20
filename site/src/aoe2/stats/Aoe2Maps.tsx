/**
 * Mapas de AoE2 (2026-11-20): los mapas jugados en el período con su ícono, partidas y las 3 civs que más ganan; y la
 * ficha de cada mapa (`/aoe2/maps/<slug>`) con todas las civs.
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { useAoe2Copy } from "../../aoe2Copy";
import { LazyRows } from "../../LazyRows";
import { Aoe2Loading, MuestraChica, Panel, type Nav } from "../ui";
import { SMALL, mapTable, mapsByGames } from "./data";
import { Civ, FILTROS_INICIALES, StatFilters, WrBar, mapIcon, mapLabel, pct, useSummary, type Filters } from "./parts";
import { SinDatos } from "./Aoe2Civs";

export default function Aoe2Maps({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const s = useSummary();
  const [f, setF] = useState<Filters>(FILTROS_INICIALES);
  const lista = useMemo(() => (s ? mapsByGames(s, f.window, f.mode) : []), [s, f]);
  if (s === undefined) return <Aoe2Loading />;
  if (s === null || !lista.length) return <SinDatos />;
  if (route.detail) {
    const civs = mapTable(s, f.window, f.mode, route.detail).sort((a, b) => b.wr - a.wr);
    return (
      <>
        <StatFilters f={f} set={setF} s={s} bands={false} />
        <Panel className="a2-who">
          <div className="a2-who-row">
            <img src={mapIcon(route.detail)} alt="" width={64} height={64} />
            <h1 className="a2-alias">{mapLabel(route.detail, lang)}</h1>
          </div>
        </Panel>
        <Panel h={t.st.mapCivs}>
          <table className="a2-table">
            <tbody>
              {civs.map((r) => (
                <tr key={r.civ}>
                  <td>
                    <Civ slug={r.civ} size={26} />
                  </td>
                  <td className={`num ${r.wr >= 0.5 ? "a2-up" : "a2-down"}`}>
                    <b>{pct(r.wr)}</b>
                  </td>
                  <td className="a2-hide-s a2-barcell">
                    <WrBar wr={r.wr} />
                  </td>
                  <td className="num">
                    {r.games.toLocaleString(lang)}
                    {r.games < SMALL && <MuestraChica games={r.games} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </>
    );
  }
  return (
    <>
      <StatFilters f={f} set={setF} s={s} bands={false} />
      <Panel h={t.st.mapsH} sub={t.st.mapsSub}>
        <ul className="a2-maps">
          <LazyRows
            tag="li"
            eager
            rowHeight={86}
            items={lista}
            render={(m) => {
              const mejores = mapTable(s, f.window, f.mode, m.map)
                .filter((r) => r.games >= 20)
                .sort((a, b) => b.wr - a.wr)
                .slice(0, 3);
              return (
                <li key={m.map}>
                  <RouteLink to={{ ...route, view: "aoe2", a2Section: "maps", detail: m.map }} onNavigate={navigate}>
                    <img src={mapIcon(m.map)} alt="" width={56} height={56} loading="lazy" decoding="async" />
                    <span className="a2-maps-what">
                      <b>{mapLabel(m.map, lang)}</b>
                      <small>{t.st.mapGames(m.games)}</small>
                    </span>
                    <span className="a2-maps-civs">
                      {mejores.map((r) => (
                        <span key={r.civ} title={`${pct(r.wr)} · ${r.games}`}>
                          <Civ slug={r.civ} size={26} name={false} />
                        </span>
                      ))}
                    </span>
                  </RouteLink>
                </li>
              );
            }}
          />
        </ul>
      </Panel>
    </>
  );
}
