/**
 * La lista de Skins (2026-11-03), tabla densa de la estética A: imagen, nombre, arma, rango de float y el precio en cada
 * desgaste (FN–BS; "—" si el rango no lo alcanza). Filtros en la query (`filters.ts`), ~2.100 filas de a tandas.
 */
import { useEffect, useMemo, useState } from "react";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { CS2_CATS, CS2_RARITIES, useCs2Copy, WEARS } from "../../cs2Copy";
import type { SkinPrice, SkinRow } from "../data";
import { FloatRange, Img, Price, reaches, skinPart, useNum, type Nav } from "../ui";
import { filterSkins, readSkinFilters, sortSkins, writeSkinFilters, type SkinFilters } from "./filters";

/** El alto de una fila (imagen de 48 px y su relleno), medido en el navegador. */
const ROW = 61;
const CHUNK = 60;

export default function SkinList({ rows, prices, route, navigate }: { rows: SkinRow[]; prices: Record<string, SkinPrice>; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const num = useNum();
  const [f, setF] = useState<SkinFilters>(() => readSkinFilters(""));
  useEffect(() => setF(readSkinFilters(window.location.search)), []);
  const pick = (patch: Partial<SkinFilters>) =>
    setF((prev) => {
      const next = { ...prev, ...patch };
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeSkinFilters(next)}`);
      return next;
    });
  const weapons = useMemo(() => [...new Set(rows.filter((r) => !f.cat || r.cat === f.cat).map((r) => r.weapon))].sort(), [rows, f.cat]);
  const shown = useMemo(() => sortSkins(filterSkins(rows, f), prices, f.sort), [rows, prices, f]);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.seo.skins.title}</h1>
        <p className="c2-lede">{t.seo.skins.description}</p>
      </header>
      <div className="c2-filters">
        <input type="search" placeholder={t.t.search} value={f.q} onChange={(e) => pick({ q: e.target.value })} aria-label={t.t.search} />
        <select value={f.cat ?? ""} onChange={(e) => pick({ cat: (e.target.value || null) as SkinFilters["cat"], weapon: null })} aria-label={t.t.catCol}>
          <option value="">{t.t.catCol}</option>
          {CS2_CATS.map((c) => (
            <option key={c} value={c}>
              {t.cat[c]}
            </option>
          ))}
        </select>
        <select value={f.weapon ?? ""} onChange={(e) => pick({ weapon: e.target.value || null })} aria-label={t.t.weapon}>
          <option value="">{t.t.weapon}</option>
          {weapons.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select value={f.rarity ?? ""} onChange={(e) => pick({ rarity: (e.target.value || null) as SkinFilters["rarity"] })} aria-label={t.t.rarityCol}>
          <option value="">{t.t.rarityCol}</option>
          {CS2_RARITIES.map((r) => (
            <option key={r} value={r}>
              {t.rarity[r]}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={f.st} onChange={(e) => pick({ st: e.target.checked })} /> {t.t.onlySt}
        </label>
        <label>
          <input type="checkbox" checked={f.sv} onChange={(e) => pick({ sv: e.target.checked })} /> {t.t.onlySv}
        </label>
        <label>
          {t.t.sort}
          <select value={f.sort} onChange={(e) => pick({ sort: e.target.value as SkinFilters["sort"] })}>
            <option value="rarity">{t.t.sortRarity}</option>
            <option value="price">{t.t.sortPrice}</option>
            <option value="name">{t.t.sortName}</option>
          </select>
        </label>
        <span className="c2-dim">{t.t.count(num(shown.length, 0))}</span>
      </div>
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="c2-dim">
                  {t.t.none}
                </td>
              </tr>
            )}
            <LazyRows
              items={shown}
              rowHeight={ROW}
              chunk={CHUNK}
              tag="tr"
              eager
              margin={300}
              render={(s, i) => {
                const p = prices[s.slug];
                return (
                  <tr key={s.slug}>
                    <td>
                      <RouteLink className="c2-nm" to={{ ...route, view: "cs2", c2Section: "skins", detail: s.slug }} onNavigate={navigate} prefetch="press">
                        {skipSprite(i, CHUNK) ? <Img img={null} w={64} h={48} /> : <Img img={s.img} w={64} h={48} />}
                        <span className="c2-nm-t">
                          <span className={`c2-r is-${s.rarity}`}>{skinPart(s)}</span>
                          <span className="c2-nm-s">
                            {s.weapon} · <FloatRange min={s.min} max={s.max} />
                          </span>
                        </span>
                      </RouteLink>
                    </td>
                    {s.min == null ? (
                      <td colSpan={5}>
                        <Price v={p?.n?.[0]} bare />
                      </td>
                    ) : (
                      WEARS.map((w, k) => (
                        <td key={w.ab}>{reaches(s, k) ? <Price v={p?.n?.[k]} bare sug={!!((p?.sug ?? 0) & (1 << k))} /> : <span className="c2-num is-none">—</span>}</td>
                      ))
                    )}
                  </tr>
                );
              }}
            />
          </tbody>
        </table>
      </div>
    </main>
  );
}
