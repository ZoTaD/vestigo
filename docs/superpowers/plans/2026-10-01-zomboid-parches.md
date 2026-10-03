# Project Zomboid — Parches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña **Parches** (`/en/project-zomboid/patches`, `/es/project-zomboid/parches`) con:
- **la Crónica:** un resumen nuestro, en/es, de cada versión desde la 42.20 (Build 42 estable), con fecha, rama y enlaces a las notas de The Indie Stone (nunca copiadas);
- **los diffs automáticos:** cada extracción guarda una foto chica de la versión (ids + campos que importan) y la compara con la anterior: objetos, recetas, rasgos, profesiones, habilidades, moodles y opciones de sandbox nuevos, quitados y cambiados, campo por campo (antes → después), con enlace a cada ficha;
- **una página por versión** (`/parches/42-21`) con su `lastmod` en el sitemap;
- **"Qué cambió"** en cada ficha (objeto, receta, rasgo, profesión, habilidad, moodle) cuyo id cambió en las últimas 5 comparaciones.

Hoy sólo existe la 42.21: la primera página tiene que funcionar sin ningún diff.

**Architecture:**
- **`games/zomboid/tools/patches.py` (nuevo):**
  - `snapshot(files, …)` arma la foto a partir de lo que `extract.py` ya armó en memoria (no relee el juego);
  - `diff(a, b)` compara dos fotos;
  - `record(…)` guarda la foto en `data/patches/snapshots/` (gzip determinista) y el diff en `data/patches/diffs/`. Lo llama `extract.py` antes de escribir sus archivos, y corta si un cambio es sospechosamente masivo;
  - `news` baja los anuncios de Steam (público, sin clave) y deja borradores de la Crónica;
  - `check` valida la Crónica y que no tenga frases copiadas.
- **La Crónica** son archivos escritos a mano, `data/patches/chronicle/<slug>.json`, en/es. Es el mismo modelo que los parches de Diablo II (`games/d2r/data/patches/*.json`: resumen propio + enlace a las notas oficiales).
- **`site.py`** (ya existe) suma dos cosas:
  - las páginas del sitio, `data/site/patches/index.json` y `<slug>.json`, que juntan Crónica + diff + slugs de fichas;
  - el campo `changes` en cada ficha que cambió.

  Así todo viaja como el resto de los datos del sitio y el prerender lo tiene sin "cargando…".
- **Sitio:** `site/src/zomboid/patches/`:
  - lo puro (`slug.ts`, `fields.ts`) está separado de lo que dibuja (`ZomboidPatches.tsx`, `PatchDiff.tsx`, `ChangesBox.tsx`);
  - el índice viaja en el chunk de la pestaña y cada página se pide aparte, con línea en `TAB_DATA`, como Objetos.

**Tech Stack:** Python 3 (biblioteca estándar; `unittest`), React 18 + Vite + TS, Vitest.

## Global Constraints

- **Diseño:** `docs/design/2026-09-30-zomboid.md`, en especial:
  - "Pestañas" ítem 11: *"Parches: la Crónica (resúmenes propios en/es, sin copiar las notas de TIS) y los diffs automáticos."*;
  - "Datos": *"Diffs de parches: cada extracción guarda una foto chica por build (ids + campos que importan). El diff entre la anterior y la nueva alimenta 'qué cambió' en Parches y en cada ficha. Empieza en 42.21: antes no hay fotos."*;
  - "Direcciones": `patches` ↔ `parches`. Las páginas de versión llevan el mismo slug en los dos idiomas (`42-21`).
- **Patrones a copiar:**
  - `site/src/d2r/D2rPatches.tsx` y `games/d2r/data/patches/*.json` (Crónica propia en/es con `url` oficial);
  - `games/valheim/pipeline/patches.py` (`ISteamNews/GetNewsForApp`, User-Agent propio, borradores `.todo.json`, Crónica a mano);
  - `games/poe2/pipeline/patches.mjs` (`.cache/` fuera de git, ediciones viejas congeladas) y `site/src/poe2PatchesData.ts` (índice en el bundle, edición con `import.meta.glob` perezoso);
  - `site/src/zomboid/moodles/*` (lista + ficha, `wordFit`), `site/src/zomboid/items/data.ts` + `store.ts` (`once`, carga perezosa + `peek` para el prerender);
  - `site/src/Zomboid.tsx` (`TABS`, `TAB_DATA`), `site/src/areaFiles.ts` (`PZ_TAB_FILES`), `site/src/route.ts` (`PZ_PUBLISHED`; `patches` ya está en `PZ_SECTIONS`, `PZ_DETAIL_SECTIONS` y `PZ_SECTION_ES`), `site/src/sitemap.ts` (rama `d2r` de `sitemapLastmod`: es la que hay que imitar), `site/src/prerender.ts` (`detailNames`, `metaFor`), `site/src/PageMeta.tsx` (`dlDetailName`).
- **Worktree `C:\Users\Zotad\Desktop\vestigo-zomboid`, rama `feat/zomboid`.**
  - Otros agentes trabajan en el mismo worktree y el índice de git es compartido. **Nunca `git add -A`**: cada commit nombra sus archivos y se hace con `git commit -m "…" -- <archivos>`.
  - `games/zomboid/tools/extract.py` lo está tocando el plan del Servidor (`server.json`): sumá sólo las líneas del gancho, sin reformatear nada.
  - `test/deadlock.test.ts` falla por una dependencia ajena: ignorarlo.
- **Cada cosa visible se conecta en la rama apenas funciona** (ZoTaD mira `http://localhost:5178`): la pestaña, en un commit aparte al final de la Task 4; el recuadro de las fichas, con la Task 5.
- **La Crónica es texto nuestro:**
  - se escribe leyendo los anuncios oficiales, sin copiar frases: `patches.py check` corta si hay 8 palabras seguidas iguales a la fuente;
  - nunca se toma nada de PZwiki (CC BY-NC-SA);
  - cada entrada lleva al menos una fuente (`store.steampowered.com`, `theindiestone.com` o `projectzomboid.com`), y sin fuente no hay entrada;
  - el español va con voseo, y los nombres de objetos los del juego en ES_MX (los de `index.json`).
- **Reglas de la casa:**
  - sin bordes ni barras de color en tarjetas o filas: suba/baja se dice con texto y tinte de fondo;
  - las palabras no se cortan: `wordFit` en los títulos, nunca `overflow-wrap: anywhere`. Las claves crudas largas (`stats.conditionLowerChanceOneIn`) bajan de renglón sólo después de un punto (`<wbr>`);
  - sin scroll horizontal en el celular: los cambios son grillas que pasan a una columna, no tablas anchas;
  - nada de "sacado de los archivos del juego" en la UI. Sí se puede decir "desde la 42.21 comparamos versión contra versión";
  - el prerender nunca sale con "cargando…" (el build ya lo corta en `vite.config.ts`, `pz-loading`);
  - SEO: el título empieza por lo que se busca ("Project Zomboid 42.21 Patch Notes", "Notas del parche 42.21") y mide ≤ 65 caracteres; descripción > 80; nada huérfano (lista ↔ página ↔ fichas, portada → pestaña).
- Comentarios y commits en español rioplatense, explicando el porqué (`feat(zomboid): …`).

## Lo que dicen las fuentes (relevado el 2026-10-01)

**Anuncios de Steam** (`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=108600&count=200&maxlength=0&feeds=steam_community_announcements`, público y sin clave):
- Cada noticia trae `gid`, `title`, `date` (epoch UTC) y `contents` (BBCode).
  - El `url` que devuelve es de akamai: el enlace estable es `https://store.steampowered.com/news/app/108600/view/<gid>`.
  - Los anuncios de versión enlazan las notas completas en el foro (`https://theindiestone.com/forums/topic/101693-4221-unstable-released/`) y el blog (`https://projectzomboid.com/blog/news/2026/09/…`).
- Títulos reales, que los tests usan tal cual:

  | Fecha (UTC) | Título |
  |---|---|
  | 2026-09-28 | `Build 42.21 Stable Released` (gid 1844751498231307) |
  | 2026-09-23 | `Re-population of the Dead: Build 42.21 Unstable Released` (gid 1844751498218925) |
  | 2026-08-26 | `42.20.4 STABLE & 42.19.2 UNSTABLE & 41.78.21 LEGACY Hotfixes Released` |
  | 2026-08-17 | `42.20.3 STABLE Hotfix Released` |
  | 2026-08-05 | `42.20.2 STABLE Hotfix Released` y `42.20.1 STABLE Hotfix Released` |
  | 2026-07-29 | `Build 42.20.0 Stable Released` (el Build 42 pasa a estable) |
  | 2026-04-08 | `Stable(41.78.19) + UNSTABLE(42.16.3) Hotfixes Released` |
  | 2026-02-18 | `42.14.1 BETA HOTFIX Released` |
  | 2025-12-11 | `Unstable 42 MP Released` (sin versión: no es un parche) |

  Hay además blogs sin versión (`SPRING IS HERE`, `Location, Location`, `B42 CHECKLIST`…), que no son parches.
- `1790597228` (la fecha del de 42.21 estable) es `2026-09-28`.

**El juego instalado:**
- `meta.json` dice `"version": "42.21"`, `"build": 25485521`;
- `extract.py` lee la versión con `game_version()` (bytecode de `zombie/core/Core.class`, `GameVersion(42, 21, "")` → `"42.21"`; un hotfix con sufijo da `"42.21.1"`) y el build con `steam_build()` (`steamapps/appmanifest_108600.acf`, `"buildid"`). Las dos ya existen y no se tocan.
- La instalación de ZoTaD está en la rama estable, así que las fotos son de versiones estables. Una versión que sólo salió en Unstable (42.19) no tiene foto.

**Tamaño de la foto** (medido sobre los datos de la 42.21):
- los 4.878 objetos con sus `stats` pesan 1,47 MB crudos y 122 KB con gzip; las 1.170 recetas, ~90 KB con gzip;
- la foto entera, con gzip, queda en ~230 KB por versión.

**Ids por tipo** (únicos dentro de su tipo):

| Tipo | Ejemplo | Dónde está |
|---|---|---|
| objetos | `Base.Axe` | `items/<tipo>.json` |
| recetas | `MakeStake` | `recipes.json` → `recipes[].id`; incluye las de construir |
| rasgos | `strong` | `traits.json` |
| profesiones | `burglar` | `professions.json` |
| habilidades | `Woodwork` (en "Carpentry", es "Carpintería") | las claves de `skills.json` |
| moodles | `Hungry` | `moodles.json` |
| opciones de sandbox | `Zombies`, `ZombieLore.Speed` | `server.json` → `options[].key`, sólo si el plan del Servidor ya lo escribe |

---

### Task 1: La foto por versión y el diff (`patches.py`), enganchados a `extract.py`

**Files:**
- Create: `games/zomboid/tools/patches.py`, `games/zomboid/tools/test_patches.py`
- Modify: `games/zomboid/tools/extract.py`. Sólo el gancho en `main()`, justo antes de `# --- Archivos ---`.
- Modify: `games/zomboid/README.md`:
  - "En cada parche": el paso de la foto;
  - "Qué escribe": `data/patches/snapshots/` y `data/patches/diffs/`;
  - "Cuándo corta": el corte por cambio masivo.
- Create (generado): `games/zomboid/data/patches/snapshots/index.json`, `games/zomboid/data/patches/snapshots/42.21.json.gz`

**Interfaces:**
- Consumes: de `extract.py`, `DATA` y `moodle_name(mid) -> (en, es)`. `patches.py` los importa con `from extract import DATA, moodle_name`: `extract.py` no hace nada al importarse.
- Produces:
  ```python
  PATCHES = os.path.join(DATA, "patches")
  KINDS = ("items", "recipes", "traits", "professions", "skills", "moodles", "sandbox")
  FORMAT = 1
  def slug(sid: str) -> str                              # "42.21" → "42-21", "42.22-b3" → "42-22-b3"
  def snapshot(files: dict, version: str, build: int | None, recorded_at: str) -> dict
  def diff(old: dict, new: dict) -> dict
  def suspicious(d: dict, old: dict, min_n: int = 200, share: float = 0.5) -> list[str]
  def record(files: dict, version: str, build: int | None, today: str, root: str = PATCHES,
             accept: bool = False) -> tuple[str, str]  # ("nueva" | "igual" | "rehecha", id)
  def read_snapshot(root: str, sid: str) -> dict
  def snapshots_index(root: str) -> list[dict]            # [{id, version, build, recordedAt}], de la más vieja a la más nueva
  ```
- **La foto:**
  ```json
  {"format": 1, "id": "42.21", "version": "42.21", "build": 25485521, "recordedAt": "2026-10-01",
   "kinds": {"items": {"Base.Axe": {"n": {"en": "Axe", "es": "Hacha"}, "f": {"cat": "ToolWeapon", "name": "Axe", "stats.maxDamage": 2, "tags": ["base:axe", "base:choptree"], …}}}, …}}
  ```
  - `n` es sólo para mostrar (no se compara);
  - `f` son los campos aplanados que se comparan.
- **El diff** (`data/patches/diffs/<slug(to)>.json`):
  ```json
  {"from": "42.21", "to": "42.22",
   "kinds": {"items": {"added": ["Base.Fork"], "removed": ["Base.Spoon"],
                       "changed": {"Base.Axe": [{"f": "stats.maxDamage", "b": 2, "a": 2.2}, {"f": "tags", "add": ["base:fireaxe"]}]}}},
   "counts": {"items": {"added": 1, "removed": 1, "changed": 1}},
   "names": {"items": {"Base.Fork": {"en": "Fork", "es": "Tenedor"}, …}}}
  ```
  - Un cambio de campo es `{"f", "b"?, "a"?}` (falta `b`: el campo es nuevo; falta `a`: se fue) o `{"f", "add"?, "rem"?}` (los campos tipo conjunto).
  - Un tipo sin cambios no aparece en `kinds`.
  - Las claves `f` se ordenan alfabéticamente.

**Qué entra en la foto** (TEXTO NUESTRO en los comentarios: el criterio es "lo que la ficha muestra y le importa a quien juega"):

```python
SET_FIELDS = {  # listas en las que el orden no dice nada: se comparan como conjuntos (agregados / quitados)
    "tags", "categories", "bloodLocation", "clothingItemExtra", "spawnWith", "attachmentsProvided", "mountOn",
    "gunType", "replaceOnCooked", "fireModePossibilities", "teaches", "research", "opens", "books", "recipes",
    "grantedTraits", "exclusive", "traits", "inputs", "outputs", "stations",
}
SCALAR = (str, int, float, bool, type(None))


def is_loc(v):
    return isinstance(v, dict) and set(v) == {"en", "es"}


def flat(value, prefix, out):
    """
    Aplana a {"a.b.c": valor}. Un {en, es} queda en su inglés: una corrección de la traducción no es un cambio del
    juego. Una lista de escalares queda lista (ordenada y sin repetidos si su último tramo está en SET_FIELDS); una con
    diccionarios adentro (los `xpMult` de un rasgo, `fluid.fluids`) queda como su JSON canónico, comparado entero.
    """
    if is_loc(value):
        out[prefix] = value["en"]
    elif isinstance(value, dict):
        for k in sorted(value):
            flat(value[k], f"{prefix}.{k}" if prefix else k, out)
    elif isinstance(value, list):
        if all(isinstance(x, SCALAR) for x in value):
            leaf = prefix.rsplit(".", 1)[-1]
            out[prefix] = sorted(set(value), key=str) if leaf in SET_FIELDS else list(value)
        else:
            out[prefix] = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    else:
        out[prefix] = value
    return out


def io_line(io, mappers):
    """Un renglón de ingrediente o resultado: "2× Base.Nails", "1× Base.Plank|Base.TreeBranch2", "1× tag:base:saw keep"."""
    n = io.get("count", 1)
    if "items" in io:
        what = "|".join(sorted(io["items"]))
    elif "tags" in io:
        what = "tag:" + "|".join(sorted(io["tags"]))
    elif "item" in io:
        what = io["item"]
    elif "mapper" in io:
        what = "|".join(sorted(k for k in mappers.get(io["mapper"], {}) if k != "default")) or "mapper:" + io["mapper"]
    elif "entity" in io:
        what = "entity:" + io["entity"]
    else:  # líquidos y lo que venga: su JSON sin lo que no cambia el resultado
        what = json.dumps({k: v for k, v in io.items() if k not in ("count", "mode", "flags", "mappers")},
                          ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"{n}× {what}{' keep' if io.get('mode') == 'keep' else ''}"
```

Qué campos va a buscar cada tipo (lo que no está en la lista, como íconos, tooltips o modelos, no entra):

| Tipo | Campos (`src` que se aplana) | `n` |
|---|---|---|
| `items` | `name`, `type`, `cat` (= `displayCategory`), `weight`, `tags`, `stats` (entero), y `teaches` / `research` / `opens` si están | `name` |
| `recipes` | `name`, `kind`, `category`, `time`, `skills`, `xp`, `inputs` y `outputs` (como renglones de `io_line`, con los `mappers` de la receta), `stations`, `learn` | `name` |
| `traits` | `name`, `desc`, `cost`, `professionOnly`, `disabledInMultiplayer`, `xpBoosts`, `recipes`, `grantedTraits`, `exclusive`, `xpMult` | `name` |
| `professions` | `name`, `desc`, `cost`, `xpBoosts`, `traits`, `recipes` | `name` |
| `skills` | `name` (`{en, es}` de la entrada), `cat` (= `cat.id`), `xp` (lista por posición), `boost`, `start` | `{en, es}` |
| `moodles` | `levels` como `{"<nivel>": {"name", "desc"}}` | `moodle_name(id)` |
| `sandbox` | sólo si `files` trae `server.json`: `type`, `default`, `min`, `max` y `n` = `len(values)` | `name` |

**Reglas de `diff_fields(a, b)`** (las dos `f`):
- Distinto quiere decir distinto en tipo o en valor: `True` contra `1` es un cambio (en Python `True == 1`).
- **Lista en `SET_FIELDS`:** `add` = las de b que no están en a, en el orden de b; `rem` = al revés. Si las dos quedan vacías, no hay cambio.
- **Otra lista de escalares, del mismo largo:** un cambio por posición, `{"f": "xp.3", "b": 750, "a": 800}`. Con otro largo, el cambio va entero.
- **Lo demás:** `{"f", "b", "a"}`.

**`diff(old, new)`:**
- Un tipo que falta en alguna de las dos fotos no se compara: el primer `server.json` no tiene que aparecer como "269 opciones nuevas".
- `names[kind]` lleva el `n` de cada id nombrado (de la foto nueva, o de la vieja si se quitó).

**`suspicious`:** por (tipo, `f`), si cambian ≥ `min_n` entidades y eso es ≥ `share` de las que tenían ese campo en la foto vieja, devuelve un aviso. La idea: un cambio del extractor (que ahora normaliza distinto un stat) no puede publicarse como parche.

**`record`:**
1. Arma la foto.
2. **Sin fotos guardadas:** la guarda como `version` y devuelve `("nueva", version)`, sin diff.
3. **`kinds` igual a la última:** `("igual", id_última)`, y no escribe nada. Por ejemplo, un hotfix que no tocó datos.
4. **Misma `version` y mismo `build` que la última, con datos distintos:** es un cambio del extractor y no del juego. Avisa por stderr, reescribe esa foto (mismo id) y, si hay una anterior, rehace su diff contra ella (con el corte). Devuelve `("rehecha", id)`.
5. **Si no:** el id es `version`, o `f"{version}-b{build}"` si esa versión ya tiene foto (un parche sin cambio de número). Calcula el diff contra la última y lo pasa por `suspicious`:
   - si hay avisos y no se aceptaron, `SystemExit` **antes de escribir nada**, con este mensaje: "Cambian N objetos en stats.X… Si es un parche de verdad, corré de nuevo con PZ_ACEPTO_CAMBIOS_MASIVOS=1; si es un cambio de extract.py, revisalo antes";
   - si no, escribe `diffs/<slug>.json`, la foto, y suma la entrada a `snapshots/index.json`. Devuelve `("nueva", id)`.
- **La foto** se escribe con `gzip.GzipFile(fileobj=…, mode="wb", compresslevel=9, mtime=0, filename="")` sobre `json.dumps(…, ensure_ascii=False, sort_keys=True, separators=(",", ":"))`: el mismo dato da los mismos bytes, y git no ve un cambio falso.
- **Los JSON** (`index.json`, diffs) se escriben como en `extract.py` (`dumps` compacto, `newline="\n"`) y sólo si cambiaron.

**CLI** (`python games/zomboid/tools/patches.py <comando>`):
- `rebuild`: rehace todos los diffs a partir de las fotos guardadas, de a pares consecutivos, sin el corte. Sirve si cambia `diff`.
- `news` y `check`: Task 2.
- Sin comando: imprime las fotos guardadas y los diffs.

**El gancho en `extract.py`** (`main()`, después de armar `files` y antes de escribir):
```python
    # La foto de esta versión y el diff contra la anterior (patches.py), antes de escribir: si el cambio es
    # sospechosamente masivo corta acá, sin dejar los datos a medias.
    import patches
    estado, sid = patches.record(files, version, build, datetime.date.today().isoformat(),
                                 accept=os.environ.get("PZ_ACEPTO_CAMBIOS_MASIVOS") == "1")
```
Y en el informe, una línea: `Parches: foto {estado} {sid}` más, si hubo diff, sus `counts`.

- [ ] **Step 1: Tests que fallan** (`games/zomboid/tools/test_patches.py`, `unittest`, con `unittest.main()` al pie, el mismo encabezado que `test_server.py`). Fixture sintético:
  ```python
  def files_old():
      return {
          "items/weapon.json": [
              {"id": "Base.Axe", "name": {"en": "Axe", "es": "Hacha"}, "type": "weapon", "displayCategory": "ToolWeapon",
               "icon": "Axe", "weight": 3, "tags": ["base:choptree", "base:axe"],
               "stats": {"minDamage": 0.8, "maxDamage": 2, "categories": ["axe"], "twoHanded": True,
                         "bodyLocationName": {"en": "Hands", "es": "Manos"}}},
              {"id": "Base.Spoon", "name": {"en": "Spoon", "es": "Cuchara"}, "type": "weapon",
               "displayCategory": "Cooking", "icon": "Spoon", "weight": 0.1, "tags": [], "stats": {}},
          ],
          "recipes.json": {"recipes": [
              {"id": "MakeStake", "kind": "craft", "name": {"en": "Make Stake", "es": "Hacer estaca"},
               "category": "Carpentry", "time": 50, "skills": {"Woodwork": 1}, "xp": {"Woodwork": 5},
               "inputs": [{"count": 1, "items": ["Base.TreeBranch2", "Base.Plank"], "mode": "destroy"},
                          {"count": 1, "tags": ["base:sharpknife"], "mode": "keep", "flags": ["MayDegradeLight"]}],
               "outputs": [{"count": 1, "item": "Base.Stake"}]}]},
          "traits.json": [{"id": "strong", "name": {"en": "Strong", "es": "Fuerte"},
                           "desc": {"en": "Extra knockback", "es": "Más empuje"}, "cost": 10, "professionOnly": False,
                           "disabledInMultiplayer": False, "xpBoosts": {"Strength": 4}, "recipes": [],
                           "grantedTraits": [], "exclusive": ["feeble"], "icon": "trait_strong"}],
          "professions.json": [{"id": "burglar", "name": {"en": "Burglar", "es": "Ladrón"}, "desc": None, "cost": -6,
                                "xpBoosts": {"Nimble": 2}, "traits": ["burglar"], "recipes": ["MakeShiv"], "icon": "p"}],
          "skills.json": {"Axe": {"en": "Axe", "es": "Hacha", "cat": {"id": "Combat", "en": "Combat", "es": "Combate"},
                                  "xp": [75, 150, 300, 750]}},
          "moodles.json": [{"id": "Hungry", "icon": "Moodle_Icon_Hungry", "levels": [
              {"level": 1, "name": {"en": "Peckish", "es": "Con apetito"}, "desc": {"en": "a", "es": "a"}}]}],
          "server.json": {"options": [
              {"key": "Zombies", "type": "enum", "default": 4, "values": [{"en": str(i), "es": str(i)} for i in range(6)],
               "name": {"en": "Zombie Count", "es": "Cantidad de zombis"}, "page": "Zombie"},
              {"key": "WaterShutModifier", "type": "int", "default": 14, "min": -1, "max": 2147483647,
               "name": {"en": "Water Shutoff", "es": "Corte de agua"}, "page": "WorldOptions"}]},
      }

  def files_new():
      f = copy.deepcopy(files_old())
      axe, spoon = f["items/weapon.json"]
      axe["stats"]["maxDamage"] = 2.2
      axe["tags"].append("base:fireaxe")
      axe["stats"]["bodyLocationName"]["es"] = "Mano"          # sólo traducción: no es un cambio
      f["items/weapon.json"] = [axe, {"id": "Base.Fork", "name": {"en": "Fork", "es": "Tenedor"}, "type": "weapon",
                                      "displayCategory": "Cooking", "icon": "Fork", "weight": 0.1, "tags": [], "stats": {}}]
      stake = f["recipes.json"]["recipes"][0]
      stake["time"] = 40
      stake["inputs"][0]["items"] = ["Base.TreeBranch2"]
      f["traits.json"][0]["cost"] = 8
      f["traits.json"][0]["exclusive"].append("weak")
      f["skills.json"]["Axe"]["xp"][3] = 800
      f["moodles.json"][0]["levels"][0]["name"]["en"] = "Slightly Hungry"
      f["server.json"]["options"][1]["default"] = 30
      return f
  ```

  **La foto:**
  - `snapshot(files_old(), "42.21", 1, "2026-10-01")["kinds"]["items"]["Base.Axe"]` es igual a:
    ```python
    {"n": {"en": "Axe", "es": "Hacha"}, "f": {"cat": "ToolWeapon", "name": "Axe", "stats.bodyLocationName": "Hands",
     "stats.categories": ["axe"], "stats.maxDamage": 2, "stats.minDamage": 0.8, "stats.twoHanded": True,
     "tags": ["base:axe", "base:choptree"], "type": "weapon", "weight": 3}}
    ```
  - la receta tiene `f["inputs"] == ["1× Base.Plank|Base.TreeBranch2", "1× tag:base:sharpknife keep"]`, `f["outputs"] == ["1× Base.Stake"]`, `f["skills.Woodwork"] == 1` y `f["xp.Woodwork"] == 5`;
  - `kinds["sandbox"]["WaterShutModifier"]["f"] == {"default": 14, "max": 2147483647, "min": -1, "type": "int"}` y `Zombies` tiene `"n": 6`;
  - `kinds["moodles"]["Hungry"]["n"] == {"en": "Hungry", "es": "Hambre"}` y `f["levels.1.name"] == "Peckish"`.

  **El diff:** `d = diff(old, new)`, con `old`/`new` = las fotos con `id` "42.21"/"42.22", es exactamente:
  ```python
  {"items": {"added": ["Base.Fork"], "removed": ["Base.Spoon"],
             "changed": {"Base.Axe": [{"f": "stats.maxDamage", "b": 2, "a": 2.2}, {"f": "tags", "add": ["base:fireaxe"]}]}},
   "recipes": {"added": [], "removed": [], "changed": {"MakeStake": [
       {"f": "inputs", "add": ["1× Base.TreeBranch2"], "rem": ["1× Base.Plank|Base.TreeBranch2"]},
       {"f": "time", "b": 50, "a": 40}]}},
   "traits": {"added": [], "removed": [], "changed": {"strong": [{"f": "cost", "b": 10, "a": 8},
                                                                {"f": "exclusive", "add": ["weak"]}]}},
   "skills": {"added": [], "removed": [], "changed": {"Axe": [{"f": "xp.3", "b": 750, "a": 800}]}},
   "moodles": {"added": [], "removed": [], "changed": {"Hungry": [{"f": "levels.1.name", "b": "Peckish", "a": "Slightly Hungry"}]}},
   "sandbox": {"added": [], "removed": [], "changed": {"WaterShutModifier": [{"f": "default", "b": 14, "a": 30}]}}}
  ```
  Además:
  - `"professions" not in d["kinds"]`;
  - `d["counts"]["items"] == {"added": 1, "removed": 1, "changed": 1}`;
  - `d["names"]["items"]["Base.Spoon"] == {"en": "Spoon", "es": "Cuchara"}`;
  - `d["from"] == "42.21"`.

  **Más casos:**
  - **Tipo:** un stat `True` → `1` es un cambio.
  - **Sandbox sólo en la nueva:** con `server.json` sólo en la nueva, `"sandbox" not in diff(...)["kinds"]`.
  - **`slug`:** `slug("42.21") == "42-21"`, `slug("42.21.1") == "42-21-1"`, `slug("42.22-b3") == "42-22-b3"`.
  - **`suspicious`:** 300 objetos sintéticos con `stats.foo` 1 → 2 dan 1 aviso que nombra `stats.foo`; con 10 objetos, 0 avisos.
  - **`record` en un `tempfile.TemporaryDirectory()`:**
    1. viejo con `"42.21"`, build 1 → `("nueva", "42.21")`: está `snapshots/42.21.json.gz` y no hay `diffs/`;
    2. otra vez lo mismo → `("igual", "42.21")`;
    3. nuevo con `"42.22"`, build 2 → `("nueva", "42.22")` y `diffs/42-22.json` es el `diff` de arriba;
    4. nuevo con un cambio más, `"42.22"`, build 3 → `("nueva", "42.22-b3")`;
    5. otro cambio con `"42.22"`, build 3 → `("rehecha", "42.22-b3")`, y `snapshots_index` sigue con 3 entradas.
  - **gzip:** escribir la misma foto dos veces da los mismos bytes.
  - **El corte:** el caso de 300 objetos en `record` → `SystemExit` y el directorio queda como estaba; con `accept=True`, pasa.
  - **Con los datos reales** (`@unittest.skipUnless(os.path.exists(os.path.join(DATA, "items.json")), "sin datos")`, cargando los mismos nombres de archivo que arma `extract.py`):
    - la foto tiene 4.878 objetos, 1.170 recetas, 97 rasgos, 25 profesiones, 35 habilidades y 26 moodles;
    - su gzip pesa < 400 KB.
- [ ] **Step 2:** `python games/zomboid/tools/test_patches.py -v` → FAIL (no existe `patches`).
- [ ] **Step 3:** Implementar `patches.py` (con el docstring de arriba como en `extract.py`: qué lee, qué escribe, cuándo corta y cómo se usa) y el gancho de `extract.py`.
- [ ] **Step 4:** `python games/zomboid/tools/test_patches.py -v` → PASS.
- [ ] **Step 5: La primera foto.** `python games/zomboid/tools/extract.py` imprime `Parches: foto nueva 42.21` y escribe `games/zomboid/data/patches/snapshots/{index.json,42.21.json.gz}`. Una segunda corrida dice `foto igual 42.21`, y `git status` muestra sólo esos dos archivos nuevos en `data/patches`. Si `extractedAt` se movió, es por otro plan: no se commitea `meta.json` acá.
- [ ] **Step 6: README.** En "En cada parche", después del paso 2: "extract.py guarda la foto de la versión y el diff contra la anterior (patches.py); si corta por un cambio masivo, revisá `git diff` y, si es un parche de verdad, `PZ_ACEPTO_CAMBIOS_MASIVOS=1 python games/zomboid/tools/extract.py`". En "Qué escribe", las dos carpetas. En "Cuándo corta", el corte.
- [ ] **Step 7: Commit**
  ```bash
  git add games/zomboid/tools/patches.py games/zomboid/tools/test_patches.py games/zomboid/data/patches/snapshots/index.json games/zomboid/data/patches/snapshots/42.21.json.gz
  git commit -m "feat(zomboid): cada extracción guarda la foto de la versión y el diff contra la anterior, empezando por la 42.21" -- games/zomboid/tools/patches.py games/zomboid/tools/test_patches.py games/zomboid/tools/extract.py games/zomboid/README.md games/zomboid/data/patches/snapshots/index.json games/zomboid/data/patches/snapshots/42.21.json.gz
  ```
  `extract.py` y `README.md` ya están en el índice de git (no hace falta `git add`); el `--` hace que el commit lleve sólo esos archivos y no lo que otro agente haya agregado.

---

### Task 2: La Crónica — borradores desde Steam, el control y las primeras entradas (42.20 y 42.21)

**Files:**
- Modify: `games/zomboid/tools/patches.py` (comandos `news` y `check`), `games/zomboid/tools/test_patches.py`
- Create: `games/zomboid/data/patches/chronicle/42-20.json`, `games/zomboid/data/patches/chronicle/42-21.json`
- Modify: `games/zomboid/README.md` ("En cada parche": los pasos de la Crónica)

**Interfaces:**
- Consumes: `slug`, `PATCHES` (Task 1).
- Produces:
  ```python
  APP_ID = "108600"
  FEED = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=108600&count=200&maxlength=0&feeds=steam_community_announcements"
  UA = "Vestigo (vestigo.gg) zomboid patch notes"
  FIRST = (42, 20)                      # la Crónica arranca en el Build 42 estable
  ALLOWED_HOSTS = {"store.steampowered.com", "theindiestone.com", "projectzomboid.com"}
  def title_versions(title: str) -> list[tuple[str, str]]   # [(versión, "stable" | "unstable")]
  def parent(version: str) -> str                           # "42.20.4" → "42.20"
  def steam_url(gid: str) -> str                            # https://store.steampowered.com/news/app/108600/view/<gid>
  def notes_url(contents: str) -> str | None                # el primer theindiestone.com/forums/topic/…
  def news_stubs(items: list[dict], have: set[str]) -> dict[str, dict]   # slug → borrador (sólo los que no están en `have`)
  def words(s: str) -> list[str]
  def copied_runs(ours: str, theirs: str, n: int = 8) -> list[str]
  def check(root: str = PATCHES) -> tuple[list[str], list[str]]          # (problemas, pendientes .todo)
  ```
- **El formato de una entrada** (`chronicle/<slug>.json`, a mano, el mismo espíritu que `games/d2r/data/patches/3-3.json`):
  ```json
  {
    "slug": "42-21", "version": "42.21", "branch": "stable", "date": "2026-09-28", "unstableDate": "2026-09-23",
    "title": {"en": "…", "es": "…"},
    "summary": {"en": "2 a 4 oraciones nuestras", "es": "…"},
    "highlights": [{"en": "…", "es": "…"}],
    "hotfixes": [{"version": "42.20.1", "date": "2026-08-05", "summary": {"en": "una oración", "es": "…"},
                  "sources": [{"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/…", "gid": "…"}]}],
    "sources": [{"kind": "steam", "url": "…", "gid": "…"}, {"kind": "notes", "url": "https://theindiestone.com/forums/topic/…"}],
    "updated": "2026-10-01"
  }
  ```
  - `unstableDate` y `hotfixes` son opcionales; `highlights` lleva de 0 a 8; `updated` es la fecha en que lo editamos por última vez, y va al `lastmod`.
  - `branch` dice dónde salió `date`: `"stable"`, o `"unstable"` si todavía no llegó a estable.

**`title_versions`:**
1. Parte el título por `&` y por `+`.
2. En cada parte busca `\b4[2-9]\.\d+(?:\.\d+)?\b`. El 41 (legacy) queda afuera.
3. La rama es `"stable"` si la parte dice `STABLE` (sin importar mayúsculas); `"unstable"` si dice `UNSTABLE` o `BETA`; si no dice ninguna de las dos, se descarta.
4. Un `.0` final se saca (`42.20.0` → `42.20`), porque `game_version()` dice `"42.21"` y no `"42.21.0"`.

**`news_stubs`:**
- Agrupa por `parent(version)` las versiones ≥ `FIRST`, y arma un borrador por grupo que no esté en `have`. El borrador lleva:
  - `slug`, `version` (la del padre);
  - `date`, que es la del anuncio estable más viejo del padre; si no hay estable, la del unstable, y entonces `branch` es `"unstable"`;
  - `unstableDate`;
  - `sources`: steam con su `gid` y, si `notes_url` la encuentra, `notes`;
  - un hotfix por cada versión de tres números (`42.20.1`…), con su fecha y su fuente;
  - `title`, `summary` y los `summary` de los hotfixes con `{"en": "", "es": ""}`, y `highlights: []`.
- Las fechas salen de `date` (epoch) en UTC.

**`check`:** recorre `chronicle/*.json` (los `.todo.json` van a pendientes) y anota un problema por cada falla:
- `slug != slug(version)`;
- `date`, `unstableDate`, `updated` o la fecha de un hotfix que no es `YYYY-MM-DD`;
- `branch` que no es `stable` ni `unstable`;
- un `title`, `summary`, `highlights[i]` o `hotfixes[i].summary` con un idioma vacío;
- sin `sources`, o con una URL que no es `https://` o cuyo host no está en `ALLOWED_HOSTS`;
- un hotfix cuya `version` no empieza con `version + "."`;
- `copied_runs` no vacío entre el inglés nuestro (título + resumen + highlights + hotfixes) y el texto en caché de cada fuente con `gid` (`data/patches/.cache/<gid>.txt`, si existe).

```python
def words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def copied_runs(ours, theirs, n=8):
    """Las tiras de n palabras seguidas que nuestro texto comparte con la fuente: tiene que dar []."""
    w = words(theirs)
    grams = {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}
    o, out = words(ours), []
    for i in range(len(o) - n + 1):
        g = " ".join(o[i:i + n])
        if tuple(o[i:i + n]) in grams and g not in out:
            out.append(g)
    return out
```

**CLI:**
- **`news [--offline]`:**
  1. Baja `FEED` con `UA` y guarda en `data/patches/.cache/` (ya está en `.gitignore` por la regla `.cache/`) `news.json` y un `<gid>.txt` por anuncio con su `contents`.
  2. Escribe `chronicle/<slug>.todo.json` para cada padre sin entrada. Para las entradas que ya existen, imprime los hotfixes y las fuentes que les faltan.
  - Con `--offline` usa la caché.
  - Hace una sola petición, sin reintentos agresivos: un 429 o un 5xx corta con un mensaje.
- **`check`:** imprime problemas y pendientes, y sale con código 1 si hay problemas.

- [ ] **Step 1: Tests que fallan** (en `test_patches.py`, sin red).
  - **`title_versions`, con los títulos reales de la tabla de arriba:**
    - `"Build 42.21 Stable Released"` → `[("42.21", "stable")]`;
    - `"Re-population of the Dead: Build 42.21 Unstable Released"` → `[("42.21", "unstable")]`;
    - `"42.20.4 STABLE & 42.19.2 UNSTABLE & 41.78.21 LEGACY Hotfixes Released"` → `[("42.20.4", "stable"), ("42.19.2", "unstable")]`;
    - `"Stable(41.78.19) + UNSTABLE(42.16.3) Hotfixes Released"` → `[("42.16.3", "unstable")]`;
    - `"Build 42.20.0 Stable Released"` → `[("42.20", "stable")]`;
    - `"42.14.1 BETA HOTFIX Released"` → `[("42.14.1", "unstable")]`;
    - `"SPRING IS HERE"` → `[]` y `"Unstable 42 MP Released"` → `[]`.
  - **`parent` y `notes_url`:** `parent("42.20.4") == "42.20"`, `parent("42.21") == "42.21"`; `notes_url("… [url=https://theindiestone.com/forums/topic/101693-4221-unstable-released/]here[/url]")` == `"https://theindiestone.com/forums/topic/101693-4221-unstable-released/"`.
  - **`news_stubs`** con estos anuncios sintéticos: 42.21 estable (date 1790597228), 42.21 unstable (1790179696), 42.20.0 estable, 42.20.1 estable, 42.19.0 unstable y un blog.
    - Da exactamente `{"42-21", "42-20"}`.
    - `42-21` tiene `date == "2026-09-28"`, `branch == "stable"`, `unstableDate == "2026-09-23"`, dos fuentes `steam` y `summary == {"en": "", "es": ""}`.
    - `42-20` tiene un hotfix `42.20.1`.
    - Con `have={"42-21"}`, sólo `42-20`.
  - **`copied_runs`:**
    - `copied_runs("we fixed the zombie duplication bug in multiplayer games today", "TIS: we fixed the zombie duplication bug in multiplayer games and more")` → `["we fixed the zombie duplication bug in multiplayer", "fixed the zombie duplication bug in multiplayer games"]`;
    - un texto propio → `[]`.
  - **`check`** sobre un `tempfile` con:
    - una entrada válida → `([], [])`;
    - la misma con `summary.es` vacío → un problema que nombra `summary.es`;
    - con una fuente `http://example.com` → un problema;
    - con un `x.todo.json` al lado → pendientes `["x.todo.json"]`;
    - con `.cache/<gid>.txt` que contiene 8 palabras seguidas del resumen → un problema "copiado".
  - **Con los datos reales** (`skipUnless` existe `chronicle/`): `check()` da `[]` problemas.
- [ ] **Step 2:** `python games/zomboid/tools/test_patches.py -v` → FAIL.
- [ ] **Step 3:** Implementar `news`, `check` y los ayudantes. → PASS (menos el de datos reales, que se saltea mientras no exista `chronicle/`).
- [ ] **Step 4: Bajar las fuentes.** `python games/zomboid/tools/patches.py news` escribe `chronicle/42-20.todo.json` y `chronicle/42-21.todo.json`, con 4 hotfixes (`42.20.1`–`42.20.4`) en la 42.20, y la caché.
- [ ] **Step 5: Escribir las dos entradas.**
  - Para cada borrador, leer los `.cache/<gid>.txt` de sus fuentes y escribir `chronicle/<slug>.json` con:
    - **título:** el tema de la versión, en una frase corta nuestra, no el título del anuncio. Ejemplos de forma: "Build 42 llega a estable", "Menos zombis duplicados y árboles que molestan menos";
    - **resumen:** 2 a 4 oraciones con lo que cambia para quien juega;
    - **highlights:** de 3 a 6, uno por tema;
    - **hotfixes:** una oración cada uno;
    - `updated` con la fecha de hoy.
  - Después, borrar el `.todo.json`.
  - **Reglas:**
    - nada de frases del anuncio, ni traducidas palabra por palabra;
    - sólo lo que dice la fuente, sin opinión inventada sobre cosas que no leímos;
    - cifras y nombres del juego tal cual (en español, los de `index.json`);
    - voseo cuando se le habla a quien lee ("si jugás en un servidor…").
  - `python games/zomboid/tools/patches.py check` → sin problemas ni pendientes.
- [ ] **Step 6:** `python games/zomboid/tools/test_patches.py -v` → PASS entero.
- [ ] **Step 7: README**, "En cada parche":
  1. `python games/zomboid/tools/patches.py news`;
  2. escribir el resumen en/es a partir del `.todo.json` (reglas de arriba) y borrarlo;
  3. `python games/zomboid/tools/patches.py check`;
  4. `python games/zomboid/tools/site.py`.

  También: "Sin resumen, la página de la versión sale igual, con el diff y una línea automática".
- [ ] **Step 8: Commit**
  ```bash
  git add games/zomboid/data/patches/chronicle/42-20.json games/zomboid/data/patches/chronicle/42-21.json
  git commit -m "feat(zomboid): la Crónica de parches — borradores desde Steam, control de copia y la 42.20 y la 42.21 resumidas" -- games/zomboid/tools/patches.py games/zomboid/tools/test_patches.py games/zomboid/README.md games/zomboid/data/patches/chronicle/42-20.json games/zomboid/data/patches/chronicle/42-21.json
  ```

---

### Task 3: Los datos del sitio — páginas de versión y `changes` en cada ficha (`site.py`)

**Files:**
- Modify: `games/zomboid/tools/site.py`:
  - `Site.patches()` arma las páginas;
  - `attach_changes(files, changes)` mete el campo en cada ficha;
  - `main()` imprime el resumen;
  - las funciones puras `patch_pages`, `ficha_changes` y `value_names`, a nivel de módulo.
- Create: `games/zomboid/tools/test_site_patches.py`
- Modify: `site/test/zomboidSiteData.test.ts`: tamaños y forma de `data/site/patches/`
- Create (generado): `games/zomboid/data/site/patches/index.json`, `games/zomboid/data/site/patches/42-21.json`, `games/zomboid/data/site/patches/42-20.json`

**Interfaces:**
- Consumes:
  - `patches.read_snapshot`, `patches.snapshots_index`, `patches.slug` y `patches.PATCHES` (Task 1). `site.py` carga `patches.py` por su ruta, con `importlib`, como `extract.py` carga `site.py`;
  - `chronicle/*.json` (Task 2);
  - `diffs/*.json`;
  - `self.entry[(sec, gid)]` (ya existe: id del juego → entrada del índice con su slug).
- Produces:
  ```python
  KIND_SEC = {"items": "items", "recipes": "recipes", "traits": "traits", "professions": "professions",
              "skills": "skills", "moodles": "moodles", "sandbox": None}
  CHANGES_N = 5   # las últimas 5 comparaciones van a "Qué cambió" de cada ficha
  def patch_pages(chronicle: list[dict], snaps: list[dict], diffs: dict[str, dict], first_counts: dict[str, dict],
                  resolve, lookup) -> dict[str, dict]     # {"patches/index.json": …, "patches/<slug>.json": …}
  def ficha_changes(diffs_newest_first: list[tuple[dict, dict]], resolve, lookup, n: int = CHANGES_N) -> dict[tuple[str, str], list]
  def value_names(fields: list[dict], lookup) -> dict[str, dict]
  ```
  - `resolve(kind, gid) -> slug | None` es la ficha actual de ese id;
  - `lookup(token) -> {en, es} | None` busca el token en objetos, recetas, rasgos y profesiones.
- **`data/site/patches/index.json`** (va en el chunk de la pestaña; entradas de la más nueva a la más vieja, por `date` y después por versión):
  ```ts
  interface PatchMeta {
    slug: string; version: string; date: string; updated?: string;
    branch?: "stable" | "unstable"; unstableDate?: string;
    title?: Loc; summary?: Loc;          // de la Crónica; sin Crónica, no están
    hotfixOf?: string;                   // slug del padre, si la foto es de un hotfix (42.21.1)
    hotfixes: number;
    recorded: boolean;                   // hay foto de esta versión
    counts?: Partial<Record<Kind, { added: number; removed: number; changed: number }>>;  // si hay diff
    first?: Partial<Record<Kind, number>>;  // la primera foto: cuántos hay de cada tipo
  }
  interface PatchIndex { current: string; patches: PatchMeta[] }   // current = la versión de meta.json
  ```
- **`data/site/patches/<slug>.json`:**
  ```ts
  interface Ent { id: string; n: Loc; slug?: string }               // slug: la ficha de hoy, si existe
  interface FieldChange { f: string; b?: Raw; a?: Raw; add?: string[]; rem?: string[] }
  type Raw = number | string | boolean | null;
  interface PatchPage extends PatchMeta {
    highlights: Loc[]; sources: { kind: string; url: string }[];
    hotfixList: { version: string; date: string; summary: Loc; sources: { kind: string; url: string }[]; slug?: string }[];
    diff?: { from: string; fromSlug: string;
             kinds: Partial<Record<Kind, { added: Ent[]; removed: Ent[]; changed: (Ent & { fields: FieldChange[] })[] }>> };
    names: Record<string, Loc>;            // tokens de los valores (Base.Plank, MakeShiv, weak) → nombre
  }
  type Kind = "items" | "recipes" | "traits" | "professions" | "skills" | "moodles" | "sandbox";
  ```
- **`changes` en cada ficha** (el campo sólo existe si hay algo):
  - dónde: `items/NN.json` y `recipes/NN.json` (por slug); `traits.json`, `professions.json`, `skills.json` y `moodles.json` (por `id`);
  - qué lleva:
  ```ts
  interface FichaChange {
    patch: string; version: string; date: string;
    kind: "added" | "changed";
    gameId?: string;                      // sólo en objetos con más de una variante
    fields?: FieldChange[]; names?: Record<string, Loc>;
  }
  ```
  - De la comparación más nueva a la más vieja, a lo sumo `CHANGES_N` comparaciones. Un id quitado no tiene ficha y no se anota.

**Cómo se arma:**
- **Las páginas** son la unión de los slugs de la Crónica y de las fotos (`slug(id)`).
  - De la Crónica: `version`, `date`, `branch`, `unstableDate`, `title`, `summary`, `highlights`, `sources`, `hotfixes` (→ `hotfixList`) y `updated`.
  - De la foto: `recorded`; `diff`, si existe `diffs/<slug>.json`; `first`, si es la primera foto (las cantidades de su `kinds`).
  - Sin Crónica: `version` y `date` salen de la foto (`version`, más ` (build N)` si el id lleva `-b`, y `recordedAt`).
  - **Hotfix:** una foto cuya versión tiene tres números (`42.21.1`) toma su `date`, `summary` y `sources` del hotfix de su padre en la Crónica, si está, y lleva `hotfixOf`. En la página del padre, ese hotfix lleva `slug` para enlazarla.
- **`names`:**
  - qué junta: cada token de los valores de los cambios (`b`, `a`, `add`, `rem`), que son los strings enteros o los pedazos de un renglón de receta (lo que queda tras sacar `^\d+(\.\d+)?× `, el ` keep` y partir por `|`);
  - cómo lo resuelve: con `lookup`, usando los nombres de hoy (`self.full`, `self.recipes`, `self.traits`, `self.professions`);
  - lo que no se encuentra queda afuera, y la página lo muestra crudo.

- [ ] **Step 1: Tests que fallan** (`test_site_patches.py`, `unittest`, sin el juego: todo sintético).
  - **Sólo Crónica + la primera foto (el caso de hoy):**
    - Datos: Crónica `42-20` (sin foto) y `42-21`, y foto `42.21` sin diff, con `first_counts={"42.21": {"items": 2, "recipes": 1}}`.
    - El índice tiene `["42-21", "42-20"]` en ese orden.
    - `42-21` lleva `recorded: true`, `first == {"items": 2, "recipes": 1}` y no lleva `diff`.
    - `42-20` lleva `recorded: false`, y su página tiene `summary`, `highlights` y `sources` de la Crónica.
  - **Un diff sin Crónica:**
    - Datos: el `diff` de la Task 1 (42.21 → 42.22) como `diffs["42-22"]`, con `resolve = {("items","Base.Axe"): "axe", ("items","Base.Fork"): "fork", ("recipes","MakeStake"): "make-stake", ("traits","strong"): "strong"}.get` (y `None` para lo demás).
    - La página `42-22` tiene:
      - `version == "42.22"` y `date` = el `recordedAt` de la foto;
      - `diff.from == "42.21"` y `diff.fromSlug == "42-21"`;
      - `diff.kinds.items.added == [{"id": "Base.Fork", "n": {"en": "Fork", "es": "Tenedor"}, "slug": "fork"}]`;
      - `removed[0]` sin `slug`;
      - `changed[0]`, con `slug == "axe"` y los dos `fields`.
  - **`ficha_changes`:**
    - Datos: dos diffs, 42.23 y 42.22 (en ese orden), que tocan `Base.Axe`.
    - `("items","axe")` tiene 2 entradas, primero la `42-23`; con `n=1`, sólo la `42-23`.
    - `("items","fork")` tiene `kind == "added"`.
    - Para `Base.Spoon` (quitado) no hay entrada.
  - **`value_names`:** con `lookup` sintético (`Base.Plank` → Tablón, `Base.TreeBranch2` → Rama, `weak` → Débil), el cambio de `inputs` y el de `exclusive` de la Task 1 dan exactamente esos tres nombres.
  - **El hotfix:**
    - Datos: foto `42.21.1` y Crónica `42-21` con un hotfix `42.21.1`.
    - La página `42-21-1` tiene `hotfixOf == "42-21"` y el `summary` del hotfix.
    - En `42-21`, `hotfixList[0].slug == "42-21-1"`.
- [ ] **Step 2:** `python games/zomboid/tools/test_site_patches.py -v` → FAIL.
- [ ] **Step 3:** Implementar en `site.py`.
  - `Site.patches()` lee `chronicle/*.json` (sin `.todo.json`), `snapshots_index`, `diffs/*.json` y las primeras fotos (para `first`), y devuelve los archivos de `patch_pages`.
  - `Site.build()` los suma a `files` y después llama a `attach_changes(files, ficha_changes(…))`: `write()` ya escribe sólo lo que cambió y borra lo que sobra.
  - En `main()`, una línea más: `parches: N páginas (M con diff), K fichas con "qué cambió"`.
- [ ] **Step 4:** `python games/zomboid/tools/test_site_patches.py -v` → PASS. `python games/zomboid/tools/site.py` escribe `data/site/patches/{index,42-21,42-20}.json`. Las fichas no cambian, porque todavía no hay diffs: `git status games/zomboid/data/site` muestra sólo `patches/`.
- [ ] **Step 5: Test del sitio que falla y pasa** (en `site/test/zomboidSiteData.test.ts`, con los datos reales):
  - `index.json` tiene `current === meta.version` y las entradas ordenadas por fecha, de la más nueva a la más vieja;
  - cada `patches[i].slug` tiene su `<slug>.json`;
  - cada página pesa < 300 KB con gzip;
  - hoy ninguna ficha lleva `changes`.

  `cd site && npx vitest run test/zomboidSiteData.test.ts` → PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add games/zomboid/tools/test_site_patches.py games/zomboid/data/site/patches/index.json games/zomboid/data/site/patches/42-21.json games/zomboid/data/site/patches/42-20.json
  git commit -m "feat(zomboid): site.py arma una página por versión (Crónica + diff) y anota qué cambió en cada ficha" -- games/zomboid/tools/site.py games/zomboid/tools/test_site_patches.py site/test/zomboidSiteData.test.ts games/zomboid/data/site/patches/index.json games/zomboid/data/site/patches/42-21.json games/zomboid/data/site/patches/42-20.json
  ```

---

### Task 4: La pestaña Parches (lista + página por versión), conectada

**Files:**
- Create: `site/src/zomboid/patches/{slug.ts, data.ts, fields.ts, copy.ts, ZomboidPatches.tsx, PatchDiff.tsx}`, `site/src/styles/zomboid-patches.css`
- Create: `site/test/zomboidPatchesFields.test.ts`, `site/test/zomboidPatches.test.ts`
- Modify (al conectar):
  - `site/src/route.ts`: `PZ_PUBLISHED` suma `"patches"`, con su párrafo en el comentario;
  - `site/src/Zomboid.tsx`: `TABS.patches` y `TAB_DATA.patches`;
  - `site/src/areaFiles.ts`: `PZ_TAB_FILES.patches`;
  - `site/src/sitemap.ts`: `ZomboidSitemapData.patches`, los caminos y el `lastmod`;
  - `site/vite.config.ts`: `readSitemapData` lee `site/patches/index.json`;
  - `site/src/prerender.ts`: `detailNames` suma `zb-patches/<slug>`;
  - `site/src/PageMeta.tsx`: `dlDetailName` para las páginas de versión;
  - `site/src/zomboidCopy.ts`: `seo.patches` en español y `seo.detail.patches` en/es, más `home.patchesLink`;
  - `site/src/zomboid/ZomboidHome.tsx`: el enlace a Parches;
  - `site/test/zomboidPublish.test.ts` y `site/test/zomboidSeo.test.ts`.

**Interfaces:**
- Consumes: `data/site/patches/*` (Task 3), `@zomboid/skills.json` (nombres de habilidades, 1,7 KB, ya lo usa `items/stats.ts`), `numbers(locale)` de `items/stats.ts`, `wordFit`, `Stamp` y `Collapse` de `zomboid/ui.tsx`, `once` de `zomboid/store.ts`.
- **`slug.ts`** (sin dependencias; lo importa `PageMeta.tsx`, así que no puede arrastrar datos):
  ```ts
  /** "42-21" → "42.21", "42-21-1" → "42.21.1", "42-22-b3" → "42.22 (build 3)"; null si no es un slug de versión. */
  export function pzPatchVersion(slug: string): string | null {
    const m = /^(\d+)-(\d+)(?:-(\d+))?(?:-b(\d+))?$/.exec(slug);
    if (!m) return null;
    return `${m[1]}.${m[2]}${m[3] ? `.${m[3]}` : ""}${m[4] ? ` (build ${m[4]})` : ""}`;
  }
  ```
- **`data.ts`:**
  - los tipos `PatchMeta`, `PatchIndex`, `PatchPage`, `Ent`, `FieldChange`, `Raw`, `Kind` y `FichaChange` (los de la Task 3);
  - `export const KINDS: Kind[] = ["items", "recipes", "traits", "professions", "skills", "moodles", "sandbox"]`;
  - `export const KIND_SEC: Record<Kind, PzTab | null>`: `sandbox` → `"server"`, que sólo enlaza si `"server"` está en `PZ_PUBLISHED`;
  - `export const PATCH_INDEX: PatchIndex` (import directo de `@zomboid/site/patches/index.json`);
  - las páginas con `import.meta.glob<{ default: PatchPage }>(["@zomboid/site/patches/*.json", "!@zomboid/site/patches/index.json"])` (perezoso, un chunk por página, como `poe2PatchesData.ts`);
  - `peekPatch(slug): PatchPage | null | undefined` y `loadPatch(slug): Promise<PatchPage | null>`;
  - `preloadPatchesRoute(route): Promise<void>`, que baja la página si `route.detail` existe;
  - `primePatch(slug, page)`, que pone una página en la caché. Lo usan sólo los tests con datos inventados, y lo dice su comentario.
- **`fields.ts`** (puro):
  ```ts
  export function fieldLabel(kind: Kind, f: string, lang: Lang): string | null;  // null → la página muestra la clave cruda
  export function formatValue(v: Raw, names: Record<string, Loc>, lang: Lang, locale: string): string;
  export function recipeLine(line: string, names: Record<string, Loc>, lang: Lang): string;
  export function direction(b: Raw | undefined, a: Raw | undefined): "up" | "down" | null;  // sólo números
  export function autoLede(counts: NonNullable<PatchMeta["counts"]>, lang: Lang, locale: string): string;
  export function rawKey(f: string): string[];  // "stats.maxDamage" → ["stats.", "maxDamage"]: se dibujan con <wbr> entre medio
  ```
  - **`fieldLabel`** (TEXTO NUESTRO, en `copy.ts`, tabla `FIELD_LABELS` en/es):
    - generales: `name` (Nombre / Name), `type`, `cat` (Categoría), `weight` (Peso), `tags` (Etiquetas), `teaches` (Enseña), `research` (Se investiga), `opens`, `cost` (Costo / Cost), `desc` (Descripción), `recipes` (Recetas), `exclusive` (Excluyentes), `grantedTraits` (Rasgos que da), `traits` (Rasgos), `time` (Tiempo), `category`, `kind`, `inputs` (Ingredientes y herramientas), `outputs` (Resultado), `stations` (Estación);
    - de sandbox: `default` (Valor por defecto), `min`, `max`, `n` (Cantidad de opciones);
    - de `stats.`: `minDamage`, `maxDamage`, `minRange`, `maxRange`, `baseSpeed`, `criticalChance`, `critDmgMultiplier`, `conditionMax`, `conditionLowerChanceOneIn`, `hungerChange`, `thirstChange`, `calories`, `daysFresh`, `daysTotallyRotten`, `minutesToCook`, `capacity`, `weightReduction`, `biteDefense`, `scratchDefense`, `bulletDefense`, `insulation`, `windResistance`, `waterResistance`, `maxAmmo`, `aimingTime`, `reloadTime`, `recoilDelay`, `soundRadius`, `twoHanded`.
    - Con patrón, usando el nombre de la habilidad de `skills.json` (`Woodwork` → Carpentry / Carpintería):
      - `xpBoosts.<perk>` → "Bonificación de <habilidad>" / "<Skill> boost";
      - `skills.<perk>` → "Nivel de <habilidad>" / "<Skill> level";
      - `xp.<perk>` → "XP de <habilidad>" / "<Skill> XP";
      - `xp.<i>` en `skills` → "XP para el nivel <i+1>" / "XP for level <i+1>";
      - `levels.<n>.name` / `.desc` → "Nombre del nivel <n>" / "Texto del nivel <n>";
      - `learn.autoLearnAll.<perk>` → "Se aprende sola con <habilidad> en".
  - **`formatValue`:**
    - números con `numbers(locale).num`;
    - booleanos "sí"/"no" ("yes"/"no");
    - `null` → "—";
    - un string que está en `names` → su nombre;
    - otro string, tal cual.
  - **`recipeLine`:**
    1. Parte el renglón con `/^(\d+(?:\.\d+)?)× (.+?)( keep)?$/`.
    2. Cada alternativa (`|`) va a su nombre, unidas con " o " / " or ".
    3. `tag:x` → "cualquiera con la etiqueta x" / "any tagged x".
    4. ` keep` → " (se conserva)" / " (kept)".
  - **`autoLede`** (para una versión con diff y sin Crónica): "12 objetos nuevos, 3 quitados y 40 cambiados; 2 recetas cambiadas." / "12 new items, 3 removed and 40 changed; 2 recipes changed." Sólo nombra lo que es distinto de 0.
- **`copy.ts`:** `usePatchesCopy()`, en/es con voseo. Lleva:
  - el título "Notas del parche" / "Patch notes";
  - la intro con cifras: "Cada versión de Project Zomboid desde la 42.20, contada con nuestras palabras, y desde la {primera foto} la lista exacta de lo que cambió en objetos, recetas, rasgos, habilidades, moodles y opciones de servidor. Vamos por la {current}.";
  - los nombres de los grupos (Objetos, Recetas, Rasgos, Profesiones, Habilidades, Moodles, Opciones de sandbox);
  - "Nuevos (N)", "Quitados (N)", "Cambiados (N)", "Estable" / "Unstable", "Hotfixes", "Fuentes", "Notas completas de The Indie Stone", "Anuncio en Steam";
  - `first(counts)`: "Es la primera versión que guardamos completa: 4.878 objetos, 1.170 recetas… Desde la próxima, acá aparece qué cambió en cada uno.";
  - `before`: "Este parche es anterior a la 42.21: desde esa versión comparamos una contra otra.";
  - `hotfixOf(v)`: "Hotfix de la {v}";
  - "sube" / "baja";
  - `FIELD_LABELS`;
  - `notFound`.
- **UI:**
  - **Lista** (`/parches`):
    - una hoja con el `h1` (`wordFit`), la intro y una nota a mano ("los resúmenes son nuestros; las notas oficiales están enlazadas en cada versión");
    - una hoja por versión, con versión grande, fecha (`es-AR` / `en-US`, como `D2rPatches`), rama, título, resumen o `autoLede`, y chips de texto con las cantidades (sin bordes de color);
    - cada hoja es un `RouteLink` a su página.
  - **Página** (`/parches/42-21`):
    - cabecera con versión (h1 `wordFit`), fecha, rama y "llegó a Unstable el …";
    - el resumen y los highlights;
    - los hotfixes (enlazados si tienen página);
    - las fuentes, como enlaces externos (`rel="noopener"`);
    - después, "Qué cambió":
      - con diff, `PatchDiff` (comparado con la `from`, enlazada);
      - con `first`, el texto `first`;
      - sin foto, `before`;
    - abajo, "volver a todas las versiones".
  - **`PatchDiff`:**
    - una hoja por tipo, en el orden de `KINDS`, con los tres sub-bloques; los largos van con `Collapse`, que deja todo en el HTML;
    - cada entidad con ficha es un `RouteLink` a `{ view: "zomboid", pzSection: KIND_SEC[kind], detail: ent.slug }`; sin ficha, texto;
    - cada cambio de campo es un renglón de grilla:
      - la etiqueta, o la clave cruda en `<code>` con `<wbr>` tras cada punto;
      - después, `b` → `a`: con `formatValue`, o con `recipeLine` si el campo es `inputs` u `outputs`, y con "+ x" / "− y" para `add`/`rem`;
      - si `direction` da algo, la palabra "sube"/"baja" con un tinte de fondo suave (clase `pzp-up`/`pzp-down`), nunca un borde.
    - Exporta `FieldRows` para la Task 5.
  - **Celular:** la grilla `minmax(0,1fr) auto` pasa a una columna debajo de 560 px; nada pasa de 100 vw.
- **SEO** (`zomboidCopy.ts`):
  - `seo.patches.title` ES pasa a "Notas del parche de Project Zomboid (Build 42) | Vestigo" (55);
  - el EN queda "Project Zomboid Patch Notes Explained (Build 42) | Vestigo" (57);
  - `seo.detail.patches(v)`:
    - EN: título `Project Zomboid ${v} Patch Notes: What Changed | Vestigo`; descripción `Project Zomboid ${v} explained in our own words, plus the exact list of items, recipes, traits and sandbox options that changed, with before and after values.`;
    - ES: título `Notas del parche ${v} de Project Zomboid: qué cambió | Vestigo`; descripción `La versión ${v} de Project Zomboid explicada con nuestras palabras, y la lista exacta de objetos, recetas, rasgos y opciones de sandbox que cambiaron, con el antes y el después.`

- [ ] **Step 1: Tests puros que fallan** (`zomboidPatchesFields.test.ts`):
  - `pzPatchVersion`:
    - `"42-21"` → `"42.21"`;
    - `"42-21-1"` → `"42.21.1"`;
    - `"42-22-b3"` → `"42.22 (build 3)"`;
    - `"palanca"` → `null`.
  - `fieldLabel`:
    - `("items", "stats.maxDamage", "es")` → `"Daño máximo"`;
    - `("recipes", "skills.Woodwork", "es")` → `"Nivel de Carpintería"`;
    - `("recipes", "xp.Woodwork", "en")` → `"Carpentry XP"`;
    - `("traits", "xpBoosts.Strength", "es")` → `"Bonificación de Fuerza"`;
    - `("skills", "xp.3", "es")` → `"XP para el nivel 4"`;
    - `("moodles", "levels.1.name", "es")` → `"Nombre del nivel 1"`;
    - `("sandbox", "default", "es")` → `"Valor por defecto"`;
    - `("items", "stats.fooBar", "en")` → `null`.
  - `formatValue`:
    - `(2.2, {}, "es", "es-AR")` → `"2,2"`;
    - `(true, {}, "es", "es-AR")` → `"sí"`;
    - `(null, …)` → `"—"`;
    - `("Base.Plank", { "Base.Plank": { en: "Plank", es: "Tablón" } }, "es", …)` → `"Tablón"`.
  - `recipeLine`:
    - `("2× Base.Nails|Base.Screws keep", { "Base.Nails": {en:"Nails",es:"Clavos"}, "Base.Screws": {en:"Screws",es:"Tornillos"} }, "es")` → `"2× Clavos o Tornillos (se conserva)"`;
    - `("1× tag:base:sharpknife keep", {}, "en")` → `"1× any tagged base:sharpknife (kept)"`.
  - `direction`:
    - `(2, 2.2)` → `"up"`;
    - `(10, 8)` → `"down"`;
    - `("a", "b")` → `null`.
  - `autoLede({ items: { added: 12, removed: 3, changed: 40 }, recipes: { added: 0, removed: 0, changed: 2 } }, "es", "es-AR")` → `"12 objetos nuevos, 3 quitados y 40 cambiados; 2 recetas cambiadas."`
  - `rawKey("stats.conditionLowerChanceOneIn")` → `["stats.", "conditionLowerChanceOneIn"]`.
- [ ] **Step 2:** `cd site && npx vitest run test/zomboidPatchesFields.test.ts` → FAIL. Implementar `slug.ts`, `fields.ts`, `copy.ts` (las tablas) y `data.ts`. → PASS.
- [ ] **Step 3: Tests de la página que fallan** (`zomboidPatches.test.ts`). Llevan `beforeAll` con `registerPzSlugs(buildEsSlugs(INDEX, []))`, como `zomboidPublish.test.ts`. Para rendear, mientras no se conecte, el test agrega `"patches"` a `PZ_PUBLISHED` y lo saca en `afterAll`; en el Step 6 eso se borra.
  - **`renderApp(parseRoute("/es/project-zomboid/parches"))`:**
    - contiene "Notas del parche", "42.21" y "42.20", y `href="/es/project-zomboid/parches/42-21"`;
    - el resumen en español de `chronicle/42-21.json` (un tramo de 40 letras sin comillas ni `&`, leído del archivo en el test: el HTML las escapa);
    - no contiene `pz-loading`.
  - **`/es/project-zomboid/parches/42-21`** (después de `await preloadTab(route)`):
    - el resumen y un highlight en español;
    - un enlace a `theindiestone.com` o `store.steampowered.com`;
    - el texto `first`, con "4.878";
    - sin `pz-loading`.
  - **`/en/project-zomboid/patches/42-20`:** el resumen en inglés y el texto `before`.
  - **Con datos inventados:** `primePatch("42-22", page)`, con la página sintética de la Task 3 (Fork agregado, Spoon quitado, Axe 2 → 2,2, MakeStake, `strong`, `WaterShutModifier`) y `names` de Tablón/Rama/Débil, y `renderApp(parseRoute("/es/project-zomboid/parches/42-22"))` contiene:
    - "Objetos", "Nuevos (1)", "Quitados (1)" y "Cambiados (1)";
    - "Tenedor", dentro de un `<a href="/es/project-zomboid/objetos/`;
    - "Cuchara", sin enlace;
    - "Daño máximo", `>2,2<` y "sube";
    - "Ingredientes y herramientas", "1× Rama" y "Tablón o Rama";
    - "Opciones de sandbox", `WaterShutModifier` y "Valor por defecto".
  - **`zomboid-patches.css`**, leído como texto: no contiene `border-left`, `border-color` ni `overflow-wrap: anywhere`.
- [ ] **Step 4:** Implementar `ZomboidPatches.tsx` (despacha: sin `detail` → lista; `detail` con página → página; `detail` desconocido → lista con `notFound`), `PatchDiff.tsx` y el CSS (importa `zomboid-items.css` para las hojas y el h1, como Moodles). → PASS. Mirarlo en `http://localhost:5178/es/project-zomboid/parches` y en `/parches/42-21`, en escritorio y en celular, en el panel Browser de la app (nunca redimensionar el Chrome de ZoTaD). El diff con datos de verdad recién existe con la 42.22: hasta entonces lo cubre el test SSR con la página inventada.
- [ ] **Step 5: Commit** de la pestaña.
  ```bash
  git add site/src/zomboid/patches/slug.ts site/src/zomboid/patches/data.ts site/src/zomboid/patches/fields.ts site/src/zomboid/patches/copy.ts site/src/zomboid/patches/ZomboidPatches.tsx site/src/zomboid/patches/PatchDiff.tsx site/src/styles/zomboid-patches.css site/test/zomboidPatchesFields.test.ts site/test/zomboidPatches.test.ts
  git commit -m "feat(zomboid): la pestaña Parches — la Crónica y el diff de cada versión, campo por campo" -- site/src/zomboid/patches/slug.ts site/src/zomboid/patches/data.ts site/src/zomboid/patches/fields.ts site/src/zomboid/patches/copy.ts site/src/zomboid/patches/ZomboidPatches.tsx site/src/zomboid/patches/PatchDiff.tsx site/src/styles/zomboid-patches.css site/test/zomboidPatchesFields.test.ts site/test/zomboidPatches.test.ts
  ```
- [ ] **Step 6: Conectar** (commit aparte):
  - **`route.ts`:** `PZ_PUBLISHED` suma `"patches"`; un párrafo en su comentario ("Parches (2026-10-01): la lista y una página por versión; los slugs son iguales en los dos idiomas").
  - **`Zomboid.tsx`:**
    - `const PzPatches = lazyWithPreload(() => import("./zomboid/patches/ZomboidPatches"))`;
    - `TABS.patches = PzPatches`;
    - `TAB_DATA.patches = (route) => Promise.all([PzPatches.preload(), import("./zomboid/patches/data")]).then(([, m]) => m.preloadPatchesRoute(parseRoute(routePath(route))))`.
  - **`areaFiles.ts`:** `PZ_TAB_FILES.patches = "src/zomboid/patches/ZomboidPatches.tsx"`.
  - **`sitemap.ts`:**
    - `ZomboidSitemapData.patches?: { slug: string; version: string; date: string; updated?: string }[]`;
    - en `sitemapPaths`, si `PZ_PUBLISHED.includes("patches")`, una página por `data.zb.patches`;
    - en `sitemapLastmod`, la rama de Zomboid: si `parseRoute(path).pzSection === "patches"`, con `detail` → `updated ?? date` de esa versión; sin `detail` → la más nueva (`newest`), igual que `d2r`.
  - **`vite.config.ts`** (`readSitemapData`): `zb.patches` = `JSON.parse(readFileSync(\`${zomboidDir}/site/patches/index.json\`)).patches.map(({ slug, version, date, updated }) => ({ slug, version, date, updated }))`, dentro de un `try` (sin el archivo, `undefined`).
  - **`prerender.ts`** (`detailNames`): `for (const p of data.zb?.patches ?? []) out[\`zb-patches/${p.slug}\`] = p.version`.
  - **`PageMeta.tsx`** (`dlDetailName`): `if (route.view === "zomboid" && route.pzSection === "patches" && route.detail) return pzPatchVersion(route.detail);`. Se importa de `zomboid/patches/slug.ts`, que no trae datos. Hay que actualizar el comentario de `pzNameKey`.
  - **`ZomboidHome.tsx`:** en la hoja "about", un renglón `home.patchesLink(meta.version)` ("Datos de la 42.21 · Qué cambió en cada parche" / "Data from 42.21 · What changed in each patch") con un `RouteLink` a la pestaña.
  - **`zomboidPublish.test.ts`**, el bloque "Parches publicada":
    - está en `PZ_PUBLISHED`;
    - el sitemap tiene `/es/project-zomboid/parches`, `/en/project-zomboid/patches/42-20` y `/es/project-zomboid/parches/42-21`;
    - `sitemapLastmod("/es/project-zomboid/parches/42-21", data)` es el `updated ?? date` de la Crónica;
    - `filesFor(parseRoute("/es/project-zomboid/parches/42-21"))` es `["src/Zomboid.tsx", "src/zomboid/patches/ZomboidPatches.tsx"]`;
    - el prerender de la página no tiene `pz-loading`;
    - la solapa "Parches" es un enlace con `aria-current="page"`;
    - la portada enlaza `/es/project-zomboid/parches`.
  - **`zomboidSeo.test.ts`:**
    - `seo.detail.patches("42.21.1")` mide ≤ 65 en los dos idiomas, termina en `| Vestigo`, empieza por "Project Zomboid 42.21.1" (en) o "Notas del parche 42.21.1" (es), y la descripción mide > 80;
    - `prerenderPages` da para `/es/project-zomboid/parches/42-21` el título "Notas del parche 42.21 de Project Zomboid: qué cambió | Vestigo" y la miga `["Vestigo", "Project Zomboid", "Parches", "42.21"]`.
  - Sacar del `zomboidPatches.test.ts` el agregado temporal a `PZ_PUBLISHED`.

  `npx vitest run test/zomboid*.test.ts` → PASS. `npm run build` en `site/`: sin `pz-loading` en ninguna página de Zomboid, y el sitemap de Zomboid con las dos versiones.

  ```bash
  git commit -m "feat(zomboid): conecta la pestaña Parches — sitemap con lastmod por versión, <head>, portada" -- site/src/route.ts site/src/Zomboid.tsx site/src/areaFiles.ts site/src/sitemap.ts site/vite.config.ts site/src/prerender.ts site/src/PageMeta.tsx site/src/zomboidCopy.ts site/src/zomboid/ZomboidHome.tsx site/test/zomboidPublish.test.ts site/test/zomboidSeo.test.ts site/test/zomboidPatches.test.ts
  ```

---

### Task 5: "Qué cambió" en cada ficha

**Files:**
- Create: `site/src/zomboid/patches/ChangesBox.tsx`, `site/test/zomboidPatchChanges.test.ts`
- Modify:
  - el campo opcional `changes?: FichaChange[]` en los tipos `ItemFicha` (`site/src/zomboid/items/data.ts`), `RecipeFicha` (`site/src/zomboid/recipes/data.ts`), `Trait` y `Profession` (`site/src/zomboid/traits/data.ts`), el de la habilidad (`site/src/zomboid/skills/data.ts`) y `Moodle` (`site/src/zomboid/moodles/data.ts`);
  - las seis fichas (`items/ItemFicha.tsx`, `recipes/RecipeFicha.tsx`, `traits/TraitFicha.tsx`, `traits/ProfessionFicha.tsx`, `skills/SkillFicha.tsx`, `moodles/MoodleFicha.tsx`), que muestran `<ChangesBox …/>` al final de la columna principal, antes del pie;
  - `site/src/styles/zomboid-patches.css`.

**Interfaces:**
- Consumes: `FichaChange`, `FieldRows` de `PatchDiff.tsx`, `usePatchesCopy`, `fieldLabel`, `formatValue`, `recipeLine`, `direction` (Task 4), y el `changes` que escribe `site.py` (Task 3).
- Produces:
  ```ts
  export default function ChangesBox(props: {
    kind: Kind; changes: FichaChange[] | undefined; route: Route; navigate: (r: Route) => void;
    variants?: { gameId: string; name: Loc }[];   // objetos: para decir de qué variante es el cambio
  }): JSX.Element | null   // null si no hay cambios
  ```
  - Es una hoja de libreta titulada "Qué cambió" / "What changed", con un sello del juego.
  - Lleva un bloque por versión: "42.22 · 14 de octubre de 2026" enlazado a `/parches/42-22`; "Apareció en esta versión" si `kind === "added"`; si no, `FieldRows`. En objetos con variantes, el nombre de la variante (por `gameId`) arriba de sus renglones.
  - Pie: "Todas las versiones →" a la pestaña.
  - **Celular:** una columna.

- [ ] **Step 1: Tests que fallan** (`zomboidPatchChanges.test.ts`, con `registerPzSlugs(buildEsSlugs(INDEX, []))`):
  - `renderToString` de `ChangesBox` con `changes: undefined` → `""`;
  - **un rasgo:**
    1. `TRAITS.find((t) => t.id === "strong")!.changes = [{ patch: "42-22", version: "42.22", date: "2026-10-14", kind: "changed", fields: [{ f: "cost", b: 10, a: 8 }] }]`;
    2. `renderApp(parseRoute("/es/project-zomboid/rasgos/fuerte"))` contiene "Qué cambió", `href="/es/project-zomboid/parches/42-22"`, "Costo", `>10<`, `>8<` y "baja".
    3. En `afterEach` se borra el campo, porque es el mismo objeto del módulo.
  - **un objeto:**
    1. `const f = await loadItem("crowbar")`, y `f!.changes = [{ …, kind: "changed", gameId: f!.variants[0].gameId, fields: [{ f: "stats.maxDamage", b: 1.15, a: 1.3 }] }]`;
    2. el render de `/es/project-zomboid/objetos/palanca` contiene "Daño máximo" y `>1,3<`;
    3. en `afterEach` se borra.
  - **un moodle con `kind: "added"`:** contiene "Apareció en esta versión".
  - **sin `changes`:** la ficha de la palanca no contiene "Qué cambió". Es la regresión de hoy, con datos reales y cero diffs.
- [ ] **Step 2:** `npx vitest run test/zomboidPatchChanges.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `ChangesBox` y sumarlo a las seis fichas y a sus tipos. → PASS. Correr `npx vitest run test/zomboid*.test.ts`: las demás fichas siguen iguales.
- [ ] **Step 4: Verlo en el navegador.**
  1. Sumar a mano, en `games/zomboid/data/site/traits.json`, el mismo `changes` del test en la ficha `strong` (sin commitear).
  2. Mirar el recuadro en `http://localhost:5178/es/project-zomboid/rasgos/fuerte`, en escritorio y en celular (panel Browser).
  3. Devolver el archivo con `git restore games/zomboid/data/site/traits.json` y ver que el recuadro ya no aparece.
- [ ] **Step 5: Commit** (la pestaña ya está conectada, así que entra sola):
  ```bash
  git add site/src/zomboid/patches/ChangesBox.tsx site/test/zomboidPatchChanges.test.ts
  git commit -m "feat(zomboid): cada ficha cuenta qué le cambió en los últimos parches" -- site/src/zomboid/patches/ChangesBox.tsx site/test/zomboidPatchChanges.test.ts site/src/zomboid/items/data.ts site/src/zomboid/items/ItemFicha.tsx site/src/zomboid/recipes/data.ts site/src/zomboid/recipes/RecipeFicha.tsx site/src/zomboid/traits/data.ts site/src/zomboid/traits/TraitFicha.tsx site/src/zomboid/traits/ProfessionFicha.tsx site/src/zomboid/skills/data.ts site/src/zomboid/skills/SkillFicha.tsx site/src/zomboid/moodles/data.ts site/src/zomboid/moodles/MoodleFicha.tsx site/src/styles/zomboid-patches.css
  ```

---

## Procedimiento en cada versión nueva (lo resume el README; la Task 1 y la Task 2 lo escriben)

1. Actualizar el juego en Steam (rama estable).
2. `python games/zomboid/tools/extract.py`. Guarda la foto, el diff contra la anterior y, al final, los datos del sitio.
   - Si corta por un cambio masivo: revisar `git diff games/zomboid/data`.
   - Si es un parche de verdad: `PZ_ACEPTO_CAMBIOS_MASIVOS=1 python games/zomboid/tools/extract.py`.
3. `python games/zomboid/tools/patches.py news`: deja `chronicle/<slug>.todo.json` y la caché de los anuncios.
4. Escribir el resumen en/es en `chronicle/<slug>.json` (reglas de la Task 2) y borrar el `.todo.json`.
   - Si el parche es un hotfix, se suma a `hotfixes` de su versión.
   - Hasta que esté, la página sale con el diff y la línea automática.
5. `python games/zomboid/tools/patches.py check` → sin problemas.
6. `python games/zomboid/tools/site.py`, y `cd site && npx vitest run test/zomboid*.test.ts`.
7. Commit de `games/zomboid/data/patches/` y `games/zomboid/data/site/`, nombrando los archivos.
8. Pedir la indexación de la página nueva (regla SEO de 10 pedidos por día).

## Decisiones para ZoTaD (el plan va con la recomendada)

1. **Desde dónde arranca la Crónica.** Recomendado: desde la 42.20 (el Build 42 llega a estable, 29/7), con sus 4 hotfixes, más la 42.21. La alternativa es sumar las Unstable 42.0–42.19, unas 30 entradas más, de poco tráfico. Es `FIRST` en `patches.py`.
2. **Cómo se guardan las fotos.** Recomendado: gzip determinista, ~230 KB por versión. La alternativa es JSON plano: ~2 MB por versión, aunque git las comprime bien entre versiones.
3. **Cuántas comparaciones muestra "Qué cambió" en cada ficha.** Recomendado: las últimas 5. Es `CHANGES_N`.
4. **Sólo la rama estable.** Recomendado: la foto es la de la instalación de ZoTaD (estable). Las versiones Unstable entran a la Crónica sólo como `unstableDate` de su versión.

## Self-review (hecho al escribir el plan)

- **Cobertura:**
  - la foto por versión con los siete tipos → Task 1;
  - el diff con antes → después por campo y tests sintéticos → Task 1;
  - las fotos guardadas en el repo → Task 1;
  - el script por versión y su procedimiento → Task 1, Task 2 y la sección de arriba;
  - la Crónica con fuentes y sin copia → Task 2;
  - la página con resumen y diff por tipo enlazado a fichas → Tasks 3 y 4;
  - "qué cambió" en las fichas → Tasks 3 y 5;
  - `lastmod` por versión, títulos de búsqueda y prerender → Task 4;
  - funciona sin diffs: 42.21 con `first` y 42.20 con `before` → Tasks 3, 4 y 5.
- **Nombres:**
  - Python: `slug`, `snapshot`, `diff`, `record`, `read_snapshot`, `snapshots_index`, `patch_pages`, `ficha_changes`, `value_names`, `CHANGES_N`, `KIND_SEC`;
  - TS: `pzPatchVersion`, `PATCH_INDEX`, `peekPatch`, `loadPatch`, `preloadPatchesRoute`, `primePatch`, `fieldLabel`, `formatValue`, `recipeLine`, `direction`, `autoLede`, `rawKey`, `FieldRows`, `ChangesBox`;
  - todos se usan con la misma firma en las tareas siguientes.
