/**
 * Una ficha de moodle en español que se abre en frío (2026-09-30), como `zomboidColdLoadTraits.test.ts`: `main.tsx` lee
 * la dirección antes de que la pestaña anote sus slugs, así que llega `detail: "sangrado"` y no `"bleeding"`. Moodles no
 * pide datos aparte (viajan en el chunk): bajado el chunk, la dirección leída de nuevo ya tiene que abrir la ficha.
 *
 * Archivo aparte: ningún import puede haber anotado los slugs antes, y el de cualquier pestaña los anota.
 */
import { expect, it } from "vitest";
import { renderApp } from "../src/entry-server";
import { parseRoute } from "../src/route";
import { preloadTab } from "../src/Zomboid";

it("Sangrado en español que llega en frío abre su ficha", async () => {
  const path = "/es/project-zomboid/moodles/sangrado";
  expect(parseRoute(path)).toMatchObject({ pzSection: "moodles", detail: "sangrado" });
  await preloadTab(parseRoute(path));
  expect(parseRoute(path).detail).toBe("bleeding");
  const html = await renderApp(parseRoute(path));
  expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Sangrado<\/h1>/);
  expect(html).not.toContain("No encontramos");
});
