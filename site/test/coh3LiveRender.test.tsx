import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Coh3Leaderboards from "../src/coh3/leaderboards/Coh3Leaderboards";
import { isCoh3LoadingPage } from "../src/coh3/loadingGuard";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import { EloCell } from "../src/coh3/leaderboards/Coh3Leaderboards";
import { CohGameContext, LeagueTag } from "../src/coh3/ui";

const render = (path: string) => {
  const route = parseRoute(path);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <CohGameContext.Provider value={route.cohGame ?? "coh3"}>
        <Coh3Leaderboards route={route} navigate={() => undefined} />
      </CohGameContext.Provider>
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

describe("CoH2 y CoH1 en vivo", () => {
  const conLang = (lang: "es" | "en", el: React.ReactElement) =>
    renderToString(<LangContext.Provider value={{ lang, setLang: () => undefined }}>{el}</LangContext.Provider>);

  it("el ranking de CoH2 sale con sus facciones y sin selector de región", () => {
    const es = render("/es/coh2/ranking");
    expect(isCoh3LoadingPage(es)).toBe(false);
    expect(es).toContain("OKW");
    expect(es).toContain("Británicos");
    expect(es).not.toContain("Región");
  });

  it("ELO: conocido con cifra, desconocido con raya y aclaración", () => {
    const es = conLang("es", <EloCell elo={1816} />);
    expect(es).toContain("1.816");
    const nada = conLang("es", <EloCell elo={null} />);
    expect(nada).toContain("—");
    expect(nada).toContain('title="Sin partidas recientes"');
  });

  it("la liga de CoH1 y CoH2 es el nivel", () => {
    expect(conLang("es", <LeagueTag level={17} game="coh2" small />)).toContain("Nivel 17");
    expect(conLang("en", <LeagueTag level={3} game="coh1" />)).toContain("Level 3");
    expect(conLang("en", <LeagueTag level={16} />)).toContain("Challenger");
  });
});
