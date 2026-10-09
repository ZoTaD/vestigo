import { describe, expect, it } from "vitest";
import { EMPTY_STATE, formatCalc, parseCalc, parseOwned } from "../src/rust/farming/state";

describe("la calculadora de genética en el link", () => {
  it("va y vuelve", () => {
    const s = { plant: "hemp", center: "GGGYYY", neighbours: ["YYYXXX", "GGGGGG"], target: "GGGGYY", owned: ["GGGXXX"] };
    const q = formatCalc(s);
    expect(q).toBe("p=hemp&c=GGGYYY&n=YYYXXX-GGGGGG&t=GGGGYY&h=GGGXXX");
    expect(parseCalc(`?${q}`, ["hemp"])).toEqual(s);
  });

  it("descarta lo que no es un gen ni una planta conocida, y acepta minúsculas", () => {
    expect(parseCalc("?p=nada&c=gggyyy&n=GGG-XXXXXX&t=ZZZZZZ", ["hemp"])).toEqual({
      plant: null, center: "GGGYYY", neighbours: ["XXXXXX"], target: "", owned: [],
    });
  });

  it("sin nada en el link arranca con dos vecinas vacías, y no escribe vacíos", () => {
    expect(parseCalc("", [])).toEqual(EMPTY_STATE);
    expect(formatCalc(EMPTY_STATE)).toBe("");
  });

  it("como mucho 8 vecinas y 10 esquejes propios", () => {
    const many = Array(12).fill("GGGYYY").join("-");
    expect(parseCalc(`?n=${many}&h=${many}`, []).neighbours).toHaveLength(8);
    expect(parseCalc(`?n=${many}&h=${many}`, []).owned).toHaveLength(10);
  });

  it("los esquejes propios se escriben uno por renglón o con comas", () => {
    expect(parseOwned("gggyyy\nXXXXXX, yyyyyy\nmal")).toEqual(["GGGYYY", "XXXXXX", "YYYYYY"]);
  });
});
