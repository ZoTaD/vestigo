/**
 * La pestaña Monumentos de Rust (2026-10-09): la lista con la red de Power Trip (`/rust/monuments`) y la ficha de cada
 * monumento (`/rust/monuments/launch-site`, `/es/rust/monumentos/zona-de-lanzamiento`). Plan:
 * docs/superpowers/plans/2026-10-09-rust-monumentos.md.
 */
import type { CSSProperties } from "react";
import itemSlugsEs from "@rust/site/slugs-es.json";
import slugsEs from "@rust/site/monuments-slugs-es.json";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import { registerRustSlugs, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import { formatDuration } from "../items/format";
import { Icon, RefLink } from "../items/parts";
import RsLoading from "../RsLoading";
import { useMonumentsCopy } from "./copy";
import { MonumentSpawns } from "./MonumentSpawns";
import { loadMonuments, peekMonuments, say, type Card, type Monument, type Monuments } from "./data";
import "../../styles/rust-items.css";
import "../../styles/rust-monuments.css";

// Al cargarse el módulo: `/es/rust/monumentos/zona-de-lanzamiento` ya llega como `launch-site`, y los objetos que
// enlaza (tiendas, fusibles) van con su slug en español.
registerRustSlugs(slugsEs);
registerRustSlugs(itemSlugsEs);

type Nav = (r: Route) => void;
const CARD_ICON: Record<Card, string> = { green: "keycard_green", blue: "keycard_blue", red: "keycard_red" };
const CARDS: Card[] = ["green", "blue", "red"];

export default function RustMonuments({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("monuments", () => peekMonuments() ?? undefined, loadMonuments);
  if (data.failed) return <RsLoading onRetry={data.retry} />;
  if (!data.value) return <RsLoading />;
  const m = route.detail ? data.value.monuments.find((x) => x.id === route.detail) : undefined;
  if (m) return <MonumentFicha d={data.value} m={m} route={route} navigate={navigate} key={m.id} />;
  return <MonumentList d={data.value} route={route} navigate={navigate} missing={!!route.detail} />;
}

const to = (route: Route, detail?: string): Route => ({ ...route, view: "rust", rsSection: "monuments", detail });

function MonumentList({ d, route, navigate, missing }: { d: Monuments; route: Route; navigate: Nav; missing: boolean }) {
  const t = useMonumentsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const byId = new Map(d.monuments.map((m) => [m.id, m]));
  const pg = d.powergrid;
  const pct = (x: number) => `${Math.round(x * 100).toLocaleString(locale)}`;
  const slow = `${pct(pg.wear.slow[0])}–${pct(pg.wear.slow[1])} %`;
  return (
    <main className="rs-main rs-mons">
      <section className="rs-pnl">
        <div className="rs-title">
          <h1 className="rs-h1">{t.h1}</h1>
        </div>
        <p className="rs-lede">{t.lede(d.monuments.length)}</p>
        {missing && <p className="rs-missing">{t.missing}</p>}
      </section>
      <ul className="rs-mon-list">
        {d.monuments.map((m, i) => (
          <li key={m.id}>
            <RouteLink className="rs-mon-card" to={to(route, m.id)} onNavigate={navigate}>
              <span className="rs-mon-pic">
                {m.photo ? (
                  <img src={`/rust/monuments/${m.photo}.webp`} alt="" width={320} height={180} loading={i < 4 ? undefined : "lazy"} decoding="async" />
                ) : (
                  <span className="rs-mon-type">{t.types[m.type] ?? m.type}</span>
                )}
              </span>
              <span className="rs-mon-txt">
                <b>{say(m.name, lang)}</b>
                <span className="rs-mon-chips">
                  {m.safeZone && <em className="rs-mon-chip is-safe">{t.safe}</em>}
                  {CARDS.filter((c) => m.cards[c]).map((c) => (
                    <em className={`rs-mon-chip is-${c}`} key={c} title={t.card(m.cards[c]!, t.cards[c])}>
                      {m.cards[c]} {t.cards[c]}
                    </em>
                  ))}
                  {m.radiation && <em className="rs-mon-chip is-rad">{t.radiation[m.radiation]}</em>}
                </span>
              </span>
            </RouteLink>
          </li>
        ))}
      </ul>

      <section className="rs-pnl" id="power-grid">
        <h2 className="rs-hd">{t.grid.title}</h2>
        <p className="rs-farm-p">
          {t.grid.lede(say(pg.fuse.name, lang), pg.boxes[0], pg.boxes[1] ?? 0)}
        </p>
        <ol className="rs-grid-stages">
          {pg.byStage.map((s) => (
            <li key={s.stage}>
              <span className="rs-grid-stage">
                <b>{t.grid.stage(s.stage)}</b>
                <span>
                  <Icon id={pg.fuse.id} size={28} /> {t.grid.fuses(s.fuses)}
                </span>
              </span>
              <span className="rs-grid-mons">
                {s.monuments.map((id) => {
                  const m = byId.get(id);
                  return m ? (
                    <RouteLink className="rs-ref" to={to(route, id)} onNavigate={navigate} key={id}>
                      {say(m.name, lang)}
                    </RouteLink>
                  ) : null;
                })}
              </span>
            </li>
          ))}
        </ol>
        <p className="rs-farm-p">
          {t.grid.wear(pg.wear.worst, formatDuration(pg.wear.seconds), slow, pg.wear.pop[1], pg.wear.pop[0], Math.round(1 / pg.wear.lowPopScale))}
        </p>
        <p className="rs-note">{t.grid.note}</p>
      </section>
    </main>
  );
}

function MonumentFicha({ d, m, route, navigate }: { d: Monuments; m: Monument; route: Route; navigate: Nav }) {
  const t = useMonumentsCopy();
  const { lang } = useLang();
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const name = say(m.name, lang);
  const word = Math.max(1, ...name.split(/[\s-]+/).map((w) => [...w].length));
  const shop = m.shop ? d.shops[m.shop] : null;
  const fusesAt = (stage: number) => d.powergrid.stages[stage - 1] ?? 0;
  const cards = CARDS.filter((c) => m.cards[c]);
  const rent = d.apartments.shopRent;
  return (
    <main className="rs-main rs-ficha rs-mons">
      <RouteLink className="rs-back" to={to(route)} onNavigate={navigate}>
        ← {t.back}
      </RouteLink>
      <section className="rs-pnl rs-mon-top">
        {m.photo && <img className="rs-mon-hero" src={`/rust/monuments/${m.photo}.webp`} alt="" width={640} height={360} />}
        <div className="rs-title">
          <p className="rs-hd">{t.types[m.type] ?? m.type}</p>
          <h1 className="rs-h1" style={{ "--rs-word": word } as CSSProperties}>
            {name}
          </h1>
        </div>
        <dl className="rs-facts">
          <div>
            <dt>{t.facts.tiers}</dt>
            <dd title={t.tierNote}>{m.tiers.length ? m.tiers.map(t.tier).join(", ") : t.anyTier}</dd>
          </div>
          {m.size && (
            <div>
              <dt>{t.facts.size}</dt>
              <dd>{t.meters(m.size[0], m.size[1])}</dd>
            </div>
          )}
          {m.minWorldSize && (
            <div>
              <dt>{t.facts.minWorld}</dt>
              <dd>{num(m.minWorldSize)}</dd>
            </div>
          )}
          <div>
            <dt>{t.facts.safeZone}</dt>
            <dd>{m.safeZone ? t.yes : t.no}</dd>
          </div>
          <div>
            <dt>{t.radiationLabel}</dt>
            <dd>{m.radiation ? t.radiation[m.radiation] : t.noRadiation}</dd>
          </div>
          {m.variants > 1 && (
            <div>
              <dt>{t.facts.variants}</dt>
              <dd>{m.variants}</dd>
            </div>
          )}
        </dl>
        <p className="rs-note">{t.tierNote}</p>
      </section>

      {(cards.length > 0 || m.fuses > 0) && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.puzzleTitle}</h2>
          <ul className="rs-mon-puzzle">
            {cards.map((c) => (
              <li key={c}>
                <span className="rs-slot">
                  <Icon id={CARD_ICON[c]} size={40} />
                </span>
                <span>{t.card(m.cards[c]!, t.cards[c].toLowerCase())}</span>
              </li>
            ))}
            {m.fuses > 0 && (
              <li>
                <span className="rs-slot">
                  <Icon id="fuse" size={40} />
                </span>
                <span>{t.fuses(m.fuses)}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      <MonumentSpawns d={d} m={m} route={route} navigate={navigate} />

      {Object.keys(m.recyclers).length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.recyclersTitle}</h2>
          <ul className="rs-mon-puzzle">
            {(["red", "green", "yellow"] as const).filter((c) => m.recyclers[c]).map((c) => (
              <li key={c}>
                <b className={`rs-mon-chip is-rec-${c}`}>{m.recyclers[c]}</b>
                <span>{t.recyclers[c]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.power.length > 0 && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.powerTitle}</h2>
          <ul className="rs-mon-power">
            {m.power.map((p, i) => (
              <li key={i}>
                <b>{t.powerAt(p.stage, fusesAt(p.stage))}</b>
                <span>{t.power[p.what]}</span>
              </li>
            ))}
          </ul>
          <p className="rs-note">
            <RouteLink className="rs-ref" to={to(route)} onNavigate={navigate}>
              {t.grid.title} →
            </RouteLink>
          </p>
        </section>
      )}

      {m.apartments && (
        <section className="rs-pnl">
          <h2 className="rs-hd">{t.apartments.title}</h2>
          <p className="rs-farm-p">
            {t.apartments.lede(d.apartments.shops)} {t.apartments.freeHours(d.apartments.freeHours)} {t.apartments.evict(d.apartments.evictHours)}{" "}
            {t.apartments.masterKey(d.apartments.masterKey)}
          </p>
          <table className="rs-table">
            <thead>
              <tr>
                <th scope="col">{t.apartments.room}</th>
                <th scope="col">{t.apartments.cost}</th>
                <th scope="col">{t.apartments.rent}</th>
              </tr>
            </thead>
            <tbody>
              {d.apartments.rooms.map((r) => (
                <tr key={r.size}>
                  <th scope="row">{say(r.name, lang)}</th>
                  <td>
                    {num(r.cost)} {say(d.apartments.scrap.name, lang)}
                  </td>
                  <td>{t.apartments.perDay(r.rent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="rs-sub">{t.apartments.taxTitle}</h3>
          <p className="rs-farm-p">{t.apartments.taxNote(d.apartments.taxScale)}</p>
          <ul className="rs-farm-compost">
            {d.apartments.tax.map((x) => (
              <li key={x.item.id}>
                <RefLink r={x.item} route={route} navigate={navigate}>
                  <Icon id={x.item.id} size={32} />
                  <span>{say(x.item.name, lang)}</span>
                </RefLink>
                <b>{num(x.scrap)}</b>
              </li>
            ))}
          </ul>
          <h3 className="rs-sub">{t.apartments.shopsTitle}</h3>
          <p className="rs-farm-p">
            {t.apartments.shopOpen(rent.fee + rent.hours * rent.perHour, rent.fee, rent.hours, rent.perHour)} {t.apartments.shopTakeover(rent.protectHours)}
          </p>
          <p className="rs-note">{t.apartments.defaults}</p>
        </section>
      )}

      {shop && (
        <section className="rs-pnl">
          <h2 className="rs-hd">
            {t.shopTitle}: {say(shop.name, lang)}
          </h2>
          <ul className="rs-mon-shop">
            {shop.orders.map((o, i) => (
              <li key={i}>
                <RefLink r={o.item} route={route} navigate={navigate}>
                  <span className="rs-slot">
                    <Icon id={o.item.id} size={36} />
                  </span>
                  <span>
                    {say(o.item.name, lang)}
                    {o.bp && <em className="rs-tag">{t.blueprint}</em>}
                    <span className="rs-dim">{t.shopRow(o.amount, o.price, say(o.currency.name, lang))}</span>
                  </span>
                </RefLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
