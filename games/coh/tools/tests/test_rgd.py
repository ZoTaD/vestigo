"""El lector de `.rgd` (`rgd.py`): Relic Chunky con tablas de claves por hash (Jenkins lookup2)."""
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rgd import Keys, parse, ref_name  # noqa: E402
from rhash import lookup2  # noqa: E402

FLOAT, INT, BOOL, STR, WSTR, TABLA = 0, 1, 2, 3, 4, 100


def _valor(tipo, v) -> bytes:
    if tipo == FLOAT:
        return struct.pack("<f", v)
    if tipo == INT:
        return struct.pack("<i", v)
    if tipo == BOOL:
        return bytes([1 if v else 0])
    if tipo == STR:
        return v.encode("latin-1") + b"\0"
    if tipo == WSTR:
        return v.encode("utf-16-le") + b"\0\0"
    return _tabla(v)


def _tabla(entradas: list) -> bytes:
    """entradas = [(clave, tipo, valor)] → tabla AEGD: cantidad, (hash, tipo, offset) y los datos."""
    datos, filas = b"", []
    for clave, tipo, v in entradas:
        filas.append((lookup2(clave.encode()), tipo, len(datos)))
        datos += _valor(tipo, v)
    return struct.pack("<I", len(filas)) + b"".join(struct.pack("<III", *f) for f in filas) + datos


def _armar_rgd(entradas: list) -> bytes:
    cuerpo = struct.pack("<II", 0, 0) + _tabla(entradas)
    chunk = b"DATAAEGD" + struct.pack("<III", 1, len(cuerpo), 0) + struct.pack("<II", 0xFFFFFFFF, 0) + cuerpo
    return b"Relic Chunky\r\n\x1a\0" + struct.pack("<III", 3, 1, 0x24) + struct.pack("<II", 0x1C, 1) + chunk


def _keys(*nombres) -> Keys:
    k = Keys(path=None)
    for n in nombres:
        k.add(n)
    return k


def test_lookup2():
    assert lookup2(b"$REF") == 0x49D60FAE
    assert lookup2(b"squad_loadout_ext") == 0xE5E5A333


def test_tabla_con_claves_repetidas():
    rgd = _armar_rgd([("abilities", TABLA, [("ability", STR, "a"), ("ability", STR, "b"), ("ability", STR, "c")])])
    assert parse(rgd, _keys("abilities", "ability")) == {"abilities": {"ability": ["a", "b", "c"]}}


def test_tipos_y_clave_sin_nombre():
    rgd = _armar_rgd([("hp", FLOAT, 80.0), ("n", INT, -3), ("ok", BOOL, True), ("s", STR, "hola"), ("w", WSTR, "chau"), ("x", INT, 1)])
    out = parse(rgd, _keys("hp", "n", "ok", "s", "w"))
    assert out["hp"] == 80.0 and out["n"] == -3 and out["ok"] is True and out["s"] == "hola" and out["w"] == "chau"
    assert out[f"0x{lookup2(b'x'):08x}"] == 1


def test_ref_name():
    assert ref_name("sbps\\races\\soviet\\soldiers\\conscript_squad\\conscript_squad_mp.lua") == "conscript_squad_mp"
    assert ref_name("conscript_squad_mp") == "conscript_squad_mp"
    assert ref_name("") == ""
