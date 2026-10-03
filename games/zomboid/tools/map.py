"""
Project Zomboid (Build 42) → el mapa del sitio (2026-09-30).

Lee la instalación del juego (sólo lectura) y escribe:

  site/public/zomboid/map/sat/{z}/{x}_{y}.webp     la vista cenital del mundo (pyramid.zip)
  site/public/zomboid/map/forest/{z}/{x}_{y}.webp  la mancha del bosque del mapa de papel (forest.pyramid.zip)
  site/public/zomboid/map/stamps/map_*.png         los sellos con que el juego anota los mapas (blancos: se tiñen)
  games/zomboid/data/map/tiles.json      cómo pedir las teselas (zooms, límites, qué nivel es cuál)
  games/zomboid/data/map/vector.json     el mapa de papel: edificios por tipo, rutas por clase, agua, vías…
  games/zomboid/data/map/streets.json    las calles con nombre
  games/zomboid/data/map/labels.json     los textos del mapa (worldmap-annotations.lua) y los pueblos
  games/zomboid/data/map/zones.json      las zonas de objects.lua útiles como capa (autos, forrajeo, sótanos…)
  games/zomboid/data/map/spawns.json     dónde aparece cada profesión
  games/zomboid/data/map/buildings.json  cada edificio con sus pisos y sus habitaciones (de los .lotheader)
  games/zomboid/data/map/stashes.json    los mapas anotados (escondites): dónde, qué dibujan y qué esconden
  games/zomboid/data/map/web/**          los mismos datos partidos para el visor del sitio: una grilla de regiones de
                                         1.500 casillas (regions/, zones/, bld/), lo común (common.json) y el buscador (search.json)
  games/zomboid/data/map/web/zombies.bin  la densidad de zombis por chunk de 8×8 (de los .lotheader), comprimida
  games/zomboid/data/map/meta.json       { extractedAt, dataHash } de los JSON de arriba (y de web/): la fecha sólo se
                                         mueve si cambia el hash (es el `lastmod` de la pestaña Mapa en el sitemap)

Uso (una vez por parche, en la PC que tiene el juego):
    python games/zomboid/tools/map.py                 todo
    python games/zomboid/tools/map.py --sin-teselas   sólo los JSON y los sellos (las teselas tardan)
    python games/zomboid/tools/map.py --prueba DIR    además, una imagen de control en DIR

La instalación se busca en la ruta de Steam de siempre; otra se indica con PZ_DIR.

Las coordenadas de todos los JSON son casillas del mundo (x hacia el este, y hacia
el sur), enteras. Cada archivo del juego las guarda a su manera y acá se pasan todas
a la misma:
  worldmap.xml     por celda de 300×300:  mundo = celda·300 + punto
  *.lotheader      por celda de 256×256:  mundo = celda·256 + punto   (la celda sale del nombre, "41_37")
  pyramid.zip      nivel 0 = 1 píxel por casilla desde (0, 0):  mundo = píxel · 2^nivel
  el resto (objects.lua, streets.xml, anotaciones, escondites, spawns) ya viene en casillas del mundo.
"""
import argparse, datetime, glob, gzip, hashlib, io, json, math, os, re, shutil, struct, sys, zipfile, zlib
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

from extract import _constant_pool  # lee el pool de constantes de un .class del .jar

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PZ_DIR = os.environ.get("PZ_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid")
MAPS = os.path.join(PZ_DIR, "media", "maps")
# Todas las ciudades comparten el mismo mundo: los datos están en la carpeta de Muldraugh
# (las otras carpetas sólo traen su spawnpoints.lua y dicen `lots=Muldraugh, KY`).
WORLD = os.path.join(MAPS, "Muldraugh, KY")
LUA = os.path.join(PZ_DIR, "media", "lua")
TRANSLATE = os.path.join(LUA, "shared", "Translate")

PUBLIC = os.path.join(ROOT, "site", "public", "zomboid", "map")
DATA = os.path.join(ROOT, "games", "zomboid", "data", "map")
WEB = os.path.join(DATA, "web")

# El español de los textos del juego. El juego trae ES (España), ES_MX y ES_CL; el
# sitio usa el de Latinoamérica, como en Diablo II (ES_MX además tiene exactamente las
# mismas claves que EN, sin sobrantes).
ES = "ES_MX"

TILE = 256
WORLDMAP_CELL = 300
LOT_CELL = 256
# La densidad de zombis del .lotheader: un byte por chunk de 8×8 casillas, 32×32 chunks por celda de 256.
DENSITY_CHUNK = 8
DENSITY_SIDE = LOT_CELL // DENSITY_CHUNK

# El nivel 0 de pyramid.zip es 1 píxel por casilla y mezcla colores planos con un
# tramado de un píxel (pasto, bosque): con pérdida, WebP le promedia el color a cada
# bloque (4:2:0), las paredes rojas de 1 casilla se lavan y encima el archivo sale el
# doble de pesado (probado el 30/9: 39,7 MB con calidad 85 contra 20,3 MB sin pérdida).
# De ahí para arriba cada píxel ya es un promedio de 2×2 o más, el tramado se suaviza y
# con pérdida pesa entre 2,4 y 7 veces menos sin que se note al verlo a su escala.
LOSSY_QUALITY = 85
LOSSLESS_LEVELS = {0}
# El bosque del mapa de papel es una máscara: en el juego se tiñe de este color.
FOREST_RGB = (189, 197, 163)
# Del bosque no se publica el nivel 0 (2,8 MB más): el mapa de papel del juego lo usa sólo
# de lejos (por debajo de su zoom 15; de cerca dibuja los polígonos de worldmap-forest.xml),
# así que al acercarse alcanza con estirar el nivel 1 en el navegador.
FOREST_MIN_LEVEL = 1


# ─────────────────────────────── utilidades ───────────────────────────────

def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def write_json(name, data):
    """
    JSON compacto en games/zomboid/data/map. Si el contenido no cambió no se reescribe:
    así la fecha del archivo (y el diff) sólo se mueven cuando el parche cambió algo.
    """
    path = os.path.join(DATA, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = f.read()
    if old != text:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    return path


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


def write_meta(counts):
    """
    games/zomboid/data/map/meta.json = { extractedAt, dataHash, counts }, con el mismo criterio que
    extract.py: dataHash es el sha256 de todos los JSON del mapa y de web/zombies.bin (los que hay
    en la carpeta y en web/, así --sin-teselas da el mismo hash que una corrida entera si los datos
    no cambiaron) y extractedAt sólo se mueve cuando ese hash cambia. Ojo: el .bin se hashea
    comprimido, y otra zlib (zlib-ng en Python 3.14 de Windows) podría comprimir distinto los
    mismos datos y mover el hash; correrlo siempre en la misma máquina, o pasar a hashear la grilla. Es el `lastmod` de la pestaña Mapa en el
    sitemap: una fecha que se mueve sin que cambie nada le enseña a Google a no creerla.

    `counts` ({ buildings, streets, stashes, zones: { <tipo>: n }, spawns }) son las cifras que la página
    del Mapa dice en su introducción y en la leyenda de las capas. Van acá y no en common.json porque la introducción se prerenderiza y viaja en el
    chunk de la pestaña: este archivo pesa 200 bytes, common.json 250 KB. Salen de los mismos JSON
    del hash, así que no lo mueven por su cuenta.

    No cubre los píxeles de las teselas: tiles.json sólo guarda límites y zooms, y un parche que
    cambie el mundo cambia también los edificios y las calles, que sí están en el hash.
    """
    h = hashlib.sha256()
    names = []
    for folder, _, files in os.walk(DATA):
        for f in files:
            if f.endswith((".json", ".bin")):
                names.append(os.path.relpath(os.path.join(folder, f), DATA).replace("\\", "/"))
    for name in sorted(n for n in names if n != "meta.json"):
        with open(os.path.join(DATA, name), "rb") as f:
            h.update(name.encode() + b"\0" + f.read())
    digest = h.hexdigest()
    old = {}
    path = os.path.join(DATA, "meta.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    changed = old.get("dataHash") != digest or "extractedAt" not in old
    meta = {"extractedAt": datetime.date.today().isoformat() if changed else old["extractedAt"], "dataHash": digest,
            "counts": counts}
    return write_json("meta.json", meta), meta, changed


# Las zonas que el Mapa muestra como capas (Task 3). "Region" no es capa: son los nombres de pueblos y lugares de
# regions.lua, que el mapa ya escribe con sus propios textos.
LAYER_ZONES = ("ParkingStall", "Forest", "DeepForest", "Vegitation", "FarmLand", "Farm", "TownZone", "TrailerPark",
               "Ranch", "Basement", "ZombiesType", "ZoneStory", "LootZone", "BuildingName")


def vehicle_table(name, vehicles):
    """
    ¿El lugar para autos tiene tabla de vehículos? Es la misma regla que `vehicleKey` de layers.ts (el visor): IsoChunk
    toma el nombre de la zona (o su tipo, "parkingstall", si no tiene), `VehicleType.hasTypeForZone` lo busca en
    minúsculas, y un "rtrafficjamw" (embotellamiento que sale una de cada diez veces) usa la tabla de "trafficjamw". Sin
    tabla, el juego saltea la zona y no pone ningún auto.
    """
    k = (name or "parkingstall").lower()
    if re.fullmatch(r"rtrafficjam[nsew]", k):
        k = k[1:]
    return k in vehicles


def map_counts(bd, st, stl, zd, sp, zdefs):
    """
    Las cifras de la introducción del Mapa (edificios con habitaciones, calles con nombre, distintos porque una calle
    larga viene en varios tramos, y escondites) y las de la leyenda de sus capas: cuántas zonas hay de cada tipo y
    cuántos puntos de aparición. Las zonas se cuentan distintas: objects.lua trae unas pocas repetidas tal cual (tres
    lugares para autos, siete de pueblo…), y el visor, que deduplica por `tipo|x,y,w,h|nombre|extras`, las dibuja una
    vez. Así la leyenda dice lo mismo que se ve.

    Y sólo cuentan las zonas donde el juego hace algo: una zona de historia cuyo nombre no usa ninguna historia
    (`story_zone_names`) no arma nada, y un lugar para autos sin tabla no pone ningún auto. Esas el visor ya no las
    dibuja como historias (las historias) o las rotula "acá no aparecen autos" (los autos); contarlas en la leyenda
    prometería 171 historias donde el juego pone 153.
    """
    def does_something(kind, z):
        if kind == "ZoneStory":
            return z.get("n") in zdefs["stories"]
        if kind == "ParkingStall":
            return vehicle_table(z.get("n"), set(zdefs["vehicles"]))
        return True

    zones = {k: len({json.dumps(z, sort_keys=True) for z in zd["zones"].get(k, []) if does_something(k, z)})
             for k in LAYER_ZONES}
    spawns = sum(len(t["points"]) for t in sp["towns"]) + len(sp["zones"])
    # La capa se llama "Botín rico": su cifra cuenta sólo las `Rich` (objects.lua trae además una `Poor`, que se dibuja
    # igual pero no es botín rico).
    loot_rich = len({json.dumps(z, sort_keys=True) for z in zd["zones"].get("LootZone", []) if z.get("n") == "Rich"})
    return {"buildings": len(bd["buildings"]), "streets": len({s["name"] for s in st}), "stashes": len(stl),
            "zones": zones, "lootRich": loot_rich, "spawns": spawns}


def stash_items(stl):
    """
    Los objetos que nombran los escondites (el mapa que hay que encontrar y la bolsa donde está el botín) con su ficha:
    { "Base.RosewoodMap": { id, en, es } }. Salen del índice de fichas que escribe extract.py (data/index.json), así la
    hoja del escondite enlaza a la ficha del objeto sin que el Mapa baje el índice entero (691 KB). Un objeto sin ficha
    no va, y la hoja lo muestra sin enlace.
    Sin índice se corta: antes seguía con `{}`, y una corrida en una PC sin extract.py dejaba un common.json con todos
    los escondites sin enlace que parecía bueno (el test de "cada mapa tiene ficha" recién lo veía después).
    """
    path = os.path.join(ROOT, "games", "zomboid", "data", "index.json")
    if not os.path.exists(path):
        raise SystemExit(f"Falta {rel(path)}: corré primero games/zomboid/tools/extract.py (los escondites enlazan a "
                         "la ficha de su mapa y sin el índice quedarían todos sin enlace).")
    with open(path, encoding="utf-8") as f:
        index = json.load(f)
    by_ref = {r: e for e in index if e.get("sec") == "items" for r in e.get("ref", [])}
    wanted = {s["item"] for s in stl if s.get("item")}
    wanted |= {c["item"] for s in stl for c in s.get("containers", []) if c.get("item")}
    return {k: {"id": by_ref[k]["id"], "en": by_ref[k]["en"], "es": by_ref[k]["es"]} for k in sorted(wanted) if k in by_ref}


# La vista del mapa entero que la página del Mapa muestra antes de que arranque el visor (y la que ve Google): el
# nivel 0 del sitio (16 casillas por píxel) armado en una sola imagen y recortado al mundo. Con pérdida y calidad 80
# pesa unos 77 KB (sin pérdida, 666 KB): a ese tamaño ya es una foto de lejos, no se ven las casillas.
OVERVIEW_QUALITY = 80


def write_overview(bounds):
    """
    site/public/zomboid/map/overview.webp desde las teselas del nivel 0 del sitio que ya están en el disco (las de
    make_tiles, o las commiteadas con --sin-teselas). Sólo se reescribe si cambia, como los JSON. Devuelve la ruta y
    el tamaño en píxeles, o None si no hay teselas.
    """
    folder = os.path.join(PUBLIC, "sat", "0")
    names = sorted(f for f in os.listdir(folder) if f.endswith(".webp")) if os.path.isdir(folder) else []
    if not names:
        return None
    step = 2 ** 4  # el zoom 0 del sitio es el nivel 4 del juego: 16 casillas por píxel
    cells = [tuple(int(v) for v in f[:-5].split("_")) for f in names]
    canvas = Image.new("RGB", ((max(x for x, _ in cells) + 1) * TILE, (max(y for _, y in cells) + 1) * TILE))
    for (x, y), f in zip(cells, names):
        with Image.open(os.path.join(folder, f)) as im:
            canvas.paste(im.convert("RGB"), (x * TILE, y * TILE))
    size = (math.ceil(bounds[2] / step), math.ceil(bounds[3] / step))
    buf = io.BytesIO()
    canvas.crop((0, 0, *size)).save(buf, "WEBP", quality=OVERVIEW_QUALITY, method=6)
    path = os.path.join(PUBLIC, "overview.webp")
    old = None
    if os.path.exists(path):
        with open(path, "rb") as f:
            old = f.read()
    if old != buf.getvalue():
        with open(path, "wb") as f:
            f.write(buf.getvalue())
    return path, size


def rnd(v):
    """Redondeo a la casilla más cercana (no el de banquero de round(): 0,5 sube siempre)."""
    return int(math.floor(float(v) + 0.5))


def translations(file, lang):
    path = os.path.join(TRANSLATE, lang, file)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─────────────────────── lector mínimo de Lua literal ───────────────────────
# Los datos del mapa vienen como tablas de Lua (objects.lua, spawnpoints.lua, los
# escondites). No se ejecuta nada: se leen las tablas literales, y lo único "de código"
# que se entiende es mergeTable(a, b…) de los spawnpoints, que junta listas.

_LUA_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<comment>--\[(?P<eq>=*)\[.*?\](?P=eq)\]|--[^\n]*)
  | (?P<str>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')
  | (?P<num>-?(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+))
  | (?P<name>[A-Za-z_]\w*)
  | (?P<op>[{}()\[\]=,;.:])
""", re.S | re.X)
_ESCAPES = {"n": "\n", "t": "\t", "\\": "\\", '"': '"', "'": "'"}


def lua_tokens(text):
    out, pos = [], 0
    while pos < len(text):
        m = _LUA_TOKEN.match(text, pos)
        if not m:
            raise ValueError(f"Lua: no entiendo lo que hay en {pos}: {text[pos:pos + 40]!r}")
        pos = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment", "eq"):
            continue
        out.append((kind, m.group(kind)))
    return out


class LuaReader:
    def __init__(self, text):
        self.t = lua_tokens(text)
        self.i = 0

    def peek(self, k=0):
        return self.t[self.i + k] if self.i + k < len(self.t) else (None, None)

    def take(self, value=None):
        tok = self.t[self.i]
        if value is not None and tok[1] != value:
            raise ValueError(f"Lua: esperaba {value!r} y vino {tok[1]!r}")
        self.i += 1
        return tok

    def value(self):
        kind, v = self.take()
        if kind == "str":
            return re.sub(r"\\(.)", lambda m: _ESCAPES.get(m.group(1), m.group(1)), v[1:-1])
        if kind == "num":
            return int(v, 0) if re.fullmatch(r"-?(0[xX][0-9a-fA-F]+|\d+)", v) else float(v)
        if kind == "name":
            if v in ("true", "false"):
                return v == "true"
            if v == "nil":
                return None
            if self.peek()[1] == "(":
                return ("call", v, self.args())
            return ("ref", v)
        if v == "{":
            return self.table()
        raise ValueError(f"Lua: valor inesperado {v!r}")

    def args(self):
        self.take("(")
        out = []
        while self.peek()[1] != ")":
            out.append(self.value())
            if self.peek()[1] == ",":
                self.take()
        self.take(")")
        return out

    def table(self):
        items, keyed = [], {}
        while self.peek()[1] != "}":
            if self.peek()[0] == "name" and self.peek(1)[1] == "=":
                key = self.take()[1]
                self.take("=")
                keyed[key] = self.value()
            elif self.peek()[1] == "[":
                self.take("[")
                key = self.value()
                self.take("]")
                self.take("=")
                keyed[key] = self.value()
            else:
                items.append(self.value())
            if self.peek()[1] in (",", ";"):
                self.take()
        self.take("}")
        if keyed and items:
            keyed.update({i + 1: v for i, v in enumerate(items)})
            return keyed
        return keyed if keyed else items

    def assignments(self):
        """`nombre = valor` y `return valor` sueltos (con o sin `local`), saltando `function f()` y `end`."""
        out = {}
        while self.i < len(self.t):
            kind, v = self.peek()
            if v in ("local", "end") or v in (";",):
                self.take()
            elif v == "function":
                self.take()
                while self.peek()[1] != ")":
                    self.take()
                self.take(")")
            elif v == "return":
                self.take()
                out["return"] = self.value()
            elif kind == "name" and self.peek(1)[1] == "=":
                self.take()
                self.take("=")
                out[v] = self.value()
            else:
                raise ValueError(f"Lua: sentencia que no sé leer: {v!r}")
        return out


def lua_file(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return LuaReader(f.read()).assignments()


def lua_args(text):
    """Los argumentos de una llamada, "(1, "a", nil)" → [1, "a", None]."""
    return LuaReader(text).args()


# ──────────────────────────────── teselas ────────────────────────────────

def _tile_jobs(zip_path, min_level):
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if re.fullmatch(r"\d+/tile\d+x\d+\.png", n)]
    levels = sorted({int(n.split("/")[0]) for n in names})
    return [n for n in names if int(n.split("/")[0]) >= min_level], max(levels)


def _encode_tiles(args):
    """Trabajo de un proceso: un lote de teselas del zip → WebP. Devuelve bytes escritos por nivel."""
    zip_path, names, out_dir, top, kind = args
    written = Counter()
    with zipfile.ZipFile(zip_path) as z:
        for n in names:
            level, x, y = map(int, re.fullmatch(r"(\d+)/tile(\d+)x(\d+)\.png", n).groups())
            im = Image.open(io.BytesIO(z.read(n)))
            if kind == "forest":
                # La máscara viene en paleta (0/1 en el nivel 0, grises de cobertura arriba):
                # el alfa ES el bosque. Se pinta del color del mapa de papel del juego.
                alpha = im.convert("RGBA").getchannel("A")
                im = Image.new("RGBA", im.size, FOREST_RGB + (0,))
                im.putalpha(alpha)
            else:
                im = im.convert("RGBA")
                # Las del borde del mundo traen transparencia más allá del último píxel; las
                # demás son opacas y sin canal alfa pesan menos.
                if im.getchannel("A").getextrema()[0] == 255:
                    im = im.convert("RGB")
            path = os.path.join(out_dir, str(top - level), f"{x}_{y}.webp")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            if level in LOSSLESS_LEVELS or kind == "forest":
                im.save(path, "WEBP", lossless=True, method=6, exact=False)
            else:
                im.save(path, "WEBP", quality=LOSSY_QUALITY, method=6)
            written[top - level] += os.path.getsize(path)
    return written


def make_tiles(zip_name, sub, kind, min_level=0):
    """
    Las pirámides del juego → teselas para un visor tipo Leaflet con CRS simple.

    El juego numera los niveles al revés que Leaflet (0 = máximo detalle); acá
    z = nivel_máximo − nivel, así el zoom 0 es el mundo entero en pocas teselas y el
    zoom más alto (4) es 1 píxel por casilla. Más cerca que eso lo estira el navegador
    (con image-rendering: pixelated para que las casillas se vean como casillas).
    """
    zip_path = os.path.join(WORLD, zip_name)
    out_dir = os.path.join(PUBLIC, sub)
    names, top = _tile_jobs(zip_path, min_level)
    # Se borra lo anterior: un parche que achique el mundo no debe dejar teselas huérfanas.
    shutil.rmtree(out_dir, ignore_errors=True)
    batches = [names[i::32] for i in range(32)]
    total = Counter()
    with ProcessPoolExecutor() as pool:
        for c in pool.map(_encode_tiles, [(zip_path, b, out_dir, top, kind) for b in batches]):
            total.update(c)
    with zipfile.ZipFile(zip_path) as z:
        info = dict(line.strip().split("=", 1) for line in z.read("pyramid.txt").decode().splitlines() if "=" in line)
    bounds = [int(v) for v in info["bounds"].split()]
    per_z = {z: sum(1 for n in names if top - int(n.split("/")[0]) == z) for z in sorted(total)}
    print(f"  {rel(out_dir)}: {len(names)} teselas, {sum(total.values()) / 1e6:.1f} MB "
          + " · ".join(f"z{z}: {per_z[z]} ({total[z] / 1e6:.1f} MB)" for z in sorted(total)))
    return {"maxNativeZoom": top - min_level, "bounds": bounds, "tiles": len(names),
            "bytes": sum(total.values())}


# ─────────────────────────── worldmap.xml (papel) ───────────────────────────

def clean_ring(pts):
    """
    Saca el punto de cierre, los repetidos y los que están sobre la recta entre sus
    vecinos. No mueve ningún punto: los edificios quedan con la forma exacta.
    """
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    out = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) == 0:
                del out[i]
                changed = True
                break
    return out


def flat(pts):
    return [v for p in pts for v in p]


def read_worldmap():
    """Cada feature de worldmap.xml como (propiedades, tipo de geometría, anillos en casillas del mundo)."""
    root = ET.parse(os.path.join(WORLD, "worldmap.xml")).getroot()
    for cell in root.iter("cell"):
        ox, oy = int(cell.get("x")) * WORLDMAP_CELL, int(cell.get("y")) * WORLDMAP_CELL
        for f in cell.iter("feature"):
            g = f.find("geometry")
            props = {p.get("name"): p.get("value") for p in f.iter("property")}
            rings = [[(ox + rnd(p.get("x")), oy + rnd(p.get("y"))) for p in c.iter("point")]
                     for c in g.iter("coordinates")]
            yield props, g.get("type"), rings


# Los colores del mapa de papel del juego (media/lua/client/ISUI/Maps/ISMapDefinitions.lua,
# initDefaultStyleV1): para que el sitio lo dibuje igual sin tener que ir a buscarlos.
PAPER_STYLE = {
    "background": [219, 215, 192],
    "forest": list(FOREST_RGB),
    "water": [59, 141, 149],
    "roads": {"primary": [134, 125, 113], "secondary": [134, 125, 113],
              "tertiary": [171, 158, 143], "trail": [185, 122, 87]},
    "railway": [200, 191, 231],
    "buildings": {"yes": [210, 158, 105], "Residential": [210, 158, 105], "CommunityServices": [139, 117, 235],
                  "Hospitality": [127, 206, 225], "Industrial": [56, 54, 53], "Medical": [229, 128, 151],
                  "RestaurantsAndEntertainment": [245, 225, 60], "RetailAndCommercial": [184, 205, 84]},
}


def vector(features):
    """
    El mapa de papel del juego, listo para dibujar: polígonos por capa, cada uno como
    lista de anillos planos [x0, y0, x1, y1, …] (el primero es el borde; los demás, huecos).

    Las rutas y el río vienen cortados en celdas de 300×300 (así los guarda el juego):
    se dibujan sin borde, sólo relleno, y las costuras no se ven.
    """
    out = {"bounds": None, "style": PAPER_STYLE, "buildings": defaultdict(list), "roads": defaultdict(list),
           "roadLines": defaultdict(list), "water": [], "railway": [], "wood": [], "driveways": [], "places": []}
    skipped = Counter()
    xs, ys = [], []
    for props, gtype, rings in features:
        if gtype == "Point":
            if props.get("place"):
                (x, y), = rings[0]
                out["places"].append({"name": props.get("name_en") or props.get("name"), "kind": props["place"], "x": x, "y": y})
            continue
        if "MISSING_TILESETS" in props:
            skipped["MISSING_TILESETS"] += 1  # marcas de depuración del editor del mapa
            continue
        if gtype == "LineString":
            if "highway" in props:
                out["roadLines"][props["highway"]].append(flat(rings[0]))
            else:
                skipped["línea " + ",".join(props)] += 1
            continue
        poly = [flat(r) for r in (clean_ring(r) for r in rings) if len(r) >= 3]
        if not poly:
            skipped["polígono vacío"] += 1
            continue
        for r in poly:
            xs += r[0::2]
            ys += r[1::2]
        if "building" in props:
            out["buildings"][props["building"]].append(poly)
        elif "highway" in props:
            out["roads"][props["highway"]].append(poly)
        elif props.get("water"):
            out["water"].append(poly)
        elif "railway" in props:
            out["railway"].append(poly)
        elif props.get("natural") in ("wood", "forest"):
            out["wood"].append(poly)
        elif "driveway" in props:
            out["driveways"].append(poly)
        else:
            skipped[",".join(f"{k}={v}" for k, v in props.items())] += 1
    out["bounds"] = [min(xs), min(ys), max(xs), max(ys)]
    for k in ("buildings", "roads", "roadLines"):
        out[k] = dict(sorted(out[k].items()))
    return out, skipped


# ───────────────────────────── calles y textos ─────────────────────────────

def streets():
    """
    streets.xml: cada calle con su nombre, su ancho y su línea. Se agrega el punto donde
    va la etiqueta (la mitad del recorrido) y el ángulo del tramo, para no calcularlo
    en el navegador; el ángulo se da vuelta si el texto quedaría cabeza abajo.
    """
    root = ET.parse(os.path.join(WORLD, "streets.xml")).getroot()
    out = []
    for s in root.iter("street"):
        pts = [(float(p.get("x")), float(p.get("y"))) for p in s.iter("point")]
        if not pts:
            continue
        seg = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
        half, acc, label = sum(seg) / 2, 0.0, (pts[0], 0.0)
        for (a, b), d in zip(zip(pts, pts[1:]), seg):
            if d and acc + d >= half:
                t = (half - acc) / d
                ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                if ang > 90:
                    ang -= 180
                elif ang <= -90:
                    ang += 180
                label = ((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), ang)
                break
            acc += d
        line = []
        for x, y in pts:
            p = (rnd(x), rnd(y))
            if not line or line[-1] != p:
                line.append(p)
        out.append({"name": s.get("name"), "width": rnd(s.get("width") or 0), "points": flat(line),
                    "label": [rnd(label[0][0]), rnd(label[0][1]), round(label[1])]})
    return out


def annotations():
    """
    worldmap-annotations.lua: los textos que el juego escribe sobre el mapa (pueblos,
    lugares, ríos, bosques), con su capa de estilo, escala, giro y rango de zoom del juego.
    Los de pueblos y ríos son claves de MapLabel.json; los demás, texto en inglés tal cual.
    """
    en, es = translations("MapLabel.json", "EN"), translations("MapLabel.json", ES)
    with open(os.path.join(WORLD, "worldmap-annotations.lua"), encoding="utf-8") as f:
        text = f.read()
    labels, cur = [], None
    for line in text.splitlines():
        m = re.search(r"symbolsAPI:add(Untranslated|Translated)Text(\(.*\))", line)
        if m:
            txt, layer, x, y = lua_args(m.group(2))[:4]
            key = txt if txt in en else None
            cur = {"key": key, "text": en.get(txt, txt), "layer": layer, "x": rnd(x), "y": rnd(y)}
            if key and es.get(key) and es[key] != en[key]:
                cur["es"] = es[key]
            labels.append(cur)
            continue
        m = re.search(r"symbol:set(\w+)(\(.*\))", line)
        if m and cur is not None:
            name, args = m.group(1), lua_args(m.group(2))
            if name == "Scale":
                cur["scale"] = args[0]
            elif name == "Rotation" and args[0]:
                cur["rotation"] = args[0]
            elif name == "MinZoom":
                cur["minZoom"] = args[0]
            elif name == "MaxZoom":
                cur["maxZoom"] = args[0]
    for lb in labels:
        # "<br>" es el salto de línea de la interfaz del juego.
        lb["text"] = re.sub(r"<br>", "\n", lb["text"], flags=re.I)
        if "es" in lb:
            lb["es"] = re.sub(r"<br>", "\n", lb["es"], flags=re.I)
    return [{k: v for k, v in lb.items() if v is not None} for lb in labels]


# ──────────────────────────────── zonas ────────────────────────────────

# De los 20 tipos de zona de objects.lua, los que sirven como capa del mapa. Se dejan
# afuera las de la máquina del juego: Nav (el trazado por donde manejan/caminan los
# NPC), WaterFlow, WorldGen, Mannequin, RoomTone, WaterZone y los recorridos de Animal.
ZONE_TYPES = {
    "ParkingStall": "autos: el nombre es el tipo de vehículo (vacío = cualquiera), `d` la dirección",
    "Forest": "forrajeo", "DeepForest": "forrajeo", "Vegitation": "forrajeo (así, con i, en el juego)",
    "FarmLand": "forrajeo", "Farm": "forrajeo", "TownZone": "forrajeo", "TrailerPark": "forrajeo",
    "Ranch": "animales de granja: el nombre es la especie o el corral",
    "Basement": "sótanos al azar: `stair` = escalera [x, y, dirección] relativa al rectángulo",
    "ZoneStory": "historias armadas del mundo (campamentos, accidentes…): el nombre es la historia",
    "ZombiesType": "de qué va vestido el zombi que aparece ahí",
    "LootZone": "botín mejor (Rich)",
    "Region": "regiones con nombre de regions.lua (pueblos y lugares puntuales)",
    "BuildingName": "edificios con nombre propio de regions.lua (KnoxBank, SunstarMotel…)",
}


def zones():
    """
    objects.lua (y regions.lua) → zonas por tipo. Cada una es {"r": [x, y, ancho, alto]} o
    {"p": [x0, y0, …]} si es un polígono, más "n" (su nombre en el juego) si tiene, "z" si no
    está en la planta baja y lo propio de cada tipo. Los SpawnPoint van a spawns.json.
    """
    objs = lua_file(os.path.join(WORLD, "objects.lua"))["objects"]
    regions = lua_file(os.path.join(WORLD, "regions.lua"))["regions"]
    out = defaultdict(list)
    spawn_zones = []
    ignored = Counter()
    for o in objs + regions:
        t = o.get("type")
        props = o.get("properties") or {}
        if t == "SpawnPoint":
            profs = [p.strip() for p in str(props.get("Professions", "")).split(",") if p.strip()]
            spawn_zones.append([o["x"], o["y"], o.get("z", 0), profs])
            continue
        if t not in ZONE_TYPES:
            ignored[t] += 1
            continue
        z = {}
        if "points" in o:
            z["p"] = [rnd(v) for v in o["points"]]
            if o.get("geometry") == "polyline":
                z["line"] = True
        else:
            z["r"] = [o["x"], o["y"], o["width"], o["height"]]
        if o.get("name"):
            z["n"] = o["name"]
        if o.get("z"):
            z["z"] = o["z"]
        if t == "ParkingStall" and props.get("Direction"):
            z["d"] = props["Direction"]
        if t == "Basement":
            z["stair"] = [props.get("StairX"), props.get("StairY"), props.get("StairDirection")]
        out[t].append(z)
    return {"about": ZONE_TYPES, "zones": dict(sorted(out.items()))}, spawn_zones, ignored


def zone_defs():
    """
    Los nombres de zona que el juego entiende, para que el Mapa traduzca sólo esos (el resto va como "variados"):
      zombies   { <nombre>: <tabla> }: las claves de ZombiesZoneDefinition.lua. El juego busca el nombre de la zona tal
                cual (ZombiesZoneDefinition.java: un HashMap.get con Zone.name, sin pasar a minúsculas ni recortar), y un
                nombre que no está usa `Default`. Algunas claves son otra tabla con otro nombre
                (`ZombiesZoneDefinition.Coffeshop = ZombiesZoneDefinition.CoffeeShop`): van a la tabla de verdad, así el
                sitio las nombra igual sin arreglar erratas a mano. " Offices", "Office" o "Church" no están: son Default.
      vehicles  las claves de VehicleZoneDistribution (VehicleZoneDefinition.lua) que están en minúsculas: VehicleType.java
                las busca con el nombre de la zona en minúsculas (`hasTypeForZone`), y una zona cuyo nombre no está no pone
                ningún auto (IsoChunk la saltea). Los embotellamientos "rtrafficjamw…" usan la de "trafficjamw".
      stories   los nombres de zona de historia con los que el juego sí arma algo (ver story_zone_names).
    """
    zombies = {}
    with open(os.path.join(LUA, "shared", "NPCs", "ZombiesZoneDefinition.lua"), encoding="utf-8") as f:
        for m in re.finditer(r"^ZombiesZoneDefinition\.(\w+)\s*=\s*(ZombiesZoneDefinition\.(\w+))?", f.read(), re.M):
            zombies[m.group(1)] = m.group(3) or m.group(1)
    # Una clave que es otra tabla apunta a la tabla de verdad, siguiendo la cadena si la hubiera.
    def table(k):
        seen = set()
        while zombies.get(k, k) != k and k not in seen:
            seen.add(k)
            k = zombies[k]
        return k
    zombies = {k: table(k) for k in zombies}
    with open(os.path.join(LUA, "shared", "VehicleZoneDefinition.lua"), encoding="utf-8") as f:
        keys = {m.group(1) for m in re.finditer(r"^VehicleZoneDistribution\.(\w+)\s*=", f.read(), re.M)}
    # VehicleType.java guarda cada tabla con su clave tal cual y la busca en minúsculas: "luxuryDealership" o
    # "middleClass" nunca las encuentra una zona. Van sólo las que se pueden encontrar.
    vehicles = sorted(k for k in keys if k == k.lower())
    if not zombies or "Default" not in zombies or not vehicles:
        raise SystemExit("No pude leer ZombiesZoneDefinition.lua o VehicleZoneDefinition.lua: ¿cambió su formato?")
    return {"zombies": dict(sorted(zombies.items())), "vehicles": vehicles, "stories": story_zone_names()}


STORY_PKG = "zombie/randomizedWorld/randomizedZoneStory/"
STORY_ZONE_TYPE = STORY_PKG + "RandomizedZoneStoryBase$ZoneType"


def story_zone_names():
    """
    Los nombres de zona de historia (ZoneStory) con los que el juego arma algo, leídos de projectzomboid.jar.
    No salen de ningún .lua: en la 42.21 cada historia es una clase `RZS*` que en su constructor anota con qué `ZoneType`
    del enum sirve (`zoneType.add(ZoneType.Forest.toString())`), `IsoWorld` las registra, y `RandomizedZoneStoryBase.isValid`
    compara el nombre de la zona con ese texto por `String.equals` (con mayúsculas). Si ninguna clase registrada lo usa,
    `doRandomStory` no elige nada y la zona queda vacía: 18 de las 171 de Muldraugh ("forest" en minúscula, "NewsStory",
    "nolans", "KirstyCormick" con C cuando el juego dice "KirstyKormick", y las 11 sin nombre).
    Devuelve la lista ordenada de nombres: los `ZoneType.X` que nombran, en su pool de constantes, las clases RZS que
    IsoWorld registra (el pool sólo trae lo que la clase usa; `NewsStory` y `JackieJaye` están en el enum pero ninguna
    clase los usa). Corta si el jar no se parece a lo esperado, en vez de escribir una lista vacía.
    """
    try:
        with zipfile.ZipFile(os.path.join(PZ_DIR, "projectzomboid.jar")) as z:
            jar = {n for n in z.namelist() if n.startswith(STORY_PKG)}
            pool = _constant_pool(z.read("zombie/iso/IsoWorld.class"))
            registered = {pool[pool[i][1]][1] for i in pool if pool[i][0] == 7 and pool[pool[i][1]][1].startswith(STORY_PKG + "RZS")}
            names, classes = set(), 0
            for cls in sorted(registered):
                if cls + ".class" not in jar:
                    continue
                cp = _constant_pool(z.read(cls + ".class"))
                classes += 1
                for e in cp.values():
                    # Fieldref a una constante del enum: clase = ZoneType y tipo = ZoneType (no $VALUES, que es un arreglo).
                    if e[0] == 9 and cp[cp[e[1]][1]][1] == STORY_ZONE_TYPE:
                        name, desc = cp[cp[e[2]][1]][1], cp[cp[e[2]][2]][1]
                        if desc == f"L{STORY_ZONE_TYPE};":
                            names.add(name)
    except (OSError, KeyError, zipfile.BadZipFile) as err:
        raise SystemExit(f"No pude leer las historias de zona de projectzomboid.jar ({err}): ¿cambió el juego? No se escribió nada.")
    if classes < 30 or not {"Forest", "Lake", "Beach", "Baseball"} <= names:
        raise SystemExit(f"Leí {classes} clases RZS y los nombres {sorted(names)} en projectzomboid.jar: no es lo que esperaba "
                         "de la 42.21 (unas 40 clases y Forest, Lake, Beach, Baseball…). Hay que adaptar story_zone_names().")
    return sorted(names)


# ─────────────────────────────── spawns ───────────────────────────────

def spawns(spawn_zones):
    """
    Dónde aparece cada profesión. Hay dos fuentes y se guardan las dos:
      towns: el spawnpoints.lua de cada ciudad elegible al empezar (listas de casas
             pobres/medias/ricas que el archivo reparte entre profesiones con mergeTable).
      zones: los SpawnPoint de objects.lua, con su lista de profesiones. Traen oficios que
             sólo existen en B42 (angler, welder, blacksmith…), así que son las del mapa nuevo.
    Cada punto es [x, y, piso, [profesiones]].
    """
    towns = []
    for folder in sorted(os.listdir(MAPS)):
        path = os.path.join(MAPS, folder, "spawnpoints.lua")
        if not os.path.exists(path):
            continue
        env = lua_file(path)

        def resolve(v):
            if isinstance(v, tuple) and v[0] == "ref":
                return resolve(env[v[1]])
            if isinstance(v, tuple) and v[0] == "call" and v[1] == "mergeTable":
                return [p for a in v[2] for p in resolve(a)]
            return v

        points = {}
        for prof, lst in env["return"].items():
            for p in resolve(lst):
                key = (p["posX"], p["posY"], p.get("posZ", 0))
                points.setdefault(key, []).append(prof)
        title = translations(f"{folder}.json", "EN").get("title", folder)
        towns.append({"id": folder, "name": title,
                      "points": [[x, y, z, sorted(set(pr))] for (x, y, z), pr in points.items()]})
    return {"towns": towns, "zones": spawn_zones}


# ───────────────────────────── .lotheader ─────────────────────────────

def read_density(path):
    """
    Los 1.024 bytes finales de un .lotheader: la densidad de zombis de sus 32×32 chunks. `read_lotheader` (que corre
    antes, en `buildings`) ya verificó que el archivo termina justo ahí; acá sólo se leen, sin volver a recorrerlo.
    """
    size = DENSITY_SIDE * DENSITY_SIDE
    if os.path.getsize(path) < size:
        raise SystemExit(f"{path} mide menos de {size} bytes: no trae la densidad de zombis. No se escribió nada.")
    with open(path, "rb") as f:
        f.seek(-size, os.SEEK_END)
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


def read_lotheader(path):
    """
    Un .lotheader de Build 42 (cabecera "LOTH", versión 1). Formato verificado contra los
    4.065 archivos del juego el 2026-09-30 (todos terminan exactamente donde se espera);
    la guía fue pzmap2dzi (github.com/cff29546/pzmap2dzi, MIT), escrito de nuevo acá:
      "LOTH", u32 versión, u32 N, N nombres de tiles terminados en "\n"
      u32 ancho de chunk, u32 alto de chunk (8 y 8), i32 piso mínimo, i32 piso máximo
      u32 habitaciones × (nombre "\n", i32 piso, u32 R × (i32 x, y, ancho, alto), u32 M × (i32 tipo, x, y))
      u32 edificios × (u32 K × u32 índice de habitación)
      32×32 bytes: densidad de zombis por chunk
    Las coordenadas de las habitaciones son relativas a la celda de 256 y pueden pasarse de
    256: en B42 el edificio entero queda en la celda de su esquina, no partido entre celdas.
    """
    d = open(path, "rb").read()
    magic, ver, ntiles = struct.unpack_from("<4sII", d, 0)
    if magic != b"LOTH" or ver != 1:
        raise SystemExit(f"{os.path.basename(path)}: formato de lotheader desconocido ({magic!r}, versión {ver}): revisar read_lotheader")
    p = 12
    for _ in range(ntiles):
        p = d.index(b"\n", p) + 1
    p += 16  # chunk 8×8 y pisos mínimo/máximo: no hacen falta
    rooms = []
    (n,) = struct.unpack_from("<I", d, p)
    p += 4
    for _ in range(n):
        e = d.index(b"\n", p)
        name = d[p:e].decode("utf-8", "replace")
        p = e + 1
        layer, nrect = struct.unpack_from("<iI", d, p)
        p += 8
        rects = [struct.unpack_from("<iiii", d, p + 16 * k) for k in range(nrect)]
        p += 16 * nrect
        (nmeta,) = struct.unpack_from("<I", d, p)
        p += 4 + 12 * nmeta
        rooms.append((name, layer, rects))
    buildings = []
    (n,) = struct.unpack_from("<I", d, p)
    p += 4
    for _ in range(n):
        (k,) = struct.unpack_from("<I", d, p)
        buildings.append(struct.unpack_from(f"<{k}I", d, p + 4))
        p += 4 + 4 * k
    if len(d) - p != 32 * 32:
        raise SystemExit(f"{os.path.basename(path)}: sobran {len(d) - p} bytes en vez de 1024: cambió el formato del lotheader")
    return rooms, buildings


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring) // 2
    for i in range(n):
        x1, y1 = ring[2 * i], ring[2 * i + 1]
        x2, y2 = ring[2 * ((i + 1) % n)], ring[2 * ((i + 1) % n) + 1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


class PolygonIndex:
    """Los polígonos de edificios de worldmap.xml, repartidos en una grilla para buscar "¿en cuál cae este punto?"."""

    def __init__(self, items, step=64):
        self.step, self.grid = step, defaultdict(list)
        for props, rings in items:
            r0 = rings[0]
            x0, x1, y0, y1 = min(r0[0::2]), max(r0[0::2]), min(r0[1::2]), max(r0[1::2])
            for gx in range(x0 // step, x1 // step + 1):
                for gy in range(y0 // step, y1 // step + 1):
                    self.grid[(gx, gy)].append((props, rings))

    def find(self, x, y):
        for props, rings in self.grid.get((int(x) // self.step, int(y) // self.step), ()):
            if point_in_ring(x, y, rings[0]) and not any(point_in_ring(x, y, h) for h in rings[1:]):
                return props
        return None


def buildings(building_polys, named=()):
    """
    Cada edificio de los .lotheader: su caja, sus pisos y sus habitaciones (nombre del juego,
    como "bedroom" o "gunstore", y sus rectángulos). Los nombres van en una tabla aparte
    ("rooms") y cada habitación los nombra por índice: se repiten miles de veces.

    Para la ficha se le suma el tipo del polígono de worldmap.xml donde cae (Residential,
    Medical…) y su RoomTone (HouseSuburb, Gas, Church…), buscando el centro de la primera
    habitación de la planta baja; y, si una zona BuildingName de regions.lua lo cubre, su
    nombre propio ("KnoxBank").
    """
    index = PolygonIndex(building_polys)
    names, name_idx = [], {}
    out, matched, checked = [], 0, 0
    files = glob.glob(os.path.join(WORLD, "*.lotheader"))
    for path in sorted(files, key=lambda f: tuple(map(int, os.path.basename(f)[:-10].split("_")))):
        cx, cy = map(int, os.path.basename(path)[:-10].split("_"))
        ox, oy = cx * LOT_CELL, cy * LOT_CELL
        rooms, blds = read_lotheader(path)
        for bi, ids in enumerate(blds):
            floors = defaultdict(list)
            x0 = y0 = 10 ** 9
            x1 = y1 = -10 ** 9
            for i in ids:
                name, layer, rects = rooms[i]
                if name not in name_idx:
                    name_idx[name] = len(names)
                    names.append(name)
                room = [name_idx[name]]
                for rx, ry, rw, rh in rects:
                    room += [ox + rx, oy + ry, rw, rh]
                    x0, y0 = min(x0, ox + rx), min(y0, oy + ry)
                    x1, y1 = max(x1, ox + rx + rw), max(y1, oy + ry + rh)
                floors[layer].append(room)
            b = {"id": f"{cx}_{cy}_{bi}", "box": [x0, y0, x1, y1]}
            ground = [r for r in floors.get(0, []) if r[0] != name_idx.get("emptyoutside")] or floors.get(0) \
                or floors[min(floors, key=abs)]
            checked += 1
            for room in ground:
                mx, my = room[1] + room[3] / 2, room[2] + room[4] / 2
                own = next((n for n, (nx, ny, nw, nh) in named if nx <= mx < nx + nw and ny <= my < ny + nh), None)
                if own:
                    b["name"] = own
                    break
            for room in ground:
                props = index.find(room[1] + room[3] / 2, room[2] + room[4] / 2)
                if props:
                    matched += 1
                    b["type"] = props.get("building")
                    if props.get("RoomTone"):
                        b["tone"] = props["RoomTone"]
                    break
            b["floors"] = dict(floors)
            out.append(b)
    merged = merge_basements(out)
    for b in out:
        b["floors"] = {str(k): v for k, v in sorted(b["floors"].items())}
    return {"rooms": names, "buildings": out}, matched, checked, len(files), merged


def merge_basements(blds):
    """
    En B42 los sótanos son edificios aparte en el .lotheader (el del Knox Bank de Muldraugh
    es un BuildingDef con sólo el piso −1, pegado al de arriba). Para quien toca la casa en
    el mapa, el sótano es parte de la casa: cada edificio que está entero bajo tierra se
    suma al que más se le superpone arriba, y queda anotado en "parts". Los que no tienen
    nada encima (búnkeres) quedan solos.
    """
    def overlap(a, b):
        return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))

    above = [b for b in blds if any(k >= 0 for k in b["floors"])]
    grid = defaultdict(list)
    for b in above:
        for gx in range(b["box"][0] // 64, b["box"][2] // 64 + 1):
            for gy in range(b["box"][1] // 64, b["box"][3] // 64 + 1):
                grid[(gx, gy)].append(b)
    gone = set()
    for u in blds:
        if any(k >= 0 for k in u["floors"]):
            continue
        near = {id(b): b for gx in range(u["box"][0] // 64, u["box"][2] // 64 + 1)
                for gy in range(u["box"][1] // 64, u["box"][3] // 64 + 1) for b in grid[(gx, gy)]}
        host = max(near.values(), key=lambda b: overlap(b["box"], u["box"]), default=None)
        if host is None or overlap(host["box"], u["box"]) == 0:
            continue
        for k, rooms in u["floors"].items():
            host["floors"].setdefault(k, []).extend(rooms)
        host["box"] = [min(host["box"][0], u["box"][0]), min(host["box"][1], u["box"][1]),
                       max(host["box"][2], u["box"][2]), max(host["box"][3], u["box"][3])]
        host.setdefault("parts", [host["id"]]).append(u["id"])
        if "name" not in host and "name" in u:
            host["name"] = u["name"]
        gone.add(id(u))
    blds[:] = [b for b in blds if id(b) not in gone]
    return len(gone)


# ───────────────────────────── escondites ─────────────────────────────

# De qué archivo sale cada escondite → el pueblo (el nombre del archivo es el prefijo del juego).
STASH_TOWNS = {"Brandenburg": "Brandenburg", "Ekron": "Ekron", "Irvington": "Irvington", "Louisville": "Louisville",
               "MarchRidge": "March Ridge", "Mul": "Muldraugh", "Riverside": "Riverside", "Rosewood": "Rosewood",
               "Wp": "West Point", "World": None}


def rgb_hex(r, g, b):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(float(v) * 255))) for v in (r, g, b))


def stamp_defs():
    """MapSymbolDefinitions.lua: el nombre de cada sello ("ArrowEast") → su imagen y su grupo."""
    path = os.path.join(LUA, "shared", "Definitions", "MapSymbolDefinitions.lua")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return {m.group(1): {"file": os.path.basename(m.group(2)), "group": m.group(3)}
            for m in re.finditer(r'addTexture\("(\w+)",\s*"([^"]+)",\s*"(\w+)"\)', text)}


def stashes(stamps):
    """
    media/lua/shared/StashDescriptions/*StashDesc.lua: cada mapa anotado del juego. Guarda
    dónde está el edificio (building), qué se dibuja en el mapa (annotations: sellos y
    textos a mano, con su color) y lo que esconde (spawnTable, containers, zombis, tablas
    clavadas, trampas). "note" es el comentario del desarrollador arriba de cada uno
    ("survivor house, guns"): dice de qué se trata mejor que cualquier otro campo.
    """
    en, es = translations("Stash.json", "EN"), translations("Stash.json", ES)
    out, missing = [], Counter()
    for path in sorted(glob.glob(os.path.join(LUA, "shared", "StashDescriptions", "*StashDesc.lua"))):
        prefix = os.path.basename(path)[:-len("StashDesc.lua")]
        town = STASH_TOWNS.get(prefix, prefix)
        cur, note = None, None
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                m = re.match(r"--\s*(\w+)\s*\((.+)\)\s*$", line)
                if m:
                    note = m.group(2).strip()
                    continue
                if line.startswith("--") or line.startswith("require") or not line:
                    continue
                m = re.search(r"StashUtil\.newStash(\(.*\))", line)
                if m:
                    name, kind, item, custom = lua_args(m.group(1))
                    cur = {"id": name, "town": town, "item": item, "note": note, "annotations": []}
                    note = None
                    out.append(cur)
                    continue
                m = re.match(r"stashMap\.(\w+)\s*=\s*(.+?);?\s*$", line)
                if m and cur is not None:
                    key, val = m.group(1), lua_args("(" + m.group(2) + ")")[0]
                    if key == "buildingX":
                        cur.setdefault("building", [None, None])[0] = val
                    elif key == "buildingY":
                        cur.setdefault("building", [None, None])[1] = val
                    else:
                        cur[key] = val
                    continue
                m = re.match(r"stashMap:(addStamp|addStampV2|addContainer)(\(.*\))", line)
                if m and cur is not None:
                    args = lua_args(m.group(2))
                    if m.group(1) == "addContainer":
                        ctype, sprite, item, room, x, y, z = args
                        c = {"type": ctype, "sprite": sprite, "item": item, "room": room}
                        if x is not None:
                            c["at"] = [x, y, z or 0]
                        cur.setdefault("containers", []).append({k: v for k, v in c.items() if v is not None})
                        continue
                    # Tres llamadas del juego traen un argumento de más ("0.156, 0.65, 0.054, 0.054"):
                    # Lua descarta lo que sobra, así que el color es el de los tres primeros, como
                    # lo ve quien juega (aunque se note que la intención era otra).
                    if m.group(1) == "addStamp":
                        symbol, text, x, y, r, g, b = args[:7]
                        a = {}
                    else:
                        symbol, text, x, y, ax, ay, rot, r, g, b = args[:10]
                        a = {"anchor": [ax, ay], "rotation": rot}
                    a.update({"x": rnd(x), "y": rnd(y), "color": rgb_hex(r, g, b)})
                    if symbol:
                        a["stamp"] = symbol
                        if symbol not in stamps:
                            missing[symbol] += 1
                    if text:
                        a["text"] = en.get(text, text)
                        if es.get(text) and es[text] != a["text"]:
                            a["es"] = es[text]
                        if text not in en:
                            missing[text] += 1
                    cur["annotations"].append(a)
                    continue
                raise SystemExit(f"{os.path.basename(path)}: línea que no sé leer: {line!r}")
    for s in out:
        if s["note"] is None:
            del s["note"]
    return out, missing


# Un escondite trae `buildingX/Y`, el edificio donde se esconde el botín. Nueve de los 125 (EkronStashMap6/7/8,
# IrvingtonStashMap9/10, MulStashMap19, WorldStashMap6/21/23) traen en su lugar un 1, 2, 3… 8: un número, no una casilla,
# y mandar al visor a (1, 0) es mandarlo a la esquina del mundo. En los otros 116 el punto cae a 74 casillas o menos de
# alguna de sus anotaciones (la mayoría, justo encima de una); en los nueve, a más de 8.000. Por eso el criterio es
# geométrico y con mucho aire: un punto sin ninguna anotación a menos de STASH_REACH casillas no es un punto de ese mapa.
# El margen aguanta que un parche corra un escondite unas casillas sin que cambie cuáles se consideran propios.
STASH_REACH = 300


def place_stashes(stl):
    """
    Le da a cada escondite un punto que de verdad esté donde lo que dibuja. Si el `building` del juego es uno
    de verdad (alguna anotación a STASH_REACH casillas o menos) queda como está; si no, el punto pasa a ser el
    centro de sus anotaciones (el promedio, a la casilla), y el valor del juego se guarda en `buildingRaw`
    para que se vea por qué se corrió (y para que el visor sepa que es aproximado). Devuelve cuántos se corrieron.
    """
    moved = 0
    for s in stl:
        pts = [(a["x"], a["y"]) for a in s["annotations"]]
        b = s.get("building")
        if b and None not in b and any(math.dist(b, p) <= STASH_REACH for p in pts):
            continue
        if not pts:
            raise SystemExit(f"{s['id']}: el punto del juego es {b} y no tiene anotaciones para sacar otro: revisar place_stashes")
        s["buildingRaw"] = b
        s["building"] = [rnd(sum(p[0] for p in pts) / len(pts)), rnd(sum(p[1] for p in pts) / len(pts))]
        moved += 1
    return moved


def copy_stamps(stamps):
    """
    Los sellos del juego, tal cual (PNG, mismo nombre): son blancos sobre transparente y el
    juego los tiñe con el color de cada anotación; el sitio hace lo mismo usándolos como
    máscara CSS. Son 64×64 y pesan poco: no vale la pena pasarlos a WebP.
    """
    src = os.path.join(PZ_DIR, "media", "ui", "LootableMaps")
    dst = os.path.join(PUBLIC, "stamps")
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    total = 0
    for path in sorted(glob.glob(os.path.join(src, "map_*.png"))):
        out = os.path.join(dst, os.path.basename(path))
        shutil.copyfile(path, out)
        total += os.path.getsize(out)
    n = len(os.listdir(dst))
    unused = sorted(set(os.listdir(dst)) - {s["file"] for s in stamps.values()})
    print(f"  {rel(dst)}: {n} sellos, {total / 1e3:.0f} KB" + (f" (sin nombre en el juego: {', '.join(unused)})" if unused else ""))


# ─────────────────────── los datos partidos para la web ───────────────────────
# Los JSON de arriba son el dato completo (vector.json solo pesa 1,1 MB, buildings.json 3,7 MB).
# El visor del sitio no puede bajarlos enteros para mirar un barrio: acá se parten en una grilla
# de 1.500 casillas, así pide sólo las regiones que se ven. Todo con las mismas coordenadas de
# casillas del mundo que los de origen (no hay coordenadas locales que sumar ni restar).

REGION = 1500
# El tope de un archivo de región del dibujo (regions/) o de zonas (zones/): lo que el visor baja por cada una a la
# vista. Louisville es la región más densa: si un parche hace pasar el tope a una, hay que partirla antes de publicar
# (el test lo frena igual).
MAX_REGION_BYTES = 250_000
# Los edificios (bld/) no entran en ese tope: se piden de a uno, al tocar un edificio, y el de Louisville pesa 1,1 MB.
# Tienen el suyo, holgado: no frena el tamaño de hoy sino que un parche no lo duplique sin que nadie se entere.
MAX_BLD_BYTES = 1_500_000
MAX_COMMON_BYTES = 500_000
# Las historias de bosque, lago y playa son cientos de zonas del mismo tipo (dónde el juego puede armar un
# campamento o un accidente al azar): llenarían el buscador de "Forest". Siguen en el mapa, como capa.
GENERIC_STORIES = {"Forest", "forest", "Lake", "Beach"}
# Dos historias con el mismo nombre a menos de tanto una de la otra son el mismo lugar (el "Festival Grounds" de
# Louisville son dos zonas a 75 casillas): una sola entrada en el buscador, en el medio de las dos.
STORY_MERGE = 300
# Lo que el buscador no muestra: los textos de los escondites con insultos o groserías (ver search_entries).
RUDE = re.compile(
    r"\b(?:\w*fuck\w*|shit\w*|bitch\w*|dick(?:head)?s?|asshole|bastard|bleach|kill (?:yuor|your) ?self|"
    r"puta|gilipollas|cabr[oó]n\w*|imb[eé]cil\w*|idiota|mierda|jod(?:er|id\w+)|suic[ií]d\w*|cloro)\b",
    re.I)


def region_span(lo, hi):
    """
    Las columnas (o filas) de la grilla que cubre el intervalo [lo, hi). El extremo de arriba no
    cuenta: un edificio que termina justo en 1.500 es de la región 0, no de la 1. Uno sin ancho
    (lo == hi) cae igual en la región donde está.
    """
    return range(lo // REGION, -(-max(hi, lo + 1) // REGION))


def regions_of(x1, y1, x2, y2, bounds=None):
    """
    Las regiones (rx, ry) que toca la caja. Con `bounds` ([x1, y1, x2, y2] del mapa) se dejan afuera las celdas que
    caen enteras fuera: una zona que asoma una casilla por el borde (x = −1) no inventa una región de puro vacío.
    El borde de arriba cuenta (un punto justo en bounds[2] es del mapa); el de abajo no, como en region_span.
    """
    cells = [(rx, ry) for rx in region_span(x1, x2) for ry in region_span(y1, y2)]
    if bounds is None:
        return cells
    bx1, by1, bx2, by2 = bounds
    return [(rx, ry) for rx, ry in cells
            if rx * REGION <= bx2 and (rx + 1) * REGION > bx1 and ry * REGION <= by2 and (ry + 1) * REGION > by1]


def ring_box(flat):
    return min(flat[0::2]), min(flat[1::2]), max(flat[0::2]), max(flat[1::2])


def zone_tuple(z):
    """
    Una zona rectangular de zones.json como [x, y, ancho, alto], más su nombre si tiene, más lo propio
    de su tipo ({z: piso, d: dirección, stair: escalera}) si tiene. Si hay extras sin nombre, el nombre
    va vacío: así el lugar de cada cosa no cambia y cada zona pesa lo que tiene que pesar.
    """
    t = list(z["r"])
    extra = {k: z[k] for k in ("z", "d", "stair") if k in z}
    if z.get("n") or extra:
        t.append(z.get("n", ""))
    if extra:
        t.append(extra)
    return t


def split_regions(vec, zd, bd):
    """
    Reparte cada objeto del mapa entre las regiones que toca (por su caja): uno que cruza una frontera va
    en cada lado, igual en los dos, y el visor lo dibuja dos veces sin que se note (los polígonos son
    rellenos sin borde). Para las capas con clic el visor tiene que deduplicar, y no alcanza con la posición:
    la clave es `tipo|x,y,w,h|nombre|extras` (las zonas de un mismo rectángulo que sólo se distinguen por el piso `z`,
    o por la dirección `d` de un estacionamiento, son cosas distintas y las dos tienen que quedar). Las capas van
    siempre en el mismo orden y las vacías no se escriben, así cada archivo es determinista y no lleva nada de más.
    Las zonas, además, no van a regiones que caen enteras fuera de los límites del mapa (ver regions_of).

    Devuelve tres reparticiones: el dibujo (el mapa de papel), las zonas (las capas del juego) y los
    edificios con sus pisos. Cada una tiene su archivo por región porque se piden en momentos distintos.
    """
    draw, zones, blds = defaultdict(dict), defaultdict(dict), defaultdict(list)
    bounds = vec["bounds"]

    def put(layer, ring, item, sub=None):
        for key in regions_of(*ring_box(ring)):
            if sub is None:
                draw[key].setdefault(layer, []).append(item)
            else:
                draw[key].setdefault(layer, {}).setdefault(sub, []).append(item)

    for t, polys in vec["buildings"].items():
        for p in polys:
            put("b", p[0], p, t)
    for t, polys in vec["roads"].items():
        for p in polys:
            put("roads", p[0], p, t)
    for t, lines in vec["roadLines"].items():
        for line in lines:
            put("roadLines", line, line, t)
    for layer in ("water", "railway", "wood", "driveways"):
        for p in vec[layer]:
            put(layer, p[0], p)

    for kind, zs in zd["zones"].items():
        for z in zs:
            if "r" in z:
                x, y, w, h = z["r"]
                for key in regions_of(x, y, x + w, y + h, bounds):
                    zones[key].setdefault("zones", {}).setdefault(kind, []).append(zone_tuple(z))
    # Las zonas con forma de polígono, aparte y enteras: la caja del polígono no es su forma.
    for kind, zs in zd["zones"].items():
        for z in zs:
            if "p" in z:
                for key in regions_of(*ring_box(z["p"]), bounds):
                    zones[key].setdefault("zonesP", {}).setdefault(kind, []).append(z)

    for b in bd["buildings"]:
        for key in regions_of(*b["box"]):
            blds[key].append(b)
    return draw, zones, blds


def area2(ring):
    """El doble del área con signo de un anillo plano [x0, y0, x1, y1, …] (fórmula del cordón), con la y hacia abajo."""
    xs, ys = ring[0::2], ring[1::2]
    n = len(xs)
    return sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n))


def wind(poly):
    """
    El mismo polígono con el giro normalizado: el anillo de afuera con área positiva y los huecos con negativa. Los
    anillos que giran al revés se recorren al revés (los mismos puntos); uno sin área no tiene giro y queda como está.

    El juego guarda cada polígono con el giro que le salió (57 rutas y una vía giran al revés del resto), y el visor junta
    todos los polígonos de un color en un solo camino con la regla `nonzero`: dos que se pisan y giran en sentidos
    opuestos suman +1 y −1 y la zona en común queda vacía, un hueco en la ruta justo donde se cruza con otra. Con todos
    girando igual se suman y se rellena la unión.
    """
    return [flat(list(zip(ring[0::2], ring[1::2]))[::-1]) if (1 if i == 0 else -1) * area2(ring) < 0 else ring
            for i, ring in enumerate(poly)]


def wind_draw(draw):
    """El dibujo de las regiones (lo que devuelve split_regions) con todos los polígonos girando igual (ver wind)."""
    out = {}
    for key, layers in draw.items():
        out[key] = {}
        for layer, v in layers.items():
            if layer == "roadLines":  # líneas, no polígonos: no giran
                out[key][layer] = v
            elif isinstance(v, dict):
                out[key][layer] = {sub: [wind(p) for p in polys] for sub, polys in v.items()}
            else:
                out[key][layer] = [wind(p) for p in v]
    return out


def split_words(name):
    """'KnoxBank' → 'Knox Bank', 'nolans' → 'Nolans': el nombre del juego cuando no trae texto propio."""
    words = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", name)
    return words[:1].upper() + words[1:]


def place_names():
    """
    Cómo llama el juego a un lugar por su nombre interno ("KnoxBank", "Baseball"): IG_UI.json trae una
    "IGUI_<Nombre>Key" (la etiqueta de la llave de ese edificio) o una "IGUI_<Nombre>". Devuelve una función
    nombre → (en, es); lo que el juego no traduce se separa en palabras y queda igual en los dos idiomas.
    """
    en, es = translations("IG_UI.json", "EN"), translations("IG_UI.json", ES)
    lower = {k.lower(): k for k in en}

    def names(name):
        for pat in ("IGUI_%sKey", "IGUI_%s"):
            key = lower.get((pat % name).lower())
            if key:
                return en[key], es.get(key) or en[key]
        n = split_words(name)
        return n, n

    return names


def search_entries(lbs, vec, st, stl, zd, zdefs):
    """
    El buscador de la pestaña Mapa: { k, en, es, x, y } por cada cosa que se puede ir a buscar.
      town      los pueblos (la etiqueta del mapa; si worldmap.xml trae su punto, ése: es el centro del pueblo)
      building  los edificios con nombre (regions.lua) y los rótulos de lugares del mapa de papel
      street    una entrada por nombre de calle, en la etiqueta de su tramo más largo
      story     las historias con nombre propio (sin las genéricas de bosque, lago y playa, y sin las que el juego no arma
                nunca: ver story_zone_names); las que se repiten
                en varios lugares llevan el pueblo más cercano ("Baseball Diamond (Riverside)"), y las que son dos
                zonas pegadas del mismo lugar, una sola entrada
      stash     cada mapa anotado, con el texto que el jugador lee en él (es lo que recuerda del mapa) y su pueblo,
                en el punto de `building` (el del juego, o el centro de sus anotaciones si el juego no trae casilla).
                Si ese texto es un insulto o una grosería el buscador no lo indexa: "Stash map 6 (Ekron)". Las notas
                siguen enteras en common.stashes: ahí son el dibujo del mapa, tal cual el juego.
    Las calles no se traducen (KY-79, Main St); los pueblos y lugares, si el juego los traduce, sí.
    """
    hits, seen = [], set()

    def add(k, en, es, x, y):
        hits.append({"k": k, "en": en, "es": es, "x": rnd(x), "y": rnd(y)})

    def norm(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())

    places = {norm(p["name"]): p for p in vec["places"]}
    town_labels = sorted((lb for lb in lbs if lb["layer"] == "text-town"), key=lambda lb: lb["text"])
    for lb in town_labels:
        en = lb["text"].title()
        p = places.get(norm(en))
        add("town", en, lb.get("es", lb["text"]).title(), *((p["x"], p["y"]) if p else (lb["x"], lb["y"])))

    names = place_names()
    named = []
    for z in zd["zones"].get("BuildingName", []):
        if "r" in z and z.get("n"):
            x, y, w, h = z["r"]
            named.append((*names(z["n"]), x + w / 2, y + h / 2))
    for lb in lbs:
        if lb["layer"] in ("text-building", "text-place"):
            en = lb["text"].replace("\n", " ")
            named.append((en, lb.get("es", lb["text"]).replace("\n", " "), lb["x"], lb["y"]))
    # El edificio con nombre de regions.lua va primero: su punto es el del edificio, no el del rótulo.
    for en, es, x, y in named:
        if norm(en) not in seen:
            seen.add(norm(en))
            add("building", en, es, x, y)

    longest = {}
    for s in st:
        pts = s["points"]
        length = sum(math.dist(pts[i:i + 2], pts[i + 2:i + 4]) for i in range(0, len(pts) - 2, 2))
        if s["name"] not in longest or length > longest[s["name"]][0]:
            longest[s["name"]] = (length, s["label"])
    for name in sorted(longest, key=str.lower):
        add("street", name, name, *longest[name][1][:2])

    # Las historias con nombre, agrupadas por nombre. Las del mismo nombre a menos de STORY_MERGE casillas son un solo
    # lugar (una entrada, en el promedio). Si el nombre queda en dos lugares de verdad, cada uno lleva el pueblo más
    # cercano: sin eso el buscador muestra dos "Baseball Diamond" iguales y no se sabe a cuál va cada uno.
    groups = defaultdict(list)
    for z in zd["zones"].get("ZoneStory", []):
        if "r" in z and z.get("n") and z["n"] not in GENERIC_STORIES and z["n"] in zdefs["stories"]:
            x, y, w, h = z["r"]
            cx, cy = x + w / 2, y + h / 2
            en, es = names(z["n"])
            sites = groups[norm(en)]
            for site in sites:
                if math.dist((cx, cy), (site["x"], site["y"])) <= STORY_MERGE:
                    site["pts"].append((cx, cy))
                    site["x"] = sum(p[0] for p in site["pts"]) / len(site["pts"])
                    site["y"] = sum(p[1] for p in site["pts"]) / len(site["pts"])
                    break
            else:
                sites.append({"en": en, "es": es, "x": cx, "y": cy, "pts": [(cx, cy)]})
    towns = [h for h in hits if h["k"] == "town"]
    for sites in groups.values():
        for site in sites:
            en, es = site["en"], site["es"]
            if len(sites) > 1:
                near = min(towns, key=lambda t: math.dist((t["x"], t["y"]), (site["x"], site["y"])))
                en, es = f"{en} ({near['en']})", f"{es} ({near['es']})"
            add("story", en, es, site["x"], site["y"])

    for s in stl:
        texts = [(a["text"], a.get("es", a["text"])) for a in s["annotations"] if a.get("text")][:3]
        # Lo que se ve en el buscador es lo que se indexa: si alguno de esos textos es un insulto (el mapa de
        # EkronStashMap6 es una burla al que lo lee), la entrada queda con la etiqueta neutra de los que no traen texto.
        if any(RUDE.search(t) for pair in texts for t in pair):
            texts = []
        where = s["town"] or s.get("near")
        suffix = f" ({where})" if where else ""
        if texts:
            en, es = " · ".join(t[0] for t in texts), " · ".join(t[1] for t in texts)
        else:
            n = re.search(r"(\d+)$", s["id"])
            en, es = "Stash map" + (f" {n.group(1)}" if n else ""), "Mapa de escondite" + (f" {n.group(1)}" if n else "")
        add("stash", en + suffix, es + suffix, *s["building"])
    return hits


def write_web(vec, zd, bd, lbs, st, stl, stamps, sp, items, zdefs, zombies):
    """
    games/zomboid/data/map/web/:
      regions/<rx>_<ry>.json  el dibujo de esa región de 1.500 casillas: b = edificios por tipo, roads, roadLines,
                              water, railway, wood, driveways (los polígonos de vector.json, con el giro normalizado)
      zones/<rx>_<ry>.json    sus zonas para las capas del juego: zones = rectángulos por tipo,
                              [x, y, ancho, alto, nombre?, {z, d, stair}?]; zonesP = los polígonos, tal cual
      bld/<rx>_<ry>.json      sus edificios con pisos y habitaciones (los de buildings.json, tal cual)
      common.json             lo que no depende del lugar, y la lista de regiones con su caja y qué archivos tiene
      search.json             las entradas del buscador
      zombies.bin             la densidad de zombis (ver zombie_density): deflate crudo de w*h bytes, fila por fila, un
                              byte por chunk de `cell`×`cell` casillas desde (0, 0); common.json trae zombies = { w, h, cell, max }
    Son tres archivos por región porque se piden en momentos distintos: el dibujo siempre, las zonas sólo si hay
    una capa prendida y los edificios sólo al tocar uno. Juntos, Louisville (8_1) pesa 1,4 MB contra 170 KB del
    dibujo solo, y el visor nunca necesita todo a la vez.
    Cada archivo sólo se reescribe si cambia; los que ya no salen (una región que un parche vació) se borran.

    Contrato para quien lo lee (el visor): common.json trae `regions: [{ id, box, draw?: 1, zones?: 1, bld?: 1 }]`, con
    `id` = "<rx>_<ry>" (rx = x // 1500, ry = y // 1500), `box` = [x1, y1, x2, y2] de la celda, y cada marca en 1 sólo si la
    región tiene ese archivo: hay que pedir web/regions/<id>.json si `draw`, web/zones/<id>.json si `zones` y
    web/bld/<id>.json si `bld`. Una región sin marca no tiene archivo (pedirlo es un 404). Todas las coordenadas son
    casillas del mundo, enteras, y un objeto que cruza una frontera está en cada región que toca. La forma de cada uno:
      regions/<id>.json  { b?: { <tipo de edificio>: Polígono[] }, roads?: { <clase>: Polígono[] },
                           roadLines?: { <clase>: Línea[] }, water?, railway?, wood?, driveways?: Polígono[] }
                         Polígono = [anillo, ...huecos], anillo = [x0, y0, x1, y1, …]; Línea = [x0, y0, x1, y1, …].
                         Todos los polígonos giran igual (wind): el anillo de afuera con área positiva (fórmula del
                         cordón, y hacia abajo) y los huecos con negativa. El visor rellena los polígonos de un color juntos
                         con `nonzero`, y con giros opuestos dos que se pisan se anularían. Los de vector.json, en cambio,
                         van tal cual los guarda el juego.
                         Lo que no hay en la región no se escribe (leer con `?? {}`).
      zones/<id>.json    { zones?: { <tipo>: [x, y, ancho, alto, nombre?, { z?, d?, stair? }?][] },
                           zonesP?: { <tipo>: { p: anillo, n?, z?, line? }[] } }
                         El nombre va vacío ("") si hay extras y no hay nombre. Como hay zonas idénticas que sólo
                         difieren en el piso o la dirección, la clave para deduplicar es `tipo|x,y,w,h|nombre|extras`.
      bld/<id>.json      [{ id, box: [x1, y1, x2, y2], type?, tone?, name?, parts?, floors: { <piso>: Habitación[] } }]
                         Habitación = [índice en common.rooms, x, y, ancho, alto, x, y, ancho, alto, …]; el piso es
                         "0" (planta baja), "1", "-1"… como texto.
      common.json        { style, bounds, rooms: string[], places, labels, streets, stamps, stashes, spawns, items,
                         zoneDefs, zombies, regions }.
                         zoneDefs = { zombies: { <nombre>: <tabla> }, vehicles: string[] }: los nombres de zona que el juego
                         define (ver zone_defs); el visor traduce sólo esos.
                         stashes[i].building es el punto del escondite; si trae `buildingRaw`, el juego no traía casilla
                         y `building` es el centro de sus anotaciones (un punto aproximado).
                         items = { "<Base.Objeto>": { id, en, es } }: la ficha de los objetos que nombran los escondites
                         (su `item` y el de sus `containers`), para enlazarlos (ver stash_items).
      search.json        [{ k: "town"|"building"|"street"|"story"|"stash", en, es, x, y }], para ir a una casilla.
    Las zonas no van a regiones que caen enteras fuera de `bounds` (no hay región "-1_6" de puro vacío).
    """
    kinds = dict(zip(("draw", "zones", "bld"), split_regions(vec, zd, bd)))
    kinds["draw"] = wind_draw(kinds["draw"])
    keys = sorted(set().union(*kinds.values()))

    def rid(k):
        return f"{k[0]}_{k[1]}"

    def sync(sub, files):
        """Escribe los archivos de `sub` que cambiaron y borra los que sobran. Devuelve {nombre: bytes}."""
        os.makedirs(os.path.join(WEB, sub), exist_ok=True)
        sizes = {name: os.path.getsize(write_json(f"web/{sub}/{name}.json", data)) for name, data in files.items()}
        for f in os.listdir(os.path.join(WEB, sub)):
            if f.endswith(".json") and f[:-5] not in files:
                os.remove(os.path.join(WEB, sub, f))
        return sizes

    sizes = {"draw": sync("regions", {rid(k): v for k, v in sorted(kinds["draw"].items())}),
             "zones": sync("zones", {rid(k): v for k, v in sorted(kinds["zones"].items())}),
             "bld": sync("bld", {rid(k): v for k, v in sorted(kinds["bld"].items())})}
    # Cada región dice qué archivos tiene (sólo los que tiene): el visor no pide los que no existen.
    common = {"style": vec["style"], "bounds": vec["bounds"], "rooms": bd["rooms"], "places": vec["places"],
              "labels": lbs, "streets": st, "stamps": stamps, "stashes": stl, "spawns": sp, "items": items,
              "zoneDefs": zdefs, "zombies": zombies,
              "regions": [{"id": rid(k), "box": [k[0] * REGION, k[1] * REGION, (k[0] + 1) * REGION, (k[1] + 1) * REGION],
                           **{f: 1 for f in kinds if k in kinds[f]}} for k in keys]}
    search = search_entries(lbs, vec, st, stl, zd, zdefs)
    return {"sizes": sizes, "common": write_json("web/common.json", common),
            "search": write_json("web/search.json", search), "hits": search}


def gzipped(path):
    with open(path, "rb") as f:
        return len(gzip.compress(f.read(), 9))


def print_web(w):
    """Cuántos archivos, cuánto pesan (crudo y con gzip, como los sirve Netlify) y si alguno pasa el tope."""
    for f, sub in (("draw", "regions"), ("zones", "zones"), ("bld", "bld")):
        sizes = w["sizes"][f]
        gz = {n: gzipped(os.path.join(WEB, sub, n + ".json")) for n in sizes}
        big = max(sizes, key=sizes.get)
        print(f"  web/{sub}: {len(sizes)} archivos, {sum(sizes.values()) / 1e3:.0f} KB; el más grande {big} "
              f"{sizes[big] / 1e3:.0f} KB ({gz[big] / 1e3:.0f} KB gzip), el promedio {sum(sizes.values()) / len(sizes) / 1e3:.0f} KB "
              f"({sum(gz.values()) / len(gz) / 1e3:.0f} KB gzip)")
        limit = MAX_BLD_BYTES if f == "bld" else MAX_REGION_BYTES
        over = {k: v for k, v in sizes.items() if v > limit}
        if over:
            print(f"  ← ¡PASAN EL TOPE DE {limit // 1000} KB: {over}! Hay que partir esas regiones.")
    for key in ("common", "search"):
        path = w[key]
        print(f"  {rel(path)}: {kb(path):.0f} KB ({gzipped(path) / 1e3:.0f} KB gzip)"
              + (f" ← ¡PASA EL TOPE DE {MAX_COMMON_BYTES // 1000} KB!" if key == "common" and kb(path) * 1e3 > MAX_COMMON_BYTES else "")
              + (f", {len(w['hits'])} entradas ({dict(Counter(h['k'] for h in w['hits']))})" if key == "search" else ""))


# ─────────────────────────────── control ───────────────────────────────

def proof_image(out_dir, vec, blds, zones_data, center=(10600, 9600), half=260, scale=3):
    """
    Una imagen para mirar a ojo que todo cae en el mismo lugar: las teselas (nivel 0) de
    fondo, encima el contorno de los edificios de worldmap.xml (amarillo), las habitaciones
    de la planta baja de los .lotheader (cian), los estacionamientos de objects.lua
    (magenta) y las calles de streets.xml (blanco).
    """
    from PIL import ImageDraw
    x0, y0 = center[0] - half, center[1] - half
    size = 2 * half
    bg = Image.new("RGB", (size, size))
    with zipfile.ZipFile(os.path.join(WORLD, "pyramid.zip")) as z:
        for tx in range(x0 // TILE, (x0 + size) // TILE + 1):
            for ty in range(y0 // TILE, (y0 + size) // TILE + 1):
                n = f"0/tile{tx}x{ty}.png"
                if n in z.namelist():
                    bg.paste(Image.open(io.BytesIO(z.read(n))).convert("RGB"), (tx * TILE - x0, ty * TILE - y0))
    im = bg.resize((size * scale, size * scale), Image.NEAREST)
    d = ImageDraw.Draw(im)

    def P(x, y):
        return ((x - x0) * scale, (y - y0) * scale)

    for b in blds["buildings"]:
        for room in b["floors"].get("0", []):
            for i in range(1, len(room), 4):
                rx, ry, rw, rh = room[i:i + 4]
                if rx + rw >= x0 and rx <= x0 + size and ry + rh >= y0 and ry <= y0 + size:
                    d.rectangle([P(rx, ry), P(rx + rw, ry + rh)], outline=(0, 255, 255))
    for polys in vec["buildings"].values():
        for poly in polys:
            r = poly[0]
            pts = [P(r[i], r[i + 1]) for i in range(0, len(r), 2)]
            if any(0 <= px < size * scale and 0 <= py < size * scale for px, py in pts):
                d.polygon(pts, outline=(255, 230, 0))
    for zn in zones_data["zones"].get("ParkingStall", []):
        if "r" in zn:
            rx, ry, rw, rh = zn["r"]
            if x0 <= rx <= x0 + size and y0 <= ry <= y0 + size:
                d.rectangle([P(rx, ry), P(rx + rw, ry + rh)], outline=(255, 0, 255))
    for s in vec.get("_streets", []):
        pts = [P(s["points"][i], s["points"][i + 1]) for i in range(0, len(s["points"]), 2)]
        d.line(pts, fill=(255, 255, 255), width=1)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"control_{center[0]}_{center[1]}.png")
    im.save(path)
    return path


def tile_offset_check(blds, windows=((10200, 9200, 11300, 10700), (5700, 5100, 7000, 5700)), reach=4):
    """
    Control numérico de las teselas contra los .lotheader: se miran los píxeles de las
    habitaciones de la planta baja (Muldraugh y Riverside) y se cuenta cuántos tienen color
    "de edificio" (piso gris claro o pared rojiza; afuera hay pasto, tierra o calle). Se
    repite corriendo todo de −4 a +4 casillas en x y en y: si las coordenadas coinciden, el
    máximo tiene que dar en (0, 0). Devuelve (mejor corrimiento, % en 0, % promedio corrido 4).
    """
    rects = []
    for b in blds["buildings"]:
        for room in b["floors"].get("0", []):
            for i in range(1, len(room), 4):
                x, y, w, h = room[i:i + 4]
                if any(x0 <= x and x + w <= x1 and y0 <= y and y + h <= y1 for x0, y0, x1, y1 in windows):
                    rects.append((x, y, w, h))
    tiles = {}
    with zipfile.ZipFile(os.path.join(WORLD, "pyramid.zip")) as z:
        for x0, y0, x1, y1 in windows:
            for tx in range((x0 - reach) // TILE, (x1 + reach) // TILE + 1):
                for ty in range((y0 - reach) // TILE, (y1 + reach) // TILE + 1):
                    tiles[(tx, ty)] = Image.open(io.BytesIO(z.read(f"0/tile{tx}x{ty}.png"))).convert("RGB")

    def building(x, y):
        r, g, b = tiles[(x // TILE, y // TILE)].getpixel((x % TILE, y % TILE))
        grey = abs(r - g) < 18 and abs(g - b) < 18 and r > 120
        wall = r > 120 and r > g + 40 and r > b + 40
        return grey or wall

    squares = [(x + i, y + j) for x, y, w, h in rects for i in range(w) for j in range(h)]
    score = {(dx, dy): sum(building(x + dx, y + dy) for x, y in squares) / len(squares)
             for dx in range(-reach, reach + 1) for dy in range(-reach, reach + 1)}
    best = max(score, key=score.get)
    far = [v for (dx, dy), v in score.items() if max(abs(dx), abs(dy)) == reach]
    return best, score[(0, 0)], sum(far) / len(far), len(rects)


# ─────────────────────────────── main ───────────────────────────────

def kb(path):
    return os.path.getsize(path) / 1e3


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--sin-teselas", action="store_true", help="no rehacer las teselas (tardan unos minutos)")
    ap.add_argument("--prueba", metavar="DIR", help="guardar en DIR una imagen de control de coordenadas")
    args = ap.parse_args()
    # stderr también: los cortes llevan tildes. `backslashreplace` para que una ruta rara (un nombre de archivo que no es
    # UTF-8 válido) salga escapada en vez de tirar otro error encima del corte.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    if not os.path.isdir(WORLD):
        raise SystemExit(f"No encuentro el mapa del juego en {WORLD} (¿PZ_DIR?)")

    print("Teselas")
    tiles = {"tileSize": TILE,
             "crs": "z = 4 − nivel del juego; con CRS simple y Transformation(1/16, 0, 1/16, 0), "
                    "latLng(y, x) es la casilla (x, y) y el zoom 4 es 1 píxel por casilla"}
    if not args.sin_teselas:
        sat = make_tiles("pyramid.zip", "sat", "sat")
        forest = make_tiles("forest.pyramid.zip", "forest", "forest", min_level=FOREST_MIN_LEVEL)
        tiles["sat"] = {"url": "/zomboid/map/sat/{z}/{x}_{y}.webp", "minZoom": 0, **sat,
                        "lossless": sorted(sat["maxNativeZoom"] - lv for lv in LOSSLESS_LEVELS)}
        tiles["forest"] = {"url": "/zomboid/map/forest/{z}/{x}_{y}.webp", "minZoom": 0, **forest,
                           "color": list(FOREST_RGB)}
        for t in (tiles["sat"], tiles["forest"]):
            del t["bytes"]
        write_json("tiles.json", tiles)
    else:
        print("  (salteadas)")

    print("Mapa de papel")
    features = list(read_worldmap())
    vec, skipped = vector(features)
    p = write_json("vector.json", vec)
    nb = sum(len(v) for v in vec["buildings"].values())
    nr = sum(len(v) for v in vec["roads"].values())
    print(f"  {rel(p)}: {kb(p):.0f} KB · {len(features)} features → {nb} edificios "
          f"({', '.join(f'{k} {len(v)}' for k, v in vec['buildings'].items())}), {nr} tramos de ruta "
          f"({', '.join(f'{k} {len(v)}' for k, v in vec['roads'].items())}), "
          f"{sum(len(v) for v in vec['roadLines'].values())} senderos como línea, {len(vec['water'])} de agua, "
          f"{len(vec['railway'])} de vías, {len(vec['wood'])} de bosque, {len(vec['driveways'])} entradas, "
          f"{len(vec['places'])} lugares; salteados: {dict(skipped)}")

    st = streets()
    p = write_json("streets.json", st)
    print(f"  {rel(p)}: {kb(p):.0f} KB · {len(st)} calles, {len({s['name'] for s in st})} nombres distintos")

    lbs = annotations()
    towns = [{"key": lb["key"], "name": lb["text"], "x": lb["x"], "y": lb["y"]} for lb in lbs if lb["layer"] == "text-town"]
    p = write_json("labels.json", {"labels": lbs, "towns": towns, "places": vec["places"]})
    print(f"  {rel(p)}: {kb(p):.0f} KB · {len(lbs)} textos ({dict(Counter(lb['layer'] for lb in lbs))}), {len(towns)} pueblos")

    print("Zonas y spawns")
    zd, spawn_zones, ignored = zones()
    p = write_json("zones.json", zd)
    print(f"  {rel(p)}: {kb(p):.0f} KB · " + ", ".join(f"{k} {len(v)}" for k, v in zd["zones"].items())
          + f"; fuera: {dict(ignored)}")
    sp = spawns(spawn_zones)
    p = write_json("spawns.json", sp)
    print(f"  {rel(p)}: {kb(p):.0f} KB · {len(sp['towns'])} ciudades con "
          f"{sum(len(t['points']) for t in sp['towns'])} puntos, {len(sp['zones'])} SpawnPoint de objects.lua")

    print("Edificios")
    bpolys = [(props, [flat(clean_ring(r)) for r in rings]) for props, gtype, rings in features
              if gtype == "Polygon" and "building" in props]
    named = [(zn["n"], zn["r"]) for zn in zd["zones"].get("BuildingName", []) if "r" in zn]
    bd, matched, checked, nfiles, merged = buildings(bpolys, named)
    p = write_json("buildings.json", bd)
    nrooms = sum(len(v) for b in bd["buildings"] for v in b["floors"].values())
    print(f"  {rel(p)}: {kb(p):.0f} KB · {nfiles} lotheader → {len(bd['buildings'])} edificios, {nrooms} habitaciones, "
          f"{len(bd['rooms'])} nombres de habitación; {matched}/{checked} ({matched / checked:.1%}) caen sobre un "
          f"polígono de edificio de worldmap.xml; {sum('name' in b for b in bd['buildings'])} con nombre propio "
          f"(de {len(named)} BuildingName); {merged} sótanos sumados al edificio de arriba")

    print("Escondites")
    stamps = stamp_defs()
    stl, missing = stashes(stamps)
    # Primero el punto (los nueve con número en vez de casilla pasan al centro de sus anotaciones) y recién después
    # el pueblo: el más cercano sale del punto bueno, no del 1 de "buildingX = 1" (que los dejaba en "Brandenburg").
    moved = place_stashes(stl)
    # Los de WorldStashDesc.lua no son de ningún pueblo (casas en el campo): se les anota el
    # pueblo más cercano para poder agruparlos igual.
    for s in stl:
        if s["town"] is None and s.get("building") and towns:
            bx, by = s["building"]
            near = min(towns, key=lambda t: math.dist((bx, by), (t["x"], t["y"])))
            s["near"] = near["name"].title()
    p = write_json("stashes.json", {"stamps": stamps, "stashes": stl})
    print(f"  {rel(p)}: {kb(p):.0f} KB · {len(stl)} mapas anotados, {sum(len(s['annotations']) for s in stl)} anotaciones, "
          f"{sum(len(s.get('containers', [])) for s in stl)} contenedores; {moved} sin casilla propia en el juego, con el "
          f"centro de sus anotaciones" + (f"; sin definir: {dict(missing)}" if missing else ""))
    copy_stamps(stamps)

    print("Datos para la web")
    items = stash_items(stl)
    print(f"  {len(items)} objetos de los escondites con ficha")
    zdefs = zone_defs()
    print(f"  {len(zdefs['zombies'])} tipos de zombi y {len(zdefs['vehicles'])} de vehículo definidos en el juego")
    zh, zp, znz = zombie_density()
    print(f"  {rel(zp)}: {kb(zp):.0f} KB · {zh['w']}×{zh['h']} chunks de {zh['cell']}×{zh['cell']}, {znz} con zombis, "
          f"máximo {zh['max']}")
    # Las medidas del mapa de las teselas (19968×16128 en la 42.21), de las teselas de esta corrida o, con --sin-teselas,
    # del tiles.json que ya está: si un parche agranda el mundo, el aviso compara con lo nuevo y no con un número fijo.
    sat = tiles.get("sat")
    if sat is None and os.path.exists(os.path.join(DATA, "tiles.json")):
        with open(os.path.join(DATA, "tiles.json"), encoding="utf-8") as f:
            sat = json.load(f).get("sat")
    if sat:
        tw, th = sat["bounds"][2], sat["bounds"][3]
        if (zh["w"] * zh["cell"], zh["h"] * zh["cell"]) != (tw, th):
            print(f"  ← ¡LA GRILLA NO CUBRE EL MAPA DE LAS TESELAS ({tw}×{th})!")
    w = write_web(vec, zd, bd, lbs, st, stl, stamps, sp, items, zdefs, zh)
    print_web(w)

    p, meta, changed = write_meta(map_counts(bd, st, stl, zd, sp, zdefs))
    print(f"  {rel(p)}: datos {'cambiaron' if changed else 'sin cambios'} ({meta['extractedAt']}), {meta['counts']}")

    ov = write_overview(vec["bounds"])
    print(f"  {rel(ov[0])}: {ov[1][0]}×{ov[1][1]} px, {kb(ov[0]):.0f} KB" if ov
          else "  (sin teselas del nivel 0: no hay vista del mapa entero)")

    print("Control de coordenadas")
    best, at0, far, nrect = tile_offset_check(bd)
    print(f"  teselas vs .lotheader ({nrect} habitaciones): {at0:.0%} de sus casillas tienen color de edificio "
          f"(corridas 4 casillas: {far:.0%}); el mejor corrimiento es {best}"
          + ("" if best == (0, 0) else "  ← ¡NO COINCIDEN!"))
    mul = next((t for t in towns if t["key"] == "MapLabel_Muldraugh"), None)
    place = next((pl for pl in vec["places"] if pl["name"] == "Muldraugh"), None)
    print(f"  Muldraugh: etiqueta del mapa {mul and (mul['x'], mul['y'])}, place de worldmap.xml "
          f"{place and (place['x'], place['y'])}, map.info zoomX/Y {map_info_center()}")
    if args.prueba:
        vec["_streets"] = st
        print("  imagen:", proof_image(args.prueba, vec, bd, zd))
        print("  imagen:", proof_image(args.prueba, vec, bd, zd, center=(6300, 5400)))


def map_info_center():
    with open(os.path.join(WORLD, "map.info"), encoding="utf-8") as f:
        info = dict(line.strip().split("=", 1) for line in f if "=" in line)
    return int(info["zoomX"]), int(info["zoomY"])


if __name__ == "__main__":
    main()
