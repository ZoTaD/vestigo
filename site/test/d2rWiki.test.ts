import { describe, expect, it } from "vitest";
import breakpoints from "../../games/d2r/data/wiki/breakpoints.json";
import zones from "../../games/d2r/data/wiki/zones.json";
import cube from "../../games/d2r/data/wiki/cube.json";
import classes from "../../games/d2r/data/wiki/classes.json";
import { bpState, bpTable } from "../src/d2r/breakpoints";
import sets from "../../games/d2r/data/wiki/sets.json";
import uniques from "../../games/d2r/data/wiki/uniques.json";
import { decodeGrail, encodeGrail } from "../src/d2r/D2rGrail";

/**
 * Los datos de la wiki de Diablo II que salen de cuentas propias (2026-09-29):
 * si un parche o un cambio en `wiki.py` los mueve, esto tiene que avisar.
 */
type Bp = Record<string, Record<"fcr" | "fhr" | "fbr", { w: string[]; table: [number, number][] }[]>>;
const BP = breakpoints as unknown as Bp;
const pcts = (cls: string, kind: "fcr" | "fhr" | "fbr", w = "HTH") => BP[cls][kind].find((g) => g.w.includes(w))!.table.map(([p]) => p);

describe("breakpoints", () => {
  it("las tablas clásicas conocidas de las siete clases de siempre", () => {
    expect(pcts("sorceress", "fcr")).toEqual([0, 9, 20, 37, 63, 105, 200]);
    expect(pcts("amazon", "fcr")).toEqual([0, 7, 14, 22, 32, 48, 68, 99, 152]);
    expect(pcts("druid", "fcr")).toEqual([0, 4, 10, 19, 30, 46, 68, 99, 163]);
    expect(pcts("sorceress", "fhr")).toEqual([0, 5, 9, 14, 20, 30, 42, 60, 86, 142, 280]);
    expect(pcts("paladin", "fhr", "2HT")).toEqual([0, 3, 7, 13, 20, 32, 48, 75, 129, 280]);
    expect(pcts("amazon", "fbr", "1HS")).toEqual([0, 4, 6, 11, 15, 23, 29, 40, 56, 80, 120, 200, 480]);
  });

  it("el Conjurador sale de la misma cuenta", () => {
    expect(pcts("warlock", "fcr")).toEqual([0, 9, 18, 30, 48, 75, 125]);
    expect(pcts("warlock", "fhr")).toEqual([0, 5, 10, 16, 26, 39, 56, 86, 152, 377]);
  });

  it("en qué escalón estás y cuánto falta", () => {
    const t = bpTable("warlock", "fcr")!;
    expect(bpState(t, 70)).toMatchObject({ frames: 11, next: [75, 10] });
    expect(bpState(t, 200).next).toBeNull();
  });
});

describe("zonas, cubo y clases", () => {
  it("las 34 Zonas de Terror, con su acto y sus mapas", () => {
    const z = (zones as unknown as { zones: { act: number; levels: unknown[] }[] }).zones;
    expect(z).toHaveLength(34);
    expect(z.every((x) => x.act >= 1 && x.act <= 5 && x.levels.length > 0)).toBe(true);
  });

  it("el cubo: 3 El hacen una Eld", () => {
    const r = (cube as unknown as { group: string; in: { code: string; qty: number }[]; out: { code: string } }[]).find((x) => x.out.code === "r02");
    expect(r?.group).toBe("runes");
    expect(r?.in[0]).toMatchObject({ code: "r01", qty: 3 });
  });

  it("las ocho clases con sus tres pestañas; el Conjurador empieza por Demonio", () => {
    const c = classes as unknown as { id: string; tabs: { en: string }[]; skills: { page: number }[] }[];
    expect(c).toHaveLength(8);
    expect(c.every((x) => x.skills.length === 30 && x.tabs.every((t) => t.en))).toBe(true);
    expect(c.find((x) => x.id === "warlock")!.tabs.map((t) => t.en)).toEqual(["Demon", "Eldritch", "Chaos"]);
    expect(c.find((x) => x.id === "sorceress")!.tabs[0].en).toBe("Fire Spells");
  });
});

describe("el Grial", () => {
  const sorted = (x: Set<string>) => [...x].sort();

  it("las listas de la Crónica: 403 únicos, 135 piezas de conjunto (Warlord's Glory no cae) y nombres distintos", () => {
    const pieces = (sets as unknown as { id: string; items: unknown[] }[]).flatMap((s) => s.items);
    expect(pieces).toHaveLength(135);
    expect((sets as unknown as { id: string }[]).some((s) => s.id.startsWith("warlord"))).toBe(false);
    const u = uniques as unknown as { id: string; name: { en: string } }[];
    expect(u).toHaveLength(403);
    expect(new Set(u.map((x) => x.name.en)).size).toBe(403);
    expect(u.map((x) => x.id)).toContain("rainbow-facet-cold-level-up");
  });

  it("el enlace compartido vuelve con las mismas marcas", () => {
    const p = {
      u: new Set(["harlequin-crest", "the-oculus"]),
      s: new Set(["tal-rashas-horadric-crest"]),
      w: new Set(["enigma", "spirit"]),
      r: new Set(["ber", "jah", "zod"]),
    };
    const code = encodeGrail(p);
    expect(code).toMatch(/^u403-[\w-]*\.s135-[\w-]*\.w99-[\w-]*\.r33-[\w-]*$/);
    const back = decodeGrail(code);
    for (const k of ["u", "s", "w", "r"] as const) expect(sorted(back[k])).toEqual(sorted(p[k]));
  });

  it("una lista que cambió de tamaño (un parche) se ignora en vez de marcar mal", () => {
    const code = encodeGrail({ u: new Set(["harlequin-crest"]), s: new Set(), w: new Set(), r: new Set(["ber"]) });
    const back = decodeGrail(code.replace("u403-", "u402-"));
    expect(back.u.size).toBe(0);
    expect(sorted(back.r)).toEqual(["ber"]);
  });
});
