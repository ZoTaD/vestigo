# Deadlock tras City Never Sleeps — pieza 1 (puesta al día) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todo lo que el sitio de Deadlock ya muestra quede correcto con el parche 6712/6722: parches desde Steam, Corruptos fuera de las estadísticas de objetos, ventana por hora, catálogo e imágenes nuevas.

**Architecture:** Cambios chicos en el pipeline (`games/deadlock/pipeline/src`), regeneración de datos (`npm run catalog`, `build:hero-kit`) e imágenes (`tools/game_assets.py`), sin tocar el diseño del sitio.

**Tech Stack:** TypeScript + vitest + DuckDB (pipeline), Python + Pillow + Source2Viewer-CLI (imágenes), Vite/React (sitio).

## Global Constraints

- Rama `feat/deadlock-cns`, carpeta `C:\Users\Zotad\Desktop\vestigo-deadlock`. No tocar `C:\Users\Zotad\Desktop\vestigo` (tiene D2R sin commitear).
- Comentarios y textos en español rioplatense, como el resto del código.
- Corrupta = entrada de `items.*` con `upgrade_info & 0x800000` (8388608). Medido en el lake: al corromper, la entrada original queda con `sold_time_s` = momento del cambio y aparece otra entrada del mismo `item_id` con `upgrade_info = 0x810000`.
- Los 6 héroes nuevos (78, 84–88) siguen fuera (`isPlayable`).
- Nada de lo que el juego borró se saca del sitio en esta pieza.

---

### Task 1: Parches desde `/v2/patches` (Steam)

**Files:**
- Modify: `games/deadlock/pipeline/src/patches.ts` (URL, `sortPatches`)
- Test: `games/deadlock/pipeline/test/patches.test.ts`

**Interfaces:**
- Produces: `sortPatches(raw: RawPatch[]): Patch[]` ahora acepta `source` y prefiere `steam`; `fetchPatches()` lee `https://api.deadlock-api.com/v2/patches`.

- [ ] **Step 1: tests**

```ts
it("prefiere las entradas de Steam y normaliza el título", () => {
  const p = sortPatches([
    { source: "forum", title: "08-22-2026 Update", pub_date: "2026-09-16T22:41:28Z", link: "f" },
    { source: "steam", title: " Minor Update - 08-22-2026", pub_date: "2026-08-22T21:40:46Z", link: "s1" },
    { source: "steam", title: "City Never Sleeps", pub_date: "2026-09-29T20:25:11Z", link: "s2" },
  ]);
  expect(p.map((x) => x.title)).toEqual(["City Never Sleeps", "08-22-2026 Update"]);
  expect(p[1].date).toBe("2026-08-22T21:40:46Z");
});

it("sin entradas de Steam usa las del foro", () => {
  const p = sortPatches([{ source: "forum", title: "09-16-2026 Update", pub_date: "2026-09-16T22:41:46Z" }]);
  expect(p[0].title).toBe("09-16-2026 Update");
});
```

- [ ] **Step 2:** `npx vitest run test/patches.test.ts` → FAIL.
- [ ] **Step 3: implementación**

```ts
const PATCHES_URL = "https://api.deadlock-api.com/v2/patches";
interface RawPatch { source?: string; title?: string; pub_date?: string; link?: string; }
const DATE_TOKEN = /\b(\d{2})-(\d{2})-(\d{4})\b/;
const cleanTitle = (t: string) => { const m = t.match(DATE_TOKEN); return m ? `${m[0]} Update` : t.trim(); };

export function sortPatches(raw: RawPatch[]): Patch[] {
  const usable = raw.filter((p): p is RawPatch & { pub_date: string } => typeof p.pub_date === "string" && p.pub_date !== "");
  const steam = usable.filter((p) => p.source === "steam");
  return (steam.length ? steam : usable)
    .map((p) => ({ date: p.pub_date, title: cleanTitle(p.title ?? ""), link: p.link ?? "" }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
```

(Las entradas viejas sin `source` —la v1— siguen funcionando: `steam` vacío → se usan todas.)

- [ ] **Step 4:** `npx vitest run test/patches.test.ts` → PASS. Correr todo `npx vitest run`.
- [ ] **Step 5:** commit `fix(deadlock): parches desde Steam (v2); el foro no tiene City Never Sleeps y republicó tarde`.

### Task 2: Corruptos fuera de las estadísticas de objetos

**Files:**
- Modify: `games/deadlock/pipeline/src/snapshot.ts` (`itemsWindowSql`, nueva `NOT_CORRUPT`)
- Modify: `games/deadlock/pipeline/src/builds.ts:136-147` (`rama`: `kept`, `item_ids`, `item_times`)
- Test: `games/deadlock/pipeline/test/snapshot.test.ts`

**Interfaces:**
- Produces: `export const CORRUPTED_BIT = 8388608;` y `export function uncorruptedItems(col: string): string` en `snapshot.ts`: devuelve la expresión SQL con la lista `"items.<col>"` sin las entradas corruptas.

- [ ] **Step 1: test con DuckDB en memoria**

```ts
import { DuckDBInstance } from "@duckdb/node-api";
import { uncorruptedItems } from "../src/snapshot";

it("saca las compras corruptas de las listas de objetos", async () => {
  const con = await (await DuckDBInstance.create(":memory:")).connect();
  await con.run(`create table t as select [10, 20, 20]::UBIGINT[] as "items.item_id",
    [100, 200, 900]::INTEGER[] as "items.game_time_s",
    [65536, 65536, 8454144]::UINTEGER[] as "items.upgrade_info"`);
  const r = (await con.runAndReadAll(`select ${uncorruptedItems("item_id")} as ids, ${uncorruptedItems("game_time_s")} as ts from t`)).getRowObjectsJson();
  expect(r[0].ids).toEqual(["10", "20"]);
  expect(r[0].ts).toEqual([100, 200]);
});
```

- [ ] **Step 2:** FAIL (no existe).
- [ ] **Step 3: implementación en `snapshot.ts`**

```ts
/** La marca de compra corrupta del Broker en `items.upgrade_info` (0x800000). */
export const CORRUPTED_BIT = 8388608;
/** `"items.<col>"` sin las entradas corruptas: la compra corrupta no cuenta como el objeto. */
export const uncorruptedItems = (col: string) =>
  `list_filter("items.${col}", (x, i) -> (coalesce("items.upgrade_info"[i], 0) & ${CORRUPTED_BIT}) = 0)`;
```

y en `itemsWindowSql`: `${uncorruptedItems("item_id")} as item_ids, ${uncorruptedItems("game_time_s")} as item_times`.
En `builds.ts` (`rama`): en el `list_filter` de `kept` sumar `and (coalesce("items.upgrade_info"[i], 0) & ${CORRUPTED_BIT}) = 0`, y `item_ids`/`item_times` con `uncorruptedItems`.
(Si la lambda de dos argumentos no existe en la versión de DuckDB, usar `list_transform(list_filter(range(1, len(...)+1), i -> ...), i -> "items.<col>"[i])`.)

- [ ] **Step 4:** PASS + `npx vitest run` completo.
- [ ] **Step 5:** commit `fix(deadlock): las compras corruptas del Broker no cuentan en builds ni en la tier list de objetos`.

### Task 3: Ventana por hora en `liveStats`

**Files:**
- Modify: `games/deadlock/pipeline/src/liveStats.ts` (`fetchLiveCounts`, `countsFrom`)
- Test: `games/deadlock/pipeline/test/liveStats.test.ts`

- [ ] **Step 1: test**

```ts
it("suma las filas por hora de un mismo héroe", () => {
  const c = countsFrom([
    { hero_id: 1, matches: 10, wins: 6 },
    { hero_id: 1, matches: 5, wins: 2 },
    { hero_id: 2, matches: 3, wins: 1 },
  ] as LiveRow[], "2026-09-29T20:25:11Z", "2026-09-30T00:00:00Z", 1);
  expect(c.rows).toEqual([{ hero_id: 1, matches: 15, wins: 8 }, { hero_id: 2, matches: 3, wins: 1 }]);
  expect(c.boards).toBe(18);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** `countsFrom` agrupa por `hero_id` antes de devolver; `fetchLiveCounts` agrega `&bucket=start_time_hour` (sin él la API redondea `min/max_unix_timestamp` al día entero, medido el 2026-09-29).
- [ ] **Step 4:** PASS + suite completa.
- [ ] **Step 5:** commit `fix(deadlock): la ventana en vivo respeta la hora del parche (bucket por hora)`.

### Task 4: Catálogo y kit con la API 6712

**Files:** `games/deadlock/data/catalog.json`, `games/deadlock/data/hero-kit/*.json` (generados); tests que fijen nombres viejos.

- [ ] **Step 1:** Confirmar Return Fire en `scratchpad/cns/ui_new/scripts/abilities.vdata` (buscar `upgrade_return_fire`, ver si `BulletResist` sigue en la sección innata). Anotar el resultado en el commit.
- [ ] **Step 2:** `cd games/deadlock/pipeline && npm run catalog && npm run build:hero-kit`.
- [ ] **Step 3:** `git diff --stat games/deadlock/data` y revisar: renombres, 38 héroes jugables, sin héroes 78/84–88.
- [ ] **Step 4:** `npx vitest run` en pipeline y `site`; actualizar sólo expectativas que fijaban nombres viejos (Spirit Shredder Bullets, Armor Piercing Rounds, Felina, Látigo).
- [ ] **Step 5:** commit `chore(deadlock): catálogo y kit con la API de City Never Sleeps (6712)`.

### Task 5: Imágenes del juego nuevo

**Files:** `games/deadlock/tools/game_assets.py` (conservar lo borrado), `site/public/deadlock/game/**`, `games/deadlock/data/game-art.json`.

- [ ] **Step 1:** En `main()`, si un `rel` usado no está en el juego pero su `.webp` ya existe en el sitio, dejarlo en el manifest (el juego lo borró, el sitio lo sigue usando hasta que otra pieza lo reemplace):

```python
        if not src:
            kept = os.path.join(OUT, rel.rsplit(".", 1)[0] + ".webp")
            if os.path.exists(kept):
                manifest[rel] = os.path.relpath(kept, OUT).replace(os.sep, "/")
            missing.append(rel)
            continue
```

- [ ] **Step 2:** `python games/deadlock/tools/game_assets.py --vrf <Source2Viewer-CLI.exe> --cache <scratchpad>/cns/cache` (cache nueva: el script no re-extrae si la carpeta existe) y `python games/deadlock/tools/thumbs.py`.
- [ ] **Step 3:** `git status --short site/public/deadlock/game | wc -l` ≈ 84 cambiados + miniaturas; ningún archivo borrado; `manifest.json` conserva `catalog_tooltip_bg_*`.
- [ ] **Step 4:** commit `chore(deadlock): imágenes de City Never Sleeps (objetos, habilidades, caras)`.

### Task 6: Verificar, publicar y regenerar

- [ ] **Step 1:** `cd site && npx tsc -b && npx vite build && npx vitest run`.
- [ ] **Step 2:** navegador (1440 y 375): tier list, Objetos (tienda/lista), `/deadlock/<héroe>`, ficha al pasar el mouse, Vestigo News.
- [ ] **Step 3:** `git fetch && git rebase origin/main`, `git push origin feat/deadlock-cns:main`.
- [ ] **Step 4:** `gh workflow run publish-deadlock.yml` y comprobar en vivo que la tier list dice "desde City Never Sleeps".
