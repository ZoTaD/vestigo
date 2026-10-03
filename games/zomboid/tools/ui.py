"""
Las piezas de interfaz del juego que usa la sección de Project Zomboid (2026-09-30): los mapas de papel de cada pueblo
(`media/ui/LootableMaps/<pueblo>map.png`), que son el fondo de la portada y la base de la estética "Libreta de
supervivencia" (docs/design/2026-09-30-zomboid.md).

Uso, desde la raíz del repo:
    python games/zomboid/tools/ui.py
La instalación se busca en la carpeta de Steam por defecto, o en la variable de entorno PZ_DIR.
"""
import os
from pathlib import Path

from PIL import Image

GAME = Path(os.environ.get("PZ_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid"))
OUT = Path(__file__).resolve().parents[3] / "site" / "public" / "zomboid" / "ui"
# Los pueblos que tienen mapa de papel en el juego. El lado largo se achica a 1600 px: la portada lo muestra a unos
# 560 px de ancho y con eso alcanza para pantallas de doble densidad.
TOWNS = ["muldraugh", "westpoint", "riverside", "rosewood", "marchridge"]
MAX_SIDE = 1600


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for town in TOWNS:
        src = GAME / "media" / "ui" / "LootableMaps" / f"{town}map.png"
        im = Image.open(src).convert("RGB")
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        dst = OUT / f"{town}map.webp"
        im.save(dst, "WEBP", quality=84, method=6)
        print(f"{dst.name}: {im.width}x{im.height}, {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
