/**
 * La pestaña Servidor de Project Zomboid (2026-10-01), el generador: el render del servidor (lo que escribe el
 * prerender) con el `server.json` real. Se renderiza la pestaña sola (`ZomboidServer`), como `zomboidMoodles.test.ts`;
 * el cableado (solapa, prerender, sitemap) lo prueba `zomboidPublish.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute, type Route } from "../src/route";
import { SERVER } from "../src/zomboid/server/data";
import { keyParts } from "../src/zomboid/server/OptionRow";
import ZomboidServer from "../src/zomboid/server/ZomboidServer";

/** La ruta de la pestaña (o de una ficha suya), armada a mano: así no depende de que esté publicada. */
const route = (lang: "en" | "es", detail?: string): Route => ({ ...parseRoute(`/${lang}/project-zomboid`), pzSection: "server", detail });
const render = (r: Route) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang: r.lang, setLang: () => undefined } },
      createElement(ZomboidServer, { route: r, navigate: () => undefined }),
    ),
  );
/** El texto sin los `<wbr>` que dejan bajar de renglón una clave larga por sus puntos. */
const plain = (html: string) => html.replace(/<wbr\/>/g, "");

describe("el generador en el servidor", () => {
  const es = render(route("es"));

  it("en español: el título, el texto con las cifras de los datos y las nueve hojas del juego", () => {
    expect(es).toMatch(/<h1 class="pzi-h1"[^>]*>Generador de servidor de Project Zomboid<\/h1>/);
    expect(es).toContain("las 269 opciones de sandbox y las 144 del servertest.ini de la Build 42.21");
    for (const name of ["Opciones de tiempo", "Zombi", "Saqueo", "Mundo", "Naturaleza", "Meta", "Personaje", "Vehículo", "Ganado"]) {
      expect(es, name).toMatch(new RegExp(`<summary[^>]*>[\\s\\S]*?${name}[\\s\\S]*?</summary>`));
    }
    expect(SERVER.pages.slice(0, 9).map((p) => p.name.es)).toEqual([
      "Opciones de tiempo", "Zombi", "Saqueo", "Mundo", "Naturaleza", "Meta", "Personaje", "Vehículo", "Ganado",
    ]);
    // Después, la hoja de las que el juego no muestra, y la del .ini con sus hojas.
    expect(es).toContain("No aparecen en el menú del juego");
    expect(es).toMatch(/<summary[^>]*>[\s\S]*?servertest\.ini[\s\S]*?<\/summary>/);
    expect(es).toContain("Copias de seguridad");
    expect(es).not.toContain("pz-loading");
    expect(es).not.toMatch(/cargando/i);
    expect(es).not.toMatch(/archivos del juego|game files|sacad[oa] de/i);
  });

  it("cada hoja abierta, con todas las filas en el HTML: las 269 de sandbox y las 144 del .ini", () => {
    expect(es.match(/<details class="[^"]*pzsv-sheet[^"]*" open="">/g)!.length).toBe(SERVER.pages.length + SERVER.iniPages.length + 1);
    expect(es.match(/class="pzsv-row[^"]*" data-key=/g)).toHaveLength(269 + 144);
    // Los subtítulos de las hojas, con el texto del juego.
    expect(es).toContain("Características de zombies");
  });

  it("la fila de Velocidad: su nombre, su clave, sus etiquetas, la ayuda y el valor de Apocalipsis", () => {
    // La fila, hasta la siguiente.
    const row = plain(es).match(/data-key="ZombieLore\.Speed">([\s\S]*?)data-key=/)?.[1] ?? "";
    expect(row).toContain("Velocidad");
    expect(row).toContain("ZombieLore.Speed");
    expect(row).toContain("Corredores");
    expect(row).toContain("Controla la velocidad de movimiento de los zombies.");
    expect(row).toContain("Por defecto (Apocalipsis): Aleatorio");
    // Las claves largas bajan de renglón por sus puntos, nunca por la mitad de una palabra.
    expect(es).toContain("ZombieConfig.<wbr/>PopulationStartMultiplier");
  });

  it("Apocalipsis viene elegido, y los cinco presets con su nombre y su descripción del juego", () => {
    expect(es).toMatch(/class="pzsv-preset is-on"[^>]*aria-pressed="true"[^>]*><b>Apocalipsis<\/b>/);
    expect(es.match(/class="pzsv-preset(?: is-on)?"/g)).toHaveLength(5);
    for (const p of SERVER.presets) expect(es, p.id).toContain(`<b>${p.name.es}</b>`);
    expect(es).toContain("Fecha de inicio: 9 de diciembre de 1993");
    // Sin cambios: nada cambiado.
    expect(es).not.toContain("is-changed");
    expect(es).toContain("Sólo lo que cambiaste (0)");
  });

  it("la barra: el nombre del servidor arma los nombres de los archivos, con descargar, copiar y el link", () => {
    expect(es).toContain('value="servertest"');
    expect(es).toContain("servertest_SandboxVars.lua");
    expect(es).toContain("servertest.ini");
    expect(es.match(/>Descargar</g)).toHaveLength(2);
    expect(es).toContain("Copiar link");
  });

  it("las notas propias: los rangos de corte, el punto de aparición en el Mapa y lo que no viaja en el link", () => {
    expect(es).toContain("En un servidor, este rango no se usa: el día lo pone WaterShutModifier.");
    expect(es).toContain("En un servidor, este rango no se usa: el día lo pone ElecShutModifier.");
    expect(es).toMatch(/Elegí el punto en el <a [^>]*href="\/es\/project-zomboid\/mapa"[^>]*>Mapa<\/a>/);
    // Las 4 secretas, más ResetID y ServerPlayerID, que tampoco viajan.
    expect(es.match(/Nunca va en el link\./g)).toHaveLength(6);
    // La IP anunciada y las dos rutas de las listas de palabras: no son secretas, pero no viajan.
    expect(es.match(/No es secreta, pero nunca va en el link/g)).toHaveLength(3);
    expect(es.match(/El servidor la sortea la primera vez/g)).toHaveLength(3);
    // En un servidor que ya existe, faltar ResetID y ServerPlayerID reinicia los personajes: lo avisan la intro y sus
    // dos filas.
    expect(es.match(/Si ya tenés un servidor/g)).toHaveLength(3);
    expect(es).toContain("los jugadores van a tener que crear otro personaje");
  });

  it("en inglés, con los textos en inglés", () => {
    const en = render(route("en"));
    expect(en).toMatch(/<h1 class="pzi-h1"[^>]*>Project Zomboid Server Settings Generator<\/h1>/);
    expect(en).toContain("all 269 sandbox options and the 144 options of servertest.ini in Build 42.21");
    expect(en).toMatch(/class="pzsv-preset is-on"[^>]*aria-pressed="true"[^>]*><b>Apocalypse<\/b>/);
    expect(plain(en)).toContain("Default (Apocalypse): Random");
    expect(en).toContain("Livestock");
    expect(en).not.toContain("Apocalipsis");
    expect(en).toMatch(/Pick the spot on the <a [^>]*href="\/en\/project-zomboid\/map"[^>]*>Map<\/a>/);
  });

  it("la ayuda del juego sin las etiquetas de formato ni las barras de la traducción", () => {
    // El juego pinta "[!] … [!]" en rojo con <BHC> y <RGB:1,1,1>: acá queda el aviso en texto.
    expect(es).not.toMatch(/&lt;(BHC|RGB:1,1,1)&gt;/);
    expect(es).toContain("[!] Se recomienda NO cambiar este parámetro. [!]");
    expect(es).toContain("la opción avanzada &quot;Multiplicador de Población&quot;.");
    // Las rutas de Mods y Map siguen con sus barras.
    expect(plain(es)).toContain("\\Steam\\steamapps\\workshop\\");
  });

  it("una página que no existe muestra el generador con el aviso", () => {
    expect(render(route("es", "no-existe"))).toContain("No encontramos esa página");
    expect(es).not.toContain("No encontramos esa página");
  });
});

describe("las claves bajan de renglón por sus límites de palabra", () => {
  it("las de sandbox por sus puntos; las del .ini, sin puntos, donde arranca otra palabra", () => {
    expect(keyParts("ZombieConfig.PopulationStartMultiplier")).toEqual(["ZombieConfig.", "PopulationStartMultiplier"]);
    expect(keyParts("RemovePlayerCorpsesOnCorpseRemoval")).toEqual(["Remove", "Player", "Corpses", "On", "Corpse", "Removal"]);
    expect(keyParts("server_browser_announced_ip")).toEqual(["server_", "browser_", "announced_", "ip"]);
    expect(keyParts("RCONPassword")).toEqual(["RCONPassword"]);
    for (const o of [...SERVER.options, ...SERVER.ini]) expect(keyParts(o.key).join(""), o.key).toBe(o.key);
  });
});

describe("las reglas de la casa en el CSS", () => {
  it("sin bordes de color: una opción cambiada se marca con tinte y texto", () => {
    const css = readFileSync(new URL("../src/styles/zomboid-server.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/border-left|border-color/);
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-all/);
    expect(css).toMatch(/\.pzsv-row\.is-changed\s*\{[^}]*background/);
  });
});
