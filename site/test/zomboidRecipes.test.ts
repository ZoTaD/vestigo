/**
 * La pestaña Recetas de Project Zomboid (2026-09-30): la lista con todas las fichas en el HTML y la ficha de cada
 * receta, con los datos reales de `games/zomboid/data/site/**`. Se renderiza la pestaña sola (`ZomboidRecipes`), igual
 * que `zomboidItems.test.ts`; el cableado (solapa, prerender, sitemap) lo prueba `zomboidPublish.test.ts`. Objetos y
 * Recetas se dan por publicadas mientras corre el archivo, porque `parseRoute` manda una pestaña sin publicar a la
 * portada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute, PZ_PUBLISHED, routePath, type PzTab, type Route } from "../src/route";
import ZomboidRecipes from "../src/zomboid/recipes/ZomboidRecipes";
import { loadRecipe, loadRecipesList, peekRecipe, peekRecipesList, preloadRecipesRoute } from "../src/zomboid/recipes/data";
import { changesItem, optionLabels } from "../src/zomboid/recipes/lines";
import { ZOMBOID_COPY } from "../src/zomboidCopy";
import recipesList from "../../games/zomboid/data/site/recipes-list.json";

const TABS: PzTab[] = ["items", "recipes"];
const added: PzTab[] = [];

/** Las recetas que prueba este archivo, pedidas antes de renderizar (el render es sincrónico). */
const USED = [
  "saw-log", "make-mildew-cure", "wooden-chair-basic", "forge-bar-from-chunks", "open-dented-unlabeled-can",
  "make-bucket-maul", "make-western-boots", "harvest-roe", "craft-twine", "dry-parsley", "forge-crowbar",
  "dye-clothes", "roll-one-dice", "draw-random-card", "scrap-jewellery", "cut-up-denim-leather-clothing", "slice-animal-head",
];

beforeAll(async () => {
  for (const tab of TABS) {
    if (!PZ_PUBLISHED.includes(tab)) {
      PZ_PUBLISHED.push(tab);
      added.push(tab);
    }
  }
  await Promise.all([loadRecipesList(), ...USED.map(loadRecipe)]);
});
afterAll(() => {
  for (const tab of added) PZ_PUBLISHED.splice(PZ_PUBLISHED.indexOf(tab), 1);
});

const renderRoute = (route: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidRecipes, { route, navigate: () => undefined }),
    ),
  );
const render = (path: string) => renderRoute(parseRoute(path));
const base = (lang: "en" | "es") => parseRoute(`/${lang}/project-zomboid`);
/** La dirección de una ficha, con el slug de su idioma (el que arma el build). */
const recipeHref = (lang: "en" | "es", id: string) => routePath({ ...base(lang), pzSection: "recipes", detail: id });
const itemHref = (lang: "en" | "es", id: string) => routePath({ ...base(lang), pzSection: "items", detail: id });
/** La ficha de una receta por su id, pasando por su dirección en español (el slug traducido). */
const ficha = (lang: "en" | "es", id: string) => render(recipeHref(lang, id));
/** El HTML de una hoja de la ficha (`pzr-inputs`, `pzr-tools`, `pzr-out`, `pzr-reqs`, `pzr-learn`). */
const sheet = (html: string, cls: string): string => {
  const m = html.match(new RegExp(`<section class="[^"]*\\b${cls}\\b[^"]*">([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`no está la hoja ${cls}`);
  return m[1];
};

const ROWS = recipesList.rows;
const links = (html: string, prefix: string) => new Set(html.match(new RegExp(`href="${prefix}/[^"]+"`, "g")) ?? []);

describe("la lista de recetas", () => {
  it("en español tiene un <a> por cada receta (1.170), con su texto y los filtros", () => {
    const html = render("/es/project-zomboid/recetas");
    expect(ROWS.length).toBe(1170);
    expect(links(html, "/es/project-zomboid/recetas").size).toBe(ROWS.length);
    expect(html).toContain(`href="${recipeHref("es", "saw-log")}"`);
    expect(recipeHref("es", "saw-log")).toBe("/es/project-zomboid/recetas/aserrar-troncos");
    // El texto que lee Google: cuántas hay, de cada tipo.
    expect(html).toContain("1.170 recetas");
    expect(html).toContain("969");
    expect(html).toContain("201");
    // Fabricación / Construcción, y las categorías del juego.
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todas/);
    expect(html).toContain("Fabricación");
    expect(html).toContain("Construcción");
    for (const cat of Object.values(recipesList.cats)) expect(html).toContain(cat.es);
    // El ícono del resultado, o el del mueble si es de construcción.
    expect(html).toMatch(/<img[^>]*src="\/zomboid\/items\/Plank\.webp"/);
    expect(html).toMatch(/<img[^>]*src="\/zomboid\/build\/Build_Chair\.webp"/);
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("/en/project-zomboid/recipes");
    expect(links(html, "/en/project-zomboid/recipes").size).toBe(ROWS.length);
    expect(html).toContain('href="/en/project-zomboid/recipes/saw-log"');
    expect(html).toContain("1,170 recipes");
    expect(html).toContain("Crafting");
    expect(html).toContain("Building");
    expect(html).not.toContain("Aserrar troncos");
  });

  it("una receta que no existe muestra la lista con la nota", async () => {
    expect(await loadRecipe("esto-no-existe")).toBeNull();
    const html = render("/es/project-zomboid/recetas/esto-no-existe");
    expect(html).toContain("No encontramos esa receta");
    expect(links(html, "/es/project-zomboid/recetas").size).toBe(ROWS.length);
    expect(render("/en/project-zomboid/recipes/esto-no-existe")).toContain("We couldn&#x27;t find that recipe");
  });
});

describe("la ficha de una receta", () => {
  it("Aserrar troncos: la sierra de herramienta, 1 tronco y 3 tablas, con links a sus objetos", () => {
    const html = ficha("es", "saw-log");
    expect(html).toContain("Aserrar troncos");
    expect(html).toContain("Carpintería");
    // La sierra no se gasta: va en Herramientas, con un link a cada objeto que sirve.
    const tools = sheet(html, "pzr-tools");
    expect(tools).toContain(`href="${itemHref("es", "hacksaw")}"`);
    expect(tools).toContain(`href="${itemHref("es", "wood-saw")}"`);
    expect(sheet(html, "pzr-inputs")).not.toContain(itemHref("es", "hacksaw"));
    // 1 tronco de entrada.
    const inputs = sheet(html, "pzr-inputs");
    expect(inputs).toMatch(/1 ×/);
    expect(inputs).toContain(`href="${itemHref("es", "log")}"`);
    expect(inputs).toContain("Tronco");
    // 3 tablas de salida, con el link a la tabla.
    const out = sheet(html, "pzr-out");
    expect(itemHref("es", "plank")).toBe("/es/project-zomboid/objetos/tabla");
    expect(out).toMatch(/3 ×/);
    expect(out).toContain('href="/es/project-zomboid/objetos/tabla"');
    // Los números: el tiempo del juego tal cual, sin convertir, y la XP.
    const reqs = sheet(html, "pzr-reqs");
    expect(reqs).toMatch(/tiempo \(unidades del juego\)/i);
    expect(reqs).toContain("230");
    expect(reqs).toMatch(/Carpintería[\s\S]{0,40}\+5/);
    // Sin NeedToBeLearn: se sabe de entrada.
    expect(sheet(html, "pzr-learn")).toContain("La sabés desde el principio");
    // La vuelta a la lista.
    expect(html).toContain('href="/es/project-zomboid/recetas"');
  });

  it("en inglés, con los textos en inglés", () => {
    const html = ficha("en", "saw-log");
    expect(html).toContain("Saw Log");
    expect(sheet(html, "pzr-out")).toContain('href="/en/project-zomboid/items/plank"');
    expect(sheet(html, "pzr-reqs")).toMatch(/time \(game units\)/i);
    expect(sheet(html, "pzr-learn")).toContain("You know it from the start");
    expect(html).not.toContain("Tronco");
  });

  it("una receta con revista: el link a la revista, el nivel, y los links al rasgo y a la profesión", () => {
    const html = ficha("es", "make-mildew-cure");
    const learn = sheet(html, "pzr-learn");
    expect(learn).toContain(`href="${itemHref("es", "magazine-kentucky-farmer-june-1993")}"`);
    expect(learn).toContain("Revista: Granjero de Kentucky - Junio de 1993");
    expect(learn).toMatch(/Al llegar a[\s\S]{0,60}Agricultura 6/);
    expect(learn).toContain("Jardinero");
    expect(learn).toContain("Granjero");
    // Desde que Rasgos se publicó (2026-09-30), el rasgo y la profesión llevan a sus fichas, con la dirección en español.
    const traitHref = routePath({ ...base("es"), pzSection: "traits", detail: "gardener" });
    const profHref = routePath({ ...base("es"), pzSection: "professions", detail: "farmer" });
    expect(traitHref).toBe("/es/project-zomboid/rasgos/jardinero");
    expect(profHref).toBe("/es/project-zomboid/profesiones/granjero");
    expect(learn).toContain(`href="${traitHref}"`);
    expect(learn).toContain(`href="${profHref}"`);
    expect(sheet(ficha("en", "make-mildew-cure"), "pzr-learn")).toContain('href="/en/project-zomboid/traits/gardener"');
    expect(learn).not.toContain("La sabés desde el principio");
  });

  it("un líquido va con su nombre y su recipiente; «cualquier objeto» con líquido es cualquier recipiente", () => {
    const html = ficha("es", "make-mildew-cure");
    const inputs = sheet(html, "pzr-inputs");
    expect(inputs).toContain("Leche de vaca / Leche de oveja / Leche de animal");
    expect(inputs).toMatch(/1\sL/);
    expect(inputs).toContain("cualquier recipiente");
    // El bol se queda (herramienta), el agua de adentro se gasta.
    const roe = ficha("es", "harvest-roe");
    expect(sheet(roe, "pzr-tools")).toContain("Agua");
    expect(sheet(roe, "pzr-tools")).toMatch(/0,3\sL/);
    expect(sheet(roe, "pzr-tools")).toContain("se gasta");
  });

  it("una de construcción muestra el mueble que se construye, con su ícono", () => {
    const html = ficha("es", "wooden-chair-basic");
    const out = sheet(html, "pzr-out");
    expect(out).toContain("Silla de madera (básica)");
    expect(out).toContain("/zomboid/build/Build_Chair.webp");
    expect(html).toContain("Construcción");
    expect(sheet(html, "pzr-reqs")).toMatch(/Carpintería[\s\S]{0,20}1/);
  });

  it("el resultado según el ingrediente: cada trozo da su barra, y la estación de trabajo", () => {
    const html = ficha("es", "forge-bar-from-chunks");
    const out = sheet(html, "pzr-out");
    expect(out).toContain(`href="${itemHref("es", "iron-chunk")}"`);
    expect(out).toContain(`href="${itemHref("es", "iron-bar")}"`);
    expect(out).toContain(`href="${itemHref("es", "steel-bar")}"`);
    expect(out.indexOf("Trozo de hierro")).toBeLessThan(out.indexOf("Barra de hierro"));
    // Una etiqueta abierta en sus objetos: "cualquiera de" y la lista.
    expect(sheet(html, "pzr-inputs")).toContain("cualquiera de");
    expect(sheet(html, "pzr-reqs")).toContain("Primitivo o, mejor aún, forja");
  });

  it("una sin resultado fijo lo dice, en vez de dejar la hoja vacía", () => {
    // Tirar un dado: sale un número, no cambia nada; el texto genérico es el que dice la verdad.
    expect(sheet(ficha("es", "roll-one-dice"), "pzr-out")).toContain("No da un objeto fijo");
    expect(sheet(ficha("en", "roll-one-dice"), "pzr-out")).toContain("No fixed result");
    // Sacar una carta al azar: igual, la tercera del `Set` de `lines.ts`.
    expect(sheet(ficha("es", "draw-random-card"), "pzr-out")).toContain("No da un objeto fijo");
    // Desguazar joyas: la joya se gasta y salen oro o gemas, tampoco modifica un objeto.
    expect(sheet(ficha("es", "scrap-jewellery"), "pzr-out")).toContain("No da un objeto fijo");
  });

  it("sin resultado pero sobre un objeto que usás (teñir una prenda, abrir una lata): dice que lo modifica", () => {
    for (const id of ["dye-clothes", "open-dented-unlabeled-can"]) {
      const es = sheet(ficha("es", id), "pzr-out");
      expect(es, id).toContain("Modifica el objeto que usás");
      expect(es, id).not.toContain("No da un objeto fijo");
    }
    expect(sheet(ficha("en", "dye-clothes"), "pzr-out")).toContain("Changes the item you use");
    // Lo decide `changesItem` con los datos: tener resultado, o no tener qué usar, no es modificar un objeto.
    const dye = peekRecipe("dye-clothes")!;
    expect(changesItem(dye)).toBe(true);
    expect(changesItem({ ...dye, outputs: peekRecipe("saw-log")!.outputs })).toBe(false);
    expect(changesItem({ ...dye, inputs: [] })).toBe(false);
  });

  it("aprender por nivel: «y» si hacen falta todas, «o» si alcanza con una", () => {
    expect(sheet(ficha("es", "make-western-boots"), "pzr-learn")).toMatch(/Sastrería 9 y Tallado 4/);
    expect(sheet(ficha("es", "make-bucket-maul"), "pzr-learn")).toMatch(/Mantenimiento 8 o [^<]+ 8/);
    expect(sheet(ficha("en", "make-bucket-maul"), "pzr-learn")).toMatch(/Maintenance 8 or Long Blunt 8/);
  });

  it("cantidades variables y opciones con su propia cantidad", () => {
    expect(sheet(ficha("es", "dry-parsley"), "pzr-inputs")).toMatch(/1–20 ×/);
    expect(sheet(ficha("es", "dry-parsley"), "pzr-out")).toMatch(/1–20 ×/);
    // Cordel: 1 de cáñamo o de lino, o 25 hilos de tendón.
    expect(sheet(ficha("es", "craft-twine"), "pzr-inputs")).toMatch(/25 ×[\s\S]{0,300}Hilo de tendón/);
  });

  it("la nota del juego: sus <br> son saltos de línea, no texto escapado", async () => {
    await loadRecipe("barricade-metal-bar");
    const html = ficha("es", "barricade-metal-bar");
    expect(html).toMatch(/irrumpan\.<br\/>Los ataques/);
    expect(html).not.toContain("&lt;br");
  });

  it("investigando un objeto: el link al objeto", () => {
    const learn = sheet(ficha("es", "forge-crowbar"), "pzr-learn");
    expect(learn).toContain(`href="${itemHref("es", "crowbar")}"`);
  });

  it("el resultado según el ingrediente: los que entran son alternativas con «o», y la flecha va con su resultado", () => {
    // Mazo de olla: la barra de acero o el tubo de hierro dan el mango de metal, cada uno por su cuenta.
    const es = sheet(ficha("es", "make-bucket-maul"), "pzr-out");
    expect(es).toMatch(/Barra de acero[\s\S]*?<span class="pzr-or">o<\/span>[\s\S]*?Tubo de hierro/);
    const en = sheet(ficha("en", "make-bucket-maul"), "pzr-out");
    expect(en).toMatch(/Steel Rod[\s\S]*?<span class="pzr-or">or<\/span>[\s\S]*?Iron Pipe/);
    // La flecha no se lee (aria-hidden): el lector de pantalla oye "da" / "gives", y flecha, "da" y resultado van en una
    // sola pieza para no quedar separados en dos renglones.
    expect(es).toMatch(/<span class="pzr-gives"><span class="visually-hidden">da<\/span><span class="pzr-arrow" aria-hidden="true">→<\/span><span class="pzr-to">/);
    expect(en).toContain('<span class="visually-hidden">gives</span><span class="pzr-arrow" aria-hidden="true">');
    // Un solo origen no lleva «o».
    const row = es.split("<li>").find((r) => r.includes("Mango grande") && r.includes("Mazo de olla - Mango de madera"))!;
    expect(row).toBeTruthy();
    expect(row).not.toContain("pzr-or");
  });

  it("tres o más alternativas: comas y «o» sólo antes de la última", () => {
    const es = sheet(ficha("es", "cut-up-denim-leather-clothing"), "pzr-out");
    const count = (r: string) => (r.match(/pzr-fromitem/g) ?? []).length;
    // La fila con más orígenes: siete, con cinco comas y una sola «o».
    const row = es.split("<li>").reduce((a, r) => (count(r) > count(a) ? r : a), "");
    expect(count(row)).toBeGreaterThanOrEqual(7);
    expect(row.match(/class="pzr-or"/g)).toHaveLength(1);
    expect(row.match(/class="pzr-comma"/g)).toHaveLength(count(row) - 2);
  });

  it("«o» se vuelve «u» delante de un nombre que empieza con o, como en `join`", () => {
    const es = ZOMBOID_COPY.es.recipes;
    expect(es.joinWord("or", "Tubo de hierro")).toBe("o");
    expect(es.joinWord("or", "Olla")).toBe("u");
    expect(es.joinWord("or", "Hacha")).toBe("o");
    expect(es.joinWord("and", "Ingeniería")).toBe("e");
    expect(es.join(["Plata", "Oro"], "or")).toBe("Plata u Oro");
    expect(ZOMBOID_COPY.en.recipes.joinWord("or", "Olla")).toBe("or");
    // `join` y `joinWord` no pueden decir cosas distintas.
    for (const how of ["and", "or"] as const) {
      for (const last of ["Herrería", "Olla", "Ingeniería", "Tubo"]) {
        expect(es.join(["Plata", last], how)).toBe(`Plata ${es.joinWord(how, last)} ${last}`);
      }
    }
  });

  it("nivel 0 no es un requisito: «ninguna», no «Herrería 0»", () => {
    const es = sheet(ficha("es", "forge-bar-from-chunks"), "pzr-reqs");
    expect(es).not.toContain("Herrería 0");
    expect(es).toMatch(/Habilidad requerida<\/dt><dd><span class="pzr-none">ninguna<\/span>/);
    // La XP que da sigue.
    expect(es).toMatch(/Herrería \+10/);
    expect(sheet(ficha("en", "forge-bar-from-chunks"), "pzr-reqs")).toMatch(/Required skill<\/dt><dd><span class="pzr-none">none<\/span>/);
    // Uno con nivel real lo conserva.
    expect(sheet(ficha("es", "make-western-boots"), "pzr-reqs")).toMatch(/Sastrería \d/);
  });

  it("las herramientas «vuelven a tu inventario»: no «no se gastan», que no vale para las que pierden condición", () => {
    const es = sheet(ficha("es", "saw-log"), "pzr-tools");
    expect(es).toContain("vuelven a tu inventario");
    expect(es).not.toContain("no se gastan");
    expect(sheet(ficha("en", "saw-log"), "pzr-tools")).toContain("go back to your inventory");
  });

  it("dos opciones que se llaman igual en español se distinguen, y sólo ésas", () => {
    // Carbón vegetal: `charcoal` y `wood-charcoal`.
    const inputs = sheet(ficha("es", "forge-bar-from-chunks"), "pzr-inputs");
    expect(inputs).toContain("Carbón vegetal (Charcoal)");
    expect(inputs).toContain("Carbón vegetal (Wood Charcoal)");
    // Su id es su nombre inglés hecho slug: con el paréntesis alcanza, sin un `title` "Charcoal · charcoal" de más.
    expect(inputs).not.toContain('title="Charcoal');
    expect(inputs).not.toContain('title="Wood Charcoal');
    // Los que no chocan quedan como están: sin paréntesis ni `title`.
    expect(inputs).toMatch(/Trozo de hierro<\/span>/);
    expect(inputs).not.toContain('title="Iron Chunk');
    // En inglés los nombres no chocan: ni paréntesis ni `title`.
    const en = sheet(ficha("en", "forge-bar-from-chunks"), "pzr-inputs");
    expect(en).toContain("Charcoal</span>");
    expect(en).not.toContain("Charcoal (");
    expect(en).not.toContain("title=");
  });

  it("optionLabels: el mismo objeto dos veces no es un choque, y sin otro nombre que los distinga queda el `title`", () => {
    const a = { id: "a", en: "Hatchet", es: "Hacha de mano", icon: null };
    const b = { id: "b", en: "Hand Axe", es: "Hacha de mano", icon: null };
    const c = { id: "c", en: "Rag", es: "Trapo", icon: null };
    expect(optionLabels([a, b, c], "es")).toEqual([
      { label: "Hacha de mano (Hatchet)", title: "Hatchet · a" },
      { label: "Hacha de mano (Hand Axe)", title: "Hand Axe · b" },
      { label: "Trapo" },
    ]);
    // En inglés no chocan: nada.
    expect(optionLabels([a, b, c], "en")).toEqual([{ label: "Hatchet" }, { label: "Hand Axe" }, { label: "Rag" }]);
    // El mismo id repetido (un resultado que sale de dos filas) no es un choque.
    expect(optionLabels([a, a], "es")).toEqual([{ label: "Hacha de mano" }, { label: "Hacha de mano" }]);
    // Iguales en los dos idiomas: no hay cómo distinguirlos con un nombre; queda el `title` con el id.
    const d = { ...b, id: "d" };
    expect(optionLabels([b, d], "es")).toEqual([
      { label: "Hacha de mano", title: "Hand Axe · b" },
      { label: "Hacha de mano", title: "Hand Axe · d" },
    ]);
  });

  it("los resultados de filas distintas que se llaman igual también se distinguen", () => {
    // Cráneo de ciervo: `deer-skull` y `stag-skull` se llaman igual en español, cada uno en su fila.
    const out = sheet(ficha("es", "slice-animal-head"), "pzr-out");
    expect(out).toContain("Cráneo de ciervo (Deer Skull)");
    expect(out).toContain("Cráneo de ciervo (Stag Skull)");
    // Y los de nombre propio quedan sin paréntesis.
    expect(out).toContain("Cráneo de vaca</span>");
  });

  it("mientras la ficha no llega, una hoja de «cargando…»", () => {
    // La cura del moho y las demás ya se pidieron; ésta no la pide ningún otro test.
    expect(peekRecipe("forge-saw")).toBeUndefined();
    const html = renderRoute({ ...parseRoute("/es/project-zomboid/recetas"), detail: "forge-saw" });
    expect(html).toContain("pz-loading");
    expect(html).toContain("cargando");
  });
});

describe("la carga de datos", () => {
  it("preloadRecipesRoute trae la ficha, o la lista si no existe", async () => {
    await preloadRecipesRoute({ ...parseRoute("/es/project-zomboid/recetas"), detail: "saw-large-branch" });
    expect(peekRecipe("saw-large-branch")).toBeTruthy();
    await preloadRecipesRoute({ ...parseRoute("/es/project-zomboid/recetas"), detail: "tampoco-existe" });
    expect(peekRecipe("tampoco-existe")).toBeNull();
    expect(peekRecipesList()?.rows.length).toBe(1170);
  });
});
