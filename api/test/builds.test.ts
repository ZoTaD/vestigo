import { beforeEach, describe, expect, it } from "vitest";
import { cleanNote, cleanTags, deadlockApiGameBuilds, handleBuilds, MAX_PER_ACCOUNT, type BuildsDeps, type GameBuild } from "../src/builds/routes";
import { memStore, type BuildStore } from "../src/builds/store";

const ORIGIN = "https://vestigo.gg";
const NOW = Date.UTC(2026, 10, 15, 12);
const MIA: GameBuild = { buildId: 5000, heroId: 6, author: 42, name: "Mi Abrams", version: 3, updated: 1_700_000_000 };
const AJENA: GameBuild = { buildId: 6000, heroId: 6, author: 99, name: "De otro", version: 1, updated: 1_700_000_000 };

let store: BuildStore;
let pedidos: number[];
const deps = (over: Partial<BuildsDeps> = {}): BuildsDeps => ({
  store,
  accountId: 42,
  gameBuilds: async (acc) => {
    pedidos.push(acc);
    // El juego devuelve también alguna ajena (no debería, pero no se confía).
    return acc === 42 ? [MIA, AJENA] : [AJENA];
  },
  now: NOW,
  siteOrigin: ORIGIN,
  ...over,
});
const call = (method: string, path: string, d: BuildsDeps, body?: unknown, origin: string | null = ORIGIN) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  const req = new Request(`https://x${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return handleBuilds(req, new URL(`https://x${path}`), d);
};

beforeEach(() => {
  store = memStore(new Map([[42, { name: "ZoTaD", avatar: "https://avatars.steamstatic.com/a.jpg" }]]));
  pedidos = [];
});

describe("rutas", () => {
  it("no toca lo que no es /api/builds", async () => {
    expect(await call("GET", "/api/dle/me", deps())).toBeNull();
    expect(await call("GET", "/api/buildsx", deps())).toBeNull();
    expect((await call("GET", "/api/builds/nada", deps()))!.status).toBe(404);
  });
});

describe("publicar", () => {
  it("sube una build tuya con etiquetas y nota limpias", async () => {
    const res = (await call("POST", "/api/builds", deps(), { id: 5000, tags: ["tank", "tank", "nope", "lane"], note: "  <b>Para</b> la línea‮ " }))!;
    expect(res.status).toBe(201);
    const { build } = await res.json();
    expect(build).toEqual({ id: 5000, hero: 6, name: "Mi Abrams", tags: ["tank", "lane"], note: "Para la línea", created: NOW, updated: NOW });
    expect(pedidos).toEqual([42]);
  });

  it("vuelve a subirla actualiza sin cambiar la fecha de alta", async () => {
    await call("POST", "/api/builds", deps(), { id: 5000 });
    const res = (await call("POST", "/api/builds", deps({ now: NOW + 1000 }), { id: 5000, note: "nueva" }))!;
    expect(res.status).toBe(200);
    expect((await res.json()).build).toMatchObject({ created: NOW, updated: NOW + 1000, note: "nueva" });
  });

  it("no deja subir una build de otro aunque el juego la devuelva", async () => {
    const res = (await call("POST", "/api/builds", deps(), { id: 6000 }))!;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_yours" });
    expect(await store.get(6000)).toBeNull();
  });

  it("no acepta una nota con insultos", async () => {
    const res = (await call("POST", "/api/builds", deps(), { id: 5000, note: "build de mierda" }))!;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "note" });
    expect(pedidos).toEqual([]);
  });

  it("no deja subir una build que no existe", async () => {
    expect((await call("POST", "/api/builds", deps(), { id: 7777 }))!.status).toBe(403);
  });

  it("no deja pisar la subida de otra cuenta", async () => {
    await store.save({ buildId: 5000, heroId: 6, accountId: 7, name: "x", tags: [], note: "", createdAt: 1, updatedAt: 1 });
    expect((await call("POST", "/api/builds", deps(), { id: 5000 }))!.status).toBe(403);
    expect((await store.get(5000))!.accountId).toBe(7);
  });

  it("pide sesión, el mismo origen y un id válido", async () => {
    expect((await call("POST", "/api/builds", deps({ accountId: null }), { id: 5000 }))!.status).toBe(401);
    expect((await call("POST", "/api/builds", deps(), { id: 5000 }, "https://malo.example"))!.status).toBe(403);
    expect((await call("POST", "/api/builds", deps(), { id: 5000 }, null))!.status).toBe(403);
    for (const id of ["5000", -1, 1.5, 2 ** 31, null]) expect((await call("POST", "/api/builds", deps(), { id }))!.status).toBe(400);
    expect((await call("POST", "/api/builds", deps(), "no es json"))!.status).toBe(400);
    expect(pedidos).toEqual([]);
  });

  it("frena con el límite y si el juego no contesta", async () => {
    expect((await call("POST", "/api/builds", deps({ limit: async () => false }), { id: 5000 }))!.status).toBe(429);
    const caido = deps({ gameBuilds: async () => { throw new Error("caído"); } });
    expect((await call("POST", "/api/builds", caido, { id: 5000 }))!.status).toBe(503);
  });

  it("tiene un tope por cuenta", async () => {
    for (let i = 0; i < MAX_PER_ACCOUNT; i++) await store.save({ buildId: 10_000 + i, heroId: 6, accountId: 42, name: "x", tags: [], note: "", createdAt: 1, updatedAt: 1 });
    expect((await call("POST", "/api/builds", deps(), { id: 5000 }))!.status).toBe(409);
    // Actualizar una ya subida sigue andando.
    const ya = deps({ gameBuilds: async () => [{ ...MIA, buildId: 10_000 }] });
    expect((await call("POST", "/api/builds", ya, { id: 10_000 }))!.status).toBe(200);
  });
});

describe("mis builds", () => {
  it("las del juego (sólo tuyas) y las subidas", async () => {
    await call("POST", "/api/builds", deps(), { id: 5000, tags: ["fun"] });
    const res = (await call("GET", "/api/builds/mine", deps()))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.game.map((b: GameBuild) => b.buildId)).toEqual([5000]);
    expect(body.published).toEqual([{ id: 5000, hero: 6, name: "Mi Abrams", tags: ["fun"], note: "", created: NOW, updated: NOW }]);
  });

  it("sin sesión 401; si el juego no contesta, 503 con las subidas", async () => {
    expect((await call("GET", "/api/builds/mine", deps({ accountId: null })))!.status).toBe(401);
    const res = (await call("GET", "/api/builds/mine", deps({ gameBuilds: async () => { throw new Error("x"); } })))!;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "game_unavailable", published: [] });
  });
});

describe("borrar", () => {
  it("sólo la tuya, con sesión y mismo origen", async () => {
    await call("POST", "/api/builds", deps(), { id: 5000 });
    expect((await call("DELETE", "/api/builds/5000", deps({ accountId: 7 })))!.status).toBe(404);
    expect((await call("DELETE", "/api/builds/5000", deps(), undefined, "https://malo.example"))!.status).toBe(403);
    expect((await call("DELETE", "/api/builds/5000", deps({ accountId: null })))!.status).toBe(401);
    expect((await call("DELETE", "/api/builds/5000", deps()))!.status).toBe(200);
    expect(await store.get(5000)).toBeNull();
    expect((await call("DELETE", "/api/builds/5000", deps()))!.status).toBe(404);
  });
});

describe("listas públicas", () => {
  it("por héroe, con el autor y caché corta", async () => {
    await call("POST", "/api/builds", deps(), { id: 5000, note: "hola" });
    const res = (await call("GET", "/api/builds?hero=6", deps({ accountId: null })))!;
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await res.json()).builds).toEqual([
      { id: 5000, hero: 6, author: 42, authorName: "ZoTaD", authorAvatar: "https://avatars.steamstatic.com/a.jpg", name: "Mi Abrams", tags: [], note: "hola", created: NOW, updated: NOW },
    ]);
    expect((await (await call("GET", "/api/builds?hero=7", deps()))!.json()).builds).toEqual([]);
    expect((await call("GET", "/api/builds?hero=abc", deps()))!.status).toBe(400);
  });

  it("todas para el pipeline", async () => {
    await call("POST", "/api/builds", deps(), { id: 5000 });
    expect(await (await call("GET", "/api/builds/published", deps({ accountId: null })))!.json()).toEqual({ builds: [{ hero: 6, id: 5000 }] });
  });
});

describe("limpieza", () => {
  it("nota y etiquetas", () => {
    expect(cleanNote("a".repeat(500)).length).toBe(200);
    expect(cleanNote(42)).toBe("");
    expect(cleanNote("uno\n\n\ndos\u0000")).toBe("uno\ndos");
    expect(cleanTags("tank")).toEqual([]);
    expect(cleanTags(["tank", "lane", "fun", "late", "support"])).toEqual(["tank", "lane", "fun", "late"]);
  });
});

describe("deadlockApiGameBuilds", () => {
  const raw = (id: number, version: number, author = 42) => ({
    hero_build: { hero_id: 6, hero_build_id: id, author_account_id: author, name: ` B${id} `, version, last_updated_timestamp: id },
  });
  const fake = (byAuthor: unknown, search: unknown, status = 200) => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      const body = u.includes("by-author") ? byAuthor : search;
      return new Response(JSON.stringify(body), { status: u.includes("by-author") ? status : 200 });
    }) as unknown as typeof fetch;
    return { f, urls };
  };

  it("usa el juego en vivo y se queda con la última versión", async () => {
    const { f, urls } = fake([raw(1, 1), raw(1, 3), raw(2, 1)], []);
    const out = await deadlockApiGameBuilds(f, "https://api")(42);
    expect(out).toEqual([
      { buildId: 2, heroId: 6, author: 42, name: "B2", version: 1, updated: 2 },
      { buildId: 1, heroId: 6, author: 42, name: "B1", version: 3, updated: 1 },
    ]);
    expect(urls).toEqual(["https://api/builds/by-author/42"]);
  });

  it("si en vivo viene vacío o falla, busca en lo guardado", async () => {
    for (const status of [200, 500]) {
      const { f, urls } = fake([], [raw(9, 1)], status);
      expect((await deadlockApiGameBuilds(f, "https://api")(42)).map((b) => b.buildId)).toEqual([9]);
      expect(urls[1]).toBe("https://api/builds?author_id=42&only_latest=true&limit=100");
    }
  });
});
