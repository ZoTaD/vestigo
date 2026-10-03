import { describe, expect, it } from "vitest";
import index from "@zomboid/index.json";
import meta from "@zomboid/meta.json";
import skillsRaw from "@zomboid/skills.json";
import traitsRaw from "@zomboid/traits.json";
import spawns from "@zomboid/map/spawns.json";
import { pzShard } from "../src/zomboid/shard";

/**
 * Los datos de las pestañas Rasgos, Personaje, Habilidades y Moodles de Project Zomboid (2026-09-30): lo que
 * `extract.py` saca del juego (XP por nivel, nivel inicial, multiplicadores de bonificación, medios grabados) y las
 * fichas que arma `site.py` en data/site. Se prueba con los archivos reales: si un parche cambia la tabla de XP o rompe
 * un enlace, salta acá.
 */
type Loc = { en: string; es: string };
type Ref = { id: string; en: string; es: string; icon?: string | null };
type Boost = { skill: Ref; lvl: number };
type Mult = Record<"0" | "1" | "2" | "3", number>;
type Trait = {
  id: string; en: string; es: string; desc?: Loc; cost: number; positive: boolean; professionOnly: boolean;
  exclusive: Ref[]; xpBoosts: Boost[]; xpMult?: XpMult[]; recipes: Ref[]; icon: string | null; grantedBy: Ref[];
};
type XpMult = { mult: number; skills: string[] };
type Profession = {
  id: string; en: string; es: string; desc?: Loc; cost: number; xpBoosts: Boost[]; traits: Ref[]; recipes: Ref[];
  icon: string | null; spawnTowns?: string[];
};
type Skill = {
  id: string; en: string; es: string; cat: Loc & { id: string }; xp: number[]; start?: number; boost: Mult;
  books: { item: Ref; from: number; to: number; mult: number }[];
  magazines: Ref[];
  media: { id: string; en: string; es: string; kind: "vhs" | "cd" | "tv"; xp: number; shared?: boolean }[];
  traits: (Ref & { lvl: number })[];
  professions: (Ref & { lvl: number })[];
};
type Moodle = { id: string; en: string; es: string; icon: string; levels: { level: number; name: Loc; desc: Loc }[] };
type Media = { id: string; name: Loc; kind: "vhs" | "cd" | "tv"; xp: Record<string, number>; shared?: boolean };
type RawSkill = Loc & { cat: Loc & { id: string }; xp: number[]; start?: number; boost?: Mult };
type Entry = { sec: string; id: string; en: string; es: string; ref: string[] };
type ItemFicha = { id: string; skillBook?: { skill: Loc; from: number; levels: number; mult: number } };

// Por glob y no con import: si el archivo todavía no existe, falla cada prueba con su mensaje y no el archivo entero.
const FILES = import.meta.glob(
  ["../../games/zomboid/data/site/*.json", "../../games/zomboid/data/media.json", "../../games/zomboid/data/site/items/*.json"],
  { eager: true, import: "default" },
) as Record<string, unknown>;
const file = <T,>(rel: string): T => {
  const hit = Object.entries(FILES).find(([k]) => k.endsWith(`/data/${rel}`));
  if (!hit) throw new Error(`falta data/${rel}`);
  return hit[1] as T;
};
const itemShard = (slug: string): ItemFicha | undefined => {
  const hit = Object.entries(FILES).find(([k]) => k.endsWith(`/data/site/items/${pzShard(slug)}.json`));
  return (hit?.[1] as Record<string, ItemFicha> | undefined)?.[slug];
};
const allItemFichas = (): ItemFicha[] =>
  Object.entries(FILES)
    .filter(([k]) => /\/data\/site\/items\/\d\d\.json$/.test(k))
    .flatMap(([, v]) => Object.values(v as Record<string, ItemFicha>));

const INDEX = index as Entry[];
const bySec = (sec: string) => INDEX.filter((e) => e.sec === sec);
const slugs = (sec: string) => new Set(bySec(sec).map((e) => e.id));
const RAW = skillsRaw as unknown as Record<string, RawSkill>;
const META = meta as unknown as { boostMultipliers?: Record<string, number>; boostCap?: number; mediaXpCutoff?: number };
const RAW_TRAITS = traitsRaw as unknown as { id: string; xpMult?: XpMult[] }[];

const traits = () => file<Trait[]>("site/traits.json");
const professions = () => file<Profession[]>("site/professions.json");
const skills = () => file<Skill[]>("site/skills.json");
const moodles = () => file<Moodle[]>("site/moodles.json");
const media = () => file<Media[]>("media.json");
const skill = (id: string) => {
  const s = skills().find((x) => x.id === id);
  if (!s) throw new Error(`no está la habilidad ${id}`);
  return s;
};

describe("habilidades: XP por nivel, nivel inicial y multiplicadores del juego", () => {
  it("skills.json: cada habilidad trae 10 valores de XP, enteros y crecientes, y su categoría", () => {
    expect(Object.keys(RAW).length).toBe(35);
    for (const [k, s] of Object.entries(RAW)) {
      expect(s.xp, k).toHaveLength(10);
      for (const [i, v] of s.xp.entries()) {
        expect(Number.isInteger(v) && v > 0, `${k} xp[${i}]`).toBe(true);
        if (i) expect(v, `${k} xp[${i}] > xp[${i - 1}]`).toBeGreaterThan(s.xp[i - 1]);
      }
      expect(s.cat.id && s.cat.en && s.cat.es, k).toBeTruthy();
    }
  });

  it("la tabla del juego: 75 XP para pasar de 0 a 1 en Carpintería y 1.500 en Fuerza (el ×1,5 de PerkFactory ya aplicado)", () => {
    expect(RAW.Woodwork.xp).toEqual([75, 150, 300, 750, 1500, 3000, 4500, 6000, 7500, 9000]);
    expect(RAW.Strength.xp).toEqual([1500, 3000, 6000, 9000, 18000, 30000, 60000, 90000, 120000, 150000]);
    expect(RAW.Fitness.xp).toEqual(RAW.Strength.xp);
  });

  it("Fuerza y Estado físico empiezan en 5; las demás no dicen `start` (empiezan en 0)", () => {
    expect(RAW.Strength.start).toBe(5);
    expect(RAW.Fitness.start).toBe(5);
    for (const [k, s] of Object.entries(RAW)) if (k !== "Strength" && k !== "Fitness") expect(s.start, k).toBeUndefined();
    expect(skill("strength").start).toBe(5);
    expect(skill("fitness").start).toBe(5);
  });

  it("los multiplicadores de bonificación existen para 1, 2 y 3 (y el de 0, sin bonificación), y crecen", () => {
    const m = META.boostMultipliers!;
    for (const k of ["0", "1", "2", "3"]) expect(typeof m[k], k).toBe("number");
    expect(m["0"]).toBeLessThan(m["1"]);
    expect(m["1"]).toBeLessThan(m["2"]);
    expect(m["2"]).toBeLessThan(m["3"]);
  });

  it("el tope de la bonificación (boostCap) viene del juego: es el último nivel de boostMultipliers", () => {
    expect(META.boostCap).toBe(3);
    expect(Math.max(...Object.keys(META.boostMultipliers!).map(Number))).toBe(META.boostCap);
  });

  it("cada habilidad del sitio trae su tabla de multiplicadores; Fuerza y Estado físico no la usan, Carrera tiene la suya", () => {
    const m = META.boostMultipliers!;
    for (const s of skills()) expect(Object.keys(s.boost).sort(), s.id).toEqual(["0", "1", "2", "3"]);
    expect(skill("carpentry").boost).toEqual(m);
    expect(skill("strength").boost).toEqual({ "0": 1, "1": 1, "2": 1, "3": 1 });
    expect(skill("fitness").boost).toEqual({ "0": 1, "1": 1, "2": 1, "3": 1 });
    expect(skill("running").boost["0"]).toBe(1);
    expect(skill("running").boost["1"]).toBeGreaterThan(m["1"]);
  });

  it("site/skills.json: una por habilidad del índice, con el mismo nombre y la misma tabla que skills.json", () => {
    const entries = bySec("skills");
    expect(new Set(skills().map((s) => s.id))).toEqual(slugs("skills"));
    for (const s of skills()) {
      const e = entries.find((x) => x.id === s.id)!;
      expect([s.en, s.es], s.id).toEqual([e.en, e.es]);
      expect(s.xp, s.id).toEqual(RAW[e.ref[0]].xp);
      expect(s.cat, s.id).toEqual(RAW[e.ref[0]].cat);
    }
  });
});

describe("rasgos y profesiones", () => {
  it("una ficha por rasgo y por profesión del índice, con su nombre", () => {
    for (const [sec, list] of [["traits", traits()], ["professions", professions()]] as const) {
      expect(list.map((x) => x.id), sec).toEqual(bySec(sec).map((e) => e.id));
      for (const [i, x] of list.entries()) expect([x.en, x.es], x.id).toEqual([bySec(sec)[i].en, bySec(sec)[i].es]);
    }
  });

  it("Ladrón da Destreza, Sigilo y Pies ligeros 2 y el rasgo Ladrón, y ese rasgo dice que lo da Ladrón", () => {
    const burglar = professions().find((p) => p.id === "burglar")!;
    expect(burglar.xpBoosts.map((b) => [b.skill.id, b.lvl]).sort()).toEqual([["lightfooted", 2], ["nimble", 2], ["sneaking", 2]]);
    expect(burglar.traits.map((t) => t.id)).toEqual(["burglar"]);
    const trait = traits().find((t) => t.id === "burglar")!;
    expect(trait.grantedBy.map((p) => p.id)).toEqual(["burglar"]);
    expect(trait.professionOnly).toBe(true);
    expect(burglar.spawnTowns).toContain("Muldraugh, KY");
  });

  it("`positive` es el costo mayor que 0 (como las dos listas del juego); los excluyentes van en los dos sentidos", () => {
    for (const t of traits()) expect(t.positive, t.id).toBe(t.cost > 0);
    const byId = new Map(traits().map((t) => [t.id, t]));
    for (const t of traits()) {
      for (const x of t.exclusive) expect(byId.get(x.id)?.exclusive.map((y) => y.id), `${t.id} ↔ ${x.id}`).toContain(t.id);
    }
  });

  it("Desempleado aparece en los once pueblos; ninguna profesión nombra un pueblo que no está en el mapa", () => {
    const unemployed = professions().find((p) => p.id === "custom-occupation")!;
    expect(unemployed.spawnTowns).toHaveLength(11);
    const towns = new Set((spawns as { towns: { name: string }[] }).towns.map((t) => t.name));
    for (const p of professions()) for (const t of p.spawnTowns ?? []) expect(towns.has(t), `${p.id} → ${t}`).toBe(true);
    // El juego escribe "fitnessInstructor" en los spawnpoints y la profesión es "fitnessinstructor": igual aparece.
    expect(professions().find((p) => p.id === "fitness-instructor")!.spawnTowns).toContain("Muldraugh, KY");
  });
});

describe("rasgos que multiplican la XP (xpMult)", () => {
  const ALL = () => skills().map((s) => s.id);
  const xpMult = (id: string) => {
    const t = traits().find((x) => x.id === id);
    if (!t?.xpMult) throw new Error(`${id} no trae xpMult`);
    return t.xpMult;
  };
  const covered = (id: string) => new Set(xpMult(id).flatMap((e) => e.skills));

  it("sólo los cuatro rasgos del juego traen xpMult, con un multiplicador cada uno (en el sitio y en data/traits.json)", () => {
    expect(traits().filter((t) => t.xpMult).map((t) => t.id).sort()).toEqual(["crafty", "fast-learner", "reluctant-fighter", "slow-learner"]);
    expect(RAW_TRAITS.filter((t) => t.xpMult).map((t) => t.id).sort()).toEqual(["crafty", "fastlearner", "pacifist", "slowlearner"]);
    expect(xpMult("fast-learner").map((e) => e.mult)).toEqual([1.3]);
    expect(xpMult("slow-learner").map((e) => e.mult)).toEqual([0.7]);
    expect(xpMult("reluctant-fighter").map((e) => e.mult)).toEqual([0.75]);
    expect(xpMult("crafty").map((e) => e.mult)).toEqual([1.3]);
  });

  it("Aprendiz rápido ×1,3: todas menos Fuerza y Estado físico, y Carrera sí", () => {
    const c = covered("fast-learner");
    expect(c.has("fitness") || c.has("strength")).toBe(false);
    expect(c.has("running")).toBe(true);
    expect(c.size).toBe(ALL().length - 2);
    expect([...c].sort()).toEqual(ALL().filter((id) => id !== "fitness" && id !== "strength").sort());
  });

  it("Aprendiz lento ×0,7: todas menos Carrera, Fuerza y Estado físico", () => {
    const c = covered("slow-learner");
    for (const id of ["running", "fitness", "strength"]) expect(c.has(id), id).toBe(false);
    expect(c.size).toBe(ALL().length - 3);
    expect([...c].sort()).toEqual(ALL().filter((id) => !["running", "fitness", "strength"].includes(id)).sort());
  });

  it("Pacifista ×0,75: exactamente los seis de cuerpo a cuerpo y Puntería; ni Recarga ni Mantenimiento", () => {
    expect([...covered("reluctant-fighter")].sort()).toEqual(
      ["aiming", "axe", "long-blade", "long-blunt", "short-blade", "short-blunt", "spear"],
    );
    expect(covered("reluctant-fighter").has("reloading")).toBe(false);
    expect(covered("reluctant-fighter").has("maintenance")).toBe(false);
  });

  it("Ingenioso ×1,3: exactamente las habilidades de la categoría Elaboración", () => {
    const crafting = skills().filter((s) => s.cat.id === "Crafting").map((s) => s.id);
    expect(crafting).toHaveLength(12);
    expect([...covered("crafty")].sort()).toEqual([...crafting].sort());
  });

  it("las habilidades van por id de ficha, sin repetir y en el orden de skills.json; data/traits.json usa los ids del juego", () => {
    const order = ALL();
    for (const t of traits()) {
      for (const e of t.xpMult ?? []) {
        expect(new Set(e.skills).size, t.id).toBe(e.skills.length);
        for (const id of e.skills) expect(order.includes(id), `${t.id} → ${id}`).toBe(true);
        expect(e.skills.map((id) => order.indexOf(id)), t.id).toEqual([...e.skills.map((id) => order.indexOf(id))].sort((a, b) => a - b));
      }
    }
    // Las del juego, en el orden de skills.json (PerkFactory): Fuerza y Estado físico afuera.
    const fast = RAW_TRAITS.find((t) => t.id === "fastlearner")!.xpMult![0];
    expect(fast.skills).toEqual(Object.keys(RAW).filter((k) => k !== "Fitness" && k !== "Strength"));
    expect(RAW_TRAITS.find((t) => t.id === "crafty")!.xpMult![0].skills).toContain("Woodwork");
  });
});

describe("habilidades: libros, revistas, medios, rasgos y profesiones", () => {
  it("cada libro de habilidad aparece en su habilidad con from/to/mult iguales a su skillBook", () => {
    const books = allItemFichas().filter((f) => f.skillBook);
    expect(books.length).toBeGreaterThanOrEqual(100);
    const inSkills = skills().flatMap((s) => s.books.map((b) => ({ s, b })));
    expect(inSkills).toHaveLength(books.length);
    for (const f of books) {
      const sb = f.skillBook!;
      const s = skills().find((x) => x.en === sb.skill.en)!;
      const b = s.books.find((x) => x.item.id === f.id);
      expect(b, `${f.id} en ${s.id}`).toBeDefined();
      expect([b!.from, b!.to, b!.mult], f.id).toEqual([sb.from, sb.from + sb.levels - 1, sb.mult]);
    }
  });

  it("Carpintería: cinco libros en tramos de dos niveles, el Ladrón no la sube y Carpintero sí", () => {
    const s = skill("carpentry");
    expect(s.books.map((b) => [b.from, b.to])).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    // Cada libro multiplica la XP que da la práctica hasta su tope: maxMultiplier1 a 5 de SkillBook["Carpentry"].
    expect(s.books.map((b) => b.mult)).toEqual([3, 5, 8, 12, 16]);
    expect(s.professions.map((p) => p.id)).toContain("carpenter");
    expect(s.professions.map((p) => p.id)).not.toContain("burglar");
    expect(s.magazines.length).toBeGreaterThan(0);
  });

  it("media.json: VHS que dan XP, con nombre en/es, y cada habilidad lista los suyos con la misma XP", () => {
    const list = media();
    expect(list.length).toBeGreaterThanOrEqual(50);
    for (const m of list) {
      expect(["vhs", "cd", "tv"], m.id).toContain(m.kind);
      expect(m.name.en && m.name.es, m.id).toBeTruthy();
      expect(Object.keys(m.xp).length, m.id).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(m.xp)) {
        expect(RAW[k], `${m.id} → ${k}`).toBeDefined();
        expect(v, `${m.id} ${k}`).toBeGreaterThan(0);
        const s = skill(bySec("skills").find((e) => e.ref[0] === k)!.id);
        expect(s.media.find((x) => x.id === m.id)?.xp, `${m.id} en ${s.id}`).toBe(v);
      }
    }
    const woodcraft = list.find((m) => m.name.en === "VHS: Woodcraft E1")!;
    expect(woodcraft.xp).toEqual({ Woodwork: 250 });
    expect(skill("carpentry").media.some((m) => m.id === woodcraft.id)).toBe(true);
  });

  it("los VHS con una línea de XP que otra cinta también tiene llevan shared (la XP es un máximo); los demás, no", () => {
    // El juego anota cada línea por jugador y por clave de texto, en todas las cintas: la segunda cinta no la vuelve a dar.
    const flagged = media().filter((m) => m.shared);
    expect(flagged.map((m) => m.name.en).sort()).toEqual(["Home VHS: no 9", "VHS: Woodcraft E3"]);
    for (const m of media()) if (!m.shared) expect(m.shared, m.id).toBeUndefined();
    const e3 = skill("carpentry").media.find((m) => m.en === "VHS: Woodcraft E3")!;
    expect([e3.xp, e3.shared]).toEqual([250, true]);
    const no9 = skill("welding").media.find((m) => m.en === "Home VHS: no 9")!;
    expect([no9.xp, no9.shared]).toEqual([400, true]);
    expect(skill("carpentry").media.find((m) => m.en === "VHS: Woodcraft E1")!.shared).toBeUndefined();
  });

  it("el tope de nivel de los medios (LevelForMediaXPCutoff) viene del juego", () => {
    expect(META.mediaXpCutoff).toBe(3);
  });
});

describe("moodles", () => {
  it("los 26 moodles tienen ícono y al menos un nivel con nombre y descripción en/es", () => {
    expect(moodles()).toHaveLength(26);
    expect(moodles().map((m) => m.id)).toEqual(bySec("moodles").map((e) => e.id));
    for (const m of moodles()) {
      expect(m.icon, m.id).toBeTruthy();
      expect(m.levels.length, m.id).toBeGreaterThan(0);
      for (const l of m.levels) expect(l.name.en && l.name.es && l.desc.en && l.desc.es, `${m.id} ${l.level}`).toBeTruthy();
    }
    const bleeding = moodles().find((m) => m.id === "bleeding")!;
    expect(bleeding.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
  });
});

describe("enlaces: todo Ref apunta a una ficha que existe", () => {
  const sec = { items: slugs("items"), recipes: slugs("recipes"), traits: slugs("traits"), professions: slugs("professions"), skills: slugs("skills") };
  const check = (set: Set<string>, refs: Ref[], where: string) => {
    for (const r of refs) {
      expect(set.has(r.id), `${where} → ${r.id}`).toBe(true);
      expect(r.en && r.es, `${where} → ${r.id}`).toBeTruthy();
    }
  };

  it("desde los rasgos", () => {
    for (const t of traits()) {
      check(sec.traits, t.exclusive, `rasgo ${t.id}`);
      check(sec.recipes, t.recipes, `rasgo ${t.id}`);
      check(sec.professions, t.grantedBy, `rasgo ${t.id}`);
      check(sec.skills, t.xpBoosts.map((b) => b.skill), `rasgo ${t.id}`);
    }
  });

  it("desde las profesiones", () => {
    for (const p of professions()) {
      check(sec.traits, p.traits, `profesión ${p.id}`);
      check(sec.recipes, p.recipes, `profesión ${p.id}`);
      check(sec.skills, p.xpBoosts.map((b) => b.skill), `profesión ${p.id}`);
    }
  });

  it("desde las habilidades (los libros y revistas, además, con ficha de objeto real)", () => {
    for (const s of skills()) {
      check(sec.items, [...s.books.map((b) => b.item), ...s.magazines], `habilidad ${s.id}`);
      check(sec.traits, s.traits, `habilidad ${s.id}`);
      check(sec.professions, s.professions, `habilidad ${s.id}`);
      for (const b of s.books) expect(itemShard(b.item.id)?.skillBook, b.item.id).toBeDefined();
    }
  });
});
