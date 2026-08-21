import { describe, it, expect, afterAll } from "vitest";
import type { SqlQuery } from "../src/d1";
import { existsSync, rmSync } from "node:fs";
import {
  matchesQuery,
  lobbiesFromRows,
  loadLobbiesFromPg,
  newestPatchFromPg,
  newestPatchesFromPg,
} from "../src/pgStore";
import { saveMatch, loadLobbies } from "../src/store";
import type { RawMatch } from "../src/riot/normalize";

const root = "test/.tmppg";
afterAll(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

function rawMatch(version: string): RawMatch {
  return {
    info: {
      tft_set_number: 17,
      queue_id: 1100,
      tft_game_type: "standard",
      game_version: `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${version}>`,
      participants: [1, 2].map((placement) => ({
        puuid: "p" + placement,
        placement,
        level: 8,
        gold_left: 3,
        units: [{ character_id: "TFT17_Zoe", tier: 2, rarity: 2, itemNames: ["TFT_Item_Deathblade"] }],
        traits: [{ name: "TFT17_Sorcerer", num_units: 6, tier_current: 3, tier_total: 4 }],
      })),
    },
  } as RawMatch;
}

describe("matchesQuery", () => {
  it("filtra por set y por cola rankeada", () => {
    const q = matchesQuery(17, "", 200, 0);
    expect(q.sql).toContain("set_number = ?");
    expect(q.sql).toContain("queue_id = ?");
    // Los valores van ATADOS, nunca dentro del SQL: es lo que hace que un id raro
    // no pueda torcer la consulta.
    expect(q.params?.slice(0, 2)).toEqual([17, 1100]);
  });

  // "16.1" no puede traerse "16.14": el filtro va contra el marcador completo.
  it("filtra por el parche exacto, no por prefijo", () => {
    const q = matchesQuery(17, "16.1", 200, 0);
    expect(q.sql).toContain("game_version like ?");
    expect(q.params).toContain("%<Releases/16.1>%");
  });

  it("pagina", () => {
    const q = matchesQuery(17, "", 200, 400);
    expect(q.sql).toContain("limit ? offset ?");
    expect(q.params?.slice(-2)).toEqual([200, 400]);
  });

  it("ordena por match_id, sin lo cual paginar puede repetir o saltear", () => {
    expect(matchesQuery(17, "", 10, 0).sql).toContain("order by match_id");
  });
});

describe("lobbiesFromRows", () => {
  // El punto de todo el archivo: una partida leída de Postgres tiene que producir
  // el MISMO LobbyRecord que leída del disco, o las dos fuentes publican distinto.
  it("produce el mismo LobbyRecord que el lector de disco", () => {
    const dir = `${root}/same`;
    const match = rawMatch("16.14");
    saveMatch(dir, "LA2_1", "2026-07-26T00:00:00.000Z", match, "GOLD IV");

    const fromDisk = loadLobbies(dir);
    const fromPg = lobbiesFromRows([{ match_id: "LA2_1", tier: "GOLD IV", payload: match }]);

    expect(fromPg).toEqual(fromDisk);
  });

  it("deja el tier vacío cuando la columna es null", () => {
    const [lobby] = lobbiesFromRows([
      { match_id: "LA2_2", tier: null, payload: rawMatch("16.14") },
    ]);
    expect(lobby.tier).toBe("");
  });
});

describe("loadLobbiesFromPg", () => {
  // PostgREST puede devolver menos filas que el `limit` pedido sin que eso
  // signifique que no hay más — ver el describe de newestPatchFromPg más abajo,
  // donde se verifica el caso real. Cortar por "vino menos de lo pedido" (en vez
  // de "vino vacío") confundiría ese tope con el fin de los datos: acá la página
  // pedida (200) siempre está por debajo del tope real del servidor, así que
  // este test por sí solo no lo hubiera detectado, pero la condición de corte
  // tiene que ser la misma que la de newestPatchFromPg para no dejar la misma
  // trampa armada para el próximo que suba PAGE.
  it("sigue pidiendo páginas hasta que una viene vacía", async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        match_id: `LA2_${i}`,
        tier: "",
        payload: JSON.stringify(rawMatch("16.14")) as never,
      }));
    const pages = [page(200), page(3), []];
    const asked: SqlQuery[] = [];
    const fetchRows = async (q: SqlQuery) => {
      asked.push(q);
      return pages.shift() ?? [];
    };

    const lobbies = await loadLobbiesFromPg(fetchRows, 17, "16.14", 200);
    expect(lobbies.length).toBe(203);
    expect(asked.length).toBe(3);
    // 203 y no 400: el offset avanza por las filas que VINIERON, no por las que se
    // pidieron. Si el servidor corta una página por su cuenta y el offset avanza
    // igual por el `limit`, las filas que no vinieron se saltean en silencio.
    expect(asked[2].params?.slice(-1)).toEqual([203]);
  });
});

describe("newestPatchFromPg", () => {
  it("elige por número y no alfabéticamente", async () => {
    // El corte es por página vacía, así que el fetcher tiene que devolver una
    // eventualmente, o el loop de paginación no termina nunca.
    const pages = [
      [
        { game_version: "a [PUBLIC] <Releases/16.9>" },
        { game_version: "a [PUBLIC] <Releases/16.14>" },
        { game_version: "a [PUBLIC] <Releases/16.13>" },
      ],
    ];
    const fetchRows = async () => pages.shift() ?? [];
    expect(await newestPatchFromPg(fetchRows, 17)).toBe("16.14");
  });

  // Sin paginar, un límite único puede cortar la respuesta antes de llegar a
  // la fila con el parche más nuevo, y la función elegiría en silencio uno viejo.
  it("sigue pidiendo páginas hasta que una viene vacía, y no se queda con el parche de la primera", async () => {
    const page = (versions: string[]) =>
      versions.map((v) => ({ game_version: `a [PUBLIC] <Releases/${v}>` }));
    const pages = [
      page(Array.from({ length: 200 }, () => "16.9")),
      page(["16.13", "16.14"]),
      [],
    ];
    const asked: SqlQuery[] = [];
    const fetchRows = async (q: SqlQuery) => {
      asked.push(q);
      return pages.shift() ?? [];
    };

    expect(await newestPatchFromPg(fetchRows, 17, 200)).toBe("16.14");
    expect(asked.length).toBe(3);
    expect(asked[1].params?.slice(-1)).toEqual([200]);
    // 202 y no 400: el offset avanza por las filas que vinieron (200 + 2).
    expect(asked[2].params?.slice(-1)).toEqual([202]);
  });

  // El caso real, verificado contra la base de este proyecto: pedir
  // limit=5000 devuelve 1000 filas (content-range: 0-999/13413), sin importar
  // el limit pedido — PostgREST tiene su propio tope de 1000 filas por
  // respuesta. Cortar por "vino menos de lo pedido" confunde ese tope con el
  // fin de los datos y se queda para siempre con el parche de la primera
  // página, que es siempre la de match_id más bajo (la más vieja).
  it("no confunde el tope de 1000 filas de PostgREST con el fin de los datos", async () => {
    const page = (versions: string[]) =>
      versions.map((v) => ({ game_version: `a [PUBLIC] <Releases/${v}>` }));
    const pages = [
      page(Array.from({ length: 1000 }, () => "16.9")), // el servidor cortó en 1000, no en los 5000 pedidos
      page(["16.14"]),
    ];
    const fetchRows = async () => pages.shift() ?? [];

    expect(await newestPatchFromPg(fetchRows, 17, 5000)).toBe("16.14");
  });
});

describe("newestPatchesFromPg", () => {
  it("elige los N más nuevos por número, no alfabéticamente", async () => {
    const pages = [
      [
        { game_version: "a [PUBLIC] <Releases/16.9>" },
        { game_version: "a [PUBLIC] <Releases/16.14>" },
        { game_version: "a [PUBLIC] <Releases/16.13>" },
      ],
    ];
    const fetchRows = async () => pages.shift() ?? [];
    expect(await newestPatchesFromPg(fetchRows, 17, 2)).toEqual(["16.14", "16.13"]);
  });

  // Misma trampa que newestPatchFromPg: si cortara por "vino menos de lo
  // pedido", se quedaría con los parches de la primera página (los más viejos).
  it("sigue pidiendo páginas hasta que una viene vacía", async () => {
    const page = (versions: string[]) =>
      versions.map((v) => ({ game_version: `a [PUBLIC] <Releases/${v}>` }));
    const pages = [
      page(Array.from({ length: 200 }, () => "16.9")),
      page(["16.13", "16.14"]),
      [],
    ];
    const fetchRows = async (q: SqlQuery) => pages.shift() ?? [];
    expect(await newestPatchesFromPg(fetchRows, 17, 2, 200)).toEqual(["16.14", "16.13"]);
  });
});
