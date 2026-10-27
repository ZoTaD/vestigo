/**
 * La pestaña Reliquias de Warframe (2026-10-27): la ficha si la dirección trae un slug, y si no (o si no existe), la lista.
 */
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadFicha, loadList, peekFicha, peekList } from "../data";
import { WfLoading, type Nav } from "../ui";
import RelicList from "./RelicList";
import RelicPage from "./RelicPage";

export default function WfRelics({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("relics", slug!), () => loadFicha("relics", slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList("relics") ?? undefined, () => loadList("relics"));

  if (item.failed) return <WfLoading onRetry={item.retry} />;
  if (item.value) return <RelicPage ficha={item.value} route={route} navigate={navigate} key={item.value.slug} />;
  if (slug !== null && item.value === undefined) return <WfLoading />;
  if (list.failed) return <WfLoading onRetry={list.retry} />;
  if (!list.value) return <WfLoading />;
  return <RelicList rows={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
