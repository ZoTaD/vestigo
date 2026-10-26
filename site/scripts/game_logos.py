"""Los logos del menú de juegos de la barra (2026-10-26): `public/logos/<juego>.png`.

Cada logo queda reducido a su forma (un canal alfa, sin color) para que el CSS lo pinte del color del texto, como hace
Mobalytics. Todos ocupan la misma superficie: un logo ancho queda más bajo que uno alto. Imprime el ancho y alto a 1x
de cada uno, que van a `GAME_LOGOS` en `src/gameGroups.ts`. El PNG sale a 2x.

    python scripts/game_logos.py [carpeta-de-fuentes]

De dónde sale cada fuente (se copian a la carpeta de fuentes con el nombre del juego):
  - Deadlock, Valheim, Zomboid, Rust, Terraria y Stardew: el `logo.png` de la caché de Steam,
    `Steam/appcache/librarycache/<appid>/.../logo.png` (1422450, 892970, 108600, 252490, 105600, 413150).
  - Diablo II: el de Battle.net, `d2r_LOGO.png` del CDN de Blizzard (blz-contentstack-images.akamaized.net, asset
    bltd3ef9c318654d0cf). Es el mismo con fuego que `public/d2r/game/logo-still.webp`, pero ahí el fuego tapa las letras.
  - PoE2: el de la barra de pathofexile2.com (`/protected/image/poe2/layout/navbar/logo-2x.webp`); el de Steam es el
    de la expansión, con placa.

Un juego nuevo: su fuente, una línea en `CFG` y sus números en `GAME_LOGOS`.
"""
import glob, json, math, os, sys

import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else "logos-src"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "logos")
AREA, MAX_H, MAX_W = 3400, 40, 150


def lum(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def smooth(mask):
    """Suaviza el borde de una máscara binaria."""
    return np.asarray(Image.fromarray(mask.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)


def despeckle(mask):
    """Saca las motas sueltas de una máscara binaria."""
    return np.asarray(Image.fromarray(mask.astype(np.uint8)).filter(ImageFilter.MedianFilter(5))).astype(np.float32)


def crop(m, x0, y0, x1, y1):
    out = np.zeros_like(m)
    out[y0:y1, x0:x1] = m[y0:y1, x0:x1]
    return out


# De la imagen RGBA (float) a la máscara 0–255. Los que son una silueta limpia usan el alfa tal cual.
CFG = {
    "deadlock": lambda a: a[..., 3],
    "valheim": lambda a: a[..., 3],
    "zomboid": lambda a: a[..., 3],
    "stardew": lambda a: a[..., 3],
    # Rust: el símbolo oscuro dentro del cuadrado rojo queda calado.
    "rust": lambda a: a[..., 3] * (lum(a) > 70),
    # Terraria: el relleno de las letras, sin el borde verde.
    "terraria": lambda a: smooth(255 * ((a[..., 3] > 200) & (a[..., 1] < a[..., 0] + 10))),
    # Diablo II: las letras son piedra oscura con el fuego detrás: lo opaco y oscuro, sin las motas que deja el fuego ni
    # el "RESURRECTED" de abajo (a 30 px no se lee).
    "d2r": lambda a: crop(smooth(despeckle(255 * ((a[..., 3] > 200) & (lum(a) < 70)))), 0, 0, a.shape[1], 250),
    # PoE2: lo claro del emblema, recortado a "PATH OF EXILE" (el emblema entero queda diminuto a 40 px).
    "poe2": lambda a: crop(smooth(255 * ((a[..., 3] > 230) & (lum(a) > 90))), 200, 118, 530, 288),
}


def mask(name):
    path = glob.glob(os.path.join(SRC, name + ".*"))[0]
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    m = np.clip(CFG[name](a), 0, 255)
    m[m < 20] = 0
    im = Image.fromarray(m.astype(np.uint8), "L")
    return im.crop(im.getbbox())


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    for name in CFG:
        m = mask(name)
        r = m.width / m.height
        h = min(MAX_H, math.sqrt(AREA / r))
        w = h * r
        if w > MAX_W:
            w, h = MAX_W, MAX_W / r
        w, h = round(w), round(h)
        sizes[name] = [w, h]
        alpha = m.resize((w * 2, h * 2), Image.LANCZOS)
        im = Image.new("LA", alpha.size, 0)
        im.putalpha(alpha)
        im.save(os.path.join(OUT, name + ".png"), optimize=True)
    print(json.dumps(sizes))
