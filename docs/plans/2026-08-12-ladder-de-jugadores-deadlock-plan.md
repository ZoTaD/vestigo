# Ladder de jugadores de Deadlock — plan de implementación

> **Para quien lo ejecute:** usar `superpowers:subagent-driven-development`. Los
> pasos llevan checkbox (`- [ ]`).

**Objetivo:** una pestaña `/deadlock/ladder` que muestre el top de jugadores de un
héroe y una banda de rango, con la métrica elegida y las partidas que la
respaldan, enlazando a su perfil.

**Arquitectura:** dos pedidos a deadlock-api desde el navegador (CORS `*`, el
Worker no participa): el scoreboard de jugadores y, con los ids que devuelve, los
nombres de Steam en un solo pedido. La lógica pura vive en `deadlockLadder.ts` y
`DeadlockLadder.tsx` sólo dibuja.

**Stack:** React 18 + TypeScript, Vite, vitest.

**Diseño que manda:** `docs/design/2026-08-12-ladder-de-jugadores-deadlock-design.md`.
Leerlo antes de empezar.

## Restricciones globales

- **Toda la prosa vive en `src/i18n.ts` y sólo ahí**, en inglés y español.
  Español **neutro latinoamericano, sin voseo** ("Abre", no "Abrí").
- **La raíz del tema son 19px, no 16.**
- **Antes de borrar, renombrar o re-scopear cualquier regla `dl-*`, grepearla en
  los cinco `Deadlock*.tsx`**: `.tool-head`, `.standfirst`, `.dl-list`,
  `.dl-portrait-fallback`, `.dl-fold*` y `.dl-chevron` son compartidas. Dos
  defectos de esa forma ya se publicaron.
- **Los nombres de Steam son texto de terceros**: se pintan como texto, nunca con
  `dangerouslySetInnerHTML`.
- Comandos: `npm --prefix games/tft/ui run test` y `npm --prefix games/tft/ui run build`.

---

### Tarea 1: La capa de datos

**Archivos:**
- Crear: `games/tft/ui/src/deadlockLadder.ts`
- Crear: `games/tft/ui/test/deadlockLadder.test.ts`

**Interfaces que produce** (la Tarea 2 las consume tal cual):

```ts
export type LadderMetric = "winrate" | "wins" | "avg_net_worth_per_match";
export interface BadgeRange { min?: number; max?: number }
export interface LadderRow {
  rank: number;          // 1-based, ya corregido
  accountId: number;
  value: number;         // winrate 0..1, o el valor crudo de la métrica
  matches: number;
  name?: string;         // de Steam; ausente si ese pedido falló
  country?: string;      // countrycode de Steam, si lo hay
}
export interface Ladder {
  rows: LadderRow[];
  floor: number;         // el min_matches que terminó usándose
  thin: boolean;         // true si ni con el piso mínimo se llegó a MIN_ROWS
}
export const FLOORS: number[];
export const MIN_ROWS = 20;
export function bandToBadges(band: BandId): BadgeRange;
export async function fetchLadder(opts: {
  hero?: number; band?: BandId; metric: LadderMetric; limit?: number;
}): Promise<Ladder>;
```

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `games/tft/ui/test/deadlockLadder.test.ts`. Seguir el estilo de los tests
que ya hay en ese directorio (leer `deadlockMatch.test.ts` primero: llevan
comentarios que explican POR QUÉ existe cada caso).

```ts
import { describe, it, expect } from "vitest";
import { bandToBadges, FLOORS, MIN_ROWS } from "../src/deadlockLadder";
import { BANDS } from "../src/deadlockData";

/**
 * El badge vale `tier * 10 + subrango`, así que una banda de tiers se traduce a
 * un rango de badges. Es la misma tabla que usa la tier list; si diverge, la
 * ladder diría "Oráculo" sobre partidas de otra banda.
 */
describe("bandToBadges", () => {
  it("traduce Fantasma+ a badge 90 y sin techo", () => {
    expect(bandToBadges("phantom-above")).toEqual({ min: 90 });
  });

  it("traduce Arconte / Oráculo a 70-89", () => {
    expect(bandToBadges("archon-oracle")).toEqual({ min: 70, max: 89 });
  });

  it("traduce Arcanista y abajo dejando el piso abierto", () => {
    expect(bandToBadges("arcanist-below")).toEqual({ max: 49 });
  });

  it("cubre las cuatro bandas que publica el sitio, sin inventar ninguna", () => {
    for (const b of BANDS) {
      const r = bandToBadges(b.id);
      expect(r.min !== undefined || r.max !== undefined).toBe(true);
    }
  });
});

/**
 * El piso de partidas NO puede ser fijo: 200 funciona para un héroe popular y
 * deja vacío a uno raro. Baja por escalones hasta llegar a MIN_ROWS.
 */
describe("los escalones del piso", () => {
  it("van de mayor a menor y terminan en un número usable", () => {
    expect(FLOORS).toEqual([...FLOORS].sort((a, b) => b - a));
    expect(FLOORS[FLOORS.length - 1]).toBeGreaterThan(0);
  });

  it("arranca alto, que es lo que saca a las cuentas de 30 partidas al 100%", () => {
    expect(FLOORS[0]).toBeGreaterThanOrEqual(100);
  });

  it("pide al menos 20 filas para dar una tabla por buena", () => {
    expect(MIN_ROWS).toBe(20);
  });
});
```

- [ ] **Paso 2: Correrlos y verlos fallar**

```bash
npm --prefix games/tft/ui run test -- deadlockLadder
```

Esperado: **FALLA** con "Cannot find module '../src/deadlockLadder'".

- [ ] **Paso 3: Escribir `deadlockLadder.ts`**

```ts
import { BANDS, type BandId } from "./deadlockData";

/**
 * La ladder de jugadores: quién rinde mejor con un héroe, en una banda de rango.
 *
 * **Sale de `/v1/analytics/scoreboards/players`, no del leaderboard de Valve.**
 * Medido el 2026-08-12: el leaderboard trae región pero no rango, sus cuentas
 * son un array de candidatos —el jugador llamado "n" trae 178— y en Sudamérica
 * da entre 0 y 6 jugadores por héroe. El scoreboard trae `account_id` real,
 * filtra por héroe y por banda, y dice sobre cuántas partidas habla.
 *
 * Lo que se pierde es la región: el scoreboard la rechaza con HTTP 500.
 */

const API = "https://api.deadlock-api.com/v1";

export type LadderMetric = "winrate" | "wins" | "avg_net_worth_per_match";

export interface BadgeRange {
  min?: number;
  max?: number;
}

export interface LadderRow {
  rank: number;
  accountId: number;
  value: number;
  matches: number;
  name?: string;
  country?: string;
}

export interface Ladder {
  rows: LadderRow[];
  floor: number;
  thin: boolean;
}

/**
 * Los escalones del piso de partidas, de más exigente a menos.
 *
 * **Existe porque el winrate crudo premia a las cuentas nuevas.** Medido sobre
 * Victor: con 30 partidas mínimas el primero tenía 100% en 32; con 200, 72,5%
 * en 240 — y todavía quedaban 701 jugadores, porque el Victor más jugado tiene
 * 946 partidas. El piso baja solo cuando la combinación no da muestra: un héroe
 * poco jugado cruzado con una banda alta deja seis personas.
 */
export const FLOORS = [200, 100, 50, 25, 10];

/** Con menos filas que esto, la tabla no es un ranking. */
export const MIN_ROWS = 20;

/**
 * De banda del sitio a rango de badge.
 *
 * El badge vale `tier * 10 + subrango`, así que la banda de tiers [9,10,11] es
 * 90 a 119 — y como 11 es el tier más alto, arriba se deja abierto. Abajo pasa
 * lo mismo con el 0.
 */
export function bandToBadges(band: BandId): BadgeRange {
  const b = BANDS.find((x) => x.id === band);
  if (!b) return {};
  const lo = Math.min(...b.tiers);
  const hi = Math.max(...b.tiers);
  const maxTier = Math.max(...BANDS.flatMap((x) => x.tiers));
  const minTier = Math.min(...BANDS.flatMap((x) => x.tiers));
  const out: BadgeRange = {};
  if (lo > minTier) out.min = lo * 10;
  if (hi < maxTier) out.max = hi * 10 + 9;
  return out;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface RawRow {
  rank: number;
  account_id: number;
  value: number;
  matches: number;
}

interface RawSteam {
  account_id: number;
  personaname?: string;
  countrycode?: string;
}

/**
 * La tabla, con los nombres puestos.
 *
 * **Dos pedidos, no uno por fila**: `/v1/players/steam` toma `account_ids`
 * repetido y resuelve todos juntos. Ese segundo pedido **puede fallar sin
 * llevarse la página** — si no llega, las filas se dibujan con el id, que es el
 * mismo criterio que usa el perfil con la ficha de Steam.
 */
export async function fetchLadder(opts: {
  hero?: number;
  band?: BandId;
  metric: LadderMetric;
  limit?: number;
}): Promise<Ladder> {
  const limit = opts.limit ?? 50;
  const badges = opts.band ? bandToBadges(opts.band) : {};

  let raw: RawRow[] = [];
  let floor = FLOORS[FLOORS.length - 1];
  for (const f of FLOORS) {
    const q = new URLSearchParams({
      sort_by: opts.metric,
      sort_direction: "desc",
      min_matches: String(f),
      limit: String(limit),
    });
    if (opts.hero) q.set("hero_id", String(opts.hero));
    if (badges.min !== undefined) q.set("min_average_badge", String(badges.min));
    if (badges.max !== undefined) q.set("max_average_badge", String(badges.max));
    raw = await get<RawRow[]>(`${API}/analytics/scoreboards/players?${q}`);
    floor = f;
    if (raw.length >= MIN_ROWS) break;
  }

  const rows: LadderRow[] = raw.map((r, i) => ({
    rank: i + 1,
    accountId: r.account_id,
    value: r.value,
    matches: r.matches,
  }));

  if (rows.length > 0) {
    try {
      const q = rows.map((r) => `account_ids=${r.accountId}`).join("&");
      const steam = await get<RawSteam[]>(`${API}/players/steam?${q}`);
      const byId = new Map(steam.map((s) => [s.account_id, s]));
      for (const r of rows) {
        const s = byId.get(r.accountId);
        if (s?.personaname) r.name = s.personaname;
        if (s?.countrycode) r.country = s.countrycode;
      }
    } catch {
      /* sin nombres, pero con tabla */
    }
  }

  return { rows, floor, thin: rows.length < MIN_ROWS };
}
```

- [ ] **Paso 4: Correr los tests**

```bash
npm --prefix games/tft/ui run test -- deadlockLadder
```

Esperado: **PASA**, todos.

- [ ] **Paso 5: Comprobarlo contra la API de verdad**

Los tests cubren lo puro; esto comprueba que la consulta es la correcta. Con el
dev server corriendo, en la consola del navegador:

```js
const q = "sort_by=winrate&sort_direction=desc&min_matches=200&limit=50&hero_id=66";
const r = await (await fetch("https://api.deadlock-api.com/v1/analytics/scoreboards/players?" + q)).json();
const s = await (await fetch("https://api.deadlock-api.com/v1/players/steam?" + r.slice(0,3).map(x=>"account_ids="+x.account_id).join("&"))).json();
JSON.stringify({ filas: r.length, primero: r[0], nombres: s.map(x => x.personaname) });
```

Esperado: ~50 filas, el primero con `value` cerca de 0,72 y `matches` sobre 200,
y tres nombres de Steam.

- [ ] **Paso 6: Correr todo y commitear**

```bash
npm --prefix games/tft/ui run build && npm --prefix games/tft/ui run test
git add games/tft/ui/src/deadlockLadder.ts games/tft/ui/test/deadlockLadder.test.ts
git commit -m "feat(deadlock): la capa de datos de la ladder de jugadores"
```

---

### Tarea 2: La pestaña

**Archivos:**
- Crear: `games/tft/ui/src/DeadlockLadder.tsx`
- Modificar: `games/tft/ui/src/route.ts:27` y `:33`
- Modificar: `games/tft/ui/src/App.tsx` (montar la vista)
- Modificar: `games/tft/ui/src/i18n.ts` (rótulo de pestaña, copia y SEO, EN y ES)
- Modificar: `games/tft/ui/src/styles/codex.css`

**Interfaces que consume:** todo lo de la Tarea 1.

- [ ] **Paso 1: Sumar la sección a la ruta**

En `route.ts:27`, agregar `"ladder"` al tipo:

```ts
export type DeadlockSection = "meta" | "items" | "ranks" | "ladder" | "patches" | "player" | "match";
```

En `route.ts:33`, agregar `"ladder"` a la lista, **después de `ranks`**:

```ts
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "items", "ranks", "ladder", "patches", "player"];
```

Con eso la pestaña aparece sola en el switcher (`App.tsx` recorre esa lista) y en
el sitemap (`sitemap.ts:108` también). **No hay que tocar ninguno de los dos.**

- [ ] **Paso 2: La copia, en los dos idiomas**

En `i18n.ts`, dentro de `deadlock.tabs` de CADA idioma, agregar `ladder`:
inglés `"Ladder"`, español `"Escalera"`.

Agregar un bloque `deadlock.ladder` en cada idioma con estas claves. **Los textos
en español son neutros, sin voseo.** Inglés:

```ts
ladder: {
  title: "Player",
  titleBreak: " ladder",
  lead:
    "Who actually performs best with a hero, and at what rank. Every row shows how many " +
    "matches it is measured on — a 100% win rate over thirty games is a new account, not a king.",
  hero: "Hero",
  allHeroes: "All heroes",
  metric: "Sort by",
  metrics: { winrate: "Win rate", wins: "Wins", avg_net_worth_per_match: "Souls per match" },
  cols: { rank: "#", player: "Player", matches: "Matches" },
  floor: (n: string) => `Players with ${n}+ matches on this hero`,
  thin: "Not enough players match this hero and rank yet. Try a wider rank or another hero.",
  loading: "Loading the ladder…",
  failed: "deadlock-api is not answering, so there is nothing to rank right now.",
},
```

Español:

```ts
ladder: {
  title: "Escalera",
  titleBreak: " de jugadores",
  lead:
    "Quién rinde mejor con cada héroe, y en qué rango. Cada fila dice sobre cuántas partidas " +
    "está medida — un 100% en treinta partidas es una cuenta nueva, no un rey.",
  hero: "Héroe",
  allHeroes: "Todos los héroes",
  metric: "Ordenar por",
  metrics: { winrate: "Victorias", wins: "Ganadas", avg_net_worth_per_match: "Almas por partida" },
  cols: { rank: "#", player: "Jugador", matches: "Partidas" },
  floor: (n: string) => `Jugadores con ${n}+ partidas con este héroe`,
  thin: "Todavía no hay suficientes jugadores para este héroe y este rango. Prueba con un rango más amplio u otro héroe.",
  loading: "Cargando la escalera…",
  failed: "deadlock-api no responde, así que no hay nada que ordenar ahora.",
},
```

En `i18n.ts`, dentro de `seo.deadlock` de cada idioma, agregar, **siguiendo la
forma de `ranks` que ya está ahí** (`title` y `description` son funciones):

```ts
ladder: {
  title: () => "Deadlock Player Ladder — Best Players by Hero and Rank | Vestigo",
  description: () =>
    "The best Deadlock players on each hero, at every rank, with the number of matches " +
    "behind every win rate so a new account never passes for a veteran.",
},
```

Español:

```ts
ladder: {
  title: () => "Escalera de jugadores de Deadlock — los mejores por héroe | Vestigo",
  description: () =>
    "Los mejores jugadores de Deadlock con cada héroe y en cada rango, con las partidas " +
    "detrás de cada porcentaje para que una cuenta nueva no pase por veterana.",
},
```

- [ ] **Paso 3: El componente**

Crear `games/tft/ui/src/DeadlockLadder.tsx`. Requisitos, todos del diseño:

- Estado local: héroe elegido (`number | undefined`), métrica (`LadderMetric`,
  arranca en `"winrate"`). **La banda NO es estado propio**: viene por prop desde
  `App`, igual que las otras pestañas de Deadlock, para que la elección sobreviva
  al cambio de pestaña.
- Pide con `fetchLadder` en un `useEffect` con bandera `vivo` para no escribir
  estado después de desmontar — copiar el patrón de `DeadlockPlayer.tsx:171-200`.
- Encabezado con `.tool-head`, `.masthead` (eyebrow + título + bajada) y
  `.tool-controls`, **igual que las demás pestañas**. El selector de héroe es un
  `<select>` de verdad con los 38 más "todos"; la métrica, otro `<select>`. El
  selector de banda es el `picker` que `App` ya pasa.
- Una línea de metadatos con `copy.deadlock.ladder.floor(...)` diciendo el piso
  que se usó. **Si `thin` es true, se muestra `ladder.thin` y NO se dibuja la
  tabla.**
- La tabla: `<ol className="dl-ladder">` con una fila por jugador —puesto,
  bandera si hay `country`, nombre (o el id si no llegó), el valor formateado
  según la métrica, y **siempre `matches`**.
- El nombre es un `RouteLink` a `{ view: "deadlock", dlSection: "player", detail: String(accountId) }`.
- La bandera se dibuja como emoji desde el `countrycode` de dos letras:
  `String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))`.
  Si el código no tiene dos letras, no se dibuja nada.
- Formato del valor: `winrate` como porcentaje con un decimal; `wins` y
  `avg_net_worth_per_match` como entero con separador de miles del locale.

- [ ] **Paso 4: Montarla en `App.tsx`**

Al lado de las otras vistas de Deadlock, agregar la rama
`route.dlSection === "ladder"` que renderiza `<DeadlockLadder band={band} picker={picker} />`,
con los mismos props de banda y picker que ya recibe `Deadlock`.

- [ ] **Paso 5: CSS**

Agregar en `codex.css`, cerca de las demás reglas `dl-`, las de `.dl-ladder` y
su fila. **Grepear antes cada clase nueva** para no chocar con una existente.
Reusar los patrones que ya hay: la fila del historial (`.dl-rep-match`) es el
modelo más parecido. La columna de partidas va con
`font-variant-numeric: tabular-nums`.

- [ ] **Paso 6: Compilar y correr los tests**

```bash
npm --prefix games/tft/ui run build && npm --prefix games/tft/ui run test
```

Esperado: sin errores de tipo y todo en verde. `route.test.ts`, `sitemap.test.ts`
y `pageMeta.test.ts` **tienen que seguir pasando**; si alguno falla, es que la
sección nueva no quedó bien declarada.

- [ ] **Paso 7: Verificar en el navegador**

El dev server corre con `preview_start` `{name: "tft-ui"}` en
http://localhost:5173. `resize_window` a 1400x900. **No sacar capturas — el
controlador hace la pasada visual.** Con `javascript_tool`, en
`/es/deadlock/ladder` y en `/en/deadlock/ladder`, reportar:

- cuántas filas dibuja y el piso que muestra
- que cambiar el héroe cambia la tabla (elegir Victor y comprobar que el primero
  tiene 200+ partidas)
- que cambiar la banda a Fantasma+ vuelve a pedir y no rompe
- que hay nombres de Steam y no ids en la mayoría de las filas
- `document.documentElement.scrollWidth > innerWidth` en 1400 y en 375

- [ ] **Paso 8: Commit**

```bash
git add games/tft/ui/src/DeadlockLadder.tsx games/tft/ui/src/App.tsx games/tft/ui/src/route.ts games/tft/ui/src/i18n.ts games/tft/ui/src/styles/codex.css
git commit -m "feat(deadlock): pestaña de escalera de jugadores por heroe y rango"
```

---

### Tarea 3: Verificación final y publicación

- [ ] **Paso 1: Las combinaciones que pueden quedar vacías**

Probar en el navegador un héroe poco jugado cruzado con Fantasma+ y confirmar que
la página muestra el mensaje de `thin` y **no** una tabla de tres filas. Es el
riesgo principal del diseño.

- [ ] **Paso 2: Teléfono**

375x812, los dos idiomas: sin desborde horizontal, nombres sin cortarse a la
mitad, la columna de partidas visible.

- [ ] **Paso 3: Que no se rompió nada compartido**

`/en/deadlock`, `/en/deadlock/items`, `/en/deadlock/ranks`, `/en/deadlock/player`
y `/en/tft/meta`: `.tool-head` con alto razonable y sin desborde.

- [ ] **Paso 4: La suite entera**

```bash
npm --prefix games/tft/ui run build && npm --prefix games/tft/ui run test
```

- [ ] **Paso 5: Publicar**

```bash
git checkout main && git merge --ff-only deadlock-ladder && git push origin main
```

Después confirmar contra el sitio real que la pestaña existe y dibuja filas —
**el HTML servido no alcanza**, porque la tabla se arma en el cliente: hay que
medir en el navegador contra `https://vestigo.gg`.

## Riesgos

- **El piso adaptativo hace hasta 5 pedidos** si la combinación no da muestra.
  Es aceptable porque sólo pasa en combinaciones raras, pero si se nota lento, el
  arreglo es arrancar más abajo cuando hay banda elegida, no sacar el piso.
- **`min_average_badge` filtra por el badge de la PARTIDA**, no por el rango del
  jugador. Coherente con la tier list, pero el rótulo no debe decir "jugadores de
  Oráculo".
