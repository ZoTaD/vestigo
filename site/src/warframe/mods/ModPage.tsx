/**
 * La ficha de un mod o arcano (2026-10-27): ícono y nombre, polaridad, costo base, rareza y compatibilidad (sólo lo que
 * el mod tiene: un arcano no lleva polaridad ni costo), el efecto por rango con un selector, y de dónde cae. Sin
 * ninguna fuente dice "no cae en misiones".
 */
import { useState, type CSSProperties } from "react";
import { useLang } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy, type WfPolarity } from "../../warframeCopy";
import { say, type ModFicha } from "../data";
import Sources from "../Sources";
import { Icon, Panel, Rarity, type Nav } from "../ui";

const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

export default function ModPage({ ficha, route, navigate }: { ficha: ModFicha; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.mods;
  const { lang } = useLang();
  const name = say(ficha.name, lang);
  const [rank, setRank] = useState(ficha.maxRank);
  const listTo: Route = { ...route, view: "warframe", wfSection: "mods", detail: undefined };
  const effect = ficha.ranks[Math.min(rank, ficha.ranks.length - 1)];

  return (
    <main className="wf-main wf-ficha">
      <Panel className="wf-head">
        <Icon img={ficha.img} size={128} lazy={false} />
        <div className="wf-head-text">
          <RouteLink className="wf-back" to={listTo} onNavigate={navigate}>
            {t.tabs.mods}
          </RouteLink>
          <p className="wf-kicker">{c.types[ficha.type] ?? ficha.type}</p>
          <h1 className="wf-h1 is-name" style={{ "--len": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          {ficha.desc && say(ficha.desc, lang) && <p className="wf-desc">{say(ficha.desc, lang)}</p>}
        </div>
      </Panel>

      <Panel>
        <dl className="wf-stats">
          {ficha.rarity && (
            <div className="wf-stat">
              <dt>{c.rarity}</dt>
              <dd>
                <Rarity r={ficha.rarity} />
              </dd>
            </div>
          )}
          {ficha.polarity && (
            <div className="wf-stat">
              <dt>{c.polarity}</dt>
              <dd>{t.polarity[ficha.polarity as WfPolarity] ?? ficha.polarity}</dd>
            </div>
          )}
          {ficha.drain !== null && (
            <div className="wf-stat">
              <dt>{c.drain}</dt>
              <dd>{ficha.drain}</dd>
            </div>
          )}
          {ficha.compat && (
            <div className="wf-stat">
              <dt>{c.compat}</dt>
              <dd className="is-text">{ficha.compat}</dd>
            </div>
          )}
        </dl>
        {effect && (
          <>
            <h2 className="wf-h2 wf-sub">{c.effect}</h2>
            <div className="wf-chips" role="group" aria-label={c.rank}>
              <span className="wf-label">{c.rank}</span>
              {ficha.ranks.map((_, i) => (
                <button type="button" className={`wf-pill${rank === i ? " is-on" : ""}`} aria-pressed={rank === i} onClick={() => setRank(i)} key={i}>
                  {i}
                </button>
              ))}
            </div>
            <p className="wf-effect" aria-live="polite">
              {say(effect, lang)}
            </p>
          </>
        )}
      </Panel>

      <Panel>
        <h2 className="wf-h2">{t.sources.heading}</h2>
        <Sources list={ficha.sources} refs={ficha.refs} route={route} navigate={navigate} />
      </Panel>
    </main>
  );
}
