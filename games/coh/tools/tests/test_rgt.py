"""Las texturas `.rgt` de CoH1 (`rgt.py`): Relic Chunky con un DXT comprimido (o no) con zlib."""
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rgt import decode  # noqa: E402


def _bloque_dxt5(r: int, g: int, b: int) -> bytes:
    """Un bloque DXT5 de 4×4 de un solo color opaco."""
    alfa = bytes([255, 255]) + bytes(6)
    c = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    return alfa + struct.pack("<HH", c, c) + bytes(4)


def _bloque_dxt1(r: int, g: int, b: int) -> bytes:
    c = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    return struct.pack("<HH", c, c) + bytes(4)


def _chunk(tipo: bytes, cid: bytes, cuerpo: bytes) -> bytes:
    return tipo + cid + struct.pack("<III", 1, len(cuerpo), 0) + struct.pack("<II", 0, 0) + cuerpo


def _rgt(w: int, h: int, pix: bytes, comprimido: bool) -> bytes:
    datos = struct.pack("<IIII", 0, w, h, len(pix)) + pix
    tdat = zlib.compress(datos) if comprimido else datos
    tfmt = struct.pack("<IIII", w, h, 1, 2) + bytes(9)
    dxtc = _chunk(b"DATA", b"TFMT", tfmt) + _chunk(b"DATA", b"TMAN", struct.pack("<III", 1, len(datos), len(tdat))) + _chunk(b"DATA", b"TDAT", tdat)
    return b"Relic Chunky\r\n\x1a\0" + struct.pack("<III", 3, 1, 0x24) + struct.pack("<II", 0x1C, 1) + _chunk(b"FOLD", b"DXTC", dxtc)


def test_dxt5_zlib_y_vuelta():
    # Arriba rojo y abajo verde en el archivo: el juego guarda la imagen de abajo para arriba.
    pix = _bloque_dxt5(255, 0, 0) * 2 + _bloque_dxt5(0, 255, 0) * 2
    im = decode(_rgt(8, 8, pix, True))
    assert im.size == (8, 8)
    assert im.getpixel((0, 0))[1] > 200 and im.getpixel((0, 7))[0] > 200


def test_dxt1_sin_zlib():
    pix = _bloque_dxt1(0, 0, 255) * 4
    im = decode(_rgt(8, 8, pix, False))
    assert im.size == (8, 8) and im.getpixel((3, 3))[2] > 200


def test_basura_no_corta():
    assert decode(b"nada") is None
