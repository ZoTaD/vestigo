import { describe, expect, it } from "vitest";
import craftJson from "../../games/zomboid/data/craft.json";
import type { CraftData } from "../src/zomboid/crafting/data";
import { knownSet, plan } from "../src/zomboid/crafting/engine";
import { addTarget, decodeState, EMPTY, encodeState, sanitize, setHave, setLeaf, setOpt, setQty, setRecipe, startState } from "../src/zomboid/crafting/state";
const D = craftJson as unknown as CraftData;

describe("la dirección", () => {
  it("ida y vuelta, con un orden fijo de parámetros", () => {
    let s = addTarget(EMPTY, "plank");
    s = setQty(s, "plank", 10);
    s = addTarget(s, "c:large-plant-drying-rack");
    s = setRecipe(s, "plank", "saw-log");
    s = setOpt(s, "craft-twine", 0, "hemp-dogbane");
    s = setLeaf(s, "nails", true);
    s = setHave(s, "plank", 4);
    s = { ...s, b: "carpenter" };
    const q = encodeState(s);
    expect(q).toBe("q=plank*10,c:large-plant-drying-rack&r=plank~saw-log&o=craft-twine.0~hemp-dogbane&x=nails&t=plank*4&b=carpenter");
    expect(decodeState("?" + q)).toEqual(s);
  });
  it("vacío es vacío", () => {
    expect(encodeState(EMPTY)).toBe("");
    expect(decodeState("")).toEqual(EMPTY);
  });
  it("sanitize tira lo que no existe y acota cantidades", () => {
    const s = sanitize(D, decodeState("?q=plank*5000,nada*2,plank*3,c:no-existe&r=plank~craft-twine,log~saw-log&o=saw-log.1~log&x=nada&t=plank*-1"));
    expect(s.q).toEqual([{ id: "plank", qty: 999 }]); // repetido: se suma (5000 + 3) y se acota a 999
    expect(s.r).toEqual({});        // craft-twine no hace tablas; saw-log no hace troncos
    expect(s.o).toEqual({});        // un tronco no es una sierra
    expect(s.leaf).toEqual([]);
    expect(s.have).toEqual({});
  });
  it("cantidad 0 saca el objetivo", () => {
    expect(setQty(addTarget(EMPTY, "plank"), "plank", 0).q).toEqual([]);
  });
});

describe("un link con nombres que tiene cualquier objeto de JS", () => {
  // `constructor`, `toString`… existen en todo objeto: si se leyeran como datos, `?q=constructor` rompía la pestaña.
  const BAD = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
  for (const k of BAD) {
    it(k, () => {
      const link = `?q=${k},c:${k},plank*2&r=${k}~${k},plank~${k}&o=${k}.0~${k},${k}.1~x,saw-log.${k}~log&x=${k}&f=${k}&t=${k}*3&b=${k}`;
      const s = sanitize(D, decodeState(link));
      expect(s).toEqual({ ...EMPTY, q: [{ id: "plank", qty: 2 }] });
      expect(Object.getPrototypeOf(decodeState(link).r)).toBe(Object.prototype); // `__proto__~x` no toca el prototipo
      expect(encodeState(s)).toBe("q=plank*2");
    });
  }
});

describe("el ?b= de Personaje", () => {
  // Policía no enseña ninguna receta (no está en las 14 de craft.json), pero el rasgo sí: antes se perdía el `?b=` entero.
  const teaching = Object.keys(D.traits).find((x) => Object.values(D.recipes).some((r) => r.learn?.traits.includes(x)))!;
  const rid = Object.keys(D.recipes).find((k) => D.recipes[k].learn?.traits.includes(teaching))!;

  it("una profesión que no enseña recetas conserva sus rasgos, y la receta del rasgo se sabe", () => {
    expect(D.profs["police-officer"]).toBeUndefined();
    const s = sanitize(D, decodeState(`?q=plank&b=police-officer.${teaching}`));
    expect(s.b).toBe(`police-officer.${teaching}`);
    expect(knownSet(D, s.b).has(rid)).toBe(true);
    // Sin profesión (la de entrada de Personaje) con el rasgo, igual.
    expect(knownSet(D, sanitize(D, decodeState(`?b=custom-occupation.${teaching}`)).b).has(rid)).toBe(true);
  });

  it("basura: se limpia sin romper (rasgos raros afuera, ordenados y sin repetir)", () => {
    expect(sanitize(D, decodeState("?b=%3Cscript%3E.x")).b).toBeNull();
    expect(sanitize(D, decodeState("?b=..")).b).toBeNull();
    expect(sanitize(D, decodeState("?b=Police-Officer.zz.a b.zz.aa")).b).toBe("police-officer.aa.zz");
    expect(sanitize(D, decodeState("?b=no-existe.tampoco")).b).toBe("no-existe.tampoco");
    expect(() => plan(D, sanitize(D, decodeState("?q=plank&b=no-existe.tampoco")))).not.toThrow();
    expect(sanitize(D, decodeState("?b=blacksmith.constructor.tostring")).b).toBe("blacksmith");
  });
});


describe("un link que llega se suma a lo guardado", () => {
  const saved = "q=plank*10,c:large-plant-drying-rack&r=plank~saw-log&x=nails&t=plank*4";
  it("sin link: lo guardado", () => {
    expect(encodeState(startState(D, "", saved))).toBe(saved);
    expect(encodeState(startState(D, "?utm_source=x", saved))).toBe(saved);
  });
  it("sin nada guardado: lo del link", () => {
    expect(encodeState(startState(D, "?q=plank*2", null))).toBe("q=plank*2");
  });
  it("el botón de Personaje (sólo b=) no borra la lista: le suma el personaje", () => {
    expect(encodeState(startState(D, "?b=carpenter", saved))).toBe(saved + "&b=carpenter");
  });
  it("Planificá esta receta / qué juntar: el objetivo se agrega, y su receta manda", () => {
    const s = startState(D, "?q=log&r=plank~saw-log", saved);
    expect(s.q).toEqual([{ id: "plank", qty: 10 }, { id: "c:large-plant-drying-rack", qty: 1 }, { id: "log", qty: 1 }]);
    expect(s.r).toEqual({ plank: "saw-log" });
    expect(s.leaf).toEqual(["nails"]);
    expect(s.have).toEqual({ plank: 4 });
  });
  it("un objetivo que ya estaba queda con la cantidad mayor, y recargar no la va sumando", () => {
    const once = startState(D, "?q=plank*3,nails*2", saved);
    expect(once.q.find((t) => t.id === "plank")?.qty).toBe(10);
    // Al montarse la dirección queda con todo lo sumado: recargar no cambia nada.
    const qs = encodeState(once);
    expect(encodeState(startState(D, "?" + qs, qs))).toBe(qs);
  });
  it("un plan entero compartido también se suma; si se contradicen, gana el link", () => {
    const s = startState(D, "?q=nails&f=nails&t=plank*1&b=burglar", saved + "&b=carpenter");
    expect(s.q.map((t) => t.id)).toEqual(["plank", "c:large-plant-drying-rack", "nails"]);
    expect(s.make).toEqual(["nails"]);
    expect(s.leaf).toEqual([]); // "lo fabrico" del link le gana a "lo consigo" de lo guardado
    expect(s.have).toEqual({ plank: 1 });
    expect(s.b).toBe("burglar");
  });
});
