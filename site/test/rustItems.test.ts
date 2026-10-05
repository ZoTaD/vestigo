import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Rust, { cameFromHistory, notePop, preloadTab } from "../src/Rust";
import { RUST_COPY } from "../src/rustCopy";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la pestaña Objetos de Rust", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/objetos"));
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
    await preloadTab(parseRoute("/en/rust/items/wood"));
    await preloadTab(parseRoute("/en/rust/items/gears"));
    await preloadTab(parseRoute("/es/rust/objetos/madera"));
    await preloadTab(parseRoute("/es/rust/objetos/engranajes"));
    await preloadTab(parseRoute("/en/rust/items/metal-fragments"));
  });

  it("la lista enlaza cada ficha con su slug en español y trae los filtros", () => {
    const html = render("es", "/es/rust/objetos");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(html).toContain(">Armas<");
    expect(html).toContain('type="search"');
    expect(html).toContain('role="group" aria-label="Categorías"');
    expect(html).not.toContain("rs-loading");
  });

  it("la pestaña ya no está apagada", () => {
    expect(render("es", "/es/rust")).toContain('href="/es/rust/objetos"');
  });

  it("la ficha del AK: nombre, comando, receta con enlaces, investigación y botín", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain("<h1");
    expect(html).toContain("Fusil de asalto");
    expect(html).toContain("inventory.give rifle.ak 1");
    expect(html).toMatch(/href="\/es\/rust\/objetos\/[^"]+"/);
    expect(html).toContain("Investigar: 120 de chatarra");
    expect(html).toContain("Caja de élite");
    // La tabla del botín dice qué es cada columna, y cada botón de copiar dice qué copia.
    expect(html).toMatch(/<thead><tr><th scope="col">Caja<\/th><th scope="col">Cantidad<\/th><th scope="col">Probabilidad<\/th><\/tr><\/thead>/);
    expect(html).toContain('aria-label="Copiar: Shortname"');
    expect(html).toContain('aria-label="Copiar: Comando para spawnearlo"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("rs-loading");
  });

  it("la madera: se usa en, y la tienda de Outpost que la vende", () => {
    const html = render("en", "/en/rust/items/wood");
    expect(html).toContain("Used in");
    expect(html).toContain('href="/en/rust/items/assault-rifle"');
    expect(html).toContain("Where to buy it");
    expect(html).toContain("Outpost");
    expect(render("es", "/es/rust/objetos/madera")).toContain("Puesto Avanzado");
  });

  it("los engranajes en las cuatro recicladoras, una fila por recicladora", () => {
    const html = render("en", "/en/rust/items/gears");
    expect(html).toContain("Red (Power Plant)");
    expect(html).toContain("Green, powered");
    expect(html).toContain("Yellow (safe zone)");
    // Roja 18 + 75 % y 15 de chatarra; verde con electricidad 15 y 12; verde 12 + 50 % y 10; amarilla 10 y 8.
    for (const s of ["× 18 + 75%", "× 15", "× 12 + 50%", "× 12", "× 10", "× 8"]) expect(html).toContain(s);
    expect(render("es", "/es/rust/objetos/engranajes")).toContain("Verde con electricidad");
  });

  it("la cuenta de la lista va en singular con un solo objeto", () => {
    expect(RUST_COPY.es.items.count(1, "1")).toBe("1 objeto");
    expect(RUST_COPY.en.items.count(1, "1")).toBe("1 item");
    expect(RUST_COPY.es.items.count(1032, "1.032")).toBe("1.032 objetos");
    expect(RUST_COPY.en.items.count(1032, "1,032")).toBe("1,032 items");
  });

  it("una ficha que no existe muestra la lista con una nota", async () => {
    await preloadTab(parseRoute("/es/rust/objetos/no-existe"));
    const html = render("es", "/es/rust/objetos/no-existe");
    expect(html).toContain("rs-missing");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
  });
});

// Volver a la lista con Atrás tiene que devolver el lugar donde estabas en la grilla, no subir arriba.
describe("Rust: Atrás y Adelante no vuelven arriba", () => {
  it("la página que llegó con Atrás o Adelante no vuelve arriba; la navegación siguiente de la app sí", () => {
    expect(cameFromHistory("/es/rust/objetos")).toBe(false);
    notePop("/es/rust/objetos");
    expect(cameFromHistory("/es/rust/objetos")).toBe(true);
    expect(cameFromHistory("/es/rust/objetos")).toBe(false);
  });

  it("un Atrás hacia otra dirección no se guarda para después", () => {
    notePop("/es");
    expect(cameFromHistory("/es/rust/objetos/fusil-de-asalto")).toBe(false);
    expect(cameFromHistory("/es")).toBe(false);
  });

  it("los fragmentos de metal: las primeras 20 filas a la vista y el resto adentro de un details, todo en el HTML", () => {
    const html = render("en", "/en/rust/items/metal-fragments");
    expect(html).toContain("Recycled from");
    const at = html.indexOf("<details");
    expect(at).toBeGreaterThan(0);
    expect(html).toMatch(/<summary[^>]*>Show the other 314<\/summary>/);
    const rows = (h: string) => h.match(/<tr>.*?<\/tr>/g) ?? [];
    const section = html.slice(html.indexOf("Recycled from"));
    const afuera = rows(section.slice(0, section.indexOf("<details")));
    const adentro = rows(section.slice(section.indexOf("<details"), section.indexOf("</details>")));
    // 20 de datos más el encabezado afuera; el resto (más su encabezado) adentro.
    expect(afuera.filter((r) => r.includes("<td>")).length).toBe(20);
    expect(adentro.filter((r) => r.includes("<td>")).length).toBe(314);
    // La puerta de garaje da 300 por unidad: 150 en la verde, 120 en la amarilla. Está entre las primeras 20.
    const garage = afuera.find((r) => r.includes('href="/en/rust/items/garage-door"'));
    expect(garage).toMatch(/<td>× 150<\/td><td>× 120<\/td>/);
    // Una de las que quedan después del puesto 20 sigue en el HTML, adentro del details.
    const ultima = adentro.filter((r) => r.includes("<td>")).at(-1)!;
    expect(afuera).not.toContain(ultima);
  });

});
