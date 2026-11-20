"""
Los datos base de Age of Empires II: DE (2026-11-20): las civs con su nombre en inglés y en español, sus escudos y el
arte de interfaz que usa la sección. Diseño: docs/superpowers/specs/2026-11-20-aoe2-design.md.

    python games/aoe2/tools/game_data.py [--game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE"]

Lee de la instalación del juego (nada de eso va al repo):
  - `resources/_common/dat/civilizations.json`: la lista de civs. El id de cada civ es su índice (Gaia = 0), el mismo
    `civilization_id` que traen las partidas de la API.
  - `resources/en|mx/strings/key-value/key-value-strings-utf8.txt`: los nombres (`mx` = español latino).
  - `resources/_common/wpfg/resources/`: escudos de civ (`civ_techtree/`) y arte de interfaz.

Escribe `games/aoe2/data/{civs,meta}.json` y las imágenes en `site/public/aoe2/{civ,ui}/` (WebP; sólo si cambiaron).
"""
import argparse
import json
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
DATA = RAIZ / "games" / "aoe2" / "data"
PUBLIC = RAIZ / "site" / "public" / "aoe2"
JUEGO = Path("C:/Program Files (x86)/Steam/steamapps/common/AoE2DE")

_LINEA = re.compile(r'^\s*(\d+)\s+"((?:[^"\\]|\\.)*)"')

# El arte de interfaz que usa la sección: destino → (carpeta de wpfg/resources, archivo, ancho máximo).
ARTE = {
    "mode-rm": ("gamemode", "button_image_random_map.png", 800),
    "mode-team": ("gamemode", "button_image_king_of_the_hill.png", 800),
    "mode-ew": ("gamemode", "button_image_empire_wars.png", 800),
    "mode-dm": ("gamemode", "button_image_death_match.png", 800),
    "strip-1": ("gamemode", "button_image_random_map.png", 800),
    "strip-2": ("gamemode", "button_image_death_match.png", 800),
    "strip-3": ("gamemode", "button_image_defend_the_wonder.png", 800),
    "strip-4": ("gamemode", "button_image_empire_wars.png", 800),
    "strip-5": ("gamemode", "button_image_regicide.png", 800),
    "shield-sp": ("mainmenu", "shield_singleplayer_normal.png", 180),
    "shield-mp": ("mainmenu", "shield_multiplayer_normal.png", 180),
    "btn": ("button_large", "button_large_normal.png", 706),
    "btn-on": ("button_large", "button_large_active.png", 706),
    "winner": ("timeline", "winner.png", 112),
    "star": ("timeline", "star.png", 112),
    "mvp": ("timeline", "mvp.png", 112),
    "civ-unknown": ("civ_emblems", "random.png", 96),
}


def parse_strings(text: str) -> dict[int, str]:
    """Las líneas `<id> "<texto>"` de un archivo de textos del juego; comentarios y líneas en blanco afuera."""
    out: dict[int, str] = {}
    for linea in text.splitlines():
        m = _LINEA.match(linea)
        if m:
            out[int(m.group(1))] = m.group(2).replace('\\"', '"')
    return out


def _slug(nombre: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", nombre.lower()).strip("-")


def civ_table(lista: list[dict], en: dict[int, str], es: dict[int, str]) -> list[dict]:
    """Las civs jugables (con escudo en el árbol tecnológico), con id = índice en `civilization_list`. El slug sale del
    nombre en inglés (`hindustanis`, no `indians`) y `file` es el nombre del escudo en el juego."""
    out = []
    for i, c in enumerate(lista):
        img = c.get("tech_tree_image_path")
        if not img:
            continue
        nombre_en = en.get(c.get("name_string_id", -1)) or c["internal_name"]
        out.append({
            "id": i,
            "slug": _slug(nombre_en),
            "file": Path(img).stem.removeprefix("menu_techtree_"),
            "name": {"en": nombre_en, "es": es.get(c.get("name_string_id", -1)) or nombre_en},
            "era": c.get("era", "base"),
        })
    return out


def _webp(origen: Path, destino: Path, ancho: int, cuadrado: int | None = None) -> bool:
    """Guarda `origen` como WebP de hasta `ancho` px (o recortado a su contenido y centrado en `cuadrado`×`cuadrado`).
    Devuelve si escribió (no reescribe un archivo idéntico)."""
    from PIL import Image

    im = Image.open(origen).convert("RGBA")
    if cuadrado:
        caja = im.getbbox()
        if caja:
            im = im.crop(caja)
        im.thumbnail((cuadrado, cuadrado), Image.LANCZOS)
        lienzo = Image.new("RGBA", (cuadrado, cuadrado))
        lienzo.paste(im, ((cuadrado - im.width) // 2, (cuadrado - im.height) // 2))
        im = lienzo
    elif im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "WEBP", quality=85, method=6)
    datos = buf.getvalue()
    if destino.exists() and destino.read_bytes() == datos:
        return False
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(datos)
    return True


def _escribir_json(ruta: Path, obj) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", type=Path, default=JUEGO)
    a = ap.parse_args()
    res = a.game / "resources"
    wpfg = res / "_common" / "wpfg" / "resources"
    textos = lambda idioma: parse_strings((res / idioma / "strings" / "key-value" / "key-value-strings-utf8.txt").read_text(encoding="utf-8"))
    lista = json.loads((res / "_common" / "dat" / "civilizations.json").read_text(encoding="utf-8"))["civilization_list"]
    civs = civ_table(lista, textos("en"), textos("mx"))

    escritas = 0
    for c in civs:
        escritas += _webp(wpfg / "civ_techtree" / f"menu_techtree_{c['file']}.png", PUBLIC / "civ" / f"{c['slug']}.webp", 96, cuadrado=96)
    for destino, (carpeta, archivo, ancho) in ARTE.items():
        escritas += _webp(wpfg / carpeta / archivo, PUBLIC / "ui" / f"{destino}.webp", ancho, cuadrado=96 if destino == "civ-unknown" else None)

    _escribir_json(DATA / "civs.json", [{k: c[k] for k in ("id", "slug", "name", "era")} for c in civs])
    _escribir_json(DATA / "meta.json", {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "civs": len(civs)})
    print(f"{len(civs)} civs; {escritas} imágenes nuevas o cambiadas")


if __name__ == "__main__":
    main()
