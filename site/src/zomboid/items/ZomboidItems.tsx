/**
 * La pestaña Objetos de Project Zomboid (2026-09-30): la lista (`/project-zomboid/items`) o la ficha de un objeto
 * (`/project-zomboid/items/crowbar`, `/es/project-zomboid/objetos/palanca`). Diseño: docs/design/2026-09-30-zomboid.md.
 *
 * Los datos no viajan en este chunk (ver `data.ts`): la lista baja sólo en la lista, y una ficha baja sólo su archivo.
 * Si la ficha no existe se muestra la lista con una nota, como en Diablo II, y recién ahí se pide la lista.
 */
import itemSlugs from "virtual:pz-slugs-es/items";
import recipeSlugs from "virtual:pz-slugs-es/recipes";
import { registerPzSlugs, type Route } from "../../route";
import PzLoading from "../PzLoading";
import { useLoad } from "../ui";
import { loadItem, loadItemsList, peekItem, peekItemsList } from "./data";
import ItemFicha from "./ItemFicha";
import ItemList from "./ItemList";
import { registerChangesLookup } from "../patches/boxLoader";
import "../../styles/zomboid-items.css";

// Las direcciones en español de lo que esta pestaña enlaza: sus objetos y las recetas de cada ficha. Al cargarse el
// módulo y no en un efecto: `preloadRoute` baja este chunk antes de que `App` lea la dirección, así
// `/es/project-zomboid/objetos/palanca` ya llega traducida a `crowbar`.
registerPzSlugs({ ...itemSlugs, ...recipeSlugs });
// Para que `preloadTab` sepa si la ficha de la ruta trae "Qué cambió" y lo baje antes del primer render.
registerChangesLookup("items", peekItem);

type Nav = (r: Route) => void;

export default function ZomboidItems({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const item = useLoad(slug, () => peekItem(slug!), () => loadItem(slug!));
  // La lista hace falta en la lista y en una ficha que no existe (`null`), no mientras la ficha está llegando.
  const needList = slug === null || item.value === null;
  const list = useLoad(needList ? "list" : null, () => peekItemsList() ?? undefined, loadItemsList);

  if (item.failed) return <PzLoading onRetry={item.retry} />;
  if (item.value) return <ItemFicha ficha={item.value} route={route} navigate={navigate} key={item.value.id} />;
  if (slug !== null && item.value === undefined) return <PzLoading />;
  if (list.failed) return <PzLoading onRetry={list.retry} />;
  if (!list.value) return <PzLoading />;
  return <ItemList list={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
