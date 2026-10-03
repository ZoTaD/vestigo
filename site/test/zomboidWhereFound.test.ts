/**
 * "Dónde aparece" en la ficha de cada objeto de Project Zomboid (2026-10-01, Task 3 del botín): las habitaciones con su
 * mueble y su chance, los escondites, los zombis, los vehículos y los bolsos, con los datos reales de
 * `games/zomboid/data/loot/**`. Se renderiza la pestaña sola (`ZomboidItems`) después de `preloadItemsRoute`, como el
 * prerender: lo que va en el HTML tiene que estar sin pasar por "cargando…".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute, PZ_PUBLISHED, routePath, type PzTab, type Route } from "../src/route";
import ZomboidItems from "../src/zomboid/items/ZomboidItems";
import { preloadItemsRoute } from "../src/zomboid/items/data";
import { band, pct } from "../src/zomboid/loot/chance";
import { loadItemLoot } from "../src/zomboid/loot/data";
import { numbers } from "../src/zomboid/items/stats";
import { LOOT_ROOM_NAMES } from "../src/zomboid/map/lootRoomNames";
import { roomKey, roomName, ROOM_NAMES } from "../src/zomboid/map/rooms";
import itemsList from "../../games/zomboid/data/site/items-list.json";
import lootCommon from "../../games/zomboid/data/loot/common.json";

const TABS: PzTab[] = ["items", "recipes"];
const added: PzTab[] = [];

beforeAll(() => {
  for (const tab of TABS) {
    if (!PZ_PUBLISHED.includes(tab)) {
      PZ_PUBLISHED.push(tab);
      added.push(tab);
    }
  }
});
afterAll(() => {
  for (const tab of added) PZ_PUBLISHED.splice(PZ_PUBLISHED.indexOf(tab), 1);
});

/** La dirección de la ficha de `id` en ese idioma: en español, con el slug en español si tiene uno. */
const fichaPath = (lang: "en" | "es", id: string) =>
  routePath({ ...parseRoute(`/${lang}/project-zomboid/${lang === "es" ? "objetos" : "items"}`), detail: id });

/** Como el prerender: primero la precarga, después un solo render. */
async function render(path: string): Promise<string> {
  const route: Route = parseRoute(path);
  await preloadItemsRoute(route);
  return renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidItems, { route, navigate: () => undefined }),
    ),
  );
}

const pages: string[] = [];
async function page(path: string) {
  const html = await render(path);
  pages.push(html);
  return html;
}

describe("dónde aparece", () => {
  it("los frijoles enlatados: la cocina, su mueble, la chance, la banda, el mapa y los escondites", async () => {
    const path = fichaPath("es", "canned-beans");
    expect(path).toMatch(/^\/es\/project-zomboid\/objetos\//);
    const html = await page(path);
    expect(html).toContain("Dónde aparece");
    expect(html).toContain("Cocina");
    expect(html).toContain("Estantería de metal");
    expect(html).toMatch(/3,9\s*%/);
    expect(html).toContain("poco común");
    // Un enlace común al Mapa, con el edificio de ejemplo abierto.
    expect(html).toMatch(/<a [^>]*href="\/es\/project-zomboid\/mapa\?x=\d+&amp;y=\d+&amp;z=5&amp;edificio=\d+_\d+_\d+"[^>]*>[^<]*ver una en el mapa/);
    expect(html).toContain("En escondites");
    expect(html).toContain("Escondite de comida");
    expect(html).toMatch(/href="\/es\/project-zomboid\/mapa\?capas=escondites"/);
    // Dos escondites del juego con el mismo nombre van una vez (el de chance más alta), y el resto se cuenta en singular.
    expect(html.match(/>Escondite de sobreviviente</g)).toHaveLength(1);
    // "Hoarderkitchen" no existe en Knox County: no se manda a buscarla (era la segunda fila).
    expect(html.toLowerCase()).not.toContain("hoarder");
    // La nota dice qué significa el número, no de dónde sale, y cubre zombis, vehículos y bolsos y la excepción.
    expect(html).toContain("con el botín en Normal");
    expect(html).toContain("zombis, vehículos y bolsos");
    expect(html).toContain("cachivaches");
  });

  it("los lugares que no entran en el archivo se cuentan aparte, sin un segundo 'más'", async () => {
    const es = await page(fichaPath("es", "boxing-gloves"));
    expect(es).toContain("+1 lugar con menos chance");
    expect(es).not.toContain("lugar más");
    const en = await page(fichaPath("en", "boxing-gloves"));
    expect(en).toContain("+1 place less likely");
  });

  it("en inglés, con los nombres en inglés", async () => {
    const html = await page("/en/project-zomboid/items/canned-beans");
    expect(html).toContain("Where to find it");
    expect(html).toContain("Kitchen");
    expect(html).toContain("Metal shelves");
    expect(html).toContain("uncommon");
    expect(html).toMatch(/href="\/en\/project-zomboid\/map\?x=\d+&amp;y=\d+&amp;z=5&amp;edificio=/);
  });

  it("la insignia: el atuendo del zombi policía", async () => {
    const html = await page(fichaPath("es", "badge"));
    expect(html).toContain("Zombi: Policía");
    expect(html).toMatch(/50\s*%/);
  });

  it("el megáfono: el baúl del camión de los SWAT", async () => {
    const html = await page(fichaPath("es", "megaphone"));
    expect(html).toContain("Camión de los SWAT · Baúl");
    expect(html).toMatch(/59\s*%/);
  });

  it("la lapicera negra: cualquier zombi, sin separar hombre y mujer", async () => {
    const html = await page(fichaPath("es", "pen-black"));
    expect(html).toContain("Cualquier zombi");
    expect(html).not.toContain("Zombi hombre");
  });

  it("una ficha que no aparece en ningún lado no tiene la hoja", async () => {
    let id: string | null = null;
    for (const row of itemsList.rows) {
      if ((await loadItemLoot(row.id)) === null) {
        id = row.id;
        break;
      }
    }
    expect(id).not.toBeNull();
    const html = await page(fichaPath("es", id!));
    expect(html).toContain("pzi-head");
    expect(html).not.toContain("Dónde aparece");
  });

  it("ningún HTML dice cargando", () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
    for (const html of pages) expect(html.toLowerCase()).not.toContain("cargando");
  });
});

describe("la chance", () => {
  it("la banda", () => {
    expect(band(0.0392)).toBe("uncommon");
    expect(band(0.3439)).toBe("veryCommon");
    expect(band(0.0007)).toBe("veryRare");
  });
  it("el porcentaje", () => {
    expect(pct(0.0392, "es-AR")).toMatch(/^3,9\s%$/);
    expect(pct(0.3439, "en-US")).toBe("34%");
    expect(pct(0.0004, "es-AR").startsWith("< 0,1")).toBe(true);
  });
});

describe("las habitaciones de la hoja", () => {
  const files = import.meta.glob("../../games/zomboid/data/loot/items/*.json", { eager: true, import: "default" }) as Record<
    string,
    Record<string, { rooms: [string, ...unknown[]][] }>
  >;
  const common = lootCommon as { spots: Record<string, { n: number; at?: unknown }>; aliases: Record<string, string[]> };
  const keys = new Set<string>(Object.keys(common.spots));
  for (const [t, al] of Object.entries(common.aliases)) for (const k of [t, ...al]) keys.add(k);
  for (const f of Object.values(files)) for (const it of Object.values(f)) for (const r of it.rooms) if (r[0] !== "_all") keys.add(r[0]);

  it("todas tienen nombre escrito a mano en los dos idiomas (ninguna sale con el nombre del juego)", () => {
    expect(keys.size).toBeGreaterThan(300);
    const all = { ...ROOM_NAMES, ...LOOT_ROOM_NAMES };
    const missing = [...keys].filter((k) => !Object.hasOwn(all, roomKey(k, LOOT_ROOM_NAMES)));
    expect(missing).toEqual([]);
    for (const k of keys) {
      const [en, es] = all[roomKey(k, LOOT_ROOM_NAMES)];
      expect(en.trim(), k).not.toBe("");
      expect(es.trim(), k).not.toBe("");
    }
    // Una clave no puede estar en las dos tablas (la de `rooms.ts` ganaría en silencio).
    expect(Object.keys(LOOT_ROOM_NAMES).filter((k) => Object.hasOwn(ROOM_NAMES, k))).toEqual([]);
    expect(roomName("hoarderkitchen", "es", LOOT_ROOM_NAMES)).toBe("Hoarderkitchen");
    expect(roomName("captainoffice", "es", LOOT_ROOM_NAMES)).toBe("Oficina del capitán");
    expect(roomName("captainoffice", "en", LOOT_ROOM_NAMES)).toBe("Captain's office");
    expect(roomName("plazastore1", "es", LOOT_ROOM_NAMES)).toBe("Local de la galería comercial");
    expect(roomName("ww_blacksmith", "es", LOOT_ROOM_NAMES)).toBe("Herrería");
  });

  it("todas las que se muestran existen en el mapa: tienen cuántas hay y un edificio de ejemplo", () => {
    for (const f of Object.values(files))
      for (const [slug, it] of Object.entries(f))
        for (const r of it.rooms) if (r[0] !== "_all") expect(common.spots[r[0]]?.n, `${slug} · ${r[0]}`).toBeGreaterThan(0);
    for (const [k, s] of Object.entries(common.spots)) expect(s.at, k).toBeDefined();
  });
});

describe("el porcentaje en los renglones de números", () => {
  it("igual que en 'Dónde aparece': con espacio duro en español y pegado en inglés", () => {
    expect(numbers("es-AR").pct(20)).toBe("20 %");
    expect(numbers("en-US").pct(20)).toBe("20%");
    expect(numbers("es-AR").frac(0.35)).toBe("35 %");
  });
});
