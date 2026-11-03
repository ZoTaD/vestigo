/**
 * La ficha de una colección (2026-11-03): las skins por rareza con su rango de float (lo que usa el trade-up) y el
 * precio en cada desgaste, y de qué cajas o paquetes sale ("no sale de cajas" si de ninguna: caen en partidas o del
 * Armory).
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useCs2Copy, WEARS } from "../../cs2Copy";
import type { CaseRow, CollFicha, SkinPrice, SkinRow } from "../data";
import { sortRows, useSort } from "../sort";
import { FloatRange, Img, Price, Rarity, reaches, type Nav } from "../ui";

type Key = "name" | "FN" | "MW" | "FT" | "WW" | "BS";

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
  const { sort, th } = useSort<Key>({ key: "FN", dir: -1 }, ["name"]);
  // El precio que muestra cada columna (el Souvenir en las skins que sólo existen así), y con él se ordena.
  const cell = (slug: string, i: number): number | null => {
    const s = skins.get(slug);
    const p = skinPrices[slug];
    return s && reaches(s, i) ? ((soloSouvenir(p) ? p?.sv : p?.n)?.[i] ?? null) : null;
  };
  const cols = useMemo(
    () => ({ name: (slug: string) => skins.get(slug)?.name ?? slug, ...Object.fromEntries(WEARS.map((w, i) => [w.ab, (slug: string) => cell(slug, i)])) }) as Record<Key, (slug: string) => string | number | null>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skins, skinPrices],
  );
  const to = (c2Section: "skins" | "cases" | "collections", detail?: string): Route => ({ ...route, view: "cs2", c2Section, detail });
  return (
    <main className="c2-main c2-ficha">
      <header className="c2-hero">
        <Img img={ficha.img} w={240} h={180} big lazy={false} />
        <div>
          <p className="c2-crumb">
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
                      <Img img={c.img} w={56} h={42} />
                      {c.name}
                    </RouteLink>
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              {th("name", t.t.skin)}
              {WEARS.map((w, i) => th(w.ab as Key, w.ab, { title: t.wear[i] }))}
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
              ...sortRows(g.skins, cols, sort).map((slug) => {
                const s = skins.get(slug);
                if (!s) return null;
                const p = skinPrices[slug];
                return (
                  <tr key={slug} className={`is-${s.rarity}`}>
                    <td>
                      <RouteLink className="c2-nm" to={to("skins", slug)} onNavigate={navigate}>
                        <Img img={s.img} w={112} h={76} />
                        <span className="c2-nm-t">
                          <strong>{s.phase ? `${s.name} · ${s.phase}` : s.name}</strong>
                          <span className="c2-nm-s">
                            {t.t.float} <FloatRange min={s.min} max={s.max} />
                          </span>
                        </span>
                      </RouteLink>
                    </td>
                    {WEARS.map((w, i) => (
                      <td key={w.ab}>{reaches(s, i) ? <Price v={cell(slug, i)} bare sug={!soloSouvenir(p) && !!((p?.sug ?? 0) & (1 << i))} /> : <span className="c2-num is-none">—</span>}</td>
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
