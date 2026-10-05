import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isRsLoadingPage } from "../src/rust/loadingGuard";
import RsLoading from "../src/rust/RsLoading";

// La guardia del prerender tiene que reconocer la clase como palabra entera: ni de menos (la hoja real) ni de más.
describe("isRsLoadingPage", () => {
  it.each([
    ['class="rs-main rs-loading"', true],
    ['class="rs-loading"', true],
    ['class="rs-loading-bar"', false],
    ['class="rs-main rs-loading-bar x"', false],
    ['class="x"', false],
  ])("%s -> %s", (html, esperado) => {
    expect(isRsLoadingPage(`<div ${html}></div>`)).toBe(esperado);
  });

  it("reconoce el marcado real de RsLoading", () => {
    expect(isRsLoadingPage(renderToStaticMarkup(createElement(RsLoading, {})))).toBe(true);
  });
});
