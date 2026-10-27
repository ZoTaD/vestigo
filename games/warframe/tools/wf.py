"""Lectura del export oficial de Warframe ya bajado por `fetch.py` (games/warframe/raw/)."""
import json
import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAW = AQUI.parent / "raw"
URL_CONTENIDO = "https://content.warframe.com/PublicExport"

if not RAW.exists():
    sys.exit("No está games/warframe/raw/: corré games/warframe/tools/fetch.py")


@lru_cache(maxsize=None)
def _leer(archivo: str) -> dict:
    # Los JSON del export a veces traen caracteres de control sueltos: strict=False.
    return json.loads((RAW / archivo).read_text(encoding="utf-8"), strict=False)


def export_all(name: str, lang: str) -> dict:
    """Todo el archivo `Export<name>_<lang>.json` (algunos traen varias listas)."""
    return _leer(f"Export{name}_{lang}.json")


def export(name: str, lang: str) -> list:
    """La lista `Export<name>` del archivo."""
    return export_all(name, lang)[f"Export{name}"]


def by_unique(name: str, lang: str) -> dict:
    return {x["uniqueName"]: x for x in export(name, lang)}


def clean(text: str) -> str:
    """Saca marcas `<DT_..._COLOR>`, `<LOWER_IS_BETTER>` y demás `<…>`, deja `|DAMAGE|` como X y normaliza saltos."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"<[^<>\n]*>", "", text)
    return re.sub(r"\|[A-Z0-9_]+\|", "X", text)


def slugify(s: str) -> str:
    """El mismo `slugify` de `site/src/route.ts` (y de los extract.py de Zomboid y Rust)."""
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['.]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


@lru_cache(maxsize=None)
def _iconos() -> dict:
    m = _leer("ExportManifest.json")["Manifest"]
    return {x["uniqueName"]: x["textureLocation"] for x in m}


def icon_url(unique: str):
    """URL del ícono (con el `!00_hash`: sin él da 404) o None si el manifiesto no lo tiene."""
    ruta = _iconos().get(unique)
    return URL_CONTENIDO + ruta.replace("\\", "/") if ruta else None
