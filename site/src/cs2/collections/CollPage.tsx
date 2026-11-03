/**
 * La ficha de una colección (2026-11-03): las skins por rareza con su rango de float (lo que usa el trade-up) y el
 * precio en cada desgaste, y de qué cajas o paquetes sale ("no sale de cajas" si de ninguna: caen en partidas o del
 * Armory).
 */
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy, WEARS } from "../../cs2Copy";
import type { CaseRow, CollFicha, SkinPrice, SkinRow } from "../data";
import { FloatRange, Img, Price, Rarity, reaches, skinPart, type Nav } from "../ui";

/** Una skin que sólo existe como Souvenir (las de colecciones de mapa): se muestra ese precio en vez de una fila vacía. */
const soloSouvenir = (p: SkinPrice | undefined): boolean => !!p?.sv && !p.n?.some((v) => v != null);

export default function CollPage({
  ficha,
  skins,
  skinPrices,
  cases,
  date,
  route,
  navigate,
}: {
  ficha: CollFicha;
  skins: Map<string, SkinRow>;
  skinPrices: Record<string, SkinPrice>;
  cases: Map<string, CaseRow>;
  date: string | null;
  route: Route;
  navigate: Nav;
}) {
  const t = useCs2Copy();
  const to = (c2Section: "skins" | "cases" | "collections", detail?: string): Route => ({ ...route, view: "cs2", c2Section, detail });
  return (
    <main className="c2-main c2-ficha">
      <section className="c2-panel c2-hero">
        <Img img={ficha.img} w={120} h={90} big lazy={false} />
        <div>
          <p className="c2-dim">
            <RouteLink to={to("collections")} onNavigate={navigate}>
              {t.tabs.collections}
            </RouteLink>
            {ficha.date ? ` · ${ficha.date.replaceAll("-", "/")}` : ""} · {t.t.skinsN(ficha.n)}
          </p>
          <h1>{ficha.name}</h1>
          <div className="c2-where">
            <p className="c2-dim">{t.t.fromCases}</p>
            {ficha.cases.length === 0 ? (
              <p>{t.t.noCases}</p>
            ) : (
              <div className="c2-links">
                {ficha.cases.map((s) => {
                  const c = cases.get(s);
                  return c ? (
                    <RouteLink key={s} className="c2-chip" to={to("cases", s)} onNavigate={navigate}>
                      <Img img={c.img} w={40} h={30} />
                      {c.name}
                    </RouteLink>
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              <th>{t.t.skin}</th>
              {WEARS.map((w) => (
                <th key={w.ab}>{w.ab}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ficha.groups.map((g) => [
              <tr className="c2-grp" key={`g-${g.rarity}`}>
                <td colSpan={6}>
                  <b>
                    <Rarity r={g.rarity} />
                  </b>{" "}
                  · {t.t.skinsN(g.skins.length)}
                </td>
              </tr>,
              ...g.skins.map((slug) => {
                const s = skins.get(slug);
                if (!s) return null;
                const p = skinPrices[slug];
                return (
                  <tr key={slug}>
                    <td>
                      <RouteLink className="c2-nm" to={to("skins", slug)} onNavigate={navigate}>
                        <Img img={s.img} w={64} h={48} />
                        <span className="c2-nm-t">
                          <span>{skinPart(s)}</span>
                          <span className="c2-nm-s">
                            {s.weapon} · <FloatRange min={s.min} max={s.max} />
                          </span>
                        </span>
                      </RouteLink>
                    </td>
                    {WEARS.map((w, i) => (
                      <td key={w.ab}>
                        {!reaches(s, i) ? (
                          <span className="c2-num is-none">—</span>
                        ) : soloSouvenir(p) ? (
                          <Price v={p?.sv?.[i]} bare />
                        ) : (
                          <Price v={p?.n?.[i]} bare sug={!!((p?.sug ?? 0) & (1 << i))} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {date && <p className="c2-note">{t.t.pricesNote(date)}</p>}
    </main>
  );
}
