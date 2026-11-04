import { beforeEach, describe, expect, it } from "vitest";
import { loadPool, PoolUnavailable, resetPoolCache } from "../src/dle/pool";
import { ensureDay, handleDle, runDaily, type DleDeps } from "../src/dle/routes";
import { memStore, type Store } from "../src/dle/store";
import type { Entry, Pool } from "../src/dle/types";

const e = (id: string, name: string, cols: Entry["cols"]): Entry => ({
  id,
  name,
  img: `/deadlock/game/images/${id}.webp`,
  cols,
  hints: [
    { kind: "text", text: `hint A ${name}` },
    { kind: "text", text: `hint B ${name}` },
  ],
  link: `deadlock/x/${name.toLowerCase()}`,
});
const POOL: Pool = {
  builtAt: "2026-11-04T00:00:00Z",
  heroes: [
    e("hero:1", "Alpha", { complexity: 1, health: 700, moveSpeed: 7, clip: 20, gunDps: 50, winRate: 50 }),
    e("hero:2", "Bravo", { complexity: 2, health: 800, moveSpeed: 8, clip: 30, gunDps: 60, winRate: 52 }),
    e("hero:3", "Charlie", { complexity: 3, health: 900, moveSpeed: 9, clip: 40, gunDps: 70, winRate: 48 }),
  ],
  items: [e("item:1", "Zeta", { slot: "Spirit", tier: 1, cost: 800, kind: "Passive", upgradeOf: "No", gives: null })],
  abilities: [e("ability:1", "Omega", { hero: "Alpha", slot: 1, ultimate: "No", cooldown: 10, effects: null })],
};
const DAY1 = Date.UTC(2026, 10, 5, 12, 0, 0);

let store: Store;
const deps = (over: Partial<DleDeps> = {}): DleDeps => ({ store, pool: async () => POOL, secret: "s", now: DAY1, steamId: null, ...over });
const get = (path: string, d: DleDeps) => handleDle(new Request(`https://x${path}`), new URL(`https://x${path}`), d);
const post = (path: string, body: unknown, d: DleDeps) =>
  handleDle(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), new URL(`https://x${path}`), d);
const answerFor = async (mode: "heroes" | "items" | "abilities", now = DAY1) =>
  (await ensureDay(store, POOL, mode, new Date(now).toISOString().slice(0, 10), "s")).answer;

beforeEach(() => {
  store = memStore();
  resetPoolCache();
});

describe("today", () => {
  it("nunca trae la respuesta antes de acertar", async () => {
    const answer = await answerFor("heroes");
    for (const steamId of [null, "u1"]) {
      const res = (await get("/api/dle/heroes/today", deps({ steamId })))!;
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(answer.name);
      expect(text).not.toContain(answer.id);
      const body = JSON.parse(text);
      expect(body).toMatchObject({ number: 1, date: "2026-11-05", mode: "heroes", solved: false, rows: [] });
      expect(body.columns.map((c: { key: string }) => c.key)).toEqual(["complexity", "health", "moveSpeed", "clip", "gunDps", "winRate"]);
    }
  });

  it("devuelve la partida empezada con sus filas", async () => {
    const answer = await answerFor("heroes");
    const wrong = POOL.heroes.find((h) => h.id !== answer.id)!;
    await post("/api/dle/heroes/guess", { name: wrong.name }, deps({ steamId: "u1" }));
    const body = await (await get("/api/dle/heroes/today", deps({ steamId: "u1" })))!.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].guess).toEqual({ id: wrong.id, name: wrong.name, img: wrong.img });
    expect(body.rows[0].cells).toHaveLength(6);
  });
});

describe("guess", () => {
  it("acertar resuelve y recién ahí muestra la respuesta", async () => {
    const answer = await answerFor("heroes");
    const res = (await post("/api/dle/heroes/guess", { name: answer.name.toUpperCase() }, deps({ steamId: "u1" })))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.solved).toBe(true);
    expect(body.answer).toEqual({ id: answer.id, name: answer.name, img: answer.img, link: answer.link });
    expect(body.row.cells.every((c: { mark: string }) => c.mark === "ok")).toBe(true);
  });

  it("un intento repetido da 409 y uno de otro modo da 400", async () => {
    const answer = await answerFor("heroes");
    const wrong = POOL.heroes.find((h) => h.id !== answer.id)!;
    expect((await post("/api/dle/heroes/guess", { name: wrong.name }, deps({ steamId: "u1" })))!.status).toBe(200);
    expect((await post("/api/dle/heroes/guess", { name: wrong.name }, deps({ steamId: "u1" })))!.status).toBe(409);
    expect((await post("/api/dle/heroes/guess", { name: "Zeta" }, deps({ steamId: "u1" })))!.status).toBe(400);
    expect((await post("/api/dle/nope/guess", { name: "Zeta" }, deps()))!.status).toBe(404);
  });

  it("una partida empezada antes de medianoche sigue contra su día", async () => {
    const before = Date.UTC(2026, 10, 5, 23, 59, 30);
    const after = Date.UTC(2026, 10, 6, 0, 0, 30);
    const yesterday = await answerFor("heroes", before);
    const wrong = POOL.heroes.find((h) => h.id !== yesterday.id)!;
    await post("/api/dle/heroes/guess", { name: wrong.name }, deps({ steamId: "u1", now: before }));
    const body = await (await post("/api/dle/heroes/guess", { name: yesterday.name }, deps({ steamId: "u1", now: after })))!.json();
    expect(body.solved).toBe(true);
    expect(body.date).toBe("2026-11-05");
  });

  it("sin cuenta compara igual y las pistas salen del número de intentos que manda la página", async () => {
    const answer = await answerFor("heroes");
    const wrong = POOL.heroes.find((h) => h.id !== answer.id)!;
    const body = await (await post("/api/dle/heroes/guess", { name: wrong.name, n: 3 }, deps()))!.json();
    expect(body.solved).toBe(false);
    expect(body.answer).toBeUndefined();
    expect(body.hints).toEqual([{ kind: "img", src: answer.img, blur: true }]);
    expect(await store.playerCount("2026-11-05", "heroes")).toBe(0);
  });

  it("frena con 429 cuando el límite lo dice", async () => {
    const res = (await post("/api/dle/heroes/guess", { name: "Alpha" }, deps({ limit: async () => false })))!;
    expect(res.status).toBe(429);
  });
});

describe("ranking y me", () => {
  it("trae los tres modos con tu fila", async () => {
    const answer = await answerFor("items");
    await store.saveUser("u1", "ZoTaD", "");
    await post("/api/dle/items/guess", { name: answer.name }, deps({ steamId: "u1" }));
    const body = await (await get("/api/dle/ranking", deps({ steamId: "u1" })))!.json();
    expect(Object.keys(body.modes)).toEqual(["heroes", "items", "abilities"]);
    expect(body.modes.items.top[0]).toMatchObject({ pos: 1, name: "ZoTaD", guesses: 1 });
    expect(body.modes.items.me).toMatchObject({ pos: 1, guesses: 1 });
    expect(body.modes.heroes.me).toBeNull();
    const me = await (await get("/api/dle/me", deps({ steamId: "u1" })))!.json();
    expect(me.items).toMatchObject({ streak: 1, played: 1, won: 1, today: "solved" });
    expect(me.heroes.today).toBe("none");
    expect((await get("/api/dle/me", deps()))!.status).toBe(401);
  });
});

describe("el pozo y el día", () => {
  it("usa la última copia buena si vestigo.gg no contesta", async () => {
    let up = true;
    const fetcher = async () => (up ? new Response(JSON.stringify(POOL)) : new Response("caído", { status: 502 }));
    expect((await loadPool("https://p", fetcher, 0)).heroes).toHaveLength(3);
    up = false;
    expect((await loadPool("https://p", fetcher, 2 * 3600_000)).heroes).toHaveLength(3);
  });

  it("sin ninguna copia, today da 503", async () => {
    await expect(loadPool("https://p", async () => new Response("", { status: 500 }), 0)).rejects.toBeInstanceOf(PoolUnavailable);
    const res = (await get("/api/dle/heroes/today", deps({ pool: async () => { throw new PoolUnavailable(); } })))!;
    expect(res.status).toBe(503);
  });

  it("el cron arma los tres días y correrlo de nuevo no cambia nada", async () => {
    await runDaily(store, POOL, "s", DAY1);
    const first = await Promise.all((["heroes", "items", "abilities"] as const).map((m) => store.day("2026-11-05", m)));
    expect(first.every(Boolean)).toBe(true);
    await runDaily(store, POOL, "otro secreto", DAY1);
    const again = await Promise.all((["heroes", "items", "abilities"] as const).map((m) => store.day("2026-11-05", m)));
    expect(again.map((d) => d!.answer.id)).toEqual(first.map((d) => d!.answer.id));
  });

  it("devuelve null si la ruta no es del juego", async () => {
    expect(await get("/api/me", deps())).toBeNull();
  });
});
