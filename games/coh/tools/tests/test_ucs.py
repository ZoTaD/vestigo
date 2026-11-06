"""Los textos de los juegos (`ucs.py`): archivos .ucs en UTF-16 con líneas `id<TAB>texto`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ucs import load_ucs, loc  # noqa: E402


def test_ucs(tmp_path):
    f = tmp_path / "x.ucs"
    f.write_bytes("﻿11106520\tCrossroads\r\n12\tOtro\r\n\r\nbasura sin tab\r\n".encode("utf-16-le"))
    d = load_ucs(f)
    assert d[11106520] == "Crossroads"
    assert loc("$12", d) == "Otro"
    assert loc("$9", d) is None
    assert loc("texto", d) is None
    assert loc("", d) is None
