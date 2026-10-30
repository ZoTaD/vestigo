import { describe, expect, it } from "vitest";
import progress from "@valheim/progress.json";
import { currentBiome, doneByCharacter, type BiomeTasks } from "../src/valheimProgress/data";

const biomes = progress as unknown as BiomeTasks[];

describe("Mi partida (2026-10-30)", () => {
  it("tilda por estación, material visto y trofeo", () => {
    const meadows = biomes[0];
    const bench = meadows.tasks.find((t) => t.kind === "station")!;
    const wood = meadows.tasks.find((t) => t.kind === "material")!;
    const boss = meadows.tasks.find((t) => t.kind === "boss")!;
    const done = doneByCharacter(biomes, {
      knownRecipes: [], knownStations: { [bench.key!]: 1 }, knownMaterials: [wood.key!], trophies: [boss.key!], skills: {},
    });
    expect(done.has(bench.id)).toBe(true);
    expect(done.has(wood.id)).toBe(true);
    expect(done.has(boss.id)).toBe(true);
    expect(done.size).toBe(3);
  });
  it("por dónde vas: el primer bioma con algo pendiente", () => {
    expect(currentBiome(biomes, new Set())).toBe("meadows");
    const all = new Set(biomes[0].tasks.map((t) => t.id));
    expect(currentBiome(biomes, all)).toBe("blackforest");
  });
});
