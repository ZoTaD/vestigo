"""El resumen diario de partidas (`stats.py`): qué cuenta, qué descarta y cómo suma."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import stats  # noqa: E402


def _p(pid, race, team, win, elo):
    return {"profile_id": pid, "race_id": race, "teamid": team, "resulttype": 1 if win else 0, "matchhistorymember": {"oldrating": elo}}


def _m(players, mt=20, mapa="pachino_2p", dur=900):
    return {"matchtype_id": mt, "mapname": mapa, "startgametime": 0, "completiontime": dur, "matchhistoryreportresults": players}


GER, USF, DAK, UK = 137123, 129494, 198437, 203852


def test_1v1_cuenta_faccion_cruce_mapa_y_banda():
    d = stats.summarize_day([_m([_p(1, GER, 0, True, 1250), _p(2, USF, 1, False, 1150)])])
    md = d["modes"]["1v1"]
    assert d["matches"] == 1 and md["g"] == 1 and md["axisW"] == 1
    assert md["bands"]["all"]["f"]["german"] == {"g": 1, "w": 1}
    assert md["bands"]["1200"]["f"]["american"] == {"g": 1, "w": 0}
    assert md["fvf"]["all"]["german>american"] == {"g": 1, "w": 1}
    assert md["fvf"]["all"]["american>german"] == {"g": 1, "w": 0}
    assert md["maps"]["pachino_2p"]["g"] == 1
    assert md["dur"][3] == 1


def test_descarta_lo_raro():
    malas = [
        _m([_p(1, GER, 0, True, 1000), _p(2, DAK, 1, False, 1000)]),  # Eje contra Eje
        _m([_p(1, GER, 0, True, 1000), _p(2, USF, 1, True, 1000)]),  # dos ganadores
        _m([_p(1, GER, 0, True, 1000)]),  # falta un jugador
        _m([_p(1, GER, 0, True, 1000), _p(2, USF, 1, False, 1000)], mt=0),  # custom
    ]
    assert stats.summarize_day(malas)["matches"] == 0


def test_2v2_y_merge():
    m = _m([_p(1, GER, 0, False, 900), _p(2, DAK, 0, False, 900), _p(3, USF, 1, True, 900), _p(4, UK, 1, True, 900)], mt=21)
    a = stats.summarize_day([m])
    b = stats.summarize_day([m])
    stats.merge(a, b)
    md = a["modes"]["2v2"]
    assert md["g"] == 2 and md["axisW"] == 0
    assert md["bands"]["lt1000"]["f"]["british"] == {"g": 2, "w": 2}
    assert "fvf" in md and md["fvf"] == {}


def test_inicio_del_parche():
    from datetime import datetime, timezone
    # La 3.0 salió el 5/11 a las 17:00 UTC: ahí aparecen de golpe sus mapas nuevos.
    assert stats.inicio_parche("3.0.0") == datetime(2026, 11, 5, 17, tzinfo=timezone.utc)
    assert stats.inicio_parche("9.9.9") is None
    assert stats.inicio_parche(None) is None


def test_ventana_desde_el_parche():
    from datetime import date
    v = stats.ventana(date(2026, 11, 7), 28, date(2026, 11, 5))
    assert v == [date(2026, 11, 5), date(2026, 11, 6)]
    assert len(stats.ventana(date(2026, 11, 7), 28, None)) == 28


def test_partidas_desde_la_hora_del_parche():
    from datetime import datetime, timezone
    desde = datetime(2026, 11, 5, 17, tzinfo=timezone.utc)
    ms = [{"startgametime": int(desde.timestamp()) - 60}, {"startgametime": int(desde.timestamp())}, {"startgametime": int(desde.timestamp()) + 3600}]
    assert len(stats.desde_hora(ms, desde)) == 2
    assert len(stats.desde_hora(ms, None)) == 3
