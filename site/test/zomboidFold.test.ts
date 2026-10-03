import { describe, expect, it } from "vitest";
import { fold } from "../src/zomboid/ui";
import { normalize } from "../src/zomboid/map/search";

describe("fold: una sola forma de buscar en toda la sección", () => {
  it("sin tildes, sin apóstrofos y los signos como espacio", () => {
    expect(fold("Greene's")).toBe("greenes");
    expect(fold("Camión")).toBe("camion");
    expect(fold("U-Store It")).toBe("u store it");
    expect(normalize).toBe(fold);
  });
});
