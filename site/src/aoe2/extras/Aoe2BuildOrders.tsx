/**
 * Build orders de AoE2 (2026-11-21): aperturas escritas a mano (`games/aoe2/data/buildorders.json`), cada una con sus
 * pasos (población, tiempo de juego aproximado, qué hacer) y las civs que más ganan con esa apertura en ranking (la misma
 * medición de Aperturas, ventana de 28 días).
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { Aoe2Loading, MuestraChica, Panel, type Nav } from "../ui";
import { useEnc } from "../encyclopedia/parts";
import { SMALL, openingTable } from "../stats/data";
import { Civ, mapLabel, pct, useSummary } from "../stats/parts";
import { buildOrders, type BuildOrder } from "./data";
import { useExtraCopy } from "./copy";

export default function Aoe2BuildOrders({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useExtraCopy().bo;
  const { lang } = useLang();
  const bos = useEnc(buildOrders);
  if (!bos) return <Aoe2Loading />;
  if (route.detail) {
    const b = bos.find((x) => x.slug === route.detail);
    return b ? <Ficha key={b.slug} b={b} route={route} navigate={navigate} /> : <Panel h={t.notFound} />;
  }
  return (
    <>
      <Panel h={t.h} sub={t.sub} />
      <ul className="a2-bo-list">
        {bos.map((b) => (
          <li key={b.slug} className="a2-panel">
            <h2>
              <RouteLink to={{ ...route, view: "aoe2", a2Section: "build-orders", detail: b.slug }} onNavigate={navigate}>
                {b.name[lang]}
              </RouteLink>
            </h2>
            <p className="a2-note">{t.feudal(b.feudal.vils, b.feudal.time)}</p>
            <p>{b.summary[lang]}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Ficha({ b, route, navigate }: { b: BuildOrder; route: Route; navigate: Nav }) {
  const t = useExtraCopy().bo;
  const { lang } = useLang();
  const s = useSummary();
  const civs = s ? openingTable(s, "28", "all", b.opening).filter((r) => r.games >= 30).sort((x, y) => y.wr - x.wr).slice(0, 8) : [];
  return (
    <>
      <Panel className="a2-who">
        <h1 className="a2-alias">{b.name[lang]}</h1>
        <p className="a2-help">{b.summary[lang]}</p>
        <p className="a2-note">
          {t.feudal(b.feudal.vils, b.feudal.time)} · {t.maps}: {b.maps.map((m) => mapLabel(m, lang)).join(", ")}
        </p>
      </Panel>
      <Panel sub={t.note}>
        <table className="a2-table a2-bo">
          <thead>
            <tr>
              <th className="num">{t.pop}</th>
              <th className="num">{t.time}</th>
              <th>{t.step}</th>
            </tr>
          </thead>
          <tbody>
            {b.steps.map((p, i) => (
              <tr key={i}>
                <td className="num">
                  <b>{p.vils}</b>
                </td>
                <td className="num">{p.time}</td>
                <td>{p[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel h={t.civsH} sub={t.civsSub}>
        {civs.length ? (
          <table className="a2-table">
            <tbody>
              {civs.map((r) => (
                <tr key={r.civ}>
                  <td>
                    <RouteLink to={{ ...route, view: "aoe2", a2Section: "civilizations", detail: r.civ }} onNavigate={navigate}>
                      <Civ slug={r.civ} size={26} />
                    </RouteLink>
                  </td>
                  <td className={`num ${r.wr >= 0.5 ? "a2-up" : "a2-down"}`}>
                    <b>{pct(r.wr)}</b>
                  </td>
                  <td className="num">
                    {t.games(r.games)}
                    {r.games < SMALL && <MuestraChica games={r.games} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="a2-note">{t.noCivs}</p>
        )}
      </Panel>
    </>
  );
}
