"""Sprites de Stardew Valley para el sitio: objetos, retratos y el marco de menú.

Lee el arte ya convertido a PNG en `games/stardew/raw/textures/` (ver `textures.py`)
y escribe en `site/public/stardew/`. Va aparte de `site_data.py` porque sólo
cambia con un parche del juego.

Uso: python games/stardew/tools/sprites.py
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import relations  # noqa: E402
import sdv  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
TEXTURAS = sdv.RAW / "textures"
SALIDA = ROOT / "site" / "public" / "stardew"

# Hojas de objetos: ruta (sin extensión) y cuántos sprites de 16 de ancho hay por fila.
OBJETOS = ("Maps/springobjects", 24)
OBJETOS_2 = ("TileSheets/Objects_2", 8)
GRANDES = ("TileSheets/Craftables", 8)  # sprites de 16x32

# Marco de menú de 9 partes en 192x192: parte -> (origen en MenuTiles, destino en el marco).
_PARTES = {
    "TL": (0, 0), "T": (128, 0), "TR": (192, 0),
    "L": (0, 128), "R": (192, 128),
    "BL": (0, 192), "B": (128, 192), "BR": (192, 192),
}
_DESTINO = {"TL": (0, 0), "T": (64, 0), "TR": (128, 0), "L": (0, 64), "R": (128, 64),
            "BL": (0, 128), "B": (64, 128), "BR": (128, 128)}
_CASILLERO = (128, 128, 192, 192)


def sprite_file(item_id: str) -> str:
    """Nombre del PNG de un objeto: `(BC)12` -> `bc-12.png`, el resto `<id>.png`."""
    if item_id.startswith("(BC)"):
        return f"bc-{item_id[4:]}.png"
    return f"{item_id}.png"


def sprite_box(item_id: str) -> tuple[str, int, int, int, int]:
    """(hoja, x, y, ancho, alto) del recorte de un objeto en su hoja."""
    if item_id.startswith("(BC)"):
        n = sdv.raw("Data/BigCraftables")[item_id[4:]]["SpriteIndex"]
        hoja, por_fila = GRANDES
        return hoja, (n % por_fila) * 16, (n // por_fila) * 32, 16, 32
    o = sdv.raw("Data/Objects")[item_id]
    hoja, por_fila = OBJETOS_2 if (o.get("Texture") or "").endswith("Objects_2") else OBJETOS
    n = o["SpriteIndex"]
    return hoja, (n % por_fila) * 16, (n // por_fila) * 16, 16, 16


def plantillas() -> set[str]:
    """Objetos plantilla (el nombre o la descripción llevan "{0}", o son el seco de hongos): el sitio los nombra
    armados, sobre el ingrediente, y no los lista."""
    fuera = {"DriedMushrooms"}
    for i, o in relations.objects().items():
        if any("{0}" in sdv.text(o.get(c), "en") for c in ("DisplayName", "Description")):
            fuera.add(i)
    return fuera


def ids_con_sprite() -> list[str]:
    fuera = plantillas()
    return [i for i in relations.objects() if i not in fuera] + ["(BC)" + k for k in sdv.raw("Data/BigCraftables")]


def marco() -> Image.Image:
    tiles = Image.open(TEXTURAS / "Maps/MenuTiles.png").convert("RGBA")
    im = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
    for parte, (sx, sy) in _PARTES.items():
        im.paste(tiles.crop((sx, sy, sx + 64, sy + 64)), _DESTINO[parte])
    return im


def main() -> None:
    items = SALIDA / "items"
    retratos = SALIDA / "portraits"
    ui = SALIDA / "ui"
    for d in (items, retratos, ui):
        d.mkdir(parents=True, exist_ok=True)
    hojas: dict[str, Image.Image] = {}
    ids = ids_con_sprite()
    vigentes = {sprite_file(i) for i in ids}
    for viejo in items.glob("*.png"):
        if viejo.name not in vigentes:
            viejo.unlink()
    for item_id in ids:
        hoja, x, y, w, h = sprite_box(item_id)
        if hoja not in hojas:
            hojas[hoja] = Image.open(TEXTURAS / f"{hoja}.png").convert("RGBA")
        hojas[hoja].crop((x, y, x + w, y + h)).save(items / sprite_file(item_id), optimize=True)
    for v in relations.villagers():
        textura = sdv.raw("Data/Characters")[v["key"]].get("TextureName") or v["key"]  # Leo usa ParrotBoy
        Image.open(TEXTURAS / f"Portraits/{textura}.png").convert("RGBA").crop((0, 0, 64, 64)).save(
            retratos / f"{v['key'].lower()}.png", optimize=True)
    marco().save(ui / "frame.png", optimize=True)
    Image.open(TEXTURAS / "Maps/MenuTiles.png").convert("RGBA").crop(_CASILLERO).save(ui / "slot.png", optimize=True)
    shutil.copyfile(TEXTURAS / "LooseSprites/stardewPanorama.png", ui / "panorama.png")
    print(f"{len(list(items.glob('*.png')))} sprites, {len(list(retratos.glob('*.png')))} retratos")


if __name__ == "__main__":
    main()
