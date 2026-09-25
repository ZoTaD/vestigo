import { describe, expect, it } from "vitest";
import { gameImgSrc, variantUrl } from "../src/GameImg";

/** Las imágenes de Deadlock al tamaño en que se dibujan (2026-09-25). */
describe("GameImg", () => {
  const card = "/deadlock/game/images/heroes/bookworm_card.webp";

  it("elige la variante más chica que cubre el ancho", () => {
    expect(variantUrl(card, 20)).toBe("/deadlock/game/w48/images/heroes/bookworm_card.webp");
    expect(variantUrl(card, 58)).toBe("/deadlock/game/w96/images/heroes/bookworm_card.webp");
    expect(variantUrl(card, 116)).toBe("/deadlock/game/w160/images/heroes/bookworm_card.webp");
  });

  it("usa la original cuando ninguna variante alcanza", () => {
    expect(variantUrl(card, 200)).toBe(card);
  });

  it("no toca lo que no es un .webp del sitio", () => {
    const bucket = "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/x.webp";
    expect(variantUrl(bucket, 20)).toBe(bucket);
    expect(variantUrl("/deadlock/game/ui/icon-soul.svg", 20)).toBe("/deadlock/game/ui/icon-soul.svg");
    expect(variantUrl("/deadlock/game/w48/images/ranks/rank09_lg.webp", 20)).toBe("/deadlock/game/w48/images/ranks/rank09_lg.webp");
  });

  it("arma el srcSet 1x/2x, y lo omite si las dos son la misma", () => {
    expect(gameImgSrc(card, 58)).toEqual({
      src: "/deadlock/game/w96/images/heroes/bookworm_card.webp",
      srcSet: "/deadlock/game/w96/images/heroes/bookworm_card.webp 1x, /deadlock/game/w160/images/heroes/bookworm_card.webp 2x",
    });
    expect(gameImgSrc(card, 20)).toEqual({ src: "/deadlock/game/w48/images/heroes/bookworm_card.webp" });
    expect(gameImgSrc(card, 280)).toEqual({ src: card });
  });

  it("cada variante que pide existe en el disco", async () => {
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const pub = fileURLToPath(new URL("../public", import.meta.url));
    for (const px of [20, 58, 116]) {
      expect(existsSync(pub + variantUrl(card, px))).toBe(true);
    }
  });
});
