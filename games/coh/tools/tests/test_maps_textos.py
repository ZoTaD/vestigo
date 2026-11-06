"""Los textos de los mapas (`maps.textos`): copia fuera de git para cuando Steam cambia de idioma."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import maps  # noqa: E402


def test_textos_con_copia(tmp_path):
    base, cache = tmp_path / "juego", tmp_path / "raw"
    f = base / "Locale/Spanish/X.Spanish.ucs"
    f.parent.mkdir(parents=True)
    f.write_bytes(("﻿1\tHola\n").encode("utf-16-le"))
    assert maps.textos(base, ["Locale/Spanish/X.Spanish.ucs"], cache) == {1: "Hola"}
    f.unlink()
    assert maps.textos(base, ["Locale/Spanish/X.Spanish.ucs"], cache) == {1: "Hola"}
