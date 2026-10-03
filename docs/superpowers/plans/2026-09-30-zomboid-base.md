# Project Zomboid — la base de la sección — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/en/project-zomboid` y `/es/project-zomboid` existan en el sitio con la estética "Libreta de supervivencia", la portada, la barra de pestañas (las que faltan, apagadas), el crédito de The Indie Stone y todo el SEO, para que las pestañas se construyan encima en paralelo.

**Architecture:** Una vista nueva `zomboid` en `route.ts` (dirección `/project-zomboid`, pestañas y fichas en español en `/es`, con un registro de slugs traducidos compartido con Diablo II), un área lazy `Zomboid.tsx` con su CSS y sus fuentes, la copia en `zomboidCopy.ts`, y el cableado de siempre: `areas.ts`, `areaFiles.ts`, `App.tsx`, `Nav.tsx`, `Home.tsx`, `sitemap.ts`, `prerender.ts`, `vite.config.ts`, `netlify.toml`.

**Tech Stack:** React 18 + Vite + TypeScript, Vitest, Python 3 + Pillow para `games/zomboid/tools/ui.py`, `@fontsource` para las tipografías.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md`. Estética C "Libreta de supervivencia".
- Todo texto de la UI en inglés y español (`/en`, `/es`). En español, las pestañas van en español (tabla de la sección "Direcciones" del diseño).
- Nada de "sacado de los archivos del juego" en la UI.
- Sí va el crédito de The Indie Stone en el pie, **en inglés y textual en los dos idiomas**, con el link a sus términos: *"Thanks to The Indie Stone for creating Project Zomboid (https://projectzomboid.com/), which made this possible. This is an unofficial fan production for non-commercial purposes made under the Indie Stone Terms"*.
- Sin bordes ni barras de color en tarjetas o filas: el estado va por tinte, texto o cifra.
- Los títulos se achican con container queries y las palabras nunca se cortan (nada de `overflow-wrap: anywhere` ni `word-break`).
- Celular: las pestañas bajan de fila, sin scroll horizontal.
- Comentarios y mensajes de commit en español rioplatense, con el estilo del repo: explican el porqué.
- No se commitea `site/dist`. Los tests corren con `npx vitest run` desde `site/`. `test/deadlock.test.ts` falla en este worktree porque falta `@duckdb/node-api` en la pipeline de Deadlock: no es parte de este trabajo.
- Worktree: `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. Todas las rutas de abajo son relativas a esa carpeta.
- Datos de entrada que ya existen o escribe otro agente en paralelo:
  - `games/zomboid/data/meta.json` con `{ "version": "42.21", "build": 25485521, "extractedAt": "<ISO>", "counts": { "items", "recipes", "evolvedRecipes", "fixing", "traits", "professions", "skillBooks", "magazines", "moodles" } }` (enteros).
  - Los sellos del juego en `site/public/zomboid/map/stamps/map_<nombre>.png` (`map_house.png`, `map_skull.png`, `map_gun.png`, `map_axe.png`, `map_hammer.png`, `map_book.png`, `map_star.png`, `map_heart.png`, `map_wrench.png`, `map_gears.png`, `map_facehappy.png`, `map_satellite.png`, `map_lightning.png`).
  - Si alguno de los dos no está cuando empieces, pará y avisá: no lo inventes.

---

### Task 1: Las direcciones de Project Zomboid

**Files:**
- Modify: `site/src/route.ts`
- Create: `site/test/zomboidRoute.test.ts`

**Interfaces:**
- Produces:
  - `export type PzTab = "map" | "items" | "recipes" | "crafting" | "traits" | "professions" | "planner" | "skills" | "moodles" | "server" | "patches"`
  - `export type PzSection = "home" | PzTab`
  - `export const PZ_SEGMENT = "project-zomboid"`
  - `export const PZ_SECTIONS: PzTab[]`, `PZ_DETAIL_SECTIONS: PzTab[]`, `PZ_PUBLISHED: PzTab[]` (vacío por ahora)
  - `export const PZ_SECTION_ES: Record<PzTab, string>`
  - `export function registerPzSlugs(slugs: Partial<Record<PzTab, Record<string, string>>>): void`
  - `View` suma `"zomboid"`; `Route` suma `pzSection?: PzSection`.

- [ ] **Step 1: Escribir el test que falla**

Crear `site/test/zomboidRoute.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRoute, PZ_SECTION_ES, PZ_SECTIONS, registerPzSlugs, routePath } from "../src/route";

/** Project Zomboid (2026-09-30): la portada, las pestañas y las fichas, en los dos idiomas. */
describe("las direcciones de Project Zomboid", () => {
  it("la portada es /project-zomboid en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const r = parseRoute(`/${lang}/project-zomboid`);
      expect(r).toMatchObject({ lang, view: "zomboid", pzSection: "home" });
      expect(routePath(r)).toBe(`/${lang}/project-zomboid`);
    }
  });

  it("/zomboid a secas abre la sección y la dirección se corrige", () => {
    expect(parseRoute("/es/zomboid")).toMatchObject({ view: "zomboid", pzSection: "home" });
    expect(routePath(parseRoute("/es/zomboid"))).toBe("/es/project-zomboid");
  });

  it("cada pestaña tiene su nombre en inglés y en español", () => {
    for (const tab of PZ_SECTIONS) {
      expect(routePath(parseRoute(`/en/project-zomboid/${tab}`))).toBe(`/en/project-zomboid/${tab}`);
      const es = parseRoute(`/es/project-zomboid/${PZ_SECTION_ES[tab]}`);
      expect(es.pzSection, tab).toBe(tab);
      expect(routePath(es)).toBe(`/es/project-zomboid/${PZ_SECTION_ES[tab]}`);
      expect(routePath({ ...es, lang: "en" })).toBe(`/en/project-zomboid/${tab}`);
    }
    expect(PZ_SECTION_ES.items).toBe("objetos");
    expect(PZ_SECTION_ES.map).toBe("mapa");
  });

  it("una pestaña que no existe cae en la portada, y las que no tienen fichas no leen detalle", () => {
    expect(routePath(parseRoute("/es/project-zomboid/no-existe"))).toBe("/es/project-zomboid");
    expect(parseRoute("/en/project-zomboid/map/muldraugh").detail).toBeUndefined();
  });

  it("las fichas llevan el slug de su idioma, y el inglés bajo /es sigue abriéndolas", () => {
    registerPzSlugs({ items: { crowbar: "palanca" } });
    const es = parseRoute("/es/project-zomboid/objetos/palanca");
    expect(es).toMatchObject({ pzSection: "items", detail: "crowbar" });
    expect(routePath(es)).toBe("/es/project-zomboid/objetos/palanca");
    expect(routePath({ ...es, lang: "en" })).toBe("/en/project-zomboid/items/crowbar");
    expect(parseRoute("/es/project-zomboid/objetos/crowbar").detail).toBe("crowbar");
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run (desde `site/`): `npx vitest run test/zomboidRoute.test.ts`
Expected: FAIL, `PZ_SECTION_ES` y `registerPzSlugs` no existen.

- [ ] **Step 3: El registro de slugs compartido (Diablo II lo usa igual)**

En `site/src/route.ts`, reemplazar el bloque actual:

```ts
/** Los slugs en español de las fichas de Diablo II, por pestaña: id → slug y slug → id. */
const d2rSlugsEs: Partial<Record<D2rTab, { toEs: Map<string, string>; toId: Map<string, string> }>> = {};
```

por:

```ts
/**
 * Los slugs en español de las fichas de un juego, por pestaña: id → slug y slug → id. Sólo guarda los que cambian;
 * una ficha que no aparece se llama igual en los dos idiomas. Lo usan Diablo II y Project Zomboid.
 */
class LocalSlugs<T extends string> {
  private byTab: Partial<Record<T, { toEs: Map<string, string>; toId: Map<string, string> }>> = {};
  register(slugs: Partial<Record<T, Record<string, string>>>): void {
    for (const [tab, map] of Object.entries(slugs) as [T, Record<string, string>][]) {
      const pairs = Object.entries(map);
      this.byTab[tab] = { toEs: new Map(pairs), toId: new Map(pairs.map(([id, es]) => [es, id])) };
    }
  }
  toEs(tab: T, id: string): string {
    return this.byTab[tab]?.toEs.get(id) ?? id;
  }
  toId(tab: T, slug: string): string {
    return this.byTab[tab]?.toId.get(slug) ?? slug;
  }
}

/** Los slugs en español de las fichas de Diablo II. */
const d2rSlugsEs = new LocalSlugs<D2rTab>();
```

Reemplazar el cuerpo de `registerD2rSlugs` (se queda con su comentario):

```ts
export function registerD2rSlugs(slugs: Partial<Record<D2rTab, Record<string, string>>>): void {
  d2rSlugsEs.register(slugs);
}
```

En `parseRoute`, bloque `if (head === "d2r")`, la línea del detalle pasa a:

```ts
    const detail = slug && lang === "es" ? d2rSlugsEs.toId(tab, slug) : slug;
```

En `routePath`, bloque `if (view === "d2r")`, la última línea pasa a:

```ts
    return detail ? `${path}/${d2rSlugsEs.toEs(sec, detail)}` : path;
```

- [ ] **Step 4: Tipos, listas y registro de Project Zomboid**

En `site/src/route.ts`, cambiar el tipo `View`:

```ts
export type View = "home" | "deadlock" | "poe2" | "valheim" | "d2r" | "zomboid" | "privacy" | "terms";
```

Después de `const d2rSlugsEs = new LocalSlugs<D2rTab>();` y de `registerD2rSlugs`, agregar:

```ts
/**
 * Project Zomboid (2026-09-30). Diseño: docs/design/2026-09-30-zomboid.md. La dirección lleva el nombre completo
 * (`/project-zomboid`), que es como se busca el juego; `/zomboid` a secas también entra y la app corrige la barra.
 * Como Diablo II, en español las pestañas y las fichas van en español.
 */
export type PzTab = "map" | "items" | "recipes" | "crafting" | "traits" | "professions" | "planner" | "skills" | "moodles" | "server" | "patches";
export type PzSection = "home" | PzTab;
export const PZ_SEGMENT = "project-zomboid";
export const PZ_SECTIONS: PzTab[] = ["map", "items", "recipes", "crafting", "traits", "professions", "planner", "skills", "moodles", "server", "patches"];
/** Las pestañas con una ficha por cosa (`/project-zomboid/items/crowbar`). */
export const PZ_DETAIL_SECTIONS: PzTab[] = ["items", "recipes", "traits", "professions", "skills", "moodles", "patches"];
/**
 * Las pestañas que ya tienen página. Las demás se muestran apagadas, no entran al sitemap, y una dirección a una de
 * ellas muestra la portada. Cada pestaña se suma acá el día que se publica.
 */
export const PZ_PUBLISHED: PzTab[] = [];
export const PZ_SECTION_ES: Record<PzTab, string> = {
  map: "mapa",
  items: "objetos",
  recipes: "recetas",
  crafting: "fabricacion",
  traits: "rasgos",
  professions: "profesiones",
  planner: "personaje",
  skills: "habilidades",
  moodles: "moodles",
  server: "servidor",
  patches: "parches",
};
const PZ_SECTION_BY_ES = new Map(Object.entries(PZ_SECTION_ES).map(([tab, es]) => [es, tab as PzTab]));

/** Los slugs en español de las fichas de Project Zomboid. */
const pzSlugsEs = new LocalSlugs<PzTab>();

/** Anota los slugs en español de las fichas de Project Zomboid (los arma el build, como los de Diablo II). */
export function registerPzSlugs(slugs: Partial<Record<PzTab, Record<string, string>>>): void {
  pzSlugsEs.register(slugs);
}
```

En `interface Route`, después de `d2Section?: D2rSection;`:

```ts
  /** Qué pestaña de Project Zomboid. Sin ella es la portada de la sección. */
  pzSection?: PzSection;
```

Cambiar `isView`:

```ts
const isView = (v: string): v is View => ["home", "deadlock", "poe2", "valheim", "d2r", "zomboid", "privacy", "terms"].includes(v);
```

Después de la definición de `d2Tab`, agregar:

```ts
const isPzTab = (v: string | undefined): v is PzTab => !!v && (PZ_SECTIONS as string[]).includes(v);
/** La pestaña de Project Zomboid de un segmento, escrito en cualquiera de los dos idiomas. */
const pzTab = (v: string | undefined): PzTab | undefined => (isPzTab(v) ? v : v ? PZ_SECTION_BY_ES.get(v) : undefined);
```

- [ ] **Step 5: Leer y escribir la dirección**

En `parseRoute`, justo después de `const head = rest[0];` y **antes** de `if (!head || !isView(head)) return { ...base, view: "home" };`, agregar:

```ts
  // Project Zomboid va con el nombre completo; `/zomboid` a secas también entra (la app corrige la barra).
  if (head === PZ_SEGMENT || head === "zomboid") {
    const tab = pzTab(rest[1]);
    if (!tab) return { ...base, view: "zomboid", pzSection: "home" };
    const slug = PZ_DETAIL_SECTIONS.includes(tab) && rest[2] ? rest[2] : undefined;
    // En español el slug es el del nombre español; uno que no se conoce se deja como vino.
    const detail = slug && lang === "es" ? pzSlugsEs.toId(tab, slug) : slug;
    return { ...base, view: "zomboid", pzSection: tab, detail };
  }
```

En `routePath`, después del bloque `if (view === "d2r") { … }`, agregar:

```ts
  if (view === "zomboid") {
    const sec = route.pzSection ?? "home";
    const root = `/${lang}/${PZ_SEGMENT}`;
    if (sec === "home") return root;
    if (lang !== "es") return detail ? `${root}/${sec}/${detail}` : `${root}/${sec}`;
    const path = `${root}/${PZ_SECTION_ES[sec]}`;
    return detail ? `${path}/${pzSlugsEs.toEs(sec, detail)}` : path;
  }
```

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run test/zomboidRoute.test.ts test/route.test.ts test/d2r.test.ts test/d2rSlugsEs.test.ts`
Expected: PASS (los de Diablo II siguen pasando con el registro compartido).

Run: `npx tsc -b`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add site/src/route.ts site/test/zomboidRoute.test.ts
git commit -m "feat(zomboid): las direcciones /project-zomboid, con pestañas y fichas en español

El registro de slugs traducidos pasa a una clase que comparten Diablo II y
Project Zomboid."
```

---

### Task 2: La copia, el tema "libreta" y las tipografías

**Files:**
- Create: `site/src/zomboidCopy.ts`
- Create: `site/src/styles/zomboid.css`
- Modify: `site/src/styles/tokens.css`
- Modify: `site/package.json` (vía `npm install`)
- Create: `site/test/zomboidCopy.test.ts`

**Interfaces:**
- Consumes: `PzSection`, `PzTab` de Task 1.
- Produces:
  - `export const PZ_TABS: PzSection[]`
  - `export interface ZomboidCopy`
  - `export const ZOMBOID_COPY: Record<"en" | "es", ZomboidCopy>`
  - `export const useZomboidCopy: () => ZomboidCopy`
  - Las clases CSS `.pz`, `.pz-tabs-band`, `.pz-tabs`, `.pz-tab`, `.pz-main`, `.pz-hero`, `.pz-title`, `.pz-kick`, `.pz-h1`, `.pz-lede`, `.pz-hand`, `.pz-mapwrap`, `.pz-paper`, `.pz-tape`, `.pz-stamp`, `.pz-note`, `.pz-ring`, `.pz-grid`, `.pz-page`, `.pz-clip`, `.pz-h2`, `.pz-counts`, `.pz-tools`, `.pz-soon`.

- [ ] **Step 1: Instalar las tipografías**

Run (desde `site/`): `npm install @fontsource/old-standard-tt @fontsource/caveat @fontsource/noto-sans`
Expected: las tres aparecen en `dependencies` de `site/package.json`.

- [ ] **Step 2: El test que falla**

Crear `site/test/zomboidCopy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PZ_TABS, ZOMBOID_COPY } from "../src/zomboidCopy";
import { PZ_SECTIONS } from "../src/route";

describe("la copia de Project Zomboid", () => {
  it("cada pestaña tiene nombre y SEO en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const c = ZOMBOID_COPY[lang];
      for (const tab of ["home", ...PZ_SECTIONS] as const) {
        expect(c.tabs[tab], `${lang} ${tab}`).toBeTruthy();
        expect(c.seo[tab].title, `${lang} ${tab}`).toMatch(/\| Vestigo$/);
        expect(c.seo[tab].description.length, `${lang} ${tab}`).toBeGreaterThan(80);
      }
    }
  });

  it("los títulos empiezan por lo que se busca", () => {
    expect(ZOMBOID_COPY.en.seo.home.title).toMatch(/^Project Zomboid Map/);
    expect(ZOMBOID_COPY.es.seo.home.title).toMatch(/^Project Zomboid en español/);
    expect(ZOMBOID_COPY.es.seo.map.title).toMatch(/^Mapa de Project Zomboid/);
    expect(ZOMBOID_COPY.en.seo.traits.title).toMatch(/^Project Zomboid Traits/);
  });

  it("la barra dibuja once pestañas: profesiones va dentro de Rasgos", () => {
    expect(PZ_TABS).toHaveLength(11);
    expect(PZ_TABS).not.toContain("professions");
  });
});
```

Run: `npx vitest run test/zomboidCopy.test.ts`
Expected: FAIL, `../src/zomboidCopy` no existe.

- [ ] **Step 3: Escribir `site/src/zomboidCopy.ts`**

```ts
/**
 * Los textos de la sección Project Zomboid (2026-09-30), en inglés y español. Diseño: docs/design/2026-09-30-zomboid.md.
 *
 * Los nombres del juego (objetos, recetas, rasgos, profesiones) no van acá: salen de los datos, con la traducción
 * oficial. Acá va lo nuestro: pestañas, títulos para Google y los textos de la libreta.
 */
import { useLang } from "./i18n";
import type { PzSection } from "./route";

/** Las pestañas, en el orden en que se dibujan. Las profesiones no tienen pestaña propia: las muestra "Rasgos". */
export const PZ_TABS: PzSection[] = ["home", "map", "items", "recipes", "crafting", "traits", "planner", "skills", "moodles", "server", "patches"];

type Seo = { title: string; description: string };
/** El nombre de un sello del juego (`map_<nombre>.png`) que ilustra una línea. */
type Stamp = string;

export interface ZomboidCopy {
  tabs: Record<PzSection, string>;
  soon: string;
  seo: Record<PzSection, Seo>;
  home: {
    kicker: (version: string) => string;
    lede: (items: string, recipes: string) => string;
    hand: string;
    notes: { safe: string; nope: string; guns: string };
    haveTitle: string;
    counts: { key: "items" | "recipes" | "skillBooks" | "magazines" | "traits" | "professions"; label: string; stamp: Stamp }[];
    aboutTitle: string;
    about: (version: string, items: string, recipes: string, traits: string, professions: string) => string[];
    toolsTitle: string;
    tools: { title: string; text: string; stamp: Stamp }[];
  };
}

const EN: ZomboidCopy = {
  tabs: {
    home: "Notebook", map: "Map", items: "Items", recipes: "Recipes", crafting: "Crafting", traits: "Traits",
    professions: "Professions", planner: "Character", skills: "Skills", moodles: "Moodles", server: "Server", patches: "Patches",
  },
  soon: "Soon",
  seo: {
    home: {
      title: "Project Zomboid Map, Items, Recipes & Character Planner (Build 42) | Vestigo",
      description: "Project Zomboid Build 42 in one place: an interactive map of Knox County, every item and recipe with its real stats, traits and professions, a character planner and a server settings generator.",
    },
    map: {
      title: "Project Zomboid Map (Build 42): Interactive Knox County Map | Vestigo",
      description: "Interactive Project Zomboid Build 42 map of Knox County: every building, street and town, vehicle and foraging zones, possible basements, spawn points and stashes. Share any spot with a link.",
    },
    items: {
      title: "Project Zomboid Items List: Weapons, Clothing and Food Stats | Vestigo",
      description: "Every Project Zomboid Build 42 item with its real stats: weapons, clothing and bags, food, tools and books, with the recipes that make and use each one and its item ID.",
    },
    recipes: {
      title: "Project Zomboid Recipes (Build 42): Every Crafting Recipe | Vestigo",
      description: "Every Project Zomboid Build 42 crafting recipe: ingredients and tools, time, required skill, the XP it gives, the workstation and how you learn it.",
    },
    crafting: {
      title: "Project Zomboid Crafting Planner: What You Need to Make Anything | Vestigo",
      description: "Pick what you want to make in Project Zomboid Build 42 and get the full recipe tree, the materials to gather, the books and skills you need and where to find each thing.",
    },
    traits: {
      title: "Project Zomboid Traits (Build 42): Costs and Effects | Vestigo",
      description: "Every Project Zomboid Build 42 trait with its point cost, what it does, the skills it boosts, the recipes it grants and the traits it cannot be combined with.",
    },
    professions: {
      title: "Project Zomboid Professions (Build 42): Points, Skills and Traits | Vestigo",
      description: "Every Project Zomboid Build 42 profession with its points, starting skills, free traits and known recipes, to pick the right one for your run.",
    },
    planner: {
      title: "Project Zomboid Character Planner (Build 42) | Vestigo",
      description: "Plan your Project Zomboid Build 42 character: profession, traits and points, the starting skills they give and the recipes you know. Free, no account, share it with a link.",
    },
    skills: {
      title: "Project Zomboid Skills and Skill Books: XP Calculator | Vestigo",
      description: "Every Project Zomboid Build 42 skill with the XP per level, which skill book to read at each level, magazines, and the TV shows and VHS tapes that give XP. Calculate how long any level takes.",
    },
    moodles: {
      title: "Project Zomboid Moodles: Every Moodle and How to Fix It | Vestigo",
      description: "Every Project Zomboid moodle with its icon, its levels, what it does to your character and how to get rid of it, plus wounds and how to treat them.",
    },
    server: {
      title: "Project Zomboid Server Settings Generator (Sandbox Options) | Vestigo",
      description: "Generate your Project Zomboid Build 42 server settings with every sandbox option explained, the game presets, a paste-your-file editor, and the exact day the water and power shut off.",
    },
    patches: {
      title: "Project Zomboid Patch Notes Explained (Build 42) | Vestigo",
      description: "Every Project Zomboid Build 42 patch summarized, and exactly what changed in each item, recipe and trait from one version to the next.",
    },
  },
  home: {
    kicker: (v) => `Build ${v} · Knox County, KY`,
    lede: (items, recipes) => `The map with every building and stash, ${items} items, ${recipes} recipes and the planners to last one more day.`,
    hand: "↓ start here",
    notes: { safe: "safe house", nope: "nope!", guns: "guns here?" },
    haveTitle: "What's in here",
    counts: [
      { key: "items", label: "Items", stamp: "axe" },
      { key: "recipes", label: "Recipes", stamp: "hammer" },
      { key: "skillBooks", label: "Skill books", stamp: "book" },
      { key: "magazines", label: "Magazines", stamp: "star" },
      { key: "traits", label: "Traits", stamp: "heart" },
      { key: "professions", label: "Professions", stamp: "wrench" },
    ],
    aboutTitle: "The notebook",
    about: (v, items, recipes, traits, professions) => [
      `Everything about Project Zomboid Build ${v} in one notebook: the Knox County map, ${items} items with their real stats, ${recipes} crafting recipes, ${traits} traits and ${professions} professions.`,
      "Each item leads to the recipes that make and use it and to where it spawns on the map. No account, and every page has a link you can share.",
    ],
    toolsTitle: "Tools",
    tools: [
      { title: "Map of Knox County", text: "Every building, street, stash and zone, with a link for any spot.", stamp: "house" },
      { title: "Character planner", text: "Profession, traits, points and your survivor in 3D.", stamp: "facehappy" },
      { title: "What do I need to make…?", text: "The full recipe tree and where to find each thing.", stamp: "gears" },
      { title: "Server settings", text: "Every sandbox option, explained.", stamp: "satellite" },
      { title: "Water and power", text: "The exact day they shut off in your world.", stamp: "lightning" },
    ],
  },
};

const ES: ZomboidCopy = {
  tabs: {
    home: "Libreta", map: "Mapa", items: "Objetos", recipes: "Recetas", crafting: "Fabricación", traits: "Rasgos",
    professions: "Profesiones", planner: "Personaje", skills: "Habilidades", moodles: "Moodles", server: "Servidor", patches: "Parches",
  },
  soon: "Pronto",
  seo: {
    home: {
      title: "Project Zomboid en español: mapa, objetos, recetas y planificador (Build 42) | Vestigo",
      description: "Todo Project Zomboid Build 42 en un lugar y en español: el mapa interactivo de Knox County, cada objeto y receta con sus números reales, rasgos y profesiones, un planificador de personaje y un generador de servidor.",
    },
    map: {
      title: "Mapa de Project Zomboid (Build 42): mapa interactivo de Knox County | Vestigo",
      description: "Mapa interactivo de Project Zomboid Build 42: cada edificio, calle y pueblo de Knox County, zonas de vehículos y de recolección, sótanos posibles, puntos de aparición y escondites. Compartí cualquier lugar con un link.",
    },
    items: {
      title: "Objetos de Project Zomboid: armas, ropa y comida con sus stats | Vestigo",
      description: "Todos los objetos de Project Zomboid Build 42 con sus números reales: armas, ropa y mochilas, comida, herramientas y libros, con las recetas que los hacen y los usan y su ID.",
    },
    recipes: {
      title: "Recetas de Project Zomboid (Build 42): todas las de fabricación | Vestigo",
      description: "Todas las recetas de fabricación de Project Zomboid Build 42: ingredientes y herramientas, tiempo, habilidad requerida, la XP que dan, la estación de trabajo y cómo se aprenden.",
    },
    crafting: {
      title: "Planificador de fabricación de Project Zomboid: qué necesitás para hacer cualquier cosa | Vestigo",
      description: "Elegí qué querés fabricar en Project Zomboid Build 42 y te arma el árbol completo de recetas, los materiales a juntar, los libros y habilidades que necesitás y dónde conseguir cada cosa.",
    },
    traits: {
      title: "Rasgos de Project Zomboid (Build 42): costo y efectos | Vestigo",
      description: "Todos los rasgos de Project Zomboid Build 42 con su costo en puntos, qué hacen, las habilidades que suben, las recetas que dan y con qué rasgos no se pueden combinar.",
    },
    professions: {
      title: "Profesiones de Project Zomboid (Build 42): puntos, habilidades y rasgos | Vestigo",
      description: "Todas las profesiones de Project Zomboid Build 42 con sus puntos, habilidades iniciales, rasgos gratis y recetas conocidas, para elegir la mejor para tu partida.",
    },
    planner: {
      title: "Planificador de personaje de Project Zomboid (Build 42) | Vestigo",
      description: "Armá tu personaje de Project Zomboid Build 42: profesión, rasgos y puntos, las habilidades iniciales que dan y las recetas que sabés. Gratis, sin cuenta, compartilo con un link.",
    },
    skills: {
      title: "Habilidades y libros de Project Zomboid: calculadora de XP | Vestigo",
      description: "Todas las habilidades de Project Zomboid Build 42 con la XP por nivel, qué libro leer en cada tramo, las revistas, y los programas de TV y VHS que dan XP. Calculá cuánto tarda cualquier nivel.",
    },
    moodles: {
      title: "Moodles de Project Zomboid: qué significa cada uno y cómo se cura | Vestigo",
      description: "Todos los moodles de Project Zomboid con su ícono, sus niveles, qué le hacen a tu personaje y cómo sacártelos de encima, más las heridas y cómo tratarlas.",
    },
    server: {
      title: "Generador de configuración de servidor de Project Zomboid | Vestigo",
      description: "Armá la configuración de tu servidor de Project Zomboid Build 42 con todas las opciones de sandbox explicadas en español, los presets del juego, un editor para pegar tu archivo y el día exacto en que se cortan el agua y la luz.",
    },
    patches: {
      title: "Parches de Project Zomboid explicados (Build 42) | Vestigo",
      description: "Cada parche de Project Zomboid Build 42 resumido en español, y qué cambió exactamente en cada objeto, receta y rasgo de una versión a la otra.",
    },
  },
  home: {
    kicker: (v) => `Build ${v} · Knox County, KY`,
    lede: (items, recipes) => `El mapa con cada edificio y escondite, ${items} objetos, ${recipes} recetas y los planificadores para durar un día más. En español.`,
    hand: "↓ empezá por acá",
    notes: { safe: "casa segura", nope: "¡no!", guns: "¿armas acá?" },
    haveTitle: "Lo que hay",
    counts: [
      { key: "items", label: "Objetos", stamp: "axe" },
      { key: "recipes", label: "Recetas", stamp: "hammer" },
      { key: "skillBooks", label: "Libros de habilidad", stamp: "book" },
      { key: "magazines", label: "Revistas", stamp: "star" },
      { key: "traits", label: "Rasgos", stamp: "heart" },
      { key: "professions", label: "Profesiones", stamp: "wrench" },
    ],
    aboutTitle: "La libreta",
    about: (v, items, recipes, traits, professions) => [
      `Todo Project Zomboid Build ${v} en una libreta: el mapa de Knox County, ${items} objetos con sus números reales, ${recipes} recetas de fabricación, ${traits} rasgos y ${professions} profesiones.`,
      "Cada objeto lleva a las recetas que lo hacen y lo usan, y a dónde aparece en el mapa. Sin cuenta, y cada página tiene un link para compartir.",
    ],
    toolsTitle: "Herramientas",
    tools: [
      { title: "Mapa de Knox County", text: "Cada edificio, calle, escondite y zona, con un link para cualquier lugar.", stamp: "house" },
      { title: "Planificador de personaje", text: "Profesión, rasgos, puntos y tu sobreviviente en 3D.", stamp: "facehappy" },
      { title: "¿Qué necesito para fabricar…?", text: "El árbol completo de recetas y dónde conseguir cada cosa.", stamp: "gears" },
      { title: "Configuración de servidor", text: "Todas las opciones de sandbox, explicadas.", stamp: "satellite" },
      { title: "Agua y luz", text: "El día exacto en que se cortan en tu partida.", stamp: "lightning" },
    ],
  },
};

export const ZOMBOID_COPY: Record<"en" | "es", ZomboidCopy> = { en: EN, es: ES };
export const useZomboidCopy = (): ZomboidCopy => ZOMBOID_COPY[useLang().lang];
```

- [ ] **Step 4: Los colores de la cáscara**

En `site/src/styles/tokens.css`, después del bloque `[data-theme="codex"][data-game="d2r"] { … }`, agregar:

```css
/* Project Zomboid (2026-09-30): la libreta de supervivencia. El verde del escritorio, el amarillo del lápiz y el rojo
   de las anotaciones; la hoja, la cinta y los sellos viven en zomboid.css. */
[data-theme="codex"][data-game="zomboid"] {
  --bg: #1f2a1f;
  --bg-2: #263326;
  --bg-glow: #2f3f2e;
  --surface: rgba(239, 233, 216, 0.06);
  --surface-2: rgba(239, 233, 216, 0.1);
  --surface-solid: #253125;
  --text: #eef0e6;
  --text-dim: #b9c2ad;
  --text-faint: #8a9580;
  --accent: #f3d36b;
  --accent-lit: #f8e39a;
  --accent-dark: #b89a3a;
  --accent-rgb: 243, 211, 107;
  --accent-2: #b3261e;
  --good: #6fae5a;
  --bad: #d0402f;
  --line: rgba(239, 233, 216, 0.18);
  --line-strong: rgba(239, 233, 216, 0.4);
  --on-accent: #1f2a1f;
  --radius: 2px;
  --radius-lg: 2px;
  --radius-pill: 2px;
}
```

- [ ] **Step 5: La hoja de estilos de la libreta**

Crear `site/src/styles/zomboid.css`:

```css
/*
 * Project Zomboid (2026-09-30): "Libreta de supervivencia". Diseño: docs/design/2026-09-30-zomboid.md.
 *
 * El mapa de papel del juego anotado con lápiz rojo y los sellos del juego (dibujos de línea blanca que se tiñen con
 * `mask`, como hace el juego al anotar un mapa), hojas de libreta con renglones, clips y cinta sobre el verde del
 * escritorio. Los colores de la leyenda (--pz-res, --pz-retail…) son los del mapa de papel del juego: los mismos
 * tipos de edificio que dibuja el mapa en modo "papel".
 */
.pz {
  --pz-paper: #efe9d8;
  --pz-paper-2: #e6dec7;
  --pz-ink: #2a2620;
  --pz-dim: #6b6354;
  --pz-pencil: #b3261e;
  --pz-rule: rgba(43, 79, 126, 0.18);
  --pz-grass: #3f7a3c;
  --pz-tape: rgba(236, 226, 190, 0.82);
  --pz-comm: #8a6cc8;
  --pz-retail: #b5c35a;
  --pz-ind: #2b2b2b;
  --pz-res: #e0a37a;
  --pz-food: #e8c43c;
  --pz-hosp: #6ec2d6;
  --pz-med: #d6577a;
  --pz-park: #3f9a3a;
  font-family: "Noto Sans", system-ui, sans-serif;
  background: radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.05), transparent 55%);
  overflow-x: clip;
}

/* Las pestañas: solapas de papel. En el celular bajan de fila, nunca se deslizan cortadas. */
.pz-tabs-band { max-width: 1180px; margin: 0 auto; padding: 18px 24px 0; }
.pz-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.pz-tab {
  padding: 7px 13px;
  background: var(--pz-paper-2);
  color: var(--pz-ink);
  font: 700 13px "Noto Sans", sans-serif;
  text-decoration: none;
  clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%);
}
.pz-tab.is-on { background: var(--pz-paper); box-shadow: inset 0 -3px 0 var(--pz-pencil); }
.pz-tab.is-soon { opacity: 0.45; cursor: default; }

.pz-main { max-width: 1180px; margin: 0 auto; padding: 26px 24px 60px; }

/* La portada: el título a la izquierda, el mapa de papel pegado con cinta a la derecha. */
.pz-hero { display: grid; grid-template-columns: 1fr 1.05fr; gap: 34px; align-items: center; }
.pz-title { container-type: inline-size; color: #f3eedf; }
.pz-kick { margin: 0; font: 600 13px "Noto Sans", sans-serif; letter-spacing: 0.3em; text-transform: uppercase; color: #b9c2ad; }
.pz-h1 { margin: 10px 0 14px; font: 700 clamp(40px, 13cqi, 68px) / 0.95 "Old Standard TT", serif; letter-spacing: 0.02em; }
.pz-lede { margin: 0 0 12px; max-width: 470px; font-size: 17px; line-height: 1.55; color: #dfe4d6; }
.pz-hand { display: inline-block; margin: 0; font: 700 26px "Caveat", cursive; color: #f3d36b; transform: rotate(-2deg); }

.pz-mapwrap { position: relative; height: 470px; margin: 0; transform: rotate(1.5deg); }
.pz-paper {
  position: absolute;
  inset: 0;
  background: url(/zomboid/ui/muldraughmap.webp) 50% 30% / cover;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
}
.pz-tape { position: absolute; width: 110px; height: 30px; background: var(--pz-tape); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); }
/* Un sello del juego, teñido del color que le toque (`color`), con la imagen en `--stamp`. */
.pz-stamp {
  display: inline-block;
  width: 38px;
  height: 38px;
  background: currentColor;
  -webkit-mask: var(--stamp) center / contain no-repeat;
  mask: var(--stamp) center / contain no-repeat;
}
.pz-mapwrap .pz-stamp { position: absolute; color: var(--pz-pencil); }
.pz-note { position: absolute; font: 700 24px "Caveat", cursive; color: var(--pz-pencil); transform: rotate(-5deg); white-space: nowrap; }
.pz-ring { position: absolute; border: 3px solid var(--pz-pencil); border-radius: 50%; transform: rotate(-10deg); }

/* Las hojas de la libreta: renglones azules, un clip y un poco torcidas, como sueltas sobre el escritorio. */
.pz-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 40px; }
.pz-page {
  position: relative;
  padding: 18px 18px 16px;
  color: var(--pz-ink);
  background: var(--pz-paper) linear-gradient(transparent 27px, var(--pz-rule) 28px) 0 0 / 100% 28px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
}
.pz-page:nth-child(2) { transform: rotate(-0.8deg); }
.pz-page:nth-child(3) { transform: rotate(0.7deg); }
.pz-clip { position: absolute; top: -12px; right: 24px; width: 18px; height: 46px; border: 3px solid #8e8e8e; border-radius: 9px; }
.pz-h2 { margin: 0 0 8px; font: 700 26px "Old Standard TT", serif; }
.pz-page p { margin: 0 0 12px; line-height: 28px; }

.pz-counts { list-style: none; margin: 0; padding: 0; }
.pz-counts li { display: flex; gap: 10px; align-items: center; height: 28px; }
.pz-counts .pz-stamp { width: 22px; height: 22px; color: var(--pz-grass); }
.pz-counts b { margin-left: auto; font: 700 18px "Old Standard TT", serif; }

.pz-tools { list-style: none; margin: 0; padding: 0; }
.pz-tools li { display: grid; grid-template-columns: 26px 1fr; column-gap: 10px; padding: 4px 0; }
.pz-tools .pz-stamp { width: 24px; height: 24px; margin-top: 2px; color: var(--pz-grass); }
.pz-tools b { font-weight: 700; }
.pz-tools span { grid-column: 2; color: var(--pz-dim); font-size: 14px; line-height: 1.4; }
.pz-soon { font: 700 17px "Caveat", cursive; color: var(--pz-pencil); margin-left: 6px; }

@media (max-width: 860px) {
  .pz-hero { grid-template-columns: 1fr; }
  .pz-mapwrap { height: 360px; transform: rotate(1deg); }
  .pz-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run test/zomboidCopy.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add site/src/zomboidCopy.ts site/src/styles/zomboid.css site/src/styles/tokens.css site/package.json site/package-lock.json site/test/zomboidCopy.test.ts
git commit -m "feat(zomboid): la copia en/es, el tema de la libreta y sus tipografías

Old Standard TT y Caveat son las que trae el juego para los mapas de papel
y las anotaciones; Noto Sans, la de su interfaz. Las tres son OFL."
```

---

### Task 3: El área, la portada, el menú y el pie

**Files:**
- Create: `games/zomboid/tools/ui.py`
- Create: `site/public/zomboid/ui/*.webp` (los genera `ui.py`)
- Create: `site/src/Zomboid.tsx`
- Create: `site/src/zomboid/ZomboidHome.tsx`
- Modify: `site/src/areas.ts`, `site/src/areaFiles.ts`, `site/src/App.tsx`, `site/src/Nav.tsx`, `site/src/i18n.ts`, `site/tsconfig.json`, `site/vite.config.ts` (sólo el alias)
- Modify: `site/test/areas.test.ts`
- Create: `site/test/zomboidHome.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PZ_PUBLISHED`, `PzSection`, `Route.pzSection`), Task 2 (`PZ_TABS`, `useZomboidCopy`, las clases `.pz-*`), `games/zomboid/data/meta.json` y los sellos.
- Produces:
  - `export default function Zomboid({ route, navigate })` en `site/src/Zomboid.tsx`
  - `export default function ZomboidHome({ route, navigate })` y `export const stamp: (name: string) => string` en `site/src/zomboid/ZomboidHome.tsx`
  - `ZomboidArea` en `areas.ts`
  - el alias `@zomboid/*` → `games/zomboid/data/*`
  - `copy.games.zomboid`, `copy.games.zomboidShort`, `copy.footer.disclaimerTis` en `i18n.ts`

- [ ] **Step 1: Los mapas de papel del juego**

Crear `games/zomboid/tools/ui.py`:

```python
"""
Las piezas de interfaz del juego que usa la sección de Project Zomboid (2026-09-30): los mapas de papel de cada pueblo
(`media/ui/LootableMaps/<pueblo>map.png`), que son el fondo de la portada y la base de la estética "Libreta de
supervivencia" (docs/design/2026-09-30-zomboid.md).

Uso, desde la raíz del repo:
    python games/zomboid/tools/ui.py
La instalación se busca en la carpeta de Steam por defecto, o en la variable de entorno PZ_DIR.
"""
import os
from pathlib import Path

from PIL import Image

GAME = Path(os.environ.get("PZ_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid"))
OUT = Path(__file__).resolve().parents[3] / "site" / "public" / "zomboid" / "ui"
# Los pueblos que tienen mapa de papel en el juego. El lado largo se achica a 1600 px: la portada lo muestra a unos
# 560 px de ancho y con eso alcanza para pantallas de doble densidad.
TOWNS = ["muldraugh", "westpoint", "riverside", "rosewood", "marchridge"]
MAX_SIDE = 1600


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for town in TOWNS:
        src = GAME / "media" / "ui" / "LootableMaps" / f"{town}map.png"
        im = Image.open(src).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        dst = OUT / f"{town}map.webp"
        im.save(dst, "WEBP", quality=84, method=6)
        print(f"{dst.name}: {im.width}x{im.height}, {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
```

Run (desde la raíz del worktree): `python games/zomboid/tools/ui.py`
Expected: cinco líneas `…map.webp: …`, cada una de menos de 600 KB.

- [ ] **Step 2: El alias de los datos**

En `site/tsconfig.json`, dentro de `paths`, después de `"@d2r/*": ["../games/d2r/data/*"]` (agregando la coma):

```json
      "@zomboid/*": ["../games/zomboid/data/*"]
```

En `site/vite.config.ts`, después de `const d2rDir = …;`:

```ts
// Project Zomboid (2026-09-30): lo que escriben `games/zomboid/tools/extract.py` y `map.py`.
const zomboidDir = fileURLToPath(new URL("../games/zomboid/data", import.meta.url));
```

y en `resolve.alias` sumar `"@zomboid": zomboidDir`:

```ts
    alias: { "@deadlock": deadlockDir, "@poe2": poe2Dir, "@valheim": valheimDir, "@valheimMap": valheimMapDir, "@d2r": d2rDir, "@zomboid": zomboidDir },
```

- [ ] **Step 3: El test de la portada, que falla**

Crear `site/test/zomboidHome.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Zomboid from "../src/Zomboid";
import meta from "../../games/zomboid/data/meta.json";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Zomboid, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la portada de Project Zomboid", () => {
  it("dice qué hay, con las cifras de los datos, en español", () => {
    const html = render("es", "/es/project-zomboid");
    expect(html).toContain("Project Zomboid");
    expect(html).toContain("Lo que hay");
    expect(html).toContain(meta.counts.recipes.toLocaleString("es-AR"));
    expect(html).toContain(`Build ${meta.version}`);
    expect(html).toContain("casa segura");
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("en", "/en/project-zomboid");
    expect(html).toContain("What&#x27;s in here");
    expect(html).toContain("safe house");
  });

  it("las pestañas que todavía no tienen página se ven apagadas y sin enlace", () => {
    const html = render("es", "/es/project-zomboid");
    expect(html).toContain('href="/es/project-zomboid"');
    expect(html).not.toContain('href="/es/project-zomboid/mapa"');
    expect(html).toMatch(/class="pz-tab is-soon"[^>]*>Mapa</);
  });

  it("una pestaña que todavía no existe muestra la portada", () => {
    expect(render("es", "/es/project-zomboid/mapa")).toContain("Lo que hay");
  });
});
```

Run (desde `site/`): `npx vitest run test/zomboidHome.test.ts`
Expected: FAIL, `../src/Zomboid` no existe.

- [ ] **Step 4: La portada**

Crear `site/src/zomboid/ZomboidHome.tsx`:

```tsx
/**
 * La portada de Project Zomboid (2026-09-30), estética "Libreta de supervivencia": el mapa de papel de Muldraugh que
 * trae el juego, anotado con lápiz rojo y con los sellos del juego, y tres hojas de libreta: lo que hay, qué es la
 * libreta (el texto que lee Google) y las herramientas, que se enlazan a medida que se publican.
 */
import meta from "@zomboid/meta.json";
import type { CSSProperties } from "react";
import { useLocale } from "../i18n";
import type { Route } from "../route";
import { useZomboidCopy } from "../zomboidCopy";

type Nav = (r: Route) => void;

/** Un sello del juego (`LootableMaps/map_<nombre>.png`), para teñirlo con `mask` como el lápiz. */
export const stamp = (name: string): string => `/zomboid/map/stamps/map_${name}.png`;
const stampStyle = (name: string, extra: CSSProperties = {}): CSSProperties =>
  ({ "--stamp": `url(${stamp(name)})`, ...extra }) as CSSProperties;

export default function ZomboidHome(_props: { route: Route; navigate: Nav }) {
  const c = useZomboidCopy();
  const t = c.home;
  const locale = useLocale();
  const num = (n: number) => n.toLocaleString(locale);
  const n = meta.counts;
  return (
    <main className="pz-main">
      <section className="pz-hero">
        <div className="pz-title">
          <p className="pz-kick">{t.kicker(meta.version)}</p>
          <h1 className="pz-h1">Project Zomboid</h1>
          <p className="pz-lede">{t.lede(num(n.items), num(n.recipes))}</p>
          <p className="pz-hand">{t.hand}</p>
        </div>
        {/* El mapa de papel del juego, pegado con cinta y anotado como lo haría un jugador. Es decorado: las
            anotaciones son ejemplos, no lugares del mapa. */}
        <figure className="pz-mapwrap" aria-hidden="true">
          <div className="pz-paper" />
          <span className="pz-tape" style={{ left: -24, top: 18, transform: "rotate(-28deg)" }} />
          <span className="pz-tape" style={{ right: -20, bottom: 30, transform: "rotate(-24deg)" }} />
          <span className="pz-stamp" style={stampStyle("house", { left: "30%", top: "30%" })} />
          <span className="pz-note" style={{ left: "38%", top: "26%" }}>{t.notes.safe}</span>
          <span className="pz-stamp" style={stampStyle("skull", { left: "62%", top: "58%" })} />
          <span className="pz-note" style={{ left: "70%", top: "62%" }}>{t.notes.nope}</span>
          <span className="pz-ring" style={{ left: "6%", top: "70%", width: 92, height: 60 }} />
          <span className="pz-stamp" style={stampStyle("gun", { left: "16%", top: "74%", width: 28, height: 28 })} />
          <span className="pz-note" style={{ left: "4%", top: "84%" }}>{t.notes.guns}</span>
        </figure>
      </section>

      <section className="pz-grid">
        <div className="pz-page">
          <span className="pz-clip" />
          <h2 className="pz-h2">{t.haveTitle}</h2>
          <ul className="pz-counts">
            {t.counts.map((row) => (
              <li key={row.key}>
                <span className="pz-stamp" style={stampStyle(row.stamp)} />
                {row.label}
                <b>{num(n[row.key])}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="pz-page">
          <h2 className="pz-h2">{t.aboutTitle}</h2>
          {t.about(meta.version, num(n.items), num(n.recipes), num(n.traits), num(n.professions)).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="pz-page">
          <h2 className="pz-h2">{t.toolsTitle}</h2>
          <ul className="pz-tools">
            {t.tools.map((tool) => (
              <li key={tool.title}>
                <span className="pz-stamp" style={stampStyle(tool.stamp)} />
                <b>
                  {tool.title}
                  <em className="pz-soon">{c.soon}</em>
                </b>
                <span>{tool.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: El área**

Crear `site/src/Zomboid.tsx`:

```tsx
/**
 * La sección Project Zomboid (2026-09-30): las solapas de la libreta y la página abierta. Diseño:
 * docs/design/2026-09-30-zomboid.md.
 *
 * Las pestañas que todavía no tienen página (`PZ_PUBLISHED` en route.ts) se muestran apagadas y sin enlace, la misma
 * regla que la barra aplica a los juegos que vienen, y una dirección a una de ellas muestra la portada. Las
 * tipografías y la hoja de estilos viajan con este chunk: sólo las baja quien entra a Zomboid.
 */
import RouteLink from "./RouteLink";
import { PZ_PUBLISHED, type PzSection, type Route } from "./route";
import { PZ_TABS, useZomboidCopy } from "./zomboidCopy";
import ZomboidHome from "./zomboid/ZomboidHome";
import "@fontsource/old-standard-tt/700.css";
import "@fontsource/caveat/700.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "./styles/zomboid.css";

type Nav = (route: Route) => void;

const isLive = (tab: PzSection) => tab === "home" || (PZ_PUBLISHED as PzSection[]).includes(tab);

export default function Zomboid({ route, navigate }: { route: Route; navigate: Nav }) {
  return (
    <div className="pz">
      <Tabs route={route} navigate={navigate} />
      {/* Por ahora la única página es la portada; cada pestaña se suma acá cuando se publica. */}
      <ZomboidHome route={route} navigate={navigate} />
    </div>
  );
}

/** Las solapas de la libreta: las que existen enlazan, las que vienen se anuncian apagadas. */
function Tabs({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useZomboidCopy();
  const current = route.pzSection ?? "home";
  return (
    <div className="pz-tabs-band">
      <nav className="pz-tabs" aria-label="Project Zomboid">
        {PZ_TABS.map((tab) =>
          isLive(tab) ? (
            <RouteLink
              className={`pz-tab${tab === current ? " is-on" : ""}`}
              to={{ ...route, view: "zomboid", pzSection: tab, detail: undefined }}
              onNavigate={navigate}
              active={tab === current}
              key={tab}
            >
              {t.tabs[tab]}
            </RouteLink>
          ) : (
            <span className="pz-tab is-soon" aria-disabled="true" title={t.soon} key={tab}>
              {t.tabs[tab]}
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
```

Run: `npx vitest run test/zomboidHome.test.ts`
Expected: PASS.

- [ ] **Step 6: El área en su chunk**

En `site/src/areas.ts`, después de `export const D2rArea = lazyWithPreload(loadD2r);`:

```ts
export const ZomboidArea = lazyWithPreload(() => import("./Zomboid"));
```

y en `BY_VIEW`, después de `d2r: D2rArea,`:

```ts
  zomboid: ZomboidArea,
```

En `site/src/areaFiles.ts`, en `AREA_FILES`, después de `d2r: "src/D2r.tsx",`:

```ts
  zomboid: "src/Zomboid.tsx",
```

En `site/test/areas.test.ts`, la lista esperada pasa a:

```ts
    expect(Object.keys(byView).sort()).toEqual(["d2r", "deadlock", "home", "poe2", "privacy", "terms", "valheim", "zomboid"]);
```

- [ ] **Step 7: El nombre del juego y el aviso de no afiliación**

En `site/src/i18n.ts`, objeto `EN`, dentro de `games`, después de `diablo2Short: "Diablo II",`:

```ts
    zomboid: "Project Zomboid",
    zomboidShort: "Zomboid",
```

En `EN.footer`, después de `disclaimerBlizzard: …,`:

```ts
    disclaimerTis:
      "Vestigo is a fan site and isn't endorsed by or affiliated with The Indie Stone. Project Zomboid and its " +
      "content belong to The Indie Stone.",
```

En el objeto `ES`, `games`, después de `diablo2Short: "Diablo II",`:

```ts
    zomboid: "Project Zomboid",
    zomboidShort: "Zomboid",
```

En `ES.footer`, después de `disclaimerBlizzard: …,`:

```ts
    disclaimerTis:
      "Vestigo es un sitio de fans y no está avalado por The Indie Stone ni afiliado a ella. Project Zomboid y su " +
      "contenido pertenecen a The Indie Stone.",
```

- [ ] **Step 8: El área en la app y el crédito de The Indie Stone**

En `site/src/App.tsx`:

1. La desestructuración de `areas()` suma `ZomboidArea`:

```tsx
  const { D2rArea, DeadlockArea, HomeArea, PageMeta, Poe2Area, PrivacyPage, TermsPage, ValheimArea, ZomboidArea } = areas();
```

2. `data-game` suma Zomboid:

```tsx
      data-game={place === "deadlock" || place === "poe2" || place === "valheim" || place === "d2r" || place === "zomboid" ? place : undefined}
```

3. Después de `{place === "d2r" && <D2rArea route={route} navigate={navigate} />}`:

```tsx
        {place === "zomboid" && <ZomboidArea route={route} navigate={navigate} />}
```

4. Reemplazar el bloque de fuentes del pie (`{place !== "d2r" && ( <p className="foot-sources"> … </p> )}`) por:

```tsx
        {place !== "d2r" && place !== "zomboid" && (
          <p className="foot-sources">
            {place === "poe2" ? copy.footer.sourcesPoe2 : place === "valheim" ? copy.footer.sourcesValheim : copy.footer.sourcesDeadlock}
          </p>
        )}

        {/* El crédito que piden los términos de The Indie Stone (§2.2) para usar el arte del juego: textual, en
            inglés en los dos idiomas porque es la fórmula que ellos escribieron, y con el link a sus términos. */}
        {place === "zomboid" && (
          <p className="foot-sources">
            Thanks to The Indie Stone for creating Project Zomboid (
            <a href="https://projectzomboid.com/" rel="noopener">https://projectzomboid.com/</a>), which made this possible. This is an
            unofficial fan production for non-commercial purposes made under the{" "}
            <a href="https://projectzomboid.com/blog/support/terms-conditions/" rel="noopener">Indie Stone Terms</a>.
          </p>
        )}
```

5. La línea legal:

```tsx
        <p className="foot-legal">
          {place === "d2r" ? copy.footer.disclaimerBlizzard : place === "zomboid" ? copy.footer.disclaimerTis : copy.footer.disclaimerValve}
        </p>
```

- [ ] **Step 9: Zomboid en la barra del sitio**

En `site/src/Nav.tsx`:

```ts
export type Game = "deadlock" | "poe2" | "valheim" | "d2r" | "zomboid";
```

Y después del `RouteLink` de Diablo II (el que muestra `copy.games.diablo2Short`):

```tsx
          {/* Project Zomboid entra el 2026-09-30, con la portada de la libreta. */}
          <RouteLink
            className="top-place"
            to={{ ...a("zomboid"), pzSection: "home" }}
            active={active === "zomboid"}
            onNavigate={onNavigate}
          >
            {copy.games.zomboidShort}
          </RouteLink>
```

- [ ] **Step 10: Correr todo**

Run: `npx tsc -b`
Expected: sin errores.

Run: `npx vitest run`
Expected: todo en verde salvo `test/deadlock.test.ts` (falta `@duckdb/node-api` en este worktree, no es de este trabajo).

- [ ] **Step 11: Commit**

```bash
git add games/zomboid/tools/ui.py site/public/zomboid/ui site/src/Zomboid.tsx site/src/zomboid/ZomboidHome.tsx site/src/areas.ts site/src/areaFiles.ts site/src/App.tsx site/src/Nav.tsx site/src/i18n.ts site/tsconfig.json site/vite.config.ts site/test/areas.test.ts site/test/zomboidHome.test.ts
git commit -m "feat(zomboid): la portada de la libreta, el área, el menú y el crédito de The Indie Stone

La portada es el mapa de papel de Muldraugh del juego anotado con lápiz y
sellos, más tres hojas: lo que hay (con las cifras de meta.json), el texto de
la libreta y las herramientas, que se enlazan a medida que se publican. El
pie lleva textual la frase de crédito que piden los términos de TIS."
```

---

### Task 4: SEO — sitemap, `<head>`, portada del sitio y Netlify

**Files:**
- Modify: `site/src/sitemap.ts`, `site/src/prerender.ts`, `site/vite.config.ts`, `netlify.toml`
- Modify: `site/src/Home.tsx`, `site/src/styles/home.css`, `site/src/i18n.ts`
- Create: `site/test/zomboidSeo.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PZ_SEGMENT`, `PZ_PUBLISHED`), Task 2 (`ZOMBOID_COPY`), `games/zomboid/data/meta.json`.
- Produces: el grupo de sitemap `"zomboid"` (`/sitemaps/zomboid.xml`), `SitemapData.zb?: { version: string; extractedAt: string }` y `SitemapData.dates.zomboid?: string`.

- [ ] **Step 1: El test que falla**

Crear `site/test/zomboidSeo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import pzMeta from "../../games/zomboid/data/meta.json";
import { parseRoute } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { metaFor, prerenderPages } from "../src/prerender";

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt },
  dates: { zomboid: pzMeta.extractedAt },
} as unknown as SitemapData;

describe("Project Zomboid en el sitemap y el <head>", () => {
  it("la portada entra en su grupo, con la fecha de sus datos", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/project-zomboid");
    expect(paths).toContain("/es/project-zomboid");
    expect(sitemapXml(data, "zomboid")).toContain("<loc>https://vestigo.gg/es/project-zomboid</loc>");
    expect(sitemapXml(data, "site")).not.toContain("project-zomboid");
    expect(sitemapLastmod("/es/project-zomboid", data)).toBe(pzMeta.extractedAt.slice(0, 10));
  });

  it("las pestañas que todavía no se publicaron no entran", () => {
    expect(sitemapPaths(data).some((p) => p.startsWith("/es/project-zomboid/"))).toBe(false);
  });

  it("sin el extractor corrido, Zomboid queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, zb: undefined })).not.toContain("/en/project-zomboid");
  });

  it("el título empieza por lo que se busca, en cada idioma", () => {
    expect(metaFor(parseRoute("/en/project-zomboid"), "en", null).title).toMatch(/^Project Zomboid Map/);
    expect(metaFor(parseRoute("/es/project-zomboid"), "es", null).title).toMatch(/^Project Zomboid en español/);
    expect(metaFor(parseRoute("/es/project-zomboid/mapa"), "es", null).title).toMatch(/^Mapa de Project Zomboid/);
  });

  it("la página prerenderizada tiene canonical, hreflang y el idioma", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/project-zomboid")!;
    expect(page.canonical).toBe("https://vestigo.gg/es/project-zomboid");
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/project-zomboid" });
    expect(page.lang).toBe("es");
  });
});
```

Run: `npx vitest run test/zomboidSeo.test.ts`
Expected: FAIL (la portada no está en el sitemap).

- [ ] **Step 2: El sitemap**

En `site/src/sitemap.ts`:

1. El import de `./route` suma `PZ_PUBLISHED, PZ_SEGMENT`:

```ts
import { LANGS, DEADLOCK_PAGES, D2R_SECTIONS, POE2_SECTIONS, PZ_PUBLISHED, PZ_SEGMENT, SITE_ORIGIN, VALHEIM_TABS, parseRoute, routePath, slugify, type D2rTab, type ValheimTab } from "./route";
```

2. Después de `export interface D2rSitemapData { … }`:

```ts
/** Lo que el sitemap necesita de Project Zomboid (2026-09-30): el `meta.json` de `games/zomboid/tools/extract.py`. */
export interface ZomboidSitemapData {
  version: string;
  /** Cuándo cambiaron los datos de verdad (el extractor no la mueve si no cambió nada). */
  extractedAt: string;
}
```

3. En `interface SitemapData`, después de `d2?: D2rSitemapData;`:

```ts
  /** Project Zomboid. Opcional por lo mismo. */
  zb?: ZomboidSitemapData;
```

y `dates` pasa a:

```ts
  dates?: { deadlock?: string; poe2Economy?: string; valheim?: string; d2r?: string; zomboid?: string };
```

4. `SITEMAP_GROUPS`:

```ts
export const SITEMAP_GROUPS = ["site", "deadlock", "poe2", "valheim", "d2r", "zomboid"] as const;
```

5. `sitemapGroup`:

```ts
function sitemapGroup(path: string): SitemapGroup {
  const game = path.split("/")[2];
  // Zomboid se llama distinto en la dirección (`/project-zomboid`) que en el grupo.
  if (game === PZ_SEGMENT) return "zomboid";
  return game === "deadlock" || game === "poe2" || game === "valheim" || game === "d2r" ? game : "site";
}
```

6. En `sitemapLastmod`, antes del `return undefined;` final:

```ts
  if (game === PZ_SEGMENT) return day(data.dates?.zomboid);
```

7. En `sitemapPaths`, dentro del `for (const lang of LANGS)`, después del bloque `if (data.d2) { … }`:

```ts
    // Project Zomboid (2026-09-30): la portada y las pestañas que ya tienen página (`PZ_PUBLISHED`).
    if (data.zb) {
      paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: "home" }));
      for (const s of PZ_PUBLISHED) paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: s }));
    }
```

- [ ] **Step 3: El `<head>`**

En `site/src/prerender.ts`:

1. Import:

```ts
import { ZOMBOID_COPY } from "./zomboidCopy";
```

2. En `metaFor`, antes del comentario `// Lo que queda son la portada y las dos páginas legales.`:

```ts
  // Project Zomboid (2026-09-30): la portada y cada pestaña.
  if (route.view === "zomboid") return ZOMBOID_COPY[lang].seo[route.pzSection ?? "home"];
```

3. En `jsonLdFor`, antes de `if (route.view !== "deadlock") return [];`:

```ts
  if (route.view === "zomboid") {
    // Vestigo › Project Zomboid › pestaña › ficha.
    const sec = route.pzSection ?? "home";
    const trail = [{ name: brand, url: home }, { name: "Project Zomboid", url: routeUrl({ ...route, pzSection: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: ZOMBOID_COPY[lang].tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    return trail.length > 2 ? [crumbs(trail)] : [];
  }
```

- [ ] **Step 4: Los datos del build**

En `site/vite.config.ts`, dentro de `readSitemapData`, antes del `return {`:

```ts
  // Project Zomboid (2026-09-30): el sello del extractor. Sin él, la sección queda afuera del sitemap.
  let zb: SitemapData["zb"];
  try {
    const m = JSON.parse(readFileSync(`${zomboidDir}/meta.json`, "utf-8"));
    zb = { version: m.version, extractedAt: m.extractedAt };
  } catch {
    zb = undefined;
  }
```

En el objeto que devuelve, después de `d2,`:

```ts
      zb,
```

y en `dates`, después de `d2r: d2?.extractedAt,`:

```ts
        zomboid: zb?.extractedAt,
```

En `netlify.toml`, la línea `ignore` suma los datos de Zomboid:

```toml
  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- :/site :/games/deadlock/data :/games/poe2/data :/games/valheim/data :/games/d2r/data :/games/zomboid/data :/netlify.toml"
```

- [ ] **Step 5: Zomboid en la portada del sitio**

En `site/src/i18n.ts`, `EN.home.games`, después de `d2rUniques: "uniques that can drop",`:

```ts
      zomboidLive: "The Knox County map, every item and recipe of Build 42, and the planners to last one more day.",
      zomboidCta: "Open the notebook",
      zomboidItems: "items",
      zomboidRecipes: "recipes",
```

y en `ES.home.games`, después de `d2rUniques: "únicos que pueden caer",`:

```ts
      zomboidLive: "El mapa de Knox County, todos los objetos y recetas de la Build 42, y los planificadores para durar un día más.",
      zomboidCta: "Abrir la libreta",
      zomboidItems: "objetos",
      zomboidRecipes: "recetas",
```

En `site/src/Home.tsx`, después de `import d2Meta from "@d2r/meta.json";`:

```ts
import pzMeta from "@zomboid/meta.json";
```

y después del `<li className="game-panel" data-panel="d2r">…</li>`:

```tsx
          {/* Project Zomboid entra el 2026-09-30, con la portada de la libreta. */}
          <li className="game-panel" data-panel="zomboid">
            <div className="game-panel-main">
              <h3 className="game-panel-name">{copy.games.zomboid}</h3>
              <p className="game-panel-note">{copy.home.games.zomboidLive}</p>
              <div className="game-panel-ctas">
                <RouteLink className="game-cta" to={{ ...route, view: "zomboid", pzSection: "home", detail: undefined }} onNavigate={navigate}>
                  {copy.home.games.zomboidCta}
                  <Arrow />
                </RouteLink>
              </div>
            </div>
            <div className="game-panel-figures">
              <p className="game-figure">
                <b>{num(pzMeta.counts.items)}</b>
                <span>{copy.home.games.zomboidItems}</span>
              </p>
              <p className="game-figure is-second">
                <b>{num(pzMeta.counts.recipes)}</b>
                <span>{copy.home.games.zomboidRecipes}</span>
              </p>
            </div>
          </li>
```

En `site/src/styles/home.css`, después del bloque de Diablo II (`… .game-panel[data-panel="d2r"] .game-cta { … }`):

```css
/* --- Project Zomboid: el verde del escritorio y el mapa de papel (2026-09-30) --- */

[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] {
  background:
    linear-gradient(180deg, rgba(24, 33, 24, 0.9) 0%, rgba(20, 28, 20, 0.96) 100%),
    url(/zomboid/ui/muldraughmap.webp) 50% 35% / cover;
  color: #b9c2ad;
}
[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] .game-panel-name { color: #efe9d8; }
[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] .game-figure b { color: #f3d36b; }
[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] .game-figure.is-second b { color: #efe9d8; }
[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] .game-figure span { color: #8a9580; }
[data-theme="codex"][data-place="home"] .game-panel[data-panel="zomboid"] .game-cta { background: #b3261e; border-color: #b3261e; color: #fff5e6; }
```

- [ ] **Step 6: Correr todo**

Run: `npx vitest run test/zomboidSeo.test.ts`
Expected: PASS.

Run: `npx tsc -b` y `npx vitest run`
Expected: sin errores de tipos; todo en verde salvo `test/deadlock.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add site/src/sitemap.ts site/src/prerender.ts site/vite.config.ts netlify.toml site/src/Home.tsx site/src/styles/home.css site/src/i18n.ts site/test/zomboidSeo.test.ts
git commit -m "feat(zomboid): sitemap propio, <head> y JSON-LD, y la entrada en la portada del sitio

sitemaps/zomboid.xml con el lastmod del extractor; sólo la portada y las
pestañas publicadas. Netlify también reconstruye cuando cambian los datos."
```

---

### Task 5: Build, servidor local y revisión visual

**Files:**
- Modify: `C:\Users\Zotad\Desktop\vestigo\.claude\launch.json` (fuera del repo del worktree; no se commitea)

- [ ] **Step 1: El build entero**

Run (desde `site/`): `npm run build`
Expected: termina con `✓ built`, y el prerender escribe `dist/es/project-zomboid.html` y `dist/en/project-zomboid.html`.

Run: `grep -c 'name="description"' dist/es/project-zomboid.html`
Expected: `1`.

Run: `grep -o '<html lang="[a-z]*">' dist/es/project-zomboid.html`
Expected: `<html lang="es">`.

Run: `grep -o 'project-zomboid' dist/sitemaps/zomboid.xml | head -2`
Expected: dos líneas.

- [ ] **Step 2: El servidor de desarrollo para que ZoTaD vea el avance**

Agregar a `C:\Users\Zotad\Desktop\vestigo\.claude\launch.json`, dentro de `configurations`:

```json
    {
      "name": "vestigo-zomboid",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "C:/Users/Zotad/Desktop/vestigo-zomboid/site", "run", "dev", "--", "--port", "5178", "--strictPort"],
      "port": 5178,
      "autoPort": false
    },
```

Levantarlo con `preview_start` (`name: "vestigo-zomboid"`) y abrir `http://localhost:5178/es/project-zomboid`.

- [ ] **Step 3: Revisar en el navegador**

- `read_console_messages` sin errores.
- La portada muestra el mapa de papel con cinta, sellos rojos y notas a mano.
- Las tres hojas muestran cifras reales.
- Las pestañas: sólo "Libreta" enlaza; las demás, apagadas.
- El pie tiene la frase de TIS con sus dos links y el aviso de no afiliación.
- En `/en/project-zomboid` todo en inglés.
- Con `resize_window` preset `mobile`: las pestañas bajan de fila, sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`). Después volver a `desktop`.
- En la portada del sitio (`/es`), el panel de Project Zomboid con sus dos cifras.

- [ ] **Step 4: Commit de lo que haya hecho falta corregir**

Si la revisión obligó a cambiar algo:

```bash
git add -A site games/zomboid/tools
git commit -m "fix(zomboid): <lo que se corrigió en la revisión visual>"
```
