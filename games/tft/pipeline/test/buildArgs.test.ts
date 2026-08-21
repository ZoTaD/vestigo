import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/build";

describe("parseArgs", () => {
  it("por defecto construye todo desde el disco", () => {
    expect(parseArgs([])).toEqual({ patch: "", band: "", source: "disk" });
  });

  it("reconoce un parche por su forma", () => {
    expect(parseArgs(["16.13"]).patch).toBe("16.13");
  });

  it("reconoce una banda", () => {
    expect(parseArgs(["diamond-emerald"]).band).toBe("diamond-emerald");
  });

  // La bandera empieza con guiones: sin excluirla, `args.find` la tomaba como
  // banda y el build fallaba con `unknown band "--from=pg"`.
  it("no confunde la bandera con una banda", () => {
    expect(parseArgs(["--from=pg"])).toEqual({ patch: "", band: "", source: "pg" });
  });

  // El tercer origen: leer el resumen en vez de partidas, crudas o no.
  it("reconoce --from=summary", () => {
    expect(parseArgs(["--from=summary"])).toEqual({ patch: "", band: "", source: "summary" });
  });

  it("acepta las tres cosas en cualquier orden", () => {
    expect(parseArgs(["--from=pg", "apex", "16.13"])).toEqual({
      patch: "16.13",
      band: "apex",
      source: "pg",
    });
  });
});
