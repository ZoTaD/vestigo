import { describe, expect, it } from "vitest";
import { decodePins, encodePins, MAX_HASH, pinsInHash } from "../src/valheimMap/sharePins";

describe("pines compartidos por enlace (2026-10-30)", () => {
  it("ida y vuelta, con metros redondeados", async () => {
    const pins = [{ x: 120.4, z: -3050.6, type: 1, name: "Casa" }, { x: 0, z: 0, type: 9, name: "Elder ñandú" }];
    const back = await decodePins(await encodePins(pins));
    expect(back).toEqual([{ x: 120, z: -3051, type: 1, name: "Casa" }, { x: 0, z: 0, type: 9, name: "Elder ñandú" }]);
  });
  it("un código roto da una lista vacía", async () => {
    expect(await decodePins("no-es-un-codigo")).toEqual([]);
    expect(await decodePins("")).toEqual([]);
  });
  it("200 pines entran en un enlace", async () => {
    const pins = Array.from({ length: 200 }, (_, i) => ({ x: i * 37 - 4000, z: i * -53 + 3000, type: i % 6, name: `Pin ${i}` }));
    expect((await encodePins(pins)).length).toBeLessThan(MAX_HASH);
  });
  it("lee el código del #", () => {
    expect(pinsInHash("#p=abc")).toBe("abc");
    expect(pinsInHash("")).toBeNull();
  });
});
