import { beforeEach, describe, expect, it } from "vitest";
import { handleFollows, MAX_FOLLOWS, type FollowsDeps } from "../src/follows/routes";
import { memFollowStore, type FollowStore } from "../src/follows/store";

const ORIGIN = "https://vestigo.gg";
let store: FollowStore;
const deps = (over: Partial<FollowsDeps> = {}): FollowsDeps => ({ store, steamId: "76561198000000001", siteOrigin: ORIGIN, ...over });
const call = (method: string, path: string, d: FollowsDeps, body?: unknown, origin: string | null = ORIGIN) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const req = new Request(`https://x${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return handleFollows(req, new URL(`https://x${path}`), d);
};

beforeEach(() => {
  store = memFollowStore();
});

describe("seguidos", () => {
  it("no toca lo que no es /api/follows", async () => {
    expect(await call("GET", "/api/builds", deps())).toBeNull();
  });
  it("sin sesión es 401", async () => {
    expect((await call("GET", "/api/follows?game=aoe2", deps({ steamId: null })))!.status).toBe(401);
  });
  it("un juego desconocido es 400", async () => {
    expect((await call("GET", "/api/follows?game=nada", deps()))!.status).toBe(400);
  });
  it("vacío al principio", async () => {
    const r = await call("GET", "/api/follows?game=aoe2", deps());
    expect(await r!.json()).toEqual({ me: null, follows: [] });
  });
  it("guarda y devuelve lo guardado, sin repetidos", async () => {
    const put = await call("PUT", "/api/follows?game=aoe2", deps(), { me: 9423131, follows: [5, 7, 5] });
    expect(put!.status).toBe(200);
    expect(await (await call("GET", "/api/follows?game=aoe2", deps()))!.json()).toEqual({ me: 9423131, follows: [5, 7] });
  });
  it("cada cuenta ve lo suyo", async () => {
    await call("PUT", "/api/follows?game=aoe2", deps(), { me: 1, follows: [2] });
    expect(await (await call("GET", "/api/follows?game=aoe2", deps({ steamId: "76561198000000002" })))!.json()).toEqual({ me: null, follows: [] });
  });
  it("más del tope es 400", async () => {
    const muchos = Array.from({ length: MAX_FOLLOWS + 1 }, (_, i) => i + 1);
    expect((await call("PUT", "/api/follows?game=aoe2", deps(), { me: null, follows: muchos }))!.status).toBe(400);
  });
  it("ids que no son enteros positivos son 400", async () => {
    expect((await call("PUT", "/api/follows?game=aoe2", deps(), { me: -3, follows: [] }))!.status).toBe(400);
    expect((await call("PUT", "/api/follows?game=aoe2", deps(), { me: null, follows: ["x"] }))!.status).toBe(400);
  });
  it("un cuerpo gigante es 413 sin leerlo entero", async () => {
    const relleno = { me: null, follows: [], x: "a".repeat(64 * 1024) };
    expect((await call("PUT", "/api/follows?game=aoe2", deps(), relleno))!.status).toBe(413);
  });
  it("un PUT desde otro origen es 403", async () => {
    expect((await call("PUT", "/api/follows?game=aoe2", deps(), { me: 1, follows: [] }, "https://malo.com"))!.status).toBe(403);
  });
});
