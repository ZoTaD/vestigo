import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Coh3Units from "../src/coh3/explorer/Coh3Units";
import CohCommanders from "../src/coh3/explorer/CohCommanders";
import { loadFicha, loadList, peekList } from "../src/coh3/data";
import { CohGameContext } from "../src/coh3/ui";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

const render = (path: string, el: (r: ReturnType<typeof parseRoute>) => React.ReactElement) => {
  const route = parseRoute(path);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <CohGameContext.Provider value={route.cohGame ?? "coh3"}>{el(route)}</CohGameContext.Provider>
    </LangContext.Provider>,
  );
};

describe("enciclopedia por juego", () => {
  it("Unidades de CoH2 muestra las de CoH2 y no mezcla la lista de CoH3", async () => {
    await Promise.all([loadList("units", "coh2"), loadList("units", "coh3")]);
    const html = render("/en/coh2/units", (r) => <Coh3Units route={r} navigate={() => undefined} />);
    expect(html).toContain("Conscript Infantry Squad");
    expect(html).not.toContain("Bersaglieri");
    expect(peekList("units", "coh3")!.some((u) => u.slug.endsWith("_ak"))).toBe(true);
    expect(peekList("units", "coh2")!.some((u) => u.slug === "conscript_squad_mp")).toBe(true);
  });

  it("la ficha de un comandante trae sus habilidades y la unidad que habilita", async () => {
    await Promise.all([loadFicha("commanders", "advanced_warfare_tactics", "coh2"), loadList("units", "coh2")]);
    const html = render("/es/coh2/comandantes/advanced_warfare_tactics", (r) => <CohCommanders route={r} navigate={() => undefined} />);
    expect(html).toContain("Tácticas de guerra avanzadas");
    expect(html).toContain("/es/coh2/unidades/t_34_85_squad_mp");
  });
});

describe("precarga por juego", () => {
  it("Penetración y la ficha de comandante de CoH2 cargan las listas de CoH2", async () => {
    const { preloadRoute, peekList: peek } = await import("../src/coh3/data");
    await preloadRoute(parseRoute("/es/coh2/penetracion"));
    expect(peek("weapons", "coh2")).not.toBeNull();
    await preloadRoute(parseRoute("/es/coh2/comandantes/advanced_warfare_tactics"));
    expect(peek("units", "coh2")).not.toBeNull();
    await preloadRoute(parseRoute("/es/coh2/unidades/conscript_squad_mp"));
    expect(peek("commanders", "coh2")).not.toBeNull();
  });
});
