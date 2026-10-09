/**
 * La portada de Granjas (2026-10-09): las 14 plantas en casilleros con lo que tardan y lo que dan, el acceso a la
 * calculadora de genética, los genes, las jardineras, el compost, el agua/luz/calor, las gallinas, las abejas, el
 * ganado y las razas de caballo. Todo con los números del juego.
 */
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { formatDuration } from "../items/format";
import { Icon, RefLink } from "../items/parts";
import { useFarmingCopy } from "./copy";
import { say, type Farming } from "./data";
import { ripeMinutes, harvestAmount } from "./genetics";
import { GeneChip } from "./GeneChips";

type Nav = (r: Route) => void;

export default function FarmingHome({ farming: f, route, navigate, missing }: { farming: Farming; route: Route; navigate: Nav; missing: boolean }) {
  const t = useFarmingCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number, d = 2) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const pct = (p: number) => (lang === "es" ? `${p} %` : `${p}%`);
  const to = (detail?: string): Route => ({ ...route, view: "rust", rsSection: "farming", detail });
  const none: never[] = [];
  const genes = f.genes.slice().sort((a, b) => Number(b.positive) - Number(a.positive));
  return (
    <main className="rs-main rs-farm">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(f.plants.length)}</p>
        {missing && <p className="rs-missing">{t.missing}</p>}
        <RouteLink className="rs-farm-cta" to={to("genetics")} onNavigate={navigate}>
          <b>{t.geneticsCard.title}</b>
          <span>{t.geneticsCard.text}</span>
          <em className="rs-btn">{t.geneticsCard.cta}</em>
        </RouteLink>
      </section>

      <section className="rs-pnl">
        <h2 className="rs-hd">{t.plantsTitle}</h2>
        <ul className="rs-farm-plants">
          {f.plants.map((p) => (
            <li key={p.id}>
              <RouteLink className="rs-farm-plant" to={to(p.id)} onNavigate={navigate}>
                <span className="rs-slot">
                  <img src={`/rust/items/${p.icon}.webp`} alt="" width={56} height={56} decoding="async" />
                </span>
                <span className="rs-farm-plant-txt">
                  <b>{say(p.name, lang)}</b>
                  <span>{t.ripeIn(formatDuration(ripeMinutes(p, none, f.rules) * 60))}</span>
                  <span>{t.gives(harvestAmount(p, none, f.rules), say(p.harvest.item.name, lang))}</span>
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </section>

      <div className="rs-farm-cols">
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.genesTitle}</h2>
          <p className="rs-farm-p">{t.genesNote}</p>
          <ul className="rs-farm-genes">
            {genes.map((g) => (
              <li key={g.letter}>
                <GeneChip gene={g.letter} />
                <span>
                  <b>{say(g.name, lang)}</b> <span className="rs-dim">({g.positive ? t.good : t.bad}, {num(g.cross)})</span>
                  <span className="rs-farm-sub">{t.geneEffect[g.letter]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rs-pnl">
          <h2 className="rs-hd">{t.plantersTitle}</h2>
          <p className="rs-farm-p">{t.plantersNote(pct(Math.round(f.rules.saturation * 100)))}</p>
          <table className="rs-table">
            <thead>
              <tr>
                <th scope="col">{t.planter}</th>
                <th scope="col">{t.waterCap}</th>
              </tr>
            </thead>
            <tbody>
              {f.planters.map((p) => (
                <tr key={p.item.id}>
                  <th scope="row">
                    <RefLink r={p.item} route={route} navigate={navigate}>
                      <Icon id={p.item.id} size={32} />
                      <span>{say(p.item.name, lang)}</span>
                      {p.pot && <em className="rs-tag">{t.pot}</em>}
                    </RefLink>
                  </th>
                  <td>{num(p.water)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rs-pnl">
        <h2 className="rs-hd">{t.careTitle}</h2>
        <ul className="rs-farm-care">
          <li>
            <RefLink r={f.sprinkler.item} route={route} navigate={navigate}>
              <Icon id={f.sprinkler.item.id} size={40} />
            </RefLink>
            <span>{t.sprinkler(f.sprinkler.water, f.sprinkler.every)}</span>
          </li>
          {f.lights[0] && (
            <li>
              <RefLink r={f.lights[0]} route={route} navigate={navigate}>
                <Icon id={f.lights[0].id} size={40} />
              </RefLink>
              <span>{t.lights(f.rules.lightRange)}</span>
            </li>
          )}
          <li>
            <RefLink r={f.heater} route={route} navigate={navigate}>
              <Icon id={f.heater.id} size={40} />
            </RefLink>
            <span>{t.heater(f.rules.heatRange)}</span>
          </li>
        </ul>
      </section>

      <section className="rs-pnl">
        <h2 className="rs-hd">{t.compostTitle}</h2>
        <p className="rs-farm-p">
          <RefLink r={f.composter.item} route={route} navigate={navigate}>
            {say(f.composter.item.name, lang)}
          </RefLink>
          {" · "}
          {t.compostNote(f.composter.slots, f.composter.interval / 60)}
        </p>
        <ul className="rs-farm-compost">
          {f.compost.map((c) => (
            <li key={c.item.id}>
              <RefLink r={c.item} route={route} navigate={navigate}>
                <Icon id={c.item.id} size={32} />
                <span>{say(c.item.name, lang)}</span>
              </RefLink>
              <b title={t.compostPer}>{num(c.fert)}</b>
            </li>
          ))}
        </ul>
        <p className="rs-note">{t.biofuel}</p>
      </section>

      <div className="rs-farm-cols">
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.chickensTitle}</h2>
          <div className="rs-farm-animal">
            <img src={`/rust/farming/${f.animalPics.chicken}.webp`} alt="" width={64} height={64} loading="lazy" decoding="async" />
            <p className="rs-farm-p">{t.chickens(f.chickens.max, f.chickens.hatch, f.chickens.every[0], f.chickens.every[1])}</p>
          </div>
          <p className="rs-meta">
            <RefLink r={f.chickens.coop} route={route} navigate={navigate}>{say(f.chickens.coop.name, lang)}</RefLink>
            <RefLink r={f.chickens.egg} route={route} navigate={navigate}>{say(f.chickens.egg.name, lang)}</RefLink>
          </p>
          <h2 className="rs-hd rs-farm-hd2">{t.beesTitle}</h2>
          <p className="rs-farm-p">{t.bees}</p>
          <p className="rs-meta">
            {[f.beehive.item, f.beehive.nucleus, f.beehive.comb].map((r) => (
              <RefLink r={r} route={route} navigate={navigate} key={r.id}>{say(r.name, lang)}</RefLink>
            ))}
          </p>
        </section>

        <section className="rs-pnl">
          <h2 className="rs-hd">{t.livestockTitle}</h2>
          {f.livestock.map((a) => (
            <div className="rs-farm-animal" key={a.species}>
              <img src={`/rust/farming/${f.animalPics[a.species]}.webp`} alt="" width={64} height={64} loading="lazy" decoding="async" />
              <div>
                <b className="rs-farm-name">{t.species[a.species]}</b>
                <ul className="rs-farm-facts">
                  <li>
                    {t.livestock.product}: {num(a.product.amount)} ×{" "}
                    <RefLink r={a.product.item} route={route} navigate={navigate}>{say(a.product.item.name, lang)}</RefLink>{" "}
                    {t.livestock.every(formatDuration(a.product.cooldown))}
                  </li>
                  <li>{t.livestock.grow(formatDuration(a.grow))}</li>
                  <li>{t.livestock.pregnant(formatDuration(a.pregnant))}</li>
                  <li>{t.livestock.herd(a.herd[0], a.herd[1])}</li>
                  <li>{t.livestock.dung(formatDuration(a.dung.every))}</li>
                </ul>
              </div>
            </div>
          ))}
          <p className="rs-note">{t.livestockGenes}</p>
        </section>
      </div>

      <section className="rs-pnl">
        <h2 className="rs-hd">{t.horsesTitle}</h2>
        <p className="rs-farm-p">{t.horsesNote}</p>
        <table className="rs-table rs-farm-horses">
          <thead>
            <tr>
              <th scope="col">{t.horse.breed}</th>
              <th scope="col">{t.horse.speed}</th>
              <th scope="col">{t.horse.health}</th>
              <th scope="col">{t.horse.stamina}</th>
            </tr>
          </thead>
          <tbody>
            {f.horses.map((h) => (
              <tr key={h.id}>
                <th scope="row">
                  <span className="rs-ref">
                    {h.pic && <img src={`/rust/farming/${h.pic}.webp`} alt="" width={36} height={36} loading="lazy" decoding="async" />}
                    <span>{say(h.name, lang)}</span>
                  </span>
                </th>
                <td className={h.speed > 1 ? "rs-farm-up" : h.speed < 1 ? "rs-farm-down" : undefined}>{num(h.speed)}</td>
                <td className={h.health > 1 ? "rs-farm-up" : h.health < 1 ? "rs-farm-down" : undefined}>{num(h.health)}</td>
                <td>{num(h.stamina)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
