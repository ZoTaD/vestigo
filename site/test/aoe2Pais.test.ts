import { describe, expect, it } from "vitest";
import { paisDe } from "../src/aoe2/api/pais";

describe("país de un jugador de AoE2", () => {
  it("un pro va con el país que representa, no con el de su perfil", () => {
    expect(paisDe(208393, "it")).toBe("ar"); // Nicov
  });
  it("el resto, con lo que puso en su perfil", () => {
    expect(paisDe(1, "fr")).toBe("fr");
    expect(paisDe(1, "")).toBeNull();
  });
});
