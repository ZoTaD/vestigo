/**
 * Las piezas puras de la pestaña Parches de Project Zomboid (2026-10-02): de slug a versión, la etiqueta de cada campo,
 * cada valor, los renglones de receta, si un número sube o baja, el resumen automático y la clave cruda partida en sus
 * puntos.
 */
import { describe, expect, it } from "vitest";
import { autoLede, direction, fieldLabel, firstCounts, formatValue, rawKey, recipeLine } from "../src/zomboid/patches/fields";
import { pzPatchName, pzPatchVersion } from "../src/zomboid/patches/slug";

describe("pzPatchVersion", () => {
  it("lee los slugs de versión", () => {
    expect(pzPatchVersion("42-21")).toBe("42.21");
    expect(pzPatchVersion("42-21-1")).toBe("42.21.1");
    expect(pzPatchVersion("42-22-b3")).toBe("42.22 (build 3)");
    expect(pzPatchVersion("palanca")).toBeNull();
  });

  it("el nombre para el <head> sólo si la versión tiene página", () => {
    expect(pzPatchName("42-21")).toBe("42.21");
    expect(pzPatchName("41-78")).toBeNull();
    expect(pzPatchName("index")).toBeNull();
  });
});

describe("fieldLabel", () => {
  it("nombra los campos conocidos y los de patrón con la habilidad del juego", () => {
    expect(fieldLabel("items", "stats.maxDamage", "es")).toBe("Daño máximo");
    expect(fieldLabel("recipes", "skills.Woodwork", "es")).toBe("Nivel de Carpintería");
    expect(fieldLabel("recipes", "xp.Woodwork", "en")).toBe("Carpentry XP");
    expect(fieldLabel("traits", "xpBoosts.Strength", "es")).toBe("Bonificación de Fuerza");
    expect(fieldLabel("skills", "xp.3", "es")).toBe("XP para el nivel 4");
    expect(fieldLabel("moodles", "levels.1.name", "es")).toBe("Nombre del nivel 1");
    expect(fieldLabel("sandbox", "default", "es")).toBe("Valor por defecto");
    expect(fieldLabel("recipes", "inputs", "es")).toBe("Ingredientes y herramientas");
  });

  it("da null para lo que no conoce (la página muestra la clave cruda)", () => {
    expect(fieldLabel("items", "stats.fooBar", "en")).toBeNull();
    expect(fieldLabel("items", "constructor", "en")).toBeNull();
  });
});

describe("formatValue", () => {
  it("formatea números, sí/no, nada y nombres", () => {
    expect(formatValue(2.2, {}, "es", "es-AR")).toBe("2,2");
    expect(formatValue(true, {}, "es", "es-AR")).toBe("sí");
    expect(formatValue(false, {}, "en", "en-US")).toBe("no");
    expect(formatValue(null, {}, "es", "es-AR")).toBe("—");
    expect(formatValue("Base.Plank", { "Base.Plank": { en: "Plank", es: "Tablón" } }, "es", "es-AR")).toBe("Tablón");
    expect(formatValue("base:axe", {}, "es", "es-AR")).toBe("base:axe");
  });
});

describe("recipeLine", () => {
  it("pasa cada alternativa a su nombre, con etiquetas y lo que se conserva", () => {
    const names = { "Base.Nails": { en: "Nails", es: "Clavos" }, "Base.Screws": { en: "Screws", es: "Tornillos" } };
    expect(recipeLine("2× Base.Nails|Base.Screws keep", names, "es")).toBe("2× Clavos o Tornillos (se conserva)");
    expect(recipeLine("1× tag:base:sharpknife keep", {}, "en")).toBe("1× any tagged base:sharpknife (kept)");
    expect(recipeLine("0.5× Base.Nails", names, "es")).toBe("0,5× Clavos");
    expect(recipeLine("algo raro", names, "es")).toBe("algo raro");
  });
});

describe("direction", () => {
  it("sólo con números", () => {
    expect(direction(2, 2.2)).toBe("up");
    expect(direction(10, 8)).toBe("down");
    expect(direction(3, 3)).toBeNull();
    expect(direction("a", "b")).toBeNull();
    expect(direction(undefined, 3)).toBeNull();
  });
});

describe("autoLede", () => {
  it("nombra sólo lo que no es 0, con el tipo en la primera cuenta", () => {
    const counts = { items: { added: 12, removed: 3, changed: 40 }, recipes: { added: 0, removed: 0, changed: 2 } };
    expect(autoLede(counts, "es", "es-AR")).toBe("12 objetos nuevos, 3 quitados y 40 cambiados; 2 recetas cambiadas.");
    expect(autoLede(counts, "en", "en-US")).toBe("12 new items, 3 removed and 40 changed; 2 recipes changed.");
  });

  it("singular y femenino", () => {
    expect(autoLede({ sandbox: { added: 1, removed: 0, changed: 0 } }, "es", "es-AR")).toBe("1 opción de sandbox nueva.");
    expect(autoLede({ traits: { added: 0, removed: 1, changed: 1 } }, "en", "en-US")).toBe("1 trait removed and 1 changed.");
  });
});

describe("firstCounts", () => {
  it("las cifras de la primera versión con el formato del idioma", () => {
    expect(firstCounts({ items: 4878, recipes: 1170, sandbox: 269 }, "es", "es-AR")).toBe(
      "4.878 objetos, 1.170 recetas y 269 opciones de sandbox",
    );
  });
});

describe("rawKey", () => {
  it("parte después de cada punto", () => {
    expect(rawKey("stats.conditionLowerChanceOneIn")).toEqual(["stats.", "conditionLowerChanceOneIn"]);
    expect(rawKey("levels.1.name")).toEqual(["levels.", "1.", "name"]);
    expect(rawKey("weight")).toEqual(["weight"]);
  });
});
