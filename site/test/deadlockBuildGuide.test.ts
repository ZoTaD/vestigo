import { describe, expect, it } from "vitest";
import {
  addCategory,
  removeCategory,
  updateCategory,
  moveCategory,
  moveCategoryTo,
  addToCategory,
  removeFromCategory,
  moveItem,
  encodeGuide,
  decodeGuide,
  addAbilityPoint,
  stepLabels,
  encodeAbilityPath,
  decodeAbilityPath,
  GUIDE_MAX_WIDTH,
  GUIDE_NAME_MAX,
  type GuideCategory,
} from "../src/deadlockBuildGuide";

const cat = (id: string, items: number[] = [], name = id): GuideCategory => ({ id, name, desc: "", width: 8, height: 4, items });

describe("categorías", () => {
  it("agrega una categoría vacía al final, recortando el nombre", () => {
    const g = addCategory([cat("a")], "x".repeat(60));
    expect(g).toHaveLength(2);
    expect(g[1].name).toHaveLength(GUIDE_NAME_MAX);
    expect(g[1].items).toEqual([]);
  });

  it("borra, renombra y limita el ancho", () => {
    let g = [cat("a"), cat("b")];
    g = updateCategory(g, "a", { name: "sobrevive a línea", width: 99, height: 0 });
    expect(g[0]).toMatchObject({ name: "sobrevive a línea", width: GUIDE_MAX_WIDTH, height: 2 });
    expect(removeCategory(g, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("sube y baja categorías sin salirse de los bordes", () => {
    const g = [cat("a"), cat("b"), cat("c")];
    expect(moveCategory(g, "c", -1).map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(moveCategory(g, "a", -1)).toBe(g);
  });

  it("lleva una categoría arrastrada al lugar de otra", () => {
    const g = [cat("a"), cat("b"), cat("c")];
    expect(moveCategoryTo(g, "c", "a").map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(moveCategoryTo(g, "a", "c").map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(moveCategoryTo(g, "a", "a")).toBe(g);
  });
});

describe("objetos en la guía", () => {
  it("agrega sin repetir dentro de la misma categoría", () => {
    let g = [cat("a"), cat("b")];
    g = addToCategory(g, "a", 1);
    g = addToCategory(g, "a", 1);
    g = addToCategory(g, "b", 1);
    expect(g[0].items).toEqual([1]);
    expect(g[1].items).toEqual([1]);
  });

  it("saca un objeto", () => {
    expect(removeFromCategory([cat("a", [1, 2, 3])], "a", 2)[0].items).toEqual([1, 3]);
  });

  it("reordena dentro de la misma categoría", () => {
    // Arrastrar el 1 hasta antes del 4: queda después del 3.
    expect(moveItem([cat("a", [1, 2, 3, 4])], "a", 1, "a", 3)[0].items).toEqual([2, 3, 1, 4]);
    // Y hacia adelante.
    expect(moveItem([cat("a", [1, 2, 3, 4])], "a", 4, "a", 0)[0].items).toEqual([4, 1, 2, 3]);
  });

  it("pasa un objeto de una categoría a otra", () => {
    const g = moveItem([cat("a", [1, 2]), cat("b", [9])], "a", 2, "b", 0);
    expect(g[0].items).toEqual([1]);
    expect(g[1].items).toEqual([2, 9]);
  });

  it("no duplica al pasar a una categoría que ya lo tiene", () => {
    const g = [cat("a", [1]), cat("b", [1])];
    expect(moveItem(g, "a", 1, "b", 0)).toBe(g);
  });
});

describe("la guía en el link", () => {
  it("ida y vuelta, con caracteres que podrían romper el formato", () => {
    const g: GuideCategory[] = [
      { id: "x", name: "sobrevive a línea_causa~ 2.0", desc: "que no te toquen la jalea en lane", width: 7, height: 9, items: [4053935515, 1763073141] },
      { id: "y", name: "opcionales/late", desc: "", width: 12, height: 2, items: [] },
    ];
    const d = decodeGuide(encodeGuide(g));
    expect(d.map(({ id: _id, ...c }) => c)).toEqual(g.map(({ id: _id, ...c }) => c));
  });

  it("lee links viejos sin alto", () => {
    expect(decodeGuide("8.b_x_")[0]).toMatchObject({ width: 8, height: 4, items: [11] });
  });

  it("no rompe con basura", () => {
    expect(decodeGuide("")).toEqual([]);
    expect(decodeGuide("zz.@@_%E0%A4%A_")[0]).toMatchObject({ name: "", items: [] });
  });
});

describe("orden de habilidades", () => {
  it("una habilidad lleva como mucho un desbloqueo y tres mejoras", () => {
    let p: number[] = [];
    for (let i = 0; i < 6; i++) p = addAbilityPoint(p, 7);
    expect(p).toEqual([7, 7, 7, 7]);
  });

  it("rotula desbloqueo y mejoras a 1, 2 y 5 puntos, como la grilla del juego", () => {
    expect(stepLabels([7, 8, 7, 7, 8, 7])).toEqual([null, null, 1, 2, 1, 5]);
  });

  it("viaja en el link como casillas", () => {
    const ids = [70, 80, 90, 100];
    const s = encodeAbilityPath([70, 80, 70, 100], (id) => ids.indexOf(id) + 1);
    expect(s).toBe("1214");
    expect(decodeAbilityPath(s + "9x", (slot) => ids[slot - 1])).toEqual([70, 80, 70, 100]);
  });
});
