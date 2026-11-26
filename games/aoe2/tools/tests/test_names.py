import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import names as n  # noqa: E402


def test_palabras_de_un_nombre():
    assert n.palabras("wR.Lucho") == {"wrlucho", "wr", "w", "r", "lucho"}
    assert n.palabras("TheViper") == {"theviper", "the", "viper"}
    assert n.palabras("VIT Liereyy") == {"vitliereyy", "vit", "liereyy"}
    assert n.palabras("Ñandú_99") == {"nandu99", "nandu", "99"}
    assert n.palabras("...") == set()


def test_clave_de_dos_letras():
    assert n.clave("lucho") == "lu"
    assert n.clave("w") == "w_"
    assert n.clave("日本") == "__"
    assert n.clave("9z") == "9z"


def test_actualizar_manda_el_ranking_y_conserva_lo_viejo():
    viejo = {1: ["viejo", "ar", 1200], 2: ["dos", "cl", 900]}
    nuevo = n.actualizar(viejo, {1: ("Nuevo", "ar", 1876.0)}, {2: ("dos2", ""), 3: ("tres", "uy"), 0: ("ia", "")})
    assert nuevo == {1: ["Nuevo", "ar", 1800], 2: ["dos2", "cl", 900], 3: ["tres", "uy", 0]}


def test_escribir_y_leer(tmp_path, monkeypatch):
    monkeypatch.setattr(n, "NOMBRES", tmp_path)
    (tmp_path / "zz.json").write_text("[]", encoding="utf-8")
    assert n.escribir({5: ["wR.Lucho", "ar", 2000], 6: ["lucas", "", 1000]}) == 4  # wr, w_, r_ y lu
    assert not (tmp_path / "zz.json").exists()
    lu = json.loads((tmp_path / "lu.json").read_text(encoding="utf-8"))
    assert lu == [[5, "wR.Lucho", "ar", 2000], [6, "lucas", "", 1000]]
    assert n.leer() == {5: ["wR.Lucho", "ar", 2000], 6: ["lucas", "", 1000]}
