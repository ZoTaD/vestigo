"""
Las texturas `.rgt` de Company of Heroes (2026-11-06): un Relic Chunky con `FOLD TXTR` > `FOLD DXTC` > `DATA TFMT`
(ancho y alto) y `DATA TDAT` (el primer nivel de la textura, comprimido con zlib o no, con 16 bytes de encabezado
antes de los bloques DXT). DXT5 si hay un byte por píxel, DXT1 si hay medio. El juego guarda la imagen de abajo para
arriba: se da vuelta.
"""
import struct
import zlib

from PIL import Image


def decode(b: bytes) -> Image.Image | None:
    try:
        i = b.index(b"DATATFMT")
        w, h = struct.unpack_from("<II", b, i + 28)
        j = b.index(b"DATATDAT")
        tam = struct.unpack_from("<I", b, j + 12)[0]
        crudo = b[j + 28:j + 28 + tam]
        datos = zlib.decompress(crudo) if crudo[:1] == b"\x78" else crudo
        pix = datos[16:]
        if len(pix) >= w * h:
            n, pix = 3, pix[:w * h]
        elif len(pix) >= w * h // 2:
            n, pix = 1, pix[:w * h // 2]
        else:
            return None
        im = Image.frombytes("RGBA", (w, h), pix, "bcn", n)
        return im.transpose(Image.FLIP_TOP_BOTTOM)
    except (ValueError, struct.error, zlib.error):
        return None
