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
    # CoH2 usa los emblemas del juego (games/coh2/tools/site_data.py). CoH1 no trae emblemas sueltos (los `symbol_*`
    # vienen vacíos): se dibujan las insignias de época de cada ejército (`emblema`).
    "coh1": ["american", "wehrmacht", "british", "panzer_elite"],
}

_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">{}</svg>'
EMBLEMAS = {
    # Estrella blanca en círculo azul (la de los vehículos estadounidenses).
    "american": '<circle cx="24" cy="24" r="21" fill="#23395f" stroke="#e8e4d4" stroke-width="2.5"/>'
                '<polygon points="24.00,10.60 27.29,20.07 37.31,20.27 29.33,26.33 32.23,35.93 24.00,30.20 15.77,35.93 18.67,26.33 10.69,20.27 20.71,20.07" fill="#e8e4d4"/>',
    # Escarapela británica.
    "british": '<circle cx="24" cy="24" r="21" fill="#2a3f74" stroke="#e8e4d4" stroke-width="1.5"/>'
               '<circle cx="24" cy="24" r="13.5" fill="#e8e4d4"/><circle cx="24" cy="24" r="7" fill="#b3282d"/>',
    # Cruz de balcón negra con borde blanco, sobre gris campaña.
    "wehrmacht": '<rect x="3" y="3" width="42" height="42" rx="4" fill="#6b6f5c" stroke="#e8e4d4" stroke-width="1.5"/>'
                 '<path d="M19 6h10v13h13v10H29v13H19V29H6V19h13z" fill="#e8e4d4"/><path d="M21 8h6v13h13v6H27v13h-6V27H8v-6h13z" fill="#1b1b1b"/>',
    # Panzer Elite: la misma cruz, blanca y hueca, sobre el bordó de su bandera.
    "panzer_elite": '<rect x="3" y="3" width="42" height="42" rx="4" fill="#5a1418" stroke="#e8e4d4" stroke-width="1.5"/>'
                    '<path d="M21 8h6v13h13v6H27v13h-6V27H8v-6h13z" fill="none" stroke="#e8e4d4" stroke-width="2.4"/>',
}


def emblema(faccion: str) -> str:
    return _SVG.format(EMBLEMAS[faccion])


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
        for f in FACCIONES.get(juego, []):
            (dest / "f" / f"{f}.svg").write_text(emblema(f), encoding="utf-8")


if __name__ == "__main__":
    main()
