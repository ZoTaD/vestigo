import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Aoe2Patches from "../src/aoe2/extras/Aoe2Patches";
import Aoe2Achievements from "../src/aoe2/extras/Aoe2Achievements";
import Aoe2BuildOrders from "../src/aoe2/extras/Aoe2BuildOrders";
import { buildOrders, preloadExtras } from "../src/aoe2/extras/data";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import mapas from "../../games/aoe2/data/maps.json";

const render = async (path: string, Tab: typeof Aoe2Patches) => {
  const route = parseRoute(path);
  await preloadExtras(route);
  return renderToString(
    <LangContext.Provider value={{ lang: route.lang, setLang: () => undefined }}>
      <Tab route={route} navigate={() => undefined} />
    </LangContext.Provider>,
  );
};

describe("prerender de Parches, Logros y Build orders de AoE2", () => {
  it("la lista de parches: sin datos, directo a las notas oficiales; una ficha inexistente no rompe", async () => {
    const html = await render("/es/aoe2/parches", Aoe2Patches);
    expect(html).toContain("Actualización 188329");
    expect(html).toContain("store.steampowered.com/news/app/813780/view/1807332909738413");
    expect(await render("/en/aoe2/patches/153015", Aoe2Patches)).toContain("We couldn");
  });
  it("los logros salen con nombre y porcentaje", async () => {
    const html = await render("/es/aoe2/logros", Aoe2Achievements);
    expect(html).toContain("370 logros");
    expect(html).not.toContain("Cargando");
  });
  it("una build order sale con sus pasos", async () => {
    const html = await render("/es/aoe2/build-orders/fast-castle-knights", Aoe2BuildOrders);
    expect(html).toMatch(/<h1[^>]*>Fast Castle con caballeros<\/h1>/);
    expect(html).toContain("Telar y avanzar a la Edad Feudal.");
  });
});

describe("build orders escritas a mano", () => {
  it("cada una tiene apertura medida, mapas que existen, pasos en los dos idiomas y tiempos que no retroceden", async () => {
    const bos = await buildOrders.load();
    const slugs = new Set((mapas as { slug: string }[]).map((m) => m.slug));
    const aperturas = new Set(["scouts", "archers", "maa", "drush", "drush_fc", "fc", "boom", "tower"]);
    for (const b of bos) {
      expect(aperturas.has(b.opening), b.slug).toBe(true);
      for (const m of b.maps) expect(slugs.has(m), `${b.slug}: ${m}`).toBe(true);
      const seg = b.steps.map((p) => p.time.split(":").reduce((a, x) => a * 60 + Number(x), 0));
      expect(seg, b.slug).toEqual([...seg].sort((x, y) => x - y));
      for (const p of b.steps) expect(p.en && p.es, b.slug).toBeTruthy();
    }
  });
});
