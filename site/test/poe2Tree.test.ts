import { describe, it, expect } from "vitest";
import treeJson from "@poe2/tree/tree.json";
import gemIds from "@poe2/tree/gems.json";
import type { Tree } from "../src/poe2Tree/data";
import { Planner } from "../src/poe2Tree/planner";
import { ascLevel, mainAt, questAt, QUEST_TOTAL, routeLevels } from "../src/poe2Tree/points";
import { decode, encode } from "../src/poe2Tree/share";
import { applyImport, fromBuild, toBuild } from "../src/poe2Tree/buildFile";

const T = treeJson as unknown as Tree;
const ci = (en: string) => T.classes.findIndex((c) => c.en === en);
const byGid = (gid: string) => Object.keys(T.nodes).find((k) => T.nodes[k].gid === gid)!;

describe("poe2 tree: puntos por nivel", () => {
  it("99 por nivel más 24 de misiones", () => {
    expect(QUEST_TOTAL).toBe(24);
    expect(mainAt(1)).toBe(0);
    expect(mainAt(9)).toBe(8);
    expect(mainAt(10)).toBe(11); // 9 de nivel + 2 del acto 1
    expect(mainAt(100)).toBe(123);
    expect(questAt(55)).toBe(16);
    expect(questAt(56)).toBe(24);
  });

  it("cada punto en el primer nivel que lo alcanza, sin volver atrás", () => {
    expect(routeLevels([0, 0, 0])).toEqual([2, 3, 4]);
    // el punto 10 llega en el 10 gracias a las misiones, el 11 también
    expect(routeLevels(Array(11).fill(0)).slice(8)).toEqual([10, 10, 10]);
    // un set de armas espera a la primera misión y arrastra al que sigue
    expect(routeLevels([0, 1, 0])).toEqual([2, 10, 10]);
    // más de 123 no alcanza
    const all = routeLevels(Array(125).fill(0));
    expect(all[122]).toBe(100);
    expect(all[123]).toBeNull();
  });

  it("ascendencia de a dos por prueba", () => {
    expect([0, 1, 2, 3, 6, 7, 8].map(ascLevel)).toEqual([22, 22, 38, 38, 75, 75, null]);
  });
});

describe("poe2 tree: ruta", () => {
  it("el camino más corto sale del inicio de la clase", () => {
    const P = new Planner(T, ci("Ranger"));
    const target = P.adj[P.start][0];
    expect(P.path(target)).toEqual([target]);
    const far = P.adj[target].find((x) => x !== P.start && !P.adj[P.start].includes(x))!;
    expect(P.take(far)).toEqual([target, far]);
    expect(P.route).toEqual([target, far]);
  });

  it("sacar un nodo saca lo que queda colgado", () => {
    const P = new Planner(T, ci("Ranger"));
    const a = P.adj[P.start][0];
    const b = P.adj[a].find((x) => x !== P.start)!;
    P.take(b);
    P.drop(a);
    expect(P.route).toEqual([]);
  });

  it("no atraviesa el inicio de otra clase ni ascendencias ajenas", () => {
    const P = new Planner(T, ci("Ranger"));
    const other = T.classes[ci("Warrior")].start;
    expect(P.blocked(other)).toBe(true);
    const ascNode = Object.keys(T.nodes).find((k) => T.nodes[k].a === "Warrior1" && T.nodes[k].k !== "asc-start")!;
    expect(P.path(ascNode)).toBeNull();
  });

  it("reordenar sólo si sigue conectado", () => {
    const P = new Planner(T, ci("Ranger"));
    const a = P.adj[P.start][0];
    const b = P.adj[a].find((x) => x !== P.start && !P.adj[P.start].includes(x))!;
    P.take(b);
    expect(P.move(1, 0)).toBe(false);
    expect(P.route).toEqual([a, b]);
  });

  it("el árbol de la Oráculo sólo con la Oráculo", () => {
    const P = new Planner(T, ci("Druid"));
    const uc = Object.keys(T.nodes).find((k) => T.nodes[k].uc?.a === "Druid1")!;
    expect(P.visible(uc)).toBe(false);
    P.setAsc("Druid1");
    expect(P.visible(uc)).toBe(true);
    expect(P.blocked(uc)).toBe(true); // falta su nodo de ascendencia
  });
});

describe("poe2 tree: link y .build", () => {
  function sample() {
    const P = new Planner(T, ci("Ranger"));
    P.setAsc("Ranger1");
    // un notable cualquiera a unos pasos del inicio
    const q = [P.start];
    const seen = new Set(q);
    let target = "";
    for (let i = 0; i < q.length && !target; i++) {
      for (const nb of P.adj[q[i]]) {
        if (seen.has(nb) || P.blocked(nb)) continue;
        seen.add(nb);
        q.push(nb);
        if (T.nodes[nb].k === "notable" && i > 3) { target = nb; break; }
      }
    }
    P.take(target);
    P.setWs(P.route[P.route.length - 1], 2);
    const ascTarget = P.adj[P.ascStart!][0];
    P.take(ascTarget);
    return P;
  }

  it("el link ida y vuelta", () => {
    const P = sample();
    const gems = [{ from: 1, to: 23, skills: [{ slug: "lightning-arrow", sup: ["elemental-armament-i"] }] }];
    const code = encode({
      ci: P.ci,
      asc: T.classes[P.ci].asc.findIndex((a) => a.id === P.asc),
      route: P.route.map((id) => ({ id, ws: P.ws[id] ?? 0 })),
      ascRoute: P.ascRoute,
      gems,
    });
    const back = decode(code)!;
    expect(back.ci).toBe(P.ci);
    expect(T.classes[back.ci].asc[back.asc].id).toBe("Ranger1");
    expect(back.route.map((e) => e.id)).toEqual(P.route);
    expect(back.route.at(-1)!.ws).toBe(2);
    expect(back.ascRoute).toEqual(P.ascRoute);
    expect(back.gems).toEqual(gems);
    expect(decode("basura")).toBeNull();
  });

  it("el .build ida y vuelta, con el formato del juego", () => {
    const P = sample();
    const ids = gemIds as Record<string, string>;
    const gems = [{ from: 1, to: 23, skills: [{ slug: "lightning-arrow", sup: ["elemental-armament-i"] }] }];
    const b = toBuild(P, gems, ids, "Prueba");
    expect(b.ascendancy).toBe("Ranger1");
    expect(b.passives![0]).toEqual({ id: "AscendancyRanger1Start", level_interval: [22, 100] });
    expect(b.passives!.find((p) => p.weapon_set === 2)).toBeTruthy();
    expect(b.skills![0].id).toMatch(/^Metadata\/Items\/Gems?\/SkillGemLightningArrow$/);
    expect(b.skills![0].support_skills![0].id).toMatch(/PrimalArmament$/);

    const imp = fromBuild(JSON.parse(JSON.stringify(b)), T, ids)!;
    const Q = new Planner(T);
    applyImport(Q, imp);
    expect(Q.ci).toBe(P.ci);
    expect(Q.asc).toBe("Ranger1");
    expect(Q.route).toEqual(P.route);
    expect(Q.ascRoute).toEqual(P.ascRoute);
    expect(Q.ws).toEqual(P.ws);
    expect(imp.gems).toEqual(gems);
    expect(byGid("AscendancyRanger1Start")).toBe(P.ascStart);
  });

  it("de una guía por etapas se queda con el árbol final", () => {
    const P = new Planner(T, ci("Ranger"));
    const a = P.adj[P.start][0];
    const b = P.adj[P.start][1];
    const g = (id: string) => T.nodes[id].gid;
    const imp = fromBuild({
      passives: [
        { id: g(a), level_interval: [1, 14] },
        { id: g(b), level_interval: [1, 14] },
        { id: g(a), level_interval: [15, 100] },
        { id: "nodo-de-otra-version", level_interval: [15, 100] },
      ],
    }, T, {})!;
    expect(imp.ci).toBe(ci("Ranger"));
    expect(imp.route.map((e) => e.id)).toEqual([a]);
    expect(imp.unknown).toBe(1);
  });
});
