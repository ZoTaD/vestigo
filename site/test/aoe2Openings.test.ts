import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readActions, type Accion } from "../src/aoe2/api/replay";
import { classify, openings, FEUDAL, CASTLE, MILITIA, SCOUT, ARCHER, TOWER, TOWN_CENTER } from "../src/aoe2/api/openings";
import { slotsOf } from "../src/aoe2/api/slots";
import { unzipFirst } from "../src/aoe2/api/zip";
import { handleAoe2 } from "../src/aoe2/api/handler";
import { deflateRawSync, deflateSync } from "node:zlib";

const leer = (n: string) => readActions(gunzipSync(readFileSync(new URL(`../../games/aoe2/tools/tests/fixtures/${n}.body.gz`, import.meta.url))));
const A = (t: number, kind: Accion["kind"], id: number, player: number): Accion => ({ t, kind, id, player });

describe("aperturas de AoE2 (las mismas reglas que games/aoe2/tools/openings.py)", () => {
  it("lee las acciones de una grabación real", () => {
    const acc = leer("522237014");
    expect(acc.some((a) => a.player === 1 && a.kind === "research" && a.id === FEUDAL && a.t >= 380 && a.t <= 420)).toBe(true);
    expect(acc.some((a) => a.player === 1 && a.kind === "queue" && a.id === MILITIA)).toBe(true);
    expect(Math.max(...acc.map((a) => a.t))).toBeLessThanOrEqual(25 * 60);
  });
  it("aperturas de las grabaciones reales", () => {
    expect(openings(leer("522237014"))).toEqual({ 1: "maa", 2: "maa" });
    expect(openings(leer("521948686"))).toEqual({ 1: "archers", 2: "drush" });
  });
  it("scouts, drush, drush_fc, fc, boom, tower y other", () => {
    expect(classify([A(500, "research", FEUDAL, 1), A(640, "queue", SCOUT, 1)], 1)).toBe("scouts");
    const d = [A(200, "queue", MILITIA, 1), A(230, "queue", MILITIA, 1), A(400, "research", FEUDAL, 1)];
    expect(classify([...d, A(600, "queue", ARCHER, 1)], 1)).toBe("drush");
    expect(classify([...d, A(560, "research", CASTLE, 1)], 1)).toBe("drush_fc");
    const fc = [A(500, "research", FEUDAL, 1), A(700, "research", CASTLE, 1)];
    expect(classify(fc, 1)).toBe("fc");
    expect(classify([...fc, A(900, "build", TOWN_CENTER, 1), A(950, "build", TOWN_CENTER, 1)], 1)).toBe("boom");
    expect(classify([A(500, "research", FEUDAL, 1), A(560, "build", TOWER, 1), A(600, "build", TOWER, 1)], 1)).toBe("tower");
    expect(classify([], 1)).toBe("other");
  });
  it("sólo cuentan las acciones del jugador", () => {
    expect(classify([A(500, "research", FEUDAL, 1), A(600, "queue", SCOUT, 2), A(650, "queue", ARCHER, 1)], 1)).toBe("archers");
  });
  it("una grabación rota no tira", () => {
    expect(readActions(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("lugares de la partida (slotinfo)", () => {
  it("el número de jugador de cada perfil", () => {
    // `slotinfo` real de la partida 521941306 (base64 + zlib).
    const h = JSON.parse(readFileSync(new URL("./fixtures/aoe2/history.json", import.meta.url), "utf-8"));
    const m = h.matchHistoryStats.find((x: { id: number }) => x.id === 521941306);
    expect(slotsOf(m.slotinfo)).toEqual({ 9423131: 1, 4129359: 2 });
    expect(slotsOf("roto")).toEqual({});
  });
});

/** Un zip de un solo archivo, como los que da el servidor de grabaciones. */
function zip(nombre: string, datos: Uint8Array): Uint8Array {
  const comp = deflateRawSync(datos);
  const n = Buffer.from(nombre);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(8, 8);
  h.writeUInt32LE(comp.length, 18);
  h.writeUInt32LE(datos.length, 22);
  h.writeUInt16LE(n.length, 26);
  return Buffer.concat([h, n, comp]);
}

describe("grabación por la función", () => {
  const body = gunzipSync(readFileSync(new URL("../../games/aoe2/tools/tests/fixtures/521948686.body.gz", import.meta.url)));
  it("descomprime el primer archivo del zip", () => {
    expect(Buffer.from(unzipFirst(zip("AgeIIDE_Replay_1.aoe2record", body))!).equals(body)).toBe(true);
    expect(unzipFirst(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("opening?id&p: la apertura de cada perfil de la partida", async () => {
    const hist = { result: { code: 0 }, matchHistoryStats: [{ id: 521948686, mapname: "Arabian Desert.rms", matchtype_id: 6, startgametime: 1, completiontime: 2, slotinfo: null, matchhistorymember: [] }], profiles: [] };
    // slotinfo de verdad: perfil 9423131 en el lugar 1 y 196310 en el 2.
    const slot = Buffer.from(deflateSync(Buffer.from('2,[{"profileInfo.id":9423131,"stationID":1},{"profileInfo.id":196310,"stationID":2}]'))).toString("base64");
    hist.matchHistoryStats[0].slotinfo = slot as never;
    const f: typeof fetch = async (input) => {
      const u = String(input);
      if (u.includes("getRecentMatchHistory")) return new Response(JSON.stringify(hist));
      if (u.includes("replay")) return new Response(zip("r.aoe2record", body));
      return new Response("no", { status: 404 });
    };
    const r = await handleAoe2(new URL("http://x/api/aoe2/opening?id=521948686&p=9423131"), f);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 521948686, players: { 9423131: "archers", 196310: "drush" } });
  });
  it("parámetros de más (para saltear la caché) son 400", async () => {
    const f: typeof fetch = async () => new Response("no", { status: 500 });
    expect((await handleAoe2(new URL("http://x/api/aoe2/opening?id=5&p=9&z=123"), f)).status).toBe(400);
  });
  it("si el historial falla o no trae la partida, no se guarda un resultado vacío por 30 días", async () => {
    const conRec = (hist: Response): typeof fetch => async (input) => (String(input).includes("replay") ? new Response(zip("r.aoe2record", body)) : hist.clone());
    const caido = await handleAoe2(new URL("http://x/api/aoe2/opening?id=521948686&p=9423131"), conRec(new Response("x", { status: 500 })));
    expect(caido.status).toBe(502);
    expect(caido.headers.get("Cache-Control")).not.toContain("2592000");
    const sinPartida = await handleAoe2(new URL("http://x/api/aoe2/opening?id=521948686&p=9423131"), conRec(new Response(JSON.stringify({ result: { code: 0 }, matchHistoryStats: [], profiles: [] }))));
    expect(sinPartida.status).toBe(404);
    expect(sinPartida.headers.get("Cache-Control")).not.toContain("2592000");
  });
  it("una grabación enorme no se descomprime", () => {
    expect(unzipFirst(zip("r", new Uint8Array(40 * 1024 * 1024)))).toBeNull();
  });

  it("sin grabación (todavía no subida o vencida) es 404", async () => {
    const f: typeof fetch = async (input) => (String(input).includes("replay") ? new Response("", { status: 404 }) : new Response(JSON.stringify({ result: { code: 0 }, matchHistoryStats: [], profiles: [] })));
    expect((await handleAoe2(new URL("http://x/api/aoe2/opening?id=5&p=9"), f)).status).toBe(404);
  });
});
