/**
 * Los bonos de una civ en su ficha (2026-11-21): tipo, bonos y bono de equipo con el texto del juego, la unidad y las
 * tecnologías únicas, y lo común que le falta, con link al árbol completo. Datos: `civ/<slug>.json` de la enciclopedia.
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLang } from "../../i18n";
import { Panel, type Nav } from "../ui";
import { loadCivInfo, peekCivInfo } from "./data";
import { useEncCopy } from "./copy";
import { Fichas, useCargado } from "./parts";

export default function CivBonos({ slug, route, navigate }: { slug: string; route: Route; navigate: Nav }) {
  const t = useEncCopy();
  const { lang } = useLang();
  const info = useCargado(() => peekCivInfo(slug), () => loadCivInfo(slug), slug);
  if (!info) return null;
  const d = info.desc[lang];
  return (
    <div className="a2-two">
      <Panel h={t.civ.bonusesH} sub={d.kind}>
        <ul className="a2-bullets">
          {d.bonuses.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {d.team && (
          <>
            <h3 className="a2-calc-h">{t.civ.teamH}</h3>
            <p>{d.team}</p>
          </>
        )}
      </Panel>
      <Panel h={t.civ.uuH}>
        <Fichas items={info.uu} k="u" route={route} navigate={navigate} />
        <h3 className="a2-calc-h">{t.civ.utH}</h3>
        <Fichas items={info.ut} k="t" route={route} navigate={navigate} />
        {(info.missU.length > 0 || info.missT.length > 0) && (
          <>
            <h3 className="a2-calc-h">{t.tree.missingH}</h3>
            <Fichas items={info.missU} k="u" route={route} navigate={navigate} />
            <Fichas items={info.missT} k="t" route={route} navigate={navigate} />
          </>
        )}
        <p>
          <RouteLink className="a2-btn" to={{ ...route, view: "aoe2", a2Section: "tech-tree", detail: slug }} onNavigate={navigate}>
            {t.civ.treeLink}
          </RouteLink>
        </p>
      </Panel>
    </div>
  );
}
