import { describe, expect, it } from "vitest";
import dlCatalogJson from "@deadlock/catalog.json";
import dlHeroesJson from "@deadlock/heroes.json";
import dlItemsJson from "@deadlock/items.json";
import buildsIndex from "@deadlock/community-builds/index.json";
import abrams from "@deadlock/community-builds/6.json";
import { parseRoute, routePath, DEADLOCK_SECTIONS, DEADLOCK_PAGES } from "../src/route";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { metaFor, prerenderPages, BUILD_NAME_SEP } from "../src/prerender";
import { heroes as heroSlugs } from "../src/deadlockSlugs";
import {
  recommended,
  sortBuilds,
  wilson,
  winRate,
  shared,
  allItems,
  langMatches,
  MIN_MATCHES_RECOMMENDED,
  type CommunityBuild,
  type HeroBuildsFile,
  type BuildsIndexFile,
} from "../src/deadlockCommunityBuilds";
import { editorSearch } from "../src/deadlockBuildLinks";
import { decodeBuild } from "../src/deadlockBuilder";
import { decodeGuide } from "../src/deadlockBuildGuide";
import { BUILDS_COPY } from "../src/deadlockBuildsCopy";

const b = (over: Partial<CommunityBuild>): CommunityBuild => ({
  id: 1,
  name: "x",
  desc: "",
  author: 1,
  authorName: "a",
  authorAvatar: "",
  lang: 0,
  version: 1,
  updated: 0,
  published: 0,
  favorites: 0,
  matches: 0,
  wins: 0,
  players: 0,
  tags: [],
  style: "hybrid",
  souls: 0,
  key: [],
  cats: [],
  path: [],
  ...over,
});

describe("Builds: rutas", () => {
  it("Builds es pestaña y el Armador sigue siendo una página", () => {
    expect(DEADLOCK_SECTIONS).toContain("builds");
    expect(DEADLOCK_SECTIONS).not.toContain("builder");
    expect(DEADLOCK_PAGES).toContain("builder");
  });

  it("la portada, la biblioteca y la ficha van y vuelven", () => {
    for (const [path, detail] of [
      ["/es/deadlock/builds", undefined],
      ["/en/deadlock/builds/abrams", "abrams"],
      ["/en/deadlock/builds/abrams/697756", "abrams/697756"],
    ] as const) {
      const r = parseRoute(path);
      expect(r).toMatchObject({ view: "deadlock", dlSection: "builds", detail });
      expect(routePath(r)).toBe(path);
    }
  });

  it("el Armador viejo sigue en su dirección", () => {
    const r = parseRoute("/en/deadlock/builder");
    expect(r).toMatchObject({ view: "deadlock", dlSection: "builder" });
    expect(routePath(r)).toBe("/en/deadlock/builder");
  });
});

describe("Builds: datos publicados", () => {
  const idx = buildsIndex as unknown as BuildsIndexFile;
  const file = abrams as unknown as HeroBuildsFile;

  it("el índice tiene a todos los héroes de la tier list con hasta 10 builds", () => {
    const heroIds = (dlHeroesJson as { heroes: { heroId: number }[] }).heroes.map((h) => String(h.heroId));
    for (const id of heroIds) {
      expect(idx.heroes[id], `héroe ${id}`).toBeDefined();
      expect(idx.heroes[id].top.length).toBeLessThanOrEqual(10);
    }
  });

  it("cada build de un héroe tiene objetos que existen y números coherentes", () => {
    const items = (dlCatalogJson as { items: Record<string, unknown> }).items;
    expect(file.heroId).toBe(6);
    expect(file.builds.length).toBeGreaterThan(5);
    for (const x of file.builds) {
      expect(x.cats.length).toBeGreaterThan(0);
      for (const id of allItems(x)) expect(items[String(id)], `objeto ${id}`).toBeDefined();
      expect(x.wins).toBeLessThanOrEqual(x.matches);
      expect(x.path.length).toBeLessThanOrEqual(16);
      expect(x.key.length).toBeLessThanOrEqual(3);
    }
  });

  it("ningún nombre publicado trae propaganda de otro sitio", () => {
    for (const x of file.builds) {
      expect(x.name).not.toMatch(/\.(gg|com)\b/i);
      expect(x.authorName).not.toMatch(/\.(gg|com)\b/i);
    }
  });
});

describe("Builds: orden y recomendadas", () => {
  it("Wilson no deja que pocas partidas le ganen a muchas", () => {
    expect(wilson(7, 10)).toBeLessThan(wilson(5500, 10000));
    expect(winRate({ wins: 0, matches: 0 })).toBeNull();
  });

  it("ordena por partidas, por victoria (con límite) y por fecha", () => {
    const xs = [b({ id: 1, matches: 100, wins: 90, updated: 3 }), b({ id: 2, matches: 50_000, wins: 27_000, updated: 1 }), b({ id: 3, matches: 20_000, wins: 10_000, updated: 2 })];
    expect(sortBuilds(xs, "popular").map((x) => x.id)).toEqual([2, 3, 1]);
    // La de 100 partidas al 90 % no compite por victoria.
    expect(sortBuilds(xs, "winrate").map((x) => x.id)).toEqual([2, 3, 1]);
    expect(sortBuilds(xs, "new").map((x) => x.id)).toEqual([1, 3, 2]);
  });

  it("las elegidas por Vestigo mandan; si no hay, las de mejor victoria entre las muy jugadas", () => {
    const xs = [
      b({ id: 1, matches: 50_000, wins: 26_000 }),
      b({ id: 2, matches: 30_000, wins: 17_000 }),
      b({ id: 3, matches: 500, wins: 450 }),
      b({ id: 4, matches: 9_000, wins: 5_000 }),
      b({ id: 5, matches: 9_000, wins: 4_000 }),
    ];
    const r = recommended(xs);
    expect(r.byData).toBe(true);
    expect(r.builds.map((x) => x.id)).toEqual([2, 4, 1]);
    expect(r.builds.every((x) => x.matches >= MIN_MATCHES_RECOMMENDED)).toBe(true);
    const o = recommended([...xs, b({ id: 9, official: true, matches: 10 })]);
    expect(o).toEqual({ builds: [expect.objectContaining({ id: 9 })], byData: false });
  });

  it("prefiere las que se pueden leer si alcanzan", () => {
    const xs = [
      b({ id: 1, lang: 8, matches: 50_000, wins: 30_000 }),
      b({ id: 2, lang: 0, matches: 30_000, wins: 16_000 }),
      b({ id: 3, lang: 5, matches: 30_000, wins: 16_500 }),
      b({ id: 4, lang: 0, matches: 30_000, wins: 15_500 }),
    ];
    expect(recommended(xs, 3, "es").builds.map((x) => x.id)).toEqual([3, 2, 4]);
    // Con menos de 3 legibles, entran todas.
    expect(recommended(xs.slice(0, 2), 3, "es").builds.map((x) => x.id)).toEqual([1, 2]);
    expect(langMatches(26, "es")).toBe(true);
    expect(langMatches(26, "en")).toBe(false);
  });

  it("cuenta los objetos compartidos sin repetir", () => {
    expect(shared([1, 2, 3], [3, 3, 4, 1])).toBe(2);
  });
});

describe("Builds: del a la biblioteca al Editor", () => {
  it("arma un link que el Editor entiende: héroe, casillas, etapas, habilidades y nombre", () => {
    const build = { cats: [{ name: "#Citadel_HeroBuilds_EarlyGame", desc: "primero", items: [10, 11] }, { name: "Final", desc: "", items: [12, 10] }], path: [100, 200, 100] };
    const q = new URLSearchParams(editorSearch(6, build, (n) => (n.startsWith("#") ? "Inicio" : n), (id) => (id === 100 ? 1 : id === 200 ? 2 : undefined), "Mi build").slice(1));
    expect(decodeBuild(q.get("b")!)).toEqual({ heroId: 6, items: [10, 11, 12] });
    expect(decodeGuide(q.get("g")!).map((g) => [g.name, g.desc, g.items])).toEqual([
      ["Inicio", "primero", [10, 11]],
      ["Final", "", [12, 10]],
    ]);
    expect(q.get("a")).toBe("121");
    expect(q.get("n")).toBe("Mi build");
  });
});

describe("Builds: sitemap y <head>", () => {
  const idx = buildsIndex as unknown as BuildsIndexFile;
  const data = {
    dlHeroes: (dlCatalogJson as any).heroes,
    dlItems: (dlCatalogJson as any).items,
    dlHeroIds: (dlHeroesJson as any).heroes.map((h: { heroId: number }) => String(h.heroId)),
    dlItemIds: (dlItemsJson as any).items.map((i: { itemId: number }) => String(i.itemId)),
    dlBuilds: Object.fromEntries(Object.entries(idx.heroes).map(([id, h]) => [id, h.top.map((x) => ({ id: x.id, name: x.name }))])),
  } as SitemapData;

  it("lista la portada, cada héroe y sus builds, en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/deadlock/builds");
    expect(paths).toContain("/es/deadlock/builds/abrams");
    const first = idx.heroes["6"].top[0].id;
    expect(paths).toContain(`/es/deadlock/builds/abrams/${first}`);
    expect(paths).toContain("/en/deadlock/builder");
    const fichas = paths.filter((p) => /^\/en\/deadlock\/builds\/[^/]+\/\d+$/.test(p));
    expect(fichas.length).toBe(Object.values(idx.heroes).reduce((s, h) => s + h.top.length, 0));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("sin el índice no hay fichas de builds, y la pestaña sigue", () => {
    const paths = sitemapPaths({ ...data, dlBuilds: undefined });
    expect(paths).toContain("/en/deadlock/builds");
    expect(paths.some((p) => p.startsWith("/en/deadlock/builds/"))).toBe(false);
  });

  it("los títulos nombran al héroe y a la build", () => {
    const hero = metaFor(parseRoute("/en/deadlock/builds/abrams"), "en", "Abrams");
    expect(hero.title).toContain("Abrams Builds");
    const one = metaFor(parseRoute("/es/deadlock/builds/abrams/1"), "es", `Mi build${BUILD_NAME_SEP}Abrams`);
    expect(one.title).toContain("Mi build");
    expect(one.title).toContain("build de Abrams");
    const hub = metaFor(parseRoute("/en/deadlock/builds"), "en", null);
    expect(hub.title).toMatch(/Deadlock Builds/);
  });

  it("el prerender titula cada ficha con su build y su héroe", () => {
    const pages = prerenderPages(data);
    const first = idx.heroes["6"].top[0];
    const slug = heroSlugs.toSlug.get("6");
    const page = pages.find((p) => p.path === `/en/deadlock/builds/${slug}/${first.id}`);
    expect(page).toBeDefined();
    expect(page!.title).toContain(first.name || `Build #${first.id}`);
  });
});

describe("Builds: textos", () => {
  it("los dos idiomas tienen las mismas claves", () => {
    const keys = (o: object): string[] =>
      Object.entries(o)
        .flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]))
        .sort();
    expect(keys(BUILDS_COPY.es)).toEqual(keys(BUILDS_COPY.en));
  });
});
