"""
Project Zomboid → los datos del sitio para las pestañas Objetos, Recetas, Rasgos, Personaje, Habilidades y Moodles
(2026-09-30).

Lee lo que ya escribió `extract.py` en games/zomboid/data (no toca el juego) y escribe:

  games/zomboid/data/site/items-list.json     una fila por ficha de objeto (nombre en/es, categoría, ícono, peso,
                                              tipo y cuántas variantes junta), más las categorías con su nombre y
                                              cuántas fichas tienen: lo que baja la página de la lista
  games/zomboid/data/site/recipes-list.json   lo mismo para las recetas (fabricar y construir)
  games/zomboid/data/site/items/<NN>.json     las fichas de objeto, repartidas en 100 archivos por un hash del slug
  games/zomboid/data/site/recipes/<NN>.json   las fichas de receta, igual
  games/zomboid/data/site/traits.json         los 97 rasgos enteros (costo, excluyentes, bonificaciones, multiplicadores
                                              de XP, recetas, qué profesiones los dan), en el orden del índice
  games/zomboid/data/site/professions.json    las 25 profesiones (bonificaciones, rasgos, recetas, pueblos donde aparecen)
  games/zomboid/data/site/skills.json         las 35 habilidades, en el orden del juego: XP por nivel, nivel inicial,
                                              multiplicadores, libros por tramo, revistas, VHS, rasgos y profesiones
  games/zomboid/data/site/moodles.json        los 26 moodles con su ícono y sus niveles
  Estos cuatro van enteros y no repartidos: son pocos (entre 18 y 73 KB crudos, de 6 a 16 KB con gzip: moodles 18,
  profesiones 41, habilidades 71, rasgos 72) y la lista y el planificador los necesitan completos.
  games/zomboid/data/site/patches/index.json  (2026-10-02) la pestaña Parches: una cabecera por versión, de la más nueva
                                              a la más vieja, y `current` (la versión de meta.json)
  games/zomboid/data/site/patches/<slug>.json una página por versión ("42-21"): la Crónica (data/patches/chronicle) y,
                                              si hay foto con diff (data/patches/diffs, de patches.py), qué se agregó,
                                              quitó y cambió, con el slug de la ficha de hoy de cada cosa
  Además, cada ficha de objeto, receta, rasgo, profesión, habilidad y moodle que cambió en alguna de las últimas
  `CHANGES_N` comparaciones lleva `changes` ("Qué cambió"); sin cambios, el campo no está.

Por qué así:
  - Una ficha baja sólo su archivo (~38 objetos o ~12 recetas, ~10 KB con gzip) y no los 5 MB de datos: el número de
    archivo sale del slug (`shard`, igual a `pzShard` de site/src/zomboid/shard.ts), así que la página no necesita
    ningún índice para encontrarlo.
  - Las relaciones van resueltas acá, una vez, y no en el navegador: qué recetas hacen, gastan o usan de herramienta
    cada objeto (las etiquetas como `base:saw` ya abiertas en sus objetos), con qué se repara y qué repara, qué
    enseña cada libro o revista, y cómo se aprende cada receta (libros, nivel, investigación, rasgos, profesiones).
  - Todo enlace (`Ref`) lleva el slug de la ficha destino, nunca el id del juego: es la dirección de la página.

Uso: lo llama `extract.py` al final, después de escribir todo; o solo, para rehacerlo sin volver a leer el juego:
    python games/zomboid/tools/site.py

Igual que el extractor: el mismo orden siempre, y un archivo se reescribe sólo si cambió (así `git status` muestra
sólo lo que de verdad cambió en un parche).

Ojo con el nombre: `site` es también un módulo de la biblioteca estándar de Python, que el intérprete importa al
arrancar. Por eso `extract.py` carga este archivo por su ruta y no con `import site`, que le daría el otro.
"""
import functools, glob, gzip, importlib.util, json, os, re, sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA = os.path.join(ROOT, "games", "zomboid", "data")
OUT = os.path.join(DATA, "site")

# Cuántos archivos por pestaña. 100 y no 64 (lo que decía el plan): con 64, tres archivos de objetos pasaban los
# 120 KB, por los objetos que sirven de herramienta en cientos de recetas (la multiherramienta en ~300, cada cuchillo
# en ~250 por `base:sharpknife`: 18 a 29 KB cada ficha, sólo en enlaces). Con 100 el más grande queda en ~105 KB y el
# promedio en ~10 KB con gzip, y el nombre sigue siendo de dos dígitos (00 a 99). Si un parche hace pasar uno de 120 KB
# (lo mide site/test/zomboidSiteData.test.ts), se sube acá y en `PZ_SHARDS` de site/src/zomboid/shard.ts.
SHARDS = 100
# La categoría de las recetas que el juego deja sin `category` (36 en la 42.21: romper ropa, hacer soga, abrir el
# paraguas, hacer carbón…). "Miscellaneous" es una categoría del juego, con su nombre en recipes.json: no se inventa una.
NO_CATEGORY = "Miscellaneous"


def fnv1a32(s):
    """FNV-1a de 32 bits sobre los bytes UTF-8 de `s`. Es `pzHash` de site/src/zomboid/shard.ts paso por paso."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug, n=SHARDS):
    """
    El archivo de una clave: FNV-1a de 32 bits del slug, módulo `n`, con dos dígitos ("07"). Es `pzShardOf` de
    site/src/zomboid/shard.ts paso por paso: si se cambia uno se cambia el otro (lo prueban
    site/test/zomboidSiteData.test.ts y zomboidLootData.test.ts buscando cada ficha real donde dice la función de TS).
    FNV y no un hash de `hashlib`: son cuatro líneas en los dos lenguajes y reparte parejo. `n` cambia para el botín
    por habitación (loot.py lo reparte en 32: son ~400 habitaciones y no 3.826 fichas); con más de 100 el nombre
    dejaría de ser de dos dígitos.
    """
    assert 0 < n <= 100
    return f"{fnv1a32(slug) % n:02d}"


def dumps(data):
    # El mismo formato que los demás JSON del extractor: compacto y con las tildes tal cual.
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def load(name):
    path = os.path.join(DATA, *name.split("/"))
    if not os.path.exists(path):
        raise SystemExit(f"No encuentro {os.path.relpath(path, ROOT)}: primero hay que correr "
                         "python games/zomboid/tools/extract.py (site.py arma el sitio con lo que ése escribe).")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def loc(d):
    """Un nombre en los dos idiomas. Sin español va el inglés, como en el índice: el sitio nunca muestra un hueco."""
    return {"en": d["en"], "es": d.get("es") or d["en"]}


def split_count(c):
    """`count` es un número o, si el juego la deja variar (`variable[1:20]`), [mín, máx]: → (n, máx o None)."""
    if isinstance(c, list):
        return c[0], (c[1] if c[1] != c[0] else None)
    return c, None


# --- Parches (2026-10-02) ---------------------------------------------------------------------------------------------
#
# Las páginas de versión de la pestaña Parches y el "Qué cambió" de cada ficha, con lo que escribe patches.py (las fotos
# y los diffs) y la Crónica escrita a mano. Las funciones de abajo son puras (sin leer disco) para probarlas con datos
# sintéticos (tests/test_site_patches.py); `Site.patches()` lee los archivos y se las pasa.

# El tipo del diff → la sección del índice donde están sus fichas. Las opciones de sandbox no tienen ficha propia: salen
# en la página del parche y nada más.
KIND_SEC = {"items": "items", "recipes": "recipes", "traits": "traits", "professions": "professions",
            "skills": "skills", "moodles": "moodles", "sandbox": None}
CHANGES_N = 5   # las últimas 5 comparaciones van a "Qué cambió" de cada ficha
# Un renglón de receta de la foto ("2× Base.Nails", "1× tag:base:saw keep", "1× Base.Plank|Base.TreeBranch2"): la
# cantidad del principio no es un nombre.
ROW_COUNT = re.compile(r"^\d+(\.\d+)?× ")


@functools.cache
def patches_mod():
    """
    patches.py cargado por su ruta, como extract.py carga este archivo: así site.py anda igual si lo carga otro script
    (craft.py, loot.py, los tests) que no puso la carpeta de las herramientas en sys.path. Una vez y a pedido: los que
    no arman Parches no cargan patches.py (ni extract.py, que es lo que importa ése).
    """
    spec = importlib.util.spec_from_file_location("zomboid_patches", os.path.join(os.path.dirname(__file__), "patches.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def version_key(version):
    """Para ordenar versiones como números: "42.21.1" → (42, 21, 1); "42.21 (build 7)" → (42, 21, 7)."""
    return tuple(int(x) for x in re.findall(r"\d+", version))


def value_tokens(v):
    """Los nombres posibles dentro de un valor: el string entero, o los pedazos de un renglón de receta."""
    if isinstance(v, list):
        for x in v:
            yield from value_tokens(x)
    elif isinstance(v, str):
        s = ROW_COUNT.sub("", v, count=1)
        if s.endswith(" keep"):
            s = s[:-len(" keep")]
        for t in s.split("|"):
            if t:
                yield t


def value_names(fields, lookup):
    """
    {token: {en, es}} de los valores de unos cambios (`b`, `a`, `add`, `rem`) que `lookup` encuentra: así la página
    dice "Tablón" donde el diff dice Base.Plank. Lo que no se encuentra (una etiqueta, un número, un texto) queda
    afuera y se muestra crudo. Ordenado por token, para que el archivo salga igual cada vez.
    """
    out, seen = {}, set()
    for ch in fields:
        for key in ("b", "a", "add", "rem"):
            for t in value_tokens(ch.get(key)):
                if t in seen:
                    continue
                seen.add(t)
                name = lookup(t)
                if name:
                    out[t] = name
    return dict(sorted(out.items()))


def plain_sources(sources):
    # Sin el `gid` de Steam: sólo lo usa `patches.py check` para encontrar el anuncio guardado.
    return [{"kind": s["kind"], "url": s["url"]} for s in sources]


def diff_ent(kind, gid, names, resolve):
    """Una cosa nombrada en el diff: su id, su nombre (el del diff) y el slug de su ficha de hoy, si tiene."""
    e = {"id": gid, "n": names.get(gid) or {"en": gid, "es": gid}}
    target = resolve(kind, gid) if KIND_SEC.get(kind) else None
    if target:
        e["slug"] = target
    return e


def patch_pages(chronicle, snaps, diffs, first_counts, resolve, lookup, current=None):
    """
    Las páginas de la pestaña Parches: {"patches/index.json": {current, patches}, "patches/<slug>.json": página}.

    - `chronicle`: las entradas de chronicle/*.json; `snaps`: el índice de fotos (de la más vieja a la más nueva);
      `diffs`: {slug: diff de patches.py}; `first_counts`: {id de foto: {tipo: cuántos}}, de la primera foto (no tiene
      diff, pero sí puede decir cuántos objetos, recetas… había cuando empezamos a comparar).
    - `resolve(kind, gid)` → el slug de la ficha de hoy de ese id, o None; `lookup(token)` → {en, es} o None.
    - `current`: la versión de meta.json; sin ella, la de la última foto.

    Una página por versión de la Crónica y por foto. Sin Crónica, la versión y la fecha salen de la foto. Una foto de
    un hotfix (tres números, 42.21.1) toma fecha, resumen y fuentes del hotfix de su padre en la Crónica, y el padre la
    enlaza desde su lista de hotfixes.

    `recorded` dice si los datos de esa versión están registrados: con foto propia, o anotada en el `seen` de otra foto
    (patches.py no graba una foto nueva cuando los datos son los de la última). Así se leen las tres combinaciones:
      - `recorded` con `diff`: la comparamos y esto es lo que cambió;
      - `recorded` con `first`: la primera foto, contra nada (cuántos había de cada tipo);
      - `recorded` sin `diff` ni `first`: la comparamos y no cambió ningún dato de los que miramos;
      - sin `recorded`: es anterior a la primera foto, no hay contra qué compararla.
    """
    P = patches_mod()
    chron = {e["slug"]: e for e in chronicle}
    by_snap = {P.slug(s["id"]): s for s in snaps}
    # Las versiones que se vieron con los datos de otra foto (un parche sin cambios de datos): comparadas, sin diff.
    seen = {P.slug(x["version"]) for e in snaps for x in e.get("seen", [])}
    slugs = sorted(set(chron) | set(by_snap))
    # El hotfix de la Crónica de cada versión de tres números: (slug del padre, entrada del hotfix).
    hotfix_entry = {P.slug(h["version"]): (e["slug"], h) for e in chronicle for h in e.get("hotfixes", [])}

    metas, pages = [], {}
    for s in slugs:
        c, sn = chron.get(s), by_snap.get(s)
        hot_parent, hot = None, None
        if not c and sn and sn["version"].count(".") == 2:
            hot_parent = P.slug(P.parent(sn["version"]))
            par, h = hotfix_entry.get(P.slug(sn["version"]), (None, None))
            hot = h if par == hot_parent else None
        m = {"slug": s}
        if c:
            m["version"], m["date"] = c["version"], c["date"]
            if c.get("updated"):
                m["updated"] = c["updated"]
            for key in ("branch", "unstableDate", "title", "summary"):
                if key in c:
                    m[key] = c[key]
        else:
            # Un parche que no cambió el número (otro build con otros datos) lleva el build: "42.21 (build 7)".
            m["version"] = sn["version"] + (f" (build {sn['build']})" if "-b" in sn["id"] else "")
            m["date"] = hot["date"] if hot else sn["recordedAt"]
            if hot:
                m["summary"] = hot["summary"]
        # Sólo si el padre tiene página: si no, el enlace no llevaría a ningún lado.
        if hot_parent and hot_parent in chron.keys() | by_snap.keys():
            m["hotfixOf"] = hot_parent
        m["hotfixes"] = len(c.get("hotfixes", [])) if c else 0
        m["recorded"] = sn is not None or s in seen
        d = diffs.get(s)
        if d:
            m["counts"] = d["counts"]
        if sn and sn["id"] in first_counts:
            m["first"] = first_counts[sn["id"]]
        metas.append(m)

        page = dict(m)
        page["highlights"] = c.get("highlights", []) if c else []
        page["sources"] = plain_sources(c["sources"] if c else (hot or {}).get("sources", []))
        page["hotfixList"] = []
        for h in (c.get("hotfixes", []) if c else []):
            row = {"version": h["version"], "date": h["date"], "summary": h["summary"],
                   "sources": plain_sources(h.get("sources", []))}
            if P.slug(h["version"]) in by_snap:
                row["slug"] = P.slug(h["version"])
            page["hotfixList"].append(row)
        fields = []
        if d:
            kinds = {}
            for kind, k in d["kinds"].items():
                names = d["names"].get(kind, {})
                kinds[kind] = {
                    "added": [diff_ent(kind, g, names, resolve) for g in k["added"]],
                    "removed": [diff_ent(kind, g, names, resolve) for g in k["removed"]],
                    "changed": [{**diff_ent(kind, g, names, resolve), "fields": k["changed"][g]}
                                for g in sorted(k["changed"])]}
                fields += [f for g in sorted(k["changed"]) for f in k["changed"][g]]
            page["diff"] = {"from": d["from"], "fromSlug": P.slug(d["from"]), "kinds": kinds}
        page["names"] = value_names(fields, lookup)
        pages[f"patches/{s}.json"] = page

    metas.sort(key=lambda m: (m["date"], version_key(m["version"])), reverse=True)
    if current is None:
        current = snaps[-1]["version"] if snaps else None
    return {"patches/index.json": {"current": current, "patches": metas}, **pages}


def ficha_changes(diffs_newest_first, resolve, lookup, n=CHANGES_N):
    """
    {(sección, slug): [FichaChange]}: lo que cambió en cada ficha en las últimas `n` comparaciones (de la más nueva a la
    más vieja). `diffs_newest_first` es [(cabecera de la página del parche, diff)]. Un id quitado no tiene ficha y no
    se anota; los objetos llevan `gameId` (attach_changes lo saca si la ficha tiene una sola variante).
    """
    out = defaultdict(list)
    for meta, d in diffs_newest_first[:n]:
        head = {"patch": meta["slug"], "version": meta["version"], "date": meta["date"]}
        for kind, k in d["kinds"].items():
            sec = KIND_SEC.get(kind)
            if not sec:
                continue
            for status, gids in (("added", k["added"]), ("changed", sorted(k["changed"]))):
                for gid in gids:
                    target = resolve(kind, gid)
                    if not target:
                        continue
                    c = {**head, "kind": status}
                    if kind == "items":
                        c["gameId"] = gid
                    if status == "changed":
                        c["fields"] = k["changed"][gid]
                        names = value_names(c["fields"], lookup)
                        if names:
                            c["names"] = names
                    out[(sec, target)].append(c)
    return dict(out)


def attach_changes(files, changes):
    """
    Mete `changes` en cada ficha que lo tiene (las de objetos y recetas, en su shard; las demás, en su lista por `id`).
    El `gameId` queda sólo en los objetos con más de una variante: con una, no hay cuál distinguir. Devuelve cuántas
    fichas lo llevan.
    """
    by_id = {}
    n = 0
    for (sec, s), lst in sorted(changes.items()):
        if sec in ("items", "recipes"):
            f = files.get(f"{sec}/{shard(s)}.json", {}).get(s)
        else:
            if sec not in by_id:
                by_id[sec] = {x["id"]: x for x in files.get(f"{sec}.json", [])}
            f = by_id[sec].get(s)
        if f is None:
            continue
        if sec == "items" and len(f.get("variants", [])) <= 1:
            lst = [{k: v for k, v in c.items() if k != "gameId"} for c in lst]
        f["changes"] = lst
        n += 1
    return n


class Site:
    def __init__(self):
        self.index = load("index.json")
        items_idx = load("items.json")
        self.item_cats = items_idx["categories"]
        recipes_file = load("recipes.json")
        self.recipe_cats = recipes_file["categories"]
        self.stations = recipes_file["stations"]
        self.fluids = recipes_file["fluids"]
        self.fluid_cats = recipes_file["fluidCategories"]
        self.recipes = {r["id"]: r for r in recipes_file["recipes"]}
        self.tags = load("tags.json")
        self.fixing = load("fixing.json")
        self.traits = {t["id"]: t for t in load("traits.json")}
        self.professions = {p["id"]: p for p in load("professions.json")}
        self.skills = load("skills.json")
        self.moodles = {m["id"]: m for m in load("moodles.json")}
        self.media = load("media.json")
        meta = load("meta.json")
        self.version = meta.get("version")  # `current` del índice de Parches
        self.boost_general = meta.get("boostMultipliers")
        if not self.boost_general:
            raise SystemExit("meta.json no trae boostMultipliers: primero hay que correr "
                             "python games/zomboid/tools/extract.py (site.py arma el sitio con lo que ése escribe).")
        # Dónde aparece cada profesión al empezar, de los spawnpoints que lee map.py (otro extractor): {profesión en
        # minúsculas: [pueblos]}. En minúsculas porque el juego escribe "fitnessInstructor" en los spawnpoints y el
        # script de la profesión dice "fitnessinstructor"; el juego las junta igual (el registro de profesiones se llama
        # "fitnessInstructor" y ése es el nombre que busca en los spawnpoints).
        spawns_path = os.path.join(DATA, "map", "spawns.json")
        if not os.path.exists(spawns_path):
            raise SystemExit(f"No encuentro {os.path.relpath(spawns_path, ROOT)}: primero hay que correr "
                             "python games/zomboid/tools/map.py (los pueblos de cada profesión salen de ahí).")
        with open(spawns_path, encoding="utf-8") as f:
            spawns = json.load(f)
        self.towns = defaultdict(list)
        for town in spawns["towns"]:
            for point in town["points"]:
                for prof in point[3]:
                    if town["name"] not in self.towns[prof.lower()]:
                        self.towns[prof.lower()].append(town["name"])

        # Las fichas completas de cada objeto (items/<tipo>.json): de ahí salen stats, tags, tooltip y lo que enseña.
        self.full = {}
        for path in sorted(glob.glob(os.path.join(DATA, "items", "*.json"))):
            with open(path, encoding="utf-8") as f:
                for it in json.load(f):
                    self.full[it["id"]] = it
        for it in items_idx["items"]:
            if it["id"] not in self.full:
                raise SystemExit(f"{it['id']} está en items.json y no en items/<tipo>.json: los datos quedaron a medias. "
                                 "No se escribió nada: hay que volver a correr extract.py.")

        # Id del juego → entrada del índice (con su slug), por sección.
        self.entry = {}
        for e in self.index:
            for ref in e["ref"]:
                self.entry[(e["sec"], ref)] = e
        self.item_entries = [e for e in self.index if e["sec"] == "items"]
        self.recipe_entries = [e for e in self.index if e["sec"] == "recipes"]
        for e in self.item_entries:
            for gid in e["ref"]:
                if gid not in self.full:
                    raise SystemExit(f"La ficha items/{e['id']} de index.json nombra {gid}, que no está en items/<tipo>.json. "
                                     "No se escribió nada: hay que volver a correr extract.py.")
        for e in self.recipe_entries:
            if e["ref"][0] not in self.recipes:
                raise SystemExit(f"La ficha recipes/{e['id']} de index.json nombra la receta {e['ref'][0]}, que no está en "
                                 "recipes.json. No se escribió nada: hay que volver a correr extract.py.")
        # Lo que se deja afuera por nombrar algo sin ficha (no debería pasar: extract.py ya saca los objetos de prueba).
        self.dropped = defaultdict(set)

    # --- Enlaces -----------------------------------------------------------------------------------------------------

    def item_slug(self, gid):
        e = self.entry.get(("items", gid))
        if not e:
            self.dropped["objetos"].add(gid)
        return e["id"] if e else None

    def item_ref(self, gid):
        """
        Un objeto enlazado. El ícono es el de ese id del juego y no el de la primera variante de la ficha: forjar una
        palanca da la palanca forjada, con su dibujo, aunque las dos palancas sean una sola ficha.
        """
        e = self.entry.get(("items", gid))
        if not e:
            self.dropped["objetos"].add(gid)
            return None
        return {"id": e["id"], "en": e["en"], "es": e["es"], "icon": self.full[gid]["icon"]}

    def item_refs(self, gids, sort=False):
        """
        Varios objetos, uno por ficha (dos ids del juego con el mismo nombre son un solo enlace).

        - `sort=False`: en el orden en que vienen (el del script), y el ícono del primero que nombra cada ficha.
        - `sort=True` (lo que sale de una etiqueta, de un libro, de investigar): por slug, y el ícono del que va primero
          en la ficha. Ahí el orden que llega es el de los ids (el de tags.json) y no dice nada: la taza pedía por
          etiqueta mostraba la de barro sin cocer (Base.ClayMug) en vez de la taza de cerámica de la ficha.
        """
        best, order = {}, []
        for gid in gids:
            e = self.entry.get(("items", gid))
            if not e:
                self.dropped["objetos"].add(gid)
                continue
            slug = e["id"]
            if slug not in best:
                best[slug] = gid
                order.append(slug)
            elif sort and e["ref"].index(gid) < e["ref"].index(best[slug]):
                best[slug] = gid
        return [self.item_ref(best[s]) for s in (sorted(order) if sort else order)]

    def recipe_ref(self, rid):
        # Sin ícono: el de una receta es de `items/` o de `build/` según la receta, y un Ref no dice cuál. Las fichas
        # los listan con los sellos del juego como viñetas.
        e = self.entry.get(("recipes", rid))
        return {"id": e["id"], "en": e["en"], "es": e["es"]} if e else None

    def trait_ref(self, tid, sec):
        """Un rasgo (`sec="traits"`) o una profesión (`sec="professions"`) enlazados."""
        e = self.entry.get((sec, tid))
        if not e:
            self.dropped["rasgos y profesiones"].add(tid)
            return None
        # El ícono va en `traits/` o en `professions/`, según la lista donde aparece (learn.traits o learn.professions).
        coll = self.traits if sec == "traits" else self.professions
        return {"id": e["id"], "en": e["en"], "es": e["es"], "icon": coll[tid].get("icon")}

    def refs(self, maker, ids, sort=False):
        """Varios enlaces, sin repetir y sin los que no tienen ficha; en el orden en que vienen o por slug."""
        out, seen = [], set()
        for x in ids:
            ref = maker(x)
            if ref and ref["id"] not in seen:
                seen.add(ref["id"])
                out.append(ref)
        return sorted(out, key=lambda r: r["id"]) if sort else out

    def skill_ref(self, key):
        """Una habilidad enlazada a su ficha (sin ícono: las habilidades no tienen)."""
        e = self.entry.get(("skills", key))
        if not e:
            self.dropped["habilidades"].add(key)
            return None
        return {"id": e["id"], "en": e["en"], "es": e["es"]}

    def boosts(self, m):
        """Las bonificaciones de un rasgo o profesión: [{skill: Ref, lvl}], en el orden del script."""
        return [{"skill": ref, "lvl": v} for k, v in m.items() for ref in [self.skill_ref(k)] if ref]

    def mults(self, rows):
        """
        Los multiplicadores de XP de un rasgo (`xpMult` de traits.json): [{mult, skills}] con las habilidades por su id de
        ficha (el slug de site/skills.json: "carpentry", "running"), que es el que tiene el planificador para sumar; el
        de traits.json lleva el id del juego (Woodwork, Sprinting). El mismo orden, el de las habilidades del juego.
        Una habilidad sin ficha corta en vez de quedar afuera: el planificador multiplicaría de menos sin que se note.
        """
        out = []
        for r in rows:
            refs = [self.skill_ref(k) for k in r["skills"]]
            if not all(refs):
                missing = [k for k, ref in zip(r["skills"], refs) if not ref]
                raise SystemExit(f"Un multiplicador de XP de rasgo nombra habilidades sin ficha: {missing}. No se escribió "
                                 "nada: revisar skills.json y xp_trait_multipliers() de extract.py.")
            out.append({"mult": r["mult"], "skills": [ref["id"] for ref in refs]})
        return out

    def skill(self, key):
        return loc(self.skills[key]) if key in self.skills else {"en": key, "es": key}

    def skill_levels(self, m):
        return [{"skill": self.skill(k), "lvl": v} for k, v in m.items()]

    # --- Recetas -----------------------------------------------------------------------------------------------------

    def options(self, io):
        """Los ids del juego que sirven para una entrada: los que nombra, o los que tienen alguna de sus etiquetas."""
        if "items" in io:
            return io["items"]
        if "tags" in io:
            return sorted({gid for t in io["tags"] for gid in self.tags.get(t, [])})
        return []

    def recipe_input(self, io):
        if "fluid" in io:
            n, top = split_count(io["fluid"])
        else:
            n, top = split_count(io["count"])
        out = {"n": n}
        if top is not None:
            out["max"] = top
        # "keep": la herramienta vuelve al inventario (una sierra); "destroy" y sin modo se gastan; "mixture" es un
        # líquido que se mezcla, también se gasta.
        out["keep"] = io.get("mode") == "keep"
        if "tags" in io:
            # Varias etiquetas van juntas con `;`, como en el script del juego (`tags[base:hammer;base:clubhammer]`).
            out["tag"] = ";".join(io["tags"])
            # Por slug: la lista de "cualquiera de" se lee en orden alfabético (en inglés) y es la misma cada vez.
            opts = self.item_refs(self.options(io), sort=True)
        elif "items" in io:
            # En el orden del script: el primero es el que el juego pone de ejemplo.
            opts = self.item_refs(io["items"])
            # `[Base.IronChunk;2:Base.IronBarHalf]`: una opción que pide otra cantidad la lleva en su enlace.
            counts = io.get("counts", {})
            for gid, c in counts.items():
                slug = self.item_slug(gid)
                for o in opts:
                    if o["id"] == slug and c != n and "n" not in o:
                        o["n"] = c
        else:
            opts = []
        if "fluid" in io:
            names = [self.fluids.get(f, {"en": f, "es": f}) for f in io.get("fluids", [])]
            names += [self.fluid_cats.get(c, {"en": c, "es": c}) for c in io.get("categories", [])]
            names = [loc(x) for x in names]
            # Leche de vaca o de oveja: los nombres del juego juntos con " / ", sin inventar un "o" por idioma.
            out["fluid"] = {"en": " / ".join(x["en"] for x in names), "es": " / ".join(x["es"] for x in names)}
        if io.get("any"):
            out["any"] = True  # `[*]`: cualquier objeto
        out["opts"] = opts
        return out

    def recipe_output(self, r, e, o):
        if "entity" in o:
            # Lo que se construye es el mueble que nombra la receta: lleva su nombre.
            return {"entity": {"en": e["en"], "es": e["es"]}}
        n, top = split_count(o["count"])
        out = {"n": n}
        if top is not None:
            out["max"] = top
        if "item" in o:
            ref = self.item_ref(o["item"])
            if not ref:
                return None
            out["item"] = ref
            return out
        if "mapper" in o:
            # El resultado depende del ingrediente (itemMapper): una opción por ficha resultante, en el orden del
            # script, con los objetos que la dan. Dos claves que son la misma ficha van juntas: el café en taza tiene
            # nueve claves, una por taza (cada una con su dibujo en el juego), y todas dan "Bebida caliente"; en la ficha
            # es una línea con las tazas y no nueve líneas iguales. `default` va al final con `from: []` (= "con
            # cualquier otro"), salvo que las entradas que usan ese mapper ya estén cubiertas por las claves: ahí nunca
            # se da.
            mapper = r.get("mappers", {}).get(o["mapper"], {})
            by_item, covered = {}, set()
            for gid, froms in mapper.items():
                if gid == "default":
                    continue
                item = self.item_ref(gid)
                src = self.item_refs(froms)
                if not (item and src):
                    continue
                covered |= set(froms)
                choice = by_item.setdefault(item["id"], {"from": [], "item": item})
                choice["from"] += [x for x in src if x["id"] not in {y["id"] for y in choice["from"]}]
            choices = list(by_item.values())
            if "default" in mapper:
                mapped = [io for io in r["inputs"] if o["mapper"] in io.get("mappers", [])]
                rest = [gid for io in mapped for gid in self.options(io) if gid not in covered]
                open_ended = not mapped or any(not self.options(io) for io in mapped)
                item = self.item_ref(mapper["default"])
                if item and (rest or open_ended):
                    choices.append({"from": [], "item": item})
            if not choices:
                return None
            out["choices"] = choices
            return out
        return None

    def recipe_learn(self, r, granted):
        """
        `null` si la receta se sabe desde el principio: en el juego, sólo se aprende la que tiene NeedToBeLearn. A las
        demás (20 en la 42.21) el juego las da por sabidas aunque un rasgo o un libro las nombre.
        """
        learn = r.get("learn", {})
        if not learn.get("needed"):
            return None
        skills = learn.get("autoLearnAll") or learn.get("autoLearnAny") or {}
        out = {"books": self.item_refs(learn.get("books", []), sort=True),
               "skills": self.skill_levels(skills)}
        # AutoLearnAny con dos habilidades o más: alcanza con llegar al nivel de una. Con una sola es lo mismo que All.
        if "autoLearnAny" in learn and len(learn["autoLearnAny"]) > 1:
            out["anySkill"] = True
        out["research"] = self.item_refs(learn.get("research", []), sort=True)
        for sec in ("traits", "professions"):
            refs = (self.trait_ref(t, sec) for t in granted[sec].get(r["id"], []))
            out[sec] = sorted((x for x in refs if x), key=lambda x: x["id"])
        return out

    def recipe_icon(self, r, outputs):
        """El ícono de la fila: el del primer resultado, o el de la receta si es de construcción (en `build/`)."""
        if r["kind"] == "build":
            return r.get("icon")
        for o in outputs:
            if "item" in o:
                return o["item"]["icon"]
            if "choices" in o:
                return o["choices"][0]["item"]["icon"]
        return None

    # --- Todo --------------------------------------------------------------------------------------------------------

    def granted(self):
        """
        Qué recetas da cada rasgo y cada profesión: {"traits": {receta: [rasgos]}, "professions": {receta: [profesiones]}}
        (traits.json y professions.json, ya resueltas por extract.py; lo que no es receta, como "base:carrot growing
        season", queda afuera). Aparte de `build()` porque craft.py arma el `learn` de cada receta con lo mismo.
        """
        granted = {"traits": defaultdict(list), "professions": defaultdict(list)}
        for key, coll in (("traits", self.traits), ("professions", self.professions)):
            for tid, t in coll.items():
                for rid in t.get("recipes", []):
                    if rid in self.recipes and tid not in granted[key][rid]:
                        granted[key][rid].append(tid)
        return granted

    def build(self):
        granted = self.granted()

        makes, uses, tools = defaultdict(set), defaultdict(set), defaultdict(set)
        recipe_fichas, recipe_rows = {}, []
        for e in self.recipe_entries:
            r = self.recipes[e["ref"][0]]
            cat = r.get("category") or NO_CATEGORY
            inputs = [self.recipe_input(io) for io in r["inputs"]]
            outputs = [x for x in (self.recipe_output(r, e, o) for o in r.get("outputs", [])) if x]
            f = {
                "id": e["id"], "en": e["en"], "es": e["es"], "kind": r["kind"], "cat": cat,
                "catName": loc(self.recipe_cats.get(cat, {"en": cat, "es": cat})),
                "time": r.get("time"),
                "skills": self.skill_levels(r.get("skills", {})),
                "xp": [{"skill": self.skill(k), "xp": v} for k, v in r.get("xp", {}).items()],
                "inputs": inputs,
                "outputs": outputs,
                "stations": [loc(self.stations[s]["name"]) for s in r.get("stations", []) if s in self.stations],
                "learn": self.recipe_learn(r, granted),
            }
            if r.get("tooltip"):
                f["tip"] = loc(r["tooltip"])
            # El ícono va en la ficha y en su fila: la ficha lo dibuja en la cabecera (el mueble, si es de
            # construcción) sin bajar la lista entera, que es lo único que lo traía.
            icon = self.recipe_icon(r, outputs)
            f["icon"] = icon
            recipe_fichas[e["id"]] = f
            recipe_rows.append({"id": e["id"], "en": e["en"], "es": e["es"], "cat": cat, "kind": r["kind"],
                                "icon": icon})
            # Las relaciones del lado del objeto salen de lo mismo que muestra la receta: así nunca se contradicen.
            # Del lado del objeto se guarda el id de la receta en el juego (lo que pide `recipe_ref`), no su slug.
            for o in outputs:
                for ref in ([o["item"]] if "item" in o else [c["item"] for c in o.get("choices", [])]):
                    makes[ref["id"]].add(r["id"])
            for i in inputs:
                for ref in i["opts"]:
                    (tools if i["keep"] else uses)[ref["id"]].add(r["id"])

        # Reparaciones (el viejo sistema `fixing`: armas de fuego y chapa de autos).
        # `fixes`: ficha del reparador → {ficha reparada: el id del juego que la nombró, para su ícono}.
        fixed_with, fixes = defaultdict(list), defaultdict(dict)
        for fx_def in self.fixing:
            targets = [(self.item_slug(g), g) for g in fx_def["require"]]
            for fx in fx_def["fixers"]:
                fixer = self.item_ref(fx["item"])
                if not fixer:
                    continue
                row = {"fixer": fixer, "uses": fx["uses"], "skills": self.skill_levels(fx.get("skills", {}))}
                for t, gid in targets:
                    if not t:
                        continue
                    if row not in fixed_with[t]:
                        fixed_with[t].append(row)
                    fixes[fixer["id"]].setdefault(t, gid)

        def recipes_of(ids):
            # Sin un orden propio en el juego: por slug, que es el orden alfabético en inglés y es el mismo cada vez.
            return sorted((self.recipe_ref(rid) for rid in ids), key=lambda x: x["id"])

        def taught(variants, key):
            # Lo que enseña o se aprende investigando, en el orden del juego y sin repetir; lo que no es receta afuera.
            out, seen = [], set()
            for it in variants:
                for rid in it.get(key, []):
                    ref = self.recipe_ref(rid)
                    if ref and ref["id"] not in seen:
                        seen.add(ref["id"])
                        out.append(ref)
            return out

        item_fichas, item_rows = {}, []
        for e in self.item_entries:
            full = [self.full[g] for g in e["ref"]]
            first = full[0]
            cat = first["displayCategory"]
            variants = []
            for it in full:
                v = {"gameId": it["id"], "en": it["name"]["en"], "es": it["name"].get("es") or it["name"]["en"],
                     "icon": it["icon"], "type": it["type"], "w": it["weight"], "stats": it.get("stats", {}),
                     "tags": it["tags"]}
                if it.get("tooltip"):
                    v["tip"] = loc(it["tooltip"])
                variants.append(v)
            slug = e["id"]
            f = {
                "id": slug, "en": e["en"], "es": e["es"], "cat": cat,
                "catName": loc(self.item_cats.get(cat, {"en": cat, "es": cat})),
                "variants": variants,
                "makes": recipes_of(makes[slug]),
                "uses": recipes_of(uses[slug]),
                "tools": recipes_of(tools[slug]),
                "fixedWith": fixed_with[slug],
                "fixes": [self.item_ref(gid) for _, gid in sorted(fixes[slug].items())],
                "teaches": taught(full, "teaches"),
                # Investigar el objeto (desarmarlo o estudiarlo, B42) enseña estas recetas: la otra punta de
                # `learn.research` de la receta.
                "research": taught(full, "research"),
            }
            # La bala y el cargador de un arma de fuego (y la bala de un cargador), como enlaces a sus fichas: la ficha
            # los muestra entre sus números. Los de la primera variante que los tenga, como el resto de los números.
            for key, stat in (("ammo", "ammoItem"), ("magazine", "magazineType")):
                gid = next((it["stats"][stat] for it in full if stat in it.get("stats", {})), None)
                ref = self.item_ref(gid) if gid else None
                if ref:
                    f[key] = ref
            book = next((it["stats"] for it in full if "skillTrained" in it.get("stats", {})), None)
            if book:
                f["skillBook"] = {"skill": self.skill(book["skillTrained"]), "from": book.get("lvlSkillTrained"),
                                  "levels": book.get("numLevelsTrained"), "mult": book.get("xpMultiplier")}
            item_fichas[slug] = f
            item_rows.append({"id": slug, "en": e["en"], "es": e["es"], "cat": cat, "icon": first["icon"],
                              "w": first["weight"], "n": len(e["ref"]), "t": first["type"]})

        files = {
            "items-list.json": {"cats": self.cats(item_rows, self.item_cats), "rows": item_rows},
            "recipes-list.json": {"cats": self.cats(recipe_rows, self.recipe_cats), "rows": recipe_rows},
            **self.sharded("items", item_fichas),
            **self.sharded("recipes", recipe_fichas),
            **self.character(),
        }
        # Parches al final: "Qué cambió" va dentro de las fichas que se acaban de armar.
        files.update(self.patches())
        self.changed_fichas = attach_changes(files, ficha_changes(self.patch_diffs, self.resolve, self.lookup))
        return files

    # --- Parches -----------------------------------------------------------------------------------------------------

    def resolve(self, kind, gid):
        """El slug de la ficha de hoy de un id del juego (de un diff), o None si no tiene (o es una opción de sandbox)."""
        sec = KIND_SEC.get(kind)
        e = self.entry.get((sec, gid)) if sec else None
        return e["id"] if e else None

    def lookup(self, token):
        """El nombre de hoy de un token de un valor del diff: un objeto, una receta, un rasgo o una profesión."""
        for coll in (self.full, self.recipes, self.traits, self.professions):
            x = coll.get(token)
            if x and x.get("name"):
                return loc(x["name"])
        return None

    def patches(self):
        """
        Lee la Crónica (chronicle/*.json, sin los borradores .todo.json), el índice de fotos, los diffs y la primera
        foto (para `first`), y devuelve los archivos de `patch_pages`. Deja en `self.patch_diffs` los diffs con la
        cabecera de su página, de la foto más nueva a la más vieja, para `ficha_changes`.
        """
        P = patches_mod()
        root = P.PATCHES
        chronicle = []
        for path in sorted(glob.glob(os.path.join(root, P.CHRONICLE, "*.json"))):
            if path.endswith(".todo.json"):
                continue
            with open(path, encoding="utf-8") as f:
                chronicle.append(json.load(f))
        snaps = P.snapshots_index(root)
        diffs = {}
        for path in sorted(glob.glob(os.path.join(root, "diffs", "*.json"))):
            with open(path, encoding="utf-8") as f:
                diffs[os.path.basename(path)[:-len(".json")]] = json.load(f)
        first_counts = {}
        if snaps:
            first = P.read_snapshot(root, snaps[0]["id"])
            first_counts[snaps[0]["id"]] = {k: len(first["kinds"][k]) for k in P.KINDS if k in first["kinds"]}
        files = patch_pages(chronicle, snaps, diffs, first_counts, self.resolve, self.lookup, current=self.version)
        self.patch_diffs = [(files[f"patches/{P.slug(s['id'])}.json"], diffs[P.slug(s["id"])])
                            for s in reversed(snaps) if P.slug(s["id"]) in diffs]
        return files

    # --- Rasgos, profesiones, habilidades y moodles ------------------------------------------------------------------

    def character(self):
        """
        Las fichas de las pestañas Rasgos, Personaje, Habilidades y Moodles. Todo enlace lleva el slug de la ficha
        (`Ref`), como en Objetos y Recetas; las recetas que no son recetas (el saber de cultivo de un rasgo, "base:hemp
        growing season") no son enlaces: van en `known`, con su nombre del juego, para mostrarlas como texto.
        """
        entries = lambda sec: [e for e in self.index if e["sec"] == sec]  # noqa: E731
        trait = lambda tid: self.trait_ref(tid, "traits")  # noqa: E731
        prof = lambda pid: self.trait_ref(pid, "professions")  # noqa: E731

        traits = []
        for e in entries("traits"):
            t = self.traits[e["ref"][0]]
            f = {"id": e["id"], "en": e["en"], "es": e["es"]}
            # 13 rasgos de la 42.21 no traen descripción en el script (Jugador de béisbol, Peleón…): el juego muestra en
            # su lugar las habilidades que suben. Sin descripción, la clave no va.
            if t.get("desc"):
                f["desc"] = loc(t["desc"])
            f.update({
                "cost": t["cost"],
                # Como las dos listas del juego (CharacterCreationProfession): costo > 0 va en la de buenos, < 0 en la de
                # malos. Los de costo 0 no están en ninguna: sólo vienen con una profesión (o con el peso, como Obeso).
                "positive": t["cost"] > 0,
                "professionOnly": t["professionOnly"],
                "exclusive": self.refs(trait, t["exclusive"], sort=True),
                "xpBoosts": self.boosts(t["xpBoosts"]),
                # Lo que el rasgo multiplica la XP (Aprendiz rápido ×1.3…), sólo si tiene: [{mult, skills}].
                **({"xpMult": self.mults(t["xpMult"])} if t.get("xpMult") else {}),
                "recipes": self.refs(self.recipe_ref, t["recipes"]),
                **({"known": [loc(k) for k in t["knows"]]} if t.get("knows") else {}),
                # El otro rasgo con el mismo nombre (el que se elige o el de profesión, ver build_traits en extract.py).
                **({"twin": trait(t["twin"])} if t.get("twin") else {}),
                # Rasgos que trae este rasgo (GrantedTraits: Metabolismo lento trae Sobrepeso). Para el planificador.
                "grants": self.refs(trait, t.get("grantedTraits", [])),
                "icon": t["icon"],
                "grantedBy": self.refs(prof, t.get("professions", []), sort=True),
            })
            traits.append(f)

        professions = []
        for e in entries("professions"):
            p = self.professions[e["ref"][0]]
            f = {"id": e["id"], "en": e["en"], "es": e["es"]}
            if p.get("desc"):
                f["desc"] = loc(p["desc"])
            f.update({
                "cost": p["cost"],
                "xpBoosts": self.boosts(p["xpBoosts"]),
                "traits": self.refs(trait, p["traits"]),
                "recipes": self.refs(self.recipe_ref, p["recipes"]),
                **({"known": [loc(k) for k in p["knows"]]} if p.get("knows") else {}),
                "icon": p["icon"],
            })
            if self.towns.get(p["id"].lower()):
                f["spawnTowns"] = self.towns[p["id"].lower()]
            professions.append(f)

        # Libros y revistas de cada habilidad, desde las fichas de objeto (en el orden del índice, por slug).
        books, magazines = defaultdict(list), defaultdict(list)
        for e in (x for x in self.index if x["sec"] == "items"):
            full = [self.full[g] for g in e["ref"]]
            # El libro de la ficha es la primera variante que entrena algo: la misma que muestra la ficha del objeto.
            book = next((it for it in full if "skillTrained" in it.get("stats", {})), None)
            if book:
                s = book["stats"]
                lvl, n = s.get("lvlSkillTrained"), s.get("numLevelsTrained")
                books[s["skillTrained"]].append({
                    "item": self.item_ref(book["id"]), "from": lvl,
                    # El último nivel que entrena: InventoryItem.getMaxLevelTrained() = lvlSkillTrained + numLevelsTrained - 1.
                    "to": lvl + n - 1 if isinstance(lvl, int) and isinstance(n, int) else None,
                    "mult": s.get("xpMultiplier"),
                })
                continue
            # Revista: lo que cuenta meta.json como revista (literatura que enseña algo y no es una foto). Va en cada
            # habilidad que piden o suben las recetas que enseña: el juego no le pone tema, y la receta es lo que dice
            # para qué sirve. Las que enseñan un saber que no es receta (las de cultivos, las de mecánica de autos)
            # quedan sin habilidad.
            mag = next((it for it in full if it["type"] == "literature" and it.get("teaches")
                        and it.get("stats", {}).get("readType") != "photo"), None)
            if mag:
                related = set()
                for rid in mag["teaches"]:
                    r = self.recipes.get(rid, {})
                    related |= set(r.get("skills", {})) | set(r.get("xp", {}))
                for k in related:
                    magazines[k].append(self.item_ref(mag["id"]))

        skills = []
        for key, s in self.skills.items():  # el orden del juego (PerkFactory), que agrupa por categoría
            e = self.entry.get(("skills", key))
            if not e:
                self.dropped["habilidades"].add(key)
                continue
            f = {"id": e["id"], "en": e["en"], "es": e["es"], "cat": {"id": s["cat"]["id"], **loc(s["cat"])},
                 "xp": s["xp"]}
            if "start" in s:
                f["start"] = s["start"]
            boosted = lambda coll, sec: sorted(  # noqa: E731
                ({**ref, "lvl": x["xpBoosts"][key]} for xid, x in coll.items() if x["xpBoosts"].get(key)
                 for ref in [self.trait_ref(xid, sec)] if ref), key=lambda r: r["id"])
            f.update({
                # La tabla completa, ya resuelta: la propia de la habilidad o la general de meta.json.
                "boost": s.get("boost") or self.boost_general,
                "books": sorted(books[key], key=lambda b: (b["from"] if b["from"] is not None else 99, b["item"]["id"])),
                "magazines": sorted(magazines[key], key=lambda r: r["id"]),
                # `shared`: alguna línea con XP también está en otra cinta y el juego la da una sola vez, así que `xp` es un máximo.
                # Los programas de TV (kind "tv") traen además cuándo salen: `day` de la partida y `start`/`end` en
                # minutos desde la medianoche, y `beforeStart` si terminan antes de que arranque la partida (ver build_tv).
                "media": [{"id": m["id"], **loc(m["name"]), "kind": m["kind"], "xp": m["xp"][key],
                           **({"shared": True} if m.get("shared") else {}),
                           **{k: m[k] for k in ("day", "start", "end", "beforeStart") if k in m}}
                          for m in self.media if key in m["xp"]],
                # Los que la suben (o la bajan: Enclenque es Fuerza −5) al crear el personaje, con cuánto.
                "traits": boosted(self.traits, "traits"),
                "professions": boosted(self.professions, "professions"),
            })
            skills.append(f)

        moodles = []
        for e in entries("moodles"):
            m = self.moodles[e["ref"][0]]
            levels = []
            for lv in m["levels"]:
                row = {"level": lv["level"], "name": loc(lv["name"])}
                if lv.get("desc"):
                    row["desc"] = loc(lv["desc"])
                levels.append(row)
            moodles.append({"id": e["id"], "en": e["en"], "es": e["es"], "icon": m["icon"], "levels": levels})

        return {"traits.json": traits, "professions.json": professions, "skills.json": skills, "moodles.json": moodles}

    @staticmethod
    def cats(rows, names):
        n = defaultdict(int)
        for r in rows:
            n[r["cat"]] += 1
        return {c: {**loc(names.get(c, {"en": c, "es": c})), "n": n[c]} for c in sorted(n)}

    @staticmethod
    def sharded(folder, fichas):
        # Todos siempre, aunque alguno quede vacío: el sitio los carga con un glob y así el mapa no cambia de forma.
        out = {f"{folder}/{i:02d}.json": {} for i in range(SHARDS)}
        for slug, f in fichas.items():  # en el orden del índice
            out[f"{folder}/{shard(slug)}.json"][slug] = f
        return out


def write(files, out=OUT):
    """
    Escribe sólo lo que cambió y borra los shards que ya no se usan. Devuelve {nombre: (crudo, gzip)}. `out` es la
    carpeta (data/site; loot.py lo usa igual para data/loot).
    """
    sizes = {}
    for name in sorted(files):
        body = dumps(files[name])
        path = os.path.join(out, *name.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path) or open(path, encoding="utf-8").read() != body:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(body)
        raw = body.encode("utf-8")
        sizes[name] = (len(raw), len(gzip.compress(raw, 9)))
    for old in glob.glob(os.path.join(out, "**", "*.json"), recursive=True):
        if os.path.relpath(old, out).replace(os.sep, "/") not in files:
            os.remove(old)
    return sizes


def main():
    # Como en extract.py: los avisos llevan tildes y tienen que llegar bien aunque se redirijan.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    s = Site()
    files = s.build()
    sizes = write(files)

    def kb(n):
        return f"{n / 1024:.0f}"

    items_n = len(files["items-list.json"]["rows"])
    recipes_n = len(files["recipes-list.json"]["rows"])
    print(f"Datos del sitio (data/site): {items_n} fichas de objeto y {recipes_n} de receta, en {SHARDS} archivos por pestaña")
    for name in ("items-list.json", "recipes-list.json", "traits.json", "professions.json", "skills.json", "moodles.json"):
        print(f"  {name}: {kb(sizes[name][0])}/{kb(sizes[name][1])} KB (crudo/gzip)")
    for folder in ("items", "recipes"):
        sh = [v for k, v in sizes.items() if k.startswith(folder + "/")]
        big = max(sh)
        print(f"  {folder}/NN.json: el más grande {kb(big[0])}/{kb(big[1])} KB, promedio "
              f"{kb(sum(x[0] for x in sh) / len(sh))}/{kb(sum(x[1] for x in sh) / len(sh))} KB")
    pages = [v for k, v in files.items() if k.startswith("patches/") and k != "patches/index.json"]
    print(f"  parches: {len(pages)} páginas ({sum(1 for p in pages if 'diff' in p)} con diff), "
          f"{s.changed_fichas} fichas con \"qué cambió\"")
    for what, ids in sorted(s.dropped.items()):
        print(f"  AVISO: {len(ids)} {what} nombrados sin ficha (quedaron sin enlace): {sorted(ids)[:10]}", file=sys.stderr)


if __name__ == "__main__":
    main()
