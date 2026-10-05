import { describe, expect, it } from "vitest";
import { filterRows, normalize } from "../src/rust/items/filter";
import type { ListRow } from "../src/rust/items/data";

const row = (id: string, en: string, es: string | null, cat: string): ListRow => ({ id, slug: en.toLowerCase(), slugEs: (es ?? en).toLowerCase(), en, es, cat });
const rows = [row("rifle.ak", "Assault Rifle", "Fusil de asalto", "weapon"), row("explosive.timed", "Timed Explosive Charge", "Carga explosiva con temporizador", "tool"), row("cloth", "Cloth", "Tela", "resources")];

describe("el buscador y el filtro de Objetos", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(normalize("  Médica ÁRBOL ")).toBe("medica arbol");
  });
  it("busca en los dos idiomas y por shortname", () => {
    expect(filterRows(rows, null, "fusil").map((r) => r.id)).toEqual(["rifle.ak"]);
    expect(filterRows(rows, null, "assault").map((r) => r.id)).toEqual(["rifle.ak"]);
    expect(filterRows(rows, null, "explosive.timed").map((r) => r.id)).toEqual(["explosive.timed"]);
    expect(filterRows(rows, null, "c4").map((r) => r.id)).toEqual([]);
  });
  it("todas las palabras tienen que estar", () => {
    expect(filterRows(rows, null, "carga temporizador").map((r) => r.id)).toEqual(["explosive.timed"]);
  });
  it("filtra por categoría, y sin búsqueda devuelve todo lo de la categoría", () => {
    expect(filterRows(rows, "resources", "").map((r) => r.id)).toEqual(["cloth"]);
    expect(filterRows(rows, null, "").length).toBe(3);
  });
});
