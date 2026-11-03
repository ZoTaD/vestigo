"""
Lo común de las herramientas de CS2 (2026-11-03): dónde está lo crudo, cómo se arman los slugs y en qué archivo va cada
ficha. Plan: docs/superpowers/plans/2026-11-03-cs2-etapa-1.md.
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

AQUI = Path(__file__).resolve().parent
JUEGO = AQUI.parent
RAW = JUEGO / "raw"
DATA = JUEGO / "data"
PRICES = JUEGO / "prices"

# En cuántos archivos se reparten las fichas de cada pestaña: `pzShardOf(slug, CS2_SHARDS)` de `site/src/cs2/data.ts`.
CHUNKS = 32

# Los cortes de desgaste del juego: (nombre en el mercado, desde, hasta). Un float cae en el tramo [desde, hasta).
WEARS = [
    ("Factory New", 0, 0.07),
    ("Minimal Wear", 0.07, 0.15),
    ("Field-Tested", 0.15, 0.38),
    ("Well-Worn", 0.38, 0.45),
    ("Battle-Scarred", 0.45, 1),
]

# La rareza de ByMykel → la clave del sitio (el nombre y el color los pone `cs2Copy.ts`). Las de guantes y cuchillos
# ("rarity_ancient") son Extraordinario; una rareza que no está acá corta el armado.
RARITY = {
    "rarity_common_weapon": "consumer",
    "rarity_uncommon_weapon": "industrial",
    "rarity_rare_weapon": "milspec",
    "rarity_mythical_weapon": "restricted",
    "rarity_legendary_weapon": "classified",
    "rarity_ancient_weapon": "covert",
    "rarity_ancient": "extraordinary",
    "rarity_contraband_weapon": "contraband",
}


def rarity(r: dict) -> str:
    try:
        return RARITY[r["id"]]
    except KeyError:
        raise ValueError(f"rareza desconocida: {r}") from None


@lru_cache(maxsize=None)
def load(name: str):
    """Un JSON de `raw/` (`skins`, `skins_not_grouped`, `crates`, `collections`, `skinport`)."""
    f = RAW / f"{name}.json"
    if not f.exists():
        raise SystemExit(f"falta {f}: corré games/cs2/tools/fetch.py")
    return json.loads(f.read_text(encoding="utf-8"))


def slugify(s: str) -> str:
    """El mismo `slugify` de `site/src/route.ts`: ★, ™ y | se caen con todo lo que no es ASCII o letra."""
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['.]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def fnv1a(s: str) -> int:
    """FNV-1a de 32 bits sobre los bytes UTF-8: `pzHash` de `site/src/zomboid/shard.ts`."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug: str) -> int:
    """En qué archivo va un slug: `pzShardOf(slug, CHUNKS)` (el archivo se llama con dos dígitos)."""
    return fnv1a(slug) % CHUNKS


def write_json(path: Path, data) -> bool:
    """Escribe compacto y sólo si cambió; devuelve si escribió."""
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if path.exists() and path.read_text(encoding="utf-8") == txt:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(txt, encoding="utf-8", newline="\n")
    return True
