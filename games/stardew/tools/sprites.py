"""Sprites de Stardew Valley para el sitio: objetos, retratos y el marco de menú.

Lee el arte ya convertido a PNG en `games/stardew/raw/textures/` (ver `textures.py`)
y escribe en `site/public/stardew/`. Va aparte de `site_data.py` porque sólo
cambia con un parche del juego.

Uso: python games/stardew/tools/sprites.py
"""
import json
import random
import re
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
    """Nombre del PNG de combate: armas `w-<n>.png`, botas `b-<id>.png`, baratijas `tr-<clave>.png`, monstruos
    `m-<slug>.png` (y su ícono recortado `i-<slug>.png`) y sombreros `h-<n>.png`."""
    return f"{tipo}-{clave}.png"


def sprites_combate(salida: Path) -> int:
    """Armas, botas, baratijas y monstruos de `mines_data` en `site/public/stardew/combat/`. Devuelve cuántos escribió."""
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
    # Los sombreros que da el Gremio de Aventureros: `hats.png`, 12 por fila de 20x20 y cuatro filas por sombrero (una
    # por dirección); el primer cuadro es el de frente (`FarmerRenderer.drawHatAccessory`).
    sombreros = Image.open(TEXTURAS / "Characters/Farmer/hats.png").convert("RGBA")
    for q in datos["slayer"].values():
        if (q["reward"] or "").startswith("(H)"):
            n = int(q["reward"][3:])
            x, y = (n % 12) * 20, (n // 12) * 80
            hechos[sprite_combate("h", str(n))] = sombreros.crop((x, y, x + 20, y + 20))
    # Monstruos: el cuadro entero (`m-<slug>.png`, fichas y grillas) y recortado a lo opaco (`i-<slug>.png`, el ícono
    # del buscador de la barra, que lo dibuja a escala entera con el tamaño `icon` de mines.json).
    for m in datos["monsters"]:
        hechos[sprite_combate("m", m["slug"])] = mines_data.monster_image(m["key"])
        hechos[sprite_combate("i", m["slug"])] = mines_data.monster_icon(m["key"])
    for viejo in salida.glob("*.png"):
        if viejo.name not in hechos:
            viejo.unlink()
    for nombre, im in hechos.items():
        im.save(salida / nombre, optimize=True)
    return len(hechos)


# --- Lo que el predictor muestra sin ficha ----------------------------------------------------------------------------
# Muebles, sombreros, camisas, papeles y armas que pueden salir del carro o de las cajas (las claves no `(O)` de
# `names` en predict.json). Las máquinas `(BC)` ya tienen su `bc-<n>.png` en `items/`. Cada uno se recorta como lo
# dibuja el juego en el inventario.

def archivo_predictor(qid: str) -> str:
    """Nombre del PNG de algo del predictor: `(F)1226` -> `f-1226.png`, `(WP)MoreWalls:11` -> `wp-MoreWalls-11.png`."""
    tipo, resto = re.match(r"\((\w+)\)(.*)", qid).groups()
    return f"{tipo.lower()}-{resto.replace(':', '-')}.png"


_hojas: dict[str, Image.Image] = {}


def _hoja(ruta: str) -> Image.Image:
    ruta = ruta.replace("\\", "/")
    if ruta not in _hojas:
        _hojas[ruta] = Image.open(TEXTURAS / f"{ruta}.png").convert("RGBA")
    return _hojas[ruta]


# `Furniture.getDefaultSourceRectForType`: el tamaño en baldosas por tipo cuando el dato dice -1.
_TAM_MUEBLE = {0: (1, 2), 1: (2, 2), 2: (3, 2), 3: (2, 2), 4: (2, 2), 5: (5, 3), 6: (2, 2), 17: (1, 2), 7: (1, 3), 8: (1, 2),
               10: (2, 3), 11: (2, 3), 12: (3, 2), 13: (1, 2), 14: (2, 5), 16: (1, 2)}
# `Furniture.getTypeNumberFromName` (las camas, 15, empiezan con "bed").
_TIPO_MUEBLE = {"chair": 0, "bench": 1, "couch": 2, "armchair": 3, "dresser": 4, "long table": 5, "painting": 6, "lamp": 7,
                "decor": 8, "bookcase": 10, "table": 11, "rug": 12, "window": 13, "fireplace": 14, "torch": 16, "sconce": 17}


def _tinte(im: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """`Utility.MultiplyColor`: cada canal por el color."""
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(lambda v: v * color[0] // 255), g.point(lambda v: v * color[1] // 255),
                                b.point(lambda v: v * color[2] // 255), a))


def dibujo_predictor(qid: str) -> Image.Image:
    """El dibujo de inventario de `qid` (mueble, sombrero, camisa, papel o arma)."""
    tipo, id_ = re.match(r"\((\w+)\)(.*)", qid).groups()
    if tipo == "F":  # `Furniture.GetDefaultSourceRect`
        f = sdv.raw("Data/Furniture")[id_].split("/")
        hoja = _hoja(f[9] if len(f) > 9 and f[9] else "TileSheets/furniture")
        n = int(f[8]) if len(f) > 8 and f[8] else int(id_)
        if f[2] == "-1":
            tipo_n = 15 if f[1].lower().startswith("bed") else _TIPO_MUEBLE.get(f[1].lower(), 9)
            w, h = _TAM_MUEBLE.get(tipo_n, (1, 2))
        else:
            w, h = (int(v) for v in f[2].split())
        x, y = n * 16 % hoja.width, n * 16 // hoja.width * 16
        return hoja.crop((x, y, x + w * 16, y + h * 16))
    if tipo == "H":  # `HatDataDefinition`: 20x20, cuatro filas por sombrero; el primer cuadro es el de frente
        h = sdv.raw("Data/hats")[id_].split("/")
        hoja = _hoja(h[7] if len(h) > 7 and h[7] else "Characters/Farmer/hats")
        n = int(h[6]) if len(h) > 6 and h[6] else int(id_)
        x, y = n * 20 % hoja.width, n * 20 // hoja.width * 80
        return hoja.crop((x, y, x + 20, y + 20))
    if tipo == "S":  # `ShirtDataDefinition` + `Clothing.drawInMenu`: la camisa y su capa teñida (mitad derecha)
        c = sdv.raw("Data/Shirts")[id_]
        hoja = _hoja(c.get("Texture") or "Characters/Farmer/shirts")
        mitad = hoja.width // 2
        n = c["SpriteIndex"]
        x, y = n * 8 % mitad, n * 8 // mitad * 32
        base = hoja.crop((x, y, x + 8, y + 8))
        color = tuple(int(v) for v in (c.get("DefaultColor") or "255 255 255").split())
        capa = _tinte(hoja.crop((x + mitad, y, x + mitad + 8, y + 8)), color)
        return Image.alpha_composite(base, capa)
    if tipo == "WP":  # `Wallpaper`: el recorte de 16x28 de la hoja del juego de papeles
        juego, n = id_.split(":")
        extra = next(x for x in sdv.raw("Data/AdditionalWallpaperFlooring") if x["Id"] == juego)
        hoja, n = _hoja(extra["Texture"]), int(n)
        x, y = n % 16 * 16, n // 16 * 48 + 8
        return hoja.crop((x, y, x + 16, y + 28))
    if tipo == "W":  # las armas: 16x16, 8 por fila
        w = sdv.raw("Data/Weapons")[id_]
        hoja, n = _hoja(w.get("Texture") or "TileSheets/weapons"), w["SpriteIndex"]
        x, y = n * 16 % hoja.width, n * 16 // hoja.width * 16
        return hoja.crop((x, y, x + 16, y + 16))
    raise ValueError(f"No sé dibujar {qid}")


def ids_predictor() -> list[str]:
    """Lo que el predictor nombra sin ficha y se dibuja acá (sin las máquinas, que ya tienen `bc-<n>.png`)."""
    datos = json.loads((ROOT / "games" / "stardew" / "data" / "predict.json").read_text(encoding="utf-8"))
    return [k for k in datos["names"] if not k.startswith("(BC)")]


def sprites_predictor(salida: Path) -> int:
    """Escribe en `site/public/stardew/predict/` el dibujo de cada id de `ids_predictor`. Devuelve cuántos."""
    salida.mkdir(parents=True, exist_ok=True)
    hechos = {archivo_predictor(q): dibujo_predictor(q) for q in ids_predictor()}
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


# La fecha que lleva la fuente: fija, para que el archivo no cambie entre corridas.
_FECHA_FUENTE = "Fri Oct 23 00:00:00 2026"


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
    from fontTools.misc.timeTools import timestampFromString
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
    # Fecha fija en `head`, sin la hora del reloj, y sin que `save` la recalcule: así el archivo sale igual, byte a
    # byte, en cada corrida en que no cambia nada.
    fb.font["head"].created = fb.font["head"].modified = timestampFromString(_FECHA_FUENTE)
    fb.font.recalcTimestamp = False
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
    print(f"{sprites_predictor(SALIDA / 'predict')} sprites del predictor")


if __name__ == "__main__":
    main()
