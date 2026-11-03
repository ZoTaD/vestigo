/**
 * La pestaña Skins de CS2 (2026-11-03): la ficha si la dirección trae un slug, y si no (o si no existe), la lista.
 * La ficha nombra sus cajas y colecciones (de sus listas) y sus otras fases (de la lista de skins).
 */
import { useMemo } from "react";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadFicha, loadList, loadPriceDate, loadSkinPrices, peekFicha, peekList, peekPriceDate, peekSkinPrices } from "../data";
import { Cs2Loading, type Nav } from "../ui";
import SkinList from "./SkinList";
import SkinPage from "./SkinPage";

export default function Cs2Skins({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("skins", slug!), () => loadFicha("skins", slug!));
  const prices = useLoad("prices", () => peekSkinPrices() ?? undefined, () => Promise.all([loadSkinPrices(), loadPriceDate()]));
  const list = useLoad("list", () => peekList("skins") ?? undefined, () => loadList("skins"));
  const isFicha = !!item.value;
  const cases = useLoad(isFicha ? "cases" : null, () => peekList("cases") ?? undefined, () => loadList("cases"));
  const colls = useLoad(isFicha ? "collections" : null, () => peekList("collections") ?? undefined, () => loadList("collections"));
  const bySlug = useMemo(() => new Map((list.value ?? []).map((s) => [s.slug, s])), [list.value]);
  const caseMap = useMemo(() => new Map((cases.value ?? []).map((s) => [s.slug, s])), [cases.value]);
  const collMap = useMemo(() => new Map((colls.value ?? []).map((s) => [s.slug, s])), [colls.value]);

  const failed = [item, prices, list, cases, colls].find((l) => l.failed);
  if (failed) return <Cs2Loading onRetry={failed.retry} />;
  if (!prices.value || !list.value) return <Cs2Loading />;
  if (item.value) {
    if (!cases.value || !colls.value) return <Cs2Loading />;
    return (
      <SkinPage
        key={item.value.slug}
        ficha={item.value}
        price={prices.value[item.value.slug]}
        skins={bySlug}
        skinPrices={prices.value}
        cases={caseMap}
        collections={collMap}
        date={peekPriceDate()}
        route={route}
        navigate={navigate}
      />
    );
  }
  if (slug !== null && item.value === undefined) return <Cs2Loading />;
  return <SkinList rows={list.value} prices={prices.value} route={route} navigate={navigate} />;
}
