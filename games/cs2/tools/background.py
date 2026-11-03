"""
El fondo de la cabecera de CS2 (2026-11-03, pedido de ZoTaD): la pantalla de carga de Dust II del juego, achicada a
WebP en `site/public/cs2/bg/` (1600 px y 800 px para el teléfono). No corre en la Action: sale del juego instalado.

    python games/cs2/tools/background.py --vrf <Source2Viewer-CLI.exe> [--game <carpeta de CS2>]

Source2Viewer-CLI: github.com/ValveResourceFormat/ValveResourceFormat/releases (el mismo que usa Deadlock).
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

GAME = Path("C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive")
SHOT = "panorama/images/map_icons/screenshots/1080p/de_dust2_png"
OUT = Path(__file__).resolve().parents[3] / "site" / "public" / "cs2" / "bg"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True)
    ap.add_argument("--game", type=Path, default=GAME)
    a = ap.parse_args()
    vpk = a.game / "game" / "csgo" / "pak01_dir.vpk"
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([a.vrf, "-i", str(vpk), "-o", tmp, "-d", "-f", SHOT], check=True, capture_output=True)
        im = Image.open(Path(tmp) / f"{SHOT}.png").convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    for ancho in (1600, 800):
        im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS).save(OUT / f"dust2-{ancho}.webp", "WEBP", quality=72, method=6)
        print(OUT / f"dust2-{ancho}.webp")


if __name__ == "__main__":
    main()
