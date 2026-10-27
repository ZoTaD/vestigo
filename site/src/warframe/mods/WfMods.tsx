/**
 * La pestaña Mods y arcanos de Warframe (2026-10-27): la ficha del mod si la dirección trae un slug, y si no (o si no
 * existe), la lista.
 */
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadFicha, loadList, peekFicha, peekList } from "../data";
import { WfLoading, type Nav } from "../ui";
import ModList from "./ModList";
import ModPage from "./ModPage";

export default function WfMods({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("mods", slug!), () => loadFicha("mods", slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList("mods") ?? undefined, () => loadList("mods"));

  if (item.failed) return <WfLoading onRetry={item.retry} />;
  if (item.value) return <ModPage ficha={item.value} route={route} navigate={navigate} key={item.value.slug} />;
  if (slug !== null && item.value === undefined) return <WfLoading />;
  if (list.failed) return <WfLoading onRetry={list.retry} />;
  if (!list.value) return <WfLoading />;
  return <ModList rows={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
