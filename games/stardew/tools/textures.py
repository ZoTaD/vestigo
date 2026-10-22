"""
Las texturas de Stardew Valley (XNB Texture2D) → PNG en games/stardew/raw/textures/.

Reusa el lector de XNB de Terraria (`games/terraria/tools/xnb.py`, LZX incluido):
los dos juegos usan el mismo formato. La diferencia es que Stardew guarda los
colores **premultiplicados por el alfa** (lo que hace el pipeline de XNA por
defecto): sin deshacerlo, los bordes semitransparentes salen oscuros.

Sólo las carpetas con arte; `Data` y `Strings` los vuelca la sonda (`Dump.cs`),
y `XACT`, `Fonts` y `Effects` no son imágenes.

Uso: python games/stardew/tools/textures.py
"""
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "games" / "terraria" / "tools"))
import xnb  # noqa: E402

JUEGO = Path(os.environ.get("STARDEW_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\Stardew Valley"))
CONTENT = JUEGO / "Content"
OUT = ROOT / "games" / "stardew" / "raw" / "textures"
CARPETAS = ["Animals", "Buildings", "Characters", "LooseSprites", "Maps", "Minigames", "Portraits", "TerrainFeatures", "TileSheets"]


def unpremultiply(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", im.size)
    po = out.load()
    for y in range(h):
        for x in range(w):
            cr, cg, cb, ca = px[x, y]
            if ca == 0:
                po[x, y] = (0, 0, 0, 0)
            elif ca == 255:
                po[x, y] = (cr, cg, cb, 255)
            else:
                po[x, y] = (min(255, cr * 255 // ca), min(255, cg * 255 // ca), min(255, cb * 255 // ca), ca)
    return out


def main() -> int:
    ok = fallos = otros = 0
    for carpeta in CARPETAS:
        for f in sorted((CONTENT / carpeta).rglob("*.xnb")):
            rel = f.relative_to(CONTENT).with_suffix(".png")
            dest = OUT / rel
            if dest.exists() and dest.stat().st_mtime >= f.stat().st_mtime:
                ok += 1
                continue
            try:
                im = xnb.texture(f)
            except ValueError:
                otros += 1  # no es una textura (mapas .tbin, diccionarios)
                continue
            except Exception as e:  # noqa: BLE001
                fallos += 1
                print("!!", rel, repr(e))
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            unpremultiply(im.copy()).save(dest)
            ok += 1
    print(f"{ok} texturas, {otros} XNB que no son textura, {fallos} fallaron -> {OUT}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
