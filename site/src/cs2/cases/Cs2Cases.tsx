/**
 * La pestaña Cajas de CS2 (2026-11-03): la ficha si la dirección trae un slug, y si no (o si no existe), la lista. La
 * ficha necesita además las filas de las skins (nombre, imagen y float) y sus precios.
 */
import { useMemo } from "react";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import {
  loadCasePrices, loadFicha, loadList, loadPriceDate, loadSkinPrices,
  peekCasePrices, peekFicha, peekList, peekPriceDate, peekSkinPrices,
} from "../data";
import { Cs2Loading, type Nav } from "../ui";
import CaseList from "./CaseList";
import CasePage from "./CasePage";

export default function Cs2Cases({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("cases", slug!), () => loadFicha("cases", slug!));
  const prices = useLoad("prices", () => peekCasePrices() ?? undefined, () => Promise.all([loadCasePrices(), loadPriceDate()]));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList("cases") ?? undefined, () => loadList("cases"));
  const needSkins = !!item.value;
  const skins = useLoad(needSkins ? "skins" : null, () => peekList("skins") ?? undefined, () => loadList("skins"));
  const skinPrices = useLoad(needSkins ? "skinPrices" : null, () => peekSkinPrices() ?? undefined, () => loadSkinPrices());
  const bySlug = useMemo(() => new Map((skins.value ?? []).map((s) => [s.slug, s])), [skins.value]);

  const failed = [item, prices, list, skins, skinPrices].find((l) => l.failed);
  if (failed) return <Cs2Loading onRetry={failed.retry} />;
  if (!prices.value) return <Cs2Loading />;
  if (item.value) {
    if (!skins.value || !skinPrices.value) return <Cs2Loading />;
    return (
      <CasePage
        key={item.value.slug}
        ficha={item.value}
        price={prices.value[item.value.slug]}
        skins={bySlug}
        skinPrices={skinPrices.value}
        date={peekPriceDate()}
        route={route}
        navigate={navigate}
      />
    );
  }
  if (slug !== null && item.value === undefined) return <Cs2Loading />;
  if (!list.value) return <Cs2Loading />;
  return <CaseList rows={list.value} prices={prices.value} route={route} navigate={navigate} />;
}
