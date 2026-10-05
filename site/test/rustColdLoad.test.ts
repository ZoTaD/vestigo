import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/route";

/**
 * En frío, `main.tsx` lee la dirección antes de que la pestaña anote sus slugs: `detail` llega como "fusil-de-asalto".
 * Después de `preloadRoute` (que baja la pestaña), leerla de nuevo tiene que dar el slug inglés.
 */
describe("una ficha de Rust en español, en frío", () => {
  it("después de bajar la pestaña, la dirección ya está traducida", async () => {
    const { preloadRoute } = await import("../src/areas");
    const cold = parseRoute("/es/rust/objetos/fusil-de-asalto");
    await preloadRoute(cold);
    expect(parseRoute("/es/rust/objetos/fusil-de-asalto").detail).toBe("assault-rifle");
    const { peekItem } = await import("../src/rust/items/data");
    expect(peekItem("assault-rifle")?.id).toBe("rifle.ak");
  });
});
