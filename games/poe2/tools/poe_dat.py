"""Tablas .datc64 del juego sin esquema: sólo lo que hace falta para traducir.

Cada tabla viene en inglés (`data/balance/x.datc64`) y en cada idioma
(`data/balance/spanish/x.datc64`) con las mismas filas y las mismas columnas;
sólo cambian los textos. Así que no hace falta saber qué es cada columna: basta
con encontrar cuáles apuntan a textos y leer la misma celda en los dos archivos.
El resultado es un diccionario inglés → español con todos los textos de la tabla
(nombres, descripciones), que es lo que usa encyclopedia.py.

Formato (el de PyPoE / dat-schema): u32 con la cantidad de filas, las filas de
ancho fijo, ocho bytes 0xBB que abren la sección variable, y los textos ahí en
UTF-16LE terminados en cuatro ceros. Una celda de texto es un u64 con la posición
del texto contada desde el comienzo de la sección variable.
"""
import struct

MAGIC = b"\xbb" * 8


class Dat:
    def __init__(self, data: bytes):
        self.data = data
        (self.rows,) = struct.unpack_from("<I", data, 0)
        self.var = data.find(MAGIC, 4)
        if self.var < 0:
            raise ValueError("no es un .datc64")
        self.width = (self.var - 4) // self.rows if self.rows else 0

    def u64(self, row: int, col: int) -> int:
        return struct.unpack_from("<Q", self.data, 4 + row * self.width + col)[0]

    def text(self, off: int):
        """El texto que empieza en `off` de la sección variable, o None si no parece uno."""
        start = self.var + off
        if off < 8 or start >= len(self.data):
            return None
        end = start
        while end + 4 <= len(self.data):
            if self.data[end:end + 4] == b"\0\0\0\0":
                break
            end += 2
        else:
            return None
        try:
            s = self.data[start:end].decode("utf-16-le")
        except UnicodeDecodeError:
            return None
        if any(ord(ch) < 9 or 13 < ord(ch) < 32 for ch in s):
            return None
        return s

    def text_columns(self, sample: int = 400):
        """Las posiciones de columna que en casi todas las filas apuntan a un texto."""
        if not self.rows:
            return []
        step = max(1, self.rows // sample)
        rows = range(0, self.rows, step)
        cols = []
        for c in range(0, self.width - 7):
            ok = seen = 0
            for r in rows:
                v = self.u64(r, c)
                if v == 0:
                    continue
                seen += 1
                if v < len(self.data) - self.var and self.text(v) is not None:
                    ok += 1
            if seen >= max(3, len(rows) // 20) and ok / seen > 0.97:
                cols.append(c)
        # Una columna real y la que empieza un byte después se pisan: se queda la primera.
        out = []
        for c in cols:
            if not out or c >= out[-1] + 8:
                out.append(c)
        return out


def translations(en_bytes: bytes, tr_bytes: bytes) -> dict:
    """Inglés → otro idioma para todos los textos de una tabla."""
    en, tr = Dat(en_bytes), Dat(tr_bytes)
    if en.rows != tr.rows or en.width != tr.width:
        raise ValueError(f"las tablas no coinciden: {en.rows}x{en.width} vs {tr.rows}x{tr.width}")
    out = {}
    for c in en.text_columns():
        for r in range(en.rows):
            a, b = en.u64(r, c), tr.u64(r, c)
            if not a or not b:
                continue
            ta, tb = en.text(a), tr.text(b)
            if ta and tb and ta.strip():
                out.setdefault(ta, tb)
    return out


def column_texts(dat_bytes: bytes):
    """Para explorar: cada columna de texto con unos ejemplos."""
    d = Dat(dat_bytes)
    return {c: [d.text(d.u64(r, c)) for r in range(min(5, d.rows)) if d.u64(r, c)] for c in d.text_columns()}
