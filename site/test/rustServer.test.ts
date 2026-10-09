import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import server from "@rust/server.json";
import rsMeta from "../../games/rust/data/meta.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { cfgValue, filterConvars, serverCfg, startupLine, type Convar, type Setup } from "../src/rust/server/data";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

const vars = server.vars as Convar[];
const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la referencia de convars (2026-10-09)", () => {
  it("filtra por lado, comando y texto", () => {
    expect(filterConvars(vars, "command", "").every((v) => v.kind === "command")).toBe(true);
    expect(filterConvars(vars, "client", "").every((v) => v.kind === "var" && v.sides.includes("client"))).toBe(true);
    expect(filterConvars(vars, "all", "WORLDSIZE").map((v) => v.name)).toContain("server.worldsize");
    expect(filterConvars(vars, "all", "upkeep enabled").map((v) => v.name)).toContain("decay.upkeep");
  });

  it("arma la línea de arranque y el server.cfg", () => {
    const s: Setup = {
      hostname: 'Mi "server"', identity: "mi_server", description: "", url: "https://x.y", headerimage: "", port: 28015,
      maxplayers: 100, worldsize: 3500, seed: 42, saveinterval: 600, pve: true, rconPort: 28016, rconPassword: "x",
    };
    const win = startupLine(s, true);
    expect(win).toContain("RustDedicated.exe -batchmode");
    expect(win).toContain("+server.worldsize 3500");
    expect(win).toContain(`+server.hostname "Mi 'server'"`);
    expect(startupLine(s, false)).toContain("./RustDedicated");
    expect(serverCfg(s)).toBe('server.url "https://x.y"\nserver.saveinterval 600\nserver.pve true');
    expect(cfgValue(false)).toBe("false");
  });
});

describe("la pestaña Servidor", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/en/rust/server"));
  });

  it("sale entera en el prerender, en los dos idiomas", () => {
    expect(routePath(parseRoute("/es/rust/servidor"))).toBe("/es/rust/servidor");
    const es = render("es", "/es/rust/servidor");
    expect(es).toContain("Comandos y convars del servidor de Rust");
    expect(es).toContain("Wipes forzados");
    expect(es).toContain("RustDedicated.exe");
    expect(es).toContain("server.worldsize");
    expect(es).not.toContain("rs-loading");
  });

  it("entra al sitemap y es una aplicación web", () => {
    const data = {
      dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
      rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: [], pages: [] },
      dates: { rust: rsMeta.extractedAt },
    } as unknown as SitemapData;
    expect(sitemapPaths(data)).toContain("/es/rust/servidor");
    const p = prerenderPages(data).find((x) => x.path === "/en/rust/server")!;
    expect(p.title).toMatch(/^Rust Server Commands and Convars/);
    expect(JSON.stringify(p.jsonLd)).toContain("WebApplication");
  });
});
