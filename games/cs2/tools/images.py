"""
Las imágenes de CS2 del sitio (2026-11-03): `site/public/cs2/s/<slug>.webp` (listas, 128 px de ancho) y
`site/public/cs2/l/<slug>.webp` (fichas, 360 px) para cada skin, caja y colección del catálogo.

    python games/cs2/tools/images.py

Baja sólo las que faltan, de a una y con pausa (nada de ráfagas al CDN de Steam). Las del CDN de Steam se piden ya
achicadas (`/360fx360f`). Una que no baja se anota y se sigue; el sitio muestra la caja vacía.
"""
import io
import time
import urllib.request
from pathlib import Path

from PIL import Image

from site_data import build

SITE = Path(__file__).resolve().parents[3] / "site" / "public" / "cs2"
SMALL, LARGE = SITE / "s", SITE / "l"
PX_SMALL, PX_LARGE = 128, 360
CALIDAD = 82


def _bajar(url: str) -> bytes:
    if "steamstatic.com/economy/image/" in url:
        url += "/360fx360f"
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "vestigo-images"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if intento == 2:
                raise
            time.sleep(2 ** intento)
    raise RuntimeError("inalcanzable")


def _guardar(im: Image.Image, destino: Path, ancho: int) -> None:
    im = im.copy()
    im.thumbnail((ancho, ancho), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, "WEBP", quality=CALIDAD, method=4)


def main() -> None:
    d = build()
    imgs, respaldos = d["images"], d["fallbacks"]
    faltan = [(s, u) for s, u in imgs.items() if not (SMALL / f"{s}.webp").exists() or not (LARGE / f"{s}.webp").exists()]
    print(f"{len(imgs)} imágenes, faltan {len(faltan)}")
    malas = []
    for n, (slug, url) in enumerate(faltan, 1):
        error = None
        for u in [url, *respaldos.get(slug, [])]:
            try:
                im = Image.open(io.BytesIO(_bajar(u))).convert("RGBA")
                _guardar(im, LARGE / f"{slug}.webp", PX_LARGE)
                _guardar(im, SMALL / f"{slug}.webp", PX_SMALL)
                error = None
                break
            except Exception as e:  # noqa: BLE001 (una mala no corta las demás: se prueba el respaldo)
                error = e
        if error:
            malas.append(f"{slug}: {error}")
        time.sleep(0.1)
        if n % 200 == 0:
            print(f"  {n}/{len(faltan)}")
    for m in malas:
        print("  sin imagen:", m)
    # Las que ya no están en el catálogo se borran.
    for carpeta in (SMALL, LARGE):
        for f in carpeta.glob("*.webp"):
            if f.stem not in imgs:
                f.unlink()


if __name__ == "__main__":
    main()
