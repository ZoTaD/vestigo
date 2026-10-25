/**
 * La pestaña Granja de Stardew Valley (etapa 4, tarea 6): los animales por edificio, la cadena de mejoras con su costo
 * desde cero, la vista en la dirección, las tres vistas dibujadas en los dos idiomas y los animales que Marnie no vende.
 * Las pantallas se dibujan sin navegador, como el prerender.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/farm.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, STARDEW_PUBLISHED, type Route } from "../src/route";
import { STARDEW_TABS } from "../src/stardewCopy";
import { loadFarm } from "../src/stardew/data";
import { FarmBook } from "../src/stardew/farm/StardewFarm";
import {
  animalsByHouse,
  buildingChain,
  buildingsOf,
  readFarmView,
  residents,
  viewOfAnchor,
  writeFarmView,
  type FarmData,
  type FarmView,
} from "../src/stardew/farm/state";

const data = raw as unknown as FarmData;
// Como al abrir la pestaña: los slugs en español de los objetos que nombra quedan anotados.
beforeAll(() => loadFarm());
const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "farm" }) as Route;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const book = (initial: FarmView, lang: "en" | "es" = "en") => inLang(lang, createElement(FarmBook, { data, route: route(lang), navigate: () => undefined, initial }));
/** El texto del `<li>` con ese `id` (con lo que tenga adentro, hasta su cierre), sin etiquetas. */
const row = (html: string, id: string) => {
  const start = html.lastIndexOf("<li", html.indexOf(`id="${id}"`));
  expect(start).toBeGreaterThan(-1);
  const tags = /<li[\s>]|<\/li>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === "</li>" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
  }
  throw new Error(`sin cierre: ${id}`);
};

describe("los animales por edificio", () => {
  it("el corral primero, después el establo; la gallina blanca vive en el corral", () => {
    const groups = animalsByHouse(data);
    expect(groups.map(([h]) => h).slice(0, 2)).toEqual(["Coop", "Barn"]);
    expect(groups[0][1].map((a) => a.key)).toContain("White Chicken");
    expect(groups.flatMap(([, list]) => list)).toHaveLength(data.animals.length);
  });

  it("el avestruz va donde dice el dato", () => {
    const ostrich = data.animals.find((a) => a.key === "Ostrich")!;
    const [house] = animalsByHouse(data).find(([, list]) => list.includes(ostrich))!;
    expect(house).toBe(ostrich.house);
    expect(house).toBe("Barn");
  });
});

describe("las mejoras de un edificio", () => {
  it("el corral de lujo es la tercera de su cadena y llegar cuesta 34.000 g", () => {
    const chain = buildingChain(data, "Deluxe Coop");
    expect(chain.map((b) => b.key)).toEqual(["Coop", "Big Coop", "Deluxe Coop"]);
    expect(chain.map((b) => b.total)).toEqual([4000, 14000, 34000]);
    expect(buildingChain(data, "Coop")).toHaveLength(1);
    expect(buildingChain(data, "nada")).toEqual([]);
  });

  it("cada edificio va seguido de sus mejoras, y la cabaña del multijugador no está entre los de Robin", () => {
    const robin = buildingsOf(data, "Robin").map((b) => b.key);
    expect(robin.slice(robin.indexOf("Coop"), robin.indexOf("Coop") + 3)).toEqual(["Coop", "Big Coop", "Deluxe Coop"]);
    expect(robin).not.toContain("Cabin");
    expect(buildingsOf(data, "Wizard").every((b) => b.builder === "Wizard")).toBe(true);
    expect(robin.length + buildingsOf(data, "Wizard").length).toBe(data.buildings.length - 1);
  });
});

describe("quién vive en cada edificio", () => {
  const keys = (b: string) => residents(data, b).map((a) => a.key);
  it("el Gallinero no tiene pato, conejo ni los de la incubadora; el grande suma el pato, el de lujo el conejo", () => {
    expect(keys("Coop")).toEqual(["White Chicken", "Brown Chicken", "Blue Chicken"]);
    expect(keys("Big Coop")).toEqual(expect.arrayContaining(["Duck", "Void Chicken", "Golden Chicken", "Dinosaur"]));
    expect(keys("Big Coop")).not.toContain("Rabbit");
    expect(keys("Deluxe Coop")).toHaveLength(8);
  });

  it("el Establo no tiene cabra; el grande sí, y el de lujo los seis", () => {
    expect(keys("Barn")).not.toContain("Goat");
    expect(keys("Barn")).toContain("Ostrich");
    expect(keys("Big Barn")).toContain("Goat");
    expect(keys("Deluxe Barn")).toHaveLength(6);
  });

  it("la tarjeta del corral sólo dibuja a los que entran", () => {
    const html = book("buildings");
    const coop = html.slice(html.indexOf('id="coop"'), html.indexOf('id="big-coop"'));
    expect(coop).toContain("#white-chicken");
    expect(coop).not.toContain("#duck");
    expect(coop).not.toContain("#dinosaur");
  });
});

describe("la dirección de la Granja", () => {
  it("se abre en Animales, que no se escribe; lo desconocido vuelve a Animales", () => {
    expect(readFarmView("")).toBe("animals");
    expect(writeFarmView("animals")).toBe("");
    expect(writeFarmView("buildings")).toBe("?v=buildings");
    expect(readFarmView("?v=house")).toBe("house");
    expect(readFarmView("?v=nada")).toBe("animals");
  });

  it("un ancla abre la vista donde está su fila", () => {
    expect(viewOfAnchor(data, "white-chicken")).toBe("animals");
    expect(viewOfAnchor(data, "coop")).toBe("buildings");
    expect(viewOfAnchor(data, "add-cubby")).toBe("house");
    expect(viewOfAnchor(data, "upgrade-2")).toBe("house");
    expect(viewOfAnchor(data, "nada")).toBeNull();
  });

  it("la pestaña tiene dirección en los dos idiomas, está publicada y va después de Cultivos en la barra", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/farm");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/granja");
    expect(parseRoute("/es/stardew-valley/granja")).toMatchObject({ view: "stardew", sdSection: "farm", lang: "es" });
    expect(STARDEW_PUBLISHED).toContain("farm");
    expect(STARDEW_TABS.indexOf("farm")).toBe(STARDEW_TABS.indexOf("crops") + 1);
  });
});

describe("las tres vistas", () => {
  for (const lang of ["en", "es"] as const) {
    it(`Animales en ${lang}: cada animal con su ancla, sus productos y los cuidados`, () => {
      const html = book("animals", lang);
      for (const a of data.animals) expect(html).toContain(`id="${a.slug}"`);
      expect(html).toContain(`data-care="pet"`);
      // La gallina blanca: 400 g, el huevo enlazado a su ficha y la mayonesera.
      const chicken = row(html, "white-chicken");
      expect(chicken).toContain("400");
      expect(html).toContain(lang === "es" ? "/es/stardew-valley/objetos/huevo" : "/en/stardew-valley/items/egg");
      expect(chicken).toContain(lang === "es" ? "Mayonesera" : "Mayonnaise Machine");
      // La vaca se ordeña con la cubeta (el nombre del juego).
      expect(row(html, "white-cow")).toContain(lang === "es" ? "Cubeta lechera" : "Milk Pail");
    });

    it(`Edificios en ${lang}: los de Robin y los del mago, con costo, materiales y la cadena`, () => {
      const html = book("buildings", lang);
      for (const b of data.buildings) expect(html).toContain(`id="${b.slug}"`);
      expect(html).toContain('data-builder="Robin"');
      expect(html).toContain('data-builder="Wizard"');
      const deluxe = row(html, "deluxe-coop");
      expect(deluxe).toMatch(lang === "es" ? /34\.000/ : /34,000/);
      expect(deluxe).toContain(lang === "es" ? "Corral grande" : "Big Coop");
      // La cabaña del multijugador lleva su nota: no se confunde con la otra Cabaña.
      expect(row(html, "cabin")).toContain(lang === "es" ? "multijugador" : "multiplayer");
      expect(row(html, "shed")).not.toContain(lang === "es" ? "multijugador" : "multiplayer");
    });

    it(`Casa en ${lang}: las tres mejoras y las reformas con precio`, () => {
      const html = book("house", lang);
      for (const n of [1, 2, 3]) expect(html).toContain(`id="upgrade-${n}"`);
      for (const r of data.house.renovations) expect(html).toContain(`id="${r.slug}"`);
      expect(row(html, "build-crib")).toContain(lang === "es" ? "Gratis" : "Free");
      expect(row(html, "add-dining-room")).toMatch(lang === "es" ? /150\.000/ : /150,000/);
    });
  }

  it("ningún texto muestra llaves, corchetes ni {0}", () => {
    for (const v of ["animals", "buildings", "house"] as const)
      for (const lang of ["en", "es"] as const) {
        const text = book(v, lang).replace(/<[^>]+>/g, " ");
        expect(text).not.toMatch(/[{}[\]]/);
      }
  });
});

describe("los animales que Marnie no vende", () => {
  it("no muestran un precio de 0 ni vacío: dicen de dónde salen", () => {
    const sinPrecio = data.animals.filter((a) => a.price == null);
    expect(sinPrecio.map((a) => a.key).sort()).toEqual(["Dinosaur", "Golden Chicken", "Ostrich", "Void Chicken"]);
    for (const lang of ["en", "es"] as const) {
      const html = book("animals", lang);
      for (const a of sinPrecio) {
        const text = row(html, a.slug);
        expect(text).toContain(lang === "es" ? "Marnie no lo vende" : "Marnie doesn't sell it");
        expect(text).toContain(a.from![lang === "es" ? 1 : 0]);
        expect(text).not.toMatch(/\b0\s*g\b/);
      }
    }
  });

  it("el pato y el conejo dicen qué edificio pide Marnie, y los de la incubadora el Gallinero grande", () => {
    const html = book("animals", "es");
    expect(row(html, "duck")).toContain("Pide: Corral grande");
    expect(row(html, "rabbit")).toContain("Pide: Corral de lujo");
    for (const slug of ["void-chicken", "golden-chicken", "dinosaur"]) expect(row(html, slug)).toContain("Pide: Corral grande");
    expect(row(html, "ostrich")).not.toContain("Pide:");
  });

  it("el huevo de avestruz da 10 mayonesas", () => {
    expect(row(book("animals"), "ostrich")).toMatch(/Mayonnaise\s*×\s*10/);
  });
});
