"""Los íconos de la interfaz de CoH2 (`gfx.py`): Scaleform con imágenes externas en hojas `.dds`."""
import io
import struct
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gfx import Gfx  # noqa: E402


def _tag(code: int, cuerpo: bytes) -> bytes:
    return struct.pack("<HI", (code << 6) | 0x3F, len(cuerpo)) + cuerpo


def _gfx() -> bytes:
    rect = bytes([0x08, 0])  # un RECT de 1 bit por campo: 5 + 4 bits, en 2 bytes
    cab = rect + struct.pack("<HH", 0x1800, 1)
    ext = struct.pack("<HHHHH", 7, 0, 9, 16, 16) + bytes([4]) + b"Hoja" + bytes([9]) + b"hoja1.tga"
    sub = struct.pack("<HHHHHH", 50, 7, 2, 3, 10, 9)
    sym = struct.pack("<H", 1) + struct.pack("<H", 50) + b"Icono\0"
    cuerpo = cab + _tag(1009, ext) + _tag(1008, sub) + _tag(76, sym) + _tag(0, b"")
    return b"GFX" + bytes([0x0E]) + struct.pack("<I", 8 + len(cuerpo)) + cuerpo


class SgaFalso:
    def __init__(self, archivos: dict[str, bytes]):
        self.entries = {k: None for k in archivos}
        self._a = archivos

    def read(self, p: str) -> bytes:
        return self._a[p]


def _hoja() -> bytes:
    b = io.BytesIO()
    Image.new("RGBA", (16, 16), (200, 10, 10, 255)).save(b, "DDS")
    return b.getvalue()


def test_recorte():
    g = Gfx(SgaFalso({"ui/bin/coh2ui.gfx": _gfx(), "ui/assets/textures/hoja1.dds": _hoja()}))
    assert g.has("Icono") and not g.has("NoEsta")
    im = g.crop("Icono")
    assert im.size == (8, 6)
    assert im.getpixel((0, 0))[:3] == (200, 10, 10)


def test_sin_icono():
    g = Gfx(SgaFalso({"ui/bin/coh2ui.gfx": _gfx(), "ui/assets/textures/hoja1.dds": _hoja()}))
    assert g.crop("NoEsta") is None
