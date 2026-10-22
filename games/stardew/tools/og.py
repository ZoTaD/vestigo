"""La vista previa de la sección (site/public/stardew/og.jpg, 1200×630): la que se ve al compartir un enlace de
Stardew Valley. Es el paisaje de la pantalla de título del juego (`LooseSprites/stardewPanorama`, que `textures.py`
pasa a PNG) agrandado sin suavizar, con el nombre en Pixelify Sans: **sin el logo oficial**, que el sitio no usa.

Uso: python games/stardew/tools/og.py   (después de textures.py; pide Pillow y fontTools, y `npm install` en site/)
"""
from __future__ import annotations

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "site"
PANORAMA = ROOT / "games" / "stardew" / "raw" / "textures" / "LooseSprites" / "stardewPanorama.png"
OG = SITE / "public" / "stardew" / "og.jpg"
# La tipografía de los títulos de la sección (Pixelify Sans 700, OFL), la misma que baja el sitio: Pillow no lee woff2,
# así que se pasa a TTF en memoria con fontTools, como en Terraria.
FONT_WOFF2 = SITE / "node_modules" / "@fontsource" / "pixelify-sans" / "files" / "pixelify-sans-latin-700-normal.woff2"
W, H = 1200, 630
# Los colores del menú del juego (los mismos de `site/src/styles/stardew.css`): crema sobre madera oscura.
CREAM, INK, WOOD = (255, 243, 214), (59, 31, 18), (177, 78, 5)


def font(size: int) -> ImageFont.FreeTypeFont:
    ttf = io.BytesIO()
    f = TTFont(str(FONT_WOFF2))
    f.flavor = None
    f.save(ttf)
    return ImageFont.truetype(io.BytesIO(ttf.getvalue()), size)


def build() -> Image.Image:
    pano = Image.open(PANORAMA).convert("RGB")
    # ×2 sin suavizar (es pixel art): 1280×800. Se recorta el centro de abajo, con el valle entero y el mar.
    big = pano.resize((pano.width * 2, pano.height * 2), Image.NEAREST)
    left = (big.width - W) // 2
    im = big.crop((left, big.height - H, left + W, big.height))
    draw = ImageDraw.Draw(im)

    def text(y: int, what: str, f: ImageFont.FreeTypeFont, fill: tuple, stroke: int) -> None:
        x = (W - draw.textlength(what, font=f)) // 2
        draw.text((x, y), what, font=f, fill=fill, stroke_width=stroke, stroke_fill=INK)

    text(40, "Stardew Valley", font(128), CREAM, 8)
    text(200, "Items · Villagers · Community Center", font(46), CREAM, 5)
    # La marca del sitio en una tablita de madera, como los botones del menú.
    f = font(40)
    label = "vestigo.gg"
    tw = draw.textlength(label, font=f)
    x0, y0 = (W - tw) // 2 - 22, H - 92
    draw.rectangle((x0, y0, x0 + tw + 44, y0 + 62), fill=(231, 139, 44), outline=INK, width=4)
    draw.text((x0 + 22, y0 + 8), label, font=f, fill=(255, 247, 224))
    return im


def main() -> None:
    if not FONT_WOFF2.exists():
        raise SystemExit(f"Falta la tipografía {FONT_WOFF2}: corré `npm install` en site/.")
    if not PANORAMA.exists():
        raise SystemExit(f"Falta {PANORAMA}: corré dump.sh y textures.py.")
    build().save(OG, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{OG.name}: {W}x{H}, {OG.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
