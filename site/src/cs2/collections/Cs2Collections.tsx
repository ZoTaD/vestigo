/**
 * La pestaña Colecciones de CS2 (2026-11-03): la ficha si la dirección trae un slug, y si no (o si no existe), la
 * lista (~100 filas, sin tandas).
 */
import { useMemo } from "react";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useCs2Copy } from "../../cs2Copy";
import { loadFicha, loadList, loadPriceDate, loadSkinPrices, peekFicha, peekList, peekPriceDate, peekSkinPrices, type CollRow } from "../data";
import { sortRows, useSort } from "../sort";
import { Cs2Loading, Img, type Nav } from "../ui";
import CollPage from "./CollPage";

type Key = "name" | "date" | "n";
const COLS: Record<Key, (r: CollRow) => string | number | null> = { name: (r) => r.name, date: (r) => r.date, n: (r) => r.n };

function CollList({ rows, route, navigate }: { rows: CollRow[]; route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const { sort, th } = useSort<Key>({ key: "date", dir: -1 }, ["name"]);
  const shown = useMemo(() => sortRows(rows, COLS, sort), [rows, sort]);
  return (
    <main className="c2-main">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs.collections}</h1>
        <p className="c2-lede">{t.seo.collections.description}</p>
      </header>
      <div className="c2-tablewrap">
        <table className="c2-table">
          <thead>
            <tr>
              {th("name", t.tabs.collections)}
              {th("n", t.t.skin)}
              {th("date", t.t.date)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.slug}>
                <td>
                  <RouteLink className="c2-nm" to={{ ...route, view: "cs2", c2Section: "collections", detail: r.slug }} onNavigate={navigate} prefetch="press">
                    <Img img={r.img} w={112} h={76} />
                    <span className="c2-nm-t">
                      <strong>{r.name}</strong>
                    </span>
                  </RouteLink>
                </td>
                <td className="c2-num">{r.n}</td>
                <td className="c2-num c2-dim">{r.date ? r.date.replaceAll("-", "/") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function Cs2Collections({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("collections", slug!), () => loadFicha("collections", slug!));
  const list = useLoad("list", () => peekList("collections") ?? undefined, () => loadList("collections"));
  const isFicha = !!item.value;
  const skins = useLoad(isFicha ? "skins" : null, () => peekList("skins") ?? undefined, () => loadList("skins"));
  const prices = useLoad(isFicha ? "prices" : null, () => peekSkinPrices() ?? undefined, () => Promise.all([loadSkinPrices(), loadPriceDate()]));
  const cases = useLoad(isFicha ? "cases" : null, () => peekList("cases") ?? undefined, () => loadList("cases"));
  const bySlug = useMemo(() => new Map((skins.value ?? []).map((s) => [s.slug, s])), [skins.value]);
  const caseMap = useMemo(() => new Map((cases.value ?? []).map((s) => [s.slug, s])), [cases.value]);

  const failed = [item, list, skins, prices, cases].find((l) => l.failed);
  if (failed) return <Cs2Loading onRetry={failed.retry} />;
  if (item.value) {
    if (!skins.value || !prices.value || !cases.value) return <Cs2Loading />;
    return <CollPage key={item.value.slug} ficha={item.value} skins={bySlug} skinPrices={prices.value} cases={caseMap} date={peekPriceDate()} route={route} navigate={navigate} />;
  }
  if (slug !== null && item.value === undefined) return <Cs2Loading />;
  if (!list.value) return <Cs2Loading />;
  return <CollList rows={list.value} route={route} navigate={navigate} />;
}
