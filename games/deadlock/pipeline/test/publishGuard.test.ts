import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFiles } from "../src/publish-guard";

describe("changedFiles", () => {
  let root: string;
  let antes: string;
  let ahora: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dl-guard-"));
    antes = join(root, "antes");
    ahora = join(root, "ahora");
    mkdirSync(antes);
    mkdirSync(ahora);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const escribir = (dir: string, name: string, obj: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify(obj));

  /**
   * El caso que justifica todo el archivo: `generatedAt` cambia en cada corrida,
   * así que un `git diff` NUNCA da vacío. Sin esta guarda habría un commit por
   * día diciendo que la tier list se movió cuando lo único distinto es la hora.
   */
  it("no ve cambio cuando lo único distinto es generatedAt", () => {
    escribir(antes, "heroes.json", { generatedAt: "2026-07-29T00:00:00Z", heroes: [{ id: 1 }] });
    escribir(ahora, "heroes.json", { generatedAt: "2026-07-30T00:00:00Z", heroes: [{ id: 1 }] });
    expect(changedFiles(antes, ahora, ["heroes.json"])).toEqual([]);
  });

  it("ve el cambio cuando se movió un número, aunque la hora sea la misma", () => {
    escribir(antes, "heroes.json", { generatedAt: "t", heroes: [{ id: 1, winRate: 0.5 }] });
    escribir(ahora, "heroes.json", { generatedAt: "t", heroes: [{ id: 1, winRate: 0.51 }] });
    expect(changedFiles(antes, ahora, ["heroes.json"])).toEqual(["heroes.json"]);
  });

  // La primera publicación de una banda no tiene contra qué compararse, y es
  // justamente cuando hay que publicar.
  it("cuenta como cambio un archivo que antes no existía", () => {
    escribir(ahora, "heroes.phantom-above.json", { generatedAt: "t", heroes: [] });
    expect(changedFiles(antes, ahora, ["heroes.phantom-above.json"])).toEqual([
      "heroes.phantom-above.json",
    ]);
  });

  it("publica igual si lo de antes está corrupto, en vez de trabarse", () => {
    writeFileSync(join(antes, "heroes.json"), "{ esto no es json");
    escribir(ahora, "heroes.json", { generatedAt: "t", heroes: [] });
    expect(changedFiles(antes, ahora, ["heroes.json"])).toEqual(["heroes.json"]);
  });

  it("devuelve sólo los archivos que cambiaron, no todos", () => {
    escribir(antes, "a.json", { generatedAt: "1", v: 1 });
    escribir(ahora, "a.json", { generatedAt: "2", v: 1 });
    escribir(antes, "b.json", { generatedAt: "1", v: 1 });
    escribir(ahora, "b.json", { generatedAt: "2", v: 2 });
    expect(changedFiles(antes, ahora, ["a.json", "b.json"])).toEqual(["b.json"]);
  });
});
