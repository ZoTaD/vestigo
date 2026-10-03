/**
 * "Qué cambió" en cada ficha de Project Zomboid (2026-10-02). Hasta la 42.22 no hay ningún diff de verdad, así que
 * ninguna ficha trae `changes`: el recuadro no tiene que aparecer (ni su título). Los casos con cambios se prueban
 * poniéndole a mano un `changes` realista a la ficha de verdad (el mismo objeto del módulo, que se limpia después).
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import pzIndex from "../../games/zomboid/data/index.json";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { parseRoute, registerPzSlugs, routePath, type PzTab } from "../src/route";
import { preloadTab } from "../src/Zomboid";
import { loadItem } from "../src/zomboid/items/data";
import { MOODLES } from "../src/zomboid/moodles/data";
import ChangesBox from "../src/zomboid/patches/ChangesBox";
import { peekChangesBox } from "../src/zomboid/patches/boxLoader";
import type { FichaChange } from "../src/zomboid/patches/data";
import { loadRecipe } from "../src/zomboid/recipes/data";
import { findSkill } from "../src/zomboid/skills/data";
import { findProfession, TRAITS } from "../src/zomboid/traits/data";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];

beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

/** El recuadro solo, sin la ficha alrededor. */
const box = (props: Parameters<typeof ChangesBox>[0]) => renderToString(createElement(ChangesBox, props));

const HEAD = { patch: "42-22", version: "42.22", date: "2026-10-14" } as const;

async function render(path: string): Promise<string> {
  const route = parseRoute(path);
  await preloadTab(route);
  return renderApp(route);
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("sin cambios", () => {
  it("no dibuja nada", () => {
    const route = parseRoute("/es/project-zomboid/rasgos/fuerte");
    expect(box({ kind: "traits", changes: undefined, route, navigate: () => {} })).toBe("");
    expect(box({ kind: "traits", changes: [], route, navigate: () => {} })).toBe("");
  });

  it("la palanca, con los datos de hoy (cero diffs), no tiene «Qué cambió»", async () => {
    const f = await loadItem("crowbar");
    expect(f!.changes).toBeUndefined();
    const html = await render("/es/project-zomboid/objetos/palanca");
    expect(html).toContain("Palanca");
    expect(html).not.toContain("Qué cambió");
    expect(html).not.toContain("pzp-box");
    // Y no pide el recuadro: baja en su chunk sólo para una ficha con cambios.
    // OJO con el orden: `peekChangesBox` mira un `loaded` del módulo que, una vez pedido, queda para todo el archivo.
    // Este describe tiene que correr antes de "con cambios" (vitest corre los de un archivo en serie y en el orden en
    // que están): no muevas este test más abajo ni le pongas `.concurrent`.
    expect(peekChangesBox()).toBeNull();
  });
});

describe("con cambios", () => {
  it("un rasgo: la versión enlazada, la etiqueta, antes → después y si baja", async () => {
    const strong = TRAITS.find((t) => t.id === "strong")!;
    strong.changes = [{ ...HEAD, kind: "changed", fields: [{ f: "cost", b: 10, a: 8 }] }];
    cleanups.push(() => delete strong.changes);
    const html = await render("/es/project-zomboid/rasgos/fuerte");
    expect(html).toContain("Qué cambió");
    expect(html).toContain('href="/es/project-zomboid/parches/42-22"');
    expect(html).toContain("14 de octubre de 2026");
    expect(html).toContain("Costo");
    expect(html).toContain(">10<");
    expect(html).toContain(">8<");
    expect(html).toContain("baja");
    // El pie lleva a la pestaña.
    expect(html).toContain('href="/es/project-zomboid/parches"');
    expect(html).toContain("Todas las versiones");
  });

  it("en inglés, el mismo rasgo", async () => {
    const strong = TRAITS.find((t) => t.id === "strong")!;
    strong.changes = [{ ...HEAD, kind: "changed", fields: [{ f: "cost", b: 10, a: 8 }] }];
    cleanups.push(() => delete strong.changes);
    const html = await render("/en/project-zomboid/traits/strong");
    expect(html).toContain("What changed");
    expect(html).toContain('href="/en/project-zomboid/patches/42-22"');
    expect(html).toContain("October 14, 2026");
    expect(html).toContain("down");
  });

  it("un objeto: la etiqueta de su número, con coma", async () => {
    const f = (await loadItem("crowbar"))!;
    f.changes = [{ ...HEAD, kind: "changed", gameId: f.variants[0].gameId, fields: [{ f: "stats.maxDamage", b: 1.15, a: 1.3 }] }];
    cleanups.push(() => delete f.changes);
    const html = await render("/es/project-zomboid/objetos/palanca");
    expect(html).toContain("Qué cambió");
    expect(html).toContain("Daño máximo");
    expect(html).toContain(">1,3<");
    expect(html).toContain("sube");
  });

  it("un objeto con variantes de verdad (el destornillador): cada cambio dice de cuál es", async () => {
    const f = (await loadItem("screwdriver"))!;
    const [a, b] = f.variants;
    f.changes = [
      { ...HEAD, kind: "changed", gameId: a.gameId, fields: [{ f: "stats.maxDamage", b: 1, a: 2 }] },
      { ...HEAD, kind: "added", gameId: b.gameId },
    ];
    cleanups.push(() => delete f.changes);
    const html = await render("/es/project-zomboid/objetos/destornillador");
    // Un solo bloque para la versión, con los dos cambios adentro, cada uno con el nombre de su variante.
    expect(html.match(/pzp-boxver/g)).toHaveLength(1);
    const box = html.slice(html.indexOf("pzp-box"));
    expect(box).toContain(`<p class="pzp-ent">${a.es}</p>`);
    expect(box).toContain(`<p class="pzp-ent">${b.es}</p>`);
    expect(box.indexOf(a.es)).toBeLessThan(box.indexOf("Daño máximo"));
    expect(box).toContain("Apareció en esta versión");
  });

  it("un moodle que apareció en esta versión", async () => {
    const m = MOODLES.find((x) => x.id === "bleeding")!;
    m.changes = [{ ...HEAD, kind: "added" }];
    cleanups.push(() => delete m.changes);
    const html = await render("/es/project-zomboid/moodles/sangrado");
    expect(html).toContain("Qué cambió");
    expect(html).toContain("Apareció en esta versión");
  });

  it("dos versiones: un bloque por cada una, la más nueva arriba", () => {
    const route = parseRoute("/es/project-zomboid/rasgos/fuerte");
    const changes: FichaChange[] = [
      { ...HEAD, kind: "changed", fields: [{ f: "cost", b: 10, a: 8 }] },
      { patch: "42-21-1", version: "42.21.1", date: "2026-09-30", kind: "changed", fields: [{ f: "cost", b: 12, a: 10 }] },
    ];
    const html = box({ kind: "traits", changes, route, navigate: () => {} });
    expect(html.indexOf("parches/42-22")).toBeLessThan(html.indexOf("parches/42-21-1"));
    expect(html.match(/pzp-boxver/g)).toHaveLength(2);
  });
});

/** Las otras tres fichas: el mismo recuadro, con su `changes` puesto en la ficha de verdad. */
describe("recetas, profesiones y habilidades", () => {
  const fichas: [PzTab, string, () => Promise<{ changes?: FichaChange[] }>][] = [
    ["recipes", "add-cigarette-to-pack", async () => (await loadRecipe("add-cigarette-to-pack"))!],
    ["professions", "burglar", async () => findProfession("burglar")!],
    ["skills", "aiming", async () => findSkill("aiming")!],
  ];
  it.each(fichas)("%s/%s", async (sec, id, get) => {
    const f = await get();
    f.changes = [{ ...HEAD, kind: "changed", fields: [{ f: "time", b: 50, a: 40 }] }];
    cleanups.push(() => delete f.changes);
    const html = await render(routePath({ ...parseRoute("/es/project-zomboid"), pzSection: sec, detail: id }));
    expect(html).toContain("Qué cambió");
    expect(html).toContain('href="/es/project-zomboid/parches/42-22"');
    expect(html).toContain(">50<");
    expect(html).toContain(">40<");
  });
});
