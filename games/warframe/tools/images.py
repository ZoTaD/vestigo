"""Íconos del sitio: nombra cada ícono usado, lo baja una vez a `raw/icons/` y escribe los WebP de `site/public/warframe/`.

Uso: python games/warframe/tools/images.py

`s/<archivo>.webp` es de 128 px (listas y chips) y `l/<archivo>.webp` de 256 px (la imagen de la ficha del Arsenal).
El nombre del archivo sale de la ruta de la textura en el manifiesto (varios objetos comparten una), así que se baja
y se convierte una sola vez. Lo que `site_data.build()` llama `icons` es lo que se baja.
"""
import io
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wf  # noqa: E402

JUEGO = Path(__file__).resolve().parents[1]
CACHE = wf.RAW / "icons"
PUBLIC = Path(__file__).resolve().parents[3] / "site" / "public" / "warframe"
SMALL = PUBLIC / "s"
LARGE = PUBLIC / "l"
PX_SMALL, PX_LARGE = 128, 256
CALIDAD = 82
HILOS = 4
REINTENTOS = 3
PREFIJO = "/Lotus/Interface/Icons/"

# Ícono genérico por tipo, para el objeto que el manifiesto no trae: (color del disco, letra).
GENERICOS = {
    "warframe": "W", "primary": "P", "secondary": "S", "melee": "M", "archwing": "A", "companion": "C",
    "exalted": "E", "mod": "M", "arcane": "A", "resource": "R", "relic": "R", "part": "P",
}


def icon_name(unique: str):
    """Nombre del archivo (sin extensión) del ícono de un objeto, o None si el manifiesto no lo trae."""
    ruta = wf._iconos().get(unique)
    if not ruta:
        return None
    ruta = ruta.split("!")[0].rsplit(".", 1)[0]
    if ruta.startswith(PREFIJO):
        ruta = ruta[len(PREFIJO):]
    return wf.slugify(ruta.replace("/", "-"))


def generic_name(tipo: str) -> str:
    return f"generic-{tipo}"


def _generico(tipo: str, lado: int) -> Image.Image:
    """Un disco azul noche con la inicial del tipo: sólo cuando falta el ícono real."""
    im = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = lado // 10
    d.ellipse((m, m, lado - m, lado - m), fill=(26, 42, 66, 255), outline=(111, 211, 255, 255), width=max(2, lado // 40))
    d.text((lado // 2, lado // 2), GENERICOS[tipo], fill=(111, 211, 255, 255), anchor="mm", font_size=lado // 2)
    return im


def _bajar(url: str) -> bytes:
    """Un ícono, con reintento corto (1 s, 2 s, 4 s). El servidor corta si se lo apura."""
    for intento in range(REINTENTOS + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "vestigo-build"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if intento == REINTENTOS:
                raise
            time.sleep(2 ** intento)
    raise AssertionError("inalcanzable")


def _guardar(im: Image.Image, destino: Path, lado: int) -> None:
    im = im.convert("RGBA")
    im.thumbnail((lado, lado), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, "WEBP", quality=CALIDAD, method=6)


def _uno(item: tuple[str, dict]) -> str | None:
    """Baja (si no está en la caché) y convierte un ícono. Devuelve el nombre si falló."""
    nombre, info = item
    grande = info.get("large", False)
    if (SMALL / f"{nombre}.webp").exists() and (not grande or (LARGE / f"{nombre}.webp").exists()):
        return None
    try:
        if info.get("generic"):
            _guardar(_generico(info["generic"], PX_LARGE), SMALL / f"{nombre}.webp", PX_SMALL)
            if grande:
                _guardar(_generico(info["generic"], PX_LARGE), LARGE / f"{nombre}.webp", PX_LARGE)
            return None
        cache = CACHE / f"{nombre}.png"
        if not cache.exists():
            CACHE.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(_bajar(info["url"]))
        im = Image.open(io.BytesIO(cache.read_bytes()))
        im.load()
        _guardar(im, SMALL / f"{nombre}.webp", PX_SMALL)
        if grande:
            _guardar(im, LARGE / f"{nombre}.webp", PX_LARGE)
    except Exception as e:  # noqa: BLE001 — se anota y se sigue; la corrida siguiente retoma lo que falta
        return f"{nombre}: {e}"
    return None


def run(icons: dict) -> list[str]:
    """Baja y convierte todos los íconos de `icons` ({nombre: {url, large?, generic?}}); devuelve los que fallaron."""
    items = sorted(icons.items())
    fallas = []
    with ThreadPoolExecutor(HILOS) as pool:
        for i, r in enumerate(pool.map(_uno, items), 1):
            if r:
                fallas.append(r)
            if i % 250 == 0:
                print(f"{i}/{len(items)}", flush=True)
    return fallas


def main() -> None:
    import site_data

    icons = site_data.build(write=False)["icons"]
    fallas = run(icons)
    print(f"{len(icons)} íconos, {len(fallas)} con error")
    for f in fallas:
        print(" ", f)
    if fallas:
        sys.exit(1)


if __name__ == "__main__":
    main()
