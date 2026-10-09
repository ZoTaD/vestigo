/**
 * La ficha de una planta de Rust (2026-10-09): lo que tarda cada etapa, cuánto da, el agua, la luz y la temperatura que
 * pide, su semilla y su esqueje, y un enlace a la calculadora de genética con la planta elegida.
 */
import type { CSSProperties } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import { routePath, type Route } from "../../route";
import { formatDuration } from "../items/format";
import { Icon, RefLink } from "../items/parts";
import { useFarmingCopy } from "./copy";
import { say, type Farming, type Plant } from "./data";
import { harvestAmount, ripeMinutes } from "./genetics";

type Nav = (r: Route) => void;

export default function PlantFicha({ farming: f, plant: p, route, navigate }: { farming: Farming; plant: Plant; route: Route; navigate: Nav }) {
  const t = useFarmingCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number, d = 1) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const name = say(p.name, lang);
  const none: never[] = [];
  const back: Route = { ...route, view: "rust", rsSection: "farming", detail: undefined };
  const calc: Route = { ...route, view: "rust", rsSection: "farming", detail: "genetics" };
  const word = Math.max(1, ...name.split(/[\s-]+/).map((w) => [...w].length));
  return (
    <main className="rs-main rs-ficha rs-farm">
      <RouteLink className="rs-back" to={back} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-ficha-top">
        <span className="rs-slot rs-slot-big">
          <img src={`/rust/items/${p.icon}.webp`} alt="" width={128} height={128} />
        </span>
        <div className="rs-title">
          <p className="rs-hd">{t.plantsTitle}</p>
          <h1 className="rs-h1" style={{ "--rs-word": word } as CSSProperties}>
            {name}
          </h1>
          <p className="rs-lede">{t.perfectNote}</p>
          {/* Un `<a>` propio y no `RouteLink`, que no deja sumar `?p=`: la calculadora abre con la planta elegida. Se escribe
              la dirección antes de navegar, y `navigate` ya no la pisa (ve el mismo camino). */}
          <a className="rs-btn" href={`${routePath(calc)}?p=${p.id}`} onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
            e.preventDefault();
            window.history.pushState(null, "", `${routePath(calc)}?p=${p.id}`);
            navigate(calc);
          }}>
            {t.openCalc}
          </a>
        </div>
        <dl className="rs-facts">
          <div>
            <dt>{t.facts.ripe}</dt>
            <dd>{formatDuration(ripeMinutes(p, none, f.rules) * 60)}</dd>
          </div>
          <div>
            <dt>{t.facts.harvest}</dt>
            <dd>
              <RefLink r={p.harvest.item} route={route} navigate={navigate}>
                {harvestAmount(p, none, f.rules)} × {say(p.harvest.item.name, lang)}
              </RefLink>
            </dd>
          </div>
          <div>
            <dt>{t.facts.water}</dt>
            <dd>{t.perTick(num(p.water))}</dd>
          </div>
          <div>
            <dt>{t.facts.temp}</dt>
            <dd>{t.tempRange(num(p.temp.min ?? 0), num(p.temp.max ?? 0), num(p.temp.best))}</dd>
          </div>
          <div>
            <dt>{t.facts.light}</dt>
            <dd>{t.lightText}</dd>
          </div>
          <div>
            <dt>{t.facts.clones}</dt>
            <dd>{p.clones}</dd>
          </div>
          <div>
            <dt>{t.facts.market}</dt>
            <dd>{p.market}</dd>
          </div>
        </dl>
      </section>

      <section className="rs-pnl">
        <h2 className="rs-hd">{t.stagesTitle}</h2>
        <table className="rs-table rs-farm-stages">
          <thead>
            <tr>
              <th scope="col">{t.stageCol}</th>
              <th scope="col">{t.minutesCol}</th>
            </tr>
          </thead>
          <tbody>
            {p.stages.map((s) => (
              <tr key={s.state} className={s.fixed ? "is-fixed" : undefined}>
                <th scope="row">
                  {t.stages[s.state]}
                  {s.fixed && <span aria-hidden="true"> *</span>}
                </th>
                <td>{formatDuration(s.minutes * 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rs-note">* {t.fixedNote}</p>
      </section>

      <section className="rs-pnl">
        <ul className="rs-ings">
          {[p.seed, p.clone, p.harvest.item].map((r, i) => (
            <li key={r.id}>
              <RefLink r={r} route={route} navigate={navigate}>
                <span className="rs-slot">
                  <Icon id={r.id} />
                </span>
                <span>
                  <span className="rs-dim">{[t.facts.seed, t.facts.clone, t.facts.harvest][i]}</span>
                  <br />
                  {say(r.name, lang)}
                </span>
              </RefLink>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
