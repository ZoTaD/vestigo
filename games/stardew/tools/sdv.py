"""Reglas de Stardew Valley para los scripts de datos del sitio.

Lee lo volcado en `games/stardew/raw/` (ver `dump.sh`) y concentra los textos,
las categorías, los precios de venta, la energía y los slugs.
"""
import json
import math
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw"


@lru_cache(maxsize=None)
def raw(name: str) -> dict:
    """Lee `games/stardew/raw/<name>.json` (p. ej. "Data/Objects")."""
    ruta = RAW / f"{name}.json"
    if not ruta.exists():
        raise FileNotFoundError(f"Falta {ruta}: corré games/stardew/tools/dump.sh")
    return json.loads(ruta.read_text(encoding="utf-8"))


TOKEN = re.compile(r"\[LocalizedText\s+([^:\]\s]+):([^\]\s]+)\]")


def _buscar(archivo: str, clave: str, lang: str):
    nombre = archivo.replace("\\", "/")
    if lang == "es":
        try:
            es = raw(f"{nombre}.es-ES").get(clave)
        except FileNotFoundError:
            es = None
        if es:
            return es
    return raw(nombre).get(clave)


def text(token: str | None, lang: str) -> str:
    r"""Resuelve los `[LocalizedText Strings\X:Clave]` de una cadena.

    En español cae al inglés si el juego no trae la traducción. Si no hay
    tokens, devuelve la cadena tal cual.
    """
    if not token:
        return ""

    def sustituir(m: re.Match) -> str:
        valor = _buscar(m.group(1), m.group(2), lang)
        return m.group(0) if valor is None else valor

    return TOKEN.sub(sustituir, token)


def slugify(s: str) -> str:
    """Igual que `slugify` de site/src/route.ts."""
    s = unicodedata.normalize("NFD", s)
    s = re.sub(r"[^\x00-\x7F]", "", s).lower()
    s = re.sub(r"['.]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# Categoría -> clave de StringsFromCSFiles (las que da el propio código del juego).
_CLAVES = {
    -2: "Object.cs.12850",   # el juego muestra las gemas como "Mineral"
    -4: "Object.cs.12852",
    -5: "Object.cs.12864",
    -6: "Object.cs.12864",
    -7: "Object.cs.12853",
    -12: "Object.cs.12850",
    -15: "Object.cs.12868",
    -16: "Object.cs.12868",
    -26: "Object.cs.12862",
    -27: "Object.cs.12862",
    -75: "Object.cs.12851",
    -79: "Object.cs.12854",
    -80: "Object.cs.12866",
    -81: "Object.cs.12869",
}

# Las demás se buscan por su texto en inglés y se toma la misma clave en es-ES.
_EN_EXTRA = {
    -8: "Crafting",
    -18: "Animal Product",
    -19: "Fertilizer",
    -20: "Trash",
    -21: "Bait",
    -22: "Fishing Tackle",
    -24: "Decor",
    -28: "Monster Loot",
    -74: "Seed",
}


def _categorias() -> dict[int, tuple[str, str]]:
    en = raw("Strings/StringsFromCSFiles")
    es = raw("Strings/StringsFromCSFiles.es-ES")
    por_texto = {}
    for clave, valor in en.items():
        if isinstance(valor, str):
            por_texto.setdefault(valor, clave)
    cats = {}
    for cat, clave in _CLAVES.items():
        cats[cat] = (en[clave], es.get(clave) or en[clave])
    for cat, nombre in _EN_EXTRA.items():
        clave = por_texto.get(nombre)
        if clave:
            cats[cat] = (en[clave], es.get(clave) or en[clave])
    return cats


CATEGORIES: dict[int, tuple[str, str]] = _categorias()

# Profesiones: nombre -> (porcentaje, categorías a las que aplica), de `Object.getPriceAfterMultipliers`.
_PROFESIONES = {
    "tiller": (110, (-75, -79, -80)),
    "artisan": (140, (-26,)),
    "rancher": (120, (-5, -6, -18)),
    "fisher": (125, (-4,)),
    "angler": (150, (-4,)),
    "blacksmith": (150, ()),
    "gemologist": (130, (-2, -12)),
    "tapper": (125, (-27,)),
}
# El Herrero sólo cuenta los lingotes (`Object.IsBar`), no las menas ni el carbón de su categoría.
_LINGOTES = {"334", "335", "336", "337", "910"}
# El Ganadero también cuenta lo que se llama así aunque sea de otra categoría (mayonesa, queso, tela).
_GANADERO_POR_NOMBRE = ("mayonnaise", "cheese", "cloth", "wool")
_CALIDADES = (100, 125, 150, 200)


def _profesion_aplica(nombre: str, category: int, item_id: str, nombre_en: str) -> bool:
    _, cats = _PROFESIONES[nombre]
    if nombre == "blacksmith":
        return item_id in _LINGOTES
    if nombre == "rancher" and any(n in nombre_en.lower() for n in _GANADERO_POR_NOMBRE):
        return True
    if nombre in ("fisher", "angler") and item_id == "SmokedFish":
        return True
    return category in cats


def sell_prices(price: int, category: int, item_id: str = "", nombre_en: str = "", calidad: bool = True) -> dict:
    """Precios de venta por calidad (normal, plata, oro, iridio) y por profesión (`Object.sellToStorePrice`).

    Todo en enteros y hacia abajo: la profesión se aplica sobre el precio con calidad. Lo que nunca tiene calidad
    (lingotes, gemas, anillos…) lleva un solo precio.
    """
    base = [price * c // 100 for c in (_CALIDADES if calidad else _CALIDADES[:1])]
    pro = {
        nombre: [p * pct // 100 for p in base]
        for nombre, (pct, _) in _PROFESIONES.items()
        if _profesion_aplica(nombre, category, item_id, nombre_en)
    }
    return {"base": base, "pro": pro}


def energy(edibility: int) -> tuple[int, int] | None:
    """(energía, salud) de un comestible; None si no restaura energía."""
    if edibility <= 0:
        return None
    en = math.ceil(edibility * 2.5)
    return en, math.floor(en * 0.45)
