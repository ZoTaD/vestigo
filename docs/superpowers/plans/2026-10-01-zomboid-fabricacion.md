# Project Zomboid — Fabricación: "quiero X" → qué juntar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la pestaña **Fabricación** (`/en/project-zomboid/crafting`, `/es/project-zomboid/fabricacion`): elegís qué querés fabricar o construir y la libreta te arma el árbol completo de recetas, la lista de materiales para juntar, las herramientas, los líquidos, las estaciones, las habilidades, lo que hay que aprender (y dónde: libro o revista, nivel, investigar, rasgo o profesión) y dónde conseguir cada cosa; con link para compartir. Mismo patrón que el Planificador de Valheim.

**Architecture:**
- **Datos:** un paso nuevo, `games/zomboid/tools/craft.py`, arma **un solo archivo**, `games/zomboid/data/craft.json` (~80 KB con gzip), con el grafo entero: las 1.170 recetas compactas (líneas, opciones ya abiertas de las etiquetas, cantidades, usos de los drenables, líquidos, resultados según ingrediente, estaciones, habilidades, cómo se aprende) y los objetos que nombran (nombre, ícono, usos, y —si ya existe el botín— si se encuentra y dónde es más fácil). Reusa la clase `Site` de `site.py` (cargada por ruta) para que las opciones y los slugs sean exactamente los de las fichas. Va **fuera** de `data/site/` porque `site.py` borra todo lo que no escribe él.
- **Motor puro** (`site/src/zomboid/crafting/engine.ts`, sin React): costo por unidad de cada objeto (punto fijo, ciclos incluidos), receta y opción por defecto, el árbol para dibujar y los totales con la demanda junta (las tandas se redondean una vez, como en Valheim), lo que tenés restado y los ciclos cortados. El estado vive en la dirección (`state.ts`).
- **Pestaña:** un chunk propio que baja `craft.json` por `import()` (precargado para el prerender: nunca "cargando…"), con el buscador de objetivos a la izquierda y la hoja de ruta (totales + árbol) a la derecha; en el celular, uno abajo del otro.

**Tech Stack:** Python 3 (sólo biblioteca estándar), React 18 + Vite + TS, Vitest.

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md` ("Pestañas" 5: "quiero X → el árbol completo, la lista de materiales, lo que hay que aprender y dónde conseguir cada cosa. Mismo patrón que el Planificador de Valheim"; "Direcciones": `crafting` / `fabricacion`; "Reglas de la casa"). Andamio: `docs/superpowers/plans/2026-09-30-zomboid-andamio.md`. Objetos y Recetas: `docs/superpowers/plans/2026-09-30-zomboid-objetos-recetas.md`. Botín: `docs/superpowers/plans/2026-10-01-zomboid-loot.md` (se hace en paralelo: este plan lo usa si está y anda sin él).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. npm/vitest desde `site/`; los extractores desde la raíz del worktree. `test/deadlock.test.ts` falla por una dependencia ajena: ignorarlo.
- **Nunca `git add -A`** ni `git add .`: hay otros agentes escribiendo en el mismo worktree y el índice es compartido. Agregar sólo los archivos de cada tarea y commitear con `git commit -m "…" -- <esos archivos>`.
- **Instalación del juego** (sólo para verificar semántica, nada la lee en runtime): `C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid` (42.21), overridable con `PZ_DIR`.
- **Estética "Libreta de supervivencia"** (maqueta C, clases `.pz-*` en `site/src/styles/zomboid.css`): hojas con renglones sobre el verde del escritorio; títulos en Old Standard TT, notas a mano en Caveat (lápiz rojo), texto en Noto Sans; los sellos del juego (`Stamp`) como viñetas; íconos con `ItemIcon` (`image-rendering: pixelated`). Lo propio de la pestaña va en `site/src/styles/zomboid-crafting.css`, que además importa `zomboid-items.css` (las hojas, el buscador y los renglones de Objetos, como hace Personaje).
- **Reglas de la casa:**
  - sin bordes ni barras de color en tarjetas o filas: el estado (elegido, hoja, ciclo, "hay que aprenderla") va por tinte suave, texto o cifra, nunca por un filo;
  - las palabras no se cortan: nunca `overflow-wrap: anywhere` ni `word-break: break-all`; los títulos se achican con `wordFit`/container queries;
  - sin scroll horizontal de la página en el celular (375 px): el árbol sangra a lo sumo 12 px por nivel y deja de sangrar después del nivel 6; los chips de categoría bajan de renglón; una lista larga de opciones va en un `<select>`;
  - todo texto en/es, con voseo rioplatense;
  - **nada de "sacado de los archivos del juego"** ni de cómo se calcula por dentro: las notas dicen qué significa el número, no de dónde sale;
  - el prerender nunca muestra "cargando…": `craft.json` se espera en `preloadZomboid` y en `TAB_DATA`;
  - SEO: título ≤ 65 caracteres que empieza por lo que se busca (ya están en `zomboidCopy.ts`, `seo.crafting`: "Project Zomboid Crafting Planner: What to Gather | Vestigo" / "Planificador de fabricación de Project Zomboid | Vestigo"); canonical sin query.
- **Nombres del juego:** de los datos, sin inventar. Las cifras de la página (cuántos objetos se fabrican, etc.) salen de `craft.json`, nunca escritas a mano.
- **Cada cosa visible se conecta apenas anda**, en su propio commit: la pestaña se publica en la rama en la Task 3 y lo demás se ve en `http://localhost:5178/es/project-zomboid/fabricacion` en cuanto se commitea.
- **Rendimiento:** la cáscara no crece; `craft.json` nunca va en un chunk (sólo `import()`); el chunk `ZomboidCrafting` sin datos ≤ 30 KB con gzip (sin contar los slugs en español de sus enlaces, que van en módulos aparte). Anotar las cifras reales en el informe.
- Comentarios y commits en español rioplatense, explicando el porqué.

---

## Lo que hay en el juego (42.21, medido el 1/10 sobre `data/recipes.json` y `data/site/recipes/*.json`)

| Qué | Cuánto |
|---|---|
| Recetas | 1.170: 969 de fabricar (`craftRecipe`) y 201 de construir (resultado `entity`) |
| Recetas sin resultado declarado | 37 (abrir latas, reparar con cinta, afilar, cargar encendedores…): nunca son objetivo |
| Objetos (fichas) que salen de alguna receta | 1.584 |
| …con más de una receta | 242 (el que más: trozo de acero, 14; trozo de hierro, 12; tiras de cuero y cuarto de barra de acero, 8) |
| Líneas de entrada | 4.027: 2.100 por etiqueta (`tags[...]`), 2.229 con más de una opción (hasta 190), 1.501 herramientas (`mode:keep`) |
| Líquidos | 55 líneas; **siempre** pegadas a la línea anterior, que es su recipiente (34 de ellas `[*]`, "cualquier recipiente") |
| Cantidad variable (`[1, 20]`) | 33 entradas, 33 salidas (secar de 1 a 20 plantas) |
| `flags[ItemCount]` | 185 líneas |
| Drenables | 149 objetos (`useDelta`: cordel 0,2 → 5 usos; cinta 0,25 → 4; hilo de tendón 0,1 → 10) |
| Resultado según el ingrediente (`itemMapper`) | 225 salidas en 211 recetas |
| Recetas "Packing" y "Repair" | 46 |
| Recetas cuyo resultado también es ingrediente | 39 |
| Grupos de ciclos (sin Packing/Repair) | 17, dos enormes (476 y 165 objetos): los arma "desarmar" (hacha → cabeza de hacha, hacha ← cabeza + mango) y los pares hacer/deshacer (cuerda ↔ cinturón de cuerda, huevo ↔ maple, tronco ↔ pila de troncos, sábana ↔ soga de tela) |
| Cadena más profunda (camino más corto a lo crudo, ciclos cortados) | 6 pasos (yunque de herrero); varias de 5 (frascos de conserva abiertos, tostadas) |
| Estaciones | 34; 30 tienen una receta de construcción que la da (`stations[k].entities` ↔ salida `entity`) |
| Recetas con `OnCreate` (Lua) | 159: el planificador usa sólo los resultados declarados (ver "Fuera de este plan") |

**Semántica que el motor respeta** (verificada en los scripts `media/scripts/generated/**` y en las cadenas de `zombie/scripting/entity/components/crafting/InputScript.class` del jar: `isUsesPartialItem`, `isItemCount`, `getCurrentUses`, `isKeep`, `isFluidMatch`):
- **Etiquetas:** una línea `tags[a;b]` acepta cualquier objeto con alguna de las etiquetas; `site.py` ya las abre (`options`) en el mismo orden que la ficha.
- **`mode:keep`:** herramienta; no se gasta (puede gastarse de a poco: `MayDegrade*`, que el planificador ignora). Se necesita una, sin importar cuántas tandas.
- **Drenables:** en una línea, `item N [Base.Twine]` pide **N usos**, salvo `flags[ItemCount]`, que pide N objetos enteros. Lo que sale de una receta sale lleno. Usos de un objeto lleno = `round(1 / useDelta)`.
- **Líquidos:** `-fluid 5 [CowMilk;SheepMilk]` es parte de la línea anterior (el recipiente). Si esa línea es `[*]`, el recipiente es cualquiera y sólo cuenta el líquido; si nombra objetos, esa línea vale por sí misma con su modo (el tazón del panqueque es herramienta; la taza del café se gasta).
- **Cantidad variable:** se planifica con el mínimo.
- **`counts`:** una opción puede pedir otra cantidad (cordel: 1 de cáñamo o 25 usos de hilo de tendón).
- **`itemMapper`:** el resultado depende de la opción de la línea que lleva el mapper (espadillar: lino ondulado → lino espadillado; cáñamo seco → cáñamo espadillado). Para fabricar el resultado X, esa línea sólo acepta las opciones que dan X (`from`); la opción `default` acepta las que no nombra ninguna otra.
- **Varios resultados:** los que no son el pedido son subproductos ("te quedan").

---

## Archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `games/zomboid/tools/craft.py` | arma `data/craft.json` | 1 |
| `games/zomboid/tools/site.py` | `Site.granted()` sale de `build()` para que lo use `craft.py` | 1 |
| `games/zomboid/tools/extract.py` | llama a `craft.main()` después de `site.main()` | 1 |
| `games/zomboid/data/craft.json` | generado | 1 |
| `site/test/zomboidCraftData.test.ts` | el archivo real: forma, casos conocidos, peso | 1 |
| `site/src/zomboid/crafting/data.ts` | tipos de `craft.json` y su carga | 2 |
| `site/src/zomboid/crafting/engine.ts` | el motor | 2 |
| `site/src/zomboid/crafting/state.ts` | el estado, la dirección y sus cambios | 2 |
| `site/test/zomboidCraftEngine.test.ts`, `site/test/zomboidCraftState.test.ts` | casos reales hechos a mano | 2 |
| `site/src/zomboid/crafting/copy.ts` | textos en/es | 3 (crece en 4) |
| `site/src/zomboid/crafting/ZomboidCrafting.tsx` | la pestaña: cabecera, dirección, dos columnas | 3 |
| `site/src/zomboid/crafting/Picker.tsx` | buscador de objetivos y "tu lista" | 3 |
| `site/src/zomboid/crafting/RouteSheet.tsx` | los totales | 3 (crece en 4) |
| `site/src/zomboid/crafting/TreeSheet.tsx` | el árbol con sus selectores | 3 (crece en 4) |
| `site/src/zomboid/crafting/store.ts` | estado compartido + dirección + `localStorage` | 3 |
| `site/src/styles/zomboid-crafting.css` | estilos propios | 3 |
| `site/vite.config.ts` | `virtual:pz-slugs-es/craft-items` | 3 |
| `site/src/route.ts`, `site/src/Zomboid.tsx`, `site/src/areaFiles.ts`, `site/src/entry-server.tsx`, `site/src/prerender.ts`, `site/src/zomboid/ZomboidHome.tsx` | publicar la pestaña | 3 |
| `site/test/zomboidCrafting.test.ts` | prerender, SEO, sitemap, hoja de ruta | 3 |
| `site/src/zomboid/crafting/LearnSheet.tsx`, `site/src/zomboid/crafting/Character.tsx` | aprender, tu personaje | 4 |
| `site/src/zomboid/loot/chance.ts` | `pct` (si el plan de Botín no lo creó todavía) | 4 |
| `site/test/zomboidCraftingLearn.test.ts` | aprender, botín, "tengo" | 4 |
| `site/src/zomboid/crafting/link.tsx` | `CraftLink`: el enlace con la query | 5 |
| `site/src/zomboid/items/ItemFicha.tsx`, `site/src/zomboid/recipes/RecipeFicha.tsx`, `site/src/zomboid/planner/ZomboidPlanner.tsx` | entradas desde el resto | 5 |
| `games/zomboid/tools/loot.py` (si existe), `games/zomboid/README.md` | el orden de los extractores | 5 |
| `site/test/zomboidCraftingLinks.test.ts` | los enlaces de entrada | 5 |

---

### Task 1: `craft.py` — el grafo de fabricación en un archivo

**Files:**
- Create: `games/zomboid/tools/craft.py`, `games/zomboid/data/craft.json` (generado), `site/test/zomboidCraftData.test.ts`
- Modify: `games/zomboid/tools/site.py` (método `Site.granted()`), `games/zomboid/tools/extract.py` (llama a `craft.main()`), `games/zomboid/README.md`

**Interfaces:**
- Consumes: `site.py` cargado por ruta (`importlib.util.spec_from_file_location("zomboid_site", …)`, como hace `extract.py`: `import site` daría el de la biblioteca estándar): `Site()`, `s.recipes`, `s.recipe_entries`, `s.entry`, `s.full`, `s.stations`, `s.fluids`, `s.fluid_cats`, `s.recipe_cats`, `s.recipe_input(io)`, `s.recipe_output(r, e, o)`, `s.recipe_learn(r, granted)`, `s.recipe_icon(r, outputs)`, `s.item_slug(gid)`, `s.skill_ref(key)`, `s.trait_ref(tid, sec)`, `s.traits`, `s.professions`, `loc`, `split_count`, `dumps`. Si existe `games/zomboid/data/loot/items/*.json` (plan de Botín, Task 2), lo lee; si no, sigue sin él.
- Produces:
  - **`site.py`:** `Site.granted(self) -> dict` con `{"traits": {rid: [tid]}, "professions": {rid: [pid]}}` (el bloque que hoy está al principio de `build()`, movido tal cual; `build()` lo llama).
  - **`craft.py`:** `build(s) -> dict` (el contenido de `craft.json`) y `main()` (lo escribe sólo si cambió e imprime cifras). `ROOT`, `DATA` y `OUT = DATA/craft.json`.
  - **`games/zomboid/data/craft.json`**, con esta forma (la misma que tipa `crafting/data.ts` en la Task 2):
    ```ts
    type Loc = { en: string; es: string };
    interface CraftData {
      v: string;                          // versión del juego (meta.json)
      loot: boolean;                      // si se armó con los datos de botín
      cats: Record<string, Loc>;          // categorías de receta → nombre
      items: Record<string, CItem>;       // slug → objeto: todos los que nombra alguna receta (entradas, salidas, libros, investigables)
      recipes: Record<string, CRecipe>;   // slug → receta: las 1.170, en el orden del índice
      makes: Record<string, string[]>;    // slug de objeto → recetas que lo dan, en el orden del índice
      stations: Record<string, CStation>; // clave del juego ("PrimitiveForge") → nombre y construcciones que la dan
      skills: Record<string, Loc>;        // slug de habilidad ("carpentry") → nombre
      traits: Record<string, CTrait>;     // rasgos que enseñan alguna receta
      profs: Record<string, CProf>;       // profesiones que enseñan alguna receta, directo o por sus rasgos gratis
      counts: { craftable: number; builds: number; multi: number; recipes: number };
    }
    interface CItem {
      en: string; es: string; icon: string | null;
      c: string;      // categoría de la primera receta que lo hace ("" si ninguna): para filtrar el buscador
      u?: number;     // usos de un drenable lleno, round(1/useDelta); sin `u`, se cuenta por unidad
      f?: 1;          // se encuentra en el mundo: su mejor chance en algún lado es ≥ 0,5 % (sólo con botín)
      w?: [key: string, cont: string, p: number, n: number]; // dónde es más fácil: la primera fila de `rooms` del botín + `nRooms`
    }
    interface CIn {
      n: number;                    // cantidad por tanda (la mínima si varía); en un líquido, litros
      k?: 1;                        // herramienta (mode:keep)
      o: string[];                  // opciones (slugs), en el orden de la ficha de receta
      on?: Record<string, number>;  // otra cantidad para una opción
      ic?: 1;                       // flags[ItemCount]: un drenable se cuenta por objeto entero
      fl?: Loc;                     // es un líquido (nombres juntos con " / ", como la ficha)
      any?: 1;                      // `[*]`: cualquier objeto o recipiente
    }
    type COut =
      | { n: number; i: string }                                          // un objeto
      | { n: number; m: [out: string, from: string[]][]; mi: number[] }   // según el ingrediente; `mi`: las líneas que lo deciden
      | { e: 1 };                                                         // el mueble que se construye
    interface CRecipe {
      en: string; es: string; kind: "craft" | "build"; cat: string; icon: string | null;
      in: CIn[]; out: COut[];
      sk?: [skill: string, lvl: number][];   // habilidad requerida (slugs de habilidad)
      xp?: [skill: string, xp: number][];
      st?: string[];                          // estaciones (claves de `stations`)
      learn?: CLearn;                         // sin `learn`: se sabe desde el principio
      x?: "pack" | "repair" | "self" | "undo"; // no se elige sola para un paso intermedio (ver abajo)
    }
    interface CLearn { books: string[]; lv: [skill: string, lvl: number][]; anyLv?: 1; research: string[]; traits: string[]; profs: string[] }
    interface CStation { en: string; es: string; builds: string[] }   // slugs de las recetas de construcción, en el orden de `entities`
    interface CTrait { en: string; es: string; icon: string | null }
    interface CProf { en: string; es: string; icon: string | null; traits: string[] }  // rasgos gratis (slugs) que están en `traits`
    ```

**Cómo se arma cada parte** (todo en `craft.py`, con un comentario que diga el porqué):
- **Recetas:** por cada `e in s.recipe_entries` (orden del índice), `r = s.recipes[e["ref"][0]]`, `ficha_in = [s.recipe_input(io) for io in r["inputs"]]`:
  - `o` = `[ref["id"] for ref in ficha_in[k]["opts"]]` (mismo orden que la ficha);
  - `n` = `split_count(io.get("fluid", io.get("count")))[0]`;
  - `k: 1` si `io.get("mode") == "keep"`; `ic: 1` si `"ItemCount" in io.get("flags", [])`; `any: 1` si `io.get("any")`; `fl` = `ficha_in[k]["fluid"]` si es líquido;
  - `on` = `{o["id"]: o["n"] for o in ficha_in[k]["opts"] if "n" in o}` si no queda vacío.
- **Salidas:** `s.recipe_output(r, e, o)` por cada salida. `{"item": ref}` → `{"n", "i": ref["id"]}`; `{"choices": …}` → `{"n", "m": [[c["item"]["id"], [x["id"] for x in c["from"]]] …], "mi": [k for k, io in enumerate(r["inputs"]) if o["mapper"] in io.get("mappers", [])]}`; `{"entity"}` → `{"e": 1}`. Una salida que `recipe_output` descarta (`None`) no va.
- **`sk`, `xp`:** `[[s.skill_ref(k)["id"], v] …]` (sin ficha de habilidad, no va). **`st`:** las claves de `r.get("stations", [])` que estén en `s.stations`.
- **`learn`:** de `s.recipe_learn(r, s.granted())` (sólo si no es `None`): `books`/`research` como slugs, `lv` = `[[slug de la habilidad, nivel]]` (con `autoLearnAll`/`autoLearnAny` crudos de `r["learn"]`, pasados por `s.skill_ref`), `anyLv: 1` si la ficha trae `anySkill`, `traits`/`profs` como slugs.
- **`x` (no se elige sola), en este orden de prioridad:**
  - `"pack"`: categoría `Packing`; `"repair"`: categoría `Repair`;
  - `"self"`: algún resultado (objeto o elección del mapper) está entre las opciones de una línea que se gasta (no `k`, no líquido, no `any`);
  - `"undo"`: deshace a otra: la receta gasta **una sola línea** (sin contar herramientas, líquidos ni `any`), y existe otra receta que gasta alguno de sus resultados y da alguna de las opciones de esa línea. Son las de desarmar y los pares hacer/deshacer.
  - Por qué: como paso intermedio, nadie quiere "para la cuerda, desatá un cinturón de cuerda" ni "para los clavos, abrí una caja de clavos". Como objetivo, en cambio, todas valen (el motor ignora `x` en la raíz), y en el árbol se pueden elegir a mano.
- **`makes`:** de las salidas (objeto o elecciones del mapper), sin repetir, en el orden del índice de recetas. **`c` de cada objeto:** la `cat` de la primera receta de `makes`.
- **`u`:** `s.full[gid]` de la primera variante de la ficha (`s.entry[("items", gid)]["ref"][0]`): si `type == "drainable"` y `stats.useDelta > 0`, `max(1, round(1 / useDelta))`.
- **Estaciones:** `stations[k] = {**loc(s.stations[k]["name"]), "builds": [...]}`, donde `builds` son los slugs de las recetas de construcción cuya salida `entity` está en `s.stations[k]["entities"]`, en el orden de `entities` (la primitiva primero en las forjas).
- **Rasgos y profesiones:** los que aparecen en algún `learn`, más los rasgos gratis de esas profesiones que aparezcan en algún `learn`; `CProf.traits` = esos rasgos gratis (de `professions.json` → `traits`, por `s.trait_ref`).
- **Botín (si existe `DATA/loot/items/*.json`):** por slug, `ItemLoot` (forma en el plan de Botín, Task 2). `best = max(p de rooms, stash, zombie.m, zombie.f, outfits, vehicles, bags)`; `f: 1` si `best >= 0.005` (el corte de "raro" de `band()` del Botín: lo que aparece menos que eso, conviene fabricarlo). `w = [rooms[0][0], rooms[0][1], rooms[0][2], nRooms]` si hay `rooms`. `loot: true`. Sin la carpeta: ni `f` ni `w`, `loot: false`.
- **`counts`:** `craftable = len(makes)`, `builds` = recetas `build`, `multi` = objetos con más de una receta, `recipes = len(recipes)`.
- **Peso:** si `craft.json` pasa los topes del test (las etiquetas abiertas repiten listas de hasta 190 objetos en muchas líneas), las listas de opciones repetidas van una sola vez en `lists: string[][]` y la línea lleva `o: number` (su índice); `data.ts` las vuelve a abrir al cargar (`CIn.o` sigue siendo `string[]` para el motor). Sólo si hace falta: primero medir.
- **Escritura:** `zs.dumps(data)`; se reescribe sólo si cambió. `main()` imprime: cuántas recetas, objetos fabricables, con más de una receta, por cada `x` cuántas, objetos `f`, peso crudo/gzip; y avisa por stderr si una línea que se gasta queda sin opciones (salvo líquidos y `any`).
- **`extract.py`:** después de `site.main()`, cargar `craft.py` por ruta y llamar a `craft.main()`.

- [ ] **Step 1: Tests que fallan** — `site/test/zomboidCraftData.test.ts`, con el archivo real (`import craft from "../../games/zomboid/data/craft.json"` y los shards de recetas por `import.meta.glob("../../games/zomboid/data/site/recipes/*.json", { eager: true })`):
  ```ts
  import { describe, expect, it } from "vitest";
  import craftJson from "../../games/zomboid/data/craft.json";
  const craft = craftJson as any;
  const fichas = Object.assign({}, ...Object.values(import.meta.glob("../../games/zomboid/data/site/recipes/*.json", { eager: true, import: "default" }))) as Record<string, any>;

  describe("craft.json", () => {
    it("tiene las 1.170 recetas, con las mismas opciones que su ficha", () => {
      expect(Object.keys(craft.recipes)).toHaveLength(1170);
      for (const [id, r] of Object.entries<any>(craft.recipes)) {
        const f = fichas[id];
        expect(f, id).toBeTruthy();
        expect(r.in.map((l: any) => l.o), id).toEqual(f.inputs.map((i: any) => i.opts.map((o: any) => o.id)));
      }
    });
    it("todo slug que nombra existe en items, y makes es simétrico con las salidas", () => {
      for (const [rid, r] of Object.entries<any>(craft.recipes)) {
        for (const l of r.in) for (const o of l.o) expect(craft.items[o], `${rid} → ${o}`).toBeTruthy();
        for (const o of r.out) {
          const outs = "i" in o ? [o.i] : "m" in o ? o.m.map((x: any) => x[0]) : [];
          for (const s of outs) expect(craft.makes[s], `${s} ← ${rid}`).toContain(rid);
        }
      }
    });
    it("las cifras", () => {
      expect(craft.counts).toMatchObject({ craftable: 1584, builds: 201, multi: 242, recipes: 1170 });
    });
    it("aserrar troncos: 1 tronco y una sierra dan 3 tablas", () => {
      const r = craft.recipes["saw-log"];
      expect(r.in[0]).toEqual({ n: 1, o: ["log"] });
      expect(r.in[1]).toMatchObject({ n: 1, k: 1, o: ["hacksaw", "simple-wood-saw", "wood-saw"] });
      expect(r.out).toEqual([{ n: 3, i: "plank" }]);
      expect(r.x).toBeUndefined();
    });
    it("el estante grande de secado pide 8 usos de cordel, y el cordel tiene 5", () => {
      const r = craft.recipes["large-plant-drying-rack"];
      expect(r.kind).toBe("build");
      expect(r.in[1]).toEqual({ n: 8, o: ["twine"] });
      expect(craft.items.twine.u).toBe(5);
      expect(r.sk).toEqual([["carpentry", 1]]);
      expect(r.out).toEqual([{ e: 1 }]);
    });
    it("cordel: 1 de cáñamo, o 25 usos de hilo de tendón", () => {
      expect(craft.recipes["craft-twine"].in[0]).toMatchObject({ n: 1, on: { "sinew-thread": 25 } });
      expect(craft.items["sinew-thread"].u).toBe(10);
    });
    it("secar maíz cuenta mazorcas enteras (ItemCount) y espadillar decide el resultado por la primera línea", () => {
      const dry = Object.values<any>(craft.recipes).find((r) => r.en === "Dry Corn");
      expect(dry.in[0].ic).toBe(1);
      const sc = craft.recipes["scutch-fibre"];
      const m = sc.out[0];
      expect(m.mi).toEqual([0]);
      expect(m.m).toContainEqual(["flax-scutched", ["flax-rippled"]]);
      expect(sc.st).toEqual(["Scutching"]);
    });
    it("batir manteca: 5 L de leche en cualquier recipiente, en la mantequera", () => {
      const r = craft.recipes["churn-butter"];
      expect(r.in[0]).toMatchObject({ any: 1, o: [] });
      expect(r.in[1]).toMatchObject({ n: 5, o: [] });
      expect(r.in[1].fl.en).toBe("Cow's Milk / Sheep's Milk");
      expect(craft.stations.ChurnBucket.builds).toEqual(["butter-churn"]);
    });
    it("forjar 10 clavos se aprende y lo sabe el herrero", () => {
      const l = craft.recipes["forge-10-nails"].learn;
      expect(l.books).toEqual(["magazine-everyday-smithing-june-1993"]);
      expect(l.lv).toEqual([["blacksmithing", 3]]);
      expect(l.profs).toContain("blacksmith");
      expect(craft.recipes["forge-10-nails"].st).toEqual(["PrimitiveForge"]);
      expect(craft.stations.PrimitiveForge.builds[0]).toBe("primitive-forge");
    });
    it("las que no se eligen solas", () => {
      expect(craft.recipes["open-box-100-items"].x).toBe("pack");
      expect(craft.recipes["untie-rope-belt"].x).toBe("undo");
      expect(craft.recipes["unstack-3-logs"].x).toBe("undo");
      expect(["undo", "self"]).toContain(craft.recipes["open-egg-carton"].x); // "self" si el maple vacío vuelve como resultado
      for (const id of ["saw-log", "craft-twine", "twist-rope-from-dogbane", "forge-10-nails", "carve-long-stick"]) expect(craft.recipes[id].x, id).toBeUndefined();
    });
    it.skipIf(!craft.loot)("con botín, los clavos se encuentran y dicen dónde", () => {
      expect(craft.items.nails.f).toBe(1);
      expect(craft.items.nails.w[2]).toBeGreaterThan(0);
    });
    it("pesa lo que tiene que pesar", async () => {
      const { gzipSync } = await import("node:zlib");
      const raw = JSON.stringify(craftJson);
      expect(raw.length).toBeLessThan(900_000);
      expect(gzipSync(raw).length).toBeLessThan(140_000);
    });
  });
  ```
  - Los slugs de habilidad (`"carpentry"`, `"blacksmithing"`) y de profesión (`"blacksmith"`) son los de `data/site/skills.json` y `data/site/professions.json`: si en los datos reales se llaman distinto, el test se corrige al slug real (mirándolo en esos archivos), no se cambia `craft.py`.
- [ ] **Step 2: Correr y ver que falla.** `cd site; npx vitest run test/zomboidCraftData.test.ts` → falla (no existe `craft.json`).
- [ ] **Step 3: Implementar** `Site.granted()` en `site.py` (y que `build()` lo use), `craft.py` y la llamada en `extract.py`. Correr `python games/zomboid/tools/craft.py`; correr `python games/zomboid/tools/site.py` y confirmar que `git status` no cambia nada de `data/site/` (el refactor de `granted` no mueve datos).
- [ ] **Step 4: Ver en verde** `npx vitest run test/zomboidCraftData.test.ts test/zomboidSiteData.test.ts`. Anotar en el informe lo que imprime `craft.py` (cuántas `x` de cada tipo, peso). Si los topes de peso sobran mucho, bajarlos a la cifra real + 15 %.
- [ ] **Step 5: README.** En `games/zomboid/README.md`, una línea en el orden de los extractores: `craft.py` (lo llama `extract.py`; después de `loot.py`, volver a correrlo para sumar dónde se encuentra cada cosa).
- [ ] **Step 6: Commit.**
  ```bash
  git add games/zomboid/tools/craft.py games/zomboid/tools/site.py games/zomboid/tools/extract.py games/zomboid/data/craft.json games/zomboid/README.md site/test/zomboidCraftData.test.ts
  git commit -m "feat(zomboid): craft.json, el grafo de fabricación entero en un archivo para el planificador" -- games/zomboid/tools/craft.py games/zomboid/tools/site.py games/zomboid/tools/extract.py games/zomboid/data/craft.json games/zomboid/README.md site/test/zomboidCraftData.test.ts
  ```

---

### Task 2: El motor — receta por defecto, árbol, totales y la dirección

**Files:**
- Create: `site/src/zomboid/crafting/data.ts`, `site/src/zomboid/crafting/engine.ts`, `site/src/zomboid/crafting/state.ts`, `site/test/zomboidCraftEngine.test.ts`, `site/test/zomboidCraftState.test.ts`

**Interfaces:**
- Consumes: `craft.json` (Task 1); `once` de `site/src/zomboid/store.ts`; `type Route` de `site/src/route.ts`.
- Produces:
  - **`data.ts`:** los tipos de la Task 1 exportados (`Loc`, `CraftData`, `CItem`, `CIn`, `COut`, `CRecipe`, `CLearn`, `CStation`, `CTrait`, `CProf`); `peekCraft(): CraftData | null`, `loadCraft(): Promise<CraftData>` (con `once(() => import("@zomboid/craft.json"))`), `preloadCraftRoute(route: Route): Promise<void>` (espera `loadCraft()`).
  - **`state.ts`:** `Target`, `CraftState`, `EMPTY`, `MAX_QTY`, `BUILD`, `isBuild`, `encodeState`, `decodeState`, `sanitize`, `addTarget`, `setQty`, `removeTarget`, `setRecipe`, `setOpt`, `setLeaf`, `setMake`, `setHave`, `setB` (firmas abajo).
  - **`engine.ts`:** `unitsPer`, `asItems`, `lineUnits`, `outUnits`, `allowed`, `knownSet`, `knows`, `costs`, `recipeCost`, `viaOf`, `pickOpt`, `context`, `tree`, `totals`, `plan`, y los tipos `LeafWhy`, `Via`, `Ctx`, `TreeNode`, `NodeLine`, `Totals`.

**Regla por defecto** (lo que el usuario ve sin tocar nada; todo se cambia a mano):
- **Lo pedido (la raíz) siempre se fabrica:** con la receta elegida o, si no, la de menor costo entre las que podés hacer (sabidas y sin `x`); si no hay ninguna así, la de menor costo entre las que no tienen `x` aunque haya que aprenderlas (el usuario la pidió: el planificador le dice qué aprender); y si todas tienen `x`, entre todas. Lo mismo para lo que marcaste "lo fabrico".
- **Un paso intermedio** se **consigue** (hoja) si: lo marcaste "lo consigo", no tiene receta, se encuentra en el mundo (`f`), o ninguna de sus recetas la sabés o todas tienen `x`. Si no, se **fabrica** con la de menor costo.
- **Costo** = materiales crudos por unidad: una hoja cuesta 1 por objeto (en un drenable, `1/u` por uso); una receta cuesta lo que gasta una tanda (cada línea con su opción más barata) dividido lo que da, más 0,01 por paso (a igual material gana el camino más corto). Se calcula por punto fijo para que los ciclos no lo cuelguen; lo que no sale de un ciclo queda como hoja. Empate: menos niveles de habilidad pedidos, y después el slug.
- **Opción de una línea:** la elegida; si no, la más barata (en herramientas: la primera que se encuentra en el mundo, si no la primera que no se fabrica, si no la primera).
- **Herramientas:** se consiguen; si marcás "la fabrico", entra una al plan.
- **Ciclos:** en el árbol, un objeto que ya está en su propia rama se corta (hoja "ciclo"); en los totales, la demanda que vuelve a algo ya procesado va a "para juntar".
- **Lo que tenés** (`have`, en objetos) se resta del total de ese objeto antes de calcular sus tandas.
- **Tu personaje** (`b`, el mismo formato que Personaje: `profesión.rasgo.rasgo`) define qué recetas sabés.

- [ ] **Step 1: `data.ts`** con los tipos tal cual la Task 1 y la carga:
  ```ts
  /**
   * El grafo de fabricación de Project Zomboid (2026-10-01), tal como lo escribe `games/zomboid/tools/craft.py`: un solo
   * archivo (~80 KB con gzip) que baja sólo la pestaña Fabricación, por `import()`, y que el prerender espera.
   */
  import type { Route } from "../../route";
  import { once } from "../store";
  export type Loc = { en: string; es: string };
  export interface CItem { en: string; es: string; icon: string | null; c: string; u?: number; f?: 1; w?: [key: string, cont: string, p: number, n: number] }
  export interface CIn { n: number; k?: 1; o: string[]; on?: Record<string, number>; ic?: 1; fl?: Loc; any?: 1 }
  export type COut = { n: number; i: string } | { n: number; m: [out: string, from: string[]][]; mi: number[] } | { e: 1 };
  export interface CLearn { books: string[]; lv: [skill: string, lvl: number][]; anyLv?: 1; research: string[]; traits: string[]; profs: string[] }
  export interface CRecipe {
    en: string; es: string; kind: "craft" | "build"; cat: string; icon: string | null; in: CIn[]; out: COut[];
    sk?: [skill: string, lvl: number][]; xp?: [skill: string, xp: number][]; st?: string[]; learn?: CLearn;
    x?: "pack" | "repair" | "self" | "undo";
  }
  export interface CStation { en: string; es: string; builds: string[] }
  export interface CTrait { en: string; es: string; icon: string | null }
  export interface CProf { en: string; es: string; icon: string | null; traits: string[] }
  export interface CraftData {
    v: string; loot: boolean; cats: Record<string, Loc>; items: Record<string, CItem>; recipes: Record<string, CRecipe>;
    makes: Record<string, string[]>; stations: Record<string, CStation>; skills: Record<string, Loc>;
    traits: Record<string, CTrait>; profs: Record<string, CProf>;
    counts: { craftable: number; builds: number; multi: number; recipes: number };
  }
  // Si la Task 1 tuvo que usar `lists` (listas de opciones repetidas una sola vez), acá se vuelven a abrir antes de
  // devolver los datos: el motor siempre ve `CIn.o` como `string[]`.
  const craft = once<CraftData>(() => import("@zomboid/craft.json"));
  export const peekCraft = (): CraftData | null => craft.peek();
  export const loadCraft = (): Promise<CraftData> => craft.load();
  export async function preloadCraftRoute(_route: Route): Promise<void> {
    await loadCraft();
  }
  ```
- [ ] **Step 2: Tests del motor que fallan** — `site/test/zomboidCraftEngine.test.ts`. Usan el `craft.json` real; para no depender de si el botín ya corrió, `sinBotin` le saca `f` y `w` a todo (así el resultado es el mismo antes y después de `loot.py`). Cada valor está hecho a mano con los datos (la cuenta va en el comentario):
  ```ts
  import { describe, expect, it } from "vitest";
  import craftJson from "../../games/zomboid/data/craft.json";
  import type { CraftData } from "../src/zomboid/crafting/data";
  import { context, plan, tree, totals, asItems } from "../src/zomboid/crafting/engine";
  import { EMPTY, type CraftState } from "../src/zomboid/crafting/state";

  const sinBotin = (d: CraftData): CraftData => ({
    ...d, loot: false,
    items: Object.fromEntries(Object.entries(d.items).map(([k, { f: _f, w: _w, ...v }]) => [k, v])),
  });
  const D = sinBotin(craftJson as unknown as CraftData);
  const st = (p: Partial<CraftState>): CraftState => ({ ...EMPTY, ...p });
  const tot = (s: CraftState) => totals(D, s, context(D, s));
  const raw = (s: CraftState) => Object.fromEntries(tot(s).raw.map((r) => [r.id, asItems(D, r.id, r.units)]));

  describe("tablas", () => {
    it("10 tablas: aserrar troncos (3 por tanda) → 4 tandas, 4 troncos, una sierra, sobran 2", () => {
      // saw-log cuesta 1/3 + 0,01 por tabla; saw-large-branch y carve-plank, 1 + 0,01. 10/3 → 4 tandas.
      const t = tot(st({ q: [{ id: "plank", qty: 10 }] }));
      expect(t.steps).toEqual([{ id: "plank", recipe: "saw-log", crafts: 4 }]);
      expect(t.raw).toEqual([{ id: "log", units: 4, why: "undo" }]); // los troncos sólo salen de desarmar pilas
      // Una herramienta: la primera de las sierras que no se fabrica (sin botín no hay `f`); cuál es depende de `makes`.
      expect(t.tools).toHaveLength(1);
      expect(t.tools[0].opts).toEqual(["hacksaw", "simple-wood-saw", "wood-saw"]);
      expect(t.tools[0].opts).toContain(t.tools[0].pick);
      expect(t.left).toEqual([{ id: "plank", units: 2 }]);
      expect(t.xp).toEqual([["carpentry", 20]]); // 5 XP × 4 tandas
      expect(t.skills).toEqual([]);
      expect(t.learn).toEqual([]);
    });
    it("cambiando la receta a aserrar rama grande: 10 tandas de 1", () => {
      expect(raw(st({ q: [{ id: "plank", qty: 10 }], r: { plank: "saw-large-branch" } }))).toEqual({ "large-branch": 10 });
    });
    it("con 4 tablas y 1 tronco en la mochila: faltan 6 → 2 tandas → 2 troncos, tenés 1 → juntás 1", () => {
      expect(raw(st({ q: [{ id: "plank", qty: 10 }], have: { plank: 4, log: 1 } }))).toEqual({ log: 1 });
    });
  });

  describe("estante grande de secado (construcción)", () => {
    const s = st({ q: [{ id: "c:large-plant-drying-rack", qty: 1 }] });
    it("lo que hay que juntar", () => {
      // 6 palos largos: tallar palo largo (1 retoño, cuesta 1 + 0,01). Sacarlo de una escoba y desarmar una lanza
      //   deshacen otra receta (x: "undo"); si alguna no quedara marcada, empata en costo y pierde por slug.
      // 8 usos de cordel = 2 cordeles (5 usos cada uno): 2 tandas de elaborar cordel, cada una 1 acónito (cuesta 1;
      //   el cáñamo espadillado cuesta 1 + 0,01 o más, el hilo de tendón 25/10 = 2,5).
      // 2 clavos: sus 4 recetas o se aprenden (forjar) o son de abrir cajas (pack): se consiguen.
      expect(raw(s)).toEqual({ sapling: 6, "hemp-dogbane": 2, nails: 2 });
      expect(tot(s).raw.find((r) => r.id === "nails")?.why).toBe("learn");
    });
    it("pasos, sobrantes, herramientas y habilidad", () => {
      const t = tot(s);
      expect(t.steps.map((x) => [x.id, x.recipe, x.crafts])).toEqual([
        ["long-stick", "carve-long-stick", 6],
        ["twine", "craft-twine", 2],
        ["c:large-plant-drying-rack", "large-plant-drying-rack", 1],
      ]); // de lo primero que se hace a lo último (entre hermanos, el orden de las líneas de la receta)
      expect(t.left).toEqual([{ id: "twine", units: 2 }]); // 10 usos hechos − 8 pedidos
      expect(t.tools).toHaveLength(5); // martillo, sierra, cuchillo (tallar), cuchillo o tijera (cordel), palito (cordel)
      expect(t.skills).toEqual([["carpentry", 1]]);
      expect(t.xp).toEqual([["carpentry", 10], ["carving", 30]]); // 10 de construir + 5 × 6 de tallar
    });
    it("con el herrero, los clavos se forjan: 1 tanda de 10, sobran 8, en la forja primitiva o mejor", () => {
      const t = tot({ ...s, b: "blacksmith" });
      const step = t.steps.find((x) => x.id === "nails");
      expect(step?.crafts).toBe(1);
      expect(t.left).toContainEqual({ id: "nails", units: 8 });
      expect(t.stations).toContain("PrimitiveForge");
      expect(t.skills).toContainEqual(["blacksmithing", 1]);
    });
    it("si te lo encontrás, el cordel no se fabrica", () => {
      const d2 = { ...D, items: { ...D.items, twine: { ...D.items.twine, f: 1 as const } } };
      const t = totals(d2, s, context(d2, s));
      expect(t.raw).toContainEqual({ id: "twine", units: 8, why: "found" });
      expect(asItems(d2, "twine", 8)).toBe(2);
    });
  });

  describe("resultado según el ingrediente", () => {
    it("3 de cáñamo espadillado sólo aceptan cáñamo seco, nunca lino", () => {
      const tr = tree(D, st({ q: [{ id: "hemp-scutched", qty: 3 }] }), context(D, EMPTY), "hemp-scutched", 3);
      expect(tr.recipe).toBe("scutch-fibre");
      expect(tr.lines[0].opts).toEqual(["hemp-dried"]);
      expect(tr.lines[0].qty).toBe(3);
    });
  });

  describe("líquidos", () => {
    it("2 mantecas: 2 tandas, 10 L de leche, en la mantequera", () => {
      const t = tot(st({ q: [{ id: "butter", qty: 2 }] }));
      expect(t.fluids).toEqual([{ name: { en: "Cow's Milk / Sheep's Milk", es: "Leche de vaca / Leche de oveja" }, liters: 10 }]);
      expect(t.stations).toEqual(["ChurnBucket"]);
      expect(t.raw).toEqual([]); // el recipiente `[*]` no se junta: es el de la leche
    });
  });

  describe("ciclos", () => {
    it("cuerda por desatar un cinturón: el cinturón se consigue (atarlo es deshacer)", () => {
      expect(tot(st({ q: [{ id: "rope", qty: 1 }], r: { rope: "untie-rope-belt" } })).raw).toEqual([{ id: "rope-belt", units: 1, why: "undo" }]);
    });
    it("…y si lo querés fabricar, el árbol corta la vuelta a la cuerda", () => {
      const s = st({ q: [{ id: "rope", qty: 1 }], r: { rope: "untie-rope-belt" }, make: ["rope-belt"] });
      const tr = tree(D, s, context(D, s), "rope", 1);
      const belt = tr.lines[0].child!;
      expect(belt.recipe).toBe("tie-rope-belt");
      expect(belt.lines[0].child).toMatchObject({ id: "rope", why: "cycle" });
      expect(tot(s).raw).toEqual([{ id: "rope", units: 1, why: "cycle" }]);
    });
  });

  describe("lo pedido siempre se fabrica, aunque haya que aprender", () => {
    it("bragueta de metal: libro, nivel e investigar; herrería 4 y sastrería 3; forja", () => {
      const t = tot(st({ q: [{ id: "metal-codpiece", qty: 1 }] }));
      expect(t.steps.at(-1)).toMatchObject({ id: "metal-codpiece", recipe: "forge-codpiece", crafts: 1 });
      expect(t.learn).toEqual(["forge-codpiece"]);
      expect(t.skills).toEqual(expect.arrayContaining([["blacksmithing", 4], ["tailoring", 3]]));
      expect(t.stations).toContain("Forge");
      expect(t.tools.length).toBeGreaterThanOrEqual(7);
    });
  });

  it("plan junta un árbol por objetivo y los totales", () => {
    const s = st({ q: [{ id: "plank", qty: 10 }, { id: "c:large-plant-drying-rack", qty: 1 }] });
    const p = plan(D, s);
    expect(p.trees.map((t) => t.id)).toEqual(["plank", "c:large-plant-drying-rack"]);
    expect(p.totals.steps.at(-1)?.id).toBe("c:large-plant-drying-rack");
  });
  ```
  - Antes de dar por buenos los valores, **mirarlos en los datos** con un `python -c` sobre `craft.json` (sobre todo: los slugs de las habilidades, que `forge-nails-from-wire` y `-from-piece` piden aprender y si el herrero las sabe —si las sabe, el test del herrero puede elegir otra; se corrige el test al número que da la regla, con la cuenta en el comentario—, y que el recipiente de la manteca es `[*]`). Si un valor no coincide con la regla escrita arriba, se corrige el test con la cuenta; si coincide con la regla pero el resultado es absurdo para un jugador, se para y se pregunta.
- [ ] **Step 3: Tests de la dirección que fallan** — `site/test/zomboidCraftState.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import craftJson from "../../games/zomboid/data/craft.json";
  import type { CraftData } from "../src/zomboid/crafting/data";
  import { addTarget, decodeState, EMPTY, encodeState, sanitize, setHave, setLeaf, setOpt, setQty, setRecipe } from "../src/zomboid/crafting/state";
  const D = craftJson as unknown as CraftData;

  describe("la dirección", () => {
    it("ida y vuelta, con un orden fijo de parámetros", () => {
      let s = addTarget(EMPTY, "plank");
      s = setQty(s, "plank", 10);
      s = addTarget(s, "c:large-plant-drying-rack");
      s = setRecipe(s, "plank", "saw-log");
      s = setOpt(s, "craft-twine", 0, "hemp-dogbane");
      s = setLeaf(s, "nails", true);
      s = setHave(s, "plank", 4);
      s = { ...s, b: "carpenter" };
      const q = encodeState(s);
      expect(q).toBe("q=plank*10,c:large-plant-drying-rack&r=plank~saw-log&o=craft-twine.0~hemp-dogbane&x=nails&t=plank*4&b=carpenter");
      expect(decodeState("?" + q)).toEqual(s);
    });
    it("vacío es vacío", () => {
      expect(encodeState(EMPTY)).toBe("");
      expect(decodeState("")).toEqual(EMPTY);
    });
    it("sanitize tira lo que no existe y acota cantidades", () => {
      const s = sanitize(D, decodeState("?q=plank*5000,nada*2,plank*3,c:no-existe&r=plank~craft-twine,log~saw-log&o=saw-log.1~log&x=nada&t=plank*-1"));
      expect(s.q).toEqual([{ id: "plank", qty: 999 }]); // repetido: se suma (5000 + 3) y se acota a 999
      expect(s.r).toEqual({});        // craft-twine no hace tablas; saw-log no hace troncos
      expect(s.o).toEqual({});        // un tronco no es una sierra
      expect(s.leaf).toEqual([]);
      expect(s.have).toEqual({});
    });
    it("cantidad 0 saca el objetivo", () => {
      expect(setQty(addTarget(EMPTY, "plank"), "plank", 0).q).toEqual([]);
    });
  });
  ```
- [ ] **Step 4: Correr y ver que fallan** (`npx vitest run test/zomboidCraftEngine.test.ts test/zomboidCraftState.test.ts`).
- [ ] **Step 5: `state.ts`:**
  ```ts
  /**
   * Lo que elegiste en el Planificador de fabricación (2026-10-01) y cómo viaja en la dirección. Los ids son siempre los
   * internos (los slugs en inglés de las fichas), en los dos idiomas: cambiar de idioma no rompe el link.
   *
   * `q=plank*10,c:large-plant-drying-rack&r=plank~saw-log&o=craft-twine.0~hemp-dogbane&x=nails&f=twine&t=plank*4&b=carpenter`
   * - q: lo que querés (`c:` adelante = una construcción, por el slug de su receta), `*N` la cantidad si no es 1;
   * - r: objeto~receta elegida; o: receta.línea~opción elegida;
   * - x: lo conseguís (no se fabrica); f: lo fabricás aunque se encuentre (o una herramienta que querés hacer);
   * - t: lo que ya tenés, en objetos; b: tu personaje, como en Personaje.
   */
  import type { CraftData } from "./data";

  export interface Target { id: string; qty: number }
  export interface CraftState {
    q: Target[]; r: Record<string, string>; o: Record<string, string>;
    leaf: string[]; make: string[]; have: Record<string, number>; b: string | null;
  }
  export const EMPTY: CraftState = { q: [], r: {}, o: {}, leaf: [], make: [], have: {}, b: null };
  export const MAX_QTY = 999;
  export const BUILD = "c:";
  export const isBuild = (id: string): boolean => id.startsWith(BUILD);

  const clamp = (n: number) => Math.min(MAX_QTY, Math.max(0, Math.round(n) || 0));
  const enc = (s: string) => encodeURIComponent(s).replace(/%3A/gi, ":");
  const pairs = (o: Record<string, string>) => Object.keys(o).sort().map((k) => `${enc(k)}~${enc(o[k])}`).join(",");
  const counts = (xs: Target[]) => xs.map((t) => enc(t.id) + (t.qty !== 1 ? `*${t.qty}` : "")).join(",");

  export function encodeState(st: CraftState): string {
    const parts: string[] = [];
    if (st.q.length) parts.push("q=" + counts(st.q));
    if (Object.keys(st.r).length) parts.push("r=" + pairs(st.r));
    if (Object.keys(st.o).length) parts.push("o=" + pairs(st.o));
    if (st.leaf.length) parts.push("x=" + [...st.leaf].sort().map(enc).join(","));
    if (st.make.length) parts.push("f=" + [...st.make].sort().map(enc).join(","));
    const have = Object.keys(st.have).sort().map((id) => ({ id, qty: st.have[id] }));
    if (have.length) parts.push("t=" + counts(have));
    if (st.b) parts.push("b=" + enc(st.b));
    return parts.join("&");
  }

  const COUNT_RE = /^(.+?)(?:\*(-?\d+))?$/;
  export function decodeState(search: string): CraftState {
    const p = new URLSearchParams(search);
    const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const withQty = (k: string) => list(k).flatMap((tok) => {
      const m = COUNT_RE.exec(tok);
      return m ? [{ id: m[1], qty: m[2] ? Number(m[2]) : 1 }] : [];
    });
    const read = (k: string) => {
      const o: Record<string, string> = {};
      for (const tok of list(k)) { const i = tok.indexOf("~"); if (i > 0) o[tok.slice(0, i)] = tok.slice(i + 1); }
      return o;
    };
    return {
      q: withQty("q"), r: read("r"), o: read("o"), leaf: list("x"), make: list("f"),
      have: Object.fromEntries(withQty("t").map((t) => [t.id, t.qty])), b: p.get("b") || null,
    };
  }

  /** Sólo lo que existe y tiene sentido: así un link viejo (de otro parche) o tocado a mano no rompe la página. */
  export function sanitize(d: CraftData, st: CraftState): CraftState {
    const okTarget = (id: string) => (isBuild(id) ? d.recipes[id.slice(BUILD.length)]?.kind === "build" : !!d.makes[id]);
    const sum = new Map<string, number>();
    for (const t of st.q) if (okTarget(t.id)) sum.set(t.id, (sum.get(t.id) ?? 0) + t.qty);
    const q = [...sum].map(([id, qty]) => ({ id, qty: clamp(qty) })).filter((t) => t.qty > 0);
    const r = Object.fromEntries(Object.entries(st.r).filter(([id, rid]) => d.makes[id]?.includes(rid)));
    const o = Object.fromEntries(Object.entries(st.o).filter(([key, opt]) => {
      const [rid, li] = [key.slice(0, key.lastIndexOf(".")), Number(key.slice(key.lastIndexOf(".") + 1))];
      return !!d.recipes[rid]?.in[li]?.o.includes(opt);
    }));
    const items = (xs: string[]) => [...new Set(xs.filter((id) => !!d.items[id]))];
    const have = Object.fromEntries(Object.entries(st.have).filter(([id, n]) => !!d.items[id] && clamp(n) > 0).map(([id, n]) => [id, clamp(n)]));
    const [prof] = (st.b ?? "").split(".");
    return { q, r, o, leaf: items(st.leaf), make: items(st.make), have, b: st.b && (d.profs[prof] || prof === "custom-occupation") ? st.b : null };
  }

  export function addTarget(st: CraftState, id: string): CraftState {
    const hit = st.q.find((t) => t.id === id);
    return hit ? setQty(st, id, hit.qty + 1) : { ...st, q: [...st.q, { id, qty: 1 }] };
  }
  export function setQty(st: CraftState, id: string, qty: number): CraftState {
    const n = clamp(qty);
    return { ...st, q: n > 0 ? st.q.map((t) => (t.id === id ? { id, qty: n } : t)) : st.q.filter((t) => t.id !== id) };
  }
  export const removeTarget = (st: CraftState, id: string): CraftState => setQty(st, id, 0);
  export function setRecipe(st: CraftState, id: string, rid: string | null): CraftState {
    const r = { ...st.r };
    if (rid) r[id] = rid; else delete r[id];
    // Elegir una receta es querer fabricarlo: deja de estar entre lo que conseguís.
    return { ...st, r, leaf: st.leaf.filter((x) => x !== id) };
  }
  export function setOpt(st: CraftState, rid: string, li: number, opt: string | null): CraftState {
    const o = { ...st.o };
    if (opt) o[`${rid}.${li}`] = opt; else delete o[`${rid}.${li}`];
    return { ...st, o };
  }
  /** "Lo consigo" (`on`) o volver a lo de siempre. Es excluyente con "lo fabrico". */
  export function setLeaf(st: CraftState, id: string, on: boolean): CraftState {
    const leaf = st.leaf.filter((x) => x !== id);
    return { ...st, leaf: on ? [...leaf, id] : leaf, make: on ? st.make.filter((x) => x !== id) : st.make };
  }
  export function setMake(st: CraftState, id: string, on: boolean): CraftState {
    const make = st.make.filter((x) => x !== id);
    return { ...st, make: on ? [...make, id] : make, leaf: on ? st.leaf.filter((x) => x !== id) : st.leaf };
  }
  export function setHave(st: CraftState, id: string, n: number): CraftState {
    const have = { ...st.have };
    if (clamp(n) > 0) have[id] = clamp(n); else delete have[id];
    return { ...st, have };
  }
  export const setB = (st: CraftState, b: string | null): CraftState => ({ ...st, b: b || null });
  ```
  (`"custom-occupation"` es `DEFAULT_PROF` de `traits/data.ts`; se escribe acá a mano, con ese comentario, para no meter los datos de Rasgos en el chunk.)
- [ ] **Step 6: `engine.ts`:**
  ```ts
  /**
   * El motor del Planificador de fabricación de Project Zomboid (2026-10-01), sin React. Diseño:
   * docs/design/2026-09-30-zomboid.md (Pestañas, 5). Mismo esquema que `valheimPlanner.ts`: el árbol se dibuja rama por
   * rama y los totales juntan la demanda de cada objeto antes de redondear sus tandas.
   *
   * Unidades: toda cantidad interna va en "unidades" = usos para un drenable (cordel: 5 por objeto lleno), objetos para
   * lo demás. Una línea pide usos de un drenable salvo `ic` (ItemCount); lo que sale de una receta sale lleno.
   */
  import type { CIn, CRecipe, CraftData, Loc } from "./data";
  import { BUILD, isBuild, type CraftState } from "./state";

  const EPS = 0.01;
  const MAX_DEPTH = 12;
  const TOL = 1e-9;

  export const unitsPer = (d: CraftData, id: string): number => d.items[id]?.u ?? 1;
  /** Unidades → objetos para mostrar: 8 usos de cordel son 2 cordeles. */
  export const asItems = (d: CraftData, id: string, units: number): number => Math.ceil(units / unitsPer(d, id) - TOL);

  export function lineUnits(d: CraftData, line: CIn, id: string): number {
    const n = line.on?.[id] ?? line.n;
    const u = d.items[id]?.u;
    return u && line.ic ? n * u : n;
  }

  export function outUnits(d: CraftData, r: CRecipe, id: string): number {
    let n = 0;
    for (const o of r.out) {
      if ("i" in o && o.i === id) n += o.n;
      else if ("m" in o && o.m.some(([out]) => out === id)) n += o.n;
    }
    return n * unitsPer(d, id);
  }

  /** Las opciones de una línea para fabricar `id`: si esa línea decide el resultado (itemMapper), sólo las que dan `id`. */
  export function allowed(r: CRecipe, li: number, id: string | null): string[] {
    const line = r.in[li];
    if (id) {
      for (const o of r.out) {
        if (!("m" in o) || !o.mi.includes(li)) continue;
        const hit = o.m.find(([out]) => out === id);
        if (!hit) continue;
        if (hit[1].length) return line.o.filter((x) => hit[1].includes(x));
        const covered = new Set(o.m.flatMap(([, from]) => from));
        return line.o.filter((x) => !covered.has(x));
      }
    }
    return line.o;
  }

  const consumed = (l: CIn) => !l.k && !l.fl && !l.any;

  /** Las recetas que tu personaje ya sabe: las de su profesión, sus rasgos gratis y los que elegiste. */
  export function knownSet(d: CraftData, b: string | null): Set<string> {
    const out = new Set<string>();
    if (!b) return out;
    const [prof, ...picked] = b.split(".");
    const traits = new Set([...picked, ...(d.profs[prof]?.traits ?? [])]);
    for (const [rid, r] of Object.entries(d.recipes)) {
      const l = r.learn;
      if (l && (l.profs.includes(prof) || l.traits.some((t) => traits.has(t)))) out.add(rid);
    }
    return out;
  }
  export const knows = (d: CraftData, known: Set<string>, rid: string): boolean => !d.recipes[rid]?.learn || known.has(rid);
  const eligible = (d: CraftData, known: Set<string>, rid: string) => knows(d, known, rid) && !d.recipes[rid].x;

  export type Costs = Map<string, number>;

  export function recipeCost(d: CraftData, c: Costs, r: CRecipe, id: string): number {
    const per = outUnits(d, r, id);
    if (!per) return Infinity;
    let sum = 0;
    r.in.forEach((line, li) => {
      if (!consumed(line)) return;
      let best = Infinity;
      for (const o of allowed(r, li, id)) best = Math.min(best, lineUnits(d, line, o) * (c.get(o) ?? 1));
      sum += best;
    });
    return sum / per + EPS;
  }

  /** Costo por unidad de cada objeto, con lo de siempre (sin lo que elegiste a mano). Punto fijo: los ciclos no cuelgan. */
  export function costs(d: CraftData, known: Set<string>): Costs {
    const c: Costs = new Map();
    const open: string[] = [];
    for (const id of Object.keys(d.items)) {
      const recs = (d.makes[id] ?? []).filter((rid) => eligible(d, known, rid));
      if (!recs.length || d.items[id].f) c.set(id, 1 / unitsPer(d, id));
      else { c.set(id, Infinity); open.push(id); }
    }
    for (let round = 0; round < 64; round++) {
      let changed = false;
      for (const id of open) {
        for (const rid of d.makes[id]) {
          if (!eligible(d, known, rid)) continue;
          const v = recipeCost(d, c, d.recipes[rid], id);
          if (v < c.get(id)! - TOL) { c.set(id, v); changed = true; }
        }
      }
      if (!changed) break;
    }
    for (const id of open) if (!Number.isFinite(c.get(id)!)) c.set(id, 1 / unitsPer(d, id));
    return c;
  }

  export interface Ctx { known: Set<string>; c: Costs }
  const cache = new WeakMap<CraftData, Map<string, Ctx>>();
  /** El personaje y los costos, una vez por personaje: cambiar una receta o una cantidad no los recalcula. */
  export function context(d: CraftData, st: CraftState): Ctx {
    let m = cache.get(d);
    if (!m) cache.set(d, (m = new Map()));
    const key = st.b ?? "";
    let ctx = m.get(key);
    if (!ctx) {
      const known = knownSet(d, st.b);
      ctx = { known, c: costs(d, known) };
      m.set(key, ctx);
    }
    return ctx;
  }

  function bestRecipe(d: CraftData, c: Costs, pool: string[], id: string): string {
    const lv = (rid: string) => (d.recipes[rid].sk ?? []).reduce((s, [, l]) => s + l, 0);
    return pool
      .map((rid) => ({ rid, cost: recipeCost(d, c, d.recipes[rid], id), lv: lv(rid) }))
      .sort((a, b) => (Math.abs(a.cost - b.cost) > TOL ? a.cost - b.cost : a.lv - b.lv || (a.rid < b.rid ? -1 : 1)))[0].rid;
  }

  export type LeafWhy = "raw" | "found" | "chosen" | "learn" | "undo" | "cycle";
  export type Via = { recipe: string } | { why: LeafWhy };

  export function viaOf(d: CraftData, st: CraftState, ctx: Ctx, id: string, root: boolean): Via {
    if (isBuild(id)) return { recipe: id.slice(BUILD.length) };
    const recs = d.makes[id] ?? [];
    if (!root && st.leaf.includes(id)) return { why: "chosen" };
    if (!recs.length) return { why: "raw" };
    const picked = st.r[id];
    if (picked && recs.includes(picked)) return { recipe: picked };
    const forced = root || st.make.includes(id);
    if (!forced && d.items[id]?.f) return { why: "found" };
    const elig = recs.filter((rid) => eligible(d, ctx.known, rid));
    // Lo pedido o lo que querés fabricar: si nada se puede hacer ya, la que hay que aprender antes que una de abrir cajas
    // o deshacer (los clavos pedidos se forjan, no salen de "abrir caja de 100").
    const unx = recs.filter((rid) => !d.recipes[rid].x);
    const pool = elig.length ? elig : forced ? (unx.length ? unx : recs) : [];
    if (!pool.length) return { why: recs.some((rid) => !knows(d, ctx.known, rid)) ? "learn" : "undo" };
    return { recipe: bestRecipe(d, ctx.c, pool, id) };
  }

  export function pickOpt(d: CraftData, st: CraftState, c: Costs, rid: string, li: number, id: string | null): string | null {
    const line = d.recipes[rid].in[li];
    const opts = allowed(d.recipes[rid], li, id);
    if (!opts.length) return null;
    const chosen = st.o[`${rid}.${li}`];
    if (chosen && opts.includes(chosen)) return chosen;
    if (line.k) return opts.find((o) => d.items[o]?.f) ?? opts.find((o) => !d.makes[o]) ?? opts[0];
    let best = opts[0];
    let bv = Infinity;
    for (const o of opts) {
      const v = lineUnits(d, line, o) * (c.get(o) ?? 1);
      if (v < bv - TOL) { best = o; bv = v; }
    }
    return best;
  }

  export interface NodeLine {
    li: number; keep: boolean; opts: string[]; pick: string | null; qty: number;
    child?: TreeNode; fluid?: { name: Loc; liters: number }; any?: true;
  }
  export interface TreeNode {
    id: string; qty: number; recipe?: string; why?: LeafWhy; crafts?: number; made?: number;
    alts: string[]; lines: NodeLine[];
  }

  /** Una rama para dibujar: `qty` en unidades. Un objeto que ya está en su propia rama se corta ahí. */
  export function tree(d: CraftData, st: CraftState, ctx: Ctx, id: string, qty: number, path: string[] = []): TreeNode {
    const build = isBuild(id);
    const alts = build ? [] : d.makes[id] ?? [];
    if (path.includes(id) || path.length > MAX_DEPTH) return { id, qty, why: "cycle", alts, lines: [] };
    const via = viaOf(d, st, ctx, id, path.length === 0);
    if (!("recipe" in via)) return { id, qty, why: via.why, alts, lines: [] };
    const rid = via.recipe;
    const r = d.recipes[rid];
    const per = build ? 1 : outUnits(d, r, id);
    const crafts = Math.ceil(qty / per - TOL);
    const sub = [...path, id];
    const lines = r.in.map((line, li): NodeLine => {
      if (line.fl) return { li, keep: false, opts: [], pick: null, qty: line.n * crafts, fluid: { name: line.fl, liters: line.n * crafts } };
      if (line.any) return { li, keep: !!line.k, opts: [], pick: null, qty: line.n, any: true };
      const opts = allowed(r, li, build ? null : id);
      const pick = pickOpt(d, st, ctx.c, rid, li, build ? null : id);
      if (!pick) return { li, keep: !!line.k, opts, pick: null, qty: 0 };
      if (line.k) {
        const q = unitsPer(d, pick);
        return { li, keep: true, opts, pick, qty: q, child: st.make.includes(pick) ? tree(d, st, ctx, pick, q, sub) : undefined };
      }
      const q = lineUnits(d, line, pick) * crafts;
      return { li, keep: false, opts, pick, qty: q, child: tree(d, st, ctx, pick, q, sub) };
    });
    return { id, qty, recipe: rid, crafts, made: crafts * per, alts, lines };
  }

  export interface Totals {
    raw: { id: string; units: number; why: LeafWhy }[];
    tools: { opts: string[]; pick: string }[];
    fluids: { name: Loc; liters: number }[];
    stations: string[];
    skills: [skill: string, lvl: number][];
    learn: string[];
    xp: [skill: string, xp: number][];
    steps: { id: string; recipe: string; crafts: number }[];
    left: { id: string; units: number }[];
  }

  /** Los totales: la demanda de cada objeto junta (padres antes que hijos), con lo que tenés restado. */
  export function totals(d: CraftData, st: CraftState, ctx: Ctx): Totals {
    const targets = new Set(st.q.map((t) => t.id));
    const via = (id: string) => viaOf(d, st, ctx, id, targets.has(id));
    const forLine = (id: string) => (isBuild(id) ? null : id);
    const kids = (id: string): string[] => {
      const v = via(id);
      if (!("recipe" in v)) return [];
      return d.recipes[v.recipe].in.flatMap((line, li) => {
        if (line.fl || line.any) return [];
        const p = pickOpt(d, st, ctx.c, v.recipe, li, forLine(id));
        return p && (!line.k || st.make.includes(p)) ? [p] : [];
      });
    };
    const demand = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
    for (const t of st.q) add(demand, t.id, isBuild(t.id) ? t.qty : t.qty * unitsPer(d, t.id));

    const seen = new Set<string>();
    const order: string[] = [];
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const k of kids(id)) visit(k);
      order.push(id);
    };
    for (const t of st.q) visit(t.id);
    order.reverse();

    const raw = new Map<string, { units: number; why: LeafWhy }>();
    const addRaw = (id: string, units: number, why: LeafWhy) => {
      const e = raw.get(id);
      raw.set(id, { units: (e?.units ?? 0) + units, why: e?.why ?? why });
    };
    const tools = new Map<string, { opts: string[]; pick: string }>();
    const fluids = new Map<string, { name: Loc; liters: number }>();
    const stations = new Set<string>();
    const skills = new Map<string, number>();
    const xp = new Map<string, number>();
    const learn = new Set<string>();
    const left = new Map<string, number>();
    const steps: Totals["steps"] = [];
    const toolMade = new Set<string>();
    const done = new Set<string>();

    for (const id of order) {
      done.add(id);
      const have = isBuild(id) ? 0 : (st.have[id] ?? 0) * unitsPer(d, id);
      const q = Math.max(0, (demand.get(id) ?? 0) - have);
      if (q <= 0) continue;
      const v = via(id);
      if (!("recipe" in v)) { addRaw(id, q, v.why); continue; }
      const r = d.recipes[v.recipe];
      const per = isBuild(id) ? 1 : outUnits(d, r, id);
      const crafts = Math.ceil(q / per - TOL);
      steps.push({ id, recipe: v.recipe, crafts });
      if (!isBuild(id) && crafts * per > q + TOL) add(left, id, crafts * per - q);
      for (const o of r.out) if ("i" in o && o.i !== id) add(left, o.i, o.n * crafts * unitsPer(d, o.i));
      for (const s of r.st ?? []) stations.add(s);
      for (const [s, lvl] of r.sk ?? []) skills.set(s, Math.max(skills.get(s) ?? 0, lvl));
      for (const [s, n] of r.xp ?? []) add(xp, s, n * crafts);
      if (!knows(d, ctx.known, v.recipe)) learn.add(v.recipe);
      r.in.forEach((line, li) => {
        if (line.fl) {
          const key = line.fl.en;
          const e = fluids.get(key) ?? { name: line.fl, liters: 0 };
          e.liters += line.n * crafts;
          fluids.set(key, e);
          return;
        }
        if (line.any) return;
        const p = pickOpt(d, st, ctx.c, v.recipe, li, forLine(id));
        if (!p) return;
        if (line.k) {
          const opts = allowed(r, li, forLine(id));
          const key = [...opts].sort().join("|");
          if (!tools.has(key)) tools.set(key, { opts, pick: p });
          if (st.make.includes(p) && !toolMade.has(p)) {
            toolMade.add(p);
            if (done.has(p)) addRaw(p, unitsPer(d, p), "cycle"); else add(demand, p, unitsPer(d, p));
          }
          return;
        }
        const n = lineUnits(d, line, p) * crafts;
        if (done.has(p)) addRaw(p, n, "cycle"); else add(demand, p, n);
      });
    }

    const byName = <T,>(m: Map<string, T>) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return {
      raw: [...raw].map(([id, e]) => ({ id, units: e.units, why: e.why })),
      tools: [...tools.values()],
      fluids: [...fluids.values()],
      stations: [...stations],
      skills: byName(skills),
      learn: [...learn],
      xp: byName(xp),
      steps: steps.reverse(),
      left: [...left].map(([id, units]) => ({ id, units })),
    };
  }

  export function plan(d: CraftData, st: CraftState): { trees: TreeNode[]; totals: Totals } {
    const ctx = context(d, st);
    return {
      trees: st.q.map((t) => tree(d, st, ctx, t.id, isBuild(t.id) ? t.qty : t.qty * unitsPer(d, t.id))),
      totals: totals(d, st, ctx),
    };
  }
  ```
  - **Ojo con el orden de `steps`:** se procesan padres antes que hijos y se devuelve al revés (lo primero que se hace arriba). Entre hermanos, el orden sale del DFS (el de las líneas de la receta): si el test de pasos del estante espera otro orden entre `long-stick` y `twine`, corregir el test al que da el DFS y dejar escrita la razón en el comentario.
  - **`raw` va en el orden en que se procesa** (por eso los tests lo comparan como objeto con `raw()`, o con `toEqual` cuando hay uno solo). La UI lo ordena por nombre.
- [ ] **Step 7: Ver en verde** `npx vitest run test/zomboidCraftEngine.test.ts test/zomboidCraftState.test.ts` y `npx tsc -b`. Medir y anotar en el informe cuánto tarda `context()` en frío (con `performance.now()` en un test descartable): tiene que ser < 150 ms; si pasa, decirlo antes de seguir.
- [ ] **Step 8: Commit.**
  ```bash
  git add site/src/zomboid/crafting/data.ts site/src/zomboid/crafting/engine.ts site/src/zomboid/crafting/state.ts site/test/zomboidCraftEngine.test.ts site/test/zomboidCraftState.test.ts
  git commit -m "feat(zomboid): el motor del planificador de fabricación — receta por defecto, árbol, totales y link" -- site/src/zomboid/crafting/data.ts site/src/zomboid/crafting/engine.ts site/src/zomboid/crafting/state.ts site/test/zomboidCraftEngine.test.ts site/test/zomboidCraftState.test.ts
  ```

---

### Task 3: La pestaña — elegir, el árbol y los totales, publicada en la rama

**Files:**
- Create: `site/src/zomboid/crafting/copy.ts`, `site/src/zomboid/crafting/ZomboidCrafting.tsx`, `site/src/zomboid/crafting/Picker.tsx`, `site/src/zomboid/crafting/RouteSheet.tsx`, `site/src/zomboid/crafting/TreeSheet.tsx`, `site/src/zomboid/crafting/store.ts`, `site/src/styles/zomboid-crafting.css`, `site/test/zomboidCrafting.test.ts`
- Modify: `site/vite.config.ts` (módulo `virtual:pz-slugs-es/craft-items`, con su declaración de tipo donde estén las de `skill-items`), `site/src/route.ts` (`PZ_PUBLISHED` suma `"crafting"`), `site/src/Zomboid.tsx` (`TABS.crafting`, `TAB_DATA.crafting`), `site/src/areaFiles.ts` (`PZ_TAB_FILES.crafting`), `site/src/entry-server.tsx` (`preloadZomboid`), `site/src/prerender.ts` (JSON-LD `WebApplication` también para `crafting`), `site/src/zomboid/ZomboidHome.tsx` (`TOOL_TAB` suma `gears: "crafting"`), y los tests que listan las pestañas publicadas (buscarlos con `grep -rn "PZ_PUBLISHED\|\"planner\", \"moodles\"" site/test`).

**Interfaces:**
- Consumes: Task 2 entera; `ItemIcon`, `Stamp`, `CopyButton`, `fold`, `wordFit`, `Collapse` de `../ui`; `RouteLink`; `useLang`, `useLocale`; `routePath`, `registerPzSlugs`, `SITE_ORIGIN`; `virtual:pz-slugs-es/recipes`, `/skills`, `/traits`, `/professions` y el nuevo `/craft-items`.
- Produces:
  - **`store.ts`:** `useCraft(data: CraftData): [CraftState, (next: CraftState) => void]`. En el servidor y en el primer render devuelve `EMPTY` (la hidratación coincide con el prerender); al montarse, en `useLayoutEffect`, lee `window.location.search` (`decodeState` + `sanitize`); si viene vacía, lee `localStorage["vestigo:zomboid:crafting"]` (en `try/catch`). Cada cambio escribe la dirección con `history.replaceState` (sin sumar pasos al Atrás) y `localStorage`. Mismo trato que el Planificador de Valheim y que Personaje.
  - **`copy.ts`:** `CRAFT_COPY: Record<"en" | "es", CraftCopy>` y `useCraftCopy()`, como `planner/copy.ts`.
  - **`ZomboidCrafting.tsx`:** `export default function ZomboidCrafting({ route, navigate }: { route: Route; navigate: (r: Route) => void })`. Registra los slugs al cargarse el módulo.
  - **`Picker.tsx`:** `export default function Picker({ data, st, set }: { data: CraftData; st: CraftState; set: (s: CraftState) => void })`.
  - **`RouteSheet.tsx`:** `export default function RouteSheet({ data, st, set, totals, route, navigate })`.
  - **`TreeSheet.tsx`:** `export default function TreeSheet({ data, st, set, trees, route, navigate })`.
  - **`vite.config.ts`:** `virtual:pz-slugs-es/craft-items` → `{ items: {…} }` con los slugs en español de las fichas que están en `craft.json` (`items`), con la misma receta que `pzSkillItemSlugsModule` (lee `${zomboidDir}/craft.json`; sin el archivo, sale vacío) y puesto antes que el plugin de las secciones.

**La página** (`/es/project-zomboid/fabricacion`, sin fichas: `crafting` no está en `PZ_DETAIL_SECTIONS`):
- **Cabecera** (una hoja, como las demás pestañas): `h1` "Planificador de fabricación" / "Crafting planner" con `wordFit`; dos párrafos propios con las cifras de `craft.json` (lo que lee Google) y una nota a mano.
- **Dos columnas** desde 960 px (`grid-template-columns: minmax(280px, 380px) 1fr`); en el celular, una abajo de la otra.
- **Izquierda — "Qué querés fabricar"** (`Picker`):
  - buscador (`fold` en/es) sobre los objetos de `makes` y las recetas `build`; con la búsqueda vacía, "Ideas para empezar" (la lista `IDEAS` de la copia);
  - un selector "Todo / Objetos / Construcciones" y chips de categoría (`cats`), que bajan de renglón;
  - cada fila: ícono, nombre, "N recetas" si tiene más de una, y un botón "Sumar" (`addTarget`); hasta 60 filas y "Ver más" (como Valheim);
  - "Tu lista": cada objetivo con su ícono, nombre (link a su ficha de Objetos o Recetas), cantidad con − / número / + (`setQty`) y "Sacar";
  - todo con `<button>` y `<label>` de verdad (teclado y lector de pantalla).
- **Derecha — "Tu hoja de ruta"** (vacía: una nota a mano "Elegí algo a la izquierda y acá aparece todo lo que tenés que juntar"):
  - **`RouteSheet`** (primero, porque es lo que se lleva al juego):
    - **Para juntar:** una fila por `totals.raw`, ordenada por nombre: ícono, nombre (link a Objetos), cantidad en objetos (`asItems`) y, en un drenable, "(N usos)"; una etiqueta de texto por `why`: `found` "se encuentra", `learn` "fabricarlo pide aprender", `cycle` "vuelve a sí mismo", `chosen` "lo conseguís", `undo`/`raw` nada;
    - **Herramientas (no se gastan):** "una de: X, Y, Z" con la elegida primero y cada una con link;
    - **Líquidos:** "10 L de Leche de vaca / Leche de oveja";
    - **Estaciones:** nombre; si tiene `builds`, "construila:" con link a la receta de la primera y un botón "Sumar a tu lista" (`addTarget("c:" + slug)`);
    - **Habilidades:** "Carpintería nivel 1" con link a su ficha de Habilidades;
    - **Pasos, en orden:** "4 × Aserrar troncos → 12 Tablas" (link a la receta);
    - **Te sobran:** `totals.left` en objetos (o usos);
    - **Compartir:** `CopyButton` con `SITE_ORIGIN + routePath(route) + "?" + encodeState(st)`.
  - **`TreeSheet`:** un `<ul>` por objetivo, anidado:
    - cada nodo: ícono, "cantidad × nombre" (link a Objetos, o a Recetas si es construcción), y si se fabrica: "con" + nombre de la receta (link) y, si hay más de una (`alts.length > 1`), un `<select>` "Cambiar receta" con todas (las que no sabés llevan "(hay que aprenderla)"; las que tienen `x`, "(deshace otra)"), que llama a `setRecipe`;
    - si el objeto tiene receta y no es la raíz: un botón "Lo consigo" / "Lo fabrico" (`setLeaf` / `setMake`);
    - por línea: si tiene más de una opción, un `<select>` "una de" con todas (`setOpt`); las herramientas van juntas en un renglón "Herramientas: …", con "La fabrico" si la elegida tiene receta (`setMake`); un líquido, "5 L de …"; `any`, "cualquier recipiente";
    - una hoja muestra su `why` con el mismo texto que en los totales.
  - Sangría: 12 px por nivel hasta el 6; después, sin más sangría y con "↳ nivel N".
- **Sin bordes de color:** lo elegido va con tinte (`--pz-tint-*` de `zomboid.css`), lo que pide aprender con texto en lápiz rojo.

**Textos (`copy.ts`)**, en/es (voseo). Lo mínimo, con estas claves y estos textos (se pueden pulir, no cambiar de sentido):

| clave | en | es |
|---|---|---|
| `title` | Crafting planner | Planificador de fabricación |
| `intro(n, builds, multi, v)` | `Pick what you want to make in Project Zomboid Build ${v} and get everything it takes: the full recipe tree, the materials to gather, the tools, the stations, the skills and what you need to learn.` / `${n} items can be crafted and ${builds} things can be built; ${multi} of them have more than one recipe, and you can switch any step.` | `Elegí qué querés fabricar en Project Zomboid Build ${v} y mirá todo lo que hace falta: el árbol completo de recetas, los materiales para juntar, las herramientas, las estaciones, las habilidades y lo que tenés que aprender.` / `Se pueden fabricar ${n} objetos y construir ${builds} cosas; ${multi} tienen más de una receta, y cualquier paso se puede cambiar.` |
| `hand` | Whatever you can find lying around, you gather; the rest, you make. | Lo que se encuentra tirado, se junta; lo demás, se fabrica. |
| `pickTitle` | What do you want to make? | ¿Qué querés fabricar? |
| `search` | Search an item or a build | Buscá un objeto o una construcción |
| `ideas` | Ideas to start | Ideas para empezar |
| `kinds` | All / Items / Builds | Todo / Objetos / Construcciones |
| `add` / `remove` / `more` | Add / Remove / Show more | Sumar / Sacar / Ver más |
| `listTitle` | Your list | Tu lista |
| `routeTitle` | Your roadmap | Tu hoja de ruta |
| `empty` | Pick something on the left and everything you need to gather shows up here. | Elegí algo a la izquierda y acá aparece todo lo que tenés que juntar. |
| `raw` | To gather | Para juntar |
| `tools` | Tools (not used up) | Herramientas (no se gastan) |
| `oneOf` | one of | una de |
| `fluids` | Liquids | Líquidos |
| `stations` / `buildIt` / `addToList` | Workstations / build it: / Add to your list | Estaciones / construila: / Sumar a tu lista |
| `skills` / `level(n)` | Skills / `level ${n}` | Habilidades / `nivel ${n}` |
| `steps` | Steps, in order | Pasos, en orden |
| `left` | Left over | Te sobran |
| `uses(n)` | `${n} uses` | `${n} usos` |
| `why.found` / `why.learn` / `why.cycle` / `why.chosen` | can be found / crafting it needs learning / loops back on itself / you get it | se encuentra / fabricarlo pide aprender / vuelve a sí mismo / lo conseguís |
| `treeTitle` | The full tree | El árbol completo |
| `with` / `switchRecipe` / `mustLearn` / `undoes` | with / Switch recipe / (you need to learn it) / (undoes another) | con / Cambiar receta / (hay que aprenderla) / (deshace otra) |
| `getIt` / `makeIt` / `anyContainer` | I'll get it / I'll make it / any container | Lo consigo / Lo fabrico / cualquier recipiente |
| `share` / `copied` | Copy link / Link copied | Copiar link / Link copiado |

`IDEAS` (iguales en los dos idiomas; el test verifica que existan): `["c:rain-collector-barrel-tarp", "c:primitive-forge", "c:large-plant-drying-rack", "c:campfire", "wooden-spear", "crude-stone-axe", "molotov-cocktail", "noise-maker", "sheet-rope", "plank"]`.

**Publicar en la rama:**
- `route.ts`: `PZ_PUBLISHED` suma `"crafting"`.
- `Zomboid.tsx`: `const PzCrafting = lazyWithPreload(() => import("./zomboid/crafting/ZomboidCrafting"));`, `TABS.crafting = PzCrafting`, y en `TAB_DATA`: `crafting: (route) => Promise.all([PzCrafting.preload(), import("./zomboid/crafting/data")]).then(([, m]) => m.preloadCraftRoute(route))`.
- `areaFiles.ts`: `crafting: "src/zomboid/crafting/ZomboidCrafting.tsx"`.
- `entry-server.tsx`: en `preloadZomboid`, `if (route.pzSection === "crafting") await quiet(preloadCraftRoute(route));` (y actualizar el comentario de arriba).
- `prerender.ts`: `if (sec === "planner" || sec === "crafting")` para el `WebApplication` (con el título sin la marca, como ya hace).
- `ZomboidHome.tsx`: `TOOL_TAB` suma `gears: "crafting"` ("¿Qué necesito para fabricar…?" deja de decir "Pronto").

- [ ] **Step 1: Tests que fallan** — `site/test/zomboidCrafting.test.ts` (registrar los slugs en español como hacen `zomboidRecipes.test.ts`/`zomboidPlanner.test.ts`, con `buildEsSlugs` y `registerPzSlugs`):
  - **Prerender** de `/es/project-zomboid/fabricacion` (`renderApp(parseRoute(…))`): no contiene `pz-loading`; tiene `<h1` con "Planificador de fabricación"; el texto con las cifras formateadas en es (`craft.counts.craftable.toLocaleString("es")` → "1.584"); los 10 `IDEAS` con su nombre en español; la solapa "Fabricación" con `aria-current="page"`. Lo mismo en inglés en `/en/project-zomboid/crafting`.
  - **Ideas:** cada id de `IDEAS` existe (`makes[id]`, o `recipes[slug].kind === "build"` con `c:`).
  - **Sitemap:** `sitemapPaths` tiene `/es/project-zomboid/fabricacion` y `/en/project-zomboid/crafting`, y ninguna dirección debajo de ellas.
  - **Head:** `metaFor` da los títulos de `seo.crafting` (≤ 65 caracteres, empiezan por "Project Zomboid Crafting Planner" y "Planificador de fabricación de Project Zomboid"); `jsonLdFor` trae un `WebApplication` y las migas "Vestigo › Project Zomboid › Fabricación".
  - **Chunk:** `filesFor(parseRoute("/es/project-zomboid/fabricacion"))` es `["src/Zomboid.tsx", "src/zomboid/crafting/ZomboidCrafting.tsx"]`.
  - **Hoja de ruta** (renderizando `RouteSheet` y `TreeSheet` con `renderToStaticMarkup`, `LangContext` en es y el `plan()` de `{ q: [{ id: "plank", qty: 10 }] }` sobre `craft.json`): "Para juntar" con "4" y "Tronco" y su link a `/es/project-zomboid/objetos/…`; la herramienta con "una de"; "4 × Aserrar troncos" con link a `/es/project-zomboid/recetas/…`; "Te sobran" con "2"; el `<select>` "Cambiar receta" con las 3 recetas de tablas; el link de compartir termina en `?q=plank*10`.
  - **Construcción:** con `c:large-plant-drying-rack`, "Para juntar" muestra "2" cordeles… sólo si no hay botín; si `craft.loot` es `true`, el test pasa `sinBotin` (el mismo de la Task 2) para que el número no dependa de eso.
  - **Celular, sin bordes:** `zomboid-crafting.css` no tiene `border-left`, `border-right` ni `border-top` con color en filas o tarjetas, ni `overflow-wrap: anywhere` ni `word-break` (leer el archivo con `readFileSync` y buscar esas cadenas, como hacen otros tests de la sección si existe uno parecido; si no, este es el primero).
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** todo lo de arriba. `npx tsc -b` y `npx vitest run test/zomboidCrafting.test.ts test/zomboidCraftEngine.test.ts test/zomboidPublish.test.ts test/zomboidSeo.test.ts test/zomboidRoute.test.ts` (y cualquier test que listaba las pestañas publicadas, corregido para sumar `crafting`).
- [ ] **Step 4: Verlo en el navegador** (panel Browser de la app, nunca el Chrome de ZoTaD; el servidor del worktree en `http://localhost:5178`):
  - `/es/project-zomboid/fabricacion` → buscar "estante" → sumar el grande → la hoja de ruta; cambiar la receta del palo largo; "Lo consigo" en el cordel; copiar el link y abrirlo en otra pestaña: se ve igual;
  - `/en/project-zomboid/crafting` con el mismo `?q=…`: lo mismo en inglés;
  - con `resize_window` preset `mobile` en el panel: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), el árbol con 6+ niveles (la bragueta de metal) no se sale; volver a `desktop` al terminar;
  - consola sin errores. Anotar el peso del chunk `ZomboidCrafting` (con `npm run build`), el de `craft-items` y el de `craft.json`, en gzip.
- [ ] **Step 5: Commit** (la pestaña queda viva en la rama).
  ```bash
  git add site/src/zomboid/crafting/copy.ts site/src/zomboid/crafting/ZomboidCrafting.tsx site/src/zomboid/crafting/Picker.tsx site/src/zomboid/crafting/RouteSheet.tsx site/src/zomboid/crafting/TreeSheet.tsx site/src/zomboid/crafting/store.ts site/src/styles/zomboid-crafting.css site/test/zomboidCrafting.test.ts site/vite.config.ts site/src/route.ts site/src/Zomboid.tsx site/src/areaFiles.ts site/src/entry-server.tsx site/src/prerender.ts site/src/zomboid/ZomboidHome.tsx
  # más los tests de pestañas publicadas que se tocaron, por nombre
  git commit -m "feat(zomboid): la pestaña Fabricación — elegís qué hacer y te arma el árbol y qué juntar, con link" -- <los mismos archivos>
  ```

---

### Task 4: Qué aprender, dónde conseguir cada cosa, tu personaje y lo que ya tenés

La pestaña ya está publicada: cada cosa de esta tarea se ve en `http://localhost:5178/es/project-zomboid/fabricacion?q=metal-codpiece` apenas anda.

**Files:**
- Create: `site/src/zomboid/crafting/LearnSheet.tsx`, `site/src/zomboid/crafting/Character.tsx`, `site/test/zomboidCraftingLearn.test.ts`; `site/src/zomboid/loot/chance.ts` **sólo si no existe** (lo crea el plan de Botín, Task 3: mirar `git log -- site/src/zomboid/loot/chance.ts` antes; si existe, se importa y no se toca)
- Modify: `site/src/zomboid/crafting/RouteSheet.tsx`, `site/src/zomboid/crafting/TreeSheet.tsx`, `site/src/zomboid/crafting/ZomboidCrafting.tsx`, `site/src/zomboid/crafting/copy.ts`, `site/src/styles/zomboid-crafting.css`

**Interfaces:**
- Consumes: `totals.learn`, `knows`, `knownSet`, `setB`, `setHave` (Task 2); `CItem.w` y `CItem.f` (Task 1, sólo con botín); `roomName(raw, lang)` de `site/src/zomboid/map/rooms.ts`; `pct(p, locale)` de `site/src/zomboid/loot/chance.ts`.
- Produces:
  - **`loot/chance.ts`** (si hay que crearlo): exactamente el bloque del plan de Botín, Task 3 (`Band`, `band`, `pct`), así cuando llegue Botín es el mismo archivo.
  - **`LearnSheet.tsx`:** `export default function LearnSheet({ data, st, set, totals, route, navigate })`: la hoja "Para aprender".
  - **`Character.tsx`:** `export default function Character({ data, st, set, route })`: "Tu personaje".
  - **`WhereHint`** (en `RouteSheet.tsx`, exportado para `LearnSheet`): `({ data, id, route, navigate }) => ReactNode | null`.

**Qué se ve:**
- **"Para aprender"** (una hoja propia, entre "Para juntar" y el árbol, sólo si `totals.learn` no está vacío): por receta (link a Recetas), "la aprendés con cualquiera de:"
  - **libros y revistas** (`learn.books`): ícono, nombre (link a Objetos) y `WhereHint`;
  - **al llegar a** "nivel N de Herrería" (`learn.lv`, con "cualquiera de" si `anyLv`), con link a Habilidades;
  - **investigando** (`learn.research`): "desarmá o estudiá:" con los objetos (link);
  - **rasgos y profesiones** (`learn.traits`, `learn.profs`): link a su ficha de Rasgos (`traits` o `professions`), con su ícono.
- **`WhereHint`** (en "Para juntar", en las herramientas elegidas y en los libros): si el objeto tiene `w`, "Más fácil: {roomName(w[0], lang)} · {pct(w[2], locale)} · en {w[3]} lugares" y "Dónde aparece →" (link a su ficha de Objetos, donde está la hoja del botín); si no tiene `w`, nada. Sin decir de dónde sale el número.
- **"Tu personaje"** (arriba de la hoja de ruta, chico): un `<select>` con "Sin profesión" y las profesiones de `profs` ordenadas por nombre con `Intl.Collator`; si `b` trae rasgos, se listan como chips con "Sacar"; "Armalo en Personaje →" lleva a `routePath({ ...route, pzSection: "planner", detail: undefined }) + "?b=" + st.b` (escrito acá, sin importar `planner/link.tsx`: ese módulo arrastra los datos de Rasgos al chunk). Una nota: "Con tu personaje, lo que ya sabés se fabrica sin aprender nada."
- **"Lo que ya tenés":** en cada fila de "Para juntar" y en cada nodo que se fabrica del árbol, un campo numérico chico "tengo" (`<input type="number" min="0" max="999">` con `<label>`), que llama a `setHave`; en las herramientas, una casilla "la tengo" (`setHave(pick, 1)` / `0`) que la marca con tinte y texto "✓ la tenés". Los totales ya restan (Task 2).
- **"Te deja"** (en `RouteSheet`, al final): la XP de `totals.xp`, "Carpintería +40 XP", con link a la habilidad.

**Textos nuevos (`copy.ts`):**

| clave | en | es |
|---|---|---|
| `learnTitle` | To learn | Para aprender |
| `learnWith` | you learn it with any of: | la aprendés con cualquiera de: |
| `reach(lvl, skill)` | `reaching ${skill} level ${lvl}` | `llegar a ${skill} nivel ${lvl}` |
| `anyOfLv` | (any of these skills) | (alcanza con una) |
| `research` | take apart or study: | desarmá o estudiá: |
| `traitsProfs` | traits and professions that know it: | rasgos y profesiones que la saben: |
| `easiest(room, pct, n)` | `Easiest: ${room} · ${pct} · in ${n} places` | `Más fácil: ${room} · ${pct} · en ${n} lugares` |
| `whereLink` | Where to find it → | Dónde aparece → |
| `charTitle` / `noProf` / `charNote` / `charLink` | Your character / No profession / With your character, what you already know is crafted with nothing to learn. / Build it in Character → | Tu personaje / Sin profesión / Con tu personaje, lo que ya sabés se fabrica sin aprender nada. / Armalo en Personaje → |
| `have` / `haveTool` / `youHaveIt` | have / I have it / ✓ you have it | tengo / la tengo / ✓ la tenés |
| `xpTitle` / `xp(n)` | It gives you / `+${n} XP` | Te deja / `+${n} XP` |

- [ ] **Step 1: Tests que fallan** — `site/test/zomboidCraftingLearn.test.ts` (render estático en es):
  - con `{ q: [{ id: "metal-codpiece", qty: 1 }] }`: "Para aprender" con "Forjar bragueta…" (el nombre en español de `forge-codpiece`, leído de `craft.json`), la revista con link a `/es/project-zomboid/objetos/…`, "nivel 6" con link a `/es/project-zomboid/habilidades/…`, y la bragueta de cuero en "desarmá o estudiá";
  - con `{ q: [{ id: "nails", qty: 10 }], b: null }` (los clavos como objetivo: raíz, se fabrican con una de forjar, nunca con "abrir caja"): "Para aprender" trae una receta de forjar clavos con la profesión herrero (link a la dirección de profesiones que da `routePath`); con `b: "blacksmith"`, "Para aprender" no aparece;
  - el `<select>` de "Tu personaje" con `blacksmith` elegido cuando `b` empieza por `blacksmith`, y el link "Armalo en Personaje" a `/es/project-zomboid/personaje?b=blacksmith`;
  - "tengo": con `have: { log: 1 }` y 10 tablas, "Para juntar" dice 3 troncos, y el campo "tengo" del tronco tiene `value="1"`;
  - botín: con un `craft.json` de prueba que le pone a `log` `w: ["kitchen", "counter", 0.039, 12]`, la fila del tronco dice "Más fácil: " + `roomName("kitchen", "es")` + " · 3,9 % · en 12 lugares" y enlaza a la ficha del tronco; sin `w`, no dice nada;
  - "Te deja" con "Carpintería +20 XP" para 10 tablas.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** hasta verde, más `npx tsc -b`.
- [ ] **Step 4: Verlo en el navegador**, escritorio y celular: la bragueta de metal (todo lo de aprender), el estante con "Tu personaje" en herrero (los clavos pasan a forjarse), "tengo" en el tronco, y —si el botín ya está— una herramienta con su "Más fácil". Consola limpia.
- [ ] **Step 5: Commit.**
  ```bash
  git commit -m "feat(zomboid): Fabricación dice qué aprender y dónde, con tu personaje y lo que ya tenés" -- site/src/zomboid/crafting/LearnSheet.tsx site/src/zomboid/crafting/Character.tsx site/src/zomboid/crafting/RouteSheet.tsx site/src/zomboid/crafting/TreeSheet.tsx site/src/zomboid/crafting/ZomboidCrafting.tsx site/src/zomboid/crafting/copy.ts site/src/styles/zomboid-crafting.css site/test/zomboidCraftingLearn.test.ts
  # + site/src/zomboid/loot/chance.ts sólo si se creó en esta tarea (git add de ese archivo antes)
  ```

---

### Task 5: Entradas desde el resto de la libreta y cierre

**Files:**
- Create: `site/src/zomboid/crafting/link.tsx`, `site/test/zomboidCraftingLinks.test.ts`
- Modify: `site/src/zomboid/items/ItemFicha.tsx`, `site/src/zomboid/recipes/RecipeFicha.tsx`, `site/src/zomboid/planner/ZomboidPlanner.tsx`, la copia de cada una (`site/src/zomboidCopy.ts` para Objetos y Recetas, `site/src/zomboid/planner/copy.ts` para Personaje), `games/zomboid/tools/loot.py` (**sólo si existe**), `games/zomboid/README.md`, `site/src/sitemap.ts` y su test (sólo si el plan de Botín ya sumó `lootExtractedAt`)

**Interfaces:**
- Consumes: `encodeState`, `EMPTY` (Task 2); `areas().preloadRoute` (como `planner/link.tsx`).
- Produces:
  - **`link.tsx`:** `export const craftRoute = (route: Route): Route => ({ ...route, view: "zomboid", pzSection: "crafting", detail: undefined });`, `export const craftHref = (route: Route, st: Partial<CraftState>): string` (`routePath(craftRoute(route))` + `"?" + encodeState({ ...EMPTY, ...st })` si no queda vacía), y `export default function CraftLink({ route, navigate, st, className, children })`: un `<a href>` de verdad que, al clic normal, escribe la dirección entera con `pushState` y navega (copiado del patrón de `planner/link.tsx`, que dice por qué), y precalienta el chunk al pasar el mouse. No importa nada pesado: `state.ts` es chico y `crafting/data.ts` no se importa.
  - **Objetos:** en la ficha, si `ficha.makes.length > 0`, un `CraftLink` "Planificá qué juntar →" / "Plan what to gather →" junto a "Se fabrica con", con `st = { q: [{ id: ficha.id, qty: 1 }] }`.
  - **Recetas:** en la ficha, si da un objeto (`outputs` con `item` o `choices`), "Planificá esta receta →" con `q` = el primer objeto que da y `r = { [ese objeto]: ficha.id }`; si es de construcción, `q = [{ id: "c:" + ficha.id, qty: 1 }]`; sin resultado, nada.
  - **Personaje:** al lado de "Tus recetas" (o donde lista las recetas que sabés), "Planificá qué fabricar con este personaje →" con `st = { b: encode(build) }` (si el personaje es el de entrada, sin `b`).
  - **`loot.py`** (si existe): al final de su `main()`, cargar `craft.py` por ruta y llamar a `craft.main()`, con un comentario: "Fabricación usa dónde aparece cada cosa para saber qué se junta y qué se fabrica". Si no existe todavía, no se crea: en `games/zomboid/README.md` queda escrito "después de `loot.py`, `python games/zomboid/tools/craft.py`" (Task 1) y se avisa en el informe para que el plan de Botín lo sume.
  - **Sitemap** (sólo si `ZomboidSitemapData.lootExtractedAt` ya existe): el `lastmod` de `crafting` es el mayor entre `dates.zomboid` y `lootExtractedAt`, igual que Objetos.

- [ ] **Step 1: Tests que fallan** — `site/test/zomboidCraftingLinks.test.ts`:
  - `craftHref(parseRoute("/es/project-zomboid/objetos/tabla"), { q: [{ id: "plank", qty: 1 }] })` es `"/es/project-zomboid/fabricacion?q=plank"`; en inglés, `"/en/project-zomboid/crafting?q=plank"`;
  - el prerender de la ficha `/es/project-zomboid/objetos/tabla` (o el slug real de `plank` en español) tiene `href="/es/project-zomboid/fabricacion?q=plank"`; la de un objeto que no se fabrica (buscar uno con `makes` vacío en los datos, por ejemplo el primero de `items-list.json` que no esté en `craft.makes`) no lo tiene;
  - el prerender de la receta de aserrar troncos tiene `href="/es/project-zomboid/fabricacion?q=plank&amp;r=plank~saw-log"`; el de una construcción, `?q=c:<slug>`; el de una receta sin resultado (`sharpen-blade` o el slug real de `SharpenBlade`), ninguno;
  - Personaje: el render con un personaje herrero tiene un link a `/es/project-zomboid/fabricacion?b=blacksmith`.
- [ ] **Step 2: Correr y ver que fallan.** Después implementar hasta verde, más `npx tsc -b` y `npx vitest run` (todo salvo `test/deadlock.test.ts`).
- [ ] **Step 3: `npm run build`** y anotar en el informe, en gzip: `ZomboidCrafting`, `craft-items`, `craft.json`, y cuánto crecieron `ZomboidItems`, `ZomboidRecipes` y `ZomboidPlanner` (tienen que ser < 1 KB cada uno: `link.tsx` + `state.ts`). Confirmar que `es/project-zomboid/fabricacion.html` no tiene `pz-loading` y que las rutas prerenderizadas suben exactamente 2 (la pestaña en/es).
- [ ] **Step 4: Revisión completa en el navegador** (panel Browser, escritorio y `mobile`, y volver a `desktop`):
  - Objetos → Tabla → "Planificá qué juntar" → la hoja de ruta de 1 tabla;
  - Recetas → una construcción → "Planificá esta receta";
  - Personaje → herrero → "Planificá qué fabricar" → sumar clavos: se forjan sin "Para aprender";
  - la portada: "¿Qué necesito para fabricar…?" enlaza;
  - Atrás y Adelante del navegador vuelven a cada página con su estado; consola limpia.
- [ ] **Step 5: Commit.**
  ```bash
  git commit -m "feat(zomboid): Objetos, Recetas y Personaje llevan al planificador de fabricación con lo suyo ya elegido" -- site/src/zomboid/crafting/link.tsx site/test/zomboidCraftingLinks.test.ts site/src/zomboid/items/ItemFicha.tsx site/src/zomboid/recipes/RecipeFicha.tsx site/src/zomboid/planner/ZomboidPlanner.tsx site/src/zomboidCopy.ts site/src/zomboid/planner/copy.ts games/zomboid/README.md
  # + games/zomboid/tools/loot.py, site/src/sitemap.ts y su test, sólo si se tocaron
  ```

---

## Decisiones abiertas (para ZoTaD)

1. **Qué se fabrica y qué se junta por defecto.** Propuesta (la de este plan): "lo que se encuentra tirado (≥ 0,5 % en algún mueble), se junta; lo demás, se fabrica", y cada paso se cambia a mano. La otra: bajar siempre hasta lo crudo (troncos, piedras, plantas), que da árboles enormes (los clavos terminarían en la forja). Sin el botín todavía, todo lo fabricable que no pide aprender se fabrica.
2. **Tu personaje (`?b=`)** en esta primera versión: propuesta **sí** (es barato: las recetas de cada profesión ya están en `craft.json`) y con el link de ida y vuelta a Personaje.
3. **La lista se guarda en el navegador** (como Valheim) además de en el link: propuesta **sí**; si no, cada visita arranca vacía salvo que vengas por un link.
4. **Construcciones como objetivo** (las 201: forjas, recolectores de lluvia, estantes): propuesta **sí**, con las estaciones que pide una receta ofreciendo "sumar a tu lista".

## Fuera de este plan (decidido)

- **Lo que hace `OnCreate` (Lua)** en 159 recetas (gemas al desarmar joyas, el estado del objeto, etc.): el planificador usa sólo los resultados declarados. Si alguna receta importante da algo sólo por `OnCreate`, se suma a mano en `craft.py` con un test.
- **Tiempo total:** el juego lo declara en unidades propias (la ficha de receta ya lo muestra tal cual); sumarlo en "minutos" pide verificar la conversión en el juego.
- **Dónde conseguir líquidos** (agua, leche, nafta): no son objetos con botín; quedan como "N L de …".
- **Forrajeo, pesca y caza** como fuentes: cuando exista su extractor, entran a `w` igual que el botín.
- **Desgaste de herramientas** (`MayDegrade*`): se ignora; una herramienta alcanza para todo el plan.
- **Subproductos de las recetas con resultado según el ingrediente:** "te quedan" lista sólo los resultados fijos.
