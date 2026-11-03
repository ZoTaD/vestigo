import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CS2_SHARDS } from "../src/cs2/data";
import { pzShardOf } from "../src/zomboid/shard";

const DATA = new URL("../../games/cs2/data/", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, DATA), "utf-8"));

describe("datos de CS2", () => {
  it("CS2_SHARDS es CHUNKS de cs2.py", () => {
    const py = readFileSync(new URL("../../games/cs2/tools/cs2.py", import.meta.url), "utf-8");
    expect(Number(py.match(/^CHUNKS = (\d+)/m)?.[1])).toBe(CS2_SHARDS);
  });
  for (const tab of ["skins", "cases", "collections"]) {
    it(`cada ficha de ${tab} está en el archivo que dice pzShardOf`, () => {
      const files = readdirSync(new URL(`${tab}/f/`, DATA));
      expect(files.length).toBe(CS2_SHARDS);
      for (const f of files) {
        for (const slug of Object.keys(read(`${tab}/f/${f}`))) expect(`${pzShardOf(slug, CS2_SHARDS)}.json`.padStart(7, "0")).toBe(f);
      }
    });
  }
  it("cada fila de la lista tiene ficha", () => {
    const list: { slug: string }[] = read("cases/list.json");
    const all = Object.assign({}, ...readdirSync(new URL("cases/f/", DATA)).map((f) => read(`cases/f/${f}`)));
    for (const r of list) expect(all[r.slug], r.slug).toBeTruthy();
  });
});
