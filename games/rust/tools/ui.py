"""
El fondo de la portada de Rust (2026-10-05): un cuadro del video del menú del juego
(`RustClient_Data/StreamingAssets/MenuVideo/mp4/outpost.mp4`), desenfocado en el archivo. Así el navegador no hace
el blur en cada scroll, y la imagen pesa menos (el desenfoque se comprime mucho mejor). Lo oscurece `rust.css`.

Del mismo cuadro, sin desenfocar, sale la vista previa de la sección (`site/public/rust/og.jpg`), la que se ve al
compartir un enlace de Rust.

Uso, desde la raíz del repo (necesita ffmpeg en el PATH, `pip install fonttools brotli` y `npm install` en site/):
    python games/rust/tools/ui.py
"""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter

RUST_DIR = Path(os.environ.get("RUST_DIR", r"C:\Program Files (x86)\Steam\steamapps\common\Rust"))
VIDEOS = RUST_DIR / "RustClient_Data" / "StreamingAssets" / "MenuVideo" / "mp4"
OUT = Path(__file__).resolve().parents[3] / "site" / "public" / "rust" / "bg"
# El video y el segundo del cuadro: una calle de Outpost a pleno día, que se lee bien detrás de los paneles.
FRAMES = {"outpost": ("outpost.mp4", 4)}
WIDTH = 1920
BLUR = 6
OG = Path(__file__).resolve().parents[3] / "site" / "public" / "rust" / "og.jpg"
# La tipografía de la sección (Roboto Condensed 800, OFL), la misma que baja el sitio: Pillow no lee woff2, así que se
# pasa a TTF en memoria con fontTools.
FONT_WOFF2 = Path(__file__).resolve().parents[3] / "site" / "node_modules" / "@fontsource" / "roboto-condensed" / "files" / "roboto-condensed-latin-800-normal.woff2"


def og_image(frame: Image.Image) -> None:
    """La vista previa de 1200×630: el cuadro del menú oscurecido, "RUST" grande y la bajada, en el estilo del HUD."""
    import io

    from fontTools.ttLib import TTFont
    from PIL import ImageDraw, ImageEnhance, ImageFont

    ttf = io.BytesIO()
    font = TTFont(str(FONT_WOFF2))
    font.flavor = None
    font.save(ttf)
    big = ImageFont.truetype(io.BytesIO(ttf.getvalue()), 190)
    small = ImageFont.truetype(io.BytesIO(ttf.getvalue()), 44)

    w, h = 1200, 630
    im = frame.copy()
    scale = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - w) // 2, (im.height - h) // 2
    im = ImageEnhance.Brightness(im.crop((left, top, left + w, top + h))).enhance(0.45)
    draw = ImageDraw.Draw(im)
    # El panel va opaco (el tono de los paneles, #1e1e1c): `draw.rectangle` sobre RGB no mezcla un relleno con alfa.
    draw.rectangle((60, 150, 760, 480), fill=(30, 30, 28))
    draw.text((95, 165), "RUST", font=big, fill=(226, 219, 211))
    draw.text((100, 380), "ITEMS · CRAFTING · RAIDS", font=small, fill=(163, 157, 147))
    draw.rectangle((60, 500, 300, 512), fill=(108, 142, 54))
    draw.text((60, 540), "vestigo.gg", font=small, fill=(226, 219, 211))
    im.save(OG, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"{OG.name}: {w}x{h}, {OG.stat().st_size // 1024} KB")


def main() -> None:
    # Antes de tocar nada: sin ffmpeg o sin la tipografía el script moría a la mitad, con el fondo ya escrito y la
    # vista previa sin regenerar.
    if shutil.which("ffmpeg") is None:
        raise SystemExit("Falta ffmpeg en el PATH (se usa para sacar el cuadro del video del menú).")
    if not FONT_WOFF2.exists():
        raise SystemExit(f"Falta la tipografía {FONT_WOFF2}: corré `npm install` en site/.")
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (video, second) in FRAMES.items():
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "frame.png"
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-ss", str(second), "-i", str(VIDEOS / video), "-frames:v", "1", str(png)],
                check=True,
            )
            im = Image.open(png).convert("RGB")
        # La vista previa quiere el cuadro nítido: se guarda antes de achicar y desenfocar el fondo.
        sharp = im.copy()
        im.thumbnail((WIDTH, WIDTH))
        im = im.filter(ImageFilter.GaussianBlur(BLUR))
        dst = OUT / f"{name}.webp"
        im.save(dst, "WEBP", quality=70, method=6)
        print(f"{dst.name}: {im.width}x{im.height}, {dst.stat().st_size // 1024} KB")
        if name == "outpost":
            og_image(sharp)


if __name__ == "__main__":
    main()
