"""
Lector de los `.rgd` de Company of Heroes 1 y 2 (2026-11-06): Relic Chunky con un chunk `DATA AEGD` v1. Los atributos
son tablas `(hash de la clave, tipo, offset)`; el hash es lookup2 (`rhash.py`) del nombre, así que hace falta un
diccionario para saber cómo se llama cada clave: `rgd_keys.txt` (`0xHASH=nombre`, lo arma `build_keys.py`).

Tipos: 0 float, 1 int, 2 bool, 3 texto, 4 texto UTF-16, 100/101 tabla. Una tabla puede repetir una clave (las
habilidades de un comandante, las mejoras de una escuadra): entonces el valor es una lista con todos, en orden.
"""
import struct
from pathlib import Path

try:
    from rhash import lookup2
except ImportError:  # importado como paquete
    from .rhash import lookup2

KEYS_FILE = Path(__file__).resolve().parent / "rgd_keys.txt"


class Keys:
    def __init__(self, path: Path | None = KEYS_FILE):
        self.m: dict[int, str] = {}
        if path and Path(path).exists():
            for linea in Path(path).read_text(encoding="utf-8").splitlines():
                h, sep, nombre = linea.partition("=")
                if sep and h.startswith("0x"):
                    self.m[int(h, 16)] = nombre

    def add(self, nombre: str) -> None:
        self.m.setdefault(lookup2(nombre.encode("latin-1", "ignore")), nombre)

    def name(self, h: int) -> str | None:
        return self.m.get(h)


def parse(b: bytes, keys: Keys, unknown: dict | None = None) -> dict:
    i = b.index(b"DATAAEGD")
    _ver, _size, nl = struct.unpack_from("<III", b, i + 8)
    o = i + 20 + nl + 8  # Chunky v3: dos u32 más en el encabezado del chunk
    base = o + 8  # crc y tamaño de los datos

    def tabla(p: int) -> dict:
        n = struct.unpack_from("<I", b, p)[0]
        filas = [struct.unpack_from("<III", b, p + 4 + k * 12) for k in range(n)]
        datos = p + 4 + n * 12
        out: dict = {}
        for h, t, off in filas:
            q = datos + off
            k = keys.name(h)
            if k is None:
                k = f"0x{h:08x}"
                if unknown is not None:
                    unknown[h] = unknown.get(h, 0) + 1
            if t == 0:
                v = round(struct.unpack_from("<f", b, q)[0], 6)
            elif t == 1:
                v = struct.unpack_from("<i", b, q)[0]
            elif t == 2:
                v = bool(b[q])
            elif t == 3:
                v = b[q:b.index(b"\0", q)].decode("latin-1")
            elif t == 4:
                e = q
                while b[e:e + 2] != b"\0\0":
                    e += 2
                v = b[q:e].decode("utf-16-le")
            elif t in (100, 101):
                v = tabla(q)
            else:
                v = None
            if k in out:
                prev = out[k]
                out[k] = prev + [v] if isinstance(prev, list) and getattr(prev, "_rep", False) else _Rep([prev, v])
            else:
                out[k] = v
        return {k: list(v) if isinstance(v, _Rep) else v for k, v in out.items()}

    return tabla(base)


class _Rep(list):
    """Una lista armada por claves repetidas (distinta de un valor que ya fuera lista)."""

    _rep = True

    def __add__(self, other):
        return _Rep(list.__add__(self, other))


def ref_name(v: str | None) -> str:
    """`"sbps\\races\\…\\conscript_squad_mp.lua"` o `"conscript_squad_mp"` → `"conscript_squad_mp"`."""
    if not v:
        return ""
    s = v.replace("\\", "/").rsplit("/", 1)[-1]
    return s[:-4] if s.lower().endswith(".lua") else s
