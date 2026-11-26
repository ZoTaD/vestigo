import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Aoe2Civs from "../src/aoe2/stats/Aoe2Civs";
import Aoe2Maps from "../src/aoe2/stats/Aoe2Maps";
import { preloadAoe2Route } from "../src/aoe2/stats/data";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

/** Lo que hace el prerender: precarga lo de la ruta y dibuja en el servidor. */
const render = async (path: string, Tab: typeof Aoe2Civs) => {
  const route = parseRoute(path);
  await preloadAoe2Route(route);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <Tab route={route} navigate={() => undefined} />
    </LangContext.Provider>,
  );
};

describe("prerender de las estadísticas de AoE2", () => {
  it("Civilizaciones sale con la tabla, no con 'Cargando'", async () => {
    const html = await render("/es/aoe2/civilizaciones", Aoe2Civs);
    expect(html).not.toContain("Cargando");
    expect(html).toContain("Porcentaje de victoria de las civilizaciones");
  });
  it("la ficha de una civ sale con su nombre en un h1", async () => {
    const html = await render("/en/aoe2/civilizations/franks", Aoe2Civs);
    expect(html).toMatch(/<h1[^>]*>Franks<\/h1>/);
  });
  it("la ficha de un mapa sale con su nombre", async () => {
    expect(await render("/es/aoe2/mapas/arabia", Aoe2Maps)).toMatch(/<h1[^>]*>Arabia<\/h1>/);
  });
});
