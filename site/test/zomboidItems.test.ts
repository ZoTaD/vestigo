/**
 * La pestaña Objetos de Project Zomboid (2026-09-30): la lista con todas las fichas en el HTML y la ficha de cada
 * objeto, con los datos reales de `games/zomboid/data/site/**`. Se renderiza la pestaña sola (`ZomboidItems`): el
 * cableado de `TABS` y del prerender llega con la publicación (Task 4). Objetos y Recetas se dan por publicadas mientras
 * corre el archivo, porque `parseRoute` manda una pestaña sin publicar a la portada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LangContext } from "../src/i18n";
import { parseRoute, PZ_PUBLISHED, routePath, type PzTab, type Route } from "../src/route";
import ZomboidItems from "../src/zomboid/items/ZomboidItems";
import { loadItem, loadItemsList, peekItem, preloadItemsRoute, type ItemFicha as ItemFichaData } from "../src/zomboid/items/data";
import { statRows } from "../src/zomboid/items/stats";
import { copyText, wordFit } from "../src/zomboid/ui";
import { cameFromHistory, notePop } from "../src/Zomboid";
import { ZOMBOID_COPY } from "../src/zomboidCopy";
import itemsList from "../../games/zomboid/data/site/items-list.json";

const TABS: PzTab[] = ["items", "recipes"];
const added: PzTab[] = [];

/** Lo mismo que `withPublished` de `zomboidSeo.test.ts`, para todo el archivo: los tests esperan cargas. */
beforeAll(async () => {
  for (const tab of TABS) {
    if (!PZ_PUBLISHED.includes(tab)) {
      PZ_PUBLISHED.push(tab);
      added.push(tab);
    }
  }
  await Promise.all([loadItemsList(), loadItem("crowbar")]);
});
afterAll(() => {
  for (const tab of added) PZ_PUBLISHED.splice(PZ_PUBLISHED.indexOf(tab), 1);
});

const renderRoute = (route: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidItems, { route, navigate: () => undefined }),
    ),
  );
const render = (path: string) => renderRoute(parseRoute(path));
/** La ficha de un objeto por su id, en el idioma dado (sin pasar por el slug en español). */
const fichaRoute = (lang: "en" | "es", id: string): Route => ({ ...parseRoute(`/${lang}/project-zomboid/items`), detail: id });
const recipeHref = (lang: "en" | "es", id: string) =>
  routePath({ ...parseRoute(`/${lang}/project-zomboid`), pzSection: "recipes", detail: id });

const ROWS = itemsList.rows;
const itemLinks = (html: string, prefix: string) => new Set(html.match(new RegExp(`href="${prefix}/[^"]+"`, "g")) ?? []);

describe("la lista de objetos", () => {
  it("en español tiene un <a> por cada ficha, el de la palanca y el texto propio", () => {
    const html = render("/es/project-zomboid/objetos");
    const links = itemLinks(html, "/es/project-zomboid/objetos");
    expect(links.size).toBe(ROWS.length);
    expect(ROWS.length).toBeGreaterThan(3800);
    expect(html).toContain('href="/es/project-zomboid/objetos/palanca"');
    // El texto que lee Google: cuántos hay, en cuántas categorías y qué tiene cada ficha.
    expect(html).toContain(`${ROWS.length.toLocaleString("es-AR")} objetos`);
    expect(html).toContain("/additem");
    // Los íconos no frenan la página: diferidos y con su tamaño.
    expect(html).toMatch(/<img[^>]*src="\/zomboid\/items\/Crowbar\.webp"[^>]*>/);
    expect(html).toMatch(/<img(?=[^>]*loading="lazy")(?=[^>]*width="32")(?=[^>]*height="32")[^>]*src="\/zomboid\/items\/Crowbar\.webp"/);
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("/en/project-zomboid/items");
    expect(itemLinks(html, "/en/project-zomboid/items").size).toBe(ROWS.length);
    expect(html).toContain('href="/en/project-zomboid/items/crowbar"');
    expect(html).toContain(`${ROWS.length.toLocaleString("en-US")} items`);
    expect(html).not.toContain("Palanca");
  });

  it("las categorías del juego son chips, y las variantes se cuentan", () => {
    const html = render("/es/project-zomboid/objetos");
    for (const cat of Object.values(itemsList.cats)) expect(html).toContain(cat.es.replace(/&/g, "&amp;"));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todas/);
    // La chaqueta de cuero tiene 4 variantes.
    expect(html).toMatch(/Chaqueta de cuero<\/span>[\s\S]{0,120}×4/);
  });

  it("un slug que no existe muestra la lista con la nota", async () => {
    expect(await loadItem("esto-no-existe")).toBeNull();
    const html = render("/es/project-zomboid/objetos/esto-no-existe");
    expect(html).toContain("No encontramos ese objeto");
    expect(itemLinks(html, "/es/project-zomboid/objetos").size).toBe(ROWS.length);
    expect(render("/en/project-zomboid/items/esto-no-existe")).toContain("We couldn&#x27;t find that item");
  });
});

describe("la ficha de un objeto", () => {
  it("la palanca en español: nombre, ID, /additem, daño y un link a su receta", () => {
    const html = render("/es/project-zomboid/objetos/palanca");
    expect(html).toContain("Palanca");
    expect(html).toContain("Base.Crowbar");
    expect(html).toContain("/additem");
    // Daño 0,6–1,15, alcance 0,61–1,25, crítico 20 % ×2,5 y durabilidad 15, 1 en 70.
    expect(html).toContain("0,6–1,15");
    expect(html).toContain("0,61–1,25");
    expect(html).toMatch(/20\s?%/);
    expect(html).toContain("×2,5");
    expect(html).toContain("1 en 70");
    expect(html).toContain("Arma larga contundente");
    const forge = recipeHref("es", "forge-crowbar");
    expect(forge.startsWith("/es/project-zomboid/recetas/")).toBe(true);
    expect(html).toContain(`href="${forge}"`);
    // La vuelta a la lista.
    expect(html).toContain('href="/es/project-zomboid/objetos"');
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("/en/project-zomboid/items/crowbar");
    expect(html).toContain("Crowbar");
    expect(html).toContain("Damage");
    expect(html).toContain("0.6–1.15");
    expect(html).toContain("Long Blunt");
    expect(html).toContain(`href="${recipeHref("en", "forge-crowbar")}"`);
    expect(html).not.toContain("Daño");
  });

  it("con dos variantes, la tabla muestra el ID de cada una", () => {
    const html = render("/es/project-zomboid/objetos/palanca");
    expect(html).toContain("Base.CrowbarForged");
    expect(html).toContain("/zomboid/items/Crowbar_Forged.webp");
  });

  it("un libro de habilidad muestra la habilidad, los niveles y el multiplicador", async () => {
    const id = "glassmaking-iv-secrets-of-the-carlow-crystal-makers";
    const book = await loadItem(id);
    expect(book?.skillBook).toMatchObject({ mult: 12, from: 7, levels: 2 });
    const es = renderRoute(fichaRoute("es", id));
    expect(es).toContain("Cristalería");
    expect(es).toContain("×12");
    expect(es).toContain("7–8");
    const en = renderRoute(fichaRoute("en", id));
    expect(en).toContain("Glassmaking");
    expect(en).toContain("×12");
  });

  it("el título de la ficha no hereda los espacios de más dentro de las comillas que trae el nombre del juego", async () => {
    const id = "aiming-iv-long-range-sniping-tactics";
    await loadItem(id);
    const h1 = renderRoute(fichaRoute("es", id)).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1];
    expect(h1).toBe("Puntería IV: &quot;Tácticas de francotirador&quot;");
  });

  it("la comida muestra hambre, sed, calorías y cuánto dura fresca", async () => {
    await loadItem("apple");
    const html = renderRoute(fichaRoute("es", "apple"));
    expect(html).toContain("Hambre");
    expect(html).toContain("−16");
    expect(html).toContain("Calorías");
    expect(html).toContain("95");
    expect(html).toContain("5 días");
  });

  it("la ropa muestra la defensa contra mordiscos y rasguños, con las palabras del juego", async () => {
    await loadItem("military-helmet");
    const html = renderRoute(fichaRoute("es", "military-helmet"));
    expect(html).toContain("Defensa contra mordiscos");
    expect(html).toContain("Defensa contra rasguños");
    expect(html).toMatch(/70\s?%/);
    expect(html).toMatch(/80\s?%/);
  });

  it("una lista larga de recetas (la navaja multiusos es herramienta en ~300) enlaza todas", async () => {
    const ficha = (await loadItem("multitool"))!;
    const html = renderRoute(fichaRoute("es", "multitool"));
    const recipes = new Set(html.match(/href="\/es\/project-zomboid\/recetas\/[^"]+"/g) ?? []);
    expect(recipes.size).toBe(new Set([...ficha.tools, ...ficha.research].map((r) => r.id)).size);
  });

  it("mientras la ficha no llega, una hoja de «cargando…»", () => {
    // Una ficha cuyo archivo todavía no pidió nadie en este archivo de tests: se busca, en vez de fijar una (el
    // destornillador) que deja de servir el día que otro test pida su archivo o un parche la mude de archivo.
    const waiting = ROWS.find((r) => peekItem(r.id) === undefined);
    expect(waiting).toBeDefined();
    const html = renderRoute(fichaRoute("es", waiting!.id));
    expect(html).toContain("pz-loading");
    expect(html).toContain("cargando");
  });
});

/** Lo que marcó la revisión de la pestaña (2026-09-30), con objetos reales. */
describe("la ficha, después de la revisión", () => {
  const es = async (id: string) => (await loadItem(id), renderRoute(fichaRoute("es", id)));
  const en = async (id: string) => (await loadItem(id), renderRoute(fichaRoute("en", id)));
  /** El valor de un renglón de números, o `undefined` si la ficha no lo tiene. */
  const row = (html: string, label: string) => html.match(new RegExp(`<dt>${label}</dt><dd>(.*?)</dd>`))?.[1];
  const itemHref = (lang: "en" | "es", id: string) => routePath(fichaRoute(lang, id));

  it("las notas del juego con <br> se dibujan como saltos de línea, no como texto", async () => {
    const html = await es("boxing-gloves");
    const tip = html.match(/<p class="pzi-tip">(.*?)<\/p>/)?.[1] ?? "";
    expect(tip).toContain("velocidad<br/>de transferencia");
    expect(tip).not.toMatch(/&lt;br/i);
  });

  it("«Usos» en lo que se gasta de a una acción: cinta, pegamento, fósforos", async () => {
    expect(row(await es("duct-tape"), "Usos")).toBe("4");
    expect(row(await es("glue"), "Usos")).toBe("5");
    expect(row(await en("matchbook"), "Uses")).toBe("10");
  });

  it("y no donde UseDelta es lo que se gasta de a poco: batería del auto, vela, propano, pila, filtro", async () => {
    for (const id of ["car-battery", "candle", "propane-tank", "battery", "gas-mask-filter"]) {
      const html = await es(id);
      expect(row(html, "Usos"), id).toBeUndefined();
    }
    // Lo que decía antes: 100.000 usos para la batería del auto y 5.000 para el tanque.
    expect(await es("car-battery")).not.toContain("100.000");
    expect(await es("propane-tank")).not.toContain("5.000");
  });

  it("el peso va con tres decimales, igual que en la lista: un diamante pesa 0,001 y no 0", async () => {
    expect(await es("diamond")).toContain('<dt>Peso</dt><dd class="pzi-num">0,001</dd>');
    expect(await en("diamond")).toContain('<dt>Weight</dt><dd class="pzi-num">0.001</dd>');
    expect(render("/es/project-zomboid/objetos")).toMatch(/>Diamante<\/span><b class="pzi-w">0,001<\/b>/);
  });

  it("el lugar del cuerpo va con el nombre del juego, no con su código", async () => {
    expect(row(await es("bulletproof-vest-police"), "Ocupa el lugar de")).toBe("Chaleco protector");
    expect(row(await en("bulletproof-vest-police"), "Slot")).toBe("Protective Vest");
    expect(row(await es("padded-jacket"), "Ocupa el lugar de")).toBe("Chaqueta con capucha voluminosa");
    expect(row(await es("military-helmet"), "Ocupa el lugar de")).toBe("Sombrero");
    expect(await es("bulletproof-vest-police")).not.toContain("torsoextravestbullet</");
  });

  it("todos los lugares del cuerpo de la 42.21 tienen su nombre del juego en los dos idiomas", () => {
    const dir = fileURLToPath(new URL("../../games/zomboid/data/site/items/", import.meta.url));
    const missing = new Set<string>();
    let worn = 0;
    for (const file of readdirSync(dir)) {
      const shard = JSON.parse(readFileSync(join(dir, file), "utf-8")) as Record<string, ItemFichaData>;
      for (const f of Object.values(shard)) {
        for (const v of f.variants) {
          if (typeof v.stats.bodyLocation !== "string") continue;
          worn++;
          const name = v.stats.bodyLocationName as { en?: string; es?: string } | undefined;
          if (!name?.en || !name.es) missing.add(v.stats.bodyLocation);
        }
      }
    }
    expect(worn).toBeGreaterThan(1000);
    expect([...missing]).toEqual([]);
  });

  it("sin el nombre del juego, el código más legible", () => {
    const v = { gameId: "Base.X", en: "X", es: "X", icon: null, type: "clothing", w: null, tags: [], stats: { bodyLocation: "calf_left" } };
    expect(statRows(v, ZOMBOID_COPY.en.items, "en", "en-US").find((r) => r.id === "body")?.value).toBe("Calf left");
  });

  it("cada «Copiar» dice qué copia", () => {
    const html = render("/es/project-zomboid/objetos/palanca");
    expect(html).toContain('aria-label="Copiar ID Base.Crowbar"');
    expect(html).toContain('aria-label="Copiar comando /additem &quot;usuario&quot; Base.Crowbar"');
    expect(html).toContain('aria-label="Copiar ID Base.CrowbarForged"');
    expect(render("/en/project-zomboid/items/crowbar")).toContain('aria-label="Copy ID Base.Crowbar"');
  });

  it("si el portapapeles no deja, no dice «¡Copiado!»: muestra el texto para copiarlo a mano", async () => {
    const shown: string[] = [];
    const refuses = { writeText: () => Promise.reject(new Error("sin permiso")) };
    expect(await copyText("Base.Crowbar", refuses, (t) => shown.push(t))).toBe(false);
    expect(shown).toEqual(["Base.Crowbar"]);
    let copied = "";
    const works = { writeText: async (t: string) => void (copied = t) };
    expect(await copyText("Base.Axe", works, (t) => shown.push(t))).toBe(true);
    expect(copied).toBe("Base.Axe");
    expect(shown).toEqual(["Base.Crowbar"]);
  });

  it("un arma de fuego dice su munición y su cargador, enlazados a sus fichas, y cuántas balas entran", async () => {
    const html = await es("m9-pistol");
    expect(html).toContain(`<dt>Munición</dt><dd><a href="${itemHref("es", "9x19mm-round")}" class="pzi-statlink">Cartucho 9x19mm</a></dd>`);
    expect(html).toContain(`<dt>Cargador</dt><dd><a href="${itemHref("es", "m9-magazine")}" class="pzi-statlink">Cargador M9</a></dd>`);
    expect(row(html, "Capacidad del cargador")).toBe("15");
    expect(html).not.toContain("Balas por carga");
    expect(row(await en("m9-pistol"), "Magazine capacity")).toBe("15");
    // Un revólver no usa cargador: las balas entran en el arma.
    const revolver = await es("patrol-revolver");
    expect(row(revolver, "Cargador")).toBeUndefined();
    expect(row(revolver, "Capacidad")).toBe("6");
    expect(revolver).toContain(`href="${itemHref("es", "357-magnum-round")}"`);
    // Y el cargador suelto, qué bala lleva y cuántas.
    const magazine = await es("m9-magazine");
    expect(magazine).toContain(`href="${itemHref("es", "9x19mm-round")}" class="pzi-statlink">Cartucho 9x19mm</a>`);
    expect(row(magazine, "Capacidad")).toBe("15");
  });

  it("un casco dice cuánto tapa la vista y el oído, como el cartel del juego (1 − el modificador)", async () => {
    const html = await es("crash-helmet-police");
    expect(row(html, "Visión impedida")).toMatch(/^25\s?%$/);
    expect(row(html, "Audición impedida")).toMatch(/^25\s?%$/);
    expect(row(await en("crash-helmet-police"), "Vision impairment")).toMatch(/^25\s?%$/);
  });

  it("filo, cansancio, alcohol y alivio del dolor, donde el objeto los tiene", async () => {
    expect(row(await es("machete"), "Afilado")).toMatch(/^100\s?%$/);
    expect(row(await es("coffee"), "Cansancio")).toBe("−50");
    expect(row(await en("coffee"), "Fatigue")).toBe("−50");
    expect(row(await es("alcohol-wipes"), "Poder desinfectante")).toBe("4");
    expect(row(await es("bandage-sterilized"), "Con alcohol")).toBe("sí");
    expect(row(await es("black-sage"), "Alivio del dolor")).toBe("7");
  });

  it("las etiquetas usan las palabras del juego, y sin género donde el objeto puede ser de cualquiera", async () => {
    const mask = await es("gas-mask");
    for (const label of ["Aislamiento", "Resistencia al viento", "Impermeabilidad"]) expect(row(mask, label), label).toBeDefined();
    for (const old of ["Abrigo", "Contra el viento", "Contra el agua"]) expect(mask).not.toContain(`<dt>${old}</dt>`);
    expect(row(await es("coffee"), "Infelicidad")).toBe("+20");
    const apple = await es("apple");
    expect(row(apple, "Se conserva")).toBe("5 días");
    expect(apple).not.toContain("Fresca durante");
  });

  it("un cero que el cartel del juego esconde tampoco se anota: el cigarrillo no dice «Hambre 0»", async () => {
    const html = await es("cigarette");
    expect(row(html, "Hambre")).toBeUndefined();
    expect(row(html, "Estrés")).toBe("−5");
  });

  it("«mismos números» sólo si hay números que comparar", async () => {
    expect(await es("bonsai-tree")).not.toContain("mismos números");
    expect(render("/es/project-zomboid/objetos/palanca")).toContain("mismos números");
  });

  it("el título lleva cuánto mide su palabra más larga, para achicarse sin cortarla", async () => {
    const em = (title: string) => wordFit(title)["--pzi-w" as keyof ReturnType<typeof wordFit>] as number;
    const html = await es("electrical-iv-telecommunications-in-the-20th-century");
    expect(html).toContain(`<h1 class="pzi-h1" style="--pzi-w:${em('"Telecomunicaciones')}">`);
    // Nunca menos de lo que mide de verdad: lo medido en el navegador con Old Standard TT negrita (2026-09-30), en em.
    const measured: [string, number][] = [
      ['"Telecomunicaciones', 9.18], ["Semitransparentes", 8.26], ["portaherramientas", 8.19], ["DESARROLLO", 7.02], ["Homemade", 4.92],
    ];
    for (const [word, real] of measured) expect(em(word), word).toBeGreaterThanOrEqual(real);
    // Las mayúsculas y la m pesan más que la cantidad de letras: "DESARROLLO" (10) es más ancha que "Tranquilizantes" (15).
    expect(em("DESARROLLO")).toBeGreaterThan(em("Tranquilizantes"));
    // Un guion deja bajar de renglón: "Chocolate-Covered" cuenta como "Chocolate-"; las tildes, como su letra.
    expect(em("Chocolate-Covered Coffee Beans")).toBe(em("Chocolate-"));
    expect(em("Electrónica")).toBe(em("Electronica"));
  });
});

describe("la carga de datos", () => {
  it("preloadItemsRoute trae lo que pide cada dirección: la ficha, o la lista si no existe", async () => {
    await preloadItemsRoute(fichaRoute("es", "axe"));
    expect(peekItem("axe")?.es).toBe("Hacha");
    await preloadItemsRoute(fichaRoute("es", "tampoco-existe"));
    expect(peekItem("tampoco-existe")).toBeNull();
  });
});

describe("la vuelta arriba de la sección", () => {
  it("un Atrás o Adelante se anota una sola vez", () => {
    expect(cameFromHistory("/es/project-zomboid/objetos")).toBe(false);
    notePop("/es/project-zomboid/objetos");
    expect(cameFromHistory("/es/project-zomboid/objetos")).toBe(true);
    expect(cameFromHistory("/es/project-zomboid/objetos")).toBe(false);
  });
});
