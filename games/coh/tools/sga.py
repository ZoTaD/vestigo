"""
Lector de los archivos .sga de Relic (2026-11-06), sólo lectura: versión 4 (Company of Heroes relanzado, app 228200)
y versión 7 (Company of Heroes 2). No usar `Archive.exe` de los juegos: se cuelga a mitad de camino y abre ventanas
de BugSplat.

Formato (lo que hace falta para leer):
  - Encabezado: `_ARCHIVE`, versión u16, menor u16. En v4 sigue un md5, el nombre en UTF-16 (128 bytes) y otro md5;
    el tamaño del índice (u32) va en 0xAC y el inicio de los datos (u32) en 0xB0; el índice arranca en 0xB8. En v7 no
    hay md5: tamaño del índice en 0x8C, datos en 0x90, índice en 0x98.
  - Índice: (offset, cantidad) de la tabla de contenidos, carpetas, archivos y nombres, relativos al inicio del
    índice. En v4 los offsets son u32 y las cantidades u16; en v7, todo u32.
  - Carpeta: nombre (offset en la tabla de nombres), primera y última subcarpeta, primer y último archivo.
    12 bytes en v4 (u32 + 4×u16) y 20 en v7 (5×u32).
  - Archivo: nombre, offset de los datos (relativo al inicio de los datos), tamaño guardado, tamaño real, fecha,
    verificación (u8) y forma de guardado (u8: 0 sin comprimir, otro valor zlib). 22 bytes en v4; 30 en v7 (suma el
    CRC y un offset de hash).
"""
import struct
import zlib
from pathlib import Path


class Sga:
    def __init__(self, path: str | Path):
        self.f = open(path, "rb")
        b = self.f.read(0x100)
        if b[:8] != b"_ARCHIVE":
            raise ValueError(f"{path}: no es un .sga")
        self.version = struct.unpack_from("<H", b, 8)[0]
        if self.version == 4:
            base, cab_fmt = 0xB8, "<IHIHIHIH"
            tam, self.data = struct.unpack_from("<II", b, 0xAC)
        elif self.version == 7:
            base, cab_fmt = 0x98, "<IIIIIIII"
            tam, self.data = struct.unpack_from("<II", b, 0x8C)
        else:
            raise ValueError(f"{path}: versión {self.version} no soportada")
        self.f.seek(base)
        h = self.f.read(tam)
        _to, _tn, do, dn, fo, fn, so, _sn = struct.unpack_from(cab_fmt, h, 0)

        def nombre(o: int) -> str:
            return h[so + o : h.index(b"\0", so + o)].decode("latin-1")

        if self.version == 4:
            dirs = [struct.unpack_from("<IHHHH", h, do + i * 12) for i in range(dn)]
            files = [struct.unpack_from("<IIIIIBB", h, fo + i * 22) for i in range(fn)]
        else:
            dirs = [struct.unpack_from("<IIIII", h, do + i * 20) for i in range(dn)]
            files = [struct.unpack_from("<IIIIIBB", h, fo + i * 30) for i in range(fn)]
        self.entries: dict[str, tuple[int, int, int, int]] = {}
        for d in dirs:
            carpeta = nombre(d[0]).replace("\\", "/")
            for i in range(d[3], d[4]):
                n, off, comp, real, _fecha, _verif, guardado = files[i]
                ruta = f"{carpeta}/{nombre(n)}" if carpeta else nombre(n)
                self.entries[ruta.lower()] = (off, comp, real, guardado)

    def read(self, path: str) -> bytes:
        off, comp, real, guardado = self.entries[path.lower()]
        self.f.seek(self.data + off)
        raw = self.f.read(comp)
        return raw if guardado == 0 or comp == real else zlib.decompress(raw)
