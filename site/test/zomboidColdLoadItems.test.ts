/**
 * Una ficha de objeto en español que se abre en frío (2026-09-30), lo mismo que `zomboidColdLoad.test.ts` prueba con
 * Recetas. `main.tsx` lee la dirección y llama a `preloadRoute` antes de que la pestaña anote sus slugs en español (lo
 * hace al cargarse su chunk): la ruta llega con `detail: "palanca"` y no con `"crowbar"`. Con esa ruta tal cual se
 * pedía el archivo de "palanca" (otro), no aparecía la ficha, bajaba la lista entera (576 KB) y el primer render pasaba
 * por "cargando…".
 *
 * Archivo aparte, no un `it` más en el de Recetas: ahí el primer test ya baja un chunk que anota todos los slugs, y
 * este tiene que arrancar sin ninguno anotado.
 */
import { expect, it } from "vitest";
import { parseRoute } from "../src/route";
import { preloadTab } from "../src/Zomboid";
import { peekItem, peekItemsList } from "../src/zomboid/items/data";
import { pzShard } from "../src/zomboid/shard";

it("un objeto en español que llega en frío baja su archivo y no la lista", async () => {
  const route = parseRoute("/es/project-zomboid/objetos/palanca");
  expect(route.pzSection).toBe("items");
  // Lo que ve `main.tsx`: todavía el slug en español, que cae en otro archivo que el de la palanca.
  expect(route.detail).toBe("palanca");
  expect(pzShard("palanca")).not.toBe(pzShard("crowbar"));
  await preloadTab(route);
  expect(peekItem("crowbar")?.es).toBe("Palanca");
  // El archivo de "palanca" no se pidió (no se puede espiar una ficha de un archivo que no llegó) y la lista tampoco.
  expect(peekItem("palanca")).toBeUndefined();
  expect(peekItemsList()).toBeNull();
});
