/**
 * La ficha de una reliquia (2026-10-27): el nombre con su era, el rótulo de Vault si no cae en ninguna misión, las seis
 * recompensas (ícono, nombre enlazado a la ficha del Arsenal si es parte de algo publicado, rareza) con una columna por
 * refinamiento, y de dónde cae la reliquia. Una reliquia del Vault no repite "no cae en misiones" en la tabla.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useWfCopy } from "../../warframeCopy";
import { refName, say, type RelicFicha } from "../data";
import Sources from "../Sources";
import { Icon, Panel, Rarity, type Nav } from "../ui";

const longestWord = (name: string): number => Math.max(...name.split(/\s+/).map((w) => w.length), 1);

export default function RelicPage({ ficha, route, navigate }: { ficha: RelicFicha; route: Route; navigate: Nav }) {
  const t = useWfCopy();
  const c = t.relics;
  const { lang } = useLang();
  const locale = useLocale();
  const title = c.relicOf(say(ficha.name, lang));
  const pct = (n: number) => `${n.toLocaleString(locale, { maximumFractionDigits: 2 })} %`;
  const listTo: Route = { ...route, view: "warframe", wfSection: "relics", detail: undefined };

  return (
    <main className="wf-main wf-ficha">
      <Panel className="wf-head">
        <Icon img={ficha.img} size={128} lazy={false} />
        <div className="wf-head-text">
          <RouteLink className="wf-back" to={listTo} onNavigate={navigate}>
            {t.tabs.relics}
          </RouteLink>
          <p className="wf-kicker">{t.era[ficha.era as keyof typeof t.era] ?? ficha.era}</p>
          <h1 className="wf-h1 is-name" style={{ "--len": longestWord(title) } as CSSProperties}>
            {title}
          </h1>
          {ficha.vaulted && <p className="wf-vault">{t.vault}</p>}
        </div>
      </Panel>

      <Panel>
        <h2 className="wf-h2">{c.rewards}</h2>
        <div className="wf-table-wrap">
          <table className="wf-table wf-rewards">
            <thead>
              <tr>
                <th>{c.reward}</th>
                {c.refinement.map((r) => (
                  <th className="is-num" key={r}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ficha.rewards.map((rw, i) => {
                const r = ficha.refs[rw.ref];
                const name = r ? (r.bp ? t.arsenal.blueprint(refName(r, lang)) : refName(r, lang)) : rw.ref;
                const label = (
                  <>
                    <Icon img={r?.img} size={40} />
                    <span>
                      {name}
                      <Rarity r={rw.rarity} />
                    </span>
                  </>
                );
                return (
                  <tr data-reward="" key={i}>
                    <td>
                      {r?.tab && r.slug ? (
                        <RouteLink className="wf-reward" to={{ ...route, view: "warframe", wfSection: r.tab, detail: r.slug }} onNavigate={navigate}>
                          {label}
                        </RouteLink>
                      ) : (
                        <span className="wf-reward">{label}</span>
                      )}
                    </td>
                    {rw.chances.map((n, j) => (
                      <td className="is-num" key={j}>
                        {pct(n)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {(!ficha.vaulted || ficha.sources.length > 0) && (
        <Panel>
          <h2 className="wf-h2">{t.sources.heading}</h2>
          <Sources list={ficha.sources} refs={ficha.refs} route={route} navigate={navigate} />
        </Panel>
      )}
    </main>
  );
}
