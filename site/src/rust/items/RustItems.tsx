/**
 * La pestaña Objetos de Rust (2026-10-05): la lista (`/rust/items`) o la ficha de un objeto (`/rust/items/assault-rifle`,
 * `/es/rust/objetos/fusil-de-asalto`). Diseño: docs/design/2026-10-05-rust.md.
 *
 * Los datos no viajan en este chunk (`data.ts`): la lista baja en la lista, y una ficha baja sólo su archivo. Si la
 * ficha no existe se muestra la lista con una nota.
 */
import slugsEs from "@rust/site/slugs-es.json";
import { registerRustSlugs, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { loadItem, loadList, peekItem, peekList } from "./data";
import ItemFicha from "./ItemFicha";
import ItemList from "./ItemList";
import "../../styles/rust-items.css";

// Al cargarse el módulo y no en un efecto: `preloadRoute` baja este chunk antes de que `App` lea la dirección, así
// `/es/rust/objetos/fusil-de-asalto` ya llega como `assault-rifle`.
registerRustSlugs(slugsEs);

type Nav = (r: Route) => void;

export default function RustItems({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekItem(slug!), () => loadItem(slug!));
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekList() ?? undefined, loadList);

  if (item.failed) return <RsLoading onRetry={item.retry} />;
  if (item.value) return <ItemFicha ficha={item.value} route={route} navigate={navigate} key={item.value.id} />;
  if (slug !== null && item.value === undefined) return <RsLoading />;
  if (list.failed) return <RsLoading onRetry={list.retry} />;
  if (!list.value) return <RsLoading />;
  return <ItemList list={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
