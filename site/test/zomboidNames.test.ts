import { afterEach, describe, expect, it, vi } from "vitest";
import index from "@zomboid/index.json";
import { loadPzNames, peekPzName } from "../src/zomboid/index";
import type { PzTab } from "../src/route";

/**
 * Los nombres de las fichas de Project Zomboid, uno por sección (2026-09-30): lo que baja el `<head>` de una ficha al
 * navegar en vez del `index.json` entero (143 KB con gzip). Se prueba contra el índice real, porque es de donde salen.
 */
type Entry = { sec: PzTab; id: string; en: string; es: string; via?: { en: string[]; es: string[] } };
const INDEX = index as Entry[];
const SECS = [...new Set(INDEX.map((e) => e.sec))];

describe("los módulos de nombres, uno por sección", () => {
  it("cada uno tiene exactamente las fichas de su sección, con su nombre en inglés y en español", async () => {
    // Objetos, recetas, rasgos, profesiones, habilidades, moodles y las dos subpáginas del servidor.
    expect(SECS.length).toBe(7);
    for (const sec of SECS) {
      const mod = (await import(/* @vite-ignore */ `virtual:pz-names/${sec}`)) as { default: Record<string, unknown[]> };
      const mine = INDEX.filter((e) => e.sec === sec);
      expect(Object.keys(mod.default).length, sec).toBe(mine.length);
      // Los rasgos gemelos de profesión llevan además sus profesiones, en inglés y en español.
      for (const e of mine) expect(mod.default[e.id], `${sec}/${e.id}`).toEqual(e.via ? [e.en, e.es, e.via.en, e.via.es] : [e.en, e.es]);
    }
  });

  it("los objetos traen la palanca", async () => {
    const items = (await import("virtual:pz-names/items")).default;
    expect(items.crowbar).toEqual(["Crowbar", "Palanca"]);
  });

  it("una sección que no está en el índice no resuelve (`patches` tampoco: no tiene fichas ahí)", async () => {
    for (const nope of ["virtual:pz-names/itemz", "virtual:pz-names/patches", "virtual:pz-names/map"]) {
      await expect(import(/* @vite-ignore */ nope)).rejects.toThrow();
    }
  });
});

describe("peekPzName y loadPzNames", () => {
  afterEach(() => {
    vi.doUnmock("virtual:pz-names/items");
    vi.resetModules();
  });

  it("antes de cargar la sección no hay nombre; después sí, en los dos idiomas", async () => {
    vi.resetModules();
    const m = await import("../src/zomboid/index");
    expect(m.peekPzName("items", "crowbar")).toBeNull();
    await m.loadPzNames("items");
    expect(m.peekPzName("items", "crowbar")).toEqual({ en: "Crowbar", es: "Palanca" });
  });

  it("una ficha que no existe da null, y un id que se llama como algo de Object no se confunde con un nombre", async () => {
    await loadPzNames("items");
    expect(peekPzName("items", "crowbar")).toEqual({ en: "Crowbar", es: "Palanca" });
    expect(peekPzName("items", "no-existe")).toBeNull();
    expect(peekPzName("items", "constructor")).toBeNull();
    expect(peekPzName("items", "__proto__")).toBeNull();
  });

  it("cada sección guarda sólo lo suyo: el id de un objeto no aparece entre las recetas", async () => {
    await loadPzNames("recipes");
    const receta = INDEX.find((e) => e.sec === "recipes")!;
    expect(peekPzName("recipes", receta.id)).toEqual({ en: receta.en, es: receta.es });
    expect(peekPzName("recipes", "crowbar")).toBeNull();
  });

  it("un rasgo gemelo de profesión trae sus profesiones para el <head>; el que se elige, no", async () => {
    await loadPzNames("traits");
    expect(peekPzName("traits", "keen-cook-cook2")).toEqual({
      en: "Keen Cook",
      es: "Cocinar",
      via: { en: ["Burger Flipper", "Chef"], es: ["Aprendiz de cocina", "Cocinero"] },
    });
    expect(peekPzName("traits", "keen-cook-cook")).toEqual({ en: "Keen Cook", es: "Cocinar" });
  });

  it("dos rasgos que el juego llama igual en español traen su nombre para el <head>, el mismo que el prerender", async () => {
    await loadPzNames("traits");
    expect(peekPzName("traits", "handy")?.esHead).toBe("Manitas (Handy)");
    expect(peekPzName("traits", "tinkerer")?.esHead).toBe("Manitas (Tinkerer)");
    // Los gemelos (mismo nombre en los dos idiomas) no: los distingue `via`.
    expect(peekPzName("traits", "keen-cook-cook2")?.esHead).toBeUndefined();
  });

  it("`patches` no pide nada: resuelve y no tiene nombres", async () => {
    await expect(loadPzNames("patches")).resolves.toBeUndefined();
    expect(peekPzName("patches", "42-13")).toBeNull();
  });

  it("pide la sección una sola vez por más que se llame varias", async () => {
    vi.resetModules();
    let pedidos = 0;
    vi.doMock("virtual:pz-names/items", () => {
      pedidos++;
      return { default: { crowbar: ["Crowbar", "Palanca"] } };
    });
    const m = await import("../src/zomboid/index");
    await Promise.all([m.loadPzNames("items"), m.loadPzNames("items")]);
    await m.loadPzNames("items");
    expect(pedidos).toBe(1);
  });

  it("si la sección no llega, rechaza y la próxima vez lo vuelve a intentar", async () => {
    vi.resetModules();
    vi.doMock("virtual:pz-names/items", () => {
      throw new Error("corte de red");
    });
    const m = await import("../src/zomboid/index");
    await expect(m.loadPzNames("items")).rejects.toThrow();
    expect(m.peekPzName("items", "crowbar")).toBeNull();
    vi.doMock("virtual:pz-names/items", () => ({ default: { crowbar: ["Crowbar", "Palanca"] } }));
    await m.loadPzNames("items");
    expect(m.peekPzName("items", "crowbar")).toEqual({ en: "Crowbar", es: "Palanca" });
  });
});
