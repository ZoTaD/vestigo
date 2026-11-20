import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Aoe2Units from "../src/aoe2/encyclopedia/Aoe2Units";
import Aoe2Techs from "../src/aoe2/encyclopedia/Aoe2Techs";
import Aoe2TechTree from "../src/aoe2/encyclopedia/Aoe2TechTree";
import Aoe2Calculator, { armar, mejorasPara } from "../src/aoe2/encyclopedia/Aoe2Calculator";
import Aoe2Civs from "../src/aoe2/stats/Aoe2Civs";
import { preloadAoe2Route } from "../src/aoe2/stats/data";
import { arbol, civFx, preloadEncyclopedia, tecnologias, unidades } from "../src/aoe2/encyclopedia/data";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

/** Lo que hace el prerender: precarga lo de la ruta y dibuja en el servidor. */
const render = async (path: string, Tab: typeof Aoe2Units) => {
  const route = parseRoute(path);
  await Promise.all([preloadAoe2Route(route), preloadEncyclopedia(route)]);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <Tab route={route} navigate={() => undefined} />
    </LangContext.Provider>,
  );
};

describe("prerender de la enciclopedia de AoE2", () => {
  it("la ficha de una unidad sale entera: nombre, descripción, cifras y counters", async () => {
    const html = await render("/en/aoe2/units/knight", Aoe2Units);
    expect(html).toMatch(/<h1[^>]*>Knight<\/h1>/);
    expect(html).toContain("Heavy Cavalry");
    expect(html).toContain("60 food · 75 gold");
    expect(html).toContain("Halberdier");
    expect(html).not.toContain("Loading");
  });
  it("la lista de unidades en español, por edificio", async () => {
    const html = await render("/es/aoe2/unidades", Aoe2Units);
    expect(html).toContain("Cuarteles");
    expect(html).toContain("Milicia");
  });
  it("la ficha de una tecnología con su costo y las unidades que mejora", async () => {
    const html = await render("/en/aoe2/technologies/forging", Aoe2Techs);
    expect(html).toMatch(/<h1[^>]*>Forging<\/h1>/);
    expect(html).toContain("150 food");
  });
  it("el árbol de una civ con lo que le falta", async () => {
    const html = await render("/es/aoe2/arbol/franks", Aoe2TechTree);
    expect(html).toMatch(/<h1[^>]*>Francos<\/h1>/);
    expect(html).toContain("Arbalestero");
  });
  it("la calculadora sale con un duelo armado", async () => {
    const html = await render("/es/aoe2/calculadora", Aoe2Calculator);
    expect(html).toContain("Daño por golpe");
  });
  it("la ficha de civ trae sus bonos", async () => {
    const html = await render("/en/aoe2/civilizations/franks", Aoe2Civs as typeof Aoe2Units);
    expect(html).toContain("Foragers work +15% faster");
    expect(html).toContain("Throwing Axeman");
  });
});

describe("calculadora con datos del juego", () => {
  it("caballero franco imperial con todo: 120 de vida, 14 de ataque, 5/6 de armadura", async () => {
    const [u, a, ts, fx] = await Promise.all([unidades.load(), arbol.load(), tecnologias.load(), civFx.load()]);
    const k = u.units.find((x) => x.slug === "knight")!;
    const c = armar(k, "franks", 4, fx, mejorasPara(ts, a, "franks", k, 4));
    expect([c.hp, c.attacks[4], c.armors[4], c.armors[3]]).toEqual([120, 14, 5, 6]);
    // En Castillos, sin Alto horno ni las de Imperial.
    const c3 = armar(k, "franks", 3, fx, mejorasPara(ts, a, "franks", k, 3));
    expect(c3.attacks[4]).toBe(12);
  });
});
