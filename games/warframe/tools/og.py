"""La vista previa de la sección (site/public/warframe/og.jpg, 1200×630): la que se ve al compartir un enlace de Warframe.
Es el azul noche con el resplandor radial de la sección, el nombre en Rajdhani y cuatro íconos de lo que hay adentro
(Excalibur, una reliquia, Neural Sensors y Serration): **sin el logo de Warframe ni el de Digital Extremes**.

Uso: python games/warframe/tools/og.py   (después de images.py; pide Pillow y fontTools, y `npm install` en site/)
"""
from __future__ import annotations

import io
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "site"
DATA = ROOT / "games" / "warframe" / "data"
PUBLICO = SITE / "public" / "warframe"
OG = PUBLICO / "og.jpg"
# La tipografía de los títulos de la sección (Rajdhani 700, OFL), la misma que baja el sitio: Pillow no lee woff2, así
# que se pasa a TTF en memoria con fontTools.
FUENTES = SITE / "node_modules" / "@fontsource" / "rajdhani" / "files"
W, H = 1200, 630
# Los colores de `site/src/styles/warframe.css`.
INK, DIM, ACC, DEEP = (232, 238, 244), (143, 163, 181), (111, 211, 255), (11, 19, 28)
# Una ficha de cada pestaña: (pestaña, slug inglés).
MUESTRA = [("arsenal", "excalibur"), ("relics", "lith-a1"), ("farming", "neural-sensors"), ("mods", "serration")]


def fuente(peso: int, size: int) -> ImageFont.FreeTypeFont:
    ttf = io.BytesIO()
    f = TTFont(str(FUENTES / f"rajdhani-latin-{peso}-normal.woff2"))
    f.flavor = None
    f.save(ttf)
    return ImageFont.truetype(io.BytesIO(ttf.getvalue()), size)


def fondo() -> Image.Image:
    """Azul noche con el resplandor radial arriba a la izquierda (el fondo de `.wf`)."""
    im = Image.new("RGB", (W, H), (7, 11, 16))
    glow = Image.new("RGB", (W, H), (29, 51, 70))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).ellipse((-380, -420, 880, 360), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(160))
    im.paste(glow, (0, 0), mask)
    return im


def icono(tab: str, slug: str) -> Image.Image | None:
    lista = json.loads((DATA / tab / "list.json").read_text(encoding="utf-8"))
    fila = next((r for r in lista if r["slug"] == slug), None)
    if not fila:
        return None
    # El grande (sólo el Arsenal lo tiene) o, si no, el de las listas.
    for carpeta in ("l", "s"):
        archivo = PUBLICO / carpeta / f"{fila['img']}.webp"
        if archivo.exists():
            return Image.open(archivo).convert("RGBA")
    return None


def build() -> Image.Image:
    im = fondo()
    draw = ImageDraw.Draw(im, "RGBA")

    def texto(x: int, y: int, what: str, f: ImageFont.FreeTypeFont, fill: tuple, espacio: int = 0) -> None:
        for ch in what:
            draw.text((x, y), ch, font=f, fill=fill)
            x += int(draw.textlength(ch, font=f)) + espacio

    texto(80, 70, "WARFRAME GUIDE", fuente(600, 30), ACC, 8)
    texto(80, 120, "WARFRAME", fuente(700, 150), INK, 6)
    texto(84, 300, "Arsenal · Relics · Where to farm · Mods", fuente(600, 44), DIM)
    # Los cuatro íconos en paneles de vidrio, sin bordes de color.
    for i, (tab, slug) in enumerate(MUESTRA):
        x0 = 80 + i * 200
        draw.rounded_rectangle((x0, 390, x0 + 176, 566), radius=6, fill=(140, 180, 220, 24))
        ic = icono(tab, slug)
        if ic:
            ic = ic.resize((128, 128), Image.LANCZOS)
            im.paste(ic, (x0 + 24, 414), ic)
    # La marca del sitio, abajo a la derecha.
    f = fuente(700, 40)
    label = "vestigo.gg"
    tw = draw.textlength(label, font=f)
    draw.text((W - 80 - tw, H - 96), label, font=f, fill=INK)
    return im


def main() -> None:
    for peso in (600, 700):
        archivo = FUENTES / f"rajdhani-latin-{peso}-normal.woff2"
        if not archivo.exists():
            raise SystemExit(f"Falta la tipografía {archivo}: corré `npm install` en site/.")
    build().save(OG, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{OG.name}: {W}x{H}, {OG.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
