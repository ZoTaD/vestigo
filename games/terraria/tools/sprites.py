"""Saca del juego los sprites de objeto y el arte de la sección, y los deja en site/public/terraria.

Uso: python games/terraria/tools/sprites.py ["C:/.../Terraria"]

Necesita `cache/items.json` (de `dump.ps1`) para saber cuántos cuadros tiene cada objeto animado. Escribe también
`cache/sprites.json` con el tamaño de cada sprite, que `site_data.py` pasa a la lista para reservar la caja.
"""
import json
import sys
from pathlib import Path

from PIL import Image

from xnb import texture

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
PUBLIC = ROOT.parents[1] / "site" / "public" / "terraria"
GAME = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Terraria")
IMAGES = GAME / "Content" / "Images"

# El arte de la sección: nombre del archivo del juego → nombre en /terraria/art.
ART = {
    "Logo": "logo",
    "Sun": "sun",
    "Cloud_0": "cloud-0",
    "Cloud_2": "cloud-2",
    "Cloud_5": "cloud-5",
    "Background_7": "sky-mountains",
    "Background_8": "sky-hills",
    "Background_9": "sky-trees-far",
    "Background_11": "sky-trees-near",
    "Background_1": "edge-dirt",
    "Background_4": "edge-stone",
    "Background_2": "dirt",
    "Background_3": "stone",
    "Background_69": "cavern",
    "Background_127": "underworld",
}


def first_frame(im: Image.Image, frames: int) -> Image.Image:
    """El primer cuadro de un sprite animado (van apilados) y, siempre, recortado a lo que tiene dibujo."""
    if frames > 1:
        im = im.crop((0, 0, im.width, im.height // frames))
    box = im.getchannel("A").getbbox()
    return im.crop(box) if box else im


def grass() -> Image.Image:
    """Una franja de pasto de 3 bloques, armada con la fila de arriba de la hoja de bloques (16 px cada 18)."""
    sheet = texture(IMAGES / "Tiles_2.xnb")
    strip = Image.new("RGBA", (48, 16))
    for i, col in enumerate((1, 2, 3)):
        strip.paste(sheet.crop((col * 18, 0, col * 18 + 16, 16)), (i * 16, 0))
    return strip


def main() -> None:
    items = json.loads((CACHE / "items.json").read_text(encoding="utf-8"))
    out = PUBLIC / "items"
    out.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, list[int]] = {}
    for it in items:
        src = IMAGES / f"Item_{it['id']}.xnb"
        if not src.exists():
            continue
        im = first_frame(texture(src), it["frames"])
        im.save(out / f"{it['id']}.png", optimize=True)
        sizes[str(it["id"])] = [im.width, im.height]
    (CACHE / "sprites.json").write_text(json.dumps(sizes, separators=(",", ":")), encoding="utf-8")

    art = PUBLIC / "art"
    art.mkdir(parents=True, exist_ok=True)
    for src, name in ART.items():
        texture(IMAGES / f"{src}.xnb").save(art / f"{name}.png", optimize=True)
    grass().save(art / "grass.png", optimize=True)
    print(f"{len(sizes)} sprites de objeto, {len(ART) + 1} piezas de arte")
    heads()


def heads() -> None:
    """Las caras del mapa de los jefes y de los NPC del pueblo, según `data/bosses.json` y `data/npcs.json`
    (los escribe `world_data.py`; si todavía no están, no hace nada)."""
    data = ROOT / "data"
    if not (data / "bosses.json").exists():
        return
    bosses = json.loads((data / "bosses.json").read_text(encoding="utf-8"))["bosses"]
    out = PUBLIC / "bosses"
    out.mkdir(parents=True, exist_ok=True)
    for b in bosses:
        first_frame(texture(IMAGES / f"NPC_Head_Boss_{b['head']}.xnb"), 1).save(out / f"{b['key']}.png", optimize=True)
    npcs = json.loads((data / "npcs.json").read_text(encoding="utf-8"))["npcs"]
    out = PUBLIC / "npcs"
    out.mkdir(parents=True, exist_ok=True)
    for n in npcs:
        first_frame(texture(IMAGES / f"NPC_Head_{n['head']}.xnb"), 1).save(out / f"{n['id']}.png", optimize=True)
    print(f"{len(bosses)} caras de jefes, {len(npcs)} de NPC")


if __name__ == "__main__":
    main()
