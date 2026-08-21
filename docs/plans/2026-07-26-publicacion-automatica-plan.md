# Plan de implementación — Publicación automática (fase 1)

> Diseño: `docs/design/2026-07-26-publicacion-automatica-design.md` (aprobado).
> Fase 2 (contadores incrementales): `docs/design/2026-07-26-tier-list-incremental-design.md`.

**Objetivo:** que la tier list se actualice y se publique sola, todos los días, sin
que nadie corra un build — y que se sostenga así hasta que abra el Set 18.

**Arquitectura:** el build sigue siendo el mismo agregador; lo único que cambia es de
dónde saca las partidas. Un lector nuevo (`pgStore.ts`) devuelve exactamente la misma
forma que el lector de disco (`LobbyRecord[]`), `build.ts` elige la fuente por
argumento, y una GitHub Action programada corre el build contra Postgres, verifica
tres guardas y commitea. Netlify despliega solo.

**Stack:** TypeScript, Node 22, vitest, Supabase (PostgREST), GitHub Actions.

## Restricciones globales

- **Toda la prosa va en `games/tft/ui/src/i18n.ts`**, EN y ES. Nada de texto suelto en
  componentes. El español es **neutro latinoamericano, sin voseo**.
- Los slugs, ids y claves nuevas van **en inglés**.
- **Nada hardcodea un número de set ni un parche.** El set sale de `TFT_SET`, el
  parche de los datos.
- **El build de disco tiene que seguir funcionando igual.** Es lo que reconstruye un
  parche archivado y lo que permite comparar las dos fuentes.
- **La `SUPABASE_SERVICE_ROLE_KEY` nunca entra a git.** Vive en `.env` (ignorado) y en
  los secrets del repo.
- Cada tarea termina con `npm test --prefix games/tft/<paquete>` en verde y un commit.
- Los mensajes de commit del repo van en inglés y dicen *por qué*, no *qué*.

---

### Tarea 1 — El `tier` que el backfill no sube, y el filtro por parche

`migrate-to-postgres.ts:113-124` arma la fila de `matches` sin el campo `tier`, que el
store en disco sí tiene (`store.ts:18`). Como `bandCovers` manda todo lo que no tiene
tier a global y apex (`bands.ts:91`), subir el disco así inflaría esas dos bandas y
dejaría a las otras tres sin evidencia.

Además el script sube **todo** lo pendiente (~15.400 partidas, ~180 MB). Solo hace
falta el parche vigente.

**Archivos:**
- Modificar: `games/tft/pipeline/src/migrate-to-postgres.ts`
- Crear: `games/tft/pipeline/test/migrate.test.ts`

**Produce:** `matchRow(stored: StoredMatch): MatchRow` y
`selectPending(stored: StoredMatch[], already: Set<string>, patch: string): StoredMatch[]`,
ambas exportadas y puras.

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/migrate.test.ts
import { describe, it, expect } from "vitest";
import { matchRow, selectPending } from "../src/migrate-to-postgres";
import type { StoredMatch } from "../src/store";
import type { RawMatch } from "../src/riot/normalize";

function stored(matchId: string, version: string, tier?: string): StoredMatch {
  return {
    matchId,
    fetchedAt: "2026-07-26T00:00:00.000Z",
    ...(tier ? { tier } : {}),
    match: {
      info: {
        tft_set_number: 17,
        queue_id: 1100,
        game_datetime: 1_750_000_000_000,
        game_version: `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${version}>`,
        participants: [{ puuid: "x".repeat(78), placement: 1 }],
      },
    } as RawMatch,
  };
}

describe("matchRow", () => {
  // Sin esto las partidas suben sin rango, y bandCovers manda todo lo que no
  // tiene rango a global y apex: las tres bandas de abajo se quedan sin nada.
  it("lleva el tier del store a la fila", () => {
    expect(matchRow(stored("LA2_1", "16.14", "GOLD IV")).tier).toBe("GOLD IV");
  });

  it("manda cadena vacía cuando el store no tenía tier", () => {
    expect(matchRow(stored("LA2_2", "16.14")).tier).toBe("");
  });

  it("saca la región del id, que es donde viaja", () => {
    expect(matchRow(stored("LA2_3", "16.14")).region).toBe("la2");
  });
});

describe("selectPending", () => {
  const all = [stored("LA2_1", "16.14"), stored("LA2_2", "16.13"), stored("LA2_3", "16.14")];

  it("sube solo el parche pedido", () => {
    expect(selectPending(all, new Set(), "16.14").map((s) => s.matchId)).toEqual([
      "LA2_1",
      "LA2_3",
    ]);
  });

  it("saltea lo que ya está en Postgres", () => {
    expect(selectPending(all, new Set(["LA2_1"]), "16.14").map((s) => s.matchId)).toEqual([
      "LA2_3",
    ]);
  });

  it("sin parche pedido, sube todo lo que falta", () => {
    expect(selectPending(all, new Set(), "").length).toBe(3);
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- migrate
```

Esperado: FAIL, `matchRow is not exported` / `does not provide an export named 'matchRow'`.

- [ ] **Paso 3: extraer las dos funciones y agregar el tier**

En `games/tft/pipeline/src/migrate-to-postgres.ts`, agregar el import de `patchOf` y
de los tipos, y exportar las dos funciones. `matchRow` es el objeto que hoy se arma
inline en `main()`:

```ts
import { loadRawMatches, type StoredMatch } from "./store";
import { patchOf } from "./patch";

/**
 * Lo que se lee del payload. Escrito acá y no importado: `StoredMatch.match` viene
 * tipado como el `RawMatch` de riot/normalize, y castear entre dos interfaces
 * distintas con el mismo nombre es un error de tipos, no una conveniencia.
 */
interface MatchInfo {
  tft_set_number?: number;
  queueId?: number;
  queue_id?: number;
  game_datetime?: number;
  game_version?: string;
}

const infoOf = (s: StoredMatch): MatchInfo =>
  (s.match as unknown as { info?: MatchInfo }).info ?? {};

export interface MatchRow {
  match_id: string;
  region: string;
  set_number: number | null;
  queue_id: number | null;
  game_datetime: number | null;
  game_version: string | null;
  /**
   * El rango del jugador por el que llegamos a esta partida. El store en disco lo
   * tiene desde el 2026-07-23 y esta migración lo dejaba afuera, así que todo lo
   * subido antes quedó sin rango — y sin rango, bandCovers lo cuenta como apex.
   */
  tier: string;
  payload: unknown;
}

export function matchRow(s: StoredMatch): MatchRow {
  const info = infoOf(s);
  return {
    match_id: s.matchId,
    // The store predates per-match region tracking; the id carries it.
    region: (s.matchId.split("_")[0] || "na1").toLowerCase(),
    set_number: info.tft_set_number ?? null,
    queue_id: info.queueId ?? info.queue_id ?? null,
    game_datetime: info.game_datetime ?? null,
    game_version: info.game_version ?? null,
    tier: s.tier ?? "",
    payload: s.match,
  };
}

/**
 * Lo que falta subir. El parche es un filtro y no un adorno: el disco tiene 22.016
 * partidas y solo las del parche vigente alimentan lo que se publica, así que subir
 * el resto es gastar 180 MB del plan gratuito en datos que nadie va a leer.
 */
export function selectPending(
  stored: StoredMatch[],
  already: Set<string>,
  patch: string
): StoredMatch[] {
  return stored.filter((s) => {
    if (already.has(s.matchId)) return false;
    if (!patch) return true;
    return patchOf(infoOf(s).game_version ?? "") === patch;
  });
}
```

La interfaz `RawMatch` local del archivo queda sin uso: borrarla.

En `main()`, reemplazar el filtro y el armado de filas por las funciones nuevas, y
leer el parche del argumento posicional (igual que `build.ts` y `pull.ts`, porque los
scripts de npm no setean variables de entorno igual en PowerShell que en bash):

```ts
  const patch = (process.argv[2] ?? "").trim();
  const pending = selectPending(stored, already, patch);
  if (patch) console.log(`filtrando por parche ${patch}`);
  ...
    const matches = slice.map(matchRow);
    await post("matches?on_conflict=match_id", matches, cfg);
```

Agregar `RawMatch` al import de tipos si el archivo todavía usa su interfaz local.

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS, incluidos los 6 tests nuevos.

- [ ] **Paso 5: commit**

```bash
git add games/tft/pipeline/src/migrate-to-postgres.ts games/tft/pipeline/test/migrate.test.ts
git commit -m "fix: carry the rank when uploading, or every band below diamond starves"
```

- [ ] **Paso 6: correr el backfill del parche vigente**

```bash
npm run migrate:pg --prefix games/tft/pipeline -- 16.14
```

Esperado: `store local: 22016 partidas`, `ya en Postgres: ~6600`, `por subir: ~4800`,
y después `subidas 4800/4800`. Tarda varios minutos (lotes de 25).

**Si el parche vigente ya no es 16.14 cuando se ejecute esto**, usar el que diga
`npm run build:comps --prefix games/tft/pipeline` en su primera línea de salida.

- [ ] **Paso 7: verificar el backfill contra lo publicado**

Correr en el SQL editor de Supabase (o con el MCP):

```sql
select coalesce(nullif(split_part(tier, ' ', 1), ''), '(sin tier)') as tier,
       count(*) as partidas
from matches
where set_number = 17 and queue_id = 1100
  and game_version like '%<Releases/16.14>%'
group by 1 order by 2 desc;
```

Esperado: **~7.250 partidas en total**, que es lo que hay en disco de ese parche. Las
que no tienen tier son las que se bajaron antes del 2026-07-23, y en disco cuentan
como apex igual que acá — la comparación de la Tarea 3 sigue siendo pareja.

---

### Tarea 2 — El lector de Postgres

Devuelve `LobbyRecord[]`, la misma forma que `loadLobbies`. Todo lo que el build sabe
de una partida sale del `payload` verbatim, exactamente como en disco; lo único que
viene de una columna es el `tier`.

**Archivos:**
- Crear: `games/tft/pipeline/src/pgStore.ts`
- Crear: `games/tft/pipeline/test/pgStore.test.ts`

**Consume:** `LobbyRecord` y `loadLobbies` de `./store`, `toParticipants` de
`./riot/normalize`, `patchOf` y `newestPatch` de `./patch`.

**Produce:** `matchesQuery(set, patch, limit, offset)`, `lobbiesFromRows(rows)`,
`type PgRow`, `loadLobbiesFromPg(fetchRows, set, patch)`, `newestPatchFromPg(fetchRows, set)`,
`pgFetcher(env)`.

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/pgStore.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { matchesQuery, lobbiesFromRows, loadLobbiesFromPg, newestPatchFromPg } from "../src/pgStore";
import { saveMatch, loadLobbies } from "../src/store";
import type { RawMatch } from "../src/riot/normalize";

const root = "test/.tmppg";
afterAll(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

function rawMatch(version: string): RawMatch {
  return {
    info: {
      tft_set_number: 17,
      queue_id: 1100,
      tft_game_type: "standard",
      game_version: `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${version}>`,
      participants: [1, 2].map((placement) => ({
        puuid: "p" + placement,
        placement,
        level: 8,
        gold_left: 3,
        units: [{ character_id: "TFT17_Zoe", tier: 2, rarity: 2, itemNames: ["TFT_Item_Deathblade"] }],
        traits: [{ name: "TFT17_Sorcerer", num_units: 6, tier_current: 3, tier_total: 4 }],
      })),
    },
  } as RawMatch;
}

describe("matchesQuery", () => {
  it("filtra por set y por cola rankeada", () => {
    const q = matchesQuery(17, "", 200, 0);
    expect(q).toContain("set_number=eq.17");
    expect(q).toContain("queue_id=eq.1100");
  });

  // "16.1" no puede traerse "16.14": el filtro va contra el marcador completo.
  it("filtra por el parche exacto, no por prefijo", () => {
    const q = matchesQuery(17, "16.1", 200, 0);
    expect(decodeURIComponent(q)).toContain("<Releases/16.1>");
  });

  it("pagina", () => {
    expect(matchesQuery(17, "", 200, 400)).toContain("limit=200&offset=400");
  });
});

describe("lobbiesFromRows", () => {
  // El punto de todo el archivo: una partida leída de Postgres tiene que producir
  // el MISMO LobbyRecord que leída del disco, o las dos fuentes publican distinto.
  it("produce el mismo LobbyRecord que el lector de disco", () => {
    const dir = `${root}/same`;
    const match = rawMatch("16.14");
    saveMatch(dir, "LA2_1", "2026-07-26T00:00:00.000Z", match, "GOLD IV");

    const fromDisk = loadLobbies(dir);
    const fromPg = lobbiesFromRows([{ match_id: "LA2_1", tier: "GOLD IV", payload: match }]);

    expect(fromPg).toEqual(fromDisk);
  });

  it("deja el tier vacío cuando la columna es null", () => {
    const [lobby] = lobbiesFromRows([
      { match_id: "LA2_2", tier: null, payload: rawMatch("16.14") },
    ]);
    expect(lobby.tier).toBe("");
  });
});

describe("loadLobbiesFromPg", () => {
  it("sigue pidiendo páginas hasta que una viene corta", async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        match_id: `LA2_${i}`,
        tier: "",
        payload: rawMatch("16.14"),
      }));
    const pages = [page(200), page(3)];
    const asked: string[] = [];
    const fetchRows = async (query: string) => {
      asked.push(query);
      return pages.shift() ?? [];
    };

    const lobbies = await loadLobbiesFromPg(fetchRows, 17, "16.14", 200);
    expect(lobbies.length).toBe(203);
    expect(asked.length).toBe(2);
    expect(asked[1]).toContain("offset=200");
  });
});

describe("newestPatchFromPg", () => {
  it("elige por número y no alfabéticamente", async () => {
    const fetchRows = async () => [
      { game_version: "a [PUBLIC] <Releases/16.9>" },
      { game_version: "a [PUBLIC] <Releases/16.14>" },
      { game_version: "a [PUBLIC] <Releases/16.13>" },
    ];
    expect(await newestPatchFromPg(fetchRows, 17)).toBe("16.14");
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- pgStore
```

Esperado: FAIL, `Cannot find module '../src/pgStore'`.

- [ ] **Paso 3: escribir `pgStore.ts`**

```ts
// games/tft/pipeline/src/pgStore.ts
import type { LobbyRecord } from "./store";
import { toParticipants, type RawMatch } from "./riot/normalize";
import { patchOf, newestPatch } from "./patch";

/**
 * Las partidas, leídas de Postgres en vez del disco.
 *
 * Todo lo que describe una partida sale del payload verbatim, igual que en
 * `store.loadLobbies` — set, cola, modo y versión se leen ahí y no de las columnas,
 * para que las dos fuentes no puedan divergir en silencio. Lo único que viene de una
 * columna es el `tier`, que Riot no manda y nosotros anotamos al bajarla.
 */

export interface PgRow {
  match_id: string;
  tier: string | null;
  payload: RawMatch;
}

/** La cola rankeada estándar, la única que alimenta el meta. */
const RANKED_QUEUE = 1100;

/**
 * El filtro va contra el marcador completo `<Releases/16.14>` y no contra "16.14"
 * suelto: un `like` por prefijo haría que "16.1" se trajera las de "16.14".
 */
export function matchesQuery(set: number, patch: string, limit: number, offset: number): string {
  const parts = [
    "select=match_id,tier,payload",
    `set_number=eq.${set}`,
    `queue_id=eq.${RANKED_QUEUE}`,
    `limit=${limit}&offset=${offset}`,
    "order=match_id.asc",
  ];
  if (patch) {
    parts.push(`game_version=like.${encodeURIComponent(`*<Releases/${patch}>*`)}`);
  }
  return `matches?${parts.join("&")}`;
}

export function lobbiesFromRows(rows: PgRow[]): LobbyRecord[] {
  return rows.map((row) => {
    const info = (
      row.payload as {
        info?: {
          tft_set_number?: number;
          tft_game_type?: string;
          game_version?: string;
          queue_id?: number;
          queueId?: number;
        };
      }
    ).info;
    return {
      matchId: row.match_id,
      set: info?.tft_set_number ?? 0,
      queueId: info?.queue_id ?? info?.queueId ?? 0,
      gameType: info?.tft_game_type ?? "",
      gameVersion: info?.game_version ?? "",
      tier: row.tier ?? "",
      boards: toParticipants(row.payload),
    };
  });
}

/** Una página de PostgREST. Inyectable para que los tests no toquen la red. */
export type FetchRows = (query: string) => Promise<unknown[]>;

/** Payloads de ~20 KB: 200 por request son unos 4 MB, que es una respuesta cómoda. */
const PAGE = 200;

export async function loadLobbiesFromPg(
  fetchRows: FetchRows,
  set: number,
  patch: string,
  page = PAGE
): Promise<LobbyRecord[]> {
  const out: LobbyRecord[] = [];
  for (let offset = 0; ; offset += page) {
    const rows = (await fetchRows(matchesQuery(set, patch, page, offset))) as PgRow[];
    out.push(...lobbiesFromRows(rows));
    if (rows.length < page) return out;
  }
}

/**
 * El parche más nuevo que hay en la base, pidiendo solo la columna de versión: son
 * unos cientos de KB contra los ~145 MB que pesan los payloads.
 */
export async function newestPatchFromPg(fetchRows: FetchRows, set: number): Promise<string> {
  const rows = (await fetchRows(
    `matches?select=game_version&set_number=eq.${set}&queue_id=eq.${RANKED_QUEUE}&limit=100000`
  )) as { game_version: string | null }[];
  return newestPatch(rows.map((r) => patchOf(r.game_version ?? "")));
}

/**
 * El lector real. La service role key saltea RLS, así que vive solo acá, en
 * migrate-to-postgres y en la Edge Function — nunca en el navegador, nunca en git.
 */
export function pgFetcher(env: Record<string, string | undefined> = process.env): FetchRows {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.\n" +
        "En local van en games/tft/pipeline/.env; en CI, en los secrets del repo."
    );
  }
  return async (query: string) => {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`${query} respondió ${res.status}: ${await res.text()}`);
    return (await res.json()) as unknown[];
  };
}
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS. El test que importa es *"produce el mismo LobbyRecord que el lector de
disco"*: si ese falla, las dos fuentes publican distinto y no hay que seguir.

- [ ] **Paso 5: commit**

```bash
git add games/tft/pipeline/src/pgStore.ts games/tft/pipeline/test/pgStore.test.ts
git commit -m "feat: read matches from Postgres in the same shape the disk store returns"
```

---

### Tarea 3 — `--from=pg` en el build, y la comparación que habilita todo

**Archivos:**
- Modificar: `games/tft/pipeline/src/build.ts:97-100` (parseo de argumentos) y
  `build.ts:187-263` (`main`)
- Crear: `games/tft/pipeline/test/buildArgs.test.ts`

**Consume:** `loadLobbiesFromPg`, `newestPatchFromPg`, `pgFetcher` de `./pgStore`.

**Produce:** `parseArgs(argv: string[]): { patch: string; band: string; source: "disk" | "pg" }`,
exportada desde `build.ts`.

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/buildArgs.test.ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/build";

describe("parseArgs", () => {
  it("por defecto construye todo desde el disco", () => {
    expect(parseArgs([])).toEqual({ patch: "", band: "", source: "disk" });
  });

  it("reconoce un parche por su forma", () => {
    expect(parseArgs(["16.13"]).patch).toBe("16.13");
  });

  it("reconoce una banda", () => {
    expect(parseArgs(["diamond-emerald"]).band).toBe("diamond-emerald");
  });

  // La bandera empieza con guiones: sin excluirla, `args.find` la tomaba como
  // banda y el build fallaba con `unknown band "--from=pg"`.
  it("no confunde la bandera con una banda", () => {
    expect(parseArgs(["--from=pg"])).toEqual({ patch: "", band: "", source: "pg" });
  });

  it("acepta las tres cosas en cualquier orden", () => {
    expect(parseArgs(["--from=pg", "apex", "16.13"])).toEqual({
      patch: "16.13",
      band: "apex",
      source: "pg",
    });
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- buildArgs
```

Esperado: FAIL, `does not provide an export named 'parseArgs'`.

- [ ] **Paso 3: cambiar el parseo y la carga en `build.ts`**

Reemplazar las líneas 97-100 por:

```ts
/**
 *   npm run build:comps                          — todas las bandas, parche vigente
 *   npm run build:comps -- diamond-emerald       — una banda
 *   npm run build:comps -- 16.13                 — un parche archivado
 *   npm run build:comps -- --from=pg             — leyendo de Postgres, no del disco
 */
export function parseArgs(argv: string[]): { patch: string; band: string; source: "disk" | "pg" } {
  const args = argv.map((a) => a.trim().toLowerCase()).filter(Boolean);
  const flags = args.filter((a) => a.startsWith("-"));
  const plain = args.filter((a) => !a.startsWith("-"));
  return {
    patch: plain.find((a) => /^\d+\.\d+$/.test(a)) ?? "",
    band: plain.find((a) => !/^\d+\.\d+$/.test(a)) ?? "",
    source: flags.includes("--from=pg") ? "pg" : "disk",
  };
}

const { patch: requestedPatch, band: requested, source } = parseArgs(process.argv.slice(2));
const targets = requested ? BANDS.filter((b) => b.id === requested) : BANDS;
```

En `main()`, hacerla `async` y cambiar solo la carga y la línea de log que cuenta
archivos en disco:

```ts
async function main() {
  if (requested && targets.length === 0) {
    console.error(`unknown band "${requested}". Known: ${BANDS.map((b) => b.id).join(", ")}`);
    process.exit(1);
  }

  let all: LobbyRecord[];
  if (source === "pg") {
    // Un solo fetcher para las dos consultas, y la de versiones primero: pedir los
    // payloads de todos los parches serían ~300 MB para tirar el 80%.
    const fetchRows = pgFetcher();
    const wanted = requestedPatch || (await newestPatchFromPg(fetchRows, SET));
    all = await loadLobbiesFromPg(fetchRows, SET, wanted);
  } else {
    all = loadLobbies(STORE);
  }
  const inSet = all.filter((l) => isComparable(l, SET));
  console.log(
    source === "pg"
      ? `loaded ${inSet.length} usable matches from Postgres`
      : `loaded ${inSet.length} usable matches of ${countMatches(STORE)} on disk`
  );
```

El resto de `main()` no cambia: el filtro por parche, las bandas y la escritura ya
trabajan sobre `inSet`. Al final del archivo:

```ts
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
```

Agregar el import: `import { loadLobbiesFromPg, newestPatchFromPg, pgFetcher } from "./pgStore";`

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS.

- [ ] **Paso 5: verificar que el build de disco sigue igual**

```bash
npm run build:comps --prefix games/tft/pipeline
node -e "const {execSync}=require('child_process'),{readFileSync}=require('fs');for(const f of ['comps.json','comps.apex.json','comps.diamond-emerald.json','comps.platinum-gold.json','comps.silver-below.json']){const a=JSON.parse(execSync('git show HEAD:games/tft/data/'+f).toString()),b=JSON.parse(readFileSync('games/tft/data/'+f,'utf-8'));console.log(f.padEnd(28),'commiteado',a.sampleSize,a.comps.length,'→ ahora',b.sampleSize,b.comps.length);}"
```

Esperado: los tableros **suben o quedan iguales**, nunca bajan, y la cantidad de comps
se mueve como mucho una o dos. El disco puede tener partidas nuevas desde el último
build commiteado; lo que no puede es tener menos.

Restaurar antes de seguir: `git checkout games/tft/data`.

- [ ] **Paso 6: la comparación entre fuentes — la verificación que habilita todo**

```bash
cp games/tft/data/comps.json /tmp/disco.json
cp games/tft/data/comps.platinum-gold.json /tmp/disco.pg-band.json
npm run build:comps --prefix games/tft/pipeline -- --from=pg
node -e "for (const [a,b] of [['/tmp/disco.json','games/tft/data/comps.json'],['/tmp/disco.pg-band.json','games/tft/data/comps.platinum-gold.json']]) { const d=require(a), p=require(b); console.log(b, 'disco', d.sampleSize, d.comps.length, '→ pg', p.sampleSize, p.comps.length, 'top', d.comps[0]?.signature, '/', p.comps[0]?.signature); }"
```

Esperado, contra lo publicado hoy (parche 16.14): global ~54.496 tableros / 50 comps,
platinum-gold ~7.328 / 47. Postgres puede quedar unos puntos por debajo —el disco
tiene partidas que el backfill no subió si se agregaron después—, pero **una banda
que caiga a la mitad, o un top 1 distinto, significa que el `tier` o el backfill están
mal**. No seguir hasta que cierre.

Después, dejar los archivos como estaban: `git checkout games/tft/data`.

- [ ] **Paso 7: commit**

```bash
git add games/tft/pipeline/src/build.ts games/tft/pipeline/test/buildArgs.test.ts
git commit -m "feat: let the build read from Postgres, so a machine can publish it"
```

---

### Tarea 4 — El umbral provisional para el cambio de parche

Con `MIN_BAND_BOARDS = 2000`, el día que Riot saca un parche **las cuatro bandas**
publican vacío y `MetaView.tsx:532` deja `/tft/meta` sin tier list. Se publica igual
desde 500 tableros, marcado como provisional y dicho en pantalla.

Atado al parche más nuevo, **no permanente**: `silver-below` es fina siempre y no por
transición, y su decisión (publicar vacío) sigue en pie.

**Archivos:**
- Modificar: `games/tft/pipeline/src/build.ts` (constante + `buildBand`)
- Modificar: `games/tft/pipeline/src/output.ts:29` (campo nuevo)
- Crear: `games/tft/pipeline/test/bandOutcome.test.ts`
- Modificar: `games/tft/ui/src/data.ts:61,499-521`
- Modificar: `games/tft/ui/src/i18n.ts:129,804` (EN y ES)
- Modificar: `games/tft/ui/src/MetaView.tsx:572`

**Produce:** `bandOutcome(boards: number, newestPatch: boolean): "full" | "provisional" | "empty"`,
exportada desde `build.ts`; campo `provisional?: boolean` en `BandedDataset` y en
`CompsFile`/`Dataset`.

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/bandOutcome.test.ts
import { describe, it, expect } from "vitest";
import { bandOutcome } from "../src/build";

describe("bandOutcome", () => {
  it("publica normal con muestra suficiente", () => {
    expect(bandOutcome(2000, true)).toBe("full");
    expect(bandOutcome(54496, false)).toBe("full");
  });

  // El caso que existe para esto: el parche acaba de salir y la banda tiene poco.
  it("publica provisional en el parche nuevo", () => {
    expect(bandOutcome(500, true)).toBe("provisional");
    expect(bandOutcome(1999, true)).toBe("provisional");
  });

  it("no publica provisional en un parche archivado", () => {
    expect(bandOutcome(1500, false)).toBe("empty");
  });

  // silver-below vive acá: fina siempre, no por transición.
  it("publica vacío por debajo del piso, aun en el parche nuevo", () => {
    expect(bandOutcome(499, true)).toBe("empty");
    expect(bandOutcome(1576, false)).toBe("empty");
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- bandOutcome
```

Esperado: FAIL, `does not provide an export named 'bandOutcome'`.

- [ ] **Paso 3: implementar en el pipeline**

En `output.ts`, junto a `insufficient`:

```ts
  /**
   * True cuando la banda publica con menos muestra de la habitual porque el parche
   * recién empezó. Mostrar el meta del parche anterior sería peor: entre parches
   * cambian de letra 14 de cada 30 comps.
   */
  provisional?: boolean;
```

En `build.ts`, junto a `MIN_BAND_BOARDS`:

```ts
/**
 * Piso para publicar un parche recién salido.
 *
 * Muy por debajo de MIN_BAND_BOARDS y a propósito. La razón para aceptar una muestra
 * fina no es que algo sea mejor que nada: es que la alternativa —el meta del parche
 * anterior— está equivocada. Entre 16.13 y 16.14, 14 de las 30 comps presentes en los
 * dos cambiaron de letra. Por eso aplica SOLO al parche más nuevo: una banda que es
 * fina siempre, como silver-below, sigue publicando vacío y explicando por qué.
 *
 * 500 es el mismo piso que MIN_HABIT_BOARDS, que ya se justificó midiendo: es donde
 * una tasa deja de moverse con un puñado de partidas.
 */
const PROVISIONAL_BAND_BOARDS = Number(process.env.PROVISIONAL_BAND_BOARDS ?? "500");

// El parámetro NO se llama `newestPatch`: ese nombre ya es la función importada de
// patch.ts y taparla adentro de build.ts es pedirle un bug al próximo que edite acá.
export function bandOutcome(
  boards: number,
  isNewestPatch: boolean
): "full" | "provisional" | "empty" {
  if (boards >= MIN_BAND_BOARDS) return "full";
  if (isNewestPatch && boards >= PROVISIONAL_BAND_BOARDS) return "provisional";
  return "empty";
}
```

`buildBand` recibe un parámetro más y reemplaza su gate. La firma pasa a:

```ts
function buildBand(
  band: RankBand,
  lobbies: LobbyRecord[],
  catalog: Catalog | null,
  now: string,
  patch: string,
  isNewestPatch: boolean
): BandHabits | null {
```

y el bloque de `boards.length < MIN_BAND_BOARDS` (líneas 148-158) pasa a:

```ts
  const outcome = bandOutcome(boards.length, isNewestPatch);
  if (outcome === "empty") {
    const thin = { ...meta, insufficient: true as const };
    writeComps(bandPath(OUT, band.id), { ...thin, comps: [] });
    writeUnits(bandPath(UNITS_OUT, band.id), { ...thin, units: [] });
    writeItems(bandPath(ITEMS_OUT, band.id), { ...thin, items: [] });
    console.warn(
      `${label} ${String(boards.length).padStart(6)} boards — under ${MIN_BAND_BOARDS}, ` +
        `published empty (needs more of patch ${patch})`
    );
    return habits;
  }
  const provisional = outcome === "provisional";
  if (provisional) {
    console.warn(
      `${label} ${String(boards.length).padStart(6)} boards — provisional: patch ${patch} ` +
        `is new and this is under ${MIN_BAND_BOARDS}`
    );
  }
```

y las tres escrituras de más abajo (líneas 168-170) llevan la bandera:

```ts
  writeComps(bandPath(OUT, band.id), { ...meta, provisional, calibration, comps });
  writeUnits(bandPath(UNITS_OUT, band.id), { ...meta, provisional, units });
  writeItems(bandPath(ITEMS_OUT, band.id), { ...meta, provisional, items });
```

En `main()`, calcular si el parche que se construye es el más nuevo que hay en los
datos y pasarlo:

```ts
  const newest = newestPatch(inSet.map((l) => patchOf(l.gameVersion)));
  const patch = requestedPatch || newest;
  ...
    const habits = buildBand(band, lobbies, catalog, now, patch, patch === newest);
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS.

- [ ] **Paso 5: la copia, en los dos idiomas**

En `games/tft/ui/src/i18n.ts`, dentro de `meta.bands`, después de `thin`. Inglés:

```ts
      provisional: (patch: string) =>
        `Patch ${patch} has only just landed, so this list rests on far fewer games than usual ` +
        `and will move over the next days. We show it anyway because last patch's answer is a different game.`,
```

Español (neutro latinoamericano, sin voseo):

```ts
      provisional: (patch: string) =>
        `El parche ${patch} recién salió, así que esta lista se apoya en muchas menos partidas ` +
        `de lo habitual y va a moverse en los próximos días. La mostramos igual porque el parche ` +
        `anterior responde otra pregunta.`,
```

- [ ] **Paso 6: la bandera hasta la pantalla**

En `games/tft/ui/src/data.ts`, en `CompsFile` (junto a `insufficient`, línea 62):

```ts
  /** True cuando la banda publica con muestra corta porque el parche recién salió. */
  provisional?: boolean;
```

en `Dataset` (línea 509):

```ts
  /** True cuando la lista es del parche nuevo y todavía con poca muestra. */
  provisional: boolean;
```

y en `datasetFor` (línea 520):

```ts
    provisional: file.provisional === true,
```

En `games/tft/ui/src/MetaView.tsx`, junto al aviso de muestra fina (línea 572):

```tsx
        {dataset.provisional && (
          <p className="band-warning">
            {copy.meta.bands.provisional(dataset.patchLabel || dataset.setLabel)}
          </p>
        )}
        {mostlyThin(comps) && <p className="band-warning">{copy.meta.bands.thin}</p>}
```

- [ ] **Paso 7: correr los tests de la UI y el build de tipos**

```bash
npm test --prefix games/tft/ui && npm run build --prefix games/tft/ui
```

Esperado: PASS los dos. `tsc -b` es el que agarra que falte el campo en un locale:
vitest transpila sin chequear tipos.

- [ ] **Paso 8: commit**

```bash
git add games/tft/pipeline/src/build.ts games/tft/pipeline/src/output.ts games/tft/pipeline/test/bandOutcome.test.ts games/tft/ui/src/data.ts games/tft/ui/src/i18n.ts games/tft/ui/src/MetaView.tsx
git commit -m "feat: publish a new patch early and say so, instead of showing nothing for days"
```

---

### Tarea 5 — Que la poda no se coma lo publicado *(se puede saltear hoy)*

**Se puede dejar para después y no pasa nada antes del Set 18**, porque la poda solo
corre arriba de 400 MB y las cuentas dicen que la base llega a ~284 MB el día que abre
el set (ver el cierre del documento). Va igual en el plan por una sola razón: es la
única de las seis tareas cuyo error **no se ve**. Si la poda se dispara con el orden
viejo, borra Oro y Plata del parche vigente y las bandas de abajo se vacían sin que
nada falle. Son 20 líneas de SQL.


`prune_matches` borra por `tier_expendability`: primero los rangos bajos, **incluidos
los del parche vigente**, que es justo la evidencia de `platinum-gold` y
`silver-below`. El comentario de `0005_prune_matches.sql:16-19` ya lo anotó: *"el día
que el build lea de Postgres, hay que revisar esto"*. Ese día es este.

**Archivos:**
- Crear: `games/tft/supabase/migrations/0006_prune_keeps_the_published_patch.sql`

- [ ] **Paso 1: ver qué borraría hoy, antes de tocar nada**

En el SQL editor de Supabase:

```sql
select coalesce(substring(game_version from '<Releases/([0-9]+\.[0-9]+)>'), '?') as patch,
       coalesce(nullif(split_part(tier, ' ', 1), ''), '(sin tier)') as tier,
       count(*)
from (
  select * from public.matches
  order by (set_number is distinct from (select max(set_number) from public.matches)) desc,
           public.tier_expendability(tier) desc,
           game_datetime asc nulls first
  limit 500
) doomed
group by 1, 2 order by 3 desc;
```

Esperado: aparecen filas del parche vigente con rangos bajos. Eso es lo que hay que
evitar.

- [ ] **Paso 2: escribir la migración**

```sql
-- La poda no puede borrar lo que está publicado.
--
-- 0005 ordenaba por set, después por rango prescindible y último por antigüedad, y
-- su propio comentario dejó anotado el costo: la regla del rango se come primero a
-- Oro y a Plata, que son la evidencia de las bandas platinum-gold y silver-below.
-- Mientras la tier list se construía del disco eso no se notaba. Ahora se construye
-- de esta base.
--
-- El eje nuevo va ARRIBA del rango: pertenecer a uno de los dos parches más nuevos
-- del set vigente protege una partida. Dos y no uno, porque el día que sale un parche
-- el anterior sigue siendo el publicado y el nuevo es el que menos muestra tiene.

create or replace function public.protected_patches()
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(patch order by major desc, minor desc), '{}')
  from (
    select patch,
           (split_part(patch, '.', 1))::int as major,
           (split_part(patch, '.', 2))::int as minor
    from (
      select substring(game_version from '<Releases/([0-9]+\.[0-9]+)>') as patch
      from public.matches
      where set_number = (select max(set_number) from public.matches)
    ) p
    where patch is not null
    group by patch
    order by major desc, minor desc
    limit 2
  ) top2;
$$;

create or replace function public.prune_matches(
  target_bytes bigint,
  max_delete   integer default 500
)
returns integer
language plpgsql
as $$
declare
  current_set integer;
  keep        text[];
  deleted     integer := 0;
begin
  if pg_database_size(current_database()) <= target_bytes then
    return 0;
  end if;

  select max(set_number) into current_set from public.matches;
  keep := public.protected_patches();

  with doomed as (
    select match_id
    from public.matches
    order by
      -- 1. Sets viejos primero. Un set anterior no describe este juego.
      (set_number is distinct from current_set) desc,
      -- 2. Después, todo lo que no alimenta lo que está publicado.
      (coalesce(substring(game_version from '<Releases/([0-9]+\.[0-9]+)>'), '') <> all(keep)) desc,
      -- 3. Dentro de lo que queda, el rango más prescindible.
      public.tier_expendability(tier) desc,
      -- 4. Y a igualdad de todo, lo más viejo.
      game_datetime asc nulls first
    limit max_delete
  )
  delete from public.matches m
  using doomed d
  where m.match_id = d.match_id;

  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
```

- [ ] **Paso 3: aplicar la migración y verificar el orden nuevo**

Aplicarla desde el SQL editor de Supabase (o con `apply_migration`). Después:

```sql
select public.protected_patches();
```

Esperado: `{16.14,16.13}` (o los dos parches más nuevos que haya). Y repetir la
consulta del Paso 1 con el eje nuevo agregado al `order by`: ya **no** deben aparecer
filas de los parches protegidos.

- [ ] **Paso 4: commit**

```bash
git add games/tft/supabase/migrations/0006_prune_keeps_the_published_patch.sql
git commit -m "fix: stop the pruner from eating the evidence the site is publishing"
```

---

### Tarea 6 — La Action

**Archivos:**
- Crear: `games/tft/pipeline/src/publish-guard.ts`
- Crear: `games/tft/pipeline/test/publishGuard.test.ts`
- Modificar: `games/tft/pipeline/package.json` (script `publish:guard`)
- Crear: `.github/workflows/publish.yml`

**Consume:** `pgFetcher` de `./pgStore`.

**Produce:** `meaningfulChange(before, after)`, `sampleDrop(before, after)`,
`keyLooksDead(runs)`, y un CLI que sale con 0 (publicar), 3 (nada que publicar) o 1
(abortar).

- [ ] **Paso 1: el test, antes que nada**

```ts
// games/tft/pipeline/test/publishGuard.test.ts
import { describe, it, expect } from "vitest";
import { meaningfulChange, sampleDrop, keyLooksDead } from "../src/publish-guard";

const file = (sample: number, at: string, top = "Sorcerer|Zoe") =>
  JSON.stringify({ generatedAt: at, patch: "16.14", sampleSize: sample, comps: [{ signature: top }] });

describe("meaningfulChange", () => {
  // generatedAt sigue en los archivos (2abfa4e lo sacó de la pantalla, no del dato),
  // así que un diff a secas nunca da vacío y la Action commitearía todos los días.
  it("ignora la hora de construcción", () => {
    expect(meaningfulChange(file(100, "2026-07-26T06:00:00Z"), file(100, "2026-07-27T06:00:00Z"))).toBe(false);
  });

  it("ve un cambio real", () => {
    expect(meaningfulChange(file(100, "a"), file(120, "a"))).toBe(true);
    expect(meaningfulChange(file(100, "a"), file(100, "a", "Duelist|Yasuo"))).toBe(true);
  });
});

describe("sampleDrop", () => {
  it("no reporta caída cuando la muestra crece", () => {
    expect(sampleDrop(100, 120)).toBe(0);
  });

  it("mide la caída como fracción de lo publicado", () => {
    expect(sampleDrop(100, 60)).toBeCloseTo(0.4);
  });

  it("no divide por cero cuando no había nada publicado", () => {
    expect(sampleDrop(0, 0)).toBe(0);
  });
});

describe("keyLooksDead", () => {
  const run = (detail: string) => ({ status: "error", detail });
  const dead = (n: number) => Array.from({ length: n }, () => run("RIOT_401"));

  it("avisa recién con un día entero de corridas fallando por la key", () => {
    expect(keyLooksDead(dead(48))).toBe(true);
  });

  // Que la key se venza es la rutina: el cron sigue llamando y en cuanto se sube la
  // nueva vuelve a traer. Un mail por eso todos los días es ruido.
  it("no avisa por unas horas vencida", () => {
    expect(keyLooksDead(dead(12))).toBe(false);
  });

  it("no avisa si alguna anduvo", () => {
    expect(keyLooksDead([...dead(47), { status: "ok", detail: "17 de 20 rankeds" }])).toBe(false);
  });

  // Otro error no es una key vencida: la Action no debe pedir que se renueve por,
  // por ejemplo, un 503 de Riot.
  it("no confunde otra falla con la key", () => {
    expect(keyLooksDead(Array.from({ length: 48 }, () => run("RIOT_503")))).toBe(false);
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
npm test --prefix games/tft/pipeline -- publishGuard
```

Esperado: FAIL, `Cannot find module '../src/publish-guard'`.

- [ ] **Paso 3: escribir el guardián**

```ts
// games/tft/pipeline/src/publish-guard.ts
import { readFileSync, existsSync } from "node:fs";
import { pgFetcher } from "./pgStore";

/**
 * Las tres guardas de la publicación automática, porque nadie va a estar mirando.
 *
 * Se corre DESPUÉS del build, comparando lo recién construido contra la copia que se
 * guardó antes de construir. Sale con:
 *   0 — publicar
 *   3 — no hay nada que publicar (nada cambió salvo la hora)
 *   1 — abortar (la muestra se desplomó, o la key está vencida hace un día entero)
 */

const FILES = [
  "comps.json",
  "comps.apex.json",
  "comps.diamond-emerald.json",
  "comps.platinum-gold.json",
  "comps.silver-below.json",
  "units.json",
  "items.json",
  "habits.json",
];

/** Cuánto puede caer la muestra antes de que sea una lectura rota y no menos partidas. */
const MAX_DROP = 0.3;
/**
 * Corridas seguidas con la key vencida antes de gritar. 48 son 24 horas.
 *
 * Alto a propósito. Que la key se venza es la rutina, no una falla: el cron sigue
 * llamando cada 30 minutos y en cuanto se sube la nueva vuelve a traer solo. Gritar
 * por eso sería ruido diario. Un día entero sin traer nada ya no es la rutina, es un
 * olvido — y ahí sí conviene el mail de GitHub.
 */
const DEAD_KEY_RUNS = 48;

/** Todo menos la hora de construcción, que cambia siempre y no dice nada. */
function withoutTimestamp(json: string): string {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  delete parsed.generatedAt;
  return JSON.stringify(parsed);
}

export function meaningfulChange(before: string, after: string): boolean {
  return withoutTimestamp(before) !== withoutTimestamp(after);
}

/** Caída de muestra como fracción de lo que estaba publicado. Crecer no es caer. */
export function sampleDrop(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.max(0, (before - after) / before);
}

export interface PullRun {
  status: string;
  detail: string | null;
}

export function keyLooksDead(runs: PullRun[]): boolean {
  if (runs.length < DEAD_KEY_RUNS) return false;
  return runs
    .slice(0, DEAD_KEY_RUNS)
    .every((r) => r.status === "error" && (r.detail ?? "").includes("RIOT_401"));
}

async function main() {
  const [beforeDir, afterDir] = process.argv.slice(2);
  if (!beforeDir || !afterDir) {
    console.error("uso: publish-guard <dir-antes> <dir-después>");
    process.exit(1);
  }

  const runs = (await pgFetcher()(
    `pull_runs?select=status,detail&order=started_at.desc&limit=${DEAD_KEY_RUNS}`
  )) as PullRun[];
  if (keyLooksDead(runs)) {
    console.error(
      "La key de Riot viene fallando con RIOT_401 hace un día entero: el cron no está " +
        "trayendo partidas nuevas. Renovarla en el portal de Riot y volver a correr esto."
    );
    process.exit(1);
  }

  let changed = false;
  for (const name of FILES) {
    const before = `${beforeDir}/${name}`;
    const after = `${afterDir}/${name}`;
    if (!existsSync(after)) continue;
    if (!existsSync(before)) {
      changed = true;
      continue;
    }
    const b = readFileSync(before, "utf-8");
    const a = readFileSync(after, "utf-8");

    if (name.startsWith("comps")) {
      const drop = sampleDrop(
        (JSON.parse(b) as { sampleSize?: number }).sampleSize ?? 0,
        (JSON.parse(a) as { sampleSize?: number }).sampleSize ?? 0
      );
      if (drop > MAX_DROP) {
        console.error(
          `${name}: la muestra cayó ${(drop * 100).toFixed(0)}%. Eso no es "hay menos ` +
            `partidas", es una lectura rota. No se publica.`
        );
        process.exit(1);
      }
    }

    if (meaningfulChange(b, a)) changed = true;
  }

  if (!changed) {
    console.log("nada cambió salvo la hora: no hay nada que publicar");
    process.exit(3);
  }
  console.log("hay cambios: publicar");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
npm test --prefix games/tft/pipeline
```

Esperado: PASS.

- [ ] **Paso 5: el script de npm**

En `games/tft/pipeline/package.json`, junto a los demás:

```json
    "publish:guard": "node --env-file=.env node_modules/tsx/dist/cli.mjs src/publish-guard.ts",
```

- [ ] **Paso 6: la Action**

```yaml
# .github/workflows/publish.yml
name: publish tier list

# Una vez por día y no más seguido, por dos razones medidas: Netlify cancela un
# deploy si llega otro commit mientras construye, y cada corrida reescribe ~2,2 MB
# de JSON — a diario, ~0,8 GB de historia de git por año.
on:
  schedule:
    - cron: "0 6 * * *" # 06:00 UTC = 03:00 ART, tráfico bajo
  workflow_dispatch:

concurrency:
  group: publish
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: games/tft/*/package-lock.json

      - name: install
        run: npm ci --prefix games/tft/pipeline

      # Los scripts del pipeline corren con `node --env-file=.env`, que falla si el
      # archivo no existe. .env está en .gitignore, así que no puede commitearse.
      - name: env
        run: |
          printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' \
            "${{ secrets.SUPABASE_URL }}" "${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            > games/tft/pipeline/.env

      # Lo publicado, guardado antes de pisarlo: es contra esto que compara el guardián.
      - name: snapshot
        run: |
          mkdir -p "$RUNNER_TEMP/before"
          cp games/tft/data/*.json "$RUNNER_TEMP/before/"

      - name: build
        run: npm run build:comps --prefix games/tft/pipeline -- --from=pg

      - name: guard
        id: guard
        run: |
          set +e
          npm run publish:guard --prefix games/tft/pipeline -- "$RUNNER_TEMP/before" ../data
          code=$?
          set -e
          if [ "$code" = "3" ]; then echo "publish=no" >> "$GITHUB_OUTPUT"; exit 0; fi
          if [ "$code" != "0" ]; then exit "$code"; fi
          echo "publish=yes" >> "$GITHUB_OUTPUT"

      - name: commit
        if: steps.guard.outputs.publish == 'yes'
        run: |
          git config user.name "vestigo-bot"
          git config user.email "67348048+ZoTaD@users.noreply.github.com"
          git add games/tft/data/*.json
          git commit -m "chore: publish the tier list measured on today's matches"
          git push
```

- [ ] **Paso 7: cargar los secrets y disparar la Action a mano**

En GitHub → Settings → Secrets and variables → Actions, crear `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API en Supabase).

Después, Actions → *publish tier list* → **Run workflow**.

Esperado: el run termina verde y, o bien commitea los JSON, o dice *"nada cambió salvo
la hora"*. Verificar en el log del paso `build` que la primera línea diga
`loaded ~7250 usable matches from Postgres`.

- [ ] **Paso 8: verificar el sitio**

Si commiteó: esperar el deploy de Netlify y abrir https://vestigo.gg/tft/meta. La lista
tiene que verse igual que antes (más algunas partidas). **Si el deploy figura como
Canceled, dispararlo de nuevo**: Netlify cancela un deploy si llega otro commit
mientras construye.

- [ ] **Paso 9: commit**

```bash
git add .github/workflows/publish.yml games/tft/pipeline/package.json games/tft/pipeline/src/publish-guard.ts games/tft/pipeline/test/publishGuard.test.ts
git commit -m "feat: publish the tier list every day without anyone running a build"
```

---

## Por qué la fase 2 no hace falta antes del Set 18

Los contadores incrementales (resumir al ingerir y borrar la cruda) existen para
cuando un set solo no entre en la base. Con las cuentas de hoy, eso no pasa dentro de
esta ventana:

| | |
|---|---|
| base hoy | 93 MB de 500 |
| después del backfill | ~150 MB |
| crecimiento medido | ~6,4 MB/día (544 partidas el 2026-07-26, ~11,7 KB cada una) |
| en 3 semanas, al abrir el Set 18 | **~284 MB** |
| umbral de poda | 400 MB |

Y el cambio de set **libera** espacio en vez de gastarlo: la primera regla de
`prune_matches` ya borra los sets viejos antes que nada, así que el Set 17 entero pasa
a ser descartable el día que abre el 18.

La fase 2 se retoma cuando un set solo empiece a acercarse al techo — o cuando se
quiera la tendencia por día ("esta comp subió"), que es lo único que los contadores dan
y lo crudo no.

## Qué hace falta el día que abra el Set 18

Se hace a mano y a propósito. No es parte de esta automatización:

1. **Rebuild del catálogo**: `npm run catalog --prefix games/tft/pipeline`. Sin esto no
   existen los campeones, ítems ni traits nuevos, y `catalog.set` sigue diciendo "17".
2. **`TFT_SET`** pasa a 18 (variable de entorno del build; hoy default "17" en
   `build.ts:83`).
3. **`SET_OPENS_AT`** en `patch.ts:50` suma la entrada `18: "<versión de cliente>"`,
   que es lo que hace que el parche se muestre como "18.1" y no como "16.x".
4. **Nada más.** La Action sigue corriendo igual, el umbral provisional de la Tarea 4
   es justamente lo que evita que el sitio quede sin tier list los primeros días del
   set, y la poda se lleva el Set 17 sola cuando haga falta espacio.

## Qué queda manual después de esto, y está documentado a propósito

- **La key de Riot, cada 24 h.** No hay API para regenerarla. Que se venza **no rompe
  nada**: el cron sigue llamando cada 30 minutos, deja `RIOT_401` en `pull_runs` y
  vuelve a traer solo en cuanto se sube la nueva. La Action solo grita si pasó un día
  entero sin traer nada. La solución real es la production key.
- **`pull:ladder`.** No afecta la tier list; sí la pestaña Ladder.
- **El cambio de set**, arriba.
