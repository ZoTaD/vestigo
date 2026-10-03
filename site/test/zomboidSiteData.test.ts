import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import index from "@zomboid/index.json";
import meta from "@zomboid/meta.json";
import { PZ_SHARDS, pzShard } from "../src/zomboid/shard";

/**
 * Los datos del sitio de Project Zomboid (2026-09-30) que arma `games/zomboid/tools/site.py`: una lista liviana por
 * pestaña (Objetos y Recetas) y las fichas repartidas en 100 archivos por un hash del slug, con las relaciones ya
 * resueltas. Se prueba con los archivos reales: si un parche rompe un enlace o engorda un archivo, salta acá.
 */
type Loc = { en: string; es: string };
type Ref = { id: string; en: string; es: string; icon?: string | null };
type Opt = Ref & { n?: number };
type SkillLvl = { skill: Loc; lvl: number };
type FichaObjeto = {
  id: string; en: string; es: string; cat: string; catName: Loc;
  variants: { gameId: string; en: string; es: string; icon: string | null; type: string; w: number | null;
              stats: Record<string, unknown>; tags: string[]; tip?: Loc }[];
  makes: Ref[]; uses: Ref[]; tools: Ref[];
  fixedWith: { fixer: Ref; uses: number; skills: SkillLvl[] }[];
  fixes: Ref[]; teaches: Ref[]; research: Ref[];
  skillBook?: { skill: Loc; from: number; levels: number; mult: number };
};
type Output =
  | { n: number; max?: number; item: Ref }
  | { n: number; max?: number; choices: { from: Ref[]; item: Ref }[] }
  | { entity: Loc };
type FichaReceta = {
  id: string; en: string; es: string; kind: "craft" | "build"; cat: string; catName: Loc; time: number;
  skills: SkillLvl[]; xp: { skill: Loc; xp: number }[];
  inputs: { n: number; max?: number; keep: boolean; tag?: string; fluid?: Loc; any?: true; opts: Opt[] }[];
  outputs: Output[];
  stations: Loc[];
  learn: null | { books: Ref[]; skills: SkillLvl[]; anySkill?: true; research: Ref[]; traits: Ref[]; professions: Ref[] };
  tip?: Loc;
  /** El mismo de su fila en la lista: de `items/` o, si es de construcción, de `build/`. */
  icon: string | null;
};
type Cats = Record<string, Loc & { n: number }>;
type ItemRow = { id: string; en: string; es: string; cat: string; icon: string | null; w: number | null; n: number; t: string };
type RecipeRow = { id: string; en: string; es: string; cat: string; kind: "craft" | "build"; icon: string | null };
type Entry = { sec: string; id: string; en: string; es: string; ref: string[] };

const FILES = import.meta.glob("../../games/zomboid/data/site/**/*.json", { eager: true, import: "default" }) as Record<
  string,
  unknown
>;
const file = <T,>(rel: string): T => {
  const hit = Object.entries(FILES).find(([k]) => k.endsWith(`/data/site/${rel}`));
  if (!hit) throw new Error(`falta data/site/${rel}`);
  return hit[1] as T;
};
/** Los shards de una pestaña: "07" → { slug: ficha }. */
const shards = <T,>(dir: string): Map<string, Record<string, T>> => {
  const out = new Map<string, Record<string, T>>();
  for (const [k, v] of Object.entries(FILES)) {
    const m = k.match(new RegExp(`/data/site/${dir}/(\\d\\d)\\.json$`));
    if (m) out.set(m[1], v as Record<string, T>);
  }
  return out;
};

const ITEMS_LIST = file<{ cats: Cats; rows: ItemRow[] }>("items-list.json");
const RECIPES_LIST = file<{ cats: Cats; rows: RecipeRow[] }>("recipes-list.json");
const ITEM_SHARDS = shards<FichaObjeto>("items");
const RECIPE_SHARDS = shards<FichaReceta>("recipes");
const INDEX = index as Entry[];
const bySec = (sec: string) => INDEX.filter((e) => e.sec === sec);

const item = (slug: string): FichaObjeto => {
  const f = ITEM_SHARDS.get(pzShard(slug))?.[slug];
  if (!f) throw new Error(`no está la ficha de objeto ${slug}`);
  return f;
};
const recipe = (slug: string): FichaReceta => {
  const f = RECIPE_SHARDS.get(pzShard(slug))?.[slug];
  if (!f) throw new Error(`no está la ficha de receta ${slug}`);
  return f;
};
const allItems = () => [...ITEM_SHARDS.values()].flatMap((s) => Object.values(s));
const allRecipes = () => [...RECIPE_SHARDS.values()].flatMap((s) => Object.values(s));
/** El slug de la ficha que muestra tal id del juego. */
const slugOf = (sec: string, gameId: string) => bySec(sec).find((e) => e.ref.includes(gameId))?.id;

const ITEM_IDS = new Set(ITEMS_LIST.rows.map((r) => r.id));
const RECIPE_IDS = new Set(RECIPES_LIST.rows.map((r) => r.id));

describe("pzShard", () => {
  it("es FNV-1a de 32 bits sobre el UTF-8 del slug, módulo 100, con dos dígitos (igual que site.py)", () => {
    // Vectores conocidos de FNV-1a 32: "" = 0x811c9dc5 (…61), "a" = 0xe40c292c (…20), "foobar" = 0xbf9cf968 (…20).
    expect(PZ_SHARDS).toBe(100);
    expect(pzShard("")).toBe("61");
    expect(pzShard("a")).toBe("20");
    expect(pzShard("foobar")).toBe("20");
    expect(pzShard("crowbar")).toMatch(/^\d\d$/);
  });

  it("hay 100 shards por pestaña, del 00 al 99", () => {
    const want = Array.from({ length: PZ_SHARDS }, (_, i) => String(i).padStart(2, "0"));
    expect([...ITEM_SHARDS.keys()].sort()).toEqual(want);
    expect([...RECIPE_SHARDS.keys()].sort()).toEqual(want);
  });

  it("cada fila de la lista de objetos está en el shard que dice pzShard, con su id", () => {
    for (const r of ITEMS_LIST.rows) {
      const f = ITEM_SHARDS.get(pzShard(r.id))?.[r.id];
      expect(f?.id, r.id).toBe(r.id);
    }
  });

  it("cada fila de la lista de recetas está en el shard que dice pzShard, con su id", () => {
    for (const r of RECIPES_LIST.rows) {
      const f = RECIPE_SHARDS.get(pzShard(r.id))?.[r.id];
      expect(f?.id, r.id).toBe(r.id);
    }
  });
});

describe("cobertura: una ficha por entrada del índice", () => {
  for (const [sec, list, sh] of [
    ["items", ITEMS_LIST.rows, ITEM_SHARDS],
    ["recipes", RECIPES_LIST.rows, RECIPE_SHARDS],
  ] as const) {
    it(`${sec}: cada ficha del índice está exactamente una vez, en su shard, y la lista va en el orden del índice`, () => {
      const seen = new Map<string, number>();
      for (const [nn, s] of sh) {
        for (const slug of Object.keys(s)) {
          seen.set(slug, (seen.get(slug) ?? 0) + 1);
          expect(pzShard(slug), `${sec}/${slug} está en ${nn}`).toBe(nn);
        }
      }
      const entries = bySec(sec);
      expect(seen.size).toBe(entries.length);
      for (const e of entries) expect(seen.get(e.id), `${sec}/${e.id}`).toBe(1);
      expect(list.map((r) => r.id)).toEqual(entries.map((e) => e.id));
      for (const [i, r] of list.entries()) {
        expect([r.en, r.es], r.id).toEqual([entries[i].en, entries[i].es]);
      }
    });
  }

  it("la lista de objetos: una fila por ficha, con los datos de la primera variante y la cantidad de variantes", () => {
    const e = bySec("items").find((x) => x.id === "crowbar")!;
    const row = ITEMS_LIST.rows.find((r) => r.id === "crowbar")!;
    expect(row).toEqual({ id: "crowbar", en: "Crowbar", es: "Palanca", cat: "ToolWeapon", icon: "Crowbar", w: 2, n: e.ref.length, t: "weapon" });
    for (const r of ITEMS_LIST.rows) expect(r, r.id).not.toHaveProperty("stats");
  });

  it("las categorías de las listas cuentan sus filas y tienen nombre en los dos idiomas", () => {
    for (const [cats, rows] of [
      [ITEMS_LIST.cats, ITEMS_LIST.rows],
      [RECIPES_LIST.cats, RECIPES_LIST.rows],
    ] as const) {
      const count = new Map<string, number>();
      for (const r of rows) count.set(r.cat, (count.get(r.cat) ?? 0) + 1);
      expect(new Set(Object.keys(cats))).toEqual(new Set(count.keys()));
      for (const [k, c] of Object.entries(cats)) {
        expect(c.n, k).toBe(count.get(k));
        expect(c.en && c.es, k).toBeTruthy();
      }
    }
  });

  it("las recetas sin categoría van a Miscellaneous, y cada ficha trae el nombre de su categoría", () => {
    expect(RECIPES_LIST.cats.Miscellaneous?.n).toBeGreaterThanOrEqual(36);
    for (const r of allRecipes()) expect(r.catName, r.id).toEqual({ en: RECIPES_LIST.cats[r.cat].en, es: RECIPES_LIST.cats[r.cat].es });
    for (const f of allItems()) expect(f.catName, f.id).toEqual({ en: ITEMS_LIST.cats[f.cat].en, es: ITEMS_LIST.cats[f.cat].es });
  });
});

describe("enlaces: todo Ref apunta a una ficha que existe", () => {
  const traits = new Set(bySec("traits").map((e) => e.id));
  const professions = new Set(bySec("professions").map((e) => e.id));

  it("desde los objetos: recetas en recipes-list y objetos en items-list", () => {
    for (const f of allItems()) {
      for (const r of [...f.makes, ...f.uses, ...f.tools, ...f.teaches, ...f.research]) {
        expect(RECIPE_IDS.has(r.id), `${f.id} → receta ${r.id}`).toBe(true);
      }
      for (const r of [...f.fixedWith.map((x) => x.fixer), ...f.fixes]) {
        expect(ITEM_IDS.has(r.id), `${f.id} → objeto ${r.id}`).toBe(true);
      }
    }
  });

  it("desde las recetas: objetos en items-list, rasgos y profesiones en el índice", () => {
    for (const r of allRecipes()) {
      const refs: Ref[] = r.inputs.flatMap((i) => i.opts);
      for (const o of r.outputs) {
        if ("item" in o) refs.push(o.item);
        if ("choices" in o) for (const c of o.choices) refs.push(c.item, ...c.from);
      }
      if (r.learn) refs.push(...r.learn.books, ...r.learn.research);
      for (const x of refs) expect(ITEM_IDS.has(x.id), `${r.id} → objeto ${x.id}`).toBe(true);
      for (const t of r.learn?.traits ?? []) expect(traits.has(t.id), `${r.id} → rasgo ${t.id}`).toBe(true);
      for (const p of r.learn?.professions ?? []) expect(professions.has(p.id), `${r.id} → profesión ${p.id}`).toBe(true);
    }
  });
});

describe("simetría entre recetas y objetos", () => {
  it("lo que sale de una receta la tiene en makes; lo que entra, en uses (se gasta) o en tools (keep)", () => {
    const has = (list: Ref[], id: string) => list.some((x) => x.id === id);
    for (const r of allRecipes()) {
      for (const o of r.outputs) {
        const made = "item" in o ? [o.item] : "choices" in o ? o.choices.map((c) => c.item) : [];
        for (const x of made) expect(has(item(x.id).makes, r.id), `${x.id}.makes ∌ ${r.id}`).toBe(true);
      }
      for (const i of r.inputs) {
        for (const x of i.opts) {
          const f = item(x.id);
          expect(has(i.keep ? f.tools : f.uses, r.id), `${x.id}.${i.keep ? "tools" : "uses"} ∌ ${r.id}`).toBe(true);
        }
      }
    }
  });

  it("y al revés: makes, uses y tools de un objeto sólo nombran recetas que lo tienen ahí", () => {
    for (const f of allItems()) {
      for (const ref of f.makes) {
        const r = recipe(ref.id);
        const made = r.outputs.flatMap((o) => ("item" in o ? [o.item.id] : "choices" in o ? o.choices.map((c) => c.item.id) : []));
        expect(made, `${ref.id} no hace ${f.id}`).toContain(f.id);
      }
      for (const [key, keep] of [["uses", false], ["tools", true]] as const) {
        for (const ref of f[key]) {
          const r = recipe(ref.id);
          const ok = r.inputs.some((i) => i.keep === keep && i.opts.some((o) => o.id === f.id));
          expect(ok, `${f.id}.${key} → ${ref.id}`).toBe(true);
        }
      }
    }
  });

  it("fixedWith y fixes son el mismo dato visto de los dos lados", () => {
    for (const f of allItems()) {
      for (const fx of f.fixedWith) expect(item(fx.fixer.id).fixes.some((x) => x.id === f.id), `${fx.fixer.id} repara ${f.id}`).toBe(true);
      for (const x of f.fixes) expect(item(x.id).fixedWith.some((fx) => fx.fixer.id === f.id), `${x.id} se repara con ${f.id}`).toBe(true);
    }
  });
});

describe("casos conocidos", () => {
  it("crowbar: 2 variantes y se fabrica forjándola", () => {
    const f = item("crowbar");
    expect(f.variants.map((v) => v.gameId)).toEqual(["Base.Crowbar", "Base.CrowbarForged"]);
    expect(f.variants[0]).toMatchObject({ en: "Crowbar", es: "Palanca", icon: "Crowbar", type: "weapon", w: 2 });
    expect(f.variants[0].stats.maxDamage).toBe(1.15);
    expect(f.variants[0].tags).toContain("base:crowbar");
    expect(f.makes.map((r) => r.id)).toContain("forge-crowbar");
    expect(f.catName.es).toBeTruthy();
    // Investigar una palanca enseña a forjarla.
    expect(f.research.map((r) => r.id)).toContain("forge-crowbar");
  });

  it("saw-log: 1 tronco, una sierra cualquiera (base:saw) que no se gasta, y 3 tablas", () => {
    const r = recipe("saw-log");
    expect(r).toMatchObject({ en: "Saw Log", es: "Aserrar troncos", kind: "craft", cat: "Carpentry", learn: null });
    const log = r.inputs.find((i) => i.opts.some((o) => o.id === "log"));
    expect(log).toMatchObject({ n: 1, keep: false });
    const saw = r.inputs.find((i) => i.tag === "base:saw");
    expect(saw?.keep).toBe(true);
    expect(saw!.opts.length).toBeGreaterThan(1);
    expect(saw!.opts.map((o) => o.id)).toContain("hacksaw");
    expect(r.outputs).toContainEqual({ n: 3, item: { id: "plank", en: "Plank", es: "Tabla", icon: "Plank" } });
    expect(r.xp[0]).toEqual({ skill: { en: "Carpentry", es: "Carpintería" }, xp: 5 });
    expect(item("hacksaw").tools.map((x) => x.id)).toContain("saw-log");
    expect(item("log").uses.map((x) => x.id)).toContain("saw-log");
    expect(RECIPES_LIST.rows.find((x) => x.id === "saw-log")).toEqual({
      id: "saw-log", en: "Saw Log", es: "Aserrar troncos", cat: "Carpentry", kind: "craft", icon: "Plank",
    });
  });

  it("un libro de habilidad trae skillBook con su multiplicador", () => {
    const f = item(slugOf("items", "Base.BookAiming1")!);
    expect(f.skillBook).toEqual({ skill: { en: "Aiming", es: "Puntería" }, from: 1, levels: 2, mult: 1.5 });
  });

  it("una revista enseña recetas", () => {
    const f = item(slugOf("items", "Base.ArmorMag1")!);
    expect(f.teaches.length).toBeGreaterThan(0);
    for (const r of f.teaches) expect(recipe(r.id).learn?.books.some((b) => b.id === f.id), r.id).toBe(true);
  });

  it("herbalist: una receta que da el rasgo lo muestra en learn.traits, con su ícono", () => {
    const herbalist = slugOf("traits", "herbalist")!;
    const r = recipe(slugOf("recipes", "MakePlantainPoultice")!);
    expect(r.learn?.traits.map((t) => t.id)).toContain(herbalist);
    expect(r.learn?.traits.find((t) => t.id === herbalist)?.icon).toBeTruthy();
    expect(allRecipes().some((x) => (x.learn?.professions.length ?? 0) > 0)).toBe(true);
  });

  it("forge-crowbar: se aprende con libro, nivel, investigación, rasgo y profesión, y hace la palanca forjada", () => {
    const r = recipe("forge-crowbar");
    expect(r.learn).not.toBeNull();
    expect(r.learn!.skills).toEqual([{ skill: { en: "Blacksmithing", es: "Herrería" }, lvl: 10 }]);
    expect(r.learn!.research.map((x) => x.id)).toContain("crowbar");
    expect(r.learn!.books.length).toBeGreaterThan(0);
    expect(r.learn!.traits.length).toBeGreaterThan(0);
    expect(r.learn!.professions.length).toBeGreaterThan(0);
    expect(r.stations.length).toBe(1);
    expect(r.skills).toEqual([{ skill: { en: "Blacksmithing", es: "Herrería" }, lvl: 9 }]);
    expect(r.outputs).toContainEqual({ n: 1, item: { id: "crowbar", en: "Crowbar", es: "Palanca", icon: "Crowbar_Forged" } });
  });

  it("un mapper se resuelve a choices: el resultado depende del ingrediente", () => {
    const r = recipe("scutch-fibre");
    const out = r.outputs[0];
    expect("choices" in out).toBe(true);
    if (!("choices" in out)) return;
    expect(out.choices.length).toBeGreaterThan(1);
    expect(out.choices.every((c) => c.item.id && Array.isArray(c.from))).toBe(true);
    expect(out.choices.some((c) => c.from.length > 0)).toBe(true);
  });

  it("un líquido lleva su nombre y no tiene objetos; [*] es cualquier objeto", () => {
    const r = recipe("churn-butter");
    const milk = r.inputs.find((i) => i.fluid);
    expect(milk).toMatchObject({ n: 5, keep: false, opts: [] });
    expect(milk!.fluid!.en).toContain("Cow's Milk");
    expect(r.inputs.find((i) => i.any)).toMatchObject({ n: 1, opts: [] });
  });

  it("una cantidad variable lleva n y max", () => {
    const r = recipe("dry-corn");
    expect(r.inputs[0]).toMatchObject({ n: 1, max: 20 });
    expect(r.outputs[0]).toMatchObject({ n: 1, max: 20 });
  });

  it("una construcción da su mueble y lleva su ícono en la lista", () => {
    const b = allRecipes().find((r) => r.kind === "build")!;
    expect(b.outputs).toEqual([{ entity: { en: b.en, es: b.es } }]);
    const row = RECIPES_LIST.rows.find((x) => x.id === b.id)!;
    expect(row.kind).toBe("build");
  });

  it("cada ficha de receta lleva el ícono de su fila: la ficha lo dibuja sin bajar la lista", () => {
    const rows = new Map(RECIPES_LIST.rows.map((r) => [r.id, r]));
    for (const r of allRecipes()) expect(r.icon, r.id).toBe(rows.get(r.id)!.icon);
    expect(recipe("saw-log").icon).toBe("Plank");
    expect(recipe("wooden-chair-basic").icon).toMatch(/^Build_/);
  });

  it("un objeto de reparación: con qué se repara, cuántos usos y qué habilidad", () => {
    const f = allItems().find((x) => x.fixedWith.length > 0)!;
    expect(f.fixedWith[0].uses).toBeGreaterThan(0);
    for (const s of f.fixedWith[0].skills) expect(s.skill.en && s.skill.es && s.lvl >= 0).toBeTruthy();
  });
});

describe("peso", () => {
  const raw = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");
  it("ningún shard pasa 120 KB crudos", () => {
    for (const [dir, sh] of [["items", ITEM_SHARDS], ["recipes", RECIPE_SHARDS]] as const) {
      for (const [nn, s] of sh) expect(raw(s), `${dir}/${nn}.json`).toBeLessThan(120 * 1024);
    }
  });

  it("recipes-list pesa menos de 400 KB", () => {
    expect(raw(RECIPES_LIST)).toBeLessThan(400 * 1024);
  });

  it("items-list: 3.826 filas no entran en 400 KB con la forma pedida; menos de 640 KB crudos y de 128 KB con gzip", () => {
    // Sólo los nombres (id, en, es) ya son ~215 KB; con las claves de cada fila, ~590 KB. Lo que se baja es el gzip.
    const body = JSON.stringify(ITEMS_LIST);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(640 * 1024);
    expect(gzipSync(body, { level: 9 }).length).toBeLessThan(128 * 1024);
  });
});

/**
 * La pestaña Parches (2026-10-02): `site.py` arma una página por versión (la Crónica y, si hay foto con diff, qué
 * cambió) y un índice que va en el chunk de la pestaña. Con los datos de hoy: la 42.20 (sólo Crónica) y la 42.21 (la
 * primera foto, sin diff), así que ninguna ficha lleva todavía "Qué cambió".
 */
type PatchMeta = { slug: string; version: string; date: string; recorded: boolean; hotfixes: number;
                   counts?: Record<string, { added: number; removed: number; changed: number }>; first?: Record<string, number> };
type PatchPage = PatchMeta & { highlights: Loc[]; sources: { kind: string; url: string }[]; hotfixList: unknown[];
                               diff?: unknown; names: Record<string, Loc> };

describe("parches", () => {
  const PATCH_INDEX = file<{ current: string; patches: PatchMeta[] }>("patches/index.json");
  const page = (slug: string) => file<PatchPage>(`patches/${slug}.json`);

  it("index.json: current es la versión de meta.json y las entradas van de la más nueva a la más vieja", () => {
    expect(PATCH_INDEX.current).toBe((meta as { version: string }).version);
    expect(PATCH_INDEX.patches.length).toBeGreaterThan(0);
    const dates = PATCH_INDEX.patches.map((p) => p.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("cada entrada del índice tiene su página, con la misma cabecera, y nada sobra", () => {
    const pages = Object.keys(FILES).filter((k) => /\/data\/site\/patches\/[^/]+\.json$/.test(k) && !k.endsWith("/index.json"));
    expect(pages.length).toBe(PATCH_INDEX.patches.length);
    for (const m of PATCH_INDEX.patches) {
      const p = page(m.slug);
      for (const [k, v] of Object.entries(m)) expect(p[k as keyof PatchPage], `${m.slug}.${k}`).toEqual(v);
      expect(Array.isArray(p.highlights) && Array.isArray(p.sources) && Array.isArray(p.hotfixList)).toBe(true);
    }
  });

  it("cada página pesa menos de 300 KB con gzip", () => {
    for (const m of PATCH_INDEX.patches) {
      expect(gzipSync(JSON.stringify(page(m.slug)), { level: 9 }).length, m.slug).toBeLessThan(300 * 1024);
    }
  });

  it("hoy: la 42.21 es la primera foto (sin diff) y la 42.20 sale sólo de la Crónica", () => {
    const p21 = page("42-21");
    expect(p21.recorded).toBe(true);
    expect(p21.diff).toBeUndefined();
    expect(p21.first?.items).toBeGreaterThan(0);
    const p20 = page("42-20");
    expect(p20.recorded).toBe(false);
    expect(p20.sources.length).toBeGreaterThan(0);
  });

  it("changes va exactamente en las fichas que nombran las últimas 5 páginas con diff (hoy, en ninguna)", () => {
    // Lo esperado sale de las páginas: lo agregado o cambiado con `slug` (el sandbox nunca lo lleva; lo quitado no
    // tiene ficha) en las últimas CHANGES_N = 5 comparaciones, la ventana global de site.py. Sin diffs da vacío.
    type Ent = { id: string; slug?: string };
    type Kinds = Record<string, { added: Ent[]; removed: Ent[]; changed: Ent[] }>;
    const recent = PATCH_INDEX.patches.filter((m) => m.counts).slice(0, 5).map((m) => m.slug);
    const expected = new Set<string>();
    for (const slug of recent) {
      const kinds = (page(slug).diff as { kinds: Kinds }).kinds;
      for (const [kind, k] of Object.entries(kinds)) {
        if (kind === "sandbox") continue;
        for (const e of [...k.added, ...k.changed]) if (e.slug) expected.add(`${kind}/${e.slug}`);
      }
    }
    type WithChanges = { id: string; changes?: { patch: string }[] };
    const bySec: [string, WithChanges[]][] = [
      ["items", allItems() as WithChanges[]],
      ["recipes", [...RECIPE_SHARDS.values()].flatMap((s) => Object.values(s)) as WithChanges[]],
      ...["traits", "professions", "skills", "moodles"].map((sec) => [sec, file<WithChanges[]>(`${sec}.json`)] as [string, WithChanges[]]),
    ];
    const actual = new Set<string>();
    for (const [sec, fichas] of bySec) {
      for (const f of fichas) {
        if (f.changes === undefined) continue;
        actual.add(`${sec}/${f.id}`);
        expect(f.changes.length, `${sec}/${f.id}`).toBeGreaterThan(0);
        for (const c of f.changes) expect(recent, `${sec}/${f.id}`).toContain(c.patch);
      }
    }
    expect([...actual].sort()).toEqual([...expected].sort());
  });
});
