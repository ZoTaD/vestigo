/**
 * La pestaña Mapa estelar de Warframe (2026-10-27, etapa 2): la ficha del nodo si la dirección trae un slug, y si no (o si
 * no existe), el mapa con la tabla de nodos.
 */
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadFicha, loadList, peekFicha, peekList } from "../data";
import { WfLoading, type Nav } from "../ui";
import NodePage from "./NodePage";
import StarChartList from "./StarChartList";

export default function WfStarChart({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("star-chart", slug!), () => loadFicha("star-chart", slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList("star-chart") ?? undefined, () => loadList("star-chart"));

  if (item.failed) return <WfLoading onRetry={item.retry} />;
  if (item.value) return <NodePage ficha={item.value} route={route} navigate={navigate} key={item.value.slug} />;
  if (slug !== null && item.value === undefined) return <WfLoading />;
  if (list.failed) return <WfLoading onRetry={list.retry} />;
  if (!list.value) return <WfLoading />;
  return <StarChartList rows={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
