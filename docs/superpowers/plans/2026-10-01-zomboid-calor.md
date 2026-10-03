# Project Zomboid — Mapa: capa "Densidad de zombis" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una capa más en el Mapa (`/en/project-zomboid/map`, `/es/project-zomboid/mapa`) que pinta con lápiz rojo dónde el mapa del juego pone más zombis, chunk por chunk (8×8 casillas), con su clave "menos zombis ↔ más zombis" en la hoja de Capas, y que entra al link con `capas=densidad`.

**Architecture:**
- **Datos:** `map.py` lee los 1.024 bytes finales de cada `.lotheader` (la densidad de zombis de los 32×32 chunks de la celda), arma una grilla del mundo entero (2.496 × 2.016 chunks, un byte por chunk) y la escribe comprimida (deflate crudo) en `games/zomboid/data/map/web/zombies.bin` (68 KB). La forma va en `common.json` (`zombies: { w, h, cell, max }`).
- **Visor:** una `GridLayer` de canvas más en `overlays.ts`. El archivo se pide recién al prender la capa (una vez); se descomprime con `DecompressionStream("deflate-raw")`, se arma una pirámide por máximo (4 niveles) y cada tesela pinta su ventana de celdas en RGBA y la estira sin suavizado.
- **Página:** la capa `densidad` en `LAYERS` (url), su sello y su clave en la leyenda (layerMeta + Legend), los textos en `map/copy.ts`, y "zombie density" en la descripción de la pestaña.

**Tech Stack:** Python 3 (map.py, `zlib`, `unittest`), React 18 + TS, Leaflet (ya está), Vitest (Node 24: `DecompressionStream` global).

## Global Constraints

- Diseño: `docs/design/2026-09-30-zomboid.md` (secciones "Mapa" y "Datos"). Plan del Mapa: `docs/superpowers/plans/2026-09-30-zomboid-mapa.md`. Restricciones del Mapa: `.superpowers/sdd/mapa-constraints.md` y `.superpowers/sdd/global-constraints.md` (valen enteras).
- Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`. **Otros agentes comparten el worktree y el índice de git:** nunca `git add -A` ni `git add .`; cada commit lleva sus rutas: `git add <rutas> && git commit -m "…" -- <rutas>`.
- Los tests del sitio corren con `npx vitest run` desde `site/`; `test/deadlock.test.ts` falla por una dependencia ajena (no es de este trabajo). Los de Python, desde la raíz: `python -m unittest discover -s games/zomboid/tools/tests -v`.
- **Coordenadas:** casillas del mundo, como las escribe `map.py`. `.lotheader` = celda·256 + punto; un chunk de B42 son 8×8 casillas (32×32 chunks por celda). La celda sale del nombre del archivo (`41_37.lotheader`). Zoom del visor: `pxPerTile(z) = 2^(z−4)`; `MIN_ZOOM = −2`, `MAX_ZOOM = 6` (`site/src/zomboid/map/url.ts`).
- **Qué es el dato (verificado en el .jar de la 42.21 el 2026-10-01, no inventar más que esto):**
  - Byte `i` de los 1.024 finales = chunk `lx = i // 32`, `ly = i % 32` (columna por columna). Lo lee `IsoMetaGrid$MetaGridLoaderThread.loadCell` con `zombieIntensity[x*32 + y]` y lo guarda en `LotHeader` como `x + y*32`. El orden contrario da 5,4 veces más saltos en los bordes de celda: es el correcto.
  - Valores 0–10 en la 42.21: 148.819 chunks con algo de 4.162.560; histograma 1: 47.276, 2: 72.702, 3: 17.993, 4: 7.455, 5: 448, 6: 595, 7: 1.579, 8: 91, 9: 140, 10: 540. Lo más denso es Louisville.
  - Al cargar, el juego multiplica cada valor por el ruido Voronoi del mundo (`zombie_voronoi` en `media/lua/server/Zombies/VoronoiNoise.lua`; opción `ZombieVoronoiNoise`, prendida en el preset Apocalipsis): cada mundo cambia un poco.
  - Con la distribución "Uniforme" (`Distribution = 2`), `IsoMetaChunk.getZombieIntensity` usa 128 en todos lados: el mapa deja de importar. El preset del juego usa "Enfoque urbano" (`Distribution = 1`).
  - La cantidad total sale de la configuración (`PopulationMultiplier`, inicio, pico y día del pico) y la reparte el gestor de población nativo (`PZPopMan64.dll`), que no se puede leer. Por eso **la capa muestra densidad relativa, nunca una cuenta**, y ningún texto dice "N zombis".
- **Estética "Libreta":** lápiz rojo `--pz-pencil` = `#b3261e` (rgb 179, 38, 30). Sin bordes ni barras de color en tarjetas o filas (la clave de la leyenda es un relleno, no un borde). Las palabras nunca se cortan (nada de `overflow-wrap: anywhere` ni `word-break`). Sin scroll horizontal en el celular.
- **Textos:** en/es con voseo; nada de "sacado de los archivos del juego" ni de dónde salen los datos.
- **Peso:** el chunk de la pestaña (`ZomboidMap`, hoy 11,7 KB gz) no crece más de 0,5 KB gz; `zombies.bin` no viaja en ningún chunk (es un asset aparte con hash) y no se pide con la capa apagada.

---

### Task 1: `map.py` escribe la grilla de densidad

**Files:**
- Modify: `games/zomboid/tools/map.py` (docstring del módulo; constantes; `write_bytes`, `read_density`, `density_grid`, `zombie_density` nuevas; `write_meta` hashea también `.bin`; `write_web` recibe y guarda `zombies` en `common.json` y lo documenta; `main`)
- Create: `games/zomboid/tools/tests/test_map_density.py`
- Regenerated (commit): `games/zomboid/data/map/web/zombies.bin`, `games/zomboid/data/map/web/common.json`, `games/zomboid/data/map/meta.json`

**Interfaces:**
- Produces:
  - `games/zomboid/data/map/web/zombies.bin`: deflate crudo (`wbits = −15`, nivel 9) de `w*h` bytes, fila por fila (y afuera, x adentro), un byte por chunk de 8×8 casillas, el chunk `(X, Y)` cubre las casillas `[8X, 8X+8) × [8Y, 8Y+8)`, origen (0, 0). Determinista: el mismo juego da los mismos bytes.
  - `common.json` suma `"zombies": { "w": 2496, "h": 2016, "cell": 8, "max": 10 }` (`max` = el valor más alto de la grilla; el visor normaliza con él).
  - `meta.json`: `dataHash` cubre también `zombies.bin`, así que `extractedAt` (el `lastmod` del Mapa en el sitemap) se mueve una vez, con la corrida que agrega el archivo. Es un cambio real de la página: está bien.
  - Python: `read_density(path) -> bytes`, `density_grid(cells: dict[tuple[int, int], bytes]) -> tuple[int, int, bytearray]`, `zombie_density() -> tuple[dict, str, int]` (cabecera, ruta escrita, chunks con algo).

- [ ] **Step 1: Escribir los tests que fallan** (`games/zomboid/tools/tests/test_map_density.py`)

```python
"""
Tests de la densidad de zombis del mapa (map.py, 2026-10-01).

El de orden no necesita el juego: arma dos celdas a mano. Los de "en el juego" leen la instalación (PZ_DIR) y lo que
map.py commitea en games/zomboid/data/map/web; se saltean si el juego no está.

Correr desde la raíz del worktree:
    python -m unittest discover -s games/zomboid/tools/tests -v
"""
import json, os, sys, unittest, zlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import map as pzmap  # noqa: E402

LOT = os.path.join(pzmap.WORLD, "41_37.lotheader")


class OrdenTest(unittest.TestCase):
    def test_columna_por_columna(self):
        # El juego lee el byte lx*32 + ly: el chunk (12, 16) de la celda va en el 400, y el (16, 12) en el 524.
        b = bytearray(1024)
        b[12 * 32 + 16] = 3
        b[16 * 32 + 12] = 1
        w, h, g = pzmap.density_grid({(1, 0): bytes(b), (0, 1): bytes(1024)})
        self.assertEqual((w, h), (64, 64))
        self.assertEqual(g[16 * w + 32 + 12], 3)
        self.assertEqual(g[12 * w + 32 + 16], 1)
        self.assertEqual(sum(1 for v in g if v), 2)

    def test_celdas_que_faltan_quedan_en_cero(self):
        w, h, g = pzmap.density_grid({(2, 1): bytes([5]) * 1024})
        self.assertEqual((w, h), (96, 64))
        self.assertEqual(g[0], 0)
        self.assertEqual(g[32 * w + 64], 5)


@unittest.skipUnless(os.path.exists(LOT), "sin el juego instalado (PZ_DIR)")
class EnElJuegoTest(unittest.TestCase):
    def test_un_chunk_conocido_de_muldraugh(self):
        # 42.21: el chunk (12, 16) de la celda 41_37, casillas (10592, 9600) a (10599, 9607), vale 3; el traspuesto, 1.
        d = pzmap.read_density(LOT)
        self.assertEqual(len(d), 1024)
        self.assertEqual(d[12 * 32 + 16], 3)
        self.assertEqual(d[16 * 32 + 12], 1)

    def test_lo_commiteado(self):
        common = json.load(open(os.path.join(pzmap.WEB, "common.json"), encoding="utf-8"))
        head = common["zombies"]
        self.assertEqual((head["w"], head["h"], head["cell"]), (2496, 2016, 8))  # 19968 × 16128 casillas
        self.assertGreaterEqual(head["max"], 1)
        raw = open(os.path.join(pzmap.WEB, "zombies.bin"), "rb").read()
        self.assertLess(len(raw), 150_000)
        g = zlib.decompress(raw, -15)
        self.assertEqual(len(g), head["w"] * head["h"])
        self.assertEqual(g[1200 * head["w"] + 1324], 3)
        self.assertEqual(g[1196 * head["w"] + 1328], 1)
        self.assertEqual(max(g), head["max"])
        # Entre 2 % y 6 % de los chunks tienen algo (3,6 % en la 42.21): un parche que lo vacíe o lo llene salta acá.
        self.assertTrue(0.02 < sum(1 for v in g if v) / len(g) < 0.06)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `python -m unittest games/zomboid/tools/tests/test_map_density.py -v` (desde la raíz del worktree)
Expected: FAIL / ERROR con `AttributeError: module 'map' has no attribute 'density_grid'` (y `read_density`).

- [ ] **Step 3: Implementar en `map.py`**

En los imports, sumar `zlib`. Junto a `LOT_CELL`:

```python
# La densidad de zombis del .lotheader: un byte por chunk de 8×8 casillas, 32×32 chunks por celda de 256.
DENSITY_CHUNK = 8
DENSITY_SIDE = LOT_CELL // DENSITY_CHUNK
```

Debajo de `write_json`:

```python
def write_bytes(name, data):
    """Como write_json, para un binario de games/zomboid/data/map: no se reescribe si no cambió."""
    path = os.path.join(DATA, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = None
    if os.path.exists(path):
        with open(path, "rb") as f:
            old = f.read()
    if old != data:
        with open(path, "wb") as f:
            f.write(data)
    return path
```

En la sección `.lotheader`, después de `read_lotheader`:

```python
def read_density(path):
    """
    Los 1.024 bytes finales de un .lotheader: la densidad de zombis de sus 32×32 chunks. `read_lotheader` (que corre
    antes, en `buildings`) ya verificó que el archivo termina justo ahí; acá sólo se leen, sin volver a recorrerlo.
    """
    with open(path, "rb") as f:
        f.seek(-DENSITY_SIDE * DENSITY_SIDE, os.SEEK_END)
        return f.read()


def density_grid(cells):
    """
    {(cx, cy): 1.024 bytes} → (ancho, alto, grilla) del mundo entero en chunks, fila por fila, origen (0, 0).
    El archivo guarda el chunk (lx, ly) de la celda en el byte lx*32 + ly (columna por columna): así lo lee
    IsoMetaGrid$MetaGridLoaderThread.loadCell en la 42.21. Las celdas que no tienen .lotheader quedan en cero.
    """
    w = (max(cx for cx, _ in cells) + 1) * DENSITY_SIDE
    h = (max(cy for _, cy in cells) + 1) * DENSITY_SIDE
    grid = bytearray(w * h)
    for (cx, cy), b in cells.items():
        for lx in range(DENSITY_SIDE):
            x = cx * DENSITY_SIDE + lx
            for ly, v in enumerate(b[lx * DENSITY_SIDE:(lx + 1) * DENSITY_SIDE]):
                if v:
                    grid[(cy * DENSITY_SIDE + ly) * w + x] = v
    return w, h, grid


def zombie_density():
    """
    games/zomboid/data/map/web/zombies.bin: la grilla de densidad de zombis (un byte por chunk de 8×8 casillas, fila
    por fila) comprimida con deflate crudo, que el navegador abre con DecompressionStream("deflate-raw"). 68 KB en la
    42.21 contra 5 MB crudos: casi todo el mapa es cero.

    Es la densidad que trae el mapa, no una cuenta: el juego la multiplica por el ruido Voronoi de cada mundo, la
    ignora con la distribución "Uniforme" y la cantidad total sale de la configuración de la partida.
    Devuelve (cabecera para common.json, ruta escrita, chunks con algo).
    """
    files = glob.glob(os.path.join(WORLD, "*.lotheader"))
    cells = {tuple(map(int, os.path.basename(p)[:-10].split("_"))): read_density(p) for p in files}
    w, h, grid = density_grid(cells)
    z = zlib.compressobj(9, zlib.DEFLATED, -15)
    path = write_bytes("web/zombies.bin", z.compress(bytes(grid)) + z.flush())
    return {"w": w, "h": h, "cell": DENSITY_CHUNK, "max": max(grid)}, path, sum(1 for v in grid if v)
```

`write_meta`: cambiar `if f.endswith(".json"):` por `if f.endswith((".json", ".bin")):` y sumar a su docstring "y web/zombies.bin".

`write_web`: firma `def write_web(vec, zd, bd, lbs, st, stl, stamps, sp, items, zdefs, zombies):`; en `common` sumar `"zombies": zombies,`; en el docstring, la línea de `common.json` suma `zombies` y se agrega:

```
      zombies.bin        la densidad de zombis (ver zombie_density): deflate crudo de w*h bytes, fila por fila, un byte
                         por chunk de `cell`×`cell` casillas desde (0, 0); common.json trae zombies = { w, h, cell, max }.
```

En el docstring del módulo, debajo de la línea de `web/**`, la misma idea en una línea:
`games/zomboid/data/map/web/zombies.bin  la densidad de zombis por chunk de 8×8 (de los .lotheader), comprimida`.

`main`, en "Datos para la web", antes de `write_web`:

```python
    zh, zp, znz = zombie_density()
    print(f"  {rel(zp)}: {kb(zp):.0f} KB · {zh['w']}×{zh['h']} chunks de {zh['cell']}×{zh['cell']}, {znz} con zombis, "
          f"máximo {zh['max']}")
    if (zh["w"] * zh["cell"], zh["h"] * zh["cell"]) != (19968, 16128):
        print("  ← ¡LA GRILLA NO CUBRE EL MAPA DE LAS TESELAS (19968×16128)!")
    w = write_web(vec, zd, bd, lbs, st, stl, stamps, sp, items, zdefs, zh)
```

- [ ] **Step 4: Regenerar y correr los tests**

Run: `python games/zomboid/tools/map.py --sin-teselas` y después `python -m unittest discover -s games/zomboid/tools/tests -v`
Expected: la línea `games/zomboid/data/map/web/zombies.bin: 68 KB · 2496×2016 chunks de 8×8, 148819 con zombis, máximo 10`; `meta.json` dice "cambiaron"; todos los tests en verde (los de `test_loot.py` también).

Después, desde `site/`: `npx vitest run test/zomboidMapData.test.ts test/zomboidMapPublish.test.ts`
Expected: PASS (`common.json` sigue por debajo de 500 KB; el `lastmod` del Mapa sigue saliendo de `meta.json`).

`git status --short games/zomboid` tiene que mostrar sólo `zombies.bin`, `common.json` y `meta.json` como cambiados (más el código). Si aparece otro JSON del mapa cambiado, otro agente corrió `map.py` con cambios suyos: no commitearlo, avisar.

- [ ] **Step 5: Commit**

```bash
git add games/zomboid/tools/map.py games/zomboid/tools/tests/test_map_density.py games/zomboid/data/map/web/zombies.bin games/zomboid/data/map/web/common.json games/zomboid/data/map/meta.json
git commit -m "feat(zomboid): map.py escribe la densidad de zombis por chunk (zombies.bin, 68 KB) para la capa del Mapa" -- games/zomboid/tools/map.py games/zomboid/tools/tests/test_map_density.py games/zomboid/data/map/web/zombies.bin games/zomboid/data/map/web/common.json games/zomboid/data/map/meta.json
```

---

### Task 2: La capa en el visor (`capas=densidad`)

**Files:**
- Create: `site/src/zomboid/map/heat.ts` (lógica pura + carga; viaja con el visor)
- Modify: `site/src/zomboid/map/data.ts` (tipo `DensityHeader`, `MapCommon.zombies`), `site/src/zomboid/map/url.ts` (`LAYERS` + alias), `site/src/zomboid/map/layerMeta.ts` (color y opacidad, sello, `layerCount` → `number | null`), `site/src/zomboid/map/overlays.ts` (la `GridLayer`), `site/src/zomboid/map/Legend.tsx` (sólo: no mostrar cifra si `layerCount` es `null`), `site/src/zomboid/map/copy.ts` (nombre y "para qué" mínimos, porque `names`/`about` son `Record<LayerId, string>`), `site/src/styles/zomboid-map.css` (`.pzm-heat-tile`)
- Create: `site/test/zomboidMapHeat.test.ts`
- Modify: `site/test/zomboidMapUrl.test.ts` (la lista de `LAYERS` y la línea de alias en inglés), `site/test/zomboidMap.test.ts` (`"./heat"` en la lista `viewerOnly` de "lo que viaja en el chunk de la pestaña": ningún archivo de la pestaña lo importa)

**Interfaces:**
- Consumes (Task 1): `web/zombies.bin` y `common.zombies = { w, h, cell, max }`.
- Produces:
  - `url.ts`: `LAYERS` = `[…, "zombis", "densidad", "historias", …]`; alias `density`, `heatmap`, `heat`, `calor` → `"densidad"`.
  - `data.ts`: `export interface DensityHeader { w: number; h: number; cell: number; max: number }`; `MapCommon.zombies: DensityHeader`.
  - `layerMeta.ts`: `HEAT_RGB: [number, number, number]`, `heatAlpha(v: number, max: number): number` (0–1), `HEAT_KEY: string[]` (5 colores CSS de menos a más), `LAYER_STAMP.densidad = "skull"`, `LAYER_COLOR.densidad = "#b3261e"`, `layerCount(id, counts): number | null` (`null` para `densidad`).
  - `heat.ts`: `HEAT_LEVELS = 4`, `interface DensityLevel { w: number; h: number; v: Uint8Array }`, `inflateDensity(packed: Uint8Array, size: number): Promise<Uint8Array>`, `densityPyramid(v: Uint8Array, w: number, h: number, levels?: number): DensityLevel[]`, `heatLevel(z: number, cell?: number): number`, `heatWindow(level: DensityLevel, x0: number, y0: number, n: number, max: number): Uint8ClampedArray`, `loadDensity(head: DensityHeader): Promise<DensityLevel[]>`.

- [ ] **Step 1: Escribir los tests que fallan** (`site/test/zomboidMapHeat.test.ts`)

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DensityHeader } from "../src/zomboid/map/data";
import { densityPyramid, heatLevel, heatWindow, HEAT_LEVELS, inflateDensity } from "../src/zomboid/map/heat";
import { HEAT_KEY, heatAlpha, layerCount } from "../src/zomboid/map/layerMeta";
import { MAP_H, MAP_W } from "../src/zomboid/map/url";

/**
 * La capa de densidad de zombis del Mapa (2026-10-01): la grilla que escribe `map.py` (`web/zombies.bin`, deflate crudo,
 * un byte por chunk de 8×8 casillas) y cómo se pinta. Con el archivo real: si un parche lo cambia de forma, salta acá.
 */
const WEB = join(__dirname, "..", "..", "games", "zomboid", "data", "map", "web");
const head = (JSON.parse(readFileSync(join(WEB, "common.json"), "utf-8")) as { zombies: DensityHeader }).zombies;

describe("la grilla de densidad", () => {
  it("cubre el mapa de las teselas y se abre con DecompressionStream", async () => {
    expect(head.w * head.cell).toBe(MAP_W);
    expect(head.h * head.cell).toBe(MAP_H);
    const v = await inflateDensity(new Uint8Array(readFileSync(join(WEB, "zombies.bin"))), head.w * head.h);
    expect(v.length).toBe(head.w * head.h);
    // El mismo chunk que fija el test de Python (Muldraugh, casillas 10592–10599 × 9600–9607), y su traspuesto.
    expect(v[1200 * head.w + 1324]).toBe(3);
    expect(v[1196 * head.w + 1328]).toBe(1);
    // Con un bucle: `Math.max(...v)` con 5 millones de argumentos revienta la pila.
    let top = 0;
    for (const x of v) if (x > top) top = x;
    expect(top).toBe(head.max);
  });

  it("si el tamaño no coincide, corta", async () => {
    await expect(inflateDensity(new Uint8Array(readFileSync(join(WEB, "zombies.bin"))), 10)).rejects.toThrow(/densidad/);
  });
});

describe("la pirámide y la ventana", () => {
  // 4×3, con un 7 aislado: el máximo de cada bloque de 2×2 no lo pierde.
  const v = Uint8Array.from([0, 0, 0, 7, 1, 0, 0, 0, 0, 2, 0, 0]);
  it("cada nivel es el máximo de 2×2 del anterior, redondeando para arriba", () => {
    const p = densityPyramid(v, 4, 3, 3);
    expect(p.map((l) => [l.w, l.h])).toEqual([[4, 3], [2, 2], [1, 1]]);
    expect([...p[1].v]).toEqual([1, 7, 2, 0]);
    expect([...p[2].v]).toEqual([7]);
  });

  it("el nivel da al menos un píxel por celda", () => {
    expect([6, 4, 2, 1, 0, -1, -2].map((z) => heatLevel(z))).toEqual([0, 0, 0, 0, 1, 2, 3]);
    expect(heatLevel(-5)).toBe(HEAT_LEVELS - 1);
  });

  it("los ceros y lo de afuera van transparentes; más densidad, más lápiz", () => {
    const px = heatWindow({ w: 4, h: 3, v }, 2, 0, 3, 7);
    const a = (x: number, y: number) => px[(y * 3 + x) * 4 + 3];
    expect(a(0, 0)).toBe(0); // (2, 0) = 0
    expect(a(1, 0)).toBe(Math.round(heatAlpha(7, 7) * 255)); // (3, 0) = 7
    expect(a(2, 0)).toBe(0); // x = 4, afuera
    expect(a(1, 2)).toBe(0); // (3, 2) = 0
    expect([...px.subarray(4, 7)]).toEqual([179, 38, 30]);
  });

  it("la opacidad sube con el valor y la clave va de menos a más", () => {
    const steps = [0, 1, 2, 3, 5, 10].map((n) => heatAlpha(n, 10));
    expect(steps[0]).toBe(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps[5]).toBeLessThanOrEqual(0.9); // el satélite se sigue viendo debajo
    expect(HEAT_KEY).toHaveLength(5);
  });

  it("la capa no tiene cifra en la leyenda", () => {
    expect(layerCount("densidad", { zones: {}, spawns: 0, stashes: 0 })).toBeNull();
  });
});
```

En `site/test/zomboidMapUrl.test.ts`: en la lista de la línea ~170 sumar `"densidad"` después de `"zombis"`; la línea ~189 pasa a `readMapUrl("?layers=stashes,vehicles,forage,animals,basements,zombies,density,stories,loot,buildings,spawns", "")`, y sumar:

```ts
  it("la densidad también entra con sus nombres en inglés", () => {
    expect(readMapUrl("?layers=heatmap", "")!.layers).toEqual(["densidad"]);
    expect(writeMapUrl(state({ layers: ["densidad", "zombis"] }))).toContain("&capas=zombis,densidad");
  });
```

En `site/test/zomboidMap.test.ts`, en el test "la página, la leyenda, la hoja del escondite, el buscador y sus módulos no importan lo del visor", sumar `"./heat"` al arreglo `viewerOnly` y, abajo, `expect(imports("overlays.ts")).toContain("./heat");`.

- [ ] **Step 2: Correrlos y ver que fallan**

Run (desde `site/`): `npx vitest run test/zomboidMapHeat.test.ts test/zomboidMapUrl.test.ts test/zomboidMap.test.ts`
Expected: FAIL (no existe `../src/zomboid/map/heat`; `"densidad"` no está en `LAYERS`).

- [ ] **Step 3: Implementar**

`url.ts`: `"densidad"` en `LAYERS` justo después de `"zombis"` (el orden de la leyenda y de `capas=`); en `LAYER_ALIASES`, `density: "densidad", heatmap: "densidad", heat: "densidad", calor: "densidad"`. Sumar al comentario de `LAYERS` que `densidad` es la densidad de zombis por chunk.

`data.ts`:

```ts
/** La grilla de densidad de zombis (`web/zombies.bin`, ver `zombie_density` de `map.py`): `w`×`h` chunks de `cell` casillas. */
export interface DensityHeader {
  w: number;
  h: number;
  cell: number;
  /** El valor más alto del mapa: la capa pinta relativo a él. */
  max: number;
}
```
y en `MapCommon`, `zombies: DensityHeader;`.

`layerMeta.ts` (va en el chunk de la pestaña: sólo lo chico que necesita la leyenda):

```ts
// ─────────────────────────────── densidad de zombis ───────────────────────────────

/** El lápiz rojo de la Libreta (`--pz-pencil`): la densidad se pinta como un sombreado a lápiz. */
export const HEAT_RGB: [number, number, number] = [179, 38, 30];

/**
 * La opacidad (0–1) de un chunk con densidad `v`, relativa al máximo del mapa. Raíz cuadrada: en la 42.21 casi todos
 * los chunks con zombis valen 1 a 3 de 10 y en lineal un pueblo entero quedaba casi invisible. Tope 0,85: el satélite y
 * el papel se siguen leyendo debajo.
 */
export function heatAlpha(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return 0.2 + 0.65 * Math.sqrt(Math.min(1, v / max));
}

/** La clave de la leyenda, de menos a más zombis. */
export const HEAT_KEY: string[] = [0.1, 0.3, 0.5, 0.75, 1].map((t) => `rgba(${HEAT_RGB.join(",")},${heatAlpha(t, 1).toFixed(2)})`);
```

`LAYER_STAMP` suma `densidad: "skull"`; `LAYER_COLOR` suma `densidad: "#b3261e"`. `layerCount` pasa a devolver `number | null`, con `if (id === "densidad") return null;` primero (comentario: no hay una cifra honesta; la densidad no es una cuenta). `Legend.tsx`: `{n !== null && <span className="pzm-layer-n">{num(n)}</span>}` con `const n = layerCount(id, counts);`.

`copy.ts`, mínimo para que compile (la Task 3 lo completa): EN `names.densidad: "Zombie density"`, `about.densidad: "Where the map puts more zombies when the world starts."`; ES `names.densidad: "Densidad de zombis"`, `about.densidad: "Dónde el mapa pone más zombis al arrancar el mundo."`.

`heat.ts`:

```ts
/**
 * La capa "Densidad de zombis" del Mapa de Project Zomboid (2026-10-01): la grilla que escribe `map.py` en
 * `web/zombies.bin` (un byte por chunk de 8×8 casillas, deflate crudo; ver `zombie_density`) y cómo se pinta. Es la
 * densidad relativa que trae el mapa, no una cuenta: el juego la mezcla con el azar de cada mundo y la configuración.
 *
 * Lógica pura salvo `loadDensity` (que pide el archivo); se prueba en `test/zomboidMapHeat.test.ts`. Sólo la usa
 * `overlays.ts`, así que viaja con el visor y no en el chunk de la pestaña.
 */
import zombiesUrl from "@zomboid/map/web/zombies.bin?url";
import type { DensityHeader } from "./data";
import { HEAT_RGB, heatAlpha } from "./layerMeta";
import { pxPerTile } from "./paper";

/** Niveles de la pirámide: con 4, al zoom −2 (el más lejano) cada celda del último nivel es un píxel. */
export const HEAT_LEVELS = 4;

export interface DensityLevel {
  w: number;
  h: number;
  v: Uint8Array;
}

/** Abre `zombies.bin`. Sin `DecompressionStream` (navegadores viejos) usa el inflador propio de Valheim. */
export async function inflateDensity(packed: Uint8Array, size: number): Promise<Uint8Array> {
  let out: Uint8Array;
  if (typeof DecompressionStream === "undefined") {
    const { inflateRaw } = await import("../../valheimMap/saves/inflate");
    out = inflateRaw(packed, size);
  } else {
    const stream = new Blob([packed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (out.length !== size) throw new Error(`densidad: ${out.length} bytes en vez de ${size}`);
  return out;
}

/**
 * La grilla y sus reducciones a la mitad, por máximo y no por promedio: de lejos un pueblo chico con zombis tiene que
 * seguir viéndose, y el promedio con el campo vacío alrededor lo borraba.
 */
export function densityPyramid(v: Uint8Array, w: number, h: number, levels = HEAT_LEVELS): DensityLevel[] {
  const out: DensityLevel[] = [{ w, h, v }];
  for (let k = 1; k < levels; k++) {
    const p = out[k - 1];
    const nw = Math.ceil(p.w / 2);
    const nh = Math.ceil(p.h / 2);
    const nv = new Uint8Array(nw * nh);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const s = p.v[y * p.w + x];
        const i = (y >> 1) * nw + (x >> 1);
        if (s > nv[i]) nv[i] = s;
      }
    }
    out.push({ w: nw, h: nh, v: nv });
  }
  return out;
}

/** El nivel para el zoom `z` del visor: el primero que da al menos un píxel por celda (un chunk mide `cell` casillas). */
export const heatLevel = (z: number, cell = 8): number =>
  Math.min(HEAT_LEVELS - 1, Math.max(0, Math.ceil(-Math.log2(pxPerTile(z) * cell))));

/** Las celdas [x0, x0+n) × [y0, y0+n) del nivel en RGBA (n×n): los ceros y lo que cae fuera del mapa, transparentes. */
export function heatWindow(level: DensityLevel, x0: number, y0: number, n: number, max: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * n * 4);
  const alpha = new Uint8ClampedArray(256);
  for (let v = 1; v < 256; v++) alpha[v] = Math.round(heatAlpha(v, max) * 255);
  const [r, g, b] = HEAT_RGB;
  for (let y = 0; y < n; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= level.h) continue;
    for (let x = 0; x < n; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= level.w) continue;
      const v = level.v[sy * level.w + sx];
      if (!v) continue;
      const o = (y * n + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = alpha[v];
    }
  }
  return out;
}

let pending: Promise<DensityLevel[]> | null = null;
/** Pide `zombies.bin` una vez (la primera vez que se prende la capa) y arma la pirámide. Un corte de red no queda pegado. */
export function loadDensity(head: DensityHeader): Promise<DensityLevel[]> {
  pending ??= fetch(zombiesUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`zombies.bin: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => inflateDensity(new Uint8Array(buf), head.w * head.h))
    .then((v) => densityPyramid(v, head.w, head.h));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
```

Si `tsc` no reconoce `?url` en un `.bin` (lo declara `vite/client`, que está en `types` de `site/tsconfig.json`), verificar que `vite.config.ts` no lo excluye; no hace falta `assetsInclude` para `?url`.

`overlays.ts` (dentro de `mountOverlays`, después del bloque de zonas; importar `heatLevel`, `heatWindow`, `loadDensity` de `./heat` y `MIN_ZOOM` de `./url`):

```ts
  // ── Densidad de zombis ──
  // Abajo de las zonas (405) y arriba de las teselas: es un sombreado del terreno. `multiply`, como un lápiz sobre el
  // papel: oscurece lo de abajo sin taparlo.
  const heatPane = map.createPane("pzm-heat");
  heatPane.style.zIndex = "402";
  heatPane.style.pointerEvents = "none";
  heatPane.style.mixBlendMode = "multiply";
  let heat: Leaflet.GridLayer | null = null;
  const Heat = L.GridLayer.extend({
    createTile(this: Leaflet.GridLayer, coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
      const tile = L.DomUtil.create("canvas", "pzm-heat-tile") as HTMLCanvasElement;
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const head = common.zombies;
      loadDensity(head).then(
        (levels) => {
          const k = heatLevel(coords.z, head.cell);
          const span = head.cell * 2 ** k; // casillas por celda del nivel
          const rect = tileRect(coords.x, coords.y, coords.z, size.x);
          // Siempre exacto: la tesela mide 2^(12−z) casillas y la celda 8·2^k, con k = max(0, 1 − z).
          const n = Math.round((rect.x1 - rect.x0) / span);
          const px = heatWindow(levels[k], Math.round(rect.x0 / span), Math.round(rect.y0 / span), n, head.max);
          const src = document.createElement("canvas");
          src.width = src.height = n;
          src.getContext("2d")!.putImageData(new ImageData(px, n, n), 0, 0);
          const ctx = tile.getContext("2d");
          if (ctx) {
            // Sin suavizado: cada cuadrito es un chunk del juego (de cerca) o el máximo de varios (de lejos).
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, 0, 0, size.x, size.y);
          }
          done(undefined, tile);
        },
        (err: Error) => done(err, tile),
      );
      return tile;
    },
  }) as new (options: Leaflet.GridLayerOptions) => Leaflet.GridLayer;

  const syncHeat = () => {
    const want = on.has("densidad");
    if (!want) {
      heat?.remove();
      heat = null;
      return;
    }
    if (heat) return;
    heat = new Heat({
      bounds: opts.bounds,
      // A propósito: el `minZoom` de GridLayer es 0 si no se dice, y la densidad se ve también con el condado entero.
      minZoom: MIN_ZOOM,
      maxZoom: opts.maxZoom,
      noWrap: true,
      pane: "pzm-heat",
      className: "pzm-heat",
      updateWhenZooming: false,
    }).addTo(map);
  };
```

Llamar `syncHeat()` en `setLayers` junto a `syncZones()`, y `heat?.remove()` en `destroy`. La capa no depende de la base ni del idioma: `setBase`/`setLang` no la tocan.

`zomboid-map.css`: `.pzm-heat-tile { image-rendering: pixelated; }` (cuando Leaflet estira la tesela entre zooms, que no se lave).

- [ ] **Step 4: Correr los tests y el tipado**

Run (desde `site/`): `npx tsc -b` y `npx vitest run test/zomboidMap`
Expected: sin errores de tipos; `zomboidMapHeat`, `zomboidMapUrl`, `zomboidMapLayers`, `zomboidMap`, `zomboidMapData`, `zomboidMapPublish` en verde.

Revisión rápida en el navegador (servidor del worktree, `vestigo-zomboid` en `.claude/launch.json`, puerto 5178): `http://localhost:5178/es/project-zomboid/mapa?x=12600&y=3600&z=1&capas=densidad`. Louisville tiene que verse sombreada en rojo; con `z=-2`, el condado entero con los pueblos marcados; con `z=5` en Muldraugh (`x=10600&y=9600`), cuadritos de 8×8 casillas alineados con las calles. En la pestaña de red: `zombies-*.bin` se pide una sola vez y no se pide al abrir el mapa sin la capa. La consola, sin errores.

- [ ] **Step 5: Commit**

```bash
git add site/src/zomboid/map/heat.ts site/src/zomboid/map/data.ts site/src/zomboid/map/url.ts site/src/zomboid/map/layerMeta.ts site/src/zomboid/map/overlays.ts site/src/zomboid/map/Legend.tsx site/src/zomboid/map/copy.ts site/src/styles/zomboid-map.css site/test/zomboidMapHeat.test.ts site/test/zomboidMapUrl.test.ts site/test/zomboidMap.test.ts
git commit -m "feat(zomboid): la capa de densidad de zombis en el visor del Mapa (capas=densidad), a lápiz rojo por chunk" -- site/src/zomboid/map/heat.ts site/src/zomboid/map/data.ts site/src/zomboid/map/url.ts site/src/zomboid/map/layerMeta.ts site/src/zomboid/map/overlays.ts site/src/zomboid/map/Legend.tsx site/src/zomboid/map/copy.ts site/src/styles/zomboid-map.css site/test/zomboidMapHeat.test.ts site/test/zomboidMapUrl.test.ts site/test/zomboidMap.test.ts
```

---

### Task 3: La leyenda, los textos, la descripción y la revisión final

**Files:**
- Modify: `site/src/zomboid/map/Legend.tsx` (la clave "menos ↔ más" y la nota de la distribución uniforme), `site/src/zomboid/map/copy.ts` (textos completos en/es, `layers.heat`), `site/src/styles/zomboid-map.css` (la clave), `site/src/zomboidCopy.ts` (descripción de la pestaña Mapa en/es)
- Modify: `site/test/zomboidMapLayers.test.ts` (la leyenda en el servidor trae la capa y la clave en los dos idiomas)

**Interfaces:**
- Consumes (Task 2): `HEAT_KEY`, `LAYER_STAMP.densidad`, `layerCount(...) === null` para `densidad`, `"densidad"` en `LAYERS`.
- Produces: `MapCopy["layers"]["heat"] = { less: string; more: string; uniform: string }`.

- [ ] **Step 1: Test que falla** (en `site/test/zomboidMapLayers.test.ts`, dentro de `describe("la leyenda y la hoja del escondite, en el servidor")`, que ya tiene el helper `legend(lang, layers, zoom?)`)

```ts
  it("la densidad de zombis: apagada, sólo el nombre; prendida, la clave menos/más y nunca una cuenta", () => {
    expect(legend("es", [])).not.toContain("menos zombis");
    for (const [lang, name, less, more] of [
      ["es", "Densidad de zombis", "menos zombis", "más zombis"],
      ["en", "Zombie density", "fewer zombies", "more zombies"],
    ] as const) {
      const html = legend(lang, ["densidad"]);
      expect(html).toContain(name);
      expect(html).toContain(less);
      expect(html).toContain(more);
      expect(html).not.toMatch(/\d+ zombi/); // nunca una cuenta
      expect(html).not.toMatch(/game files|archivos del juego/i);
    }
  });
```

Y en `site/test/zomboidSeo.test.ts` no hace falta tocar nada: la descripción nueva cumple su regla (contiene el nombre, más de 80 caracteres). Correr para comprobarlo en el Step 4.

- [ ] **Step 2: Correrlo y ver que falla**

Run (desde `site/`): `npx vitest run test/zomboidMapLayers.test.ts`
Expected: FAIL (no aparece "menos zombis" / "fewer zombies").

- [ ] **Step 3: Implementar**

`copy.ts`, EN:

```ts
      densidad: "Zombie density",
```
```ts
      densidad:
        "Where the map puts more zombies when the world starts. It's a proportion, not a headcount: how many depends on the run's settings, each world adds a little randomness, and then they roam.",
```
```ts
    heat: {
      less: "fewer zombies",
      more: "more zombies",
      uniform: "With the “Uniform” zombie distribution setting, the game ignores this and spreads them evenly.",
    },
```

ES:

```ts
      densidad: "Densidad de zombis",
```
```ts
      densidad:
        "Dónde el mapa pone más zombis al arrancar el mundo. Es una proporción, no una cuenta: cuántos hay depende de la configuración de la partida, cada mundo le suma un poco de azar y después caminan.",
```
```ts
    heat: {
      less: "menos zombis",
      more: "más zombis",
      uniform: "Con la distribución de zombis «Uniforme», el juego no usa esto y los reparte parejo.",
    },
```

`Legend.tsx`, dentro del `<li>`, después del `about`:

```tsx
              {on && id === "densidad" && (
                <>
                  <div className="pzm-heat-key">
                    <span className="pzm-heat-end">{t.layers.heat.less}</span>
                    <span className="pzm-heat-bar" aria-hidden="true">
                      {HEAT_KEY.map((c) => (
                        <span key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="pzm-heat-end">{t.layers.heat.more}</span>
                  </div>
                  <p className="pzm-layer-about">{t.layers.heat.uniform}</p>
                </>
              )}
```

`zomboid-map.css` (grilla de tres columnas: las dos puntas nunca se cortan y la barra se achica; sin bordes, la barra va sobre el papel):

```css
.pzm-heat-key {
  display: grid;
  grid-template-columns: auto minmax(24px, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin: 4px 0 2px;
  font: 700 17px / 1 "Caveat", cursive;
  color: var(--pz-pencil);
}
.pzm-heat-end { white-space: nowrap; }
.pzm-heat-bar { display: flex; height: 12px; background: var(--pz-paper-2); }
.pzm-heat-bar > span { flex: 1 1 0; }
```

`zomboidCopy.ts`, descripción del Mapa:
- EN: `"Interactive Project Zomboid Build 42 map of Knox County: every building and street, zombie density, vehicle and foraging zones, spawn points and stashes."` (153 caracteres)
- ES: `"Mapa interactivo de Project Zomboid Build 42: cada edificio y calle de Knox County, densidad de zombis, zonas de vehículos y de recolección, y escondites."` (154 caracteres)

Los títulos no cambian.

- [ ] **Step 4: Tests, build y peso**

Run (desde `site/`): `npx vitest run test/zomboid` y `npm run build`
Expected: todo en verde (salvo `test/deadlock.test.ts`, ajeno). En la salida del build: el chunk `ZomboidMap` crece menos de 0,5 KB gz respecto de 11,7 KB; `heat` viaja dentro del chunk del visor/capas, no en el de la pestaña; aparece `assets/zombies-<hash>.bin` (~68 KB). `grep -l "zombies-" site/dist/es/project-zomboid.html site/dist/es.html` no encuentra nada (la portada no lo precarga). `site/dist/es/project-zomboid/mapa.html` tiene "Densidad de zombis" en el prerender de la leyenda y la descripción nueva en el `<meta name="description">`. El `<lastmod>` del Mapa en `site/dist/sitemaps/zomboid.xml` es el `extractedAt` de `games/zomboid/data/map/meta.json` (la fecha de la Task 1); las demás URLs no cambian.

- [ ] **Step 5: Revisión en el navegador** (servidor del worktree, puerto 5178, en el panel Browser de la app; no redimensionar el Chrome de ZoTaD)

- Escritorio: `/es/project-zomboid/mapa` → prender "Densidad de zombis" en la hoja de Capas: la clave aparece, la dirección suma `capas=densidad`, Louisville y Muldraugh se ven sombreadas; base satelital y papel; zoom −2 a 6 (de lejos manchas, de cerca cuadritos de chunk); apagarla la saca y no vuelve a pedir el `.bin`.
- Con otra capa encima (escondites, zonas de zombis): los sellos y las zonas se siguen viendo y tocando.
- `/en/project-zomboid/map?capas=densidad`: los textos en inglés.
- Celular (emulación 375×812 del panel Browser, después volver a `desktop`): la hoja de capas, la clave entera sin cortar palabras, sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).
- Consola sin errores.

- [ ] **Step 6: Commit**

```bash
git add site/src/zomboid/map/Legend.tsx site/src/zomboid/map/copy.ts site/src/styles/zomboid-map.css site/src/zomboidCopy.ts site/test/zomboidMapLayers.test.ts
git commit -m "feat(zomboid): la leyenda explica la densidad de zombis (menos/más, proporción y no cuenta) y la descripción del Mapa la nombra" -- site/src/zomboid/map/Legend.tsx site/src/zomboid/map/copy.ts site/src/styles/zomboid-map.css site/src/zomboidCopy.ts site/test/zomboidMapLayers.test.ts
```

---

## Decisiones abiertas (con recomendación)

1. **Nombre e id:** "Densidad de zombis" / "Zombie density", `capas=densidad`. Es lo que se busca ("project zomboid zombie density map") y no se confunde con "Zombis por tipo" (`zombis`). *Recomendado así.*
2. **Aspecto de cerca:** cuadritos nítidos por chunk (lo que el juego cuenta, alineados con las calles) o mancha difusa (más "mapa de calor", pero corre la densidad de una cuadra a la de al lado). *Recomendado: cuadritos.*
3. **De lejos:** máximo de cada bloque (un pueblo chico no desaparece) o promedio (más fiel a "cuántos por área", pero el campo vacío borra los pueblos). *Recomendado: máximo.*
4. **Nota al pasar el mouse** ("acá: muchos / pocos"): queda afuera. La clave ya lo dice y un número por chunk invitaría a leerlo como cuenta. *Recomendado: no hacerla ahora.*
