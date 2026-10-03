/**
 * Una ficha de rasgo o de profesión en español que se abre en frío (2026-09-30), lo mismo que prueban
 * `zomboidColdLoad.test.ts` (Recetas) y `zomboidColdLoadItems.test.ts` (Objetos). `main.tsx` lee la dirección antes de
 * que la pestaña anote sus slugs en español: la ruta llega con `detail: "cobarde"` y no con `"cowardly"`. Rasgos no
 * pide datos aparte (viajan en el chunk), así que lo que tiene que pasar es que, bajado el chunk, la dirección leída de
 * nuevo (lo que hace `App` después de `preloadRoute`) ya abra la ficha y no la lista con "no encontramos".
 *
 * Archivo aparte: ningún import puede haber anotado los slugs antes, y el de cualquier pestaña los anota.
 */
import { expect, it } from "vitest";
import { renderApp } from "../src/entry-server";
import { parseRoute } from "../src/route";
import { preloadTab } from "../src/Zomboid";

it("un rasgo y una profesión en español que llegan en frío abren su ficha", async () => {
  const trait = "/es/project-zomboid/rasgos/cobarde";
  const prof = "/es/project-zomboid/profesiones/ladron";
  // Lo que ve `main.tsx`: todavía los slugs en español.
  expect(parseRoute(trait)).toMatchObject({ pzSection: "traits", detail: "cobarde" });
  expect(parseRoute(prof)).toMatchObject({ pzSection: "professions", detail: "ladron" });
  await preloadTab(parseRoute(trait));
  // Lo que lee `App` después: los ids de verdad.
  expect(parseRoute(trait).detail).toBe("cowardly");
  expect(parseRoute(prof).detail).toBe("burglar");
  const html = await renderApp(parseRoute(trait));
  expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Cobarde<\/h1>/);
  expect(html).not.toContain("No encontramos");
  expect(await renderApp(parseRoute(prof))).toMatch(/<h1 class="pzi-h1"[^>]*>Ladrón<\/h1>/);
});
