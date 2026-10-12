/**
 * La pestaña Objetos de Terraria (2026-10-12): la ficha si la dirección trae un slug, y si no (o si no existe), la
 * lista. Cada una pide sólo lo suyo: la ficha, su pedazo; la lista, las filas y los nombres del idioma.
 */
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { loadItem, loadList, peekItem, peekList } from "../data";
import { TrLoading, type Nav } from "../ui";
import ItemList from "./ItemList";
import ItemPage from "./ItemPage";
import "../../styles/terraria-items.css";

export default function TerrariaItems({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekItem(slug!), () => loadItem(slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? `list-${lang}` : null, () => peekList(lang) ?? undefined, () => loadList(lang));

  if (item.failed) return <TrLoading onRetry={item.retry} />;
  if (item.value) return <ItemPage ficha={item.value} route={route} navigate={navigate} key={item.value.id} />;
  if (slug !== null && item.value === undefined) return <TrLoading />;
  if (list.failed) return <TrLoading onRetry={list.retry} />;
  if (!list.value) return <TrLoading />;
  return <ItemList rows={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
