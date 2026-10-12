import { describe, expect, it } from "vitest";
import type { RecipeDb } from "../src/terraria/data";
import { expand, indexRecipes, isCraftable, optionsFor, size, totals } from "../src/terraria/crafting/tree";
import { knockbackTier, percent, sellCoins, speedTier } from "../src/terraria/items/stats";

/**
 * Un juego de juguete: 1 madera, 2 plataforma, 3 mineral, 4 lingote, 5 espada, 6 espada verdadera, 7 antorcha,
 * 8 y 9 se fabrican uno con el otro (ciclo largo, con 10 en el medio).
 */
const db: RecipeDb = {
  recipes: [
    [2, 2, -1, 0, [[1, 1]]], // 0: 2 plataformas con 1 madera
    [4, 1, 17, 0, [[3, 3]]], // 1: lingote con 3 minerales, en el horno
    [5, 1, 16, 0, [[4, 8], [-1, 2]]], // 2: espada con 8 lingotes y 2 de "cualquier madera", en el yunque
    [6, 1, 16, 1, [[5, 1], [7, 5]]], // 3: espada verdadera, cerca de agua
    [7, 3, -1, 0, [[1, 1]]], // 4: 3 antorchas con 1 madera
    [6, 1, 134, 0, [[4, 20]]], // 5: otra receta de la espada verdadera
    [1, 1, -1, 0, [[2, 2]]], // 6: de vuelta, madera con 2 plataformas
    [8, 1, -1, 0, [[10, 1]]], // 7
    [10, 1, -1, 0, [[9, 1]]], // 8
    [9, 1, -1, 0, [[8, 1]]], // 9
  ],
  groups: { "0": { en: "Any Wood", es: "Cualquier madera", items: [1] } },
  tiles: {},
};
const ix = indexRecipes(db);

describe("árbol de crafteo de Terraria", () => {
  it("la receta de vuelta no cuenta: la madera es un material base", () => {
    expect(ix.reverse.has(6)).toBe(true);
    expect(ix.reverse.has(0)).toBe(false);
    expect(optionsFor(ix, 1)).toEqual([]);
    expect(isCraftable(ix, 1)).toBe(false);
    expect(isCraftable(ix, 2)).toBe(true);
    const tree = expand(ix, 2, 4);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ key: 1, qty: 2, base: true, cycle: false });
  });

  it("despliega hasta los materiales base y suma los totales", () => {
    const tree = expand(ix, 6, 1);
    expect(tree.recipe).toBe(3);
    expect(tree.options).toEqual([3, 5]);
    const t = totals(ix, tree);
    // 1 espada = 8 lingotes (24 minerales) + 2 de cualquier madera; 5 antorchas = 2 tandas de 3 = 2 maderas.
    expect(Object.fromEntries(t.base)).toEqual({ 3: 24, [-1]: 2, 1: 2 });
    expect(t.base[0]).toEqual([3, 24]);
    expect(t.stations).toEqual([16, 17]);
    expect(t.flags).toBe(1);
    expect(size(tree)).toBe(7);
  });

  it("una receta que da varios se fabrica las veces que haga falta, redondeando para arriba", () => {
    const tree = expand(ix, 7, 7);
    expect(tree.crafts).toBe(3);
    expect(tree.children[0].qty).toBe(3);
    expect(expand(ix, 6, 3).children[0].qty).toBe(3);
  });

  it("el grupo es una hoja, con su clave negativa", () => {
    const sword = expand(ix, 5, 1);
    expect(sword.children[1]).toMatchObject({ key: -1, qty: 2, base: true, recipe: null });
  });

  it("se puede cambiar la receta de un objeto, y una elección que no existe se ignora", () => {
    const other = expand(ix, 6, 2, { 6: 5 });
    expect(other.recipe).toBe(5);
    expect(Object.fromEntries(totals(ix, other).base)).toEqual({ 3: 120 });
    expect(expand(ix, 6, 1, { 6: 99 }).recipe).toBe(3);
    expect(expand(ix, 6, 1, { 6: 6 }).recipe).toBe(3);
  });

  it("un ciclo largo se corta: el objeto no se despliega dos veces en su rama", () => {
    const tree = expand(ix, 8, 1);
    expect(size(tree)).toBe(4);
    const last = tree.children[0].children[0].children[0];
    expect(last).toMatchObject({ key: 8, base: true, cycle: true });
  });

  it("un objeto que no existe o no se fabrica es una hoja sola", () => {
    expect(expand(ix, 999, 1)).toMatchObject({ key: 999, base: true, recipe: null, children: [] });
    expect(isCraftable(ix, 999)).toBe(false);
  });
});

describe("cuentas del tooltip de Terraria", () => {
  it("velocidad en palabras, con los umbrales del juego", () => {
    expect([8, 9, 20, 25, 30, 35, 45, 55, 56].map(speedTier)).toEqual([0, 1, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("retroceso en palabras", () => {
    expect([0, 1.5, 3, 4, 6, 6.5, 9, 11, 12].map(knockbackTier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("el precio de venta es un quinto del valor, en monedas", () => {
    expect(sellCoins(1_000_000)).toEqual([0, 20, 0, 0]);
    expect(sellCoins(5_050_505)).toEqual([1, 1, 1, 1]);
    expect(sellCoins(0)).toEqual([0, 0, 0, 0]);
  });

  it("probabilidades cortas", () => {
    expect(percent(0.25, "en-US")).toBe("25%");
    expect(percent(0.4375, "en-US")).toBe("44%");
    expect(percent(0.005, "en-US")).toBe("0.5%");
    expect(percent(0.0667, "en-US")).toBe("6.7%");
  });
});
