import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_FILES } from "../src/areaFiles";

/**
 * `areaFiles.ts` repite a mano los `import()` de `areas.ts` porque la config de
 * Vite no puede importar `areas.ts` (ver ahí). Si se desincronizan, el
 * prerender deja de poner el CSS de un juego en su HTML y la página se ve sin
 * estilos hasta que baja el JS: esto lo agarra antes.
 */
describe("cada vista en su chunk (2026-09-25)", () => {
  const source = readFileSync(new URL("../src/areas.ts", import.meta.url), "utf-8");
  const lazies = new Map(
    [...source.matchAll(/export const (\w+) = lazyWithPreload\(\(\) => import\("\.\/([\w/]+)"\)\)/g)].map((m) => [m[1], m[2]])
  );
  const byView = Object.fromEntries(
    [...source.matchAll(/^\s+(\w+): (\w+),$/gm)].filter((m) => lazies.has(m[2])).map((m) => [m[1], lazies.get(m[2])])
  );

  it("areaFiles.ts nombra el mismo archivo que areas.ts para cada vista", () => {
    const files = Object.fromEntries(Object.entries(AREA_FILES).map(([v, f]) => [v, f!.replace(/^src\//, "").replace(/\.tsx?$/, "")]));
    expect(files).toEqual(byView);
  });

  it("hay un área por cada vista que sirve el sitio", () => {
    expect(Object.keys(byView).sort()).toEqual(["deadlock", "home", "poe2", "privacy", "terms", "valheim"]);
  });
});
