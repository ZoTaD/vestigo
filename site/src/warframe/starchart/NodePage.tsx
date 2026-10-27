/**
 * La ficha de un nodo del mapa estelar (2026-10-27, etapa 2): el planeta (y si es sector oscuro), el nombre, la misión,
 * la facción, el nivel y la maestría que pide; una tabla por rotación (o por rótulo, como las cachés) con cada objeto
 * enlazado a su ficha y su %, y los recursos del planeta enlazados a Dónde farmear. Un nodo sin tabla propia lo dice y
 * no dibuja tablas vacías.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy, type WfCopy } from "../../warframeCopy";
import { planetSlug, refName, say, starLevel, writeStarFilters, type Lang, type Ref, type StarFicha, type StarRewards } from "../data";
import { Icon, Panel, type Nav } from "../ui";

const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

/** El título de una tabla: "Rotación A", "Cachés · Rotación A", "Cachés" o, sola, "Recompensas". */
function rewardTitle(t: WfCopy, rw: StarRewards): string {
  const label = rw.label ? (t.rewardLabel[rw.label] ?? rw.label) : null;
  const rot = rw.rot ? t.starChart.rotation(rw.rot) : null;
  return [label, rot].filter(Boolean).join(" · ") || t.starChart.rewards;
}

/** El nombre de un objeto de la tabla: el plano dice "Plano de X" y la reliquia "Reliquia X", como en sus fichas. */
function itemName(t: WfCopy, r: Ref | undefined, key: string, lang: Lang): string {
  if (!r) return key.replace(/^drop:/, "");
  const name = refName(r, lang);
  if (r.bp) return t.arsenal.blueprint(name);
  if (r.tab === "relics") return t.relics.relicOf(name);
  return name;
}

export default function NodePage({ ficha, route, navigate }: { ficha: StarFicha; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.starChart;
  const { lang } = useLang();
  const locale = useLocale();
  const name = say(ficha.name, lang);
  const pct = (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
  const listTo: Route = { ...route, view: "warframe", wfSection: "star-chart", detail: undefined };
  const resources = ficha.resources.map((k) => ficha.refs[k]).filter((r): r is Ref => !!r);
  const facts: [string, string][] = [
    [c.mission, t.missionType[ficha.type] ?? ficha.type],
    [c.faction, t.faction[ficha.faction] ?? ficha.faction],
    [c.level, starLevel(ficha.lv)],
  ];
  if (ficha.mr > 0) facts.push([c.mastery, String(ficha.mr)]);

  return (
    <main className="wf-main wf-ficha wf-node">
      <Panel className="wf-head">
        <div className="wf-head-text">
          <RouteLink className="wf-back" to={listTo} search={writeStarFilters({ planet: planetSlug(ficha.planet), type: null })} onNavigate={navigate}>
            {t.tabs["star-chart"]}
          </RouteLink>
          <p className="wf-kicker">
            {say(ficha.planet, lang)}
            {ficha.dark && ` · ${c.dark}`}
          </p>
          <h1 className="wf-h1 is-name" style={{ "--len": longestWord(name) } as CSSProperties}>
            {name}
          </h1>
          <dl className="wf-node-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <Panel>
        <h2 className="wf-h2">{c.rewards}</h2>
        {ficha.rewards.length === 0 ? (
          <p className="wf-dim wf-nodrops">{c.noRewards}</p>
        ) : (
          <div className="wf-node-rots">
            {ficha.rewards.map((rw, i) => (
              <section className="wf-node-rot" key={i}>
                <h3 className="wf-h3">{rewardTitle(t, rw)}</h3>
                <table className="wf-table wf-node-table">
                  <thead>
                    <tr>
                      <th>{c.reward}</th>
                      <th className="is-num">{c.chance}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rw.items]
                      .sort((a, b) => b.chance - a.chance)
                      .map((it, j) => {
                        const r = ficha.refs[it.ref];
                        const label = (
                          <>
                            <Icon img={r?.img} size={32} />
                            <span>{itemName(t, r, it.ref, lang)}</span>
                          </>
                        );
                        return (
                          <tr key={j}>
                            <td>
                              {r?.tab && r.slug ? (
                                <RouteLink className="wf-reward" to={{ ...route, view: "warframe", wfSection: r.tab, detail: r.slug }} onNavigate={navigate} prefetch="press">
                                  {label}
                                </RouteLink>
                              ) : (
                                <span className="wf-reward">{label}</span>
                              )}
                            </td>
                            <td className="is-num">{pct(it.chance)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </Panel>

      {resources.length > 0 && (
        <Panel>
          <h2 className="wf-h2">{c.resources}</h2>
          <ul className="wf-ings">
            {resources.map((r, i) => (
              <li key={i}>
                {r.tab && r.slug ? (
                  <RouteLink className="wf-ing" to={{ ...route, view: "warframe", wfSection: r.tab, detail: r.slug }} onNavigate={navigate}>
                    <Icon img={r.img} size={40} />
                    <span>{refName(r, lang)}</span>
                  </RouteLink>
                ) : (
                  <span className="wf-ing">
                    <Icon img={r.img} size={40} />
                    <span>{refName(r, lang)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
