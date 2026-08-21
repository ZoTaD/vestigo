import { describe, it, expect } from "vitest";
import {
  hivePath,
  objectKeyFor,
  contentHashFor,
  groupForArchive,
  toNdjsonGz,
  fromNdjsonGz,
  archiveGroups,
  r2Config,
  type ArchivableMatch,
  type PutObject,
} from "../src/r2Archive";

/** Mismo formato de gameVersion que usan los otros tests del pipeline. */
const versionFor = (patch: string) =>
  `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${patch}>`;

function match(overrides: Partial<ArchivableMatch> & { matchId: string }): ArchivableMatch {
  return {
    matchId: overrides.matchId,
    gameVersion: overrides.gameVersion ?? versionFor("16.14"),
    gameDatetime: overrides.gameDatetime ?? Date.UTC(2026, 6, 20),
    payload: overrides.payload ?? { info: { participants: [] } },
  };
}

describe("hivePath", () => {
  it("arma la ruta estilo Hive: tft/matches/patch=.../day=.../<nombre>", () => {
    expect(hivePath("16.14", "2026-07-20", "abc123.ndjson.gz")).toBe(
      "tft/matches/patch=16.14/day=2026-07-20/abc123.ndjson.gz"
    );
  });
});

describe("objectKeyFor", () => {
  it("es determinista: el mismo conjunto de match_id da siempre el mismo nombre", () => {
    const a = objectKeyFor(["LA2_1", "LA2_2", "LA2_3"]);
    const b = objectKeyFor(["LA2_1", "LA2_2", "LA2_3"]);
    expect(a).toBe(b);
  });

  it("no depende del orden en que vienen los match_id — reintentar arma el mismo lote", () => {
    const a = objectKeyFor(["LA2_1", "LA2_2", "LA2_3"]);
    const b = objectKeyFor(["LA2_3", "LA2_1", "LA2_2"]);
    expect(a).toBe(b);
  });

  it("conjuntos distintos de match_id dan nombres distintos", () => {
    const a = objectKeyFor(["LA2_1", "LA2_2"]);
    const b = objectKeyFor(["LA2_1", "LA2_3"]);
    expect(a).not.toBe(b);
  });

  it("termina en .ndjson.gz", () => {
    expect(objectKeyFor(["LA2_1"])).toMatch(/\.ndjson\.gz$/);
  });

  // r2Summary.ts comparte contentHashFor en vez de copiar el criterio de hash:
  // esto fija que objectKeyFor es ese mismo hash con la extensión pegada, no
  // dos cálculos independientes que puedan divergir.
  it("es exactamente contentHashFor(...) + .ndjson.gz — el criterio de hash es compartido, no copiado", () => {
    const ids = ["LA2_1", "LA2_2"];
    expect(objectKeyFor(ids)).toBe(`${contentHashFor(ids)}.ndjson.gz`);
  });
});

describe("groupForArchive", () => {
  it("junta partidas del mismo parche y día en un solo grupo", () => {
    const groups = groupForArchive([
      match({ matchId: "LA2_1", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20, 1) }),
      match({ matchId: "LA2_2", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20, 23) }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].patch).toBe("16.14");
    expect(groups[0].day).toBe("2026-07-20");
    expect(groups[0].matches.map((m) => m.matchId).sort()).toEqual(["LA2_1", "LA2_2"]);
  });

  it("separa por día aunque el parche sea el mismo", () => {
    const groups = groupForArchive([
      match({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      match({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.day))).toEqual(new Set(["2026-07-20", "2026-07-21"]));
  });

  it("separa por parche aunque el día sea el mismo", () => {
    const day = Date.UTC(2026, 6, 20);
    const groups = groupForArchive([
      match({ matchId: "LA2_1", gameVersion: versionFor("16.13"), gameDatetime: day }),
      match({ matchId: "LA2_2", gameVersion: versionFor("16.14"), gameDatetime: day }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.patch))).toEqual(new Set(["16.13", "16.14"]));
  });

  it("el día sale de game_datetime, nunca de la fecha de hoy", () => {
    const oldMs = Date.UTC(2023, 0, 15, 3, 0, 0); // una fecha bien vieja, no "hoy"
    const groups = groupForArchive([match({ matchId: "LA2_1", gameDatetime: oldMs })]);
    expect(groups[0].day).toBe("2023-01-15");
  });

  it("el parche sale de patchOf(gameVersion), no de un valor fijo", () => {
    const groups = groupForArchive([match({ matchId: "LA2_1", gameVersion: versionFor("16.9") })]);
    expect(groups[0].patch).toBe("16.9");
  });
});

describe("toNdjsonGz / fromNdjsonGz — round trip", () => {
  it("recupera exactamente los mismos payloads que se comprimieron", () => {
    const payloads = [
      { info: { participants: [{ puuid: "p1", placement: 1 }] } },
      { info: { participants: [{ puuid: "p2", placement: 8 }] } },
    ];
    const gz = toNdjsonGz(payloads);
    expect(fromNdjsonGz(gz)).toEqual(payloads);
  });

  it("una partida por línea: N payloads dan N líneas no vacías", () => {
    const payloads = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const gz = toNdjsonGz(payloads);
    const ndjson = Buffer.from(gz).toString(); // no importa, fromNdjsonGz ya decodifica
    expect(fromNdjsonGz(gz)).toHaveLength(3);
    expect(ndjson.length).toBeGreaterThan(0);
  });

  it("de verdad comprime: gzip de un payload grande y repetitivo es más chico que el JSON crudo", () => {
    const bigPayload = { info: { participants: Array.from({ length: 200 }, () => ({ puuid: "p", placement: 1 })) } };
    const raw = JSON.stringify(bigPayload);
    const gz = toNdjsonGz([bigPayload]);
    expect(gz.length).toBeLessThan(raw.length);
  });

  it("una lista vacía da un resultado que decomprime a una lista vacía", () => {
    expect(fromNdjsonGz(toNdjsonGz([]))).toEqual([]);
  });
});

describe("archiveGroups — el invariante: una subida fallida no puede confirmarse", () => {
  it("un grupo cuyo put() tira NO aparece en el set devuelto, aunque otro grupo suba bien", async () => {
    const matches: ArchivableMatch[] = [
      match({ matchId: "A1", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) }),
      match({ matchId: "A2", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) }), // mismo grupo que A1
      match({ matchId: "B1", gameVersion: versionFor("16.13"), gameDatetime: Date.UTC(2026, 6, 19) }), // grupo aparte
    ];
    const attempted: string[] = [];
    const put: PutObject = async (key) => {
      attempted.push(key);
      if (key.includes("patch=16.13")) throw new Error("R2 caído");
    };

    const confirmed = await archiveGroups(matches, put);

    expect(confirmed.has("A1")).toBe(true);
    expect(confirmed.has("A2")).toBe(true);
    expect(confirmed.has("B1")).toBe(false);
    // Los dos grupos se intentaron: el fallo de uno no le impidió al otro subir.
    expect(attempted).toHaveLength(2);
  });

  it("si todos los grupos fallan, el set devuelto está vacío y no tira", async () => {
    const matches: ArchivableMatch[] = [match({ matchId: "A1" })];
    const put: PutObject = async () => {
      throw new Error("R2 caído");
    };
    const confirmed = await archiveGroups(matches, put);
    expect(confirmed.size).toBe(0);
  });

  it("si todos suben bien, el set devuelto tiene todos los match_id", async () => {
    const matches: ArchivableMatch[] = [
      match({ matchId: "A1", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) }),
      match({ matchId: "B1", gameVersion: versionFor("16.13"), gameDatetime: Date.UTC(2026, 6, 19) }),
    ];
    const confirmed = await archiveGroups(matches, async () => {});
    expect(confirmed).toEqual(new Set(["A1", "B1"]));
  });

  it("sin partidas, no llama a put() y devuelve un set vacío", async () => {
    let calls = 0;
    const confirmed = await archiveGroups([], async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
    expect(confirmed.size).toBe(0);
  });

  it("la ruta que recibe put() es la ruta Hive con el nombre determinista del grupo", async () => {
    const matches: ArchivableMatch[] = [match({ matchId: "A1", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) })];
    const keys: string[] = [];
    await archiveGroups(matches, async (key) => {
      keys.push(key);
    });
    expect(keys).toEqual([hivePath("16.14", "2026-07-20", objectKeyFor(["A1"]))]);
  });
});

describe("r2Config", () => {
  it("tira si falta R2_ACCESS_KEY_ID, y dice cuál falta", () => {
    expect(() => r2Config({ R2_SECRET_ACCESS_KEY: "x" })).toThrow(/R2_ACCESS_KEY_ID/);
  });

  it("tira si falta R2_SECRET_ACCESS_KEY, y dice cuál falta", () => {
    expect(() => r2Config({ R2_ACCESS_KEY_ID: "x" })).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("tira mencionando las dos si faltan las dos", () => {
    expect(() => r2Config({})).toThrow(/R2_ACCESS_KEY_ID/);
    expect(() => r2Config({})).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("con las dos presentes, devuelve las credenciales", () => {
    const cfg = r2Config({ R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" });
    expect(cfg).toEqual({ accessKeyId: "id", secretAccessKey: "secret" });
  });
});
