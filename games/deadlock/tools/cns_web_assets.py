"""
Material de la página oficial de City Never Sleeps → site/public/deadlock/game/ui/cns/

La actualización del 2026-09-29 trajo una página propia
(https://www.playdeadlock.com/cityneversleeps) con la estética que ZoTaD pidió
para el sitio: la ciudad de noche en blanco y negro, el borde de papel rasgado
entre secciones, las siluetas de cada línea y el grano. Nada de esto está en el
juego instalado, así que se baja de la CDN de Valve una sola vez.

Uso:
    python games/deadlock/tools/cns_web_assets.py
"""
import io, os, urllib.request
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "site", "public", "deadlock", "game", "ui", "cns")
CDN = "https://cdn.fastly.steamstatic.com/apps/deadlock/images/react/cityneversleeps/"
UA = "vestigo.gg deadlock-assets/1.0 (+https://vestigo.gg)"

# (archivo en la CDN, nombre en el sitio, ancho máximo, calidad)
ASSETS = [
    ("header_city.webp", "city.webp", 1600, 72),
    ("scratch_edge.png", "torn-edge.webp", 2000, 90),
    ("skyline_blue.webp", "skyline-blue.webp", 1400, 80),
    ("skyline_green.webp", "skyline-green.webp", 1400, 80),
    ("skyline_yellow.webp", "skyline-yellow.webp", 1400, 80),
    ("grain.jpg", "grain.webp", 1024, 60),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for src, name, max_w, q in ASSETS:
        req = urllib.request.Request(CDN + src, headers={"User-Agent": UA})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read()))
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        dst = os.path.join(OUT, name)
        im.save(dst, "WEBP", quality=q, method=6)
        print(f"{name}: {im.size[0]}x{im.size[1]} · {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
