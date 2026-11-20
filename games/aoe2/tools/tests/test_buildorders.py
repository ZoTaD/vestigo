import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import buildorders as b  # noqa: E402


def segundos(t: str) -> int:
    m, s = t.split(":")
    return int(m) * 60 + int(s)


def test_el_ritmo_del_centro_urbano():
    # 3 aldeanos de arranque, 25 s cada uno: el 10 sale a los 2:55 y Feudal con 20 + Telar se pide a las 7:30.
    assert b.reloj(b.sale(10)) == "2:55"
    scouts = next(x for x in b.LISTA if x["slug"] == "scouts")
    assert scouts["feudal"] == {"vils": 20, "time": "7:30"}


def test_ningun_paso_va_antes_de_su_aldeano_y_los_tiempos_no_retroceden():
    for x in b.LISTA:
        ts = [segundos(p["time"]) for p in x["steps"]]
        assert ts == sorted(ts), x["slug"]
        for p in x["steps"]:
            assert segundos(p["time"]) >= b.sale(p["vils"]), (x["slug"], p)


def test_hombres_de_armas_saca_las_milicias_despues_de_pedir_feudal():
    # Si se encolan antes, el lector de grabaciones lo cuenta como drush y la ficha mostraría otra apertura.
    maa = next(x for x in b.LISTA if x["slug"] == "men-at-arms")
    milicias = next(p for p in maa["steps"] if "militia" in p["en"])
    assert segundos(milicias["time"]) >= segundos(maa["feudal"]["time"])
