"""
Project Zomboid → la foto de cada versión y el diff contra la anterior (2026-10-01).

Lo llama `extract.py` antes de escribir sus archivos, con lo que ya armó en memoria (`files`, los mismos JSON que va a
escribir): no relee el juego. La foto guarda, por cada objeto, receta, rasgo, profesión, habilidad, moodle y opción de
sandbox, su nombre en/es (sólo para mostrar) y los campos que importan, aplanados (`stats.maxDamage`). El criterio es
"lo que la ficha muestra y le importa a quien juega": quedan afuera íconos, tooltips y modelos. Comparando la foto
nueva con la anterior sale "qué cambió" en la pestaña Parches y en cada ficha. Empieza en la 42.21: antes no hay fotos.

Escribe:

  games/zomboid/data/patches/snapshots/index.json        las fotos guardadas, de la más vieja a la más nueva:
                                                         [{id, version, build, recordedAt, seen?}]. `seen` son los
                                                         otros (versión, build) que se vieron con los mismos datos
                                                         (un hotfix sin cambios): [{version, build}]
  games/zomboid/data/patches/snapshots/<id>.json.gz      una foto por versión (~320 KB la 42.21). gzip determinista
                                                         (sin fecha ni nombre adentro): el mismo dato da los mismos
                                                         bytes y git no ve un cambio falso
  games/zomboid/data/patches/diffs/<slug>.json           el diff de cada foto contra la anterior: agregados, quitados y
                                                         cambiados campo por campo, cuántos y sus nombres

El id de la foto es la versión del juego ("42.21"); si un parche sale sin cambiar el número (otro build de Steam con
otros datos), "<versión>-b<build>". El slug de las direcciones cambia los puntos por guiones ("42-21").

Qué hace con cada extracción (`record`):
  - sin fotos guardadas: guarda la primera, sin diff;
  - los datos son iguales a los de la última foto: no escribe la foto. Si la versión o el build son otros (un hotfix
    que no tocó datos, o un parche sólo de Java que subió el número), los anota en `seen` de la última entrada: si
    después cambia el extractor, ese build ya es conocido y el cambio no sale publicado como parche;
  - misma versión y build que la última (o uno de sus `seen`), con datos distintos: no es un parche sino un cambio del
    extractor. Avisa por stderr y reemplaza sólo esa foto (con su fecha original). Los diffs guardados NO se tocan:
    cada uno se armó con un mismo extractor de los dos lados, y rehacerlo mezclaría el viejo con el nuevo (todo lo que
    arregló el extractor saldría como "cambios del parche"). El próximo parche se compara contra esta foto, hecha con
    el extractor nuevo: de igual a igual;
  - si no: foto nueva y su diff contra la última.

Por eso, si cambia extract.py: correlo ANTES de actualizar el juego en Steam y commiteá la foto rehecha.

Cuándo corta (SystemExit antes de escribir nada, ni acá ni en extract.py):
  - si un mismo campo cambia en 200 entidades o más y eso es al menos la mitad de las que lo tenían, o si se van (o
    llegan) 200 o más y son al menos la mitad de su tipo. Un parche de verdad casi nunca hace eso; un cambio de
    extract.py que ahora normaliza distinto un stat (o que empieza a incluir los objetos de debug), sí, y no puede
    publicarse como "cambios del parche". Si es un parche de verdad: PZ_ACEPTO_CAMBIOS_MASIVOS=1;
  - si el juego instalado está en una rama beta de Steam (`BetaKey` en el appmanifest, `branch_guard`): Vestigo sigue
    sólo la estable, y una foto de la beta quedaría como un parche que nunca salió. Si igual se quiere:
    PZ_ACEPTO_RAMA_BETA=1;
  - si la última foto es de otro `format`: compararlas daría cambios que no son del juego;
  - si el índice nombra una foto que no está, o se volvió a un build que ya tiene foto y no es la última.

Uso:
    python games/zomboid/tools/patches.py            lista las fotos guardadas y los diffs
    python games/zomboid/tools/patches.py rebuild    rehace todos los diffs de a pares consecutivos, sin el corte
                                                     (sirve si cambia `diff`; ojo: si alguna foto se rehízo con otro
                                                     extractor, su diff contra la anterior mezcla los dos)
    python games/zomboid/tools/patches.py news [--offline]
                                                     la Crónica: baja los anuncios de Steam (o usa la caché) y
                                                     escribe un borrador chronicle/<slug>.todo.json por versión
                                                     nueva; de las que ya tienen entrada, lista lo que les falta
    python games/zomboid/tools/patches.py check      controla chronicle/*.json (idiomas, fechas, fuentes y que no
                                                     copie 8 palabras seguidas de su anuncio); sale con 1 si falla
"""
import datetime
import gzip
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__))
from extract import APP_ID, DATA, GAME_DIR, dumps, moodle_name  # noqa: E402

PATCHES = os.path.join(DATA, "patches")
KINDS = ("items", "recipes", "traits", "professions", "skills", "moodles", "sandbox")
FORMAT = 1
KIND_ES = {"items": "objetos", "recipes": "recetas", "traits": "rasgos", "professions": "profesiones",
           "skills": "habilidades", "moodles": "moodles", "sandbox": "opciones de sandbox"}

SET_FIELDS = {  # listas en las que el orden no dice nada: se comparan como conjuntos (agregados / quitados)
    "tags", "categories", "bloodLocation", "clothingItemExtra", "spawnWith", "attachmentsProvided", "mountOn",
    "gunType", "replaceOnCooked", "fireModePossibilities", "teaches", "research", "opens", "books", "recipes",
    "grantedTraits", "exclusive", "traits", "inputs", "outputs", "stations",
}
SCALAR = (str, int, float, bool, type(None))

# Qué entra de cada tipo: lo que la ficha muestra y le importa a quien juega. Íconos, tooltips y modelos no: cambian
# sin que cambie el juego, y llenarían "qué cambió" de ruido.
ITEM_FIELDS = ("name", "type", "weight", "tags", "stats", "teaches", "research", "opens")
RECIPE_FIELDS = ("name", "kind", "category", "time", "skills", "xp", "stations", "learn")
TRAIT_FIELDS = ("name", "desc", "cost", "professionOnly", "disabledInMultiplayer", "xpBoosts", "recipes",
                "grantedTraits", "exclusive", "xpMult")
PROFESSION_FIELDS = ("name", "desc", "cost", "xpBoosts", "traits", "recipes")
SANDBOX_FIELDS = ("type", "default", "min", "max")


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


def slug(sid):
    """La versión en una dirección: los puntos pasan a guiones ("42.21" → "42-21", "42.22-b3" → "42-22-b3")."""
    return sid.replace(".", "-")


def pick(entry, fields):
    return {k: entry[k] for k in fields if k in entry}


def entry(src, name):
    return {"n": name, "f": flat(src, "", {})}


def snapshot(files, version, build, recorded_at):
    """
    La foto de una versión a partir de los `files` de extract.py (nombre de archivo → JSON en memoria). `sandbox` sólo
    está si `files` trae `server.json`: así una foto de antes de la pestaña Servidor no se compara contra una de después
    como "269 opciones nuevas" (`diff` saltea un tipo que falta en alguna de las dos).
    """
    kinds = {k: {} for k in KINDS if k != "sandbox"}
    for name in sorted(files):
        if name.startswith("items/") and name.endswith(".json"):
            for it in files[name]:
                src = pick(it, ITEM_FIELDS)
                if "displayCategory" in it:
                    src["cat"] = it["displayCategory"]
                kinds["items"][it["id"]] = entry(src, it["name"])
    for r in files.get("recipes.json", {}).get("recipes", []):
        src = pick(r, RECIPE_FIELDS)
        mappers = r.get("mappers", {})
        for key in ("inputs", "outputs"):
            if key in r:
                src[key] = [io_line(x, mappers) for x in r[key]]
        kinds["recipes"][r["id"]] = entry(src, r["name"])
    for t in files.get("traits.json", []):
        kinds["traits"][t["id"]] = entry(pick(t, TRAIT_FIELDS), t["name"])
    for p in files.get("professions.json", []):
        kinds["professions"][p["id"]] = entry(pick(p, PROFESSION_FIELDS), p["name"])
    for perk, s in files.get("skills.json", {}).items():
        name = {"en": s["en"], "es": s["es"]}
        src = {"name": name, "cat": s["cat"]["id"], "xp": s["xp"], **pick(s, ("boost", "start"))}
        kinds["skills"][perk] = entry(src, name)
    for m in files.get("moodles.json", []):
        en, es = moodle_name(m["id"])
        levels = {str(lv["level"]): {"name": lv["name"], "desc": lv["desc"]} for lv in m["levels"]}
        kinds["moodles"][m["id"]] = entry({"levels": levels}, {"en": en, "es": es})
    if "server.json" in files:
        kinds["sandbox"] = {}
        for o in files["server.json"]["options"]:
            src = pick(o, SANDBOX_FIELDS)
            if "values" in o:
                # Cuántas opciones tiene la lista, no sus textos: que un enum gane o pierda un valor sí es un cambio;
                # que se reescriba una etiqueta, no.
                src["n"] = len(o["values"])
            kinds["sandbox"][o["key"]] = entry(src, o["name"])
    snap = {"format": FORMAT, "id": version, "version": version, "build": build, "recordedAt": recorded_at,
            "kinds": kinds}
    # Ida y vuelta por JSON: la foto en memoria queda idéntica a la que se lee del disco (una tupla sería lista, las
    # claves serían texto), y comparar una recién armada con una guardada no da cambios falsos.
    return json.loads(canon(snap))


def canon(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def same(x, y):
    """Iguales en tipo y en valor: en Python `True == 1` y `2 == 2.0`, y para quien juega no es lo mismo."""
    if type(x) is not type(y):
        return False
    if isinstance(x, list):
        return len(x) == len(y) and all(same(p, q) for p, q in zip(x, y))
    return x == y


def diff_fields(a, b):
    """
    Los cambios entre los campos aplanados de una entidad en dos fotos, ordenados por campo:
      - {"f", "a"}: el campo es nuevo; {"f", "b"}: se fue; {"f", "b", "a"}: cambió;
      - una lista de SET_FIELDS: {"f", "add"?, "rem"?} (en el orden de cada foto, que ya viene ordenada);
      - otra lista de escalares del mismo largo: un cambio por posición ("xp.3"), para no mostrar diez números cuando
        cambió uno. Con otro largo va entera.
    """
    out = []
    for k in sorted(set(a) | set(b)):
        if k not in b:
            out.append({"f": k, "b": a[k]})
            continue
        if k not in a:
            out.append({"f": k, "a": b[k]})
            continue
        x, y = a[k], b[k]
        if same(x, y):
            continue
        if isinstance(x, list) and isinstance(y, list):
            if k.rsplit(".", 1)[-1] in SET_FIELDS:
                kx, ky = {(type(v).__name__, v) for v in x}, {(type(v).__name__, v) for v in y}
                add = [v for v in y if (type(v).__name__, v) not in kx]
                rem = [v for v in x if (type(v).__name__, v) not in ky]
                ch = {"f": k}
                if add:
                    ch["add"] = add
                if rem:
                    ch["rem"] = rem
                if add or rem:
                    out.append(ch)
                continue
            if len(x) == len(y):
                out += [{"f": f"{k}.{i}", "b": p, "a": q} for i, (p, q) in enumerate(zip(x, y)) if not same(p, q)]
                continue
        out.append({"f": k, "b": x, "a": y})
    return out


def diff(old, new):
    """
    `{from, to, kinds, counts, names}` entre dos fotos. Un tipo sin cambios no aparece; uno que falta en alguna de las
    dos fotos no se compara. `names[kind]` lleva el nombre en/es de cada id nombrado: de la foto nueva, o de la vieja si
    se quitó (la página del parche lo muestra aunque ya no tenga ficha).
    """
    kinds, counts, names = {}, {}, {}
    for kind in KINDS:
        if kind not in old["kinds"] or kind not in new["kinds"]:
            continue
        o, n = old["kinds"][kind], new["kinds"][kind]
        added = sorted(set(n) - set(o))
        removed = sorted(set(o) - set(n))
        changed = {}
        for i in sorted(set(o) & set(n)):
            ch = diff_fields(o[i]["f"], n[i]["f"])
            if ch:
                changed[i] = ch
        if not (added or removed or changed):
            continue
        kinds[kind] = {"added": added, "removed": removed, "changed": changed}
        counts[kind] = {"added": len(added), "removed": len(removed), "changed": len(changed)}
        names[kind] = {i: (n[i] if i in n else o[i])["n"] for i in sorted(added + removed + list(changed))}
    return {"from": old["id"], "to": new["id"], "kinds": kinds, "counts": counts, "names": names}


def suspicious(d, old, min_n=200, share=0.5):
    """
    Los avisos de un diff que parece un cambio del extractor y no del juego: un campo que cambia en `min_n` entidades o
    más y en al menos `share` de las que lo tenían en la foto vieja, o `min_n` o más quitadas (o agregadas) que son al
    menos `share` de su tipo. Un parche que retoca el daño de todas las armas pasa (son ~300 de ~1.200 con daño); un
    extract.py que ahora redondea distinto los pesos, o que empieza a incluir los objetos de debug, no.
    """
    out = []
    for kind, k in d["kinds"].items():
        prev = old["kinds"].get(kind, {})
        by_f = Counter(f for ch in k["changed"].values() for f in {c["f"] for c in ch})
        for f, n in sorted(by_f.items()):
            parent = f.rsplit(".", 1)[0]
            # "xp.3" es la posición 3 de la lista "xp": la tenían los que tenían la lista.
            have = sum(1 for e in prev.values()
                       if f in e["f"] or (parent != f and isinstance(e["f"].get(parent), list)))
            if n >= min_n and n >= share * have:
                # Con `have` 0 el campo no existía: "de 0 que lo tenían" no le dice nada a quien lee el corte.
                out.append(f"Campo nuevo {f} en {n} {KIND_ES[kind]}" if have == 0 else
                           f"Cambian {n} {KIND_ES[kind]} en {f} (de {have} que lo tenían en la {old['id']})")
        gone, came = len(k["removed"]), len(k["added"])
        if gone >= min_n and gone >= share * len(prev):
            out.append(f"Se van {gone} {KIND_ES[kind]} de {len(prev)} que tenía la {old['id']}")
        if came >= min_n and came >= share * len(prev):
            out.append(f"Llegan {came} {KIND_ES[kind]} nuevos, contra {len(prev)} que tenía la {old['id']}")
    return out


def gz_bytes(snap):
    """La foto comprimida, determinista: sin fecha (`mtime=0`) ni nombre de archivo en la cabecera del gzip."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0, filename="") as g:
        g.write(canon(snap).encode("utf-8"))
    return buf.getvalue()


def write_bytes(path, body):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with open(path, "rb") as f:
            if f.read() == body:
                return
    with open(path, "wb") as f:
        f.write(body)


def write_json(path, data):
    """Como en extract.py: `dumps` compacto, `\\n` de fin de línea, y sólo si cambió (así git no ve nada)."""
    body = dumps(data)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if f.read() == body:
                return
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)


def snap_path(root, sid):
    return os.path.join(root, "snapshots", f"{sid}.json.gz")


def diff_path(root, sid):
    return os.path.join(root, "diffs", f"{slug(sid)}.json")


def read_snapshot(root, sid):
    path = snap_path(root, sid)
    if not os.path.exists(path):
        # Sin esto sale un traceback de gzip que no dice qué pasó: el índice y la carpeta se desincronizaron (un .gz
        # que no se commiteó, o uno borrado a mano).
        raise SystemExit(f"El índice de fotos nombra la {sid}, pero no está {path}. No se escribió nada: recuperala de "
                         "git o sacala de data/patches/snapshots/index.json.")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def snapshots_index(root):
    """[{id, version, build, recordedAt, seen?}], de la más vieja a la más nueva; [] si todavía no hay fotos."""
    path = os.path.join(root, "snapshots", "index.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def index_entry(snap):
    return {"id": snap["id"], "version": snap["version"], "build": snap["build"], "recordedAt": snap["recordedAt"]}


def seen_builds(e):
    """Los (versión, build) con los que se vieron los datos de una entrada del índice: el suyo y los de `seen`."""
    return [(e["version"], e["build"])] + [(x["version"], x["build"]) for x in e.get("seen", [])]


def cut(warnings, accept):
    """El corte por cambio masivo: va antes de escribir nada, para no dejar la foto sin su diff (ni los datos a medias)."""
    if warnings and not accept:
        raise SystemExit(
            "; ".join(warnings) + ". Si es un parche de verdad, corré de nuevo con PZ_ACEPTO_CAMBIOS_MASIVOS=1; si es "
            "un cambio de extract.py, revisalo antes. No se escribió nada.")


def steam_branch(path=None):
    """
    La rama de Steam del juego instalado, leída del `BetaKey` del appmanifest (steamapps/appmanifest_108600.acf, dos
    carpetas arriba del juego): "" en la estable (sin `BetaKey`, vacío o "public"), el nombre de la beta ("unstable")
    si no, y None si no hay appmanifest (una copia fuera de Steam: no hay rama que mirar). Steam lo anota en
    `UserConfig` (la rama elegida) y en `MountedConfig` (la instalada): alcanza con que uno sea una beta, porque si se
    eligió la beta Steam la baja en la próxima actualización.
    """
    path = path or os.path.join(GAME_DIR, "..", "..", f"appmanifest_{APP_ID}.acf")
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    for key in re.findall(r'"BetaKey"\s+"([^"]*)"', text, flags=re.IGNORECASE):
        if key.strip() and key.strip().lower() != "public":
            return key.strip()
    return ""


def branch_guard(branch, accept=False):
    """
    Corta si el juego está en una beta. Vestigo sigue sólo la rama estable: una foto de la "unstable" quedaría en el
    historial como un parche que nunca salió, y cuando la beta pase a estable saldría otra foto con el diff beta →
    estable en vez de estable → estable. Va antes de escribir nada (tampoco los datos del sitio: también son de la beta).
    """
    if branch and not accept:
        raise SystemExit(
            f"El juego instalado está en la rama beta «{branch}» de Steam (BetaKey en appmanifest_{APP_ID}.acf), y "
            "Vestigo sigue sólo la estable. No se extrajo nada ni se grabó la foto. Volvé a la estable (Steam → "
            "Project Zomboid → Propiedades → Betas → Ninguna) y corré de nuevo; si de verdad querés extraer la beta, "
            "PZ_ACEPTO_RAMA_BETA=1.")


def record(files, version, build, today, root=PATCHES, accept=False):
    """
    Guarda la foto de esta extracción y su diff contra la última. Devuelve ("nueva" | "igual" | "rehecha", id). Ver el
    docstring del módulo para cada caso.
    """
    snap = snapshot(files, version, build, today)
    index = os.path.join(root, "snapshots", "index.json")
    idx = snapshots_index(root)
    if not idx:
        write_bytes(snap_path(root, version), gz_bytes(snap))
        write_json(index, [index_entry(snap)])
        return "nueva", version

    last_e = idx[-1]
    last = read_snapshot(root, last_e["id"])
    if last.get("format") != FORMAT:
        # Con otro formato las dos fotos no aplanan igual: el diff saldría lleno de cambios que no son del juego.
        raise SystemExit(
            f"La última foto ({last_e['id']}) es de formato {last.get('format')} y este patches.py arma el {FORMAT}: "
            "compararlas daría cambios que no son del juego. No se escribió nada: pasá las fotos guardadas al formato "
            "nuevo antes de extraer.")
    here = (version, build)
    if canon(snap["kinds"]) == canon(last["kinds"]):
        if here not in seen_builds(last_e):
            # Un hotfix que no tocó datos (o un parche sólo de Java que subió el número): la foto no cambia, pero el
            # build queda anotado. Si no, cuando después cambie el extractor, este build parecería un parche nuevo y
            # el ruido del extractor saldría publicado como "qué cambió".
            seen = last_e.get("seen", []) + [{"version": version, "build": build}]
            write_json(index, idx[:-1] + [{**last_e, "seen": seen}])
        return "igual", last_e["id"]

    if here in seen_builds(last_e):
        # El juego es el mismo y los datos no: cambió el extractor. Se reemplaza sólo la foto, con la cabecera que ya
        # tenía (la fecha en que se grabó la versión, que es la del parche). Los diffs guardados no se tocan: cada uno
        # se armó con un mismo extractor de los dos lados, y rehacer el de esta foto contra la anterior (grabada con el
        # extractor viejo) publicaría como parche todo lo que arregló el extractor. Así el próximo parche se compara
        # contra una foto hecha con el mismo extractor que la suya.
        sid = last_e["id"]
        snap.update(id=sid, version=last_e["version"], build=last_e["build"], recordedAt=last_e["recordedAt"])
        print(f"AVISO: la foto {sid} (versión {version}, build {build}) cambió sin que cambie el juego: es un cambio "
              f"del extractor. Reemplazo sólo la foto, con su fecha original ({last_e['recordedAt']}); los diffs "
              "guardados quedan como estaban (cada uno compara fotos de un mismo extractor) y el próximo parche se "
              "compara contra esta foto. Commiteá el .json.gz rehecho antes de actualizar el juego en Steam.",
              file=sys.stderr)
        write_bytes(snap_path(root, sid), gz_bytes(snap))
        return "rehecha", sid

    old = next((e["id"] for e in idx[:-1] if here in seen_builds(e)), None) if build is not None else None
    if old:
        raise SystemExit(
            f"La versión {version} build {build} ya se grabó en la foto {old}, y no es la última ({last_e['id']}): "
            "¿se volvió a un build viejo? No se escribió nada: revisá data/patches/snapshots/index.json.")
    # Un parche que no cambia el número (otro build con otros datos) lleva el build en el id. Fuera de Steam no hay
    # build: va la fecha.
    if any(e["version"] == version for e in idx):
        sid = f"{version}-b{build}" if build is not None else f"{version}-{today}"
    else:
        sid = version
    if any(e["id"] == sid for e in idx):
        raise SystemExit(
            f"Ya hay una foto {sid} y no es la última ({last_e['id']}): ¿se volvió a un build viejo? No se escribió "
            "nada: revisá data/patches/snapshots/index.json.")
    snap["id"] = sid
    d = diff(last, snap)
    cut(suspicious(d, last), accept)
    write_json(diff_path(root, sid), d)
    write_bytes(snap_path(root, sid), gz_bytes(snap))
    write_json(index, idx + [index_entry(snap)])
    return "nueva", sid


def report(estado, sid, root=PATCHES):
    """La línea del informe de extract.py: el estado de la foto y, si esta corrida escribió un diff, sus cantidades."""
    line = f"Parches: foto {estado} {sid}"
    path = diff_path(root, sid)
    # Sólo "nueva" escribe un diff: el de una "rehecha" es el que ya estaba, y nombrarlo acá haría creer que se rehízo.
    if estado == "nueva" and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        line += f" · diff contra la {d['from']}: {json.dumps(d['counts'], ensure_ascii=False)}"
    return line


def rebuild(root=PATCHES):
    """
    Rehace todos los diffs de a pares consecutivos, sin el corte (las fotos ya se aceptaron), y borra los que sobran.
    Sirve si cambia `diff`. Ojo: si una foto se rehízo con otro extractor ("rehecha"), su diff contra la anterior
    compara dos extractores; `record` nunca lo rehace por eso, y acá sólo se corre a sabiendas.
    """
    idx = snapshots_index(root)
    keep = set()
    for a, b in zip(idx, idx[1:]):
        d = diff(read_snapshot(root, a["id"]), read_snapshot(root, b["id"]))
        write_json(diff_path(root, b["id"]), d)
        keep.add(os.path.basename(diff_path(root, b["id"])))
    folder = os.path.join(root, "diffs")
    if os.path.isdir(folder):
        for name in os.listdir(folder):
            if name.endswith(".json") and name not in keep:
                os.remove(os.path.join(folder, name))
    return sorted(keep)


# ---- La Crónica (2026-10-02) ----
#
# Los anuncios oficiales de Steam dan la fecha, la rama y el link de cada versión; el texto de la Crónica lo escribimos
# nosotros (las notas son de The Indie Stone). `news` arma un borrador `.todo.json` por versión nueva con todo lo
# automático y los textos vacíos; `check` controla las entradas escritas y corta si alguna copia 8 palabras seguidas de
# su fuente.

FEED = ("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=108600&count=200&maxlength=0"
        "&feeds=steam_community_announcements")
UA = "Vestigo (vestigo.gg) zomboid patch notes"
FIRST = (42, 20)  # la Crónica arranca en el Build 42 estable
ALLOWED_HOSTS = {"store.steampowered.com", "theindiestone.com", "projectzomboid.com"}
CHRONICLE = "chronicle"
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
VERSION_RE = re.compile(r"\b4[2-9]\.\d+(?:\.\d+)?\b")  # el 41 (legacy) queda afuera
NOTES_RE = re.compile(r"https?://(?:www\.)?theindiestone\.com/forums/topic/[^\s\[\]\"'<>]+", re.IGNORECASE)
BBCODE_RE = re.compile(r"\[/?[a-z*][^\]]*\]", re.IGNORECASE)


def title_versions(title):
    """
    Las versiones de un título de Steam con su rama: [(versión, "stable" | "unstable")]. Un título puede traer varias
    ("42.20.4 STABLE & 42.19.2 UNSTABLE & 41.78.21 LEGACY"): se parte por `&` y `+`, y cada parte dice su rama. Sin
    STABLE, UNSTABLE ni BETA (un blog que nombra la versión) se descarta. `\\b` hace que UNSTABLE no cuente como STABLE.
    """
    out = []
    for part in re.split(r"[&+]", title):
        if re.search(r"\b(?:UNSTABLE|BETA)\b", part, re.IGNORECASE):
            branch = "unstable"
        elif re.search(r"\bSTABLE\b", part, re.IGNORECASE):
            branch = "stable"
        else:
            continue
        for v in VERSION_RE.findall(part):
            # "42.20.0" es la 42.20: así la llama game_version() y así se llama su foto.
            if v.count(".") == 2 and v.endswith(".0"):
                v = v[:-2]
            if (v, branch) not in out:
                out.append((v, branch))
    return out


def parent(version):
    """La versión de la que es hotfix: "42.20.4" → "42.20"; "42.21" → "42.21"."""
    return ".".join(version.split(".")[:2])


def vtuple(version):
    return tuple(int(x) for x in version.split("."))


def steam_url(gid):
    return f"https://store.steampowered.com/news/app/{APP_ID}/view/{gid}"


def notes_url(contents):
    """El primer link a un tema del foro de TIS (las notas completas); los del índice del foro no cuentan."""
    m = NOTES_RE.search(contents or "")
    return "https://" + m.group(0).split("://", 1)[1] if m else None


def utc_date(epoch):
    return datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc).date().isoformat()


def empty_loc():
    return {"en": "", "es": ""}


def steam_source(it):
    return {"kind": "steam", "url": steam_url(it["gid"]), "gid": str(it["gid"])}


def stub(version, rows):
    """El borrador de una versión a partir de sus anuncios [(versión, rama, anuncio)]: lo automático y textos vacíos."""
    main = sorted((r for r in rows if r[0] == version), key=lambda r: r[2]["date"])
    hot = [r for r in rows if r[0] != version]
    stable = [r for r in main if r[1] == "stable"]
    unstable = [r for r in main if r[1] == "unstable"]
    first = (stable or unstable or sorted(hot, key=lambda r: r[2]["date"]))[0]
    out = {"slug": slug(version), "version": version, "branch": "stable" if stable else first[1],
           "date": utc_date(first[2]["date"])}
    if unstable:
        out["unstableDate"] = utc_date(unstable[0][2]["date"])
    out.update(title=empty_loc(), summary=empty_loc(), highlights=[])
    fixes = []
    for v in sorted({r[0] for r in hot}, key=vtuple):
        mine = sorted((r for r in hot if r[0] == v), key=lambda r: (r[1] != "stable", r[2]["date"]))
        it = mine[0][2]
        src = [steam_source(it)]
        if notes_url(it.get("contents")):
            src.append({"kind": "notes", "url": notes_url(it["contents"])})
        fixes.append({"version": v, "date": utc_date(it["date"]), "summary": empty_loc(), "sources": src})
    if fixes:
        out["hotfixes"] = fixes
    sources = []
    for _, _, it in main:
        if all(s.get("gid") != str(it["gid"]) for s in sources):
            sources.append(steam_source(it))
    for _, _, it in main:
        url = notes_url(it.get("contents"))
        if url and all(s["url"] != url for s in sources):
            sources.append({"kind": "notes", "url": url})
    out["sources"] = sources
    out["updated"] = ""
    return out


def all_stubs(items):
    groups = {}
    for it in items:
        for v, branch in title_versions(it.get("title", "")):
            p = parent(v)
            if vtuple(p)[:2] >= FIRST:
                groups.setdefault(p, []).append((v, branch, it))
    return {slug(p): stub(p, rows) for p, rows in sorted(groups.items(), key=lambda kv: vtuple(kv[0]))}


def news_stubs(items, have):
    """slug → borrador, sólo de las versiones (≥ FIRST, agrupadas por `parent`) que no están en `have`."""
    return {s: b for s, b in all_stubs(items).items() if s not in have}


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


def plain(contents):
    """El texto de un anuncio sin las marcas BBCode ([b], [list], [url=…]): si no, una marca cortaría una tira copiada."""
    return BBCODE_RE.sub(" ", contents)


def valid_date(s):
    if not isinstance(s, str) or not DATE_RE.fullmatch(s):
        return False
    try:
        datetime.date.fromisoformat(s)
    except ValueError:
        return False
    return True


def loc_problems(value, field):
    if not isinstance(value, dict):
        return [f"falta {field} ({{en, es}})"]
    return [f"{field}.{lang} vacío" for lang in ("en", "es")
            if not isinstance(value.get(lang), str) or not value[lang].strip()]


def source_problems(sources, field):
    out = []
    for i, s in enumerate(sources):
        url = s.get("url") if isinstance(s, dict) else None
        parsed = urllib.parse.urlsplit(url) if isinstance(url, str) else None
        if not parsed or parsed.scheme != "https" or (parsed.hostname or "").lower().removeprefix("www.") \
                not in ALLOWED_HOSTS:
            out.append(f"{field}[{i}]: la URL {url!r} no es https:// de {', '.join(sorted(ALLOWED_HOSTS))}")
    return out


def entry_gids(e):
    """Los `gid` de Steam de una entrada (los suyos y los de sus hotfixes), sin repetir y en orden."""
    hotfixes = [h for h in e.get("hotfixes", []) if isinstance(h, dict)] if isinstance(e.get("hotfixes"), list) else []
    sources = e.get("sources") if isinstance(e.get("sources"), list) else []
    srcs = sources + [s for h in hotfixes for s in (h.get("sources") if isinstance(h.get("sources"), list) else [])]
    return list(dict.fromkeys(s["gid"] for s in srcs if isinstance(s, dict) and s.get("gid")))


def uncached(root=PATCHES):
    """
    Los `gid` de la Crónica sin su `.cache/<gid>.txt`: el control de copia no los mira. La caché está fuera de git, así
    que en un clon limpio son todos; `check` lo avisa para que "0 problemas" no se lea como "copia controlada".
    """
    folder = os.path.join(root, CHRONICLE)
    out = []
    if not os.path.isdir(folder):
        return out
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json") or name.endswith(".todo.json"):
            continue
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                e = json.load(f)
        except ValueError:
            continue  # `check` ya lo cuenta como problema
        if isinstance(e, dict):
            out += [g for g in entry_gids(e) if not os.path.exists(os.path.join(root, ".cache", f"{g}.txt"))]
    return list(dict.fromkeys(out))


def entry_problems(e, name, root):
    """Los problemas de una entrada de la Crónica (`name` es el archivo, para comparar con el slug)."""
    if not isinstance(e, dict):
        return ["no es un objeto JSON"]
    out = []
    version = e.get("version")
    if not isinstance(version, str) or e.get("slug") != slug(version):
        out.append(f"slug {e.get('slug')!r} no es el de la versión {version!r}")
    elif name != e["slug"]:
        out.append(f"slug {e['slug']!r} no es el nombre del archivo")
    for field in ("date", "unstableDate", "updated"):
        if (field != "unstableDate" or field in e) and not valid_date(e.get(field)):
            out.append(f"{field} {e.get(field)!r} no es YYYY-MM-DD")
    if e.get("branch") not in ("stable", "unstable"):
        out.append(f"branch {e.get('branch')!r} no es stable ni unstable")
    out += loc_problems(e.get("title"), "title")
    out += loc_problems(e.get("summary"), "summary")
    highlights = e.get("highlights", [])
    if not isinstance(highlights, list) or len(highlights) > 8:
        out.append("highlights tiene que ser una lista de 0 a 8")
        highlights = []
    for i, h in enumerate(highlights):
        out += loc_problems(h, f"highlights[{i}]")
    hotfixes = e.get("hotfixes", [])
    if not isinstance(hotfixes, list):
        out.append("hotfixes tiene que ser una lista")
        hotfixes = []
    for i, h in enumerate(hotfixes):
        if not isinstance(h, dict):
            out.append(f"hotfixes[{i}] no es un objeto")
            continue
        if not isinstance(h.get("version"), str) or not h["version"].startswith(f"{version}."):
            out.append(f"hotfixes[{i}].version {h.get('version')!r} no es un hotfix de la {version}")
        if not valid_date(h.get("date")):
            out.append(f"hotfixes[{i}].date {h.get('date')!r} no es YYYY-MM-DD")
        out += loc_problems(h.get("summary"), f"hotfixes[{i}].summary")
        out += source_problems(h.get("sources", []), f"hotfixes[{i}].sources")
    sources = e.get("sources")
    if not isinstance(sources, list) or not sources:
        out.append("sin sources: sin fuente no hay entrada")
        sources = []
    out += source_problems(sources, "sources")

    # El control de copia: cada texto nuestro en inglés contra el texto guardado de cada fuente de Steam (las notas
    # del foro no se bajan). Campo por campo, para que una tira no salga de pegar el final de uno con el principio
    # del otro.
    hotfixes = [h for h in hotfixes if isinstance(h, dict)]
    ours = [e.get("title"), e.get("summary")] + highlights + [h.get("summary") for h in hotfixes]
    ours = [x["en"] for x in ours if isinstance(x, dict) and isinstance(x.get("en"), str)]
    for gid in entry_gids(e):
        path = os.path.join(root, ".cache", f"{gid}.txt")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            theirs = plain(f.read())
        runs = [r for text in ours for r in copied_runs(text, theirs)]
        if runs:
            out.append(f"copiado del anuncio {gid}: " + " · ".join(f"«{r}»" for r in dict.fromkeys(runs)))
    return out


def check(root=PATCHES):
    """(problemas, pendientes): cada falla de `chronicle/*.json` y los `.todo.json` que faltan escribir."""
    folder = os.path.join(root, CHRONICLE)
    problems, todo = [], []
    if not os.path.isdir(folder):
        return problems, todo
    for name in sorted(os.listdir(folder)):
        if name.endswith(".todo.json"):
            todo.append(name)
            continue
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                e = json.load(f)
        except ValueError as err:
            problems.append(f"{name}: no es JSON válido ({err})")
            continue
        problems += [f"{name}: {p}" for p in entry_problems(e, name[:-len(".json")], root)]
    return problems, todo


def fetch_news(root=PATCHES, offline=False):
    """
    Los anuncios de Steam (una sola petición, sin reintentos: un 429 o un 5xx corta con un mensaje) o, con `offline`,
    los de la última bajada. Guarda `news.json` y el `contents` de cada anuncio en `<gid>.txt` (lo lee `check`).
    """
    cache = os.path.join(root, ".cache")
    path = os.path.join(cache, "news.json")
    if offline:
        if not os.path.exists(path):
            raise SystemExit(f"No hay caché de anuncios en {path}: corré `patches.py news` sin --offline.")
        with open(path, encoding="utf-8") as f:
            items = json.load(f)
    else:
        req = urllib.request.Request(FEED, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                items = json.load(r)["appnews"]["newsitems"]
        except urllib.error.HTTPError as err:
            raise SystemExit(f"Steam respondió {err.code} a la lista de anuncios. No se reintenta: probá más tarde, o "
                             "usá --offline con la última bajada.")
        except (urllib.error.URLError, TimeoutError) as err:
            raise SystemExit(f"No se pudo bajar la lista de anuncios de Steam ({err}). Probá más tarde, o usá --offline.")
        os.makedirs(cache, exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(items, f, ensure_ascii=False)
    os.makedirs(cache, exist_ok=True)
    for it in items:
        txt = os.path.join(cache, f"{it['gid']}.txt")
        body = it.get("contents") or ""
        if os.path.exists(txt):
            with open(txt, encoding="utf-8", newline="") as f:
                if f.read() == body:
                    continue
        with open(txt, "w", encoding="utf-8", newline="") as f:
            f.write(body)
    return items


def missing(entry_, stub_):
    """Lo que el borrador tiene y la entrada escrita no: hotfixes y fuentes nuevas, o que ya salió en estable."""
    out = []
    if stub_["branch"] == "stable" and entry_.get("branch") == "unstable":
        out.append(f"ya salió en estable el {stub_['date']}: pasá `date` y `branch` a la estable y la del unstable a "
                   "`unstableDate`")
    have_fix = {h.get("version") for h in entry_.get("hotfixes", [])}
    for h in stub_.get("hotfixes", []):
        if h["version"] not in have_fix:
            out.append(f"falta el hotfix {h['version']} ({h['date']}): {h['sources'][0]['url']}")
    have_src = {s.get("url") for s in entry_.get("sources", [])}
    for s in stub_["sources"]:
        if s["url"] not in have_src:
            out.append(f"falta la fuente {s['kind']}: {s['url']}")
    return out


def news(root=PATCHES, offline=False):
    """
    Escribe `chronicle/<slug>.todo.json` para cada versión sin entrada (un borrador que ya está no se pisa: puede
    tener texto a medio escribir) e imprime lo que les falta a las entradas que ya existen.
    """
    items = fetch_news(root, offline)
    folder = os.path.join(root, CHRONICLE)
    os.makedirs(folder, exist_ok=True)
    entries = {}
    for name in sorted(os.listdir(folder)):
        if name.endswith(".json") and not name.endswith(".todo.json"):
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                entries[name[:-len(".json")]] = json.load(f)
    stubs = all_stubs(items)
    for s, b in news_stubs(items, set(entries)).items():
        path = os.path.join(folder, f"{s}.todo.json")
        if os.path.exists(path):
            print(f"{s}: ya hay un borrador ({os.path.basename(path)}); no lo piso")
            continue
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(b, ensure_ascii=False, indent=1) + "\n")
        fixes = len(b.get("hotfixes", []))
        print(f"{s}: borrador nuevo ({b['branch']}, {b['date']}, {fixes} hotfix{'es' if fixes != 1 else ''})")
    for s, e in entries.items():
        if s in stubs:
            for line in missing(e, stubs[s]):
                print(f"{s}: {line}")
    return stubs


def main(argv):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    cmd = argv[0] if argv else None
    if cmd == "rebuild":
        written = rebuild()
        print(f"Diffs rehechos: {len(written)} {written}")
        return
    if cmd == "news":
        news(offline="--offline" in argv[1:])
        return
    if cmd == "check":
        problems, todo = check()
        for p in problems:
            print(f"PROBLEMA {p}")
        for t in todo:
            print(f"pendiente {t}")
        missing = uncached()
        if missing:
            print(f"aviso: sin caché, no se controló la copia de {len(missing)} anuncio(s) ({', '.join(missing)}): "
                  "correr `patches.py news` para bajarlos")
        print(f"Crónica: {len(problems)} problema(s), {len(todo)} pendiente(s)")
        if problems:
            raise SystemExit(1)
        return
    if cmd is not None:
        raise SystemExit(f"No conozco el comando {cmd!r}: los que hay son `rebuild`, `news [--offline]`, `check` o "
                         "ninguno (listar).")
    idx = snapshots_index(PATCHES)
    print(f"Fotos guardadas: {len(idx)}")
    for e in idx:
        size = os.path.getsize(snap_path(PATCHES, e["id"]))
        line = f"  {e['id']}: versión {e['version']}, build {e['build']}, {e['recordedAt']}, {size / 1024:.0f} KB"
        if e.get("seen"):
            line += " · mismos datos en " + ", ".join(f"{x['version']} build {x['build']}" for x in e["seen"])
        if os.path.exists(diff_path(PATCHES, e["id"])):
            with open(diff_path(PATCHES, e["id"]), encoding="utf-8") as f:
                d = json.load(f)
            line += f" · diff contra la {d['from']}: {json.dumps(d['counts'], ensure_ascii=False)}"
        print(line)


if __name__ == "__main__":
    main(sys.argv[1:])
