"""Sprites de Stardew Valley para el sitio: objetos, retratos y el marco de menú.

Lee el arte ya convertido a PNG en `games/stardew/raw/textures/` (ver `textures.py`)
y escribe en `site/public/stardew/`. Va aparte de `site_data.py` porque sólo
cambia con un parche del juego.

Uso: python games/stardew/tools/sprites.py
"""
import random
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mines_data  # noqa: E402
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


def sprite_combate(tipo: str, clave: str) -> str:
    """Nombre del PNG de combate: armas `w-<n>.png`, botas `b-<id>.png`, baratijas `tr-<clave>.png`, monstruos `m-<slug>.png`."""
    return f"{tipo}-{clave}.png"


def _mas_lleno(hoja: Image.Image, x: int, y: int, w: int, h: int) -> Image.Image:
    """El cuadro de la primera fila con más píxeles opacos: el primero suele ser un cuadro de descanso (alas
    plegadas, el agujero del Duggy) y el sitio muestra al monstruo en pie."""
    cuadros = [hoja.crop((x + i * w, y, x + (i + 1) * w, y + h)) for i in range(max(1, min(4, hoja.width // w)))]
    return max(cuadros, key=lambda c: sum(c.getchannel("A").histogram()[1:]))


def sprites_combate(salida: Path) -> int:
    """Armas, botas, baratijas y monstruos de `mines_data` en `site/public/stardew/combat/`. Devuelve cuántos escribió."""
    from PIL import ImageChops

    salida.mkdir(parents=True, exist_ok=True)
    datos = mines_data.mines()
    armas = Image.open(TEXTURAS / "TileSheets/weapons.png").convert("RGBA")
    objetos = Image.open(TEXTURAS / f"{OBJETOS[0]}.png").convert("RGBA")
    otros = Image.open(TEXTURAS / f"{OBJETOS_2[0]}.png").convert("RGBA")

    def celda(hoja: Image.Image, n: int, por_fila: int) -> Image.Image:
        return hoja.crop(((n % por_fila) * 16, (n // por_fila) * 16, (n % por_fila) * 16 + 16, (n // por_fila) * 16 + 16))

    hechos = {}
    for w in datos["weapons"]:
        hechos[sprite_combate("w", w["id"][3:])] = celda(armas, w["sprite"], 8)
    for b in datos["boots"]:  # el sprite de unas botas es el objeto con su mismo número (`BootsDataDefinition`)
        hechos[sprite_combate("b", b["id"][3:])] = celda(objetos, int(b["id"][3:]), OBJETOS[1])
    for t in datos["trinkets"]:
        hechos[sprite_combate("tr", t["id"][4:])] = celda(otros, t["sprite"], OBJETOS_2[1])
    for m in datos["monsters"]:
        o = mines_data.monster_sprite(m["key"])
        hoja = Image.open(TEXTURAS / f"Characters/Monsters/{o['sheet']}.png").convert("RGBA")
        im = _mas_lleno(hoja, o["x"], o["y"], o["w"], o["h"])
        if o["tint"]:  # la baba helada y la de lodo son la baba verde con otro color (multiplicar)
            r, g, b, a = im.split()
            tinte = Image.new("RGB", im.size, tuple(o["tint"]))
            im = Image.merge("RGBA", (*ImageChops.multiply(Image.merge("RGB", (r, g, b)), tinte).split(), a))
        hechos[sprite_combate("m", m["slug"])] = im
    for viejo in salida.glob("*.png"):
        if viejo.name not in hechos:
            viejo.unlink()
    for nombre, im in hechos.items():
        im.save(salida / nombre, optimize=True)
    return len(hechos)


def marco() -> Image.Image:
    """El marco de 9 partes, con el interior ya pintado.

    Las piezas de MenuTiles traen transparente todo lo que queda adentro de la madera: con el fondo de la caja
    recortado al relleno (`padding-box`), entre la madera y el contenido se veía el pasto de la página. Acá se pinta
    ese interior (todo lo transparente conectado con el centro) con el degradé del fondo de menú del juego, el
    casillero (64,128) de MenuTiles, y la caja lo usa con `border-image ... fill`. El degradé va sobre los 192 px
    del marco: estirado por `border-image` queda arriba claro y abajo más tostado, como en el juego.
    """
    tiles = Image.open(TEXTURAS / "Maps/MenuTiles.png").convert("RGBA")
    im = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
    for parte, (sx, sy) in _PARTES.items():
        im.paste(tiles.crop((sx, sy, sx + 64, sy + 64)), _DESTINO[parte])
    fondo = tiles.crop((64, 128, 128, 192))
    arriba, abajo = fondo.getpixel((32, 2)), fondo.getpixel((32, 61))
    px = im.load()
    pendientes, vistos = [(96, 96)], set()
    while pendientes:
        x, y = pendientes.pop()
        if (x, y) in vistos or not (0 <= x < 192 and 0 <= y < 192) or px[x, y][3] != 0:
            continue
        vistos.add((x, y))
        t = y / 191
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(arriba[:3], abajo[:3])) + (255,)
        pendientes += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im


def suelo(lado: int = 16, semilla: int = 7) -> Image.Image:
    """El pasto de fondo de la sección: `lado`×`lado` baldosas de 16 px del pasto común del juego, al azar.

    Se toman de `Maps/spring_outdoorsTileSheet.png` las baldosas opacas del mismo verde que el pasto de la granja
    (la (0,7) de la hoja) y sin píxeles amarillos o naranjas (palitos y bordes de camino, que repetidos se ven como
    rayas). Sorteadas con semilla fija, así el archivo no cambia de una corrida a otra; repetido en la página no se
    nota el patrón porque cada baldosa ya es distinta.
    """
    hoja = Image.open(TEXTURAS / "Maps/spring_outdoorsTileSheet.png").convert("RGBA")
    ancho, alto = hoja.size

    def baldosa(tx: int, ty: int) -> Image.Image:
        return hoja.crop((tx * 16, ty * 16, tx * 16 + 16, ty * 16 + 16))

    def promedio(t: Image.Image) -> list[float]:
        px = t.load()
        return [sum(px[x, y][i] for y in range(16) for x in range(16)) / 256 for i in range(3)]

    ref = promedio(baldosa(0, 7))
    limpias = []
    for ty in range(alto // 16):
        for tx in range(ancho // 16):
            t = baldosa(tx, ty)
            px = t.load()
            pixeles = [px[x, y] for y in range(16) for x in range(16)]
            if any(p[3] < 255 for p in pixeles) or any(p[0] > 120 for p in pixeles):
                continue
            if sum(abs(a - b) for a, b in zip(promedio(t), ref)) < 18:
                limpias.append(t)
    azar = random.Random(semilla)
    im = Image.new("RGBA", (lado * 16, lado * 16))
    for y in range(lado):
        for x in range(lado):
            im.paste(azar.choice(limpias), (x * 16, y * 16))
    return im


def texto_juego(texto: str) -> Image.Image:
    """Un texto con la letra de los menús del juego (`LooseSprites/font_bold.png`, la de `SpriteText`).

    La hoja es una grilla de 16 letras por fila, de 8x16 px, que arranca en el espacio (código 32). Cada letra se
    recorta a su ancho real y se separa con 1 px, que es lo que hace el juego con sus anchos por letra. Sólo cubre
    los códigos 32 a 126: alcanza para "Stardew Valley".
    """
    hoja = Image.open(TEXTURAS / "LooseSprites/font_bold.png").convert("RGBA")
    letras = []
    for c in texto:
        if c == " ":
            letras.append((Image.new("RGBA", (5, 16), (0, 0, 0, 0)), 0))
            continue
        g = _letra(hoja, c)
        caja = g.getbbox()
        letras.append((g.crop((caja[0], 0, caja[2], 16)) if caja else g, -_SUBE_MAYUSCULA if c.isupper() else 0))
    ancho = sum(g.width for g, _ in letras) + len(letras) - 1
    im = Image.new("RGBA", (ancho, 16 + _SUBE_MAYUSCULA), (0, 0, 0, 0))
    x = 0
    for g, dy in letras:
        im.paste(g, (x, _SUBE_MAYUSCULA + dy), g)
        x += g.width + 1
    return im.crop(im.getbbox())


# En la hoja las mayúsculas están 3 px más abajo que el resto (el juego las sube al dibujarlas): las minúsculas y
# los números se apoyan en la fila 11, las mayúsculas en la 14.
_SUBE_MAYUSCULA = 3
_BASE = 11
# El trazo de cada letra es el marrón oscuro; el naranja es el relieve, que la fuente web no lleva.
_TRAZO = (86, 22, 12)


def _letra(hoja: Image.Image, c: str) -> Image.Image:
    i = ord(c) - 32
    return hoja.crop(((i % 16) * 8, (i // 16) * 16, (i % 16) * 8 + 8, (i // 16) * 16 + 16))


def fuente_juego(destino: Path) -> int:
    """La letra de los menús del juego como fuente web (WOFF2), para los títulos de la sección.

    Pixelify Sans, la que había, confunde letras chicas (la C parece una O, el 5 un 8). Ésta es la del juego: cada
    píxel oscuro de `font_bold.png` es un cuadrado de 100 unidades, con 16 píxeles por em, así que a 16, 32 o 48 px
    cada píxel cae entero en la pantalla. Cubre el ASCII imprimible y el Latin-1 (acentos, ñ, ¿, ¡). Devuelve cuántas
    letras tiene.
    """
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    u = 100
    hoja = Image.open(TEXTURAS / "LooseSprites/font_bold.png").convert("RGBA")
    nombres, cmap, glifos, anchos = [".notdef", "space"], {32: "space"}, {}, {}
    vacio = TTGlyphPen(None).glyph()
    glifos[".notdef"], anchos[".notdef"] = vacio, (8 * u, 0)
    glifos["space"], anchos["space"] = vacio, (4 * u, 0)
    for code in list(range(33, 127)) + list(range(161, 256)):
        c = chr(code)
        px = _letra(hoja, c).load()
        oscuro = [(x, y) for y in range(16) for x in range(8) if px[x, y][3] and px[x, y][:3] == _TRAZO]
        if not oscuro:
            continue
        base = _BASE + (_SUBE_MAYUSCULA if c.isupper() else 0)
        x0 = min(x for x, _ in oscuro)
        pen = TTGlyphPen(None)
        for y in range(16):
            fila = sorted(x for x, yy in oscuro if yy == y)
            while fila:  # una tira por cada corrida de píxeles seguidos de la fila
                a = b = fila.pop(0)
                while fila and fila[0] == b + 1:
                    b = fila.pop(0)
                izq, der = (a - x0) * u, (b + 1 - x0) * u
                arriba, abajo = (base - y + 1) * u, (base - y) * u
                pen.moveTo((izq, abajo)); pen.lineTo((izq, arriba)); pen.lineTo((der, arriba)); pen.lineTo((der, abajo))
                pen.closePath()
        nombre = f"u{code:04X}"
        nombres.append(nombre)
        cmap[code] = nombre
        glifos[nombre] = pen.glyph()
        anchos[nombre] = ((max(x for x, _ in oscuro) - x0 + 2) * u, 0)
    fb = FontBuilder(16 * u, isTTF=True)
    fb.setupGlyphOrder(nombres)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glifos)
    fb.setupHorizontalMetrics(anchos)
    fb.setupHorizontalHeader(ascent=14 * u, descent=-4 * u)
    fb.setupNameTable({"familyName": "Vestigo Stardew Menu", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=14 * u, sTypoDescender=-4 * u, usWinAscent=14 * u, usWinDescent=4 * u)
    fb.setupPost()
    fb.font.flavor = "woff2"
    fb.save(str(destino))
    return len(cmap)


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
    texto_juego("Stardew Valley").save(ui / "title.png", optimize=True)
    suelo().save(ui / "ground.png", optimize=True)
    fuente_juego(ui / "menu-font.woff2")
    print(f"{len(list(items.glob('*.png')))} sprites, {len(list(retratos.glob('*.png')))} retratos")
    print(f"{sprites_combate(SALIDA / 'combat')} sprites de combate")


if __name__ == "__main__":
    main()
