import { describe, it, expect } from "vitest";
import { setOptions, publishedSet, archivedSets, isArchivedSet } from "../src/sets";
import { datasetFor, LIVE } from "../src/data";
import catalogJson from "@data/catalog.json";
import setsIndex from "@data/sets/index.json";

describe("the set picker's options", () => {
  it("reads the published set from the catalog rather than a constant", () => {
    expect(publishedSet()).toBe(Number((catalogJson as { set: string }).set));
  });

  // Lo que esto protege no cambió: no se puede elegir un set del que no
  // tenemos números. Lo que cambió es que ahora hay dos clases que sí los
  // tienen —el vigente y los que se congelaron— y antes había una sola.
  it("only offers sets we actually hold numbers for", () => {
    const seleccionables = setOptions()
      .filter((o) => o.available)
      .map((o) => o.number)
      .sort((a, b) => a - b);
    const esperados = [publishedSet(), ...archivedSets().map((s) => s.number)]
      .filter((n, i, all) => all.indexOf(n) === i)
      .sort((a, b) => a - b);
    expect(seleccionables).toEqual(esperados);
  });

  // A stats site that says nothing about the set everyone is about to play
  // reads as abandoned in exactly the weeks people look hardest.
  it("shows the next set as coming, and not selectable", () => {
    const next = setOptions().find((o) => o.number === publishedSet() + 1);
    expect(next).toBeDefined();
    expect(next!.available).toBe(false);
  });

  // Derived rather than listed, so 18 -> 19 needs no edit here.
  it("follows the catalog forward instead of naming a set", () => {
    const archivados = archivedSets()
      .map((s) => s.number)
      .filter((n) => n !== publishedSet());
    expect(setOptions().map((o) => o.number)).toEqual(
      [...archivados, publishedSet(), publishedSet() + 1].sort((a, b) => a - b)
    );
  });
});

/**
 * Los sets archivados. Hoy no hay ninguno —el Set 17 sigue vivo— así que lo que
 * se puede probar es que el camino existe y que la ausencia no rompe nada, que
 * es justamente lo que va a estar en producción hasta fines de agosto.
 */
describe("archived sets", () => {
  it("reads the index the pipeline writes, and survives it being empty", () => {
    expect(archivedSets()).toEqual((setsIndex as { sets: unknown[] }).sets);
  });

  it("offers every archived set alongside the live one, oldest first", () => {
    const numeros = setOptions().map((o) => o.number);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
    for (const s of archivedSets()) expect(numeros).toContain(s.number);
  });

  it("marks archived options as archived and the live one as not", () => {
    const vivo = setOptions().find((o) => o.number === publishedSet());
    expect(vivo?.archived).toBe(false);
    for (const o of setOptions().filter((x) => x.archived)) {
      expect(isArchivedSet(o.number)).toBe(true);
    }
  });

  // Un set archivado se elige; nunca es lo primero que alguien ve.
  it("does not report the live set as archived", () => {
    expect(isArchivedSet(publishedSet())).toBe(false);
  });

  // El aviso de "estos números son finales" cuelga de esta bandera, así que la
  // vista en vivo no puede traerla encendida por accidente.
  it("leaves the live dataset unflagged, so the frozen notice never shows on it", () => {
    expect(datasetFor("global", LIVE).archived).toBe(false);
    expect(datasetFor("global").archived).toBe(false);
  });
});
