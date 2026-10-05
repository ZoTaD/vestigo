"""
El fondo de la portada de Rust (2026-10-05): un cuadro del video del menú del juego
(`RustClient_Data/StreamingAssets/MenuVideo/mp4/outpost.mp4`), desenfocado en el archivo. Así el navegador no hace
el blur en cada scroll, y la imagen pesa menos (el desenfoque se comprime mucho mejor). Lo oscurece `rust.css`.

Uso, desde la raíz del repo (necesita ffmpeg en el PATH):
    python games/rust/tools/ui.py
"""
import os
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (video, second) in FRAMES.items():
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "frame.png"
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-ss", str(second), "-i", str(VIDEOS / video), "-frames:v", "1", str(png)],
                check=True,
            )
            im = Image.open(png).convert("RGB")
        im.thumbnail((WIDTH, WIDTH))
        im = im.filter(ImageFilter.GaussianBlur(BLUR))
        dst = OUT / f"{name}.webp"
        im.save(dst, "WEBP", quality=70, method=6)
        print(f"{dst.name}: {im.width}x{im.height}, {dst.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
