/**
 * La pestaña Rasgos de Project Zomboid (2026-09-30): la lista de rasgos y profesiones (`/rasgos`), la de profesiones
 * (`/profesiones`) y las fichas de cada rasgo y cada profesión, con los datos reales de
 * `games/zomboid/data/site/{traits,professions}.json`. Se renderiza la pestaña sola (`ZomboidTraits`), como
 * `zomboidRecipes.test.ts`; el cableado (solapa, prerender, sitemap) lo prueba `zomboidPublish.test.ts`. Rasgos y
 * Profesiones se dan por publicadas mientras corre el archivo, porque `parseRoute` manda una pestaña sin publicar a la
 * portada.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import pzIndex from "../../games/zomboid/data/index.json";
import professions from "../../games/zomboid/data/site/professions.json";
import traits from "../../games/zomboid/data/site/traits.json";
import { LangContext } from "../src/i18n";
import { parseRoute, PZ_PUBLISHED, routePath, type PzTab, type Route } from "../src/route";
import { traitGroup, type Trait } from "../src/zomboid/traits/data";
import ZomboidTraits from "../src/zomboid/traits/ZomboidTraits";

const TABS: PzTab[] = ["traits", "professions", "recipes"];
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

const renderRoute = (route: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: route.lang, setLang: () => undefined } },
      createElement(ZomboidTraits, { route, navigate: () => undefined }),
    ),
  );
const render = (path: string) => renderRoute(parseRoute(path));
const base = (lang: "en" | "es") => parseRoute(`/${lang}/project-zomboid`);
/** La dirección de una ficha, con el slug de su idioma (el que arma el build). */
const href = (lang: "en" | "es", sec: PzTab, id?: string) => routePath({ ...base(lang), pzSection: sec, detail: id });
const ficha = (lang: "en" | "es", sec: "traits" | "professions", id: string) => render(href(lang, sec, id));
/** El HTML de una hoja de la ficha por su clase (`pzt-boosts`, `pzt-exclusive`…). */
const sheet = (html: string, cls: string): string => {
  const m = html.match(new RegExp(`<section class="[^"]*\\b${cls}\\b[^"]*">([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`no está la hoja ${cls}`);
  return m[1];
};
/** Los enlaces distintos a fichas de una sección (`/es/project-zomboid/rasgos/…`). */
const links = (html: string, lang: "en" | "es", sec: PzTab) =>
  new Set([...html.matchAll(new RegExp(`href="(${href(lang, sec)}/[^"]+)"`, "g"))].map((m) => m[1]));

const TRAITS = traits as unknown as Trait[];
const INDEX = pzIndex as { sec: string; id: string }[];

describe("la lista de rasgos y profesiones", () => {
  it("en español tiene un <a> por cada rasgo (97) y por cada profesión (25), con su texto", () => {
    const html = render("/es/project-zomboid/rasgos");
    expect(TRAITS).toHaveLength(97);
    expect(professions).toHaveLength(25);
    expect(links(html, "es", "traits").size).toBe(97);
    expect(links(html, "es", "professions").size).toBe(25);
    expect(href("es", "traits", "cowardly")).toBe("/es/project-zomboid/rasgos/cobarde");
    expect(html).toContain(`href="${href("es", "traits", "cowardly")}"`);
    expect(html).toContain(`href="${href("es", "professions", "burglar")}"`);
    // El texto que lee Google, con cuántos hay de cada cosa.
    const n = (g: string) => TRAITS.filter((t) => traitGroup(t) === g).length;
    expect([n("positive"), n("negative"), n("granted")]).toEqual([49, 32, 16]);
    expect(html).toContain("25 profesiones, 49 rasgos positivos, 32 negativos y 16 que no se eligen al crear el personaje");
    // Las cuatro hojas, y el buscador.
    for (const h of ["Profesiones", "Rasgos positivos", "Rasgos negativos", "No se eligen al crear el personaje"]) expect(html).toContain(h);
    expect(html).toMatch(/<input type="search"/);
  });

  it("cada rasgo lleva su ícono, sus puntos como los muestra el juego y una línea de qué hace", () => {
    const html = render("/es/project-zomboid/rasgos");
    // Valiente cuesta 4 (−4 a tus puntos); Cobarde da 2 (+2).
    expect(html).toMatch(/Valiente<\/span><b class="pzt-cost[^"]*">−4<\/b>/);
    expect(html).toMatch(/Cobarde<\/span><b class="pzt-cost[^"]*">\+2<\/b>/);
    expect(html).toContain("Especialmente propenso a entrar en pánico.");
    // Un rasgo sin descripción muestra las habilidades que sube, como el juego.
    expect(html).toMatch(/Pescador<\/span>[\s\S]{0,200}Pesca \+1/);
    // Una descripción con `<br>` se lee de corrido, sin la etiqueta escapada.
    expect(html).not.toContain("&lt;br&gt;");
    expect(html).toMatch(/<img[^>]*src="\/zomboid\/traits\/trait_brave\.webp"/);
    // Los dos íconos del juego con espacios en el nombre van escapados.
    expect(html).toContain('src="/zomboid/traits/trait_out%20of%20shape.webp"');
    // Las profesiones: ícono, puntos y las habilidades que suben.
    expect(html).toMatch(/<img[^>]*src="\/zomboid\/professions\/profession_burglar2\.webp"/);
    expect(html).toMatch(/Ladrón<\/span><b class="pzt-cost[^"]*">−6<\/b>/);
    expect(html).toContain("Destreza +2 · Sigilo +2 · Pies ligeros +2");
    expect(html).toMatch(/Desempleado<\/span><b class="pzt-cost[^"]*">\+8<\/b>/);
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("/en/project-zomboid/traits");
    expect(links(html, "en", "traits").size).toBe(97);
    expect(links(html, "en", "professions").size).toBe(25);
    expect(html).toContain('href="/en/project-zomboid/traits/cowardly"');
    expect(html).toContain('href="/en/project-zomboid/professions/burglar"');
    expect(html).toContain("25 professions, 49 positive traits, 32 negative ones and 16 you can");
    expect(html).toContain("Especially prone to becoming panicked.");
    expect(html).toContain("Nimble +2 · Sneaking +2 · Lightfooted +2");
    expect(html).not.toContain("Cobarde");
  });

  it("un rasgo que no existe muestra la lista con la nota", () => {
    const html = render("/es/project-zomboid/rasgos/esto-no-existe");
    expect(html).toContain("No encontramos ese rasgo");
    expect(links(html, "es", "traits").size).toBe(97);
    expect(render("/en/project-zomboid/traits/nope")).toContain("We couldn&#x27;t find that trait");
  });
});

describe("la lista de profesiones", () => {
  it("es una página de verdad: las 25 profesiones, su texto y el enlace a los rasgos", () => {
    const html = render("/es/project-zomboid/profesiones");
    expect(html).toContain("Profesiones de Project Zomboid");
    expect(html).toContain("Las 25 profesiones de Project Zomboid Build");
    expect(links(html, "es", "professions").size).toBe(25);
    // Los rasgos están en su página: acá sólo el enlace a la lista.
    expect(links(html, "es", "traits").size).toBe(0);
    expect(html).toContain('href="/es/project-zomboid/rasgos"');
    const en = render("/en/project-zomboid/professions");
    expect(en).toContain("Project Zomboid Professions");
    expect(links(en, "en", "professions").size).toBe(25);
  });

  it("una profesión que no existe muestra la lista de profesiones con la nota", () => {
    const html = render("/es/project-zomboid/profesiones/esto-no-existe");
    expect(html).toContain("No encontramos esa profesión");
    expect(links(html, "es", "professions").size).toBe(25);
  });
});

describe("la ficha de un rasgo", () => {
  it("Ladrón: la descripción del juego, sólo de profesión, y la profesión que lo trae", () => {
    const html = ficha("es", "traits", "burglar");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Ladrón<\/h1>/);
    expect(html).toContain("en inglés: Burglar");
    expect(html).toContain("Puede puentear vehículos, menos posibilidades de romper la cerradura de una ventana.");
    expect(html).toContain("sólo de profesión");
    expect(html).toContain("No se elige al crear el personaje");
    expect(sheet(html, "pzt-by-profession")).toContain(`href="${href("es", "professions", "burglar")}"`);
    expect(href("es", "professions", "burglar")).toBe("/es/project-zomboid/profesiones/ladron");
    // La vuelta a la lista.
    expect(html).toContain('href="/es/project-zomboid/rasgos"');
  });

  it("Burglar en inglés", () => {
    const html = ficha("en", "traits", "burglar");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Burglar<\/h1>/);
    expect(html).toContain("in Spanish: Ladrón");
    expect(html).toContain("Can hotwire vehicles. Less chance of breaking window locks.");
    expect(html).toContain("profession only");
    expect(sheet(html, "pzt-by-profession")).toContain('href="/en/project-zomboid/professions/burglar"');
  });

  it("Cobarde: rasgo negativo que da 2 puntos, y con qué no se combina (enlaces)", () => {
    const html = ficha("es", "traits", "cowardly");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Cobarde<\/h1>/);
    expect(html).toContain("Rasgo negativo");
    expect(html).toContain("Especialmente propenso a entrar en pánico.");
    expect(html).toMatch(/<b[^>]*>\+2<\/b>/);
    expect(html).toContain("Te da 2 puntos");
    const ex = sheet(html, "pzt-exclusive");
    for (const id of ["adrenaline-junkie", "brave", "desensitized"]) expect(ex).toContain(`href="${href("es", "traits", id)}"`);
    expect(ex).toContain("Valiente");
    expect(html).not.toContain("sólo de profesión");
  });

  it("Cowardly en inglés", () => {
    const html = ficha("en", "traits", "cowardly");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Cowardly<\/h1>/);
    expect(html).toContain("Negative trait");
    expect(html).toContain("Gives you 2 points");
    expect(sheet(html, "pzt-exclusive")).toContain('href="/en/project-zomboid/traits/brave"');
  });

  it("Valiente cuesta 4 puntos", () => {
    const html = ficha("es", "traits", "brave");
    expect(html).toMatch(/<b[^>]*>−4<\/b>/);
    expect(html).toContain("Cuesta 4 puntos");
    expect(html).toContain("Rasgo positivo");
  });

  it("Pescador: las habilidades que sube y las recetas que da, con enlaces a Recetas", () => {
    const html = ficha("es", "traits", "angler");
    const boosts = sheet(html, "pzt-boosts");
    expect(boosts).toMatch(/Pesca[\s\S]{0,40}\+1/);
    const recipes = sheet(html, "pzt-recipes");
    for (const id of ["make-fishing-rod", "fix-fishing-rod", "make-chum-base"]) expect(recipes).toContain(`href="${href("es", "recipes", id)}"`);
  });

  it("los rasgos que se traen entre sí: Metabolismo lento trae Sobrepeso, y Sobrepeso lo dice", () => {
    const slow = ficha("es", "traits", "slow-metabolism");
    expect(sheet(slow, "pzt-grants")).toContain(`href="${href("es", "traits", "high-weight")}"`);
    const high = ficha("es", "traits", "high-weight");
    expect(sheet(high, "pzt-by-trait")).toContain(`href="${href("es", "traits", "slow-metabolism")}"`);
    // Una habilidad que baja va con su signo.
    expect(sheet(high, "pzt-boosts")).toMatch(/Estado físico[\s\S]{0,40}−1/);
  });
});

describe("la ficha de una profesión", () => {
  it("Ladrón: puntos, habilidades iniciales, rasgo gratis, recetas y pueblos", () => {
    const html = ficha("es", "professions", "burglar");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Ladrón<\/h1>/);
    expect(html).toContain("Profesión");
    expect(html).toMatch(/<b[^>]*>−6<\/b>/);
    expect(html).toContain("Cuesta 6 puntos");
    const boosts = sheet(html, "pzt-boosts");
    for (const s of ["Destreza", "Sigilo", "Pies ligeros"]) expect(boosts).toMatch(new RegExp(`${s}[\\s\\S]{0,40}\\+2`));
    expect(sheet(html, "pzt-free")).toContain(`href="${href("es", "traits", "burglar")}"`);
    expect(links(sheet(html, "pzt-recipes"), "es", "recipes").size).toBe(13);
    const towns = sheet(html, "pzt-towns");
    for (const t of ["Muldraugh, KY", "Riverside, KY", "Rosewood, KY", "West Point, KY"]) expect(towns).toContain(t);
    expect(html).toContain('href="/es/project-zomboid/profesiones"');
    // El botón al planificador, con Ladrón elegido (llegó con la pestaña Personaje; lo prueba zomboidPlanner.test.ts).
    expect(html).toContain('href="/es/project-zomboid/personaje?b=burglar"');
  });

  it("Burglar en inglés", () => {
    const html = ficha("en", "professions", "burglar");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Burglar<\/h1>/);
    expect(html).toContain("in Spanish: Ladrón");
    expect(html).toContain("Costs 6 points");
    expect(sheet(html, "pzt-boosts")).toContain("Nimble");
    expect(sheet(html, "pzt-free")).toContain('href="/en/project-zomboid/traits/burglar"');
  });

  it("Desempleado: da 8 puntos, sin habilidades de más, sin ícono, y los 11 pueblos", () => {
    const html = ficha("es", "professions", "custom-occupation");
    expect(html).toMatch(/<h1 class="pzi-h1"[^>]*>Desempleado<\/h1>/);
    expect(html).toMatch(/<b[^>]*>\+8<\/b>/);
    expect(html).toContain("Te da 8 puntos para rasgos");
    expect(sheet(html, "pzt-boosts")).toContain("Sin habilidades de más");
    expect(sheet(html, "pzt-towns").match(/, KY/g)).toHaveLength(11);
  });
});

describe("los enlaces cruzados", () => {
  const ids = (sec: string) => new Set(INDEX.filter((e) => e.sec === sec).map((e) => e.id));
  const known: Record<string, Set<string>> = { traits: ids("traits"), professions: ids("professions"), recipes: ids("recipes") };

  it.each(["es", "en"] as const)("cada enlace de cada ficha (%s) lleva a una ficha que existe", (lang) => {
    const fichas = [
      ...TRAITS.map((t) => ({ sec: "traits" as const, id: t.id })),
      ...professions.map((p) => ({ sec: "professions" as const, id: p.id })),
    ];
    let seen = 0;
    for (const f of fichas) {
      const html = ficha(lang, f.sec, f.id);
      expect(html, f.id).toMatch(/<h1 class="pzi-h1"/);
      for (const m of html.matchAll(/href="(\/(?:en|es)\/project-zomboid\/[^"/]+\/[^"]+)"/g)) {
        const route = parseRoute(m[1]);
        const sec = route.pzSection!;
        expect(Object.keys(known), m[1]).toContain(sec);
        expect(known[sec].has(route.detail!), `${f.id} → ${m[1]}`).toBe(true);
        expect(routePath(route)).toBe(m[1]);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(500);
  });

  it("un rasgo y la profesión que lo trae se enlazan de ida y de vuelta", () => {
    for (const p of professions) {
      for (const t of p.traits) {
        expect(sheet(ficha("es", "professions", p.id), "pzt-free")).toContain(`href="${href("es", "traits", t.id)}"`);
        expect(sheet(ficha("es", "traits", t.id), "pzt-by-profession")).toContain(`href="${href("es", "professions", p.id)}"`);
      }
    }
  });
});

describe("después de la revisión", () => {
  const twins = TRAITS.filter((t) => t.twin);

  it("los seis rasgos gemelos (el que se elige y el de profesión) se enlazan entre sí desde la cabecera", () => {
    expect(twins).toHaveLength(12);
    for (const t of twins) {
      const other = TRAITS.find((x) => x.id === t.twin!.id)!;
      expect(other.twin?.id, t.id).toBe(t.id);
      expect(other.en, t.id).toBe(t.en);
      expect(other.professionOnly, t.id).toBe(!t.professionOnly);
      for (const lang of ["en", "es"] as const) {
        const row = ficha(lang, "traits", t.id).match(/<p class="pzt-twin">([\s\S]*?)<\/p>/)?.[1] ?? "";
        expect(row, `${lang} ${t.id}`).toContain(`href="${href(lang, "traits", other.id)}"`);
      }
    }
    // El que se elige enlaza al de profesión con la marca, y el de profesión al otro con su nombre llano.
    const pick = ficha("es", "traits", "blacksmith-knowledge-blacksmith");
    expect(pick).toContain("Una profesión también lo trae");
    expect(pick).toContain("Herrería (de profesión)");
    expect(ficha("en", "traits", "blacksmith-knowledge-blacksmith2")).toContain("also one you pick when you create your character");
  });

  it("lo que una profesión sabe sin ser receta va como texto, con el nombre del juego", () => {
    const mech = sheet(ficha("es", "professions", "mechanic"), "pzt-recipes");
    for (const name of ["Mecánica básica", "Mecánica intermedia", "Mecánica avanzada"]) expect(mech).toContain(`<li>${name}</li>`);
    expect(mech).toContain("<small>3</small>");
    expect(sheet(ficha("en", "professions", "mechanic"), "pzt-recipes")).toContain("<li>Basic Mechanics</li>");
    expect(sheet(ficha("es", "professions", "electrician"), "pzt-recipes")).toContain("<li>Generador</li>");
    expect(sheet(ficha("en", "professions", "electrician"), "pzt-recipes")).toContain("<li>Generator Maintenance</li>");
    // Granjero: 8 recetas con enlace y 55 temporadas de cultivo como texto.
    const farmer = sheet(ficha("es", "professions", "farmer"), "pzt-recipes");
    expect(farmer).toContain("<small>63</small>");
    expect(farmer).toContain("<li>Temporada de cultivo de zanahoria</li>");
    expect(farmer).not.toMatch(/<a[^>]*>[^<]*Temporada de cultivo/);
    // Y en los rasgos: Mecánico aficionado sabe la básica y la intermedia.
    const amateur = sheet(ficha("en", "traits", "vehicle-knowledge-mechanics"), "pzt-recipes");
    expect(amateur).toContain("<li>Basic Mechanics</li>");
    expect(amateur).toContain("<li>Intermediate Mechanics</li>");
  });

  it("dos enlaces con el mismo nombre se distinguen (dos recetas «Forjar bandeja de horno» en Herrería)", () => {
    const recipes = sheet(ficha("es", "traits", "blacksmith-knowledge-blacksmith"), "pzt-recipes");
    expect(recipes).toContain("Forjar bandeja de horno (Forge Baking Tray)");
    expect(recipes).toContain("Forjar bandeja de horno (Forge Roasting Pan)");
    // Un nombre que no choca queda como está.
    expect(recipes).not.toMatch(/Forjar sartén \(/);
  });
});
