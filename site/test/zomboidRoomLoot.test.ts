/**
 * "Qué hay" en cada habitación de la hoja del edificio del Mapa de Project Zomboid (2026-10-02): lo que puede aparecer en
 * los muebles de un cuarto, con la chance de que un mueble lo traiga (botín en Normal) y el enlace a la ficha del objeto.
 * Se prueba con los `loot/rooms/<NN>.json` reales.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import { loadRoomLoot, roomLootFor } from "../src/zomboid/loot/roomLoot";
import RoomLoot from "../src/zomboid/map/RoomLoot";
import { loadItemSlugsEs } from "../src/zomboid/map/itemSlugs";
import { MAP_COPY } from "../src/zomboid/map/copy";

const render = (raws: string[], lang: "en" | "es" = "es") =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang, setLang: () => undefined } },
      createElement(RoomLoot, { raws, route: parseRoute(`/${lang}/project-zomboid/mapa`), navigate: () => undefined }),
    ),
  );

describe("el botín de una habitación", () => {
  it("antes de que llegue el archivo, no hay nada que mostrar (undefined)", async () => {
    // Con el módulo recién importado: el de arriba guarda lo que ya bajaron los otros tests, y el resultado dependería
    // del orden en que corren.
    vi.resetModules();
    const fresh = await import("../src/zomboid/loot/roomLoot");
    expect(fresh.roomLootFor(["livingroom"])).toBeUndefined();
  });

  it("la cocina tiene botín propio: el tazón en la alacena", async () => {
    await loadRoomLoot(["kitchen"]);
    const view = roomLootFor(["kitchen"])!;
    expect(view.own).toBe(true);
    expect(view.n).toBeGreaterThan(100);
    expect(view.top.length).toBeLessThanOrEqual(30);
    const bowl = view.top.find((r) => r.id === "bowl")!;
    expect(bowl).toMatchObject({ p: 0.3439, en: "Bowl", es: "Tazón" });
    expect(bowl.cont[1]).toBe("Alacena");
    // De la chance más alta a la más baja, y a la par por slug.
    for (let i = 1; i < view.top.length; i++) {
      const [a, b] = [view.top[i - 1], view.top[i]];
      expect(a.p > b.p || (a.p === b.p && a.id < b.id), `${a.id} antes que ${b.id}`).toBe(true);
    }
  });

  it("un cuarto sin tabla propia (bedroom4) muestra lo de cualquier lugar", async () => {
    await loadRoomLoot(["bedroom4"]);
    const view = roomLootFor(["bedroom4"])!;
    const all = roomLootFor([])!;
    expect(view.own).toBe(false);
    expect(view.n).toBe(all.n);
    expect(view.n).toBeGreaterThan(1000);
  });

  it("el garaje usa la tabla del mecánico", async () => {
    await loadRoomLoot(["garage"]);
    const view = roomLootFor(["garage"])!;
    expect(view.own).toBe(true);
    // La primera fila de la tabla `mechanic`: el gancho grande en la mesada.
    expect(view.top[0]).toMatchObject({ id: "large-hook", p: 0.9375 });
  });

  it("varios nombres de un grupo juntan sus filas, cada objeto una vez con su mayor chance", async () => {
    await loadRoomLoot(["bedroom", "bedroom4"]);
    const view = roomLootFor(["bedroom", "bedroom4"])!;
    expect(view.own).toBe(true);
    const ids = view.top.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(view.top[0].id).toBe("money");
  });
});

describe("la lista de la hoja", () => {
  it("en español: el enlace a la ficha con su slug en español, el ícono, el mueble y la chance", async () => {
    await Promise.all([loadRoomLoot(["kitchen"]), loadItemSlugsEs()]);
    const html = render(["kitchen"]);
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/objetos\/tazon"[^>]*>[\s\S]*?Tazón[\s\S]*?<\/a>/);
    expect(html).toMatch(/<img[^>]+src="\/zomboid\/items\/Bowl\.webp"[^>]*width="24"/);
    expect(html).toContain("Alacena");
    expect(html).toMatch(/34\s*%/);
    // Ocho a la vista; el resto en el desplegable.
    expect(html).toContain(MAP_COPY.es.building.loot.more(22));
  });

  it("en inglés, con los nombres en inglés y la chance pegada", async () => {
    await loadRoomLoot(["kitchen"]);
    const html = render(["kitchen"], "en");
    expect(html).toMatch(/href="\/en\/project-zomboid\/items\/bowl"/);
    expect(html).toContain("Overhead cupboard");
    expect(html).toContain("34%");
  });

  it("un cuarto sin botín propio lo avisa arriba", async () => {
    await loadRoomLoot(["bedroom4"]);
    expect(render(["bedroom4"])).toContain("No tiene botín propio");
  });

  it("la condición de zona se dice sin nombrar la zona", async () => {
    await loadRoomLoot(["kitchen"]);
    const view = roomLootFor(["kitchen"])!;
    const zoned = view.top.find((r) => r.force?.startsWith("z:"));
    if (zoned) expect(render(["kitchen"])).toContain(MAP_COPY.es.building.loot.force.z);
  });

  it("mientras falta el archivo, dice que está revisando", () => {
    expect(render(["office"])).toContain(MAP_COPY.es.building.loot.loading);
  });
});
