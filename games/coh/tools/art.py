"""
El arte de cabecera de CoH2 y CoH1 (2026-11-06): el `library_hero` y el logo de la tienda de Steam de cada juego, en
webp, con los mismos tamaños que CoH3 (`site/public/coh3/bg/hero-1600.webp` y `hero-800.webp`, `logo.webp`), y una
insignia por facción (SVG con la sigla en esténcil, hasta que la enciclopedia saque los emblemas del juego).

    python games/coh/tools/art.py
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
PUBLIC = RAIZ / "site" / "public"
STEAM = "https://cdn.cloudflare.steamstatic.com/steam/apps/{app}/{f}"
JUEGOS = {"coh2": 231430, "coh1": 228200}
# La sigla de cada facción y si es del Eje (cambia el color de la insignia).
FACCIONES = {
    # CoH2 usa los emblemas del juego (games/coh2/tools/site_data.py).
    "coh1": {"american": ("US", False), "wehrmacht": ("WEH", True), "british": ("UK", False), "panzer_elite": ("PE", True)},
}


def bajar(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "vestigo-data"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")


def cabecera(img: Image.Image, ancho: int, alto: int) -> Image.Image:
    """Recorta al centro con la proporción de la cabecera de CoH3 (1600×517) y achica."""
    w, h = img.size
    nuevo_h = round(w * alto / ancho)
    if nuevo_h <= h:
        top = (h - nuevo_h) // 2
        img = img.crop((0, top, w, top + nuevo_h))
    return img.resize((ancho, alto), Image.LANCZOS).convert("RGB")


def insignia(sigla: str, eje: bool) -> str:
    fondo, letra = ("#3a2a22", "#e0b07a") if eje else ("#2c3322", "#cfd9a0")
    tam = 22 if len(sigla) <= 2 else 17
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
        f'<path d="M24 3 43 10v13c0 11-8 19-19 22C13 42 5 34 5 23V10z" fill="{fondo}" stroke="{letra}" stroke-width="2"/>'
        f'<text x="24" y="{30 if len(sigla) <= 2 else 29}" text-anchor="middle" font-family="\'Big Shoulders Stencil Display\',Impact,sans-serif" '
        f'font-weight="900" font-size="{tam}" fill="{letra}">{sigla}</text></svg>'
    )


def main() -> None:
    for juego, app in JUEGOS.items():
        dest = PUBLIC / juego
        (dest / "bg").mkdir(parents=True, exist_ok=True)
        (dest / "f").mkdir(parents=True, exist_ok=True)
        hero = bajar(STEAM.format(app=app, f="library_hero.jpg"))
        cabecera(hero, 1600, 517).save(dest / "bg" / "hero-1600.webp", quality=82)
        cabecera(hero, 800, 258).save(dest / "bg" / "hero-800.webp", quality=80)
        logo = bajar(STEAM.format(app=app, f="logo.png"))
        logo.thumbnail((480, 270), Image.LANCZOS)
        # Los logos de Steam vienen oscuros: se pasan al crema de la sección (#e6dfc8) conservando la silueta, como el
        # logo blanco de CoH3.
        alfa = logo.getchannel("A")
        logo = Image.new("RGBA", logo.size, (230, 223, 200, 255))
        logo.putalpha(alfa)
        logo.save(dest / "logo.webp", quality=90)
        print(juego, "logo", logo.size)
        for f, (sigla, eje) in FACCIONES.get(juego, {}).items():
            (dest / "f" / f"{f}.svg").write_text(insignia(sigla, eje), encoding="utf-8")


if __name__ == "__main__":
    main()
