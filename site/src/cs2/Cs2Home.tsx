/**
 * La portada de CS2 (2026-11-03), estética Dust II: la cinta con las cajas que más devuelven hoy, el título en esténcil
 * con una skin grande al lado, la fecha de la foto de precios y una tarjeta por pestaña.
 */
import { useEffect, useState } from "react";
import meta from "@cs2/meta.json";
import RouteLink from "../RouteLink";
import type { Cs2Section, Cs2Tab, Route } from "../route";
import { useCs2Copy } from "../cs2Copy";
import { loadCasePrices, loadList, loadPriceDate, peekCasePrices, peekList, peekPriceDate, type CasePrice, type CaseRow } from "./data";
import { Img, Pct, Price, useNum, type Nav } from "./ui";

const TABS: Cs2Tab[] = ["esports", "cases", "skins", "market", "trade-up", "inventory", "collections", "patches"];
/** La imagen de cada tarjeta: la Kilowatt, la AWP | Chrome Cannon y su colección (la AK-47 | Inheritance va en la cabecera). */
const TAB_IMG: Record<Cs2Tab, string> = { cases: "kilowatt-case", skins: "awp-chrome-cannon", collections: "the-kilowatt-collection", "trade-up": "kukri-knife-fade", inventory: "operation-breakout-weapon-case", market: "ak-47-wild-lotus", patches: "the-dust-2-collection", esports: "austin-2025-dust-ii-souvenir-package" };

/** Las cajas con "devuelve" (precio de caja y valor esperado), de la que más devuelve a la que menos. */
export function bestReturns(cases: CaseRow[], prices: Record<string, CasePrice>, n = 14): (CaseRow & { p: CasePrice })[] {
  return cases
    .filter((c) => prices[c.slug]?.ret != null)
    .map((c) => ({ ...c, p: prices[c.slug] }))
    .sort((a, b) => (b.p.ret ?? 0) - (a.p.ret ?? 0))
    .slice(0, n);
}

export default function Cs2Home({ route, navigate, live }: { route: Route; navigate: Nav; live: (tab: Cs2Section) => boolean }) {
  const t = useCs2Copy();
  const num = useNum();
  const [data, setData] = useState(() => {
    const cases = peekList("cases"), prices = peekCasePrices();
    return cases && prices ? { cases, prices, date: peekPriceDate() } : null;
  });
  useEffect(() => {
    if (data) return;
    let vivo = true;
    Promise.all([loadList("cases"), loadCasePrices(), loadPriceDate()]).then(([cases, prices, date]) => vivo && setData({ cases, prices, date }), () => undefined);
    return () => {
      vivo = false;
    };
  }, [data]);
  const ribbon = data ? bestReturns(data.cases, data.prices) : [];
  const to = (tab: Cs2Section, detail?: string): Route => ({ ...route, view: "cs2", c2Section: tab, detail });
  return (
    <main className="c2-main c2-home">
      {ribbon.length > 0 && (
        <div className="c2-ribbon" aria-label={t.home.ribbon}>
          <span className="c2-ribbon-h">{t.home.ribbon}</span>
          {ribbon.map((c) => (
            <RouteLink key={c.slug} className="c2-ribbon-i" to={to("cases", c.slug)} onNavigate={navigate}>
              {c.name.replace(/ Case$/, "")} <Pct v={c.p.ret ?? 0} d={0} className={(c.p.ret ?? 0) >= 1 ? "is-up" : "is-down"} />
            </RouteLink>
          ))}
        </div>
      )}
      <header className="c2-home-hero">
        <div className="c2-head">
          <h1 className="c2-h1">{t.home.h1}</h1>
          <p className="c2-lede">{t.home.lede}</p>
          {data?.date && <p className="c2-dim">{t.home.pricesOf(data.date)}</p>}
        </div>
        <Img img="ak-47-inheritance" w={320} h={240} big lazy={false} />
      </header>
      <ul className="c2-cards">
        {TABS.map((tab) => (
          <li key={tab}>
            {live(tab) ? (
              <RouteLink className="c2-card" to={to(tab)} onNavigate={navigate}>
                <Img img={TAB_IMG[tab]} w={128} h={96} />
                <span>
                  <b className="c2-card-h">{t.tabs[tab]}</b>
                  <span className="c2-dim">{t.home.cards[tab](tab === "trade-up" || tab === "inventory" || tab === "market" || tab === "patches" || tab === "esports" ? "" : num(meta.counts[tab], 0))}</span>
                </span>
              </RouteLink>
            ) : (
              <span className="c2-card is-soon">
                <Img img={TAB_IMG[tab]} w={128} h={96} />
                <span>
                  <b className="c2-card-h">{t.tabs[tab]}</b>
                  <span className="c2-dim">{t.home.cards[tab](tab === "trade-up" || tab === "inventory" || tab === "market" || tab === "patches" || tab === "esports" ? "" : num(meta.counts[tab], 0))}</span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
