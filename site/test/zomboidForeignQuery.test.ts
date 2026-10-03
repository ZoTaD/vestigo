import { describe, expect, it } from "vitest";
import { withForeign } from "../src/zomboid/foreignQuery";

describe("withForeign: lo de la pestaña sin perder lo ajeno", () => {
  it("conserva utm y saca las claves viejas de la pestaña", () => {
    expect(withForeign("?q=old&utm_source=x&b=y", ["q", "b"], "q=plank*2")).toBe("?q=plank*2&utm_source=x");
  });
  it("sin nada propio queda lo ajeno, y sin nada queda limpia", () => {
    expect(withForeign("?p=apocalypse&utm_source=x", ["p", "s", "i"], "")).toBe("?utm_source=x");
    expect(withForeign("?p=apocalypse", ["p", "s", "i"], "")).toBe("");
    expect(withForeign("", ["p"], "p=builder")).toBe("?p=builder");
  });
});
