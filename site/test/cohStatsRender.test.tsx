import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Coh3Ranks, { loadLadder } from "../src/coh3/stats/Coh3Ranks";
import { prettyMap } from "../src/coh3/stats/data";
import { CohGameContext } from "../src/coh3/ui";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const render = async (path: string) => {
  const route = parseRoute(path);
  const game = route.cohGame ?? "coh3";
  await loadLadder(game);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <CohGameContext.Provider value={game}>
        <Coh3Ranks route={route} navigate={() => undefined} />
      </CohGameContext.Provider>
    </LangContext.Provider>,
  );
};

describe("Rangos y Estadísticas de CoH1 y CoH2", () => {
  it("Rangos de CoH1: niveles en vez de ligas, sus cuatro facciones y sin crédito a coh3stats", async () => {
    const es = await render("/es/coh1/rangos");
    expect(es).toContain("Nivel 20");
    expect(es).toContain("Niveles y jugadores");
    expect(es).not.toContain("Latón");
    expect(es).not.toContain("coh3stats");
    expect(es).toContain("Panzer Elite");
  });
  it("Rangos de CoH3 siguen con sus ligas", async () => {
    const es = await render("/es/coh3/rangos");
    expect(es).toContain("Latón");
  });
  it("un mapa sin nombre en los datos se embellece", () => {
    expect(prettyMap("4p_rails and metal")).toBe("Rails And Metal");
    expect(prettyMap("pachino_2p")).toBe("Pachino");
  });
});
