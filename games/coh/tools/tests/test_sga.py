"""El lector de archivos .sga de Relic (`sga.py`): versiones 4 (CoH1 relanzado) y 7 (CoH2)."""
import struct
import sys
import zlib
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sga import Sga  # noqa: E402


def _armar_sga(version: int, archivos: dict[str, bytes]) -> bytes:
    """Un .sga mínimo con una sola carpeta (la de los archivos) y una raíz vacía; los datos van comprimidos con zlib."""
    carpeta = {p.rsplit("/", 1)[0] for p in archivos}
    assert len(carpeta) == 1
    carpeta = carpeta.pop()
    nombres = b""
    def nombre(s: str) -> int:
        nonlocal nombres
        o = len(nombres)
        nombres += s.encode("latin-1") + b"\0"
        return o
    datos = b""
    filas = []
    for p, contenido in archivos.items():
        comp = zlib.compress(contenido)
        filas.append((nombre(p.rsplit("/", 1)[1]), len(datos), len(comp), len(contenido)))
        datos += comp
    n_raiz, n_dir = nombre(""), nombre(carpeta.replace("/", "\\"))
    toc = b"data".ljust(64, b"\0") + b"data".ljust(64, b"\0")
    if version == 4:
        toc += struct.pack("<5H", 0, 2, 0, len(filas), 0)
        dirs = struct.pack("<IHHHH", n_raiz, 1, 2, 0, 0) + struct.pack("<IHHHH", n_dir, 2, 2, 0, len(filas))
        fil = b"".join(struct.pack("<IIIIIBB", n, o, c, d, 0, 0, 1) for n, o, c, d in filas)
        cab_fmt, inicio, fin_cab = "<IHIHIHIH", 0xB8, None
    else:
        toc += struct.pack("<5I", 0, 2, 0, len(filas), 0)
        dirs = struct.pack("<IIIII", n_raiz, 1, 2, 0, 0) + struct.pack("<IIIII", n_dir, 2, 2, 0, len(filas))
        fil = b"".join(struct.pack("<IIIIIBBII", n, o, c, d, 0, 0, 2, 0, 0) for n, o, c, d in filas)
        cab_fmt, inicio = "<IIIIIIII", 0x98
    tam_cab = struct.calcsize(cab_fmt)
    o_toc = tam_cab
    o_dir = o_toc + len(toc)
    o_fil = o_dir + len(dirs)
    o_str = o_fil + len(fil)
    cab = struct.pack(cab_fmt, o_toc, 1, o_dir, 2, o_fil, len(filas), o_str, 2) + toc + dirs + fil + nombres
    pre = bytearray(inicio)
    pre[:8] = b"_ARCHIVE"
    struct.pack_into("<HH", pre, 8, version, 0)
    if version == 4:
        struct.pack_into("<III", pre, 0xAC, len(cab), inicio + len(cab), 1)
    else:
        struct.pack_into("<III", pre, 0x8C, len(cab), inicio + len(cab), 1)
    return bytes(pre) + cab + datos


@pytest.mark.parametrize("version", [4, 7])
def test_sga_v4_y_v7(tmp_path, version):
    f = tmp_path / "x.sga"
    f.write_bytes(_armar_sga(version, {"a/b.txt": b"hola", "a/c.rgd": b"chau" * 10}))
    s = Sga(f)
    assert s.read("a/b.txt") == b"hola"
    assert s.read("A/C.RGD") == b"chau" * 10
    assert set(s.entries) == {"a/b.txt", "a/c.rgd"}


def test_sga_rechaza_otra_version(tmp_path):
    f = tmp_path / "x.sga"
    b = bytearray(_armar_sga(4, {"a/b.txt": b"hola"}))
    struct.pack_into("<H", b, 8, 5)
    f.write_bytes(bytes(b))
    with pytest.raises(ValueError):
        Sga(f)
