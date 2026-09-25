import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREA_FILES, DEADLOCK_TAB_FILES, filesFor } from "../src/areaFiles";

/**
 * `areaFiles.ts` repite a mano los `import()` de `areas.ts` porque la config de
 * Vite no puede importar `areas.ts` (ver ahí). Si se desincronizan, el
 * prerender deja de poner el CSS de un juego en su HTML y la página se ve sin
 * estilos hasta que baja el JS: esto lo agarra antes.
 */
describe("cada vista en su chunk (2026-09-25)", () => {
  const source = readFileSync(new URL("../src/areas.ts", import.meta.url), "utf-8");
  // Las dos formas: `lazyWithPreload(() => import("./X"))` y, cuando el módulo
  // también se usa aparte, `const loadX = () => import("./X")` + `lazyWithPreload(loadX)`.
  const loaders = new Map([...source.matchAll(/const (\w+) = \(\) => import\("\.\/([\w/]+)"\);/g)].map((m) => [m[1], m[2]]));
  const lazies = new Map([
    ...[...source.matchAll(/export const (\w+) = lazyWithPreload\(\(\) => import\("\.\/([\w/]+)"\)\)/g)].map((m) => [m[1], m[2]] as const),
    ...[...source.matchAll(/export const (\w+) = lazyWithPreload\((\w+)\)/g)].filter((m) => loaders.has(m[2])).map((m) => [m[1], loaders.get(m[2])!] as const),
  ]);
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

  it("DEADLOCK_TAB_FILES nombra el mismo archivo que TABS en DeadlockArea.tsx", () => {
    const area = readFileSync(new URL("../src/DeadlockArea.tsx", import.meta.url), "utf-8");
    const tabLazies = new Map(
      [...area.matchAll(/const (\w+) = lazyWithPreload\(\(\) => import\("\.\/([\w/]+)"\)\)/g)].map((m) => [m[1], m[2]])
    );
    const tabs = area.slice(area.indexOf("const TABS"), area.indexOf("};", area.indexOf("const TABS")));
    const bySection = Object.fromEntries(
      [...tabs.matchAll(/^\s+([\w-]+): (\w+),$/gm)].filter((m) => tabLazies.has(m[2])).map((m) => [m[1], tabLazies.get(m[2])])
    );
    const files = Object.fromEntries(
      Object.entries(DEADLOCK_TAB_FILES).map(([s, f]) => [s, f!.replace(/^src\//, "").replace(/\.tsx?$/, "")])
    );
    expect(Object.keys(bySection).length).toBeGreaterThan(0);
    expect(files).toEqual(bySection);
  });

  it("sólo la entrada y el prerender importan areas.ts", async () => {
    // Si un módulo de la cáscara (App, RouteLink, Nav…) lo importara, su chunk
    // cambiaría con cada publicación de datos y los que vuelven bajarían todo
    // el JS de nuevo (ver areasRegistry.ts y manualChunks en vite.config.ts).
    const { readdirSync } = await import("node:fs");
    const src = new URL("../src/", import.meta.url);
    const importers = readdirSync(src)
      .filter((f) => /\.tsx?$/.test(f))
      // `import type` se borra al compilar: no arrastra el módulo.
      .filter((f) => /^import (?!type )[^\n]*from "\.\/areas";|import\("\.\/areas"\)/m.test(readFileSync(new URL(f, src), "utf-8")));
    expect(importers.sort()).toEqual(["entry-server.tsx", "main.tsx"]);
  });

  it("filesFor pide el área y, en Deadlock, la pestaña", () => {
    const base = { lang: "es" as const, dlSection: "meta" as const };
    expect(filesFor({ ...base, view: "valheim" })).toEqual(["src/Valheim.tsx"]);
    expect(filesFor({ ...base, view: "deadlock" })).toEqual(["src/DeadlockArea.tsx"]);
    expect(filesFor({ ...base, view: "deadlock", dlSection: "player" })).toEqual(["src/DeadlockArea.tsx", "src/DeadlockPlayer.tsx"]);
  });
});
