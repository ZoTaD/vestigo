/**
 * El sobreviviente en 3D del Planificador de Zomboid (2026-10-01): los atuendos (outfit.ts), la descripción y el render
 * del servidor del panel. El visor (viewer3d.ts) no se prueba acá: necesita WebGL; se mira en el navegador (Task 5).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import outfits from "../../games/zomboid/data/outfits.json";
import { LangContext } from "../src/i18n";
import { parseRoute, type Route } from "../src/route";
import ZomboidPlanner from "../src/zomboid/planner/ZomboidPlanner";
import { bodyFor, describe as describeOutfit, outfitFor } from "../src/zomboid/planner/outfit";

const join = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

describe("outfit.ts", () => {
  it("cada profesión tiene hombre y mujer, con afiche y lo que lleva puesto", () => {
    expect(Object.keys(outfits.outfits)).toHaveLength(25);
    for (const prof of Object.keys(outfits.outfits))
      for (const s of ["m", "f"] as const) {
        const o = outfitFor(prof, s);
        expect(o.poster).toMatch(new RegExp(`^/zomboid/3d/poster/${prof}-${s}\\.webp$`));
        expect(o.wear.length).toBeGreaterThan(0);
      }
  });
  it("una profesión que no existe es la de Desempleado", () => {
    expect(outfitFor("no-existe", "m")).toEqual(outfitFor("unemployed", "m"));
  });
  it("el cuerpo de cada sexo", () => {
    expect(bodyFor("f")).toBe("/zomboid/3d/body-f.glb");
  });
  it("la descripción usa los nombres del juego en cada idioma", () => {
    const o = outfitFor("fireofficer", "m");
    const es = describeOutfit(o, "es", join);
    const pants = o.wear.find((w) => w.ref === "Base.Trousers_Fireman")!;
    expect(es).toContain(pants.es);
    expect(describeOutfit(o, "en", join)).toContain(pants.en);
  });
});

describe("el panel en el servidor", () => {
  // El mismo render que test/zomboidPlanner.test.ts: la pestaña sola, con el idioma del contexto.
  const route = (lang: "en" | "es"): Route => ({ ...parseRoute(`/${lang}/project-zomboid`), pzSection: "planner" });
  const html = (lang: "en" | "es") =>
    renderToStaticMarkup(
      createElement(
        LangContext.Provider,
        { value: { lang, setLang: () => undefined } },
        createElement(ZomboidPlanner, { route: route(lang), navigate: () => undefined }),
      ),
    );
  const panel = (lang: "en" | "es") => html(lang).match(/<section class="pz-page pzsu"[\s\S]*?<\/section>/)![0];

  it("trae el afiche de Desempleado con su texto y nunca 'cargando'", () => {
    const es = html("es");
    expect(es).toMatch(/<img[^>]+src="\/zomboid\/3d\/poster\/unemployed-m\.webp"[^>]+width="360"[^>]+height="480"/);
    expect(es).toMatch(/alt="[^"]{20,}"/);
    expect(es).toContain("Tu sobreviviente");
    expect(es).toContain("Ver en 3D");
    expect(es).not.toMatch(/cargando|armando el modelo/i);
    expect(html("en")).toContain("View in 3D");
  });
  it("lo que lleva puesto enlaza a Objetos", () => {
    const o = outfitFor("unemployed", "m");
    const conFicha = o.wear.find((w) => w.slug)!;
    expect(html("en")).toContain(`/en/project-zomboid/items/${conFicha.slug}`);
  });
  it("sin palabras que expliquen de dónde sale", () => {
    for (const lang of ["en", "es"] as const)
      expect(panel(lang).replace(/src="[^"]*"/g, "")).not.toMatch(/\.x\b|glTF|glb|game files|archivos del juego|extra[ií]d/i);
  });
});

describe("three no entra donde no debe", () => {
  it("sólo viewer3d.ts importa three, y sólo por import()", () => {
    const survivor = readFileSync(new URL("../src/zomboid/planner/Survivor.tsx", import.meta.url), "utf8");
    const planner = readFileSync(new URL("../src/zomboid/planner/ZomboidPlanner.tsx", import.meta.url), "utf8");
    for (const src of [survivor, planner]) expect(src).not.toMatch(/from "three/);
    expect(survivor).toMatch(/import\("\.\/viewer3d"\)/);
  });
});

describe("la profesión del Planificador y la de los atuendos", () => {
  // El Planificador usa el id de la ficha (`firefighter`) y los atuendos el del juego (`fireofficer`, en el `ref` del
  // índice). Si un parche suma una profesión que el juego llama de otra manera, este test dice cuál falta en GAME_ID.
  it("cada ficha de profesión viste su propio atuendo", async () => {
    const index = (await import("../../games/zomboid/data/index.json")).default as { sec: string; id: string; ref?: string[] }[];
    const profs = index.filter((e) => e.sec === "professions");
    expect(profs).toHaveLength(25);
    for (const p of profs)
      for (const s of ["m", "f"] as const)
        expect(outfitFor(p.id, s).poster, p.id).toBe(`/zomboid/3d/poster/${p.ref![0]}-${s}.webp`);
  });
});

describe("Lleva puesto, en español", () => {
  it("enlaza con el slug en español de la ficha de Objetos", () => {
    const route: Route = { ...parseRoute("/es/project-zomboid"), pzSection: "planner" };
    const html = renderToStaticMarkup(
      createElement(
        LangContext.Provider,
        { value: { lang: "es", setLang: () => undefined } },
        createElement(ZomboidPlanner, { route, navigate: () => undefined }),
      ),
    );
    // Las medias de Desempleado (`socks`): "Calcetines".
    expect(html).toContain('href="/es/project-zomboid/objetos/calcetines"');
  });
});

describe("el 3D se libera bien (revisión 3D-4)", () => {
  it("freeMeshes libera cada geometría y cada material una sola vez, también los de prendas sueltas", async () => {
    const { freeMeshes } = await import("../src/zomboid/planner/viewer3d");
    let n = 0;
    const res = () => ({ dispose: () => void n++ });
    const shared = res();
    const puesta = { geometry: res(), material: shared };
    const sacada = { geometry: res(), material: [res(), shared] }; // fuera de todo grafo: sólo en la caché de piezas
    // La puesta aparece dos veces (su escena y la caché): no se libera dos veces.
    expect(freeMeshes([puesta, sacada, puesta])).toEqual({ geometries: 2, materials: 2 });
    expect(n).toBe(4);
  });

  // Un visor de mentira: `mountViewer` avisa que se perdió el contexto antes de volver (o no) y cuenta sus `dispose`.
  const run = async (lose: boolean, still = () => true) => {
    const { start3d } = await import("../src/zomboid/planner/start3d");
    const modes: string[] = [];
    let disposed = 0;
    let adopted = 0;
    let failed = 0;
    const h = { setOutfit: async () => undefined, turn: () => undefined, reset: () => undefined, dispose: () => void disposed++ };
    await start3d({
      load: async () => ({
        mountViewer: async (_c, _o, _s, opts) => {
          if (lose) opts.onError(new Error("contexto perdido"));
          opts.onReady();
          return h;
        },
      }),
      canvas: () => ({}) as HTMLCanvasElement,
      want: () => ({ outfit: outfitFor("unemployed", "m"), sex: "m" }),
      current: still,
      reducedMotion: false,
      setMode: (m) => void modes.push(m),
      adopt: () => void adopted++,
      fail: () => void failed++,
    });
    return { modes, disposed, adopted, failed };
  };

  it("si el contexto se pierde mientras se arma, el visor se libera solo y nunca queda en 3D", async () => {
    expect(await run(true)).toEqual({ modes: ["failed"], disposed: 1, adopted: 0, failed: 0 });
  });
  it("sin problemas, queda en 3D y el panel se lo queda", async () => {
    expect(await run(false)).toEqual({ modes: ["3d"], disposed: 0, adopted: 1, failed: 0 });
  });
  it("un intento viejo (o el panel desmontado) se libera solo sin tocar el modo", async () => {
    // Vale al empezar y deja de valer mientras se arma (otro intento, o saliste de la pestaña).
    let calls = 0;
    expect(await run(false, () => calls++ < 1)).toEqual({ modes: [], disposed: 1, adopted: 0, failed: 0 });
  });
  it("un visor adoptado que falla cuando ya hay otro intento no tumba el nuevo", async () => {
    const { start3d } = await import("../src/zomboid/planner/start3d");
    let onError: (e: Error) => void = () => undefined;
    let current = true;
    let failed = 0;
    const h = { setOutfit: async () => undefined, turn: () => undefined, reset: () => undefined, dispose: () => undefined };
    await start3d({
      load: async () => ({
        mountViewer: async (_c, _o, _s, opts) => {
          onError = opts.onError;
          return h;
        },
      }),
      canvas: () => ({}) as HTMLCanvasElement,
      want: () => ({ outfit: outfitFor("unemployed", "m"), sex: "m" }),
      current: () => current,
      reducedMotion: false,
      setMode: () => undefined,
      adopt: () => undefined,
      fail: () => void failed++,
    });
    // Empezó otro intento y recién ahí el viejo pierde el contexto: no avisa.
    current = false;
    onError(new Error("contexto perdido"));
    expect(failed).toBe(0);
  });
  it("el mismo, mientras vale, sí avisa", async () => {
    const { start3d } = await import("../src/zomboid/planner/start3d");
    let onError: (e: Error) => void = () => undefined;
    let failed = 0;
    const h = { setOutfit: async () => undefined, turn: () => undefined, reset: () => undefined, dispose: () => undefined };
    await start3d({
      load: async () => ({
        mountViewer: async (_c, _o, _s, opts) => {
          onError = opts.onError;
          return h;
        },
      }),
      canvas: () => ({}) as HTMLCanvasElement,
      want: () => ({ outfit: outfitFor("unemployed", "m"), sex: "m" }),
      current: () => true,
      reducedMotion: false,
      setMode: () => undefined,
      adopt: () => undefined,
      fail: () => void failed++,
    });
    onError(new Error("contexto perdido"));
    expect(failed).toBe(1);
  });
});

/**
 * Peso del build: lee `site/dist/assets/` (o la carpeta de `PZ_DIST`) y se saltea si no hay build. En un worktree con el
 * servidor de desarrollo andando no se corre `vite build` a secas: se hace un build aparte con `--outDir <carpeta>` y
 * se corre con `PZ_DIST=<carpeta> npx vitest run test/zomboidSurvivor`.
 */
const DIST_DIR = process.env.PZ_DIST ? `${process.env.PZ_DIST.replace(/[\/]+$/, "")}/assets/` : `${fileURLToPath(new URL("../dist/assets/", import.meta.url))}`;
const HAY_BUILD = existsSync(DIST_DIR) && readdirSync(DIST_DIR).some((f) => /^viewer3d-.*\.js$/.test(f));
describe.skipIf(!HAY_BUILD)("peso del build", () => {
  const files = HAY_BUILD ? readdirSync(DIST_DIR).filter((f) => f.endsWith(".js")) : [];
  const read = (f: string) => readFileSync(`${DIST_DIR}${f}`);
  const gz = (f: string) => gzipSync(read(f), { level: 9 }).length;
  it("three va solo y entra en el presupuesto", () => {
    const three = files.filter((f) => /^three-/.test(f) || /^viewer3d-/.test(f));
    expect(three.length).toBeGreaterThan(1);
    expect(three.reduce((n, f) => n + gz(f), 0)).toBeLessThanOrEqual(170_000);
  });
  it("ni la cáscara ni vendor traen three", () => {
    for (const f of files.filter((f) => /^(vendor|shell|index)-/.test(f)))
      expect(read(f).toString("utf8"), f).not.toMatch(/WebGLRenderer|SkinnedMesh/);
  });
});
