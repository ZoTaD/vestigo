/**
 * Un solo `<h1>` por página, y en una ficha es el nombre de lo que se mira (auditoría SEO del 2026-10-11): con el
 * título de la pestaña como h1, Google veía miles de fichas de PoE2 y de objetos de Deadlock con el mismo encabezado.
 * Se renderiza con la entrada del build (`renderApp`), que es el HTML que lee el buscador.
 */
import { describe, expect, it } from "vitest";
import { renderApp } from "../src/entry-server";
import { parseRoute } from "../src/route";

const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
const render = (path: string) => renderApp(parseRoute(path));

describe("el h1 de una ficha es su nombre", () => {
  it("PoE2: la ficha lleva el nombre del objeto y la pestaña deja de ser h1", async () => {
    const en = await render("/en/poe2/encyclopedia/gems/comet");
    expect(h1s(en)).toEqual(["Comet"]);
    expect(en).toContain('<div class="p2-title-h">Encyclopedia</div>');
    expect(h1s(await render("/es/poe2/encyclopedia/gems/comet"))).toEqual(["Cometa"]);
  });

  it("PoE2: la portada y la categoría siguen con el h1 de la pestaña", async () => {
    expect(h1s(await render("/en/poe2/encyclopedia"))).toEqual(["Encyclopedia"]);
    expect(h1s(await render("/es/poe2/encyclopedia/gems"))).toEqual(["Enciclopedia"]);
  });

  it("Deadlock: la ficha de un objeto lleva su nombre y la tier list deja de ser h1", async () => {
    const html = await render("/en/deadlock/items/frenzy");
    expect(h1s(html)).toEqual(["Frenzy"]);
    expect(html).toMatch(/<p class="sechead-title">/);
    expect(h1s(await render("/en/deadlock/items"))).toHaveLength(1);
    expect(await render("/en/deadlock/items")).toMatch(/<h1 class="sechead-title">/);
  });
});

describe("el aviso de no afiliación del pie sigue al juego", () => {
  it("PoE2 nombra a Grinding Gear Games y no a Valve", async () => {
    const en = await render("/en/poe2/encyclopedia");
    expect(en).toContain("affiliated with Grinding Gear Games");
    expect(en).not.toContain("Valve Corporation");
    const es = await render("/es/poe2/encyclopedia");
    expect(es).toContain("no está avalado por Grinding Gear Games");
    expect(es).not.toContain("Valve Corporation");
  });
});
