/**
 * La pestaña Arsenal de Warframe (2026-10-27): la ficha si la dirección trae un slug, y si no (o si no existe), la lista.
 * Cada una pide sólo lo suyo: la ficha, su pedazo; la lista, las filas.
 */
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadFicha, loadList, peekFicha, peekList } from "../data";
import { WfLoading, type Nav } from "../ui";
import ArsenalList from "./ArsenalList";
import ArsenalPage from "./ArsenalPage";

export default function WfArsenal({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekFicha("arsenal", slug!), () => loadFicha("arsenal", slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList("arsenal") ?? undefined, () => loadList("arsenal"));

  if (item.failed) return <WfLoading onRetry={item.retry} />;
  if (item.value) return <ArsenalPage ficha={item.value} route={route} navigate={navigate} key={item.value.slug} />;
  if (slug !== null && item.value === undefined) return <WfLoading />;
  if (list.failed) return <WfLoading onRetry={list.retry} />;
  if (!list.value) return <WfLoading />;
  return <ArsenalList rows={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
