/**
 * La ficha de una skin (2026-11-03), estética Dust II: la imagen grande sobre el tinte de su rareza, el nombre en
 * esténcil, el rango de float sobre la barra de desgastes, la tabla de precios (normal, StatTrak y Souvenir) y de qué
 * cajas y colecciones sale. Las fases de Doppler y Gamma Doppler enlazan entre sí con su precio.
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy } from "../../cs2Copy";
import type { CaseRow, CollRow, SkinFicha, SkinPrice, SkinRow } from "../data";
import { lowest } from "./filters";
import { MarketBlockFor } from "../market/MarketBlock";
import { FloatRange, Img, Price, Rarity, WearBar, WearPrices, type Nav } from "../ui";

export default function SkinPage({
  ficha,
  price,
  skins,
  skinPrices,
  cases,
  collections,
  date,
  route,
  navigate,
}: {
  ficha: SkinFicha;
  price: SkinPrice | undefined;
  skins: Map<string, SkinRow>;
  skinPrices: Record<string, SkinPrice>;
  cases: Map<string, CaseRow>;
  collections: Map<string, CollRow>;
  date: string | null;
  route: Route;
  navigate: Nav;
}) {
  const t = useCs2Copy();
  const to = (c2Section: "skins" | "cases" | "collections", detail?: string): Route => ({ ...route, view: "cs2", c2Section, detail });
  const title = ficha.phase ? `${ficha.name} · ${ficha.phase}` : ficha.name;
  const caseRows = ficha.cases.map((s) => cases.get(s)).filter((r): r is CaseRow => !!r);
  const collRows = ficha.collections.map((s) => collections.get(s)).filter((r): r is CollRow => !!r);
  const chips = (tab: "cases" | "collections", rows: (CaseRow | CollRow)[]) => (
    <div className="c2-links">
      {rows.map((row) => (
        <RouteLink key={row.slug} className="c2-chip" to={to(tab, row.slug)} onNavigate={navigate}>
          <Img img={row.img} w={56} h={42} />
          {row.name}
        </RouteLink>
      ))}
    </div>
  );
  return (
    <main className="c2-main c2-ficha">
      <section className={`c2-skin is-${ficha.rarity}`}>
        <div className="c2-skin-pic">
          <Img img={ficha.img} w={360} h={270} big lazy={false} />
        </div>
        <div className="c2-skin-data">
          <p className="c2-crumb">
            <RouteLink to={to("skins")} onNavigate={navigate}>
              {t.tabs.skins}
            </RouteLink>{" "}
            · {ficha.weapon} · {t.cat[ficha.cat]} · <Rarity r={ficha.rarity} />
          </p>
          <h1>{title}</h1>
          {ficha.min != null && (
            <p className="c2-dim">
              {t.t.float} <FloatRange min={ficha.min} max={ficha.max} />
            </p>
          )}
          <WearBar min={ficha.min} max={ficha.max} />
          <p className="c2-dim">{t.t.listedNow}</p>
          <WearPrices skin={ficha} price={price} />
          <div className="c2-where">
            <p className="c2-dim">{t.t.fromCases}</p>
            {caseRows.length ? chips("cases", caseRows) : <p>{t.t.noCases}</p>}
            {collRows.length > 0 && (
              <>
                <p className="c2-dim">{t.t.fromCollections}</p>
                {chips("collections", collRows)}
              </>
            )}
          </div>
        </div>
      </section>

      {ficha.variants.length > 0 && (
        <section className="c2-panel">
          <h2 className="c2-h2">{t.t.variants}</h2>
          <div className="c2-links">
            {ficha.variants.map((v) => {
              const s = skins.get(v);
              return s ? (
                <RouteLink key={v} className="c2-chip" to={to("skins", v)} onNavigate={navigate}>
                  <Img img={s.img} w={64} h={48} />
                  <span>{s.phase ?? s.name}</span> <Price v={lowest(skinPrices[v])} />
                </RouteLink>
              ) : null;
            })}
          </div>
        </section>
      )}

      <MarketBlockFor slug={ficha.slug} />

      {ficha.desc && <p className="c2-desc">{ficha.desc}</p>}
      {date && <p className="c2-note">{t.t.pricesNote(date)}</p>}
    </main>
  );
}
