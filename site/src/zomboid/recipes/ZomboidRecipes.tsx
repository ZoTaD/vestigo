/**
 * La pestaña Recetas de Project Zomboid (2026-09-30): la lista (`/project-zomboid/recipes`) o la ficha de una receta
 * (`/project-zomboid/recipes/saw-log`, `/es/project-zomboid/recetas/aserrar-troncos`). Diseño:
 * docs/design/2026-09-30-zomboid.md. Es el mismo armado que Objetos (`items/ZomboidItems.tsx`), con su estética.
 *
 * Los datos no viajan en este chunk (ver `data.ts`): la lista baja sólo en la lista, y una ficha baja sólo su archivo.
 * Si la ficha no existe se muestra la lista con una nota, y recién ahí se pide la lista.
 */
import itemSlugs from "virtual:pz-slugs-es/items";
import professionSlugs from "virtual:pz-slugs-es/professions";
import recipeSlugs from "virtual:pz-slugs-es/recipes";
import traitSlugs from "virtual:pz-slugs-es/traits";
import { registerPzSlugs, type Route } from "../../route";
import PzLoading from "../PzLoading";
import { useLoad } from "../ui";
import { loadRecipe, loadRecipesList, peekRecipe, peekRecipesList } from "./data";
import RecipeFicha from "./RecipeFicha";
import RecipeList from "./RecipeList";
import { registerChangesLookup } from "../patches/boxLoader";
// Las hojas, las filas, los chips y los renglones son los de Objetos: la misma libreta. Lo propio de las recetas va
// aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-recipes.css";

// Las direcciones en español de lo que esta pestaña enlaza: sus recetas, los objetos de cada ficha y los rasgos y las
// profesiones que la enseñan (~1,6 KB con gzip entre los dos). Al cargarse el módulo y no en un efecto: `preloadRoute`
// baja este chunk antes de que `App` lea la dirección, así `/es/project-zomboid/recetas/aserrar-troncos` ya llega
// traducida a `saw-log`.
registerPzSlugs({ ...itemSlugs, ...recipeSlugs, ...traitSlugs, ...professionSlugs });
// Para que `preloadTab` sepa si la ficha de la ruta trae "Qué cambió" y lo baje antes del primer render.
registerChangesLookup("recipes", peekRecipe);

type Nav = (r: Route) => void;

export default function ZomboidRecipes({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail ?? null;
  const recipe = useLoad(slug, () => peekRecipe(slug!), () => loadRecipe(slug!));
  // La lista hace falta en la lista y en una ficha que no existe (`null`), no mientras la ficha está llegando.
  const needList = slug === null || recipe.value === null;
  const list = useLoad(needList ? "list" : null, () => peekRecipesList() ?? undefined, loadRecipesList);

  if (recipe.failed) return <PzLoading onRetry={recipe.retry} />;
  if (recipe.value) return <RecipeFicha ficha={recipe.value} route={route} navigate={navigate} key={recipe.value.id} />;
  if (slug !== null && recipe.value === undefined) return <PzLoading />;
  if (list.failed) return <PzLoading onRetry={list.retry} />;
  if (!list.value) return <PzLoading />;
  return <RecipeList list={list.value} route={route} navigate={navigate} missing={slug !== null} />;
}
