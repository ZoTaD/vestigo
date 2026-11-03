import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleInventory } from "../src/cs2/inventory/handler";

const page = JSON.parse(readFileSync(new URL("./fixtures/cs2-inventory.json", import.meta.url), "utf-8"));
const ID = "76561198000000001";
type Route = (url: string) => Response;
const fake = (route: Route) => (async (input: RequestInfo | URL) => route(String(input))) as typeof fetch;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const call = (q: string, route: Route) => handleInventory(new URL(`https://vestigo.gg/api/cs2/inventory${q}`), fake(route));

describe("el intermediario del inventario", () => {
  it("devuelve la lista compacta y se cachea 15 minutos en la CDN", async () => {
    const r = await call(`?id=${ID}`, () => json(page));
    expect(r.status).toBe(200);
    expect(r.headers.get("netlify-cdn-cache-control")).toContain("s-maxage=900");
    const body = await r.json();
    expect(body.steamid).toBe(ID);
    expect(body.items.find((x: { name: string }) => x.name === "Operation Breakout Weapon Case").n).toBe(4);
  });
  it("resuelve un nombre de perfil con el XML de Steam", async () => {
    const pedidos: string[] = [];
    const r = await call("?id=zotad", (u) => {
      pedidos.push(u);
      return u.includes("?xml=1") ? new Response(`<profile><steamID64>${ID}</steamID64></profile>`) : json(page);
    });
    expect((await r.json()).steamid).toBe(ID);
    expect(pedidos[0]).toContain("/id/zotad?xml=1");
  });
  it("inventario privado → 403 private; perfil inexistente → 404 notfound; Steam con 429 → 503 busy", async () => {
    const priv = await call(`?id=${ID}`, () => json(null, 403));
    expect(await priv.json()).toEqual({ error: "private", steamid: ID });
    expect(priv.status).toBe(403);
    const nf = await call("?id=nadie", () => new Response("<response><error>The specified profile could not be found.</error></response>"));
    expect([nf.status, (await nf.json()).error]).toEqual([404, "notfound"]);
    const busy = await call(`?id=${ID}`, () => new Response("", { status: 429 }));
    expect([busy.status, (await busy.json()).error]).toEqual([503, "busy"]);
  });
  it("una entrada que no es un perfil → 400 bad, sin pedirle nada a Steam", async () => {
    let pidio = false;
    const r = await call("?id=https://example.com", () => ((pidio = true), json(page)));
    expect([r.status, (await r.json()).error, pidio]).toEqual([400, "bad", false]);
  });
  it("pagina hasta 3 veces y avisa si quedó algo afuera", async () => {
    let n = 0;
    const r = await call(`?id=${ID}`, () => (n++, json({ ...page, more_items: 1, last_assetid: String(n) })));
    const body = await r.json();
    expect(n).toBe(3);
    expect(body.partial).toBe(true);
    expect(body.items.find((x: { name: string }) => x.name === "Operation Breakout Weapon Case").n).toBe(12);
  });
});
