/**
 * Una ficha de Project Zomboid en español que se abre en frío (2026-09-30). `main.tsx` lee la dirección y llama a
 * `preloadRoute` antes de que la pestaña anote sus slugs en español (lo hace al cargarse su chunk): la ruta llega con
 * `detail: "aserrar-troncos"` y no con `"saw-log"`. Si la precarga de los datos usara esa ruta tal cual, pediría el
 * archivo equivocado, no encontraría la ficha, bajaría la lista entera, y el primer render pasaría por "cargando…".
 *
 * Va en su propio archivo porque ningún import puede haber anotado los slugs antes: los tests de las pestañas las
 * importan, y la importación ya los anota.
 */
import { expect, it } from "vitest";
import { parseRoute } from "../src/route";
import { preloadTab } from "../src/Zomboid";
import { peekRecipe, peekRecipesList } from "../src/zomboid/recipes/data";

it("una receta en español que llega en frío baja su archivo y no la lista", async () => {
  const route = parseRoute("/es/project-zomboid/recetas/aserrar-troncos");
  expect(route.pzSection).toBe("recipes");
  // Lo que ve `main.tsx`: todavía el slug en español.
  expect(route.detail).toBe("aserrar-troncos");
  await preloadTab(route);
  expect(peekRecipe("saw-log")?.en).toBe("Saw Log");
  expect(peekRecipesList()).toBeNull();
});
