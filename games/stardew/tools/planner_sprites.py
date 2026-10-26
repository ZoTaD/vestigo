"""Dibujos del planificador de granja en `site/public/stardew/planner/`: el mapa de cada granja con sus edificios
fijos, el cultivo maduro de cada semilla, cada frutal grande y cada camino.

Lo llama `sprites.py`; también corre solo: python games/stardew/tools/planner_sprites.py
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import planner_data  # noqa: E402
import sdv  # noqa: E402

TEXTURAS = sdv.RAW / "textures"
SALIDA = Path(__file__).resolve().parents[3] / "site" / "public" / "stardew" / "planner"

_hojas: dict[str, Image.Image] = {}
# Los colores con nombre de `Data/Crops` `TintColors` (los de XNA); el resto viene en "#RRGGBB".
_COLORES = {"red": (255, 0, 0), "white": (255, 255, 255), "yellow": (255, 255, 0)}


def _hoja(ruta: str) -> Image.Image:
    ruta = ruta.replace("\\", "/")
    if ruta not in _hojas:
        _hojas[ruta] = Image.open(TEXTURAS / f"{ruta}.png").convert("RGBA")
    return _hojas[ruta]


def _color(texto: str) -> tuple[int, int, int]:
    if texto.startswith("#"):
        return int(texto[1:3], 16), int(texto[3:5], 16), int(texto[5:7], 16)
    return _COLORES[texto.lower()]


def _tinte(im: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lambda v: v * color[0] // 255), g.point(lambda v: v * color[1] // 255),
                                b.point(lambda v: v * color[2] // 255), a))


def edificio_fijo(clave: str) -> tuple[Image.Image, int, int]:
    """El dibujo de un edificio fijo y su `DrawOffset` (`Building.draw`: abajo a la izquierda de la huella)."""
    b = sdv.raw("Data/Buildings")[clave]
    hoja = _hoja(b["Texture"])
    r = b.get("SourceRect") or {}
    if clave == "Greenhouse":  # el invernadero arreglado: la mitad de abajo de la textura (`GreenhouseBuilding`)
        r = {"X": 0, "Y": 160, "Width": 112, "Height": 160}
    if not r.get("Width"):
        caja = (0, 0, hoja.width, hoja.height)
    else:
        caja = (r["X"], r["Y"], r["X"] + r["Width"], r["Y"] + r["Height"])
    off = b.get("DrawOffset") or {"X": 0, "Y": 0}
    return hoja.crop(caja), off["X"], off["Y"]


def mapa(nombre: str, fijos: list[dict]) -> Image.Image:
    """La granja en primavera, 16 px por casilla: las capas de abajo, los edificios fijos y las de arriba."""
    m = planner_data.mapa(nombre)
    hojas = {}
    for s in m["sheets"]:
        if s["id"] == "Paths":
            continue
        hojas[s["id"]] = (_hoja(s["src"]), s["w"])
    W, H = m["layers"]["Back"]["w"], m["layers"]["Back"]["h"]
    im = Image.new("RGBA", (W * 16, H * 16), (0, 0, 0, 255))

    def capa(nombre_capa: str) -> None:
        L = m["layers"].get(nombre_capa)
        if not L:
            return
        for i, t in enumerate(L["t"]):
            if not t or t[0] not in hojas:
                continue
            hoja, ancho = hojas[t[0]]
            sx, sy = (t[1] % ancho) * 16, (t[1] // ancho) * 16
            im.alpha_composite(hoja.crop((sx, sy, sx + 16, sy + 16)), ((i % W) * 16, (i // W) * 16))

    for c in ("Back", "Back2", "Buildings", "Buildings2"):
        capa(c)
    for f in fijos:
        dibujo, dx, dy = edificio_fijo(f["key"])
        im.alpha_composite(dibujo, (f["x"] * 16 + dx, (f["y"] + f["h"]) * 16 - dibujo.height + dy))
    for c in ("Front", "AlwaysFront", "AlwaysFront2", "AlwaysFront3"):
        capa(c)
    return im


def cultivo(semilla: str) -> Image.Image:
    """El cultivo maduro (`Crop.getSourceRect`: cuadro `len(DaysInPhase) + 1`, 16×32); las flores llevan encima el
    cuadro siguiente teñido con su primer color (`Crop.drawWithOffset`)."""
    c = sdv.raw("Data/Crops")[semilla]
    hoja = _hoja(c["Texture"])
    fila = c["SpriteIndex"]
    x0, y0 = (128 if fila % 2 else 0), fila // 2 * 32
    cuadro = len(c["DaysInPhase"]) + 1
    im = hoja.crop((x0 + cuadro * 16, y0, x0 + cuadro * 16 + 16, y0 + 32))
    if c.get("TintColors"):
        flor = hoja.crop((x0 + (cuadro + 1) * 16, y0, x0 + (cuadro + 1) * 16 + 16, y0 + 32))
        im.alpha_composite(_tinte(flor, _color(c["TintColors"][0])))
    return im


def frutal(retono: str) -> Image.Image:
    """El frutal grande en primavera (`FruitTree.draw`: cuadro 4 de su fila, 48×80)."""
    t = sdv.raw("Data/FruitTrees")[retono]
    fila = t["TextureSpriteRow"]
    return _hoja(t["Texture"]).crop((4 * 48, fila * 80, 5 * 48, fila * 80 + 80))


def piso(p: dict) -> Image.Image:
    """La baldosa del medio de un camino (rodeada de iguales), en primavera."""
    x, y = p["Corner"]["X"] + 16, p["Corner"]["Y"] + 16
    return _hoja(p["Texture"]).crop((x, y, x + 16, y + 16))


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    datos = json.loads((planner_data.DATA / "planner.json").read_text(encoding="utf-8"))
    hechos: dict[str, Image.Image] = {}
    for g in datos["farms"]:
        hechos[g["img"].split("/")[-1]] = mapa(g["map"], g["fixed"])
    for it in datos["items"]:
        nombre = it["img"].split("/")[-1]
        if it["cat"] == "crop":
            hechos[nombre] = cultivo(it["seed"])
        elif it["cat"] == "tree":
            hechos[nombre] = frutal(it["id"])
    for p in sdv.raw("Data/FloorsAndPaths").values():
        hechos[f"floor-{p['Id']}.png"] = piso(p)
    for viejo in SALIDA.iterdir():
        if viejo.name not in hechos:
            viejo.unlink()
    for nombre, im in hechos.items():
        if nombre.endswith(".webp"):
            im.convert("RGB").save(SALIDA / nombre, lossless=True, method=6)
        else:
            im.save(SALIDA / nombre, optimize=True)
    return len(hechos)


if __name__ == "__main__":
    print(f"{main()} dibujos del planificador")
