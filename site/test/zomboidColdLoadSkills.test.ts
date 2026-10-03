/**
 * Una ficha de habilidad en español que se abre en frío (2026-09-30), como `zomboidColdLoadMoodles.test.ts`: `main.tsx`
 * lee la dirección antes de que la pestaña anote sus slugs, así que llega `detail: "carpinteria"` y no `"carpentry"`.
 * Habilidades no pide datos aparte (viajan en el chunk): bajado el chunk, la dirección leída de nuevo ya tiene que abrir
 * la ficha, con los libros enlazados a su slug en español.
 *
 * Archivo aparte: ningún import puede haber anotado los slugs antes, y el de cualquier pestaña los anota.
 */
import { expect, it } from "vitest";
import { renderApp } from "../src/entry-server";
import { parseRoute } from "../src/route";
import { preloadTab } from "../src/Zomboid";

it("Carpintería en español que llega en frío abre su ficha", async () => {
  const path = "/es/project-zomboid/habilidades/carpinteria";
  expect(parseRoute(path)).toMatchObject({ pzSection: "skills", detail: "carpinteria" });
  await preloadTab(parseRoute(path));
  expect(parseRoute(path).detail).toBe("carpentry");
  const html = await renderApp(parseRoute(path));
  expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Carpintería<\/h1>/);
  expect(html).not.toContain("No encontramos");
  expect(html).toContain('href="/es/project-zomboid/objetos/carpinteria-i-guia-para-clavar"');
});
