/**
 * El crédito a The Indie Stone es una condición de su licencia (§2.2 de sus términos) para usar el arte del juego: si
 * alguien toca el pie de página y se cae, el sitio queda incumpliendo sin que nada avise. Se renderiza la app entera
 * con la misma entrada que usa el build (`renderApp`), no el componente suelto, porque el crédito vive en el pie de
 * `App` y no en la sección.
 */
import { describe, expect, it } from "vitest";
import { renderApp } from "../src/entry-server";
import { parseRoute } from "../src/route";

const CREDIT = "Thanks to The Indie Stone for creating Project Zomboid";
const TERMS = 'href="https://projectzomboid.com/blog/support/terms-conditions/"';
const SITE = 'href="https://projectzomboid.com/"';

describe("el crédito a The Indie Stone en el pie de Zomboid", () => {
  it("está en español, con sus dos enlaces, el idioma marcado y el aviso de que no hay afiliación", async () => {
    const html = await renderApp(parseRoute("/es/project-zomboid"));
    expect(html).toContain(CREDIT);
    expect(html).toContain(TERMS);
    expect(html).toContain(SITE);
    // La fórmula está en inglés en los dos idiomas: hay que marcarlo para los lectores de pantalla.
    expect(html).toMatch(/<p class="foot-sources" lang="en">Thanks to The Indie Stone/);
    expect(html).toContain("Vestigo es un sitio de fans y no está avalado por The Indie Stone");
  });

  it("está igual en inglés, con el aviso en inglés", async () => {
    const html = await renderApp(parseRoute("/en/project-zomboid"));
    expect(html).toContain(CREDIT);
    expect(html).toContain(TERMS);
    expect(html).toContain(SITE);
    expect(html).toContain('lang="en"');
    expect(html).toContain("Vestigo is a fan site and isn&#x27;t endorsed by or affiliated with The Indie Stone");
  });

  it("no aparece en las páginas de otros juegos", async () => {
    const html = await renderApp(parseRoute("/es/valheim"));
    expect(html).not.toContain(CREDIT);
    expect(html).not.toContain("projectzomboid.com");
  });
});
