/**
 * `LazyRows` (2026-10-06): en el navegador dibuja las listas largas de a tandas; en el prerender (sin `window`) tiene que
 * dibujar **todas** las filas, porque el HTML servido es lo que leen Google y los que comparten un link.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyRows } from "../src/LazyRows";

const items = Array.from({ length: 250 }, (_, i) => `fila-${i}`);
const li = (s: string) => createElement("li", { key: s }, s);

describe("LazyRows en el prerender", () => {
  it("dibuja todas las filas, en orden, sin bloques vacíos", () => {
    const html = renderToStaticMarkup(createElement("ul", null, createElement(LazyRows<string>, { items, render: li, rowHeight: 40, chunk: 60, tag: "li" })));
    expect(html.match(/<li>/g)).toHaveLength(250);
    expect(html.indexOf("fila-0<")).toBeLessThan(html.indexOf("fila-249<"));
    expect(html).not.toContain("aria-hidden");
  });

  it("en una tabla también", () => {
    const tr = (s: string) => createElement("tr", { key: s }, createElement("td", null, s));
    const html = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement(LazyRows<string>, { items, render: tr, rowHeight: 49, tag: "tr" }))));
    expect(html.match(/<tr>/g)).toHaveLength(250);
  });
});
