/**
 * La ficha de una caja (2026-11-03), estética Dust II: la caja grande, el nombre en esténcil y el recuadro con caja,
 * llave, valor esperado y "devuelve"; el contenido agrupado por rareza con la probabilidad del grupo y de cada skin, el
 * precio por desgaste en columnas (cada encabezado ordena dentro de cada rareza) y el objeto especial. Tocar una fila
 * muestra la skin al costado (en escritorio); el nombre lleva a su ficha.
 *
 * Una terminal o un paquete de souvenir no tienen probabilidades publicadas: se listan sus skins con precio y nada más.
 */
import { useMemo, useState } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { CASE_ODDS, KEY_PRICE, SPECIAL_ODDS, useCs2Copy, WEARS } from "../../cs2Copy";
import type { CaseFicha, CasePrice, SkinPrice, SkinRow } from "../data";
import { sortRows, useSort } from "../sort";
import { FloatRange, Img, Pct, Price, Rarity, reaches, SkinSide, type Nav } from "../ui";

type Key = "name" | "FN" | "MW" | "FT" | "WW" | "BS";

export default function CasePage({
  ficha,
  price,
  skins,
  skinPrices,
  date,
  route,
  navigate,
}: {
  ficha: CaseFicha;
  price: CasePrice | undefined;
  skins: Map<string, SkinRow>;
  skinPrices: Record<string, SkinPrice>;
  date: string | null;
  route: Route;
  navigate: Nav;
}) {
  const t = useCs2Copy();
  const isCase = ficha.kind === "case";
  // Un paquete de souvenir sólo da versiones Souvenir: ese es el precio que importa (el normal vale la mitad o menos).
  const souvenir = ficha.kind === "souvenir";
  const first = ficha.groups[0]?.skins[0] ?? null;
  const [sel, setSel] = useState<string | null>(first);
  const selSkin = sel ? skins.get(sel) : undefined;
  const skinTo = (slug: string): Route => ({ ...route, view: "cs2", c2Section: "skins", detail: slug });
  const ret = price?.ret;
  const { sort, th } = useSort<Key>({ key: "FN", dir: -1 }, ["name"]);
  // El precio que muestra cada columna (el Souvenir en un paquete de souvenir), y con él se ordena.
  const cell = (slug: string, i: number): number | null => {
    const s = skins.get(slug);
    const p = skinPrices[slug];
    return s && reaches(s, i) ? ((souvenir ? p?.sv : p?.n)?.[i] ?? null) : null;
  };
  const cols = useMemo(
    () => ({ name: (slug: string) => skins.get(slug)?.name ?? slug, ...Object.fromEntries(WEARS.map((w, i) => [w.ab, (slug: string) => cell(slug, i)])) }) as Record<Key, (slug: string) => string | number | null>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skins, skinPrices, souvenir],
  );

  return (
    <main className="c2-main c2-ficha">
      <header className="c2-hero">
        <Img img={ficha.img} w={240} h={180} big lazy={false} />
        <div>
          <p className="c2-crumb">
            <RouteLink to={{ ...route, detail: undefined }} onNavigate={navigate}>
              {t.tabs.cases}
            </RouteLink>{" "}
            · {t.kind[ficha.kind]}
            {ficha.date ? ` · ${ficha.date.replaceAll("-", "/")}` : ""}
          </p>
          <h1>{ficha.name}</h1>
          <div className="c2-facts">
            <div className="c2-fact">
              <small>{t.t.caseCol}</small>
              <Price v={price?.price} />
            </div>
            {isCase && (
              <>
                <div className="c2-fact">
                  <small>{t.t.key}</small>
                  <Price v={KEY_PRICE} />
                </div>
                <div className="c2-fact">
                  <small>{t.t.ev}</small>
                  {price?.ev != null ? <Price v={price.ev} /> : <span className="c2-num is-none">{t.t.missing}</span>}
                </div>
                <div className="c2-fact is-key" title={t.t.returnsHint}>
                  <small>{t.t.returns}</small>
                  {ret != null ? <Pct v={ret} d={0} className={ret >= 1 ? "is-up" : "is-down"} /> : <span className="c2-num is-none">—</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {ficha.kind === "terminal" ? <p className="c2-note">{t.t.terminalNote}</p> : !isCase && <p className="c2-note">{t.t.noOdds}</p>}

      <div className="c2-split">
        <div className="c2-tablewrap">
          <table className="c2-table">
            <thead>
              <tr>
                {th("name", t.t.skin)}
                {WEARS.map((w, i) => th(w.ab as Key, w.ab, { title: t.wear[i] }))}
                {isCase && (
                  <th>
                    <span>{t.t.odds}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ficha.groups.map((g) => {
                const odds = isCase ? CASE_ODDS[g.rarity] : undefined;
                return [
                  <tr className="c2-grp" key={`g-${g.rarity}`}>
                    <td colSpan={isCase ? 7 : 6}>
                      <b>
                        <Rarity r={g.rarity} />
                      </b>{" "}
                      · {t.t.skinsN(g.skins.length)}
                      {odds != null && (
                        <>
                          {" "}
                          · <Pct v={odds} />
                        </>
                      )}
                    </td>
                  </tr>,
                  ...sortRows(g.skins, cols, sort).map((slug) => {
                    const s = skins.get(slug);
                    if (!s) return null;
                    const p = skinPrices[slug];
                    return (
                      <tr className={`c2-row is-${s.rarity}${slug === sel ? " is-sel" : ""}`} key={slug} onClick={() => setSel(slug)}>
                        <td>
                          <div className="c2-nm">
                            <Img img={s.img} w={112} h={76} />
                            <div className="c2-nm-t">
                              <RouteLink to={skinTo(slug)} onNavigate={navigate}>
                                <strong>{s.phase ? `${s.name} · ${s.phase}` : s.name}</strong>
                              </RouteLink>
                              <span className="c2-nm-s">
                                {t.t.float} <FloatRange min={s.min} max={s.max} />
                              </span>
                            </div>
                          </div>
                        </td>
                        {WEARS.map((w, i) => (
                          <td key={w.ab}>{reaches(s, i) ? <Price v={cell(slug, i)} bare sug={!souvenir && !!((p?.sug ?? 0) & (1 << i))} /> : <span className="c2-num is-none">—</span>}</td>
                        ))}
                        {odds != null && (
                          <td className={`is-${g.rarity}`}>
                            <Pct v={odds / g.skins.length} d={3} className="c2-r" />
                          </td>
                        )}
                      </tr>
                    );
                  }),
                ];
              })}
              {ficha.rare.length > 0 && (
                <tr className="c2-grp">
                  <td colSpan={isCase ? 7 : 6}>
                    <b className="c2-r is-special">{t.t.special(ficha.rare.length)}</b>
                    {isCase && (
                      <>
                        {" "}
                        · <Pct v={SPECIAL_ODDS} />
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {ficha.rare.length > 0 && (
            <div className="c2-knives">
              {ficha.rare.slice(0, 24).map((slug) => {
                const s = skins.get(slug);
                return s ? (
                  <RouteLink key={slug} to={skinTo(slug)} onNavigate={navigate} title={s.name}>
                    <Img img={s.img} w={96} h={72} />
                  </RouteLink>
                ) : null;
              })}
              {ficha.rare.length > 24 && <span className="c2-dim c2-more">+{ficha.rare.length - 24}</span>}
            </div>
          )}
        </div>
        {selSkin && (
          <SkinSide skin={selSkin} price={skinPrices[selSkin.slug]}>
            <RouteLink className="c2-btn" to={skinTo(selSkin.slug)} onNavigate={navigate}>
              {t.t.open} {selSkin.name}
            </RouteLink>
          </SkinSide>
        )}
      </div>
      {date && <p className="c2-note">{t.t.pricesNote(date)}</p>}
    </main>
  );
}
