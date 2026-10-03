"""
Project Zomboid → el sobreviviente en 3D del Planificador de personaje (2026-10-01).

    python games/zomboid/tools/model3d.py           # escribe todo (sólo lo que cambió)
    python games/zomboid/tools/model3d.py --check   # inventario y tamaños, sin escribir nada

Va después de `extract.py` (necesita `data/index.json`, `data/items.json`, `data/meta.json` y
`data/professions.json`). Lee TU instalación del juego (sólo lectura) y escribe:

  games/zomboid/data/outfits.json            el contrato con el sitio: por profesión y sexo, la textura de la piel,
                                             las piezas con modelo, el pelo, el afiche y lo que lleva puesto
  site/public/zomboid/3d/body-{m,f}.glb      cuerpo + esqueleto + idle
  site/public/zomboid/3d/piece/<x>.glb       cada pieza con modelo (pantalón, gorra, anteojos, pelo…)
  site/public/zomboid/3d/tex/<hash>.webp     texturas: la piel compuesta de cada atuendo y la de cada pieza, con
                                             nombre por contenido, así los atuendos iguales comparten archivo
  site/public/zomboid/3d/poster/<prof>-<m|f>.webp   el afiche: la imagen fija que va en el prerender

Las reglas de por qué sale cada cosa como sale están en el README ("Modelo 3D — lo medido", respuestas 1–5) y en el
plan (`docs/superpowers/plans/2026-10-01-zomboid-3d.md`, "Decisión: el atuendo de una profesión").
"""
from __future__ import annotations

import glob
import hashlib
import io
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from functools import lru_cache

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import extract  # noqa: E402
import gltf  # noqa: E402
import luatable  # noqa: E402
import xfile  # noqa: E402

MEDIA = extract.MEDIA
DATA = extract.DATA
OUT = os.path.join(extract.PUBLIC, "3d")
OUTFITS_JSON = os.path.join(DATA, "outfits.json")

SEXES = ("m", "f")
LUA_SEX = {"m": "Male", "f": "Female"}
BODY_X = {"m": "MaleBody", "f": "FemaleBody"}
# Respuesta 3: el juego arranca con un sobreviviente al azar; fijamos la primera muestra de piel, sin pelo en el pecho.
SKIN = {"m": "Body/MaleBody01", "f": "Body/FemaleBody01"}
# El pelo: un estilo fijo por sexo (los más comunes de la pantalla de creación) y su variante bajo un sombrero.
HAIR_STYLE = {"m": "Short", "f": "Bob"}
# Color del pelo: castaño medio, el 7.º de `BaseGameCharacterDetails.DoHairColor` (111, 87, 60). El juego lo sortea;
# un castaño se lee bien contra la piel y contra casi cualquier gorra.
HAIR_TINT = (111 / 255, 87 / 255, 60 / 255)
# Idle.xml: m_SpeedScale del nodo (0,48) × el de la mezcla Bob_Idle (0,80). Respuesta 5.
IDLE_SPEED = 0.48 * 0.8
IDLE_X = os.path.join("anims_X", "Bob", "Bob_Idle.x")

# Respuesta 3: una prenda con `m_AllowRandomTint` sale con un color al azar (HSB con S de 0 a 0,6 y B de 0,1 a 0,9).
# El sitio necesita uno fijo: uno sensato por prenda, dentro de ese rango, que se parezca a lo que uno ve en la
# pantalla de creación. Los pantalones toman los de `DoTrouserColor` (MainCreationMethods.lua), que es la lista que
# el juego usa para los pantalones de los sobrevivientes. Una prenda teñible que no esté acá corta el programa: así un
# parche que sume una no sale en blanco sin que nadie lo note.
TINTS = {
    # ClothingItem: (r, g, b) en 0–1, se multiplica sobre la textura (blanca o gris en todas estas). Entre paréntesis,
    # el HSB: S ≤ 0,6 y 0,1 ≤ B ≤ 0,9, como OutfitRNG.randomImmutableColor.
    "Tshirt_DefaultTEXTURE_TINT": (0.60, 0.26, 0.24),      # remera roja apagada (H 3°, S 0,6, B 0,6)
    "Trousers_DefaultTEXTURE_TINT": (0.365, 0.471, 0.537),  # "medium blue" de DoTrouserColor (S 0,32, B 0,54)
    "Socks_Ankle": (0.85, 0.85, 0.85),                      # medias blancas apenas grises (S 0, B 0,85)
    "Shoes_TrainerTINT": (0.85, 0.85, 0.85),                # zapatillas blancas (S 0, B 0,85)
    "Shoes_Wellies": (0.24, 0.36, 0.15),                    # botas de goma verde oscuro (S 0,58, B 0,36)
    "Shirt_FormalTINT": (0.66, 0.75, 0.84),                 # camisa celeste (S 0,21, B 0,84)
    "Hat_Beany": (0.25, 0.28, 0.34),                        # gorro gris azulado (S 0,26, B 0,34)
    "Hat_Sweatband": (0.85, 0.85, 0.85),                    # vincha blanca (S 0, B 0,85)
    "Gloves_FingerlessGloves": (0.22, 0.22, 0.22),          # guantes negros gastados (S 0, B 0,22)
}

# CharacterMask$Part (respuesta 1): Torso (1) y Pelvis (2) no tienen PNG propio, se arman con sus hojas.
MASK_LEAVES = {0: ("Head",), 1: ("Chest", "Waist"), 2: ("Belt", "Crotch"), 3: ("LeftArm",), 4: ("LeftHand",),
               5: ("RightArm",), 6: ("RightHand",), 7: ("LeftLeg",), 8: ("LeftFoot",), 9: ("RightLeg",),
               10: ("RightFoot",), 11: ("Dress",), 12: ("Chest",), 13: ("Waist",), 14: ("Belt",), 15: ("Crotch",)}
LEAVES = ("Head", "LeftArm", "LeftHand", "RightArm", "RightHand", "LeftLeg", "LeftFoot", "RightLeg", "RightFoot",
          "Dress", "Chest", "Waist", "Belt", "Crotch")

# `wear` va de arriba abajo (cabeza, torso, manos, piernas, pies): así lo lee una persona. Dentro de cada grupo,
# el orden de BodyLocations.lua. Un lugar que no está acá cae en el torso.
WEAR_GROUPS = (
    ("hat", "fullhat", "mask", "maskeyes", "maskfull", "eyes", "lefteye", "righteye", "ears", "eartop", "nose",
     "scarf", "neck", "necktexture", "necklace", "necklacelong"),
    (),  # torso: lo demás
    ("hands", "handsleft", "handsright", "leftwrist", "rightwrist", "leftmiddlefinger", "rightmiddlefinger",
     "leftringfinger", "rightringfinger"),
    ("legs1", "shortsshort", "shortpants", "pantsskinny", "pants", "skirt", "longskirt", "codpiece", "kneeleft",
     "kneeright", "calfleft", "calfright", "gaiterleft", "gaiterright"),
    ("socks", "shoes"),
)


def _fail(msg: str):
    raise SystemExit(f"model3d.py: {msg}")


def _norm(loc: str) -> str:
    """`Tshirt`, `TSHIRT`, `base:tshirt` y `TANK_TOP`/`TankTop` → la misma clave."""
    return loc.split(":")[-1].replace("_", "").lower()


# ---------------------------------------------------------------------------------------------- archivos del juego
@lru_cache(maxsize=None)
def _files(sub: str, ext: str) -> dict:
    """{ruta relativa en minúsculas, con / y sin extensión: ruta real} de todo `media/<sub>/**/*<ext>`.
    El juego nombra modelos y texturas sin distinguir mayúsculas (`skinned\\clothes\\bob_trousers` es
    `Skinned/Clothes/Bob_Trousers.x`) y en Windows da igual, pero así funciona también donde sí distingue."""
    base = os.path.join(MEDIA, sub)
    out = {}
    for p in sorted(glob.glob(os.path.join(base, "**", "*" + ext), recursive=True)):
        if p.lower().endswith(ext):
            out[os.path.relpath(p, base).replace(os.sep, "/")[: -len(ext)].lower()] = p
    return out


def model_path(ref: str) -> str | None:
    """`x:media\\models_X\\Skinned\\Clothes\\Bob_HighVisVest.X` → la ruta real del .x (o None)."""
    if not ref:
        return None
    r = ref.replace("\\", "/").strip().lower()
    if r.startswith("x:"):
        r = r[2:]
    for pre in ("media/models_x/", "models_x/"):
        if r.startswith(pre):
            r = r[len(pre):]
    if r.endswith(".x"):
        r = r[:-2]
    return _files("models_X", ".x").get(r.strip("/"))


def texture_path(ref: str) -> str | None:
    """`clothes\\hat\\baseballcap_fire` o `F_Hair_White` → la ruta real del .png (o None)."""
    r = ref.replace("\\", "/").strip().lower()
    for pre in ("media/textures/", "textures/"):
        if r.startswith(pre):
            r = r[len(pre):]
    if r.endswith(".png"):
        r = r[:-4]
    return _files("textures", ".png").get(r.strip("/"))


# ---------------------------------------------------------------------------------------------- las definiciones
def definitions() -> dict:
    """`ClothingSelectionDefinitions` tal cual lo arma el juego (el .lua se lee entero con luatable)."""
    path = os.path.join(MEDIA, "lua", "shared", "Definitions", "ClothingSelectionDefinitions.lua")
    with open(path, encoding="utf-8-sig") as h:
        src = h.read()
    env: dict = {}
    try:
        luatable.run_lua(src, env, os.path.basename(path))
    except luatable.LuaError as e:
        _fail(f"no se pudo leer {path}: {e}")
    defs = env.get("ClothingSelectionDefinitions")
    if not isinstance(defs, dict) or "default" not in defs:
        _fail(f"{path} no define ClothingSelectionDefinitions.default")
    return defs


@lru_cache(maxsize=None)
def _body_locations():
    """El orden de `group:getOrCreateLocation` (respuesta 2: así apila el juego), los pares exclusivos (`setExclusive`:
    poner uno saca el otro) y los que esconden el modelo de otro (`setHideModel`). Se lee con una regex y no con
    luatable porque son llamadas a métodos, no tablas."""
    path = os.path.join(MEDIA, "lua", "shared", "NPCs", "BodyLocations.lua")
    with open(path, encoding="utf-8-sig") as h:
        src = "\n".join(line.split("--", 1)[0] for line in h.read().split("\n"))
    order = [_norm(m) for m in re.findall(r"getOrCreateLocation\(\s*ItemBodyLocation\.(\w+)\s*\)", src)]
    if len(order) < 50:
        _fail(f"{path}: se esperaban más de 50 lugares del cuerpo y hay {len(order)}")
    excl: dict = {}
    for a, b in re.findall(r"setExclusive\(\s*ItemBodyLocation\.(\w+)\s*,\s*ItemBodyLocation\.(\w+)\s*\)", src):
        excl.setdefault(_norm(a), set()).add(_norm(b))
        excl.setdefault(_norm(b), set()).add(_norm(a))
    hide: dict = {}
    for a, b in re.findall(r"setHideModel\(\s*ItemBodyLocation\.(\w+)\s*,\s*ItemBodyLocation\.(\w+)\s*\)", src):
        hide.setdefault(_norm(a), set()).add(_norm(b))
    return {loc: i for i, loc in enumerate(order)}, excl, hide


@lru_cache(maxsize=None)
def _item_scripts() -> dict:
    """{"Base.Trousers_Fireman": "Trousers_Fireman"}: el ClothingItem de cada prenda, con el lector de scripts de
    extract.py (el mismo que arma items.json)."""
    path = os.path.join(extract.SCRIPTS, "generated", "items", "clothing.txt")
    with open(path, encoding="utf-8-sig", errors="replace") as h:
        root = extract.parse_script(h.read(), "generated/items/clothing.txt")
    out = {}
    for module in root.children:
        if module.kind != "module":
            continue
        for b in module.children:
            if b.kind == "item":
                ci = b.props().get("ClothingItem")
                if ci:
                    out[f"{module.name}.{b.name}"] = ci
    return out


@lru_cache(maxsize=None)
def clothing_item(name: str) -> dict:
    """El XML de `clothing/clothingItems/<name>.xml` (sin distinguir mayúsculas), con lo que usamos."""
    path = _files("clothing/clothingItems", ".xml").get(name.lower())
    if not path:
        _fail(f"no hay clothing/clothingItems/{name}.xml")
    with open(path, "rb") as h:
        root = ET.fromstring(h.read())

    def texts(tag):
        return [(e.text or "").strip() for e in root.findall(tag) if (e.text or "").strip()]

    def one(tag):
        v = texts(tag)
        return v[0] if v and v[0].lower() != "null" else ""

    return {"name": os.path.basename(path)[:-4], "male": one("m_MaleModel"), "female": one("m_FemaleModel"),
            "static": one("m_Static").lower() == "true", "bone": one("m_AttachBone"),
            "masks": [int(v) for v in texts("m_Masks")], "choices": texts("textureChoices"),
            "base": texts("m_BaseTextures"), "tint": one("m_AllowRandomTint").lower() == "true",
            "hat": one("m_HatCategory")}


def lua_prof(prof_id: str) -> str:
    """Nuestro id de profesión → la clave de ClothingSelectionDefinitions (`fitnessinstructor` → `fitnessInstructor`).
    Los ids del sitio están en minúsculas; en el .lua hay una sola con mayúscula, y se busca sin distinguir."""
    for key in definitions_keys():
        if key.lower() == prof_id.lower():
            return key
    return prof_id


@lru_cache(maxsize=None)
def definitions_keys() -> tuple:
    return tuple(definitions().keys())


# ---------------------------------------------------------------------------------------------- el atuendo
def outfit(prof_id: str, sex: str, defs: dict) -> list[dict]:
    """El atuendo fijo de una profesión (plan, "Decisión: el atuendo de una profesión"):
    1. de `default.<Sexo>`, los lugares sin `chance` (lo que todos llevan siempre), con el primer ítem;
    2. de la profesión (`<Sexo>`, o `Female` si no define ese sexo, como `randomGenericOutfit`), TODOS sus lugares
       con el primer ítem (la gorra de policía tiene chance 10, pero es lo que hace reconocible al policía); pisan
       el lugar del default, y como `WornItems.setItem`, sacan lo que es exclusivo con ellos (una pollera saca el
       pantalón). Un lugar con `chance = 0` no sale nunca en el juego: tampoco acá;
    3. sin rasgos.
    Sale en el orden en que el juego apila la ropa (BodyLocations.lua, respuesta 2)."""
    order, excl, hide = _body_locations()
    scripts = _item_scripts()
    worn: dict = {}

    def put(loc, item):
        n = _norm(loc)
        worn.pop(n, None)
        for other in excl.get(n, ()):
            worn.pop(other, None)
        if item:
            worn[n] = (loc, item)

    for loc, t in defs["default"][LUA_SEX[sex]].items():
        if "chance" not in t and t.get("items"):
            put(loc, t["items"][0])
    prof = defs.get(lua_prof(prof_id))
    if prof:
        d = prof.get(LUA_SEX[sex]) or prof.get("Female") or {}
        for loc, t in d.items():
            if t.get("chance") == 0:
                continue
            items = t.get("items") or []
            put(loc, items[0] if items else None)  # `items = {}` vacía el lugar, como setWornItem(loc, nil)

    missing = [n for n in worn if n not in order]
    if missing:
        _fail(f"{prof_id}/{sex}: lugares que BodyLocations.lua no conoce: {missing}")
    hidden = set()
    for n in worn:
        hidden |= hide.get(n, set())
    out = []
    for n in sorted(worn, key=order.get):
        loc, item = worn[n]
        if "." not in item:
            item = "Base." + item  # `{"Hat_SurgicalCap"}` (enfermera): instanceItem lo busca en Base
        ci_name = scripts.get(item)
        if not ci_name:
            _fail(f"{prof_id}/{sex}: {item} no tiene ClothingItem en clothing.txt")
        ci = clothing_item(ci_name)
        model = ci["male"] if sex == "m" else ci["female"]
        if n in hidden:
            model = ""  # un lugar escondido por otro (setHideModel) se lleva puesto pero no se dibuja
        kind = "texture" if not model else ("static" if ci["static"] else "skinned")
        if kind != "texture" and not model_path(model):
            _fail(f"{prof_id}/{sex}: {item} pide el modelo {model!r} y no está en models_X")
        textures = ci["choices"] if kind != "texture" else ci["base"]
        tint = None
        if ci["tint"]:
            if ci["name"] not in TINTS:
                _fail(f"{ci['name']} ({item}) se tiñe y no tiene color fijo en TINTS")
            tint = list(TINTS[ci["name"]])
        out.append({"loc": loc, "item": item, "clothing": ci["name"], "kind": kind,
                    "model": model or None, "bone": (ci["bone"] or None) if kind == "static" else None,
                    "textures": textures, "masks": ci["masks"], "tint": tint, "hat": ci["hat"] or None})
    return out


# ---------------------------------------------------------------------------------------------- el pelo
@lru_cache(maxsize=None)
def _hair_styles() -> dict:
    """{("m"|"f", estilo): {"model", "texture", "alt": {categoría: estilo}}} de `hairStyles/hairStyles.xml`."""
    path = os.path.join(MEDIA, "hairStyles", "hairStyles.xml")
    with open(path, "rb") as h:
        root = ET.fromstring(h.read())
    out = {}
    for tag, sex in (("male", "m"), ("female", "f")):
        for e in root.findall(tag):
            name = (e.findtext("name") or "").strip()
            out[(sex, name)] = {"model": (e.findtext("model") or "").strip(),
                                "texture": (e.findtext("texture") or "").strip(),
                                "alt": {a.get("category"): a.get("style") for a in e.findall("alternate")}}
    return out


def hair(sex: str, pieces: list[dict]) -> dict | None:
    """El pelo del atuendo: `Short` (hombre) o `Bob` (mujer), y bajo un sombrero la variante que pide la categoría
    de ese sombrero (`m_HatCategory`: con una gorra o un gorro, `alternate category="Group01"` → `Hat`, el pelo
    aplastado; `Group05`, el mismo estilo). Una categoría `nohair…` lo saca; `nobeard` (barbijo) no lo toca.
    Si hay más de una prenda con categoría, manda la primera que el estilo conoce, en el orden de la ropa."""
    styles = _hair_styles()
    style = HAIR_STYLE[sex]
    cats = [p["hat"] for p in pieces if p.get("hat") and p["kind"] != "texture"]
    if any(c.lower().startswith("nohair") for c in cats):
        return None
    if (sex, style) not in styles:
        _fail(f"no está el peinado {style!r} ({sex}) en hairStyles.xml: el parche le cambió el nombre")
    for c in cats:
        alt = styles[(sex, style)]["alt"].get(c)
        if alt:
            style = alt
            break
    s = styles.get((sex, style))
    if not s or not s["model"]:
        return None
    if not model_path(s["model"]):
        _fail(f"el pelo {style!r} pide {s['model']!r} y no está en models_X")
    return {"style": style, "model": s["model"], "texture": s["texture"]}


# ---------------------------------------------------------------------------------------------- texturas
def _rgba(path: str, size=None):
    import numpy as np
    from PIL import Image
    with Image.open(path) as im:
        im = im.convert("RGBA")
        if size and im.size != size:
            im = im.resize(size, Image.NEAREST)
        return np.asarray(im, dtype=np.float64) / 255.0


@lru_cache(maxsize=None)
def _leaf(name: str):
    """Alfa de una hoja de máscara (`textures/Body/Masks/<hoja>.png`, modo P: el índice 0 es transparente)."""
    path = texture_path("Body/Masks/" + name)
    if not path:
        _fail(f"no está textures/Body/Masks/{name}.png")
    return _rgba(path)[..., 3]


def _visible(hidden: set, shape):
    """Por dónde se ve algo que tienen tapado las hojas `hidden`: la unión de las hojas visibles, o todo si no hay
    nada tapado (como `forEachVisible` del juego, que con todo visible dibuja la textura entera)."""
    import numpy as np
    if not hidden:
        return np.ones(shape)
    vis = [_leaf(l) for l in LEAVES if l not in hidden]
    return np.max(vis, axis=0) if vis else np.zeros(shape)


def _blend(dst, src, mask):
    """SmartTexture: `glBlendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` con el alfa de la fuente × el de la máscara
    (shader `bodyMask`); la misma función se aplica al alfa."""
    a = src[..., 3] * mask
    out = dst.copy()
    out[..., :3] = src[..., :3] * a[..., None] + dst[..., :3] * (1 - a[..., None])
    out[..., 3] = a * a + dst[..., 3] * (1 - a)
    return out


def _leaves(masks) -> set:
    out = set()
    for m in masks:
        out.update(MASK_LEAVES.get(m, ()))
    return out


def body_texture(sex: str, pieces: list[dict]):
    """La textura del cuerpo de un atuendo (respuestas 1 y 2): la piel por donde no tapa ninguna prenda, y encima,
    en el orden de BodyLocations, cada prenda que es sólo textura, teñida (multiplica) y recortada por las `m_Masks`
    de las que van después (con modelo o sin). Lo tapado queda con alfa 0: el cuerpo tiene un agujero donde va el
    pantalón (alphaCutoff 0,01)."""
    import numpy as np
    skin = _rgba(texture_path(SKIN[sex]))
    shape = skin.shape[:2]
    covered = set()
    for p in pieces:
        covered |= _leaves(p["masks"])
    dst = _blend(np.zeros(skin.shape), skin, _visible(covered, shape))
    for i, p in enumerate(pieces):
        if p["kind"] != "texture" or not p["textures"]:
            continue
        ref = p["textures"][0]
        if ref.lower() == "emptytexture":  # el cinturón y otras que no pintan nada
            continue
        path = texture_path(ref)
        if not path:
            _fail(f"{p['item']}: no está la textura {ref!r}")
        src = _rgba(path, (shape[1], shape[0]))
        if p["tint"]:
            src[..., :3] *= np.asarray(p["tint"])
        later = set()
        for q in pieces[i + 1:]:
            later |= _leaves(q["masks"])
        dst = _blend(dst, src, _visible(later, shape))
    return _to8(dst)


def piece_texture(ref: str, tint):
    import numpy as np
    path = texture_path(ref)
    if not path:
        _fail(f"no está la textura {ref!r}")
    t = _rgba(path)
    if tint:
        t[..., :3] *= np.asarray(tint)  # en el juego es TintColour de basicEffect.frag: también multiplica
    return _to8(t)


def _to8(a):
    import numpy as np
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def _webp(rgba, limit: int) -> bytes:
    """WebP sin pérdida si entra en `limit`; si no, con pérdida bajando la calidad de 90 de a 5 hasta que entre.
    Mismo arreglo → mismos bytes (Pillow con libwebp, sin metadatos)."""
    from PIL import Image
    im = Image.fromarray(rgba, "RGBA")
    b = io.BytesIO()
    im.save(b, "WEBP", lossless=True, quality=100, method=6, exact=False)
    if len(b.getvalue()) <= limit:
        return b.getvalue()
    for q in range(90, 40, -5):
        b = io.BytesIO()
        im.save(b, "WEBP", quality=q, method=6, alpha_quality=100)
        if len(b.getvalue()) <= limit:
            if q < 90:  # que una textura salga degradada se vea en la corrida (hoy no pasa: todas entran en 90)
                print(f"  aviso: una imagen de {im.width}×{im.height} sólo entra en {limit} bytes con calidad {q}")
            return b.getvalue()
    _fail(f"una imagen no entra en {limit} bytes ni con calidad 45")


# ---------------------------------------------------------------------------------------------- la salida
TEX_LIMIT = 30_000      # cada textura (cruda: Netlify no comprime .webp)
POSTER_LIMIT = 25_000   # cada afiche
PIECE_LIMIT = 25_000    # cada pieza .glb
BODY_LIMIT = 90_000     # cuerpo + esqueleto + idle
VIEW_LIMIT = 180_000    # la primera vista 3D de un atuendo: cuerpo + piezas + texturas
POSTER_SIZE = (360, 480)
POSTER_YAW = -20.0


class Out:
    """Los archivos que salen, en memoria hasta el final: así `--check` no escribe nada, se escribe sólo lo que
    cambió y se borra lo que ya no sale."""

    def __init__(self):
        self.files: dict = {}

    def put(self, rel: str, data: bytes) -> str:
        if rel in self.files and self.files[rel] != data:
            _fail(f"{rel} sale dos veces con contenido distinto")
        self.files[rel] = data
        return rel

    def tex(self, rgba) -> str:
        data = _webp(rgba, TEX_LIMIT)
        return self.put(f"tex/{hashlib.sha1(data).hexdigest()[:8]}.webp", data)

    def write(self, root: str) -> tuple:
        written = removed = 0
        for rel, data in sorted(self.files.items()):
            path = os.path.join(root, *rel.split("/"))
            old = None
            if os.path.isfile(path):
                with open(path, "rb") as h:
                    old = h.read()
            if old != data:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "wb") as h:
                    h.write(data)
                written += 1
        keep = {os.path.normcase(os.path.join(root, *r.split("/"))) for r in self.files}
        for path in sorted(glob.glob(os.path.join(root, "**", "*"), recursive=True)):
            if os.path.isfile(path) and os.path.normcase(path) not in keep:
                os.remove(path)
                removed += 1
        for d in sorted(glob.glob(os.path.join(root, "**", ""), recursive=True), reverse=True):
            if os.path.isdir(d) and not os.listdir(d):
                os.rmdir(d)
        return written, removed


def _glb_bytes(tmp: str, name: str, **kw) -> tuple:
    """`gltf.write_glb` escribe a disco: se escribe en una carpeta de paso y se leen los bytes."""
    path = os.path.join(tmp, name)
    st = gltf.write_glb(path, **kw)
    with open(path, "rb") as h:
        return h.read(), st, path


@lru_cache(maxsize=None)
def _read_x(path: str):
    return xfile.read_x(path)


def build_body(sex: str, tmp: str) -> tuple:
    """`body-<sexo>.glb`: cuerpo + esqueleto + idle (en la mujer, sólo rotaciones: respuesta 5)."""
    x = _read_x(model_path("skinned/" + BODY_X[sex]))
    idle = _read_x(os.path.join(MEDIA, IDLE_X))
    if len(idle.animations) != 1:
        _fail(f"{IDLE_X}: se esperaba una animación y hay {len(idle.animations)}")
    return _glb_bytes(tmp, f"body-{sex}.glb", frames=x.root, mesh=xfile.main_mesh(x), skin_root="Bip01",
                      animation=idle.animations[0], speed=IDLE_SPEED, rotations_only=(sex == "f"))


def build_piece(model: str, kind: str, bone: str | None, tmp: str) -> tuple:
    """`piece/<nombre del .x en minúsculas>.glb`: con piel (sobre los huesos del cuerpo, por nombre) o fija (en el
    espacio de su hueso, `extras.bone`)."""
    path = model_path(model)
    x = _read_x(path)
    mesh = xfile.main_mesh(x)
    if mesh is None:
        _fail(f"{path}: no tiene malla")
    name = os.path.basename(path)[:-2].lower() + ".glb"
    if kind == "static":
        return (*_glb_bytes(tmp, name, frames=x.root, mesh=mesh, skin_root=None, animation=None,
                            static_bone=bone), name)
    return (*_glb_bytes(tmp, name, frames=x.root, mesh=mesh, skin_root="Bip01", animation=None), name)


def _need(name: str):
    path = os.path.join(DATA, name)
    if not os.path.isfile(path):
        _fail(f"falta data/{name}: corré antes `python games/zomboid/tools/extract.py`")
    with open(path, encoding="utf-8") as h:
        return json.load(h)


def _wear_rank(loc: str) -> tuple:
    order = _body_locations()[0]
    n = _norm(loc)
    for g, locs in enumerate(WEAR_GROUPS):
        if n in locs:
            return g, order.get(n, 0)
    return 1, order.get(n, 0)


class Kit:
    """Lo que se arma una vez y comparten los atuendos: los cuerpos (con su esqueleto y su malla en el primer cuadro
    del idle), las piezas y las texturas de las piezas. Los .glb se escriben en `tmp` (el rasterizador los lee de
    ahí, por el mismo camino que el sitio) y los bytes quedan en `out`."""

    def __init__(self, tmp: str, out: Out):
        import raster
        self.raster, self.tmp, self.out = raster, tmp, out
        self.skeleton, self.body_mesh, self.boxes = {}, {}, {}
        self._pieces: dict = {}
        self._tex: dict = {}
        for s in SEXES:
            data, _st, path = build_body(s, tmp)
            out.put(f"body-{s}.glb", data)
            g = raster.Glb(path)
            self.skeleton[s] = g.worlds()
            self.body_mesh[s] = raster.posed(g, self.skeleton[s])
            # El encuadre es el del cuerpo, igual para todos: todos los afiches de un sexo a la misma escala.
            self.boxes[s] = raster.frame_box(self.body_mesh[s], POSTER_YAW)

    def piece(self, model: str, kind: str, bone: str | None) -> tuple:
        key = (model_path(model).lower(), kind, bone)
        if key not in self._pieces:
            data, _st, path, name = build_piece(model, kind, bone, self.tmp)
            self._pieces[key] = (self.out.put(f"piece/{name}", data), self.raster.Glb(path))
        return self._pieces[key]

    def ptex(self, ref: str, tint) -> tuple:
        key = (ref.lower(), tuple(tint) if tint else None)
        if key not in self._tex:
            rgba = piece_texture(ref, tint)
            self._tex[key] = (self.out.tex(rgba), rgba)
        return self._tex[key]

    def dress(self, sex: str, pieces: list[dict]) -> tuple:
        """La entrada de outfits.json de un atuendo (sin `poster` ni `wear`) y su afiche (RGBA uint8)."""
        skin = body_texture(sex, pieces)
        entry = {"skin": self.out.tex(skin), "pieces": []}
        layers = [(self.body_mesh[sex], skin)]
        for p in pieces:
            if p["kind"] == "texture":
                continue
            rel, g = self.piece(p["model"], p["kind"], p["bone"])
            if not p["textures"]:
                _fail(f"{p['item']}: la pieza {p['model']!r} no trae textureChoices")
            trel, trgba = self.ptex(p["textures"][0], p["tint"])
            e = {"glb": rel, "tex": trel}
            if p["kind"] == "static":
                e["bone"] = p["bone"]
            entry["pieces"].append(e)
            layers.append((self.raster.posed(g, self.skeleton[sex]), trgba))
        hr = hair(sex, pieces)
        if hr:
            rel, g = self.piece(hr["model"], "skinned", None)
            trel, trgba = self.ptex(hr["texture"], HAIR_TINT)
            entry["hair"] = {"glb": rel, "tex": trel}
            layers.append((self.raster.posed(g, self.skeleton[sex]), trgba))
        img = self.raster.render(layers, self.boxes[sex], size=POSTER_SIZE, yaw_deg=POSTER_YAW)
        return entry, img


def poster(prof_id: str, sex: str, defs: dict | None = None):
    """El afiche de un solo atuendo (RGBA uint8, alto × ancho × 4), sin escribir nada: para los tests y para mirar."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        return Kit(tmp, Out()).dress(sex, outfit(prof_id, sex, defs or definitions()))[1]


def build(check: bool = False) -> dict:
    import tempfile
    meta, items, index = _need("meta.json"), _need("items.json"), _need("index.json")
    profs = [p["id"] for p in _need("professions.json")]
    names = {it["id"]: it["name"] for it in items["items"]}
    slugs = {}
    for e in index:
        if e["sec"] == "items":
            for r in e.get("ref") or []:
                slugs.setdefault(r, e["id"])
    defs = definitions()
    out = Out()
    doc = {"version": meta["version"], "body": {s: f"body-{s}.glb" for s in SEXES}, "outfits": {}}
    report = {"outfits": {}}
    with tempfile.TemporaryDirectory() as tmp:
        kit = Kit(tmp, out)
        for prof in profs:
            doc["outfits"][prof] = {}
            for s in SEXES:
                pieces = outfit(prof, s, defs)
                entry, img = kit.dress(s, pieces)
                entry["poster"] = out.put(f"poster/{prof}-{s}.webp", _webp(img, POSTER_LIMIT))
                wear = []
                for p in sorted(pieces, key=lambda p: _wear_rank(p["loc"])):
                    nm = names.get(p["item"])
                    if not nm:
                        _fail(f"{prof}/{s}: {p['item']} no está en data/items.json")
                    w = {"ref": p["item"]}
                    if p["item"] in slugs:
                        w["slug"] = slugs[p["item"]]
                    w["en"], w["es"] = nm["en"], nm["es"]
                    wear.append(w)
                entry["wear"] = wear
                doc["outfits"][prof][s] = entry
                report["outfits"][(prof, s)] = (pieces, entry)
    js = (extract.dumps(doc) + "\n").encode("utf-8")
    _check_budgets(out, doc)
    if check:
        _print_report(out, doc, report, js)
        return doc
    written, removed = out.write(OUT)
    old = None
    if os.path.isfile(OUTFITS_JSON):
        with open(OUTFITS_JSON, "rb") as h:
            old = h.read()
    if old != js:
        with open(OUTFITS_JSON, "wb") as h:
            h.write(js)
        written += 1
    print(f"model3d.py: {len(out.files)} archivos en site/public/zomboid/3d ({written} escritos, {removed} borrados), "
          f"{len(doc['outfits'])} profesiones × {len(SEXES)} sexos")
    return doc


def _first_view(out: Out, doc: dict, s: str, a: dict) -> int:
    size = lambda rel: len(out.files[rel])  # noqa: E731
    total = size(doc["body"][s]) + size(a["skin"])
    if "hair" in a:
        total += size(a["hair"]["glb"]) + size(a["hair"]["tex"])
    for p in a["pieces"]:
        total += size(p["glb"]) + size(p["tex"])
    return total


def _check_budgets(out: Out, doc: dict):
    """Los presupuestos de las restricciones, contados crudos: si un parche los rompe, se corta antes de escribir."""
    bad = []
    for rel, data in out.files.items():
        lim = (BODY_LIMIT if rel.startswith("body-") else PIECE_LIMIT if rel.startswith("piece/")
               else TEX_LIMIT if rel.startswith("tex/") else POSTER_LIMIT)
        if len(data) > lim:
            bad.append(f"{rel} pesa {len(data)} (tope {lim})")
    for prof, by_sex in doc["outfits"].items():
        for s, a in by_sex.items():
            t = _first_view(out, doc, s, a)
            if t > VIEW_LIMIT:
                bad.append(f"{prof}/{s}: la primera vista pesa {t} (tope {VIEW_LIMIT})")
    if bad:
        _fail("se pasa del presupuesto:\n  " + "\n  ".join(bad))


def _print_report(out: Out, doc: dict, report: dict, js: bytes):
    import gzip
    kinds = {s: {"skinned": set(), "static": set(), "texture": set()} for s in SEXES}
    distinct = {s: set() for s in SEXES}
    for (prof, s), (pieces, entry) in report["outfits"].items():
        for p in pieces:
            # Por archivo y no por nombre: `Bob_HighVisVest` aparece escrito de dos maneras en los XML.
            kinds[s][p["kind"]].add(model_path(p["model"]).lower() if p["model"] else p["clothing"].lower())
        distinct[s].add(json.dumps({k: v for k, v in entry.items() if k != "poster"}, sort_keys=True))
    print(f"Atuendos: {len(doc['outfits'])} profesiones × {len(SEXES)} sexos")
    for s in SEXES:
        k = kinds[s]
        print(f"  {s}: {len(distinct[s])} distintos; {len(k['skinned']) + len(k['static'])} piezas con modelo "
              f"({len(k['skinned'])} con piel, {len(k['static'])} fijas) y {len(k['texture'])} prendas sólo textura")
    tot = lambda pre: sum(len(d) for r, d in out.files.items() if r.startswith(pre))  # noqa: E731
    cnt = lambda pre: sum(1 for r in out.files if r.startswith(pre))  # noqa: E731
    print(f"Archivos: {len(out.files)}, {sum(len(d) for d in out.files.values()) / 1024:.1f} KB en total")
    for pre in ("body-", "piece/", "tex/", "poster/"):
        print(f"  {pre:8} {cnt(pre):3} archivos, {tot(pre) / 1024:7.1f} KB")
    print(f"outfits.json: {len(js)} bytes, {len(gzip.compress(js, 9, mtime=0))} gzip")
    print("Primera vista 3D por atuendo (cuerpo + pelo + piezas + texturas) / afiche:")
    for prof, by_sex in doc["outfits"].items():
        row = "   ".join(f"{s} {_first_view(out, doc, s, a) / 1024:5.1f} KB / {len(out.files[a['poster']]) / 1024:4.1f} KB"
                         for s, a in by_sex.items())
        print(f"  {prof:20} {row}")
    biggest = sorted(((len(d), r) for r, d in out.files.items() if r.startswith("piece/")), reverse=True)[:3]
    print("Piezas más pesadas: " + ", ".join(f"{r} {n / 1024:.1f} KB" for n, r in biggest))


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    if not os.path.isdir(os.path.join(MEDIA, "models_X")):
        raise SystemExit(f"No encuentro el juego en {extract.GAME_DIR} (definí PZ_DIR)")
    build(check="--check" in sys.argv[1:])


if __name__ == "__main__":
    main()
