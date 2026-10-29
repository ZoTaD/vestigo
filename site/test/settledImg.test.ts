import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUIET, SettledImg, watch } from "../src/SettledImg";

describe("SettledImg", () => {
  it("en el prerender va la imagen de verdad", () => {
    const html = renderToString(createElement(SettledImg, { src: "/terraria/items/406.png", width: 32, height: 32 }));
    expect(html).toContain('src="/terraria/items/406.png"');
  });
});

describe("watch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pide recién cuando el scroll queda quieto, y no pide lo que se pasó de largo", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
    let onScroll = () => {};
    let notify: (entries: { target: Element; isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal("window", { addEventListener: (_: string, fn: () => void) => (onScroll = fn) });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof notify) {
          notify = cb;
        }
        observe() {}
        unobserve() {}
      },
    );

    const a = {} as Element;
    const b = {} as Element;
    const shown: string[] = [];
    watch(a, () => shown.push("a"));
    watch(b, () => shown.push("b"));

    // Bajando rápido: las dos pasan cerca de la pantalla y `b` se va antes de que el scroll se quede quieto.
    onScroll();
    notify([{ target: a, isIntersecting: true }, { target: b, isIntersecting: true }]);
    vi.advanceTimersByTime(QUIET / 2);
    onScroll();
    notify([{ target: b, isIntersecting: false }]);
    expect(shown).toEqual([]);

    vi.advanceTimersByTime(QUIET * 2);
    expect(shown).toEqual(["a"]);
  });
});
