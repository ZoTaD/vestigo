/**
 * La lista de Skins (2026-11-03), estética Dust II: una fila por skin con su imagen grande, nombre, rareza y float, y el
 * precio en cada desgaste (FN–BS; "—" si el rango no lo alcanza). Cada encabezado ordena la tabla (por defecto, de la
 * rareza más alta a la más baja). Filtros en la query (`filters.ts`), ~2.100 filas de a tandas.
 */
import { useEffect, useMemo, useState } from "react";
import { LazyRows, skipSprite } from "../../LazyRows";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { CS2_CATS, CS2_RARITIES, useCs2Copy, WEARS } from "../../cs2Copy";
import type { SkinPrice, SkinRow } from "../data";
import { sortRows, useSort } from "../sort";
import { FloatRange, Img, Price, reaches, useNum, type Nav } from "../ui";
import { filterSkins, readSkinFilters, writeSkinFilters, type SkinFilters } from "./filters";

/** El alto de una fila (imagen de 76 px y su relleno), medido en el navegador. */
const ROW = 93;
const CHUNK = 40;
type Key = "name" | "rarity" | "FN" | "MW" | "FT" | "WW" | "BS";

/**
 * El precio de un desgaste para ordenar: el del cuchillo sin pintura cuenta en todas las columnas. Un precio sugerido
 * (nadie lo vende: Skinport estima, a veces absurdo, como un Forest DDPAT a 55 mil) no ordena: va al final con los vacíos.
 */
export const priceAt = (s: SkinRow, p: SkinPrice | undefined, i: number): number | null => {
  const k = s.min == null ? 0 : i;
  if (s.min != null && !reaches(s, i)) return null;
  if ((p?.sug ?? 0) & (1 << k)) return null;
  return p?.n?.[k] ?? null;
};

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
  const { sort, th } = useSort<Key>({ key: "rarity", dir: 1 }, ["name"]);
  const cols = useMemo(
    () => ({
      name: (s: SkinRow) => s.name + (s.phase ?? ""),
      rarity: (s: SkinRow) => CS2_RARITIES.indexOf(s.rarity),
      ...Object.fromEntries(WEARS.map((w, i) => [w.ab, (s: SkinRow) => priceAt(s, prices[s.slug], i)])),
    }) as Record<Key, (s: SkinRow) => string | number | null>,
    [prices],
  );
  const weapons = useMemo(() => [...new Set(rows.filter((r) => !f.cat || r.cat === f.cat).map((r) => r.weapon))].sort(), [rows, f.cat]);
  const shown = useMemo(() => sortRows(filterSkins(rows, f), cols, sort), [rows, f, cols, sort]);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.skins}</h1>
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
        <span className="c2-dim">{t.t.count(num(shown.length, 0))}</span>
      </div>
      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              {th("name", t.t.skin)}
              {WEARS.map((w, i) => th(w.ab as Key, w.ab, { title: t.wear[i] }))}
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
                  <tr key={s.slug} className={`is-${s.rarity}`}>
                    <td>
                      <RouteLink className="c2-nm" to={{ ...route, view: "cs2", c2Section: "skins", detail: s.slug }} onNavigate={navigate} prefetch="press">
                        {skipSprite(i, CHUNK) ? <Img img={null} w={112} h={76} /> : <Img img={s.img} w={112} h={76} />}
                        <span className="c2-nm-t">
                          <strong>{s.phase ? `${s.name} · ${s.phase}` : s.name}</strong>
                          <span className="c2-nm-s">
                            <span className="c2-r">{t.rarity[s.rarity]}</span>
                            {s.min != null && (
                              <>
                                {" "}
                                · {t.t.float} <FloatRange min={s.min} max={s.max} />
                              </>
                            )}
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
