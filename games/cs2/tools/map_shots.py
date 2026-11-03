"""
Las imágenes de los mapas para los mosaicos de la ficha de equipo de CS2 (2026-11-03, etapa 6b): la captura de cada
mapa que trae el juego (`panorama/images/map_icons/screenshots/1080p/de_<mapa>_png`), achicada a WebP de 640×360 en
`site/public/cs2/maps/<slug>.webp`. No corre en la Action: sale del juego instalado, como `background.py`.

    python games/cs2/tools/map_shots.py --vrf <Source2Viewer-CLI.exe> [--game <carpeta de CS2>]
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

from cs2 import slugify

GAME = Path("C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive")
DIR = "panorama/images/map_icons/screenshots/1080p"
OUT = Path(__file__).resolve().parents[3] / "site" / "public" / "cs2" / "maps"
# Los mapas de competición de los últimos años, por el nombre con que los escribe Liquipedia.
MAPS = {"Mirage": "de_mirage", "Nuke": "de_nuke", "Inferno": "de_inferno", "Ancient": "de_ancient", "Anubis": "de_anubis",
        "Dust II": "de_dust2", "Train": "de_train", "Overpass": "de_overpass", "Cache": "de_cache", "Vertigo": "de_vertigo",
        "Office": "cs_office", "Italy": "cs_italy"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True)
    ap.add_argument("--game", type=Path, default=GAME)
    a = ap.parse_args()
    vpk = a.game / "game" / "csgo" / "pak01_dir.vpk"
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([a.vrf, "-i", str(vpk), "-o", tmp, "-d", "-f", f"{DIR}/", "-e", "vtex_c"], check=True, capture_output=True)
        for name, key in MAPS.items():
            src = Path(tmp) / DIR / f"{key}_png.png"
            if not src.exists():
                print(f"sin captura de {name} ({key})")
                continue
            im = ImageOps.fit(Image.open(src).convert("RGB"), (640, 360), Image.LANCZOS)
            im.save(OUT / f"{slugify(name)}.webp", "WEBP", quality=72, method=6)
            print(OUT / f"{slugify(name)}.webp")


if __name__ == "__main__":
    main()
