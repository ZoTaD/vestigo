/**
 * El CSS de una pestaña de Zomboid no puede cambiar el aspecto de otra. Vite no descarga el CSS de una pestaña al salir,
 * así que dos pestañas que usan la misma clase con reglas distintas se ven según el orden en que se visitaron (pasó con
 * `.pzs-note` de Personaje sobre Habilidades y `.pzm-sheet` del Mapa sobre Moodles).
 *
 * Reglas:
 *  - compartido = `pz`, `pz-*`, `pzi`, `pzi-*` y toda clase que aparezca en zomboid.css o zomboid-items.css;
 *  - cada selector del CSS de una pestaña lleva al menos una clase propia (no toca lo compartido suelto);
 *  - una clase propia está en el CSS de una sola pestaña;
 *  - el código de una pestaña (src/zomboid/<pestaña>/) no usa clases propias de otra.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES = fileURLToPath(new URL("../src/styles/", import.meta.url));
const CODE = fileURLToPath(new URL("../src/zomboid/", import.meta.url));
const SHARED_FILES = ["zomboid.css", "zomboid-items.css"];

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const classesIn = (css: string) => [...strip(css).matchAll(/\.(pz[a-z0-9]*(?:-[a-z0-9]+)*)(?![\w-])/g)].map((m) => m[1]);

const shared = new Set(SHARED_FILES.flatMap((f) => classesIn(readFileSync(join(STYLES, f), "utf8"))));
const isShared = (c: string) => /^pzi?(-|$)/.test(c) || shared.has(c);

/** Pestaña → su CSS (zomboid-<pestaña>.css se usa desde src/zomboid/<pestaña>/). */
const tabCss = Object.fromEntries(
  readdirSync(STYLES)
    .filter((f) => /^zomboid-[a-z]+\.css$/.test(f) && !SHARED_FILES.includes(f))
    .map((f) => [f.slice("zomboid-".length, -".css".length), readFileSync(join(STYLES, f), "utf8")]),
);

/** Clase propia → pestañas cuyo CSS la nombra. */
const owners = new Map<string, Set<string>>();
for (const [tab, css] of Object.entries(tabCss))
  for (const c of classesIn(css)) if (!isShared(c)) (owners.get(c) ?? owners.set(c, new Set()).get(c)!).add(tab);

function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? codeFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe("CSS de Zomboid: cada pestaña con lo suyo", () => {
  it("hay CSS de varias pestañas para revisar", () => {
    expect(Object.keys(tabCss)).toEqual(expect.arrayContaining(["map", "moodles", "planner", "skills", "patches"]));
    expect(owners.size).toBeGreaterThan(300);
  });

  it("cada selector de una pestaña lleva una clase propia", () => {
    const loose: string[] = [];
    for (const [tab, css] of Object.entries(tabCss))
      for (const m of strip(css).matchAll(/([^{};]+)\{/g)) {
        const sel = m[1].trim();
        if (sel.startsWith("@") || /^(from|to|\d+%)\b/.test(sel)) continue;
        for (const s of sel.split(",")) {
          const own = [...s.matchAll(/\.(pz[\w-]*)/g)].some((x) => !isShared(x[1]));
          if (!own) loose.push(`${tab}: ${s.trim()}`);
        }
      }
    expect(loose).toEqual([]);
  });

  it("una clase propia está en el CSS de una sola pestaña", () => {
    const twice = [...owners].filter(([, tabs]) => tabs.size > 1).map(([c, tabs]) => `${c} (${[...tabs].join(", ")})`);
    expect(twice).toEqual([]);
  });

  it("el código de una pestaña no usa clases propias de otra", () => {
    const foreign: string[] = [];
    for (const file of codeFiles(CODE)) {
      const rel = file.slice(CODE.length).replace(/\\/g, "/");
      const tab = rel.includes("/") ? rel.split("/")[0] : null; // archivos sueltos de src/zomboid: compartidos
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/(?<![\w-])(pz[a-z0-9]*(?:-[a-z0-9]+)*)(?![\w-])/g)) {
        const tabs = owners.get(m[1]);
        if (tabs && (tab === null || !tabs.has(tab))) foreign.push(`${rel}: ${m[1]} (de ${[...tabs].join(", ")})`);
      }
    }
    expect([...new Set(foreign)]).toEqual([]);
  });
});
