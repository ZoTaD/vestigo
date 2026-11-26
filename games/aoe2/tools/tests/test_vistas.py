import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import daily as d  # noqa: E402
import vistas as v  # noqa: E402

CIVS = {0: "armenians", 1: "aztecs"}


def partida(mid, ts, civs=(0, 1)):
    return {
        "id": mid, "matchtype_id": 6, "mapname": "Arabia.rms", "startgametime": ts, "completiontime": ts + 1200, "slotinfo": None,
        "matchhistorymember": [
            {"profile_id": 10 + i, "civilization_id": c, "teamid": i, "outcome": 1 if i == 0 else 0, "oldrating": 1200, "newrating": 1210}
            for i, c in enumerate(civs)
        ],
    }


TS = 1795000000  # un día cualquiera de noviembre de 2026


def test_guarda_y_lee_ids_por_dia(tmp_path):
    r = tmp_path / "v.json.gz"
    v.escribir(r, {"2026-11-20": {5, 3, 900}, "2026-01-01": {1}}, "2026-06-01")
    assert v.leer(r) == {"2026-11-20": {3, 5, 900}}
    assert v.leer(tmp_path / "no-esta.gz") is None


def test_lo_ya_contado_no_se_vuelve_a_sumar():
    dia = d.datetime.fromtimestamp(TS, d.timezone.utc).date().isoformat()
    acc = d.Acumulador(CIVS, {dia: {1}})
    acc.agregar(partida(1, TS))
    acc.agregar(partida(2, TS))
    assert acc.dias[dia]["games"] == 1
    assert acc.nuevas == {dia: {2}}


def test_sumar_dia_junta_contadores():
    a = {**d._dia_vacio("x"), "games": 2, "civ": {"rm1v1|<1000|aztecs": [2, 1]}}
    b = {**d._dia_vacio("x"), "games": 3, "civ": {"rm1v1|<1000|aztecs": [1, 1], "rm1v1|<1000|armenians": [4, 0]}}
    s = v.sumar_dia(a, b)
    assert s["games"] == 5
    assert s["civ"] == {"rm1v1|<1000|aztecs": [3, 2], "rm1v1|<1000|armenians": [4, 0]}
    assert a["civ"] == {"rm1v1|<1000|aztecs": [2, 1]}  # no toca el original


def test_pick_players_con_semilla_cambia_cada_dia():
    ladder = [(i, 2500 - i) for i in range(2000)]
    uno = d.pick_players(ladder, 100, semilla=1)
    otro = d.pick_players(ladder, 100, semilla=2)
    assert len(uno) == len(otro) == 100
    assert set(uno) != set(otro)
    assert d.pick_players(ladder, 100, semilla=1) == uno
