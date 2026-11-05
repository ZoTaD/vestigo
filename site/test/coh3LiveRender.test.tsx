import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Coh3Leaderboards from "../src/coh3/leaderboards/Coh3Leaderboards";
import { isCoh3LoadingPage } from "../src/coh3/loadingGuard";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const render = (path: string) => {
  const route = parseRoute(path);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <Coh3Leaderboards route={route} navigate={() => undefined} />
    </LangContext.Provider>,
  );
};

describe("el prerender del Ranking", () => {
  it("sale con el armazón y el aviso en la tabla, nunca con la hoja de cargando", () => {
    const es = render("/es/coh3/ranking");
    expect(isCoh3LoadingPage(es)).toBe(false);
    expect(es).toContain("Cargando el ranking…");
    expect(es).toContain("<h1");
    expect(es).toContain("Wehrmacht");
    const en = render("/en/coh3/leaderboards");
    expect(isCoh3LoadingPage(en)).toBe(false);
    expect(en).toContain("Loading the ladder…");
  });
});
