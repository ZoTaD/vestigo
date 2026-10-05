import { describe, expect, it } from "vitest";
import { shouldScrollToHash } from "../src/rust/raid/hashScroll";

describe("scroll al hash de la calculadora", () => {
  it("baja en una entrada en frío con hash", () => {
    expect(shouldScrollToHash("#tabla", "navigate", false)).toBe(true);
    expect(shouldScrollToHash("#tabla", undefined, false)).toBe(true);
  });
  it("no baja sin hash, con Atrás/Adelante ni si ya bajó en esta carga", () => {
    expect(shouldScrollToHash("", "navigate", false)).toBe(false);
    expect(shouldScrollToHash("#", "navigate", false)).toBe(false);
    expect(shouldScrollToHash("#tabla", "back_forward", false)).toBe(false);
    expect(shouldScrollToHash("#tabla", "navigate", true)).toBe(false);
  });
});
