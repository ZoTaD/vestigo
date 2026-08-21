import { describe, it, expect } from "vitest";
import { matchRow, selectPending, planTierRepairs } from "../src/migrate-to-postgres";
import type { StoredMatch } from "../src/store";
import type { RawMatch } from "../src/riot/normalize";

function stored(matchId: string, version: string, tier?: string): StoredMatch {
  return {
    matchId,
    fetchedAt: "2026-07-26T00:00:00.000Z",
    ...(tier ? { tier } : {}),
    match: {
      info: {
        tft_set_number: 17,
        queue_id: 1100,
        game_datetime: 1_750_000_000_000,
        game_version: `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${version}>`,
        participants: [{ puuid: "x".repeat(78), placement: 1 }],
      },
    } as RawMatch,
  };
}

describe("matchRow", () => {
  // Sin esto las partidas suben sin rango, y bandCovers manda todo lo que no
  // tiene rango a global y apex: las tres bandas de abajo se quedan sin nada.
  it("lleva el tier del store a la fila", () => {
    expect(matchRow(stored("LA2_1", "16.14", "GOLD IV")).tier).toBe("GOLD IV");
  });

  it("manda cadena vacía cuando el store no tenía tier", () => {
    expect(matchRow(stored("LA2_2", "16.14")).tier).toBe("");
  });

  it("saca la región del id, que es donde viaja", () => {
    expect(matchRow(stored("LA2_3", "16.14")).region).toBe("la2");
  });
});

describe("selectPending", () => {
  const all = [stored("LA2_1", "16.14"), stored("LA2_2", "16.13"), stored("LA2_3", "16.14")];

  it("sube solo el parche pedido", () => {
    expect(selectPending(all, new Set(), "16.14").map((s) => s.matchId)).toEqual([
      "LA2_1",
      "LA2_3",
    ]);
  });

  it("saltea lo que ya está en Postgres", () => {
    expect(selectPending(all, new Set(["LA2_1"]), "16.14").map((s) => s.matchId)).toEqual([
      "LA2_3",
    ]);
  });

  it("sin parche pedido, sube todo lo que falta", () => {
    expect(selectPending(all, new Set(), "").length).toBe(3);
  });
});

describe("planTierRepairs", () => {
  // migrate-to-postgres no subía tier antes de esto, así que lo viejo llegó vacío
  // y bandCovers lo cuenta como apex. Esto arma el plan para corregirlo sin pegarle
  // a Postgres una vez por partida.
  const onDisk = [
    stored("LA2_1", "16.14", "GOLD IV"), // vacía en pg, con tier en disco: reparar
    stored("LA2_2", "16.14"), // vacía en pg, sin tier en disco tampoco: no tocar
    stored("LA2_3", "16.14", "GOLD IV"), // ya tiene tier en pg: no tocar
  ];
  const inPg = [
    { match_id: "LA2_1", tier: "" },
    { match_id: "LA2_2", tier: "" },
    { match_id: "LA2_3", tier: "GOLD IV" },
  ];

  it("agrupa por tier las que están vacías en Postgres y sí tienen tier en disco", () => {
    const plan = planTierRepairs(onDisk, inPg);
    expect(plan.byTier.get("GOLD IV")).toEqual(["LA2_1"]);
  });

  it("no toca la que tampoco tiene tier en disco, y la cuenta aparte", () => {
    const plan = planTierRepairs(onDisk, inPg);
    expect(plan.unrepairable).toBe(1);
    for (const ids of plan.byTier.values()) expect(ids).not.toContain("LA2_2");
  });

  it("no toca la que ya tiene tier en Postgres, aunque el disco diga otra cosa", () => {
    const plan = planTierRepairs(
      [stored("LA2_3", "16.14", "SILVER II")],
      [{ match_id: "LA2_3", tier: "GOLD IV" }]
    );
    expect(plan.byTier.size).toBe(0);
    expect(plan.unrepairable).toBe(0);
  });
});
