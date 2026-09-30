# Calculadora de drops de Diablo II — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `/d2r/drops`: la calculadora de drops de D2R con tres modos (¿Dónde lo farmeo?, ¿Qué suelta?, Simulador), una ficha por jefe o superúnico (`/d2r/drops/<id>`) y el bloque "Dónde farmearlo" en las fichas de únicos, piezas de conjunto y runas.

**Architecture:**
- **Extractor Python** (`games/d2r/tools/drops.py`): traduce las tablas del juego a `games/d2r/data/drops/drops.json`.
- **Motor TypeScript** (`site/src/d2r/drops/`), con funciones puras:
  - `rules.ts`: fórmulas del juego;
  - `engine.ts`: la chance exacta con el tope de 6 ítems;
  - `places.ts`: jefes, superúnicos, áreas y Zonas de Terror;
  - `simulate.ts`: el cofre.
- **Script de Node** con el mismo motor: precalcula los bloques de la wiki.
- **UI:** la pestaña `drops` de la sección, con el patrón de las otras pestañas de D2 (chunk con `preload` y estado en la dirección).

**Tech Stack:**
- Python 3 + CascLib (ya en `games/d2r/tools`);
- TypeScript + React 18 + Vite + vitest;
- vite-node, que viene con vitest, para el script.

## Global Constraints

- **Spec:** `docs/design/2026-09-29-d2r-calculadora-drops.md`. Las decisiones ya están tomadas ahí; este plan las implementa.
- **Sin commits:** ZoTaD pide los commits. Cada tarea termina con los tests en verde y **sin** `git commit`.
- **Textos:**
  - Sólo en `site/src/d2rCopy.ts`, en EN y ES.
  - Español con voseo, como el resto de la sección ("Buscá", "Elegí").
  - Nombres del juego en es-MX.
- **Procedencia:** nada de "sacado de los archivos del juego" ni similar en la UI (memoria `no-explicar-de-donde-salen-datos`).
- **Tarjetas y texto:**
  - Sin bordes ni barras de color en las tarjetas: el color va en el texto o en el fondo.
  - Las palabras no se cortan: nada de `overflow-wrap: anywhere` ni `word-break`. Lo que no entra se achica o baja de línea entre palabras.
- **Celular:** a 375 px nada se sale de la pantalla. Las pestañas bajan de fila; no se deslizan.
- **Código:**
  - Comentarios en español y explicando el porqué, como el resto del repo.
  - Los `.py` de `games/d2r/tools` van con fin de línea CRLF, como los que ya están.
- **Verificación visual:** sólo en el panel Browser de la app, nunca en el Chrome de ZoTaD. No usar `resize_window` salvo en el panel.
- **Comandos:** los tests se corren desde `site/` con `npx vitest run test/<archivo>`. El chequeo de tipos es `npx tsc -b`.
- **Referencias de los tests** (corregido el 2026-09-29, después de la Task 1):
  - Las principales salen de un evaluador exacto independiente sobre el parche instalado, con y sin el tope de
    6 ítems, y se comparan con tolerancia 1e-6. Está validado contra Silospen sobre sus propias tablas (0,000%)
    y con un Montecarlo.
  - Silospen en vivo (`https://dropcalc.silospen.com/dropcalc.php?type=itemProbabilities&version=D2R_ROW_3_0&decMode=true&…`)
    se usa como ancla sólo donde sigue valiendo, con 1% de tolerancia. Aproxima el tope recortando las tiradas a
    6 y usa tablas anteriores al 3.3.
  - Si un caso no da, se investiga la regla antes de tocar la tolerancia.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `games/d2r/tools/drops.py` (nuevo) | Escribe `games/d2r/data/drops/drops.json` e `index.json`: TCs (más las automáticas), bases, únicos, piezas, itemratio, monstruos, áreas, jefes y superúnicos con su área, y Zonas de Terror |
| `games/d2r/tools/extract.py` | Suma el ícono `quest/a2q6` para la tarjeta de la portada |
| `site/src/d2r/season.ts` (nuevo) | `SEASON`, sacada de `d2rCopy.ts` para que la use el script de Node |
| `site/src/d2r/drops/types.ts` (nuevo) | Tipos de los datos y del motor |
| `site/src/d2r/drops/data.ts` (nuevo) | Carga e índices (`dropData()`, `indexData()`) |
| `site/src/d2r/drops/rules.ts` (nuevo) | NoDrop, calidad, MF, condiciones, Clasificación y mejora de TC |
| `site/src/d2r/drops/engine.ts` (nuevo) | `chancePerKill`, `explainPath`, `reach`, `rollOf` y los elegibles |
| `site/src/d2r/drops/places.ts` (nuevo) | `sourceKill`, `areaKills`, `bestPlaces`, `dropsOf` y `placeKill` |
| `site/src/d2r/drops/simulate.ts` (nuevo) | `mulberry32`, `simulateKill`, `simulateRuns` y `summarize` |
| `site/src/d2r/drops/state.ts` (nuevo) | El estado en la dirección |
| `site/src/d2r/drops/format.ts` (nuevo) | "1 en N" |
| `site/src/d2r/drops/*.tsx` (nuevos) | `DropsControls`, `ItemPicker`, `DropsFarm`, `MfCurve`, `DropLists`, `DropsWhat`, `DropsSim`, `SourcePage` y `FarmBlock` |
| `site/src/d2r/D2rDrops.tsx` (nuevo) | La pestaña |
| `site/src/styles/d2r-drops.css` (nuevo) | Estilos de la calculadora y del bloque |
| `site/scripts/node.config.ts`, `site/scripts/d2-drops.ts` (nuevos) | Precálculo de `games/d2r/data/drops/computed/*.json` |
| `route.ts`, `d2rCopy.ts`, `D2r.tsx`, `areaFiles.ts`, `prerender.ts`, `vite.config.ts`, `d2r/index.ts`, `D2rHome.tsx`, `D2rUniques.tsx`, `D2rSets.tsx`, `D2rRunes.tsx` | Conexión con el resto de la sección |
| `site/test/d2rDrops*.test.ts` (nuevos), `site/test/d2r.test.ts` | Tests |

---

### Task 1: El extractor de drops

> **Corrección tras implementar (2026-09-29), validada contra el código de Silospen.** Las TCs automáticas no son
> sólo `weapN`/`armoN` ni pesan por la `rarity` de cada base:
> - **Familias.** Se arma una por cada tipo de `itemtypes.txt` con `TreasureClass=1` que alguna TC nombra: hoy
>   `weap`, `armo`, `mele` (`mele3`…`mele39`) y `bow` (`bow3`…`bow87`). La pertenencia sigue la cadena de tipos:
>   los arcos de Amazona van en `bow` y las jabalinas en `mele`.
> - **Pesos.** Cada base pesa el `Rarity` de su **tipo** en `itemtypes.txt` (3 casi siempre; 1 para orbes, pieles,
>   arcos de Amazona…).
> - **Qué entra.** Toda base con `spawnable=1`, sin filtrar por `rarity`. Una franja sin bases queda como TC vacía
>   (`{"p": 1, "e": []}`).
>
> Con esas reglas y la tabla de TCs de Silospen, un port de su cuenta reproduce los 20 casos de la Task 3 al
> 0,000%. Con los pesos de la base, el Shako erraba un 62%. El test suma un noveno caso que lo controla.

**Files:**
- Create: `games/d2r/tools/drops.py`
- Modify: `games/d2r/tools/extract.py` (lista de íconos de misiones)
- Test: `site/test/d2rDropsData.test.ts`

**Interfaces:**
- Consumes:
  - `table(c, "x.txt")` y `strings(c)` de `extract.py`;
  - `slug()` y `num()` de `wiki.py`;
  - `games/d2r/data/wiki/uniques.json`, `sets.json` y `bases.json`, así que `wiki.py` tiene que haber corrido.
- Produces:
  - `games/d2r/data/drops/drops.json`, con la forma de `DropData` (Task 2);
  - `games/d2r/data/drops/index.json`: `[{ sec: "drops", id, en, es }]`.

- [ ] **Step 1: Escribir el test de los datos (falla porque no existe el JSON)**

```ts
// site/test/d2rDropsData.test.ts
import { describe, expect, it } from "vitest";
import drops from "../../games/d2r/data/drops/drops.json";
import index from "../../games/d2r/data/drops/index.json";

/**
 * Los datos de la calculadora de drops (2026-09-29): si un parche o un cambio
 * en drops.py rompe una referencia, esto avisa antes que la calculadora.
 */
type RawTc = { p: number; e: [string, number, number[]?][]; g?: number; l?: number };
const D = drops as unknown as {
  tcs: Record<string, RawTc>;
  bases: Record<string, { q: number; qf: number; n: { en: string; es: string } }>;
  uniques: { id: string; key: string; code: string; f?: number }[];
  sets: { id: string; set: string; key: string; code: string }[];
  monsters: Record<string, { tc: string[][] }>;
  areas: { id: number }[];
  sources: { id: string; mon: string; area: number | null; tc?: string[] }[];
  tz: { b: number[][]; boost: number; heraldTc: number[]; maxTier: number };
};

describe("datos de la calculadora de drops", () => {
  const uniqueKeys = new Set(D.uniques.map((u) => u.key));
  const setKeys = new Set(D.sets.map((x) => x.key));

  it("cada entrada de cada TC es otra TC, una base, oro, o un único o pieza por nombre", () => {
    const bad = Object.entries(D.tcs).flatMap(([name, tc]) =>
      tc.e.filter(([t]) => !D.tcs[t] && !D.bases[t] && t !== "gld" && !uniqueKeys.has(t) && !setKeys.has(t)).map(([t]) => `${name} → ${t}`),
    );
    expect(bad).toEqual([]);
  });

  it("las TCs automáticas de armas y armaduras existen", () => {
    expect(D.tcs.weap3.e.length).toBeGreaterThan(0);
    expect(D.tcs.armo3.e.length).toBeGreaterThan(0);
    expect(D.tcs.armo60.e.some(([code]) => code === "uap")).toBe(true); // el Shako (qlvl 58) está entre 58 y 60
  });

  it("Mefisto tira 7 veces y la Condesa tiene tiradas negativas", () => {
    expect(D.tcs["Mephisto (H)"].p).toBe(7);
    expect(D.tcs["Countess (H)"].p).toBe(-2);
  });

  it("cada jefe y superúnico apunta a un área que existe y tiene de dónde soltar", () => {
    const areas = new Set(D.areas.map((a) => a.id));
    for (const s of D.sources) {
      if (s.area !== null) expect(areas.has(s.area), s.id).toBe(true);
      const tc = s.tc ? s.tc[2] : D.monsters[s.mon].tc[2][0];
      expect(D.tcs[tc], `${s.id}: ${tc}`).toBeDefined();
    }
    expect(D.sources.map((s) => s.id)).toEqual(expect.arrayContaining(["mephisto", "baal", "the-countess", "pindleskin", "diablo-clone"]));
  });

  it("los únicos del sorteo tienen el id de la wiki y los de nombre fijo van aparte", () => {
    const pool = D.uniques.filter((u) => !u.f);
    expect(pool).toHaveLength(403);
    expect(pool.find((u) => u.key === "Harlequin Crest")?.id).toBe("harlequin-crest");
    expect(D.sets.find((x) => x.key === "Tal Rasha's Howling Wind")?.id).toBe("tal-rashas-guardianship");
  });

  it("runas siempre normales, anillos mínimo mágicos, talismanes nunca raros", () => {
    expect(D.bases.r30.qf).toBe(1);
    expect(D.bases.rin.qf).toBe(2);
    expect(D.bases.cm3.qf).toBe(3);
    expect(D.bases.uap.qf).toBe(0);
  });

  it("Zonas de Terror: nivel del jugador + 2, con los topes de Infierno y los Heraldos de RotW", () => {
    expect(D.tz.boost).toBe(2);
    expect(D.tz.b[2]).toEqual([70, 96]);
    expect(D.tz.maxTier).toBe(5);
  });

  it("el índice de fichas no repite ids y todas son de la pestaña drops", () => {
    const ids = (index as { sec: string; id: string }[]).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((index as { sec: string }[]).every((e) => e.sec === "drops")).toBe(true);
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsData.test.ts` (desde `site/`)
Expected: FAIL, "Failed to resolve import …/drops/drops.json".

- [ ] **Step 3: Escribir `games/d2r/tools/drops.py`**

```python
"""
Diablo II: Resurrected → los datos de la calculadora de drops (2026-09-29).

Lee la instalación del juego (sólo lectura, CascLib) y escribe:

  games/d2r/data/drops/drops.json   lo que usa el motor del sitio (site/src/d2r/drops/):
                                    Treasure Classes (con las automáticas weapN/armoN ya
                                    armadas), bases, únicos y piezas con su rareza,
                                    itemratio, monstruos, áreas, jefes y superúnicos con
                                    su área, y las reglas de las Zonas de Terror
  games/d2r/data/drops/index.json   las fichas de jefes y superúnicos (id y nombre) para
                                    el sitemap y los títulos, sin cargar lo anterior

Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md. Las reglas que aplica
el motor están ahí; acá sólo se traducen las tablas.

Uso (después de wiki.py, una vez por parche):
    python games/d2r/tools/drops.py
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from casc import Casc, ROOT  # noqa: E402
from extract import table, strings  # noqa: E402
from wiki import slug, num  # noqa: E402

OUT = os.path.join(ROOT, "games", "d2r", "data", "drops")
WIKI = os.path.join(ROOT, "games", "d2r", "data", "wiki")
DIFF_SUFFIX = ["", "(N)", "(H)"]
# Las columnas de TC de monstats, en el orden de `DropMonster.tc` del sitio.
TC_KINDS = ["TreasureClass", "TreasureClassChamp", "TreasureClassUnique", "TreasureClassQuest",
            "TreasureClassDesecrated", "TreasureClassDesecratedChamp", "TreasureClassDesecratedUnique",
            "TreasureClassHerald"]

# En qué área aparece cada superúnico (índice de levels.txt). El juego lo define
# en los mapas (.ds1), no en tablas. Los que faltan no aparecen en ningún mapa
# (Winged Death, Axe Dweller, Hell's Belle…) o no sueltan nada (los Ancestros
# de la cima). Radament está en Cloacas Nivel 3; Kaa, en cualquiera de las siete
# tumbas (todas del mismo nivel).
SUPER_AREAS = {
    "Corpsefire": 8, "Bishibosh": 3, "Bonebreak": 18, "Coldcrow": 9, "Rakanishu": 4,
    "Treehead WoodFist": 5, "Griswold": 38, "The Countess": 25, "The Smith": 28,
    "Pitspawn Fouldog": 30, "Boneash": 33, "The Cow King": 39,
    "Radament": 49, "Leatherarm": 59, "Bloodwitch the Wild": 60, "Beetleburst": 43,
    "Coldworm the Burrower": 64, "Dark Elder": 44, "Fangskin": 61, "Fire Eye": 54,
    "The Summoner": 74, "Ancient Kaa the Soulless": 66,
    "Web Mage the Burning": 85, "Witch Doctor Endugu": 91, "Stormtree": 78,
    "Sarina the Battlemaid": 94, "Icehawk Riftwing": 92, "Ismail Vilehand": 83,
    "Geleb Flamefinger": 83, "Toorc Icefist": 83, "Bremm Sparkfist": 102,
    "Wyand Voidfinger": 102, "Maffer Dragonhand": 102,
    "The Feature Creep": 107, "Infector of Souls": 108, "Lord De Seis": 108,
    "Grand Vizier of Chaos": 108,
    "Siege Boss": 110, "Dac Farren": 110, "Megaflow Rectifier": 111, "Eyeback Unleashed": 111,
    "Sharp Tooth Sayer": 111, "Threash Socket": 112, "Frozenstein": 114, "Bonesaw Breaker": 115,
    "Snapchip Shatter": 119, "Pindleskin": 121, "Nihlathak Boss": 124,
    "Baal Subject 1": 131, "Baal Subject 2": 131, "Baal Subject 3": 131, "Baal Subject 4": 131,
    "Baal Subject 5": 131,
}
# Los jefes que no son superúnicos: id del sitio y área. El Clon de Diablo
# aparece en cualquier área, por eso no tiene una.
BOSSES = {
    "andariel": ("andariel", 37), "duriel": ("duriel", 73), "mephisto": ("mephisto", 102),
    "diablo": ("diablo", 108), "baalcrab": ("baal", 132), "izual": ("izual", 105),
    "bloodraven": ("blood-raven", 17), "diabloclone": ("diablo-clone", None),
    "uberandariel": ("lilith", 133), "uberduriel": ("uber-duriel", 134), "uberizual": ("uber-izual", 135),
    "colossal1": ("colossal-talic", 137), "colossal2": ("colossal-madawc", 137),
    "colossal3": ("colossal-korlic", 137),
}
# Nombres que el juego repite (el Clon y los de Pandemonio se llaman como el
# original) o que no trae (Nihlathak como superúnico).
NAMES = {
    "diabloclone": {"en": "Diablo Clone", "es": "Clon de Diablo"},
    "uberduriel": {"en": "Uber Duriel", "es": "Duriel de Pandemonio"},
    "uberizual": {"en": "Uber Izual", "es": "Izual de Pandemonio"},
    "colossal1": {"en": "Talic, Colossal Ancient", "es": "Talic, Ancestro Colosal"},
    "colossal2": {"en": "Madawc, Colossal Ancient", "es": "Madawc, Ancestro Colosal"},
    "colossal3": {"en": "Korlic, Colossal Ancient", "es": "Korlic, Ancestro Colosal"},
    "Nihlathak Boss": {"en": "Nihlathak", "es": "Nihlathak"},
}
# ConditionCalc → la forma que evalúa el motor sin interpretar texto. Una
# condición nueva hace fallar el script a propósito: hay que sumarla acá y en
# `condOk` (site/src/d2r/drops/rules.ts).
CONDITIONS = {
    "cond('Difficulty',hell)": {"diff": 2},
    "cond('Difficulty',hell)*(cond('Desecrated')==0)": {"diff": 2, "desec": False},
    "cond('Difficulty',hell)*cond('Desecrated')": {"diff": 2, "desec": True},
    "cond('MonsterTestElite',herald)": {"herald": True},
    "(stat('heraldtier'.accr)>4)": {"tier": [5, 99]},
    "(stat('heraldtier'.accr)>2)*(stat('heraldtier'.accr)<5)": {"tier": [3, 4]},
    "cond('Desecrated')": {"desec": True},
    "cond('Desecrated')==0": {"desec": False},
}


def condition(raw):
    key = re.sub(r"\s+", "", (raw or "").strip().strip('"'))
    if not key:
        return None
    if key not in CONDITIONS:
        raise SystemExit(f"ConditionCalc desconocida: {raw!r} (sumarla a CONDITIONS y al motor)")
    return CONDITIONS[key]


def ladder(row):
    """[primera, última] temporada en que es exclusivo de Clasificación, o None."""
    first, last = num(row.get("firstLadderSeason")) or 0, num(row.get("lastLadderSeason")) or 0
    return [first, last] if first else None


def entry(raw):
    """'"gld,mul=2048"' → ('gld', None); '"x,cu=512"' → ('x', [512, 0, 0, 0])."""
    parts = [p.strip() for p in raw.strip().strip('"').split(",")]
    mods = {}
    for p in parts[1:]:
        k, _, v = p.partition("=")
        mods[k.strip()] = num(v) or 0
    q = [mods.get("cu", 0), mods.get("cs", 0), mods.get("cr", 0), mods.get("cm", 0)]
    return parts[0], (q if any(q) else None)


def type_chain(types, code):
    """El tipo y todos sus equivalentes hacia arriba (scha → char → misc)."""
    seen, stack = [], [code]
    while stack:
        t = stack.pop()
        if not t or t in seen or t not in types:
            continue
        seen.append(t)
        stack += [types[t].get("Equiv1"), types[t].get("Equiv2")]
    return seen


def terror(c):
    """Las áreas que se pueden aterrorizar (las del calendario y las manuales de RotW) y sus reglas."""
    d = json.loads(c.read("data:data/hd/global/excel/desecratedzones.json").decode("utf-8-sig"))["desecrated_zones"][0]
    levels = {l["level_id"] for z in d["zones"] for l in z["levels"]}
    levels |= {l["level_id"] for g in d.get("manual_zones", []) for z in g["zones"] for l in z["levels"]}
    rotw = d["game_difficulties"]["rotw"]
    dfl = {k: rotw[k]["defaults"] for k in ("normal", "nightmare", "hell")}
    boosts = {v["boost_level"] for v in dfl.values()}
    if len(boosts) != 1:
        raise SystemExit(f"boost_level distinto por dificultad: {boosts} (el motor usa uno solo)")
    tiers = dfl["hell"].get("herald_tiers", [])
    return levels, {
        "b": [[dfl[k]["bound_incl_min"], dfl[k]["bound_incl_max"]] for k in ("normal", "nightmare", "hell")],
        "boost": boosts.pop(),
        "heraldTc": [t.get("herald_treasure_class_level_boost") or 0 for t in tiers],
        "maxTier": rotw["hell"].get("max_herald_tiers") or 0,
    }


def main():
    c = Casc()
    S = strings(c)
    T = {n: table(c, n + ".txt") for n in ["treasureclassex", "weapons", "armor", "misc", "itemtypes", "uniqueitems",
                                           "setitems", "itemratio", "monstats", "superuniques", "levels"]}
    types = {r["Code"]: r for r in T["itemtypes"] if r.get("Code")}
    loc = lambda key, fallback: S.get(key) or {"en": fallback, "es": fallback}
    wiki_bases = {b["code"]: b for b in json.load(open(os.path.join(WIKI, "bases.json"), encoding="utf-8"))}

    # ── Bases ────────────────────────────────────────────────────────────
    bases = {}
    for kind, rows in (("w", T["weapons"]), ("a", T["armor"]), ("m", T["misc"])):
        for r in rows:
            code = r.get("code")
            if not code or code in bases:
                continue
            chain = type_chain(types, r.get("type"))
            if kind == "m":
                # Fuera de armas y armaduras: anillos, amuletos y joyas son como
                # mínimo mágicos; los talismanes, mágicos o únicos; el resto
                # (runas, gemas, pociones, oro, llaves…) sale siempre normal.
                qf = 2 if {"ring", "amul", "jewl"} & set(chain) else 3 if "char" in chain else 1
            else:
                qf = 0
            wb = wiki_bases.get(code) or {}
            bases[code] = {
                "q": num(r.get("level")) or 0, "t": r.get("type"),
                "u": 1 if r.get("normcode") and code != r.get("normcode") else 0,
                "cl": 1 if any(types[t].get("Class") for t in chain) else 0,
                "qf": qf, "k": kind,
                "n": wb.get("name") or loc(code, r.get("name") or code), "img": wb.get("img"),
                "_spawn": r.get("spawnable") == "1", "_rar": num(r.get("rarity")) or 0,
            }

    # ── Treasure Classes ─────────────────────────────────────────────────
    tcs = {}
    for r in T["treasureclassex"]:
        name = r.get("Treasure Class")
        if not name:
            continue
        e = []
        for i in range(1, 11):
            raw, prob = r.get(f"Item{i}"), num(r.get(f"Prob{i}")) or 0
            if not raw or prob <= 0:
                continue
            target, q = entry(raw)
            e.append([target, prob] + ([q] if q else []))
        tc = {"p": num(r.get("Picks")) or 1, "e": e}
        if num(r.get("group")):
            tc["g"] = num(r["group"])
        if num(r.get("level")):
            tc["l"] = num(r["level"])
        q = [num(r.get(k)) or 0 for k in ("Unique", "Set", "Rare", "Magic")]
        if any(q):
            tc["q"] = q
        if num(r.get("NoDrop")):
            tc["nd"] = num(r["NoDrop"])
        cond = condition(r.get("ConditionCalc"))
        if cond:
            tc["c"] = cond
        lad = ladder(r)
        if lad:
            tc["lad"] = lad
        tcs[name] = tc
    # Las TCs automáticas: "armo60" son las armaduras de nivel 58 a 60 que caen,
    # cada una con su rareza como peso. El juego las arma solo; la tabla no las trae.
    for kind, prefix in (("w", "weap"), ("a", "armo")):
        pool = [(code, b) for code, b in bases.items() if b["k"] == kind and b["_spawn"] and b["_rar"] > 0]
        top = max(b["q"] for _, b in pool)
        for n in range(3, top + 3, 3):
            e = [[code, b["_rar"]] for code, b in pool if n - 3 < b["q"] <= n]
            if e and f"{prefix}{n}" not in tcs:
                tcs[f"{prefix}{n}"] = {"p": 1, "e": e}

    uniq_keys = {r["index"] for r in T["uniqueitems"] if r.get("index")}
    set_keys = {r["index"] for r in T["setitems"] if r.get("index")}
    missing = sorted({t for tc in tcs.values() for t, *_ in tc["e"]
                      if t not in tcs and t not in bases and t != "gld" and t not in uniq_keys and t not in set_keys})
    if missing:
        raise SystemExit(f"Entradas de TC sin resolver: {missing[:20]}")

    # ── Únicos y piezas ──────────────────────────────────────────────────
    wiki_u = json.load(open(os.path.join(WIKI, "uniques.json"), encoding="utf-8"))
    pool_rows = [r for r in T["uniqueitems"] if r.get("spawnable") == "1" and r.get("code")]
    if len(pool_rows) != len(wiki_u) or any(w["key"] != r["index"] for w, r in zip(wiki_u, pool_rows)):
        raise SystemExit("uniques.json no sigue a uniqueitems.txt: correr wiki.py primero")
    uniques = []
    for w, r in zip(wiki_u, pool_rows):
        u = {"id": w["id"], "key": r["index"], "code": r["code"], "lvl": num(r.get("lvl")) or 0,
             "rar": num(r.get("rarity")) or 0, "n": w["name"], "img": w.get("img")}
        lad, cond = ladder(r), condition(r.get("DropConditionCalc"))
        if lad:
            u["lad"] = lad
        if cond:
            u["c"] = cond
        uniques.append(u)
    # Los que sólo salen por nombre desde un TC (los de los Ancestros Colosales):
    # no entran al sorteo de su base.
    forced = {t for tc in tcs.values() for t, *_ in tc["e"] if t in uniq_keys}
    have = {u["key"] for u in uniques}
    for r in T["uniqueitems"]:
        if r.get("index") in forced and r["index"] not in have and r.get("code"):
            name = loc(r["index"], r["index"])
            uniques.append({"id": slug(name["en"]), "key": r["index"], "code": r["code"], "lvl": num(r.get("lvl")) or 0,
                            "rar": 0, "f": 1, "n": name, "img": bases.get(r["code"], {}).get("img")})
            have.add(r["index"])

    wiki_s = json.load(open(os.path.join(WIKI, "sets.json"), encoding="utf-8"))
    # Cada pieza con el id de su conjunto: su ficha de la wiki es la del conjunto.
    set_items = {i["key"]: (i, s_["id"]) for s_ in wiki_s for i in s_["items"]}
    sets = []
    for r in T["setitems"]:
        hit = set_items.get(r.get("index"))
        if r.get("spawnable") != "1" or not r.get("item") or not hit:
            continue
        w, set_id = hit
        x = {"id": w["id"], "set": set_id, "key": r["index"], "code": r["item"], "lvl": num(r.get("lvl")) or 0,
             "rar": num(r.get("rarity")) or 0, "n": w["name"], "img": w.get("img")}
        lad = ladder(r)
        if lad:
            x["lad"] = lad
        sets.append(x)

    # ── itemratio (la fila de la expansión) ──────────────────────────────
    ratio = []
    for r in T["itemratio"]:
        if r.get("Version") != "1":
            continue
        g = lambda k: [num(r.get(k)) or 0, num(r.get(k + "Divisor")) or 1, num(r.get(k + "Min")) or 0]
        ratio.append({"u": num(r.get("Uber")) or 0, "cl": num(r.get("Class Specific")) or 0,
                      "U": g("Unique"), "S": g("Set"), "R": g("Rare"), "M": g("Magic")})

    # ── Áreas, jefes y superúnicos, monstruos ────────────────────────────
    ms = {r["Id"]: r for r in T["monstats"] if r.get("Id")}
    tz_levels, tz = terror(c)
    areas, used = [], set()
    for r in T["levels"]:
        lid = num(r.get("Id"))
        lv = [num(r.get(k)) or 0 for k in ("MonLvlEx", "MonLvlEx(N)", "MonLvlEx(H)")]
        if not lid or not any(lv):
            continue
        lists = {k: [r[f"{k}{i}"] for i in range(1, 26)
                     if r.get(f"{k}{i}") and ms.get(r[f"{k}{i}"], {}).get("enabled") == "1"] for k in ("mon", "nmon", "umon")}
        a = {"id": lid, "n": loc(r.get("LevelName"), r["Name"]), "act": (num(r.get("Act")) or 0) + 1, "lv": lv, **lists}
        if lid in tz_levels:
            a["tz"] = 1
        areas.append(a)
        for k in lists:
            used.update(lists[k])

    su = {r["Superunique"]: r for r in T["superuniques"] if r.get("Superunique")}
    sources = []
    for key, area in SUPER_AREAS.items():
        r = su[key]
        mon = r["Class"]
        name = NAMES.get(key) or loc(r.get("Name"), key)
        sources.append({"id": slug(name["en"]), "kind": "boss" if ms[mon].get("boss") == "1" else "super", "n": name,
                        "mon": mon, "area": area,
                        "tc": [r.get("TC", ""), r.get("TC(N)", ""), r.get("TC(H)", "")],
                        "tcd": [r.get("TC Desecrated", ""), r.get("TC(N) Desecrated", ""), r.get("TC(H) Desecrated", "")]})
        used.add(mon)
    for mon, (sid, area) in BOSSES.items():
        sources.append({"id": sid, "kind": "boss", "n": NAMES.get(mon) or loc(ms[mon].get("NameStr"), mon),
                        "mon": mon, "area": area})
        used.add(mon)
    ids = [s_["id"] for s_ in sources]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"ids de jefes repetidos: {sorted(i for i in ids if ids.count(i) > 1)}")
    area_ids = {a["id"] for a in areas}
    bad = [s_["id"] for s_ in sources if s_["area"] is not None and s_["area"] not in area_ids]
    if bad:
        raise SystemExit(f"áreas inexistentes: {bad}")

    monsters = {}
    for mid in sorted(used):
        r = ms[mid]
        m = {"n": loc(r.get("NameStr"), mid), "lv": [num(r.get("Level" + d)) or 0 for d in DIFF_SUFFIX],
             "rar": num(r.get("Rarity")) or 0, "tc": [[r.get(k + d, "") for k in TC_KINDS] for d in DIFF_SUFFIX]}
        if r.get("boss") == "1":
            m["boss"] = 1
        monsters[mid] = m

    # ── Escribir ─────────────────────────────────────────────────────────
    os.makedirs(OUT, exist_ok=True)
    data = {"tcs": tcs, "bases": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")} for k, v in bases.items()},
            "uniques": uniques, "sets": sets, "ratio": ratio, "monsters": monsters, "areas": areas,
            "sources": sources, "tz": tz}
    path = os.path.join(OUT, "drops.json")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump([{"sec": "drops", "id": s_["id"], "en": s_["n"]["en"], "es": s_["n"]["es"]} for s_ in sources],
                  f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"drops: {len(tcs)} TCs · {len(bases)} bases · {len(uniques)} únicos · {len(sets)} piezas · "
          f"{len(monsters)} monstruos · {len(areas)} áreas · {len(sources)} jefes y superúnicos · "
          f"{os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Sumar el ícono de la tarjeta a `extract.py`**

En `games/d2r/tools/extract.py`, reemplazar:

```python
    for q in ["a1q1", "a3q1", "a3q4", "a4q2"]:
```

por:

```python
    for q in ["a1q1", "a2q6", "a3q1", "a3q4", "a4q2"]:
```

- [ ] **Step 5: Correr los dos scripts y dejar CRLF en el nuevo**

Run (desde la raíz del repo):
```bash
python -c "p='games/d2r/tools/drops.py'; s=open(p,encoding='utf-8').read(); open(p,'w',encoding='utf-8',newline='\r\n').write(s)"
PYTHONIOENCODING=utf-8 python games/d2r/tools/extract.py
PYTHONIOENCODING=utf-8 python games/d2r/tools/drops.py
```
Expected: la última línea dice `drops: … TCs · … bases · 4xx únicos · 135 piezas · … monstruos · … áreas · 6x jefes y superúnicos · … KB`, y existe `site/public/d2r/game/quest/a2q6.webp`.

- [ ] **Step 6: Correr el test**

Run: `npx vitest run test/d2rDropsData.test.ts`
Expected: PASS (8 tests). Si falla "cada entrada de cada TC…", el mensaje dice qué entrada no resuelve: hay que resolverla en `drops.py` (no en el test).

---

### Task 2: Tipos, datos indexados y reglas del juego

> **Corrección tras la revisión (2026-09-29).** Un mismo número de grupo de TC se reusa en cadenas distintas
> (Normal, Pesadilla e Infierno), y la guía oficial dice que el grupo es una serie de filas **contiguas**.
> - `Indexed` no tiene `groups`: tiene `chains: Map<string, string[]>`, la cadena de filas consecutivas con el
>   mismo grupo de cada TC.
> - `upgradeTc` recorre esa cadena. Con la lista por número de grupo, `Andarielq Desecrated A` a nivel 48
>   saltaba a una TC de Pesadilla.
> - El test usa cadenas reales: la Condesa en Zona de Terror de Normal y `Act 1 Chest A`.
> - `season.ts` conserva la fecha de inicio de la temporada 15.

**Files:**
- Create:
  - `site/src/d2r/season.ts`
  - `site/src/d2r/drops/types.ts`
  - `site/src/d2r/drops/data.ts`
  - `site/src/d2r/drops/rules.ts`
- Modify: `site/src/d2rCopy.ts`, para que `SEASON` sea un re-export.
- Test: `site/test/d2rDropsRules.test.ts`

**Interfaces:**
- Consumes: `games/d2r/data/drops/drops.json` (Task 1).
- Produces:
  - tipos: `Diff`, `Q4`, `Ratio3`, `TcCond`, `TcEntry`, `Tc`, `BaseItem`, `DropUnique`, `DropSetItem`, `RatioRow`, `DropMonster`, `DropArea`, `DropSource`, `TzRules`, `DropData`, `Settings`, `KillCtx` y `Target`;
  - carga e índices: `Indexed`, `indexData(d)` y `dropData()`;
  - reglas: `playerExponent(players, party)`, `adjustNoDrop(noDrop, probSum, n)`, `effectiveMf(mf, q)`, `qualityChance(r, q, mlvl, qlvl, mf, tcMod)`, `ratioRow(rows, base)`, `condOk(c, k)`, `ladderOk(lad, ladder, season)` y `upgradeTc(D, name, level)`;
  - la temporada: `SEASON`.

- [ ] **Step 1: Escribir el test de las reglas**

```ts
// site/test/d2rDropsRules.test.ts
import { describe, expect, it } from "vitest";
import { adjustNoDrop, condOk, effectiveMf, ladderOk, playerExponent, qualityChance, upgradeTc } from "../src/d2r/drops/rules";
import { dropData } from "../src/d2r/drops/data";

/** Las fórmulas del juego, contra cuentas hechas a mano (guía oficial, itemratio-calc). */
describe("NoDrop y jugadores", () => {
  it("vos, el grupo cerca cuenta entero y el resto medio", () => {
    expect(playerExponent(1, 1)).toBe(1);
    expect(playerExponent(2, 1)).toBe(1); // /players 2 = /players 1
    expect(playerExponent(3, 1)).toBe(2);
    expect(playerExponent(8, 1)).toBe(4); // partida llena sin grupo
    expect(playerExponent(8, 7)).toBe(7);
  });

  it("la chance de no soltar nada se eleva a N, con el truncado del juego", () => {
    expect(adjustNoDrop(100, 100, 1)).toBe(100);
    // (100/200)^2 = 0,25 → 100 / (1/0,25 − 1) = 33,3 → 33
    expect(adjustNoDrop(100, 100, 2)).toBe(33);
    expect(adjustNoDrop(0, 100, 4)).toBe(0);
  });
});

describe("calidad", () => {
  it("el MF rinde menos pasado el 10% para único, conjunto y raro, no para mágico", () => {
    expect(effectiveMf(10, "u")).toBe(110);
    expect(effectiveMf(300, "u")).toBe(100 + Math.trunc((300 * 250) / 550)); // 236
    expect(effectiveMf(300, "s")).toBe(100 + Math.trunc((300 * 500) / 800)); // 287
    expect(effectiveMf(300, "m")).toBe(400);
  });

  it("chance de único de un Shako (qlvl 58) que suelta Mefisto (mlvl 87) sin MF", () => {
    // (400 − (87−58)/1) × 128 = 47.488; sin MF queda igual; mínimo 6.400 no aplica; TC 0.
    expect(qualityChance([400, 1, 6400], "u", 87, 58, 0, 0)).toBeCloseTo(128 / 47488, 12);
    // Con el modificador de TC de un jefe (983): 47.488 − 47.488·983/1024 = 1.902 (truncado)
    expect(qualityChance([400, 1, 6400], "u", 87, 58, 0, 983)).toBeCloseTo(128 / (47488 - Math.trunc((47488 * 983) / 1024)), 12);
  });

  it("el mínimo corta antes del modificador de TC y una chance ≤ 128 es segura", () => {
    // (400 − 90)·128 = 39.680; con MF 9999 queda 39.680·100/343 = 11.568, pero el mínimo (20.000 acá) la sube.
    const withMin = qualityChance([400, 1, 20000], "u", 99, 9, 9999, 0);
    expect(withMin).toBeCloseTo(128 / 20000, 12);
    expect(qualityChance([400, 1, 6400], "u", 99, 1, 0, 1024)).toBe(1);
  });
});

describe("condiciones, Clasificación y mejora de TC", () => {
  const kill = { diff: 2 as const, desec: false, herald: false, tier: 0 };
  it("condiciones", () => {
    expect(condOk(undefined, kill)).toBe(true);
    expect(condOk({ diff: 2 }, kill)).toBe(true);
    expect(condOk({ diff: 2 }, { ...kill, diff: 1 })).toBe(false);
    expect(condOk({ desec: true }, kill)).toBe(false);
    expect(condOk({ herald: true, tier: [3, 4] }, { ...kill, herald: true, tier: 3 })).toBe(true);
    expect(condOk({ tier: [5, 99] }, { ...kill, herald: true, tier: 4 })).toBe(false);
  });

  it("exclusivo de Clasificación de la temporada 3 a la 14: en la 15 sale en todas", () => {
    expect(ladderOk(undefined, false, 15)).toBe(true);
    expect(ladderOk([3, 14], false, 15)).toBe(true);
    expect(ladderOk([3, 14], false, 14)).toBe(false);
    expect(ladderOk([15, 0], true, 15)).toBe(true);
    expect(ladderOk([15, 0], false, 15)).toBe(false);
  });

  it("la mejora de TC sube dentro del grupo hasta el nivel del monstruo, nunca baja", () => {
    const D = dropData();
    const [name, tc] = Object.entries(D.tcs).find(([, t]) => t.g && (D.groups.get(t.g)?.length ?? 0) > 2)!;
    const group = D.groups.get(tc.g!)!;
    const first = group[0];
    const last = group[group.length - 1];
    expect(upgradeTc(D, first, 999)).toBe(last);
    expect(upgradeTc(D, first, 0)).toBe(first);
    expect(upgradeTc(D, last, 0)).toBe(last);
    expect(group).toContain(name);
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsRules.test.ts`
Expected: FAIL, "Failed to resolve import ../src/d2r/drops/rules".

- [ ] **Step 3: Escribir `site/src/d2r/season.ts` y hacer de `SEASON` en `d2rCopy.ts` un re-export**

```ts
// site/src/d2r/season.ts
/**
 * La temporada de Clasificación en curso. El juego no la trae: se cambia a
 * mano cuando empieza una nueva. La usan las pastillas de la portada y la
 * calculadora de drops (lo exclusivo de Clasificación depende de ella).
 */
export const SEASON = 15;
```

En `site/src/d2rCopy.ts`, reemplazar la línea `export const SEASON = 15;` y su comentario por:

```ts
export { SEASON } from "./d2r/season";
```

Si en el mismo archivo algo usa `SEASON`, sumar además `import { SEASON } from "./d2r/season";` arriba de todo.

- [ ] **Step 4: Escribir `site/src/d2r/drops/types.ts`**

```ts
/**
 * Los tipos de la calculadora de drops (2026-09-29): lo que escribe
 * `games/d2r/tools/drops.py` y lo que usan el motor, los lugares y el
 * simulador. Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md.
 */
import type { Loc } from "../stats";

export type Diff = 0 | 1 | 2;
/** Único, conjunto, raro, mágico: los modificadores de calidad de un TC o de una entrada. */
export type Q4 = [number, number, number, number];
/** Una calidad en itemratio: rareza, divisor y mínimo. */
export type Ratio3 = [number, number, number];

export interface TcCond {
  diff?: Diff;
  desec?: boolean;
  herald?: boolean;
  tier?: [number, number];
}
/** Una entrada: otra TC, un código de base, "gld", o un único o pieza por nombre; su peso; sus modificadores. */
export type TcEntry = [target: string, prob: number, mods?: Q4];
export interface Tc {
  /** Tiradas: positivas al azar (con NoDrop), negativas en orden (sin NoDrop). */
  p: number;
  e: TcEntry[];
  g?: number;
  l?: number;
  q?: Q4;
  nd?: number;
  c?: TcCond;
  lad?: [number, number];
}
export interface BaseItem {
  /** Nivel de calidad (qlvl). */
  q: number;
  t: string;
  /** Excepcional o élite: usa la fila "Uber" de itemratio. */
  u: 0 | 1;
  /** De una clase: usa la fila de clase de itemratio. */
  cl: 0 | 1;
  /** 0 cualquier calidad · 1 siempre normal (runas, gemas, oro) · 2 mínimo mágico (anillos, amuletos, joyas) · 3 mínimo mágico y nunca raro (talismanes). */
  qf: 0 | 1 | 2 | 3;
  k: "w" | "a" | "m";
  n: Loc;
  img: string | null;
}
export interface DropUnique {
  id: string;
  key: string;
  code: string;
  lvl: number;
  rar: number;
  lad?: [number, number];
  c?: TcCond;
  /** Sólo sale por nombre desde un TC (no entra al sorteo de su base). */
  f?: 1;
  n: Loc;
  img: string | null;
}
export interface DropSetItem {
  id: string;
  /** El conjunto (su ficha de la wiki). */
  set: string;
  key: string;
  code: string;
  lvl: number;
  rar: number;
  lad?: [number, number];
  n: Loc;
  img: string | null;
}
export interface RatioRow {
  u: 0 | 1;
  cl: 0 | 1;
  U: Ratio3;
  S: Ratio3;
  R: Ratio3;
  M: Ratio3;
}
export interface DropMonster {
  n: Loc;
  lv: [number, number, number];
  boss?: 1;
  /** Peso de aparición en un área. */
  rar: number;
  /** Por dificultad: común, campeón, único, misión, y los aterrorizados (común, campeón, único) y el Heraldo. */
  tc: [string[], string[], string[]];
}
export interface DropArea {
  id: number;
  n: Loc;
  act: number;
  lv: [number, number, number];
  /** Normal: comunes y campeones. */
  mon: string[];
  /** Pesadilla e Infierno: todos. */
  nmon: string[];
  /** Normal: los que pueden ser únicos. */
  umon: string[];
  tz?: 1;
}
export interface DropSource {
  id: string;
  kind: "boss" | "super";
  n: Loc;
  mon: string;
  area: number | null;
  /** Los superúnicos traen su TC por dificultad (y el aterrorizado); los jefes usan el de su monstruo. */
  tc?: [string, string, string];
  tcd?: [string, string, string];
}
export interface TzRules {
  /** [mínimo, máximo] del nivel aterrorizado por dificultad. */
  b: [[number, number], [number, number], [number, number]];
  boost: number;
  /** Cuánto sube el nivel de TC el Heraldo de cada nivel (índice = nivel − 1). */
  heraldTc: number[];
  maxTier: number;
}
export interface DropData {
  tcs: Record<string, Tc>;
  bases: Record<string, BaseItem>;
  uniques: DropUnique[];
  sets: DropSetItem[];
  ratio: RatioRow[];
  monsters: Record<string, DropMonster>;
  areas: DropArea[];
  sources: DropSource[];
  tz: TzRules;
}

/** Lo que cambia la cuenta: hallazgo mágico, jugadores, grupo, Clasificación y temporada. */
export interface Settings {
  mf: number;
  players: number;
  party: number;
  ladder: boolean;
  season: number;
}
/** Cómo muere el monstruo: su TC (ya mejorado), su nivel y las condiciones. */
export interface KillCtx {
  tc: string;
  mlvl: number;
  diff: Diff;
  desec: boolean;
  herald: boolean;
  tier: number;
}
/** Lo que se busca: un único o una pieza por id, o una base (runas incluidas) de cualquier calidad por código. */
export type Target = { k: "u"; id: string } | { k: "s"; id: string } | { k: "b"; code: string };
```

- [ ] **Step 5: Escribir `site/src/d2r/drops/data.ts`**

```ts
/**
 * Los datos de la calculadora de drops (2026-09-29), indexados una sola vez:
 * los grupos de TCs para la mejora por nivel y los únicos y piezas de cada
 * base para el sorteo. `indexData` también sirve para datos de prueba.
 */
import raw from "@d2r/drops/drops.json";
import type { DropArea, DropData, DropSetItem, DropSource, DropUnique } from "./types";

export interface Indexed extends DropData {
  /** Las TCs de cada grupo en el orden de la tabla, que es el de su nivel. */
  groups: Map<number, string[]>;
  uniqueByKey: Map<string, DropUnique>;
  uniqueById: Map<string, DropUnique>;
  setByKey: Map<string, DropSetItem>;
  setById: Map<string, DropSetItem>;
  /** Los que entran al sorteo de cada base (sin los que sólo salen por nombre). */
  uniquesByCode: Map<string, DropUnique[]>;
  setsByCode: Map<string, DropSetItem[]>;
  areaById: Map<number, DropArea>;
  sourceById: Map<string, DropSource>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

export function indexData(d: DropData): Indexed {
  const groups = new Map<number, string[]>();
  for (const [name, tc] of Object.entries(d.tcs)) if (tc.g) push(groups, tc.g, name);
  const uniquesByCode = new Map<string, DropUnique[]>();
  for (const u of d.uniques) if (!u.f && u.rar > 0) push(uniquesByCode, u.code, u);
  const setsByCode = new Map<string, DropSetItem[]>();
  for (const x of d.sets) if (x.rar > 0) push(setsByCode, x.code, x);
  // Las Facetas de arcoíris comparten nombre: ninguna sale por nombre, así que alcanza con la primera.
  const uniqueByKey = new Map<string, DropUnique>();
  for (const u of d.uniques) if (!uniqueByKey.has(u.key)) uniqueByKey.set(u.key, u);
  return {
    ...d,
    groups,
    uniquesByCode,
    setsByCode,
    uniqueByKey,
    uniqueById: new Map(d.uniques.map((u) => [u.id, u])),
    setByKey: new Map(d.sets.map((x) => [x.key, x])),
    setById: new Map(d.sets.map((x) => [x.id, x])),
    areaById: new Map(d.areas.map((a) => [a.id, a])),
    sourceById: new Map(d.sources.map((s) => [s.id, s])),
  };
}

let cache: Indexed | null = null;
/** Los datos del juego, indexados la primera vez que se piden. */
export const dropData = (): Indexed => (cache ??= indexData(raw as unknown as DropData));
```

- [ ] **Step 6: Escribir `site/src/d2r/drops/rules.ts`**

```ts
/**
 * Las reglas del juego que no dependen de un TC entero (2026-09-29), como las
 * documenta la guía oficial (`dataguide/docs/itemratio-calc.html`,
 * `treasureclassex.js`, `desecratedzones.js`): el NoDrop según los jugadores,
 * la chance de cada calidad, las condiciones, la Clasificación y la mejora de
 * TC. Las cuentas usan enteros donde el juego usa enteros, para dar lo mismo.
 */
import type { Indexed } from "./data";
import type { BaseItem, KillCtx, Ratio3, RatioRow, TcCond } from "./types";

/** Cuántos jugadores cuentan: vos y cada uno del grupo cerca tuyo enteros, el resto medio. */
export function playerExponent(players: number, party: number): number {
  return Math.floor(1 + (players - 1) / 2 + (party - 1) / 2);
}

/** El NoDrop con más jugadores: la chance de no soltar nada, elevada a N, con el truncado del juego. */
export function adjustNoDrop(noDrop: number, probSum: number, n: number): number {
  if (noDrop <= 0 || probSum <= 0 || n <= 1) return noDrop;
  const ratio = Math.pow(noDrop / (noDrop + probSum), n);
  return Math.trunc(probSum / (1 / ratio - 1));
}

/** El hallazgo mágico que cuenta: para único, conjunto y raro rinde cada vez menos pasado el 10%. */
export function effectiveMf(mf: number, quality: "u" | "s" | "r" | "m"): number {
  if (quality === "m" || mf <= 10) return 100 + mf;
  const dim = quality === "u" ? 250 : quality === "s" ? 500 : 600;
  return 100 + Math.trunc((mf * dim) / (mf + dim));
}

/** La chance de una calidad para una base de nivel qlvl que suelta un monstruo de nivel mlvl. */
export function qualityChance(r: Ratio3, quality: "u" | "s" | "r" | "m", mlvl: number, qlvl: number, mf: number, tcMod: number): number {
  const [rarity, divisor, min] = r;
  let chance = (rarity - Math.trunc((mlvl - qlvl) / divisor)) * 128;
  chance = Math.trunc((chance * 100) / effectiveMf(mf, quality));
  if (chance < min) chance = min;
  chance -= Math.trunc((chance * tcMod) / 1024);
  return chance <= 128 ? 1 : 128 / chance;
}

/** La fila de itemratio de una base: excepcional o élite, y de clase o no. */
export function ratioRow(rows: RatioRow[], b: BaseItem): RatioRow {
  return rows.find((r) => r.u === b.u && r.cl === b.cl) ?? rows[0];
}

/** Las siete condiciones que usa el juego (dificultad, aterrorizado, Heraldo y su nivel). */
export function condOk(c: TcCond | undefined, k: Pick<KillCtx, "diff" | "desec" | "herald" | "tier">): boolean {
  if (!c) return true;
  if (c.diff !== undefined && c.diff !== k.diff) return false;
  if (c.desec !== undefined && c.desec !== k.desec) return false;
  if (c.herald !== undefined && c.herald !== k.herald) return false;
  if (c.tier && (k.tier < c.tier[0] || k.tier > c.tier[1])) return false;
  return true;
}

/** Si algo exclusivo de Clasificación sale en esta partida. Pasada su última temporada exclusiva, sale en todas. */
export function ladderOk(lad: [number, number] | undefined, ladder: boolean, season: number): boolean {
  if (!lad || !lad[0]) return true;
  if (ladder) return season >= lad[0];
  return lad[1] > 0 && season > lad[1];
}

/** La mejora de TC: dentro de su grupo, sube a la de mayor nivel que no pase `level`. Nunca baja. */
export function upgradeTc(D: Indexed, name: string, level: number): string {
  const tc = D.tcs[name];
  if (!tc?.g) return name;
  const group = D.groups.get(tc.g) ?? [];
  let best = name;
  for (let i = group.indexOf(name) + 1; i < group.length; i++) {
    if ((D.tcs[group[i]].l ?? 0) > level) break;
    best = group[i];
  }
  return best;
}
```

- [ ] **Step 7: Correr el test y el chequeo de tipos**

Run: `npx vitest run test/d2rDropsRules.test.ts && npx tsc -b`
Expected: PASS (8 tests) y tsc sin errores.

---

### Task 3: El motor exacto

**Files:**
- Create: `site/src/d2r/drops/engine.ts`
- Test: `site/test/d2rDropsEngine.test.ts`

**Interfaces:**
- Consumes: `Indexed` e `indexData` (Task 2), las reglas de `rules.ts` (Task 2) y los tipos.
- Produces:
  - la constante `MAX_ITEMS = 6` y `maxQ(a, b?)`;
  - `interface Roll { list: TcEntry[]; noDrop: number; total: number }` y `rollOf(D, name, kill, s): Roll`;
  - `negativeSequence(list, picks): TcEntry[]`;
  - `reach(D, name): Set<string>` y `targetKeys(D, t): string[]`;
  - `eligibleUniques(D, code, kill, s)` y `eligibleSets(D, code, kill, s)`;
  - `leafParts(D, target, code, q, kill, s): { hit; quality; pick }`;
  - `chancePerKill(D, target, kill, s, opts?: { cap?: boolean }): number`: con `{ cap: false }` no aplica el tope de 6
    ítems, como Silospen (sólo para compararse con él; la calculadora siempre lo aplica);
  - `interface PathStep { tc: string; picks: number; share: number }` y `interface PathEnd { code: string; share: number; quality: number | null; pick: number | null }`;
  - `explainPath(D, target, kill, s): { steps: PathStep[]; end: PathEnd } | null`.

- [ ] **Step 1: Escribir el test (datos de prueba chicos y los números de Silospen)**

```ts
// site/test/d2rDropsEngine.test.ts
import { describe, expect, it } from "vitest";
import { chancePerKill, explainPath } from "../src/d2r/drops/engine";
import { dropData, indexData } from "../src/d2r/drops/data";
import type { DropData, KillCtx, Settings, Target } from "../src/d2r/drops/types";

const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const kill = (tc: string, mlvl = 50, extra: Partial<KillCtx> = {}): KillCtx => ({ tc, mlvl, diff: 2, desec: false, herald: false, tier: 0, ...extra });
const loc = (s: string) => ({ en: s, es: s });

/** Un juego de juguete: cada regla se prueba sola, con números que se sacan a mano. */
const toy = indexData({
  tcs: {
    Root: { p: 1, e: [["cap", 100]], nd: 100 },
    Twice: { p: 2, e: [["cap", 1]], nd: 1 },
    Neg: { p: -2, e: [["Root", 1], ["cap", 1]] },
    Capped: { p: -7, e: [["hp1", 6], ["cap", 1]] },
    Boss: { p: 1, e: [["Plain", 1]], q: [1024, 0, 0, 0] },
    Plain: { p: 1, e: [["cap", 1]] },
    Cond: { p: 1, e: [["OnlyTz", 1], ["cap", 1]] },
    OnlyTz: { p: 1, e: [["rin", 1]], c: { desec: true } },
    Named: { p: 1, e: [["Biggin's Bonnet", 1]] },
  },
  bases: {
    cap: { q: 1, t: "helm", u: 0, cl: 0, qf: 0, k: "a", n: loc("Cap"), img: null },
    rin: { q: 1, t: "ring", u: 0, cl: 0, qf: 2, k: "m", n: loc("Ring"), img: null },
    hp1: { q: 1, t: "hpot", u: 0, cl: 0, qf: 1, k: "m", n: loc("Potion"), img: null },
  },
  uniques: [{ id: "biggins-bonnet", key: "Biggin's Bonnet", code: "cap", lvl: 3, rar: 1, n: loc("Biggin's Bonnet"), img: null }],
  sets: [{ id: "sigons-visor", set: "sigons-complete-steel", key: "Sigon's Visor", code: "cap", lvl: 3, rar: 1, n: loc("Sigon's Visor"), img: null }],
  ratio: [{ u: 0, cl: 0, U: [400, 1, 6400], S: [160, 2, 5600], R: [100, 2, 3200], M: [34, 3, 192] }],
  monsters: {},
  areas: [],
  sources: [],
  tz: { b: [[3, 45], [40, 71], [70, 96]], boost: 2, heraldTc: [0], maxTier: 0 },
} as unknown as DropData);
const CAP: Target = { k: "b", code: "cap" };

describe("el motor con datos de juguete", () => {
  it("una tirada con NoDrop igual al resto: 50%", () => {
    expect(chancePerKill(toy, CAP, kill("Root"), S0)).toBeCloseTo(0.5, 12);
  });

  it("dos tiradas: 1 − 0,5² = 75%", () => {
    expect(chancePerKill(toy, CAP, kill("Twice"), S0)).toBeCloseTo(0.75, 12);
  });

  it("con /players 3 el NoDrop baja de 100 a 33", () => {
    expect(chancePerKill(toy, CAP, kill("Root"), { ...S0, players: 3 })).toBeCloseTo(100 / 133, 12);
  });

  it("tiradas negativas: la segunda entrada sale segura", () => {
    expect(chancePerKill(toy, CAP, kill("Neg"), S0)).toBeCloseTo(1, 12);
  });

  it("el tope de 6 ítems: después de 6 pociones el casquete no sale", () => {
    expect(chancePerKill(toy, CAP, kill("Capped"), S0)).toBe(0);
  });

  it("la calidad de un jefe llega a lo que tira su sub-TC (el máximo de la cadena)", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Boss", 50), S0)).toBeCloseTo(1, 12);
  });

  it("un único que pide más nivel que el monstruo no sale; el conjunto se tira después del único", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Plain", 2), S0)).toBe(0);
    const pu = 128 / ((400 - 49) * 128);
    const ps = 128 / ((160 - Math.trunc(49 / 2)) * 128);
    expect(chancePerKill(toy, { k: "s", id: "sigons-visor" }, kill("Plain", 50), S0)).toBeCloseTo((1 - pu) * ps, 12);
  });

  it("una sub-TC que no pasa su condición sale del sorteo con su peso", () => {
    expect(chancePerKill(toy, CAP, kill("Cond"), S0)).toBeCloseTo(1, 12);
    expect(chancePerKill(toy, CAP, kill("Cond", 50, { desec: true }), S0)).toBeCloseTo(0.5, 12);
  });

  it("un único por nombre sale seguro", () => {
    expect(chancePerKill(toy, { k: "u", id: "biggins-bonnet" }, kill("Named"), S0)).toBe(1);
  });

  it("el camino principal lleva del jefe al casquete", () => {
    const path = explainPath(toy, { k: "u", id: "biggins-bonnet" }, kill("Boss", 50), S0)!;
    expect(path.steps.map((s) => s.tc)).toEqual(["Boss", "Plain"]);
    expect(path.end.code).toBe("cap");
    expect(path.end.quality).toBe(1);
  });
});

/**
 * Las referencias salen de un evaluador exacto independiente, sobre los datos del parche instalado (3.3.93847),
 * con y sin el tope de 6 ítems. Validación (2026-09-29):
 * - sin el tope y sobre las propias tablas de Silospen, da sus números en vivo al 0,000%;
 * - un Montecarlo del proceso de la muerte coincide con él.
 * Silospen difiere por dos cosas: recorta las tiradas a 6 (en vez de cortar en el sexto ítem) y usa tablas
 * anteriores al 3.3. Tolerancia: 1e-6 relativo.
 */
describe("contra el evaluador exacto: jefes de Infierno", () => {
  const D = dropData();
  const SHAKO: Target = { k: "u", id: "harlequin-crest" };
  const BER: Target = { k: "b", code: "r30" };
  const TAL: Target = { k: "s", id: "tal-rashas-guardianship" };
  const exact = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(1e-6);
  // [TC, nivel, buscado, opciones, sin tope, con el tope de 6]
  const cases: [string, number, Target, Settings, number, number][] = [
    ["Mephisto (H)", 87, SHAKO, S0, 0.00058571902, 0.000561844573],
    ["Diablo (H)", 94, SHAKO, S0, 0.000569889288, 0.000546659845],
    ["Baal (H)", 99, SHAKO, S0, 0.000564657314, 0.000541641057],
    ["Andarielq (H)", 75, SHAKO, S0, 0.000424887693, 0.000423171889],
    ["Duriel (H)", 88, SHAKO, S0, 0.00088304134, 0.000275787941],
    ["Nihlathak (H)", 92, SHAKO, S0, 6.48373041e-5, 6.48373041e-5],
    ["Radament (H)", 83, SHAKO, S0, 6.32257558e-5, 6.32257558e-5],
    ["Summoner (H)", 80, SHAKO, S0, 5.94030562e-5, 5.94030562e-5],
    ["Blood Raven (H)", 88, SHAKO, S0, 3.94769482e-5, 3.94769482e-5],
    ["Izual (H)", 86, SHAKO, S0, 3.76115065e-5, 3.76115065e-5],
    ["Griswold (H)", 84, SHAKO, S0, 3.36375269e-5, 3.36375269e-5],
    ["Mephisto (H)", 87, SHAKO, { ...S0, mf: 300 }, 0.0013817088, 0.00132541725],
    ["Baal (H)", 99, SHAKO, { ...S0, mf: 300 }, 0.00133157406, 0.00127732331],
    ["Andarielq (H)", 75, SHAKO, { ...S0, mf: 300 }, 0.00100222125, 0.000998176653],
    ["Mephisto (H)", 87, SHAKO, { ...S0, players: 8 }, 0.000721794703, 0.00061871308],
    ["Baal (H)", 99, SHAKO, { ...S0, players: 8 }, 0.00069584135, 0.000596465095],
    ["Andarielq (H)", 75, SHAKO, { ...S0, players: 8 }, 0.000740797564, 0.000656685702],
    ["Mephisto (H)", 87, BER, S0, 1.75243329e-5, 1.68097701e-5],
    ["Baal (H)", 99, BER, S0, 1.7520944e-5, 1.68065193e-5],
    ["Baal (H)", 99, TAL, S0, 0.000516279123, 0.000495234192],
  ];
  for (const [tc, mlvl, target, s, off, cap6] of cases) {
    const name = `${tc} · ${JSON.stringify(target)} · MF ${s.mf} · ${s.players} jugador(es)`;
    it(`${name} · sin tope`, () => exact(chancePerKill(D, target, kill(tc, mlvl), s, { cap: false }), off));
    it(`${name} · con el tope de 6`, () => exact(chancePerKill(D, target, kill(tc, mlvl), s), cap6));
  }
});

/** Silospen en vivo, donde el parche 3.3 no cambió nada y el tope no importa (1%). */
describe("contra Silospen en vivo", () => {
  const D = dropData();
  const SHAKO: Target = { k: "u", id: "harlequin-crest" };
  const close = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(0.01);
  const cases: [string, number, number][] = [
    ["Nihlathak (H)", 92, 0.0000648373],
    ["Radament (H)", 83, 0.00006322576],
    ["Summoner (H)", 80, 0.00005940306],
    ["Blood Raven (H)", 88, 0.00003947695],
    ["Izual (H)", 86, 0.00003761151],
  ];
  for (const [tc, mlvl, want] of cases) it(`${tc} · Cresta del arlequín`, () => close(chancePerKill(D, SHAKO, kill(tc, mlvl), S0), want));

  it("Mefisto y Andariel no llegan a la Guardia de Tal Rasha (base de nivel 82)", () => {
    expect(chancePerKill(D, { k: "s", id: "tal-rashas-guardianship" }, kill("Mephisto (H)", 87), S0)).toBe(0);
    expect(chancePerKill(D, { k: "s", id: "tal-rashas-guardianship" }, kill("Andarielq (H)", 75), S0)).toBe(0);
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsEngine.test.ts`
Expected: FAIL, "Failed to resolve import ../src/d2r/drops/engine".

- [ ] **Step 3: Escribir `site/src/d2r/drops/engine.ts`**

```ts
/**
 * El motor exacto de la calculadora de drops (2026-09-29): la chance de que
 * una muerte suelte lo que buscás. Las reglas están en
 * docs/design/2026-09-29-d2r-calculadora-drops.md: tiradas positivas y
 * negativas, NoDrop según los jugadores, el tope de 6 ítems por muerte, la
 * calidad heredada (el máximo de la cadena), condiciones, Clasificación y el
 * sorteo del único o la pieza.
 *
 * El tope obliga a contar ítems: cada TC da una distribución sobre (cuántos
 * ítems generó, si ya salió el buscado), en `d[k*2 + h]`. Lo que no puede
 * llegar al buscado sólo suma ítems, y esa parte no depende de qué se busca:
 * se calcula una vez por contexto (`CountCache`) y la comparten todas las
 * búsquedas. Así "¿Dónde lo farmeo?" recorre cientos de lugares al instante.
 */
import type { Indexed } from "./data";
import { adjustNoDrop, condOk, ladderOk, playerExponent, qualityChance, ratioRow } from "./rules";
import type { DropSetItem, DropUnique, KillCtx, Q4, Settings, Target, TcEntry } from "./types";

/** El juego no suelta más de 6 ítems por muerte, pociones y oro incluidos. */
export const MAX_ITEMS = 6;
const NO_Q: Q4 = [0, 0, 0, 0];

export const maxQ = (a: Q4, b?: Q4): Q4 =>
  b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a;

export interface Roll {
  list: TcEntry[];
  noDrop: number;
  total: number;
}

/** Las entradas que pueden salir de un TC en esta muerte y el NoDrop ajustado por jugadores. */
export function rollOf(D: Indexed, name: string, kill: KillCtx, s: Settings): Roll {
  const tc = D.tcs[name];
  // Una sub-TC que no pasa su condición (o no es de esta partida) sale del sorteo con su Prob.
  const list = tc.e.filter(([t]) => {
    const sub = D.tcs[t];
    return !sub || (condOk(sub.c, kill) && ladderOk(sub.lad, s.ladder, s.season));
  });
  const sum = list.reduce((n, e) => n + e[1], 0);
  const noDrop = tc.p >= 0 ? adjustNoDrop(tc.nd ?? 0, sum, playerExponent(s.players, s.party)) : 0;
  return { list, noDrop, total: sum + noDrop };
}

/** Las tiradas negativas: cada entrada tantas veces como su Prob, en orden, hasta completar. */
export function negativeSequence(list: TcEntry[], picks: number): TcEntry[] {
  const out: TcEntry[] = [];
  for (const e of list) for (let i = 0; i < e[1] && out.length < picks; i++) out.push(e);
  return out;
}

const reachMemo = new WeakMap<Indexed, Map<string, Set<string>>>();
/** Todo lo que puede salir de un TC (bases, oro y nombres), sin mirar condiciones. */
export function reach(D: Indexed, name: string): Set<string> {
  let memo = reachMemo.get(D);
  if (!memo) reachMemo.set(D, (memo = new Map()));
  const hit = memo.get(name);
  if (hit) return hit;
  const out = new Set<string>();
  memo.set(name, out); // corta los ciclos
  for (const [t] of D.tcs[name]?.e ?? []) {
    if (D.tcs[t]) for (const x of reach(D, t)) out.add(x);
    else out.add(t);
  }
  return out;
}

/** Los nombres con que el buscado puede aparecer en un TC: su base y, si es único o pieza, su nombre. */
export function targetKeys(D: Indexed, t: Target): string[] {
  if (t.k === "b") return [t.code];
  const x = t.k === "u" ? D.uniqueById.get(t.id) : D.setById.get(t.id);
  return x ? [x.code, x.key] : [];
}

export function eligibleUniques(D: Indexed, code: string, kill: KillCtx, s: Settings): DropUnique[] {
  return (D.uniquesByCode.get(code) ?? []).filter((u) => u.lvl <= kill.mlvl && ladderOk(u.lad, s.ladder, s.season) && condOk(u.c, kill));
}

export function eligibleSets(D: Indexed, code: string, kill: KillCtx, s: Settings): DropSetItem[] {
  return (D.setsByCode.get(code) ?? []).filter((x) => x.lvl <= kill.mlvl && ladderOk(x.lad, s.ladder, s.season));
}

/** La chance en la hoja y sus dos partes: la calidad y cuál de los posibles sale (null si no aplica). */
export function leafParts(
  D: Indexed,
  target: Target,
  code: string,
  q: Q4,
  kill: KillCtx,
  s: Settings,
): { hit: number; quality: number | null; pick: number | null } {
  const none = { hit: 0, quality: null, pick: null };
  if (!D.bases[code]) {
    // Un único o una pieza nombrados en el TC salen con esa calidad, sin sorteo.
    const fu = D.uniqueByKey.get(code);
    if (fu) return { hit: target.k === "u" && target.id === fu.id ? 1 : 0, quality: null, pick: null };
    const fs = D.setByKey.get(code);
    if (fs) return { hit: target.k === "s" && target.id === fs.id ? 1 : 0, quality: null, pick: null };
    return none;
  }
  const base = D.bases[code];
  if (target.k === "b") return { hit: target.code === code ? 1 : 0, quality: null, pick: null };
  const wanted = target.k === "u" ? D.uniqueById.get(target.id) : D.setById.get(target.id);
  if (!wanted || wanted.code !== code || base.qf === 1) return none;
  const row = ratioRow(D.ratio, base);
  const pu = qualityChance(row.U, "u", kill.mlvl, base.q, s.mf, q[0]);
  const pool: { id: string; rar: number }[] = target.k === "u" ? eligibleUniques(D, code, kill, s) : eligibleSets(D, code, kill, s);
  const w = pool.find((x) => x.id === target.id)?.rar ?? 0;
  const sum = pool.reduce((n, x) => n + x.rar, 0);
  const pick = w && sum ? w / sum : 0;
  // La calidad de conjunto sólo se tira si falló la de único.
  const quality = target.k === "u" ? pu : (1 - pu) * qualityChance(row.S, "s", kill.mlvl, base.q, s.mf, q[1]);
  return { hit: quality * pick, quality, pick };
}

/** (ítems generados k, salió el buscado h) → probabilidad, en `d[k*2 + h]`. */
type Dist = Float64Array;

function itemDist(room: number, p: number): Dist {
  const d = new Float64Array((room + 1) * 2);
  if (room === 0) d[0] = 1;
  else {
    d[2] = 1 - p;
    d[3] = p;
  }
  return d;
}
/** Un ítem que no es el buscado: ocupa un lugar si queda. */
const OTHER_ITEM: Dist[] = Array.from({ length: MAX_ITEMS + 1 }, (_, room) => itemDist(room, 0));

/**
 * Corre las tiradas de un TC con `cap` lugares libres; `sub` da la distribución de cada entrada.
 * Sin tope (`limited` en falso) nada se corta: la cuenta de ítems se satura en `cap` y no bloquea.
 */
function runPicks(cap: number, picks: number, roll: Roll, sub: (e: TcEntry, room: number) => Dist, limited = true): Dist {
  let state = new Float64Array((cap + 1) * 2);
  state[0] = 1;
  const seq = picks >= 0 ? null : negativeSequence(roll.list, -picks);
  const n = seq ? seq.length : picks;
  const weights = seq ? null : roll.list.map((e) => e[1] / roll.total);
  const nodrop = seq || !roll.total ? 0 : roll.noDrop / roll.total;
  for (let i = 0; i < n; i++) {
    const next = new Float64Array((cap + 1) * 2);
    for (let used = 0; used <= cap; used++) {
      for (let h = 0; h < 2; h++) {
        const pi = state[used * 2 + h];
        if (!pi) continue;
        if ((limited && used === cap) || (!seq && !roll.total)) {
          next[used * 2 + h] += pi;
          continue;
        }
        if (nodrop) next[used * 2 + h] += pi * nodrop;
        const room = limited ? cap - used : cap;
        const count = seq ? 1 : roll.list.length;
        for (let j = 0; j < count; j++) {
          const e = seq ? seq[i] : roll.list[j];
          const w = pi * (seq ? 1 : weights![j]);
          const d = sub(e, room);
          for (let k = 0; k <= room; k++) {
            const miss = d[k * 2];
            const hit = d[k * 2 + 1];
            const to = Math.min(used + k, cap);
            if (miss) next[to * 2 + h] += w * miss;
            if (hit) next[to * 2 + 1] += w * hit;
          }
        }
      }
    }
    state = next;
  }
  return state;
}

/** Cuántos ítems da un TC que no puede dar el buscado: vale para cualquier búsqueda con el mismo contexto. */
class CountCache {
  private memo = new Map<string, Dist>();
  constructor(
    readonly D: Indexed,
    readonly kill: KillCtx,
    readonly s: Settings,
    readonly limited: boolean,
  ) {}
  dist(name: string, cap: number): Dist {
    const key = `${name}|${cap}`;
    let d = this.memo.get(key);
    if (!d) {
      const roll = rollOf(this.D, name, this.kill, this.s);
      d = runPicks(cap, this.D.tcs[name].p, roll, (e, room) => (this.D.tcs[e[0]] ? this.dist(e[0], room) : OTHER_ITEM[room]), this.limited);
      this.memo.set(key, d);
    }
    return d;
  }
}

const countCaches = new Map<string, CountCache>();
function countsFor(D: Indexed, kill: KillCtx, s: Settings, limited: boolean): CountCache {
  // Contar ítems no depende del nivel ni del MF: sólo de las condiciones, de los jugadores y del tope.
  const key = `${kill.diff}|${+kill.desec}|${+kill.herald}|${kill.tier}|${s.players}|${s.party}|${+s.ladder}|${s.season}|${+limited}`;
  let c = countCaches.get(key);
  if (!c || c.D !== D) countCaches.set(key, (c = new CountCache(D, kill, s, limited)));
  return c;
}

class Evaluator {
  private dists = new Map<string, Dist>();
  private leaves = new Map<string, number>();
  readonly keys: string[];
  constructor(
    readonly D: Indexed,
    readonly target: Target,
    readonly kill: KillCtx,
    readonly s: Settings,
    readonly counts: CountCache,
  ) {
    this.keys = targetKeys(D, target);
  }

  get limited(): boolean {
    return this.counts.limited;
  }

  reaches(name: string): boolean {
    if (!this.D.tcs[name]) return this.keys.includes(name);
    const r = reach(this.D, name);
    return this.keys.some((k) => r.has(k));
  }

  tcDist(name: string, cap: number, q: Q4): Dist {
    const qq = maxQ(q, this.D.tcs[name].q);
    const key = `${name}|${cap}|${qq}`;
    let d = this.dists.get(key);
    if (!d) {
      const roll = rollOf(this.D, name, this.kill, this.s);
      d = runPicks(cap, this.D.tcs[name].p, roll, (e, room) => this.entryDist(e, room, qq), this.limited);
      this.dists.set(key, d);
    }
    return d;
  }

  entryDist(e: TcEntry, room: number, q: Q4): Dist {
    const qe = maxQ(q, e[2]);
    if (this.D.tcs[e[0]]) return this.reaches(e[0]) ? this.tcDist(e[0], room, qe) : this.counts.dist(e[0], room);
    if (!this.keys.includes(e[0])) return OTHER_ITEM[room];
    return itemDist(room, this.leaf(e[0], qe));
  }

  leaf(code: string, q: Q4): number {
    const key = `${code}|${q}`;
    let p = this.leaves.get(key);
    if (p === undefined) this.leaves.set(key, (p = leafParts(this.D, this.target, code, q, this.kill, this.s).hit));
    return p;
  }

  root(): number {
    const d = this.tcDist(this.kill.tc, MAX_ITEMS, NO_Q);
    let p = 0;
    for (let k = 0; k <= MAX_ITEMS; k++) p += d[k * 2 + 1];
    return p;
  }
}

/**
 * La chance de que una muerte suelte al menos uno del buscado. `{ cap: false }` no aplica el tope de 6 ítems:
 * es lo que calcula Silospen, y sólo sirve para compararse con él.
 */
export function chancePerKill(D: Indexed, target: Target, kill: KillCtx, s: Settings, opts: { cap?: boolean } = {}): number {
  const tc = D.tcs[kill.tc];
  if (!tc || !condOk(tc.c, kill) || !ladderOk(tc.lad, s.ladder, s.season)) return 0;
  const ev = new Evaluator(D, target, kill, s, countsFor(D, kill, s, opts.cap !== false));
  if (!ev.reaches(kill.tc)) return 0;
  return ev.root();
}

export interface PathStep {
  tc: string;
  picks: number;
  /** La chance de tomar este camino en una tirada del TC anterior (1 en el primero y en las entradas de un TC con tiradas negativas, que salen seguras). */
  share: number;
}
export interface PathEnd {
  code: string;
  share: number;
  quality: number | null;
  pick: number | null;
}

/** El camino que más aporta, para "¿De dónde sale este número?". */
export function explainPath(D: Indexed, target: Target, kill: KillCtx, s: Settings): { steps: PathStep[]; end: PathEnd } | null {
  if (!D.tcs[kill.tc]) return null;
  const ev = new Evaluator(D, target, kill, s, countsFor(D, kill, s, true));
  if (!ev.reaches(kill.tc)) return null;
  const steps: PathStep[] = [{ tc: kill.tc, picks: D.tcs[kill.tc].p, share: 1 }];
  let name = kill.tc;
  let q = maxQ(NO_Q, D.tcs[name].q);
  for (let guard = 0; guard < 32; guard++) {
    const roll = rollOf(D, name, kill, s);
    // Con tiradas negativas nada se sortea: las entradas de la secuencia salen seguras y las demás nunca.
    const seq = D.tcs[name].p < 0 ? negativeSequence(roll.list, -D.tcs[name].p) : null;
    let best: { e: TcEntry; share: number; score: number } | null = null;
    for (const e of seq ? new Set(seq) : roll.list) {
      if (!ev.reaches(e[0])) continue;
      const d = ev.entryDist(e, MAX_ITEMS, q);
      let hit = 0;
      for (let k = 0; k <= MAX_ITEMS; k++) hit += d[k * 2 + 1];
      const share = seq ? 1 : e[1] / roll.total;
      if (!best || share * hit > best.score) best = { e, share, score: share * hit };
    }
    if (!best) return null;
    q = maxQ(q, best.e[2]);
    const next = best.e[0];
    if (!D.tcs[next]) {
      const parts = leafParts(D, target, next, q, kill, s);
      return { steps, end: { code: next, share: best.share, quality: parts.quality, pick: parts.pick } };
    }
    q = maxQ(q, D.tcs[next].q);
    steps.push({ tc: next, picks: D.tcs[next].p, share: best.share });
    name = next;
  }
  return null;
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run test/d2rDropsEngine.test.ts`
Expected: PASS (11 de juguete, 40 contra el evaluador exacto y 5 contra Silospen en vivo). Si un caso no da:
1. Correr `explainPath` para ese caso y mirar el camino: ¿qué TC, qué base, qué calidad?
2. Comparar con el evaluador exacto del scratchpad de la sesión (`d2calc.py`, con `task3_check.py`).
3. Corregir la regla que difiera, anotarla en el diseño y volver a correr todo el archivo.

- [ ] **Step 5: Chequeo de tipos**

Run: `npx tsc -b`
Expected: sin errores.

---

### Task 4: Los lugares — jefes, superúnicos, áreas y Zonas de Terror

**Files:**
- Create: `site/src/d2r/drops/places.ts`
- Test: `site/test/d2rDropsPlaces.test.ts`

**Interfaces:**
- Consumes:
  - `Indexed` (Task 2);
  - de Task 3: `chancePerKill(D, target, kill, s)` y `reach(D, name)`;
  - `upgradeTc(D, name, level)` (Task 2).
- Produces:
  - `type Cat = "normal" | "champ" | "unique" | "herald"` y `CATS`;
  - `interface PlaceOpts { tz: number; tier: number; quest: boolean }` y `NO_TZ`;
  - `type PlaceRef = { k: "s"; id: string } | { k: "a"; id: number; cat: Cat }`;
  - `terrorLevel(D, base, clvl, diff)` y `killKey(kill)`;
  - `sourceKill(D, src, diff, o): KillCtx | null`;
  - `areaKills(D, area, diff, cat, o): { mon: string; w: number; kill: KillCtx }[]`;
  - `placeKill(D, place, diff, o): KillCtx | null`;
  - `interface BossRow { key: string; src: DropSource; diff: Diff; tz: boolean; kill: KillCtx; p: number }`;
  - `interface AreaRow { key: string; area: DropArea; diff: Diff; tz: boolean; p: Record<Cat, number>; best: KillCtx | null }`;
  - `bestPlaces(D, target, s, o, diffs, limit): { bosses: BossRow[]; areas: AreaRow[] }`;
  - `interface DropLine { target: Target; p: number }` e `interface DropLists { runes: DropLine[]; uniques: DropLine[]; sets: DropLine[] }`;
  - `dropsOf(D, kill, s): DropLists`.
- **Claves de lugar:**
  - `s.<id>.<diff>` y `a.<areaId>.<diff>`;
  - con Zona de Terror suman `.tz`.

- [ ] **Step 1: Escribir el test**

```ts
// site/test/d2rDropsPlaces.test.ts
import { describe, expect, it } from "vitest";
import { chancePerKill } from "../src/d2r/drops/engine";
import { dropData } from "../src/d2r/drops/data";
import { areaKills, bestPlaces, dropsOf, NO_TZ, placeKill, sourceKill } from "../src/d2r/drops/places";
import type { Settings, Target } from "../src/d2r/drops/types";

const D = dropData();
const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const SHAKO: Target = { k: "u", id: "harlequin-crest" };
const IST: Target = { k: "b", code: "r24" };
const src = (id: string) => D.sourceById.get(id)!;
/** Referencias del evaluador exacto sobre el parche instalado, con el tope de 6 (ver d2rDropsEngine.test.ts). */
const exact = (got: number, want: number) => expect(Math.abs(got - want) / want, `${got} vs ${want}`).toBeLessThan(1e-6);

describe("jefes y superúnicos", () => {
  it("los jefes conservan su nivel; los superúnicos toman el del área y suman 3", () => {
    expect(sourceKill(D, src("mephisto"), 2, NO_TZ)?.mlvl).toBe(87);
    expect(sourceKill(D, src("the-countess"), 2, NO_TZ)?.mlvl).toBe(82); // Sótano de la torre 5: 79 + 3
    expect(sourceKill(D, src("pindleskin"), 2, NO_TZ)?.mlvl).toBe(86); // Templo de Nihlathak: 83 + 3
    expect(sourceKill(D, src("mephisto"), 2, NO_TZ)?.tc).toBe("Mephisto (H)");
  });

  it("Ist de la Condesa, Pindleskin y Eldritch; Shako de Mefisto, Radament y el Invocador", () => {
    exact(chancePerKill(D, IST, sourceKill(D, src("the-countess"), 2, NO_TZ)!, S0), 0.00348609357);
    exact(chancePerKill(D, IST, sourceKill(D, src("pindleskin"), 2, NO_TZ)!, S0), 2.94455037e-5);
    exact(chancePerKill(D, IST, sourceKill(D, src("eldritch-the-rectifier"), 2, NO_TZ)!, S0), 2.94455037e-5);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("mephisto"), 2, NO_TZ)!, S0), 0.000561844573);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("radament"), 2, NO_TZ)!, S0), 6.32257558e-5);
    exact(chancePerKill(D, SHAKO, sourceKill(D, src("the-summoner"), 2, NO_TZ)!, S0), 5.94030562e-5);
  });

  it("la Condesa sin el tope da el número de Silospen en vivo; con el tope de 6, las runas pierden un 18%", () => {
    const k = sourceKill(D, src("the-countess"), 2, NO_TZ)!;
    exact(chancePerKill(D, IST, k, S0, { cap: false }), 0.00423972729);
    expect(chancePerKill(D, IST, k, S0)).toBeLessThan(0.0036);
  });

  it("aterrorizado a nivel 90, Mefisto pasa a 92 y usa su TC de Zona de Terror", () => {
    const k = sourceKill(D, src("mephisto"), 2, { ...NO_TZ, tz: 90 })!;
    expect(k.desec).toBe(true);
    expect(k.mlvl).toBe(92);
    expect(k.tc).toMatch(/^Mephisto \(H\) Desecrated/);
  });

  it("el Clon de Diablo no tiene área y suelta el Annihilus", () => {
    const k = sourceKill(D, src("diablo-clone"), 2, NO_TZ)!;
    const anni = D.uniques.find((u) => u.key === "Annihilus")!;
    expect(chancePerKill(D, { k: "u", id: anni.id }, k, S0)).toBeGreaterThan(0.99);
  });
});

describe("monstruos de un área: Pozo nivel 1 en Infierno (comunes y Zona de Terror: iguales a Silospen en vivo)", () => {
  const pit = D.areaById.get(12)!;
  const one = (cat: "normal" | "champ" | "unique", mon: string, tz = 0) =>
    areaKills(D, pit, 2, cat, { ...NO_TZ, tz }).find((k) => k.mon === mon)!.kill;

  it("comunes, campeones y únicos", () => {
    exact(chancePerKill(D, SHAKO, one("normal", "skeleton3"), S0), 4.83630312e-7);
    exact(chancePerKill(D, SHAKO, one("normal", "cr_archer3"), S0), 3.92949629e-7);
    // Campeones y únicos: el 3.3 cambió `Act 5 (H) Citem C` y `Uitem C` (Silospen en vivo: 7,98e-6 y 2,02e-5).
    exact(chancePerKill(D, SHAKO, one("champ", "skeleton3"), S0), 7.03104478e-6);
    exact(chancePerKill(D, SHAKO, one("unique", "skeleton3"), S0), 2.06240741e-5);
  });

  it("aterrorizados con tu nivel en 90", () => {
    exact(chancePerKill(D, SHAKO, one("normal", "skeleton3", 90), S0), 4.92880073e-7);
    exact(chancePerKill(D, SHAKO, one("normal", "cr_archer3", 90), S0), 4.00465059e-7);
  });
});

describe("los mejores lugares y lo que suelta cada uno", () => {
  it("para la Cresta del arlequín en Infierno, Mefisto, Diablo y Baal van primeros", () => {
    const { bosses, areas } = bestPlaces(D, SHAKO, S0, NO_TZ, [2], 5);
    expect(bosses.slice(0, 3).map((b) => b.src.id).sort()).toEqual(["baal", "diablo", "mephisto"]);
    expect(bosses[0].p).toBeGreaterThan(bosses[4].p);
    expect(areas.length).toBeGreaterThan(0);
    expect(areas[0].best).not.toBeNull();
  });

  it("para Ist, la Condesa es la mejor", () => {
    expect(bestPlaces(D, IST, S0, NO_TZ, [2], 3).bosses[0].src.id).toBe("the-countess");
  });

  it("qué suelta Mefisto: la Cresta del arlequín con la chance del motor, y runas de El a Cham (Zod sólo cuelga de Act 5 (H) Good)", () => {
    const lists = dropsOf(D, sourceKill(D, src("mephisto"), 2, NO_TZ)!, S0);
    const shako = lists.uniques.find((l) => l.target.k === "u" && l.target.id === "harlequin-crest")!;
    exact(shako.p, 0.000561844573);
    const codes = lists.runes.map((l) => (l.target.k === "b" ? l.target.code : ""));
    expect(codes).toContain("r01");
    expect(codes).toContain("r32");
    expect(codes).not.toContain("r33");
    expect(lists.uniques[0].p).toBeGreaterThanOrEqual(lists.uniques[lists.uniques.length - 1].p);
  });

  it("un área como lugar: el monstruo más común del tipo elegido", () => {
    const k = placeKill(D, { k: "a", id: 12, cat: "champ" }, 2, NO_TZ)!;
    expect(k.mlvl).toBe(87); // Pozo 1 en Infierno: 85 + 2
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsPlaces.test.ts`
Expected: FAIL, "Failed to resolve import ../src/d2r/drops/places".

- [ ] **Step 3: Escribir `site/src/d2r/drops/places.ts`**

```ts
/**
 * Los lugares donde se farmea (2026-09-29): jefes, superúnicos y los monstruos
 * de cada área, en cada dificultad, con y sin Zona de Terror. Acá se decide el
 * TC de cada muerte (con su mejora por nivel) y su nivel; la chance la da el
 * motor. Reglas en docs/design/2026-09-29-d2r-calculadora-drops.md.
 */
import type { Indexed } from "./data";
import { chancePerKill, reach } from "./engine";
import { upgradeTc } from "./rules";
import type { Diff, DropArea, DropSource, KillCtx, Settings, Target } from "./types";

export type Cat = "normal" | "champ" | "unique" | "herald";
export const CATS: Cat[] = ["normal", "champ", "unique", "herald"];

/** Lo que cambia dónde y cómo muere el monstruo: Zona de Terror (tu nivel; 0 = sin), nivel del Heraldo y misión. */
export interface PlaceOpts {
  tz: number;
  tier: number;
  quest: boolean;
}
export const NO_TZ: PlaceOpts = { tz: 0, tier: 1, quest: false };
const noTz = (o: PlaceOpts): PlaceOpts => ({ ...o, tz: 0 });

/** Un lugar para "¿Qué suelta?" y el simulador: un jefe o superúnico, o un tipo de monstruo de un área. */
export type PlaceRef = { k: "s"; id: string } | { k: "a"; id: number; cat: Cat };

/** El nivel de un monstruo aterrorizado: tu nivel + 2 entre los topes de la dificultad, o el suyo si era mayor. */
export function terrorLevel(D: Indexed, base: number, clvl: number, diff: Diff): number {
  const [min, max] = D.tz.b[diff];
  return Math.max(base, Math.min(Math.max(clvl + D.tz.boost, min), max));
}

export const killKey = (k: KillCtx): string => `${k.tc}|${k.mlvl}|${k.diff}|${+k.desec}|${+k.herald}|${k.tier}`;

/** Cómo muere un jefe o superúnico en una dificultad; null si ahí no suelta nada. */
export function sourceKill(D: Indexed, src: DropSource, diff: Diff, o: PlaceOpts): KillCtx | null {
  const mon = D.monsters[src.mon];
  if (!mon) return null;
  const area = src.area !== null ? D.areaById.get(src.area) : undefined;
  const desec = o.tz > 0 && !!area?.tz;
  const boss = !!mon.boss;
  // Los jefes conservan su nivel; los superúnicos toman el del área (en Normal, el suyo) y suman 3.
  const own = boss || diff === 0 || !area ? mon.lv[diff] : area.lv[diff];
  const mlvl = (desec ? terrorLevel(D, own, o.tz, diff) : own) + (boss ? 0 : 3);
  const m = mon.tc[diff];
  let tc = src.tc ? (desec && src.tcd?.[diff]) || src.tc[diff] : (desec && m[4]) || (o.quest && m[3]) || m[0];
  if (!tc || !D.tcs[tc]) return null;
  // Los jefes no mejoran su TC, salvo aterrorizados.
  if (!boss || desec) tc = upgradeTc(D, tc, mlvl);
  return { tc, mlvl, diff, desec, herald: false, tier: 0 };
}

/** Columna de TC de monstats para cada tipo: sin y con Zona de Terror. */
const TC_COL: Record<Cat, [number, number]> = { normal: [0, 4], champ: [1, 5], unique: [2, 6], herald: [2, 7] };
const BONUS: Record<Cat, number> = { normal: 0, champ: 2, unique: 3, herald: 3 };

/** Los monstruos de un área para un tipo de muerte, cada uno con su peso de aparición. */
export function areaKills(D: Indexed, area: DropArea, diff: Diff, cat: Cat, o: PlaceOpts): { mon: string; w: number; kill: KillCtx }[] {
  const desec = o.tz > 0 && !!area.tz;
  // Los Heraldos sólo aparecen en las Zonas de Terror de Infierno.
  if (cat === "herald" && !(desec && diff === 2 && D.tz.maxTier > 0)) return [];
  // En Pesadilla e Infierno todos salen de `nmon`; en Normal los únicos tienen su lista.
  const list = diff > 0 ? area.nmon : (cat === "unique" || cat === "herald") && area.umon.length ? area.umon : area.mon;
  const [plain, terror] = TC_COL[cat];
  const out: { mon: string; w: number; kill: KillCtx }[] = [];
  for (const id of list) {
    const mon = D.monsters[id];
    if (!mon) continue;
    const base = mon.boss || diff === 0 ? mon.lv[diff] : area.lv[diff];
    const mlvl = (desec ? terrorLevel(D, base, o.tz, diff) : base) + BONUS[cat];
    let tc = cat === "herald" ? mon.tc[diff][terror] : (desec && mon.tc[diff][terror]) || mon.tc[diff][plain];
    if (!tc || !D.tcs[tc]) continue;
    // El Heraldo sube el nivel de TC que usa, no el del ítem.
    const boost = cat === "herald" ? (D.tz.heraldTc[Math.min(o.tier, D.tz.heraldTc.length) - 1] ?? 0) : 0;
    tc = upgradeTc(D, tc, mlvl + boost);
    out.push({ mon: id, w: mon.rar || 1, kill: { tc, mlvl, diff, desec, herald: cat === "herald", tier: cat === "herald" ? o.tier : 0 } });
  }
  return out;
}

/** La muerte que representa un lugar: el jefe, o el monstruo más común del área para ese tipo. */
export function placeKill(D: Indexed, place: PlaceRef, diff: Diff, o: PlaceOpts): KillCtx | null {
  if (place.k === "s") {
    const src = D.sourceById.get(place.id);
    return src ? sourceKill(D, src, diff, o) : null;
  }
  const area = D.areaById.get(place.id);
  if (!area) return null;
  let best: { w: number; kill: KillCtx } | null = null;
  for (const k of areaKills(D, area, diff, place.cat, o)) if (!best || k.w > best.w) best = k;
  return best?.kill ?? null;
}

export interface BossRow {
  key: string;
  src: DropSource;
  diff: Diff;
  tz: boolean;
  kill: KillCtx;
  p: number;
}
export interface AreaRow {
  key: string;
  area: DropArea;
  diff: Diff;
  tz: boolean;
  /** Chance por monstruo de cada tipo, promediada por su peso de aparición. */
  p: Record<Cat, number>;
  /** La muerte que explica la fila (el monstruo más común del primer tipo que lo suelta). */
  best: KillCtx | null;
}

/** Los mejores lugares para el buscado: jefes y superúnicos por muerte, y áreas por monstruo. */
export function bestPlaces(D: Indexed, target: Target, s: Settings, o: PlaceOpts, diffs: Diff[], limit = 10): { bosses: BossRow[]; areas: AreaRow[] } {
  // Muchos monstruos de un área (y muchas áreas) terminan en la misma TC al mismo nivel.
  const memo = new Map<string, number>();
  const chance = (kill: KillCtx) => {
    const key = killKey(kill);
    let p = memo.get(key);
    if (p === undefined) memo.set(key, (p = chancePerKill(D, target, kill, s)));
    return p;
  };

  const bosses: BossRow[] = [];
  for (const src of D.sources) {
    for (const diff of diffs) {
      for (const oo of o.tz > 0 ? [noTz(o), o] : [o]) {
        const kill = sourceKill(D, src, diff, oo);
        if (!kill || (oo.tz > 0 && !kill.desec)) continue;
        const p = chance(kill);
        if (p > 0) bosses.push({ key: `s.${src.id}.${diff}${kill.desec ? ".tz" : ""}`, src, diff, tz: kill.desec, kill, p });
      }
    }
  }

  const areas: AreaRow[] = [];
  for (const area of D.areas) {
    for (const diff of diffs) {
      for (const oo of o.tz > 0 && area.tz ? [noTz(o), o] : [noTz(o)]) {
        const p: Record<Cat, number> = { normal: 0, champ: 0, unique: 0, herald: 0 };
        let best: KillCtx | null = null;
        for (const cat of CATS) {
          const kills = areaKills(D, area, diff, cat, oo);
          const wsum = kills.reduce((n, k) => n + k.w, 0);
          if (!wsum) continue;
          p[cat] = kills.reduce((n, k) => n + k.w * chance(k.kill), 0) / wsum;
          if (!best && p[cat] > 0) {
            let top: { w: number; kill: KillCtx } | null = null;
            for (const k of kills) if (chance(k.kill) > 0 && (!top || k.w > top.w)) top = k;
            best = top?.kill ?? null;
          }
        }
        if (best) areas.push({ key: `a.${area.id}.${diff}${oo.tz > 0 ? ".tz" : ""}`, area, diff, tz: oo.tz > 0, p, best });
      }
    }
  }

  bosses.sort((a, b) => b.p - a.p);
  areas.sort((a, b) => b.p.normal - a.p.normal || b.p.champ - a.p.champ || b.p.unique - a.p.unique);
  return { bosses: bosses.slice(0, limit), areas: areas.slice(0, limit) };
}

export interface DropLine {
  target: Target;
  p: number;
}
export interface DropLists {
  runes: DropLine[];
  uniques: DropLine[];
  sets: DropLine[];
}

/** Lo que puede soltar una muerte: runas (en su orden), únicos y piezas (de más a menos probable). */
export function dropsOf(D: Indexed, kill: KillCtx, s: Settings): DropLists {
  const r = reach(D, kill.tc);
  const line = (target: Target): DropLine => ({ target, p: chancePerKill(D, target, kill, s) });
  const byP = (a: DropLine, b: DropLine) => b.p - a.p;
  return {
    runes: Object.keys(D.bases)
      .filter((c) => /^r\d\d$/.test(c) && r.has(c))
      .sort()
      .map((code) => line({ k: "b", code }))
      .filter((x) => x.p > 0),
    uniques: D.uniques
      .filter((u) => r.has(u.code) || r.has(u.key))
      .map((u) => line({ k: "u", id: u.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
    sets: D.sets
      .filter((x) => r.has(x.code) || r.has(x.key))
      .map((x) => line({ k: "s", id: x.id }))
      .filter((x) => x.p > 0)
      .sort(byP),
  };
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run test/d2rDropsPlaces.test.ts`
Expected: PASS. Si falla un caso, se sigue el procedimiento de la Task 3, Step 4: camino, evaluador exacto (`d2calc.py` con `task4_refs.py`, en el scratchpad de la sesión) y corregir la regla.

- [ ] **Step 5: Medir que "¿Dónde lo farmeo?" sea instantáneo**

Sumar al final del archivo de test:

```ts
it("buscar la Cresta del arlequín en las tres dificultades tarda menos de 1,5 s", () => {
  const t0 = performance.now();
  bestPlaces(D, SHAKO, { ...S0, mf: 300 }, NO_TZ, [0, 1, 2], 10);
  expect(performance.now() - t0).toBeLessThan(1500);
});
```

Run: `npx vitest run test/d2rDropsPlaces.test.ts`
Expected: PASS. Si pasa de 1,5 s, perfilar con `console.time` alrededor de `chancePerKill` y revisar que `reach` corte los lugares que no llegan.

---

### Task 5: El simulador

**Files:**
- Create: `site/src/d2r/drops/simulate.ts`
- Test: `site/test/d2rDropsSim.test.ts`

**Interfaces:**
- Consumes:
  - de `engine.ts` (Task 3): `rollOf`, `negativeSequence`, `eligibleUniques`, `eligibleSets`, `MAX_ITEMS` y `maxQ`;
  - de `rules.ts` (Task 2): `condOk`, `ladderOk`, `qualityChance` y `ratioRow`.
- Produces:
  - `type LootQuality = "unique" | "set" | "rare" | "magic" | "normal"`;
  - `interface Loot { code: string; q: LootQuality; id?: string }`;
  - `mulberry32(seed): () => number`;
  - `simulateKill(D, kill, s, rnd): Loot[]`;
  - `simulateRuns(D, kill, s, runs, seed): Loot[][]`;
  - `interface LootSummary { notable: { loot: Loot; count: number }[]; rare: number; magic: number; normal: number; gold: number }`;
  - `summarize(D, runs): LootSummary`.

- [ ] **Step 1: Escribir el test**

```ts
// site/test/d2rDropsSim.test.ts
import { describe, expect, it } from "vitest";
import { chancePerKill } from "../src/d2r/drops/engine";
import { dropData } from "../src/d2r/drops/data";
import { NO_TZ, sourceKill } from "../src/d2r/drops/places";
import { mulberry32, simulateKill, simulateRuns, summarize } from "../src/d2r/drops/simulate";
import type { Settings } from "../src/d2r/drops/types";

const D = dropData();
const S0: Settings = { mf: 0, players: 1, party: 1, ladder: false, season: 15 };
const kill = (id: string, diff: 0 | 1 | 2 = 2) => sourceKill(D, D.sourceById.get(id)!, diff, NO_TZ)!;

describe("el simulador", () => {
  it("la misma semilla da la misma secuencia y el mismo cofre", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(simulateRuns(D, kill("mephisto"), S0, 20, 7)).toEqual(simulateRuns(D, kill("mephisto"), S0, 20, 7));
  });

  it("nunca más de 6 ítems por muerte, ni con 8 jugadores contra Baal", () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 3000; i++) expect(simulateKill(D, kill("baal"), { ...S0, players: 8 }, rnd).length).toBeLessThanOrEqual(6);
  });

  it("el sorteo da lo mismo que la cuenta exacta: Ist de la Condesa en 100.000 muertes", () => {
    const k = kill("the-countess");
    const exact = chancePerKill(D, { k: "b", code: "r24" }, k, S0);
    const rnd = mulberry32(2026);
    const n = 100_000;
    let hits = 0;
    for (let i = 0; i < n; i++) if (simulateKill(D, k, S0, rnd).some((l) => l.code === "r24")) hits++;
    const sigma = Math.sqrt((exact * (1 - exact)) / n);
    expect(Math.abs(hits / n - exact)).toBeLessThan(5 * sigma);
  });

  it("el resumen separa lo notable (únicos, piezas y runas) del resto", () => {
    const sum = summarize(D, simulateRuns(D, kill("mephisto"), { ...S0, mf: 500 }, 300, 99));
    expect(sum.notable.every((x) => x.loot.q === "unique" || x.loot.q === "set" || /^r\d\d$/.test(x.loot.code))).toBe(true);
    expect(sum.rare + sum.magic).toBeGreaterThan(0);
    expect(sum.gold).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsSim.test.ts`
Expected: FAIL, "Failed to resolve import ../src/d2r/drops/simulate".

- [ ] **Step 3: Escribir `site/src/d2r/drops/simulate.ts`**

```ts
/**
 * El simulador de la calculadora de drops (2026-09-29): "abrir el cofre" de N
 * runs con las mismas reglas que el motor exacto, sorteadas. La semilla va en
 * el enlace (mulberry32), así el mismo enlace da el mismo cofre y se puede
 * compartir. El test compara el sorteo con la cuenta exacta.
 */
import type { Indexed } from "./data";
import { MAX_ITEMS, eligibleSets, eligibleUniques, maxQ, negativeSequence, rollOf } from "./engine";
import { condOk, ladderOk, qualityChance, ratioRow } from "./rules";
import type { KillCtx, Q4, Settings, TcEntry } from "./types";

export type LootQuality = "unique" | "set" | "rare" | "magic" | "normal";
export interface Loot {
  code: string;
  q: LootQuality;
  /** El único o la pieza, si salió uno. */
  id?: string;
}

/** Generador con semilla: rápido y con buena distribución para esto. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { rar: number }>(list: T[], rnd: () => number): T | null {
  const total = list.reduce((n, x) => n + x.rar, 0);
  if (!total) return null;
  let r = rnd() * total;
  for (const x of list) {
    if (r < x.rar) return x;
    r -= x.rar;
  }
  return list[list.length - 1];
}

/** La calidad de una base, en el orden del juego: único, conjunto, raro, mágico, normal. */
export function rollItem(D: Indexed, code: string, q: Q4, kill: KillCtx, s: Settings, rnd: () => number): Loot {
  const b = D.bases[code];
  if (!b || b.qf === 1) return { code, q: "normal" };
  const row = ratioRow(D.ratio, b);
  if (rnd() < qualityChance(row.U, "u", kill.mlvl, b.q, s.mf, q[0])) {
    const u = pickWeighted(eligibleUniques(D, code, kill, s), rnd);
    // Único fallido: sale raro (o mágico, si la base no puede ser rara).
    return u ? { code, q: "unique", id: u.id } : { code, q: b.qf === 3 ? "magic" : "rare" };
  }
  if (rnd() < qualityChance(row.S, "s", kill.mlvl, b.q, s.mf, q[1])) {
    const x = pickWeighted(eligibleSets(D, code, kill, s), rnd);
    return x ? { code, q: "set", id: x.id } : { code, q: "magic" };
  }
  if (b.qf !== 3 && rnd() < qualityChance(row.R, "r", kill.mlvl, b.q, s.mf, q[2])) return { code, q: "rare" };
  if (b.qf >= 2 || rnd() < qualityChance(row.M, "m", kill.mlvl, b.q, s.mf, q[3])) return { code, q: "magic" };
  return { code, q: "normal" };
}

function runEntry(D: Indexed, e: TcEntry, q: Q4, kill: KillCtx, s: Settings, rnd: () => number, out: Loot[]) {
  const t = e[0];
  const qe = maxQ(q, e[2]);
  if (D.tcs[t]) return runTc(D, t, qe, kill, s, rnd, out);
  if (out.length >= MAX_ITEMS) return;
  if (t === "gld") return void out.push({ code: "gld", q: "normal" });
  if (!D.bases[t]) {
    const fu = D.uniqueByKey.get(t);
    if (fu) return void out.push({ code: fu.code, q: "unique", id: fu.id });
    const fs = D.setByKey.get(t);
    if (fs) return void out.push({ code: fs.code, q: "set", id: fs.id });
    return;
  }
  out.push(rollItem(D, t, qe, kill, s, rnd));
}

function runTc(D: Indexed, name: string, q: Q4, kill: KillCtx, s: Settings, rnd: () => number, out: Loot[]) {
  const tc = D.tcs[name];
  const qq = maxQ(q, tc.q);
  const { list, noDrop, total } = rollOf(D, name, kill, s);
  if (tc.p >= 0) {
    for (let i = 0; i < tc.p && out.length < MAX_ITEMS; i++) {
      let r = rnd() * total;
      if (r < noDrop) continue;
      r -= noDrop;
      for (const e of list) {
        if (r < e[1]) {
          runEntry(D, e, qq, kill, s, rnd, out);
          break;
        }
        r -= e[1];
      }
    }
  } else {
    for (const e of negativeSequence(list, -tc.p)) {
      if (out.length >= MAX_ITEMS) break;
      runEntry(D, e, qq, kill, s, rnd, out);
    }
  }
}

/** Lo que suelta una muerte. */
export function simulateKill(D: Indexed, kill: KillCtx, s: Settings, rnd: () => number): Loot[] {
  const out: Loot[] = [];
  const tc = D.tcs[kill.tc];
  if (tc && condOk(tc.c, kill) && ladderOk(tc.lad, s.ladder, s.season)) runTc(D, kill.tc, [0, 0, 0, 0], kill, s, rnd, out);
  return out;
}

/** Lo que sueltan N runs (una muerte cada una), siempre igual para la misma semilla. */
export function simulateRuns(D: Indexed, kill: KillCtx, s: Settings, runs: number, seed: number): Loot[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: runs }, () => simulateKill(D, kill, s, rnd));
}

export interface LootSummary {
  /** Únicos, piezas y runas, contados y ordenados de lo más valioso a lo menos. */
  notable: { loot: Loot; count: number }[];
  rare: number;
  magic: number;
  normal: number;
  gold: number;
}

export function summarize(D: Indexed, runs: Loot[][]): LootSummary {
  const notable = new Map<string, { loot: Loot; count: number }>();
  const sum: LootSummary = { notable: [], rare: 0, magic: 0, normal: 0, gold: 0 };
  for (const loot of runs.flat()) {
    const rune = /^r\d\d$/.test(loot.code);
    if (loot.q === "unique" || loot.q === "set" || rune) {
      const key = `${loot.q}|${loot.id ?? loot.code}`;
      const hit = notable.get(key);
      if (hit) hit.count++;
      else notable.set(key, { loot, count: 1 });
    } else if (loot.code === "gld") sum.gold++;
    else sum[loot.q as "rare" | "magic" | "normal"]++;
  }
  const rank = (l: Loot) => (l.q === "unique" ? 0 : l.q === "set" ? 1 : 2);
  sum.notable = [...notable.values()].sort((a, b) => rank(a.loot) - rank(b.loot) || b.loot.code.localeCompare(a.loot.code) || b.count - a.count);
  return sum;
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run test/d2rDropsSim.test.ts`
Expected: PASS (4 tests). Si "el sorteo da lo mismo…" falla, el motor y el simulador interpretan distinto una regla. Hay que compararlos con un TC de juguete (Task 3), no aflojar el 5σ.

---

### Task 6: Los bloques precalculados para la wiki

**Files:**
- Create:
  - `site/src/d2r/drops/farm.ts`
  - `site/scripts/node.config.ts`
  - `site/scripts/d2-drops.ts`
- Generated:
  - `games/d2r/data/drops/computed/farm-u.json`, `farm-s.json` y `farm-r.json`;
  - `games/d2r/data/drops/computed/places.json`.
- Modify: `site/test/d2rDropsData.test.ts` (suma un bloque).

**Interfaces:**
- Consumes: de Task 4, `bestPlaces` y `NO_TZ`; de Task 2, `dropData` y `SEASON`.
- Produces:
  - `type FarmBoss = [key: string, p: number]`;
  - `type FarmArea = [key: string, normal: number, champ: number, unique: number]`;
  - `interface FarmEntry { b: FarmBoss[]; a: FarmArea[] }` y `type FarmFile = Record<string, FarmEntry>`;
  - `interface PlaceNames { s: Record<string, Loc>; a: Record<string, Loc> }`;
  - `parsePlaceKey(key): { kind: "s" | "a"; id: string; diff: Diff; tz: boolean }`;
  - `targetParam(t): string`: el ítem en la dirección (`u.harlequin-crest`, `b.r30`).

- [ ] **Step 1: Sumar el test de los archivos precalculados (falla porque no existen)**

Al final de `site/test/d2rDropsData.test.ts`:

```ts
import farmU from "../../games/d2r/data/drops/computed/farm-u.json";
import farmR from "../../games/d2r/data/drops/computed/farm-r.json";
import places from "../../games/d2r/data/drops/computed/places.json";
import { parsePlaceKey } from "../src/d2r/drops/farm";

describe("los bloques 'Dónde farmearlo' precalculados", () => {
  type Entry = { b: [string, number][]; a: [string, number, number, number][] };
  const U = farmU as unknown as Record<string, Entry>;
  const R = farmR as unknown as Record<string, Entry>;
  const P = places as unknown as { s: Record<string, unknown>; a: Record<string, unknown> };

  it("cada lugar tiene nombre", () => {
    for (const e of [...Object.values(U), ...Object.values(R)]) {
      for (const [key] of e.b) expect(P.s[parsePlaceKey(key).id], key).toBeDefined();
      for (const [key] of e.a) expect(P.a[parsePlaceKey(key).id], key).toBeDefined();
    }
  });

  it("la Cresta del arlequín: un jefe grande de Infierno primero; Ist: la Condesa", () => {
    expect(["mephisto", "diablo", "baal"]).toContain(parsePlaceKey(U["harlequin-crest"].b[0][0]).id);
    expect(parsePlaceKey(R.r24.b[0][0]).id).toBe("the-countess");
  });
});
```

Run: `npx vitest run test/d2rDropsData.test.ts`
Expected: FAIL (no existen los archivos `computed/*`).

- [ ] **Step 2: Escribir `site/src/d2r/drops/farm.ts`**

```ts
/**
 * Lo que guarda `scripts/d2-drops.ts` para las fichas de la wiki (2026-09-29):
 * los mejores jefes y áreas de cada ítem, ya calculados, con claves de lugar
 * cortas ("s.mephisto.2", "a.12.2") y los nombres aparte.
 */
import type { Loc } from "../stats";
import type { Diff, Target } from "./types";

/** El ítem en la dirección: "u.harlequin-crest", "s.tal-rashas-guardianship", "b.r30". Vive acá porque lo usan las fichas de la wiki sin cargar la calculadora. */
export const targetParam = (t: Target): string => (t.k === "b" ? `b.${t.code}` : `${t.k}.${t.id}`);

export type FarmBoss = [key: string, p: number];
export type FarmArea = [key: string, normal: number, champ: number, unique: number];
export interface FarmEntry {
  b: FarmBoss[];
  a: FarmArea[];
}
export type FarmFile = Record<string, FarmEntry>;
export interface PlaceNames {
  s: Record<string, Loc>;
  a: Record<string, Loc>;
}

/** "s.mephisto.2.tz" → jefe mephisto en Infierno, aterrorizado. */
export function parsePlaceKey(key: string): { kind: "s" | "a"; id: string; diff: Diff; tz: boolean } {
  const [kind, id, diff, tz] = key.split(".");
  return { kind: kind === "a" ? "a" : "s", id, diff: Number(diff) as Diff, tz: tz === "tz" };
}
```

- [ ] **Step 3: Escribir `site/scripts/node.config.ts`**

```ts
/**
 * Config mínima para correr scripts del sitio con vite-node (sin los plugins
 * del build): sólo el alias de los datos de Diablo II.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@d2r": fileURLToPath(new URL("../../games/d2r/data", import.meta.url)) } },
});
```

- [ ] **Step 4: Escribir `site/scripts/d2-drops.ts`**

```ts
/**
 * Los "Dónde farmearlo" de las fichas de la wiki (2026-09-29): los mejores
 * lugares de cada único, pieza y runa con los valores de siempre (1 jugador,
 * 300% de hallazgo mágico, sin Zonas de Terror), calculados con el mismo motor
 * que la calculadora y guardados como datos, así el build no calcula nada.
 *
 * Uso (desde site/, después de drops.py):
 *   npx vite-node -c scripts/node.config.ts scripts/d2-drops.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dropData } from "../src/d2r/drops/data";
import type { FarmEntry, FarmFile, PlaceNames } from "../src/d2r/drops/farm";
import { bestPlaces, NO_TZ } from "../src/d2r/drops/places";
import type { Settings, Target } from "../src/d2r/drops/types";
import { SEASON } from "../src/d2r/season";

const OUT = fileURLToPath(new URL("../../games/d2r/data/drops/computed/", import.meta.url));
const S: Settings = { mf: 300, players: 1, party: 1, ladder: false, season: SEASON };
const D = dropData();
const round = (p: number) => Number(p.toPrecision(4));

function farm(target: Target): FarmEntry {
  const { bosses, areas } = bestPlaces(D, target, S, NO_TZ, [0, 1, 2], 3);
  return {
    b: bosses.map((r) => [r.key, round(r.p)]),
    a: areas.slice(0, 1).map((r) => [r.key, round(r.p.normal), round(r.p.champ), round(r.p.unique)]),
  };
}

const t0 = Date.now();
const u: FarmFile = {};
const s: FarmFile = {};
const r: FarmFile = {};
for (const x of D.uniques) u[x.id] = farm({ k: "u", id: x.id });
for (const x of D.sets) s[x.id] = farm({ k: "s", id: x.id });
for (const code of Object.keys(D.bases).filter((c) => /^r\d\d$/.test(c))) r[code] = farm({ k: "b", code });
const names: PlaceNames = {
  s: Object.fromEntries(D.sources.map((x) => [x.id, x.n])),
  a: Object.fromEntries(D.areas.map((x) => [String(x.id), x.n])),
};

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(OUT + name, JSON.stringify(data) + "\n");
write("farm-u.json", u);
write("farm-s.json", s);
write("farm-r.json", r);
write("places.json", names);
console.log(`d2-drops: ${Object.keys(u).length} únicos · ${Object.keys(s).length} piezas · ${Object.keys(r).length} runas · ${Math.round((Date.now() - t0) / 1000)} s`);
```

- [ ] **Step 5: Correr el script y el test**

Run (desde `site/`): `npx vite-node -c scripts/node.config.ts scripts/d2-drops.ts`
Expected: `d2-drops: 4xx únicos · 135 piezas · 33 runas · N s`, con N por debajo de unos 3 minutos.

Run: `npx vitest run test/d2rDropsData.test.ts`
Expected: PASS.

---

### Task 7: Estado en la dirección, textos, estilos, controles y buscador

**Files:**
- Create:
  - `site/src/d2r/drops/state.ts`
  - `site/src/d2r/drops/format.ts`
  - `site/src/d2r/drops/DropsControls.tsx`
  - `site/src/d2r/drops/ItemPicker.tsx`
  - `site/src/styles/d2r-drops.css`
- Modify: `site/src/d2rCopy.ts`: bloque `drops` y dos entradas de `seo`, en EN y ES.
- Test: `site/test/d2rDropsUi.test.ts`

**Interfaces:**
- Consumes:
  - de Task 4: `Cat`, `CATS`, `PlaceOpts` y `PlaceRef`;
  - de Task 6: `targetParam`;
  - `SEASON`, `dropData`, y de la wiki `fold`, `ItemIcon`, `Chips`, `tr` y `Tone`.
- Produces:
  - `type Mode = "farm" | "drops" | "sim"` y `interface DropsState`;
  - `DEFAULT_STATE`, `readState(search)` y `writeState(st)`;
  - `parseTarget(v)`, `placeParam(p)` y `parsePlace(v)`;
  - `toSettings(st): Settings` y `toOpts(st): PlaceOpts`;
  - `oddsN(p, locale, td)`, `odds(p, locale, td)` y `tcLabel(name, td)`;
  - `interface PickItem`, `ALIASES`, `pickItems()`, `searchItems(q, limit)` y `findItem(t)`;
  - los componentes `DropsControls({ st, set, mode })` e `ItemPicker({ onPick })`;
  - en el copy: `D2rCopy["drops"]` y `seo.drops`, `seo.dropsSource(name)`.

- [ ] **Step 1: Escribir el test**

```ts
// site/test/d2rDropsUi.test.ts
import { describe, expect, it } from "vitest";
import { D2R_COPY } from "../src/d2rCopy";
import { dropData } from "../src/d2r/drops/data";
import { odds, tcLabel } from "../src/d2r/drops/format";
import { ALIASES, findItem, searchItems } from "../src/d2r/drops/ItemPicker";
import { DEFAULT_STATE, readState, writeState } from "../src/d2r/drops/state";

const es = D2R_COPY.es.drops;

describe("el estado en la dirección", () => {
  it("lo que viene por defecto no se escribe", () => {
    expect(writeState(DEFAULT_STATE)).toBe("");
  });

  it("ida y vuelta con todo lo que se puede compartir", () => {
    const st = { ...DEFAULT_STATE, m: "sim" as const, item: { k: "u" as const, id: "harlequin-crest" }, place: { k: "a" as const, id: 12, cat: "champ" as const }, pdiff: 1 as const, mf: 450, players: 8, party: 3, diff: 2 as const, tz: 91, tier: 4, ladder: true, quest: true, runs: 250, seed: 12345 };
    expect(readState(writeState(st))).toEqual(st);
  });

  it("valores rotos caen en los de siempre y el grupo no pasa a los jugadores", () => {
    const st = readState("?m=xx&i=nada&mf=-5&p=3&g=9&tz=abc");
    expect(st.m).toBe("farm");
    expect(st.item).toBeNull();
    expect(st.mf).toBe(0);
    expect(st.party).toBe(3);
    expect(st.tz).toBe(0);
  });
});

describe("cómo se leen las chances", () => {
  it("1 en N, con los separadores del idioma y los millones con palabra", () => {
    expect(odds(1 / 3912, "es-AR", es)).toBe("1 en 3.912");
    expect(odds(0.25, "es-AR", es)).toBe("1 en 4");
    expect(odds(1 / 2_100_000, "es-AR", es)).toBe("1 en 2,1 millones");
    expect(odds(0, "es-AR", es)).toBe("—");
  });

  it("los nombres de TC que se pueden decir en castellano", () => {
    expect(tcLabel("armo60", es)).toBe("armaduras hasta nivel 60");
    expect(tcLabel("bow12", es)).toBe("arcos hasta nivel 12");
    expect(tcLabel("mele39", es)).toBe("armas cuerpo a cuerpo hasta nivel 39");
    expect(tcLabel("Runes 12", es)).toBe("runas (grupo 12)");
    expect(tcLabel("Mephisto (H)", es)).toBe("Mephisto (H)");
  });
});

describe("el buscador", () => {
  it("'shako' da la Cresta del arlequín primero, y 'soj' la Piedra de Jordán", () => {
    expect(searchItems("shako")[0].target).toEqual({ k: "u", id: "harlequin-crest" });
    expect(searchItems("shako").some((x) => x.target.k === "b" && x.target.code === "uap")).toBe(true);
    expect(searchItems("soj")[0].target).toEqual({ k: "u", id: "the-stone-of-jordan" });
  });

  it("en español y en inglés, y las runas", () => {
    expect(searchItems("cresta del arl")[0].target).toEqual({ k: "u", id: "harlequin-crest" });
    expect(searchItems("ber")[0].target).toEqual({ k: "b", code: "r30" });
  });

  it("cada sigla apunta a un único que existe", () => {
    const D = dropData();
    for (const id of Object.values(ALIASES)) expect(D.uniqueById.get(id), id).toBeDefined();
    expect(findItem({ k: "b", code: "r30" })?.kind).toBe("r");
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run test/d2rDropsUi.test.ts`
Expected: FAIL (no existen los módulos).

- [ ] **Step 3: Sumar los textos a `site/src/d2rCopy.ts`**

En el objeto `EN`, dentro de `seo`, justo antes de la línea `    planner: { title: "Diablo 2 Resurrected Gear Planner…`, sumar:

```ts
    drops: { title: "D2R Drop Calculator: Where to Farm Any Item (Terror Zones Included) | Vestigo", description: "Where to farm any Diablo II: Resurrected unique, set item, rune or base: the best bosses and areas with their exact chance, with your magic find and players, Terror Zones and Heralds included. Plus what every boss drops and a loot simulator." },
    dropsSource: (name: string) => ({ title: `${name} Drops in Diablo 2 Resurrected: Runes, Uniques and Sets | Vestigo`, description: `Every rune, unique and set item ${name} can drop in Diablo II: Resurrected, with its exact chance per kill in Normal, Nightmare and Hell.` }),
```

En `EN`, después del bloque `grail: { … },` (el último antes del `};` que cierra `EN`), sumar:

```ts
  drops: {
    title: "Drop calculator",
    lede: "Where to farm any item, what every boss drops and a chest to open. Terror Zones included.",
    about: [
      "Search an item and you get the best bosses to farm it (chance per kill: one kill is one run) and the best areas (chance per monster). Change your magic find, the players in the game or turn on a Terror Zone with your level and everything updates.",
      "The numbers are exact: they count the six-items-per-kill cap, Terror Zones and Heralds.",
    ],
    modes: { farm: "Where do I farm it?", drops: "What does it drop?", sim: "Simulator" },
    search: "Search an item: Shako, Ber, Tal Rasha…",
    examples: "Try",
    kinds: { u: "Unique", s: "Set", r: "Rune", b: "Base" },
    mf: "Magic find",
    players: "Players",
    party: "Party members nearby",
    diff: "Difficulty",
    allDiffs: "All",
    diffs: ["Normal", "Nightmare", "Hell"],
    tz: "Terror Zone",
    tzLevel: "Your level",
    more: "More options",
    ladder: "Ladder",
    quest: "First quest kill",
    herald: "Herald tier",
    bosses: "Bosses and super uniques",
    bossesNote: "Chance per kill: one kill is one run.",
    areas: "Areas",
    areasNote: "Chance per monster killed, by type.",
    cats: { normal: "Normal", champ: "Champion", unique: "Unique", herald: "Herald" },
    kindBoss: "Boss",
    kindSuper: "Super unique",
    tzBadge: "Terror Zone",
    act: (n: number) => `Act ${n}`,
    level: (n: number) => `level ${n}`,
    oneIn: (n: string) => `1 in ${n}`,
    million: (n: string) => `${n} million`,
    none: "Nothing drops it with these options.",
    pick: "Search an item to see where to farm it.",
    whatElse: "What else does it drop?",
    why: "Where does this number come from?",
    pathRoot: (tc: string, picks: number) => (picks >= 0 ? `${tc}: ${picks} ${picks === 1 ? "pick" : "picks"}` : `${tc}: ${-picks} fixed items`),
    pathStep: (tc: string, odds: string) => `→ ${tc} (${odds} per pick)`,
    pathSure: (tc: string) => `→ ${tc} (always)`,
    pathMore: (n: number) => `${n} more steps`,
    always: "always",
    pathItem: (name: string, odds: string) => `→ ${name} (${odds})`,
    pathQuality: (odds: string, set: boolean) => `→ ${set ? "set" : "unique"} quality: ${odds} with your magic find`,
    pathPick: (odds: string) => `→ among the possible ones for that base: ${odds}`,
    tcWeap: (n: string) => `weapons up to level ${n}`,
    tcArmo: (n: string) => `armor up to level ${n}`,
    tcMele: (n: string) => `melee weapons up to level ${n}`,
    tcBow: (n: string) => `bows up to level ${n}`,
    tcRunes: (n: string) => `runes (group ${n})`,
    mfTitle: "How much magic find helps",
    mfSentence: (a: string, b: string) => `From 0 to 300% magic find the chance goes ×${a}; from 300 to 600%, only ×${b}.`,
    mfNoEffect: "Magic find doesn't change this chance: runes and bases don't roll quality.",
    place: "Place",
    pickPlace: "Choose a boss, a super unique or an area",
    bossGroup: "Bosses and super uniques",
    areaGroup: (n: number) => `Areas of Act ${n}`,
    runes: "Runes",
    uniques: "Uniques",
    sets: "Set items",
    showAll: (n: number) => `Show all (${n})`,
    noDrops: "Nothing drops here with these options.",
    runs: "Runs",
    open: "Open the chest",
    again: "Open another",
    simLede: (runs: string, name: string) => `${runs} runs of ${name}:`,
    simEmpty: "Choose a boss or super unique and open the chest.",
    simNothing: "Nothing special this time. Open another one.",
    rares: (n: string) => `${n} rares`,
    magics: (n: string) => `${n} magic`,
    normals: (n: string) => `${n} normal`,
    gold: (n: string) => `${n} gold piles`,
    share: "Copy link",
    copied: "Link copied",
    sourceTitle: (name: string) => `${name} drops`,
    sourceLede: (name: string) => `Every rune, unique and set item ${name} can drop, with its chance per kill. Change the difficulty, your magic find or the players.`,
    openCalc: "Open in the calculator",
    openSim: "Open in the simulator",
    farmTitle: "Where to farm it",
    farmPieces: "Where to farm each piece",
    farmNote: "1 player, 300% magic find.",
    bestArea: "Best area",
    back: "Drop calculator",
  },
```

En el objeto `ES`, dentro de `seo`, antes de la línea `    planner: { title: "Planificador de equipo de Diablo 2 Resurrected…`, sumar:

```ts
    drops: { title: "Calculadora de drops de Diablo 2 Resurrected: dónde farmear cada ítem | Vestigo", description: "Dónde farmear cada único, pieza de conjunto, runa o base de Diablo II: Resurrected: los mejores jefes y áreas con su chance exacta, con tu hallazgo mágico y tus jugadores, Zonas de Terror y Heraldos incluidos. Además, qué suelta cada jefe y un simulador de botín." },
    dropsSource: (name: string) => ({ title: `Qué suelta ${name} en Diablo 2 Resurrected: runas, únicos y conjuntos | Vestigo`, description: `Cada runa, único y pieza de conjunto que puede soltar ${name} en Diablo II: Resurrected, con su chance exacta por muerte en Normal, Pesadilla e Infierno.` }),
```

En `ES`, después de su bloque `grail: { … },`, sumar:

```ts
  drops: {
    title: "Calculadora de drops",
    lede: "Dónde farmear cada ítem, qué suelta cada jefe y un cofre para abrir. Con las Zonas de Terror.",
    about: [
      "Buscá un ítem y te muestra los mejores jefes para farmearlo (chance por muerte: cada muerte es una run) y las mejores áreas (chance por monstruo). Cambiá tu hallazgo mágico, los jugadores de la partida o prendé una Zona de Terror con tu nivel y todo se actualiza.",
      "Los números son exactos: cuentan el tope de seis ítems por muerte, las Zonas de Terror y los Heraldos.",
    ],
    modes: { farm: "¿Dónde lo farmeo?", drops: "¿Qué suelta?", sim: "Simulador" },
    search: "Buscá un ítem: Shako, Ber, Tal Rasha…",
    examples: "Probá con",
    kinds: { u: "Único", s: "Conjunto", r: "Runa", b: "Base" },
    mf: "Hallazgo mágico",
    players: "Jugadores",
    party: "Del grupo cerca tuyo",
    diff: "Dificultad",
    allDiffs: "Todas",
    diffs: ["Normal", "Pesadilla", "Infierno"],
    tz: "Zona de Terror",
    tzLevel: "Tu nivel",
    more: "Más opciones",
    ladder: "Clasificación",
    quest: "Primera muerte de la misión",
    herald: "Nivel del Heraldo",
    bosses: "Jefes y superúnicos",
    bossesNote: "Chance por muerte: cada muerte es una run.",
    areas: "Áreas",
    areasNote: "Chance por cada monstruo que matás, según su tipo.",
    cats: { normal: "Común", champ: "Campeón", unique: "Único", herald: "Heraldo" },
    kindBoss: "Jefe",
    kindSuper: "Superúnico",
    tzBadge: "Zona de Terror",
    act: (n: number) => `Acto ${n}`,
    level: (n: number) => `nivel ${n}`,
    oneIn: (n: string) => `1 en ${n}`,
    million: (n: string) => `${n} millones`,
    none: "Con estas opciones no lo suelta nadie.",
    pick: "Buscá un ítem para ver dónde farmearlo.",
    whatElse: "¿Qué más suelta?",
    why: "¿De dónde sale este número?",
    pathRoot: (tc: string, picks: number) => (picks >= 0 ? `${tc}: ${picks} ${picks === 1 ? "tirada" : "tiradas"}` : `${tc}: ${-picks} ítems fijos`),
    pathStep: (tc: string, odds: string) => `→ ${tc} (${odds} por tirada)`,
    pathSure: (tc: string) => `→ ${tc} (siempre)`,
    pathMore: (n: number) => `${n} pasos más`,
    always: "siempre",
    pathItem: (name: string, odds: string) => `→ ${name} (${odds})`,
    pathQuality: (odds: string, set: boolean) => `→ calidad ${set ? "de conjunto" : "única"}: ${odds} con tu hallazgo mágico`,
    pathPick: (odds: string) => `→ entre los posibles de esa base: ${odds}`,
    tcWeap: (n: string) => `armas hasta nivel ${n}`,
    tcArmo: (n: string) => `armaduras hasta nivel ${n}`,
    tcMele: (n: string) => `armas cuerpo a cuerpo hasta nivel ${n}`,
    tcBow: (n: string) => `arcos hasta nivel ${n}`,
    tcRunes: (n: string) => `runas (grupo ${n})`,
    mfTitle: "Cuánto te suma el hallazgo mágico",
    mfSentence: (a: string, b: string) => `De 0 a 300% de hallazgo mágico la chance se multiplica por ${a}; de 300 a 600%, sólo por ${b}.`,
    mfNoEffect: "El hallazgo mágico no cambia esta chance: las runas y las bases no tiran calidad.",
    place: "Lugar",
    pickPlace: "Elegí un jefe, un superúnico o un área",
    bossGroup: "Jefes y superúnicos",
    areaGroup: (n: number) => `Áreas del Acto ${n}`,
    runes: "Runas",
    uniques: "Únicos",
    sets: "Piezas de conjunto",
    showAll: (n: number) => `Ver todo (${n})`,
    noDrops: "Con estas opciones acá no cae nada.",
    runs: "Runs",
    open: "Abrir el cofre",
    again: "Abrir otro",
    simLede: (runs: string, name: string) => `${runs} runs de ${name}:`,
    simEmpty: "Elegí un jefe o superúnico y abrí el cofre.",
    simNothing: "Esta vez nada especial. Abrí otro.",
    rares: (n: string) => `${n} raros`,
    magics: (n: string) => `${n} mágicos`,
    normals: (n: string) => `${n} normales`,
    gold: (n: string) => `${n} montones de oro`,
    share: "Copiar enlace",
    copied: "Enlace copiado",
    sourceTitle: (name: string) => `Qué suelta ${name}`,
    sourceLede: (name: string) => `Cada runa, único y pieza de conjunto que puede soltar ${name}, con su chance por muerte. Cambiá la dificultad, tu hallazgo mágico o los jugadores.`,
    openCalc: "Abrir en la calculadora",
    openSim: "Abrir en el simulador",
    farmTitle: "Dónde farmearlo",
    farmPieces: "Dónde farmear cada pieza",
    farmNote: "Con 1 jugador y 300% de hallazgo mágico.",
    bestArea: "Mejor área",
    back: "Calculadora de drops",
  },
```

- [ ] **Step 4: Escribir `site/src/d2r/drops/format.ts`**

```ts
/**
 * Cómo se leen las chances en la calculadora (2026-09-29): "1 en 3.912", que
 * es como lo dice un jugador, con los millones en palabras, y los nombres de
 * TC que se pueden decir en castellano ("armaduras hasta nivel 60").
 */
import type { D2rCopy } from "../../d2rCopy";

type DropsCopy = D2rCopy["drops"];

/** El N de "1 en N": "3.912", "12,5", "2,1 millones". */
export function oddsN(p: number, locale: string, td: DropsCopy): string {
  const n = 1 / p;
  if (n >= 1e6) return td.million((n / 1e6).toLocaleString(locale, { maximumFractionDigits: 1 }));
  return n < 10 ? n.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString(locale);
}

/** "1 en 3.912", o "—" si no sale. */
export const odds = (p: number, locale: string, td: DropsCopy): string => (p > 0 ? td.oneIn(oddsN(p, locale, td)) : "—");

/** Los TC automáticos y las runas se pueden decir; el resto queda como lo llama el juego. */
export function tcLabel(name: string, td: DropsCopy): string {
  const m = /^(weap|armo|mele|bow)(\d+)$/.exec(name);
  if (m) return { weap: td.tcWeap, armo: td.tcArmo, mele: td.tcMele, bow: td.tcBow }[m[1] as "weap" | "armo" | "mele" | "bow"](m[2]);
  const r = /^Runes (\d+)$/.exec(name);
  return r ? td.tcRunes(r[1]) : name;
}
```

- [ ] **Step 5: Escribir `site/src/d2r/drops/state.ts`**

```ts
/**
 * El estado de la calculadora de drops en la dirección (2026-09-29): el modo,
 * el ítem, el lugar y las opciones, para compartirlo con un enlace. Sólo se
 * escribe lo que no es el valor por defecto, y lo que llega roto cae en él.
 */
import { SEASON } from "../season";
import { targetParam } from "./farm";
import { CATS, type Cat, type PlaceOpts, type PlaceRef } from "./places";
import type { Diff, Settings, Target } from "./types";

export type Mode = "farm" | "drops" | "sim";
export interface DropsState {
  m: Mode;
  item: Target | null;
  place: PlaceRef | null;
  /** La dificultad del lugar en "¿Qué suelta?" y el simulador. */
  pdiff: Diff;
  mf: number;
  players: number;
  party: number;
  /** La dificultad de "¿Dónde lo farmeo?" (−1 = todas). */
  diff: -1 | Diff;
  /** Zona de Terror: tu nivel (0 = apagada). */
  tz: number;
  tier: number;
  ladder: boolean;
  quest: boolean;
  runs: number;
  /** La semilla del cofre (0 = sin abrir). */
  seed: number;
}

export const DEFAULT_STATE: DropsState = {
  m: "farm", item: null, place: null, pdiff: 2, mf: 300, players: 1, party: 1, diff: -1,
  tz: 0, tier: 1, ladder: false, quest: false, runs: 100, seed: 0,
};

export function parseTarget(v: string | null): Target | null {
  const m = /^([usb])\.(.+)$/.exec(v ?? "");
  if (!m) return null;
  return m[1] === "b" ? { k: "b", code: m[2] } : { k: m[1] as "u" | "s", id: m[2] };
}

export const placeParam = (p: PlaceRef): string => (p.k === "s" ? `s.${p.id}` : `a.${p.id}.${p.cat}`);

export function parsePlace(v: string | null): PlaceRef | null {
  const s = /^s\.(.+)$/.exec(v ?? "");
  if (s) return { k: "s", id: s[1] };
  const a = /^a\.(\d+)\.(\w+)$/.exec(v ?? "");
  return a && (CATS as string[]).includes(a[2]) ? { k: "a", id: Number(a[1]), cat: a[2] as Cat } : null;
}

const int = (v: string | null, def: number, min: number, max: number): number => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function readState(search: string): DropsState {
  const q = new URLSearchParams(search);
  const d = DEFAULT_STATE;
  const m = q.get("m");
  const players = int(q.get("p"), d.players, 1, 8);
  return {
    m: m === "drops" || m === "sim" ? m : "farm",
    item: parseTarget(q.get("i")),
    place: parsePlace(q.get("src")),
    pdiff: int(q.get("pd"), d.pdiff, 0, 2) as Diff,
    mf: int(q.get("mf"), d.mf, 0, 9999),
    players,
    party: int(q.get("g"), d.party, 1, players),
    diff: int(q.get("d"), d.diff, -1, 2) as -1 | Diff,
    tz: int(q.get("tz"), d.tz, 0, 99),
    tier: int(q.get("h"), d.tier, 1, 5),
    ladder: q.get("l") === "1",
    quest: q.get("q") === "1",
    runs: int(q.get("n"), d.runs, 1, 1000),
    seed: int(q.get("seed"), d.seed, 0, 2 ** 31 - 1),
  };
}

export function writeState(st: DropsState): string {
  const d = DEFAULT_STATE;
  const q = new URLSearchParams();
  if (st.m !== d.m) q.set("m", st.m);
  if (st.item) q.set("i", targetParam(st.item));
  if (st.place) q.set("src", placeParam(st.place));
  if (st.pdiff !== d.pdiff) q.set("pd", String(st.pdiff));
  if (st.mf !== d.mf) q.set("mf", String(st.mf));
  if (st.players !== d.players) q.set("p", String(st.players));
  if (st.party !== d.party) q.set("g", String(st.party));
  if (st.diff !== d.diff) q.set("d", String(st.diff));
  if (st.tz !== d.tz) q.set("tz", String(st.tz));
  if (st.tier !== d.tier) q.set("h", String(st.tier));
  if (st.ladder) q.set("l", "1");
  if (st.quest) q.set("q", "1");
  if (st.runs !== d.runs) q.set("n", String(st.runs));
  if (st.seed !== d.seed) q.set("seed", String(st.seed));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const toSettings = (st: DropsState): Settings => ({ mf: st.mf, players: st.players, party: st.party, ladder: st.ladder, season: SEASON });
export const toOpts = (st: DropsState): PlaceOpts => ({ tz: st.tz, tier: st.tier, quest: st.quest });
```

- [ ] **Step 6: Escribir `site/src/d2r/drops/ItemPicker.tsx`**

```tsx
/**
 * El buscador de ítems (2026-09-29): únicos, piezas, runas y bases, en español
 * o en inglés. Un único también se encuentra por su base ("shako" da la Cresta
 * del arlequín) y por las siglas de siempre ("soj"). Los resultados van en la
 * página y no en un desplegable flotante: en el celular se leen y tocan mejor.
 */
import { useMemo, useState } from "react";
import { useLang } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import type { Loc } from "../stats";
import { ItemIcon, fold, type Tone } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { targetParam } from "./farm";
import type { Target } from "./types";

export interface PickItem {
  target: Target;
  name: Loc;
  img: string | null;
  kind: "u" | "s" | "r" | "b";
  tone: Tone;
  /** Más palabras por las que se encuentra (la base de un único). */
  words: string[];
}

/** Las siglas de la comunidad. Cada id tiene que existir (lo revisa el test). */
export const ALIASES: Record<string, string> = {
  shako: "harlequin-crest",
  soj: "the-stone-of-jordan",
  coa: "crown-of-ages",
  hoz: "herald-of-zakarum",
  mara: "maras-kaleidoscope",
  wf: "windforce",
  tgods: "thundergods-vigor",
};

let items: PickItem[] | null = null;
export function pickItems(): PickItem[] {
  if (items) return items;
  const D = dropData();
  const baseWords = (code: string) => (D.bases[code] ? [D.bases[code].n.en, D.bases[code].n.es] : []);
  const out: PickItem[] = [];
  for (const u of D.uniques) out.push({ target: { k: "u", id: u.id }, name: u.n, img: u.img, kind: "u", tone: "unique", words: baseWords(u.code) });
  for (const x of D.sets) out.push({ target: { k: "s", id: x.id }, name: x.n, img: x.img, kind: "s", tone: "set", words: [] });
  for (const [code, b] of Object.entries(D.bases)) {
    const rune = /^r\d\d$/.test(code);
    if (rune || b.k !== "m") out.push({ target: { k: "b", code }, name: b.n, img: b.img, kind: rune ? "r" : "b", tone: rune ? "rune" : "white", words: [] });
  }
  return (items = out);
}

const KIND_ORDER = { u: 0, s: 1, r: 2, b: 3 } as const;

/** Una runa se busca por su nombre solo: "ber" es la Runa Ber. */
const bare = (s: string) => fold(s).replace(/^runa |rune$/g, "").trim();

/** Primero la sigla y el nombre exacto, después lo que empieza con lo escrito, lo que lo contiene y lo que lo tiene en su base. */
export function searchItems(q: string, limit = 12): PickItem[] {
  const n = fold(q.trim());
  if (n.length < 2) return [];
  const alias = ALIASES[n];
  const score = (x: PickItem): number => {
    if (alias && x.target.k === "u" && x.target.id === alias) return 0;
    const names = [fold(x.name.en), fold(x.name.es)];
    if (names.includes(n) || (x.kind === "r" && (bare(x.name.en) === n || bare(x.name.es) === n))) return 0.5;
    if (names.some((w) => w.startsWith(n))) return 1;
    if (names.some((w) => w.includes(n))) return 2;
    if (x.words.some((w) => fold(w).includes(n))) return 3;
    return 9;
  };
  return pickItems()
    .map((x) => [score(x), x] as const)
    .filter(([s]) => s < 9)
    .sort((a, b) => a[0] - b[0] || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind])
    .slice(0, limit)
    .map(([, x]) => x);
}

export const findItem = (t: Target | null): PickItem | undefined =>
  t ? pickItems().find((x) => targetParam(x.target) === targetParam(t)) : undefined;

export default function ItemPicker({ onPick }: { onPick: (t: Target) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchItems(q), [q]);
  return (
    <div className="d2-dr-picker">
      <input className="d2-search d2-dr-search" type="search" value={q} placeholder={td.search} aria-label={td.search} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && (
        <ul className="d2-dr-hits">
          {hits.map((x) => (
            <li key={targetParam(x.target)}>
              <button
                type="button"
                className="d2-dr-hit"
                onClick={() => {
                  onPick(x.target);
                  setQ("");
                }}
              >
                <ItemIcon asset={x.img} size="sm" />
                <span className="d2-card-txt">
                  <b className={`d2-tone-${x.tone}`}>{tr(x.name, lang)}</b>
                  <small>{td.kinds[x.kind]}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Escribir `site/src/d2r/drops/DropsControls.tsx`**

```tsx
/**
 * Los controles de la calculadora (2026-09-29): a la vista sólo los cuatro que
 * cambian casi todo (hallazgo mágico, jugadores, dificultad y Zona de Terror);
 * el resto va en "Más opciones".
 */
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import type { DropsState, Mode } from "./state";
import type { Diff } from "./types";

const clamp = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function DropsControls({ st, set, mode }: { st: DropsState; set: (p: Partial<DropsState>) => void; mode: Mode }) {
  const td = useD2rCopy().drops;
  return (
    <div className="d2-dr-controls">
      <label className="d2-dr-field">
        <span>{td.mf}</span>
        <input type="number" inputMode="numeric" min={0} max={9999} value={st.mf} onChange={(e) => set({ mf: clamp(e.target.value, 0, 9999) })} />
      </label>
      <label className="d2-dr-field">
        <span>{td.players}</span>
        <select
          value={st.players}
          onChange={(e) => {
            const players = Number(e.target.value);
            set({ players, party: Math.min(st.party, players) });
          }}
        >
          {upTo(8).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {mode === "farm" && (
        <Chips<number>
          label={td.diff}
          value={st.diff}
          onChange={(diff) => set({ diff: diff as -1 | Diff })}
          options={[{ value: -1, label: td.allDiffs }, ...td.diffs.map((label, i) => ({ value: i, label }))]}
        />
      )}
      <label className="d2-check">
        <input type="checkbox" checked={st.tz > 0} onChange={(e) => set({ tz: e.target.checked ? 90 : 0 })} />
        {td.tz}
      </label>
      {st.tz > 0 && (
        <label className="d2-dr-field">
          <span>{td.tzLevel}</span>
          <input type="number" inputMode="numeric" min={1} max={99} value={st.tz} onChange={(e) => set({ tz: clamp(e.target.value, 1, 99) })} />
        </label>
      )}
      <details className="d2-dr-more">
        <summary>{td.more}</summary>
        <div className="d2-dr-more-in">
          <label className="d2-dr-field">
            <span>{td.party}</span>
            <select value={st.party} onChange={(e) => set({ party: Number(e.target.value) })}>
              {upTo(st.players).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {st.tz > 0 && (
            <label className="d2-dr-field">
              <span>{td.herald}</span>
              <select value={st.tier} onChange={(e) => set({ tier: Number(e.target.value) })}>
                {upTo(5).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="d2-check">
            <input type="checkbox" checked={st.ladder} onChange={(e) => set({ ladder: e.target.checked })} />
            {td.ladder}
          </label>
          <label className="d2-check">
            <input type="checkbox" checked={st.quest} onChange={(e) => set({ quest: e.target.checked })} />
            {td.quest}
          </label>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 8: Escribir `site/src/styles/d2r-drops.css`**

```css
/* ---------------------------------------------------------------------------
   DIABLO II — la calculadora de drops (2026-09-29).

   El mismo lenguaje que la wiki (d2r-wiki.css): piedra negra, la letra del
   juego y el color en el texto (dorado único, verde conjunto, naranja runa).
   Sin filos de color en las filas: las barras son de oro apagado sobre
   piedra, como las de la Crónica. En el celular todo va en una columna, sin
   tablas anchas, y los nombres bajan de línea entre palabras.
--------------------------------------------------------------------------- */

.d2-dr-about { display: grid; gap: 10px; max-width: 760px; margin-top: 28px; color: var(--d2-dim); }

/* Controles. */
.d2-dr-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 14px 0; }
.d2-dr-field { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; color: var(--d2-dim); }
.d2-dr-field input, .d2-dr-field select, .d2-dr-place select {
  height: 36px; padding: 0 10px; min-width: 0; max-width: 100%;
  background: #0d0b09; color: var(--d2-ink); border: 0; border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); font: inherit;
}
.d2-dr-field input { width: 88px; }
.d2-dr-more summary { cursor: pointer; font-family: var(--d2-title); font-size: 13px; letter-spacing: 0.03em; color: var(--d2-dim); }
.d2-dr-more-in { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 10px; }

/* El buscador y sus resultados, en la página. */
.d2-dr-picker { display: grid; gap: 8px; margin-bottom: 14px; }
.d2-dr-search { max-width: 520px; }
.d2-dr-hits { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 6px; list-style: none; padding: 0; margin: 0; }
.d2-dr-hit {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px 6px 6px; text-align: left; cursor: pointer; color: inherit;
  background: radial-gradient(ellipse at 20% 50%, #17130f, #0c0a08 75%); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.035);
}
.d2-dr-hit:hover { background: radial-gradient(ellipse at 20% 50%, #2a1f16, #0e0b09 75%); }
.d2-dr-examples { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; color: var(--d2-dim); }
.d2-dr-examples .d2-empty { flex-basis: 100%; }

/* El ítem elegido y las listas de lugares. */
.d2-dr-item { display: flex; align-items: center; gap: 14px; margin: 6px 0 10px; }
.d2-dr-item-h { font-family: var(--d2-title); font-weight: normal; font-size: clamp(20px, 3.4vw, 28px); letter-spacing: 0.03em; line-height: 1.2; }
.d2-dr-item small { color: var(--d2-dim); }
.d2-dr-note { margin: -4px 0 10px; font-size: 14px; color: var(--d2-faint); }
.d2-dr-list { margin-bottom: 22px; }
.d2-dr-rows { display: grid; gap: 6px; list-style: none; padding: 0; margin: 0; }
.d2-dr-row { background: radial-gradient(ellipse at 20% 50%, #17130f, #0c0a08 75%); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.035); }
.d2-dr-row-main {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name odds" "bar bar";
  gap: 6px 12px; width: 100%; padding: 10px 12px; text-align: left; cursor: pointer; color: inherit;
}
.d2-dr-row-main:hover { background: rgba(255, 255, 255, 0.025); }
.d2-dr-row-name { grid-area: name; display: grid; gap: 2px; min-width: 0; }
.d2-dr-row-name b { font-family: var(--d2-title); font-weight: normal; font-size: 16px; letter-spacing: 0.02em; color: var(--d2-ink); }
.d2-dr-row-name small { font-size: 13px; color: var(--d2-dim); }
.d2-dr-odds { grid-area: odds; align-self: center; font-family: var(--d2-title); font-size: 15px; color: var(--d2-unique); white-space: nowrap; }
.d2-dr-bar { grid-area: bar; display: block; height: 4px; background: #1d1813; }
.d2-dr-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #7a6531, #c7b377); }
.d2-dr-cats { grid-area: odds; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; }
.d2-dr-cats > span { display: grid; justify-items: end; }
.d2-dr-cats small { font-family: var(--d2-title); font-size: 11px; letter-spacing: 0.04em; color: var(--d2-faint); }
.d2-dr-cats b { font-family: var(--d2-title); font-weight: normal; font-size: 14px; color: var(--d2-unique); white-space: nowrap; }
.d2-dr-open { display: grid; gap: 10px; justify-items: start; padding: 0 12px 12px; }
.d2-dr-why summary { cursor: pointer; font-size: 14px; color: var(--d2-dim); }
.d2-dr-why ol { display: grid; gap: 3px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 14px; color: var(--d2-ink); }
.d2-dr-more { padding: 0; border: 0; background: none; font: inherit; color: var(--d2-dim); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

/* La curva del hallazgo mágico. */
.d2-dr-mf { max-width: 520px; margin: 8px 0 22px; }
.d2-dr-mf-svg { display: block; width: 100%; height: auto; background: #0d0b09; }
.d2-dr-mf-svg polyline { fill: none; stroke: #c7b377; stroke-width: 2; }
.d2-dr-mf-svg circle { fill: var(--d2-rune); }
.d2-dr-mf-axis { stroke: rgba(255, 255, 255, 0.12); }
.d2-dr-mf p { margin-top: 8px; color: var(--d2-dim); }

/* "¿Qué suelta?": el lugar y las tres listas. */
.d2-dr-place { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 14px; }
.d2-dr-runes { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; list-style: none; padding: 0; margin: 0 0 18px; }
.d2-dr-rune { display: grid; justify-items: center; gap: 2px; padding: 8px 4px; text-align: center; color: inherit; text-decoration: none; background: #0f0d0b; }
.d2-dr-rune:hover { background: #1b1612; }
.d2-dr-rune b { font-family: var(--d2-title); font-weight: normal; font-size: 13px; color: var(--d2-rune); }
.d2-dr-rune small { font-size: 12px; color: var(--d2-dim); white-space: nowrap; }
.d2-dr-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.d2-dr-links a { text-decoration: none; }

/* El simulador: el botín en el piso, con las etiquetas del juego. */
.d2-dr-sim-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 6px 0 16px; }
.d2-dr-open-btn { min-height: 44px; padding: 10px 22px; cursor: pointer; font-family: var(--d2-title); font-size: 15px; letter-spacing: 0.04em; color: #fff3d6; background: #5a1510; }
.d2-dr-open-btn:hover { background: #7a1d15; }
.d2-dr-ground { display: flex; flex-wrap: wrap; gap: 8px 10px; padding: 18px 14px; margin-bottom: 12px; background: radial-gradient(ellipse at 50% 40%, #1c1712, #080706 80%); }
.d2-dr-loot { padding: 3px 8px; font-family: var(--d2-title); font-size: 14px; background: rgba(0, 0, 0, 0.72); }
.d2-dr-loot.is-unique { color: var(--d2-unique); }
.d2-dr-loot.is-set { color: var(--d2-set); }
.d2-dr-loot.is-rune { color: var(--d2-rune); }
.d2-dr-loot small { margin-left: 4px; color: #f1ece2; }
.d2-dr-sum { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--d2-dim); }
.d2-dr-sum .is-rare { color: #ffff64; }
.d2-dr-sum .is-magic { color: var(--d2-magic); }

/* "Dónde farmearlo" en las fichas de la wiki. */
.d2-dr-block { display: grid; gap: 8px; width: 100%; max-width: 620px; }
.d2-dr-mini { display: grid; gap: 4px; list-style: none; padding: 0; margin: 0; }
.d2-dr-mini li { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; padding: 6px 10px; background: #0f0d0b; }
.d2-dr-mini b { font-family: var(--d2-title); font-weight: normal; color: var(--d2-ink); }
.d2-dr-mini small { color: var(--d2-dim); }
.d2-dr-mini span { font-family: var(--d2-title); color: var(--d2-unique); white-space: nowrap; }
.d2-dr-block > a { justify-self: start; text-decoration: none; }

@media (max-width: 600px) {
  .d2-dr-row-main { grid-template-areas: "name name" "odds odds" "bar bar"; }
  .d2-dr-odds, .d2-dr-cats { justify-self: start; justify-content: flex-start; }
  .d2-dr-cats > span { justify-items: start; }
}
```

- [ ] **Step 9: Correr el test y el chequeo de tipos**

Run: `npx vitest run test/d2rDropsUi.test.ts && npx tsc -b`
Expected: PASS (8 tests) y tsc sin errores. Si una sigla no existe, se corrige el id en `ALIASES` mirando `D.uniques`.

---

### Task 8: "¿Dónde lo farmeo?" y la curva del hallazgo mágico

**Files:**
- Create:
  - `site/src/d2r/drops/DropsFarm.tsx`
  - `site/src/d2r/drops/MfCurve.tsx`
- Test: `site/test/d2rDropsUi.test.ts` (suma un bloque).

**Interfaces:**
- Consumes:
  - de Task 7: `DropsState`, `toSettings`, `toOpts`, `odds`, `tcLabel`, `ItemPicker` y `findItem`;
  - de Task 4: `bestPlaces`, `CATS`, `BossRow` y `AreaRow`;
  - de Task 3: `explainPath` y `chancePerKill`.
- Produces:
  - el default export `DropsFarm({ st, set })`;
  - el default export `MfCurve({ target, kill, st })`;
  - la constante `FARM_EXAMPLES: Target[]`.

- [ ] **Step 1: Sumar el test de render (falla porque no existe el componente)**

Al final de `site/test/d2rDropsUi.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import DropsFarm, { FARM_EXAMPLES } from "../src/d2r/drops/DropsFarm";

const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));

describe("¿Dónde lo farmeo?", () => {
  it("sin ítem muestra los ejemplos, y cada ejemplo existe", () => {
    const html = inEs(createElement(DropsFarm, { st: DEFAULT_STATE, set: () => undefined }));
    expect(html).toContain("Probá con");
    for (const ex of FARM_EXAMPLES) expect(findItem(ex), JSON.stringify(ex)).toBeDefined();
  });

  it("con la Cresta del arlequín: jefes arriba, áreas y la curva del hallazgo mágico", () => {
    const st = { ...DEFAULT_STATE, item: { k: "u" as const, id: "harlequin-crest" }, diff: 2 as const };
    const html = inEs(createElement(DropsFarm, { st, set: () => undefined }));
    expect(html).toContain("Jefes y superúnicos");
    expect(html).toMatch(/Mefisto|Diablo|Baal/);
    expect(html).toContain("1 en ");
    expect(html).toContain("Áreas");
    expect(html).toContain("Cuánto te suma el hallazgo mágico");
  });
});
```

Run: `npx vitest run test/d2rDropsUi.test.ts`
Expected: FAIL ("Failed to resolve import …/DropsFarm").

- [ ] **Step 2: Escribir `site/src/d2r/drops/MfCurve.tsx`**

```tsx
/**
 * La curva del hallazgo mágico (2026-09-29): la chance del ítem en el mejor
 * lugar para MF de 0 a 1.000, con una frase que dice cuánto rinde cada tramo.
 * Rinde cada vez menos (el juego lo achica pasado el 10%), y es lo que más se
 * pregunta.
 */
import { useMemo } from "react";
import { useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { dropData } from "./data";
import { chancePerKill } from "./engine";
import { toSettings, type DropsState } from "./state";
import type { KillCtx, Target } from "./types";

const STEPS = Array.from({ length: 21 }, (_, i) => i * 50);
const W = 320;
const H = 120;
const PAD = 10;

export default function MfCurve({ target, kill, st }: { target: Target; kill: KillCtx; st: DropsState }) {
  const td = useD2rCopy().drops;
  const locale = useLocale();
  const pts = useMemo(() => {
    const s = toSettings(st);
    return STEPS.map((mf) => chancePerKill(dropData(), target, kill, { ...s, mf }));
    // El MF de la curva es el eje: no depende del que eligió el jugador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, kill, st.players, st.party, st.ladder]);
  const [p0, p300, p600] = [pts[0], pts[6], pts[12]];
  if (!(p0 > 0)) return null;
  if (Math.abs(p600 - p0) / p0 < 0.001) return <p className="d2-dr-note">{td.mfNoEffect}</p>;
  const max = Math.max(...pts);
  const x = (mf: number) => PAD + (mf / 1000) * (W - 2 * PAD);
  const y = (p: number) => H - PAD - (p / max) * (H - 2 * PAD);
  const cur = Math.min(1000, st.mf);
  const fmt = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <section className="d2-dr-mf">
      <h2 className="d2-h3">{td.mfTitle}</h2>
      <svg className="d2-dr-mf-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={td.mfTitle}>
        <line className="d2-dr-mf-axis" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
        <polyline points={pts.map((p, i) => `${x(STEPS[i])},${y(p)}`).join(" ")} />
        <circle cx={x(cur)} cy={y(pts[Math.round(cur / 50)])} r="4" />
      </svg>
      <p>{td.mfSentence(fmt(p300 / p0), fmt(p600 / p300))}</p>
    </section>
  );
}
```

- [ ] **Step 3: Escribir `site/src/d2r/drops/DropsFarm.tsx`**

```tsx
/**
 * "¿Dónde lo farmeo?" (2026-09-29): el ítem, los mejores jefes y superúnicos
 * (chance por muerte), las mejores áreas (chance por monstruo, por tipo) y la
 * curva del hallazgo mágico. Cada fila se abre para ver qué más suelta ese
 * lugar y de dónde sale el número.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { ItemIcon } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { explainPath, type PathStep } from "./engine";
import { targetParam } from "./farm";
import { odds, tcLabel } from "./format";
import ItemPicker, { findItem } from "./ItemPicker";
import MfCurve from "./MfCurve";
import { bestPlaces, CATS, type AreaRow, type BossRow } from "./places";
import { toOpts, toSettings, type DropsState } from "./state";
import type { Diff, KillCtx, Settings, Target } from "./types";

type Set_ = (p: Partial<DropsState>) => void;

/** Lo que más se busca: el primer ítem que prueba quien entra. */
export const FARM_EXAMPLES: Target[] = [
  { k: "u", id: "harlequin-crest" },
  { k: "b", code: "r30" },
  { k: "u", id: "griffons-eye" },
  { k: "s", id: "tal-rashas-guardianship" },
  { k: "u", id: "the-stone-of-jordan" },
];

export default function DropsFarm({ st, set }: { st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const item = findItem(st.item);
  const res = useMemo(() => {
    if (!st.item) return null;
    const diffs: Diff[] = st.diff === -1 ? [0, 1, 2] : [st.diff];
    return bestPlaces(dropData(), st.item, toSettings(st), toOpts(st), diffs, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.item, st.mf, st.players, st.party, st.ladder, st.diff, st.tz, st.tier, st.quest]);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));
  const top = res?.bosses[0]?.kill ?? res?.areas[0]?.best ?? null;

  return (
    <div className="d2-dr-farm">
      <ItemPicker onPick={(i) => set({ item: i })} />
      {!item || !st.item ? (
        <div className="d2-dr-examples">
          <span>{td.examples}</span>
          {FARM_EXAMPLES.map((ex) => {
            const x = findItem(ex);
            return (
              x && (
                <button type="button" className="d2-chip" key={targetParam(ex)} onClick={() => set({ item: ex })}>
                  <span className={`d2-tone-${x.tone}`}>{tr(x.name, lang)}</span>
                </button>
              )
            );
          })}
          <p className="d2-empty">{td.pick}</p>
        </div>
      ) : (
        <>
          <div className="d2-dr-item">
            <ItemIcon asset={item.img} size="md" alt={tr(item.name, lang)} />
            <div>
              <h2 className={`d2-dr-item-h d2-tone-${item.tone}`}>{tr(item.name, lang)}</h2>
              <small>{td.kinds[item.kind]}</small>
            </div>
          </div>
          {res && !res.bosses.length && !res.areas.length && <p className="d2-empty">{td.none}</p>}
          {res && res.bosses.length > 0 && (
            <section className="d2-dr-list">
              <h2 className="d2-h3">{td.bosses}</h2>
              <p className="d2-dr-note">{td.bossesNote}</p>
              <ol className="d2-dr-rows">
                {res.bosses.map((row) => (
                  <BossLine key={row.key} row={row} top={res.bosses[0].p} open={open === row.key} onToggle={() => toggle(row.key)} target={st.item!} st={st} set={set} />
                ))}
              </ol>
            </section>
          )}
          {res && res.areas.length > 0 && (
            <section className="d2-dr-list">
              <h2 className="d2-h3">{td.areas}</h2>
              <p className="d2-dr-note">{td.areasNote}</p>
              <ol className="d2-dr-rows">
                {res.areas.map((row) => (
                  <AreaLine key={row.key} row={row} open={open === row.key} onToggle={() => toggle(row.key)} target={st.item!} st={st} set={set} />
                ))}
              </ol>
            </section>
          )}
          {top && <MfCurve target={st.item} kill={top} st={st} />}
        </>
      )}
    </div>
  );
}

function BossLine({ row, top, open, onToggle, target, st, set }: { row: BossRow; top: number; open: boolean; onToggle: () => void; target: Target; st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <li className="d2-dr-row">
      <button type="button" className="d2-dr-row-main" aria-expanded={open} onClick={onToggle}>
        <span className="d2-dr-row-name">
          <b>{tr(row.src.n, lang)}</b>
          <small>
            {td.diffs[row.diff]} · {row.src.kind === "boss" ? td.kindBoss : td.kindSuper}
            {row.tz ? ` · ${td.tzBadge}` : ""}
          </small>
        </span>
        <span className="d2-dr-odds">{odds(row.p, locale, td)}</span>
        <span className="d2-dr-bar" aria-hidden="true">
          <i style={{ width: `${Math.max(3, (row.p / top) * 100)}%` }} />
        </span>
      </button>
      {open && (
        <div className="d2-dr-open">
          <button type="button" className="d2-chip" onClick={() => set({ m: "drops", place: { k: "s", id: row.src.id }, pdiff: row.diff })}>
            {td.whatElse}
          </button>
          <Why target={target} kill={row.kill} s={toSettings(st)} />
        </div>
      )}
    </li>
  );
}

function AreaLine({ row, open, onToggle, target, st, set }: { row: AreaRow; open: boolean; onToggle: () => void; target: Target; st: DropsState; set: Set_ }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  return (
    <li className="d2-dr-row">
      <button type="button" className="d2-dr-row-main" aria-expanded={open} onClick={onToggle}>
        <span className="d2-dr-row-name">
          <b>{tr(row.area.n, lang)}</b>
          <small>
            {td.act(row.area.act)} · {td.diffs[row.diff]}
            {row.tz ? ` · ${td.tzBadge}` : ""}
          </small>
        </span>
        <span className="d2-dr-cats">
          {CATS.filter((c) => row.p[c] > 0).map((c) => (
            <span key={c}>
              <small>{td.cats[c]}</small>
              <b>{odds(row.p[c], locale, td)}</b>
            </span>
          ))}
        </span>
      </button>
      {open && row.best && (
        <div className="d2-dr-open">
          <button type="button" className="d2-chip" onClick={() => set({ m: "drops", place: { k: "a", id: row.area.id, cat: "normal" }, pdiff: row.diff })}>
            {td.whatElse}
          </button>
          <Why target={target} kill={row.best} s={toSettings(st)} />
        </div>
      )}
    </li>
  );
}

/** Hasta tantos pasos se muestran todos; los TC "Equip" encadenados llegan a 10 (la Cresta desde Mefisto). */
const PATH_OPEN = 5;

/** "¿De dónde sale este número?": el camino que más aporta, en palabras. */
function Why({ target, kill, s }: { target: Target; kill: KillCtx; s: Settings }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const path = useMemo(() => explainPath(dropData(), target, kill, s), [target, kill, s]);
  if (!path) return null;
  const D = dropData();
  const endName = D.bases[path.end.code]?.n ?? D.uniqueByKey.get(path.end.code)?.n ?? D.setByKey.get(path.end.code)?.n;
  // Lo que sale de un TC con tiradas negativas sale siempre: "1 en 1" no se dice.
  const o = (p: number) => (p >= 1 ? td.always : odds(p, locale, td));
  const line = (step: PathStep, i: number) =>
    i === 0 ? td.pathRoot(tcLabel(step.tc, td), step.picks) : step.share >= 1 ? td.pathSure(tcLabel(step.tc, td)) : td.pathStep(tcLabel(step.tc, td), odds(step.share, locale, td));
  // Un camino largo deja el primer paso y los dos últimos; los del medio se despliegan con un botón.
  const hidden = all || path.steps.length <= PATH_OPEN ? 0 : path.steps.length - 3;
  return (
    <details className="d2-dr-why">
      <summary>{td.why}</summary>
      <ol>
        <li>{line(path.steps[0], 0)}</li>
        {hidden > 0 && (
          <li>
            <button type="button" className="d2-dr-more" onClick={() => setAll(true)}>
              {td.pathMore(hidden)}
            </button>
          </li>
        )}
        {path.steps.slice(1 + hidden).map((step, i) => (
          <li key={1 + hidden + i}>{line(step, 1 + hidden + i)}</li>
        ))}
        <li>{td.pathItem(endName ? tr(endName, lang) : path.end.code, o(path.end.share))}</li>
        {path.end.quality !== null && <li>{td.pathQuality(odds(path.end.quality, locale, td), target.k === "s")}</li>}
        {path.end.pick !== null && path.end.pick < 1 && <li>{td.pathPick(odds(path.end.pick, locale, td))}</li>}
      </ol>
    </details>
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run test/d2rDropsUi.test.ts && npx tsc -b`
Expected: PASS y tsc sin errores. Si "griffons-eye" no existe, reemplazarlo en `FARM_EXAMPLES` por el id que da `D.uniques.find((u) => u.key === "Griffon's Eye")`.

---

### Task 9: "¿Qué suelta?" y la ficha de cada jefe o superúnico

**Files:**
- Create:
  - `site/src/d2r/drops/DropLists.tsx`
  - `site/src/d2r/drops/DropsWhat.tsx`
  - `site/src/d2r/drops/SourcePage.tsx`
- Modify: `site/src/styles/d2r-drops.css` (una regla).
- Test: `site/test/d2rDropsUi.test.ts` (suma un bloque).

**Interfaces:**
- Consumes:
  - de Task 4: `dropsOf`, `placeKill`, `sourceKill`, `NO_TZ`, `CATS`, `Cat`, `DropLine`, `DropLists` y `PlaceRef`;
  - de Task 7: `parsePlace`, `placeParam`, `toOpts`, `toSettings`, `odds` y el copy;
  - `routePath` y `RouteLink`.
- Produces:
  - el default export `DropLists({ lists, route, navigate })`;
  - `PlaceSelect({ value, onChange, sourcesOnly? })`;
  - el default export `DropsWhat({ st, set, route, navigate })`;
  - el default export `SourcePage({ src, route, navigate })`.

- [ ] **Step 1: Sumar el test (falla porque no existen los componentes)**

Al final de `site/test/d2rDropsUi.test.ts`:

```ts
import { parseRoute } from "../src/route";
import DropsWhat from "../src/d2r/drops/DropsWhat";
import SourcePage from "../src/d2r/drops/SourcePage";

describe("¿Qué suelta? y la ficha de cada jefe", () => {
  const route = parseRoute("/es/d2r/drops");

  it("sin lugar pide elegir uno", () => {
    const html = inEs(createElement(DropsWhat, { st: { ...DEFAULT_STATE, m: "drops" as const }, set: () => undefined, route, navigate: () => undefined }));
    expect(html).toContain("Elegí un jefe, un superúnico o un área");
  });

  it("Mefisto en Infierno: runas y únicos con enlace a su ficha de la wiki", () => {
    const st = { ...DEFAULT_STATE, m: "drops" as const, place: { k: "s" as const, id: "mephisto" } };
    const html = inEs(createElement(DropsWhat, { st, set: () => undefined, route, navigate: () => undefined }));
    expect(html).toContain("Runa Cham");
    expect(html).toContain('href="/es/d2r/runes/cham"');
    expect(html).toContain('href="/es/d2r/uniques/');
    expect(html).toContain("Ver todo (");
  });

  it("la ficha de Mefisto: título, nivel y enlaces a la calculadora y al simulador", () => {
    const src = dropData().sourceById.get("mephisto")!;
    const html = inEs(createElement(SourcePage, { src, route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    expect(html).toContain("Qué suelta Mefisto");
    expect(html).toContain("nivel 87");
    expect(html).toContain("Runa Ber");
    // La ruta /d2r/drops llega en la Task 11 (que prueba el enlace entero): acá, sólo lo que arma la ficha.
    expect(html).toContain('?m=sim&amp;src=s.mephisto&amp;pd=2"');
  });
});
```

Run: `npx vitest run test/d2rDropsUi.test.ts`
Expected: FAIL (no existen `DropsWhat` ni `SourcePage`).

- [ ] **Step 2: Escribir `site/src/d2r/drops/DropLists.tsx`**

```tsx
/**
 * Las tres listas de "¿Qué suelta?" (2026-09-29): runas en su orden, y únicos
 * y piezas de conjunto de más a menos probable, cada uno con su chance y un
 * enlace a su ficha de la wiki. También el selector de lugar, que comparten
 * "¿Qué suelta?" y el simulador.
 */
import { useState } from "react";
import { useLang, useLocale } from "../../i18n";
import RouteLink from "../../RouteLink";
import type { Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { ItemIcon } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { odds } from "./format";
import type { DropLine, DropLists as Lists, PlaceRef } from "./places";
import { parsePlace, placeParam } from "./state";
import type { DropSource } from "./types";

type Nav = (r: Route) => void;
/** Cuántos únicos o piezas se ven antes de "Ver todo". */
const FIRST = 24;

/** La ficha de una runa se llama como la primera palabra de su nombre ("Ber Rune" → "ber"). */
const runeId = (code: string) => dropData().bases[code].n.en.split(" ")[0].toLowerCase();

export default function DropLists({ lists, route, navigate }: { lists: Lists; route: Route; navigate: Nav }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const D = dropData();
  if (!lists.runes.length && !lists.uniques.length && !lists.sets.length) return <p className="d2-empty">{td.noDrops}</p>;
  return (
    <>
      {lists.runes.length > 0 && (
        <section>
          <h2 className="d2-h3">{td.runes}</h2>
          <ul className="d2-dr-runes">
            {lists.runes.map((l) => {
              if (l.target.k !== "b") return null;
              const b = D.bases[l.target.code];
              return (
                <li key={l.target.code}>
                  <RouteLink className="d2-dr-rune" to={{ ...route, d2Section: "runes", detail: runeId(l.target.code) }} onNavigate={navigate}>
                    <ItemIcon asset={b.img} size="sm" />
                    <b>{tr(b.n, lang)}</b>
                    <small>{odds(l.p, locale, td)}</small>
                  </RouteLink>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ItemList title={td.uniques} lines={lists.uniques} route={route} navigate={navigate} />
      <ItemList title={td.sets} lines={lists.sets} route={route} navigate={navigate} />
    </>
  );
}

function ItemList({ title, lines, route, navigate }: { title: string; lines: DropLine[]; route: Route; navigate: Nav }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const [all, setAll] = useState(false);
  if (!lines.length) return null;
  const D = dropData();
  return (
    <section>
      <h2 className="d2-h3">{title}</h2>
      <ul className="d2-cards">
        {(all ? lines : lines.slice(0, FIRST)).map((l) => {
          if (l.target.k === "b") return null;
          const u = l.target.k === "u" ? D.uniqueById.get(l.target.id) : undefined;
          const s = l.target.k === "s" ? D.setById.get(l.target.id) : undefined;
          const x = u ?? s;
          if (!x) return null;
          // Los únicos que sólo salen por nombre (los de los Ancestros Colosales) no tienen ficha en la wiki.
          const to: Route | null = u ? (u.f ? null : { ...route, d2Section: "uniques", detail: u.id }) : { ...route, d2Section: "sets", detail: s!.set };
          const body = (
            <>
              <ItemIcon asset={x.img} size="sm" />
              <span className="d2-card-txt">
                <b className={u ? "d2-tone-unique" : "d2-tone-set"}>{tr(x.n, lang)}</b>
                <small>{odds(l.p, locale, td)}</small>
              </span>
            </>
          );
          return (
            <li key={x.id}>
              {to ? (
                <RouteLink className="d2-card" to={to} onNavigate={navigate}>
                  {body}
                </RouteLink>
              ) : (
                <span className="d2-card">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      {!all && lines.length > FIRST && (
        <button type="button" className="d2-chip" onClick={() => setAll(true)}>
          {td.showAll(lines.length)}
        </button>
      )}
    </section>
  );
}

/** El lugar: jefes y superúnicos por acto y, salvo en el simulador, las áreas de cada acto. */
export function PlaceSelect({ value, onChange, sourcesOnly = false }: { value: PlaceRef | null; onChange: (p: PlaceRef) => void; sourcesOnly?: boolean }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const D = dropData();
  const actOf = (s: DropSource) => (s.area !== null ? (D.areaById.get(s.area)?.act ?? 6) : 6);
  const sources = [...D.sources].sort((a, b) => actOf(a) - actOf(b) || tr(a.n, lang).localeCompare(tr(b.n, lang), lang));
  const cat = value?.k === "a" ? value.cat : "normal";
  return (
    <label className="d2-dr-field">
      <span>{td.place}</span>
      <select
        value={value ? placeParam(value) : ""}
        onChange={(e) => {
          const p = parsePlace(e.target.value);
          if (p) onChange(p);
        }}
      >
        <option value="" disabled>
          {td.pickPlace}
        </option>
        <optgroup label={td.bossGroup}>
          {sources.map((s) => (
            <option key={s.id} value={placeParam({ k: "s", id: s.id })}>
              {tr(s.n, lang)}
            </option>
          ))}
        </optgroup>
        {!sourcesOnly &&
          [1, 2, 3, 4, 5].map((act) => {
            // Las siete tumbas de Tal Rasha se llaman igual: con una alcanza.
            const seen = new Set<string>();
            const areas = D.areas.filter((a) => {
              const name = tr(a.n, lang);
              if (a.act !== act || !(a.mon.length || a.nmon.length) || seen.has(name)) return false;
              seen.add(name);
              return true;
            });
            return (
              <optgroup key={act} label={td.areaGroup(act)}>
                {areas.map((a) => (
                  <option key={a.id} value={placeParam({ k: "a", id: a.id, cat })}>
                    {tr(a.n, lang)}
                  </option>
                ))}
              </optgroup>
            );
          })}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Escribir `site/src/d2r/drops/DropsWhat.tsx`**

```tsx
/**
 * "¿Qué suelta?" (2026-09-29): elegís un jefe, un superúnico o un tipo de
 * monstruo de un área, la dificultad, y ves runas, únicos y piezas con su
 * chance por muerte.
 */
import { useMemo } from "react";
import type { Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import { dropData } from "./data";
import DropLists, { PlaceSelect } from "./DropLists";
import { CATS, dropsOf, placeKill, type Cat } from "./places";
import { toOpts, toSettings, type DropsState } from "./state";
import type { Diff } from "./types";

type Props = { st: DropsState; set: (p: Partial<DropsState>) => void; route: Route; navigate: (r: Route) => void };

export default function DropsWhat({ st, set, route, navigate }: Props) {
  const td = useD2rCopy().drops;
  const place = st.place;
  const kill = useMemo(
    () => (place ? placeKill(dropData(), place, st.pdiff, toOpts(st)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, st.pdiff, st.tz, st.tier, st.quest],
  );
  const lists = useMemo(
    () => (kill ? dropsOf(dropData(), kill, toSettings(st)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kill, st.mf, st.players, st.party, st.ladder],
  );
  return (
    <div className="d2-dr-what">
      <div className="d2-dr-place">
        <PlaceSelect value={place} onChange={(p) => set({ place: p })} />
        <Chips<number> label={td.diff} value={st.pdiff} onChange={(d) => set({ pdiff: d as Diff })} options={td.diffs.map((label, i) => ({ value: i, label }))} />
        {place?.k === "a" && (
          <Chips<string>
            label={td.place}
            value={place.cat}
            onChange={(cat) => set({ place: { k: "a", id: place.id, cat: cat as Cat } })}
            options={CATS.filter((c) => c !== "herald" || (st.tz > 0 && st.pdiff === 2)).map((c) => ({ value: c, label: td.cats[c] }))}
          />
        )}
      </div>
      {!place ? <p className="d2-empty">{td.pickPlace}</p> : lists ? <DropLists lists={lists} route={route} navigate={navigate} /> : <p className="d2-empty">{td.noDrops}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Escribir `site/src/d2r/drops/SourcePage.tsx`**

```tsx
/**
 * La ficha de un jefe o superúnico (2026-09-29, `/d2r/drops/mephisto`): todo lo
 * que puede soltar en cada dificultad, con su chance por muerte. Sale
 * prerenderizada en Infierno con 1 jugador y 300% de hallazgo mágico; al
 * cambiar algo se recalcula en el navegador.
 */
import { useMemo, useState } from "react";
import { useLang } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import { SEASON } from "../season";
import { BackLink, Chips } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import DropLists from "./DropLists";
import { dropsOf, NO_TZ, sourceKill } from "./places";
import type { Diff, DropSource } from "./types";

export default function SourcePage({ src, route, navigate }: { src: DropSource; route: Route; navigate: (r: Route) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const [diff, setDiff] = useState<Diff>(2);
  const [mf, setMf] = useState(300);
  const [players, setPlayers] = useState(1);
  const D = dropData();
  const kill = useMemo(() => sourceKill(D, src, diff, NO_TZ), [D, src, diff]);
  const lists = useMemo(() => (kill ? dropsOf(D, kill, { mf, players, party: 1, ladder: false, season: SEASON }) : null), [D, kill, mf, players]);
  const area = src.area !== null ? D.areaById.get(src.area) : undefined;
  const name = tr(src.n, lang);
  const calc = routePath({ ...route, detail: undefined });
  const sub = [src.kind === "boss" ? td.kindBoss : td.kindSuper, area ? `${tr(area.n, lang)} · ${td.act(area.act)}` : null, kill ? td.level(kill.mlvl) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article className="d2-detail d2-dr-src">
      <BackLink to={{ ...route, detail: undefined }} navigate={navigate} label={td.back} />
      <h1 className="d2-detail-h">{td.sourceTitle(name)}</h1>
      <p className="d2-detail-sub">{sub}</p>
      <p className="d2-dr-note">{td.sourceLede(name)}</p>
      <div className="d2-dr-controls">
        <Chips<number> label={td.diff} value={diff} onChange={(d) => setDiff(d as Diff)} options={td.diffs.map((label, i) => ({ value: i, label }))} />
        <label className="d2-dr-field">
          <span>{td.mf}</span>
          <input type="number" inputMode="numeric" min={0} max={9999} value={mf} onChange={(e) => setMf(Math.min(9999, Math.max(0, Math.round(Number(e.target.value) || 0))))} />
        </label>
        <label className="d2-dr-field">
          <span>{td.players}</span>
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lists ? <DropLists lists={lists} route={route} navigate={navigate} /> : <p className="d2-empty">{td.noDrops}</p>}
      <p className="d2-dr-links">
        <a className="d2-chip" href={`${calc}?m=sim&src=s.${src.id}&pd=${diff}`}>
          {td.openSim}
        </a>
        <a className="d2-chip" href={`${calc}?m=drops&src=s.${src.id}&pd=${diff}`}>
          {td.openCalc}
        </a>
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Que las listas de la ficha ocupen todo el ancho**

Al final de `site/src/styles/d2r-drops.css`, antes del `@media`:

```css
/* La ficha usa .d2-detail (todo alineado al inicio); sus listas van de lado a lado. */
.d2-dr-src > section, .d2-dr-src > .d2-dr-controls { justify-self: stretch; width: 100%; }
```

- [ ] **Step 6: Correr el test**

Run: `npx vitest run test/d2rDropsUi.test.ts && npx tsc -b`
Expected: PASS y tsc sin errores.

---

### Task 10: El simulador

**Files:**
- Create: `site/src/d2r/drops/DropsSim.tsx`
- Test: `site/test/d2rDropsUi.test.ts` (suma un bloque).

**Interfaces:**
- Consumes:
  - de Task 5: `simulateRuns`, `summarize` y `Loot`;
  - de Task 9: `PlaceSelect`;
  - de Task 4: `sourceKill`;
  - de Task 7: `toOpts` y `toSettings`.
- Produces: el default export `DropsSim({ st, set })`.

- [ ] **Step 1: Sumar el test (falla porque no existe)**

```ts
import DropsSim from "../src/d2r/drops/DropsSim";

describe("el simulador en la página", () => {
  const st = { ...DEFAULT_STATE, m: "sim" as const, place: { k: "s" as const, id: "mephisto" }, runs: 50 };

  it("antes de abrir el cofre muestra el botón y nada más", () => {
    const html = inEs(createElement(DropsSim, { st, set: () => undefined }));
    expect(html).toContain("Abrir el cofre");
    expect(html).not.toContain("runs de Mefisto");
  });

  it("con semilla, el mismo cofre cada vez", () => {
    const opened = { ...st, seed: 42 };
    const a = inEs(createElement(DropsSim, { st: opened, set: () => undefined }));
    const b = inEs(createElement(DropsSim, { st: opened, set: () => undefined }));
    expect(a).toBe(b);
    expect(a).toContain("50 runs de Mefisto");
    expect(a).toContain("montones de oro");
  });
});
```

Run: `npx vitest run test/d2rDropsUi.test.ts`
Expected: FAIL (no existe `DropsSim`).

- [ ] **Step 2: Escribir `site/src/d2r/drops/DropsSim.tsx`**

```tsx
/**
 * El simulador (2026-09-29): un jefe o superúnico, cuántas runs y "Abrir el
 * cofre". El botín sale como en el piso del juego, con sus etiquetas y sus
 * colores: lo notable arriba y el resto contado. La semilla va en el enlace,
 * así el mismo enlace abre el mismo cofre.
 */
import { useMemo, useState } from "react";
import { useLang, useLocale } from "../../i18n";
import { useD2rCopy } from "../../d2rCopy";
import { Chips } from "../ui";
import { tr } from "../wiki";
import { dropData } from "./data";
import { PlaceSelect } from "./DropLists";
import { sourceKill } from "./places";
import { simulateRuns, summarize, type Loot } from "./simulate";
import { toOpts, toSettings, type DropsState } from "./state";
import type { Diff } from "./types";

export default function DropsSim({ st, set }: { st: DropsState; set: (p: Partial<DropsState>) => void }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const D = dropData();
  const src = st.place?.k === "s" ? D.sourceById.get(st.place.id) : undefined;
  const kill = useMemo(
    () => (src ? sourceKill(D, src, st.pdiff, toOpts(st)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, st.pdiff, st.tz, st.quest],
  );
  const sum = useMemo(
    () => (kill && st.seed ? summarize(D, simulateRuns(D, kill, toSettings(st), st.runs, st.seed)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kill, st.seed, st.runs, st.mf, st.players, st.party, st.ladder],
  );
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin portapapeles: el enlace igual está en la barra de direcciones */
    }
  };
  const name = (l: Loot) =>
    tr(l.id ? (l.q === "set" ? D.setById.get(l.id)?.n : D.uniqueById.get(l.id)?.n) : D.bases[l.code]?.n, lang);
  const num = (n: number) => n.toLocaleString(locale);

  return (
    <div className="d2-dr-sim">
      <div className="d2-dr-place">
        <PlaceSelect value={st.place?.k === "s" ? st.place : null} onChange={(place) => set({ place, seed: 0 })} sourcesOnly />
        <Chips<number> label={td.diff} value={st.pdiff} onChange={(d) => set({ pdiff: d as Diff, seed: 0 })} options={td.diffs.map((label, i) => ({ value: i, label }))} />
        <label className="d2-dr-field">
          <span>{td.runs}</span>
          <input type="number" inputMode="numeric" min={1} max={1000} value={st.runs} onChange={(e) => set({ runs: Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))), seed: 0 })} />
        </label>
      </div>
      {!kill || !src ? (
        <p className="d2-empty">{td.simEmpty}</p>
      ) : (
        <>
          <div className="d2-dr-sim-actions">
            <button type="button" className="d2-dr-open-btn" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 2147483646) })}>
              {st.seed ? td.again : td.open}
            </button>
            {sum && (
              <button type="button" className="d2-chip" onClick={share}>
                {copied ? td.copied : td.share}
              </button>
            )}
          </div>
          {sum && (
            <>
              <p className="d2-dr-note">{td.simLede(num(st.runs), tr(src.n, lang))}</p>
              <div className="d2-dr-ground">
                {sum.notable.length === 0 ? (
                  <span className="d2-dr-note">{td.simNothing}</span>
                ) : (
                  sum.notable.map(({ loot, count }) => (
                    <span key={`${loot.q}|${loot.id ?? loot.code}`} className={`d2-dr-loot is-${/^r\d\d$/.test(loot.code) ? "rune" : loot.q}`}>
                      {name(loot)}
                      {count > 1 && <small>×{count}</small>}
                    </span>
                  ))
                )}
              </div>
              <p className="d2-dr-sum">
                <span className="is-rare">{td.rares(num(sum.rare))}</span>
                <span className="is-magic">{td.magics(num(sum.magic))}</span>
                <span>{td.normals(num(sum.normal))}</span>
                <span>{td.gold(num(sum.gold))}</span>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Correr el test**

Run: `npx vitest run test/d2rDropsUi.test.ts && npx tsc -b`
Expected: PASS y tsc sin errores.

---

### Task 11: La pestaña y su lugar en la sección (rutas, textos, SEO y portada)

**Files:**
- Create: `site/src/d2r/D2rDrops.tsx`
- Modify:
  - `site/src/route.ts`, `site/src/d2rCopy.ts`, `site/src/D2r.tsx` y `site/src/areaFiles.ts`;
  - `site/src/prerender.ts`, `site/vite.config.ts`, `site/src/d2r/index.ts` y `site/src/d2r/D2rHome.tsx`.
- Test: `site/test/d2r.test.ts` y `site/test/d2rDropsUi.test.ts`.

**Interfaces:**
- Consumes: de las Tasks 7 a 10, `DropsControls`, `DropsFarm`, `DropsWhat`, `DropsSim`, `SourcePage`, `readState`, `writeState` y `DEFAULT_STATE`.
- Produces:
  - la pestaña `drops` en `D2rTab`, `D2R_SECTIONS`, `D2R_DETAIL_SECTIONS`, `D2R_TABS` y `D2R_LIVE`;
  - el default export `D2rDrops({ route, navigate })`;
  - `Calculator({ route, navigate, missing, initial })`, exportado para los tests.

- [ ] **Step 1: Escribir los tests (fallan)**

Al final de `site/test/d2r.test.ts`:

```ts
import dropsIndex from "../../games/d2r/data/drops/index.json";

describe("la calculadora de drops en las direcciones, el sitemap y el prerender", () => {
  it("la pestaña y la ficha de cada jefe", () => {
    expect(routePath(parseRoute("/es/d2r/drops"))).toBe("/es/d2r/drops");
    const r = parseRoute("/en/d2r/drops/mephisto");
    expect(r.d2Section).toBe("drops");
    expect(r.detail).toBe("mephisto");
  });

  it("entran al sitemap y cada ficha tiene título con lo que se busca", () => {
    const withDrops = {
      dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
      d2: { ...d2meta, index: dropsIndex },
      dates: { d2r: d2meta.extractedAt },
    } as unknown as SitemapData;
    const paths = sitemapPaths(withDrops);
    expect(paths).toContain("/es/d2r/drops");
    expect(paths).toContain("/en/d2r/drops/mephisto");
    expect(metaFor(parseRoute("/es/d2r/drops/mephisto"), "es", "Mefisto").title).toMatch(/^Qué suelta Mefisto/);
    expect(metaFor(parseRoute("/en/d2r/drops"), "en", null).title).toMatch(/Drop Calculator/);
  });
});
```

Al final de `site/test/d2rDropsUi.test.ts`:

```ts
import D2rDrops from "../src/d2r/D2rDrops";

describe("la pestaña", () => {
  it("la calculadora con sus tres modos y el texto que la explica", () => {
    const html = inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops"), navigate: () => undefined }));
    expect(html).toContain("Calculadora de drops");
    for (const m of ["¿Dónde lo farmeo?", "¿Qué suelta?", "Simulador"]) expect(html).toContain(m);
    expect(html).toContain("Los números son exactos");
  });

  it("/d2r/drops/mephisto es la ficha de Mefisto; un id que no existe cae en la calculadora", () => {
    const mephisto = inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
    expect(mephisto).toContain("Qué suelta Mefisto");
    expect(mephisto).toContain('href="/es/d2r/drops?m=sim&amp;src=s.mephisto&amp;pd=2"');
    expect(inEs(createElement(D2rDrops, { route: parseRoute("/es/d2r/drops/no-existe"), navigate: () => undefined }))).toContain("¿Dónde lo farmeo?");
  });
});
```

Run: `npx vitest run test/d2r.test.ts test/d2rDropsUi.test.ts`
Expected: FAIL (la ruta cae en la portada y no existe `D2rDrops`).

- [ ] **Step 2: `site/src/route.ts`: la pestaña y sus fichas**

- Reemplazar `| "breakpoints" | "planner" | "grail" | "patches";` por `| "breakpoints" | "drops" | "planner" | "grail" | "patches";`.
- Reemplazar `"breakpoints", "planner", "grail", "patches"];` (en `D2R_SECTIONS`) por `"breakpoints", "drops", "planner", "grail", "patches"];`.
- Reemplazar `export const D2R_DETAIL_SECTIONS: D2rTab[] = ["runes", "runewords", "uniques", "sets", "classes", "patches"];` por `export const D2R_DETAIL_SECTIONS: D2rTab[] = ["runes", "runewords", "uniques", "sets", "classes", "patches", "drops"];`.

- [ ] **Step 3: `site/src/d2rCopy.ts`: pestaña, herramienta de la portada**

- En `D2R_TABS` y en `D2R_LIVE`, reemplazar `"breakpoints", "planner", "grail", "patches"]` por `"breakpoints", "drops", "planner", "grail", "patches"]`.
- En `EN.tabs`, reemplazar `classes: "Classes", grail: "Holy Grail", patches: "Patches",` por `classes: "Classes", drops: "Drops", grail: "Holy Grail", patches: "Patches",`.
- En `ES.tabs`, reemplazar `classes: "Clases", grail: "Grial", patches: "Parches",` por `classes: "Clases", drops: "Drops", grail: "Grial", patches: "Parches",`.
- En `EN.tools`, después de la línea `grail: { name: "Holy Grail", … },`, sumar:
  ```ts
    drops: { name: "Drop calculator", desc: "Where to farm any item, what every boss drops and a chest to open, Terror Zones included." },
  ```
- En `ES.tools`, después de `grail: { name: "Grial", … },`, sumar:
  ```ts
    drops: { name: "Calculadora de drops", desc: "Dónde farmear cada ítem, qué suelta cada jefe y un cofre para abrir, con las Zonas de Terror." },
  ```

- [ ] **Step 4: Escribir `site/src/d2r/D2rDrops.tsx`**

```tsx
/**
 * La calculadora de drops (2026-09-29, pedido de ZoTaD): tres modos —¿Dónde
 * lo farmeo?, ¿Qué suelta? y el Simulador— y una ficha por jefe o superúnico
 * (`/d2r/drops/mephisto`). Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md.
 *
 * El estado viaja en la dirección para compartirlo. La escritura se salta la
 * primera vuelta, como en el planificador: ahí el estado todavía es el de
 * fábrica y borraría el enlace que llegó.
 */
import { useEffect, useRef, useState } from "react";
import type { Route } from "../route";
import { useD2rCopy } from "../d2rCopy";
import { Chips, D2Head } from "./ui";
import { dropData } from "./drops/data";
import DropsControls from "./drops/DropsControls";
import DropsFarm from "./drops/DropsFarm";
import DropsSim from "./drops/DropsSim";
import DropsWhat from "./drops/DropsWhat";
import SourcePage from "./drops/SourcePage";
import { DEFAULT_STATE, readState, writeState, type DropsState, type Mode } from "./drops/state";
import "../styles/d2r-drops.css";

type Nav = (r: Route) => void;
const MODES: Mode[] = ["farm", "drops", "sim"];

export default function D2rDrops({ route, navigate }: { route: Route; navigate: Nav }) {
  const src = route.detail ? dropData().sourceById.get(route.detail) : undefined;
  if (src) return <SourcePage src={src} route={route} navigate={navigate} />;
  return <Calculator route={route} navigate={navigate} missing={!!route.detail} initial={DEFAULT_STATE} />;
}

export function Calculator({ route, navigate, missing, initial }: { route: Route; navigate: Nav; missing: boolean; initial: DropsState }) {
  const t = useD2rCopy();
  const td = t.drops;
  // La app no hidrata (createRoot reemplaza el HTML prerenderizado), así que el estado del enlace entra en el primer
  // render: sin parpadeo con el de fábrica, y "Más opciones" se abre solo si el enlace trae algo de adentro.
  // En el prerender no hay window: ahí va el de fábrica.
  const [st, setSt] = useState<DropsState>(() => (typeof window === "undefined" ? initial : readState(window.location.search)));
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    window.history.replaceState(window.history.state, "", window.location.pathname + writeState(st));
  }, [st]);
  const set = (p: Partial<DropsState>) => setSt((x) => ({ ...x, ...p }));
  return (
    <>
      <D2Head as="h1" title={td.title} lede={td.lede} />
      {missing && <p className="d2-empty">{t.wiki.notFound}</p>}
      <Chips<Mode> label={td.title} value={st.m} onChange={(m) => set({ m })} options={MODES.map((m) => ({ value: m, label: td.modes[m] }))} />
      <DropsControls st={st} set={set} mode={st.m} />
      {st.m === "farm" && <DropsFarm st={st} set={set} />}
      {st.m === "drops" && <DropsWhat st={st} set={set} route={route} navigate={navigate} />}
      {st.m === "sim" && <DropsSim st={st} set={set} />}
      <section className="d2-dr-about">
        {td.about.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>
    </>
  );
}
```

- [ ] **Step 5: Conectar la pestaña en `D2r.tsx` y `areaFiles.ts`**

En `site/src/D2r.tsx`:
- Después de `const D2rBreakpoints = lazyWithPreload(() => import("./d2r/D2rBreakpoints"));`, sumar:
  ```ts
  const D2rDrops = lazyWithPreload(() => import("./d2r/D2rDrops"));
  ```
- En `TABS`, después de `  breakpoints: D2rBreakpoints,`, sumar `  drops: D2rDrops,`.
- Después de `            {section === "breakpoints" && <D2rBreakpoints {...props} />}`, sumar:
  ```tsx
              {section === "drops" && <D2rDrops {...props} />}
  ```

En `site/src/areaFiles.ts`, después de `  breakpoints: "src/d2r/D2rBreakpoints.tsx",`, sumar `  drops: "src/d2r/D2rDrops.tsx",`.

- [ ] **Step 6: Títulos, JSON-LD, sitemap e índice de fichas**

En `site/src/prerender.ts`:
- Reemplazar `      if (sec === "patches") return s.patch(detailName);` por:
  ```ts
        if (sec === "patches") return s.patch(detailName);
        if (sec === "drops") return s.dropsSource(detailName);
  ```
- En el cast `s[sec as "runes" | … | "planner" | "grail" | "patches"]`, sumar `| "drops"` antes de `| "planner"`.
- Reemplazar `    if (sec === "planner" || sec === "grail") {` por `    if (sec === "planner" || sec === "grail" || (sec === "drops" && !route.detail)) {`.

En `site/vite.config.ts`, después del `try { d2!.index = … wiki/index.json … } catch { … }`, sumar:

```ts
    try {
      // Las fichas de jefes y superúnicos de la calculadora de drops, en el mismo índice.
      d2!.index = [...(d2!.index ?? []), ...JSON.parse(readFileSync(`${d2rDir}/drops/index.json`, "utf-8"))];
    } catch {
      /* sin drops.py corrido */
    }
```

En `site/src/d2r/index.ts`, reemplazar `loadD2Index` por:

```ts
export function loadD2Index(): Promise<D2IndexEntry[]> {
  // La wiki y las fichas de la calculadora de drops, en un solo índice.
  pending ??= Promise.all([import("@d2r/wiki/index.json"), import("@d2r/drops/index.json")]).then(([wiki, drops]) => {
    cache = [...(wiki.default as unknown as D2IndexEntry[]), ...(drops.default as unknown as D2IndexEntry[])];
    return cache;
  });
  return pending;
}
```

- [ ] **Step 7: La herramienta en la portada de la sección**

En `site/src/d2r/D2rHome.tsx`, dentro de `Tools`, primero en la lista:

```ts
    { key: "drops", icon: "quest/a2q6", ...t.tools.drops, to: "drops" },
```

- [ ] **Step 8: Correr los tests**

Run: `npx vitest run test/d2r.test.ts test/d2rDropsUi.test.ts test/areas.test.ts && npx tsc -b`
Expected: PASS y tsc sin errores. El test de imágenes de la portada ya exige `quest/a2q6.webp`, que dejó la Task 1.

---

### Task 12: "Dónde farmearlo" en las fichas de la wiki

**Files:**
- Create: `site/src/d2r/drops/FarmBlock.tsx`
- Modify:
  - `site/src/d2r/D2rUniques.tsx`, `site/src/d2r/D2rSets.tsx` y `site/src/d2r/D2rRunes.tsx`;
  - `site/src/styles/d2r-drops.css` (una regla);
  - `site/src/d2rCopy.ts`: `farmNoteLadder` en el bloque `drops`, en EN y ES.
- Test: `site/test/d2rDropsUi.test.ts` (suma un bloque).

**Interfaces:**
- Consumes:
  - de Task 6: `computed/farm-*.json` y `places.json`, `FarmEntry`, `FarmFile`, `parsePlaceKey` y `targetParam`;
  - `odds` (Task 7) y `routePath`.
- Produces:
  - el default export `FarmBlock({ entry, target, route })`;
  - `FarmPieces({ pieces, file, route })`.

- [ ] **Step 1: Sumar el test (falla)**

```ts
import D2rUniques from "../src/d2r/D2rUniques";
import D2rRunes from "../src/d2r/D2rRunes";
import D2rSets from "../src/d2r/D2rSets";

describe("Dónde farmearlo en las fichas de la wiki", () => {
  const page = (C: typeof D2rUniques, path: string) => inEs(createElement(C, { route: parseRoute(path), navigate: () => undefined }));

  it("la Cresta del arlequín: los mejores jefes y el enlace a la calculadora con el ítem", () => {
    const html = page(D2rUniques, "/es/d2r/uniques/harlequin-crest");
    expect(html).toContain("Dónde farmearlo");
    expect(html).toMatch(/Mefisto|Diablo|Baal/);
    expect(html).toContain('href="/es/d2r/drops?i=u.harlequin-crest"');
  });

  it("la runa Ist: la Condesa primero", () => {
    expect(page(D2rRunes, "/es/d2r/runes/ist")).toContain("La Condesa");
  });

  it("un conjunto: dónde farmear cada pieza", () => {
    const html = page(D2rSets, "/es/d2r/sets/tal-rashas-wrappings");
    expect(html).toContain("Dónde farmear cada pieza");
    expect(html).toContain("i=s.tal-rashas-guardianship");
  });

  it("lo que esta temporada sólo cae en Clasificación lo avisa (los datos traen `l: 1`)", () => {
    expect(page(D2rUniques, "/es/d2r/uniques/bloodletter")).toContain("en Clasificación");
    expect(page(D2rUniques, "/es/d2r/uniques/harlequin-crest")).not.toContain("en Clasificación");
  });
});
```

Run: `npx vitest run test/d2rDropsUi.test.ts`
Expected: FAIL (las fichas no muestran el bloque).

- [ ] **Step 2: Escribir `site/src/d2r/drops/FarmBlock.tsx`**

```tsx
/**
 * "Dónde farmearlo" en las fichas de la wiki (2026-09-29): los mejores jefes y
 * la mejor área para ese ítem con 1 jugador y 300% de hallazgo mágico, ya
 * calculados por `scripts/d2-drops.ts`, y un enlace a la calculadora con el
 * ítem. No carga el motor: la ficha sigue igual de liviana.
 */
import places from "@d2r/drops/computed/places.json";
import { useLang, useLocale } from "../../i18n";
import { routePath, type Route } from "../../route";
import { useD2rCopy } from "../../d2rCopy";
import type { Loc } from "../stats";
import { tr } from "../wiki";
import { parsePlaceKey, targetParam, type FarmEntry, type FarmFile, type PlaceNames } from "./farm";
import { odds } from "./format";
import type { Target } from "./types";
import "../../styles/d2r-drops.css";

const NAMES = places as unknown as PlaceNames;

export default function FarmBlock({ entry, target, route }: { entry: FarmEntry | undefined; target: Target; route: Route }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  if (!entry || (!entry.b.length && !entry.a.length)) return null;
  const calc = `${routePath({ ...route, d2Section: "drops", detail: undefined })}?i=${targetParam(target)}`;
  return (
    <section className="d2-dr-block">
      <h2 className="d2-h3">{td.farmTitle}</h2>
      <p className="d2-dr-note">{entry.l ? td.farmNoteLadder : td.farmNote}</p>
      <ol className="d2-dr-mini">
        {entry.b.map(([key, p]) => {
          const k = parsePlaceKey(key);
          return (
            <li key={key}>
              <b>{tr(NAMES.s[k.id], lang)}</b>
              <small>{td.diffs[k.diff]}</small>
              <span>{odds(p, locale, td)}</span>
            </li>
          );
        })}
        {entry.a.map(([key, normal, champ, unique]) => {
          const k = parsePlaceKey(key);
          const [cat, p] = normal > 0 ? (["normal", normal] as const) : champ > 0 ? (["champ", champ] as const) : (["unique", unique] as const);
          return (
            <li key={key}>
              <b>{tr(NAMES.a[k.id], lang)}</b>
              <small>
                {td.bestArea} · {td.diffs[k.diff]} · {td.cats[cat]}
              </small>
              <span>{odds(p, locale, td)}</span>
            </li>
          );
        })}
      </ol>
      <a className="d2-chip" href={calc}>
        {td.openCalc}
      </a>
    </section>
  );
}

/** En la ficha de un conjunto: la mejor fuente de cada pieza, en una sola lista. */
export function FarmPieces({ pieces, file, route }: { pieces: { id: string; name: Loc }[]; file: FarmFile; route: Route }) {
  const td = useD2rCopy().drops;
  const { lang } = useLang();
  const locale = useLocale();
  const rows = pieces.flatMap((x) => {
    const best = file[x.id]?.b[0];
    return best ? [{ ...x, best }] : [];
  });
  if (!rows.length) return null;
  const calc = routePath({ ...route, d2Section: "drops", detail: undefined });
  // Las piezas exclusivas de Clasificación (como las Angelicales en la temporada 15) se calcularon ahí.
  const ladder = pieces.some((x) => file[x.id]?.l);
  return (
    <section className="d2-dr-block">
      <h2 className="d2-h3">{td.farmPieces}</h2>
      <p className="d2-dr-note">{ladder ? td.farmNoteLadder : td.farmNote}</p>
      <ol className="d2-dr-mini">
        {rows.map((x) => {
          const k = parsePlaceKey(x.best[0]);
          return (
            <li key={x.id}>
              <a className="d2-tone-set" href={`${calc}?i=${targetParam({ k: "s", id: x.id })}`}>
                {tr(x.name, lang)}
              </a>
              <small>
                {tr(NAMES.s[k.id], lang)} · {td.diffs[k.diff]}
              </small>
              <span>{odds(x.best[1], locale, td)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

En `site/src/d2rCopy.ts`, en el bloque `drops`, después de `farmNote`:

- EN: `farmNoteLadder: "1 player, 300% magic find, on Ladder: this season it only drops there.",`
- ES: `farmNoteLadder: "Con 1 jugador y 300% de hallazgo mágico, en Clasificación: esta temporada sólo cae ahí.",`

Y en `site/src/styles/d2r-drops.css`, junto a las reglas de `.d2-dr-mini`:

```css
.d2-dr-mini a { font-family: var(--d2-title); text-decoration: none; }
```

- [ ] **Step 3: Poner los bloques en las tres fichas**

`site/src/d2r/D2rUniques.tsx`:
- Imports, debajo de los que ya hay:
  ```ts
  import farmU from "@d2r/drops/computed/farm-u.json";
  import FarmBlock from "./drops/FarmBlock";
  import type { FarmFile } from "./drops/farm";

  const FARM = farmU as unknown as FarmFile;
  ```
- En `UniqueDetail`, justo después del `<ItemBox … />`:
  ```tsx
        <FarmBlock entry={FARM[u.id]} target={{ k: "u", id: u.id }} route={route} />
  ```

`site/src/d2r/D2rRunes.tsx`:
- Imports:
  ```ts
  import farmR from "@d2r/drops/computed/farm-r.json";
  import FarmBlock from "./drops/FarmBlock";
  import type { FarmFile } from "./drops/farm";

  const FARM = farmR as unknown as FarmFile;
  ```
- En `RuneDetail`, justo después del `<ItemBox … />` (antes de `<nav className="d2-prevnext">`):
  ```tsx
        <FarmBlock entry={FARM[rune.code]} target={{ k: "b", code: rune.code }} route={route} />
  ```

`site/src/d2r/D2rSets.tsx`:
- Imports:
  ```ts
  import farmS from "@d2r/drops/computed/farm-s.json";
  import { FarmPieces } from "./drops/FarmBlock";
  import type { FarmFile } from "./drops/farm";

  const FARM = farmS as unknown as FarmFile;
  ```
- En `SetDetail`, después del `</div>` que cierra `d2-set-pieces` y antes de `<h2 className="d2-h3">{t.setsTab.setBonus}</h2>`:
  ```tsx
        <FarmPieces pieces={set.items.map((it) => ({ id: it.id, name: it.name }))} file={FARM} route={route} />
  ```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run test/d2rDropsUi.test.ts && npx tsc -b`
Expected: PASS y tsc sin errores.

---

### Task 13: Verificación completa, documento y memoria

**Files:**
- Modify: `docs/design/2026-09-29-d2r-calculadora-drops.md` (sección "Estado"), y los recuerdos `d2r-wiki-plan-2026-09-29.md` y `MEMORY.md`.

- [ ] **Step 1: Toda la suite, tipos y build**

Run (desde `site/`):
```bash
npx tsc -b
npx vitest run
npm run build
```
Expected:
- tsc sin errores;
- todos los tests en verde;
- el build prerenderiza unas 11.870 rutas (11.696 + ~85 fichas × 2 idiomas + la pestaña × 2);
- el tiempo de prerender no sube más de ~10 s respecto de los 17 s de hoy.

Si sube más, medir cuánto tarda `SourcePage` por ficha. Si hace falta, precalcular sus listas en `scripts/d2-drops.ts`, como `farm-*.json`.

- [ ] **Step 2: Revisar el HTML prerenderizado y el peso del chunk**

Run (desde `site/`):
```bash
grep -o "Qué suelta Mefisto[^<]*" dist/es/d2r/drops/mephisto.html | head -1
grep -c "1 en " dist/es/d2r/drops/mephisto.html
grep -o "Dónde farmearlo" dist/es/d2r/uniques/harlequin-crest.html | head -1
ls -la dist/assets | grep -i -E "D2rDrops|d2r-drops"
```
Expected:
- el título y decenas de "1 en " en la ficha de Mefisto;
- el bloque en la ficha de la Cresta;
- el chunk de `D2rDrops` con los datos del motor en ~300 KB sin comprimir. Anotar el número en el documento de diseño.

- [ ] **Step 3: Probar en el panel Browser (servidor de desarrollo)**

Con `preview_start` → `vestigo-ui` (puerto 5173), en la pestaña del panel:
1. `/es/d2r/drops`: escribir "shako" y elegir la Cresta.
   - Arriba tienen que aparecer Mefisto, Diablo y Baal.
   - Al abrir una fila: "¿Qué más suelta?" y "¿De dónde sale este número?" con el camino.
   - Abajo, la curva del MF.
2. Prender la Zona de Terror (nivel 90): tienen que aparecer filas marcadas.
3. "¿Qué suelta?" con Mefisto: runas y únicos con enlaces que abren la ficha de la wiki.
4. Simulador con Mefisto, 100 runs, "Abrir el cofre".
   - Se ven etiquetas de colores y el resumen.
   - "Copiar enlace" y recargar la página: sale el mismo cofre.
5. En la consola, `read_console_messages` con `onlyErrors: true`: ningún error.

- [ ] **Step 4: Celular a 375 px sin que nada se salga**

En el panel Browser, con el iframe oculto que ya se usó en esta sesión (`window.__check`), medir a 375 px:
- `/es/d2r/drops`;
- `/es/d2r/drops?i=u.harlequin-crest&tz=90`;
- `/es/d2r/drops?m=drops&src=s.mephisto`;
- `/es/d2r/drops?m=sim&src=s.mephisto&seed=42`;
- `/es/d2r/drops/mephisto`;
- `/es/d2r/uniques/harlequin-crest`, `/es/d2r/runes/ist` y `/es/d2r/sets/tal-rashas-wrappings`.

Expected: `scrollWidth` igual al ancho y ningún elemento fuera de la pantalla. Después, una captura con `resize_window` preset `mobile` (sólo en el panel) de la búsqueda de la Cresta, y volver a `desktop`.

- [ ] **Step 5: Documento y memoria**

Sumar al final de `docs/design/2026-09-29-d2r-calculadora-drops.md`:

```markdown
## Estado (2026-09-29)

- **Implementado:** el plan `docs/superpowers/plans/2026-09-29-d2r-calculadora-drops.md`, sin commitear.
- **Validado contra un evaluador exacto independiente** (1e-6) en 40 casos de jefes (con y sin el tope de 6) y
  12 de lugares:
  - jefes de Infierno con 0 y 300% de MF y con 8 jugadores;
  - Ber, la Guardia de Tal Rasha, Ist de la Condesa, Pindleskin y Eldritch;
  - comunes, campeones y únicos del Pozo 1;
  - Zona de Terror a nivel 90.
- **Contra Silospen en vivo** (1%), donde el 3.3 no cambió el camino. Silospen difiere en:
  - los jefes de 7 tiradas, porque recorta las tiradas a 6: nosotros damos alrededor de un 11% más;
  - la Condesa, por el tope real: nosotros damos un 18% menos;
  - lo que cambió en el 3.3.
- **Motor contra simulador:** 100.000 muertes de la Condesa, dentro de 5σ.
- **Regenerar después de un parche:** `python games/d2r/tools/drops.py` y, desde `site/`,
  `npx vite-node -c scripts/node.config.ts scripts/d2-drops.ts`.
```

Si durante la validación hubo que corregir una regla, anotar ahí cuál y por qué. Actualizar el recuerdo `d2r-wiki-plan-2026-09-29.md` (la calculadora hecha, cómo se regenera) y su línea en `MEMORY.md`.

- [ ] **Step 6: Dejar la vista de producción sirviendo el build nuevo**

Con `preview_stop` + `preview_start` → `vestigo-ui-prod` (puerto 5180). Abrir `http://localhost:5180/es/d2r/drops?i=u.harlequin-crest` y confirmar que carga sin errores.
