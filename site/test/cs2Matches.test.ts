import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleMatches } from "../src/cs2/esports/handler";
import { parseMatches } from "../src/cs2/esports/matches";

const fixture = readFileSync(new URL("./fixtures/lp_matches.html", import.meta.url), "utf-8");
const ok = (html: string) => async () => new Response(JSON.stringify({ parse: { text: { "*": html } } }));

describe("partidos de Liquipedia", () => {
  it("un partido jugado, uno próximo y uno con rival a definir", () => {
    const ms = parseMatches(fixture);
    expect(ms).toHaveLength(3);
    expect(ms[0]).toMatchObject({ a: { slug: "Legacy", name: "Legacy" }, b: { slug: "B8" }, score: [1, 2], bo: 3 });
    expect(ms[0].tour).toEqual({ slug: "Intel_Extreme_Masters/2026/Beijing", name: "IEM Beijing 2026 - Group A" });
    expect(ms[0].t).toBeGreaterThan(1_700_000_000);
    expect(ms[1].score).toBeNull();
    expect(ms[1].bo).toBe(3);
    expect(ms[1].a.slug).toBe("Team_Liquid");
    expect(ms[1].a.short).toBe("Liquid");
    expect(ms[2].b.slug).toBeNull();
    expect(ms[2].b.name).toBe("");
    // Terminado y ganador salen del HTML, no del marcador.
    expect(ms[0]).toMatchObject({ finished: true, winner: "b" });
    expect(ms[1]).toMatchObject({ finished: false, winner: null });
  });
  it("un partido en vivo con marcador parcial no está terminado ni tiene ganador", () => {
    const live = fixture.split('<div class="match-info">')[1].replace(' data-finished="finished"', "").replace(/ match-info-header-(winner|loser)/g, "");
    const [m] = parseMatches('<div class="match-info">' + live);
    expect(m.score).toEqual([1, 2]);
    expect(m.finished).toBe(false);
    expect(m.winner).toBeNull();
  });
  it("sin partidos, una lista vacía", () => {
    expect(parseMatches("<div></div>")).toEqual([]);
  });
});

describe("la función de partidos", () => {
  it("responde con caché de 10 minutos en la CDN", async () => {
    const r = await handleMatches(ok(fixture));
    expect(r.status).toBe(200);
    expect(r.headers.get("Netlify-CDN-Cache-Control")).toContain("s-maxage=600");
    expect(r.headers.get("Netlify-CDN-Cache-Control")).toContain("durable");
    const body = await r.json();
    expect(body.matches).toHaveLength(3);
    expect(typeof body.at).toBe("number");
  });
  it("si Liquipedia falla, 502 con el código y caché corta en la CDN (no se reintenta en cada visita)", async () => {
    const bad = await handleMatches(async () => new Response("", { status: 429 }));
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: "upstream", status: 429 });
    expect(bad.headers.get("Netlify-CDN-Cache-Control")).toBe("public, durable, s-maxage=90");
  });
  it("un 200 de Liquipedia con error adentro es un 502, no una lista vacía", async () => {
    const bad = await handleMatches(async () => new Response(JSON.stringify({ error: { code: "ratelimited" } })));
    expect(bad.status).toBe(502);
  });
  it("con parámetros en la dirección, redirige a la dirección limpia sin pedirle nada a Liquipedia", async () => {
    let pedidos = 0;
    const r = await handleMatches(async () => (pedidos++, new Response("{}")), new URL("https://vestigo.gg/api/cs2/matches?x=1"));
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe("/api/cs2/matches");
    expect(pedidos).toBe(0);
  });
  it("si no hay red, 502", async () => {
    const bad = await handleMatches(async () => {
      throw new Error("sin red");
    });
    expect(bad.status).toBe(502);
  });
});
