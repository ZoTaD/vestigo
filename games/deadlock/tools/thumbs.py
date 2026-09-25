"""
Versiones chicas de las imágenes de Deadlock → site/public/deadlock/game/w<ancho>/

Las imágenes del juego se sirven al tamaño en que vienen, y el sitio las dibuja
mucho más chicas: medido el 2026-09-25, los retratos de la tier list son de
280 px y se ven a 61, las insignias de rango son de 512 y se ven a 20, los
íconos de héroe son de 128 y se ven a 32. Una página de Deadlock bajaba ~770 KB
de imágenes para eso.

Este script deja cada imagen también a 48, 96 y 160 px de ancho, en la misma
ruta relativa bajo `w48/`, `w96/` y `w160/`. `GameImg` (site/src/GameImg.tsx)
elige la justa para el ancho con que se dibuja y la densidad de la pantalla.

**Existen las tres variantes de cada imagen**, aunque la original sea más chica
que el ancho (en ese caso es una copia): así el sitio puede pedir cualquier
variante sin saber el tamaño original, y nunca recibe un 404.

Uso: python games/deadlock/tools/thumbs.py   (lo llama game_assets.py al final)
"""
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GAME = os.path.join(ROOT, "site", "public", "deadlock", "game")
# Tienen que coincidir con WIDTHS de site/src/GameImg.tsx.
WIDTHS = [48, 96, 160]
VARIANT_DIRS = {f"w{w}" for w in WIDTHS}


def sources():
    for dirpath, dirnames, filenames in os.walk(GAME):
        if os.path.relpath(dirpath, GAME) == ".":
            # las carpetas de variantes no son fuentes
            dirnames[:] = [d for d in dirnames if d not in VARIANT_DIRS]
        for name in filenames:
            if name.endswith(".webp"):
                yield os.path.join(dirpath, name)


def build(force=False):
    made = copied = skipped = 0
    total = 0
    for src in sources():
        rel = os.path.relpath(src, GAME)
        with Image.open(src) as im:
            w, h = im.size
            for target in WIDTHS:
                dst = os.path.join(GAME, f"w{target}", rel)
                if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                    skipped += 1
                    total += os.path.getsize(dst)
                    continue
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                if w <= target:
                    shutil.copyfile(src, dst)
                    copied += 1
                else:
                    small = im.resize((target, max(1, round(h * target / w))), Image.LANCZOS)
                    small.save(dst, "WEBP", quality=82, method=6)
                    made += 1
                total += os.path.getsize(dst)
    print(f"variantes: {made} achicadas, {copied} copiadas, {skipped} al día · {total // 1024} KB")


if __name__ == "__main__":
    build(force="--force" in sys.argv)
