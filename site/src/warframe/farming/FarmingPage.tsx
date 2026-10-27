/**
 * La ficha de un recurso (2026-10-27): su nombre y descripción, los planetas donde cae, "Dónde conviene" (lo de mayor
 * chance primero: enemigos con su % efectivo, misiones y botines) y "Lo piden": las recetas del Arsenal que lo usan,
 * enlazadas. Un recurso que no cae en ningún lado dice "no cae en misiones" y nada más.
 */
import type { CSSProperties } from "react";
import { useLang } from "../../i18n";
import { LazyRows } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy } from "../../warframeCopy";
import { refName, say, type FarmingFicha } from "../data";
import Sources from "../Sources";
import { Icon, Panel, type Nav } from "../ui";

const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);
/** El alto de un casillero de "Lo piden" (ícono de 40 px), en px, medido en el navegador (2026-10-27). */
const USED_CELL = 58;

export default function FarmingPage({ ficha, route, navigate }: { ficha: FarmingFicha; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.farming;
  const { lang } = useLang();
  const name = say(ficha.name, lang);
  const listTo: Route = { ...route, view: "warframe", wfSection: "farming", detail: undefined };
  const used = ficha.usedIn.map((k) => ficha.refs[k]).filter((r) => !!r && !!r.tab && !!r.slug);

  return (
    <main className="wf-main wf-ficha">
      <Panel className="wf-head">
        <Icon img={ficha.img} size={128} lazy={false} />
        <div className="wf-head-text">
          <RouteLink className="wf-back" to={listTo} onNavigate={navigate}>
            {t.tabs.farming}
          </RouteLink>
          {ficha.planets.length > 0 && <p className="wf-kicker">{ficha.planets.map((p) => say(p, lang)).join(" · ")}</p>}
          <h1 className="wf-h1 is-name" style={{ "--len": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          {say(ficha.desc, lang) && <p className="wf-desc">{say(ficha.desc, lang)}</p>}
        </div>
      </Panel>

      <Panel>
        <h2 className="wf-h2">{c.best}</h2>
        <Sources list={ficha.sources} refs={ficha.refs} route={route} navigate={navigate} />
      </Panel>

      {used.length > 0 && (
        <Panel>
          <h2 className="wf-h2">{c.usedBy}</h2>
          <ul className="wf-ings">
            <LazyRows
              items={used}
              rowHeight={USED_CELL}
              tag="li"
              render={(r, i) => (
                <li key={i}>
                  <RouteLink className="wf-ing" to={{ ...route, view: "warframe", wfSection: r.tab!, detail: r.slug! }} onNavigate={navigate}>
                    <Icon img={r.img} size={40} />
                    <span>{refName(r, lang)}</span>
                  </RouteLink>
                </li>
              )}
            />
          </ul>
        </Panel>
      )}
    </main>
  );
}
