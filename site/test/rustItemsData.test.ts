import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pzShardOf } from "../src/zomboid/shard";
import { loadItem, loadList, peekItem, peekList, RUST_SHARDS, say } from "../src/rust/items/data";

const DIR = join(__dirname, "../../games/rust/data/site/items");

describe("los datos de Objetos de Rust", () => {
  it("cada ficha vive en el archivo que dice el sitio (el mismo hash que site_data.py)", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(RUST_SHARDS);
    for (const f of files) {
      const shard = JSON.parse(readFileSync(join(DIR, f), "utf-8")) as Record<string, unknown>;
      for (const slug of Object.keys(shard)) expect(`${pzShardOf(slug, RUST_SHARDS)}.json`).toBe(f);
    }
  });

  it("la lista y una ficha se cargan una vez y quedan para el primer render", async () => {
    expect(peekList()).toBeNull();
    const list = await loadList();
    expect(peekList()).toBe(list);
    expect(list.rows.length).toBeGreaterThan(1000);
    expect(peekItem("assault-rifle")).toBeUndefined();
    const ak = await loadItem("assault-rifle");
    expect(ak?.id).toBe("rifle.ak");
    expect(peekItem("assault-rifle")).toBe(ak);
    expect(await loadItem("no-existe")).toBeNull();
    expect(await loadItem("constructor")).toBeNull();
  });

  it("say cae al inglés si no hay español", () => {
    expect(say({ en: "Ice AK", es: null }, "es")).toBe("Ice AK");
    expect(say({ en: "Wood", es: "Madera" }, "es")).toBe("Madera");
    expect(say({ en: "Wood", es: "Madera" }, "en")).toBe("Wood");
  });
});
