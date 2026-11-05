"""
Los íconos de Company of Heroes 3 del sitio (2026-11-04): `site/public/coh3/i/<ruta>.webp`, con `<ruta>` la del juego
que guardan los JSON de `games/coh3/data/` (ej. `races/american/infantry/riflemen_us`).

    python games/coh3/tools/images.py

Los baja del CDN de coh3stats (coh3-image-extractor, MIT; el arte es de Relic, con crédito al pie del sitio). Sólo
los que nombran los datos (unidades, armas, battlegroups con sus mejoras y habilidades y su arte ancho, edificios,
facciones, Final Stand) y la imagen de cada mapa, de a uno, con pausa y omitiendo los que ya están. Un ícono que no existe se anota y se sigue.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # `python -I` no suma la carpeta del script

from coh3 import DATA, UA  # noqa: E402

URL = "https://cdn.coh3stats.com/export/icons/{ruta}.webp"
# El arte ancho de los battlegroups (`image`) no está en `icons/`: vive en `images/` del mismo CDN.
URL_ARTE = "https://cdn.coh3stats.com/export/images/{ruta}.webp"
# Las imágenes de los mapas (la vista de arriba que cubre `size` entero) van aparte, en `m/<slug>.webp`.
URL_MAPA = "https://cdn.coh3stats.com/maps/{ruta}/{ruta}.webp"
DESTINO = Path(__file__).resolve().parents[3] / "site" / "public" / "coh3" / "i"
DESTINO_MAPAS = DESTINO.parent / "m"
PAUSA = 0.15
# Una ruta del juego: letras, números, guiones y barras; nada de "..", ni absolutas.
RUTA_OK = re.compile(r"^[a-z0-9_\-]+(/[a-z0-9_\-]+)*$", re.I)


def _rutas(x, out: set, campo: str = "icon") -> None:
    """Junta los valores de `campo` (`icon`, o `image`: el arte ancho del battlegroup)."""
    if isinstance(x, dict):
        for k, v in x.items():
            if k == campo and isinstance(v, str) and v:
                out.add(v)
            else:
                _rutas(v, out, campo)
    elif isinstance(x, list):
        for v in x:
            _rutas(v, out, campo)


def rutas(campo: str = "icon") -> list[str]:
    out = set()
    for f in sorted(DATA.rglob("*.json")):
        if f.parent.name == "patches" or f.name in ("maps.json", "challenges.json", "meta.json"):
            continue
        _rutas(json.loads(f.read_text(encoding="utf-8")), out, campo)
    return sorted(r.replace("\\", "/") for r in out if RUTA_OK.match(r.replace("\\", "/")))


def main() -> None:
    mapas = [m["slug"] for m in json.loads((DATA / "maps.json").read_text(encoding="utf-8"))]
    todas = [(URL, r, DESTINO) for r in rutas()] + [(URL_ARTE, r, DESTINO) for r in rutas("image")] +             [(URL_MAPA, m, DESTINO_MAPAS) for m in mapas if RUTA_OK.match(m) and "/" not in m]
    faltan = [(u, r, d) for u, r, d in todas if not (d / f"{r}.webp").exists()]
    print(f"{len(todas)} íconos y artes, faltan {len(faltan)}")
    malos = []
    for n, (url, r, base) in enumerate(faltan, 1):
        try:
            req = urllib.request.Request(url.format(ruta=r), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                datos = resp.read()
            if datos[:4] != b"RIFF" or datos[8:12] != b"WEBP":
                raise ValueError("no es webp")
            destino = base / f"{r}.webp"
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(datos)
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            malos.append((r, getattr(e, "code", None) or str(e)))
        if n % 100 == 0:
            print(f"  {n}/{len(faltan)}")
        time.sleep(PAUSA)
    if malos:
        print(f"{len(malos)} sin bajar:")
        for r, e in malos:
            print(f"  {r}: {e}")


if __name__ == "__main__":
    main()
