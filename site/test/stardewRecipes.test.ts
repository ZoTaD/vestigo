/**
 * La pestaña Recetas y máquinas de Stardew Valley (etapa 2, tarea 6): la dirección que guarda la vista y la búsqueda,
 * el buscador por nombre o ingrediente, los nombres de las categorías de ingrediente, cómo se aprende cada receta y las
 * tablas de las máquinas, con la pantalla dibujada sin navegador (como el prerender).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/recipes.json";
import { LangContext } from "../src/i18n";
import { parseRoute, registerStardewSlugs, routePath, type Route } from "../src/route";
import { RecipeBook } from "../src/stardew/recipes/StardewRecipes";
import {
  DEFAULT_RECIPE_STATE,
  machineList,
  readRecipeState,
  recipeList,
  ruleRows,
  writeRecipeState,
  type RecipeState,
  type RecipesData,
} from "../src/stardew/recipes/state";

const data = raw as unknown as RecipesData;
// Como hace `loadRecipes` al bajar los datos: los enlaces en español usan el slug del objeto en español.
registerStardewSlugs({ items: Object.fromEntries(Object.values(data.refs.items).map((r) => [r[0], r[1]])) });
const route = { lang: "en", view: "stardew", sdSection: "recipes" } as Route;
const st = (x: Partial<RecipeState>): RecipeState => ({ ...DEFAULT_RECIPE_STATE, ...x });

/** La pantalla dibujada con un estado: las recetas y las máquinas que salen, en orden. */
function screen(state: RecipeState, lang: "en" | "es" = "en") {
  const html = renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(RecipeBook, { data, route: { ...route, lang }, navigate: () => undefined, initial: state })),
  );
  const recipes = [...html.matchAll(/data-recipe="([^"]+)"/g)].map((m) => m[1]);
  const machines = [...html.matchAll(/data-machine="([^"]+)"/g)].map((m) => m[1]);
  return { html, recipes, machines };
}
/** El texto de la tarjeta de una receta, sin etiquetas. */
const card = (html: string, slug: string): string => {
  const at = html.indexOf(`data-recipe="${slug}"`);
  const end = html.indexOf("</li></ul></li>", at);
  return html.slice(at, end).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
};

describe("la dirección de Recetas", () => {
  it("se abre en Cocina y sin búsqueda; el valor por defecto no se escribe", () => {
    expect(readRecipeState("")).toEqual({ view: "cook", q: "" });
    expect(writeRecipeState(DEFAULT_RECIPE_STATE)).toBe("");
  });

  it("conserva la vista y la búsqueda", () => {
    const s = st({ view: "craft", q: "melón" });
    expect(readRecipeState(writeRecipeState(s))).toEqual(s);
    expect(readRecipeState("?view=machines&q=keg")).toEqual({ view: "machines", q: "keg" });
  });

  it("una vista que no existe cae en Cocina", () => {
    expect(readRecipeState("?view=garbage&q=x")).toEqual({ view: "cook", q: "x" });
    expect(readRecipeState("?view=")).toEqual({ view: "cook", q: "" });
  });

  it("la pestaña tiene dirección en los dos idiomas", () => {
    expect(routePath({ ...route, lang: "es" })).toBe("/es/stardew-valley/recetas");
    expect(routePath(route)).toBe("/en/stardew-valley/recipes");
    expect(parseRoute("/es/stardew-valley/recetas")).toMatchObject({ view: "stardew", sdSection: "recipes", lang: "es" });
    expect(parseRoute("/en/stardew-valley/recipes/pink-cake").detail).toBeUndefined();
  });
});

describe("el buscador", () => {
  it("encuentra el Pastel rosa por su ingrediente, el melón, con o sin acento", () => {
    expect(recipeList(data, "cook", "melón", "es").map((r) => r.name[1])).toContain("Pastel rosa");
    expect(recipeList(data, "cook", "melon", "es").map((r) => r.name[1])).toContain("Pastel rosa");
    expect(recipeList(data, "cook", "melon", "en").map((r) => r.name[0])).toContain("Pink Cake");
  });

  it("encuentra por el nombre de la receta y por una categoría de ingrediente", () => {
    expect(recipeList(data, "cook", "pink cake", "en").map((r) => r.name[0])).toEqual(["Pink Cake"]);
    // "Huevo (cualquiera)": la Tortilla lleva cualquier huevo.
    expect(recipeList(data, "cook", "cualquiera", "es").map((r) => r.name[1])).toContain("Tortilla");
  });

  it("cada vista sólo trae lo suyo", () => {
    expect(recipeList(data, "cook", "", "en").every((r) => r.kind === "cook")).toBe(true);
    expect(recipeList(data, "craft", "", "en").every((r) => r.kind === "craft")).toBe(true);
    expect(recipeList(data, "cook", "", "en").length + recipeList(data, "craft", "", "en").length).toBe(data.recipes.length);
  });

  it("en Máquinas deja sólo las filas donde aparece lo buscado", () => {
    const melon = machineList(data, "melon", "en");
    const keg = melon.find((m) => m.machine.slug === "keg")!;
    expect(keg.rows.map((r) => r.inName[0])).toContain("Melon");
    expect(keg.rows.every((r) => /melon/i.test(r.inName[0]) || r.outs.some((o) => /melon/i.test(o.outName[0])))).toBe(true);
    expect(keg.rows.length).toBeLessThan(5);
    // Por el nombre de la máquina, todas sus filas.
    expect(machineList(data, "keg", "en").find((m) => m.machine.slug === "keg")!.rows.length).toBe(ruleRows(keg.machine).length);
  });
});

describe("la pantalla", () => {
  it("se abre en Cocina: platos, sin objetos de fabricación ni máquinas", () => {
    const { recipes, machines } = screen(DEFAULT_RECIPE_STATE);
    expect(recipes).toContain("pink-cake");
    expect(recipes).not.toContain("wood-fence");
    expect(machines).toEqual([]);
  });

  it("cambia de vista: Fabricación y Máquinas", () => {
    const craft = screen(st({ view: "craft" }));
    expect(craft.recipes).toContain("wood-fence");
    expect(craft.recipes).not.toContain("pink-cake");
    const mach = screen(st({ view: "machines" }));
    expect(mach.recipes).toEqual([]);
    expect(mach.machines).toContain("keg");
    expect(mach.machines).toContain("bee-house");
  });

  it("la búsqueda \"melón\" muestra el Pastel rosa en español", () => {
    const { recipes, html } = screen(st({ q: "melón" }), "es");
    expect(recipes).toContain("pink-cake");
    expect(html).toContain("Pastel rosa");
  });

  it("una categoría de ingrediente se muestra con su nombre del juego", () => {
    const en = screen(DEFAULT_RECIPE_STATE);
    expect(card(en.html, "pink-cake")).toContain("Egg (Any)");
    const es = screen(DEFAULT_RECIPE_STATE, "es");
    expect(card(es.html, "pink-cake")).toContain("Huevo (cualquiera)");
    expect(card(es.html, "pink-cake")).toContain("Melón");
  });

  it("cómo se aprende: TV, amistad, habilidad, desde el principio y otra forma", () => {
    const es = screen(DEFAULT_RECIPE_STATE, "es").html;
    expect(card(es, "pink-cake")).toContain("TV (La reina de la salsa)");
    expect(card(es, "salad")).toContain("Emily · 3 corazones");
    const craft = screen(st({ view: "craft" }), "es").html;
    expect(card(craft, "stone-fence")).toContain("Agricultura nivel 2");
    expect(card(craft, "wood-fence")).toContain("Desde el principio");
    expect(card(craft, "grass-starter")).toContain("Otra forma");
    const en = screen(st({ view: "craft" })).html;
    expect(card(en, "stone-fence")).toContain("Farming level 2");
  });

  it("cada plato y cada ingrediente enlazan a su ficha de Objetos con su sprite", () => {
    // Buscado, así cae en la primera tanda (la que lleva sprites en el prerender).
    const { html } = screen(st({ q: "pastel rosa" }), "es");
    const at = html.indexOf('data-recipe="pink-cake"');
    const pink = html.slice(at, html.indexOf("</li></ul></li>", at));
    expect(pink).toContain('href="/es/stardew-valley/objetos/pastel-rosa"');
    expect(pink).toContain('href="/es/stardew-valley/objetos/melon"');
    expect(pink).toContain("/stardew/items/221.png");
    expect(pink).toContain("/stardew/items/254.png");
  });

  it("una máquina con muchas filas muestra las primeras 8 y el botón para ver todas", () => {
    const { html } = screen(st({ view: "machines" }), "es");
    const at = html.indexOf('data-machine="keg"');
    const keg = html.slice(at, html.indexOf("data-machine=", at + 20));
    expect([...keg.matchAll(/data-rule=/g)].length).toBe(8);
    expect(keg).toContain("Ver las 74");
    // El tiempo legible y el precio: el Zumo de rábano tarda unos 4 días.
    expect(keg).toContain("≈ 4 días");
    expect(keg).toContain("/stardew/items/bc-12.png");
    // La Colmena tarda 4 días justos y usa la flor de al lado.
    const bee = html.slice(html.indexOf('data-machine="bee-house"'));
    expect(bee).toContain("4 días");
  });
});
