import { describe, it, expect } from "vitest";
import { summarize, mergeSummaries } from "../src/aggregate/summary";
import type { Participant } from "../src/aggregate/signature";

function board(
  placement: number,
  units: { id: string; tier?: number; items?: string[] }[],
  trait = { name: "TFT17_Sorcerer", numUnits: 6 },
  overrides: {
    level?: number;
    goldLeft?: number;
    // Extra traits alongside the dominant one, e.g. an inactive or
    // per-champion "unique" trait, to exercise summarize()'s trait filter.
    extraTraits?: { name: string; numUnits: number; tierCurrent: number; tierTotal: number }[];
  } = {}
): Participant {
  return {
    puuid: "p" + placement,
    placement,
    level: overrides.level ?? 8,
    goldLeft: overrides.goldLeft ?? 3,
    units: units.map((u) => ({
      character_id: u.id,
      tier: u.tier ?? 1,
      rarity: 2,
      items: u.items ?? [],
    })),
    traits: [
      { name: trait.name, numUnits: trait.numUnits, tierCurrent: 3, tierTotal: 4 },
      ...(overrides.extraTraits ?? []),
    ],
  };
}

const carry = { id: "TFT17_Zoe", tier: 2, items: ["Deathblade", "Deathblade"] };

describe("summarize", () => {
  it("agrupa por firma y cuenta los tableros", () => {
    const s = summarize([board(1, [carry]), board(5, [carry])]);
    expect([...s.bySignature.keys()]).toEqual(["TFT17_Sorcerer|TFT17_Zoe"]);
    expect([...s.bySignature.values()][0].boards).toBe(2);
  });

  it("guarda suma y suma de cuadrados de la posición, que es lo que pide la varianza", () => {
    const [only] = [...summarize([board(1, [carry]), board(5, [carry])]).bySignature.values()];
    expect(only.sumPlacement).toBe(6);
    expect(only.sumPlacementSq).toBe(1 + 25);
  });

  it("parte los contadores por cómo terminó la partida", () => {
    const [only] = [...summarize([board(1, [carry]), board(5, [carry])]).bySignature.values()];
    expect(only.top4).toBe(1);
    expect(only.winner.boards).toBe(1);
    expect(only.loser.boards).toBe(1);
    expect(only.loser.sumPlacement).toBe(5);
  });

  // wins es un subconjunto estricto de top4: gana el primero, top4 son 1-4.
  it("cuenta wins aparte de top4", () => {
    const [only] = [
      ...summarize([
        board(1, [carry]),
        board(1, [carry]),
        board(2, [carry]),
        board(5, [carry]),
      ]).bySignature.values(),
    ];
    expect(only.wins).toBe(2);
    expect(only.top4).toBe(3);
    expect(only.boards).toBe(4);
  });

  it("suma el nivel de todos los tableros", () => {
    const [only] = [
      ...summarize([
        board(1, [carry], undefined, { level: 9 }),
        board(5, [carry], undefined, { level: 6 }),
      ]).bySignature.values(),
    ];
    expect(only.sumLevel).toBe(15);
  });

  it("separa nivel y oro restante por cómo terminó la partida, no solo posición", () => {
    const [only] = [
      ...summarize([
        board(1, [carry], undefined, { level: 9, goldLeft: 4 }), // winner
        board(3, [carry], undefined, { level: 7, goldLeft: 2 }), // winner
        board(6, [carry], undefined, { level: 5, goldLeft: 10 }), // loser
      ]).bySignature.values(),
    ];
    expect(only.winner.sumPlacement).toBe(4); // 1 + 3
    expect(only.winner.sumLevel).toBe(16); // 9 + 7
    expect(only.winner.sumGoldLeft).toBe(6); // 4 + 2
    expect(only.loser.sumPlacement).toBe(6);
    expect(only.loser.sumLevel).toBe(5);
    expect(only.loser.sumGoldLeft).toBe(10);
  });

  it("cuenta los contadores por unidad: estrellas, resultado, posición e ítems", () => {
    const [only] = [
      ...summarize([
        // winner, 3-star, 2 instancias del ítem
        board(1, [{ id: "TFT17_Zoe", tier: 3, items: ["Deathblade", "Deathblade"] }]),
        // winner, 1-star, 1 instancia
        board(2, [{ id: "TFT17_Zoe", tier: 1, items: ["Deathblade"] }]),
        // loser, 1-star, 1 instancia
        board(6, [{ id: "TFT17_Zoe", tier: 1, items: ["Deathblade"] }]),
      ]).bySignature.values(),
    ];
    const zoe = only.units["TFT17_Zoe"];
    expect(zoe.boards).toBe(3);
    expect(zoe.threeStar).toBe(1);
    expect(zoe.winnerBoards).toBe(2);
    expect(zoe.loserBoards).toBe(1);
    expect(zoe.sumPlacement).toBe(9); // 1 + 2 + 6

    const deathblade = zoe.items["Deathblade"];
    expect(deathblade.boards).toBe(3);
    expect(deathblade.winnerBoards).toBe(2);
    expect(deathblade.instances).toBe(4); // 2 + 1 + 1
  });

  // 6,5% de los tableros reales llevan el mismo campeón dos veces. Sin colapsarlos,
  // toda tasa por unidad se pasa de 1.
  it("colapsa las copias del mismo campeón a la más invertida", () => {
    const dosCopias = board(1, [
      { id: "TFT17_Zoe", tier: 1, items: [] },
      { id: "TFT17_Zoe", tier: 2, items: ["Deathblade"] },
    ]);
    const [only] = [...summarize([dosCopias]).bySignature.values()];
    expect(only.units["TFT17_Zoe"].boards).toBe(1);
    expect(only.units["TFT17_Zoe"].sumStars).toBe(2);
    expect(only.units["TFT17_Zoe"].sumItems).toBe(1);
  });

  // itemPriority cuenta instancias; units[].items cuenta tableros. Dos contadores.
  it("cuenta instancias de ítem aparte de tableros con ítem", () => {
    const [only] = [...summarize([board(1, [carry])]).bySignature.values()];
    expect(only.itemInstances["Deathblade"]).toBe(2);
    expect(only.units["TFT17_Zoe"].items["Deathblade"].boards).toBe(1);
  });

  // traits[].units es la MODA de numUnits, así que el resumen necesita el histograma.
  it("guarda el histograma de unidades por trait, no su promedio", () => {
    const s = summarize([
      board(1, [carry], { name: "TFT17_Sorcerer", numUnits: 6 }),
      board(2, [carry], { name: "TFT17_Sorcerer", numUnits: 4 }),
      board(3, [carry], { name: "TFT17_Sorcerer", numUnits: 4 }),
    ]);
    const [only] = [...s.bySignature.values()];
    expect(only.traits["TFT17_Sorcerer"].units).toEqual({ 4: 2, 6: 1 });
    expect(only.traits["TFT17_Sorcerer"].boards).toBe(3);
  });

  // Único filtro no trivial de summarize(): un trait inactivo (tierCurrent < 1)
  // nunca prendió, y uno de una sola grada (tierTotal <= 1) es "unique" — todo
  // campeón trae uno — así que ninguno de los dos identifica el comp.
  it("no cuenta traits inactivos ni de una sola grada", () => {
    const withExtras = board(1, [carry], undefined, {
      extraTraits: [
        { name: "TFT17_Ionia", numUnits: 1, tierCurrent: 1, tierTotal: 1 }, // unique
        { name: "TFT17_Deadeye", numUnits: 2, tierCurrent: 0, tierTotal: 3 }, // inactive
      ],
    });
    const [only] = [...summarize([withExtras]).bySignature.values()];
    expect(only.traits["TFT17_Ionia"]).toBeUndefined();
    expect(only.traits["TFT17_Deadeye"]).toBeUndefined();
    expect(only.traits["TFT17_Sorcerer"].boards).toBe(1);
    expect(Object.keys(only.traits)).toEqual(["TFT17_Sorcerer"]);
  });

  it("respeta el filtro de ítems", () => {
    const [only] = [...summarize([board(1, [carry])], (id) => id !== "Deathblade").bySignature.values()];
    expect(only.itemInstances).toEqual({});
    expect(only.units["TFT17_Zoe"].sumItems).toBe(0);
    expect(only.units["TFT17_Zoe"].itemized).toBe(0);
  });

  it("descarta el tablero sin firma", () => {
    expect(summarize([board(1, [])]).bySignature.size).toBe(0);
  });

  // Bug real: playRate en group.ts divide por participants.length, ANTES del
  // filtro de firma. Si quien llama suma boards de los resúmenes para ese total,
  // se queda corto por los tableros sin firma (0,3-0,5% de los reales, medido —
  // no el ~10% que se asumía) e infla playRate en todas las comps. totalBoards
  // es el denominador correcto.
  it("informa cuántos tableros vio en total y cuántos descartó por no tener firma", () => {
    const result = summarize([board(1, [carry]), board(2, [carry]), board(3, []), board(4, [])]);
    expect(result.totalBoards).toBe(4);
    expect(result.discardedBoards).toBe(2);
    // El total no es la suma de boards devueltos: esa suma es 2, no 4.
    const boardsCounted = [...result.bySignature.values()].reduce((s, x) => s + x.boards, 0);
    expect(boardsCounted).toBe(2);
    expect(boardsCounted).not.toBe(result.totalBoards);
  });
});

const SIG = "TFT17_Sorcerer|TFT17_Zoe";

describe("mergeSummaries", () => {
  it("sumar dos resúmenes da lo mismo que resumir todo junto", () => {
    const a = [board(1, [carry]), board(3, [carry])];
    const b = [board(5, [carry]), board(8, [carry])];
    const juntos = [...summarize([...a, ...b]).bySignature.values()][0];
    const sumados = mergeSummaries(
      [[...summarize(a).bySignature.values()][0], [...summarize(b).bySignature.values()][0]],
      SIG
    );
    expect(sumados).toEqual(juntos);
  });

  it("no muta sus entradas", () => {
    const a = [...summarize([board(1, [carry])]).bySignature.values()][0];
    const antes = JSON.parse(JSON.stringify(a));
    mergeSummaries([a, [...summarize([board(2, [carry])]).bySignature.values()][0]], SIG);
    expect(a).toEqual(antes);
  });

  // Bug real: reduce() sin semilla devuelve list[0] tal cual cuando hay una sola
  // entrada, y un cluster de una sola firma es el caso común, no el raro.
  it("con una sola entrada, devuelve un objeto nuevo en vez de la misma referencia", () => {
    const [only] = [...summarize([board(1, [carry])]).bySignature.values()];
    const merged = mergeSummaries([only], SIG);
    expect(merged).not.toBe(only);
    expect(merged.units).not.toBe(only.units);
    expect(merged).toEqual(only);

    merged.boards = 999;
    merged.units["TFT17_Zoe"].boards = 999;
    expect(only.boards).toBe(1);
    expect(only.units["TFT17_Zoe"].boards).toBe(1);
  });

  // Bug real: mergeTwo se quedaba con a.signature, así que mergear A,B daba una
  // etiqueta distinta que B,A con los mismos números. La firma ahora es un
  // parámetro explícito, y un cluster real junta firmas que sí difieren entre sí.
  it("etiqueta el resultado con la firma que le pasan, sin importar el orden ni las firmas de origen", () => {
    const a = [...summarize([board(1, [carry])]).bySignature.values()][0]; // signature: SIG
    const otherBoard = board(
      1,
      [{ id: "TFT17_Ahri", tier: 1, items: ["Deathblade", "Deathblade"] }],
      { name: "TFT17_Arcanist", numUnits: 5 }
    );
    const b = [...summarize([otherBoard]).bySignature.values()][0]; // signature: "TFT17_Arcanist|TFT17_Ahri"
    expect(a.signature).not.toBe(b.signature);

    const forward = mergeSummaries([a, b], "host-label");
    const backward = mergeSummaries([b, a], "host-label");

    expect(forward.signature).toBe("host-label");
    expect(backward.signature).toBe("host-label");
    expect(forward).toEqual(backward);
    expect(forward.boards).toBe(2);
  });
});
