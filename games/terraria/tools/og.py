"""La vista previa de la sección (site/public/terraria/og.jpg, 1200×630): la que se ve al compartir un enlace de
Terraria. Es el mismo paisaje de la portada, armado con el arte que ya sacó `sprites.py`: cielo, sol, nubes, montañas,
árboles, el logo del juego y una franja de pasto y tierra.

Uso: python games/terraria/tools/og.py   (después de sprites.py; pide Pillow y fontTools, y `npm install` en site/)
"""
from __future__ import annotations

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

SITE = Path(__file__).resolve().parents[3] / "site"
ART = SITE / "public" / "terraria" / "art"
OG = SITE / "public" / "terraria" / "og.jpg"
# La tipografía de la sección (Comic Neue 700, OFL), la misma que baja el sitio: Pillow no lee woff2, así que se pasa a
# TTF en memoria con fontTools.
FONT_WOFF2 = SITE / "node_modules" / "@fontsource" / "comic-neue" / "files" / "comic-neue-latin-700-normal.woff2"
W, H = 1200, 630


def font(size: int) -> ImageFont.FreeTypeFont:
    ttf = io.BytesIO()
    f = TTFont(str(FONT_WOFF2))
    f.flavor = None
    f.save(ttf)
    return ImageFont.truetype(io.BytesIO(ttf.getvalue()), size)


def art(name: str, scale: float) -> Image.Image:
    """Una pieza del arte, agrandada sin suavizar (es pixel art)."""
    im = Image.open(ART / name).convert("RGBA")
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.NEAREST)


def build() -> Image.Image:
    im = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(im)
    # El cielo de día de la portada, de arriba abajo.
    top, low = (79, 124, 232), (172, 205, 255)
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, low)) + (255,))
    im.alpha_composite(art("sun.png", 1.3), (1010, 36))
    for name, x, y, scale in (("cloud-5.png", 20, 40, 1.0), ("cloud-0.png", 880, 190, 0.9), ("cloud-2.png", 60, 215, 0.9)):
        im.alpha_composite(art(name, scale), (x, y))
    # Las capas del fondo, de lejos a cerca: cada una asoma su parte de arriba y la de adelante tapa el resto.
    ground = H - 96
    for name, top_y in (("sky-mountains.png", 250), ("sky-hills.png", 330), ("sky-trees-far.png", 380), ("sky-trees-near.png", 400)):
        layer = art(name, W / 1024)
        im.alpha_composite(layer.crop((0, 0, W, min(layer.height, H - top_y))), (0, top_y))
    dirt, grass = art("dirt.png", 2), art("grass.png", 2)
    for x in range(0, W, dirt.width):
        im.alpha_composite(dirt, (x, ground))
    for x in range(0, W, grass.width):
        im.alpha_composite(grass, (x, ground))

    logo = art("logo.png", 1.25)
    im.alpha_composite(logo, ((W - logo.width) // 2, 36))
    draw = ImageDraw.Draw(im)
    big, small = font(54), font(38)

    def text(y: int, what: str, f: ImageFont.FreeTypeFont, fill: tuple) -> None:
        # Blanco con filo negro, como las letras del juego.
        x = (W - draw.textlength(what, font=f)) // 2
        draw.text((x, y), what, font=f, fill=fill, stroke_width=5, stroke_fill=(0, 0, 0))

    text(232, "Items · Crafting tree · Bosses · NPCs", big, (255, 255, 255))
    text(H - 78, "vestigo.gg", small, (231, 194, 27))
    return im.convert("RGB")


def main() -> None:
    if not FONT_WOFF2.exists():
        raise SystemExit(f"Falta la tipografía {FONT_WOFF2}: corré `npm install` en site/.")
    build().save(OG, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{OG.name}: {W}x{H}, {OG.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
