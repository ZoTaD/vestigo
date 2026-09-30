"""
Conversor de los .sprite de D2R (formato "SpA1") a imágenes de Pillow.

Cabecera de 40 bytes, little endian:
    0  char[4]  "SpA1"
    4  u16      versión: 31 = RGBA sin comprimir, 61 = bloques BC3 (DXT5, 1 byte por píxel)
    6  u16      ancho de un cuadro
    8  u32      ancho total (todos los cuadros uno al lado del otro)
   12  u32      alto
   20  u32      cantidad de cuadros
   32  u32      bytes de píxeles
Los píxeles empiezan en el byte 40.
"""
import struct
from PIL import Image

HEADER = 40


def parse(data):
    if data[:4] != b"SpA1":
        raise ValueError("no es un sprite SpA1")
    version, frame_w, width, height = struct.unpack_from("<HHII", data, 4)
    frames = struct.unpack_from("<I", data, 20)[0] or 1
    size = struct.unpack_from("<I", data, 32)[0]
    return version, frame_w, width, height, frames, data[HEADER:HEADER + size]


def decode(data, bc=3):
    """Todos los cuadros como una sola imagen RGBA (tira horizontal)."""
    version, frame_w, width, height, frames, px = parse(data)
    if version == 31:
        return Image.frombuffer("RGBA", (width, height), px, "raw", "RGBA", 0, 1)
    if version == 61:
        return Image.frombytes("RGBA", (width, height), px, "bcn", bc)
    raise ValueError(f"versión de sprite desconocida: {version}")


def frames(data, bc=3):
    """Lista de cuadros por separado."""
    version, frame_w, width, height, n, _ = parse(data)
    strip = decode(data, bc)
    step = width // n
    return [strip.crop((i * step, 0, i * step + frame_w, height)) for i in range(n)]
